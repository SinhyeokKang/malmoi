# responsive-app — 구현 태스크

상태: 전부 미착수. 코드·테스트·빌드·커밋·배포 실행 없음.
[스펙](spec.md) · [설계](design.md) · [브리프](design-brief.md) · [공개 선행 태스크](../responsive-public/tasks.md).

## 의존성과 커밋 경계

A0 → A1 → A2 → A3/A4/A5 → A6 → A7 → A8. **A2의 선행 조건은 공개 단계 P7 인계 완료**다(공유 헤더 배치표·측면 서랍·큰 모달 시트 규칙·검색/Inbox·경계값·검증 표). A4의 판 전환/history 태스크는 2026-10-07 확정 계약을 따른다. A2~A5는 전체 앱 지원을 이루는 필수 배치이며 하나라도 빠지면 앱 하한 제거를 출시하지 않는다. A7은 A2~A5의 실측 확정 후에만 착수한다. A1은 계약·테스트 사례 정리이며 독립 구현 커밋이 아니다. 실제 red→순수 함수 구현→소비자 이관→green은 A4(번역)·A5(온보딩)의 각 배치에서 연속 수행한다. 모든 구현 커밋은 pnpm test·pnpm typecheck 통과를 요구하며, 인터페이스 변경과 전체 소비자·테스트 갱신을 같은 커밋에 담는다.

**기존 계약 테스트는 지우지 않고 새 계약으로 바꿔 쓴다**(각 배치 "교체" 줄). **검증 표기**는 공개 tasks와 같다(`자동` = Vitest, jsdom은 폭·CSS·컨테이너 쿼리를 못 잰다 — matchMedia/ResizeObserver는 테스트마다 제어 가능한 stub, 전역 ResizeObserver mock은 콜백을 부르지 않는다(`vitest.setup.ts:27-33`) / `실측` = ego-browser, 터치 에뮬레이션 포함).

**과도기 실측**(2026-10-07 사용자): 앱 하한은 A6에서 풀리므로 A2~A5는 1024 미만 폭을 실물로 잴 수 없다. A2~A5는 자동 검증과 1024·1280 실측까지만 하고, **좁은 폭 실측은 A6에 모은다.** 공개 단계가 바꾼 포털 오버레이는 앱 1280 미만에서도 회귀 금지다.

**배포**: dev(preview)에 쌓고, A7까지 끝난 뒤 `/merge` 한 번으로 공개·앱이 함께 프로덕션에 나간다.

- [ ] **A0 — 대표 프레임 수령·확정 계약 대조** (첫 태스크)
  - 공개 P7 인계 증거를 받고 앱 1280 기준선을 재실측한다(공개 단계 공유 변경 직후 회귀 확인).
  - 로컬 핸드오프에서 브리프의 **패턴 대표 프레임 AT1~AT8**을 받는다. A18은 요구 프레임을 등록하되 내부 앱 실측 완료 뒤 최종 수령한다.
  - spec의 확정 계약(목록으로=상태 보존 판 전환, 브라우저 뒤로=기존 URL 이동·이탈 확인)을 시안에 대조한다. 1024/960/772 및 후보·샘플 608 초기 폭 예산, 40 레일의 터치 처리를 긴 문구와 실제 컴포넌트로 확정한다. 375 한 컷 실측을 spec 문제 절에 남긴다.
  - 검증: 대표 프레임 누락0, 사용자 결정과 확정 치수를 spec/design/brief에 동일 기록. 시안 없음은 UI 구현 차단으로 남긴다.

