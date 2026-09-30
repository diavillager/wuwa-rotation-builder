import { describe, expect, it } from 'vitest'
import {
  assertRotation,
  createRotation,
  deleteAutoAction,
  setActiveCharacter,
} from '../domain/rotation'
import { demoCatalog } from './demo'
import { applyCapturedInput } from './input-command'
import type { CaptureControl, CaptureTarget } from './input-capture'

let sequence = 0
const nextId = () => `manual-${++sequence}`
const command = (
  control: CaptureControl,
  target: CaptureTarget,
  gesture: 'tap' | 'hold' = 'tap',
) => ({ control, target, gesture })
const initial = () => createRotation(['demo-a', 'demo-b', 'demo-c'])
const a = { cycleId: 'opening' as const, ownerId: 'demo-a' }

describe('수동 입력·교체 경계', () => {
  it.each(['tap', 'hold'] as const)(
    '끊어진 중간 경계에 %s 교체를 넣고 후속 입력·소유권을 보존한다',
    (gesture) => {
      let state = applyCapturedInput(
        initial(),
        demoCatalog,
        command('Q', a),
        nextId,
      )
      const anchor = state.opening.columns[0].id
      state = applyCapturedInput(
        state,
        demoCatalog,
        command('R', { ...a, ownerId: 'demo-c' }),
        nextId,
      )
      const original = state
      const next = applyCapturedInput(
        state,
        demoCatalog,
        command('3', { ...a, afterColumnId: anchor }, gesture),
        nextId,
      )
      expect(next.opening.columns[0]).toBe(original.opening.columns[0])
      expect(next.opening.columns.at(-1)).toBe(original.opening.columns[1])
      expect(
        next.opening.columns.filter(
          (column) => column.action.type === 'autoAction',
        ),
      ).toHaveLength(gesture === 'hold' ? 2 : 1)
      expect(next.opening.transitions[0]).toMatchObject({
        fromId: 'demo-a',
        toId: 'demo-c',
        kind: gesture === 'hold' ? 'concerto' : 'normal',
      })
      expect(next.opening.activeCharacterId).toBe('demo-a')
      expect(next.repeat).toBe(original.repeat)
      assertRotation(next)
    },
  )
  it('InputBlock 뒤 입력은 순서와 소유권을 보존하고 잘못된 대상은 원본을 변경하지 않는다', () => {
    let state = applyCapturedInput(
      initial(),
      demoCatalog,
      command('Q', a),
      nextId,
    )
    state = applyCapturedInput(state, demoCatalog, command('R', a), nextId)
    const next = applyCapturedInput(
      state,
      demoCatalog,
      command('F', { ...a, afterColumnId: state.opening.columns[0].id }),
      nextId,
    )
    expect(
      next.opening.columns.map(
        (column) => column.action.type === 'input' && column.action.input,
      ),
    ).toEqual(['Q', 'F', 'R'])
    expect(
      next.opening.columns.every((column) => column.ownerId === 'demo-a'),
    ).toBe(true)
    expect(() =>
      applyCapturedInput(
        state,
        demoCatalog,
        command('E', { ...a, afterColumnId: 'missing' }),
        nextId,
      ),
    ).toThrow('삽입 대상')
    expect(() =>
      applyCapturedInput(
        state,
        demoCatalog,
        command('2', { ...a, afterColumnId: 'missing' }),
        nextId,
      ),
    ).toThrow('삽입 대상')
    expect(state.opening.columns).toHaveLength(2)
  })
  it('새 중간 교체가 추가돼도 라인 끝은 생성 시각이 아닌 Timeline 순서로 찾는다', () => {
    let state = applyCapturedInput(
      initial(),
      demoCatalog,
      command('Q', a),
      nextId,
    )
    const anchor = state.opening.columns[0].id
    state = applyCapturedInput(state, demoCatalog, command('2', a), nextId)
    const b = { ...a, ownerId: 'demo-b' }
    state = applyCapturedInput(state, demoCatalog, command('E', b), nextId)
    state = applyCapturedInput(state, demoCatalog, command('3', b), nextId)
    state = applyCapturedInput(
      state,
      demoCatalog,
      command('2', { ...a, afterColumnId: anchor }),
      nextId,
    )
    state = applyCapturedInput(state, demoCatalog, command('F', b), nextId)
    const fIndex = state.opening.columns.findIndex(
      (column) => column.action.type === 'input' && column.action.input === 'F',
    )
    const cIndex = state.opening.columns.findIndex(
      (column) => column.ownerId === 'demo-c',
    )
    expect(fIndex).toBe(cIndex - 1)
    assertRotation(state)
  })
  it('suppression된 기존 교체를 복원하거나 대체하지 않는다', () => {
    let state = applyCapturedInput(
      initial(),
      demoCatalog,
      command('Q', a),
      nextId,
    )
    const anchor = state.opening.columns[0].id
    state = applyCapturedInput(
      state,
      demoCatalog,
      command('2', a, 'hold'),
      nextId,
    )
    state = deleteAutoAction(
      state,
      'opening',
      state.opening.columns[1].action.id,
    )
    const previous = state
    const next = applyCapturedInput(
      state,
      demoCatalog,
      command('3', { ...a, afterColumnId: anchor }),
      nextId,
    )
    expect(next.opening.suppression).toEqual(previous.opening.suppression)
    expect(next.opening.transitions[0]).toEqual(previous.opening.transitions[0])
    expect(
      next.opening.columns.filter(
        (column) => column.action.type === 'autoAction',
      ),
    ).toHaveLength(1)
    expect(next.opening.activeCharacterId).toBe('demo-a')
    expect(setActiveCharacter(next, 'repeat', 'demo-b').opening).toBe(
      next.opening,
    )
    assertRotation(next)
  })
})
