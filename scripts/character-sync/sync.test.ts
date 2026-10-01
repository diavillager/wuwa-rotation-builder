import {
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import sharp from 'sharp'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  encoreCandidates,
  mergeCandidates,
  parseList,
  resourcePath,
  wwCandidates,
  type WwData,
} from './candidates'
import { decodeWebP, fetchBytes, scanRegistered } from './io'
import { runSync } from './run'
import type { Sources } from './sources'
import { main } from './cli'
import type { CharacterData } from '../../src/data/characters/contract'
import { assetCandidates, ASSET_ROOT } from './assets'

const roots: string[] = []
afterEach(async () => {
  vi.restoreAllMocks()
  for (const root of roots.splice(0)) {
    // mkdtemp로 생성한 테스트 전용 절대 경로만 정리한다.
    if (
      !path.basename(root).startsWith('wuwa-sync-test-') ||
      path.dirname(root) !== path.resolve(tmpdir())
    )
      throw new Error('테스트 정리 경로 오류')
    await rm(root, { recursive: true, force: true })
  }
})
async function temp() {
  const root = await mkdtemp(
    path.join(path.resolve(tmpdir()), 'wuwa-sync-test-'),
  )
  roots.push(root)
  return root
}
const icon =
  '/Game/Aki/UI/UIResources/Common/Atlas/SkillIcon/SkillIconExample/A1'
const portrait = '/Game/Aki/UI/Portrait/Example'
const detail = (id = '1102') => ({
  Id: Number(id),
  Name: { Content: '검증 공명자' },
  ElementName: '응결',
  RoleHeadIconLarge: `${portrait}.webp`,
  Skills: [
    {
      SkillId: 101,
      SkillName: '소스 후보 이름',
      Icon: `https://api.encore.moe/resource/Data${icon}.webp`,
    },
  ],
})
const listing = {
  roleList: ['1102', '1203'].map((id) => ({
    Id: Number(id),
    Name: '검증 공명자',
    Element: { Name: '응결' },
    RoleHeadIcon: `${portrait}.webp`,
  })),
}
const ww: WwData = {
  roles: [
    { Id: 1102, SkillId: 55 },
    { Id: 1203, SkillId: 55 },
  ],
  skills: [
    {
      Id: 101,
      SkillGroupId: 55,
      SkillName: 'raw-name-key',
      Icon: `${icon}.A1`,
    },
  ],
  buttons: [{ Id: 1, RoleId: 1102, SkillIconTags: [7] }],
  icons: [
    {
      Id: 2,
      Tag: 7,
      IconPath: '/Game/Aki/UI/SkillIcon/SkillIconNor/Dynamic.Dynamic',
    },
    {
      Id: 3,
      Tag: 8,
      IconPath:
        '/Game/Aki/UI/UIResources/Common/Atlas/SkillIcon/SkillIconExample/Extra.Extra',
    },
  ],
}
const imageBytes = () =>
  sharp({ create: { width: 2, height: 2, channels: 4, background: '#125678' } })
    .webp()
    .toBuffer()
async function sourceFixture(): Promise<Sources> {
  const bytes = await imageBytes()
  return {
    list: async () => listing,
    detail: async (id) => detail(id),
    ww: async () => ({ ref: 'a'.repeat(40), data: ww }),
    assets: async () => ({
      ref: 'b'.repeat(40),
      paths: [`${icon.replace('/Game/Aki/UI/', '')}.webp`],
    }),
    download: async () => bytes,
  }
}
async function registered(root: string, id = '1102') {
  const data: CharacterData = {
    schemaVersion: 1,
    reviewStatus: 'approved',
    characterId: id,
    displayName: '기존 검수 이름',
    attribute: '응결',
    portrait: 'assets/reviewed.webp',
    skills: [
      {
        skillId: `${id}:stable`,
        displayName: '기존 검수 스킬',
        visible: true,
        asset: 'assets/reviewed.webp',
      },
    ],
    autoActions: {
      normalSwitchAttack: `${id}:stable`,
      intro: `${id}:stable`,
      outro: `${id}:stable`,
    },
  }
  const directory = path.join(root, 'src/assets/characters', id)
  await mkdir(path.join(directory, 'data'), { recursive: true })
  await mkdir(path.join(directory, 'assets'), { recursive: true })
  const json = path.join(directory, 'data', `${id}.json`)
  await writeFile(json, JSON.stringify(data))
  const asset = path.join(directory, 'assets/reviewed.webp')
  await writeFile(asset, await imageBytes())
  return { data, json, asset }
}

