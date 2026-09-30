import type { CycleId, Rotation } from '../domain/rotation'

export type DeletionTarget =
  | { kind: 'input'; cycleId: CycleId; actionId: string }
  | { kind: 'auto'; cycleId: CycleId; actionId: string }
  | { kind: 'skill'; cycleId: CycleId; actionId: string; skillId: string }

/** 매 삭제 시점의 실제 커서 위치를 검사해 레이아웃 이동 후에도 새 대상을 찾는다. */
export function deletionTargetAt(
  doc: Document,
  point: { x: number; y: number } | null,
): DeletionTarget | null {
  if (!point) return null
  const element = doc.elementFromPoint(point.x, point.y)
  const card = element?.closest<HTMLElement>('[data-action-id]')
  const cycleId = card?.closest<HTMLElement>('[data-capture-cycle]')?.dataset
    .captureCycle
  if (
    !card?.dataset.actionId ||
    (cycleId !== 'opening' && cycleId !== 'repeat')
  )
    return null
  const actionId = card.dataset.actionId
  if (card.classList.contains('auto-card'))
    return { kind: 'auto', cycleId, actionId }
  const skillId =
    element?.closest<HTMLElement>('[data-skill-id]')?.dataset.skillId
  if (skillId && Number(card.dataset.skillCount) > 1)
    return { kind: 'skill', cycleId, actionId, skillId }
  return { kind: 'input', cycleId, actionId }
}

export function canDropInput(
  rotation: Rotation,
  source: { cycleId: CycleId; columnId: string } | null,
  targetCycleId: CycleId,
  targetOwnerId: string,
): boolean {
  if (!source || source.cycleId !== targetCycleId) return false
  const column = rotation[source.cycleId].columns.find(
    (item) => item.id === source.columnId,
  )
  return column?.action.type === 'input' && column.ownerId === targetOwnerId
}

export function stageChangeFromWheel(deltaY: number): -1 | 0 | 1 {
  return deltaY === 0 ? 0 : deltaY < 0 ? 1 : -1
}
