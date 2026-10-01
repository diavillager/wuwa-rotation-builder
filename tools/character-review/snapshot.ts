import { object, sha256 } from '../../scripts/character-sync/candidates'
import { decodeWebP } from '../../scripts/character-sync/io'
import { validateCharacterData } from '../../src/data/characters/contract'
import { isSkillCategory } from '../../src/data/characters/categories'
import { assertTarget, parseDraft } from './files'
import type { ReviewSource } from './model'

export interface SnapshotImage {
  key: string
  sha256: string
  base64: string
}
export interface ReviewSnapshot {
  source: ReviewSource
  images: SnapshotImage[]
}
export interface LoadedSnapshot {
  source: ReviewSource
  images: Map<string, Buffer>
}
export const snapshotKey = (target: { runId: string; characterId: string }) =>
  `${target.runId}/${target.characterId}`
export function imageKeys(source: ReviewSource): Map<string, string | null> {
  const keys = new Map<string, string | null>()
  for (const candidate of source.draft.candidates)
    if (candidate.download.status === 'verified')
      keys.set(`candidate:${candidate.candidateId}`, candidate.download.sha256)
  if (source.current) {
    keys.set(`current:${source.current.portrait}`, null)
    for (const skill of source.current.skills)
      keys.set(`current:${skill.asset}`, null)
  }
  return keys
}
/** 파일의 경로/URL을 실행하거나 디스크에 쓰지 않고 메모리 복원 자료만 검증한다. */
export async function parseSnapshot(value: unknown): Promise<LoadedSnapshot> {
  const data = object(value)
  const raw = object(data.source)
  const target = object(raw.target) as unknown as ReviewSource['target']
  assertTarget(target)
  if (
    typeof target.displayName !== 'string' ||
    typeof raw.draftHash !== 'string' ||
    !/^[0-9a-f]{64}$/.test(raw.draftHash) ||
    (raw.currentHash !== null &&
      (typeof raw.currentHash !== 'string' ||
        !/^[0-9a-f]{64}$/.test(raw.currentHash)))
  )
    throw new Error('복원 자료의 ID 또는 기준 hash가 유효하지 않습니다.')
  const draft = parseDraft(
    { ...object(raw.draft), reviewStatus: 'pending' },
    target.characterId,
  )
  const current =
    raw.current === null
      ? null
      : validateCharacterData(raw.current, target.characterId)
  const matches = object(raw.encoreMatches ?? {})
  for (const [id, value] of Object.entries(matches)) {
    const match = object(value)
    if (
      !draft.candidates.some(
        (c) => c.kind === 'skill' && c.candidateId === id,
      ) ||
      !isSkillCategory(match.category) ||
      typeof match.displayName !== 'string' ||
      typeof match.skillId !== 'string'
    )
      throw new Error('복원 자료의 Encore 대응이 유효하지 않습니다.')
  }
  const source: ReviewSource = {
    target: {
      runId: target.runId,
      characterId: target.characterId,
      displayName: target.displayName,
    },
    draft,
    draftHash: raw.draftHash,
    current,
    currentHash: raw.currentHash as string | null,
    currentError:
      typeof raw.currentError === 'string' ? raw.currentError : null,
    ...(raw.encoreMatches !== undefined
      ? { encoreMatches: matches as ReviewSource['encoreMatches'] }
      : {}),
    encoreErrors: Array.isArray(raw.encoreErrors)
      ? raw.encoreErrors.filter((e): e is string => typeof e === 'string')
      : [],
  }
  if (!Array.isArray(data.images))
    throw new Error('복원 이미지 목록이 필요합니다.')
  const expected = imageKeys(source)
  const images = new Map<string, Buffer>()
  for (const value of data.images) {
    const image = object(value)
    if (
      typeof image.key !== 'string' ||
      !expected.has(image.key) ||
      images.has(image.key) ||
      typeof image.base64 !== 'string' ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
        image.base64,
      )
    )
      throw new Error('복원 이미지 키·중복·base64 형식 오류입니다.')
    const bytes = Buffer.from(image.base64, 'base64')
    const hash = sha256(bytes)
    if (
      hash !== image.sha256 ||
      (expected.get(image.key) && hash !== expected.get(image.key))
    )
      throw new Error('복원 이미지 hash가 일치하지 않습니다.')
    await decodeWebP(bytes)
    images.set(image.key, bytes)
  }
  if (images.size !== expected.size)
    throw new Error('복원에 필요한 이미지가 누락되었습니다.')
  return { source, images }
}
