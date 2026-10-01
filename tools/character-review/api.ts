import type { IncomingMessage, ServerResponse } from 'node:http'
import { randomBytes } from 'node:crypto'
import { errorMessage, decodeWebP } from '../../scripts/character-sync/io'
import { object } from '../../scripts/character-sync/candidates'
import {
  listTargets,
  loadSource,
  readCandidateAsset,
  readCurrentAsset,
} from './files'
import { ReviewRepository } from './repository'
import type { ReviewState } from './model'

const ORIGIN = 'http://127.0.0.1:5174'
export function reviewApi(root: string) {
  const token = randomBytes(32).toString('hex')
  const repository = new ReviewRepository(root)
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
        if (url.pathname === '/api/review/load')
          return json(200, await repository.load(target))
        if (url.pathname === '/api/review/image') {
          const source = await loadSource(root, target)
          const candidate = url.searchParams.get('candidateId')
          const bytes = candidate
            ? await readCandidateAsset(root, source, candidate)
            : await readCurrentAsset(
                root,
                source,
                url.searchParams.get('asset') ?? '',
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
          if (size > 2 * 1024 * 1024)
            return json(413, { error: '검수 요청이 너무 큽니다.' })
          chunks.push(Buffer.from(chunk))
        }
        const body = object(JSON.parse(Buffer.concat(chunks).toString('utf8')))
        const state = object(body.state) as unknown as ReviewState
        if (body.revision !== null && typeof body.revision !== 'string')
          throw new Error('검수 저장 버전이 없습니다.')
        if (url.pathname === '/api/review/save')
          return json(200, await repository.save(state, body.revision))
        if (url.pathname === '/api/review/validate')
          return json(200, await repository.validate(state))
        if (url.pathname === '/api/review/publish') {
          if (typeof body.token !== 'string')
            throw new Error('검증 결과가 없습니다.')
          return json(
            200,
            await repository.publish(state, body.revision, body.token),
          )
        }
      }
      return json(404, { error: '지원하지 않는 검수 요청입니다.' })
    } catch (error) {
      return json(400, { error: errorMessage(error) })
    }
  }
}
