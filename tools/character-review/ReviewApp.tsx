import { useEffect, useRef, useState } from 'react'
import { ELEMENTS } from '../../src/app/catalog'
import { WEAPON_TYPES } from '../../src/data/characters/weapons'
import {
  SKILL_CATEGORIES,
  supportsHitCount,
  type SkillCategory,
} from '../../src/data/characters/categories'
import {
  assignEncore,
  sortReviewCardsByCategory,
  undoEncore,
  reviewFieldKey,
  type AssignmentReceipt,
} from './editing'
import {
  TOOLTIP_CATEGORIES,
  AUTO_KINDS,
  AUTO_LABELS,
  reviewCards,
  selectableSkills,
  type ReviewSession,
  type ReviewState,
  type ReviewTarget,
  type ReviewValidation,
} from './model'
import type { ReviewExport } from './repository'
import {
  readSavedReview,
  writeSavedReview,
  updateBackup,
  sameRoster,
  mergeWorkspaceBackup,
  type ReviewBackup,
  type SavedReview,
} from './storage'

type Result = ReviewValidation & { characterId: string; displayName: string }
type Work = {
  session: ReviewSession
  state: ReviewState
  baseline: string
  receipt?: AssignmentReceipt
}
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const body = await response.json()
  if (!response.ok) throw new Error(body.error ?? '검수 요청에 실패했습니다.')
  return body as T
}
const query = (target: Pick<ReviewTarget, 'runId' | 'characterId'>) =>
  new URLSearchParams({
    runId: target.runId,
    characterId: target.characterId,
  }).toString()
const imageUrl = (
  target: ReviewTarget,
  image: { candidateId: string } | { asset: string },
) => `/api/review/image?${query(target)}&${new URLSearchParams(image)}`
const SOURCE_LABELS = {
  encore: 'Encore',
  'ww-data': 'WW_Data',
  'ww-asset': 'WW_Asset',
}

