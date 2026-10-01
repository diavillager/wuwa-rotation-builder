import type { CharacterData } from '../../src/data/characters/contract'
import type { Element } from '../../src/app/catalog'
import type { DownloadedCandidate } from '../../scripts/character-sync/run'

export interface ReviewTarget {
  runId: string
  characterId: string
  displayName: string
}
export interface ReviewDraft {
  schemaVersion: 1
  characterId: string
  basicCandidate: { displayName: string; attribute: Element }
  candidates: DownloadedCandidate[]
  errors: string[]
}
export interface ReviewSource {
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
  schemaVersion: 1
  runId: string
  characterId: string
  draftHash: string
  baseHash: string | null
  displayName: string
  attribute: Element
  portraitCandidateId: string | null
  existingSkills: {
    skillId: string
    displayName: string
    visible: boolean
    candidateId: string | null
  }[]
  candidates: {
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
export function initialReview(source: ReviewSource): ReviewState {
  const current = source.current
  return {
    schemaVersion: 1,
    runId: source.target.runId,
    characterId: source.target.characterId,
    draftHash: source.draftHash,
    baseHash: source.currentHash,
    displayName:
      current?.displayName ?? source.draft.basicCandidate.displayName,
    attribute: current?.attribute ?? source.draft.basicCandidate.attribute,
    portraitCandidateId: null,
    existingSkills:
      current?.skills.map((s) => ({
        skillId: s.skillId,
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
  return [
    ...state.existingSkills
      .filter((s) => s.visible)
      .map((s) => ({ id: s.skillId, name: s.displayName })),
    ...state.candidates
      .filter((c) => c.decision === 'include')
      .map((c) => ({
        id: candidateSkillId(state.characterId, c.candidateId),
        name: c.displayName,
      })),
  ]
}
