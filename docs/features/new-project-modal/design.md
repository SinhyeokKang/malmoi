# design — 새 프로젝트 온보딩 모달

**디자인 SoT는 spec.md §0이다** — Claude Design 프로젝트 `b99d54cd-3034-44f1-8446-0a864da9d767`의
`design_handoff_new_project_modal/`. 아래 §8의 수치는 그 폴더의 `README.md`를 옮긴 것이고, **어긋나면
그쪽이 이긴다.** `DesignSync`(`list_files`·`get_file`)로 읽는다.

읽은 소스: `app/(edit)/projects/page.tsx` · `app/(edit)/projects/new/page.tsx` ·
**`app/(edit)/projects/new/layout.tsx`** · `components/ui/{dialog,segmented-control,empty-state}.tsx` ·
`lib/relative-time.ts` · `lib/keys/flag.ts` ·
`components/onboarding/new-project-flow.tsx` · `app/(edit)/projects/actions.ts` ·
`lib/onboarding/{detect,confirm,budget,workflow}.ts` · `lib/github.ts` · `lib/github-connect/user.ts` ·
`messages/en.tsx` · `app/__tests__/{entry-points,screens}.test.ts` ·
`app/(edit)/__tests__/{shell-layout,onboarding,projects-query}.test.*` ·
`docs/{PRODUCT,ARCHITECTURE,DESIGN,ACTIONS,POSTMORTEM}.md`.

## 0. 영향 받는 흐름

**편집 UI 하나다.** push·pull에 닿지 않는다 — 단 **`Project.baseBranch`를 사람이 정하게 되므로 pull이
읽는 값의 출처가 바뀐다**(`probeRepo`의 `default_branch` → 사용자 선택). 그 값이 틀리면 야간 pull이
`base-branch-missing`으로 죽으므로, 서버가 **저장 전에 그 ref로 스냅샷을 떠 본다**(§3.4).

## 1. 라우팅 결정

### 1.1 형태 — 인터셉팅 라우트를 쓰지 않는다

**`/projects`와 `/projects/new`가 같은 트리를 그리고, 모달의 열림/닫힘이 그 둘을 가른다.**

```
app/(edit)/projects/page.tsx        → <ContentPanel>{목록}</ContentPanel>
app/(edit)/projects/new/layout.tsx  → 삭제
app/(edit)/projects/new/page.tsx    → <ContentPanel>{목록}</ContentPanel> + <NewProjectModal open />
```

⚠️ **`app/(edit)/projects/new/layout.tsx`가 이미 `<ContentPanel>`을 든다** — `new/page.tsx`에는 그
import조차 없다. `shell-layout.test.ts`의 `chain()`은 **페이지 + 모든 조상 레이아웃**에서 파일 단위로
리터럴을 세어 정확히 1을 요구하므로, **그 레이아웃을 남긴 채 페이지에도 넣으면 2가 되어 red다.**

**레이아웃을 지운다.** 그 파일의 존재 이유는 주석에 적혀 있다 — *"그 화면은 갈래마다 따로 반환하므로
(계정 미연결·설치 0·리포 0·본문) 페이지 안에서 감싸면 네 자리를 다 고쳐야 하고 하나를 빠뜨리면
그 갈래만 맨몸이다."* **그 갈래 넷이 전부 모달 안으로 들어가면**(§4의 예외 A·B·C) 페이지의 반환은
하나가 되고, 그 근거가 사라진다.

목록 본문은 서버 컴포넌트 하나(`components/projects/project-list.tsx`)로 내리고 **두 페이지가 각자
`<ContentPanel>`로 감싼다.** 그 래퍼를 공유 컴포넌트로 올리면 같은 스캐너가 **두 라우트 다 0개**로
세어 red다 — 래퍼는 페이지에 남기고 내용만 공유한다.

**대안(인터셉팅 라우트 `@modal` + `(.)new`)을 고르지 않는 이유:**

| 축 | 공유 트리(채택) | 인터셉팅 라우트 |
|---|---|---|
| 하드 내비(새로고침·`?e=`·공유) | 같은 화면 — 분기가 없다 | `(.)new`가 안 걸려 **전체 페이지 폴백**이 필요하다 → 같은 온보딩의 디자인이 **두 벌** |
| `shell-layout.test.ts` | `pages()`가 찾는 페이지가 지금과 같은 둘 — 검사가 그대로 성립 | `@modal/(.)new/page.tsx`가 페이지로 잡혀 **"체인에 `<ContentPanel` 정확히 하나"가 red**(모달은 패널을 들면 안 된다) |
| 비용 | `/projects/new`가 `loadProjectList`를 한 번 더 돈다 | 스캐너 예외를 손으로 판다 |

**결론은 위 두 행만으로 선다** — 둘 다 실물에서 확인되는 근거다.

`maxDuration`은 **덧붙는 안심거리이지 기각 근거가 아니다.** ARCHITECTURE **§3.1·§5.6.2**(§6이 아니다)의
배선대로 Server Action에는 `app/api/*`의 세그먼트 config가 붙지 않고 **자기를 부른 페이지 세그먼트**의
값을 쓴다 — 탐지(blob ≤21)와 첫 적재의 예산이 전부 그 60초를 전제로 선다. 공유 트리에서는
`/projects/new`가 **진짜 세그먼트**라 그 값이 그대로 적용된다. 인터셉팅 라우트에서 `@modal` 슬롯의
값이 어떻게 되는지는 **문서가 말하지 않을 뿐**이고, 그것은 부재 논증이라 결정의 무게를 실을 자리가
아니다. ⚠️ 참고로 §3.1이 `maxDuration = 60`인 **"세 페이지"를 이름으로** 못 박고 있으므로, 그 자리를
안 옮기는 한 그 문서는 그대로 맞다(T9의 확인 항목).

### 1.2 랜드마크

**모달은 `<main>`이 아니라 `role="dialog"`다.** Radix `Dialog.Content`를 포털로 띄우므로 `<main>`
**밖**에 그려지고, `shell-layout.test.ts`의 두 단언이 그대로 통과한다:

- "본문 랜드마크가 패널 하나다 — 화면이 자기 `<main>`을 들지 않는다": 모달 컴포넌트는 `components/`
  아래라 그 스캐너(`app/(edit)/**/page.tsx`)의 대상이 아니고, 두 페이지는 계속 `<main>`을 안 든다.
- "각 페이지의 체인에 콘텐츠 패널이 정확히 하나다": §1.1의 배치가 그것을 지킨다.

모달이 열리면 Radix가 뒤 목록을 `aria-hidden`으로 덮고 포커스를 가둔다. **`<h1>`은 모달 안에 두지
않는다** — 뒤 패널의 `<h1>Projects`가 문서에 남아 있으므로 모달 제목은 `Dialog.Title`(20/500)이다.

### 1.2.1 알림과 포커스 — 껍데기가 든다

⚠️ **Radix가 주는 것은 포커스 트랩·Esc·`aria-modal`까지다.** 단계 전환과 비동기 완료는 **DOM이
바뀌기만 하고 아무도 알려주지 않는다.** 그리고 `components/ui/alert.tsx`는 **`danger`일 때만**
`role="alert"`를 붙이므로 §4의 info Alert 둘(④ 적재 중 · ③ 키 수 비교)은 지금 계약대로면 **무음**이다.

| 무엇 | 어떻게 |
|---|---|
| 단계 전환 | 껍데기 안 `sr-only` `aria-live="polite"` 하나에 **새 단계의 제목**을 쓴다. 동시에 본문 컨테이너(`tabIndex={-1}`)에 `.focus()` — [Next]는 껍데기 소유라 누른 뒤 포커스가 그 버튼에 남고, 그러면 스크린리더가 "같은 화면"으로 읽는다 |
| 로딩 → 완료 | 같은 live 영역. ②의 "Reading …" → "3 sets matched", ④의 "Importing…" → "Imported 903 keys" |
| ④ 적재 중 info | `role="status"`를 **명시**한다 — [Start translating]이 활성인 채 본문이 바뀌는 유일한 자리다 |
| 실패 | `danger` Alert가 이미 `role="alert"`다. 추가 배선 없음 |

선례는 `components/announcer.tsx`(번역 화면)다. ⚠️ `translations-screen.test.ts`가 live 영역을 그
화면에만 **허용**하는 형태이지 다른 곳을 **금지**하지 않는다 — 온보딩에 두는 것은 그 검사 밖이다.

### 1.3 `?e=` 복원

**연다.** `/projects/new`는 `?e=`를 읽는 라우트 다섯 중 하나이고(PRODUCT §7.7), GitHub callback이
`{kind:"new"}` dest에 대해 그 주소로 되돌린다. 모달이 안 열리면 **"GitHub 연결 버튼을 눌렀는데 아무
일도 안 일어났다"**가 되고, 그것이 정확히 POSTMORTEM 2026-09-06의 형태다.

- 판정은 지금 그대로 **두 union**이다: `isOnboardError` → `onboardErrorMessage`, `isConnectError` →
  `connectErrorMessage`. 한쪽만 보면 그 사유가 통째로 무음이다.
- 배너 자리는 **①의 본문 맨 위**(`role="alert"` danger Alert). 모달 머리에 두면 제목과 경쟁한다.
- 닫으면 `?e=`도 함께 사라진다(`routes.projects()`로 간다).

### 1.4 닫기와 주소

| 단계 | X · Esc · backdrop | [Back] | 주소 |
|---|---|---|---|
| ① | 닫힌다 | **없다** (`showBack=false`) | `router.replace(routes.projects({ q, filter }))` |
| ② ③ | 닫힌다 | 앞 단계 | 같음 |
| ④ | **닫힌다 — X가 남는다** | **없다** (되돌릴 것이 없다) | 같음 |

⚠️ **`q`·`filter`를 왕복시킨다.** `/projects`는 `Raw<"e" | "filter" | "q">`를 읽어 **서버에서 걸러**
목록을 그린다. 그 값을 안 실으면 `/projects?q=foo`에서 [New project]를 누른 순간 **뒤 목록이 필터 없는
전체로 바뀌고**(= 완료 조건 1의 "목록이 뒤에 남은 채"가 거짓이 된다), 닫으면 검색이 사라진다.

- `routes.newProject()`가 `q`·`filter`를 **싣는다**(지금은 안 싣는다).
- `app/(edit)/projects/new/page.tsx`의 `searchParams`가 `Raw<"e" | "filter" | "q">`로 넓어진다.
  `entry-points.test.ts`의 쿼리 수신자 검사가 그 형에서 키를 뽑으므로 **선언이 곧 계약이다.**
- 닫기가 그 값을 들고 `routes.projects()`로 간다.
- ⚠️ **뒤 목록의 검색창은 모달이 열린 동안 도달 불가다**(Radix가 `aria-hidden` + 포커스 트랩). 그래서
  `components/projects/search-input.tsx`가 `routes.projects()`로 `push`하는 것은 **그대로 둔다** —
  모달이 열린 채 그것이 불릴 경로가 없다.

- **①에 [Back]을 안 그린다** (열린 결정 ⑤). 그리면 같은 자리의 버튼이 ①에서만 "닫기"이고 ②부터
  "앞 단계"라 뜻이 둘이 된다. **[Back]은 항상 앞 단계, X·Esc·backdrop은 항상 닫기**로 하나씩 남는다.
