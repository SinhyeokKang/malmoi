# translation-ui — 라우트별 사용자 스토리와 화면 구성

> 라우트 하나가 한 절이다. 각 절은 **누가·왜(스토리) → 화면 구성(와이어) → 상태 → 인가 게이트** 순서다.
> 스토리는 "As a …, I want …, so that …" 형이고 **UI 문구는 영어**(spec §2.4 결정), 설명은 한국어다.
> 시각 값(색·간격·컴포넌트)은 [DESIGN.md](../../DESIGN.md)이고 여기엔 **무엇이 어디에 있는가**만 적는다.
>
> 역할은 둘이다 — **OWNER**(개발자) · **EDITOR**(번역 편집자). 로그인 provider는 역할을 정하지 않는다 (SAAS §3).
>
> **2026-09-08 `/feature-review`** — §5(멤버)·§7(계정)과 §6의 base 필드는 **6b**다(spec §3.10). 6a의 라우트는 §1·§2·§3·§4·§6·§8 여섯.

## 0. 앱 셸 — 모든 `(edit)` 라우트가 공유한다

```
┌──────────────┬────────────────────────────────────────────────────────────────┐
│ ◆ Malmoi     │                                                  ● 강신혁 ▾   │  ← top bar: user menu만
│              ├────────────────────────────────────────────────────────────────┤
│ ▣ bugshot-2 ▾│ Projects / bugshot-2 / Translations                            │  ← breadcrumb은 페이지 콘텐츠 첫 줄
│              │                                                                │
│  Translations│                    <page content>                              │
│  Settings    │                                                                │
│  (6b Members)│                                                                │
│              │                                                                │
│ ─────────────│                                                                │
│  All projects│                                                                │
│  Sign out    │                                                                │
│ ⟨ Collapse   │                                                                │
└──────────────┴────────────────────────────────────────────────────────────────┘
```

- **좌측 사이드바** (GitLab super sidebar 형): 최상단 브랜드, 그 아래 **프로젝트 컨텍스트**(현 프로젝트 이름 + 전환
  메뉴 — 내 멤버십 목록), 그 아래 섹션 **둘**(6a — Translations · Settings). 하단은 전역 항목(All projects · Sign out) + Collapse.
- **프로젝트 밖 라우트**(`/projects`·`/projects/new`)에서는 프로젝트 컨텍스트 블록이 없고 전역 항목만 있다.
- **Settings는 OWNER에게만 렌더**한다. 6b의 Members는 **전원**에게 렌더한다(EDITOR도 목록을 본다 — §5 스토리). 감추는 것은 편의이고 방어는 각 페이지의
  `requireProjectAccess`다.
- **Publish 버튼은 셸에 없다** — 번역 화면 툴바다 (SAAS §7.7). 셸은 `/projects` 목록도 감싸므로 slug를 모른다.
- **top bar**는 사용자 메뉴(이름/이메일 → Sign out · 6b: Account)만이다. **breadcrumb은 페이지 콘텐츠의 첫 줄**이다 — RSC 레이아웃이 페이지 props를
  못 받는다(design §2). GitLab의 검색·`+`·카운터는 우리에게 대응물이 없어 **넣지 않는다** — 기능 밀도를 가져오지 않는다.
- 사이드바는 `xl` 이상에서만 아이콘 레일로 접히고(Collapse — 접힌 항목은 `aria-label` + Tooltip), `xl` 미만에서는 햄버거로 여는 오버레이다 (DESIGN §6.5).
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
- 우: 장식 패널(CSS dot-grid `--border` + 그라디언트 `from-primary/5 to-muted` — **raw 색 0**, design §3.12 — 스크린샷 2의 GitLab 가입 화면 형). 안에는
  **정적** 모형 카드 하나(리포로 돌아가는 로케일 파일). 이미지 파일을 두지 않는다 — 전부 CSS/SVG 인라인. 모형 카드의 문구도 편집자 어휘다("Ship as a pull request" 대신
  "Sent back to your code").
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
- `?e=` 거부 사유는 **global Alert**(top bar 아래 전폭 — DESIGN §6.4 배치 셋 중 하나. `isAccessError`·`isConnectError` 둘 다 읽는다 — POSTMORTEM 2026-09-06).
- **GitHub 계정 섹션은 6a에서 그대로 여기 남는다**(해제 버튼 포함) — 6b가 `/account`를 만들지 말지 판정한다.
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
│              │ 42 keys · 3 need work      Last sent 2d ago ↗   [Invite] [Send changes (3)]│
│ All keys 11/903│ ✓ Sent for review. Your developers need to accept it … [View what was sent]│
│ ▸ common  3/42│ ⚠ 3 changes not yet sent. They can be lost if your developers push code│
│   header  0/12│   first — send them when you're done.                           [×]  │
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

