import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type DragEvent,
} from 'react'
import {
  createEditorHistory,
  recordRotationEdit,
  undoCycle,
  redoCycle,
} from '../domain/cycle-history'
import {
  addSkill,
  changeSkillStage,
  createRotation,
  deleteSwitchForAutoAction,
  deleteInput,
  deleteSkill,
  hasCharacterCycleContent,
  reorderInput,
  reorderParty,
  reorderSkill,
  replacePartyCharacter,
  setActiveCharacter,
  type CycleId,
  type InputBlock,
  type Rotation,
} from '../domain/rotation'
import {
  ELEMENTS,
  characterName,
  charactersByElement,
  emptyCatalog,
  skillName,
  type CharacterCatalog,
  type Element,
} from './catalog'
import {
  createContinuityDemoRotation,
  createDemoRotation,
  createInputDemoRotation,
  demoCatalog,
} from './demo'
import { projectCycle } from './editor-projection'
import {
  canDropInput,
  deletionTargetAt,
  stageChangeFromWheel,
} from './editor-interaction'
import { TimelineWires } from './TimelineWires'
import { attachCaptureEvents } from './input-events'
import { applyCapturedInput } from './input-command'
import { attachDragScroll } from './drag-scroll'
import { showDragPreview } from './drag-preview'
import { SkillTooltip } from './SkillTooltip'
import { usePartySelectorScroll } from './use-party-selector-scroll'
import type { ProjectReferences } from '../domain/project'

type DragItem =
  | { kind: 'party'; id: string }
  | { kind: 'input'; cycleId: CycleId; columnId: string }
  | { kind: 'catalogSkill'; ref: string }
  | { kind: 'linkedSkill'; cycleId: CycleId; actionId: string; skillId: string }
type PendingReplacement = {
  slotIndex: 0 | 1 | 2
  formerId: string
  replacementId: string
}

function demoEnabled() {
  return (
    import.meta.env.DEV &&
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).has('demo')
  )
}

function replacementNotice(before: Rotation, after: Rotation) {
  const removedActions = ['opening', 'repeat'].reduce(
    (sum, id) =>
      sum +
      before[id as CycleId].columns.length -
      after[id as CycleId].columns.length,
    0,
  )
  const removedSwitches = ['opening', 'repeat'].reduce(
    (sum, id) =>
      sum +
      before[id as CycleId].transitions.length -
      after[id as CycleId].transitions.length,
    0,
  )
  return `공명자 교체로 두 사이클의 관련 행동 ${removedActions}개와 교체 ${removedSwitches}개가 정리되었습니다.`
}

export interface AppProps {
  initialRotation?: Rotation
  catalogOverride?: CharacterCatalog
  projectControls?: ReactNode
  headerControls?: ReactNode
  references?: ProjectReferences
  onRotationChange?: (rotation: Rotation) => void
  locked?: boolean
  hideEditor?: boolean
  embedded?: boolean
}

