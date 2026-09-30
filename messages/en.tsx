import type { ReactNode } from "react";

/**
 * **UI 문자열의 단일 출처** (CLAUDE.md 코드 컨벤션). 라이브러리를 넣지 않는다 — 필요한 것은 "문자열이 한 곳에
 * 있다"와 "나중에 ko를 더할 자리"뿐이고, 그건 객체 하나로 된다.
 *
 * ⚠️ **이 파일은 잎이다.** `@/lib/**`를 import하지 않는다(react의 `ReactNode` 타입뿐) — 클라이언트
 * 컴포넌트가 읽으므로 그 import 그래프가 곧 번들이다. 2026-09-07에 7.2MB 청크가 정확히 그렇게 나갔다
 * (`components/__tests__/client-graph.test.ts`가 상시로 센다).
 *
 * ⚠️ **값은 문자열 또는 함수다.** 보간·복수·노드 삽입을 헬퍼 셋(`fmt`·`plural`·`rich`)으로 만들지
 * 않는다 — 함수 값이 셋을 한 번에 하고, `as const` 덕분에 접근 자체가 타입 검사다.
 *
 * ⚠️ **소비자가 `satisfies`를 건다.** 여기서 union을 import하면 잎이 아니게 되므로, 갈래 누락은
 * 각 문구 모듈이 `satisfies Record<Union, string>`으로 잡는다 (CLAUDE.md 코드 컨벤션).
 *
 * 문체는 DESIGN §10이다 — sentence case · 라벨에 마침표 없음 · "please"·"sorry" 금지 ·
 * 오류는 다음 행동을 말한다 · **편집자 화면에 git 어휘를 쓰지 않는다.**
 */
/**
 * ⚠️ **한 낱말이 두 자리에 선다** — 저장된 값을 지금 키로 못 여는 칸(`common.unreadable`)과 이벤트
 * 상세의 값 상태(`logs.value.unavailable`)가 같은 사실을 말한다. 리터럴을 두 벌 두면 하나가 낡고,
 * 그 어긋남은 두 화면을 함께 보는 눈이 없어 안 보인다 (2026-09-13 `malmoi`/`Malmoi` 계열).
 */
const UNAVAILABLE = "Unavailable";
/** 야간 재시도 절 — 사유 문장 셋이 끝에 달고, 보관 프로젝트에서는 Logs가 이 절을 뺀다(`planArchivedReason`). 사본을 두지 않으려고 한 곳에 둔다(2-W9). */
const NIGHTLY_RETRY = "The next nightly run tries again.";