- **④에서 닫기를 막지 않는다** (README "Interactions & Behavior"). 토큰을 아직 안 옮긴 사용자가 닫을
  수 있어야 하고, **닫아도 프로젝트는 목록에 `Waiting for first import`로 존재한다.**
- ⚠️ **적재의 생존을 보장하지 않는다.** `runFirstIngest`는 `startTransition` 밖에서
  `void ….then()`으로 뜨므로, ④에서 닫거나 [Start translating]으로 이동하면 그 요청이 끊길 수 있다.
  **끊겨도 복구 경로가 둘 다 있다** — 적재는 설정 화면의 `first-ingest-retry.tsx`가 다시 돌리고,
  토큰은 `rotatePushToken`이 재발급한다. **보장하지 않는 것을 문구가 약속하지 않게** ④의 help 줄이
  그 둘을 말한다(§7). 생존을 보장하려면 큐·재시도 정책이 따라오므로 이번 범위 밖이다.
- `push`가 아니라 `replace`다 — `push`면 뒤로가기가 방금 닫은 모달을 다시 연다.

### 1.5 `maxDuration`

`app/(edit)/projects/new/page.tsx`의 `export const maxDuration = 60`을 **그 자리에 그대로 둔다.**
`/projects/page.tsx`에는 넣지 않는다 — 그 주소에서는 온보딩 Action이 한 번도 안 돈다.

## 2. 모달 껍데기와 단계 넷

### 2.1 껍데기 계약 (`components/onboarding/modal.tsx`)

⚠️ **`components/ui/dialog.tsx`를 쓰지 않고 Radix `Dialog.*`를 직접 조립한다.** 그 프리미티브로는
§8의 껍데기가 **만들어지지 않는다** — 네 자리가 막힌다:

| 막히는 것 | 프리미티브의 현재 모습 |
|---|---|
| dim 알파·blur | Overlay가 `cn()`도 props도 없이 `bg-foreground/40 fixed inset-0 z-50` **고정**이다 |
| 머리·본문·바닥 padding | `p-4` / `p-4 pb-2` / `p-4 pt-2`가 박혀 있고 `className`은 **Content 루트에만** 병합된다 |
| 바닥 3분할 | `flex justify-end gap-2`라 왼쪽 `Step n of 4`를 못 넣는다 |
| X 36×36 원형 | `DialogClose asChild` + `Button variant="ghost" size="sm"` 하드코딩. ⚠️ 그 자리가 POSTMORTEM 2026-09-09(`asChild` 자식 옆 형제)의 지뢰다 |

고치면 **초대·확인·아카이브·로그인수단 모달 넷이 함께 움직인다** — 그것이 원래 피하려던 결과다.
직접 조립하면 프리미티브를 **안 쓰고 안 고치므로** 그 목적이 그대로 달성되고, DESIGN §7("모달은
Radix가 포커스 트랩·Esc·`aria-*`를 든다")도 유지된다. (`cn()`이 `className`을 마지막에 병합하는 것은
맞아서 `max-w-lg` → `max-w-[960px]`만은 덮이지만, 나머지 넷이 안 되므로 그 하나로는 부족하다.)

README `Modal.dc.html`의 props를 그대로 가져온다. **네 단계가 껍데기를 공유하고 본문만 넘긴다.**

```
type Props = {
  title: ReactNode; description?: ReactNode;
  step: 1 | 2 | 3 | 4;                    // 바닥 왼쪽 "Step n of 4"
  nextLabel?: string; nextArrow?: boolean; // ③은 "Create project" + 화살표 없음
  nextDisabled?: boolean;                  // 확정 불가 상태는 껍데기가 든다
  nextPending?: boolean;                   // ③ 제출 중 — [Next]만 로딩, 본문은 그대로
  showBack?: boolean;                      // ①④는 false
  bodyDirection?: "column" | "row";        // ②만 row
  bodyScroll?: "auto" | "hidden";          // ②④는 hidden — 안쪽 요소가 스크롤한다
  announce?: string;                        // sr-only aria-live에 흘려보낼 한 줄 (§1.2.1)
  onNext(): void; onBack?(): void; onClose(): void;
};
```

⚠️ **`step`이 바뀌면 껍데기가 본문 컨테이너에 포커스를 옮기고 `title`을 live 영역에 쓴다**(§1.2.1) —
단계마다 다시 배선하지 않는다.

⚠️ **`nextDisabled`를 단계가 직접 그리지 않는다.** 껍데기가 흰 배경 + border + muted 글자 +
`cursor:not-allowed`로 든다 — 단계마다 비활성 모양을 다시 만들면 갈린다.

⚠️ **스텝퍼를 세우지 않는다** — 네 칸이 누를 수 없는 장식이 된다. 진행은 `Step n of 4` 한 줄이다.

⚠️ **제목이 단계마다 바뀐다** — "New project"를 네 번 쓰지 않는다(§7).

### 2.2 단계

| # | 제목 | 결정되는 값 | 게이트(로딩) |
|---|---|---|---|
| ① | `New project` | `owner` `repo` `baseBranch` | 진입 시 `listConnectableRepos`(**Suspense** — §2.3) · 행 선택 시 `listRepoBranches` |
| ② | `Which files hold your strings?` | `adapter` `pathTemplate` | `detectRepoFormats`(트리 + blob ≤21) · 언어 전환 시 `loadCandidateSample`(blob ≤1) |
| ③ | `Project details` | `baseLocale` `name` `slug` | — (**주소 중복은 제출 시 `createProject`가 판정한다** — §3.5) |
| ④ | `malmoi is ready` | — | `createProject` → `runFirstIngest` |

**③의 내부 순서는 info → Name → Address → 구분선 → Base language다.** "리포에 무엇을 하는가"
(기준 언어 파일을 한 번 읽고 **아무것도 쓰지 않는다**)가 값을 입력하기 전에 읽혀야 하고, 되돌릴 수
없는 값 둘(주소·기준 언어)의 경고는 **본문 안의 500**으로만 말한다 — amber `Alert`를 세우지 않는다
(아직 깨진 것이 없다).

⚠️ **③의 본문은 스크롤에 들어간다**(README 실측 529/618). **기준 언어 라디오의 첫 줄이 첫 화면에
보여야 한다** — 안 보이면 그 결정이 있다는 것 자체를 모른다.

### 2.3 ①의 로딩은 Suspense로 만든다

지금 `new/page.tsx`는 `await listConnectableRepos()` **뒤에** 렌더한다 — 그대로 두면 §4의 "① 로딩"
행도 `newProject.repo.loading` 키도 **도달 불가**다(POSTMORTEM 2026-09-08: 도달 불가한 갈래를 겨냥한
테스트가 1년치 green이었다). 리포 목록을 `<Suspense>`로 감싸 스켈레톤이 실제로 서게 한다.

**막힘 상태 셋(예외 A·B·C)도 모달 안으로 들어온다.** 지금은 `new/page.tsx`의 서버 컴포넌트가 그리고
`newProject.empty.*` 10키의 **유일한 소비자**다. 모달 밖에 남기면 같은 온보딩 진입에 화면이 두 벌이
되어 §1.1이 인터셉팅 라우트를 기각한 이유와 정면으로 충돌한다. 그리고 그 이관이 §1.1의
`new/layout.tsx` 삭제를 성립시킨다(갈래 넷 → 반환 하나).

## 3. API 변경 — 셋

### 3.1 리포 목록에 메타 추가 (`listConnectableRepos`)

①의 행 보조 줄이 `owner · pushed 2 hours ago`인데 **지금은 `fullName`만 있다.**

- `lib/github-connect/user.ts`의 `listInstallationRepos`가 지금 `full_name`만 돌려준다 →
  `{ fullName, pushedAt }`로 넓힌다. 엔드포인트는 **`GET /user/installations/{installation_id}/repositories`**
  (user-to-server 토큰, `paginate`)이고 그 응답에 `pushed_at`이 이미 있다 (**추가 호출 0**).
- `RepoOption`에 `pushedAt: string`(ISO)을 더한다. 그 타입은 지금 `new-project-flow.tsx`에 있고
  §5가 그 파일을 쪼개므로 **`lib/onboarding/types.ts`로 내린다**(서버·클라이언트가 함께 읽는다).
- ⚠️ **`relativeTime`을 새로 만들지 않는다 — 이미 있다.** `lib/relative-time.ts`의
  `relativeTime(then: Date, now: Date)`가 `Intl.RelativeTimeFormat` 래퍼이고, **`now`를 인자로 받는
  이유(SSR과 hydration의 기준이 갈리면 첫 페인트에서 문구가 바뀐다)까지 그 파일 주석이 적고 있다.**
  소비자 다섯이 이미 쓴다. → `pushedAt`을 `new Date(...)`로 감싸 그 함수에 넘기고, `now`는
  **서버 페이지가 한 번 만들어 내려보낸다**(클라이언트에서 만들면 그 주석이 경고하는 그 상황이다).
- ⚠️ **중복 제거와 정렬을 함께 고친다.** 지금은 `[...new Set(names)].sort()`다 — **객체가 되면 기본
  `.sort()`가 전부 `"[object Object]"`로 비교해 비교자가 언제나 0을 내고 정렬이 조용히 사라진다**
  (`tsc`가 못 본다). `fullName` 키로 접고(같은 리포라 `pushedAt`도 같다) **`fullName` 오름차순으로
  명시 비교자를 준다** — 정렬 축은 이름이다. `pushed …`는 판단 재료이지 정렬 축이 아니다(최근 push
  순으로 두면 같은 리포가 접속할 때마다 다른 자리에 선다).

### 3.2 브랜치 목록 — 신규

**`lib/github.ts`에 얇은 껍데기 하나, `app/(edit)/projects/actions.ts`에 Action 하나.**

```
// lib/github.ts
export async function listBranches(owner, repo, installationId): Promise<BranchList>
type BranchList =
  | { status: "ok"; names: string[]; truncated: boolean }
  | { status: "unavailable" }
```

- **installation 토큰이다** — 읽기이지만 리포 내용이고, user-to-server 토큰은 "어느 설치를 볼 수
  있는가"(GET만)에 쓰인다(CLAUDE.md의 자격증명 표 · `credential-separation.test.ts`).
- `GET /repos/{owner}/{repo}/branches` `per_page=100`. **최대 3페이지(300개)에서 끊고
  `truncated: true`**를 값으로 준다 — `snapshot`이 `truncated`를 값으로 주는 것과 같은 관용구다.
- **`openRepoReader`에 얹지 않는다.** 그 리더는 설치 토큰 캐시를 한 번만 만들려고 존재하는데
  (`createApp()`을 읽기마다 부르면 토큰 발급이 배로 는다 — code-review 2026-09-07 🔴2), 브랜치 조회는
  스냅샷 전에 단독으로 돈다. **같은 함수 안에서 `createApp()`을 한 번만 부르는 형**을 지킨다.

```
// actions.ts
export async function listRepoBranches(raw: { owner: string; repo: string })
  : Promise<{ ok: true; names: string[]; defaultBranch: string; truncated: boolean }
          | { ok: false; error: OnboardFailure }>
```

