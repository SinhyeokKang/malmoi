# ui-locales — 디자인 브리프 (Claude Design 입력)

이 문서는 Claude Design 시안을 만들기 위한 입력이다. 기능 결정의 정본은 `spec.md`·`design.md`이고, 이 브리프는 그 결정을 화면 단위로 옮긴 것이다.
**시안이 아래 "정해진 것"을 바꾸면 그것은 변경 요청이다** — `design.md`를 먼저 고친 뒤 구현한다(tasks S2).

## 1. 무엇을 그리나

| # | 화면 | 새것인가 |
|---|---|---|
| A | 공개 푸터의 **언어 스위처**(`LocaleSwitcher`) — 공개 셸(`/` · `/docs` · `/changelog` · `/privacy`)과 셸 밖 골격(`/signin` · 초대 수락 · 계정 병합) | 기존 푸터에 컨트롤 하나 추가 |
| B | **`/preferences`** — 셸 안 사용자 축 페이지, Language 카드 하나 | 새 페이지 |
| C | 사용자 축 내비에 `Preferences` 항목 — 사이드바 사용자 구역 + 헤더 사용자 메뉴(두 곳이 같은 목록 `navWorkItems`을 쓴다) | 기존 목록에 한 줄 |

**그리지 않는 것**: 타임존·테마 섹션, "곧 추가됩니다" 자리, 설정 검색, 탭. Preferences에는 **지금 카드가 하나뿐이다**(확장성 선반영 금지 — spec 비목표).

## 2. 정해진 것 (시안이 지킬 것)

- **지원 언어 셋** `English` · `한국어` · `Español`. 언어 이름은 **그 언어 자체의 표기(endonym)**로 쓰고 번역하지 않는다 — ko 화면에서도 `English`, es 화면에서도 `한국어`.
- **처음 온 사용자는 영어다.** 브라우저 언어를 보지 않는다. 그래서 스위처가 **영어를 못 읽는 사람도 찾을 수 있어야 한다** — 글자가 아니라 아이콘(지구본 `globe`, lucide)이 단서다.
- **고르는 즉시 적용한다.** 저장 버튼이 없고, 같은 페이지가 새 언어로 다시 그려진다. 다시 그려지는 것 자체가 피드백이라 **토스트가 없다.**
- **진행 중에는 컨트롤이 비활성이다**(한 번 더 누를 수 없다). 보통 1초 안이다.
- 푸터와 Preferences는 **같은 동작**이다 — 로그인 상태면 둘 다 계정에 저장되고, 어느 쪽에서 바꿔도 다른 쪽에 같은 값이 보인다.
- **라이트 단일**, 다크 시안 금지(DESIGN §3). 최소 너비 1280, 모바일 분기 없음(DESIGN §5).
- 새 색·새 radius·새 글자 크기를 만들지 않는다. 아래 §3의 기존 값으로 조립한다.

## 3. 써야 하는 기존 재료

토큰의 정본은 `app/globals.css`, 규칙의 정본은 `docs/DESIGN.md`다. 시안에 필요한 값만 옮긴다.

