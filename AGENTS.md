# AGENTS.md

이 문서는 `wuwa-rotation-builder` 저장소에서 작업하는 Codex 및 기타 자동화 에이전트가 따라야 할 저장소 수준의 작업 지침을 정의한다.

제품의 세부 요구사항 자체를 이 문서에서 새로 정의하지 않는다. 제품 동작은 `docs/requirements-checklist.md`와 `docs/PRD.md`를 기준으로 판단한다.

---

## 1. Codex와의 대화 원칙

사용자와 대화할 때는 다음 원칙을 따른다.

- 한국어를 기본 언어로 사용한다.
- 사용자에게는 존댓말로 답변한다.
- 모르는 내용이나 확인할 수 없는 내용은 추측해서 단정하지 않고, 명확하게 모른다고 말한다.
- 사실에 대한 주장에는 실제로 존재하고 접근해서 확인할 수 있는 근거가 있어야 한다.
- 출처를 제시할 때는 실제로 존재하는 문서, 파일, 코드, 공식 문서, 저장소, Issue, PR, 로그 등 확인 가능한 자료를 사용한다.
- 존재하지 않는 출처, 확인하지 않은 근거, 추정한 문서 내용을 사실처럼 제시하지 않는다.
- 저장소 내부 정보에 대해 답할 때는 가능하면 실제 파일, 코드, 테스트, Git 기록을 먼저 확인한다.
- 외부 정보가 필요한 경우에는 공식 문서나 신뢰할 수 있는 1차 자료를 우선 확인한다.
- 확인된 사실과 추론 또는 제안을 구분해서 설명한다.
- 정보가 불완전하거나 서로 충돌하면 그 상태를 숨기지 않고 명확하게 알린다.
- 사용자가 검증 가능한 근거를 요구하는 경우, 실제로 확인하지 않은 내용을 `확인했다`, `검증했다`, `문서에 있다`라고 표현하지 않는다.

---

## 2. 기준 문서

제품 요구사항의 우선순위는 다음과 같다.

1. `docs/requirements-checklist.md`
   - 확정 제품 요구사항의 source of truth다.
   - 체크된 요구사항과 제품 불변조건을 임의로 변경하지 않는다.

2. `docs/PRD.md`
   - 실제 구현 기준 문서다.
   - 화면, 데이터 의미, 편집 동작, 저장, Export, 수용 기준 등을 구현할 때 따른다.

3. `specs/*.md`
   - 특정 기능을 구현하기 위해 작성한 기능별 명세다.
   - 상위 두 문서의 요구사항을 구체화할 수는 있지만 변경하거나 덮어쓸 수는 없다.

`specs/` 문서와 PRD 또는 요구사항 체크리스트가 충돌하면 `docs/requirements-checklist.md`와 `docs/PRD.md`를 우선한다.

과거의 상세 PRD, 대화 기록, archived 문서 등은 명시적으로 참고하라는 요청이 없는 한 제품 요구사항의 근거로 사용하지 않는다.

---

## 3. 제품 동작을 임의로 확정하지 않는다

문서에 없는 사용자-facing 제품 동작을 일반적인 관행이나 개인적인 판단만으로 새 요구사항처럼 만들지 않는다.

구현 중 애매한 사항이 있으면 다음 순서로 판단한다.

1. `docs/requirements-checklist.md`에서 확인한다.
2. `docs/PRD.md`에서 확인한다.
3. 현재 기능의 `specs/*.md`에서 확인한다.
4. 기존 제품 불변조건을 깨지 않는 단순 구현 세부사항이라면 합리적으로 결정한다.
5. 사용자에게 보이는 제품 동작이 달라지는 결정이고 실제 구현을 막는 경우에만 질문한다.

현재 작업을 막지 않는 미확정 사항은 임의로 확정하지 말고 TODO, spec의 open question, Issue 또는 후속 decision point로 남길 수 있다.

---

## 4. 반드시 유지할 핵심 제품 불변조건

### I1. Input-first

사용자의 실제 입력이 데이터의 출발점이다.

입력키만 보고 사용 Skill의 의미를 자동 추론하거나 자동 연결하지 않는다.

예를 들어 `E`, `LMB`, asset 파일명 등의 정보만으로 특정 Skill 의미를 확정하지 않는다.

### I2. Shared Timeline

하나의 Cycle에 존재하는 세 공명자 라인은 하나의 전역 Timeline 순서를 공유한다.

`TimelineColumn` 하나에는 세 라인을 통틀어 행동 Block이 최대 하나만 존재한다.

