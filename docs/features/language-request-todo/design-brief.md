# language-request-todo — Claude Design 브리프

> **이 시안은 이 기능의 첫 구현 동안만 SoT다.** 구현이 dev에 들어간 뒤로는 코드 + DESIGN §6.63·§6.64가 정본이고, 새 시안은 변경 요청이다.
> 기능 정의는 `spec.md`, 판정·데이터는 `design.md`가 정본이다. 여기는 **그릴 것만** 든다.

## 한 줄

언어 변경(추가·제거)만 아직 Publish되지 않은 프로젝트를, **`/projects` 행의 띠 · Inbox 항목 · Home `To send` 카드 보조 줄** 세 자리가 같은 사실로 말한다. 새 화면·새 레이아웃은 없다 — 기존 세 형에 상태 하나씩을 더한다.

## 놓이는 자리 (2026-10-18 dev — 띠·Inbox는 project-row-redesign DS 실측 `.scratch/prr-orchestrate/ds-report.md`, Home 카드는 코드 클래스 · DESIGN §6.64)

| 자리 | 지금의 형 | 코드 |
|---|---|---|
| `/projects` 행 띠 | 같은 `li` 안에서 행 링크(`ListRow`)의 형제(`project-list.tsx:209-213,313`). `flex items-center gap-2` · padding `8 14 8 56` · 위 선 `fg/0.06` · 면 `fg/0.02` · 13px · 글리프 14. All set 카드의 띠는 전부 muted(#737373). 링크는 앱 안이면 muted + chevron 12, `margin-left 4`. 그릇 640 이상은 한 줄 말줄임, 미만은 감긴다 | `components/projects/project-list.tsx` (`ProjectBanner`·`BannerAction`) |
| Inbox 항목 | 헤더 드롭다운(폭 360, r12)과 `/inbox` 페이지가 같은 항목을 그린다. 항목 `padding 10 16 · gap 12` 14/20 · `IconTile` 28 r4(톤별 면/글자) + 글리프 16 · 굵은(500) 본문 + 꼬리 · 보조줄(소스·언어) · 시각 · 안 읽음 점 | `components/inbox/row-slots.tsx` · `lib/home/attention-view.ts` (`TILE`) |
| Home `To send` 카드 | 카운트 카드 넷 중 둘째. 1행 제목 `text-sm font-medium` + 오른쪽 글리프 16(`gray-dim`) · 2행 수치 `text-2xl font-semibold`(0이면 `gray-dim`) · 3행 보조 줄 `text-xs` muted — `{단위} · {보조 문장}`(예: `cells · nothing to send`, 보류면 `cells · repository updates held`). 보류 결론은 PR 조회 뒤 늦게 도착할 수 있다(`HoldLater`) | `components/home/count-cards.tsx:95-130` · `components/home/hold-later.tsx` · `lib/home/cards.ts` |
| Home 메타 열 Sync 탭 | 보류 사유가 있으면 `Held` 배지가 선다 | `components/home/meta-column.tsx:193-200` · `lib/home/meta.ts:216` |

## 프리미티브

새 프리미티브를 만들지 않는다 — 위 세 형을 그대로 쓴다. 새 색이 필요하면 DESIGN §6.2 의미 토큰만 쓴다(All set 띠는 muted 고정 — DESIGN §6.63 결정 6).

## 상태 · 문구

| 상태 | 행 띠 | Inbox 항목 | Home `To send` |
|---|---|---|---|
| ① 언어 변경 미발송(보류 아님 — 추가·거둘 것) | 글리프 `GitPullRequestArrow` · `N language changes to publish.` · 링크 `Go to Publish` → 프로젝트 Home | `IconTile` muted + `GitPullRequestArrow` · 본문 = 띠 문장(통째로 굵게) · 보조줄 = 대표 소스 slug · 시각(마지막 요청 시각, 거둘 것만이면 빈 칸) | 수치 = 셀 수(0이면 `gray-dim`) · 보조 줄 `cells · N language changes to publish` |
| ② 전달 전 제거가 있다(CI 적재 보류) | 같은 글리프 · `A language removal isn't published yet — repository updates are held.` · 링크 `Go to Publish` → Home | 같은 형, 굵은 본문 `A language removal isn't published yet` + 꼬리 ` — repository updates are held.` | 보조 줄 `cells · held — a language removal isn't published yet` · 메타 열 Sync 탭 `Held` |
| ③ 셀 미발송 + 언어 변경 | 띠는 **하나** — 미발송 편집 띠가 이긴다(기존 문장 `N unsent edits — publish to send them.`). 언어 변경은 Inbox가 따로 든다 | 미발송 항목과 언어 변경 항목 **둘**(같은 글리프·톤·slug, 문장으로 갈린다) | 기존 그대로(셀 수 · `repository updates held`) |
| ④ 열린 PR + 미전달 언어 추가 | 언어 띠 ①(언어 변경이 열린 PR보다 앞) | ① 항목 | 보조 줄은 PR 보류 사유 `held until the pull request is merged or closed` — 띠와 다른 사실을 앞세우는 것을 허용한다(design D10) |

- 칩은 `Active`, 그룹은 `All set` 그대로다 — 칩을 그리지 말고 바꾸지 않는다.
- 문구 재사용: `Go to Publish`(`projects.banner.action.send`), `cells`(`home.cards.unit`). 새 en 키는 design §6 — 행 띠 ①② · Inbox ② 본문·꼬리 · Home 보조 줄 ①②(Inbox ①은 띠 문장 재사용). ②는 수를 말하지 않는다(제거가 여럿이어도 보류는 하나다).
- 숫자는 `toLocaleString`(en `1,204`), 단수형(`1 language change to publish`)도 그린다.

## 그릴 프레임

라이트 기준. 폭은 그릇 폭이다.

| # | 프레임 | 내용 |
|---|---|---|
| 1 | 목록 1280 | `All set` 카드 안에 ① 행 · ② 행 · 기존 미발송 행 · 띠 없는 행을 섞어 — 같은 글리프의 두 띠가 나란히 설 때 |
| 2 | 목록 375 | 1의 구성(카드 325) — ② 문장이 감기는 모습 |
| 3 | 목록 375 · es | 2를 es로(가장 긴 문장) |
| 4 | Inbox 드롭다운 | ①·② 항목이 다른 항목(검토·빈 언어·재연결) 사이에 선 모습, 안 읽음 점 있는 것과 없는 것. ③ — 같은 프로젝트의 미발송 항목과 언어 변경 항목이 나란히 선 모습 |
| 5 | `/inbox` 페이지 | 4와 같은 항목, 프로젝트 그룹 안 |
| 5b | Inbox 375 시트 | 좁은 폭의 전체 화면 시트(PRODUCT §4.1)에서 ② 항목 |
| 6 | Home 카운트 카드 + 메타 열 | `To send` ① · ② · ③ · ④ 네 장면(나머지 세 카드는 그대로) + ②의 메타 열 Sync 탭 `Held` |
| 7 | Home 375 | 6의 ②(보조 줄이 길다)와 메타 열 |
| 8 | 다크 | 1 · 4 · 6을 다크로 |

## 동작 주석

- 띠 링크와 Inbox 항목은 **프로젝트 Home**으로 간다(2026-10-18 사용자 Q1). Home `To send` 카드의 링크는 지금처럼 번역 화면이다 — 바꾸지 않는다.
- Inbox 항목을 열면 읽음 처리는 기존 규칙 그대로다(`attentionSeenAt` 워터마크).
- 키보드·포커스는 기존 형 그대로다(행 링크 `ring-inset`, 띠는 링크 밖 형제).

## 그리지 않는 것

- 어느 언어가 추가·제거 중인지(코드·이름) — Sources Languages 카드가 든다. 띠·Inbox·카드는 수와 다음 수만 말한다.
- 칩·그룹 변경, Home Attention 카드의 새 항목, 새 배너.
- PR이 열린 뒤의 상태 — 기존 `pr_open` 띠·`held until the pull request is merged or closed`가 든다.
