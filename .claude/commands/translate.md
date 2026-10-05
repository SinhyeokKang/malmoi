---
description: 화면 사전(ko·es)과 번역 원고의 키 추가·수정 및 일괄 검수. 규칙은 정본(DESIGN §10·banned-terms·AUTHORING)을 가리키고 이 스킬은 절차·체크리스트만 든다. 빌드·푸시 안 함.
---

화면 문구의 번역(`messages/ko.tsx`·`es.tsx`, 필요하면 `ko-privacy.tsx`·`guide/ko`·`guide/es`)을 **같은 기준으로** 다루는 손이다. 2026-10-05 user-timezone 런에서 같은 기준을 세 번(K1 톤 검수 → K2 용어 검수 → AUTHORING ko 톤 보강) 다시 전달한 뒤 한 곳으로 모았다.

**이 파일은 규칙을 복제하지 않는다** — 규칙이 바뀌면 아래 정본이 바뀌고 이 스킬은 그대로다. 정본과 이 파일이 어긋나면 정본이 이긴다.

| 무엇 | 정본 |
|---|---|
| en 문장 규칙(sentence case·마침표·줄임표·오류 문장·git 어휘 금지) | `docs/DESIGN.md` §10 |
| ko·es 문체(ko 합니다체·버튼 명사형·보간 값 뒤 받침 조사 금지·en 유지 낱말 / es tú·동사 원형) · 기능 이름 표 | `docs/DESIGN.md` §10.0 |
| 개념별 화면 용어와 "쓰지 않는 말"(en·ko·es 열) | `docs/DESIGN.md` §10.1 + `lib/i18n/__tests__/helpers/banned-terms.ts`(같은 커밋에서 같이 고친다) |
| 상태 톤·낱말 | `docs/DESIGN.md` §2.4 |
| 사전 입구·영어 고정 표면 목록 | `docs/ARCHITECTURE.md` §6.355 · CLAUDE.md "코드 컨벤션" |
| 가이드 원고의 언어 규칙·라벨 게이트·톤 | `guide/AUTHORING.md` `#languages`·`#labels`·`#tone-ko`(ko 원고 톤) |
| ko 개인정보 방침 | `messages/ko-privacy.tsx` + `lib/privacy/__tests__/policy-gate.test.tsx`(`koDigest`) |

## 사용

- `/translate` — 직전 컨텍스트(방금 만든·고친 사전 키)에 **모드 ①**.
- `/translate review <범위>` — **모드 ②** 일괄 검수. 범위는 사전 절(`logs.*`)·언어(`ko`)·축(톤 / 용어)·가이드 트리(`guide/ko`)로 준다. 범위가 없으면 묻는다 — 사전 전체 검수는 수백 항목이라 범위를 조용히 고르지 않는다.

## 판정 기준 (두 모드 공통)

- **ko-first 질문 하나**: "처음부터 한국어로 기획·작성된 서비스라면 이 자리에 이 말을 썼을까?" en의 구조·어순·문장 수를 따라갈 의무가 없다 — **의미와 정보만** 지킨다(2026-10-05 사용자). 직역 어순·`~하는 것`·`~에 대한`·이중 피동·지나친 명사화·영어 비유를 걷는다.
- **en 유지는 허용이지 강제가 아니다.** 고유명사·프로토콜·개발자 문맥의 기술 용어·코드·경로·명령은 en이 더 자연스러우면 남긴다(목록은 §10.0 ko 항목). 슬로건도 한때 en 고정이었다가 번역으로 돌아왔다(2026-10-05 T9) — 자리마다 질문으로 판정하고 "기술 용어니까 en"으로 일괄 처리하지 않는다. 일반 UI 동작(저장·취소·삭제)은 한국어다.
- **같은 개념은 사전 전체에서 한 낱말** — 새 낱말을 만들기 전에 §10.1·§2.4와 기존 키를 `git grep`한다.
- **es는 tú**이고 나머지는 §10.0 es 항목이다.
- **길이** — 좁은 자리(버튼·배지·라벨 열·필터 트리거)는 en보다 길게 만들지 않는다. 의심되면 런타임 검증 목록으로 넘긴다(아래).

