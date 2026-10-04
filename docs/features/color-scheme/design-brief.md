# color-scheme — 디자인 브리프 (Claude Design 입력)

이 문서는 **다크 테마 시안**을 만들기 위한 입력이다. 기능 결정의 정본은 `spec.md`·`design.md`이고, 이 브리프는 그 결정을 토큰과 화면 단위로 옮긴 것이다.
**시안이 아래 "정해진 것"을 바꾸면 그것은 변경 요청이다** — `design.md`를 먼저 고친 뒤 구현한다(tasks S2).

⚠️ **이 시안은 기존 화면의 다크 판이다.** `/design-sync`는 원래 신규 페이지의 초기 구현에만 쓰지만, 이번에는 사용자가 예외를 승인했다(2026-10-04).
그래서 이 시안은 **레이아웃·치수·문구를 바꾸지 않는다** — 바꾸는 것은 **색 값**뿐이다. 새 카드는 Preferences의 Theme 카드 하나다.

## 1. 무엇을 정하나

| # | 산출 | 설명 |
|---|---|---|
| T | **다크 토큰 값 표** | §3의 토큰마다 다크 값 하나. **토큰을 늘리거나 합치지 않는다** — 필요하면 노트에 근거와 함께 적는다 |
| A | **대표 화면 다크 아트보드** | §4. 토큰 값이 실제 화면에서 성립하는지 보여 준다. 각 아트보드 옆에 같은 화면의 라이트(지금 화면)를 둔다 |
| B | **Preferences의 Theme 카드** | 라이트·다크 두 판 + 상태(§4 B) |

**그리지 않는 것**: 고대비·세피아 등 세 번째 테마 · 사용자 정의 색 · 공개 푸터의 테마 스위처(전환은 Preferences에서만 한다) · 다크 가이드 스크린샷 · 다크 초대 메일 · 모바일 레이아웃.

## 2. 정해진 것 (시안이 지킬 것)

- **선택지는 System · Light · Dark 셋이고 기본값은 Light다.** 고르지 않은 사람은 지금 화면 그대로 본다. System은 OS 설정을 따르고, OS 설정을 바꾸면 새로고침 없이 따라간다.
- **앱과 공개 페이지 전부가 같은 토큰으로 칠해진다** — 셸 안 화면, 랜딩·`/docs`·`/privacy`·`/changelog`, 셸 밖 골격(`/signin`·초대 수락·OAuth 동의).
- **컴포넌트는 테마를 모른다.** 다크 값은 토큰에만 있다(`dark:` 유틸 금지). 그래서 **"이 화면만 다크에서 다르게"는 만들 수 없다** — 같은 토큰을 쓰는 자리는 두 테마에서 같이 움직인다. 한 자리만 달라야 하면 토큰을 나누자는 제안으로 노트에 적는다.
- **팔레트는 neutral이다** (DESIGN §2). 라이트가 slate(푸른 회색)에서 neutral로 옮긴 이유는 "화면 전체가 시안보다 파랗게 보였다"였다. **다크 회색도 푸른 틴트 없이 neutral 계열로 둔다.**
- **상태 색 체계는 하나다** (DESIGN §2.4): 초록 = 끝났고 정상, 호박 = 손봐야 하지만 깨지지 않음, 빨강 = 실패, 회색 = 정보·대기. 다크에서도 같은 상태는 같은 톤이다.
- **`--destructive`는 글자색 전용이고 면은 알파로만 쓴다** (DESIGN §2.3). 꽉 찬 빨간 면은 다크에서도 없다.
- **식별색 8개(hue)는 이름 해시로 정해지는 프로젝트·사람 색이다.** 같은 프로젝트가 화면마다 같은 색이어야 하므로 **hue는 그대로** 두고, 다크에서는 흰 글리프가 읽히는지만 확인한다.
- **오버레이(`scrim`)는 다크에서도 어둡게 덮는다.**
- **레이아웃·치수·문구는 바꾸지 않는다.** 최소 너비 1280, 모바일 분기 없음.
- **고정 자산**: 로그인 키비주얼 PNG 넷은 라이트 그림 그대로 다크 패널 위에 놓인다(바꾸려면 PNG를 새로 만들어야 한다 — 그 판단만 노트에 남긴다). 국기는 국기 그대로다. 가이드 본문 이미지는 라이트 스크린샷이다.

## 3. 토큰 — 다크 값을 채울 표

값의 정본은 `app/globals.css`다. 라이트 값은 지금 화면 그대로이고 hex는 Tailwind v4 팔레트의 근삿값이다(실제 정의는 oklch).
**채울 칸은 "다크" 하나다.** "방향"은 출발점일 뿐이다.

