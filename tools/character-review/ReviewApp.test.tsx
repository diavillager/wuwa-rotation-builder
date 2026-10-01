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
let saveFails: boolean
let result: ReviewValidation
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
    source,
    state: initialReview(source),
    revision: null,
    conflict: null,
  }
  saveFails = false
  result = { errors: ['미완료 검수'], summary: [], token: null }
  writes = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const action = new URL(url, 'http://localhost').pathname
        .split('/')
        .at(-1)!
      let body: unknown
      let ok = true
      if (init?.method === 'POST') writes.push(action)
      switch (action) {
        case 'session':
          body = { token: 'local-token' }
          break
        case 'targets':
          body = {
            targets: [
              target,
              { ...target, characterId: '1103', displayName: '다음 공명자' },
            ],
            errors: [],
          }
          break
        case 'load':
          body = structuredClone(saved)
          break
        case 'save':
          if (saveFails) {
            ok = false
            body = { error: '디스크 저장 실패' }
            break
          }
          saved = {
            ...saved,
            state: JSON.parse(init!.body as string).state,
            revision: 'saved',
          }
          body = structuredClone(saved)
          break
        case 'validate':
          body = result
          break
        case 'publish':
          body = { session: saved, warning: null }
          break
        default:
          throw new Error(action)
      }
      return { ok, json: async () => body }
    }),
  )
})
afterEach(async () => {
  await act(async () => root.unmount())
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
  await click('검증 공명자ID 1102')
}
async function includeCandidate() {
  const select = document.querySelector<HTMLSelectElement>(
    '.review-card label:nth-of-type(2) select',
  )!
  await act(async () => {
    select.value = 'include'
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
}

it('후보명·역할을 자동 승인하지 않고 미완성 저장은 허용하되 반영은 차단한다', async () => {
  await render()
  expect(
    document.querySelector<HTMLInputElement>('.review-card input')!.value,
  ).toBe('')
  const roles = [
    ...document.querySelectorAll<HTMLSelectElement>('.decision-panel select'),
  ]
  expect(roles).toHaveLength(3)
  expect(roles.every((s) => s.value === '')).toBe(true)
  expect(button('최종 반영').disabled).toBe(true)
  await click('검수 저장')
  expect(writes).toEqual(['save'])
  await click('검증')
  expect(document.body.textContent).toContain('미완료 검수')
  expect(button('최종 반영').disabled).toBe(true)
})

it('미저장 전환의 취소·저장 실패는 입력을 보존하고 대화상자 안에 오류를 보여준다', async () => {
  await render()
  await includeCandidate()
  await click('다음 공명자ID 1103')
  expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  await click('취소')
  expect(
    document.querySelector<HTMLSelectElement>(
      '.review-card label:nth-of-type(2) select',
    )!.value,
  ).toBe('include')
  await click('다음 공명자ID 1103')
  saveFails = true
  await click('저장하고 이동')
  expect(
    document.querySelector('[role="dialog"] [role="alert"]')?.textContent,
  ).toBe('디스크 저장 실패')
  expect(
    document.querySelector<HTMLSelectElement>(
      '.review-card label:nth-of-type(2) select',
    )!.value,
  ).toBe('include')
  saveFails = false
  await click('저장하고 이동')
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(saved.state.candidates[0].decision).toBe('include')
})

it('버리고 이동은 미저장 변경을 저장하지 않는다', async () => {
  await render()
  await includeCandidate()
  await click('다음 공명자ID 1103')
  await click('버리고 이동')
  expect(writes).toEqual([])
  expect(document.querySelector('[role="dialog"]')).toBeNull()
  expect(
    document.querySelector<HTMLSelectElement>(
      '.review-card label:nth-of-type(2) select',
    )!.value,
  ).toBe('pending')
})

it('Encore 자동 배정은 분류와 이름을 분리하고 고유 스킬을 기본 제외한다', async () => {
  saved.source = {
    ...saved.source,
    encoreMatches: {
      'candidate-one': {
        category: '고유 스킬',
        displayName: '실제 고유 이름',
        skillId: '101',
      },
    },
  }
  await render()
  await click('Encore 자동 배정')
  expect(
    document.querySelector<HTMLSelectElement>(
      '.review-card label:first-of-type select',
    )!.value,
  ).toBe('고유 스킬')
  expect(
    document.querySelector<HTMLInputElement>('.review-card input')!.value,
  ).toBe('실제 고유 이름')
  expect(
    document.querySelector<HTMLSelectElement>(
      '.review-card label:nth-of-type(2) select',
    )!.value,
  ).toBe('exclude')
  await click('검수 저장')
  expect(saved.state.candidates[0].category).toBe('고유 스킬')
})

it('카드 이동 후 순서를 저장하고 미저장 전환 경고를 표시한다', async () => {
  saved.source = structuredClone(source)
  saved.source.draft.candidates.push({
    ...saved.source.draft.candidates[0],
    candidateId: 'candidate-two',
  })
  saved.state = initialReview(saved.source)
  await render()
  await click('→')
  await click('다음 공명자ID 1103')
  expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  await click('취소')
  await click('검수 저장')
  expect(saved.state.candidates.map((c) => c.candidateId)).toEqual([
    'candidate-two',
    'candidate-one',
  ])
})

it('이동 손잡이 포인터 드래그는 목적 카드 위치로 이동하고 취소 시에는 유지한다', async () => {
  saved.source = structuredClone(source)
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
    value: () => document.querySelector('[data-review-index="1"]'),
  })
  try {
    await act(async () => {
      handle.dispatchEvent(
        new MouseEvent('pointerdown', {
          bubbles: true,
          button: 0,
          clientX: 0,
          clientY: 0,
        }),
      )
      handle.dispatchEvent(new MouseEvent('pointercancel', { bubbles: true }))
      handle.dispatchEvent(
        new MouseEvent('pointerup', {
          bubbles: true,
          clientX: 100,
          clientY: 100,
        }),
      )
    })
    await click('검수 저장')
    expect(saved.state.candidates[0].candidateId).toBe('candidate-one')
    await act(async () => {
      handle.dispatchEvent(
        new MouseEvent('pointerdown', {
          bubbles: true,
          button: 0,
          clientX: 0,
          clientY: 0,
        }),
      )
      handle.dispatchEvent(
        new MouseEvent('pointerup', {
          bubbles: true,
          clientX: 100,
          clientY: 100,
        }),
      )
    })
    await click('검수 저장')
    expect(saved.state.candidates.map((c) => c.candidateId)).toEqual([
      'candidate-two',
      'candidate-one',
    ])
  } finally {
    Reflect.deleteProperty(document, 'elementFromPoint')
  }
})

it('검증 후 변경 요약을 확인해야 반영하며 편집하면 검증을 무효화한다', async () => {
  await render()
  result = { errors: [], summary: ['가상 검수 데이터 변경'], token: 'valid' }
  await click('검증')
  await click('최종 반영')
  expect(writes).toEqual(['validate'])
  expect(document.querySelector('[role="dialog"]')?.textContent).toContain(
    '가상 검수 데이터 변경',
  )
  await click('취소')
  await includeCandidate()
  expect(button('최종 반영').disabled).toBe(true)
  await click('검증')
  await click('최종 반영')
  await click('확인하고 반영')
  expect(writes).toEqual(['validate', 'validate', 'publish'])
  expect(document.querySelector('[role="dialog"]')).toBeNull()
})
