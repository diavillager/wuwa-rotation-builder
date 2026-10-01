import { useEffect, useState } from 'react'
import { loadBundledCharacters } from '../data/characters/bundled'
import type { CharacterCatalogResult } from '../data/characters/load'
import { ProjectWorkspace } from './ProjectWorkspace'

/** 데이터 준비 후 편집 세션을 열어 빈 catalog로 저장 정보를 재작성하지 않는다. */
export function CharacterWorkspace() {
  const [result, setResult] = useState<CharacterCatalogResult | null>(null)
  useEffect(() => {
    let mounted = true
    void loadBundledCharacters().then((next) => {
      if (mounted) setResult(next)
    })
    return () => {
      mounted = false
    }
  }, [])
  if (!result)
    return (
      <main className="app-shell">
        <h1>WUWA Rotation Builder</h1>
        <p role="status">공명자 데이터를 확인하는 중입니다.</p>
      </main>
    )
  return (
    <ProjectWorkspace catalog={result.catalog} catalogIssues={result.issues} />
  )
}
