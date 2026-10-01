import { useEffect, useRef, useState, type ReactNode } from 'react'
import { ELEMENTS } from '../../src/app/catalog'
import {
  SKILL_CATEGORIES,
  type SkillCategory,
} from '../../src/data/characters/categories'
import { assignEncore, linkCategorizedActions, moveReviewCard } from './editing'
import {
  AUTO_KINDS,
  AUTO_LABELS,
  selectableSkills,
  type ReviewSession,
  type ReviewState,
  type ReviewTarget,
  type ReviewValidation,
} from './model'

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
const runDate = (runId: string) => {
  const date = new Date(
    `${runId.slice(0, 10)}T${runId.slice(11, 19).replaceAll('-', ':')}Z`,
  )
  return Number.isNaN(date.getTime())
    ? runId
    : new Intl.DateTimeFormat('ko-KR', {
        timeZone: 'Asia/Seoul',
        dateStyle: 'short',
        timeStyle: 'short',
      }).format(date)
}
function imageUrl(
  target: ReviewTarget,
  image: { candidateId: string } | { asset: string },
) {
  return `/api/review/image?${query(target)}&${new URLSearchParams(image).toString()}`
}
function Modal({
  title,
  children,
  close,
}: {
  title: string
  children: ReactNode
  close: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus()
    return () => previous?.focus()
  }, [])
  return (
    <div className="review-overlay">
      <div
        ref={ref}
        className="review-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            close()
          }
          if (event.key === 'Tab') {
            const buttons = [
              ...(ref.current?.querySelectorAll<HTMLButtonElement>(
                'button:not(:disabled)',
              ) ?? []),
            ]
            const index = buttons.indexOf(
              document.activeElement as HTMLButtonElement,
            )
            if (buttons.length) {
              event.preventDefault()
              buttons[
                (index + (event.shiftKey ? -1 : 1) + buttons.length) %
                  buttons.length
              ].focus()
            }
          }
        }}
      >
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  )
}
export function ReviewApp() {
  const dragging = useRef<{
    group: 'existingSkills' | 'candidates'
    index: number
    x: number
    y: number
  } | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [targets, setTargets] = useState<ReviewTarget[]>([])
  const [listErrors, setListErrors] = useState<string[]>([])
  const [session, setSession] = useState<ReviewSession | null>(null)
  const [state, setState] = useState<ReviewState | null>(null)
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(true)
  const [notice, setNotice] = useState('')
  const [failure, setFailure] = useState('')
  const [validation, setValidation] = useState<ReviewValidation | null>(null)
  const [pendingTarget, setPendingTarget] = useState<ReviewTarget | null>(null)
  const [confirmPublish, setConfirmPublish] = useState(false)
  const dirty = !!(
    session &&
    state &&
    JSON.stringify(session.state) !== JSON.stringify(state)
  )
  const blocked = busy || !!pendingTarget || confirmPublish
  useEffect(() => {
    let mounted = true
    void Promise.all([
      request<{ token: string }>('/api/review/session'),
      request<{ targets: ReviewTarget[]; errors: string[] }>(
        '/api/review/targets',
      ),
    ])
      .then(([auth, listing]) => {
        if (!mounted) return
        setToken(auth.token)
        setTargets(listing.targets)
        setListErrors(listing.errors)
      })
      .catch((error: Error) => {
        if (mounted) setFailure(error.message)
      })
      .finally(() => {
        if (mounted) setBusy(false)
      })
    return () => {
      mounted = false
    }
  }, [])
  useEffect(() => {
    if (!dirty) return
    const listener = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', listener)
    return () => window.removeEventListener('beforeunload', listener)
  }, [dirty])
  const change = (edit: (current: ReviewState) => ReviewState) => {
    setState((current) =>
      current ? linkCategorizedActions(edit(current)) : current,
    )
    setValidation(null)
    setNotice('')
    setFailure('')
  }
  const post = <T,>(action: string, extra = {}) =>
    request<T>(`/api/review/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Review-Token': token },
      body: JSON.stringify({
        state,
        revision: session?.revision ?? null,
        ...extra,
      }),
    })
  const open = async (target: ReviewTarget) => {
    setBusy(true)
    setFailure('')
    try {
      const loaded = await request<ReviewSession>(
        `/api/review/load?${query(target)}`,
      )
      setSession(loaded)
      setState(loaded.state)
      setValidation(null)
      setNotice('')
      setPendingTarget(null)
    } catch (error) {
      setFailure((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const choose = (target: ReviewTarget) => {
    if (dirty) setPendingTarget(target)
    else void open(target)
  }
  const save = async (): Promise<boolean> => {
    setBusy(true)
    setFailure('')
    try {
      const saved = await post<ReviewSession>('save')
      setSession(saved)
      setState(saved.state)
      setNotice('검수 내용을 저장했습니다.')
      return true
    } catch (error) {
      setFailure((error as Error).message)
      return false
    } finally {
      setBusy(false)
    }
  }
  const validate = async () => {
    setBusy(true)
    setFailure('')
    setNotice('')
    try {
      const checked = await post<ReviewValidation>('validate')
      setValidation(checked)
      if (!checked.errors.length)
        setNotice(
          '검증을 통과했습니다. 변경 요약을 확인한 뒤 최종 반영할 수 있습니다.',
        )
    } catch (error) {
      setFailure((error as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const publish = async () => {
    setBusy(true)
    setFailure('')
    try {
      const result = await post<{
        session: ReviewSession
        warning: string | null
      }>('publish', { token: validation?.token })
      setSession(result.session)
      setState(result.session.state)
      setValidation(null)
      setNotice(
        result.warning ??
          '최종 반영을 완료했습니다. 빌더에서 공명자 데이터를 사용할 수 있습니다.',
      )
      setConfirmPublish(false)
    } catch (error) {
      setFailure((error as Error).message)
      setConfirmPublish(false)
      setValidation(null)
    } finally {
      setBusy(false)
    }
  }
  const cardMove = (
    group: 'existingSkills' | 'candidates',
    index: number,
    label: string,
  ) => (
    <div className="card-move">
      <button
        type="button"
        aria-label={`${label} 이동 손잡이`}
        onPointerDown={(e) => {
          if (e.button !== 0 || blocked || session?.conflict) return
          e.preventDefault()
          dragging.current = { group, index, x: e.clientX, y: e.clientY }
          e.currentTarget.setPointerCapture(e.pointerId)
        }}
        onPointerMove={(e) => {
          if (!dragging.current) return
          const target = document
            .elementFromPoint(e.clientX, e.clientY)
            ?.closest<HTMLElement>('[data-review-group]')
          setDropTarget(
            target?.dataset.reviewGroup === group
              ? `${group}:${target.dataset.reviewIndex}`
              : null,
          )
        }}
        onPointerUp={(e) => {
          const from = dragging.current
          dragging.current = null
          setDropTarget(null)
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId)
          if (
            !from ||
            blocked ||
            session?.conflict ||
            Math.hypot(e.clientX - from.x, e.clientY - from.y) < 4
          )
            return
          const target = document
            .elementFromPoint(e.clientX, e.clientY)
            ?.closest<HTMLElement>('[data-review-group]')
          if (target?.dataset.reviewGroup === group)
            change((s) =>
              moveReviewCard(
                s,
                group,
                from.index,
                Number(target.dataset.reviewIndex),
              ),
            )
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
      <button
        type="button"
        aria-label={`${label} 앞으로`}
        disabled={index === 0}
        onClick={() =>
          change((s) => moveReviewCard(s, group, index, index - 1))
        }
      >
        ←
      </button>
      <button
        type="button"
        aria-label={`${label} 뒤로`}
        disabled={index === (state?.[group].length ?? 0) - 1}
        onClick={() =>
          change((s) => moveReviewCard(s, group, index, index + 1))
        }
      >
        →
      </button>
    </div>
  )
  const dropProps = (
    group: 'existingSkills' | 'candidates',
    index: number,
  ) => ({
    'data-review-group': group,
    'data-review-index': index,
    'data-drop-target': dropTarget === `${group}:${index}`,
  })
  const categoryField = (
    group: 'existingSkills' | 'candidates',
    index: number,
    category: SkillCategory | undefined,
    label: string,
  ) => (
    <label>
      {label} 분류
      <select
        value={category ?? ''}
        onChange={(e) =>
          change((s) => ({
            ...s,
            [group]: s[group].map((item, i) =>
              i === index
                ? {
                    ...item,
                    category: (e.target.value || undefined) as
                      SkillCategory | undefined,
                  }
                : item,
            ),
          }))
        }
      >
        <option value="">미분류</option>
        {SKILL_CATEGORIES.map((c) => (
          <option key={c}>{c}</option>
        ))}
      </select>
    </label>
  )
  const active = session?.source.target
  const candidates = session?.source.draft.candidates ?? []
  const skillCandidates = candidates.filter((c) => c.kind === 'skill')
  const linked = new Set(state?.existingSkills.map((s) => s.candidateId))
  const remaining =
    state?.candidates.filter(
      (c) => c.decision === 'pending' && !linked.has(c.candidateId),
    ).length ?? 0
  const options = state ? selectableSkills(state) : []
  const conflict = session?.conflict
  const humanError = (error: string) =>
    (state?.candidates ?? []).reduce(
      (message, c, i) => message.replaceAll(c.candidateId, `후보 ${i + 1}`),
      error,
    )
  return (
    <div className="review-app">
      <header className="review-header">
        <div>
          <p className="eyebrow">WUWA ROTATION BUILDER / CHARACTER REVIEW</p>
          <h1>공명자 데이터 검수</h1>
          <p>실제 아이콘을 확인하고 스킬의 이름과 역할을 직접 정합니다.</p>
        </div>
        <span className="local-badge">개발용 · 로컬</span>
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
        <nav
          className="review-panel target-panel"
          aria-label="수집 실행과 공명자"
        >
          <p className="eyebrow">COLLECTIONS</p>
          <h2>수집 실행</h2>
          <p className="muted">{targets.length}개 검수 대상</p>
          {!targets.length && !busy && (
            <p>
              수집된 후보가 없습니다. 후보 수집 명령을 실행한 뒤 새로고침해
              주세요.
            </p>
          )}
          {[...new Set(targets.map((t) => t.runId))].map((runId) => (
            <section key={runId} className="target-run">
              <h3 title={runId}>{runDate(runId)}</h3>
              {targets
                .filter((t) => t.runId === runId)
                .map((target) => (
                  <button
                    key={target.characterId}
                    disabled={blocked}
                    aria-current={
                      active?.runId === runId &&
                      active.characterId === target.characterId
                        ? 'page'
                        : undefined
                    }
                    onClick={() => choose(target)}
                  >
                    <strong>{target.displayName}</strong>
                    <span>ID {target.characterId}</span>
                  </button>
                ))}
            </section>
          ))}
          {listErrors.map((error) => (
            <p className="error" key={error}>
              {error}
            </p>
          ))}
        </nav>
        {state && session && active ? (
          <>
            <main className="review-main">
              <fieldset disabled={blocked || !!conflict}>
                <legend className="sr-only">공명자 검수</legend>
                <section className="review-panel basic-panel">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">RESONATOR</p>
                      <h2>{active.displayName}</h2>
                    </div>
                    <span className="status-badge">
                      {dirty
                        ? '미저장'
                        : session.revision
                          ? '저장됨'
                          : '검수 시작'}
                    </span>
                  </div>
                  <div className="basic-grid">
                    <div className="portrait-preview">
                      {state.portraitCandidateId ? (
                        <img
                          alt="선택한 초상화"
                          src={imageUrl(active, {
                            candidateId: state.portraitCandidateId,
                          })}
                        />
                      ) : session.source.current ? (
                        <img
                          alt="현재 초상화"
                          src={imageUrl(active, {
                            asset: session.source.current.portrait,
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
                            change((s) => ({
                              ...s,
                              displayName: e.target.value,
                            }))
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
                            {session.source.current
                              ? '현재 초상화 유지'
                              : '초상화를 선택하세요'}
                          </option>
                          {candidates
                            .filter((c) => c.kind === 'portrait')
                            .map((c, i) => (
                              <option
                                key={c.candidateId}
                                value={c.candidateId}
                                disabled={c.download.status !== 'verified'}
                              >
                                초상화 후보 {i + 1}
                                {c.download.status === 'failed'
                                  ? ' · 다운로드 실패'
                                  : ''}
                              </option>
                            ))}
                        </select>
                      </label>
                    </div>
                  </div>
                </section>
                {state.existingSkills.length > 0 && (
                  <section className="review-panel">
                    <p className="eyebrow">REVIEWED SKILLS</p>
                    <h2>기존 검수 스킬</h2>
                    <p className="muted">
                      공개 ID를 유지합니다. 새 그림은 후보를 직접 연결해
                      교체합니다.
                    </p>
                    <div className="review-cards">
                      {state.existingSkills.map((skill, index) => {
                        const old = session.source.current?.skills.find(
                          (s) => s.skillId === skill.skillId,
                        )
                        return (
                          <article
                            key={skill.skillId}
                            className="review-card"
                            {...dropProps('existingSkills', index)}
                          >
                            {cardMove(
                              'existingSkills',
                              index,
                              `기존 스킬 ${index + 1}`,
                            )}
                            {categoryField(
                              'existingSkills',
                              index,
                              skill.category,
                              `기존 스킬 ${index + 1}`,
                            )}
                            <div className="card-top">
                              <div className="icon-preview">
                                {old && (
                                  <img
                                    alt={`기존 스킬 ${index + 1} 아이콘`}
                                    src={imageUrl(
                                      active,
                                      skill.candidateId
                                        ? { candidateId: skill.candidateId }
                                        : { asset: old.asset },
                                    )}
                                  />
                                )}
                              </div>
                              <div>
                                <span className="status-badge">기존 검수</span>
                                <p className="muted">
                                  기존 이름: {old?.displayName || '(없음)'}
                                </p>
                              </div>
                            </div>
                            <label>
                              기존 스킬 {index + 1} 이름
                              <input
                                value={skill.displayName}
                                onChange={(e) =>
                                  change((s) => ({
                                    ...s,
                                    existingSkills: s.existingSkills.map(
                                      (item) =>
                                        item.skillId === skill.skillId
                                          ? {
                                              ...item,
                                              displayName: e.target.value,
                                            }
                                          : item,
                                    ),
                                  }))
                                }
                              />
                            </label>
                            <label className="check">
                              <input
                                type="checkbox"
                                checked={skill.visible}
                                onChange={(e) =>
                                  change((s) => ({
                                    ...s,
                                    existingSkills: s.existingSkills.map(
                                      (item) =>
                                        item.skillId === skill.skillId
                                          ? {
                                              ...item,
                                              visible: e.target.checked,
                                            }
                                          : item,
                                    ),
                                  }))
                                }
                              />
                              스킬 진열에 노출
                            </label>
                            <label>
                              아이콘 연결
                              <select
                                value={skill.candidateId ?? ''}
                                onChange={(e) =>
                                  change((s) => ({
                                    ...s,
                                    existingSkills: s.existingSkills.map(
                                      (item) =>
                                        item.skillId === skill.skillId
                                          ? {
                                              ...item,
                                              candidateId:
                                                e.target.value || null,
                                            }
                                          : item,
                                    ),
                                  }))
                                }
                              >
                                <option value="">현재 아이콘 유지</option>
                                {skillCandidates.map((candidate, i) => (
                                  <option
                                    key={candidate.candidateId}
                                    value={candidate.candidateId}
                                    disabled={
                                      candidate.download.status !== 'verified'
                                    }
                                  >
                                    후보 {i + 1} ·{' '}
                                    {candidate.sources.find(
                                      (source) => source.candidateName,
                                    )?.candidateName ?? '원본 이름 없음'}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <details>
                              <summary>공개 ID</summary>
                              <code>{skill.skillId}</code>
                            </details>
                          </article>
                        )
                      })}
                    </div>
                  </section>
                )}
                <section className="review-panel">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">COLLECTED ICONS</p>
                      <h2>수집 후보</h2>
                    </div>
                    <span className="status-badge">미검수 {remaining}</span>
                  </div>
                  <p className="muted">
                    분류와 실제 스킬명을 따로 저장합니다. 카드의 이동 손잡이
                    또는 화살표로 순서를 바꿀 수 있습니다.
                  </p>
                  <div className="review-cards">
                    {state.candidates.map((review, index) => {
                      const candidate = skillCandidates.find(
                        (c) => c.candidateId === review.candidateId,
                      )
                      if (!candidate) return null
                      const matched = state.existingSkills.filter(
                        (s) => s.candidateId === review.candidateId,
                      )
                      return (
                        <article
                          className={`review-card ${review.decision === 'exclude' ? 'excluded' : ''}`}
                          key={review.candidateId}
                          {...dropProps('candidates', index)}
                        >
                          {cardMove('candidates', index, `후보 ${index + 1}`)}
                          {categoryField(
                            'candidates',
                            index,
                            review.category,
                            `후보 ${index + 1}`,
                          )}
                          <div className="card-top">
                            <div className="icon-preview">
                              {candidate.download.status === 'verified' ? (
                                <img
                                  alt={`후보 ${index + 1} 아이콘`}
                                  src={imageUrl(active, {
                                    candidateId: candidate.candidateId,
                                  })}
                                />
                              ) : (
                                <span>이미지 실패</span>
                              )}
                            </div>
                            <div>
                              <h3>후보 {index + 1}</h3>
                              <span className="muted">
                                {[
                                  ...new Set(
                                    candidate.sources.map((s) =>
                                      s.source === 'encore'
                                        ? 'Encore'
                                        : 'WW_Data',
                                    ),
                                  ),
                                ].join(' + ')}
                              </span>
                            </div>
                          </div>
                          {matched.length > 0 && (
                            <p className="linked-note">
                              기존 스킬에 연결:{' '}
                              {matched.map((s) => s.displayName).join(', ')}
                            </p>
                          )}
                          <label>
                            후보 {index + 1} 처리
                            <select
                              value={review.decision}
                              onChange={(e) =>
                                change((s) => ({
                                  ...s,
                                  candidates: s.candidates.map((c) =>
                                    c.candidateId === review.candidateId
                                      ? {
                                          ...c,
                                          decision: e.target
                                            .value as typeof c.decision,
                                        }
                                      : c,
                                  ),
                                }))
                              }
                            >
                              <option value="pending">
                                {matched.length ? '기존 스킬에 사용' : '미검수'}
                              </option>
                              <option
                                value="include"
                                disabled={
                                  candidate.download.status !== 'verified'
                                }
                              >
                                새 스킬로 노출
                              </option>
                              <option value="exclude">
                                신규 등록에서 제외
                              </option>
                            </select>
                          </label>
                          <label>
                            후보 {index + 1} 표시 이름
                            <input
                              value={review.displayName}
                              placeholder="사람이 검수한 이름"
                              onChange={(e) =>
                                change((s) => ({
                                  ...s,
                                  candidates: s.candidates.map((c) =>
                                    c.candidateId === review.candidateId
                                      ? { ...c, displayName: e.target.value }
                                      : c,
                                  ),
                                }))
                              }
                            />
                          </label>
                          {candidate.download.status === 'failed' && (
                            <p className="error">{candidate.download.error}</p>
                          )}
                          <details>
                            <summary>
                              출처와 후보 이름 ({candidate.sources.length})
                            </summary>
                            {candidate.sources.map((source, i) => (
                              <div className="source-evidence" key={i}>
                                <strong>
                                  {source.source} · {source.recordId}
                                </strong>
                                <p>
                                  후보 이름: {source.candidateName || '(없음)'}
                                </p>
                                <p>{source.field}</p>
                                <code>{source.originalPath}</code>
                              </div>
                            ))}
                          </details>
                        </article>
                      )
                    })}
                  </div>
                </section>
              </fieldset>
            </main>
            <aside className="review-panel decision-panel">
              <fieldset disabled={blocked || !!conflict}>
                <legend className="sr-only">자동 행동과 검수 조작</legend>
                <p className="eyebrow">AUTO ACTIONS</p>
                <h2>자동 행동 지정</h2>
                <p className="muted">
                  기본 공격 → 일반 교체 공격 · 변주 스킬 → 변주 · 반주 스킬 →
                  반주. 분류가 없거나 중복이면 지정되지 않습니다.
                </p>
                <button
                  type="button"
                  disabled={
                    !Object.keys(session.source.encoreMatches ?? {}).length
                  }
                  onClick={() => change((s) => assignEncore(s, session.source))}
                >
                  Encore 자동 배정
                </button>
                {AUTO_KINDS.map((kind) => (
                  <label key={kind}>
                    {AUTO_LABELS[kind]}
                    <select
                      disabled={[
                        ...state.existingSkills,
                        ...state.candidates,
                      ].some((s) => !!s.category)}
                      value={state.autoActions[kind] ?? ''}
                      onChange={(e) =>
                        change((s) => ({
                          ...s,
                          autoActions: {
                            ...s.autoActions,
                            [kind]: e.target.value || null,
                          },
                        }))
                      }
                    >
                      <option value="">지정하지 않음</option>
                      {options.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name || '(이름을 입력해 주세요)'}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
                <div className="review-actions">
                  <button onClick={() => void save()}>검수 저장</button>
                  <button onClick={() => void validate()}>검증</button>
                  <button
                    className="primary"
                    disabled={!validation?.token}
                    onClick={() => setConfirmPublish(true)}
                  >
                    최종 반영
                  </button>
                </div>
              </fieldset>
              <p className="muted">
                미완성 검수도 저장할 수 있습니다. 최종 반영은 앱용 데이터 파일을
                갱신합니다.
              </p>
              {session.source.encoreErrors?.map((error, i) => (
                <p className="error" key={`encore-${i}`}>
                  {humanError(error)}
                </p>
              ))}
              {conflict && (
                <p role="alert" className="error">
                  {conflict}
                </p>
              )}
              {validation && (
                <section className="validation-results" aria-live="polite">
                  <h3>
                    {validation.errors.length
                      ? `검증 오류 ${validation.errors.length}`
                      : '검증 통과'}
                  </h3>
                  {validation.errors.map((error, i) => (
                    <p key={i} className="error">
                      {humanError(error)}
                    </p>
                  ))}
                  {!validation.errors.length && (
                    <ul>
                      {validation.summary.map((item, i) => (
                        <li key={i}>{item}</li>
                      ))}
                      {!validation.summary.length && <li>변경 사항 없음</li>}
                    </ul>
                  )}
                </section>
              )}
              {session.source.draft.errors.length > 0 && (
                <details className="collection-errors" open>
                  <summary>
                    수집 중 발생한 오류 {session.source.draft.errors.length}건
                  </summary>
                  {session.source.draft.errors.map((error, i) => (
                    <p key={i} className="error">
                      {humanError(error)}
                    </p>
                  ))}
                </details>
              )}
            </aside>
          </>
        ) : (
          <main className="review-panel review-welcome">
            <p className="eyebrow">START REVIEW</p>
            <h2>
              {busy
                ? '검수 자료를 불러오는 중입니다'
                : '검수할 공명자를 선택하세요'}
            </h2>
            <p>
              왼쪽 수집 실행에서 공명자를 선택하면 실제 아이콘과 기존 검수
              내용이 표시됩니다.
            </p>
          </main>
        )}
      </div>
      {pendingTarget && (
        <Modal
          title="저장하지 않은 검수가 있습니다"
          close={() => {
            if (!busy) setPendingTarget(null)
          }}
        >
          <p>
            현재 내용을 저장한 뒤 {pendingTarget.displayName} 검수로 이동할까요?
          </p>
          {failure && (
            <p className="error" role="alert">
              {failure}
            </p>
          )}
          <div className="modal-actions">
            <button disabled={busy} onClick={() => setPendingTarget(null)}>
              취소
            </button>
            <button disabled={busy} onClick={() => void open(pendingTarget)}>
              버리고 이동
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => {
                const target = pendingTarget
                void save().then((saved) => {
                  if (saved) void open(target)
                })
              }}
            >
              저장하고 이동
            </button>
          </div>
        </Modal>
      )}
      {confirmPublish && validation && (
        <Modal
          title="최종 데이터에 반영할까요?"
          close={() => {
            if (!busy) setConfirmPublish(false)
          }}
        >
          <p>{state?.displayName}의 아래 변경을 앱에 반영합니다.</p>
          <ul>
            {validation.summary.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
            {!validation.summary.length && <li>변경 사항 없음</li>}
          </ul>
          <div className="modal-actions">
            <button disabled={busy} onClick={() => setConfirmPublish(false)}>
              취소
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void publish()}
            >
              확인하고 반영
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
