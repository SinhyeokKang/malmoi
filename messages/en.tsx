import type { ReactNode } from "react";

/**
 * **UI 문자열의 단일 출처** (design §3.1). 라이브러리를 넣지 않는다 — 필요한 것은 "문자열이 한 곳에
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
 * 각 문구 모듈이 `satisfies Record<Union, string>`으로 잡는다 (design §3.1.2).
 *
 * 문체는 DESIGN §10이다 — sentence case · 라벨에 마침표 없음 · "please"·"sorry" 금지 ·
 * 오류는 다음 행동을 말한다 · **편집자 화면에 git 어휘를 쓰지 않는다.**
 */
export const en = {
  surfaces: {
    label: "Translation surface", title: "Translation surfaces", add: "Add surface",
    description: "Choose another set of translation files from this repository.",
    workflow: "Add this step to your existing workflow. It uses the same PUSH_TOKEN.",
    baseLocale: "Source language", confirm: "Check files", cancel: "Cancel", settings: "Back to settings",
    open: "Open translations", connect: "Connect GitHub", conflict: "These files already belong to another translation surface:",
    failed: "We couldn't add this surface. Your existing translations are unchanged. Try again.",
    missingTitle: "Translation surface unavailable",
    missingDescription: "This page may have moved or the surface may no longer be active. Open your projects to continue.",
    projects: "Open projects",
  },
  // ⚠️ 화면 섹션은 **그 화면을 만드는 커밋이 더한다** — 빈 껍데기를 미리 두지 않는다("만든 것이 실제로
  // 호출되는가"). 지금 있는 것은 T2~T4가 실제로 읽는 것뿐이고, 로그인·초대 문구는 T6·T8이 더한다.
  common: {
    retry: "Try again",
    appName: "malmoi",
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
    /** 셸의 전역 항목 — 사이드바 하단과 사용자 메뉴가 같은 문구를 쓴다. */
    nav: {
      /**
       * ⚠️ **라벨과 순서는 Figma 시안(`212:944`)이 정본이다** (8-3). 2026-09-09의 IA(PRODUCT §7.7)에서
       * 바뀐 것: `Your work` 구역 라벨이 **사용자 이름**으로, `All projects`→`Projects`,
       * `Your account`→`Settings`, `Overview`→`Home`, `Languages`→`Locales`,
       * `Settings`(프로젝트)→`Project settings`. `New project`는 사이드바에서 빠졌다.
       */
      projects: "Projects",
      /**
       * 사용자 축의 설정(`/account`) — **프로젝트 축의 `Project settings`와 이름으로 갈린다.**
       * ⚠️ 유저 메뉴도 같은 문구를 쓴다: 한 곳을 가리키는 이름이 둘이면 그중 하나가 낡는다.
       */
      settings: "Settings",
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
      locales: "Locales",
      translations: "Translations",
      members: "Members",
      logs: "Logs",
      projectSettings: "Project settings",
      signOut: "Sign out",
      /** ⚠️ **사이드바에는 없다** (8-3) — 목록 화면의 버튼과 빈 상태만 쓴다. */
      newProject: "New project",
      userMenu: "Account menu",
      /** 헤더의 로고가 링크다 — 그림뿐이라 이름이 없으면 스크린리더가 URL을 읽는다. */
      appHome: "malmoi home",
    },
    /**
     * 프로젝트 화면 오른쪽의 320px 패널 (8-2). **탭 둘만 세우고 내용은 8-P가 채운다** —
     * diff는 UI가 아니라 새 서버 능력이라(커밋 없이 렌더만 하는 경로) 여기서 UI만 먼저 만들면
     * 빈 껍데기를 두 번 그린다.
     */
    panel: {
      label: "Project panel",
      /**
       * ⚠️ **랜드마크 이름과 갈라야 한다** — `<aside>`와 그 안의 세그먼트 컨트롤이 같은 이름을 들면
       * 스크린리더가 둘을 "Project panel"로 똑같이 읽고 구별할 단서가 role뿐이다.
       */
      view: "Panel view",
      general: "General",
      changes: "Changes",
      /** ⚠️ **"곧 나온다"고 쓰지 않는다** — 지키지 못할 약속이고, 지금 참인 것은 비어 있다는 사실이다. */
      empty: "Nothing here yet.",
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
    unreadable: "Unavailable",
  },

  /**
   * 로그인 화면 (8-1b — Figma 시안).
   *
   * ⚠️ **tagline과 모형 카드 문구 넷이 사라졌다.** 시안이 제목 한 줄이고 우측 장식이 키비주얼
   * 이미지로 바뀌었다 — 제품 설명은 **랜딩이 맡는다**(2026-09-10 사용자). 그때까지 비개발자가
   * 이 제품이 뭔지 알 수 있는 자리가 앱에 없다는 것이 받아들인 대가다.
   */
  signIn: {
    title: "Sign in to malmoi",
    backToInvitation: "Back to invitation",
    github: "Continue with GitHub",
    google: "Continue with Google",
    /** 약관 — 링크 앞뒤로 갈린다. Terms는 만들지 않는다(유료 서비스가 아니다). */
    consent: { before: "By clicking Continue through a third party you accept the malmoi ", link: "Privacy Policy" },
    footer: { copyright: "© 2026 malmoi", github: "GitHub", privacy: "Privacy Policy", docs: "Docs" },
    /**
     * 우측 장식의 문구 둘. ⚠️ **키비주얼을 `alt=""`로 둘 수 있는 근거가 이 두 줄이다** — 이미지
     * 안에 구운 텍스트가 말하는 것을 여기가 이미 말하고 있어야 그것이 장식이 된다.
     */
    hero: { top: "Connect your projects", bottom: "Translate & ship together" },
  },

  /**
   * Home(`/projects/:slug`) — 프로젝트 진입의 착지점 (6b-6).
   *
   * ⚠️ **다른 화면의 지표 문구를 복제하지 않는다** (PRODUCT §7.7 결정 2). 키 수·미배포 건수는 번역
   * 화면 툴바(`m.translations`)의 것이고, 적재 상태는 설정(`m.settings.status`)의 것이다.
   */
  /**
   * 공개 문서 둘 — 로그인 화면 푸터가 가리킨다 (8-1a).
   *
   * ⚠️ **아직 placeholder이고 출시 전에 채운다.** 라우트를 먼저 딴 이유는 시안 푸터가 그것을
   * 가리키기 때문이고, 링크가 죽어 있는 것보다 "준비 중"이 낫다는 판정이다.
   *
   * ⚠️ **`back`이 없으면 사용자가 갇힌다** — 이 둘은 셸 **밖**이라 사이드바도 푸터도 없고
   * 뒤로가기 말고 돌아올 길이 없다.
   */
  publicDocs: {
    back: "Back to sign in",
    privacy: {
      title: "Privacy Policy",
      body: "We're still writing this. It will be here before launch.",
    },
    /**
     * ⚠️ **`title`의 소비자가 둘이다** — 이 화면의 제목과 **사이드바 하단 항목**
     * (`lib/shell/nav.ts`). 2026-09-11까지 후자가 `nav.help: "Help"`로 갈려 있었는데,
     * 같은 라우트를 가리키는 라벨이 둘이면 하나가 낡는다.
     */
    docs: {
      title: "Docs",
      body: "We're still writing this. It will be here before launch.",
    },
  },

  home: {
    /** ⚠️ **착지 클릭 하나를 갚는 주된 동작이다** (결정 1의 대가) — 화면당 하나인 primary가 이것이다. */
    openTranslations: "Open translations",
    progress: {
      title: "Languages",
      /** orphaned 로케일은 이 목록에 없다 — 그 열은 편집이 막혀 있어 일이 아니다. */
      description: "Pick a language to start from. Values waiting for review don't count as translated.",
      /**
       * ⚠️ **도달 가능한 상태다** — 적재는 끝났는데 살아 있는 로케일이 0인 경우(파일이 전부
       * 사라졌다). 로케일 화면의 "첫 적재 뒤에 나타난다" 문구를 빌려 쓰면 **이 상태에선 거짓**이라
       * 따로 쓰고, 사유가 사는 자리로 보낸다.
       */
      empty: "No languages to translate — their files are missing from the repository.",
      emptyLink: "See languages",
    },
    activity: {
      title: "Recent activity",
      /** ⚠️ 첫 적재 뒤에도 한동안 비어 있다 — 실패가 아니라 아직 아무 일도 없는 것이다. */
      empty: "Nothing yet. Edits, CI pushes and what you send back all show up here.",
      /** 편집자 이름이 없을 수도 있다 — `actorLabel`이 못 찾으면 원문이거나 `null`이다. */
      edit: (who: string | null, key: string, locale: string): string =>
        who === null ? `${key} was edited in ${locale}` : `${who} edited ${key} in ${locale}`,
      push: "CI pushed source strings from the repository",
      publish: "Translations were sent back for review",
      pr: "Open pull request",
    },
  },

  /**
   * sync 이력 (7단계 — sync-runs design §6). **과거 시제다** — Publish Alert가 "지금 무슨 일이
   * 일어났나"를 현재 시제로 말하고, 이 화면은 "그때 무슨 일이 있었나"라 어휘가 갈려야 한다.
   */
  logs: {
    description: "Every time your translations were sent back to the repository.",
    columns: {
      when: "When",
      trigger: "Started by",
      result: "Result",
      changed: "Files",
      reason: "Reason",
    },
    status: {
      succeeded: "Sent",
      /** ⚠️ **"branch equals base"가 아니다** — 읽는 사람은 번역 편집자다. */
      skipped: "Nothing to send",
      failed: "Failed",
      /** ⚠️ 줄임표는 진행 중에만이다 (DESIGN §10). */
      running: "Running…",
    },
    trigger: {
      cron: "Nightly",
      /** FK가 `SetNull`이라 이력은 남고 저자만 빈다. */
      removed: "Removed user",
    },
    /**
     * 값이 없는 칸. **실패의 변경 수는 0이 아니라 부재다** — 0으로 쓰면 "안 바뀌었다"는 거짓말이고,
     * 그건 관측이 있었다는 뜻이 된다. 사유가 없는 행도 같은 글자를 쓴다(빈 칸은 열이 깨진 것처럼 보인다).
     */
    none: "—",
    /** 버린 값이 있는 실행. **성공한 행에도 붙는다** — 조용히 숨기면 ARCHITECTURE §0 불변식 9 위반이다. */
    warnings: (count: number): string => (count === 1 ? "1 dropped" : `${count} dropped`),
    empty: {
      title: "No syncs yet",
      description: "This fills in the first time your translations are sent back.",
    },
    older: "Older",
    /**
     * ⚠️ **과거 시제이고 git 어휘가 없다.** 이 문장을 읽는 사람은 실패를 겪은 번역 편집자이고,
     * 그가 할 수 있는 일(개발자에게 말한다·기다린다)까지 말한다.
     */
    reasons: {
      "base-unreadable": "We couldn't read your repository. Ask your developers to check the app's access.",
      "not-installed": "The app wasn't connected to the repository. Ask your developers to reconnect it.",
      "glob-matched-nothing": "The translation files weren't where we expected. Ask your developers.",
      "github-error": "GitHub didn't answer. The next nightly run tries again.",
      "db-unavailable": "We couldn't reach our own storage. The next nightly run tries again.",
      stale: "This run stopped before it finished.",
      unknown: "Something went wrong. The next nightly run tries again.",
      fallback: "Something went wrong. Tell your developers if it keeps happening.",
    },
  },

  /**
   * 보관 (7단계 — sync-runs design §6.2). ⚠️ **"삭제"라고 쓰지 않는다** — 되돌릴 수 있고,
   * 자동 영구 삭제는 비목표다 (PRODUCT §7.9).
   */
  archive: {
    title: "Archive project",
    description: "Stop this project without deleting anything.",
    action: "Archive project",
    /** 되돌리기는 확인을 묻지 않는다 — 잃는 것이 없다. */
    restore: "Restore project",
    archived: (when: string): string => `Archived ${when}.`,
    confirm: {
      title: (name: string): string => `Archive ${name}?`,
      body: "Everyone stops editing, the nightly send stops, and pushes from your repository are refused.",
      /** ⚠️ 열린 PR을 닫지 않는다 (PRODUCT §7.9) — 사람이 알고 판단해야 한다. */
      openPr: "What you already sent stays open for your developers:",
      openPrLink: "See what's open",
      /** ⚠️ 조회 실패를 "없다"로 접지 않는다 (POSTMORTEM 2026-09-03). */
      prUnknown: "We couldn't check what's still open for your developers.",
      cancel: "Cancel",
    },
    failed: (reason: string): string => `Couldn't change this: ${reason}`,
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
    /** 행 메타 — 리포와 멤버 수 둘뿐이다. ⚠️ **복수형을 함수가 든다**(시안의 "1 members"는 틀렸다). */
    memberCount: (n: number): string => `${n} member${n === 1 ? "" : "s"}`,
    /**
     * 검색이 걸러 0건일 때의 빈 상태 (2026-09-11 사용자 — `EmptyState` 형으로 올렸다).
     *
     * ⚠️ **"프로젝트가 없다"(`empty`)와 같은 형이되 액션이 반대다.** 그쪽은 만들라고 하고(primary),
     * 여기는 **되돌리라고** 한다 — 프로젝트는 이미 있고 화면이 좁혀져 있을 뿐이다.
     *
     * ⚠️ **제목이 질의를 안 싣는다** — 긴 질의가 제목을 밀어내고, 무엇을 쳤는지는 검색창이 이미
     * 보여준다. 설명이 그것을 말한다.
     *
     * ⚠️ **`byFilter`가 2026-09-13에 사라졌다** (projects-list §1.4). 좁히는 축이 검색 하나가 되면서
     * "탭 0건"이라는 갈래 자체가 없어졌다 — 남겨 두면 탭이 있던 시절의 화석이 사전에 남는다.
     */
    narrowed: {
      title: "No results",
      bySearch: (q: string) => `No project matches "${q}".`,
      /**
       * ⚠️ **`Clear filters`에서 바뀌었다** — 되돌릴 축이 질의 하나뿐이다. 결과 줄의 같은 동작도
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
        "Connect a repository and malmoi will find the locale files for you. Nothing is written back until you send changes.",
    },
    /**
     * 머리의 Summary 넷 (projects-list design §11.3). **내 멤버십 중 보관하지 않은 프로젝트 전체**의
     * 값이고 검색·그룹에 흔들리지 않는다.
     *
     * ⚠️ **누를 수 없다** — 계정 단위 큐 화면이 생기기 전까지는 표시 전용이다(열린 결정 1).
     * 링크로 만들면 아직 없는 화면을 가리키게 된다.
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
     * 검색 중의 결과 줄. ⚠️ **총계는 좁히기 전의 값**이라 "n of total"이 성립한다 — 배지가 `1`로
     * 바뀌면 "프로젝트가 하나 남았다"로 오읽히므로, 좁혀진 수는 여기가 들고 분모가 그 옆에 선다.
     *
     * ⚠️ **질의가 문구 안에 없다** — 캔버스가 그 낱말만 foreground로 칠하므로 화면이 별개 노드로
     * 그린다. 문자열에 넣으면 그 강조를 만들 자리가 사라진다.
     */
    searchResult: (n: number, total: number): string =>
      `${n} of ${total} project${total === 1 ? "" : "s"} match`,
    /** ⚠️ **`narrowed.reset`과 같은 값이어야 한다** — 한 화면에서 같은 동작이 두 이름을 갖지 않는다. */
    clearSearch: "Clear search",
    /**
     * Meter 자리에 **바 대신 서는 문장** (design §5). 값이 없는 상태에서 0% 바를 그리면
     * "0% 번역됨"으로 읽히는데, 그 프로젝트는 아직 셀 것이 없는 상태다.
     */
    meter: {
      note: {
        waiting: "Waiting for the first import.",
        importing: "Importing locale data.",
        failed: "No data imported.",
        setup: "Connect the GitHub App to continue.",
      },
    },
    /**
     * 행 아래 띠 — **다음 한 수**를 말한다 (design §5). 겹치면 하나만 그리고 우선순위는
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
        `${n} string${n === 1 ? " is" : "s are"} translated and waiting for review.`,
      unsent: (n: number): string =>
        `${n} edit${n === 1 ? " has" : "s have"} not been sent to GitHub yet.`,
      prOpen: (n: number): string => `Pull request #${n} is open — merge it to finish.`,
      /** ⚠️ **base 브랜치 이름을 그대로 넣는다** — `main`을 하드코딩하지 않는다. */
      repoAhead: (n: number, baseBranch: string): string =>
        `${n} locale file${n === 1 ? "" : "s"} changed on ${baseBranch} after your last import.`,
      setup: "Finish setup to start translating.",
      needsReconnect:
        "GitHub App access was revoked — pushes and pull requests stop until it is reconnected.",
      /** 실패 사유(`importFailure.*`) 뒤에 붙는다 — 설정 화면이 그 상세를 든다. */
      checkDetails: "Check the import details.",
      /** EDITOR 갈래. 링크를 뺀 자리에 "누가 할 수 있는지"를 말한다. */
      askOwner: {
        reconnect: "Ask a project owner to reconnect it.",
        setup: "Ask a project owner to finish setup.",
      },
      action: {
        review: "Review",
        /** ⚠️ **Publish가 아니다** — 번역 화면 툴바의 버튼으로 데려갈 뿐이다 (PRODUCT §7.7). */
        send: "Send changes",
        viewPr: "View on GitHub",
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
      awaiting_first_sync: "Pending",
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
     * 마지막 임포트가 실패했을 때의 **사유 문장** (projects-list design §3.35).
     *
     * ⚠️ **저장된 것은 코드 하나다** — 파서 원문·파일 경로·행 번호는 DB에 들어가지 않는다.
     * `AdapterError`가 모든 포맷에 행 번호를 주지 않으므로 `line 41` 같은 값을 지어낼 수도 없고,
     * 이 문장은 **번역자도 보는 목록**에 나가므로 파서 어휘를 쓰지 않는다 (DESIGN §10).
     * 상세 진단은 CI 로그에 남아 있고 화면은 그리로 보낸다.
     *
     * ⚠️ **`contactOwner`가 EDITOR 갈래다** — `View details`가 `project:settings` 뒤라
     * 그 링크를 보여주면 눌러서 거절당하는 경험이 된다 (PRODUCT §3).
     */
    importFailure: {
      parseFailed: "Locale files could not be parsed.",
      parseCrashed: "A locale file stopped the parser.",
      invalidLocaleData: "Some locale entries could not be read.",
      prepareFailed: "The locale format could not be read on the last import.",
      /** 데이터는 들어갔다 — "실패"가 아니라 "일부가 빠졌다"여야 사용자가 목록의 숫자를 믿는다. */
      partialImport: "Some locale files were left out of the last import.",
      importFailed: "The last import did not finish.",
      contactOwner: "Ask a project owner to check the import.",
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
       * ⚠️ **카드 설명문이 없어졌다** (2026-09-13). 머리 블록에는 설명 슬롯이 없고, 두 칸의
       * 소유자가 다르다는 사실은 **이메일 칸 옆의 `emailSource` 한 줄**이 그 자리에서 말한다 —
       * 화면 위쪽의 산문보다 필드 옆의 한 줄이 실제로 읽힌다.
       */
      name: "Name",
      email: "Email",
      /** 이메일 칸 옆 출처 문구 — 고칠 수 없는 이유를 그 자리에서 말한다. */
      emailSource: "Comes from the account you sign in with.",
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
      description: "This is write access to your repositories, not a way to sign in.",
      notConnected: "Not connected.",
      /**
       * 연결된 행의 보조 줄.
       *
       * ⚠️ **프로젝트 수를 말하지 않는다** (2026-09-14 리뷰 🔴1). 전에는 `Connected · N projects use
       * this connection`이었는데, 그 N이 세던 것은 **내가 OWNER인 모든 프로젝트**였고 그중 이 연결에
       * 실제로 의존하는 것은 없었다 — 야간 pull·PR은 App **설치 토큰**이 내고 사용자 토큰을 한 줄도
       * 안 읽는다. 숫자가 근거가 될 수 없어 걷었다.
       */
      connected: "Connected",
      /** 행의 제목 자리 — 연결된 계정이 없을 때다. 핸들이 있으면 그것이 제목이다. */
      rowName: "GitHub",
      // 제목이 대상을 명시한다 — 이 화면에 같은 라벨의 [Disconnect]가 둘이다.
      confirmDisconnect: "Disconnect GitHub from malmoi?",
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
      description: "Close what's open right now.",
    },
    sessions: {
      title: "Sign out everywhere",
      confirmTitle: "Sign out on all devices?",
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
      description: "Confirm with the account you use to sign in. This signs you out on all devices, including this one.",
      button: "Confirm and sign out everywhere",
      complete: "You have been signed out on all devices. Sign in again to continue.",
      failed: "We could not sign you out everywhere. Try again.",
      cancelled: "Confirmation was cancelled. You are still signed in. Try again when you are ready.",
      expired: "This confirmation expired. Start again to sign out everywhere.",
      wrongAccount: "Choose the same account you use to sign in to malmoi, then try again.",
    },
    signOut: {
      title: "Sign out",
      description: "You'll need to sign in again to open your projects.",
      /** ⚠️ **확정이 primary다** — 넷 중 유일하게 잃는 것이 없다 (재로그인 한 번이다). */
      confirmTitle: "Sign out?",
      /**
       * ⚠️ **앞 문장이 신규다** — 되돌릴 수 없는 넷 중 이것만 잃는 것이 없다는 사실을 그 자리에서
       * 말한다. 편집 중에 눌릴 수 있는 버튼이라 "저장 안 한 것이 날아가나"가 첫 질문이다.
       */
      confirmHint: "Unsent edits stay saved on malmoi. You'll need to sign in again to open your projects.",
    },
    picture: {
      upload: "Image upload",
      delete: "Delete",
      /**
       * ⚠️ **"as-is"가 EXIF를 안 벗긴다는 판정을 말하는 자리다** (2026-09-13 사용자). 빼면 그
       * 판정이 화면에서 사라지고, 위치 정보가 실린 사진을 올린 사람이 그 사실을 알 길이 없다.
       */
      caption: "PNG or JPEG, up to 800 KB. Uploaded as-is.",
      /** ⚠️ **사유 없는 `disabled`를 만들지 않는다** (POSTMORTEM 2026-09-06). */
      noPicture: "You haven't added one yet.",
      /**
       * ⚠️ **막는 이유가 둘이라 문구도 둘이다** (2026-09-14 2차 리뷰 R5). 둘은 **사진이 없다**와
       * **다른 하나가 돌고 있다**이고, 뒤의 것은 스피너가 **이 버튼에 없으므로** 화면에도 접근성
       * 트리에도 아무 설명이 없었다 — 스크린리더에는 *"…, 버튼, 사용 불가"*까지만 들린다.
       */
      busy: "Wait for the current upload to finish.",
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
        ? `Imported ${count === 1 ? "1 key" : `${count} keys`}.`
        : `Imported ${count === 1 ? "1 key" : `${count} keys`}, but ${failed} couldn't be read.`,

    /**
     * 모달 껍데기 (new-project-modal design §7). **[Back]·[Next]는 껍데기가 소유한다** — 단계는
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
        description: "Pick a repository and the branch malmoi should read.",
      },
      files: {
        title: "Which files hold your strings?",
        description: (n: number, repo: string, branch: string): string =>
          `${n === 1 ? "1 set" : `${n} sets`} matched on ${repo} · ${branch}. Check the keys before you continue.`,
        loading: (repo: string, branch: string): string => `Reading ${repo} · ${branch}…`,
        /** 예외 E — 후보 0개. ①로 되돌리지 않고 여기서 수동 지정을 편다. */
        emptyTitle: "Where are your locale files?",
        /**
         * ⚠️ **후보 0개에 "Check the keys before you continue"를 쓰지 않는다** (2026-09-13 실물).
         * 확인할 키가 없는 화면이 키를 확인하라고 말한다 — 설명은 **지금 할 일**(경로를 치면 확인해
         * 준다)을 말해야 한다 (핸드오프 3a).
         */
        emptyDescription: (repo: string, branch: string): string =>
          `malmoi didn't find any on ${repo} · ${branch}. Set the path and it will check.`,
      },
      naming: {
        title: "Project details",
        description: "The base language decides which keys exist. Name and address come from the repository.",
      },
      result: {
        title: "malmoi is ready",
        description: "Add the push token to the repository so CI can send translations back.",
        /**
         * ⚠️ **결과는 설명 줄이 말한다** (핸드오프 1d·4f·4g). 성공한 적재에 `Alert`를 세우지 않는
         * 것이 요지다 — 가장 흔한 상태가 가장 조용해야 한다(DESIGN §6.1). 실패·부분 실패만 본문에
         * 그릇을 든다.
         */
        descriptionFailed: "The project exists. The first import didn't finish.",
      },
    },

    /** ①①' — 셋이 사용자에게 요구하는 일이 다르다: 계정 연결 · App 설치 · 설치에 리포 추가 (DESIGN §6.7). */
    empty: {
      connect: {
        title: "Connect your GitHub account",
        description: "The connection is only used to see which repositories have the malmoi app installed.",
        action: "Connect GitHub",
        reauthorize: "Reconnect GitHub",
      },
      /** ⚠️ **제목은 마침표 없는 짧은 구다** (DESIGN §10) — 사유 문장은 `description`이 든다. */
      noInstallations: "No installation found",
      noRepos: "No repositories selected",
      install: "Install the app",
      addRepos: "Add repositories to the installation",
      /** ⚠️ `GITHUB_APP_SLUG`가 없으면 설치 링크가 조용히 사라진다 — 그때 할 수 있는 일을 말한다. */
      noLink: "Ask your administrator to install the malmoi app on the repository.",
      afterInstall: "Refresh this page once you're done.",
      listFailed: "We couldn't load your repositories.",
      retryHint: "Refresh this page in a moment.",
    },

    /** ② 리포 고르기 */
    repo: {
      /** 리포 목록의 그룹 이름 — `RadioGroup`이 접근 이름 없이 서면 "라디오 그룹"으로만 읽힌다. */
      list: "Repositories",
      search: "Find a repository by name",
      none: "No repository matches that name.",
      /** 상대 시각은 `lib/relative-time.ts`가 만든다 — 사전은 그것을 감쌀 뿐이다. */
      pushedAt: (rel: string): string => `Pushed ${rel}`,
      branch: "Branch",
      branchHelp: "malmoi reads the locale files from this branch. You can change it later in project settings.",
      /** 예외 D — 목록 조회만 실패했다. **"브랜치가 없다"가 아니다** (POSTMORTEM 2026-09-03). */
      branchDefault: "Using the repository's default branch.",
      branchTooMany: "This repository has too many branches to list — type the branch name.",
      notListed: "Don't see a repository?",
      loading: "Looking for repositories with the malmoi app installed…",
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
      candidates: "Locale file candidates",
      keys: (n: number): string => (n === 1 ? "1 key" : `${n} keys`),
      /** ② 좌측 후보 행의 보조 줄 — 폭 240이라 로케일 코드를 나열할 자리가 없다. */
      summaryShort: (locales: number, keys: string): string => `${locales} languages · ${keys}`,
      notListed: "Not listed?",
      setPath: "Set the path yourself",
      /** ② 우측 키·값 표. */
      preview: {
        key: "Key",
        value: "Value",
        more: (n: number): string => (n === 1 ? "1 more key" : `${n} more keys`),
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
        noneDescription: "Set a path and malmoi will show the keys it finds. If no file matches, the project isn't created.",
        /** 키 행만 스크롤하는 영역의 이름 — 그 안에 포커스 가능한 것이 없어 컨테이너가 직접 받는다. */
        rows: "Preview rows",
        /**
         * ⚠️ **빈 칸과 가른다.** 정말 비어 있으면 빈 칸이고, 못 읽었으면 이 문장이다 — ②가
         * "ko 열이 비어 있다"를 말하는 화면이라 이 구별이 기능의 목적 자체에 걸린다 (design §3.4).
         */
        unavailable: "We couldn't read this file.",
      },
      manual: {
        summary: "Can't find your files?",
        format: "File format",
        path: "Path",
        /**
         * 문장을 사전이 소유한다 — 노드로 쪼개면 ko가 어순을 바꿀 수 없다 (design §3.1.3).
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
        `${lang} has ${n} keys fewer than ${base}. Those keys would be left out if ${lang} led.`,
      /**
       * 예외 G — 제출 뒤 그 필드에 선다.
       *
       * ⚠️ **`is free`라고 단언하지 않는다** — `suggestAlternateSlug`는 존재 확인을 하지 않는다
       * (design §3.5). 확인한 적 없는 것을 단언하면 POSTMORTEM 2026-09-09의 모양이다.
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

    /** ⑤⑥ 결과 — **토큰 원문은 이 화면에서만 보인다** (design §3.13). */
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
            rotate it in settings.
          </>
        ),
      },
      ingest: {
        retry: "Try again",
        /** 못 읽은 파일 — 건수만으로는 사용자가 할 일이 없다 (ARCHITECTURE §0 불변식 9). */
        couldNotRead: (path: string): string => `Could not read ${path}`,
        /** `<details>`의 요약 — 그 안은 어댑터가 준 원문이다 (6b-1이 코드화한다). */
        diagnostics: "Details",
        refsHint: "Code references arrive after your first CI push. You can start translating now.",
        open: "Start translating",
        /** ④ 적재 중 info — `role="status"`다 (`Alert`의 `role="alert"`는 `danger`일 때만 붙는다). */
        importing: (path: string, branch: string): string => `Importing… reading ${path} on ${branch}.`,
        /** 예외 H — 토큰 블록은 그대로 보이고, 복구 경로 둘을 말한다. */
        failedHint:
          "The project is in your list as Waiting for first import. You can retry from project settings.",
      },
      workflow: {
        saveAs: "Save as",
      },
      failed: "We couldn't finish. Try again in a moment.",
    },
  },

  translations: {
    /** 카운터 — ICU가 아니라 삼항 하나다 (PRODUCT §4.2). */
    keys: (n: number): string => (n === 1 ? "1 key" : `${n} keys`),

    /** ⚠️ URL 값은 `"*"`다 — 이건 그 옵션의 라벨이다 (`ALL_NAMESPACES`). */
    allNamespaces: "All namespaces",

    /**
     * 배지 (DESIGN §6.2) — **"Translated"가 없다**: 가장 흔한 상태가 가장 조용해야 한다.
     *
     * ⚠️ **`Untranslated`가 8-4에서 사라졌다** — 값 칸이 비어 있는 것이 이미 그 말이고, 남는
     * 신호는 입력의 `placeholder`다(spec Q3 — 배지·상태 필터·입력 테두리가 **같은 배송에서**
     * 사라지므로 그 하나가 유일하다). `needsReview`는 값이 차 있어 다른 신호가 없으므로 남는다.
     */
    orphaned: "Orphaned",
    needsReview: "Needs review",
    /** 셀 메타 — `updatedBy`가 사람일 때만 붙는다. push가 덮은 셀에는 표기가 없다 (design §3.6). */
    editedBy: (name: string): string => `Edited by ${name}`,
    notSent: "Not yet sent",

    /** orphaned 축(키·로케일 어느 쪽이든)이면 셀이 disabled다 (DESIGN §6.1). */
    notEditable: "Not editable — removed from the code",
    placeholder: "Add a translation",
    /**
     * ⚠️ **셀의 접근 이름 — placeholder로 대신할 수 없다.** placeholder는 값이 있으면 읽히지 않아
     * 채워진 셀이 이름 없는 입력이 된다. 903행 × 3로케일에서 그건 표 전체가 익명이라는 뜻이다.
     * live region이 같은 어휘(`키 · 로케일`)를 쓰므로 알림과 입력이 같은 이름을 가리킨다.
     */
    columns: { key: "Key", locale: "Language", value: "Translation" },
    cellLabel: (key: string, locale: string): string => `${key} · ${locale}`,

    /**
     * 툴바 셋 (8-4 — 시안 `212:937`). **상태 필터가 없다** (spec Q3): 시안의 칩 행이 정확히 세
     * 종류라 그 부재가 누락이 아니라 의도로 읽힌다. 대신 섹션 안에서 pending 키가 위로 온다.
     */
    filters: {
      search: "Search keys and values",
      namespace: "Filter by namespace",
      /** 다중 선택 드롭다운의 트리거이자 접근 이름이다. */
      locales: "Select locales",
      /**
       * 네임스페이스 옵션의 라벨. ⚠️ **숫자가 문자열 안에 들어갈 수밖에 없다** — native
       * `<select>`라 옵션 안에 배지를 그릴 수 없다. 남은 일이 0이면 총계만 보인다.
       */
      namespaceOption: (name: string, pending: number, total: number): string =>
        pending > 0 ? `${name} (${pending}/${total})` : `${name} (${total})`,
      /** 초기화 버튼은 아이콘 하나라 접근 이름이 여기서만 온다. */
      clear: "Clear filters",
    },

    /**
     * 적용된 필터의 칩 (8-4 design §3.5). **라벨을 `lib/keys/filters.ts`가 만들지 않는다** —
     * 그 모듈은 잎이어야 해서 사전을 물지 않는다.
     *
     * ⚠️ **로케일 칩이 하나다** — 코드마다 내면 마지막 하나를 떼는 순간 폴백이 걸려 오히려
     * 넓어지고, 6로케일에서 칩 행 한 줄을 넘는다.
     */
    chips: {
      namespace: (value: string): string => `Namespace: ${value}`,
      locales: (value: string): string => `Languages: ${value}`,
      search: (value: string): string => `Search: ${value}`,
      /** 제거 버튼은 X 하나다 — 어느 칩을 떼는지가 접근 이름에만 있다. */
      remove: (label: string): string => `Remove ${label}`,
    },

    /** ⚠️ 상대 시각은 서버가 `relativeTime`으로 만들어 넘긴다 — 사전은 문장만 든다. */
    lastSent: (when: string): string => `Last sent ${when}`,

    banner: {
      /**
       * 편집 손실 창 (design §3.11). **주어가 편집자의 행동이다** — 처음 초안은 "code push"가 주어였고,
       * 실제 경계가 pull 실행이 아니라 **PR 머지**인 것도 담지 못했다.
       */
      unsent: (n: number): string =>
        `${n === 1 ? "1 change" : `${n} changes`} not yet sent. ` +
        "They can be lost if your developers push code first — send them when you're done.",

      /**
       * 기준 로케일 변경 대기 (6b-3 — design §3.13). **"먼저 보내라"만 말한다.**
       *
       * ⚠️ **검토 표시를 예고하지 않는다** — `planPush`가 base 교체 push에서 전파를 건너뛰므로 그
       * 일이 안 일어난다. 둘을 말하면 무엇을 해야 하는지가 흐려진다.
       *
       * ⚠️ **로케일 코드를 그대로 보인다** — 사람이 읽는 이름이 없다(`Locale.name`이 코드와 같게
       * 심긴다). 지어내면 리포의 파일명과 갈린다.
       */
      basePending: (locale: string): string =>
        `The source language is changing to ${locale}. ` +
        "Send your changes now — the push that switches it overwrites translations that haven't been sent.",
    },

    empty: {
      /** 첫 적재 전. OWNER는 설정으로 보내므로 이 문구를 읽는 사람은 번역자다 (design §3.7). */
      notReady: "Nothing to translate yet",
      noLocales: {
        title: "No languages yet",
        description: "The first import hasn't found any locale files. Ask the project owner.",
      },
      noKeys: {
        title: "No keys yet",
        description: "Once your developers push code, the strings they marked show up here.",
      },
      /** ⚠️ **상태 필터를 가리키지 않는다** — 8-4가 그것을 뺐다 (spec Q3). 빠져나갈 길은 칩이다. */
      noMatch: {
        title: "No keys match",
        description: "Remove a filter above to see the rest.",
      },
    },

    /** ⚠️ 셀 안 상태줄은 **시각 전용**이다 — 알림은 표 하나의 live region이 든다 (design §3.8). */
    save: {
      /** ⚠️ **버튼 로딩과 다른 축이다** — 셀 인라인 상태줄이라 `loadingLabel` 제거 대상이 아니다. */
      saving: "Saving…",
      saved: "Saved",
      unsaved: "Not saved yet — leave the cell to save",
      failed: (reason: string): string => `Couldn't save: ${reason}`,
      retry: "Retry",
      /** 입력값을 지우지 않는다 — 다시 로그인하면 그대로 저장할 수 있어야 한다. */
      sessionEnded: "Your session ended — sign in again. Your text is kept.",
      signIn: "Sign in",
      unavailable: "Temporary problem — try again",
    },

    /** 표 하나의 `aria-live` 영역이 읽는 문구. **"Saving…"은 알리지 않는다** — 결과만이다. */
    announce: {
      saved: (key: string, locale: string): string => `Saved ${key} · ${locale}`,
      failed: (key: string, locale: string, reason: string): string =>
        `Couldn't save ${key} · ${locale}: ${reason}`,
    },

    /**
     * Publish 결과 다섯 (design §3.4). **git 어휘를 쓰지 않는다** — 읽는 사람은 비개발자 동료다.
     * 링크 라벨만 예외가 될 수 있는데(DESIGN §10), 이 자리는 "보낸 것"을 보여주는 것이라 그쪽도 편집자 어휘다.
     */
    publish: {
      /** 미배포 건수를 라벨이 든다 — 0이면 숫자를 붙이지 않는다(괄호 안 0은 정보가 아니다). */
      button: (n: number): string => (n === 0 ? "Send changes" : `Send changes (${n})`),
      nothing: "Nothing to send — everything is up to date.",
      created: "Sent for review. Your developers need to accept it before their next code push.",
      updated: "Updated what you sent earlier with your latest changes.",
      /**
       * ⚠️ **`sent`가 필요하다.** 이 갈래는 `committed`와 `skipped` 둘 다 온다(warnings ≥ 1) — 스킵인데
       * "Sent"라고 쓰면 아무것도 안 보낸 것을 보냈다고 말하게 된다. 갈래는 하나, 문장만 갈린다.
       */
      partial: (count: number, sent: boolean): string => {
        // 1건이 가장 흔한 경우다 — 카운터를 만들어 놓고 여기서 안 쓰면 "1 values"가 나간다.
        const values = count === 1 ? "1 value" : `${count} values`;
        return sent
          ? `Sent, but ${values} couldn't be written — tell your developers.`
          : `Nothing new was sent, and ${values} couldn't be written — tell your developers.`;
      },
      /** ⚠️ **건수만으로는 편집자가 행동할 수 없다** — `<details>`가 어느 파일인지 편다. */
      dropped: "Which values couldn't be written",
      failed: (reason: string): string => `Couldn't send: ${reason}`,
      viewLink: "View what was sent",
      /**
       * 게이트 거부 (7단계 — sync-runs design §6.1). **고장이 아니라 "방금 보냈다"라 tone이 `info`다.**
       *
       * ⚠️ **카운트다운이 아니라 정적 문장이다** — 줄어드는 숫자를 그리려면 `setInterval`과
       * `aria-live`가 붙는데, 헤더의 live region은 하나이고 그것은 저장 알림이 든다.
       */
      gate: {
        "already-running": "Already sending. This page will show the result when it's done.",
        "too-soon": (seconds: number): string =>
          `Just sent. Try again in ${seconds === 1 ? "1 second" : `${seconds} seconds`}.`,
      },
    },

    /**
     * 초대 — **6a에서는 번역 화면 툴바의 `Dialog`다.** 멤버 관리 화면은 6b이고, 이 폼이 없으면
     * `createInvitation`에 호출부가 없다.
     */
  },

  /**
   * 멤버 화면 (6b-2 — design §3.9). **역할 이름은 `projects.role`에서 온다** — 어휘가 두 벌이면 갈린다.
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
  locales: {
    description: "The list comes from the locale files in your repository.",
    columns: { code: "Language", progress: "Translated" },
    /** base 배지 — 가장 흔한 상태가 조용해야 하므로 나머지 행에는 배지가 없다 (DESIGN §6.2). */
    base: "Base",
    /** `localeProgress` — 검토 필요는 번역된 것이 아니라 따로 센다. */
    progress: (percent: number, translated: number, total: number): string =>
      `${percent}% · ${translated} of ${total}`,
    needsReview: (n: number): string => (n === 1 ? "1 needs review" : `${n} need review`),
    /**
     * ⚠️ **orphaned 로케일이 이 화면의 존재 이유다** (ARCHITECTURE §5.5.16). 그 상태는 오래전부터
     * 정의돼 있었는데 **화면이 없어서** 번역자가 볼 수 있는 것은 "열이 사라졌다"뿐이었다. 그래서
     * 사유와 되살리는 방법을 둘 다 말한다 — 되돌릴 수 있는 상태라는 것이 요지다.
     */
    orphaned: {
      badge: "File missing",
      reason: (code: string): string =>
        `There's no file for ${code} in the repository any more, so it isn't sent back.`,
      /** ⚠️ "below"라고 쓰지 않는다 — 그 번역은 아래가 아니라 같은 행의 진행률 열이다(실물로 확인했다). */
      restore: "Add the file again and its translations come back on the next CI push.",
    },
    empty: {
      title: "No languages yet",
      description: "They appear after the first import reads your locale files.",
    },
    /** 기준 언어 폼. **선언만 저장한다** — 현실은 push가 소유한다 (design §3.13). */
    field: {
      label: "Base language",
      help: "The language your source strings are written in. Changing it takes effect on the next CI push.",
      save: "Save",
      /** ⚠️ **버튼 로딩과 다른 축이다** — 셀 인라인 상태줄이라 `loadingLabel` 제거 대상이 아니다. */
      saving: "Saving…",
      saved: "Saved",
      failed: "We couldn't save this. Try again in a moment.",
      /** 첫 적재 전 — 고를 언어가 없어 폼이 막힌다. 이유를 말하지 않으면 고장으로 보인다. */
      noLocales: "You can set this after the first import.",
    },
    /**
     * 선언과 현실이 어긋난 동안 상시로 뜬다 (`basePending`) — 저장 직후만이 아니다.
     *
     * ⚠️ **git 어휘를 피하지 않는다** — 이 Alert는 **`project:settings`가 있는 역할에만** 렌더된다
     * (페이지 게이트는 `translation:write`이고 컨트롤만 role로 갈린다 — 6b-2 관용구). 고칠 수 없는
     * 사람에게 YAML 한 줄과 [Copy]는 소음이고, 번역 화면의 배너가 편집자 어휘로 같은 사실을 말한다.
     */
    pending: {
      title: "The base language change is waiting on your workflow",
      body: (path: ReactNode): ReactNode => (
        <>Update {path} — until then CI pushes keep the old base language.</>
      ),
      copy: "Copy line",
    },
  },

  members: {
    /**
     * 표 헤더. `Joined`는 상대 시각이라 열 이름이 단위를 말하지 않는다.
     *
     * ⚠️ **`actions`가 빈 문자열이 아니다** (2026-09-08 code-review 🟡3). 시각적으로는 비어야 하지만
     * 빈 `<th>`는 스크린 리더가 이름 없는 열로 읽는다 — 화면이 `sr-only`로 감춘다.
     */
    columns: { person: "Person", email: "Email", role: "Role", joined: "Joined", actions: "Actions" },
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
    /** 확인 모달 — 제목은 **대상을 명시한 질문**, 액션 라벨은 결과다 (DESIGN §10). */
    confirmRemove: (who: string): string => `Remove ${who} from this project?`,
    confirmRemoveHint: "They lose access right away. Their past edits stay.",
    cancel: "Cancel",
    /** 마지막 OWNER 보호는 `accessErrorMessage("last-owner")`가 낸다 — 여기 두 벌로 쓰지 않는다. */
    changeFailed: (reason: string): string => `Couldn't apply that change: ${reason}`,

    /** 초대 발급 — 6a의 임시 폼(`translations.invite`)에서 여기로 옮겼다. 화면 하나에 어휘 한 벌이다. */
    invite: {
      open: "Invite member",
      title: "Invite a translator",
      email: "Email",
      help: "They'll be able to edit translations in this project.",
      create: "Create link",
      /** 원문은 서버가 저장하지 않는다 — 이 화면을 벗어나면 다시 볼 수 없다 (ARCHITECTURE §6.02). */
      linkHint: "Copy the link and send it yourself. You won't see it again after you close this.",
      alreadyMember: "That email is already a member of this project.",
      failed: (reason: string): string => `Couldn't create the link: ${reason}`,
    },

    pending: {
      title: "Pending invitations",
      columns: { email: "Email", role: "Role", expires: "Expires", invitedBy: "Invited by" },
      /** 초대한 사람의 이름이 없을 때. 이메일을 여기 쓰지 않는다 — 이미 마스킹한 열이 옆에 있다. */
      unknownInviter: "a member",
      revoke: "Revoke",
      /** 같은 이유로 대상을 든다 — 대기 초대가 여럿이면 어느 주소인지가 유일한 구별점이다. */
      revokeLabel: (who: string): string => `Revoke invitation for ${who}`,
      revokeFailed: (reason: string): string => `Couldn't revoke that invitation: ${reason}`,
      empty: {
        title: "No pending invitations",
        description: "Everyone you invited has joined, or their links have expired.",
      },
    },
  },

  /** settings-block 넷 + 계정 (DESIGN §6.6). **블록이 각자 실패한다** — 문구도 블록별로 갈라져 있다. */
  settings: {

    repository: {
      title: "Repository",
      description: "Where your source strings come from, and where translations go back.",
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
       * `m.locales.field`이고 화면은 `/projects/:slug/locales`다, PRODUCT §7.7 결정 4).
       *
       * ⚠️ **브랜치는 즉시 쓰인다** — pull의 커밋 parent와 PR base가 그것이고 대기 개념이 없다.
       * 선언만 쓰이는 축(base language)이 여기서 사라졌으므로 두 성질을 한 help 문구로 설명할
       * 필요도 없어졌다.
       */
      fields: {
        branch: "Base branch",
        branchHelp: "The branch translations are sent back to, and the one CI watches.",
        save: "Save",
        /** ⚠️ **버튼 로딩과 다른 축이다** — 셀 인라인 상태줄이라 `loadingLabel` 제거 대상이 아니다. */
      saving: "Saving…",
      saved: "Saved",
        failed: "We couldn't save this. Try again in a moment.",
      },

    },

    status: {
      title: "Import status",
      /** ready는 조용하다 — 진행 중인 둘만 무엇을 기다리는지 말한다. */
      ready: "The first import finished.",
      setup: "Finish connecting the repository first.",
      awaiting: "We haven't read this repository's locale files yet.",
      run: "Run first import",
      running: "Importing…",
      failed: "The import didn't finish. Try again in a moment.",
      /**
       * 마지막 임포트가 남긴 실패의 **복구 안내** (projects-list design §3.35). 사유 문장은
       * `m.projects.importFailure`가 내고 여기는 "그래서 뭘 하면 되나"만 말한다.
       *
       * ⚠️ **갈래가 둘인 이유는 고칠 자리가 다르기 때문이다** — 첫 적재 전이면 이 화면의 버튼이
       * 다시 돌리고, 이미 적재된 뒤면 그 버튼이 `not-awaiting`이라 고칠 곳이 대상 리포의 CI다.
       */
      importRetry: "Fix the locale files in the repository, then run the first import again.",
      importRerun: "Fix the locale files in the repository and re-run the workflow there.",
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
    },

    workflow: {
      title: "Workflow",
      /**
       * 문장을 사전이 소유한다 — JSX 노드로 쪼개면 ko가 어순을 바꿀 수 없다 (design §3.1.3).
       */
      saveAs: (path: ReactNode): ReactNode => <>Save this in your repository as {path}.</>,
      copy: "Copy YAML",
      /** ⚠️ 훅으로 번역을 읽는 리포는 `wrapper` 없이는 코드 참조가 조용히 0이다 (spec §5의 빚). */
      hookHint: (hook: ReactNode, wrapper: ReactNode, doc: ReactNode): ReactNode => (
        <>
          Repositories that read translations through a hook ({hook}) also need the {wrapper} input — see {doc}.
        </>
      ),
    },

    account: {
      title: "GitHub account",
      connect: "Connect GitHub",
      reconnect: "Reconnect GitHub",
      reauthorize: "Your GitHub authorization expired.",
      unavailable: "We couldn't load your account. Open this page again in a moment.",
      disconnect: "Disconnect",
      /**
       * ⚠️ **`"Disconnect GitHub"`으로는 부족하다** — 로그인 수단 해제의 접근 이름이 정확히 그
       * 문자열이라 둘이 또 같아진다(2026-09-13 리뷰 뒤 실제로 한 번 그랬다). **이름이 구별해야 하는
       * 것은 대상이 아니라 축이다**: 같은 "GitHub"이 이 화면에서 로그인 수단이기도 하고 리포 쓰기
       * 권한이기도 하다. `aria-label`이 보이는 텍스트를 **포함**한다 (WCAG 2.5.3).
       */
      disconnectLabel: "Disconnect GitHub repository access",
      disconnectFailed: "We couldn't disconnect. Try again in a moment.",
    },
  },

  /** 초대 수락 화면 — **셸 밖 카드다** (design §3.14). 거부 문구는 `errors.invite`가 든다. */
  invite: {
    /**
     * ⚠️ **`invitedTo`를 대체한다** (account-linking §6). 프로젝트 이름과 역할은 이제 **카드의 두
     * 행**이라 합친 문자열의 소비자가 없다 — 있지도 않은 자리를 위해 사전 항목을 만들지 않는다.
     * 역할 이름은 계속 `projects.role`에서 온다(화면 어휘가 두 벌이면 갈린다). 그 값에 관사를
     * 붙이지 않는 규칙도 그대로다 — 2026-09-08에 "as a Editor"가 나왔다.
     *
     * ⚠️ **`"Welcome to malmoi"`를 쓰지 않는다** — 이미 멤버인 사람이 두 번째 프로젝트에 초대되는
     * 경우가 있고 그때 거짓이다.
     */
    title: "You're invited",
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
    /**
     * ⚠️ **각주에서 설명으로 올라왔고 둘째 문장이 빠졌다** (account-linking §6). 지금까지의 값은
     * *"…Signing in with a different account won't accept it."*이었는데 **그 문장이 병합으로
     * 거짓이 된다** — 다른 수단으로 들어와도 같은 주소면 수락된다. 그리고 설명 자리로 올라오면
     * 올바른 계정으로 온 사람이 경고부터 읽는다. 실제 거부는 `email-mismatch` 갈래가 말한다.
     */
    sentTo: (email: string): string => `This invitation was sent to ${email}.`,
    // ⚠️ 장애 문구를 여기 두지 않는다 — `errors.invite.unavailable`이 같은 상태를 말한다.
    // 같은 장에 문구가 두 벌이면 ko를 열 때 한 벌만 번역돼 두 언어가 섞인다 (design §3.1.4).
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
    /** ⚠️ **되돌릴 수 있다고 약속하지 않는다** — 해제는 `/account`의 일이고 이 흐름의 문장이 아니다. */
    footnote: "We'll add this sign-in method to that account. Your projects and translations stay where they are.",
    methods: {
      title: "Sign-in methods",
      description: "Add another account with the same verified email to use it as a sign-in method.",
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
      /** 연결된 행의 보조 줄 — 미연결 행의 `notConnected`와 짝이다. 한쪽만 있으면 행 높이가 갈린다. */
      connected: "Connected",
      notConnected: "Not connected",
      disconnect: "Disconnect",
      /** 같은 이유로 축을 든다 — 아래 `GitHub account` 구역의 [Disconnect]와 글자가 같다. */
      disconnectLabel: (provider: string): string => `Disconnect ${provider} as a sign-in method`,
      /** ⚠️ **사유 없는 disabled는 이 리포가 반복해 밟은 부류다** (POSTMORTEM 2026-09-06). */
      lastMethod: "This is your only way to sign in.",
      confirmDisconnect: (provider: string): string => `Disconnect ${provider}?`,
      confirmHint: "You won't be able to sign in with it until you sign in with it again at this address.",
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
      "too-large": "That picture is over 800 KB. Choose a smaller one.",
      "unsupported-type": "That file isn't a PNG or JPEG. Choose one of those.",
      "not-a-file": "No picture was received. Choose a file and try again.",
      empty: "That file is empty. Choose another one.",
      unavailable: "We couldn't save that picture. Try again in a moment.",
      fallback: "We couldn't use that picture. Choose a PNG or JPEG under 800 KB.",
    },
    connectMethod: {
      connected: "Sign-in method added. You can use it next time you sign in.",
      "email-mismatch": "The email doesn't match this account. Try an account with the same verified email.",
      "already-connected": "This sign-in method is already added. You can use it to sign in.",
      "taken-by-other": "This sign-in method belongs to another malmoi account. Try a different account.",
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
      forbidden: "You don't have permission for this. Ask the project owner.",
      // "없다"와 "멤버가 아니다"를 가르지 않는다 — 프로젝트 존재를 노출하지 않는다 (PRODUCT §7.7).
      "not-found": "You can't open this project. Check your invite link.",
      // 무엇을 하면 되는지 말한다 — 막힌 이유만 알려주면 사용자가 갇힌다.
      "last-owner": "A project needs at least one owner. Make someone else an owner first.",
      "not-member": "That person isn't a member of this project.",
      // 유일하게 재시도가 맞는 사유다 — 입력값이 남아 있다는 것을 말한다.
      unavailable: "Something went wrong. Try again in a moment — your text is kept.",
      // 되돌릴 수 있다는 것과 **누가** 되돌리는지를 함께 말한다 — 그러지 않으면 사용자가 갇힌다.
      archived: "This project is archived. An owner can restore it in its settings.",
    },

    /** `inviteErrorMessage` — `InviteError` 일곱 + 폴백(모르는 `?e=`에 던지지 않는다). */
    invite: {
      unauthorized: "You're signed out. Sign in and you'll come back to this link.",
      "not-found": "This invitation doesn't exist. The link is wrong, or the invitation was cancelled.",
      expired: "This invitation expired. Ask the person who invited you for a new link.",
      "already-accepted": "This link was already used. An invitation works only once.",
      // 이 화면에서 사용자가 할 수 있는 일이 그것 하나다 — 막힌 이유만 말하면 갇힌다.
      "email-mismatch": "Sign in with the account that was invited. The one you're using wasn't.",
      // 실패로 읽히지 않게 쓴다 — 원하는 상태는 이미 이뤄져 있다.
      // ⚠️ **"프로젝트 목록에서 열어라"가 아니다** (2026-09-12 실물 검증) — 그 목록으로 가는 길이
      // 이 화면에 없었고, 지금은 버튼이 **그 프로젝트로 바로** 간다(착지 클릭 하나를 갚는다).
      "already-member": "You're already a member of this project.",
      unavailable: "Something went wrong. Try again in a moment.",
      fallback: "We couldn't accept the invitation. Ask the person who invited you for a new link.",
    },

    /** `signInErrorMessage` — Auth.js `?error=` 코드. 코드를 그대로 노출하지 않는다 (PRODUCT §3). */
    /**
     * `linkErrorMessage` — 병합 확인 실패 여섯 + 폴백.
     *
     * ⚠️ **challenge는 살아 있다** (design ⑧) — 실패가 소비하지 않으므로 "다시 눌러라"가 참이다.
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

    /** `connectErrorMessage` — `ConnectError` 열둘 + 폴백. */
    connect: {
      "state-mismatch": "We couldn't verify that connection request. Start it again from settings.",
      "state-expired": "That connection request expired. Start it again from settings.",
      "wrong-user": "You started this with a different account. Start the connection again.",
      denied: "The connection was cancelled on GitHub. Start it again to continue.",
      "exchange-failed": "We couldn't finish connecting to GitHub. Start it again.",
      // 해제는 그 계정의 주인만 할 수 있다 — 무엇을 하면 되는지 말한다.
      "taken-by-other": "That GitHub account is already connected to another user. They can disconnect it to free it up.",
      "not-connected": "Connect your GitHub account first — use Connect GitHub below.",
      reauthorize: "Your GitHub authorization expired. Use Reconnect GitHub.",
      "repo-not-installed": "The app isn't installed on this repository. Install it, then connect again.",
      "installation-forbidden": "This account can't reach that installation. Ask the repository owner for access.",
      "repo-forbidden": "This account can't reach that repository. Ask the repository owner for access.",
      // 원인이 고정된 거부에 "잠시 뒤 다시"를 보이면 사용자가 같은 버튼을 반복해서 누른다.
      unavailable: "Something went wrong. Try again in a moment.",
      fallback: "The GitHub connection failed. Try again from settings.",
    },

    /**
     * `onboardErrorMessage` — `OnboardError` 열여덟 + 폴백.
     *
     * ⚠️ **넷이 없다**(`installation-forbidden`·`repo-forbidden`·`repo-not-installed`·`unavailable`) —
     * 연결 화면과 같은 거부라 `connect`의 문구를 그대로 쓴다. 같은 거부에 문구가 두 벌이면 안 된다.
     */
    onboarding: {
      "no-installations": "No GitHub account has the malmoi app installed. Install the app first.",
      "no-repos": "This installation has no repositories selected. Add one in your GitHub installation settings.",
      // 이유를 말한다 — 수동 지정으로 가는 근거다 (로케일이 하나뿐인 리포는 붙일 수 없다).
      "no-candidates": "We couldn't find locale files. malmoi needs locale files in 2 or more languages.",
      // 수동 지정을 권하지 않는다 — 확정의 재검증이 같은 스냅샷을 읽어 같은 갈래를 다시 낸다.
      "tree-truncated": "This repository has too many files to search. Setting the path yourself hits the same limit.",
      "base-branch-missing": "We can't read the default branch. Check that the repository has commits.",
      // ⚠️ **라벨이라 문장이 아니다** — 후보 줄의 "3 languages · 4 keys" 자리에 그대로 들어간다.
      "key-count-failed": "Key count unavailable",
      "manual-no-match": "No files of that format at that path. Check the path and the format.",
      "slug-taken": "That address is taken. Pick another one.",
      "limit-reached": (limit: number): string => `You can create up to ${limit} projects.`,
      "invalid-slug": (max: number): string =>
        `An address can use lowercase letters, numbers, '-', '.' and '_', up to ${max} characters. 'new' is reserved.`,
      // 온보딩은 브랜치를 **고르는** 자리다 — 설정 화면(고치는 자리)과 안내가 갈린다.
      "invalid-branch": "That branch name isn't valid. Pick another branch.",
      "not-awaiting": "The first import already finished. Importing again would overwrite edited translations, so it's blocked here.",
      "resource-limit": "These translation files are too large or too deeply nested to import. Reduce their size and try again.",
      "ingest-failed": "The first import failed. You can try again from settings.",
      // 번역자가 읽는다 — 무엇을 기다리는지와 누가 끝낼 수 있는지를 말한다.
      "not-ready": "This project isn't ready yet. The owner needs to finish setting it up.",
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
      // 왜 없는지를 말한다 — 목록은 리포의 로케일 파일에서 온다.
      "unknown-locale": "This repository has no locale file for that language.",
      // 되돌릴 수 있는 상태이므로 무엇을 해야 하는지 말한다.
      "orphaned-locale": "That language's file is gone from the repository. Bring it back first.",
    },
  },

  /**
   * `adapterErrorMessage` — `AdapterErrorCode` 스물둘 + 폴백 (translation-ui design §3.1.4, 6b-1).
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
