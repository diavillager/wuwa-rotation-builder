export const SKILL_CATEGORIES = [
  '기본 공격',
  '공명 스킬',
  '공명 해방',
  '고유 스킬',
  '변주 스킬',
  '반주 스킬',
  '공명 회로',
  '조화도 파괴',
] as const
export type SkillCategory = (typeof SKILL_CATEGORIES)[number]
export const AUTO_CATEGORIES = {
  normalSwitchAttack: '기본 공격',
  intro: '변주 스킬',
  outro: '반주 스킬',
} as const
export const isSkillCategory = (value: unknown): value is SkillCategory =>
  typeof value === 'string' &&
  (SKILL_CATEGORIES as readonly string[]).includes(value)
