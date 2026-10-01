import { describe, expect, it } from 'vitest'
import { deleteAutoAction, replacePartyCharacter } from '../domain/rotation'
import { createContinuityDemoRotation, createDemoRotation } from './demo'
import { hasFlowConnection } from './timeline-continuity'

describe('공명자 변경 후 시간 흐름선', () => {
  it('중간 공명자 변경 시 양쪽 Cycle의 다른 입력을 보존하고 끊어진 구간을 연결하지 않는다', () => {
    const before = createContinuityDemoRotation()
    const snapshot = JSON.stringify(before)
    const after = replacePartyCharacter(before, 1, 'demo-e')
    for (const cycleId of ['opening', 'repeat'] as const) {
      const expected = before[cycleId].columns.filter(
        (column) =>
          column.action.type === 'input' && column.ownerId !== 'demo-b',
      )
      const cycle = after[cycleId]
      expect(cycle.columns).toEqual(expected)
      expect(
        cycle.columns.map(
          (column) => column.action.type === 'input' && column.action.input,
        ),
      ).toEqual(['LMB', 'LMB', 'LMB', 'R'])
      expect(cycle.transitions).toEqual([])
      expect(cycle.columns.some((column) => column.ownerId === 'demo-e')).toBe(
        false,
      )
      expect(
        hasFlowConnection(
          cycle.columns[0],
          cycle.columns[1],
          cycle.transitions,
        ),
      ).toBe(true)
      expect(
        hasFlowConnection(
          cycle.columns[1],
          cycle.columns[2],
          cycle.transitions,
        ),
      ).toBe(true)
      expect(
        hasFlowConnection(
          cycle.columns[2],
          cycle.columns[3],
          cycle.transitions,
        ),
      ).toBe(false)
    }
    expect(JSON.stringify(before)).toBe(snapshot)
  })

  it('정상 일반·협주 교체는 연결하고 AutoAction 삭제 후에도 실제 교체를 따른다', () => {
    const normal = createContinuityDemoRotation().opening
    expect(
      hasFlowConnection(
        normal.columns[2],
        normal.columns[3],
        normal.transitions,
      ),
    ).toBe(true)
    const concerto = createDemoRotation()
    const columns = concerto.opening.columns
    expect(
      hasFlowConnection(columns[0], columns[1], concerto.opening.transitions),
    ).toBe(true)
    expect(
      hasFlowConnection(columns[1], columns[2], concerto.opening.transitions),
    ).toBe(true)
    const suppressed = deleteAutoAction(concerto, 'opening', 'demo-out').opening
    expect(
      hasFlowConnection(
        suppressed.columns[0],
        suppressed.columns[1],
        suppressed.transitions,
      ),
    ).toBe(true)
  })
})
