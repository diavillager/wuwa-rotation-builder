# `wuwa-rotation-builder` 확정 요구사항 체크리스트

이 문서는 제공된 확정사항 요약, 확인 가능한 참조 대화, 이후 보강 요청을 PRD와 대조한 기록이다. 체크 표시된 항목은 제품 요구사항이다. 미확정 항목은 아래 점검 결과에 따로 둔다.

## 1. 제품과 범위

- [x] 한국어 우선, 데스크톱 중심의 Wuthering Waves 3인 파티 로테이션 빌더. 저장소 이름은 `wuwa-rotation-builder`.
- [x] GitHub를 원본 저장소로 사용하고 localhost에서 개발한다. 대상 공명자 데이터를 모두 등록한 뒤 첫 배포한다. 배포처는 추후 결정한다.
- [x] MVP 제외: 로그인, 클라우드 저장, 커뮤니티 DB, 자동 DPS, 자동 협주 게이지 계산, 자동 로테이션 추천.

## 2. 화면과 파티

- [x] 상단 전체 너비 파티 편성, 하단 좌측 스킬 진열, 우측 사이클 편집.
- [x] 개막과 반복은 위아래의 독립 사이클이며 각 3라인, 독립 active line과 시간축을 가진다. 파티 구성/순서만 공유한다. 새 프로젝트에서 두 active line은 모두 파티 첫 슬롯으로 시작하고 이후 독립적으로 바뀐다.
- [x] Editor는 가로 스크롤. Export는 3라인 묶음으로 함께 줄바꿈한다.
- [x] 파티는 3슬롯 고정, 슬롯 클릭으로 선택창을 연다. 선택창은 응결/용융/전도/기류/회절/인멸 순서의 6속성 탭으로 분류한다. 처음 열면 응결이 선택되며 해당 속성의 공명자만 표시한다. 중복 선택을 막는다.
- [x] 슬롯 드래그로 순서를 바꾸면 두 사이클의 라인 순서와 해당 공명자의 내용이 함께 재배열된다. Timeline 행동의 시간 순서는 변하지 않으며 InputBlock/AutoAction/Transition/linked AutoAction의 소유 공명자와 참조도 유지된다. `1/2/3`과 line 번호는 표시 위치다.
- [x] 사이클의 공명자 아이콘 클릭은 해당 사이클의 편집 라인만 바꾼다. 아이콘 드래그는 파티 순서를 바꾼다.
- [x] 슬롯의 공명자를 교체하면 그 슬롯에 연결된 두 사이클의 라인 내용을 초기화한다. 기존 공명자가 개막 또는 반복 사이클에 행동이나 교체를 가지고 있으면 변경 전에 경고하고 확인을 받는다. 양쪽 사이클 모두 비어 있으면 경고 없이 변경한다.

## 3. 입력과 스킬

