import { describe, expect, it } from 'vitest'
import {
  extractTooltips,
  parseTooltips,
  tooltipText,
  TOOLTIP_CATEGORIES,
} from './tooltips'

describe('Encore 검수 스킬 설명', () => {
  it('6개 분류의 설명만 순서대로 추출하고 대미지 표·고유 스킬은 포함하지 않는다', () => {
    const categories = [...TOOLTIP_CATEGORIES, '고유 스킬', '조화도 파괴']
    const result = extractTooltips({
      Skills: categories
        .map((category, i) => ({
          SkillId: i + 1,
          SkillType: category,
          SkillName: `이름 ${i}`,
          SkillDescribe: '<span>효과 20%</span><br>설명',
          SkillAttributes: [
            { attributeName: '대미지 표 전용', values: ['999%'] },
          ],
        }))
        .reverse(),
    })
    expect(result.map((item) => item.category)).toEqual(TOOLTIP_CATEGORIES)
    expect(result.every((item) => item.description === '효과 20%\n설명')).toBe(
      true,
    )
    expect(JSON.stringify(result)).not.toContain('999%')
    expect(JSON.stringify(result)).not.toContain('SkillAttributes')
  })
  it('Encore 태그·불완전한 마크업에서 줄바꿈을 보존하고 실행 요소와 표를 제거한다', () => {
    expect(
      tooltipText(
        '<span class="font-bold style="color:aliceblue;">제목</span></span><br><size=10></span><br><br><te href=123>효과</te>&nbsp;&amp;&#65;&#x42;<script>alert(1)</script><table><tr><td>수치표</td></tr></table>',
      ),
    ).toBe('제목\n\n효과 &AB')
    expect(tooltipText('&lt;img src=x onerror=alert(1)&gt;')).toBe(
      '<img src=x onerror=alert(1)>',
    )
  })
  it('설명이 없거나 잘못된 스킬은 제외하고 복원 형식을 검증한다', () => {
    expect(
      extractTooltips({
        Skills: [{ SkillId: 1, SkillType: '기본 공격', SkillName: '공격' }],
      }),
    ).toEqual([])
    const value = [
      {
        category: '기본 공격',
        skillId: '1',
        displayName: '공격',
        description: '설명',
      },
    ]
    expect(parseTooltips(value)).toEqual(value)
    expect(() =>
      parseTooltips([{ ...value[0], category: '고유 스킬' }]),
    ).toThrow('툴팁')
    expect(() => parseTooltips([{ ...value[0], description: {} }])).toThrow(
      '툴팁',
    )
  })
})
