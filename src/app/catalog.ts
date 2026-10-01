import type { CharacterId } from '../domain/rotation'

export const ELEMENTS = [
  '응결',
  '용융',
  '전도',
  '기류',
  '회절',
  '인멸',
] as const

export type Element = (typeof ELEMENTS)[number]

export interface CatalogSkill {
  id: string
  displayName: string
  /** 저장 snapshot에는 안정적인 asset ID만 넣고 배포별 URL은 저장하지 않는다. */
  asset?: string
  assetUrl?: string
  visible?: boolean
}

export interface CatalogCharacter {
  id: CharacterId
  displayName: string
  element: Element
  asset?: string
  assetUrl?: string
  skills: readonly CatalogSkill[]
  /** 사람이 명시적으로 지정한 자동 행동 Skill ID. 일반 입력과 자동 연결하지 않는다. */
  autoActions?: Partial<
    Record<'normalSwitchAttack' | 'intro' | 'outro', string>
  >
}

/** 화면 표시용 검수 데이터. Rotation의 내용이나 자동 행동을 생성하지 않는다. */
export interface CharacterCatalog {
  characters: readonly CatalogCharacter[]
}

export const emptyCatalog: CharacterCatalog = { characters: [] }

export function charactersByElement(
  catalog: CharacterCatalog,
  element: Element,
): readonly CatalogCharacter[] {
  return catalog.characters.filter((character) => character.element === element)
}

export function characterName(
  catalog: CharacterCatalog,
  id: CharacterId,
): string {
  return (
    catalog.characters.find((item) => item.id === id)?.displayName ??
    (id.startsWith('slot-') ? '공명자 미지정' : `알 수 없는 공명자 (${id})`)
  )
}

export function skillName(catalog: CharacterCatalog, skillRef: string): string {
  for (const character of catalog.characters) {
    const skill = character.skills.find((item) => item.id === skillRef)
    if (skill) return skill.displayName
  }
  return `알 수 없는 스킬 (${skillRef})`
}
