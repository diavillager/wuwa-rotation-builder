// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRotation } from '../domain/rotation'
import { demoCatalog } from './demo'
import { applyCapturedInput } from './input-command'
import { attachCaptureEvents } from './input-events'

const disposers: (() => void)[] = []
afterEach(() => {
  for (const dispose of disposers.splice(0)) dispose()
  document.body.innerHTML = ''
})

function fixture() {
  document.body.innerHTML = `<div class="timeline-scroll"><div data-capture-cycle="opening"><div id="empty"></div><div class="input-card" id="block"></div><button id="line">A</button></div></div><div data-capture-cycle="repeat" id="repeat"></div><div id="outside"></div><input id="text" />`
  let rotation = createRotation(['demo-a', 'demo-b', 'demo-c'])
  let time = 0
  let sequence = 0
  let blocked = false
  const adapter = attachCaptureEvents(document, {
    now: () => time,
    blocked: () => blocked,
    commit: (inputs) => {
      for (const input of inputs)
        rotation = applyCapturedInput(
          rotation,
          demoCatalog,
          input,
          () => `event-${++sequence}`,
        )
    },
  })
  disposers.push(adapter.dispose)
  const move = (selector: string) =>
    document
      .querySelector(selector)!
      .dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
  const key = (
    type: 'keydown' | 'keyup',
    code: string,
    at: number,
    repeat = false,
  ) => {
    time = at
    const event = new KeyboardEvent(type, {
      code,
      repeat,
      bubbles: true,
      cancelable: true,
    })
    document.dispatchEvent(event)
    return event
  }
  return {
    adapter,
    move,
    key,
    state: () => rotation,
    setTime: (value: number) => {
      time = value
    },
    block: () => {
      blocked = true
    },
  }
}

