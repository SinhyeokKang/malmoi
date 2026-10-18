# landing-kv-background — design

## 영향 받는 흐름

**공개 화면 하나** — `/` 랜딩. push·편집 UI·pull 무관. 서버·DB·인증 경계 변경 없음.

| 층 | 파일 | 변경 |
|---|---|---|
| 격자 판정(순수) | `lib/signin/dot-field.ts` | 스크롤 오프셋을 받는 격자 함수(아래 §3). 잎 모듈(import 0) 그대로 |
| 캔버스 배선 | `components/signin/dot-field.tsx` | `follow` prop 하나 — `"canvas"`(기본, 지금 동작) · `"scroller"`(랜딩). 복제하지 않는다 |
| 랜딩 구조 | `app/page.tsx` | 히어로 `section`과 `<Stage>`를 `[data-landing-kv]` 래퍼로 감싼다. 히어로에 `relative` |
| 공개 셸 | `components/public-shell/public-shell.tsx` | `kv` prop 하나(기본 `false`) — 켜면 `<main>`의 `border border-border-subtle` · `shadow-low` · `bg-background`만 뺀다(§2 R13). 기본 클래스 문자열은 고치지 않는다 |
| 스테이지 | `components/landing/stage.tsx` | `--landing-stage-h`를 쓰는 자리를 `[data-landing-root]`에서 래퍼(또는 스크롤러)로 한 칸 올린다(§2 R3) |

## 1. 값 — 새 토큰 없음

| 토큰 · 상수 | Light | Dark | 쓰는 곳 |
|---|---|---|---|
| `--auth-hero-from` | `#f5f6f7`(= `--canvas`) | `#0a0a0a` | 그라디언트 위 끝 = 히어로 윗변 |
| `--auth-hero-to` | `#d7e3fe` | `#172554` | 그라디언트 아래 끝 = 마무리 CTA 아랫변 |
| `--signin-dot` | `#2563eb` | `#60a5fa` | 캔버스 `style.color` → 계산값으로 칠한다(기존 `DotField`) |
| `DotField` 상수 | — | — | `GAP 16` · 반지름 `2 → 3.5` · 알파 `0.08 → 0.3` · 커서 반경 `180` · 자동 순회 `320px/s` · `5`줄 — 로그인과 같다 |

값은 전부 `app/globals.css`의 `light-dark()`에 이미 있다(`:290` `--signin-dot` · `:312-313` `--auth-hero-from`/`-to` — Dark는 `neutral-950`·`blue-950`·`blue-400` 토큰). 위 hex는 그 값을 옮긴 것이다.

## 2. 구조

```
<PublicShell kv>                                 // R13 랜딩만 — <main> 보더·그림자·바탕색 없음. 스크롤러 = 패널 안 유일한 세로 스크롤러(PublicScroller)
  <div data-landing-kv className="relative">     // R1 래퍼 — 콘텐츠 높이 전체
    <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-auth-hero-from to-auth-hero-to" />  // R2
    <DotField follow="scroller" className="pointer-events-none sticky top-0 block w-full
         h-[var(--landing-stage-h,calc(100svh-98px))] -mb-[var(--landing-stage-h,calc(100svh-98px))]" />  // R3
    <section aria-labelledby="landing-hero" className="relative …">   // R4
    <Stage … closing={<section className="relative …">} />
  </div>
</PublicShell>
```