- **인가는 `checkRepoAccess`를 그대로 지난다.** 새로 짜지 않는다 — 그 함수가 ARCHITECTURE §6의
  3중 검증이고, **존재 오라클을 막는 순서**(사용자 토큰으로 먼저 보고, 없으면 `repo-not-installed`
  한 갈래로 접는다)가 거기 있다. 여기서 갈래를 나누면 sec-audit 발견 5가 그대로 돌아온다.
- `defaultBranch`는 같은 호출이 이미 들고 있다 — **GitHub을 한 번 더 부르지 않는다.**
- ⚠️ **선택된 브랜치 이름에 `/`가 들어갈 수 있다** (`release/2.0` — §2가 그것을 동기로 든다).
  `reader.snapshot(ref)`가 `GET /repos/{o}/{r}/git/ref/heads/{ref}`를 조립하므로 **인코딩을 이중으로
  하지 않는다** — octokit이 이미 경로 파라미터를 인코딩한다(POSTMORTEM 2026-09-01: 라이브러리가 이미
  하는 인코딩을 또 해서 조용한 404였다). T3·T5가 슬래시 케이스를 단언으로 고정한다.

| 실패 갈래 | 화면 |
|---|---|
| `checkRepoAccess` 거부(`repo-not-installed`·`reauthorize`…) | 그 행을 접고 danger `Alert`. **다음 단계로 못 간다** |
| `unavailable`(목록 조회만 실패) | **①을 막지 않는다.** 브랜치 칸이 default branch 하나만 든 읽기 전용 표기 + "Using the repository's default branch." |
| `truncated` | `Select` 대신 `Input`(`isValidBranchName`) + 안내 한 줄 |

**예산**: blob 0. REST 1~3회. `detectRepoFormats`의 ≤21과 **별개 예산**이고 겹치지 않는다.
**캐시**: 같은 리포를 다시 고르면 클라이언트 상태를 재사용한다(왕복이 아니라 **깜빡임**을 막는다).

### 3.3 `detectRepoFormats` — 샘플·키 수 확장

```
export type SampleRow = { key: string; value: string };
export type LocaleSample = {
  locale: string;
  /** 앞 SAMPLE_ROWS(10)개. 파일 순서를 보존한다 — 정렬하지 않는다. */
  rows: SampleRow[];
  /** 그 로케일의 전체 엔트리 수. 표 바닥의 "N more keys"와 Select 옵션 라벨이 쓴다. */
  total: number;
};
export type CandidateSummary = {
  …기존 그대로…
  /** `sampleOrder`가 고른 로케일만 든다 — **추가 blob이 0이다.** */
  samples: LocaleSample[];
};
```

- **추가 blob이 0인 이유**: `probeTargets`가 이미 후보당 `sampleOrder(locales)`(en 우선 → 코드포인트
  순, 3개)를 내려받는다. `summarizeCandidates`는 그중 **기준 로케일 하나만** `adapter.read`로 풀어 키
  수를 세고 나머지를 버린다 — 같은 blob을 이미 손에 들고 있으므로 **read를 세 번으로 늘리고 앞 10행을
  자르는 것**이 전부다. `PROBE_LIMITS`(jsonLike 5 · codeDict 2 → blob ≤21)는 **한 줄도 안 바뀐다.**
- ⚠️ **`multi-locale`(ts-dict)은 한 파일에 전 언어가 있다** — 그 후보는 **처음부터 전 언어의 `rows`와
  `total`을 든다**(추가 blob 없이). per-locale만 §3.3의 lazy load가 필요하다.
- 읽기 실패는 **후보를 떨어뜨리지 않는다**: 그 로케일의 `rows: []`로 남고 후보는 살아 있다
  (`countKeys`가 `key-count-failed`를 값으로 내는 것과 같은 규칙 — 남의 리포를 우리 파서로 탈락시키지
  않는다, ARCHITECTURE §4).

### 3.4 언어 전환 시의 추가 샘플 — 신규

**2026-09-13 리뷰 정정 — 검증의 선후관계.** 아래 초기 계약의 `planConfirmedFormat`은 내용을
재탐지하므로 blob을 받기 전에는 완료할 수 없다. 기존 구현은 전 로케일을 먼저 내려받아 이 제약과
blob ≤1을 모두 어겼다. 수정 계약은 탐지·수동 확정에서 재검증 후 서명한 `confirmation`을 발급하고,
샘플 조회에서는 현재 사용자·리포 id·설치 id·브랜치·head SHA와 확인값을 먼저 대조한다.
수동 지정은 `confirmManualFormat`으로 첫 검증과 초기 샘플을 받고, 이후 언어 전환만
`loadCandidateSample`을 부른다. 첫 검증은 기존 다운로드 예산을 지키며, lazy 조회는 per-locale
blob ≤1이다. 확인값은 파일 내용을 담지 않으며 서버 캐시도 아니다.


세그먼트는 후보의 **로케일 전부**를 든다(그래서 "다섯 이상이면 `Select`로 접는다"가 성립한다).
detect가 들고 있는 것은 3개뿐이므로 **나머지는 누를 때 받는다.**

```
export async function loadCandidateSample(raw: {
  owner: string; repo: string; ref: string;
  adapter: string; pathTemplate: string; locale: string; confirmation: string;
}): Promise<{ ok: true; rows: SampleRow[]; total: number } | { ok: false; error: OnboardFailure }>
```

⚠️ **이것이 불변식 10이 걸리는 자리다** — 클라이언트가 보낸 값 셋(`pathTemplate`·`locale`·`ref`)으로
리포를 읽는 **새 경로**가 열린다. §3.8의 "불변식 영향 없다"를 여기서 정정한다.

**방어 셋을 진입점에 건다. 새로 만들지 않고 이미 지정된 함수를 부른다.**

| 값 | 통제 | 왜 그 함수인가 |
|---|---|---|
| `adapter` + `pathTemplate` | **`planConfirmedFormat` 후 발급한 `confirmation`** | 내용 재검증은 탐지·수동 확정에서 한다. 샘플 진입점은 현재 인가·head와 서명을 대조한다. `templatePaths`를 그 방어로 재사용하지 않는다 |
| `locale` | **`isPathSafeLocale`** (`lib/locale-code.ts`) | 불변식 10이 **잎 모듈에 한 벌**로 두라고 못 박은 그 함수. `Locale.code`가 경로를 정하는 부류다 |
| `ref` | **`isValidBranchName`** (`lib/pull/branch-name.ts`) | 잎이라 비용이 0인데 **지금 설계는 `createProject`에만 걸었다.** `detectRepoFormats(ref)`·`loadCandidateSample(ref)`이 맨값을 GitHub URL에 넣고 있었다 — **세 진입점 전부** 지난다 |

- 그 위에 `createProject`와 **같은 관용구**로 스냅샷의 실제 경로 목록과 교차시키고, 교차 결과에 없는
  경로는 읽지 않는다. **임의 파일을 읽는 경로가 생기지 않는다.**
- 예산: **blob ≤1**(per-locale). `checkDownloadBudget`·`checkContentBudget`를 그대로 지난다.
- 실패는 표 자리의 한 줄이고 **[Next]를 막지 않는다** — 미리보기는 근거이지 게이트가 아니다
  (수동 지정일 때만 예외: 거기서는 매칭이 곧 검증이다 — §4의 예외 E).
- ⚠️ **"못 읽었다"와 "정말 비었다"를 화면에서 가른다.** §9가 브랜치 조회에 건 규칙(*실패한 조회를
  "없음"으로 읽지 않는다* — POSTMORTEM 2026-09-03)을 여기에도 건다. 빈 값은 **빈 칸**,
  조회/파싱 실패는 **`newProject.files.preview.unavailable`("We couldn't read this file.")**. ②가
  "ko 열이 비어 있다"를 말하는 화면(spec §1)이라 이 구별이 기능의 목적 자체에 걸린다.

**`Select` 옵션 라벨의 키 수** (열린 결정 ⑥): **받은 언어만 `en · 903 keys`이고 나머지는 코드만**이다.
전 언어의 키 수는 로케일 파일 전부를 읽는 것이라 ≤21 밖이다. 누르면 표가 차면서 라벨도 채워진다.
multi-locale은 §3.3대로 처음부터 전부 찬다.

**재탐지 시점 — 캐시가 무효가 되는 경계 셋**

1. **브랜치 변경** → 후보·샘플·키 수가 **통째로** 무효다. ②에 들어갈 때 `detectRepoFormats`를 다시
   부른다(②가 다시 `loading`이 된다).
2. **리포 변경** → 같다.
3. **후보 변경**(②에서 다른 라디오) → 그 후보의 3개 샘플은 detect가 이미 들고 있으므로 즉시 그린다.

클라이언트 캐시 키는 `${owner}/${repo}@${ref}` + 후보 index + locale. **서버 캐시는 두지 않는다** —
`unstable_cache`를 붙이면 사용자가 리포를 고친 직후에 옛 트리를 본다.

### 3.5 주소 판정 — **신규 Action을 만들지 않는다**

**형식은 클라이언트가, 중복은 제출이 판정한다.**

- **형식**: `planSlug`가 `lib/pull/ref-slug`만 무는 **잎**이라 클라이언트가 직접 부른다. 갈래 넷
  (`empty`·`format`·`too-long`·`reserved`)이 각자 필드 아래 help로 선다 — 지금은 `slug-taken`만
  화면에 닿고 나머지는 제출에서야 드러난다. ⚠️ **`RESERVED`에 `new`가 들어 있고 그 예약의 근거가
  바로 이 라우트다**(PRODUCT §7.7) — 이 기능이 그 라우트를 다루면서 그 갈래를 빠뜨리면 안 된다.
  DB를 안 보므로 **새는 비트가 0이고**, 왕복도 0이다.
- **중복**: `createProject`가 지금처럼 `slug-taken`으로 판정한다. ③이 **마지막 입력 단계**이고 §4의
  예외 I가 "③에 머문다"이므로 **입력은 전부 유지되고 되돌아오는 비용이 왕복 한 번**이다.

**`checkSlug`(입력 중 디바운스 조회)를 기각했다** — 결정 ②를 뒤집는다. 근거 둘:

1. **원래 근거가 자기모순이었다.** *"누르고 나서 알면 ③의 다른 입력을 다 채운 뒤 되돌아온다"*인데,
   설계 자신의 예외 I가 ③에 머물게 하므로 **다 채운 것이 그대로 남는다.**
2. **열거 속도를 연다.** `requireUser`만 지나는 **무제한 읽기**이고, 이 앱의 로그인은 "검증된 이메일만
   요구하고 그것이 아무것도 열지 않는다"(CLAUDE.md) — 아무나 가입해 전역 slug 공간을 훑을 수 있다.
   `createProject`의 선조회는 쓰기 뒤에 있고 `limit-reached`가 걸리지만 이쪽은 아무 상한이 없다.
   *"새로 여는 것은 속도이지 비트가 아니다"*는 문장은 스스로를 논박한다 — **열거는 정의상 속도가
   전부다.** 디바운스 300ms는 클라이언트 값이라 통제가 아니다.

