// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { TabFocusGuard } from './TabFocusGuard'

let root: Root
beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  document.body.innerHTML = '<div id="root"></div>'
  root = createRoot(document.querySelector('#root')!)
  await act(async () =>
    root.render(
      <StrictMode>
        <TabFocusGuard>
          <button>프로젝트 선택</button>
          <input aria-label="프로젝트 이름" />
          <div role="dialog">
            <button>확인</button>
          </div>
          <div data-cycle="opening" />
        </TabFocusGuard>
      </StrictMode>,
    ),
  )
})
afterEach(async () => {
  await act(async () => root.unmount())
  vi.unstubAllGlobals()
})

it.each(['button', 'input', '[role="dialog"] button', '[data-cycle]'])(
  '%s 영역에서도 Tab과 Shift+Tab의 기본 동작을 차단한다',
  (selector) => {
    for (const shiftKey of [false, true]) {
      const event = new KeyboardEvent('keydown', {
        key: 'Tab',
        code: 'Tab',
        shiftKey,
        bubbles: true,
        cancelable: true,
      })
      document.querySelector(selector)!.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
    }
  },
)

it('문자·Enter 입력 및 명시적 포커스는 유지하고 unmount 시 차단을 해제한다', async () => {
  const input = document.querySelector('input')!
  input.focus()
  expect(document.activeElement).toBe(input)
  for (const key of ['E', 'Enter', 'ArrowRight']) {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      cancelable: true,
    })
    input.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  }
  await act(async () => root.render(null))
  const event = new KeyboardEvent('keydown', {
    key: 'Tab',
    bubbles: true,
    cancelable: true,
  })
  document.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(false)
})
