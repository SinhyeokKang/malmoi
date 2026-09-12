# spec — 새 프로젝트 온보딩을 모달 네 단계로

## 0. 디자인 SoT

**정본은 Claude Design 프로젝트 `b99d54cd-3034-44f1-8446-0a864da9d767`의
`design_handoff_new_project_modal/` 폴더다.** 색·치수·문구·상태가 어긋나면 **그쪽이 이긴다.**

| 파일 | 무엇 |
|---|---|
| `design_handoff_new_project_modal/README.md` | **핸드오프 정본** — 토큰·치수·단계별 문구·로딩·에러·상태 관리 |
| `design_handoff_new_project_modal/New Project.dc.html` | 캔버스. 아트보드 id: `1a`(①) `2a`(① 로딩) `4a~4c`(① 예외) · `1b`(②) `2b`(② 로딩) `3a`(② 후보 0개) `4d`(② 탐지 실패) · `1c`(③) `4e`(③ 주소 중복) · `1d`(④) `2c`(④ 적재 중) `4f`·`4g`(④ 실패·부분 실패) |
| `design_handoff_new_project_modal/Modal.dc.html` | 공통 껍데기 |
| `design_handoff_new_project_modal/AppShell.dc.html` · `Projects.dc.html` | 모달 뒤 화면 |
| `design_handoff_new_project_modal/new-project-modal.prompt.md` | 이 스펙을 만든 프롬프트 |

