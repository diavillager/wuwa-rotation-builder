# 교체 카드와 교체 기록의 함께 삭제

## 목적과 관련 요구사항

교체 카드 삭제 후 보이지 않는 Transition이 남아 새 협주 교체와 충돌하는 문제를 해결한다. 2026-10-02 사용자 승인에 따라 PRD 10절과 요구사항 체크리스트 4절의 삭제 규칙을 변경한다.

## 범위와 사용자 동작

- 일반 교체 공격 삭제는 해당 AutoAction과 같은 switchId의 Transition을 함께 삭제한다.
- 반주 또는 변주 삭제는 같은 switchId의 두 AutoAction과 Transition을 함께 삭제한다.
- 해당 switchId의 suppression도 제거한다. 다른 교체의 suppression은 유지한다.
- Undo/Redo는 이 변경 전체를 한 단계로 복원/재적용한다.
- 삭제 후 같은 위치에 새 교체를 넣으면 삭제된 교체 때문에 흐름선이 끊기지 않는다.
- 다른 소유자의 남은 입력 사이에 교체를 자동 생성하거나 흐름선을 임의로 잇지 않는다.

## 비범위

연결선 색상·굵기 변경, Transition 직접 선택 UI, 기존 저장 파일의 자동 정리, 활성 라인 및 입력 위치 변경은 포함하지 않는다.

## 도메인 데이터와 구현

`deleteSwitchForAutoAction` 순수 명령으로 해당 교체와 행동을 원자적으로 제거하고, 삭제된 열을 가리키는 다른 Transition의 anchor는 기존 재연결 규칙을 적용한다. Editor 삭제 이벤트와 Cycle 이력은 이 명령을 사용한다. Shared Timeline·행동 소유권·다른 Cycle·현재 active line은 유지한다.

기존 `deleteAutoAction` 연산은 과거 suppression 데이터의 호환성 검증용으로 유지하되 Editor에서는 호출하지 않는다. 이전 저장 데이터의 suppression/Transition은 자동으로 지우거나 재생성하지 않는다. 저장 형식과 schemaVersion은 바꾸지 않는다.

## 예외와 테스트

- 일반 교체, 반주, 변주 각각 삭제 및 잘못된 행동 ID 거부.
- 후속 교체 anchor 재연결과 다른 입력·교체·suppression 보존.
- 개막/반복 독립, party reorder 후 공명자 소유권 유지.
- 삭제 후 협주 재입력의 입력→반주→변주 연결 및 두 Cycle의 1→2/1→3 연결.
- Undo/Redo의 교체·행동 원자 복원과 저장/로드 후 삭제 상태 보존.
- 기존 suppression 저장/로드·렌더 테스트는 계속 유지한다.
- lint / test / build 실행.

## 남은 사항

이전 버전에서 이미 삭제되어 화면에 카드가 없는 교체 기록의 수동 정리 UX는 후속 결정 사항이다. 이번 변경으로 기존 프로젝트를 자동 변환하지 않는다.
