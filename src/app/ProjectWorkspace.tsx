import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { App } from './App'
import { emptyCatalog, type CharacterCatalog } from './catalog'
import { createInputDemoRotation, demoCatalog } from './demo'
import { ProjectStore } from './project-store'
import { createRotation } from '../domain/rotation'
import type { CharacterDataIssue } from '../data/characters/load'
import {
  IndexedDbProjectRepository,
  type ProjectRepository,
} from '../storage/project-repository'

export interface WorkspaceProps {
  repository?: ProjectRepository
  catalog?: CharacterCatalog
  catalogIssues?: readonly CharacterDataIssue[]
}

export function ProjectWorkspace({
  repository,
  catalog,
  catalogIssues = [],
}: WorkspaceProps = {}) {
  const storageDemo =
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get('demo') === 'storage'
  const activeCatalog = catalog ?? (storageDemo ? demoCatalog : emptyCatalog)
  const [store] = useState(
    () =>
      new ProjectStore(
        repository ??
          new IndexedDbProjectRepository(
            storageDemo ? 'wuwa-rotation-builder-demo-storage' : undefined,
          ),
        activeCatalog,
        storageDemo ? createInputDemoRotation : undefined,
      ),
  )
  const state = useSyncExternalStore(store.subscribe, store.snapshot)
  const [name, setName] = useState('')
  const [emptyRotation] = useState(() =>
    createRotation(['slot-one', 'slot-two', 'slot-three']),
  )
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const headerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const selectionRef = useRef<Promise<void> | null>(null)
  const currentName = state.current?.name ?? ''
  const currentId = state.current?.id
  useEffect(() => {
    void store.initialize()
    return () => store.pauseAutosave()
  }, [store])
  useEffect(() => {
    setName(currentName)
  }, [currentId, currentName])
  useEffect(() => {
    if (!pickerOpen) return
    const outside = (event: PointerEvent) => {
      if (confirmDelete) return
      if (!headerRef.current?.contains(event.target as Node))
        setPickerOpen(false)
    }
    document.addEventListener('pointerdown', outside)
    return () => document.removeEventListener('pointerdown', outside)
  }, [pickerOpen, confirmDelete])
  const selectProject = async (id: string, close = false) => {
    if (!store.snapshot().busy) selectionRef.current = store.open(id)
    const pending = selectionRef.current
    await pending
    if (selectionRef.current === pending) selectionRef.current = null
    const latest = store.snapshot()
    if (close && latest.current?.id === id && !latest.error) {
      setPickerOpen(false)
      triggerRef.current?.focus()
    }
  }
  const disabled = state.loading || state.busy || confirmDelete
  const saveLabel = state.loading
    ? '불러오는 중…'
    : state.status === 'saving'
      ? '저장 중…'
      : state.status === 'dirty'
        ? '저장 대기'
        : state.status === 'error'
          ? '저장 실패'
          : state.current
            ? '저장됨'
            : '미선택'
  const headerControls = (
    <div
      className="header-project"
      aria-label="프로젝트 관리"
      ref={headerRef}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && pickerOpen) {
          event.stopPropagation()
          setPickerOpen(false)
          triggerRef.current?.focus()
        }
      }}
    >
      <span className="project-save-state" role="status" aria-live="polite">
        {saveLabel}
      </span>
      <button
        className="project-trigger"
        data-project-id={currentId}
        ref={triggerRef}
        aria-label="프로젝트 선택"
        aria-expanded={pickerOpen}
        aria-controls="project-dropdown"
        disabled={disabled}
        title={currentName || '프로젝트 선택'}
        onClick={() => setPickerOpen(!pickerOpen)}
      >
        <span>{currentName || '프로젝트 선택'}</span>
        <span aria-hidden="true">▾</span>
      </button>
      {pickerOpen && (
        <div
          className="project-dropdown"
          id="project-dropdown"
          role="region"
          aria-label="프로젝트 선택창"
        >
          <form
            className="header-project-name"
            onSubmit={(event) => {
              event.preventDefault()
              void store.rename(name)
            }}
          >
            <label htmlFor="header-project-name">현재 프로젝트</label>
            <input
              id="header-project-name"
              aria-label="프로젝트 이름"
              value={name}
              title={currentName}
              disabled={disabled || !state.current}
              placeholder="프로젝트 미선택"
              onChange={(event) => setName(event.target.value)}
            />
            <div className="header-project-actions">
              <button
                aria-label="이름 변경"
                disabled={
                  disabled || !state.current || name.trim() === currentName
                }
              >
                수정
              </button>
              <button
                type="button"
                disabled={disabled || !state.current}
                onClick={() => void store.duplicate()}
              >
                복제
              </button>
              <button
                type="button"
                disabled={disabled || !state.current}
                onClick={() => setConfirmDelete(true)}
              >
                삭제
              </button>
            </div>
          </form>
          <div className="project-dropdown-list" aria-label="프로젝트 목록">
            {state.projects.map((project) => (
              <button
                type="button"
                key={project.id}
                data-project-id={project.id}
                aria-pressed={currentId === project.id}
                title={project.name}
                disabled={
                  state.loading ||
                  confirmDelete ||
                  (!!state.error && !state.current)
                }
                onClick={() => void selectProject(project.id)}
                onDoubleClick={() => void selectProject(project.id, true)}
              >
                <span aria-hidden="true">
                  {currentId === project.id ? '✓' : ''}
                </span>
                <span>{project.name}</span>
              </button>
            ))}
            {!state.projects.length && <p>저장된 프로젝트가 없습니다.</p>}
          </div>
          <button
            className="project-create"
            type="button"
            disabled={disabled || (!!state.error && !state.current)}
            onClick={() => void store.create()}
          >
            새 프로젝트
          </button>
        </div>
      )}
    </div>
  )
  const notices = (
    <>
      {catalogIssues.length > 0 && (
        <details className="catalog-issues" role="alert">
          <summary>
            공명자 데이터 오류 {catalogIssues.length}건 · 해당 공명자는 선택
            목록에서 제외됩니다.
          </summary>
          <ul>
            {catalogIssues.map((issue, index) => (
              <li key={`${issue.path}-${index}`}>
                {issue.characterId}: {issue.message}
              </li>
            ))}
          </ul>
        </details>
      )}
      {!state.current && !state.loading && (
        <p className="project-empty">
          새 프로젝트를 만들거나 목록에서 선택해 주세요.
        </p>
      )}
      {state.error && (
        <div className="project-error" role="alert">
          {state.error}
          <button
            disabled={state.busy || state.loading}
            onClick={() => void store.retry()}
          >
            재시도
          </button>
        </div>
      )}
      {confirmDelete && state.current && (
        <div
          className="confirm-backdrop"
          onKeyDown={(event) => {
            if (event.key === 'Escape' && !state.busy) setConfirmDelete(false)
            if (event.key !== 'Tab') return
            const buttons =
              event.currentTarget.querySelectorAll<HTMLButtonElement>(
                'button:not(:disabled)',
              )
            if (!buttons.length) return
            if (event.shiftKey && document.activeElement === buttons[0]) {
              event.preventDefault()
              buttons[buttons.length - 1].focus()
            } else if (
              !event.shiftKey &&
              document.activeElement === buttons[buttons.length - 1]
            ) {
              event.preventDefault()
              buttons[0].focus()
            }
          }}
        >
          <section
            className="confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-delete-title"
            aria-describedby="project-delete-description"
          >
            <h2 id="project-delete-title">프로젝트 삭제</h2>
            <p id="project-delete-description">
              “{state.current.name}” 프로젝트를 삭제하시겠습니까? 삭제는 실행
              취소할 수 없습니다.
            </p>
            <div className="confirm-actions">
              <button
                autoFocus
                disabled={state.busy}
                onClick={() => setConfirmDelete(false)}
              >
                취소
              </button>
              <button
                className="confirm-submit"
                disabled={state.busy}
                onClick={async () => {
                  await store.deleteCurrent()
                  setConfirmDelete(false)
                }}
              >
                삭제
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  )
  return (
    <div className="app-shell">
      <header className="page-heading">
        <div>
          <span className="eyebrow">WUTHERING WAVES · ROTATION WORKSPACE</span>
          <h1>WUWA Rotation Builder</h1>
        </div>
        {headerControls}
      </header>
      {notices}
      <App
        embedded
        key={state.generation}
        initialRotation={state.current?.rotation ?? emptyRotation}
        catalogOverride={activeCatalog}
        references={state.current?.references}
        onRotationChange={store.updateRotation}
        locked={state.loading || !state.current || state.busy || confirmDelete}
      />
    </div>
  )
}
