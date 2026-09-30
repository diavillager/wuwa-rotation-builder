import { describe, expect, it } from 'vitest'
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
  reorderSkill,
  replacePartyCharacter,
  setActiveCharacter,
  type InputBlock,
  type Rotation,
} from './rotation'

const input = (id: string): InputBlock => ({
  type: 'input',
  id,
  input: 'E',
  gesture: 'tap',
  skills: [],
})

describe('파티 공명자 교체', () => {
  it('두 Cycle에서 교체된 공명자의 내용과 연결 교체를 원자적으로 정리한다', () => {
    const original = createRotation(['a', 'b', 'c'])
    let state = insertInput(original, 'opening', 'a-col', input('a-input'))
    state = createSwitch(state, 'opening', {
      switchId: 'a-to-b',
      kind: 'normal',
      toId: 'b',
      normalSwitchAttack: {
        columnId: 'b-auto-col',
        actionId: 'b-auto',
        skillRef: 'reviewed-b',
      },
    })
    state = insertInput(state, 'opening', 'b-col', input('b-input'))
    state = createSwitch(state, 'opening', {
      switchId: 'b-to-c',
      kind: 'normal',
      toId: 'c',
      normalSwitchAttack: {
        columnId: 'c-auto-col',
        actionId: 'c-auto',
        skillRef: 'reviewed-c',
      },
    })
    state = insertInput(state, 'repeat', 'repeat-a', input('repeat-a-input'))
    state = insertInput(
      setActiveCharacter(state, 'repeat', 'c'),
      'repeat',
      'repeat-c',
      input('repeat-c-input'),
    )
    state = setActiveCharacter(state, 'repeat', 'a')

    const next = replacePartyCharacter(state, 0, 'd')
    expect(next.party).toEqual(['d', 'b', 'c'])
    expect(next.opening.columns.map((column) => column.action.id)).toEqual([
      'b-input',
      'c-auto',
    ])
    expect(next.opening.transitions.map((item) => item.switchId)).toEqual([
      'b-to-c',
    ])
    expect(next.opening.transitions[0].afterColumnId).toBe('b-col')
    expect(next.opening.activeCharacterId).toBe('c')
    expect(next.repeat.columns.map((column) => column.action.id)).toEqual([
      'repeat-c-input',
    ])
    expect(next.repeat.activeCharacterId).toBe('d')
    expect(state.party).toEqual(['a', 'b', 'c'])
    expect(state.opening.columns).toHaveLength(4)
    assertRotation(JSON.parse(JSON.stringify(next)) as Rotation)
  })

  it('협주 연결 쌍 및 해당 suppression만 제거하고 다른 교체를 보존한다', () => {
    let state = createSwitch(createRotation(['a', 'b', 'c']), 'opening', {
      switchId: 'a-to-b',
      kind: 'concerto',
      toId: 'b',
      outro: { columnId: 'out-col', actionId: 'out', skillRef: 'reviewed-out' },
      intro: { columnId: 'in-col', actionId: 'in', skillRef: 'reviewed-in' },
    })
    state = deleteAutoAction(state, 'opening', 'out')
    state = createSwitch(state, 'opening', {
      switchId: 'b-to-c',
      kind: 'normal',
      toId: 'c',
      normalSwitchAttack: {
        columnId: 'c-col',
        actionId: 'c-auto',
        skillRef: 'reviewed-c',
      },
    })
    const next = replacePartyCharacter(state, 0, 'd')
    expect(next.opening.transitions.map((item) => item.switchId)).toEqual([
      'b-to-c',
    ])
    expect(next.opening.columns.map((column) => column.action.id)).toEqual([
      'c-auto',
    ])
    expect(next.opening.suppression).toEqual([])
    assertRotation(next)
  })

  it('제거된 자동 행동을 가리킨 다른 교체를 다시 연결하고 그 suppression은 보존한다', () => {
    let state = createSwitch(createRotation(['a', 'b', 'c']), 'opening', {
      switchId: 'a-to-b',
      kind: 'normal',
      toId: 'b',
      normalSwitchAttack: {
        columnId: 'b-auto-col',
        actionId: 'b-auto',
        skillRef: 'reviewed-b',
      },
    })
    state = createSwitch(state, 'opening', {
      switchId: 'b-to-c',
      kind: 'normal',
      toId: 'c',
      normalSwitchAttack: {
        columnId: 'c-auto-col',
        actionId: 'c-auto',
        skillRef: 'reviewed-c',
      },
    })
    state = deleteAutoAction(state, 'opening', 'c-auto')

    const next = replacePartyCharacter(state, 0, 'd')
    expect(next.opening.columns).toEqual([])
    expect(next.opening.transitions).toEqual([
      {
        switchId: 'b-to-c',
        fromId: 'b',
        toId: 'c',
        kind: 'normal',
        afterColumnId: null,
      },
    ])
    expect(next.opening.suppression).toEqual([
      {
        switchId: 'b-to-c',
        kind: 'normalSwitchAttack',
      },
    ])
    assertRotation(next)
  })

  it('중복·빈 ID와 잘못된 슬롯을 거부하며 원본을 바꾸지 않는다', () => {
    const state = createRotation(['a', 'b', 'c'])
    const snapshot = JSON.stringify(state)
    expect(() => replacePartyCharacter(state, 0, 'b')).toThrow()
    expect(() => replacePartyCharacter(state, 0, '')).toThrow()
    expect(() => replacePartyCharacter(state, 3 as 0, 'd')).toThrow()
    expect(JSON.stringify(state)).toBe(snapshot)
  })
})

