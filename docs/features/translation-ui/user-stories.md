# translation-ui — 라우트별 사용자 스토리와 화면 구성

> 라우트 하나가 한 절이다. 각 절은 **누가·왜(스토리) → 화면 구성(와이어) → 상태 → 인가 게이트** 순서다.
> 스토리는 "As a …, I want …, so that …" 형이고 **UI 문구는 영어**(spec §2.4 결정), 설명은 한국어다.
> 시각 값(색·간격·컴포넌트)은 [DESIGN.md](../../DESIGN.md)이고 여기엔 **무엇이 어디에 있는가**만 적는다.
>
> 역할은 둘이다 — **OWNER**(개발자) · **EDITOR**(번역 편집자). 로그인 provider는 역할을 정하지 않는다 (SAAS §3).

## 0. 앱 셸 — 모든 `(edit)` 라우트가 공유한다

```
┌──────────────┬────────────────────────────────────────────────────────────────┐
│ ◆ Malmoi     │ Projects / bugshot-2 / Translations              ● 강신혁 ▾   │  ← top bar: breadcrumb + user menu
│              ├────────────────────────────────────────────────────────────────┤
│ ▣ bugshot-2 ▾│                                                                │  ← project switcher (현 프로젝트 안에서만)
│              │                                                                │
│  Translations│                    <page content>                              │
│  Members     │                                                                │
│  Settings    │                                                                │
│              │                                                                │
│ ─────────────│                                                                │
│  All projects│                                                                │
│  Account     │                                                                │
│  Sign out    │                                                                │
│ ⟨ Collapse   │                                                                │
└──────────────┴────────────────────────────────────────────────────────────────┘
```

- **좌측 사이드바** (GitLab super sidebar 형): 최상단 브랜드, 그 아래 **프로젝트 컨텍스트**(현 프로젝트 이름 + 전환
  메뉴 — 내 멤버십 목록), 그 아래 섹션 셋. 하단은 전역 항목(All projects · Account · Sign out) + Collapse.
- **프로젝트 밖 라우트**(`/projects`·`/projects/new`·`/account`)에서는 프로젝트 컨텍스트 블록이 없고 전역 항목만 있다.
- **Members·Settings는 OWNER에게만 렌더**한다. 감추는 것은 편의이고 방어는 각 페이지의 `requireProjectAccess`다.
- **Publish 버튼은 셸에 없다** — 번역 화면 툴바다 (SAAS §7.7). 셸은 `/projects` 목록도 감싸므로 slug를 모른다.
- **top bar**는 breadcrumb + 사용자 메뉴(이름/이메일 → Account · Sign out)만이다. GitLab의 검색·`+`·카운터는 우리에게
  대응물이 없어 **넣지 않는다** — 기능 밀도를 가져오지 않는다.
- 사이드바는 `xl` 이상에서만 아이콘 레일로 접히고(Collapse), `xl` 미만에서는 햄버거로 여는 오버레이다 (DESIGN §6.5).
  Collapse 상태는 `localStorage`에만 남는다(서버 저장 없음).

스토리:
- As **any member**, I want the same left navigation on every page, so that I always know which project I am in
  and how to get to the others.
- As an **EDITOR**, I want to see only the sections I can open, so that I never land on a page that says "not found".

## 1. `/` — Sign in

```
┌───────────────────────────────┬───────────────────────────────┐
│ ◆ Malmoi                      │ ░░░░░░ dot-grid gradient ░░░░░ │
│                               │ ░░                         ░░ │
│  Sign in to Malmoi            │ ░░  ┌─ l10n/sync-bugshot ─┐░░ │
│  Translations that go back to │ ░░  │ ✓ ko.json  +3 −0    │░░ │
│  your repository as one PR.   │ ░░  │ ✓ fr.json  +1 −0    │░░ │
│                               │ ░░  └─────────────────────┘░░ │
│  [ G  Continue with Google  ] │ ░░                         ░░ │
│  [ ⌥  Continue with GitHub  ] │ ░░  Edit in the browser.   ░░ │
│                               │ ░░  Ship as a pull request.░░ │
│  ⚠ Sign-in error line (if ?error=) │ ░░░░░░░░░░░░░░░░░░░░░░░░░░ │
└───────────────────────────────┴───────────────────────────────┘
```

