# 파티·타임라인 Editor 연결 명세

## 기능 목적

현재의 정적 앱 Shell을 `Rotation` 상태를 읽고 도메인 명령을 실행하는 Editor로 연결한다. 파티 순서와 두 Cycle의 3라인을 하나의 데이터에서 표시하고, 화면 조작이 기존 도메인 불변조건을 우회하지 않도록 한다. 이 작업은 입력 캡처와 완성형 프로젝트 관리에 앞선 Editor 연결 단계다.

## 관련 요구사항

- `docs/requirements-checklist.md` 2–4절: 파티 편성, active line, SkillBlock 편집, Shared Timeline, Transition·AutoAction.
- `docs/PRD.md` 4–5절: 데스크톱 화면 구조와 `Rotation` 데이터 모델 및 불변조건.
- `docs/PRD.md` 7–10절: 파티 순서·교체, 스킬 진열, 사이클 편집, 교체와 자동 행동 표시.
- `specs/2026-09-30-000-project-foundation.md`: 앱 Shell과 도메인 모델.
- `specs/2026-09-30-001-rotation-domain-operations.md`: UI에서 호출할 도메인 편집 명령.

## 범위

1. 앱이 하나의 `Rotation` 편집 상태를 소유하고, 파티·스킬 진열·개막·반복 화면을 같은 상태에서 렌더링한다. UI 이벤트는 도메인 명령을 호출하고 성공한 반환값만 상태에 반영한다.
2. 파티 3슬롯과 각 Cycle의 3라인을 공명자 ID에 따라 연결한다. 파티 순서 변경은 `reorderParty`, 슬롯 공명자 교체는 `replacePartyCharacter`, Cycle별 편집 라인 변경은 `setActiveCharacter`를 사용한다.
3. 공명자 선택 UI는 검수된 공명자 목록을 주입받는 구조로 만든다. 사용 가능한 데이터가 있을 때 PRD의 6속성 분류와 중복 선택 방지를 적용한다. 전체 공명자 데이터 수집이나 파일명 기반 의미 추론은 이 작업에 포함하지 않는다.
4. 각 Cycle의 `columns`를 단일 전역 열 순서로 렌더링한다. 열 하나의 폭은 세 라인이 공유하고, 행동은 `ownerId`의 라인에만 표시한다. 가로 스크롤은 Cycle별로 제공한다.
5. InputBlock의 입력·gesture·연결 SkillBlock, AutoAction의 종류·검수된 스킬 참조, Transition의 라인 이동 의미를 표시한다. Transition에 실제 `TimelineColumn`이나 숫자키 카드를 추가하지 않는다.
6. 이미 존재하는 도메인 명령과 연결되는 편집 조작을 제공한다: InputBlock 삭제·같은 Cycle 내 전역 순서 이동, SkillBlock 추가·삭제·내부 재정렬·stage 변경, AutoAction 삭제. UI는 AutoAction의 수정·이동을 허용하지 않는다.
7. 파티 공명자 교체로 양쪽 Cycle의 해당 라인과 연결 교체가 정리되는 결과를 사용자에게 경고한다. 경고는 실제 변경 내용을 바탕으로 하며 관련 없는 행동이 삭제된 것처럼 표현하지 않는다.

## 이번 작업의 비범위

- 실제 키·마우스 입력의 press/release 캡처, 400ms tap/hold 판정 및 숫자키 교체 생성. 별도 입력 캡처 spec에서 다룬다.
- 공명자 전체 데이터 수집, `wuwa-character-sync`, 미검수 스킬 또는 AutoAction 의미의 자동 확정.
- 서로 다른 InputBlock 사이의 SkillBlock 직접 이동, Transition 직접 선택·삭제 UI.
- Undo/Redo UI와 이력, IndexedDB 프로젝트 관리, JSON Import/Export, PNG Export, 배포.
- 모바일 UX와 정확한 픽셀 크기·색상·간격의 제품 규칙 확정.

## 사용자 동작 및 UX

- 파티 슬롯과 Cycle 라인은 현재 파티 순서대로 보인다. 슬롯 또는 Cycle 아이콘의 순서 변경은 두 Cycle의 표시 순서를 함께 바꾸되 `columns`의 시간 순서를 바꾸지 않는다.
- Cycle의 공명자 아이콘 클릭은 해당 Cycle의 active line만 바꾸고 왼쪽 스킬 진열의 편집 대상을 그 라인으로 전환한다. 다른 Cycle의 active line은 유지한다. 한 번에 스킬을 진열하는 대상 라인은 하나다.
- 공명자 교체는 다른 슬롯의 중복 선택을 막고 두 Cycle의 해당 공명자 내용을 초기화한다. 사용자가 결과를 이해할 수 있도록 경고를 표시한다.
- InputBlock은 스킬이 0개여도 보인다. 스킬 하나는 합성 카드로, 두 개 이상은 순서가 있는 카드로 보인다. `stage=0`은 단수 표시가 없으며 AutoAction에는 stage나 직접 입력을 표시하지 않는다.
- hover·wheel·Delete·drag의 대상 구분과 행동은 PRD 9.1절을 따른다. 단일 스킬 합성 카드의 Delete는 InputBlock 전체 삭제로 연결한다.

