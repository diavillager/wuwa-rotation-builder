// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { SkillTooltip } from './SkillTooltip'

let root: Root
beforeEach(async () => {
  vi.useFakeTimers()
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  document.body.innerHTML =
    '<div id="root"></div><div id="card" data-skill-tooltip="불사조의 힘"><img><span>기본 공격</span></div>'
  root = createRoot(document.querySelector('#root')!)
  await act(async () => root.render(<SkillTooltip />))
})
afterEach(async () => {
  await act(async () => root.unmount())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})
const tooltip = () => document.querySelector('[role="tooltip"]')
async function over(element: Element, elapsed = 500) {
  await act(async () =>
    element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true })),
  )
  await act(async () => vi.advanceTimersByTime(elapsed))
}

it('500ms 전에는 표시하지 않고 카드 내부 이동은 대기를 초기화하지 않는다', async () => {
  const card = document.querySelector('#card')!
  await over(card, 300)
  expect(tooltip()).toBeNull()
  await over(card.querySelector('img')!, 199)
  expect(tooltip()).toBeNull()
  await act(async () => vi.advanceTimersByTime(1))
  expect(tooltip()?.textContent).toBe('불사조의 힘')
})

it('다른 카드에서는 새로 기다리며 대기 중 이탈하면 나중에도 뜨지 않는다', async () => {
  const card = document.querySelector('#card')!
  const next = card.cloneNode(true) as HTMLElement
  next.id = 'next'
  next.dataset.skillTooltip = '불멸의 깃털'
  document.body.append(next)
  await over(card, 400)
  await over(next, 100)
  expect(tooltip()).toBeNull()
  await act(async () =>
    next.dispatchEvent(
      new MouseEvent('mouseout', {
        bubbles: true,
        relatedTarget: document.body,
      }),
    ),
  )
  await act(async () => vi.advanceTimersByTime(1000))
  expect(tooltip()).toBeNull()
})

it.each(['drag', 'scroll', 'escape', 'blur', 'remove', 'disable'])(
  '대기 중 %s는 예약 표시도 취소한다',
  async (reason) => {
    const card = document.querySelector('#card')!
    await over(card, 100)
    await act(async () => {
      if (reason === 'drag')
        card.dispatchEvent(new Event('dragstart', { bubbles: true }))
      if (reason === 'scroll') card.dispatchEvent(new Event('scroll'))
      if (reason === 'escape')
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      if (reason === 'blur') window.dispatchEvent(new Event('blur'))
      if (reason === 'remove') card.remove()
      if (reason === 'disable') root.render(<SkillTooltip disabled />)
    })
    await act(async () => vi.advanceTimersByTime(1000))
    expect(tooltip()).toBeNull()
  },
)

it.each(['skill', 'auto'])(
  '카드 종류에 맞는 %s 색상을 적용한다',
  async (tone) => {
    const card = document.querySelector('#card')!
    card.className = tone === 'auto' ? 'auto-card' : 'catalog-skill'
    await over(card)
    expect(tooltip()?.getAttribute('data-tone')).toBe(tone)
  },
)

it('카드 여백·이미지·분류 위에서 같은 실제 스킬명만 표시한다', async () => {
  const card = document.querySelector('#card')!
  for (const element of [card, ...card.children]) {
    await over(element)
    expect(tooltip()?.textContent).toBe('불사조의 힘')
    expect(card.getAttribute('aria-describedby')).toBe(tooltip()?.id)
  }
  expect(tooltip()?.parentElement).toBe(document.body)
  await act(async () =>
    card.dispatchEvent(
      new MouseEvent('mouseout', {
        bubbles: true,
        relatedTarget: document.body,
      }),
    ),
  )
  expect(tooltip()).toBeNull()
  expect(card.hasAttribute('aria-describedby')).toBe(false)
})

it.each(['drag', 'scroll', 'escape', 'blur', 'remove', 'disable'])(
  '%s에서 툴팁을 제거한다',
  async (reason) => {
    const card = document.querySelector('#card')!
    await over(card)
    await act(async () => {
      if (reason === 'drag')
        card.dispatchEvent(new Event('dragstart', { bubbles: true }))
      if (reason === 'scroll') card.dispatchEvent(new Event('scroll'))
      if (reason === 'escape')
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      if (reason === 'blur') window.dispatchEvent(new Event('blur'))
      if (reason === 'remove') card.remove()
      if (reason === 'disable') root.render(<SkillTooltip disabled />)
    })
    expect(tooltip()).toBeNull()
    if (reason === 'drag') {
      await over(card)
      expect(tooltip()).toBeNull()
      await act(async () => document.dispatchEvent(new Event('dragend')))
      await over(card)
      expect(tooltip()?.textContent).toBe('불사조의 힘')
    }
  },
)

it('오른쪽·아래쪽 경계에서는 화면 안쪽과 카드 위로 배치한다', async () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      return (
        this.className === 'skill-tooltip'
          ? { width: 180, height: 50 }
          : {
              left: window.innerWidth - 80,
              top: window.innerHeight - 80,
              bottom: window.innerHeight - 10,
              width: 70,
              height: 70,
            }
      ) as DOMRect
    },
  )
  await over(document.querySelector('#card')!)
  const popup = tooltip() as HTMLElement
  expect(popup.style.left).toBe(`${window.innerWidth - 188}px`)
  expect(popup.style.top).toBe(`${window.innerHeight - 140}px`)
  expect(popup.getAttribute('data-placement')).toBe('above')
  expect(popup.style.getPropertyValue('--tooltip-arrow-x')).toBe('143px')
})

it('이름이 없으면 분류명으로 대체하지 않고 표시하지 않는다', async () => {
  const card = document.querySelector<HTMLElement>('#card')!
  card.dataset.skillTooltip = ''
  await over(card)
  expect(tooltip()).toBeNull()
})
