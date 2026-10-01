import {
  object,
  rows,
  resourcePath,
} from '../../scripts/character-sync/candidates'
import { isSkillCategory } from '../../src/data/characters/categories'
import type { ReviewDraft, ReviewSource } from './model'

/** 원본에 명시된 의미와 정확한 자산 경로만 대응한다. 모호한 의미는 배정하지 않는다. */
export function matchEncore(value: unknown, draft: ReviewDraft) {
  const data = object(value)
  if (String(data.Id) !== draft.characterId)
    throw new Error('Encore 원본의 공명자 ID가 다릅니다.')
  const skills = rows(data.Skills)
  const matches: NonNullable<ReviewSource['encoreMatches']> = {}
  const errors: string[] = []
  for (const candidate of draft.candidates.filter((c) => c.kind === 'skill')) {
    const matching = skills.filter(
      (s) =>
        typeof s.Icon === 'string' &&
        resourcePath(s.Icon) === candidate.resourcePath,
    )
    if (!matching.length) continue
    const unique = new Map(
      matching.map((s) => [
        JSON.stringify([s.SkillId, s.SkillType, s.SkillName]),
        s,
      ]),
    )
    if (unique.size !== 1) {
      errors.push(
        `아이콘에 여러 Encore 스킬이 대응합니다: ${candidate.candidateId}`,
      )
      continue
    }
    const s = [...unique.values()][0]
    if (
      !isSkillCategory(s.SkillType) ||
      typeof s.SkillName !== 'string' ||
      !s.SkillName.trim() ||
      !/^\d+$/.test(String(s.SkillId))
    ) {
      errors.push(
        `Encore 분류·이름을 확인할 수 없습니다: ${candidate.candidateId}`,
      )
      continue
    }
    matches[candidate.candidateId] = {
      category: s.SkillType,
      displayName: s.SkillName,
      skillId: String(s.SkillId),
    }
  }
  return { encoreMatches: matches, encoreErrors: errors }
}
