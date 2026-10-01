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
    '.review-card select',
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
    document.querySelector<HTMLSelectElement>('.review-card select')!.value,
  ).toBe('include')
  await click('다음 공명자ID 1103')
  saveFails = true
  await click('저장하고 이동')
  expect(
    document.querySelector('[role="dialog"] [role="alert"]')?.textContent,
  ).toBe('디스크 저장 실패')
  expect(
    document.querySelector<HTMLSelectElement>('.review-card select')!.value,
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
    document.querySelector<HTMLSelectElement>('.review-card select')!.value,
  ).toBe('pending')
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