**대안 제안은 단언하지 않는다.** `suggestAlternateSlug`는 존재 확인이 없으므로(§10) 문구가
`Try another, such as <alt>.`다 — `<alt> is free`라고 쓰면 확인한 적 없는 것을 단언하게 된다
(POSTMORTEM 2026-09-09: 문서가 단언한 통제를 코드가 안 했다).

### 3.6 `createProject` 입력 변경

```
const CreateProjectInput = z.object({
  …기존 일곱…
  baseBranch: z.string().min(1),   // 형식은 아래에서 isValidBranchName으로 본다
});
```

- **형식 판정을 두 벌로 만들지 않는다**: 설정 화면이 쓰는 `isValidBranchName`(`lib/pull/branch-name.ts`,
  잎 모듈이라 클라이언트도 읽는다)을 서버가 그대로 부른다.
- ⚠️ **실패 사유는 기존 값이 아니다 — 새 갈래를 하나 만든다.** `invalid-branch`는
  `lib/settings/message.ts`의 `RepositorySettingsError`에만 있고 **`OnboardError`(19개)에는 없다.**
  `OnboardFailure`로 접히는 `createProject`가 그 값을 낼 수 없으므로 **셋을 함께 늘린다**: union 멤버 ·
  `ONBOARD_ERRORS` Set · `m.errors.onboarding` 사전(`satisfies Record<…>`가 걸려 있어 빠뜨리면
  `tsc`가 잡는다). "새 **검증**을 만들지 않는다"는 맞지만 "새 **갈래**를 안 만든다"는 틀렸다.
- ⚠️ **`baseBranch`를 T5에서 곧장 필수로 만들지 않는다** — 유일한 프로덕션 호출부
  (`new-project-flow.tsx`)에 아직 그 값의 출처가 없어 그 커밋에서 `typecheck`·`build`가 red가 된다.
  T5는 `baseBranch?` + `?? access.defaultBranch` 폴백으로 받고, **UI가 값을 주는 T8에서 필수로
  조인다**(두 커밋 다 green).
- **존재는 스냅샷이 증명한다.** 지금 코드가 `reader.snapshot(access.defaultBranch)`를 부르는 자리에
  선택값을 넣으면, 없는 브랜치는 `base-branch-missing`으로 **이미 있는 갈래**를 탄다 — 새 검증을
  만들지 않는다.
- 저장: `baseBranch: input.baseBranch`(현재 `access.defaultBranch`).
- 반환의 `baseBranch`도 그 값 — ④의 `renderWorkflowYaml`이 `on.push.branches`에 그대로 쓰므로
  **자동으로 따라간다**(`lib/onboarding/workflow.ts`).

**snapshot 호출부 — README의 "셋"을 정정한다. 인자를 고칠 곳은 둘이고, 셋째는 저절로 따라온다.**

| 호출부 | 지금 | 바뀜 |
|---|---|---|
| `detectRepoFormats` | `reader.snapshot(access.defaultBranch)` | **인자의 값이 바뀐다** — `raw.ref ?? access.defaultBranch` (`snapshot`은 원래 인자가 하나다) |
| `createProject` | `reader.snapshot(access.defaultBranch)` + `baseBranch: access.defaultBranch` | **둘 다 `input.baseBranch`** |
| `runFirstIngest` | `reader.snapshot(project.baseBranch)` | **고치지 않는다** — 이미 DB 컬럼을 읽으므로 위에서 저장한 값이 그대로 들어온다 |

`loadCandidateSample`(신규)도 `ref`를 받으므로 실질 호출부는 셋이 된다.

### 3.7 스키마·환경변수

- **스키마 변경 없음.** `Project.baseBranch`는 이미 있고 default가 `"main"`이다(그래서 온보딩이
  **반드시 채운다** — 채우지 않으면 base가 `develop`인 리포의 pull이 `main`을 찾아 죽는다).
- **새 환경변수 없음.** `GITHUB_APP_SLUG`는 지금처럼 `optionalEnv`이고 없으면 설치 링크만 사라진다.

### 3.8 불변식 영향

**불변식 10이 걸린다.** 나머지는 두 자리를 확인만 한다.

- ⚠️ **불변식 10(경로 판정)** — `loadCandidateSample`이 **클라이언트가 보낸 값으로 리포를 읽는 새
  경로**를 연다. 방어는 §3.4의 표가 든다: `planConfirmedFormat`(ARCHITECTURE §3.1이 그 값 쌍에
  지정한 통제 — `templatePaths`로 대신하지 않는다) + `isPathSafeLocale` + **세 진입점 전부**
  `isValidBranchName`. 이 절이 처음에 "영향 없다"라고 적었던 것은 오판이었다.
- **불변식 9(버린 값을 숨기지 않는다)**: ④의 tone은 계속 `failed`가 정한다. `screens.test.ts`가
  `components/onboarding/new-project-flow.tsx` **경로를 리터럴로** 읽으므로, 파일을 쪼개면 그 단언이
  가리키는 파일이 사라진다(§5).
- **결정성·blob SHA**: 이 기능은 리포에 쓰지 않는다. export 경로에 닿지 않는다.
- **인증 경계**: 새 Action **둘**(`listRepoBranches`·`loadCandidateSample`)이 인가를 지나고
  `entry-points.test.ts`에 **이름으로** 등재된다.

## 4. 상태 표 — 단계 × (기본 · 로딩 · 예외)

**[Back]·[Next]는 껍데기가 소유한다.** 단계는 본문과 "다음으로 갈 수 있는가"만 넘긴다.

| 단계 | 상태 | 본문 | [Back] | [Next] |
|---|---|---|---|---|
| ① | 기본 | 검색 `Input` + 한 테두리 안의 리포 행(라디오 + 글리프 칩 40 + 이름/`owner · pushed …`). 고른 행 아래 브랜치 줄이 늘어난다. 바닥 보조 링크 | **없음** | 리포가 선택됐으면 활성 |
| ① | 로딩 | 스켈레톤 행 **셋** + 목록 아래 "Looking for repositories with the malmoi app installed…" | 없음 | 비활성 |
| ① | 브랜치 로딩 | 선택 행 아래 브랜치 줄 자리에 스켈레톤 한 줄 | 없음 | **활성** — 기본 브랜치가 이미 값이다 |
| ① | 예외 A 계정 미연결/재인가 | `EmptyState` + [Connect GitHub] **primary**. 배너 없음(정상 경로다) | 없음 | 비활성 |
| ① | 예외 B 설치에 리포 없음 | `EmptyState` + [Add repositories to the installation] `default` + 외부 링크 글리프. `GITHUB_APP_SLUG`가 없으면 "관리자에게 요청" | 없음 | 비활성 |
| ① | 예외 B′ **검색 결과 0건** | 목록 자리에 한 줄 + [Clear search]. ⚠️ **예외 B와 가른다** — 요구하는 일이 다르다(설치에 리포를 넣어라 / 검색어를 지워라). DESIGN §6.7이 "셋을 하나로 접으면 무엇을 해야 하는지 알 수 없다"를 못 박은 그 원칙이다 | 없음 | 비활성 |
| ① | 예외 C 목록 조회 실패 | `role="alert"` danger Alert + `EmptyState` + [Try again] `default`. 설명이 "연결은 멀쩡하다"를 말한다 | 없음 | 비활성 |
| ① | 예외 C′ **`checkRepoAccess` 거부** (`repo-not-installed`·`reauthorize`…) | 그 행을 접고 danger `Alert`. 사유는 **한 갈래로 접힌 채**다(존재 오라클 방어 — §3.2) | 없음 | **비활성** — 다음 단계로 못 간다 |
| ① | 예외 D 브랜치 **목록** 조회 실패(`unavailable`) | 목록 그대로 + 브랜치 칸이 읽기 전용 default branch + "Using the repository's default branch." | 없음 | **활성** |
| ② | 로딩 | **먼저 넘어온 뒤** 좌측 스켈레톤 **둘** · 우측은 표 헤더 글자 실물 + 행 스켈레톤, 세그먼트는 트랙 자리(150×36)만. 머리 설명이 "Reading … · main…" | 활성 | 비활성 |
| ② | 기본 | 좌 **240** 후보 라디오 / 우 툴바(세그먼트 + 파일명) + 헤더 + 키 행(스크롤) + 총량 줄 | 활성 | 후보가 선택됐으면 활성 |
| ② | 로케일 **1개** | 세그먼트 칸 하나(트랙은 그대로 선다 — 자리가 사라지면 "언어가 더 있나"를 물을 수 없다). ③의 기준 언어 라디오도 하나이고 키 수 비교 문장은 **안 선다** | 활성 | 활성 |
| ② | 언어 샘플 로딩 | 키 행만 스켈레톤(툴바·헤더·총량 줄 그대로) | 활성 | **활성** |
| ② | 언어 샘플 **실패** | 키 행 자리에 "We couldn't read this file." ⚠️ **빈 언어(빈 칸)와 가른다** — §3.4 | 활성 | **활성** |
| ② | 예외 E 후보 0개 | 제목 "Where are your locale files?" · 좌측이 수동 지정 폼 · 우측 "Nothing to preview yet"(헤더는 서 있다) | 활성 | **매칭이 있을 때만** |
| ② | 예외 F 탐지 실패 | danger `Alert` + [Try again]. **①의 선택(리포·브랜치)은 지키고** "아무것도 만들어지지 않았다"를 말한다 | 활성 | 비활성 |
| ③ | 기본 | info → Name → Address → 구분선 → Base language(라디오 + 국기 + "Most keys" 배지) + 키 수 비교 info. ⚠️ **배지·비교 문장은 키 수를 아는 언어에만** 선다(§6-⑥) | 활성 | 셋이 다 차면 활성. 라벨 "Create project", 화살표 없음 |
| ③ | 주소 **형식** 오류 | 입력 중에 필드 아래 help. `planSlug` 갈래 넷(`empty`·`format`·`too-long`·**`reserved` — `new`가 여기다**)이 각자 문구를 든다. **클라이언트 판정이라 왕복 0** | 활성 | 비활성 |
| ③ | 제출 중 | 필드 잠금, [Next] 로딩(`nextPending`) | 비활성 | 로딩 |
| ③ | 예외 G 주소 **중복** | **제출 뒤** 그 필드에 border destructive + `aria-invalid` + destructive help + 대안 하나(`Try another, such as …` — **단언하지 않는다**). **입력값은 전부 남는다.** 배너 없음 | 활성 | 비활성 |
| ④ | 적재 중 | 토큰 칩 + [Copy] · YAML 블록 + [Copy] **즉시 보인다** · info Alert `role="status"` "Importing… reading src/i18n/en.json on main." | **없음** | [Start translating] **활성** |
| ④ | 완료(실패 0) | 머리 설명이 "Imported 903 keys. …" | 없음 | [Start translating] |
| ④ | 부분 실패 | `warning` — "Imported 903 keys, but 2 couldn't be read." + `Details`에 못 읽은 경로(mono) | 없음 | [Start translating] |
| ④ | 예외 H 적재 실패 | danger Alert + [Try again] `default` + "목록에 `Waiting for first import`로 있다 · 설정에서도 다시 시도할 수 있다". **토큰 블록은 그대로 보인다** | 없음 | [Start translating] |
| ④ | 예외 I `createProject` 실패 | **③에 머문다** — ④로 넘어가지 않는다. 사유별 처리(`limit-reached`·`slug-taken`·`manual-no-match`·`invalid-branch`·`base-branch-missing`·`unavailable`) | 활성 | 비활성 |
| 전 단계 | **예외 J 세션 만료·인가 거부** | **그 단계에 머물며 입력값을 전부 지킨다.** danger `Alert` 하나("Sign in again and come back — nothing has been created.")를 세울 뿐 **모달을 닫지도 `router.refresh()`를 부르지도 않는다** | 그대로 | 비활성 |

