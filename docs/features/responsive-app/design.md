# responsive-app — 기술 설계

[스펙](spec.md) · [태스크](tasks.md) · [공개 공유 계약](../responsive-public/design.md).

## 1. 영향 흐름·소유권

편집 UI의 배치·탐색을 바꾼다. Save/Publish/Sync/Revert 및 관리 Actions는 기존 진입점을 유지한다. push·pull·인가·보호 지문 코어는 변경하지 않는다.

| 배치 | 소유 영역 | 연결 |
|---|---|---|
| A2a | `app/(edit)/layout.tsx`, `components/shell/shell-panels.tsx`, `components/shell/header.tsx`, `components/shell/sidebar.tsx`, `components/projects/project-list.tsx`, `app/(edit)/projects/[slug]/(home)/page.tsx` | 공개 단계(P2)의 헤더 배치표·측면 서랍·검색/Inbox/오버레이 재사용 |
| A2b | `components/logs/`, `components/sources/sources-screen.tsx` 및 상세, `app/(edit)/account/`, `app/(edit)/preferences/` | Sources 읽기 배치 소유; 관리 동작은 A2d |
| A2c | `lib/translations/layout.ts`, `components/translations/workspace/` | 기존 draft/navigation/guard·잠금 유지 |
| A2d | `components/onboarding/`, `components/members/`, Sources 관리, `app/(edit)/projects/[slug]/settings/`, `app/(edit)/mcp/` | 실제 카드 컴포넌트 소비자까지 추적; 직접/intercept 공통 흐름 |
| A2e | `components/landing/mockup/app-frame.tsx`, `translations.tsx`, `publish.tsx`, `components/landing/stage.tsx`, `lib/landing/stage.ts` | P5 뒤·A2a~d 배치 확정 뒤 순차 수정 |

## 2. 셸과 콘텐츠

뷰포트 `lg`(64rem) 미만은 내비 서랍, 이상은 기존 LNB 리사이즈/접힘(판정 기준은 공개 design §2 — 2026-10-07 사용자). 서랍은 P2의 `dialog.tsx` 측면 변형을 소비하고 같은 열림/닫힘/경로 이동/좁아지는 방향 포함 resize 포커스 계약을 쓴다. main 콘텐츠는 모드에 따라 다른 React 부모로 옮기지 않아 workspace·폼이 재마운트되지 않게 한다. 동적 sidebar 부착과 콘텐츠 host를 분리하고 서버 children prop 전달 경계를 유지한다.

현재 ShellPanels는 `sidebarPx` ref와 collapsed 상태로 사용자가 고른 값을 유지한다. 자동 좁음 전환으로 이 값을 저장하지 않는다. 접힘 여부는 기기 쿠키 `malmoi-sidebar-collapsed`에 남는데(2026-10-07, `lib/shell/sidebar-cookie.ts`) **쓰는 것은 사용자의 토글·드래그 스냅뿐**이다 — 좁은 모드의 서랍 전환·`onResize`는 그 쿠키를 쓰지 않는다. **두 Panel과 핸들은 항상 마운트하고 좁을 때 CSS로 숨긴다** — 사이드바 Panel을 조건부 렌더하면 콘텐츠 Panel의 형제 위치가 바뀌어 children이 재마운트된다. `onResize`는 `dragging`과 무관하게 `collapsedRef`·`setCollapsed`를 갱신하고(`shell-panels.tsx:140-147`) 폭 변화 effect(`:100-104`)는 매번 `setLayout`을 부르므로, **좁은 모드에서는 둘 다 건너뛴다.** 서랍 안 Sidebar는 `SidebarCollapseContext`를 `{collapsed:false}`로 덮고 접기 토글을 숨긴다 — 그대로 상속하면 데스크톱에서 40 레일로 접어 둔 사용자의 서랍 라벨이 inert로 숨고(`sidebar.tsx:107,128`) 토글이 숨은 데스크톱 패널을 조작한다. `panel-size.ts`의 px→% 계산은 넓은 모드의 측정 너비만 받는다. 좁은 모드에서 발생한 onResize가 선호폭/수동접힘을 덮지 못하게 하고, 복귀 시 이전 px를 그 시점 가용 너비에 clamp한다. 저장 범위를 새 localStorage나 폭 쿠키로 확대하지 않는다. 기존 번역 패널 선호폭 저장도 자동 clamp와 구분한다.

