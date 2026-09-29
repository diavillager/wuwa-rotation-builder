# wuwa-rotation-builder

Wuthering Waves 3인 파티의 개막·반복 로테이션을 실제 입력 순서로 기록하기 위한 데스크톱 앱입니다.

## 개발 상태

현재는 프로젝트 기반 단계입니다. 핵심 Rotation 도메인 모델과 최소 화면 Shell만 있으며 입력 캡처, 완성형 편집기, 저장, Export, 공명자 데이터는 아직 제공하지 않습니다.

## 개발 환경

Node.js 20.19 이상과 npm이 필요합니다.

```sh
npm install
npm run dev
```

로컬 개발 서버가 출력하는 주소를 브라우저에서 여세요.

```sh
npm run lint
npm run format:check
npm test
npm run build
```

## 문서

- [확정 요구사항 체크리스트](docs/requirements-checklist.md): 제품 요구사항의 최우선 기준
- [PRD](docs/PRD.md): 구현 기준
- [프로젝트 기반 spec](specs/project-foundation.md): 이번 단계의 설계와 범위
- [AGENTS.md](AGENTS.md): 저장소 작업 지침

`specs/`는 기능별 구현 계획을 담으며 체크리스트나 PRD를 대체하지 않습니다.
