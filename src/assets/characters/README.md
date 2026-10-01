# 최종 검수된 공명자 데이터

`{characterId}/data/{characterId}.json`과 `{characterId}/assets/*.webp`에 최종 데이터를 둡니다. 후보 초안은 이 디렉터리에 넣지 않습니다. 현재 실제 공명자는 아직 등록하지 않았습니다.

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
