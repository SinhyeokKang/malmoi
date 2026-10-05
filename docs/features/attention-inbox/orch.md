# attention-inbox — orchestration

원본: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md). 이 문서는 지휘 계획·상태만 든다.

- 시작 dev: `efe216e8` (2026-10-05)
- **디자인 정본(시안)**: https://claude.ai/design/p/b99d54cd-3034-44f1-8446-0a864da9d767?file=Attention+Inbox.dc.html
  (spec.md:5 — 프레임 H1–H3 · D1–D7). 퍼블리싱 배치 B가 구현 기준으로 쓰고, 통합 뒤 `/design-sync`(T9)가 대조 기준으로 쓴다.

## 결정 기록

1. (2026-10-05 사용자) **Codex 워커 위임 허가 — 적합한 배치에 한해**(토큰 분산 목적, 전부 Codex로 하지 않는다).
   범위: 배치 A(백엔드 — 순수 함수·스키마·껍데기·Action, 테스트로 판정이 닫힌다)만 Codex `gpt-6-astra`.
   UI(B)·리뷰·QA·design-sync는 Claude Code(Opus 5.5) — DesignSync가 Claude Code 전용이고 시안 대조가 필요하다.
2. 제품·설계 결정은 design.md "닫힌 결정" 1–11이 전부다. 새 🔒 없음.
4. (2026-10-05 사용자) `/guide-shots`: 셸이 든 컷 전부 + README hero·logs + 새 `#inbox` 컷 재촬영(QA 끝, 직렬).
5. (2026-10-05 사용자) **랜딩 목업(`components/landing/mockup/`) stale 전부 수정** — 헤더 Inbox 반영 + 검색 버튼 높이 등 현재 앱 셸과 다른 곳. B가 R-B 수정 라운드와 함께 맡는다.
3. T9 design-sync: 통합 뒤 main 체크아웃 Claude QA 워커가 시안 프레임별로 실측(computed style + AX 트리) → 결함은 BugShot → B가 고친다
   (메모리: 정본이 준비된 변경은 design-sync를 건너뛰지 않는다).

## 배치

| 배치 | 항목 | 워커 | 소유 파일(요지) | 선행 | 상태 |
|---|---|---|---|---|---|
| A | T1 · T2 · T3 · T4 · T5 · T6 · T10 · T11 | Codex `gpt-6-astra` medium(Astra 상한 — 2026-10-05 사용자) — 명세·테스트 목록이 닫혀 기계적 | `lib/home/**` · `lib/inbox/**` · `lib/routes.ts` · `components/home/attention-card.tsx` · `components/projects/project-list.tsx`(import만) · Home `page.tsx` · `lib/keys/query.ts` + 테스트 · `prisma/**` · `lib/privacy/**` · `app/(edit)/inbox/actions.ts` · `app/__tests__/entry-points.test.ts` · PRODUCT · ARCHITECTURE · CLAUDE.md | — | 대기 |
| B | T8a → (WAITING FOR A) → T7 · T8b · T12 · T13 · T14 | Claude Opus 5.5 high — 시안 대조·포커스/로빙 함정·프리미티브 이관 | `components/ui/{list-row,list-group,dropdown-menu,command}.tsx` + 테스트 · `components/shell/{attention-inbox,header}.tsx` · `components/__tests__/shell-header.test.tsx` · `messages/{en,ko,es}.tsx` · `/privacy` 본문(사전 방침 절) · DESIGN · DIRECTORY · `guide/**` · `public/guide/**` | T8b는 A가 dev에 들어간 뒤 | 대기 |
| R-A / R-B | 독립 리뷰 | Claude Opus 5.5 high, 리포트 전용 | — | 각 배치 인계 | — |
| Q | T9 `/design-sync` + `/runtime-test`(인계 (b) 목록) + 레이아웃 QA | Claude Opus 5.5 high, main 체크아웃 | — | A·B 통합 | — |

겹침: A↔B 파일 겹침 없음(B의 T8b가 A의 `actions.ts`·`plan.ts` 형을 import할 뿐) → T8a·T7은 병렬, T8b는 A 통합 뒤 `git rebase dev`.
`messages/*`는 B 단독 소유 — A는 사전을 건드리지 않는다(T1 문장 함수 이관은 `m`을 인자로 받는다).

## 마이그레이션

A가 `prisma migrate diff`(더미 `DIRECT_URL`)로 SQL만 만든다 → 지휘자가 dev DB `migrate deploy` · `db:status` · anon 권한 0 확인. prod `db:deploy`는 `/merge` 1단계.

## 진행


- 2026-10-05 A 재시작: Astra high → medium(사용자, dispatch `ctx_8ab8edafcf13`). B dispatch `ctx_a41dfdd47b86`.
- 2026-10-05 T13 A → B 이관: 방침 본문이 `messages/*`(B 소유)에 있다. A는 인계에 "방침에 들어갈 사실"만 남긴다.
- 2026-10-05 A 완료(`a0e5b899..d3bfcf3c`, 커밋 10, gate ok — Node 26). R-A(Opus high): 🔴0 🟡4 🟢7. fix1(🟡1–3 · 🟢1·2·5) → A dispatch `ctx_f6793875abc1`. 🟡4는 B T8b DOM 테스트로 전달.
  보류: 🟢3(배지 경로가 review/actors 조회도 돈다 — 측정 뒤 판단) · 🟢4(관계 필터 groupBy 빈도 증가 측정 — Q) · 🟢7(방침 공백 — A·B를 같은 push로 낸다 → **A만 먼저 push하지 않는다**).
- 2026-10-05 A fix1(`effb5882..d9d2bb56`) 지휘자 확인 → A 전체 로컬 dev 통합(`..be5c8ec3`, push 안 함 — 🟢7). dev DB `20261005090000_add_user_attention_seen_at` 적용 · db:status clean · anon/authenticated USAGE·CREATE false · GRANT 0. `pnpm gate` ok(Node 26). B에 "A is in dev".
- 2026-10-05 B 완료(`b054a86e..ebcadac3`, 커밋 7, gate ok). 결정 1(오류 줄 CommandStatus polite vs 시안 role=alert)은 design.md 닫힌 결정 11대로 polite 유지. R-B(Opus high) dispatch `ctx_b2cf4bc77a29`.
  남은 일: CLAUDE.md 프리미티브 51→52(지휘자 문서 신선도) · `/guide-shots` 셸 컷 전체 재촬영 범위(사용자 판단) · T9 design-sync · 런타임 (b).