⚠️ **로딩은 "다음 단계 안"이다.** [Next]를 누른 자리에서 라벨만 바꾸면 화면이 멈춘 것으로 보인다 —
모달은 먼저 다음 단계로 넘어가고 그 안이 스켈레톤으로 찬다. **행 높이·디바이더·표 헤더 글자는 실물
그대로** 세운다(다 차고 나서 레이아웃이 움직이지 않아야 한다). **개수는 실제보다 적게**(①은 셋, ②는 둘).

⚠️ **④의 [Start translating]은 적재 중에도 활성이다.** 비활성이면 토큰을 이미 옮긴 사용자가 60초를
갇힌다. 목적지(`/projects/<slug>/translations`)는 `awaiting_first_sync` 동안 자기 상태를 말한다.
그 대가는 §1.4가 적은 **적재 생존 비보장**이고, 복구 경로 둘(`first-ingest-retry` · `rotatePushToken`)을
④의 help 줄이 미리 말한다.

⚠️ **예외 J를 갈래마다 다시 만들지 않는다.** 예외 I가 "③에 머문다"인 것과 **같은 규칙**을 전 단계에
한 번 적용한 것이다 — 모달은 클라이언트 상태를 들고 있어 **닫히거나 씻기면 ①~③의 입력이 통째로
사라진다**(POSTMORTEM 2026-09-08: 실패한 Publish 뒤 `router.refresh()`가 방금 만든 오류 문구를 씻고
로그인 화면으로 데려갔다 — 같은 형이다).

## 5. 영향받는 테스트

| 파일 | 무엇이 걸리나 | 어떻게 |
|---|---|---|
| `app/__tests__/entry-points.test.ts` | ① `USER_SCOPED_ACTIONS`에 없는 새 Action **둘**(`listRepoBranches`·`loadCandidateSample`)이 **red**. ② 정적 링크 검사는 **영향 없다**(`routes.newProject()`도 라우트도 그대로). ③ **쿼리 수신자 검사가 걸린다** — `/projects/new`의 `searchParams`가 `Raw<"e">` → `Raw<"e"｜"filter"｜"q">`로 넓어진다(§1.4). ④ matcher 검사는 그대로 | 목록에 이름 둘을 더하고 **왜 프로젝트 인가를 안 지나는지**를 주석으로 적는다(생성 경로 — 아직 프로젝트가 없다) |
| `app/(edit)/__tests__/shell-layout.test.ts` | `chain()`이 **페이지 + 모든 조상 레이아웃**에서 `<ContentPanel`을 세어 정확히 1을 요구한다. ⚠️ **`/projects/new`는 지금 `new/layout.tsx`가 든다** — 남긴 채 페이지에도 넣으면 **2가 되어 red** | **`new/layout.tsx`를 지우고** 래퍼를 페이지에 둔다(§1.1). 테스트는 고치지 않는다 — 고쳐야 한다면 배치가 틀린 것이다 |
| `components/__tests__/manual-format-hint.test.ts` | `m.newProject.files.manual.pathHint`의 키 집합을 어댑터 `layout`과 대조한다. ② 예외 E의 수동 지정 폼이 파일을 옮기면 그 소비자가 갈린다 | 갈래 둘을 **그대로** 옮기고 `satisfies Record<Adapter["layout"], …>`를 새 소비자에서 계속 건다 |
| `components/__tests__/multiline-detail.test.ts` | `text-mono`에 여러 줄 값이 오는 자리를 전수로 세고 `whitespace-pre-wrap`을 요구한다. ④의 `Details`가 파일을 옮기면 걸린다 | 옮긴 자리에 두 클래스를 **같은 태그에** 유지(POSTMORTEM 2026-09-08) |
| `components/__tests__/projects-screen.test.ts` | 목록 화면의 소스를 경로 리터럴로 읽는다. 본문을 `project-list.tsx`로 내리면 그 목록이 갈릴 수 있다 | 착수 전에 그 파일이 무엇을 세는지 확인하고, 경로 목록만 갱신한다(단언은 그대로) |
| `app/__tests__/screens.test.ts` | `components/onboarding/new-project-flow.tsx` **경로 리터럴**을 읽어 `failed === 0 ? "success" : "warning"`를 센다. 단계를 파일로 쪼개면 red | ④ 본문을 `components/onboarding/steps/result.tsx`로 옮기고 **테스트의 경로 목록을 그 파일로 갱신**한다. ⚠️ 지우지 말고 **바꾼다** |
| `components/__tests__/focus-ring.test.ts` | ⚠️ **규칙의 방향이 문서가 쓴 것과 반대다.** `RAW_TAG_ALLOWED`가 **빈 배열이고 "다시 채우지 않는다"**이며 `components/ui/`를 더 이상 제외하지 않는다 — 즉 요구는 "링을 리터럴로 적어라"가 아니라 **"`ui/` 밖에 raw `<button>/<input>/<select>/<textarea>`를 두지 않는다"**이고, 링 검사는 `ui/` 안 픽스처의 렌더된 `classList`로 한다 | 모달은 **기존 프리미티브를 쓴다**(`select`·`input`·`radio`·`button`·`segmented-control` 전부 실재). 프리미티브를 넓힐 때만 그 안에서 링을 본다 |
| `app/(edit)/__tests__/projects-query.test.tsx` | `/projects`를 렌더해 중복 `q`가 오류가 안 되는지 본다. 목록 본문이 내려가도 페이지 props가 같아 **그대로 통과** | `/projects/new`에도 케이스를 더한다: (a) `?e=`와 중복 `q`가 함께 온 경우 (b) **`q`·`filter`가 뒤 목록에 실제로 반영되는지**(§1.4). **T8의 검증 줄에 이 항목을 적는다** |
| `app/(edit)/__tests__/onboarding.test.ts` | `detectRepoFormats`·`createProject` 시그니처가 바뀐다. **"리더는 … default branch로 연다"**·**"baseBranch가 probe의 default branch다"** 두 단언의 의미가 바뀐다. ⚠️ `createInput()`의 반환이 인덱스 시그니처라 `baseBranch`를 **필수로** 넣는 순간 21개 호출부가 동시에 컴파일 에러다(수정은 한 줄) | "**사용자가 고른 브랜치**로 연다/저장한다"로 바꾸고 **default branch 폴백**·**슬래시 브랜치**(`release/2.0`)를 케이스로 남긴다. 새 Action 둘의 인가·실패 갈래를 새로 쓴다. ⚠️ **`revalidatePath`의 인자도 단언한다**(아래) |
| **`revalidatePath` 범위** | `createProject`는 `revalidatePath("/projects")`, `runFirstIngest`는 `"/projects/<slug>"`(layout) + `"/projects"`. **접두가 아니라 경로 하나**라 새로 생긴 "모달 뒤 목록"(`/projects/new`)을 **안 덮는다** | POSTMORTEM 2026-09-09가 요구하는 그 질문이다 — 두 Action에 `/projects/new`를 더하고, **`onboarding.test.ts`가 그 인자를 센다**(이미 그 관용구가 있다). §9의 "그대로 둔다"를 이렇게 정정한다 |
| `lib/onboarding/__tests__/detect.test.ts` | `summarizeCandidates` 반환 모양이 는다 | `samples` 단언 추가 — **추가 blob이 0인지**를 `probeTargets` 결과와 대조해 고정한다(예산이 조용히 늘지 않게). multi-locale이 전 언어를 드는 것도 별도 케이스 |
| `lib/i18n/__tests__/no-korean-ui.test.ts` | 새 문구가 소스 리터럴로 들어가면 red | §7의 문구를 전부 `messages/en.tsx`로 |
| `components/__tests__/client-graph.test.ts` | 모달이 `"use client"`다. `lib/adapters`·`lib/onboarding/detect`를 **값으로** import하면 ts-morph가 번들에 들어간다(POSTMORTEM 2026-09-07, 7.2MB) | `AdapterChoice`·`SampleRow`·`LocaleSample`은 **타입만**. 라벨·예시·글리프 갈래는 서버가 내려준다 |

**새로 쓰는 테스트**

- `lib/onboarding/__tests__/detect.test.ts` — `sampleRows`(순서 보존 · 상한 10 · 읽기 실패 시 빈 배열) ·
  `keyGap`(차이 0이면 `undefined`) · **`adapter.read` 호출 수 상한**(아래).
- `lib/__tests__/github-branches.test.ts` — `listBranches`(페이지 이어 붙이기 · 3페이지에서 끊기 ·
  `unavailable` · **슬래시 이름**). ⚠️ **`onboarding.test.ts`가 아니라 `lib/` 층이다** — 그래야 T3이
  T4 없이 단독으로 green하게 끊긴다(선례: `lib/__tests__/github-probe.test.ts`).
- `lib/onboarding/__tests__/branch.test.ts` — `planBranchChoice`(`Select`/`Input` 갈래, 기본 선택).
- **껍데기의 DOM 테스트**(`// @vitest-environment jsdom`) — **spec 완료 조건 4를 이 하나가 판정한다**:
  `Step n of 4`가 실제로 렌더된다 · 스텝퍼(`role="tablist"`·`role="list"` 꼴) **0개** · ①④에 [Back]이
  쿼리되지 않고 ④에 X는 있다 · `nextDisabled`가 껍데기에서 나온다 · **단계가 바뀌면 본문에 포커스가
  가고 live 영역에 제목이 쓰인다**(§1.2.1). ⚠️ **기본 환경은 `node`다** — 파일 머리에 선언한다.
  ⚠️ **소스 스캔으로 나누지 않는다** — `showBack` prop을 세는 것은 "그려 놓고 안 보이는" 경우를 못
  잡는다(spec §3-4의 판정 수단을 여기로 통일했다).

⚠️ **`adapter.read` 호출 수 상한을 왜 재는가.** §3.3의 "추가 blob 0"은 **다운로드**만 잰다.
`summarizeCandidates`는 지금 **기준 로케일 하나만** 푸는데 셋을 다 풀면 per-locale 후보 5개에서
파싱이 5 → **15회**다(`ts-dict` 후보면 ts-morph가 그만큼). `detect.ts`의 `PROBE_LIMITS` 주석이
*"비용이 아니라 **응답 시간**이다 — 페이지 `maxDuration`이 60초다"*라고 적고 있으므로, T1의 단언을
**"blob 0 + `read` 호출 수 상한"** 둘로 둔다.

## 6. 확정된 결정 열

