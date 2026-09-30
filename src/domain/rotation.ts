export type CharacterId = string
export type CycleId = 'opening' | 'repeat'
export type InputControl = 'Q' | 'E' | 'R' | 'T' | 'Space' | 'LMB' | 'RMB'
export type Gesture = 'tap' | 'hold'
export type AutoActionKind = 'normalSwitchAttack' | 'intro' | 'outro'

const INPUT_CONTROLS: readonly InputControl[] = [
  'Q',
  'E',
  'R',
  'T',
  'Space',
  'LMB',
  'RMB',
]
const GESTURES: readonly Gesture[] = ['tap', 'hold']

export interface SkillBlock {
  id: string
  skillRef: string
  stage: number
}

export interface InputBlock {
  type: 'input'
  id: string
  input: InputControl
  gesture: Gesture
  skills: SkillBlock[]
}

export interface AutoActionBlock {
  type: 'autoAction'
  id: string
  kind: AutoActionKind
  skillRef: string
  switchId: string
}

export interface TimelineColumn {
  id: string
  ownerId: CharacterId
  action: InputBlock | AutoActionBlock
}

export interface Transition {
  switchId: string
  fromId: CharacterId
  toId: CharacterId
  kind: 'normal' | 'concerto'
  /** 열 자체가 아닌, 이 열 직후의 경계. null은 첫 열 앞이다. */
  afterColumnId: string | null
}

export interface SwitchSuppression {
  switchId: string
  kind: 'normalSwitchAttack' | 'concertoPair'
}

export interface Cycle {
  activeCharacterId: CharacterId
  columns: TimelineColumn[]
  transitions: Transition[]
  suppression: SwitchSuppression[]
}

export interface Rotation {
  party: [CharacterId, CharacterId, CharacterId]
  opening: Cycle
  repeat: Cycle
}

export function createRotation(party: Rotation['party']): Rotation {
  if (
    party.length !== 3 ||
    new Set(party).size !== 3 ||
    party.some((id) => !id)
  )
    throw new Error('파티는 서로 다른 공명자 3명이어야 합니다.')
  return {
    party: [...party],
    opening: {
      activeCharacterId: party[0],
      columns: [],
      transitions: [],
      suppression: [],
    },
    repeat: {
      activeCharacterId: party[0],
      columns: [],
      transitions: [],
      suppression: [],
    },
  }
}

