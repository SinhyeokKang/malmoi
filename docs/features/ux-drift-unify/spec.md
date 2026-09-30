# ux-drift-unify — spec

## 사용자

**번역 편집자(비개발자 동료)가 주 대상이다.** 상태를 배지·색·문장으로 읽고 다음 행동을 고르는 사람이라, 같은 상태가 화면마다 다르게 보이면
"다른 일이 생겼다"로 읽는다. **개발자(OWNER)**는 연결·토큰·파괴 동작 쪽에서 같은 문제를 겪는다 — 되돌릴 수 없는 동작이 한 화면에서만
안전한 버튼으로 보인다.

**둘이 갈리는 결정은 편집자 쪽을 고른다** — 상시로 보는 화면(번역·Logs)에서 가장 흔한 상태는 조용하게 둔다(보류 배너·Logs 성공의 neutral 예외),
드물게 보는 화면(Home·목록)은 사람이 할 일이 있으면 호박이다. 로그아웃 확인 제거(Q4)는 둘 다에게 같은 동작이다.

## 문제 (관측 — 2026-09-30 전수조사)

`/ux-audit` 프롬프트(차원 7개: 상태 표현 · 문구 · 동작 배치 · 구조 · 시각 토큰 · 판정 중복 · 가이드↔화면)로 dev `fdccb260`을 전수 조사했다.
원시 181건, 차원 간 중복을 합쳐 약 157건, **🔴 15건**(사용자가 다른 상태로 읽는다).

부류는 다섯이다.

