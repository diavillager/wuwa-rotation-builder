import type {
  Cycle,
  Rotation,
  TimelineColumn,
  Transition,
} from '../domain/rotation'

export interface EditorColumn {
  id: string
  ownerId: string
  action: TimelineColumn['action']
  width: number
}

export interface EditorBoundary {
  index: number
  transitions: Transition[]
}

export interface EditorCycle {
  columns: EditorColumn[]
  boundaries: EditorBoundary[]
  party: Rotation['party']
  activeCharacterId: string
}

/** 세 라인은 하나의 columns 배열과 같은 grid track을 공유한다. */
export function projectCycle(rotation: Rotation, cycle: Cycle): EditorCycle {
  const columns = cycle.columns.map((column) => ({
    id: column.id,
    ownerId: column.ownerId,
    action: column.action,
    width:
      column.action.type === 'input'
        ? Math.max(150, 115 + column.action.skills.length * 88)
        : 164,
  }))
  const boundaries = Array.from({ length: columns.length + 1 }, (_, index) => ({
    index,
    transitions: cycle.transitions.filter(
      (transition) =>
        (transition.afterColumnId === null
          ? 0
          : columns.findIndex(
              (column) => column.id === transition.afterColumnId,
            ) + 1) === index,
    ),
  }))
  return {
    columns,
    boundaries,
    party: rotation.party,
    activeCharacterId: cycle.activeCharacterId,
  }
}