- **네임스페이스 패널**(좌, 접을 수 있음): 상단에 집계 기준 로케일 선택(`?focus=`), 그 아래 "All keys"(**이 행에도 `pending/total`**) + 네임스페이스
  목록. 각 행은 `pending/total`(pending = untranslated + needsReview). 선택 행은 GitLab nav 선택 스타일.
- **기본 착지는 기준 로케일에서 남은 일이 있는 첫 네임스페이스다.** `?ns=` 없음 = pending>0인 첫 ns(전부 0이면 첫 ns). "All keys"는 `?ns=*`처럼
  **명시적** 값이다. (903키 12.7초의 답 — SAAS §8 6단계. design §3.3.)
- **툴바**: 제목(네임스페이스) · 키 수 · 남은 일 수 · 텍스트 필터(`?q=`, 키/값 부분 일치) · 상태 필터 토글 둘(`?state=`) ·
  마지막으로 보낸 링크·시각("Last sent 2d ago · View what was sent") · [Invite](OWNER만, `ghost` → `Dialog` — 6a 임시, 6b 멤버 화면이 대체) ·
  [Send changes (N)] — N은 아직 보내지 않은 변경 수.
- **Publish 결과 Alert**와 **편집 손실 배너**는 툴바 아래 같은 자리이고 **결과 위·배너 아래** 고정이다.
  - 결과 Alert — 문구 다섯·tone 넷(design §3.4, **편집자 어휘**): success("Sent for review. Your developers need to accept it before their next code push." +
    [View what was sent]) / success("Updated what you sent earlier …") / info("Nothing to send — everything is up to date.") / **warning**("Sent, but 2 values
    could not be written — tell your developers" + `<details>` 파일 목록 — `skipped`여도 warnings가 있으면 이것) / danger("Couldn't send: …"). 새로고침하면
    Alert는 사라지고 툴바의 마지막 링크가 남는다.
  - 배너 — N > 0일 때만. "{n} changes not yet sent. They can be lost if your developers push code first — send them when you're done."(단수형 별도).
    닫기 키는 `lastPulledAt`(`sessionStorage`) — 다음 Publish 뒤 다시 보인다. 클라이언트 마운트 뒤에만 렌더(플래시 방지).
- **표**: 키 열(mono + Orphaned 배지 + description + 코드 참조 링크) · 로케일 열(**base 맨 앞**). 셀 = 입력(1행,
  내용에 따라 늘어나는 textarea — **Enter=저장·Shift+Enter=개행·Esc=되돌리기**) + 메타 한 줄(배지: Needs review / Untranslated · 편집자: "Edited by X" —
  `updatedBy`가 없으면 편집자 표기 없음 — push가 덮은 셀이 그 상태다, design §3.6 · "Not yet sent" 점). 저장 상태는 셀 안 **시각 전용** 한 줄("Saving…" /
  "Saved" / "Couldn't save: … [Retry]")이고, 스크린리더용은 **표 하나에 숨긴 `aria-live` 영역 하나**가 결과만 읽는다. 실패 시 포커스는 **사용자가 다른 셀로 가지
  않았을 때만** 그 입력으로 돌아간다(design §3.8) — 갔으면 [Retry]가 재시도 지점이다.
- **세션 만료 중 저장**: "Your session ended — sign in again. Your text is kept." + 로그인 링크. 장애: "Temporary problem — try again".
- **비활성 셀**: 키 orphaned 또는 로케일 orphaned → `disabled` + placeholder "Not editable — removed from the code".
  로케일 orphaned는 열 헤더에도 Orphaned 배지.
- **빈 상태 넷**: 준비 전(EDITOR) "The owner is still setting this project up." / 로케일 없음 / 필터 결과 없음 "No keys match" / **키 없음 "No keys yet"**(첫 적재가 0키).
  OWNER의 준비 전은 설정으로 redirect (지금과 같다).
- **넓은 표는 자기 컨테이너에서만 가로 스크롤**한다.

스토리:
- As an **EDITOR**, I want to land on one namespace, not all 903 keys, so that the page is usable in under two seconds.
- As an **EDITOR**, I want the source text beside every translation, so that I never switch screens to see context.
- As an **EDITOR**, I want to type into a cell and have it saved when I leave it, and to be told if that failed *where I
  was typing*, so that I do not lose work silently.
- As an **EDITOR**, I want to see which cells need review because the source changed, so that I fix those first.
- As an **EDITOR**, I want to know how many of my changes are not yet sent and that a code push could lose
  them, so that I send them before the developers push.
- As an **EDITOR**, I want [Send changes] to tell me clearly whether it sent something, updated what it sent before, sent
  nothing, dropped some values (and which files), or failed — so that I do not press it again guessing.
- As an **EDITOR who moved on to the next cell**, I want a failed save to tell me without stealing my cursor, so that my
  typing does not land in the wrong cell.
- As an **EDITOR**, I want the link to what I sent to survive a refresh, so that I can show my developer.
- As **any member**, I want to jump to the line of code that uses a key, so that I understand where it appears.
- As **any member**, I want a cell overwritten by the repository to stop showing a colleague's name, so that the table
  does not lie about who wrote a value.

## 5. `/projects/:slug/members` — Members (**6b** — design §3.9 머리의 ⚠️를 반영해 다시 그린다)

> 6b 착수 때 반영할 것: 별도 라우트의 근거를 spec에 적는다(`github-connect/spec.md`는 settings 섹션으로 결정했다) · 사이드바 항목은 전원에게 · [Revoke]는
> `expiresAt = now`(행 삭제 금지) · 대기 초대 0건 빈 상태 · `?e=` global Alert 슬롯 · 역할 변경은 native Select.

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
  (6b) Base branch    [ main        ]
  (6b) Base language  ● en  ○ ko  ○ fr   Defines which keys exist. Changing it changes the key set on the next import.
                                                                        [ Save ]
  (6b) ⚠ Update .github/workflows/l10n.yml with the new values — until then CI pushes are rejected.   (저장 뒤에만)

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
  (6a: 지금 섹션 그대로 — 연결 상태 + [Disconnect])   (6b: Connected as @handle · Manage in Account → — /account를 만든다면)
```

- 섹션 넷이 **settings-block** 형(제목 + 한 줄 설명 + 본문)이고, 각자 **독립적으로 실패**한다 (건강성은 App 토큰,
  계정은 사용자 토큰 — 묶으면 한쪽 장애에 화면이 통째로 빈다).
- 연결 건강성 6갈래의 색 규칙은 DESIGN §6(상태 배지)을 따른다 — `unknown`을 `app-uninstalled`로 접지 않는다.
- [Run first import]의 결과 컴포넌트는 **readiness 분기 밖**에 있다 (POSTMORTEM 2026-09-07 revalidate).
- 페이지 수준 거부(`?e=`)는 **global Alert**, 컨트롤 실패는 인라인(in-block) — 두 층을 섞지 않는다.
- **Base branch·Base language는 6b다** — 🔴 design §3.13 머리의 ⚠️(UI가 base를 바꾸면 야간 pull이 깨진 파일을 낸다 · 재적재는 CI뿐)를 풀고 나서 그린다.
  기준 로케일은 orphaned 아닌 기존 로케일만 고를 수 있고, 저장 성공 시 재생성된 YAML이 Workflow 블록에 반영되며 **CI push가 409로 거부된다는 경고**가 이 블록 안에
  남는다(`checkFormat`이 adapter·pathTemplate·baseLocale 셋을 대조한다).

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

## 7. `/account` — Account (**6b** — 만들지 말지부터, design §3.10)

> 추천은 "만들지 않는다": 계정 섹션은 이미 `/projects`에 있고 `disconnectGithub()`은 사용자 수준이다. 사용자 메뉴의 "GitHub account" 항목이 거기로 간다.
> 만든다면 아래 와이어 — `startGithubConnectForUser`는 무인자라 `dest` 인자 추가가 시그니처 변경이고, `landing`은 callback route의 지역 함수다.

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

| 라우트 | 셸 | 인가 | matcher | 단계 |
|---|---|---|---|---|
| `/` | 밖 | 세션 있으면 `/projects` | — | 6a |
| `/projects` | 안 (컨텍스트 없음) | `requireUser` | ✓ | 6a |
| `/projects/new` | 안 (컨텍스트 없음) | `requireUser` | ✓ | 6a |
| `/projects/:slug/translations` | 안 | `requireProjectAccess(translation:write)` | ✓ | 6a |
| `/projects/:slug/settings` | 안 | `requireProjectAccess(project:settings)` | ✓ | 6a (base 필드는 6b) |
| `/invite/:token` | 밖 | 토큰 (인가 예외) | ✗ (의도) | 6a |
| `/projects/:slug/members` | 안 | `requireProjectAccess(translation:write)` — 컨트롤은 `member:manage` | ✓ | **6b 신설** |
| `/account` | 안 (컨텍스트 없음) | `requireUser` | 추가 | **6b — 만들지 말지부터** |
| `/api/github/callback` | — | `requireUser` | ✗ (의도) | 6b (`dest` 갈래 `account` — 만든다면) |

`app/__tests__/entry-points.test.ts`가 신설 라우트를 자동으로 센다 — `page.tsx`가 `GUARDS` 중 하나를 부르지 않으면 red이고, `(edit)/**/page.tsx`가 matcher에 없으면
"보호 라우트가 미들웨어 matcher에 있다"(`:333`)가 red다.