export function ReviewApp() {
  const [works, setWorks] = useState<Work[]>([])
  const [activeId, setActiveId] = useState('')
  const [selectedElement, setSelectedElement] =
    useState<(typeof ELEMENTS)[number]>('응결')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(true)
  const [errors, setErrors] = useState<string[]>([])
  const [failure, setFailure] = useState('')
  const [notice, setNotice] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [storageStatus, setStorageStatus] = useState('불러오는 중')
  const [storageError, setStorageError] = useState('')
  const [saveAttempt, setSaveAttempt] = useState(0)
  const [readyToSave, setReadyToSave] = useState(false)
  const backupCache = useRef<Promise<ReviewBackup> | null>(null)
  const storageMode = useRef<SavedReview['mode']>('workspace')
  const restoreBlocked = useRef(false)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const dragging = useRef<{ key: string; x: number; y: number } | null>(null)
  const importInput = useRef<HTMLInputElement>(null)
  const active = works.find((w) => w.state.characterId === activeId)
  const state = active?.state
  const source = active?.session.source
  const cards = state && source ? reviewCards(state, source) : []
  const dirty = works.some((w) => JSON.stringify(w.state) !== w.baseline)
  useEffect(() => {
    let mounted = true
    void Promise.all([
      request<{ token: string }>('/api/review/session'),
      request<{ targets: ReviewTarget[]; errors: string[] }>(
        '/api/review/targets',
      ),
    ])
      .then(async ([auth, listing]) => {
        let stored: SavedReview | null = null
        try {
          stored = await readSavedReview()
        } catch (error) {
          restoreBlocked.current = true
          if (mounted) {
            setStorageError(`브라우저 복원 실패: ${(error as Error).message}`)
            setStorageStatus('복원 실패')
          }
        }
        const loaded = await Promise.allSettled(
          listing.targets.map((t) =>
            request<ReviewSession>(`/api/review/load?${query(t)}`),
          ),
        )
        if (!mounted) return
        const entries: Work[] = []
        const issues = [...listing.errors]
        loaded.forEach((result, i) => {
          if (result.status === 'fulfilled')
            entries.push({
              session: result.value,
              state: result.value.state,
              baseline: JSON.stringify(result.value.state),
            })
          else
            issues.push(
              `${listing.targets[i].displayName}: ${String(result.reason)}`,
            )
        })
        let restoredActive = ''
        if (stored) {
          try {
            let file = stored.file
            if (
              stored.mode === 'workspace' &&
              listing.targets.length > 0 &&
              !sameRoster(file, listing.targets)
            ) {
              const fresh = await request<{ file: ReviewBackup }>(
                '/api/review/backup',
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'X-Review-Token': auth.token,
                  },
                  body: JSON.stringify({ states: entries.map((w) => w.state) }),
                },
              )
              file = mergeWorkspaceBackup(fresh.file, file)
            }
            const restored = await request<{ sessions: ReviewSession[] }>(
              '/api/review/import',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Review-Token': auth.token,
                },
                body: JSON.stringify({ file }),
              },
            )
            entries.splice(
              0,
              entries.length,
              ...restored.sessions.map((session) => ({
                session,
                state: session.state,
                baseline: JSON.stringify(session.state),
              })),
            )
            backupCache.current = Promise.resolve(file)
            storageMode.current = stored.mode
            restoredActive = stored.activeId
            const previouslyValidated = entries.filter((entry) =>
              stored.validatedIds?.includes(entry.state.characterId),
            )
            if (previouslyValidated.length) {
              const checked = await request<{ results: Result[] }>(
                '/api/review/validate',
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'X-Review-Token': auth.token,
                  },
                  body: JSON.stringify({
                    states: previouslyValidated.map((entry) => entry.state),
                  }),
                },
              )
              if (mounted) setResults(checked.results)
            }
          } catch (error) {
            restoreBlocked.current = true
            if (mounted) {
              setStorageError(
                `브라우저 복원 실패: ${(error as Error).message}. 기존 저장본은 유지합니다.`,
              )
              setStorageStatus('복원 실패')
            }
          }
        }
        if (!mounted) return
        setToken(auth.token)
        setWorks(entries)
        setReadyToSave(!restoreBlocked.current)
        setErrors(issues)
        setActiveId(
          entries.some((w) => w.state.characterId === restoredActive)
            ? restoredActive
            : (entries[0]?.state.characterId ?? ''),
        )
      })
      .catch((e: Error) => {
        if (mounted) setFailure(e.message)
      })
      .finally(() => {
        if (mounted) setBusy(false)
      })
    return () => {
      mounted = false
    }
  }, [])
  useEffect(() => {
    if (!dirty || storageStatus === '자동 저장됨') return
    const listener = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', listener)
    return () => window.removeEventListener('beforeunload', listener)
  }, [dirty, storageStatus])
  useEffect(() => {
    if (!readyToSave || !works.length || !token) return
    let cancelled = false
    setStorageStatus('저장 중')
    const timer = setTimeout(() => {
      void (async () => {
        try {
          if (!backupCache.current) {
            backupCache.current = request<{ file: ReviewBackup }>(
              '/api/review/backup',
              {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'X-Review-Token': token,
                },
                body: JSON.stringify({ states: works.map((w) => w.state) }),
              },
            ).then((response) => response.file)
            // 실패한 준비 요청은 다음 저장에서 재시도한다.
            const pending = backupCache.current
            void pending.catch(() => {
              if (backupCache.current === pending) backupCache.current = null
            })
          }
          const original = await backupCache.current
          if (cancelled) return
          const file = updateBackup(
            original,
            works.map((w) => w.state),
          )
          await writeSavedReview({
            version: 1,
            mode: storageMode.current,
            activeId,
            validatedIds: results.map((result) => result.characterId),
            file,
          })
          if (!cancelled) {
            setStorageStatus('자동 저장됨')
            setStorageError('')
          }
        } catch (error) {
          if (!cancelled) {
            setStorageStatus('저장 실패')
            setStorageError((error as Error).message)
          }
        }
      })()
    }, 600)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [works, activeId, results, token, readyToSave, saveAttempt])
  const change = (
    edit: (s: ReviewState) => ReviewState,
    touched: string[] = [],
  ) => {
    setWorks((current) =>
      current.map((w) =>
        w.state.characterId !== activeId
          ? w
          : {
              ...w,
              state: edit(w.state),
              receipt: w.receipt
                ? {
                    ...w.receipt,
                    manual: [...new Set([...w.receipt.manual, ...touched])],
                  }
                : undefined,
            },
      ),
    )
    setResults((current) => current.filter((r) => r.characterId !== activeId))
    setNotice('')
    setFailure('')
  }
  const toggleEncore = () => {
    if (!active) return
    setWorks((current) =>
      current.map((w) => {
        if (w.state.characterId !== activeId) return w
        if (w.receipt)
          return {
            ...w,
            state: undoEncore(w.state, w.receipt),
            receipt: undefined,
          }
        const after = assignEncore(w.state, w.session.source)
        return {
          ...w,
          state: after,
          receipt: {
            before: structuredClone(w.state),
            after: structuredClone(after),
            manual: [],
          },
        }
      }),
    )
    setResults((current) => current.filter((r) => r.characterId !== activeId))
    setNotice('')
    setFailure('')
  }
  const submit = async (action: 'validate' | 'export' | 'backup') => {
    setBusy(true)
    setFailure('')
    setNotice('')
    try {
      const response = await request<{
        results?: Result[]
        file?: ReviewExport
      }>(`/api/review/${action}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Review-Token': token,
        },
        body: JSON.stringify({ states: works.map((w) => w.state) }),
      })
      if (response.results) setResults(response.results)
      const passed = (response.results ?? []).filter((r) => !r.errors.length)
      if (action !== 'validate' && response.file) {
        const url = URL.createObjectURL(
          new Blob([JSON.stringify(response.file, null, 2) + '\n'], {
            type: 'application/json',
          }),
        )
        const link = document.createElement('a')
        link.href = url
        link.download =
          action === 'backup'
            ? 'wuwa-character-review-backup.json'
            : 'wuwa-character-review.json'
        document.body.append(link)
        link.click()
        link.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        const exported = new Set(
          response.file.characters.map((c) => c.characterId),
        )
        setWorks((current) =>
          current.map((w) =>
            exported.has(w.state.characterId)
              ? { ...w, baseline: JSON.stringify(w.state) }
              : w,
          ),
        )
        setNotice(
          action === 'backup'
            ? `${exported.size}명의 미완성 검수와 이미지까지 백업했습니다. 'JSON으로 불러오기'로 다시 불러올 수 있습니다.`
            : `${exported.size}명의 JSON을 내보냈습니다. 파일을 에이전트에게 전달하면 재검증 후 DB에 반영합니다.${(response.results?.length ?? 0) > exported.size ? ' 미완료 공명자는 제외했습니다.' : ''}`,
        )
      } else
        setNotice(
          `검수 내용 검증: ${passed.length}명 통과 / ${response.results?.length ?? 0}명`,
        )
    } catch (e) {
      setFailure((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const importFile = async (file: File) => {
    if (
      dirty &&
      !window.confirm(
        'JSON에 포함된 공명자의 검수 내용을 갱신합니다. 파일에 없는 공명자는 유지합니다. 계속할까요?',
      )
    )
      return
    setBusy(true)
    setFailure('')
    setNotice('')
    try {
      if (file.size > 60 * 1024 * 1024)
        throw new Error('JSON 파일은 60MB 이하여야 합니다.')
      const value: unknown = JSON.parse(await file.text())
      const response = await request<{ sessions: ReviewSession[] }>(
        '/api/review/import',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Review-Token': token,
          },
          body: JSON.stringify({ file: value }),
        },
      )
      backupCache.current = null
      storageMode.current = 'import'
      restoreBlocked.current = false
      setReadyToSave(true)
      const imported = new Map(
        response.sessions.map((session) => [
          session.state.characterId,
          {
            session,
            state: session.state,
            baseline: JSON.stringify(session.state),
          },
        ]),
      )
      setWorks((current) => [
        ...current.map((w) => imported.get(w.state.characterId) ?? w),
        ...[...imported.values()].filter(
          (w) =>
            !current.some(
              (existing) => existing.state.characterId === w.state.characterId,
            ),
        ),
      ])
      if (!activeId) setActiveId(response.sessions[0]?.state.characterId ?? '')
      setResults((current) =>
        current.filter((result) => !imported.has(result.characterId)),
      )
      setNotice(
        `${response.sessions.length}명의 검수를 추가·갱신했습니다. 파일에 없는 공명자는 유지했습니다.`,
      )
    } catch (e) {
      setFailure((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const resetReviews = async () => {
    if (
      !window.confirm(
        '모든 검수 내용을 초기화하고 전체 공명자 목록을 복원합니다. 필요한 내용은 먼저 JSON으로 백업해 주세요. 초기화할까요?',
      )
    )
      return
    setBusy(true)
    setFailure('')
    setNotice('')
    try {
      const response = await request<{
        sessions: ReviewSession[]
        file: ReviewBackup
      }>('/api/review/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Review-Token': token,
        },
        body: '{}',
      })
      backupCache.current = Promise.resolve(response.file)
      storageMode.current = 'workspace'
      restoreBlocked.current = false
      setStorageError('')
      setReadyToSave(true)
      setWorks(
        response.sessions.map((session) => ({
          session,
          state: session.state,
          baseline: JSON.stringify(session.state),
        })),
      )
      setActiveId(
        (
          response.sessions.find((s) => s.state.attribute === '응결') ??
          response.sessions[0]
        )?.state.characterId ?? '',
      )
      setSelectedElement('응결')
      setResults([])
      setErrors([])
      setNotice(`${response.sessions.length}명의 전체 검수를 초기화했습니다.`)
    } catch (error) {
      setFailure(`초기화 실패: ${(error as Error).message}`)
    } finally {
      setBusy(false)
    }
  }
  const fieldChange = (
    card: (typeof cards)[number],
    field: 'category' | 'displayName' | 'decision' | 'hitCount',
    value: unknown,
  ) => {
    change(
      (s) => {
        if (card.group === 'candidates')
          return {
            ...s,
            candidates: s.candidates.map((c) =>
              c.candidateId === card.key
                ? {
                    ...c,
                    [field]: value,
                    ...(field === 'category' &&
                    !supportsHitCount(value as SkillCategory | undefined)
                      ? { hitCount: undefined }
                      : {}),
                  }
                : c,
            ),
          }
        return {
          ...s,
          existingSkills: s.existingSkills.map((c) =>
            c.skillId === card.key
              ? {
                  ...c,
                  [field]: value,
                  ...(field === 'category' &&
                  !supportsHitCount(value as SkillCategory | undefined)
                    ? { hitCount: undefined }
                    : {}),
                  ...(field === 'decision'
                    ? { visible: value === 'include' }
                    : {}),
                }
              : c,
          ),
        }
      },
      [
        reviewFieldKey(card.group, card.key, field),
        ...(field === 'hitCount'
          ? [reviewFieldKey(card.group, card.key, 'category')]
          : []),
      ],
    )
  }
  const humanError = (message: string) =>
    cards.reduce(
      (text, c, i) =>
        text.replaceAll(c.candidate?.candidateId ?? c.key, `후보 ${i + 1}`),
      message,
    )
  const blocked = busy || !!active?.session.conflict
  return (
    <div className="review-app">
      <header className="review-header">
        <div>
          <p className="eyebrow">WUWA ROTATION BUILDER / CHARACTER REVIEW</p>
          <h1>공명자 스킬 검수</h1>
          <p>
            아이콘을 검토하고 JSON으로 전달합니다. DB 반영은 에이전트의 재검증
            후 진행됩니다.
          </p>
        </div>
        <span className="local-badge">검수 작업 공간</span>
      </header>
      <div className="review-feedback" aria-live="polite">
        {notice && <p className="notice">{notice}</p>}
        {failure && (
          <p className="error" role="alert">
            {failure}
          </p>
        )}
      </div>
      <div className="review-layout">
        <aside className="review-sidebar">
          <nav className="review-panel target-panel" aria-label="공명자 목록">
            <p className="eyebrow">RESONATORS</p>
            <h2>공명자 목록</h2>
            <p className="muted">지정한 공명자 {works.length}명</p>
            <div
              className="attribute-tabs"
              role="group"
              aria-label="공명자 속성 필터"
            >
              {ELEMENTS.map((element) => (
                <button
                  key={element}
                  aria-pressed={selectedElement === element}
                  onClick={() => setSelectedElement(element)}
                >
                  {element}
                </button>
              ))}
            </div>
            <div
              className="target-list review-scroll"
              tabIndex={0}
              aria-label="공명자 목록 스크롤"
            >
              {works
                .filter((w) => w.state.attribute === selectedElement)
                .map((w) => {
                  const result = results.find(
                    (r) => r.characterId === w.state.characterId,
                  )
                  const hasSourceError =
                    !!w.session.conflict ||
                    w.session.source.draft.errors.length > 0
                  const status = result
                    ? result.errors.length
                      ? 'error'
                      : 'passed'
                    : hasSourceError
                      ? 'error'
                      : 'pending'
                  const label = {
                    pending: '미검증',
                    error: '오류',
                    passed: '통과',
                  }[status]
                  return (
                    <button
                      key={w.state.characterId}
                      disabled={busy}
                      title={`ID ${w.state.characterId}`}
                      aria-current={
                        w.state.characterId === activeId ? 'page' : undefined
                      }
                      onClick={() => setActiveId(w.state.characterId)}
                    >
                      <strong>{w.session.source.target.displayName}</strong>
                      <span className={`review-status review-status-${status}`}>
                        {label}
                      </span>
                    </button>
                  )
                })}
              {!works.some((w) => w.state.attribute === selectedElement) && (
                <p className="muted">해당 속성의 공명자가 없습니다.</p>
              )}
            </div>
            {errors.map((e, i) => (
              <p key={i} className="error">
                {e}
              </p>
            ))}
          </nav>
          {state && source && active && (
            <section className="review-panel decision-panel">
              <fieldset disabled={blocked}>
                <p className="eyebrow">MAPPING & SORTING</p>
                <h2>자동 매핑 및 정렬</h2>
                <p className="muted">
                  기본 공격 → 일반 교체 공격
                  <br />
                  변주 스킬 → 변주 · 반주 스킬 → 반주
                </p>
                <button
                  className="assignment-toggle"
                  aria-pressed={!!active.receipt}
                  disabled={
                    !active.receipt &&
                    !Object.keys(source.encoreMatches ?? {}).length
                  }
                  onClick={toggleEncore}
                >
                  {active.receipt
                    ? 'Encore 자동 배정 해제'
                    : 'Encore 자동 배정'}
                </button>
                <button
                  className="sort-cards"
                  onClick={() =>
                    change((s) => sortReviewCardsByCategory(s, source))
                  }
                >
                  분류순 정렬
                </button>
                {AUTO_KINDS.map((kind) => (
                  <label key={kind}>
                    {AUTO_LABELS[kind]}
                    <select
                      value={state.autoActions[kind] ?? ''}
                      onChange={(e) =>
                        change(
                          (s) => ({
                            ...s,
                            autoActions: {
                              ...s.autoActions,
                              [kind]: e.target.value || null,
                            },
                          }),
                          [`autoActions:${kind}`],
                        )
                      }
                    >
                      <option value="">지정하지 않음</option>
                      {selectableSkills(state).map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.name || '(스킬명을 입력해 주세요)'}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </fieldset>
              {source.encoreSkillSourceId && (
                <p className="muted">
                  회절 남성 방랑자 ({source.encoreSkillSourceId})의 공유 스킬
                  정보로 보완했습니다.
                </p>
              )}
              {source.encoreErrors?.map((e, i) => (
                <p className="error" key={i}>
                  {humanError(e)}
                </p>
              ))}
            </section>
          )}

          <section className="review-panel export-panel">
            <p className="eyebrow">VALIDATION & FILES</p>
            <h2>검증 및 파일 관리</h2>
            <p className="muted">
              검증을 통과한 공명자를 한 파일로 내보냅니다. 편집 내용은 이
              브라우저에 자동 저장됩니다.
            </p>
            <p className="storage-status" role="status">
              브라우저 저장: {storageStatus}
            </p>
            {storageError && <p className="error">{storageError}</p>}
            {storageStatus === '저장 실패' && (
              <button
                disabled={busy}
                onClick={() => setSaveAttempt((n) => n + 1)}
              >
                저장 재시도
              </button>
            )}
            <div className="review-actions">
              <button
                disabled={busy || !works.length}
                onClick={() => void submit('validate')}
              >
                검수 내용 검증
              </button>
              <button
                disabled={busy}
                onClick={() => importInput.current?.click()}
              >
                JSON으로 불러오기
              </button>
              <input
                ref={importInput}
                className="sr-only"
                type="file"
                accept=".json,application/json"
                aria-label="검수 JSON 파일"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (file) void importFile(file)
                }}
              />
              <button
                disabled={busy || !works.length}
                onClick={() => void submit('backup')}
              >
                JSON으로 백업하기
              </button>
              <button
                className="primary"
                disabled={busy || !works.length}
                onClick={() => void submit('export')}
              >
                JSON으로 내보내기
              </button>
            </div>
            {results.length > 0 && (
              <div
                className="validation-list review-scroll"
                tabIndex={0}
                role="region"
                aria-label="검증 결과"
              >
                {results.map((result) => (
                  <div className="validation-results" key={result.characterId}>
                    <h3>
                      {result.displayName} ·{' '}
                      {result.errors.length
                        ? `${result.errors.length}개 확인 필요`
                        : '검증 통과'}
                    </h3>
                    {result.errors.map((e, i) => (
                      <p className="error" key={i}>
                        {result.characterId === activeId ? humanError(e) : e}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            )}
            <button
              className="reset-reviews"
              disabled={busy}
              onClick={() => void resetReviews()}
            >
              전체 검수 초기화
            </button>
          </section>
        </aside>
        {state && source && active ? (
          <main className="review-main">
            <fieldset disabled={blocked}>
              <legend className="sr-only">공명자 검수</legend>
              <section className="review-panel basic-panel">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">RESONATOR</p>
                    <h2>공명자 정보</h2>
                  </div>
                  <span className="status-badge">
                    {source.target.displayName}
                  </span>
                </div>
                <div className="basic-grid">
                  <div className="portrait-preview">
                    {state.portraitCandidateId ? (
                      <img
                        alt="선택한 초상화"
                        src={imageUrl(source.target, {
                          candidateId: state.portraitCandidateId,
                        })}
                      />
                    ) : source.current ? (
                      <img
                        alt="현재 초상화"
                        src={imageUrl(source.target, {
                          asset: source.current.portrait,
                        })}
                      />
                    ) : (
                      <span>초상화 선택</span>
                    )}
                  </div>
                  <div className="basic-fields">
                    <label>
                      공명자 이름
                      <input
                        value={state.displayName}
                        onChange={(e) =>
                          change((s) => ({ ...s, displayName: e.target.value }))
                        }
                      />
                    </label>
                    <label>
                      속성
                      <select
                        value={state.attribute}
                        onChange={(e) =>
                          change((s) => ({
                            ...s,
                            attribute: e.target
                              .value as ReviewState['attribute'],
                          }))
                        }
                      >
                        {ELEMENTS.map((element) => (
                          <option key={element}>{element}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      무기군
                      <select
                        value={state.weaponType ?? ''}
                        onChange={(e) =>
                          change((s) => ({
                            ...s,
                            weaponType: (e.target.value ||
                              null) as ReviewState['weaponType'],
                          }))
                        }
                      >
                        <option value="">미지정</option>
                        {WEAPON_TYPES.map((weapon) => (
                          <option key={weapon}>{weapon}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      초상화
                      <select
                        value={state.portraitCandidateId ?? ''}
                        onChange={(e) =>
                          change((s) => ({
                            ...s,
                            portraitCandidateId: e.target.value || null,
                          }))
                        }
                      >
                        <option value="">
                          {source.current
                            ? '현재 초상화 유지'
                            : '초상화를 선택하세요'}
                        </option>
                        {source.draft.candidates
                          .filter((c) => c.kind === 'portrait')
                          .map((c, i) => (
                            <option
                              key={c.candidateId}
                              value={c.candidateId}
                              disabled={c.download.status !== 'verified'}
                            >
                              초상화 후보 {i + 1}
                            </option>
                          ))}
                      </select>
                    </label>
                  </div>
                </div>
              </section>
              <section className="review-panel skill-panel">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">SKILL REVIEW</p>
                    <h2>스킬 아이콘 검수</h2>
                  </div>
                  <span className="status-badge">{cards.length}개 아이콘</span>
                </div>
                <p className="muted">
                  이동 손잡이를 드래그해 순서를 바꿉니다. 등록·미등록을 모두
                  해제하면 미검수 상태입니다.
                </p>
                <div className="review-cards">
                  {cards.map((card, position) => {
                    const candidate = card.candidate
                    const item =
                      card.group === 'candidates'
                        ? state.candidates[card.index]
                        : state.existingSkills[card.index]
                    const decision =
                      item.decision ??
                      ('visible' in item
                        ? item.visible
                          ? 'include'
                          : 'exclude'
                        : 'pending')
                    const old =
                      card.group === 'existingSkills'
                        ? source.current?.skills.find(
                            (s) => s.skillId === card.key,
                          )
                        : null
                    return (
                      <article
                        className={`review-card ${decision === 'exclude' ? 'excluded' : ''}`}
                        key={card.key}
                        data-review-key={card.key}
                        data-drop-target={dropTarget === card.key}
                      >
                        <div className="card-move">
                          <button
                            aria-label={`후보 ${position + 1} 이동 손잡이`}
                            onKeyDown={(e) => {
                              if (
                                e.key !== 'ArrowLeft' &&
                                e.key !== 'ArrowRight'
                              )
                                return
                              e.preventDefault()
                              const order = cards.map((c) => c.key)
                              const to =
                                position + (e.key === 'ArrowLeft' ? -1 : 1)
                              if (to < 0 || to >= order.length) return
                              order.splice(to, 0, ...order.splice(position, 1))
                              change((s) => ({ ...s, cardOrder: order }))
                            }}
                            onPointerDown={(e) => {
                              if (e.button !== 0 || blocked) return
                              e.preventDefault()
                              dragging.current = {
                                key: card.key,
                                x: e.clientX,
                                y: e.clientY,
                              }
                              e.currentTarget.setPointerCapture(e.pointerId)
                            }}
                            onPointerMove={(e) => {
                              if (!dragging.current) return
                              setDropTarget(
                                document
                                  .elementFromPoint(e.clientX, e.clientY)
                                  ?.closest<HTMLElement>('[data-review-key]')
                                  ?.dataset.reviewKey ?? null,
                              )
                            }}
                            onPointerUp={(e) => {
                              const from = dragging.current
                              dragging.current = null
                              setDropTarget(null)
                              if (
                                e.currentTarget.hasPointerCapture(e.pointerId)
                              )
                                e.currentTarget.releasePointerCapture(
                                  e.pointerId,
                                )
                              if (
                                !from ||
                                blocked ||
                                Math.hypot(
                                  e.clientX - from.x,
                                  e.clientY - from.y,
                                ) < 4
                              )
                                return
                              const key = document
                                .elementFromPoint(e.clientX, e.clientY)
                                ?.closest<HTMLElement>('[data-review-key]')
                                ?.dataset.reviewKey
                              const order = cards.map((c) => c.key)
                              const to = order.indexOf(key ?? '')
                              const start = order.indexOf(from.key)
                              if (to < 0 || start < 0) return
                              order.splice(to, 0, ...order.splice(start, 1))
                              change((s) => ({ ...s, cardOrder: order }))
                            }}
                            onPointerCancel={() => {
                              dragging.current = null
                              setDropTarget(null)
                            }}
                            onLostPointerCapture={() => {
                              dragging.current = null
                              setDropTarget(null)
                            }}
                          >
                            ⠿ 이동
                          </button>
                          {decision === 'exclude' && (
                            <span className="excluded-badge">미등록</span>
                          )}
                          {decision !== 'exclude' && item.category && (
                            <span className="category-badge">
                              {item.category}
                              {supportsHitCount(item.category) &&
                                !!item.hitCount &&
                                ` · ${item.hitCount}타`}
                            </span>
                          )}
                        </div>
                        <div className="card-top">
                          <div className="icon-preview">
                            {candidate?.download.status === 'verified' ? (
                              <img
                                alt={`후보 ${position + 1} 아이콘`}
                                src={imageUrl(source.target, {
                                  candidateId: candidate.candidateId,
                                })}
                              />
                            ) : old ? (
                              <img
                                alt={`후보 ${position + 1} 아이콘`}
                                src={imageUrl(source.target, {
                                  asset: old.asset,
                                })}
                              />
                            ) : (
                              <span>이미지 실패</span>
                            )}
                          </div>
                          <div>
                            <h3>후보 {position + 1}</h3>
                            <span className="muted">
                              {candidate
                                ? [
                                    ...new Set(
                                      candidate.sources.map(
                                        (s) => SOURCE_LABELS[s.source],
                                      ),
                                    ),
                                  ].join(' + ')
                                : '현재 DB'}
                            </span>
                          </div>
                        </div>
                        <div
                          className="decision-options"
                          role="group"
                          aria-label={`후보 ${position + 1} 처리 여부`}
                        >
                          {(['include', 'exclude'] as const).map((value) => (
                            <label key={value}>
                              <input
                                type="checkbox"
                                aria-label={`후보 ${position + 1} ${value === 'include' ? '등록' : '미등록'}`}
                                checked={decision === value}
                                disabled={
                                  value === 'include' &&
                                  !old &&
                                  candidate?.download.status !== 'verified'
                                }
                                onChange={(e) =>
                                  fieldChange(
                                    card,
                                    'decision',
                                    e.target.checked ? value : 'pending',
                                  )
                                }
                              />
                              {value === 'include' ? '등록' : '미등록'}
                            </label>
                          ))}
                        </div>
                        <label>
                          분류
                          <select
                            aria-label={`후보 ${position + 1} 분류`}
                            value={item.category ?? ''}
                            onChange={(e) =>
                              fieldChange(
                                card,
                                'category',
                                (e.target.value || undefined) as
                                  SkillCategory | undefined,
                              )
                            }
                          >
                            <option value="">미분류</option>
                            {SKILL_CATEGORIES.map((c) => (
                              <option key={c}>{c}</option>
                            ))}
                          </select>
                        </label>
                        {supportsHitCount(item.category) && (
                          <label>
                            타수
                            <select
                              aria-label={`후보 ${position + 1} 타수`}
                              value={item.hitCount ?? 0}
                              onChange={(e) =>
                                fieldChange(
                                  card,
                                  'hitCount',
                                  Number(e.target.value),
                                )
                              }
                            >
                              {Array.from({ length: 11 }, (_, i) => (
                                <option key={i} value={i}>
                                  {i === 0 ? '0타 (미지정)' : `${i}타`}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        <label>
                          스킬명
                          <input
                            aria-label={`후보 ${position + 1} 스킬명`}
                            value={item.displayName}
                            placeholder="스킬의 실제 이름"
                            onChange={(e) =>
                              fieldChange(card, 'displayName', e.target.value)
                            }
                          />
                        </label>
                        <details>
                          <summary>출처와 후보 이름</summary>
                          {candidate?.sources.map((s, i) => (
                            <div className="source-evidence" key={i}>
                              <strong>{SOURCE_LABELS[s.source]}</strong>
                              <p>후보 이름: {s.candidateName || '(없음)'}</p>
                              <p>{s.field}</p>
                              <code>{s.originalPath}</code>
                            </div>
                          ))}
                          {old && (
                            <p className="muted">공개 ID: {old.skillId}</p>
                          )}
                        </details>
                        {candidate?.download.status === 'failed' && (
                          <p className="error">{candidate.download.error}</p>
                        )}
                      </article>
                    )
                  })}
                </div>
              </section>
            </fieldset>
            {active.session.conflict && (
              <p className="error" role="alert">
                {active.session.conflict}
              </p>
            )}
            {source.draft.errors.map((e, i) => (
              <p className="error" key={i}>
                {humanError(e)}
              </p>
            ))}
            <section
              className="review-panel tooltip-panel"
              aria-labelledby="skill-tooltip-heading"
              key={state.characterId}
            >
              <p className="eyebrow">SKILL TOOLTIPS</p>
              <h2 id="skill-tooltip-heading">스킬 툴팁</h2>
              <p className="muted">
                {source.target.displayName} · Encore 스킬 설명
              </p>
              {TOOLTIP_CATEGORIES.map((category) => {
                const tooltips =
                  source.encoreTooltips?.filter(
                    (entry) => entry.category === category,
                  ) ?? []
                return (
                  <details key={category}>
                    <summary>{category}</summary>
                    {tooltips.length ? (
                      tooltips.map((tooltip, index) => (
                        <div key={`${tooltip.skillId}-${index}`}>
                          <h3>{tooltip.displayName}</h3>
                          <p className="skill-tooltip-text">
                            {tooltip.description}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="muted">Encore 원본 설명이 없습니다.</p>
                    )}
                  </details>
                )
              })}
            </section>
          </main>
        ) : (
          <main className="review-panel review-welcome">
            <h2>
              {busy ? '검수 자료를 불러오는 중입니다' : '검수 대상이 없습니다'}
            </h2>
            <p>검수할 공명자를 지정해 주세요.</p>
          </main>
        )}
      </div>
    </div>
  )
}
