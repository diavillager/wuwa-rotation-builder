# 공명자 후보 수집 도구

저장소 루트에서 Node.js 20.19 이상, npm, Git으로 실행합니다. `npm install`은 TypeScript 실행기 `tsx`와 WebP 디코더 `sharp`를 개발 의존성으로 설치합니다. 이 도구는 앱 번들에 들어가지 않습니다.

```sh
npm run character-sync -- --all --plan
npm run character-sync -- --all
npm run character-sync -- --character 1102
npm run character-sync -- --character 1102 --ww-ref 9218d612ad815e398e064e577e42aaf878899968
npm run character-sync -- --character 1413 --character 1211 --character 1209 --character 1207 --character 1205 --character 1206 --asset-ref aba4a7d41f46afa1b303252fcb21905215054fa9
npm run characters:validate
```

`1102`는 명령 형식 예시이며 시범 등록 대상 확정을 뜻하지 않습니다. `--plan`은 목록과 로컬 등록 상태를 읽고 대상만 출력합니다. 실제 수집 명령은 매번 새 실행 폴더를 만듭니다. 정상 등록된 공명자는 전체 모드에서 제외하지만 지정 모드에서는 다시 수집합니다. 손상된 등록 데이터는 오류와 함께 수집 대상으로 남기며 원본을 보존합니다.

## 결과와 보존

```text
.character-sync/runs/<실행 ID>/
  report.json                 대상, 등록 검사, 소스 commit, 결과, 오류
  sources/encore-list.json     원본 목록
  sources/ww-data.json         고정 commit의 원본 테이블
  sources/ww-assets.json       고정 commit의 실제 스킬 자산 파일 목록
  <ID>/encore.json             원본 상세 응답
  <ID>/draft.json              미검수 초안과 기존 검수 파일 원문/hash
  <ID>/assets/*.webp           실제 디코딩에 성공한 원본 이미지
  <ID>/review.json             안전하게 이어받은 저장 검수 (있는 경우)
  <ID>/inherited-review.json   이전 실행 ID·revision·검수 원문
  <ID>/carry-error.json        검수 이전이 차단된 이유 (실패한 경우)
```

이 디렉터리는 Git에서 제외합니다. 최종 `src/assets/characters/`와 기존 실행 폴더는 변경하지 않습니다. 초안의 `reviewStatus`는 `pending`이며 `autoActions`와 각 후보의 검수 필드는 `null`입니다. 기본 이름·속성·초상화는 `basicCandidate`에, 스킬 후보 이름은 `sources.candidateName`에 보관합니다. 사람이 의미를 정하기 전에는 앱 catalog로 사용하지 않습니다.

`existingReview`는 이전 최종 파일의 원문·hash·유효성·오류를 담습니다. 재수집은 기존 파일과 공개 ID를 수정하지 않습니다. 검수 UI에서 비교하고 수동으로 연결할 자료입니다. 후보 ID는 정규화한 자산 경로와 종류의 SHA-256으로 생성하므로 배열 순서와 외부 이름 변경에 영향을 받지 않습니다. 동일 경로는 출처를 합치고, 서로 다른 경로의 그림은 자동으로 하나의 스킬로 합치지 않습니다.

같은 공명자의 가장 최근 저장 검수가 있고, 최종 데이터 기준과 기존 후보·이미지가 동일하면 새 실행으로 검수 이름·분류·선택·자동 행동·카드 순서를 복사합니다. 새 후보만 목록 끝에 미검수 상태로 추가합니다. 이전 파일은 보존하며 브라우저의 미저장 편집은 포함하지 않습니다. 충돌·이미지 변경·후보 누락 시 이전하지 않고 report와 검수 화면에 오류를 표시합니다.

이미지는 HTTP 성공·Content-Type·RIFF/WebP 표식·실제 픽셀 디코딩을 모두 통과해야 저장합니다. 성공 기록에 파일 hash와 크기를 남깁니다. 실패 후보도 초안에 남기고 오류를 표시합니다. 요청당 25초 제한을 두며 동기화는 순차 다운로드로 요청 수를 제한합니다. JSON은 32MiB, 이미지는 16MiB, 디코딩은 약 1,677만 픽셀까지 허용합니다. 한도를 넘으면 성공으로 처리하지 않고 오류로 기록합니다.