- 좌: 브랜드 + 제목 + 한 줄 설명 + provider 버튼 둘(`default` variant, 아이콘 좌측) + 거부/장애 문구 자리.
- 우: 장식 패널(CSS dot-grid + 연보라 그라디언트 — 스크린샷 2의 GitLab 가입 화면 형). 안에는 **정적** 모형 카드
  하나(PR로 돌아가는 로케일 파일). 이미지 파일을 두지 않는다 — 전부 CSS/SVG 인라인.
- `lg` 미만: 우측 패널이 사라지고 좌측이 가운데 정렬 카드가 된다 (로그인은 셸 밖이라 사이드바 기준과 무관하다).
- **세션이 있으면 `/projects`로 redirect** (지금과 같다). `?error=Unavailable`은 "Temporary problem — try again in a
  moment"이고 **재로그인을 시키지 않는다** (ARCHITECTURE §6.1.2).

스토리:
- As a **new visitor**, I want to understand what this tool does before I sign in, so that I know why it asks for a
  GitHub or Google account.
- As a **returning user**, I want sign-in to take one click, so that I get to my translations without a form.
- As a **user during an outage**, I want to be told it is temporary, so that I do not re-authenticate in a loop.

## 2. `/projects` — Your projects

```
Projects                                                        [ + New project ]
┌────────────────────────────────────────────────────────────────────────────────┐
│ ▣  bugshot-2                          owner/bugshot-2       OWNER               │
│    903 keys · 3 locales · Last published 2 days ago                              │
├────────────────────────────────────────────────────────────────────────────────┤
│ ▣  format-check-yaml                  owner/i18n-format-check  EDITOR           │
│    ◌ Waiting for first import                                                    │
└────────────────────────────────────────────────────────────────────────────────┘
```

- 행 = 프로젝트. 아바타(이니셜) · 이름(→ `/projects/:slug/translations`) · 리포 `owner/name`(mono) · 내 역할 배지 ·
  둘째 줄에 요약 또는 **readiness 라벨**(`ready`면 표시 없음 — 가장 흔한 상태가 조용하다).
- **빈 상태**: EmptyState("No projects yet" + "Connect a repository to start translating." + [New project]).
- `?e=` 거부 사유는 목록 위 Alert 한 줄 (`isAccessError`·`isConnectError` 둘 다 읽는다 — POSTMORTEM 2026-09-06).
- 정렬은 이름순. 검색·페이지네이션은 없다 (사용자당 프로젝트 3개 제한 — SAAS §8 7단계).

스토리:
- As **any member**, I want to see every project I belong to with my role, so that I pick the right one.
- As an **OWNER**, I want to see which projects are still waiting for their first import, so that I finish setup.
- As a **user redirected here after a denial**, I want to read *why* in one line, so that the button I pressed does
  not look broken.

## 3. `/projects/new` — New project

②~⑥은 한 라우트의 클라이언트 상태 기계다 (`features/project-onboarding/design.md` §2 — **바꾸지 않는다**).
바뀌는 것은 폼의 모양과 문구다.

```
Projects / New project

New project
Connect a repository, confirm where its locale files live, and import them.

┌ 1. Repository ───────────────────────────────────────────────┐
│ [ Filter repositories…            ]                          │
│ ○ owner/bugshot-2                                            │
│ ● owner/i18n-order-check                        [Detecting…] │
│ Don't see a repository? Add it to the installation ↗          │
└──────────────────────────────────────────────────────────────┘
┌ 2. Locale files ─────────────────────────────────────────────┐
│ ● JSON catalog   src/i18n/{locale}.json   en ko fr   903 keys │
│ ○ Chrome _locales   _locales/{locale}/messages.json   4 keys │
│ ▸ Specify manually                                           │
│ Base language  ● en  ○ ko  ○ fr                              │
└──────────────────────────────────────────────────────────────┘
┌ 3. Name ─────────────────────────────────────────────────────┐
│ Project name  [ bugshot-2            ]                       │
│ URL           /projects/[ bugshot-2  ]  lowercase, ≤ 40 chars│
│                                              [ Create project ]│
└──────────────────────────────────────────────────────────────┘
```

