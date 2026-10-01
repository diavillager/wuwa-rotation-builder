import {
  captureReferences,
  createProject,
  duplicateProject,
  nextProjectName,
  type ReferenceCatalog,
  type RotationProject,
} from '../domain/project'
import { createRotation, type Rotation } from '../domain/rotation'
import {
  ProjectWriteQueue,
  type ProjectRepository,
} from '../storage/project-repository'

export interface ProjectWorkspaceState {
  projects: RotationProject[]
  current: RotationProject | null
  generation: number
  loading: boolean
  busy: boolean
  status: 'saved' | 'dirty' | 'saving' | 'error'
  error: string
}

/** 저장 응답은 편집 상태를 덮어쓰지 않고 최신 상태의 성공만 저장 완료로 알린다. */
export class ProjectStore {
  private state: ProjectWorkspaceState = {
    projects: [],
    current: null,
    generation: 0,
    loading: true,
    busy: false,
    status: 'saved',
    error: '',
  }
  private listeners = new Set<() => void>()
  private writes: ProjectWriteQueue
  private timer: ReturnType<typeof setTimeout> | undefined
  private saved: RotationProject | null = null
  private disposed = false
  private initialization: Promise<void> | undefined

  constructor(
    private readonly repository: ProjectRepository,
    private readonly catalog: ReferenceCatalog,
    private readonly initialRotation = () =>
      createRotation(['slot-one', 'slot-two', 'slot-three']),
    private readonly id: () => string = () => crypto.randomUUID(),
    private readonly now = () => new Date().toISOString(),
  ) {
    this.writes = new ProjectWriteQueue(repository)
  }

  snapshot = () => this.state
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }
  private publish(patch: Partial<ProjectWorkspaceState>) {
    if (this.disposed) return
    this.state = { ...this.state, ...patch }
    this.listeners.forEach((listener) => listener())
  }
  initialize(): Promise<void> {
    if (!this.initialization) this.initialization = this.load()
    return this.initialization
  }
  private async load() {
    this.publish({ loading: true, error: '' })
    try {
      const projects = await this.repository.list()
      const selected = await this.repository.selectedId()
      const current =
        projects.find((project) => project.id === selected) ?? null
      this.saved = current
      this.publish({
        projects,
        current,
        generation: this.state.generation + 1,
        status: 'saved',
      })
    } catch (error) {
      this.fail(error)
    } finally {
      this.publish({ loading: false })
    }
  }
  private fail(error: unknown) {
    this.publish({
      status: 'error',
      error: error instanceof Error ? error.message : '저장에 실패했습니다.',
    })
  }
  private cancelTimer() {
    if (this.timer !== undefined) clearTimeout(this.timer)
    this.timer = undefined
  }
  updateRotation = (rotation: Rotation) => {
    const current = this.state.current
    if (
      !current ||
      this.state.loading ||
      this.state.busy ||
      current.rotation === rotation
    )
      return
    const now = this.now()
    const updatedAt =
      Date.parse(now) >= Date.parse(current.updatedAt) ? now : current.updatedAt
    const next = {
      ...current,
      rotation,
      updatedAt,
      references: captureReferences(rotation, this.catalog, current.references),
    }
    this.publish({ current: next, status: 'dirty' })
    this.cancelTimer()
    this.timer = setTimeout(() => {
      this.timer = undefined
      void this.save().catch(() => {})
    }, 300)
  }
  private async save(): Promise<void> {
    this.cancelTimer()
    const snapshot = this.state.current
    if (!snapshot || snapshot === this.saved) return
    this.publish({ status: 'saving' })
    try {
      await this.writes.put(snapshot)
      this.saved = snapshot
      this.publish({
        projects: this.state.projects.map((project) =>
          project.id === snapshot.id ? snapshot : project,
        ),
      })
      if (this.state.current === snapshot)
        this.publish({ status: 'saved', error: '' })
    } catch (error) {
      this.fail(error)
      throw error
    }
  }
  retry = async () => {
    if (this.state.loading || this.state.busy) return
    if (!this.state.current && this.state.error) {
      this.initialization = undefined
      await this.initialize()
      return
    }
    await this.perform(async () => {
      await this.repository.select(this.state.current?.id ?? null)
      this.publish({ status: 'saved', error: '' })
    })
  }
  private async perform(action: () => Promise<void>) {
    if (this.state.loading || this.state.busy) return
    this.publish({ busy: true })
    try {
      await this.save()
      await action()
    } catch (error) {
      this.fail(error)
    } finally {
      this.publish({ busy: false })
    }
  }
  open = async (id: string) =>
    this.perform(async () => {
      const project = this.state.projects.find((item) => item.id === id)
      if (!project || project.id === this.state.current?.id) return
      await this.repository.select(id)
      this.saved = project
      this.publish({
        current: project,
        generation: this.state.generation + 1,
        status: 'saved',
        error: '',
      })
    })
  create = async () =>
    this.perform(async () => {
      const rotation = this.initialRotation()
      const project = createProject(
        this.id(),
        nextProjectName(this.state.projects),
        this.now(),
        rotation,
        captureReferences(rotation, this.catalog),
      )
      await this.addAndOpen(project)
    })
  duplicate = async () =>
    this.perform(async () => {
      const current = this.state.current
      if (!current) return
      const project = duplicateProject(
        current,
        this.id(),
        `${current.name} - 복제본`,
        this.now(),
      )
      await this.addAndOpen(project)
    })
  private async addAndOpen(project: RotationProject) {
    await this.writes.put(project)
    // 저장된 프로젝트는 마지막 선택 기록이 실패해도 목록에 남긴다.
    this.publish({ projects: [...this.state.projects, project] })
    await this.repository.select(project.id)
    this.saved = project
    this.publish({
      current: project,
      generation: this.state.generation + 1,
      status: 'saved',
      error: '',
    })
  }
  rename = async (name: string) =>
    this.perform(async () => {
      const current = this.state.current
      if (!current) return
      const trimmed = name.trim()
      if (!trimmed) throw new Error('프로젝트 이름을 입력해 주세요.')
      if (trimmed === current.name) return
      const now = this.now()
      const next = {
        ...current,
        name: trimmed,
        updatedAt:
          Date.parse(now) >= Date.parse(current.updatedAt)
            ? now
            : current.updatedAt,
      }
      await this.writes.put(next)
      this.saved = next
      this.publish({
        current: next,
        projects: this.state.projects.map((project) =>
          project.id === next.id ? next : project,
        ),
        status: 'saved',
        error: '',
      })
    })
  deleteCurrent = async () =>
    this.perform(async () => {
      const current = this.state.current
      if (!current) return
      await this.writes.delete(current.id)
      this.saved = null
      this.publish({
        current: null,
        projects: this.state.projects.filter(
          (project) => project.id !== current.id,
        ),
        generation: this.state.generation + 1,
        status: 'saved',
        error: '',
      })
      await this.repository.select(null)
    })
  dispose() {
    this.cancelTimer()
    this.disposed = true
    this.listeners.clear()
  }
  pauseAutosave() {
    this.cancelTimer()
  }
}