## 모드 ① 키 추가·수정 (기능 배치 안에서)

`/implement`·`/ship`이 사전 키를 만지는 단계에서 부른다.

1. **영어 고정 표면인가** — ARCHITECTURE §6.355 목록(MCP 응답·초대 메일·SEO 메타·cron·CLI 등)이면 ko·es를 만들지 않고 `import { en } from "@/messages/en"`로 명시한다. 네임스페이스 전체가 영어 고정이면 `dictionary-consistency.test.ts`의 `ENGLISH_ONLY`가 그 근거다.
2. **세 사전에 같은 커밋** — en(원문) → ko → es. ko·es는 `satisfies Messages`라 빠지면 typecheck가 red다. 키·시그니처·JSX 구조는 en과 같게 둔다.
3. **함수 값이면** `lib/i18n/__tests__/helpers/function-args.ts`에 대표 인자를 등재한다(누락은 typecheck가 잡는다). ko는 복수 갈래를 한 형으로 접는다(§10.0).
4. **en과 같은 문자열을 일부러 남기면**(고유명사·코드) `dictionary-consistency.test.ts`의 `SAME_AS_EN` 키 경로 허용 목록에 넣는다 — 안 넣으면 번역 누락으로 red다.
5. **가이드가 그 라벨을 인용하면** en·ko·es 원고의 굵은 라벨을 같은 작업에서 맞춘다(`/guide` — 라벨은 그 언어 사전의 값이어야 한다). `aria-label` 전용 키면 `lib/guide/__tests__/content.test.ts`의 `ARIA_ONLY`를 본다.
6. 위 "판정 기준"으로 ko·es 값을 한 번 읽는다. ko 값은 사용자 일괄 검수 대상이므로 초안이어도 gate green이면 진행한다(아래 "검수 주체").

## 모드 ② 일괄 검수 (K1·K2형)

1. **범위 확정** — 브리프·인자의 범위만 본다. **다른 배치가 소유한 키·파일은 제외**하고(같은 런에서 진행 중인 배치가 고칠 절) 어색하면 인계에 제안만 남긴다. 범위 안이라도 `en.tsx`는 값을 바꾸지 않는다(원문 수정은 검수가 아니라 기능 변경이다).
2. **문맥 대조** — 값마다 en 원문·그 키의 주석·그 키를 읽는 컴포넌트(`git grep`)를 본다. 사전만 보고 고치면 화면에서 무엇 옆에 서는지 모른다.
3. **축을 나눈다** — 톤(문장)과 용어(낱말)는 다른 검수다. 용어 축이면 사전 전체에서 같은 개념의 낱말을 `git grep`으로 전수 센다.
4. **용어를 바꾸면 세 곳을 같은 작업에서** — DESIGN §10.1(필요하면 §10.0) 표 · `banned-terms.ts`(옛 낱말을 쓰지 않는 말로 등재해 재발을 막는다) · 그 낱말을 쓰는 가이드 산문. 테스트가 막으면 근거를 읽고, 근거가 사용자 결정과 충돌할 때만 테스트를 고친다(인계에 이유).
5. **가이드 동기화** — 바뀐 화면 라벨을 인용하는 원고는 반드시 맞춘다(라벨 게이트가 red를 낸다). 본문 산문까지 손볼지는 범위가 정한다. 구조(앵커·이미지·링크·단계 수)는 en과 동형을 유지한다(AUTHORING `#languages`).
6. **`ko-privacy.tsx`는 법적 문서다** — 범위에 명시됐을 때만 고치고, **의미를 바꾸지 않는다**(표현만). 고치면 `policy-gate.test.tsx`에 새 개정 행(`koDigest`)이 필요하다. 범위 밖이면 어색한 곳을 인계에 목록으로만 남긴다.
7. **인계 문서**에 남긴다 — 판단 기준 표(en 유지한 낱말·한국어로 바꾼 낱말과 이유) · 대표 before→after(20개 안팎) · 앞선 검수 결정을 뒤집었으면 그 목록과 이유 · 범위 밖 제안 · 런타임 검증 목록. 사용자는 이 표로 검수한다.

