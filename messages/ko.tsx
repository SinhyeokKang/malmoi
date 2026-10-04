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
    projectsUnavailable: "지금은 프로젝트를 검색할 수 없습니다. 검색을 다시 열어 다시 시도하세요.",
    sessionEnded: "세션이 끝났습니다. 프로젝트를 검색하려면 다시 로그인하세요.",
    keysUnavailable: "지금은 키를 검색할 수 없습니다. 검색어를 고쳐 다시 시도하세요.",
    docsUnavailable: "지금은 문서를 검색할 수 없습니다. 검색을 다시 열어 다시 시도하세요.",
    noResults: (q: string): string => `“${q}” 검색 결과 없음`,
    noResultsDescription: "다른 검색어를 입력해 보세요.",
    goTo: "이동",
    results: (count: number): string => `결과 ${count.toLocaleString("ko-KR")}건`,
  },
  repositorySync: {
    action: "동기화",
    paused: "지금은 동기화할 수 없습니다.",
    waitPublish: "게시가 끝날 때까지 기다리세요.",
    running: "이미 동기화가 진행 중입니다.",
    resultTitle: {
      complete: "동기화 완료",
      issues: "동기화가 문제와 함께 끝남",
      nothingReplaced: "바뀐 것 없음",
      didntRun: "동기화가 실행되지 않음",
      failed: "동기화 실패",
      unknown: "동기화 결과를 알 수 없음",
    },
    resultHeadline: {
      "unavailable": "잠시 후 다시 시도하세요 — 기록된 내용은 로그에서 볼 수 있습니다",
      "ingest-failed": "잠시 후 다시 시도하세요 — 기록된 내용은 로그에서 볼 수 있습니다",
      "unauthorized": "세션이 끝났습니다 — 로그인한 뒤 다시 동기화하세요",
      "unconfirmed": "응답이 돌아오지 않았습니다 — 다시 동기화하기 전에 로그를 확인하세요",
    },
    confirm: "리포지토리에서 동기화",
    confirmDiscard: "변경 사항을 버리고 동기화",
    resultInLogs: "결과는 로그에 남습니다.",
    title: (name: string): string => `${name} 프로젝트를 리포지토리에서 동기화하시겠습니까?`,
    body: (branch: ReactNode): ReactNode => (
      <>Malmoi가 {branch} 브랜치의 번역 파일을 읽어 앱의 내용을 그 값으로 바꿉니다.</>
    ),
    unsentCount: (n: number): string => `보내지 않은 편집 ${n.toLocaleString("ko-KR")}건`,
    unsent: (n: number, edits: ReactNode): ReactNode => (
      <>동기화하면 {edits} 모두 버리고 리포지토리 값으로 바꿉니다.</>
    ),
    openPr: (n: number, branch: string): string =>
      `풀 리퀘스트 #${n}의 편집은 아직 ${branch} 브랜치에 없습니다 — 이 편집도 바뀝니다.`,
    prChecking: "풀 리퀘스트에서 아직 기다리는 것이 있는지 확인하는 중…",
    prUnknown: "풀 리퀘스트에서 아직 기다리는 것이 있는지 확인하지 못했습니다.",
    sendFirst: "먼저 게시",
    sendHint: (n: number, link: ReactNode): ReactNode => <>편집을 지키려면 {link} — 번역 화면이 열립니다.</>,
    nothingUnsent: "보낼 것이 없습니다 — 모든 편집을 이미 보냈습니다.",
    seeOpen: "열린 항목 보기",
    completed: (n: number, branch: string): string => `${branch} 브랜치에서 키 ${n.toLocaleString("ko-KR")}개를 동기화함`,
    syncedKeys: (n: number): string => `키 ${n.toLocaleString("ko-KR")}개를 동기화함`,
    unreadable: (n: number): string => `소스 ${n}개를 읽지 못함`,
    notReplaced: (n: number): string => `소스 ${n}개가 바뀌지 않음`,
    withIssue: (base: string, issue: string): string => `${base}, 그러나 ${issue}`,
    partial: (n: number): string => `항목 ${n.toLocaleString("ko-KR")}개가 동기화되지 않았습니다. 아래 상세 내용을 확인하세요.`,
    kept: (n: number): string => `보내지 않은 편집 ${n.toLocaleString("ko-KR")}건을 유지했습니다. 이 편집을 보낼 때까지 리포지토리 업데이트를 보류합니다.`,
    cause: (surface: ReactNode, reason: string): ReactNode => <>{surface} — {reason}</>,
    failedTitle: "마지막 동기화를 끝내지 못했습니다",
    supersededTitle: "대체됨",
    openSettings: "설정 열기",
    openAccount: "계정 열기",
    signIn: "로그인",
    reconnect: "다시 연결",
    errors: {
      "invalid-format": "이 소스에 유효한 파일 형식이 없습니다.",
      "superseded": "동기화하는 동안 새 리포지토리 데이터가 들어왔습니다. 이 소스는 바뀌지 않았습니다. 필요하면 다시 시도하세요.",
      "lease-lost": "이 동기화는 이 소스를 바꾸기 전에 멈췄습니다. 다시 시도하기 전에 새로고침해 현재 상태를 확인하세요.",
      "not-ready": "이 프로젝트는 아직 첫 동기화를 마치지 않았습니다",
      "not-connected": "GitHub 계정이 Malmoi에 연결되어 있지 않습니다 — 동기화하려면 계정에서 연결하세요",
      unpinned: "이 리포지토리는 연결이 끊어졌습니다",
      "already-running": "이미 동기화가 진행 중입니다",
      "reconfirm": "검토한 내용이 아직 최신인지 확인하지 못했습니다 — 아무것도 버리지 않았습니다. 동기화를 다시 열어 검토하고 확정하세요",
      "no-surfaces": "동기화할 것이 없습니다 — 이 프로젝트에 활성 소스가 없습니다",
      "invalid input": "프로젝트를 식별하지 못했습니다. 페이지를 새로고침하고 다시 시도하세요.",
      "ingest-failed": "동기화가 처리되지 않았습니다",
      "unauthorized": "세션이 끝났습니다 — 아무것도 동기화하지 않았습니다. 로그인한 뒤 다시 동기화하세요",
      "unavailable": "동기화가 처리되지 않았습니다",
      "unconfirmed": "동기화가 끝났는지 확인하지 못했습니다",
      "repo-replaced": "이 연결은 다른 리포지토리를 가리킵니다",
    },
    baseBranchMissing: {
      owner: (branch: string): string => `기준 브랜치(${branch})가 더 이상 리포지토리에 없습니다 — 설정에서 다른 기준 브랜치를 고르세요`,
      editor: (branch: string): string => `기준 브랜치(${branch})가 더 이상 리포지토리에 없습니다 — 프로젝트 소유자에게 다른 기준 브랜치를 골라 달라고 요청하세요`,
    },
  },
  notFound: {
    title: "페이지를 찾을 수 없음",
    description: "이 페이지는 옮겨졌거나 더 이상 없을 수 있습니다.",
    action: "내 프로젝트로 이동",
  },
  surfaces: {
    sourceCounts: (keys: number, locales: number): string => `키 ${keys.toLocaleString("ko-KR")}개 · 언어 ${locales.toLocaleString("ko-KR")}개`,
    label: "소스", baseLocale: "기준 언어", confirm: "파일 확인", cancel: "취소", conflict: "이 파일은 이미 다른 소스에 속해 있습니다:",
    failed: "이 소스를 추가하지 못했습니다. 기존 번역은 그대로입니다. 다시 시도하세요.",
    missingTitle: "소스를 사용할 수 없음",
    missingDescription: "이 페이지가 옮겨졌거나 소스가 더 이상 활성 상태가 아닐 수 있습니다. 계속하려면 내 프로젝트를 여세요.",
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
      home: "홈",
      sources: "소스",
      translations: "번역",
      members: "멤버",
      logs: "로그",
      projectSettings: "설정",
      signOut: "로그아웃",
      newProject: "새 프로젝트",
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
    consent: { before: "외부 계정으로 계속하면 Malmoi ", link: "개인정보 처리방침", after: "에 동의하는 것으로 간주합니다." },
    footer: { copyright: "© 2026 Malmoi", github: "GitHub", privacy: "개인정보 처리방침" },
  },

  uiLocale: {
    label: "언어",
    failed: "언어를 바꾸지 못했습니다. 다시 시도하세요.",
  },

  preferences: {
    loading: "환경설정을 불러오는 중…",
    description: "Malmoi 화면에 표시할 언어입니다.",
    help: "프로젝트의 번역 언어는 바뀌지 않습니다.",
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
      // 첫 문장이 정의다 — 홈 description·og:description으로도 나가므로 분량을 늘리지 않는다.
      body: "Malmoi는 GitHub 리포지토리를 위한 로컬라이제이션 도구입니다. 번역 파일을 찾아 팀원이 브라우저에서 편집하게 하고, 모든 변경을 풀 리퀘스트 하나로 되돌려 보냅니다.",
      latest: (version: string) => (version === "" ? "최신 변경 기록" : `v${version}의 새로운 점`),
    },
    stage: {
      label: "Malmoi 작동 방식",
      captions: [
        "Malmoi가 리포지토리에 이미 있는 번역 파일을 읽습니다.",
        "키에 빠진 언어를 채웁니다.",
        "편집을 저장할 때마다 게시 버튼의 숫자가 늘어납니다.",
        "보내기 전에 모든 변경을 diff로 검토합니다.",
        "모든 변경이 풀 리퀘스트 하나로 돌아갑니다.",
      ] as const,
    },
    closing: {
      body: "JSON, YAML, JS/TS, Chrome 확장 프로그램 번역 파일이 있는 GitHub 리포지토리를 연결하고, 팀을 초대하고, 첫 풀 리퀘스트를 보내세요.",
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
        title: "없는 페이지입니다",
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
      <>Malmoi의 릴리스별 변경 사항을 최신순으로 보여 줍니다. 날짜는 UTC 기준입니다. 같은 노트가 {releases}에도 게시됩니다.</>
    ),
    failed: (releases: ReactNode): ReactNode => <>지금은 GitHub에서 변경 기록을 불러오지 못했습니다. {releases}에서 읽으세요.</>,
    empty: (releases: ReactNode): ReactNode => <>아직 게시된 릴리스가 없습니다. 새 버전은 이곳과 {releases}에 나타납니다.</>,
    truncated: (releases: ReactNode): ReactNode => <>이전 릴리스는 {releases}에 있습니다.</>,
  },

  home: {
    loading: "프로젝트를 불러오는 중…",
    cards: {
      unit: { keys: "키", cells: "칸" },
      synced: (when: string | null): string => (when === null ? "아직 동기화하지 않음" : `${when} 동기화됨`),
      acrossSurfaces: (n: number): string => (n === 1 ? "이 리포지토리 전체" : `소스 ${n}개 전체`),
      reviewByLocale: (parts: string): string => parts,
      localeCount: (code: string, n: number): string => `${code} ${n.toLocaleString("ko-KR")}개`,
      allFilled: (n: number): string => `키 ${n.toLocaleString("ko-KR")}개 모두 채움`,
      nothingPending: "보낼 것 없음",
      nothingToReview: "검토할 것 없음",
      lastGoodSync: (when: string | null): string => (when === null ? "아직 동기화하지 않음" : `${when} 동기화됨`),
      asOf: (when: string | null): string => (when === null ? "아직 동기화하지 않음" : `${when} 기준`),
      asOfLastSync: "마지막 동기화 기준",
      cannotSend: "지금은 보낼 수 없음",
      held: {
        "pending-edits": "리포지토리 업데이트 보류",
        "open-pr": "풀 리퀘스트가 머지되거나 닫힐 때까지 보류",
        "pr-check-failed": "보류 — 열린 풀 리퀘스트를 확인하지 못했습니다",
      },
      frozen: "보관 시점에 고정됨",
      neverSent: "보낸 적 없음",
    },

    attention: {
      title: "확인이 필요한 항목",
      count: (n: number): string => `${n.toLocaleString("ko-KR")}개 항목`,
      more: (n: number): string => `+${n}개 더 보기`,
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
        body: (n: number): string => `${n.toLocaleString("ko-KR")}개 칸이 검토를 기다립니다`,
        // 이름 뒤 조사를 피하려고 "마지막 편집: 이름" 꼴로 쓴다.
        tail: (who: string): string => ` — 이 언어의 마지막 편집: ${who} 님.`,
      },
      neverFilled: {
        title: (surface: string, locale: string): string => `${surface} · ${locale}`,
        body: (locale: string): string => `이곳에 ${locale} 번역이 없습니다`,
        tail: (n: number): string => ` — 번역할 키 ${n.toLocaleString("ko-KR")}개.`,
      },
      empty: {
        title: "확인할 항목 없음",
        description: "동기화가 실패하거나, 칸이 검토를 기다리거나, 언어 하나가 뒤처지면 여기에 항목이 나타납니다.",
      },
      archived: {
        title: "처리할 항목 없음",
        description:
          "프로젝트를 복원하면 확인 항목이 돌아옵니다. 위의 숫자는 보관한 시점에 고정되어 있습니다.",
      },
    },

    logs: {
      title: "최근 로그",
      all: "모든 로그",
      empty: {
        beforeFirstSync: "아직 없습니다. 리포지토리의 첫 동기화가 여기에 나타납니다.",
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
      pullRequest: "풀 리퀘스트",
      prState: "PR 상태",
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
        title: "마지막 동기화를 끝내지 못했습니다",
        body: (surface: string, branch: string, reason: string): string =>
          `Malmoi가 ${branch} 브랜치의 ${surface} 소스를 읽지 못했습니다. ${reason}`,
        safe: (when: string | null): string =>
          when === null
            ? "잃은 것은 없습니다 — 지금 보이는 칸은 이번 동기화 이전의 값입니다."
            : `잃은 것은 없습니다 — 지금 보이는 칸은 마지막으로 성공한 동기화(${when})의 값입니다.`,
        action: "다시 시도",
        editor: "프로젝트 소유자에게 동기화를 다시 실행해 달라고 요청하세요.",
      },
      partial: {
        title: "일부 동기화됨",
        body: (surface: string, branch: string, reason: string): string => `${branch} 브랜치의 ${surface} 소스가 일부만 동기화되었습니다. ${reason}`,
      },
      notConnected: {
        title: "Malmoi가 이 리포지토리에 연결되어 있지 않습니다",
        body: "동기화하고 게시하려면 이 리포지토리에 GitHub App을 연결하세요. 이미 번역한 내용은 안전합니다.",
        action: "연결",
        editor: "프로젝트 소유자에게 연결을 요청하세요.",
      },
      disconnected: {
        title: "이 리포지토리의 연결이 끊어졌습니다",
        body: "Malmoi가 이 리포지토리와의 연결을 잃었습니다. 다시 연결할 때까지 동기화와 게시가 멈춥니다 — 이미 번역한 내용은 안전합니다.",
        action: "다시 연결",
        editor: "프로젝트 소유자에게 다시 연결을 요청하세요.",
      },
      wrongRepository: {
        title: "이 연결은 다른 리포지토리를 가리킵니다",
        body: "이 주소에는 지금 이 프로젝트가 연결된 것과 다른 리포지토리가 있습니다. GitHub에서 확인하고, 리포지토리가 정말 바뀌었다면 그 리포지토리로 새 프로젝트를 만드세요.",
      },
      archived: {
        title: "보관된 프로젝트입니다",
        body: "편집과 게시가 꺼져 있고, 리포지토리에서 오는 동기화를 거부합니다. 다시 작업하려면 복원하세요.",
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
      anyone: "모든 사람",
      anySource: "모든 소스",
      anyResult: "모든 결과",
      clear: "필터 지우기",
      people: "사람",
      automation: "자동화",
      projectWide: "프로젝트 전체",
      clearSources: "소스 지우기",
      resultScope: "동기화와 게시에만 적용됩니다. 다른 이벤트에는 결과가 없습니다.",
      groupImports: "동기화",
      groupPublish: "게시",
      groupBoth: "둘 다",
      axis: {
        kind: "종류",
        date: "날짜",
        actor: "실행자",
        source: "소스",
        result: "결과",
      },
    },
    range: {
      today: "오늘",
      yesterday: "어제",
      last7: "최근 7일",
      last30: "최근 30일",
      custom: "기간 지정 (UTC)",
      customOpen: "기간 지정 (UTC)…",
      from: "시작 (UTC)",
      to: "끝 (UTC)",
      apply: "기간 적용",
      description: "보여 줄 첫날과 마지막 날을 고르세요. 한쪽을 비우면 끝이 열린 기간이 됩니다.",
    },
    search: { label: "로그 검색", placeholder: "로그 검색…" },
    refresh: "새로고침",
    status: {
      succeeded: "보냄",
      skipped: "보낼 것 없음",
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
      `보내지 않은 편집 ${count.toLocaleString("ko-KR")}건 때문에 동기화를 보류했습니다. 아무것도 동기화하지 않았습니다.`,
    deferReasons: {
      "open-pr": "Malmoi 풀 리퀘스트가 아직 열려 있습니다. 아무것도 동기화하지 않았습니다 — 풀 리퀘스트가 머지되거나 닫히면 동기화가 다시 시작됩니다.",
      "pr-check-failed": "GitHub에서 열린 Malmoi 풀 리퀘스트를 확인하지 못해 아무것도 동기화하지 않았습니다. 다음 실행에서 다시 확인합니다.",
      "too-large": "리포지토리 변경이 서버 쪽 동기화로 처리하기에 너무 큽니다. 아무것도 동기화하지 않았습니다. 파일 크기를 줄이거나 리포지토리 워크플로로 전달하세요.",
    },
    empty: {
      title: "아직 활동이 없습니다",
      description: "동기화, 번역 편집, 게시가 일어나면 여기에 표시됩니다.",
    },
    noMatch: {
      title: "이 필터와 일치하는 이벤트 없음",
      description: "이 프로젝트에는 활동이 있지만 지금 범위에는 하나도 없습니다. 날짜 범위를 넓히거나 필터를 지우세요.",
    },
    coverage: (date: string): string =>
      `전체 활동 이력은 ${date}부터 볼 수 있습니다. 그 이전 기록에는 게시 실행만 있습니다.`,
    queryError: {
      title: "활동을 불러오지 못했습니다",
      description: "잃은 것은 없습니다 — 이력을 읽는 데 문제가 생긴 것이고, 활동이 없는 프로젝트가 아닙니다.",
      retry: "다시 시도",
    },
    loading: { list: "활동 불러오는 중…" },
    older: "이전",
    page: {
      perPage: "페이지당 이벤트 20개, 최신순.",
      noOlder: "이 필터와 일치하는 이전 이벤트가 없습니다.",
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
      noPullRequest: "풀 리퀘스트 없음",
      declarationOnly: "선언만 됨",
      nothingImported: "동기화한 것 없음",
      archivedEffect: "편집이 멈추고 야간 게시가 끝남",
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
          <>{who} — {language}의 {key} 값을 마지막으로 보낸 것이 확인된 버전으로 되돌렸습니다</>
        ),
      },
      publish: {
        running: (who: ReactNode): ReactNode => <>{who} — 번역을 GitHub에 보내는 중입니다</>,
        sent: (who: ReactNode): ReactNode => <>{who} — 번역을 GitHub에 보냈습니다</>,
        nothing: (who: ReactNode): ReactNode => <>{who} 게시 — 보낼 것이 없었습니다</>,
        notSent: (who: ReactNode): ReactNode => <>{who} 게시 — 편집을 제외했습니다</>,
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
        superseded: (who: ReactNode): ReactNode => <>{who} 동기화 — 다른 실행에 자리를 넘겼습니다</>,
        failed: (who: ReactNode): ReactNode => <>{who} 동기화 — 실패했습니다</>,
        notStarted: (who: ReactNode): ReactNode => <>{who} 동기화 — 시작하지 않았습니다</>,
        upToDate: (who: ReactNode): ReactNode => <>{who} — 게시하거나 동기화할 것이 없었습니다</>,
        baseUnreadable: (who: ReactNode): ReactNode => <>{who} — 리포지토리의 기준 브랜치를 읽지 못했습니다</>,
        held: {
          "open-pr": (who: ReactNode): ReactNode => <>{who} — 동기화를 보류했습니다. Malmoi 풀 리퀘스트가 아직 열려 있습니다</>,
          "pr-check-failed": (who: ReactNode): ReactNode => <>{who} — 동기화를 보류했습니다. GitHub이 풀 리퀘스트 확인에 응답하지 않았습니다</>,
          "too-large": (who: ReactNode): ReactNode => <>{who} — 동기화를 보류했습니다. 변경이 서버 쪽 동기화로 처리하기에 너무 큽니다</>,
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
        image: (who: ReactNode): ReactNode => <>{who} — 프로젝트 이미지를 바꿨습니다</>,
        imageRemoved: (who: ReactNode): ReactNode => <>{who} — 프로젝트 이미지를 제거했습니다</>,
        archived: (who: ReactNode): ReactNode => <>{who} — 이 프로젝트를 보관했습니다</>,
        restored: (who: ReactNode): ReactNode => <>{who} — 이 프로젝트를 복원했습니다</>,
      },
      fallback: (who: ReactNode, kind: string): ReactNode => <>{who} — {kind} 항목을 바꿨습니다</>,
    },
    detail: {
      labels: {
        reference: "참조",
        trigger: "실행 주체",
        source: "소스",
        key: "키",
        locale: "언어",
        before: "이전",
        after: "이후",
        files: "파일",
        pullRequest: "풀 리퀘스트",
        errorCode: "오류 코드",
        resultPerSource: "소스별 결과",
        member: "멤버",
        role: "역할",
        effect: "효과",
        unsentEdits: "보내지 않은 편집",
        heldBecause: "보류 이유",
        values: "값",
        withheld: "제외됨",
        closedPullRequest: "닫은 풀 리퀘스트",
      },
      closedPullRequest: "기준 브랜치와 더 이상 다른 내용이 없어서 Malmoi가 닫았습니다.",
      withheld: (n: number): string =>
        `언어 파일이나 키가 아직 리포지토리에 없어서 편집 ${n.toLocaleString("ko-KR")}건이 Malmoi에 남았습니다.`,
      actions: {
        copy: "참조 복사",
        openTranslation: "이 번역 열기",
        openMembers: "멤버 열기",
        openSettings: "설정 열기",
        openRepository: "GitHub에서 열기",
        close: "닫기",
      },
      notes: {
        publish: "실행이 실패했다고 GitHub에 아무것도 닿지 않았다는 뜻은 아닙니다. 풀 리퀘스트를 기다리고 있다면 리포지토리를 확인하세요.",
        import: "수는 파일이나 번역 칸이 아니라 키의 수입니다. 소스 추가와 그 소스의 동기화는 별개의 이벤트입니다 — 이 실행은 동기화입니다.",
        token: "토큰 값은 일부라도 로그에 저장하지 않습니다.",
      },
      noResult: "서버가 결과를 기록하지 않았습니다.",
      notRecordedForRun: "이 실행에서는 기록하지 않음",
      noPullRequest: "없음",
      missing: { title: "이 이벤트를 찾지 못했습니다", description: "다른 프로젝트의 참조이거나 처음부터 없던 참조일 수 있습니다." },
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
      description: "이 프로젝트는 보관되었습니다. 이력은 계속 읽을 수 있지만 편집, 게시, 동기화는 꺼져 있습니다.",
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
      "github-error": `GitHub이 응답하지 않았습니다. ${NIGHTLY_RETRY}`,
      "db-unavailable": `Malmoi 저장소에 연결하지 못했습니다. ${NIGHTLY_RETRY}`,
      stale: "이 실행은 끝나기 전에 멈췄습니다.",
      unknown: `문제가 생겼습니다. ${NIGHTLY_RETRY}`,
      reconfirm: "미리보기 뒤에 보낼 변경이 바뀌어서 아무것도 보내지 않았습니다. 다시 미리 본 뒤 게시하세요.",
      fallback: "문제가 생겼습니다. 계속 일어나면 개발자에게 알리세요.",
    },
    refusals: {
      archived: "프로젝트가 보관되었습니다.",
      "not-ready": "첫 동기화가 아직 끝나지 않았습니다.",
      "stale-commit": "더 새로운 버전의 리포지토리가 이미 동기화되었습니다.",
      "wrong-format": "리포지토리가 저장된 형식과 더 이상 맞지 않습니다.",
      "repo-replaced": "연결된 리포지토리가 바뀌었습니다.",
      "not-installed": "앱이 리포지토리에 연결되어 있지 않았습니다.",
      fallback: "실행이 시작되기 전에 거부되었습니다.",
    },
  },

  archive: {
    title: "프로젝트 보관",
    description: "아무것도 삭제하지 않고 이 프로젝트를 멈춥니다.",
    action: "프로젝트 보관",
    restore: "프로젝트 복원",
    archivedBy: (when: ReactNode): ReactNode => <>{when}에 보관됨</>,
    confirm: {
      title: (name: string): string => `${name} 프로젝트를 보관하시겠습니까?`,
      body: "모든 사람의 편집이 멈추고, 야간 게시가 멈추며, 리포지토리에서 오는 동기화가 거부됩니다.",
      openPr: "이미 보낸 것은 개발자를 위해 열린 채로 남습니다:",
      openPrLink: "열린 항목 보기",
      prUnknown: "개발자를 위해 아직 열려 있는 항목을 확인하지 못했습니다.",
      cancel: "취소",
    },
    failed: (reason: string): string => `변경하지 못했습니다: ${reason}`,
    failedUnknown: "변경을 확인하지 못했습니다. 페이지를 새로고침해 현재 상태를 확인하세요.",
    empty: { title: "이 프로젝트는 보관되었습니다", action: "설정 열기" },
  },

  projects: {
    loading: "프로젝트 불러오는 중…",
    search: { label: "프로젝트 검색", placeholder: "프로젝트 검색…" },
    narrowed: {
      title: (q: string): string => `“${q}”에 해당하는 프로젝트 없음`,
      description: "검색은 프로젝트 이름만 봅니다.",
      reset: "검색 지우기",
    },
    archived: "보관됨",
    role: { OWNER: "소유자", EDITOR: "편집자" },
    empty: {
      title: "아직 프로젝트가 없습니다",
      description:
        "리포지토리를 연결하면 Malmoi가 번역 파일을 찾아 줍니다 — 리포지토리에 쓰는 것은 풀 리퀘스트를 여는 방법뿐입니다. 다른 사람의 프로젝트에 초대받았다면 초대 메일의 링크를 여세요.",
    },
    summary: {
      newFromGithub: "GitHub에서 새로 들어옴",
      toTranslate: "번역할 것",
      toReview: "검토할 것",
      toSend: "보낼 것",
    },
    group: { needsAttention: "확인 필요", allSet: "모두 완료" },
    resultsFor: (q: string): string => `“${q}” 검색 결과`,
    count: (n: number): string => `프로젝트 ${n}개`,
    clearSearch: "검색 지우기",
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
        `번역된 칸 ${n.toLocaleString("ko-KR")}개가 검토를 기다리고 있습니다.`,
      unsent: (n: number): string =>
        `보내지 않은 편집 ${n.toLocaleString("ko-KR")}건 — 게시해서 보내세요.`,
      prOpen: (n: number): string => `풀 리퀘스트 #${n} 열림 — 머지하면 끝납니다.`,
      prCheckFailed: "열린 풀 리퀘스트를 확인하지 못했습니다.",
      repoAhead: (n: number, baseBranch: string): string =>
        `마지막 동기화 뒤에 ${baseBranch} 브랜치에서 번역 파일 ${n}개가 바뀌었습니다.`,
      setup: "번역을 시작하려면 설정을 마치세요.",
      needsReconnect: "이 리포지토리의 연결이 끊겼습니다 — 다시 연결할 때까지 동기화와 게시가 멈춥니다.",
      checkDetails: "동기화 상세를 확인하세요.",
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
      parseCrashed: "번역 파일 하나 때문에 파서가 멈췄습니다.",
      invalidLocaleData: "일부 번역 항목을 읽지 못했습니다.",
      prepareFailed: "마지막 동기화에서 파일 형식을 읽지 못했습니다.",
      partialImport: "마지막 동기화에서 일부 번역 파일이 빠졌습니다.",
      importFailed: "마지막 동기화를 끝내지 못했습니다.",
      ownerRetries: "프로젝트 소유자만 다시 시도할 수 있습니다.",
    },
  },

  account: {
    loading: "계정 불러오는 중…",
    profile: {
      title: "프로필",
      avatar: "아바타",
      name: "이름",
      email: "이메일",
      none: "없음",
      save: "저장",
      saved: "저장됨",
      errors: {
        empty: "다른 사람이 알아볼 수 있도록 이름을 입력하세요.",
        tooLong: (max: number): string => `${max}자 이하로 입력하세요.`,
        unavailable: "이름을 저장하지 못했습니다. 잠시 뒤 다시 시도하세요.",
      },
    },
    github: {
      title: "GitHub App",
      notConnected: "연결 안 됨",
      statusReauthorize: "만료됨",
      statusUnavailable: "확인하지 못함",
      hintNotConnected: "연결하면 앱이 설치된 리포지토리를 볼 수 있습니다.",
      hintReauthorize: "다시 인가할 때까지 리포지토리를 추가하거나 다시 연결할 수 없습니다. 이미 연결된 프로젝트는 계속 동기화됩니다.",
      hintUnavailable: "이 연결을 확인하지 못했습니다. 잠시 뒤 이 페이지를 다시 여세요.",
      connected: "연결됨",
      installedOn: (n: number): string => `리포지토리 ${n.toLocaleString("ko-KR")}개에 설치되어 있습니다.`,
      installationSettings: "설치 설정",
      rowName: "GitHub",
      confirmDisconnect: "Malmoi에서 GitHub App 연결을 해제하시겠습니까?",
      confirmHint: "다시 연결할 때까지 리포지토리를 추가하거나 다시 연결할 수 없습니다. 이미 연결된 프로젝트는 계속 동기화됩니다.",
    },
    sessionsSection: {
      title: "세션",
    },
    sessions: {
      title: "모든 기기에서 로그아웃",
      confirmTitle: "모든 기기에서 로그아웃하시겠습니까?",
      confirmHint: "로그인에 쓰는 계정으로 확인하면 이 기기를 포함한 모든 기기에서 로그아웃됩니다.",
      // provider 이름 뒤 조사를 피하려고 "~에서 계속"으로 쓴다(DESIGN §10.0).
      confirmAction: (provider: string): string => `${provider}에서 계속`,
      confirmDetail: (provider: string): string => `무엇이든 바뀌기 전에 ${provider} 화면에서 확인을 요청합니다.`,
      willConfirm: "로그인 서비스로 이동해 확인한 뒤 이 화면으로 돌아옵니다.",
      button: "확인하고 모든 기기에서 로그아웃",
      complete: "모든 기기에서 로그아웃되었습니다. 계속하려면 다시 로그인하세요.",
      failed: "모든 기기에서 로그아웃하지 못했습니다. 다시 시도하세요.",
      cancelled: "확인이 취소되었습니다. 로그인 상태는 그대로입니다. 준비되면 다시 시도하세요.",
      expired: "이 확인이 만료되었습니다. 모든 기기에서 로그아웃하려면 처음부터 다시 시작하세요.",
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
      title: "내 토큰",
      create: "토큰 만들기",
      rotate: "토큰 교체",
      revoke: "철회",
      expired: "만료됨",
      emptyTitle: "아직 토큰이 없습니다",
      emptyBody: "토큰을 만들면 AI 에이전트가 내 프로젝트에서 작업할 수 있습니다.",
      facts: {
        grants: "허용 동작",
        scope: "범위",
        created: "만든 날",
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
      "translation:write": { label: "번역·게시", hint: "번역을 저장하고 게시 풀 리퀘스트를 엽니다." },
      "project:settings": { label: "프로젝트 설정", hint: "소스, 동기화, 기준 브랜치, 푸시 토큰, 보관." },
      "member:manage": { label: "멤버", hint: "초대, 역할 변경, 제거." },
      "project:create": { label: "프로젝트 만들기", hint: "GitHub 리포지토리 목록을 보고 새 프로젝트를 설정합니다." },
    },
    apps: {
      title: "연결된 앱",
      count: (n: number): string => `연결된 앱 ${n.toLocaleString("ko-KR")}개`,
      copyServerUrl: "서버 URL 복사",
      emptyTitle: "연결된 앱 없음",
      emptyBody: "Claude Code, Codex, claude.ai에서 인가한 앱이 여기에 표시됩니다.",
      disconnect: "연결 해제",
      disconnectLabel: (name: string, id: string): string => `${name} 앱 연결 해제, ${id}`,
      confirmTitle: (name: string): string => `${name} 앱의 연결을 해제하시겠습니까?`,
      confirmBody: "즉시 접근 권한을 잃습니다. 다른 앱과 개인 토큰은 계속 작동합니다.",
      confirm: "앱 연결 해제",
      disconnected: (name: string): string => `${name} 앱 연결을 해제했습니다`,
      loadFailed: "연결된 앱을 불러오지 못했습니다.",
      unconfirmed: (name: string): string => `${name} 앱의 연결이 해제되었는지 확인하지 못했습니다. 아직 목록에 있으면 다시 연결을 해제하세요.`,
      dcrIdent: (id: string, host: string): string => `클라이언트 ID ${id} · 돌아갈 곳 ${host}`,
    },
    guide: {
      link: "AI 에이전트 연결",
    },
    form: {
      createTitle: "토큰 만들기",
      rotateTitle: "토큰 교체",
      expiresIn: "만료까지",
      days: (n: number): string => `${n.toLocaleString("ko-KR")}일`,
      grants: "허용 동작",
      grantsHelp: "프로젝트 안의 키, 이벤트, 멤버를 읽는 데는 권한이 필요 없습니다.",
      scope: "범위",
      allMine: "내 모든 프로젝트",
      chosen: "선택한 프로젝트",
      noMembership: "아직 어느 프로젝트의 멤버도 아닙니다.",
      chooseOne: "프로젝트를 하나 이상 고르세요.",
      step: (n: number): string => `2단계 중 ${n.toLocaleString("ko-KR")}단계`,
      create: "만들기",
      rotateConfirm: "교체하고 새 토큰 보기",
      rotateWarning: "교체하면 지금 토큰이 즉시 작동을 멈춥니다. 이 토큰을 쓰는 모든 에이전트는 새 토큰을 붙여 넣을 때까지 멈춥니다.",
      failed: "토큰을 만들지 못했습니다. 잠시 뒤 다시 시도하세요.",
    },
    result: {
      title: "내 토큰",
      copyNow: "지금 복사하세요 — 다시 표시되지 않습니다.",
      setEnv: "셸에 MALMOI_TOKEN으로 설정한 뒤 에이전트에 Malmoi를 추가하세요 — 방법은 AI 에이전트 연결에 있습니다.",
    },
    revoke: {
      title: "토큰을 철회하시겠습니까?",
      body: "이 토큰을 쓰는 모든 에이전트가 즉시 멈춥니다. 되돌릴 수 없습니다.",
      confirm: "토큰 철회",
    },
  },

  oauthAuthorize: {
    title: "Malmoi에 앱 연결",
    signInDescription: "로그인해서 이 앱이 요청하는 것을 확인하세요.",
    consentDescription: "앱이 할 수 있는 일을 고르세요. MCP 커넥터 페이지에서 언제든 연결을 해제할 수 있습니다.",
    appNameNote: "이 이름은 앱이 직접 정했습니다. 계속하기 전에 주소를 확인하세요.",
    clientId: (id: string): string => `클라이언트 ID ${id}`,
    returnsTo: (uri: string): string => `돌아갈 곳 ${uri}`,
    signedInWith: (provider: string): string => `로그인 수단: ${provider}`,
    notYou: "본인이 아닙니까?",
    replaces: (date: string): string =>
      `${date}에 이 앱을 연결했습니다. 연결을 마치면 새 연결이 기존 연결을 대체하고, 다른 기기에서 앱이 로그아웃될 수 있습니다. 거부하면 지금 연결이 유지됩니다.`,
    denyFailed: "응답을 기록하지 못했습니다. 아무것도 바뀌지 않았습니다 — 다시 시도하세요.",
    consentNote:
      "각 프로젝트에서 앱은 그 프로젝트의 내 역할이 허용하는 일만 할 수 있습니다. 내 모든 프로젝트에는 나중에 참여하는 프로젝트도 들어가고, 앱이 만든 프로젝트는 선택한 프로젝트에 추가됩니다. 연결은 만료되면 끝납니다 — 계속 쓰려면 앱에서 다시 연결하세요.",
    returnTo: (host: string): string => `${host} 사이트로 돌아갑니다.`,
    deny: "거부",
    authorize: "인가",
    failed: "이 인가를 저장하지 못했습니다. 고른 항목은 그대로 있습니다 — 다시 시도하세요.",
    unconfirmed: "처리되었는지 확인하지 못했습니다. 다른 것을 시도하기 전에 요청을 확인하세요.",
    checkRequest: "요청 확인",
    sessionEnded: "로그아웃되었습니다. 계속하려면 다시 로그인하세요 — 이 요청은 아직 열려 있습니다.",
    ended: {
      notFound: { title: "이 요청을 찾지 못했습니다", body: "링크가 불완전할 수 있습니다. 앱으로 돌아가 Malmoi에 다시 연결하세요." },
      expired: { title: "이 요청이 만료되었습니다", body: "요청은 10분 동안 열려 있습니다. 앱으로 돌아가 Malmoi에 다시 연결하세요." },
      used: {
        title: "이미 응답한 요청입니다",
        body: "앞서 인가되었거나 거부되었습니다. 앱을 확인하고, 연결되어 있지 않으면 그 앱에서 Malmoi에 다시 연결하세요.",
      },
      unavailable: { title: "이 요청을 불러오지 못했습니다", body: "Malmoi 쪽에서 문제가 생겼습니다. 요청이 아직 열려 있을 수 있습니다 — 잠시 뒤 다시 시도하세요." },
      invalid: {
        title: "이 앱은 연결할 수 없습니다",
        body: "이 요청이 어디서 왔는지 Malmoi가 확인하지 못해 여기서 멈췄습니다. 앱에 공유된 것은 없습니다.",
      },
    },
  },
  newProject: {
    formats: {
      "chrome-locales": { label: "Chrome 확장 프로그램 메시지", example: "_locales/{locale}/messages.json" },
      "json-catalog": { label: "JSON 카탈로그", example: "src/locales/{locale}.json" },
      "yaml-catalog": { label: "YAML 카탈로그", example: "config/locales/{locale}.yml" },
      "code-dict": { label: "코드 사전(언어마다 파일 하나)", example: "src/locales/{locale}.ts" },
      "ts-dict": { label: "코드 사전(모든 언어가 파일 하나에)", example: "src/i18n/namespaces/*.ts" },
    },
    imported: (count: number, failed: number): string =>
      failed === 0
        ? `키 ${count.toLocaleString("ko-KR")}개를 동기화했습니다.`
        : `키 ${count.toLocaleString("ko-KR")}개를 동기화했지만 ${failed.toLocaleString("ko-KR")}개는 읽지 못했습니다.`,

    modal: {
      next: "다음",
      back: "이전",
      close: "닫기",
      step: (n: number): string => `4단계 중 ${n}단계`,
    },

    steps: {
      repo: {
        title: "새 프로젝트",
        description: "리포지토리와 Malmoi가 읽을 브랜치를 고르세요.",
      },
      files: {
        title: "문자열이 어느 파일에 있습니까?",
        description: (n: number, repo: string, branch: string): string =>
          `${repo} · ${branch}에서 ${n}개 묶음을 찾았습니다. 계속하기 전에 키를 확인하세요.`,
        loading: (repo: string, branch: string): string => `${repo} · ${branch} 읽는 중…`,
        emptyTitle: "번역 파일은 어디에 있습니까?",
        emptyDescription: (repo: string, branch: string): string =>
          `${repo} · ${branch}에서 지원하는 번역 파일을 찾지 못했습니다. 경로를 지정하면 Malmoi가 확인합니다.`,
      },
      naming: {
        title: "프로젝트 정보",
        description: "기준 언어가 어떤 키가 있는지 정합니다. 이름과 주소는 리포지토리에서 가져옵니다.",
      },
      result: {
        title: "Malmoi 준비 완료",
        description: "Malmoi는 매일 밤 리포지토리에 아직 보내지 않은 번역을 풀 리퀘스트로 보내거나, 새 커밋을 받아옵니다. 커밋마다 변경을 받으려면 리포지토리에 푸시 토큰과 워크플로를 추가하세요.",
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
        installed: "조직에 이미 설치되어 있습니까?",
        connect: "계정 연결",
      },
      repos: {
        title: "리포지토리 추가",
        description: "Malmoi GitHub App이 접근할 수 있는 리포지토리를 고르세요.",
        action: "리포지토리 선택",
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
        description: (limit: number): string => `소유할 수 있는 최대 개수인 프로젝트 ${limit.toLocaleString("ko-KR")}개를 소유하고 있습니다. 자리를 만들려면 하나를 보관하세요.`,
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
      notListed: "리포지토리가 보이지 않습니까?",
      loading: "Malmoi GitHub App이 설치된 리포지토리를 찾는 중…",
      searchEmpty: (q: string): string => `“${q}”에 해당하는 리포지토리 없음`,
      clearSearch: "검색어 지우기",
    },

    files: {
      candidates: "번역 파일 후보",
      resize: "파일 목록 크기 조절",
      include: (path: string) => `${path} 포함`,
      previewCandidate: (path: string) => `${path} 미리보기`,
      conflicts: "이 선택들이 같은 파일에 씁니다. 계속하려면 하나의 선택을 해제하세요.",
      keys: (n: number): string => `키 ${n.toLocaleString("ko-KR")}개`,
      summaryShort: (locales: number, keys: string): string => `언어 ${locales}개 · ${keys}`,
      notListed: "목록에 없습니까?",
      setPath: "경로 직접 지정",
      preview: {
        key: "키",
        value: "값",
        more: (n: number): string => `키 ${n.toLocaleString("ko-KR")}개 더 있음`,
        language: "언어",
        option: (code: string, keys: string | undefined): string => (keys === undefined ? code : `${code} · ${keys}`),
        none: "아직 미리 볼 내용 없음",
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
            <>이 형식은 모든 언어를 파일 하나에 담으므로 경로에 언어 자리표시가 없습니다. 파일을 맞추려면 {token} 패턴을 쓰세요.</>
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
      hint: "이 언어의 파일이 어떤 키가 있는지 정합니다. 잘못 고르면 다른 언어에만 있는 키가 빠집니다.",
    },

    naming: {
      name: "이름",
      slug: "주소",
      hint: (address: ReactNode, branch: ReactNode): ReactNode => (
        <>
          {address} 주소에서 열립니다. 번역은 {branch} 브랜치에 풀 리퀘스트로 돌아옵니다.{" "}
          <strong className="text-foreground font-normal">주소는 나중에 바꿀 수 없습니다.</strong>
        </>
      ),
      create: "프로젝트 만들기",
      creating: "프로젝트를 만들고 선택한 파일을 모두 동기화하는 중…",
      nothingCreated: "아무것도 만들어지지 않았습니다.",
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
      slugEmpty: "주소를 정하세요.",
      slugFormat: "주소에는 영문 소문자, 숫자, '-', '.', '_'를 쓸 수 있습니다.",
      slugTooLong: (max: number): string => `주소는 최대 ${max}자까지 쓸 수 있습니다.`,
      slugReserved: "예약된 주소입니다.",
    },

    errors: {
      sessionLost: "다시 로그인한 뒤 돌아오세요. 아무것도 만들어지지 않았습니다.",
      sessionLostAfterCreate: "다시 로그인한 뒤 돌아오세요. 프로젝트는 목록에 그대로 있습니다.",
    },

    result: {
      token: {
        title: "푸시 토큰",
        description: (secret: ReactNode): ReactNode => (
          <>
            이 값을 리포지토리의 Actions secret {secret} 항목에 추가하세요.{" "}
            <strong className="text-foreground font-normal">이 페이지를 떠나면 다시 볼 수 없습니다.</strong> 잃어버렸다면
            설정에서 교체하세요.
          </>
        ),
      },
      ingest: {
        retry: "다시 시도",
        refsHint: "코드 참조는 CI 워크플로가 처음 실행된 뒤에 들어옵니다. 지금 번역을 시작해도 됩니다.",
        open: "프로젝트 열기",
      },
      failed: "끝내지 못했습니다. 잠시 후 다시 시도하세요.",
    },
  },

  translations: {
    loading: "번역을 불러오는 중…",
    keys: (n: number): string => `키 ${n.toLocaleString("ko-KR")}개`,

    workspace: {
      filters: {
        state: { axis: "상태", any: "모든 키", incomplete: "미완료", review: "검토 필요", unsent: "미전송", new: "GitHub에서 새로 들어옴", newHint: "Malmoi가 파일을 마지막으로 확인한 뒤에 들어온 키입니다." },
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
        selectKeyBody: "모든 언어의 번역이 여기에 열립니다.",
        keyGone: (source: string): string => `이 키는 더 이상 ${source} 소스에 없습니다`,
      },
      footer: {
        unsaved: (n: number): string => `저장하지 않은 변경 ${n.toLocaleString("ko-KR")}개`,
        saved: "저장됨",
        savedNotSent: "저장됨 · 미전송",
        savedSince: (n: number): string => `저장됨 · 저장을 누른 뒤 변경 ${n.toLocaleString("ko-KR")}개`,
        save: "저장",
        tryAgain: "다시 시도",
        saveFailed: { title: "이 키를 저장하지 못했습니다", body: "입력한 텍스트는 그대로 있습니다. 다시 시도하거나 잠시 후 저장하세요." },
        saveUnknown: { title: "저장되었는지 확인하지 못했습니다", body: "입력한 텍스트는 그대로 있습니다. 다시 저장하기 전에 현재 값을 확인하세요." },
        cannotClear: {
          title: (locales: string): string => `${locales} 언어는 비워 둘 수 없습니다`,
          body: "이 파일 형식은 번역을 지울 수 없어 아무것도 저장하지 않았습니다. 값을 입력하거나 변경을 취소하세요.",
        },
        archived: "보관된 프로젝트라 편집이 꺼져 있습니다",
        lostAccess: "더 이상 이 프로젝트에 접근할 수 없습니다",
        keyGone: "이 키는 더 이상 사용할 수 없습니다. 텍스트를 복사한 뒤 페이지를 새로고침하세요.",
        notReady: "이 프로젝트는 첫 동기화를 마치지 않았습니다. 텍스트는 그대로 있으니 동기화가 끝난 뒤 저장하세요.",
        session: {
          title: "세션이 끝났습니다",
          body: "이 탭에서 다시 로그인하세요. 그때까지 입력한 텍스트는 화면에 남아 있습니다.",
          signIn: "로그인",
          restored: (n: number): string => `다시 로그인함 · 저장하지 않은 변경 ${n.toLocaleString("ko-KR")}개 복원됨`,
          storageBlocked: "로그인하기 전에 텍스트를 복사하세요. 이 브라우저는 텍스트를 보관하지 않습니다.",
        },
      },
      revert: {
        button: "마지막 전송본으로 되돌리기",
        title: "마지막으로 확인된 버전으로 되돌리시겠습니까?",
        body: (n: number, list: string): string =>
          `언어 ${n.toLocaleString("ko-KR")}개(${list})의 보내지 않은 편집이 마지막으로 전송이 확인된 버전으로 돌아갑니다. 그 뒤에 저장한 내용은 버려집니다.`,
        confirm: "번역 되돌리기",
        unavailable: "변경된 언어 중 일부는 마지막 전송본이 없습니다.",
        unsaved: "먼저 변경을 저장하거나 취소하세요.",
        busy: "저장, 게시, 동기화가 진행되는 동안에는 꺼져 있습니다.",
        forbidden: "프로젝트 소유자만 전송본으로 되돌릴 수 있습니다.",
        failed: { title: "이 키를 되돌리지 못했습니다", body: "아무것도 바뀌지 않았습니다. 다시 시도하거나 마지막 동기화를 확인하세요." },
        unknown: { title: "되돌렸는지 확인하지 못했습니다", body: "되돌리기가 끝났을 수 있습니다. 다시 시도하기 전에 현재 값을 확인하세요.", check: "현재 값 확인" },
        changed: { title: "이 창이 열려 있는 동안 값이 바뀌었습니다", body: "누군가 이 키에 새 값을 저장했습니다. 되돌리기 전에 새 값을 확인하세요. 이 대화 상자는 더 이상 저장된 내용과 맞지 않습니다.", again: "다시 검토" },
        reverted: "마지막으로 전송이 확인된 버전으로 되돌렸습니다",
      },
      sync: { ownerOnly: "프로젝트 소유자만 동기화할 수 있습니다." },
      syncLock: {
        title: "동기화 중…",
        until: (time: ReactNode): ReactNode => <>동기화가 끝날 때까지 편집을 저장할 수 없습니다. 늦어도 {time}에는 끝납니다</>,
        ok: "확인",
      },
      publish: {
        title: "변경을 저장하지 않고 게시하시겠습니까?",
        body: (project: string, list: string, key: string, n: number): string =>
          `게시는 ${project} 프로젝트에 저장된 모든 값을 보냅니다. ${key} 키의 저장하지 않은 ${list} 번역(언어 ${n.toLocaleString("ko-KR")}개)은 초안으로 여기에 남습니다.`,
        keep: "계속 편집",
        preview: "저장된 변경 미리보기",
      },
      discard: {
        title: "변경을 취소하시겠습니까?",
        body: (key: string, list: string, n: number): string =>
          `${key} 키의 저장하지 않은 ${list} 번역(${n.toLocaleString("ko-KR")}개)이 사라집니다.`,
        keep: "계속 편집",
        discard: "변경 취소",
        leave: "떠나고 변경 취소",
      },
      empty: {
        noIncomplete: (ns: string): string => `${ns} 안에 미완료 키 없음`,
        noMatch: (q: string): string => `“${q}”에 해당하는 키 없음`,
        noIncompleteMatch: (q: string): string => `“${q}”에 해당하는 미완료 키 없음`,
        filteredOut: "이 필터와 일치하는 키 없음",
        searchAll: "모든 소스 검색",
        clearSearch: "검색어 지우기",
        noKeys: (ns: string): string => `${ns} 안에 키 없음`,
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
        `보내지 않은 편집 ${n.toLocaleString("ko-KR")}건이 전송될 때까지 리포지토리 업데이트를 보류합니다.`,
      sendWithPublish: "게시로 보내기",
      basePending: (locale: string): string =>
        `기준 언어가 ${locale} 언어로 바뀌는 중입니다. ` +
        "리포지토리의 GitHub Actions 워크플로가 다음에 동기화할 때 바뀌며, 동기화 버튼으로는 적용되지 않습니다. " +
        "보내지 않은 편집이 있는 동안 그 동기화는 기다리므로 먼저 게시하세요.",
    },

    empty: {
      notReady: "아직 번역할 내용 없음",
      noKeys: {
        description: "개발자가 리포지토리에 추가한 문자열은 다음 동기화 뒤에 여기에 나타납니다.",
      },
    },

    publish: {
      button: "게시",
      unsentCount: (n: number): string => `보내지 않은 편집 ${n.toLocaleString("ko-KR")}건`,
      viewResult: "결과 보기",
      viewLink: "풀 리퀘스트 보기",
      nothing: "보낼 것이 없습니다. 모든 편집을 이미 보냈습니다.",
      paused: "지금은 게시할 수 없습니다.",

      previewTitle: (n: number): string => `변경 ${n.toLocaleString("ko-KR")}개 게시`,
      previewIntro: (repo: string): string =>
        `편집한 내용이 모두 풀 리퀘스트 하나로 ${repo} 리포지토리에 갑니다.`,
      previewIntroPartial: (repo: string): string =>
        `보낼 수 있는 편집이 풀 리퀘스트 하나로 ${repo} 리포지토리에 갑니다.`,
      same: {
        undoes: (n: number): string => `#${n}의 변경을 되돌림`,
        already: "이미 리포지토리에 있음",
        closesTitle: (n: number): string => `게시하면 풀 리퀘스트 #${n} 닫힘`,
        closesBody: (n: number, branch: string): string =>
          `여기의 모든 편집이 다시 ${branch} 브랜치와 같아져 #${n}에는 머지할 내용이 남지 않습니다. Malmoi가 이유를 담은 댓글과 함께 닫습니다.`,
        closeAction: (n: number): string => `풀 리퀘스트 #${n} 닫기`,
        nothingTitle: (branch: string): string => `${branch} 브랜치와 다른 내용 없음`,
        nothingBody: "여기의 모든 편집이 이미 리포지토리와 같아 풀 리퀘스트가 열리지 않습니다. 게시하면 전송된 것으로 표시됩니다.",
        action: "게시",
      },
      nothingSendable: {
        title: "아직 보낼 수 있는 것 없음",
        body: "보내지 않은 편집이 모두 언어 파일이나 키를 기다리고 있어 바뀔 풀 리퀘스트가 없습니다.",
      },
      previewCounts: (n: number, keys: number): string =>
        `키 ${keys.toLocaleString("ko-KR")}개에 변경 ${n.toLocaleString("ko-KR")}개.`,
      previewSummary: (n: number, keys: number, files: number): string =>
        `변경 ${n.toLocaleString("ko-KR")}개 · 키 ${keys.toLocaleString("ko-KR")}개 · 파일 ${files.toLocaleString("ko-KR")}개`,
      changes: (n: number): string => `변경 ${n.toLocaleString("ko-KR")}개`,
      otherFile: {
        label: "보내지 않은 편집 없음",
        body: "이 파일은 Malmoi의 현재 번역으로 다시 씁니다. 코드에서 지운 키는 빠지고, 머지되지 않은 이전 풀 리퀘스트의 값은 다시 나갑니다.",
      },
      fileSummary: (n: number, keys: number): string =>
        `변경 ${n.toLocaleString("ko-KR")}개 · 키 ${keys.toLocaleString("ko-KR")}개`,
      key: "키",
      locale: "언어",
      value: "값",
      beforeLabel: "리포지토리의 값",
      afterLabel: "내 편집",
      truncated: (n: number): string =>
        `${n.toLocaleString("ko-KR")}개는 여기에 표시되지 않습니다. 게시하면 모두 보냅니다.`,
      withoutFile: (n: number): string =>
        `언어 파일이 아직 리포지토리에 없어 편집 ${n.toLocaleString("ko-KR")}건은 목록에 없습니다. 파일이 생길 때까지 여기에 남습니다.`,
      withoutKey: (n: number): string =>
        `언어 파일에 키가 없어 편집 ${n.toLocaleString("ko-KR")}건은 목록에 없습니다. 파일에 그 키가 생길 때까지 여기에 남습니다.`,
      withheld: {
        file: (n: number): string =>
          `언어 파일이 리포지토리에 없어 편집 ${n.toLocaleString("ko-KR")}건을 보내지 않았습니다. 파일이 생길 때까지 여기에 남습니다.`,
        key: (n: number): string =>
          `언어 파일에 키가 없어 편집 ${n.toLocaleString("ko-KR")}건을 보내지 않았습니다. 파일에 그 키가 생길 때까지 여기에 남습니다.`,
        editor: "프로젝트 소유자에게 요청하세요.",
        owner: {
          file: "리포지토리에 파일을 추가하거나, 마지막 전송본으로 되돌리기를 쓰세요.",
          key: "마지막 전송본으로 되돌리기를 쓰거나, 언어 파일에 키를 다시 추가하세요.",
          fileNoRevert: "리포지토리에 파일을 추가하거나, 동기화로 편집을 버리세요.",
          keyNoRevert: "언어 파일에 키를 다시 추가하거나, 동기화로 편집을 버리세요.",
        },
      },

      prOpen: {
        title: (n: number): string => `풀 리퀘스트 #${n} 열려 있음 — 게시하면 그 내용을 교체함`,
        body: (n: number, changes: number): ReactNode => (
          <>
            두 번째 풀 리퀘스트는 열리지 않습니다. #{n}에는 이번 변경{" "}
            {changes === 1 ? "하나" : `${changes.toLocaleString("ko-KR")}개`}만이 아니라{" "}
            <span className="text-foreground">보내지 않은 모든 것</span>이 담깁니다.
          </>
        ),
      },
      prNone: {
        title: (repo: string): string => `${repo} 리포지토리에 새 풀 리퀘스트가 열림`,
        body: (changes: number): string =>
          `지금 열린 풀 리퀘스트가 없어 변경 ${changes.toLocaleString("ko-KR")}개가 새로 나갑니다.`,
      },
      prUnknown: {
        title: "열린 풀 리퀘스트를 확인하지 못했습니다",
        body: "이미 열려 있다면 게시는 두 번째를 열지 않고 그 내용을 교체합니다.",
      },
      openPr: "풀 리퀘스트 열기",
      replacePr: (n: number): string => `풀 리퀘스트 #${n} 교체`,

      progressTitle: (n: number): string => `변경 ${n.toLocaleString("ko-KR")}개 게시 중`,
      progressDescription:
        "번역 파일을 쓰고 풀 리퀘스트를 엽니다. 보통 몇 초 걸립니다.",
      progress: (branch: string): readonly string[] => [
        "번역 파일 생성",
        `${branch} 브랜치에 커밋`,
        "풀 리퀘스트 열기",
      ],
      leave: "이 페이지를 떠나도 멈추지 않습니다.",

      created: "검토 요청됨",
      createdDescription: (n: number): string =>
        `변경 ${n.toLocaleString("ko-KR")}개가 풀 리퀘스트에 있습니다. 팀의 누군가 머지하면 제품에 반영됩니다.`,
      prMeta: (n: number, files: number): string =>
        `풀 리퀘스트 #${n} · 파일 ${files.toLocaleString("ko-KR")}개 변경됨`,
      openedJustNow: "방금 열림",
      holdsEverything: "보내지 않은 모든 것을 담음",
      prState: "열림",
      accessNote:
        "이 풀 리퀘스트의 편집이나 닫기는 GitHub에서 합니다. GitHub 접근 권한이 없다면 프로젝트 소유자에게 요청하세요.",

      updated: "이전 풀 리퀘스트에 이번 변경이 담겼습니다",
      updatedDescription: (n: number, changes: number): string =>
        `#${n} 풀 리퀘스트가 아직 열려 있어 Malmoi가 두 번째를 열지 않고 그 내용을 교체했습니다. 이제 오늘의 변경 ${changes.toLocaleString("ko-KR")}개만이 아니라 보내지 않은 모든 것을 담고 있습니다.`,
      replacedTitle: "브랜치에 더한 것이 아니라 교체했습니다",
      replacedBody: (branch: string, base: string): ReactNode => (
        <>
          {branch} 브랜치는 항상{" "}
          <span className="text-foreground">{base} 브랜치에서 커밋 하나</span>만 앞서므로, 이 풀 리퀘스트는
          그동안 더해진 내용의 이력이 아니라 보내지 않은 모든 것의 스냅샷입니다.
        </>
      ),
      tellReviewer: (n: number): string =>
        `#${n} 풀 리퀘스트가 한동안 기다리고 있었다면 검토자에게 내용이 바뀌었다고 알려 주는 것이 좋습니다.`,

      noChanges: "파일에 바뀐 것 없음",
      noChangesDescription:
        "편집한 내용이 이미 리포지토리에 있어 풀 리퀘스트가 필요하지 않았습니다.",
      noChangesBody: (branch: string): ReactNode => (
        <>
          Malmoi가 쓸 내용을{" "}
          <span className="text-foreground">{branch}</span> 브랜치와 비교했더니 둘이 같았습니다. 같은 값이
          리포지토리에서 동기화되었거나, 보내기 전에 편집을 되돌렸을 때 이렇게 됩니다.
        </>
      ),
      inLogs: "로그에 보낼 것이 없는 실행으로 기록됩니다.",
      close: "닫기",

      notSent: "제외됨 — 일부 값을 파일에 쓸 수 없음",
      notSentDescription:
        "이 값들이 빠지게 되어 Malmoi가 리포지토리에 쓰기 전에 멈췄습니다. 편집한 내용은 여기에 그대로 저장되어 있습니다.",
      closedPr: {
        description: (branch: string): string => `편집한 내용이 이제 ${branch} 브랜치와 같아 이전 풀 리퀘스트를 닫았습니다.`,
        line: (n: number, branch: string): string => `풀 리퀘스트 #${n}에 ${branch} 브랜치와 다른 내용이 더 이상 없어 닫았습니다.`,
        owner: "다음에 변경이 있는 게시를 하면 새 풀 리퀘스트가 열립니다.",
        editor: "다음에 변경이 있는 게시를 하면 새 풀 리퀘스트가 열립니다. 열려 있어야 했다면 프로젝트 소유자에게 요청하세요.",
        view: (n: number): string => `#${n} 보기`,
      },
      withheldDescription: {
        withheld: "리포지토리에 아무것도 쓰지 않았습니다. 이 편집들은 보낼 수 있을 때까지 여기에 저장되어 있습니다.",
        noChanges: "리포지토리에 아무것도 쓰지 않았습니다. 다른 편집은 이미 리포지토리와 같았고, 이 편집들은 보낼 수 있을 때까지 여기에 저장되어 있습니다.",
      },
      notWritten: "제외됨",
      warnings: (n: number): string =>
        `경고 ${n.toLocaleString("ko-KR")}건 · 값은 Malmoi에 그대로 저장됨`,
      stillHere: "이 값들은 Malmoi에 남아 있다가 파일이 담을 수 있게 되면 나갑니다.",

      configError: "리포지토리에 닿지 못했습니다",
      configErrorDescription: (repo: string, branch: string): string =>
        `${branch} 브랜치가 이 변경을 받으려면 ${repo} 리포지토리에서 바꿔야 할 것이 있습니다. 편집한 내용은 여기에 그대로 저장되어 있습니다.`,
      wontHelp: "다시 시도해도 해결되지 않습니다",
      repository: "리포지토리",
      baseBranch: "기준 브랜치",
      failedAt: "실패 시각",
      reference: "참조",
      sendReference: "프로젝트 소유자가 아닙니까? 위 참조를 소유자에게 전달하세요 — 로그에도 있습니다.",
      settings: "설정 열기",
      signIn: "로그인",

      transientError: "GitHub이 응답하지 않았습니다",
      transientErrorDescription:
        "GitHub으로 보낸 요청이 중간에 실패했습니다. 편집한 내용은 여기에 그대로 저장되어 있습니다.",
      transientErrorBody: (): ReactNode => (
        <>
          보통 일시적인 문제이고 다시 시도해도 안전합니다. Malmoi는{" "}
          <span className="font-medium">같은 브랜치를 교체</span>하므로 다시 시도해도 사본이 두 벌 남지
          않습니다.
        </>
      ),
      retry: "다시 시도",
      lostResponse: "응답이 돌아오지 않았습니다",
      lostResponseDescription:
        "Malmoi가 변경을 이미 보냈을 수 있습니다. 편집한 내용은 여기에 그대로 저장되어 있습니다.",

      notStarted: "아무것도 보내지 않았습니다. 편집한 내용은 안전합니다.",
      refused: "게시를 시작하지 못했습니다. 프로젝트 목록에서 이 프로젝트를 다시 여세요.",
      baseFileMissing: {
        title: "기준 언어 파일이 리포지토리에 없습니다",
        description: (path: string, branch: string): string =>
          `Malmoi는 ${branch} 브랜치의 ${path} 경로에서 이 파일을 찾으며, 파일이 없는 동안에는 아무것도 보내지 않았습니다.`,
        owner: "그 브랜치에 파일을 되살리거나, 설정에서 경로나 브랜치를 바꾸세요.",
        editor: "프로젝트 소유자에게 파일을 되살리거나 설정에서 경로를 바꿔 달라고 요청하세요.",
      },
      baseFileUnreadable: {
        title: "기준 언어 파일을 읽을 수 없습니다",
        description: (path: string, branch: string): string =>
          `Malmoi가 ${branch} 브랜치의 ${path} 경로를 해석하지 못해 파일에 어떤 키가 있는지 알 수 없습니다. 아무것도 보내지 않았습니다.`,
        owner: "그 브랜치의 파일을 고치거나, 설정에서 경로나 브랜치를 바꾸세요.",
        editor: "프로젝트 소유자에게 파일을 고치거나 설정에서 경로를 바꿔 달라고 요청하세요.",
      },
      unknownDelivery: "변경이 전송되었는지 확인하지 못했습니다.",

      alreadyRunning: "다른 사람이 지금 게시하고 있습니다",
      alreadyRunningBody:
        "방금 다른 실행이 시작되었습니다. 끝날 때까지 기다리세요 — 그 실행이 아직 변경을 읽지 않았다면 포함되고, 이미 읽었다면 다음에 보내집니다.",
      tooSoon: "잠시 기다리세요",
      tooSoonBody:
        "리포지토리에 풀 리퀘스트가 연달아 두 번 가지 않도록 Malmoi는 사이에 잠시 기다립니다.",
      wait: (seconds: number): string => `${seconds.toLocaleString("ko-KR")}초 후 다시 시도`,

      previewFailed: "나갈 내용을 읽지 못했습니다",
      previewFailedDescription: (branch: string): string =>
        `Malmoi는 편집이 무엇을 바꿀지 보여 주려고 ${branch} 브랜치의 번역 파일을 읽습니다. 그 읽기가 돌아오지 않았습니다.`,
      previewFailedTitle: (branch: string): string => `${branch} 브랜치의 파일을 읽을 수 없습니다`,
      previewFailedBody: (n: number): string =>
        `변경 ${n.toLocaleString("ko-KR")}개는 그대로 있습니다. 이 목록을 보여 줄 수 있을 때까지 게시는 꺼져 있습니다 — 목록 없이 보내면 풀 리퀘스트가 무엇을 교체하는지 알려 주는 단계를 건너뛰게 됩니다.`,
      previewFailedHint:
        "계속 이렇다면 리포지토리 연결을 살펴보세요 — 프로젝트 소유자가 설정에서 확인할 수 있습니다.",
    },
  },
  sources: {
    screenLoading: "소스를 불러오는 중…",
    title: "소스",
    count: (n: number): string => `소스 ${n.toLocaleString("ko-KR")}개`,
    languageCount: (n: number): string => `언어 ${n.toLocaleString("ko-KR")}개`,
    unmanaged: (n: number): string => `항목 ${n.toLocaleString("ko-KR")}개는 일반 텍스트가 아니어서 코드에 그대로 남습니다.`,
    add: "소스 추가",
    open: "번역 열기",
    openLanguage: "열기",
    details: "소스 상세",
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
    latestFailed: "변경은 완료됐지만 최신 상태를 불러오지 못했습니다. 상세를 다시 불러오세요.",
    emptyTitle: "아직 소스가 없습니다",
    emptyOwner: "문자열이 담긴 파일을 추가하면 Malmoi가 기준 브랜치에서 읽습니다. 첫 동기화가 끝나면 키와 언어가 여기에 나타납니다.",
    emptyEditor: "번역 파일은 프로젝트 소유자가 추가합니다. 그때까지는 번역할 것이 없습니다 — 첫 동기화가 끝나면 여기에 언어가 나타납니다.",
    ownerOnly: "프로젝트 소유자만 소스를 추가할 수 있습니다.",
    askOwner: "프로젝트 소유자에게 첫 동기화를 실행해 달라고 요청하세요.",
    askOwnerRerun: "프로젝트 소유자에게 동기화를 다시 실행해 달라고 요청하세요.",
    reconnectOwner: "설정에서 리포지토리를 다시 연결한 뒤 다시 시도하세요.",
    reconnectEditor: "프로젝트 소유자에게 리포지토리를 다시 연결해 달라고 요청하세요.",
    firstImport: "첫 동기화가 아직 끝나지 않았습니다. 소스를 추가해도 그 CI 워크플로가 연결되지는 않습니다.",
    noLanguages: "사용할 수 있는 활성 언어가 없습니다. 리포지토리에서 언어를 복원한 뒤 다시 동기화하세요.",
    applied: "적용됨",
    requested: "요청됨",
    waiting: "적용 대기 중",
    pendingHelp: "CI가 이 소스의 기준 언어를 넘긴다면 워크플로 항목을 요청한 언어로 고치세요.",
    orphanReason: "이 언어는 리포지토리에서 제거됐습니다.",
    orphanStrip: (code: string): string => `${code} 언어는 리포지토리에서 제거됐습니다.`,
    orphanStripRest: (translations: number, active: number): string =>
      `번역 ${translations.toLocaleString("ko-KR")}개는 보존되며 읽기 전용입니다. 리포지토리에 이 언어가 다시 생기고 다음 동기화가 실행되면 돌아옵니다. 활성 언어 ${active.toLocaleString("ko-KR")}개에는 세지 않습니다.`,
    statusHelp: "리포지토리에서 오는 동기화로 갱신됩니다.",
    baseHelp: "기준 언어가 이 소스에 어떤 키가 있는지 정합니다.",
    languagesHelp: "언어는 리포지토리에서 옵니다. 파일 추가·제거는 리포지토리에서 하세요.",
    baseRow: "이 파일의 모든 키의 출처",
    needReview: (count: number): string => `${count.toLocaleString("ko-KR")}개 검토 필요`,
    missingRepo: "리포지토리에서 제거됨",
    editorBase: "프로젝트 소유자만 소스의 기준 언어를 바꿀 수 있습니다.",
    readOnlyNote: "이름, 경로, 파일 형식은 리포지토리에서 읽습니다.",
    started: "시작",
    addedAgo: "추가",
    lastSuccess: "마지막 동기화 성공",
    archivedOwner: "번역은 보존됩니다. 프로젝트를 복원할 때까지 동기화가 멈추고 소스를 보거나 바꿀 수 없습니다.",
    archivedEditor: "번역은 보존됩니다. 프로젝트 소유자가 복원할 수 있으며, 그때 소스와 번역이 돌아옵니다.",
    discardTitle: "기준 언어 변경을 버리시겠습니까?",
    discardBody: (requested: string, applied: string): string =>
      `${requested} 언어를 골랐지만 저장하지 않았습니다. 기준 언어는 ${applied} 언어로 유지됩니다.`,
    keepEditing: "계속 편집",
    discardChange: "변경 버리기",
    importedSummary: (keys: number, locales: number): string =>
      `리포지토리에서 읽은 활성 키 ${keys.toLocaleString("ko-KR")}개, 언어 ${locales.toLocaleString("ko-KR")}개.`,
    notImportedHelp: "이 파일에서 아직 키나 언어가 들어오지 않았습니다. 소스를 추가해도 CI가 저절로 연결되지는 않습니다 — 문자열은 리포지토리의 워크플로가 보냅니다.",
    workflow: "설정에서 워크플로를 고쳐 추가한 소스를 포함하세요.",
    addedCount: (count: number): string => `소스 ${count.toLocaleString("ko-KR")}개 추가됨`,
    addedOne: (count: number): string => `키 ${count.toLocaleString("ko-KR")}개 동기화됨`,
    // 결과 줄 `{slug} 동기화 실패` 조각 — 동기화 실패의 배지 낱말이다.
    addedFailed: "동기화 실패",
    resultKeep: "아래 상태가 바뀌어도 결과가 사라지지 않도록 닫을 때까지 남아 있습니다.",
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
      help: "소스 문자열을 쓴 언어입니다. 바꾸면 동기화 버튼이 아니라 리포지토리의 GitHub Actions 워크플로가 다음에 동기화할 때 적용됩니다 — 워크플로의 base-locale: 값도 맞게 고치세요.",
      save: "저장",
      saving: "저장 중…",
      saved: "저장됨",
      failed: "저장하지 못했습니다. 잠시 뒤 다시 시도하세요.",
      noLocales: "첫 동기화가 끝난 뒤 설정할 수 있습니다.",
    },
    pending: {
      copy: "줄 복사",
    },
  },

  members: {
    loading: "멤버를 불러오는 중…",
    seats: (n: number, limit: number): string => `좌석 ${limit}개 중 ${n}개`,
    seatsFull: (limit: number): string => `좌석 ${limit}개 중 ${limit}개 — 초대하려면 멤버를 제거하세요`,
    ownerOnly: "프로젝트 소유자만 초대하거나 역할을 바꿀 수 있습니다",
    count: (n: number): string => `멤버 ${n}명`,
    unreadableLabel: UNAVAILABLE,
    unreadableHint: "이 사람의 이름과 주소를 복호화하지 못했습니다. 역할과 가입일에는 영향이 없습니다.",
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
    confirmRemove: (who: string): string => `${who} 님을 이 프로젝트에서 제거하시겠습니까?`,
    confirmRemoveHint: "즉시 접근 권한을 잃습니다. 번역은 남고, 이력에 이름도 남습니다.",
    cancel: "취소",
    changeFailed: "변경을 적용하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도하세요.",
    confirmRole: (who: string, role: string): string => `${who} 님의 역할을 ${role} 역할로 바꾸시겠습니까?`,
    confirmRoleHint: "새 역할은 즉시 적용됩니다.",
    confirmSelfDemote: "즉시 멤버와 설정을 관리할 수 없게 되며, 프로젝트 소유자만 그 권한을 되돌려 줄 수 있습니다.",
    confirmRoleAction: "역할 변경",
    changeUnconfirmed: "변경을 확인하지 못했습니다. 새로 고쳐 현재 멤버를 확인하세요.",

    invite: {
      open: "멤버 초대",
      title: "멤버 초대",
      description: "이메일로 초대를 보내고 사람마다 역할을 고르세요. 그 사람이 로그인하는 주소를 쓰세요 — GitHub이면 기본(primary) 이메일입니다.",
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
      seatsUsed: (n: number, limit: number): string => `좌석 ${limit}개 중 ${n}개 사용`,
      rowError: {
        invalidEmail: "이메일 주소 형식이 아닙니다.",
        invalidRole: "이 주소의 역할을 고르세요.",
        duplicate: (row: number): string => `이미 ${row.toLocaleString("ko-KR")}번째 행에 있습니다. 이 행을 제거하세요.`,
        roleConflict: (row: number, role: string): string => `${row.toLocaleString("ko-KR")}번째 행에도 ${role} 역할로 있습니다. 이 주소에는 역할을 하나만 남기세요.`,
      },
      alreadyMember: "이 이메일은 이미 이 프로젝트의 멤버입니다.",
      limit: {
        title: "초대 한도를 넘게 됩니다",
        project: (limit: number, used: number, n: number, time: string): string =>
          `프로젝트는 한 시간에 초대를 ${limit.toLocaleString("ko-KR")}건까지 만들 수 있고, 지난 한 시간 동안 ${used.toLocaleString("ko-KR")}건을 만들었습니다. ${n === 1 ? "이 초대는" : `이 ${n.toLocaleString("ko-KR")}건은`} ${time} 이후에 보낼 수 있습니다.`,
        address: (email: string, time: string): string => `${email} 주소는 1분 이내에 초대됐습니다. ${time} 이후에 다시 보낼 수 있습니다.`,
        user: (limit: number, used: number, n: number, time: string): string =>
          `모든 프로젝트를 합쳐 한 시간에 초대를 ${limit.toLocaleString("ko-KR")}건까지 만들 수 있고, 지난 한 시간 동안 ${used.toLocaleString("ko-KR")}건을 만들었습니다. ${n === 1 ? "이 초대는" : `이 ${n.toLocaleString("ko-KR")}건은`} ${time} 이후에 보낼 수 있습니다.`,
      },
      tooMany: (limit: number): string => `한 번에 최대 ${limit.toLocaleString("ko-KR")}명까지 초대할 수 있습니다.`,
      unconfirmed: {
        title: "이메일 요청을 확인하지 못했습니다",
        body: "일부 초대가 보내졌을 수 있습니다. 다시 보내면 이전 링크를 대체합니다.",
      },
      sendFailed: "초대 이메일을 보내지 못했습니다. 다시 보내면 이번 시도의 링크를 대체합니다.",
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
      resendLimited: (who: string, time: string): string => `${who} 주소는 1분 이내에 초대됐습니다. ${time} 이후에 다시 보낼 수 있습니다.`,
      resendProjectLimited: (who: string, limit: number, time: string): string =>
        `${who} 주소로 다시 보내지 못했습니다: 이 프로젝트가 지난 한 시간 동안 초대를 ${limit.toLocaleString("ko-KR")}건 만들었습니다. ${time} 이후에 다시 보낼 수 있습니다.`,
      resendUserLimited: (who: string, limit: number, time: string): string =>
        `${who} 주소로 다시 보내지 못했습니다: 지난 한 시간 동안 모든 프로젝트를 합쳐 초대를 ${limit.toLocaleString("ko-KR")}건 만들었습니다. ${time} 이후에 다시 보낼 수 있습니다.`,
      resendUnconfirmed: (who: string): string => `${who} 주소로 보낸 이메일을 확인하지 못했습니다. 보내졌을 수 있습니다 — 다시 보내면 그 링크를 대체합니다.`,
      resendUnavailable: (who: string): string => `${who} 주소로 다시 보내지 못했습니다. 지금은 이메일을 보낼 수 없습니다. 나중에 다시 시도하세요.`,
      gone: (who: string): string => `${who} 주소로 보낸 초대는 더 이상 대기 중이 아닙니다.`,
      resendError: (who: string): string => `${who} 주소로 초대를 다시 보내지 못했습니다. 페이지를 새로고침한 뒤 다시 시도하세요.`,
      revoke: "철회",
      revokeLabel: (who: string): string => `${who} 주소의 초대 철회`,
      revoked: (who: string): string => `${who} 주소의 초대를 철회했습니다`,
      revokeFailed: "초대를 철회하지 못했습니다. 페이지를 새로고침한 뒤 다시 시도하세요.",
      confirmRevoke: (who: string): string => `${who} 주소의 초대를 철회하시겠습니까?`,
      confirmRevokeHint: "링크는 즉시 작동을 멈춥니다. 같은 주소를 다시 초대할 수 있습니다.",
      confirmRevokeAction: "초대 철회",
      revokeUnconfirmed: "초대가 철회됐는지 확인하지 못했습니다. 새로 고쳐 확인하세요.",
      empty: {
        title: "대기 중인 초대 없음",
        description: "초대한 사람이 모두 가입했거나 링크가 만료됐습니다.",
      },
    },
  },

  settings: {
    loading: "설정을 불러오는 중…",
    general: {
      title: "일반", thumbnail: "썸네일", name: "이름", address: "주소",
      upload: "업로드", remove: "제거",
      caption: "PNG 또는 JPEG, 최대 3MB.",
      emptyName: "프로젝트 이름을 입력하세요.", longName: "200자 이하로 쓰세요.",
      busy: "썸네일을 바꾸는 중…",
    },
    sources: {
      add: "소스 추가", locked: "이미 소스임",
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
    },
    ci: { description: "머지할 때마다 워크플로가 소스 문자열을 Malmoi로 보냅니다.", title: "CI 연동", workflow: "워크플로 파일", sourcesLead: "워크플로 하나가 모든 소스를 다룹니다. 소스를 추가하거나 바꾸는 곳:", stale: "일부 소스가 아직 동기화되지 않았습니다. 워크플로에 포함됐는지 확인하세요.",
      noSources: "워크플로를 받으려면 소스를 추가하세요." },
    archivedReason: "설정을 바꾸려면 이 프로젝트를 복원하세요.",
    recovery: "동기화는 계속 실행됩니다. 이 리포지토리를 다시 연결하거나 소스를 추가하려면 계정에서 GitHub 인가를 관리하세요.",
    accountLink: "계정",
    installed: "이 리포지토리에 Malmoi GitHub App이 설치돼 있습니다.",
    openRepo: "GitHub에서 열기",

    repository: {
      disconnected: "연결 끊김", notConnected: "연결 안 됨", unknown: "확인하지 못함", wrongRepository: "다른 리포지토리",
      movedHint: "새 이름을 저장하려면 다시 연결하세요. 그동안에도 동기화는 계속 작동합니다.",
      paused: "다시 연결할 때까지 동기화와 게시가 멈춥니다. 이미 번역한 것은 모두 안전합니다.",
      title: "리포지토리",
      connect: "연결",
      reconnect: "다시 연결",
      connectFailed: "연결을 시작하지 못했습니다. 잠시 뒤 다시 시도하세요.",
      health: {
        ok: "연결됨",
        "not-connected": "아직 연결된 설치가 없습니다.",
        "app-uninstalled": "앱이 제거 또는 일시 중단됐거나, 이 리포지토리에 대한 앱의 접근 권한이 회수됐습니다.",
        "installation-changed": "앱이 다시 설치됐습니다 — 다시 연결하세요.",
        moved: (fullName: ReactNode): ReactNode => <>이 리포지토리는 {fullName} 리포지토리로 옮겨졌습니다</>,
        "repo-replaced": "이 주소에는 이제 이 프로젝트가 연결됐던 것과 다른 리포지토리가 있습니다. GitHub에서 확인하세요 — 리포지토리가 정말 바뀌었다면 그 리포지토리로 새 프로젝트를 만드세요.",
        unknown: "지금은 확인할 수 없습니다. 잠시 뒤 이 페이지를 다시 여세요.",
        install: "앱 설치",
        installHint: "앱을 설치한 뒤 여기로 돌아와 다시 연결하세요.",
      },

      fields: {
        branch: "기준 브랜치",
        branchHelp: "동기화는 이 브랜치를 읽고, 풀 리퀘스트는 이 브랜치를 대상으로 열립니다.",
        branchDisconnected: "기준 브랜치를 바꾸려면 리포지토리를 다시 연결하세요.",
        save: "저장",
        saved: "저장됨",
        failed: "저장하지 못했습니다. 잠시 뒤 다시 시도하세요.",
      },

    },

    status: {
      unconfirmed: "동기화가 끝났는지 확인하지 못했습니다.",
    },

    token: {
      title: "푸시 토큰",
      description: (secret: ReactNode): ReactNode => (
        <>
          교체하면 지금 토큰이 즉시 무효가 됩니다 — 리포지토리의 {secret} 시크릿을 갱신할 때까지 CI가
          실패합니다.
        </>
      ),
      rotate: "토큰 교체",
      disconnected: "토큰을 교체하려면 리포지토리를 다시 연결하세요.",
      warning: "이 페이지를 떠나면 다시 볼 수 없습니다. 잃어버리면 다시 교체하세요.",
      failed: "토큰을 교체하지 못했습니다. 잠시 뒤 다시 시도하세요.",
      unconfirmed: "교체를 확인하지 못했습니다. 지금 토큰은 이미 무효일 수 있습니다 — 새 토큰을 받으려면 다시 교체하세요.",
      confirmTitle: "푸시 토큰을 교체하시겠습니까?",
      confirmBody: "방금 복사한 것을 포함해 지금 토큰이 즉시 작동을 멈춥니다. 리포지토리의 PUSH_TOKEN 시크릿에 새 토큰을 넣을 때까지 CI가 실패합니다.",
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
      connect: "GitHub App 인가",
      reconnect: "GitHub App 다시 인가",
      unavailable: "계정을 불러오지 못했습니다. 잠시 뒤 이 페이지를 다시 여세요.",
      disconnect: "연결 해제",
      disconnectLabel: "GitHub App 연결 해제",
      disconnectConfirm: "앱 연결 해제",
      disconnectFailed: "연결을 해제하지 못했습니다. 잠시 뒤 다시 시도하세요.",
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
    title: "이 이메일에는 이미 계정이 있습니다",
    description: (pending: string, have: string): string =>
      `방금 ${pending} 계정으로 로그인했지만, 이 주소는 ${have} 계정으로 만들어졌습니다.`,
    confirm: (have: string): string => `${have} 계정으로 확인`,
    joined: (month: string): string => `가입 ${month}`,
    footnote: "이 로그인 수단을 그 계정에 추가합니다. 프로젝트와 번역은 그대로 있습니다.",
    methods: {
      title: "로그인 수단",
      count: (connected: number, total: number): string => `${total}개 중 ${connected}개`,
      connect: "연결",
      connectLabel: (provider: string): string => `${provider} 계정을 로그인 수단으로 연결`,
      connected: "연결됨",
      notConnected: "연결 안 됨",
      disconnect: "연결 해제",
      disconnectLabel: (provider: string): string => `${provider} 로그인 수단 연결 해제`,
      lastMethod: "유일한 로그인 수단입니다.",
      confirmDisconnect: (provider: string): string => `${provider} 연결을 해제하시겠습니까?`,
      disconnectConfirm: "로그인 수단 연결 해제",
      confirmHint: "이 주소로 그 수단을 써서 다시 로그인하기 전까지는 그 수단으로 로그인할 수 없습니다.",
      unlinkUnconfirmed: "변경을 확인하지 못했습니다. 새로 고쳐 로그인 수단을 확인하세요.",
    },
  },

  errors: {
    upload: {
      "too-large": "사진이 3MB를 넘습니다. 더 작은 사진을 고르세요.",
      "too-many-pixels": "사진의 가로·세로 크기가 너무 큽니다. 픽셀 수가 더 적은 사진을 고르세요.",
      "unsupported-type": "올바른 PNG 또는 JPEG 파일이 아닙니다. 다른 사진을 고르세요.",
      "not-a-file": "받은 사진이 없습니다. 파일을 고른 뒤 다시 시도하세요.",
      empty: "빈 파일입니다. 다른 파일을 고르세요.",
      unavailable: "사진을 저장하지 못했습니다. 잠시 뒤 다시 시도하세요.",
      fallback: "이 사진을 쓸 수 없습니다. 3MB 이하의 PNG 또는 JPEG를 고르세요.",
    },
    connectMethod: {
      connected: "로그인 수단을 추가했습니다. 다음 로그인부터 쓸 수 있습니다.",
      "email-mismatch": "이메일이 이 계정과 일치하지 않습니다. 같은 인증된 이메일을 쓰는 계정으로 시도하세요.",
      "already-connected": "이미 추가된 로그인 수단입니다. 이 수단으로 로그인할 수 있습니다.",
      "taken-by-other": "이 로그인 수단은 다른 Malmoi 계정에 속해 있습니다. 다른 계정으로 시도하세요.",
      expired: "이 요청은 만료됐거나 새 요청으로 대체됐습니다. 로그인 수단 목록에서 다시 시작하세요.",
      cancelled: "로그인 수단 추가가 취소됐습니다. 준비되면 다시 시작하세요.",
      unverified: "인증된 이메일이 전달되지 않았습니다. 다시 시도하기 전에 해당 서비스에서 이메일을 인증하세요.",
      "wrong-user": "요청 중에 세션이 바뀌었습니다. 로그인 수단 목록에서 다시 시작하세요.",
      failed: "로그인 수단을 추가하지 못했습니다. 잠시 뒤 다시 시도하세요.",
    },
    access: {
      unauthorized: "세션이 끝났습니다. 작업을 저장하려면 다시 로그인하세요.",
      forbidden: "이 작업을 할 권한이 없습니다. 프로젝트 소유자에게 요청하세요.",
      "not-found": "이 프로젝트를 열 수 없습니다. 초대 링크를 확인하세요.",
      "last-owner": "프로젝트에는 소유자가 한 명 이상 있어야 합니다. 먼저 다른 사람을 소유자로 지정하세요.",
      "not-member": "그 사람은 이 프로젝트의 멤버가 아닙니다.",
      unavailable: "문제가 생겼습니다. 잠시 뒤 다시 시도하세요.",
      archived: "이 프로젝트는 보관됐습니다. 프로젝트 소유자가 설정에서 복원할 수 있습니다.",
      "owner-limit-reached": (limit: number): string =>
        `한 사람은 활성 프로젝트를 최대 ${limit}개까지 소유할 수 있는데, 이 프로젝트의 누군가가 이미 ${limit}개 이상을 소유하고 있습니다. 그 사람이 먼저 프로젝트를 보관해야 합니다.`,
    },

    invite: {
      unauthorized: "로그아웃된 상태입니다. 로그인하면 이 링크로 돌아옵니다.",
      "not-found": "존재하지 않는 초대입니다. 링크가 잘못됐거나 초대가 철회됐습니다.",
      expired: "초대가 만료됐습니다. 초대한 사람에게 새 링크를 요청하세요.",
      "already-accepted": "이미 사용된 링크입니다. 초대는 한 번만 쓸 수 있습니다.",
      "email-mismatch": "초대받은 계정으로 로그인하세요. 지금 계정은 초대받은 계정이 아닙니다.",
      "already-member": "이미 이 프로젝트의 멤버입니다.",
      archived: "이 프로젝트는 보관됐습니다. 초대한 사람에게 복원을 요청한 뒤 이 링크를 다시 여세요.",
      "limit-reached": (limit: number): string =>
        `이미 활성 프로젝트를 ${limit}개 이상 소유하고 있습니다. 소유한 프로젝트가 ${limit}개보다 적어질 때까지 보관한 뒤 이 링크를 다시 여세요.`,
      unavailable: "문제가 생겼습니다. 잠시 뒤 다시 시도하세요.",
      fallback: "초대를 수락하지 못했습니다. 초대한 사람에게 새 링크를 요청하세요.",
    },

    link: {
      "wrong-account": "다른 계정입니다. 이 주소를 만든 계정을 고른 뒤 다시 시도하세요.",
      "already-linked": "이 로그인 수단은 이미 이 계정에 있습니다. 그 수단으로 로그인해 보세요.",
      invalid: "확인을 끝내지 못했습니다. 로그인 화면에서 다시 시작하세요.",
      cancelled: "확인이 취소됐습니다. 바뀐 것은 없습니다 — 준비되면 다시 시도하세요.",
      unavailable: "문제가 생겼습니다. 잠시 뒤 다시 시도하세요.",
      "last-method": "유일한 로그인 수단은 연결을 해제할 수 없습니다.",
      fallback: "확인을 끝내지 못했습니다. 다시 시도하세요.",
    },

    signIn: {
      OAuthAccountNotLinked: "이 이메일은 이미 다른 로그인 수단으로 등록돼 있습니다. 가입할 때 쓴 수단을 쓰세요.",
      AccessDenied: "이 계정으로는 로그인할 수 없습니다. 이메일이 인증되지 않았을 수 있습니다.",
      Unavailable: "문제가 생겼습니다. 잠시 뒤 다시 열어 보세요.",
      LinkExpired: "이 확인은 더 이상 유효하지 않습니다. 계속하려면 다시 로그인하세요.",
      fallback: "로그인하지 못했습니다. 잠시 뒤 다시 시도하세요.",
    },

    connect: {
      "state-mismatch": "연결 요청을 검증하지 못했습니다. 다시 시작하세요.",
      "state-expired": "연결 요청이 만료됐습니다. 다시 시작하세요.",
      "wrong-user": "다른 계정으로 시작한 요청입니다. 연결을 다시 시작하세요.",
      denied: "GitHub에서 연결이 취소됐습니다. 계속하려면 다시 시작하세요.",
      "exchange-failed": "GitHub 연결을 끝내지 못했습니다. 다시 시작하세요.",
      "taken-by-other": "이 GitHub 계정은 이미 다른 사용자에게 연결돼 있습니다. 그 사용자가 연결을 해제하면 쓸 수 있습니다.",
      // 가리키는 버튼 이름은 `settings.account.connect`·`reconnect`와 같은 글자여야 한다.
      "not-connected": "먼저 Malmoi GitHub App을 인가하세요 — 아래의 GitHub App 인가를 쓰세요.",
      reauthorize: "GitHub App 인가가 만료됐습니다. GitHub App 다시 인가를 쓰세요.",
      "repo-not-installed": "이 리포지토리에 앱이 설치돼 있지 않습니다. 설치한 뒤 다시 연결하세요.",
      "installation-forbidden": "이 계정으로는 그 설치에 접근할 수 없습니다. 리포지토리 소유자에게 접근 권한을 요청하세요.",
      "repo-forbidden": "이 계정으로는 그 리포지토리에 접근할 수 없습니다. 리포지토리 소유자에게 접근 권한을 요청하세요.",
      "repo-read-only": "이 계정은 그 리포지토리를 읽기만 할 수 있습니다. 연결하려면 쓰기 권한이 필요합니다 — 리포지토리 소유자에게 요청하세요.",
      unavailable: "문제가 생겼습니다. 잠시 뒤 다시 시도하세요.",
      fallback: "GitHub 연결에 실패했습니다. 다시 시도하세요.",
    },

    onboarding: {
      "no-installations": "GitHub 계정이 연결됐습니다. 리포지토리를 고르려면 개인 계정이나 조직에 Malmoi GitHub App을 설치하세요.",
      "no-repos": "GitHub 계정이 연결됐지만 쓸 수 있는 리포지토리가 없습니다. GitHub 설치 설정에서 Malmoi GitHub App이 접근할 리포지토리를 고르세요.",
      "no-candidates": "지원하는 번역 파일을 찾지 못했습니다. 파일 형식과 경로를 확인한 뒤 다시 시도하세요.",
      "tree-truncated": "이 리포지토리는 파일이 너무 많아 검색할 수 없고, 경로를 직접 지정해도 같은 한도에 걸립니다. Malmoi는 아직 이렇게 큰 리포지토리를 연결할 수 없습니다.",
      "base-branch-missing": "기본 브랜치를 읽을 수 없습니다. 리포지토리에 커밋이 있는지 확인하세요.",
      // 라벨이라 문장이 아니다 — 후보 줄의 개수 자리에 그대로 들어간다.
      "key-count-failed": "키 개수를 알 수 없음",
      "manual-no-match": "그 경로에 해당 형식의 파일이 없습니다. 경로와 형식을 확인하세요.",
      "sample-expired": "이 미리보기는 만료됐습니다. 보려면 파일을 다시 찾으세요.",
      "slug-taken": "이미 쓰이는 주소입니다. 다른 주소를 고르세요.",
      "limit-reached": (limit: number): string => `프로젝트는 최대 ${limit}개까지 만들 수 있습니다.`,
      "invalid-slug": (max: number): string =>
        `주소에는 영문 소문자, 숫자, '-', '.', '_'를 최대 ${max}자까지 쓸 수 있습니다. 'new'는 예약돼 있습니다.`,
      "invalid-branch": "올바른 브랜치 이름이 아닙니다. 다른 브랜치를 고르세요.",
      "sync-branch": "Malmoi가 그 브랜치에서 번역을 게시하므로 기준 브랜치로 쓸 수 없습니다. 다른 브랜치를 고르세요.",
      "not-awaiting": "첫 동기화는 이미 끝났습니다. 여기서 다시 실행하면 편집한 번역을 덮어쓰게 되므로 막혀 있습니다.",
      "resource-limit": "번역 파일이 너무 크거나 너무 깊게 중첩돼 동기화할 수 없습니다. 크기를 줄인 뒤 다시 시도하세요.",
      "ingest-failed": "첫 동기화에 실패했습니다. 소스에서 다시 시도할 수 있습니다.",
      "not-ready": "이 프로젝트는 아직 준비되지 않았습니다. 프로젝트 소유자가 설정을 마쳐야 합니다.",
      unauthorized: "세션이 끝났습니다. 다시 로그인한 뒤 처음부터 시작하세요.",
      fallback: "프로젝트를 만들지 못했습니다. 처음부터 다시 시도하세요.",
    },

    repositorySettings: {
      "invalid-branch": "올바른 브랜치 이름이 아닙니다. 공백과 ~^:?*[ 문자는 쓸 수 없습니다.",
      "sync-branch": "Malmoi가 그 브랜치에서 번역을 게시하므로 기준 브랜치로 쓸 수 없습니다. 다른 브랜치를 고르세요.",
      "unknown-locale": "이 리포지토리에는 그 언어의 번역 파일이 없습니다.",
      "orphaned-locale": "그 언어의 파일이 리포지토리에서 사라졌습니다. 먼저 파일을 되돌려 놓으세요.",
    },
  },

  adapterErrors: {
    "parse-failed": "파일을 파싱하지 못했습니다.",
    "parse-crashed": "이 파일에서 파서가 실패했습니다.",
    "root-not-object": "파일의 최상위가 키-값 맵이 아닙니다.",
    "no-default-export": "이 파일에 default export 객체가 없습니다.",
    "invalid-chrome-key": "키에 chrome.i18n이 허용하지 않는 문자가 있습니다(허용: A-Z a-z 0-9 _ @).",
    "missing-message-field": "항목에 'message' 필드가 없습니다.",
    "value-not-message-object": "값이 { message } 객체가 아닙니다.",
    "value-not-string": "값이 텍스트가 아닙니다.",
    "value-not-string-or-container": "값이 텍스트, 객체, 배열 중 어느 것도 아닙니다.",
    "value-not-string-literal": "값이 일반 텍스트 리터럴이 아닙니다.",
    "shorthand-property": "단축 속성이라 값을 읽을 수 없습니다 — 다른 모듈에서 들여온 참조로 보입니다.",
    "not-property-assignment": "속성 할당이 아닙니다.",
    "duplicate-key": "키가 두 번 나와서 두 값 중 하나를 잃습니다.",
    "duplicate-property": "키가 두 번 정의돼 있습니다. Malmoi는 편집하는 쪽을 쓰고 다른 쪽은 그대로 둡니다.",
    "key-shadowed": "이 키는 더 긴 키의 앞부분이라 자기 자리가 없습니다 — 이 값은 쓰지 않았습니다.",
    "write-parse-failed": "파일을 파싱하지 못해 손대지 않았습니다.",
    "write-no-default-export": "이 파일에 default export 객체가 없어 손대지 않았습니다.",
    "write-locale-object-missing": "이 언어가 파일에 없어 번역을 쓰지 않았습니다.",
    "write-slot-not-string-literal": "값이 일반 텍스트 자리에 있지 않아 쓰지 않았습니다.",
    "write-slot-not-scalar": "값이 일반 텍스트 자리에 있지 않아(별칭, 맵 또는 목록) 쓰지 않았습니다.",
    "write-slot-missing": "이 키를 넣을 자리가 없어 건너뛰었습니다 — 파일 구조를 바꿔야 합니다.",
    "original-file-missing": "원래 파일이 리포지토리에 없어 이 언어를 건너뛰었고 보내지 않았습니다.",
    "download-failed": "파일을 내려받지 못했습니다.",
    fallback: "이 파일을 읽지 못했습니다.",
  },
} satisfies Messages;
