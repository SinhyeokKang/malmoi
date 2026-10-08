# sidebar-projects — design

## 영향 받는 흐름

**편집 UI 셸만.** push·pull·export와 무관하다. 새 서버 조회·Action·스키마·환경변수 없음. 사전 키 하나(`common.nav.yourProjects`).

| 자리 | 변경 |
|---|---|
| `lib/shell/nav.ts` | `NavZone.key`에 `"projects"` · `NavItem`에 선택 필드 `thumbnail?: { src: string \| null }` · `navZones` 컨텍스트에 **선택** 필드 `projects?: readonly NavProject[]`(생략하면 `[]`) — `project === null`이면 `[work, projectsZone]` · `lib/shell/switcher.ts`의 `menuProjects`·lucide `Plus` import |
| `components/shell/sidebar.tsx` | `navZones`에 `projects: memberships`를 넘긴다 · `Item`이 `thumbnail`이 있으면 아이콘 자리에 `ProjectThumbnail xs`를 그린다 · 구역이 바뀐 뒤 포커스 착지(D3) · 머리 주석 갱신 |
| `messages/en.tsx`·`ko.tsx`·`es.tsx` | `common.nav.yourProjects` 추가(ko·es는 `/translate` 모드 ①) · `newProject` 주석(:402) 갱신 |
| `components/landing/mockup/app-frame.tsx` · `lib/search/nav-index.ts` | **호출 변경 없음** — 필드가 선택이고 둘 다 늘 프로젝트를 넘겨 `project === null` 분기를 밟지 않는다. `nav-index.ts:12` 주석만 고친다 |

## 핵심 결정

### D1. 목록 = `menuProjects` 재사용 + `New project` 끝 행

`projectsZone = { key: "projects", label: m.common.nav.yourProjects, items: [...menuProjects(projects).map(toRow), newProjectItem(m)] }`.

- 프로젝트 행: `{ key: "project:<slug>", label: name, icon: Box, href: routes.project(slug), exact: true, thumbnail: { src: image ?? null } }`.
  - 썸네일 이름은 `item.label`이 댄다 — `ProjectThumbnail`이 `{ name, src?, size }`를 받으므로(`components/ui/project-thumbnail.tsx:46`) 필드에 이름을 또 싣지 않는다.
  - `icon: Box`는 타입상 필수라 넣는 **읽히지 않는 값**이다 — `thumbnail`이 있으면 `Item`이 썸네일을 그린다. 그래도 `Box`를 고르는 이유: 썸네일의 이미지 없음 폴백 글리프(`project-thumbnail.tsx:51`)·사용자 축 `Projects`(nav.ts:167)와 같은 글리프라 어긋날 일이 없다. 판별 유니온은 만들지 않는다. nav.ts 주석에 "읽히지 않는 값"을 남긴다.
  - ⚠️ `exact: true`는 형식이다 — 이 구역은 지금 프로젝트가 없을 때만 서고, 프로젝트 행의 목적지(`/projects/<slug>`)에서는 늘 `project !== null`이므로 프로젝트 행이 활성일 수 없다.
- `New project` 행: `{ key: "new-project", label: m.common.nav.newProject, icon: Plus, href: routes.newProject(), exact: true }`.
  글리프는 헤더 버튼(`new-project-icon.tsx`)·검색 Pages 색인(`nav-index.ts`의 `page:new-project`)과 같은 `Plus`다(같은 목적지 = 같은 글리프 — DESIGN §6.5).
- 상한·순서·보관 제외는 `menuProjects`(`lib/shell/switcher.ts:28-32`)가 정한다 — 제네릭 `T`를 그대로 돌려줘 `image`가 보존된다. 아바타 메뉴와 같은 목록이라 두 자리의 순서가 갈리지 않는다(spec 범위 게이트 결정 3). `MENU_LIMIT` 주석(switcher.ts:20 "소비자 하나 · 메뉴 14줄")과 `menuProjects` 주석(:24)을 소비자 둘(메뉴 · LNB 목록 구역)로 고친다.
- `menuProjects`는 보관을 빼므로 0개면 `items`가 `[newProjectItem]` 하나다(완료 조건 5).
- 구역 `label`은 `aria-label` 전용이다(보이는 머리가 없다). `NavZone` 주석("라벨이 이름 그대로 — 사용자 이름 · 프로젝트 이름", nav.ts:146-148)에 "목록 구역은 `Your projects` — 위 `Projects` 링크와 랜드마크 이름이 겹치지 않게"를 잇는다.

