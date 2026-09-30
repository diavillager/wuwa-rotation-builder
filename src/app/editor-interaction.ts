import type { CycleId, Rotation } from '../domain/rotation'

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
