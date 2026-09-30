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
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
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
  it('같은 번호의 tap/hold는 안내와 블록 없이 무시한다', async () => {
    await hover(grid())
    for (const duration of [10, 400]) {
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
    await key('keyup', 'Digit2', 400)
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
