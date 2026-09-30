# 프로젝트 기반 구축 명세

## 목적과 관련 요구사항

`docs/requirements-checklist.md`의 I1–I5에 해당하는 핵심 의미와 `docs/PRD.md` 4–5, 9.2, 10장을 UI와 독립된 TypeScript 도메인에 먼저 구현한다. 데스크톱 Shell은 상단 파티, 좌측 스킬, 우측 개막·반복 3라인 배치를 확인하는 최소 화면이다.

## 범위

- React, TypeScript, Vite, Vitest, ESLint, Prettier 개발 환경과 한국어 README.
- 공명자 ID 기반 소유권, Cycle별 단일 전역 Timeline, 무열 Transition, 별도 AutoAction, 영속 suppression의 순수 도메인 연산.
- 입력 삽입·재정렬, 파티 재정렬, 일반·협주 교체, 연결 자동 행동 삭제, Skill stage 최소값, 기본 직렬화 검증 테스트.
- 실제 데이터가 없는 상태를 정직하게 보여주는 정적 데스크톱 Shell.

## 비범위

입력 캡처, Drag & Drop Editor, PNG Export, IndexedDB, JSON Import/Export 제품 기능, Undo/Redo UI, 공명자 데이터 동기화 및 수집, 배포는 구현하지 않는다. Shell은 편집 제품 동작을 제공하지 않는다.

## 사용자 동작 및 UX

상단 3개 파티 슬롯, 좌측 스킬 진열 자리, 우측 독립된 개막·반복 3라인을 표시한다. 샘플 데이터를 실제 공명자나 검수된 스킬로 가장하지 않는다. 비활성 상태를 명시한다.

## 도메인 데이터와 구현

`party`는 정확히 3개의 서로 다른 공명자 ID다. `Cycle`은 별도 `columns` 한 배열과 별도 `activeCharacterId`를 가진다. 행동과 교체의 소유권은 화면 line 번호 대신 공명자 ID로 저장한다. Transition은 `afterColumnId`로 열 뒤의 경계를 가리키며 열로 저장하지 않는다. AutoAction은 입력과 구별되는 discriminated union이고 교체 ID로 연결한다. suppression은 Cycle 데이터로 저장한다.

명령은 불변 상태를 반환하는 순수 함수다. 생성 명령은 검수된 autoAction Skill ID를 호출자로부터 받아야 하며, 누락 시 생성하지 않고 오류를 낸다. 공명자 데이터 자동 추론은 없다. 재정렬 후 교체의 숫자키는 현 파티 순서의 도착 공명자 위치에서 계산한다.

## 예외 및 edge case

- 중복 파티, 미등록 소유자, 중복 ID, 음수 stage, 손상된 Transition anchor는 검증 오류다.
- 자기 자신으로의 교체와 잘못된 대상은 거부한다.
- 협주 outro/intro 중 하나를 삭제하면 연결 쌍을 제거하고 suppression을 남긴다.
- 입력 재정렬은 같은 Cycle의 InputBlock에만 허용하고 소유권을 보존한다.
- 같은 공명자가 다시 진입한 경우 새 입력은 과거 퇴장 교체 앞이 아니라 최근 진입 뒤의 마지막 편집 가능 위치에 둔다.
- 교체 경계의 anchor였던 InputBlock을 옮겨도 교체 경계는 원래 위치에 남아 연결 AutoAction의 앞뒤 관계를 보존한다.

## 테스트 계획

전역 순서 및 한 열 한 행동, line 소유권, cycle 독립성, 교체/자동 행동의 열 구조, 삽입 위치, suppression과 직렬화, 파티 재정렬, stage 경계를 Vitest로 확인한다. `lint`, `test`, `build`를 실행한다.
재등장 공명자의 입력 삽입, AutoAction suppression 뒤 삽입, anchor 입력 재정렬, 교체 경계 양옆의 AutoAction 검증도 포함한다.

## 남은 미확정 사항

정확한 편집 UX, 교체 직후 active line 표시 규칙, 데이터 누락 시 교체 생성 UX, Export 공간 압축, 모바일/지원 브라우저/정확한 색·크기는 PRD의 후속 결정으로 둔다. 이 단계의 도메인 명령은 일반·협주 교체 후 도착 공명자를 active로 설정하지만, UI 연결 전 사용자 동작으로 확정하지 않는다.
