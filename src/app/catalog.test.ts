import { describe, expect, it } from 'vitest'
import { ELEMENTS, charactersByElement, emptyCatalog } from './catalog'
import { demoCatalog } from './demo'

describe('공명자 속성 선택', () => {
  it('속성을 지정한 순서로 표시한다', () => {
    expect(ELEMENTS).toEqual(['응결', '용융', '전도', '기류', '회절', '인멸'])
  })

  it('선택한 속성의 공명자만 표시한다', () => {
    expect(
      charactersByElement(demoCatalog, '응결').map((item) => item.id),
    ).toEqual(['demo-e'])
    expect(
      charactersByElement(demoCatalog, '용융').map((item) => item.id),
    ).toEqual(['demo-a'])
    expect(charactersByElement(emptyCatalog, '응결')).toEqual([])
  })
})
