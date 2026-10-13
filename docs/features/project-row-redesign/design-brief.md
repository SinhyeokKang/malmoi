# project-row-redesign — design brief (Claude Design)

> ⚠️ **시안은 이 행의 재구현 동안만 SoT다.** 구현이 dev에 들어간 뒤로는 코드 + `docs/DESIGN.md` §6.63이 정본이고, 새 시안은 변경 요청이다.
> 기능 정의는 `spec.md`, 판정·데이터는 `design.md`가 정본이다 — 여기는 **그릴 것만** 든다.

## 한 줄

`/projects` 목록의 **프로젝트 행 하나**를 다시 그린다 — 프로젝트를 대표하는 메타 한 줄, 합친 언어 진행, 건강을 말하는 칩 하나, 다음 한 수를 말하는 띠.

## 놓이는 자리 (실측 — 그릇은 그대로다)

- **그릇**: 그룹 카드 셋(`Needs attention` · `All set` · `Archived`) — `rounded-lg`(12) · `border-border` · `overflow-hidden`. 카드 헤더 `padding 12 16` · `h2` 15/500 + 카운트 `Badge soft-neutral`. 헤더↔첫 행 선 `border-foreground/[0.06]`, 행 사이 선 행마다 `border-t border-border`(`divide-y` 아님). 폭은 fluid, 본문 폭 상한 1280.
- **지금 행**(`components/projects/project-list.tsx`): `ListRow ringInset` · `flex-col items-stretch gap-2.5 pr-3.5 pl-3` · 행 padding `13 14 13 12` · hover `bg-foreground/[0.02]`.
  - 첫 줄 `flex items-center gap-4`: `ProjectThumbnail sm`(28 · radius 8) · 이름 칸(`min-w-0 flex-1` — 이름 15/500 `truncate` + 보조줄 13 muted: 호스트 글리프 14 + `owner/` + `repo`, namespace가 먼저 줄어든다) · 우측 `shrink-0 gap-3`(`StatusBadge` + `ChevronRight` 16 muted).
  - 둘째 줄 `pl-11`(44 — 이름 시작선): `LocaleMeter` ×≤3, `flex-wrap gap-x-3 gap-y-1.5`. 미터 하나 = 폭 100 · 라벨 줄(`Badge soft-neutral` 국기 16×11 + 코드 · `ml-auto` 퍼센트 12 muted) · 바 `h-1` 트랙 `bg-foreground/[0.08]` 완료 `bg-foreground/85` 검토 `bg-warning-emphasis`.
  - 띠(행의 형제, 링크 밖): `BannerLine` — `py-2 pr-3.5 pl-14`(56) · `border-t border-foreground/[0.06]` · `bg-foreground/[0.02]` · 13 · 링크 하나.
- 다른 화면과의 관계: 행을 누르면 Home(`/projects/:slug`)으로 간다. Home 메타 열이 운영 상세(Host·Repository·Connection·Branch·CI·Sources·Keys·Members·Created)의 정본이다 — 행은 그 입구라 같은 것을 다 들지 않는다.

## 프리미티브 (새로 만들지 않는다)

`ListRow`·`CardList`(`components/ui/row-card.tsx`) · `ProjectThumbnail` · `StatusBadge`(낱말·톤은 `STATE` 표) · `Badge` · `BannerLine` · `LocaleFlag` · `LocaleMeter`(소비자가 이 행 하나뿐이라 모양을 바꿔도 된다) · `GithubIcon`·`GitlabIcon` · lucide 글리프(16·14·12·20 넷만).
새 색이 필요하면 DESIGN §6.2의 의미 토큰으로만 — raw 색 0. 라이트·다크 둘 다 토큰이 든다(`dark:` 금지).

## 항목 · 상태 · 문구

### 행이 드는 정보 (design.md §1 · 결정 2)