### 3.1 기본 표면·글자 (기존 토큰)

| 토큰 | 의미 | 라이트 | 다크 | 방향 |
|---|---|---|---|---|
| `canvas` | 앱 전체 바깥 배경 — 셸(헤더·사이드바 바탕)·셸 밖 화면 | `#f5f6f7` | | 가장 어두운 면 |
| `background` | 패널·카드 면, 페이지 바탕 | `#ffffff` | | canvas보다 **한 단계 밝게** — 패널이 캔버스 위에 떠 있는 구조다(§5-1) |
| `popover` | 메뉴·팝오버·Select 목록 면 | `#ffffff` | | background보다 한 단계 더 밝게? |
| `foreground` | 기본 글자 | `#0a0a0a` | | 순백보다 약간 낮게 |
| `primary` | 주요 CTA 면 — 화면당 하나 | `#171717` | | 반전(밝은 면) |
| `primary-foreground` | primary 위 글자 | `#fafafa` | | 반전 |
| `muted` | 보조 면 · 비활성 배경 · 표 머리 | `#f5f5f5` | | |
| `accent` | hover 면 — ⚠️ 지금 `muted`와 **같은 값**이다(DESIGN §2.1) | `#f5f5f5` | | 같은 값 유지 여부를 노트에 |
| `muted-foreground` | 보조 글자 | `#737373` | | background 위 AA |
| `destructive` | 오류 글자 · 붉은 알파 면의 재료 | `#dc2626` | | 밝은 빨강 |
| `border` | 구조 선 | `#e5e5e5` | | |
| `border-subtle` | 떠 있는 패널의 바깥 윤곽(border보다 한 단계 연함) | `#e9ecef` | | |
| `divider` | 목록·표 안에서 행을 가르는 선 | `#f0f0f0` | | |
| `input` | 입력 필드 테두리 | `#e5e5e5` | | |
| `ring` | 포커스 링 — 지금 blue-400, 흰 배경 2.54:1(3:1 미달을 **수용**한 결정) | `#60a5fa` | | 다크에서 3:1을 넘는지 |
| `link` | 링크·검색 일치 색 | `#2563eb` | | 밝은 파랑 |
| `gray-light` | 무채 계단 — 체크박스·점선 상자·자물쇠 | `#d4d4d4` | | |
| `gray-dim` | 무채 계단 — 카드 글리프·0인 수치·보관 행 | `#a3a3a3` | | |
| `gray-strong` | 무채 계단 — 한 단계 아래 글리프 | `#525252` | | |
| `signin-dot` | 로그인 오른쪽 장식의 점(Canvas, 알파는 따로) | `#2563eb` | | |
| `auth-hero-from` | 로그인 오른쪽 장식 그라데이션 위 — **canvas와 같은 값**이 의도 | `#f5f6f7` | | canvas와 같게 |
| `auth-hero-to` | 같은 그라데이션 아래 — 파랑이 든다 | `#d7e3fe` | | 어두운 파랑 |
| `shadow-color` | elevation 둘(`shadow-low` 5% · `shadow-medium` 15%)의 그림자 색 | `rgb(22 24 27)` | | 검정 · 알파를 올릴지 노트에 |

### 3.2 상태·종류·식별 (Phase 1에서 raw 색을 옮긴 새 토큰)

