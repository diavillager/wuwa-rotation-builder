import { validateProject, type RotationProject } from '../domain/project'

export interface ProjectRepository {
  list(): Promise<RotationProject[]>
  put(project: RotationProject): Promise<void>
  delete(id: string): Promise<void>
  deleteAndSelect(
    id: string,
    selectedId: string,
    replacement?: RotationProject,
  ): Promise<void>
  selectedId(): Promise<string | null>
  select(id: string | null): Promise<void>
}

/** DB 구현은 UI와 분리하며 transaction 완료 전에 성공을 알리지 않는다. */
export class IndexedDbProjectRepository implements ProjectRepository {
  constructor(
    private readonly databaseName = 'wuwa-rotation-builder',
    private readonly factory: IDBFactory | undefined = globalThis.indexedDB,
  ) {}

  private open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (!this.factory) {
        reject(new Error('이 환경에서 IndexedDB를 사용할 수 없습니다.'))
        return
      }
      const request = this.factory.open(this.databaseName, 1)
      let blocked = false
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('projects'))
          request.result.createObjectStore('projects', { keyPath: 'id' })
        if (!request.result.objectStoreNames.contains('metadata'))
          request.result.createObjectStore('metadata')
      }
      request.onblocked = () => {
        blocked = true
        reject(
          new Error(
            '다른 창이 저장소 갱신을 막고 있습니다. 다른 창을 닫은 뒤 재시도해 주세요.',
          ),
        )
      }
      request.onerror = () =>
        reject(request.error ?? new Error('저장소를 열 수 없습니다.'))
      request.onsuccess = () => {
        if (blocked) {
          request.result.close()
          return
        }
        request.result.onversionchange = () => request.result.close()
        resolve(request.result)
      }
    })
  }

  private async transaction<T>(
    mode: IDBTransactionMode,
    command: (store: IDBObjectStore) => IDBRequest<T>,
    storeName = 'projects',
  ): Promise<T> {
    const database = await this.open()
    return new Promise((resolve, reject) => {
      let transaction: IDBTransaction
      try {
        transaction = database.transaction(storeName, mode)
      } catch (error) {
        database.close()
        reject(error)
        return
      }
      let result: T
      transaction.oncomplete = () => {
        database.close()
        resolve(result)
      }
      transaction.onabort = () => {
        database.close()
        reject(transaction.error ?? new Error('저장 작업이 취소되었습니다.'))
      }
      try {
        const request = command(transaction.objectStore(storeName))
        request.onsuccess = () => {
          result = request.result
        }
      } catch (error) {
        transaction.abort()
        reject(error)
      }
    })
  }

  async list(): Promise<RotationProject[]> {
    const records = await this.transaction('readonly', (store) =>
      store.getAll(),
    )
    return records
      .map(validateProject)
      .sort(
        (a, b) =>
          a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id),
      )
  }

  async put(project: RotationProject): Promise<void> {
    // 이후 편집이 저장 대기 중인 데이터를 바꾸지 않도록 복사한다.
    const snapshot = structuredClone(validateProject(project))
    await this.transaction('readwrite', (store) => store.put(snapshot))
  }

  async delete(id: string): Promise<void> {
    await this.transaction('readwrite', (store) => store.delete(id))
  }

  /** 삭제·마지막 항목의 대체 생성·선택 기록은 모두 성공하거나 모두 취소된다. */
  async deleteAndSelect(
    id: string,
    selectedId: string,
    replacement?: RotationProject,
  ): Promise<void> {
    const snapshot = replacement
      ? structuredClone(validateProject(replacement))
      : undefined
    const database = await this.open()
    return new Promise((resolve, reject) => {
      let transaction: IDBTransaction
      try {
        transaction = database.transaction(
          ['projects', 'metadata'],
          'readwrite',
        )
      } catch (error) {
        database.close()
        reject(error)
        return
      }
      transaction.oncomplete = () => {
        database.close()
        resolve()
      }
      transaction.onabort = () => {
        database.close()
        reject(
          transaction.error ??
            new Error('프로젝트 삭제와 전환이 취소되었습니다.'),
        )
      }
      try {
        const projects = transaction.objectStore('projects')
        projects.delete(id)
        if (snapshot) projects.put(snapshot)
        transaction.objectStore('metadata').put(selectedId, 'selectedId')
      } catch (error) {
        transaction.abort()
        reject(error)
      }
    })
  }

  async selectedId(): Promise<string | null> {
    const id: unknown = await this.transaction(
      'readonly',
      (store) => store.get('selectedId'),
      'metadata',
    )
    return typeof id === 'string' ? id : null
  }

  async select(id: string | null): Promise<void> {
    await this.transaction(
      'readwrite',
      (store) => store.put(id, 'selectedId'),
      'metadata',
    )
  }
}

/** 같은 탭의 쓰기 순서를 보장하고 실패 후에도 재시도를 받는다. */
export class ProjectWriteQueue {
  private tail: Promise<unknown> = Promise.resolve()
  constructor(private readonly repository: ProjectRepository) {}
  put(project: RotationProject): Promise<void> {
    const snapshot = structuredClone(project)
    return this.enqueue(() => this.repository.put(snapshot))
  }
  delete(id: string): Promise<void> {
    return this.enqueue(() => this.repository.delete(id))
  }
  deleteAndSelect(
    id: string,
    selectedId: string,
    replacement?: RotationProject,
  ): Promise<void> {
    return this.enqueue(() =>
      this.repository.deleteAndSelect(id, selectedId, replacement),
    )
  }
  private enqueue(command: () => Promise<void>): Promise<void> {
    const next = this.tail.then(command)
    this.tail = next.catch(() => {})
    return next
  }
}
