import { assertRotation, createRotation, type Rotation } from './rotation'

export interface ReferenceSnapshot {
  id: string
  displayName: string
  asset?: string
}
export interface ProjectReferences {
  characters: ReferenceSnapshot[]
  skills: ReferenceSnapshot[]
}
export interface RotationProject {
  app: 'wuwa-rotation-builder'
  schemaVersion: 1
  id: string
  name: string
  createdAt: string
  updatedAt: string
  rotation: Rotation
  references: ProjectReferences
}
export interface ReferenceCatalog {
  characters: readonly (ReferenceSnapshot & {
    skills: readonly ReferenceSnapshot[]
  })[]
}

/** 의미를 추론하지 않고 참조 ID의 표시 정보만 기록한다. */
export function captureReferences(
  rotation: Rotation,
  catalog: ReferenceCatalog,
  previous: ProjectReferences = { characters: [], skills: [] },
): ProjectReferences {
  const skillIds = new Set<string>()
  for (const cycle of [rotation.opening, rotation.repeat])
    for (const column of cycle.columns)
      if (column.action.type === 'input')
        column.action.skills.forEach((skill) => skillIds.add(skill.skillRef))
      else skillIds.add(column.action.skillRef)
  const minimal = (ref: ReferenceSnapshot): ReferenceSnapshot => ({
    id: ref.id,
    displayName: ref.displayName,
    ...(ref.asset ? { asset: ref.asset } : {}),
  })
  const skills = catalog.characters.flatMap((character) => character.skills)
  const select = (
    ids: Iterable<string>,
    current: readonly ReferenceSnapshot[],
    fallback: ReferenceSnapshot[],
  ) =>
    [...ids].flatMap((id) => {
      const ref =
        current.find((item) => item.id === id) ??
        fallback.find((item) => item.id === id)
      return ref ? [minimal(ref)] : []
    })
  return {
    characters: select(rotation.party, catalog.characters, previous.characters),
    skills: select(skillIds, skills, previous.skills),
  }
}

export function createProject(
  id: string,
  name: string,
  now: string,
  rotation: Rotation = createRotation(['slot-one', 'slot-two', 'slot-three']),
  references: ProjectReferences = { characters: [], skills: [] },
): RotationProject {
  const project: RotationProject = {
    app: 'wuwa-rotation-builder',
    schemaVersion: 1,
    id,
    name: name.trim(),
    createdAt: now,
    updatedAt: now,
    rotation: structuredClone(rotation),
    references: structuredClone(references),
  }
  return validateProject(project)
}

export function nextProjectName(projects: readonly RotationProject[]): string {
  let number = 1
  const names = new Set(projects.map((project) => project.name))
  while (names.has(`새 로테이션 ${number}`)) number++
  return `새 로테이션 ${number}`
}

export function duplicateProject(
  project: RotationProject,
  id: string,
  name: string,
  now: string,
) {
  return createProject(id, name, now, project.rotation, project.references)
}

/** 영속 레코드는 외부 데이터다. 실패 시 원본을 복구하거나 덮어쓰지 않는다. */
export function validateProject(value: unknown): RotationProject {
  try {
    const project = value as RotationProject
    if (
      !project ||
      project.app !== 'wuwa-rotation-builder' ||
      project.schemaVersion !== 1
    )
      throw new Error('지원하지 않는 프로젝트 형식입니다.')
    if (
      typeof project.id !== 'string' ||
      !project.id ||
      typeof project.name !== 'string' ||
      !project.name.trim()
    )
      throw new Error('프로젝트 ID 또는 이름이 유효하지 않습니다.')
    for (const date of [project.createdAt, project.updatedAt])
      if (typeof date !== 'string' || !Number.isFinite(Date.parse(date)))
        throw new Error('프로젝트 시각이 유효하지 않습니다.')
    if (Date.parse(project.updatedAt) < Date.parse(project.createdAt))
      throw new Error('수정 시각이 생성 시각보다 빠릅니다.')
    for (const refs of [
      project.references.characters,
      project.references.skills,
    ]) {
      if (!Array.isArray(refs))
        throw new Error('참조 snapshot이 유효하지 않습니다.')
      const ids = new Set<string>()
      for (const ref of refs) {
        if (
          !ref ||
          typeof ref.id !== 'string' ||
          !ref.id ||
          ids.has(ref.id) ||
          typeof ref.displayName !== 'string' ||
          !ref.displayName.trim() ||
          (ref.asset !== undefined &&
            (typeof ref.asset !== 'string' || ref.asset.startsWith('data:')))
        )
          throw new Error('참조 snapshot이 유효하지 않습니다.')
        ids.add(ref.id)
      }
    }
    const rotation = project.rotation
    if (
      !Array.isArray(rotation.party) ||
      rotation.party.some((id) => typeof id !== 'string')
    )
      throw new Error('파티 ID가 유효하지 않습니다.')
    for (const cycle of [rotation.opening, rotation.repeat]) {
      if (
        !cycle ||
        typeof cycle.activeCharacterId !== 'string' ||
        !Array.isArray(cycle.columns) ||
        !Array.isArray(cycle.transitions) ||
        !Array.isArray(cycle.suppression)
      )
        throw new Error('사이클 구조가 유효하지 않습니다.')
      for (const column of cycle.columns) {
        if (
          !column ||
          typeof column.id !== 'string' ||
          typeof column.ownerId !== 'string' ||
          !column.action ||
          typeof column.action.id !== 'string'
        )
          throw new Error('행동 ID가 유효하지 않습니다.')
        if (column.action.type === 'input') {
          if (!Array.isArray(column.action.skills))
            throw new Error('스킬 목록이 유효하지 않습니다.')
          for (const skill of column.action.skills)
            if (
              !skill ||
              typeof skill.id !== 'string' ||
              typeof skill.skillRef !== 'string'
            )
              throw new Error('스킬 ID가 유효하지 않습니다.')
        } else if (
          column.action.type === 'autoAction' &&
          (typeof column.action.skillRef !== 'string' ||
            typeof column.action.switchId !== 'string')
        )
          throw new Error('자동 행동 ID가 유효하지 않습니다.')
      }
      for (const transition of cycle.transitions)
        if (
          !transition ||
          typeof transition.switchId !== 'string' ||
          typeof transition.fromId !== 'string' ||
          typeof transition.toId !== 'string' ||
          (transition.afterColumnId !== null &&
            typeof transition.afterColumnId !== 'string')
        )
          throw new Error('교체 ID가 유효하지 않습니다.')
    }
    assertRotation(rotation)
    return project
  } catch (error) {
    throw new Error(
      `저장된 프로젝트를 읽을 수 없습니다: ${error instanceof Error ? error.message : '손상된 데이터'}`,
    )
  }
}