- 섹션 셋이 **아래로 열린다** — ①①'(계정 미연결·설치 0·리포 0)는 서버가 그리는 EmptyState 3갈래로 첫 섹션 자리를 대신한다.
- ⑤⑥(토큰 원문 + 워크플로 YAML + 첫 적재 결과)은 생성 뒤 같은 자리에 **결과 카드**로 나타난다: 토큰 값 칩 + [Copy] ·
  YAML 코드 블록 + [Copy] · "Imported 903 keys" 또는 "Imported 899 keys — 4 files could not be read" + 목록 ·
  [Open translations].
- 대기는 **누른 버튼의 라벨 교체**다 ("Detecting…" — 목록에서 누른 행 하나만). 폼은 disabled.
- 어댑터 내부 이름은 화면에 없다 — 라벨은 서버의 `formatLabel`이 내려준다 (POSTMORTEM 2026-09-07 번들).
- `maxDuration = 60`은 이 페이지 세그먼트에 그대로 있다.

스토리:
- As an **OWNER connecting my first repository**, I want the tool to find my locale files and show me what it found,
  so that I confirm instead of typing paths.
- As an **OWNER**, I want to see the key count per candidate, so that I do not pick a tiny `_locales` over the real
  dictionary (SAAS §7.3 실측).
- As an **OWNER**, I want the push token and workflow YAML right after creation with copy buttons, so that CI works
  on the first try — and I want to be told I cannot see the token again.
- As an **OWNER**, I want to open the translations page before I add the workflow, so that I see value before I
  touch my repository's CI (SAAS §7.4).

## 4. `/projects/:slug/translations` — Translations (핵심 화면)

```
Projects / bugshot-2 / Translations

┌ namespaces ─┬────────────────────────────────────────────────────────────────────────┐
│ Progress: ko▾│ common                   [ Filter keys… ]  ● Needs review ● Untranslated│
│              │ 42 keys · 3 need work                       Last published 2d ago ↗   │
│ All keys  903│                                                        [ Publish (3) ] │
│ ▸ common  3/42│ ⚠ 3 unpublished changes. A code push before you publish will overwrite│
│   header  0/12│   them.                                                          [×]  │
│   settings 8/60│──────────────────────────────────────────────────────────────────────│
│   …          │ Key                    │ en (base)         │ ko                │ fr     │
│              │────────────────────────┼───────────────────┼───────────────────┼────────│
│              │ common.viewAll         │ View all          │ 전체 보기          │ Tout   │
│              │ header.tsx:12 ↗        │                   │ · Edited by 강신혁 │        │
│              │ common.save            │ Save              │ 저장              │        │
│              │                        │                   │ ▪ Needs review    │ Untran.│
│              │ legacy.oldKey  Orphaned│ Old               │ (disabled)        │        │
└──────────────┴────────────────────────────────────────────────────────────────────────┘
```

- **네임스페이스 패널**(좌, 접을 수 있음): 상단에 집계 기준 로케일 선택(`?focus=`), 그 아래 "All keys" + 네임스페이스
  목록. 각 행은 `pending/total`(pending = untranslated + needsReview). 선택 행은 GitLab nav 선택 스타일.
- **기본 착지는 첫 네임스페이스다.** `?ns=` 없음 = 첫 네임스페이스. "All keys"는 `?ns=*`처럼 **명시적** 값이다.
  (903키 12.7초의 답 — SAAS §8 6단계.)
- **툴바**: 제목(네임스페이스) · 키 수 · 남은 일 수 · 텍스트 필터(`?q=`, 키/값 부분 일치) · 상태 필터 토글 둘(`?state=`) ·
  마지막 Publish 링크·시각 · [Publish (N)] — N은 미배포 변경 수.
