# project-row-redesign — spec

> 2026-10-14 착수 · 2026-10-15 `/feature-review` 반영 · 2026-10-17 locale-add(ARCHITECTURE §5.10 · 작업 언어 술어 `lib/keys/work-locale.ts`)와 `source-row-locale-meter`(orch D1–D10)에 맞춰 대조했다 · 2026-10-18 그 기능이 dev에 들어가 사전 조건을 풀고 orch D11–D15를 반영했다. `/projects` 목록의 **프로젝트 행 하나**를 다시 짠다. 다루는 것은 셋이다 — 무엇을 보여 주나(메타), 어떤 상태를 말하나(상태), 어떻게 그리나(UI). 함께 **Inbox 항목을 행의 띠와 같은 판정에 묶는다**.
> 그릇(그룹 카드 셋·검색·빈 상태·머리)은 이번 범위가 아니다(DESIGN §6.63 그대로).
> 짝 기능: `source-row-locale-meter`가 로케일 진행 막대(`LocaleMeter`)를 Sources 화면의 소스 행으로 가져간다. 이 스펙은 프로젝트 행에서 막대를 빼는 쪽만 맡는다(조율은 design.md §5).

## 사전 조건 — ✅ 충족(2026-10-18)

**`source-row-locale-meter`가 dev에 먼저 들어가 있어야 착수한다**(2026-10-15 사용자). → 2026-10-18 충족: 그 기능의 데이터 층(`312df1d2`·`c0108513`)과 화면(`c3757f49` — `LocaleMeter`가 `LocaleMeterValue`를 받는다, 후속 `cad6746a`·`9ecfc167`)이 dev에 있다. 아래는 이 조건을 둔 이유로 남긴다.
- 이 기능이 먼저 나가면 소스 행에 막대가 붙기 전까지 언어별 진행이 목록 어디에도 없는 창이 생긴다.
- 그 기능이 `LocaleMeter` 입력을 `LocaleMeterValue`로 바꿔 두면 이 기능이 늦게 끝나는 쪽이 된다. 그래서 고아 타입 `RowLocaleProgress` 삭제와 DESIGN §6.63 소비자 서술 정정을 이 기능이 조건 없이 맡는다.
- 확인: `rg -n "RowLocaleProgress" components/locale-meter.tsx`가 0이다 — 2026-10-18 dev `9ecfc167`에서 0건을 확인했다.

## 사용자

**둘 다다.** 목록은 로그인 직후 착지점이라 개발자(OWNER)와 번역 편집자(EDITOR)가 같은 행을 본다.
- 개발자의 질문: "손볼 프로젝트가 있나 — 연결이 끊겼나, 동기화가 실패했나, 보낼 편집이 쌓였나."
- 편집자의 질문: "어느 프로젝트에 할 일이 있나 — 검토가 쌓였나, 아직 손대지 않은 언어가 있나."

두 질문이 한 행에서 충돌하지 않게 하는 것이 이번 재설계의 축이다. **칩은 건강(개발자의 질문)에, 띠는 할 일(두 사람 모두의 질문)에** 답한다. 언어별 진행률("어느 언어가 몇 %인가")은 소스 단위 사실이라 행이 아니라 Sources 화면이 답한다(`source-row-locale-meter`).

## 문제 (관측된 사실)

### 1. 언어 막대가 프로젝트를 대표하지 않는다
`rowLocaleProgress`(`lib/projects/list.ts:341`)는 (소스, 로케일) 쌍을 **소스 slug 알파벳순 → 소스 안 base 먼저 → 코드순**으로 세우고 앞 3개만 남긴다.
- 첫 소스에 로케일이 셋 이상이면 그 소스가 칸을 다 차지하고 **둘째 소스는 행에서 사라진다.** 기본 소스 지정도 고려하지 않는다.
- 라벨은 국기와 코드뿐이다. 두 소스의 `ko`가 나란히 서면 어느 소스의 것인지 알 수 없다.
- base 로케일은 늘 100%에 가깝다. 세 칸 중 한 칸을 정보 없는 막대가 차지한다.
- 컴포넌트 주석과 DESIGN §6.63은 "숨기지 않는다 — 감긴다"고 말하지만, 서버가 이미 3개로 자른다.

