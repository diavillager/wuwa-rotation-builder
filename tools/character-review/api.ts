import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomBytes } from 'node:crypto'
import { errorMessage, decodeWebP } from '../../scripts/character-sync/io'
import { object } from '../../scripts/character-sync/candidates'
import { snapshotKey } from './snapshot'
import { ReviewRepository } from './repository'
import type { ReviewState } from './model'
import { listTargets, assertWorkspaceTarget } from './workspace'
import type { ReviewExport } from './repository'

const ORIGIN = 'http://127.0.0.1:5174'
export function reviewApi(root: string) {
  const token = randomBytes(32).toString('hex')
  const repository = new ReviewRepository(root)
  let importedTargets = new Set<string>()
  const assertAllowed = async (target: {
    runId: string
    characterId: string
  }) => {
    if (!importedTargets.has(snapshotKey(target)))
      await assertWorkspaceTarget(root, target)
  }
  return async (
    request: IncomingMessage,
    response: ServerResponse,
    next: () => void,
  ) => {
    if (!request.url?.startsWith('/api/review/')) return next()
    const json = (status: number, value: unknown) => {
      response.writeHead(status, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
      })
      response.end(JSON.stringify(value))
    }
    if (
      request.headers.host !== '127.0.0.1:5174' ||
      (request.headers.origin && request.headers.origin !== ORIGIN) ||
      request.headers['sec-fetch-site'] === 'cross-site'
    )
      return json(403, { error: '로컬 검수 화면에서만 접근할 수 있습니다.' })
    try {
      const url = new URL(request.url, ORIGIN)
      if (request.method === 'GET') {
        if (url.pathname === '/api/review/session') return json(200, { token })
        if (url.pathname === '/api/review/targets')
          return json(200, await listTargets(root))
        const target = {
          runId: url.searchParams.get('runId') ?? '',
          characterId: url.searchParams.get('characterId') ?? '',
        }
        await assertAllowed(target)
        if (url.pathname === '/api/review/load')
          return json(200, await repository.load(target))
        if (url.pathname === '/api/review/image') {
          const source = await repository.source(target)
          const candidate = url.searchParams.get('candidateId')
          const bytes = await repository.image(
            source,
            candidate
              ? `candidate:${candidate}`
              : `current:${url.searchParams.get('asset') ?? ''}`,
          )
          await decodeWebP(bytes)
          response.writeHead(200, {
            'Content-Type': 'image/webp',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
          })
          response.end(bytes)
          return
        }
      } else if (request.method === 'POST') {
        if (
          request.headers.origin !== ORIGIN ||
          request.headers['x-review-token'] !== token ||
          !request.headers['content-type']?.startsWith('application/json')
        )
          return json(403, {
            error:
              '검수 요청 출처를 확인할 수 없습니다. 화면을 새로고침해 주세요.',
          })
        const chunks: Buffer[] = []
        let size = 0
        for await (const chunk of request) {
          size += chunk.length
          if (
            size >
            (url.pathname === '/api/review/import' ? 64 : 2) * 1024 * 1024
          )
            return json(413, { error: '검수 요청이 너무 큽니다.' })
          chunks.push(Buffer.from(chunk))
        }
        const body = object(JSON.parse(Buffer.concat(chunks).toString('utf8')))
        if (url.pathname === '/api/review/import') {
          const sessions = await repository.importFile(body.file)
          importedTargets = new Set(sessions.map((s) => snapshotKey(s.state)))
          return json(200, { sessions })
        }
        if (
          ![
            '/api/review/validate',
            '/api/review/export',
            '/api/review/backup',
          ].includes(url.pathname)
        )
          return json(404, { error: '지원하지 않는 검수 요청입니다.' })
        if (
          !Array.isArray(body.states) ||
          !body.states.length ||
          body.states.length > 200
        )
          throw new Error('검수할 공명자 목록이 필요합니다.')
        const states = body.states.map(
          (value) => object(value) as unknown as ReviewState,
        )
        if (new Set(states.map((s) => s.characterId)).size !== states.length)
          throw new Error('중복 공명자입니다.')
        for (const state of states) await assertAllowed(state)
        if (url.pathname === '/api/review/backup') {
          const characters = []
          for (const state of states)
            characters.push(await repository.backupCharacter(state))
          return json(200, {
            file: {
              format: 'wuwa-character-review-backup',
              schemaVersion: 2,
              characters,
            },
          })
        }
        const results = []
        const characters: ReviewExport['characters'] = []
        for (const state of states) {
          const checked = await repository.validate(state)
          results.push({
            characterId: state.characterId,
            displayName: state.displayName,
            ...checked,
          })
          if (url.pathname === '/api/review/export' && !checked.errors.length)
            characters.push(await repository.exportCharacter(state))
        }
        if (url.pathname === '/api/review/validate')
          return json(200, { results })
        if (!characters.length)
          throw new Error(
            '검증을 통과한 공명자가 없습니다. 누락 항목을 확인해 주세요.',
          )
        // 모든 선택 대상의 원본/DB 기준을 마지막에 다시 확인한다.
        for (const character of characters)
          await repository.exportCharacter(character.review)
        const file: ReviewExport = {
          format: 'wuwa-character-review',
          schemaVersion: 2,
          status: 'pending-agent-validation',
          characters,
        }
        return json(200, { file, results })
      }
      return json(404, { error: '지원하지 않는 검수 요청입니다.' })
    } catch (error) {
      return json(400, { error: errorMessage(error) })
    }
  }
}