- [ ] **A1 — 순수 판정 계약·테스트 사례 정리**
  - `lib/translations/__tests__/layout.test.ts`에 추가할 single/split 반환 계약의 red 사례를 정리: null·NaN·0·771/772/773·선호폭 복원·기존 축소 순서/키보드 범위.
  - 제안 `compact-pane` reducer의 유효 선택·같은 키 다시 열기·목록 복귀·URL 선택 변경·resize 테스트 사례를 정리한다. 목록 복귀→split→상세 입력 활성화→single에서 detail을 유지하고, 상세를 사용하지 않은 폭 왕복은 list를 유지하는 사례를 추가한다. 확정된 history 분리 계약과 판 전환 시 history entry 추가0을 단언한다.
  - 제안 `files-layout`은 bodyWidth607에서 순차 판,608/609에서 두 판이 되는 테스트 사례를 정리한다. 두 판에서만 핸들8을 뺀 available600/601로 비율을 계산하고, bodyWidth608에서는 후보200·샘플400이 됨을 단언한다. 후보 기본폭/선택폭 clamp·비정상 치수와 `panelConstraints` 재사용 계약을 함께 정리한다.
  - 판 전환 이벤트 구분 red: 승인된 트리 이동→첫 키 응답은 list 유지, 외부 key 착지는 detail. 트리 결과0건·이동 취소/실패·외부 이동으로 대체된 뒤 늦은 트리 응답, 모듈 변수 의도의 1회 소비(두 번째 마운트는 못 읽음)도 검사한다.
  - 각 배치의 교체 대상 테스트를 grep으로 전수 확정한다(`min-w-shell-min`·`shell-min`·`1280`·`952`·`sm|md|lg|xl:` 금지·`mobileOpen`).
  - 검증: 사례별 기대값·전체 소비자·구현 배치 누락0. 새 순수 모듈의 DOM·server-only·I/O import0과 `client-graph.test.ts` `CLIENT_LIB_FILES` 등재를 구현 게이트로 지정한다.
  - 커밋: 독립 구현 커밋 없음.

- [ ] **A2 — 앱 셸·Projects·Home** (A2a)
  - 공개 단계의 헤더 배치표·측면 서랍·검색/Inbox를 소비하고 앱 LNB 서랍·`lg` 이상 고정 내비·기존40 레일/200~320 리사이즈를 연결한다. 두 Panel·핸들은 항상 마운트, 좁을 때 `onResize`·`setLayout` 건너뜀, 서랍 안 Sidebar는 접힘 context `false`로 덮고 토글 숨김.
  - Projects 이름/메타(미터 `@max-[…]:hidden` → 아래 줄 적층), Home 960 적층·기존672 카운트, 로딩/빈/보관/설정전/오류를 구현한다. 적층은 DOM 순서, CSS `order`·이중 렌더 금지.
  - 자동: 서랍 열림 직접 렌더(조상 provider)·resize stub 중 자식 상태 유지·선호폭/접힘 보존·좁아지는 방향 포커스 이전·중복 검색/Inbox Action0. 새 포커스 테스트는 fixup observer + 깨뜨린 red 확인 + 그물 등재.
  - 교체: `app/(edit)/__tests__/shell-layout.test.ts:175-179`(사이드바 `sm|md|lg|xl:`·`mobileOpen`·`fixed inset-y-0` 금지 → "`lg` 하나·측면 서랍 변형만 허용, 다른 뷰포트 분기 금지"). `:134-135`(하한)는 A6이 교체한다.
  - 실측(1024·1280): LNB200/240/320/40 교차 폭 예산, 실제 라우트 전환 중 콘텐츠 패널 폭 분할 없음(POSTMORTEM 2026-09-15), 오른쪽 ProjectPanel을 연 상태 × 1024(POSTMORTEM 「시안 밖 폭」), 939/940/941·959/960/961·671/672/673 computed style.
  - 커밋: `feat(responsive-app): adapt shell and project overview`.