(소스, 로케일) 단위 데이터를 프로젝트 행에 담는 것 자체가 원인이다(2026-10-15 사용자).

### 2. 칩·그룹·띠가 서로 다른 판정을 한다
판정 함수 넷(`projectStatus`·`rowChip`·`projectGroup`·`rowBanner`)이 각자 우선순위를 가진다.
- **미발송 편집·리포 앞섬**: 그룹은 `Needs attention`인데 칩은 초록 `Active`다.
- **열린 PR 조회 실패**(`pr_check_failed`): 미발송·리포 앞섬이 없는 행에서는 호박색 경고 띠가 서는데 그룹은 `All set`이다.
- **같은 말이 한 행에 두 번 선다.**
  - 첫 적재 대기는 칩 `Not synced yet`과 둘째 줄 `Not synced yet`이 겹친다. 적재 중이면 둘째 줄은 `Syncing…`이다.
  - 적재 실패 danger는 칩 `Sync failed`, 둘째 줄 `Sync failed`, 띠까지 같은 사실을 세 번 말한다.
  - 첫 적재가 `partial-import`이면 칩은 `Partially synced`인데 둘째 줄은 `Sync failed`라 서로 **모순**된다.

### 3. GitLab 행의 둘째 줄이 GitHub 문장이다
`ProjectRow`는 `withRepoHost`를 거치지 않은 사전을 쓴다. 지금 `withRepoHost`를 거치는 곳은 `ProjectBanner`(`project-list.tsx:347`)와 `BannerAction`(`:409`) 둘뿐이다. 그래서 연결 전 GitLab 프로젝트의 둘째 줄이 `Connect the GitHub App to continue.`로 나온다.

