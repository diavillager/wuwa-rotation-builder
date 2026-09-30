import type { CycleId, Gesture, InputControl } from '../domain/rotation'

export type CaptureControl = InputControl | '1' | '2' | '3'
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
    result?: CapturedInput
  }[] = []

  constructor(private readonly order: 'press' | 'release') {}

  press(control: CaptureControl, target: CaptureTarget, now: number): boolean {
    if (this.pending.some((item) => item.control === control)) return false
    this.pending.push({ control, target: { ...target }, startedAt: now })
    return true
  }

  release(control: CaptureControl, now: number): CapturedInput[] {
    const item = this.pending.find((candidate) => candidate.control === control)
    if (!item || item.result) return []
    item.result = {
      control,
      target: item.target,
      gesture: now - item.startedAt < 400 ? 'tap' : 'hold',
    }
    if (this.order === 'release') {
      this.pending = this.pending.filter((candidate) => candidate !== item)
      return [item.result]
    }
    const results: CapturedInput[] = []
    while (this.pending[0]?.result) results.push(this.pending.shift()!.result!)
    return results
  }

  cancel() {
    this.pending = []
  }
}
