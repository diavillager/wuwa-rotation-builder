// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { IDBFactory } from 'fake-indexeddb'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ProjectWorkspace } from './ProjectWorkspace'
import { IndexedDbProjectRepository } from '../storage/project-repository'
import { createProject } from '../domain/project'
import { createInputDemoRotation, demoCatalog } from './demo'

let root: Root
let repo: IndexedDbProjectRepository
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  )
  window.history.replaceState({}, '', '/?demo=storage')
  document.body.innerHTML = '<div id="root"></div>'
  root = createRoot(document.querySelector('#root')!)
  repo = new IndexedDbProjectRepository('ui-test', new IDBFactory())
})
afterEach(async () => {
  await act(async () => root.unmount())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
async function waitFor(check: () => void) {
  await vi.waitFor(
    async () => {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10))
      })
      check()
    },
    { interval: 10, timeout: 3000 },
  )
}
async function render() {
  await act(async () =>
    root.render(
      <StrictMode>
        <ProjectWorkspace repository={repo} catalog={demoCatalog} />
      </StrictMode>,
    ),
  )
  await waitFor(() =>
    expect(
      document.querySelector('.project-save-state')?.textContent,
    ).not.toContain('불러오는'),
  )
}
function button(text: string) {
  return [
    ...document.querySelectorAll<HTMLButtonElement>(
      '.header-project button, .project-error button, .confirm-dialog button',
    ),
  ].find(
    (item) =>
      item.textContent === text || item.getAttribute('aria-label') === text,
  )!
}
async function click(text: string) {
  if (!button(text)) await openPicker()
  await act(async () => button(text).click())
}
async function openPicker() {
  if (!document.querySelector('.project-dropdown'))
    await act(async () => button('프로젝트 선택').click())
}
async function insertE() {
  if (document.querySelector('.project-dropdown')) await click('프로젝트 선택')
  await act(async () => {
    document
      .querySelector('[data-capture-cycle="opening"] .end-cell')!
      .dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    document.dispatchEvent(
      new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }),
    )
    document.dispatchEvent(
      new KeyboardEvent('keyup', { code: 'KeyE', bubbles: true }),
    )
  })
}
async function select(id: string) {
  await openPicker()
  await act(async () => {
    document
      .querySelector<HTMLButtonElement>(
        `.project-dropdown-list [data-project-id="${id}"]`,
      )!
      .click()
  })
  await waitFor(() => {
    const select = document.querySelector<HTMLButtonElement>(
      '[aria-label="프로젝트 선택"]',
    )!
    expect(select.dataset.projectId).toBe(id)
    expect(select.disabled).toBe(false)
  })
}

