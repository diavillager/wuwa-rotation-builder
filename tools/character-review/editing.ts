import {
  AUTO_CATEGORIES,
  SKILL_CATEGORIES,
  isSkillCategory,
} from '../../src/data/characters/categories'
import {
  AUTO_KINDS,
  candidateSkillId,
  reviewCards,
  type ReviewSource,
  type ReviewState,
} from './model'

export function linkCategorizedActions(state: ReviewState): ReviewState {
  const all = [
    ...state.existingSkills.map((s) => ({ ...s, id: s.skillId })),
    ...state.candidates.map((c) => ({
      ...c,
      id: candidateSkillId(state.characterId, c.candidateId),
      visible: c.decision === 'include',
    })),
  ]
  if (!all.some((s) => s.category)) return state
  const autoActions = { ...state.autoActions }
  for (const kind of AUTO_KINDS) {
    const matches = all.filter(
      (s) => s.visible && s.category === AUTO_CATEGORIES[kind],
    )
    autoActions[kind] = matches.length === 1 ? matches[0].id : null
  }
  return { ...state, autoActions }
}
export function assignEncore(
  state: ReviewState,
  source: ReviewSource,
): ReviewState {
  const next = structuredClone(state)
  for (const [id, match] of Object.entries(source.encoreMatches ?? {})) {
    if (
      source.draft.candidates.find((c) => c.candidateId === id)?.download
        .status !== 'verified'
    )
      continue
    const old = next.existingSkills.filter(
      (s) =>
        s.candidateId === id ||
        (!s.candidateId &&
          s.skillId === candidateSkillId(state.characterId, id)),
    )
    for (const skill of old) {
      skill.category ??= match.category
      if (!skill.displayName.trim() || isSkillCategory(skill.displayName))
        skill.displayName = match.displayName
    }
    const candidate = next.candidates.find((c) => c.candidateId === id)
    if (!candidate) continue
    candidate.category ??= match.category
    if (!candidate.displayName.trim() || isSkillCategory(candidate.displayName))
      candidate.displayName = match.displayName
    if (!old.length && candidate.decision === 'pending')
      candidate.decision =
        match.category === '고유 스킬' ? 'exclude' : 'include'
  }
  // 현재 표시 순서를 기준으로 안정 정렬하여 같은 분류의 수동 배치를 보존한다.
  const categoryRank = (card: ReturnType<typeof reviewCards>[number]) => {
    const category = next[card.group][card.index].category
    return category ? SKILL_CATEGORIES.indexOf(category) + 1 : 0
  }
  next.cardOrder = reviewCards(next, source)
    .sort((a, b) => categoryRank(a) - categoryRank(b))
    .map((card) => card.key)
  return linkCategorizedActions(next)
}

export function moveReviewCard(
  state: ReviewState,
  group: 'existingSkills' | 'candidates',
  from: number,
  to: number,
): ReviewState {
  const items = [...state[group]]
  if (
    from < 0 ||
    to < 0 ||
    from >= items.length ||
    to >= items.length ||
    from === to
  )
    return state
  const [item] = items.splice(from, 1)
  items.splice(to, 0, item)
  return { ...state, [group]: items }
}

export interface AssignmentReceipt {
  before: ReviewState
  after: ReviewState
  manual: string[]
}
export const reviewFieldKey = (
  group: 'candidates' | 'existingSkills',
  id: string,
  field: string,
) => `${group}:${id}:${field}`

/** 자동으로 바뀐 필드만 복원한다. 직접 편집한 필드와 배열 순서는 유지한다. */
export function undoEncore(
  state: ReviewState,
  receipt: AssignmentReceipt,
): ReviewState {
  const next = structuredClone(state)
  for (const group of ['candidates', 'existingSkills'] as const) {
    const idOf = (
      item:
        | ReviewState['candidates'][number]
        | ReviewState['existingSkills'][number],
    ) => ('skillId' in item ? item.skillId : item.candidateId)
    for (const item of next[group]) {
      const id = idOf(item)
      const before = receipt.before[group].find((c) => idOf(c) === id)
      const after = receipt.after[group].find((c) => idOf(c) === id)
      if (!before || !after) continue
      for (const field of ['category', 'displayName', 'decision'] as const) {
        if (receipt.manual.includes(reviewFieldKey(group, id, field))) continue
        const value = item as unknown as Record<string, unknown>
        const previous = before as unknown as Record<string, unknown>
        const assigned = after as unknown as Record<string, unknown>
        if (
          value[field] === assigned[field] &&
          previous[field] !== assigned[field]
        ) {
          if (previous[field] === undefined) delete value[field]
          else value[field] = previous[field]
        }
      }
    }
  }
  for (const kind of AUTO_KINDS) {
    if (
      !receipt.manual.includes(`autoActions:${kind}`) &&
      next.autoActions[kind] === receipt.after.autoActions[kind]
    )
      next.autoActions[kind] = receipt.before.autoActions[kind]
  }
  return linkCategorizedActions(next)
}
