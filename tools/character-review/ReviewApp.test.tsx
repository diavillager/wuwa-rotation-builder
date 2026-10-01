// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ReviewApp } from './ReviewApp'
import { readSavedReview, writeSavedReview } from './storage'
vi.mock('./storage', async (original) => ({
  ...(await original<typeof import('./storage')>()),
  readSavedReview: vi.fn(async () => null),
  writeSavedReview: vi.fn(async () => {}),
}))
import {
  initialReview,
  type ReviewSource,
  type ReviewSession,
  type ReviewValidation,
} from './model'

let root: Root
let saved: ReviewSession
let exportFails: boolean
let importFails: boolean
let resetFails: boolean
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
  vi.mocked(readSavedReview).mockReset().mockResolvedValue(null)
  vi.mocked(writeSavedReview).mockReset().mockResolvedValue()
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
  importFails = false
  resetFails = false
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
      } else if (action === 'reset') {
        ok = !resetFails
        const session = {
          ...structuredClone(saved),
          state: initialReview(saved.source),
        }
        body = resetFails
          ? { error: '이미지 누락' }
          : {
              sessions: [session],
              file: {
                format: 'wuwa-character-review-backup',
                schemaVersion: 2,
                characters: [
                  {
                    characterId: '1102',
                    review: session.state,
                    workspace: { source: session.source, images: [] },
                  },
                ],
              },
            }
      } else if (action === 'import') {
        ok = !importFails
        const file = JSON.parse(init!.body as string).file
        body = importFails
          ? { error: '손상된 백업' }
          : {
              sessions: file?.characters?.[0]?.workspace
                ? file.characters.map(
                    (entry: {
                      review: ReviewSession['state']
                      workspace: { source: ReviewSource }
                    }) => ({
                      state: entry.review,
                      source: entry.workspace.source,
                      conflict: null,
                      revision: null,
                    }),
                  )
                : [structuredClone(saved)],
            }
      } else if (action === 'backup') {
        body = {
          file: {
            format: 'wuwa-character-review-backup',
            schemaVersion: 2,
            characters: (postedStates as ReviewSession['state'][]).map(
              (state) => ({
                characterId: state.characterId,
                review: state,
                workspace: { source: saved.source, images: [] },
              }),
            ),
          },
        }
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
  vi.useRealTimers()
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

it('스킬 툴팁을 검토 화면 맨 아래에서 자동 배정 없이 안전한 텍스트로 읽는다', async () => {
  saved.source.encoreTooltips = [
    {
      category: '기본 공격',
      skillId: '123',
      displayName: '실제 공격',
      description: '강공격 설명\n<img src=x onerror=alert(1)>',
    },
  ]
  await render()
  const panel = document.querySelector('.tooltip-panel')!
  expect(document.querySelector('.review-main')!.lastElementChild).toBe(panel)
  expect(
    [...panel.querySelectorAll('summary')].map((item) => item.textContent),
  ).toEqual([
    '기본 공격',
    '공명 스킬',
    '공명 해방',
    '공명 회로',
    '변주 스킬',
    '반주 스킬',
  ])
  expect(panel.textContent).toContain('강공격 설명')
  expect(panel.querySelector('img')).toBeNull()
  expect(panel.textContent).toContain('Encore 원본 설명이 없습니다.')
  await act(async () =>
    document
      .querySelectorAll<HTMLButtonElement>('.target-list button')[1]
      .click(),
  )
  expect(document.querySelector('.tooltip-panel')!.textContent).toContain(
    '다음 공명자 · Encore 스킬 설명',
  )
})

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
it('분류 배지는 미분류일 때 숨기고 미등록 배지를 우선 표시한다', async () => {
  await render()
  const category = document.querySelector<HTMLSelectElement>(
    '[aria-label="후보 1 분류"]',
  )!
  const select = async (value: string) =>
    act(async () => {
      category.value = value
      category.dispatchEvent(new Event('change', { bubbles: true }))
    })
  expect(document.querySelector('.category-badge')).toBeNull()
  for (const name of [
    '기본 공격',
    '공명 스킬',
    '공명 해방',
    '공명 회로',
    '변주 스킬',
    '반주 스킬',
    '조화도 파괴',
    '고유 스킬',
  ]) {
    await select(name)
    expect(document.querySelector('.category-badge')?.textContent).toBe(name)
  }
  await act(async () => decision('미등록').click())
  expect(document.querySelector('.category-badge')).toBeNull()
  expect(document.querySelector('.excluded-badge')?.textContent).toBe('미등록')
  expect(category.value).toBe('고유 스킬')
  await selectCandidate()
  expect(document.querySelector('.excluded-badge')).toBeNull()
  expect(document.querySelector('.category-badge')?.textContent).toBe(
    '고유 스킬',
  )
  await select('')
  expect(document.querySelector('.category-badge')).toBeNull()
})
it('공명자를 오가도 페이지 메모리에 편집을 유지하며 서버 저장을 요청하지 않는다', async () => {
  await render()
  await selectCandidate()
  await click('다음 공명자미검증')
  expect(decision('등록').checked).toBe(false)
  await click('검증 공명자미검증')
  expect(decision('등록').checked).toBe(true)
  expect(writes).toEqual([])
  await act(async () => {
    root.unmount()
    root = createRoot(document.querySelector('#root')!)
  })
  await render()
  expect(decision('등록').checked).toBe(false)
})
it('분류가 있어도 자동 배정을 켜지 않고 자동 행동과 0~10 타수를 직접 지정한다', async () => {
  saved.state.candidates[0] = {
    ...saved.state.candidates[0],
    category: '기본 공격',
    displayName: '직접 스킬',
    decision: 'include',
  }
  await render()
  const action = document.querySelector<HTMLSelectElement>(
    '.decision-panel select',
  )!
  expect(action.disabled).toBe(false)
  await act(async () => {
    action.value = '1102:skill:one'
    action.dispatchEvent(new Event('change', { bubbles: true }))
  })
  const hits = document.querySelector<HTMLSelectElement>(
    '[aria-label="후보 1 타수"]',
  )!
  expect([...hits.options].map((o) => o.value)).toEqual(
    Array.from({ length: 11 }, (_, i) => String(i)),
  )
  await act(async () => {
    hits.value = '10'
    hits.dispatchEvent(new Event('change', { bubbles: true }))
  })
  expect(document.querySelector('.category-badge')?.textContent).toBe(
    '기본 공격 · 10타',
  )
  expect(action.value).toBe('1102:skill:one')
  await click('JSON으로 백업하기')
  expect(
    (postedStates[0] as { candidates: { hitCount: number }[] }).candidates[0]
      .hitCount,
  ).toBe(10)
  expect(URL.createObjectURL).toHaveBeenCalledOnce()
})
it('Import는 같은 ID만 갱신하며 누락 대상과 취소·실패 시 기존 편집을 보존한다', async () => {
  await render()
  await click('다음 공명자미검증')
  await selectCandidate()
  await click('검증 공명자미검증')
  await selectCandidate()
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  const upload = async () => {
    const file = new File(['{}'], 'backup.json', { type: 'application/json' })
    Object.defineProperty(file, 'text', { value: async () => '{}' })
    const input = document.querySelector<HTMLInputElement>(
      '[aria-label="검수 JSON 파일"]',
    )!
    Object.defineProperty(input, 'files', { configurable: true, value: [file] })
    await act(async () =>
      input.dispatchEvent(new Event('change', { bubbles: true })),
    )
  }
  await upload()
  expect(writes).toEqual([])
  confirm.mockReturnValue(true)
  importFails = true
  await upload()
  expect(document.querySelectorAll('.target-list button')).toHaveLength(2)
  expect(decision('등록').checked).toBe(true)
  expect(document.body.textContent).toContain('손상된 백업')
  importFails = false
  await upload()
  expect(document.querySelectorAll('.target-list button')).toHaveLength(2)
  expect(document.body.textContent).toContain('다음 공명자')
  expect(decision('등록').checked).toBe(false)
  await click('다음 공명자미검증')
  expect(decision('등록').checked).toBe(true)
})

it('Import의 새 ID를 추가하고 기존 검증 결과와 병합 목록을 저장한다', async () => {
  vi.useFakeTimers()
  await render()
  result = { errors: [], summary: [], token: 'ok' }
  await click('검수 내용 검증')
  const extra = structuredClone(saved)
  extra.state.characterId =
    extra.source.target.characterId =
    extra.source.draft.characterId =
      '1209'
  extra.source.target.displayName = '새 공명자'
  const value = {
    characters: [{ review: extra.state, workspace: { source: extra.source } }],
  }
  const file = new File(['{}'], 'extra.json')
  Object.defineProperty(file, 'text', {
    value: async () => JSON.stringify(value),
  })
  const input = document.querySelector<HTMLInputElement>(
    '[aria-label="검수 JSON 파일"]',
  )!
  Object.defineProperty(input, 'files', { configurable: true, value: [file] })
  await act(async () =>
    input.dispatchEvent(new Event('change', { bubbles: true })),
  )
  expect(document.querySelectorAll('.target-list button')).toHaveLength(3)
  expect(document.querySelector('.review-status')?.textContent).toBe('통과')
  await act(async () => {
    await vi.advanceTimersByTimeAsync(650)
  })
  const record = vi.mocked(writeSavedReview).mock.calls.at(-1)![0]
  expect(record.file.characters.map((c) => c.characterId)).toEqual([
    '1102',
    '1103',
    '1209',
  ])
  expect(record.validatedIds).toEqual(['1102'])
})

it('초기화는 확인 후 원본 초기값을 복원·저장하며 취소와 실패 시 편집을 유지한다', async () => {
  vi.useFakeTimers()
  await render()
  await selectCandidate()
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
  await click('전체 검수 초기화')
  expect(writes).not.toContain('reset')
  expect(decision('등록').checked).toBe(true)
  confirm.mockReturnValue(true)
  resetFails = true
  await click('전체 검수 초기화')
  expect(document.body.textContent).toContain('초기화 실패')
  expect(document.querySelectorAll('.target-list button')).toHaveLength(2)
  expect(decision('등록').checked).toBe(true)
  resetFails = false
  await click('전체 검수 초기화')
  expect(decision('등록').checked).toBe(false)
  expect(document.querySelectorAll('.target-list button')).toHaveLength(1)
  expect(
    document.querySelector('.attribute-tabs [aria-pressed="true"]')
      ?.textContent,
  ).toBe('응결')
  await act(async () => {
    await vi.advanceTimersByTimeAsync(650)
  })
  const record = vi.mocked(writeSavedReview).mock.calls.at(-1)![0]
  expect(record.mode).toBe('workspace')
  expect(record.file.characters[0].review.candidates[0].decision).toBe(
    'pending',
  )
})
it('자동 배정과 별도 정렬 버튼을 분리하고 해제해도 정렬 순서를 유지한다', async () => {
  saved.source.draft.candidates.push({
    ...saved.source.draft.candidates[0],
    candidateId: 'candidate-two',
  })
  saved.source.encoreMatches = {
    'candidate-one': {
      category: '고유 스킬',
      displayName: '고유 이름',
      skillId: '101',
    },
  }
  saved.state = initialReview(saved.source)
  await render()
  const order = () =>
    [...document.querySelectorAll<HTMLElement>('[data-review-key]')].map(
      (c) => c.dataset.reviewKey,
    )
  const buttons = [...document.querySelectorAll('.decision-panel button')]
  expect(buttons.map((b) => b.textContent)).toEqual([
    'Encore 자동 배정',
    '분류순 정렬',
  ])
  await click('Encore 자동 배정')
  expect(order()).toEqual(['candidate-one', 'candidate-two'])
  await click('분류순 정렬')
  expect(order()).toEqual(['candidate-two', 'candidate-one'])
  expect(document.querySelector('.category-badge')).toBeNull()
  await click('Encore 자동 배정 해제')
  expect(order()).toEqual(['candidate-two', 'candidate-one'])
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
  await click('검수 내용 검증')
  expect(postedStates).toHaveLength(2)
  expect(document.body.textContent).toContain('미완료 검수')
  exportFails = true
  await click('JSON으로 내보내기')
  expect(document.body.textContent).toContain('내보내기 실패')
  expect(decision('등록').checked).toBe(true)
  exportFails = false
  await click('JSON으로 내보내기')
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
    await click('JSON으로 내보내기')
    expect((postedStates[0] as { cardOrder: string[] }).cardOrder).toEqual([
      'candidate-two',
      'candidate-one',
    ])
  } finally {
    Reflect.deleteProperty(document, 'elementFromPoint')
  }
})

