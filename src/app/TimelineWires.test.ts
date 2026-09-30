import { describe, expect, it } from 'vitest'
import { orthogonalPath } from './timeline-path'

describe('타임라인 연결선', () => {
  it('같은 라인의 연속 행동은 수평선으로 연결한다', () => {
    expect(orthogonalPath(40, 36, 120, 36)).toBe('M 40 36 H 120')
  })

  it('다른 라인의 연속 행동은 직각 경로로 연결한다', () => {
    expect(orthogonalPath(40, 36, 120, 180)).toBe('M 40 36 H 80 V 180 H 120')
  })
})