## 도메인 데이터에 미치는 영향

- UI의 line index와 파티 숫자 `1/2/3`은 표시 위치이며 영구 identity가 아니다. 행동·Transition은 공명자 ID와 도메인의 `switchId`를 유지한다.
- Cycle별 `columns`, `transitions`, `suppression`, `activeCharacterId`는 서로 독립적이다. 화면용 배열을 Rotation에 다시 저장하거나 라인별 독립 Timeline을 만들지 않는다.
- 모든 편집은 완결된 새 `Rotation`을 한 번에 반영한다. 이 경계는 후속 Undo/Redo 이력의 한 편집 단위가 된다.
- 스킬 및 공명자 표시용 메타데이터는 `Rotation`의 행동 순서나 AutoAction 존재 여부를 재구성하지 않는다.

## 주요 구현 방법

1. 상태 소유 계층에서 도메인 명령을 호출하고 검증된 새 상태를 적용한다. 렌더러는 읽기 전용 projection으로 분리한다.
2. 세 라인을 각각 별도 시간 배열로 만들지 않고 `cycle.columns.map`으로 열을 구성한 뒤 각 열의 `ownerId`에 맞는 셀에 행동을 배치한다. Transition은 `afterColumnId`가 가리키는 경계에 별도 시각 요소로 투영한다.
3. 공명자·스킬 표시 데이터는 명시적 카탈로그 인터페이스 뒤에 둔다. 개발·테스트 fixture는 실제 제품 데이터와 구분하고, 검수되지 않은 파일명으로 `skillRef`나 자동 행동을 추론하지 않는다.
4. 편집 이벤트는 대상 Cycle·column/action/skill ID를 명시적으로 전달한다. Drag의 목표는 같은 Cycle의 전역 열 index이며, 이동 후에도 `ownerId`는 유지한다.
5. 파티 교체 전후의 상태 차이로 경고에 필요한 제거 범위를 계산한다. 정확한 경고 문구와 표시 방식은 별도 제품 결정 없이 PRD의 경고 요구 수준에 맞춰 구현한다.

## 예외 및 edge case

- 검수된 카탈로그에 없는 공명자·스킬 참조는 임의의 이름이나 Skill 의미로 대체하지 않는다. 데이터가 없는 상태와 손상된 참조를 구분할 수 있어야 한다.
- 비어 있는 Cycle, 스킬 0개 InputBlock, 동일 `skillRef`의 중복, 여러 Transition이 한 경계에 있는 상태도 렌더링한다.
- AutoAction이 삭제·suppression된 교체는 렌더 과정에서 자동 행동을 재생성하지 않는다. 협주 linked pair 삭제 후에도 남은 Transition을 표시한다.
- 파티 재정렬 후 active line은 원래 공명자를 계속 가리키며, 두 Cycle의 내용과 Transition·AutoAction 소유권은 바뀌지 않는다.
- 다른 Cycle로의 직접 이동, 수직 이동에 따른 소유권 변경, AutoAction 드래그는 허용하지 않는다. 잘못된 명령은 UI 상태를 부분 변경하지 않는다.

## 테스트 계획

- 공통 열 grid의 X 정렬, 소유 라인 표시, 빈 Cycle, 가로 스크롤을 컴포넌트 테스트와 수동 브라우저 확인으로 검증한다.
- 파티 순서 변경과 공명자 교체 뒤 두 Cycle의 표시·active line·원본 소유권 및 경고 내용을 확인한다.
- InputBlock과 SkillBlock의 삭제·이동·stage 변경, AutoAction 읽기 전용 및 linked pair 삭제를 UI 이벤트와 도메인 상태 양쪽에서 확인한다.
- 협주 outro/intro의 별도 열, Transition 무열 표시, suppression 유지, opening/repeat 독립성을 fixture로 확인한다.
- 작업 완료 전 저장소의 `lint`, `test`, `build`를 실제로 실행한다. 구현 중 도메인 결함을 발견하면 해당 동작의 단위 테스트를 먼저 보강한다.

## 남아 있는 미확정 사항과 선행 조건

- 실제 파티 선택과 스킬 진열의 제품 검증에는 사람이 검수한 공명자·스킬 데이터가 필요하다. 이 spec은 카탈로그 연결 계약을 정의하며 데이터 수집·검수 자체는 별도 작업이다.
- 실제 입력으로 블록과 교체를 만드는 조작은 입력 캡처 작업이 완료되어야 사용자가 직접 시험할 수 있다. 그 전에는 UI fixture와 도메인 테스트로 Editor 투영 및 편집을 검증한다.
- 현재 편집 Cycle은 사용자가 해당 Cycle의 공명자 라인을 클릭하면 전환한다는 사용자 결정을 적용한다. Transition 직접 삭제 UX와 다른 InputBlock 간 SkillBlock 이동 UX는 구현 편의만으로 확정하지 않는다.