it('사이드바 순서와 검증 상태를 표시하고 편집한 공명자만 다시 미검증으로 돌린다', async () => {
  await render()
  expect(
    [...document.querySelectorAll('.review-sidebar h2')].map(
      (h) => h.textContent,
    ),
  ).toEqual(['공명자 목록', '자동 매핑 및 정렬', '검증 및 파일 관리'])
  const statuses = () =>
    [...document.querySelectorAll('.target-list .review-status')].map(
      (s) => s.textContent,
    )
  expect(statuses()).toEqual(['미검증', '미검증'])
  await click('검수 내용 검증')
  expect(statuses()).toEqual(['오류', '미검증'])
  expect(
    document.querySelector('.validation-list')?.getAttribute('aria-label'),
  ).toBe('검증 결과')
  result = { errors: [], summary: [], token: 'valid' }
  await click('검수 내용 검증')
  expect(statuses()).toEqual(['통과', '미검증'])
  await click('다음 공명자미검증')
  await selectCandidate()
  expect(statuses()).toEqual(['통과', '미검증'])
  await click('검증 공명자통과')
  await selectCandidate()
  expect(statuses()).toEqual(['미검증', '미검증'])
  expect(
    document.querySelector('.target-list button')?.getAttribute('title'),
  ).toBe('ID 1102')
})
it('확인된 수집 오류는 검증 버튼을 누르기 전에도 오류로 표시한다', async () => {
  saved.source.draft.errors = ['이미지 수집 실패']
  await render()
  expect(
    [...document.querySelectorAll('.review-status')].every(
      (s) => s.textContent === '오류',
    ),
  ).toBe(true)
  result = { errors: [], summary: [], token: 'valid' }
  await click('검수 내용 검증')
  expect(document.querySelector('.review-status')?.textContent).toBe('통과')
})

