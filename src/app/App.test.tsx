// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from './App'

let root: Root
let time = 0
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  vi.spyOn(performance, 'now').mockImplementation(() => time)
  time = 0
  window.history.replaceState({}, '', '/?demo=input')
  document.body.innerHTML = '<div id="root"></div>'
  root = createRoot(document.querySelector('#root')!)
  await act(async () => root.render(<App />))
})
afterEach(async () => {
  await act(async () => root.unmount())
  Reflect.deleteProperty(document, 'elementFromPoint')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
const grid = (cycleId = 'opening') =>
  document.querySelector(`[data-capture-cycle="${cycleId}"]`)!
async function hover(element: Element) {
  await act(async () => {
    element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
  })
}
async function key(type: 'keydown' | 'keyup', code: string, duration = 0) {
  time += duration
  await act(async () => {
    document.dispatchEvent(
      new KeyboardEvent(type, { code, bubbles: true, cancelable: true }),
    )
  })
}

describe('App 실제 입력 연결', () => {
  it.each(['opening', 'repeat'])(
    '%s의 새 블록만 따라 스크롤하고 보이는 블록과 생성 없는 명령은 위치를 보존한다',
    async (cycleId) => {
      const scroll = grid(cycleId).closest<HTMLElement>('.timeline-scroll')!
      const other = grid(
        cycleId === 'opening' ? 'repeat' : 'opening',
      ).closest<HTMLElement>('.timeline-scroll')!
      Object.defineProperty(scroll, 'clientWidth', {
        configurable: true,
        value: 500,
      })
      scroll.scrollLeft = 30
      other.scrollLeft = 42
      let bounds = { left: 300, right: 450 }
      vi.spyOn(
        HTMLElement.prototype,
        'getBoundingClientRect',
      ).mockImplementation(function (this: HTMLElement) {
        if (this === scroll) return { left: 100, right: 600 } as DOMRect
        if (this.classList.contains('line-label'))
          return { left: 100, right: 260 } as DOMRect
        return bounds as DOMRect
      })
      await hover(grid(cycleId))
      await key('keydown', 'KeyE')
      await key('keyup', 'KeyE', 10)
      expect(scroll.scrollLeft).toBe(30)
      bounds = { left: 570, right: 750 }
      await key('keydown', 'KeyE')
      await key('keyup', 'KeyE', 10)
      expect(scroll.scrollLeft).toBe(180)
      expect(other.scrollLeft).toBe(42)
      await key('keydown', 'Digit1')
      await key('keyup', 'Digit1', 10)
      expect(scroll.scrollLeft).toBe(180)
      bounds = { left: 620, right: 800 }
      await key('keydown', 'Digit2')
      await key('keyup', 'Digit2', 200)
      expect(scroll.scrollLeft).toBe(380)
      expect(grid(cycleId).querySelectorAll('.auto-card')).toHaveLength(2)
      vi.useFakeTimers()
      bounds = { left: 200, right: 380 }
      await key('keydown', 'KeyF')
      time += 200
      await act(async () => {
        vi.advanceTimersByTime(200)
      })
      expect(scroll.scrollLeft).toBe(320)
      expect(other.scrollLeft).toBe(42)
      await key('keyup', 'KeyF')
      expect(scroll.scrollLeft).toBe(320)
    },
  )
  it('200ms에 생성된 RMB Hold 위의 메뉴를 막고 release는 중복 생성하지 않는다', async () => {
    vi.useFakeTimers()
    await act(async () => {
      grid().dispatchEvent(
        new MouseEvent('mousedown', { button: 2, bubbles: true }),
      )
    })
    time = 200
    await act(async () => {
      vi.advanceTimersByTime(200)
    })
    const card = grid().querySelector('.input-card')!
    expect(card.textContent).toContain('RMBHold')
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => card,
    })
    await hover(card)
    for (const target of [card, card.querySelector('.input-key')!]) {
      const menu = new MouseEvent('contextmenu', {
        button: 2,
        bubbles: true,
        cancelable: true,
      })
      await act(async () => {
        target.dispatchEvent(menu)
      })
      expect(menu.defaultPrevented).toBe(true)
    }
    await act(async () => {
      card.dispatchEvent(
        new MouseEvent('mouseup', { button: 2, bubbles: true }),
      )
    })
    expect(grid().querySelectorAll('.input-card')).toHaveLength(1)
    const outsideMenu = new MouseEvent('contextmenu', {
      button: 2,
      bubbles: true,
      cancelable: true,
    })
    await act(async () => {
      document.querySelector('header')!.dispatchEvent(outsideMenu)
    })
    expect(outsideMenu.defaultPrevented).toBe(false)
  })
  it('release 전에 F Hold와 협주 교체를 렌더링하며 release에서 중복하지 않는다', async () => {
    vi.useFakeTimers()
    await hover(grid())
    await key('keydown', 'KeyF')
    time += 199
    await act(async () => {
      vi.advanceTimersByTime(199)
    })
    expect(grid().querySelectorAll('.input-card')).toHaveLength(0)
    time += 1
    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    expect(grid().querySelector('.input-card')?.textContent).toContain('FHold')
    await key('keydown', 'KeyE')
    await key('keyup', 'KeyE', 10)
    await key('keyup', 'KeyF', 1000)
    expect(grid().querySelectorAll('.input-card')).toHaveLength(1)
    await key('keydown', 'Digit2')
    time += 200
    await act(async () => {
      vi.advanceTimersByTime(200)
    })
    expect(grid().querySelectorAll('.auto-card')).toHaveLength(2)
    expect(
      grid().querySelector('.active-line')?.getAttribute('data-row-owner'),
    ).toBe('demo-b')
    await key('keyup', 'Digit2', 1000)
    expect(grid().querySelectorAll('.auto-card')).toHaveLength(2)
  })
  it('공명자 선택 중 편집 영역을 숨기고 닫으면 입력 내용을 보존해 표시한다', async () => {
    await hover(grid())
    await key('keydown', 'KeyF')
    await key('keyup', 'KeyF', 10)
    await act(async () =>
      document.querySelector<HTMLButtonElement>('.party-slot')!.click(),
    )
    const workspace = document.querySelector<HTMLElement>('.workspace-grid')!
    expect(workspace.hidden).toBe(true)
    expect(document.querySelector('.character-selector')).not.toBeNull()
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>('.selector-heading > button')!
        .click(),
    )
    expect(workspace.hidden).toBe(false)
    expect(grid().querySelector('.input-card')?.textContent).toContain('FTap')
  })
  it('커서를 옮기지 않고 Backspace를 반복해 다음 블록을 삭제한다', async () => {
    await hover(grid())
    for (let index = 0; index < 3; index++) {
      await key('keydown', 'KeyE')
      await key('keyup', 'KeyE', 10)
    }
    // 삭제 후 같은 화면 좌표로 당겨져 온 첫 블록을 브라우저 hit test가 반환한다.
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => grid().querySelector('.input-card'),
    })
    await hover(grid().querySelector('.input-card')!)
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Delete',
          bubbles: true,
          cancelable: true,
        }),
      )
    })
    expect(grid().querySelectorAll('.input-card')).toHaveLength(3)
    for (const remaining of [2, 1, 0]) {
      await act(async () => {
        window.dispatchEvent(
          new KeyboardEvent('keydown', {
            key: 'Backspace',
            bubbles: true,
            cancelable: true,
          }),
        )
      })
      expect(grid().querySelectorAll('.input-card')).toHaveLength(remaining)
    }
    Reflect.deleteProperty(document, 'elementFromPoint')
  })

  it('협주 자동 행동 삭제 시 linked pair와 블록 없는 독립 교체선을 제거한다', async () => {
    await hover(grid())
    await key('keydown', 'Digit2')
    await key('keyup', 'Digit2', 500)
    expect(grid().querySelectorAll('.auto-card')).toHaveLength(2)
    expect(grid().querySelectorAll('.wire-transition')).toHaveLength(1)
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => grid().querySelector('.auto-card'),
    })
    await hover(grid().querySelector('.auto-card')!)
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Backspace',
          bubbles: true,
          cancelable: true,
        }),
      )
    })
    expect(
      grid().querySelectorAll('.auto-card, .wire-transition, .wire-flow'),
    ).toHaveLength(0)
    expect(
      grid().querySelector('.active-line')?.getAttribute('data-row-owner'),
    ).toBe('demo-b')
    Reflect.deleteProperty(document, 'elementFromPoint')
  })
  it('같은 번호의 tap/hold는 안내와 블록 없이 무시한다', async () => {
    await hover(grid())
    for (const duration of [10, 500]) {
      await key('keydown', 'Digit1')
      await key('keyup', 'Digit1', duration)
    }
    expect(grid().querySelectorAll('.input-card, .auto-card')).toHaveLength(0)
    expect(document.querySelector('[role="status"]')).toBeNull()
    expect(
      grid().querySelector('.active-line')?.getAttribute('data-row-owner'),
    ).toBe('demo-a')
  })
  it('동시 입력은 Q 하나만 렌더링하고 숫자키 교체 후 도착 라인에 기록한다', async () => {
    await hover(grid())
    await key('keydown', 'KeyQ')
    await key('keydown', 'KeyE', 10)
    await key('keyup', 'KeyE', 10)
    await key('keyup', 'KeyQ', 480)
    expect(grid().querySelectorAll('.input-card')).toHaveLength(1)
    expect(grid().querySelector('.input-card')?.textContent).toContain('QHold')
    await key('keydown', 'Digit2')
    await key('keyup', 'Digit2', 500)
    expect(grid().querySelectorAll('.auto-card')).toHaveLength(2)
    expect(
      grid().querySelector('.active-line')?.getAttribute('data-row-owner'),
    ).toBe('demo-b')
    await key('keydown', 'KeyE')
    await key('keyup', 'KeyE', 10)
    expect(grid().querySelectorAll('.input-card')).toHaveLength(2)
    expect(
      grid('repeat').querySelectorAll('.input-card, .auto-card'),
    ).toHaveLength(0)
    expect(document.querySelector('.skills-context')?.textContent).toContain(
      '데모 공명자 B',
    )
  })

  it('React 재렌더 뒤에도 block hover 및 공명자 선택창은 캡처하지 않는다', async () => {
    await hover(grid())
    await key('keydown', 'KeyE')
    await key('keyup', 'KeyE', 10)
    await hover(grid().querySelector('.input-card')!)
    await key('keydown', 'KeyE')
    await key('keyup', 'KeyE', 10)
    expect(grid().querySelectorAll('.input-card')).toHaveLength(1)
    await act(async () =>
      document.querySelector<HTMLButtonElement>('.party-slot')!.click(),
    )
    await hover(grid())
    await key('keydown', 'KeyE')
    await key('keyup', 'KeyE', 10)
    expect(grid().querySelectorAll('.input-card')).toHaveLength(1)
  })
})