1. **판정이 두 벌이다** — 설치는 있고 `repositoryId`가 null인 프로젝트를 `/projects`는 호박 Disconnected, Home은 회색 not-connected, Settings는
   "Not connected"로 셋이 갈려 말한다(`lib/projects/list.ts:80`, `lib/github-connect/health.ts:76`). 표면이 여럿이면 목록이 서로 다른
   표면의 값을 섞는다(`lib/keys/query.ts:349-350`). 연결이 끊겨도 번역 화면의 Publish·Sync는 켜져 있다(#52 재발 경로).
   (목록 초록 Active ↔ Home 빨강 Wrong repository는 `repo-replaced`에서만 생기고 D2로 **남는다**.)
2. **일부 반영·밀림을 "실패"로 말한다** — `partial-import`가 Sources 행 칸에서 빨강, Home 메타에서 "failed 10m ago", 전 표면 Superseded가
   Home에서 호박 "Sync could not finish"(Logs는 회색 Superseded).
3. **낱말이 개념 밖으로 샌다** — 연결 끊김을 "paused"·"held"로(held는 편집 보류 전용), 적재 보류를 "held back"으로(Publish 일부 보류 전용),
   동기화 실패를 다섯 문장으로, 미번역을 "Missing only"로 말한다.
4. **프리미티브를 우회한다** — 손 조립 알약(`Pill`)·카드 머리·실패 띠·스피너·닫기 버튼, 호출부가 조립한 칸 색, 계산하고 버린 tone.
5. **정본끼리 모순이다** — DESIGN §2.4 ↔ §6.2 ↔ §6.4 ↔ §6.67 ↔ 1766행, 가이드 어휘표(AUTHORING) ↔ §2.4.

원인과 재발 경로는 조사 문서(`~/Desktop/malmoi-ux-drift.md` §1)에 있다: 규칙이 컴포넌트 단위였고, 화면 단위 핸드오프가 정본이었고,
테스트가 한 화면 안의 결정만 고정했고, 리뷰·감사의 범위가 전부 diff였다. **항목 원본(157건)은 커밋하지 않는다** — 이 기능의 범위는
tasks.md에 ID로 적힌 **닫힌 목록**이고, 뺀 🟡·⚪는 tasks.md "제외 ID" 표에 사유와 함께 남는다.

## 사용자 결정 (2026-09-30 · 리뷰 반영 2026-10-01)

| # | 결정 | → 완료 조건 |
|---|---|---|
| D1 | **설치 기록은 있고 `repositoryId`가 null인 프로젝트 = Disconnected(호박, 재연결 필요).** Home·Settings·적재 거부 문구를 목록에 맞춘다. 버튼은 Reconnect. | 3, 5 |
| D2 | **목록의 연결 판정이 GitHub을 안 보는 틈은 받아들이고 문서화한다.** App 제거·`installation-changed`·`repo-replaced` 셋, 그리고 목록(`lastPrUrl` 번호)·Home(sync 브랜치)의 PR 조회 대상 차이를 DESIGN §2.4 "알려진 틈"에 적는다. 목록 판정은 그대로다. | 7 |
| D3① | **보류 톤은 warning(호박) 유지.** (neutral로 한 번 번복 후 호박으로 확정.) **예외 하나 — 번역 화면의 `pending-edits` 배너는 neutral**(편집 한 건마다 상시로 서고, 같은 화면의 Unsent가 neutral이다 — 2026-10-01). DESIGN §6.2의 neutral 행과 옛 "paused" 문구를 고친다. | 1 |
| D3② | **사라진 언어 배지는 `Badge missing` 하나.** 소비자가 하나뿐인 `danger` variant를 지운다. 국기는 상태 글리프가 아니라 "배지 안 글리프 금지"에서 면제한다. | 1 |
| D3③ | **Logs 결과 글리프 칸도 §2.4 아이콘 칸 색을 따른다.** §6.2의 "별도 축" 문장을 지운다(종류 칩 blue·teal·violet만 별도 축으로 남는다). **예외 — Logs의 성공 결과는 배지·칸 모두 neutral**(가장 흔한 상태가 가장 조용하다 — 2026-10-01). | 1 |
| D3④ | **확인 Dialog의 Cancel은 `default`.** §6.4 한 줄을 코드에 맞춘다. | 1 |
| D3⑤ | **Home Recent logs의 결과 배지는 행 오른쪽.** DESIGN 1766행과 `logs-card.tsx` 주석을 코드에 맞춘다. | 1 |
| Q1 | **Logs의 Sync 실패 배지는 "Failed" 유지** — 종류 배지 "Sync"가 앞에 선다. §2.4에 "Logs는 결과에서 종류를 빼고 말한다" 한 줄. | 1 |
| Q2 | **칩·띠 모두 끊김이 먼저** — `/projects` 칩 순서가 Disconnected > Sync failed > Partially synced > Not synced yet·Setup > Active로 바뀐다(§2.4 칩 줄 수정). | 7a |
| Q3 | **Unsent는 `Badge neutral`** — 로컬 `Pill`과 목업 사본을 지운다. | 12, 18 |
| Q4 | **로그아웃은 어디서나 확인 없음** — `/account`의 "Sign out?" Dialog를 걷는다. "Sign out everywhere"는 확인을 유지한다. | 18 |
| Q5 | **복호화 실패 이름은 "Unavailable" 하나** — Members의 "Couldn't be read"를 합친다(조치 안내는 보조 문장이 든다). | 14 |
| Q6 | **보류·열린 PR 판정 한 벌을 이번에 넣는다** — Home이 열린 PR을 조회해 `planHoldNotice`를 받고(편집 > 0이면 조회를 생략, 보조줄만 스트리밍), 목록은 PR 조회 실패를 **네 경로 전부**(거부·클라이언트 실패·전체 마감·행 조립) "모름"으로 표시한다. | 7b |
| Q7 | **번역 화면 연결은 DB 판정 + 스트리밍, Home PR 조회도 스트리밍, 전후 측정.** 5회 중앙값이 `loadEventEnd` 또는 `responseEnd`에서 +150ms 또는 +15%를 넘으면 멈추고 보고한다. | 5, 19 |
| Q8 | **radius는 크기 급** — 확인 Dialog 12 · 1024 모달·이력 상세 16. DESIGN §5에 한 줄. 코드 변경 없음. | 1 |
| Q9 | **Home 할 일 행도 보조줄을 본문 아래로** — 다른 행과 같은 형. | 13 |
| Q10 | **Publish 결과의 무색 `Notice`를 `Alert`로 합친다** — §6.2의 "Publish 성공 둘은 무색 블록" 등재를 지운다. | 13 |
| Q11 | **`/ux-audit` 스킬 신설 + `/implement`에 "새 사전 키 전 같은 개념 grep" 체크.** | 20 |
| Q12 | **MCP `get_project.connection`은 출력 불변** — `unpinned`는 MCP 출력 경계에서 `not-connected`로 매핑한다(외부 계약을 이번에 넓히지 않는다 — 2026-10-01). | 21 |
| Q13 | **카운트 배지 "0이면 서지 않음"은 로컬 카운트 8곳(트리·세그먼트·필터 숫자 포함)까지 전부 대상이다**(2026-10-01). | 10 |
| Q14 | **범위 경계** — `isExpired`는 초대·MCP 토큰 6곳만(OAuth 5곳 제외), Logs "Not sent"는 Unsent와 다른 개념(Publish 거부 결과), MCP 연결 앱의 "Never"(마지막 사용)는 유지(2026-10-01). | 13 |

## 선행 순서

- **`translation-filter-scope` T12 → 이번 T20.** 같은 파일(`key-list.tsx`·`workspace.tsx`·번역 `page.tsx`·`guide/translate/edit.md`)을 고치고,
  그쪽 T5가 먼저 들어가야 T20 측정의 기준선이 선다.
- **`nightly-sync` G5는 이번 T1에 흡수한다** — G5가 적으려던 `12 hours ago · nightly`는 T18(배지 먼저)과 반대이고, `upToDate` slate 등재는 §2.4와 부딪힌다.

## 완료 조건 (검증 가능한 문장)

**정본**

1. DESIGN §2.4가 상태 톤·낱말을 한 표로 들고 `lib/status/canon.ts`를 코드판 정본으로 가리킨다. §6.2·§6.4·§6.67·§6.68·§6.8·1766행이 §2.4와
   모순되는 문장을 들지 않는다 — tasks T1의 대조 체크리스트(D3①~⑤·Q1·Q2·Q3·Q4·Q5·Q8·Q9·Q10 각 한 줄) 전부 ✓. §2.4에 D1(`unpinned` → Disconnected),
   D2(알려진 틈 넷), **예외 둘**(번역 화면 `pending-edits` neutral · Logs 성공 neutral), **글리프 열**(성공·경고·실패·필드 오류), **동작 규칙**
   (파괴 확정 → 트리거도 `danger` · 독립/행 링크의 파랑 = 새 탭 외부만, 문장 안 인라인 링크는 파랑 허용)이 있다.
2. `guide/AUTHORING.md`의 어휘표가 §2.4의 상태 낱말(Unsent·Held·Sync failed…)과 모순되지 않는다.

**판정 한 벌 (🔴 C·D·E·F·B)**

3. `lib/status/__tests__/cross-screen.test.ts`가 아래 **화면 × 입력 행렬**을 전수로 돌고, 칸마다 같은 `STATE` 키가 나온다(N/A 칸은 해당 판정이 없음을 단언한다).

   | 입력 \ 판정 | 목록 칩·띠 | Home | Settings | Sources | 적재 거부 |
   |---|---|---|---|---|---|
   | `repositoryId null`(설치 있음) | Disconnected | Disconnected | Disconnected | N/A | Disconnected 낱말 |
   | 설치 없음 | Setup | N/A(readiness가 먼저) | Not connected | N/A | Not connected 낱말 |
   | `partial-import` | Partially synced | Partially synced | N/A | Partially synced | N/A |
   | `import-failed` | Sync failed | Sync failed | N/A | Sync failed | N/A |
   | 표면 A 동기화 중 + B 실패 | Sync failed | Sync failed | N/A | 표면별 | N/A |
   | 표면 A partial + B failed | Sync failed | Sync failed | N/A | 표면별 | N/A |
   | 보관 + `repositoryId null` | Archived | Archived(버튼 꺼짐) | N/A | N/A | N/A |
   | `unpinned` + probe error | Disconnected | Disconnected | Disconnected | N/A | N/A |
   | 표면 0개 | Setup | Setup | N/A | N/A | N/A |
   | 편집 > 0 · 편집 0 + PR 열림 · PR 조회 실패 + 편집 > 0 | 띠 Unsent · PR open · Unsent | Held(pending) · Held(PR) · Held(pending) | N/A | N/A | N/A |

4. 표면이 여럿인 프로젝트의 목록 칩·행 띠·Home 배너가 **표면별 `failing` 후 가장 나쁜 것 하나**를 고른다 — 순수 조립 함수 단위 테스트 +
   `test:projects:postgres`의 "A 동기화 중 + B 실패" 행.
5. 설치 없음 또는 `repositoryId null`인 프로젝트의 번역 화면에서 Publish·Sync가 **첫 렌더부터** 꺼진다(DB 판정). App 제거·설치 교체·리포 교체는
   스트리밍으로 도착한 뒤 꺼진다. 조회 실패(`unknown`)는 버튼을 끄지 않는다.
6. 전 표면 superseded인 수동 Sync 결과는 Home에서 neutral "Superseded"이고 Logs와 같다 — `summarizeImport.tone`과 `summarizeImportEvent` 톤의 합치 테스트가 `finishSurface` 모양 입력 전 조합에서 green.
7. DESIGN §2.4 "알려진 틈"에 넷(App 제거 · `installation-changed` · `repo-replaced` · 목록/Home PR 조회 대상 차이)이 한 줄씩 있다.
7a. 목록 칩이 끊김·실패·일부 반영이면 같은 행의 띠도 같은 상태를 말한다(칩 Active + 띠 Unsent·PR open·검토 대기는 정상 조합). 칩 순서는 Q2.
7b. 편집 0건 + 말모이 PR 열림이면 Home이 Held를 말한다 — `planHoldNotice`가 게이트(`planProtectedImport`·`planOpenPrGate`)와 같은 입력을 받는다.
    Home의 PR 조회 실패는 Held(warning) + 사유 "couldn't check for an open pull request"다(게이트가 fail-closed). 목록은 PR 조회가 실패하면
    (거부 · 클라이언트/토큰 실패 · 전체 마감 · `query.ts` 행 조립 네 경로 모두) "없음"이 아니라 warning 띠 "Couldn't check for an open pull request"를 표시한다.
    전체 마감이면 PR 번호가 있는 모든 행에 이 띠가 서는 것이 정직한 결과다.

**화면 (🔴 A·G·H·I·J·K·L·M·N + 🟡·⚪)**

8. `partial-import`는 어느 화면에서도 빨강·"failed"·"could not finish"로 말해지지 않는다 — warning · "Partially synced".
9. 되돌릴 수 없는 동작의 확정 버튼은 전부 `danger`이고, 확정이 `danger`면 트리거도 `danger`다(Sync만 §6.644 예외) — DOM 테스트가 Dialog 트리거 목록을 렌더해 센다.
10. 카운트 배지는 0이면 서지 않고, 숫자는 `aria-hidden` + sr 문장이다 — `CountBadge` 소비자 전부(카드·머리 + 로컬 8곳, Q13).
11. 셸 안 독립·행 링크의 파랑은 전부 새 탭 외부 링크다 — 앱 안 이동은 foreground + chevron. 문장 안 인라인 링크는 예외다.
12. 랜딩 목업의 상태 표시(PR 열림·미번역·Unsent·선택 면)가 실물 컴포넌트와 같은 variant·클래스다.
13. tasks.md에 ID가 적힌 항목이 전부 해소됐다(닫힌 목록). "제외 ID" 표의 항목은 사유가 있다.

**재발 방지**

14. `lib/i18n/__tests__/terminology.test.ts`의 금지 목록이 이번 동의어를 센다 — 사전 0건. `ALLOWED`가 접두·복수 금지어를 표현하고 그 판정식에 메타 테스트가 있다.
15. `components/__tests__/visual-system.test.ts`(또는 형제 테스트)가 이번 부류를 센다 — `ExternalLink` import 0, `ui/` 밖 `animate-spin` 0(`[&_.animate-spin]` 선택자와 T28 허용 목록 제외),
    셸 안 카드 `rounded-xl` 0(패널만), `"partial-import"` 비교가 `lib/projects/import-failure.ts` 밖 0, `IconTile`의 tone 색(green·amber·destructive) `className` 덮기 0.
    **규칙마다 메모리 카나리아(위반 주입 → red)와 스캔 대상 수 하한이 있다.**
16. 가이드: 사전 게이트가 **보이는 라벨**만 인정하고(aria 전용 축 이름 red), 가이드 산문의 금지 동의어가 0이고, SHOOTING 매핑이 사전 키를
    소스로 받아 낱말만 바뀐 컷도 `pnpm guide:check`의 stale에 뜬다.
17. `pnpm gate` green — **커밋 경계마다.**
18. Unsent `StatusBadge`·로그아웃 무확인·확인 Dialog 초기 포커스가 브라우저에서 한 번씩 확인됐다([수동], POSTMORTEM 2026-09-20·24).
19. 번역 화면·Home 착지의 전후 측정이 ARCHITECTURE §1.95 표에 있고 판정선(Q7) 안이다.
20. `.claude/commands/ux-audit.md`가 있고, CLAUDE.md 스킬 수·워크플로 절이 그것을 세며, `pnpm sync:agents:check` green.
21. `get_project.connection`이 `repositoryId null` 프로젝트에서 `"not-connected"`다 — MCP 도구 테스트가 고정한다.

## 비목표

- **`Permission` 확장(`repository:sync`) — PRODUCT §4.2 비범위.** "역할이나 `Permission`을 늘리는 순간 이 비범위에 든다." `role === "OWNER"` 손 비교
  15곳(판정 차원 6-Y11)은 이번에 손대지 않는다.
- **목록의 연결 판정을 GitHub으로 하는 것**(D2). 목록의 연결 판정은 DB만 본다 — 원격 신호(열린 PR·base 비교)는 이미 부르지만 그 실패를 연결 판정에 쓰지 않는다.
- **MCP 출력 계약의 확장**(Q12).
- **번역 화면의 필터 순서 변경·검색 0건 빈 상태** — `translation-filter-scope`가 다시 설계한다(그 spec 완료 조건 9). 이번 빈 상태 통일(4-Y15)에서 번역 화면은 뺀다.
  가이드가 그 순서를 따라가는 것(7-⚪8)만 이번 T25가 맡는다.
- **가이드 스크린샷 재촬영** — 이 기능은 stale 판정이 뜨게 하는 것까지다. 촬영은 `/guide-shots`로 따로 한다(로컬 런타임 전용).
- **요청하지 않은 재배치·새 화면** — 조사 문서가 지목한 항목만 고친다.
