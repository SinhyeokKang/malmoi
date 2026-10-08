import type { ReactNode } from "react";

import type { Messages } from "@/lib/i18n";

/**
 * **ko 화면 사전** — `messages/en.tsx`와 같은 키·같은 시그니처의 번역이다. 문체는 DESIGN §10.0(합니다체),
 * 낱말은 §10.1 개념 표의 ko 열이 정본이다.
 *
 * ⚠️ **영어 고정 네임스페이스는 여기 없다** — `mcp`·`seo`·`crash`·`publicDocs.privacy`는 `Messages`에서 빠지고
 * 소비자가 `en`을 직접 읽는다(ui-locales orch D2).
 *
 * ⚠️ **보간 값 바로 뒤에 받침으로 갈리는 조사를 붙이지 않는다** — 값의 끝 글자를 사전이 모른다(DESIGN §10.0).
 */
const UNAVAILABLE = "사용할 수 없음";
const NIGHTLY_RETRY = "다음 야간 실행에서 다시 시도합니다.";

export const ko = {
  search: {
    label: "검색",
    placeholder: "검색…",
    groups: { projects: "프로젝트", pages: "페이지", keys: "키", docs: "문서" },
    goToDocs: "문서로 이동",
    loadingKeys: "키를 불러오는 중…",
    loadingDocs: "문서를 불러오는 중…",
    projectsUnavailable: "지금은 프로젝트를 검색할 수 없습니다. 검색창을 닫았다가 다시 열어 보세요.",
    sessionEnded: "로그인이 만료되었습니다. 프로젝트를 검색하려면 다시 로그인하세요.",
    keysUnavailable: "지금은 키를 검색할 수 없습니다. 검색어를 바꿔 다시 시도하세요.",
    docsUnavailable: "지금은 문서를 검색할 수 없습니다. 검색창을 닫았다가 다시 열어 보세요.",
    noResults: (q: string): string => `“${q}” 검색 결과 없음`,
    noResultsDescription: "다른 검색어를 입력해 보세요.",
    goTo: "이동",
    results: (count: number): string => `결과 ${count.toLocaleString("ko-KR")}건`,
  },
  inbox: {
    label: "받은편지함",
    labelUnread: (n: number): string => `받은편지함, 읽지 않은 항목 ${n.toLocaleString("ko-KR")}개`,
    unread: "읽지 않음",
    emptyDescription: "모든 프로젝트에 확인할 항목이 없습니다.",
    failed: "목록을 불러오지 못했습니다.",
    loading: "항목을 불러오는 중…",
  },
  repositorySync: {
    action: "동기화",
    paused: "지금은 동기화할 수 없습니다.",
    waitPublish: "게시가 끝날 때까지 기다리세요.",
    running: "이미 동기화가 진행 중입니다.",
    resultTitle: {
      complete: "동기화 완료",
      issues: "동기화 중 문제 발생",
      nothingReplaced: "변경 없음",
      didntRun: "동기화 실행 안 됨",
      failed: "동기화 실패",
      unknown: "동기화 결과 확인 불가",
    },
    resultHeadline: {
      "unavailable": "잠시 후 다시 시도하세요 — 기록된 내용은 로그에서 볼 수 있습니다",
      "ingest-failed": "잠시 후 다시 시도하세요 — 기록된 내용은 로그에서 볼 수 있습니다",
      "unauthorized": "로그인이 만료되었습니다 — 로그인한 뒤 다시 동기화하세요",
      "unconfirmed": "응답을 받지 못했습니다 — 다시 동기화하기 전에 로그를 확인하세요",
    },
    confirm: "리포지토리에서 동기화",
    confirmDiscard: "변경 사항을 버리고 동기화",
    resultInLogs: "결과는 로그에 남습니다.",
    title: (name: string): string => `${name} 프로젝트를 리포지토리에서 동기화할까요?`,
    body: (branch: ReactNode): ReactNode => (
      <>Malmoi가 {branch} 브랜치의 번역 파일을 읽어 앱의 번역을 덮어씁니다.</>
    ),
    unsentCount: (n: number): string => `미전송 변경 사항 ${n.toLocaleString("ko-KR")}건`,
    unsent: (n: number, edits: ReactNode): ReactNode => (
      <>동기화하면 {edits} 전부 버리고 리포지토리의 번역으로 덮어씁니다.</>
    ),
    openPr: (n: number, branch: string): string =>
      `PR #${n}의 변경 사항은 아직 ${branch} 브랜치에 반영되지 않았습니다. 이 내용도 덮어씁니다.`,
    prChecking: "열린 PR을 확인하는 중…",
    prUnknown: "열린 PR을 확인하지 못했습니다.",
    sendFirst: "먼저 게시",
    sendHint: (n: number, link: ReactNode): ReactNode => <>변경 사항을 보존하려면 {link}하세요. 번역 화면으로 이동합니다.</>,
    nothingUnsent: "모든 변경 사항을 이미 보냈습니다.",
    seeOpen: "열린 PR 보기",
    completed: (n: number, branch: string): string => `${branch} 브랜치에서 키 ${n.toLocaleString("ko-KR")}개를 동기화함`,
    syncedKeys: (n: number): string => `키 ${n.toLocaleString("ko-KR")}개를 동기화함`,
    unreadable: (n: number): string => `소스 ${n.toLocaleString("ko-KR")}개를 읽지 못함`,
    notReplaced: (n: number): string => `소스 ${n.toLocaleString("ko-KR")}개가 바뀌지 않음`,
    withIssue: (base: string, issue: string): string => `${base} · ${issue}`,
    partial: (n: number): string => `항목 ${n.toLocaleString("ko-KR")}개가 동기화되지 않았습니다. 아래 상세 내용을 확인하세요.`,
    kept: (n: number): string => `미전송 변경 사항 ${n.toLocaleString("ko-KR")}건을 유지했습니다. 이 내용을 보낼 때까지 리포지토리 업데이트를 보류합니다.`,
    cause: (surface: ReactNode, reason: string): ReactNode => <>{surface} — {reason}</>,
    failedTitle: "마지막 동기화를 완료하지 못했습니다",
    supersededTitle: "대체됨",
    openSettings: "설정 열기",
    openAccount: "계정 열기",
    signIn: "로그인",
    reconnect: "다시 연결",
    errors: {
      "invalid-format": "이 소스의 파일 형식을 확인할 수 없습니다.",
      "superseded": "동기화 중에 리포지토리의 더 최근 변경 사항이 들어와 이 소스는 그대로 두었습니다. 필요하면 다시 시도하세요.",
      "lease-lost": "소스를 변경하기 전에 동기화가 중단되었습니다. 다시 시도하기 전에 새로고침해 현재 상태를 확인하세요.",
      "not-ready": "이 프로젝트는 아직 첫 동기화를 마치지 않았습니다",
      "not-connected": "GitHub 계정이 Malmoi에 연결되어 있지 않습니다 — 동기화하려면 계정에서 연결하세요",
      unpinned: "이 리포지토리는 연결이 끊어졌습니다",
      "already-running": "이미 동기화가 진행 중입니다",
      "reconfirm": "검토 이후 내용이 바뀌었는지 확인하지 못했습니다. 변경 사항은 그대로입니다. 동기화를 다시 눌러 확인하세요",
      "no-surfaces": "동기화할 활성 소스가 없습니다",
      "invalid input": "프로젝트를 확인하지 못했습니다. 페이지를 새로고침하고 다시 시도하세요.",
      "ingest-failed": "동기화를 처리하지 못했습니다",
      "unauthorized": "로그인이 만료되었습니다 — 아무것도 동기화하지 않았습니다. 로그인한 뒤 다시 동기화하세요",
      "unavailable": "동기화를 처리하지 못했습니다",
      "unconfirmed": "동기화가 끝났는지 확인하지 못했습니다",
      "repo-replaced": "다른 리포지토리에 연결되어 있습니다",
    },
    baseBranchMissing: {
      owner: (branch: string): string => `기준 브랜치(${branch})가 더 이상 리포지토리에 없습니다 — 설정에서 다른 기준 브랜치를 고르세요`,
      editor: (branch: string): string => `기준 브랜치(${branch})가 더 이상 리포지토리에 없습니다 — 프로젝트 소유자에게 다른 기준 브랜치를 골라 달라고 요청하세요`,
    },
  },
  notFound: {
    title: "페이지를 찾을 수 없음",
    description: "페이지가 이동했거나 삭제되었을 수 있습니다.",
    action: "내 프로젝트로 이동",
  },
  surfaces: {
    sourceCounts: (keys: number, locales: number): string => `키 ${keys.toLocaleString("ko-KR")}개 · 언어 ${locales.toLocaleString("ko-KR")}개`,
    label: "소스", confirm: "파일 확인", cancel: "취소", conflict: "이 파일은 이미 다른 소스에 속해 있습니다:",
    failed: "이 소스를 추가하지 못했습니다. 기존 번역은 그대로입니다. 다시 시도하세요.",
    missingTitle: "소스를 사용할 수 없음",
    missingDescription: "페이지가 이동했거나 소스가 비활성화되었을 수 있습니다. 내 프로젝트에서 다시 확인하세요.",
    projects: "내 프로젝트로 이동",
  },
  common: {
    retry: "다시 시도",
    appName: "Malmoi",
    cancel: "취소",
    close: "닫기",
    dismiss: "닫기",
    slow: "아직 작업 중입니다. 리포지토리가 크면 1분 이상 걸릴 수 있습니다.",
    resizeSidebar: "사이드바 크기 조절",
    keys: { enter: "↵", esc: "Esc", search: { mac: "⌘K", other: "Ctrl K" } },
    nav: {
      projects: "프로젝트",
      account: "계정",
      mcp: "MCP 커넥터",
      preferences: "환경설정",
      inbox: "받은편지함",
      inboxCount: (n: number): string => `읽지 않은 항목 ${n.toLocaleString("ko-KR")}개`,
      home: "홈",
      sources: "소스",
      translations: "번역",
      members: "멤버",
      logs: "로그",
      projectSettings: "설정",
      signOut: "로그아웃",
      newProject: "새 프로젝트",
      yourProjects: "내 프로젝트",
      userMenu: "계정 메뉴",
      collapseSidebar: "사이드바 접기",
      expandSidebar: "사이드바 펼치기",
      projectSwitcher: {
        label: "프로젝트 전환",
        search: { label: "프로젝트 검색", placeholder: "프로젝트 검색…" },
        empty: (q: string): string => `“${q}”에 해당하는 프로젝트 없음`,
      },
      appHome: "Malmoi 홈",
    },
    copy: "복사",
    clearSearch: "검색어 지우기",
    copied: "복사됨",
    copyFailed: "복사하지 못했습니다 — 직접 선택해 복사하세요",
    unreadable: UNAVAILABLE,
  },
  signIn: {
    title: "Malmoi 로그인",
    backToInvitation: "초대로 돌아가기",
    backToAuthorization: "앱 승인으로 돌아가기",
    github: "GitHub로 계속하기",
    google: "Google로 계속하기",
    consent: { before: "계속하면 Malmoi의 ", link: "개인정보 처리방침", after: "에 동의하게 됩니다." },
    footer: { copyright: "© 2026 Malmoi", github: "GitHub", privacy: "개인정보 처리방침" },
    hero: { top: "흩어진 말을 모아", bottom: "함께 번역하고 전달하세요" },
  },

  uiLocale: {
    label: "언어",
    failed: "언어를 바꾸지 못했습니다. 다시 시도하세요.",
  },

  preferences: {
    loading: "환경설정을 불러오는 중…",
    description: "Malmoi 화면에 표시할 언어입니다.",
    help: "프로젝트의 번역 언어는 바뀌지 않습니다.",
    timeZone: {
      title: "시간대",
      description: "Malmoi에서 날짜와 시각을 표시할 시간대입니다.",
      help: "기본값은 UTC입니다. 공개 페이지는 항상 UTC로 표시합니다.",
      now: (time: string) => `현재: ${time}`,
      failed: "시간대를 바꾸지 못했습니다. 다시 시도하세요.",
    },
    theme: {
      title: "테마",
      description: "Malmoi 화면의 밝기를 정합니다.",
      help: "시스템은 기기의 화면 모드 설정을 따릅니다.",
      options: { system: "시스템", light: "라이트", dark: "다크" },
      failed: "테마를 바꾸지 못했습니다. 다시 시도하세요.",
    },
  },

  landing: {
    shell: {
      logo: "Malmoi 홈",
      nav: "주 메뉴",
      docs: "문서",
      github: "GitHub",
      getStarted: "시작하기",
    },
    hero: {
      title: ["흩어진 말을 모아,", "함께 번역하고 전달하세요"] as const,
      // 첫 문장이 정의다 — 홈 description·og:description으로도 나가므로 분량을 늘리지 않는다.
      body: "Malmoi는 GitHub 리포지토리의 번역을 관리하는 도구입니다. 팀원들과 브라우저에서 번역 파일을 편집하고, 변경 사항을 PR 하나로 보낼 수 있습니다.",
      fact: "유료 플랜이 없으며 MIT 라이선스로 공개한 오픈 소스입니다.",
      latest: (version: string) => (version === "" ? "최신 변경 기록" : `v${version} 업데이트`),
    },
    stage: {
      label: "Malmoi 작동 방식",
      captions: [
        "Malmoi가 리포지토리에 이미 있는 번역 파일을 읽습니다.",
        "아직 번역하지 않은 언어를 채웁니다.",
        "번역을 저장하면 게시할 변경 사항에 추가됩니다.",
        "보내기 전에 모든 변경 사항을 diff로 확인합니다.",
        "변경 사항을 PR 하나로 보냅니다.",
      ] as const,
    },
    closing: {
      title: "이미 있는 번역 파일에서 시작하세요",
      body: "JSON, YAML, JS/TS, Chrome 확장 프로그램 번역 파일을 지원합니다. GitHub 리포지토리를 연결하고 팀원이나 AI 에이전트와 함께 작업하세요. AI 에이전트는 MCP로 연결됩니다.",
      links: { label: "자세히 알아보기", formats: "지원 파일 형식", aiAgents: "AI 에이전트", faq: "자주 묻는 질문" },
    },
    // 목업 데이터는 가상 프로젝트의 리포 내용(원문 en·de·fr 값)이라 화면 언어와 함께 바꾸지 않는다.
    mockup: {
      project: "Acme web",
      repo: "acme/web",
      source: "web",
      namespace: "checkout",
      user: "Alex",
      teammate: "Sam",
      projectCount: 3,
      memberCount: 4,
      sources: [
        { slug: "emails", keyCount: 40, namespaces: [] },
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
      ],
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
      unsentBefore: 0,
      unsentAfter: 1,
      file: (code: string): string => `messages/${code}.json`,
      diff: [
        { key: "checkout.submit", code: "fr", before: null, after: "Passer la commande" },
      ],
      pullRequest: 128,
    },
  },

  publicDocs: {
    effectiveDate: "시행일",
    docs: {
      title: "문서",
      nav: "문서",
      toc: "이 페이지의 내용",
      pages: "이전 페이지와 다음 페이지",
      previous: "이전",
      next: "다음",
      code: "코드",
      forDevelopers: "개발자용",
      forTranslators: "번역자용",
      more: "문서 더 보기",
      notFound: {
        eyebrow: "404",
        title: "페이지를 찾을 수 없습니다",
        body: (path: ReactNode, overview: ReactNode): ReactNode => <>{path} 주소에는 페이지가 없습니다. 목록에서 페이지를 고르거나 {overview}에서 시작하세요.</>,
        overview: "문서 개요",
      },
    },
  },

  changelog: {
    title: "변경 기록",
    latest: "최신",
    description: "Malmoi의 릴리스별 변경 사항을 최신순으로 보여 줍니다.",
    releases: "GitHub Releases",
    intro: (releases: ReactNode): ReactNode => (
      <>Malmoi의 릴리스별 변경 사항을 최신순으로 보여 줍니다. 날짜는 UTC 기준입니다. 같은 내용을 {releases}에서도 볼 수 있습니다.</>
    ),
    failed: (releases: ReactNode): ReactNode => <>지금은 GitHub에서 변경 기록을 불러오지 못했습니다. {releases}에서 확인하세요.</>,
    empty: (releases: ReactNode): ReactNode => <>아직 게시된 릴리스가 없습니다. 새 버전은 이곳과 {releases}에 나타납니다.</>,
    truncated: (releases: ReactNode): ReactNode => <>이전 릴리스는 {releases}에 있습니다.</>,
  },

  home: {
    loading: "프로젝트를 불러오는 중…",
    cards: {
      unit: { keys: "키", cells: "번역" },
      synced: (when: string | null): string => (when === null ? "아직 동기화하지 않음" : `${when} 동기화됨`),
      acrossSurfaces: (n: number): string => (n === 1 ? "이 리포지토리 전체" : `소스 ${n.toLocaleString("ko-KR")}개 전체`),
      reviewByLocale: (parts: string): string => parts,
      localeCount: (code: string, n: number): string => `${code} ${n.toLocaleString("ko-KR")}개`,
      allFilled: (n: number): string => `키 ${n.toLocaleString("ko-KR")}개 번역 완료`,
      nothingPending: "보낼 내용 없음",
      nothingToReview: "검토할 내용 없음",
      lastGoodSync: (when: string | null): string => (when === null ? "아직 동기화하지 않음" : `${when} 동기화됨`),
      asOf: (when: string | null): string => (when === null ? "아직 동기화하지 않음" : `${when} 기준`),
      asOfLastSync: "마지막 동기화 기준",
      cannotSend: "지금은 보낼 수 없음",
      held: {
        "pending-edits": "리포지토리 업데이트 보류",
        "open-pr": "PR이 머지되거나 닫힐 때까지 보류",
        "pr-check-failed": "보류 — 열린 PR을 확인하지 못했습니다",
        "publish-raced": "보류 — 동기화 확인 뒤 Publish가 완료되었습니다",
      },
      frozen: "보관 시점에 고정됨",
      neverSent: "전송 이력 없음",
    },

    attention: {
      title: "확인이 필요한 항목",
      count: (n: number): string => `${n.toLocaleString("ko-KR")}개 항목`,
      more: (n: number): string => `+${n.toLocaleString("ko-KR")}개 더 보기`,
      importFailed: {
        title: (surface: string): string => `${surface} 소스`,
        body: "마지막 동기화에서 이 소스를 읽지 못했습니다",
        tail: " — 이 소스에서는 아무것도 동기화되지 않았습니다.",
      },
      partial: {
        body: "이 소스는 일부만 동기화되었습니다",
        tail: " — 일부 번역 파일이 빠졌습니다.",
      },
      review: {
        title: (surface: string, locale: string): string => `${surface} · ${locale}`,
        body: (n: number): string => `번역 ${n.toLocaleString("ko-KR")}개를 검토해야 합니다`,
        // 이름 뒤 조사를 피하려고 "마지막 변경 사항: 이름" 꼴로 쓴다.
        tail: (who: string): string => ` — 이 언어의 마지막 변경 사항: ${who} 님.`,
      },
      neverFilled: {
        title: (surface: string, locale: string): string => `${surface} · ${locale}`,
        body: (locale: string): string => `${locale} 번역이 비어 있습니다`,
        tail: (n: number): string => ` — 번역할 키 ${n.toLocaleString("ko-KR")}개.`,
      },
      empty: {
        title: "확인할 항목 없음",
        description: "동기화 실패, 검토가 필요한 번역, 번역이 비어 있는 언어를 여기에 표시합니다.",
      },
      archived: {
        title: "처리할 항목 없음",
        description:
          "프로젝트를 복원하면 확인할 항목이 다시 표시됩니다. 위 수치는 보관 시점을 기준으로 합니다.",
      },
    },

    logs: {
      title: "최근 로그",
      all: "모든 로그",
      empty: {
        beforeFirstSync: "아직 로그가 없습니다. 첫 동기화부터 여기에 기록됩니다.",
      },
    },

    meta: {
      title: "프로젝트",
      tabs: { list: "프로젝트 정보", project: "프로젝트", sync: "동기화", publish: "게시" },
      repository: "리포지토리",
      connection: "연결",
      branch: "브랜치",
      ci: "CI",
      sources: "소스",
      keys: "키",
      members: "멤버",
      created: "생성일",
      archived: "보관일",
      lastSync: "마지막 동기화",
      synced: "동기화 시각",
      result: "결과",
      changed: "변경",
      keysSeen: "확인한 키",
      hold: "보류",
      lastPublish: "마지막 게시",
      published: "게시 시각",
      pullRequest: "PR",
      prState: "PR 상태",
      prCheckFailed: "열린 PR을 확인하지 못했습니다",
      settings: "설정",
      syncLogs: "동기화 로그",
      publishLogs: "게시 로그",
      configured: "설정됨",
      notSetUp: "설정 안 됨",
      memberCount: (members: number, pending: number): string => `${members.toLocaleString("ko-KR")} (${pending.toLocaleString("ko-KR")})`,
      values: (n: number): string => `값 ${n.toLocaleString("ko-KR")}개`,
      never: "없음",
      unrecorded: "기록 없음",
      notOpen: "열려 있지 않음",
      pr: (n: number): string => `#${n}`,
    },

    banner: {
      syncFailed: {
        title: "마지막 동기화를 완료하지 못했습니다",
        body: (surface: string, branch: string, reason: string): string =>
          `Malmoi가 ${branch} 브랜치의 ${surface} 소스를 읽지 못했습니다. ${reason}`,
        safe: (when: string | null): string =>
          when === null
            ? "기존 번역은 보존되어 있습니다. 현재 보이는 값은 이번 동기화 이전의 값입니다."
            : `기존 번역은 보존되어 있습니다. 현재 보이는 값은 마지막 동기화 성공 시점(${when})의 값입니다.`,
        action: "다시 시도",
        editor: "프로젝트 소유자에게 동기화를 다시 실행해 달라고 요청하세요.",
      },
      partial: {
        title: "일부 동기화됨",
        body: (surface: string, branch: string, reason: string): string => `${branch} 브랜치의 ${surface} 소스가 일부만 동기화되었습니다. ${reason}`,
      },
      notConnected: {
        title: "Malmoi가 이 리포지토리에 연결되어 있지 않습니다",
        body: "동기화하고 게시하려면 이 리포지토리에 GitHub App을 연결하세요. 기존 번역은 보존됩니다.",
        action: "연결",
        editor: "프로젝트 소유자에게 연결을 요청하세요.",
      },
      disconnected: {
        title: "이 리포지토리의 연결이 끊어졌습니다",
        body: "Malmoi와 리포지토리의 연결이 끊어졌습니다. 다시 연결할 때까지 동기화와 게시가 멈춥니다 — 기존 번역은 보존됩니다.",
        action: "다시 연결",
        editor: "프로젝트 소유자에게 다시 연결을 요청하세요.",
      },
      wrongRepository: {
        title: "다른 리포지토리에 연결되어 있습니다",
        body: "이 주소의 리포지토리가 처음 연결했을 때와 다릅니다. GitHub에서 확인한 뒤 리포지토리가 변경된 것이 맞다면 새 프로젝트로 연결하세요.",
      },
      archived: {
        title: "보관된 프로젝트입니다",
        body: "편집, 게시, 리포지토리 동기화가 중단된 상태입니다. 다시 작업하려면 프로젝트를 복원하세요.",
        editor: "프로젝트 소유자에게 복원을 요청하세요.",
      },
    },
  },
  logs: {
    kinds: {
      all: "모든 활동",
      translations: "번역",
      imports: "동기화",
      publish: "게시",
      sources: "소스·언어",
      members: "멤버",
      settings: "설정",
    },
    filters: {
      anyDate: "모든 날짜",
      anyone: "모든 작업자",
      anySource: "모든 소스",
      removed: "(제거됨)",
      anyResult: "모든 결과",
      clear: "필터 지우기",
      people: "사람",
      automation: "자동화",
      projectWide: "프로젝트 전체",
      clearSources: "소스 필터 해제",
      resultScope: "동기화와 게시에만 적용됩니다. 다른 활동에는 결과가 없습니다.",
      groupImports: "동기화",
      groupPublish: "게시",
      groupBoth: "둘 다",
      axis: {
        kind: "종류",
        date: "날짜",
        actor: "작업자",
        source: "소스",
        result: "결과",
      },
    },
    range: {
      today: "오늘",
      yesterday: "어제",
      last7: "최근 7일",
      last30: "최근 30일",
      custom: "기간 지정",
      customOpen: "기간 지정…",
      from: "시작",
      to: "끝",
      apply: "기간 적용",
      description: "시작일과 종료일을 선택하세요. 한쪽을 비우면 해당 날짜의 제한 없이 조회합니다.",
      zoneNote: (zone: string) => `날짜는 ${zone} 기준입니다.`,
    },
    search: { label: "로그 검색", placeholder: "로그 검색…" },
    refresh: "새로고침",
    status: {
      succeeded: "보냄",
      skipped: "보낼 내용 없음",
      notSent: "제외됨",
      failed: "실패",
      syncing: "동기화 중…",
      publishing: "게시 중…",
      inProgress: "진행 중",
      imported: "동기화됨",
      deferred: "보류",
      partial: "일부 동기화됨",
      superseded: "대체됨",
      notStarted: "시작 안 됨",
      upToDate: "최신 상태",
    },
    day: {
      today: "오늘",
      yesterday: "어제",
    },
    none: "—",
    warnings: (count: number): string => `${count.toLocaleString("ko-KR")}개 버림`,
    deferredReason: (count: number): string =>
      `미전송 변경 사항 ${count.toLocaleString("ko-KR")}건 때문에 동기화를 보류했습니다. 아무것도 동기화하지 않았습니다.`,
    deferReasons: {
      "open-pr": "Malmoi PR이 아직 열려 있습니다. 아무것도 동기화하지 않았습니다 — PR이 머지되거나 닫히면 동기화가 다시 시작됩니다.",
      "pr-check-failed": "GitHub에서 열린 Malmoi PR을 확인하지 못해 아무것도 동기화하지 않았습니다. 다음 실행에서 다시 확인합니다.",
      "publish-raced": "동기화 확인 뒤 Publish가 완료되어 아무것도 동기화하지 않았습니다. 다음 실행에서 다시 확인합니다.",
      "too-large": "리포지토리 변경이 서버 동기화 한도를 초과했습니다. 아무것도 동기화하지 않았습니다. 파일 크기를 줄이거나 리포지토리 워크플로로 전달하세요.",
    },
    empty: {
      title: "아직 활동이 없습니다",
      description: "동기화, 번역 수정, 게시 내역이 여기에 기록됩니다.",
    },
    noMatch: {
      title: "필터 조건에 맞는 활동 없음",
      description: "선택한 조건에 맞는 활동이 없습니다. 기간을 넓히거나 필터를 해제하세요.",
    },
    coverage: (date: string): string =>
      `전체 활동 이력은 ${date}부터 볼 수 있습니다. 그 이전 기록에는 게시 실행만 있습니다.`,
    queryError: {
      title: "활동을 불러오지 못했습니다",
      description: "이력을 불러오는 중 문제가 생겼습니다. 기존 기록은 보존되어 있으니 다시 시도하세요.",
      retry: "다시 시도",
    },
    loading: { list: "활동을 불러오는 중…" },
    older: "이전",
    page: {
      perPage: "최근 활동부터 페이지당 20개씩 표시합니다.",
      noOlder: "필터 조건에 맞는 이전 활동이 없습니다.",
    },
    meta: {
      values: (n: number): string => `값 ${n.toLocaleString("ko-KR")}개 바뀜`,
      type: { TRANSLATION: "번역", IMPORT: "동기화", PUBLISH: "게시", SURFACE: "소스", MEMBER: "멤버", SETTINGS: "설정" },
      runType: {
        IMPORT: { manual: "수동 동기화", nightly: "야간 동기화", ci: "CI 동기화" },
        PUBLISH: { manual: "수동 게시", nightly: "야간 게시", ci: "CI 게시" },
      },
      files: (n: number): string => `파일 ${n.toLocaleString("ko-KR")}개`,
      keys: (n: number): string => `키 ${n.toLocaleString("ko-KR")}개`,
      noPullRequest: "PR 없음",
      declarationOnly: "기준 언어 변경 요청됨",
      nothingImported: "동기화한 내용 없음",
      archivedEffect: "편집과 야간 게시 중단됨",
      restoredEffect: "편집과 야간 게시가 다시 시작됨",
      tokenEffect: "이전 토큰은 더 이상 작동하지 않음",
    },
    // 행위자(사람·Nightly·CI) 뒤에 받침에 따라 갈리는 조사를 붙일 수 없어 줄표로 끊는다(DESIGN §10.0).
    sentence: {
      translation: {
        updated: (who: ReactNode, key: ReactNode, language: string): ReactNode => (
          <>{who} — {language}의 {key} 값을 수정했습니다</>
        ),
        cleared: (who: ReactNode, key: ReactNode, language: string): ReactNode => (
          <>{who} — {language}의 {key} 값을 비웠습니다</>
        ),
        reverted: (who: ReactNode, key: ReactNode, language: string): ReactNode => (
          <>{who} — {language}의 {key} 값을 마지막으로 전송이 확인된 값으로 되돌렸습니다</>
        ),
      },
      publish: {
        running: (who: ReactNode): ReactNode => <>{who} — 번역을 GitHub에 보내는 중입니다</>,
        sent: (who: ReactNode): ReactNode => <>{who} — 번역을 GitHub에 보냈습니다</>,
        nothing: (who: ReactNode): ReactNode => <>{who} 게시 — 보낼 내용이 없었습니다</>,
        notSent: (who: ReactNode): ReactNode => <>{who} 게시 — 변경 사항을 제외했습니다</>,
        reconfirm: (who: ReactNode): ReactNode => <>{who} 게시 — 보내기 전에 멈췄습니다</>,
        failed: (who: ReactNode): ReactNode => <>{who} 게시 — 실패했습니다</>,
        notStarted: (who: ReactNode): ReactNode => <>{who} 게시 — 시작하지 않았습니다</>,
      },
      import: {
        running: (who: ReactNode): ReactNode => <>{who} — 리포지토리를 읽는 중입니다</>,
        imported: (who: ReactNode, sources: number): ReactNode => (
          <>{who} — 리포지토리에서 소스 {sources.toLocaleString("ko-KR")}개를 동기화했습니다</>
        ),
        deferred: (who: ReactNode, source: string): ReactNode => <>{who} — {source} 소스의 동기화를 보류했습니다</>,
        superseded: (who: ReactNode): ReactNode => <>{who} 동기화 — 다른 실행으로 대체되었습니다</>,
        failed: (who: ReactNode): ReactNode => <>{who} 동기화 — 실패했습니다</>,
        notStarted: (who: ReactNode): ReactNode => <>{who} 동기화 — 시작하지 않았습니다</>,
        upToDate: (who: ReactNode): ReactNode => <>{who} — 게시하거나 동기화할 내용이 없었습니다</>,
        baseUnreadable: (who: ReactNode): ReactNode => <>{who} — 리포지토리의 기준 브랜치를 읽지 못했습니다</>,
        held: {
          "open-pr": (who: ReactNode): ReactNode => <>{who} — 동기화를 보류했습니다. Malmoi PR이 아직 열려 있습니다</>,
          "pr-check-failed": (who: ReactNode): ReactNode => <>{who} — 동기화를 보류했습니다. GitHub가 PR 확인에 응답하지 않았습니다</>,
          "publish-raced": (who: ReactNode): ReactNode => <>{who} — 동기화를 보류했습니다. 동기화 확인 뒤 Publish가 완료되었습니다</>,
          "too-large": (who: ReactNode): ReactNode => <>{who} — 동기화를 보류했습니다. 변경이 서버 동기화 한도를 초과했습니다</>,
        },
      },
      member: {
        invited: (who: ReactNode, target: string): ReactNode => <>{who} — {target} 님을 초대했습니다</>,
        joined: (who: ReactNode): ReactNode => <>{who} — 프로젝트에 참여했습니다</>,
        roleChanged: (who: ReactNode, target: string): ReactNode => <>{who} — {target} 님의 역할을 바꿨습니다</>,
        removed: (who: ReactNode, target: string): ReactNode => <>{who} — {target} 님을 제거했습니다</>,
        invitationRevoked: (who: ReactNode): ReactNode => <>{who} — 초대를 철회했습니다</>,
      },
      surface: {
        added: (who: ReactNode, source: string): ReactNode => <>{who} — {source} 소스를 추가했습니다</>,
        removed: (who: ReactNode, source: string): ReactNode => <>{who} — {source} 소스를 제거했습니다</>,
        baseLocale: (who: ReactNode, source: string): ReactNode => (
          <>{who} — {source} 소스의 기준 언어를 바꿨습니다</>
        ),
      },
      settings: {
        created: (who: ReactNode): ReactNode => <>{who} — 이 프로젝트를 만들었습니다</>,
        name: (who: ReactNode): ReactNode => <>{who} — 프로젝트 이름을 바꿨습니다</>,
        baseBranch: (who: ReactNode): ReactNode => <>{who} — 기준 브랜치를 바꿨습니다</>,
        repository: (who: ReactNode): ReactNode => <>{who} — 리포지토리를 다시 연결했습니다</>,
        pushToken: (who: ReactNode): ReactNode => <>{who} — 푸시 토큰을 교체했습니다</>,
        image: (who: ReactNode): ReactNode => <>{who} — 프로젝트 썸네일을 바꿨습니다</>,
        imageRemoved: (who: ReactNode): ReactNode => <>{who} — 프로젝트 썸네일을 제거했습니다</>,
        archived: (who: ReactNode): ReactNode => <>{who} — 이 프로젝트를 보관했습니다</>,
        restored: (who: ReactNode): ReactNode => <>{who} — 이 프로젝트를 복원했습니다</>,
      },
      fallback: (who: ReactNode, kind: string): ReactNode => <>{who} — {kind} 항목을 바꿨습니다</>,
    },
    detail: {
      labels: {
        reference: "참조 ID",
        trigger: "실행 주체",
        source: "소스",
        key: "키",
        locale: "언어",
        before: "이전",
        after: "이후",
        files: "파일",
        pullRequest: "PR",
        errorCode: "오류 코드",
        resultPerSource: "소스별 결과",
        member: "멤버",
        role: "역할",
        effect: "변경 영향",
        unsentEdits: "미전송 변경 사항",
        heldBecause: "보류 이유",
        values: "값",
        withheld: "제외됨",
        closedPullRequest: "닫은 PR",
      },
      closedPullRequest: "기준 브랜치와 더 이상 다른 내용이 없어서 Malmoi가 닫았습니다.",
      withheld: (n: number): string =>
        `언어 파일이나 키가 아직 리포지토리에 없어서 변경 사항 ${n.toLocaleString("ko-KR")}건이 Malmoi에 남았습니다.`,
      actions: {
        copy: "참조 ID 복사",
        openTranslation: "이 번역 열기",
        openMembers: "멤버 열기",
        openSettings: "설정 열기",
        openRepository: "GitHub에서 열기",
        close: "닫기",
      },
      notes: {
        publish: "실패한 실행도 GitHub에 일부 반영되었을 수 있습니다. PR이 생성되었는지 리포지토리를 확인하세요.",
        import: "여기에 표시된 수는 키 개수입니다. 소스 추가와 동기화는 별도로 기록되며, 이 기록은 동기화 내역입니다.",
        token: "토큰 값은 일부라도 로그에 저장하지 않습니다.",
      },
      noResult: "서버가 결과를 기록하지 않았습니다.",
      notRecordedForRun: "이 실행에서는 기록하지 않음",
      noPullRequest: "없음",
      missing: { title: "이 활동 기록을 찾지 못했습니다", description: "다른 프로젝트의 기록이거나 존재하지 않는 참조 ID일 수 있습니다." },
      startedFinished: (started: string, finished: string): string => `시작 ${started} · 종료 ${finished}`,
      startedOnly: (started: string): string => `시작 ${started}`,
    },
    value: {
      empty: "비어 있음",
      spacesOnly: (n: number): string =>
        `공백만 있음 (${n.toLocaleString("ko-KR")}자)`,
      notRecorded: "기록 안 됨",
      unavailable: UNAVAILABLE,
    },
    archived: {
      description: "이 프로젝트는 보관되었습니다. 이력은 볼 수 있지만 편집, 게시, 동기화는 할 수 없습니다.",
      restoreLine: (date: string): string => `${date}에 보관됨. 프로젝트 소유자가 설정에서 복원할 수 있습니다.`,
    },
    trigger: {
      cron: "야간",
      removed: "제거된 사용자",
      ci: "CI",
    },
    nightlyRetry: NIGHTLY_RETRY,
    reasons: {
      "base-unreadable": "리포지토리를 읽지 못했습니다. 개발자에게 앱의 접근 권한을 확인해 달라고 요청하세요.",
      "not-installed": "앱이 리포지토리에 연결되어 있지 않았습니다. 개발자에게 다시 연결해 달라고 요청하세요.",
      "glob-matched-nothing": "번역 파일이 예상한 위치에 없었습니다. 개발자에게 문의하세요.",
      "github-error": `GitHub가 응답하지 않았습니다. ${NIGHTLY_RETRY}`,
      "db-unavailable": `Malmoi 데이터베이스에 연결하지 못했습니다. ${NIGHTLY_RETRY}`,
      stale: "이 실행은 끝나기 전에 멈췄습니다.",
      unknown: `문제가 생겼습니다. ${NIGHTLY_RETRY}`,
      reconfirm: "미리보기 이후 내용이 변경되어 전송하지 않았습니다. 미리보기를 다시 확인한 뒤 게시하세요.",
      fallback: "문제가 생겼습니다. 문제가 계속되면 개발자에게 알려 주세요.",
    },
    refusals: {
      archived: "프로젝트가 보관되었습니다.",
      "not-ready": "첫 동기화가 아직 끝나지 않았습니다.",
      "stale-commit": "더 새로운 버전의 리포지토리가 이미 동기화되었습니다.",
      "wrong-format": "리포지토리의 파일 형식이 설정과 더 이상 맞지 않습니다.",
      "repo-replaced": "연결된 리포지토리가 바뀌었습니다.",
      "not-installed": "앱이 리포지토리에 연결되어 있지 않았습니다.",
      "surface-removed": "이 소스는 프로젝트에서 제거되었습니다. GitHub 워크플로에서 이 소스의 단계(step)를 지우세요.",
      fallback: "실행이 시작되기 전에 거부되었습니다.",
    },
  },

  archive: {
    title: "프로젝트 보관",
    description: "데이터를 보존한 채 프로젝트 사용을 중단합니다.",
    action: "프로젝트 보관",
    restore: "프로젝트 복원",
    archivedBy: (when: ReactNode): ReactNode => <>{when}에 보관됨</>,
    confirm: {
      title: (name: string): string => `${name} 프로젝트를 보관할까요?`,
      body: "모든 멤버의 편집, 야간 게시, 리포지토리 동기화가 중단됩니다.",
      openPr: "이미 보낸 PR은 열린 상태로 유지됩니다:",
      openPrLink: "열린 PR 보기",
      prUnknown: "아직 열려 있는 PR을 확인하지 못했습니다.",
      cancel: "취소",
    },
    failed: (reason: string): string => `변경하지 못했습니다: ${reason}`,
    failedUnknown: "변경을 확인하지 못했습니다. 페이지를 새로고침해 현재 상태를 확인하세요.",
    empty: { title: "이 프로젝트는 보관되었습니다", action: "설정 열기" },
  },

  projects: {
    loading: "프로젝트를 불러오는 중…",
    search: { label: "프로젝트 검색", placeholder: "프로젝트 검색…" },
    narrowed: {
      title: (q: string): string => `“${q}”에 해당하는 프로젝트 없음`,
      description: "프로젝트 이름으로 검색합니다.",
      reset: "검색어 지우기",
    },
    archived: "보관됨",
    role: { OWNER: "소유자", EDITOR: "편집자" },
    empty: {
      title: "아직 프로젝트가 없습니다",
      description:
        "리포지토리를 연결하면 번역 파일을 찾습니다. 변경 사항은 PR로만 리포지토리에 보냅니다. 프로젝트에 초대받았다면 초대 메일의 링크를 여세요.",
    },
    summary: {
      newFromGithub: "GitHub의 새 키",
      toTranslate: "번역할 내용",
      toReview: "검토할 내용",
      toSend: "보낼 내용",
    },
    group: { needsAttention: "확인 필요", allSet: "모두 완료" },
    resultsFor: (q: string): string => `“${q}” 검색 결과`,
    count: (n: number): string => `프로젝트 ${n.toLocaleString("ko-KR")}개`,
    clearSearch: "검색어 지우기",
    meter: {
      note: {
        waiting: "아직 동기화 안 됨",
        importing: "동기화 중…",
        failed: "동기화 실패",
        setup: "계속하려면 GitHub App을 연결하세요.",
      },
    },
    banner: {
      review: (n: number): string =>
        `번역 ${n.toLocaleString("ko-KR")}개를 검토해야 합니다.`,
      unsent: (n: number): string =>
        `미전송 변경 사항 ${n.toLocaleString("ko-KR")}건 — 게시해 리포지토리로 보내세요.`,
      prOpen: (n: number): string => `PR #${n} 열림 — 머지하면 반영됩니다.`,
      prCheckFailed: "열린 PR을 확인하지 못했습니다.",
      repoAhead: (n: number, baseBranch: string): string =>
        `마지막 동기화 뒤에 ${baseBranch} 브랜치에서 번역 파일 ${n.toLocaleString("ko-KR")}개가 바뀌었습니다.`,
      setup: "번역을 시작하려면 설정을 마치세요.",
      needsReconnect: "이 리포지토리의 연결이 끊어졌습니다 — 다시 연결할 때까지 동기화와 게시가 멈춥니다.",
      checkDetails: "동기화 내역을 확인하세요.",
      askOwner: {
        reconnect: "프로젝트 소유자에게 다시 연결해 달라고 요청하세요.",
        setup: "프로젝트 소유자에게 설정을 마쳐 달라고 요청하세요.",
      },
      action: {
        review: "검토",
        send: "게시로 이동",
        viewPr: "GitHub에서 열기",
        reviewChanges: "변경 검토",
        viewDetails: "상세 보기",
        continueSetup: "설정 계속하기",
        reconnect: "다시 연결",
      },
    },
    status: {
      active: "활성",
      archived: "보관됨",
      setup: "설정",
    },
    importFailure: {
      parseFailed: "번역 파일을 해석하지 못했습니다.",
      parseCrashed: "번역 파일을 처리하는 중 파서 오류가 발생했습니다.",
      invalidLocaleData: "일부 번역 항목을 읽지 못했습니다.",
      prepareFailed: "마지막 동기화에서 파일 형식을 읽지 못했습니다.",
      partialImport: "마지막 동기화에서 일부 번역 파일이 빠졌습니다.",
      importFailed: "마지막 동기화를 완료하지 못했습니다.",
      ownerRetries: "프로젝트 소유자만 다시 시도할 수 있습니다.",
    },
  },

  account: {
    loading: "계정을 불러오는 중…",
    profile: {
      title: "프로필",
      avatar: "프로필 사진",
      name: "이름",
      email: "이메일",
      none: "없음",
      save: "저장",
      saved: "저장됨",
      errors: {
        empty: "다른 사람이 알아볼 수 있도록 이름을 입력하세요.",
        tooLong: (max: number): string => `${max.toLocaleString("ko-KR")}자 이하로 입력하세요.`,
        unavailable: "이름을 저장하지 못했습니다. 잠시 후 다시 시도하세요.",
      },
    },
    github: {
      title: "GitHub App",
      notConnected: "연결 안 됨",
      statusReauthorize: "만료됨",
      statusUnavailable: "확인하지 못함",
      hintNotConnected: "연결하면 앱이 설치된 리포지토리를 볼 수 있습니다.",
      hintReauthorize: "다시 승인할 때까지 리포지토리를 추가하거나 다시 연결할 수 없습니다. 이미 연결된 프로젝트는 계속 동기화됩니다.",
      hintUnavailable: "이 연결을 확인하지 못했습니다. 잠시 후 이 페이지를 다시 여세요.",
      connected: "연결됨",
      installedOn: (n: number): string => `리포지토리 ${n.toLocaleString("ko-KR")}개에 설치되어 있습니다.`,
      installationSettings: "설치 설정",
      rowName: "GitHub",
      confirmDisconnect: "Malmoi에서 GitHub App 연결을 해제할까요?",
      confirmHint: "다시 연결할 때까지 리포지토리를 추가하거나 다시 연결할 수 없습니다. 이미 연결된 프로젝트는 계속 동기화됩니다.",
    },
    sessionsSection: {
      title: "세션",
    },
    sessions: {
      title: "모든 기기에서 로그아웃",
      confirmTitle: "모든 기기에서 로그아웃할까요?",
      confirmHint: "로그인 계정으로 본인 확인을 마치면 이 기기를 포함한 모든 기기에서 로그아웃됩니다.",
      // provider 이름 뒤 조사를 피하려고 "~에서 계속"으로 쓴다(DESIGN §10.0).
      confirmAction: (provider: string): string => `${provider}에서 계속`,
      confirmDetail: (provider: string): string => `로그아웃 전에 ${provider} 화면에서 본인 확인을 진행합니다.`,
      willConfirm: "로그인 서비스로 이동해 확인한 뒤 이 화면으로 돌아옵니다.",
      button: "확인하고 모든 기기에서 로그아웃",
      complete: "모든 기기에서 로그아웃되었습니다. 계속하려면 다시 로그인하세요.",
      failed: "모든 기기에서 로그아웃하지 못했습니다. 다시 시도하세요.",
      cancelled: "확인이 취소되었습니다. 로그인 상태는 그대로입니다. 필요하면 다시 시도하세요.",
      expired: "본인 확인 요청이 만료되었습니다. 모든 기기에서 로그아웃하려면 처음부터 다시 시작하세요.",
      wrongAccount: "Malmoi 로그인에 쓰는 계정과 같은 계정을 고른 뒤 다시 시도하세요.",
    },
    signOut: {
      title: "로그아웃",
      description: "프로젝트를 열려면 다시 로그인해야 합니다.",
    },
    picture: {
      upload: "업로드",
      delete: "제거",
      caption: "PNG 또는 JPEG, 최대 3MB.",
      busy: "진행 중인 업로드가 끝날 때까지 기다리세요.",
    },
  },

  mcpConnector: {
    token: {
      title: "개인 토큰",
      create: "토큰 만들기",
      rotate: "토큰 교체",
      revoke: "철회",
      expired: "만료됨",
      emptyTitle: "아직 토큰이 없습니다",
      emptyBody: "토큰을 만들면 AI 에이전트가 내 프로젝트에서 작업할 수 있습니다.",
      facts: {
        grants: "권한",
        scope: "범위",
        created: "생성일",
        lastUsed: "마지막 사용",
        expires: "만료",
      },
      readOnly: "읽기 전용",
      allProjects: "모든 프로젝트",
      projects: (n: number): string => `프로젝트 ${n.toLocaleString("ko-KR")}개`,
      never: "없음",
      unconfirmed: "결과를 확인하지 못했습니다. 토큰 값을 받지 못했다면 토큰을 교체해 새 값을 받으세요.",
      revokeUnconfirmed: "토큰이 철회되었는지 확인하지 못했습니다. 아직 여기에 보이면 다시 철회하세요.",
      status: {
        created: "토큰을 만들었습니다",
        rotated: "토큰을 교체했습니다",
        revoked: "토큰을 철회했습니다",
      },
    },
    grants: {
      "translation:write": { label: "번역·게시", hint: "번역을 저장하고 게시 PR을 엽니다." },
      "project:settings": { label: "프로젝트 설정", hint: "소스, 동기화, 기준 브랜치, 푸시 토큰, 보관." },
      "member:manage": { label: "멤버", hint: "초대, 역할 변경, 제거." },
      "project:create": { label: "프로젝트 만들기", hint: "GitHub 리포지토리 목록을 보고 새 프로젝트를 설정합니다." },
    },
    apps: {
      title: "연결된 앱",
      count: (n: number): string => `연결된 앱 ${n.toLocaleString("ko-KR")}개`,
      copyServerUrl: "서버 URL 복사",
      emptyTitle: "연결된 앱 없음",
      emptyBody: "Claude Code, Codex, claude.ai에서 승인한 앱이 여기에 표시됩니다.",
      disconnect: "연결 해제",
      disconnectLabel: (name: string, id: string): string => `${name} 앱 연결 해제, ${id}`,
      confirmTitle: (name: string): string => `${name} 앱의 연결을 해제할까요?`,
      confirmBody: "이 앱의 접근 권한이 즉시 해제됩니다. 다른 앱과 개인 토큰은 계속 사용할 수 있습니다.",
      confirm: "앱 연결 해제",
      disconnected: (name: string): string => `${name} 앱 연결을 해제했습니다`,
      loadFailed: "연결된 앱을 불러오지 못했습니다.",
      unconfirmed: (name: string): string => `${name} 앱의 연결이 해제되었는지 확인하지 못했습니다. 아직 목록에 있으면 다시 연결을 해제하세요.`,
      dcrIdent: (id: string, host: string): string => `클라이언트 ID ${id} · 돌아갈 주소 ${host}`,
    },
    guide: {
      link: "AI 에이전트 연결",
    },
    form: {
      createTitle: "토큰 만들기",
      rotateTitle: "토큰 교체",
      expiresIn: "유효 기간",
      days: (n: number): string => `${n.toLocaleString("ko-KR")}일`,
      grants: "권한",
      grantsHelp: "내 프로젝트의 키, 활동, 멤버 조회는 기본으로 허용됩니다.",
      scope: "범위",
      allMine: "내 모든 프로젝트",
      chosen: "선택한 프로젝트",
      noMembership: "참여 중인 프로젝트가 없습니다.",
      chooseOne: "프로젝트를 하나 이상 고르세요.",
      step: (n: number): string => `2단계 중 ${n.toLocaleString("ko-KR")}단계`,
      create: "만들기",
      rotateConfirm: "교체하고 새 토큰 보기",
      rotateWarning: "교체 즉시 기존 토큰을 사용할 수 없게 됩니다. 이 토큰을 쓰는 에이전트마다 새 토큰을 설정해야 합니다.",
      failed: "토큰을 만들지 못했습니다. 잠시 후 다시 시도하세요.",
    },
    result: {
      title: "개인 토큰",
      copyNow: "지금 복사하세요 — 다시 표시되지 않습니다.",
      setEnv: "셸에 MALMOI_TOKEN으로 설정한 뒤 에이전트에 Malmoi를 추가하세요 — 방법은 AI 에이전트 연결에 있습니다.",
    },
    revoke: {
      title: "토큰을 철회할까요?",
      body: "이 토큰을 쓰는 모든 에이전트가 즉시 멈춥니다. 되돌릴 수 없습니다.",
      confirm: "토큰 철회",
    },
  },

  oauthAuthorize: {
    title: "Malmoi에 앱 연결",
    signInDescription: "로그인 후 앱이 요청한 권한을 확인하세요.",
    consentDescription: "앱에 허용할 권한을 고르세요. MCP 커넥터 페이지에서 언제든 연결을 해제할 수 있습니다.",
    appNameNote: "이 이름은 앱이 직접 정했습니다. 계속하기 전에 주소를 확인하세요.",
    clientId: (id: string): string => `클라이언트 ID ${id}`,
    returnsTo: (uri: string): string => `돌아갈 주소 ${uri}`,
    signedInWith: (provider: string): string => `로그인 수단: ${provider}`,
    notYou: "다른 계정인가요?",
    replaces: (date: string): string =>
      `${date}에 이 앱을 연결했습니다. 연결을 마치면 새 연결이 기존 연결을 대체하고, 다른 기기에서 앱이 로그아웃될 수 있습니다. 거부하면 지금 연결이 유지됩니다.`,
    denyFailed: "응답을 기록하지 못했습니다. 아무것도 바뀌지 않았습니다 — 다시 시도하세요.",
    consentNote:
      "앱은 각 프로젝트에서 내 역할에 허용된 작업만 할 수 있습니다. ‘내 모든 프로젝트’에는 앞으로 참여할 프로젝트도 포함됩니다. 앱에서 만든 프로젝트는 선택한 프로젝트 목록에 추가됩니다. 연결이 만료되면 앱에서 다시 연결하세요.",
    returnTo: (host: string): string => `${host} 사이트로 돌아갑니다.`,
    deny: "거부",
    authorize: "승인",
    failed: "이 승인을 저장하지 못했습니다. 고른 항목은 그대로 있습니다 — 다시 시도하세요.",
    unconfirmed: "처리되었는지 확인하지 못했습니다. 다시 진행하기 전에 요청을 확인하세요.",
    checkRequest: "요청 확인",
    sessionEnded: "로그아웃되었습니다. 계속하려면 다시 로그인하세요 — 이 요청은 아직 유효합니다.",
    ended: {
      notFound: { title: "이 요청을 찾지 못했습니다", body: "링크가 올바르지 않을 수 있습니다. 앱으로 돌아가 Malmoi에 다시 연결하세요." },
      expired: { title: "이 요청이 만료되었습니다", body: "요청의 유효 시간은 10분입니다. 앱으로 돌아가 Malmoi에 다시 연결하세요." },
      used: {
        title: "이미 응답한 요청입니다",
        body: "앞서 승인되었거나 거부되었습니다. 앱을 확인하고, 연결되어 있지 않으면 그 앱에서 Malmoi에 다시 연결하세요.",
      },
      unavailable: { title: "이 요청을 불러오지 못했습니다", body: "Malmoi 쪽에서 문제가 생겼습니다. 요청이 아직 열려 있을 수 있습니다 — 잠시 후 다시 시도하세요." },
      invalid: {
        title: "이 앱은 연결할 수 없습니다",
        body: "Malmoi가 요청의 출처를 확인하지 못해 연결을 중단했습니다. 앱에 전달된 정보는 없습니다.",
      },
    },
  },
  newProject: {
    formats: {
      "chrome-locales": { label: "Chrome 확장 프로그램 메시지", example: "_locales/{locale}/messages.json" },
      "json-catalog": { label: "JSON 카탈로그", example: "src/locales/{locale}.json" },
      "yaml-catalog": { label: "YAML 카탈로그", example: "config/locales/{locale}.yml" },
      "code-dict": { label: "코드 사전(언어별 파일)", example: "src/locales/{locale}.ts" },
      "ts-dict": { label: "코드 사전(모든 언어를 한 파일에)", example: "src/i18n/namespaces/*.ts" },
    },
    imported: (count: number, failed: number): string =>
      failed === 0
        ? `키 ${count.toLocaleString("ko-KR")}개를 동기화했습니다.`
        : `키 ${count.toLocaleString("ko-KR")}개를 동기화했지만 ${failed.toLocaleString("ko-KR")}개는 읽지 못했습니다.`,

    modal: {
      next: "다음",
      back: "이전",
      close: "닫기",
      step: (n: number): string => `4단계 중 ${n.toLocaleString("ko-KR")}단계`,
    },

    steps: {
      repo: {
        title: "새 프로젝트",
        description: "리포지토리와 Malmoi가 읽을 브랜치를 고르세요.",
      },
      files: {
        title: "번역 파일 선택",
        description: (n: number, repo: string, branch: string): string =>
          `${repo} · ${branch}에서 번역 파일 후보 ${n.toLocaleString("ko-KR")}개를 찾았습니다. 계속하기 전에 키를 확인하세요.`,
        loading: (repo: string, branch: string): string => `${repo} · ${branch} 읽는 중…`,
        emptyTitle: "번역 파일 경로 지정",
        emptyDescription: (repo: string, branch: string): string =>
          `${repo} · ${branch}에서 지원하는 번역 파일을 찾지 못했습니다. 경로를 지정하면 Malmoi가 확인합니다.`,
      },
      naming: {
        title: "프로젝트 정보",
        description: "기준 언어의 파일에 있는 키를 사용합니다. 프로젝트 이름과 주소의 기본값은 리포지토리 이름입니다.",
      },
      result: {
        title: "Malmoi 준비 완료",
        description: "Malmoi는 매일 밤 미전송 변경 사항을 PR로 보내거나 리포지토리의 새 커밋을 가져옵니다. 커밋할 때마다 바로 반영하려면 리포지토리에 푸시 토큰과 워크플로를 추가하세요.",
      },
    },

    empty: {
      connect: {
        action: "GitHub App 승인",
        reauthorize: "GitHub App 다시 승인",
      },
      install: {
        title: "리포지토리 연결",
        description: "리포지토리를 고르려면 계정이나 조직에 Malmoi GitHub App을 설치하세요.",
        action: "GitHub App 설치",
        installed: "조직에 이미 설치되어 있나요?",
        connect: "계정 연결",
      },
      repos: {
        title: "리포지토리 추가",
        description: "Malmoi GitHub App이 접근할 수 있는 리포지토리를 고르세요.",
        action: "리포지토리 추가",
      },
      waiting: {
        title: "승인 대기 중",
        description: "Malmoi GitHub App 설치 요청은 조직 소유자가 승인해야 합니다.",
        action: "다시 시도",
        otherAccount: "다른 계정에 설치",
        still: "아직 승인을 기다리고 있습니다.",
        info: "설치 요청은 아직 조직 소유자의 승인을 기다리고 있습니다.",
      },
      limit: {
        title: "프로젝트 한도에 도달함",
        description: (limit: number): string => `소유할 수 있는 프로젝트 한도(${limit.toLocaleString("ko-KR")}개)에 도달했습니다. 새로 만들려면 기존 프로젝트를 보관하세요.`,
        action: "내 프로젝트로 이동",
      },
      reconnect: {
        title: "GitHub 다시 연결",
        description: "리포지토리를 보려면 Malmoi GitHub App을 다시 승인하세요.",
      },
      noLink: "관리자에게 Malmoi GitHub App을 설치하고 리포지토리 접근 권한을 달라고 요청하세요.",
      listFailed: "리포지토리 목록을 불러오지 못했습니다.",
    },

    repo: {
      list: "리포지토리",
      search: { label: "리포지토리 검색", placeholder: "리포지토리 검색…" },
      pushedAt: (rel: string): string => `${rel} push됨`,
      branch: "브랜치",
      branchHelp: "Malmoi는 이 브랜치에서 번역 파일을 읽습니다. 나중에 설정에서 바꿀 수 있습니다.",
      branchDefault: "리포지토리의 기본 브랜치를 사용합니다.",
      branchTooMany: "이 리포지토리는 브랜치가 너무 많아 목록으로 보여 줄 수 없습니다. 브랜치 이름을 입력하세요.",
      notListed: "리포지토리가 보이지 않나요?",
      loading: "Malmoi GitHub App이 설치된 리포지토리를 찾는 중…",
      searchEmpty: (q: string): string => `“${q}”에 해당하는 리포지토리 없음`,
      clearSearch: "검색어 지우기",
    },

    files: {
      candidates: "번역 파일 후보",
      resize: "파일 목록 크기 조절",
      include: (path: string) => `${path} 포함`,
      previewCandidate: (path: string) => `${path} 미리보기`,
      conflicts: "같은 파일을 사용하는 항목이 중복 선택되었습니다. 하나만 남기고 선택을 해제하세요.",
      keys: (n: number): string => `키 ${n.toLocaleString("ko-KR")}개`,
      summaryShort: (locales: number, keys: string): string => `언어 ${locales.toLocaleString("ko-KR")}개 · ${keys}`,
      notListed: "목록에 없나요?",
      setPath: "경로 직접 지정",
      preview: {
        key: "키",
        value: "값",
        more: (n: number): string => `키 ${n.toLocaleString("ko-KR")}개 더 있음`,
        language: "언어",
        option: (code: string, keys: string | undefined): string => (keys === undefined ? code : `${code} · ${keys}`),
        none: "미리보기 없음",
        noneDescription: "경로를 지정하면 Malmoi가 찾은 키를 보여 줍니다. 일치하는 파일이 없으면 프로젝트가 만들어지지 않습니다.",
        rows: "미리보기 행",
        unavailable: "이 파일을 읽지 못했습니다.",
      },
      manual: {
        format: "파일 형식",
        path: "경로",
        pathHint: {
          "per-locale": (token: ReactNode): ReactNode => <>{token} 자리표시에 언어가 들어갑니다.</>,
          "multi-locale": (token: ReactNode): ReactNode => (
            <>이 형식은 모든 언어를 파일 하나에 담으므로 경로에 언어 자리표시가 없습니다. 파일 경로에는 {token} 패턴을 쓸 수 있습니다.</>
          ),
        },
        baseLocale: "기준 언어",
        baseLocalePlaceholder: "en",
        hint: "경로를 지정하면 위의 선택이 해제됩니다.",
      },
    },

    baseLocale: {
      row: (path: string, keys: string | undefined): string => (keys === undefined ? path : `${path} · ${keys}`),
      title: "기준 언어",
      hint: "이 언어의 파일을 기준으로 키 목록을 만듭니다. 다른 언어에만 있는 키는 포함되지 않습니다.",
    },

    naming: {
      name: "이름",
      slug: "주소",
      hint: (address: ReactNode, branch: ReactNode): ReactNode => (
        <>
          {address} 주소에서 열립니다. 번역은 {branch} 브랜치로 보내는 PR에 담깁니다.{" "}
          <strong className="text-foreground font-normal">주소는 나중에 바꿀 수 없습니다.</strong>
        </>
      ),
      create: "프로젝트 만들기",
      creating: "프로젝트를 만들고 선택한 파일을 모두 동기화하는 중…",
      nothingCreated: "프로젝트는 생성되지 않았습니다.",
      resultUnknown: "결과를 확인하지 못했습니다. 다시 시도하기 전에 프로젝트 목록을 확인하세요. 프로젝트가 있으면 설정에서 새 푸시 토큰을 발급하세요.",
      failedSurface: (path: string, failed: number) => `${path}: 동기화 문제 ${failed.toLocaleString("ko-KR")}건.`,
      info: (path: string, branch: string): string =>
        `프로젝트를 만들면 ${branch} 브랜치의 ${path} 경로를 한 번 읽습니다. 리포지토리에는 아무것도 쓰지 않습니다.`,
      mostKeys: "키가 가장 많음",
      baseOption: (code: string, keys: string | undefined, mostKeys: boolean): string =>
        [code, keys, mostKeys ? "키가 가장 많음" : undefined].filter((part) => part !== undefined).join(" · "),
      // 언어 코드 뒤에 받침 조사를 붙이지 않으려고 "언어"를 붙인다(DESIGN §10.0).
      keyGap: (lang: string, n: number, base: string): string =>
        `${lang} 언어는 ${base} 언어보다 키가 ${n.toLocaleString("ko-KR")}개 적습니다. ${lang} 언어를 기준으로 하면 그 키들이 빠집니다.`,
      slugTaken: (alt: string | undefined): string =>
        alt === undefined
          ? "이미 사용 중인 주소입니다. 다른 주소를 입력하세요."
          : `이미 사용 중인 주소입니다. ${alt} 같은 다른 주소를 입력하세요.`,
      slugEmpty: "주소를 입력하세요.",
      slugFormat: "주소에는 영문 소문자, 숫자, '-', '.', '_'를 쓸 수 있습니다.",
      slugTooLong: (max: number): string => `주소는 최대 ${max.toLocaleString("ko-KR")}자까지 쓸 수 있습니다.`,
      slugReserved: "예약된 주소입니다.",
    },

    errors: {
      sessionLost: "다시 로그인한 뒤 돌아오세요. 프로젝트는 생성되지 않았습니다.",
      sessionLostAfterCreate: "다시 로그인한 뒤 돌아오세요. 프로젝트는 목록에 그대로 있습니다.",
    },

    result: {
      token: {
        title: "푸시 토큰",
        description: (secret: ReactNode): ReactNode => (
          <>
            이 값을 리포지토리의 Actions 시크릿 {secret} 항목에 추가하세요.{" "}
            <strong className="text-foreground font-normal">이 페이지를 떠나면 다시 볼 수 없습니다.</strong> 잃어버렸다면
            설정에서 교체하세요.
          </>
        ),
      },
      ingest: {
        retry: "다시 시도",
        refsHint: "코드 사용처는 CI 워크플로가 처음 실행된 뒤 표시됩니다. 번역은 지금 시작할 수 있습니다.",
        open: "프로젝트 열기",
      },
      failed: "완료하지 못했습니다. 잠시 후 다시 시도하세요.",
    },
  },

  translations: {
    loading: "번역을 불러오는 중…",
    keys: (n: number): string => `키 ${n.toLocaleString("ko-KR")}개`,

    workspace: {
      filters: {
        state: { axis: "상태", any: "모든 키", incomplete: "미완료", review: "검토 필요", unsent: "미전송", new: "GitHub의 새 키", newHint: "마지막 파일 확인 이후 추가된 키입니다." },
        clear: "필터 지우기",
        search: "키 검색",
        searchPlaceholder: "모든 소스 검색…",
      },
      tree: { title: "소스", allNamespaces: "모든 네임스페이스", allSources: "모든 소스", filter: "네임스페이스 필터", open: "소스 보기" },
      resize: "키 목록 크기 조절",
      list: {
        keys: "키",
        savedExtra: (n: number): string => `+${n.toLocaleString("ko-KR")}개 저장됨`,
        missing: (n: number): string => `미번역 ${n.toLocaleString("ko-KR")}개`,
        complete: "완료",
        notSent: "미전송",
        needsReview: "검토 필요",
        saved: "저장됨",
      },
      detail: {
        languages: (filled: number, total: number): string => `언어 ${total.toLocaleString("ko-KR")}개 중 ${filled.toLocaleString("ko-KR")}개`,
        allLanguages: "모든 언어",
        missingOnly: "미번역만",
        languagesGroup: "언어",
        source: "소스",
        notSaved: "저장 안 됨",
        saving: "저장 중…",
        missing: "미번역",
        noDescription: "코드에 설명 없음",
        noCommit: "아직 연결할 커밋 없음",
        referenced: (n: number): string => `${n.toLocaleString("ko-KR")}곳에서 참조됨`,
        copyLink: "링크 복사",
        copied: "복사됨",
        copyFailed: "복사하지 못함",
        selectKey: "번역할 키를 고르세요",
        selectKeyBody: "선택한 키의 언어별 번역이 여기에 표시됩니다.",
        keyGone: (source: string): string => `이 키는 더 이상 ${source} 소스에 없습니다`,
      },
      footer: {
        unsaved: (n: number): string => `저장하지 않은 변경 사항 ${n.toLocaleString("ko-KR")}건`,
        saved: "저장됨",
        savedNotSent: "저장됨 · 미전송",
        savedSince: (n: number): string => `저장됨 · 이후 변경 사항 ${n.toLocaleString("ko-KR")}건`,
        save: "저장",
        tryAgain: "다시 시도",
        saveFailed: { title: "이 키를 저장하지 못했습니다", body: "입력한 텍스트는 그대로 있습니다. 다시 시도하거나 잠시 후 저장하세요." },
        saveUnknown: { title: "저장되었는지 확인하지 못했습니다", body: "입력한 텍스트는 그대로 있습니다. 다시 저장하기 전에 현재 값을 확인하세요." },
        cannotClear: {
          title: (locales: string): string => `${locales} 언어는 비워 둘 수 없습니다`,
          body: "이 파일 형식은 번역을 지울 수 없어 아무것도 저장하지 않았습니다. 값을 입력하거나 변경을 취소하세요.",
        },
        archived: "보관된 프로젝트는 편집할 수 없습니다",
        lostAccess: "더 이상 이 프로젝트에 접근할 수 없습니다",
        keyGone: "이 키는 더 이상 사용할 수 없습니다. 텍스트를 복사한 뒤 페이지를 새로고침하세요.",
        notReady: "이 프로젝트는 첫 동기화를 마치지 않았습니다. 텍스트는 그대로 있으니 동기화가 끝난 뒤 저장하세요.",
        session: {
          title: "로그인이 만료되었습니다",
          body: "이 탭에서 다시 로그인하세요. 그때까지 입력한 텍스트는 화면에 남아 있습니다.",
          signIn: "로그인",
          restored: (n: number): string => `다시 로그인함 · 저장하지 않은 변경 사항 ${n.toLocaleString("ko-KR")}건 복원됨`,
          storageBlocked: "로그인하기 전에 텍스트를 복사하세요. 이 브라우저에서는 입력 내용을 보관할 수 없습니다.",
        },
      },
      revert: {
        button: "마지막으로 보낸 값으로 되돌리기",
        title: "마지막으로 보낸 값으로 되돌릴까요?",
        body: (n: number, list: string): string =>
          `언어 ${n.toLocaleString("ko-KR")}개(${list})의 미전송 변경 사항이 마지막으로 전송이 확인된 값으로 돌아갑니다. 그 뒤에 저장한 내용은 버려집니다.`,
        confirm: "번역 되돌리기",
        unavailable: "변경된 언어 중 일부는 이전에 보낸 값이 없습니다.",
        unsaved: "먼저 변경을 저장하거나 취소하세요.",
        busy: "저장, 게시, 동기화 중에는 사용할 수 없습니다.",
        forbidden: "프로젝트 소유자만 보낸 값으로 되돌릴 수 있습니다.",
        failed: { title: "이 키를 되돌리지 못했습니다", body: "아무것도 바뀌지 않았습니다. 다시 시도하거나 마지막 동기화를 확인하세요." },
        unknown: { title: "되돌렸는지 확인하지 못했습니다", body: "되돌리기가 끝났을 수 있습니다. 다시 시도하기 전에 현재 값을 확인하세요.", check: "현재 값 확인" },
        changed: { title: "이 창이 열려 있는 동안 값이 바뀌었습니다", body: "누군가 이 키에 새 값을 저장했습니다. 되돌리기 전에 새 값을 확인하세요. 현재 창의 내용은 최신 상태가 아닙니다.", again: "다시 검토" },
        reverted: "마지막으로 전송이 확인된 값으로 되돌렸습니다",
      },
      sync: { ownerOnly: "프로젝트 소유자만 동기화할 수 있습니다." },
      syncLock: {
        title: "동기화 중…",
        until: (time: ReactNode): ReactNode => <>동기화가 끝날 때까지 편집을 저장할 수 없습니다. 늦어도 {time}에는 끝납니다</>,
        ok: "확인",
      },
      publish: {
        title: "변경을 저장하지 않고 게시할까요?",
        body: (project: string, list: string, key: string, n: number): string =>
          `게시는 ${project} 프로젝트에 저장된 모든 값을 보냅니다. ${key} 키의 저장하지 않은 ${list} 번역(언어 ${n.toLocaleString("ko-KR")}개)은 초안으로 여기에 남습니다.`,
        keep: "계속 편집",
        preview: "저장된 변경 미리보기",
      },
      discard: {
        title: "변경을 취소할까요?",
        body: (key: string, list: string, n: number): string =>
          `${key} 키의 저장하지 않은 ${list} 번역(${n.toLocaleString("ko-KR")}개)이 사라집니다.`,
        keep: "계속 편집",
        discard: "변경 취소",
        leave: "변경 취소 후 이동",
      },
      empty: {
        noIncomplete: (ns: string): string => `${ns}에 미완료 키 없음`,
        noMatch: (q: string): string => `“${q}”에 해당하는 키 없음`,
        noIncompleteMatch: (q: string): string => `“${q}”에 해당하는 미완료 키 없음`,
        filteredOut: "필터 조건에 맞는 키 없음",
        searchAll: "모든 소스 검색",
        clearSearch: "검색어 지우기",
        noKeys: (ns: string): string => `${ns}에 키 없음`,
        noActive: "이 프로젝트에 활성 키 없음",
      },
    },

    cellLabel: (key: string, locale: string): string => `${key} · ${locale}`,

    connection: {
      owner: {
        disconnected: "설정에서 다시 연결하세요.",
        notConnected: "설정에서 연결하세요.",
        wrongRepository: "설정에서 확인하세요.",
      },
      editor: { wrongRepository: "프로젝트 소유자에게 확인을 요청하세요." },
    },

    banner: {
      paused: (n: number): string =>
        `미전송 변경 사항 ${n.toLocaleString("ko-KR")}건이 전송될 때까지 리포지토리 업데이트를 보류합니다.`,
      sendWithPublish: "게시로 보내기",
      basePending: (locale: string): string =>
        `기준 언어를 ${locale} 언어로 변경하도록 요청했습니다. ` +
        "리포지토리의 GitHub Actions 워크플로가 다음에 동기화할 때 바뀌며, 동기화 버튼으로는 적용되지 않습니다. " +
        "미전송 변경 사항이 있으면 동기화가 보류되므로 먼저 게시하세요.",
    },

    empty: {
      notReady: "아직 번역할 내용 없음",
      noKeys: {
        description: "개발자가 리포지토리에 추가한 문자열은 다음 동기화 뒤에 여기에 나타납니다.",
      },
    },

    publish: {
      button: "게시",
      unsentCount: (n: number): string => `미전송 변경 사항 ${n.toLocaleString("ko-KR")}건`,
      viewResult: "결과 보기",
      viewLink: "PR 보기",
      nothing: "보낼 내용이 없습니다. 모든 변경 사항을 이미 보냈습니다.",
      paused: "지금은 게시할 수 없습니다.",

      previewTitle: (n: number): string => `변경 사항 ${n.toLocaleString("ko-KR")}건 게시`,
      previewIntro: (repo: string): string =>
        `변경 사항을 PR 하나로 ${repo} 리포지토리에 보냅니다.`,
      previewIntroPartial: (repo: string): string =>
        `보낼 수 있는 변경 사항을 PR 하나로 ${repo} 리포지토리에 보냅니다.`,
      same: {
        undoes: (n: number): string => `#${n}의 변경 사항을 되돌림`,
        already: "이미 리포지토리에 있음",
        closesTitle: (n: number): string => `게시하면 PR #${n} 닫힘`,
        closesBody: (n: number, branch: string): string =>
          `현재 번역이 다시 ${branch} 브랜치와 같아져 #${n}에는 머지할 내용이 남지 않습니다. Malmoi가 이유를 담은 댓글과 함께 닫습니다.`,
        closeAction: (n: number): string => `PR #${n} 닫기`,
        nothingTitle: (branch: string): string => `${branch} 브랜치와 다른 내용 없음`,
        nothingBody: "현재 번역이 이미 리포지토리와 같아 PR이 열리지 않습니다. 게시하면 전송된 것으로 표시됩니다.",
        action: "게시",
      },
      nothingSendable: {
        title: "아직 보낼 수 있는 내용 없음",
        body: "필요한 언어 파일이나 키가 없어 변경 사항을 보낼 수 없습니다. PR은 변경되지 않습니다.",
      },
      previewCounts: (n: number, keys: number): string =>
        `키 ${keys.toLocaleString("ko-KR")}개에 변경 사항 ${n.toLocaleString("ko-KR")}건.`,
      previewSummary: (n: number, keys: number, files: number): string =>
        `변경 사항 ${n.toLocaleString("ko-KR")}건 · 키 ${keys.toLocaleString("ko-KR")}개 · 파일 ${files.toLocaleString("ko-KR")}개`,
      changes: (n: number): string => `변경 사항 ${n.toLocaleString("ko-KR")}건`,
      otherFile: {
        label: "미전송 변경 사항 없음",
        body: "이 파일은 Malmoi의 현재 번역으로 다시 씁니다. 코드에서 삭제한 키는 제외하고, 머지되지 않은 이전 PR의 값은 다시 포함합니다.",
      },
      fileSummary: (n: number, keys: number): string =>
        `변경 사항 ${n.toLocaleString("ko-KR")}건 · 키 ${keys.toLocaleString("ko-KR")}개`,
      key: "키",
      locale: "언어",
      value: "값",
      beforeLabel: "리포지토리의 값",
      afterLabel: "변경 후",
      truncated: (n: number): string =>
        `${n.toLocaleString("ko-KR")}개는 여기에 표시되지 않습니다. 게시하면 모두 보냅니다.`,
      withoutFile: (n: number): string =>
        `언어 파일이 아직 리포지토리에 없어 변경 사항 ${n.toLocaleString("ko-KR")}건은 목록에 없습니다. 파일이 생길 때까지 여기에 남습니다.`,
      withoutKey: (n: number): string =>
        `언어 파일에 키가 없어 변경 사항 ${n.toLocaleString("ko-KR")}건은 목록에 없습니다. 파일에 그 키가 생길 때까지 여기에 남습니다.`,
      withheld: {
        file: (n: number): string =>
          `언어 파일이 리포지토리에 없어 변경 사항 ${n.toLocaleString("ko-KR")}건을 보내지 않았습니다. 파일이 생길 때까지 여기에 남습니다.`,
        key: (n: number): string =>
          `언어 파일에 키가 없어 변경 사항 ${n.toLocaleString("ko-KR")}건을 보내지 않았습니다. 파일에 그 키가 생길 때까지 여기에 남습니다.`,
        editor: "프로젝트 소유자에게 요청하세요.",
        owner: {
          file: "리포지토리에 파일을 추가하거나, ‘마지막으로 보낸 값으로 되돌리기’를 선택하세요.",
          key: "‘마지막으로 보낸 값으로 되돌리기’를 선택하거나, 언어 파일에 키를 다시 추가하세요.",
          fileNoRevert: "리포지토리에 파일을 추가하거나, 동기화로 변경 사항을 버리세요.",
          keyNoRevert: "언어 파일에 키를 다시 추가하거나, 동기화로 변경 사항을 버리세요.",
        },
      },

      prOpen: {
        title: (n: number): string => `PR #${n} 열려 있음 — 게시하면 그 내용을 교체함`,
        body: (n: number, changes: number): ReactNode => (
          <>
            두 번째 PR은 열리지 않습니다. #{n}에는 이번 변경 사항{" "}
            {changes.toLocaleString("ko-KR")}건만이 아니라{" "}
            <span className="text-foreground">미전송 변경 사항 전체</span>가 담깁니다.
          </>
        ),
      },
      prNone: {
        title: (repo: string): string => `${repo} 리포지토리에 새 PR이 열림`,
        body: (changes: number): string =>
          `열린 PR이 없어 변경 사항 ${changes.toLocaleString("ko-KR")}건을 새 PR로 보냅니다.`,
      },
      prUnknown: {
        title: "열린 PR을 확인하지 못했습니다",
        body: "열린 PR이 있다면 새로 만들지 않고 기존 PR의 내용을 교체합니다.",
      },
      openPr: "PR 열기",
      replacePr: (n: number): string => `PR #${n} 교체`,

      progressTitle: (n: number): string => `변경 사항 ${n.toLocaleString("ko-KR")}건 게시 중`,
      progressDescription:
        "번역 파일을 쓰고 PR을 엽니다. 보통 몇 초 걸립니다.",
      progress: (branch: string): readonly string[] => [
        "번역 파일 생성",
        `${branch} 브랜치에 커밋`,
        "PR 열기",
      ],
      leave: "페이지를 떠나도 게시는 계속됩니다.",

      created: "검토 요청됨",
      createdDescription: (n: number): string =>
        `변경 사항 ${n.toLocaleString("ko-KR")}건을 PR에 담았습니다. 머지되면 서비스에 반영됩니다.`,
      prMeta: (n: number, files: number): string =>
        `PR #${n} · 파일 ${files.toLocaleString("ko-KR")}개 변경됨`,
      openedJustNow: "방금 열림",
      holdsEverything: "미전송 변경 사항 전체를 담음",
      prState: "열림",
      accessNote:
        "PR 수정이나 닫기는 GitHub에서 할 수 있습니다. GitHub 접근 권한이 없다면 프로젝트 소유자에게 요청하세요.",

      updated: "기존 PR을 업데이트했습니다",
      updatedDescription: (n: number, changes: number): string =>
        `#${n} PR이 아직 열려 있어 Malmoi가 두 번째를 열지 않고 그 내용을 교체했습니다. 이제 오늘의 변경 사항 ${changes.toLocaleString("ko-KR")}건만이 아니라 미전송 변경 사항 전체를 담고 있습니다.`,
      replacedTitle: "브랜치 내용을 교체했습니다",
      replacedBody: (branch: string, base: string): ReactNode => (
        <>
          {branch} 브랜치는 항상{" "}
          <span className="text-foreground">{base} 브랜치에서 커밋 하나</span>만 앞서므로, 이 PR은
          그동안 더해진 내용의 이력이 아니라 미전송 변경 사항 전체의 스냅샷입니다.
        </>
      ),
      tellReviewer: (n: number): string =>
        `#${n} PR이 오래 열려 있었다면 검토자에게 내용이 바뀌었다고 알려 주세요.`,

      noChanges: "파일 변경 없음",
      noChangesDescription:
        "변경 사항이 이미 리포지토리에 있어 PR이 필요하지 않았습니다.",
      noChangesBody: (branch: string): ReactNode => (
        <>
          Malmoi가 쓸 내용을{" "}
          <span className="text-foreground">{branch}</span> 브랜치와 비교했더니 둘이 같았습니다. 같은 값이
          리포지토리에서 동기화되었거나, 보내기 전에 변경 사항을 되돌렸을 때 이렇게 됩니다.
        </>
      ),
      inLogs: "로그에는 ‘보낼 내용 없음’으로 기록됩니다.",
      close: "닫기",

      notSent: "제외됨 — 일부 값을 파일에 쓸 수 없음",
      notSentDescription:
        "일부 값을 파일에 담을 수 없어 리포지토리에 쓰기 전에 중단했습니다. 변경 사항은 여기에 그대로 저장되어 있습니다.",
      closedPr: {
        description: (branch: string): string => `변경 사항이 이제 ${branch} 브랜치와 같아 이전 PR을 닫았습니다.`,
        line: (n: number, branch: string): string => `PR #${n}에 ${branch} 브랜치와 다른 내용이 더 이상 없어 닫았습니다.`,
        owner: "이후 변경 사항을 게시하면 새 PR이 열립니다.",
        editor: "이후 변경 사항을 게시하면 새 PR이 열립니다. PR을 유지해야 한다면 프로젝트 소유자에게 요청하세요.",
        view: (n: number): string => `#${n} 보기`,
      },
      withheldDescription: {
        withheld: "리포지토리에 아무것도 쓰지 않았습니다. 이 변경 사항은 보낼 수 있을 때까지 여기에 저장되어 있습니다.",
        noChanges: "리포지토리에 아무것도 쓰지 않았습니다. 다른 변경 사항은 이미 리포지토리와 같았고, 이 변경 사항은 보낼 수 있을 때까지 여기에 저장되어 있습니다.",
      },
      notWritten: "제외됨",
      warnings: (n: number): string =>
        `경고 ${n.toLocaleString("ko-KR")}건 · 값은 Malmoi에 그대로 저장됨`,
      stillHere: "값은 Malmoi에 보존되며, 파일에 쓸 수 있게 되면 전송됩니다.",

      configError: "리포지토리에 접근하지 못했습니다",
      configErrorDescription: (repo: string, branch: string): string =>
        `${branch} 브랜치에 게시하려면 ${repo} 리포지토리에서 조치가 필요합니다. 변경 사항은 여기에 그대로 저장되어 있습니다.`,
      wontHelp: "다시 시도해도 해결되지 않습니다",
      repository: "리포지토리",
      baseBranch: "기준 브랜치",
      failedAt: "실패 시각",
      reference: "참조 ID",
      sendReference: "위 참조 ID를 프로젝트 소유자에게 전달하세요. 로그에서도 확인할 수 있습니다.",
      settings: "설정 열기",
      signIn: "로그인",

      transientError: "GitHub가 응답하지 않았습니다",
      transientErrorDescription:
        "GitHub로 보낸 요청이 중간에 실패했습니다. 변경 사항은 여기에 그대로 저장되어 있습니다.",
      transientErrorBody: (): ReactNode => (
        <>
          보통 일시적인 문제이고 다시 시도해도 안전합니다. Malmoi는{" "}
          <span className="font-medium">같은 브랜치를 교체</span>하므로 다시 시도해도 중복 PR이 생기지
          않습니다.
        </>
      ),
      retry: "다시 시도",
      lostResponse: "응답을 받지 못했습니다",
      lostResponseDescription:
        "변경 사항이 이미 전송되었을 수 있습니다. 변경 사항은 여기에 그대로 저장되어 있습니다.",

      notStarted: "아무것도 보내지 않았습니다. 변경 사항은 보존됩니다.",
      refused: "게시를 시작하지 못했습니다. 프로젝트 목록에서 이 프로젝트를 다시 여세요.",
      baseFileMissing: {
        title: "기준 언어 파일이 리포지토리에 없습니다",
        description: (path: string, branch: string): string =>
          `Malmoi는 ${branch} 브랜치의 ${path} 경로에서 이 파일을 찾으며, 파일을 찾지 못해 아무것도 보내지 않았습니다.`,
        owner: "해당 브랜치에 파일을 복원하거나, 설정에서 경로나 브랜치를 바꾸세요.",
        editor: "프로젝트 소유자에게 파일을 복원하거나 설정에서 경로를 바꿔 달라고 요청하세요.",
      },
      baseFileUnreadable: {
        title: "기준 언어 파일을 읽을 수 없습니다",
        description: (path: string, branch: string): string =>
          `Malmoi가 ${branch} 브랜치의 ${path} 경로를 해석하지 못해 파일에 어떤 키가 있는지 알 수 없습니다. 아무것도 보내지 않았습니다.`,
        owner: "그 브랜치의 파일을 고치거나, 설정에서 경로나 브랜치를 바꾸세요.",
        editor: "프로젝트 소유자에게 파일을 고치거나 설정에서 경로를 바꿔 달라고 요청하세요.",
      },
      unsupportedFileKind: {
        title: "리포지토리 경로가 일반 파일이 아닙니다",
        description: (path: string, branch: string): string =>
          `${branch} 브랜치의 ${path} 경로가 일반 파일이 아니거나, 상위 경로가 디렉터리가 아닙니다. 아무것도 보내지 않았습니다.`,
        owner: "해당 브랜치의 디렉터리 안에 일반 언어 파일을 두거나, 설정에서 경로를 바꾸세요.",
        editor: "프로젝트 소유자에게 해당 브랜치의 디렉터리 안에 일반 언어 파일을 두도록 요청하세요.",
      },
      unknownDelivery: "변경 사항이 전송되었는지 확인하지 못했습니다.",

      alreadyRunning: "다른 사람이 지금 게시하고 있습니다",
      alreadyRunningBody:
        "방금 다른 게시가 시작되었습니다. 끝날 때까지 기다리세요. 내 변경 사항은 그 게시에 포함되거나 다음 게시 때 보내집니다.",
      tooSoon: "잠시 기다리세요",
      tooSoonBody:
        "게시가 연달아 실행되지 않도록 잠시 대기합니다.",
      wait: (seconds: number): string => `${seconds.toLocaleString("ko-KR")}초 후 다시 시도`,

      previewFailed: "게시할 내용을 불러오지 못했습니다",
      previewFailedDescription: (branch: string): string =>
        `변경 사항을 미리 보여 주기 위해 ${branch} 브랜치의 번역 파일을 요청했지만 응답을 받지 못했습니다.`,
      previewFailedTitle: (branch: string): string => `${branch} 브랜치의 파일을 읽을 수 없습니다`,
      previewFailedBody: (n: number): string =>
        `변경 사항 ${n.toLocaleString("ko-KR")}건은 보존되어 있습니다. PR에 반영될 내용을 확인할 수 있도록 미리보기를 불러온 뒤 게시할 수 있습니다.`,
      previewFailedHint:
        "문제가 계속되면 리포지토리 연결을 확인하세요 — 프로젝트 소유자가 설정에서 확인할 수 있습니다.",
    },
  },
  sources: {
    screenLoading: "소스를 불러오는 중…",
    title: "소스",
    count: (n: number): string => `소스 ${n.toLocaleString("ko-KR")}개`,
    languageCount: (n: number): string => `언어 ${n.toLocaleString("ko-KR")}개`,
    translatedOfTotal: (translated: number, total: number): string => `${total.toLocaleString("ko-KR")}개 중 ${translated.toLocaleString("ko-KR")}개`,
    unmanaged: (n: number): string => `항목 ${n.toLocaleString("ko-KR")}개는 일반 텍스트가 아니어서 코드에 그대로 남습니다.`,
    add: "소스 추가",
    open: "번역 열기",
    openLanguage: "열기",
    details: "소스 상세",
    removal: {
      reasons: {
        "last-source": "프로젝트에는 소스가 하나 이상 있어야 합니다.",
        importing: "이 소스는 동기화 중입니다. 끝난 뒤 다시 시도하세요.",
        "stale-approval": "확인한 내용이 지금도 그대로인지 확인하지 못해 아무것도 제거하지 않았습니다. 제거 창을 다시 열어 확인하세요.",
      },
      action: "소스 제거",
      title: (slug: string): string => `${slug}을(를) 이 프로젝트에서 제거할까요?`,
      body: "이 프로젝트에서 동기화가 멈춥니다. 리포지토리의 파일은 바뀌지 않습니다. 언제든 다시 추가하면 번역이 돌아옵니다.",
      unsent: (n: number, count: ReactNode): ReactNode => <>나중에 다시 추가하면 {count}이 리포지토리의 값으로 바뀝니다.</>,
      openPr: "열린 PR이 이 소스의 파일을 바꿨다면 그 변경은 다음 게시에서 빠집니다.",
      prUnknown: "열린 PR을 확인하지 못했습니다. PR이 이 소스의 파일을 바꿨다면 그 변경은 다음 게시에서 빠집니다.",
      workflowLine: "GitHub 워크플로에서 이 소스의 단계(step)를 지우세요. 그대로 두면 다음 실행이 실패하고 그 뒤 소스도 멈춥니다.",
      previewFailed: "이 소스의 미전송 변경 사항을 확인하지 못했습니다. 제거하기 전에 다시 시도하세요.",
      unconfirmed: "제거되었는지 확인하지 못했습니다. 목록이 현재 상태입니다.",
      removed: (slug: string): string => `${slug}을(를) 제거했습니다.`,
      workflowStep: (link: ReactNode): ReactNode => <>{link}에서 워크플로의 이 소스 단계를 지우세요.</>,
    },
    files: "파일",
    path: "경로 패턴",
    format: "파일 형식",
    repository: "리포지토리 / 브랜치",
    notConfigured: "설정되지 않음",
    unknownFormat: "알 수 없는 형식",
    status: "동기화 상태",
    languages: "언어",
    retry: "다시 시도",
    loading: "소스 상세를 불러오는 중…",
    unavailable: "이 소스를 불러오지 못했습니다. 다시 시도하세요.",
    rejected: "이 소스를 볼 수 없습니다. 이 창을 닫고 페이지를 새로고침하세요.",
    latestFailed: "변경은 완료되었지만 최신 상태를 불러오지 못했습니다. 상세를 다시 불러오세요.",
    emptyTitle: "아직 소스가 없습니다",
    emptyOwner: "문자열이 담긴 파일을 추가하면 Malmoi가 기준 브랜치에서 읽습니다. 첫 동기화가 끝나면 키와 언어가 여기에 나타납니다.",
    emptyEditor: "번역 파일은 프로젝트 소유자가 추가합니다. 첫 동기화가 끝나면 여기에서 언어를 확인하고 번역을 시작할 수 있습니다.",
    ownerOnly: "프로젝트 소유자만 소스를 추가할 수 있습니다.",
    askOwner: "프로젝트 소유자에게 첫 동기화를 실행해 달라고 요청하세요.",
    askOwnerRerun: "프로젝트 소유자에게 동기화를 다시 실행해 달라고 요청하세요.",
    reconnectOwner: "설정에서 리포지토리를 다시 연결한 뒤 다시 시도하세요.",
    reconnectEditor: "프로젝트 소유자에게 리포지토리를 다시 연결해 달라고 요청하세요.",
    firstImport: "첫 동기화가 아직 끝나지 않았습니다. 소스를 추가해도 CI 워크플로가 자동으로 연결되지는 않습니다.",
    noLanguages: "사용할 수 있는 활성 언어가 없습니다. 리포지토리에서 언어를 복원한 뒤 다시 동기화하세요.",
    applied: "적용됨",
    requested: "요청됨",
    waiting: "적용 대기 중",
    pendingHelp: "CI에서 기준 언어를 지정했다면 워크플로의 값도 새 언어로 변경하세요.",
    orphanReason: "이 언어는 리포지토리에서 제거되었습니다.",
    orphanStrip: (code: string): string => `${code} 언어는 리포지토리에서 제거되었습니다.`,
    orphanStripRest: (translations: number, active: number): string =>
      `번역 ${translations.toLocaleString("ko-KR")}개는 보존되며 읽기 전용입니다. 리포지토리에 이 언어가 다시 생기고 다음 동기화가 실행되면 돌아옵니다. 활성 언어 ${active.toLocaleString("ko-KR")}개에는 포함되지 않습니다.`,
    statusHelp: "리포지토리에서 오는 동기화로 업데이트됩니다.",
    baseHelp: "기준 언어의 파일로 이 소스의 키 목록을 정합니다.",
    languagesHelp: "언어 목록은 리포지토리에서 읽습니다. 파일 추가·제거는 리포지토리에서 하세요.",
    baseRow: "키 목록의 기준",
    needReview: (count: number): string => `${count.toLocaleString("ko-KR")}개 검토 필요`,
    missingRepo: "리포지토리에서 제거됨",
    editorBase: "프로젝트 소유자만 소스의 기준 언어를 바꿀 수 있습니다.",
    started: "시작",
    addedAgo: "추가",
    lastSuccess: "마지막 동기화 성공",
    archivedOwner: "번역은 보존됩니다. 프로젝트를 복원할 때까지 동기화가 멈추고 소스를 보거나 바꿀 수 없습니다.",
    archivedEditor: "번역은 보존됩니다. 프로젝트 소유자가 복원할 수 있으며, 그때 소스와 번역이 돌아옵니다.",
    discardTitle: "기준 언어 변경을 버릴까요?",
    discardBody: (requested: string, applied: string): string =>
      `${requested} 언어를 골랐지만 저장하지 않았습니다. 기준 언어는 ${applied} 언어로 유지됩니다.`,
    keepEditing: "계속 편집",
    discardChange: "변경 버리기",
    importedSummary: (keys: number, locales: number): string =>
      `리포지토리에서 읽은 활성 키 ${keys.toLocaleString("ko-KR")}개, 언어 ${locales.toLocaleString("ko-KR")}개.`,
    notImportedHelp: "이 파일의 키와 언어가 아직 동기화되지 않았습니다. 소스를 추가해도 CI가 자동으로 연결되지는 않습니다 — 문자열은 리포지토리의 워크플로가 보냅니다.",
    workflow: "설정에서 워크플로를 고쳐 추가한 소스를 포함하세요.",
    addedCount: (count: number): string => `소스 ${count.toLocaleString("ko-KR")}개 추가됨`,
    addedOne: (count: number): string => `키 ${count.toLocaleString("ko-KR")}개 동기화됨`,
    // 결과 줄 `{slug} 동기화 실패` 조각 — 동기화 실패의 배지 낱말이다.
    addedFailed: "동기화 실패",
    resultKeep: "상태가 업데이트되어도 이 결과는 직접 닫을 때까지 표시됩니다.",
  },

  locales: {
    base: "기준",
    orphaned: {
      badge: "리포지토리에서 제거됨",
    },
    empty: {
      description: "첫 동기화가 번역 파일을 읽으면 나타납니다.",
    },
    field: {
      label: "기준 언어",
      help: "원문을 작성한 언어입니다. 바꾸면 동기화 버튼이 아니라 리포지토리의 GitHub Actions 워크플로가 다음에 동기화할 때 적용됩니다 — 워크플로의 base-locale: 값도 맞게 고치세요.",
      save: "저장",
      saving: "저장 중…",
      saved: "저장됨",
      failed: "저장하지 못했습니다. 잠시 후 다시 시도하세요.",
      noLocales: "첫 동기화가 끝난 뒤 설정할 수 있습니다.",
    },
    pending: {
      copy: "줄 복사",
    },
  },

  members: {
    loading: "멤버를 불러오는 중…",
    seats: (n: number, limit: number): string => `정원 ${limit.toLocaleString("ko-KR")}명 중 ${n.toLocaleString("ko-KR")}명`,
    seatsFull: (limit: number): string => `정원 ${limit.toLocaleString("ko-KR")}명 중 ${limit.toLocaleString("ko-KR")}명 — 초대하려면 멤버를 제거하세요`,
    ownerOnly: "프로젝트 소유자만 초대하거나 역할을 바꿀 수 있습니다",
    count: (n: number): string => `멤버 ${n.toLocaleString("ko-KR")}명`,
    unreadableLabel: UNAVAILABLE,
    unreadableHint: "이 멤버의 이름과 이메일을 복호화하지 못했습니다. 역할과 가입일에는 영향이 없습니다.",
    roleLocked: {
      pending: (role: string): string =>
        `${role} 역할은 초대를 만들 때 정해졌습니다. 바꾸려면 철회하고 다시 초대하세요.`,
      editor: (role: string): string => `${role} 역할 — 프로젝트 소유자만 역할을 바꿀 수 있습니다.`,
    },
    joined: (when: string): string => `가입 ${when}`,
    unnamed: "이름 없음",
    you: "나",
    changeRole: (who: string): string => `${who} 님의 역할 변경`,
    remove: "제거",
    removeLabel: (who: string): string => `${who} 님 제거`,
    removeConfirm: "멤버 제거",
    removed: (who: string): string => `${who} 님을 제거했습니다`,
    confirmRemove: (who: string): string => `${who} 님을 이 프로젝트에서 제거할까요?`,
    confirmRemoveHint: "프로젝트에 접근할 수 없게 됩니다. 작성한 번역과 이력의 이름은 유지됩니다.",
    cancel: "취소",
    changeFailed: "변경을 적용하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도하세요.",
    confirmRole: (who: string, role: string): string => `${who} 님의 역할을 ${role} 역할로 바꿀까요?`,
    confirmRoleHint: "새 역할은 즉시 적용됩니다.",
    confirmSelfDemote: "즉시 멤버와 설정을 관리할 수 없게 되며, 프로젝트 소유자만 그 권한을 되돌려 줄 수 있습니다.",
    confirmRoleAction: "역할 변경",
    changeUnconfirmed: "변경을 확인하지 못했습니다. 새로고침해 멤버 목록을 확인하세요.",

    invite: {
      open: "멤버 초대",
      title: "멤버 초대",
      description: "초대할 이메일과 역할을 입력하세요. 로그인에 사용하는 이메일이어야 하며, GitHub는 기본(primary) 이메일을 사용합니다.",
      columns: { email: "이메일", role: "역할" },
      placeholder: "name@company.com",
      roleHint: {
        EDITOR: "번역하고 게시할 수 있습니다",
        OWNER: "멤버와 설정도 관리합니다",
      },
      roleFor: (who: string): string => `${who} 님의 역할`,
      removeRecipient: (who: string): string => `${who} 제거`,
      emptyRecipient: (n: number): string => `받는 사람 ${n.toLocaleString("ko-KR")}`,
      addAnother: "한 명 더 추가",
      // 단수·복수 갈래가 없으므로 0명(꺼진 버튼)과 나머지 둘로 접는다.
      send: (n: number): string => (n === 0 ? "초대 보내기" : `초대 ${n.toLocaleString("ko-KR")}건 보내기`),
      sending: "초대를 보내는 중…",
      nothingSent: "이번 요청으로는 아무것도 보내지 않았습니다. 표시된 행을 고치거나 제거한 뒤 다시 보내세요.",
      seatsUsed: (n: number, limit: number): string => `정원 ${limit.toLocaleString("ko-KR")}명 중 ${n.toLocaleString("ko-KR")}명`,
      rowError: {
        invalidEmail: "이메일 주소 형식이 아닙니다.",
        invalidRole: "이 주소의 역할을 고르세요.",
        duplicate: (row: number): string => `이미 ${row.toLocaleString("ko-KR")}번째 행에 있습니다. 이 행을 제거하세요.`,
        roleConflict: (row: number, role: string): string => `${row.toLocaleString("ko-KR")}번째 행에도 ${role} 역할로 있습니다. 이 주소에는 역할을 하나만 남기세요.`,
      },
      alreadyMember: "이 이메일은 이미 이 프로젝트의 멤버입니다.",
      limit: {
        title: "초대 한도 초과",
        project: (limit: number, used: number, n: number, time: string): string =>
          `프로젝트당 1시간에 초대를 ${limit.toLocaleString("ko-KR")}건까지 발급할 수 있으며, 최근 1시간 동안 ${used.toLocaleString("ko-KR")}건을 발급했습니다. ${n === 1 ? "이 초대는" : `이 ${n.toLocaleString("ko-KR")}건은`} ${time} 이후에 보낼 수 있습니다.`,
        address: (email: string, time: string): string => `${email} 주소는 1분 이내에 초대되었습니다. ${time} 이후에 다시 보낼 수 있습니다.`,
        user: (limit: number, used: number, n: number, time: string): string =>
          `모든 프로젝트를 합쳐 1시간에 초대를 ${limit.toLocaleString("ko-KR")}건까지 발급할 수 있으며, 최근 1시간 동안 ${used.toLocaleString("ko-KR")}건을 발급했습니다. ${n === 1 ? "이 초대는" : `이 ${n.toLocaleString("ko-KR")}건은`} ${time} 이후에 보낼 수 있습니다.`,
      },
      tooMany: (limit: number): string => `한 번에 최대 ${limit.toLocaleString("ko-KR")}명까지 초대할 수 있습니다.`,
      unconfirmed: {
        title: "초대 메일 발송 여부를 확인하지 못했습니다",
        body: "일부 초대가 보내졌을 수 있습니다. 다시 보내면 이전 링크를 대체합니다.",
      },
      sendFailed: "초대 메일을 보내지 못했습니다. 다시 보내면 이번 시도의 링크를 대체합니다.",
      emailUnavailable: "지금은 이메일을 보낼 수 없습니다. 나중에 다시 시도하세요.",
      failed: "초대를 보내지 못했습니다. 페이지를 새로고침한 뒤 다시 시도하세요.",
      sentToast: (n: number): string => (n === 1 ? "초대를 보냈습니다" : `${n.toLocaleString("ko-KR")}명에게 초대를 보냈습니다`),
    },

    pending: {
      title: "대기 중인 초대",
      count: (n: number): string => `초대 ${n.toLocaleString("ko-KR")}건`,
      expires: (when: string): string => `만료 ${when}`,
      invitedBy: (who: string): string => `초대한 사람: ${who}`,
      unknownInviter: "멤버",
      resend: "다시 보내기",
      resendLabel: (who: string): string => `${who} 주소로 초대 다시 보내기`,
      resentToast: (who: string): string => `${who} 주소로 초대를 다시 보냈습니다`,
      resendFailed: (who: string, time: string): string => `${who} 주소로 초대를 다시 보내지 못했습니다. ${time} 이후에 다시 시도할 수 있습니다.`,
      resendLimited: (who: string, time: string): string => `${who} 주소는 1분 이내에 초대되었습니다. ${time} 이후에 다시 보낼 수 있습니다.`,
      resendProjectLimited: (who: string, limit: number, time: string): string =>
        `${who} 주소로 다시 보내지 못했습니다: 이 프로젝트가 최근 1시간 동안 초대를 ${limit.toLocaleString("ko-KR")}건 발급했습니다. ${time} 이후에 다시 보낼 수 있습니다.`,
      resendUserLimited: (who: string, limit: number, time: string): string =>
        `${who} 주소로 다시 보내지 못했습니다: 최근 1시간 동안 모든 프로젝트를 합쳐 초대를 ${limit.toLocaleString("ko-KR")}건 발급했습니다. ${time} 이후에 다시 보낼 수 있습니다.`,
      resendUnconfirmed: (who: string): string => `${who} 주소로 보낸 메일의 발송 여부를 확인하지 못했습니다. 이미 발송되었을 수 있습니다 — 다시 보내면 그 링크를 대체합니다.`,
      resendUnavailable: (who: string): string => `${who} 주소로 다시 보내지 못했습니다. 지금은 이메일을 보낼 수 없습니다. 나중에 다시 시도하세요.`,
      gone: (who: string): string => `${who} 주소로 보낸 초대는 더 이상 대기 목록에 없습니다.`,
      resendError: (who: string): string => `${who} 주소로 초대를 다시 보내지 못했습니다. 페이지를 새로고침한 뒤 다시 시도하세요.`,
      revoke: "철회",
      revokeLabel: (who: string): string => `${who} 주소의 초대 철회`,
      revoked: (who: string): string => `${who} 주소의 초대를 철회했습니다`,
      revokeFailed: "초대를 철회하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도하세요.",
      confirmRevoke: (who: string): string => `${who} 주소의 초대를 철회할까요?`,
      confirmRevokeHint: "링크는 즉시 작동을 멈춥니다. 같은 주소를 다시 초대할 수 있습니다.",
      confirmRevokeAction: "초대 철회",
      revokeUnconfirmed: "초대가 철회되었는지 확인하지 못했습니다. 새로고침해 확인하세요.",
      empty: {
        title: "대기 중인 초대 없음",
        description: "초대한 사람이 모두 가입했거나 링크가 만료되었습니다.",
      },
    },
  },

  settings: {
    loading: "설정을 불러오는 중…",
    general: {
      title: "일반", thumbnail: "썸네일", name: "이름", address: "주소",
      upload: "업로드", remove: "제거",
      caption: "PNG 또는 JPEG, 최대 3MB.",
      emptyName: "프로젝트 이름을 입력하세요.", longName: "200자 이하로 입력하세요.",
      busy: "썸네일을 바꾸는 중…",
    },
    sources: {
      add: "소스 추가", locked: "추가된 소스",
      confirm: "선택한 소스 추가",
      notImported: "아직 동기화되지 않음", importing: "동기화 중…", imported: "동기화됨", failed: "동기화 실패",
      failedAfter: "동기화 실패", retry: "첫 동기화 실행", rerun: "GitHub에서 워크플로를 다시 실행하세요.",
      unknown: "결과를 확인하지 못했습니다. 다시 시도하기 전에 소스 목록을 확인하세요.",
      nothingAdded: "아무것도 추가되지 않았습니다. 선택한 항목은 그대로 있습니다.",
      description: "리포지토리에서 번역 파일을 고르세요. 기존 소스는 선택된 채로 남습니다.",
      selectHelp: "추가할 새 소스를 하나 이상 고르세요.",
      previewNone: "경로를 지정하면 Malmoi가 찾은 키를 보여 줍니다. 일치하는 파일이 없으면 아무것도 추가되지 않습니다.",
      blocked: {
        detecting: "리포지토리에서 번역 파일을 찾는 중입니다.",
        detectFailed: "파일 목록을 불러오지 못했습니다. 위에서 다시 시도하세요.",
        conflict: "선택한 파일 중 일부가 이미 다른 소스에 속해 있습니다.",
        base: "선택한 소스마다 기준 언어를 고르세요.",
      },
      manualReason: "확인하려면 파일 경로와 기준 언어를 입력하세요.",
      step: (n: number): string => `2단계 중 ${n.toLocaleString("ko-KR")}단계`,
      baseTitle: "기준 언어 고르기",
      baseDescription: "소스마다 작성된 언어를 고르세요.",
      conflictBack: "뒤로 돌아가 선택을 바꾸세요.",
    },
    ci: { description: "머지할 때마다 워크플로가 번역 파일을 Malmoi로 보냅니다.", title: "CI 연동", workflow: "워크플로 파일", sourcesLead: "워크플로 하나가 모든 소스를 다룹니다. 소스 추가·수정:", stale: "일부 소스가 아직 동기화되지 않았습니다. 워크플로에 포함되었는지 확인하세요.",
      noSources: "워크플로를 받으려면 소스를 추가하세요." },
    archivedReason: "설정을 바꾸려면 이 프로젝트를 복원하세요.",
    recovery: "동기화는 계속 실행됩니다. 이 리포지토리를 다시 연결하거나 소스를 추가하려면 계정에서 GitHub 승인을 관리하세요.",
    accountLink: "계정",
    installed: "이 리포지토리에 Malmoi GitHub App이 설치되어 있습니다.",
    openRepo: "GitHub에서 열기",

    repository: {
      disconnected: "연결 끊김", notConnected: "연결 안 됨", unknown: "확인하지 못함", wrongRepository: "다른 리포지토리",
      movedHint: "새 이름을 저장하려면 다시 연결하세요. 그동안에도 동기화는 계속 작동합니다.",
      paused: "다시 연결할 때까지 동기화와 게시가 멈춥니다. 기존 번역은 모두 보존됩니다.",
      title: "리포지토리",
      connect: "연결",
      reconnect: "다시 연결",
      connectFailed: "연결을 시작하지 못했습니다. 잠시 후 다시 시도하세요.",
      health: {
        ok: "연결됨",
        "not-connected": "아직 GitHub App이 연결되지 않았습니다.",
        "app-uninstalled": "앱이 제거 또는 일시 중단되었거나, 이 리포지토리에 대한 앱의 접근 권한이 회수되었습니다.",
        "installation-changed": "앱이 다시 설치되었습니다 — 다시 연결하세요.",
        moved: (fullName: ReactNode): ReactNode => <>이 리포지토리는 {fullName} 리포지토리로 옮겨졌습니다</>,
        "repo-replaced": "이 주소의 리포지토리가 처음 연결했을 때와 다릅니다. GitHub에서 확인한 뒤 리포지토리가 변경된 것이 맞다면 새 프로젝트로 연결하세요.",
        unknown: "지금은 확인할 수 없습니다. 잠시 후 이 페이지를 다시 여세요.",
        install: "앱 설치",
        installHint: "앱을 설치한 뒤 여기로 돌아와 다시 연결하세요.",
      },

      fields: {
        branch: "기준 브랜치",
        branchHelp: "동기화는 이 브랜치를 읽고, PR은 이 브랜치를 대상으로 열립니다.",
        branchDisconnected: "기준 브랜치를 바꾸려면 리포지토리를 다시 연결하세요.",
        save: "저장",
        saved: "저장됨",
        failed: "저장하지 못했습니다. 잠시 후 다시 시도하세요.",
      },

    },

    status: {
      unconfirmed: "동기화가 끝났는지 확인하지 못했습니다.",
    },

    token: {
      title: "푸시 토큰",
      description: (secret: ReactNode): ReactNode => (
        <>
          교체하면 지금 토큰이 즉시 무효가 됩니다 — 리포지토리의 {secret} 시크릿을 업데이트할 때까지 CI가
          실패합니다.
        </>
      ),
      rotate: "토큰 교체",
      disconnected: "토큰을 교체하려면 리포지토리를 다시 연결하세요.",
      warning: "이 페이지를 떠나면 다시 볼 수 없습니다. 잃어버리면 다시 교체하세요.",
      failed: "토큰을 교체하지 못했습니다. 잠시 후 다시 시도하세요.",
      unconfirmed: "교체를 확인하지 못했습니다. 지금 토큰은 이미 무효일 수 있습니다 — 새 토큰을 받으려면 다시 교체하세요.",
      confirmTitle: "푸시 토큰을 교체할까요?",
      confirmBody: "방금 복사한 토큰도 교체 즉시 사용할 수 없게 됩니다. 리포지토리의 PUSH_TOKEN 시크릿에 새 토큰을 넣을 때까지 CI가 실패합니다.",
      confirmAction: "교체하고 새 토큰 보기",
    },

    workflow: {
      saveAs: "이 파일을 리포지토리에 저장하세요.",
      hookHint: (hook: ReactNode, wrapper: ReactNode, doc: ReactNode): ReactNode => (
        <>
          훅({hook})으로 번역을 읽는 리포지토리는 {wrapper} 입력도 필요합니다 — {doc} 문서를 보세요.
        </>
      ),
      // 대상 가이드 페이지의 h1과 같은 글자여야 한다 — ko 가이드 원고가 이 제목을 쓴다.
      hookDoc: "워크플로 추가",
    },

    account: {
      connect: "GitHub App 승인",
      reconnect: "GitHub App 다시 승인",
      unavailable: "계정을 불러오지 못했습니다. 잠시 후 이 페이지를 다시 여세요.",
      disconnect: "연결 해제",
      disconnectLabel: "GitHub App 연결 해제",
      disconnectConfirm: "앱 연결 해제",
      disconnectFailed: "연결을 해제하지 못했습니다. 잠시 후 다시 시도하세요.",
    },
  },

  invite: {
    title: "초대받았습니다",
    unavailableTitle: "사용할 수 없는 초대",
    signInHint: (email: string): string => `수락하려면 ${email} 주소의 계정으로 로그인하세요.`,
    accept: "초대 수락",
    otherAccount: "다른 계정으로 로그인",
    openProject: "프로젝트 열기",
    openProjects: "내 프로젝트로 이동",
    signIn: "로그인",
    sentTo: (email: string): string => `이 초대는 ${email} 주소로 보냈습니다.`,
  },

  link: {
    providers: { github: "GitHub", google: "Google" },
    title: "이미 가입된 이메일입니다",
    description: (pending: string, have: string): string =>
      `${pending} 계정으로 로그인을 시도했습니다. 이 이메일은 ${have} 계정으로 이미 가입되어 있습니다.`,
    confirm: (have: string): string => `${have} 계정으로 확인`,
    joined: (month: string): string => `가입 ${month}`,
    footnote: "이 로그인 수단을 그 계정에 추가합니다. 프로젝트와 번역은 그대로 있습니다.",
    methods: {
      title: "로그인 수단",
      count: (connected: number, total: number): string => `${total.toLocaleString("ko-KR")}개 중 ${connected.toLocaleString("ko-KR")}개`,
      connect: "연결",
      connectLabel: (provider: string): string => `${provider} 계정을 로그인 수단으로 연결`,
      connected: "연결됨",
      notConnected: "연결 안 됨",
      disconnect: "연결 해제",
      disconnectLabel: (provider: string): string => `${provider} 로그인 수단 연결 해제`,
      lastMethod: "유일한 로그인 수단입니다.",
      confirmDisconnect: (provider: string): string => `${provider} 연결을 해제할까요?`,
      disconnectConfirm: "로그인 수단 연결 해제",
      confirmHint: "연결을 해제한 로그인 수단은 같은 이메일로 다시 로그인해 연결할 수 있습니다.",
      unlinkUnconfirmed: "변경을 확인하지 못했습니다. 새로고침해 로그인 수단을 확인하세요.",
    },
  },

  errors: {
    upload: {
      "too-large": "사진이 3MB를 넘습니다. 더 작은 사진을 고르세요.",
      "too-many-pixels": "사진의 해상도가 너무 높습니다. 해상도를 낮춘 사진을 고르세요.",
      "unsupported-type": "올바른 PNG 또는 JPEG 파일이 아닙니다. 다른 사진을 고르세요.",
      "not-a-file": "받은 사진이 없습니다. 파일을 고른 뒤 다시 시도하세요.",
      empty: "빈 파일입니다. 다른 파일을 고르세요.",
      unavailable: "사진을 저장하지 못했습니다. 잠시 후 다시 시도하세요.",
      fallback: "이 사진을 쓸 수 없습니다. 3MB 이하의 PNG 또는 JPEG를 고르세요.",
    },
    connectMethod: {
      connected: "로그인 수단을 추가했습니다. 다음 로그인부터 쓸 수 있습니다.",
      "email-mismatch": "이메일이 이 계정과 일치하지 않습니다. 같은 인증된 이메일을 쓰는 계정으로 시도하세요.",
      "already-connected": "이미 추가된 로그인 수단입니다. 이 수단으로 로그인할 수 있습니다.",
      "taken-by-other": "이 로그인 수단은 다른 Malmoi 계정에 속해 있습니다. 다른 계정으로 시도하세요.",
      expired: "이 요청은 만료되었거나 새 요청으로 대체되었습니다. 로그인 수단 목록에서 다시 시작하세요.",
      cancelled: "로그인 수단 추가가 취소되었습니다. 준비되면 다시 시작하세요.",
      unverified: "인증된 이메일이 전달되지 않았습니다. 다시 시도하기 전에 해당 서비스에서 이메일을 인증하세요.",
      "wrong-user": "요청 중에 세션이 바뀌었습니다. 로그인 수단 목록에서 다시 시작하세요.",
      failed: "로그인 수단을 추가하지 못했습니다. 잠시 후 다시 시도하세요.",
    },
    access: {
      unauthorized: "로그인이 만료되었습니다. 작업을 저장하려면 다시 로그인하세요.",
      forbidden: "이 작업을 할 권한이 없습니다. 프로젝트 소유자에게 요청하세요.",
      "not-found": "이 프로젝트를 열 수 없습니다. 초대 링크를 확인하세요.",
      "last-owner": "프로젝트에는 소유자가 1명 이상 있어야 합니다. 먼저 다른 사람을 소유자로 지정하세요.",
      "not-member": "그 사람은 이 프로젝트의 멤버가 아닙니다.",
      unavailable: "문제가 생겼습니다. 잠시 후 다시 시도하세요.",
      archived: "이 프로젝트는 보관되었습니다. 프로젝트 소유자가 설정에서 복원할 수 있습니다.",
      "owner-limit-reached": (limit: number): string =>
        `활성 프로젝트는 1인당 최대 ${limit.toLocaleString("ko-KR")}개까지 소유할 수 있습니다. 이 프로젝트의 소유자 중 이미 ${limit.toLocaleString("ko-KR")}개 이상을 소유한 사람이 있어, 해당 소유자가 먼저 기존 프로젝트를 보관해야 합니다.`,
    },

    invite: {
      unauthorized: "로그아웃된 상태입니다. 로그인하면 이 링크로 돌아옵니다.",
      "not-found": "존재하지 않는 초대입니다. 링크가 잘못되었거나 초대가 철회되었습니다.",
      expired: "초대가 만료되었습니다. 초대한 사람에게 새 링크를 요청하세요.",
      "already-accepted": "이미 사용된 링크입니다. 초대는 한 번만 쓸 수 있습니다.",
      "email-mismatch": "초대받은 계정으로 로그인하세요. 지금 계정은 초대받은 계정이 아닙니다.",
      "already-member": "이미 이 프로젝트의 멤버입니다.",
      archived: "이 프로젝트는 보관되었습니다. 초대한 사람에게 복원을 요청한 뒤 이 링크를 다시 여세요.",
      "limit-reached": (limit: number): string =>
        `이미 활성 프로젝트를 ${limit.toLocaleString("ko-KR")}개 이상 소유하고 있습니다. 소유한 프로젝트가 ${limit.toLocaleString("ko-KR")}개보다 적어질 때까지 보관한 뒤 이 링크를 다시 여세요.`,
      unavailable: "문제가 생겼습니다. 잠시 후 다시 시도하세요.",
      fallback: "초대를 수락하지 못했습니다. 초대한 사람에게 새 링크를 요청하세요.",
    },

    link: {
      "wrong-account": "다른 계정입니다. 처음 가입할 때 사용한 계정을 고른 뒤 다시 시도하세요.",
      "already-linked": "이 로그인 수단은 이미 이 계정에 있습니다. 그 수단으로 로그인해 보세요.",
      invalid: "본인 확인을 완료하지 못했습니다. 로그인 화면에서 다시 시작하세요.",
      cancelled: "확인이 취소되었습니다. 바뀐 것은 없습니다 — 필요하면 다시 시도하세요.",
      unavailable: "문제가 생겼습니다. 잠시 후 다시 시도하세요.",
      "last-method": "유일한 로그인 수단은 연결을 해제할 수 없습니다.",
      fallback: "본인 확인을 완료하지 못했습니다. 다시 시도하세요.",
    },

    signIn: {
      OAuthAccountNotLinked: "이 이메일은 이미 다른 로그인 수단으로 등록되어 있습니다. 가입할 때 쓴 수단을 쓰세요.",
      AccessDenied: "이 계정으로는 로그인할 수 없습니다. 이메일이 인증되지 않았을 수 있습니다.",
      Unavailable: "문제가 생겼습니다. 잠시 후 다시 열어 보세요.",
      LinkExpired: "본인 확인 요청이 더 이상 유효하지 않습니다. 계속하려면 다시 로그인하세요.",
      fallback: "로그인하지 못했습니다. 잠시 후 다시 시도하세요.",
    },

    connect: {
      "state-mismatch": "연결 요청을 검증하지 못했습니다. 다시 시작하세요.",
      "state-expired": "연결 요청이 만료되었습니다. 다시 시작하세요.",
      "wrong-user": "다른 계정으로 시작한 요청입니다. 연결을 다시 시작하세요.",
      denied: "GitHub에서 연결이 취소되었습니다. 계속하려면 다시 시작하세요.",
      "exchange-failed": "GitHub 연결을 완료하지 못했습니다. 다시 시작하세요.",
      "taken-by-other": "이 GitHub 계정은 이미 다른 사용자에게 연결되어 있습니다. 그 사용자가 연결을 해제하면 쓸 수 있습니다.",
      // 가리키는 버튼 이름은 `settings.account.connect`·`reconnect`와 같은 글자여야 한다.
      "not-connected": "먼저 Malmoi GitHub App을 승인하세요 — 아래에서 ‘GitHub App 승인’을 선택하세요.",
      reauthorize: "GitHub App 승인이 만료되었습니다. ‘GitHub App 다시 승인’을 선택하세요.",
      "repo-not-installed": "이 리포지토리에 앱이 설치되어 있지 않습니다. 설치한 뒤 다시 연결하세요.",
      "installation-forbidden": "이 계정으로는 그 설치에 접근할 수 없습니다. 리포지토리 소유자에게 접근 권한을 요청하세요.",
      "repo-forbidden": "이 계정으로는 그 리포지토리에 접근할 수 없습니다. 리포지토리 소유자에게 접근 권한을 요청하세요.",
      "repo-read-only": "이 계정은 그 리포지토리를 읽기만 할 수 있습니다. 연결하려면 쓰기 권한이 필요합니다 — 리포지토리 소유자에게 요청하세요.",
      unavailable: "문제가 생겼습니다. 잠시 후 다시 시도하세요.",
      fallback: "GitHub 연결에 실패했습니다. 다시 시도하세요.",
    },

    onboarding: {
      "no-installations": "GitHub 계정이 연결되었습니다. 리포지토리를 고르려면 개인 계정이나 조직에 Malmoi GitHub App을 설치하세요.",
      "no-repos": "GitHub 계정이 연결되었지만 쓸 수 있는 리포지토리가 없습니다. GitHub 설치 설정에서 Malmoi GitHub App이 접근할 리포지토리를 고르세요.",
      "no-candidates": "지원하는 번역 파일을 찾지 못했습니다. 파일 형식과 경로를 확인한 뒤 다시 시도하세요.",
      "tree-truncated": "이 리포지토리는 파일이 너무 많아 검색할 수 없고, 경로를 직접 지정해도 같은 한도에 걸립니다. Malmoi는 아직 이렇게 큰 리포지토리를 연결할 수 없습니다.",
      "base-branch-missing": "기본 브랜치를 읽을 수 없습니다. 리포지토리에 커밋이 있는지 확인하세요.",
      // 라벨이라 문장이 아니다 — 후보 줄의 개수 자리에 그대로 들어간다.
      "key-count-failed": "키 개수를 알 수 없음",
      "manual-no-match": "그 경로에 해당 형식의 파일이 없습니다. 경로와 형식을 확인하세요.",
      "sample-expired": "이 미리보기는 만료되었습니다. 보려면 파일을 다시 찾으세요.",
      "slug-taken": "이미 쓰이는 주소입니다. 다른 주소를 고르세요.",
      "limit-reached": (limit: number): string => `프로젝트는 최대 ${limit.toLocaleString("ko-KR")}개까지 만들 수 있습니다.`,
      "invalid-slug": (max: number): string =>
        `주소에는 영문 소문자, 숫자, '-', '.', '_'를 최대 ${max.toLocaleString("ko-KR")}자까지 쓸 수 있습니다. 'new'는 예약되어 있습니다.`,
      "invalid-branch": "올바른 브랜치 이름이 아닙니다. 다른 브랜치를 고르세요.",
      "sync-branch": "Malmoi가 그 브랜치에서 번역을 게시하므로 기준 브랜치로 쓸 수 없습니다. 다른 브랜치를 고르세요.",
      "not-awaiting": "첫 동기화는 이미 끝났습니다. 여기서 다시 실행하면 편집한 번역을 덮어쓰게 되므로 막혀 있습니다.",
      "resource-limit": "번역 파일이 너무 크거나 너무 깊게 중첩되어 동기화할 수 없습니다. 크기를 줄인 뒤 다시 시도하세요.",
      "ingest-failed": "첫 동기화에 실패했습니다. 소스에서 다시 시도할 수 있습니다.",
      "not-ready": "이 프로젝트는 아직 설정이 끝나지 않았습니다. 프로젝트 소유자가 설정을 마쳐야 합니다.",
      unauthorized: "로그인이 만료되었습니다. 다시 로그인한 뒤 처음부터 시작하세요.",
      fallback: "프로젝트를 만들지 못했습니다. 처음부터 다시 시도하세요.",
    },

    repositorySettings: {
      "invalid-branch": "올바른 브랜치 이름이 아닙니다. 공백과 ~^:?*[ 문자는 쓸 수 없습니다.",
      "sync-branch": "Malmoi가 그 브랜치에서 번역을 게시하므로 기준 브랜치로 쓸 수 없습니다. 다른 브랜치를 고르세요.",
      "unknown-locale": "이 리포지토리에는 그 언어의 번역 파일이 없습니다.",
      "orphaned-locale": "해당 언어의 파일이 리포지토리에서 삭제되었습니다. 먼저 파일을 복원하세요.",
    },
  },

  adapterErrors: {
    "parse-failed": "파일을 해석하지 못했습니다.",
    "parse-crashed": "파일을 처리하는 중 파서 오류가 발생했습니다.",
    "root-not-object": "파일의 최상위가 키-값 맵이 아닙니다.",
    "no-default-export": "이 파일에 default export 객체가 없습니다.",
    "invalid-chrome-key": "키에 chrome.i18n이 허용하지 않는 문자가 있습니다(허용: A-Z a-z 0-9 _ @).",
    "missing-message-field": "항목에 'message' 필드가 없습니다.",
    "value-not-message-object": "값이 { message } 객체가 아닙니다.",
    "value-not-string": "값이 텍스트가 아닙니다.",
    "value-not-string-or-container": "값이 텍스트, 객체, 배열 중 어느 것도 아닙니다.",
    "value-not-string-literal": "값이 일반 텍스트 리터럴이 아닙니다.",
    "shorthand-property": "단축 속성이라 값을 읽을 수 없습니다 — 다른 모듈에서 import한 참조로 보입니다.",
    "not-property-assignment": "속성 할당이 아닙니다.",
    "duplicate-key": "키가 중복되어 두 값 중 하나가 누락됩니다.",
    "duplicate-property": "키가 두 번 정의되어 있습니다. Malmoi는 편집하는 쪽을 쓰고 다른 쪽은 그대로 둡니다.",
    "key-shadowed": "다른 키나 속성이 이 키의 자리를 가려 값을 안전하게 쓸 수 없습니다.",
    "write-parse-failed": "파일을 해석하지 못해 변경하지 않았습니다.",
    "write-no-default-export": "이 파일에 default export 객체가 없어 변경하지 않았습니다.",
    "write-locale-object-missing": "이 언어가 파일에 없어 번역을 쓰지 않았습니다.",
    "write-empty-unsupported": "이 형식에서는 빈 값을 보낼 수 없습니다. 값을 입력한 뒤 내보내세요.",
    "write-slot-not-string-literal": "값이 일반 텍스트 자리에 있지 않아 쓰지 않았습니다.",
    "write-slot-not-scalar": "값이 일반 텍스트 자리에 있지 않아(별칭, 맵 또는 목록) 쓰지 않았습니다.",
    "write-slot-missing": "이 키를 쓸 위치가 없어 건너뛰었습니다. 파일 구조를 수정해야 합니다.",
    "original-file-missing": "리포지토리에 기존 파일이 없어 이 언어는 전송에서 제외했습니다.",
    "download-failed": "파일을 내려받지 못했습니다.",
    fallback: "이 파일을 읽지 못했습니다.",
  },
} satisfies Messages;
