# component-unify — tasks

순서: **재조사 → 단위 ① 토큰·정리(값 0) → 특성 테스트 → 단위 ② API 이름(축마다 커밋) → 단위 ③ 통합·신설(+이관 같은 커밋) → §6.3 교정 → 문서 → 종료.**
`[commit]`이 커밋 경계이고 **경계마다 `pnpm gate` green**(출력을 파이프로 거르지 않는다 — POSTMORTEM 2026-09-30). 라벨: **[자동]** 테스트 · **[수동]** 브라우저 레이아웃 QA.
**단위가 끝날 때마다 `/push`** — ②③은 그 앞에 `/runtime-test`(spec S10).
**신설·통합 태스크는 `hand-copies.test.ts`(design §5.1)에 자기 행을 같은 커밋에 넣고, `api-contract` 허용 목록(design §5.2)에서 자기 행을 지운다.**
**"뒤집는 테스트"는 기대 문자열만 새 값으로 바꾸지 않는다** — 상태 키·`data-tone`·슬롯 노드로 옮긴다(design §5.4).

**[수동] 레이아웃 QA 화면 목록**(모든 [수동]이 이것을 쓴다, 뷰포트 1280·1440·1890): Home · `/projects` · 번역 화면 · Sources(+상세 모달) · Logs(+이력 상세) · Settings(General·Repository·Members·MCP) · Account · 온보딩 ①–④ · 랜딩 · `/signin`.

## 0. 착수 전

- **T0** 재조사 — 전제: `test ! -d docs/features/ux-drift-unify`(ux-drift T31 완료).
  - design §9 명령을 다시 돌려 표·spec·design 수치를 갱신한다. ux-drift가 이미 해소한 행(닫기 버튼 · Sources hover · 배지 글리프 · 철자 5-Y8 · 행 패딩 4-W3 등)은 지운다.
  - ux-drift 산출물(S4 — Meter · SecretField · Facts · ErrorState/404 · FieldError · `StatusBadge` 화면 소비자)이 코드에 있는지 확인하고 §4 행의 file:line을 채운다. 없으면 멈추고 사용자에게 묻는다.
  - design §8 "남은 T0 판정" 다섯을 채운다(`width` 값 목록 · 상태/중립 이름 · 확정 토큰 이름 · §6.3 "T0" 칸 · placement 형별 소비자 수).
  - 아래 태스크의 "뒤집는 테스트" file:line을 재확인한다.
  검증 [자동]: design §9 명령을 다시 돌린 값이 표와 전부 일치(명령 출력과 표를 한 줄씩 대조) · `rg -n "T0 —|T0이 채운다|T0$" docs/features/component-unify/design.md` 0건.
  `[commit] docs(feature): component-unify refreshed inventory`

## 단위 ① 토큰 · 정리 — 값 변화 0

- **T1** 철자 접기(design §6.1 — BannerLine 제외). 먼저 **동치 테스트**(design §5.3 — `tailwindcss` `compile`로 옛·새 철자 쌍의 선언 동일)를 쓰고, 그다음 접는다.
  - `visual-system.test.ts`에 "같은 값 두 철자 0"(짝 없는 `/5`·`/6` 허용) + 카나리아.
  - 뒤집는 테스트: `mcp-connected-apps.test.tsx:103,235` · `projects-screen.test.ts:280,395,397` · `projects-cards.test.tsx:101` · `privacy-doc.test.tsx:180,199` · `b5-layout-wrap.test.tsx:23` · `visual-system.test.ts:242-251`.
  검증 [자동]: 동치 테스트 green(쌍 전부) · 옛 철자 0 스캔 · `pnpm gate` green.
- **T2** 토큰 신설(design §6.2 확정 목록). 순서: `@theme`에 토큰 → 소비자 교체 → 죽은 클래스 스캔(POSTMORTEM 2026-09-23). DESIGN §2 토큰 표·§6.2 등재·`REGISTERED`·§6.3 링크 색·§6.8 무채 계단을 **같은 커밋**에서 고친다.
  검증 [자동]: 확정 토큰 값의 raw 사용 0(`lib`·`messages` 포함, 접두 `border-t-`·`placeholder-`·`caret-`·`accent-`) · `@theme`에 없는 클래스 0 · 동치 테스트에 토큰 쌍 추가 green.
