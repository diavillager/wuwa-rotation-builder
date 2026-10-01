import { ReviewRepository } from './repository'
import { workspaceTargets } from './workspace'
import type { ReviewBackup } from './storage'

/** 이전 Import 메모리와 분리된 수집 원본으로 전체 초기값을 준비한다. */
export async function prepareWorkspaceReset(root: string) {
  const targets = await workspaceTargets(root)
  if (!targets.length) throw new Error('초기화할 수집 대상이 없습니다.')
  const fresh = new ReviewRepository(root)
  const characters: ReviewBackup['characters'] = []
  for (const target of targets) {
    const session = await fresh.load(target)
    if (session.conflict) throw new Error(session.conflict)
    characters.push(await fresh.backupCharacter(session.state))
  }
  const file: ReviewBackup = {
    format: 'wuwa-character-review-backup',
    schemaVersion: 2,
    characters,
  }
  return file
}