| # | 결정 | 근거 |
|---|---|---|
| ① 브랜치 선택의 범위 | **`Select` + 신규 `listRepoBranches`** | 읽기 전용이면 base가 `develop`인 리포가 잘못된 트리로 후보를 고른 뒤 설정에서 고쳐야 하고, 그때 `pathTemplate`이 이미 저장돼 있다 |
| ② 주소 중복 판정 시점 | **제출 시(`createProject`) — `checkSlug`를 기각했다** | 원래 근거("다 채운 뒤 되돌아온다")가 **예외 I의 "③에 머문다"와 모순**이고, `requireUser`만 지나는 무제한 읽기가 전역 slug 열거 속도를 연다. **형식**은 `planSlug`를 클라이언트가 직접 불러 왕복 0으로 판정한다 — §3.5 |
| ③ 언어당 샘플 줄 수 | **10행 · 키 행만 스크롤** | 표본이 가장 크고, ②는 좌우 2단이라 **본문이 아니라 표가** 스크롤해야 축이 안 어긋난다(④의 `WorkflowBlock`과 같은 규칙) |
| ④ 세그먼트 언어 범위 | **후보의 전 언어 + lazy load** | 3개로 제한하면 "다섯 이상이면 `Select`로 접는다"가 도달 불가가 되고, ko가 없는 화면이 정상 상태가 된다 |
| ⑤ ①의 [Back] | **안 그린다**(`showBack=false`) | 그리면 같은 자리의 버튼이 ①에서만 "닫기"라 뜻이 둘이 된다. [Back]=앞 단계 / X·Esc·backdrop=닫기 |
| ⑥ `Select` 옵션의 키 수 | **받은 언어만** `en · 903 keys`, 나머지는 코드만 | 전 언어의 키 수는 로케일 파일 전부를 읽는 것이라 blob ≤21 밖이다. multi-locale은 한 파일이라 처음부터 전부 찬다 |
| ⑦ ③의 `Most keys`·키 수 비교 | **아는 언어에만 단다** — 모르는 언어는 배지도 문장도 없다 | ⑥의 따름정리다. 모르는 언어까지 비교하려면 ③ 진입 시 전 로케일을 한 번 더 읽어야 하고(≤21 밖 + `maxDuration` 압박), 그렇다고 아는 것만으로 "이 언어가 제일 많다"를 단언하면 **되돌릴 수 없는 결정의 근거가 "②에서 무엇을 눌렀는지"라는 우연한 이력**이 된다 |
| ⑧ 껍데기 폭 | **960** (좌측 후보 240 · 표 `1fr 2fr`) | 800이면 값 셀이 ≈188px라 24자에서 잘린다 — **§2-3이 든 문제("값이 한 줄도 안 보인다")를 고친 결과가 값의 앞 24자**가 된다. 셋을 합치면 ≈430px로 한 문장이 든다 |
| ⑨ 모달 껍데기의 구현 | **Radix `Dialog.*` 직접 조립** — `components/ui/dialog.tsx`를 안 쓴다 | 그 프리미티브로는 §8이 **만들어지지 않는다**(Overlay 고정 · padding 박힘 · 바닥 `justify-end` · X 하드코딩). 고치면 다른 모달 넷이 함께 움직인다 — §2.1 |
| ⑩ 적재의 생존 | **보장하지 않고 문구로 말한다** | 보장하려면 큐·재시도 정책이 따라온다. 복구 경로가 둘 다 이미 있다(`first-ingest-retry` · `rotatePushToken`) — §1.4 |

## 7. 문구 — 기존 키 재사용 / 새로 추가

### 그대로 쓰는 것 (변경 0)

`newProject.formats.*` · `newProject.imported` · `newProject.empty.*`(①의 막힘 셋) ·
`newProject.repo.{search,none}` · `newProject.files.{keys,manual.*}` · `newProject.baseLocale.hint` ·
`newProject.naming.{name,slug,hint}` · `newProject.result.token.*` ·
`newProject.result.ingest.{retry,couldNotRead,diagnostics,refsHint,open}` · `newProject.result.failed`.

### 없어지는 것

`newProject.repo.{title,pick,other}` · `newProject.back` · `newProject.files.title` ·
`newProject.baseLocale.title` · `newProject.naming.title` · `newProject.result.ingest.{title,running}` ·
`newProject.files.{summary,more}`(각각 `files.summaryShort`·`files.preview.more`가 대신한다)
— 제목이 모달 머리로 올라가고 [Next]가 확정 버튼을 대신한다.

⚠️ **`newProject.naming.create`는 남는다** — ③의 [Next] 라벨로 **재사용**한다(아래 표). 이 목록에
같이 들어 있던 것은 오기였다.

⚠️ **삭제는 T8 뒤다.** 이 키들의 소비자가 **전부 `new-project-flow.tsx`에 살아 있으므로**
(`repo.title`:209 · `repo.pick`:237 · `repo.other`:314 · `files.title`:318 · `baseLocale.title`:363 ·
`naming.title`:429 · `result.ingest.title`:498 · `.running`:500) T6 시점에 지우면 red다.
**T6은 추가만 하고**, 그 파일이 없어진 뒤 별도 단계에서 grep으로 0을 확인하고 지운다.
(`newProject.back`만 이미 죽은 키라 언제 지워도 된다.)

### 새로 추가 (README의 확정 문구)

| 키 | 문구 | 자리 |
|---|---|---|
| `newProject.modal.next` / `.back` / `.close` | `Next` / `Back` / `Close` | 껍데기 |
| `newProject.modal.step` | `(n) => Step ${n} of 4` | 바닥 왼쪽 |
| `newProject.steps.repo.title` | `New project` | ① 제목 |
| `newProject.steps.repo.description` | `Pick a repository and the branch malmoi should read.` | ① 설명 |
| `newProject.repo.pushedAt` | `(rel) => ${rel}` — 상대 시각은 순수 함수가 만든다 | ① 행 보조 줄 |
| `newProject.repo.branch` | `Branch` | ① 브랜치 라벨 |
| `newProject.repo.branchHelp` | `malmoi reads the locale files from this branch. You can change it later in project settings.` | ① 브랜치 설명 |
| `newProject.repo.branchDefault` | `Using the repository's default branch.` | 예외 D |
| `newProject.repo.branchTooMany` | `This repository has too many branches to list — type the branch name.` | truncated |
| `newProject.repo.notListed` | `Don't see a repository?` + 링크 `Add repositories to the installation` | ① 바닥 보조 |
| `newProject.repo.loading` | `Looking for repositories with the malmoi app installed…` | ① 로딩 |
| `newProject.steps.files.title` | `Which files hold your strings?` | ② 제목 |
| `newProject.steps.files.description` | `(n, repo, branch) => ${n} sets matched on ${repo} · ${branch}. Check the keys before you continue.` | ② 설명 |
| `newProject.steps.files.loading` | `(repo, branch) => Reading ${repo} · ${branch}…` | ② 로딩 설명 |
| `newProject.steps.files.emptyTitle` | `Where are your locale files?` | ② 예외 E 제목 |
| `newProject.files.summaryShort` | `(locales, keys) => ${locales} languages · ${keys}` | ② 좌측 보조 줄 |
| `newProject.files.notListed` | `Not listed?` + `Set the path yourself` | ② 좌측 아래 |
| `newProject.files.preview.key` / `.value` | `Key` / `Value` | 표 헤더 |
| `newProject.files.preview.more` | `(n) => ${n} more keys` | 표 바닥 총량 줄 |
| `newProject.files.preview.language` | `Language` | 세그먼트 `label` · `Select` 라벨 |
| `newProject.files.preview.option` | `(code, keys) => ${code} · ${keys}` — **키 수를 아는 언어만** | `Select` 옵션 |
| `newProject.files.preview.none` | `Nothing to preview yet` | ② 예외 E 우측 |
| `newProject.files.preview.unavailable` | `We couldn't read this file.` | 샘플 실패 |
| `newProject.steps.naming.title` | `Project details` | ③ 제목 |
| `newProject.steps.naming.description` | `The base language decides which keys exist. Name and address come from the repository.` | ③ 설명 |
| `newProject.naming.info` | `(path, branch) => Creating the project reads ${path} on ${branch} once. Nothing is written back to the repository.` | ③ info |
| `newProject.naming.mostKeys` | `Most keys` | ③ 배지 |
| `newProject.naming.keyGap` | `(lang, n, base) => ${lang} has ${n} keys fewer than ${base}. Those keys would be left out if ${lang} led.` | ③ 비교 info |
| `newProject.naming.slugTaken` | `(alt) => That address is already in use. Try another, such as ${alt}.` | ③ 예외 G. ⚠️ **`is free`라고 단언하지 않는다** — `suggestAlternateSlug`는 존재 확인을 안 한다(§3.5) |
| `newProject.naming.slugFormat` / `.slugEmpty` / `.slugTooLong` / `.slugReserved` | `planSlug`의 나머지 갈래 넷. `reserved`는 `That address is reserved.` (**`new`가 여기다**) | ③ 형식 오류 — 클라이언트 판정 |
| `newProject.naming.create` **(재사용)** | `Create project` | ③ [Next] 라벨 |
| `newProject.repo.searchEmpty` | `(q) => No repository matches "${q}".` + [Clear search] | ① 예외 B′ — **예외 B와 가른다** |
| `newProject.errors.sessionLost` | `Sign in again and come back — nothing has been created.` | 예외 J (전 단계) |
| `newProject.steps.result.title` | `malmoi is ready` | ④ 제목 |
| `newProject.steps.result.description` | 성공 시 `imported`(기존) + `Add the push token to the repository so CI can send translations back.` | ④ 설명 |
| `newProject.result.workflow.saveAs` | `Save as` + mono `.github/workflows/l10n.yml` | ④ 블록 상단 |
| `newProject.result.ingest.importing` | `(path, branch) => Importing… reading ${path} on ${branch}.` | ④ 적재 중 info |
| `newProject.result.ingest.failedHint` | `The project is in your list as Waiting for first import. You can retry from project settings.` | ④ 예외 H |
| `newProject.result.closeHint` | `You can close this — the project is already in your list. Importing may not finish, and you can retry it (and get a new token) from project settings.` | ④ help 줄. ⚠️ **적재 생존을 약속하지 않는다**(§1.4) |

⚠️ **`m.newProject.files.manual.pathHint`는 `satisfies Record<Adapter["layout"], …>`를 소비자가 건다.**
갈래 둘을 그대로 옮긴다 — 한 문장으로 접으면 903키 딕셔너리로 가는 **유일한 경로**에서 틀린 안내가 된다.

⚠️ **훅으로 읽는 리포**(코드 참조가 0이 되는 부류)는 ② 예외 E에서 `docs/ACTIONS.md`로 보내는 info
한 줄이 더 붙는다(README).

## 8. 표면 규칙 — README의 수치

⚠️ **여기 숫자는 전부 `design_handoff_new_project_modal/README.md`에서 온 것이고, 토큰의 진실은
`app/globals.css`의 `@theme`다.** 없는 토큰이 필요하면 거기 넣고 **DESIGN §6.2에 등재**한다.

### 8.0 raw 값 ↔ 기존 토큰 대조 (먼저 본다)

**아래 표의 왼쪽은 소스에 적지 않는다.** 대부분 이미 토큰이 있다 — "새 토큰이 넷 필요하다"는 초기
판단은 틀렸다.

