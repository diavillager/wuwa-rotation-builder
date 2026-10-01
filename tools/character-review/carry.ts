import { readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { sha256 } from '../../scripts/character-sync/candidates'
import { writeJson } from '../../scripts/character-sync/io'
import {
  loadSource,
  optionalFile,
  readCandidateAsset,
  targetDirectory,
} from './files'
import {
  initialReview,
  type ReviewSession,
  type ReviewSource,
  type ReviewState,
} from './model'
import { parseReview, ReviewRepository } from './repository'

/** 같은 최종 데이터와 동일 이미지에 대한 검수만 이어받는다. 기존 순서는 보존한다. */
export function carryState(
  previous: ReviewSession,
  next: ReviewSource,
): ReviewState {
  if (previous.conflict) throw new Error(previous.conflict)
  const old = parseReview(previous.state, previous.source)
  if (
    old.characterId !== next.target.characterId ||
    old.baseHash !== next.currentHash
  )
    throw new Error('검수 이전 기준이 달라졌습니다.')
  for (const candidate of previous.source.draft.candidates) {
    const target = next.draft.candidates.find(
      (c) => c.candidateId === candidate.candidateId,
    )
    if (
      !target ||
      target.resourcePath !== candidate.resourcePath ||
      target.kind !== candidate.kind
    )
      throw new Error(
        `기존 검수 후보가 누락 또는 변경되었습니다: ${candidate.candidateId}`,
      )
    if (
      candidate.download.status === 'verified' &&
      (target.download.status !== 'verified' ||
        target.download.sha256 !== candidate.download.sha256)
    )
      throw new Error(`검수 이미지가 변경되었습니다: ${candidate.candidateId}`)
  }
  const initial = initialReview(next)
  const known = new Set(old.candidates.map((c) => c.candidateId))
  return parseReview(
    {
      ...old,
      runId: next.target.runId,
      draftHash: next.draftHash,
      candidates: [
        ...old.candidates,
        ...initial.candidates.filter((c) => !known.has(c.candidateId)),
      ],
    },
    next,
  )
}

export async function carryLatestReview(
  root: string,
  runId: string,
  characterId: string,
) {
  const runsRoot = path.join(root, '.character-sync/runs')
  const saved: { runId: string; modified: number; raw: Buffer }[] = []
  for (const entry of await readdir(runsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === runId) continue
    const file = path.join(
      targetDirectory(root, { runId: entry.name, characterId }),
      'review.json',
    )
    const raw = await optionalFile(root, file)
    if (raw)
      saved.push({
        runId: entry.name,
        modified: (await stat(file)).mtimeMs,
        raw,
      })
  }
  saved.sort(
    (a, b) => b.modified - a.modified || b.runId.localeCompare(a.runId),
  )
  const latest = saved[0]
  if (!latest) return null
  const repository = new ReviewRepository(root)
  const previous = await repository.load({ runId: latest.runId, characterId })
  if (previous.revision !== sha256(latest.raw))
    throw new Error('이전 검수가 수집 중 변경되었습니다.')
  const source = await loadSource(root, { runId, characterId })
  const state = carryState(previous, source)
  for (const candidate of previous.source.draft.candidates) {
    if (candidate.download.status !== 'verified') continue
    await readCandidateAsset(root, previous.source, candidate.candidateId)
    await readCandidateAsset(root, source, candidate.candidateId)
  }
  const latestFile = path.join(
    targetDirectory(root, previous.source.target),
    'review.json',
  )
  const checked = await optionalFile(root, latestFile)
  if (!checked || sha256(checked) !== previous.revision)
    throw new Error('이전 검수가 수집 중 변경되었습니다.')
  await writeJson(
    path.join(targetDirectory(root, source.target), 'inherited-review.json'),
    {
      fromRunId: latest.runId,
      revision: previous.revision,
      review: JSON.parse(latest.raw.toString('utf8')),
    },
  )
  await repository.save(state, null)
  return latest.runId
}
