import { describe, expect, it } from 'vitest'
import {
  createEditorHistory,
  recordRotationEdit,
  undoCycle,
  redoCycle,
} from './cycle-history'
import {
  addSkill,
  assertRotation,
  changeSkillStage,
  createRotation,
  createSwitch,
  deleteAutoAction,
  deleteInput,
  deleteSkill,
  insertInput,
  reorderInput,
  reorderParty,
  reorderSkill,
  replacePartyCharacter,
  setActiveCharacter,
  transitionKey,
  type Rotation,
} from './rotation'

const initial = () => createEditorHistory(createRotation(['a', 'b', 'c']))
const insert = (
  state: Rotation,
  id: string,
  cycleId: 'opening' | 'repeat' = 'opening',
) =>
  insertInput(state, cycleId, `col-${id}`, {
    id,
    type: 'input',
    input: 'E',
    gesture: 'tap',
    skills: [],
  })

describe('사이클별 편집 이력', () => {
  it('A→B→C 편집 후 A/C/B 재정렬해도 마지막 편집 C부터 되돌린다', () => {
    let state = initial()
    for (const owner of ['a', 'b', 'c']) {
      state = recordRotationEdit(
        state,
        setActiveCharacter(state.rotation, 'opening', owner),
      )
      state = recordRotationEdit(state, insert(state.rotation, `${owner}1`))
    }
    state = recordRotationEdit(
      state,
      reorderParty(state.rotation, ['a', 'c', 'b']),
    )
    state = undoCycle(state, 'opening')
    expect(state.rotation.party).toEqual(['a', 'c', 'b'])
    expect(
      state.rotation.opening.columns.map((column) => column.action.id),
    ).toEqual(['a1', 'b1'])
    state = undoCycle(state, 'opening')
    expect(
      state.rotation.opening.columns.map((column) => column.action.id),
    ).toEqual(['a1'])
  })

  it('두 사이클은 독립적으로 복원하며 새 편집은 해당 Cycle의 Redo만 지운다', () => {
    let state = initial()
    expect(undoCycle(state, 'opening')).toBe(state)
    expect(redoCycle(state, 'repeat')).toBe(state)
    state = recordRotationEdit(state, insert(state.rotation, 'a1'))
    state = recordRotationEdit(state, insert(state.rotation, 'a2', 'repeat'))
    const recorded = state
    state = undoCycle(state, 'opening')
    expect(state.rotation.opening.columns).toEqual([])
    expect(state.rotation.repeat).toBe(recorded.rotation.repeat)
    state = undoCycle(state, 'repeat')
    state = recordRotationEdit(state, insert(state.rotation, 'a3'))
    expect(state.histories.opening.future).toEqual([])
    expect(state.histories.repeat.future).toHaveLength(1)
    state = redoCycle(state, 'repeat')
    expect(state.rotation.repeat.columns[0].action.id).toBe('a2')
    expect(state.rotation.opening.columns[0].action.id).toBe('a3')
    assertRotation(state.rotation)
  })

  it('InputBlock 이동·삭제와 Skill 추가·삭제·재정렬·stage를 각각 원자적으로 복원한다', () => {
    let state = initial()
    const saved: Rotation[] = []
    const edit = (next: Rotation) => {
      saved.push(state.rotation)
      state = recordRotationEdit(state, next)
    }
    edit(insert(state.rotation, 'a1'))
    edit(insert(state.rotation, 'a2'))
    edit(
      addSkill(state.rotation, 'opening', 'a1', {
        id: 'skill1',
        skillRef: 's1',
        stage: 0,
      }),
    )
    edit(
      addSkill(state.rotation, 'opening', 'a1', {
        id: 'skill2',
        skillRef: 's2',
        stage: 0,
      }),
    )
    edit(changeSkillStage(state.rotation, 'opening', 'a1', 'skill1', 1))
    edit(reorderSkill(state.rotation, 'opening', 'a1', 'skill2', 0))
    edit(deleteSkill(state.rotation, 'opening', 'a1', 'skill2'))
    edit(reorderInput(state.rotation, 'opening', 'col-a1', 1))
    edit(deleteInput(state.rotation, 'opening', 'a1'))
    const final = state.rotation
    for (const before of [...saved].reverse()) {
      state = undoCycle(state, 'opening')
      expect(state.rotation.opening.columns).toEqual(before.opening.columns)
      assertRotation(state.rotation)
    }
    for (let index = 0; index < saved.length; index++)
      state = redoCycle(state, 'opening')
    expect(state.rotation).toEqual(final)
  })

  it.each(['normal', 'concerto'] as const)(
    '%s 교체 생성과 자동 행동·suppression 삭제를 한 단계씩 복원한다',
    (kind) => {
      let state = initial()
      state = recordRotationEdit(state, insert(state.rotation, 'a1'))
      state = recordRotationEdit(
        state,
        createSwitch(state.rotation, 'opening', {
          switchId: 'switch',
          kind,
          toId: 'b',
          normalSwitchAttack: {
            columnId: 'normal',
            actionId: 'normal-action',
            skillRef: 'b-normal',
          },
          outro: {
            columnId: 'outro',
            actionId: 'outro-action',
            skillRef: 'a-outro',
          },
          intro: {
            columnId: 'intro',
            actionId: 'intro-action',
            skillRef: 'b-intro',
          },
        }),
      )
      const switched = state.rotation.opening
      state = undoCycle(state, 'opening')
      expect(state.rotation.opening.transitions).toEqual([])
      expect(state.rotation.opening.columns).toHaveLength(1)
      expect(state.rotation.opening.activeCharacterId).toBe('b')
      state = redoCycle(state, 'opening')
      expect(state.rotation.opening).toEqual(switched)
      state = recordRotationEdit(
        state,
        deleteAutoAction(
          state.rotation,
          'opening',
          kind === 'normal' ? 'normal-action' : 'intro-action',
        ),
      )
      expect(state.rotation.opening.columns).toHaveLength(1)
      expect(state.rotation.opening.suppression).toHaveLength(1)
      const suppressed = state.rotation.opening
      state = undoCycle(state, 'opening')
      expect(state.rotation.opening).toEqual(switched)
      state = redoCycle(state, 'opening')
      expect(state.rotation.opening).toEqual(suppressed)
      assertRotation(state.rotation)
    },
  )

  it('파티 재정렬과 hover는 이력을 유지하고 Undo는 현재 party·active line을 보존한다', () => {
    let state = initial()
    state = recordRotationEdit(state, insert(state.rotation, 'a1'))
    state = recordRotationEdit(
      state,
      createSwitch(state.rotation, 'opening', {
        switchId: 'switch',
        kind: 'normal',
        toId: 'b',
        normalSwitchAttack: {
          columnId: 'normal',
          actionId: 'normal-action',
          skillRef: 'b-normal',
        },
      }),
    )
    state = undoCycle(state, 'opening')
    const history = state.histories.opening
    state = recordRotationEdit(
      state,
      reorderParty(state.rotation, ['c', 'b', 'a']),
    )
    state = recordRotationEdit(
      state,
      setActiveCharacter(state.rotation, 'opening', 'c'),
    )
    expect(state.histories.opening).toBe(history)
    state = redoCycle(state, 'opening')
    expect(state.rotation.party).toEqual(['c', 'b', 'a'])
    expect(state.rotation.opening.activeCharacterId).toBe('c')
    expect(
      state.rotation.opening.columns.map((column) => column.ownerId),
    ).toEqual(['a', 'b'])
    expect(
      transitionKey(state.rotation, state.rotation.opening.transitions[0]),
    ).toBe('2')
    assertRotation(state.rotation)
  })

  it('stage 0 감소·같은 위치 이동·실패한 명령은 Undo/Redo를 바꾸지 않는다', () => {
    let state = initial()
    state = recordRotationEdit(state, insert(state.rotation, 'a1'))
    state = recordRotationEdit(
      state,
      addSkill(state.rotation, 'opening', 'a1', {
        id: 'skill',
        skillRef: 's',
        stage: 0,
      }),
    )
    state = recordRotationEdit(state, insert(state.rotation, 'a2'))
    state = undoCycle(state, 'opening')
    const history = state.histories.opening
    state = recordRotationEdit(
      state,
      changeSkillStage(state.rotation, 'opening', 'a1', 'skill', -1),
    )
    state = recordRotationEdit(
      state,
      reorderInput(state.rotation, 'opening', 'col-a1', 0),
    )
    expect(() => deleteInput(state.rotation, 'opening', 'missing')).toThrow()
    expect(state.histories.opening).toBe(history)
    expect(history.future).toHaveLength(1)
  })

  it('공명자 변경은 두 past/future를 초기화하되 다른 공명자의 현재 내용은 보존한다', () => {
    let state = initial()
    state = recordRotationEdit(state, insert(state.rotation, 'a1'))
    state = recordRotationEdit(state, insert(state.rotation, 'a2'))
    state = recordRotationEdit(
      state,
      setActiveCharacter(state.rotation, 'repeat', 'b'),
    )
    state = recordRotationEdit(state, insert(state.rotation, 'b1', 'repeat'))
    state = recordRotationEdit(state, insert(state.rotation, 'b2', 'repeat'))
    state = undoCycle(state, 'opening')
    state = undoCycle(state, 'repeat')
    const repeat = state.rotation.repeat
    state = recordRotationEdit(
      state,
      replacePartyCharacter(state.rotation, 0, 'd'),
    )
    expect(state.histories).toEqual({
      opening: { past: [], future: [] },
      repeat: { past: [], future: [] },
    })
    expect(state.rotation.repeat.columns).toEqual(repeat.columns)
    expect(state.rotation.opening.columns).toEqual([])
    expect(undoCycle(state, 'repeat')).toBe(state)
    state = recordRotationEdit(state, insert(state.rotation, 'd1'))
    expect(state.histories.opening.past).toHaveLength(1)
    state = undoCycle(state, 'opening')
    expect(state.rotation.party).toEqual(['d', 'b', 'c'])
    expect(state.rotation.opening.columns).toEqual([])
  })

  it('같은 공명자 선택은 이력을 유지하고 빈 내용에 과거 이력만 있어도 실제 변경 시 초기화한다', () => {
    let state = initial()
    state = recordRotationEdit(state, insert(state.rotation, 'a1'))
    state = undoCycle(state, 'opening')
    const same = recordRotationEdit(
      state,
      replacePartyCharacter(state.rotation, 0, 'a'),
    )
    expect(same).toBe(state)
    state = recordRotationEdit(
      state,
      replacePartyCharacter(state.rotation, 0, 'd'),
    )
    expect(state.histories.opening.future).toEqual([])
    expect(redoCycle(state, 'opening')).toBe(state)
  })
})
