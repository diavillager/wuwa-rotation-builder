import { describe, expect, it, vi } from 'vitest'
import { validateCharacterData, type CharacterData } from './contract'
import { loadCharacterCatalog, characterAssetId } from './load'
import { createRotation, insertInput, addSkill } from '../../domain/rotation'
import {
  createProject,
  captureReferences,
  validateProject,
} from '../../domain/project'
import { applyCapturedInput } from '../../app/input-command'

const fixture = (id = 'test-a'): CharacterData => ({
  schemaVersion: 1,
  reviewStatus: 'approved',
  characterId: id,
  displayName: '검증 공명자',
  attribute: '응결',
  portrait: 'assets/portrait.webp',
  skills: [
    {
      skillId: `${id}:normal`,
      displayName: '교체 공격',
      visible: true,
      asset: 'assets/normal.webp',
    },
    {
      skillId: `${id}:intro`,
      displayName: '변주',
      visible: true,
      asset: 'assets/intro.webp',
    },
    {
      skillId: `${id}:outro`,
      displayName: '반주',
      visible: true,
      asset: 'assets/outro.webp',
    },
    {
      skillId: `${id}:hidden`,
      displayName: '비노출 스킬',
      visible: false,
      asset: 'assets/hidden.webp',
    },
  ],
  autoActions: {
    normalSwitchAttack: `${id}:normal`,
    intro: `${id}:intro`,
    outro: `${id}:outro`,
  },
})
const entry = (data: CharacterData) => ({
  path: `characters/${data.characterId}/data/${data.characterId}.json`,
  data,
})
const assetsFor = (data: CharacterData) =>
  Object.fromEntries(
    [
      data.portrait,
      ...data.skills.filter((s) => s.visible).map((s) => s.asset),
    ].map((relative) => [
      characterAssetId(data.characterId, relative),
      `/build/${data.characterId}/${relative}`,
    ]),
  )

describe('최종 Character 계약', () => {
  it('무기군은 catalog에 보존하고 구버전 누락은 허용하되 잘못된 값은 거부한다', async () => {
    const data = { ...fixture(), weaponType: '직검' as const }
    expect(validateCharacterData(data, data.characterId).weaponType).toBe(
      '직검',
    )
    const result = await loadCharacterCatalog(
      [entry(data)],
      assetsFor(data),
      async () => {},
    )
    expect(result.catalog.characters[0].weaponType).toBe('직검')
    expect(
      validateCharacterData(fixture(), data.characterId).weaponType,
    ).toBeUndefined()
    expect(() =>
      validateCharacterData({ ...data, weaponType: '창' }, data.characterId),
    ).toThrow('무기군')
  })
  it('같은 기본 공격 분류가 여럿이어도 지정한 ID와 타수를 보존한다', () => {
    const data = fixture()
    data.skills[0].category = '기본 공격'
    data.skills[0].hitCount = 0
    data.skills[1].category = '변주 스킬'
    data.skills[2].category = '반주 스킬'
    data.skills.push({
      ...data.skills[0],
      skillId: 'test-a:normal-10',
      hitCount: 10,
    })
    expect(validateCharacterData(data, 'test-a')).toEqual(data)
    data.autoActions.normalSwitchAttack = 'test-a:normal-10'
    expect(
      validateCharacterData(data, 'test-a').autoActions.normalSwitchAttack,
    ).toBe('test-a:normal-10')
    data.skills[4].hitCount = 11
    expect(() => validateCharacterData(data, 'test-a')).toThrow('타수')
  })
  it('명시적 검수·속성·노출·자동 행동 참조를 읽고 입력키 의미는 추론하지 않는다', () => {
    const data = fixture()
    expect(validateCharacterData(data, 'test-a')).toEqual(data)
  })
  it.each([
    [
      '검수 미완료',
      (d: CharacterData) => {
        Reflect.set(d, 'reviewStatus', 'draft')
      },
    ],
    [
      '버전 오류',
      (d: CharacterData) => {
        Reflect.set(d, 'schemaVersion', 2)
      },
    ],
    [
      'ID 불일치',
      (d: CharacterData) => {
        d.characterId = 'other'
      },
    ],
    [
      '한국어 누락',
      (d: CharacterData) => {
        d.displayName = 'English'
      },
    ],
    [
      '속성 오류',
      (d: CharacterData) => {
        Reflect.set(d, 'attribute', 'unknown')
      },
    ],
    [
      '중복 스킬',
      (d: CharacterData) => {
        d.skills.push({ ...d.skills[0] })
      },
    ],
    [
      '노출 미지정',
      (d: CharacterData) => {
        Reflect.deleteProperty(d.skills[0], 'visible')
      },
    ],
    [
      '노출 이름 누락',
      (d: CharacterData) => {
        d.skills[0].displayName = ' '
      },
    ],
    [
      '자산 경로 탈출',
      (d: CharacterData) => {
        d.portrait = 'assets/../portrait.webp'
      },
    ],
    [
      '외부 자산',
      (d: CharacterData) => {
        d.portrait = 'https://host/portrait.webp'
      },
    ],
    [
      '자동 행동 누락',
      (d: CharacterData) => {
        Reflect.deleteProperty(d.autoActions, 'intro')
      },
    ],
    [
      '자동 행동 잘못된 참조',
      (d: CharacterData) => {
        d.autoActions.intro = 'QTE'
      },
    ],
    [
      '숨긴 스킬 자동 행동',
      (d: CharacterData) => {
        d.autoActions.intro = 'test-a:hidden'
      },
    ],
  ])('%s 거부', (_, damage) => {
    const data = fixture()
    damage(data)
    expect(() => validateCharacterData(data, 'test-a')).toThrow()
  })
})