- **T3** 소비자 0 삭제(C4) · 이메일 hex 대조.
  - 지운다: `Breadcrumb` · `SegmentedLinks` · `Avatar shape="square"` · `@theme` 색 7개와 `:root` 짝(`globals-css.test.ts:108-117` 양방향 등록).
  - hex 대조(design §5.3 — hsl→hex, `#262626` 예외 목록, `TONE_HEX` 포함, `message.test.ts:353-390` 옆).
  - 뒤집는 테스트: `focus-ring.test.ts:15,238-246`(`SegmentedLinks` 렌더 · `toHaveLength(3)`).
  - ⚠️ `lib/__tests__/`·`lib/invitation-email/`을 건드려 `pnpm gate`가 postgres 스위트를 붙인다(`scripts/gate-plan.ts:27`).
  검증 [자동]: `rg -n "Breadcrumb|SegmentedLinks|shape=\"square\"" components app` 0 · `globals-css.test.ts` 남은 토큰마다 소비자 ≥1 · hex 대조 green.
- **T4** 문서 교정 중 값과 무관한 것(design §6.4 DESIGN 체크리스트·줄 교정, `globals.css` 주석 `#e2e8f0` 세 줄·"66곳").
  검증 [수동]: design §6.4의 DESIGN·`globals.css` 항목을 한 줄씩 코드와 대조해 전부 ✓.
  `[commit]` T1·T2·T3·T4 각각 — `refactor(tokens): …` / `docs(DESIGN): …`
- **단위 ① 끝**: [수동] 1280 전후 스크린샷(화면 목록 앞 여섯, 기준 SHA = T0 커밋) 동일 → `/push`.

## 단위 ② API 이름 — 값 변화 0, §3 축마다 커밋

- **T5** 특성 테스트(design §5.4) — Select · Input · Textarea · Radio · ListItemButton · BannerLine · EmptyRowCard · EmptyState · Badge variant 전수 · Button(size·variant·busy)의 **현재** 동작을 고정.
  검증 [자동]: 새 테스트 green · 각 파일에 뮤테이션 1회(프리미티브 클래스 한 곳을 바꾸면 red) 기록.
  `[commit] test(ui): pin current primitive contracts before the rename`
- **T6** `api-contract.test.ts`(design §5.2) — 규칙 = §3 행, 허용 목록 = 지금 위반 × 해소 태스크. green으로 시작.
  검증 [자동]: 허용 목록 항목 수 = design §3 "지금 어긋난 곳" 항목 수 · 허용 목록에서 한 줄 지우면 red(카나리아).
  `[commit] test(ui): primitive naming contract with an allowlist of current violations`
- **T7** 상태 색(S6) — `EventResult`·surface status → `StateKey` 순수 함수(테스트 먼저) · 래퍼 셋 사본 삭제 → `StatusBadge` · PanelRow `statusTone` · Badge 상태 이름 → 모양 이름(T0 결정 이름).
  뒤집는 테스트: `status-badge.test.tsx` · `a11y-reasons.test.tsx` · `logs-screen.test.ts` · `screens.test.ts:402` · canon `StateVariant` 타입 대조 테스트.
  검증 [자동]: 변환 함수 단위 테스트(키 전수) · 매핑 사본 0 스캔 · `client-graph.test.ts` 갱신 green · 허용 목록 상태 색 행 0.
- **T8** hue 개명(Y7) — `lib/tone.ts` → `lib/hue.ts`, `toneFill` → `hueFill`, `canon.ts` 주석.
  뒤집는 테스트: `project-row.test.tsx:170,174,185` · `project-thumbnail.test.tsx:4,11` · `client-graph.test.ts:414-418,464-468`(`CLIENT_LIB_FILES`).
  검증 [자동]: `rg -n "toneFill|toneOf|lib/tone" app components lib` 0 · `pnpm typecheck`.
