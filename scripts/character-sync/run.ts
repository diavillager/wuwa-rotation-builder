import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  encoreCandidates,
  mergeCandidates,
  parseDetail,
  parseList,
  sourceId,
  wwCandidates,
  type Candidate,
} from './candidates'
import {
  decodeWebP,
  errorMessage,
  scanRegistered,
  writeJson,
  type ExistingRecord,
} from './io'
import type { Sources, WwSnapshot } from './sources'
import { assetCandidates, type AssetSnapshot } from './assets'
import { setWorkspaceTargets } from '../../tools/character-review/workspace'
import { resolveSharedSkills, sharedSkillDonor } from './shared-skills'

export type Mode =
  { all: true } | { character: string } | { characters: string[] }
export function planTargets(
  list: { characterId: string }[],
  existing: ExistingRecord[],
  mode: Mode,
): string[] {
  if (!('all' in mode)) {
    const ids = ('character' in mode ? [mode.character] : mode.characters).map(
      sourceId,
    )
    if (!ids.length || new Set(ids).size !== ids.length)
      throw new Error('대상이 비어 있거나 중복됩니다.')
    for (const id of ids)
      if (!list.some((row) => row.characterId === id))
        throw new Error(`Encore 목록에 ${id}가 없습니다.`)
    return ids
  }
  const registered = new Set(
    existing.filter((r) => r.valid).map((r) => r.characterId),
  )
  return list.map((r) => r.characterId).filter((id) => !registered.has(id))
}
export interface DownloadedCandidate extends Candidate {
  download:
    | { status: 'verified'; width: number; height: number; sha256: string }
    | { status: 'failed'; error: string }
}
export interface SyncReport {
  schemaVersion: 1
  runId: string
  startedAt: string
  mode: Mode
  targets: string[]
  registrations: Pick<ExistingRecord, 'characterId' | 'valid' | 'errors'>[]
  wwRef: string | null
  assetRef: string | null
  results: {
    characterId: string
    status: 'collected' | 'partial' | 'failed'
    candidates: number
    verified: number
  }[]
  errors: { scope: string; message: string }[]
}
export async function runSync(
  repoRoot: string,
  sources: Sources,
  mode: Mode,
  planOnly = false,
) {
  const startedAt = new Date().toISOString()
  const rawList = await sources.list()
  const list = parseList(rawList)
  const registrations = await scanRegistered(repoRoot)
  const targets = planTargets(list, registrations, mode)
  if (planOnly) return { plan: true as const, targets, registrations }
  const runId = `${startedAt.replace(/[:.]/g, '-')}-${randomUUID()}`
  const directory = path.join(repoRoot, '.character-sync/runs', runId)
  await mkdir(directory, { recursive: true })
  const report: SyncReport = {
    schemaVersion: 1,
    runId,
    startedAt,
    mode,
    targets,
    registrations: registrations.map(({ characterId, valid, errors }) => ({
      characterId,
      valid,
      errors,
    })),
    wwRef: null,
    assetRef: null,
    results: [],
    errors: [],
  }
  await writeJson(path.join(directory, 'sources/encore-list.json'), rawList)
  let ww: WwSnapshot | undefined
  let assets: AssetSnapshot | undefined
  if (targets.length) {
    try {
      ww = await sources.ww()
      report.wwRef = ww.ref
      await writeJson(path.join(directory, 'sources/ww-data.json'), ww)
    } catch (error) {
      report.errors.push({ scope: 'ww-data', message: errorMessage(error) })
    }
    try {
      assets = await sources.assets()
      report.assetRef = assets.ref
      await writeJson(path.join(directory, 'sources/ww-assets.json'), assets)
    } catch (error) {
      report.errors.push({ scope: 'ww-asset', message: errorMessage(error) })
    }
  }
  for (const id of targets) {
    const characterDirectory = path.join(directory, id)
    const errors: string[] = []
    let basic = list.find((r) => r.characterId === id)!
    let encore: Candidate[] = []
    let fromWw: Candidate[] = []
    try {
      const detail = await sources.detail(id)
      await writeJson(path.join(characterDirectory, 'encore.json'), detail)
      basic = parseDetail(detail, id)
      encore = encoreCandidates(detail, id)
      const donorId = sharedSkillDonor(detail)
      if (donorId) {
        const donor = await sources.detail(donorId)
        resolveSharedSkills(detail, donor)
        await writeJson(
          path.join(characterDirectory, 'encore-shared-skills.json'),
          donor,
        )
        encore = mergeCandidates(
          encore,
          encoreCandidates(donor, donorId).filter((c) => c.kind === 'skill'),
        )
      }
      if (!encore.some((candidate) => candidate.kind === 'skill'))
        errors.push(
          'Encore: 스킬 후보가 비어 있습니다. 초상화는 별도로 수집했습니다.',
        )
    } catch (error) {
      errors.push(`Encore: ${errorMessage(error)}`)
    }
    if (ww) {
      try {
        fromWw = wwCandidates(ww.data, id, ww.ref, encore)
      } catch (error) {
        errors.push(`WW_Data: ${errorMessage(error)}`)
      }
    } else errors.push('WW_Data 수집 실패: 실행 report.json 참조')
    let fromAssets: Candidate[] = []
    if (assets) {
      try {
        fromAssets = assetCandidates(assets, mergeCandidates(encore, fromWw))
      } catch (error) {
        errors.push(`WW_Asset: ${errorMessage(error)}`)
      }
    } else errors.push('WW_Asset 수집 실패: 실행 report.json 참조')
    const candidates: DownloadedCandidate[] = []
    for (const candidate of mergeCandidates(encore, fromWw, fromAssets)) {
      try {
        const bytes = await sources.download(candidate.url)
        const decoded = await decodeWebP(bytes)
        await mkdir(path.join(characterDirectory, 'assets'), {
          recursive: true,
        })
        await writeFile(path.join(characterDirectory, candidate.asset), bytes, {
          flag: 'wx',
        })
        candidates.push({
          ...candidate,
          download: { status: 'verified', ...decoded },
        })
      } catch (error) {
        const message = errorMessage(error)
        errors.push(`${candidate.candidateId}: ${message}`)
        candidates.push({
          ...candidate,
          download: { status: 'failed', error: message },
        })
      }
    }
    await writeJson(path.join(characterDirectory, 'draft.json'), {
      schemaVersion: 1,
      reviewStatus: 'pending',
      characterId: id,
      basicCandidate: basic,
      candidates,
      autoActions: { normalSwitchAttack: null, intro: null, outro: null },
      errors,
    })
    const verified = candidates.filter(
      (c) => c.download.status === 'verified',
    ).length
    report.results.push({
      characterId: id,
      status: errors.length ? (verified ? 'partial' : 'failed') : 'collected',
      candidates: candidates.length,
      verified,
    })
    report.errors.push(...errors.map((message) => ({ scope: id, message })))
  }
  await writeJson(path.join(directory, 'report.json'), report)
  await setWorkspaceTargets(
    repoRoot,
    targets.map((characterId) => ({ runId, characterId })),
  )
  return { plan: false as const, directory, report }
}