종료 코드 0은 요청한 수집/검사 성공, 1은 부분·전체 실패, 2는 CLI 인자 오류입니다. 목록 요청 실패는 대상을 확정할 수 없어 실행 폴더 생성 전에 종료합니다. WW_Data 실패 시 Encore 후보는 보존하되 부분 실패로 기록합니다. 정상 등록 수가 0이어도 검사 명령은 오류 없이 끝날 수 있으며 등록 완료를 의미하지 않습니다.

## 현재 확인한 외부 소스

2026-10-01에 직접 응답을 확인한 주소입니다. 아래 서비스는 게임 공식 API가 아닙니다.

- [Encore 한국어 목록](https://api-v2.encore.moe/api/ko/character): `roleList`, `Id`, `Name`, `Element.Name`, `RoleHeadIcon`.
- [Encore 상세 예시](https://api-v2.encore.moe/api/ko/character/1102): `Id`, `Name.Content`, `ElementName`, `RoleHeadIconLarge`, `Skills[].SkillId/SkillName/Icon`.
- 이미지: `https://api-v2.encore.moe/resource/Data/Game/...webp`. 기존 API URL과 Unreal 객체 suffix를 정규화해 이 경로로 요청합니다. `/Resource/...` 또는 `/api/Resource/...`는 확인 당시 HTTP 200 HTML을 반환했으므로 성공 이미지로 취급하지 않습니다.
- [WW_Data 저장소](https://github.com/Arikatsu/WutheringWaves_Data): 실행 시작 시 Git HEAD를 commit SHA로 고정합니다. 확인 당시 HEAD는 `9218d612ad815e398e064e577e42aaf878899968`입니다. 읽는 테이블은 `BinData/role/roleinfo.json`, `BinData/skill/skill.json`, `BinData/skillButton/skillbutton.json`, `BinData/skillButton/skillicon.json`입니다.
- `roleinfo.SkillId → skill.SkillGroupId`로 기본 스킬 아이콘을, `skillbutton.RoleId → SkillIconTags → skillicon.Tag`로 동적 아이콘 후보를 찾습니다. 이미 발견한 전용 아이콘 폴더의 추가 후보도 포함합니다. 이 참조와 폴더명은 후보 탐색에만 쓰며 의미 판정에 사용하지 않습니다.
- [WW_Asset_Webp](https://github.com/alt3ri/WW_Asset_Webp): 메타데이터로 확인한 전용 폴더의 실제 개별 WebP 목록을 합집합에 추가합니다. `--asset-ref` 생략 시 HEAD를 고정합니다. Git `--filter=blob:none --depth=1`과 `ls-tree`로 목록을 읽고 `.character-sync/cache/ww-asset/<SHA>/`에 캐시합니다. 전체 이미지를 checkout하지 않습니다. 전용 폴더의 Atlas 합본과 공용 `SkillIconNor` 전체 열거는 제외하고, 기존 메타데이터의 공용 아이콘은 유지합니다. 추가 후보는 고정 commit의 raw 이미지에서 수집하며 중복 후보는 기존 Encore 다운로드 URL을 유지합니다. 두 저장소의 버전 동기화나 전체 아이콘 완전성을 가정하지 않습니다.

[Encore 이용약관](https://encore.moe/terms)은 서비스 오용과 접근 제어 우회를 금지합니다. 확인한 WW_Data 루트에는 별도 LICENSE 파일이 없었습니다. 접근 성공이 게임 이미지의 재배포 권한 확인을 뜻하지 않으며, PRD에 따라 첫 배포 전에 이용 조건을 재확인합니다.

## 후속 단계

2026-10-01 연결 시험에서 `--all --plan`은 64개 후보 ID를 확인했습니다. 지정 모드 `1102`와 위 고정 WW_Data commit으로 실행해 초상화 1개·스킬 후보 12개를 수집했고 13개 모두 실제 WebP 디코딩을 통과했습니다. 결과는 `.character-sync/runs/2026-10-01T04-45-45-261Z-34b8757b-c897-4b8c-b7b3-d888dfaa27ea/report.json`에 있습니다. 로컬 최종 데이터 검사 대상은 0개이며 이 시험은 등록 완료가 아닙니다.

실제 아이콘 검수·편집·저장·최종 반영은 `npm run character-review`로 실행하는 [로컬 검수 UI](../../tools/character-review/README.md)에서 수행합니다. 수집 CLI에는 최종 등록 명령이 없습니다. 소수 대상 사람 검수와 앱 저장·복원 검증은 4단계입니다. 웹사이트 공통 UI 아이콘은 사용자가 지정한 목록을 받은 후 별도로 수집합니다.
