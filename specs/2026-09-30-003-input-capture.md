# 실제 입력 캡처 명세

## 기능 목적

사용자가 사이클의 빈 영역에서 실제 키·마우스 입력으로 InputBlock과 일반·협주 교체를 만들 수 있도록 기존 Editor와 도메인 명령을 연결한다. 입력키로 Skill을 추론하지 않으며, 입력 판정과 Rotation 변경을 분리한다.

## 관련 PRD 요구사항

- `docs/requirements-checklist.md` 3–4절: 지원 입력, 400ms tap/hold, 빈 영역 캡처, Shared Timeline, 삽입 위치, Transition·AutoAction.
- `docs/PRD.md` 3, 5절: I1–I5와 도메인 데이터 구조.
- `docs/PRD.md` 6절: 실제 입력 시스템과 RMB context menu 범위.
- `docs/PRD.md` 9.2, 10절: active line 삽입, 숫자키 교체, 자동 행동과 suppression.
- `docs/PRD.md` 15절 A1–A5, A8–A9, A12: 주요 수용 기준.
- `specs/2026-09-30-002-party-timeline-editor.md`: 현재 Editor와 도메인 명령 연결 구조.

## 범위

1. `Q/E/R/T/Space/LMB/RMB`의 최초 press와 release를 캡처하고, 지속 시간이 400ms 미만이면 tap, 이상이면 hold로 판정한다. WASD와 지원하지 않는 입력은 기록하지 않고 키보드 자동 repeat는 중복 press로 처리하지 않는다.
   한 번에 하나의 입력만 캡처하며, 진행 중인 입력 외의 추가 press와 그 release는 기록하지 않는다.
2. 사이클 내부의 빈 영역 hover에서만 캡처한다. InputBlock·SkillBlock·AutoAction, 공명자 라인 조작, 스크롤바 및 다른 조작 UI는 빈 영역에서 제외한다. 모달·드래그·텍스트 편집 중의 오캡처를 방지한다.
3. 일반 입력은 해당 Cycle의 active line에 스킬 없는 InputBlock을 만들고 `insertInput`으로 삽입한다. 기존 삽입 위치와 후속 Transition·AutoAction의 의미를 보존한다.
4. 숫자키 `1/2/3`은 현재 파티 슬롯을 대상으로 하는 편집 명령이다. tap은 일반, hold는 협주 교체로 `createSwitch`에 연결하고, 교체 후 해당 Cycle의 active line을 도착 공명자로 이어간다.
5. 화면용 카탈로그에 명시적인 `normalSwitchAttack / intro / outro` 참조를 제공하는 계약을 보강한다. 일반 교체에는 등장자 일반공격, 협주 교체에는 퇴장자 반주와 등장자 변주를 전달한다. 개발용 fixture에 완전한 참조를 제공하고 실제 검수 데이터와 구분한다.
6. RMB를 빈 영역에서 Rotation 입력으로 캡처하는 경우에만 context menu를 막는다. 다른 UI 및 사이클 밖의 일반 RMB 동작을 유지한다.
7. 입력 판정 단위 테스트와 실제 Editor 이벤트에서 도메인 결과까지 확인하는 통합 테스트를 추가한다.

## 비범위 / 이번 작업에서 하지 않는 것

- 전체 공명자 데이터 수집·검수와 `wuwa-character-sync`.
- 입력키·파일명으로 Skill 의미를 추론하거나 자동 연결하는 기능.
- 끊어진 사이클의 자동 복구, Transition 직접 선택·삭제 UI, 서로 다른 InputBlock 사이의 SkillBlock 직접 이동.
- Undo/Redo 이력과 UI, IndexedDB 프로젝트 관리, JSON Import/Export, PNG Export, 배포.
- gamepad 입력 UI, 모바일 UX, 지원 브라우저 범위 확정.

## 사용자 동작 및 UX

