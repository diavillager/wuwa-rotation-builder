import { IDBFactory, IDBObjectStore } from 'fake-indexeddb'
import { describe, expect, it, vi } from 'vitest'
import { createProject } from '../domain/project'
import { createDemoRotation } from '../app/demo'
import {
  deleteAutoAction,
  deleteSwitchForAutoAction,
  reorderParty,
} from '../domain/rotation'
import {
  IndexedDbProjectRepository,
  ProjectWriteQueue,
  type ProjectRepository,
} from './project-repository'

const project = () =>
  createProject('id', '저장 테스트', '2026-10-01T03:00:00.000Z')
describe('IndexedDB 프로젝트 Repository', () => {
  it('삭제·대체 저장·선택 변경을 하나의 transaction으로 처리하고 실패 시 되돌린다', async () => {
    const repo = new IndexedDbProjectRepository(
      'atomic-delete',
      new IDBFactory(),
    )
    const original = project()
    const replacement = { ...original, id: 'replacement', name: '새 프로젝트' }
    await repo.put(original)
    await repo.select(original.id)
    const actualPut = IDBObjectStore.prototype.put
    const put = vi
      .spyOn(IDBObjectStore.prototype, 'put')
      .mockImplementation(function (this: IDBObjectStore, value, key) {
        if (this.name === 'metadata') throw new Error('선택 기록 실패')
        return actualPut.call(this, value, key)
      })
    await expect(
      repo.deleteAndSelect(original.id, replacement.id, replacement),
    ).rejects.toThrow('선택 기록 실패')
    put.mockRestore()
    expect(await repo.list()).toEqual([original])
    expect(await repo.selectedId()).toBe(original.id)
    await repo.deleteAndSelect(original.id, replacement.id, replacement)
    expect(await repo.list()).toEqual([replacement])
    expect(await repo.selectedId()).toBe(replacement.id)
  })
  it.each([
    ['과거 suppression 보존', deleteAutoAction, 1],
    ['교체 카드와 Transition 함께 삭제', deleteSwitchForAutoAction, 0],
  ] as const)(
    '%s 상태의 파티 순서·Shared Timeline·stage를 그대로 복원한다',
    async (_label, remove, remaining) => {
      let rotation = createDemoRotation()
      const auto = rotation.opening.columns.find(
        (column) => column.action.type === 'autoAction',
      )!
      rotation = remove(rotation, 'opening', auto.action.id)
      rotation = reorderParty(rotation, ['demo-c', 'demo-a', 'demo-b'])
      const data = createProject(
        'complex',
        '복원 검증',
        '2026-10-01T03:00:00.000Z',
        rotation,
      )
      const factory = new IDBFactory()
      await new IndexedDbProjectRepository('complex', factory).put(data)
      const restored = (
        await new IndexedDbProjectRepository('complex', factory).list()
      )[0]
      expect(restored).toEqual(data)
      expect(restored.rotation.opening.suppression).toHaveLength(remaining)
      expect(restored.rotation.opening.transitions).toHaveLength(remaining)
      expect(
        restored.rotation.opening.columns.some(
          (column) => column.action.id === auto.action.id,
        ),
      ).toBe(false)
    },
  )
  it('완료된 transaction으로 CRUD하고 다른 인스턴스에서 다시 읽는다', async () => {
    const factory = new IDBFactory()
    const repo = new IndexedDbProjectRepository('test', factory)
    expect(await repo.list()).toEqual([])
    await repo.put(project())
    const reopened = new IndexedDbProjectRepository('test', factory)
    expect(await reopened.list()).toEqual([project()])
    await reopened.put({ ...project(), name: '새 이름' })
    expect((await repo.list())[0].name).toBe('새 이름')
    await repo.delete('id')
    expect(await repo.list()).toEqual([])
  })
  it('사용 불가능한 DB와 실패한 검증은 성공으로 알리지 않는다', async () => {
    await expect(
      new IndexedDbProjectRepository('unavailable', undefined).list(),
    ).rejects.toThrow()
    const repo = new IndexedDbProjectRepository('test', new IDBFactory())
    await repo.put(project())
    await expect(repo.put({ ...project(), name: '' })).rejects.toThrow()
    expect(await repo.list()).toEqual([project()])
  })
  it('손상된 기존 레코드를 조용히 누락하거나 덮어쓰지 않는다', async () => {
    const factory = new IDBFactory()
    const repo = new IndexedDbProjectRepository('test', factory)
    await repo.put(project())
    await new Promise<void>((resolve, reject) => {
      const request = factory.open('test', 1)
      request.onsuccess = () => {
        const db = request.result
        const tx = db.transaction('projects', 'readwrite')
        tx.objectStore('projects').put({ ...project(), schemaVersion: 99 })
        tx.oncomplete = () => {
          db.close()
          resolve()
        }
        tx.onabort = () => {
          db.close()
          reject(tx.error)
        }
      }
    })
    await expect(repo.list()).rejects.toThrow('지원하지 않는 프로젝트 형식')
    await expect(repo.list()).rejects.toThrow('지원하지 않는 프로젝트 형식')
  })
  it('쓰기 순서를 보장하고 저장 실패 이후의 재시도와 삭제를 실행한다', async () => {
    let finish!: () => void
    const seen: string[] = []
    const repo: ProjectRepository = {
      list: async () => [],
      selectedId: async () => null,
      select: async () => {},
      deleteAndSelect: async () => {},
      put: vi.fn(async (value) => {
        seen.push(value.name)
        if (value.name === '첫 저장')
          await new Promise<void>((resolve) => {
            finish = resolve
          })
        if (value.name === '실패') throw new Error('저장 실패')
      }),
      delete: async (id) => {
        seen.push(`삭제 ${id}`)
      },
    }
    const queue = new ProjectWriteQueue(repo)
    const first = queue.put({ ...project(), name: '첫 저장' })
    const latest = { ...project(), name: '두 번째 저장' }
    const second = queue.put(latest)
    latest.name = '후속 편집'
    await Promise.resolve()
    expect(seen).toEqual(['첫 저장'])
    finish()
    await Promise.all([first, second])
    await expect(queue.put({ ...project(), name: '실패' })).rejects.toThrow(
      '저장 실패',
    )
    await queue.put({ ...project(), name: '재시도' })
    await queue.delete('id')
    expect(seen).toEqual([
      '첫 저장',
      '두 번째 저장',
      '실패',
      '재시도',
      '삭제 id',
    ])
  })
})
