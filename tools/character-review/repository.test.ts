import {
  mkdtemp,
  cp,
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
import { setWorkspaceTargets } from './workspace'
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
describe('검수 검증과 JSON 전달', () => {
  it('미완성 백업은 수집 폴더 없는 저장소에서도 목록·타수·순서·이미지를 복원한다', async () => {
    const f = await fixture()
    const state = (await f.repository.load(target)).state
    state.candidates[0].category = '기본 공격'
    state.candidates[0].hitCount = 10
    state.cardOrder = state.candidates.map((c) => c.candidateId).reverse()
    const backup = await f.repository.backupCharacter(state)
    const emptyRoot = await mkdtemp(
      path.join(path.resolve(tmpdir()), 'wuwa-review-test-'),
    )
    roots.push(emptyRoot)
    const restored = new ReviewRepository(emptyRoot)
    const sessions = await restored.importFile({
      format: 'wuwa-character-review-backup',
      schemaVersion: 2,
      characters: [backup],
    })
    expect(sessions[0].state).toEqual(state)
    expect(
      await restored.image(
        sessions[0].source,
        `candidate:${f.candidates[1].candidateId}`,
      ),
    ).toEqual(f.bytes)
    expect(await restored.backupCharacter(sessions[0].state)).toEqual(backup)
    expect(await readdir(emptyRoot)).toEqual([])
    const broken = structuredClone(backup)
    broken.workspace.images[0].base64 = Buffer.from('broken').toString('base64')
    await expect(
      restored.importFile({
        format: 'wuwa-character-review-backup',
        schemaVersion: 2,
        characters: [broken],
      }),
    ).rejects.toThrow('hash')
    expect(await restored.backupCharacter(state)).toEqual(backup)
  })
  it('Export round trip은 내용·참조·이미지를 검증하고 이전 형식도 원본이 있으면 읽는다', async () => {
    const f = await fixture()
    const state = complete(
      (await f.repository.load(target)).state,
      f.candidates,
    )
    state.candidates.forEach((c, i) => {
      c.category = ['기본 공격', '변주 스킬', '반주 스킬'][i] as
        '기본 공격' | '변주 스킬' | '반주 스킬'
    })
    state.candidates[0].hitCount = 3
    const exported = await f.repository.exportCharacter(state)
    const file = {
      format: 'wuwa-character-review',
      schemaVersion: 2,
      status: 'pending-agent-validation',
      characters: [exported],
    }
    expect(
      (await new ReviewRepository(f.root).importFile(file))[0].state,
    ).toEqual(state)
    const old = structuredClone(exported) as Partial<typeof exported>
    delete old.workspace
    expect(
      (
        await f.repository.importFile({
          ...file,
          schemaVersion: 1,
          characters: [old],
        })
      )[0].state,
    ).toEqual(state)
    const broken = structuredClone(file)
    broken.characters[0].character.skills[0].displayName = '검수와 다른 값'
    await expect(f.repository.importFile(broken)).rejects.toThrow('검수 내용')
    const duplicated = { ...file, characters: [exported, exported] }
    await expect(f.repository.importFile(duplicated)).rejects.toThrow('중복')
    const badReference = structuredClone(file)
    badReference.characters[0].review.autoActions.intro = 'missing'
    await expect(f.repository.importFile(badReference)).rejects.toThrow('참조')
  })
  it.each([-1, 11, 1.5])(
    '잘못된 타수 %s를 백업과 Export에서 거부한다',
    async (hitCount) => {
      const f = await fixture()
      const state = complete(
        (await f.repository.load(target)).state,
        f.candidates,
      )
      state.candidates[0].category = '기본 공격'
      state.candidates[0].hitCount = hitCount
      await expect(f.repository.backupCharacter(state)).rejects.toThrow('형식')
      await expect(f.repository.exportCharacter(state)).rejects.toThrow('형식')
    },
  )
  it('미완성 검수는 검증 오류로 남고 Export는 DB나 검수 파일을 만들지 않는다', async () => {
    const f = await fixture()
    const state = (await f.repository.load(target)).state
    expect((await f.repository.validate(state)).errors.length).toBeGreaterThan(
      3,
    )
    await expect(f.repository.exportCharacter(state)).rejects.toThrow()
    expect(await scanRegistered(f.root)).toEqual([])
    expect((await readdir(f.directory)).sort()).toEqual([
      'assets',
      'draft.json',
    ])
  })
  it('과거 review.json은 읽지 않고 매번 새 검수를 시작한다', async () => {
    const f = await fixture()
    await writeFile(path.join(f.directory, 'review.json'), '손상된 과거 검수')
    const session = await f.repository.load(target)
    expect(session.revision).toBeNull()
    expect(
      session.state.candidates.every(
        (c) => c.decision === 'pending' && c.displayName === '',
      ),
    ).toBe(true)
    expect(session.conflict).toBeNull()
  })
  it('이름·분류·통합 카드 순서를 Export에 보존하며 실제 WebP와 hash를 포함한다', async () => {
    const f = await fixture()
    const before = await readFile(path.join(f.directory, 'draft.json'))
    const state = complete(
      (await f.repository.load(target)).state,
      f.candidates,
    )
    const categories = ['기본 공격', '변주 스킬', '반주 스킬'] as const
    state.candidates.forEach((c, i) => {
      c.category = categories[i]
    })
    state.cardOrder = state.candidates.map((c) => c.candidateId).reverse()
    const result = await f.repository.exportCharacter(state)
    expect(result.character.reviewStatus).toBe('pending-agent-validation')
    expect(result.character.skills.map((s) => s.category)).toEqual([
      '반주 스킬',
      '변주 스킬',
      '기본 공격',
    ])
    expect(result.assets).toHaveLength(1)
    expect(Buffer.from(result.assets[0].base64, 'base64')).toEqual(f.bytes)
    expect(result.assets[0].sha256).toBe(sha256(f.bytes))
    expect(await readFile(path.join(f.directory, 'draft.json'))).toEqual(before)
    expect(await scanRegistered(f.root)).toEqual([])
    expect((await readdir(f.directory)).sort()).toEqual([
      'assets',
      'draft.json',
    ])
  })
  it('기존 공개 ID를 보존하고 JSON Export가 기존 DB와 이미지를 수정하지 않는다', async () => {
    const f = await fixture(true)
    const before = await readFile(f.finalFile)
    const state = (await f.repository.load(target)).state
    state.existingSkills[0].displayName = '변경할 이름'
    state.candidates.forEach((c) => {
      c.decision = 'exclude'
    })
    const exported = await f.repository.exportCharacter(state)
    expect(exported.character.skills[0].skillId).toBe('1102:public')
    expect(exported.character.skills[0].displayName).toBe('변경할 이름')
    expect(await readFile(f.finalFile)).toEqual(before)
    expect(
      await readFile(path.join(f.finalDirectory, 'assets/original.webp')),
    ).toEqual(f.bytes)
    expect((await readdir(f.directory)).sort()).toEqual([
      'assets',
      'draft.json',
    ])
    expect(
      (
        await f.repository.validate({ ...state, existingSkills: [] })
      ).errors.join(),
    ).toContain('공개 Skill ID')
  })
  it('원본·이미지·DB 변경과 잘못된 카드 순서, 참조를 거부한다', async () => {
    const f = await fixture(true)
    const state = complete(
      (await f.repository.load(target)).state,
      f.candidates,
    )
    await writeFile(path.join(f.directory, f.candidates[1].asset), 'broken')
    await expect(f.repository.exportCharacter(state)).rejects.toThrow(
      '이미지가 변경',
    )
    await writeFile(path.join(f.directory, f.candidates[1].asset), f.bytes)
    expect(
      (await f.repository.validate({ ...state, cardOrder: [] })).errors.join(),
    ).toContain('카드 순서')
    expect(
      (
        await f.repository.validate({
          ...state,
          autoActions: { ...state.autoActions, intro: 'absent' },
        })
      ).errors.join(),
    ).toContain('참조')
    const final = JSON.parse(await readFile(f.finalFile, 'utf8'))
    final.displayName = '다른 작업'
    await writeFile(f.finalFile, JSON.stringify(final))
    await expect(f.repository.exportCharacter(state)).rejects.toThrow(
      '최종 파일이 변경',
    )
  })
  it('실패 후보는 제외할 수 있고 실패 기록은 유지한다', async () => {
    const f = await fixture()
    const file = path.join(f.directory, 'draft.json')
    const draft = JSON.parse(await readFile(file, 'utf8'))
    draft.candidates[3].download = { status: 'failed', error: 'HTTP 404' }
    draft.errors = ['후보 다운로드 실패']
    await writeFile(file, JSON.stringify(draft))
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
    await expect(f.repository.exportCharacter(state)).rejects.toThrow(
      '검증된 후보 이미지',
    )
  })
})
describe('로컬 검수 파일 API', () => {
  it('외부 접근·미지정 대상·기존 쓰기 API를 차단하고 검증 통과 대상만 묶어 내보낸다', async () => {
    const f = await fixture()
    await setWorkspaceTargets(f.root, [target])
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
      body: JSON.stringify({ states: [state] }),
    }
    expect(
      (
        await fetch(`${base}/save`, {
          ...init,
          headers: { ...init.headers, 'X-Review-Token': 'forged' },
        })
      ).status,
    ).toBe(403)
    expect((await fetch(`${base}/save`, init)).status).toBe(404)
    expect((await fetch(`${base}/publish`, init)).status).toBe(404)
    expect((await fetch(`${base}/export`, init)).status).toBe(400)
    expect((await fetch(`${base}/validate`, init)).status).toBe(200)
    const completeState = complete(state, f.candidates)
    const exported = await fetch(`${base}/export`, {
      ...init,
      body: JSON.stringify({ states: [completeState] }),
    })
    expect(exported.status).toBe(200)
    const payload = await exported.json()
    expect(payload.file.status).toBe('pending-agent-validation')
    expect(payload.file.characters).toHaveLength(1)
    expect(await scanRegistered(f.root)).toEqual([])
    // 서로 다른 세 대상 중 두 명만 완료했을 때 한 파일에 두 명을 담는다.
    const batchTargets = [target]
    for (const characterId of ['1103', '1104']) {
      const extra = { ...target, characterId }
      const destination = path.join(path.dirname(f.directory), characterId)
      await cp(f.directory, destination, { recursive: true })
      const draftFile = path.join(destination, 'draft.json')
      const draft = JSON.parse(await readFile(draftFile, 'utf8'))
      draft.characterId = characterId
      await writeFile(draftFile, JSON.stringify(draft))
      batchTargets.push(extra)
    }
    await setWorkspaceTargets(f.root, batchTargets)
    const second = complete(
      (await f.repository.load(batchTargets[1])).state,
      f.candidates,
    )
    second.autoActions = Object.fromEntries(
      Object.entries(second.autoActions).map(([key, id]) => [
        key,
        id?.replace('1102:', '1103:'),
      ]),
    ) as ReviewState['autoActions']
    const incomplete = (await f.repository.load(batchTargets[2])).state
    const batch = await fetch(`${base}/export`, {
      ...init,
      body: JSON.stringify({ states: [completeState, second, incomplete] }),
    })
    expect(batch.status).toBe(200)
    const batchPayload = await batch.json()
    expect(
      batchPayload.file.characters.map(
        (c: { characterId: string }) => c.characterId,
      ),
    ).toEqual(['1102', '1103'])
    expect(batchPayload.results[2].errors.length).toBeGreaterThan(0)
    expect(await scanRegistered(f.root)).toEqual([])
    const listing = await (
      await fetch(`${base}/targets`, { headers: host })
    ).json()
    expect(listing.targets).toHaveLength(3)
    expect(
      (
        await fetch(`${base}/load?runId=older-run&characterId=1102`, {
          headers: host,
        })
      ).status,
    ).toBe(400)
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
    await setWorkspaceTargets(f.root, [target])
    const importedFile = {
      format: 'wuwa-character-review-backup',
      schemaVersion: 2,
      characters: [await f.repository.backupCharacter(second)],
    }
    const imported = await fetch(`${base}/import`, {
      ...init,
      body: JSON.stringify({ file: importedFile }),
    })
    expect(imported.status).toBe(200)
    expect(
      (await imported.json()).sessions.map(
        (s: { state: ReviewState }) => s.state.characterId,
      ),
    ).toEqual(['1103'])
    expect(
      (
        await fetch(`${base}/validate`, {
          ...init,
          body: JSON.stringify({ states: [second] }),
        })
      ).status,
    ).toBe(200)
    expect(
      (
        await fetch(`${base}/backup`, {
          ...init,
          body: JSON.stringify({ states: [second] }),
        })
      ).status,
    ).toBe(200)
    expect(await scanRegistered(f.root)).toEqual([])
  })
})