it('응결로 시작하며 가로 속성 필터로 목록만 변경하고 검수 편집을 보존한다', async () => {
  saved.state.attribute = '인멸'
  await render()
  expect(
    [...document.querySelectorAll('.attribute-tabs button')].map(
      (b) => b.textContent,
    ),
  ).toEqual(['응결', '용융', '전도', '기류', '회절', '인멸'])
  expect(
    document.querySelector('.attribute-tabs [aria-pressed="true"]')
      ?.textContent,
  ).toBe('응결')
  expect(document.querySelectorAll('.target-list button')).toHaveLength(0)
  await click('인멸')
  expect(document.querySelectorAll('.target-list button')).toHaveLength(2)
  await selectCandidate()
  await click('응결')
  expect(document.querySelectorAll('.target-list button')).toHaveLength(0)
  await click('인멸')
  expect(decision('등록').checked).toBe(true)
})
it('검수 내용을 자동 저장하고 실패 시 편집을 보존한 채 재시도한다', async () => {
  vi.useFakeTimers()
  await render()
  await selectCandidate()
  vi.mocked(writeSavedReview).mockRejectedValueOnce(new Error('용량 부족'))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(650)
  })
  expect(document.body.textContent).toContain('저장 실패')
  expect(decision('등록').checked).toBe(true)
  await click('저장 재시도')
  await act(async () => {
    await vi.advanceTimersByTimeAsync(650)
  })
  expect(document.body.textContent).toContain('자동 저장됨')
  const record = vi.mocked(writeSavedReview).mock.calls.at(-1)![0]
  expect(record.file.characters[0].review.candidates[0].decision).toBe(
    'include',
  )
  expect(record.mode).toBe('workspace')
})
it('브라우저 복원 오류가 있으면 기존 저장본을 자동으로 덮어쓰지 않는다', async () => {
  vi.useFakeTimers()
  vi.mocked(readSavedReview).mockRejectedValueOnce(new Error('저장 형식 오류'))
  await render()
  await selectCandidate()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(650)
  })
  expect(document.body.textContent).toContain('복원 실패')
  expect(writeSavedReview).not.toHaveBeenCalled()
  expect(decision('등록').checked).toBe(true)
})