describe('후보 파싱과 출처', () => {
  it('실제 전용 폴더의 미참조 파일을 추가하고 공용·다른 폴더·Atlas를 제외한다', () => {
    const known = encoreCandidates(detail(), '1102')
    const base = `${ASSET_ROOT}SkillIconExample/`
    const snapshot = {
      ref: 'b'.repeat(40),
      paths: [
        `${base}A1.webp`,
        `${base}Unlisted.webp`,
        `${base}T_TPI_Example_UIAtlas.webp`,
        `${ASSET_ROOT}SkillIconNor/Common.webp`,
        `${ASSET_ROOT}SkillIconOther/Other.webp`,
      ],
    }
    const found = assetCandidates(snapshot, known)
    expect(found.map((c) => c.resourcePath.split('/').pop()).sort()).toEqual([
      'A1.webp',
      'Unlisted.webp',
    ])
    const combined = mergeCandidates(known, found)
    expect(combined).toHaveLength(3)
    const shared = combined.find((c) => c.resourcePath === `${icon}.webp`)!
    expect(shared.candidateId).toBe(
      known.find((c) => c.kind === 'skill')!.candidateId,
    )
    expect(shared.sources.map((s) => s.source)).toEqual(['encore', 'ww-asset'])
    expect(
      found.every(
        (c) => c.review.displayName === null && c.url.includes(snapshot.ref),
      ),
    ).toBe(true)
    expect(() => assetCandidates({ ...snapshot, paths: [] }, known)).toThrow(
      '폴더',
    )
    expect(() => assetCandidates({ ...snapshot, ref: 'main' }, known)).toThrow(
      'commit',
    )
  })
  it('Unreal·Encore 경로를 합치고 순서가 달라도 ID와 모든 출처를 보존하며 의미는 비워 둔다', () => {
    const fromEncore = encoreCandidates(detail(), '1102')
    const fromWw = wwCandidates(ww, '1102', 'a'.repeat(40), fromEncore)
    const combined = mergeCandidates(fromEncore, fromWw)
    expect(combined).toHaveLength(4)
    const shared = combined.find((c) => c.resourcePath === `${icon}.webp`)!
    expect(shared.sources.map((s) => s.source)).toEqual(['encore', 'ww-data'])
    expect(shared.review).toEqual({ displayName: null, visible: null })
    expect(shared.sources[0].candidateName).toBe('소스 후보 이름')
    expect(
      mergeCandidates([...fromWw].reverse(), [...fromEncore].reverse()).map(
        (c) => c.candidateId,
      ),
    ).toEqual(combined.map((c) => c.candidateId))
    expect(shared.url).toMatch(/^https:\/\/api-v2.encore.moe\/resource\/Data\//)
  })
  it.each([
    'https://unrelated.test/a.webp',
    '/Game/../../secret',
    '/Game/Icon.BadSuffix',
    'file:///secret',
    '/Game/x?redirect=y',
  ])('허용하지 않는 원본 경로 거부: %s', (value) => {
    expect(() => resourcePath(value)).toThrow()
  })
  it('목록의 잘못된 형식과 중복 ID를 조용히 건너뛰지 않는다', () => {
    expect(() =>
      parseList({ roleList: [listing.roleList[0], listing.roleList[0]] }),
    ).toThrow('중복')
    expect(() => parseList({ roleList: [] })).toThrow('비어')
  })
})
describe('실제 이미지 검증', () => {
  it('실제 WebP를 디코딩하고 헤더만 있는 파일을 거부한다', async () => {
    const bytes = await imageBytes()
    expect(await decodeWebP(bytes)).toMatchObject({ width: 2, height: 2 })
    await expect(decodeWebP(bytes.subarray(0, 16))).rejects.toThrow()
    await expect(
      decodeWebP(await sharp(bytes).png().toBuffer()),
    ).rejects.toThrow('WebP')
  })
  it.each([
    [200, 'text/html'],
    [404, 'image/webp'],
  ])('HTTP %s / %s 응답을 거부한다', async (status, type) => {
    const fetcher = vi.fn(
      async () =>
        new Response('error', { status, headers: { 'content-type': type } }),
    )
    await expect(
      fetchBytes('https://example.test/asset.webp', 'webp', fetcher),
    ).rejects.toThrow()
  })
})
describe('등록 판정과 보존', () => {
  it('Encore 스킬 목록이 비어 있어도 초상화를 수집하고 부분 수집으로 보고한다', async () => {
    const root = await temp()
    const sources = await sourceFixture()
    sources.detail = async (id) => ({ ...detail(id), Skills: [] })
    const result = await runSync(root, sources, { character: '1102' })
    if (result.plan) throw new Error('잘못된 결과')
    const draft = JSON.parse(
      await readFile(path.join(result.directory, '1102/draft.json'), 'utf8'),
    )
    expect(
      draft.candidates.find((c: { kind: string }) => c.kind === 'portrait')
        .download.status,
    ).toBe('verified')
    expect(result.report.results[0].status).toBe('partial')
    expect(
      result.report.errors.some((e) => e.message.includes('스킬 후보가 비어')),
    ).toBe(true)
  })
  it('여러 지정 대상을 한 실행에 모으고 실제 자산 목록 오류를 보고한다', async () => {
    const root = await temp()
    const sources = await sourceFixture()
    sources.assets = async () => {
      throw new Error('자산 목록 장애')
    }
    const result = await runSync(root, sources, {
      characters: ['1203', '1102'],
    })
    if (result.plan) throw new Error('잘못된 결과')
    expect(result.report.targets).toEqual(['1203', '1102'])
    expect(result.report.results.every((r) => r.status === 'partial')).toBe(
      true,
    )
    expect(
      result.report.errors.some(
        (e) => e.scope === 'ww-asset' && e.message === '자산 목록 장애',
      ),
    ).toBe(true)
    await expect(
      runSync(root, sources, { characters: ['1102', '1102'] }),
    ).rejects.toThrow('중복')
  })
  it('전체 수집은 정상 등록을 건너뛰고 나머지 대상만 수집한다', async () => {
    const root = await temp()
    const final = await registered(root)
    const before = await readFile(final.json)
    const sources = await sourceFixture()
    const detailCall = vi.spyOn(sources, 'detail')
    const result = await runSync(root, sources, { all: true })
    if (result.plan) throw new Error('잘못된 결과')
    expect(result.report.targets).toEqual(['1203'])
    expect(result.report.results[0].status).toBe('collected')
    expect(detailCall).toHaveBeenCalledExactlyOnceWith('1203')
    expect(await readFile(final.json)).toEqual(before)
  })
  it('폴더만 있거나 JSON·이미지가 손상된 공명자를 미등록으로 보고 정상 대상만 제외한다', async () => {
    const root = await temp()
    const final = await registered(root)
    await mkdir(path.join(root, 'src/assets/characters/1203'), {
      recursive: true,
    })
    const sources = await sourceFixture()
    let plan = await runSync(root, sources, { all: true }, true)
    expect(plan.plan && plan.targets).toEqual(['1203'])
    expect(await readdir(root)).toEqual(['src'])
    await writeFile(final.asset, 'broken')
    plan = await runSync(root, sources, { all: true }, true)
    expect(plan.plan && plan.targets).toEqual(['1102', '1203'])
    await writeFile(final.json, '{broken')
    expect((await scanRegistered(root)).every((r) => !r.valid)).toBe(true)
  })
  it('공개 스킬 ID가 충돌하면 양쪽 등록을 오류로 보고한다', async () => {
    const root = await temp()
    const a = await registered(root, '1102')
    const b = await registered(root, '1203')
    b.data.skills = a.data.skills
    b.data.autoActions = a.data.autoActions
    await writeFile(b.json, JSON.stringify(b.data))
    expect(
      (await scanRegistered(root)).every(
        (r) => !r.valid && r.errors.some((e) => e.includes('충돌')),
      ),
    ).toBe(true)
  })
  it('재수집은 검수값·공개 ID·이미지와 이전 초안을 그대로 보존한다', async () => {
    const root = await temp()
    const final = await registered(root)
    const before = await readFile(final.json)
    const beforeAsset = await readFile(final.asset)
    const sources = await sourceFixture()
    const first = await runSync(root, sources, { character: '1102' })
    if (first.plan) throw new Error('잘못된 결과')
    expect(first.report.errors).toEqual([])
    const draftPath = path.join(first.directory, '1102/draft.json')
    const draft = JSON.parse(await readFile(draftPath, 'utf8'))
    expect(draft.existingReview).toBeUndefined()
    expect(draft.autoActions).toEqual({
      normalSwitchAttack: null,
      intro: null,
      outro: null,
    })
    expect(
      draft.candidates.every(
        (c: { review: unknown }) =>
          JSON.stringify(c.review) ===
          JSON.stringify({ displayName: null, visible: null }),
      ),
    ).toBe(true)
    await writeFile(draftPath, '사용자가 편집한 이전 초안')
    const second = await runSync(root, sources, { character: '1102' })
    expect(second.plan || second.directory).not.toBe(first.directory)
    expect(await readFile(draftPath, 'utf8')).toBe('사용자가 편집한 이전 초안')
    expect(await readFile(final.json)).toEqual(before)
    expect(await readFile(final.asset)).toEqual(beforeAsset)
  })
  it('한 소스와 한 이미지가 실패해도 정상 후보와 실패 내용을 함께 남긴다', async () => {
    const root = await temp()
    const sources = await sourceFixture()
    sources.ww = async () => {
      throw new Error('소스 장애')
    }
    const download = sources.download
    sources.download = async (url) => {
      if (url.includes('/Portrait/')) throw new Error('이미지 장애')
      return download(url)
    }
    const result = await runSync(root, sources, { character: '1102' })
    if (result.plan) throw new Error('잘못된 결과')
    expect(result.report.results[0]).toMatchObject({
      status: 'partial',
      candidates: 2,
      verified: 1,
    })
    expect(
      result.report.errors.some((e) => e.message.includes('소스 장애')),
    ).toBe(true)
    const draft = JSON.parse(
      await readFile(path.join(result.directory, '1102/draft.json'), 'utf8'),
    )
    expect(
      draft.candidates.find((c: { kind: string }) => c.kind === 'portrait')
        .download,
    ).toMatchObject({ status: 'failed', error: '이미지 장애' })
    expect(
      await readdir(path.join(result.directory, '1102/assets')),
    ).toHaveLength(1)
  })
  it('목록에 없는 대상과 잘못된 CLI 모드는 실행하지 않는다', async () => {
    const root = await temp()
    await expect(
      runSync(root, await sourceFixture(), { character: '9999' }),
    ).rejects.toThrow('목록에')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await main(['--all', '--character', '1102'])).toBe(2)
    expect(await main(['--character', '../1102'])).toBe(2)
    expect(await main(['--all', '--ww-ref', 'main'])).toBe(2)
  })
})
