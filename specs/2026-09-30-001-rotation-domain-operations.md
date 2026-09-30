# 로테이션 도메인 연산 보강 명세

## 기능 목적

기반 구축 단계에서 만든 `Rotation` 모델을 실제 Editor 연결에 앞서 보강한다. 공명자 교체와 InputBlock·SkillBlock 편집을 UI와 독립된 도메인 명령으로 제공하고, 모든 편집에서 Shared Timeline과 소유권, Transition·AutoAction의 의미를 유지한다.

## 관련 요구사항

- `docs/requirements-checklist.md` 2–4절: 파티 소유권, Input-first, SkillBlock 편집, 전역 Timeline, 교체와 자동 행동.
- `docs/PRD.md` 5, 7, 9, 10절: 데이터 불변조건, 공명자 교체, 편집 및 삽입 위치, Transition·AutoAction.
- `docs/PRD.md` 12.3절: 향후 Undo/Redo에서 편집 단위를 원자적으로 취급해야 하는 경계.
- `specs/2026-09-30-000-project-foundation.md`: 기존 모델과 도메인 명령의 출발점.

## 범위

1. 파티 슬롯의 공명자를 다른 공명자로 교체하는 도메인 명령을 추가한다. 두 Cycle에서 기존 공명자 소유의 행동을 초기화하고, 그 공명자가 관련된 Transition 및 연결 AutoAction·suppression을 참조 무결성이 유지되게 정리한다. 다른 공명자의 독립 행동과 두 Cycle의 전역 순서는 유지한다.
2. InputBlock 삭제와 SkillBlock 추가·삭제·재정렬·stage 변경을 명령으로 제공한다. 빈 `skills`, 동일 `skillRef` 중복, 순서, `stage ≥ 0`을 보존한다. 입력키로 Skill을 추론하지 않는다.
3. InputBlock 삽입·재정렬·삭제 뒤에도 Transition anchor가 존재하는 열 또는 유효한 경계를 가리키고, 해당 교체의 AutoAction이 경계의 올바른 쪽에 남도록 한다. AutoAction 자체는 이동·수정하지 않는다.
4. 각 명령은 성공 시 완결된 새 Rotation을 반환하고, 오류 시 원본을 변경하지 않는다. 작업 결과는 이후 Undo/Redo가 한 명령을 한 편집 단위로 기록할 수 있어야 한다.
5. 기존 `assertRotation`을 새 연산의 전후 검증에 맞게 보강한다.

## 비범위

- Editor의 실제 드래그, hover, wheel, Backspace 이벤트와 선택창·경고 UI.
- Transition 직접 선택·삭제 UI 및 서로 다른 InputBlock 사이의 SkillBlock 직접 이동 UX.
- Undo/Redo 이력 저장과 UI, IndexedDB, JSON Import/Export 제품 기능, PNG Export.
- 공명자 데이터 수집과 누락된 autoAction 데이터의 사용자-facing 처리 방식.

## 사용자 동작 및 UX와의 관계

이 spec은 UI 구현이 아닌 명령 계층을 다룬다. 파티 슬롯의 공명자 교체는 PRD대로 기존 슬롯 공명자의 두 Cycle 라인 내용을 초기화해야 하며, UI가 경고를 표시할 수 있도록 정리된 내용의 요약을 반환할 수 있다. 경고의 문구·표시 방식은 여기서 확정하지 않는다. InputBlock 및 SkillBlock 조작은 PRD에 정해진 대상과 의미를 따른다.

## 도메인 데이터에 미치는 영향

- 행동·Transition의 소유권은 현재 파티 슬롯 번호가 아니라 공명자 ID로 유지한다.
- `Cycle.columns`는 계속 단일 전역 배열이며, Transition은 독립 열을 만들지 않는다.
- 공명자 교체로 제거된 Transition의 연결 AutoAction과 suppression도 일관되게 정리한다. 남아 있는 교체의 suppression은 보존한다.
- 정확한 영속 포맷이나 migration을 이번 spec에서 확정하지 않는다. 변경 후 상태는 직렬화 가능한 데이터 구조를 유지한다.

## 주요 구현 방법

- 명령을 `src/domain`의 순수 함수로 두고 공통 검증을 통과한 상태만 반환한다.
- 파티 공명자 교체는 두 Cycle을 한 Rotation 변경으로 계산한다. 참조가 끊어지는 Transition과 그 `switchId`의 AutoAction·suppression을 함께 정리하고, 영향을 받지 않는 열의 상대 순서를 보존한다.
- 열 삭제나 이동으로 anchor가 제거되면 인접한 남은 열 또는 첫 열 앞 경계로 다시 연결한다. 연결 AutoAction의 앞뒤 관계까지 검증한다.
- SkillBlock 위치는 해당 InputBlock 내부의 순서로만 다룬다. `stage`는 정수이고 0 아래로 내려가지 않는다.

## 예외 및 edge case

- 교체 대상이 빈 ID이거나 파티의 다른 슬롯에 이미 있으면 거부한다. 동일 공명자 재선택에 대한 UI 처리는 이번 작업에서 확정하지 않는다.
- 교체 대상 공명자가 두 Cycle 중 한쪽 또는 양쪽의 active 공명자였을 때도 active 참조가 제거된 ID를 가리키지 않게 한다.
- 삭제 대상 InputBlock·SkillBlock이 없거나 AutoAction을 InputBlock 편집 명령에 전달하면 거부한다.
- 여러 Transition이 같은 경계에 있거나, AutoAction이 이미 suppression된 경우에도 무관한 교체의 의미를 바꾸지 않는다.
- 잘못된 재정렬 위치, 중복 Block ID, 음수·비정수 stage 및 손상된 anchor는 유효 상태로 통과시키지 않는다.

## 테스트 계획

- 파티 공명자 교체 전후의 양쪽 Cycle, active 공명자, 전역 열 순서, 다른 공명자 소유 행동을 확인한다.
- 교체가 관련된 일반·협주 Transition, linked AutoAction, suppression을 함께 정리하는지 확인한다.
- InputBlock 삭제·재정렬과 SkillBlock 추가·삭제·재정렬·stage 변경을 빈 배열·중복 Skill 참조·stage 0 경계로 검증한다.
- Transition 앞뒤의 열 삽입·삭제·이동, 협주 outro/intro 쌍, suppression 상태에서 anchor와 소유권이 보존되는지 검증한다.
- 오류 시 원본 불변과 각 명령의 원자성을 검증한다. 작업 완료 전 `npm run lint`, `npm test`, `npm run build`를 실행한다.

## 남아 있는 미확정 사항

- Transition 직접 삭제 UX, 서로 다른 InputBlock 간 SkillBlock 직접 이동 UX, 공명자 교체 직후 정확한 active line UI 처리는 상위 문서의 미확정 사항으로 남긴다.
- 공명자 교체 경고의 문구·표시 방식과 Undo/Redo 이력 수·저장 시점은 별도 기능 단계에서 정한다.
