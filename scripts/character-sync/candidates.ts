import { createHash } from 'node:crypto'
import { ELEMENTS, type Element } from '../../src/app/catalog'

export const sha256 = (value: string | Uint8Array) =>
  createHash('sha256').update(value).digest('hex')
export const ENCORE_API = 'https://api-v2.encore.moe/api/ko'
export const RESOURCE_BASE = 'https://api-v2.encore.moe/resource/Data'
export const WW_REPO = 'https://github.com/Arikatsu/WutheringWaves_Data.git'
export const WW_FILES = {
  roles: 'BinData/role/roleinfo.json',
  skills: 'BinData/skill/skill.json',
  buttons: 'BinData/skillButton/skillbutton.json',
  icons: 'BinData/skillButton/skillicon.json',
} as const
export type WwData = Record<keyof typeof WW_FILES, unknown>
export interface SourceEvidence {
  source: 'encore' | 'ww-data' | 'ww-asset'
  document: string
  recordId: string
  field: string
  originalPath: string
  candidateName?: string
}
export interface Candidate {
  candidateId: string
  kind: 'portrait' | 'skill'
  resourcePath: string
  url: string
  asset: string
  sources: SourceEvidence[]
  review: { displayName: null; visible: null }
}
export interface BasicCandidate {
  characterId: string
  displayName: string
  attribute: Element
  portrait: string
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('예상한 JSON 객체가 아닙니다.')
  return value as Record<string, unknown>
}
export function rows(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) throw new Error('예상한 JSON 목록이 아닙니다.')
  return value.map(object)
}
export function sourceId(value: unknown): string {
  if (
    (typeof value !== 'number' && typeof value !== 'string') ||
    !/^\d+$/.test(String(value))
  )
    throw new Error('소스 ID가 유효하지 않습니다.')
  return String(value)
}
export function nonempty(value: unknown): string {
  if (typeof value !== 'string' || !value.trim())
    throw new Error('필수 소스 문자열이 없습니다.')
  return value
}
function korean(value: unknown): string {
  const name = nonempty(value)
  if (!/[가-힣]/.test(name)) throw new Error('한국어 후보 이름이 없습니다.')
  return name
}
function attribute(value: unknown): Element {
  if (!ELEMENTS.includes(value as Element))
    throw new Error('지원하지 않는 속성입니다.')
  return value as Element
}