- **R1** 래퍼가 그라디언트의 길이를 정한다 — 히어로 윗변에서 CTA 아랫변까지 한 장. 섹션마다 칠하면 경계에서 색이 끊긴다.
- **R2** 그라디언트는 래퍼의 첫 자식 `absolute inset-0`이다. 패널(`PublicShell`의 흰 면)이나 스크롤러에 칠하지 않는다 — 패널에 걸면 길이가 한 화면이 되어 첫 화면이 로그인 KV 강도로 파래진다.
- **R3** 캔버스는 스크롤러 높이 한 장이고 sticky다. 높이는 스테이지가 쓰는 `--landing-stage-h`(JS 전 폴백 `calc(100svh-98px)` — `stage.tsx:305,312`의 98 = 셸 치수 합)를 같이 쓰고, 같은 값의 음수 `margin-bottom`으로 흐름에서 자리를 차지하지 않는다. 지금 `--landing-stage-h`는 `[data-landing-root]`에 쓰인다(`stage.tsx:128`) — 래퍼에서 읽으려면 그 변수를 래퍼(또는 스크롤러)에 쓰도록 올린다. ⚠️ 98 폴백이 세 자리에 서므로 셸 치수가 바뀌면 같이 고친다(그 주석 그대로).
- **R4** 내용 섹션은 `relative`다 — 위치 지정된 sticky 캔버스보다 나중에 그려져야 점이 버튼·문구 위에 오지 않는다. 히어로 `section`에 `relative`를 더한다(스테이지 트랙 `stage.tsx:305`·CTA는 확인 후 필요하면 더한다).
- **R5** 목업 프레임은 불투명 그대로다.
- **R12** `/docs`·`/privacy`·`/changelog`에는 없다 — 래퍼는 `app/page.tsx`에만 있다.
- **R13** 랜딩 패널은 보더·그림자가 없다(사용자 2026-10-18, `lg` 미만 시안 K1 주석). 로그인 KV 패널(`auth-layout.tsx` `Decoration` — `rounded-xl` · 그라디언트 · 보더·그림자 없음)과 같은 그릇으로 맞춘다.
  - `PublicShell`의 `kv`(기본 `false`)가 켜질 때만 `<main>`에서 `border`·`border-border-subtle`·`shadow-low`·`bg-background`를 뺀다. radius · `relative flex min-h-0 flex-1 overflow-hidden`은 그대로다.
  - `bg-background`까지 빼는 이유는 고무줄 스크롤이다(사용자 2026-10-18). 스크롤러가 `overscroll-contain`이라 Safari·iOS에서 그 안쪽은 여전히 튕기고, 그라디언트는 콘텐츠 래퍼에 있으니 튕긴 자리에는 `<main>` 바탕이 드러난다. 바탕이 없으면 캔버스 색이 보이고, 위 끝은 `--auth-hero-from`과 같아 이음매가 없다. 아래 끝은 캔버스 색 띠가 남는다 — 받아들인다. 로그인 KV 패널도 바탕색 없이 그라디언트만 있다. 넘기는 곳은 `app/page.tsx` 하나다.
  - ⚠️ **기본 갈래의 클래스 문자열을 재배열·재작성하지 않는다** — `/docs`(`bare`)·`/privacy`·`/changelog`는 지금과 바이트 단위로 같아야 한다. 테스트가 그 문자열을 고정한다.
  - 그라디언트 위 끝이 캔버스 색과 같다(Light `#f5f6f7` · Dark `#0a0a0a`). 그래서 스크롤 0에서는 패널 윗변이 캔버스에 녹는다. 로그인 KV와 같은 모습이라 보정하지 않는다.

## 3. `DotField` `follow="scroller"` — 판정은 순수 함수로

로그인(`follow="canvas"`, 기본)의 동작은 바이트 단위로 같아야 한다.

| 항목 | 로그인(지금) | 랜딩 `follow="scroller"` |
|---|---|---|
| R6 격자 위치 | 캔버스 좌표 고정(`dotGrid(width, height, GAP)`) | 행을 `-(scrollTop % GAP)`에서 시작해 `h + GAP`까지 — 점이 콘텐츠에 박힌 것처럼 올라간다. 스크롤러 `scroll`(passive)에서 다시 그린다 |
| R7 포인터 | 캔버스의 `pointermove`·`pointerleave` | 캔버스는 `pointer-events-none`(내용 아래). **스크롤러**(`[data-public-scroller]` — `closest`로 찾는다)에서 받아 스크롤러 rect 기준 좌표로 쓴다. 실제 커서가 자동 순회를 이기는 규칙은 같다. 단 `pointerType === "mouse"`만 실제 커서로 친다 — 터치 탭·드래그가 가상 커서를 탭 자리로 튀게 하지 않도록(터치는 자동 순회 상시 — §4) |
| R8 그리기 | 점마다 `beginPath · arc · fill`(≈ 4천 개) | 2560×1440 패널에서 ≈ 1만 3천 개. 반경 180 밖의 점(같은 반지름·알파)은 **한 path에 모아 fill 한 번**, 안쪽만 개별로 칠한다. 결과 픽셀은 같다 |
| 그대로 | DPR 버퍼 · 폭 0이면 루프 정지 · 계산된 `color`로 칠하기 · OS 테마 변경 시 다시 읽기 · 모션 감소면 정적 한 장 · `aria-hidden` | 같음. 모션 감소에서도 R6 스크롤 오프셋은 유지한다(스크롤마다 한 번 다시 그림 — rAF 루프가 아니다) |

**순수 함수**(`lib/signin/dot-field.ts`, 잎 그대로):
- `dotGrid(width, height, gap, offsetY = 0)` — `offsetY = scrollTop % gap`이면 행이 `-offsetY`에서 시작해 `height + gap`까지 간다. 기본값 0이면 지금 출력과 같다(로그인 불변).
- `partitionDots(dots, spot, radius)` → `{ near, far }` — R8의 묶음 그리기 입력. `spot === null`이면 전부 `far`. 이 둘로 그린 결과가 지금의 점마다 그리기와 같은 반지름·알파 집합임을 단위 테스트가 센다.

캔버스 배선(스크롤러 찾기·리스너·rAF)은 껍데기로 남는다 — 판정은 위 둘이 든다.

⚠️ **하지 말 것**: 캔버스를 콘텐츠 높이(약 7H)로 키우기 — 1440×900에서도 버퍼가 1422 × 5600 × DPR²다. 한 장 sticky + 오프셋이 같은 그림을 낸다.

## 4. 동작 — 무엇이 언제 보이나

