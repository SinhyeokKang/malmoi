# color-scheme — 시안 피드백 1차 (Claude Design 입력)

대상: `Color Scheme.dc.html`(2026-10-05 판). 기준은 `design-brief.md`다.
**토큰 값과 대비는 대체로 맞다. 다만 아트보드가 3/15장이라 핸드오프 전이다.** 아래 1을 먼저, 2를 그 안에서 판정한다.

border · divider · border-subtle의 낮은 대비는 의도한 값이라 이 피드백 대상이 아니다.

## 1. 미완 — 다음 판에서 채울 것

### 1.1 아트보드 A2–A7 · A10–A15

지금 판은 A1 · A8 · A9 · B1–B6만 있다. 토큰 표의 근거 열이 "A4·A6·A13에서 확인"으로 미뤄 둔 값이 그 아트보드 없이 정해져 있다.

| 아트보드 | 근거가 걸린 토큰·결정 |
|---|---|
| A4 Publish 모달 | `scrim` 검정 @40% · `diff-removed`·`diff-added` 낱말 면(@14%·@16%) · `shadow-medium` |
| A6 Logs 상세 | `subtle` `#1c1c1c` (2.2) |
| A7 Sources 상세 | `warning-emphasis` 막대 · @50% 대기 테두리 · `destructive` @8% 배지 |
| A11 랜딩 | 목업이 제품 다크와 같은 토큰으로 그려지는지 · 공개 셸 헤더·푸터 |
| A12 `/docs` | §5-6 답 (1.2) |
| A13 `/signin` | `signin-dot` blue-400 · `auth-hero-from/to` · §5-4 답 (1.2) |
| A14 `/mcp` | OpenAI 로고 흰 판 |
| A15 빈 상태 · 골격 | 골격 면 밝기 |
| A2 · A3 · A5 · A10 | 카드 글리프·아이콘 칸 넷 · `Needs review`·`Not saved`·`Unsent` · 종류 칩 셋 · `on-hue` 아바타 |

### 1.2 열린 질문 §5-4 · §5-6

- **§5-4 키비주얼** — 라이트 PNG 넷이 다크 장식 패널 위에서 어울리는지, `auth-hero-*`로 맞췄는지 · 안 맞으면 후속 이슈 후보 노트.
- **§5-6 가이드 스크린샷** — 다크 본문 안 라이트 이미지의 테두리·여백 처리안.

### 1.3 핸드오프 묶음

`design_handoff_color_scheme`가 프로젝트에 없다(브리프 §8). 토큰 표(다크 칸 전부 — Tailwind 이름 또는 hex) · 아트보드 ID별 상태 이름 · §2를 벗어난 항목 노트를 함께 넣는다.

## 2. 다음 판에서 판정할 것

### 2.1 scrim 위 모달의 층 (A4)

`#171717` 위에 검정 @40%를 덮으면 `rgb(14,14,14)`다 — canvas `#0a0a0a`와 거의 같고, 그 위 모달 면 `#171717`과의 차이가 작다. 모달 가장자리가 면 차이만으로 서는지 A4에서 본다.

- 서면 그대로 둔다.
- 안 서면 **모달 윤곽 선**을 먼저 제안한다. 알파(`/40`·`/32`)는 코드 리터럴이라 올리면 라이트도 함께 짙어진다 — 그쪽을 고르면 두 테마 판을 같이 그린다.

### 2.2 `subtle`의 방향 (A6)

라이트 `subtle`은 흰 카드 안 **한 단계 꺼진 면**(`#fafafa`)인데, 다크 `#1c1c1c`는 background보다 밝아 **떠오른 면**이 된다. design.md 후보를 따른 값이지만 background와 약 1.05:1이라 사실상 점선 테두리만 남는다. A6에서 "비어 있는 값 상자"로 읽히는지 판정하고, 방향을 유지하면 이유를 노트에 적는다.

## 3. 노트에 한 줄 더할 것

- **`primary-foreground`가 면으로도 쓰인다** — default 버튼 hover · FieldTrigger hover · Publish 표 머리 · 문서 표 머리. 다크 `#1f1f1f`(= `popover`)를 고른 근거(반전값 neutral-900이면 hover가 0)는 맞다. 토큰 하나가 "primary 위 글자"와 "면"을 겸한다는 사실을 노트에 남긴다 — 토큰을 나누자는 제안까지는 필요 없다.

## 4. 그대로 둔다 (재계산으로 확인)

| 항목 | 값 |
|---|---|
| 브리프 §6 쌍 전부 | 하한 통과 — `ring`/background 4.87 · `ring`/popover 4.48 · `destructive`/@8% 5.84 · `muted-foreground`/muted 6.0 · `foreground` @60%/muted 5.94 |
| 라이트 수용 예외 셋 | 다크에서 모두 하한을 넘는다 — 노트 그대로 |
| §5-2 accent == muted | 유지 판단 맞다 |
| §5-7 ring blue-500 | 맞다 |
| §5-1 층 구별 | canvas → background → popover 세 단계 맞다 |
| A8 토스트 | `popover`·`border`·`foreground` — §2 그대로 |
| B3 · B5 · B6 | 낙관적 busy · 되돌린 뒤 notice inset · §7 문구 그대로 |
| `gray-dim` | 3.78 — 노트의 근거대로 수용 |