세 라인을 각각 독립 Timeline 배열로 구현한 뒤 화면에서 임의로 정렬하는 구조를 사용하지 않는다.

### I3. AutoAction은 직접 입력이 아니다

AutoAction은 사용자가 직접 입력한 행동과 별개의 도메인 개념이다.

AutoAction은 독립 `TimelineColumn`을 차지할 수 있지만:

- 직접 입력 정보를 가지지 않는다.
- stage를 가지지 않는다.
- 사용자가 내용이나 Skill을 수정하지 않는다.
- Drag로 이동하지 않는다.
- 삭제만 가능하다.

AutoAction을 편의를 위해 InputBlock이나 LMB 입력 등으로 변환해서 저장하지 않는다.

### I4. Transition은 TimelineColumn이 아니다

공명자 교체 Transition은 일반 `TimelineColumn`을 차지하지 않는다.

Editor와 전체 정보 Export에서 별도의 숫자키 Block으로 저장하거나 표시하지 않는다.

조작 중심 Export에서만 `[1]`, `[2]`, `[3]` 형태의 출력용 가상 Block으로 펼친다.

Export 표현을 위해 원본 Rotation 데이터에 실제 Column을 추가하지 않는다.

### I5. Opening / Repeat 독립

`openingCycle`과 `repeatCycle`은 다음 상태를 서로 공유하지 않는다.

- Timeline
- active line
- Cycle 내용

두 Cycle이 공유하는 것은 파티 구성과 파티 순서다.

---

## 5. 데이터 무결성을 UI 편의보다 우선한다

화면 구현을 단순하게 만들기 위해 도메인 의미를 변경하지 않는다.

특히 다음을 지킨다.

- 파티 재정렬 후에도 InputBlock, AutoAction, Transition의 의미상 소유 공명자가 유지되어야 한다.
- 화면상의 `1/2/3` 또는 line index를 공명자의 영구 identity처럼 취급하지 않는다.
- InputBlock Drag는 같은 Cycle의 전역 Timeline 순서를 변경할 수 있지만 소유 공명자를 변경하지 않는다.
- Transition의 위치는 Timeline 편집 후에도 의미가 깨지지 않는 방식으로 관리한다.
- 사용자가 삭제한 AutoAction의 suppression은 저장/로드 후에도 유지한다.
- Character 데이터 업데이트만으로 기존 Rotation의 Block 순서, Transition, AutoAction 존재 여부, stage 등을 재구성하지 않는다.

구현 방법은 자유롭게 선택할 수 있지만 위 의미는 바뀌면 안 된다.

---

## 6. 도메인 로직과 UI 로직을 분리한다

핵심 Rotation 변경 로직을 UI 컴포넌트 또는 이벤트 핸들러 안에 직접 흩뿌리지 않는다.

가능하면 다음 흐름을 분리한다.

```text
사용자 입력 / UI Event
        ↓
Domain Command / Operation
        ↓
Rotation State 변경
        ↓
Renderer
```

Timeline 삽입, reorder, Transition 생성, AutoAction 생성/삭제, suppression, party reorder 같은 핵심 로직은 UI와 독립적으로 테스트 가능해야 한다.

Editor Renderer와 Export Renderer도 같은 Rotation 데이터를 사용하되 별도의 표현 계층으로 유지한다.

---

## 7. 기능 개발 전 spec 작성 원칙

의미 있는 새로운 기능을 추가할 때는 구현 전에 `specs/` 디렉터리에 해당 기능의 spec 문서를 작성한다.

예:

```text
specs/
├─ input-capture.md
├─ timeline-editor.md
├─ png-export.md
└─ character-sync.md
```

spec 문서는 최소한 다음 내용을 다룬다.

- 기능 목적
- 관련 PRD 요구사항
- 범위
- 비범위 / 이번 작업에서 하지 않는 것
- 사용자 동작 및 UX
- 도메인 데이터에 미치는 영향
- 주요 구현 방법
- 예외 및 edge case
- 테스트 계획
- 남아 있는 미확정 사항

spec은 구현 계획을 구체화하기 위한 문서이며 제품 요구사항의 source of truth가 아니다.

spec에서 새로운 제품 동작을 임의로 확정하지 않는다.

### spec이 필요한 경우

다음과 같은 작업은 원칙적으로 별도 spec을 만든다.

- 새로운 사용자-facing 기능
- 새로운 도메인 개념
- 기존 편집 동작에 의미 있는 변화
- 저장 데이터 구조 또는 migration에 영향을 주는 기능
- Export 동작에 영향을 주는 기능
- 여러 모듈에 걸친 비교적 큰 기능
- 새로운 Character data pipeline 또는 자동화 기능

