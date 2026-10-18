# language-request-todo — tasks

> 순서: 시안 → 낱말·사전 → 상태 접기(순수)·일괄 읽기 → 순수 판정(+ 그 종류를 받는 렌더 갈래) → 로더 → 화면 → 대조 → 정본. 커밋 경계는 `──`로 표시한다. **커밋 경계마다 `pnpm gate`가 green이어야 한다.**
> 자동 검증(`pnpm test` · `typecheck` · `test:projects:postgres` — `lib/locales/`·`lib/inbox/`·`lib/home/`·`lib/keys/` 변경이면 `pnpm gate`가 격리 PG를 스스로 붙인다)과 **수동 확인**(브라우저 — e2e 없음)을 줄마다 구분한다.
> 사전을 순수 판정 **앞**에 둔다 — 새 할 일 종류·보류 사유가 `TILE` Record · `homeLate`·`sublineText` switch · `m.home.cards.held`를 깨므로, 사전이 먼저 있어야 판정 커밋이 green이다(design §7).

## 0. 시안
- [ ] **T0 — Claude Design 시안 수령.** `design-brief.md`를 넘기고 핸드오프를 받는다.
  - 검증(수동): `DesignSync list_files`에 핸드오프가 있고, 브리프 프레임 표의 번호마다 프레임이 있다. 시안이 design.md(문장·형·우선순위)와 다르면 **코드 전에** 어느 쪽을 고칠지 사용자에게 묻는다.

──

## 1. 낱말 · 사전 (`/translate` 모드 ①)
- [ ] **T1 — §10.1 "언어 변경 미전달" 행 + 사전.**
  - 먼저 DESIGN §10.1에 행을 정한다(en `language changes to publish` · 보류 `held` / ko·es 낱말 — `banned-terms.ts`의 `미게시`·`sin publicar`를 피한다). Logs의 `a language removal is still unsent`(`messages/en.tsx:1483,1587`)와 대조한다.
  - en 키(design §6): 행 띠 ①② · Inbox ② 본문·꼬리 · Home `languageChanges(n)` · Home `held["locale-change-pending"]`. 세 사전 같은 커밋. `held` 키는 `lib/i18n/__tests__/terminology.test.ts`의 `ALLOWED`에 등재한다.
  - 검증(자동): `dictionary-consistency` · `terminology` · `numeric-counts`(새 수 함수) · `host.test` green, `pnpm gate` green(쓰이지 않는 키는 막히지 않는다).

──

## 2. 상태 접기 · 일괄 읽기
- [ ] **T2 — `foldLocaleStates` 분리 + `readLocaleStatesByProject`** (`lib/locales/work.ts`).
  - `readLocaleStates`는 조회를 그대로 두고 접기만 `foldLocaleStates`로 옮긴다(design §2). 일괄 함수는 `in ids` 조회 둘을 `Promise.all`로 묶고, ADD가 있을 때만 일괄 값 수 raw를 부른다.
  - 검증(자동, 격리 PG): 프로젝트 둘 이상 fixture에서 프로젝트별 결과가 `readLocaleStates`와 같다. fixture는 확인 뒤 낸 요청 · 같은 언어의 두 번째 요청(POSTMORTEM 2026-10-14) · 거둘 것만 · 값 0개 ADD · 무효화된 전달 목록(`delivered: null`) · 보관 소스 · 보관 프로젝트(ids에서 빠짐)를 둔다.
  - 검증(자동, 회귀): `readLocaleStates` 소비자 스위트가 그대로 green이다 — `expire` · `change` · `locale-lifecycle` · `locale-publish` · `tools`(MCP) · `nightly` · `locale-work-aggregates` · `sync-edit-protection` · `delivery-invariants` `.integration.ts`(승인 지문은 소스 id 정렬 순서에 기댄다).

──

## 3. 순수 판정 (+ 그 종류·사유를 받는 렌더 갈래)
- [ ] **T3 — `languageTodo`** (`lib/locales/todo.ts` 새, `import type`만으로 `SurfaceLocaleState`를 받는다).
  - 검증(자동): 단위 테스트 — 수 · `held === (planLocaleImportGate(states).action === "defer")` · 대표 slug · `at`(행 없는 거둘 것 → `null`) · 작업 0 → `null`.
