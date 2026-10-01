// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { attachDragScroll, dragScrollDirection } from './drag-scroll'

afterEach(() => vi.restoreAllMocks())

describe('드래그 가장자리 스크롤', () => {
  it('배치 영역 가장자리만 인식하고 고정 라벨·중앙·스크롤바·영역 밖은 제외한다', () => {
    const bounds = { left: 260, right: 600, top: 100, bottom: 300 }
    for (const [x, y, expected] of [
      [261, 150, -1],
      [599, 150, 1],
      [430, 150, 0],
      [259, 150, 0],
      [601, 150, 0],
      [599, 99, 0],
      [599, 300, 0],
    ])
      expect(dragScrollDirection(x, y, bounds)).toBe(expected)
  })

  it.each(['center', 'outside', 'drop', 'dragend', 'blur', 'dispose'])(
    '%s 시 반복 프레임을 중단하고 스크롤 최대 범위를 넘지 않는다',
    (ending) => {
      document.body.innerHTML =
        '<div id="scroll"><button class="line-label"></button><div id="cell"></div></div><div id="outside"></div>'
      const scroll = document.querySelector<HTMLElement>('#scroll')!
      const cell = document.querySelector<HTMLElement>('#cell')!
      // SkillBlock 내부에서 이벤트 전파를 막아도 가장자리 제어는 유지한다.
      for (const name of ['dragover', 'dragleave', 'drop', 'dragend'])
        cell.addEventListener(name, (event) => event.stopPropagation())
      Object.defineProperties(scroll, {
        clientWidth: { value: 500 },
        clientHeight: { value: 200 },
        scrollWidth: { value: 1000 },
      })
      vi.spyOn(scroll, 'getBoundingClientRect').mockReturnValue({
        left: 100,
        top: 100,
      } as DOMRect)
      vi.spyOn(
        scroll.querySelector('.line-label')!,
        'getBoundingClientRect',
      ).mockReturnValue({ right: 260 } as DOMRect)
      let pending: FrameRequestCallback | null = null
      vi.spyOn(window, 'requestAnimationFrame').mockImplementation(
        (callback) => {
          pending = callback
          return 1
        },
      )
      vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {
        pending = null
      })
      const dispose = attachDragScroll(document, (target) =>
        target === cell ? scroll : null,
      )
      const over = (x: number) =>
        cell.dispatchEvent(
          new MouseEvent('dragover', {
            clientX: x,
            clientY: 150,
            bubbles: true,
            cancelable: true,
          }),
        )
      const tick = (time: number) => {
        const callback = pending
        pending = null
        callback?.(time)
      }
      scroll.scrollLeft = 30
      over(599)
      tick(0)
      tick(16)
      expect(scroll.scrollLeft).toBeGreaterThan(40)
      over(261)
      tick(32)
      expect(scroll.scrollLeft).toBeLessThan(40)
      scroll.scrollLeft = 499
      over(599)
      tick(48)
      expect(scroll.scrollLeft).toBe(500)
      tick(64)
      expect(pending).toBeNull()
      scroll.scrollLeft = 1
      over(261)
      tick(80)
      expect(scroll.scrollLeft).toBe(0)
      tick(96)
      expect(pending).toBeNull()
      scroll.scrollLeft = 30
      over(599)
      if (ending === 'center') over(430)
      else if (ending === 'outside')
        cell.dispatchEvent(
          new MouseEvent('dragleave', {
            relatedTarget: document.querySelector('#outside'),
            bubbles: true,
          }),
        )
      else if (ending === 'blur') window.dispatchEvent(new Event('blur'))
      else if (ending === 'dispose') dispose()
      else cell.dispatchEvent(new Event(ending, { bubbles: true }))
      expect(pending).toBeNull()
      tick(112)
      expect(scroll.scrollLeft).toBe(30)
      dispose()
    },
  )
})