| 토큰 | 의미 | 라이트 | 다크 | 방향 |
|---|---|---|---|---|
| `success-surface` | 성공 Alert 면 | green-50 `#f0fdf4` | | 초록 알파 면 |
| `success-soft` | 성공 배지·아이콘 칸 면 | green-100 @80% `#dcfce7` | | |
| `success-foreground` | 성공 면 위 글자·글리프 · diff `+` 글리프 | green-800 `#166534` | | 밝은 초록 |
| `warning-surface` | 경고 Alert 면 | amber-50 `#fffbeb` | | 호박 알파 면 |
| `warning-soft` | 경고 배지·아이콘 칸 면 | amber-100 @80% `#fef3c7` | | |
| `warning-soft-foreground` | 경고 면 위 글자 | amber-800 `#92400e` | | |
| `warning-foreground` | 표면 위 경고 글자 — `Needs review`·`Not saved`·미저장 수 | amber-700 `#b45309` | | |
| `warning-emphasis` | 진행 막대의 검토 대기 구간 · 대기 테두리(@50%) | amber-500 `#f59e0b` | | |
| `danger-surface` | 실패 Alert 면 | red-50 `#fef2f2` | | 빨강 알파 면 |
| `info-surface` | 정보 Alert 면 | blue-50 `#eff6ff` | | 파랑 알파 면 |
| `diff-removed` | Publish diff 삭제 글자 · 삭제 낱말 면(@14%) | red-700 `#b91c1c` | | |
| `diff-added` | Publish diff 추가 낱말 면(@16%) | green-800 `#166534` | | |
| `kind-blue-surface` · `kind-blue` | Logs 종류 칩 면 · 글리프 | blue-50 · blue-700 `#1d4ed8` | | |
| `kind-teal-surface` · `kind-teal` | 〃 | teal-50 `#f0fdfa` · teal-700 `#0f766e` | | |
| `kind-violet-surface` · `kind-violet` | 〃 | violet-50 `#f5f3ff` · violet-700 `#6d28d9` | | |
| `subtle` | 카드 안에서 한 단계 꺼진 면(Logs 상세의 비어 있는 값 상자) | neutral-50 `#fafafa` | | |
| `scrim` | 오버레이 — Dialog @40% · LargeModal·목업 @32% | `#0a0a0a` | | 검정 유지 |
| `hue-rose` · `-orange` · `-amber` · `-emerald` · `-teal` · `-sky` · `-indigo` · `-fuchsia` | 프로젝트·사람 식별색(썸네일·아바타 면) | `#e11d48` · `#ea580c` · `#d97706` · `#059669` · `#0d9488` · `#0284c7` · `#4f46e5` · `#c026d3` | | **그대로** — §2 |
| `on-hue` | 식별색 위 글자·글리프 | `#ffffff` | | 그대로 |

### 3.3 토큰이 아니라 알파로 칠하는 자리 — 다크에서 자동으로 뒤집힌다

아래는 `foreground`·`destructive` 등의 **알파**라서 따로 값을 정하지 않는다. 다크에서 "밝은 색을 얇게 깐다"가 된다. **아트보드에서 여전히 읽히는지만 확인**하고, 안 읽히면 토큰을 나누자는 제안으로 노트에 적는다.

| 철자 | 자리 |
|---|---|
| `foreground` @3% · @7% | 사이드바·행의 hover · 선택 |
| `foreground` @2% · @5% | 아주 옅은 면 · neutral 아이콘 칸 |
| `foreground` @6% (선) | 헤더 급 구분선 |
| `foreground` @60% | muted 면 위 글자(DESIGN §2.2 — muted 면 위 `muted-foreground`는 AA 미달이라 쓴다) |
| `destructive` @8% | 붉은 면 — 실패 배지·아이콘 칸·danger 버튼 면(글자는 `destructive`) |
| `link` @14% | 검색 일치 강조 |
| `primary` @85% | primary 버튼 hover |
| `background` @20% · @50% | 진행 중 흐리기 |

## 4. 아트보드

각 아트보드는 **다크 판 + 같은 화면의 라이트 판**을 나란히 둔다. 1440×900 기준. 데이터는 그럴듯한 실례(키 수백 개, 언어 넷, 상태 섞임)로 채운다.

### A. 대표 화면 (다크)

