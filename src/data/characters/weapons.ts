export const WEAPON_TYPES = ['대검', '직검', '권총', '권갑', '증폭기'] as const
export type WeaponType = (typeof WEAPON_TYPES)[number]

export function isWeaponType(value: unknown): value is WeaponType {
  return WEAPON_TYPES.includes(value as WeaponType)
}

/** Encore/WW_Data의 명시적 WeaponType ID. 자산 이름으로 추론하지 않는다. */
export function weaponTypeFromId(value: unknown): WeaponType {
  if (
    typeof value !== 'number' ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > 5
  )
    throw new Error('지원하지 않는 무기군 ID입니다.')
  return WEAPON_TYPES[value - 1]
}
