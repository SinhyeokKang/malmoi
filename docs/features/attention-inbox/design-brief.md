# attention-inbox — design brief (Claude Design 핸드오프용)

> ⚠️ **시안 수령 완료(2026-10-05)** — 이후 정본은 시안(`spec.md` 머리 링크)이다. 이 브리프와 시안이 다르면 시안이 이긴다
> (행·그룹 = 검색 목록 형, 메뉴 머리 제목 없음, 배지 0은 닫을 때, EDITOR 안내는 따로 한 줄, 트리거 글리프 foreground). 이 파일은 요청 기록으로만 남는다.

> 신규 UI 표면의 **첫 구현**이라 시안이 SoT다(CLAUDE.md `/design-sync`). 구현이 dev에 들어간 뒤로는 코드 + DESIGN.md가 정본이다.
> 기능 정의는 `spec.md`, 데이터·판정은 `design.md`. 이 문서는 **그릴 것**만 든다.

## 1. 한 줄

편집 셸 헤더에 Inbox 버튼을 두고, 누르면 **내 모든 프로젝트의 "지금 손볼 것"**이 프로젝트별로 묶인 드롭다운이 열린다. 안 읽은 수는 버튼 배지로 보인다.

## 2. 놓이는 자리 — 기존 헤더

- 전폭 헤더 높이 44(`h-11`), 캔버스 위에 배경·테두리·그림자 없이 얹힌다(패널이 아니다).
- 지금 구성: 좌 로고 32 · 가운데 검색 트리거 · 우 `[+ New project]` 링크 | 세로선(`border-subtle`, h-20) | 아바타 사용자 메뉴(`icon-md` ghost, 원형).
- **새 버튼 자리: 세로선 오른쪽, 아바타 왼쪽**(확정 — feature-review 2026-10-05). 우측 묶음의 `gap-3`을 그대로 쓴다. → `[+ New project] | [Inbox] [avatar]`
  - 이유: 같은 ghost 32 아이콘 버튼끼리 사용자 축으로 묶이고, 텍스트 링크와 형이 섞이지 않는다.

## 3. 프리미티브 (새로 만들지 않는다)

| 쓰임 | 프리미티브 |
|---|---|
| 트리거 | `Button size="icon-md" variant="ghost"` + lucide `Inbox` 16 |
| 안 읽음 수 | `Badge soft-neutral`을 **Button 안 자식**으로(`CountBadge`는 `9+`를 못 낸다). 겹치는 형이 필요하면 그 형만 제안 — 리포에 선례가 없다. 새 색은 쓰지 않는다(§6.2 의미 토큰) |
| 드롭다운 | `DropdownMenu`(사용자 메뉴·프로젝트 스위처와 같은 계열). 스위처 폭은 256 — Inbox는 문장이 두 줄이라 **360 내외** 제안 |
| 프로젝트 묶음 머리 | `ProjectThumbnail` 16 + 프로젝트 이름(스위처 행과 같은 형) — 묶음은 `ListGroup`(시안 반영 뒤 설계) |
| 항목 칩 | `IconTile` + Home `Needs your attention` 카드와 **같은 아이콘·톤 맵** |
| 시각 | 상대 시각(`3h ago`) — Home 카드와 같다 |
| 빈·오류 | `EmptyState placement="inset"` / 오류 문장(비대화형) + `Try again`은 **메뉴 항목**(`ErrorState`의 버튼은 메뉴 로빙에 안 닿는다) |

라이트·다크 둘 다 그린다(토큰이 든다 — `dark:` 분기 없음).

## 4. 항목 다섯 — 문장은 기존 사전에서 온다

| 종류 | 머리(title) | 본문 | 꼬리 | 칩 톤 | 누구에게 | 안 읽음 표시 |
|---|---|---|---|---|---|---|
| 적재 실패 | `web source` | The last sync couldn't read this source | — nothing from it was synced. (EDITOR: + Ask a project owner to run the sync again.) | danger (일부 반영이면 warning) | 둘 다 | 있음 |
| 검토 대기 | `web · ko` | 8 cells are waiting for review | — last edited in this language by Kim. | Home 카드의 review 톤 | 둘 다 | **없음**(배지에 안 든다) |
| 빈 로케일 | `web · fr` | French has no translations here | — 903 keys to translate. | Home 카드의 never-filled 톤 | 둘 다 | 있음 |
| 미전달 편집 | (머리 없음 — 묶음 머리가 프로젝트) 보조줄 `web` | 3 unsent edits — publish to send them. | — | `GitPullRequestArrow`, muted | 둘 다 | 있음 |
| 설정 미완 | (머리 없음) | Finish setup to start translating. | — | `CircleDashed`, muted | OWNER | 있음 |

