import { describe, expect, it } from 'vitest'
import { createDemoRotation } from './demo'
import { canDropInput, stageChangeFromWheel } from './editor-interaction'

describe('Editor 입력 편집 대상', () => {
  it('같은 Cycle과 소유 라인에만 InputBlock을 드롭한다', () => {
    const rotation = createDemoRotation()
    const source = { cycleId: 'opening' as const, columnId: 'demo-input-col-a' }
    expect(canDropInput(rotation, source, 'opening', 'demo-a')).toBe(true)
    expect(canDropInput(rotation, source, 'opening', 'demo-b')).toBe(false)
    expect(canDropInput(rotation, source, 'repeat', 'demo-a')).toBe(false)
    expect(canDropInput(rotation, null, 'opening', 'demo-a')).toBe(false)
    expect(
      canDropInput(
        rotation,
        { ...source, columnId: 'demo-out-col' },
        'opening',
        'demo-a',
      ),
    ).toBe(false)
  })

  it('가로 휠은 단수를 변경하지 않고 수직 휠만 방향에 따라 변경한다', () => {
    expect(stageChangeFromWheel(0)).toBe(0)
    expect(stageChangeFromWheel(-20)).toBe(1)
    expect(stageChangeFromWheel(20)).toBe(-1)
  })
})