**읽는 법**: 브라우저 링크(<https://claude.ai/design/p/b99d54cd-3034-44f1-8446-0a864da9d767?file=New+Project.dc.html>)는
Artifact 도구로도 HTTP로도 못 읽는다(403). **`DesignSync` 도구가 읽는다** —
`method: "list_files" | "get_file"` + `projectId: "b99d54cd-3034-44f1-8446-0a864da9d767"`.

⚠️ **HTML은 레퍼런스이고 출하할 코드가 아니다** (README "About the Design Files"). 구현은
`components/ui/` 프리미티브로 다시 만든다.

**두 정본이 다투지 않게 축을 가른다**: **무엇이 어떻게 보여야 하는가**(색의 역할·치수·문구·상태)는
핸드오프가 정하고, **그것을 무엇으로 적는가**(토큰 이름·유틸리티)는 `app/globals.css`의 `@theme`가
정한다. 핸드오프의 raw 값이 기존 토큰과 같은 값이면 **토큰을 쓴다**(예: `#f5f6f7` → `--color-canvas`,
`shadow-medium` → 이미 있다). 매칭되는 토큰이 없으면 **DESIGN §6.2에 등재하고 토큰을 만든 뒤** 쓴다 —
소스에 raw hex를 남기지 않는다.

## 1. 사용자

**개발자(프로젝트를 만드는 사람) 하나다.** 번역 편집자는 이 흐름에 도달하지 않는다 — `createProject`는
아직 프로젝트가 없는 경로라 인가가 `requireUser`뿐이고(`entry-points.test.ts`의 `USER_SCOPED_ACTIONS`),
초대받은 EDITOR는 목록에서 곧장 프로젝트로 들어간다.

단 **온보딩의 결과물을 받는 사람은 편집자다**: ②의 키·값 표에서 "ko 열이 비어 있다"가 보이면 연결 전에
할 일의 크기를 알 수 있고, ③의 "Korean has 145 keys fewer than English."가 기준 언어를 잘못 고르는 것을
막으며, ④의 부분 실패 문구가 "버린 값이 있다"를 말한다(불변식 9).

⚠️ **단 그 비교 문장은 키 수를 아는 언어에만 선다.** detect의 blob 예산(≤21) 안에서 키 수가 채워지는
것은 `sampleOrder`가 고른 로케일과 사용자가 ②에서 눌러 본 로케일뿐이다(design §6-⑥). **모르는 언어는
배지도 비교 문장도 달지 않는다** — 모르는 것을 아는 척하지 않는 쪽이, 클릭 이력이라는 우연에 기대어
"이 언어가 제일 많다"를 단언하는 것보다 낫다. multi-locale(ts-dict)은 한 파일이라 처음부터 전부 찬다.

## 2. 문제

**관측된 사실 셋.**

1. **첫 로그인 사용자에게 같은 말을 하는 화면이 둘 연속으로 온다.** `/projects`가 프로젝트 0개일 때
   `EmptyState`(`FolderGit2` + "프로젝트가 없다" + [New project])를 그리고, 누르면 `/projects/new`가
   그 위에 Breadcrumb + `h1 New project` + `Card`를 다시 세운다.

   → 판단: 두 화면 사이에 **사용자가 얻는 새 정보가 리포 목록 하나뿐**인데 라우트 전환·헤더 재구성
   비용을 전부 낸다.
2. **한 화면이 `Card` 둘에 결정 넷을 담는다.** `createProject`의 입력은
   `owner repo adapter pathTemplate baseLocale slug name` 일곱이고 `baseBranch`는 서버가
   `access.defaultBranch`로 채운다. 현재 UI는 이것을 stage 셋(`pick` / `chosen` / `created`)으로 나누고
   `Card`를 각각 **1개 / 2개 / 3개** 그린다. 그중 `chosen` 하나가 **후보 선택 · 기준 언어 · 수동 지정 ·
   이름/주소를 Card 둘에** 담는다.

   → 판단: **단계 경계와 결정 경계가 안 맞는다.** 결정 넷을 한 화면에 쌓으면 "지금 무엇을 정하는
   중인가"가 사라지고, 되돌릴 수 없는 값(주소·기준 언어)이 되돌릴 수 있는 값과 같은 높이에 선다.
3. **②에서 후보를 고를 근거가 경로 문자열 하나다.** `CandidateSummary`가 주는 것은
   `pathTemplate` · `locales[]` · `keys`(수)뿐이고, 값은 한 줄도 안 보인다. `_locales`(4키)와
   `ts-dict`(903키)를 키 수로 구별하라는 것이 지금 화면이 요구하는 일이다(`detect.ts` 주석이 그 요구를
   적고 있다) — **자기 리포인데도 "이게 내 파일이 맞나"를 경로만 보고 판정해야 한다.**

곁들여, 지금 흐름은 **브랜치를 한 번도 묻지 않는다.** `probeRepo`의 `default_branch`가 세 자리를
동시에 정한다: 탐지가 읽는 트리(`reader.snapshot(access.defaultBranch)`), 저장되는
`Project.baseBranch`, 그리고 그것을 읽는 첫 적재. base가 `develop`·`release/2.0`인 리포는 온보딩을
끝낸 **뒤** 설정 화면(`repository-form.tsx`의 자유 입력 `Input` + `isValidBranchName`)에서 고쳐야 하고,
그때 이미 잘못된 트리로 탐지가 끝나 있다.

## 3. 완료 조건

**검증 가능한 문장으로.** 괄호 안이 판정 수단이다.

⚠️ **수동 판정에는 뷰포트를 박는다** — 이 기능은 **높이**가 축이라(design §8.1) 기본 1920×1080에서는
넘침 결함이 한 번도 안 보인다. `/bugshot-qa` 항목은 **1440×900과 1280×720 둘 다**에서 본다
(POSTMORTEM 2026-09-11의 재발 방지 조항).

1. `/projects`에서 [New project]를 누르면 **목록이 뒤에 남은 채** 모달이 열리고 주소가
   `/projects/new`가 된다. **뒤 목록은 누르기 직전과 같은 목록이다** — `?q=`·`?filter=`가 실려 넘어가고
   닫으면 그 값을 들고 `/projects`로 돌아간다. (`/bugshot-qa` 로컬 — `i18n-format-check` 검색어를 넣은
   상태에서 연다)
2. `/projects/new`를 **새로고침**해도 같은 화면이다 — 목록 + 열린 모달. 뒤로가기는 `/projects`이고
   모달이 닫힌다. (같은)
3. GitHub callback이 보내는 `/projects/new?e=<사유>`로 진입하면 모달이 **열린 채** 그 사유를 든다.
   (`connectErrorMessage`·`onboardErrorMessage` 둘 다 — `/projects/new`는 두 union을 읽는 라우트다)
4. 단계가 넷이고 순서가 **리포와 브랜치 → 로케일 파일 → 이름·주소·기준 언어 → 결과**다. 바닥 왼쪽이
   `Step n of 4`이고 **스텝퍼를 세우지 않는다**. [Back]·[Next]는 모달 껍데기가 소유하며,
   **①에는 [Back]이 없고**(닫는 길은 X·Esc·backdrop) **④에도 없다**(되돌릴 것이 없다).
   (**jsdom 렌더 테스트 하나로 판정한다** — `Step n of 4` 문구가 실제로 렌더되고, `role="tablist"`·
   `role="list"` 꼴의 스텝퍼가 0개이고, ①④에서 [Back]이 쿼리되지 않는다. **소스 스캔으로 나누지
   않는다** — `showBack` prop을 세는 것은 "그려 놓고 안 보이는" 경우를 못 잡는다)
5. ①에서 고른 행 아래에 브랜치 `Select`가 펼쳐지고, 기본값이 그 리포의 default branch다. 브랜치를
   바꾸면 ②의 후보·샘플이 **그 ref의 트리에서** 다시 나온다. (`onboarding.test.ts` —
   `reader.snapshot`에 넘어간 인자가 선택값이다)
6. `Project.baseBranch`가 **사용자가 고른 값**으로 저장되고, ④의 워크플로 YAML `on.push.branches`가
   같은 값이다. **`release/2.0`처럼 `/`가 든 이름도 같다** — 인코딩을 이중으로 하지 않는다
   (POSTMORTEM 2026-09-01). (`onboarding.test.ts` + `workflow.test.ts` — 둘 다 슬래시 케이스를 든다)
7. ③에서 주소가 이미 쓰였으면 [Create project]를 누른 **그 자리에** 필드 오류
   (`aria-invalid` + destructive help)가 서고, 입력값은 전부 남아 있으며, 대안 하나를 **제안으로**
   제시한다("Try another, such as `<alt>`." — 그 대안의 빈자리를 확인하지 않았으므로 단언하지 않는다).
   배너는 세우지 않는다. `planSlug`의 나머지 갈래(`empty`·`format`·`too-long`·`reserved` — **`new`가
   `reserved`다**)도 같은 자리에서 각자의 문구를 든다. (`/bugshot-qa` — `i18n-format-check`가
   프로젝트 둘을 갖고 있어 실제로 중복을 만난다)
8. ②가 **좌 240px** 후보 목록 + 우 키·값 표의 2단이고 껍데기 폭이 **960**이다. 표는 언어당 **10행**을
   보이고 **키 행만** 스크롤한다(툴바·헤더·총량 줄은 고정). 표 위 세그먼트가 **후보의 로케일 전부**를
   들고, 다섯 이상이면 `Select`로 접힌다.
   - **자동**: `SAMPLE_ROWS === 10` · `sampleRows`가 앞 10개를 순서 보존해 자른다 · `samples`가 후보의
     로케일 전부를 든다(`detect.test.ts`).
   - **수동**: 좌 240px 2단 배치 · **키 행만** 스크롤(툴바·헤더·총량 줄이 안 움직인다) · 값 셀이
     한 문장을 보인다 · 언어를 바꾸면 그 언어의 값이 보이고, **정말 비었으면 빈 칸**,
     **못 읽었으면 "We couldn't read this file."** 로 갈린다(`/bugshot-qa` —
     `i18n-order-check`·`bugshot-i18n-test`).
9. 후보가 0개면 ①로 되돌리지 않고 ②로 넘어가 제목이 "Where are your locale files?"가 되며, 좌측에
   수동 지정 폼(포맷 `Select` + 경로 `Input` + `layout`별 경로 힌트), 우측에 "Nothing to preview yet"이
   선다. 경로를 치면 우측이 키로 차고 **그것이 검증이다** — 매칭 전까지 [Next]가 비활성. (`/bugshot-qa`)
10. ④에서 **적재가 도는 동안에도** 토큰·YAML이 보이고 [Start translating]이 눌린다. **X는 남는다.**
    적재 결과는 실패 0이면 `success`, 부분 실패면 `warning`이고 못 읽은 파일 경로가 `Details`에 접혀
    있다. ⚠️ **닫거나 이동하면 적재가 끝까지 돌지 않을 수 있다** — 그래도 프로젝트는 목록에
    `Waiting for first import`로 남고 **설정 화면에서 적재를 다시 돌릴 수 있으며 토큰도 재발급된다**
    (`first-ingest-retry.tsx`·`rotatePushToken`이 실재한다). ④의 help 줄이 그 사실을 말한다.
    (`screens.test.ts`가 이미 `failed === 0 ? "success" : "warning"`를 소스에서 센다 — 그 단언이
    새 컴포넌트 경로에서도 성립해야 한다)
11. 로딩은 **다음 단계 안의 스켈레톤**이다. 전역 스피너가 없고 진행률 숫자가 없다.
    (`/bugshot-qa` — ① 진입 · ①→② · ②의 언어 전환 셋을 각각 본다)
12. `pnpm typecheck && pnpm test && pnpm build`가 green이고, `shell-layout.test.ts`의 "라우트마다
    콘텐츠 패널 정확히 하나"·"화면이 자기 `<main>`을 들지 않는다"와 `focus-ring.test.ts`·
    `client-graph.test.ts`가 **수정 없이** 통과한다.
13. `messages/en.tsx`를 지나지 않는 화면 문구가 0이다. (`no-korean-ui.test.ts`)
14. **단계 전환과 비동기 완료가 스크린리더에 닿는다** — 모달 안의 `sr-only` `aria-live="polite"`가
    (a) 새 단계의 제목 (b) 로딩→완료 전이를 말하고, 단계가 바뀌면 포커스가 본문 컨테이너로 옮겨간다.
    ④의 적재 중 info Alert는 `role="status"`다(⚠️ `Alert`의 `role="alert"`는 **`danger`일 때만** 붙는다).
    (`/bugshot-qa` — VoiceOver로 ①→②→③→④를 한 바퀴)
15. **모달이 1280×720에서 잘리지 않는다** — 바닥의 [Back]·[Next]가 항상 보이고, 넘치는 것은 본문
    열뿐이다. (`/bugshot-qa` — 두 뷰포트 다)

## 4. 비목표

- **중간 상태를 서버에 저장하지 않는다.** 새로고침하면 ①부터다 — 지금과 같다. 모달이 되면 "닫으면
  잃는다"가 더 강하게 읽히므로 **④를 지난 뒤에는 프로젝트 행이 이미 있다**는 사실을 문구가 말한다.
- **단계를 URL로 쪼개지 않는다.** `?step=2`를 두면 저장되지 않은 상태를 주소가 약속하게 된다.
- **스텝퍼를 세우지 않는다** — 네 칸이 누를 수 없는 장식이 된다. 진행은 `Step n of 4` 한 줄이다.
- **진행률 숫자를 만들지 않는다.** `runFirstIngest`도 `detectRepoFormats`도 진행률을 내지 않는다.
- **주소 중복을 입력 중에 조회하지 않는다.** 판정은 [Create project]를 누를 때 `createProject`가
  `slug-taken`으로 한다 — 지금과 같다. 실시간 조회(`checkSlug`)를 기각한 이유 둘: ③이 **마지막 입력
  단계**라 거부돼도 ③에 머물며 입력이 유지되므로 되돌아오는 비용이 왕복 한 번뿐이고, `requireUser`만
  지나는 무제한 읽기가 **전역 slug 공간의 열거 속도**를 연다(로그인은 검증된 이메일만 요구하고 그것이
  아무것도 열지 않는다 — CLAUDE.md). 디바운스는 클라이언트 값이라 통제가 아니다.
- **설정 화면의 브랜치 입력을 `Select`로 바꾸지 않는다.** 그 화면은 자유 입력 `Input` +
  `isValidBranchName`이고 이번 변경의 인접 코드다(작업 원칙: 외과적 변경).
  ⚠️ **같은 컬럼에 UI가 두 벌로 갈리는 것을 의도로 남긴다**: 온보딩은 **처음 고르는 자리**라 무엇이
  있는지 보여 줘야 하고(안 보여 주면 default branch가 기본값으로 굳는다 — 그것이 §2의 곁들인 사실이다),
  설정은 **이미 아는 값을 고치는 자리**라 목록이 필요 없다. 맞추는 것은 후속의 몫이고, 맞춘다면
  **설정을 온보딩 쪽으로** 올린다(반대 방향은 이번 변경의 목적을 되돌린다).
- **조직·과금·세밀한 권한**은 PRODUCT §4.2 그대로.
- **`/projects/new` 주소를 없애지 않는다.** callback이 그 주소를 문자열로 물고 있고
  (`app/api/github/callback/route.ts`), `entry-points.test.ts`가 `routes.newProject()`를 실재 라우트와
  대조한다.
- **목록이 있는 화면의 `/projects` 리디자인은 이번 범위가 아니다** — `Projects.dc.html`은 0건 상태만
  들고, README가 "목록이 있는 화면은 다른 캔버스에서 다룬다"고 적는다.

## 5. 범위 게이트

**PRODUCT §4.2와 대조 — 걸리는 항목이 없다.**

- "포맷별 무제한 설정 UI"(비범위)에 ②의 수동 지정이 걸리는지: **아니다.** 지금도 있는 `<details>`를
  같은 필드 둘로 옮기는 것이고, 어댑터 **내부 이름은 계속 화면에 쓰지 않는다**(라벨은 서버의
  `formatLabel`, 글리프는 `layout`·확장자로 갈린다).
- 브랜치 선택은 새 개념이 아니다 — `Project.baseBranch` 컬럼과 설정 화면의 입력이 이미 있고,
  **결정 시점을 온보딩 앞으로 당기는 것**이다.
- ARCHITECTURE §0 불변식과 충돌하지 않는다: 머지 로직·충돌 해소·양방향 동기화를 요구하지 않고,
  ②의 미리보기는 **읽기 전용**이다(리포에 아무것도 쓰지 않는다 — ③의 info 문장이 그것을 말한다).
  ⚠️ **단 불변식 10(경로 판정)은 걸린다** — ②의 언어 샘플이 **클라이언트가 보낸 `pathTemplate`·
  `locale`·`ref`로 리포를 읽는** 새 경로를 연다. 방어는 design §3.4가 든다(ARCHITECTURE §3.1이 그 값
  쌍에 지정한 통제 `planConfirmedFormat` + `isPathSafeLocale` + `isValidBranchName`). design §3.8의
  "불변식 영향 없다"를 그렇게 정정했다.

**PRODUCT 갱신은 필요하다 — 비범위 때문이 아니라 §7.7 IA 때문이다.** `/projects/new`가 독립 화면이
아니라 **`/projects` 위의 모달 딥링크**가 되므로 **두 자리가 바뀐다**: IA 표의 그 줄과,
**"⚠️ `?e=`만 생성기가 없다(읽는 라우트 다섯)" 문단** — 그 문단이 `/projects/new?e=`의 계약을 적은
유일한 자리이고, 모달화 뒤엔 "**모달이 열린 채** 사유를 든다"가 된다(완료 조건 3).
⚠️ **slug 예약 넷의 근거 주석은 안 바뀐다** — `new`가 예약인 이유는 그것이 라우트라는 것이고,
라우트는 그대로 남는다. tasks.md T9가 그것을 든다(`/feature`는 정본 문서를 직접 고치지 않는다).

## 6. 근거로 수용한 비용

- **모달은 짧은 작업용이라는 통념을 어긴다.** 단계가 넷이고 실패 갈래가 열이다. 그래서 이 모달은
  "확인 대화상자"가 아니라 **라우트 하나를 대신하는 급**이다: 제목이 20/500(페이지 제목과 같은 급),
  폭 960, 높이가 뷰포트에 물린 고정, 본문만 스크롤.
- **`components/ui/dialog.tsx`를 안 쓴다.** 그 프리미티브는 Overlay가 고정 클래스이고 머리·본문·바닥의
  padding과 바닥 배치(`justify-end`)가 박혀 있어 이 껍데기를 `className`으로 만들 수 없다. 고치면
  초대·확인·아카이브 모달 넷이 함께 움직인다. → **Radix `Dialog.*`를 직접 조립한다**(design §2.1) —
  프리미티브 하나를 우회하는 대가로 다른 화면이 안 움직인다.
- **`/projects/new`가 목록도 그린다.** 모달 뒤에 목록이 있어야 하므로 그 라우트가 `loadProjectList`를
  한 번 더 돈다. 지금은 안 도는 조회 하나가 는다 — 대신 새로고침·공유·뒤로가기가 **구조로** 성립한다
  (design §1). `?q=`·`?filter=`도 함께 받으므로 그 라우트의 `searchParams` 계약이 셋으로 는다.
- **①에서 클릭이 하나 는다.** 지금은 행의 [Select] 한 번에 탐지가 돈다(1클릭). 새 흐름은
  라디오 + [Next](2클릭)다 — 브랜치를 그 사이에 끼워 넣은 대가이고, 그 자리가 바로 §2의 곁들인
  사실("브랜치를 한 번도 묻지 않는다")이 답을 받는 지점이다.
- **GitHub 호출이 둘 는다.** 브랜치 목록(리포를 고른 뒤 그 리포만)과 언어 샘플(세그먼트를 누른
  언어만 blob ≤1). 둘 다 목록 길이·로케일 수와 무관하고, 실패해도 다음 단계를 막지 않는다.
- **blob은 안 늘지만 파싱이 는다.** ②의 미리보기는 `probeTargets`가 이미 받아 둔 blob을 쓰므로
  **다운로드가 0 늘지만**, `summarizeCandidates`가 지금 기준 로케일 하나만 풀던 것을 셋으로 늘리므로
  **`adapter.read` 호출이 후보당 1→3**이 된다(`ts-dict` 후보면 ts-morph가 그만큼 더 돈다).
  `maxDuration = 60` 안이어야 하고, T1이 그 호출 수에 상한 단언을 건다.
- **`Select` 옵션의 키 수가 처음엔 일부만 찬다** (per-locale). 전 언어의 키 수는 로케일 파일을 전부
  읽는 것이라 detect의 blob ≤21 밖이다 — 누른 언어부터 채워진다(design §6-⑥). **③의 배지·비교
  문장도 그만큼만 선다**(§1).
- **프리미티브 셋을 넓힌다.** `SegmentedControl`에 국기용 `leading` 슬롯, `EmptyState`에 `className`,
  그리고 **`Skeleton` 신설**(지금은 `projects/loading.tsx`의 관용구 하나뿐이다). 셋 다 `components/ui/`
  안이라 `focus-ring.test.ts`의 "`ui/` 밖에 raw 태그를 두지 않는다"와 같은 방향이다.