### D2. 구역 자리가 두 형이다 — 판정은 `activeProject` 하나

`navZones(m, project, ctx)`의 `project`가 이미 그 판정이다(`activeProject` — 멤버십 안의 slug만, `/projects/new`는 프로젝트가 아님, 보관 프로젝트도 찾는다).
`project !== null` 분기는 **손대지 않는다**(완료 조건 6).
비멤버 slug 경로는 `requireProjectAccess`가 `/projects?e=…`로 redirect하므로(`lib/auth/session.ts:59`) 목록 구역이 서는 자리는 spec 첫 줄의 여섯 라우트다(셸 안 `app/(edit)/error.tsx` 포함).

⚠️ **프로젝트 화면 위에서 New project 모달을 열면 둘째 구역이 바뀐다.** `(.)new` 인터셉트(`app/(edit)/projects/@modal/(.)new/page.tsx`)가 `/projects/<slug>/…`에서도 걸리고, 그동안 `usePathname()`은 `/projects/new`라 `activeProject`가 null이다 — 프로젝트 구역이 목록 구역으로 바뀌고 `New project`가 선택된다. `router.back()`으로 닫으면 돌아온다. 오버레이 아래라 결함으로 보지 않는다(지금도 프로젝트 구역이 사라졌다 — 바뀌는 것은 빈자리 대신 목록이 선다는 점뿐). T3에서 레이아웃 점프와 닫은 뒤 포커스를 본다.

### D3. 렌더 — 머리 줄 없이 기존 `Item`