export const en = {
  /**
   * **리포 재적재(화면 이름 `Sync`)** — 확인 Dialog · 결과 · 거부.
   * 시안: Claude Design `design_handoff_sync_repository/Sync Repository.dc.html` 아트보드 `4a`~`4f`.
   *
   * ⚠️ **코드 식별자는 `import`이고 화면만 `Sync`다** (DESIGN §10.1). 화면 전체가 같은 표를 따른다 — `terminology.test.ts`가 센다.
   */
  repositorySync: {
    /**
     * Home 머리의 트리거.
     *
     * ⚠️ **확인 버튼(`confirm`)과 이름이 달라야 한다** — 같으면 접근성 트리·자동화에서 두 버튼이
     * 구별되지 않는다. 2026-09-15에 Archive Dialog가 정확히 그 모양(트리거·확인 둘 다
     * `Archive project`)이라 셀렉터가 모호해진 클릭이 확인 버튼을 눌러 프로젝트를 실제로 보관시켰다.
     */
    action: "Sync",
    /**
     * 멈춘 [Sync]의 사유 (audit #37) — `aria-describedby`로만 읽힌다. 미연결·보관은 같은 화면의 배너가 원인을 말한다.
     * ⚠️ **Publish 진행은 이 문장이 아니라 `waitPublish`다** (audit-ux #10) — 옆 버튼의 `Publishing…` 라벨이 원인을 말하던 시절의
     * 분담이었는데 D1이 그 라벨을 걷었다. `translations.publish.paused`와 같은 형이다.
     */
    paused: "Syncing is currently unavailable.",
    /** Publish가 도는 동안 꺼진 쓰기 트리거의 사유 (audit #37 · audit-ux #10) — [Sync]·[Try again]·번역 화면의 [Save]가 함께 쓴다(§6.64). */
    waitPublish: "Wait for Publish to finish.",
    confirm: "Sync from repository",
    /**
     * 미전달 편집이 있을 때의 확정 라벨 (sync-edit-protection spec "수동 Sync"). 트리거 `Sync`와 접근 이름이 달라야 한다는
     * 규칙(DESIGN §6.646)은 이 라벨에도 선다. 무엇을 버리는지를 동사가 먼저 말한다.
     */
    confirmDiscard: "Discard changes and sync",
    /** 제목이 대상을 들므로 확인 버튼은 **동작 + 방향**만 말한다 (시안 §4). */
    title: (name: string): string => `Sync ${name} from the repository?`,
    /** ⚠️ 브랜치는 **mono 표면**이다 — 호출부가 감싼다(사전은 잎이라 클래스를 들지 않는다). */
    body: (branch: ReactNode): ReactNode => (
      <>Malmoi will read the translation files on {branch} and replace what's in the app with them.</>
    ),
    /**
     * ⚠️ **수가 붙는 조각에만 weight 500이 붙는다** (시안 `4b`) — 강조가 둘이면 미발송과 열린 PR이
     * 같은 급으로 경쟁하는데, 실제로 세어진 값은 한쪽뿐이다. 그래서 조각을 따로 낸다.
     */
    unsentCount: (n: number): string => `${n.toLocaleString("en-US")} unsent edit${n === 1 ? "" : "s"}`,
    /**
     * **폐기를 말하는 문장 하나로 교체했다** (sync-edit-protection — DESIGN §6.644) — 설명문이 이미 `replace`를 말하지만 이 줄이
     * 무엇이 **버려지는지**를 말하는 유일한 자리다. 문장을 더하지 않았다(360px Dialog 줄 수 불변).
     * ⚠️ `updatedBy`까지 비워 저자도 리포가 된다(`lib/push/apply.ts`) — "discard"가 그것을 포함한다.
     */
    unsent: (n: number, edits: ReactNode): ReactNode => (
      <>Sync will discard {edits} and replace {n === 1 ? "it" : "them"} with repository values.</>
    ),
    /** ⚠️ 이 줄은 `unsent`와 **독립으로 서거나 빠진다** — 문단으로 잇지 않는다 (시안 `4c`). */
    openPr: (n: number, branch: string): string =>
      `Edits in pull request #${n} aren't in ${branch} yet — they will be replaced too.`,
    /**
     * ⚠️ **조회 중 자리이고 `prUnknown`으로 대신하지 않는다** (malmoi#75 — Publish의 malmoi#49와 같은
     * 부류). 그 문장은 조회가 **실패했다**는 말이라, 로딩에 세우면 몇 초 동안 일어나지 않은 실패를 읽힌다.
     * 블록은 조회 시작부터 선다 — 성공한 조회가 `null`을 줄 때만 사라지므로 **블록은 줄어드는 방향**이다:
     * 반대로 두면 미발송 0 + 조회 중이 `4a`와 픽셀 단위로 같아져 경고를 한 번도 못 본 채 실행된다.
     */
    prChecking: "Checking whether anything is still waiting in a pull request…",
    /**
     * 조회 **실패** 전용이다. ⚠️ 확인된 경고와 **같은 amber**에 둔다 — muted 한 줄이면 부재(줄이 서지
     * 않는 것)와 같은 신호로 읽힌다 (POSTMORTEM 2026-09-03).
     */
    prUnknown: "We couldn't check whether anything is still waiting in a pull request.",
    /**
     * ⚠️ **라벨이 도착 화면의 버튼 이름(`Publish`)을 든다** (audit #28 — POSTMORTEM 2026-09-14 재발). 전엔
     * `Send changes first`였는데 번역 화면에 그 이름의 버튼이 없었다.
     */
    sendFirst: "Publish first",
    /**
     * 링크가 앱 안(번역 화면)으로 간다는 것을 **문장이** 말한다. 2026-09-18에 외부 링크도 글리프를
     * 버려서 모양으로는 안팎이 안 갈린다 — 목적지를 알리는 몫이 전부 이 문장에 있다.
     */
    sendHint: (n: number, link: ReactNode): ReactNode => <>To keep {n === 1 ? "it" : "them"}, {link} — it opens the translation screen.</>,
    /**
     * 미발송 0 ∧ 열린 PR — `Publish first`가 **거짓이 되는** 갈래다 (시안 `4c` 오른쪽).
     * 링크만 두면 권유가 왜 바뀌었는지가 화면에 없어 문장을 함께 둔다.
     */
    nothingUnsent: "Nothing to send — every edit is already sent.",
    /**
     * ⚠️ **구역이 다른 문구를 빌려 쓰지 않는다** — `archive.confirm.openPrLink`가 같은 문자열이지만
     * 그것을 참조하면 Archive를 고칠 때 이 화면이 조용히 따라 움직인다 (2026-09-13 리뷰).
     */
    seeOpen: "See what's open",
    /** ⚠️ `Alert.title`은 **구두점 없는 문장 조각**이다 (DESIGN §10) — 헤드라인에서 마침표를 뗀다. */
    completed: (n: number, branch: string): string => `Synced ${n.toLocaleString("en-US")} key${n === 1 ? "" : "s"} from ${branch}`,
    /**
     * ⚠️ **사고가 붙는 헤드라인에는 브랜치가 없다** (시안 `4e`) — `Synced 640 keys, but 1 surface …`.
     * 한 문장에 출처와 사고를 함께 얹으면 `from main, but …`으로 절이 셋이 되어 사고가 뒤로 밀린다.
     */
    syncedKeys: (n: number): string => `Synced ${n.toLocaleString("en-US")} key${n === 1 ? "" : "s"}`,
    unreadable: (n: number): string => `${n} source${n === 1 ? "" : "s"} couldn't be read`,
    /** ⚠️ `couldn't be read`를 여기 쓰지 않는다 — 그 표면은 **읽혔고 적용만 안 됐다**. */
    notReplaced: (n: number): string => `${n} source${n === 1 ? " wasn't" : "s weren't"} replaced`,
    withIssue: (base: string, issue: string): string => `${base}, but ${issue}`,
    partial: (n: number): string => `${n.toLocaleString("en-US")} item${n === 1 ? " wasn't" : "s weren't"} synced. Check the details below.`,
    /**
     * 승인 뒤 남은 편집 (sync-edit-protection T9). **실패가 아니다** — 승인 뒤 저장됐거나 리포에 값이 없어 덮이지 않은 편집이다.
     * 남아 있는 한 자동 적재가 멈춘다는 결과까지 말한다(그 사실이 없으면 "성공했는데 왜 안 들어오지"가 된다).
     */
    kept: (n: number): string => `${n.toLocaleString("en-US")} unsent edit${n === 1 ? " was" : "s were"} kept. Repository updates are held until ${n === 1 ? "it's" : "they're"} sent.`,
    /** ⚠️ 표면 이름은 헤드라인이 아니라 **원인 줄**에 산다 (DESIGN §6.644) — 셋 이상이면 헤드라인이 무너진다. */
    cause: (surface: ReactNode, reason: string): ReactNode => <>{surface} — {reason}</>,
    /** 동기화 실패의 문장은 하나다(DESIGN §2.4) — Home 배너 제목과 같은 문장이다. */
    failedTitle: "The last sync couldn't finish",
    /**
     * 전 표면이 밀린 결과(`summarizeImport.tone === "muted"`) — 실패가 아니라 밀림이라 Logs와 같은 낱말이다(ux-drift-unify 🔴 B).
     * 보조 문장은 표면별 원인 줄(`errors.superseded`)이 든다.
     */
    supersededTitle: "Superseded",
    /** 거부 Alert의 액션 셋(아래 `signIn` 포함). 다른 구역(`archive.empty` · `settings.repository`)에서 빌려 오지 않는다. */
    openSettings: "Open settings",
    /** 계정 미연결 거부(`not-connected`)의 액션 — 이 사람의 GitHub 연결이 사는 화면이다. 문장("connect it in Account")과 같은 곳을 가리킨다. */
    openAccount: "Open Account",
    /** 세션이 끝난 거부의 액션 (QA D2) — 편집자 세션 Alert의 `Sign in`과 같은 낱말이다. */
    signIn: "Sign in",
    reconnect: "Reconnect",
    /**
     * **`Alert`의 어느 자리에 서는지가 구두점을 정한다.** 앞의 셋은 표면별 사고의 **원인 줄**(본문이라
     * 문장이고 마침표를 유지한다), 뒤의 다섯은 거부 Alert의 **제목**(문장 조각이라 마침표가 없다).
     *
     * ⚠️ **`invalid input`만 제목 자리인데 문장이다** — 고칠 방법이 "새로고침"이라 조각으로는 말할 수
     * 없다. 슬러그가 깨져야 닿는 갈래라 화면에서 사실상 안 보인다(DESIGN §10의 "다음 행동" 쪽을 든다).
     */
    errors: {
      "invalid-format": "This source has no valid file format.",
      "superseded": "New repository data arrived while syncing. This source wasn't replaced. Try again if needed.",
      // ⚠️ **원인을 단언하지 않는다** (r1) — lease 상실은 다른 실행만이 아니라 만료·권한 상실·보관·소스 삭제도 덮는다(`lib/import/apply-plan.ts`).
      "lease-lost": "This sync stopped before it could replace this source. Refresh to see the current state before trying again.",
      "not-ready": "This project hasn't finished its first sync yet",
      /**
       * ⚠️ **Sync를 누른 사람의 GitHub 계정이 연결되지 않았다**(ConnectError) — 리포 연결 문제가 아니다(ux-drift-unify r1). Google로만 로그인한
       * 둘째 OWNER가 여기 닿는다. 액션은 설정이고, 설정의 계정 복구 줄이 Account로 잇는다.
       */
      "not-connected": "Your GitHub account isn't connected to Malmoi — connect it in Account to sync",
      /** 리포 id가 고정되지 않은 프로젝트(ux-drift-unify D1) — Home 배너 제목과 같은 Disconnected 문장이다. */
      unpinned: "This repository is disconnected",
      "already-running": "A sync is already running",
      /**
       * ⚠️ 제목 자리라 마침표가 없다(DESIGN §10). 아무것도 지워지지 않았다는 것이 요지다.
       * ⚠️ **원인을 말하지 않는다** (malmoi#137) — 지문의 어떤 변화(새 미전달 편집·기준 브랜치…)에도, 지문 발급 실패(`approval: null`)에도 선다.
       */
      "reconfirm": "Sync couldn't confirm that what you reviewed is still current — nothing was discarded. Open Sync again to review and confirm",
      "no-surfaces": "There's nothing to sync — this project has no active sources",
      "invalid input": "The project couldn't be identified. Refresh the page and try again.",
      /**
       * ⚠️ **빌려 온 문장이 이 화면에서 거짓이 되는 자리다** — `onboardErrorMessage("ingest-failed")`는
       * "The first import failed. You can try again from settings."이고, 첫 적재가 아닌데 그렇게 말하며
       * 가리키던 설정 화면의 재시도 컨트롤은 이제 없다(2026-09-24 삭제 — 첫 적재는 Sources 상세가 든다). `accessErrorMessage("unavailable")`의
       * 꼬리 "— your text is kept"는 `[Sync]`에 입력이 없어 지킬 text가 없고, 하필 이 동작은 **리포 값으로
       * 번역을 덮고 저자까지 비운다** — 그 절이 "내 번역은 안전하다"로 읽히면 불변식의 정반대다.
       * 둘은 같은 사건("요청이 못 갔다")이라 같은 문장을 쓴다.
       *
       * ⚠️ **원인을 단언하지 않는다** — "could not finish reading the repository"로 썼다가 되돌렸다:
       * `unavailable`은 `readSession()`이 세션 저장소를 못 읽은 것이라 **GitHub을 한 번도 안 친다**.
       * `ingest-failed`의 `try`도 `findUnique`·`checkRepoAccess`를 먼저 감싸므로 pooler가 끊기면 같다.
       * **빌려 온 문장이 거짓이 되는 것과 같은 실수를 방향만 바꿔 되풀이한 것이다** — 이번엔 이 화면
       * 전용인데 **덮는 union보다 문장이 더 구체적**이라 거짓이 됐다. 단계를 말하지 않으면 전부 참이다.
       */
      "ingest-failed": "The sync didn't go through",
      /**
       * ⚠️ **공용 `access.unauthorized`를 빌리지 않는다** (QA D2) — 그 꼬리 "to save your work"는 편집 화면의 문장이고
       * `[Sync]`에는 저장할 입력이 없다. 제목 자리라 마침표가 없다(DESIGN §10). 다음 행동은 옆의 [Sign in]이 든다.
       */
      "unauthorized": "Your session ended — nothing was synced. Sign in, then sync again",
      "unavailable": "The sync didn't go through",
      /**
       * 응답을 잃은 실행 — 클라이언트만 낸다 (malmoi#132). ⚠️ **"didn't go through"를 쓰지 않는다** — 서버가 Sync를 끝냈을 수 있다.
       * Publish의 `unknownDelivery`와 같은 형이고, 무엇이 됐는지는 이 문장이 아니라 다시 읽은 화면이 말한다.
       * ⚠️ **"화면이 최신이다"를 덧붙이지 않는다** — 오프라인이면 다시 읽지 않으므로(`SyncButton`) 그 절이 거짓이 된다.
       */
      "unconfirmed": "We couldn't confirm whether the sync finished",
      /**
       * ⚠️ **[Reconnect]를 붙이지 않는다** (DESIGN §6.2 · 2026-09-10 sec-audit-2 발견 34) — 리포는
       * 생성 시점 고정이라 `connectRepository`가 재고정을 거부한다. 눌러도 실패할 버튼이므로
       * tone도 warning이 아니라 **danger**다: 이 거부는 이 화면에서 풀리지 않는다.
       */
      "repo-replaced": "This connection points to a different repository",
    },
    /**
     * `base-branch-missing`의 Sync 갈래 (malmoi#85). ⚠️ **`onboarding["base-branch-missing"]`를 빌리지 않는다** — 그쪽은
     * 새 프로젝트에서 리포의 **기본** 브랜치가 비었다는 말이고, Sync에서 없는 것은 **설정의 base branch**다.
     * 제목 자리라 마침표가 없다(DESIGN §10). EDITOR에게는 설정 링크가 없으므로 할 수 있는 사람을 부른다.
     */
    baseBranchMissing: {
      owner: (branch: string): string => `The base branch ${branch} isn't in the repository anymore — pick another base branch in Settings`,
      editor: (branch: string): string => `The base branch ${branch} isn't in the repository anymore — ask a project owner to pick another base branch`,
    },
  },
  /**
   * not-found 경계 문구 (audit #16·#17). ⚠️ **무엇을 잃었는지 단정하지 않는다** — 프로젝트 세그먼트와 루트가 함께 쓰고,
   * 그 아래 갈래(없는 주소 · 사라진 소스 · 지워진 프로젝트)가 여럿이다.
   */
  notFound: {
    title: "Page not found",
    description: "This page may have moved or is no longer available.",
    action: "Go to your projects",
  },
  /** 셸 밖 오류 경계(`app/error.tsx`·`app/global-error.tsx`) — 무엇이 실패했는지 모르므로 다시 시도만 권한다. */
  crash: {
    title: "Something went wrong",
    description: "This page couldn't load. Try again in a moment.",
  },
  surfaces: {
    sourceCounts: (keys: number, locales: number): string => `${keys.toLocaleString("en-US")} ${keys === 1 ? "key" : "keys"} · ${locales.toLocaleString("en-US")} ${locales === 1 ? "language" : "languages"}`,
    label: "Source", baseLocale: "Base language", confirm: "Check files", cancel: "Cancel", conflict: "These files already belong to another source:",
    failed: "We couldn't add this source. Your existing translations are unchanged. Try again.",
    missingTitle: "Source unavailable",
    missingDescription: "This page may have moved or the source may no longer be active. Open your projects to continue.",
    projects: "Go to your projects",
  },
  // ⚠️ 화면 섹션은 **그 화면을 만드는 커밋이 더한다** — 빈 껍데기를 미리 두지 않는다("만든 것이 실제로
  // 호출되는가"). 지금 있는 것은 T2~T4가 실제로 읽는 것뿐이고, 로그인·초대 문구는 T6·T8이 더한다.
  common: {
    retry: "Try again",
    appName: "Malmoi",
    /**
     * ⚠️ **구역이 다른 문구를 가져다 쓰지 않는다** (2026-09-13 리뷰). Sessions·GitHub 구역이
     * `link.methods.cancel`을 빌려 쓰고 있었고, 그러면 Sign-in methods를 고칠 때 나머지 둘이
     * 조용히 따라 움직인다. **공용으로 선언한 것을 쓰는 것은 빌려 쓰는 것이 아니다.**
     * ⚠️ 기존 `members.cancel`·`archive.confirm.cancel`은 이번 범위 밖이라 그대로 둔다.
     */
    cancel: "Cancel",
    /** 프리미티브의 아이콘 전용 컨트롤 둘 — 화면 문구는 사전을 지난다 (CLAUDE.md). */
    close: "Close",
    dismiss: "Dismiss",
    /**
     * 긴 원격 실행이 `SLOW_AFTER_MS`를 넘겼을 때의 한 줄 (audit-ux #23) — 탐지·첫 적재·Sync·Publish가 같은 문장을 쓴다.
     * ⚠️ **단계를 말하지 않는다** — 진행 이벤트가 없어서 "어디까지 왔다"는 거짓이 된다.
     */
    slow: "Still working. Large repositories can take a minute or more.",
    /**
     * 셸의 패널 구분선 — 글자가 하나도 없는 컨트롤이라 이름이 여기서만 나온다.
     * ⚠️ `role="separator"`는 이름이 없으면 스크린리더에 "separator"로만 읽혀 좌우 어느 쪽을
     * 움직이는지 말하지 못한다. 라이브러리는 이름을 만들어 주지 않는다.
     */
    resizeSidebar: "Resize sidebar",
    /** 셸의 전역 항목 — 사이드바 하단과 사용자 메뉴가 같은 문구를 쓴다. */
    nav: {
      /**
       * ⚠️ **라벨과 순서는 Figma 시안(`212:944`)이 정본이다** (8-3). 2026-09-09의 IA(PRODUCT §7.7)에서
       * 바뀐 것: `Your work` 구역 라벨이 **사용자 이름**으로, `All projects`→`Projects`,
       * `Your account`→`Settings`, `Overview`→`Home`, `Languages`→`Locales`,
       * `Settings`(프로젝트)→`Project settings`. `New project`는 그때 사이드바에서 빠졌다가 2026-09-27에 `Projects` 아래로 돌아왔다(사용자).
       */
      projects: "Projects",
      /**
       * 사용자 축의 계정 화면(`/account`) — **프로젝트 축의 `Project settings`와 이름으로 갈린다.**
       * ⚠️ 유저 메뉴도 같은 문구를 쓴다: 한 곳을 가리키는 이름이 둘이면 그중 하나가 낡는다.
       *
       * ⚠️ **2026-09-23에 `Settings`에서 바뀌었다** (사용자) — 시안(8-3)이 `Settings`였는데, 그 낱말이
       * 같은 사이드바의 `Project settings`와 축만 다른 동의어라 "어느 설정인가"를 매번 되묻게 했다.
       * `Account`는 라우트(`/account`)·아이콘(`CircleUser`)과도 같은 낱말이다. **키 이름도 함께 옮겼다** —
       * 값만 바꾸면 `nav.settings`가 `Account`를 뱉어 다음 사람이 프로젝트 설정으로 오인한다.
       */
      account: "Account",
      /**
       * `/mcp` (mcp-connector) — 사이드바 사용자 축의 `Account` 바로 앞. **페이지 제목도 이 키다**(DESIGN "메뉴명 = 페이지 제목").
       */
      mcp: "MCP connector",
      /**
       * 프로젝트 구역의 항목 여섯. **`lib/shell/nav.ts`가 읽는다** — 라벨이 소스 리터럴이던 자리다.
       *
       * ⚠️ **화면 제목도 이 키들을 쓴다** (2026-09-11 사용자 — "LNB 메뉴명과 페이지 타이틀은 항상
       * 동기"). 사이드바에서 `Projects`를 누르고 도착한 화면이 `Your projects`라고 말하면 같은
       * 곳인지 매번 확인하게 된다. **키를 공유해 구조적으로 묶었다** — 두 벌로 두고 규칙만 적으면
       * 하나가 낡고, 그 어긋남은 한 화면 안에서 안 보인다(사이드바와 제목을 함께 보는 눈이 없다).
       *
       * ⚠️ **그래서 `projects.title`·`locales.title` 같은 키가 없다.** 화면이 자기 제목을 갖고
       * 싶어지면 그 순간이 "메뉴명과 갈라도 되는가"를 판정할 자리다.
       */
      home: "Home",
      sources: "Sources",
      translations: "Translations",
      members: "Members",
      logs: "Logs",
      /**
       * ⚠️ **2026-09-23에 `Project settings`에서 줄었다** (사용자) — 같은 날 계정 항목이 `Account`가 되어
       * 사이드바의 `Settings`가 하나만 남는다. 키 이름은 그대로 둔다: 값이 짧아져도 축은 프로젝트다.
       */
      projectSettings: "Settings",
      signOut: "Sign out",
      /** 사이드바 사용자 구역의 `Projects` 바로 아래 항목 (2026-09-27 사용자 — 8-3의 "사이드바에는 없다"를 뒤집었다). 목록 화면의 버튼·빈 상태도 쓴다. */
      newProject: "New project",
      userMenu: "Account menu",
      /** LNB 맨 아래 접기 토글 (2026-09-28 사용자 — 8-3이 지운 접기가 돌아왔다). 접힌 레일에선 `title`로도 보인다. */
      collapseSidebar: "Collapse sidebar",
      expandSidebar: "Expand sidebar",
      /**
       * LNB 프로젝트 구역 머리의 전환 메뉴 (2026-09-27 사용자). ⚠️ **맨 아래 행은 `newProject`를 그대로 쓴다** — 같은 행동을
       * LNB 항목·목록 버튼과 다른 이름(`Create project`)으로 부르면 그중 하나가 낡는다.
       */
      projectSwitcher: {
        label: "Switch project",
        search: "Find project…",
        empty: "No projects found",
        /** 입력 오른쪽 키 칩 — 닫는 키 이름이다. */
        escHint: "Esc",
      },
      /** 헤더의 로고가 링크다 — 그림뿐이라 이름이 없으면 스크린리더가 URL을 읽는다. */
      appHome: "Malmoi home",
    },
    /** 복사 버튼의 **라벨 교체** 셋 (DESIGN §6.4) — 실패를 삼키면 사용자가 복사된 줄 알고 떠난다. */
    copy: "Copy",
    copied: "Copied",
    copyFailed: "Couldn't copy — select it yourself",
    /**
     * 저장된 값을 지금 키로 못 여는 행. **"없음"과 다른 말이어야 한다** — 빈 칸으로 두면 관리자가
     * "이 사람은 이메일이 없구나"로 읽고, 그것이 POSTMORTEM 2026-09-03이 말하는 실패다.
     * 표 셀에 들어가므로 한 단어이고, 사용자가 할 일은 없다(운영자가 키를 되살린다).
     */
    unreadable: UNAVAILABLE,
  },

  /**
   * 검색·링크 미리보기 전용 문구 (seo-geo). ⚠️ **나머지 머리 문구는 기존 값을 재사용한다** — 설명은 `landing.hero.body`,
   * docs 라벨은 `publicDocs.docs.title`, 방침 제목은 `publicDocs.privacy.title`. 사본을 만들면 화면과 검색 결과가 따로 낡는다.
   */
  seo: {
    /** 랜딩 `<title>` — absolute라 템플릿(`%s · Malmoi`)을 안 지나므로 브랜드를 스스로 담는다. */
    homeTitle: "Malmoi: Localization for GitHub repositories",
    /**
     * `public/og.png`의 대체 텍스트 — 제목 반복이 아니라 이미지 내용 묘사다. ⚠️ 이미지는 사용자가 준 자산이다(launch-readiness L2.12) —
     * 그림이 바뀌면 이 문장도 같이 고친다.
     */
    ogImageAlt:
      "The headline Connect your projects, Translate & ship together above a synced GitHub project card for your-project (src/i18n/locales.json) and three translation key cards, welcome.title, team.invite and common.save, each with Korean, English and Japanese values",
    /** `/signin` 탭 제목 — `signIn.title`("Sign in to Malmoi")을 쓰면 템플릿과 브랜드가 두 번 선다. */
    signInTitle: "Sign in",
  },

  /**
   * 로그인 화면 (8-1b — Figma 시안).
   *
   * ⚠️ **tagline과 모형 카드 문구 넷이 사라졌다.** 시안이 제목 한 줄이고 우측 장식이 키비주얼
   * 이미지로 바뀌었다 — 제품 설명은 **랜딩이 맡는다**(2026-09-10 사용자). 그때까지 비개발자가
   * 이 제품이 뭔지 알 수 있는 자리가 앱에 없다는 것이 받아들인 대가다.
   */
  signIn: {
    title: "Sign in to Malmoi",
    backToInvitation: "Back to invitation",
    // 동의 화면에서 시작한 로그인이 취소·오류로 여기 착지했을 때의 복귀 링크(mcp-oauth design §6.1) — `backToInvitation`과 같은 자리·형.
    backToAuthorization: "Back to app authorization",
    github: "Continue with GitHub",
    google: "Continue with Google",
    /** 약관 — 링크 앞뒤로 갈린다. Terms는 만들지 않는다(유료 서비스가 아니다). */
    consent: { before: "By clicking Continue through a third party you accept the Malmoi ", link: "Privacy Policy", after: "." },
    footer: { copyright: "© 2026 Malmoi", github: "GitHub", privacy: "Privacy Policy" },
    /**
     * 우측 장식의 문구 둘. ⚠️ **키비주얼을 `alt=""`로 둘 수 있는 근거가 이 두 줄이다** — 이미지
     * 안에 구운 텍스트가 말하는 것을 여기가 이미 말하고 있어야 그것이 장식이 된다.
     */
    hero: { top: "Connect your projects", bottom: "Translate & ship together" },
  },

  /**
   * 랜딩(`/`) — 비로그인 방문자만 본다(`ok`는 `/projects`로 간다).
   *
   * ⚠️ **셸의 `Docs`·`GitHub`는 푸터(`m.signIn.footer`)와 같은 낱말이지만 다른 자리다** — 헤더 내비의 이름이고,
   * 푸터 목록은 `lib/links.ts`가 `/signin`과 함께 든다.
   */
  landing: {
    shell: {
      logo: "Malmoi home",
      nav: "Main",
      docs: "Docs",
      github: "GitHub",
      getStarted: "Get started",
    },
    /** 히어로 — 버튼 둘은 헤더와 같은 말이라 `shell.docs`·`shell.getStarted`를 쓴다(같은 구역). */
    hero: {
      /**
       * h1 두 줄 — 줄은 `<br>`가 가른다. ⚠️ 둘째 줄은 Sentence case다(시안 열린 결정 3).
       * ⚠️ **구현된 화면이라 코드가 정본이다** — Claude Design 시안은 첫 구현 동안만 정본이었다. 문구를 바꿀 때 시안을 따라가지 않는다.
       */
      title: ["Connect your projects,", "translate & ship together"] as const,
      /**
       * ⚠️ `locale files`가 아니다 — `terminology.test.ts`가 `locale`을 금지한다(DESIGN §10.1).
       * ⚠️ **첫 문장이 정의다**(seo-geo T12a) — 이 값이 홈 description·`og:description`·`llms.txt` 머리·JSON-LD 설명으로도 나간다.
       * 분량을 늘리지 않는다(히어로 줄 수).
       */
      body: "Malmoi is a localization tool for GitHub repos: it finds your translation files, lets teammates edit them in the browser, and sends every change back as one pull request.",
      /** h1 위 알약(2026-09-30 사용자) — 배포된 앱 버전(`APP_VERSION`)이 비면 버전 없는 문구다. */
      latest: (version: string) => (version === "" ? "Latest changelog" : `What's new in v${version}`),
    },
    /** 스크롤 구동 목업 — 캡션 다섯은 씬 순서다. 보이는 캡션은 `aria-hidden`이고 visually-hidden `<ol>`이 늘 담는다. */
    stage: {
      label: "How Malmoi works",
      captions: [
        "Malmoi reads the translation files already in your repository.",
        "Fill in the languages a key is missing.",
        "Each saved edit adds to the count on Publish.",
        "Review every change as a diff before it's sent.",
        "Everything goes back as one pull request.",
      ] as const,
    },
    closing: {
      title: "Start from the files you already have",
      /** 지원 포맷을 문장으로 선다(seo-geo T12a) — 목록은 `guide/reference/formats.md`와 같다. 분량을 늘리지 않는다. */
      body: "Connect a GitHub repository with JSON, YAML, JS/TS or Chrome extension translation files, invite your team, and send the first pull request.",
    },
    /**
     * 목업의 **가상 데이터** — 앱 라벨은 여기 없다. 라벨은 실제 사전 키를 읽는다(목업과 앱이 다른 말을 하면 랜딩이 거짓이다).
     *
     * ⚠️ **작게 유지한다.** 실명·실제 프로젝트명 금지. ⚠️ 타이핑되는 값은 `fr`이다(DESIGN §6.615) — 한글이면 `no-korean-ui`가,
     * 일본어면 폰트(가나 없음)가 걸린다. NFC이고 결합 문자가 없다(`typedPrefix`가 코드포인트로 자른다).
     */
    mockup: {
      project: "Acme web",
      repo: "acme/web",
      source: "web",
      namespace: "checkout",
      /** 셸의 사용자 구역 머리 · Publish diff의 저자 — 보는 사람이다. `teammate`는 다른 편집자다. */
      user: "Alex",
      teammate: "Sam",
      /** 사이드바 배지 — `Projects`는 멤버십 수, 프로젝트 항목은 소스·멤버·키 수(키는 `keyCount`). */
      projectCount: 3,
      memberCount: 4,
      /**
       * 소스 트리 — 첫째가 보고 있는 소스(`source`)라 펼쳐져 있고 나머지는 접힌다(실제 `TreePanel`). 네임스페이스 합이 소스의 키 수다.
       * 프로젝트 키 수(`keyCount`)는 소스 키 수의 합이다.
       */
      sources: [
        {
          slug: "web",
          keyCount: 248,
          namespaces: [
            { name: "cart", keyCount: 36 },
            { name: "checkout", keyCount: 52 },
            { name: "common", keyCount: 104 },
            { name: "product", keyCount: 56 },
          ],
        },
        { slug: "emails", keyCount: 40, namespaces: [] },
      ],
      /**
       * 선택된 키 — 씬 ②에서 `fr` 값이 비어 있다가 채워진다. ⚠️ **원문 포함 값은 둘까지다** — 1440×810 안의 로케일 목록이
       * 행 셋만 담는다(넷이면 `fr` 칸이 푸터 밑으로 들어간다, #112).
       */
      selected: {
        key: "checkout.submit",
        text: "Place order",
        description: "Primary button on the payment step",
        values: [
          { code: "en", value: "Place order" },
          { code: "de", value: "Bestellung aufgeben" },
        ],
        typedCode: "fr",
        typed: "Passer la commande",
      },
      /**
       * 키 목록 — `missing`은 빠진 언어 수, 0이면 Complete. ⚠️ **미완이 먼저다** — 실제 목록이 `Incomplete first`로 정렬한다
       * (`lib/keys/translation-list.ts`의 `rank`). 선택된 키가 첫 행이다.
       */
      rows: [
        { key: "checkout.submit", text: "Place order", missing: 1 },
        { key: "checkout.coupon", text: "Add a coupon", missing: 2 },
        { key: "checkout.shipping", text: "Shipping address", missing: 1 },
        { key: "cart.title", text: "Your cart", missing: 0 },
        { key: "cart.empty", text: "Your cart is empty", missing: 0 },
        { key: "cart.remove", text: "Remove", missing: 0 },
        { key: "checkout.title", text: "Checkout", missing: 0 },
        { key: "checkout.total", text: "Order total", missing: 0 },
      ],
      keyCount: 288,
      /** Publish 배지 — 씬 ③의 저장 전 → 후. */
      unsentBefore: 1,
      unsentAfter: 2,
      /** 언어 → 파일 경로. diff가 파일 이름을 따로 들지 않는다 — 언어와 파일이 어긋날 자리를 없앤다. */
      file: (code: string): string => `messages/${code}.json`,
      /**
       * 씬 ④의 diff — 파일당 한 줄. `before`가 null이면 새로 채운 값이다.
       * ⚠️ **언어는 편집기에 있는 것만**(원문 `en` 밖의 `selected.values` + `fr`) — 편집기에 없는 언어를 보내면 두 씬이 다른
       * 프로젝트를 말한다(#114). 선택 키의 편집은 ②③이 만든 `fr` 하나다.
       */
      diff: [
        { key: "cart.empty", code: "de", before: "Ihr Warenkorb ist leer", after: "Dein Warenkorb ist leer" },
        { key: "checkout.submit", code: "fr", before: null, after: "Passer la commande" },
      ],
      pullRequest: 128,
    },
  },

  /**
   * Home(`/projects/:slug`) — 프로젝트 진입의 착지점 (6b-6).
   *
   * ⚠️ **다른 화면의 지표 문구를 복제하지 않는다** (PRODUCT §7.7 결정 2). 키 수·미배포 건수는 번역
   * 화면 툴바(`m.translations`)의 것이고, 적재 상태는 설정(`m.settings.status`)의 것이다.
   */
  /**
   * 공개 문서 둘 — 공통 푸터(`PublicFooter`)가 가리킨다 (8-1a).
   *
   * 둘 다 공개 셸 **안**이라 헤더가 나가는 길을 든다(DESIGN §6.616 · §6.61) — 복귀 링크가 없다.
   * `/privacy`는 본문이 여기 있고, `/docs`는 본문이 `guide/**.md`이고 셸 라벨만 여기 있다.
   */
  publicDocs: {
    /** 시행일 줄의 라벨 — 날짜 자체는 각 문서가 든다. `/privacy`만 쓴다 (DESIGN §6.616). */
    effectiveDate: "Effective date",
    /**
     * ⚠️ **`sections`의 `id`는 URL 조각이다** — 목차가 `#id`로 절을 가리키므로 제목 문구를 고칠 때 **`id`는 따라 고치지 않는다.**
     * 블록은 문단(`p`)·목록(`ul`)·표(`table`) 셋이고(`lib/privacy/doc-text.ts`의 `DocBlock`), 클래스는 그릇이 든다 —
     * `components/privacy/privacy-doc.tsx`, 표는 `components/public-doc-table.tsx`.
     */
    privacy: {
      title: "Privacy Policy",
      /**
       * ⚠️ **본문을 고치면 `effectiveDate`를 같이 옮긴다** — `lib/privacy/__tests__/policy-gate.test.tsx`가
       * 본문 해시를 개정 이력(`REVISIONS`)과 대조해 red를 낸다. 새 행에 날짜를 쓰고, `changes` 절에도 적는다.
       * ⚠️ **절 `id`는 URL 조각이다** — 제목 문구를 고쳐도 `id`는 따라 고치지 않는다.
       * ⚠️ **여기서 이름을 대는 저장 항목은 `lib/privacy/collected.ts`의 등재와 절 id로 묶인다** —
       * 표는 필드 여럿을 한 행으로 접으므로 대조 단위가 라벨이 아니라 절이다.
       */
      effectiveDate: "2026-09-29",
      /**
       * 목차 이름 — ⚠️ **`sections` 밖에 둔다**: `policy-gate.test.tsx`가 `sections`를 해시하므로 안에 넣으면 개정 이력이 요구된다.
       */
      toc: "On this page",
      /**
       * 목차 전용 짧은 라벨 — 없으면 절 `heading`을 쓴다(시안 Prototype `isPrivacy`, malmoi#117 — 200px 칸에서 두 줄로 접히던 항목).
       * ⚠️ **`sections` 밖에 둔다** — 안에 넣으면 방침 본문 해시가 바뀌어 개정 이력이 요구된다. 키는 절 `id`다.
       */
      tocLabels: { deletion: "Deleting your data" },
      intro:
        "Malmoi is a localization tool: developers push the strings in their code to Malmoi, their teammates translate them here, and Malmoi opens a pull request back to the repository. This policy covers what Malmoi stores about the people who sign in, how it counts visits to its public pages, why, and how to have your data removed.",
      sections: [
        {
          id: "collected",
          heading: "What we collect",
          blocks: [
            {
              p: "Malmoi collects what it needs to sign you in, to decide what you can open, and to show your teammates who changed a translation. Separately, it counts visits to its public pages — the home page, sign-in, the docs and this policy — without cookies. Pages inside the app are not counted, and there is no advertising or cross-site tracking.",
            },
            {
              table: {
                label: "What Malmoi stores about you",
                head: ["What", "Where it comes from", "Why"],
                rows: [
                  [
                    "Your name, email address and profile picture",
                    "GitHub or Google, when you sign in",
                    "Identifying you to your teammates",
                  ],
                  [
                    "A keyed index of your email address",
                    "Derived from the address",
                    "Matching an invitation to the account that accepts it, without comparing addresses in the clear",
                  ],
                  [
                    "Which GitHub or Google account you signed in with, as the account id at that provider",
                    "GitHub or Google, when you sign in",
                    "Recognizing you the next time. Malmoi keeps no sign-in tokens — the id is all it stores",
                  ],
                  [
                    "A GitHub token for your own account, and when it expires",
                    "GitHub, when you connect a repository to a project",
                    "Reading which GitHub App installations you can choose a repository from. It is never used to write to a repository",
                  ],
                  [
                    "Sign-in state: your session, and short-lived challenges for linking an account or signing other sessions out",
                    "Created by Malmoi",
                    "Keeping you signed in, and proving that a reply from GitHub or Google belongs to a round trip you started",
                  ],
                  [
                    "Your project membership and any invitation sent to your address",
                    "The person who invites you",
                    "Deciding which projects you can open and what you can do in them, and emailing you the invitation link",
                  ],
                  [
                    "Who last changed a translation, and who asked for a sync",
                    "Your own edits",
                    "Showing your teammates who changed what",
                  ],
                  [
                    "A personal token for AI agents: a one-way hash of it (never the token itself), the actions and projects you allowed it, and when it was created, last used and expires",
                    "Created by Malmoi when you create or rotate a token on the MCP connector page",
                    "Letting an AI agent you run act for you, within what your project role already allows",
                  ],
                  [
                    "An app you connect by signing in through your browser, such as Claude Code or Codex: the name and address it gives for itself, where it returns after you sign in, one-way hashes of the tokens Malmoi issued to it and of the refresh tokens it has already used (never the tokens themselves), the actions and projects you allowed it, and when it was connected, last used and expires",
                    "Created by Malmoi when you authorize the app on its connection screen",
                    "Letting an app you connect act for you, within what your project role already allows",
                  ],
                ],
              },
            },
            {
              p: "Names, email addresses and connection tokens are stored encrypted, and the keys are held outside the database. A profile picture you upload is re-encoded before it is stored, which drops the original file and the metadata in it; a picture that comes from GitHub or Google stays on their servers.",
            },
            {
              p: "Visits to the public pages are counted by Vercel Web Analytics. For each page view it records the time, the page address with any query and fragment removed, the page you came from, your approximate location (country, region and city), and your device type, operating system and browser with their versions. It sets no cookies and stores nothing in your browser. Instead of an identifier, Vercel uses a hash created from the request, and that visitor session is discarded after 24 hours; the records are not tied to a person or an IP address. Malmoi sees only totals.",
            },
          ],
        },
        {
          id: "purposes",
          heading: "Why we use it",
          blocks: [
            {
              ul: [
                "Signing you in and keeping you signed in.",
                "Deciding which projects you can open and what you can do in them.",
                "Showing your teammates who changed a translation and who asked for a sync.",
                "Writing translations back to the repository a project is connected to, as a pull request.",
                "Emailing an invitation link to an address a project owner enters. The email holds the link and the project it is for — the project's name, its picture if it has one, and the role you are invited with. It does not say who invited you, and it has no tracking.",
                "Keeping the service running, which includes looking at error logs when something fails.",
                "Counting visits to the public pages, to see whether people find Malmoi and which docs they read. Only totals are looked at.",
                "Letting an AI agent you connect — with your own token, or by signing in through your browser — do what you could do in the app. What it changes is recorded as your change.",
              ],
            },
            {
              p: "Malmoi does not sell your data, does not share it for advertising, and does not use it to train anything. The repository coordinates a project is connected to are about the repository, not about you, and this policy does not treat them as personal data.",
            },
          ],
        },
        {
          id: "retention",
          heading: "How long we keep it",
          blocks: [
            {
              p: "How long something works and how long its row is kept are different, so this section says both.",
            },
            {
              ul: [
                "Your account and its connections: kept until you ask us to delete them.",
                "A session stops working 24 hours after your last activity. Its row goes away when you sign out, or when that expired session is next presented.",
                "A challenge for linking an account or signing other sessions out stops working after 5 to 10 minutes. Its row goes away the next time you start the same step.",
                "An invitation stops working after 7 days, or as soon as it is accepted, revoked or sent again. The row is kept after that, including the address it was sent to, as the record that the invitation happened — ask us and we will delete it.",
                "An invitation email: Resend, which sends it, keeps a record of the message — the address, the subject and the email itself, with the link, the project's name, the address of its picture if it has one, and your role — for 30 days.",
                "Translations and the record of who changed them: kept for the life of the project.",
                "An AI agent token stops working when it expires (30, 90 or 365 days after you create it) or as soon as you rotate or revoke it. Its row is deleted when you rotate or revoke it, or with your account; until then an expired token stays listed so you can see what it allowed.",
                "An app connection stops working when it expires (30, 90 or 365 days after you authorize it) or as soon as you disconnect it or authorize the same app again. Its row, with the hashes of the refresh tokens it used, is deleted then, or with your account; an expired connection stays listed until it is deleted. The hand-off from the connection screen to the app lasts one minute and is deleted when the app uses it.",
              ],
            },
          ],
        },
        {
          id: "third-parties",
          heading: "Who else sees it",
          blocks: [
            { p: "Malmoi sends your data to five services and to no one else." },
            {
              ul: [
                "GitHub — signing you in, and reading and writing the repository a project is connected to. Translations are committed and opened as a pull request by Malmoi's GitHub App, not under your own account.",
                "Google — signing you in, if you choose Google.",
                "Supabase — the database, hosted in Tokyo.",
                "Vercel — hosting for the app, storage for uploaded profile pictures and project pictures, and counting visits to the public pages (Web Analytics, described under What we collect). Vercel records requests to the service, including IP addresses, as part of running it.",
                "Resend — sending invitation emails, from Tokyo. It receives the invited address and the message: the invitation link, the project's name, the address of its picture if it has one, and the role you are invited with. Open and click tracking are off.",
              ],
            },
            {
              p: "A profile picture that comes from GitHub or Google is loaded by your browser directly from their servers, so those requests reach them even though Malmoi sends them nothing.",
            },
            {
              p: "If you connect an AI agent with your token or by signing in through your browser, what the agent reads through it — the translations, activity and members of your projects, and a project's push token when you ask for one — goes to that agent and to whichever AI service it uses. You choose and run that agent; Malmoi does not send it anything on its own and has no agreement with it. To show an app's name on the connection screen, Malmoi reads the app's public description from the address the app gives; that request carries nothing about you.",
            },
            {
              p: "An invitation email shows a logo and the project's picture (or a placeholder icon when it has none), and your email app loads all of them from mal-moi.com — Malmoi fetches the picture from its own storage, so your email app reaches no one else. The logo and the icon are the same for everyone, and a project's picture is the same for everyone invited to that project, so none of them tells Malmoi who opened the email.",
            },
          ],
        },
        {
          id: "deletion",
          heading: "Deleting your data, and how to reach us",
          blocks: [
            {
              p: (
                <>
                  Write to <a href="mailto:ox501501@gmail.com">ox501501@gmail.com</a> to ask what Malmoi holds about
                  you, to correct it, or to have it deleted. We answer within 30 days. Malmoi has no self-service
                  delete screen, so the request goes through that address.
                </>
              ),
            },
            {
              p: "Deleting your data removes your account, your GitHub and Google connections, your sessions, your AI agent token and app connections, your project memberships, any invitation addressed to you that has not been accepted, and a profile picture you uploaded. Resend's record of an invitation email is not removed early; it expires on its own 30 days after the email was sent.",
            },
            {
              p: "Translations stay. They are the project's output and are already in the repository, so removing them would delete work that belongs to the team — but the record of who wrote them stops pointing at you.",
            },
          ],
        },
        {
          id: "cookies",
          heading: "Cookies",
          blocks: [
            {
              p: "Every cookie Malmoi sets is needed to sign you in or to finish a round trip to GitHub or Google. There are no analytics, advertising or tracking cookies, so there is nothing here to consent to or turn off. All of them are http-only, which means scripts cannot read them.",
            },
            {
              table: {
                label: "Cookies Malmoi sets",
                head: ["Cookie", "How long it lasts", "What it does"],
                rows: [
                  ["Session", "24 hours from your last activity", "Keeps you signed in"],
                  [
                    "Sign-in request check",
                    "Until you close the browser",
                    "Checks that a sign-in was started from this site",
                  ],
                  ["Return address", "Until you close the browser", "Sends you back to the page you started from"],
                  [
                    "Sign-in state",
                    "15 minutes",
                    "Proves that the reply from GitHub or Google belongs to the sign-in you started",
                  ],
                  ["Repository connection state", "10 minutes", "The same, for connecting a repository"],
                  [
                    "Account link and sign-out challenges",
                    "5 to 15 minutes",
                    "The same, for adding a second sign-in method to one address and for signing other sessions out",
                  ],
                ],
              },
            },
          ],
        },
        {
          id: "changes",
          heading: "Changes to this policy",
          blocks: [
            {
              p: "The effective date at the top belongs to the text below it: whenever this policy changes, that date moves and the change is listed here.",
            },
            { ul: ["2026-09-29 — you can also connect an app such as Claude Code or Codex by signing in through your browser, with no token to copy. Malmoi keeps the connection — the app's name and address, the actions and projects you allowed, when it was used — and only hashes of the tokens it issued; you can disconnect it on the MCP connector page.", "2026-09-29 — you can create a personal token for AI agents on the MCP connector page. Malmoi stores only a hash of it, with the actions and projects you allowed and when it was used.", "2026-09-28 — invitation emails show the name and picture of the project you are invited to, and your role in it. They still do not say who invited you.", "2026-09-27 — visits to the public pages are counted with Vercel Web Analytics, without cookies.", "2026-09-26 — the product name is written Malmoi. No change to what we collect or share.", "2026-09-24 — invitations can be sent by email through Resend.", "2026-09-19 — first version."] },
          ],
        },
      ],
    },
    /**
     * ⚠️ **`title`의 소비자가 둘이다** — 이 화면의 제목과 **사이드바 하단 항목**
     * (`lib/shell/nav.ts`). 2026-09-11까지 후자가 `nav.help: "Help"`로 갈려 있었는데,
     * 같은 라우트를 가리키는 라벨이 둘이면 하나가 낡는다.
     */
    docs: {
      title: "Docs",
      /**
       * `/docs/*`의 셸 라벨 (DESIGN §6.61). ⚠️ **본문은 여기 없다** — `guide/**.md`가 정본이고, 개요의 대상 라벨·
       * `More in the docs`만 사전이 든다(어느 장을 앞에 세우는지는 `lib/guide/overview.ts`의 상수다).
       */
      nav: "Docs",
      toc: "On this page",
      /** 이전/다음 카드 묶음의 `nav` 이름 — 목차·문서 내비와 랜드마크가 갈려야 한다. */
      pages: "Previous and next pages",
      previous: "Previous",
      next: "Next",
      /** 파일명 바가 없는 코드 블록의 region 이름 — 이름이 있으면 파일명이 대신한다. */
      code: "Code",
      forDevelopers: "For developers",
      forTranslators: "For translators",
      more: "More in the docs",
      notFound: {
        eyebrow: "404",
        title: "This page doesn't exist",
        /** 한 문단이다(시안 1d, #119) — 주소와 개요 링크가 같은 문장에 선다. */
        body: (path: ReactNode, overview: ReactNode): ReactNode => <>There&apos;s no page at {path}. Pick a page from the list, or start from the {overview}.</>,
        overview: "docs overview",
      },
    },
  },

  /**
   * `/changelog` (spec 결정). ⚠️ **`title`이 다섯 자리의 라벨 키다** — 사이드바 하단 · 사용자 메뉴 · 공개 헤더 · 공개 푸터 ·
   * 페이지 `h1`이 이 값 하나를 읽는다(라벨이 그 화면의 제목과 같은 키, DESIGN).
   *
   * ⚠️ **릴리스 본문은 여기 없다** — GitHub Release 원문이 정본이고 사전을 지나지 않는 유일한 공개 텍스트다. 그 원문의 계약은
   * `.claude/commands/merge.md` 5단계 ② 양식이다. 안내 문장 넷은 모두 `releases`(GitHub Releases 외부 링크)를 받는다.
   */
  changelog: {
    title: "Changelog",
    /** 검색·링크 미리보기 설명 — 소개 문장의 첫 문장과 같은 말이다. */
    description: "What changed in each release of Malmoi, newest first.",
    releases: "GitHub Releases",
    intro: (releases: ReactNode): ReactNode => (
      <>What changed in each release of Malmoi, newest first. Dates are in UTC. The same notes are published on {releases}.</>
    ),
    /** 시안 1c의 "Read them"은 단수 changelog를 받지 못해 고쳤다. 재시도 버튼은 없다 — 성공만 캐시되니 새로고침이 곧 재시도다. */
    failed: (releases: ReactNode): ReactNode => <>The changelog couldn&apos;t be loaded from GitHub just now. Read it on {releases}.</>,
    empty: (releases: ReactNode): ReactNode => <>No releases have been published yet. New versions appear here and on {releases}.</>,
    /** GitHub 한 요청 상한(100건)에 닿았을 때 목록 끝 — 페이지네이션은 없다. */
    truncated: (releases: ReactNode): ReactNode => <>Older releases are on {releases}.</>,
  },

  /**
   * 프로젝트 Home — **카드 넷 · 할 일 · 로그 · 메타 열** (DESIGN §6.64).
   *
   * ⚠️ **화면에 `pull`·`push` 낱말이 0이다** (DESIGN §10). 표시는 `Sync`(리포 → 앱)와
   * `Publish`(앱 → 리포) 둘뿐이고 **코드 식별자는 그대로다** — 읽는 사람이 비개발자라 저장소
   * 방향을 말하는 낱말이 둘이면 어느 쪽이 자기 일인지 매번 다시 판단해야 한다.
   *
   * ⚠️ **카드 제목은 여기 없다** — `m.projects.summary.*` 넷을 목록 화면과 **같은 키로** 쓴다.
   * 두 벌이 되면 하나가 낡는다 (DESIGN §6.64).
   */
  home: {
    /** ⚠️ **골격은 `aria-hidden`이라 이 한 줄이 유일한 안내다** — 없으면 로딩이 무음이다. */
    loading: "Loading project…",
    /**
     * 보조 줄 — `{unit} · {근거}` 두 토막이다 (DESIGN §6.64). ⚠️ **첫 칸만 `keys`다**: 새 키의 빈 칸은
     * `New`에도 `To translate`에도 세므로 넷이 같은 모집단이 아니고, 그 사실을 말하는 자리가 여기다.
     */
    cards: {
      unit: { keys: "keys", cells: "cells" },
      /** ⚠️ 상대 시각은 서버가 `relativeTime`으로 만들어 넘긴다 — 사전은 문장만 든다. */
      synced: (when: string | null): string => (when === null ? "not synced yet" : `synced ${when}`),
      acrossSurfaces: (n: number): string => (n === 1 ? "in this repository" : `across ${n} sources`),
      /** `5 en, 3 ja` — 많은 쪽이 앞이다. 폭에 따라 뒤부터 잘리므로 큰 수가 남아야 한다. */
      reviewByLocale: (parts: string): string => parts,
      // ⚠️ 같은 카드의 수치가 `1,207`인데 이 줄만 `1207 en`이면 같은 수인지부터 다시 읽어야 한다.
      localeCount: (code: string, n: number): string => `${n.toLocaleString("en-US")} ${code}`,
      allFilled: (n: number): string => `${n.toLocaleString("en-US")} keys all filled`,
      /** 보낼 칸(To send) 전용 — 검토 0은 `nothingToReview`다(같은 값이면 To review 칸이 거짓이 된다). */
      nothingPending: "nothing to send",
      nothingToReview: "nothing to review",
      /**
       * `2b` — 값은 마지막 **성공**의 것이다. 실패했다고 수가 사라지면 "번역이 날아갔다"로 읽힌다.
       * ⚠️ 정상 줄(`synced`)과 같은 낱말이다(2026-09-30 사용자 — `last good sync`가 혼자 길어 카드가 한 줄 높았다). 과거형 `synced`가 성공을
       * 말하고, 실패는 주의 카드가 든다. `last sync`로 줄이지 않는다 — 그러면 방금 실패한 시도를 가리킨다.
       */
      lastGoodSync: (when: string | null): string => (when === null ? "not synced yet" : `synced ${when}`),
      asOf: (when: string | null): string => (when === null ? "not synced yet" : `as of ${when}`),
      asOfLastSync: "as of the last sync",
      /**
       * 연결 문제 셋(미연결·끊김·다른 리포) 동안 — "paused"는 표에 없는 상태어라 쓰지 않는다(DESIGN §2.4). 푸는 방법이 셋 다 달라
       * (Connect · Reconnect · 새 프로젝트) 조건을 말하지 않는다 — 방법은 같은 화면의 배너가 든다.
       */
      cannotSend: "can't be sent right now",
      /** 보낼 편집이 있는 동안 CI 적재가 보류된다 — OWNER가 그 사실을 아는 화면 자리다 (sync-edit-protection T13). */
      repositoryUpdatesHeld: "repository updates held",
      frozen: "frozen at archive",
      neverSent: "never sent",
    },

    attention: {
      title: "Needs your attention",
      /** 머리 개수 배지의 sr 문장 — 숫자는 `aria-hidden`이다(`CountBadge`). */
      count: (n: number): string => `${n.toLocaleString("en-US")} ${n === 1 ? "item" : "items"}`,
      /** `<summary>`의 라벨. **접힌 수만 말한다** — 전체 수는 머리의 pill이 든다. */
      more: (n: number): string => `+${n} more`,
      /**
       * ⚠️ **로케일을 모른다** — `lastImportError`가 표면 단위 컬럼이라 캔버스의 `{surface} · {locale}
       * file`에서 문장을 **표면까지로 낮췄다** (DESIGN §6.64).
       */
      importFailed: {
        title: (surface: string): string => `${surface} source`,
        body: "The last sync couldn't read this source",
        tail: " — nothing from it was synced.",
      },
      /**
       * 일부만 반영된 표면(`partial-import`) — **실패로 말하지 않는다**(DESIGN §2.4 — 데이터는 들어갔다). `importFailed`와 같은 자리의
       * 형제라 호출부가 `importFailureTone`으로 가른다.
       */
      partial: {
        body: "This source was partially synced",
        tail: " — some translation files were left out.",
      },
      review: {
        title: (surface: string, locale: string): string => `${surface} · ${locale}`,
        body: (n: number): string => `${n.toLocaleString("en-US")} ${n === 1 ? "cell is" : "cells are"} waiting for review`,
        /**
         * ⚠️ **`in this locale`이 술어에 맞춘 말이다** (2026-09-15 리뷰 🟡9). 저자는 **그 로케일에서
         * 마지막으로 사람이 만진 셀**의 것이고, 그 셀은 검토 대기 칸이 아닐 공산이 크다 —
         * `needsReview`는 push가 세우고 같은 쓰기가 `updatedBy`를 비운다(불변식 2). 그냥
         * `last edited by Kim`이면 "Kim이 그 8칸을 만졌다"로 읽히는데 그것은 거짓이다.
         *
         * ⚠️ **이름을 못 찾으면 이 절이 통째로 빠진다** (DESIGN §6.64) — 호출부가 `null`로 갈린다.
         */
        tail: (who: string): string => ` — last edited in this language by ${who}.`,
      },
      /**
       * ⚠️ **이력을 말하지 않는다** (malmoi#134) — 술어는 "지금 값이 있는 셀이 없다"이고 채웠다가 비운 로케일도 여기 선다.
       * `never`·`yet`은 그 술어가 모르는 과거를 단언한다. 키 이름(`neverFilled`)은 식별자라 그대로 둔다.
       */
      neverFilled: {
        title: (surface: string, locale: string): string => `${surface} · ${locale}`,
        body: (locale: string): string => `${locale} has no translations here`,
        tail: (n: number): string => ` — ${n.toLocaleString("en-US")} ${n === 1 ? "key" : "keys"} to translate.`,
      },
      empty: {
        title: "Nothing needs you",
        description: "Items appear here when a sync fails, cells wait for review, or a language falls behind.",
      },
      /** `2d` — 문장이 "할 수 없다"로 갈린다. 복원하면 돌아온다는 사실이 출구다. */
      archived: {
        title: "Nothing to act on",
        description:
          "Attention items come back when the project is restored. The numbers above are frozen at the moment it was archived.",
      },
    },

    logs: {
      title: "Recent logs",
      all: "All logs",
      empty: {
        /** 첫 Sync 전에는 갈래가 다르다 — 비어 있는 것이 아니라 아직 시작 전이다. */
        beforeFirstSync: "Nothing yet. The first sync from your repository shows up here.",
      },
    },

    meta: {
      title: "Project",
      repository: "Repository",
      branch: "Base branch",
      surfaces: "Sources",
      locales: "Languages",
      keys: "Keys",
      members: "Members",
      lastSync: "Last sync",
      lastPublish: "Last publish",
      created: "Created",
      archived: "Archived",
      settings: "Settings",
      notConnected: "Not connected",
      /** `2b`의 둘째 값 — `1d ago · failed 10m ago`. */
      failedAt: (when: string): string => `failed ${when}`,
      /** 최근 적재 사건이 열린 Malmoi PR로 보류됐다 (nightly-sync 14a) — 푸는 조건(머지)을 말한다. */
      heldByOpenPr: "held until the pull request is merged or closed",
      /** 시각이 없는 칸(마지막 Publish · 주의 항목 시각). ⚠️ Sync 행은 아래 `notSyncedYet`이다 — 이 값을 Publish 행이 같이 읽는다. */
      never: "Never",
      /** 첫 동기화 전의 Last sync 행 전용 — 같은 Home 카드 보조줄과 같은 낱말이다(1-Y17). */
      notSyncedYet: "Not synced yet",
      /** 캔버스는 `Pull request #127 · 2d ago` — **무엇을 보냈나**가 먼저고 시각이 뒤다. */
      pullRequest: "Pull request",
      /** PR 번호는 링크의 이름이다 — 주소를 그대로 읽히지 않는다. */
      pr: (n: number): string => `#${n}`,
    },

    banner: {
      syncFailed: {
        title: "The last sync couldn't finish",
        /**
         * ⚠️ **원인 문장은 `importFailureMessage`가 든다** (PRODUCT §7.8) — 그 함수가 `Object.hasOwn`과
         * 폴백을 이미 가지고 있다. 여기서 사전을 직접 인덱싱하면 그 방어선을 우회한다.
         */
        body: (surface: string, branch: string, reason: string): string =>
          `Malmoi couldn't read ${surface} on ${branch}. ${reason}`,
        /** 값이 사라진 것이 아니라는 사실이 이 배너의 절반이다. */
        safe: (when: string | null): string =>
          when === null
            ? "Nothing was lost — the cells you see are from before this sync."
            : `Nothing was lost — the cells you see are from the last successful sync, ${when}.`,
        action: "Try again",
        /** ⚠️ **EDITOR는 본문만 본다** — 같은 Action이라 버튼이 통째로 없다 (DESIGN §6.64). */
        editor: "Ask a project owner to run the sync again.",
      },
      /**
       * 일부만 반영된 적재(`partial-import`, warning) — `syncFailed`의 형제다. ⚠️ **실패 문장을 빌리지 않는다**(DESIGN §2.4 — 데이터는
       * 들어갔다). `safe`("마지막 성공의 값이다")도 없다 — 이 적재가 값 일부를 이미 바꿨다.
       */
      partial: {
        title: "Partially synced",
        body: (surface: string, branch: string, reason: string): string => `${surface} on ${branch} was partially synced. ${reason}`,
      },
      /** 연결 문제 셋 — 미연결(회색) · 끊김(호박) · 다른 리포(빨강). `connectionProblem`이 가른다(2026-09-30 상태 통일). */
      notConnected: {
        title: "Malmoi isn't connected to this repository",
        body: "Connect the GitHub App to this repository to sync and publish. Everything already translated is safe.",
        action: "Connect",
        editor: "Ask a project owner to connect it.",
      },
      disconnected: {
        title: "This repository is disconnected",
        /**
         * ⚠️ **끊김은 셋이다**(App 제거 · 설치 교체 · `unpinned` — DESIGN §2.4 D1) — "설치가 사라졌다"는 `unpinned`에서 거짓이다. 결과 문장은
         * "stop"이고 "held"(보류 전용)를 쓰지 않는다.
         */
        body: "Malmoi lost its connection to this repository. Syncs and publishes stop until it's reconnected — everything already translated is safe.",
        action: "Reconnect",
        editor: "Ask a project owner to reconnect it.",
      },
      wrongRepository: {
        title: "This connection points to a different repository",
        body: "This address now holds a different repository than the one this project was connected to. Check it on GitHub — if the repository really was replaced, create a new project for it.",
      },
      archived: {
        title: "This project is archived",
        /**
         * ⚠️ **캔버스의 `CI pushes are rejected`를 바꿨다** — 이 화면에 `push` 낱말이 0이라는 것이
         * 완료 조건이고(DESIGN §10), `home-vocabulary.test.ts`가 그것을 센다. 뜻은 같다: 거절되는
         * 것은 리포에서 들어오는 Sync다.
         *
         * ⚠️ **열린 PR을 단언하지 않는다** — 전에는 꼬리가 `The open pull request was left alone.`이었고
         * **열린 PR 없이 보관한 프로젝트에서 거짓**이었다. Home은 그 사실을 모른다(알려면 GitHub 왕복이고
         * `checkOpenPullRequest`는 owner 전용이다). 그 문장의 자리는 보관을 **누르기 직전**의 확인
         * Dialog이고, `ArchiveCard`가 거기서 `openPrUrl`을 셋(모름·있음·없음)으로 가른다.
         * POSTMORTEM 2026-09-03("조회 실패를 부재로 접지 않는다")과 같은 축이다 — 모르는 것을 안다고
         * 말하지 않는다.
         */
        body: "Editing and publishing are off, and syncs from your repository are refused. Restore it to work on it again.",
        editor: "Ask a project owner to restore it.",
      },
    },
  },

  /**
   * sync 이력 (7단계 — DESIGN §6.68). **과거 시제다** — Publish Alert가 "지금 무슨 일이
   * 일어났나"를 현재 시제로 말하고, 이 화면은 "그때 무슨 일이 있었나"라 어휘가 갈려야 한다.
   */
  /**
   * 활동 이력 (logs-rework — 시안 `design_handoff_project_logs`). **Logs가 프로젝트 전체 활동**이고
   * Home의 Recent logs가 같은 스트림의 최신 여섯이다.
   *
   * ⚠️ **사실을 왜곡하지 않는 낱말이 이 절의 요지다** (spec §6): `Sent`는 PR 생성/갱신이지 머지가
   * 아니고 · `Nothing to send`는 성공 전송이 아니며 · `Deferred`는 삭제도 성공도 아니고 ·
   * `Failed`는 GitHub에 아무것도 안 갔다는 보장이 아니다.
   */
  logs: {
    /** 종류 일곱 — URL 값(`?kind=`)과 메뉴 라벨이 같은 축이다. */
    kinds: {
      all: "All activity",
      translations: "Translations",
      imports: "Syncs",
      publish: "Publish",
      sources: "Sources & languages",
      members: "Members",
      settings: "Settings",
    },
    /**
     * 필터 다섯의 기본 라벨과 메뉴 안 낱말.
     *
     * ⚠️ **`axis`는 접근 이름에 붙는다** ("Source: web, emails") — 트리거 라벨만으로는 스크린리더가
     * 무엇을 고른 것인지 모른다.
     */
    filters: {
      anyDate: "Any date",
      anyone: "Anyone",
      anySource: "Any source",
      anyResult: "Any result",
      clear: "Clear filters",
      people: "People",
      automation: "Automation",
      /** 소스가 없는 사건(멤버 · 설정)을 고르는 항목 — 그 사건에 가짜 소스 값을 넣지 않기 때문이다. */
      projectWide: "Project-wide",
      clearSources: "Clear sources",
      /** 결과 축이 실행에만 적용된다는 사실을 **고르기 전에** 말한다. */
      resultScope: "Applies to syncs and publishes. Other events have no result.",
      groupImports: "Syncs",
      groupPublish: "Publish",
      groupBoth: "Both",
      axis: {
        kind: "Kind",
        date: "Date",
        actor: "Actor",
        source: "Source",
        result: "Result",
      },
    },
    /** 기간 프리셋 넷 + 네이티브 `<input type="date">` 둘 (결정 9 — 라이브러리를 넣지 않는다). */
    range: {
      today: "Today",
      yesterday: "Yesterday",
      last7: "Last 7 days",
      last30: "Last 30 days",
      custom: "Custom range (UTC)",
      /** 메뉴 항목 — 눌러서 Dialog가 열린다는 것을 줄임표가 말한다 (audit #8 — 칸은 메뉴 밖에 산다). */
      customOpen: "Custom range (UTC)…",
      from: "From (UTC)",
      to: "To (UTC)",
      apply: "Apply range",
      /** Dialog 설명 — 한쪽을 비우면 열린 범위라는 것을 고르기 전에 말한다. */
      description: "Pick the first and last day to show. Leave one empty for an open-ended range.",
    },
    /** ⚠️ **`aria-label`에는 줄임표가 없다** — 스크린리더가 읽는 이름이라 장식이 붙으면 안 된다. */
    search: { label: "Search logs", placeholder: "Search logs…" },
    refresh: "Refresh",
    status: {
      succeeded: "Sent",
      /** ⚠️ **"branch equals base"가 아니다** — 읽는 사람은 번역 편집자다. */
      skipped: "Nothing to send",
      /** 보류만 남은 Publish (delivery-invariants D7) — 편집은 있었고 못 실었다. 결과 모달과 같은 낱말이다. ⚠️ 미전달 편집의 `Unsent`와 다른 말이다(2026-09-30 상태 통일). */
      notSent: "Held back",
      failed: "Failed",
      /**
       * ⚠️ 줄임표는 진행 중에만이다 (DESIGN §10). **진행 중은 종류가 낱말을 정한다** (ux-drift-unify 1-Y2) — Sources·Home과 같은
       * `Syncing…`, Publish는 `Publishing…`. "Running…"을 쓰지 않는다.
       */
      syncing: "Syncing…",
      publishing: "Publishing…",
      /**
       * ⚠️ **Logs 필터의 결과 옵션 전용이다** — 종류를 모르는 자리라 행 결과 배지의 `syncing`·`publishing`을 쓸 수 없다.
       * 행·상세 배지는 이 낱말을 쓰지 않는다(`resultLabel`). 종류 중립 낱말이고 줄임표가 없다 — 진행 표시가 아니라 고르는 조건이다.
       */
      inProgress: "In progress",
      /**
       * 적재 실행의 결과 다섯 (spec §6). **색은 셋뿐이라 낱말이 뜻을 든다.**
       *
       * ⚠️ **왜곡 금지**: `Deferred`는 삭제도 성공도 아니고(미전달 편집이 있어 적재를 통째로
       * 보류했다), `Superseded`는 **확인된 사유만** 말한다 — 대체한 실행이 무엇인지 우리는 모른다.
       */
      imported: "Synced",
      deferred: "Held",
      partial: "Partially synced",
      superseded: "Superseded",
      /** 사람이 고쳐야 풀리는 거부 여섯 (spec §6.1). 다시 눌러 사라지는 거부는 이력에 안 남는다. */
      notStarted: "Not started",
      /** 편집 없는 밤, 리포도 그대로였다 (nightly-sync). ⚠️ `skipped`("Nothing to send")와 다른 낱말이다 — 받을 것도 없었다. */
      upToDate: "Up to date",
    },
    /**
     * 날짜 카드 머리에 붙는 낱말 (캔버스 `1a`). **UTC 자정으로 끊는다** — 로컬로 끊으면 밤 사이 실행이
     * 보는 사람마다 다른 날에 선다. 머리의 날짜는 늘 `utcDay` 형이고, 이 낱말은 오늘·어제에만 덧붙는다.
     */
    day: {
      today: "Today",
      yesterday: "Yesterday",
    },
    /**
     * 값이 없는 칸. **실패의 변경 수는 0이 아니라 부재다** — 0으로 쓰면 "안 바뀌었다"는 거짓말이고,
     * 그건 관측이 있었다는 뜻이 된다.
     */
    none: "—",
    /** 버린 값이 있는 실행. **성공한 행에도 붙는다** — 조용히 숨기면 ARCHITECTURE §0 불변식 9 위반이다. */
    warnings: (count: number): string => (count === 1 ? "1 dropped" : `${count.toLocaleString("en-US")} dropped`),
    /** 보류 사유 — **삭제도 성공도 아니다**를 한 문장이 말한다. */
    deferredReason: (count: number): string =>
      `${count.toLocaleString("en-US")} unsent edit${count === 1 ? "" : "s"} held the sync. Nothing was synced.`,
    /**
     * 편집 수가 아닌 보류 사유 셋 (nightly-sync). ⚠️ `deferredReason(0)`으로 떨어지면 "0 unsent edits are being protected"라는
     * 거짓이 선다 — 이 셋은 편집이 없는데도 멈췄다. 푸는 사람(PR 리뷰어·다음 실행·개발자)까지 말한다.
     */
    deferReasons: {
      "open-pr": "A Malmoi pull request is still open. Nothing was synced — syncing resumes once it's merged or closed.",
      "pr-check-failed": "We couldn't check GitHub for an open Malmoi pull request, so nothing was synced. The next run checks again.",
      /**
       * ⚠️ 서버 적재 예산은 수동 Sync도 지난다 — [Sync]를 출구로 권하면 같은 이유로 또 실패한다. 출구는 둘이다: 파일을 줄인다
       * (`resource-limit` 문구와 같은 방향) · 예산 밖 경로인 리포 워크플로. 야간의 주 대상이 워크플로 없는 프로젝트라 앞엣것이 먼저다.
       */
      "too-large": "The repository change is too large for a server-side sync. Nothing was synced. Reduce the files' size, or deliver it with the repository workflow.",
    },
    empty: {
      title: "No activity yet",
      description: "Syncs, translation edits and publishes show up here as they happen.",
    },
    /** ⚠️ **빈 이력과 원인이 반대다** — 하나는 프로젝트가 비었고 하나는 내가 좁혔다. */
    noMatch: {
      title: "No events match these filters",
      description: "This project has activity — none of it is in this slice. Widen the date range or clear the filters.",
    },
    /** 수집 공백 경계선. ⚠️ **날짜를 서버가 주지 못하면 이 줄을 아예 그리지 않는다**(추정값 금지). */
    coverage: (date: string): string =>
      `Full activity history is available from ${date}. Earlier records include publish runs only.`,
    /**
     * ⚠️ **조회 실패는 all-or-nothing이다** (결정 16) — 목록·새로고침·다음 페이지·상세 중 하나라도
     * 실패하면 페이지 전체가 이 화면이 된다. **빈 상태로 접지 않는다** (POSTMORTEM 2026-09-03).
     */
    queryError: {
      title: "We couldn't load the activity",
      description: "Nothing is lost — this is a problem reading the history, not a project without activity.",
      retry: "Try again",
    },
    loading: { list: "Loading activity…" },
    older: "Older",
    page: {
      perPage: "20 events per page, newest first.",
      noOlder: "No older events match these filters.",
    },
    /** 행의 보조줄이 쓰는 낱말. **없는 값을 자리 채우려고 적지 않는다.** */
    meta: {
      /** 실행 주체 셋 (nightly-sync) — 사람 행의 보조줄과 Home 메타 열이 같은 낱말을 쓴다. 자동화 행은 행위자가 문장 머리에 서므로 보조줄에 안 싣는다. */
      manual: "manual",
      nightly: "nightly",
      ci: "CI",
      /** 적재가 실제로 값을 바꾼 번역 셀 수 — 관측값이고 판정에 쓰지 않는다. */
      values: (n: number): string => `${n.toLocaleString("en-US")} value${n === 1 ? "" : "s"} changed`,
      /** 보조줄 맨 앞의 종류 배지(2026-09-30 사용자 — 배지만 봐도 무슨 사건인지). 필터의 복수형(`kinds`)과 따로 둔다. */
      type: { TRANSLATION: "Translation", IMPORT: "Sync", PUBLISH: "Publish", SURFACE: "Source", MEMBER: "Member", SETTINGS: "Settings" },
      /** 실행 행은 종류와 주체가 한 배지다 — 같은 회색 배지 둘(`Sync` `manual`)이 붙으면 무엇이 무엇인지 안 갈렸다(2026-09-30 사용자). */
      runType: {
        IMPORT: { manual: "Manual sync", nightly: "Nightly sync", ci: "CI sync" },
        PUBLISH: { manual: "Manual publish", nightly: "Nightly publish", ci: "CI publish" },
      },
      files: (n: number): string => `${n.toLocaleString("en-US")} file${n === 1 ? "" : "s"}`,
      keys: (n: number): string => `${n.toLocaleString("en-US")} key${n === 1 ? "" : "s"}`,
      noPullRequest: "no pull request",
      /** 기준 언어는 **선언**이고 CI의 다음 push가 확정한다 (`checkFormat`). */
      declarationOnly: "declaration only",
      nothingImported: "nothing was synced",
      archivedEffect: "editing stopped and nightly publishes ended",
      restoredEffect: "editing and nightly publishes resumed",
      tokenEffect: "the previous token stopped working",
    },
    /**
     * 행의 문장. **행위자로 시작한다** — 사람과 자동화(`Nightly` · `CI`)를 같은 문법으로 읽는다.
     *
     * ⚠️ **방향을 낱말이 말한다** — 같은 `SyncRun`에서 나왔어도 내보내기는 `sent … to GitHub`,
     * 가져오기는 `synced … from the repository`다. 내부 이름이 하나라는 사실이 두 방향을 섞을
     * 근거가 되지 않는다.
     */
    sentence: {
      translation: {
        updated: (who: ReactNode, key: ReactNode, language: string): ReactNode => (
          <>{who} updated {key} in {language}</>
        ),
        cleared: (who: ReactNode, key: ReactNode, language: string): ReactNode => (
          <>{who} cleared {key} in {language}</>
        ),
        /** `Revert to last sent` — 빈 값으로 되돌려도 cleared가 아니다(되돌린 것과 지운 것이 Logs에서 갈려야 한다). */
        reverted: (who: ReactNode, key: ReactNode, language: string): ReactNode => (
          <>{who} reverted {key} in {language} to the version last confirmed as sent</>
        ),
      },
      publish: {
        running: (who: ReactNode): ReactNode => <>{who} is sending translations to GitHub</>,
        sent: (who: ReactNode): ReactNode => <>{who} sent translations to GitHub</>,
        nothing: (who: ReactNode): ReactNode => <>{who} publish had nothing to send</>,
        notSent: (who: ReactNode): ReactNode => <>{who} publish held back its edits</>,
        failed: (who: ReactNode): ReactNode => <>{who} publish failed</>,
        notStarted: (who: ReactNode): ReactNode => <>{who} publish didn't start</>,
      },
      import: {
        running: (who: ReactNode): ReactNode => <>{who} is reading the repository</>,
        imported: (who: ReactNode, sources: number): ReactNode => (
          <>{who} synced {sources.toLocaleString("en-US")} source{sources === 1 ? "" : "s"} from the repository</>
        ),
        deferred: (who: ReactNode, source: string): ReactNode => <>{who} held the sync on {source}</>,
        superseded: (who: ReactNode): ReactNode => <>{who} sync gave way to another run</>,
        failed: (who: ReactNode): ReactNode => <>{who} sync failed</>,
        notStarted: (who: ReactNode): ReactNode => <>{who} sync didn't start</>,
        /** 야간 스킵 — 편집도 새 커밋도 없었다. ⚠️ "synced"라고 말하지 않는다 — 아무것도 읽지 않았다. */
        upToDate: (who: ReactNode): ReactNode => <>{who} found nothing to publish or sync</>,
        /** 야간 스킵 실패 — base 브랜치 head를 못 읽었다. 적재가 시작조차 안 했으므로 "sync failed"와 가른다. */
        baseUnreadable: (who: ReactNode): ReactNode => <>{who} couldn&rsquo;t read the repository&rsquo;s base branch</>,
        /** 편집 수가 아닌 보류 셋 — `pending-edits`는 위 `deferred`(소스 이름)가 그대로 든다. */
        held: {
          "open-pr": (who: ReactNode): ReactNode => <>{who} held the sync — a Malmoi pull request is still open</>,
          "pr-check-failed": (who: ReactNode): ReactNode => <>{who} held the sync — GitHub didn&rsquo;t answer about pull requests</>,
          "too-large": (who: ReactNode): ReactNode => <>{who} held the sync — the change is too large for a server-side sync</>,
        },
      },
      member: {
        invited: (who: ReactNode, target: string): ReactNode => <>{who} invited {target}</>,
        joined: (who: ReactNode): ReactNode => <>{who} joined the project</>,
        roleChanged: (who: ReactNode, target: string): ReactNode => <>{who} changed {target}&rsquo;s role</>,
        removed: (who: ReactNode, target: string): ReactNode => <>{who} removed {target}</>,
        invitationRevoked: (who: ReactNode): ReactNode => <>{who} revoked an invitation</>,
      },
      surface: {
        added: (who: ReactNode, source: string): ReactNode => <>{who} added the {source} source</>,
        baseLocale: (who: ReactNode, source: string): ReactNode => (
          <>{who} changed the base language of {source}</>
        ),
      },
      settings: {
        created: (who: ReactNode): ReactNode => <>{who} created this project</>,
        name: (who: ReactNode): ReactNode => <>{who} renamed the project</>,
        baseBranch: (who: ReactNode): ReactNode => <>{who} changed the base branch</>,
        repository: (who: ReactNode): ReactNode => <>{who} reconnected the repository</>,
        pushToken: (who: ReactNode): ReactNode => <>{who} rotated the push token</>,
        image: (who: ReactNode): ReactNode => <>{who} changed the project image</>,
        imageRemoved: (who: ReactNode): ReactNode => <>{who} removed the project image</>,
        archived: (who: ReactNode): ReactNode => <>{who} archived this project</>,
        restored: (who: ReactNode): ReactNode => <>{who} restored this project</>,
      },
      /** 모르는 하위 종류 — **던지지 않고** 종류 이름으로 떨어진다 (읽는 쪽이 폴백을 든다). */
      fallback: (who: ReactNode, kind: string): ReactNode => <>{who} changed {kind}</>,
    },
    /**
     * 상세 640 (캔버스 `1d`–`1f`). **공통은 참조 하나**이고 나머지는 종류가 정한다 —
     * 모든 상세에 같은 격자를 깔면 빈 칸이 "못 읽었다"로 읽힌다.
     */
    detail: {
      kindLabel: {
        translation: "Translation",
        import: "Sync",
        publish: "Publish",
        surface: "Source",
        member: "Member",
        settings: "Settings",
      },
      labels: {
        reference: "Reference",
        trigger: "Trigger",
        source: "Source",
        key: "Key",
        locale: "Language",
        before: "Before",
        after: "After",
        files: "Files",
        pullRequest: "Pull request",
        errorCode: "Error code",
        resultPerSource: "Result per source",
        member: "Member",
        role: "Role",
        effect: "Effect",
        unsentEdits: "Unsent edits",
        /** 편집 수가 아닌 보류의 사유 칸 — `Unsent edits`에 PR 사유를 적으면 칸 이름이 거짓이 된다. */
        heldBecause: "Held because",
        values: "Values",
        withheld: "Held back",
        closedPullRequest: "Closed pull request",
      },
      /** no-changes 실행이 닫은 PR (B1 r3 — 스킵 행의 `SyncRun.prUrl`). 보낸 PR로 읽히지 않게 따로 말한다. */
      closedPullRequest: "Nothing in it differed from the base branch any more, so Malmoi closed it.",
      /** 결과 모달의 보류 줄과 같은 수·같은 약속이다 (delivery-invariants D7). */
      withheld: (n: number): string =>
        `${n.toLocaleString("en-US")} ${n === 1 ? "edit" : "edits"} stayed in Malmoi because the language file or key isn't in the repository yet.`,
      actions: {
        copy: "Copy reference",
        openTranslation: "Open this translation",
        openMembers: "Open members",
        openSettings: "Open settings",
        openRepository: "Open on GitHub",
        close: "Close",
      },
      /**
       * ⚠️ **실패 문장이 복구를 약속하지 않는다** — PR 생성 뒤 후속 저장이 실패할 수 있다.
       * ⚠️ **토큰 값은 부분도 남기지 않는다** — 그 사실을 화면이 직접 말한다.
       */
      notes: {
        publish: "A failed run does not prove that nothing reached GitHub. Check the repository if you expect a pull request.",
        import: "Counts are keys, not files or translation cells. Adding a source and syncing it are separate events — this run is the sync.",
        token: "Token values are never stored in logs, not even in part.",
      },
      /** ⚠️ **`Running…`을 브라우저 타이머로 바꾸지 않는다** (결정 10) — 닫는 것은 다음 실행이다. */
      noResult: "The server hasn't recorded a result.",
      /** 파일 수 `null`은 `—`이고 `0`이 아니다 — 0으로 적으면 "아무것도 안 바뀐 성공"과 같아진다. */
      notRecordedForRun: "not recorded for this run",
      noPullRequest: "None",
      /** 상세 대상이 없다 — **조회 실패와 구별된다.** */
      missing: { title: "We couldn't find this event", description: "The reference may be from another project, or it may never have existed." },
      startedFinished: (started: string, finished: string): string => `Started ${started} · finished ${finished}`,
      startedOnly: (started: string): string => `Started ${started}`,
    },
    /**
     * 값 상태 넷 (spec §6). **빈 칸을 만들지 않는 규칙의 유일한 관문이다** — 빈 칸은 "값이 없다"와
     * "이 종류엔 해당 없다"를 구별하지 못한다 (POSTMORTEM 2026-09-03). '해당 없음'은 `logs.none`이다.
     */
    value: {
      /** 사람이 **비운** 값. 수집하지 못한 값(`notRecorded`)과 다른 사실이다. */
      empty: "Empty",
      /** 보이지 않는 차이를 보이게 한다 — 전후가 공백 수만 다를 수 있다. */
      spacesOnly: (n: number): string =>
        `Spaces only (${n.toLocaleString("en-US")} character${n === 1 ? "" : "s"})`,
      /** 사건 당시 그 값을 수집하지 않았다. **과거를 추정해 채우지 않는다** (spec §7). */
      notRecorded: "Not recorded",
      /** 저장된 값을 지금 키로 못 열었다 — `common.unreadable`과 **같은 낱말이어야 한다.** */
      unavailable: UNAVAILABLE,
    },
    /**
     * 보관된 프로젝트에서 이력을 읽을 때 (캔버스 `1j`).
     *
     * ⚠️ **읽기 전용 신호가 셋이다** — 제목 옆 배지 · 설명 한 줄 · [Refresh] 없음(진행 중 실행이
     * 생길 수 없다). 필터·검색은 남는다: 읽기가 이 화면의 전부이므로 읽는 도구를 뺄 이유가 없다.
     * ⚠️ **복원 링크는 OWNER에게만** — EDITOR는 그 화면에 못 들어간다.
     */
    archived: {
      badge: "Archived",
      description: "This project is archived. The history stays readable — editing, publishing and syncing are off.",
      restoreLine: (date: string): string => `Archived on ${date}. Project owners can restore it from Settings.`,
      restoreAction: "Open settings",
    },
    trigger: {
      cron: "Nightly",
      /** FK가 `SetNull`이라 이력은 남고 저자만 빈다. */
      removed: "Removed user",
      /** CI 러너에는 사람이 없다 — 토큰이 프로젝트를 정할 뿐 누구인지는 말하지 않는다. */
      ci: "CI",
    },
    /**
     * ⚠️ **과거 시제이고 git 어휘가 없다.** 이 문장을 읽는 사람은 실패를 겪은 번역 편집자이고,
     * 그가 할 수 있는 일(개발자에게 말한다·기다린다)까지 말한다.
     */
    /** 보관 프로젝트의 사유에서 빼는 절 — 야간 발송이 보관 프로젝트를 건너뛰어 그 문장이 거짓이 된다(`planArchivedReason`). */
    nightlyRetry: NIGHTLY_RETRY,
    reasons: {
      "base-unreadable": "We couldn't read your repository. Ask your developers to check the app's access.",
      "not-installed": "The app wasn't connected to the repository. Ask your developers to reconnect it.",
      "glob-matched-nothing": "The translation files weren't where we expected. Ask your developers.",
      "github-error": `GitHub didn't answer. ${NIGHTLY_RETRY}`,
      "db-unavailable": `We couldn't reach our own storage. ${NIGHTLY_RETRY}`,
      stale: "This run stopped before it finished.",
      unknown: `Something went wrong. ${NIGHTLY_RETRY}`,
      /** MCP `publish`만 낸다 — 미리보기 뒤 보낼 내용이 바뀌어 아무것도 안 보냈다(mcp-connector design §3.1). */
      reconfirm: "The changes to send were updated after the preview, so nothing was sent. Preview again, then publish.",
      fallback: "Something went wrong. Tell your developers if it keeps happening.",
    },
    /** 거부 여섯의 문장 (spec §6.1). **다음 번에도 같은 이유로 거부될 것**만 여기 있다. */
    refusals: {
      archived: "The project was archived.",
      "not-ready": "The first sync hasn't finished yet.",
      "stale-commit": "A newer version of the repository was already synced.",
      "wrong-format": "The repository no longer matches the saved format.",
      "repo-replaced": "The connected repository changed.",
      "not-installed": "The app wasn't connected to the repository.",
      fallback: "The run was refused before it started.",
    },
  },

  /**
   * 보관 (7단계 — DESIGN §6.6). ⚠️ **"삭제"라고 쓰지 않는다** — 되돌릴 수 있고,
   * 자동 영구 삭제는 비목표다 (PRODUCT §7.9).
   */
  archive: {
    title: "Archive project",
    description: "Stop this project without deleting anything.",
    action: "Archive project",
    /** 되돌리기는 확인을 묻지 않는다 — 잃는 것이 없다. */
    restore: "Restore project",
    /** ⚠️ **절대 시각은 `<time dateTime>`이 든다** (L7.1) — 호출부가 `utcMinute`로 만든 노드를 넘긴다. */
    archivedBy: (when: ReactNode): ReactNode => <>Archived on {when}</>,
    confirm: {
      title: (name: string): string => `Archive ${name}?`,
      body: "Everyone stops editing, the nightly publish stops, and syncs from your repository are refused.",
      /** ⚠️ 열린 PR을 닫지 않는다 (PRODUCT §7.9) — 사람이 알고 판단해야 한다. */
      openPr: "What you already sent stays open for your developers:",
      openPrLink: "See what's open",
      /** ⚠️ 조회 실패를 "없다"로 접지 않는다 (POSTMORTEM 2026-09-03). */
      prUnknown: "We couldn't check what's still open for your developers.",
      cancel: "Cancel",
    },
    failed: (reason: string): string => `Couldn't change this: ${reason}`,
    /** 호출이 끊겨 서버가 바꿨는지 모른다 — 사유를 지어내지 않고 새로고침으로 확인하게 한다. */
    failedUnknown: "We couldn't confirm the change. Refresh the page to see the current state.",
    /** 보관된 프로젝트를 연 사람이 보는 화면. **사유는 `errors.access.archived`가 든다** — 저장 실패
     *  한 줄과 같은 문장이어야 사용자가 두 자리를 같은 일로 읽는다. */
    empty: { title: "This project is archived", action: "Open settings" },
  },

  projects: {
    /**
     * 툴바 우측의 이름 검색 (2026-09-11).
     *
     * ⚠️ **검색 필드의 placeholder는 `…`로 끝난다** (2026-09-11 사용자 — 앞으로 이 패턴이다).
     * §10이 줄임표를 "진행 중과 **추가 입력이 필요한 행동**"에 허용하는데 빈 검색창이 정확히
     * 뒤쪽이다. **문자는 `…`(U+2026)이고 마침표 셋이 아니다** — 리포의 다른 자리(`Running…`)가
     * 그 표기이고, 마침표 셋은 폰트에 따라 간격이 벌어진다.
     *
     * ⚠️ **`aria-label`은 줄임표가 없다** — 스크린리더가 읽는 **이름**이라 장식이 붙으면 안 된다.
     * 그래서 키가 둘로 갈려 있고, 값이 다르므로 "두 벌이면 하나가 낡는다"에 걸리지 않는다.
     *
     * ⚠️ **`clear`가 없다** — 지우기는 `type="search"`의 네이티브 ✕가 든다.
     */
    search: { label: "Search projects", placeholder: "Search projects…" },
    /**
     * 검색이 걸러 0건일 때의 빈 상태 (2026-09-11 사용자 — `EmptyState` 형으로 올렸다).
     *
     * ⚠️ **"프로젝트가 없다"(`empty`)와 같은 형이되 액션이 반대다.** 그쪽은 만들라고 하고(primary),
     * 여기는 **되돌리라고** 한다 — 프로젝트는 이미 있고 화면이 좁혀져 있을 뿐이다.
     *
     * ⚠️ **제목이 질의를 안 싣는다** — 긴 질의가 제목을 밀어내고, 무엇을 쳤는지는 검색창이 이미
     * 보여준다. 설명이 그것을 말한다.
     *
     * ⚠️ **`byFilter`가 2026-09-13에 사라졌다** (DESIGN §6.63). 좁히는 축이 검색 하나가 되면서
     * "탭 0건"이라는 갈래 자체가 없어졌다 — 남겨 두면 탭이 있던 시절의 화석이 사전에 남는다.
     */
    narrowed: {
      /**
       * ⚠️ **제목이 질의를 든다** (2026-09-15 캔버스 `1d` — 전엔 상수 `No results`였고 질의는 설명이
       * 들었다). 카드 하나에 문장이 둘뿐이라 제목이 "무엇을 못 찾았나"를 답하고, 설명은 그 다음
       * 질문("검색이 무엇을 보나")으로 넘어간다.
       *
       * ⚠️ **곡선 따옴표다**(`“ ”`) — 캔버스 값이고 `resultsFor`와 같은 표기여야 한 화면에서 같은
       * 것이 두 모양으로 보이지 않는다.
       */
      title: (q: string): string => `No projects match “${q}”`,
      /**
       * ⚠️ **0건을 본 사람의 다음 질문이 늘 "무엇으로 찾나"다.**
       *
       * ⚠️ **캔버스 문장 둘을 다 못 쓴다.** 원문은 *"Search looks at the project name and the
       * repository. Check the spelling, or clear the search to see all three projects."*이고 둘 다
       * 거짓이다: 뒤 문장은 총계 **셋**을 문자열에 박아 프로젝트가 셋이 아닌 계정에서 틀리고,
       * 앞 문장의 **`and the repository`는 코드와 반대다** — `searchProjects`는 `row.name` 하나만
       * 본다(그 함수의 주석이 그 판정을 박아 뒀고, 이 기능의 비목표가 그것을 안 건드리는 것이다).
       * **0건을 본 사람에게 리포 이름으로 찾아진다고 말하면 그 사람은 또 0건을 만난다.**
       */
      description: "Search looks at the project name.",
      /**
       * ⚠️ **`Clear filters`에서 바뀌었다** — 되돌릴 축이 질의 하나뿐이다. 결과 카드의 같은 동작도
       * 같은 낱말을 써야 한다: 한 화면에서 같은 동작이 두 이름을 갖지 않는다.
       */
      reset: "Clear search",
    },
    /** 목록·스위처의 보관 표시. 숨기는 대신 배지로 남는다 — 숨기면 되돌릴 링크가 사라진다. */
    archived: "Archived",
    /** 역할은 화면 어휘로 — `ProjectMember.role`의 내부 이름을 그대로 쓰지 않는다 (PRODUCT §3). */
    role: { OWNER: "Owner", EDITOR: "Editor" },
    empty: {
      title: "No projects yet",
      /**
       * ⚠️ **약속과 안전을 한 문장씩 말한다** (캔버스 `1a`). 앞은 "무엇을 해주나", 뒤는 "무엇을
       * 안 하나"다 — 남의 리포에 연결을 요구하는 화면이라 되돌릴 수 없는 쓰기가 없다는 사실이
       * 시작 버튼 옆에 있어야 한다.
       */
      description:
        "Connect a repository and Malmoi will find the translation files for you — it only writes back by opening a pull request. Invited to someone else's project? Open the link in your invitation email.",
    },
    /**
     * 큐 넷의 제목.
     *
     * ⚠️ **2026-09-15에 목록 화면에서 내려왔다** (DESIGN §6.63) — 못 누르는 숫자 넷이
     * 머리 90px을 차지했고, 같은 값을 프로젝트별로 쪼갠 것이 이미 행의 Meter와 아래 띠다.
     *
     * ⚠️ **지우지 않는다 — `project-home`이 카운트 카드 넷으로 받는다**(`project-home/tasks.md`:189
     * *"카드 넷의 제목은 새로 만들지 않는다"*). 그때까지 **소비자가 없는 채로 남는다.**
     */
    summary: {
      /** 마지막 pull 이후 리포에서 들어온 활성 키. 첫 pull 전에는 활성 키 전체다. */
      newFromGithub: "New from GitHub",
      toTranslate: "To translate",
      toReview: "To review",
      toSend: "To send",
    },
    /**
     * 그룹 헤더 셋. **`Archived`는 `projects.archived`를 그대로 쓴다** — 행 배지와 같은 낱말이라야
     * "지금 무엇을 보고 있나"가 이어지고, 두 벌로 두면 하나가 낡는다.
     */
    group: { needsAttention: "Needs attention", allSet: "All set" },
    /**
     * 검색 결과 카드의 헤더 (캔버스 `1c`).
     *
     * ⚠️ **수를 넣지 않는다** — 옛 `searchResult(n, total)`은 `1 of 3 projects match`였는데, 카운트
     * 배지가 바로 옆에서 건수를 들므로 문장에 수를 두면 같은 것을 두 번 말한다.
     *
     * ⚠️ **질의가 문구 **안**으로 들어왔다** — 전엔 캔버스가 그 낱말만 foreground로 칠해 화면이
     * 별개 노드로 그렸는데, 카드 헤더에서는 제목 전체가 같은 급이라 강조할 자리가 없다.
     */
    resultsFor: (q: string): string => `Results for “${q}”`,
    /**
     * 카운트 배지의 **스크린리더 문장** — 제목 옆 총계와 카드 헤더 넷이 같은 것을 쓴다.
     *
     * ⚠️ **숫자만 그리면 접근 이름이 `Results for “chrome” 2`다** — 옛 결과 줄(`1 of 3 projects match`)이
     * 완전한 문장이었는데 카드로 옮기며 맨 숫자가 됐다. 번역 화면 머리가 같은 자리에서 같은 처방을
     * 이미 쓴다(`m.translations.keys`). ⚠️ **CDP 접근성 트리로 `h2`의 이름만 보면 통과한다** —
     * 배지가 별개 노드라서다.
     */
    count: (n: number): string => `${n} project${n === 1 ? "" : "s"}`,
    /** ⚠️ **`narrowed.reset`과 같은 값이어야 한다** — 한 화면에서 같은 동작이 두 이름을 갖지 않는다. */
    clearSearch: "Clear search",
    /**
     * Meter 자리에 **바 대신 서는 문장** (DESIGN §6.63). 값이 없는 상태에서 0% 바를 그리면
     * "0% 번역됨"으로 읽히는데, 그 프로젝트는 아직 셀 것이 없는 상태다.
     */
    meter: {
      note: {
        waiting: "Not synced yet",
        importing: "Syncing…",
        failed: "Sync failed",
        setup: "Connect the GitHub App to continue.",
      },
    },
    /**
     * 행 아래 띠 — **다음 한 수**를 말한다 (DESIGN §6.63). 겹치면 하나만 그리고 우선순위는
     * `rowBanner`가 정한다.
     *
     * ⚠️ **복수형을 함수가 든다** — 시안 문구가 전부 복수형이지만 `1 strings`는 틀렸다
     * (`memberCount`가 같은 이유로 이미 함수다).
     *
     * ⚠️ **역할로 갈리는 것은 링크 셋뿐이다**(`Reconnect`·`Continue setup`·`View details`) —
     * 그 셋은 `project:settings` 뒤라 EDITOR에게 보여 주면 눌러서 거절당하는 경험이 된다.
     * 문장 자체는 역할과 무관하다 (PRODUCT §3: EDITOR도 Publish한다).
     */
    banner: {
      review: (n: number): string =>
        `${n.toLocaleString("en-US")} cell${n === 1 ? " is" : "s are"} translated and waiting for review.`,
      unsent: (n: number): string =>
        // ⚠️ 결과를 약속하지 않는다 — Publish가 보류하는 편집(파일·키가 아직 없음)도 같은 술어로 세어진다.
        `${n.toLocaleString("en-US")} unsent edit${n === 1 ? "" : "s"} — publish to send ${n === 1 ? "it" : "them"}.`,
      prOpen: (n: number): string => `Pull request #${n} is open — merge it to finish.`,
      /**
       * 열린 PR 조회가 실패했다(ux-drift-unify Q6) — "없음"이 아니라 모름이다. ⚠️ **목적어를 붙인다** — 홀로 서는 "Couldn't check"는
       * 연결 확인 실패의 낱말이다(DESIGN §10.1). 게이트가 fail-closed라 그 동안 리포 갱신이 멈춘다.
       */
      prCheckFailed: "Couldn't check for an open pull request.",
      /** ⚠️ **base 브랜치 이름을 그대로 넣는다** — `main`을 하드코딩하지 않는다. */
      repoAhead: (n: number, baseBranch: string): string =>
        `${n} translation file${n === 1 ? "" : "s"} changed on ${baseBranch} after your last sync.`,
      setup: "Finish setup to start translating.",
      /** ⚠️ 목록이 아는 것은 `repositoryId === null`뿐이다 — "access was revoked"는 `unpinned`에서 거짓이었다(D1). Home 배너와 같은 Disconnected 문장이다. */
      needsReconnect: "This repository is disconnected — syncs and publishes stop until it's reconnected.",
      /** 실패 사유(`importFailure.*`) 뒤에 붙는다 — 설정 화면이 그 상세를 든다. */
      checkDetails: "Check the sync details.",
      /** EDITOR 갈래. 링크를 뺀 자리에 "누가 할 수 있는지"를 말한다. */
      askOwner: {
        reconnect: "Ask a project owner to reconnect it.",
        setup: "Ask a project owner to finish setup.",
      },
      action: {
        review: "Review",
        /**
         * ⚠️ **누르면 Publish가 되는 것이 아니다** — 번역 화면 툴바의 버튼으로 데려갈 뿐이다 (PRODUCT §7.7).
         * 그래서 동사가 `Go to`이고 목적지 버튼 이름을 그대로 든다 (audit #28 — 전엔 없는 버튼 `Send changes`였다).
         */
        send: "Go to Publish",
        viewPr: "Open on GitHub",
        reviewChanges: "Review changes",
        viewDetails: "View details",
        continueSetup: "Continue setup",
        reconnect: "Reconnect",
      },
    },
    /**
     * 목록 행 우측 배지의 갈래 넷 (`projectStatus`). **`ready`가 `Active`로 보인다** — 필터 탭이 같은
     * 낱말을 쓰기 때문이고, 그 근거는 `lib/projects/list.ts`에 있다.
     *
     * ⚠️ **내부 이름을 화면에 쓰지 않는다** (PRODUCT §3) — 번역자도 이 목록을 보고
     * `awaiting_first_sync`는 그에게 아무것도 알려주지 않는다.
     */
    status: {
      active: "Active",
      archived: "Archived",
      /**
       * ⚠️ **한 낱말이다** (2026-09-11 사용자 — "Waiting for first import"에서 줄였다). 배지는 행
       * 우측의 좁은 칸이고, 문장이 들어가면 이름·리포 URL과 폭을 다툰다. 무엇을 기다리는지는
       * 그 프로젝트를 열면 `ProjectNotReady`가 문장으로 말한다.
       */
      awaiting_first_sync: "Not synced yet",
      /**
       * ⚠️ **한 낱말이고 동사가 아니다** (2026-09-11 사용자 — "Setting up"에서 줄였다). 진행형은
       * 뭔가가 저절로 돌고 있다는 뜻인데 이 상태는 **멈춰 있다**: OWNER가 GitHub App을 연결해야
       * 다음이 없다. 명사가 그 사실을 말하고, 나머지 넷과도 품사가 맞는다.
       */
      setup: "Setup",
      /**
       * ⚠️ **git 어휘를 쓰지 않는다** (DESIGN §10) — 번역자도 이 목록을 본다. "repository id가
       * 고정되지 않았다"가 아니라 **그 사람이 보는 사실**을 말한다.
       *
       * ⚠️ **한 낱말이다** (2026-09-11 사용자 — "Reconnect needed"에서 줄였다). 배지는 상태를 말하고
       * 할 일은 설정 화면의 `Alert`가 말한다 — 좁은 칸에 동사를 넣으면 누를 수 있는 것처럼 읽힌다.
       */
      needs_reconnect: "Disconnected",
    },
    /**
     * 마지막 임포트가 실패했을 때의 **사유 문장** (PRODUCT §7.8).
     *
     * ⚠️ **저장된 것은 코드 하나다** — 파서 원문·파일 경로·행 번호는 DB에 들어가지 않는다.
     * `AdapterError`가 모든 포맷에 행 번호를 주지 않으므로 `line 41` 같은 값을 지어낼 수도 없고,
     * 이 문장은 **번역자도 보는 목록**에 나가므로 파서 어휘를 쓰지 않는다 (DESIGN §10).
     * 상세 진단은 CI 로그에 남아 있고 화면은 그리로 보낸다.
     *
     * ⚠️ **`ownerRetries`가 EDITOR 갈래다** (audit #6 r1) — `View details`는 이제 Sources로 가서 EDITOR도 누르고
     * 사유를 읽는다. 재시도만 `project:settings` 뒤라 그 사실 한 줄을 더한다 (PRODUCT §3).
     */
    importFailure: {
      parseFailed: "Translation files couldn't be parsed.",
      parseCrashed: "A translation file stopped the parser.",
      invalidLocaleData: "Some translation entries couldn't be read.",
      prepareFailed: "The file format couldn't be read on the last sync.",
      /** 데이터는 들어갔다 — "실패"가 아니라 "일부가 빠졌다"여야 사용자가 목록의 숫자를 믿는다. */
      partialImport: "Some translation files were left out of the last sync.",
      importFailed: "The last sync couldn't finish.",
      ownerRetries: "Only project owners can try it again.",
    },
  },

  /**
   * 계정 화면 (6b-4 — PRODUCT §7.7의 사용자 축). ⚠️ **컨트롤 라벨은 `settings.account`가 든다** —
   * `github-account.tsx`의 두 버튼이 그 키를 읽으므로 여기에 사본을 두면 같은 버튼이 화면마다
   * 다른 말을 한다. 여기 있는 것은 이 화면만 쓰는 문구다.
   */
  account: {
    profile: {
      /**
       * 카드 헤더 (2026-09-16). **머리 블록이 카드가 되면서 제목이 생겼다** — 카드 넷이 같은 그릇을
       * 쓰는데 프로필만 패널 머리에 얹혀 있으면 그것만 규격이 다르다. 패널 머리에는 `Settings`만 남는다.
       */
      title: "Profile",
      /**
       * ⚠️ **카드 설명문이 없어졌다** (2026-09-13). 머리 블록에는 설명 슬롯이 없고, 두 칸의
       * 소유자가 다르다는 사실은 **이메일 칸 옆의 `emailSource` 한 줄**이 그 자리에서 말한다 —
       * 화면 위쪽의 산문보다 필드 옆의 한 줄이 실제로 읽힌다.
       */
      /** 사실 블록의 라벨 셋 — 아바타 행도 라벨을 든다(없으면 그 행만 두 열을 가로질러 형이 갈린다). */
      avatar: "Avatar",
      name: "Name",
      email: "Email",
      /**
       * ⚠️ **이름 칸과 이메일 칸이 같은 문구를 쓴다.** 이메일은 검증된 주소 없이 로그인 자체가
       * 막히므로 사실상 안 나오고, 이름은 provider가 안 줄 수 있다 — 어느 쪽도 빈 칸을 남기지 않는다.
       */
      none: "None",
      save: "Save",
      /** ⚠️ **토스트가 아니다** — 이 리포에서 저장 결과를 토스트로 내는 자리는 0이다. */
      saved: "Saved",
      errors: {
        empty: "Enter a name so people can recognize you.",
        tooLong: (max: number): string => `Use ${max} characters or fewer.`,
        unavailable: "We couldn't save your name. Try again in a moment.",
      },
    },
    github: {
      /**
       * ⚠️ **이 문장이 드는 것은 기능이 아니라 축이다** — 같은 화면에 "GitHub"이 세 군데 나오고,
       * 바로 위 구역이 **로그인 수단**이다. 전 문장(`Connect GitHub to see which repositories you
       * can add.`)은 무엇을 할 수 있는지만 말해 그 구별을 못 했다.
       */
      /**
       * 카드 헤더 (2026-09-16). **`settings.account.title`(`GitHub account`)을 갱신하지 않고 새 키다** —
       * 그 키는 프로젝트 설정 화면이 계속 쓰고, 여기서 바뀐 것은 이 카드의 축 이름이다.
       *
       * ⚠️ **`GitHub account`에서 뒤쪽 낱말만 바꿨다.** 이 화면에 "account"가 이미 셋이고(계정 화면 ·
       * 로그인 수단의 GitHub · 이 연결), 붙어 있는 것은 계정이 아니라 **설치된 app**이다.
       * `Malmoi app`도 후보였지만 버렸다 — 사용자가 묻는 것은 "내 GitHub에 무엇이 붙어 있나"이고,
       * 우리 제품 이름을 앞에 세우면 malmoi 안의 기능처럼 읽힌다. 정작 가서 끊는 곳은 GitHub이다.
       *
       * ⚠️ **아래 `confirmDisconnect`와 표기가 같아야 한다** — 한 화면에 `GitHub app`과 `GitHub App`이
       * 같이 서면 **같은 사전의 다른 절**에 살아 리뷰로 안 걸린다 (2026-09-13 `malmoi`/`Malmoi`).
       */
      title: "GitHub App",
      /**
       * ⚠️ **아래 넷은 행 본문의 `— {상태}` 자리다** (2026-09-16 — 핸드오프 v2). 상태를 13 보조 줄로
       * 내리면 **부연으로 읽히는데**, 이 행이 답하는 질문이 곧 상태다. 보조 줄은 `hint*`가 든다.
       *
       * ⚠️ **`m.settings.account.reauthorize`·`unavailable`을 재사용하지 않는다** — 그 둘은 문장이고
       * (`Your GitHub authorization expired.`) 프로젝트 설정 화면이 계속 그 형으로 쓴다. 여기는
       * 한 줄 안에 이어 붙는 **구절**이라 형이 다르다.
       */
      notConnected: "Not connected",
      statusReauthorize: "Expired",
      statusUnavailable: "Couldn't check",
      /** 보조 줄 셋 — **다음에 할 일**을 든다. 연결됨 갈래는 `installedOn`이 그 자리에 선다. */
      hintNotConnected: "Connect to see which repositories have the app installed.",
      /**
       * ⚠️ **재인가가 실제로 막는 것만 말한다.** 앞 판본은 `malmoi can't send changes until you
       * reconnect.`였고 **거짓이었다** — `ensureUserToken` 소비자는 넷뿐이고(`account-view` ·
       * `installed-repos` · 프로젝트 Action 둘) **`lib/pull`·`lib/push`에는 0곳**이다. 야간 pull과
       * PR은 `createGitClient`의 **설치 토큰**이 내므로 사용자 토큰이 만료돼도 그대로 돈다.
       *
       * 그 문장을 믿은 사용자는 없는 장애를 찾거나 **멀쩡한 App 설치를 지우고 다시 만든다**
       * (POSTMORTEM 2026-09-03과 같은 결말). 같은 카드의 `confirmHint`가 이미 정확한 범위를 쓰고
       * 있었는데 이 줄만 반대를 말했다 — **같은 사전의 다른 절**이라 리뷰로 안 걸리는 형이다
       * (2026-09-13 `malmoi`/`Malmoi`).
       */
      hintReauthorize: "You won't be able to add or reconnect repositories until you authorize again. Projects that are already connected keep syncing.",
      /** ⚠️ **"your account"가 아니라 "this connection"이다** — 계정은 멀쩡하고 못 읽은 것은 이 연결이다. */
      hintUnavailable: "We couldn't check this connection. Open this page again in a moment.",
      /**
       * 연결된 행의 **본문** 상태 절 (2026-09-16에 보조 줄에서 올라왔다).
       *
       * ⚠️ **프로젝트 수를 말하지 않는다** (2026-09-14 리뷰 🔴1). 전에는 `Connected · N projects use
       * this connection`이었는데, 그 N이 세던 것은 **내가 OWNER인 모든 프로젝트**였고 그중 이 연결에
       * 실제로 의존하는 것은 없었다 — 야간 pull·PR은 App **설치 토큰**이 내고 사용자 토큰을 한 줄도
       * 안 읽는다. 숫자가 근거가 될 수 없어 걷었다.
       */
      connected: "Connected",
      /**
       * 연결된 행의 **보조 줄** — 이 갈래에서 "다음에 할 일"의 자리를 이 집계가 든다.
       *
       * ⚠️ **설치 설정으로 나가기 전에 그 숫자가 바꾸려는 값이다** — 나가는 링크와 같은 행에 서는
       * 이유가 그것이다. 위 `connected`가 걷어낸 `N projects use this connection.`과 다른 축이다: 이 수는
       * 사용자가 GitHub에서 **직접 고른 것**이고, 그래서 근거가 된다.
       *
       * ⚠️ **`0`과 "못 읽었다"는 이 줄을 아예 그리지 않는다** (DESIGN §6.67) —
       * `Installed on 0 repositories.`는 연결이 깨진 것처럼 읽히고 행 높이만 갈린다.
       */
      installedOn: (n: number): string => `Installed on ${n.toLocaleString("en-US")} repositor${n === 1 ? "y" : "ies"}.`,
      /**
       * 나가는 링크의 라벨.
       *
       * ⚠️ **New Project의 설치 링크와 다른 키다** — 그쪽은 "리포를 더 고르러 간다"는 한 가지 일이고
       * 이쪽은 설정 전반이다. 같은 키를 쓰면 한쪽 문구를 고칠 때 다른 화면이 조용히 따라 움직인다.
       */
      installationSettings: "Installation settings",
      /** 행의 제목 자리 — 연결된 계정이 없을 때다. 핸들이 있으면 그것이 제목이다. */
      rowName: "GitHub",
      /**
       * 제목이 대상을 명시한다 — 이 화면에 같은 라벨의 [Disconnect]가 둘이다.
       *
       * ⚠️ **카드 제목과 같은 말을 쓴다** (`title`, 2026-09-16). 전엔 `Disconnect GitHub from malmoi?`라
       * 카드가 무엇을 가리키는지와 Dialog가 무엇을 끊는지가 다른 이름이었다.
       */
      confirmDisconnect: "Disconnect GitHub App from Malmoi?",
      /**
       * ⚠️ **이 문장이 해제 Dialog를 붙인 논거이고, 2026-09-14까지 거짓이었다** (리뷰 🔴1).
       * 전 문장은 *"won't be able to read your repositories or open pull requests"* 였는데 **PR은 계속
       * 열린다** — `selectPullTargets`가 고르고 `lib/github.ts`의 **설치 토큰**이 커밋·PR을 내며,
       * `ensureUserToken`은 `lib/pull`·`lib/push` 어디에도 없다. 해제가 실제로 막는 것은 **새
       * 프로젝트에서 리포를 고르는 일과 (재)연결**뿐이고, 그래서 문장이 그 둘만 말한다.
       */
      confirmHint: "You won't be able to add or reconnect repositories until you connect again. Projects that are already connected keep syncing.",
    },
    /** 구역 헤더 — 항목 둘(이 기기 / 모든 기기)이 한 리스트에 선다. */
    sessionsSection: {
      title: "Sessions",
    },
    sessions: {
      title: "Sign out everywhere",
      confirmTitle: "Sign out everywhere?",
      confirmHint: "You'll confirm with the account you sign in with, then every device is signed out — including this one.",
      /**
       * ⚠️ **확정 라벨이 결과를 말한다** — 이 버튼은 일을 **끝내지 않는다.** 누르면 provider로
       * 나가고 거기서 확인해야 로그아웃이 일어난다. "Sign out everywhere"라 적으면 그 왕복이
       * 사용자에게 예고 없이 닥친다. 확인 상대는 서버가 결정적으로 고르므로(`pickLoginAccount`)
       * 화면이 그 이름을 안다.
       */
      confirmAction: (provider: string): string => `Continue to ${provider}`,
      /**
       * Dialog의 **검은 줄** — *지금 참인 값*을 말한다(회색 설명문은 *무엇을 잃나*를 말한다).
       * 확인이 둘이 되는 것을 미리 알려 두 번째가 실패로 읽히지 않게 한다.
       */
      confirmDetail: (provider: string): string => `${provider} will ask you to confirm before anything changes.`,
      /**
       * 행 본문의 `— {범위}` 자리 (2026-09-16). ⚠️ **`description`을 대신한다** — 그 문장
       * (`Confirm with the account you use to sign in. …`)은 확인 왕복을 설명했고, 그 말은 이제
       * 아래 `willConfirm`과 Dialog가 나눠 든다. 행 본문이 답할 것은 **"어디까지 닫히나"**다.
       */
      /**
       * 행 보조 줄 — **이 버튼이 일을 끝내지 않는다**는 사실을 누르기 전에 말한다. 누르면 provider
       * 화면으로 나갔다 돌아오고, 예고가 없으면 그 왕복이 실패로 읽힌다 (`confirmAction`이
       * `Continue to GitHub`인 것과 같은 축).
       *
       * ⚠️ **provider 이름을 넣지 않는다.** 캔버스는 `GitHub will ask you to confirm…`이라 적었고
       * 아래 `confirmDetail`이 정확히 그 문장인데, 행에 그걸 쓰면 **확인 상대를 못 고르는 갈래에서
       * 이 줄만 사라져 두 행 높이가 갈린다** — 수단 카드에서 보조 줄 둘을 다 지운 것과 같은 논거다.
       * **의도적 이탈이고 DESIGN §6.67에 근거가 있다.**
       *
       * ⚠️ **능동태다** — 이 리포에서 수동태가 서는 자리는 **이미 일어난 일**뿐이다
       * (`Confirmation was cancelled.` · `You have been signed out…`). 누르기 **전에** 읽는 예고는
       * 전부 능동이다(`You'll need to sign in again…` · `We'll add this sign-in method…`).
       *
       * ⚠️ **`your provider`는 캔버스 정정 요청 대상이다** (2026-09-16 3라운드 🟡) — 비개발자가 그
       * 낱말을 Google로 옮기지 못할 수 있는데, 대안이 전부 Dialog와 겹치거나(`the account you sign
       * in with`) 부정확하다. **이 줄 자체가 캔버스 이탈이므로 대체 문구도 캔버스가 정한다.**
       *
       * ⚠️ **Dialog가 이미 하는 말을 반복하지 않는다.** 첫 판본은
       * `You'll confirm with the account you sign in with before anything changes.`였는데 **앞 8낱말이
       * Dialog 회색 설명과 그대로 겹치고** 뒤 절은 검은 줄과 겹쳤다 — 한 문장이 두 번이던 것을
       * 두 조각이 각각 두 번으로 옮겼을 뿐이었다 (2026-09-16 재검토 🟡C). 행이 들 것은 Dialog가
       * **아직 안 한 말**이다.
       */
      willConfirm: "We'll send you to your provider to confirm, then bring you back here.",
      button: "Confirm and sign out everywhere",
      complete: "You have been signed out everywhere. Sign in again to continue.",
      failed: "We couldn't sign you out everywhere. Try again.",
      cancelled: "Confirmation was cancelled. You are still signed in. Try again when you are ready.",
      expired: "This confirmation expired. Start again to sign out everywhere.",
      wrongAccount: "Choose the same account you use to sign in to Malmoi, then try again.",
    },
    signOut: {
      title: "Sign out",
      /** 행 본문의 `— {범위}` 자리 — 바로 아래 행이 "모든 기기"라 이쪽이 무엇인지 말해야 한다. */
      description: "You'll need to sign in again to open your projects.",
      /** ⚠️ **확정이 primary다** — 넷 중 유일하게 잃는 것이 없다 (재로그인 한 번이다). */
      confirmTitle: "Sign out?",
      /**
       * ⚠️ **앞 문장이 신규다** — 되돌릴 수 없는 넷 중 이것만 잃는 것이 없다는 사실을 그 자리에서
       * 말한다. 편집 중에 눌릴 수 있는 버튼이라 "저장 안 한 것이 날아가나"가 첫 질문이다.
       */
      confirmHint: "Unsent edits stay saved on Malmoi. You'll need to sign in again to open your projects.",
    },
    picture: {
      upload: "Upload",
      delete: "Remove",
      caption: "PNG or JPEG, up to 3 MB.",
      /**
       * ⚠️ **막는 이유가 둘이라 문구도 둘이다** (2026-09-14 2차 리뷰 R5). 둘은 **사진이 없다**와
       * **다른 하나가 돌고 있다**이고, 뒤의 것은 스피너가 **이 버튼에 없으므로** 화면에도 접근성
       * 트리에도 아무 설명이 없었다 — 스크린리더에는 *"…, 버튼, 사용 불가"*까지만 들린다.
       */
      busy: "Wait for the current upload to finish.",
    },
  },

  /**
   * **`/mcp` — MCP connector 페이지** (핸드오프 `design_handoff_mcp_connector` §12 — 문구가 전부 확정이다). 도구 결과 문장은 이 블록이
   * 아니라 `mcp`(M3)다 — 에이전트가 읽는 문장과 사람이 읽는 화면을 한 블록에 섞지 않는다.
   */
  mcpConnector: {
    token: {
      title: "Your token",
      create: "Create token",
      rotate: "Rotate",
      revoke: "Revoke",
      expired: "Expired",
      emptyTitle: "No token yet",
      emptyBody: "Create a token to let an AI agent work in your projects.",
      facts: {
        grants: "Allowed actions",
        scope: "Scope",
        created: "Created",
        lastUsed: "Last used",
        expires: "Expires",
      },
      // 빈 grant를 안 그리면 "권한 없음"과 구별이 안 된다 — 읽기는 grant 없이 된다(design §1.25).
      readOnly: "Read only",
      allProjects: "All projects",
      projects: (n: number): string => `${n.toLocaleString("en-US")} project${n === 1 ? "" : "s"}`,
      never: "Never",
      // 결과 미확인(`4b`) — 복구는 머리의 Rotate다. 버튼을 더하지 않는다.
      unconfirmed: "We couldn't confirm the result. If you didn't get a token value, rotate to get a new one.",
      // 폐기 응답 유실 — 핸드오프에 프레임이 없다(4b와 같은 자리·형). 다음 행동은 카드를 보고 남았으면 다시 폐기다.
      revokeUnconfirmed: "We couldn't confirm the token was revoked. If it's still shown here, revoke it again.",
      // 항상 DOM에 있는 `role="status"`가 읽는 완료 문장 — 화면에는 안 보인다(카드가 바뀐 것이 시각 신호다).
      status: {
        created: "Token created",
        rotated: "Token rotated",
        revoked: "Token revoked",
      },
    },
    /** 허용 동작 넷 — 순서는 `TOKEN_GRANTS`다. 라벨은 카드 사실 블록에서 ` · `로 잇는다. */
    grants: {
      "translation:write": { label: "Translate & publish", hint: "Save translations and open publish PRs." },
      // Sync·Revert가 미전달 편집을 버린다 — 그래서 힌트에 `sync`가 있다(핸드오프 결정 16).
      "project:settings": { label: "Project settings", hint: "Sources, sync, base branch, push token, archive." },
      "member:manage": { label: "Members", hint: "Invite, change roles, remove." },
      "project:create": { label: "Create projects", hint: "List your GitHub repositories and set up new projects." },
    },
    /** 연결된 앱(mcp-oauth 핸드오프 §7.3 · §7.5) — OAuth 연결 목록. 개인 토큰 카드와 어휘(`token.facts`)를 공유한다. */
    apps: {
      title: "Connected apps",
      /** 카드 머리 개수 배지의 sr 문장 — 숫자는 `aria-hidden`이다(`CountBadge`). */
      count: (n: number): string => `${n.toLocaleString("en-US")} connected ${n === 1 ? "app" : "apps"}`,
      copyServerUrl: "Copy server URL",
      emptyTitle: "No connected apps",
      emptyBody: "Apps you authorize from Claude Code, Codex or claude.ai show up here.",
      disconnect: "Disconnect",
      // 같은 이름의 연결이 둘일 수 있다 — 접근 이름이 식별 줄까지 싣는다(design §6.1).
      disconnectLabel: (name: string, id: string): string => `Disconnect ${name}, ${id}`,
      confirmTitle: (name: string): string => `Disconnect ${name}?`,
      confirmBody: "It loses access right away. Your other apps and your personal token keep working.",
      confirm: "Disconnect app",
      disconnected: (name: string): string => `Disconnected ${name}`,
      loadFailed: "We couldn't load your connected apps.",
      unconfirmed: (name: string): string => `We couldn't confirm ${name} was disconnected. If it's still listed, disconnect it again.`,
      // DCR 연결의 식별 줄 한 줄 형 — 동의 화면의 두 줄(`oauthAuthorize.clientId`·`returnsTo`)을 목록 행에서 잇는다.
      dcrIdent: (id: string, host: string): string => `Client ID ${id} · returns to ${host}`,
    },
    // /mcp 머리 우측 버튼(2026-09-30 사용자 — 본문 끝 헬퍼 문장을 걷었다). 라벨은 가이드 페이지 제목(`guide/SUMMARY.md`)과 같아야 한다.
    guide: {
      link: "Connect an AI agent",
    },
    form: {
      createTitle: "Create token",
      rotateTitle: "Rotate token",
      expiresIn: "Expires in",
      days: (n: number): string => `${n.toLocaleString("en-US")} days`,
      grants: "Allowed actions",
      grantsHelp: "Reading keys, events and members inside your projects never needs a grant.",
      scope: "Scope",
      allMine: "All my projects",
      chosen: "Chosen projects",
      noMembership: "You're not a member of any project yet.",
      // 열린 결정 1(핸드오프 §13) — 바닥 왼쪽 상태 슬롯에 둔다(초대 모달의 상태 문장과 같은 자리).
      chooseOne: "Choose at least one project.",
      step: (n: number): string => `Step ${n.toLocaleString("en-US")} of 2`,
      create: "Create",
      rotateConfirm: "Rotate and show new token",
      rotateWarning: "Rotating stops the current token immediately. Every agent using it stops until you paste the new one.",
      failed: "We couldn't create the token. Try again in a moment.",
    },
    result: {
      title: "Your token",
      // ⚠️ `<strong className="font-normal">` 자리다 — 모달 문맥의 강조이지 굵기가 아니다(design §8).
      copyNow: "Copy it now — it won't be shown again.",
      setEnv: "Set it as MALMOI_TOKEN in your shell, then add Malmoi to your agent — Connect an AI agent shows how.",
      done: "Done",
    },
    revoke: {
      title: "Revoke your token?",
      body: "Every agent using it stops immediately. This can't be undone.",
      confirm: "Revoke token",
    },
  },

  /**
   * `/oauth/authorize` — MCP 클라이언트의 로그인·동의 화면(mcp-oauth 핸드오프 §12). 셸 밖이다.
   * ⚠️ 권한·범위 문구는 여기 없다 — 토큰 발급 모달과 같은 `mcpConnector.form.*`·`grants.*`를 쓴다(spec 조건 4: 어휘가 같다).
   */
  oauthAuthorize: {
    title: "Connect an app to Malmoi",
    signInDescription: "Sign in to review what this app is asking for.",
    consentDescription: "Choose what it can do for you. You can disconnect it any time on the MCP connector page.",
    // 이름은 신원 보증이 아니다(design §6.1) — 배지 없이 카드 아래 한 문장이 말한다.
    appNameNote: "The app chose this name. Check the address before you continue.",
    clientId: (id: string): string => `Client ID ${id}`,
    returnsTo: (uri: string): string => `Returns to ${uri}`,
    signedInWith: (provider: string): string => `Signed in with ${provider}`,
    notYou: "Not you?",
    replaces: (date: string): string =>
      `You connected this app on ${date}. If you finish connecting, the new connection replaces it and the app may be signed out on your other devices. Deny keeps the current connection.`,
    denyFailed: "We couldn't record your answer. Nothing changed — try again.",
    consentNote:
      "In each project, the app can only do what your role there also allows. All my projects includes projects you join later, and projects the app creates are added to Chosen projects. The connection ends when it expires — connect again from the app to keep using it.",
    returnTo: (host: string): string => `You'll return to ${host}.`,
    deny: "Deny",
    authorize: "Authorize",
    failed: "We couldn't save this authorization. Your choices are kept — try again.",
    unconfirmed: "We couldn't confirm whether this went through. Check the request before you try anything else.",
    checkRequest: "Check request",
    sessionEnded: "You were signed out. Sign in again to continue — this request is still open.",
    ended: {
      notFound: { title: "We couldn't find this request", body: "The link may be incomplete. Go back to the app and connect to Malmoi again." },
      expired: { title: "This request expired", body: "Requests stay open for 10 minutes. Go back to the app and connect to Malmoi again." },
      used: {
        title: "This request was already answered",
        body: "It was authorized or denied earlier. Check the app — if it isn't connected, connect to Malmoi again from there.",
      },
      unavailable: { title: "We couldn't load this request", body: "Something went wrong on our side. The request may still be open — try again in a moment." },
      invalid: {
        title: "This app can't connect",
        body: "Malmoi couldn't verify where this request came from, so it stopped here. Nothing was shared with the app.",
      },
    },
  },

  newProject: {
    /** `formatLabel` — 어댑터 내부 이름을 화면에 쓰지 않는다 (PRODUCT §3). */
    formats: {
      "chrome-locales": { label: "Chrome extension messages", example: "_locales/{locale}/messages.json" },
      "json-catalog": { label: "JSON catalog", example: "src/locales/{locale}.json" },
      "yaml-catalog": { label: "YAML catalog", example: "config/locales/{locale}.yml" },
      "code-dict": { label: "Code dictionary (one file per language)", example: "src/locales/{locale}.ts" },
      "ts-dict": { label: "Code dictionary (all languages in one file)", example: "src/i18n/namespaces/*.ts" },
    },
    /**
     * 첫 적재 결과 헤드라인 — **0건이 아니면 성공 문구를 그대로 쓰지 않는다** (ARCHITECTURE §0 불변식 9).
     */
    imported: (count: number, failed: number): string =>
      failed === 0
        ? `Synced ${count === 1 ? "1 key" : `${count.toLocaleString("en-US")} keys`}.`
        : `Synced ${count === 1 ? "1 key" : `${count.toLocaleString("en-US")} keys`}, but ${failed.toLocaleString("en-US")} couldn't be read.`,

    /**
     * 모달 껍데기 (DESIGN §6.7). **[Back]·[Next]는 껍데기가 소유한다** — 단계는
     * 본문과 "다음으로 갈 수 있는가"만 넘긴다.
     */
    modal: {
      next: "Next",
      back: "Back",
      close: "Close",
      /** ⚠️ **스텝퍼를 세우지 않는다** — 네 칸이 누를 수 없는 장식이 된다. 진행은 이 한 줄이다. */
      step: (n: number): string => `Step ${n} of 4`,
    },

    /** 단계 넷의 제목·설명. 제목이 모달 머리로 올라가면서 각 단계의 `title` 키가 여기로 모였다. */
    steps: {
      repo: {
        title: "New project",
        description: "Pick a repository and the branch Malmoi should read.",
      },
      files: {
        title: "Which files hold your strings?",
        description: (n: number, repo: string, branch: string): string =>
          `${n === 1 ? "1 set" : `${n} sets`} matched on ${repo} · ${branch}. Check the keys before you continue.`,
        loading: (repo: string, branch: string): string => `Reading ${repo} · ${branch}…`,
        /** 예외 E — 후보 0개. ①로 되돌리지 않고 여기서 수동 지정을 편다. */
        emptyTitle: "Where are your translation files?",
        /**
         * ⚠️ **후보 0개에 "Check the keys before you continue"를 쓰지 않는다** (2026-09-13 실물).
         * 확인할 키가 없는 화면이 키를 확인하라고 말한다 — 설명은 **지금 할 일**(경로를 치면 확인해
         * 준다)을 말해야 한다 (핸드오프 3a).
         */
        emptyDescription: (repo: string, branch: string): string =>
          // ⚠️ **조건을 말한다** (malmoi#99) — 로케일 1개 리포에 "didn't find any"는 거짓이었다(파일은 있다).
          `Malmoi didn't find translation files in 2 or more languages on ${repo} · ${branch}. Set the path and it will check.`,
      },
      naming: {
        title: "Project details",
        description: "The base language decides which keys exist. Name and address come from the repository.",
      },
      result: {
        title: "Malmoi is ready",
        /**
         * ⚠️ **첫 문장이 야간 공지다** (launch-readiness L2.9 — 전에는 첫 PR이 예고 없이 왔다). nightly-sync(2026-09-30)부터 야간이
         * 양방향이라 둘 다 말한다: 미전달 편집이 있으면 PR, 없으면 리포의 새 커밋을 받는다(PRODUCT §4.1). "every night"는 참이다 —
         * `vercel.json` 하루 1회 · 프로덕션 배포에서만 · 대상은 `selectPullTargets`가 고른다.
         * ⚠️ **워크플로를 "계속 받으려면 필요한 것"으로 말하지 않는다** — 이제 커밋마다 받는 선택지다(PRODUCT §7.4).
         */
        description: "Every night, Malmoi sends translations not yet sent to the repository as a pull request, or picks up new commits. To pick up changes on every commit instead, add the push token and the workflow to the repository.",
      },
    },

    /**
     * ① 막힘 갈래 — 설치 전(A/B) · 리포 없음(C) · 승인 대기(D) · 재인가 (install-and-connect · DESIGN §6.7).
     * ⚠️ **제목은 마침표 없는 짧은 구, 설명은 한 문장이다** (DESIGN §6.4·§10).
     */
    empty: {
      /** Authorize 왕복의 버튼 둘 — `add-surface`도 쓴다. ① 설치 전(A)은 `GITHUB_APP_SLUG`가 없을 때만 이 버튼이다. */
      connect: {
        action: "Authorize GitHub App",
        reauthorize: "Reauthorize GitHub App",
      },
      install: {
        title: "Connect your repositories",
        description: "Install the Malmoi GitHub App on your account or organization to choose repositories.",
        action: "Install GitHub App",
        /** A에만 선다 — 이미 조직에 설치돼 있어 연결만 필요한 사람의 길이다. */
        installed: "Already installed on your organization?",
        connect: "Connect your account",
      },
      repos: {
        title: "Add a repository",
        description: "Choose which repositories the Malmoi GitHub App can access.",
        action: "Choose repositories",
      },
      /**
       * 설치 **요청** 뒤 (`Account.installRequestedAt`). ⚠️ **설치 화면 제목이 여기 서지 않는다** — 요청자는
       * 설치할 수 없고, 설치 링크를 다시 누르면 요청이 한 번 더 간다.
       */
      waiting: {
        title: "Waiting for approval",
        description: "An organization owner has to approve your request to install the Malmoi GitHub App.",
        action: "Try again",
        otherAccount: "Install on a different account",
        /** [Try again] 뒤 아직이면 — live region이 읽는다. 승인됐으면 목록이 선다. */
        still: "Still waiting for approval.",
        /** 다른 설치로 리포가 이미 보일 때 목록 위 한 줄 — 위 설명과 같은 사실이다. */
        info: "An organization owner still has to approve your install request.",
      },
      /**
       * 프로젝트 상한 (launch-readiness L2.6). ⚠️ **[New project]를 끄지 않고 여기서 말한다** — 사유 없는 `disabled`는
       * 0건이어야 하고(DESIGN §6.646), 상한은 ③ 끝이 아니라 들어오는 순간 아는 값이다. 보관이 자리를 비운다.
       */
      limit: {
        title: "Project limit reached",
        description: (limit: number): string => `You own ${limit.toLocaleString("en-US")} projects, the most you can have. Archive one to make room.`,
        action: "Go to your projects",
      },
      reconnect: {
        title: "Reconnect GitHub",
        description: "Authorize the Malmoi GitHub App again to see your repositories.",
      },
      /** ⚠️ `GITHUB_APP_SLUG`가 없으면 설치 링크를 세울 수 없다 — 그때 할 수 있는 일을 말한다. */
      noLink: "Ask your administrator to install the Malmoi GitHub App and grant access to the repository.",
      listFailed: "We couldn't load your repositories.",
    },

    /** ② 리포 고르기 */
    repo: {
      /** 리포 목록의 그룹 이름 — `RadioGroup`이 접근 이름 없이 서면 "라디오 그룹"으로만 읽힌다. */
      list: "Repositories",
      search: "Find a repository by name",
      /** 상대 시각은 `lib/relative-time.ts`가 만든다 — 사전은 그것을 감쌀 뿐이다. */
      pushedAt: (rel: string): string => `Pushed ${rel}`,
      branch: "Branch",
      branchHelp: "Malmoi reads the translation files from this branch. You can change it later in Settings.",
      /** 예외 D — 목록 조회만 실패했다. **"브랜치가 없다"가 아니다** (POSTMORTEM 2026-09-03). */
      branchDefault: "Using the repository's default branch.",
      branchTooMany: "This repository has too many branches to list — type the branch name.",
      notListed: "Don't see a repository?",
      loading: "Looking for repositories with the Malmoi GitHub App installed…",
      /**
       * 예외 B′ — **예외 B(설치에 리포 없음)와 가른다.** 요구하는 일이 다르다: 검색어를 지워라 /
       * 설치에 리포를 넣어라 (DESIGN §6.7).
       */
      searchEmpty: (q: string): string => `No repository matches "${q}".`,
      clearSearch: "Clear search",
    },

    /** ③ 후보 · 기준 언어 · 수동 지정 */
    files: {
      /** ② 좌측 후보 목록의 그룹 이름. */
      candidates: "Translation file candidates",
      /** ② 좌 후보 목록 ↔ 우 미리보기 구분선 — `common.resizeSidebar`와 같은 이유로 이름이 필요하다. */
      resize: "Resize file list",
      include: (path: string) => `Include ${path}`,
      previewCandidate: (path: string) => `Preview ${path}`,
      conflicts: "These selections write to the same files. Uncheck a selection to continue.",
      keys: (n: number): string => (n === 1 ? "1 key" : `${n.toLocaleString("en-US")} keys`),
      /** ② 좌측 후보 행의 보조 줄 — 폭 240이라 로케일 코드를 나열할 자리가 없다. */
      summaryShort: (locales: number, keys: string): string => `${locales} languages · ${keys}`,
      notListed: "Not listed?",
      setPath: "Set the path yourself",
      /** ② 우측 키·값 표. */
      preview: {
        key: "Key",
        value: "Value",
        more: (n: number): string => (n === 1 ? "1 more key" : `${n.toLocaleString("en-US")} more keys`),
        language: "Language",
        /** ⚠️ **키 수를 아는 언어만** 두 번째 조각을 받는다 (결정 ⑥⑦). */
        option: (code: string, keys: string | undefined): string => (keys === undefined ? code : `${code} · ${keys}`),
        none: "Nothing to preview yet",
        /**
         * ⚠️ **시안(3a)에 있던 설명이 2026-09-13까지 빠져 있었다** — `preview.none`이 처음 들어올
         * 때부터 제목만이었고(eeff006), 우측이 제목 한 줄만 든 채로 "지금 뭘 해야 하나"를 아무도
         * 말하지 않았다. 뒷문장이 좌측 `manual.hint`와 겹쳤으므로 **그쪽에서 뺐다** — 같은 문장을
         * 화면에 두 번 두지 않는다.
         */
        noneDescription: "Set a path and Malmoi will show the keys it finds. If no file matches, the project isn't created.",
        /** 키 행만 스크롤하는 영역의 이름 — 그 안에 포커스 가능한 것이 없어 컨테이너가 직접 받는다. */
        rows: "Preview rows",
        /**
         * ⚠️ **빈 칸과 가른다.** 정말 비어 있으면 빈 칸이고, 못 읽었으면 이 문장이다 — ②가
         * "ko 열이 비어 있다"를 말하는 화면이라 이 구별이 기능의 목적 자체에 걸린다 (DESIGN §6.7).
         */
        unavailable: "We couldn't read this file.",
      },
      manual: {
        format: "File format",
        path: "Path",
        /**
         * 문장을 사전이 소유한다 — 노드로 쪼개면 ko가 어순을 바꿀 수 없다 (CLAUDE.md 코드 컨벤션).
         *
         * ⚠️ **갈래가 어댑터의 `layout`이다** — multi-locale(`ts-dict`)은 한 파일에 로케일이 나란히
         * 있어 경로에 로케일이 없다. 한 문장으로 두면 그 포맷에서 틀린 안내가 되고, 그것이
         * 903키 딕셔너리로 가는 **유일한 길**이다(자동 탐지에서 빠져 있다 — ARCHITECTURE §1.9 판정 ③).
         * 갈래 누락은 소비자가 거는 `satisfies Record<Layout, …>`가 잡는다.
         */
        pathHint: {
          "per-locale": (token: ReactNode): ReactNode => <>The {token} placeholder is where the language goes.</>,
          "multi-locale": (token: ReactNode): ReactNode => (
            <>This format keeps every language in one file, so the path takes no language placeholder — use {token} to match the files.</>
          ),
        },
        baseLocale: "Base language",
        /** ⚠️ 뒷문장("If no file matches…")은 **우측 빈 상태**가 든다 — 둘 다 두면 한 화면에 두 번이다. */
        hint: "Setting a path clears the selection above.",
      },
    },

    baseLocale: {
      /**
       * ③ 기준 언어 행의 보조 줄 — 경로와 키 수. ⚠️ **키 수는 아는 언어에만** 붙는다(결정 ⑦):
       * 모르는 언어에 숫자를 지어내면 되돌릴 수 없는 결정의 근거가 거짓이 된다.
       */
      row: (path: string, keys: string | undefined): string => (keys === undefined ? path : `${path} · ${keys}`),
      title: "Base language",
      hint: "This language's file decides which keys exist. Pick the wrong one and keys that live only in another language are left out.",
    },

    /** ④ 이름·주소 */
    naming: {
      name: "Name",
      slug: "Address",
      /**
       * 문장이 링크·mono 조각 둘을 물고 있어 노드를 받는다.
       *
       * ⚠️ **캡션 안에서 굵게 "보이지" 않는다** (2026-09-13 사용자). 필드 아래 설명은 13px 한
       * 덩어리라 굵기를 섞으면 그 조각이 **제목처럼** 읽혀 라벨과 경쟁한다 — 보이는 강조는 색까지다.
       * ⚠️ **그래도 `<strong>`은 남긴다**: 요청은 굵기였지 시맨틱이 아니었고, 이 문장은 **되돌릴 수
       * 없음**을 말한다. 색만 남기면 스크린리더가 평평하게 읽고 고대비 모드에서도 사라진다
       * (`LocaleBadge`가 색에 `sr-only`를 딸려 보내는 것과 같은 규칙 — DESIGN §7).
       */
      hint: (address: ReactNode, branch: ReactNode): ReactNode => (
        <>
          Opens at {address}. Translations come back as a pull request on {branch}.{" "}
          <strong className="text-foreground font-normal">The address can't be changed later.</strong>
        </>
      ),
      create: "Create project",
      creating: "Creating project and syncing all selected files…",
      nothingCreated: "Nothing was created.",
      resultUnknown: "We couldn't confirm the result. Check your project list before trying again. If the project exists, generate a new push token in Settings.",
      failedSurface: (path: string, failed: number) => `${path}: ${failed.toLocaleString("en-US")} sync issues.`,
      /** ③ info — **읽기 전용임을 말한다.** 리포에 아무것도 쓰지 않는다(불변식). */
      info: (path: string, branch: string): string =>
        `Creating the project reads ${path} on ${branch} once. Nothing is written back to the repository.`,
      mostKeys: "Most keys",
      /**
       * 접힌 기준 언어 목록의 옵션 하나 (2026-09-13). ⚠️ **조각을 화면에서 잇지 않는다** — 그러면
       * `·`가 소스 리터럴이 되고 ko를 더할 때 어순을 못 바꾼다. 키 수와 배지는 **아는 언어에만**
       * 붙으므로 둘 다 선택이다 (결정 ⑥⑦).
       */
      baseOption: (code: string, keys: string | undefined, mostKeys: boolean): string =>
        [code, keys, mostKeys ? "Most keys" : undefined].filter((part) => part !== undefined).join(" · "),
      /** ⚠️ **키 수를 아는 언어에만 선다** (결정 ⑦). `keyGap`이 `undefined`면 화면이 이 문장을 뺀다. */
      keyGap: (lang: string, n: number, base: string): string =>
        `${lang} has ${n.toLocaleString("en-US")} keys fewer than ${base}. Those keys would be left out if ${lang} led.`,
      /**
       * 예외 G — 제출 뒤 그 필드에 선다.
       *
       * ⚠️ **`is free`라고 단언하지 않는다** — `suggestAlternateSlug`는 존재 확인을 하지 않는다.
       * 확인한 적 없는 것을 단언하면 POSTMORTEM 2026-09-09의 모양이다.
       */
      slugTaken: (alt: string | undefined): string =>
        alt === undefined
          ? "That address is already in use. Try another."
          : `That address is already in use. Try another, such as ${alt}.`,
      /** `planSlug`의 나머지 갈래 넷 — **클라이언트 판정이라 왕복이 0이다.** */
      slugEmpty: "Pick an address.",
      slugFormat: "An address can use lowercase letters, numbers, '-', '.' and '_'.",
      slugTooLong: (max: number): string => `An address can be up to ${max} characters.`,
      /** ⚠️ **`new`가 여기다** — 그 예약의 근거가 바로 이 라우트다 (PRODUCT §7.7). */
      slugReserved: "That address is reserved.",
    },

    /**
     * 예외 J — 전 단계 공통. **모달을 닫지도 `router.refresh()`를 부르지도 않는다**: 모달이 클라이언트
     * 상태를 들고 있어 씻기면 ①~③의 입력이 통째로 사라진다 (POSTMORTEM 2026-09-08).
     */
    errors: {
      sessionLost: "Sign in again and come back — nothing has been created.",
      sessionLostAfterCreate: "Sign in again and come back — your project is still in your list.",
    },

    /** ⑤⑥ 결과 — **토큰 원문은 이 화면에서만 보인다** (PRODUCT §7.8). */
    result: {
      token: {
        title: "Push token",
        /**
         * ⚠️ **굵게 "보이지" 않되 `<strong>`은 남긴다** (2026-09-13 사용자 + 리뷰). 토큰이 한 번만
         * 보인다는 경고라 색만으로 말하면 스크린리더에서 사라진다.
         */
        description: (secret: ReactNode): ReactNode => (
          <>
            Add this to the repository's Actions secret {secret}.{" "}
            <strong className="text-foreground font-normal">You won't see it again after you leave this page.</strong> If you lose it,
            rotate it in Settings.
          </>
        ),
      },
      ingest: {
        retry: "Try again",
        refsHint: "Code references arrive after your CI workflow first runs. You can start translating now.",
        // 목적지(프로젝트 Home)를 말한다 — 2026-09-29 전엔 번역 화면으로 가는 "Start translating"이었다.
        open: "Open project",
      },
      workflow: {
        saveAs: "Save as",
      },
      failed: "We couldn't finish. Try again in a moment.",
    },
  },

  translations: {
    /** ⚠️ **골격은 `aria-hidden`이라 이 한 줄이 유일한 안내다** (audit-ux #5 — `m.home.loading`과 같은 형). */
    loading: "Loading translations…",
    /** 카운터 — ICU가 아니라 삼항 하나다 (PRODUCT §4.2). */
    keys: (n: number): string => (n === 1 ? "1 key" : `${n.toLocaleString("en-US")} keys`),

    /**
     * **세 패널 작업 화면** (translation-rework — 핸드오프 README §12). 옛 표 화면의 문구(`filters`·`chips`·`save`…)는
     * 그 화면을 걷어내는 C5(T16)까지 남는다 — 두 벌이 공존하는 동안 이 절만 새 화면이 읽는다.
     * ⚠️ 주체를 단정하지 않는다: 다른 멤버나 cron도 Publish하므로 `you last sent`가 아니라 **the version last confirmed as sent**다.
     */
    workspace: {
      filters: {
        completion: { axis: "Completeness", all: "All keys", incomplete: "Incomplete", missingIn: (locale: string): string => `Untranslated in ${locale}`, missingMenu: "Untranslated in…", complete: "Complete" },
        state: { axis: "State", any: "Any state", unsent: "Unsent", review: "Needs review", new: "New from GitHub", newHint: "Keys that arrived after Malmoi last confirmed your files." },
        scope: { axis: "Scope", namespace: "This namespace", source: "This source", project: "All sources" },
        clear: "Clear filters",
        search: "Search keys",
        substituted: (source: string, locale: string): string => `${source} has no ${locale}. Showing incomplete keys instead.`,
        nothingToFilter: "Nothing to filter yet",
      },
      tree: { title: "Sources", allNamespaces: "All namespaces", filter: "Filter namespaces", open: "Show sources" },
      /** 키 목록 ↔ 로케일 카드 구분선 — `common.resizeSidebar`와 같은 이유로 이름이 필요하다(이름 없는 separator는 스크린리더가 "구분선"만 읽는다). */
      resize: "Resize key list",
      list: {
        keys: "Keys",
        incompleteKeys: "Incomplete keys",
        incompleteFirst: "Incomplete first",
        savedExtra: (n: number): string => `+${n.toLocaleString("en-US")} saved`,
        missing: (n: number): string => `${n.toLocaleString("en-US")} untranslated`,
        complete: "Complete",
        notSent: "Unsent",
        needsReview: "Needs review",
        saved: "Saved",
      },
      detail: {
        languages: (filled: number, total: number): string => `${filled.toLocaleString("en-US")} of ${total.toLocaleString("en-US")} languages`,
        allLanguages: "All languages",
        missingOnly: "Untranslated only",
        languagesGroup: "Languages",
        source: "Source",
        notSaved: "Not saved",
        /** ⚠️ **버튼 라벨이 아니라 셀의 상태 글자다** (audit-ux #20 · D4) — 보낸 셀에 "Not saved"가 계속 붙어 있었다. D1(버튼 문구 고정)의 대상이 아니다. */
        saving: "Saving…",
        missing: "Untranslated",
        noDescription: "No description in the code",
        noCommit: "No commit to link to yet",
        referenced: (n: number): string => `Referenced in ${n.toLocaleString("en-US")} places`,
        copyLink: "Copy link",
        copied: "Copied",
        copyFailed: "Couldn't copy",
        selectKey: "Select a key to translate",
        selectKeyBody: "Its translations in every language open here.",
        keyGone: (source: string): string => `This key is no longer in ${source}`,
      },
      footer: {
        unsaved: (n: number): string => `${n.toLocaleString("en-US")} unsaved change${n === 1 ? "" : "s"}`,
        saved: "Saved",
        savedNotSent: "Saved · unsent",
        savedSince: (n: number): string => `Saved · ${n.toLocaleString("en-US")} change${n === 1 ? "" : "s"} since you pressed Save`,
        save: "Save",
        tryAgain: "Try again",
        saveFailed: { title: "We couldn't save this key", body: "Your text is still here. Try again, or save it in a moment." },
        saveUnknown: { title: "We couldn't confirm the save", body: "Your text is still here. Check the current values before saving again." },
        /**
         * 수술적 표면의 비-base 비우기 거부 (delivery-invariants D2). "revert"를 쓰지 않는다 — `Revert to last sent`는 OWNER 전용이고
         * 미저장 변경이 있으면 막힌다. "discard"는 이 화면이 이미 쓰는 어휘다. ⚠️ 명시적 빈값 export(PRODUCT §10)가 생기면 사라질 문구다.
         */
        cannotClear: {
          title: (locales: string): string => `${locales} can't be left empty`,
          body: "This file format can't remove a translation, so nothing was saved. Enter a value, or discard the change.",
        },
        /** ⚠️ **Alert 제목 자리다** — 구두점 없는 문장 조각 (DESIGN §10 · audit #30). */
        archived: "This project is archived — editing is off",
        lostAccess: "You no longer have access to this project",
        /**
         * 다시 해도 안 풀리는 저장 거부 둘 (audit #23) — 전엔 `saveFailed`("Try again")로 접혔다.
         * `key-unavailable`은 리포에서 키가 빠졌거나 이 소스 밖으로 옮겨진 것이고, `not-ready`는 첫 Sync 전이다.
         */
        keyGone: "This key is no longer available. Copy your text, then reload the page.",
        notReady: "This project hasn't finished its first sync. Your text is still here — save it after the sync.",
        session: {
          title: "Your session ended",
          body: "Sign in again in this tab. The text you typed stays on screen until you do.",
          signIn: "Sign in",
          restored: (n: number): string => `Signed back in · ${n.toLocaleString("en-US")} unsaved change${n === 1 ? "" : "s"} restored`,
          storageBlocked: "Copy your text before you sign in — this browser isn't keeping it for you.",
        },
      },
      revert: {
        button: "Revert to last sent",
        title: "Revert to the last confirmed version?",
        body: (n: number, list: string): string =>
          `Your unsent edits in ${n.toLocaleString("en-US")} language${n === 1 ? "" : "s"} — ${list} — go back to the version last confirmed as sent. What you saved since then is discarded.`,
        confirm: "Revert translations",
        unavailable: "The last sent version isn't available for every changed language.",
        unsaved: "Save or discard your changes first.",
        busy: "This stays off while a save, publish, or sync is running.",
        forbidden: "Only project owners can revert to a sent version.",
        failed: { title: "We couldn't revert this key", body: "No changes were made. Try again, or check the last sync." },
        unknown: { title: "We couldn't confirm the revert", body: "The revert may have completed. Check the current values before trying again.", check: "Check current values" },
        changed: { title: "The values changed while this was open", body: "Someone saved new values for this key. Look at them before you revert — this dialog no longer matches what is saved.", again: "Review again" },
        reverted: "Reverted to the version last confirmed as sent",
      },
      sync: { ownerOnly: "Only project owners can sync." },
      publish: {
        title: "Publish without saving your changes?",
        body: (project: string, list: string, key: string, n: number): string =>
          `Publish sends every saved value in ${project}. Your unsaved ${list} translation${n === 1 ? "" : "s"} of ${key} — ${n.toLocaleString("en-US")} language${n === 1 ? "" : "s"} — stay here as drafts.`,
        keep: "Keep editing",
        preview: "Preview saved changes",
      },
      discard: {
        title: "Discard your changes?",
        body: (key: string, list: string, n: number): string =>
          `Your unsaved ${list} translation${n === 1 ? "" : "s"} of ${key} (${n.toLocaleString("en-US")}) will be lost.`,
        keep: "Keep editing",
        discard: "Discard changes",
        leave: "Leave and discard",
      },
      empty: {
        noIncomplete: (ns: string): string => `No incomplete keys in ${ns}`,
        noMatch: (q: string): string => `No keys match "${q}"`,
        noIncompleteMatch: (q: string): string => `No incomplete keys match "${q}"`,
        filteredOut: "No keys match these filters",
        showAll: (n: number): string => `Show all ${n.toLocaleString("en-US")} keys`,
        searchAll: "Search all sources",
        clearSearch: "Clear search",
        noKeys: (ns: string): string => `No keys in ${ns}`,
        noActive: "No active keys in this project",
      },
    },

    cellLabel: (key: string, locale: string): string => `${key} · ${locale}`,

    banner: {
      /**
       * 리포 갱신 보류 (sync-edit-protection T13). **손실을 예고하지 않는다** — 미전달 편집이 있으면 CI 적재가 보류되므로 편집은
       * 사라지지 않는다. 멈춘 사실과 푸는 조건(보내기)만 말한다. ⚠️ `can be lost`·`automatically`를 되살리지 않는다.
       */
      paused: (n: number): string =>
        `Repository updates are held until ${n.toLocaleString("en-US")} unsent edit${n === 1 ? " is" : "s are"} sent.`,
      /** 헤더의 Publish 버튼으로 포커스를 옮긴다 — 둘째 트리거가 아니다. 화살표 글리프가 방향을 든다. */
      sendWithPublish: "Send with Publish",

      /**
       * 기준 로케일 변경 대기 (6b-3 — DESIGN §6.1). **"먼저 보내라"만 말한다.**
       *
       * ⚠️ **검토 표시를 예고하지 않는다** — `planPush`가 base 교체 push에서 전파를 건너뛰므로 그
       * 일이 안 일어난다. 둘을 말하면 무엇을 해야 하는지가 흐려진다.
       *
       * ⚠️ **트리거를 이름으로 댄다** (malmoi#127) — "the next sync from the repository"는 옆의 [Sync]로 읽혔고, 그 버튼은 저장된 기준
       * 언어로 읽어 선언을 적용하지 않는다. "push"는 번역자 문구에 쓰지 않으므로(DESIGN §10.1) 워크플로의 Sync라고 말한다.
       *
       * ⚠️ **로케일 코드를 그대로 보인다** — 사람이 읽는 이름이 없다(`Locale.name`이 코드와 같게
       * 심긴다). 지어내면 리포의 파일명과 갈린다.
       */
      basePending: (locale: string): string =>
        `The base language is changing to ${locale}. ` +
        "It switches on the next sync from your repository's GitHub Actions workflow — the Sync button doesn't apply it. " +
        "That sync waits while there are unsent edits, so publish them first.",
    },

    empty: {
      /** 첫 적재 전. OWNER는 설정으로 보내므로 이 문구를 읽는 사람은 번역자다 (PRODUCT §7.5). */
      notReady: "Nothing to translate yet",
      noKeys: {
        description: "Strings your developers add to the repository show up here after the next sync.",
      },
    },

    /**
     * Publish 모달 — 한 동작의 끝 열하나가 이 사전을 지난다
     * (Claude Design `design_handoff_publish_modal` §12가 문구의 정본이다).
     *
     * ⚠️ **같은 뜻의 두 문장을 남기지 않는다.** 옛 Alert 어휘(`created`·`updated`·`partial`·
     * `dropped`·`failed`·`gate`)는 전부 여기서 대체됐다 — 되살리면 한 사실을 두 문장이 말한다.
     *
     * ⚠️ **git 어휘를 쓰는 자리가 생겼다** (2026-09-16 사용자 확정 — 열린 결정 5). 읽는 사람은
     * 비개발자 동료지만 **전달해야 할 값이 PR 번호**라, 그 번호를 부르는 이름이 GitHub에서 보는
     * 이름과 달라지면 전달이 끊긴다. `viewLink`는 번역 화면 머리의 "Last sent" 링크와 공유한다.
     *
     * ⚠️ **`30`을 문자열에 박지 않는다** — 대기 간격은 `PUBLISH_MIN_INTERVAL_SECONDS`가 정본이고
     * 서버가 준 `retryAfterSeconds`가 버튼 라벨을 든다. 화면이 상수를 따로 들면 둘이 갈린다.
     */
    publish: {
      button: "Publish",
      /** 버튼·표면 선택기 안 개수 배지의 sr 문장 — 산문의 명사는 "unsent edit(s)"다(DESIGN §2.4). */
      unsentCount: (n: number): string => `${n.toLocaleString("en-US")} ${n === 1 ? "unsent edit" : "unsent edits"}`,
      viewResult: "View result",
      viewLink: "View pull request",
      nothing: "Nothing to send — every edit is already sent.",
      paused: "Publishing is currently unavailable.",

      /** `1a` — 우회 없는 필수 관문. 조회 중에도 같은 제목·같은 PR 줄이 선다. */
      previewTitle: (n: number): string => `Publish ${n.toLocaleString("en-US")} ${n === 1 ? "change" : "changes"}`,
      previewIntro: (repo: string): string =>
        `Everything you've edited goes to ${repo} as one pull request.`,
      /** 보류가 섞인 미리보기 (#84) — "전부 간다"가 거짓이다. 빠지는 편집은 표 아래 줄이 사유별로 말한다. */
      previewIntroPartial: (repo: string): string =>
        `The edits that can be sent go to ${repo} as one pull request.`,
      /**
       * base와 같은 값의 편집 (B1 r3) — 파일을 바꾸지 않는다. 열린 PR이 있으면 그 PR의 변경을 되돌리는 것이고, 전부 그렇다면 실행이 그 PR을 닫는다.
       */
      same: {
        undoes: (n: number): string => `Undoes the change in #${n}`,
        already: "Already in the repository",
        closesTitle: (n: number): string => `Publishing closes pull request #${n}`,
        closesBody: (n: number, branch: string): string =>
          `Every edit here matches ${branch} again, so #${n} has nothing left to merge. Malmoi closes it with a comment saying why.`,
        closeAction: (n: number): string => `Close pull request #${n}`,
        nothingTitle: (branch: string): string => `Nothing differs from ${branch}`,
        nothingBody: "Every edit here already matches the repository, so no pull request opens. Publishing marks them as sent.",
        action: "Publish",
      },
      /** 전부 보류 (#84) — 만들거나 바꿀 PR이 없으니 그 버튼을 두지 않는다. */
      nothingSendable: {
        title: "Nothing can be sent yet",
        body: "Every unsent edit is waiting for its language file or key, so no pull request would change.",
      },
      previewCounts: (n: number, keys: number): string =>
        `${n.toLocaleString("en-US")} ${n === 1 ? "change" : "changes"} in ${keys.toLocaleString("en-US")} ${keys === 1 ? "key" : "keys"}.`,
      previewSummary: (n: number, keys: number, files: number): string =>
        `${n.toLocaleString("en-US")} ${n === 1 ? "change" : "changes"} \u00b7 ${keys.toLocaleString("en-US")} ${keys === 1 ? "key" : "keys"} \u00b7 ${files.toLocaleString("en-US")} ${files === 1 ? "file" : "files"}`,
      changes: (n: number): string => `${n.toLocaleString("en-US")} ${n === 1 ? "change" : "changes"}`,
      /**
       * 편집 없이 바뀌는 파일 (#128) — 실행이 DB의 현재 상태로 다시 쓰는 파일이다. 원인 둘(코드에서 지운 키의 줄이 빠진다 · 머지되지 않은 앞선 PR의
       * 값이 다시 나간다)을 말하고 줄 단위 diff는 약속하지 않는다 — 셀 단위 표에 그 줄이 없다.
       */
      otherFile: {
        label: "No unsent edits",
        body: "This file is rewritten from Malmoi's current translations. Keys removed from the code drop out, and values from an earlier pull request that wasn't merged go out again.",
      },
      fileSummary: (n: number, keys: number): string =>
        `${n.toLocaleString("en-US")} ${n === 1 ? "change" : "changes"} \u00b7 ${keys.toLocaleString("en-US")} ${keys === 1 ? "key" : "keys"}`,
      key: "Key",
      locale: "Language",
      value: "Value",
      /**
       * ⚠️ **화면에는 `−`/`+` 글리프뿐이라 낭독에 아무것도 안 남는다** (2026-09-16 CDP 실측).
       * 글리프는 `aria-hidden`이고 이 두 줄이 그 자리를 대신한다 — 시안의 모양은 그대로 두고
       * 뜻만 접근성 트리에 돌려준다.
       */
      beforeLabel: "In the repository",
      afterLabel: "Your edit",
      /** 상한은 미리보기 페이로드에만 걸린다 — 발송 범위는 전부다. */
      truncated: (n: number): string =>
        `${n.toLocaleString("en-US")} more aren't listed here. Publishing sends all of them.`,
      /** 수술적 어댑터의 원본 파일이 없어 pull이 안 쓰는 셀 — 표에서 뺐다 (launch-readiness L3.7). 편집은 DB에 남는다. */
      withoutFile: (n: number): string =>
        `${n.toLocaleString("en-US")} ${n === 1 ? "edit isn't" : "edits aren't"} listed because the language file isn't in the repository yet. ${n === 1 ? "It stays" : "They stay"} here until the file exists.`,
      /**
       * ts-dict 로케일 객체에 자리가 없는 키의 셀 — pull이 그 셀만 보류한다 (delivery-invariants D3 · audit #1). `withoutFile`과 같은 약속이다.
       * ⚠️ **원인을 말하지 않는다**("yet") — 아직 안 생긴 키와 코드에서 지워진 키가 같은 판정(`keySlot`)을 지난다(B3 r1).
       */
      withoutKey: (n: number): string =>
        `${n.toLocaleString("en-US")} ${n === 1 ? "edit isn't" : "edits aren't"} listed because ${n === 1 ? "its key isn't" : "their keys aren't"} in the language file. ${n === 1 ? "It stays" : "They stay"} here until the file has ${n === 1 ? "the key" : "those keys"}.`,
      /**
       * 결과의 보류 줄 (delivery-invariants D7) — 미리보기 `withoutFile`·`withoutKey`와 **같은 명사·같은 약속**이다. 역할 갈림은 화면에 있는
       * 컨트롤만 가리킨다: EDITOR에게는 `Revert to last sent`가 없다.
       */
      withheld: {
        file: (n: number): string =>
          `${n.toLocaleString("en-US")} ${n === 1 ? "edit wasn't" : "edits weren't"} sent because the language file isn't in the repository. ${n === 1 ? "It stays" : "They stay"} here until the file exists.`,
        key: (n: number): string =>
          `${n.toLocaleString("en-US")} ${n === 1 ? "edit wasn't" : "edits weren't"} sent because ${n === 1 ? "its key isn't" : "their keys aren't"} in the language file. ${n === 1 ? "It stays" : "They stay"} here until the file has ${n === 1 ? "the key" : "those keys"}.`,
        editor: "Ask a project owner.",
        owner: {
          file: "Add the file to the repository, or use Revert to last sent.",
          // 코드에서 지운 키(B3.4)도 이 줄이다 — 되돌리기가 먼저이고, 키를 "다시" 넣는 것은 둘째다(B3 r3).
          key: "Use Revert to last sent, or add the keys back to the language file.",
          /** 보류 셀 중 되돌릴 기준이 없는 것이 있다(#129) — 그 셀의 Revert는 꺼져 있으므로 가리키지 않는다. 폐기는 Home의 Sync 승인이다. */
          fileNoRevert: "Add the file to the repository, or discard the edits with Sync.",
          keyNoRevert: "Add the keys back to the language file, or discard the edits with Sync.",
        },
      },

      /** 열린 PR 삼상태 — `null`로 접지 않는다. "없다"와 "모른다"는 다른 줄이다. */
      prOpen: {
        title: (n: number): string => `#${n} is open \u2014 this replaces what it holds`,
        body: (n: number, changes: number): ReactNode => (
          <>
            A second pull request isn&apos;t opened. #{n} will hold{" "}
            <span className="text-foreground">everything unsent</span>, not just{" "}
            {changes === 1 ? "this one" : `these ${changes.toLocaleString("en-US")}`}, and anyone
            reviewing it will see it change.
          </>
        ),
      },
      prNone: {
        title: (repo: string): string => `A new pull request opens on ${repo}`,
        body: (changes: number): string =>
          changes === 1
            ? "Nothing is open right now, so this change goes out on its own."
            : `Nothing is open right now, so these ${changes.toLocaleString("en-US")} changes go out on their own.`,
      },
      prUnknown: {
        title: "Couldn't check for an open pull request",
        body: "If one is already open, publishing replaces what it holds instead of opening a second one.",
      },
      openPr: "Open pull request",
      replacePr: (n: number): string => `Replace pull request #${n}`,

      /**
       * `1c` — 단계 셋은 **하는 일의 목록**이고 진행 표시가 아니다 (audit-ux #23). 전엔 2.5초·6.5초 타이머가 체크를 넘겼는데,
       * 진행 이벤트 API가 없어 일어나지 않은 단계를 주장했다. 오래 걸리면 `common.slow`가 선다.
       */
      progressTitle: (n: number): string => `Publishing ${n.toLocaleString("en-US")} ${n === 1 ? "change" : "changes"}`,
      progressDescription:
        "Writing the translation files and opening a pull request. This usually takes a few seconds.",
      progress: (branch: string): readonly string[] => [
        "Rendering the translation files",
        `Committing to ${branch}`,
        "Opening the pull request",
      ],
      leave: "Leaving this page won't stop it.",

      /** `1d` — 새 PR. **"Published"가 아니다** — 머지 전까지 제품에 닿지 않는다. */
      created: "Sent for review",
      createdDescription: (n: number): string =>
        `${n.toLocaleString("en-US")} ${n === 1 ? "change is" : "changes are"} in a pull request. ${n === 1 ? "It reaches" : "They reach"} the product once someone on the team merges it.`,
      prMeta: (n: number, files: number): string =>
        `Pull request #${n} \u00b7 ${files.toLocaleString("en-US")} ${files === 1 ? "file" : "files"} changed`,
      openedJustNow: "Opened just now",
      holdsEverything: "Holds everything unsent",
      prState: "Open",
      accessNote:
        "Editing or closing this pull request happens on GitHub. If you don't have access there, ask a project owner.",

      /** `1e` — 열려 있던 PR이 갱신됐다. 승인 무효는 말하지 않는다(그 설정을 읽지 않는다). */
      updated: "Your earlier pull request now holds this",
      updatedDescription: (n: number, changes: number): string =>
        `#${n} was still open, so Malmoi replaced its contents instead of opening a second one. It now holds everything unsent, not just ${changes === 1 ? "today's one" : `today's ${changes.toLocaleString("en-US")}`}.`,
      replacedTitle: "The branch was replaced, not added to",
      replacedBody: (branch: string, base: string): ReactNode => (
        <>
          {branch} always holds{" "}
          <span className="text-foreground">one commit off {base}</span>, so this pull request is a
          snapshot of everything unsent — not a history of what was added since.
        </>
      ),
      tellReviewer: (n: number): string =>
        `If #${n} has been waiting a while, it may be worth telling the reviewer it changed.`,

      /** `1f` — 파일이 같았다. `1b`와 다른 상태이고 실패가 아니다. */
      noChanges: "Nothing changed in the files",
      noChangesDescription:
        "Your edits were already in the repository, so no pull request was needed.",
      noChangesBody: (branch: string): ReactNode => (
        <>
          Malmoi compared what it would write against{" "}
          <span className="text-foreground">{branch}</span> and the two came out identical. This
          happens when the same values were synced from the repository, or when an edit was undone
          before sending.
        </>
      ),
      inLogs: "It is recorded in Logs as a run with nothing to send.",
      close: "Close",

      /**
       * `1g` — 버려진 값. **펼친 목록**이다(불변식 9).
       * ⚠️ **보내지 않았다** (sync-edit-protection T10, 2026-09-18) — 전에는 PR을 열고 버린 값을 알렸지만("Sent for review — some
       * values were left out"), 이제 writer 경고가 있으면 GitHub에 쓰기 전에 멈춘다. 편집은 malmoi에 남고 리포 갱신도 계속 멈춰 있다.
       */
      notSent: "Held back \u2014 some values can't be written to the files",
      notSentDescription:
        "Malmoi stopped before writing to the repository, because these values would have been left out. Your edits are still saved here.",
      /**
       * no-changes 실행이 닫은 열린 PR (B1 r3). 렌더가 base와 같아 그 PR에 남은 차이가 없다 — 조용히 닫히게 두지 않고 이유를 말한다.
       * 역할 갈림은 화면에 있는 컨트롤만 가리킨다(DESIGN §10.1): EDITOR에게는 되돌릴 컨트롤이 없으니 a project owner를 가리킨다.
       */
      closedPr: {
        description: (branch: string): string => `Your edits now match ${branch}, so the earlier pull request was closed.`,
        line: (n: number, branch: string): string => `Pull request #${n} was closed because nothing in it differs from ${branch} any more.`,
        owner: "The next Publish with changes opens a new one.",
        editor: "The next Publish with changes opens a new one. If it should have stayed open, ask a project owner.",
        view: (n: number): string => `View #${n}`,
      },
      /** 보류로 Not sent가 된 결과 (#83). writer가 값을 버린 것이 아니라 설명이 갈린다 — Logs의 `Not sent`와 같은 판정이다. */
      withheldDescription: {
        withheld: "Nothing was written to the repository. These edits stay saved here until they can be sent.",
        noChanges: "Nothing was written to the repository. Your other edits already matched it, and these stay saved here until they can be sent.",
      },
      /** 결과 모달 목록 머리 — 모달 제목·Logs 배지와 같은 Publish 일부 보류 낱말이다(1-Y5). */
      notWritten: "Held back",
      warnings: (n: number): string =>
        `${n.toLocaleString("en-US")} ${n === 1 ? "warning" : "warnings"} \u00b7 values still saved in Malmoi`,
      stillHere: "These values stay in Malmoi and will go out once the files can hold them.",

      /** `1h` — 다시 해도 같다. 제목·바닥 버튼·사실 표가 **사유에서 온다**. */
      configError: "Couldn't reach the repository",
      /**
        * ⚠️ **원인을 단정하지 않는다** — 이 틀이 덮는 셋(`base-unreadable`·`not-installed`·
        * `glob-matched-nothing`) 중 브랜치를 못 읽은 것은 하나뿐이다. 무엇이 틀렸는지는 아래
        * Alert가 서버의 safe 메시지로 말한다.
        * ⚠️ **"아무것도 안 써졌다"를 쓰지 않는다** (spec C10) — 전송 여부는 바닥 한 줄이 든다.
        */
      configErrorDescription: (repo: string, branch: string): string =>
        `Something about ${repo} has to change before ${branch} can take this. Your edits are still saved here.`,
      wontHelp: "Trying again won't help",
      repository: "Repository",
      baseBranch: "Base branch",
      failedAt: "Failed at",
      reference: "Reference",
      /** ⚠️ **`Reference`가 없는 갈래에서는 이 줄도 빠진다** — 그 다섯은 실행 행 자체가 안 생긴다. */
      sendReference: "Not a project owner? Share the reference above with one \u2014 it is in Logs too.",
      settings: "Open settings",
      signIn: "Sign in",

      /** `1i` — 다시 하면 된다. "절반만 나갔나"에 **먼저** 답한다. */
      transientError: "GitHub didn't answer",
      transientErrorDescription:
        "The request to GitHub failed partway. Your edits are still saved here.",
      /**
        * ⚠️ **"아무것도 안 나갔다"고 말하지 않는다** (spec C10 · 리뷰 1번). `db-unavailable`은 PR을
        * 연 **뒤** 기록에서 죽는 경로라 그 단정이 거짓이 될 수 있다. 대신 사람이 실제로 두려워하는
        * 것("두 번 나가면 어떡하나")에 답한다 — 브랜치를 **덮으므로** 재시도가 사본을 만들지 않는다.
        */
      transientErrorBody: (): ReactNode => (
        <>
          This is usually temporary, and trying again is safe: Malmoi{" "}
          <span className="font-medium">replaces the same branch</span> instead of adding to it, so
          a second attempt can&apos;t leave two copies behind.
        </>
      ),
      retry: "Try again",
      /**
       * `1i`의 응답 유실 형 — 클라이언트만 낸다 (malmoi#135). 끊긴 것은 Malmoi의 응답이라 `transientError`의 "GitHub"·"partway"가 거짓이다.
       * "opened the pull request"라고 쓰지 않는다 — 열린 PR이 있으면 그 PR을 갱신한다.
       * ⚠️ **"화면이 최신이다"를 덧붙이지 않는다** — 오프라인이면 다시 읽지 않는다(`usePublish`). 무엇이 됐는지는 다시 읽은 화면이 말한다.
       */
      lostResponse: "The response didn't come back",
      lostResponseDescription:
        "Malmoi may have sent your changes anyway. Your edits are still saved here.",

      /** 실행 전 명시적 거부만 미전송을 단정한다 (spec C10). */
      notStarted: "Nothing was sent. Your edits are safe.",
      /**
       * 코드도 사전 문장도 없는 거부 (audit #21). 전엔 원문을 그대로 보이고, `invalid input`은 권한 없음으로 오역했다 —
       * 그 거부는 슬러그가 깨진 것이라 권한과 무관하다.
       */
      // ⚠️ **"try again"을 쓰지 않는다** (r1) — 같은 모달의 Alert 제목이 `wontHelp`("Trying again won't help")다.
      refused: "Publishing couldn't start. Open this project again from your project list.",
      /**
       * 미리보기의 base 언어 파일 부재 (delivery-invariants · coordinator review r1). 원인과 고칠 곳을 말하고 Try again을 두지 않는다 —
       * 다시 눌러도 같은 거부다. EDITOR에게는 Settings가 열리지 않으므로 a project owner를 가리킨다(DESIGN §10.1).
       */
      baseFileMissing: {
        title: "The base language file isn't in the repository",
        description: (path: string, branch: string): string =>
          `Malmoi looks for it at ${path} on ${branch}, and nothing was sent while it's missing.`,
        owner: "Restore the file on that branch, or change the path or branch in Settings.",
        editor: "Ask a project owner to restore the file or change the path in Settings.",
      },
      /** base 언어 파일을 읽을 수 없다 (B3 r3 — 실행이 base 키 집합을 못 정해 막는다). 부재와 같은 거부 모양이고 고칠 곳이 파일 내용이다. */
      baseFileUnreadable: {
        title: "The base language file can't be read",
        description: (path: string, branch: string): string =>
          `Malmoi couldn't parse ${path} on ${branch}, so it can't tell which keys the file has. Nothing was sent.`,
        owner: "Fix the file on that branch, or change the path or branch in Settings.",
        editor: "Ask a project owner to fix the file or change the path in Settings.",
      },
      unknownDelivery: "We couldn't confirm whether your changes were sent.",

      /** `1j` — 행조차 생기지 않는 거부 둘. 폭 512이고 danger가 아니다. */
      alreadyRunning: "Someone is publishing right now",
      alreadyRunningBody:
        "Another run started a moment ago. Wait for it to finish \u2014 your changes will be included if it hasn't read them yet, and sent next time if it has.",
      tooSoon: "Just a moment",
      /** ⚠️ **간격을 수로 말하지 않는다** — 남은 초는 버튼이 들고, 두 수가 한 화면에 서면 어긋나 보인다. */
      tooSoonBody:
        "Malmoi waits a moment between pull requests so the repository doesn't get two in a row.",
      wait: (seconds: number): string => `Try again in ${seconds.toLocaleString("en-US")}s`,

      /** `1k` — 판단할 재료를 못 얻었다. **실패로 말하지 않는다**(무색 블록 · `Try again`). */
      previewFailed: "Couldn't read what would go out",
      previewFailedDescription: (branch: string): string =>
        `Malmoi reads the translation files on ${branch} to show what your edits would change. That read didn't come back.`,
      previewFailedTitle: (branch: string): string => `The files on ${branch} couldn't be read`,
      previewFailedBody: (n: number): string =>
        `Your ${n.toLocaleString("en-US")} ${n === 1 ? "change is" : "changes are"} still here. Publishing stays off until this list can be shown \u2014 sending without it would skip the one step that says what a pull request replaces.`,
      previewFailedHint:
        "If this keeps happening, the repository connection is the place to look \u2014 a project owner can check it in Settings.",
    },

    /**
     * 초대 — **6a에서는 번역 화면 툴바의 `Dialog`다.** 멤버 관리 화면은 6b이고, 이 폼이 없으면
     * `createInvitation`에 호출부가 없다.
     */
  },

  /**
   * 멤버 화면 (6b-2 — DESIGN §6.65). **역할 이름은 `projects.role`에서 온다** — 어휘가 두 벌이면 갈린다.
   *
   * ⚠️ **이 표는 프로젝트의 전원이 본다**(EDITOR 포함) — 그래서 이메일 문구가 "마스킹돼 있다"를
   * 설명하지 않는다. 마스킹은 사과할 일이 아니라 기본값이다.
   */
  /**
   * 로케일 화면 (6b-5 — `/projects/:slug/locales`). **사용자 어휘는 "language"다** — `locale`은 우리
   * 내부 낱말이고 URL에만 남는다 (설정의 "Base language"와 같은 어휘).
   *
   * ⚠️ **`save`류를 설정과 공유하지 않는다.** 서로 다른 폼의 서로 다른 버튼이라 한 벌로 묶을 이유가
   * 없고, 묶으면 한 화면의 문구 변경이 다른 화면을 조용히 바꾼다.
   */
  sources: {
    /** ⚠️ **골격은 `aria-hidden`이라 이 한 줄이 유일한 안내다** (audit-ux #5 — `m.home.loading`과 같은 형). */
    screenLoading: "Loading sources…",
    title: "Sources",
    /** 머리·카드·트리의 개수 배지 sr 문장 — 숫자는 `aria-hidden`이다(`CountBadge`, ux-drift-unify Q13). */
    count: (n: number): string => `${n.toLocaleString("en-US")} ${n === 1 ? "source" : "sources"}`,
    /** Sources 상세 Languages 카드의 개수 배지 sr 문장. */
    languageCount: (n: number): string => `${n.toLocaleString("en-US")} ${n === 1 ? "language" : "languages"}`,
    /**
     * 관리하지 않는 항목 (B2 r3 · QA5 — ARCHITECTURE §1 "read 오류의 두 갈래"). **실패 문장이 아니다** — 코드의 식·참조라
     * 파일에 그대로 남고 번역을 잃지 않는다. Sync 결과 문장 뒤에 안내로만 붙는다.
     */
    unmanaged: (n: number): string => `${n.toLocaleString("en-US")} ${n === 1 ? "entry isn't" : "entries aren't"} plain text and ${n === 1 ? "stays" : "stay"} in the code.`,
    add: "Add sources",
    open: "Open translations",
    openLanguage: "Open",
    details: "Source details",
    files: "Files",
    path: "Path pattern",
    format: "File format",
    repository: "Repository / branch",
    notConfigured: "Not configured",
    unknownFormat: "Unrecognized format",
    status: "Sync status",
    languages: "Languages",
    retry: "Try again",
    loading: "Loading source details…",
    unavailable: "We couldn't load this source. Try again.",
    rejected: "This source isn't available to you. Close this window and refresh the page.",
    latestFailed: "The change completed, but we couldn't load the latest state. Try loading the details again.",
    emptyTitle: "No sources yet",
    emptyOwner: "Add the files that hold your strings, and Malmoi will read them from your base branch. Keys and languages appear here after the first sync.",
    emptyEditor: "A project owner adds the translation files. Nothing to translate until then — you will see the languages here once the first sync lands.",
    ownerOnly: "Only project owners can add sources.",
    askOwner: "Ask a project owner to run the first sync.",
    reconnectOwner: "Reconnect the repository in Settings, then try again.",
    reconnectEditor: "Ask a project owner to reconnect the repository.",
    firstImport: "The first sync hasn't finished yet. Adding a source doesn't connect its CI workflow.",
    noLanguages: "No active languages are available. Restore a language in the repository and sync again.",
    applied: "Applied",
    requested: "Requested",
    waiting: "Waiting to apply",
    pendingHelp: "If your CI passes the base language for this source, update its workflow entry to the requested language.",
    // ⚠️ 파일이 사라졌다고 단정하지 않는다 — 한 파일에 여러 언어가 드는 형식에서는 파일이 남아도 언어가 빠진다.
    orphanReason: "This language was removed from the repository.",
    orphanStrip: (code: string): string => `${code} was removed from the repository.`,
    orphanStripRest: (translations: number, active: number): string =>
      `The ${translations.toLocaleString("en-US")} translations are kept and stay read-only. It comes back when the language is in the repository again and the next sync runs. It isn't counted in the ${active.toLocaleString("en-US")} active languages.`,
    // 시안 `1c`·`1d`의 카드 머리 보조문 셋과 언어 행의 비고 문구. 화면이 아는 값만 말한다.
    statusHelp: "Updated by syncs from your repository.",
    baseHelp: "The base language decides which keys exist in this source.",
    languagesHelp: "Languages come from the repository. Add or remove the files there.",
    baseRow: "Source of every key in this file",
    needReview: (count: number): string => `${count.toLocaleString("en-US")} need review`,
    missingRepo: "Removed from repository",
    editorBase: "Only project owners can change the base language of a source.",
    readOnlyNote: "Name, path and file format are read from the repository.",
    started: "started",
    addedAgo: "added",
    lastSuccess: "Last successful sync",
    archivedOwner: "Translations are kept. Syncs are stopped, and sources can't be viewed or changed until the project is restored.",
    archivedEditor: "Translations are kept. A project owner can restore it — sources and translations come back then.",
    discardTitle: "Discard the base language change?",
    discardBody: (requested: string, applied: string): string =>
      `You picked ${requested} but didn't save it. The base language stays ${applied}.`,
    keepEditing: "Keep editing",
    discardChange: "Discard change",
    importedSummary: (keys: number, locales: number): string =>
      `${keys.toLocaleString("en-US")} active keys in ${locales.toLocaleString("en-US")} ${locales === 1 ? "language" : "languages"}, read from the repository.`,
    notImportedHelp: "No keys or languages have arrived from this file yet. Adding a source doesn't connect CI on its own — the workflow in your repository sends the strings.",
    workflow: "Update the workflow in Settings to include the added sources.",
    addedCount: (count: number): string => `${count.toLocaleString("en-US")} ${count === 1 ? "source" : "sources"} added`,
    addedOne: (count: number): string => `synced ${count.toLocaleString("en-US")} keys`,
    /** 추가 결과 줄의 조각 — `{slug} sync failed`. 동기화 실패의 배지 낱말이다(DESIGN §2.4). */
    addedFailed: "sync failed",
    resultKeep: "This stays until you dismiss it, so the result doesn't disappear when a status changes below.",
  },

  locales: {
    /** base 배지 — 가장 흔한 상태가 조용해야 하므로 나머지 행에는 배지가 없다 (DESIGN §6.2). */
    base: "Base",
    orphaned: {
      badge: "Removed from repository",
    },
    empty: {
      description: "They appear after the first sync reads your translation files.",
    },
    /** 기준 언어 폼. **선언만 저장한다** — 현실은 push가 소유한다 (PRODUCT §3). */
    field: {
      label: "Base language",
      // malmoi#127 — 옆의 [Sync]가 적용하지 않는다는 것까지 말한다(`translations.banner.basePending`과 같은 근거).
      // r4 — 워크플로가 `base-locale:`을 박는다(`lib/onboarding/workflow.ts`). 옛 값을 보내는 CI push는 선언을 적용하지 않는다(가이드 `setup/sources.md` 2단계).
      help: "The language your source strings are written in. Changing it takes effect on the next sync from your repository's GitHub Actions workflow, not the Sync button — update the workflow's base-locale: value to match.",
      save: "Save",
      /** ⚠️ **버튼 로딩과 다른 축이다** — 셀 인라인 상태줄이라 `loadingLabel` 제거 대상이 아니다. */
      saving: "Saving…",
      saved: "Saved",
      failed: "We couldn't save this. Try again in a moment.",
      /** 첫 적재 전 — 고를 언어가 없어 폼이 막힌다. 이유를 말하지 않으면 고장으로 보인다. */
      noLocales: "You can set this after the first sync.",
    },
    pending: {
      copy: "Copy line",
    },
  },

  members: {
    /** ⚠️ **골격은 `aria-hidden`이라 이 한 줄이 유일한 안내다** (audit-ux #5 — `m.home.loading`과 같은 형). */
    loading: "Loading members…",
    /**
     * 패널 헤더 우측의 좌석 잔량 — 갈래는 `planSeatNotice`가 정한다.
     *
     * ⚠️ **상한을 문구가 따로 들지 않는다** — `limit`이 인자로 들어온다. 화면이 `MEMBER_LIMIT`을
     * import하면 그 상수와 서버 거부가 갈리는 날 둘이 다른 수를 말한다.
     */
    seats: (n: number, limit: number): string => `${n} of ${limit} seats`,
    /** 자리가 없을 때 — 막힌 사실과 **무엇을 하면 되는지**를 함께 말한다. */
    seatsFull: (limit: number): string => `${limit} of ${limit} seats — remove someone to invite`,
    /** EDITOR 시야. ⚠️ **좌석 초과보다 이 사유가 이긴다** (`planSeatNotice`의 단언이 그것을 고정한다). */
    ownerOnly: "Only project owners can invite or change roles",
    /**
     * 카드 카운트 배지의 sr-only 문장.
     *
     * ⚠️ **필수다** — `RowCard`의 배지가 `<span aria-hidden>{count}</span>` + sr-only 문장 형이고
     * 기본값이 `m.projects.count`라, 안 넘기면 멤버 카드가 "3 projects"를 낭독한다.
     */
    count: (n: number): string => `${n} member${n === 1 ? "" : "s"}`,
    /**
     * 복호화 실패 행 (멤버·대기 초대 공용).
     *
     * ⚠️ **`m.common.unreadable`과 같은 낱말이다**(ux-drift-unify Q5) — 같은 사람의 이름이 Members와 Logs에서 다른 말로 나왔다.
     * 조치 안내는 행 아래 띠(보조 문장)가 든다.
     */
    unreadableLabel: UNAVAILABLE,
    unreadableHint: "This person's name and address couldn't be decrypted. Role and join date are unaffected.",
    /**
     * 읽기전용 역할 칩의 접근 이름 — 보이는 것은 역할 낱말과 자물쇠뿐이다.
     *
     * ⚠️ **문장이 둘이다** (핸드오프 결정 3). 같은 점선 칩이지만 **잠긴 까닭이 다르다**: 대기 초대는
     * 발급 시점에 굳은 것(`ProjectInvitation.role`은 `changeMember`가 못 건드린다)이고, EDITOR 시야는
     * 권한이 없는 것이다. 한 문장으로 접으면 "Revoke하고 다시 초대"라는 **복구 경로**가 사라진다.
     */
    roleLocked: {
      pending: (role: string): string =>
        `${role}, set when the invitation was created. Revoke and invite again to change it.`,
      editor: (role: string): string => `${role}, only project owners can change roles.`,
    },
    /**
     * ⚠️ **값이 자기 라벨을 든다** (핸드오프 결정 3-b). 열 머리를 지웠으므로 `2 days ago`가 무엇의
     * 시각인지 말할 자리가 이 문장뿐이다 — 라벨 없이 상대 시각만 두면 가입일과 만료가 구별되지 않는다.
     */
    joined: (when: string): string => `Joined ${when}`,
    /** 이름이 없는 사용자 — Google 계정엔 핸들이 없다. */
    unnamed: "No name set",
    you: "You",
    /**
     * ⚠️ **대상을 든다** (2026-09-08 code-review 🟡2). 행마다 같은 라벨이면 스크린 리더 사용자가
     * 셀렉트 다섯 개가 누구의 것인지 구별할 수 없다 — `translations.cellLabel`과 같은 형이다.
     */
    changeRole: (who: string): string => `Change role for ${who}`,
    /** 보이는 텍스트. 아래 `removeLabel`이 그것을 **포함**해야 한다 (WCAG 2.5.3 Label in Name). */
    remove: "Remove",
    removeLabel: (who: string): string => `Remove ${who}`,
    /** 행이 사라진 뒤 한 번 읽히는 결과 (malmoi#51) — 포커스가 제목으로 가므로 무엇이 됐는지는 이 문장이 든다. */
    removed: (who: string): string => `Removed ${who}`,
    /** 확인 모달 — 제목은 **대상을 명시한 질문**, 액션 라벨은 결과다 (DESIGN §10). */
    confirmRemove: (who: string): string => `Remove ${who} from this project?`,
    /**
     * ⚠️ **번역이 남는다는 사실을 먼저 말한다** (캔버스 `1c`) — 망설이는 이유가 대개 그것이다.
     *
     * ⚠️ **그것을 보장하는 것은 FK가 아니다.** 한때 이 주석이 `ProjectMember`의 `Restrict`를 근거로
     * 들었는데 **거짓이다** — `schema.prisma`가 *"멤버 행의 제거·강등은 FK가 막지 않는다"*를 명시한다
     * (그 `Restrict`는 Project·User **삭제**를 막는다). 실제 근거는 `Translation.updatedBy`에 FK가
     * 없고 `loadActors`가 `ProjectMember`가 아니라 `User`를 읽는다는 것이다 — 멤버 행이 사라져도
     * 이름이 붙은 이력은 그대로다.
     */
    confirmRemoveHint: "They lose access right away. Their translations stay — the history keeps their name.",
    cancel: "Cancel",
    /**
     * 마지막 OWNER 보호는 `accessErrorMessage("last-owner")`가 낸다 — 여기 두 벌로 쓰지 않는다.
     * ⚠️ **사유를 받지 않는다** (audit #21) — 전엔 `…: ${reason}`이라 `invalid input` 같은 코드 원문이 문장에 섰다.
     * 여기 닿는 것은 사전에 없는 거부뿐이고, 그 대부분이 화면이 낡은 경우다.
     */
    changeFailed: "We couldn't apply that change. Refresh the page and try again.",
    /**
     * 역할 변경 확인 (audit #20) — 같은 화면의 Remove가 이미 확인을 받는다. 제목은 대상을 명시한 질문이다 (DESIGN §10).
     * ⚠️ **역할 이름에 관사를 붙이지 않는다** — "as a Editor" (2026-09-08).
     */
    confirmRole: (who: string, role: string): string => `Change ${who}'s role to ${role}?`,
    confirmRoleHint: "The new role applies right away.",
    /**
     * 자기 강등 — 이 Dialog가 서야 하는 **가장 큰 이유**다. 확인하는 순간 이 화면의 컨트롤이 사라진다.
     * ⚠️ **"lose access to members"가 아니다** — EDITOR도 이 화면을 읽는다. 잃는 것은 관리다 (POSTMORTEM 2026-09-14 확인 Dialog 논거).
     */
    confirmSelfDemote: "You'll stop being able to manage members and settings right away, and only a project owner can give that back.",
    /** 트리거(셀렉트)의 이름과 달라야 한다 (DESIGN §6.646). */
    confirmRoleAction: "Change role",
    /** 호출이 끊겨 적용됐는지 모른다 (audit #24) — 사유를 지어내지 않는다. */
    changeUnconfirmed: "We couldn't confirm that change. Refresh to see the current members.",

    /** 초대 발급 — 6a의 임시 폼(`translations.invite`)에서 여기로 옮겼다. 화면 하나에 어휘 한 벌이다. */
    invite: {
      open: "Invite member",
      /** ⚠️ **여러 명이다** (핸드오프 `1a`) — 한 폼이 여러 행을 보낸다. */
      title: "Invite members",
      /**
       * ⚠️ **둘째 문장이 수락 조건이다** (launch-readiness L2.8) — 수락은 로그인 계정의 주소와 대조하고 GitHub은
       * primary 주소 하나만 쓴다(`lib/auth/email.ts`). 거부 문구는 초대 주소를 일부러 안 밝히므로 행동할 수 있는 쪽은 초대자다.
       */
      description: "Send invitations by email and choose a role for each person. Use the address they sign in with — for GitHub, their primary email.",
      /** 열 머리 둘 — 빈 행 하나로 열리면 두 번째 컨트롤이 무엇인지 값만으로는 안 읽힌다. */
      columns: { email: "Email", role: "Role" },
      placeholder: "name@company.com",
      /** 역할 메뉴 항목의 둘째 줄 — 권한표(`lib/auth/permission.ts`)를 한 문장씩 옮긴 것이다. 폼에는 캡션을 두지 않는다. */
      roleHint: {
        EDITOR: "Can translate and publish",
        OWNER: "Also manages members and settings",
      },
      /** ⚠️ **대상이 접근 이름에 들어간다** — 여덟 행의 제거 버튼이 전부 "Remove"면 무엇을 지우는지 모른다. 빈 행은 `recipient {n}`. */
      roleFor: (who: string): string => `Role for ${who}`,
      removeRecipient: (who: string): string => `Remove ${who}`,
      emptyRecipient: (n: number): string => `recipient ${n.toLocaleString("en-US")}`,
      addAnother: "Add another",
      /** 주 버튼이 몇 명에게 보내는지 말한다. 0명이면 꺼진 버튼의 라벨이다. */
      send: (n: number): string => (n === 0 ? "Send invitations" : n === 1 ? "Send invitation" : `Send ${n.toLocaleString("en-US")} invitations`),
      /** 바닥 왼쪽 상태 슬롯 — 좌석 수가 서던 자리를 순서대로 쓴다. ⚠️ 버튼 라벨은 바꾸지 않는다(`loadingLabel`이 없다). */
      sending: "Sending invitations…",
      /** ⚠️ **"by this request"다** (design §6) — 앞선 요청이 결과 미확인이었을 수 있으므로 범위를 이번 요청으로 좁힌다. */
      nothingSent: "Nothing was sent by this request. Fix or remove the highlighted row, then send again.",
      /** 모달 바닥 왼쪽. 헤더의 `seats`와 다른 문장인 것은 시안이고, 수는 같은 값에서 온다. */
      seatsUsed: (n: number, limit: number): string => `${n} of ${limit} seats used`,
      rowError: {
        invalidEmail: "This doesn't look like an email address.",
        invalidRole: "Choose a role for this address.",
        /** 같은 역할 중복 — 뒤 행 하나에만 선다. `row`는 화면의 1부터 센 행 번호다. */
        duplicate: (row: number): string => `Already in row ${row.toLocaleString("en-US")}. Remove this one.`,
        /** 역할이 다른 중복 — 양쪽 행에 상대 행과 역할을 적는다. 조용히 한쪽을 버리면 고른 역할이 사라진다. */
        roleConflict: (row: number, role: string): string => `Also in row ${row.toLocaleString("en-US")} as ${role}. Keep one role for this address.`,
      },
      alreadyMember: "That email is already a member of this project.",
      /**
       * 발급 제한의 폼 Alert (warning). ⚠️ **"sent"가 아니라 "created"다** (design §6) — 한도는 발송 성공 수가
       * 아니라 초대 발급 수이고, 메일이 실패해도 센다. 시각은 서버 값을 UTC로 적는다(카운트다운 없음).
       */
      limit: {
        title: "This would go over the invitation limit",
        /** ⚠️ 한도를 인자로 받는다 — 문구가 20을 따로 들면 `INVITATION_HOURLY_LIMIT`와 갈리는 날 화면만 틀린 수를 말한다. */
        project: (limit: number, used: number, n: number, time: string): string =>
          `A project can create ${limit.toLocaleString("en-US")} invitations an hour, and ${used.toLocaleString("en-US")} ${used === 1 ? "was" : "were"} created in the last hour. You can send ${n === 1 ? "this one" : `these ${n.toLocaleString("en-US")}`} after ${time}.`,
        address: (email: string, time: string): string => `${email} was invited less than a minute ago. You can send again after ${time}.`,
        /** 발급자 기준 — 전 프로젝트 합산이라 "this project"라고 쓰지 않는다. 한도는 `USER_HOURLY_LIMIT`을 받는다. */
        user: (limit: number, used: number, n: number, time: string): string =>
          `You can create ${limit.toLocaleString("en-US")} invitations an hour across all projects, and you created ${used.toLocaleString("en-US")} in the last hour. You can send ${n === 1 ? "this one" : `these ${n.toLocaleString("en-US")}`} after ${time}.`,
      },
      tooMany: (limit: number): string => `You can invite up to ${limit.toLocaleString("en-US")} people at a time.`,
      /** 결과 미확인은 모드가 아니라 문구다 — 일부가 갔을 수 있다는 사실을 숨기지 않고, 사람별 결과를 복원하지 않는다. */
      unconfirmed: {
        title: "We couldn't confirm the email request",
        body: "Some invitations may have been sent. Sending again replaces the earlier links.",
      },
      sendFailed: "The invitation emails couldn't be sent. Sending again replaces any links from this attempt.",
      /** ⚠️ **workspace가 없다** (design §6) — 제품 계층에 없는 낱말이다. 키·코드도 노출하지 않는다. */
      emailUnavailable: "Email is unavailable right now. Try again later.",
      /** ⚠️ 사유 원문을 받지 않는다 (audit #21) — 아는 거부는 위에서 전부 문장이 됐다. */
      failed: "We couldn't send the invitations. Refresh the page and try again.",
      sentToast: (n: number): string => (n === 1 ? "Invitation sent" : `Invitations sent to ${n.toLocaleString("en-US")} people`),
    },

    pending: {
      title: "Pending invitations",
      /**
       * ⚠️ `m.members.count`와 같은 이유 — 기본값이 "projects"다.
       *
       * ⚠️ **여기만 천단위 구분자를 쓴다** — 좌석 넷은 `MEMBER_LIMIT`(10)이 분모라 세 자리를 못 넘기지만
       * **대기 초대에는 상한이 없다**(`planInvitationCreate`가 대기를 안 센다).
       */
      count: (n: number): string => `${n.toLocaleString("en-US")} invitation${n === 1 ? "" : "s"}`,
      /** 행의 메타 줄. 열 머리가 사라지면서 라벨이 문장 안으로 들어왔다 (`m.members.joined`와 같은 이유). */
      expires: (when: string): string => `Expires ${when}`,
      invitedBy: (who: string): string => `Invited by ${who}`,
      /**
       * 초대한 사람의 이름이 없을 때.
       *
       * ⚠️ **이메일을 여기 쓰지 않는다** — 그 주소는 초대한 사람의 것이고 이 화면이 가리는 대상이 아니다.
       * (열이 사라지기 전에는 *"이미 마스킹한 열이 옆에 있다"*가 근거였는데, 그 열이 없어졌다.)
       */
      unknownInviter: "a member",
      resend: "Resend",
      resendLabel: (who: string): string => `Resend invitation to ${who}`,
      resentToast: (who: string): string => `Invitation resent to ${who}`,
      /** 카드 안 Alert — 대상 라벨을 문장에 넣는다(행이 교체돼도 무엇에 관한 안내인지 남게). 시각은 서버 값·UTC. */
      resendFailed: (who: string, time: string): string => `Couldn't resend the invitation to ${who}. You can try again after ${time}.`,
      resendLimited: (who: string, time: string): string => `${who} was invited less than a minute ago. You can resend after ${time}.`,
      resendProjectLimited: (who: string, limit: number, time: string): string =>
        `Couldn't resend to ${who}: this project has created ${limit.toLocaleString("en-US")} invitations in the last hour. You can resend after ${time}.`,
      resendUserLimited: (who: string, limit: number, time: string): string =>
        `Couldn't resend to ${who}: you have created ${limit.toLocaleString("en-US")} invitations across all projects in the last hour. You can resend after ${time}.`,
      resendUnconfirmed: (who: string): string => `We couldn't confirm the email to ${who}. It may have been sent — Resend again replaces that link.`,
      resendUnavailable: (who: string): string => `Couldn't resend to ${who}. Email is unavailable right now. Try again later.`,
      /**
       * 이미 없는 초대 — **Resend·Revoke가 같은 문장을 쓴다**. ⚠️ **`accessErrorMessage("not-found")`로 떨어뜨리지 않는다**
       * (audit #22) — 그 문장은 초대받은 사람에게 "Check your invite link"라고 말하는데 여기서 읽는 사람은 OWNER다.
       */
      gone: (who: string): string => `The invitation to ${who} is no longer pending.`,
      /** ⚠️ 사유 원문을 받지 않는다 (audit #21). */
      resendError: (who: string): string => `Couldn't resend the invitation to ${who}. Refresh the page and try again.`,
      revoke: "Revoke",
      /** 같은 이유로 대상을 든다 — 대기 초대가 여럿이면 어느 주소인지가 유일한 구별점이다. */
      revokeLabel: (who: string): string => `Revoke invitation for ${who}`,
      revoked: (who: string): string => `Revoked the invitation for ${who}`,
      /** ⚠️ 사유 원문을 받지 않는다 (audit #21). */
      revokeFailed: "We couldn't revoke that invitation. Refresh the page and try again.",
      /** 확인 (audit #20) — 링크가 즉시 죽고 되돌릴 수 없다. 확정 라벨은 트리거(`Revoke`)와 달라야 한다. */
      confirmRevoke: (who: string): string => `Revoke the invitation for ${who}?`,
      confirmRevokeHint: "The link stops working right away. You can invite the same address again.",
      confirmRevokeAction: "Revoke invitation",
      revokeUnconfirmed: "We couldn't confirm the invitation was revoked. Refresh to check.",
      empty: {
        title: "No pending invitations",
        description: "Everyone you invited has joined, or their links have expired.",
      },
    },
  },

  /** settings-block 넷 + 계정 (DESIGN §6.6). **블록이 각자 실패한다** — 문구도 블록별로 갈라져 있다. */
  settings: {
    /** ⚠️ **골격은 `aria-hidden`이라 이 한 줄이 유일한 안내다** (audit-ux #5 — `m.home.loading`과 같은 형). */
    loading: "Loading settings…",
    general: {
      title: "General", thumbnail: "Thumbnail", name: "Name", address: "Address",
      upload: "Upload", remove: "Remove",
      caption: "PNG or JPEG, up to 3 MB.",
      emptyName: "Enter a project name.", longName: "Use 200 characters or fewer.",
      busy: "Updating the thumbnail…",
    },
    sources: {
      add: "Add sources", locked: "Already a source",
      /** 모달의 확정 버튼 — 트리거(`Add sources`)와 접근 이름이 달라야 한다 (DESIGN §6.646). */
      confirm: "Add selected sources",
      notImported: "Not synced yet", importing: "Syncing…", imported: "Synced", failed: "Sync failed",
      failedAfter: "Sync failed", retry: "Run first sync", rerun: "Re-run the workflow on GitHub.",
      unknown: "We couldn't confirm the result. Check the source list before trying again.",
      nothingAdded: "Nothing was added. Your selection is still here.",
      description: "Choose translation files from your repository. Existing sources stay selected.",
      selectHelp: "Select at least one new source to add.",
      /**
       * 수동 지정의 빈 미리보기 설명 (malmoi#80). `newProject.files.preview.noneDescription`을 빌리지 않는다 — 그쪽은
       * "the project isn't created"라 이미 있는 프로젝트에서 거짓이다.
       */
      previewNone: "Set a path and Malmoi will show the keys it finds. If no file matches, nothing is added.",
      /** [Add selected sources]가 꺼진 갈래별 사유 (malmoi#93) — 고른 것이 없을 때는 위 `selectHelp`다. `planAddBlock`이 고른다. */
      blocked: {
        detecting: "Looking for translation files in the repository.",
        detectFailed: "The file list couldn't be loaded. Try again above.",
        conflict: "Some selected files already belong to another source.",
        base: "Choose a base language for each selected source.",
      },
      /** 꺼진 수동 확인([Check files])의 사유 (audit #37). */
      manualReason: "Enter a file path and a base language to check.",
    },
    ci: { description: "Your workflow pushes source strings into Malmoi on every merge.", title: "CI integration", workflow: "Workflow file", sourcesLead: "One workflow covers every source. Add or change sources in", stale: "Some sources haven't been synced yet. Check that the workflow includes them.",
      /** 소스가 없어 꺼진 워크플로 행의 사유 (audit #37) — 워크플로는 소스 목록에서 만들어진다. */
      noSources: "Add a source to get the workflow." },
    archivedReason: "Restore this project to change its settings.",
    recovery: "Syncs keep running. Manage your GitHub authorization in Account to reconnect this repository or add sources.",
    accountLink: "Account",
    installed: "The Malmoi GitHub App is installed on this repository.",
    openRepo: "Open on GitHub",

    repository: {
      disconnected: "Disconnected", notConnected: "Not connected", unknown: "Couldn't check", wrongRepository: "Wrong repository",
      movedHint: "Reconnect to store the new name. Syncs keep working in the meantime.",
      paused: "Syncs and publishes stop until it's reconnected. Everything already translated is safe.",
      title: "Repository",
      connect: "Connect",
      reconnect: "Reconnect",
      connectFailed: "We couldn't start the connection. Try again in a moment.",
      /**
       * 건강성 6종 (DESIGN §6.2). ⚠️ **`unknown`을 `app-uninstalled` 문구로 접지 않는다** — 조회 실패를
       * "제거됨"으로 보여주면 사용자가 멀쩡한 설치를 다시 만든다.
       */
      health: {
        // 가장 흔한 상태가 가장 조용해야 한다 — 초록도 배지도 쓰지 않는다.
        ok: "Connected",
        "not-connected": "No installation is connected yet.",
        "app-uninstalled": "The app was removed or suspended, or its access to this repository was revoked.",
        "installation-changed": "The app was reinstalled — connect it again.",
        moved: (fullName: ReactNode): ReactNode => <>This repository moved to {fullName}</>,
        // ⚠️ **[다시 연결]을 권하지 않는다** — 리포는 프로젝트 생성 시점에 고정이라 `connectRepository`가
        // 다른 id로의 재고정을 거부한다. 여기서 버튼을 주면 눌러도 실패만 한다.
        "repo-replaced": "This address now holds a different repository than the one this project was connected to. Check it on GitHub — if the repository really was replaced, create a new project for it.",
        unknown: "We can't check this right now. Open this page again in a moment.",
        install: "Install the app",
        installHint: "Install it, then come back here and connect again.",
      },

      /**
       * 기준 브랜치 하나다 (6b-3이 언어와 한 폼에 뒀던 것을 **6b-5가 갈랐다** — 언어는
       * `m.locales.field`이고 화면은 `/projects/:slug/sources` 상세다, PRODUCT §7.7 결정 4).
       *
       * ⚠️ **브랜치는 즉시 쓰인다** — pull의 커밋 parent와 PR base가 그것이고 대기 개념이 없다.
       * 선언만 쓰이는 축(base language)이 여기서 사라졌으므로 두 성질을 한 help 문구로 설명할
       * 필요도 없어졌다.
       */
      fields: {
        branch: "Base branch",
        branchHelp: "Syncs read this branch, and pull requests open against it.",
        save: "Save",
      saved: "Saved",
        failed: "We couldn't save this. Try again in a moment.",
      },

    },

    status: {
      /**
       * 응답을 잃은 첫 적재 — 클라이언트만 낸다 (malmoi#135). ⚠️ **"didn't finish"를 쓰지 않는다**(옛 `failed`) — 서버가 적재를 끝냈을 수 있다.
       * 무엇이 됐는지는 다시 읽은 상세가 말한다. 다시 눌렀을 때 서버가 `not-awaiting`으로 거부하는 것은 **끝난** 적재뿐이다 —
       * 아직 도는 적재와는 겹칠 수 있다(둘 다 리포 값만 싣는다, `sources-screen.tsx`).
       */
      unconfirmed: "We couldn't confirm whether the sync finished.",
    },

    token: {
      title: "Push token",
      description: (secret: ReactNode): ReactNode => (
        <>
          Rotating makes the current token invalid immediately — CI stays broken until you update the
          repository's {secret} secret.
        </>
      ),
      rotate: "Rotate token",
      warning: "You won't see this again after you leave this page. If you lose it, rotate it again.",
      failed: "We couldn't rotate the token. Try again in a moment.",
      /** 호출이 끊겼다 — 옛 토큰이 이미 죽었을 수 있다 (audit-ux #14). 새 원문은 다시 발급해야만 받는다. */
      unconfirmed: "We couldn't confirm the rotation. The current token may already be invalid — rotate again to get a new one.",
      /**
       * 확인 (audit #19) — 이전 토큰이 **즉시** 죽는다. 성공 직후의 재클릭도 여기를 지나 방금 받은 토큰을 지킨다.
       * 확정 라벨은 트리거(`Rotate token`)와 달라야 한다 (DESIGN §6.646).
       */
      confirmTitle: "Rotate the push token?",
      confirmBody: "The current token stops working immediately, including one you just copied. CI fails until the repository's PUSH_TOKEN secret has the new one.",
      confirmAction: "Rotate and show new token",
    },

    workflow: {
      /**
       * 문장을 사전이 소유한다 — JSX 노드로 쪼개면 ko가 어순을 바꿀 수 없다 (CLAUDE.md 코드 컨벤션).
       */
      saveAs: (path: ReactNode): ReactNode => <>Save this in your repository as {path}.</>,
      copy: "Copy YAML",
      /** ⚠️ 훅으로 번역을 읽는 리포는 `wrapper` 없이는 코드 참조가 조용히 0이다 (ARCHITECTURE §4). */
      hookHint: (hook: ReactNode, wrapper: ReactNode, doc: ReactNode): ReactNode => (
        <>
          Repositories that read translations through a hook ({hook}) also need the {wrapper} input — see {doc}.
        </>
      ),
      /**
       * `hookHint`의 링크 라벨 — `/docs/setup/workflow#workflow`로 간다. ⚠️ **대상 페이지의 h1과 같은 글자다**(#121 —
       * `docs-content.test.tsx`가 원고와 대조한다). 운영 문서 경로는 제3자에게 의미가 없다.
       */
      hookDoc: "Add the workflow",
    },

    account: {
      /**
        * ⚠️ **온보딩과 같은 이름이어야 한다** (2026-09-15). 같은 일(말모이 GitHub App 인가)을 두
        * 화면이 다른 이름으로 부르면, 그 이름을 가리키는 `connectError`의 문장이 한쪽에서 **없는
        * 버튼**을 가리킨다 — `add-surface.test.tsx`가 그 쌍을 센다.
        */
      connect: "Authorize GitHub App",
      reconnect: "Reauthorize GitHub App",
      unavailable: "We couldn't load your account. Open this page again in a moment.",
      disconnect: "Disconnect",
      /**
       * ⚠️ **`"Disconnect GitHub"`으로는 부족하다** — 로그인 수단 해제의 접근 이름이 정확히 그
       * 문자열이라 둘이 또 같아진다(2026-09-13 리뷰 뒤 실제로 한 번 그랬다). **이름이 구별해야 하는
       * 것은 대상이 아니라 축이다**: 같은 "GitHub"이 이 화면에서 로그인 수단이기도 하고 리포 쓰기
       * 권한이기도 하다. `aria-label`이 보이는 텍스트를 **포함**한다 (WCAG 2.5.3).
       */
      disconnectLabel: "Disconnect GitHub App",
      disconnectFailed: "We couldn't disconnect. Try again in a moment.",
    },
  },

  /** 초대 수락 화면 — **셸 밖 카드다** (DESIGN §6.62). 거부 문구는 `errors.invite`가 든다. */
  invite: {
    /**
     * ⚠️ **`invitedTo`를 대체한다** (DESIGN §6.62). 프로젝트 이름과 역할은 이제 **카드의 두
     * 행**이라 합친 문자열의 소비자가 없다 — 있지도 않은 자리를 위해 사전 항목을 만들지 않는다.
     * 역할 이름은 계속 `projects.role`에서 온다(화면 어휘가 두 벌이면 갈린다). 그 값에 관사를
     * 붙이지 않는 규칙도 그대로다 — 2026-09-08에 "as a Editor"가 나왔다.
     *
     * ⚠️ **`"Welcome to malmoi"`를 쓰지 않는다** — 이미 멤버인 사람이 두 번째 프로젝트에 초대되는
     * 경우가 있고 그때 거짓이다.
     */
    title: "You're invited",
    /** 쓸 수 없는 초대(없음·만료·사용됨)의 제목 — 그 아래 Alert가 까닭을 말한다. `title`을 그대로 두면 두 줄이 반대 말을 한다. */
    unavailableTitle: "Invitation unavailable",
    signInHint: (email: string): string => `Sign in with the account at ${email} to accept.`,
    // ⚠️ **provider 버튼 문구가 여기 없다** (2026-09-12) — `/signin`과 같은 버튼을 쓰므로
    // `signIn.github`·`signIn.google`이 든다. 사본을 두면 같은 버튼이 화면마다 다른 말을 한다.
    accept: "Accept invitation",
    otherAccount: "Sign in with another account",
    /**
     * ⚠️ **`already-member`의 CTA다** (2026-09-12) — 그 갈래에 [Sign in with another account]를 주면
     * 화면이 시키는 일(프로젝트를 연다)과 반대되는 버튼만 남는다. 이 화면은 셸 밖이라 사이드바가 없다.
     */
    openProject: "Open project",
    /** 쓸 수 없는 초대(없음·만료·사용됨)의 출구 둘 (audit #15) — 로그인 상태가 고른다. */
    openProjects: "Go to your projects",
    signIn: "Sign in",
    /**
     * ⚠️ **각주에서 설명으로 올라왔고 둘째 문장이 빠졌다** (DESIGN §6.62). 지금까지의 값은
     * *"…Signing in with a different account won't accept it."*이었는데 **그 문장이 병합으로
     * 거짓이 된다** — 다른 수단으로 들어와도 같은 주소면 수락된다. 그리고 설명 자리로 올라오면
     * 올바른 계정으로 온 사람이 경고부터 읽는다. 실제 거부는 `email-mismatch` 갈래가 말한다.
     */
    sentTo: (email: string): string => `This invitation was sent to ${email}.`,
    // ⚠️ 장애 문구를 여기 두지 않는다 — `errors.invite.unavailable`이 같은 상태를 말한다.
    // 같은 장에 문구가 두 벌이면 ko를 열 때 한 벌만 번역돼 두 언어가 섞인다 (CLAUDE.md 코드 컨벤션).
  },

  /**
   * 병합 안내 화면 `/signin/link/[challenge]` (account-linking T2·T4) + `/account`의 수단 카드(T5).
   *
   * ⚠️ **provider 이름을 화면이 조립하지 않는다** — `providers`가 한 곳이라 같은 수단이 화면마다
   * 다르게 읽히지 않는다.
   */
  link: {
    providers: { github: "GitHub", google: "Google" },
    title: "This email already has an account",
    /** 무엇으로 들어왔고 무엇으로 만들어졌는지를 한 줄로 — 둘 다 말하지 않으면 다음 클릭을 못 고른다. */
    description: (pending: string, have: string): string =>
      `You just signed in with ${pending}, but this address was created with ${have}.`,
    confirm: (have: string): string => `Confirm with ${have}`,
    /** 기존 계정 카드의 가입 월. 월은 호출부가 UTC로 만든다. */
    joined: (month: string): string => `Joined ${month}`,
    /** ⚠️ **되돌릴 수 있다고 약속하지 않는다** — 해제는 `/account`의 일이고 이 흐름의 문장이 아니다. */
    footnote: "We'll add this sign-in method to that account. Your projects and translations stay where they are.",
    methods: {
      title: "Sign-in methods",
      /**
       * 카드 헤더의 배지 (2026-09-16). **분모가 보여야 "하나 더 붙일 수 있다"가 읽힌다** — 숫자만
       * 두면 Project Home의 배지와 형은 같아지지만 그 사실이 사라진다.
       *
       * ⚠️ **계산값이라 서버가 안 는다** — `loginMethodRows`가 준 행에서 `methodCounts`가 센다.
       */
      count: (connected: number, total: number): string => `${connected} of ${total}`,
      /**
       * ⚠️ **`Add ${provider}`였다** (2026-09-13). 행의 제목이 이미 provider 이름이라 버튼까지
       * 그것을 반복하면 같은 단어가 한 줄에 두 번 선다. 보이는 라벨은 짧게 두고 **접근 이름만**
       * 대상을 든다 — 음성 입력이 라벨로 컨트롤을 찾으므로 그 이름이 보이는 텍스트를 **포함**해야
       * 한다 (WCAG 2.5.3).
       */
      connect: "Connect",
      /**
       * ⚠️ **`Connect ${provider}`였고 그것이 `m.settings.account.connect`(`"Connect GitHub"`)와
       * 접근 이름까지 같았다** (2026-09-13). **Google로만 로그인하고 App을 한 번도 연결하지 않은
       * 계정**에서 둘이 나란히 서고, 그것이 PRODUCT가 말하는 **비개발자 동료의 기본 상태**다 —
       * GitHub으로 로그인하면 수단 행이 연결됨이라 이 조합이 안 생기고, 개발자 계정으로 보면
       * 영영 안 밟는다. **이름이 드는 것은 대상이 아니라 축이다**(아래 `disconnectLabel`과 같다).
       */
      connectLabel: (provider: string): string => `Connect ${provider} as a sign-in method`,
      /** 연결된 행의 **본문** 상태 절 (2026-09-16에 보조 줄에서 올라왔다) — 미연결 행의 `notConnected`와 짝이다. */
      connected: "Connected",
      notConnected: "Not connected",
      disconnect: "Disconnect",
      /** 같은 이유로 축을 든다 — 아래 `GitHub account` 구역의 [Disconnect]와 글자가 같다. */
      disconnectLabel: (provider: string): string => `Disconnect ${provider} as a sign-in method`,
      /** ⚠️ **사유 없는 disabled는 이 리포가 반복해 밟은 부류다** (POSTMORTEM 2026-09-06). */
      lastMethod: "This is your only way to sign in.",
      confirmDisconnect: (provider: string): string => `Disconnect ${provider}?`,
      confirmHint: "You won't be able to sign in with it until you sign in with it again at this address.",
      /** 호출이 끊겨 해제됐는지 모른다 (audit-ux #14) — 사유를 지어내지 않고 새로고침으로 확인하게 한다. */
      unlinkUnconfirmed: "We couldn't confirm that change. Refresh to see your sign-in methods.",
    },
  },

  /**
   * **MCP 커넥터의 도구 결과 문장** (mcp-connector design §2.3). 에이전트가 사용자에게 옮기는 문장이다 — 화면과 같은 거부는 화면의
   * 키를 그대로 쓰고(`lib/mcp/result.ts`의 대응표), 여기엔 **도구에만 있는 갈래**만 둔다.
   */
  mcp: {
    errors: {
      // 역할은 되는데 토큰이 그 동작을 안 받았다 — 토큰은 불변이라 다음 행동은 재발급 하나다.
      "token-scope": "This token doesn't allow that action. Issue a new token with that permission on the MCP connector page.",
      // 같은 거부를 OAuth 연결이 받았다(#149) — 연결의 권한을 바꾸는 길은 앱에서 다시 연결(재동의)이다(mcp-oauth design §4). 개인 토큰으로 보내지 않는다.
      "token-scope-oauth": "This app's connection doesn't allow that action. Connect Malmoi again from the app and allow that permission — the new connection replaces this one.",
      // Publish 핸들이 낡았다 — 아무것도 안 보냈다는 것과 다음 행동을 함께 말한다.
      reconfirm: "The translations changed after the preview, so nothing was sent. Preview again, then publish with the new handle.",
      "invalid-input": "The arguments don't match this tool's input. Check them and try again.",
      "too-many": (limit: number): string => `Save up to ${limit.toLocaleString("en-US")} keys per call. Split the rest into another call.`,
      "duplicate-key": "The same key appears more than once. Send each key once per call.",
    },
    /** 도구 설명(`tools/list`의 `description`) — 에이전트가 도구를 고르는 근거다. 핸들이 필요한 도구는 무엇을 먼저 부르는지 말한다. */
    tools: {
      whoami: "Show who this token belongs to, whether GitHub is connected, and what the token may do (permissions, projects, expiry).",
      list_projects: "List the projects you can use with this token, with your role, repository, and whether each is ready.",
      get_project: "Show a project's overview: sources, languages, key counts, changes to send, the last publish's pull request, and repository connection. Whether a pull request is open now comes from preview_publish.",
      list_repositories: "List the GitHub repositories you can connect to a new project. Needs the Create projects permission.",
      list_branches: "List a repository's branches. Pass { owner, repo } for a new project or { slug } for an existing one, not both.",
      detect_formats: "Find the translation files in a repository. Pass { owner, repo, ref? } for a new project or { slug } for an existing one. Returns candidates with a confirmation to pass to create_project or add_sources.",
      list_keys: "List translation keys with their completion. Covers all of the project's sources unless the query sets scope to source or namespace. Takes the same filters as the translations screen and a cursor for the next page.",
      get_key: "Show one key: its source text, every language's value, review and unsent flags, and where the code uses it.",
      preview_publish: "Preview what Publish would send in a pull request. Returns a fingerprint to pass to publish, and pullRequest: open (with its url), none, or unknown when GitHub couldn't be checked.",
      preview_sync: "Preview a sync from the repository and how many unsent edits it would discard. Returns an approval to pass to sync_repository.",
      preview_revert: "Preview reverting one key to the version last confirmed as sent. Returns a confirmation to pass to revert_to_last_sent.",
      list_events: "List a project's activity log, newest first. Takes the same filters as the Logs screen and a cursor.",
      get_workflow: "Get the GitHub Actions workflow file for the project's repository. It reads the push token from the PUSH_TOKEN secret.",
      list_members: "List a project's members with masked email labels. Owners also see pending invitations.",
      create_project: "Create a project from a repository using the candidates and confirmations from detect_formats, and run the first sync. Returns a push token once. Set it with gh secret set PUSH_TOKEN --repo OWNER/REPO, passing the token on standard input — don't use --body (--body - stores a literal \"-\").",
      add_sources: "Add translation sources to a project using the candidates and confirmations from detect_formats({ slug }), and run their first sync.",
      set_translations: "Save translations for up to 100 keys in one call. A rejected key is skipped and the rest are saved.",
      publish: "Send saved changes to the repository as a pull request. Call preview_publish first and pass its fingerprint.",
      sync_repository: "Load the repository's values into Malmoi, discarding unsent edits. Call preview_sync first and pass its approval.",
      revert_to_last_sent: "Revert one key's unsent languages to the version last confirmed as sent. Call preview_revert first and pass its confirmation.",
      update_project: "Change a project's name or base branch.",
      set_base_locale: "Declare a source's base language. It takes effect after the next sync from the repository.",
      rotate_push_token: "Issue a new push token. The old one stops working at once. Set it with gh secret set PUSH_TOKEN --repo OWNER/REPO, passing the token on standard input — don't use --body (--body - stores a literal \"-\").",
      invite_members: "Invite people by email. Each invitation goes out by email and the link isn't returned.",
      revoke_invitation: "Revoke a pending invitation.",
      change_member: "Change a member's role, or remove them with nextRole: null. The last owner can't be removed.",
      archive_project: "Archive a project. Editing, publishing, and syncs stop until it's restored.",
      unarchive_project: "Restore an archived project.",
    },
    /**
     * 도구 성공 결과의 한 줄 요약(`content` text) — 에이전트가 사용자에게 옮기는 문장이다. 값은 `structuredContent`에 따로 실린다.
     */
    summary: {
      signedIn: "Signed in to Malmoi.",
      signedInAs: (name: string): string => `Signed in to Malmoi as ${name}.`,
      projects: (n: number): string => `${n.toLocaleString("en-US")} ${n === 1 ? "project" : "projects"}.`,
      project: (name: string): string => `Project ${name}.`,
      events: (n: number): string => `${n.toLocaleString("en-US")} ${n === 1 ? "log entry" : "log entries"}.`,
      members: (n: number): string => `${n.toLocaleString("en-US")} ${n === 1 ? "member" : "members"}.`,
      workflow: "Workflow file for the repository. Store the push token as the PUSH_TOKEN secret.",
      keys: (shown: number, matched: number): string => `Showing ${shown.toLocaleString("en-US")} of ${matched.toLocaleString("en-US")} ${matched === 1 ? "key" : "keys"}.`,
      key: (key: string): string => `Key ${key}.`,
      revertBlocked: "This key can't be reverted right now.",
      revertReady: (n: number): string => `${n.toLocaleString("en-US")} ${n === 1 ? "language" : "languages"} can be reverted to the last sent value.`,
      repositories: (n: number): string => `${n.toLocaleString("en-US")} ${n === 1 ? "repository" : "repositories"}.`,
      branches: (n: number): string => `${n.toLocaleString("en-US")} ${n === 1 ? "branch" : "branches"}.`,
      formats: (n: number): string => `${n.toLocaleString("en-US")} ${n === 1 ? "translation file format" : "translation file formats"} found.`,
      publishPreview: (n: number): string => n === 0 ? "Nothing to send." : `${n.toLocaleString("en-US")} ${n === 1 ? "change" : "changes"} would be sent in a pull request. Publish with this fingerprint.`,
      published: (view: string): string =>
        view === "created" ? "Sent for review in a new pull request."
        : view === "updated" ? "Updated the open pull request."
        : view === "partial" ? "Some changes weren't sent. See the result for why."
        : "Nothing changed — the repository already has these values.",
      saved: (saved: number, rejected: number): string =>
        `Saved ${saved.toLocaleString("en-US")} ${saved === 1 ? "key" : "keys"}${rejected === 0 ? "" : `; ${rejected.toLocaleString("en-US")} ${rejected === 1 ? "key wasn't" : "keys weren't"} saved`}.`,
      updated: "Settings saved.",
      nameOnly: "The name was saved, but the base branch wasn't.",
      // 브랜치 코어가 던졌다 — 바뀌었는지 모른다. 재시도 전에 확인하라는 것이 다음 행동이다(Codex review CR-02).
      branchUnconfirmed: "The name was saved. We couldn't confirm whether the base branch changed — check it with get_project before trying again.",
      baseLocale: (locale: string): string => `Base language set to ${locale}. It takes effect after the next sync from the repository.`,
      pushToken: "New push token issued. The old one stopped working. Set it with gh secret set PUSH_TOKEN --repo OWNER/REPO, passing the token on standard input — don't use --body (--body - stores a literal \"-\").",
      archived: "Project archived. Restore it to edit or publish again.",
      restored: "Project restored.",
      invited: (n: number): string => `${n.toLocaleString("en-US")} ${n === 1 ? "invitation" : "invitations"} sent.`,
      revoked: "Invitation revoked.",
      memberRemoved: "Member removed.",
      memberChanged: (role: string): string => `Role changed to ${role === "OWNER" ? "Owner" : "Editor"}.`,
      created: (slug: string, keys: number): string =>
        `Created ${slug} with ${keys.toLocaleString("en-US")} ${keys === 1 ? "key" : "keys"}. Set the push token first with gh secret set PUSH_TOKEN --repo OWNER/REPO, passing it on standard input — don't use --body (--body - stores a literal "-"). Then commit the workflow file.`,
      sourcesAdded: (n: number): string => `${n.toLocaleString("en-US")} ${n === 1 ? "source" : "sources"} added. Add the workflow steps to the repository's workflow file.`,
      synced: (kept: number): string => kept === 0
        ? "Synced from the repository."
        : `Synced from the repository. ${kept.toLocaleString("en-US")} unsent ${kept === 1 ? "edit remains" : "edits remain"}, so automatic updates stay held.`,
      syncPreview: (unsent: number): string => unsent === 0
        ? "Sync will load the repository's values. No unsent edits will be discarded."
        : `Sync will load the repository's values and discard ${unsent.toLocaleString("en-US")} ${unsent === 1 ? "unsent edit" : "unsent edits"}.`,
    },
    /**
     * 브라우저가 필요한 갈래 — 설치·인가는 state 쿠키가 방어선인 왕복이라 도구가 대신하지 않는다(ARCHITECTURE §6.4).
     * 결과에 URL이 따로 실린다 — 문장은 "무엇을 하고 돌아오라"만 말한다.
     */
    needsBrowser: {
      "not-connected": "Connect your GitHub account in your browser, then call this tool again.",
      reauthorize: "Your GitHub authorization expired. Reauthorize in your browser, then call this tool again.",
      "no-installations": "Install the Malmoi GitHub App in your browser, then call this tool again.",
      // 수동 포맷 확정 도구는 없다(spec 비목표) — 브라우저의 수동 설정이 그 길이다.
      "no-candidates": "We couldn't find translation files automatically. Set up the format manually in your browser.",
    },
  },

  errors: {
    /**
     * 프로필 사진 업로드 거부 — `UploadReject` 넷 + Action의 `unavailable` + 폴백.
     *
     * ⚠️ **갈래마다 문구가 갈려야 한다** — 하나로 접으면 "무엇을 고치면 되는가"가 사라지고
     * 사용자는 같은 파일을 다시 고른다.
     */
    upload: {
      "too-large": "That picture is over 3 MB. Choose a smaller one.",
      /**
       * ⚠️ **바이트가 아니라 치수를 말한다** — 3 MB 안에 드는 파일도 여기서 걸리므로 "over 3 MB"를
       * 재사용하면 사용자가 크기를 줄여도 같은 화면을 다시 만난다.
       */
      "too-many-pixels": "That picture's dimensions are too large. Choose one with fewer pixels.",
      "unsupported-type": "That file isn't a valid PNG or JPEG. Choose another picture.",
      "not-a-file": "No picture was received. Choose a file and try again.",
      empty: "That file is empty. Choose another one.",
      unavailable: "We couldn't save that picture. Try again in a moment.",
      fallback: "We couldn't use that picture. Choose a PNG or JPEG up to 3 MB.",
    },
    connectMethod: {
      connected: "Sign-in method added. You can use it next time you sign in.",
      "email-mismatch": "The email doesn't match this account. Try an account with the same verified email.",
      "already-connected": "This sign-in method is already added. You can use it to sign in.",
      "taken-by-other": "This sign-in method belongs to another Malmoi account. Try a different account.",
      expired: "This request expired or was replaced. Start again from the Sign-in methods list.",
      cancelled: "Adding the sign-in method was cancelled. Start again when you're ready.",
      unverified: "No verified email was provided. Verify your email with the provider before trying again.",
      "wrong-user": "Your session changed during this request. Start again from the Sign-in methods list.",
      failed: "The sign-in method couldn't be added. Try again in a moment.",
    },
    /** `accessErrorMessage` — `AccessError` 여섯. */
    access: {
      unauthorized: "Your session ended. Sign in again to save your work.",
      // 무엇이 모자란지까지는 말하지 않는다 — 역할 이름은 내부 어휘다.
      forbidden: "You don't have permission for this. Ask a project owner.",
      // "없다"와 "멤버가 아니다"를 가르지 않는다 — 프로젝트 존재를 노출하지 않는다 (PRODUCT §7.7).
      "not-found": "You can't open this project. Check your invite link.",
      // 무엇을 하면 되는지 말한다 — 막힌 이유만 알려주면 사용자가 갇힌다.
      // ⚠️ **핸드오프가 이 값을 코드 쪽으로 맞췄다** (members.prompt.md 결정 6 — *"시안 문장(needs one
      // owner)은 버린다"*). 2026-09-19에 한 번 시안 문장으로 바꿨다가 되돌렸다: 바꾸면 `accessErrorMessage`
      // 소비자 전부에 번지는데 얻는 것이 단어 둘이었다. **사전 차단 띠와 사후 Alert이 같은 문장**이라는
      // 요구는 둘 다 이 키를 읽는 것으로 이미 지켜진다.
      "last-owner": "A project needs at least one owner. Make someone else an owner first.",
      "not-member": "That person isn't a member of this project.",
      // 유일하게 재시도가 맞는 사유다.
      // ⚠️ **"— your text is kept"를 떼었다** (audit #22) — 보관·토큰·연결 해제·`(edit)/error.tsx`처럼 입력이 없는 자리도
      // 이 문장을 쓴다. 입력이 남는 화면은 자기 문장이 그 사실을 말한다(`footer.saveFailed`).
      unavailable: "Something went wrong. Try again in a moment.",
      // 되돌릴 수 있다는 것과 **누가** 되돌리는지를 함께 말한다 — 그러지 않으면 사용자가 갇힌다.
      archived: "This project is archived. A project owner can restore it in Settings.",
    },

    /** `inviteErrorMessage` — `InviteError` 일곱 + 폴백(모르는 `?e=`에 던지지 않는다). */
    invite: {
      unauthorized: "You're signed out. Sign in and you'll come back to this link.",
      "not-found": "This invitation doesn't exist. The link is wrong, or the invitation was revoked.",
      expired: "This invitation expired. Ask the person who invited you for a new link.",
      "already-accepted": "This link was already used. An invitation works only once.",
      // 이 화면에서 사용자가 할 수 있는 일이 그것 하나다 — 막힌 이유만 말하면 갇힌다.
      "email-mismatch": "Sign in with the account that was invited. The one you're using wasn't.",
      // 실패로 읽히지 않게 쓴다 — 원하는 상태는 이미 이뤄져 있다.
      // ⚠️ **"프로젝트 목록에서 열어라"가 아니다** (2026-09-12 실물 검증) — 그 목록으로 가는 길이
      // 이 화면에 없었고, 지금은 버튼이 **그 프로젝트로 바로** 간다(착지 클릭 하나를 갚는다).
      "already-member": "You're already a member of this project.",
      // 초대는 소비되지 않는다 — 복원 뒤 만료 전이면 같은 링크가 산다. 그래서 "새 링크를 받아라"가 아니다.
      archived: "This project is archived. Ask the person who invited you to restore it, then open this link again.",
      unavailable: "Something went wrong. Try again in a moment.",
      fallback: "We couldn't accept the invitation. Ask the person who invited you for a new link.",
    },

    /** `signInErrorMessage` — Auth.js `?error=` 코드. 코드를 그대로 노출하지 않는다 (PRODUCT §3). */
    /**
     * `linkErrorMessage` — 병합 확인 실패 여섯 + 폴백.
     *
     * ⚠️ **challenge는 살아 있다** (ARCHITECTURE "계정 병합") — 실패가 소비하지 않으므로 "다시 눌러라"가 참이다.
     */
    link: {
      "wrong-account": "That's a different account. Choose the account this address was created with, then try again.",
      "already-linked": "That sign-in method is already on this account. Try signing in with it.",
      invalid: "We couldn't finish that confirmation. Start it again from the sign-in screen.",
      cancelled: "Confirmation was cancelled. Nothing changed — try again when you're ready.",
      unavailable: "Something went wrong. Try again in a moment.",
      "last-method": "You can't disconnect your only sign-in method.",
      fallback: "We couldn't finish that confirmation. Try again.",
    },

    signIn: {
      // ARCHITECTURE §6.2.1 — 같은 이메일이라는 이유만으로 계정을 합치지 않는다. 잘못된 자동 병합은 계정 탈취다.
      OAuthAccountNotLinked: "That email is already registered with a different sign-in method. Use the one you signed up with.",
      AccessDenied: "You can't sign in with this account. Its email may not be verified.",
      // 우리 코드다 — 세션을 못 읽었을 때 보낸다. "로그인에 실패"라고 말하지 않는다: 사용자는 편집 중이었다.
      Unavailable: "Something went wrong. Try opening this again in a moment.",
      // 우리 코드다 — 만료된 병합 challenge를 그 화면으로 되돌리지 않고 여기로 보낸다 (완료 조건 5).
      LinkExpired: "That confirmation is no longer valid. Sign in again to continue.",
      fallback: "Sign-in failed. Try again in a moment.",
    },

    /** `connectErrorMessage` — `ConnectError` 열셋 + 폴백. */
    connect: {
      "state-mismatch": "We couldn't verify that connection request. Start it again.",
      "state-expired": "That connection request expired. Start it again.",
      "wrong-user": "You started this with a different account. Start the connection again.",
      denied: "The connection was cancelled on GitHub. Start it again to continue.",
      "exchange-failed": "We couldn't finish connecting to GitHub. Start it again.",
      // 해제는 그 계정의 주인만 할 수 있다 — 무엇을 하면 되는지 말한다.
      "taken-by-other": "That GitHub account is already connected to another user. They can disconnect it to free it up.",
      "not-connected": "Authorize the Malmoi GitHub App first — use Authorize GitHub App below.",
      reauthorize: "Your GitHub App authorization expired. Use Reauthorize GitHub App.",
      "repo-not-installed": "The app isn't installed on this repository. Install it, then connect again.",
      "installation-forbidden": "This account can't reach that installation. Ask the repository owner for access.",
      "repo-forbidden": "This account can't reach that repository. Ask the repository owner for access.",
      // 다음 행동이 사람이다 — 쓰기 권한을 가진 사람이 만들거나 권한을 받아야 한다(sec-audit-3 1a).
      "repo-read-only": "This account can only read that repository. Connecting it needs write access — ask the repository owner.",
      // 원인이 고정된 거부에 "잠시 뒤 다시"를 보이면 사용자가 같은 버튼을 반복해서 누른다.
      unavailable: "Something went wrong. Try again in a moment.",
      fallback: "The GitHub connection failed. Try again.",
    },

    /**
     * `onboardErrorMessage` — `OnboardError` 열여덟 + 폴백.
     *
     * ⚠️ **다섯이 없다**(`installation-forbidden`·`repo-forbidden`·`repo-read-only`·`repo-not-installed`·`unavailable`) —
     * 연결 화면과 같은 거부라 `connect`의 문구를 그대로 쓴다. 같은 거부에 문구가 두 벌이면 안 된다.
     */
    onboarding: {
      "no-installations": "Your GitHub account is connected. Install the Malmoi GitHub App on your personal account or organization to choose repositories.",
      "no-repos": "Your GitHub account is connected, but no repositories are available. Choose repositories the Malmoi GitHub App can access in GitHub installation settings.",
      // 이유를 말한다 — 수동 지정으로 가는 근거다 (로케일이 하나뿐인 리포는 붙일 수 없다).
      // ⚠️ **다음 행동까지 말한다** (launch-readiness L2.7) — 로케일 하나인 리포 주인이 할 수 있는 일은 둘째 파일뿐이다.
      "no-candidates": "We couldn't find translation files. Malmoi needs translation files in 2 or more languages — if this repository has only one, add a file for a second language and try again.",
      // 수동 지정을 권하지 않는다 — 확정의 재검증이 같은 스냅샷을 읽어 같은 갈래를 다시 낸다.
      // ⚠️ **막다른 길임을 끝에 말한다** (L2.7) — 안 말하면 사용자가 같은 리포로 다시 시도한다.
      "tree-truncated": "This repository has too many files to search, and setting the path yourself hits the same limit. Malmoi can't connect repositories this large yet.",
      "base-branch-missing": "We can't read the default branch. Check that the repository has commits.",
      // ⚠️ **라벨이라 문장이 아니다** — 후보 줄의 "3 languages · 4 keys" 자리에 그대로 들어간다.
      "key-count-failed": "Key count unavailable",
      "manual-no-match": "No files of that format at that path. Check the path and the format.",
      // ⚠️ **경로를 의심하게 하지 않는다** — 입력은 멀쩡하고 확인값이 낡았다. 할 일은 재탐지 하나다.
      "sample-expired": "This preview has expired. Detect the files again to see it.",
      // ⚠️ **파일이 없다고 말하지 않는다** (malmoi#99) — 파일은 있고 언어가 하나다. 할 일은 경로가 아니라 둘째 파일이다.
      "single-locale": "Only one language was found at that path. Malmoi needs translation files in 2 or more languages — add a file for a second language and try again.",
      "slug-taken": "That address is taken. Pick another one.",
      "limit-reached": (limit: number): string => `You can create up to ${limit} projects.`,
      "invalid-slug": (max: number): string =>
        `An address can use lowercase letters, numbers, '-', '.' and '_', up to ${max} characters. 'new' is reserved.`,
      // 온보딩은 브랜치를 **고르는** 자리다 — 설정 화면(고치는 자리)과 안내가 갈린다.
      "invalid-branch": "That branch name isn't valid. Pick another branch.",
      // malmoi#126 — 형식은 맞다. 왜 안 되는지(Malmoi가 쓰는 브랜치)를 말해야 사용자가 다른 이름을 고른다.
      "sync-branch": "Malmoi publishes translations from that branch, so it can't be the base branch. Pick another branch.",
      "not-awaiting": "The first sync already finished. Running it again here would overwrite edited translations, so it's blocked.",
      "resource-limit": "These translation files are too large or too deeply nested to sync. Reduce their size and try again.",
      // ⚠️ **재시도는 Sources에 있다** (audit #6) — 전엔 "from settings"였고 설정 화면에 그 버튼이 없었다.
      "ingest-failed": "The first sync failed. You can try again from Sources.",
      // 번역자가 읽는다 — 무엇을 기다리는지와 누가 끝낼 수 있는지를 말한다.
      "not-ready": "This project isn't ready yet. A project owner needs to finish setting it up.",
      // "입력한 값은 그대로"를 쓰지 않는다 — 중간 상태를 저장하지 않으므로 거짓이다.
      unauthorized: "Your session ended. Sign in again and start over.",
      fallback: "We couldn't create the project. Start over and try again.",
    },

    /**
     * `updateRepositorySettings`의 거부 셋 (6b-3). ⚠️ **`noop`은 여기 없다** — 그것은 거부가
     * 아니라 "쓸 것이 없다"이고 화면은 성공으로 보인다.
     */
    repositorySettings: {
      "invalid-branch": "That's not a valid branch name. Spaces and the characters ~^:?*[ aren't allowed.",
      "sync-branch": "Malmoi publishes translations from that branch, so it can't be the base branch. Pick another branch.",
      // 왜 없는지를 말한다 — 목록은 리포의 로케일 파일에서 온다.
      "unknown-locale": "This repository has no translation file for that language.",
      // 되돌릴 수 있는 상태이므로 무엇을 해야 하는지 말한다.
      "orphaned-locale": "That language's file is gone from the repository. Bring it back first.",
    },
  },

  /**
   * `adapterErrorMessage` — `AdapterErrorCode` 스물둘 + 폴백 (CLAUDE.md 코드 컨벤션, 6b-1).
   *
   * ⚠️ **이 문구들은 접힌 자리에만 간다** — 온보딩 결과의 `<details>` · Publish warnings · CLI.
   * 그래도 사전에 있는 이유는 **번역자와 개발자가 같은 화면에서 읽기 때문**이다: 자유 문자열로
   * 두면 en으로 고쳐도 ko가 따라오지 않는다.
   *
   * ⚠️ **git 어휘를 쓰지 않는다** (DESIGN §10) — `original-file-missing`이 Publish의 `<details>`에
   * 실려 번역자가 읽는다. "base 트리"·"PR"이 그 자리에 가면 안 된다.
   *
   * 문체는 "무엇이 안 됐는지 + 그래서 어떻게 됐는지"다. 무엇을 하라는 말은 없다 — 고칠 수 있는
   * 사람은 리포를 가진 개발자이고, 그 안내는 상위 문구(`ingestHeadline`·`pullMessage`)가 든다.
   */
  adapterErrors: {
    "parse-failed": "The file couldn't be parsed.",
    "parse-crashed": "The parser failed on this file.",
    "root-not-object": "The top level of the file isn't a key-value map.",
    "no-default-export": "This file has no default-export object.",
    "invalid-chrome-key": "The key uses characters chrome.i18n doesn't allow (allowed: A-Z a-z 0-9 _ @).",
    "missing-message-field": "The entry has no 'message' field.",
    "value-not-message-object": "The value isn't a { message } object.",
    "value-not-string": "The value isn't text.",
    "value-not-string-or-container": "The value isn't text, an object or an array.",
    "value-not-string-literal": "The value isn't a plain text literal.",
    "shorthand-property": "The property is shorthand, so its value can't be read — it looks like an imported reference.",
    "not-property-assignment": "This isn't a property assignment.",
    "duplicate-key": "The key appears twice, so one of the two values is lost.",
    "duplicate-property": "The key is defined twice. Malmoi uses the one it edits and leaves the other as it is.",
    "key-shadowed": "The key is the start of a longer key, so it has no slot of its own — this value wasn't written.",
    "write-parse-failed": "The file couldn't be parsed, so it was left untouched.",
    "write-no-default-export": "This file has no default-export object, so it was left untouched.",
    "write-locale-object-missing": "This language isn't in the file, so its translations weren't written.",
    "write-slot-not-string-literal": "The value isn't in a plain text slot, so it wasn't written.",
    "write-slot-not-scalar": "The value isn't in a plain text slot (it's an alias, a map or a list), so it wasn't written.",
    "write-slot-missing": "There's no slot for this key, so it was skipped — the file's structure would have to change.",
    "original-file-missing": "The original file isn't in the repository, so this language was skipped and wasn't sent.",
    "download-failed": "We couldn't download the file.",
    /** ⚠️ 코드가 아니다 — 모르는 코드가 왔을 때의 문장이라 union 밖에 있어야 한다. */
    fallback: "We couldn't read this file.",
  },
} as const;
