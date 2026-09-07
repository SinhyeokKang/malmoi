# translation-ui — 설계

> 착수 전 읽은 것: SAAS §3·§4·§5.2·§7.6·§7.7·§8 6단계·§9 · ARCHITECTURE §6.1·§6.3·§6.35 · DESIGN 전문(재작성 전) ·
> POSTMORTEM 8건(§8에 인용) · `features/project-onboarding/design.md` §2·§3.4·§3.7 · 현재 UI 전수 인벤토리(§1.1).
> 화면 구성은 [user-stories.md](./user-stories.md), 시각 값은 [DESIGN.md](../../DESIGN.md)다 — 이 문서는 **왜 그렇게
> 만드는가**와 **어디를 순수 함수로 떼는가**만 다룬다.

## 1. 영향 받는 흐름

| 흐름 | 무엇이 바뀌나 |
|---|---|
| **편집 UI** | 전부. 라우트 6 → 8(`/projects/:slug/members`·`/account` 신설), 셸이 헤더 → 사이드바, 컨트롤이 hand-rolled → 프리미티브, 문자열이 한국어 하드코딩 → `messages/en.json` |
| **pull** | `PullResult.committed`에 `pr: "created" \| "updated"`가 붙고, 성공 시 `Project.lastPublishedAt`·`lastPrUrl`을 쓴다 (§3.4). 파일 내용·blob SHA·커밋 전략은 **한 줄도 안 바뀐다** |
| **push** | `applyPush`의 번역 upsert가 `ON CONFLICT`에서 **`"updatedBy" = NULL`** 을 함께 쓴다 (§3.6). 값·키·orphaned 판정은 그대로 |

**어댑터(`lib/adapters/**`)는 오류 `message`를 코드로 바꾸는 것 하나만 건드린다** (§3.1.4 — 2026-09-07 사용자 결정). read·write의
**출력 바이트는 한 줄도 안 바뀌지만** 파일이 바뀌므로 재측정 트리거다 — `pnpm adapter-survey`를 학습·홀드아웃 둘 다 돌려 ADAPTER-COVERAGE에
회차를 더한다(전 지표가 13차와 같아야 한다).

### 1.1 인벤토리 (2026-09-07 전수)

- 사용자 문자열 **약 150개** — JSX 인라인 ~103 + 문구 모듈 ~47 (`lib/auth/message.ts` 17 · `lib/github-connect/message.ts` 13 ·
  `lib/onboarding/message.ts` 15+2 · `lib/pull/message.ts` 5 · `lib/onboarding/readiness.ts` 2 · `lib/onboarding/detect.ts`의
  `formatLabel` 5).
- 그 밖에 화면에 닿는 것: **어댑터 read/write 오류 `message`**(~40, `new-project-flow.tsx`가 `{path} — {message}`로 그대로 낸다) ·
  `lib/pull/**`·`lib/push/**`·`lib/github.ts`의 `fail()` 문구(`classifyFailure`가 `safe`로 통과시켜 "Publish failed: …"에 실린다) ·
  `lib/onboarding/workflow.ts`가 만드는 YAML 안의 **한국어 주석 둘**(사용자 리포에 복사된다) · `app/layout.tsx`의 `lang="ko"`.
- 문장이 JSX 노드 3~7개로 **쪼개진 곳** 여섯(`workflow-block` · `new-project-flow` 396·445~448·482~483 · `projects/new/page` 100 ·
  `push-token-panel` 26~27) — 인라인 `<code>`·`<strong>`이 문장 가운데 있다. 키→문자열만으로는 안 되고 §3.1.3의 `rich`가 필요하다.
- 카운터가 접미로 붙는 곳(`{n}키`·`언어 {n}개`·`${pending}/${total}`)과 영어 토큰이 그대로 새는 폴백 셋(`저장 실패: ${error}` 등).
- `components/ui/`(shadcn 생성물 4개)는 **import 0곳**. `sonner`·`lucide-react` 사용 0곳.
- `lib/survey/one.ts:171-194`가 **어댑터 한국어 오류 문구를 부분 문자열로 분류한다** — 어댑터 문구를 바꾸면 지표 분류기가 조용히 깨진다.

## 2. 정보 구조

```
/                              로그인 (셸 밖)
/invite/:token                 초대 수락 (셸 밖, matcher 밖)
(edit) 셸 ─ 사이드바 + breadcrumb
  /projects                    목록           컨텍스트 없음
  /projects/new                생성           컨텍스트 없음
  /account                     계정 (신설)    컨텍스트 없음
  /projects/:slug/translations 번역           프로젝트 컨텍스트 ─ Translations · Members* · Settings*   (* OWNER만 렌더)
  /projects/:slug/members      멤버 (신설)
  /projects/:slug/settings     설정
```

사이드바가 **프로젝트 컨텍스트**를 알아야 하는데 `(edit)/layout.tsx`는 `[slug]` params를 받지 못한다. 중첩 레이아웃
(`projects/[slug]/layout.tsx`)에 사이드바를 나누면 바깥 레이아웃의 사이드바 슬롯에 안쪽이 끼어들 수 없다. 그래서:

- **레이아웃(서버)** 이 내 멤버십 목록(`{slug, name, role}[]`) 한 번을 읽어 `<Sidebar memberships>`에 넘긴다 — `/projects`가 이미
  하는 조회와 같고 사용자당 3개 제한이라 가볍다.
- **`Sidebar`는 클라이언트 컴포넌트**다. `usePathname()`으로 현 slug를 뽑아 멤버십 목록에서 이름·역할을 찾고, Members·Settings
  노출을 그 역할로 정한다. **이 노출은 편의다** — 방어는 각 페이지의 `requireProjectAccess`이고 URL 직접 진입은 `not-found`다.
- **breadcrumb은 페이지가 그린다** (`<Breadcrumb items>`) — 페이지가 자기 이름을 안다. 레이아웃이 pathname을 해석해 만들면 이름
  표가 두 벌이 된다.
- 접힘 상태는 `localStorage`뿐이다. 서버에 저장하지 않는다.

## 3. 설계 결정

### 3.1 i18n — 사전 한 벌, 라이브러리 없음, 잎 모듈

