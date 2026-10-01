import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import {
  mergeWorkspaceBackup,
  readSavedReview,
  sameRoster,
  updateBackup,
  writeSavedReview,
  type ReviewBackup,
  type SavedReview,
} from './storage'
import { initialReview, type ReviewSource } from './model'

beforeEach(() => vi.stubGlobal('indexedDB', new IDBFactory()))
afterEach(() => vi.unstubAllGlobals())
function backup(id = '1102'): ReviewBackup {
  const source: ReviewSource = {
    target: { characterId: id, runId: 'test-run', displayName: '테스트' },
    draftHash: 'hash',
    current: null,
    currentHash: null,
    currentError: null,
    draft: {
      schemaVersion: 1,
      characterId: id,
      basicCandidate: { displayName: '테스트', attribute: '응결' },
      candidates: [],
      errors: [],
    },
  }
  return {
    format: 'wuwa-character-review-backup',
    schemaVersion: 2,
    characters: [
      {
        characterId: id,
        review: initialReview(source),
        workspace: {
          source,
          images: [{ key: 'fixture', sha256: 'hash', base64: 'aW1hZ2U=' }],
        },
      },
    ],
  }
}
it('새 DB는 비어 있고 편집·원본·이미지·선택한 공명자를 재연결 후 복원한다', async () => {
  expect(await readSavedReview()).toBeNull()
  const saved: SavedReview = {
    version: 1,
    mode: 'import',
    activeId: '1102',
    file: backup(),
  }
  saved.file.characters[0].review.displayName = '편집 이름'
  await writeSavedReview(saved)
  expect(await readSavedReview()).toEqual(saved)
  const next = structuredClone(saved)
  next.file.characters[0].review.displayName = '최신 이름'
  await writeSavedReview(next)
  expect(await readSavedReview()).toEqual(next)
})
it('이미지는 다시 준비하지 않고 최신 검수 값을 저장하며 대상이 다르면 거부한다', () => {
  const file = backup()
  const state = { ...file.characters[0].review, displayName: '바뀐 이름' }
  const updated = updateBackup(file, [state])
  expect(updated.characters[0].review.displayName).toBe('바뀐 이름')
  expect(updated.characters[0].workspace).toBe(file.characters[0].workspace)
  expect(file.characters[0].review.displayName).toBe('테스트')
  expect(() =>
    updateBackup(file, [{ ...state, draftHash: 'changed' }]),
  ).toThrow('원본')
})
it('새 공명자는 추가하고 기존 공명자의 미완성 검수는 보존한다', () => {
  const saved = backup()
  saved.characters[0].review.displayName = '직접 검수'
  const fresh = backup()
  fresh.characters.push(...backup('1103').characters)
  expect(
    sameRoster(
      saved,
      fresh.characters.map((c) => c.workspace.source.target),
    ),
  ).toBe(false)
  const merged = mergeWorkspaceBackup(fresh, saved)
  expect(merged.characters.map((c) => c.characterId)).toEqual(['1102', '1103'])
  expect(merged.characters[0].review.displayName).toBe('직접 검수')
  expect(
    sameRoster(
      merged,
      fresh.characters.map((c) => c.workspace.source.target),
    ),
  ).toBe(true)
})
it('직렬화할 수 없는 저장 요청 실패는 기존 저장본을 보존한다', async () => {
  const saved: SavedReview = {
    version: 1,
    mode: 'workspace',
    activeId: '1102',
    file: backup(),
  }
  await writeSavedReview(saved)
  const broken = { ...saved, unexpected: () => {} }
  await expect(writeSavedReview(broken)).rejects.toThrow()
  expect(await readSavedReview()).toEqual(saved)
})

it('누락 초상화만 복구된 실행은 검수값과 순서를 보존하고 새 원본으로 연결한다', () => {
  const saved = backup()
  saved.characters[0].review.displayName = '직접 검수'
  saved.characters[0].review.cardOrder = []
  const fresh = structuredClone(saved)
  const next = fresh.characters[0]
  next.review.runId = next.workspace.source.target.runId = 'repaired-run'
  next.review.draftHash = next.workspace.source.draftHash = 'repaired-hash'
  next.workspace.source.draft.candidates.push({
    candidateId: 'portrait',
    kind: 'portrait',
    resourcePath: '/Game/portrait.webp',
    url: 'https://example.test/portrait.webp',
    asset: 'assets/portrait.webp',
    sources: [],
    review: { displayName: null, visible: null },
    download: {
      status: 'verified',
      width: 256,
      height: 256,
      sha256: 'image-hash',
    },
  })
  expect(sameRoster(saved, [next.workspace.source.target])).toBe(false)
  const merged = mergeWorkspaceBackup(fresh, saved).characters[0]
  expect(merged.review).toEqual({
    ...saved.characters[0].review,
    runId: 'repaired-run',
    draftHash: 'repaired-hash',
  })
  expect(merged.workspace.source.draft.candidates).toHaveLength(1)
  next.workspace.source.currentHash = 'db-changed'
  expect(mergeWorkspaceBackup(fresh, saved).characters[0]).toBe(
    saved.characters[0],
  )
  next.workspace.source.currentHash = null
  next.workspace.source.draft.candidates.push({
    ...next.workspace.source.draft.candidates[0],
    kind: 'skill',
    candidateId: 'new-skill',
  })
  expect(mergeWorkspaceBackup(fresh, saved).characters[0]).toBe(
    saved.characters[0],
  )
})
