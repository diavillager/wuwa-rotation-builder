import { describe, expect, it } from 'vitest'
import {
  assertRotation,
  changeSkillStage,
  createRotation,
  createSwitch,
  deleteAutoAction,
  hasCharacterCycleContent,
  insertInput,
  reorderInput,
  reorderParty,
  setActiveCharacter,
  transitionKey,
  type InputBlock,
} from './rotation'

const input = (id: string): InputBlock => ({
  type: 'input',
  id,
  input: 'E',
  gesture: 'tap',
  skills: [],
})

describe('Rotation foundation', () => {
  it('warns for owned content in either cycle and for switches without actions', () => {
    const empty = createRotation(['a', 'b', 'c'])
    expect(hasCharacterCycleContent(empty, 'a')).toBe(false)

    const opening = insertInput(empty, 'opening', 'opening-a', input('a1'))
    expect(hasCharacterCycleContent(opening, 'a')).toBe(true)
    expect(hasCharacterCycleContent(opening, 'b')).toBe(false)

    const repeat = insertInput(empty, 'repeat', 'repeat-a', input('a2'))
    expect(hasCharacterCycleContent(repeat, 'a')).toBe(true)

    const switched = createSwitch(empty, 'opening', {
      switchId: 'switch',
      kind: 'normal',
      toId: 'b',
      normalSwitchAttack: {
        columnId: 'auto-column',
        actionId: 'auto',
        skillRef: 'reviewed',
      },
    })
    const suppressed = deleteAutoAction(switched, 'opening', 'auto')
    expect(suppressed.opening.columns).toEqual([])
    expect(hasCharacterCycleContent(suppressed, 'a')).toBe(true)
    expect(hasCharacterCycleContent(suppressed, 'b')).toBe(true)
    expect(hasCharacterCycleContent(suppressed, 'c')).toBe(false)
  })

  it('keeps exactly one global column sequence and independent cycles', () => {
    const start = createRotation(['a', 'b', 'c'])
    const a = insertInput(start, 'opening', 'ca1', input('a1'))
    const b = insertInput(
      setActiveCharacter(a, 'opening', 'b'),
      'opening',
      'cb1',
      input('b1'),
    )
    const c = insertInput(
      setActiveCharacter(b, 'opening', 'a'),
      'opening',
      'ca2',
      input('a2'),
    )
    expect(c.opening.columns.map((item) => item.action.id)).toEqual([
      'a1',
      'a2',
      'b1',
    ])
    expect(c.opening.columns.map((item) => item.ownerId)).toEqual([
      'a',
      'a',
      'b',
    ])
    expect(c.repeat.columns).toEqual([])
    expect(c.repeat.activeCharacterId).toBe('a')
    expect(start.opening.columns).toEqual([])
  })

  it('reorders an input globally without changing ownership or the other cycle', () => {
    let state = createRotation(['a', 'b', 'c'])
    state = insertInput(state, 'opening', 'ca1', input('a1'))
    state = insertInput(
      setActiveCharacter(state, 'opening', 'b'),
      'opening',
      'cb1',
      input('b1'),
    )
    state = insertInput(
      setActiveCharacter(state, 'opening', 'c'),
      'opening',
      'cc1',
      input('c1'),
    )
    state = reorderInput(state, 'opening', 'ca1', 2)
    expect(state.opening.columns.map((item) => item.action.id)).toEqual([
      'b1',
      'c1',
      'a1',
    ])
    expect(state.opening.columns[2].ownerId).toBe('a')
    expect(() => reorderInput(state, 'opening', 'missing', 0)).toThrow()
  })

  it('creates normal switch and keeps Transition outside columns', () => {
    const state = createSwitch(createRotation(['a', 'b', 'c']), 'opening', {
      switchId: 's1',
      kind: 'normal',
      toId: 'b',
      normalSwitchAttack: {
        columnId: 'auto-col',
        actionId: 'auto',
        skillRef: 'reviewed-normal',
      },
    })
    expect(state.opening.columns).toHaveLength(1)
    expect(state.opening.columns[0].action).toMatchObject({
      type: 'autoAction',
      kind: 'normalSwitchAttack',
      switchId: 's1',
    })
    expect(state.opening.transitions).toHaveLength(1)
    expect(state.opening.transitions[0]).toMatchObject({
      fromId: 'a',
      toId: 'b',
      kind: 'normal',
    })
    expect(transitionKey(state, state.opening.transitions[0])).toBe('2')
    expect(state.repeat.transitions).toEqual([])
  })

  it('creates concerto pair in separate columns and deletes both with durable suppression', () => {
    const state = createSwitch(createRotation(['a', 'b', 'c']), 'repeat', {
      switchId: 's1',
      kind: 'concerto',
      toId: 'c',
      outro: {
        columnId: 'out-col',
        actionId: 'out',
        skillRef: 'reviewed-outro',
      },
      intro: { columnId: 'in-col', actionId: 'in', skillRef: 'reviewed-intro' },
    })
    expect(state.repeat.columns.map((item) => item.ownerId)).toEqual(['a', 'c'])
    expect(state.repeat.columns.map((item) => item.action.type)).toEqual([
      'autoAction',
      'autoAction',
    ])
    const removed = deleteAutoAction(state, 'repeat', 'in')
    expect(removed.repeat.columns).toEqual([])
    expect(removed.repeat.transitions).toHaveLength(1)
    expect(removed.repeat.suppression).toEqual([
      { switchId: 's1', kind: 'concertoPair' },
    ])
    expect(JSON.parse(JSON.stringify(removed)).repeat.suppression).toEqual(
      removed.repeat.suppression,
    )
    assertRotation(JSON.parse(JSON.stringify(removed)))
  })

  it('inserts input before outgoing transition and outro', () => {
    const switched = createSwitch(createRotation(['a', 'b', 'c']), 'opening', {
      switchId: 's1',
      kind: 'concerto',
      toId: 'b',
      outro: { columnId: 'out-col', actionId: 'out', skillRef: 'outro' },
      intro: { columnId: 'in-col', actionId: 'in', skillRef: 'intro' },
    })
    const next = insertInput(
      setActiveCharacter(switched, 'opening', 'a'),
      'opening',
      'input-col',
      input('pressed'),
    )
    expect(next.opening.columns.map((item) => item.action.id)).toEqual([
      'pressed',
      'out',
      'in',
    ])
    expect(next.opening.transitions[0].afterColumnId).toBe('out-col')
    expect(next.repeat.columns).toEqual([])
  })

  it('retains owners and updates destination key after party reorder', () => {
    const state = createSwitch(createRotation(['a', 'b', 'c']), 'opening', {
      switchId: 's1',
      kind: 'normal',
      toId: 'b',
      normalSwitchAttack: {
        columnId: 'auto-col',
        actionId: 'auto',
        skillRef: 'normal',
      },
    })
    const reordered = reorderParty(state, ['b', 'c', 'a'])
    expect(reordered.opening.columns[0].ownerId).toBe('b')
    expect(reordered.opening.transitions[0]).toMatchObject({
      fromId: 'a',
      toId: 'b',
    })
    expect(transitionKey(reordered, reordered.opening.transitions[0])).toBe('1')
    expect(reordered.repeat.activeCharacterId).toBe('a')
    expect(() => reorderParty(state, ['a', 'a', 'c'])).toThrow()
  })

  it('clamps stage at zero and rejects corrupt state', () => {
    const withSkill = insertInput(
      createRotation(['a', 'b', 'c']),
      'opening',
      'column',
      {
        ...input('pressed'),
        skills: [{ id: 'skill', skillRef: 'reviewed', stage: 0 }],
      },
    )
    const next = changeSkillStage(withSkill, 'opening', 'pressed', 'skill', -1)
    expect((next.opening.columns[0].action as InputBlock).skills[0].stage).toBe(
      0,
    )
    expect(() =>
      assertRotation({
        ...next,
        opening: {
          ...next.opening,
          columns: [
            {
              ...next.opening.columns[0],
              action: {
                ...input('pressed'),
                skills: [{ id: 'skill', skillRef: 'x', stage: -1 }],
              },
            },
          ],
        },
      }),
    ).toThrow()
  })

  it('requires explicit reviewed autoAction references', () => {
    expect(() =>
      createSwitch(createRotation(['a', 'b', 'c']), 'opening', {
        switchId: 's1',
        kind: 'normal',
        toId: 'b',
      }),
    ).toThrow()
  })

  it('repairs later Transition anchors when linked actions are removed', () => {
    let state = createSwitch(createRotation(['a', 'b', 'c']), 'opening', {
      switchId: 's1',
      kind: 'concerto',
      toId: 'b',
      outro: { columnId: 'out-col', actionId: 'out', skillRef: 'outro' },
      intro: { columnId: 'in-col', actionId: 'in', skillRef: 'intro' },
    })
    state = createSwitch(state, 'opening', {
      switchId: 's2',
      kind: 'normal',
      toId: 'c',
      normalSwitchAttack: {
        columnId: 'normal-col',
        actionId: 'normal',
        skillRef: 'normal',
      },
    })
    state = deleteAutoAction(state, 'opening', 'out')
    expect(state.opening.transitions[1].afterColumnId).toBeNull()
    expect(state.opening.columns.map((column) => column.action.id)).toEqual([
      'normal',
    ])
    assertRotation(state)
  })

  it('inserts after the latest arrival when the same character returns', () => {
    let state = createSwitch(createRotation(['a', 'b', 'c']), 'opening', {
      switchId: 's1',
      kind: 'normal',
      toId: 'b',
      normalSwitchAttack: {
        columnId: 'auto-b',
        actionId: 'ab',
        skillRef: 'b-normal',
      },
    })
    state = createSwitch(state, 'opening', {
      switchId: 's2',
      kind: 'normal',
      toId: 'a',
      normalSwitchAttack: {
        columnId: 'auto-a',
        actionId: 'aa',
        skillRef: 'a-normal',
      },
    })
    state = insertInput(
      state,
      'opening',
      'a-return',
      input('pressed-after-return'),
    )
    expect(state.opening.columns.map((column) => column.action.id)).toEqual([
      'ab',
      'aa',
      'pressed-after-return',
    ])
    expect(state.opening.transitions.map((item) => item.afterColumnId)).toEqual(
      [null, 'auto-b'],
    )
  })

  it('inserts at the arrival boundary when its automatic action was suppressed', () => {
    let state = createSwitch(createRotation(['a', 'b', 'c']), 'opening', {
      switchId: 's1',
      kind: 'normal',
      toId: 'b',
      normalSwitchAttack: {
        columnId: 'auto-b',
        actionId: 'ab',
        skillRef: 'b-normal',
      },
    })
    state = createSwitch(state, 'opening', {
      switchId: 's2',
      kind: 'normal',
      toId: 'a',
      normalSwitchAttack: {
        columnId: 'auto-a',
        actionId: 'aa',
        skillRef: 'a-normal',
      },
    })
    state = deleteAutoAction(state, 'opening', 'aa')
    state = insertInput(
      state,
      'opening',
      'a-return',
      input('pressed-after-return'),
    )
    expect(state.opening.columns.map((column) => column.action.id)).toEqual([
      'ab',
      'pressed-after-return',
    ])
    expect(state.opening.suppression).toEqual([
      { switchId: 's2', kind: 'normalSwitchAttack' },
    ])
  })

  it('keeps the switch boundary before automatic actions when its anchor input moves', () => {
    let state = insertInput(
      createRotation(['a', 'b', 'c']),
      'opening',
      'a-first',
      input('a1'),
    )
    state = createSwitch(state, 'opening', {
      switchId: 's1',
      kind: 'normal',
      toId: 'b',
      normalSwitchAttack: {
        columnId: 'auto-b',
        actionId: 'ab',
        skillRef: 'b-normal',
      },
    })
    state = insertInput(state, 'opening', 'b-first', input('b1'))
    state = reorderInput(state, 'opening', 'a-first', 2)
    expect(state.opening.columns.map((column) => column.action.id)).toEqual([
      'ab',
      'b1',
      'a1',
    ])
    expect(state.opening.transitions[0].afterColumnId).toBeNull()
    expect(state.opening.columns[2].ownerId).toBe('a')
    assertRotation(state)
  })

  it('rejects automatic actions placed on the wrong side of a switch boundary', () => {
    let state = insertInput(
      createRotation(['a', 'b', 'c']),
      'opening',
      'a-first',
      input('a1'),
    )
    state = createSwitch(state, 'opening', {
      switchId: 's1',
      kind: 'normal',
      toId: 'b',
      normalSwitchAttack: {
        columnId: 'auto-b',
        actionId: 'ab',
        skillRef: 'b-normal',
      },
    })
    const corrupt = {
      ...state,
      opening: {
        ...state.opening,
        columns: [state.opening.columns[1], state.opening.columns[0]],
      },
    }
    expect(() => assertRotation(corrupt)).toThrow('교체 경계')
  })
})