export function assertRotation(rotation: Rotation): void {
  if (
    rotation.party.length !== 3 ||
    new Set(rotation.party).size !== 3 ||
    rotation.party.some((id) => !id)
  ) {
    throw new Error('파티 구성이 유효하지 않습니다.')
  }
  for (const cycle of [rotation.opening, rotation.repeat]) {
    if (!rotation.party.includes(cycle.activeCharacterId))
      throw new Error('활성 공명자가 파티에 없습니다.')
    const ids = new Set<string>()
    const actionIds = new Set<string>()
    for (const column of cycle.columns) {
      if (
        !column.id ||
        ids.has(column.id) ||
        !rotation.party.includes(column.ownerId)
      )
        throw new Error('TimelineColumn이 유효하지 않습니다.')
      ids.add(column.id)
      if (!column.action.id || actionIds.has(column.action.id))
        throw new Error('행동 ID가 유효하지 않습니다.')
      actionIds.add(column.action.id)
      if (column.action.type === 'input') {
        if (
          !INPUT_CONTROLS.includes(column.action.input) ||
          !GESTURES.includes(column.action.gesture) ||
          !Array.isArray(column.action.skills)
        )
          throw new Error('InputBlock의 입력 정보가 유효하지 않습니다.')
        const skillIds = new Set<string>()
        for (const skill of column.action.skills) {
          if (
            !skill.id ||
            skillIds.has(skill.id) ||
            !skill.skillRef ||
            !Number.isInteger(skill.stage) ||
            skill.stage < 0
          ) {
            throw new Error('SkillBlock이 유효하지 않습니다.')
          }
          skillIds.add(skill.id)
        }
      } else if (column.action.type === 'autoAction') {
        if (
          !['normalSwitchAttack', 'intro', 'outro'].includes(
            column.action.kind,
          ) ||
          !column.action.skillRef ||
          'input' in column.action ||
          'gesture' in column.action ||
          'skills' in column.action ||
          'stage' in column.action
        )
          throw new Error('AutoAction의 데이터가 유효하지 않습니다.')
      } else {
        throw new Error('행동 종류가 유효하지 않습니다.')
      }
    }
    const switchIds = new Set<string>()
    for (const transition of cycle.transitions) {
      if (
        !transition.switchId ||
        switchIds.has(transition.switchId) ||
        !rotation.party.includes(transition.fromId) ||
        !rotation.party.includes(transition.toId) ||
        transition.fromId === transition.toId ||
        !['normal', 'concerto'].includes(transition.kind) ||
        (transition.afterColumnId !== null &&
          !ids.has(transition.afterColumnId))
      ) {
        throw new Error('Transition이 유효하지 않습니다.')
      }
      switchIds.add(transition.switchId)
    }
    for (const column of cycle.columns) {
      if (column.action.type !== 'autoAction') continue
      const action = column.action
      const transition = cycle.transitions.find(
        (item) => item.switchId === action.switchId,
      )
      if (!transition) throw new Error('AutoAction에 연결된 교체가 없습니다.')
      const expectedOwner =
        action.kind === 'outro' ? transition.fromId : transition.toId
      if (column.ownerId !== expectedOwner)
        throw new Error('AutoAction 소유자가 다릅니다.')
      if (transition.kind === 'normal' && action.kind !== 'normalSwitchAttack')
        throw new Error('일반 교체의 자동 행동이 유효하지 않습니다.')
      if (
        transition.kind === 'concerto' &&
        action.kind === 'normalSwitchAttack'
      )
        throw new Error('협주 교체의 자동 행동이 유효하지 않습니다.')
    }
    const suppressions = new Set<string>()
    for (const item of cycle.suppression) {
      if (!switchIds.has(item.switchId) || suppressions.has(item.switchId))
        throw new Error('suppression이 유효하지 않습니다.')
      const transition = cycle.transitions.find(
        (candidate) => candidate.switchId === item.switchId,
      )!
      if (
        item.kind !==
        (transition.kind === 'normal' ? 'normalSwitchAttack' : 'concertoPair')
      )
        throw new Error('suppression 종류가 교체와 다릅니다.')
      suppressions.add(item.switchId)
    }
    for (const transition of cycle.transitions) {
      const actions = cycle.columns.filter(
        (column) =>
          column.action.type === 'autoAction' &&
          column.action.switchId === transition.switchId,
      )
      if (
        suppressions.has(transition.switchId)
          ? actions.length !== 0
          : transition.kind === 'normal'
            ? actions.length !== 1
            : actions.length !== 2
      )
        throw new Error('교체와 자동 행동의 연결이 유효하지 않습니다.')
      if (
        transition.kind === 'concerto' &&
        actions.length === 2 &&
        new Set(
          actions.map((column) => (column.action as AutoActionBlock).kind),
        ).size !== 2
      )
        throw new Error('협주 자동 행동 쌍이 유효하지 않습니다.')
      const boundary =
        transition.afterColumnId === null
          ? 0
          : cycle.columns.findIndex(
              (column) => column.id === transition.afterColumnId,
            ) + 1
      for (const action of actions) {
        const actionIndex = cycle.columns.indexOf(action)
        if (
          (action.action as AutoActionBlock).kind === 'outro'
            ? actionIndex >= boundary
            : actionIndex < boundary
        )
          throw new Error('AutoAction이 교체 경계의 잘못된 쪽에 있습니다.')
      }
    }
  }
}

