# 최종 검수된 공명자 데이터

`{characterId}/data/{characterId}.json`과 `{characterId}/assets/*.webp`에 반영 데이터를 둡니다. 후보 초안은 이 디렉터리에 넣지 않습니다. 사용자 백업에서 초상화가 선택된 장리(1205)·브렌트(1206)·루파(1207)의 등록 스킬 각 7개를 시범 반영했습니다. 미검수 신규 후보는 제외했습니다.

JSON 계약은 `src/data/characters/contract.ts`를 따릅니다.

- `schemaVersion`: `1`
- `reviewStatus`: 사람이 검수를 마친 뒤 `approved`
- `characterId`: 디렉터리와 일치하는 안정적인 ID
- `displayName`: 한국어 공명자 이름
- `attribute`: 응결·용융·전도·기류·회절·인멸
- `portrait`: `assets/파일명.webp`
- `skills`: `skillId`, `displayName`, `visible`, `asset` 배열
- `autoActions`: `normalSwitchAttack`, `intro`, `outro`에 각각 노출·등록된 Skill ID 지정

Skill ID는 모든 공명자에서 고유해야 합니다. 공명자 ID를 접두어로 사용하는 방식 등을 적용하되 공개 후 이름이나 파일명이 바뀌어도 ID는 유지합니다. 숨긴 스킬은 catalog 진열에 넣지 않습니다. 필수 검증 대상 이미지는 초상화와 노출 스킬입니다.

앱은 JSON·필수 WebP의 HTTP 응답·Content-Type·실제 디코딩을 확인하고, 오류가 있는 공명자만 제외해 오류를 표시합니다. 기존 프로젝트는 정확한 ID의 현재 데이터 또는 저장된 이름을 사용하며 블록을 재구성하지 않습니다. `approved`는 사람의 검수 결과를 기록하는 필드이며 자동 검증이 스킬 의미를 승인하는 것은 아닙니다.

자산 참조는 `characters/{characterId}/assets/파일명.webp`라는 안정적인 ID로 저장합니다. Vite가 생성한 URL은 표시 계층에서만 사용하고 프로젝트에 넣지 않습니다.

## 스킬 분류와 실제 이름

선택적 `category`는 기본 공격·공명 스킬·공명 해방·고유 스킬·변주 스킬·반주 스킬·공명 회로·조화도 파괴 중 하나입니다. `displayName`은 실제 스킬명입니다. 분류 없는 기존 v1 JSON도 지원하며 ID를 변경하지 않습니다. 분류가 있는 데이터는 노출된 기본 공격·변주 스킬·반주 스킬이 각각 하나이고 해당 자동 행동이 이를 참조해야 합니다. 배열 순서는 검수에서 정한 배치 순서를 유지합니다.