- 행 전체가 링크이고 **메뉴 항목**이다 — 하이라이트는 사용자 메뉴·스위처와 같은 메뉴 항목 hover/focus(`bg-accent`)다. Home 카드 행 hover(`bg-foreground/[0.02]`)를 쓰지 않는다.
- **안 읽은 항목 표시**: 행 앞쪽 점(기존 토큰, 예 `bg-primary`) + 접근 이름 맨 앞 sr `Unread`. 색 하나로만 말하지 않는다.
- 재연결 필요(`needs_reconnect`)는 그리지 않는다(feature-review에서 제외).

## 5. 그릴 프레임

| # | 프레임 | 내용 |
|---|---|---|
| H1 | 헤더 — 안 읽음 0 | 배지 없음 |
| H2 | 헤더 — 안 읽음 3 | 배지 `3` |
| H3 | 헤더 — 안 읽음 12 | 배지 `9+` |
| D1 | 드롭다운 — 기본 | 프로젝트 2개 묶음, 항목 섞어서 5개, 그중 2개 안 읽음 |
| D2 | 드롭다운 — 많음 | 프로젝트 4개·항목 14개 → 최대 높이에서 메뉴 안 스크롤(상한·`+N more` 없음) |
| D3 | 드롭다운 — EDITOR | 적재 실패에 Owner 안내 꼬리, 설정 항목 없음 |
| D4 | 드롭다운 — 비었음 | `Nothing needs you`(Home과 같은 낱말) + 보조 한 문장 |
| D5 | 드롭다운 — 불러오는 중 | 스켈레톤 2–3행(`Skeleton`) — **첫 조회 전에만**. 이후 열기는 받은 목록을 즉시 보인다 |
| D6 | 드롭다운 — 오류 | `Couldn't load this list.` + `Try again`(버튼이 아니라 메뉴 항목) |
| D7 | 다크 | D1·H2의 다크 버전 |

드롭다운 머리: 제목 `Needs your attention`(Home 카드 제목과 같은 낱말 — DESIGN §2.4 "같은 개념 = 같은 낱말"). 머리에 "Mark all as read" 버튼은 **두지 않는다**(여는 것이 곧 읽음이다).
드롭다운 폭 360 내외, 최대 높이 `min(560px, 가용 높이)` + 안쪽 스크롤.

## 6. 동작 (시안에 주석으로)

- 버튼을 누르면 열리고, 여는 것이 곧 읽음이다 → 응답이 오면 배지가 0이 된다(행의 안 읽음 표시는 **이번 열람 동안 유지**, 다음 열람부터 사라짐). 열자마자 닫아도 읽음이다.
- 키보드: ↓ 첫 항목 · ↑↓ 이동(`Try again` 포함) · Enter 이동 · Esc 닫고 트리거로. 응답이 와도 고른 항목의 위치가 유지된다.
- 프로젝트 묶음 순서: 가장 최근 항목이 있는 프로젝트가 위. 묶음 안은 최신순.

## 7. 그리지 않는 것

이메일·브라우저 알림 설정, 항목별 닫기(×), 필터·탭(All/Unread), 검색 입력, 알림 설정 페이지, ~~공개 셸 헤더~~(2026-10-05 사용자 결정으로 대체 — 로그인한 공개 셸 헤더도 같은 Inbox를 든다, spec 완료 조건 1).

## 8. 문구 — 새로 필요한 en 키 (시안에 그대로 써 달라)

- 트리거 접근 이름(하나로 합친다): `Needs your attention` / 안 읽음 n이면 `Needs your attention, {n} unread` — 숫자 배지는 `aria-hidden`
- 안 읽음 sr: `Unread`
- 빈 상태: `Nothing needs you`(Home 사전 재사용) / 보조 `Nothing needs your attention across your projects.`
- 오류: `Couldn't load this list.` / `Try again`