- [x] Input-first: 실제 입력을 기록하며 키만 보고 스킬 의미를 추론하지 않는다.
- [x] 캡처 대상은 `Q/E/R/T/Space/1/2/3/LMB/RMB`; `WASD`는 제외한다. gesture는 `tap|hold`, 공통 hold 기준은 400ms다.
- [x] 최초 press부터 release까지의 시간으로 gesture를 판정한다. `< 400ms`는 tap, `>= 400ms`는 hold다. 키보드 자동 repeat `keydown`을 여러 입력으로 기록하지 않는다.
- [x] 입력 캡처는 사이클 필드의 빈 영역 hover에서만 활성화된다. 빈 영역은 사이클 내부이며 블록 또는 조작 UI를 가리키지 않는 위치다. LMB/RMB도 실제 입력으로 생성한다.
- [x] RMB를 빈 사이클 영역에서 Rotation 입력으로 캡처할 때만 브라우저 context menu를 막는다. 사이클 밖과 다른 UI의 일반 RMB 동작은 불필요하게 막지 않는다.
- [x] 숫자키 tap은 일반 교체, hold는 협주 교체 편집 명령이다.
- [x] 스킬 진열에는 해당 사이클의 active line 공명자 스킬만 표시한다. MVP에는 카테고리 그룹/필터가 없다. 파일명을 노출하지 않고 displayName을 사람이 검수한다.
- [x] 진열 SkillBlock과 다중 InputBlock 내부 SkillBlock은 같은 카드 디자인을 사용한다.
- [x] InputBlock은 실제 조작 컨테이너이고 SkillBlock을 0개 이상 순서대로 연결한다. 같은 skillRef 중복이 가능하다.
- [x] SkillBlock은 `skillRef`와 `stage`를 가진다. SkillBlock hover+Wheel Up은 stage +1, Wheel Down은 stage -1이다. 최솟값은 0으로 그 아래로 내려가지 않는다. `stage=0`은 “0단”이 아니라 단수 표시 없음이다. 단수는 스킬 표시가 켜졌을 때만 보이고 AutoAction에는 stage가 없다.
- [x] SkillBlock이 1개면 InputBlock과 하나의 카드로 합쳐 보이고 hover+Delete는 전체 삭제한다. 2개 이상이면 각 스킬이 좌→우 별도 카드다. 0→1 첫 추가, 1→2 항상 뒤, 2개 이상일 때 드롭 위치에 따라 앞/사이/뒤 삽입한다.
- [x] 단일/다중 InputBlock의 외곽 높이는 같고 폭만 늘어난다. 스킬 카드 드래그 재정렬, hover+wheel stage 변경, hover+Delete 스킬 삭제가 가능하다. InputBlock hover+Delete는 전체 삭제다.
- [x] InputBlock 드래그는 같은 Cycle의 전역 Timeline 순서를 재배열하므로 다른 공명자의 블록 사이에도 배치할 수 있다. 드래그한 블록의 소유 공명자는 유지되고 자기 공명자 라인에 렌더링된다. 다른 공명자 라인으로의 수직 이동이나 개막↔반복 사이의 직접 이동은 금지한다.
- [x] 기본 조작: hover=대상 지정, wheel=값 변경, Delete=삭제, drag=이동/삽입, 키보드/마우스=실제 입력 생성. 지속 선택 상태는 최소화한다.

## 4. 시간축, 교체, 자동 행동

- [x] 각 사이클의 3라인은 하나의 전역 열 시간축을 공유한다. 한 열의 세 라인 전체에 행동 블록은 하나뿐이다. 블록 폭이 늘어나면 열 전체 폭과 모든 라인의 X 정렬이 함께 바뀐다. 순서의 중심은 `TimelineColumn[]`에 가깝다.
- [x] 새 InputBlock은 active line의 마지막 편집 가능 위치에 삽입한다. 마지막이 교체이면 교체 직전, 협주 교체의 반주 AutoAction이 마지막이면 반주 직전이다. 뒤의 열은 밀린다.
- [x] Transition은 열을 차지하지 않는다. Editor와 전체 정보 Export에서는 라인 이동으로 보인다. 조작 중심 Export에서만 숫자키 블록으로 펼친다. 라인 아이콘 클릭은 Transition이나 AutoAction을 만들지 않는다.
- [x] 일반 교체는 등장 라인에 자동 일반공격, 협주 교체는 퇴장 라인에 반주 및 등장 라인에 변주 AutoAction을 만든다.
- [x] AutoAction은 독립 열을 차지한다. 조작 정보와 stage가 없고 읽기 전용이며 삭제만 가능하다. 수정, 스킬 추가, 단수 변경, 이동은 불가하다.
- [x] 협주 반주/변주는 동일 `switchId`의 linked pair다. 한쪽 삭제 시 양쪽 삭제하고 재생성 suppression을 기억한다. 일반교체 자동공격은 단독 삭제하며 suppression을 기억한다. suppression은 재렌더·IndexedDB 저장/로드·JSON Export/Import 후에도 유지되는 RotationProject 편집 상태다.
- [x] 공명자 JSON의 `autoActions.normalSwitchAttack / intro / outro`는 서로 독립적으로 사람이 지정한다. 일반공격과 변주는 등장자, 반주는 퇴장자의 데이터다.

