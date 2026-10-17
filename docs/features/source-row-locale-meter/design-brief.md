# source-row-locale-meter — design brief (Claude Design)

> 시안: [`Source Row Locale Meter.dc.html`](https://claude.ai/design/p/b99d54cd-3034-44f1-8446-0a864da9d767?file=Source+Row+Locale+Meter.dc.html) (2026-10-17 수령 — 행 시각의 결론은 design §4.1)

> 신규 페이지의 첫 구현 동안만 시안이 SoT이고, dev에 들어간 뒤로는 코드 + DESIGN.md가 정본이다. 이 변경은 이미 구현된 화면에 요소를 더하는 것이라 시안은 **이 막대 줄과 그 영향**만 다룬다. 기능 정의는 `spec.md`, 데이터·판정은 `design.md`가 정본이다.

## 한 줄

Sources 목록(`/projects/:slug/sources`)의 소스 행마다, 그 소스의 언어별 진행 막대를 최대 5개 + `+N`으로 단다.

## 놓이는 자리 (실측 — `components/sources/sources-screen.tsx`)

- 그릇: `Card`(`@container` · `rounded-lg border` · `overflow-hidden`), 머리 = 제목 `Sources` + 개수 배지 + 리포 줄(호스트 글리프 14 · `owner/repo · branch`). 행 사이 `border-t`.
- 행: `ListRow as="button"` 전체가 상세 모달을 연다 · `p-0 pr-4 text-sm` · 상세가 열린 행은 선택 면 `bg-foreground/[0.07]`.
  - 안쪽 `px-4 py-row-y`(13) · `gap-3`(12): **글리프 칩** `IconTile` 28(상태 톤 — 성공 초록·일부 반영 호박·실패 붉은·그 밖 무채) · **이름 칸**(`flex-1 flex-col gap-copy-gap`(3)) · **상태 칸**(`SourceStatus` 배지 + 보조 문장, `shrink-0`) · 바깥에 `chevron-right` 16 muted.
  - 이름 칸 1줄: `text-base`(15) `web` 500 + ` — JSON · 248 keys · 3 languages`.
  - 이름 칸 2줄: `Folder` 14 + 경로 `text-xs`(13) muted, `wrap-anywhere`.
  - **새 3줄 후보 = 막대 묶음.** 위치·간격은 시안이 정한다. 참고 패턴: `/projects` 행의 막대 줄은 `flex flex-wrap gap-x-3 gap-y-1.5`였다(`project-list.tsx:315`).
- 좁은 그릇(카드 640 미만, `@max-form`): 칩·이름 칸이 감기고 상태 배지가 둘째 줄로 내려가 이름 칸 시작선(`pl-10`)에 맞춘다(`row-layout.ts`). DOM 순서는 `[칩][이름·경로][상태]` 그대로이고 CSS `order`를 쓰지 않는다.
- 폭: 1280 뷰포트 + LNB에서 이름 칸은 약 700, 1024 + LNB에서 약 400, 375에서 약 300.

## 프리미티브 (새로 만들지 않는다)

- `LocaleMeter`(`components/locale-meter.tsx`) — 폭 100(`w-25`) · 라벨 줄 `gap-1.5`: `Badge soft-neutral`(국기 `LocaleFlag` 16×11 + 코드, `gap-1`) + `ml-auto` 퍼센트 12 muted · 바 `Meter`(`h-1` 4 · `rounded-full` · 트랙 `bg-foreground/[0.08]` · 완료 `bg-foreground/85` · 검토 `bg-warning-emphasis`). 바는 `aria-hidden`.
- `Badge` · `ListRow` · `IconTile` · `Skeleton`(골격). 새 색은 쓰지 않는다 — 필요하면 DESIGN §6.2 의미 토큰으로만.

## 항목 · 상태 · 문구

| 항목 | 값 | 문구 |
|---|---|---|
| 막대 | 그 소스의 **살아 있는** 언어, base 맨 앞 → 코드순(상세 모달 Languages 카드와 같은 순서) | 기존 `LocaleMeter` 라벨 |
| 퍼센트 | 완료 + 검토 대기(내림) — 상세 모달도 같은 수로 바뀐다 | `92%` |
| 남은 수 | 언어가 6개 이상이면 앞 5개 뒤에 | 후보 `+N` · 접근 이름 `N more languages` |
| 막대 없음 | 키가 0(첫 적재 전·첫 적재 실패·적재 중) — **0% 막대도 문장도 그리지 않는다.** 상태 배지가 이미 말한다 | — |
| 적재 이후 실패 | 데이터가 있으므로 막대가 남는다(상태 배지는 `Sync failed`/`Partially synced`) | — |

### 새 en 키 (후보 — 최종 문구는 시안이 제안한다)

| 키 | en |
|---|---|
| `sources.moreLanguages(n)` | `+2` |
| `sources.moreLanguagesLabel(n)` | `2 more languages` |

### 상세 모달에서 바뀌는 것 (같이 그린다)

Languages 카드 언어 행의 퍼센트·오른쪽 수치가 **완료 + 검토 대기**가 된다: `92%` · `222 of 248`(옛 `84%` · `210 of 248`). 막대·검토 배지(`12 need review`)·카드 구조는 그대로다.

## 그릴 프레임

라이트 기준. 각 프레임은 **카드 안의 행**으로 그린다(카드 머리 포함).

| # | 프레임 | 내용 |
|---|---|---|
| 1 | 기본 · 1280 | 소스 둘: `web`(en base · ko 92%(검토 8) · ja 40%) · `docs`(en base · fr 100%) |
| 2 | 많음 · 1280 | `chrome-locales` 59언어 — 막대 5 + `+54` |
| 3 | 많음 · 1024 + LNB | 2와 같은 데이터, 이름 칸 약 400에서 감김 |
| 4 | 좁은 그릇 · 375 | 상태 배지가 둘째 줄로 내려간 상태에서 막대 줄의 위치 |
| 5 | 막대 없음 | 첫 적재 전(`Not synced yet`) · 적재 중(`Syncing…`) · 첫 적재 실패(`Sync failed`) 세 행 |
| 6 | 적재 이후 실패 | `Sync failed` 배지 + 막대가 남은 행 |
| 7 | base만 있는 소스 | 언어 하나(base) — 막대 하나 |
| 8 | 선택된 행 | 상세가 열린 행의 선택 면 위 막대 |
| 9 | 불러오는 중 | 골격 행에 막대 줄 자리(실물과 높이가 같아야 한다) |
| 10 | 상세 모달 Languages 카드 | 바뀐 퍼센트·오른쪽 수치(1의 `web`과 같은 값) |
| 11 | 다크 | 1·2·6을 다크로 |

## 동작 주석

- 행 전체가 버튼 하나다 — 막대를 눌러도 상세 모달이 열린다. 막대에 따로 링크·hover를 두지 않는다.
- 막대 묶음은 버튼의 접근 이름에 들어간다: 라벨 줄의 코드·퍼센트가 읽히고 바는 `aria-hidden`이다. `+N`은 보이는 `+N` 대신 `N more languages`로 읽힌다.
- focus 링은 안쪽(`ring-inset`) — 카드가 `overflow-hidden`이다.
- 막대 줄은 그릇 폭에 따라 감긴다. 숨기는 폭은 없다.

## 그리지 않는 것

- `/projects` 프로젝트 행(막대를 빼는 쪽은 `project-row-redesign`).
- 소스 합계 막대 하나, 막대 클릭으로 언어 번역 화면 열기.
- 상세 모달의 다른 카드(Sync status·Base language)와 바닥 버튼.
- `LocaleMeter` 자체의 새 모양 — 시안이 바꾸자고 하면 별도 결정으로 올린다.