describe('프로젝트 관리 화면', () => {
  it('선택창을 열어도 편집 필드를 유지하고 Escape와 외부 클릭으로만 닫는다', async () => {
    await render()
    await click('새 프로젝트')
    await waitFor(() =>
      expect(document.querySelector('.party-panel')).not.toBeNull(),
    )
    await openPicker()
    await act(async () => {
      document
        .querySelector('[data-capture-cycle="opening"] .end-cell')!
        .dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
      document.dispatchEvent(
        new KeyboardEvent('keydown', { code: 'KeyE', bubbles: true }),
      )
      document.dispatchEvent(
        new KeyboardEvent('keyup', { code: 'KeyE', bubbles: true }),
      )
    })
    expect(document.querySelectorAll('.input-card')).toHaveLength(1)
    expect(
      document
        .querySelector('.party-panel')!
        .parentElement!.hasAttribute('inert'),
    ).toBe(false)
    expect(document.querySelector('.project-dropdown')).not.toBeNull()
    expect(
      document
        .querySelector('.project-create')
        ?.closest('.project-dropdown-list'),
    ).toBeNull()
    await act(async () =>
      document
        .querySelector('.project-dropdown')!
        .dispatchEvent(
          new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
        ),
    )
    expect(document.querySelector('.project-dropdown')).toBeNull()
    expect(document.activeElement).toBe(button('프로젝트 선택'))
    await openPicker()
    await act(async () =>
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true })),
    )
    expect(document.querySelector('.project-dropdown')).toBeNull()
  })
  it('한 줄 헤더와 드롭다운에서 이름 수정·프로젝트 선택을 지원하고 수정은 이력을 유지한다', async () => {
    await render()
    await click('새 프로젝트')
    await waitFor(() =>
      expect(document.querySelector('.party-panel')).not.toBeNull(),
    )
    await insertE()
    expect(document.querySelector('.project-panel')).toBeNull()
    expect(document.querySelector('.foundation-badge')).toBeNull()
    expect(
      document.querySelector('.header-project')!.closest('.page-heading'),
    ).not.toBeNull()
    expect(
      document.querySelector('.project-save-state')!.closest('.header-project'),
    ).not.toBeNull()
    expect(
      document
        .querySelector('[aria-label="프로젝트 선택"]')!
        .closest('.header-project'),
    ).not.toBeNull()
    await openPicker()
    await act(async () => {
      const input = document.querySelector<HTMLInputElement>(
        '[aria-label="프로젝트 이름"]',
      )!
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!.call(input, '제목 변경')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click('이름 변경')
    await waitFor(() =>
      expect(
        document.querySelector('.project-trigger')?.getAttribute('title'),
      ).toBe('제목 변경'),
    )
    expect(document.querySelectorAll('.input-card')).toHaveLength(1)
    await click('프로젝트 선택')
    expect(
      document.querySelector<HTMLButtonElement>(
        '[aria-label="개막 사이클 실행 취소"]',
      )!.disabled,
    ).toBe(false)
  })
  it('빈 목록에서 명시적으로 생성하고 자동저장 후 Undo를 유지하며 다시 열면 초기화한다', async () => {
    await render()
    expect(document.querySelector('.party-panel')).not.toBeNull()
    await click('새 프로젝트')
    await waitFor(() =>
      expect(document.querySelector('.party-panel')).not.toBeNull(),
    )
    const first = (await repo.list())[0]
    expect(
      document.querySelector('.project-trigger')?.getAttribute('title'),
    ).toBe('새 로테이션 1')
    await insertE()
    await waitFor(() =>
      expect(document.querySelector('.project-save-state')?.textContent).toBe(
        '저장됨',
      ),
    )
    const undo = document.querySelector<HTMLButtonElement>(
      '[aria-label="개막 사이클 실행 취소"]',
    )!
    expect(undo.disabled).toBe(false)
    expect((await repo.list())[0].rotation.opening.columns).toHaveLength(1)
    await click('새 프로젝트')
    await waitFor(() =>
      expect(
        document.querySelector('.project-trigger')?.getAttribute('title'),
      ).toBe('새 로테이션 2'),
    )
    await select(first.id)
    await waitFor(() =>
      expect(document.querySelectorAll('.input-card')).toHaveLength(1),
    )
    expect(
      document.querySelector<HTMLButtonElement>(
        '[aria-label="개막 사이클 실행 취소"]',
      )!.disabled,
    ).toBe(true)
    expect(
      document.querySelector<HTMLButtonElement>(
        '[aria-label="개막 사이클 다시 실행"]',
      )!.disabled,
    ).toBe(true)
    expect(
      document
        .querySelector('.header-project')!
        .compareDocumentPosition(document.querySelector('.party-panel')!) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })
  it('수정·복제·삭제 후 선택창을 유지하며 이전 프로젝트와 마지막 삭제의 새 프로젝트를 선택한다', async () => {
    await render()
    await click('새 프로젝트')
    await waitFor(() =>
      expect(document.querySelector('.party-panel')).not.toBeNull(),
    )
    await insertE()
    await click('복제')
    await waitFor(() =>
      expect(
        document.querySelector('.project-trigger')?.getAttribute('title'),
      ).toBe('새 로테이션 1 - 복제본'),
    )
    expect(document.querySelector('.project-dropdown')).not.toBeNull()
    expect(
      document
        .querySelector('.project-dropdown-list [aria-pressed="true"]')
        ?.getAttribute('title'),
    ).toBe('새 로테이션 1 - 복제본')
    expect(document.querySelectorAll('.input-card')).toHaveLength(1)
    const generationUndo = document.querySelector<HTMLButtonElement>(
      '[aria-label="개막 사이클 실행 취소"]',
    )!
    expect(generationUndo.disabled).toBe(true)
    await openPicker()
    await act(async () => {
      const input = document.querySelector<HTMLInputElement>(
        '[aria-label="프로젝트 이름"]',
      )!
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      )!.set!.call(input, '이름 수정')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await click('이름 변경')
    await waitFor(() =>
      expect(
        document.querySelector('.project-trigger')?.getAttribute('title'),
      ).toBe('이름 수정'),
    )
    expect(document.querySelector('.project-dropdown')).not.toBeNull()
    await click('삭제')
    expect(
      document.querySelector('#project-delete-description')?.textContent,
    ).toContain('이름 수정')
    expect(
      document
        .querySelector('.party-panel')!
        .parentElement!.hasAttribute('inert'),
    ).toBe(true)
    await click('취소')
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(await repo.list()).toHaveLength(2)
    await click('삭제')
    await act(async () =>
      document
        .querySelector('.confirm-submit')!
        .dispatchEvent(new Event('pointerdown', { bubbles: true })),
    )
    expect(document.querySelector('.project-dropdown')).not.toBeNull()
    await act(async () =>
      document.querySelector<HTMLButtonElement>('.confirm-submit')!.click(),
    )
    await waitFor(() =>
      expect(document.querySelector('[role="dialog"]')).toBeNull(),
    )
    const remaining = (await repo.list())[0]
    expect(button('프로젝트 선택').dataset.projectId).toBe(remaining.id)
    expect(document.querySelector('.project-dropdown')).not.toBeNull()
    await click('삭제')
    await act(async () =>
      document.querySelector<HTMLButtonElement>('.confirm-submit')!.click(),
    )
    await waitFor(() =>
      expect(document.querySelector('[role="dialog"]')).toBeNull(),
    )
    const projects = await repo.list()
    expect(projects).toHaveLength(1)
    expect(projects[0].id).not.toBe(remaining.id)
    expect(projects[0].rotation.opening.columns).toEqual([])
    expect(button('프로젝트 선택').dataset.projectId).toBe(projects[0].id)
    expect(document.querySelector('.project-dropdown')).not.toBeNull()
    expect(document.querySelector('.party-panel')).not.toBeNull()
  })
  it('마지막 프로젝트를 다시 마운트해 복원하되 Undo/Redo를 저장하지 않는다', async () => {
    await render()
    await click('새 프로젝트')
    await waitFor(() =>
      expect(document.querySelector('.party-panel')).not.toBeNull(),
    )
    await insertE()
    await waitFor(() =>
      expect(document.querySelector('.project-save-state')?.textContent).toBe(
        '저장됨',
      ),
    )
    const id = await repo.selectedId()
    await act(async () => root.unmount())
    root = createRoot(document.querySelector('#root')!)
    await render()
    expect(document.querySelectorAll('.input-card')).toHaveLength(1)
    expect(
      document.querySelector<HTMLButtonElement>('.project-trigger')?.dataset
        .projectId,
    ).toBe(id)
    expect(
      document.querySelector<HTMLButtonElement>(
        '[aria-label="개막 사이클 실행 취소"]',
      )!.disabled,
    ).toBe(true)
  })
  it('저장 실패 중 전환·삭제로 편집을 잃지 않고 재시도한다', async () => {
    await render()
    await click('새 프로젝트')
    await waitFor(() =>
      expect(document.querySelector('.party-panel')).not.toBeNull(),
    )
    const put = vi
      .spyOn(repo, 'put')
      .mockRejectedValue(new Error('저장 공간 부족'))
    await insertE()
    await click('새 프로젝트')
    await waitFor(() =>
      expect(document.querySelector('[role="alert"]')?.textContent).toContain(
        '저장 공간 부족',
      ),
    )
    expect(document.querySelectorAll('.input-card')).toHaveLength(1)
    expect(await repo.list()).toHaveLength(1)
    await click('삭제')
    await act(async () =>
      document.querySelector<HTMLButtonElement>('.confirm-submit')!.click(),
    )
    await waitFor(() =>
      expect(document.querySelector('[role="dialog"]')).toBeNull(),
    )
    expect(document.querySelectorAll('.input-card')).toHaveLength(1)
    expect(await repo.list()).toHaveLength(1)
    put.mockRestore()
    await click('재시도')
    await waitFor(() =>
      expect(document.querySelector('.project-save-state')?.textContent).toBe(
        '저장됨',
      ),
    )
    expect((await repo.list())[0].rotation.opening.columns).toHaveLength(1)
  })
  it('현재 catalog가 사라져도 저장된 이름으로 표시하고 ID나 스킬을 다른 데이터로 대체하지 않는다', async () => {
    const project = createProject(
      'saved',
      '누락 데이터',
      '2026-10-01T03:00:00.000Z',
      createInputDemoRotation(),
      {
        characters: [{ id: 'demo-a', displayName: '저장된 공명자' }],
        skills: [],
      },
    )
    await repo.put(project)
    await repo.select(project.id)
    await act(async () =>
      root.render(
        <ProjectWorkspace repository={repo} catalog={{ characters: [] }} />,
      ),
    )
    await waitFor(() =>
      expect(
        document.querySelectorAll('.party-slot')[0]?.textContent,
      ).toContain('저장된 공명자 (데이터 누락)'),
    )
    expect((await repo.list())[0].rotation.party).toEqual([
      'demo-a',
      'demo-b',
      'demo-c',
    ])
  })
})
