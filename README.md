# wuwa-rotation-builder

Wuthering Waves 3인 파티의 개막·반복 로테이션을 실제 입력 순서로 기록하기 위한 데스크톱 앱입니다.

## 개발 상태

Rotation 도메인 모델, 파티·타임라인 Editor와 실제 입력 캡처를 연결한 단계입니다. 파티 재정렬, Cycle별 active line, 입력 생성·교체와 기존 블록 편집을 시험할 수 있습니다. 프로젝트 저장, Export, 검수된 실제 공명자 데이터는 아직 제공하지 않습니다.

## 개발 환경

Node.js 20.19 이상과 npm이 필요합니다.

```sh
npm install
npm run dev
```

로컬 개발 서버가 출력하는 주소를 브라우저에서 여세요.

개발 서버 주소 뒤에 `?demo=1`을 붙이면 가상 공명자·스킬과 로테이션이 담긴 검증 화면이 열립니다. 이 데이터는 실제 게임 데이터가 아니며 저장되지 않습니다. 일반 화면에는 검수된 공명자 데이터가 준비되기 전까지 미지정 슬롯이 표시됩니다.

`?demo=continuity`는 두 Cycle에 `A: LMB×3 → B: E → C: R`을 구성합니다. 파티 슬롯 2의 B를 응결의 데모 E로 변경하면 A와 C 입력은 유지되고 두 라인 사이 연결선이 끊어집니다.

`?demo=input`은 데모 A/B/C 파티와 빈 개막·반복 Cycle을 제공합니다. 빈 사이클 영역에 마우스를 두고 `Q/E/R/T/Space/LMB/RMB`를 입력하면 현재 라인에 스킬 없는 입력이 생성됩니다. 400ms 미만은 Tap, 이상은 Hold입니다. 숫자키 `1/2/3`은 Tap으로 일반 교체, Hold로 협주 교체를 만듭니다. 한 번에 하나의 입력만 받으며 누르는 동안 들어온 추가 입력은 무시합니다. 빈 영역을 벗어나면 진행 중 입력을 취소합니다.

직접 확인할 순서: 개막 빈 영역에서 LMB 세 번 → `2` Tap → `E` Tap → `3` Tap → `R` Tap. A의 세 입력, B의 E, C의 R과 두 교체가 생기며 반복 Cycle은 비어 있어야 합니다. Q를 누른 채 E를 눌렀다 떼고 Q를 400ms 이후 떼면 Q Hold 하나만 추가됩니다. 데이터는 저장되지 않으므로 새로고침하면 초기화됩니다.

```sh
npm run lint
npm run format:check
npm test
npm run build
```

## 문서

- [확정 요구사항 체크리스트](docs/requirements-checklist.md): 제품 요구사항의 최우선 기준
- [PRD](docs/PRD.md): 구현 기준
- [프로젝트 기반 spec](specs/2026-09-30-000-project-foundation.md): 기반 구축의 설계와 범위
- [로테이션 도메인 연산 spec](specs/2026-09-30-001-rotation-domain-operations.md): 도메인 편집 연산의 범위와 테스트 계획
- [파티·타임라인 Editor 연결 spec](specs/2026-09-30-002-party-timeline-editor.md): 앱 Shell과 도메인 연산 연결 계획
- [실제 입력 캡처 spec](specs/2026-09-30-003-input-capture.md): 입력 판정·교체·오캡처 방지와 테스트 계획
- [AGENTS.md](AGENTS.md): 저장소 작업 지침

`specs/`는 기능별 구현 계획을 담으며 체크리스트나 PRD를 대체하지 않습니다.
