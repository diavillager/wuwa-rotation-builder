import { afterEach, describe, expect, it, vi } from 'vitest'
import { ProjectStore } from './project-store'
import { demoCatalog, createInputDemoRotation } from './demo'
import { addSkill, insertInput, type Rotation } from '../domain/rotation'
import { type RotationProject } from '../domain/project'
import { type ProjectRepository } from '../storage/project-repository'

function memoryRepository(): ProjectRepository {
  const projects = new Map<string, RotationProject>()
  let selected: string | null = null
  return {
    list: async () => structuredClone([...projects.values()]),
    put: async (project) => {
      projects.set(project.id, structuredClone(project))
    },
    delete: async (id) => {
      projects.delete(id)
    },
    deleteAndSelect: async (id, selectedId, replacement) => {
      projects.delete(id)
      if (replacement)
        projects.set(replacement.id, structuredClone(replacement))
      selected = selectedId
    },
    selectedId: async () => selected,
    select: async (id) => {
      selected = id
    },
  }
}
function setup(repo = memoryRepository()) {
  let counter = 0
  const store = new ProjectStore(
    repo,
    demoCatalog,
    createInputDemoRotation,
    () => `project-${++counter}`,
    () => '2026-10-01T03:00:00.000Z',
  )
  return { store, repo }
}
function input(rotation: Rotation, id = 'first') {
  return insertInput(rotation, 'opening', `column-${id}`, {
    id,
    type: 'input',
    input: 'E',
    gesture: 'tap',
    skills: [],
  })
}
afterEach(() => vi.useRealTimers())