| 자리 | 내용 | 문구 |
|---|---|---|
| 이름 | 프로젝트 이름 | — |
| 리포 | 호스트 글리프 + `owner/repo` | — |
| 대표 메타 | **언어 수 · 키 수 · 마지막 동기화** (소스 수는 2개 이상일 때만 — 넣을지 시안이 판단) | 새 키(아래) · `home.cards.synced(when)` = `synced 3 hours ago` 재사용 |
| 언어 진행 | 로케일 코드별로 **모든 소스를 합친** 진행 · base 언어는 없다 · **덜 된 것 먼저** · 최대 3 + 남은 수 | `+2` 꼴 새 키 |
| 칩 | **건강 하나** — 아래 상태 표 | 기존 `STATE` 낱말 |
| 띠 | 다음 한 수 하나 — 아래 상태 표 | 기존 `projects.banner.*` |

### 상태 (design.md §3 표 · 결정 1 — 칩은 건강, 띠는 할 일)

| # | 상태 | 칩 | 그룹 | 띠 | 둘째 줄(언어 진행) |
|---|---|---|---|---|---|
| a | 정상 · 할 일 없음 | `Active`(green) | All set | 없음 | 있음 |
| b | 정상 · 미발송 편집 | `Active` | All set | `24 unsent edits — publish to send them.` · `Go to Publish` | 있음 |
| c | 정상 · 열린 PR | `Active` | All set | `Pull request #128 is open — merge it to finish.` · `Open on GitHub` | 있음 |
| d | 정상 · 리포가 앞섬 | `Active` | All set | `3 translation files changed on main after your last sync.` · `Review changes` | 있음 |
| e | 정상 · 검토 대기 | `Active` | All set | `8 cells are translated and waiting for review.` · `Review` | 있음 |
| f | 열린 PR 조회 실패 | `Couldn't check for an open pull request`(amber) | Needs attention | ⚠️ 지금 띠 문장이 칩과 같은 말이다(`Couldn't check for an open pull request.`) — **다음 한 수**(무엇이 멈췄고 무엇을 하면 되나)로 바꾼 문장을 제안해 달라 | 있음 |
| g | 연결 끊김 | `Disconnected`(amber) | Needs attention | `This repository is disconnected — …` · `Reconnect`(EDITOR는 `Ask a project owner to reconnect it.`) | 있음 |
| h | 동기화 실패 | `Sync failed`(red) | Needs attention | 사유 + `View details` | 데이터 있으면 있음 |
| i | 일부 반영 | `Partially synced`(amber) | Needs attention | 사유 + `View details` | 있음 |
| j | 연결 전 | `Setup` | Needs attention | `Finish setup to start translating.` · `Continue setup`(EDITOR는 문장) | **없음** |
| k | 첫 동기화 중 | `Syncing…` | Needs attention | 없음 | **없음** |
| l | 첫 동기화 대기 | `Not synced yet` | Needs attention | 없음 | **없음** |
| m | 보관 | `Archived` | Archived | **없음** | 있음 — 이름·메타 `gray-dim` |

- ⚠️ **같은 사실을 칩과 둘째 줄이 두 번 말하지 않는다** — 지금의 `Not synced yet`·`Sync failed` 둘째 줄 문장은 없어진다. 값이 없는 행(j·k·l)은 **0% 바도 문장도 그리지 않는다**(design.md 결정 4).
- ⚠️ **f의 칩 낱말이 길다** — 칩은 줄지 않는 우측 묶음이라 375에서 이름 칸을 민다. 짧은 칩 형이 필요하면 낱말 후보를 제안해 달라(`Couldn't check` 단독은 연결 확인 실패의 낱말이라 쓸 수 없다 — DESIGN §10.1).
- GitLab 행은 모든 문장이 GitLab 형이다(`Merge request !128 …` · `Open on GitLab` · `merge request`).

### 새 en 키 (후보 — 최종 문구는 시안이 제안하고 구현이 세 사전에 넣는다)

