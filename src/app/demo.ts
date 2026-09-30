import {
  createRotation,
  createSwitch,
  insertInput,
  setActiveCharacter,
} from '../domain/rotation'
import type { CharacterCatalog } from './catalog'

/** 로컬 개발 화면 검증 전용 가상 데이터. 제품 공명자 데이터가 아니다. */
export const demoCatalog: CharacterCatalog = {
  characters: [
    {
      id: 'demo-a',
      displayName: '데모 공명자 A',
      element: '용융',
      skills: [
        { id: 'demo-skill-a', displayName: '데모 스킬 A' },
        { id: 'demo-skill-a2', displayName: '데모 스킬 A2' },
      ],
    },
    {
      id: 'demo-b',
      displayName: '데모 공명자 B',
      element: '기류',
      skills: [{ id: 'demo-skill-b', displayName: '데모 스킬 B' }],
    },
    {
      id: 'demo-c',
      displayName: '데모 공명자 C',
      element: '전도',
      skills: [{ id: 'demo-skill-c', displayName: '데모 스킬 C' }],
    },
    {
      id: 'demo-d',
      displayName: '데모 공명자 D',
      element: '회절',
      skills: [{ id: 'demo-skill-d', displayName: '데모 스킬 D' }],
    },
    {
      id: 'demo-e',
      displayName: '데모 공명자 E',
      element: '응결',
      skills: [{ id: 'demo-skill-e', displayName: '데모 스킬 E' }],
    },
    {
      id: 'demo-f',
      displayName: '데모 공명자 F',
      element: '인멸',
      skills: [{ id: 'demo-skill-f', displayName: '데모 스킬 F' }],
    },
  ],
}

export function createDemoRotation() {
  let rotation = insertInput(
    createRotation(['demo-a', 'demo-b', 'demo-c']),
    'opening',
    'demo-input-col-a',
    {
      type: 'input',
      id: 'demo-input-a',
      input: 'E',
      gesture: 'tap',
      skills: [
        { id: 'demo-linked-a', skillRef: 'demo-skill-a', stage: 0 },
        { id: 'demo-linked-a2', skillRef: 'demo-skill-a2', stage: 1 },
      ],
    },
  )
  rotation = createSwitch(rotation, 'opening', {
    switchId: 'demo-switch',
    kind: 'concerto',
    toId: 'demo-b',
    outro: {
      columnId: 'demo-out-col',
      actionId: 'demo-out',
      skillRef: 'demo-skill-a2',
    },
    intro: {
      columnId: 'demo-in-col',
      actionId: 'demo-in',
      skillRef: 'demo-skill-b',
    },
  })
  rotation = insertInput(rotation, 'opening', 'demo-input-col-b', {
    type: 'input',
    id: 'demo-input-b',
    input: 'Q',
    gesture: 'hold',
    skills: [],
  })
  rotation = setActiveCharacter(rotation, 'repeat', 'demo-c')
  return insertInput(rotation, 'repeat', 'demo-repeat-col', {
    type: 'input',
    id: 'demo-repeat-input',
    input: 'R',
    gesture: 'tap',
    skills: [],
  })
}