| 재료 | 값 |
|---|---|
| 글꼴 | Geist → Pretendard Variable(한글) — es의 á é í ñ ó ú ü ¿ ¡도 Geist가 덮는다 |
| 크기 | 본문 14(`text-sm`) · 보조 13(`text-xs`) · 셸 안 페이지 제목 18/500 · 카드 제목 15/500 |
| weight | 400·500만(24px 미만). 버튼·누르는 링크 라벨은 500 |
| 색 | `foreground` · `muted-foreground`(#737373) · `border` · `divider`(#f0f0f0) · `canvas` · `popover` · `accent`(hover) |
| 공개 푸터 (DESIGN §6.615 · §6.62) | 높이 40 · 13 muted · 가운데 정렬 한 줄 · 항목 간격 20 · 지금 내용 `© 2026 Malmoi · GitHub · Privacy Policy` · 캔버스 위 바닥 띠(위에 흰 패널) |
| DropdownMenu | `min-w-60` · radius 12 · border · `shadow-md` · `py-1` · 항목 `px-2 py-1.5` radius 4 14px · hover `accent` · 선택 `bg-muted` + `Check` 16 · 뷰포트 8px 안쪽 |
| Select | 입력 필드와 같은 테두리·radius 10·높이 36 · 트리거 오른쪽 끝 `chevron-down` 16 · 메뉴는 DropdownMenu와 같은 형 |
| Card (`/account`와 같은 껍데기, DESIGN §6.67) | radius 12 · border · 머리 `px-4 py-3`(제목 15/500 + 설명 13 muted — 폭 640 이상이면 제목 옆 `ml-auto`, 미만이면 아래로) · 머리 아래 `divider` · 본문 `px-4 py-3` |
| 셸 안 페이지 | `PanelHeader`(제목 한 띠, 상하 12 · 좌우 16) + `PanelBody`(padding 16, 상한 1280) · breadcrumb 없음(사용자 축) · 카드 사이 16 |
| 아이콘 | lucide 16 · 셸 내비 항목은 전부 아이콘을 든다(DESIGN §6.8) |
| Alert | radius 12 · padding 16 · 좌측 아이콘 16 · `danger` variant(카드 안 배치) |

**콤보박스 프리미티브는 없다.** 기본안은 **텍스트 버튼 + 기존 DropdownMenu의 라디오 목록**이다. 항목이 셋이라 검색 입력이 필요 없다.
검색형 콤보박스가 꼭 필요하다고 판단되면 그 근거를 시안 노트에 적는다(새 프리미티브는 소비자가 있어야 만든다).

## 4. 아트보드

### A. 푸터 스위처

| ID | 상태 | 확인할 것 |
|---|---|---|
| A1 | `/` 랜딩 푸터, en, 닫힘 | 스위처 **위치**(줄 끝? 가운데 줄 안 마지막 항목?) · 트리거 형(지구본 14~16 + `English` + `chevron-down`?) · 기존 링크 셋과 같은 무게로 읽히는가 |
| A2 | hover · 키보드 focus | 기존 푸터 링크의 hover(`foreground`)·focus ring과 같은 형 |
| A3 | 열림 | **푸터가 화면 바닥이라 메뉴가 위로 열린다** · 정렬(트리거 기준 start/center/end) · 현재 언어에 체크 · 항목 셋 |
| A4 | 진행 중 | 트리거 비활성 형(스피너를 넣는가, 지구본을 스피너로 교체하는가 — DESIGN §6.4 `Button loading`: 아이콘이 있으면 **교체**한다) |
| A5 | ko로 바뀐 뒤 랜딩 푸터 | `© 2026 Malmoi · GitHub · 개인정보 처리방침 · 🌐 한국어` |
| A6 | es로 바뀐 뒤 랜딩 푸터 | `© 2026 Malmoi · GitHub · Política de privacidad · 🌐 Español` — **푸터에서 가장 긴 조합** |
| A7 | `/signin`(2열, 오른쪽 장식) 푸터, en | 셸 밖 골격에서도 같은 형인지 · 캔버스 위 대비 |

### B. `/preferences`

| ID | 상태 | 확인할 것 |
|---|---|---|
| B1 | 기본, en, 계정 값 `English` | 페이지 제목 · Language 카드 머리(제목 + 설명) · 본문의 Select 배치(라벨 열을 두는가 — `/account` Profile의 `PanelFacts` 라벨 96 형을 빌릴지, Select 하나만 둘지) · Select 폭(Profile 이름 필드 320과 맞출지) |
| B2 | Select 열림 | 옵션 셋(endonym) · 현재 값 체크 |
| B3 | 진행 중 | Select 비활성 |
| B4 | 실패 | 카드 안 `Alert danger` — 아래 §5 `failed` 문구. 자리는 카드 본문 위(다시 고를 Select가 바로 아래에 있다) |
| B5 | 세션 장애로 이 기기에만 적용됨 | 카드 안 `Alert` — §5 `deviceOnly`. 실패가 아니라 경고 톤(화면 언어는 바뀌었다) |
| B6 | ko 렌더 | 같은 페이지, 한국어 문구 |
| B7 | es 렌더 | 같은 페이지, 스페인어 문구 — 카드 설명이 가장 길어지는 경우의 줄바꿈 |
| B8 | 로딩 골격 | 카드 껍데기·머리 padding·divider는 실물이고, 움직이는 것은 글자·필드 자리뿐(DESIGN §6.67 로딩 골격 규칙) |

### C. 내비 항목

| ID | 상태 | 확인할 것 |
|---|---|---|
| C1 | 사이드바 사용자 구역 `Projects · MCP connector · Account · Preferences` | 아이콘 선택(후보 `settings-2` · `sliders-horizontal` — `Account`의 `circle-user`와 구별되어야 한다) · `/preferences`에서의 선택 상태 |
| C2 | 헤더 사용자 메뉴 열림 | 같은 목록이 메뉴 첫 묶음에 들어간 모습 |
| C3 | 접힌 사이드바(40 레일) | 아이콘만 남았을 때 `Account`와 구별되는가 |

## 5. 문구 (en · ko · es)

시안에 실제 문구를 넣는다 — 특히 **es가 가장 길어** 넘침을 찾는 데 쓴다. 최종 문구는 구현 때 `messages/*.tsx`가 정본이고, 시안 단계에서 문장을 다듬어도 된다.

| 키 | en | ko | es |
|---|---|---|---|
| 페이지 제목 | Preferences | 환경설정 | Preferencias |
| 카드 제목 | Language | 언어 | Idioma |
| 카드 설명 | The language Malmoi uses on every screen. Your projects' languages don't change. | Malmoi 화면에 표시할 언어입니다. 프로젝트의 번역 언어는 바뀌지 않습니다. | El idioma de todas las pantallas de Malmoi. Los idiomas de tus proyectos no cambian. |
| 스위처 접근 이름 | Language: English. Change language | 언어: 한국어. 언어 변경 | Idioma: Español. Cambiar idioma |
| `failed` | We couldn't change the language. Try again. | 언어를 바꾸지 못했습니다. 다시 시도하세요. | No pudimos cambiar el idioma. Inténtalo de nuevo. |
| `deviceOnly` | Changed on this device only. Your other devices keep the previous language. | 이 기기에만 적용됐습니다. 다른 기기에서는 이전 언어가 유지됩니다. | Cambiado solo en este dispositivo. Tus otros dispositivos mantienen el idioma anterior. |
| 푸터 방침 링크 | Privacy Policy | 개인정보 처리방침 | Política de privacidad |
| 내비 항목 | Preferences | 환경설정 | Preferencias |

ko 문체는 **합니다체**, es는 **tú**다(design §6). 문장 규칙은 DESIGN §10(sentence case · 라벨 마침표 없음 · please/sorry 금지 · 오류는 다음 행동을 말한다).

## 6. 열린 질문 (시안이 답한다)

1. 스위처를 푸터 줄의 **어디에** 두는가 — 가운데 한 줄 안의 마지막 항목(기존 형 유지) / 줄 오른쪽 끝(언어 바꾸기를 찾는 관습적 자리). 기본안은 **가운데 줄의 마지막 항목**이다(푸터가 지금 한 줄 가운데 정렬이고, 바닥 띠 40에 좌우 분리를 들이면 형이 하나 늘어난다).
2. 트리거에 `chevron-down`을 붙이는가 — 메뉴가 위로 열리는데 아래 화살표가 맞는가.
3. Preferences 카드 본문 — Select 하나만 / 라벨 열 + Select(`PanelFacts` 형). 기본안은 **Select 하나만**이다(카드 제목이 이미 `Language`라 라벨을 한 번 더 쓰게 된다).
4. 내비 아이콘.

## 7. 핸드오프 산출물

- 파일 이름: `design_handoff_ui_locales` (아트보드 ID는 §4 그대로 — `/design-sync`가 프레임 단위로 대조한다).
- 각 아트보드에 **치수 주석**(높이·padding·gap·radius)과 상태 이름을 붙인다. 실측은 computed style과 접근성 트리로 하므로 값이 시안에 적혀 있어야 한다.
- 시안이 §2를 바꿨다면 바꾼 항목과 이유를 별도 노트로 남긴다.
