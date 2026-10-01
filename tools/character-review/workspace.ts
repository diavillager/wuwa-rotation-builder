import { rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { errorMessage } from '../../scripts/character-sync/io'
import { object } from '../../scripts/character-sync/candidates'
import {
  assertTarget,
  ensureDirectory,
  loadSource,
  optionalFile,
} from './files'
import type { ReviewTarget } from './model'

type Target = Pick<ReviewTarget, 'runId' | 'characterId'>
const manifestPath = (root: string) =>
  path.join(root, '.character-sync/workspace.json')
function parseTargets(value: unknown): Target[] {
  const manifest = object(value)
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.targets))
    throw new Error('검수 대상 목록 형식이 잘못되었습니다.')
  const ids = new Set<string>()
  return manifest.targets.map((value) => {
    const row = object(value)
    if (typeof row.runId !== 'string' || typeof row.characterId !== 'string')
      throw new Error('검수 대상 형식 오류')
    const target = { runId: row.runId, characterId: row.characterId }
    assertTarget(target)
    if (ids.has(target.characterId))
      throw new Error('검수 공명자가 중복됩니다.')
    ids.add(target.characterId)
    return target
  })
}
export async function workspaceTargets(root: string): Promise<Target[]> {
  const raw = await optionalFile(root, manifestPath(root))
  return raw ? parseTargets(JSON.parse(raw.toString('utf8'))) : []
}
/** 검수 값은 포함하지 않고, 사용자가 요청한 현재 대상만 교체한다. */
export async function setWorkspaceTargets(root: string, targets: Target[]) {
  const manifest = { schemaVersion: 1, targets }
  parseTargets(manifest)
  for (const target of targets) await loadSource(root, target)
  const file = manifestPath(root)
  await ensureDirectory(root, path.dirname(file))
  const temp = `${file}.${randomUUID()}.tmp`
  try {
    await writeFile(temp, `${JSON.stringify(manifest, null, 2)}\n`, {
      flag: 'wx',
    })
    await rename(temp, file)
  } finally {
    await unlink(temp).catch((e: NodeJS.ErrnoException) => {
      if (e.code !== 'ENOENT') throw e
    })
  }
}
export async function assertWorkspaceTarget(root: string, target: Target) {
  assertTarget(target)
  if (
    !(await workspaceTargets(root)).some(
      (t) => t.characterId === target.characterId && t.runId === target.runId,
    )
  )
    throw new Error('현재 검수 대상으로 지정되지 않은 공명자입니다.')
}
export async function listTargets(root: string) {
  const result: { targets: ReviewTarget[]; errors: string[] } = {
    targets: [],
    errors: [],
  }
  for (const target of await workspaceTargets(root)) {
    try {
      result.targets.push((await loadSource(root, target)).target)
    } catch (e) {
      result.errors.push(`${target.characterId}: ${errorMessage(e)}`)
    }
  }
  return result
}
