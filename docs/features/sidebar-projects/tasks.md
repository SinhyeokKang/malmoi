# sidebar-projects — tasks

순서: 순수 판정 → 렌더 → 실물 → 문서 → 가이드 컷. 각 태스크는 **테스트 먼저**(`/tdd`로 red 확인 → 구현)다.
`[C]`는 커밋 경계이고 **모든 경계의 검증은 `pnpm gate` green**(출력을 파이프로 거르지 않는다). 시안 없음. 마이그레이션 없음.
⚠️ **"무수정 green"이 아닌 테스트가 있다** — 이 기능이 뒤집는 결정을 단언하는 셋(`nav.test.ts:216-218` · `sidebar-work-zone.test.tsx:24-31` · `client-graph.test.ts:570-587`)은 의도적으로 고친다(design 표). 그 밖은 무수정이다.

## T1. `navZones` 프로젝트 목록 구역 + 사전 키 (테스트 먼저)

- `lib/shell/__tests__/nav.test.ts`에 design 표 케이스(`project === null` — 6개 → 5+1 · 0개·보관만 · `projects` 생략 포함 / `project !== null` 결과 불변 · 보관 프로젝트) red.
- 결정 반전 단언 갱신: `nav.test.ts:216-218`(`["work"]` → `["work","projects"]`, 이름·주석) · `client-graph.test.ts:570-587` 정확 집합에 `lib/shell/switcher.ts`(+ `lib/search/match.ts`).
- `lib/shell/nav.ts`: `NavZone.key` `"projects"` · `NavItem.thumbnail?: { src }` · 컨텍스트 **선택** 필드 `projects?`(생략 → `[]`) · `menuProjects` + `New project` 끝 행 · label `m.common.nav.yourProjects`.
- `messages/en.tsx`·`ko.tsx`·`es.tsx`에 `common.nav.yourProjects`(`/translate` 모드 ① — ko·es 같은 커밋).
- `components/shell/sidebar.tsx`: `navZones`에 `projects: memberships`. → `sidebar-work-zone.test.tsx:24-31`의 컨테이너 전체 단언이 이 커밋에서 red가 되므로 **같은 커밋에서** `nav[aria-label="Kim"]` 안으로 좁힌다(이름·머리 주석 :12-14 갱신).
- `app-frame.tsx`·`nav-index.ts`는 호출 변경 없음(선택 필드).
- 주석 갱신(같은 커밋 — design "문서 갱신"의 코드 주석 목록 중 nav·switcher·nav-index·messages): `nav.ts` 머리·`NavZone`·`navZones` · `switcher.ts:20·24` · `nav-index.ts:12` · `en.tsx:402` + 새 키 주석.
  검증: 새 케이스 green · 위 세 파일 외 기존 `nav.test.ts` 케이스·`landing-mockup.test.tsx`·`nav-index.test.ts`·`dictionary-consistency`·`no-korean-ui` 무수정 green · `pnpm gate` green.

`[C] feat(shell): add a project list zone to the sidebar outside projects`

## T2. 사이드바 렌더 + 포커스 착지 (테스트 먼저)

1. `Item`이 `thumbnail`이면 아이콘 자리(`span.size-4`)에 `ProjectThumbnail xs`(`name={item.label}`). 굵기 추가 없음.
2. 구역 머리 조건(`zone.key === "project"`)이 `"projects"`에서 서지 않는지 확인 — 코드 변경 없을 공산이 크다.
3. 둘째 구역 `key`가 바뀐 커밋 뒤 `landFocus(새 구역 [aria-current="page"], 새 구역 첫 링크)`(`components/ui/focus.ts`).
4. 주석 갱신(같은 커밋): `sidebar.tsx` 구역 주석(두 형 · `New project` 복귀 · 포커스 착지) · `project-thumbnail.tsx:6-7·31` 16 소비자.
   검증: 신규 `components/__tests__/sidebar-projects-zone.test.tsx`(design 표 — `usePathname` mock으로 `/inbox`·`/projects`·`/projects/new`·0개·접힘·`New project` pending·포커스 착지(pathname 변경으로 실제 재마운트 + fixup observer)) red → green ·
   `sidebar-identity`·`sidebar-collapse`·`sidebar-pending`·`sidebar-selection`·`shell-panels` **무수정** green · `ui-locale-screens`·`sign-out-pending`·`inbox-page-scenario` green · `pnpm gate` green.

`[C] feat(shell): render project rows and New project in the sidebar list zone`

## T3. 실물 확인 (수동 — `/runtime-test`로 넘겨도 된다)