- [ ] **A3 — Logs·Sources 읽기·Account·Preferences** (A2b)
  - 행 메타·필터·날짜범위·상세 모달·카드 폼을 컨테이너 기준으로 적층한다. 소스 상세 모달의 `max-[850px]:`를 컨테이너 기준으로 옮긴다. Sources 추가/제거/기준언어는 A5 소유지만 기존 진입 버튼을 누락하지 않는다.
  - 긴 이름·이메일·파일경로·시간대·UTC+5:30 및 언어/테마 변경 시 폼 상태와 포커스를 검사한다. 잘린 식별자는 줄바꿈 또는 복사로 전문에 닿는다.
  - 자동: 날짜 오프셋·기존 서버 동작 동일, 관련 DOM 테스트 green.
  - 교체: `app/(edit)/__tests__/sibling-loading.test.tsx:105-108`(Sources `/panel` 질의 0건 고정).
  - 실측(1024·1280, 좁은 폭은 A6): 바뀐 컨테이너 경계 ±1 computed style, 가로 스크롤 표(Logs·멤버)의 `<table>` 자체 이름 AX 트리(POSTMORTEM 2026-09-19), 로딩 골격과 실물의 줄 수·적층 위치 일치.
  - 커밋: `feat(responsive-app): adapt activity and account surfaces`.

- [ ] **A4 — 번역 탐색·편집·위험 동작** (A2c)
  - A1의 번역 순수 테스트와 아래 DOM 테스트를 먼저 작성해 red를 확인한다. single/split 반환 타입·compact-pane 구현과 Workspace/ResizeHandle 등 전체 소비자·기존 테스트 이관을 같은 커밋에 담는다. Workspace body `@container` + `data-pane` CSS 판 표시(측정 전 데스크톱 fallback 유지), 트리 Popover 재사용, 목록↔상세 전환, 목록 scrollTop 저장·복원, 직접 key/Inbox 착지, 모듈 변수 1회성 트리 이동 의도, 상세 sticky Save footer를 구현한다. resize로 draft reducer/상세 입력 DOM을 복제·교체하지 않는다.
  - 기존 navigation/leave guard/복구 사본·필터·selectedInResult·source 이동·잠금 및 Save/Publish/Sync/Revert 결과를 그대로 잇는다. 꺼진 Sync·Publish의 사유를 좁은 폭에서 보이는 줄로 세운다.
  - 먼저 DOM red: dirty→목록→같은 키→입력 보존, 다른 키 취소/폐기, dirty resize, IME composition 중 resize, 저장중/실패/권한상실·세션 만료 중 저장, filter로 선택키 제외, 빈/orphaned/다수 로케일, 소스 선택·history 확인, sessionStorage 복구.
  - 폭 왕복 회귀: 목록으로→split 확장→상세 textarea 포커스/IME 조합 시작→single 축소. 동일 textarea DOM·activeElement·선택 범위·draft 유지, URL/history 변경0을 DOM 테스트로 단언한다(`data-pane` 전환은 stub 폭으로).
  - 상세 착지 DOM red: single에서 같은 키 재열기·다른 키 선택·다른 소스의 키 선택·직접 key URL·검색/Inbox 진입 시 가시 상세 제목(새 `tabIndex={-1}`)에 포커스. 스켈레톤→성공/빈/오류 전환에서 제목 DOM·포커스 유지, 응답 전 사용자가 옮긴 포커스는 빼앗지 않음. 검색/Inbox 닫힘의 트리거 복귀가 착지를 덮지 않음. 새 포커스 테스트는 fixup observer + 깨뜨린 red + 그물 등재.
  - 트리 이동 DOM red: 같은 소스/다른 소스에서 트리 선택→`@first` 응답·URL 정규화 후 list 유지와 첫 키 선택 표시, 재마운트 후 동일 동작, 0건의 빈 목록 제목 착지. dirty 이동 취소는 현재 판·포커스 유지. 이후 검색/Inbox로 키를 열면 detail이 되고 늦은 이전 응답이 목록으로 되돌리지 않음.
  - 회귀 테스트 전수: `translation-workspace.test.tsx`(대시 없는 파일 — `selectedInResult` 회귀 포함)와 `translation-workspace-*.test.tsx`의 navigation/focus/keyboard/remount/restore/transition/lock/sync/publish/render, textarea 폭·pointercancel/lost capture.
  - 실측(1024·1280, 좁은 폭은 A6): 1024에서 LNB320일 때 771/772/773 카드 폭의 판 전환, 데스크톱 첫 렌더에 단일 판이 한 프레임도 보이지 않음.
  - 커밋: `feat(responsive-app): add compact translation workspace` (하위 커밋으로 나누더라도 반환 타입 변경과 전체 소비자 이관은 분리하지 않는다).