| ID | 화면 | 확인할 것 |
|---|---|---|
| A1 | 셸 + `/projects` — 그룹 카드 셋, 행마다 진행 막대, 상태 칩(Active · Sync failed · Partially synced · Archived) | canvas ↔ 패널 ↔ 카드의 층 구별 · 사이드바 hover·선택(알파) · 식별색 썸네일 · 보관 행(`gray-dim`) |
| A2 | Home (`/projects/[slug]`) — 카운트 카드 넷 · 주의 카드 · Recent logs · 메타 열 | 카드 글리프(`warning-foreground`·`link`·`gray-dim`) · 아이콘 칸 넷(success·neutral·warning·danger) · 0인 수치 |
| A3 | 번역 작업 화면 — 트리 · 키 목록 · 로케일 세 패널, 편집 중인 셀 하나 | `Needs review`·`Not saved` 글자 · `Unsent` 배지 · `Untranslated` · 입력 필드 테두리·포커스 링 · 행 hover·선택 · 보류 배너(`Alert neutral`) |
| A4 | Publish 모달 — diff 표(삭제·추가 낱말 강조), Held back 목록 | `diff-removed`·`diff-added` 면·글자 · `scrim` 위 모달 · `shadow-medium` |
| A5 | Logs — 날짜 카드 + 이벤트 행, 종류 칩 셋(blue·teal·violet) · 결과 배지 | 종류 칩 면·글리프 · 성공이 회색인 예외(DESIGN §2.4 예외 2) |
| A6 | Logs 상세 모달 — 소스별 결과, 비어 있는 값 상자 | `subtle` 면 · 점선 테두리 |
| A7 | Sources 상세 `LargeModal` — 언어 행 진행 막대(검토 대기 구간) · 사라진 언어 `soft-red` 배지 · 기준 언어 Select 대기 테두리 | `warning-emphasis` 막대·@50% 테두리 · `destructive` @8% 면 |
| A8 | Alert 다섯 + 배지 다섯 + 토스트 — 한 장에 모은 견본 | success·warning·danger·info·neutral Alert · `text`·`soft-neutral`·`soft-green`·`soft-amber`·`soft-red` 배지 · sonner 성공·오류 토스트 |
| A9 | 버튼 견본 — primary · default · outline · ghost · danger · busy · 꺼짐, 그리고 입력·Select·체크박스·라디오의 쉼·hover·포커스·꺼짐 | primary 반전 · danger(붉은 면 + 붉은 글자) · 포커스 링 대비 · 네이티브 컨트롤(체크박스·스크롤바)이 다크인지 |
| A10 | Members — 멤버 행(아바타 식별색) · 역할 칩 · 대기 초대 | `on-hue` 글자 · 꺼진 행 |
| A11 | 랜딩 `/` — 히어로 + 스크롤 목업 한 장면(번역 화면·Publish 모달 목업) | 목업이 제품 다크와 같은 토큰으로 그려짐 · 공개 셸 헤더·푸터 |
| A12 | `/docs` 한 페이지 — 문서 내비 · 본문 · 코드 블록(YAML `<pre>`) · 가이드 스크린샷(라이트 그대로) | 라이트 스크린샷이 다크 본문 안에서 튀는 정도 — 테두리·면을 둘지 노트에 |
| A13 | `/signin` — 2열, 오른쪽 장식(그라데이션 + 점 + 키비주얼 카드 넷) | `auth-hero-from/to` · `signin-dot` · **라이트 키비주얼 PNG가 다크 패널 위에 놓인 모습** · 로고(§5-3) · Google·GitHub 버튼 |
| A14 | `/mcp` — 연결 앱 행의 에이전트 로고(Claude · OpenAI) | **OpenAI 로고는 검정 마크다** — 다크 면 위에서 공식 흰 판으로 바뀐다고 보고 그린다 |
| A15 | 빈 상태 · 로딩 골격 각 하나 | 골격 면의 밝기 |

### B. Preferences — Theme 카드

Preferences 페이지에는 앞 기능이 만든 **Language 카드**(ui-locales)와 **Time zone 카드**(user-timezone)가 이미 있다. Theme 카드는 **그 아래 세 번째**다. 앞의 두 카드는 기존 형 그대로 자리만 그린다.

| ID | 상태 | 확인할 것 |
|---|---|---|
| B1 | 라이트, 값 `Light` | 카드 머리(제목 + 한 문장 설명) · 본문은 **Select 하나**(라벨 열 없음, 폭 320) · Select 아래 도움말 한 줄 — Language 카드와 같은 형 |
| B2 | Select 열림 | 옵션 셋, 각 앞에 lucide 16 글리프 `monitor`(System) · `sun`(Light) · `moon`(Dark) · 현재 값 체크 |
| B3 | 진행 중 | Select `busy`(포커스 유지 — Language 카드와 같은 형). **고른 값을 먼저 보인다**(낙관적 표시), 스피너 없음 |
| B4 | 다크로 바뀐 뒤 | 같은 페이지 전체가 다크 — 고르는 즉시 적용되고 화면이 다시 그려지는 것 자체가 피드백이라 **토스트가 없다** |
| B5 | 실패 | 카드 `notice` 슬롯의 `Alert danger inset`(카드 좌우 끝, radius 0) · Select는 원래 값으로 돌아간다 |
| B6 | ko · es 렌더 | 같은 카드, 한국어·스페인어 문구 — es 도움말이 가장 길다 |

## 5. 열린 질문 (시안이 답한다)

