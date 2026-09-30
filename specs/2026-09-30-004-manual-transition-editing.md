# 블록 뒤 수동 입력·교체 삽입 명세

## 기능 목적

공명자 변경 등으로 끊어진 Timeline을 사용자가 직접 편집할 수 있도록 InputBlock hover 위치에 입력·교체를 삽입한다. 2026-09-30 사용자 승인으로 기존 활성 라인 끝 삽입과 블록 위 캡처 제외 규칙을 변경한다. 현재 브랜치는 `codex/manual-transition-editing`이며 이 문서는 구현 전 명세다.

## 관련 PRD 요구사항

- `docs/requirements-checklist.md` 3–4절: 캡처 영역, 삽입 위치, Shared Timeline, Transition·AutoAction.
- `docs/PRD.md` 6, 7, 9.2, 10절: 직접 입력과 끊어진 구간의 수동 편집.
- `specs/2026-09-30-003-input-capture.md`: 기존 입력 판정과 이벤트 연결. 위치·캡처 범위는 본 명세와 갱신된 상위 문서로 대체한다.

## 범위

- 빈 영역 입력은 해당 Cycle의 전역 끝에 삽입한다.
- InputBlock 위 입력은 그 블록의 전역 열 바로 뒤에 삽입한다.
- Q/E/R/T/F/Space/LMB/RMB와 숫자키 교체에 모두 적용한다.
- hover는 위치만 지정하며 입력 소유자·교체 출발 공명자는 현재 active line이다.
- 숫자키 Tap은 일반 교체, 200ms Hold는 협주 교체이며 같은 공명자 번호는 계속 무시한다.
- 삽입으로 밀리는 기존 열의 상대 순서와 소유권, Transition·AutoAction·suppression의 의미를 보존한다.

## 비범위 / 이번 작업에서 하지 않는 것

- 끊어진 구간 자동 연결, hover만으로 active line 변경, Transition 직접 삭제 UI.
- Undo/Redo, 저장, Import/Export, 실제 공명자 데이터 수집 및 배포.
- AutoAction 자체의 내용 수정·이동·직접 입력화.

## 사용자 동작 및 UX

A 입력 뒤와 C 입력 앞의 연결이 끊어졌다면, A 라인을 활성화하고 마지막 A InputBlock 위에서 숫자키 3을 입력해 A→C 교체를 그 위치에 넣는다. 새 B를 거치려면 사용자가 A→B를 넣고 B의 입력을 추가한 뒤 B→C를 넣는다. 새로 만든 입력 위에서 다음 입력을 이어 넣을 수 있다.

A가 활성화된 상태에서 C의 R 위에 E를 입력하면 R 다음 열에 A 소유 E가 생긴다. 위치와 소유자를 자동으로 맞추거나 다른 구간을 자동 수리하지 않는다. 새로운 블록이 표시 범위를 벗어나면 기존 Cycle별 스크롤 추적을 적용한다.

단일 입력 잠금, Hold 생성 후 release 중복 방지, Backspace·wheel·drag와 모달·공명자 선택창의 입력 차단을 유지한다.

## 도메인 데이터에 미치는 영향

- 입력 위치는 안정적인 Column ID 뒤 경계 또는 전역 끝으로 전달한다. 화면 index를 공명자 identity로 저장하지 않는다.
- Shared Timeline 배열을 유지하며 Transition을 실제 열로 만들지 않는다.
- 일반 교체의 등장 행동, 협주의 반주·변주는 독립 AutoAction 열로 생성한다. 새 교체와 연결 행동은 하나의 원자적 명령으로 반영한다.
- 다른 Cycle의 내용·active line은 변경하지 않는다. 데이터 포맷 변경 필요성은 구현 시 확인한다.

## 주요 구현 방법

1. 캡처 대상에 Cycle ID와 삽입 경계 정보를 전달하도록 순수 판정·DOM 어댑터·명령 계층을 확장한다.
2. `insertInput`의 현재 활성 라인 기반 위치 계산을 갱신하고 `createSwitch`에 중간 경계 삽입을 지원한다. 기존 테스트 중 변경된 위치 규칙은 새 요구사항에 맞춰 갱신한다.
3. 기존 교체가 있는 경계의 처리는 아래 미확정 사항을 결정한 뒤 구현한다. 기존 anchor와 linked pair를 우회하거나 제거하지 않는다.
4. 렌더러는 변경된 Rotation만 사용한다. hover 위치나 미확정 입력 상태는 Rotation에 영속하지 않는다.

## 예외 및 edge case

- 빈 Cycle, 다른 공명자의 InputBlock hover, 전역 마지막 블록, 대상 블록 삭제·이동.
- 이미 Transition이 있는 경계, 협주 linked pair 주변, suppression된 교체 경계.
- Hold 도중 대상 이동, 드래그 시작, blur·모달, 스크롤로 대상이 바뀌는 경우.
- 같은 번호 입력과 자동 행동 참조 누락은 기존 no-op·오류 경로를 유지한다.

## 테스트 계획

- 빈 영역에서 활성 공명자와 무관하게 전역 끝 삽입.
- 다른 공명자의 블록 뒤에 활성 공명자 소유 입력 삽입 및 후속 열 순서 보존.
- 끊어진 A→C 구간에 일반·협주 교체를 직접 삽입하고 연결선과 독립 AutoAction 열 확인.
- 새 B를 거치는 수동 편집과 다른 공명자 입력·다른 Cycle 보존.
- 기존 교체·suppression 및 Shared Timeline 불변조건 확인.
- Tap/Hold·중첩 입력·삭제·wheel·drag와 입력 캡처 상호 작용 검증.
- `npm run format:check`, `npm run lint`, `npm test`, `npm run build` 실행.

## 남아 있는 미확정 사항

- press 이후 같은 Cycle 안에서 다른 블록·빈 영역으로 이동할 때 취소할지, 최초 위치를 유지할지. 입력 확정 전 대상 삭제·이동도 함께 정해야 한다.
- InputBlock 내부 SkillBlock 위 입력을 포함할지. LMB 캡처와 기존 스킬 drag 시작을 구분하는 규칙.
- 이미 교체가 있는 경계에서 새 입력·교체를 넣을 때 기존 Transition의 앞뒤 순서. 기존 교체를 자동 대체하거나 유효성을 위해 새 교체를 자동 생성하지 않는다.

위 사항은 이번 사용자 승인에 포함되지 않았으며 구현 전에 필요한 부분을 확인한다. 현재 앱은 아직 이전 삽입 규칙을 사용한다.
