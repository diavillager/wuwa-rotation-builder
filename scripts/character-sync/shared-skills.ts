import { object, rows, sourceId } from './candidates'

/** 사용자가 승인한 회절 여성→남성 방랑자 공유 그룹만 허용한다. */
export function sharedSkillDonor(value: unknown): string | null {
  const role = object(value)
  return String(role.Id) === '1502' && rows(role.Skills).length === 0
    ? '1501'
    : null
}

export function resolveSharedSkills(value: unknown, donor: unknown) {
  const role = object(value)
  if (!sharedSkillDonor(value)) return role
  const other = object(donor)
  if (
    sourceId(other.Id) !== '1501' ||
    [
      role.SkillId,
      role.SkillTreeGroupId,
      other.SkillId,
      other.SkillTreeGroupId,
    ].some((id) => String(id) !== '1501') ||
    role.ElementName !== '회절' ||
    other.ElementName !== '회절' ||
    rows(other.Skills).length === 0
  )
    throw new Error(
      '회절 방랑자 공유 스킬의 ID·그룹·속성을 확인할 수 없습니다.',
    )
  return { ...role, Skills: other.Skills }
}