1. **층 구별** — 라이트는 "연회색 canvas 위에 흰 패널이 떠 있고, 경계는 흰색 대비와 `shadow-low`가 만든다"이다. 다크에서는 그림자가 잘 안 보인다. 기본안은 **canvas가 가장 어둡고 패널(`background`)이 한 단계 밝은 것**이다. 그러면 `border-subtle` 윤곽을 얼마나 진하게 할지도 함께 정한다.
2. **`accent` == `muted`** — 라이트에서 같은 값이라 muted 면 위 hover가 없다(DESIGN §2.1). 다크에서 둘을 가를지, 같은 값을 유지할지.
3. **로고** — `malmoi-icon-black`(검정 면 + 흰 마크)은 다크에서 `malmoi-icon-white`(흰 면 + 검정 마크)로 바꾼다는 것이 기본안이다. 다크 헤더에서 흰 사각이 너무 튀면 다른 안을 노트에 적는다(새 로고 자산을 만들어야 하는 안이면 그 사실도).
4. **키비주얼 PNG** — 라이트 카드 그림 넷을 다크 장식 패널 위에 그대로 둘 수 있는가. 안 되면 "다크 PNG 네 장 제작"이 필요하다는 판단과 근거를 노트에 적는다.
5. **국기** — 흰 부분이 많은 국기(일본·한국 등)가 다크 면 위에서 윤곽 없이 떠 보이는가. 얇은 테두리가 필요하면 그 값을 토큰 후보로 적는다.
6. **가이드 스크린샷** — 라이트 이미지가 다크 문서 본문 안에서 너무 밝으면 테두리·여백 처리를 제안한다(이미지 자체는 바꾸지 않는다).
7. **포커스 링** — 라이트는 3:1 미달을 수용했다. 다크에서 3:1을 넘는 값이 있으면 그것을 고른다.

## 6. 대비 — 시안이 지킬 하한

구현은 아래 쌍을 **두 테마에서** 계산해 테스트로 고정한다. 시안 값이 이 하한을 넘어야 구현이 green이다.

| 쌍 (글자 / 면) | 하한 |
|---|---|
| `foreground` / `background`·`popover`·`canvas`·`muted` | 4.5 |
| `muted-foreground` / `background` | 4.5 (⚠️ `muted` 면 위는 라이트에서도 4.34로 미달 — 그 자리는 `foreground` @60%를 쓴다. 다크에서도 같은 규칙이면 된다) |
| `primary-foreground` / `primary` | 4.5 |
| `destructive` / `background` | 4.5 |
| `link` / `background` | 4.5 |
| `success-foreground` / `success-soft`·`success-surface` | 4.5 |
| `warning-soft-foreground` / `warning-soft` | 4.5 |
| `warning-foreground` / `background` | 4.5 |
| `diff-removed` / `background` | 4.5 |
| `kind-*` / `kind-*-surface` | 4.5 |
| `on-hue` / `hue-*` | 4.5 (라이트에서 미달인 hue가 있으면 노트에 수치만) |
| `ring` / `background` | 3 (라이트는 2.54로 수용 — 다크에서 넘기면 좋다) |
| `border` / `background` (정보를 나르는 경계만) | 3 |
| `destructive` 글자 / `destructive` @8% 면 | 라이트 약 4.3 수용(DESIGN §2.3) — 다크에서도 같은 수용이면 수치를 적는다 |

## 7. 문구 (Theme 카드 — en · ko · es)

최종 문구는 구현 때 `messages/*.tsx`가 정본이고, 시안 단계에서 다듬어도 된다. ko는 **합니다체**, es는 **tú**다. 문장 규칙은 DESIGN §10(sentence case · 라벨 마침표 없음 · please/sorry 금지 · 오류는 다음 행동을 말한다).

| 키 | en | ko | es |
|---|---|---|---|
| 카드 제목 | Theme | 테마 | Tema |
| 카드 설명 | How Malmoi looks on every screen. | Malmoi 화면의 밝기를 정합니다. | Cómo se ve Malmoi en todas las pantallas. |
| 옵션 | System · Light · Dark | 시스템 · 라이트 · 다크 | Sistema · Claro · Oscuro |
| Select 아래 도움말 | System follows your device's appearance setting. | 시스템은 기기의 화면 모드 설정을 따릅니다. | Sistema sigue la configuración de apariencia de tu dispositivo. |
| `failed` | We couldn't change the theme. Try again. | 테마를 바꾸지 못했습니다. 다시 시도하세요. | No pudimos cambiar el tema. Inténtalo de nuevo. |

## 8. 핸드오프 산출물

- 파일 이름: `design_handoff_color_scheme` (아트보드 ID는 §4 그대로 — `/design-sync`가 프레임 단위로 대조한다).
- **§3 표의 "다크" 칸을 전부 채운 토큰 표**를 핸드오프에 함께 넣는다 — 구현은 아트보드가 아니라 이 표를 `app/globals.css`로 옮긴다. 값은 hex 또는 Tailwind 팔레트 이름(예: `neutral-900`, `green-400 @15%`)으로 쓴다.
- 각 아트보드에 상태 이름을 붙인다. 치수는 라이트와 같으므로 다시 적지 않는다(Theme 카드만 치수 주석).
- 시안이 §2를 바꿨거나 토큰을 나누거나 합치자고 제안하면, 바꾼 항목과 이유를 별도 노트로 남긴다.