SSR 및 최초 클라이언트 상태는 같게, CSS로 좁은 기본 배치를 안전하게 만든 뒤 측정한다. 미측정 상태에서1280/772 고정폭을 잠깐이라도 강제하지 않는다. 경로 전환 중 두 ContentPanel이 공존할 수 있으므로 기존 동일 grid 셀·isolate 계약을 보존한다.

Home은 외부 콘텐츠 컨테이너960 미만 메타 아래 적층, 기존 카운트672 질의 유지. Projects/Members/Logs는 숨기기 대신 메타·행 동작을 아래로 보낸다 — Projects의 기존 `@max-[760px]:hidden` 미터 숨김(`project-list.tsx:288`)도 아래 줄 적층으로 바꾼다. 적층은 DOM 순서를 따른다. CSS `order`를 쓰거나 같은 컴포넌트를 두 번 그리지 않는다(DESIGN §7, malmoi#82 재마운트 착지 유실). 소스 상세 모달의 뷰포트 분기 `max-[850px]:`(`source-detail-modal.tsx:124-187`)는 컨테이너 기준으로 옮긴다. 폼320은 상한이 되며 Select/긴 경로/토큰/이메일에 min-w-0·줄바꿈·기존 복사 동작을 보존한다. 목록 의미 구조와 접근 이름을 레이아웃 때문에 제거하지 않는다. 스켈레톤도 같은 컨테이너 조건을 쓴다.

## 3. 번역 단일 판과 순수 함수

기존 `planTranslationPanelLayout({area, preferredLeft})`는772 미만에도 list336+gap16+locale420을 반환하고 scrollWidth772로 강제한다. 이를 **실제 카드 content box**의 단일 판으로 바꾼다.1024 뷰포트 여부로 번역 모드를 고르지 않는다.

제안 인터페이스(아직 미구현): 반환 타입을 `null | {mode:'single'; width:number} | ({mode:'split'} & 기존 다중판 필드)`로 명시한다. area가 null/비정상/0 이하면 null, 0<area<772는 single,772 이상은 기존 축소 순서(목록→트리→트리 접힘)와 키보드8px·Home/End 계약 유지. 기존 PANEL 상수에서772를 산출하여 중복 숫자를 줄인다.

**판 표시는 CSS가 정한다(SSR 첫 렌더 튐 방지).** 측정 전 `null`을 단일 판으로 그리면 주 사용자인 데스크톱이 매번 단일→분할로 튄다(§1.95 기준 5,000행 `loadEventEnd` 1.33초라 한 프레임이 아니다). 그래서 Workspace body(`workspace.tsx:807` bodyRef)에 `@container`를 선언하고, 판 표시는 자손의 컨테이너 쿼리(772)와 `data-pane` 속성 조합의 `display:none`으로 정한다. 측정 전 `null`은 현재처럼 데스크톱 fallback(`workspace.tsx:809`)을 쓰고 CSS가 좁은 폭을 바로잡는다. JS는 분할 판의 폭과 포커스 이동만 맡는다. `display:none`이 탭 순서·접근성 트리 제외를 함께 해결하므로 JS `inert`가 필요 없다. 선언 요소와 질의 요소는 분리한다(POSTMORTEM 1908). single에서는 ResizeHandle을 CSS로 숨긴다. A1에서 테스트 사례를 정리하고 A4에서 테스트를 먼저 red로 만든 뒤 반환 타입과 모든 소비자/테스트를 같은 커밋에서 갱신한다. 커밋 전 pnpm test·pnpm typecheck를 모두 통과해야 한다.

단일 판 표시 판정은 DOM 없는 작은 reducer로 분리한다(제안 위치 `lib/translations/compact-pane.ts`). 입력은 현재 pane(list/detail), 유효 선택키 유무, 사용자 show-list/show-detail, URL 선택 변경, 상세 입력 활성화 이벤트다. 상세 입력 활성화는 split에서도 입력 포커스·편집·IME 조합 시작 때 껍데기가 전달하며 저장된 pane를 detail로 갱신한다. reducer는 DOM을 조회하지 않는다. 출력은 다음 pane이며 폭·서버 I/O·draft를 소유하지 않는다. tree는 split의 접힌 트리와 같은 기존 Popover(`workspace.tsx:827,837-844`, `w-70`=280 — 375에 들어간다)로 열어 선택 후 목록으로 복귀한다. 앱 내비 서랍과 서랍형 표면이 겹치지 않고 포커스는 기존 Popover 복귀 계약을 따른다. pane 변경과 소스 선택은 다르며 후자는 기존 미저장 판정을 지난다.

선택/draft/저장 결과/필터는 현재 Workspace 한 벌이 소유한다. 현재 `draftReducer`·`planEditorNavigation`·sessionStorage 복구·save 결과 처리를 재사용한다. 넓음↔좁음은 키 변경 이벤트를 보내지 않는다. 로케일 입력의 조합/커서가 resize로 끊기지 않도록 동일 상세 DOM을 유지하고 숨은 판은 위 CSS `display:none`으로 탭·접근성 트리에서 제외한다. 같은 상세를 두 번 마운트하지 않는다. 목록 스크롤 ref와 선택행 포커스 복귀 대상도 Workspace 수명 안에 둔다. **`display:none`이 된 스크롤 컨테이너는 scrollTop을 잃으므로** 목록을 숨기기 직전 scrollTop을 Workspace ref에 저장하고 다시 보일 때 복원한다. 수천 행 목록의 재표시 비용은 A6에서 잰다.

single에서 상세를 여는 같은 키 재열기·다른 키 선택·다른 소스로의 키 이동·key 직접 URL/검색/Inbox 진입은 가시적인 상세 제목으로 포커스를 옮긴다. 상세 제목의 `tabIndex={-1}`은 **새로 만드는 요소**다(지금은 `workspace.tsx:755` 화면 h1과 `key-list.tsx:100` 목록 h2에만 있다). 숨은 목록 행을 기존 착지 대상으로 사용하지 않는다. 상세 제목은 로딩 스켈레톤·성공·빈/오류 본문이 바뀌어도 유지되는 상세 판의 껍데기에 둔다. 포커스 이전은 진입당 한 번이며, 응답 도착 시 사용자가 옮긴 포커스를 다시 빼앗지 않는다. 검색/Inbox 닫힘의 트리거 복귀보다 상세 착지가 우선한다. 미저장 확인에서 이동을 취소하면 기존 판·포커스를 유지하고, 목록 복귀는 선택행 복귀 계약을 따른다. resize·저장 결과에는 이 진입 착지를 재실행하지 않고 각각의 기존 포커스 규칙을 적용한다. split의 기존 착지 규칙은 유지한다.

트리/소스 범위 이동의 완료와 외부 key 착지는 서로 다른 판 전환 이벤트다. `treeQuery()`가 보내는 `key=@first`를 서버가 실제 첫 키로 해석해도, 승인된 내부 트리 이동의 결과는 single에서 목록을 유지한다. 키 값 변경만으로 detail 이벤트를 만들지 않는다. 미저장 확인을 통과한 이동 의도는 **클라이언트 모듈 변수 1회성**(`{surfaceSlug, 발급 시각}`)이 든다(2026-10-07 사용자). 다음 Workspace 마운트가 읽고 즉시 비우므로 새로고침·다른 탭에는 새지 않고, 소비 뒤 도착한 늦은 응답이 착지를 뒤집지 못한다. 다른 소스로의 재마운트에서도 목록을 유지하며, 첫 키의 선택 표시와 기존 URL 정규화는 보존한다. 결과가 0건이어도 목록의 빈 상태로 착지한다. 트리 서랍이 닫힌 뒤 포커스는 가시 목록의 선택행, 없으면 목록 제목으로 옮긴다.

이 의도는 해당 이동 완료에만 적용하고 취소·실패·다른 이동으로 대체되면 폐기한다. 취소 시 현재 판·포커스를 유지한다. 이후 직접 key URL·검색·Inbox에서 키를 열면 detail로 착지하며, 늦게 온 이전 트리 응답이 이를 목록으로 되돌리지 못한다. 판 구분을 위해 URL 인자나 history entry를 추가하지 않고 기존 키 선택·이탈확인·서버 검증을 유지한다. reducer에는 껍데기가 구분한 이동 이벤트만 전달한다.

### 전환 표 — 2026-10-07 사용자 확정

| 이벤트 | 판/URL | draft·포커스 |
|---|---|---|
| key 없는 직접 진입 | 목록 | 기존 초기 탐색 규칙 |
| key 있는 직접 URL/검색/Inbox 진입 | 상세 | 기존 선택키 서버 검증, single에서는 가시 상세 제목으로 착지 |
| 목록에서 **같은 키** 클릭 | 상세 열기, URL 불변 | 기존 navigation의 stay가 판 전환까지 막지 않게 분리, draft 보존, single에서는 가시 상세 제목으로 착지 |
| 목록에서 다른 키 선택(다른 소스 포함) | 기존 URL 전환 정책, single에서는 상세 | planEditorNavigation·이탈확인, 거부하면 현재 판·포커스 유지. 승인 후 가시 상세 제목으로 착지 |
| 트리/소스 범위 선택 | 기존 URL 전환 정책, single에서는 첫 키 응답 뒤에도 목록 | 이탈확인 통과 후 목록으로 복귀. 재마운트에도 이동 의도 유지, 선택행 또는 빈 목록 제목으로 착지 |
| 필터 변경 | 기존 URL 전환 정책 | planEditorNavigation·이탈확인, 거부하면 현재 판·포커스 유지 |
| ‘목록으로’ | URL·key 유지, list pane | draft 보존, 목록 위치/선택행 복귀, 저장 안 된 편집으로 돌아가는 경로 유지 |
| split에서 상세 입력 포커스·편집·IME 조합 시작 | 저장된 pane를 detail로 갱신, URL·history 불변 | 포커스·커서·조합 유지, draft 저장/폐기 없음 |
| resize | URL·draft 불변, single 진입 시 입력 중인 상세가 저장된 pane보다 우선. 그 외에는 현 pane 유지(첫 진입은 선택키에 따름) | 입력 중인 상세는 숨기거나 포커스를 옮기지 않음. 그 외 사라지는 판의 포커스만 대응 트리거/선택행으로 이동 |
| Save 실패/완료 | 상세 유지 | 기존 오류/결과 포커스, dirty·저자·needsReview 계약 유지 |
| Publish/Sync/Revert | 기존 확인/진행 흐름 | unsaved/lock 판정 우회 없음 |
| 브라우저 뒤로/앞으로 | 기존 history 이동 | useLeaveGuard와 복구 사본 유지; 새 가짜 history entry 없음 |

**큰 모달은 공개 규칙을 그대로 받는다**(2026-10-10 사용자): 앱의 LargeModal 소비자(Publish·로그 상세·Add sources·소스 상세·CI·초대·MCP 토큰·New project)는 `lg` 미만에서 전체 화면 시트다(공개 design §1 큰 모달 규칙). 규칙은 `large-modal.tsx` 그릇 상수 한 곳에 있고 P2가 넣는다 — 앱 배치는 모달별로 그릇·여백·footer를 다시 지정하지 않고, 시트 안 본문 배치(반복 행 적층·두 판→순차 판·긴 식별자 줄바꿈)와 소비자별 실측만 맡는다.

**소프트 키보드**: 단일 판 상세의 Save·Revert 줄은 상세 스크롤 영역 밖 sticky footer로 둔다 — 입력이 키보드에 가려도 Save가 키보드 바로 위에 선다. 모달은 공개 design §3의 `dvh`·sticky footer를 따른다.

목록 버튼과 history 관계는 위 표대로 확정됐다. 판 전환은 history entry를 추가하지 않으며, 같은 키 다시 열기와 dirty 보존을 구현 전 회귀 테스트로 고정한다. 기존 `useLeaveGuard`는 Navigation API index가 없는 브라우저의 popstate를 차단하지 못한다는 제한을 명시하고 있다. 반응형 완료가 이를 해결했다고 주장하지 않는다. 해당 브라우저의 이탈·복구 실물 결과를 기록하고 손실이 확인되면 앱 입력 완료 판정을 보류해 별도 결함으로 분리한다.

**터치**: 히트 영역·리사이저 `touch-action`·꺼진 컨트롤 사유의 보이는 줄은 공개 design §2를 따른다. 1024 이상 태블릿의 40 레일은 라벨이 `title`뿐이라 터치에서 안 보인다 — 대표 프레임 AT1 수령 때 처리를 정하고 그 전에는 동작을 바꾸지 않는다.

## 4. 온보딩·관리

`components/onboarding/steps/files.tsx`의 FILES_PANEL_WIDTH952는 모달1024 고정 가정이다. 공개 단계(P2)의 큰 모달 규칙으로 `lg` 미만 모달 폭이 뷰포트 폭(시트)이 되면 A5 전까지 이 분모가 실제 모달 폭과 어긋나므로 P2 실측이 앱 1280 미만에서 이 단계를 본다. 새 제안 `lib/onboarding/files-layout.ts`의 순수 판정은 핸들을 빼기 전 측정한 body content box 너비 `bodyWidth`를 입력받는다. 후보 하한200·핸들8·샘플 최소400을 합한608을 기준으로(샘플 최소400은 지금 코드에 없는 **새 값**이다 — 주석 `files.tsx:57`에만 있고 오른쪽 Panel(`:278`)에 `minSize`가 없다) `bodyWidth < 608`이면 후보/샘플 순차 판, 이상이면 두 판이다. 두 판의 비율을 계산할 때만 `available = bodyWidth - 8`을 산출하여 기존 `panelConstraints`에 전달한다. 후보 기본폭240과 사용자 선택폭은 기존 상한320 및 샘플400을 남기는 범위로 clamp한다. 따라서 bodyWidth608에서는 available600·후보200·샘플400이 된다.608은 초기 설계값이며(현재 주석의 "320 상한이면 우측 400 이상"은 952 분모로 계산하면 우측 632라 수치 근거가 되지 않는다) 시안 수령 때 실제 sample 툴바까지 검사해 확정한다. 경계 테스트와 실측의607/608/609는 모두 핸들을 포함한 body content box 너비다.

후보/샘플 전환은 wizard step을 진행시키지 않는다. 후보 선택·adapter·기준언어·manual 입력·샘플 로딩/실패/만료는 기존 부모 상태에 남는다. 샘플 보기/후보 복귀를 별도 버튼으로 두고 Next는 기존 검증만 따른다. 단순 resize로 탐지·샘플 fetch를 다시 실행하지 않는다. 다수 후보·빈 후보·읽기 실패·sample-expired를 유지한다.

New project·Add sources의 직접 URL과 intercept 경로는 기존 닫기 목적지/목록 조회 차이를 보존한다. `files.tsx`의 가로 스크롤 표는 POSTMORTEM 2026-09-19 「스크롤 래퍼 접근 이름」 결함이 남은 자리라 `<table>` 자체 이름을 함께 준다. Members/Settings/MCP/Sources 위험 동작은 동일 확인 UI를 재배치하고 pending 닫기 제한·권한·지문·재확인 문구를 줄이지 않는다. 세션 만료·권한 제거 중에도 결과가 사라지지 않아야 한다.

## 5. A2e 랜딩 후속

P5의 캡션 높이 계약을 유지하면서1440×900 상수를 고정 전제로 쓰던 fitScale/frame/목업 레이아웃을 함께 바꾼다. 새로운 순수 함수 입력은 논리 canvasWidth/canvasHeight, scroller W/H, chromeHeight, scroll position이다. 서버/실제 사용자 데이터를 목업으로 가져오지 않고 현재 샘플 데이터를 유지한다.

5씬 각각의 정지 구간에서 데스크톱→태블릿→모바일 순차 상태를 배치하고 다음 씬으로 전환한다. 각 상태는 동일 스크롤 위치에서 동일하게 결정된다. reduced-motion은 중간 변형 없이 상태를 교체하고 모든 씬 내용을 유지한다. 정확한 구간 비율·태블릿/모바일 종횡비는 A18 시안과 가용 높이 실측 산출물로 고정하며 그 전에는 임의 애니메이션 값을 구현하지 않는다.

목업 루트의 **레이아웃 너비**가 셸 1024·내부 카드772·기타 컨테이너 기준의 입력이다. 실제 셸은 뷰포트 `lg`로 판정하지만(2026-10-07 사용자), 목업은 이미 정적 복제본이라(`app-frame.tsx` 머리 주석 — 순수 판정만 재사용, 마크업은 복제) **목업 루트에 `@container`를 선언하고 셸 내비 규칙의 컨테이너 변형을 목업 마크업에만 둔다.** 경계 값은 같은 상수에서 가져온다. 앱의 순수 레이아웃 판정(`planTranslationPanelLayout` 등)과 컨테이너 기준 규칙(772·960 등)은 그대로 재사용한다. transform scale은 마지막 화면 맞춤일 뿐, 바깥 페이지 viewport나 기기명으로 내부 UI를 선택하지 않는다. 실앱을 iframe/서버 연결로 넣지 않는다.

## 6. 불변식·과거 함정·정본

스키마/마이그레이션/환경변수 추가 없음. export 결정성·blob SHA·strict 덮어쓰기·projectId 인가·서버 잠금·보호 지문·ProjectEvent 트랜잭션 변경 없음. UI 내부 쓰기는 기존 Server Action, 새 Route Handler 없음. 조회를 CSS 모드별로 복제하지 않으며 가상화는 추가하지 않는다. JS 잎 모듈은 서버 import 없음, client-graph 테스트 유지.

POSTMORTEM 근거:
- 2026-09-15 Settings→Projects 패널 폭 분할: 동일 grid 셀/isolate 보존, 실제 라우트 전환 중 관측.
- 2026-09-15 컨테이너 자기 참조: 부모 선언 및 경계 양쪽 실측, CSS 테스트만으로 통과 금지. 새 선언 조상은 Workspace body·Home 콘텐츠·목업 루트 셋이고, `container-query.test.ts`가 리터럴 className만 훑으므로 `cn()`·변수로 만든 선언이 잡히는지 확인한다.
- 2026-09-08 조상 provider: 서랍 안 LNB처럼 좁은 폭에서만 렌더되는 경로를 서랍이 열린 상태로 직접 렌더하는 DOM 테스트를 둔다.
- 2026-09-20 포커스 복귀가 브라우저에서만 깨짐: 단일 판의 Save 뒤 착지·서랍 닫힘 복귀 테스트는 focus fixup observer를 달고 일부러 깨뜨린 red를 확인한다. 새 서랍·단일 판을 `focus-return`·`primitive-focus` 그물에 등재한다.
- 2026-09-23 「번역 작업 화면이 테스트 5,249개 green인 채 시안·접근성과 셋 어긋났다」: textarea 폭 제한, pointercancel/lost capture 뒤 선호폭 갱신0을 검사.
- 2026-09-24 초대 초기 포커스 및 body 이탈: initialFocusRef·busy·fallback 유지, 실제 브라우저에서 확인.
- ARCHITECTURE §6.04: 이 탭의 한 키 복구 사본만, pane 변경을 새 키로 저장하지 않음.

대안: viewport768 단독 분기는1024/LNB320의 좁은 번역을 놓친다. 모바일 전용 편집기 복제는 draft/Action 소유자를 늘린다. 항상 가로 스크롤은375에서 편집/저장 도달 계약을 충족하지 못한다. 따라서 같은 상태 소유자와 컨테이너 단일 판을 쓴다.

정본 갱신은 A8의 독립 태스크다(문서별 커밋). 새 잎 모듈(`compact-pane`·`files-layout`)은 `client-graph.test.ts`의 `CLIENT_LIB_FILES`에 등재한다. 화면 사전 새 키는 en/ko/es 동시 추가, raw 색/dark: 금지. 이번에는 정본을 수정하지 않는다.
