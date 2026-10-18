# project-row-redesign — design brief (Claude Design)

> ⚠️ **시안은 이 행을 다시 구현하는 동안만 SoT다.** 구현이 dev에 들어간 뒤로는 코드 + `docs/DESIGN.md` §6.63이 정본이고, 그 뒤의 새 시안은 변경 요청이다.
> 기능 정의는 `spec.md`, 판정·데이터는 `design.md`가 정본이다. 이 문서는 **그릴 것만** 담는다.
> 핸드오프(2026-10-18): [Project Row Redesign.dc.html](https://claude.ai/design/p/b99d54cd-3034-44f1-8446-0a864da9d767?file=Project+Row+Redesign.dc.html) — 시안이 정한 사실은 design.md §6에 옮겼다.

## 한 줄

`/projects` 목록의 **프로젝트 행 하나**를 다시 그린다. 행에는 프로젝트를 대표하는 메타 한 줄, 건강을 말하는 칩 하나, 다음 할 일을 말하는 띠가 선다. **언어 진행 막대는 이 행에서 빠진다** — 소스 단위 사실이라 Sources 화면의 소스 행으로 옮겨 간다(`source-row-locale-meter`, 별도 시안).

## 놓이는 자리 (실측 — 그릇은 그대로다)

- **그릇**: 그룹 카드 셋(`Needs attention` · `All set` · `Archived`)이 `Card`로 선다 — `rounded-lg`(12) · `border-border` · `overflow-hidden`.
  - 카드 헤더: `padding 12 16` · `h2` 15/500 + 카운트 `Badge soft-neutral`.
  - 선: 헤더↔첫 행은 `border-divider`(`components/ui/card.tsx:21`), 행 사이는 `CardList`의 `[&>li+li]:border-t`(`card.tsx:40`).
  - 폭은 fluid이고 본문 폭 상한은 1280이다.
- **지금 행**(`components/projects/project-list.tsx`): `ListRow ringInset` · `flex-col items-stretch gap-2.5 pr-3.5 pl-3` · 행 padding `13 14 13 12` · hover `bg-foreground/[0.02]`.
  - 첫 줄 `flex items-center gap-4`, 세 칸이다.
    - `ProjectThumbnail sm`(28 · radius 8)
    - 이름 칸(`min-w-0 flex-1`): 이름 15/500 `truncate` + 보조줄 13 muted(호스트 글리프 14 + `owner/` + `repo`, namespace가 먼저 줄어든다)
    - 우측 묶음 `shrink-0 gap-3`: `StatusBadge` + `ChevronRight` 16 muted
  - 둘째 줄 `pl-11`(44 — 이름 시작선): `LocaleMeter` ×≤3 또는 상태 문장. **이번에 둘째 줄을 통째로 없앤다.**
  - 띠(행의 형제, 링크 밖): `BannerLine` — `py-2 pr-3.5 pl-14`(56) · `border-t border-foreground/[0.06]` · `bg-foreground/[0.02]` · 13 · 링크 하나.
- 다른 화면과의 관계: 행을 누르면 Home(`/projects/:slug`)으로 간다. Home 메타 열이 운영 상세(Host·Repository·Connection·Branch·CI·Sources·Keys·Members·Created)의 정본이다. 행은 그 입구라서 같은 것을 다 담지 않는다.

## 프리미티브 (새로 만들지 않는다)

`ListRow`·`CardList`(`components/ui/row-card.tsx`) · `ProjectThumbnail` · `StatusBadge`(낱말·톤은 `STATE` 표) · `Badge` · `BannerLine` · `GithubIcon`·`GitlabIcon` · lucide 글리프(16·14·12·20 넷만).
- 이 행에서 `LocaleMeter`·`Meter`는 쓰지 않는다.
- 새 색이 필요하면 DESIGN §6.2의 의미 토큰으로만 쓴다. raw 색은 0이다. 라이트·다크 둘 다 토큰이 든다(`dark:` 금지).
- sr-only 요소를 새로 만들지 않는다. 메타는 눈에 보이는 글자다(POSTMORTEM 2026-10-13 #260).

## 항목 · 상태 · 문구

### 행이 담는 정보 (design.md §1 · 결정 2)

| 자리 | 내용 | 문구 |
|---|---|---|
| 이름 | 프로젝트 이름 | — |
| 리포 줄 | 호스트 글리프 + `owner/repo` — 그대로 `truncate` | — |
| **메타 줄(새)** | 리포 줄 아래. `sources · keys · languages · synced` 순서 — **좁으면 감기고 숨지 않는다** | 기존 키 재사용: `2 sources` · `1,204 keys` · `3 languages` · `synced 3 hours ago` |
| 칩 | **건강 하나** — 아래 상태 표 | 기존 `STATE` 낱말 |
| 띠 | 다음 할 일 하나 — 아래 상태 표 | 기존 `projects.banner.*` + 새 문장 둘 |

메타 칸 규칙:
- 소스 수는 늘 선다.
- 언어 수가 0이면 칸을 생략한다(`0 languages`를 쓰지 않는다). 제거 중인 언어는 세지 않고, 추가 중인 언어는 센다(Sources 행 `N languages`와 같은 작업 언어 — design.md §1).
- 동기화 시각이 없으면 칸을 생략한다. 첫 적재 전 행, 시각 컬럼 이전에 적재된 행(`unrecorded`)이 그렇다. `not synced yet`을 메타에 쓰지 않는다 — 칩이 이미 말한다.
- 상대 시각은 `<time dateTime="UTC ISO">`이고, `aria-label`에 절대 시각(보는 사람의 시간대 + 오프셋 라벨)을 단다. 다른 상대 시각 자리와 같은 형이다(`title` 아님).

### 상태 (design.md §2 표 · 결정 1·6 — 칩은 건강, 띠는 할 일)

| # | 상태 | 칩 | 그룹 | 띠 | 띠 톤 |
|---|---|---|---|---|---|
| a | 정상 · 할 일 없음 | `Active`(green) | All set | 없음 | — |
| b | 정상 · 미발송 편집 | `Active` | All set | `24 unsent edits — publish to send them.` · `Go to Publish` | **muted** |
| c | 정상 · 열린 PR | `Active` | All set | `Pull request #128 is open — merge it to finish.` · `Open on GitHub` | **muted** |
| d | 정상 · 리포가 앞섬 | `Active` | All set | `3 translation files changed on main after your last sync.` · `Review changes` | **muted** |
| e | 정상 · 검토 대기 | `Active` | All set | `8 cells are translated and waiting for review.` · `Review` | **muted**(지금 warning) |
| f | 정상 · 열린 PR 조회 실패 | `Active` | **All set** | **새 문장 — 제안해 달라**(아래) · 링크 없음 | **muted** |
| n | 정상 · 빈 언어(새) | `Active` | All set | **새 문장 — 제안해 달라**(아래) · 그 언어의 번역 화면 링크 | **muted** |
| g | 연결 끊김 | `Disconnected`(amber) | Needs attention | `This repository is disconnected — …` · `Reconnect`(EDITOR는 `Ask a project owner to reconnect it.`) | warning |
| h | 동기화 실패 | `Sync failed`(red) | Needs attention | 사유 + `View details`(EDITOR는 소유자에게 요청하는 문장) | danger |
| i | 일부 반영 | `Partially synced`(amber) | Needs attention | 사유 + `View details` | warning |
| j | 연결 전 | `Setup` | Needs attention | `Finish setup to start translating.` · `Continue setup`(EDITOR는 문장) | 지금 그대로 |
| k | 첫 동기화 중 | `Syncing…` | Needs attention | 없음 | — |
| l | 첫 동기화 대기 | `Not synced yet` | Needs attention | 없음 | — |
| m | 보관 | `Archived` | Archived | **없음** | — · 이름·메타 `gray-dim` |

- ⚠️ **같은 사실을 칩과 띠가 두 번 말하지 않는다.** 칩 낱말을 같은 행의 띠 문장에 그대로 넣지 않는다. 특히 h는 띠가 `Sync failed`를 되풀이하지 않고 사유를 말한다.
- ⚠️ **All set 카드에는 호박색·빨간 띠가 서지 않는다.** warning·danger 띠는 Needs attention 사유(g·h·i·j)에만 쓴다.
- 미발송과 PR 조회 실패가 겹치면 띠는 미발송(b)이다.
- GitLab 행은 모든 문장이 GitLab 형이다(`Merge request !128 …` · `Open on GitLab` · `merge request`).

### 새 문장 둘 — 제안해 달라 (최종 문구는 T0에서 확정하고, 구현이 세 사전에 넣는다)

**f — 열린 PR 조회 실패 띠.** 지금 문장(`Couldn't check for an open pull request.`)은 칩 낱말에 마침표만 붙인 것이다. **다음 할 일**을 말하는 문장이 필요하다. 사실 셋:
1. **멈춘 것** — 이번 방문에서 열린 PR(GitLab은 MR)이 있는지 확인하지 못했다. 그 동안 CI 적재가 보류되는지는 이 신호만으로 알 수 없다.
2. **갈 곳이 없다** — 링크를 붙일 목적지가 없다. 다음 방문 때 다시 확인한다.
3. **쓸 수 없는 낱말** — `retry`·`check again` 등(DESIGN §10.1 `BANNED`), 그리고 `Couldn't check` 단독(연결 확인 실패의 낱말이다). 남을 가리키는 문구는 그 화면에 실제로 있는 컨트롤만 가리킨다.

**n — 빈 언어 띠.** Home Attention의 같은 항목(`home.attention.neverFilled` — "아직 값이 하나도 없는 언어")과 같은 개념이다. 낱말을 맞추고, ⚠️ "한 번도(never)"를 말하지 않는다. 채웠다가 비운 언어도, OWNER가 방금 추가해 아직 값이 없는 언어도 여기 선다(malmoi#134 · locale-add). 제거 중인 언어는 서지 않는다.

### 메타 문구 (기존 키 — 새로 만들지 않는다)

| 칸 | 키 | 예 |
|---|---|---|
| 소스 수 | `sources.count(n)` | `2 sources` |
| 키 수 | `translations.keys(n)` | `1,204 keys` |
| 언어 수 | `sources.languageCount(n)` | `3 languages` |
| 동기화 | `home.cards.synced(when)` | `synced 3 hours ago` |

## 그릴 프레임

라이트 기준이고 폭은 카드 폭이다. 각 프레임은 **그룹 카드 안의 행**으로 그린다(헤더 포함).

| # | 프레임 | 내용 |
|---|---|---|
| 1 | 기본 1280 | `Needs attention` 카드(g·h) + `All set` 카드(a·b·c·e·n) — 섞인 목록의 대표 장면 |
| 2 | 메타 생략 | 언어 0인 프로젝트(언어 칸 없음) · `unrecorded` 프로젝트(동기화 칸 없음) |
| 3 | 상태 전수 | a–n 열네 행을 한 판에(그룹은 무시하고 나열해도 된다) — 칩·띠·톤 조합 확인용 |
| 4 | EDITOR | g·h·j의 EDITOR 갈래(링크 대신 "누가 할 수 있는지" 문장) |
| 5 | GitLab 섞임 | GitHub 행 + GitLab 행(c·d·f의 GitLab 문장, 긴 하위 그룹 `group/sub/repo`) |
| 6 | 보관 | `Archived` 카드의 m 행 |
| 7 | 긴 이름 | 이름·리포가 말줄임될 만큼 긴 행 — 칩·chevron이 줄지 않는다 |
| 8 | 태블릿 768 | 1의 구성 |
| 9 | 모바일 375 | 1의 구성 — 메타 줄이 감기는 모습 |
| 10 | 모바일 375 · es | 9를 es 화면 언어로(가장 긴 문장) |
| 11 | 불러오는 중 | 골격 — 카드 헤더 · 행 둘(새 행 치수와 같은 높이, 썸네일 radius 8) |
| 12 | 검색 결과 | `Results for “web”` 카드 안의 행 — 일치 구간은 이름에서만 칠한다 |
| 13 | 다크 | 1·3·6을 다크로(보관 `gray-dim`의 다크 값 포함) |
| 14 | Inbox `needs_reconnect` | Inbox 목록에 새로 서는 "연결 끊김" 항목 — OWNER(재연결 링크)·EDITOR(문장) 두 갈래. 기존 Inbox 항목 형 그대로 |

## 동작 주석

- **행 전체가 링크 하나**(`<a>` → Home)다. 띠는 행의 형제이고, 띠의 링크 하나가 따로 포커스를 받는다. 행 안에 다른 상호작용 요소를 두지 않는다(링크 중첩 불가).
- hover는 **배경 하나**(`bg-foreground/[0.02]`)다. 테두리·그림자·확대는 없다.
- focus 링은 **안쪽**(`ring-inset`)이다. 카드가 `overflow-hidden`이라 바깥 링은 잘린다.
- 폭 때문에 정보를 숨기지 않는다(PRODUCT §4.1). 좁으면 메타 줄이 감긴다. 숨기는 안은 그리지 않는다. 리포 줄의 말줄임은 지금 그대로다.

## 그리지 않는 것

- 그룹 카드의 존재·순서·헤더 모양, 검색 입력, 빈 상태 둘, 페이지 머리, `New project` 버튼 — 그대로다.
- **언어 진행 막대** — 이 행에서 빠진다(Sources 소스 행은 별도 시안).
- 역할·멤버 수(2026-09-30에 걷었다) · 브랜치 · 마지막 Publish · 전체 진행률 숫자 하나.
- 정렬·필터 컨트롤, 행 안의 버튼(Sync·Publish 등 — 행은 Home으로 가는 입구다), 행 펼치기·더 보기.
- 새 색·그라데이션·일러스트.
