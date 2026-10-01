// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { showDragPreview } from './drag-preview'

const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.splice(0).forEach((dispose) => dispose())
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

it.each([
  '<div class="input-card"><span>LMB</span></div>',
  '<div class="input-card" data-skill-count="1"><img src="/icon.webp"><span>기본 공격</span></div>',
  '<div class="catalog-skill"><img src="/icon.webp"><span>불사조의 힘</span></div>',
  '<span class="linked-skill"><img src="/icon.webp"><span>공명 스킬</span></span>',
])(
  '카드 이미지·텍스트를 복제해 원본과 별도로 커서를 추적한다: %s',
  (markup) => {
    document.body.innerHTML = markup
    const source = document.body.firstElementChild as HTMLElement
    source.id = 'source'
    source.dataset.actionId = 'action'
    vi.spyOn(source, 'getBoundingClientRect').mockReturnValue({
      left: 10,
      top: 20,
      width: 130,
      height: 120,
    } as DOMRect)
    const setDragImage = vi.fn()
    cleanup.push(
      showDragPreview(source, { setDragImage } as unknown as DataTransfer, {
        x: 40,
        y: 55,
      }),
    )
    const preview = document.querySelector<HTMLElement>('.drag-preview')!
    expect(preview.textContent).toBe(source.textContent)
    expect(preview.querySelector('img')?.getAttribute('src')).toBe(
      source.querySelector('img')?.getAttribute('src'),
    )
    expect(preview.getAttribute('aria-hidden')).toBe('true')
    expect(preview.querySelector('[id],[data-action-id]')).toBeNull()
    expect(preview.style.transform).toBe('translate3d(10px, 20px, 0)')
    expect(setDragImage.mock.calls[0][0]).toBeInstanceOf(HTMLCanvasElement)
    document.dispatchEvent(
      new MouseEvent('dragover', { clientX: 240, clientY: 355, bubbles: true }),
    )
    expect(preview.style.transform).toBe('translate3d(210px, 320px, 0)')
    document.dispatchEvent(
      new MouseEvent('drag', { clientX: 0, clientY: 0, bubbles: true }),
    )
    expect(preview.style.transform).toBe('translate3d(210px, 320px, 0)')
    document.dispatchEvent(new Event('drop', { bubbles: true }))
    expect(document.querySelector('.drag-preview')).toBeNull()
    expect(document.querySelector('.drag-preview-native')).toBeNull()
    expect(source.isConnected).toBe(true)
  },
)

it.each(['dragend', 'blur', 'dispose'])(
  '%s에서 preview와 이벤트를 정리한다',
  (stop) => {
    const source = document.createElement('div')
    document.body.append(source)
    const dispose = showDragPreview(
      source,
      { setDragImage: vi.fn() } as unknown as DataTransfer,
      { x: 0, y: 0 },
    )
    cleanup.push(dispose)
    if (stop === 'dispose') dispose()
    else if (stop === 'blur') window.dispatchEvent(new Event('blur'))
    else document.dispatchEvent(new Event('dragend'))
    document.dispatchEvent(
      new MouseEvent('dragover', { clientX: 300, clientY: 300 }),
    )
    expect(document.querySelector('.drag-preview')).toBeNull()
    expect(document.querySelector('.drag-preview-native')).toBeNull()
  },
)