- 사용자가 편집하려는 Cycle의 빈 영역에 마우스를 두고 입력하면 그 Cycle의 active line에 행동이 생성된다. 왼쪽 스킬 진열의 기존 라인 선택 동작과 각 Cycle의 active line 독립성을 유지한다.
- InputBlock은 release 후 tap/hold 판정이 완료됐을 때 생성한다. 스킬은 사용자가 기존 진열에서 직접 연결한다.
- Q Hold 도중 E Tap을 수행하면 Q Hold만 기록한다. 키보드와 마우스를 합쳐 하나의 진행 중 입력을 관리하고 추가 입력을 큐에 넣지 않는다.
- 라인 아이콘 클릭은 편집 라인만 변경하며 입력·교체·자동 행동을 만들지 않는다.
- 숫자키는 별도의 입력 카드로 나타나지 않는다. 기존 renderer가 Transition의 라인 이동과 독립 AutoAction 열을 표시한다.
- 공명자 변경으로 끊어진 사이클은 자동으로 연결하지 않는다. 사용자가 입력·교체 명령과 기존 편집 조작을 사용해 다시 편집한다. 임의 위치에 Transition을 만드는 새로운 조작은 이번 범위에 추가하지 않는다.
- 빈 영역을 벗어나거나 다른 Cycle로 이동하면 진행 중 입력을 취소한다. blur·드래그·모달·텍스트 편집 시작 시에도 미확정 입력을 정리한다.

## 도메인 데이터에 미치는 영향

- 기존 `InputBlock`의 입력과 gesture 표현을 유지하고 `skills: []`로 생성한다. 캡처 중 press 상태·타이머·hover 정보는 Rotation에 저장하지 않는다.
- `Cycle.columns`는 단일 전역 배열을 유지한다. 소유 공명자는 Cycle의 active ID이며 화면의 라인 index로 저장하지 않는다.
- 숫자키를 InputBlock이나 실제 TimelineColumn으로 저장하지 않는다. Transition과 연결 AutoAction은 한 도메인 명령으로 원자적으로 반영한다.
- AutoAction에 직접 입력·gesture·stage를 추가하지 않는다. 기존 삭제·linked pair·suppression 동작을 보존한다.
- 한 Cycle의 입력·교체는 다른 Cycle의 내용이나 active line을 변경하지 않는다. 파티 순서 변경 후 숫자키 목적지는 현재 파티 배열로 해석한다.
- 데이터 포맷 migration과 영속화는 이번 작업에서 도입하지 않는다.

## 주요 구현 방법

1. UI와 독립된 입력 판정 모듈에서 단일 control의 최초 press 시각과 release를 관리한다. 시간 공급자를 주입해 400ms 경계를 테스트하고, repeat·중복 press·진행 중 추가 press 및 대응 press 없는 release를 걸러낸다.
2. DOM 이벤트 어댑터에서 Cycle의 빈 영역 여부, 포커스, 모달과 드래그 상태를 검사한다. 기존 Delete·wheel·drag 핸들러와 캡처 대상이 겹치지 않게 한다. 리스너 해제 및 화면 비활성화 시 진행 중 입력을 정리한다.
3. 입력 결과를 일반 입력과 숫자키 교체 명령으로 변환하는 계층을 둔다. 일반 입력은 `insertInput`, 교체는 `createSwitch`를 호출하고 성공한 새 Rotation만 반영한다. 이벤트 핸들러에 Timeline 변경 로직을 복제하지 않는다.
4. Column·action·switch ID는 식별자 생성기를 통해 발급하고, 연관 AutoAction ID도 같은 명령 생성 과정에서 준비한다.
5. 카탈로그의 자동 행동 참조는 명시적 데이터로 전달한다. 실제 데이터가 없어도 개발 fixture로 교체를 검증할 수 있도록 한다. 데이터 누락을 다른 스킬이나 빈 문자열로 대체하지 않는다.
6. 현재 도메인에서 `createSwitch`는 Cycle 끝에 교체를 생성한다. 이번 단계는 해당 명령을 연결하며, 중간 경계에 교체를 삽입하는 새 UX를 임의로 추가하지 않는다. 이 제약은 수동 복구 테스트에서도 분명히 기록한다.