- [ ] **T4 — `projectTodos` `language_unsent` · `planProjectRow` 우선순위 · Inbox 갈래** (`lib/inbox/project-todos.ts` — `import type { LanguageTodo }`만 · `lib/projects/list.ts` · `lib/inbox/plan.ts`(union · `:50` rank · `:53` 동점 · `:65-69`) · `lib/home/attention-view.ts`(`TILE` · `attentionHref` → Home · `title` · `body` · `tail`)).
  - 검증(자동): 2,880 표 테스트(`lib/projects/__tests__/list.test.ts` — `:579` 제목 · `:601` 불변식 2 목록 · `:604` 우선순위 식 · `:607` 조합 수 · `:609` `seen` 목록)에 축(언어 작업 0/양수 × held)을 더해 불변식 넷이 그대로 서고, 미발송 > 언어 변경 > 열린 PR을 명시 사례로 둔다. 완료 조건 6 표(`project-todos.test.ts` `:69-70` `DB` 집합)에 이 종류를 더한다. 끊김에서도 선다 · 두 역할 모두 · 값 있는 ADD에서 `unsent`와 둘이 선다. `client-graph.test.ts`(`:676-688`) green — `todo.ts`·`locale-gate.ts`가 클라이언트 그래프에 없다.
- [ ] **T5 — `planHoldNotice` `locale-change-pending` · `planHomeHold` · `holdSubline`·`sublineFor` `languageChanges` · Home 렌더 갈래** (`lib/protection/plan.ts` · `lib/home/cards.ts` · `lib/home/meta.ts`(`homeLate` `:279`) · `components/home/count-cards.tsx`(`sublineText` `:153`) · `components/home/hold-later.tsx`(기본 줄 prop)).
  - 검증(자동): `lib/protection/__tests__/hold-notice.test.ts`를 보관·끊김을 뺀 전수 조합(편집 0/양수 × localeHeld × gateApplies × openPr 삼상태)의 게이트 셋 일치 표로 넓히고, 보관·끊김 `null` 행을 둔다. `lib/home/__tests__/cards.test.ts`(`:213-222`)에 `localeHeld` 행 — PR 조회 함수 0회. `sublineFor`·`holdSubline` 갈래 단위 테스트. `lib/status/__tests__/cross-screen.test.ts`(`HoldReason` 쓰는 `:118` · `:234`) green.
  - 검증(자동, DOM): `HoldLater` 도착 전 · 결론 `null` · 결론 `open-pr`에서 보조 줄이 각각 `languageChanges` · `languageChanges` · PR 사유다.

──

## 4. 로더
- [ ] **T6 — 목록·Inbox·Home 로더** (`lib/keys/query.ts` `loadProjectList`(비보관 id만, `Promise.all` `:336`) · `lib/inbox/load.ts`(`Promise.all` `:33`) · Home `page.tsx`의 `readLocaleWork` 확장).
  - 검증(자동, mock): `lib/keys/__tests__/list-aggregates.test.ts`(`:31-47`)와 `lib/inbox/__tests__/load.test.ts`(`:18-37` — mock db에 `localeChange`·`deliveryConfirmation`을 더한다)가 새 일괄 함수의 Prisma 호출 수를 프로젝트 1개와 N개에서 같게 세고, `projectId in ids`를 단언한다.
  - 검증(자동, 격리 PG): `lib/keys/__tests__/list-aggregates.integration.ts` — 같은 fixture에서 행 띠 수 = Inbox 항목 수 = `countLocaleWork`(교차). 그 fixture에는 미전달 `REMOVE ko`(`:1091`)와 값 있는 `ADD fr`(`:1105`)이 있으므로 **기존 단언 둘을 갱신한다**: `:1117` 행 띠 `review` → `language_unsent`(held), `:1121` Inbox 종류 목록에 `language_unsent` 추가. 조회 수 단언(`:1110-1114`)은 ADD가 있으므로 **9**다.
  - 검증(자동): 배지 경로 소스 단언(`components/__tests__/inbox-row-slots.test.tsx:136-142`)의 대상에 `lib/locales/todo.ts`·`lib/locales/work.ts`를 더하고 `loadRemoteSignals`·`@/lib/projects/remote` 0이 그대로다.
  - 검증(수동): Home `page.tsx`는 테스트가 없다 — T9에서 본다.

