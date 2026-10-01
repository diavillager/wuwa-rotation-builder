// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ReviewApp } from './ReviewApp'
import {
  initialReview,
  type ReviewSource,
  type ReviewSession,
  type ReviewValidation,
} from './model'

let root: Root
let saved: ReviewSession
let exportFails: boolean
let result: ReviewValidation
let postedStates: unknown[]
let writes: string[]
const target = {
  runId: 'fixture-run-001',
  characterId: '1102',
  displayName: '검증 공명자',
}
const source: ReviewSource = {
  target,
  draftHash: 'draft',
  current: null,
  currentHash: null,
  currentError: null,
  draft: {
    schemaVersion: 1,
    characterId: '1102',
    basicCandidate: { displayName: target.displayName, attribute: '응결' },
    errors: [],
    candidates: [
      {
        candidateId: 'candidate-one',
        kind: 'skill',
        asset: 'assets/one.webp',
        resourcePath: '/Game/Test/one.webp',
        url: 'https://example.test/one.webp',
        sources: [
          {
            source: 'encore',
            document: 'fixture',
            recordId: 'one',
            field: 'Icon',
            originalPath: '/Game/Test/one',
            candidateName: '자동 승인하면 안 되는 후보명',
          },
        ],
        review: { displayName: null, visible: null },
        download: { status: 'verified', sha256: 'one', width: 2, height: 2 },
      },
    ],
  },
}
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  document.body.innerHTML = '<div id="root"></div>'
  root = createRoot(document.querySelector('#root')!)
  saved = {
    source: structuredClone(source),
    state: initialReview(source),
    revision: null,
    conflict: null,
  }
  exportFails = false
  result = { errors: ['미완료 검수'], summary: [], token: null }
  writes = []
  postedStates = []
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:review'),
  })
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  })
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const parsed = new URL(url, 'http://localhost')
      const action = parsed.pathname.split('/').at(-1)!
      let body: unknown
      let ok = true
      if (init?.method === 'POST') {
        writes.push(action)
        postedStates = JSON.parse(init.body as string).states
      }
      if (action === 'session') body = { token: 'local-token' }
      else if (action === 'targets')
        body = {
          targets: [
            target,
            { ...target, characterId: '1103', displayName: '다음 공명자' },
          ],
          errors: [],
        }
      else if (action === 'load') {
        body = structuredClone(saved)
        const session = body as ReviewSession
        const id = parsed.searchParams.get('characterId')!
        session.source.target = {
          ...session.source.target,
          characterId: id,
          displayName: id === '1103' ? '다음 공명자' : target.displayName,
        }
        session.source.draft.characterId = id
        session.state = { ...session.state, characterId: id }
      } else if (action === 'validate')
        body = {
          results: [
            { ...result, characterId: '1102', displayName: target.displayName },
          ],
        }
      else if (action === 'export') {
        if (exportFails) {
          ok = false
          body = { error: '내보내기 실패' }
        } else
          body = {
            results: [
              {
                ...result,
                characterId: '1102',
                displayName: target.displayName,
              },
            ],
            file: {
              format: 'wuwa-character-review',
              schemaVersion: 1,
              status: 'pending-agent-validation',
              characters: [{ characterId: '1102' }],
            },
          }
      } else throw new Error(action)
      return { ok, json: async () => body }
    }),
  )
})
afterEach(async () => {
  await act(async () => root.unmount())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
function button(text: string) {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (b) => b.textContent === text,
  )!
}
async function click(text: string) {
  await act(async () => button(text).click())
}
async function render() {
  await act(async () => root.render(<ReviewApp />))
}
const decision = (which: string) =>
  document.querySelector<HTMLInputElement>(`[aria-label="후보 1 ${which}"]`)!
async function selectCandidate() {
  await act(async () => decision('등록').click())
}

it('지정 공명자만 표시하고 실행 이력·저장·최종 반영·분리 필드·화살표 버튼이 없다', async () => {
  await render()
  expect(document.querySelectorAll('.target-list button')).toHaveLength(2)
  for (const text of [
    '수집 실행',
    '검수 저장',
    '최종 반영',
    '기존 검수 스킬',
    '수집 후보',
  ])
    expect(document.body.textContent).not.toContain(text)
  expect(document.querySelectorAll('.card-move button')).toHaveLength(1)
  expect(
    document.querySelector('.review-sidebar .decision-panel'),
  ).not.toBeNull()
  expect(document.querySelectorAll('.skill-panel')).toHaveLength(1)
  expect(decision('등록').checked).toBe(false)
  expect(decision('미등록').checked).toBe(false)
  const card = document.querySelector('.review-card')!
  expect([...card.children].map((c) => c.tagName)).toEqual([
    'DIV',
    'DIV',
    'DIV',
    'LABEL',
    'LABEL',
    'DETAILS',
  ])
})
it('체크박스는 상호 배타적이고 둘 다 해제하면 미검수다', async () => {
  await render()
  await selectCandidate()
  expect(decision('등록').checked).toBe(true)
  await act(async () => decision('미등록').click())
  expect(decision('등록').checked).toBe(false)
  expect(decision('미등록').checked).toBe(true)
  await act(async () => decision('미등록').click())
  expect(decision('등록').checked).toBe(false)
  expect(decision('미등록').checked).toBe(false)
})
it('공명자를 오가도 페이지 메모리에 편집을 유지하며 서버 저장을 요청하지 않는다', async () => {
  await render()
  await selectCandidate()
  await click('다음 공명자ID 1103')
  expect(decision('등록').checked).toBe(false)
  await click('검증 공명자ID 1102')
  expect(decision('등록').checked).toBe(true)
  expect(writes).toEqual([])
  await act(async () => {
    root.unmount()
    root = createRoot(document.querySelector('#root')!)
  })
  await render()
  expect(decision('등록').checked).toBe(false)
})
it('자동 배정 해제는 직접 수정한 값만 유지하고 자동 필드를 초기화한다', async () => {
  saved.source.encoreMatches = {
    'candidate-one': {
      category: '고유 스킬',
      displayName: '실제 고유 이름',
      skillId: '101',
    },
  }
  await render()
  await click('Encore 자동 배정')
  const name = document.querySelector<HTMLInputElement>(
    '[aria-label="후보 1 스킬명"]',
  )!
  expect(name.value).toBe('실제 고유 이름')
  expect(decision('미등록').checked).toBe(true)
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!.call(name, '직접 바꾼 이름')
    name.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await click('Encore 자동 배정 해제')
  expect(name.value).toBe('직접 바꾼 이름')
  expect(
    document.querySelector<HTMLSelectElement>('[aria-label="후보 1 분류"]')!
      .value,
  ).toBe('')
  expect(decision('미등록').checked).toBe(false)
})
it('검증과 Export는 전체 공명자를 전송하고 실패 시 편집을 보존한다', async () => {
  await render()
  await selectCandidate()
  await click('누락 검증')
  expect(postedStates).toHaveLength(2)
  expect(document.body.textContent).toContain('미완료 검수')
  exportFails = true
  await click('JSON Export')
  expect(document.body.textContent).toContain('내보내기 실패')
  expect(decision('등록').checked).toBe(true)
  exportFails = false
  await click('JSON Export')
  expect(writes).toEqual(['validate', 'export', 'export'])
  expect(URL.createObjectURL).toHaveBeenCalledOnce()
  expect(document.body.textContent).toContain('에이전트에게 전달')
})
it('이동 손잡이 드래그와 취소를 처리하고 Export 상태에 통합 순서를 포함한다', async () => {
  saved.source.draft.candidates.push({
    ...saved.source.draft.candidates[0],
    candidateId: 'candidate-two',
  })
  saved.state = initialReview(saved.source)
  await render()
  const handle = document.querySelector<HTMLButtonElement>(
    '[aria-label="후보 1 이동 손잡이"]',
  )!
  handle.setPointerCapture = vi.fn()
  handle.hasPointerCapture = () => true
  handle.releasePointerCapture = vi.fn()
  Object.defineProperty(document, 'elementFromPoint', {
    configurable: true,
    value: () => document.querySelector('[data-review-key="candidate-two"]'),
  })
  const down = () =>
    handle.dispatchEvent(
      new MouseEvent('pointerdown', {
        bubbles: true,
        button: 0,
        clientX: 0,
        clientY: 0,
      }),
    )
  const up = () =>
    handle.dispatchEvent(
      new MouseEvent('pointerup', {
        bubbles: true,
        clientX: 100,
        clientY: 100,
      }),
    )
  try {
    await act(async () => {
      down()
      handle.dispatchEvent(new MouseEvent('pointercancel', { bubbles: true }))
      up()
    })
    expect(
      document.querySelector('.review-card')?.getAttribute('data-review-key'),
    ).toBe('candidate-one')
    await act(async () => {
      down()
      up()
    })
    expect(
      document.querySelector('.review-card')?.getAttribute('data-review-key'),
    ).toBe('candidate-two')
    await click('JSON Export')
    expect((postedStates[0] as { cardOrder: string[] }).cardOrder).toEqual([
      'candidate-two',
      'candidate-one',
    ])
  } finally {
    Reflect.deleteProperty(document, 'elementFromPoint')
  }
})