describe('프로젝트 자동저장과 관리', () => {
  it('새로고침 시 마지막 프로젝트·독립 내용·최소 snapshot을 복원한다', async () => {
    vi.useFakeTimers()
    const { store, repo } = setup()
    await store.initialize()
    expect(store.snapshot().current).toBeNull()
    await store.create()
    const original = store.snapshot().current!
    store.updateRotation(
      addSkill(input(original.rotation), 'opening', 'first', {
        id: 'skill',
        skillRef: 'demo-basic',
        stage: 2,
      }),
    )
    expect(store.snapshot().status).toBe('dirty')
    await vi.advanceTimersByTimeAsync(300)
    expect(store.snapshot().status).toBe('saved')
    const reopened = setup(repo).store
    await reopened.initialize()
    expect(reopened.snapshot().current).toEqual(store.snapshot().current)
    expect(reopened.snapshot().current!.rotation.opening.columns).toHaveLength(
      1,
    )
    expect(reopened.snapshot().current!.rotation.repeat.columns).toEqual([])
    expect(reopened.snapshot().current!.references.characters).toHaveLength(3)
    store.dispose()
    reopened.dispose()
  })
  it('저장 중 추가 편집을 오래된 응답으로 덮어쓰지 않고 최신 내용까지 저장한다', async () => {
    vi.useFakeTimers()
    const { store, repo } = setup()
    await store.initialize()
    await store.create()
    const actualPut = repo.put
    let finish!: () => void
    let calls = 0
    repo.put = async (project) => {
      if (++calls === 1)
        await new Promise<void>((resolve) => {
          finish = resolve
        })
      await actualPut(project)
    }
    store.updateRotation(input(store.snapshot().current!.rotation))
    await vi.advanceTimersByTimeAsync(300)
    expect(store.snapshot().status).toBe('saving')
    const latest = input(store.snapshot().current!.rotation, 'second')
    store.updateRotation(latest)
    await vi.advanceTimersByTimeAsync(300)
    finish()
    await store.retry()
    expect(store.snapshot().current!.rotation).toBe(latest)
    expect((await repo.list())[0].rotation).toEqual(latest)
    expect(store.snapshot().status).toBe('saved')
    store.dispose()
  })
  it('저장 실패는 편집을 보존하고 전환·삭제를 막으며 재시도 후 전환한다', async () => {
    const { store, repo } = setup()
    await store.initialize()
    await store.create()
    const firstId = store.snapshot().current!.id
    await store.create()
    const current = store.snapshot().current!
    const latest = input(current.rotation)
    const actualPut = repo.put
    repo.put = async () => {
      throw new Error('저장 공간 부족')
    }
    store.updateRotation(latest)
    await store.open(firstId)
    expect(store.snapshot().current!.rotation).toBe(latest)
    expect(store.snapshot().current!.id).toBe(current.id)
    expect(store.snapshot().error).toBe('저장 공간 부족')
    await store.deleteCurrent()
    expect(await repo.list()).toHaveLength(2)
    repo.put = actualPut
    await store.retry()
    expect(store.snapshot().status).toBe('saved')
    await store.open(firstId)
    expect(store.snapshot().current!.id).toBe(firstId)
    store.dispose()
  })
  it('복제·이름 변경을 저장하고 다시 열면 새 편집 세션으로 시작한다', async () => {
    const { store, repo } = setup()
    await store.initialize()
    await store.create()
    const firstId = store.snapshot().current!.id
    store.updateRotation(input(store.snapshot().current!.rotation))
    await store.duplicate()
    const copy = store.snapshot().current!
    expect(copy.id).not.toBe(firstId)
    expect(copy.name).toBe('새 로테이션 1 - 복제본')
    expect(copy.rotation.opening.columns).toHaveLength(1)
    const generation = store.snapshot().generation
    await store.rename('이름 변경')
    expect(store.snapshot().generation).toBe(generation)
    expect((await repo.list()).find((item) => item.id === copy.id)!.name).toBe(
      '이름 변경',
    )
    await store.open(firstId)
    expect(store.snapshot().generation).toBe(generation + 1)
    await store.open(copy.id)
    expect(store.snapshot().generation).toBe(generation + 2)
    expect(store.snapshot().current!.name).toBe('이름 변경')
    store.dispose()
  })
  it('복제는 즉시 원본의 현재 이름에 표시를 덧붙이고 같은 이름도 허용한다', async () => {
    const { store, repo } = setup()
    await store.initialize()
    await store.create()
    await store.rename('로테이션 3')
    const originalId = store.snapshot().current!.id
    await store.duplicate()
    expect(store.snapshot().current!.name).toBe('로테이션 3 - 복제본')
    await store.duplicate()
    expect(store.snapshot().current!.name).toBe('로테이션 3 - 복제본 - 복제본')
    await store.rename('이름을 바꾼 원본')
    await store.duplicate()
    expect(store.snapshot().current!.name).toBe('이름을 바꾼 원본 - 복제본')
    await store.open(originalId)
    await store.duplicate()
    expect(store.snapshot().current!.name).toBe('로테이션 3 - 복제본')
    const projects = await repo.list()
    expect(
      projects.filter((project) => project.name === '로테이션 3 - 복제본'),
    ).toHaveLength(2)
    expect(projects.find((project) => project.id === originalId)!.name).toBe(
      '로테이션 3',
    )
    expect(new Set(projects.map((project) => project.id)).size).toBe(
      projects.length,
    )
    store.dispose()
  })
  it('마지막 프로젝트 삭제 후 독립 새 프로젝트를 생성하고 다음 시작에서 복원한다', async () => {
    const { store, repo } = setup()
    await store.initialize()
    await store.create()
    const deletedId = store.snapshot().current!.id
    store.updateRotation(input(store.snapshot().current!.rotation))
    await store.deleteCurrent()
    const replacement = store.snapshot().current!
    expect(replacement.id).not.toBe(deletedId)
    expect(replacement.rotation.opening.columns).toEqual([])
    expect(await repo.list()).toEqual([replacement])
    expect(await repo.selectedId()).toBe(replacement.id)
    const next = setup(repo).store
    await next.initialize()
    expect(next.snapshot().projects).toEqual([replacement])
    expect(next.snapshot().current).toEqual(replacement)
    store.dispose()
    next.dispose()
  })
  it('중간 항목 삭제는 바로 위를 선택하고 첫 항목 삭제는 바로 아래를 선택한다', async () => {
    const { store, repo } = setup()
    await store.initialize()
    await store.create()
    const first = store.snapshot().current!
    await store.create()
    const second = store.snapshot().current!
    await store.create()
    const third = store.snapshot().current!
    await store.open(second.id)
    await store.deleteCurrent()
    expect(store.snapshot().current!.id).toBe(first.id)
    expect(await repo.selectedId()).toBe(first.id)
    expect(store.snapshot().projects.map((p) => p.id)).toEqual([
      first.id,
      third.id,
    ])
    await store.deleteCurrent()
    expect(store.snapshot().current!.id).toBe(third.id)
    expect(await repo.selectedId()).toBe(third.id)
    store.dispose()
  })
  it('삭제와 대체 생성의 실패는 현재 내용과 선택을 보존한다', async () => {
    const { store, repo } = setup()
    await store.initialize()
    await store.create()
    const current = store.snapshot().current!
    vi.spyOn(repo, 'deleteAndSelect').mockRejectedValue(new Error('삭제 실패'))
    await store.deleteCurrent()
    expect(store.snapshot().current).toBe(current)
    expect(store.snapshot().error).toBe('삭제 실패')
    expect(await repo.list()).toEqual([current])
    expect(await repo.selectedId()).toBe(current.id)
    store.dispose()
  })
  it('읽기 실패 시 새 데이터로 덮어쓰지 않고 재시도로 복구한다', async () => {
    const repo = memoryRepository()
    const list = repo.list
    repo.list = async () => {
      throw new Error('읽기 실패')
    }
    const { store } = setup(repo)
    const put = vi.spyOn(repo, 'put')
    await store.initialize()
    expect(store.snapshot().status).toBe('error')
    expect(put).not.toHaveBeenCalled()
    repo.list = list
    await store.retry()
    expect(store.snapshot().status).toBe('saved')
    store.dispose()
  })
})
