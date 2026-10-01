import { describe, expect, it } from 'vitest'
import {
  assertRotation,
  createRotation,
  createSwitch,
  deleteAutoAction,
  deleteSwitchForAutoAction,
  insertInput,
  reorderParty,
  setActiveCharacter,
  type Rotation,
  type CycleId,
} from './rotation'

const addSwitch = (
  rotation: Rotation,
  cycle: CycleId,
  id: string,
  toId: string,
  kind: 'normal' | 'concerto',
) =>
  createSwitch(rotation, cycle, {
    switchId: id,
    kind,
    toId,
    normalSwitchAttack: {
      columnId: `${id}-normal-col`,
      actionId: `${id}-normal`,
      skillRef: 'normal',
    },
    outro: {
      columnId: `${id}-out-col`,
      actionId: `${id}-out`,
      skillRef: 'outro',
    },
    intro: {
      columnId: `${id}-in-col`,
      actionId: `${id}-in`,
      skillRef: 'intro',
    },
  })

describe('교체 카드와 Transition 함께 삭제', () => {
  it.each(['opening', 'repeat'] as const)(
    '%s에서 일반·반주·변주 삭제는 다른 교체와 Cycle을 보존한다',
    (cycle) => {
      for (const action of ['normal', 'out', 'in']) {
        let state = insertInput(
          createRotation(['a', 'b', 'c']),
          cycle,
          'input-col',
          {
            type: 'input',
            id: 'input',
            input: 'LMB',
            gesture: 'tap',
            skills: [],
          },
        )
        state = addSwitch(
          state,
          cycle,
          'target',
          'b',
          action === 'normal' ? 'normal' : 'concerto',
        )
        state = addSwitch(state, cycle, 'later', 'c', 'normal')
        state = addSwitch(state, cycle, 'legacy', 'a', 'normal')
        state = deleteAutoAction(state, cycle, 'legacy-normal')
        state = reorderParty(state, ['c', 'a', 'b'])
        const before = JSON.stringify(state)
        const next = deleteSwitchForAutoAction(state, cycle, `target-${action}`)
        expect(next[cycle].columns).toEqual(
          state[cycle].columns.filter(
            (column) =>
              column.action.type === 'input' ||
              column.action.switchId !== 'target',
          ),
        )
        expect(next[cycle].transitions.map((item) => item.switchId)).toEqual([
          'later',
          'legacy',
        ])
        expect(next[cycle].transitions[0]).toMatchObject({
          fromId: 'b',
          toId: 'c',
          afterColumnId: 'input-col',
        })
        expect(next[cycle].suppression).toEqual(state[cycle].suppression)
        expect(next[cycle].activeCharacterId).toBe(
          state[cycle].activeCharacterId,
        )
        expect(next[cycle === 'opening' ? 'repeat' : 'opening']).toBe(
          state[cycle === 'opening' ? 'repeat' : 'opening'],
        )
        expect(next.party).toBe(state.party)
        expect(JSON.stringify(state)).toBe(before)
        assertRotation(next)
        const restored: Rotation = JSON.parse(JSON.stringify(next))
        assertRotation(restored)
        expect(restored).toEqual(next)
        expect(() => deleteSwitchForAutoAction(next, cycle, 'input')).toThrow(
          'AutoAction',
        )
        expect(() => deleteSwitchForAutoAction(next, cycle, 'missing')).toThrow(
          'AutoAction',
        )
        // 삭제된 교체는 복구하지 않고 사용자가 지정한 새 교체만 생성한다.
        const recreated = addSwitch(
          setActiveCharacter(next, cycle, 'a'),
          cycle,
          'new',
          'b',
          'concerto',
        )
        expect(
          recreated[cycle].transitions.some(
            (item) => item.switchId === 'target',
          ),
        ).toBe(false)
      }
    },
  )
})
