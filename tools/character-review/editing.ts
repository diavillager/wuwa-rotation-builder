import {
  AUTO_CATEGORIES,
  isSkillCategory,
} from '../../src/data/characters/categories'
import {
  AUTO_KINDS,
  candidateSkillId,
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
