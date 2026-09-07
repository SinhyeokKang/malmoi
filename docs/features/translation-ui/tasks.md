# translation-ui — 태스크

> 순서는 **순수 함수 → 껍데기 → UI**다. 커밋 경계는 `——`. 각 태스크에 검증 한 줄. 🔒는 착수 전 사용자 결정(design §11).
> `/tdd interface`가 T1·T2의 "검증:" 줄을 테스트로 먹고, `/implement`가 나머지를 받는다.
>
> **2026-09-08 `/feature-review`로 단계가 둘로 갈렸다** (design §11 #6). **6a**(이 문서의 T1~T9)가 SAAS §8 6단계의 완료
> 게이트를 전부 닫는다 — 번역 화면·Publish·셸·프리미티브·i18n 기반. **6b**(맨 아래 절)는 6a 머지 뒤 별도 `/push→/merge`
> 사이클이다 — 어댑터 오류 코드화+재측정 · 설정의 base 필드 · 멤버 화면 · `/account`. **6a는 `lib/adapters/**`를 한 줄도
> 건드리지 않는다** — 재측정 없이 나간다.

## T0. 결정 — 닫혔다 (2026-09-07 design §11 #1~5, 2026-09-08 #6~#14)

- [x] base branch·기준 로케일 변경 필드 — **둘 다 넣는다** → **6b**
- [x] 어댑터 오류 문구 — **코드로 리팩터** → **6b** (재측정 포함)
- [x] 멤버 화면 이메일 — 전원 마스킹 → 6b
- [x] `sonner`·`tw-animate-css`·`components.json` — 마지막 chore에서 사용 0이면 제거
- [x] 모노 폰트 — 시스템 스택 유지
- [x] 6a/6b 분할 · 사전은 `messages/en.tsx` · 스캐너는 축소형 허용 목록 · 미배포 집계는 Prisma `count` · 로그인 장식은 토큰만 ·
      Publish는 편집자 어휘 · 배너 문구·닫기 키 재정의 · 프리미티브 16(DESIGN §6.4 variant) · 기본 착지는 pending>0인 첫 ns

⚠️ **`docs/DESIGN.md`는 6a의 목표 상태를 현재형으로 적고 있다** (§3.1 "shadcn 생성물 삭제됐다" · §6.4 · §7 "focus-ring이 `ui/` 밖
raw 태그 0 고정"). 실물은 T5 전까지 그와 다르다(`components/ui/` 4파일 + `dark:` 9곳 + 테스트는 `ui/` 제외). **T5 커밋 전까지
`/doc-check`의 DESIGN 불일치는 의도된 상태다** — 두 번 고치지 않는다. T5 검증이 그 서술을 실물과 맞춘다.

`lib/push/guard.ts`의 `checkFormat`(3필드 — adapter·pathTemplate·baseLocale)과 `disconnectGithub()`(`app/(edit)/projects/actions.ts`)는
**커밋돼 있다**(`ab44ec8`). 6a는 둘 다 건드리지 않는다.

## T1. i18n 기반 — 사전 하나 + 스캐너 (순수)

- [ ] `messages/en.tsx` — `export const en = { common, signIn, projects, newProject, translations, settings, invite, errors } as const`.
      **값은 문자열 또는 함수다**: 카운터 `keys: (n: number) => n === 1 ? "1 key" : \`${n} keys\`` · 쪼개진 문장 `saveAs: (path: ReactNode) => <>Save this in your repository as {path}.</>`.
      `fmt`·`plural`·`rich`·`resolveJsonModule`·JSON resolver는 **없다** (design §3.1.1)
      검증: `pnpm typecheck` · `lib/i18n/__tests__/dictionary.test.ts` — 함수 값 셋(카운터 0·1·2, 노드 삽입 참조 동일성)
- [ ] `lib/i18n/index.ts` — `export { en as m } from "@/messages/en"` + `export type Messages = typeof en`. **`@/lib/**` import 0** (잎)
      검증: `client-graph.test.ts` — **클라이언트 픽스처가 `@/lib/i18n`을 import했을 때** green (T1 시점엔 실 소비자가 없어 공허하므로
      메타 테스트에 픽스처를 하나 둔다)
- [ ] `components/__tests__/client-graph.test.ts` — `ALLOWED`에 `radix-ui`·`class-variance-authority`·`lucide-react` 추가 (**의도된 결정** —
      그 파일 주석이 요구하는 "여기서 한 번"이다, design §9)
      검증: 메타 테스트가 셋 중 하나를 빼면 red
- [ ] `lib/i18n/__tests__/no-korean-ui.test.ts` — **축소형 허용 목록**. `app/`·`components/`·`lib/`(`__tests__`·`lib/survey`·`lib/scan`·
      **`lib/adapters` 제외 — 6b**)의 `.ts`·`.tsx`에서 주석(`//`·`/* */`·`{/* */}`)을 벗긴 뒤 `[가-힣]`를 센다. 단언 둘: **목록 밖 파일은 0자** ·
      **목록의 파일마다 ≥1자**(낡은 항목 금지). 초기 목록 = 지금 한글이 있는 파일 전부. UI 커밋마다 자기 파일을 뺀다 → T8 끝에 빈다.
      메타 테스트: 주석 종류 셋을 하나씩 먹여 벗기는지 + 코드 안 한글 리터럴을 잡는지
      검증: 지금 코드베이스에서 **green**(목록이 정확히 현재 상태) · 목록에 없는 파일에 한글 한 자를 픽스처로 넣으면 red

—— `feat(i18n): en dictionary as a leaf module, shrinking allowlist scanner`

## T2. 판정 함수 — 번역 화면·Publish·상태 (순수)

- [ ] `lib/keys/view.ts` — `defaultNamespace(counts, focus)`(focus 로케일 기준 pending>0인 첫 ns → 없으면 `compareKeys` 첫 ns → 비면 `null`) ·
      `resolveNamespace(param, counts, focus)`(`"*"`=all, 없는 이름→default) · `filterRows(rows, {q, state, locale})` · `isUnpublished(cell, lastPulledAt)`.
      ⚠️ `compareKeys`는 `lib/adapters/shared`에서 온다 — **view.ts는 잎이 아니다.** 클라이언트가 이 함수들을 값으로 읽지 않는다(서버 렌더 필터)
      검증: `lib/keys/__tests__/view.test.ts` 확장 — 빈 목록·`*`·낡은 이름·대소문자·상태 필터·`lastPulledAt null`·**orphaned만 있는 ns를 default가 건너뛴다**·
      `?ns` 유효+`?q` 0행·pending 전부 0이면 첫 ns
- [ ] `lib/pull/run.ts` — `PullResult.committed`에 `pr: "created" | "updated"`. `existing === null ? "created" : "updated"` 한 줄 인라인 (`run.ts:158`,
      `GitClient.findOpenPrUrl` 결과)
      검증: `lib/pull/__tests__/run.test.ts`가 두 갈래를 각자 단언 (기존 PR mock 있음/없음)
- [ ] `lib/pull/message.ts` — **문구 다섯·tone 넷**(`info|success|warning|danger`, success 둘) · 문구는 `m`에서 · **편집자 어휘 유지**(기존 어휘 금지
      테스트 `message.test.ts:52,59` 그대로) · warnings ≥1이면 `skipped`여도 `warning`
      검증: `message.test.ts` — 다섯 갈래 문구가 서로 다르다 · tone 매핑 표 · warnings≥1 → `warning`(committed·skipped 둘 다) · exhaustive · 어휘 금지 green
- [ ] `lib/routes.ts` — `routes.projects()`·`.newProject()`·`.translations(slug, {ns,focus,q,state})`·`.settings(slug)`·`.invite(token)`. **잎**
      검증: `lib/__tests__/routes.test.ts` — 쿼리 undefined 제거·`*` 인코딩. `entry-points.test.ts` "죽은 라우트 링크"가 이 파일도 읽고, **`${…}`
      템플릿을 `shape()`("쿼리 파라미터의 수신자"의 정규화)로 접어 동적 경로도 대조한다**(지금은 `STATIC_PATH`가 정적만 잡는다 — 2026-09-05 사고는 동적이었다)
      + 그 확장을 고정하는 단언

—— `feat(pull): distinguish created vs updated PR in PullResult` · `feat(keys): namespace landing, row filter, unpublished predicate` · `feat(routes): single source for route links`

## T3. 스키마 — additive 둘 + push `updatedBy` + 조회

- [ ] `prisma/schema.prisma` — `Project.lastPublishedAt DateTime?`·`lastPrUrl String?` (주석은 design §5 문장)
      검증: `/db`가 `--create-only`로 SQL 생성 → 눈으로 확인 → dev 적용 → `pnpm db:status` up to date
- [ ] `lib/pull/load.ts` `saveLastPulledAt` — `committed`일 때 둘을 함께 쓴다(같은 `update`), `skipped`는 `lastPulledAt`만
      검증: **신설** `lib/pull/__tests__/load.test.ts` — Prisma mock의 `update` 인자 캡처 (committed/skipped 둘)
- [ ] `lib/push/apply.ts` — 번역 upsert `ON CONFLICT … DO UPDATE SET … "updatedBy" = NULL`
      검증: `lib/push/__tests__/flow.test.ts`(SQL 캡처)가 그 문자열을 고정. `app/(edit)/__tests__/authorization.test.ts:222-226`은 저장 경로라 그대로 green
- [ ] `lib/keys/query.ts` — `countUnpublished(prisma, projectId, lastPulledAt)` = `prisma.translation.count({ where: { projectId, updatedBy: { not: null },
      updatedAt: { gt: lastPulledAt } } })` (null이면 `gt` 생략) · `loadKeys`의 select에 `updatedAt` 추가(셀 점 표시용)
      검증: 하네스 `app/(edit)/__tests__/harness.ts`에 `translation.count` 추가 + **시드에 프로젝트 둘** — 다른 프로젝트 행을 세지 않는다 · `lastPulledAt null`
- [ ] `app/(edit)/layout.tsx`용 `loadMemberships(prisma, userId)` — `{slug, name, role}[]`. **새 조회다**(지금 레이아웃은 Prisma를 안 부른다) — `userId` 스코프
      검증: 하네스 — 다른 사용자의 멤버십을 내지 않는다 (POSTMORTEM 2026-09-06)

—— `feat(db): record last publish on Project` (스키마+마이그레이션 **만** — `/db` 6단계 규칙) · `feat(pull,push,keys): persist last publish, push clears updatedBy, unpublished count`

## T4. 문구 모듈·진단 문구 — 사전 읽기로 전환

- [ ] `lib/auth/message.ts`·`lib/github-connect/message.ts`·`lib/onboarding/message.ts`(+`ingestHeadline`)·`lib/onboarding/readiness.ts`(`readinessLabel`)·
      `lib/onboarding/detect.ts`(`formatLabel`) — `satisfies Record<Union,string>`. `lib/pull/message.ts`는 T2
      검증: 문구 모듈 테스트 **33줄**(auth 16·onboarding 11·pull 4·github-connect 2)을 영어 기대값으로 갱신해 green · 갈래 하나를 사전에서 지우면 typecheck red(한 번 확인하고 되돌린다) ·
      `credential-separation.test.ts` green(`lib/onboarding`이 `@/lib/i18n`을 읽는 것은 허용 방향)
- [ ] 진단 문구 영어화 — `lib/pull/**`·`lib/push/**`·`lib/github.ts`·`lib/auth/profile.ts`·`lib/env.ts`·`lib/github-connect/state.ts`의 `fail()`/`throw` (사전 밖, design §3.1.4).
      ⚠️ **`lib/pull/run.ts:127`의 warnings 조립(`${path}: ${message}`)은 어댑터 `message`를 그대로 실으므로 6a에서는 한글이 남는다** — `no-korean-ui` 목록에
      `run.ts`가 남고 6b가 뺀다
      검증: `lib/__tests__/failure.test.ts`가 `safe` 메시지 예시를 영어로 갱신 · `render.test.ts` 9줄·`run.test.ts` 5줄의 한글 단언 갱신 · 스캔 목록에서 이 파일들 제거
- [ ] `lib/onboarding/workflow.ts` YAML 주석 영어화 + `docs/ACTIONS.md` 같은 커밋
      검증: `workflow*.test.ts`(ACTIONS.md 줄 대조) green
- [ ] `app/layout.tsx` — `lang="en"`, `metadata` 영어
      검증: 소스에 `lang="en"` · `no-korean-ui` 목록에서 제거

—— `refactor(i18n): message modules read the dictionary; diagnostics in English` · `docs(ACTIONS): workflow comments in English`

## T5. 프리미티브 — `components/ui/`

- [ ] shadcn 생성물 4개 삭제 → **16개**: `Button`(cva `primary·default·danger·ghost·link` × `md`(`h-8`)·`sm`(`h-7`), `loading` 라벨 교체) · `Input` ·
      `Textarea` · `Select`(native) · `Radio` · `FormGroup` · `Badge` · `Alert` · `Card` · `Table` · `Breadcrumb` · `Avatar` · `EmptyState` · `DropdownMenu` ·
      `Dialog` · `Tooltip` — 치수·색은 DESIGN §6.4 **그대로**(정본). `Checkbox`·`Skeleton`은 없다(사용처 0)
      검증: `pnpm typecheck` · 각 파일의 네 태그가 포커스 링 **셋**을 든다(`ring-offset-1`은 사이드바 항목·칩 옆 버튼에만 — DESIGN §7) · `dark:` 0곳 ·
      **DESIGN §3.1·§6.4·§7의 서술이 이 커밋부터 실물과 일치한다**(`/doc-check`)
- [ ] `app/globals.css` — **토큰 값 변경 없음**
      검증: `git diff app/globals.css`가 비어 있다 · `globals-css.test.ts` green
- [ ] `components/__tests__/focus-ring.test.ts` — `ui/` 제외 해제 + **"raw 태그 허용 파일 목록"**(축소형 — 초기값은 지금 raw 태그를 쓰는 파일 전부, UI 커밋마다 뺀다,
      목록의 파일은 raw 태그 ≥1이어야 한다) + 메타 테스트(태그 넷을 하나씩)
      검증: 이 시점에 **green**(목록이 현재 상태) · 목록 밖에 raw 태그 하나를 픽스처로 넣으면 red
- [ ] `lib/utils.ts` — twMerge `text-mono` 등록 변경 없음
      검증: `git diff lib/utils.ts` 비어 있음

—— `feat(ui): owned primitives on existing tokens` (ui/ + focus-ring 테스트)

## T6. 셸·전역 화면 — 로그인 · 목록 (라우트별 커밋)

- [ ] `app/(edit)/layout.tsx` — `loadMemberships(userId)` → `<Sidebar memberships>` + top bar(사용자 메뉴만). `redirect()` 둘 유지(2차 방어). **breadcrumb은 페이지
      콘텐츠 첫 줄**이다(레이아웃이 페이지 props를 못 받는다 — design §2)
      검증: `entry-points.test.ts` "차단 규칙" green · 소스에 `redirect(` 둘
- [ ] `components/shell/sidebar.tsx`(client — `usePathname`·프로젝트 컨텍스트·역할별 항목·collapse `localStorage`) · `top-bar.tsx` · `user-menu.tsx`.
      6a 섹션은 **Translations · Settings(OWNER)** 둘 — Members·Account는 6b
      검증: `client-graph.test.ts` green · EDITOR 세션으로 Settings가 렌더되지 않는다(실물) · 접힌 상태에서 항목에 `aria-label`(소스)
- [ ] `app/page.tsx` — 2열 로그인(design §3.12 — 장식은 `--border` dot-grid + `from-primary/5 to-muted`, **raw 색 0**), `?error=` Alert, 장애 문구
      검증: `focus-ring` 목록에서 제거 · `no-korean-ui` 목록에서 제거 · 소스에 `violet|purple` 0
- [ ] `app/(edit)/projects/page.tsx` — 행 구조 + EmptyState + `?e=` **global** Alert(두 union). GitHub 계정 섹션은 **그대로 둔다**(6b가 `/account`를 판정한다)
      검증: 두 목록에서 제거 · "쿼리 파라미터의 수신자" green

—— `feat(shell): sidebar and top bar` · `feat(sign-in): two-column sign-in on primitives` · `feat(projects): project list on primitives`

## T7. 번역 화면 + Publish

- [ ] `app/(edit)/projects/[slug]/translations/page.tsx` — `resolveNamespace` 기본 착지(pending>0 첫 ns) · 네임스페이스 패널("All keys" 행에도 `pending/total`) ·
      breadcrumb · 툴바(필터 `?q=`·`?state=`·Last sent 링크) · 표(`Table` + `Textarea`) · 배지 · orphaned 열 배지 · `countUnpublished` · **표 하나에 시각 숨김
      `aria-live="polite"` 영역 하나** · 빈 상태 넷(준비 전·로케일 없음·필터 0·**키 없음**)
      검증: 실물 903키 프로젝트 첫 착지 **< 2초**(같은 프로젝트·같은 머신·DevTools Performance의 LCP — 기준선 12.7초를 같은 방법으로 다시 잰다) · `?ns=*`로 전체 ·
      `lib/keys/__tests__/actor.test.ts:87-97` 소스 스캔 green(`loadActors(`·`CellMeta` 배선 — 이름이 바뀌면 스캔 갱신) · 두 목록에서 제거
- [ ] `components/translation-input.tsx` — `Textarea`(Enter=저장·Shift+Enter=개행·Esc=되돌리기) · 셀 안 상태줄은 **시각 전용** · 실패 시 **`document.activeElement`가
      `body`이거나 같은 셀일 때만** `focus()`, 아니면 상태줄 [Retry] · "Saved" 1.5초 뒤 소거 · `unauthorized` → "Your session ended — sign in again. Your text is kept." +
      로그인 링크 · `unavailable` → "Temporary problem — try again" · 문구 `m`
      검증: 소스에 `activeElement`·`Retry` · 실물에서 저장 실패 유발(오프라인) 후 다른 셀 타이핑 중이면 포커스가 안 뺏긴다 · 표의 live region이 결과를 읽는다(VoiceOver)
- [ ] `components/publish-button.tsx`(옛 `pull-button` 대체) — `Send changes ({n})` · 결과 `Alert` 다섯 문구/네 tone · warning 본문 `<details>`에 못 쓴 파일 목록 ·
      성공 후 `router.refresh()` · Alert는 readiness 분기 밖 · **결과 Alert 위·배너 아래** 고정
      검증: `pullMessage` 다섯 갈래→Alert variant 표를 소스에서 센다(단위) · 실물에서 연속 두 번 눌러 둘째가 "Nothing to send"
- [ ] 편집 손실 배너 — `Alert warning` "{n} changes not yet sent. They can be lost if your developers push code first — send them when you're done." ·
      복수 `one/other` · 닫기 키 = `lastPulledAt`(`sessionStorage` — 다음 Publish 뒤 다시 보인다) · SSR에서 닫힘 상태를 모르므로 **클라이언트 마운트 뒤에만 렌더**
      검증: 미배포 0이면 DOM에 없다(실물) · 닫은 뒤 Publish하고 편집하면 다시 보인다(실물)
- [ ] `components/invite-form.tsx`는 **6a에서 그대로 둔다**(멤버 화면이 6b) — 번역 화면 헤더에서 툴바 오른쪽 `ghost` 버튼 → `Dialog`로 옮긴다
      검증: OWNER만 렌더(소스) · 두 목록에서 제거

—— `feat(translations): namespace landing, filters, publish states, edit-loss banner`

## T8. 설정 · 새 프로젝트 · 초대 수락 (라우트별 커밋)

- [ ] `app/(edit)/projects/[slug]/settings/page.tsx` — settings-block 넷(리포 연결·상태·push 토큰·워크플로) + 계정 섹션 **그대로**. `FirstIngestRetry`는 분기 밖 유지.
      base 필드는 **6b**
      검증: 두 목록에서 제거 · `revalidatePath` 호출 컴포넌트가 분기 밖(소스) · 실물 [다시 시도] 결과 문구가 남는다
- [ ] `app/(edit)/projects/new/page.tsx` + `components/onboarding/*` — 상태 기계 그대로, `FormGroup`·`Card`·`Radio`·`EmptyState`로 · 부분 실패 목록 "Could not read {path}" +
      `<details>` 원문(어댑터 `message` — 6a에선 한국어 원문이 `<details>` 안에 남는다, 6b가 코드화) · 쪼개진 문장 **7곳**(`new-project-flow` 399·447-452·485-486 ·
      `projects/new/page` 100 · `push-token-panel` 26-27 · `workflow-block` 18·24-25)을 사전 함수 값으로
      검증: `client-graph.test.ts` green(어댑터 라벨은 여전히 서버가 내려준다) · 실물 ②~⑥ 한 바퀴(폐기용 리포) · 두 목록에서 제거
- [ ] `app/invite/[token]/page.tsx` — 셸 밖 카드, 분기별 Alert, provider 버튼은 `Button default`
      검증: 두 목록에서 제거 · `entry-points.test.ts` 예외 목록 그대로 green
- [ ] 이 시점에 **두 허용 목록이 빈다** (`no-korean-ui`는 `lib/pull/run.ts`·`lib/pull/render.ts`·`lib/adapters/**` 제외 — 6b)
      검증: `pnpm test` 전체 green · `pnpm build` · `find .next/static/chunks -name '*.js' -size +1M` 출력이 비어 있다

—— `feat(settings): settings blocks on primitives` · `feat(onboarding): new-project flow on primitives` · `feat(invite): accept page on primitives`

## T9. 문서·정리·검증

- [ ] `docs/SAAS.md` §8 6단계 체크(6a 항목) + **6b 항목을 같은 절에 미체크로** + §8 1단계 "UI 레퍼런스 — Supabase" 줄을 GitLab으로 + §10에 ko 미결 한 줄
      검증: `/doc-check` SAAS 에이전트 이슈 0
- [ ] `docs/ARCHITECTURE.md` — §6.35에 `lib/i18n`·`lib/routes` 잎 추가 · 새 절 "UI 문자열 경계"(design §3.1.4) · `updatedBy` 의미(push가 비운다) · `lastPulledAt` vs
      `lastPublishedAt`의 의미 차이(design §3.5)
      검증: `/doc-check`
- [ ] `docs/features/README.md` — translation-ui 행(6a 완료·6b 대기) · `translation-input` a11y 항목 닫음 · "디렉터리만 없다" 정정
- [ ] `CLAUDE.md` — 디렉터리 구조(`messages/`·`lib/i18n/`·`lib/routes.ts`·`components/ui/` 소유·`components/shell/`) · "가상화하지 않는다" 절에 착지 실측 추가 ·
      `focus-ring`·`client-graph` 서술(허용 목록 셋)
- [ ] `README.md` 요약 미러
- [ ] chore — `sonner`·`tw-animate-css` 사용 0이면 제거, `components.json` 판정
      검증: `pnpm build` green · `git grep sonner` 0
- [ ] `/bugshot-qa` 한 바퀴 — user-stories §1·§2·§3·§4·§6·§8 순서 + EDITOR의 settings URL 직접 진입(`not-found`) + 저장 실패 포커스(다른 셀 타이핑 중) +
      Publish 다섯 갈래 중 넷(**실패는 App 설치의 선택 목록에서 폐기용 리포를 빼서** 유발 — base 브랜치를 못 읽는다; push 토큰은 pull과 무관) + 첫 착지 <2초 +
      배너 부재/재등장 + EDITOR 사이드바 + VoiceOver 한 번
      검증: 이슈 0건 또는 전부 닫힘
- [ ] `/db` → `/push` → `/merge`(`db:deploy` 1단계)

—— 문서별 커밋(`docs(SAAS): …`·`docs(ARCHITECTURE): …`·`docs(CLAUDE): …`·`docs(feature): …`) · `chore: drop unused ui deps`

## 검증이 원리적으로 못 보는 것 — 실물로만

| 결함 부류 | 어느 게이트도 못 본다 | 실물 확인 |
|---|---|---|
| 첫 착지 시간 | 렌더 시간은 테스트에 없다 | 903키 프로젝트 DevTools Performance LCP (기준선 재측정 포함) |
| 포커스 복귀 조건·`aria-live` 읽힘 | 소스 스캔은 속성 존재만 본다 | 키보드 + VoiceOver 한 번, 다른 셀 타이핑 중 실패 |
| Alert가 revalidate에 씻기지 않는가 | 언마운트 타이밍 | Publish 뒤 Alert가 남아 있는가 |
| 사이드바 역할별 노출 | 렌더 테스트 없음 | EDITOR 세션 |
| 색 대비 실물 | 토큰은 그대로지만 사이드바가 muted 표면이 되어 §2.2 자리가 늘었다 | 사이드바 비활성 항목·표 헤더·칩 |

---

# 6b — 6a 머지 뒤 별도 사이클 (2026-09-08 분할)

**착수 전 design을 다시 연다** — `/feature-review`가 잡은 결함이 아래에 있고, 그 답이 6b의 설계다. 여기서는 태스크 뼈대와 지적만 남긴다.

## 6b-1. 어댑터 오류 코드화 + survey 분류기 + 재측정 (첫 사이클)

- `lib/adapters/types.ts` — `AdapterErrorCode` union + `AdapterError = { path, code, key?, detail? }`. **`key?`가 필요하다** — 기존 어댑터 테스트 12건 중 6건이 보간된
  키 이름(`"a.deep"`·`"fr"`·`"grp"`)을 단언한다. 코드화 대상은 **34곳**(어댑터 33 + `lib/pull/render.ts:72` `missingOriginal`) — 나머지 5는 `new Error`(`json-style.ts` 4·`index.ts` 1)라 대상이 아니다
- `.message` 소비자 **여덟**을 전부 옮긴다: `new-project-flow.tsx` · `first-ingest-retry.tsx:67` · `app/(edit)/projects/actions.ts:632·740` · **`lib/pull/run.ts:127`**(warnings 조립 — 서버 측에서
  `adapterErrorMessage(code)`를 부른다) · `scripts/ingest.ts:164` · `scripts/push-local.ts:140` · `lib/adapters/__tests__/contract.ts:266` · `lib/survey/one.ts:168-199`(`classify`)
- `lib/i18n/adapter-errors.ts` — `satisfies Record<AdapterErrorCode,string>` (사전 `en.tsx`의 `adapterErrors`)
- `lib/survey/one.ts` `classify(code)` — **단위 테스트가 0건이라** "기존 픽스처 결과 동일"은 검증 대상이 없다. 재측정만이 답한다. `one.ts:177`이 "default export 없음"을 일부러
  `other`로 보내는 것을 그대로 옮긴다
- 어댑터 테스트 ~85줄(yaml 29·code-dict 25·ts-dict 14·json-style 5·contract 4·quote-style 4…)의 한글 단언 갱신. **출력 바이트 단언은 한 줄도 안 바뀐다**
- **재측정** — `pnpm adapter-survey docs/features/adapter-generality/repos.txt --verdicts docs/features/adapter-generality/verdicts.json --out .scratch/r14.json` + 홀드아웃(`repos-heldout.txt`·
  `verdicts-heldout.json`) → ADAPTER-COVERAGE **§20**(14차; §18이 13차, §19는 회차 아님). 비교할 값: 탐지 100/101 · 오탐 0/100 · 왕복 의미 99/100 · 바이트 고정점 100/100 ·
  목표 초과 12/99 · clean 초과 1/38 · surgicalEditHunks 20/29 · yaml 중앙값/초과 · 홀드아웃 16/16·3/15. **하나라도 다르면 머지하지 않는다**
- `/l10n-roundtrip`은 돌리지 않는다 — `contract`·`write-contract`·`key-order-golden` + 바이트 고정점 100/100이 바이트 층을 덮고 `write`의 `content`를 안 건드린다
- `no-korean-ui` 목록에서 `lib/adapters/**`·`lib/pull/run.ts`·`lib/pull/render.ts` 제외를 푼다

## 6b-2. 설정 — base branch·기준 로케일 (🔴 design §3.13을 다시 쓴다)

- **지금 설계대로면 pull이 깨진 파일을 낸다.** push·pull의 base 진실은 `Project.baseLocale`(`lib/pull/load.ts:30`·`run.ts:85`·`render.ts:115`)이고 `Locale.isBase`는 편집 UI만
  읽는다(`lib/keys/query.ts:42`). UI가 저장하면 CI push는 409로 막히지만 **야간 pull은 막히지 않아** `value ?? sourceText`(`plan.ts:174`) 폴백으로 옛 base 원문이 새 base 파일에 실린 PR이 나간다
- **재적재 경로는 CI 하나뿐이다** — `runFirstIngest`는 ready에서 `not-awaiting`(`actions.ts:676`). "[Run first import]와 같은 경로"는 거짓
- 살아남는 키 전부 `sourceHash`가 바뀌어 **`needsReview` 일괄 전파 + `updatedAt` 일괄 상승**(`plan.ts:178`·`apply.ts:170`) — 편집자에게 "전 셀 검토 필요"로 보인다. 받아들이는 대가로 적는다
- 답의 후보(CTO): `Project.baseLocale`만 "선언"으로 바꾸고 `Locale.isBase`는 push 소유로 둔다 → `isBase ≠ baseLocale`이 "재적재 대기" 신호가 되어 **pull이 `skipped: base-change-pending`으로
  멈추고** UI 배너가 같은 조건을 읽는다. 트랜잭션 스왑·`planBaseLocaleChange`의 절반이 사라진다
- `isValidBranchName`(`lib/pull/branch-name.ts` 잎) · `checkFormat`은 3필드(adapter·pathTemplate·baseLocale) 비교 · 하네스 `locale`에 `findMany`·`updateMany` 필요 · isBase 단일성은 스키마 제약이 아니다(`@@id([projectId, code])`뿐)
- 실물: 폐기용 리포에서 옛 `base-locale`로 CI를 한 번 돌려 409를 본다 — 어느 스킬에도 없는 확인이라 별도 줄

## 6b-3. 멤버 화면

- **라우트 신설 근거를 먼저 적는다** — `github-connect/spec.md:45,127`은 "`/settings` 페이지에 섹션"으로 결정했다. 별도 라우트의 실제 이유(EDITOR가 목록을 봐야 하는데 `/settings`는
  `project:settings` 뒤)를 spec §2.3에 쓰고 그쪽을 stale로 표시한다
- **Members는 전원에게 렌더**(EDITOR도 목록을 본다 — user-stories §5 스토리와 §0 "OWNER만"이 모순이었다). Settings만 OWNER
- `revokeInvitation`은 **`deleteMany`가 아니라 `updateMany({ where: { id, projectId, acceptedAt: null }, data: { expiresAt: now } })`** — `prisma/schema.prisma:365`가 삭제를 금지하고
  기존 관용구가 `expiresAt = now`(`createInvitation`, `actions.ts:132`)다. `loadPendingInvitations`의 `expiresAt > now()` 술어가 그대로 맞는다. 모델명은 `ProjectInvitation`
- 대기 초대 0건 빈 상태 · `?e=` global Alert 슬롯 · 역할 변경은 native `Select`(DropdownMenu 아님) · `components/invite-form.tsx` 삭제는 이 커밋에서
- 검증: `app/(edit)/__tests__/membership.test.ts` — 다른 프로젝트의 초대 id는 0행 · EDITOR `forbidden` · 마지막 OWNER 문구 · 이미 수락된 초대는 건드리지 않는다

## 6b-4. `/account` — 만들지 말지부터

- SAAS §8 6단계 3번이 이미 `[x]`이고 착지처가 `/projects`다(계정 섹션이 거기 있다). 라우트 하나에 matcher·`StateDest` 갈래(배포 직후 10분 옛 쿠키 창)·`entry-points`·사이드바 항목이 따라온다.
  **추천: 만들지 않는다** — 사용자 메뉴에 "GitHub account" 항목으로 `/projects#github`. 만들면 `landing`은 `app/api/github/callback/route.ts:177`의 지역 함수(request 인자)라 잎으로
  내리는 작업이 신설로 붙고, `startGithubConnectForUser`는 **무인자**라 `dest` 인자 추가는 시그니처 변경(`onboarding.test.ts` 호출부 갱신)이다
