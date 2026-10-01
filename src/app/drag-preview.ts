/** 이미지가 든 카드도 native drag snapshot과 무관하게 커서에 붙여 표시한다. */
export function showDragPreview(
  source: HTMLElement,
  transfer: DataTransfer,
  point: { x: number; y: number },
): () => void {
  const doc = source.ownerDocument
  const win = doc.defaultView!
  const bounds = source.getBoundingClientRect()
  const x = Number.isFinite(point.x) ? point.x : bounds.left
  const y = Number.isFinite(point.y) ? point.y : bounds.top
  const offsetX = Math.max(0, Math.min(bounds.width, x - bounds.left))
  const offsetY = Math.max(0, Math.min(bounds.height, y - bounds.top))
  const preview = doc.createElement('div')
  preview.className = 'drag-preview'
  preview.setAttribute('aria-hidden', 'true')
  const clone = source.cloneNode(true) as HTMLElement
  for (const element of [clone, ...clone.querySelectorAll('*')]) {
    element.removeAttribute('id')
    element.removeAttribute('draggable')
    for (const name of element.getAttributeNames())
      if (name.startsWith('data-') && name !== 'data-skill-count')
        element.removeAttribute(name)
  }
  clone.style.width = `${bounds.width}px`
  clone.style.height = `${bounds.height}px`
  clone.style.margin = '0'
  preview.append(clone)
  doc.body.append(preview)
  const move = (clientX: number, clientY: number) => {
    preview.style.transform = `translate3d(${clientX - offsetX}px, ${clientY - offsetY}px, 0)`
  }
  move(x, y)
  // 빈 canvas는 투명한 native drag image로만 사용한다.
  const blank = doc.createElement('canvas')
  blank.width = blank.height = 1
  blank.className = 'drag-preview-native'
  blank.setAttribute('aria-hidden', 'true')
  doc.body.append(blank)
  transfer.setDragImage(blank, 0, 0)
  const over = (event: DragEvent) => move(event.clientX, event.clientY)
  const drag = (event: DragEvent) => {
    // 종료 직전 일부 브라우저가 보내는 (0, 0) 좌표로 튀지 않게 한다.
    if (event.clientX || event.clientY) move(event.clientX, event.clientY)
  }
  const leave = (event: DragEvent) => {
    if (!event.relatedTarget) preview.style.visibility = 'hidden'
  }
  const enter = (event: DragEvent) => {
    preview.style.visibility = 'visible'
    over(event)
  }
  const visibility = () => {
    if (doc.hidden) dispose()
  }
  function dispose() {
    preview.remove()
    blank.remove()
    doc.removeEventListener('dragover', enter, true)
    doc.removeEventListener('drag', drag, true)
    doc.removeEventListener('dragleave', leave, true)
    doc.removeEventListener('drop', dispose, true)
    doc.removeEventListener('dragend', dispose, true)
    doc.removeEventListener('visibilitychange', visibility)
    win.removeEventListener('blur', dispose)
  }
  doc.addEventListener('dragover', enter, true)
  doc.addEventListener('drag', drag, true)
  doc.addEventListener('dragleave', leave, true)
  doc.addEventListener('drop', dispose, true)
  doc.addEventListener('dragend', dispose, true)
  doc.addEventListener('visibilitychange', visibility)
  win.addEventListener('blur', dispose)
  return dispose
}
