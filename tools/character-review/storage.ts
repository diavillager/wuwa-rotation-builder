import type { ReviewState, ReviewTarget } from './model'
import type { ReviewSnapshot } from './snapshot'

export interface ReviewBackup {
  format: 'wuwa-character-review-backup'
  schemaVersion: 2
  characters: {
    characterId: string
    review: ReviewState
    workspace: ReviewSnapshot
  }[]
}
export interface SavedReview {
  version: 1
  mode: 'workspace' | 'import'
  activeId: string
  validatedIds?: string[]
  file: ReviewBackup
}
const DATABASE = 'wuwa-character-review'
const STORE = 'current-review'
const KEY = 'latest'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('이 브라우저에서 검수 저장소를 사용할 수 없습니다.'))
      return
    }
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close()
      resolve(request.result)
    }
    request.onerror = () => reject(request.error)
    request.onblocked = () =>
      reject(new Error('검수 저장소가 다른 탭에 의해 잠겼습니다.'))
  })
}
export async function readSavedReview(): Promise<SavedReview | null> {
  const db = await openDatabase()
  try {
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readonly')
      const request = transaction.objectStore(STORE).get(KEY)
      transaction.oncomplete = () => {
        const value = request.result as SavedReview | undefined
        if (
          value &&
          (value.version !== 1 ||
            !['workspace', 'import'].includes(value.mode) ||
            !value.file)
        )
          reject(new Error('브라우저 검수 저장 형식이 유효하지 않습니다.'))
        else resolve(value ?? null)
      }
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    db.close()
  }
}
export async function writeSavedReview(value: SavedReview): Promise<void> {
  const db = await openDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE, 'readwrite')
      transaction.objectStore(STORE).put(value, KEY)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error)
      transaction.onabort = () => reject(transaction.error)
    })
  } finally {
    db.close()
  }
}
/** 복원 자산은 그대로 두고 최신 편집만 갱신한다. */
export function updateBackup(
  file: ReviewBackup,
  states: ReviewState[],
): ReviewBackup {
  const entries = new Map(
    file.characters.map((entry) => [entry.characterId, entry]),
  )
  return {
    ...file,
    characters: states.map((review) => {
      const entry = entries.get(review.characterId)
      if (
        !entry ||
        entry.review.runId !== review.runId ||
        entry.review.draftHash !== review.draftHash
      )
        throw new Error('자동 저장 원본과 현재 검수 대상이 다릅니다.')
      return { ...entry, review }
    }),
  }
}
export function sameRoster(
  file: ReviewBackup,
  targets: ReviewTarget[],
): boolean {
  return (
    file.characters.length === targets.length &&
    targets.every((target) =>
      file.characters.some(
        (entry) =>
          entry.characterId === target.characterId &&
          entry.review.runId === target.runId,
      ),
    )
  )
}
export function mergeWorkspaceBackup(
  fresh: ReviewBackup,
  saved: ReviewBackup,
): ReviewBackup {
  const previous = new Map(
    saved.characters.map((entry) => [entry.characterId, entry]),
  )
  return {
    ...fresh,
    characters: fresh.characters.map((entry) => {
      const old = previous.get(entry.characterId)
      if (!old) return entry
      // 누락 초상화만 추가된 수집 복구는 기존 검수값을 그대로 이관한다.
      // 스킬 후보/이미지 또는 앱 DB가 달라진 일반 재수집은 자동 적용하지 않는다.
      const before = old.workspace.source
      const after = entry.workspace.source
      const skills = after.draft.candidates.filter((c) => c.kind === 'skill')
      const portraitOnlyRepair =
        !before.draft.candidates.some((c) => c.kind === 'portrait') &&
        after.draft.candidates.some(
          (c) => c.kind === 'portrait' && c.download.status === 'verified',
        ) &&
        before.currentHash === after.currentHash &&
        skills.length === before.draft.candidates.length &&
        before.draft.candidates.every((c) =>
          skills.some((next) => JSON.stringify(c) === JSON.stringify(next)),
        )
      if (!portraitOnlyRepair) return old
      return {
        ...entry,
        review: {
          ...old.review,
          runId: entry.review.runId,
          draftHash: entry.review.draftHash,
        },
      }
    }),
  }
}
