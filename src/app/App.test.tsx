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
const emptyLine = (ownerId = 'demo-a', cycleId = 'opening') =>
  grid(cycleId).querySelector(`[data-capture-owner="${ownerId}"].end-cell`)!
async function hover(element: Element) {
  if (element.hasAttribute('data-capture-cycle'))
    element = element.querySelector('.end-cell')!
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
async function dragDrop(source: Element, target: Element) {
  await act(async () => {
    const start = new Event('dragstart', { bubbles: true, cancelable: true })
    Object.defineProperty(start, 'dataTransfer', {
      value: { effectAllowed: '' },
    })
    source.dispatchEvent(start)
  })
  await act(async () => {
    target.dispatchEvent(new Event('drop', { bubbles: true, cancelable: true }))
  })
}

describe('App 실제 입력 연결', () => {
  it('교체 앞 입력 전체 삭제 후 뒤쪽 입력을 첫 셀로 드래그하면 교체 공격과 연결된다', async () => {
    await hover(emptyLine())
    await key('keydown', 'KeyE')
    await key('keyup', 'KeyE', 10)
    await key('keydown', 'Digit2')
    await key('keyup', 'Digit2', 10)
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => grid().querySelector('.input-card'),
    })
    await hover(grid().querySelector('.input-card')!)
    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Backspace',
          bubbles: true,
          cancelable: true,
        }),
      )
    })
    expect(grid().querySelectorAll('.input-card')).toHaveLength(0)
    Reflect.deleteProperty(document, 'elementFromPoint')
    await hover(grid().querySelector('[data-row-owner="demo-a"]')!)
    await key('keydown', 'KeyF')
    await key('keyup', 'KeyF', 10)
    const card = grid().querySelector('.input-card')!
    const firstCell = grid().querySelector(
      '[data-capture-owner="demo-a"][data-column-cell]',
    )!
    await dragDrop(card, firstCell)
    expect(grid().querySelector('[data-column-cell] .input-card')).toBe(card)
    expect(grid().querySelectorAll('.wire-flow')).toHaveLength(1)
    expect(grid().querySelectorAll('.auto-card')).toHaveLength(1)
    expect(
      grid('repeat').querySelectorAll('.input-card,.auto-card'),
    ).toHaveLength(0)
  })

  it.each(['opening', 'repeat'])(
    '%s에서 스킬 추가로 넓어진 입력 블록을 따라 스크롤하되 이미 보이거나 거절된 drop은 유지한다',
    async (cycleId) => {
      await hover(emptyLine('demo-a', cycleId))
      await key('keydown', 'KeyE')
      await key('keyup', 'KeyE', 10)
      const card = grid(cycleId).querySelector<HTMLElement>('.input-card')!
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
      let right = 450
      vi.spyOn(
        HTMLElement.prototype,
        'getBoundingClientRect',
      ).mockImplementation(function (this: HTMLElement) {
        if (this === scroll) return { left: 100, right: 600 } as DOMRect
        if (this.classList.contains('line-label'))
          return { left: 100, right: 260 } as DOMRect
        return { left: 300, right } as DOMRect
      })
      await dragDrop(document.querySelector('.catalog-skill')!, card)
      expect(card.querySelectorAll('.linked-skill')).toHaveLength(1)
      expect(scroll.scrollLeft).toBe(30)
      right = 750
      await dragDrop(document.querySelector('.catalog-skill')!, card)
      expect(card.querySelectorAll('.linked-skill')).toHaveLength(2)
      expect(scroll.scrollLeft).toBe(180)
      expect(other.scrollLeft).toBe(42)
      await hover(emptyLine('demo-b', cycleId))
      right = 900
      await dragDrop(document.querySelector('.catalog-skill')!, card)
      expect(card.querySelectorAll('.linked-skill')).toHaveLength(2)
      expect(scroll.scrollLeft).toBe(180)
      expect(other.scrollLeft).toBe(42)
    },
  )

  it('공명자 항목에서 커서 이동 없이 LMB×3 → 2 → E → 3 Hold → R을 이어 쓴다', async () => {
    const label = grid().querySelector<HTMLElement>(
      '[data-row-owner="demo-a"]',
    )!
    await hover(label)
    for (let index = 0; index < 3; index++) {
      await act(async () => {
        label.dispatchEvent(
          new MouseEvent('mousedown', {
            button: 0,
            bubbles: true,
            cancelable: true,
          }),
        )
        label.focus()
      })
      time += 10
      await act(async () =>
        label.dispatchEvent(
          new MouseEvent('mouseup', { button: 0, bubbles: true }),
        ),
      )
    }
    await key('keydown', 'Digit2')
    await key('keyup', 'Digit2', 10)
    // 항목 내부 이동·mouseover·매 keydown hit test가 A를 재선택하면 안 된다.
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => label,
    })
    await act(async () =>
      label
        .querySelector('span')!
        .dispatchEvent(new MouseEvent('mousemove', { bubbles: true })),
    )
    await hover(label)
    expect(
      grid().querySelector('.active-line')?.getAttribute('data-row-owner'),
    ).toBe('demo-b')
    await key('keydown', 'Digit2')
    await key('keyup', 'Digit2', 10)
    await key('keydown', 'KeyE')
    await key('keyup', 'KeyE', 10)
    vi.useFakeTimers()
    await key('keydown', 'Digit3')
    time += 200
    await act(async () => {
      vi.advanceTimersByTime(200)
    })
    expect(
      grid().querySelector('.active-line')?.getAttribute('data-row-owner'),
    ).toBe('demo-c')
    await key('keyup', 'Digit3')
    await key('keydown', 'KeyR')
    await key('keyup', 'KeyR', 10)
    const actions = Array.from(
      grid().querySelectorAll('[data-action-column]'),
    ).map((node) => ({
      owner: node
        .closest('[data-capture-owner]')
        ?.getAttribute('data-capture-owner'),
      text: node.textContent,
    }))
    expect(actions.map((item) => item.owner)).toEqual([
      'demo-a',
      'demo-a',
      'demo-a',
      'demo-b',
      'demo-b',
      'demo-b',
      'demo-c',
      'demo-c',
    ])
    expect(
      actions.slice(0, 3).every((item) => item.text?.includes('LMBTap')),
    ).toBe(true)
    expect(actions[4].text).toContain('ETap')
    expect(actions.at(-1)?.text).toContain('RTap')
    expect(grid().querySelectorAll('.wire-flow')).toHaveLength(7)
    expect(
      grid('repeat').querySelectorAll('[data-action-column]'),
    ).toHaveLength(0)
    Reflect.deleteProperty(document, 'elementFromPoint')
    // 배치 영역으로 이동하면 커서 라인을 따르고, 항목 재진입은 전역 끝을 사용한다.
    await hover(emptyLine())
    expect(
      grid().querySelector('.active-line')?.getAttribute('data-row-owner'),
    ).toBe('demo-a')
    await hover(label)
    await key('keydown', 'KeyF')
    await key('keyup', 'KeyF', 10)
    const aCells = grid().querySelectorAll(
      '[data-capture-owner="demo-a"][data-column-cell]',
    )
    expect(aCells[aCells.length - 1].textContent).toContain('FTap')
  })
  it('공명자 항목을 벗어나 재진입하거나 다른 항목에 들어가면 다시 활성화한다', async () => {
    const label = grid().querySelector('[data-row-owner="demo-a"]')!
    await hover(label)
    await key('keydown', 'Digit2')
    await key('keyup', 'Digit2', 10)
    expect(
      grid().querySelector('.active-line')?.getAttribute('data-row-owner'),
    ).toBe('demo-b')
    await hover(document.querySelector('header')!)
    expect(
      grid().querySelector('.active-line')?.getAttribute('data-row-owner'),
    ).toBe('demo-b')
    await hover(label)
    expect(
      grid().querySelector('.active-line')?.getAttribute('data-row-owner'),
    ).toBe('demo-a')
    await hover(grid().querySelector('[data-row-owner="demo-c"]')!)
    expect(
      grid().querySelector('.active-line')?.getAttribute('data-row-owner'),
    ).toBe('demo-c')
  })
  it('항목의 RMB Hold는 교체한 도착 공명자에 한 번 생성하고 메뉴를 차단한다', async () => {
    const label = grid().querySelector('[data-row-owner="demo-a"]')!
    await hover(label)
    await key('keydown', 'Digit2')
    await key('keyup', 'Digit2', 10)
    vi.useFakeTimers()
    await act(async () =>
      label.dispatchEvent(
        new MouseEvent('mousedown', {
          button: 2,
          bubbles: true,
          cancelable: true,
        }),
      ),
    )
    time += 200
    await act(async () => {
      vi.advanceTimersByTime(200)
    })
    const menu = new MouseEvent('contextmenu', {
      button: 2,
      bubbles: true,
      cancelable: true,
    })
    await act(async () => {
      label.dispatchEvent(menu)
      label.dispatchEvent(
        new MouseEvent('mouseup', { button: 2, bubbles: true }),
      )
    })
    expect(menu.defaultPrevented).toBe(true)
    expect(grid().querySelectorAll('.input-card')).toHaveLength(1)
    expect(grid().querySelector('.input-card')?.textContent).toContain(
      'RMBHold',
    )
    expect(
      grid()
        .querySelector('.input-card')
        ?.closest('[data-capture-owner]')
        ?.getAttribute('data-capture-owner'),
    ).toBe('demo-b')
    expect(
      grid().querySelector('.active-line')?.getAttribute('data-row-owner'),
    ).toBe('demo-b')
  })
  it('커서 라인을 즉시 강조하고 진열하며 클릭은 활성 라인을 바꾸지 않는다', async () => {
    await hover(emptyLine('demo-b'))
    expect(
      grid().querySelector('.active-line')?.getAttribute('data-row-owner'),
    ).toBe('demo-b')
    expect(document.querySelector('.skills-context')?.textContent).toContain(
      '데모 공명자 B',
    )
    await act(async () =>
      grid()
        .querySelector<HTMLButtonElement>('[data-row-owner="demo-a"]')!
        .click(),
    )
    expect(
      grid().querySelector('.active-line')?.getAttribute('data-row-owner'),
    ).toBe('demo-b')
    await hover(document.querySelector('.skills-panel')!)
    await key('keydown', 'KeyE')
    await key('keyup', 'KeyE', 10)
    expect(grid().querySelectorAll('.input-card')).toHaveLength(0)
    expect(
      grid().querySelector('.active-line')?.getAttribute('data-row-owner'),
    ).toBe('demo-b')
    await hover(emptyLine('demo-c', 'repeat'))
    expect(
      grid('repeat')
        .querySelector('.active-line')
        ?.getAttribute('data-row-owner'),
    ).toBe('demo-c')
    expect(
      grid().querySelector('.active-line')?.getAttribute('data-row-owner'),
    ).toBe('demo-b')
  })
  it('다른 라인으로 이동하면 미확정 Hold를 취소하고 새 입력은 커서 소유자로 만든다', async () => {
    vi.useFakeTimers()
    await hover(emptyLine())
    await key('keydown', 'KeyQ')
    await hover(emptyLine('demo-b'))
    time += 200
    await act(async () => {
      vi.advanceTimersByTime(200)
    })
    await key('keyup', 'KeyQ')
    expect(grid().querySelectorAll('.input-card')).toHaveLength(0)
    await key('keydown', 'KeyE')
    await key('keyup', 'KeyE', 10)
    expect(
      grid()
        .querySelector('.input-card')
        ?.closest('[data-capture-owner]')
        ?.getAttribute('data-capture-owner'),
    ).toBe('demo-b')
  })
  it('빈 셀은 라인 끝에, InputBlock은 그 뒤에 넣으며 첫 press 위치를 유지한다', async () => {
    await hover(emptyLine())
    for (const code of ['KeyQ', 'KeyR']) {
      await key('keydown', code)
      await key('keyup', code, 10)
    }
    const first = grid().querySelector('.input-card')!
    await hover(first)
    await key('keydown', 'KeyE')
    await hover(emptyLine())
    await key('keyup', 'KeyE', 10)
    expect(
      Array.from(grid().querySelectorAll('.input-key')).map(
        (node) => node.textContent,
      ),
    ).toEqual(['QTap', 'ETap', 'RTap'])
    await key('keydown', 'Digit2')
    await key('keyup', 'Digit2', 200)
    await key('keydown', 'KeyF')
    await key('keyup', 'KeyF', 10)
    const actions = Array.from(
      grid().querySelectorAll('[data-action-column]'),
    ).map((node) => node.textContent)
    expect(actions[3]).toContain('FTap')
    expect(actions[4]).toContain('반주')
  })
  it('공명자 변경으로 끊어진 A→C 구간을 새 공명자를 거쳐 직접 복구한다', async () => {
    await hover(emptyLine())
    for (let index = 0; index < 3; index++) {
      await key('keydown', 'KeyQ')
      await key('keyup', 'KeyQ', 10)
    }
    await key('keydown', 'Digit2')
    await key('keyup', 'Digit2', 10)
    await hover(emptyLine('demo-b'))
    await key('keydown', 'KeyE')
    await key('keyup', 'KeyE', 10)
    await key('keydown', 'Digit3')
    await key('keyup', 'Digit3', 10)
    await hover(emptyLine('demo-c'))
    await key('keydown', 'KeyR')
    await key('keyup', 'KeyR', 10)
    await act(async () =>
      document.querySelectorAll<HTMLButtonElement>('.party-slot')[1].click(),
    )
    await act(async () =>
      document
        .querySelector<HTMLButtonElement>('.character-options button')!
        .click(),
    )
    await act(async () =>
      document.querySelector<HTMLButtonElement>('.confirm-submit')!.click(),
    )
    expect(grid().querySelectorAll('.input-card')).toHaveLength(4)
    expect(grid().querySelectorAll('.wire-flow')).toHaveLength(2)
    const aCards = grid().querySelectorAll(
      '[data-capture-owner="demo-a"] .input-card',
    )
    await hover(aCards[2])
    await key('keydown', 'Digit2')
    await key('keyup', 'Digit2', 10)
    await hover(emptyLine('demo-e'))
    await key('keydown', 'KeyE')
    await key('keyup', 'KeyE', 10)
    await hover(
      grid().querySelector('[data-capture-owner="demo-e"] .input-card')!,
    )
    await key('keydown', 'Digit3')
    await key('keyup', 'Digit3', 200)
    const cards = Array.from(
      grid().querySelectorAll('[data-action-column]'),
    ).map((node) => node.textContent)
    expect(cards).toHaveLength(8)
    expect(cards.slice(0, 3).every((value) => value?.includes('QTap'))).toBe(
      true,
    )
    expect(cards.at(-1)).toContain('RTap')
    expect(grid().querySelectorAll('.wire-flow')).toHaveLength(7)
    expect(
      grid('repeat').querySelectorAll('[data-action-column]'),
    ).toHaveLength(0)
    expect(document.querySelector('[role="status"]')).toBeNull()
  })
  it('파티 슬롯 공명자를 변경한 뒤 숫자키로 새 공명자에게 교체한다', async () => {
    await act(async () => {
      document.querySelectorAll<HTMLButtonElement>('.party-slot')[1].click()
    })
    await act(async () => {
      document
        .querySelector<HTMLButtonElement>('.character-options button')!
        .click()
    })
    expect(document.querySelector<HTMLElement>('.workspace-grid')!.hidden).toBe(
      false,
    )
    await hover(grid())
    await key('keydown', 'Digit2')
    await key('keyup', 'Digit2', 10)
    expect(
      grid().querySelector('.active-line')?.getAttribute('data-row-owner'),
    ).toBe('demo-a')
    expect(grid().querySelector('.auto-card')?.textContent).toContain(
      '데모 E 교체 공격',
    )
    await hover(emptyLine('demo-e'))
    await key('keydown', 'Digit3')
    await key('keyup', 'Digit3', 200)
    expect(
      grid().querySelector('.active-line')?.getAttribute('data-row-owner'),
    ).toBe('demo-e')
    expect(grid().textContent).toContain('데모 E 반주')
    expect(document.querySelector('[role="status"]')).toBeNull()
  })
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
      emptyLine().dispatchEvent(
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
    ).toBe('demo-a')
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
    ).toBe('demo-a')
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
  it('동시 입력은 Q 하나만 기록하고 교체 뒤 커서를 옮겨 도착 라인에 입력한다', async () => {
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
    ).toBe('demo-a')
    await hover(emptyLine('demo-b'))
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

  it('InputBlock 뒤 입력을 캡처하고 공명자 선택창에서는 차단한다', async () => {
    await hover(grid())
    await key('keydown', 'KeyE')
    await key('keyup', 'KeyE', 10)
    await hover(grid().querySelector('.input-card')!)
    await key('keydown', 'KeyE')
    await key('keyup', 'KeyE', 10)
    expect(grid().querySelectorAll('.input-card')).toHaveLength(2)
    await act(async () =>
      document.querySelector<HTMLButtonElement>('.party-slot')!.click(),
    )
    await hover(grid())
    await key('keydown', 'KeyE')
    await key('keyup', 'KeyE', 10)
    expect(grid().querySelectorAll('.input-card')).toHaveLength(2)
  })
})
