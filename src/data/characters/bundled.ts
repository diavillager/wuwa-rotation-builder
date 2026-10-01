import { verifyWebPAsset } from './assets'
import { loadCharacterCatalog } from './load'

// 손상된 JSON도 개별 오류로 보고할 수 있도록 문자열로 읽는다.
const records = import.meta.glob<string>(
  '../../assets/characters/*/data/*.json',
  {
    eager: true,
    query: '?raw',
    import: 'default',
  },
)
const assets = import.meta.glob<string>(
  '../../assets/characters/*/assets/*.webp',
  {
    eager: true,
    query: '?url',
    import: 'default',
  },
)
const normalize = (path: string) => path.replace('../../assets/', '')
let pending: ReturnType<typeof loadCharacterCatalog> | undefined
export function loadBundledCharacters() {
  pending ??= loadCharacterCatalog(
    Object.entries(records).map(([path, data]) => ({
      path: normalize(path),
      data,
    })),
    Object.fromEntries(
      Object.entries(assets).map(([path, url]) => [normalize(path), url]),
    ),
    verifyWebPAsset,
  )
  return pending
}