### 새 spec이 필요하지 않을 수 있는 경우

다음 정도의 작은 변경은 매번 새 spec을 만들 필요가 없다.

- 단순 버그 수정
- 오탈자 및 문구 수정
- 작은 스타일 조정
- 기존 spec 범위 안의 작은 보완
- 내부 refactor
- 테스트 추가
- 작은 성능 개선
- 의존성의 단순 유지보수

작은 변화 하나마다 형식적으로 spec을 만들어 문서와 branch 수를 불필요하게 늘리지 않는다.

기존 spec의 범위 안에서 자연스럽게 처리할 수 있다면 해당 spec을 갱신한다.

---

## 8. Branch 작업 원칙

새로운 의미 있는 기능은 별도의 작업 branch에서 구현한다.

`main`에 직접 대규모 기능 구현을 쌓지 않는다.

예:

```text
feat/timeline-editor
feat/input-capture
feat/png-export
fix/auto-action-suppression
refactor/domain-model
docs/update-prd
```

branch 이름은 도구 호환성과 가독성을 위해 영문 ASCII 기반의 짧은 kebab-case 표현을 권장한다.

새 기능 branch를 만들 때는 가능하면 대응하는 `specs/*.md` 문서를 먼저 만들거나 같은 branch의 첫 단계에서 작성한다.

작은 수정 하나마다 반드시 새로운 spec과 branch를 동시에 만들어야 한다는 의미는 아니다.

이미 진행 중인 적절한 작업 branch의 범위에 포함되는 작은 수정이라면 같은 branch에서 처리할 수 있다.

---

## 9. Commit 메시지 언어와 형식

Commit 메시지는 가능한 한 **한국어로 내용을 설명한다.**

Conventional Commit 등의 기술적 prefix는 필요하면 영문을 유지한다.

권장 예:

```text
feat: 전역 타임라인 재정렬 기능 추가
fix: 협주 자동 행동 suppression 복원 오류 수정
test: 파티 재정렬 소유권 테스트 추가
docs: 입력 캡처 spec 보강
refactor: 로테이션 도메인 명령 분리
chore: 테스트 환경 설정
```

다음과 같은 불필요하게 모호한 메시지는 피한다.

```text
update
fix stuff
changes
work
```

Commit 본문이 필요한 경우에도 가능한 한 한국어로 변경 이유와 주의사항을 설명한다.

코드 식별자, 명령어, API 이름, Conventional Commit prefix 등 기술적으로 영문 유지가 자연스러운 표현은 억지로 번역하지 않는다.

---

## 10. Pull Request 규칙

PR 제목과 설명은 가능한 한 **한국어를 기본으로 한다.**

필요한 기술 키워드와 코드 식별자는 영문으로 유지해도 된다.

PR 제목 예:

```text
feat: 로테이션 도메인 모델과 전역 타임라인 추가
fix: JSON Import 시 suppression 유실 문제 수정
```

새 기능 PR에는 가능하면 관련 spec을 연결한다.

PR 설명에는 최소한 다음 내용을 포함한다.

```markdown
## 변경 내용

무엇을 구현하거나 수정했는지 설명합니다.

## 관련 문서

- `specs/...`
- `docs/PRD.md` 관련 섹션

## 주요 구현 결정

중요한 구조 또는 구현 선택을 설명합니다.

## 검증

실행한 test / lint / build와 결과를 기록합니다.

## 이번 PR에서 하지 않은 것

의도적으로 범위에서 제외한 항목을 기록합니다.

## 남은 사항

필요한 후속 작업 또는 미확정 decision point를 기록합니다.
```

실제로 실행하지 않은 테스트나 build를 실행했다고 기록하지 않는다.

---

## 11. 문서 언어

저장소에서 사람이 읽는 문서는 **한국어를 기본 언어로 한다.**

대상에는 다음이 포함된다.

- `README.md`
- `AGENTS.md`
- `docs/*.md`
- `specs/*.md`
- PR 제목 및 설명
- Issue 설명
- Commit 메시지의 설명 부분

문서 제목과 본문도 가능한 한 한국어로 작성한다.

다만 다음은 영문을 유지해도 된다.

- 코드 식별자
- 타입명 / 함수명 / 변수명
- 파일 및 디렉터리 이름
- CLI 명령
- API 이름
- 라이브러리 이름
- Git/GitHub의 일반적인 기술 용어
- `feat:`, `fix:`, `refactor:` 등의 Conventional Commit prefix
- 번역하면 오히려 의미가 불명확해지는 기술 용어