/** Unreal 객체 suffix·기존 Encore URL을 같은 자산 경로로 정규화한다. 의미 추론은 하지 않는다. */
export function resourcePath(value: string): string {
  let path = value
  if (path.startsWith('https://')) {
    const url = new URL(path)
    if (
      !['api.encore.moe', 'api-v2.encore.moe'].includes(url.hostname) ||
      url.port ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error('지원하지 않는 자산 URL입니다.')
    path = decodeURIComponent(url.pathname).replace(/^\/resource\/Data/, '')
  }
  if (!/^\/Game\/[A-Za-z0-9_/.-]+$/.test(path) || path.includes('..'))
    throw new Error('지원하지 않는 게임 자산 경로입니다.')
  path = path.replace(/\.webp$/, '')
  const dot = path.lastIndexOf('.')
  if (dot > path.lastIndexOf('/')) {
    const file = path.slice(path.lastIndexOf('/') + 1, dot)
    if (path.slice(dot + 1) !== file)
      throw new Error('지원하지 않는 자산 객체 suffix입니다.')
    path = path.slice(0, dot)
  }
  return `${path}.webp`
}
export function parseList(value: unknown): BasicCandidate[] {
  const list = rows(object(value).roleList).map((row) => ({
    characterId: sourceId(row.Id),
    displayName: korean(row.Name),
    attribute: attribute(object(row.Element).Name),
    portrait: resourcePath(nonempty(row.RoleHeadIcon)),
  }))
  if (new Set(list.map((r) => r.characterId)).size !== list.length)
    throw new Error('Encore 목록의 ID가 중복됩니다.')
  if (!list.length) throw new Error('Encore 목록이 비어 있습니다.')
  return list
}
export function parseDetail(value: unknown, id: string): BasicCandidate {
  const row = object(value)
  if (sourceId(row.Id) !== id)
    throw new Error('요청 ID와 상세 응답 ID가 다릅니다.')
  return {
    characterId: id,
    displayName: korean(object(row.Name).Content),
    attribute: attribute(row.ElementName),
    portrait: resourcePath(nonempty(row.RoleHeadIconLarge)),
  }
}
export function mergeCandidates(...groups: Candidate[][]): Candidate[] {
  const merged = new Map<string, Candidate>()
  for (const candidate of groups.flat()) {
    const previous = merged.get(candidate.candidateId)
    if (!previous) merged.set(candidate.candidateId, structuredClone(candidate))
    else {
      if (
        previous.resourcePath !== candidate.resourcePath ||
        previous.kind !== candidate.kind
      )
        throw new Error('후보 ID 충돌')
      for (const source of candidate.sources)
        if (
          !previous.sources.some(
            (s) => JSON.stringify(s) === JSON.stringify(source),
          )
        )
          previous.sources.push(source)
    }
  }
  return [...merged.values()].sort((a, b) =>
    a.candidateId.localeCompare(b.candidateId),
  )
}
function candidate(
  kind: Candidate['kind'],
  raw: string,
  evidence: Omit<SourceEvidence, 'originalPath'>,
): Candidate {
  const path = resourcePath(raw)
  const hash = sha256(`${kind}:${path}`)
  return {
    candidateId: `candidate-${hash}`,
    kind,
    resourcePath: path,
    url: `${RESOURCE_BASE}${path}`,
    asset: `assets/${hash}.webp`,
    sources: [{ ...evidence, originalPath: raw }],
    review: { displayName: null, visible: null },
  }
}
export function encoreCandidates(value: unknown, id: string): Candidate[] {
  const row = object(value)
  parseDetail(value, id)
  const document = `${ENCORE_API}/character/${id}`
  const result = [
    candidate('portrait', nonempty(row.RoleHeadIconLarge), {
      source: 'encore',
      document,
      recordId: id,
      field: 'RoleHeadIconLarge',
    }),
  ]
  for (const skill of rows(row.Skills))
    result.push(
      candidate('skill', nonempty(skill.Icon), {
        source: 'encore',
        document,
        recordId: sourceId(skill.SkillId),
        field: 'Icon',
        ...(typeof skill.SkillName === 'string'
          ? { candidateName: skill.SkillName }
          : {}),
      }),
    )
  if (result.length === 1) throw new Error('Encore 스킬 후보가 비어 있습니다.')
  return mergeCandidates(result)
}
export function wwCandidates(
  value: WwData,
  id: string,
  ref: string,
  encore: Candidate[],
): Candidate[] {
  const role = rows(value.roles).find((r) => String(r.Id) === id)
  if (!role) throw new Error(`WW_Data에 공명자 ${id}가 없습니다.`)
  const groupId = sourceId(role.SkillId)
  const skills = rows(value.skills).filter(
    (s) => String(s.SkillGroupId) === groupId,
  )
  if (!skills.length) throw new Error('WW_Data 스킬 그룹이 비어 있습니다.')
  const document = (key: keyof WwData) =>
    `https://raw.githubusercontent.com/Arikatsu/WutheringWaves_Data/${ref}/${WW_FILES[key]}`
  const result = skills.map((skill) =>
    candidate('skill', nonempty(skill.Icon), {
      source: 'ww-data',
      document: document('skills'),
      recordId: sourceId(skill.Id),
      field: 'Icon',
      ...(typeof skill.SkillName === 'string'
        ? { candidateName: skill.SkillName }
        : {}),
    }),
  )
  const tags = new Set<number>()
  for (const button of rows(value.buttons).filter(
    (r) => String(r.RoleId) === id,
  )) {
    if (
      !Array.isArray(button.SkillIconTags) ||
      button.SkillIconTags.some((t) => typeof t !== 'number')
    )
      throw new Error('WW_Data SkillIconTags 형식이 변경되었습니다.')
    button.SkillIconTags.forEach((t: number) => tags.add(t))
  }
  const folders = new Set(
    [...encore, ...result]
      .filter((c) => c.kind === 'skill')
      .map((c) => c.resourcePath.slice(0, c.resourcePath.lastIndexOf('/')))
      .filter((p) => !p.endsWith('/SkillIconNor')),
  )
  for (const icon of rows(value.icons)) {
    const raw = nonempty(icon.IconPath)
    const path = resourcePath(raw)
    const tagMatch = typeof icon.Tag === 'number' && tags.has(icon.Tag)
    if (tagMatch || folders.has(path.slice(0, path.lastIndexOf('/'))))
      result.push(
        candidate('skill', raw, {
          source: 'ww-data',
          document: document('icons'),
          recordId: sourceId(icon.Id),
          field: tagMatch
            ? 'IconPath (RoleId/SkillIconTags)'
            : 'IconPath (전용 폴더 후보)',
          ...(typeof icon.Name === 'string'
            ? { candidateName: icon.Name }
            : {}),
        }),
      )
  }
  return mergeCandidates(result)
}
