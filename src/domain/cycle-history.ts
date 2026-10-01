import {
  assertRotation,
  type Cycle,
  type CycleId,
  type Rotation,
} from './rotation'

type CycleContent = Pick<Cycle, 'columns' | 'transitions' | 'suppression'>
export interface CycleHistory {
  past: CycleContent[]
  future: CycleContent[]
}
export interface EditorHistory {
  rotation: Rotation
  histories: Record<CycleId, CycleHistory>
}
const cycleIds: CycleId[] = ['opening', 'repeat']
const emptyHistories = (): EditorHistory['histories'] => ({
  opening: { past: [], future: [] },
  repeat: { past: [], future: [] },
})
const content = (cycle: Cycle): CycleContent => ({
  columns: cycle.columns,
  transitions: cycle.transitions,
  suppression: cycle.suppression,
})
function sameContent(before: Cycle, after: Cycle): boolean {
  return (
    (before.columns === after.columns &&
      before.transitions === after.transitions &&
      before.suppression === after.suppression) ||
    JSON.stringify(content(before)) === JSON.stringify(content(after))
  )
}

export function createEditorHistory(rotation: Rotation): EditorHistory {
  assertRotation(rotation)
  return { rotation, histories: emptyHistories() }
}

/** 변경이 완료된 Rotation을 기록하며 표시만 바뀐 경우에는 이력을 추가하지 않는다. */
export function recordRotationEdit(
  state: EditorHistory,
  next: Rotation,
): EditorHistory {
  if (state.rotation === next) return state
  assertRotation(next)
  if (next.party.some((id) => !state.rotation.party.includes(id)))
    return { rotation: next, histories: emptyHistories() }
  const histories = { ...state.histories }
  for (const id of cycleIds) {
    if (!sameContent(state.rotation[id], next[id]))
      histories[id] = {
        past: [...histories[id].past, content(state.rotation[id])],
        future: [],
      }
  }
  return { rotation: next, histories }
}

function restore(
  state: EditorHistory,
  id: CycleId,
  direction: 'undo' | 'redo',
): EditorHistory {
  const history = state.histories[id]
  const stack = direction === 'undo' ? history.past : history.future
  const snapshot = stack.at(-1)
  if (!snapshot) return state
  const current = state.rotation[id]
  const rotation = { ...state.rotation, [id]: { ...current, ...snapshot } }
  assertRotation(rotation)
  return {
    rotation,
    histories: {
      ...state.histories,
      [id]:
        direction === 'undo'
          ? {
              past: history.past.slice(0, -1),
              future: [...history.future, content(current)],
            }
          : {
              past: [...history.past, content(current)],
              future: history.future.slice(0, -1),
            },
    },
  }
}

export const undoCycle = (state: EditorHistory, id: CycleId): EditorHistory =>
  restore(state, id, 'undo')
export const redoCycle = (state: EditorHistory, id: CycleId): EditorHistory =>
  restore(state, id, 'redo')
