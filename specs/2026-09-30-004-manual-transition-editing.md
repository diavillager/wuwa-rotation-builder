# 커서 라인 기반 수동 입력·교체 삽입 명세

## 기능 목적

커서가 있는 라인을 실시간으로 편집 대상으로 사용하고, 끊어진 구간에 사용자가 직접 입력과 교체를 넣는다. 작업 branch는 `codex/manual-transition-editing`이다. 2026-09-30 추가 승인으로 앞선 전역 끝·선택 라인 소유 규칙을 커서 라인 기준으로 변경한다.

## 관련 PRD 요구사항

- `docs/requirements-checklist.md` 3–4절: 캡처, 라인 활성화, Shared Timeline, Transition·AutoAction.
- `docs/PRD.md` 6–10절: 커서 대상, 입력 위치, 교체와 수동 편집.
- `specs/2026-09-30-003-input-capture.md`: 단일 입력 판정, 200ms Hold와 release 중복 방지.

## 범위

- 라벨·블록·빈 셀을 포함한 커서 라인을 실시간 활성화하고 기존 라벨 강조와 왼쪽 스킬 진열을 갱신한다. 라인 클릭 활성화는 제거하며 파티 재정렬 drag는 유지한다.
- 빈 셀에서는 그 라인의 마지막 편집 가능 위치에 삽입한다. 끝에 나가는 교체나 반주가 있으면 그 앞에 넣는다. 아직 행동과 교체가 없는 라인은 전역 끝을 사용한다.
- InputBlock과 내부 SkillBlock 위에서는 해당 InputBlock 바로 뒤에 삽입한다. 입력 소유자와 교체 출발은 커서 라인이다.
- Q/E/R/T/F/Space/LMB/RMB와 숫자키 Tap/Hold 교체에 적용한다.
- 교체 생성 후에도 커서 라인을 활성 상태로 유지한다. 도착 공명자를 편집하려면 커서를 해당 라인으로 옮긴다.
- 다른 Cycle의 내용·active line과 기존 소유권·상대 순서·suppression을 보존한다.

## 비범위 / 이번 작업에서 하지 않는 것

- 자동 교체 복구, 기존 교체 자동 대체, Transition 직접 삭제 UI.
- Undo/Redo, 저장, JSON/PNG Export, 실제 데이터 수집 및 배포.
- AutoAction의 입력화·수정·이동 및 스킬 의미 자동 추론.

## 사용자 동작 및 UX

A 입력 뒤와 C 입력 앞이 끊겼다면 마지막 A InputBlock 위에서 숫자키 3을 눌러 A→C를 생성한다. 새 B를 거치려면 A→B를 직접 넣고 B 라인에서 입력을 만든 다음 그 B 입력 위에서 숫자키 3으로 B→C를 넣는다. 단순 hover는 교체를 만들지 않는다.

현재 활성 표시는 커서를 따른다. C의 R 위에서 E를 입력하면 R 바로 뒤에 C의 E가 생긴다. 라인 밖에서는 마지막 활성 라인과 진열을 유지하고 입력 캡처는 중단한다. 모달·공명자 선택·드래그 중에는 hover 활성화와 캡처를 차단한다.

press 시 공명자와 삽입 경계를 고정한다. 같은 라인 안에서 이동해도 그 위치를 유지하며, 다른 라인·Cycle 또는 캡처 제외 영역으로 이동하면 미확정 입력을 취소한다. 이미 생성한 Hold는 유지하고 release까지 입력 잠금을 유지한다. 대상 열이 사라졌다면 삽입을 실패시키며 다른 위치로 자동 대체하지 않는다.

InputBlock 내부 스킬도 캡처한다. LMB down은 native drag 시작을 막지 않으며 실제 dragstart에서 미확정 입력을 취소한다. AutoAction·라인 라벨·스크롤바는 입력 생성 대상이 아니다. AutoAction·라벨 위에서도 커서 라인은 활성화할 수 있다. Backspace·wheel·RMB 메뉴 차단은 유지한다.

## 도메인 데이터에 미치는 영향

- 기존 Shared Timeline과 Column ID를 사용해 위치를 전달한다. 입력 대상 공명자는 press 시 ID로 고정하며 party index로 저장하지 않는다.
- Transition은 열을 차지하지 않는다. 일반 교체는 도착 행동 하나, 협주는 반주·변주 두 독립 열을 생성한다.
- 기존 Transition anchor와 linked AutoAction을 보존한다. 같은 경계의 기존 교체를 새 교체로 대체하거나 관계를 추론해 연결하지 않는다. 기존 관계와 충돌하는 수동 교체가 만들어지면 유효하지 않은 흐름선은 연결하지 않는다.
- hover 정보와 입력 타이머는 Rotation에 영속하지 않는다. 저장 데이터 구조 변경은 없다.

## 주요 구현 방법

1. 각 라벨·Timeline 셀에 소유 공명자 ID를 부여하고 DOM 어댑터가 Cycle·공명자·InputBlock 뒤 경계를 해석한다.
2. 입력 판정은 단일 control과 최초 target을 유지한다. UI 활성화 callback과 도메인 commit을 분리한다.
3. 기존 라인 끝 삽입 위치 계산을 공유하고 명시적인 InputBlock 뒤 삽입을 추가한다. 교체 생성도 동일 경계에 자동 행동 묶음을 삽입한다.
4. UI 입력 경로의 숫자키 교체는 출발 커서 라인을 유지한다. 도메인의 교체 생성 자체와 UI 활성화 정책을 분리한다.
5. renderer의 기존 표시·연결선·Cycle별 자동 스크롤을 사용한다.

## 예외 및 edge case

- 빈 Cycle·빈 라인, outgoing 교체와 suppression, 다른 라인에 후속 입력이 있는 경우.
- 기존 일반 교체 경계와 협주 반주·변주 주변 삽입, 대상 열 삭제·이동.
- Hold 중 같은 라인·다른 라인·다른 Cycle 이동, dragstart, blur, 모달, 스크롤.
- 같은 번호와 누락된 자동 행동 참조는 기존 no-op·오류 처리를 유지한다.

## 테스트 계획

- hover의 즉시 강조·진열 변경, 클릭 활성화 제거, 밖으로 이동 시 유지, 두 Cycle 독립성.
- 빈 라인의 끝 및 outgoing/반주 앞 삽입, InputBlock·내부 스킬 뒤 입력과 숫자키 일반·협주 삽입.
- 끊어진 A→C 복구 및 새 B를 거치는 직접 편집, 다른 공명자 행동 보존.
- Shared Timeline, 소유권, anchor·linked pair·suppression과 기존 열 상대 순서.
- Hold 라인 이탈 취소·최초 위치 유지·생성 후 release 잠금, drag·삭제·wheel·선택창 차단.
- format:check / lint / test / build를 실행하고 branch만 push한다. PR은 생성하지 않는다.

## 남아 있는 미확정 사항

키보드만으로 hover 기반 편집 대상을 바꾸는 별도 접근성 조작, 모바일 UX는 이번 범위에서 확정하지 않는다. 기존 교체를 직접 선택·제거하는 UI도 후속 과제다.