it('다시 열면 저장한 JSON 목록·미완성 편집·선택 대상을 복원하고 미검증은 유지한다', async () => {
  const source = structuredClone(saved.source)
  source.target.characterId = '1209'
  source.target.displayName = '불러온 공명자'
  source.draft.characterId = '1209'
  const state = {
    ...saved.state,
    characterId: '1209',
    displayName: '미완성 이름',
  }
  state.candidates[0].displayName = '저장한 스킬명'
  vi.mocked(readSavedReview).mockResolvedValueOnce({
    version: 1,
    mode: 'import',
    activeId: '1209',
    file: {
      format: 'wuwa-character-review-backup',
      schemaVersion: 2,
      characters: [
        {
          characterId: '1209',
          review: state,
          workspace: { source, images: [] },
        },
      ],
    },
  })
  await render()
  expect(document.querySelectorAll('.target-list button')).toHaveLength(1)
  expect(document.querySelector('.target-list button')?.textContent).toContain(
    '불러온 공명자미검증',
  )
  expect(
    document.querySelector<HTMLInputElement>('[aria-label="후보 1 스킬명"]')
      ?.value,
  ).toBe('저장한 스킬명')
  expect(
    document.querySelector('.target-list button')?.getAttribute('aria-current'),
  ).toBe('page')
  expect(decision('등록').checked).toBe(false)
})

it('검증한 대상은 복원 후 재검증하고 검증 진행 상태도 자동 저장한다', async () => {
  vi.useFakeTimers()
  result = { errors: [], summary: [], token: 'valid' }
  vi.mocked(readSavedReview).mockResolvedValueOnce({
    version: 1,
    mode: 'import',
    activeId: '1102',
    validatedIds: ['1102'],
    file: {
      format: 'wuwa-character-review-backup',
      schemaVersion: 2,
      characters: [
        {
          characterId: '1102',
          review: saved.state,
          workspace: { source: saved.source, images: [] },
        },
      ],
    },
  })
  await render()
  expect(writes).toContain('validate')
  expect(document.querySelector('.review-status')?.textContent).toBe('통과')
  await act(async () => {
    await vi.advanceTimersByTimeAsync(650)
  })
  expect(
    vi.mocked(writeSavedReview).mock.calls.at(-1)![0].validatedIds,
  ).toEqual(['1102'])
  await selectCandidate()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(650)
  })
  expect(
    vi.mocked(writeSavedReview).mock.calls.at(-1)![0].validatedIds,
  ).toEqual([])
})