| 스크롤 위치 | 보이는 것(1440×900 · Light) |
|---|---|
| 0 · 히어로 | 위 `#f5f6f7`에서 아래 약 `#eef1f8`. 흰 패널보다 한 단 어두운 면, 파랑은 거의 없다. 점은 0.08 알파로 질감만 남는다(시안 3c) |
| 고정 재생(트랙 6H) | 씬이 넘어갈수록 프레임 둘레 색이 조금씩 짙어진다(시안 2b) |
| 끝 · 마무리 CTA | `#d7e3fe`에 가장 가깝다. CTA `py-60`(240)이 가장 파란 구간에 앉는다. primary 버튼(`#171717`)과의 대비는 커진다(시안 2c) |

- **R9 Dark** — from이 캔버스(`#0a0a0a`)와 같아 패널(`#171717`)보다 콘텐츠가 한 단 어둡게 시작한다. Light의 흰 패널 위 `#f5f6f7`과 같은 관계라 보정하지 않는다(시안 3d).
- **R10 뷰포트** — 첫 화면에 걸리는 그라디언트 비율은 트랙이 H에 비례해 1280–2560에서 약 1/7로 같다. 격자 16은 고정이다.
- **R11 정적 흐름**(`Stage`의 `data-static`, 세로 부족) — 같은 래퍼라 그대로 적용된다. 트랙 높이가 달라지면 그라디언트 길이도 따라간다.
- **`lg` 미만**(사용자 2026-10-18 — 적용) — 그라디언트와 캔버스가 그대로 선다. 로그인처럼 숨기지 않는다. 목업 그릇은 뷰포트가 고른다(≥1024 D · 640~1023 T · <640 M — DESIGN §6.615 "뷰포트 그릇"). 터치 기기는 커서가 없으므로 **자동 순회가 상시 돈다**(2026-10-18 사용자 — 정적 한 장으로 바꾸지 않는다. 모션 감소 설정이면 지금처럼 정적이다). 시각은 시안이 정한다(design-brief).
- **CTA 아래 끝**(사용자 2026-10-18 — 가이드대로) — 그라디언트가 CTA 아랫변(패널 바닥)에서 끝난다.

## 5. 금지

- tsx에 hex·rgb 리터럴. 토큰 클래스와 `var(--signin-dot)`만 쓴다(DESIGN §6.2, `visual-system.test.ts`).
- `radial-gradient` 배경으로 점을 대신하기 — 점이 요소가 아니라 커서 확대가 안 된다(`dot-field.tsx` 머리 주석).
- 그라디언트를 `background-attachment: fixed`나 스크롤러에 걸기 — 길이가 콘텐츠가 아니라 화면이 된다(R2).
- `DotField`를 복사한 두 번째 컴포넌트 — 상수·판정이 두 벌이 된다.
- 목업 프레임·베젤·캡션 줄에 투명도·블러(R5).
- `dark:` 유틸(DESIGN §3.1 — 다크는 토큰이 든다).

## 순수 함수 (`/tdd` 진입점)

1. `dotGrid(width, height, gap, offsetY)` — `offsetY = 0`은 지금 출력과 같다(로그인 불변) · `offsetY = s % gap`이면 첫 행 y = `-offsetY`, 마지막 행 ≥ `height` · `offsetY`가 gap의 배수면 원위치와 같다.
2. `partitionDots(dots, spot, radius)` — `near ∪ far = dots`, 교집합 0, `far`의 모든 점은 `dotScale`이 기본값을 낸다, `spot = null`이면 `near = []`.

## 스키마 변경

없다.

## 새 환경변수

없다.

## 불변식 영향

없다 — export 결정성·blob SHA·인증 경계·`projectId` 좁힘과 무관한 공개 화면 장식이다. 클라이언트 그래프: `dot-field.tsx`는 이미 `"use client"`이고 `lib/signin/dot-field.ts`는 import 0인 잎이다 — 새 함수도 잎에 둔다(`client-graph.test.ts`).

## 과거 함정 (POSTMORTEM)

- **2026-10-12 — 고정 크기 스크롤러가 목차 disclosure의 본문 밀림을 알리지 않았다**: `PublicScroller` 안에서 크기가 바뀌는 요소가 스크롤러에 알려지지 않은 부류다. 이 기능의 캔버스는 sticky이고 음수 margin으로 흐름에서 자리를 차지하지 않으므로 콘텐츠 높이를 바꾸지 않아야 한다 — 래퍼 도입 전후 `scrollHeight`가 같은지 수동으로 잰다(T6).
- **2026-10-13 #260 — 셸이 뷰포트보다 길어져 바깥 스크롤이 생겼다**: sticky·absolute 층을 더하는 변경이라 `document.scrollingElement.scrollHeight === innerHeight`를 1280·768·375에서 다시 잰다(T6).
- 로그인 KV의 "캔버스 폭 0이면 루프 정지"(DESIGN §6.62)는 그대로 두되, 랜딩은 `lg` 미만에서 숨지 않으므로 그 갈래를 타지 않는다.
