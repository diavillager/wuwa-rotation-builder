import { rename, unlink, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { ELEMENTS } from '../../src/app/catalog'
import { isSkillCategory } from '../../src/data/characters/categories'
import {
  validateCharacterData,
  type CharacterData,
} from '../../src/data/characters/contract'
import { object, sha256 } from '../../scripts/character-sync/candidates'
import {
  decodeWebP,
  errorMessage,
  scanRegistered,
} from '../../scripts/character-sync/io'
import {
  assertInside,
  ensureDirectory,
  loadSource,
  optionalFile,
  readCandidateAsset,
  readCurrentAsset,
  targetDirectory,
} from './files'
import {
  AUTO_KINDS,
  AUTO_LABELS,
  candidateSkillId,
  initialReview,
  type ReviewSession,
  type ReviewSource,
  type ReviewState,
  type ReviewTarget,
  type ReviewValidation,
} from './model'

/** 미완성 검수도 저장할 수 있지만 대상·ID·필드 형식은 항상 검증한다. */
export function parseReview(value: unknown, source: ReviewSource): ReviewState {
  const state = object(value) as unknown as ReviewState
  if (
    state.schemaVersion !== 1 ||
    state.runId !== source.target.runId ||
    state.characterId !== source.target.characterId ||
    state.draftHash !== source.draftHash
  )
    throw new Error('검수 대상 또는 수집 초안이 변경되었습니다.')
  if (state.baseHash !== source.currentHash)
    throw new Error(
      '기존 최종 파일이 변경되었습니다. 새 수집 실행에서 검수해 주세요.',
    )
  if (
    typeof state.displayName !== 'string' ||
    !ELEMENTS.includes(state.attribute) ||
    (state.portraitCandidateId !== null &&
      !source.draft.candidates.some(
        (c) =>
          c.kind === 'portrait' && c.candidateId === state.portraitCandidateId,
      ))
  )
    throw new Error('기본 검수 정보가 유효하지 않습니다.')
  const sameIds = (expected: string[], actual: string[]) =>
    expected.length === actual.length &&
    new Set(actual).size === actual.length &&
    expected.every((id) => actual.includes(id))
  if (
    !Array.isArray(state.existingSkills) ||
    !sameIds(
      source.current?.skills.map((s) => s.skillId) ?? [],
      state.existingSkills.map((s) => s?.skillId),
    )
  )
    throw new Error('기존 공개 Skill ID를 삭제하거나 변경할 수 없습니다.')
  for (const skill of state.existingSkills) {
    if (
      (skill.category !== undefined && !isSkillCategory(skill.category)) ||
      typeof skill.displayName !== 'string' ||
      typeof skill.visible !== 'boolean' ||
      (skill.candidateId !== null &&
        !source.draft.candidates.some(
          (c) => c.kind === 'skill' && c.candidateId === skill.candidateId,
        ))
    )
      throw new Error('기존 스킬 검수 형식이 유효하지 않습니다.')
  }
  if (
    !Array.isArray(state.candidates) ||
    !sameIds(
      source.draft.candidates
        .filter((c) => c.kind === 'skill')
        .map((c) => c.candidateId),
      state.candidates.map((c) => c?.candidateId),
    )
  )
    throw new Error('검수 후보가 누락되거나 추가되었습니다.')
  for (const candidate of state.candidates)
    if (
      (candidate.category !== undefined &&
        !isSkillCategory(candidate.category)) ||
      typeof candidate.displayName !== 'string' ||
      !['pending', 'include', 'exclude'].includes(candidate.decision)
    )
      throw new Error('후보 검수 형식이 유효하지 않습니다.')
  const auto = object(state.autoActions)
  for (const kind of AUTO_KINDS)
    if (auto[kind] !== null && typeof auto[kind] !== 'string')
      throw new Error('자동 행동 검수 형식이 유효하지 않습니다.')
  return structuredClone(state)
}

async function atomicJson(root: string, file: string, value: unknown) {
  await ensureDirectory(root, path.dirname(file))
  const temporary = path.join(path.dirname(file), `.review-${randomUUID()}.tmp`)
  try {
    await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, {
      flag: 'wx',
    })
    await rename(temporary, file)
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error
    })
  }
}
interface Prepared extends ReviewValidation {
  data: CharacterData | null
  assets: Map<string, Uint8Array>
}
export class ReviewRepository {
  private pending: Promise<unknown> = Promise.resolve()
  constructor(
    readonly root: string,
    private beforeCommit?: () => Promise<void>,
  ) {}
  private exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation, operation)
    this.pending = result.catch(() => {})
    return result
  }
  private reviewPath(target: Pick<ReviewTarget, 'runId' | 'characterId'>) {
    return path.join(targetDirectory(this.root, target), 'review.json')
  }
  async load(
    target: Pick<ReviewTarget, 'runId' | 'characterId'>,
  ): Promise<ReviewSession> {
    const source = await loadSource(this.root, target)
    const raw = await optionalFile(this.root, this.reviewPath(target))
    if (!raw)
      return {
        source,
        state: initialReview(source),
        revision: null,
        conflict: source.currentError,
      }
    const parsed = JSON.parse(raw.toString('utf8'))
    const state = object(parsed).state as ReviewState
    let conflict: string | null = source.currentError
    try {
      parseReview(state, source)
    } catch (error) {
      conflict = errorMessage(error)
    }
    // 손상된 저장 파일은 새 검수로 조용히 대체하지 않는다.
    if (
      !state ||
      typeof state.displayName !== 'string' ||
      !ELEMENTS.includes(state.attribute) ||
      !Array.isArray(state.existingSkills) ||
      state.existingSkills.some(
        (s) =>
          !s ||
          typeof s.skillId !== 'string' ||
          typeof s.displayName !== 'string' ||
          typeof s.visible !== 'boolean',
      ) ||
      !Array.isArray(state.candidates) ||
      state.candidates.some(
        (c) =>
          !c ||
          typeof c.candidateId !== 'string' ||
          typeof c.displayName !== 'string' ||
          !['pending', 'include', 'exclude'].includes(c.decision),
      ) ||
      !state.autoActions ||
      AUTO_KINDS.some(
        (kind) =>
          state.autoActions[kind] !== null &&
          typeof state.autoActions[kind] !== 'string',
      )
    )
      throw new Error('저장된 검수 파일이 손상되었습니다.')
    return { source, state, revision: sha256(raw), conflict }
  }
  private async checkRevision(state: ReviewState, revision: string | null) {
    const raw = await optionalFile(this.root, this.reviewPath(state))
    if ((raw ? sha256(raw) : null) !== revision)
      throw new Error(
        '다른 창에서 검수를 저장했습니다. 새로 열어 확인해 주세요.',
      )
  }
  async save(value: ReviewState, revision: string | null) {
    return this.exclusive(async () => {
      const source = await loadSource(this.root, value)
      const state = parseReview(value, source)
      await this.checkRevision(state, revision)
      await atomicJson(this.root, this.reviewPath(state), {
        schemaVersion: 1,
        state,
      })
      return this.load(state)
    })
  }
  private async prepare(value: ReviewState): Promise<Prepared> {
    const errors: string[] = [],
      summary: string[] = []
    const assets = new Map<string, Uint8Array>()
    let data: CharacterData | null = null
    try {
      const source = await loadSource(this.root, value)
      const state = parseReview(value, source)
      if (source.currentError) throw new Error(source.currentError)
      const currentHashes: Record<string, string> = {}
      const candidateAsset = async (id: string): Promise<string> => {
        const bytes = await readCandidateAsset(this.root, source, id)
        const decoded = await decodeWebP(bytes)
        const relative = `assets/${decoded.sha256}.webp`
        assets.set(relative, bytes)
        return relative
      }
      const currentAsset = async (relative: string) => {
        const bytes = await readCurrentAsset(this.root, source, relative)
        await decodeWebP(bytes)
        currentHashes[relative] = sha256(bytes)
        return relative
      }
      let portrait = ''
      try {
        portrait = state.portraitCandidateId
          ? await candidateAsset(state.portraitCandidateId)
          : source.current
            ? await currentAsset(source.current.portrait)
            : ''
        if (!portrait) errors.push('초상화를 선택해 주세요.')
      } catch (error) {
        errors.push(`초상화: ${errorMessage(error)}`)
      }
      const skills: CharacterData['skills'] = []
      const linked = new Set(
        state.existingSkills.map((s) => s.candidateId).filter(Boolean),
      )
      for (const skill of state.existingSkills) {
        const old = source.current!.skills.find(
          (s) => s.skillId === skill.skillId,
        )!
        let asset = old.asset
        try {
          if (skill.candidateId) asset = await candidateAsset(skill.candidateId)
          else if (skill.visible) await currentAsset(asset)
        } catch (error) {
          errors.push(
            `${skill.displayName || skill.skillId}: ${errorMessage(error)}`,
          )
        }
        skills.push({
          skillId: skill.skillId,
          ...(skill.category ? { category: skill.category } : {}),
          displayName: skill.displayName.trim(),
          visible: skill.visible,
          asset,
        })
        if (
          skill.category !== old.category ||
          skill.displayName.trim() !== old.displayName ||
          skill.visible !== old.visible ||
          asset !== old.asset
        )
          summary.push(
            `기존 스킬 변경: ${old.displayName || old.skillId} → ${skill.displayName.trim() || '(이름 없음)'} · ${skill.category ?? '미분류'} · ${skill.visible ? '노출' : '비노출'}${asset !== old.asset ? ' · 아이콘 변경' : ''}`,
          )
      }
      for (const candidate of state.candidates) {
        if (
          candidate.decision === 'pending' &&
          !linked.has(candidate.candidateId)
        )
          errors.push(`미검수 후보: ${candidate.candidateId}`)
        if (candidate.decision !== 'include') continue
        try {
          const asset = await candidateAsset(candidate.candidateId)
          skills.push({
            skillId: candidateSkillId(state.characterId, candidate.candidateId),
            ...(candidate.category ? { category: candidate.category } : {}),
            displayName: candidate.displayName.trim(),
            visible: true,
            asset,
          })
          summary.push(
            `새 스킬 노출: ${candidate.displayName.trim() || '(이름 없음)'}`,
          )
        } catch (error) {
          errors.push(
            `${candidate.displayName || candidate.candidateId}: ${errorMessage(error)}`,
          )
        }
      }
      if (source.current?.displayName !== state.displayName.trim())
        summary.push(
          `공명자 이름: ${source.current?.displayName ?? '신규'} → ${state.displayName.trim()}`,
        )
      if (source.current?.attribute !== state.attribute)
        summary.push(`속성: ${state.attribute}`)
      if (
        source.current &&
        source.current.skills.map((s) => s.skillId).join('\n') !==
          skills.map((s) => s.skillId).join('\n')
      )
        summary.push('스킬 목록 또는 표시 순서 변경')
      if (source.current?.portrait !== portrait) summary.push('초상화 변경')
      for (const kind of AUTO_KINDS) {
        if (!state.autoActions[kind])
          errors.push(`자동 행동을 지정해 주세요: ${AUTO_LABELS[kind]}`)
        if (source.current?.autoActions[kind] !== state.autoActions[kind]) {
          const name =
            skills.find((s) => s.skillId === state.autoActions[kind])
              ?.displayName ?? '(미지정)'
          summary.push(`${AUTO_LABELS[kind]}: ${name}`)
        }
      }
      const proposed = {
        schemaVersion: 1,
        reviewStatus: 'approved',
        characterId: state.characterId,
        displayName: state.displayName.trim(),
        attribute: state.attribute,
        portrait,
        skills,
        autoActions: state.autoActions,
      }
      try {
        data = validateCharacterData(proposed, state.characterId)
      } catch (error) {
        errors.push(errorMessage(error))
      }
      // 다른 공명자가 가진 공개 ID와 충돌하는 기존 데이터도 반영 전에 차단한다.
      const registrations = await scanRegistered(this.root)
      for (const entry of registrations.filter(
        (r) => r.characterId !== state.characterId && r.raw,
      )) {
        try {
          const other = JSON.parse(entry.raw!)
          if (
            Array.isArray(other.skills) &&
            other.skills.some((s: { skillId?: string }) =>
              skills.some((own) => own.skillId === s?.skillId),
            )
          )
            errors.push(
              `다른 공명자(${entry.characterId})의 스킬 ID와 충돌합니다.`,
            )
        } catch {
          /* 다른 손상 데이터는 자체 오류로 남기며 이 공명자를 대체하지 않는다. */
        }
      }
      const token = errors.length
        ? null
        : sha256(
            JSON.stringify({
              state,
              data,
              currentHashes,
              assets: [...assets.keys()],
            }),
          )
      return { errors, summary, token, data, assets }
    } catch (error) {
      errors.push(errorMessage(error))
    }
    return { errors, summary, token: null, data, assets }
  }
  async validate(state: ReviewState): Promise<ReviewValidation> {
    const { errors, summary, token } = await this.prepare(state)
    return { errors, summary, token }
  }
  async publish(value: ReviewState, revision: string | null, token: string) {
    return this.exclusive(async () => {
      await this.checkRevision(value, revision)
      const prepared = await this.prepare(value)
      if (
        !token ||
        token !== prepared.token ||
        prepared.errors.length ||
        !prepared.data
      )
        throw new Error(
          prepared.errors.join('\n') ||
            '검증 후 내용이 변경되었습니다. 다시 검증해 주세요.',
        )
      const finalDirectory = path.join(
        this.root,
        'src/assets/characters',
        value.characterId,
      )
      await ensureDirectory(this.root, path.join(finalDirectory, 'assets'))
      await ensureDirectory(this.root, path.join(finalDirectory, 'data'))
      for (const [relative, bytes] of prepared.assets) {
        const file = path.join(finalDirectory, relative)
        const existing = await optionalFile(this.root, file)
        if (existing && sha256(existing) !== sha256(bytes))
          throw new Error('동일 자산 경로에 다른 이미지가 있습니다.')
        if (!existing) await writeFile(file, bytes, { flag: 'wx' })
      }
      const finalFile = path.join(
        finalDirectory,
        'data',
        `${value.characterId}.json`,
      )
      const before = await optionalFile(this.root, finalFile)
      if ((before ? sha256(before) : null) !== value.baseHash)
        throw new Error('반영 중 최종 파일이 변경되었습니다.')
      const runDirectory = targetDirectory(this.root, value)
      await assertInside(this.root, runDirectory)
      if (before)
        await writeFile(
          path.join(runDirectory, `before-publish-${randomUUID()}.json`),
          before,
          { flag: 'wx' },
        )
      // 최종 JSON은 모든 준비와 재검증이 성공한 뒤 마지막에 원자적으로 교체한다.
      await this.beforeCommit?.()
      const checked = await this.prepare(value)
      if (checked.token !== token || checked.errors.length)
        throw new Error(
          '반영 준비 중 원본이 변경되었습니다. 다시 검증해 주세요.',
        )
      await atomicJson(this.root, finalFile, prepared.data)
      const source = await loadSource(this.root, value)
      const next = initialReview(source)
      const linked = new Set(value.existingSkills.map((s) => s.candidateId))
      for (const candidate of next.candidates) {
        const previous = value.candidates.find(
          (c) => c.candidateId === candidate.candidateId,
        )!
        if (
          previous.decision !== 'pending' ||
          linked.has(candidate.candidateId)
        )
          candidate.decision = 'exclude'
        candidate.displayName = previous.displayName
        if (previous.category) candidate.category = previous.category
      }
      next.candidates.sort(
        (a, b) =>
          value.candidates.findIndex((c) => c.candidateId === a.candidateId) -
          value.candidates.findIndex((c) => c.candidateId === b.candidateId),
      )
      let warning: string | null = null
      try {
        await atomicJson(this.root, this.reviewPath(value), {
          schemaVersion: 1,
          state: next,
        })
      } catch (error) {
        warning = `최종 반영은 완료했지만 검수 상태 저장에 실패했습니다: ${errorMessage(error)}`
      }
      const raw = await optionalFile(this.root, this.reviewPath(value))
      return {
        session: {
          source,
          state: next,
          revision: raw ? sha256(raw) : null,
          conflict: warning,
        } satisfies ReviewSession,
        warning,
      }
    })
  }
}