describe('브라우저 이벤트와 Rotation 통합', () => {
  it('키 hold 중 추가 키와 마우스는 기록하지 않고 다음 새 press부터 받는다', () => {
    const f = fixture()
    f.move('#empty')
    f.key('keydown', 'KeyQ', 0)
    f.key('keydown', 'KeyE', 10)
    f.key('keyup', 'KeyE', 50)
    document
      .querySelector('#empty')!
      .dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }))
    document
      .querySelector('#empty')!
      .dispatchEvent(new MouseEvent('mouseup', { button: 0, bubbles: true }))
    f.key('keyup', 'KeyQ', 500)
    f.key('keydown', 'KeyE', 600, true)
    f.key('keyup', 'KeyE', 700)
    expect(f.state().opening.columns.map((item) => item.action)).toMatchObject([
      { input: 'Q', gesture: 'hold' },
    ])
    f.key('keydown', 'KeyE', 800)
    f.key('keyup', 'KeyE', 900)
    expect(
      f
        .state()
        .opening.columns.map(
          (item) => item.action.type === 'input' && item.action.input,
        ),
    ).toEqual(['Q', 'E'])
  })
  it('빈 영역의 입력과 숫자키 교체를 기록하고 두 Cycle을 분리한다', () => {
    const f = fixture()
    f.move('#empty')
    f.key('keydown', 'KeyE', 0)
    f.key('keydown', 'KeyE', 100, true)
    f.key('keyup', 'KeyE', 399)
    f.key('keydown', 'Digit2', 500)
    f.key('keyup', 'Digit2', 900)
    expect(f.state().opening.columns.map((item) => item.action.type)).toEqual([
      'input',
      'autoAction',
      'autoAction',
    ])
    expect(f.state().opening.activeCharacterId).toBe('demo-b')
    expect(f.state().opening.transitions[0].kind).toBe('concerto')
    f.move('#repeat')
    f.key('keydown', 'KeyR', 1000)
    f.key('keyup', 'KeyR', 1001)
    expect(f.state().repeat.columns[0]).toMatchObject({
      ownerId: 'demo-a',
      action: { input: 'R', skills: [] },
    })
  })

  it('빈 영역 이탈·Cycle 이동·blur·drag·UI 차단은 진행 중 입력을 취소한다', () => {
    const f = fixture()
    for (const interrupt of [
      () => f.move('#block'),
      () => f.move('#repeat'),
      () => window.dispatchEvent(new Event('blur')),
      () => document.dispatchEvent(new Event('dragstart')),
    ]) {
      f.move('#empty')
      f.key('keydown', 'KeyE', 0)
      interrupt()
      f.move('#empty')
      f.key('keyup', 'KeyE', 600)
    }
    f.move('#empty')
    f.key('keydown', 'KeyE', 0)
    f.block()
    f.key('keyup', 'KeyE', 600)
    expect(f.state().opening.columns).toEqual([])
  })

  it('블록·버튼·사이클 밖·텍스트 편집·지원 제외 입력을 기록하지 않는다', () => {
    const f = fixture()
    for (const selector of ['#block', '#line', '#outside']) {
      f.move(selector)
      f.key('keydown', 'KeyE', 0)
      f.key('keyup', 'KeyE', 10)
    }
    f.move('#empty')
    f.key('keydown', 'KeyW', 0)
    f.key('keyup', 'KeyW', 10)
    document.querySelector<HTMLInputElement>('#text')!.focus()
    f.move('#empty')
    f.key('keydown', 'KeyE', 0)
    f.key('keyup', 'KeyE', 10)
    expect(f.state().opening.columns).toEqual([])
  })

  it('RMB hold는 실제 입력이고 context menu는 캡처 영역에서만 막는다', () => {
    const f = fixture()
    const empty = document.querySelector('#empty')!
    empty.dispatchEvent(
      new MouseEvent('mousedown', {
        button: 2,
        bubbles: true,
        cancelable: true,
      }),
    )
    const menu = new MouseEvent('contextmenu', {
      button: 2,
      bubbles: true,
      cancelable: true,
    })
    empty.dispatchEvent(menu)
    expect(menu.defaultPrevented).toBe(true)
    f.setTime(400)
    empty.dispatchEvent(new MouseEvent('mouseup', { button: 2, bubbles: true }))
    expect(f.state().opening.columns[0].action).toMatchObject({
      input: 'RMB',
      gesture: 'hold',
    })
    const outsideMenu = new MouseEvent('contextmenu', {
      button: 2,
      bubbles: true,
      cancelable: true,
    })
    document.querySelector('#outside')!.dispatchEvent(outsideMenu)
    expect(outsideMenu.defaultPrevented).toBe(false)
  })

  it('진행 중 키 때문에 무시된 RMB의 메뉴는 막지 않는다', () => {
    const f = fixture()
    f.move('#empty')
    f.key('keydown', 'KeyQ', 0)
    const empty = document.querySelector('#empty')!
    empty.dispatchEvent(
      new MouseEvent('mousedown', {
        button: 2,
        bubbles: true,
        cancelable: true,
      }),
    )
    const menu = new MouseEvent('contextmenu', {
      button: 2,
      bubbles: true,
      cancelable: true,
    })
    empty.dispatchEvent(menu)
    expect(menu.defaultPrevented).toBe(false)
  })

  it('리스너 해제 후 이벤트는 기록하지 않는다', () => {
    const f = fixture()
    f.move('#empty')
    f.key('keydown', 'KeyE', 0)
    f.adapter.dispose()
    f.key('keyup', 'KeyE', 10)
    expect(f.state().opening.columns).toEqual([])
  })

  it('스크롤바 영역을 빈 영역으로 취급하지 않는다', () => {
    const f = fixture()
    const scroll = document.querySelector<HTMLElement>('.timeline-scroll')!
    vi.spyOn(scroll, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
    } as DOMRect)
    Object.defineProperty(scroll, 'clientWidth', { value: 90 })
    Object.defineProperty(scroll, 'clientHeight', { value: 90 })
    document.querySelector('#empty')!.dispatchEvent(
      new MouseEvent('mouseover', {
        bubbles: true,
        clientX: 95,
        clientY: 20,
      }),
    )
    f.key('keydown', 'KeyE', 0)
    f.key('keyup', 'KeyE', 10)
    expect(f.state().opening.columns).toEqual([])
  })
})
