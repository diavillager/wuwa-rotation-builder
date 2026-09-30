import type { CycleId } from '../domain/rotation'
import {
  InputCapture,
  keyboardControl,
  mouseControl,
  type CapturedInput,
} from './input-capture'

export interface CaptureEventsOptions {
  blocked: () => boolean
  commit: (inputs: CapturedInput[]) => void
  now?: () => number
}

const UI_SELECTOR =
  '.input-card, .auto-card, .line-label, button, input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="dialog"], [role="alertdialog"]'

/** 브라우저 이벤트와 순수 입력 판정 사이의 어댑터. */
export function attachCaptureEvents(
  doc: Document,
  options: CaptureEventsOptions,
) {
  const win = doc.defaultView!
  const capture = new InputCapture()
  const now = options.now ?? (() => win.performance.now())
  let cycleId: CycleId | null = null
  let point: { x: number; y: number } | null = null
  let rmbContext = false
  const typing = () =>
    doc.activeElement instanceof win.Element &&
    !!doc.activeElement.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
    )
  const targetCycle = (
    target: EventTarget | null,
    x: number,
    y: number,
  ): CycleId | null => {
    if (!(target instanceof win.Element) || target.closest(UI_SELECTOR))
      return null
    const grid = target.closest<HTMLElement>('[data-capture-cycle]')
    if (!grid) return null
    const scroll = grid.closest<HTMLElement>('.timeline-scroll')
    if (scroll) {
      const rect = scroll.getBoundingClientRect()
      if (
        rect.width > 0 &&
        (x >= rect.left + scroll.clientWidth ||
          y >= rect.top + scroll.clientHeight)
      )
        return null
    }
    const id = grid.dataset.captureCycle
    return id === 'opening' || id === 'repeat' ? id : null
  }
  const update = (target: EventTarget | null, x: number, y: number) => {
    const next = targetCycle(target, x, y)
    if (next !== cycleId || options.blocked() || typing()) {
      capture.cancel()
      rmbContext = false
    }
    cycleId = next
    point = { x, y }
  }
  const refresh = () => {
    if (point && doc.elementFromPoint)
      update(doc.elementFromPoint(point.x, point.y), point.x, point.y)
    if (options.blocked() || typing()) {
      capture.cancel()
      rmbContext = false
      return null
    }
    return cycleId
  }
  const onMove = (event: MouseEvent) =>
    update(event.target, event.clientX, event.clientY)
  const onOut = (event: MouseEvent) => {
    if (event.relatedTarget)
      update(event.relatedTarget, event.clientX, event.clientY)
    else reset()
  }
  const onKeyDown = (event: KeyboardEvent) => {
    const control = keyboardControl(event.code)
    const id = refresh()
    if (
      !control ||
      !id ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      event.isComposing
    )
      return
    event.preventDefault()
    if (!event.repeat) capture.press(control, { cycleId: id }, now())
  }
  const onKeyUp = (event: KeyboardEvent) => {
    const control = keyboardControl(event.code)
    if (!control || !refresh()) return
    const inputs = capture.release(control, now())
    if (inputs.length) {
      event.preventDefault()
      options.commit(inputs)
    }
  }
  const onDown = (event: MouseEvent) => {
    update(event.target, event.clientX, event.clientY)
    const control = mouseControl(event.button)
    const id = refresh()
    if (!control || !id || event.ctrlKey || event.altKey || event.metaKey)
      return
    event.preventDefault()
    const accepted = capture.press(control, { cycleId: id }, now())
    if (control === 'RMB') rmbContext = accepted
  }
  const onUp = (event: MouseEvent) => {
    update(event.target, event.clientX, event.clientY)
    const control = mouseControl(event.button)
    if (!control || !refresh()) return
    const inputs = capture.release(control, now())
    if (inputs.length) options.commit(inputs)
  }
  const onContext = (event: MouseEvent) => {
    const captured =
      rmbContext && event.button === 2 && !options.blocked() && !typing()
    rmbContext = false
    update(event.target, event.clientX, event.clientY)
    if (captured && !event.ctrlKey && !event.altKey && !event.metaKey)
      event.preventDefault()
  }
  function reset() {
    capture.cancel()
    cycleId = null
    point = null
    rmbContext = false
  }
  const onVisibility = () => {
    if (doc.hidden) reset()
  }
  const listeners = [
    ['mousemove', onMove],
    ['mouseover', onMove],
    ['mouseout', onOut],
    ['mousedown', onDown],
    ['mouseup', onUp],
    ['contextmenu', onContext],
    ['keydown', onKeyDown],
    ['keyup', onKeyUp],
    ['dragstart', reset],
    ['focusin', reset],
    ['visibilitychange', onVisibility],
  ] as const
  for (const [name, listener] of listeners)
    doc.addEventListener(name, listener as EventListener, true)
  win.addEventListener('blur', reset)
  return {
    cancel: reset,
    dispose: () => {
      reset()
      for (const [name, listener] of listeners)
        doc.removeEventListener(name, listener as EventListener, true)
      win.removeEventListener('blur', reset)
    },
  }
}