## 5. Export, 저장, Undo

- [x] Export는 PNG 두 모드. 전체 정보에는 입력, 스킬 아이콘/이름/stage, AutoAction이 보이고 숫자키 교체 블록은 숨긴다. 조작 중심에는 입력키만 보이고 Skill/stage/AutoAction은 숨기며 교체를 실제 숫자키 `[1]` 등으로 펼친다. 협주도 `[2 Hold]` 대신 `[2]`로 쓴다.
- [x] Editor와 Export renderer는 분리한다. 빈 개막/반복 사이클은 출력하지 않는다. 3라인을 한 묶음으로 wrap하며 실제 렌더링된 Column 폭의 누적값으로 판단한다. wrap은 TimelineColumn 경계에서만 하고 개별 Column 또는 넓은 InputBlock 중간을 자르지 않는다. 정확한 px 값은 미확정이다.
- [x] MVP는 프로젝트 생성·이름 변경·복제·삭제, 여러 RotationProject의 IndexedDB 저장·자동저장, JSON Import/Export를 포함한다. Import는 새 ID의 프로젝트로 추가한다. 새 프로젝트에는 `새 로테이션 1` 식으로 자동 이름을 붙이고 이후 변경할 수 있으며 `createdAt/updatedAt`을 저장한다.
- [x] 백업은 `app: wuwa-rotation-builder`, `schemaVersion`, ID 참조와 최소 snapshot(displayName/asset 등)을 포함한다. 이미지 바이너리/Base64 이미지는 넣지 않는다. 공개된 asset/skill ID는 호환을 위해 삭제/rename보다 비활성화한다.
- [x] Skill/Character 참조는 매번 로드할 때 현재 ID 데이터→저장된 최소 snapshot→복구 불가 시 missing 상태 순서로 해석한다. 유사 이름이나 다른 Skill로 자동 대체하지 않는다. 과거에 snapshot/missing을 사용했어도 현재 앱에 동일 ID가 다시 있으면 현재 데이터를 우선한다. fallback 판정은 영구 고정 상태가 아니며 AutoAction suppression과 구분한다.
- [x] Undo/Redo는 열린 로테이션 편집만 대상으로 한다. 블록 및 스킬 편집, 교체/자동행동, AutoAction 삭제, 파티 순서, 공명자 교체로 인한 라인 초기화, 개막/반복 내용 변경을 포함한다. 프로젝트 생성/삭제/복제/Import/이름 변경은 제외한다.
- [x] 향후 외부 DB는 Repository 계층으로 확장할 수 있도록 한다.

## 6. 공명자 데이터와 개발용 Skill

