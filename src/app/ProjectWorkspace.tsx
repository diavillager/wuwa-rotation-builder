import { useEffect, useState, useSyncExternalStore } from 'react'
import { App } from './App'
import { emptyCatalog, type CharacterCatalog } from './catalog'
import { createInputDemoRotation, demoCatalog } from './demo'
import { ProjectStore } from './project-store'
import {
  IndexedDbProjectRepository,
  type ProjectRepository,
} from '../storage/project-repository'

export interface WorkspaceProps {
  repository?: ProjectRepository
  catalog?: CharacterCatalog
}

export function ProjectWorkspace({ repository, catalog }: WorkspaceProps = {}) {
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
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [selectingProject, setSelectingProject] = useState(false)
  const currentName = state.current?.name ?? ''
  const currentId = state.current?.id
  useEffect(() => {
    void store.initialize()
    return () => store.pauseAutosave()
  }, [store])
  useEffect(() => {
    setName(currentName)
  }, [currentId, currentName])
  const disabled = state.loading || state.busy || confirmDelete
  const showPicker =
    selectingProject || (!state.current && state.projects.length > 0)
  const chooseProject = async (id: string) => {
    await store.open(id)
    if (store.snapshot().current?.id === id) setSelectingProject(false)
  }
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
  const toolbar = (
    <section className="project-panel" aria-label="프로젝트 관리">
      <div className="section-heading">
        <div>
          <span className="eyebrow">PROJECT MANAGEMENT</span>
          <h2>프로젝트 관리</h2>
        </div>
        <span
          className="status project-save-state"
          role="status"
          aria-live="polite"
        >
          {saveLabel}
        </span>
      </div>
      {state.current && (
        <button
          className="project-current"
          data-project-id={currentId}
          aria-label="프로젝트 선택창 열기"
          aria-expanded={showPicker}
          aria-controls="project-picker"
          disabled={disabled}
          onClick={() => setSelectingProject(!selectingProject)}
        >
          <small>현재 프로젝트</small>
          <strong>{currentName}</strong>
        </button>
      )}
      {showPicker && (
        <div
          id="project-picker"
          className="project-picker"
          aria-label="프로젝트 선택"
        >
          <div className="selector-heading">
            <strong>프로젝트 선택</strong>
            {state.current && (
              <button
                disabled={state.busy}
                onClick={() => setSelectingProject(false)}
              >
                닫기
              </button>
            )}
          </div>
          <div className="project-options">
            {state.projects.map((project) => (
              <button
                key={project.id}
                data-project-id={project.id}
                className={currentId === project.id ? 'selected' : ''}
                aria-pressed={currentId === project.id}
                disabled={state.busy}
                onClick={() => void chooseProject(project.id)}
              >
                <strong>{project.name}</strong>
                {currentId === project.id && <small>현재 프로젝트</small>}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="project-controls" hidden={showPicker}>
        <button
          disabled={disabled || (!!state.error && !state.current)}
          onClick={() => void store.create()}
        >
          새 프로젝트
        </button>
        <button
          disabled={disabled || !state.current}
          onClick={() => void store.duplicate()}
        >
          복제
        </button>
        <button
          disabled={disabled || !state.current}
          onClick={() => setConfirmDelete(true)}
        >
          삭제
        </button>
        <div className="project-export-slot" aria-hidden="true" />
      </div>
      {state.current && !showPicker && (
        <form
          className="project-name"
          onSubmit={(event) => {
            event.preventDefault()
            void store.rename(name)
          }}
        >
          <input
            aria-label="프로젝트 이름"
            value={name}
            disabled={disabled}
            onChange={(event) => setName(event.target.value)}
          />
          <button disabled={disabled || name.trim() === state.current.name}>
            이름 변경
          </button>
        </form>
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
    </section>
  )
  if (state.current && !state.loading)
    return (
      <App
        key={state.generation}
        initialRotation={state.current.rotation}
        catalogOverride={activeCatalog}
        references={state.current.references}
        projectControls={toolbar}
        onRotationChange={store.updateRotation}
        locked={state.busy || confirmDelete}
        hideEditor={showPicker}
      />
    )
  return (
    <main className="app-shell">
      <header className="page-heading">
        <div>
          <span className="eyebrow">WUTHERING WAVES · ROTATION WORKSPACE</span>
          <h1>WUWA Rotation Builder</h1>
        </div>
      </header>
      {toolbar}
    </main>
  )
}
