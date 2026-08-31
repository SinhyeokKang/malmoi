---
name: "source-command-implement"
description: "tasks/테스트 기반으로 기능을 구현하고, 4관점 자체 검증으로 자기완결한다. 빌드·커밋 안 함."
---

# source-command-implement

Use this skill when the user asks to run the migrated source command `implement`.

## Command Template

`/tdd`가 박은 테스트를 green으로 만들거나, `docs/features/<slug>/tasks.md`의 태스크를 구현한다. **자체 검증까지 스킬 안에서 끝낸다** — 사용자에게 리뷰를 떠넘기지 않는다.

## 사용

- `/implement` — 직전 `/tdd`·`/feature` 산출물에서 대상 자동 판단.
- `/implement <대상 설명>` — 대상 명시.

## 절차

### 1. 착수 전 (생략 금지)

- **`docs/POSTMORTEM.md` grep** — 건드릴 파일·영역으로 검색. 걸리는 항목이 있으면 그 함정을 피하는 방식으로 설계하고, 무엇을 소환했는지 리포트에 남긴다.
- **`docs/ARCHITECTURE.md` 확인** — `lib/export.ts`·`lib/githash.ts`·`lib/github.ts`·`lib/scan/`을 건드리면 **필수**. 해당 섹션의 불변식을 읽고 시작한다.
- **`docs/MVP.md` 확인** — 구현이 스펙과 어긋나면 코드가 아니라 스펙 먼저 고칠 문제일 수 있다.
- **테스트 상태 확인** — `pnpm test`로 현재 red 목록을 파악. 무엇을 green으로 만들어야 하는지가 목표다.

### 2. 구현

- **순수 함수 먼저, 껍데기 나중.** I/O를 섞으면 테스트가 불가능해지고 이 프로젝트의 검증 전략 전체가 무너진다.
- **외과적으로.** 요청 범위 밖의 인접 코드를 손대지 않는다.
- **주석은 "왜"만.** 특히 비자명한 제약(pooler와 prepared statement, PEM 개행, `base_tree` 누락 등).
- **새 환경변수를 읽었으면 같은 작업에서 `.env.example`에 추가**한다. 빠지면 새 체크아웃·Vercel 재설정에서 원인 불명으로 죽는다.

### 3. 자체 검증 (4관점, 병렬)

구현이 끝나면 아래 4관점으로 자기 코드를 검토한다. 각 발견을 🔴(반드시 수정) / 🟡(수정 권장) / ⚪(참고)로 분류한다.

1. **불변식 관점** — export 결정성이 유지되는가? blob SHA 계산이 UTF-8 바이트를 쓰는가? `base_tree`를 넘기는가? `[skip-l10n]`이 붙는가? 인증 경계가 섞이지 않았는가? (ARCHITECTURE §1·2·3·6)
2. **원칙 관점** — 머지 로직·양방향 동기화·충돌 해소가 슬며시 들어오지 않았는가? push가 번역 값을 건드리지 않는가? 삭제 대신 `orphaned`인가? (MVP.md §2)
3. **타입·경계 관점** — `any`가 없는가? `noUncheckedIndexedAccess` 아래 인덱스 접근의 undefined를 처리했는가? 환경변수 누락 시 fail-closed인가? 에러가 조용히 삼켜지지 않는가?
4. **단순성 관점** — 요청하지 않은 유연성·설정 가능성·추상화가 들어갔는가? 이 PoC에서 200줄이 50줄로 줄어드는가?

### 4. 해소 루프 (최대 2회)

🔴/🟡를 수정하고 `pnpm test` + `pnpm typecheck`를 다시 돌린다. **2회 안에 전부 해소되지 않으면 중단하고 남은 항목을 보고**한다 — 무한 루프로 스스로를 갉아먹지 않는다.

### 5. 게이트

- `pnpm test` **전체** green
- `pnpm typecheck` 통과
- 🔴/🟡 전부 해소

하나라도 미충족이면 **중단 + 리포트**.

## 리포트

```
✅ implement: <대상>
변경: <파일 목록>
테스트: <n> passed / typecheck: OK
자체 검증: 🔴 <n>건 해소 / 🟡 <n>건 해소 / ⚪ <n>건 (미수정, 내용)
POSTMORTEM 소환: <인용 항목 또는 없음>

플래그 (뒤 단계 게이팅):
- 스키마 영향: 없음 / additive / destructive  ← 있으면 /db
- 문서 영향: 없음 / MVP.md·ARCHITECTURE.md·.env.example 중 <목록>
- postmortem 후보: 없음 / <구현 중 밟은 비자명 함정>
- 미해소: 없음 / <목록>
```

**플래그는 생략하지 않는다** — `/ship`이 이걸 읽고 뒤 단계를 켠다.

## 금지 사항

- **커밋 금지** (`/ship` 또는 사용자가 담당).
- **`pnpm build` 금지** — 타입 확인은 `pnpm typecheck`.
- **테스트를 지우거나 기대값을 느슨하게 고쳐 green 만들기 금지.** 구현 중 기대값이 틀렸다고 판단되면 **왜 틀렸는지 보고하고 확인받는다**.
- **범위 확장 금지** — tasks.md 밖의 기능을 덤으로 넣지 않는다.
- **자체 검증 생략 금지** — 4관점 전부 돈다.
