import { lstat, mkdir, readdir, realpath } from 'node:fs/promises'
import path from 'node:path'
import { validateCharacterData } from '../../src/data/characters/contract'
import { ELEMENTS } from '../../src/app/catalog'
import {
  object,
  rows,
  nonempty,
  sha256,
} from '../../scripts/character-sync/candidates'
import { errorMessage, readInside } from '../../scripts/character-sync/io'
import type { ReviewDraft, ReviewSource, ReviewTarget } from './model'

export function assertTarget(
  target: Pick<ReviewTarget, 'runId' | 'characterId'>,
) {
  if (
    !/^[A-Za-z0-9][A-Za-z0-9_-]{1,140}$/.test(target.runId) ||
    !/^\d{1,20}$/.test(target.characterId)
  )
    throw new Error('유효하지 않은 검수 대상입니다.')
}
export function targetDirectory(
  root: string,
  target: Pick<ReviewTarget, 'runId' | 'characterId'>,
) {
  assertTarget(target)
  return path.join(
    root,
    '.character-sync/runs',
    target.runId,
    target.characterId,
  )
}
export async function assertInside(root: string, directory: string) {
  const relative = path.relative(
    await realpath(root),
    await realpath(directory),
  )
  if (
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  )
    throw new Error('허용된 디렉터리 밖의 경로입니다.')
}
/** 생성 전에 가장 가까운 기존 부모의 실제 경로를 확인한다. */
export async function ensureDirectory(
  root: string,
  directory: string,
): Promise<void> {
  const relative = path.relative(path.resolve(root), path.resolve(directory))
  if (
    relative === '..' ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  )
    throw new Error('허용된 디렉터리 밖의 경로입니다.')
  try {
    await lstat(directory)
    await assertInside(root, directory)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    await ensureDirectory(root, path.dirname(directory))
    await mkdir(directory)
    await assertInside(root, directory)
  }
}
export async function optionalFile(
  root: string,
  file: string,
): Promise<Buffer | null> {
  try {
    return await readInside(root, file)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}
export function parseDraft(value: unknown, id: string): ReviewDraft {
  const data = object(value)
  if (
    data.schemaVersion !== 1 ||
    data.reviewStatus !== 'pending' ||
    data.characterId !== id
  )
    throw new Error('지원하지 않는 수집 초안입니다.')
  const basic = object(data.basicCandidate)
  if (
    !ELEMENTS.includes(basic.attribute as never) ||
    typeof basic.displayName !== 'string'
  )
    throw new Error('기본 정보 초안이 유효하지 않습니다.')
  const ids = new Set<string>()
  for (const candidate of rows(data.candidates)) {
    const candidateId = nonempty(candidate.candidateId)
    if (!/^candidate-[0-9a-f]{64}$/.test(candidateId) || ids.has(candidateId))
      throw new Error('후보 ID가 유효하지 않거나 중복됩니다.')
    ids.add(candidateId)
    if (
      !['portrait', 'skill'].includes(String(candidate.kind)) ||
      typeof candidate.asset !== 'string' ||
      !/^assets\/[0-9a-f]{64}\.webp$/.test(candidate.asset)
    )
      throw new Error('후보 자산 경로가 유효하지 않습니다.')
    const download = object(candidate.download)
    if (download.status === 'verified') {
      if (
        typeof download.sha256 !== 'string' ||
        !/^[0-9a-f]{64}$/.test(download.sha256)
      )
        throw new Error('후보 이미지 hash가 없습니다.')
    } else if (
      download.status !== 'failed' ||
      typeof download.error !== 'string'
    )
      throw new Error('후보 다운로드 상태가 유효하지 않습니다.')
    for (const source of rows(candidate.sources)) {
      if (!['encore', 'ww-data'].includes(String(source.source)))
        throw new Error('후보 출처가 유효하지 않습니다.')
      for (const key of ['document', 'recordId', 'field', 'originalPath'])
        nonempty(source[key])
      if (
        source.candidateName !== undefined &&
        typeof source.candidateName !== 'string'
      )
        throw new Error('출처 이름이 유효하지 않습니다.')
    }
  }
  if (
    !Array.isArray(data.errors) ||
    data.errors.some((error) => typeof error !== 'string')
  )
    throw new Error('수집 오류 목록이 유효하지 않습니다.')
  return {
    schemaVersion: 1,
    characterId: id,
    basicCandidate: basic as unknown as ReviewDraft['basicCandidate'],
    candidates: data.candidates as ReviewDraft['candidates'],
    errors: data.errors,
  }
}
export async function loadSource(
  root: string,
  target: Pick<ReviewTarget, 'runId' | 'characterId'>,
): Promise<ReviewSource> {
  const directory = targetDirectory(root, target)
  const raw = await readInside(root, path.join(directory, 'draft.json'))
  const draft = parseDraft(JSON.parse(raw.toString('utf8')), target.characterId)
  const currentRaw = await optionalFile(
    root,
    path.join(
      root,
      'src/assets/characters',
      target.characterId,
      'data',
      `${target.characterId}.json`,
    ),
  )
  let current: ReviewSource['current'] = null
  let currentError: string | null = null
  if (currentRaw) {
    try {
      current = validateCharacterData(
        JSON.parse(currentRaw.toString('utf8')),
        target.characterId,
      )
    } catch (error) {
      currentError = `기존 최종 JSON 오류: ${errorMessage(error)}`
    }
  }
  return {
    target: {
      ...target,
      displayName: current?.displayName ?? draft.basicCandidate.displayName,
    },
    draft,
    draftHash: sha256(raw),
    current,
    currentHash: currentRaw ? sha256(currentRaw) : null,
    currentError,
  }
}
export async function listTargets(root: string) {
  const result: { targets: ReviewTarget[]; errors: string[] } = {
    targets: [],
    errors: [],
  }
  const runsRoot = path.join(root, '.character-sync/runs')
  let runs
  try {
    await assertInside(root, runsRoot)
    runs = await readdir(runsRoot, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return result
    throw error
  }
  for (const run of runs
    .filter((r) => r.isDirectory())
    .sort((a, b) => b.name.localeCompare(a.name))) {
    await assertInside(root, path.join(runsRoot, run.name))
    const directories = await readdir(path.join(runsRoot, run.name), {
      withFileTypes: true,
    })
    for (const directory of directories.filter(
      (d) => d.isDirectory() && /^\d+$/.test(d.name),
    )) {
      try {
        const source = await loadSource(root, {
          runId: run.name,
          characterId: directory.name,
        })
        result.targets.push(source.target)
      } catch (error) {
        result.errors.push(
          `${run.name}/${directory.name}: ${errorMessage(error)}`,
        )
      }
    }
  }
  return result
}

export async function readCurrentAsset(
  root: string,
  source: ReviewSource,
  asset: string,
) {
  if (
    !source.current ||
    ![
      source.current.portrait,
      ...source.current.skills.map((s) => s.asset),
    ].includes(asset)
  )
    throw new Error('기존 검수 자산이 아닙니다.')
  return readInside(
    root,
    path.join(root, 'src/assets/characters', source.target.characterId, asset),
  )
}
export async function readCandidateAsset(
  root: string,
  source: ReviewSource,
  candidateId: string,
) {
  const candidate = source.draft.candidates.find(
    (c) => c.candidateId === candidateId,
  )
  if (!candidate || candidate.download.status !== 'verified')
    throw new Error('검증된 후보 이미지가 아닙니다.')
  const bytes = await readInside(
    root,
    path.join(targetDirectory(root, source.target), candidate.asset),
  )
  if (sha256(bytes) !== candidate.download.sha256)
    throw new Error('수집 후 후보 이미지가 변경되었습니다.')
  return bytes
}