- [ ] **A5 — 온보딩·멤버·소스 관리·Settings·MCP** (A2d)
  - A1의 files-layout 순수 테스트와 아래 DOM 테스트를 먼저 작성해 red를 확인한다. 순수 판정 구현·files.tsx 고정952 분모 제거·측정 기반 소비자 이관·후보/샘플 순차 판 연결을 같은 커밋에서 수행한다. pane 복귀로 재탐지·재조회하지 않으며 wizard 단계는 유지. `files.tsx` 표에 `<table>` 자체 이름.
  - New project/Add sources의 직접/intercept 진입·진행/결과·뒤로/닫기, Members 초대/재발송/역할변경/제거, Sources 추가/제거/기준언어, Settings 보관/복원·토큰·연결, MCP 생성/회전/폐기·연결해제를 전부 지원한다. 잘린 이메일(`pending-invitations.tsx:214`)·경로(`files.tsx:176`)는 `title`만으로 전문을 주지 않는다.
  - 먼저 DOM red: 후보 선택 상태·샘플 loading/unavailable/expired·0건·폭 전환, 직접/intercept 닫기 및 조회 횟수, 긴 경고·pending 닫힘 제한·미전달 지문 만료·역할별 권한·초대 결과 포커스(fixup observer + 깨뜨린 red).
  - 교체: `components/__tests__/files-step-panels.test.ts:49-58`(`FILES_PANEL_WIDTH = 960 - 8`·`panelConstraints(952, …)` → files-layout 계약).
  - 실측(1024·1280, 좁은 폭은 A6): body content box 607/608/609(시안에서 조정하면 새 값±1), 608에서 후보200+핸들8+샘플400, footer 도달, 기존 Action 호출/권한/확인 지문 동일.
  - 커밋: `feat(responsive-app): adapt onboarding and administration` (범위별 하위 커밋 가능).

- [ ] **A6 — 앱 통합·대조·하한 해제**
  - A2~A5 완료 후 앱 셸 하한을 최종 해제하고 전 화면·로딩 골격을 같이 확인한다. 신규 표면(측면 서랍·번역 단일 판·온보딩 순차 판)만 `/design-sync`, 나머지는 대표 프레임 패턴 적용을 ego-browser computed style·AX 트리로 대조한다.
  - 교체: `app/(edit)/__tests__/shell-layout.test.ts:134-135`(`min-w-shell-min` → "셸 루트에 하한 없음"), 그 밖에 A1이 확정한 1280·shell-min 단언 파일 전부. `projects-screen.test.ts:439-441`의 근거 주석("셸이 `min-w-shell-min`이라 뷰포트 브레이크포인트로는 영영 안 밟힌다")은 단언을 유지하고 문장만 고친다.
  - 실측: spec 샘플링 매트릭스, 1023/1024/1025, 실제 변경된 내부 639/640/641·671/672/673·759/760/761·771/772/773·849/850/851(소스 상세)·939/940/941·959/960/961·1119/1120/1121 중 해당 경계, A2~A5가 미룬 좁은 폭 실측 전부.
  - 터치 에뮬레이션: 소프트 키보드 높이에서 Save·모달 footer 도달, 서랍 닫힘 뒤 트리거 복귀(iOS Safari 탭 포커스 — POSTMORTEM 2026-09-24 `pointerdown`), 꺼진 Radix Select 터치, 세션 만료 중 저장 결과가 좁은 폭에서 보임, sonner 토스트가 375 하단 동작을 가리지 않음, 서랍 reduced-motion.
  - 성능: 모바일 CPU 4× 스로틀, 5,000키 첫 렌더 `loadEventEnd`·목록↔상세 전환·목록 재표시 비용. §1.95 기준을 넘으면 별도 결함으로 분리한다.
  - 검증: A-01~10 항목별 증거를 공개 P7과 같은 표 템플릿으로 남김, pnpm test·pnpm typecheck green.
  - 커밋: `feat(responsive-app): enable narrow layouts across the app`.