### 4. Inbox와 행의 띠가 다른 할 일을 센다
Inbox 항목(`lib/inbox/plan.ts`)과 행 띠(`rowBanner`)가 따로 판정한다.
- **Inbox에만 있다**: `never_filled`(지금 값이 하나도 없는 작업 언어 — 이력은 보지 않아 채웠다가 비운 언어도 선다, `lib/home/attention.ts:97-98`·malmoi#134).
- **띠에만 있다**: `needs_reconnect`, 그리고 원격 신호 셋(`pr_open`·`pr_check_failed`·`repo_ahead`).

## 완료 조건 (검증 가능한 문장)

1. **프로젝트 행에 언어 막대가 없다** — 행에 둘째 줄이 없고 `LocaleMeter`·`Meter`가 0개다(DOM 테스트). `LocaleMeter` 컴포넌트는 지우지 않는다(`source-row-locale-meter`가 이어받는다).
2. **대표 메타가 리포 줄 아래 한 줄에 선다** — 순서는 `sources · keys · languages · synced`다.
   - 소스 수·키 수는 **Sources 화면·사이드바 배지와 같은 정의**다. 같은 fixture에서 같은 수가 나오는지 postgres 교차 테스트로 확인한다.
   - 언어 수는 Sources 행의 `N languages`와 **같은 작업 언어 술어**(`workLocaleWhere` — orphaned와 제거 예정 REMOVE를 빼고 추가 ADD는 센다)로 센다. 다만 소스를 가로지른 고유 대상(비-base) 코드라 같은 수를 내는 다른 화면은 없다(design §1).
   - 언어 수가 0이면 그 칸을 생략한다.
   - 동기화 시각은 Home 카드와 같은 함수(`lastSyncTime`)에서 나온다. `null`·`"unrecorded"`면 칸을 생략한다.
   - 좁으면 메타 줄은 감기고 숨지 않는다.
3. **칩·그룹·띠가 한 판정에서 나온다** — 함수 하나(`planProjectRow`)가 셋을 함께 돌려준다. 입력 축(보관 × `projectStatus` × 적재 실패 톤 × 적재 중 × 열린 PR 셋 상태 × 미발송·리포 앞섬·검토·never_filled의 0/양수)의 모든 조합에서 표 테스트가 다음을 센다.
   - 띠가 {`needs_reconnect`, `import_failed`, `setup`}이면 그룹은 `needs_attention`이다.
   - 띠가 {`unsent`, `pr_open`, `pr_check_failed`, `repo_ahead`, `review`, `never_filled`}이면 칩은 `active`이고 그룹은 `all_set`이다.
   - 칩이 `active`면 그룹은 `all_set`이고, 그룹이 `all_set`이면 칩은 `active`다.
   - 보관이면 띠가 없다.
4. **같은 사실이 한 행에 두 번 서지 않는다** — 칩 낱말(`stateLabel`)이 같은 행의 띠 문장에 그대로 들어가지 않는다. 메타 줄에는 `STATE` 낱말이 없다. DOM 표 테스트로 상태 표 전 행을 센다.
5. **GitLab 행의 모든 문장이 GitLab 문장이다** — 행 전체가 `withRepoHost(m, row.repoHost)`를 지난다. GitLab setup 행과 GitLab PR 조회 실패 행의 렌더 결과가 `/github|pull request/i`에 0건이다(DOM 테스트).
6. **Inbox 항목과 행의 띠가 같은 판정에서 나온다** — DB에서 정해지는 할 일(`needs_reconnect`·`import_failed`·`setup`·`unsent`·`review`·`never_filled`)을 순수 함수 하나가 내고, 행의 띠와 Inbox가 둘 다 그 결과를 쓴다. 표 테스트가 다음을 센다.
   - 행 띠가 DB 할 일이면 그 종류가 같은 프로젝트의 Inbox 항목에 있다. 역할 예외는 design.md §4의 표를 따른다.
   - 원격 신호 셋(`pr_open`·`pr_check_failed`·`repo_ahead`)은 행 띠 전용이다. Inbox·배지 경로는 호스트 API를 부르지 않는다.
7. **Claude Design 시안이 있고 구현이 그것과 같다** — `/design-sync` 실측이 일치하고 리뷰 지적이 0건이다. 시안: [Project Row Redesign.dc.html](https://claude.ai/design/p/b99d54cd-3034-44f1-8446-0a864da9d767?file=Project+Row+Redesign.dc.html)(2026-10-18 수령 — 시안이 정한 사실은 design §6).
8. **기존 계약을 유지한다** — 각각 DOM 단언으로 확인한다.
   - 보관 행은 띠가 없고 이름·메타(새 메타 포함)가 `gray-dim`이다.
   - 행 전체가 링크이고, 띠는 링크 밖의 형제다.
   - focus 링은 `ring-inset`이다.
   - 검색 일치는 이름에서만 칠한다.

## 비목표

- **그릇** — 그룹 카드 셋의 존재·순서·헤더, 검색(`?q=`), 빈 상태 둘, 머리, 로딩 골격의 구조는 그대로다. 행 치수가 바뀌면 골격 치수만 따라간다.
- **새 데이터** — 스키마·마이그레이션이 없다. 이미 저장된 값만 쓴다(design.md).
- **역할·멤버 수의 복귀** — 2026-09-30 사용자 결정으로 행 메타에서 걷었다. 이번에 되살리지 않는다. 그 근거는 T11에서 정본에 올린다.
- **정렬·필터 추가** — 목록 정렬 순서(그룹 안 slug 순)와 필터 부재(DESIGN §6.63 "필터 탭이 사라졌다")는 그대로다.
- **Home의 상태 판정** — Home `planHomeState`·Attention 카드는 손대지 않는다. 다만 새 행 판정과 같은 낱말·톤을 쓰는지는 교차 테스트(`cross-screen.test.ts`)로 본다(§2.4).
- **Sources 화면의 막대** — `source-row-locale-meter`가 맡는다.
- **Inbox의 원격 신호** — 열린 PR·PR 조회 실패·리포 앞섬은 Inbox에 넣지 않는다. 배지 Action이 매 헤더에서 불리므로 호스트 API를 부르면 헤더마다 비용이 든다(2026-10-15 사용자).
- **실시간 갱신·폴링** — 목록은 요청 시점 값이다.
- **언어 요청만 미전달인 프로젝트의 표시** — 전달 전 언어 제거(`locale-change-pending`으로 CI·야간 적재 전체 보류)나 값 있는 언어 추가만 남은 프로젝트를 행·Home·Inbox가 어떻게 말할지는 별개 기능이다(2026-10-17 사용자 — malmoi#290, source-row-locale-meter orch D11). 이 기능에서는 그 프로젝트가 칩 `Active`·`All set`·띠 없음으로 남는다(design §1 예외).