- **T9** 크기 — Button `size="icon-xs|sm|md|lg"`(24·28·32·36) + 스피너 크기 · Alert `compact` → `size` · SkeletonLine `text=` → `size`.
  뒤집는 테스트: `sync-button` · `count-badge.test.tsx:23` · `account-card.test.tsx:35`.
  검증 [자동]: `[&_.animate-spin]:size-` 0 · 아이콘 버튼 손 크기(`size-6|size-7|size-8|size-9` + Button) 0 스캔 · 특성 테스트(T5)의 크기 행 뒤집힘.
- **T10** 폭 — 입력류 `width` prop(design §3 값 목록).
  뒤집는 테스트: `search-input.test.tsx:7` · `projects-screen.test.ts:50,75` · `entry-points.test.ts:644` · `translations-screen.test.ts:273`.
  검증 [자동]: Input·SelectTrigger·SearchInput 호출부 `className`의 `w-`·`max-w-`·`min-w-` 0 스캔.
- **T11** 진행 · 슬롯 · a11y 철자 · className 이름 · rest props(실수요 자리) · `data-tone`(tone 가진 프리미티브).
  뒤집는 테스트: `onboarding-modal.test.tsx`(`nextPending`·`headerAction`·`footer`) · `members-screen.test.ts:60-72` · `focus-ring.test.ts` 해당 행.
  검증 [자동]: 허용 목록 전 행 0(spec 완료 조건 4) · `pnpm typecheck`.
  `[commit]` T7–T11 각각 — `refactor(ui): …`
- **단위 ② 끝**: `/runtime-test`(화면 목록 전수 — 이름만 바뀌었으므로 기능 회귀 확인) → `/push`.

## 단위 ③ 통합 · 신설 — 이관 같은 커밋, 값 변화는 design §6.3 표만

각 태스크 검증 공통 [자동]: 프리미티브 렌더 테스트 + `hand-copies.test.ts` 자기 행(사본 0 · 하한 · 양성 카나리아 · 뮤테이션) + 허용 목록 자기 행 0.
각 태스크 공통 [수동]: design §6.3의 자기 행을 화면 목록에서 확인 — **표에 없는 변화 0**. 기준 SHA = 단위 ② 마지막 커밋.

- **T12** Card(C1) — 머리 슬롯 합집합(+`badge`) · `CardRows`/`CardList`. 소비자는 **export별로 센다**(design §4 Card 행).
  뒤집는 테스트: `card-head.test.ts:20-21` · `visual-system.test.ts:99,248` · `members-screen.test.ts:147-157,196-218` · `panel-card` · `card-lines` · `projects-cards` · `mcp-connected-apps` · `members-cards:360-387` · `member-row:142` · `mcp-token:148,419`.
  검증 [자동]: `rg -l "PanelCard|RowCard" app components` 0 · notice 있음/없음 두 상태 × `connected-apps-card` · `token-card` · `member-list` · `pending-invitations` 선 개수 단언. [수동] 카드 전수(Card 소비자 + 손 머리 12) 머리 선 1개.
- **T13** EmptyState `placement`(+`EmptyRowCard` 흡수) · NoMatch.
  뒤집는 테스트: `empty-state` · `screens.test.ts:120,416`.
  검증 [자동]: placement 형마다 렌더 테스트(실소비자 있는 형만) · 서버 소비자 파일에 `"use client"` 0 유지 · `pnpm build`(RSC 직렬화 — gate 안).
- **T14** LargeModal(C2) — 개명 · `WizardFooter`(showBack·onBack·next*) · `headerAction` 삭제 · `event-dialog` 치수 상수 공유 · `100svh`.
  뒤집는 테스트: `components/onboarding/modal.tsx:2`(재수출) · `onboarding-modal.test.tsx:4,223-245` · `modal-initial-focus.test.tsx:5,19,21,25` · `focus-ring.test.ts:156` · `visual-system.test.ts:249`.
  검증 [자동]: `step` 전환 → 본문 포커스·낭독 단언 유지 · 바닥 `busy` 전환 포커스 fixup(POSTMORTEM 2026-09-20·09-24). [수동] 포커스 복귀 — LargeModal 소비자 7곳 + `event-dialog`, 열고 닫은 뒤 트리거로 복귀.