- [x] 데이터 경로: `src/assets/characters/{characterId}/data/{characterId}.json`; 이미지 경로: `src/assets/characters/{characterId}/assets/*.webp`.
- [x] `wuwa-character-sync`는 기존 등록 확인→Encore 목록 비교→미등록 탐지→기본 정보/한국어 이름/속성/초상화 후보 수집→Encore Character API와 WW_Data의 스킬 아이콘 후보 합집합→Encore api-v2 Resource WebP 다운로드/검증→JSON 초안→실제 아이콘이 보이는 로컬 검수 UI→사람의 displayName/사용 여부/세 autoActions 지정→최종 JSON 반영→검증 순서다.
- [x] 자동화는 후보를 넓게 수집해 검수 UI에 제공한다. asset 파일명·path·suffix가 `QTE`/`A1`/`B3`/`Intro`처럼 보이더라도 그것만으로 Skill `displayName`, 노출 여부, 세 autoAction 매핑을 확정하지 않는다. 실제 아이콘과 후보 데이터를 사람이 검수해 의미를 확정한다.
- [x] Encore api-v2 Resource의 WebP 후보는 HTTP 요청 성공, 기대 이미지 형식의 응답 Content-Type, 저장 파일의 실제 이미지/WebP 유효성을 확인한다. 다운로드·검증 실패를 기록하고 후보를 조용히 누락하거나 성공·완료 처리하지 않는다.
- [x] 정상 등록 판정에는 `src/assets/characters/{id}/data/{id}.json`의 존재·유효성과 JSON `characterId`의 디렉터리 ID 일치가 필요하다. 폴더만으로 등록 완료로 보지 않는다.
- [x] 최종 검증은 `characterId` 존재/ID 일치, 한국어 `displayName`, 허용된 6속성 `attribute`, portrait asset, 노출 Skill 각각의 `displayName`/WebP asset, Skill ID 중복 없음, 세 autoAction 지정 및 실제 선택·등록 Skill ID 참조를 포함한다. 필수 항목 미충족 Character는 완료 처리하지 않는다. WebP 다운로드/검증 실패 후보는 실패를 기록하고 조용히 누락하거나 완료 처리하지 않는다.
- [x] 미등록 전체 동기화와 특정 공명자 재동기화를 지원한다. 전체 신규 동기화는 기존 검수 Character를 덮어쓰지 않는다. 재동기화에서도 기존 `displayName`/사용 여부/autoAction 매핑 등 사람 검수 결과 보존이 기본이며 새 후보와 기존 검수 데이터를 구분해 검수한다.
- [x] Hiyuki 1108, Sanhua 1102, Cartethyia 1409 spike에서 후보 합집합과 Encore v2 WebP 조회를 검증했다. 의미 판별은 사람 검수 대상이다. 출시 전 라이선스/게임 IP 재배포 여부를 별도 재확인한다.

## 대조 결과와 미확정 결정

**핵심 동작에 상충하는 확정사항은 발견되지 않았다.** 다음은 헷갈리기 쉬운 지점을 PRD에서 명시한다.

1. “같은 열에 한 행동”과 협주 linked pair는 양립한다. 반주와 변주는 각각 별도의 AutoAction 열이고 `switchId`로 묶인다.
2. “교체는 열 없음”과 조작 중심 Export의 `[2]`도 양립한다. Export renderer가 Transition을 출력용 블록으로 펼칠 뿐 Editor 데이터에 열을 추가하지 않는다.
3. “현재 라인 끝 삽입”은 전역 끝 삽입이 아니다. 퇴장 라인의 교체 묶음 앞에 끼워 넣고 후속 열을 밀어낸다.
4. “스킬 카드 hover+Delete”와 “InputBlock hover+Delete”는 대상 영역으로 구분한다. 단일 스킬 합성 카드는 전체 InputBlock 삭제다.
5. “개막/반복 독립”은 active line과 내용/시간축을 뜻한다. 파티 구성과 순서는 공유한다.

**구현 전에 또는 출시 전에 정할 사항:**

- 첫 배포에 포함할 “모든 대상 공명자”의 기준 목록과 기준 시점. 이 기준이 있어야 출시 게이트를 판정할 수 있다.
- 지원 브라우저 및 최소 화면 폭. 데스크톱 중심이라는 방향만 확정되었다.
- 데이터에 누락된 autoAction 지정이 있을 때 교체 생성 처리, 지원 불가 schemaVersion/손상된 JSON의 구체 오류·복구 UX 및 JSON missing 상태의 정확한 시각 디자인. 핵심 데이터 불변조건을 깨지 않는 방향으로 구현 단계에서 결정해야 한다.
- 색/테두리/px/여백/hover 효과/Pretendard weight, Undo 최대 개수, 자동저장 debounce, IndexedDB 래퍼, 프론트엔드 스택, PNG 정확한 폭/여백, 배포처.

입력 데이터를 향후 gamepad 확장 가능한 `device + control + gesture` 형태 등으로 표현하는 것은 **구현 권장사항**이며 MVP gamepad UI 요구사항이 아니다. 공명자 ID 기반 소유권 저장과 파티 재정렬 시 line reference의 원자적 remap도 **구현 방식 선택지**다. 두 방식 모두 재정렬 후 소유 공명자 유지라는 확정 조건을 만족해야 한다.

위 항목은 확정 요구사항으로 간주하지 않으며 PRD의 “추후 결정/구현 권장사항”에 둔다.