## 예외 및 edge case

- 정확히 400ms인 입력, 장시간 hold, 키 자동 repeat, 중복 press, 대응 press 없는 release.
- press/release 사이 hover 영역·Cycle·active line·파티·포커스가 바뀌는 경우와 여러 control을 동시에 누르는 경우.
- 브라우저 blur, 문서 비활성화, 컴포넌트 해제, 드래그 시작 또는 모달 열림에 따른 입력 상태 정리.
- 빈 Cycle, 기존 outgoing Transition 직전, 협주 outro 직전 및 suppression된 교체가 있는 라인에서 입력 삽입.
- 현재 공명자와 같은 슬롯을 대상으로 한 숫자키, 미지정 슬롯, 자동 행동 참조 누락: 원본 Rotation을 부분 변경하지 않는다. 사용자에게 보이는 구체 처리는 미확정 사항으로 남긴다.
- 일반 RMB context menu와 Rotation RMB 입력을 구분하고 마우스 버튼의 tap/hold에도 같은 기준을 적용한다.

## 테스트 계획

- 시간 제어 테스트로 399ms tap, 400ms hold, 장시간 hold 및 repeat 중복 방지를 검증한다. 지원 control과 제외 입력을 모두 확인한다.
- 빈 영역에서 키·마우스 입력 후 해당 Cycle의 active owner에 스킬 없는 입력이 정확히 한 번 생기는지 확인한다.
- 블록·스킬·공명자 조작·모달·텍스트 입력·드래그·사이클 밖에서 행동이 생성되지 않는지 확인한다. RMB context menu 제한 범위도 확인한다.
- 두 Cycle의 입력과 active line 독립성, 파티 재정렬 후 숫자키의 목적 공명자, 동일 슬롯 및 참조 누락 시 원본 보존을 검증한다.
- 일반 교체의 등장자 자동공격, 협주 반주·변주의 별도 열과 공통 switchId, 교체 후 도착 active line을 확인한다. 숫자키 입력 Column이 생성되지 않는지 검증한다.
- outgoing Transition 및 outro 앞 입력 삽입 시 후속 열·anchor·AutoAction 소유권과 suppression이 유지되는지 확인한다.
- 데모에서 빈 Cycle부터 `A: LMB×3 → B: E → C: R`을 실제 입력으로 만들고, B 변경 후 A/C 입력 보존과 흐름선 단절을 확인한다. 수동 재편집 시 기존 도메인 명령이 허용하는 위치에서만 교체가 생기며 자동 복구가 없는지 확인한다.
- hover 이탈·blur 취소와 Q Hold 중 E Tap 무시, 키보드·마우스 중첩 무시, 무시한 release 뒤 새 press 재개를 테스트한다.
- 구현 완료 전 `npm run format:check`, `npm run lint`, `npm test`, `npm run build`를 실행하고 수동 브라우저 결과를 기록한다.

## 남아 있는 미확정 사항

- 빈 영역 이탈 시 취소는 사용자 결정으로 확정했다. 라인·파티 조작은 빈 영역 밖의 UI이므로 진행 중 입력을 취소한다.
- 동시 입력은 순서 큐를 사용하지 않고 최초 입력 하나만 캡처한다는 사용자 결정으로 확정했다.
- 현재 공명자와 같은 슬롯의 숫자키 입력, 미지정 슬롯 입력의 사용자-facing 처리와 안내 방식.
- 검수된 자동 행동 참조가 없는 공명자의 교체 처리 및 안내 방식은 상위 문서의 미확정 사항이다. 완전한 데모 데이터로 먼저 검증하며 실제 데이터용 동작은 따로 확인한다.
- 중간 공명자 변경 후 남은 행동 사이에 교체를 다시 배치하는 UX는 현재 도메인 명령의 끝 삽입만으로 완전히 해결되지 않을 수 있다. 실제 수동 복구가 막히는 경우 후속 결정 대상으로 보고하고 자동 연결로 대체하지 않는다.