| 키(가칭) | 예 |
|---|---|
| `projects.row.languages(n)` | `3 languages` |
| `projects.row.keys(n)` | `1,204 keys` |
| `projects.row.sources(n)` | `2 sources` (2개 이상일 때만) |
| `projects.row.moreLanguages(n)` | `+2` (접근 이름은 `2 more languages`) |

## 그릴 프레임

라이트 기준, 폭은 카드 폭. 각 프레임은 **그룹 카드 안의 행**으로 그린다(헤더 포함).

| # | 프레임 | 내용 |
|---|---|---|
| 1 | 기본 1280 | `Needs attention` 카드(g·h) + `All set` 카드(a·b·c·e) — 섞인 목록의 대표 장면 |
| 2 | 언어 많음 | 대상 언어 7개(합쳐서) — 막대 3 + `+4` |
| 3 | 소스 둘 | 같은 `ko`가 두 소스에 있는 프로젝트 — 한 막대 · 메타에 `2 sources` |
| 4 | 언어 0 | base만 있는 프로젝트(`0 languages`) |
| 5 | 상태 전수 | a–m 열세 행을 한 판에(그룹은 무시하고 나열해도 된다) — 칩·띠·둘째 줄의 조합 확인용 |
| 6 | EDITOR | g·j의 EDITOR 갈래(링크 대신 "누가 할 수 있는지" 문장) |
| 7 | GitLab 섞임 | GitHub 행 + GitLab 행(c·f의 GitLab 문장, 긴 하위 그룹 `group/sub/repo`) |
| 8 | 보관 | `Archived` 카드의 m 행 |
| 9 | 긴 이름 | 이름·리포가 말줄임될 만큼 긴 행 — 칩·chevron이 줄지 않는다 |
| 10 | 태블릿 768 | 1의 구성 |
| 11 | 모바일 375 | 1의 구성 + f 행(긴 칩) |
| 12 | 불러오는 중 | 골격 — 카드 헤더 · 행 둘(새 행 치수와 같은 높이) |
| 13 | 검색 결과 | `Results for “web”` 카드 안의 행 — 일치 구간은 이름에서만 칠한다 |
| 14 | 다크 | 1과 5를 다크로 |

## 동작 주석

- **행 전체가 링크 하나**(`<a>` → Home). 띠는 행의 형제이고 띠의 링크 하나가 따로 포커스를 받는다 — 행 안에 다른 상호작용 요소를 두지 않는다(링크 중첩 불가).
- hover는 **배경 하나**(`bg-foreground/[0.02]`) — 테두리·그림자·확대 없음.
- focus 링은 **안쪽**(`ring-inset`) — 카드가 `overflow-hidden`이라 바깥 링은 잘린다.
- 언어 막대는 `aria-hidden`이고 라벨 줄(코드·퍼센트)이 같은 사실을 글자로 말한다. `+N`은 접근 이름이 `N more languages`다.
- 상대 시각은 `<time dateTime="UTC ISO">`이고 `title`에 절대 시각(보는 사람의 시간대 + 오프셋 라벨)을 단다 — 다른 상대 시각 자리와 같은 형.
- 폭 때문에 정보를 숨기지 않는다(PRODUCT §4.1) — 좁으면 줄이 감긴다. 숨기는 안을 그리지 않는다.

## 그리지 않는 것

- 그룹 카드의 존재·순서·헤더 모양, 검색 입력, 빈 상태 둘, 페이지 머리, `New project` 버튼 — 그대로다.
- 역할·멤버 수(2026-09-30 걷었다) · 브랜치 · 마지막 Publish · 전체 진행률 숫자 하나 · 소스별 막대.
- 정렬·필터 컨트롤, 행 안의 버튼(Sync·Publish 등 — 행은 Home으로 가는 입구다), 행 펼치기·더 보기.
- 새 색·그라데이션·일러스트.