**`next-intl`을 넣지 않는다.** 그 라이브러리의 값은 로케일 라우팅·미들웨어·`Accept-Language` 협상인데, 우리는 (a) en 단일이고
(b) 미들웨어가 "쿠키 이름만 보는 값싼 차단"이어야 한다(ARCHITECTURE §6.1) — 거기에 로케일 판정을 끼우면 그 성질이 깨진다.
필요한 것은 **문자열의 단일 출처**와 **나중에 ko를 더할 자리**이고, 그건 JSON 하나와 함수 둘로 된다.

#### 3.1.1 구조

```
messages/en.json          단일 출처. 화면별 중첩 객체 — { "common": {...}, "signIn": {...}, "projects": {...}, "translations": {...}, ... }
lib/i18n/index.ts         export const m = en  (typeof en — 키 오타가 컴파일 에러) · export type Messages
lib/i18n/format.ts        fmt(template, vars)  — "{count} keys" 보간. 순수
lib/i18n/plural.ts        plural(n, { one, other }) — fmt 위에 얹은 두 갈래. ICU 아님 (MVP §7). 순수
lib/i18n/rich.tsx         rich(template, { path: <code/> }) — 문장 가운데 노드 삽입. 반환은 ReactNode[]. 순수(React 렌더 없음)
```

- `messages/en.json`은 **`json-catalog` 어댑터가 읽는 모양**(`{dir}/{locale}.json`, 중첩)이다. 의도된 것이다 — ko가 생기는 날
  이 리포를 말모이 자신의 프로젝트로 붙일 수 있다(SAAS §8 8단계 포트폴리오 항목). 지금 그렇게 하지는 않는다(로케일이 하나라
  탐지 규칙 "2개 이상"에 걸린다).
- `resolveJsonModule`이 켜져 있어 `import en from "@/messages/en.json"`이 리터럴 키 타입을 준다. `m.translations.publish` 같은
  접근이 곧 타입 검사다 — 문자열 키 `t("translations.publish")`를 파싱하는 템플릿 리터럴 타입을 만들지 않는다(가치 대비 복잡하다).
- **`lib/i18n/`은 잎 모듈이다** — `@/lib/**`를 하나도 import하지 않는다. 클라이언트 컴포넌트가 읽으므로 그 그래프가 곧 번들이다
  (ARCHITECTURE §6.35). `client-graph.test.ts`가 상시로 센다.
- **ko를 더할 때 바뀌는 곳은 `lib/i18n/index.ts` 하나다** — `m`을 상수에서 `getMessages(locale)`(서버) + `<MessagesProvider>`(클라이언트)로
  바꾼다. 컴포넌트는 전부 `@/lib/i18n`에서 `m`을 받으므로 import 자리는 바뀌지 않는다. **어떻게 locale을 고르는지는 지금 정하지
  않는다** (spec §5).
- `app/layout.tsx`의 `lang`은 `"en"`이다.

#### 3.1.2 문구 모듈 넷은 switch → `satisfies Record<Union, string>`

```ts
// lib/auth/message.ts
const ACCESS: Record<AccessError, string> = m.errors.access satisfies Record<AccessError, string>;
export const accessErrorMessage = (e: AccessError) => ACCESS[e];
```

갈래가 늘면 JSON에 키가 없어 **컴파일 에러**다 — 지금의 `never` 검사와 같은 힘이고 코드는 줄어든다. `pullMessage`처럼 **문구 외에
`tone`·`href`를 고르는 것**은 switch로 남고 문구만 `m`에서 꺼낸다.

폴백이 있는 둘(`inviteErrorMessage`·`signInErrorMessage` — `?e=`가 사용자 편집 가능해 던지지 않는다)은 `isInviteError(e) ? INVITE[e] : m.errors.invite.fallback`이다.

#### 3.1.3 쪼개진 문장 — `rich`

```tsx
{rich(m.workflow.saveAs, { path: <code className="text-mono">.github/workflows/l10n.yml</code> })}
// en.json: "saveAs": "Save this in your repository as {path}."
```

`rich`는 `{name}` 토큰으로 문장을 갈라 문자열과 노드를 번갈아 낸다. 번역자가 문장 순서를 바꿔도 노드가 따라간다 — 지금처럼
JSX 노드 다섯으로 쪼개면 ko 사전이 **어순을 바꿀 수 없다**. 순수 함수라 노드 대신 문자열을 넣어 테스트한다.

#### 3.1.4 무엇이 사전에 들어가고 무엇이 아닌가 — 경계 넷

| 부류 | 어디로 | 왜 |
|---|---|---|
| **화면 문구** (라벨·제목·빈 상태·거부 사유·상태 문구·placeholder·`aria-label`) | `messages/en.json` | 사용자가 읽는다. ko의 대상이다 |
| **진단 문구** — `fail()`·`throw`의 메시지 (`lib/pull/**`·`lib/push/**`·`lib/github.ts`·`lib/auth/profile.ts`·`lib/env.ts`·`lib/github-connect/state.ts`) | **영어 리터럴로 고쳐 코드에 남긴다.** 사전 밖 | 개발자·로그·Actions 로그가 읽는다. 커밋 메시지와 같은 부류다. `classifyFailure`가 `safe`로 통과시켜 "Publish failed: …"에 실리므로 **한국어로 남으면 en UI에 한글이 샌다** — 그래서 영어로는 바꾸되 사전에는 넣지 않는다(ko로 번역할 대상이 아니다) |
| **어댑터 오류** (`lib/adapters/**`의 `AdapterError.message`, ~39곳) | **코드로 리팩터한다** — `AdapterError = { path, code: AdapterErrorCode, detail?: string }`. 문장은 사전(`m.adapterErrors[code]`)이 낸다 | 사용자 결정(2026-09-07). 화면(온보딩 부분 실패·Publish warnings)에 닿는 값이 자유 문자열이면 en으로 바꿔도 사전 밖이라 ko가 못 따라온다. `lib/survey/one.ts`의 `classify(message)`(부분 문자열 분류)는 `classify(code)`가 된다 — 분류기가 문구 대신 코드를 보므로 **더 튼튼해진다**. `detail`(파서 원문 등)은 진단이라 사전 밖이고 `<details>`에만 |
| **survey·scan CLI 출력** (`lib/survey/summarize.ts`·`one.ts`의 표 문구, `lib/scan/**` 경고) | **그대로 둔다** (한국어) | 웹 UI가 아니다 — `pnpm adapter-survey`·`pnpm scan`의 터미널 출력이다. `no-korean-ui` 스캔에서 제외 |
| **워크플로 YAML 주석** (`lib/onboarding/workflow.ts`) | 영어로. `docs/ACTIONS.md`와 **같은 커밋** | 사용자 리포에 복사된다. `workflow.test.ts`가 ACTIONS.md와 줄 대조하므로 문서가 함께 바뀌어야 green이다 |