describe('InputBlock과 Transition 경계', () => {
  it('교체 anchor였던 입력을 삭제해도 linked AutoAction과 교체 경계를 유지한다', () => {
    let state = insertInput(
      createRotation(['a', 'b', 'c']),
      'opening',
      'a1-col',
      input('a1'),
    )
    state = insertInput(state, 'opening', 'a2-col', input('a2'))
    state = createSwitch(state, 'opening', {
      switchId: 'a-to-b',
      kind: 'normal',
      toId: 'b',
      normalSwitchAttack: {
        columnId: 'b-auto-col',
        actionId: 'b-auto',
        skillRef: 'reviewed-b',
      },
    })
    state = deleteInput(state, 'opening', 'a2')
    expect(state.opening.columns.map((column) => column.action.id)).toEqual([
      'a1',
      'b-auto',
    ])
    expect(state.opening.transitions[0].afterColumnId).toBe('a1-col')
    assertRotation(state)
    expect(() => deleteInput(state, 'opening', 'b-auto')).toThrow()
    expect(() => deleteInput(state, 'repeat', 'a1')).toThrow()
  })

  it('협주 교체 주변에서 입력을 이동·삭제해도 outro와 intro는 별도 열로 남는다', () => {
    let state = insertInput(
      createRotation(['a', 'b', 'c']),
      'opening',
      'a-col',
      input('a-input'),
    )
    state = createSwitch(state, 'opening', {
      switchId: 'a-to-b',
      kind: 'concerto',
      toId: 'b',
      outro: { columnId: 'out-col', actionId: 'out', skillRef: 'reviewed-out' },
      intro: { columnId: 'in-col', actionId: 'in', skillRef: 'reviewed-in' },
    })
    state = reorderInput(state, 'opening', 'a-col', 2)
    expect(state.opening.columns.map((column) => column.action.id)).toEqual([
      'out',
      'in',
      'a-input',
    ])
    expect(state.opening.transitions[0].afterColumnId).toBe('out-col')
    state = deleteInput(state, 'opening', 'a-input')
    expect(state.opening.columns.map((column) => column.action.id)).toEqual([
      'out',
      'in',
    ])
    assertRotation(state)
  })

  it('같은 경계에 있는 여러 suppression된 Transition을 입력 삭제 뒤에도 보존한다', () => {
    let state = createSwitch(createRotation(['a', 'b', 'c']), 'opening', {
      switchId: 'a-to-b',
      kind: 'normal',
      toId: 'b',
      normalSwitchAttack: {
        columnId: 'b-auto-col',
        actionId: 'b-auto',
        skillRef: 'reviewed-b',
      },
    })
    state = deleteAutoAction(state, 'opening', 'b-auto')
    state = createSwitch(state, 'opening', {
      switchId: 'b-to-c',
      kind: 'normal',
      toId: 'c',
      normalSwitchAttack: {
        columnId: 'c-auto-col',
        actionId: 'c-auto',
        skillRef: 'reviewed-c',
      },
    })
    state = deleteAutoAction(state, 'opening', 'c-auto')
    state = insertInput(
      setActiveCharacter(state, 'opening', 'b'),
      'opening',
      'b-col',
      input('b-input'),
    )
    expect(state.opening.transitions.map((item) => item.afterColumnId)).toEqual(
      [null, 'b-col'],
    )
    state = deleteInput(state, 'opening', 'b-input')
    expect(state.opening.transitions.map((item) => item.afterColumnId)).toEqual(
      [null, null],
    )
    expect(state.opening.suppression).toHaveLength(2)
    assertRotation(state)
  })
})