function changeCycle(
  rotation: Rotation,
  cycleId: CycleId,
  change: (cycle: Cycle) => Cycle,
): Rotation {
  assertRotation(rotation)
  const next = { ...rotation, [cycleId]: change(rotation[cycleId]) }
  assertRotation(next)
  return next
}

function requireUniqueColumn(cycle: Cycle, id: string, actionId: string): void {
  if (
    !id ||
    !actionId ||
    cycle.columns.some(
      (column) => column.id === id || column.action.id === actionId,
    )
  ) {
    throw new Error('열 또는 행동 ID가 중복되었습니다.')
  }
}

export function setActiveCharacter(
  rotation: Rotation,
  cycleId: CycleId,
  characterId: CharacterId,
): Rotation {
  if (!rotation.party.includes(characterId))
    throw new Error('파티에 없는 공명자입니다.')
  return changeCycle(rotation, cycleId, (cycle) => ({
    ...cycle,
    activeCharacterId: characterId,
  }))
}

export function reorderParty(
  rotation: Rotation,
  party: Rotation['party'],
): Rotation {
  assertRotation(rotation)
  if (
    new Set(party).size !== 3 ||
    party.some((id) => !rotation.party.includes(id))
  )
    throw new Error('동일한 공명자 3명만 재정렬할 수 있습니다.')
  const next = { ...rotation, party: [...party] as Rotation['party'] }
  assertRotation(next)
  return next
}

/** 제거된 열을 가리키던 교체 경계를 직전의 남은 열에 유지한다. */
function reanchorTransitions(
  before: TimelineColumn[],
  after: TimelineColumn[],
  transitions: Transition[],
): Transition[] {
  const retainedIds = new Set(after.map((column) => column.id))
  return transitions.map((transition) => {
    const anchor = transition.afterColumnId
    if (anchor === null || retainedIds.has(anchor)) return transition
    const index = before.findIndex((column) => column.id === anchor)
    const previous = before
      .slice(0, index)
      .reverse()
      .find((column) => retainedIds.has(column.id))
    return { ...transition, afterColumnId: previous?.id ?? null }
  })
}

/** 파티 슬롯 교체는 두 Cycle의 관련 참조를 한 번에 정리한다. */
export function replacePartyCharacter(
  rotation: Rotation,
  slotIndex: 0 | 1 | 2,
  replacementId: CharacterId,
): Rotation {
  assertRotation(rotation)
  if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex > 2)
    throw new Error('파티 슬롯이 유효하지 않습니다.')
  const formerId = rotation.party[slotIndex]
  if (replacementId === formerId) return rotation
  if (!replacementId || rotation.party.includes(replacementId))
    throw new Error('교체 공명자는 파티의 다른 슬롯에 없어야 합니다.')

  const replaceInCycle = (cycle: Cycle): Cycle => {
    const removedSwitchIds = new Set(
      cycle.transitions
        .filter(
          (transition) =>
            transition.fromId === formerId || transition.toId === formerId,
        )
        .map((transition) => transition.switchId),
    )
    const columns = cycle.columns.filter(
      (column) =>
        column.ownerId !== formerId &&
        !(
          column.action.type === 'autoAction' &&
          removedSwitchIds.has(column.action.switchId)
        ),
    )
    const transitions = cycle.transitions.filter(
      (transition) => !removedSwitchIds.has(transition.switchId),
    )
    return {
      ...cycle,
      activeCharacterId:
        cycle.activeCharacterId === formerId
          ? replacementId
          : cycle.activeCharacterId,
      columns,
      transitions: reanchorTransitions(cycle.columns, columns, transitions),
      suppression: cycle.suppression.filter(
        (item) => !removedSwitchIds.has(item.switchId),
      ),
    }
  }
  const party = [...rotation.party] as Rotation['party']
  party[slotIndex] = replacementId
  const next: Rotation = {
    party,
    opening: replaceInCycle(rotation.opening),
    repeat: replaceInCycle(rotation.repeat),
  }
  assertRotation(next)
  return next
}

