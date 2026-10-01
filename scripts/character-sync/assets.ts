import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import { ensureDirectory } from '../../tools/character-review/files'
import {
  mergeCandidates,
  resourcePath,
  sha256,
  type Candidate,
} from './candidates'

export const ASSET_REPO = 'https://github.com/alt3ri/WW_Asset_Webp'
export const ASSET_ROOT = 'UIResources/Common/Atlas/SkillIcon/'
export interface AssetSnapshot {
  ref: string
  paths: string[]
}
const git = async (args: string[]) =>
  (
    await promisify(execFile)('git', args, {
      timeout: 180_000,
      maxBuffer: 32 * 1024 * 1024,
    })
  ).stdout

/** 이미지 blob/checkout 없이 고정 commit의 실제 파일 목록만 읽는다. */
export async function loadAssetSnapshot(
  root: string,
  fixedRef?: string,
): Promise<AssetSnapshot> {
  const ref =
    fixedRef ??
    (await git(['ls-remote', `${ASSET_REPO}.git`, 'HEAD']))
      .trim()
      .split(/\s+/)[0]
  if (!/^[0-9a-f]{40}$/.test(ref))
    throw new Error('WW_Asset commit은 40자리 SHA여야 합니다.')
  const directory = path.join(root, '.character-sync/cache/ww-asset', ref)
  await ensureDirectory(root, directory)
  await git(['init', '--bare', directory])
  try {
    await git(['--git-dir', directory, 'cat-file', '-e', `${ref}^{commit}`])
  } catch {
    await git([
      '--git-dir',
      directory,
      'fetch',
      '--depth=1',
      '--filter=blob:none',
      `${ASSET_REPO}.git`,
      ref,
    ])
  }
  const output = await git([
    '--git-dir',
    directory,
    'ls-tree',
    '-r',
    '-z',
    '--name-only',
    ref,
    '--',
    ASSET_ROOT,
  ])
  const paths = output.split('\0').filter(Boolean)
  if (!paths.length) throw new Error('WW_Asset 스킬 자산 목록이 비어 있습니다.')
  return { ref, paths }
}

export function assetCandidates(
  snapshot: AssetSnapshot,
  known: Candidate[],
): Candidate[] {
  if (!/^[0-9a-f]{40}$/.test(snapshot.ref))
    throw new Error('WW_Asset commit이 유효하지 않습니다.')
  const folders = new Set(
    known
      .filter((c) => c.kind === 'skill')
      .map((c) => c.resourcePath.replace(/^\/Game\/Aki\/UI\//, ''))
      .map((p) => p.slice(0, p.lastIndexOf('/')))
      .filter(
        (folder) =>
          folder.startsWith(ASSET_ROOT) &&
          folder !== `${ASSET_ROOT}SkillIconNor`,
      ),
  )
  if (!folders.size)
    throw new Error('메타데이터에서 전용 스킬 폴더를 확인하지 못했습니다.')
  const result: Candidate[] = []
  for (const folder of folders) {
    const files = snapshot.paths.filter(
      (p) => p.slice(0, p.lastIndexOf('/')) === folder,
    )
    if (!files.length)
      throw new Error(`WW_Asset에 전용 폴더가 없습니다: ${folder}`)
    for (const file of files) {
      const name = file.slice(file.lastIndexOf('/') + 1)
      if (!file.endsWith('.webp') || /UIAtlas\.webp$/i.test(name)) continue
      if (
        !/^UIResources\/[A-Za-z0-9_/-]+\.webp$/.test(file) ||
        file.includes('..')
      )
        throw new Error('WW_Asset 경로가 유효하지 않습니다.')
      const normalized = resourcePath(`/Game/Aki/UI/${file}`)
      const hash = sha256(`skill:${normalized}`)
      result.push({
        candidateId: `candidate-${hash}`,
        kind: 'skill',
        resourcePath: normalized,
        url: `https://raw.githubusercontent.com/alt3ri/WW_Asset_Webp/${snapshot.ref}/${file}`,
        asset: `assets/${hash}.webp`,
        review: { displayName: null, visible: null },
        sources: [
          {
            source: 'ww-asset',
            document: `${ASSET_REPO}/tree/${snapshot.ref}/${folder}`,
            recordId: file,
            field: 'git ls-tree',
            originalPath: file,
          },
        ],
      })
    }
  }
  return mergeCandidates(result)
}