──

## 5. 화면
- [ ] **T7 — 행 띠 · Inbox 항목 · Home 렌더** (`components/projects/project-list.tsx`(`ProjectBanner` 글리프 · `BannerAction` 목적지 → Home) · `components/inbox/row-slots.tsx` · Home 카드·메타 열).
  - 검증(자동, DOM): `components/__tests__/project-row.test.tsx` — 언어 작업만 있는 행에 띠 하나 · 칩 `Active` · muted · `GitPullRequestArrow` · 링크 `/projects/<slug>` · ①② 문장 · 미발송과 함께면 미발송 띠. `components/__tests__/inbox-row-slots.test.tsx` — ① 통짜 · ② 본문·꼬리 · 두 역할 · 목적지 Home. Home 카드 DOM 테스트 — 보조 줄 ①② · 메타 열 Sync 탭 `Held` 배지 · 언어 보류 중 PR 상태 `absent`(D12 고정).
- [ ] **T8 — `/design-sync`**: 브리프 프레임마다 computed style과 접근성 트리를 실측한다.
  - 검증(수동): 실측 일치 · 리뷰 지적 0.

──

## 6. 확인 · 정본
- [ ] **T9 — 런타임 확인** (`/runtime-test`, 로컬). **폐기용 새 프로젝트**로 한다(리뷰 D15) — 제거 요청은 그 언어의 미전달 편집을 버리고(`lib/locales/change.ts:401`), 추가 취소는 `orphaned`를 쓰며(`:409`), `ProjectEvent`는 지우지 않아 상주 프로젝트를 원상으로 되돌릴 수 없다.
  - 장면: ① 전달 전 제거 · ② 값 있는 추가만(되살리기 — orphan 언어 재추가로 값 있는 ADD를 만든다) · ③ 거둘 것만(보낸 뒤 취소).
  - 검증(수동): `/projects` 띠 · Inbox 항목·배지 · Home `To send` 보조 줄 · 메타 열 `Held`가 같은 사실을 말한다. 제거면 Home이 보류를 말한다. 끝나면 프로젝트를 보관하고, 남은 사건을 전/후 표에 적는다.
- [ ] **T10 — 정본 갱신**(문서별 커밋).
  - DESIGN: §6.63 띠 항(#290 예외 문장을 새 띠로 교체 · 우선순위 · 보류를 띠에서 말하는 근거 — OWNER의 질문) · §6.64 `To send` 보조 줄·보류 사유·늦은 갈래 기본 줄(그 절의 "Suspense로 스트리밍" 서술은 코드와 다르다 — `useArrived` effect로 고친다) · §2.4 보류 행에 `locale-change-pending` · §10.1(T1에서 정한 행 확인).
  - ARCHITECTURE: §5.10.3(표시가 게이트를 읽는다 · 야간은 Publish한다) · §6.365 Inbox 항목 · 목록·배지 왕복 증가(D13).
  - PRODUCT: Inbox 항목 서술.
  - DIRECTORY: `lib/locales/todo.ts`.
  - 그 뒤 이 디렉터리를 지운다.
  - 검증: `/push` 4단계 문서 신선도 통과 · `rg -n "malmoi#290" docs/DESIGN.md`가 새 띠 서술만 가리킨다(예외 문장이 없다).
- [ ] **T11 — 가이드 영향** — Inbox 항목 서술(`guide/{en,ko,es}/translate/edit.md#inbox`)과 Home `To send` 서술이 있으면 `/guide`. 
  - 검증: `pnpm test` green(가이드 게이트) · `pnpm guide:check --json`에서 이 기능이 바꾼 경로에 걸린 컷의 stale 0(걸리면 `/guide-shots`).
