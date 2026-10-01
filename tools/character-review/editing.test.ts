import { describe, expect, it } from 'vitest'
import { matchEncore } from './encore'
import {
  assignEncore,
  linkCategorizedActions,
  moveReviewCard,
  undoEncore,
  reviewFieldKey,
} from './editing'
import { initialReview, candidateSkillId, type ReviewSource } from './model'
import { encoreCandidates } from '../../scripts/character-sync/candidates'

const raw = {
  Id: 1001,
  Name: { Content: '검증 공명자' },
  ElementName: '응결',
  RoleHeadIconLarge: '/Game/Portrait',
  Skills: [
    {
      SkillId: 1,
      SkillType: '기본 공격',
      SkillName: '실제 공격 이름',
      Icon: '/Game/Attack',
    },
    {
      SkillId: 2,
      SkillType: '변주 스킬',
      SkillName: '실제 변주 이름',
      Icon: '/Game/Intro',
    },
    {
      SkillId: 3,
      SkillType: '반주 스킬',
      SkillName: '실제 반주 이름',
      Icon: '/Game/Outro',
    },
    {
      SkillId: 4,
      SkillType: '고유 스킬',
      SkillName: '고유 하나',
      Icon: '/Game/Passive1',
    },
    {
      SkillId: 5,
      SkillType: '고유 스킬',
      SkillName: '고유 둘',
      Icon: '/Game/Passive2',
    },
  ],
}
function fixture() {
  const source: ReviewSource = {
    target: {
      characterId: '1001',
      runId: 'test-run',
      displayName: '검증 공명자',
    },
    draftHash: 'draft',
    current: null,
    currentHash: null,
    currentError: null,
    draft: {
      schemaVersion: 1,
      characterId: '1001',
      basicCandidate: { displayName: '검증 공명자', attribute: '응결' },
      errors: [],
      candidates: encoreCandidates(raw, '1001').map((c) => ({
        ...c,
        download: { status: 'verified', sha256: 'hash', width: 2, height: 2 },
      })),
    },
  }
  Object.assign(source, matchEncore(raw, source.draft))
  return { source, state: initialReview(source) }
}
describe('명시적인 Encore 의미와 검수 순서', () => {
  it('자동 배정 해제는 직접 바꾼 값과 순서를 보존하고 자동 값만 되돌린다', () => {
    const { state, source } = fixture()
    const after = assignEncore(state, source)
    const current = structuredClone(after)
    const attack = current.candidates.find((c) => c.category === '기본 공격')!
    attack.displayName = '직접 수정한 이름'
    current.candidates.reverse()
    current.cardOrder = current.candidates.map((c) => c.candidateId)
    const undone = undoEncore(current, {
      before: state,
      after,
      manual: [reviewFieldKey('candidates', attack.candidateId, 'displayName')],
    })
    expect(
      undone.candidates.find((c) => c.candidateId === attack.candidateId)!
        .displayName,
    ).toBe('직접 수정한 이름')
    expect(
      undone.candidates.every((c) => !c.category && c.decision === 'pending'),
    ).toBe(true)
    expect(undone.cardOrder).toEqual(current.cardOrder)
    expect(undone.autoActions).toEqual(state.autoActions)
    const kept = undoEncore(after, {
      before: state,
      after,
      manual: [reviewFieldKey('candidates', attack.candidateId, 'category')],
    })
    expect(
      kept.candidates.find((c) => c.candidateId === attack.candidateId)!
        .category,
    ).toBe('기본 공격')
  })
  it('분류와 실제 이름을 분리하고 모든 고유 스킬은 기본 제외하며 세 역할을 연결한다', () => {
    const { state, source } = fixture()
    const assigned = assignEncore(state, source)
    expect(
      assigned.candidates
        .filter((c) => c.category === '고유 스킬')
        .map((c) => c.decision),
    ).toEqual(['exclude', 'exclude'])
    const attack = assigned.candidates.find((c) => c.category === '기본 공격')!
    expect(attack.displayName).toBe('실제 공격 이름')
    expect(assigned.autoActions.normalSwitchAttack).toBe(
      candidateSkillId('1001', attack.candidateId),
    )
    expect(Object.values(assigned.autoActions).every(Boolean)).toBe(true)
    expect(state.candidates.every((c) => c.decision === 'pending')).toBe(true)
    expect(assignEncore(assigned, source)).toEqual(assigned)
  })
  it('아이콘이 같아도 여러 스킬이면 의미를 선택하지 않고 파일명의 Intro도 추론하지 않는다', () => {
    const { source } = fixture()
    const duplicate = {
      ...raw,
      Skills: [...raw.Skills, { ...raw.Skills[1], SkillId: 22 }],
    }
    const matches = matchEncore(duplicate, source.draft)
    expect(matches.encoreErrors).toHaveLength(1)
    expect(
      Object.values(matches.encoreMatches).some(
        (m) => m.category === '변주 스킬',
      ),
    ).toBe(false)
    expect(
      Object.keys(
        matchEncore({ ...raw, Skills: [] }, source.draft).encoreMatches,
      ),
    ).toHaveLength(0)
  })
  it('기존 공개 ID·직접 수정 이름·노출 여부와 신규 제외 선택을 보존한다', () => {
    const { state, source } = fixture()
    const id = Object.keys(source.encoreMatches!).find(
      (id) => source.encoreMatches![id].category === '기본 공격',
    )!
    state.existingSkills = [
      {
        skillId: candidateSkillId('1001', id),
        displayName: '직접 지정 이름',
        visible: true,
        candidateId: null,
      },
    ]
    state.candidates.find((c) => c.candidateId === id)!.decision = 'exclude'
    const result = assignEncore(state, source)
    expect(result.existingSkills[0].displayName).toBe('직접 지정 이름')
    expect(result.existingSkills[0].skillId).toBe(
      state.existingSkills[0].skillId,
    )
    expect(result.autoActions.normalSwitchAttack).toBe(
      state.existingSkills[0].skillId,
    )
    expect(result.candidates.find((c) => c.candidateId === id)!.decision).toBe(
      'exclude',
    )
  })
  it('필수 분류의 중복·누락은 매핑하지 않으며 손상된 이미지도 자동 등록하지 않는다', () => {
    const { state, source } = fixture()
    source.draft.candidates.find(
      (c) => c.resourcePath === '/Game/Attack.webp',
    )!.download = { status: 'failed', error: '이미지 실패' }
    expect(
      assignEncore(state, source).autoActions.normalSwitchAttack,
    ).toBeNull()
    const assigned = assignEncore(state, source)
    assigned.existingSkills = [1, 2].map((i) => ({
      skillId: `old-${i}`,
      category: '변주 스킬',
      visible: true,
      displayName: '변주',
      candidateId: null,
    }))
    expect(linkCategorizedActions(assigned).autoActions.intro).toBeNull()
  })
  it('배열 이동은 ID와 필드를 보존하고 목록 경계를 넘지 않는다', () => {
    const { state } = fixture()
    const result = moveReviewCard(state, 'candidates', 0, 2)
    expect(result.candidates[2]).toEqual(state.candidates[0])
    expect(new Set(result.candidates.map((c) => c.candidateId))).toEqual(
      new Set(state.candidates.map((c) => c.candidateId)),
    )
    expect(result.existingSkills).toEqual(state.existingSkills)
    expect(moveReviewCard(state, 'candidates', 0, -1)).toBe(state)
  })
})
