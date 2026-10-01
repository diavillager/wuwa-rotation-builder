import { describe, expect, it } from 'vitest'
import {
  parseDetail,
  parseList,
  parseWeaponType,
} from '../../../scripts/character-sync/candidates'
import { WEAPON_TYPES, weaponTypeFromId } from './weapons'

describe('공명자 무기군 수집', () => {
  it.each(WEAPON_TYPES)(
    '%s의 명시적 ID와 한국어 이름을 목록·상세에서 수집한다',
    (name) => {
      const id = WEAPON_TYPES.indexOf(name) + 1
      expect(weaponTypeFromId(id)).toBe(name)
      const row = {
        Id: 1205,
        Name: '장리',
        Element: { Name: '용융' },
        RoleHeadIcon: '/Game/Test/portrait',
        WeaponType: { Id: id, Name: name },
      }
      expect(parseList({ roleList: [row] })[0].weaponType).toBe(name)
      expect(
        parseDetail(
          {
            ...row,
            Name: { Content: '장리' },
            ElementName: '용융',
            RoleHeadIconLarge: row.RoleHeadIcon,
            WeaponType: id,
          },
          '1205',
        ).weaponType,
      ).toBe(name)
    },
  )
  it('필드 없는 과거 소스는 읽고 미지원 ID나 이름 불일치는 거부한다', () => {
    expect(parseWeaponType(undefined)).toEqual({})
    for (const value of [0, 6, -1, 1.5, '2', null, { Id: 1, Name: '직검' }])
      expect(() => parseWeaponType(value)).toThrow()
  })
})
