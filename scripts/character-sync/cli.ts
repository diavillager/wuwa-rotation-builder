import { parseArgs } from 'node:util'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { remoteSources } from './sources'
import { runSync } from './run'
import { errorMessage, scanRegistered } from './io'

const help = `공명자 후보 수집 (최종 검수 데이터는 변경하지 않습니다)
npm run character-sync -- --all --plan           미등록/손상 대상 확인
npm run character-sync -- --all                  대상 전체 후보 수집
npm run character-sync -- --character <ID>       지정 공명자 재수집
npm run character-sync -- --character <ID> --ww-ref <40자리 SHA>
npm run character-sync -- --character <ID> --character <ID> --asset-ref <40자리 SHA>
npm run characters:validate                       로컬 최종 데이터·이미지 검증
결과: .character-sync/runs/<실행 ID>/report.json 및 <ID>/draft.json
종료 코드: 0=수집/검증 성공(검수·등록 완료 아님), 1=부분/전체 실패, 2=인자 오류`

export async function main(args: string[]) {
  let values
  try {
    values = parseArgs({
      args,
      options: {
        all: { type: 'boolean' },
        character: { type: 'string', multiple: true },
        plan: { type: 'boolean' },
        validate: { type: 'boolean' },
        'ww-ref': { type: 'string' },
        'asset-ref': { type: 'string' },
        help: { type: 'boolean' },
      },
      allowPositionals: false,
    }).values
    if (values.help) {
      console.log(help)
      return 0
    }
    if (
      Number(!!values.all) +
        Number(values.character !== undefined) +
        Number(!!values.validate) !==
      1
    )
      throw new Error('--all, --character, --validate 중 하나를 지정하세요.')
    if (
      values.validate &&
      (values.plan || values['ww-ref'] || values['asset-ref'])
    )
      throw new Error(
        '--validate는 --plan/--ww-ref/--asset-ref와 함께 사용하지 않습니다.',
      )
    if (values.character?.some((id) => !/^\d+$/.test(id)))
      throw new Error('공명자 ID는 숫자 문자열이어야 합니다.')
    if (values['ww-ref'] && !/^[0-9a-f]{40}$/.test(values['ww-ref']))
      throw new Error('WW_Data commit은 40자리 SHA여야 합니다.')
    if (values['asset-ref'] && !/^[0-9a-f]{40}$/.test(values['asset-ref']))
      throw new Error('WW_Asset commit은 40자리 SHA여야 합니다.')
  } catch (error) {
    console.error(errorMessage(error))
    console.error(help)
    return 2
  }
  const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
  try {
    if (values.validate) {
      const result = await scanRegistered(root)
      console.log(
        JSON.stringify(
          result.map(({ characterId, valid, errors }) => ({
            characterId,
            valid,
            errors,
          })),
          null,
          2,
        ),
      )
      console.log(
        `검증 대상 ${result.length}개 · 오류 ${result.filter((r) => !r.valid).length}개`,
      )
      return result.some((r) => !r.valid) ? 1 : 0
    }
    const result = await runSync(
      root,
      remoteSources(values['ww-ref'], values['asset-ref'], root),
      values.all ? { all: true } : { characters: values.character! },
      values.plan,
    )
    if (result.plan)
      console.log(
        JSON.stringify(
          {
            targets: result.targets,
            registrationErrors: result.registrations
              .filter((r) => !r.valid)
              .map(({ characterId, errors }) => ({ characterId, errors })),
          },
          null,
          2,
        ),
      )
    else {
      console.log(
        JSON.stringify(
          {
            directory: result.directory,
            results: result.report.results,
            errors: result.report.errors,
          },
          null,
          2,
        ),
      )
      return result.report.errors.length ? 1 : 0
    }
    return 0
  } catch (error) {
    console.error(`수집 실패: ${errorMessage(error)}`)
    return 1
  }
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  process.exitCode = await main(process.argv.slice(2))
