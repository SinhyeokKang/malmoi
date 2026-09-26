---
name: "source-command-guide"
description: "guide/ 사용자 가이드(en)를 AUTHORING.md 규칙대로 작성·갱신. 검증은 pnpm test. 빌드·커밋 안 함."
---

# source-command-guide

Use this skill when the user asks to run the migrated source command `guide`.

## Command Template

`guide/**.md`(`/docs`로 서빙되는 사용자 가이드)를 **작성·갱신**하는 전용 스킬. 코드는 건드리지 않고 `guide/`만 다룬다. 작성 규칙·IA·표기 규약·톤·사실 대조 소스·외부 라벨 허용 목록은 전부 **`guide/AUTHORING.md`가 단일 출처**다 — 이 스킬은 그 매뉴얼을 로드해 실행하는 손이다.

**본문은 en 단일이다.** 로케일 대칭·언어 전환은 없다(bugshot-2와 다른 점). AUTHORING·SHOOTING은 한국어이고 서빙되지 않는다.

**진입 신호**: `/implement` 보고의 **"가이드 영향"** 플래그, 또는 `/push` 4단계의 **"가이드 stale 후보"** 경고. 둘 다 차단이 아니라 이 스킬을 부르라는 신호다.

## 사용

- `/guide` — 직전 컨텍스트(방금 구현한 기능, "가이드 영향" 플래그)에서 갱신 대상 추론.
- `/guide <페이지 경로 또는 설명>` — 대상 명시. 예: `/guide setup/workflow`, `/guide 초대 한도 안내`.
- `/guide sync` — 전체 대조. AUTHORING 사실 대조 표의 소스 전부를 현재 코드와 견줘 낡은 페이지를 모두 갱신.
- `/guide new <절>` — 페이지·절 추가(IA 변경) — `guide/SUMMARY.md`와 AUTHORING IA 표까지.

## 다른 스킬과의 분리

- `/implement` — 코드 구현. 가이드는 "가이드 영향" 플래그만 남기고 쓰지 않는다.
- `/guide` ← 여기. **본문 작성·갱신 + `pnpm test`**. 빌드·커밋 안 함.
- `/guide-shots` — **이미지만** 촬영·갱신. 본문은 안 건드린다. 이 스킬은 촬영하지 않는다 — 새 컷이 필요하면 리포트에 적고 넘긴다.
- `/push` — 4단계에서 가이드 stale 후보를 **경고만** 한다.

## 절차

### 0. AUTHORING.md 로드 (필수 선행)

**가장 먼저 `guide/AUTHORING.md`를 전문으로 읽는다.** 이 단계를 건너뛰고 작성하지 않는다 — 표기 규약(굵게 = UI 라벨·정확 일치), 앵커·표 이름 규칙, 화면 문구 규칙, EDITOR 규칙, `Needs review`를 플래그로만 쓰는 규칙이 전부 거기 있고 대부분이 `pnpm test`로 red가 난다.

### 1. 대상 결정

- 인자 또는 직전 컨텍스트에서 갱신 대상 페이지를 확정한다.
  - `/implement` 직후면 그 보고의 "가이드 영향" 대상을 채택.
  - `sync`면 SUMMARY에 오른 페이지 전부.
  - 자연어면 AUTHORING IA 표(페이지 → 독자)에 매핑.
- 이미지가 걸렸으면 `pnpm guide:check`를 **돌려서 출력을 그대로 인용한다.** ⚠️ **stale 판정을 여기서 다시 짜지 않는다**(git 시각 비교·소스 추측 금지) — 정본은 그 명령 하나다.

### 2. 코드 대조 (사실 확정)

**AUTHORING "사실 대조 소스" 표의 경로를 읽어** 현재 코드의 사실을 확정한다 — 화면 라벨은 `messages/en.tsx`, 한도·상수·워크플로 경로는 표가 가리키는 정본 파일. **추측 금지** — 라벨은 화면 문구와 글자 단위로 같아야 하고, 상수는 `pnpm test`가 절 단위로 정본과 대조한다.

- 코드명이 아니라 **화면 문구**를 쓴다(`Sources`).
- 편집자 장은 **EDITOR 계정이 보는 화면만** 약속한다.
- 외부 화면(GitHub) 라벨을 굵게 쓰려면 AUTHORING 외부 라벨 허용 목록에 먼저 올린다.

### 3. 작성·갱신 (메인 스레드 단일)

- AUTHORING 규칙대로 쓴다. 모든 페이지는 H1 하나 + **도입 문단** + H2마다 `{#id}`.
- IA가 바뀌면 `guide/SUMMARY.md`와 AUTHORING IA 표를 함께 고친다. **앵커 id를 바꾸지 않는다** — 옛 링크가 깨진다. 바꿔야 하면 `routes.docs(...)` 호출부와 옛 해시 매핑을 같이 본다.
- 이미지는 `/guide/<name>.webp` 절대경로 + 의미 있는 alt. **새 이미지 파일은 이 스킬이 만들지 않는다** — `/guide-shots` 몫이다.
- **외과적**: 대상 페이지만. 무관한 페이지 톤·문구 임의 변경 금지.

### 4. AUTHORING.md 동기 점검

이번 변경이 **작성 기준 자체**를 바꿨으면(새 페이지 → IA 표, 새 사실 소스 → 사실 대조 표, 새 외부 라벨 → 허용 목록) AUTHORING의 해당 표도 함께 고친다.

### 5. 검증

**`pnpm test`** — 구조(SUMMARY↔트리·H1·`{#id}`)·링크·앵커 해소·플레이스홀더 0·라벨 ⊂ 사전 ∪ 허용 목록·표 이름 중복·정본 상수 대조·이미지 게이트·한글/브랜드/용어 게이트가 전부 여기 있다. 사람이 grep 체크리스트를 돌리지 않는다.

`pnpm build`는 돌리지 않는다(`/push` 1단계 몫).

### 6. 보고 + 종료

```
대상: <페이지 N개 / sync / 경로>
갱신 파일: <guide/… 목록>
사실 대조: <확인한 소스 — 라벨·상수 일치 여부>
AUTHORING 동기: <갱신함(표) / 변경 없음>
이미지: <영향 없음 / pnpm guide:check 출력 인용 → /guide-shots 필요>
검증: pnpm test <n> passed
```

- 보고 후 **종료**. 빌드·커밋·푸시 안 함(커밋은 `/ship`·사용자가 `docs(guide): …`로).

## 금지 사항

- **AUTHORING.md 안 읽고 시작 금지** — 0단계는 필수.
- **코드 수정 금지** — `guide/`만. `messages/en.tsx`·`app/`·`lib/`는 읽기만 한다.
- **사실 추측 금지** — 라벨·상수는 코드 재확인.
- **stale 판정 복제 금지** — `pnpm guide:check` 출력을 인용한다.
- **ko 본문 작성 금지** — 서빙 본문은 en 단일이다.
- **빌드·커밋·푸시 금지**.
- **범위 밖 페이지 임의 워싱 금지**.