- 구역 렌더 루프(`zones.map`)는 그대로다. `zone.key === "project"` 조건부 머리(접힘 grid · 레일 스위처)는 `"projects"`에서 서지 않는다 — 사용자 구역과 같은 "머리 없는 구역"이다. **머리 없음이 "지금 프로젝트 아님"의 표시다**(spec 범위 게이트 결정 2).
- `Item`: `item.thumbnail`이 있으면 아이콘 자리(`span.size-4`, sidebar.tsx:221)의 자식이 `<Icon>` 대신 `<ProjectThumbnail name={item.label} src={item.thumbnail.src} size="xs" />`. 접힘 규칙(`title`·라벨 페이드)·pending 면(`data-nav-pending`)·활성 판정(`isActive`)은 그대로다. 굵기(`font-medium`)를 더하지 않는다(`sidebar-selection.test.ts`).
- **접힌 레일**: 프로젝트 라우트에서는 구역 맨 위 썸네일 하나가 전환 메뉴 버튼(`aria-label="Switch project"`, sidebar.tsx:131-137)이고, 프로젝트 밖에서는 썸네일 ≤5개가 이동 링크다. 개수·위치·`title`이 달라 수용한다 — DESIGN §6.5 접힘 행에 이 형을 적는다.
- **포커스 착지**: 프로젝트 행을 누르면 구역이 `projects` → `project`로 바뀌어 `<nav key={zone.key}>`가 다시 마운트되고 누른 링크가 언마운트된다(sidebar.tsx:88-90) — 헤더 메뉴(닫히면 아바타로 복귀)·사이드바의 다른 항목(이동 뒤에도 링크가 남음)과 달리 포커스가 `body`로 빠진다(POSTMORTEM 2026-09-24 부류). 그래서 `Sidebar`가 **둘째 구역의 `key`가 바뀐 커밋 뒤** `landFocus(새 구역의 [aria-current="page"], 새 구역의 첫 링크)`를 부른다(`components/ui/focus.ts` — `focusLost()`일 때만 옮겨 사용자가 옮긴 포커스를 뺏지 않는다). 키 변화는 이전 key ref로 잰다. 모달 닫힘(`project` ← `projects`) 등 다른 전이도 같은 규칙을 탄다.
- `New project`의 이동 대기(모달 라우트 ~1초 — POSTMORTEM 2026-09-17)는 `Item`의 pending 면(`has-[[data-nav-pending]]`)이 든다. 헤더처럼 스피너로 바꾸지 않는다 — 사이드바의 모든 항목이 같은 pending 형을 쓴다(audit-ux #6). ⚠️ **같은 목적지의 pending 형이 표면별로 둘이다** — 헤더 아이콘 링크는 `Plus` → `Loader2`(`new-project-icon.tsx:11-13`), LNB 행은 면. 이것을 DESIGN §6.5 pending 행(:844)에 "LNB 행은 면, 헤더 아이콘 링크는 스피너 — 표면별 형"으로 등재한다(T4 — 다음 `/ux-audit`이 재지적하지 않게).
- `/projects/new`의 도착(모달 인터셉트 vs 전체 페이지)은 헤더 버튼과 같은 링크라 같다 — `/inbox` 등에서는 인터셉트가 안 걸려 `(list)/new` 전체 페이지로 간다. 새로 정하지 않는다.

### D4. 문구

**새 키 하나** — `m.common.nav.yourProjects` = `Your projects`(구역 `aria-label` 전용 — 보이는 문구가 아니다). 사용자 구역 `Projects` 링크와 랜드마크 이름이 같으면 스크린리더 랜드마크 목록에서 구분되지 않는다. ⚠️ en.tsx의 `home` 주석("도착한 화면이 `Your projects`라고 말하면 같은 곳인지 확인하게 된다")은 **보이는 제목**의 규칙이라 충돌하지 않는다 — 새 키 주석에 그 구분을 적는다. ko·es는 `/translate` 모드 ①.
행 라벨 `m.common.nav.newProject`는 그대로다 — 스위처 맨 아래 행·헤더 버튼·검색 색인과 같은 키다(`messages/en.tsx:402-403`; 같은 행동을 다른 이름으로 부르지 않는 규칙은 `projectSwitcher` 주석 :409). `newProject` 주석(:402 "사이드바 사용자 구역의 `Projects` 바로 아래 항목")은 9-30부터 낡았다 — "LNB 프로젝트 목록 구역 끝 행 · 헤더 버튼 · 스위처 · 목록 화면"으로 고친다.

## 순수 함수로 분리 가능한 부분 (`/tdd` 대상)

| 대상 | 테스트 파일 · 환경 | 케이스 |
|---|---|---|
| `navZones` (`project === null`) | `lib/shell/__tests__/nav.test.ts` (node) | 구역 둘(`work`·`projects`) · 프로젝트 행 = `menuProjects` 순서·보관 제외 · **6개 → 앞 5 + `New project`** · 행 href = `routes.project(slug)` · 마지막 행 `New project`(`Plus`·`routes.newProject()`) · 0개·보관만 → `New project` 한 행 · `thumbnail.src` = `image ?? null` · 구역 label = `m.common.nav.yourProjects` · `projects` 생략 → `New project` 한 행 |
| `navZones` (`project !== null`) | 같은 파일 | 기존 케이스 green · `projects`를 넘겨도 결과가 지금과 같다(`["work","project"]`) · 보관 프로젝트도 `project` 구역 |
| ⚠️ **결정 반전으로 고치는 단언** | `nav.test.ts:216-218` | "컨텍스트가 없으면 사용자 축 하나다 — 프로젝트 항목을 지어내지 않는다"(`["work"]`) → `["work","projects"]`로, 이름·주석을 2026-10-09 결정으로 바꾼다 |
| ⚠️ 같은 이유 | `components/__tests__/sidebar-work-zone.test.tsx:24-31` | 컨테이너 전체의 "`New project` 없음" 단언을 `nav[aria-label="Kim"]`(사용자 구역) 안으로 좁힌다 — 9-30 결정 중 유효한 부분(사용자 축에 없다). 테스트 이름·머리 주석(:12-14) 갱신 |
| ⚠️ 같은 이유 | `components/__tests__/client-graph.test.ts:570-587` | 정확 집합 고정 둘에 `lib/shell/switcher.ts`(+ nav-index 쪽은 `lib/search/match.ts`)를 더한다 — 둘 다 import 0 잎이라 무게가 늘지 않는다. `:141`의 switcher 주석("import 0인 잎" 류) 확인·갱신 |
| `Item` 썸네일 | `components/__tests__/sidebar-projects-zone.test.tsx` (jsdom, 신규) | 썸네일 행의 아이콘 자리(`span.size-4`)의 자식이 `ProjectThumbnail`(16)이고 아이콘 `<svg>`가 아니다 · 라벨 시작점 클래스가 아이콘 항목과 같다(`sidebar-identity.test.tsx:43-55` 패턴) · 이미지 없으면 폴백 타일 |
| `Sidebar` 프로젝트 밖 | 같은 파일 | `/inbox`·`/projects`에서 구역 순서 · `nav` 둘의 `aria-label`(사용자 이름 · `Your projects`) · `/projects/new`에서 `New project`만 `aria-current` · 0개면 `New project` 한 행 · 접힌 레일에서 행 `title`·머리 줄 0 · **`New project` 행의 pending 면**(`sidebar-pending.test.tsx`의 `useLinkStatus` 장치) |
| 포커스 착지 | 같은 파일 (fixup observer — `focus-return.test.tsx` 형) | `/inbox`에서 프로젝트 행에 포커스 → pathname을 `/projects/<slug>`로 바꿔 다시 렌더 → `activeElement`가 새 구역의 Home 링크 · 포커스가 다른 곳(예: 본문)에 있으면 옮기지 않는다 |
| `Sidebar` 프로젝트 안 | `sidebar-identity`·`sidebar-collapse`·`sidebar-pending`·`sidebar-selection`·`shell-panels` | **무수정** green |
| 비프로젝트 라우트를 그리는 기존 렌더 테스트 | `ui-locale-screens.test.tsx:52`·`sign-out-pending.test.tsx:39`·`inbox-page-scenario.test.tsx:39` | green 유지 확인 — 특히 ko `newProject`("새 프로젝트")가 `ui-locale-screens`의 "Projects 미포함" 류 단언과 충돌하지 않는지 |

## 스키마 변경

**없음.**

## 새 환경변수

**없음.**

## 불변식 영향

- export 결정성·blob SHA: **없음**.
- 인증·테넌트: 새 쿼리 없음. 목록은 레이아웃의 `loadMemberships`(세션 userId, `app/(edit)/layout.tsx:44-45` → `toNavProjects` → `<Sidebar memberships>`) 결과이고 `NavProject`가 `image`·`archived`를 이미 든다. 인가는 이동한 페이지의 `requireProjectAccess`가 한다.
- 개인정보: 새 필드·쿠키·전송처 없음.
- `client-graph.test.ts`: `lib/shell/nav.ts`가 `lib/shell/switcher.ts`(→ `lib/search/match.ts`)·`lucide-react`의 `Plus`를 새로 import한다. 허용 목록(:50·:141·:182)은 통과하고, **정확 집합 고정 둘(:570-587)은 기대값을 갱신한다**(위 표). 순환 없음 — switcher의 import는 `match.ts` 하나이고 match는 import 0이다.
- 사전: 새 키는 en·ko·es 세 사전에 같은 커밋(`satisfies Messages`가 묶는다). ko·es 사전 import 경계는 그대로다.

## POSTMORTEM 인용

- **2026-09-05 — 링크 생성기가 경로를 하드코딩해 사이드바가 전부 404**: href는 `routes.project`·`routes.newProject`로만 만든다 — 문자열 조립 금지. 테스트가 href를 `routes.*` 결과와 대조한다.
- **2026-09-08 — 접힌 상태에서만 렌더되는 가지가 셸을 죽였다**: 접힌 레일 케이스를 jsdom 테스트에 넣고 T3에서 접기 → 새로고침 → 접힌 채로 뜨는지 본다.
- **2026-09-17 — New project 클릭 뒤 모달 대기 중 무반응 · 같은 pending 다른 모습**: 사이드바 행은 `Item`의 pending 면이 반응을 준다(D3, jsdom 케이스 하나 + T3 실물). 헤더와 형이 다른 것은 DESIGN에 표면별 형으로 등재한다.
- **2026-09-20 · 09-24 — 포커스가 `body`로 빠짐 · 재마운트는 제자리 렌더 테스트가 못 본다**: 프로젝트 행 이동은 구역 재마운트라 D3의 착지를 둔다. 테스트는 pathname을 바꿔 **실제로 재마운트시키고** fixup observer를 단다.
- **2026-10-07 — 리사이즈 핸들 Enter가 접힘 상태를 안 바꿈**: 접힘 판정을 건드리지 않는다 — 기존 `sidebar-collapse.test.tsx` 무수정 green.

## 문서 갱신

**코드 주석은 T1·T2의 같은 커밋에서** 고친다(diff 직후 거짓이 되므로):
- `lib/shell/nav.ts` 머리(:13-23 — 사용자 축에 Inbox·Preferences 반영, `New project`의 LNB 목록 구역 복귀) · `NavZone`(:146-148) · `navZones` 주석(:199-205 "`New project`가 사용자 축에 없다 … 둘에서 같이 빠진다"에 "프로젝트 밖 목록 구역 끝에는 있다")
- `lib/shell/switcher.ts` `MENU_LIMIT`(:20)·`menuProjects`(:24) — 소비자 둘
- `lib/search/nav-index.ts:12` "`New project`는 nav 항목이 없어…" → 같은 `Plus`를 쓴다는 근거만 남긴다
- `messages/en.tsx:402` `newProject` 주석 · 새 키 `yourProjects` 주석
- `components/shell/sidebar.tsx` 구역 주석(:80-87 — 두 형 · `New project` 복귀 · 포커스 착지)
- `components/ui/project-thumbnail.tsx` 16 소비자 주석(:6-7·:31 — 이미 사용자 메뉴가 빠져 낡았다 · LNB 항목 행 추가)

**정본 문서는 T4(`/push` 4단계)**:
- PRODUCT §7.7(:742-744 "구역이 스코프를 표시한다") — 둘째 구역 자리의 두 형과 "머리 없음 = 지금 프로젝트 아님" · :949 — 프로젝트 밖 사이드바의 목록 구역(상한 5 · 보관 제외 · 메뉴와 같은 목록) + **`New project`가 LNB 목록 구역 끝 행으로 돌아온 결정**(사용자 축·메뉴엔 여전히 없음, 헤더 버튼·`/projects` 본문과 겹침 수용) · IA 결정 1(:855) "프로젝트로 가는 자리" 목록에 LNB 목록 행(과 미등재면 사용자 메뉴 행) 등재.
- DESIGN §6.5 "구역 둘" 행(:863) — 근거 문장 "축이 둘이라 구역이 둘이다 · 프로젝트 축 라벨은 프로젝트 이름"을 "둘째 자리는 프로젝트 축 — 컨텍스트가 없으면 그 축의 입구(목록)"로 다시 쓰고, 머리 없는 목록 구역 · `aria-label` `Your projects`. "사용자 축 항목" 행(:865)의 "`New project`가 여기 없다"에 "프로젝트 목록 구역 끝에 있다"를 잇는다. pending 행(:844)에 표면별 형. 접힘 행(:859)에 썸네일 링크 열. §6.8 아이콘 표에 사이드바 `New project`(`Plus`) 행 · :2140 "12 글리프 소비자 셋" → 넷(LNB 항목 행의 xs 타일).
- responsive-app spec A-01에 이 구역을 등재하고 design-brief AT1(:63) 검증 범위에 프로젝트 밖 서랍을 더한다(디렉터리가 남아 있으면).
- 가이드 본문 — `guide/en/**`에서 사이드바 설명이 이 구역과 모순되는지 확인(현재 "Open **MCP connector** in the sidebar" 류만 — 영향 없을 공산이 크다). 바뀌면 `/guide`로 en·ko·es 같이.
- 가이드 스크린샷 — `guide/SHOOTING.md:153`대로 셸은 매핑 소스가 아니므로 `guide:check`가 잡지 않는다. 사이드바가 보이는 **프로젝트 밖** 컷(`inbox-page`·`account`·`preferences-language`·`mcp-connector`·`mcp-create-token`·`create-repository`·`create-files`·`create-name`·`create-ready` 등 — `inbox-open`은 촬영 라우트 확인 필요)을 `/guide-shots`로 컷마다 판정해 재촬영(선례 2026-10-05: 셸 변경 → 셸이 든 컷 전부 재촬영).