describe('SkillBlock 편집', () => {
  it('0→1→2는 뒤에 추가하고 2개 이상일 때 지정한 위치에 삽입한다', () => {
    const start = insertInput(
      createRotation(['a', 'b', 'c']),
      'opening',
      'input-col',
      input('pressed'),
    )
    const first = addSkill(start, 'opening', 'pressed', {
      id: 's1',
      skillRef: 'same',
      stage: 0,
    })
    const second = addSkill(
      first,
      'opening',
      'pressed',
      {
        id: 's2',
        skillRef: 'same',
        stage: 1,
      },
      0,
    )
    const third = addSkill(
      second,
      'opening',
      'pressed',
      {
        id: 's3',
        skillRef: 'other',
        stage: 0,
      },
      1,
    )
    expect(
      (third.opening.columns[0].action as InputBlock).skills.map(
        (skill) => skill.id,
      ),
    ).toEqual(['s1', 's3', 's2'])
    expect(
      (third.opening.columns[0].action as InputBlock).skills.map(
        (skill) => skill.skillRef,
      ),
    ).toEqual(['same', 'other', 'same'])
    expect((start.opening.columns[0].action as InputBlock).skills).toEqual([])
    assertRotation(third)
  })

  it('순서·삭제·stage 최소값을 다루고 입력키 의미는 바꾸지 않는다', () => {
    let state = insertInput(
      createRotation(['a', 'b', 'c']),
      'repeat',
      'input-col',
      input('pressed'),
    )
    state = addSkill(state, 'repeat', 'pressed', {
      id: 's1',
      skillRef: 'a',
      stage: 0,
    })
    state = addSkill(state, 'repeat', 'pressed', {
      id: 's2',
      skillRef: 'b',
      stage: 2,
    })
    state = reorderSkill(state, 'repeat', 'pressed', 's2', 0)
    state = changeSkillStage(state, 'repeat', 'pressed', 's2', -5)
    state = deleteSkill(state, 'repeat', 'pressed', 's1')
    const action = state.repeat.columns[0].action as InputBlock
    expect(action.input).toBe('E')
    expect(action.skills).toEqual([{ id: 's2', skillRef: 'b', stage: 0 }])
    state = deleteSkill(state, 'repeat', 'pressed', 's2')
    expect((state.repeat.columns[0].action as InputBlock).skills).toEqual([])
    expect(state.opening.columns).toEqual([])
  })

  it('잘못된 대상·위치·stage를 거부하고 원본을 유지한다', () => {
    const start = insertInput(
      createRotation(['a', 'b', 'c']),
      'opening',
      'col',
      input('pressed'),
    )
    const state = addSkill(start, 'opening', 'pressed', {
      id: 's1',
      skillRef: 'a',
      stage: 0,
    })
    const snapshot = JSON.stringify(state)
    expect(() =>
      addSkill(state, 'opening', 'pressed', {
        id: 's1',
        skillRef: 'b',
        stage: 0,
      }),
    ).toThrow()
    expect(() =>
      addSkill(state, 'opening', 'pressed', {
        id: 's2',
        skillRef: 'b',
        stage: -1,
      }),
    ).toThrow()
    expect(() =>
      addSkill(
        state,
        'opening',
        'pressed',
        { id: 's2', skillRef: 'b', stage: 0 },
        4,
      ),
    ).toThrow()
    expect(() => deleteSkill(state, 'opening', 'pressed', 'missing')).toThrow()
    expect(() => reorderSkill(state, 'opening', 'pressed', 's1', 2)).toThrow()
    expect(() =>
      changeSkillStage(state, 'opening', 'pressed', 'missing', 1),
    ).toThrow()
    expect(() => deleteInput(state, 'opening', 'missing')).toThrow()
    expect(JSON.stringify(state)).toBe(snapshot)
  })

  it('직접 입력 정보가 있는 AutoAction과 손상된 기존 상태를 거부한다', () => {
    const start = createSwitch(createRotation(['a', 'b', 'c']), 'opening', {
      switchId: 'switch',
      kind: 'normal',
      toId: 'b',
      normalSwitchAttack: {
        columnId: 'auto-col',
        actionId: 'auto',
        skillRef: 'reviewed',
      },
    })
    const corrupt = structuredClone(start) as Rotation
    Object.assign(corrupt.opening.columns[0].action, { input: 'LMB', stage: 2 })
    expect(() => assertRotation(corrupt)).toThrow('AutoAction의 데이터')
    expect(() => setActiveCharacter(corrupt, 'repeat', 'c')).toThrow()
    expect(() =>
      addSkill(start, 'opening', 'auto', { id: 's', skillRef: 'x', stage: 0 }),
    ).toThrow()
  })
})
