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
  // ⚠️ 화면 섹션은 **그 화면을 만드는 커밋이 더한다** — 빈 껍데기를 미리 두지 않는다("만든 것이 실제로
  // 호출되는가"). 지금 있는 것은 T2~T4가 실제로 읽는 것뿐이고, 로그인·초대 문구는 T6·T8이 더한다.
  common: {
    appName: "Malmoi",
    /** 셸의 전역 항목 — 사이드바 하단과 사용자 메뉴가 같은 문구를 쓴다. */
    nav: {
      allProjects: "All projects",
      newProject: "New project",
      signOut: "Sign out",
      collapse: "Collapse sidebar",
      expand: "Expand sidebar",
      openMenu: "Open menu",
      closeMenu: "Close menu",
      switchProject: "Switch project",
      userMenu: "Account menu",
    },
    /** 복사 버튼의 **라벨 교체** 셋 (DESIGN §6.4) — 실패를 삼키면 사용자가 복사된 줄 알고 떠난다. */
    copy: "Copy",
    copied: "Copied",
    copyFailed: "Couldn't copy — select it yourself",
  },

  signIn: {
    tagline: "Translate the projects you were invited to, and send your changes back.",
    github: "Continue with GitHub",
    google: "Continue with Google",
    /** 장식 카드의 정적 문구 — 실제 데이터가 아니라 모형이다 (design §3.12). */
    sample: { file: "locales/ko.json", branch: "l10n/sync", sent: "Sent for review" },
  },

  projects: {
    title: "Your projects",
    /** 역할은 화면 어휘로 — `ProjectMember.role`의 내부 이름을 그대로 쓰지 않는다 (SAAS §3). */
    role: { OWNER: "Owner", EDITOR: "Editor" },
    empty: {
      title: "No projects yet",
      description: "Connect a repository to create one, or open an invite link you were sent.",
    },
    githubAccount: { title: "GitHub account", connected: "Connected." },
    /** `readinessLabel` — `ready`는 문구가 없다(가장 흔한 상태가 가장 조용하다). */
    readiness: {
      awaiting_first_sync: "Waiting for first import",
      setup: "Setting up",
    },
  },

  newProject: {
    /** `formatLabel` — 어댑터 내부 이름을 화면에 쓰지 않는다 (SAAS §3). */
    formats: {
      "chrome-locales": { label: "Chrome extension messages", example: "_locales/{locale}/messages.json" },
      "json-catalog": { label: "JSON catalog", example: "src/locales/{locale}.json" },
      "yaml-catalog": { label: "YAML catalog", example: "config/locales/{locale}.yml" },
      "code-dict": { label: "Code dictionary (one file per language)", example: "src/locales/{locale}.ts" },
      "ts-dict": { label: "Code dictionary (all languages in one file)", example: "src/i18n/namespaces/*.ts" },
    },
    /**
     * 첫 적재 결과 헤드라인 — **0건이 아니면 성공 문구를 그대로 쓰지 않는다** (SAAS 불변식 9).
     */
    imported: (count: number, failed: number): string =>
      failed === 0
        ? `Imported ${count === 1 ? "1 key" : `${count} keys`}.`
        : `Imported ${count === 1 ? "1 key" : `${count} keys`}, but ${failed} couldn't be read.`,

    title: "New project",
    back: "Projects",

    /** ①①' — 셋이 사용자에게 요구하는 일이 다르다: 계정 연결 · App 설치 · 설치에 리포 추가 (DESIGN §6.7). */
    empty: {
      connect: {
        title: "Connect your GitHub account",
        description: "The connection is only used to see which repositories have the Malmoi app installed.",
        action: "Connect GitHub",
        reauthorize: "Reconnect GitHub",
        /** GitHub으로 나가는 왕복이라 "연결 중"이 아니라 이동이다. */
        redirecting: "Opening GitHub…",
      },
      /** ⚠️ **제목은 마침표 없는 짧은 구다** (DESIGN §10) — 사유 문장은 `description`이 든다. */
      noInstallations: "No installation found",
      noRepos: "No repositories selected",
      install: "Install the app",
      addRepos: "Add repositories to the installation",
      /** ⚠️ `GITHUB_APP_SLUG`가 없으면 설치 링크가 조용히 사라진다 — 그때 할 수 있는 일을 말한다. */
      noLink: "Ask your administrator to install the Malmoi app on the repository.",
      afterInstall: "Refresh this page once you're done.",
      listFailed: "We couldn't load your repositories.",
      retryHint: "Refresh this page in a moment.",
    },

    /** ② 리포 고르기 */
    repo: {
      title: "Repository",
      search: "Find a repository by name",
      none: "No repository matches that name.",
      pick: "Select",
      detecting: "Detecting…",
      other: "Choose another repository",
    },

    /** ③ 후보 · 기준 언어 · 수동 지정 */
    files: {
      title: "Locale files",
      /** 후보 줄의 요약 — 키 수를 못 셌으면 호출부가 `key-count-failed`를 넣는다. */
      summary: (locales: readonly string[], keys: string): string =>
        `${locales.length} languages (${locales.join(", ")}) · ${keys}`,
      keys: (n: number): string => (n === 1 ? "1 key" : `${n} keys`),
      more: "There may be more — set the path yourself below if what you need isn't listed.",
      manual: {
        summary: "Can't find your files?",
        format: "File format",
        path: "Path",
        /** 문장을 사전이 소유한다 — 노드로 쪼개면 ko가 어순을 바꿀 수 없다 (design §3.1.3). */
        pathHint: (token: ReactNode): ReactNode => <>The {token} placeholder is where the language goes.</>,
        baseLocale: "Base language",
        hint: "Setting a path clears the selection above. If no file matches, the project isn't created.",
      },
    },

    baseLocale: {
      title: "Base language",
      hint: "This language's file decides which keys exist. Pick the wrong one and keys that live only in another language are left out.",
    },

    /** ④ 이름·주소 */
    naming: {
      title: "Name and address",
      name: "Name",
      slug: "Address",
      /** 문장이 링크·mono 조각 둘을 물고 있어 노드를 받는다. */
      hint: (address: ReactNode, branch: ReactNode): ReactNode => (
        <>
          Opens at {address}. Translations come back as a pull request on {branch}.{" "}
          <strong>The address can't be changed later.</strong>
        </>
      ),
      create: "Create project",
      creating: "Creating…",
    },

    /** ⑤⑥ 결과 — **토큰 원문은 이 화면에서만 보인다** (design §3.13). */
    result: {
      token: {
        title: "Push token",
        description: (secret: ReactNode): ReactNode => (
          <>
            Add this to the repository's Actions secret {secret}.{" "}
            <strong>You won't see it again after you leave this page.</strong> If you lose it, rotate it in settings.
          </>
        ),
      },
      ingest: {
        title: "First import",
        running: "Importing…",
        retry: "Try again",
        /** 못 읽은 파일 — 건수만으로는 사용자가 할 일이 없다 (SAAS 불변식 9). */
        couldNotRead: (path: string): string => `Could not read ${path}`,
        /** `<details>`의 요약 — 그 안은 어댑터가 준 원문이다 (6b-1이 코드화한다). */
        diagnostics: "Details",
        refsHint: "Code references arrive after your first CI push. You can start translating now.",
        open: "Start translating",
      },
      failed: "We couldn't finish. Try again in a moment.",
    },
  },

  translations: {
    /** 카운터 — ICU가 아니라 삼항 하나다 (MVP §7). */
    keys: (n: number): string => (n === 1 ? "1 key" : `${n} keys`),

    title: "Translations",
    /** ⚠️ URL 값은 `"*"`다 — 이건 그 행의 라벨이다 (`ALL_NAMESPACES`). */
    allKeys: "All keys",
    columnKey: "Key",
    /** 기준 로케일 열의 꼬리. muted 표면 위라 색은 호출부가 정한다 (DESIGN §2.2). */
    baseColumn: "(base)",

    /** 배지 3종 (DESIGN §6.2) — **"Translated"가 없다**: 가장 흔한 상태가 가장 조용해야 한다. */
    orphaned: "Orphaned",
    untranslated: "Untranslated",
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
    cellLabel: (key: string, locale: string): string => `${key} · ${locale}`,

    filters: {
      search: "Search keys and values",
      state: "Filter by state",
      stateAny: "Any state",
      /** 집계와 상태 필터가 보는 로케일 — 표가 로케일을 열로 펼치므로 하나를 골라야 한다. */
      focus: "Language to track",
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
      noMatch: {
        title: "No keys match",
        description: "Clear the search or the state filter to see the rest.",
      },
    },

    /** ⚠️ 셀 안 상태줄은 **시각 전용**이다 — 알림은 표 하나의 live region이 든다 (design §3.8). */
    save: {
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
      sending: "Sending…",
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
    },

    /**
     * 초대 — **6a에서는 번역 화면 툴바의 `Dialog`다.** 멤버 관리 화면은 6b이고, 이 폼이 없으면
     * `createInvitation`에 호출부가 없다.
     */
    invite: {
      open: "Invite",
      title: "Invite a translator",
      email: "Email",
      help: "They'll be able to edit translations in this project.",
      create: "Create link",
      creating: "Creating…",
      /** 원문은 서버가 저장하지 않는다 — 이 화면을 벗어나면 다시 볼 수 없다 (SAAS §5.6). */
      linkHint: "Copy the link and send it yourself. You won't see it again after you close this.",
      alreadyMember: "That email is already a member of this project.",
      failed: (reason: string): string => `Couldn't create the link: ${reason}`,
    },
  },

  /** settings-block 넷 + 계정 (DESIGN §6.6). **블록이 각자 실패한다** — 문구도 블록별로 갈라져 있다. */
  settings: {
    title: "Settings",

    repository: {
      title: "Repository",
      description: "Where your source strings come from, and where translations go back.",
      connect: "Connect",
      reconnect: "Reconnect",
      /** 대기 라벨 — **누른 라벨에서 파생된다** (DESIGN §6.4). 같은 문구를 쓰면 진행 신호가 사라진다. */
      connecting: "Connecting…",
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
        unknown: "We can't check this right now. Open this page again in a moment.",
        install: "Install the app",
        installHint: "Install it, then come back here and connect again.",
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
      rotating: "Rotating…",
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
      disconnecting: "Disconnecting…",
      disconnectFailed: "We couldn't disconnect. Try again in a moment.",
    },
  },

  /** 초대 수락 화면 — **셸 밖 카드다** (design §3.14). 거부 문구는 `errors.invite`가 든다. */
  invite: {
    /** 역할 이름은 `projects.role`에서 온다 — 화면 어휘가 두 벌이면 갈린다. */
    invitedTo: (project: string, role: string): string => `You're invited to ${project} as a ${role}.`,
    signInHint: (email: string): string => `Sign in with the account at ${email} to accept.`,
    github: "Sign in with GitHub",
    google: "Sign in with Google",
    accept: "Accept invitation",
    otherAccount: "Sign in with another account",
    sentTo: (email: string): string =>
      `This invitation was sent to ${email}. Signing in with a different account won't accept it.`,
    // ⚠️ 장애 문구를 여기 두지 않는다 — `errors.invite.unavailable`이 같은 상태를 말한다.
    // 같은 장에 문구가 두 벌이면 ko를 열 때 한 벌만 번역돼 두 언어가 섞인다 (design §3.1.4).
  },

  errors: {
    /** `accessErrorMessage` — `AccessError` 여섯. */
    access: {
      unauthorized: "Your session ended. Sign in again to save your work.",
      // 무엇이 모자란지까지는 말하지 않는다 — 역할 이름은 내부 어휘다.
      forbidden: "You don't have permission for this. Ask the project owner.",
      // "없다"와 "멤버가 아니다"를 가르지 않는다 — 프로젝트 존재를 노출하지 않는다 (SAAS §7.7).
      "not-found": "You can't open this project. Check your invite link.",
      // 무엇을 하면 되는지 말한다 — 막힌 이유만 알려주면 사용자가 갇힌다.
      "last-owner": "A project needs at least one owner. Make someone else an owner first.",
      "not-member": "That person isn't a member of this project.",
      // 유일하게 재시도가 맞는 사유다 — 입력값이 남아 있다는 것을 말한다.
      unavailable: "Something went wrong. Try again in a moment — your text is kept.",
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
      "already-member": "You're already a member of this project. Open it from your project list.",
      unavailable: "Something went wrong. Try again in a moment.",
      fallback: "We couldn't accept the invitation. Ask the person who invited you for a new link.",
    },

    /** `signInErrorMessage` — Auth.js `?error=` 코드. 코드를 그대로 노출하지 않는다 (SAAS §3). */
    signIn: {
      // SAAS §5.5 — 같은 이메일이라는 이유만으로 계정을 합치지 않는다. 잘못된 자동 병합은 계정 탈취다.
      OAuthAccountNotLinked: "That email is already registered with a different sign-in method. Use the one you signed up with.",
      AccessDenied: "You can't sign in with this account. Its email may not be verified.",
      // 우리 코드다 — 세션을 못 읽었을 때 보낸다. "로그인에 실패"라고 말하지 않는다: 사용자는 편집 중이었다.
      Unavailable: "Something went wrong. Try opening this again in a moment.",
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
      "no-installations": "No GitHub account has the Malmoi app installed. Install the app first.",
      "no-repos": "This installation has no repositories selected. Add one in your GitHub installation settings.",
      // 이유를 말한다 — 수동 지정으로 가는 근거다 (로케일이 하나뿐인 리포는 붙일 수 없다).
      "no-candidates": "We couldn't find locale files. Malmoi needs locale files in 2 or more languages.",
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
      "not-awaiting": "The first import already finished. Importing again would overwrite edited translations, so it's blocked here.",
      "ingest-failed": "The first import failed. You can try again from settings.",
      // 번역자가 읽는다 — 무엇을 기다리는지와 누가 끝낼 수 있는지를 말한다.
      "not-ready": "This project isn't ready yet. The owner needs to finish setting it up.",
      // "입력한 값은 그대로"를 쓰지 않는다 — 중간 상태를 저장하지 않으므로 거짓이다.
      unauthorized: "Your session ended. Sign in again and start over.",
      fallback: "We couldn't create the project. Start over and try again.",
    },
  },
} as const;
