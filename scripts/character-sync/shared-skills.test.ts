import { expect, it } from 'vitest'
import { resolveSharedSkills, sharedSkillDonor } from './shared-skills'

const female = {
  Id: 1502,
  SkillId: 1501,
  SkillTreeGroupId: 1501,
  ElementName: '회절',
  RoleHeadIconLarge: 'female.webp',
  Skills: [],
}
const male = {
  ...female,
  Id: 1501,
  RoleHeadIconLarge: 'male.webp',
  Skills: [{ SkillId: 1000601, SkillName: '기본 공격 이름' }],
}
it('여성 ID와 초상화를 유지하고 명시된 공유 스킬만 보완한다', () => {
  expect(sharedSkillDonor(female)).toBe('1501')
  const resolved = resolveSharedSkills(female, male)
  expect(resolved).toEqual({ ...female, Skills: male.Skills })
  expect(female.Skills).toEqual([])
})
it('기존 스킬이 있으면 유지하고 다른 공명자에게 적용하지 않는다', () => {
  expect(sharedSkillDonor({ ...female, Id: 1503 })).toBeNull()
  const own = { ...female, Skills: [{ SkillId: 99 }] }
  expect(resolveSharedSkills(own, male)).toBe(own)
})
it('출처 ID·공유 그룹·속성 불일치 또는 빈 출처를 거부한다', () => {
  for (const change of [
    { Id: 1503 },
    { SkillId: 999 },
    { SkillTreeGroupId: 999 },
    { ElementName: '인멸' },
    { Skills: [] },
  ]) {
    expect(() => resolveSharedSkills(female, { ...male, ...change })).toThrow(
      '공유 스킬',
    )
  }
  expect(() => resolveSharedSkills({ ...female, SkillId: 999 }, male)).toThrow(
    '공유 스킬',
  )
})