## 검수 주체

- **ko — 사용자가 일괄 검수한다.** 에이전트 초안은 gate green이면 통합하고 사용자가 `/merge` 전에 모아서 본다. 그래서 인계의 before→after 표가 산출물의 일부다.
- **es — 에이전트 초안 그대로 낸다**(AUTHORING `#languages`와 같다).
- 전담 번역 워커는 **모드 ② 일괄 검수 때만** 띄운다. 모드 ①은 기능 배치의 워커가 이 스킬로 직접 한다.

## 모델 경계

워커·서브에이전트를 띄우면 CLAUDE.md "워크플로우"의 지휘자-워커 패밀리 규칙을 그대로 따른다(Codex 지휘 → Sol·Astra, Claude Code 지휘 → Sonnet·Opus). **교차는 사용자의 명시 허가가 있을 때만**이다 — K1(ko 톤 검수)이 Codex였던 것은 사용자가 지정한 경우다.

## 게이트

- **`pnpm gate --base dev`** 하나가 근거다(끝줄 `gate: ok`). 출력을 파이프로 거르지 않는다.
- 반복 중에는 단독으로 돌린다:
  - `lib/i18n/__tests__/dictionary-consistency.test.ts` — 키 집합·번역 누락·빈 문장·쓰지 않는 말·영어 고정 입구
  - `lib/i18n/__tests__/terminology.test.ts` — en 화면 용어(§10.1 en 열)
  - `lib/i18n/__tests__/ko-language-sentence.test.tsx` — ko 보간 문장
  - `lib/i18n/__tests__/no-korean-ui.test.ts` · `brand-spelling.test.ts` · `messages-type.test.ts`
  - 가이드를 고쳤으면 `lib/guide/__tests__/content.test.ts`(라벨·쓰지 않는 말) · `locales.test.ts`(구조 동형)
  - `ko-privacy.tsx`를 고쳤으면 `lib/privacy/__tests__/policy-gate.test.tsx`
- 브라우저 실측은 이 스킬이 하지 않는다 — 줄바꿈·폭 의심 자리는 화면·확인할 내용을 인계의 "런타임 검증 목록"에 남긴다(`/runtime-test` 몫).

## 커밋

**사전 / 가이드 / DESIGN을 커밋으로 나눈다** — 각 커밋 gate green. 단 사전이 라벨을 바꿔 가이드 라벨 게이트가 red가 되면 그 인용 수정은 사전 커밋에 함께 싣는다(커밋마다 green이 우선이다).

- `fix(i18n): …` — `messages/*.tsx` + 용어 테스트(`banned-terms.ts` 등). 모드 ①은 기능 커밋 안에 들어간다.
- `docs(guide): …` — `guide/ko/**`·`guide/es/**`.
- `docs(DESIGN): …` — §10.0·§10.1.
- `docs(privacy): …` — `ko-privacy.tsx` + 개정 행.

## 금지 사항

- **규칙을 이 파일에 복제하지 않는다** — 정본을 고친다.
- **`messages/en.tsx` 값을 검수 모드에서 바꾸지 않는다.**
- **보간 값 뒤 받침 조사**(을/를·이/가·은/는·와/과·으로/로)와 `을(를)` 병기 금지(§10.0).
- **다른 배치 소유 키를 고치지 않는다** — 제안만.
- **방침의 의미를 바꾸지 않는다.**
- **빌드·푸시 안 함.** 커밋은 위 경계대로만.
