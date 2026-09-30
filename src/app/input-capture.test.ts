import { describe, expect, it } from 'vitest'
import { InputCapture, keyboardControl, mouseControl } from './input-capture'

describe('실제 입력 판정', () => {
  it('지원 control만 변환한다', () => {
    expect(
      [
        'KeyQ',
        'KeyE',
        'KeyR',
        'KeyT',
        'Space',
        'Digit1',
        'Digit2',
        'Digit3',
      ].map(keyboardControl),
    ).toEqual(['Q', 'E', 'R', 'T', 'Space', '1', '2', '3'])
    expect(keyboardControl('KeyW')).toBeUndefined()
    expect([0, 1, 2].map(mouseControl)).toEqual(['LMB', undefined, 'RMB'])
  })

  it('399ms tap과 400ms hold를 구분하며 repeat와 대응 press 없는 release를 무시한다', () => {
    const capture = new InputCapture('press')
    expect(capture.release('E', 0)).toEqual([])
    expect(capture.press('E', { cycleId: 'opening' }, 0)).toBe(true)
    expect(capture.press('E', { cycleId: 'opening' }, 100)).toBe(false)
    expect(capture.release('E', 399)[0].gesture).toBe('tap')
    capture.press('RMB', { cycleId: 'repeat' }, 500)
    expect(capture.release('RMB', 900)[0]).toEqual({
      control: 'RMB',
      gesture: 'hold',
      target: { cycleId: 'repeat' },
    })
    expect(capture.release('RMB', 901)).toEqual([])
  })

  it('press 순서는 먼저 누른 입력이 release될 때까지 기다린다', () => {
    const capture = new InputCapture('press')
    capture.press('Q', { cycleId: 'opening' }, 0)
    capture.press('E', { cycleId: 'opening' }, 1)
    expect(capture.release('E', 100)).toEqual([])
    expect(
      capture.release('Q', 500).map((item) => [item.control, item.gesture]),
    ).toEqual([
      ['Q', 'hold'],
      ['E', 'tap'],
    ])
  })

  it('취소한 입력은 나중 release에서도 기록하지 않는다', () => {
    const capture = new InputCapture('press')
    capture.press('LMB', { cycleId: 'opening' }, 0)
    capture.cancel()
    expect(capture.release('LMB', 1000)).toEqual([])
  })
})
