# translation-ui — 설계

> 착수 전 읽은 것: SAAS §3·§4·§5.2·§7.6·§7.7·§8 6단계·§9 · ARCHITECTURE §6.1·§6.3·§6.35 · DESIGN 전문(재작성 전) ·
> POSTMORTEM 8건(§8에 인용) · `features/project-onboarding/design.md` §2·§3.4·§3.7 · 현재 UI 전수 인벤토리(§1.1).
> 화면 구성은 [user-stories.md](./user-stories.md), 시각 값은 [DESIGN.md](../../DESIGN.md)다 — 이 문서는 **왜 그렇게
> 만드는가**와 **어디를 순수 함수로 떼는가**만 다룬다.
>
> **2026-09-08 `/feature-review`** — 단계가 6a/6b로 갈렸고(§11 #6) 아래 결정이 바뀌었다: 사전은 `messages/en.tsx`(§3.1) · 스캐너는 축소형
> 허용 목록(§3.1.5) · 미배포 집계는 Prisma `count`(§3.5) · 저장 a11y는 표 단위 live region + 조건부 포커스(§3.8) · Publish는 편집자 어휘·
> 문구 다섯/tone 넷(§3.4) · 배너 재정의(§3.11) · 프리미티브 16(§3.2) · 로그인 장식은 토큰만(§3.12) · 기본 착지는 pending>0인 첫 ns(§3.3).
> **§3.9·§3.10·§3.13은 6b다** — 검수가 잡은 결함이 각 절 머리에 있고, 6b 착수 때 다시 쓴다.

## 1. 영향 받는 흐름

| 흐름 | 무엇이 바뀌나 (6a) |
|---|---|
| **편집 UI** | 전부. 라우트 6 그대로(6b가 `/projects/:slug/members`·`/account`를 판정한다), 셸이 헤더 → 사이드바, 컨트롤이 hand-rolled → 프리미티브, 문자열이 한국어 하드코딩 → `messages/en.tsx` |
| **pull** | `PullResult.committed`에 `pr: "created" \| "updated"`가 붙고, 성공 시 `Project.lastPublishedAt`·`lastPrUrl`을 쓴다 (§3.4). 파일 내용·blob SHA·커밋 전략은 **한 줄도 안 바뀐다** |
| **push** | `applyPush`의 번역 upsert가 `ON CONFLICT`에서 **`"updatedBy" = NULL`** 을 함께 쓴다 (§3.6). 값·키·orphaned 판정은 그대로 |

**6a는 어댑터(`lib/adapters/**`)를 한 줄도 건드리지 않는다** — 재측정 트리거가 없다. 어댑터 오류 `message`의 코드화(§3.1.4 — 2026-09-07 사용자
결정)는 **6b-1**이었고 ✅ **2026-09-08에 닫혔다** — 학습·홀드아웃 둘 다 돌려 전 지표가 13차와 같음을 확인하고 ADAPTER-COVERAGE §20(14차)을 더했다.

### 1.1 인벤토리 (2026-09-07 전수)

- 사용자 문자열 **약 150개** — JSX 인라인 ~103 + 문구 모듈 ~47 (`lib/auth/message.ts` 17 · `lib/github-connect/message.ts` 13 ·
  `lib/onboarding/message.ts` 15+2 · `lib/pull/message.ts` 5 · `lib/onboarding/readiness.ts` 2 · `lib/onboarding/detect.ts`의
  `formatLabel` 5).
- 그 밖에 화면에 닿는 것: **어댑터 read/write 오류 `message`**(~40, `new-project-flow.tsx`가 `{path} — {message}`로 그대로 낸다) ·
  `lib/pull/**`·`lib/push/**`·`lib/github.ts`의 `fail()` 문구(`classifyFailure`가 `safe`로 통과시켜 "Publish failed: …"에 실린다) ·
  `lib/onboarding/workflow.ts`가 만드는 YAML 안의 **한국어 주석 둘**(사용자 리포에 복사된다) · `app/layout.tsx`의 `lang="ko"`.
- 문장이 JSX 노드 3~7개로 **쪼개진 곳** 일곱(`workflow-block` 18·24-25 · `new-project-flow` 399·447-452·485-486 · `projects/new/page` 100 ·
  `push-token-panel` 26-27) — 인라인 `<code>`·`<strong>`이 문장 가운데 있다(`new-project-flow:485`는 조사 "에"가 `</span>`에 붙어 있어 ko가
  어순을 바꿀 수 없는 가장 나쁜 예다). 키→문자열만으로는 안 되고 §3.1.3의 **함수 값**이 필요하다.
- 카운터가 접미로 붙는 곳(`{n}키`·`언어 {n}개`·`${pending}/${total}`)과 영어 토큰이 그대로 새는 폴백 셋(`저장 실패: ${error}` 등).
- `components/ui/`(shadcn 생성물 4개)는 **import 0곳**이고 `dark:`가 9곳 살아 있다. `sonner`·`lucide-react` 사용 0곳.
- `lib/survey/one.ts:168-199`(`classify`)가 **어댑터 한국어 오류 문구를 부분 문자열로 분류한다** — 어댑터 문구를 바꾸면 지표 분류기가 조용히 깨진다.
  **그래서 6a는 어댑터 문구를 손대지 않는다**(spec §5). 어댑터 `message`를 화면에 싣는 자리는 여덟이다 — `new-project-flow.tsx` · `first-ingest-retry.tsx:67` ·
  `app/(edit)/projects/actions.ts:632·740` · `lib/pull/run.ts:127`(warnings 조립) · `scripts/ingest.ts:164` · `scripts/push-local.ts:140` · `lib/adapters/__tests__/contract.ts:266` · `one.ts`.
  6a 끝에 한글이 남는 곳은 그 중 `run.ts:127`·`lib/pull/render.ts:72`와 온보딩 `<details>` 원문이다.
- 한글 리터럴을 단언하는 테스트가 **182줄/41파일**이다 — 문구 모듈 33줄(T4), 어댑터 ~85줄(6b), 나머지 edit-flow·save·route-diagnostics·render·run.

## 2. 정보 구조

```
/                              로그인 (셸 밖)
/invite/:token                 초대 수락 (셸 밖, matcher 밖)
(edit) 셸 ─ 사이드바 + top bar
  /projects                    목록           컨텍스트 없음
  /projects/new                생성           컨텍스트 없음
  /projects/:slug/translations 번역           프로젝트 컨텍스트 ─ Translations · Settings*   (* OWNER만 렌더)
  /projects/:slug/settings     설정
  (6b) /projects/:slug/members · /account — §3.9·§3.10
```

사이드바가 **프로젝트 컨텍스트**를 알아야 하는데 `(edit)/layout.tsx`는 `[slug]` params를 받지 못한다. 중첩 레이아웃
(`projects/[slug]/layout.tsx`)에 사이드바를 나누면 바깥 레이아웃의 사이드바 슬롯에 안쪽이 끼어들 수 없다. 그래서:

- **레이아웃(서버)** 이 내 멤버십 목록(`{slug, name, role}[]`)을 읽어 `<Sidebar memberships>`에 넘긴다. **새 조회다** — 지금 레이아웃은
  Prisma를 부르지 않는다(`readSession`뿐). `loadMemberships(prisma, userId)`이고 **`userId`로 좁힌다**(POSTMORTEM 2026-09-06). 사용자당 3개 제한이라 가볍다.
- **`Sidebar`는 클라이언트 컴포넌트**다. `usePathname()`으로 현 slug를 뽑아 멤버십 목록에서 이름·역할을 찾고, Settings 노출을 그 역할로
  정한다(6b의 Members는 **전원**에게 보인다 — EDITOR도 목록을 본다). **이 노출은 편의다** — 방어는 각 페이지의 `requireProjectAccess`이고
  URL 직접 진입은 `not-found`다. pathname에서 뽑은 slug는 **데이터 접근에 쓰지 않는다** — 표시용이다.
- **breadcrumb은 페이지 콘텐츠의 첫 줄이다** (`<Breadcrumb items>`) — 페이지가 자기 이름을 안다. top bar(레이아웃)에 두면 RSC 레이아웃이
  페이지 props를 못 받아 parallel route 슬롯이나 클라이언트 컨텍스트(첫 페인트 플래시)가 필요하다. top bar는 사용자 메뉴만이다.
- 접힘 상태는 `localStorage`뿐이다. 서버에 저장하지 않는다. 접힌 항목은 `aria-label` + Tooltip.

## 3. 설계 결정

### 3.1 i18n — 사전 한 벌, 라이브러리 없음, 잎 모듈

**`next-intl`을 넣지 않는다.** 그 라이브러리의 값은 로케일 라우팅·미들웨어·`Accept-Language` 협상인데, 우리는 (a) en 단일이고
(b) 미들웨어가 "쿠키 이름만 보는 값싼 차단"이어야 한다(ARCHITECTURE §6.1) — 거기에 로케일 판정을 끼우면 그 성질이 깨진다.
필요한 것은 **문자열의 단일 출처**와 **나중에 ko를 더할 자리**이고, 그건 TSX 객체 하나로 된다.

#### 3.1.1 구조 (2026-09-08 — JSON + 헬퍼 셋에서 TSX 하나로)

```
messages/en.tsx           단일 출처. export const en = { common, signIn, projects, newProject, translations, settings, invite, errors } as const
                          값은 문자열 또는 함수 — keys: (n: number) => n === 1 ? "1 key" : `${n} keys`
                                               saveAs: (path: ReactNode) => <>Save this in your repository as {path}.</>
lib/i18n/index.ts         export { en as m } from "@/messages/en" · export type Messages = typeof en
```

- **헬퍼가 없다.** `fmt`(보간)·`plural`·`rich`(노드 삽입)·`resolveJsonModule`·`client-graph`의 `.json` resolver가 전부 사라진다 — 함수 값이
  그 셋을 한 번에 한다. 처음 초안은 `en.json` + 헬퍼 셋이었고 그 유일한 가치는 "ko가 생기는 날 이 리포를 말모이 자신의 프로젝트로 붙인다"
  (SAAS §8 8단계)였는데, 그 날 `en.tsx`를 JSON으로 뽑는 것은 한 번의 기계적 변환이라 지금 그 값을 지불하지 않는다(CTO 검수).
- `as const`라 `m.translations.publish` 접근이 곧 타입 검사다 — 문자열 키 `t("translations.publish")`를 파싱하는 템플릿 리터럴 타입을 만들지 않는다.
- **`lib/i18n/`은 잎 모듈이다** — `@/lib/**`를 하나도 import하지 않는다(`react`의 `ReactNode` 타입뿐). 클라이언트 컴포넌트가 읽으므로 그 그래프가 곧 번들이다
  (ARCHITECTURE §6.35). `client-graph.test.ts`가 상시로 센다 — T1 시점엔 실 소비자가 없어 공허하므로 **메타 테스트에 `@/lib/i18n`을 읽는 클라이언트
  픽스처를 하나** 둔다.
- **ko를 더할 때 바뀌는 곳은 `lib/i18n/index.ts` 하나다** — `messages/ko.tsx`를 같은 모양(`satisfies Messages`)으로 만들고 `m`을 상수에서
  `getMessages(locale)`(서버) + `<MessagesProvider>`(클라이언트)로 바꾼다. 컴포넌트는 전부 `@/lib/i18n`에서 `m`을 받으므로 import 자리는 바뀌지 않는다.
  **어떻게 locale을 고르는지는 지금 정하지 않는다** (spec §5).
- `app/layout.tsx`의 `lang`은 `"en"`이다.

#### 3.1.2 문구 모듈 넷은 switch → `satisfies Record<Union, string>`

```ts
// lib/auth/message.ts
const ACCESS: Record<AccessError, string> = m.errors.access satisfies Record<AccessError, string>;
export const accessErrorMessage = (e: AccessError) => ACCESS[e];
```

갈래가 늘면 사전에 키가 없어 **컴파일 에러**다 — 지금의 `never` 검사와 같은 힘이고 코드는 줄어든다. `pullMessage`처럼 **문구 외에
`tone`·`href`를 고르는 것**은 switch로 남고 문구만 `m`에서 꺼낸다.

폴백이 있는 둘(`inviteErrorMessage`·`signInErrorMessage` — `?e=`가 사용자 편집 가능해 던지지 않는다)은 `isInviteError(e) ? INVITE[e] : m.errors.invite.fallback`이다.

#### 3.1.3 쪼개진 문장·카운터 — 함수 값

```tsx
{m.workflow.saveAs(<code className="text-mono">.github/workflows/l10n.yml</code>)}
// en.tsx: saveAs: (path: ReactNode) => <>Save this in your repository as {path}.</>
{m.translations.keys(count)}
// en.tsx: keys: (n: number) => n === 1 ? "1 key" : `${n} keys`
```

사전이 문장을 소유하므로 ko가 어순을 바꿀 수 있다 — 지금처럼 JSX 노드 다섯으로 쪼개면 ko 사전이 **어순을 바꿀 수 없다**(§1.1의 일곱 곳).
복수는 함수 안의 삼항 하나다 — ICU가 아니다(MVP §7). 테스트는 함수 값에 0·1·2와 노드를 넣어 반환을 본다(`dictionary.test.ts`).

#### 3.1.4 무엇이 사전에 들어가고 무엇이 아닌가 — 경계 넷

| 부류 | 어디로 | 왜 |
|---|---|---|
| **화면 문구** (라벨·제목·빈 상태·거부 사유·상태 문구·placeholder·`aria-label`) | `messages/en.tsx` | 사용자가 읽는다. ko의 대상이다 |
| **진단 문구** — `fail()`·`throw`의 메시지 (`lib/pull/**`·`lib/push/**`·`lib/github.ts`·`lib/auth/profile.ts`·`lib/env.ts`·`lib/github-connect/state.ts`) | **영어 리터럴로 고쳐 코드에 남긴다.** 사전 밖 | 개발자·로그·Actions 로그가 읽는다. 커밋 메시지와 같은 부류다. `classifyFailure`가 `safe`로 통과시켜 "Publish failed: …"에 실리므로 **한국어로 남으면 en UI에 한글이 샌다** — 그래서 영어로는 바꾸되 사전에는 넣지 않는다(ko로 번역할 대상이 아니다). ⚠️ `lib/pull/run.ts:127`의 warnings 조립은 어댑터 `message`를 싣는 자리라 **6b**까지 한글이 남는다 |
| **어댑터 오류** (`lib/adapters/**`의 `AdapterError` — 생성 **35곳**: 어댑터 33 + `lib/pull/render.ts`의 `missingOriginal` + `lib/onboarding/ingest.ts`의 `download-failed`. ⚠️ **이 표는 34로 적고 있었다** — 마지막 것을 못 셌고 타입 변경이 그것을 물었다. `new Error` 5곳은 코드화 대상이 아니지만 **영어로 고쳤다**(제외가 풀려 `no-korean-ui`가 훑는다)) | ✅ **6b-1에서 코드가 됐다** (2026-09-08) — `AdapterError = { path, code: AdapterErrorCode, key?, detail? }`이고 코드는 스물둘. 문장은 `lib/i18n/adapter-errors.ts`의 `adapterErrorMessage`가 `m.adapterErrors[code]`에서 꺼내 `key`(앞)·`detail`(뒤 괄호)을 붙인다 | 사용자 결정(2026-09-07). 화면(온보딩 부분 실패·Publish warnings)에 닿는 값이 자유 문자열이면 en으로 바꿔도 사전 밖이라 ko가 못 따라온다. `detail`(파서 원문 등)은 진단이라 사전 밖이고 `<details>`에만. ⚠️ **`classify(message)` → `classify(code)`를 "재측정만이 판정한다"고 적었는데 그것이 부족했다** — 코퍼스가 밟는 갈래는 스물둘 중 **여섯**뿐이라 나머지의 회귀는 지표에 0으로 조용히 남는다. 옛 문구 22개와 **옛 분류기 본문**을 픽스처로 든 `lib/survey/__tests__/classify.test.ts`가 실제 방어선이고, 골든 등식은 **read 층 열셋에만** 걸린다(write 층 아홉은 `read1.errors`에 도달하지 못한다) |
| **survey·scan CLI 출력** (`lib/survey/summarize.ts`·`one.ts`의 표 문구, `lib/scan/**` 경고) | **그대로 둔다** (한국어) | 웹 UI가 아니다 — `pnpm adapter-survey`·`pnpm scan`의 터미널 출력이다. `no-korean-ui` 스캔에서 제외 |
| **워크플로 YAML 주석** (`lib/onboarding/workflow.ts`) | 영어로. `docs/ACTIONS.md`와 **같은 커밋** | 사용자 리포에 복사된다. `workflow.test.ts`가 ACTIONS.md와 줄 대조하므로 문서가 함께 바뀌어야 green이다 |

#### 3.1.5 상시 방어선 — `lib/i18n/__tests__/no-korean-ui.test.ts` (축소형 허용 목록)

`app/`·`components/`·`lib/`(아래 제외)의 `.ts`·`.tsx`에서 **주석을 벗긴 뒤** `[가-힣]`를 센다. 제외: `__tests__`, `lib/survey/**`, `lib/scan/**`
(§3.1.4 넷째 줄). ✅ **`lib/adapters/**` 제외는 6b-1이 풀었다** (2026-09-08 — 허용 목록도 `auth.ts`·`lib/push/apply.ts` 둘로 줄었다). 주석 제거는 `//`·`/* */`·JSX `{/* */}` 셋이고, **메타 테스트가 셋을 하나씩 먹여
스캐너가 각각을 벗기는지, 그리고 코드 안의 한글 리터럴을 실제로 잡는지 본다** (POSTMORTEM 2026-09-07 "좁은 검사는 자기 좁음을 신고할 수
없다"). 주석은 CLAUDE.md대로 한국어라 이 벗기기가 없으면 검사가 성립하지 않는다.

**단언은 둘이다**: (1) 허용 목록 **밖** 파일은 한글 0자, (2) 허용 목록 **안** 파일은 한글 ≥1자(낡은 항목 금지). 초기 목록은 지금 한글이 있는
파일 전부이고, UI 커밋마다 자기 파일을 뺀다 — T8 끝에 목록이 `lib/pull/run.ts`·`render.ts`(어댑터 `message`를 싣는다)만 남긴다. 처음 초안의
`it.fails`는 세 방향으로 게이트를 무너뜨렸다(QA 검수): 중간 커밋이 한글을 0으로 만드는 순간 red · 그 사이 새 한글 회귀를 못 봄 · 뒤집기를
잊을 수 있음. 축소형은 **상시 green·회귀 즉시 red·뒤집을 것이 없다**. `focus-ring.test.ts`의 raw 태그 목록도 같은 형이다(§3.2).

### 3.2 프리미티브 — `components/ui/`를 이 리포가 소유한다

shadcn 생성물 4개(`badge`·`button`·`input`·`select`)를 지우고 **같은 디렉터리에 손으로 쓴 프리미티브**를 둔다. shadcn CLI를 다시
돌리지 않는다 — 생성물을 고치면 CLI 재실행이 덮는다(그래서 동결이 있었다). 색은 **기존 토큰**이다(DESIGN §2 — GitLab에서 가져오는 것은 배치이고 색이 아니다). `components.json`은
남겨 두되 spec §5가 삭제 판정을 미룬다.

**16개다** (2026-09-08 — 처음 초안의 18에서 `Checkbox`·`Skeleton`을 뺐다: user-stories 와이어 8개에서 사용 0회. 로딩 상태를 그린 화면이 없다).
variant 이름은 **DESIGN §6.4가 정본**이다 — spec·tasks가 각자 다른 이름을 들고 있던 것을 그쪽으로 맞췄다.

| 프리미티브 | Radix | 비고 |
|---|---|---|
| `Button` | — | `cva` variants `primary`·`default`·`danger`·`ghost`·`link`, sizes `md`(`h-8`, 기본)·`sm`(`h-7`). 색은 DESIGN §6.4 표의 클래스 그대로. `loading` prop이 **라벨 교체**를 든다 |
| `Input`·`Textarea`·`Select`(native)·`Radio` | — | `FormGroup`(label + help + error)이 감싼다. `Textarea`는 `rows=1` + `field-sizing-content`(지원 브라우저에서 내용만큼 자란다, 미지원이면 1행 고정) |
| `Badge` | — | variants `muted`·`warning`·`danger`(DESIGN §6.4). 알약, 12px |
| `Alert` | — | variants `info`·`success`·`warning`·`danger`, `dismissible`, 제목 + 본문 + 액션 슬롯. **Publish 결과·편집 손실 배너·페이지 수준 거부**가 전부 이것이다. 배치 셋(global·page-level·in-block)은 DESIGN §6.4 |
| `Card` | — | 헤더(제목 + 우측 슬롯) + 본문 |
| `Table` | — | `thead` sticky, 행 hover, 밀도 규칙은 DESIGN §5 |
| `Breadcrumb` | — | 페이지 콘텐츠 첫 줄 (§2) |
| `Avatar` | — | 이니셜 폴백. GitHub `image`가 있으면 그것 |
| `EmptyState` | — | 제목 + 설명 + 액션. 일러스트 없음 |
| `DropdownMenu` | `radix-ui` DropdownMenu | 사용자 메뉴·프로젝트 전환 (6b 역할 변경은 native `Select`) |
| `Dialog` | `radix-ui` Dialog | 6a는 툴바의 초대 폼 하나 · 6b 멤버 제거 확인 |
| `Tooltip` | `radix-ui` Tooltip | 접힌 사이드바의 아이콘 라벨 (`aria-label`과 함께) |

**포커스 링 규칙이 바뀐다.** 지금은 "raw 태그마다 셋을 리터럴로 적는다"(옛 DESIGN §7 — 상수에 숨기면 스캐너가 못 본다)인데, 프리미티브가
서면 링은 **프리미티브 안에 한 번** 있고 화면은 raw 태그를 쓰지 않는다. `focus-ring.test.ts`가 그에 맞춰 둘로 바뀐다:

1. `components/ui/`를 **더 이상 제외하지 않는다** — 프리미티브의 `<button>`·`<input>`·`<select>`·`<textarea>`가 셋을 든다. `ring-offset-1`은 muted 표면
   (사이드바 항목·칩 옆 버튼)에만이다 — 네 태그 전부가 아니다(DESIGN §7).
2. `app/`·`components/`(`ui/` 밖)의 raw 네 태그는 **축소형 허용 목록**으로 센다(§3.1.5와 같은 형) — 목록 밖 파일에 raw 태그가 있으면 red, 목록의 파일에
   없어도 red(낡은 항목). 초기 목록은 지금 raw 태그를 쓰는 파일 전부, T8 끝에 빈다. `type="hidden"` 제외.

"의도된 중복" 규칙은 사라진다 — 중복의 이유(hand-rolled)가 사라지기 때문이다. HEAD의 DESIGN §7이 이미 그렇게 쓰여 있다(spec §2.5 ⚠️).

**`client-graph.test.ts`의 허용 목록이 넓어진다** — 지금은 `react`·`react-dom`·`clsx`·`tailwind-merge`뿐이라(`client-graph.test.ts:37`) 프리미티브의
`radix-ui`·`class-variance-authority`·`lucide-react`가 전부 위반이다(`SKIP_DIR`의 `ui`는 진입점 탐색만 건너뛰고 import를 따라가면 들어간다). 셋을 더하는 것은
그 파일 주석이 요구하는 **"여기서 한 번 하는 의도된 결정"** 이고, 메타 테스트가 셋을 각자 고정한다(T1). 처음 초안 §9의 "변경 없음"은 거짓이었다(CTO·QA 검수).

아이콘은 `lucide-react`(설치돼 있고 사용 0곳)를 16px로 쓴다. GitLab 아이콘 세트(`gitlab-svgs`)를 들이지 않는다 — 의존성 하나로 충분하고
16px 라인 아이콘이라는 성질은 같다.

**어디에 쓰는지의 정본은 DESIGN §6.8이다** (2026-09-08 추가). 요지 셋: **셸(사이드바 섹션·하단 전역 항목·top bar)은 전 항목이 아이콘을 든다** — 접힌
아이콘 레일에서 아이콘이 유일한 라벨이라 하나라도 비면 그 상태가 성립하지 않는다. **주 행동 버튼·필터·Alert·EmptyState도 든다.** 반대로 **배지·카드
제목·표 헤더·반복 목록의 모든 행에는 쓰지 않는다** — 같은 아이콘이 n번 반복되면 정보량이 0이다. ⚠️ **`lucide-react` 1.37.0에 `Github`이 없다**(1.x가
브랜드 아이콘을 뺐다) — 연결 버튼은 `Link2`이거나 라벨만이다.

### 3.3 번역 화면 — 기본 착지는 "남은 일이 있는" 첫 네임스페이스

- `?ns=` 없음 → `defaultNamespace(counts, focus)` = 기준 로케일(`?focus=`)에서 **pending>0인 첫 네임스페이스**(`compareKeys` 순 — 그 함수는
  `lib/adapters/shared`에서 온다, view.ts는 잎이 아니다). 전부 0이면 `compareKeys` 첫 ns, orphaned만 있는 ns는 건너뛴다, 키가 없으면 `null` → "No keys yet"
  빈 상태(2026-09-08 — `compareKeys` 첫 항목은 알파벳순이라 이미 다 번역된 사소한 ns일 수 있었다). **"All keys"는 `?ns=*`** 로만 간다 — `*`는 어댑터가
  만들 수 없는 네임스페이스 이름이라 충돌하지 않는다(`all`은 실제 키 접두일 수 있다). "All keys" 행에도 `pending/total`이 있어 전역 잔여량이 보인다.
- 서버는 여전히 **전 키를 읽는다**(`loadKeys`) — 네임스페이스 패널의 집계에 필요하고, 12.7초의 원인은 조회가 아니라 `<input>`
  2,711개의 렌더였다. 렌더되는 행만 준다. 조회를 네임스페이스로 좁히는 최적화는 관측되면 그때.
- 텍스트 필터 `?q=`(키·모든 로케일 값의 부분 일치, 대소문자 무시)와 상태 필터 `?state=needs-review|untranslated`는 `filterRows(rows,
  { q, state, locale })` 순수 함수 하나가 든다. 서버 렌더 필터라 URL이 상태다 — 공유 가능하고 새로고침에 살아남는다. 0행이면 "No keys match" 빈 상태.
- 링크 생성은 **`lib/routes.ts`** 한 곳이다(`routes.translations(slug, { ns, focus, q, state })`). 2026-09-05의 하드코딩 경로 사고
  (POSTMORTEM)가 페이지의 `qs()`를 만들었는데, 경로 리터럴이 페이지마다 흩어질 자리가 늘었다. `entry-points.test.ts`의 "죽은 라우트 링크"가 그 파일도
  스캔하도록 넓히되 — **그 검사의 `STATIC_PATH`(`:192`)는 정적 경로만 잡고 `${slug}` 템플릿은 밖이다.** `routes.ts`는 대부분 템플릿이라 그대로 더하면 거의 빈
  검사다(2026-09-05 사고가 정확히 동적 경로였다). "쿼리 파라미터의 수신자"가 이미 가진 `shape()`(`:233`, `${…}`→`*`) 정규화를 이 검사에도 적용한다.
- 셀은 `Textarea`이고 **Enter=저장(blur)·Shift+Enter=개행·Esc=되돌리기** — 지금 `translation-input.tsx:66-69`의 습관을 잇는다. Enter가 개행이면 저장 트리거가
  blur뿐이고 개행이 값에 조용히 들어간다.

### 3.4 Publish — 다섯 상태와 남는 링크

`PullResult`:

```ts
| { status: "skipped"; reason: "no-edits" | "no-changes"; warnings?: string[] }
| { status: "committed"; pr: "created" | "updated"; commitSha; prUrl; changed: string[]; warnings?: string[] }
```

`run.ts:158`이 이미 `GitClient.findOpenPrUrl`(`lib/pull/client.ts:64`)의 결과로 둘을 안다 — 값으로만 안 내고 있었다. `existing === null ? "created" : "updated"`
한 줄을 그 자리에 인라인한다(별도 함수·테스트 없음). `pullMessage`가 **문구 다섯·tone 넷**을 낸다 — "다섯 tone이 다르다"는 성립하지 않는다(success 둘, Alert variant 넷):

| 상태 | 판정 | tone | 문구(en) — **편집자 어휘** |
|---|---|---|---|
| 변경 없음 | `skipped` · warnings 0 | `info` | Nothing to send — everything is up to date. |
| 새로 보냄 | `committed` · `pr: created` · warnings 0 | `success` | Sent for review. Your developers need to accept it before their next code push. [View what was sent] |
| 먼저 보낸 것을 갱신 | `committed` · `pr: updated` · warnings 0 | `success` | Updated what you sent earlier with your latest changes. [View what was sent] |
| 일부 미기록 | `committed` **또는 `skipped`** · warnings ≥ 1 | **`warning`** | Sent, but {n} values could not be written — tell your developers. `<details>`에 못 쓴 파일 목록. [View what was sent] |
| 실패 | `failed` | `danger` | Couldn't send: {reason} |

`lib/pull/__tests__/message.test.ts:52,59`가 `PR|pull request|merge|commit|branch` 어휘를 **금지**하고 있고 SAAS §7.6("PR 생성은 완료가 아니다")의 방향이
그쪽이라 문구가 이 규칙을 지킨다 — 처음 초안의 "new pull request"·"[View pull request]"는 그 테스트를 red로 만들었다(QA 검수). "일부 미기록"이 `success`가
아니라 `warning`인 것이 SAAS 불변식 9이고, **`skipped`에 warnings가 붙어도 같다**(2층 스킵 + writer 경고) — 처음 초안은 `info` 뒤에 경고를 덧붙였는데 그것은
버린 값을 info로 접는 것이라 같은 불변식 위반이다. warning 본문이 **어느** 파일인지 없으면 비개발자가 행동할 수 없다 — `<details>`가 `first-ingest-retry.tsx:67-71`의
형으로 목록을 편다(6a에서는 `warnings: string[]`의 원문 그대로, 6b가 코드화).

**보낸 것의 링크가 새로고침을 넘어야 한다.** `Project`에 additive 둘 — `lastPublishedAt DateTime?`·`lastPrUrl String?`. `lib/pull/load.ts:94`의
`saveLastPulledAt`이 `committed`일 때 함께 쓴다(같은 `update` 한 번). cron 경로도 `runPull`을 지나므로 야간 pull이 만든 PR도 남는다.
`skipped`는 이 둘을 건드리지 않는다 — "마지막으로 **보낸**" 것이지 "마지막으로 시도한" 것이 아니다.

머지 여부는 **묻지 않는다** (spec §4). 툴바 문구는 "Last sent 2 days ago · View what was sent"이고 "merged"라는 말을 쓰지 않는다. 머지가 경계라는 사실은
성공 문구 본문("need to accept it before their next code push")이 한 번 말한다.

결과 표시는 **`Alert`** 이고 툴바 아래 고정 자리다. 토스트가 아닌 이유는 `pull-button.tsx`가 이미 적어 뒀다(피드백 방식이 둘로
갈린다) — 이번엔 저장 상태도 셀 인라인이라 **토스트가 0개**인 것이 규칙이 된다. Alert는 `PullButton`이 소유하는 클라이언트 상태라
**readiness 분기 밖**에 있고(POSTMORTEM 2026-09-07 revalidate), Publish는 `revalidatePath`를 부르지 않으므로 그 함정에 애초에
걸리지 않는다 — 다만 `lastPublishedAt`이 바뀌었으니 툴바의 "Last sent"는 다음 서버 렌더에서 갱신된다. Publish 뒤 `router.refresh()`를
부르면 Alert 상태가 같은 자리에 남은 채 툴바가 갱신된다.

### 3.5 미배포 변경 수 — `updatedBy`가 사람인 행만 센다

```ts
// lib/keys/query.ts
prisma.translation.count({
  where: { projectId, updatedBy: { not: null }, ...(lastPulledAt ? { updatedAt: { gt: lastPulledAt } } : {}) },
});
```

`updatedAt > lastPulledAt`만으로는 안 된다 — **push가 전 행의 `updatedAt`을 올리므로** push 직후 야간 pull 전까지 903키 전부가
"unpublished"로 나온다. push가 쓴 행은 `updatedBy`가 없고(§3.6이 이를 보장한다) 사람이 저장한 행만 `User.id`를 든다.

Prisma `count`인 이유(2026-09-08): 처음 초안은 raw SQL이었는데 하네스에 `$queryRaw`가 없어 `projectId` 좁힘을 판정할 수 없었다. `count`는 하네스에
`translation.count`를 더하고 **시드에 프로젝트를 둘** 두면 검증된다. `Translation(projectId, updatedAt)` 인덱스가 이미 있다.

기준이 `lastPublishedAt`이 아니라 **`lastPulledAt`**인 이유: `lastPulledAt`은 벽시계가 아니라 캡처된 `max(updatedAt)`이고 `no-changes` 스킵에도 전진한다
(`run.ts:141`) — "사람이 만졌고 마지막 pull 판정 뒤 바뀐 행"을 정확히 센다. `lastPublishedAt`은 "보낸" 시각이라 두 컬럼의 의미가 다르다.

순수 함수는 `isUnpublished({ updatedBy, updatedAt }, lastPulledAt)` 하나고, 위 `count`는 그것의 집계 형태다. 같은 술어를 행 단위로도 쓴다 — 셀 메타의
"Not yet sent" 점 표시(`loadKeys`의 select에 `updatedAt`을 더한다).

⚠️ **경계 하나** (spec §5): push의 `needsReview` 전파가 `updatedAt`을 올리므로, 이미 Publish된 사용자 편집이 원문 변경으로
`needsReview`가 되면 다시 센다. 그 값은 실제로 재검토 뒤 다시 나가야 하므로 틀린 신호는 아니다. 그 UPDATE 문에서 `updatedAt`을 빼는
것은 pull 1층 판정(`max(updatedAt)`)에 닿는 변경이라 이번에 하지 않는다.

### 3.6 덮인 셀 — push가 `updatedBy`를 비운다 (MVP §10 미결의 답)

`applyPush`의 번역 upsert `ON CONFLICT … DO UPDATE SET` 에 `"updatedBy" = NULL`을 더한다. strict 덮어쓰기에서 **값의 저자는 리포**이므로
사람 이름이 남는 것이 거짓이었다. 결과:

- 셀 메타는 `updatedBy`가 있을 때만 "Edited by {name}"을 낸다. **"From repository" 같은 표시는 두지 않는다** — push 직후엔 전 행이 그
  상태라 가장 흔한 상태가 가장 시끄러워진다(DESIGN의 배지 원칙).
- §3.5의 미배포 집계가 이 결정 위에 선다.
- `lib/push/__tests__/flow.test.ts`의 SQL 캡처가 `"updatedBy" = NULL`을 고정한다. `app/(edit)/__tests__/authorization.test.ts:222-226`의
  `updatedBy: "u-editor"` 단언은 **저장 경로**라 그대로 맞다. 실측: push upsert는 `updatedBy`를 INSERT 열에도 SET에도 두지 않고(`apply.ts:194·209-214`)
  `updatedAt`은 무조건 올린다.
- 옛 GitHub 핸들이 남은 행(malmoi#3 이전)은 다음 push가 그 키를 덮을 때 함께 비워진다 — 그 전까지는 `isUnpublished`가 사람 편집으로 센다. 옳다(사람이 만진 값이다).

### 3.7 orphaned 로케일 — 2026-09-06 임시안을 확정한다

열 유지 + 헤더 `Badge danger "Orphaned"` + 셀 `disabled` + placeholder. 열을 숨기면 "로케일이 사라졌다"를 편집자가 알 길이 없고,
편집을 허용하면 `updatedAt`만 올라 pull이 헛돈다(저장 Action의 거부는 그대로). 확정이라 SAAS §8 6단계 체크 하나가 닫힌다.

### 3.8 저장 상태 — 접근성 둘 (2026-09-08 재설계)

처음 초안(셀마다 `role="status"` + 실패 시 무조건 `focus()`)은 둘 다 틀렸다(CDO 검수): 903행×3로케일이면 live region 2,700개이고, blur 저장은 비동기라
실패 응답이 올 때 사용자는 이미 **다음 셀에 타이핑 중**일 수 있다 — 그 순간 커서를 뺏으면 입력이 엉뚱한 셀로 간다(WCAG 3.2 예측 가능성).

- **live region은 표 하나에 시각 숨김(`sr-only`) `aria-live="polite"` 영역 하나**다. 결과만 알린다 — "Saved common.viewAll · ko" / "Couldn't save common.save · fr: …".
  "Saving…"은 알리지 않는다. 셀 안 상태줄("Saving…"·"Saved"·"Couldn't save: …")은 **시각 전용**이다.
- 실패 시 포커스는 **`document.activeElement`가 `body`이거나 같은 셀일 때만** 되돌린다. 아니면 상태줄에 **[Retry]** 버튼(`Button link sm`)이 재시도 지점이다 —
  포커스는 사용자가 옮긴다. 이 조건은 `translation-input.tsx` 안의 작은 순수 함수(`shouldRefocus(active, own)`)로 떼어 테스트한다.
- 성공은 조용하다("Saved"는 1.5초 뒤 사라진다 — 903행에서 영구 텍스트가 쌓이면 표가 시끄럽다).
- **세션 만료 중 저장**: Action은 redirect 없이 `{ ok: false, error: "unauthorized" }`를 돌려준다(`app/(edit)/actions.ts:34`). 사전 갈래로 "Your session ended — sign in
  again. Your text is kept." + 로그인 링크(`Button link`), `unavailable`은 "Temporary problem — try again". 입력값은 그대로 둔다.

### 3.9 멤버 화면 — **6b** (검수 지적을 반영해 다시 쓴다)

> ⚠️ 2026-09-08 검수: (a) `github-connect/spec.md:45,127`은 "`/settings` 페이지에 멤버 섹션"으로 결정했다 — 별도 라우트의 근거(EDITOR가 목록을 봐야 하는데
> `/settings`는 `project:settings` 뒤)를 spec에 쓰고 그쪽을 stale로 표시해야 한다. (b) 사이드바는 Members를 **전원**에게 렌더한다(EDITOR도 목록을 본다 — 처음 초안의
> "OWNER만"은 스토리와 모순이었다). (c) `revokeInvitation`은 `deleteMany`가 아니다 — 아래.

- `loadMembers(prisma, projectId)` → `{ userId, name, email, role, joinedAt }[]` (email은 렌더 시 `maskEmail`).
- `loadPendingInvitations(prisma, projectId)` → `acceptedAt IS NULL AND expiresAt > now()`. 모델명은 **`ProjectInvitation`**.
- **`revokeInvitation({ slug, invitationId })`** 신설 — `member:manage` + `updateMany({ where: { id, projectId, acceptedAt: null }, data: { expiresAt: now } })`.
  처음 초안의 `deleteMany`는 `prisma/schema.prisma:365`("행을 지우지 않는다 — 재사용 시도를 `already-accepted`로 구별해야 한다")와 충돌하고, 기존 무효화 관용구가
  `createInvitation`의 `expiresAt = now`(`actions.ts:132`)다. `loadPendingInvitations`의 술어가 그대로 맞는다. 이미 수락된 행은 건드리지 않는다.
- 역할 변경(native `Select`)·제거는 기존 `changeMember`. 제거는 `Dialog` 확인 한 번. 마지막 OWNER 거부 문구는 `accessErrorMessage("last-owner")`가
  행 옆 인라인에 닿는다.
- EDITOR는 목록을 본다(`translation:write`로 페이지 진입) — 컨트롤은 role로 감추고 Action이 `member:manage`로 거부한다.
- 대기 초대 0건의 빈 상태 · `?e=` global Alert 슬롯이 와이어에 있어야 한다.
- `components/invite-form.tsx`는 이 커밋에서 삭제된다(6a는 툴바 `Dialog`로 옮겨 둔다 — 초대 수단 없는 창을 만들지 않는다).

### 3.10 계정 화면 — **6b** (만들지 말지부터)

> ⚠️ 2026-09-08 검수: SAAS §8 6단계 3번이 이미 `[x]`이고 착지처가 `/projects`다(계정 섹션이 거기 있다 — `disconnectGithub()`은 `app/(edit)/projects/actions.ts`에
> **커밋돼 있다**, `requireUser`, 자기 `Account` 행). `/account`는 그 섹션의 이사일 뿐인데 라우트·matcher·`StateDest` 갈래(배포 직후 10분 옛 쿠키 창)·
> `entry-points`·사이드바 항목이 따라온다. **추천: 만들지 않는다** — 사용자 메뉴에 "GitHub account" 항목으로 `/projects` 계정 섹션에 간다.

만든다면: `/account` (`requireUser`) · `middleware.ts` matcher에 `/account/:path*`(`entry-points.test.ts` "보호 라우트가 미들웨어 matcher에 있다"(`:333`)가 센다) ·
`startGithubConnectForUser`는 **무인자**이고 `dest`가 안에 `new`로 고정돼 있어(`actions.ts:295·313`) `dest` 인자 추가는 시그니처 변경이다(`onboarding.test.ts` 호출부 갱신) ·
`landing`은 `lib/github-connect/state.ts`가 아니라 **`app/api/github/callback/route.ts:177`의 지역 함수**(request 인자)라 잎으로 내리는 작업이 신설로 붙는다(`state.ts`엔
`StateDest` 타입만 있다) · 설정 화면의 GitHub 계정 섹션은 "Connected as @handle · Manage in Account" 한 줄.

### 3.11 편집 손실 창 배너 (2026-09-08 재정의)

`countUnpublished > 0`이면 툴바 아래 `Alert warning` — **"{n} changes not yet sent. They can be lost if your developers push code first — send them when you're done."**
(`one`/`other` 함수 값). MVP §3.1이 감수한 대가를 **편집자가 보는 자리**에 처음으로 적는 것이다.

처음 초안("{n} unpublished changes. A code push before you publish will overwrite them.")의 결함 셋(CDO·CPO 검수): 주어가 "code push"라 §3.11 자신의 원칙(편집자가 할
수 있는 일이 주어)과 어긋났고, 실제 경계는 pull 실행이 아니라 **PR 머지**인데(Publish를 눌러도 머지 전 push면 덮인다) 그것을 담지 않았고, 닫기 키가 세션이라 count가 3→7로
바뀌어도 닫힌 채였다. 지금:

- 닫기 키는 **`lastPulledAt`**(`sessionStorage` — 다음 Publish 뒤 값이 바뀌어 다시 보인다). SSR은 닫힘 상태를 모르므로 **클라이언트 마운트 뒤에만 렌더**한다(플래시 방지).
- 결과 Alert(§3.4)와 같은 자리이고 **결과 위·배너 아래**로 고정한다.
- 머지 경계는 성공 문구 본문(§3.4 "need to accept it before their next code push")이 말한다 — 배너는 편집자의 행동(send)만 말한다.

### 3.12 로그인 화면 — 2열, 일러스트는 CSS만, **raw 색 0**

폼 좌 / 장식 우(스크린샷 2의 GitLab 가입 화면 형). 우측은 dot-grid(`--border`) + 그라디언트(**`from-primary/5 to-muted`** — 처음 초안의 "연보라"는 DESIGN §6.2가
명시로 막은 raw 색이자 GitLab 브랜드 보라라 "색은 안 가져온다" 경계를 유일하게 넘는 자리였다) + **정적 모형 카드 하나**(SVG 인라인 — 로케일
파일 둘이 체크되고 브랜치 이름이 붙은 카드). 이미지 파일을 두지 않는다 — `public/`에 생성물 아닌 바이너리를 늘리지 않고, 다크·해상도
문제가 없다. `lg` 미만은 좌측 카드 하나. `?error=`는 Alert.

### 3.13 설정 — settings-block 넷 (6a) + 기준 브랜치·기준 로케일 변경 (**6b** — 🔴 다시 쓴다)

섹션은 GitLab settings-block 형(제목 · 한 줄 설명 · 본문)이고 **각자 독립적으로 실패**한다(DESIGN 기존 규칙 유지). 계정 섹션은 6a에서 **그대로**다.
`FirstIngestRetry`는 readiness 분기 밖 유지. `?e=`는 global Alert(DESIGN §6.4 배치 — 처음 초안은 "목록 위"·"상단"·"global" 셋으로 갈려 있었다).

> ⚠️ **2026-09-08 검수 — 아래 설계는 그대로 구현하면 pull이 깨진 파일을 낸다** (CTO 🔴). push·pull의 base 진실은 `Project.baseLocale`이고(`lib/pull/load.ts:30`·
> `run.ts:85`·`render.ts:115`) `Locale.isBase`는 편집 UI만 읽는다(`lib/keys/query.ts:42`). UI가 저장한 뒤 CI push는 409로 막히지만 **야간 pull은 막히지 않는다** — 새 base
> 파일에 `value ?? sourceText`(`lib/pull/plan.ts:174`) 폴백이 걸려 옛 base의 원문이 새 base 파일에 실린 PR이 나간다. 또 **재적재 경로는 CI 하나뿐이다** — `runFirstIngest`는
> ready에서 `not-awaiting`(`actions.ts:676`). 그리고 살아남는 키 전부 `sourceHash`가 바뀌어 **`needsReview` 일괄 전파 + `updatedAt` 일괄 상승**(`plan.ts:178`·`apply.ts:170`)이
> 온다. 답의 후보: `Project.baseLocale`만 "선언"으로 바꾸고 `Locale.isBase`는 push 소유(`apply.ts:94`)로 둔다 → `isBase ≠ baseLocale`이 "재적재 대기" 신호가 되어 pull이
> `skipped: base-change-pending`으로 멈추고 UI 배너가 같은 조건을 읽는다. 트랜잭션 스왑·`planBaseLocaleChange`의 절반이 사라진다. 6b 착수 때 이 절을 다시 쓴다.

**Repository 블록에 편집 가능한 필드 둘이 들어간다** — SAAS §3 표가 "화면이 없다 — 그 화면은 6단계"라 적어 둔 것이다. (아래는 처음 초안 — 위 ⚠️의 답으로 대체된다.)

| 필드 | 저장 | 파생 효과 | 순수 판정 |
|---|---|---|---|
| **Base branch** | `Project.baseBranch` | pull이 커밋 parent·PR base로 쓴다(`run.ts`) · 워크플로 YAML의 `branches: [x]`가 바뀐다 | `isValidBranchName` — `git check-ref-format` 부분집합(공백·`..`·`~^:?*[`·끝 `/`·`.lock` 금지). `isRefSafeSlug`보다 넓다(`/`·대문자 허용) |
| **Base language** | `Project.baseLocale` + `Locale.isBase` 스왑(한 트랜잭션, `projectId`로 좁힌다) | 키 집합의 진실이 바뀐다(다음 push부터) · export의 description 폴백 · `needsReview` 전파 제외 대상 · 화면의 첫 열 · YAML의 `base-locale:` | `planBaseLocaleChange(current, next, locales)` — `next`가 **orphaned 아닌 기존 로케일**이어야 하고 현재와 같으면 `noop` |

⚠️ **둘 다 CI와 충돌한다 — 그리고 그 충돌을 서버가 409로 막는다.** `lib/push/guard.ts`의 `checkFormat`(커밋됨, `ab44ec8`)이 payload의 `adapter`·`pathTemplate`·`baseLocale`
**셋 중 하나라도** 저장값과 다르면 `wrong-format`을 낸다(`guard.ts:56-77`, `nested`는 제외). 그래서 UI가 기준 로케일을 바꾸면 **워크플로의 `base-locale:` 입력을
바꾸기 전까지 그 리포의 push는 409**다. 이것은 결함이 아니라 원칙이다 — 키 집합의 진실은 코드이고, DB와 CI가 다른 base를 주장하는 상태를 strict
push가 조용히 받으면 진짜 base의 키가 orphan된다(ACTIONS.md `base-locale` 행). 따라서 저장 성공 응답에 **재생성한 YAML**을 함께 돌려주고 블록 안
`Alert warning`으로 "Update `.github/workflows/l10n.yml` — until then CI pushes are rejected"를 낸다. base branch는 push를 막지 않지만(guard가 안
본다) `on.push.branches`가 옛 브랜치를 가리켜 **CI가 영영 안 돈다** — 같은 Alert에 같은 이유로 실린다.

Action은 `updateRepositorySettings({ slug, baseBranch, baseLocale })` 하나(`project:settings`)다 — 둘을 한 폼에 두므로 저장도 하나다. 결과에
`workflowYaml`이 실린다. 이 컴포넌트는 revalidate로 바뀌는 분기 밖이다(블록 자체는 readiness와 무관).

**base 로케일 변경이 데이터에 하는 일의 경계**: `Translation`·`StringKey` 행은 건드리지 않는다. 옛 base 로케일의 번역은 그대로 남고 다음 push가
새 base 파일로 키 집합을 다시 세운다(사라진 키는 orphaned — 되돌릴 수 있다). `sourceText`·`sourceHash`는 push가 다시 채운다. **UI가 재적재를
돌리지 않는다** — 재적재는 **CI 하나뿐**이고(위 ⚠️ — [Run first import]는 ready에서 거부한다), 그것을 자동으로 이어 붙이면 저장 하나가 GitHub 왕복이 된다.

### 3.14 목록·온보딩·초대 — 형만 바뀐다

`/projects`는 행 구조(아바타·이름·리포·역할·상태) + EmptyState. `/projects/new`는 상태 기계 그대로(`features/project-onboarding/design.md`
§2·§3.4 — 중간 상태 무저장, 확정은 파일 재검증) + `FormGroup`·`Card`. 어댑터 라벨은 여전히 서버가 `formatLabel`로 내려준다 — **그 함수의
문구도 사전에서 나온다**(`lib/onboarding/detect.ts`가 `@/lib/i18n`을 읽는다 — 잎이라 무게가 없다). 초대 수락은 셸 밖 카드.

## 4. 순수 함수로 분리 가능한 부분 — `/tdd` 대상

| 함수 | 위치 | 판정 |
|---|---|---|
| 사전의 함수 값(카운터·노드 삽입) | `messages/en.tsx` | 0·1·2 · 노드 참조 동일성 (`dictionary.test.ts`) |
| `defaultNamespace(counts, focus)` | `lib/keys/view.ts` | focus 기준 pending>0인 첫 ns → 없으면 `compareKeys` 첫 ns → orphaned만 있는 ns 건너뜀 → 비어 있으면 `null` |
| `resolveNamespace(param, counts, focus)` | `lib/keys/view.ts` | `undefined` → default · `"*"` → all · 없는 이름 → default (404가 아니다 — 필터가 낡은 링크일 수 있다) |
| `filterRows(rows, { q, state, locale })` | `lib/keys/view.ts` | 키·값 부분 일치(대소문자 무시) + 상태 필터. `q` 공백은 무필터. 0행 가능 |
| `isUnpublished(cell, lastPulledAt)` | `lib/keys/view.ts` | §3.5 술어 (`lastPulledAt null`이면 `updatedBy`만) |
| `pullMessage(outcome)` 확장 | `lib/pull/message.ts` | 문구 다섯 · tone 넷 · href. exhaustive. 어휘 금지 테스트 유지 |
| `shouldRefocus(active, own)` | `components/translation-input.tsx` 안 | §3.8 — `active === body \|\| active === own` |
| `routes.*` | `lib/routes.ts` (잎) | 쿼리 undefined 제거 · `*` 인코딩 |
| `readinessLabel` · `formatLabel` · `ingestHeadline` · 문구 모듈 넷 | 기존 자리 | 사전 읽기로 바뀌어도 시그니처는 같다 — 기존 테스트가 문구 상수만 바꿔 그대로 산다 |
| `stripComments(src)` (스캐너용) | `lib/i18n/__tests__/no-korean-ui.test.ts` 내부 | `//`·`/* */`·`{/* */}` 셋. 메타 테스트로 각각 검증 |
| `Button`/`Badge`/`Alert` variant 매핑(`cva`) | `components/ui/*` | 렌더 테스트는 두지 않는다 — variant→클래스 표는 소스 스캔이 아니라 `focus-ring`류 상시 검사가 든다 |
| (6b-3) `isValidBranchName` · `planBaseLocaleChange` | §3.13 | 6b-3 착수 때 정한다 — 그 절을 다시 쓰는 것이 선행이다 |
| ~~(6b-1) `AdapterErrorCode`+`adapterErrorMessage` · `classify(code)`~~ ✅ **닫혔다** (2026-09-08) | §3.1.4 | 코드 스물둘 + `lib/i18n/adapter-errors.ts`. ⚠️ **"재측정만이 판정한다"가 틀렸다** — 코퍼스가 밟는 갈래는 여섯뿐이라 옛 문구 22개와 옛 분류기를 픽스처로 든 `classify.test.ts`가 실제 방어선이다 |

`pullResultPr`·`landing(dest)`는 목록에서 뺐다 — 앞은 한 줄 삼항이라 이름·테스트를 붙일 이유가 없고(`run.ts:158`에 인라인), 뒤는 `state.ts`가 아니라 callback route의
지역 함수라 6b가 `/account`를 만들 때만 대상이 된다.

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

`/db`가 `--create-only`로 SQL을 만들고 dev에 적용 → `/push` → `/merge` 1단계에서 `db:deploy`. **스키마+마이그레이션 커밋과 코드 커밋을 나눈다**(`/db` 6단계 규칙 —
처음 초안은 한 커밋이었다). 컬럼 둘 다 nullable이라 옛 코드가 읽어도 무해하다(additive-first). `Translation.updatedBy`의 **의미**는 §3.6으로 바뀌지만 컬럼은
그대로다 — POSTMORTEM 2026-09-07(cuid)의 규칙대로 **읽는 자리를 전수로 센다**: `lib/keys/query.ts`(조회)·`lib/keys/view.ts`(`actorLabel`)·번역 페이지(렌더)·
`app/(edit)/__tests__/authorization.test.ts:222-226`(저장 단언)·`lib/keys/__tests__/actor.test.ts:87-97`(페이지 소스 스캔 — T7이 페이지를 재작성하면 이 스캔이
깨지거나 공허해진다, 이름이 바뀌면 함께 갱신) 다섯이고, 바뀌는 것은 렌더의 "Edited by" 조건뿐이다.

## 6. 환경변수

없다. `.env.example` 변경 없음.

## 7. 불변식 영향

| 불변식 | 영향 |
|---|---|
| export 결정성 (ARCH §1) | **없음 (6a).** `lib/adapters/**`를 건드리지 않는다. ✅ **6b-1의 코드화도 오류 보고 경로만 바꿨다** — `key-order-golden`·`contract`·`write-contract`가 green이고 재측정(학습+홀드아웃)이 13차와 동일했다(§20). 함께 들어간 `json-catalog`의 `hasOwn` 가드도 바이트에 안 닿는다 |
| blob SHA·2층 스킵 (ARCH §2·§3) | **없음.** `run.ts`는 `pr` 값 하나를 결과에 더하고 `saveLastPulledAt`이 컬럼 둘을 더 쓴다 |
| 인증 경계 (ARCH §6.1) | 6a는 라우트를 늘리지 않는다. 레이아웃은 여전히 차단이 아니다 — 사이드바의 역할별 노출은 편의다. 6b의 신설 라우트는 `entry-points.test.ts`가 자동으로 센다 |
| 테넌트 격리 (CLAUDE.md) | 신설 조회 둘(`countUnpublished` — `projectId` · `loadMemberships` — `userId`)이 좁힌다. 하네스 시드에 프로젝트·사용자를 둘씩 둔다. `disconnectGithub`은 이미 `userId`로 좁힌다 |
| 자격증명 셋 (ARCH §6) | 6a는 GitHub 호출을 늘리지 않는다. `credential-separation.test.ts` — `lib/onboarding`이 `@/lib/i18n`을 읽는 것은 허용 방향 |
| 잎 모듈·클라이언트 번들 (ARCH §6.35) | `lib/i18n/`·`lib/routes.ts`가 잎이다. `detect.ts`·`readiness.ts`가 `@/lib/i18n`을 읽어도 방향이 반대라(무게 없는 쪽을 읽는다) 안전하다. `client-graph.test.ts`가 센다 — 허용 목록 셋 확장은 §3.2 |
| SAAS 불변식 9 (버린 값을 숨기지 않는다) | Publish의 "일부 미기록"이 `warning` tone으로 갈린다 — `skipped`+warnings도 같다. warning 본문 `<details>`에 파일 목록. 첫 적재 부분 실패 목록은 유지(원문 메시지는 `<details>` 진단) |
| SAAS 불변식 9의 UI 규칙 (revalidate 밖) | 인라인 결과를 보이는 컴포넌트 셋(`PublishButton`·`FirstIngestRetry`·`PushTokenPanel`)이 조건부 분기 밖에 있다 — `FirstIngestRetry`는 이미 그렇고 나머지는 분기 자체가 없다 |
| push strict (MVP §3.1) | 값 동작 불변. `updatedBy`를 비우는 것은 strict의 **귀결**이다(저자가 리포다) |

## 8. POSTMORTEM — 이 기능이 밟을 자리

| 항목 | 어디에 걸리나 | 설계의 대응 |
|---|---|---|
| 2026-08-31 레이아웃 인증 검사가 노출을 막지 못했다 | 새 셸 레이아웃 | 레이아웃은 `redirect()`만. 사이드바 노출은 편의 |
| 2026-09-05 링크 생성기가 옛 경로를 하드코딩 | 라우트 상호 링크 | `lib/routes.ts` 단일 출처 + "죽은 라우트 링크" 검사에 그 파일 추가 **+ `shape()` 정규화로 동적 경로도 대조**(§3.3 — 정적만 잡으면 그 사고를 못 본다) |
| 2026-09-06 `?e=`를 보내고 읽는 쪽이 없었다 | `/projects?e=` global Alert · 6b의 신설 페이지 | 페이지가 `searchParams`를 읽는다. "쿼리 파라미터의 수신자" 검사가 센다 |
| 2026-09-06 조회를 그 사용자로 좁히지 않았다 | 레이아웃의 `loadMemberships` | `userId` 스코프 + 하네스 시드에 사용자 둘 (§2) |
| 2026-09-07 클라이언트 번들 7.2MB | `lib/i18n/`·`lib/routes.ts`·프리미티브를 클라이언트가 읽는다 | 둘은 잎, 프리미티브의 의존 셋은 허용 목록에 **의도적으로** 추가. `client-graph.test.ts` |
| 2026-09-07 `revalidatePath`가 결과 문구를 씻어냈다 | Publish Alert | 결과를 든 컴포넌트가 revalidate로 바뀌는 분기 밖에 있다 (§3.4). Publish는 `revalidatePath`를 안 부른다(`actions.ts:104-133`) |
| 2026-09-07 컬럼 의미가 바뀌었는데 렌더가 그대로 | `updatedBy`를 push가 비운다 | 읽는 자리 다섯 전수 (§5) |
| 2026-09-07 방어선 셋이 주장한 것을 검사하지 못했다 | 새 스캐너(`no-korean-ui`) · 바뀐 스캐너(`focus-ring`·`client-graph`) | 각자 메타 테스트 — 주석 종류 셋·태그 넷·허용 패키지 셋을 하나씩 먹여 red를 내는지 본다. T1의 `client-graph` 검증은 실 소비자가 없으면 **공허하게 green**이라 픽스처를 둔다 |
| 2026-09-04 "방향만 게이트" — 잴 수단이 없는 완료 조건 | "첫 착지 2초 안" · (6b) "재측정 지표가 13차와 같다" | 측정 방법(DevTools Performance LCP, 기준선 재측정)과 비교할 값 목록(tasks 6b-1)을 문서에 박는다 |

## 9. 바뀌는 상시 검사

| 테스트 | 변경 (6a) |
|---|---|
| `components/__tests__/focus-ring.test.ts` | `ui/` 제외 해제 + raw 태그 **축소형 허용 목록** + 메타 테스트 갱신 (§3.2) |
| `app/__tests__/entry-points.test.ts` | "죽은 라우트 링크"가 `lib/routes.ts`도 읽고 `shape()` 정규화로 동적 경로를 대조하도록 확장 (§3.3). 6b의 신설 라우트는 자동으로 센다 |
| `components/__tests__/client-graph.test.ts` | **`ALLOWED`에 `radix-ui`·`class-variance-authority`·`lucide-react` 추가 + 각자 메타 테스트 + `@/lib/i18n`을 읽는 클라이언트 픽스처** (§3.2 — 처음 초안의 "변경 없음"은 거짓) |
| `lib/__tests__/globals-css.test.ts` | 변경 없음 — `@custom-variant dark`·`text-mono` 유지. **팔레트가 바뀌어도 이 테스트는 값을 안 본다** (DESIGN이 값의 정본이고 `/doc-check`이 대조한다) |
| `lib/onboarding/__tests__/workflow*.test.ts` | ACTIONS.md와 줄 대조 — YAML 주석 영어화와 문서를 같은 커밋에 |
| `lib/pull/__tests__/message.test.ts` | 문구 다섯·tone 넷 · warnings→warning(committed·skipped) · 어휘 금지 유지 |
| `lib/pull/__tests__/run.test.ts` | `pr` 두 갈래 · 한글 단언 5줄 갱신 |
| `lib/pull/__tests__/render.test.ts` | 한글 단언 9줄 갱신(진단 문구 영어화) |
| **신설** `lib/pull/__tests__/load.test.ts` | `saveLastPulledAt`이 committed/skipped에서 쓰는 컬럼 |
| `lib/push/__tests__/flow.test.ts` (SQL 캡처) | `"updatedBy" = NULL` 고정 |
| `lib/push/__tests__/guard.test.ts` | 변경 없음 |
| `lib/keys/__tests__/view.test.ts` | `defaultNamespace`·`resolveNamespace`·`filterRows`·`isUnpublished` |
| `lib/keys/__tests__/actor.test.ts` | 페이지 소스 스캔(`:87-97`) — T7 재작성 뒤에도 green이어야 한다 |
| **신설** `lib/i18n/__tests__/no-korean-ui.test.ts` · `dictionary.test.ts` | §3.1.5 · §3.1.3 |
| **신설** `lib/__tests__/routes.test.ts` | §3.3 |
| `lib/__tests__/failure.test.ts` · 문구 모듈 테스트 33줄 · `app/(edit)/__tests__/*`의 한글 단언 | 영어 기대값으로 갱신 (§1.1의 182줄 중 6a 몫) |
| `app/(edit)/__tests__/harness.ts` | `translation.count` · `projectMember.findMany`(userId) 추가 · 시드에 프로젝트·사용자 둘 |
| `prisma/__tests__/schema-contract.test.ts` | 영향 없음(Auth.js 테이블만 본다) |
| (6b) `lib/adapters/__tests__/*` · `lib/survey/__tests__/*` · `membership.test.ts` · `state.test.ts` · `branch-name`·`base-locale` | 6b 착수 때 |

## 10. 대안과 버린 이유

| 대안 | 왜 버렸나 |
|---|---|
| `next-intl` | 로케일 라우팅·미들웨어가 값인데 우리는 en 단일 + 값싼 미들웨어여야 한다 (§3.1) |
| `t("a.b.c")` 문자열 키 접근 | 경로 파싱 타입이 복잡하고 `m.a.b.c`가 같은 안전성을 공짜로 준다 |
| `messages/en.json` + `fmt`·`plural`·`rich` 헬퍼 | **처음 초안이 그랬다가 2026-09-08에 `en.tsx`로 바꿨다** — 헬퍼 셋·테스트 3벌·`resolveJsonModule`·`client-graph` JSON resolver가 전부 사라진다. JSON의 유일한 가치(말모이 자신을 프로젝트로 붙인다)는 8단계에 한 번의 변환으로 산다 |
| 사전 자체를 8단계로 미루고 영어 리터럴만 | CPO 검수의 제안 — 2026-09-07 사용자 결정("구조만 잡는다")을 지켰다. 어차피 150개를 전부 손대는 시점이 지금뿐이라 두 번째 전수 작업을 피한다 |
| `it.fails`로 스캐너를 미리 박기 | 세 방향으로 게이트를 무너뜨린다 (§3.1.5). 축소형 허용 목록으로 |
| `countUnpublished`를 raw SQL로 | 하네스에 `$queryRaw`가 없어 테넌트 격리를 판정할 수 없다 (§3.5). Prisma `count`로 |
| `/account` 라우트 신설 · 멤버 별도 라우트 · `revokeInvitation` deleteMany | 6b로 — 각자 §3.10·§3.9 머리의 ⚠️ |
| 셀마다 `role="status"` + 무조건 `focus()` | live region 2,700개 · 포커스 탈취 (§3.8) |
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

### 11.1 결정 기록 (2026-09-08, 사용자 — `/feature-review` 4관점 검수)

| # | 질문 | 결정 | 추천과 |
|---|---|---|---|
| 6 | 단계 범위 — CPO·CTO·QA가 독립적으로 같은 절단선 | **6a/6b로 쪼갠다** — 6a: 번역+Publish+셸+프리미티브+i18n 기반 · 6b: 어댑터 코드화+재측정 · base 필드 · 멤버 화면 · `/account` | 같다 |
| 7 | i18n 형태 | **`messages/en.tsx` `as const`, 함수 값** — 헬퍼 셋 없음 | 같다 |
| 8 | DESIGN.md가 이미 목표 상태 | **T5 커밋까지 유예를 명시** — 두 번 고치지 않는다 | 같다 |
| 9 | 저장 a11y | **표 단위 live region 하나 + 조건부 포커스 + [Retry]** | 같다 |
| 10 | 스캐너 전략 | **축소형 허용 목록** (`no-korean-ui`·`focus-ring`) | 같다 |
| 11 | 미배포 집계 | **Prisma `count`** (하네스에 `translation.count`) | 달랐다(추천은 "loadKeys 결과에서 JS로") |
| 12 | 로그인 장식 색 | **토큰만** (`--border` + `from-primary/5 to-muted`) | 같다 |
| 13 | Publish 문구 · 배너 · 프리미티브 · 기본 착지 | **편집자 어휘 유지(문구 다섯·tone 넷)** · **배너 재정의(닫기 키 `lastPulledAt`)** · **DESIGN §6.4 variant, Checkbox·Skeleton 삭제(16개)** · **pending>0인 첫 ns, Enter=저장** | 같다 |
| 14 | 문서 정확성·검증 줄·비범위·빚·6b 지적 기록 | **일괄 반영** | 같다 |