- **T15** ButtonLink `external`·`newTab` · Link(인라인).
  검증 [자동]: `<a className={buttonClass…}>`·상수 우회(`FOOTER_LINK`) 0(여러 줄 JSX 포함) · 인라인 파랑 링크가 전부 `Link` · 포커스 링 스캔(`focus-ring.test.ts`) 확장.
- **T16** ListRow(C6) — 누르는 행 5 · 정적 2 · 두 줄 본문 · Button 행 2 · `ListItemButton`.
  뒤집는 테스트: `focus-ring.test.ts:10,124` · `translation-workspace-render.test.tsx:19-27,42`(`@/components/ui/list-item` mock · memo 렌더 수) · `project-row.test.tsx:198,211` · `sources-screen` · `logs-screen.test.ts:232`.
  검증 [자동]: 두 줄 본문 1·2번째 노드 단언(POSTMORTEM 2026-09-16) · 행 래퍼 id 포커스 복귀(`logs/page.tsx:151` · `logs-card.tsx:47`) 유지 · `attention-card:77` 선택자 유지.
  [수동] `key-list` 전후 렌더 측정(5,000키 픽스처, React Profiler 커밋 시간 — 기준 대비 악화 시 멈춤) · 번역 화면 행 높이.
- **T17** SelectRow(radio|checkbox · `expand` · `aside`). 검증 [자동]: 네 소비자 렌더 · radio 화살표 이동 · repo 목록 화살표 훑기에서 브랜치 로드 호출 수(선택 확정 때만) · `token-grant-fields` 역할 트리.
- **T18** Popover(Radix, Y4) — CLAUDE.md "Radix 여섯" · `focus-ring.test.ts:202-208 RADIX_FIXTURES` 갱신.
  검증 [자동]: 열린 채 토글 누름 → 닫힘 유지(재열림 0) · 바깥 클릭 시 트리거로 포커스 미복귀 · Esc 시 복귀. [수동] 번역 화면에서 열고 닫기.
- **T19** ProjectThumbnail · SearchInput(정의 둘 → 하나) · CopyButton 이동 · Skeleton(`SkeletonLine` 흡수, 기본값 T0 판정대로).
  검증 [자동]: 각 행 사본 0 · `components/onboarding/copy-button` 경로 import 0.
  `[commit]` T12–T19 프리미티브마다 하나 — `feat(ui): …` / `refactor(ui): …`
- **T20** design §6.3 남은 행(통합에 딸리지 않은 것 — token-grant-fields 역할 · 링 없는 링크 · BannerLine 선 · Facts 라벨 1곳).
  검증 [수동]: 화면 목록 × 3 뷰포트 — 바뀐 자리가 §6.3 행과 1:1.
  `[commit] fix(ui): …`
- **단위 ③ 끝**: `/runtime-test` — 픽스처 보관 프로젝트 · 오류 경계(`error.tsx` 유도) · 검색 0건(Logs·/projects·온보딩 repo·번역) · 포털은 트리거를 눌러 연다(Popover · LargeModal · event-dialog) → `/push`.

## F. 문서 · 종료

- **T21** 문서(design §6.4 나머지) — DESIGN §2.1·§6.625·§8(API 규약 표) · CLAUDE.md(UI 행 개수 · Radix 목록 · 작업 원칙 예외 한 줄) · DIRECTORY · global-search design(S9) · sr 상태 줄 glob 테스트.
  검증 [수동]: design §6.4 목록 전부 ✓ · [자동] sr 상태 줄 테스트 green(`loading.tsx` 8/8).
  `[commit]` 문서별 — `docs(DESIGN): …` · `docs(CLAUDE): …` · `docs(DIRECTORY): …` · `docs(feature): global-search follows the input width prop`
- **T22** 기능 종료 — 결론을 정본으로 올렸는지 확인하고 디렉터리 삭제.
  검증 [자동]: `pnpm gate` green · `test ! -d docs/features/component-unify`.
  `[commit] docs: close component-unify`

## 후속

- `/guide-shots`(모양이 바뀐 컷 — `pnpm guide:check` 출력 기준).
- 보관 표시 모양(C3) — 제품 판정 후 별도 기능.
