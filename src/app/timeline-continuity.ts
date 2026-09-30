import type { TimelineColumn, Transition } from '../domain/rotation'

/** 인접 열의 흐름선은 실제 경계의 교체 관계만 따른다. */
export function hasFlowConnection(
  from: TimelineColumn,
  to: TimelineColumn,
  transitions: readonly Transition[],
): boolean {
  let ownerId = from.ownerId
  for (const transition of transitions.filter(
    (item) => item.afterColumnId === from.id,
  )) {
    if (transition.fromId !== ownerId) return false
    ownerId = transition.toId
  }
  return ownerId === to.ownerId
}
