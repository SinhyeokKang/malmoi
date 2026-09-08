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
  common: {
    appName: "Malmoi",
  },

  /** T6이 채운다 (로그인 화면). */
  signIn: {},

  projects: {
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
  },

  translations: {
    /** 카운터 — ICU가 아니라 삼항 하나다 (MVP §7). */
    keys: (n: number): string => (n === 1 ? "1 key" : `${n} keys`),

    /**
     * Publish 결과 다섯 (design §3.4). **git 어휘를 쓰지 않는다** — 읽는 사람은 비개발자 동료다.
     * 링크 라벨만 예외가 될 수 있는데(DESIGN §10), 이 자리는 "보낸 것"을 보여주는 것이라 그쪽도 편집자 어휘다.
     */
    publish: {
      nothing: "Nothing to send — everything is up to date.",
      created: "Sent for review. Your developers need to accept it before their next code push.",
      updated: "Updated what you sent earlier with your latest changes.",
      /**
       * ⚠️ **`sent`가 필요하다.** 이 갈래는 `committed`와 `skipped` 둘 다 온다(warnings ≥ 1) — 스킵인데
       * "Sent"라고 쓰면 아무것도 안 보낸 것을 보냈다고 말하게 된다. 갈래는 하나, 문장만 갈린다.
       */
      partial: (count: number, sent: boolean): string =>
        sent
          ? `Sent, but ${count} values couldn't be written — tell your developers.`
          : `Nothing new was sent, and ${count} values couldn't be written — tell your developers.`,
      failed: (reason: string): string => `Couldn't send: ${reason}`,
      viewLink: "View what was sent",
    },
  },

  settings: {
    workflow: {
      /**
       * 문장을 사전이 소유한다 — JSX 노드로 쪼개면 ko가 어순을 바꿀 수 없다 (design §3.1.3).
       */
      saveAs: (path: ReactNode): ReactNode => <>Save this in your repository as {path}.</>,
    },
  },

  /** T8이 채운다 (초대 수락 화면). */
  invite: {},

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