- **편집 손실 배너**: N > 0일 때만. 닫으면 그 세션 동안만 닫힌다(`sessionStorage`).
- **Publish 결과 Alert**: 툴바 아래 같은 자리에 다섯 갈래 중 하나 — success("Sent for review" + [View pull request]) /
  info("Nothing to publish") / success + 갱신("Updated the open pull request") / **warning**("Sent, but 2 values could not
  be written — tell your developers") / danger("Publish failed: …"). 새로고침하면 Alert는 사라지고 툴바의 마지막 Publish
  링크가 남는다.
- **표**: 키 열(mono + Orphaned 배지 + description + 코드 참조 링크) · 로케일 열(**base 맨 앞**). 셀 = 입력(1행,
  내용에 따라 늘어나는 textarea) + 메타 한 줄(배지: Needs review / Untranslated · 편집자: "Edited by X" —
  `updatedBy`가 없으면 편집자 표기 없음 — push가 덮은 셀이 그 상태다, design §3.6). 저장 상태는 셀 안 `role="status"` 한 줄("Saving…" / "Saved" / "Couldn't save: …")이고 실패 시
  포커스가 그 입력으로 돌아온다.
- **비활성 셀**: 키 orphaned 또는 로케일 orphaned → `disabled` + placeholder "Not editable — removed from the code".
  로케일 orphaned는 열 헤더에도 Orphaned 배지.
- **빈 상태 셋**: 준비 전(EDITOR) "The owner is still setting this project up." / 로케일 없음 / 필터 결과 없음.
  OWNER의 준비 전은 설정으로 redirect (지금과 같다).
- **넓은 표는 자기 컨테이너에서만 가로 스크롤**한다.

스토리:
- As an **EDITOR**, I want to land on one namespace, not all 903 keys, so that the page is usable in under two seconds.
- As an **EDITOR**, I want the source text beside every translation, so that I never switch screens to see context.
- As an **EDITOR**, I want to type into a cell and have it saved when I leave it, and to be told if that failed *where I
  was typing*, so that I do not lose work silently.
- As an **EDITOR**, I want to see which cells need review because the source changed, so that I fix those first.
- As an **EDITOR**, I want to know how many of my changes are not yet published and that a code push could overwrite
  them, so that I publish before the developers push.
- As an **EDITOR**, I want [Publish] to tell me clearly whether it sent something, updated what it sent before, sent
  nothing, dropped some values, or failed — so that I do not press it again guessing.
- As an **EDITOR**, I want the link to what I sent to survive a refresh, so that I can show my developer.
- As **any member**, I want to jump to the line of code that uses a key, so that I understand where it appears.
- As **any member**, I want a cell overwritten by the repository to stop showing a colleague's name, so that the table
  does not lie about who wrote a value.

## 5. `/projects/:slug/members` — Members (신설)

```
Projects / bugshot-2 / Members

Members                                                           [ Invite member ]
┌─────────────────────────────────────────────────────────────────────────────────┐
│ ● 강신혁          s***@day1company.co.kr     Owner ▾     Joined Sep 5    [Remove] │
│ ● Jane Doe        j***@example.com           Editor ▾    Joined Sep 6    [Remove] │
└─────────────────────────────────────────────────────────────────────────────────┘

Pending invitations
┌─────────────────────────────────────────────────────────────────────────────────┐
│ k***@example.com    Editor    Expires in 6 days    invited by 강신혁     [Revoke]  │
└─────────────────────────────────────────────────────────────────────────────────┘
```

- [Invite member] → 인라인 폼(이메일 · 역할 셀렉트 · [Create link]) → 링크 값 칩 + [Copy] + "Share this link
  directly — we don't send email." 링크는 **한 번만** 보인다.
- 역할 변경은 행의 셀렉트(OWNER만 활성), 제거는 [Remove] (확인 모달 한 번). **마지막 OWNER 보호**는 `changeMember`가
  거부하고 그 문구가 행 옆 인라인에 닿는다.
- EDITOR는 **목록만 본다** — 컨트롤이 렌더되지 않고, Action은 `member:manage`로 거부한다.
- 이메일은 **마스킹**한다(`maskEmail`) — 이 표는 멤버 전원이 본다. OWNER도 같다(규칙을 역할로 나누지 않는다).
- 대기 중인 초대: `acceptedAt IS NULL AND expiresAt > now()`. [Revoke]는 신설 Action(`revokeInvitation`, OWNER).

스토리:
- As an **OWNER**, I want to invite a colleague by creating a link I paste into Slack, so that no email infrastructure
  is involved (SAAS §4.3 ①).
- As an **OWNER**, I want to see who has access and change their role or remove them, so that the project's access
  matches the team.
- As an **OWNER**, I want to see and revoke invitations that were never accepted, so that stale links stop working.
- As an **OWNER trying to demote myself as the last owner**, I want to be stopped with a reason, so that the project
  never ends up ownerless.
- As an **EDITOR**, I want to see who else is on the project, so that I know whom to ask.

## 6. `/projects/:slug/settings` — Settings (OWNER)

```
Projects / bugshot-2 / Settings

Repository
  owner/bugshot-2                                     ● Connected      [ Reconnect ]
  The GitHub App reads this repository and opens pull requests on l10n/sync-bugshot-2.
  Base branch    [ main        ]
  Base language  ● en  ○ ko  ○ fr        Defines which keys exist. Changing it changes the key set on the next import.
                                                                        [ Save ]
  ⚠ Update .github/workflows/l10n.yml with the new values — until then CI pushes are rejected.   (저장 뒤에만)

Import status
  Last import: commit a1b2c3d · 2 days ago · 903 keys
  ◌ Waiting for first import                          [ Run first import ]
  Imported 903 keys. / 4 files could not be read: path — message …

Push token
  Your CI sends changes with this token.               [ Regenerate token ]
  ghp-like value shown once ▢ [Copy]  — You won't see this again. Update the repository secret now.

Workflow
  Add this file to your repository as .github/workflows/l10n.yml     [ Copy ]
  ┌ yaml ───────────────────────────────────────────┐

GitHub account
  Connected as @handle · Manage in Account →
```

- 섹션 넷이 **settings-block** 형(제목 + 한 줄 설명 + 본문)이고, 각자 **독립적으로 실패**한다 (건강성은 App 토큰,
  계정은 사용자 토큰 — 묶으면 한쪽 장애에 화면이 통째로 빈다).
- 연결 건강성 6갈래의 색 규칙은 DESIGN §6(상태 배지)을 따른다 — `unknown`을 `app-uninstalled`로 접지 않는다.
- [Run first import]의 결과 컴포넌트는 **readiness 분기 밖**에 있다 (POSTMORTEM 2026-09-07 revalidate).
- 페이지 수준 거부(`?e=`)는 상단 Alert, 컨트롤 실패는 인라인 — 두 층을 섞지 않는다.
- **GitHub 계정 섹션은 상태 한 줄 + `/account` 링크로 줄어든다** (해제는 §7로 이관).
- **Base branch·Base language**는 Repository 블록 안 폼 하나다(Action 하나 `updateRepositorySettings`). 기준 로케일은 orphaned 아닌 기존
  로케일만 고를 수 있다. 저장 성공 시 재생성된 YAML이 Workflow 블록에 반영되고, **CI push가 409로 거부된다는 경고**가 이 블록 안에 남는다
  (design §3.13 — `checkFormat`이 DB와 CI의 base 불일치를 막는다).

스토리:
- As an **OWNER**, I want to see at a glance whether the app can still read my repository and, if not, what exactly
  changed (moved, uninstalled, revoked), so that I fix the right thing.
- As an **OWNER**, I want to regenerate the push token and be warned that the old one stops working immediately,
  so that I update the repository secret in the same sitting.
- As an **OWNER**, I want the workflow YAML with a copy button, so that connecting CI is paste-and-commit.
- As an **OWNER whose repository switched its default branch or its source language**, I want to change the base branch or
  base language here and be told to update the workflow file, so that CI does not silently push against the wrong base.
- As an **OWNER whose first import failed partially**, I want the list of files that could not be read to stay on
  screen, so that dropped values are never hidden as success (SAAS 불변식 9).

## 7. `/account` — Account (신설, 사용자 수준)

```
Account

Profile
  ● 강신혁   sinhyeok@…   Signed in with Google

GitHub
  Connected as @SinhyeokKang — used to list installations you can see.     [ Disconnect ]
  or: Not connected. Connect to create projects from your repositories.    [ Connect GitHub ]
```

- 인가는 **`requireUser`만**이다 — `Account` 행은 사용자 소유다. `disconnectGithub()`은 이미 그렇다(2026-09-07 리뷰 🟡9가 `/projects`에
  계정 섹션으로 먼저 붙였다) — 이 화면은 그 섹션의 **새 집**이다.
- 연결 시작은 5단계의 `startGithubConnectForUser`(state `dest: {kind:"account"}` 추가 — callback이 여기로 돌아온다).
- 로그인 provider 표시는 정보다 — 바꾸는 기능은 없다.
- **`middleware.ts` matcher에 `/account/:path*`를 더한다.**

스토리:
- As a **user who was demoted from owner**, I want to disconnect my GitHub account myself, so that a colleague can
  connect with it (SAAS §8 6단계 — `taken-by-other` 영구 잠금 해소).
- As **any user**, I want to see which GitHub account this tool acts on my behalf with, so that I trust what it lists.

## 8. `/invite/:token` — Accept invitation (셸 밖, 비로그인 허용)

```
        ◆ Malmoi
        You're invited to bugshot-2 as an Editor
        Invitation for k***@example.com
        [ Continue with Google ]  [ Continue with GitHub ]      ← 비로그인
        [ Accept invitation ]                                    ← 로그인 상태
        ⚠ This invitation is for a different email. [Sign in with another account]
```

- 카드 하나, 가운데. 마스킹한 이메일·프로젝트 이름·역할만 보인다 (지금과 같다).
- 실패 분기(`not-found`·`already-accepted`·`expired`·`email-mismatch` 등)는 각자 한 줄 Alert. `email-mismatch`는
  "Sign in with another account"(signOut → 같은 링크) — 없으면 갇힌다.
- **matcher 밖**이다 — 비로그인으로 열려야 토큰이 보존된다.

스토리:
- As an **invited colleague without an account**, I want to sign in from the invitation page and land back on it,
  so that the link I was given just works.
- As an **invitee who signed in with the wrong account**, I want a one-click way to switch, so that I am not stuck.

## 9. 라우트 요약과 게이트

| 라우트 | 셸 | 인가 | matcher | 신설 |
|---|---|---|---|---|
| `/` | 밖 | 세션 있으면 `/projects` | — | |
| `/projects` | 안 (컨텍스트 없음) | `requireUser` | ✓ | |
| `/projects/new` | 안 (컨텍스트 없음) | `requireUser` | ✓ | |
| `/projects/:slug/translations` | 안 | `requireProjectAccess(translation:write)` | ✓ | |
| `/projects/:slug/members` | 안 | `requireProjectAccess(translation:write)` — 컨트롤은 `member:manage` | ✓ | **신설** |
| `/projects/:slug/settings` | 안 | `requireProjectAccess(project:settings)` | ✓ | |
| `/account` | 안 (컨텍스트 없음) | `requireUser` | **추가** | **신설** |
| `/invite/:token` | 밖 | 토큰 (인가 예외) | ✗ (의도) | |
| `/api/github/callback` | — | `requireUser` | ✗ (의도) | `dest` 갈래 `account` 추가 |

`app/__tests__/entry-points.test.ts`가 신설 둘을 자동으로 센다 — `page.tsx`가 `GUARDS` 중 하나를 부르지 않으면 red다.
