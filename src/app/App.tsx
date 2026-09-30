import { useEffect, useState } from 'react'
import {
  addSkill,
  changeSkillStage,
  createRotation,
  deleteAutoAction,
  deleteInput,
  deleteSkill,
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
  emptyCatalog,
  skillName,
  type CharacterCatalog,
} from './catalog'
import { createDemoRotation, demoCatalog } from './demo'
import { projectCycle } from './editor-projection'
import { TimelineWires } from './TimelineWires'

type DragItem =
  | { kind: 'party'; id: string }
  | { kind: 'input'; cycleId: CycleId; columnId: string }
  | { kind: 'catalogSkill'; ref: string }
  | { kind: 'linkedSkill'; cycleId: CycleId; actionId: string; skillId: string }
type HoverTarget =
  | { kind: 'input'; cycleId: CycleId; actionId: string }
  | { kind: 'auto'; cycleId: CycleId; actionId: string }
  | { kind: 'skill'; cycleId: CycleId; actionId: string; skillId: string }

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

export function App() {
  const demo = demoEnabled()
  const catalog: CharacterCatalog = demo ? demoCatalog : emptyCatalog
  const [rotation, setRotation] = useState<Rotation>(() =>
    demo
      ? createDemoRotation()
      : createRotation(['slot-one', 'slot-two', 'slot-three']),
  )
  const [focusedCycle, setFocusedCycle] = useState<CycleId>('opening')
  const [selectingSlot, setSelectingSlot] = useState<number | null>(null)
  const [notice, setNotice] = useState('')
  const [drag, setDrag] = useState<DragItem | null>(null)
  const [hover, setHover] = useState<HoverTarget | null>(null)

  const run = (command: (current: Rotation) => Rotation) => {
    try {
      setRotation(command(rotation))
      setNotice('')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '편집 오류')
    }
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.key !== 'Delete' ||
        !hover ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      )
        return
      event.preventDefault()
      const target = hover
      if (target.kind === 'input')
        run((state) => deleteInput(state, target.cycleId, target.actionId))
      else if (target.kind === 'auto')
        run((state) => deleteAutoAction(state, target.cycleId, target.actionId))
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
      run((state) =>
        addSkill(
          state,
          cycleId,
          actionId,
          { id: crypto.randomUUID(), skillRef: ref, stage: 0 },
          targetIndex,
        ),
      )
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
      draggable
      aria-label={`${action.input} 입력, 연결 스킬 ${action.skills.length}개`}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move'
        setDrag({ kind: 'input', cycleId, columnId })
      }}
      onDragEnd={() => setDrag(null)}
      onMouseEnter={() =>
        setHover({ kind: 'input', cycleId, actionId: action.id })
      }
      onMouseLeave={() => setHover(null)}
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
      {action.skills.length === 0 && (
        <span className="skill-placeholder">스킬 없음</span>
      )}
      {action.skills.map((skill, index) => (
        <span
          key={skill.id}
          className="linked-skill"
          draggable={action.skills.length > 1}
          onDragStart={(event) => {
            if (action.skills.length < 2) return
            event.stopPropagation()
            event.dataTransfer.effectAllowed = 'move'
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
          onMouseEnter={(event) => {
            event.stopPropagation()
            setHover(
              action.skills.length === 1
                ? { kind: 'input', cycleId, actionId: action.id }
                : {
                    kind: 'skill',
                    cycleId,
                    actionId: action.id,
                    skillId: skill.id,
                  },
            )
          }}
          onMouseLeave={() =>
            setHover({ kind: 'input', cycleId, actionId: action.id })
          }
          onWheel={(event) => {
            event.preventDefault()
            event.stopPropagation()
            run((state) =>
              changeSkillStage(
                state,
                cycleId,
                action.id,
                skill.id,
                event.deltaY < 0 ? 1 : -1,
              ),
            )
          }}
          title="휠로 단수 변경 · Delete로 삭제"
        >
          {skillName(catalog, skill.skillRef)}
          {skill.stage > 0 && <small>{skill.stage}단</small>}
        </span>
      ))}
    </div>
  )

  const renderCycle = (cycleId: CycleId) => {
    const cycle = rotation[cycleId]
    const view = projectCycle(rotation, cycle)
    const title = cycleId === 'opening' ? '개막 사이클' : '반복 사이클'
    const tracks = `148px ${view.columns.map(() => 'max-content').join(' ')} 150px`
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
          <span className="status">
            {focusedCycle === cycleId ? '편집 중' : 'Cycle'}
          </span>
        </div>
        <div className="timeline-scroll" aria-label={`${title} 전역 타임라인`}>
          <div
            className="timeline-grid"
            style={{ gridTemplateColumns: tracks }}
          >
            {view.party.map((id, lineIndex) => (
              <div className="timeline-row-fragment" key={id}>
                <button
                  className={`line-label ${cycle.activeCharacterId === id ? 'active-line' : ''}`}
                  data-row-owner={id}
                  onClick={() => {
                    setFocusedCycle(cycleId)
                    run((state) => setActiveCharacter(state, cycleId, id))
                  }}
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
                  {characterName(catalog, id)}
                </button>
                {view.columns.map((column, index) => (
                  <div
                    className="timeline-cell"
                    key={column.id}
                    data-column-cell={column.id}
                    onDragOver={(event) => {
                      if (drag?.kind === 'input' && drag.cycleId === cycleId)
                        event.preventDefault()
                    }}
                    onDrop={(event) => {
                      if (drag?.kind === 'input' && drag.cycleId === cycleId) {
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
                          onMouseEnter={() =>
                            setHover({
                              kind: 'auto',
                              cycleId,
                              actionId: column.action.id,
                            })
                          }
                          onMouseLeave={() => setHover(null)}
                          title="읽기 전용 · Delete로 삭제"
                        >
                          <small>
                            {column.action.kind === 'outro'
                              ? '반주'
                              : column.action.kind === 'intro'
                                ? '변주'
                                : '교체 공격'}
                          </small>
                          {skillName(catalog, column.action.skillRef)}
                        </div>
                      ))}
                  </div>
                ))}
                <div
                  className="timeline-cell end-cell"
                  onDragOver={(event) => {
                    if (drag?.kind === 'input' && drag.cycleId === cycleId)
                      event.preventDefault()
                  }}
                  onDrop={(event) => {
                    if (
                      drag?.kind === 'input' &&
                      drag.cycleId === cycleId &&
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
    <main className="app-shell">
      <header className="page-heading">
        <div>
          <span className="eyebrow">WUTHERING WAVES · ROTATION WORKSPACE</span>
          <h1>WUWA Rotation Builder</h1>
        </div>
        <span className="foundation-badge">
          {demo ? '개발 검증 데이터' : 'Editor'}
        </span>
      </header>
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
          <p>슬롯 클릭으로 공명자 선택 · 드래그로 순서 변경</p>
        </div>
        <div className="party-grid">
          {rotation.party.map((id, index) => (
            <button
              className="party-slot"
              key={id}
              draggable
              onClick={() =>
                setSelectingSlot(selectingSlot === index ? null : index)
              }
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
              <span className="portrait-placeholder" aria-hidden="true">
                ◇
              </span>
              <span>
                <strong>{characterName(catalog, id)}</strong>
                <small>슬롯 {index + 1}</small>
              </span>
            </button>
          ))}
        </div>
        {selectingSlot !== null && (
          <div className="character-selector" aria-label="공명자 선택">
            <div className="selector-heading">
              <strong>슬롯 {selectingSlot + 1} 공명자 선택</strong>
              <button onClick={() => setSelectingSlot(null)}>닫기</button>
            </div>
            {catalog.characters.length === 0 ? (
              <p>검수된 공명자 데이터가 아직 없습니다.</p>
            ) : (
              ELEMENTS.map((element) => (
                <div className="element-group" key={element}>
                  <h3>{element}</h3>
                  <div className="character-options">
                    {catalog.characters
                      .filter((item) => item.element === element)
                      .map((item) => (
                        <button
                          key={item.id}
                          disabled={
                            rotation.party.includes(item.id) &&
                            rotation.party[selectingSlot] !== item.id
                          }
                          onClick={() => {
                            try {
                              const next = replacePartyCharacter(
                                rotation,
                                selectingSlot as 0 | 1 | 2,
                                item.id,
                              )
                              setRotation(next)
                              setNotice(
                                next === rotation
                                  ? ''
                                  : replacementNotice(rotation, next),
                              )
                              setSelectingSlot(null)
                            } catch (error) {
                              setNotice(
                                error instanceof Error
                                  ? error.message
                                  : '교체 오류',
                              )
                            }
                          }}
                        >
                          {item.displayName}
                        </button>
                      ))}
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </section>
      <div className="workspace-grid">
        <aside className="skills-panel" aria-label="공명자 스킬">
          <div className="section-heading">
            <div>
              <span className="eyebrow">RESONATOR SKILLS</span>
              <h2>공명자 스킬</h2>
            </div>
          </div>
          <p className="skills-context">
            {focusedCycle === 'opening' ? '개막' : '반복'} ·{' '}
            {characterName(catalog, activeId)}
          </p>
          {activeCharacter ? (
            <div className="skill-list">
              {activeCharacter.skills.map((skill) => (
                <div
                  className="catalog-skill"
                  key={skill.id}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'copy'
                    setDrag({ kind: 'catalogSkill', ref: skill.id })
                  }}
                  onDragEnd={() => setDrag(null)}
                >
                  {skill.displayName}
                  <small>InputBlock으로 드래그</small>
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
      <footer>입력 캡처와 프로젝트 저장은 후속 단계에서 연결됩니다.</footer>
    </main>
  )
}