준비: dev DB OWNER는 비보관 8 + 보관 1(상주 — 지우지 않는다). **멤버십 0 상태는 실물 미검증으로 남긴다**(그런 계정이 없다 — T1·T2 단위 테스트로 갈음, 보고서에 명시).
`pnpm dev` → 로그인. 각 항목은 **통과 조건**이고 하나라도 어긋나면 이슈다:

- `/projects`·`/inbox`·`/mcp`·`/preferences`·`/account`: 구분선 아래 5행이 slug 오름차순 앞 5개(아바타 메뉴 프로젝트 그룹과 같은 순서 — 열어 대조) + 마지막 `New project` · `aa-umt-long-name`이 한 줄 truncate · 이미지 있는 프로젝트는 이미지, 없는 프로젝트는 이름 색 폴백 타일(목록 화면·스위처와 같은 색).
- `/projects/new`(모달·직접 진입 둘 다): `New project`만 선택 면 · `Projects` 비선택.
- 프로젝트 행 클릭(마우스 + 키보드 Enter 둘 다): 그 프로젝트 Home 착지 · 사이드바가 프로젝트 구역으로 바뀜 · **키보드 Enter 뒤 `document.activeElement`가 Home 링크**(`body` 아님).
- `/inbox`에서 `New project` 클릭: 응답 전에 그 행이 선택 면(0.07)을 든다(POSTMORTEM 2026-09-17) → `/projects/new` 도착.
- 프로젝트 화면에서 헤더 `New project`로 모달 열기: 모달 뒤 사이드바가 목록 구역으로 바뀌는 것 확인 · 닫으면 프로젝트 구역 복귀 · 닫은 뒤 포커스가 `body`가 아님.
- 프로젝트 라우트: 사이드바가 이전과 같다(머리·스위처·배지) — 스위처를 **실제로 열어** 본다(POSTMORTEM 2026-09-09).
- 접힌 레일: 프로젝트 밖에서 썸네일 ≤5 + `Plus`, hover `title`이 이름 · 접기 → 새로고침 → 접힌 채로 뜨고 셸이 죽지 않음(POSTMORTEM 2026-09-08).
- 다크: 썸네일·면 대비가 라이트와 같은 규칙으로 선다.
- 1280·1440·1890 · 낮은 뷰포트(예: 높이 600): 하단(`Changelog · Docs`·접기)이 `aside` 세로 스크롤로 밀리고 잘리거나 겹치지 않는다.
  검증: 항목별 통과/실패 기록. 실패는 BugShot 이슈.

## T4. 정본 문서 (`/push` 4단계)

- design "문서 갱신"의 정본 목록 — PRODUCT §7.7·:949·IA 결정 1 · DESIGN §6.5(구역 둘 근거 재작성·사용자 축 항목·pending 표면별 형·접힘)·§6.8(`Plus` 행 · :2140 소비자 넷) · responsive-app A-01 등재 + AT1 범위 · 가이드 본문 모순 확인.
  검증: 각 줄이 새 결정(목록 구역 · 머리 없음 = 프로젝트 아님 · `New project` LNB 복귀 · 헤더·`/projects` 본문 겹침 수용 · 메뉴와 같은 목록 · `Your projects` 랜드마크 · 포커스 착지)을 말한다 — 정본 문서에서 grep으로 각 결정 문장 1건 이상.

`[C] docs(PRODUCT|DESIGN): …` — 문서별 커밋.

## T5. 가이드 컷 재촬영 (`/guide-shots`)

- `guide/SHOOTING.md:153`대로 셸은 매핑 소스가 아니라 `pnpm guide:check`가 이 변경을 잡지 않는다. 사이드바가 보이는 **프로젝트 밖** 컷(design 목록 — `create-files`·`create-name`·`create-ready` 포함, `inbox-open`은 라우트 확인)을 실제로 열어 컷마다 판정 → 재촬영 · SHOOTING 매핑(blob SHA·치수) 갱신. `create-ready`는 일회용 프로젝트가 필요한 벽이 있다(SHOOTING:180·198) — 브리프에서 허용 여부를 정한다.
  검증: 후보 컷마다 "재촬영 / 사이드바 안 보임·변화 없음" 판정이 기록됐고, 재촬영 컷에 새 구역이 보인다 · 재촬영 뒤 `pnpm guide:check` stale 0(매핑 갱신 확인용).

`[C] docs(guide): retake shell shots for the sidebar project list`

- 기능 종료 시 `docs/features/sidebar-projects/` 삭제.