#### 3.1.5 상시 방어선 — `lib/i18n/__tests__/no-korean-ui.test.ts`

`app/`·`components/`·`lib/`(아래 제외)의 `.ts`·`.tsx`에서 **주석을 벗긴 뒤** `[가-힣]`가 0자인지 센다. 제외: `__tests__`,
`lib/survey/**`, `lib/scan/**`(§3.1.4 넷째 줄). **`lib/adapters/**`는 포함한다** — 오류가 코드가 되면 거기 남는 한글은 주석뿐이어야 한다. 주석 제거는 `//`·`/* */`·JSX `{/* */}` 셋이고, **메타 테스트가
셋을 하나씩 먹여 스캐너가 각각을 벗기는지, 그리고 코드 안의 한글 리터럴을 실제로 잡는지 본다** (POSTMORTEM 2026-09-07 "좁은
검사는 자기 좁음을 신고할 수 없다"). 주석은 CLAUDE.md대로 한국어라 이 벗기기가 없으면 검사가 성립하지 않는다.

### 3.2 프리미티브 — `components/ui/`를 이 리포가 소유한다

shadcn 생성물 4개(`badge`·`button`·`input`·`select`)를 지우고 **같은 디렉터리에 손으로 쓴 프리미티브**를 둔다. shadcn CLI를 다시
돌리지 않는다 — 생성물을 고치면 CLI 재실행이 덮는다(그래서 동결이 있었다). 색은 **기존 토큰**이다(DESIGN §2 — GitLab에서 가져오는 것은 배치이고 색이 아니다). `components.json`은
남겨 두되 spec §5가 삭제 판정을 미룬다.

| 프리미티브 | Radix | 비고 |
|---|---|---|
| `Button` | — | `cva` variants `primary`·`default`·`danger`·`ghost`·`link`, sizes `md`(`h-8`, 기본)·`sm`(`h-7`). 색은 옛 §6.4 표의 클래스 그대로(DESIGN §6.4). `loading` prop이 **라벨 교체**를 든다 |
| `Input`·`Textarea`·`Select`(native)·`Checkbox`·`Radio` | — | `FormGroup`(label + help + error)이 감싼다. `Textarea`는 `rows=1` + `field-sizing-content`(지원 브라우저에서 내용만큼 자란다, 미지원이면 1행 고정) |
| `Badge` | — | variants `muted`·`neutral`·`info`·`success`·`warning`·`danger`. 알약, 12px |
| `Alert` | — | variants `info`·`success`·`warning`·`danger`, `dismissible`, 제목 + 본문 + 액션 슬롯. **Publish 결과·편집 손실 배너·페이지 수준 거부**가 전부 이것이다 |
| `Card` | — | 헤더(제목 + 우측 슬롯) + 본문 |
| `Table` | — | `thead` sticky, 행 hover, 밀도 규칙은 DESIGN §5 |
| `Breadcrumb` | — | |
| `Avatar` | — | 이니셜 폴백. GitHub `image`가 있으면 그것 |
| `EmptyState` | — | 제목 + 설명 + 액션. 일러스트 없음 |
| `DropdownMenu` | `radix-ui` DropdownMenu | 사용자 메뉴·프로젝트 전환·역할 변경 |
| `Dialog` | `radix-ui` Dialog | 멤버 제거 확인 하나뿐 |
| `Tooltip` | `radix-ui` Tooltip | 접힌 사이드바의 아이콘 라벨 |

**포커스 링 규칙이 바뀐다.** 지금은 "raw 태그마다 셋을 리터럴로 적는다"(DESIGN §7 — 상수에 숨기면 스캐너가 못 본다)인데, 프리미티브가
서면 링은 **프리미티브 안에 한 번** 있고 화면은 raw 태그를 쓰지 않는다. `focus-ring.test.ts`가 그에 맞춰 둘로 바뀐다:

1. `components/ui/`를 **더 이상 제외하지 않는다** — 프리미티브의 `<button>`·`<input>`·`<select>`·`<textarea>`가 셋을 든다.
2. `app/`·`components/`(`ui/` 밖)의 raw 네 태그 수가 **0**이어야 한다 (`type="hidden"` 제외). 프리미티브를 우회하면 red다.

"의도된 중복" 규칙은 사라진다 — 중복의 이유(hand-rolled)가 사라지기 때문이다. DESIGN §7이 그렇게 고쳐진다.

아이콘은 `lucide-react`(설치돼 있고 사용 0곳)를 16px로 쓴다. GitLab 아이콘 세트(`gitlab-svgs`)를 들이지 않는다 — 의존성 하나로 충분하고
16px 라인 아이콘이라는 성질은 같다.

### 3.3 번역 화면 — 기본 착지는 첫 네임스페이스

- `?ns=` 없음 → `defaultNamespace(counts)` = `compareKeys` 순 첫 네임스페이스. **"All keys"는 `?ns=*`** 로만 간다. `*`는 어댑터가
  만들 수 없는 네임스페이스 이름이라 충돌하지 않는다(`all`은 실제 키 접두일 수 있다).
- 서버는 여전히 **전 키를 읽는다**(`loadKeys`) — 네임스페이스 패널의 집계에 필요하고, 12.7초의 원인은 조회가 아니라 `<input>`
  2,711개의 렌더였다. 렌더되는 행만 준다. 조회를 네임스페이스로 좁히는 최적화는 관측되면 그때.
- 텍스트 필터 `?q=`(키·모든 로케일 값의 부분 일치, 대소문자 무시)와 상태 필터 `?state=needs-review|untranslated`는 `filterRows(rows,
  { q, state, locale })` 순수 함수 하나가 든다. 서버 렌더 필터라 URL이 상태다 — 공유 가능하고 새로고침에 살아남는다.
- 링크 생성은 **`lib/routes.ts`** 한 곳이다(`routes.translations(slug, { ns, focus, q })`). 2026-09-05의 하드코딩 경로 사고
  (POSTMORTEM)가 `qs()`를 만들었는데, 라우트가 8개가 되면서 경로 리터럴이 페이지마다 흩어질 자리가 늘었다. `entry-points.test.ts`의
  "죽은 라우트 링크"가 그 파일도 스캔하도록 넓힌다.

### 3.4 Publish — 다섯 상태와 남는 링크

`PullResult`:

```ts
| { status: "skipped"; reason: "no-edits" | "no-changes"; warnings?: string[] }
| { status: "committed"; pr: "created" | "updated"; commitSha; prUrl; changed: string[]; warnings?: string[] }
```

`run.ts`가 이미 `findOpenPrUrl`의 결과로 둘을 안다 — 값으로만 안 내고 있었다. `pullMessage`가 다섯 갈래를 낸다:

| 상태 | 판정 | tone | 문구(en) |
|---|---|---|---|
| 변경 없음 | `skipped` | `info` | Nothing to publish — everything is up to date. |
| 새 PR | `committed` · `pr: created` · warnings 0 | `success` | Sent for review. Your developers will see a new pull request. [View pull request] |
| 기존 PR 갱신 | `committed` · `pr: updated` · warnings 0 | `success` | Updated the open pull request with your latest changes. [View pull request] |
| 일부 미기록 | `committed` · warnings ≥ 1 | **`warning`** | Sent, but {n} values could not be written to the files — tell your developers. [View pull request] |
| 실패 | `failed` | `danger` | Publish failed: {reason} |

"일부 미기록"이 `success`가 아니라 `warning`인 것이 SAAS 불변식 9다. `skipped`에 warnings가 붙는 경우(2층 스킵 + writer 경고)는
`info` 문구 뒤에 같은 경고를 덧붙인다.

**PR 링크가 새로고침을 넘어야 한다.** `Project`에 additive 둘 — `lastPublishedAt DateTime?`·`lastPrUrl String?`. `lib/pull/load.ts`의
`markPulled`가 `committed`일 때 함께 쓴다(같은 `update` 한 번). cron 경로도 `runPull`을 지나므로 야간 pull이 만든 PR도 남는다.
`skipped`는 이 둘을 건드리지 않는다 — "마지막으로 **보낸**" 것이지 "마지막으로 시도한" 것이 아니다.

머지 여부는 **묻지 않는다** (spec §4). 툴바 문구는 "Last sent 2 days ago · View pull request"이고 "merged"라는 말을 쓰지 않는다.

결과 표시는 **`Alert`** 이고 툴바 아래 고정 자리다. 토스트가 아닌 이유는 `pull-button.tsx`가 이미 적어 뒀다(피드백 방식이 둘로
갈린다) — 이번엔 저장 상태도 셀 인라인이라 **토스트가 0개**인 것이 규칙이 된다. Alert는 `PullButton`이 소유하는 클라이언트 상태라
**readiness 분기 밖**에 있고(POSTMORTEM 2026-09-07 revalidate), Publish는 `revalidatePath`를 부르지 않으므로 그 함정에 애초에
걸리지 않는다 — 다만 `lastPublishedAt`이 바뀌었으니 툴바의 "Last sent"는 다음 서버 렌더에서 갱신된다. Publish 뒤 `router.refresh()`를
부르면 Alert 상태가 같은 자리에 남은 채 툴바가 갱신된다.

### 3.5 미배포 변경 수 — `updatedBy`가 사람인 행만 센다

```sql
SELECT count(*) FROM "Translation"
WHERE "projectId" = $1 AND "updatedBy" IS NOT NULL
  AND ($2::timestamp IS NULL OR "updatedAt" > $2)   -- $2 = Project.lastPulledAt
```

`updatedAt > lastPulledAt`만으로는 안 된다 — **push가 전 행의 `updatedAt`을 올리므로** push 직후 야간 pull 전까지 903키 전부가
"unpublished"로 나온다. push가 쓴 행은 `updatedBy`가 없고(§3.6이 이를 보장한다) 사람이 저장한 행만 `User.id`를 든다.

순수 함수는 `isUnpublished({ updatedBy, updatedAt }, lastPulledAt)` 하나고, 위 SQL은 그것의 집계 형태다(`lib/keys/query.ts`).
같은 술어를 행 단위로도 쓴다 — 셀 메타의 "Unpublished" 점 표시.

⚠️ **경계 하나** (spec §5): push의 `needsReview` 전파가 `updatedAt`을 올리므로, 이미 Publish된 사용자 편집이 원문 변경으로
`needsReview`가 되면 다시 센다. 그 값은 실제로 재검토 뒤 다시 나가야 하므로 틀린 신호는 아니다. 그 UPDATE 문에서 `updatedAt`을 빼는
것은 pull 1층 판정(`max(updatedAt)`)에 닿는 변경이라 이번에 하지 않는다.

### 3.6 덮인 셀 — push가 `updatedBy`를 비운다 (MVP §10 미결의 답)

`applyPush`의 번역 upsert `ON CONFLICT … DO UPDATE SET` 에 `"updatedBy" = NULL`을 더한다. strict 덮어쓰기에서 **값의 저자는 리포**이므로
사람 이름이 남는 것이 거짓이었다. 결과:

- 셀 메타는 `updatedBy`가 있을 때만 "Edited by {name}"을 낸다. **"From repository" 같은 표시는 두지 않는다** — push 직후엔 전 행이 그
  상태라 가장 흔한 상태가 가장 시끄러워진다(DESIGN의 배지 원칙).
- §3.5의 미배포 집계가 이 결정 위에 선다.
- `lib/push/__tests__`의 SQL 캡처(`flow.test.ts` 계열)가 `"updatedBy" = NULL`을 고정한다. `authorization.test.ts:223`의
  `updatedBy: "u-editor"` 단언은 **저장 경로**라 그대로 맞다.

### 3.7 orphaned 로케일 — 2026-09-06 임시안을 확정한다

열 유지 + 헤더 `Badge danger "Orphaned"` + 셀 `disabled` + placeholder. 열을 숨기면 "로케일이 사라졌다"를 편집자가 알 길이 없고,
편집을 허용하면 `updatedAt`만 올라 pull이 헛돈다(저장 Action의 거부는 그대로). 확정이라 SAAS §8 6단계 체크 하나가 닫힌다.

### 3.8 저장 상태 — 접근성 둘

`TranslationInput`의 상태 줄이 `role="status" aria-live="polite"`를 든다("Saving…"·"Saved"·"Couldn't save: {reason}"). 실패 시
`inputRef.current?.focus()`로 **포커스를 그 입력으로 되돌린다** — blur로 떠난 뒤라 재시도 지점이 없던 것이 백로그였다. 성공은 조용하다
("Saved"는 1.5초 뒤 사라진다 — 903행에서 영구 텍스트가 쌓이면 표가 시끄럽다).

### 3.9 멤버 화면 — 조회 둘, Action 하나 추가

- `loadMembers(prisma, projectId)` → `{ userId, name, email, role, joinedAt }[]` (email은 렌더 시 `maskEmail`).
- `loadPendingInvitations(prisma, projectId)` → `acceptedAt IS NULL AND expiresAt > now()`.
- **`revokeInvitation({ slug, invitationId })`** 신설 — `member:manage` + `projectId`로 좁힌 `deleteMany`. 초대 행을 지우는 것은
  "삭제하지 않는다" 원칙(키·로케일·번역)의 대상이 아니다 — 초대는 데이터가 아니라 **아직 성립하지 않은 접근**이고, 지우는 것이 곧
  "그 링크를 무효로 한다"의 유일한 구현이다.
- 역할 변경·제거는 기존 `changeMember`. 제거는 `Dialog` 확인 한 번. 마지막 OWNER 거부 문구는 `accessErrorMessage("last-owner")`가
  행 옆 인라인에 닿는다.
- EDITOR는 목록을 본다(`translation:write`로 페이지 진입) — 컨트롤은 role로 감추고 Action이 `member:manage`로 거부한다.
- `components/invite-form.tsx`는 삭제된다(이 화면의 인라인 폼이 대체한다).

### 3.10 계정 화면 — 해제 인가 이관

- `/account` (`requireUser`). `middleware.ts` matcher에 `/account/:path*`. `entry-points.test.ts` (11)번 검사가 `(edit)/**/page.tsx`의
  matcher 커버를 세므로 **빠뜨리면 red**다.
- **해제 Action은 이미 사용자 수준이다** — 2026-09-07 리뷰 🟡9(다른 창구, 워킹트리 미커밋분)가 `disconnectGithub()`(인자 없음,
  `requireUser`, 자기 `Account` 행)를 `app/(edit)/projects/actions.ts`로 옮기고 `/projects`에 계정 섹션을 붙였다. 6단계는 **그 섹션을
  `/account`로 옮기기만** 한다 — Action·테스트는 그대로 쓴다. 처음 초안의 `disconnectGithubAccount` 신설은 취소.
- 연결 시작은 5단계의 `startGithubConnectForUser`를 그대로 쓰되 `dest`에 **`{ kind: "account" }`** 갈래를 더한다 — callback이 `/account`로
  착지한다. `lib/github-connect/state.ts`의 `StateDest` union + `landing(dest)` 순수 함수 + 옛 모양 거부 테스트가 그대로 확장된다.
- 설정 화면의 GitHub 계정 섹션은 "Connected as @handle · Manage in Account" 한 줄이 된다. 건강성 섹션(App 토큰)과 **여전히 독립적으로
  실패한다** — 계정 한 줄은 `getViewer`가 실패하면 "Couldn't load your GitHub account"로 그 줄만 바뀐다.

### 3.11 편집 손실 창 배너

`countUnpublished > 0`이면 툴바 아래 `Alert warning` — "{n} unpublished changes. A code push before you publish will overwrite them."
닫기는 `sessionStorage`(그 탭·세션 동안). MVP §3.1이 감수한 대가를 **편집자가 보는 자리**에 처음으로 적는 것이다. 문구는 원인이
아니라 행동을 말한다 — "Publish before your developers push"가 아니라 편집자가 할 수 있는 일(Publish)이 문장의 주어다.

### 3.12 로그인 화면 — 2열, 일러스트는 CSS만

폼 좌 / 장식 우(스크린샷 2의 GitLab 가입 화면 형). 우측은 dot-grid + 연보라 그라디언트 + **정적 모형 카드 하나**(SVG 인라인 — 로케일
파일 둘이 체크되고 브랜치 이름이 붙은 PR 카드). 이미지 파일을 두지 않는다 — `public/`에 생성물 아닌 바이너리를 늘리지 않고, 다크·해상도
문제가 없다. `lg` 미만은 좌측 카드 하나.

### 3.13 설정 — settings-block 넷 + 기준 브랜치·기준 로케일 변경 (2026-09-07 사용자 결정)

섹션은 GitLab settings-block 형(제목 · 한 줄 설명 · 본문)이고 **각자 독립적으로 실패**한다(DESIGN 기존 규칙 유지). 계정 섹션은 §3.10.

**Repository 블록에 편집 가능한 필드 둘이 들어간다** — SAAS §3 표가 "화면이 없다 — 그 화면은 6단계"라 적어 둔 것이다.

| 필드 | 저장 | 파생 효과 | 순수 판정 |
|---|---|---|---|
| **Base branch** | `Project.baseBranch` | pull이 커밋 parent·PR base로 쓴다(`run.ts`) · 워크플로 YAML의 `branches: [x]`가 바뀐다 | `isValidBranchName` — `git check-ref-format` 부분집합(공백·`..`·`~^:?*[`·끝 `/`·`.lock` 금지). `isRefSafeSlug`보다 넓다(`/`·대문자 허용) |
| **Base language** | `Project.baseLocale` + `Locale.isBase` 스왑(한 트랜잭션, `projectId`로 좁힌다) | 키 집합의 진실이 바뀐다(다음 push부터) · export의 description 폴백 · `needsReview` 전파 제외 대상 · 화면의 첫 열 · YAML의 `base-locale:` | `planBaseLocaleChange(current, next, locales)` — `next`가 **orphaned 아닌 기존 로케일**이어야 하고 현재와 같으면 `noop` |

⚠️ **둘 다 CI와 충돌한다 — 그리고 그 충돌을 서버가 409로 막는다.** 워킹트리에 이미 있는 `lib/push/guard.ts`의 `checkFormat`(다른 창구 작업 중,
2026-09-07)이 payload의 `baseLocale`이 저장값과 다르면 `wrong-format`을 낸다. 그래서 UI가 기준 로케일을 바꾸면 **워크플로의 `base-locale:` 입력을
바꾸기 전까지 그 리포의 push는 409**다. 이것은 결함이 아니라 원칙이다 — 키 집합의 진실은 코드이고, DB와 CI가 다른 base를 주장하는 상태를 strict
push가 조용히 받으면 진짜 base의 키가 orphan된다(ACTIONS.md `base-locale` 행). 따라서 저장 성공 응답에 **재생성한 YAML**을 함께 돌려주고 블록 안
`Alert warning`으로 "Update `.github/workflows/l10n.yml` — until then CI pushes are rejected"를 낸다. base branch는 push를 막지 않지만(guard가 안
본다) `on.push.branches`가 옛 브랜치를 가리켜 **CI가 영영 안 돈다** — 같은 Alert에 같은 이유로 실린다.

Action은 `updateRepositorySettings({ slug, baseBranch, baseLocale })` 하나(`project:settings`)다 — 둘을 한 폼에 두므로 저장도 하나다. 결과에
`workflowYaml`이 실린다. 이 컴포넌트는 revalidate로 바뀌는 분기 밖이다(블록 자체는 readiness와 무관).

**base 로케일 변경이 데이터에 하는 일의 경계**: `Translation`·`StringKey` 행은 건드리지 않는다. 옛 base 로케일의 번역은 그대로 남고 다음 push가
새 base 파일로 키 집합을 다시 세운다(사라진 키는 orphaned — 되돌릴 수 있다). `sourceText`·`sourceHash`는 push가 다시 채운다. **UI가 재적재를
돌리지 않는다** — 재적재는 CI 또는 설정의 [Run first import]와 같은 경로이고, 그것을 자동으로 이어 붙이면 저장 하나가 GitHub 왕복이 된다.

### 3.14 목록·온보딩·초대 — 형만 바뀐다

`/projects`는 행 구조(아바타·이름·리포·역할·상태) + EmptyState. `/projects/new`는 상태 기계 그대로(`features/project-onboarding/design.md`
§2·§3.4 — 중간 상태 무저장, 확정은 파일 재검증) + `FormGroup`·`Card`. 어댑터 라벨은 여전히 서버가 `formatLabel`로 내려준다 — **그 함수의
문구도 사전에서 나온다**(`lib/onboarding/detect.ts`가 `@/lib/i18n`을 읽는다 — 잎이라 무게가 없다). 초대 수락은 셸 밖 카드.

## 4. 순수 함수로 분리 가능한 부분 — `/tdd` 대상

| 함수 | 위치 | 판정 |
|---|---|---|
| `fmt(template, vars)` | `lib/i18n/format.ts` | `{name}` 치환. 없는 변수는 토큰을 그대로 남긴다(조용히 빈 문자열이 되면 문장이 깨진 채 나간다) |
| `plural(n, { one, other })` | `lib/i18n/plural.ts` | n===1 → one. `{count}` 보간 포함 |
| `rich(template, nodes)` | `lib/i18n/rich.tsx` | 문자열/노드 교차 배열. 토큰이 문장 처음·끝·연속일 때 빈 문자열을 내지 않는다 |
| `defaultNamespace(counts)` | `lib/keys/view.ts` | 첫 네임스페이스(`compareKeys` 순). 비어 있으면 `null` |
| `resolveNamespace(param, counts)` | `lib/keys/view.ts` | `undefined` → default · `"*"` → all · 없는 이름 → default (404가 아니다 — 필터가 낡은 링크일 수 있다) |
| `filterRows(rows, { q, state, locale })` | `lib/keys/view.ts` | 키·값 부분 일치(대소문자 무시) + 상태 필터. `q` 공백은 무필터 |
| `isUnpublished(cell, lastPulledAt)` | `lib/keys/view.ts` | §3.5 술어 |
| `publishSummary(outcome)` → 기존 `pullMessage` 확장 | `lib/pull/message.ts` | 다섯 갈래 · tone · href. exhaustive |
| `pullResultPr(existingUrl)` → `"created" \| "updated"` | `lib/pull/run.ts`(값 분리) | `findOpenPrUrl` 결과로 판정 |
| `landing(dest)` 확장 | `lib/github-connect/state.ts` | `account` 갈래 |
| `isValidBranchName(s)` | `lib/pull/ref-slug.ts` 옆 잎(`lib/pull/branch-name.ts`) | git check-ref-format 부분집합 (§3.13) |
| `planBaseLocaleChange(current, next, locales)` | `lib/onboarding/base-locale.ts` | `noop` · `ok` · `unknown-locale` · `orphaned-locale` |
| `AdapterErrorCode` + `adapterErrorMessage(code)` | `lib/adapters/types.ts`(타입) · `lib/i18n/adapter-errors.ts`(문구 — 잎) | `satisfies Record<AdapterErrorCode,string>` — 코드가 늘면 사전이 컴파일 에러 |
| `classify(code)` | `lib/survey/one.ts` | 문구 부분 문자열 → 코드 매핑. 기존 `ReadErrorKind` 결과가 **한 건도 바뀌지 않아야** 한다(재측정 전 지표 동일) |
| `readinessLabel` · `formatLabel` · `ingestHeadline` · 문구 모듈 넷 | 기존 자리 | 사전 읽기로 바뀌어도 시그니처는 같다 — 기존 테스트가 문구 상수만 바꿔 그대로 산다 |
| `stripComments(src)` (스캐너용) | `lib/i18n/__tests__/no-korean-ui.test.ts` 내부 | `//`·`/* */`·`{/* */}` 셋. 메타 테스트로 각각 검증 |
| `Button`/`Badge`/`Alert` variant 매핑(`cva`) | `components/ui/*` | 렌더 테스트는 두지 않는다 — variant→클래스 표는 소스 스캔이 아니라 `focus-ring`류 상시 검사가 든다 |

**렌더 테스트를 도입하지 않는다.** 이 리포의 UI 방어선은 소스 스캔(`focus-ring`·`client-graph`·`entry-points`)과 실물(`/bugshot-qa`)이고,
그 둘이 잡은 결함 부류(포커스 링·번들·죽은 링크·수신자 없는 쿼리·revalidate 언마운트)는 jsdom 렌더가 원리적으로 못 보는 것이 셋이다.
`@testing-library/react`를 들이면 게이트가 하나 늘고 그 셋은 여전히 안 보인다.

## 5. 스키마 변경 — additive 둘

```prisma
model Project {
  /// 마지막으로 **PR을 만들거나 갱신한** Publish 시각. skipped는 쓰지 않는다 — "보낸" 것만 센다 (design §3.4).
  lastPublishedAt DateTime?
  /// 그때의 PR URL. 머지 여부는 저장하지 않는다 — 웹훅이 비범위라 알 수 없고, 링크를 누르면 GitHub이 답한다.
  lastPrUrl       String?
}
```

`/db`가 `--create-only`로 SQL을 만들고 dev에 적용 → `/push` → `/merge` 1단계에서 `db:deploy`. 컬럼 둘 다 nullable이라 옛 코드가
읽어도 무해하다(additive-first). `Translation.updatedBy`의 **의미**는 §3.6으로 바뀌지만 컬럼은 그대로다 — POSTMORTEM 2026-09-07
(cuid)의 규칙대로 **읽는 자리를 전수로 센다**: `lib/keys/query.ts`(조회)·`lib/keys/view.ts`(`actorLabel`)·번역 페이지(렌더)·
`authorization.test.ts:223`(저장 단언) 넷이고, 바뀌는 것은 렌더의 "Edited by" 조건뿐이다.

## 6. 환경변수

없다. `.env.example` 변경 없음.

## 7. 불변식 영향

| 불변식 | 영향 |
|---|---|
| export 결정성 (ARCH §1) | **출력 불변.** 어댑터의 `AdapterError.message` → `code` 리팩터는 오류 **보고** 경로만 바꾸고 `read`·`write`의 반환 내용은 건드리지 않는다. `key-order-golden`·`contract`·`write-contract` 테스트가 그대로 green이어야 하고, 재측정(학습+홀드아웃)이 13차와 같은 지표를 내야 한다 |
| blob SHA·2층 스킵 (ARCH §2·§3) | **없음.** `run.ts`는 `pr` 값 하나를 결과에 더하고 `markPulled`가 컬럼 둘을 더 쓴다 |
| 인증 경계 (ARCH §6.1) | 신설 라우트 둘이 matcher(`/account`)와 진입점 게이트(`requireUser`·`requireProjectAccess`)를 지난다. `entry-points.test.ts`가 자동으로 센다. 레이아웃은 여전히 차단이 아니다 — 사이드바의 역할별 노출은 편의다 |
| 테넌트 격리 (CLAUDE.md) | 신설 조회 셋(`loadMembers`·`loadPendingInvitations`·`countUnpublished`)이 전부 `projectId`로 좁힌다. `disconnectGithub`은 이미 `userId`로 좁힌다(사용자 소유 테이블) |
| 자격증명 셋 (ARCH §6) | `/account`가 사용자 토큰(`getViewer`)만 쓴다. `credential-separation.test.ts` 범위 안 |
| 잎 모듈·클라이언트 번들 (ARCH §6.35) | `lib/i18n/`이 잎이다. `detect.ts`·`readiness.ts`가 `@/lib/i18n`을 읽어도 방향이 반대라(무게 없는 쪽을 읽는다) 안전하다. `client-graph.test.ts`가 센다 |
| SAAS 불변식 9 (버린 값을 숨기지 않는다) | Publish의 "일부 미기록"이 `warning` tone으로 갈린다. 첫 적재 부분 실패 목록은 유지(원문 메시지는 `<details>` 진단) |
| SAAS 불변식 9의 UI 규칙 (revalidate 밖) | 인라인 결과를 보이는 컴포넌트 넷(`PullButton`·`FirstIngestRetry`·`PushTokenPanel`·멤버 행)이 조건부 분기 밖에 있다 — `FirstIngestRetry`는 이미 그렇고 나머지는 분기 자체가 없다 |
| push strict (MVP §3.1) | 값 동작 불변. `updatedBy`를 비우는 것은 strict의 **귀결**이다(저자가 리포다) |

## 8. POSTMORTEM — 이 기능이 밟을 자리

| 항목 | 어디에 걸리나 | 설계의 대응 |
|---|---|---|
| 2026-08-31 레이아웃 인증 검사가 노출을 막지 못했다 | 새 셸 레이아웃 | 레이아웃은 `redirect()`만. 사이드바 노출은 편의. 신설 페이지 둘은 최상단 `require*` |
| 2026-09-05 링크 생성기가 옛 경로를 하드코딩 | 라우트 8개의 상호 링크 | `lib/routes.ts` 단일 출처 + "죽은 라우트 링크" 검사 범위에 그 파일 추가 |
| 2026-09-06 `?e=`를 보내고 읽는 쪽이 없었다 | `/account?e=`·`/projects/:slug/members?e=` | 신설 페이지가 `searchParams`를 읽는다. "쿼리 파라미터의 수신자" 검사가 센다 |
| 2026-09-06 조회를 그 사용자로 좁히지 않았다 | `/account`의 해제·`getViewer` | 기존 `disconnectGithub`(userId 스코프)을 그대로 쓴다 — 새 Action을 만들지 않는 이유다 |
| 2026-09-07 클라이언트 번들 7.2MB | `lib/i18n/`·`lib/routes.ts`를 클라이언트가 읽는다 | 둘 다 잎. `client-graph.test.ts` |
| 2026-09-07 `revalidatePath`가 결과 문구를 씻어냈다 | Publish Alert · 멤버 행의 인라인 오류 | 결과를 든 컴포넌트가 revalidate로 바뀌는 분기 밖에 있다 (§3.4·§3.9) |
| 2026-09-07 컬럼 의미가 바뀌었는데 렌더가 그대로 | `updatedBy`를 push가 비운다 | 읽는 자리 넷 전수 (§5) |
| 2026-09-07 방어선 셋이 주장한 것을 검사하지 못했다 | 새 스캐너(`no-korean-ui`) · 바뀐 스캐너(`focus-ring`) | 각자 메타 테스트 — 주석 종류 셋·태그 넷을 하나씩 먹여 red를 내는지 본다 |

## 9. 바뀌는 상시 검사

| 테스트 | 변경 |
|---|---|
| `components/__tests__/focus-ring.test.ts` | `ui/` 제외 해제 + "밖의 raw 태그 0개" 단언 추가 (§3.2) |
| `app/__tests__/entry-points.test.ts` | 변경 없음 — 신설 둘을 자동으로 센다. "죽은 라우트 링크"가 `lib/routes.ts`도 읽도록 스캔 대상 하나 추가 |
| `components/__tests__/client-graph.test.ts` | 변경 없음 — `lib/i18n`·`lib/routes`가 잎인지 자동으로 본다 |
| `lib/__tests__/globals-css.test.ts` | 변경 없음 — `@custom-variant dark`·`text-mono` 유지. **팔레트가 바뀌어도 이 테스트는 값을 안 본다** (DESIGN이 값의 정본이고 `/doc-check`이 대조한다) |
| `lib/onboarding/__tests__/workflow*.test.ts` | ACTIONS.md와 줄 대조 — YAML 주석 영어화와 문서를 같은 커밋에 |
| `lib/pull/__tests__/message.test.ts` | 다섯 갈래 |
| `lib/adapters/__tests__/*` (5 어댑터 + contract) | `errors[].message` 단언 → `errors[].code`(+`detail`). 출력 바이트 단언은 변경 없음 |
| `lib/survey/__tests__/*` | `classify`가 코드를 받는다. 기존 픽스처의 `ReadErrorKind` 결과 동일 |
| `lib/push/__tests__/guard.test.ts` | 변경 없음 — `checkFormat`은 다른 창구 작업분. 이 기능은 그 판정 **위에** 선다(§3.13) |
| **신설** `lib/pull/__tests__/branch-name.test.ts` · `lib/onboarding/__tests__/base-locale.test.ts` | §3.13 |
| `lib/push/__tests__/*` (SQL 캡처) | `"updatedBy" = NULL` 고정 |
| **신설** `lib/i18n/__tests__/no-korean-ui.test.ts` | §3.1.5 |
| **신설** `lib/i18n/__tests__/{format,plural,rich}.test.ts` | §4 |
| `app/__tests__/membership.test.ts` | `revokeInvitation` + 목록 조회 |
| `lib/github-connect/__tests__/state.test.ts` | `dest: account` |
| `prisma/__tests__/schema-contract.test.ts` | 영향 없음(Auth.js 테이블만 본다) |

## 10. 대안과 버린 이유

| 대안 | 왜 버렸나 |
|---|---|
| `next-intl` | 로케일 라우팅·미들웨어가 값인데 우리는 en 단일 + 값싼 미들웨어여야 한다 (§3.1) |
| `t("a.b.c")` 문자열 키 접근 | 경로 파싱 타입이 복잡하고 `m.a.b.c`가 같은 안전성을 공짜로 준다 |
| shadcn CLI 재생성 + 테마 덮기 | CLI 재실행이 편집을 덮는다 — 그래서 동결이 있었다 |
| GitLab Pajamas 팔레트·타입 스케일 도입 | **처음 초안이 그랬다가 되돌렸다** (2026-09-07 — 사용자: 레퍼런스는 레이아웃·UI 구성이고 색 토큰이 아니다). 기존 slate + shadcn 시맨틱 유지, raw 색은 amber·destructive·blue-600뿐 |
| GitLab UI 라이브러리(`@gitlab/ui`, Vue) 직접 사용 | Vue다. 토큰과 규칙만 가져온다 |
| 가상 스크롤 | CLAUDE.md 판정 유지 — 기본 착지가 먼저 |
| 토스트(`sonner`) | 피드백 방식이 둘로 갈린다. 저장은 셀 인라인, Publish는 Alert |
| PR 머지 상태 저장·조회 | 웹훅 비범위(SAAS §4.3 ②). API 조회는 렌더마다 GitHub 왕복이고 장애가 화면 장애가 된다 |
| 네임스페이스를 툴바 Listbox 하나로 | 패널이 "남은 일"을 한눈에 준다 — 번역자의 주 탐색이라 상시 노출이 맞다. GitLab의 파일 트리 패널과 같은 자리 |
| `updatedBy`에 `"repo"` 센티널 | `User.id`·옛 핸들·센티널 세 종류가 섞인다. `NULL`이 "저자 없음"의 자연스러운 표현이고 `actorLabel`의 폴백 규칙을 건드리지 않는다 |
| `@testing-library/react` 렌더 테스트 | §4 끝 — 이 리포의 UI 결함 부류를 못 보는 게이트가 하나 늘 뿐이다 |
| 어댑터 오류 문구를 영어 리터럴로만 바꾸기 | 사전 밖이라 ko가 못 따라오고, `survey/one.ts`가 문구를 부분 문자열로 분류해 두 번 깨진다. 코드화가 재측정을 부르지만 그 비용은 한 번이다(사용자 결정) |
| 기준 로케일 변경 시 자동 재적재 | 저장 하나가 GitHub 왕복이 되고 실패 모양이 둘로 섞인다. 재적재는 기존 경로(CI·[Run first import])에 맡긴다 |

## 11. 결정 기록 (2026-09-07, 사용자 — `/feature` 확인 단계)

| # | 질문 | 결정 | 추천과 |
|---|---|---|---|
| 1 | 설정에 base branch·기준 로케일 변경 필드 | **둘 다 넣는다** → §3.13 | 달랐다(추천은 "안 넣는다"). SAAS §3 표가 6단계로 지정한 것을 지킨다 |
| 2 | 어댑터 오류 문구(한국어) | **오류 코드로 리팩터** → §3.1.4 | 달랐다(추천은 "둔다"). 재측정 회차 하나가 따라온다 |
| 3 | 멤버 화면 이메일 마스킹 | **전원 마스킹** | 같다 |
| 4 | `sonner`·`tw-animate-css`·`components.json` | **마지막 chore에서 사용 0이면 제거** | 같다 |
| 5 | 모노 폰트 | **시스템 스택 유지** | 같다 |