한국어와 영문을 혼용할 때는 가독성과 기술적 정확성을 우선한다.

---

## 12. README 관리

`README.md`는 프로젝트 사용자가 처음 보는 저장소 안내 문서다.

가능한 한 한국어로 작성하고 최소한 다음 정보를 최신 상태로 유지한다.

- 프로젝트 소개
- 현재 개발 상태
- 개발 환경 실행 방법
- test 실행 방법
- build 방법
- 주요 문서 링크
- `docs/requirements-checklist.md`
- `docs/PRD.md`
- `specs/`의 역할

README에 PRD 전체 내용을 복사하지 않는다.

제품 세부 동작은 PRD 및 spec으로 연결한다.

---

## 13. 테스트와 검증

새 기능 또는 버그 수정은 가능한 한 해당 동작을 검증하는 테스트를 함께 추가한다.

특히 다음 도메인 동작은 테스트를 우선한다.

- Shared Timeline invariant
- Timeline insertion / reorder
- party reorder와 ownership 유지
- normal / concerto Transition
- AutoAction 생성
- linked intro/outro 삭제
- suppression
- opening/repeat 독립성
- stage minimum 0
- serialization / hydration
- Undo/Redo의 원자적 변경

작업 완료 전 저장소에서 제공하는 적절한 명령으로 다음을 확인한다.

```text
lint
test
build
```

실제 명령 이름은 프로젝트의 `package.json` 등 현재 저장소 설정을 확인해서 사용한다.

해당 작업과 관련 없는 기존 실패가 있는 경우 숨기지 말고 명확하게 보고한다.

테스트를 통과시키기 위해 제품 요구사항이나 테스트 의미를 임의로 약화하지 않는다.

---

## 14. `wuwa-character-sync` 및 Character 데이터

Character/Skill 의미를 asset 파일명만으로 확정하지 않는다.

`QTE`, `A1`, `B3`, `Intro` 같은 파일명, path, suffix는 후보 탐색 정보일 뿐 최종 Skill 의미가 아니다.

자동화가 담당하는 범위는 후보 수집, 다운로드, 초안 생성, 검수 지원까지다.

최종적으로 다음은 사람 검수를 거친다.

- Skill `displayName`
- 노출 여부
- `normalSwitchAttack`
- `intro`
- `outro`

공명자 데이터 관련 세부 요구사항은 `docs/PRD.md`를 따른다.

---

## 15. 미확정 사항 처리

PRD에서 미확정으로 남겨둔 사항을 구현 편의를 위해 제품 규칙으로 확정하지 않는다.

예를 들어 다음과 같은 사항은 문서에 확정 내용이 없다면 자동으로 결정하지 않는다.

- 서로 다른 InputBlock 간 SkillBlock 직접 이동 UX
- Transition 자체를 직접 선택하거나 삭제하는 UI
- 공명자 교체 직후 active line의 정확한 처리
- opening/repeat 중 현재 편집 Cycle을 판별하는 구체적인 UI 규칙
- 조작 중심 Export에서 숨겨진 AutoAction 공간의 압축 방식
- 모바일 UX
- 지원 브라우저 범위
- PNG 정확한 크기와 margin

이러한 사항이 현재 구현을 막지 않는다면 후속 결정으로 남긴다.

---

## 16. 코드 변경 시 기존 의도를 보존한다

기존 코드를 수정하기 전에 관련 코드, 테스트, spec, PRD를 먼저 확인한다.

동작을 단순화하기 위해 기존 도메인 규칙을 삭제하거나 우회하지 않는다.

특히 다음과 같은 변경을 금지한다.

```text
E 입력 → 자동으로 특정 Skill 연결
AutoAction → InputBlock으로 변환
Transition → 실제 TimelineColumn으로 변환
세 공명자 라인 → 각각 독립 Timeline으로 변경
삭제된 AutoAction → render 시 자동 재생성
파일명 → Skill 의미 자동 확정
```

필요한 리팩터링은 가능하지만 외부 동작과 도메인 불변조건은 유지한다.

---

## 17. 작업 완료 보고

작업을 완료할 때는 한국어 존댓말로 간결하게 다음을 보고한다.

- 변경한 내용
- 관련 spec
- 주요 구현 결정
- 실행한 test / lint / build 결과
- 남아 있는 제한 또는 미확정 사항
- 생성한 branch / PR이 있다면 해당 정보

실제로 수행하지 않은 작업을 완료했다고 보고하지 않는다.