export function transitionKey(
  rotation: Rotation,
  transition: Transition,
): '1' | '2' | '3' {
  const index = rotation.party.indexOf(transition.toId)
  if (index < 0) throw new Error('교체 대상이 파티에 없습니다.')
  return String(index + 1) as '1' | '2' | '3'
}

export function insertInput(
  rotation: Rotation,
  cycleId: CycleId,
  columnId: string,
  action: InputBlock,
): Rotation {
  return changeCycle(rotation, cycleId, (cycle) => {
    requireUniqueColumn(cycle, columnId, action.id)
    if (
      action.type !== 'input' ||
      action.skills.some((skill) => skill.stage < 0)
    )
      throw new Error('유효한 직접 입력만 삽입할 수 있습니다.')
    const ownerId = cycle.activeCharacterId
    const latestTransition = [...cycle.transitions]
      .reverse()
      .find((item) => item.fromId === ownerId || item.toId === ownerId)
    const outgoing =
      latestTransition?.fromId === ownerId ? latestTransition : undefined
    let index: number
    if (outgoing) {
      const outroIndex = cycle.columns.findIndex(
        (column) =>
          column.action.type === 'autoAction' &&
          column.action.switchId === outgoing.switchId &&
          column.action.kind === 'outro',
      )
      index =
        outroIndex >= 0
          ? outroIndex
          : outgoing.afterColumnId === null
            ? 0
            : cycle.columns.findIndex(
                (column) => column.id === outgoing.afterColumnId,
              ) + 1
    } else {
      const lastOwned = cycle.columns
        .map((column) => column.ownerId)
        .lastIndexOf(ownerId)
      const arrivalBoundary =
        latestTransition?.toId === ownerId
          ? latestTransition.afterColumnId === null
            ? 0
            : cycle.columns.findIndex(
                (column) => column.id === latestTransition.afterColumnId,
              ) + 1
          : 0
      index =
        lastOwned < 0 && !latestTransition
          ? cycle.columns.length
          : Math.max(arrivalBoundary, lastOwned + 1)
    }
    const column: TimelineColumn = {
      id: columnId,
      ownerId,
      action: { ...action, skills: [...action.skills] },
    }
    const transitions = cycle.transitions.map((item) =>
      item === outgoing &&
      outgoing &&
      index ===
        (outgoing.afterColumnId === null
          ? 0
          : cycle.columns.findIndex(
              (candidate) => candidate.id === outgoing.afterColumnId,
            ) + 1)
        ? { ...item, afterColumnId: columnId }
        : item,
    )
    return {
      ...cycle,
      columns: [
        ...cycle.columns.slice(0, index),
        column,
        ...cycle.columns.slice(index),
      ],
      transitions,
    }
  })
}

export function reorderInput(
  rotation: Rotation,
  cycleId: CycleId,
  columnId: string,
  targetIndex: number,
): Rotation {
  return changeCycle(rotation, cycleId, (cycle) => {
    const index = cycle.columns.findIndex((column) => column.id === columnId)
    if (index < 0 || cycle.columns[index].action.type !== 'input')
      throw new Error('InputBlock만 이동할 수 있습니다.')
    if (
      !Number.isInteger(targetIndex) ||
      targetIndex < 0 ||
      targetIndex >= cycle.columns.length
    )
      throw new Error('이동 위치가 유효하지 않습니다.')
    if (index === targetIndex) return cycle
    const columns = [...cycle.columns]
    const [column] = columns.splice(index, 1)
    columns.splice(targetIndex, 0, column)
    const previousColumnId = cycle.columns[index - 1]?.id ?? null
    const transitions = cycle.transitions.map((item) =>
      item.afterColumnId === columnId
        ? { ...item, afterColumnId: previousColumnId }
        : item,
    )
    return { ...cycle, columns, transitions }
  })
}

