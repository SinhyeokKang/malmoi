# disabled-reasons-revert — 꺼진 Sync·Publish의 보이는 사유 줄 제거

상태: 스펙(2026-10-11). [설계](design.md) · [태스크](tasks.md). 브리프 없음(새 표면 없이 줄 하나를 걷는 변경 — 시안 불필요).

## 사용자 결정 (2026-10-11)

> "PanelHeader에 Nothing to send — every edit is already sent. 이거 원래 잇었음?" → "결정 번복. 그냥 제거해" → (범위 질의 뒤 최종) **"responsive-app 이전의 상태로 돌아가길 원해. 그 부분만 부분적으로 제거한다."**

**responsive-app의 F7·O10(2026-10-11 같은 날 사용자 결정)을 뒤집는다.** F7은 "꺼진 컨트롤의 사유를 터치에서도 보이게 버튼 아래 `text-xs` 줄로 — 모든 폭", O10은 "그 줄이 `Nothing to send`·EDITOR ownerOnly·일시 잠금까지 모든 사유를 든다"였다. 결과로 미전달 0인 평상시에 번역 화면·Home 머리에 `Nothing to send — every edit is already sent.`가 늘 서 있었다.

## 확정 (2026-10-11 사용자 질의)

- **범위 = responsive-app이 더한 것만** — "responsive-app 이전의 상태로 돌아가길 원해. 그 부분만 부분적으로 제거한다." 그 전부터 있던 보이는 사유(OAuth 동의 상태 문장 · Add sources 행 안 사유 · Revert 푸터 · CI 카드 · 멤버 · 계정 · 소스 · 환경설정 · MCP 토큰 폼 · Logs 필터 · 마법사 바닥)는 **건드리지 않는다**(중간에 받은 "전부 걷는다"·"앱 전체 한 규칙" 답을 이 확정이 대신한다).
- 보류 배너의 원인 문장 복원(R-04) — 사용자 수용.
- 터치에서 꺼진 이유가 안 보이는 대가 — 사용자 수용(F7 이전과 같다).

## 사용자

번역 편집자(비개발자 동료)와 개발자 둘 다 — 두 화면 머리를 매일 본다.

## 문제 (관측)

- 미전달 0이 **평상 상태**인데, 그 상태에서 머리 아래에 꺼진 이유 문장이 상시 선다. 버튼 배지·꺼진 모양이 이미 같은 말을 한다.
- 넓은 폭에서도 머리가 한 줄(+22px) 늘었다(O10이 받아들인 대가).

## 완료 조건

| ID | 판정 |
|---|---|
| R-01 | 번역 화면·Home 머리에서 꺼진 [Sync]·[Publish] 아래 보이는 사유 줄이 **어떤 상태에서도 서지 않는다**(미전달 0 · EDITOR · 연결 끊김 · 보관 · Publish 진행 중 · 잠금) — 모든 폭 |
| R-02 | 꺼진 버튼은 `aria-disabled` 그대로 포커스를 받고, 사유는 **F7 이전 형**으로 남는다 — 마우스 `title` + 버튼 `aria-describedby` → 자기 sr-only 문장. 문장은 지금과 같은 판정(`planPublishButton`·호스트의 Sync 사유)에서 온다 |
| R-03 | Home 동기화 실패 배너 [Try again]이 막혔을 때도 같은 형(`title` + 자기 sr-only)이다 — 머리 줄을 가리키던 O19 연결을 걷는다 |
| R-04 | 번역 화면의 보류 배너(`EditLossBanner`)는 Publish가 연결 때문에 꺼졌을 때 **그 원인 문장을 다시 잇는다**(malmoi#160 원형) — 이 화면엔 Home 연결 배너가 없어, 줄이 사라지면 보이는 원인 문장이 여기뿐이다. 막다른 [Send with Publish]는 계속 세우지 않는다 |
| R-05 | 랜딩 목업의 사유 줄 사본이 없어진다 — responsive-mockup K1이 R-01의 실물 줄을 복제한 것이라 실물과 함께 걷는다(responsive 이전 목업엔 없었다). 목업 그릇 선택(mockup-viewport-container)과 파일이 겹치지 않는다(`mockup/translations.tsx` vs `stage.ts`) |
| R-06 | `DisabledReasons` 프리미티브가 소비자 0이 되어 삭제된다 — 프리미티브 수·DESIGN §6.4·DIRECTORY·CLAUDE.md 표가 함께 움직인다 |
| R-07 | 정본(DESIGN §7 "꺼진 컨트롤의 사유" · §5.15 · §6.5 Home 행 · §6.615 목업)이 새 규칙을 말한다. 바뀐 화면의 가이드 컷은 `pnpm guide:check` 결과대로 재촬영된다 |

## 비목표

- **responsive-app 이전부터 있던 보이는 사유는 그대로 둔다**(위 확정) — git 대조(`bc8b204f^` = responsive 착수 직전): OAuth 동의 상태 문장, Add sources 행 안 사유, Revert 푸터, CI 카드, 멤버 목록·머리, 계정 로그인 수단·세션(`needsMethod` — v1.3.0), 소스 상세·제거·기준 언어, 환경설정 카드, MCP 토큰 폼, Logs 필터, 마법사 바닥. DESIGN §7의 행 안 글자 규칙은 유지된다.
- 패널 머리 `PANEL_HEAD_ROW`의 `items-start`(#227)는 되돌리지 않는다 — 줄이 없어도 제목 칸 `min-h-9 items-center`가 버튼과 가운데를 맞춘다. 주석만 고친다.
- 새 화면 문구·사전 키 없음. 터치에서 꺼진 이유를 보는 다른 장치(툴팁·팝오버)를 만들지 않는다 — F7 이전의 대가(터치엔 `title`이 안 뜬다)를 다시 받는다.