export function App({
  initialRotation,
  catalogOverride,
  projectControls,
  headerControls,
  references,
  onRotationChange,
  locked = false,
  hideEditor = false,
  embedded = false,
}: AppProps = {}) {
  const demo = demoEnabled()
  const catalog: CharacterCatalog =
    catalogOverride ?? (demo ? demoCatalog : emptyCatalog)
  const characterLabel = (id: string) => {
    if (catalog.characters.some((character) => character.id === id))
      return characterName(catalog, id)
    const snapshot = references?.characters.find((ref) => ref.id === id)
    return snapshot
      ? `${snapshot.displayName} (데이터 누락)`
      : characterName(catalog, id)
  }
  const skillLabel = (id: string) => {
    if (
      catalog.characters.some((character) =>
        character.skills.some((skill) => skill.id === id),
      )
    )
      return skillName(catalog, id)
    const snapshot = references?.skills.find((ref) => ref.id === id)
    return snapshot
      ? `${snapshot.displayName} (데이터 누락)`
      : skillName(catalog, id)
  }
  const skillContent = (id: string, label?: string) => {
    const skill = catalog.characters
      .flatMap((character) => character.skills)
      .find((item) => item.id === id)
    return (
      <>
        {skill?.assetUrl && (
          <img
            className="skill-icon"
            src={skill.assetUrl}
            alt=""
            draggable={false}
          />
        )}
        <span>{label ?? skill?.category ?? skillLabel(id)}</span>
      </>
    )
  }
  const skillTooltipName = (id: string) =>
    catalog.characters
      .flatMap((character) => character.skills)
      .find((skill) => skill.id === id)?.displayName ??
    references?.skills.find((skill) => skill.id === id)?.displayName
  const [editor, setEditor] = useState(() =>
    createEditorHistory(
      initialRotation ??
        (demo
          ? new URLSearchParams(window.location.search).get('demo') ===
            'continuity'
            ? createContinuityDemoRotation()
            : new URLSearchParams(window.location.search).get('demo') ===
                'input'
              ? createInputDemoRotation()
              : createDemoRotation()
          : createRotation(['slot-one', 'slot-two', 'slot-three'])),
    ),
  )
  const rotation = editor.rotation
  useLayoutEffect(() => {
    onRotationChange?.(rotation)
  }, [rotation, onRotationChange])
  const setRotation = useCallback((next: Rotation) => {
    setEditor((current) => recordRotationEdit(current, next))
  }, [])
  const [focusedCycle, setFocusedCycle] = useState<CycleId>('opening')
  const [selectingSlot, setSelectingSlot] = useState<number | null>(null)
  const { shellRef, prepareOpen } = usePartySelectorScroll(selectingSlot)
  const [pendingReplacement, setPendingReplacement] =
    useState<PendingReplacement | null>(null)
  const [selectedElement, setSelectedElement] = useState<Element>(ELEMENTS[0])
  const [notice, setNotice] = useState('')
  const [drag, setDrag] = useState<DragItem | null>(null)
  const dragPreviewRef = useRef<(() => void) | null>(null)
  const clearDragPreview = useCallback(() => {
    dragPreviewRef.current?.()
    dragPreviewRef.current = null
  }, [])
  const beginDragPreview = (event: DragEvent<HTMLElement>) => {
    clearDragPreview()
    dragPreviewRef.current = showDragPreview(
      event.currentTarget,
      event.dataTransfer,
      {
        x: event.clientX,
        y: event.clientY,
      },
    )
  }
  useEffect(() => clearDragPreview, [clearDragPreview])
  useEffect(() => {
    if (!drag) clearDragPreview()
  }, [drag, clearDragPreview])
  const pointerRef = useRef<{ x: number; y: number } | null>(null)
  const visibleCharacters = charactersByElement(catalog, selectedElement)
  const captureRef = useRef<ReturnType<typeof attachCaptureEvents> | null>(null)
  const timelineRefs = useRef<Partial<Record<CycleId, HTMLDivElement>>>({})
  const revealColumnRef = useRef<{ cycleId: CycleId; columnId: string } | null>(
    null,
  )
  const liveRef = useRef({ rotation, blocked: false })
  useEffect(() => {
    if (!drag || drag.kind === 'party') return
    return attachDragScroll(document, (target) => {
      if (!(target instanceof Element) || target.closest('.line-label'))
        return null
      const cell = target.closest<HTMLElement>('[data-capture-owner]')
      const cycleId = cell?.closest<HTMLElement>('[data-capture-cycle]')
        ?.dataset.captureCycle
      const ownerId = cell?.dataset.captureOwner
      if ((cycleId !== 'opening' && cycleId !== 'repeat') || !ownerId)
        return null
      const state = liveRef.current.rotation
      if (drag.kind === 'input') {
        if (!canDropInput(state, drag, cycleId, ownerId)) return null
      } else if (drag.kind === 'catalogSkill') {
        if (
          cycleId !== focusedCycle ||
          ownerId !== state[cycleId].activeCharacterId
        )
          return null
      } else {
        if (
          drag.cycleId !== cycleId ||
          state[cycleId].columns.find(
            (column) => column.action.id === drag.actionId,
          )?.ownerId !== ownerId
        )
          return null
      }
      return timelineRefs.current[cycleId] ?? null
    })
  }, [drag, focusedCycle])
  useLayoutEffect(() => {
    liveRef.current = {
      rotation,
      blocked:
        locked ||
        hideEditor ||
        selectingSlot !== null ||
        pendingReplacement !== null ||
        drag !== null,
    }
    if (liveRef.current.blocked) captureRef.current?.cancel()
  }, [rotation, selectingSlot, pendingReplacement, drag, locked, hideEditor])

  useLayoutEffect(() => {
    const target = revealColumnRef.current
    revealColumnRef.current = null
    if (!target) return
    const scroll = timelineRefs.current[target.cycleId]
    const card = scroll?.querySelector<HTMLElement>(
      `[data-action-column="${target.columnId}"]`,
    )
    if (!scroll || !card) return
    const viewport = scroll.getBoundingClientRect()
    const block = card.getBoundingClientRect()
    const label = scroll.querySelector('.line-label')?.getBoundingClientRect()
    const left = label?.right ?? viewport.left
    const right = viewport.left + scroll.clientWidth
    if (block.right > right) scroll.scrollLeft += block.right - right
    else if (block.left < left) scroll.scrollLeft -= left - block.left
  }, [rotation])

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY }
    }
    const onOut = (event: MouseEvent) => {
      if (!event.relatedTarget) pointerRef.current = null
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseover', onMove)
    document.addEventListener('mouseout', onOut)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseover', onMove)
      document.removeEventListener('mouseout', onOut)
    }
  }, [])

  useEffect(() => {
    const adapter = attachCaptureEvents(document, {
      blocked: () => liveRef.current.blocked,
      activeOwner: (cycleId) =>
        liveRef.current.rotation[cycleId].activeCharacterId,
      activate: (cycleId, ownerId) => {
        if (liveRef.current.rotation[cycleId].activeCharacterId !== ownerId) {
          const next = setActiveCharacter(
            liveRef.current.rotation,
            cycleId,
            ownerId,
          )
          liveRef.current.rotation = next
          setRotation(next)
        }
        setFocusedCycle(cycleId)
      },
      commit: (inputs) => {
        for (const input of inputs) {
          try {
            const next = applyCapturedInput(
              liveRef.current.rotation,
              catalog,
              input,
              () => crypto.randomUUID(),
            )
            if (next === liveRef.current.rotation) continue
            const cycleId = input.target.cycleId
            const previousColumns = new Set(
              liveRef.current.rotation[cycleId].columns.map(
                (column) => column.id,
              ),
            )
            const added = next[cycleId].columns
              .filter((column) => !previousColumns.has(column.id))
              .at(-1)
            if (added) revealColumnRef.current = { cycleId, columnId: added.id }
            liveRef.current.rotation = next
            setRotation(next)
            setFocusedCycle(input.target.cycleId)
            setNotice('')
          } catch (error) {
            setNotice(error instanceof Error ? error.message : '입력 오류')
          }
        }
      },
    })
    captureRef.current = adapter
    return () => {
      adapter.dispose()
      captureRef.current = null
    }
  }, [catalog, setRotation])

  const applyReplacement = (slotIndex: 0 | 1 | 2, replacementId: string) => {
    try {
      const hadContent = hasCharacterCycleContent(
        rotation,
        rotation.party[slotIndex],
      )
      const next = replacePartyCharacter(rotation, slotIndex, replacementId)
      setRotation(next)
      setNotice(
        next === rotation || !hadContent
          ? ''
          : replacementNotice(rotation, next),
      )
      setSelectingSlot(null)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '교체 오류')
    }
  }

  const run = (command: (current: Rotation) => Rotation) => {
    if (locked || hideEditor) return
    captureRef.current?.cancel()
    try {
      setRotation(command(rotation))
      setNotice('')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '편집 오류')
    }
  }

  const restoreCycle = (cycleId: CycleId, direction: 'undo' | 'redo') => {
    if (
      locked ||
      hideEditor ||
      selectingSlot !== null ||
      pendingReplacement !== null ||
      drag !== null
    )
      return
    captureRef.current?.cancel()
    revealColumnRef.current = null
    const next =
      direction === 'undo'
        ? undoCycle(editor, cycleId)
        : redoCycle(editor, cycleId)
    liveRef.current.rotation = next.rotation
    setEditor(next)
    setFocusedCycle(cycleId)
    setNotice('')
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (pendingReplacement) {
        if (event.key === 'Escape') setPendingReplacement(null)
        return
      }
      if (
        event.key !== 'Backspace' ||
        selectingSlot !== null ||
        drag !== null ||
        (event.target instanceof Element &&
          event.target.closest(
            'input, textarea, select, [contenteditable]:not([contenteditable="false"])',
          ))
      )
        return
      const target = deletionTargetAt(document, pointerRef.current)
      if (!target) return
      event.preventDefault()
      if (target.kind === 'input')
        run((state) => deleteInput(state, target.cycleId, target.actionId))
      else if (target.kind === 'auto')
        run((state) =>
          deleteSwitchForAutoAction(state, target.cycleId, target.actionId),
        )
      else
        run((state) =>
          deleteSkill(state, target.cycleId, target.actionId, target.skillId),
        )
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const dropParty = (targetIndex: number) => {
    if (drag?.kind !== 'party') return
    const party = [...rotation.party] as Rotation['party']
    const source = party.indexOf(drag.id)
    if (source < 0) return
    const [id] = party.splice(source, 1)
    party.splice(targetIndex, 0, id)
    run((state) => reorderParty(state, party))
    setDrag(null)
  }

  const dropSkill = (
    cycleId: CycleId,
    actionId: string,
    targetIndex: number,
  ) => {
    if (drag?.kind === 'catalogSkill') {
      const target = rotation[cycleId].columns.find(
        (item) => item.action.id === actionId,
      )
      if (
        cycleId !== focusedCycle ||
        target?.ownerId !== rotation[focusedCycle].activeCharacterId
      ) {
        setNotice('현재 편집 라인의 InputBlock에만 스킬을 연결할 수 있습니다.')
        setDrag(null)
        return
      }
      const ref = drag.ref
      run((state) => {
        const next = addSkill(
          state,
          cycleId,
          actionId,
          { id: crypto.randomUUID(), skillRef: ref, stage: 0 },
          targetIndex,
        )
        revealColumnRef.current = { cycleId, columnId: target.id }
        return next
      })
    } else if (
      drag?.kind === 'linkedSkill' &&
      drag.cycleId === cycleId &&
      drag.actionId === actionId
    ) {
      const action = rotation[cycleId].columns.find(
        (item) => item.action.id === actionId,
      )?.action
      if (action?.type === 'input')
        run((state) =>
          reorderSkill(
            state,
            cycleId,
            actionId,
            drag.skillId,
            Math.min(targetIndex, action.skills.length - 1),
          ),
        )
    }
    setDrag(null)
  }

  const renderInput = (
    cycleId: CycleId,
    action: InputBlock,
    columnId: string,
  ) => (
    <div
      className="input-card"
      data-action-column={columnId}
      data-action-id={action.id}
      data-skill-count={action.skills.length}
      onContextMenu={(event) => event.preventDefault()}
      draggable
      aria-label={`${action.input} 입력, 연결 스킬 ${action.skills.length}개`}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move'
        beginDragPreview(event)
        setDrag({ kind: 'input', cycleId, columnId })
      }}
      onDragEnd={() => setDrag(null)}
      onDragOver={(event) => {
        if (drag?.kind === 'catalogSkill' || drag?.kind === 'linkedSkill')
          event.preventDefault()
      }}
      onDrop={(event) => {
        if (drag?.kind === 'catalogSkill' || drag?.kind === 'linkedSkill') {
          event.preventDefault()
          event.stopPropagation()
          dropSkill(cycleId, action.id, action.skills.length)
        }
      }}
    >
      <span className="input-key">
        {action.input}
        <small>{action.gesture === 'hold' ? 'Hold' : 'Tap'}</small>
      </span>
      {action.skills.map((skill, index) => (
        <span
          key={skill.id}
          className="linked-skill"
          data-skill-id={skill.id}
          draggable={action.skills.length > 1}
          onDragStart={(event) => {
            if (action.skills.length < 2) return
            event.stopPropagation()
            event.dataTransfer.effectAllowed = 'move'
            beginDragPreview(event)
            setDrag({
              kind: 'linkedSkill',
              cycleId,
              actionId: action.id,
              skillId: skill.id,
            })
          }}
          onDragEnd={() => setDrag(null)}
          onDragOver={(event) => {
            if (drag?.kind === 'catalogSkill' || drag?.kind === 'linkedSkill') {
              event.preventDefault()
              event.stopPropagation()
            }
          }}
          onDrop={(event) => {
            if (drag?.kind === 'catalogSkill' || drag?.kind === 'linkedSkill') {
              event.preventDefault()
              event.stopPropagation()
              dropSkill(cycleId, action.id, index)
            }
          }}
          onWheel={(event) => {
            const change = stageChangeFromWheel(event.deltaY)
            if (change === 0) return
            event.preventDefault()
            event.stopPropagation()
            run((state) =>
              changeSkillStage(state, cycleId, action.id, skill.id, change),
            )
          }}
          data-skill-tooltip={skillTooltipName(skill.skillRef)}
        >
          {skillContent(skill.skillRef)}
          {skill.stage > 0 && <small>{skill.stage}단</small>}
        </span>
      ))}
    </div>
  )

  const renderCycle = (cycleId: CycleId) => {
    const cycle = rotation[cycleId]
    const view = projectCycle(rotation, cycle)
    const title = cycleId === 'opening' ? '개막 사이클' : '반복 사이클'
    const tracks = `var(--timeline-line-size) ${view.columns.map(() => 'max-content').join(' ')} minmax(150px, 1fr)`
    return (
      <section
        className={`cycle-panel ${focusedCycle === cycleId ? 'focused-cycle' : ''}`}
        aria-label={title}
        key={cycleId}
      >
        <div className="section-heading">
          <div>
            <span className="eyebrow">
              {cycleId === 'opening' ? 'OPENING CYCLE' : 'REPEAT CYCLE'}
            </span>
            <h2>{title}</h2>
          </div>
          <div className="cycle-tools">
            {focusedCycle === cycleId && (
              <span className="status">편집 중</span>
            )}
            <button
              type="button"
              aria-label={`${title} 실행 취소`}
              title="실행 취소"
              disabled={
                locked ||
                editor.histories[cycleId].past.length === 0 ||
                drag !== null ||
                pendingReplacement !== null ||
                selectingSlot !== null
              }
              onClick={() => restoreCycle(cycleId, 'undo')}
            >
              <span aria-hidden="true">↶</span>
            </button>
            <button
              type="button"
              aria-label={`${title} 다시 실행`}
              title="다시 실행"
              disabled={
                locked ||
                editor.histories[cycleId].future.length === 0 ||
                drag !== null ||
                pendingReplacement !== null ||
                selectingSlot !== null
              }
              onClick={() => restoreCycle(cycleId, 'redo')}
            >
              <span aria-hidden="true">↷</span>
            </button>
          </div>
        </div>
        <div
          className="timeline-scroll"
          ref={(element) => {
            if (element) timelineRefs.current[cycleId] = element
            else delete timelineRefs.current[cycleId]
          }}
          aria-label={`${title} 전역 타임라인`}
        >
          <div
            className="timeline-grid"
            data-capture-cycle={cycleId}
            style={{ gridTemplateColumns: tracks }}
          >
            {view.party.map((id, lineIndex) => (
              <div className="timeline-row-fragment" key={id}>
                <button
                  className={`line-label ${cycle.activeCharacterId === id ? 'active-line' : ''}`}
                  data-row-owner={id}
                  data-capture-owner={id}
                  aria-label={`슬롯 ${lineIndex + 1} ${characterLabel(id)}`}
                  title={characterLabel(id)}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move'
                    setDrag({ kind: 'party', id })
                  }}
                  onDragEnd={() => setDrag(null)}
                  onDragOver={(event) => {
                    if (drag?.kind === 'party') event.preventDefault()
                  }}
                  onDrop={(event) => {
                    if (drag?.kind === 'party') {
                      event.preventDefault()
                      dropParty(lineIndex)
                    }
                  }}
                >
                  <span className="line-number">0{lineIndex + 1}</span>
                  {catalog.characters.find((item) => item.id === id)
                    ?.assetUrl ? (
                    <img
                      className="line-portrait"
                      src={
                        catalog.characters.find((item) => item.id === id)!
                          .assetUrl
                      }
                      alt=""
                      draggable={false}
                    />
                  ) : (
                    <span
                      className="line-portrait-placeholder"
                      aria-hidden="true"
                    >
                      ◇
                    </span>
                  )}
                </button>
                {view.columns.map((column, index) => (
                  <div
                    className="timeline-cell"
                    key={column.id}
                    data-column-cell={column.id}
                    data-capture-owner={id}
                    onDragOver={(event) => {
                      if (
                        canDropInput(
                          rotation,
                          drag?.kind === 'input' ? drag : null,
                          cycleId,
                          id,
                        )
                      )
                        event.preventDefault()
                    }}
                    onDrop={(event) => {
                      if (
                        drag?.kind === 'input' &&
                        canDropInput(rotation, drag, cycleId, id)
                      ) {
                        event.preventDefault()
                        run((state) =>
                          reorderInput(state, cycleId, drag.columnId, index),
                        )
                        setDrag(null)
                      }
                    }}
                  >
                    {column.ownerId === id &&
                      (column.action.type === 'input' ? (
                        renderInput(cycleId, column.action, column.id)
                      ) : (
                        <div
                          className="auto-card"
                          data-action-column={column.id}
                          data-action-id={column.action.id}
                          data-skill-tooltip={skillTooltipName(
                            column.action.skillRef,
                          )}
                        >
                          {skillContent(
                            column.action.skillRef,
                            column.action.kind === 'outro'
                              ? '반주 스킬'
                              : column.action.kind === 'intro'
                                ? '변주 스킬'
                                : '교체 공격',
                          )}
                        </div>
                      ))}
                  </div>
                ))}
                <div
                  className="timeline-cell end-cell"
                  data-capture-owner={id}
                  onDragOver={(event) => {
                    if (
                      canDropInput(
                        rotation,
                        drag?.kind === 'input' ? drag : null,
                        cycleId,
                        id,
                      )
                    )
                      event.preventDefault()
                  }}
                  onDrop={(event) => {
                    if (
                      drag?.kind === 'input' &&
                      canDropInput(rotation, drag, cycleId, id) &&
                      view.columns.length > 0
                    ) {
                      event.preventDefault()
                      run((state) =>
                        reorderInput(
                          state,
                          cycleId,
                          drag.columnId,
                          view.columns.length - 1,
                        ),
                      )
                      setDrag(null)
                    }
                  }}
                >
                  {view.columns.length === 0 && (
                    <span className="empty-hint">
                      아직 기록된 행동이 없습니다
                    </span>
                  )}
                </div>
              </div>
            ))}
            <TimelineWires
              columns={cycle.columns}
              transitions={cycle.transitions}
              party={rotation.party}
            />
          </div>
        </div>
      </section>
    )
  }

  const activeId = rotation[focusedCycle].activeCharacterId
  const activeCharacter = catalog.characters.find(
    (item) => item.id === activeId,
  )
  return (
    <main
      className={embedded ? 'workspace-editor' : 'app-shell'}
      ref={shellRef}
    >
      {!embedded && (
        <header className="page-heading">
          <div>
            <span className="eyebrow">
              WUTHERING WAVES · ROTATION WORKSPACE
            </span>
            <h1>WUWA Rotation Builder</h1>
          </div>
          {headerControls}
        </header>
      )}
      {projectControls}
      <div
        hidden={hideEditor}
        ref={(element) => {
          if (locked) element?.setAttribute('inert', '')
          else element?.removeAttribute('inert')
        }}
      >
        {notice && (
          <div className="editor-notice" role="status">
            {notice}
          </div>
        )}
        <section className="party-panel" aria-label="파티 편성">
          <div className="section-heading">
            <div>
              <span className="eyebrow">PARTY SETUP</span>
              <h2>파티 편성</h2>
            </div>
          </div>
          <div className="party-grid">
            {rotation.party.map((id, index) => (
              <button
                className="party-slot"
                key={id}
                draggable
                onClick={() => {
                  if (selectingSlot !== index) prepareOpen()
                  setSelectedElement(ELEMENTS[0])
                  setSelectingSlot(selectingSlot === index ? null : index)
                }}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move'
                  setDrag({ kind: 'party', id })
                }}
                onDragEnd={() => setDrag(null)}
                onDragOver={(event) => {
                  if (drag?.kind === 'party') event.preventDefault()
                }}
                onDrop={(event) => {
                  if (drag?.kind === 'party') {
                    event.preventDefault()
                    dropParty(index)
                  }
                }}
              >
                <span className="slot-index">0{index + 1}</span>
                {catalog.characters.find((item) => item.id === id)?.assetUrl ? (
                  <img
                    className="character-portrait"
                    src={
                      catalog.characters.find((item) => item.id === id)!
                        .assetUrl
                    }
                    alt=""
                    draggable={false}
                  />
                ) : (
                  <span className="portrait-placeholder" aria-hidden="true">
                    ◇
                  </span>
                )}
                <span className="party-character-info">
                  <strong>{characterLabel(id)}</strong>
                  <small>
                    {catalog.characters.find((item) => item.id === id)?.element}
                  </small>
                </span>
              </button>
            ))}
          </div>
          {selectingSlot !== null && (
            <div className="character-selector" aria-label="공명자 선택">
              <div className="selector-heading">
                <strong>슬롯 {selectingSlot + 1} 공명자 선택</strong>
                <div
                  className="element-tabs"
                  role="group"
                  aria-label="속성 선택"
                >
                  {ELEMENTS.map((element) => (
                    <button
                      key={element}
                      type="button"
                      className={selectedElement === element ? 'selected' : ''}
                      aria-pressed={selectedElement === element}
                      onClick={() => setSelectedElement(element)}
                    >
                      {element}
                    </button>
                  ))}
                </div>
                <button onClick={() => setSelectingSlot(null)}>닫기</button>
              </div>
              <div className="character-options" aria-live="polite">
                {visibleCharacters.length === 0 ? (
                  <p>
                    {catalog.characters.length === 0
                      ? '검수된 공명자 데이터가 아직 없습니다.'
                      : `${selectedElement} 공명자가 없습니다.`}
                  </p>
                ) : (
                  visibleCharacters.map((item) => (
                    <button
                      key={item.id}
                      disabled={
                        rotation.party.includes(item.id) &&
                        rotation.party[selectingSlot] !== item.id
                      }
                      onClick={() => {
                        const slotIndex = selectingSlot as 0 | 1 | 2
                        const formerId = rotation.party[slotIndex]
                        if (
                          item.id !== formerId &&
                          hasCharacterCycleContent(rotation, formerId)
                        ) {
                          setPendingReplacement({
                            slotIndex,
                            formerId,
                            replacementId: item.id,
                          })
                        } else applyReplacement(slotIndex, item.id)
                      }}
                    >
                      {item.assetUrl && (
                        <img
                          className="selector-portrait"
                          src={item.assetUrl}
                          alt=""
                          draggable={false}
                        />
                      )}
                      <span className="selector-name">{item.displayName}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </section>
        <div className="workspace-grid" hidden={selectingSlot !== null}>
          <aside className="skills-panel" aria-label="공명자 스킬">
            <div className="section-heading">
              <div>
                <span className="eyebrow">RESONATOR SKILLS</span>
                <h2>공명자 스킬</h2>
              </div>
            </div>
            {activeCharacter ? (
              <div className="skill-list">
                {activeCharacter.skills
                  .filter((skill) => skill.visible !== false)
                  .map((skill) => (
                    <div
                      className="catalog-skill"
                      key={skill.id}
                      data-skill-tooltip={skill.displayName}
                      draggable
                      onDragStart={(event) => {
                        event.dataTransfer.effectAllowed = 'copy'
                        event.dataTransfer.setData('text/plain', skill.id)
                        beginDragPreview(event)
                        setDrag({ kind: 'catalogSkill', ref: skill.id })
                      }}
                      onDragEnd={() => setDrag(null)}
                    >
                      {skill.assetUrl && (
                        <img
                          className="skill-icon"
                          src={skill.assetUrl}
                          alt=""
                          draggable={false}
                        />
                      )}
                      <span className="catalog-skill-copy">
                        {skill.category && (
                          <span className="catalog-skill-category">
                            {skill.category}
                          </span>
                        )}
                        <span className="catalog-skill-name">
                          {skill.displayName}
                        </span>
                      </span>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="skills-empty">
                <div className="empty-symbol">◇</div>
                <strong>검수된 스킬 데이터 대기 중</strong>
                <p>현재 편집 라인의 공명자 스킬이 이곳에 표시됩니다.</p>
              </div>
            )}
          </aside>
          <div className="cycles">
            {renderCycle('opening')}
            {renderCycle('repeat')}
          </div>
        </div>
        <SkillTooltip
          disabled={
            drag !== null ||
            selectingSlot !== null ||
            pendingReplacement !== null ||
            hideEditor ||
            locked
          }
        />
        <footer hidden={selectingSlot !== null}>
          A fan-made website for Wuthering Waves. Wuthering Waves and all
          related assets are © KURO GAMES.
        </footer>
        {pendingReplacement && (
          <div className="confirm-backdrop">
            <div
              className="confirm-dialog"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="replacement-confirm-title"
              aria-describedby="replacement-confirm-description"
              onKeyDown={(event) => {
                if (event.key !== 'Tab') return
                const buttons = event.currentTarget.querySelectorAll('button')
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
              <h2 id="replacement-confirm-title">
                공명자를 변경하면 사이클이 초기화됩니다.
              </h2>
              <p id="replacement-confirm-description">
                기존 공명자와 연결된 행동·교체가 개막 및 반복 사이클에서
                정리됩니다. 두 사이클의 실행 취소·다시 실행 기록도 초기화됩니다.
              </p>
              <div className="confirm-actions">
                <button autoFocus onClick={() => setPendingReplacement(null)}>
                  취소
                </button>
                <button
                  className="confirm-submit"
                  onClick={() => {
                    if (
                      rotation.party[pendingReplacement.slotIndex] ===
                      pendingReplacement.formerId
                    ) {
                      applyReplacement(
                        pendingReplacement.slotIndex,
                        pendingReplacement.replacementId,
                      )
                    }
                    setPendingReplacement(null)
                  }}
                >
                  공명자 변경
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </main>
  )
}