export function deleteInput(
  rotation: Rotation,
  cycleId: CycleId,
  actionId: string,
): Rotation {
  return changeCycle(rotation, cycleId, (cycle) => {
    const found = cycle.columns.find((column) => column.action.id === actionId)
    if (!found || found.action.type !== 'input')
      throw new Error('삭제할 InputBlock이 없습니다.')
    const columns = cycle.columns.filter((column) => column !== found)
    return {
      ...cycle,
      columns,
      transitions: reanchorTransitions(
        cycle.columns,
        columns,
        cycle.transitions,
      ),
    }
  })
}

export interface SwitchCommand {
  switchId: string
  kind: 'normal' | 'concerto'
  toId: CharacterId
  /** 사람이 검수한 공명자 데이터의 Skill ID를 명시적으로 전달한다. */
  normalSwitchAttack?: { columnId: string; actionId: string; skillRef: string }
  outro?: { columnId: string; actionId: string; skillRef: string }
  intro?: { columnId: string; actionId: string; skillRef: string }
}

export function createSwitch(
  rotation: Rotation,
  cycleId: CycleId,
  command: SwitchCommand,
): Rotation {
  if (!rotation.party.includes(command.toId))
    throw new Error('교체 대상이 파티에 없습니다.')
  return changeCycle(rotation, cycleId, (cycle) => {
    if (
      !command.switchId ||
      cycle.transitions.some((item) => item.switchId === command.switchId)
    )
      throw new Error('교체 ID가 중복되었습니다.')
    if (cycle.activeCharacterId === command.toId)
      throw new Error('동일한 공명자로 교체할 수 없습니다.')
    const specs =
      command.kind === 'normal'
        ? [
            {
              kind: 'normalSwitchAttack' as const,
              ref: command.normalSwitchAttack,
              ownerId: command.toId,
            },
          ]
        : [
            {
              kind: 'outro' as const,
              ref: command.outro,
              ownerId: cycle.activeCharacterId,
            },
            {
              kind: 'intro' as const,
              ref: command.intro,
              ownerId: command.toId,
            },
          ]
    const columns = [...cycle.columns]
    for (const spec of specs) {
      if (!spec.ref?.skillRef)
        throw new Error('검수된 자동 행동 Skill 참조가 필요합니다.')
      requireUniqueColumn(
        { ...cycle, columns },
        spec.ref.columnId,
        spec.ref.actionId,
      )
      columns.push({
        id: spec.ref.columnId,
        ownerId: spec.ownerId,
        action: {
          type: 'autoAction',
          id: spec.ref.actionId,
          kind: spec.kind,
          skillRef: spec.ref.skillRef,
          switchId: command.switchId,
        },
      })
    }
    const anchor =
      command.kind === 'concerto'
        ? specs[0].ref!.columnId
        : (cycle.columns.at(-1)?.id ?? null)
    return {
      ...cycle,
      activeCharacterId: command.toId,
      columns,
      transitions: [
        ...cycle.transitions,
        {
          switchId: command.switchId,
          fromId: cycle.activeCharacterId,
          toId: command.toId,
          kind: command.kind,
          afterColumnId: anchor,
        },
      ],
    }
  })
}

export function deleteAutoAction(
  rotation: Rotation,
  cycleId: CycleId,
  actionId: string,
): Rotation {
  return changeCycle(rotation, cycleId, (cycle) => {
    const found = cycle.columns.find((column) => column.action.id === actionId)
    if (!found || found.action.type !== 'autoAction')
      throw new Error('삭제할 AutoAction이 없습니다.')
    const switchId = found.action.switchId
    const transition = cycle.transitions.find(
      (item) => item.switchId === switchId,
    )!
    const removed = cycle.columns.filter(
      (column) =>
        column.action.type === 'autoAction' &&
        column.action.switchId === switchId &&
        (transition.kind === 'concerto' || column.action.id === actionId),
    )
    const columns = cycle.columns.filter((column) => !removed.includes(column))
    return {
      ...cycle,
      columns,
      transitions: reanchorTransitions(
        cycle.columns,
        columns,
        cycle.transitions,
      ),
      suppression: cycle.suppression.some((item) => item.switchId === switchId)
        ? cycle.suppression
        : [
            ...cycle.suppression,
            {
              switchId,
              kind:
                transition.kind === 'concerto'
                  ? 'concertoPair'
                  : 'normalSwitchAttack',
            },
          ],
    }
  })
}

