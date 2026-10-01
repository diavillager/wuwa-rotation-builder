import { ELEMENTS, type Element } from '../../app/catalog'
import {
  AUTO_CATEGORIES,
  isSkillCategory,
  validHitCount,
  type SkillCategory,
} from './categories'

export interface CharacterSkillData {
  skillId: string
  category?: SkillCategory
  hitCount?: number
  displayName: string
  visible: boolean
  asset: string
}
export interface CharacterData {
  schemaVersion: 1
  reviewStatus: 'approved'
  characterId: string
  displayName: string
  attribute: Element
  portrait: string
  skills: CharacterSkillData[]
  autoActions: Record<'normalSwitchAttack' | 'intro' | 'outro', string>
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('객체 형식이 필요합니다.')
  return value as Record<string, unknown>
}
function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`${label}이 비어 있습니다.`)
  return value
}
function identifier(value: unknown, label: string): string {
  const id = text(value, label)
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(id))
    throw new Error(`${label} 형식이 유효하지 않습니다.`)
  return id
}
function asset(value: unknown): string {
  const path = text(value, '자산 경로')
  if (
    !/^assets\/[A-Za-z0-9][A-Za-z0-9._-]*\.webp$/.test(path) ||
    path.includes('..')
  )
    throw new Error('자산은 해당 공명자의 assets/*.webp 경로여야 합니다.')
  return path
}

/** 후보 초안과 검수 완료 데이터를 분리한다. 이름이나 파일명으로 의미를 추론하지 않는다. */
export function validateCharacterData(
  value: unknown,
  directoryId: string,
): CharacterData {
  const data = record(value)
  if (data.schemaVersion !== 1)
    throw new Error('지원하지 않는 Character schemaVersion입니다.')
  if (data.reviewStatus !== 'approved')
    throw new Error('사람 검수가 완료되지 않았습니다.')
  const characterId = identifier(data.characterId, '공명자 ID')
  if (characterId !== directoryId)
    throw new Error('공명자 ID와 디렉터리 ID가 다릅니다.')
  const displayName = text(data.displayName, '공명자 이름')
  if (!/[가-힣]/.test(displayName))
    throw new Error('공명자의 한국어 표시 이름이 필요합니다.')
  if (!ELEMENTS.includes(data.attribute as Element))
    throw new Error('지원하지 않는 공명자 속성입니다.')
  if (!Array.isArray(data.skills)) throw new Error('스킬 목록이 필요합니다.')
  const ids = new Set<string>()
  const skills = data.skills.map((value) => {
    const skill = record(value)
    const skillId = identifier(skill.skillId, '스킬 ID')
    if (ids.has(skillId)) throw new Error(`스킬 ID가 중복됩니다: ${skillId}`)
    ids.add(skillId)
    if (typeof skill.visible !== 'boolean')
      throw new Error('스킬 노출 여부를 지정해 주세요.')
    if (typeof skill.displayName !== 'string')
      throw new Error('스킬 이름은 문자열이어야 합니다.')
    if (skill.visible) text(skill.displayName, '노출 스킬 이름')
    if (skill.category !== undefined && !isSkillCategory(skill.category))
      throw new Error('지원하지 않는 스킬 분류입니다.')
    if (
      !validHitCount(
        skill.hitCount,
        skill.category as SkillCategory | undefined,
      )
    )
      throw new Error('타수는 지원하는 분류의 0~10 정수여야 합니다.')
    return {
      skillId,
      ...(isSkillCategory(skill.category) ? { category: skill.category } : {}),
      ...(skill.hitCount !== undefined
        ? { hitCount: skill.hitCount as number }
        : {}),
      displayName: skill.displayName,
      visible: skill.visible,
      asset: asset(skill.asset),
    }
  })
  const auto = record(data.autoActions)
  const autoActions = {} as CharacterData['autoActions']
  for (const kind of ['normalSwitchAttack', 'intro', 'outro'] as const) {
    const id = identifier(auto[kind], `${kind} 참조`)
    if (!skills.some((skill) => skill.skillId === id && skill.visible))
      throw new Error(`${kind}는 노출·등록된 스킬 ID를 참조해야 합니다.`)
    if (skills.some((s) => s.category !== undefined)) {
      const matches = skills.filter(
        (s) => s.visible && s.category === AUTO_CATEGORIES[kind],
      )
      if (!matches.some((s) => s.skillId === id))
        throw new Error(
          `${kind}: 노출된 ${AUTO_CATEGORIES[kind]} 중 하나에 연결해야 합니다.`,
        )
    }
    autoActions[kind] = id
  }
  return {
    schemaVersion: 1,
    reviewStatus: 'approved',
    characterId,
    displayName,
    attribute: data.attribute as Element,
    portrait: asset(data.portrait),
    skills,
    autoActions,
  }
}
