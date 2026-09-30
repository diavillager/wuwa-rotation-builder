import { describe, expect, it } from 'vitest'
import {
  createRotation,
  createSwitch,
  deleteAutoAction,
  insertInput,
  reorderParty,
  setActiveCharacter,
} from '../domain/rotation'
import { characterName, emptyCatalog, skillName } from './catalog'
import { createDemoRotation, demoCatalog } from './demo'
import { projectCycle } from './editor-projection'

describe('Editor projection', () => {
  it('하나의 전역 열을 세 라인이 공유하고 파티 재정렬은 열 순서를 바꾸지 않는다', () => {
    const rotation = createDemoRotation()
    const before = projectCycle(rotation, rotation.opening)
    const reordered = reorderParty(rotation, ['demo-c', 'demo-a', 'demo-b'])
    const after = projectCycle(reordered, reordered.opening)
    expect(after.party).toEqual(['demo-c', 'demo-a', 'demo-b'])
    expect(after.columns).toEqual(before.columns)
    expect(after.columns.map((item) => item.ownerId)).toEqual([
      'demo-a',
      'demo-a',
      'demo-b',
      'demo-b',
    ])
    expect(after.boundaries.flatMap((item) => item.transitions)).toHaveLength(1)
  })

  it('교체를 열이 아닌 경계로 투영하고 suppression 뒤에도 유지한다', () => {
    let rotation = createSwitch(createRotation(['a', 'b', 'c']), 'opening', {
      switchId: 'switch',
      kind: 'normal',
      toId: 'b',
      normalSwitchAttack: {
        columnId: 'auto-col',
        actionId: 'auto',
        skillRef: 'reviewed',
      },
    })
    rotation = deleteAutoAction(rotation, 'opening', 'auto')
    const view = projectCycle(rotation, rotation.opening)
    expect(view.columns).toEqual([])
    expect(view.boundaries).toHaveLength(1)
    expect(view.boundaries[0].transitions[0].switchId).toBe('switch')
    expect(rotation.opening.suppression).toHaveLength(1)
  })

  it('개막과 반복의 active line을 독립적으로 투영한다', () => {
    let rotation = insertInput(
      createRotation(['a', 'b', 'c']),
      'opening',
      'col',
      {
        type: 'input',
        id: 'input',
        input: 'E',
        gesture: 'tap',
        skills: [],
      },
    )
    rotation = setActiveCharacter(rotation, 'repeat', 'c')
    expect(projectCycle(rotation, rotation.opening).activeCharacterId).toBe('a')
    expect(projectCycle(rotation, rotation.repeat).activeCharacterId).toBe('c')
    expect(projectCycle(rotation, rotation.repeat).columns).toEqual([])
  })

  it('검수 데이터 부재를 임의의 스킬 이름으로 보충하지 않는다', () => {
    expect(characterName(emptyCatalog, 'slot-one')).toBe('공명자 미지정')
    expect(skillName(emptyCatalog, 'missing')).toContain('알 수 없는 스킬')
    expect(skillName(demoCatalog, 'demo-skill-a')).toBe('데모 스킬 A')
  })
})