function updateInput(
  rotation: Rotation,
  cycleId: CycleId,
  actionId: string,
  update: (input: InputBlock) => InputBlock,
): Rotation {
  return changeCycle(rotation, cycleId, (cycle) => {
    const found = cycle.columns.find((column) => column.action.id === actionId)
    if (!found || found.action.type !== 'input')
      throw new Error('편집할 InputBlock이 없습니다.')
    return {
      ...cycle,
      columns: cycle.columns.map((column) =>
        column === found
          ? { ...column, action: update(found.action as InputBlock) }
          : column,
      ),
    }
  })
}

export function addSkill(
  rotation: Rotation,
  cycleId: CycleId,
  actionId: string,
  skill: SkillBlock,
  targetIndex?: number,
): Rotation {
  return updateInput(rotation, cycleId, actionId, (input) => {
    const count = input.skills.length
    if (
      targetIndex !== undefined &&
      (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex > count)
    )
      throw new Error('SkillBlock 삽입 위치가 유효하지 않습니다.')
    if (input.skills.some((item) => item.id === skill.id))
      throw new Error('SkillBlock ID가 중복되었습니다.')
    const index = count < 2 ? count : (targetIndex ?? count)
    const skills = [...input.skills]
    skills.splice(index, 0, { ...skill })
    return { ...input, skills }
  })
}

export function deleteSkill(
  rotation: Rotation,
  cycleId: CycleId,
  actionId: string,
  skillId: string,
): Rotation {
  return updateInput(rotation, cycleId, actionId, (input) => {
    if (!input.skills.some((skill) => skill.id === skillId))
      throw new Error('삭제할 SkillBlock이 없습니다.')
    return {
      ...input,
      skills: input.skills.filter((skill) => skill.id !== skillId),
    }
  })
}

export function reorderSkill(
  rotation: Rotation,
  cycleId: CycleId,
  actionId: string,
  skillId: string,
  targetIndex: number,
): Rotation {
  return updateInput(rotation, cycleId, actionId, (input) => {
    const currentIndex = input.skills.findIndex((skill) => skill.id === skillId)
    if (currentIndex < 0) throw new Error('이동할 SkillBlock이 없습니다.')
    if (
      !Number.isInteger(targetIndex) ||
      targetIndex < 0 ||
      targetIndex >= input.skills.length
    )
      throw new Error('SkillBlock 이동 위치가 유효하지 않습니다.')
    const skills = [...input.skills]
    const [skill] = skills.splice(currentIndex, 1)
    skills.splice(targetIndex, 0, skill)
    return { ...input, skills }
  })
}

export function changeSkillStage(
  rotation: Rotation,
  cycleId: CycleId,
  actionId: string,
  skillId: string,
  delta: number,
): Rotation {
  if (!Number.isInteger(delta))
    throw new Error('stage 변경량은 정수여야 합니다.')
  return updateInput(rotation, cycleId, actionId, (input) => {
    if (!input.skills.some((skill) => skill.id === skillId))
      throw new Error('stage를 변경할 SkillBlock이 없습니다.')
    return {
      ...input,
      skills: input.skills.map((skill) =>
        skill.id === skillId
          ? { ...skill, stage: Math.max(0, skill.stage + delta) }
          : skill,
      ),
    }
  })
}
