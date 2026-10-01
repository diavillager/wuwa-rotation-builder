import { object, rows } from '../../scripts/character-sync/candidates'

import { TOOLTIP_CATEGORIES, type SkillTooltip } from './model'
export { TOOLTIP_CATEGORIES } from './model'

/** 외부 HTML을 실행하지 않는다. 표는 읽지 않고 본문 글자와 줄바꿈만 보존한다. */
export function tooltipText(html: string): string {
  const entities: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  }
  return html
    .replace(/<(script|style|table)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<br\s*\/?\s*>|<\/(?:p|div|li|h[1-6])\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(
      /&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,
      (entity, key: string) => {
        if (!key.startsWith('#')) return entities[key.toLowerCase()] ?? entity
        const code =
          key[1].toLowerCase() === 'x'
            ? parseInt(key.slice(2), 16)
            : Number(key.slice(1))
        return code > 0 &&
          code <= 0x10ffff &&
          !(code >= 0xd800 && code <= 0xdfff)
          ? String.fromCodePoint(code)
          : '\uFFFD'
      },
    )
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function extractTooltips(value: unknown): SkillTooltip[] {
  const skills = rows(object(value).Skills)
  return TOOLTIP_CATEGORIES.flatMap((category) =>
    skills.flatMap((skill) => {
      if (
        skill.SkillType !== category ||
        !/^\d+$/.test(String(skill.SkillId)) ||
        typeof skill.SkillName !== 'string' ||
        typeof skill.SkillDescribe !== 'string'
      )
        return []
      const description = tooltipText(skill.SkillDescribe)
      return description
        ? [
            {
              category,
              skillId: String(skill.SkillId),
              displayName: skill.SkillName,
              description,
            },
          ]
        : []
    }),
  )
}

export function parseTooltips(value: unknown): SkillTooltip[] {
  if (!Array.isArray(value))
    throw new Error('복원 스킬 툴팁 목록이 유효하지 않습니다.')
  return value.map((entry) => {
    const row = object(entry)
    if (
      !TOOLTIP_CATEGORIES.includes(row.category as never) ||
      typeof row.skillId !== 'string' ||
      !/^\d+$/.test(row.skillId) ||
      typeof row.displayName !== 'string' ||
      typeof row.description !== 'string'
    )
      throw new Error('복원 스킬 툴팁 형식이 유효하지 않습니다.')
    return {
      category: row.category as SkillTooltip['category'],
      skillId: row.skillId,
      displayName: row.displayName,
      description: row.description,
    }
  })
}
