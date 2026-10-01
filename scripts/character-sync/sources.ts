import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { ENCORE_API, WW_FILES, WW_REPO, type WwData } from './candidates'
import { fetchBytes } from './io'
import { loadAssetSnapshot, type AssetSnapshot } from './assets'

export interface WwSnapshot {
  ref: string
  data: WwData
}
export interface Sources {
  list(): Promise<unknown>
  detail(id: string): Promise<unknown>
  ww(): Promise<WwSnapshot>
  assets(): Promise<AssetSnapshot>
  download(url: string): Promise<Uint8Array>
}
export function remoteSources(
  wwRef?: string,
  assetRef?: string,
  root = process.cwd(),
): Sources {
  if (wwRef && !/^[0-9a-f]{40}$/.test(wwRef))
    throw new Error('--ww-ref에는 40자리 commit SHA를 지정하세요.')
  const json = async (url: string): Promise<unknown> =>
    JSON.parse(new TextDecoder().decode(await fetchBytes(url, 'json')))
  let pending: Promise<WwSnapshot> | undefined
  let assetPending: Promise<AssetSnapshot> | undefined
  const loadWw = async (): Promise<WwSnapshot> => {
    const ref =
      wwRef ??
      (
        await promisify(execFile)('git', ['ls-remote', WW_REPO, 'HEAD'], {
          timeout: 25_000,
        })
      ).stdout
        .trim()
        .split(/\s+/)[0]
    if (!/^[0-9a-f]{40}$/.test(ref))
      throw new Error('WW_Data HEAD를 확인할 수 없습니다.')
    const data = {} as WwData
    // 요청 수를 제한하고 실행 전체에서 공유한다.
    for (const key of Object.keys(WW_FILES) as (keyof WwData)[])
      data[key] = await json(
        `https://raw.githubusercontent.com/Arikatsu/WutheringWaves_Data/${ref}/${WW_FILES[key]}`,
      )
    return { ref, data }
  }
  return {
    list: () => json(`${ENCORE_API}/character`),
    detail: (id) => json(`${ENCORE_API}/character/${id}`),
    ww: () => (pending ??= loadWw()),
    assets: () => (assetPending ??= loadAssetSnapshot(root, assetRef)),
    download: (url) => fetchBytes(url, 'webp'),
  }
}
