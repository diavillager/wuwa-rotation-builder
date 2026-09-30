import { describe, expect, it } from 'vitest'
import {
  createRotation,
  reorderParty,
  setActiveCharacter,
} from '../domain/rotation'
import { applyCapturedInput } from './input-command'
import { demoCatalog } from './demo'
import type { CaptureControl } from './input-capture'

let sequence = 0
const nextId = () => `capture-${++sequence}`
const input = (control: CaptureControl, gesture: 'tap' | 'hold' = 'tap') => ({
  control,
  gesture,
  target: { cycleId: 'opening' as const },
})

describe('캡처 결과의 도메인 연결', () => {
  it('같은 번호는 tap/hold 모두 카탈로그 조회나 ID 생성 없이 무시한다', () => {
    const original = createRotation(['demo-a', 'demo-b', 'demo-c'])
    for (const gesture of ['tap', 'hold'] as const) {
      expect(
        applyCapturedInput(
          original,
          { characters: [] },
          input('1', gesture),
          () => {
            throw new Error('ID를 만들면 안 됩니다.')
          },
        ),
      ).toBe(original)
    }
  })
  it('일반 입력에는 스킬을 자동 연결하지 않고 다른 Cycle을 보존한다', () => {
    const original = createRotation(['demo-a', 'demo-b', 'demo-c'])
    const result = applyCapturedInput(original, demoCatalog, input('E'), nextId)
    expect(result.opening.columns[0]).toMatchObject({
      ownerId: 'demo-a',
      action: { type: 'input', input: 'E', skills: [] },
    })
    expect(result.repeat).toBe(original.repeat)
    expect(original.opening.columns).toEqual([])
  })

  it('숫자키는 현재 파티 목적지로 일반 교체하며 입력 열을 만들지 않는다', () => {
    const original = reorderParty(
      createRotation(['demo-a', 'demo-b', 'demo-c']),
      ['demo-a', 'demo-c', 'demo-b'],
    )
    const result = applyCapturedInput(original, demoCatalog, input('2'), nextId)
    expect(result.opening.transitions[0]).toMatchObject({
      fromId: 'demo-a',
      toId: 'demo-c',
      kind: 'normal',
    })
    expect(result.opening.activeCharacterId).toBe('demo-c')
    expect(result.opening.columns).toHaveLength(1)
    expect(result.opening.columns[0].action).toMatchObject({
      type: 'autoAction',
      skillRef: 'demo-c-normal',
    })
    expect(result.repeat).toBe(original.repeat)
  })

  it('협주는 퇴장자 반주와 등장자 변주를 별도 열로 만든다', () => {
    const result = applyCapturedInput(
      createRotation(['demo-a', 'demo-b', 'demo-c']),
      demoCatalog,
      input('2', 'hold'),
      nextId,
    )
    expect(
      result.opening.columns.map((item) => [
        item.ownerId,
        item.action.type === 'autoAction' && item.action.skillRef,
      ]),
    ).toEqual([
      ['demo-a', 'demo-a-outro'],
      ['demo-b', 'demo-b-intro'],
    ])
    expect(
      result.opening.columns.every(
        (item) =>
          item.action.type === 'autoAction' &&
          item.action.switchId === result.opening.transitions[0].switchId,
      ),
    ).toBe(true)
  })

  it('기존 outgoing 교체 앞에 삽입하며 AutoAction과 anchor를 보존한다', () => {
    let result = applyCapturedInput(
      createRotation(['demo-a', 'demo-b', 'demo-c']),
      demoCatalog,
      input('2', 'hold'),
      nextId,
    )
    result = setActiveCharacter(result, 'opening', 'demo-a')
    result = applyCapturedInput(result, demoCatalog, input('E'), nextId)
    expect(result.opening.columns.map((item) => item.action.type)).toEqual([
      'input',
      'autoAction',
      'autoAction',
    ])
    expect(result.opening.transitions[0].afterColumnId).toBe(
      result.opening.columns[1].id,
    )
  })

  it('동일 슬롯은 무시하고 미지정 또는 자동 행동 누락은 원본을 변경하지 않는다', () => {
    const original = createRotation(['demo-a', 'demo-b', 'demo-c'])
    expect(applyCapturedInput(original, demoCatalog, input('1'), nextId)).toBe(
      original,
    )
    const missing = {
      characters: demoCatalog.characters.map((item) => ({
        ...item,
        autoActions: undefined,
      })),
    }
    expect(() =>
      applyCapturedInput(original, missing, input('2'), nextId),
    ).toThrow('자동 행동')
    expect(() =>
      applyCapturedInput(
        createRotation(['demo-a', 'slot-two', 'demo-c']),
        demoCatalog,
        input('2'),
        nextId,
      ),
    ).toThrow('슬롯')
    expect(original.opening.columns).toEqual([])
    expect(original.opening.transitions).toEqual([])
  })
})
