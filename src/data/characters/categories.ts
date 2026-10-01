export const SKILL_CATEGORIES = [
  '기본 공격',
  '공명 스킬',
  '공명 해방',
  '공명 회로',
  '변주 스킬',
  '반주 스킬',
  '조화도 파괴',
  '고유 스킬',
] as const
export type SkillCategory = (typeof SKILL_CATEGORIES)[number]
export const HIT_CATEGORIES: readonly SkillCategory[] = [
  '기본 공격',
  '공명 스킬',
  '공명 해방',
  '공명 회로',
]
export const supportsHitCount = (category: SkillCategory | undefined) =>
  category !== undefined && HIT_CATEGORIES.includes(category)
export function validHitCount(
  value: unknown,
  category: SkillCategory | undefined,
): boolean {
  return (
    value === undefined ||
    (typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= 0 &&
      value <= 10 &&
      (value === 0 || supportsHitCount(category)))
  )
}
export const AUTO_CATEGORIES = {
  normalSwitchAttack: '기본 공격',
  intro: '변주 스킬',
  outro: '반주 스킬',
} as const
export const isSkillCategory = (value: unknown): value is SkillCategory =>
  typeof value === 'string' &&
  (SKILL_CATEGORIES as readonly string[]).includes(value)
