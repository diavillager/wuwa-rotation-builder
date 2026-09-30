import {
  createSwitch,
  insertInput,
  inputInsertionBoundary,
  setActiveCharacter,
  type Rotation,
} from '../domain/rotation'
import type { CatalogCharacter, CharacterCatalog } from './catalog'
import type { CapturedInput } from './input-capture'

export function applyCapturedInput(
  rotation: Rotation,
  catalog: CharacterCatalog,
  input: CapturedInput,
  nextId: () => string,
): Rotation {
  const cycleId = input.target.cycleId
  if (
    input.target.ownerId &&
    rotation[cycleId].activeCharacterId !== input.target.ownerId
  )
    rotation = setActiveCharacter(rotation, cycleId, input.target.ownerId)
  const cycle = rotation[cycleId]
  const isSwitch =
    input.control === '1' || input.control === '2' || input.control === '3'
  const toId = isSwitch ? rotation.party[Number(input.control) - 1] : undefined
  if (toId === cycle.activeCharacterId) return rotation
  const source = catalog.characters.find(
    (item) => item.id === cycle.activeCharacterId,
  )
  if (!source) throw new Error('파티의 공명자를 먼저 선택해 주세요.')
  if (input.control !== '1' && input.control !== '2' && input.control !== '3') {
    return insertInput(
      rotation,
      cycleId,
      nextId(),
      {
        type: 'input',
        id: nextId(),
        input: input.control,
        gesture: input.gesture,
        skills: [],
      },
      input.target.afterColumnId,
    )
  }
  if (!toId) throw new Error('교체 대상 슬롯이 없습니다.')
  const destination = catalog.characters.find((item) => item.id === toId)
  if (!destination)
    throw new Error('교체할 슬롯의 공명자를 먼저 선택해 주세요.')
  const auto = (owner: CatalogCharacter, skillRef: string | undefined) => {
    if (!skillRef || !owner.skills.some((item) => item.id === skillRef))
      throw new Error('검수된 자동 행동 데이터가 없어 교체할 수 없습니다.')
    return { columnId: nextId(), actionId: nextId(), skillRef }
  }
  const result = createSwitch(
    rotation,
    cycleId,
    input.gesture === 'tap'
      ? {
          switchId: nextId(),
          kind: 'normal',
          toId,
          afterColumnId:
            input.target.afterColumnId ??
            (input.target.ownerId ? inputInsertionBoundary(cycle) : undefined),
          normalSwitchAttack: auto(
            destination,
            destination.autoActions?.normalSwitchAttack,
          ),
        }
      : {
          switchId: nextId(),
          kind: 'concerto',
          toId,
          afterColumnId:
            input.target.afterColumnId ??
            (input.target.ownerId ? inputInsertionBoundary(cycle) : undefined),
          outro: auto(source, source.autoActions?.outro),
          intro: auto(destination, destination.autoActions?.intro),
        },
  )
  return input.target.ownerId
    ? setActiveCharacter(result, cycleId, input.target.ownerId)
    : result
}
