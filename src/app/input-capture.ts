import type { CycleId, Gesture, InputControl } from '../domain/rotation'

export type CaptureControl = InputControl | '1' | '2' | '3'
export const HOLD_MS = 500
export interface CaptureTarget {
  cycleId: CycleId
}
export interface CapturedInput {
  control: CaptureControl
  gesture: Gesture
  target: CaptureTarget
}

const KEY_CONTROLS: Record<string, CaptureControl> = {
  KeyQ: 'Q',
  KeyE: 'E',
  KeyR: 'R',
  KeyT: 'T',
  KeyF: 'F',
  Space: 'Space',
  Digit1: '1',
  Digit2: '2',
  Digit3: '3',
}

export function keyboardControl(code: string): CaptureControl | undefined {
  return KEY_CONTROLS[code]
}

export function mouseControl(button: number): CaptureControl | undefined {
  return button === 0 ? 'LMB' : button === 2 ? 'RMB' : undefined
}

/** 진행 중 입력은 Rotation에 저장하지 않고 확정한 결과만 전달한다. */
export class InputCapture {
  private pending: {
    control: CaptureControl
    target: CaptureTarget
    startedAt: number
    emitted: boolean
  } | null = null

  press(control: CaptureControl, target: CaptureTarget, now: number): boolean {
    if (this.pending) return false
    this.pending = {
      control,
      target: { ...target },
      startedAt: now,
      emitted: false,
    }
    return true
  }

  release(control: CaptureControl, now: number): CapturedInput[] {
    const item = this.pending
    if (!item || item.control !== control) return []
    this.pending = null
    if (item.emitted) return []
    return [
      {
        control,
        target: item.target,
        gesture: now - item.startedAt < HOLD_MS ? 'tap' : 'hold',
      },
    ]
  }

  expire(now: number): CapturedInput[] {
    const item = this.pending
    if (!item || item.emitted || now - item.startedAt < HOLD_MS) return []
    item.emitted = true
    return [{ control: item.control, target: item.target, gesture: 'hold' }]
  }

  cancel() {
    // 이미 생성한 Hold는 되돌리지 않으며 release까지 중첩 입력을 막는다.
    if (this.pending?.emitted) return
    this.pending = null
  }

  reset() {
    this.pending = null
  }
}
