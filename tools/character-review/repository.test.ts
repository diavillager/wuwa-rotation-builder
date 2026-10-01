import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { createServer, request as httpRequest, type Server } from 'node:http'
import sharp from 'sharp'
import { afterEach, describe, expect, it } from 'vitest'
import { sha256 } from '../../scripts/character-sync/candidates'
import { scanRegistered } from '../../scripts/character-sync/io'
import type { CharacterData } from '../../src/data/characters/contract'
import { ReviewRepository } from './repository'
import { candidateSkillId, type ReviewState } from './model'
import { reviewApi } from './api'

const roots: string[] = [],
  servers: Server[] = []
afterEach(async () => {
  for (const server of servers.splice(0))
    await new Promise<void>((resolve) => {
      server.closeAllConnections()
      server.close(() => resolve())
    })
  for (const root of roots.splice(0)) {
    if (
      !path.basename(root).startsWith('wuwa-review-test-') ||
      path.dirname(root) !== path.resolve(tmpdir())
    )
      throw new Error('테스트 정리 경로 오류')
    await rm(root, { recursive: true, force: true })
  }
})
const target = { runId: 'fixture-run-001', characterId: '1102' }
async function fixture(existing = false) {
  const root = await mkdtemp(
    path.join(path.resolve(tmpdir()), 'wuwa-review-test-'),
  )
  roots.push(root)
  const directory = path.join(
    root,
    '.character-sync/runs',
    target.runId,
    target.characterId,
  )
  await mkdir(path.join(directory, 'assets'), { recursive: true })
  const bytes = await sharp({
    create: { width: 2, height: 2, channels: 4, background: '#558877' },
  })
    .webp()
    .toBuffer()
  const candidates = ['portrait', 'first', 'second', 'third'].map((name) => ({
    candidateId: `candidate-${sha256(name)}`,
    kind: name === 'portrait' ? 'portrait' : 'skill',
    resourcePath: `/Game/Test/${name}.webp`,
    url: `https://api-v2.encore.moe/resource/Data/Game/Test/${name}.webp`,
    asset: `assets/${sha256(name)}.webp`,
    sources: [
      {
        source: 'encore',
        document: 'https://example.test/fixture',
        recordId: name,
        field: 'Icon',
        originalPath: `/Game/Test/${name}`,
      },
    ],
    review: { displayName: null, visible: null },
    download: {
      status: 'verified',
      sha256: sha256(bytes),
      width: 2,
      height: 2,
    },
  }))
  for (const candidate of candidates)
    await writeFile(path.join(directory, candidate.asset), bytes)
  await writeFile(
    path.join(directory, 'draft.json'),
    JSON.stringify({
      schemaVersion: 1,
      reviewStatus: 'pending',
      characterId: '1102',
      basicCandidate: { displayName: '검증 공명자', attribute: '응결' },
      candidates,
      errors: [],
    }),
  )
  const finalDirectory = path.join(root, 'src/assets/characters/1102')
  const finalFile = path.join(finalDirectory, 'data/1102.json')
  if (existing) {
    await mkdir(path.join(finalDirectory, 'data'), { recursive: true })
    await mkdir(path.join(finalDirectory, 'assets'), { recursive: true })
    const data: CharacterData = {
      schemaVersion: 1,
      reviewStatus: 'approved',
      characterId: '1102',
      displayName: '기존 공명자',
      attribute: '응결',
      portrait: 'assets/original.webp',
      skills: [
        {
          skillId: '1102:public',
          displayName: '검수된 스킬',
          visible: true,
          asset: 'assets/original.webp',
        },
      ],
      autoActions: {
        normalSwitchAttack: '1102:public',
        intro: '1102:public',
        outro: '1102:public',
      },
    }
    await writeFile(finalFile, JSON.stringify(data))
    await writeFile(path.join(finalDirectory, 'assets/original.webp'), bytes)
  }
  return {
    root,
    directory,
    finalDirectory,
    finalFile,
    candidates,
    bytes,
    repository: new ReviewRepository(root),
  }
}
function complete(
  state: ReviewState,
  candidates: Awaited<ReturnType<typeof fixture>>['candidates'],
) {
  const next = structuredClone(state)
  next.portraitCandidateId = candidates[0].candidateId
  for (const [index, candidate] of next.candidates.entries()) {
    candidate.decision = 'include'
    candidate.displayName = `검증 스킬 ${index + 1}`
  }
  next.autoActions = {
    normalSwitchAttack: candidateSkillId('1102', candidates[1].candidateId),
    intro: candidateSkillId('1102', candidates[2].candidateId),
    outro: candidateSkillId('1102', candidates[3].candidateId),
  }
  return next
}
describe('검수 저장과 최종 반영', () => {
  it('손상된 저장 검수를 빈 검수로 대체하거나 화면에 넘기지 않는다', async () => {
    const f = await fixture()
    const { state } = await f.repository.load(target)
    const damaged = JSON.stringify({
      schemaVersion: 1,
      state: { ...state, candidates: [null] },
    })
    const file = path.join(f.directory, 'review.json')
    await writeFile(file, damaged)
    await expect(f.repository.load(target)).rejects.toThrow('손상')
    expect(await readFile(file, 'utf8')).toBe(damaged)
  })
  it('미완성 내용도 저장·복원하지만 검증 전 반영은 차단한다', async () => {
    const f = await fixture()
    const session = await f.repository.load(target)
    const state = structuredClone(session.state)
    state.candidates[0].displayName = '검수 중 이름'
    const saved = await f.repository.save(state, null)
    expect(saved.state).toEqual(state)
    expect((await new ReviewRepository(f.root).load(target)).state).toEqual(
      state,
    )
    expect((await f.repository.validate(state)).errors.length).toBeGreaterThan(
      3,
    )
    await expect(
      f.repository.publish(state, saved.revision, 'forged'),
    ).rejects.toThrow()
    expect(await scanRegistered(f.root)).toEqual([])
  })
  it('수동 검수를 통과한 JSON·이미지만 반영하고 다시 열어도 공개 ID를 보존한다', async () => {
    const f = await fixture()
    const state = complete(
      (await f.repository.load(target)).state,
      f.candidates,
    )
    const checked = await f.repository.validate(state)
    expect(checked.errors).toEqual([])
    const result = await f.repository.publish(state, null, checked.token!)
    expect(result.warning).toBeNull()
    const final = JSON.parse(await readFile(f.finalFile, 'utf8'))
    expect(final.autoActions).toEqual(state.autoActions)
    expect(final.skills.map((s: { skillId: string }) => s.skillId)).toEqual(
      state.candidates.map((c) => candidateSkillId('1102', c.candidateId)),
    )
    expect(await readFile(path.join(f.finalDirectory, final.portrait))).toEqual(
      f.bytes,
    )
    expect((await scanRegistered(f.root))[0].valid).toBe(true)
    expect((await f.repository.validate(result.session.state)).errors).toEqual(
      [],
    )
  })
  it('기존 스킬의 이름·아이콘 변경은 같은 ID를 유지하고 반영 전 원문을 보관한다', async () => {
    const f = await fixture(true)
    const before = await readFile(f.finalFile)
    const session = await f.repository.load(target)
    const state = structuredClone(session.state)
    state.existingSkills[0].displayName = '변경한 검수 이름'
    state.existingSkills[0].candidateId = f.candidates[1].candidateId
    state.candidates.forEach((c) => {
      c.decision = 'exclude'
    })
    const checked = await f.repository.validate(state)
    expect(checked.errors).toEqual([])
    await f.repository.publish(state, null, checked.token!)
    const final = JSON.parse(await readFile(f.finalFile, 'utf8'))
    expect(final.skills).toHaveLength(1)
    expect(final.skills[0]).toMatchObject({
      skillId: '1102:public',
      displayName: '변경한 검수 이름',
    })
    expect(final.autoActions).toEqual(session.source.current!.autoActions)
    const backup = (await readdir(f.directory)).find((file) =>
      file.startsWith('before-publish-'),
    )!
    expect(await readFile(path.join(f.directory, backup))).toEqual(before)
    expect(
      await readFile(path.join(f.finalDirectory, 'assets/original.webp')),
    ).toEqual(f.bytes)
  })
  it('다른 창의 저장과 기존 공개 ID 삭제를 거부한다', async () => {
    const f = await fixture(true)
    const state = (await f.repository.load(target)).state
    await f.repository.save(state, null)
    await expect(f.repository.save(state, null)).rejects.toThrow('다른 창')
    const broken = { ...state, existingSkills: [] }
    expect((await f.repository.validate(broken)).errors.join()).toContain(
      '공개 Skill ID',
    )
  })
  it('검증 후 최종 파일·후보 이미지가 바뀌면 덮어쓰지 않는다', async () => {
    const f = await fixture(true)
    const state = complete(
      (await f.repository.load(target)).state,
      f.candidates,
    )
    const checked = await f.repository.validate(state)
    await writeFile(path.join(f.directory, f.candidates[1].asset), 'corrupted')
    await expect(
      f.repository.publish(state, null, checked.token!),
    ).rejects.toThrow('이미지가 변경')
    await writeFile(path.join(f.directory, f.candidates[1].asset), f.bytes)
    const other = JSON.parse(await readFile(f.finalFile, 'utf8'))
    other.displayName = '다른 작업의 변경'
    await writeFile(f.finalFile, JSON.stringify(other))
    await expect(
      f.repository.publish(state, null, checked.token!),
    ).rejects.toThrow('최종 파일이 변경')
    expect(JSON.parse(await readFile(f.finalFile, 'utf8')).displayName).toBe(
      '다른 작업의 변경',
    )
  })
  it('마지막 반영에 실패하면 기존 JSON과 참조 이미지를 유지한다', async () => {
    const f = await fixture(true)
    const before = await readFile(f.finalFile)
    const repository = new ReviewRepository(f.root, async () => {
      throw new Error('반영 실패 시험')
    })
    const state = complete((await repository.load(target)).state, f.candidates)
    const checked = await repository.validate(state)
    await expect(
      repository.publish(state, null, checked.token!),
    ).rejects.toThrow('반영 실패 시험')
    expect(await readFile(f.finalFile)).toEqual(before)
    expect(
      await readFile(path.join(f.finalDirectory, 'assets/original.webp')),
    ).toEqual(f.bytes)
  })
  it('다운로드 실패를 제외한 검수에서도 실패 기록은 남고 필수 선택만 검증한다', async () => {
    const f = await fixture()
    const draftFile = path.join(f.directory, 'draft.json')
    const draft = JSON.parse(await readFile(draftFile, 'utf8'))
    draft.candidates[3].download = { status: 'failed', error: 'HTTP 404' }
    draft.errors = ['후보 다운로드 실패']
    await writeFile(draftFile, JSON.stringify(draft))
    const state = complete(
      (await f.repository.load(target)).state,
      f.candidates,
    )
    state.candidates[2].decision = 'exclude'
    state.autoActions.outro = state.autoActions.intro
    expect((await f.repository.validate(state)).errors).toEqual([])
    expect((await f.repository.load(target)).source.draft.errors).toEqual([
      '후보 다운로드 실패',
    ])
    state.candidates[2].decision = 'include'
    expect((await f.repository.validate(state)).errors.join()).toContain(
      '검증된 후보 이미지',
    )
  })
})
describe('로컬 검수 파일 API', () => {
  it('외부 Origin·Host·위조 토큰·경로 탈출을 거부하고 승인된 미완성 저장은 허용한다', async () => {
    const f = await fixture()
    const api = reviewApi(f.root)
    const server = createServer((request, response) => {
      void api(request, response, () => {
        response.writeHead(404)
        response.end()
      })
    })
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (!address || typeof address === 'string')
      throw new Error('서버 주소 오류')
    const base = `http://127.0.0.1:${address.port}/api/review`
    // Node fetch는 Host를 URL 값으로 정규화하므로 HTTP 요청으로 가상 Host를 직접 시험한다.
    const fetch = (
      url: string,
      init: {
        method?: string
        headers?: Record<string, string>
        body?: string
      } = {},
    ) =>
      new Promise<Response>((resolve, reject) => {
        const request = httpRequest(url, init, (response) => {
          const chunks: Buffer[] = []
          response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
          response.on('end', () =>
            resolve(
              new Response(Buffer.concat(chunks), {
                status: response.statusCode,
                headers: response.headers as Record<string, string>,
              }),
            ),
          )
        })
        request.on('error', reject)
        request.end(init.body)
      })
    const host = { Host: '127.0.0.1:5174' }
    expect(
      (await fetch(`${base}/session`, { headers: { Host: 'evil.test:5174' } }))
        .status,
    ).toBe(403)
    expect(
      (
        await fetch(`${base}/session`, {
          headers: { ...host, Origin: 'https://evil.test' },
        })
      ).status,
    ).toBe(403)
    const { token } = await (
      await fetch(`${base}/session`, { headers: host })
    ).json()
    const state = (await f.repository.load(target)).state
    const init = {
      method: 'POST',
      headers: {
        ...host,
        Origin: 'http://127.0.0.1:5174',
        'Content-Type': 'application/json',
        'X-Review-Token': token,
      },
      body: JSON.stringify({ state, revision: null }),
    }
    expect(
      (
        await fetch(`${base}/save`, {
          ...init,
          headers: { ...init.headers, 'X-Review-Token': 'forged' },
        })
      ).status,
    ).toBe(403)
    expect((await fetch(`${base}/save`, init)).status).toBe(200)
    expect(
      (await fetch(`${base}/load?runId=..&characterId=1102`, { headers: host }))
        .status,
    ).toBe(400)
    const image = await fetch(
      `${base}/image?runId=${target.runId}&characterId=1102&candidateId=${f.candidates[1].candidateId}`,
      { headers: host },
    )
    expect(image.headers.get('content-type')).toBe('image/webp')
    expect(Buffer.from(await image.arrayBuffer())).toEqual(f.bytes)
  })
})
