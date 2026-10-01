const EDGE_WIDTH = 48
const SPEED = 480

/** 고정 라벨을 제외한 표시 영역에서만 방향을 판정한다. */
export function dragScrollDirection(
  x: number,
  y: number,
  bounds: { left: number; right: number; top: number; bottom: number },
): -1 | 0 | 1 {
  if (
    x < bounds.left ||
    x > bounds.right ||
    y < bounds.top ||
    y >= bounds.bottom
  )
    return 0
  const edge = Math.min(EDGE_WIDTH, (bounds.right - bounds.left) / 2)
  if (x < bounds.left + edge) return -1
  if (x > bounds.right - edge) return 1
  return 0
}

/** 드래그가 허용된 라인의 scroll 요소만 resolver가 반환한다. */
export function attachDragScroll(
  doc: Document,
  resolve: (target: EventTarget | null) => HTMLElement | null,
): () => void {
  const win = doc.defaultView!
  let target: HTMLElement | null = null
  let point = { x: 0, y: 0 }
  let frame: number | null = null
  let previousTime: number | null = null
  const stop = () => {
    if (frame !== null) win.cancelAnimationFrame(frame)
    frame = null
    target = null
    previousTime = null
  }
  const direction = () => {
    if (!target) return 0
    const rect = target.getBoundingClientRect()
    const label = target.querySelector('.line-label')?.getBoundingClientRect()
    return dragScrollDirection(point.x, point.y, {
      left: label?.right ?? rect.left,
      right: rect.left + target.clientWidth,
      top: rect.top + target.clientTop,
      bottom: rect.top + target.clientTop + target.clientHeight,
    })
  }
  const tick = (time: number) => {
    frame = null
    if (!target) return
    const dir = direction()
    const max = Math.max(0, target.scrollWidth - target.clientWidth)
    if (!dir || (dir < 0 ? target.scrollLeft <= 0 : target.scrollLeft >= max)) {
      stop()
      return
    }
    const elapsed =
      previousTime === null ? 16 : Math.min(32, time - previousTime)
    target.scrollLeft = Math.max(
      0,
      Math.min(max, target.scrollLeft + (dir * SPEED * elapsed) / 1000),
    )
    previousTime = time
    frame = win.requestAnimationFrame(tick)
  }
  const over = (event: DragEvent) => {
    const next = resolve(event.target)
    if (next !== target) stop()
    target = next
    point = { x: event.clientX, y: event.clientY }
    if (!direction()) {
      stop()
      return
    }
    event.preventDefault()
    if (frame === null) frame = win.requestAnimationFrame(tick)
  }
  const leave = (event: DragEvent) => {
    if (target && resolve(event.relatedTarget) !== target) stop()
  }
  const visibility = () => {
    if (doc.hidden) stop()
  }
  doc.addEventListener('dragover', over, true)
  doc.addEventListener('dragleave', leave, true)
  doc.addEventListener('drop', stop, true)
  doc.addEventListener('dragend', stop, true)
  doc.addEventListener('visibilitychange', visibility)
  win.addEventListener('blur', stop)
  return () => {
    stop()
    doc.removeEventListener('dragover', over, true)
    doc.removeEventListener('dragleave', leave, true)
    doc.removeEventListener('drop', stop, true)
    doc.removeEventListener('dragend', stop, true)
    doc.removeEventListener('visibilitychange', visibility)
    win.removeEventListener('blur', stop)
  }
}
