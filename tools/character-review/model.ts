import type { CharacterData } from '../../src/data/characters/contract'
import type { Element } from '../../src/app/catalog'
import type { WeaponType } from '../../src/data/characters/weapons'
import type { DownloadedCandidate } from '../../scripts/character-sync/run'
import type { SkillCategory } from '../../src/data/characters/categories'
export const TOOLTIP_CATEGORIES = [
  '기본 공격',
  '공명 스킬',
  '공명 해방',
  '공명 회로',
  '변주 스킬',
  '반주 스킬',
] as const

export interface SkillTooltip {
  category: (typeof TOOLTIP_CATEGORIES)[number]
  skillId: string
  displayName: string
  description: string
}

export interface ReviewTarget {
  runId: string
  characterId: string
  displayName: string
}
export interface ReviewDraft {
  schemaVersion: 1
  characterId: string
  basicCandidate: {
    displayName: string
    attribute: Element
    weaponType?: WeaponType
  }
  candidates: DownloadedCandidate[]
  errors: string[]
}
export interface ReviewSource {
  encoreSkillSourceId?: string
  encoreTooltips?: SkillTooltip[]
  encoreMatches?: Record<
    string,
    { category: SkillCategory; displayName: string; skillId: string }
  >
  encoreErrors?: string[]
  target: ReviewTarget
  draft: ReviewDraft
  draftHash: string
  current: CharacterData | null
  currentHash: string | null
  currentError: string | null
}
export const AUTO_KINDS = ['normalSwitchAttack', 'intro', 'outro'] as const
export const AUTO_LABELS = {
  normalSwitchAttack: '일반 교체 공격',
  intro: '변주',
  outro: '반주',
}

export interface ReviewState {
  registration?: 'pending' | 'include' | 'exclude'
  weaponType?: WeaponType | null
  schemaVersion: 1
  runId: string
  characterId: string
  draftHash: string
  baseHash: string | null
  displayName: string
  attribute: Element
  portraitCandidateId: string | null
  cardOrder?: string[]
  existingSkills: {
    hitCount?: number
    category?: SkillCategory
    skillId: string
    displayName: string
    visible: boolean
    decision?: 'pending' | 'include' | 'exclude'
    candidateId: string | null
  }[]
  candidates: {
    hitCount?: number
    category?: SkillCategory
    candidateId: string
    displayName: string
    decision: 'pending' | 'include' | 'exclude'
  }[]
  autoActions: Record<(typeof AUTO_KINDS)[number], string | null>
}
export interface ReviewSession {
  source: ReviewSource
  state: ReviewState
  revision: string | null
  conflict: string | null
}
export interface ReviewValidation {
  errors: string[]
  summary: string[]
  token: string | null
}
export const candidateSkillId = (characterId: string, candidateId: string) =>
  `${characterId}:skill:${candidateId.replace('candidate-', '')}`
export function defaultPortrait(source: ReviewSource) {
  return (
    source.draft.candidates.find(
      (c) => c.kind === 'portrait' && c.download.status === 'verified',
    )?.candidateId ?? null
  )
}
export function initialReview(source: ReviewSource): ReviewState {
  const current = source.current
  return {
    registration: 'pending',
    schemaVersion: 1,
    runId: source.target.runId,
    characterId: source.target.characterId,
    draftHash: source.draftHash,
    baseHash: source.currentHash,
    displayName:
      current?.displayName ?? source.draft.basicCandidate.displayName,
    attribute: current?.attribute ?? source.draft.basicCandidate.attribute,
    ...((current?.weaponType ?? source.draft.basicCandidate.weaponType)
      ? {
          weaponType:
            current?.weaponType ?? source.draft.basicCandidate.weaponType,
        }
      : {}),
    portraitCandidateId: defaultPortrait(source),
    existingSkills:
      current?.skills.map((s) => ({
        skillId: s.skillId,
        ...(s.category ? { category: s.category } : {}),
        ...(s.hitCount !== undefined ? { hitCount: s.hitCount } : {}),
        displayName: s.displayName,
        visible: s.visible,
        candidateId: null,
      })) ?? [],
    candidates: source.draft.candidates
      .filter((c) => c.kind === 'skill')
      .map((c) => ({
        candidateId: c.candidateId,
        displayName: '',
        decision: current?.skills.some(
          (s) =>
            s.skillId ===
            candidateSkillId(source.target.characterId, c.candidateId),
        )
          ? 'exclude'
          : 'pending',
      })),
    autoActions: current
      ? { ...current.autoActions }
      : { normalSwitchAttack: null, intro: null, outro: null },
  }
}
export function selectableSkills(state: ReviewState) {
  const name = (s: { displayName: string; hitCount?: number }) =>
    `${s.displayName}${s.hitCount ? ` · ${s.hitCount}타` : ''}`
  return [
    ...state.existingSkills
      .filter((s) => s.visible)
      .map((s) => ({ id: s.skillId, name: name(s) })),
    ...state.candidates
      .filter((c) => c.decision === 'include')
      .map((c) => ({
        id: candidateSkillId(state.characterId, c.candidateId),
        name: name(c),
      })),
  ]
}

export function reviewCards(state: ReviewState, source: ReviewSource) {
  const linked = new Set<string>()
  const existing = state.existingSkills.map((skill, index) => {
    const candidate = source.draft.candidates.find(
      (c) =>
        c.kind === 'skill' &&
        (c.candidateId === skill.candidateId ||
          (!skill.candidateId &&
            candidateSkillId(state.characterId, c.candidateId) ===
              skill.skillId)),
    )
    if (candidate) linked.add(candidate.candidateId)
    return {
      key: skill.skillId,
      group: 'existingSkills' as const,
      index,
      candidate,
    }
  })
  const fresh = state.candidates.flatMap((c, index) =>
    linked.has(c.candidateId)
      ? []
      : [
          {
            key: c.candidateId,
            group: 'candidates' as const,
            index,
            candidate: source.draft.candidates.find(
              (item) => item.candidateId === c.candidateId,
            ),
          },
        ],
  )
  const cards = [...existing, ...fresh]
  const order = state.cardOrder ?? cards.map((c) => c.key)
  return cards.sort((a, b) => {
    const index = (key: string) => {
      const i = order.indexOf(key)
      return i < 0 ? order.length : i
    }
    return index(a.key) - index(b.key)
  })
}
