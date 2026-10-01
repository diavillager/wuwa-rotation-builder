import { mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { assertWebPContainer } from '../../src/data/characters/webp'
import {
  loadCharacterCatalog,
  type CharacterRecord,
} from '../../src/data/characters/load'
import { sha256 } from './candidates'

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error)
export async function writeJson(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    flag: 'wx',
  })
}
export async function fetchBytes(
  url: string,
  expected: 'json' | 'webp',
  fetcher: typeof fetch = fetch,
): Promise<Uint8Array> {
  const controller = new AbortController()
  const timer = setTimeout(
    () => controller.abort(new Error('요청 시간 초과')),
    25_000,
  )
  try {
    const response = await fetcher(url, {
      signal: controller.signal,
      headers: {
        Accept: expected === 'webp' ? 'image/webp' : 'application/json',
      },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`)
    const type = response.headers
      .get('content-type')
      ?.split(';')[0]
      .trim()
      .toLowerCase()
    // raw.githubusercontent.com은 JSON을 text/plain으로 제공한다.
    if (
      expected === 'webp'
        ? type !== 'image/webp'
        : !['application/json', 'text/plain'].includes(type ?? '')
    )
      throw new Error(`잘못된 Content-Type: ${type ?? '없음'}`)
    if (!response.body) throw new Error('응답 본문이 없습니다.')
    const reader = response.body.getReader()
    const chunks: Uint8Array[] = []
    const max = expected === 'webp' ? 16 * 1024 * 1024 : 32 * 1024 * 1024
    let size = 0
    try {
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        size += value.byteLength
        if (size > max) throw new Error('응답이 허용 크기를 초과합니다.')
        chunks.push(value)
      }
    } finally {
      await reader.cancel()
      reader.releaseLock()
    }
    return Buffer.concat(chunks)
  } finally {
    clearTimeout(timer)
  }
}
export async function decodeWebP(bytes: Uint8Array) {
  assertWebPContainer(bytes)
  const image = sharp(bytes, {
    failOn: 'warning',
    limitInputPixels: 16_777_216,
  })
  const metadata = await image.metadata()
  if (metadata.format !== 'webp') throw new Error('WebP 이미지가 아닙니다.')
  // metadata만 읽지 않고 실제 픽셀까지 디코딩한다.
  const { info } = await image.raw().toBuffer({ resolveWithObject: true })
  if (!info.width || !info.height)
    throw new Error('이미지 크기가 유효하지 않습니다.')
  return { width: info.width, height: info.height, sha256: sha256(bytes) }
}
/** 실제 파일 경로도 검사해 junction/symlink를 통한 루트 이탈을 막는다. */
export async function readInside(root: string, file: string): Promise<Buffer> {
  const [base, resolved] = await Promise.all([realpath(root), realpath(file)])
  const relative = path.relative(base, resolved)
  if (relative.startsWith('..') || path.isAbsolute(relative))
    throw new Error('허용 디렉터리를 벗어난 파일입니다.')
  return readFile(resolved)
}
export interface ExistingRecord {
  characterId: string
  valid: boolean
  raw: string | null
  sha256: string | null
  errors: string[]
}
export async function scanRegistered(
  repoRoot: string,
): Promise<ExistingRecord[]> {
  const root = path.join(repoRoot, 'src/assets/characters')
  let directories
  try {
    directories = await readdir(root, { withFileTypes: true })
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return []
    throw error
  }
  const existing: ExistingRecord[] = []
  const records: CharacterRecord[] = []
  const assets: Record<string, string> = {}
  for (const entry of directories
    .filter((d) => d.isDirectory() || d.isSymbolicLink())
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const id = entry.name
    const record: ExistingRecord = {
      characterId: id,
      valid: false,
      raw: null,
      sha256: null,
      errors: [],
    }
    existing.push(record)
    try {
      const bytes = await readInside(
        root,
        path.join(root, id, 'data', `${id}.json`),
      )
      record.raw = bytes.toString('utf8')
      record.sha256 = sha256(bytes)
      records.push({
        path: `characters/${id}/data/${id}.json`,
        data: record.raw,
      })
      try {
        const files = await readdir(path.join(root, id, 'assets'))
        for (const name of files.filter((n) => n.endsWith('.webp')))
          assets[`characters/${id}/assets/${name}`] = path.join(
            root,
            id,
            'assets',
            name,
          )
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      }
    } catch (error) {
      record.errors.push(errorMessage(error))
    }
  }
  const result = await loadCharacterCatalog(records, assets, async (file) => {
    await decodeWebP(await readInside(root, file))
  })
  for (const record of existing) {
    record.errors.push(
      ...result.issues
        .filter((i) => i.characterId === record.characterId)
        .map((i) => i.message),
    )
    record.valid =
      record.errors.length === 0 &&
      result.catalog.characters.some((c) => c.id === record.characterId)
  }
  return existing
}