| README의 raw | 실제 |
|---|---|
| `#e5e5e5` | `--color-border` → `border-border` |
| `#f5f5f5` | `--color-muted` → `bg-muted` |
| `#737373` | `--color-muted-foreground` |
| `#0a0a0a` · `rgba(10,10,10,x)` | `--color-foreground` → `bg-foreground/x` · `text-foreground/60` (DESIGN §2.2가 이미 처방했고 `table.tsx`가 쓴다) |
| `#fafafa` | `--color-primary-foreground` |
| **`shadow-medium`** | **이미 `@theme`에 있다 — 값까지 같다** |
| **`#f5f6f7`**(세그먼트 트랙) | **이미 `--color-canvas`다** |
| radius 16 · 12 · 10 · 8 | `rounded-xl` · `lg` · `md` · `sm` 전부 있다 |

**진짜 신규는 넷이고, 전부 DESIGN §6.2 등재 대상이다** (T7):

1. **`#f0f0f0`** — 바닥 `border-top` · ① 디바이더 · ③ 구분선. `border`(#e5e5e5)도
   `border-subtle`(#e9ecef)도 아니다. ⚠️ **넣기 전에 `border-subtle`이 그 자리를 대신하는지 먼저
   본다**(§6.2 절차) — 대신할 수 있으면 토큰을 안 늘린다.
2. **dim 알파** — `rgba(10,10,10,0.32)`. 기존 Dialog는 `bg-foreground/40`이라 **두 값이 갈린다.**
3. **`backdrop-filter: blur(6px)`** — 리포 전체에 `backdrop-*`가 **0건**이다. 새 시각 관용구라
   DESIGN에 절이 없다.
4. **스켈레톤 알파** — `rgba(10,10,10,0.07)`(보조 줄 `/0.05`). 기존 관용구는
   `projects/loading.tsx`의 `bg-foreground/5` 하나뿐이라 값이 둘로 는다.

### 껍데기

- 폭 `width:100%; max-width:960px`(결정 ⑧) · radius 16 · `background:#fff` · `shadow-medium` ·
  `overflow:hidden` · 세로 flex
- ⚠️ **높이는 dim의 padding을 뺀 값에 물린다.** README의 `min-height:80vh; max-height:100%`를
  그대로 쓰면 **`min-height`가 `max-height`를 이기고** dim에 `overflow`가 없어 **위아래가 대칭으로
  잘린다** — 1280×720에서 바닥의 [Back]·[Next]가 화면 밖으로 나간다(계보: malmoi#33 — 계산한 치수가
  실제 가용을 안 뺐다).

  | 뷰포트 높이 | `80vh` | 가용(dim padding 80×2를 뺀 값) | README 그대로면 |
  |---|---|---|---|
  | 900 | 720 | 740 | OK |
  | 768 | 614 | 608 | **6px 넘침** |
  | 720 | 576 | 560 | **16px 넘침** |

  → `min-h-[min(80svh,calc(100svh-96px))] max-h-[calc(100svh-96px)]` 꼴로 **서로 물리게** 쓰고 dim의
  padding을 48로 줄인다. 껍데기가 `overflow:hidden`을 유지하려면 **본문 열이
  `min-h-0 flex-1 overflow-y-auto`를 반드시 든다**(`shell-layout.test.ts`가 `PanelBody`에 대해 세는
  것과 같은 짝).
- ⚠️ **`vh`가 아니라 `svh`다.** 셸이 `h-svh overflow-hidden`이고 `shell-layout.test.ts`가 `min-h-svh`를
  금지하며 `h-svh`를 요구한다 — 리포 관용구가 `svh`인데 §8만 `vh`면 모바일 주소창 높이에서 혼자
  어긋난다.
- dim `position:fixed; inset:0; background:<신규 dim 토큰>; backdrop-filter:blur(6px)` ·
  `align-items:center; justify-content:center; padding:48px`
- 머리 `padding:32px 32px 20px` · `align-items:flex-start` · gap 8 · 제목 20/500/0.005em +
  설명 14/20 `#737373`(`text-wrap:pretty`) · 닫기 36×36 원형 ghost(글리프 `x` 20, hover `rgba(10,10,10,0.03)`)
- 본문 `min-height:0; flex:1; padding:0 32px 24px; gap:16`
- 바닥 `padding:24px 32px; border-top:1px solid #f0f0f0` · 왼쪽 `Step n of 4`(13/`#737373`) ·
  오른쪽 [Back](40 · radius 12 · `#fff` · border `#e5e5e5` · 글자 `#737373`) +
  [Next](40 · radius 12 · `#171717`/`#fafafa` · 글리프 `arrow-right`)
- `nextDisabled` → `#fff` + border `#e5e5e5` + 글자 `#737373` + `cursor:not-allowed`

### ⚠️ `components/ui/dialog.tsx`를 **쓰지도 고치지도** 않는다

그 프리미티브는 `max-w-lg` · radius `lg` · 오버레이 `bg-foreground/40` · `shadow-lg`이고 **초대·확인·
아카이브·로그인수단 모달 넷이 그것을 공유한다.** 처음에는 "`DialogContent`를 `className`으로 덮는
래퍼"로 적었는데 **그게 성립하지 않는다** — 막히는 네 자리는 §2.1의 표에 있다. → **Radix `Dialog.*`를
직접 조립한다**(결정 ⑨). 프리미티브를 안 쓰고 안 고치므로 "다른 화면이 함께 움직이지 않는다"는 목적이
그대로 달성된다.

### ⚠️ 나머지 프리미티브는 **쓰고, 필요한 만큼만 넓힌다**

`dialog.tsx`에 건 질문("다른 화면이 함께 움직이나")을 나머지에도 똑같이 건다.

| 프리미티브 | 판정 |
|---|---|
| `select` · `input` · `radio` · `button` | **그대로 쓴다.** §8의 36/radius 10이 현재 프리미티브와 어긋나면 **§8을 프리미티브에 맞춘다** — 모달만 다른 폼이 되면 안 되고, 프리미티브를 옮기면 다른 화면이 함께 움직인다 |
| **`segmented-control`** | ⚠️ **실재하고 DESIGN §6.4가 §8과 정확히 같은 수치를 이미 못 박았다**(트랙 `bg-canvas rounded-lg p-1` / 칸 `rounded-md px-2 py-1` / 선택 `bg-background shadow-low font-medium`). **새로 만들지 않는다** — role(`radiogroup`)·Home/End 키보드까지 딸려 온다. **단 `SegmentContent = { label, icon?, badge? }`라 국기가 안 들어간다** → `leading?: ReactNode` 하나를 넓힌다(국기는 인라인 `style`의 `background-image`지 컴포넌트가 아니다) |
| **`empty-state`** | `className` prop이 **없어** §8의 칩 48·제목 18/500·설명 46ch를 호출부에서 못 넣는다 → `className`을 넓힌다 |
| **`skeleton`** | **프리미티브가 아예 없다.** 관용구는 `projects/loading.tsx`의 `bg-foreground/5` 하나뿐이고 §8이 알파를 둘로 늘린다 → **신설한다**(T7). `components/ui/` 안이라 `focus-ring.test.ts`의 "`ui/` 밖에 raw 태그를 두지 않는다"와 같은 방향이다 |
| `nextDisabled`의 모양 | `Button`에 variant별 disabled 색이 없어 "흰 배경 + border + muted 글자"가 **새 표면**이다. **모달 안에서만** 만들고 프리미티브에 얹지 않는다 — 다른 화면의 비활성 버튼을 함께 바꾸지 않는다 |

⚠️ **`Button` size `lg`(h-10/40)에 "셸 밖 카드 전용"이라는 주석이 붙어 있다.** §8의 바닥 버튼 40이
그 주석과 충돌하므로, 쓰기 전에 그 주석의 근거를 보고 **모달을 그 예외에 넣을지 40을 포기할지**를
정한다(T7).

### 단계별

| 자리 | 규칙 |
|---|---|
| ① 검색 | 높이 36 · radius 10 · border `#e5e5e5` · 글리프 `search` 16(left 10) · `padding:0 10px 0 32px` |
| ① 목록 | **하나의 테두리**(`border:1px solid #e5e5e5; border-radius:10px; overflow:hidden`) 안에 디바이더로만 갈린다 — **카드 사이 gap 없음.** 첫 줄 `#e5e5e5`, 나머지 `#f0f0f0` |
| ① 행 | `padding:12px` gap 12 — 라디오 16(선택 시 border `#0a0a0a` + 점 8) + 글리프 칩 40×40 radius 10 `background:#f5f5f5` 글리프 `folder-git-2` 20 `#737373` + 이름 15/500 + 보조 14/`#737373` |
| ① 선택 행 | `background:#f5f5f5` · **글리프 칩만 `#fff`로 뒤집는다** · 보조 줄 글자 `rgba(10,10,10,0.6)`. 비선택 hover `rgba(10,10,10,0.03)` |
| ① 브랜치 줄 | 같은 muted 면 위 `border-top:1px solid #e5e5e5` · `padding:12px 12px 12px 80px`(글리프 열을 비켜 **이름 아래 정렬**) · 라벨 14/500 + `git-branch` 14 · `Select` 220×36 · 설명 13/`rgba(10,10,10,0.6)` |
| ② 좌측 | **240px 고정**(결정 ⑧ — README의 300에서 줄인다). ①과 같은 행 형, 이름이 경로, 보조가 `3 languages · 903 keys`. 글리프가 파일 종류로 갈린다(`file-json-2` / `file-code-2`) |
| ② 우측 | `border:1px solid #e5e5e5; border-radius:12px; overflow:hidden` 세로 flex. 툴바 `padding:8px; border-bottom` (세그먼트 + 오른쪽 끝 파일명 13/`#737373`) · 헤더 `background:rgba(10,10,10,0.02); padding:8px 16px` 13/`rgba(10,10,10,0.6)` 2열 **`1fr 2fr`** gap 12 · 키 행 `padding:12px 16px` 14/0.02em(키 `#737373` / 값 `#0a0a0a`, 셀마다 `nowrap` + ellipsis) |
| ② 스크롤 | **툴바·헤더 고정, 키 행만 y 스크롤.** 총량 줄은 `border-top` 위 **스크롤 밖**. ⚠️ **그 컨테이너에 포커서블이 하나도 없다**(읽기 전용 텍스트) — `tabIndex={0}` + 접근 이름을 주지 않으면 **키보드로 스크롤할 수 없다**(④의 `WorkflowBlock`은 [Copy]가 있어 이 문제가 없다) |
| ② 세그먼트 | 트랙 `background:#f5f6f7` radius 12 padding 4 / 칸 radius 10 `padding:4px 8px` / 선택 칸 `#fff` + `shadow-low` + 500. 각 칸에 국기 16×11 radius 2 + 코드 |
| ③ info | `border:1px solid #e5e5e5; background:rgba(245,245,245,0.4); radius 12; padding:16` · 글리프 `info` 16 `mt-0.5` `#737373` · 본문 14/20 |
| ③ 필드 | 36 · radius 10 · border `#e5e5e5` · `padding:0 10px`. 라벨 14/500. help 13/1.7 |
| ③ 구분선 | `height:1px; background:#f0f0f0; margin:8px 0` |
| ③ 기준 언어 | ①과 같은 행 형, 글리프 칩 자리에 국기. 행 = 언어 이름 15/500 + 보조 `src/i18n/en.json · 903 keys`. ⚠️ **키 수와 `Most keys` 배지는 아는 언어에만**(결정 ⑦) |
| 국기 | ⚠️ **`flagFor(code)`는 매핑 없는 코드에 `null`을 낸다**(`lib/keys/flag.ts`). DESIGN이 *"매핑은 원리적으로 실패한다 … 답은 아무것도 안 그린다"*로 못 박았으므로 **`null`이면 그 자리를 비우고 행이 구멍 없이 서야 한다**(자리를 차지하되 아무것도 안 그리거나, 국기 열 자체를 접는다 — 행마다 정렬이 어긋나면 안 된다). ⚠️ **치수는 기존 16×11을 쓴다** — DESIGN이 그 값에 "이 값을 다른 곳에 번지게 하지 않는다"를 걸어 두었으므로 24×17이라는 **두 번째 예외를 만들지 않는다**(README와 어긋나면 T9가 §6.2에 등재를 남긴다) |
| ④ 토큰 | 값 칩 36 · radius 10 · `background:#f5f5f5` · border `#e5e5e5` · mono 13 · truncate + [Copy] 36 `default` |
| ④ 워크플로 | 상단 줄 `align-items:baseline; justify-content:space-between` + [Copy] 28(sm). 블록은 `WorkflowBlock` 형 — `<pre>` + `#f5f5f5` + radius 10 + `padding:12` + mono 13/18 + **border 없음** + `min-height:0; flex:1; overflow:auto`(**블록 자신이 스크롤**) |
| 스켈레톤 | 바 `rgba(10,10,10,0.07)`(보조 줄 `rgba(10,10,10,0.05)`) · radius 6 · 높이 14~15. ②의 세그먼트는 트랙 자리(150×36 `#f5f6f7`)만 |
| `EmptyState` | 칩 48 `rgba(10,10,10,0.05)` 안 글리프 16 · 제목 18/500 · 설명 한 문장 46ch · 액션 하나 |

### 공통

- **리포·파일 글리프에 톤 색을 주지 않는다** — 아직 프로젝트가 아니라 후보다(`/projects` 목록의
  `toneFill(row.name)`과 **반대**다).
- **회색 면 위 글자는 `rgba(10,10,10,0.6)`** — muted 면에서 `muted-foreground`는 4.34:1로 AA 미달.
- **mono는 사람이 그대로 옮겨 적는 값에만**: 푸시 토큰 · 워크플로 YAML · 워크플로 파일명 ·
  경로 힌트의 `{locale}` · ④의 못 읽은 파일 경로. ⚠️ **리포명·후보 경로·키 이름은 sans다** —
  지금 `RepoPicker`의 `text-mono`와 후보 행의 `pathTemplate` mono가 여기서 바뀐다(DESIGN §6.7의
  "`owner/name`은 **mono**" 줄도 함께 — tasks T9).
- 아이콘은 lucide 16 `stroke-width 2`. **다중 요소 아이콘에 색 알파를 쓰지 않는다** — 획 접점에서
  알파가 누적된다. 연하게 할 일은 요소 `opacity`.
- ⚠️ **포커스 링은 "리터럴로 적는다"가 아니라 "`ui/` 밖에 raw 태그를 두지 않는다"다.**
  `focus-ring.test.ts`의 `RAW_TAG_ALLOWED`가 **빈 배열이고 "다시 채우지 않는다"**이며 `components/ui/`를
  더 이상 제외하지 않는다 — 링 검사는 `ui/` 안 픽스처의 렌더된 `classList`로 한다. 모달이 할 일은
  **기존 프리미티브를 쓰는 것**이고, 프리미티브를 넓힐 때만 그 안에서 링을 본다.
- **`dark:`를 한 곳도 쓰지 않는다** (라이트 단일).

### 값을 지어내지 않는다 (④)

- YAML은 `renderWorkflowYaml`의 **실제 출력**이다. 정본은 `docs/ACTIONS.md`의 첫 YAML 블록이고
  `lib/onboarding/__tests__/workflow.test.ts`가 그 문서를 읽어 줄 단위로 대조한다. 수동 지정이면
  `adapter:`·`base-locale:` 두 줄이 더 붙는다.
- secret 이름은 `PUSH_TOKEN`. 주소는 `mal-moi.com/projects/<slug>`. 돌아오는 브랜치는
  `l10n/sync-<slug>`(정본은 `syncBranchFor`). `on.push.branches`는 §3.6에서 저장한 브랜치다.

## 9. POSTMORTEM에서 소환한 함정

| 날짜 | 항목 | 이 설계에서 |
|---|---|---|
| 2026-09-06 | 실패 사유를 쿼리로 넘기고 읽는 쪽을 안 만들어 거부가 무음이었다 | §1.3 — `?e=`를 **두 union**으로 읽고 모달을 연 채 배너를 든다 |
| 2026-09-07 | 클라이언트 번들에 7.2MB(`lib/adapters` 값 import) | §5 — 타입만 import. 라벨·글리프 갈래는 서버가 만든다 |
| 2026-09-07 | 포커스 링 스캐너가 `button\|input`만 봐서 온보딩의 `<select>`가 **운으로** 통과했다 | §8 — 새 `<select>` 둘(브랜치·언어)에 링을 리터럴로. 운에 기대지 않는다 |
| 2026-09-07 | `revalidatePath`가 방금 받은 적재 결과 문구를 씻어냈다 | ④의 결과는 **클라이언트 상태**다. 서버 재렌더가 언마운트하지 않는 자리에 둔다 |
| 2026-09-05 | 검증한 값을 저장하지 않으면 검증이 장식이다 | §3.4 — 샘플 Action이 `planConfirmedFormat`을 지나고 트리와 교차한 경로만 읽는다 |
| 2026-09-09 | **검증이 탐지 경로에만 있고 적재 경로에 없어 페이로드가 리포 경로를 정했다** | §3.4 — **`templatePaths`(탐지 헬퍼)로 대신하지 않고** ARCHITECTURE §3.1이 지정한 `planConfirmedFormat`을 부른다. `locale`은 `isPathSafeLocale`, `ref`는 세 진입점 전부 `isValidBranchName` |
| 2026-09-01 | **라이브러리가 이미 하는 인코딩을 또 해서 조용한 404였다** | §3.2 — `release/2.0` 같은 슬래시 브랜치를 octokit에 **맨값으로** 넘긴다. T3·T5가 그 케이스를 단언으로 고정한다 |
| 2026-09-08 | 실패한 Publish 뒤 `router.refresh()`가 방금 만든 오류 문구를 씻고 로그인으로 데려갔다 | §4 예외 J — 세션 만료·인가 거부에서 **모달을 닫지도 `refresh`를 부르지도 않고 그 단계에 머문다** |
| 2026-09-08 | 도달 불가한 갈래를 겨냥한 테스트가 1년치 green이었다 | §2.3 — ①의 로딩을 Suspense로 **실제로 도달하게** 만든다. 안 그러면 그 상태도 그 문구 키도 죽은 코드다 |
| 2026-09-09 (sec-audit 5) | 인가가 App 자격증명보다 뒤여서 **존재 오라클**이 됐다 | §3.2 — `checkRepoAccess`를 **그대로** 지난다. 갈래를 새로 나누지 않는다 |
| 2026-09-09 | 화면을 라우트 밖으로 옮겼는데 무효화 경로가 안 따라갔다 | ⚠️ **"그대로 둔다"가 오판이었다.** 둘 다 **접두가 아니라 경로 하나**라 새로 생긴 "모달 뒤 목록"(`/projects/new`)을 안 덮는다 → 두 Action에 그 경로를 더하고 **`onboarding.test.ts`가 인자를 센다**(§5) |
| 2026-09-08 | 접어 둔 진단이 개행을 잃었다 | ④의 `Details` 안은 계속 `text-mono whitespace-pre-wrap` |
| 2026-09-09 | "사용자가 X를 골랐다"를 근거로 상태를 지우는 코드 | ①의 브랜치 기본값·③의 이름/주소는 **제안**이고 지우는 선행 상태가 없다. ⚠️ **단 `baseLocale`은 다르다** — [Back]으로 ②에 돌아가 **다른 후보를 고르면 그 값이 무효**가 되므로 지워야 하고, 그것은 2026-09-09가 면제한 셋에 **없다**. 후보 변경을 `baseLocale`·`name`·`slug`의 무효화 경계로 명시한다(§3.4의 캐시 경계와 같은 자리) |
| 2026-09-03 | 실패한 조회를 "없음"으로 읽었다 | §3.2 — 브랜치 조회 실패는 "브랜치가 없다"가 아니라 default branch 폴백 + 그 사실을 말하는 캡션 |

## 10. 순수 함수로 분리 가능한 부분 (`/tdd` 진입점)

| 함수 | 위치 | 계약 |
|---|---|---|
| `sampleRows(adapter, format, locale, blobs, limit)` | `lib/onboarding/detect.ts` | blob 맵 → 앞 N개 `{key,value}` + `total`. 순서 보존 · 읽기 실패 시 `[]` |
| `summarizeCandidates(...)` 확장 | 같음 | `samples`가 `sampleOrder`의 로케일만(추가 blob 0). multi-locale은 전 언어 |
| `SAMPLE_ROWS = 10` | 같음 | 상수 하나. 화면은 `total - rows.length`로 "N more keys"를 만든다 |
| `planBranchChoice({ names, defaultBranch, truncated })` | `lib/onboarding/branch.ts` (신규) | `Select`/`Input` 갈래와 기본 선택. I/O 없음 |
| `suggestAlternateSlug(slug)` | `lib/onboarding/slug.ts` | 대안 하나. **존재 확인 없음**. `planSlug` 통과값만 — 그래서 문구가 `such as`이지 `is free`가 아니다(§3.5) |
| `keyGap(base, other)` | `lib/onboarding/detect.ts` | ③의 "145 keys fewer" 계산. 차이가 0이면 `undefined`(문장을 안 만든다). ⚠️ **키 수를 모르는 로케일에도 `undefined`** — 결정 ⑦ |
| ~~`relativeTime`~~ | **만들지 않는다** | ⚠️ **`lib/relative-time.ts`에 이미 있다**(`(then: Date, now: Date)`, 잎, 소비자 다섯). `now`를 인자로 받는 이유까지 그 파일 주석이 적고 있다 — §3.1 |
| `nextEnabled(step, state)` | **`lib/onboarding/next-enabled.ts`** | §4 표를 코드로 — 껍데기가 [Next]를 그릴 때 부른다. ⚠️ **`lib/` 아래 잎에 둔다** — `components/` 아래면 `"use client"` 그래프에 들어가고, 그러면 `AdapterChoice`·`SampleRow`를 **타입으로만** 물어야 한다는 제약이 이 모듈까지 따라온다(`client-graph.test.ts`). T9의 DIRECTORY 목록에 넣는다 |

**여기가 비면 설계를 다시 본다** — I/O와 로직이 엉킨 설계는 테스트가 불가능하다.
