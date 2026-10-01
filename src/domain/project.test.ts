import { describe, expect, it } from 'vitest'
import {
  captureReferences,
  createProject,
  duplicateProject,
  nextProjectName,
  validateProject,
} from './project'
import {
  addSkill,
  createRotation,
  createSwitch,
  deleteAutoAction,
  insertInput,
  reorderParty,
} from './rotation'
import {
  createEditorHistory,
  recordRotationEdit,
  undoCycle,
} from './cycle-history'

const now = '2026-10-01T03:00:00.000Z'
function populated() {
  let rotation = insertInput(
    createRotation(['a', 'b', 'c']),
    'opening',
    'col',
    { id: 'input', type: 'input', input: 'E', gesture: 'hold', skills: [] },
  )
  rotation = addSkill(rotation, 'opening', 'input', {
    id: 'skill',
    skillRef: 'manual',
    stage: 3,
  })
  rotation = createSwitch(rotation, 'opening', {
    switchId: 'switch',
    kind: 'concerto',
    toId: 'b',
    outro: { columnId: 'out', actionId: 'out-action', skillRef: 'outro' },
    intro: { columnId: 'in', actionId: 'in-action', skillRef: 'intro' },
  })
  rotation = deleteAutoAction(rotation, 'opening', 'out-action')
  return reorderParty(rotation, ['c', 'a', 'b'])
}

describe('프로젝트 저장 데이터', () => {
  it('독립 ID 복제와 생성 시각, 자동 이름을 관리하고 원본을 수정하지 않는다', () => {
    const original = createProject('one', ' 새 로테이션 1 ', now, populated())
    const copy = duplicateProject(
      original,
      'two',
      '사본',
      '2026-10-01T03:01:00.000Z',
    )
    expect(copy.rotation).toEqual(original.rotation)
    expect(copy.rotation).not.toBe(original.rotation)
    copy.rotation.opening.columns.splice(0, 1)
    expect(original.rotation.opening.columns).toHaveLength(1)
    expect(copy.id).toBe('two')
    expect(copy.createdAt).toBe(copy.updatedAt)
    expect(
      nextProjectName([original, createProject('three', '새 로테이션 3', now)]),
    ).toBe('새 로테이션 2')
  })
  it('직렬화 복원은 순서·소유권·stage·Transition·suppression과 Cycle 독립성을 유지한다', () => {
    const original = createProject('one', '테스트', now, populated())
    const restored = validateProject(JSON.parse(JSON.stringify(original)))
    expect(restored).toEqual(original)
    expect(restored.rotation.opening.suppression).toEqual([
      { switchId: 'switch', kind: 'concertoPair' },
    ])
    expect(restored.rotation.repeat.columns).toEqual([])
    expect(restored.rotation.opening.columns).not.toBe(
      restored.rotation.repeat.columns,
    )
    const editor = recordRotationEdit(
      createEditorHistory(createRotation(['a', 'b', 'c'])),
      populated(),
    )
    createProject('save', '저장', now, editor.rotation)
    expect(undoCycle(editor, 'opening').rotation.opening.columns).toEqual([])
  })
  it('현재 데이터의 정확한 ID를 우선하고 누락 ID의 기존 snapshot을 보존한다', () => {
    const rotation = populated()
    const references = captureReferences(
      rotation,
      {
        characters: [
          {
            id: 'a',
            displayName: '새 이름',
            skills: [{ id: 'manual', displayName: '현재 스킬' }],
          },
        ],
      },
      {
        characters: [
          { id: 'a', displayName: '옛 이름' },
          { id: 'b', displayName: '저장된 B' },
        ],
        skills: [
          { id: 'manual', displayName: '옛 스킬' },
          { id: 'unused', displayName: '사용 안 함' },
        ],
      },
    )
    expect(references.characters).toEqual([
      { id: 'a', displayName: '새 이름' },
      { id: 'b', displayName: '저장된 B' },
    ])
    expect(references.skills).toEqual([
      { id: 'manual', displayName: '현재 스킬' },
    ])
  })
  it.each([
    (project: ReturnType<typeof createProject>) => {
      project.schemaVersion = 2 as 1
    },
    (project: ReturnType<typeof createProject>) => {
      project.name = '  '
    },
    (project: ReturnType<typeof createProject>) => {
      project.rotation.opening.columns[0].ownerId = 'stranger'
    },
    (project: ReturnType<typeof createProject>) => {
      project.rotation.opening.suppression = []
    },
    (project: ReturnType<typeof createProject>) => {
      project.references.skills.push({
        id: 's',
        displayName: 's',
        asset: 'data:image/png;base64,binary',
      })
    },
  ])('손상되거나 지원되지 않는 저장 데이터는 거부한다', (damage) => {
    const project = createProject('one', '테스트', now, populated())
    damage(project)
    expect(() => validateProject(project)).toThrow()
  })
})
