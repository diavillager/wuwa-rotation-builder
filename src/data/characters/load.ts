import type { CharacterCatalog, CatalogCharacter } from '../../app/catalog'
import { validateCharacterData, type CharacterData } from './contract'

export interface CharacterRecord {
  path: string
  data: unknown
}
export interface CharacterDataIssue {
  path: string
  characterId: string
  message: string
}
export interface CharacterCatalogResult {
  catalog: CharacterCatalog
  issues: CharacterDataIssue[]
}

export const characterAssetId = (id: string, relativePath: string) =>
  `characters/${id}/${relativePath}`

/** JSON 검증과 실제 이미지 검증을 모두 통과한 공명자만 catalog에 연결한다. */
export async function loadCharacterCatalog(
  records: CharacterRecord[],
  assets: Readonly<Record<string, string>>,
  verifyAsset: (url: string) => Promise<void>,
): Promise<CharacterCatalogResult> {
  const issues: CharacterDataIssue[] = []
  const valid: { path: string; data: CharacterData }[] = []
  for (const entry of records) {
    const match = /^characters\/([^/]+)\/data\/([^/]+)\.json$/.exec(entry.path)
    const id = match?.[1] ?? '알 수 없음'
    try {
      if (!match || match[1] !== match[2])
        throw new Error(
          'Character JSON 경로와 파일명이 ID에 일치하지 않습니다.',
        )
      const data: unknown =
        typeof entry.data === 'string' ? JSON.parse(entry.data) : entry.data
      valid.push({ path: entry.path, data: validateCharacterData(data, id) })
    } catch (error) {
      issues.push({
        path: entry.path,
        characterId: id,
        message: error instanceof Error ? error.message : '데이터 검증 실패',
      })
    }
  }
  // 공개 참조 ID의 충돌은 순서에 따라 하나를 임의로 선택하지 않고 관련 공명자를 모두 제외한다.
  const characterCounts = new Map<string, number>()
  const skillOwners = new Map<string, Set<string>>()
  for (const { data } of valid) {
    characterCounts.set(
      data.characterId,
      (characterCounts.get(data.characterId) ?? 0) + 1,
    )
    for (const skill of data.skills) {
      const owners = skillOwners.get(skill.skillId) ?? new Set<string>()
      owners.add(data.characterId)
      skillOwners.set(skill.skillId, owners)
    }
  }
  const verified = new Map<string, Promise<void>>()
  const characters: CatalogCharacter[] = []
  for (const { path, data } of valid) {
    try {
      if (
        characterCounts.get(data.characterId)! > 1 ||
        data.skills.some((skill) => skillOwners.get(skill.skillId)!.size > 1)
      )
        throw new Error('공명자 또는 공개 스킬 ID가 다른 레코드와 충돌합니다.')
      const visible = data.skills.filter((skill) => skill.visible)
      for (const relative of new Set([
        data.portrait,
        ...visible.map((skill) => skill.asset),
      ])) {
        const id = characterAssetId(data.characterId, relative)
        const url = assets[id]
        if (!url) throw new Error(`자산이 없습니다: ${relative}`)
        let check = verified.get(url)
        if (!check) {
          check = verifyAsset(url)
          verified.set(url, check)
        }
        await check
      }
      const portrait = characterAssetId(data.characterId, data.portrait)
      characters.push({
        id: data.characterId,
        displayName: data.displayName,
        element: data.attribute,
        asset: portrait,
        assetUrl: assets[portrait],
        autoActions: data.autoActions,
        // 비노출된 기존 ID도 이름 조회·snapshot을 위해 보존한다.
        skills: data.skills
          .filter((skill) => skill.displayName.trim())
          .map((skill) => ({
            id: skill.skillId,
            displayName: skill.displayName,
            ...(skill.category ? { category: skill.category } : {}),
            visible: skill.visible,
            asset: characterAssetId(data.characterId, skill.asset),
            assetUrl: visible.some((item) => item.asset === skill.asset)
              ? assets[characterAssetId(data.characterId, skill.asset)]
              : undefined,
          })),
      })
    } catch (error) {
      issues.push({
        path,
        characterId: data.characterId,
        message: error instanceof Error ? error.message : '이미지 검증 실패',
      })
    }
  }
  return { catalog: { characters }, issues }
}
