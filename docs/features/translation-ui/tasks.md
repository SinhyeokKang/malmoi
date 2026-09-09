# translation-ui — 태스크

> 순서는 **순수 함수 → 껍데기 → UI**다. 커밋 경계는 `——`. 각 태스크에 검증 한 줄. 🔒는 착수 전 사용자 결정(design §11).
> `/tdd interface`가 T1·T2의 "검증:" 줄을 테스트로 먹고, `/implement`가 나머지를 받는다.
>
> **2026-09-08 `/feature-review`로 단계가 둘로 갈렸다** (design §11 #6). **6a**(이 문서의 T1~T9)가 SAAS §8 6단계의 완료
> 게이트를 전부 닫는다 — 번역 화면·Publish·셸·프리미티브·i18n 기반. **6b**(맨 아래 절)는 6a 머지 뒤 별도 `/push→/merge`
> 사이클이다 — 어댑터 오류 코드화+재측정 · 설정의 base 필드 · 멤버 화면 · `/account`. **6a는 `lib/adapters/**`를 한 줄도
> 건드리지 않는다** — 재측정 없이 나간다.

## 배송 단위 — 6a를 **4번의 `/push`→`/merge`** 로 쪼갠다 (2026-09-08)

**6a 전체를 한 번에 프로덕션에 보내지 않는다.** T1~T9는 커밋 15개 · 화면 8개 재작성이고, 그걸 한 PR로 묶으면
(a) `/merge`의 PR CI가 red일 때 무엇이 깼는지 특정하는 비용이 커지고 (b) 되돌리는 유일한 수단이 "다음 배포"라
(브랜치 정책) 롤백 면적이 화면 전부가 된다. **아래 넷은 각자 그 자체로 동작하는 상태다** — 어느 지점에서 멈춰도
프로덕션이 성립한다.

| Ship | 태스크 | 무엇이 나가나 | 사용자 눈에 보이는 변화 | 게이트 (`/push` 로컬 게이트에 더해) |
|---|---|---|---|---|
| **1. 기반** ✅ | T1 · T2 · T3 · T4 · T5 (2026-09-08 — T4가 앞당겨졌다) | 사전 · 순수 판정 · 스키마 둘 · 프리미티브 16 | **거의 없다** — 프리미티브는 소비자 0곳, Publish 결과 문구만 영어로 바뀐다 | `/db`(T3 마이그레이션) · `find .next/static/chunks -name '*.js' -size +1M` 빈 출력 |
| **2. 셸** ✅ | T6 (T4는 ship 1이 가져갔다) | 문구 모듈 영어화 · 사이드바·top bar · 로그인 · 목록 | **크다** — 셸이 처음 선다. 번역·설정 화면은 아직 옛 마크업(토큰이 같아 안 깨진다) | 실물: EDITOR 세션 사이드바 항목 · 접힌 레일 · `?e=` Alert · 로그인 2열 |
| **3. 번역 화면** ✅ | T7 (2026-09-08 — dev) | 네임스페이스 착지 · 필터 · Publish · 편집 손실 배너 | **6단계의 값 전부** | 실물: 903키 첫 착지 **< 2초**(LCP, 기준선 12.7초와 같은 방법) · Publish 다섯 갈래 · 저장 실패 포커스 |
| **4. 나머지 + 정리** ✅ | T8 · T9 (2026-09-08 — prod `695e441`) | 설정 · 새 프로젝트 · 초대 수락 · 문서 · chore | 마지막 세 화면 | **두 허용 목록이 빈다** · `/bugshot-qa` 한 바퀴 · `/doc-check` |

- **순서는 고정이다** — T5(프리미티브)가 T6~T8보다 앞서야 하고 T1(사전)이 T4보다 앞서야 한다. Ship 1이 그 둘을
  한꺼번에 앞으로 뺀 것이고, 그래서 **가장 크지만 가장 안 보이는** 배송이다.
- **문서는 각 ship이 자기 몫만 든다** — `/push` 4단계가 그 diff에 걸린 문서를 트라이아지한다. 전수 대조(T9의
  `/doc-check`)는 ship 4다. ⚠️ **DESIGN §3.1·§6.4·§7의 목표 상태 서술은 ship 1(T5)에서 실물과 맞는다** — 그 전까지
  `/doc-check` DESIGN 불일치는 의도된 상태다(아래 T0 ⚠️).
- **`/bugshot-qa`는 ship 4에 한 번**이다. ship 2·3은 위 표의 "실물" 줄만 손으로 확인한다 — 화면이 절반만 새것인
  상태에 QA 한 바퀴를 태우면 "옛 마크업이라 그렇다"가 이슈의 절반이 된다.
- **6b는 6a 넷이 다 나간 뒤 별도 사이클 셋**이다 (맨 아래 절): 6b-1(어댑터 오류 코드화 + 재측정 — **2026-09-08
  닫혔다**) · 6b-2(멤버 화면 — **2026-09-09 닫혔다**) · 6b-3(base 변경 — **design을 다시 써야 착수할 수 있다**). 6b-4(`/account`)는
  **만들지 않는 쪽이 추천**이라 배송이 아니라 판정이다. ⚠️ **번호가 실행 순서다** — 2026-09-08에 뒤의 둘을
  맞바꿨다(그 절 머리에 이유가 있다).

## T0. 결정 — 닫혔다 (2026-09-07 design §11 #1~5, 2026-09-08 #6~#14)

- [x] base branch·기준 로케일 변경 필드 — **둘 다 넣는다** → **6b**
- [x] 어댑터 오류 문구 — **코드로 리팩터** → **6b-1에서 닫혔다** (2026-09-08, 14차 재측정 포함 — ADAPTER-COVERAGE §20)
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

- [x] `messages/en.tsx` — `export const en = { common, signIn, projects, newProject, translations, settings, invite, errors } as const`.
      **값은 문자열 또는 함수다**: 카운터 `keys: (n: number) => n === 1 ? "1 key" : \`${n} keys\`` · 쪼개진 문장 `saveAs: (path: ReactNode) => <>Save this in your repository as {path}.</>`.
      `fmt`·`plural`·`rich`·`resolveJsonModule`·JSON resolver는 **없다** (design §3.1.1)
      검증: `pnpm typecheck` · `lib/i18n/__tests__/dictionary.test.ts` — 함수 값 셋(카운터 0·1·2, 노드 삽입 참조 동일성)
- [x] `lib/i18n/index.ts` — `export { en as m } from "@/messages/en"` + `export type Messages = typeof en`. **`@/lib/**` import 0** (잎)
      검증: `client-graph.test.ts` — **클라이언트 픽스처가 `@/lib/i18n`을 import했을 때** green (T1 시점엔 실 소비자가 없어 공허하므로
      메타 테스트에 픽스처를 하나 둔다)
- [x] `components/__tests__/client-graph.test.ts` — `ALLOWED`에 `radix-ui`·`class-variance-authority`·`lucide-react` 추가 (**의도된 결정** —
      그 파일 주석이 요구하는 "여기서 한 번"이다, design §9)
      검증: 메타 테스트가 셋 중 하나를 빼면 red
- [x] `lib/i18n/__tests__/no-korean-ui.test.ts` — **축소형 허용 목록**. `app/`·`components/`·`lib/`(`__tests__`·`lib/survey`·`lib/scan`·
      **`lib/adapters` 제외 — 6b**)의 `.ts`·`.tsx`에서 주석(`//`·`/* */`·`{/* */}`)을 벗긴 뒤 `[가-힣]`를 센다. 단언 둘: **목록 밖 파일은 0자** ·
      **목록의 파일마다 ≥1자**(낡은 항목 금지). 초기 목록 = 지금 한글이 있는 파일 전부. UI 커밋마다 자기 파일을 뺀다 → T8 끝에 빈다.
      메타 테스트: 주석 종류 셋을 하나씩 먹여 벗기는지 + 코드 안 한글 리터럴을 잡는지
      검증: 지금 코드베이스에서 **green**(목록이 정확히 현재 상태) · 목록에 없는 파일에 한글 한 자를 픽스처로 넣으면 red

—— `feat(i18n): en dictionary as a leaf module, shrinking allowlist scanner`

## T2. 판정 함수 — 번역 화면·Publish·상태 (순수)

- [x] `lib/keys/view.ts` — `defaultNamespace(counts, focus)`(focus 로케일 기준 pending>0인 첫 ns → 없으면 `compareKeys` 첫 ns → 비면 `null`) ·
      `resolveNamespace(param, counts, focus)`(`"*"`=all, 없는 이름→default) · `filterRows(rows, {q, state, locale})` · `isUnpublished(cell, lastPulledAt)`.
      ⚠️ `compareKeys`는 `lib/adapters/shared`에서 온다 — **view.ts는 잎이 아니다.** 클라이언트가 이 함수들을 값으로 읽지 않는다(서버 렌더 필터)
      검증: `lib/keys/__tests__/view.test.ts` 확장 — 빈 목록·`*`·낡은 이름·대소문자·상태 필터·`lastPulledAt null`·**orphaned만 있는 ns를 default가 건너뛴다**·
      `?ns` 유효+`?q` 0행·pending 전부 0이면 첫 ns
- [x] `lib/pull/run.ts` — `PullResult.committed`에 `pr: "created" | "updated"`. `existing === null ? "created" : "updated"` 한 줄 인라인 (`run.ts:158`,
      `GitClient.findOpenPrUrl` 결과)
      검증: `lib/pull/__tests__/run.test.ts`가 두 갈래를 각자 단언 (기존 PR mock 있음/없음)
- [x] `lib/pull/message.ts` — **문구 다섯·tone 넷**(`info|success|warning|danger`, success 둘) · 문구는 `m`에서 · **편집자 어휘 유지**(기존 어휘 금지
      테스트 `message.test.ts:52,59` 그대로) · warnings ≥1이면 `skipped`여도 `warning`
      검증: `message.test.ts` — 다섯 갈래 문구가 서로 다르다 · tone 매핑 표 · warnings≥1 → `warning`(committed·skipped 둘 다) · exhaustive · 어휘 금지 green
- [x] `lib/routes.ts` — `routes.projects()`·`.newProject()`·`.translations(slug, {ns,focus,q,state})`·`.settings(slug)`·`.invite(token)`. **잎**
      검증: `lib/__tests__/routes.test.ts` — 쿼리 undefined 제거·`*` 인코딩. `entry-points.test.ts` "죽은 라우트 링크"가 이 파일도 읽고, **`${…}`
      템플릿을 `shape()`("쿼리 파라미터의 수신자"의 정규화)로 접어 동적 경로도 대조한다**(지금은 `STATIC_PATH`가 정적만 잡는다 — 2026-09-05 사고는 동적이었다)
      + 그 확장을 고정하는 단언

—— `feat(pull): distinguish created vs updated PR in PullResult` · `feat(keys): namespace landing, row filter, unpublished predicate` · `feat(routes): single source for route links`

## T3. 스키마 — additive 둘 + push `updatedBy` + 조회

- [x] `prisma/schema.prisma` — `Project.lastPublishedAt DateTime?`·`lastPrUrl String?` (주석은 design §5 문장)
      검증: `/db`가 `--create-only`로 SQL 생성 → 눈으로 확인 → dev 적용 → `pnpm db:status` up to date
- [x] `lib/pull/load.ts` `saveLastPulledAt` — `committed`일 때 둘을 함께 쓴다(같은 `update`), `skipped`는 `lastPulledAt`만
      검증: **신설** `lib/pull/__tests__/load.test.ts` — Prisma mock의 `update` 인자 캡처 (committed/skipped 둘)
- [x] `lib/push/apply.ts` — 번역 upsert `ON CONFLICT … DO UPDATE SET … "updatedBy" = NULL`
      검증: `lib/push/__tests__/flow.test.ts`(SQL 캡처)가 그 문자열을 고정. `app/(edit)/__tests__/authorization.test.ts:222-226`은 저장 경로라 그대로 green
- [x] `lib/keys/query.ts` — `countUnpublished(prisma, projectId, lastPulledAt)` = `prisma.translation.count({ where: { projectId, updatedBy: { not: null },
      updatedAt: { gt: lastPulledAt } } })` (null이면 `gt` 생략) · `loadKeys`의 select에 `updatedAt` 추가(셀 점 표시용)
      검증: 하네스 `app/(edit)/__tests__/harness.ts`에 `translation.count` 추가 + **시드에 프로젝트 둘** — 다른 프로젝트 행을 세지 않는다 · `lastPulledAt null`
- [x] `app/(edit)/layout.tsx`용 `loadMemberships(prisma, userId)` — `{slug, name, role}[]`. **새 조회다**(지금 레이아웃은 Prisma를 안 부른다) — `userId` 스코프
      검증: 하네스 — 다른 사용자의 멤버십을 내지 않는다 (POSTMORTEM 2026-09-06)

—— `feat(db): record last publish on Project` (스키마+마이그레이션 **만** — `/db` 6단계 규칙) · `feat(pull,push,keys): persist last publish, push clears updatedBy, unpublished count`

## T4. 문구 모듈·진단 문구 — 사전 읽기로 전환

- [x] `lib/auth/message.ts`·`lib/github-connect/message.ts`·`lib/onboarding/message.ts`(+`ingestHeadline`)·`lib/onboarding/readiness.ts`(`readinessLabel`)·
      `lib/onboarding/detect.ts`(`formatLabel`) — `satisfies Record<Union,string>`. `lib/pull/message.ts`는 T2
      검증: 문구 모듈 테스트 **33줄**(auth 16·onboarding 11·pull 4·github-connect 2)을 영어 기대값으로 갱신해 green · 갈래 하나를 사전에서 지우면 typecheck red(한 번 확인하고 되돌린다) ·
      `credential-separation.test.ts` green(`lib/onboarding`이 `@/lib/i18n`을 읽는 것은 허용 방향)
- [x] 진단 문구 영어화 — `lib/pull/**`·`lib/push/**`·`lib/github.ts`·`lib/auth/profile.ts`·`lib/env.ts`·`lib/github-connect/state.ts`의 `fail()`/`throw` (사전 밖, design §3.1.4).
      ⚠️ **`lib/pull/run.ts:127`의 warnings 조립(`${path}: ${message}`)은 어댑터 `message`를 그대로 실으므로 6a에서는 한글이 남는다** — `no-korean-ui` 목록에
      `run.ts`가 남고 6b가 뺀다
      검증: `lib/__tests__/failure.test.ts`가 `safe` 메시지 예시를 영어로 갱신 · `render.test.ts` 9줄·`run.test.ts` 5줄의 한글 단언 갱신 · 스캔 목록에서 이 파일들 제거
- [x] `lib/onboarding/workflow.ts` YAML 주석 영어화 + `docs/ACTIONS.md` 같은 커밋
      검증: `workflow*.test.ts`(ACTIONS.md 줄 대조) green
- [x] `app/layout.tsx` — `metadata` 영어. ⚠️ **`lang`은 T8로 미룬다** (2026-09-08 code-review 🟡4): 화면 문구가
      21개 파일에서 아직 한국어인데 `lang="en"`을 선언하면 스크린리더가 한국어 본문을 영어 음성으로 읽는다.
      ship 2·3이 프로덕션에 나가는 동안 그 상태가 유지된다
      검증: `no-korean-ui` 목록에서 제거

—— `refactor(i18n): message modules read the dictionary; diagnostics in English` · `docs(ACTIONS): workflow comments in English`

## T5. 프리미티브 — `components/ui/`

- [x] shadcn 생성물 4개 삭제 → **16개**: `Button`(cva `primary·default·danger·ghost·link` × `md`(`h-8`)·`sm`(`h-7`), `loading` 라벨 교체) · `Input` ·
      `Textarea` · `Select`(native) · `Radio` · `FormGroup` · `Badge` · `Alert` · `Card` · `Table` · `Breadcrumb` · `Avatar` · `EmptyState` · `DropdownMenu` ·
      `Dialog` · `Tooltip` — 치수·색은 DESIGN §6.4 **그대로**(정본). `Checkbox`·`Skeleton`은 없다(사용처 0)
      ⚠️ **아이콘을 자기 안에 드는 프리미티브가 셋이다** — `Alert`(variant→`Info`·`CircleCheck`·`TriangleAlert`·`CircleX`, DESIGN §6.2 표) · `EmptyState`(24, `text-muted-foreground`) ·
      `Dialog`(닫기 `X`). 나머지는 호출부가 `children`으로 넣는다. 세트는 `lucide-react` 하나이고 크기는 16·12·24 셋뿐이다 (DESIGN §6.8)
      검증: `pnpm typecheck` · 각 파일의 네 태그가 포커스 링 **셋**을 든다(`ring-offset-1`은 사이드바 항목·칩 옆 버튼에만 — DESIGN §7) · `dark:` 0곳 ·
      **DESIGN §3.1·§6.4·§7의 서술이 이 커밋부터 실물과 일치한다**(`/doc-check`)
- [x] `app/globals.css` — **토큰 값 변경 없음**
      검증: `git diff app/globals.css`가 비어 있다 · `globals-css.test.ts` green
- [x] `components/__tests__/focus-ring.test.ts` — `ui/` 제외 해제 + **"raw 태그 허용 파일 목록"**(축소형 — 초기값은 지금 raw 태그를 쓰는 파일 전부, UI 커밋마다 뺀다,
      목록의 파일은 raw 태그 ≥1이어야 한다) + 메타 테스트(태그 넷을 하나씩)
      검증: 이 시점에 **green**(목록이 현재 상태) · 목록 밖에 raw 태그 하나를 픽스처로 넣으면 red
- [x] `lib/utils.ts` — twMerge `text-mono` 등록 변경 없음
      검증: `git diff lib/utils.ts` 비어 있음

—— `feat(ui): owned primitives on existing tokens` (ui/ + focus-ring 테스트) ✅ **끝났다** (2026-09-08 — `67b924a` 테스트(red) → `7c6469b` 구현 → `d860286` 리뷰 수정).
⚠️ **검증 중 하나가 문서를 고치게 했다**: 스캐너가 여는 태그의 **소스**를 읽으므로 링을 `cva` 베이스·공유 `fieldClass`에 모으면 그 파일이 검사 밖이 된다 — DESIGN §7의 "상수에 숨기지 말 것"이 `ui/` 안으로 자리를 옮겼을 뿐 사라지지 않았다. `Button`에 `asChild`를 두지 않는 것도 같은 이유다.
⚠️ **`ui/` 밖 raw 태그는 아직 13개 파일**이다 — "밖에 0개"는 T8 끝의 상태이고, 그때까지 축소형 허용 목록이 그 자리를 든다.

## T6. 셸·전역 화면 — 로그인 · 목록 (라우트별 커밋)

- [x] `app/(edit)/layout.tsx` — `loadMemberships(userId)` → `<Sidebar memberships>` + top bar(사용자 메뉴만). `redirect()` 둘 유지(2차 방어). **breadcrumb은 페이지
      콘텐츠 첫 줄**이다(레이아웃이 페이지 props를 못 받는다 — design §2)
      검증: `entry-points.test.ts` "차단 규칙" green · 소스에 `redirect(` 둘
- [x] `components/shell/sidebar.tsx`(client — `usePathname`·프로젝트 컨텍스트·역할별 항목·collapse `localStorage`) · `top-bar.tsx` · `user-menu.tsx`.
      6a 섹션은 **Translations · Settings(OWNER)** 둘 — Members·Account는 6b
      ⚠️ **사이드바·top bar는 전 항목이 아이콘을 든다** (DESIGN §6.8 표 — 섹션 `Languages`·`Users`·`Settings`, 하단 전역 `LayoutGrid`·`Plus`·`CircleUser`·`LogOut`·`PanelLeft`,
      프로젝트 컨텍스트 `ChevronsUpDown`, 햄버거 `Menu`, breadcrumb 구분 `ChevronRight`). 접힌 레일에서 **아이콘이 유일한 라벨**이라 하나라도 비면 그 상태가 성립하지 않는다.
      ⚠️ `lucide-react` 1.37.0에 `Github`이 없다 — 브랜드 아이콘은 1.x에서 빠졌다
      검증: `client-graph.test.ts` green(`lucide-react`가 T1의 허용 목록에 있다) · EDITOR 세션으로 Settings가 렌더되지 않는다(실물) · 접힌 상태에서 항목에 `aria-label`(소스) ·
      사이드바 항목 수 == 아이콘 수(소스)
- [x] `app/page.tsx` — 2열 로그인(design §3.12 — 장식은 `--border` dot-grid + `from-primary/5 to-muted`, **raw 색 0**), `?error=` Alert, 장애 문구
      검증: `focus-ring` 목록에서 제거 · `no-korean-ui` 목록에서 제거 · 소스에 `violet|purple` 0
- [x] `app/(edit)/projects/page.tsx` — 행 구조 + EmptyState + `?e=` **global** Alert(두 union). GitHub 계정 섹션은 **그대로 둔다**(6b가 `/account`를 판정한다)
      검증: 두 목록에서 제거 · "쿼리 파라미터의 수신자" green

—— `feat(shell): sidebar and top bar` · `feat(sign-in): two-column sign-in on primitives` · `feat(projects): project list on primitives` ✅ **끝났다** (2026-09-08 — `485dbc9` 테스트(red) → `206f8a5`·`7d2d476`·`bfcb471` → `8fc4233` 리뷰 수정).
⚠️ **리뷰가 🔴 하나를 잡았다**: `Tooltip`이 Radix provider 없이 렌더돼 **[Collapse sidebar]를 누르면 셸이 죽었다** — 접힘이 `localStorage`에 남아 다음 방문에도 같은 자리에서 죽는다. 프리미티브가 자기 provider를 들게 고쳤다 (POSTMORTEM 2026-09-08).
⚠️ **`Button`에 `asChild`가 없어 `ButtonLink`가 생겼다** — Slot 한 겹이 `focus-ring` 스캐너에서 태그를 지운다. 링크는 `<a>`라 그 넷이 아니고, 그래서 링을 상수로 붙여도 방어선이 안 좁아진다.
⚠️ **`loadMemberships`가 목록 화면의 지역 사본을 흡수했다** — 같은 이름이 두 벌이면 그중 하나가 낡는다. `installationId`·`lastCommitSha`가 반환에 더해졌다(목록의 상태 텍스트 재료).
⚠️ **Account 항목은 사이드바에 없다** — 6b-4가 `/account`를 만들지 말지 정한 뒤에 붙는다. 지금 하단 전역은 All projects · New project · Sign out · Collapse 넷이다.

## T7. 번역 화면 + Publish

- [x] `app/(edit)/projects/[slug]/translations/page.tsx` — `resolveNamespace` 기본 착지(pending>0 첫 ns) · 네임스페이스 패널("All keys" 행에도 `pending/total`) ·
      breadcrumb · 툴바(필터 `?q=`·`?state=`·Last sent 링크) · 표(`Table` + `Textarea`) · 배지 · orphaned 열 배지 · `countUnpublished` · **표 하나에 시각 숨김
      `aria-live="polite"` 영역 하나** · 빈 상태 넷(준비 전·로케일 없음·필터 0·**키 없음**)
      검증: 실물 903키 프로젝트 첫 착지 **< 2초**(같은 프로젝트·같은 머신·DevTools Performance의 LCP — 기준선 12.7초를 같은 방법으로 다시 잰다) · `?ns=*`로 전체 ·
      `lib/keys/__tests__/actor.test.ts:87-97` 소스 스캔 green(`loadActors(`·`CellMeta` 배선 — 이름이 바뀌면 스캔 갱신) · 두 목록에서 제거
- [x] `components/translation-input.tsx` — `Textarea`(Enter=저장·Shift+Enter=개행·Esc=되돌리기) · 셀 안 상태줄은 **시각 전용** · 실패 시 **`document.activeElement`가
      `body`이거나 같은 셀일 때만** `focus()`, 아니면 상태줄 [Retry] · "Saved" 1.5초 뒤 소거 · `unauthorized` → "Your session ended — sign in again. Your text is kept." +
      로그인 링크 · `unavailable` → "Temporary problem — try again" · 문구 `m`
      검증: 소스에 `activeElement`·`Retry` · 실물에서 저장 실패 유발(오프라인) 후 다른 셀 타이핑 중이면 포커스가 안 뺏긴다 · 표의 live region이 결과를 읽는다(VoiceOver)
- [x] `components/publish-button.tsx`(옛 `pull-button` 대체) — `Send changes ({n})` + `Send` 아이콘 16 (툴바 검색 `Search`·상태 `ListFilter`·PR 링크 `ExternalLink` 12 — DESIGN §6.8) · 결과 `Alert` 다섯 문구/네 tone · warning 본문 `<details>`에 못 쓴 파일 목록 ·
      성공 후 `router.refresh()` · Alert는 readiness 분기 밖 · **결과 Alert 위·배너 아래** 고정
      검증: `pullMessage` 다섯 갈래→Alert variant 표를 소스에서 센다(단위) · 실물에서 연속 두 번 눌러 둘째가 "Nothing to send"
- [x] 편집 손실 배너 — `Alert warning` "{n} changes not yet sent. They can be lost if your developers push code first — send them when you're done." ·
      복수 `one/other` · 닫기 키 = `lastPulledAt`(`sessionStorage` — 다음 Publish 뒤 다시 보인다) · SSR에서 닫힘 상태를 모르므로 **클라이언트 마운트 뒤에만 렌더**
      검증: 미배포 0이면 DOM에 없다(실물) · 닫은 뒤 Publish하고 편집하면 다시 보인다(실물)
- [x] `components/invite-form.tsx`는 **6a에서 그대로 둔다**(멤버 화면이 6b) — 번역 화면 헤더에서 툴바 오른쪽 `ghost` 버튼 → `Dialog`로 옮긴다
      검증: OWNER만 렌더(소스) · 두 목록에서 제거

—— `feat(translations): namespace landing, filters, publish states, edit-loss banner`

> ✅ **ship 3으로 dev에 나갔다** (2026-09-08 — `3ca5399` 구현 · `177b6ac` 테스트 · `1f200b5` 리뷰 픽스).
> 두 목록(`KOREAN_ALLOWED`·`RAW_TAG_ALLOWED`)에서 넷이 빠졌고 `PENDING_QUERY_KEYS`는 비었다.
>
> **게이트 둘 중 하나가 남았다.**
> - **Publish 다섯 갈래 중 넷을 실물로 밟았다** (로컬 dev, `order-check`): 변경 없음(info) · 새로 보냄
>   (success, PR #5) · 갱신(success) · 실패(danger — 세션 쿠키를 지우고 눌렀다). **못 밟은 것은
>   "일부 미기록"(warning)** — writer가 값을 버리는 상황이 필요한데 그건 **수술적 어댑터**에서 나고
>   `order-check`은 재생성(json-catalog)이다. `pullMessage`의 그 갈래는 단위 테스트가, tone→variant 배선과
>   `<details>` 목록은 소스 스캔이 든다. 실물은 `/l10n-roundtrip`(`bugshot-i18n-test`)이 답할 자리다.
> - **첫 착지 < 2초는 미달이다** — 아래 재측정 표.
>
> 실물에서 잡아 고친 결함 둘은 POSTMORTEM 2026-09-08 두 항목이다 — 제출 버튼 없는 폼의 Enter, 실패 뒤
> `router.refresh()`의 네비게이션.

> **✅ 재측정했다** (2026-09-08, 프로덕션 `ef9da44` 배포 뒤 — 같은 프로젝트 `bugshot-2`(907키로 늘었다) ·
> 같은 머신 · LCP는 버퍼된 `PerformanceObserver`의 `largest-contentful-paint`, DevTools Performance가
> 보고하는 그 값이다). **목표 2초는 미달이고, 미달의 원인이 T7이 겨눈 축이 아니다.**
>
> | 무엇 | LCP | 행 / `<textarea>` |
> |---|---|---|
> | 기준선 (2026-09-07, 필터 없음) | **12.7초** | 903 / 2,711 |
> | `?ns=*` (같은 화면, 필터 없음) | **4.66초** | 907 / 2,721 |
> | **기본 착지** (pending>0인 첫 ns) | **3.30초** (3회 중앙값 — 3.30·3.86·3.30) | 31 / 93 |
> | `order-check` **24키** 프로젝트의 기본 착지 | **3.29초** | 3 / 9 |
> | `/projects` 목록 (키 조회 0) | **1.42초** | — |
>
> 읽는 법: **필터 없는 화면은 12.7 → 4.66초로 2.7배 빨라졌다**(행 렌더가 줄어든 몫). 그런데 기본 착지가
> 3.30초이고 **24키 프로젝트도 3.29초다** — 즉 약 **1.9초가 키 수와 무관한 고정 비용**이고, 그 위에 셸·폰트가
> 1.42초를 깐다. 907행 렌더는 그 위 **+1.4초**다. **가상화도, 조회를 네임스페이스로 좁히는 것도 이 3.3초를
> 못 줄인다** — 24키에서 이미 같은 값이다.
>
> 고정분의 후보는 **순차 DB 왕복**이다(도쿄 리전): 레이아웃의 `readSession`+`loadMemberships`, 페이지의
> 인가 2회 + `loadProject` + [`loadKeys` ∥ `countUnpublished`] + `loadActors`. TTFB는 10~78ms(스트리밍 셸)인데
> LCP가 DCL과 거의 같다 — 셸이 아무것도 그리지 않고 문서 끝에 한 번에 그려진다. **다음 수단 셋은 표를
> `Suspense` 경계로 감싸 셸을 먼저 그리기 · 왕복 병합/병렬화 · 폰트 CSS를 렌더 블로킹에서 빼기**이고,
> 셋 다 번역 화면 재작성 밖이라 **후속으로 넘긴다** (`features/README.md` 백로그).

## T8. 설정 · 새 프로젝트 · 초대 수락 (라우트별 커밋)

- [x] `app/(edit)/projects/[slug]/settings/page.tsx` — settings-block 넷(리포 연결·상태·push 토큰·워크플로) + 계정 섹션 **그대로**. `FirstIngestRetry`는 분기 밖 유지.
      base 필드는 **6b**
      검증: 두 목록에서 제거 · `revalidatePath` 호출 컴포넌트가 분기 밖(소스) · 실물 [다시 시도] 결과 문구가 남는다
- [x] `app/(edit)/projects/new/page.tsx` + `components/onboarding/*` — 상태 기계 그대로, `FormGroup`·`Card`·`Radio`·`EmptyState`로 · 부분 실패 목록 "Could not read {path}" +
      `<details>` 원문(어댑터 `message` — 6a에선 한국어 원문이 `<details>` 안에 남는다, 6b가 코드화) · 쪼개진 문장 **7곳**(`new-project-flow` 399·447-452·485-486 ·
      `projects/new/page` 100 · `push-token-panel` 26-27 · `workflow-block` 18·24-25)을 사전 함수 값으로
      검증: `client-graph.test.ts` green(어댑터 라벨은 여전히 서버가 내려준다) · 실물 ②~⑥ 한 바퀴(폐기용 리포) · 두 목록에서 제거
- [x] `app/invite/[token]/page.tsx` — 셸 밖 카드, 분기별 Alert, provider 버튼은 `Button default`
      검증: 두 목록에서 제거 · `entry-points.test.ts` 예외 목록 그대로 green
- [x] `app/layout.tsx` — `lang="en"` (T4에서 미룬 것 — 이 커밋에서 화면 문구가 전부 영어가 된다)
      검증: 소스에 `lang="en"`
- [x] `lib/routes.ts`가 내는 `?q=`·`?state=`의 **수신자가 생긴다** — `entry-points.test.ts`의
      `PENDING_QUERY_KEYS`에서 둘을 뺀다 (안 빼면 "낡은 항목" 단언이 red다, 2026-09-08 code-review 🟡3)
      검증: 그 목록이 비고 `entry-points` green
- [x] 이 시점에 **두 허용 목록이 빈다** (`no-korean-ui`는 `lib/pull/run.ts`·`lib/pull/render.ts`·`lib/adapters/**` 제외 — 6b)
      검증: `pnpm test` 전체 green · `pnpm build` · `find .next/static/chunks -name '*.js' -size +1M` 출력이 비어 있다

—— `feat(settings): settings blocks on primitives` · `feat(onboarding): new-project flow on primitives` · `feat(invite): accept page on primitives`

## T9. 문서·정리·검증

- [x] `docs/SAAS.md` §8 6단계 체크(6a 항목) + **6b 항목을 같은 절에 미체크로** + §8 1단계 "UI 레퍼런스 — Supabase" 줄을 GitLab으로 + §10에 ko 미결 한 줄
      검증: `/doc-check` SAAS 에이전트 이슈 0
- [x] `docs/ARCHITECTURE.md` — §6.35에 `lib/i18n`·`lib/routes` 잎 추가 · 새 절 "UI 문자열 경계"(design §3.1.4) · `updatedBy` 의미(push가 비운다) · `lastPulledAt` vs
      `lastPublishedAt`의 의미 차이(design §3.5)
      검증: `/doc-check`
- [x] `docs/features/README.md` — translation-ui 행(6a 완료·6b 대기) · `translation-input` a11y 항목 닫음 · "디렉터리만 없다" 정정
- [x] `CLAUDE.md` — 디렉터리 구조(`messages/`·`lib/i18n/`·`lib/routes.ts`·`components/ui/` 소유·`components/shell/`) · "가상화하지 않는다" 절에 착지 실측 추가 ·
      `focus-ring`·`client-graph` 서술(허용 목록 셋)
- [x] `README.md` 요약 미러
- [x] chore — `sonner`·`tw-animate-css` 사용 0이면 제거, `components.json` 판정
      검증: `pnpm build` green · `git grep sonner` 0
- [x] `/bugshot-qa` 한 바퀴 — user-stories §1·§2·§3·§4·§6·§8 순서 + EDITOR의 settings URL 직접 진입(`not-found`) + 저장 실패 포커스(다른 셀 타이핑 중) +
      Publish 다섯 갈래 중 넷(**실패는 App 설치의 선택 목록에서 폐기용 리포를 빼서** 유발 — base 브랜치를 못 읽는다; push 토큰은 pull과 무관) + 첫 착지 <2초 +
      배너 부재/재등장 + EDITOR 사이드바 + VoiceOver 한 번
      검증: 이슈 0건 또는 전부 닫힘
- [x] `/db` → `/push` → `/merge`(`db:deploy` 1단계)

—— 문서별 커밋(`docs(SAAS): …`·`docs(ARCHITECTURE): …`·`docs(CLAUDE): …`·`docs(feature): …`) · `chore: drop unused ui deps`

> ✅ **ship 4로 프로덕션에 나갔다** (2026-09-08 — PR #16 → squash `695e441`). **6a가 닫혔다.**
>
> - **문서는 `/doc-check` 전수 대조로 갱신했다** — 12개 문서에서 54건(🔴 10 · 🟡 24 · ⚪ 20)을 잡아 문서별
>   커밋 10개 + 코드 커밋 1개로 반영했다. T9가 열거한 항목보다 넓다. 가장 값이 컸던 것: ARCHITECTURE와
>   `lib/auth/session.ts` 주석이 **"`not-found`와 `forbidden`이 같게 말하므로 존재 노출이 없다"**고 적고
>   있었는데 `access.ts`는 일부러 둘을 **다르게** 말한다 — 실제 방어는 비멤버에게 무조건 `not-found`를
>   내는 **분기 순서**다(EDITOR가 `/settings`를 직접 열면 `?e=forbidden`으로 실측됐다). 그 문장을 믿으면
>   반대 방향의 수정 둘이 정당해 보인다. DESIGN은 §6.1에 **표 밖 구조 셋**(네임스페이스 패널·헤더
>   스트립·고정 슬롯)이 통째로 없었다.
> - **chore 판정**: `sonner`(import 0) · `tw-animate-css`(`@import`만, `animate-*` 0곳) 제거,
>   **`components.json`도 삭제**했다 — CLI를 다시 돌리지 않는 리포에 CLI 설정만 남는다.
> - **`/bugshot-qa` 이슈 0건.** 못 밟은 시나리오 다섯: VoiceOver(CDP로 스크린리더 구동 불가) · 온보딩
>   ①①' 3갈래(설치·리포가 실재해 유발 불가) · 첫 착지 <2초(dev DB에 903키 프로젝트가 없다 — prod에서
>   이미 쟀고 **미달**) · 저장 실패 포커스(ship 3에서 실측, 이 배송이 그 파일을 안 건드렸다) · Record tab.
>   ⚠️ **T9의 기대값 하나가 틀렸다** — "EDITOR의 settings 직접 진입(`not-found`)"은 실제로 `forbidden`이고
>   **그게 맞다**(EDITOR는 그 프로젝트의 멤버다).
> - **`/db`는 스킵**했다 — 스키마 변경 0.

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

## 6b-1. 어댑터 오류 코드화 + survey 분류기 + 재측정 — ✅ 닫혔다 (2026-09-08)

> **결과**: 생성 지점 **35곳**(계획의 34 + `lib/onboarding/ingest.ts`의 `download-failed` — 계획이 그것을 못 셌다)이
> `AdapterErrorCode` 스물둘을 낸다. 재측정은 **학습·홀드아웃 둘 다** 돌려 전 지표가 13차와 같았다
> (`docs/ADAPTER-COVERAGE.md` **§20**). 지표 ③의 유형별 건수까지 동일하고, §1이 "분모 없음"으로 비워 뒀던
> 세 행(`json-parse` 0 · `adapter-threw` 0 · `other` 1)이 이 회차로 채워졌다.
>
> **아래 계획이 틀린 곳 셋** — 다음 사이클이 같은 착각을 하지 않도록 남긴다:
> 1. **소비자가 여덟이 아니라 아홉이다** — `lib/onboarding/ingest.ts`가 `{ path, message: "could not download the file" }`을
>    만들고 있었다. 타입 변경이 그것을 물었다.
> 2. **`classify`의 골든 등식을 스물둘 전부에 걸 수 없다.** write 층 아홉은 `read1.errors`에 **도달하지 못하고**,
>    그 옛 문구가 read 갈래의 부분 문자열을 품어(`구문 오류로 원본을 그대로 둔다: …`) 옛 분류기에 먹이면
>    `json-parse`가 나온다. 등식은 read 층 **열셋**에만 걸고 나머지는 `other`임을 따로 단언한다.
> 3. **어댑터 테스트 갱신이 "한글 단언 갱신"으로 끝나지 않았다.** `code-dict`의 한 단언이 겨냥한
>    `write-slot-missing`은 **도달 불가**였고(`findScalar`가 먼저 잡는다), 옛 단언이 `message.includes("a.deep")`이라
>    두 갈래를 구별하지 못해 그 사실이 숨어 있었다 (POSTMORTEM 2026-09-08).
>
> **범위에 하나 더 들어갔다**: POSTMORTEM이 "어댑터를 손대는 6b-1에서 같이 본다"로 배정해 둔
> `lib/adapters/json-catalog.ts`의 `format.nestedByPath?.[path] ?? …` 프로토타입 키 위험을 `Object.hasOwn`으로 감쌌다.
> 출력 바이트는 안 바뀐다 — `false ?? x`가 `false`를 유지하므로 정상 입력의 결과가 같다.

<details>
<summary>원래 계획 (그대로 남긴다 — 위의 "틀린 곳 셋"이 이것을 가리킨다)</summary>


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

</details>

> ⚠️ **2026-09-08에 6b-2와 6b-3의 번호를 맞바꿨다** (사용자 지적). 그 전에는 base 변경이 6b-2, 멤버 화면이
> 6b-3이었는데 base 변경은 **design §3.13을 다시 써야** 착수할 수 있어(아래 🔴) 뒷번호를 먼저 하게 되고,
> 그러면 번호가 실행 순서를 뜻하지 않는다. **번호 = 실행 순서**로 맞췄다 — `SAAS.md` §8도 나열 순서가
> 번호와 어긋나 있었다(6b-2 → 6b-4 → 6b-3). **옛 참조를 읽을 때 주의**: 이 날짜 이전 문서·PR 본문의
> "6b-2"는 base 변경, "6b-3"은 멤버 화면이다.

## 6b-2. 멤버 화면 — ✅ 닫혔다 (2026-09-09)

> **결과**: `/projects/:slug/members` 신설 — 멤버 표(역할 native `Select`·제거 `Dialog`) · 대기 초대 표
> (`revokeInvitation` — `expiresAt`을 당긴다) · 초대 `Dialog`. 임시 폼 `components/invite-form.tsx` 삭제.
> 계획의 첫 항목(라우트 신설 근거)은 `spec.md` §2.3에 적고 `github-connect/spec.md` 두 곳에 🔴 STALE을 달았다.
>
> **계획 밖에서 더 들어간 것 둘**:
> 1. **`relativeTime`을 `lib/relative-time.ts`(잎)로 내렸다.** 멤버 표 둘이 클라이언트에서 그것을 값으로
>    읽는데 `lib/keys/view.ts`는 잎이 아니다(`compareKeys` → `lib/adapters/shared` → `json-style`) —
>    POSTMORTEM 2026-09-07의 재발이고 `client-graph`가 못 보는 부류다(금지 목록에 없는 가벼운 의존).
> 2. **[malmoi#18](https://github.com/SinhyeokKang/malmoi/issues/18)** — `maskEmail`이 서로 다른 주소를
>    같은 문자열로 접어 대기 초대 행이 구별되지 않았다. `/bugshot-qa`가 잡았고 `maskedInviteLabels`
>    (목록 전체를 보고 충돌하는 행만 늘린다)로 같은 사이클에서 고쳤다.
>
> **계획이 놓쳤던 것**: `?e=` global Alert 슬롯을 요구했지만 **그 쿼리를 이 경로로 보내는 자리가 없다** —
> 거부는 `/projects?e=`로 가고 Action 실패는 행 옆 인라인이다(어느 행인지가 정보다). 슬롯을 만들지 않고
> `members-screen.test.ts`가 "읽는 쪽도 보내는 쪽도 0"을 고정한다 — 짝을 강제한다.

<details>
<summary>원래 계획 (그대로 남긴다)</summary>


- **라우트 신설 근거를 먼저 적는다** — `github-connect/spec.md:45,127`은 "`/settings` 페이지에 섹션"으로 결정했다. 별도 라우트의 실제 이유(EDITOR가 목록을 봐야 하는데 `/settings`는
  `project:settings` 뒤)를 spec §2.3에 쓰고 그쪽을 stale로 표시한다
- **Members는 전원에게 렌더**(EDITOR도 목록을 본다 — user-stories §5 스토리와 §0 "OWNER만"이 모순이었다). Settings만 OWNER
- `revokeInvitation`은 **`deleteMany`가 아니라 `updateMany({ where: { id, projectId, acceptedAt: null }, data: { expiresAt: now } })`** — `prisma/schema.prisma:365`가 삭제를 금지하고
  기존 관용구가 `expiresAt = now`(`createInvitation`, `actions.ts:132`)다. `loadPendingInvitations`의 `expiresAt > now()` 술어가 그대로 맞는다. 모델명은 `ProjectInvitation`
- 대기 초대 0건 빈 상태 · `?e=` global Alert 슬롯 · 역할 변경은 native `Select`(DropdownMenu 아님) · `components/invite-form.tsx` 삭제는 이 커밋에서
- 검증: `app/(edit)/__tests__/membership.test.ts` — 다른 프로젝트의 초대 id는 0행 · EDITOR `forbidden` · 마지막 OWNER 문구 · 이미 수락된 초대는 건드리지 않는다

</details>

## 6b-3. 설정 — base branch·기준 로케일 ✅ **T1~T5 dev에 있다** (2026-09-09) / ⬜ T6은 `/merge` 뒤

> **설계 요지**: **선언을 별 컬럼으로 뺀다.** `Project.declaredBaseLocale`(신설, additive, nullable)이 "다음 CI push가
> 이 base를 가져오면 받아들이겠다"는 OWNER의 허가이고, `Project.baseLocale`은 **리포가 확인해 준 현실**로 남는다.
> pull은 현실만 읽으므로 **코드가 한 줄도 안 바뀌고 어느 단계도 멈추지 않는다** — 대기 중에도 pull이 옛 base로
> 돌아 편집이 리포로 나가고, 옛 base로 오는 CI push도 통과한다. 검수의 후보안(같은 컬럼을 선언으로 쓰고 pull을
> `skipped`로 멈춘다)을 기각한 이유가 그것이다: 멈추면 **편집 손실 창이 대기 기간만큼 늘어난다**(design §3.13의 ⚠️).

### T1. 순수 판정 셋 (잎)

- [x] `lib/pull/branch-name.ts` — `isValidBranchName(name)`. `git check-ref-format` 부분집합: 공백·`..`·`~^:?*[`·제어문자·끝 `/`·`.lock` 끝·빈 문자열 금지. **`isRefSafeSlug`보다 넓다**(`/`·대문자 허용) — 그쪽은 우리가 만드는 ref 이름이고 이쪽은 남의 리포에 있는 브랜치다. ⚠️ **import 0인 잎이어야 한다** — 설정 화면(클라이언트)이 값으로 읽는다(`lib/pull/ref-slug.ts`가 같은 이유로 내려왔다, POSTMORTEM 2026-09-07)
      검증: `lib/pull/__tests__/branch-name.test.ts` — 정상 넷(`main`·`release/2.0`·`feat/UI-1`·`v1.0`) · 거부 여덟(빈 문자열·`a b`·`a..b`·`a~b`·`a:b`·`a/`·`a.lock`·`he^ad`)
- [x] `lib/onboarding/base-locale.ts` — `planBaseLocaleChange({ current, next, locales })` → `"noop" | "ok" | "unknown-locale" | "orphaned-locale"`. `next === current`면 `noop`, `locales`에 없으면 `unknown-locale`, 있지만 `orphaned`면 `orphaned-locale`(그 파일은 리포에서 사라졌다 — base로 세우면 다음 push가 키 0개를 낸다)
      검증: `__tests__/base-locale.test.ts` — 네 갈래 각각 + 빈 `locales` + 대소문자를 접지 않는다(`zh_CN` ≠ `zh-CN` — `DetectedFormat.locales`가 파일명 그대로다)
- [x] `lib/onboarding/base-pending.ts` — `basePending({ baseLocale, declaredBaseLocale })` → `boolean`. **두 화면이 같은 조건을 읽는 유일한 자리다** — 설정의 Alert와 번역 화면의 배너가 각자 조건을 쓰면 하나가 낡는다
      검증: `__tests__/base-pending.test.ts` — 선언 null / 선언 === 현실 / 선언 ≠ 현실 / 현실 null(첫 push 전) 넷

—— ✅ `fe5f39e` (T1·T3을 한 커밋에 실었다 — 순수 판정 셋이 그 커밋의 소비자와 같은 파이프라인에서 green이 됐다)

### T2. 스키마 (additive 하나)

- [x] `prisma/schema.prisma` — `Project.declaredBaseLocale String?`. 주석에 **소유자와 읽는 곳**을 적는다(선언 = 설정 화면 / 현실 = `baseLocale`, push 소유). `/db`가 마이그레이션을 만든다
      검증: `pnpm db:migrate` 뒤 `pnpm db:status` up to date · `prisma/__tests__/schema-contract.test.ts`에 nullable 단언 추가 · **`anon` 권한 0건**(dev·prod — `/db` 5단계, POSTMORTEM 2026-09-09)

—— ✅ `3a98886` — dev 적용 완료(`db:status` 13개 up to date), **prod는 `/merge` 1단계의 `db:deploy`가 넓힌다.** `anon`·`authenticated` 권한 0건 확인(컬럼 추가는 `pg_default_acl`을 지나지 않는다)

### T3. `checkFormat`이 선언과도 대조한다

- [x] `lib/push/guard.ts` — `payload.baseLocale`이 `stored.baseLocale` **또는** `stored.declaredBaseLocale`과 같으면 `ok`. `adapter`·`pathTemplate`은 **그대로 엄격**하다(오배송을 막는 것은 그 둘이다). 호출부(`api/push/route.ts`)가 `declaredBaseLocale`을 `select`에 더한다 — ⚠️ **optional로 두지 않는다**(껍데기가 빼면 컴파일러가 막는다, POSTMORTEM 2026-09-02)
      검증: `lib/push/__tests__/guard.test.ts` 확장 — 선언과 일치하면 `ok` · 현실과 일치하면 `ok` · **둘 다 아니면 `wrong-format`** · 선언이 null이면 옛 동작 그대로 · `adapter`만 달라도 `wrong-format`(느슨해진 것이 base 하나뿐임을 고정한다)
- [x] `lib/push/apply.ts` — push 성공 시 `declaredBaseLocale`을 **비운다**(`null`). 안 비우면 선언이 영구히 남아 `checkFormat`이 그 값을 계속 받아들인다 — 일회용 허가여야 한다
      검증: `lib/push/__tests__/flow.test.ts` — 새 base로 push 뒤 `declaredBaseLocale === null` · `baseLocale`·`isBase`가 새 값 · **같은 payload를 두 번 보내도 두 번째가 `ok`**(현실이 이미 새 값이므로)
- [x] `lib/push/plan.ts` — `planPush`가 **옛 base를 인자로 받고**, `payload.format.baseLocale !== 옛 base`이면 `staleKeyIds`를 **비운다**.
      ⚠️ **`needsReview` 전파의 뜻이 base 변경에서는 성립하지 않는다.** 평소의 전파는 "개발자가 원문 문장을 고쳤다 → 번역이 낡았을 수 있다"인데, base 변경은
      **원문의 언어가 교체된 것**이고 의미는 그대로다 — en→ko면 `sourceText`가 "Save"→"저장"으로 바뀌지만 fr의 "Enregistrer"는 여전히 정확하고, 옛 base(en)의 값도
      마찬가지다. 전파하면 **살아남는 키 전부**에 검토 표시가 붙어 903키 프로젝트에서 `needsReview` 필터가 통째로 죽는다(6a T7이 만든 값 하나가 사라진다).
      `app/api/push/route.ts:56`이 **이미 `project`를 읽어 `checkFormat`에 넘기므로** 그 값을 하나 더 넘기는 것이 전부다 — `apply.ts`의 전파 SQL은 손대지 않는다
      (`staleKeyIds`가 비면 그 statement가 애초에 안 나간다)
      검증: `lib/push/__tests__/plan.test.ts` — base 같으면 옛 동작 그대로(원문 수정 키만 stale) · base 다르면 `staleKeyIds`가 **빈 배열** · 옛 base가 null(첫 push)이면 옛 동작 · `flow.test.ts`에서 그 push 뒤 `needsReview`가 **한 행도 안 붙는지** SQL 인자로 본다

—— ✅ `fe5f39e` + `6ab0f70`. ⚠️ **T3의 소비 조건이 구현에서 바뀌었다**: 위 항목은 "push 성공 시 비운다"였는데 그러면 워크플로를 고치기 전의 평범한 CI push가 허가와 배너를 함께 지운다 — **`baseChanged`일 때만** 비운다 (code-review 🔴1 · POSTMORTEM 2026-09-09)

### T4. 설정 화면 — Repository 블록의 필드 둘

- [x] `updateRepositorySettings({ slug, baseBranch, baseLocale })` (`project:settings`) — 둘을 한 폼에 두므로 저장도 하나다. `baseBranch`는 즉시 쓰고 `baseLocale`은 **선언만** 쓴다. 결과에 재생성한 `workflowYaml`이 실린다
      검증: `app/(edit)/__tests__/repository-settings.test.ts` — EDITOR `forbidden` · 다른 프로젝트 slug는 `not-found` · 잘못된 브랜치 이름은 `invalid-branch`(앞뒤 공백 포함) · orphaned 로케일은 `orphaned-locale` · `noop`이고 선언도 없으면 **`project.update`를 아예 부르지 않는다** · `noop`인데 선언이 남아 있으면 그것을 비운다(되돌리기) · 성공 경로가 `baseLocale`·`Locale.isBase`를 **건드리지 않는다**
- [x] 블록 안 `Alert warning`은 **`basePending`이 조건**이다(저장 직후만이 아니라 대기 중 상시) — "Update `.github/workflows/l10n.yml` — until then CI pushes keep the old base language" + YAML 코드 블록 + [Copy]. ⚠️ **readiness 분기 밖**(POSTMORTEM 2026-09-07 revalidate)
      ⚠️ **그 블록은 파일 전체가 아니라 고칠 한 줄이다** (구현에서 좁혔다): 아래 워크플로 카드가 이미 선언을 반영한 YAML을 통째로 내므로, 여기서 또 내면 한 화면에 저장할 파일이 둘로 보인다. 줄의 정본은 `lib/onboarding/workflow.ts`의 `baseLocaleLine`이고 **대기 중에는 `workflowYaml`이 어댑터와 무관하게 `base-locale:`을 박는다** — 안 박으면 CI가 탐지 1순위(=옛 base)를 보내 통과하고 변경이 영영 조용히 안 일어난다
      검증: `components/__tests__/base-locale-screens.test.ts` 소스 스캔 — `basePending`을 읽는다 · `<pre>`로 낸다(여러 줄이라 `whitespace-pre-wrap`이 아니다, DESIGN §4.1) · `base-locale:` 리터럴을 화면이 직접 만들지 않는다 · 저장 실패는 in-block Alert · 폼이 `components/ui/` 프리미티브만 쓴다
- [x] `docs/ACTIONS.md`와 같은 커밋 — `base-locale` 행에 "설정에서 바꾸면 이 값을 함께 고쳐야 한다"를 적는다. `workflow.test.ts`가 ACTIONS.md와 줄 대조하므로 문서가 함께 바뀌어야 green이다

—— ✅ `fe5f39e` + `a9bfe96`. ⚠️ **필드 초기값이 `baseLocaleFieldValue({ baseLocale, declaredBaseLocale })`다** — 현실로 초기화했더니 대기 중 저장 한 번이 선언을 조용히 취소했다 ([malmoi#20](https://github.com/SinhyeokKang/malmoi/issues/20), `/bugshot-qa`가 잡았다). ⚠️ **Action이 `workflowYaml`을 반환하지 않는다** — YAML은 서버가 렌더하고 `revalidatePath`가 다시 그린다(design §3.13의 정정)

### T5. 번역 화면 — 대기 배너

- [x] `components/translations/`에 배너 하나. 조건은 `basePending`, 문구는 **"먼저 보내라"** — 다음 CI push가 키 집합을 새로 세우고 strict가 값을 덮으므로(MVP §3.1) 그 전에 Publish하는 것이 손실 창을 좁히는 유일한 수단이다.
      ⚠️ **검토 표시를 예고하지 않는다** — T3이 base 변경 push에서 전파를 건너뛰므로 그 일이 안 일어난다. 배너는 **덮어쓰기 하나만** 말한다(둘을 말하면 무엇을 해야 하는지가 흐려진다)
      검증: `components/__tests__/base-locale-screens.test.ts` — 편집 손실 배너와 **자리가 갈린다**(둘 다 조건부 분기 **밖** — DESIGN §6.1 고정 슬롯, 대기 배너가 **먼저**다) · `basePending`을 읽는다(조건이 두 벌이 아니다 — 손으로 쓴 비교가 어느 화면에도 없다) · **닫기가 없다**(편집 손실 배너와 반대다 — 할 일이 남은 동안 계속 참이다)

—— ✅ `fe5f39e` (헤더의 고정 슬롯에 `EditLossBanner`와 형제로 들어갔고 **대기 배너가 먼저**다)

### T6. 실물 — ⚠️ **`/ship` 밖이다. `/merge` 뒤에 돈다**

**대상 리포의 워크플로가 `PUSH_TOKEN`으로 프로덕션 `mal-moi.com/api/push`를 찌른다** — dev(preview)는 그 경로에 없으므로 **`/ship` 안에서는 원리적으로 검증할 수 없다.**
`/l10n-roundtrip`이 `/push`·`/merge` 밖에 있는 것과 같은 이유다. 그래서 **6b-3의 완료 조건이 둘로 갈린다**:

| 무엇 | 언제 | 게이트 |
|---|---|---|
| T1~T5 | `/ship bypass 6b-3` | 단위·소스 검증 + `/db`(T2) + `/push` 로컬 게이트 |
| **T6** | **`/merge` 뒤** | 실물 — 아래 |

- [ ] 폐기용 리포에서 **옛 `base-locale`로 CI를 한 번 돌려** 409를 본다 → 워크플로의 `base-locale:`을 고쳐 다시 돌려 통과와 대기 해소를 본다. `/l10n-roundtrip`은 어댑터 표현 층이라 이 축을 안 본다
      검증: 실측 — push 응답 **409**(`wrong-format`) · 워크플로 수정 후 **200** · 그 뒤 `declaredBaseLocale === null`·`baseLocale`이 새 값 · **`needsReview`가 한 행도 안 붙었다**(T3) · 다음 pull이 새 base 파일을 낸다

### 비목표 (6b-3에서 안 한다)

- ~~옛 base 로케일의 번역만 전파에서 제외하는 것~~ → **T3이 전파 자체를 건너뛰는 쪽으로 바뀌었다** (2026-09-09 판정). 옛 base만 빼는 것은 절반만 고치는 것이었다 — `sourceHash`가 바뀐 원인이 "원문 수정"이 아니라 "원문 언어 교체"라 **다른 로케일의 번역도 여전히 정확하다.**
- **base 변경 뒤 자동 재적재.** 재적재 경로는 CI 하나뿐이고(`runFirstIngest`는 ready에서 `not-awaiting`) 자동으로 이어 붙이면 저장 하나가 GitHub 왕복이 된다.

## 6b-4. `/account` — 만들지 말지부터

- SAAS §8 6단계 3번이 이미 `[x]`이고 착지처가 `/projects`다(계정 섹션이 거기 있다). 라우트 하나에 matcher·`StateDest` 갈래(배포 직후 10분 옛 쿠키 창)·`entry-points`·사이드바 항목이 따라온다.
  **추천: 만들지 않는다** — 사용자 메뉴에 "GitHub account" 항목으로 `/projects#github`. 만들면 `landing`은 `app/api/github/callback/route.ts:177`의 지역 함수(request 인자)라 잎으로
  내리는 작업이 신설로 붙고, `startGithubConnectForUser`는 **무인자**라 `dest` 인자 추가는 시그니처 변경(`onboarding.test.ts` 호출부 갱신)이다