- [ ] **A7 — 앱 완성 후 랜딩 목업** (A2e)
  - A18 최종 시안 수령: 대표 씬의 데스크톱16:10→태블릿→모바일 순차 상태, 가용 높이에 맞는 두 종횡비·정지/전환 비율 확정. P5 stage 완료본에서 시작한다.
  - 먼저 순수 테스트: 명시 canvasWidth/Height와 chromeHeight로 fitScale/frame 계산, 같은 위치 결정성·역스크럽·reduced-motion·작은 H. 이후 stage 측정과 목업 배치를 함께 변경한다.
  - 목업 루트에 `@container` 선언(자기 참조 금지 — 선언 요소와 질의 요소 분리), 셸 내비 규칙의 컨테이너 변형은 목업 마크업에만 두고 경계 상수는 공유한다. 앱의 순수 레이아웃 판정을 소비한다.
  - 교체: `components/__tests__/landing-mockup.test.tsx:65`(1440px 고정).
  - 검증: A-11·랜딩 회귀, 바깥1280 고정에서 목업만 세 너비로 바꾸어 내비·목록·상세 실측(1023/1024 목업 루트 computed); 4뷰포트에서 5씬/캡션/진행/CTA 누락·겹침0. stage 단위/DOM 테스트 green.
  - 커밋: `feat(responsive-app): mirror responsive layouts in landing scenes`.

- [ ] **A8 — 사전·가이드**
  - 새 사전 키는 `/translate`로 en/ko/es 동시 반영.
  - `pnpm guide:check`로 stale 매핑을 확인하고 `/guide-shots`(SHA 갱신 또는 en1280×800 재촬영)를 부른다. `/guide`로 달라진 내비/목록 복귀/편집 설명을 세 언어 함께 반영. 새 모바일/언어별 컷은 만들지 않는다.
  - 검증: A-01~11 추적표 미완0·두 기능 공유 파일 충돌0·새 키 누락0·`guide:check` stale 0.

- [ ] **A8a — `docs(PRODUCT)`** — 공개 P6a가 쓴 지원 범위가 앱 최종 상태와 일치하는지 확인하고 IA(§7)의 "동일 URL 안 좁은 화면 전환"을 더한다. 검증: `grep -n "1280" docs/PRODUCT.md`의 폭 하한 단언 0건.

- [ ] **A8b — `docs(DESIGN)`** — `:102`(`--spacing-shell-min` 토큰 의미 — 콘텐츠 상한과 셸 하한 구분), `:340`(§5 앱 하한 해제 마무리), `:364`("반응형 분기는 없다" → `lg` 하나), `:854`·`:856`(셸 루트 `min-w-shell-min`·사이드바 분기 0), §6.5 LNB 서랍·40 레일 터치, 번역 단일 판·온보딩 순차 판, A18. 검증: `grep -n "최소 대응 너비는 1280\|반응형 분기가 0개\|반응형 분기는 없다" docs/DESIGN.md` 0건.

- [ ] **A8c — `docs(ARCHITECTURE)`·`docs(DIRECTORY)`·`guide/SHOOTING.md`** — 편집 상태/포커스 소유자(판 전환·모듈 변수 의도), 신규 잎 모듈, SHOOTING:11의 근거("앱의 최소 폭 1280" → "데스크톱 대표 폭"). 원본 규칙을 고치면 `pnpm sync:agents`. 기능 완료 뒤 결론을 정본으로 승격하고 `docs/features/responsive-*`를 지운다.
  - 배포 준비 세션에서 pnpm gate 후 새 서버 실물 확인. `/merge`는 사용자가 따로 부른다(공개·앱 동시).

## 검증 책임

순수/DOM 테스트는 상태·호출·소유권을, 브라우저는 CSS 치수·포커스·스크롤·터치 입력을 판정한다. source scan green으로 컨테이너의 실제 조상이나 사용자 도달성을 증명하지 않는다. 단계별 실패·도구 부재를 성공 요약보다 먼저 보고한다.