describe('catalog 로딩과 참조 무결성', () => {
  it('실제 자산 검증을 기다리고 안정적인 ID·표시 URL·비노출 참조를 분리한다', async () => {
    const data = fixture()
    const check = vi.fn(async () => {})
    const { catalog, issues } = await loadCharacterCatalog(
      [entry(data)],
      assetsFor(data),
      check,
    )
    expect(issues).toEqual([])
    expect(check).toHaveBeenCalledTimes(4)
    const character = catalog.characters[0]
    expect(character.element).toBe('응결')
    expect(
      character.skills.find((s) => s.id === 'test-a:hidden')?.visible,
    ).toBe(false)
    expect(
      character.skills.find((s) => s.id === 'test-a:hidden')?.assetUrl,
    ).toBeUndefined()
    const rotation = addSkill(
      insertInput(createRotation(['test-a', 'b', 'c']), 'opening', 'col', {
        id: 'input',
        type: 'input',
        input: 'E',
        gesture: 'tap',
        skills: [],
      }),
      'opening',
      'input',
      { id: 'skill', skillRef: 'test-a:normal', stage: 2 },
    )
    const project = createProject(
      'project',
      '테스트',
      '2026-10-01T00:00:00.000Z',
      rotation,
      captureReferences(rotation, catalog),
    )
    expect(project.references.characters[0].asset).toBe(
      'characters/test-a/assets/portrait.webp',
    )
    expect(JSON.stringify(project)).not.toContain('/build/')
    expect(
      validateProject(JSON.parse(JSON.stringify(project))).rotation,
    ).toEqual(rotation)
    const before = JSON.stringify(rotation)
    const updated = fixture()
    updated.skills[0].displayName = '이름 변경'
    await loadCharacterCatalog([entry(updated)], assetsFor(updated), check)
    expect(JSON.stringify(rotation)).toBe(before)
  })
  it('손상 JSON·자산 누락·디코딩 실패는 해당 공명자만 제외하고 원인을 보고한다', async () => {
    const a = fixture('a'),
      b = fixture('b'),
      c = fixture('c')
    const assets = { ...assetsFor(a), ...assetsFor(b), ...assetsFor(c) }
    delete assets[characterAssetId('b', b.portrait)]
    const check = vi.fn(async (url: string) => {
      if (url.includes('/c/')) throw new Error('디코딩 실패')
    })
    const result = await loadCharacterCatalog(
      [
        entry(a),
        entry(b),
        entry(c),
        { path: 'characters/d/data/d.json', data: '{broken' },
      ],
      assets,
      check,
    )
    expect(result.catalog.characters.map((c) => c.id)).toEqual(['a'])
    expect(result.issues.map((i) => i.characterId)).toEqual(['d', 'b', 'c'])
    expect(result.issues.find((i) => i.characterId === 'b')?.message).toContain(
      '자산이 없습니다',
    )
    expect(result.issues.find((i) => i.characterId === 'c')?.message).toBe(
      '디코딩 실패',
    )
  })
  it('공개 ID 충돌의 양쪽 레코드를 제외하며 순서로 의미를 결정하지 않는다', async () => {
    const a = fixture('a'),
      b = fixture('b')
    b.skills[0].skillId = a.skills[0].skillId
    b.autoActions.normalSwitchAttack = a.skills[0].skillId
    const result = await loadCharacterCatalog(
      [entry(a), entry(b)],
      { ...assetsFor(a), ...assetsFor(b) },
      async () => {},
    )
    expect(result.catalog.characters).toEqual([])
    expect(result.issues).toHaveLength(2)
  })
  it('로더의 자동 행동 매핑으로만 교체하며 일반 E 입력은 스킬이 비어 있다', async () => {
    const a = fixture('a'),
      b = fixture('b')
    const { catalog } = await loadCharacterCatalog(
      [entry(a), entry(b)],
      { ...assetsFor(a), ...assetsFor(b) },
      async () => {},
    )
    let id = 0
    const target = {
      cycleId: 'opening' as const,
      ownerId: 'a',
      atTimelineEnd: true,
    }
    const rotation = createRotation(['a', 'b', 'c'])
    const direct = applyCapturedInput(
      rotation,
      catalog,
      { control: 'E', gesture: 'tap', target },
      () => `id-${++id}`,
    )
    expect(direct.opening.columns[0].action).toMatchObject({
      type: 'input',
      input: 'E',
      skills: [],
    })
    const normal = applyCapturedInput(
      direct,
      catalog,
      { control: '2', gesture: 'tap', target },
      () => `id-${++id}`,
    )
    expect(normal.opening.columns[1].action).toMatchObject({
      type: 'autoAction',
      skillRef: 'b:normal',
    })
    expect(normal.repeat).toEqual(rotation.repeat)
  })
})
