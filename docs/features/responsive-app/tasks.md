# responsive-app — 구현 태스크

상태: 전부 미착수. 코드·테스트·빌드·커밋·배포 실행 없음.
[스펙](spec.md) · [설계](design.md) · [브리프](design-brief.md) · [공개 선행 태스크](../responsive-public/tasks.md).

## 의존성과 커밋 경계

A0 → A1 → A2 → A3/A4/A5 → A6 → A7 → A8. P1의 공유 계약 완료본을 A2의 입력으로 고정한다. A4의 판 전환/history 태스크는 2026-10-07 확정 계약을 따른다. A2~A5는 전체 앱 지원을 이루는 필수 배치이며 하나라도 빠지면 앱 하한 제거를 출시하지 않는다. A7은 A2~A5의 실측 확정 후에만 착수한다. A1은 계약·테스트 사례 정리이며 독립 구현 커밋이 아니다. 실제 red→순수 함수 구현→소비자 이관→green은 A4(번역)·A5(온보딩)의 각 배치에서 연속 수행한다. 모든 구현 커밋은 pnpm test·pnpm typecheck 통과를 요구하며, 인터페이스 변경과 전체 소비자·테스트 갱신을 같은 커밋에 담는다.

- [ ] **A0 — 시안 수령·확정 계약 대조** (첫 태스크)
  - 로컬 핸드오프 A01~A17의 네 폭/상태 프레임을 받는다. A18은 요구 프레임을 등록하되 내부 앱 실측 완료 뒤 최종 수령/대조한다.
  - spec의 확정 계약(목록으로=상태 보존 판 전환, 브라우저 뒤로=기존 URL 이동·이탈 확인)을 시안에 대조한다.1024/960/772 및 후보·샘플의 body content box608(핸들8 포함) 초기 폭 예산을 긴 문구와 실제 컴포넌트 구성으로 검증해 확정한다.
  - 검증: D4~D6 유지, 앱 모든 관리 동작 프레임 누락0, 사용자 결정과 확정 치수를 spec/design/brief에 동일 기록. 시안 없음은 UI 구현 차단으로 남긴다. 상호작용에 대한 사용자 답 대기는 없다.

- [ ] **A1 — 순수 판정 계약·테스트 사례 정리**
  - `lib/translations/__tests__/layout.test.ts`에 추가할 single/split 반환 계약의 red 사례를 정리: null·NaN·0·771/772/773·선호폭 복원·기존 축소 순서/키보드 범위.
  - 제안 `compact-pane` reducer의 유효 선택·같은 키 다시 열기·목록 복귀·URL 선택 변경·resize 테스트 사례를 정리한다. 목록 복귀→split→상세 입력 활성화→single에서 detail을 유지하고, 상세를 사용하지 않은 폭 왕복은 list를 유지하는 사례를 추가한다. 확정된 history 분리 계약과 판 전환 시 history entry 추가0을 단언한다.
  - 제안 `files-layout`은 bodyWidth607에서 순차 판,608/609에서 두 판이 되는 테스트 사례를 정리한다. 두 판에서만 핸들8을 뺀 available600/601로 비율을 계산하고, bodyWidth608에서는 후보200·샘플400이 됨을 단언한다. 후보 기본폭/선택폭 clamp·비정상 치수와 `panelConstraints` 재사용 계약을 함께 정리한다. 셸 선호폭·자동 mode가 서로 덮지 않는 판정도 기존 panel-size 테스트와 연결한다.
  - 판 전환 이벤트 구분 red: 승인된 트리 이동→첫 키 응답은 list 유지, 외부 key 착지는 detail. 트리 결과0건·이동 취소/실패·외부 이동으로 대체된 뒤 늦은 트리 응답도 검사하고, 유효 키가 생겼다는 이유만으로 detail을 열지 않음을 단언한다.
  - 검증: 사례별 기대값·전체 소비자·구현 배치 누락0. 이 단계에서는 반환 타입이나 실행 테스트를 바꾸지 않는다. 새 순수 모듈의 DOM·server-only·I/O import0을 구현 게이트로 지정한다.
  - 커밋: 독립 구현 커밋 없음. 번역 판정은 A4, files-layout은 A5 소비자 이관 커밋에 포함한다.

- [ ] **A2 — 앱 셸·Projects·Home** (A2a)
  - P1 검색/Inbox/Dialog를 소비하고 앱 내비 서랍·1024 고정 내비·기존40 레일/200~320 리사이즈를 연결한다. main host를 유지해 자식 remount를 막는다.
  - Projects 이름/메타, Home960 적층·기존672 카운트, 로딩/빈/보관/설정전/오류를 구현한다. 전역 shell-min 토큰의 의미를 임의 변경하지 않는다.
  - DOM red: resize 중 자식 상태 유지·선호폭 복원·열린 서랍 경계 포커스·중복 검색/Inbox Action0·동일 grid 셀 공존.
  - 검증: A01~03/A15, LNB200/240/320/40×1024/1280의 폭 예산 및959/960/961·671/672/673 실측. 앱 하한 제거는 통합 전까지 완료/출시로 표시하지 않음.
  - 커밋: `feat(responsive-app): adapt shell and project overview`.

- [ ] **A3 — Logs·Sources 읽기·Account·Preferences** (A2b)
  - 행 메타·필터·날짜범위·상세 모달·카드 폼을 컨테이너 기준으로 적층한다. Sources 추가/제거/기준언어는 A5 소유지만 기존 진입 버튼을 누락하지 않는다.
  - 긴 이름·이메일·파일경로·시간대·UTC+5:30 및 언어/테마 변경 시 폼 상태와 포커스를 검사한다.
  - 검증: A08 읽기/A09/A11/A12 및 대응 로딩·오류 프레임 통과, 날짜 오프셋·기존 서버 동작 동일, 관련 DOM 테스트 green.
  - 커밋: `feat(responsive-app): adapt activity and account surfaces`.

- [ ] **A4 — 번역 탐색·편집·위험 동작** (A2c)
  - A1의 번역 순수 테스트와 아래 DOM 테스트를 먼저 작성해 red를 확인한다. single/split 반환 타입·compact-pane 구현과 Workspace/ResizeHandle 등 전체 소비자·기존 테스트 이관을 같은 커밋에 담는다. Workspace 한 벌에 판정을 연결하고 tree Dialog·목록↔상세 전환·직접 key/Inbox 착지·목록 스크롤 복원 구현. resize로 draft reducer/상세 입력 DOM을 복제·교체하지 않는다.
  - 기존 navigation/leave guard/복구 사본·필터·selectedInResult·source 이동·잠금 및 Save/Publish/Sync/Revert 결과를 그대로 잇는다.
  - 먼저 DOM red: dirty→목록→같은 키→입력 보존, 다른 키 취소/폐기, dirty resize, IME composition 중 resize, 저장중/실패/권한상실, filter로 선택키 제외, 빈/orphaned/다수 로케일, 소스 선택·history 확인, sessionStorage 복구.
  - 폭 왕복 회귀: 목록으로→split 확장→상세 textarea 포커스/IME 조합 시작→single 축소. 동일 textarea DOM·activeElement·선택 범위·draft 유지, 상세 hidden/inert 없음, URL/history 변경0을 DOM 테스트로 단언한다. 실제 터치 브라우저에서도 조합이 resize로 끊기지 않고 확정 입력과 Save에 도달하는지 확인하며, DOM 테스트만으로 IME 실물 검증을 통과 처리하지 않는다.
  - 상세 착지 DOM red: single에서 같은 키 재열기·다른 키 선택·다른 소스의 키 선택·직접 key URL·검색/Inbox 진입 시 가시 상세 제목에 포커스. 스켈레톤→성공/빈/오류 전환에서 제목 DOM·포커스를 유지하고, 응답 전에 사용자가 옮긴 포커스는 빼앗지 않는다. 검색/Inbox 닫힘의 트리거 복귀가 착지를 덮지 않으며 이동 취소 시 기존 판·포커스, 목록 복귀 시 선택행을 유지하는지 단언한다. 같은 경로를 브라우저에서도 밟아 activeElement·제목 가시성·hidden/inert 조상 없음·Tab으로 상세 조작 도달을 기록한다. resize나 Save 응답이 진입 착지를 재실행하지 않는지도 검사한다.
  - `translation-workspace-*.test.tsx`의 navigation/focus/remount/restore/transition/lock/sync/publish/render 회귀와 textarea 폭·pointercancel/lost capture를 확인한다.
  - 트리 이동 DOM red: 같은 소스/다른 소스에서 트리 선택→`@first` 응답·URL 정규화 후 list 유지와 첫 키 선택 표시, 재마운트 후 동일 동작, 0건의 빈 목록 제목 착지. dirty 이동 취소는 현재 판·포커스를 유지한다. 이후 검색/Inbox로 키를 열면 detail이 되고 늦은 이전 응답이 목록으로 되돌리지 않음을 검사한다. 브라우저에서도 가시 판·activeElement·URL·history를 기록하여 기존 탐색 외 추가 history entry0을 확인한다.
  - 검증: 순수/DOM red→green 및 pnpm test·pnpm typecheck green, A04~06 모든 동작과771/772/773 실측, resize/판 전환 Action 중복0·draft 손실0·숨은 탭 정지0. Navigation API 없는 브라우저는 기존 보호 제한과 실제 결과를 기록하고 손실 시 통과하지 않음.
  - 커밋: `feat(responsive-app): add compact translation workspace` (하위 커밋으로 나누더라도 반환 타입 변경과 전체 소비자 이관은 분리하지 않으며 각 커밋이 검증을 통과해야 함. 배포 단위는 합침).

- [ ] **A5 — 온보딩·멤버·소스 관리·Settings·MCP** (A2d)
  - A1의 files-layout 순수 테스트와 아래 DOM 테스트를 먼저 작성해 red를 확인한다. 순수 판정 구현·files.tsx 고정952 분모 제거·측정 기반 소비자 이관·후보/샘플 순차 판 연결을 같은 커밋에서 수행한다. pane 복귀로 재탐지·재조회하지 않으며 wizard 단계는 유지.
  - New project/Add sources의 직접/intercept 진입·진행/결과·뒤로/닫기, Members 초대/재발송/역할변경/제거, Sources 추가/제거/기준언어, Settings 보관/복원·토큰·연결, MCP 생성/회전/폐기·연결해제를 전부 지원한다.
  - 먼저 DOM red: 후보 선택 상태·샘플 loading/unavailable/expired·0건·폭 전환, 직접/intercept 닫기 및 조회 횟수, 긴 경고·pending 닫힘 제한·미전달 지문 만료·역할별 권한·초대 결과 포커스.
  - 검증: 순수/DOM red→green 및 pnpm test·pnpm typecheck green, A07/A08 관리/A10/A13/A14 전 경로 성공/실패, 핸들을 포함한 body content box607/608/609 실측(시안에서 조정하면 새 값±1).608에서 후보200+핸들8+샘플400을 확인한다. footer 항상 도달, 기존 Action 호출/권한/확인 지문 동일.
  - 커밋: `feat(responsive-app): adapt onboarding and administration` (범위별 하위 커밋 가능).

- [ ] **A6 — 앱 통합·시안 대조·하한 해제**
  - A2~A5 완료 후 앱 셸 하한을 최종 해제하고 전 화면·로딩 골격을 같이 확인한다. 신규 표면만 `/design-sync`, 기존 재배치는 변경 브리프와 ego-browser 실측 대조.
  - spec24조합·상태 매트릭스,1023/1024/1025, 실제 변경된 내부639/640/641·671/672/673·759/760/761·771/772/773·939/940/941·959/960/961·1119/1120/1121 중 해당 경계를 검사한다.
  - 실제 터치 브라우저에서375/768 계열의 키보드·주소창·IME·Save·모달 footer 도달 확인.200% 확대·다수 키/로케일·긴 경고도 검사한다.
  - 검증: A-01~10 항목별 증거·결과, root/자식 rect·overflow·computed grid·activeElement 기록, pnpm test·pnpm typecheck green. 장비/도구 부재는 모바일 검증 미완이며 desktop emulation으로 대체 통과하지 않음.
  - 커밋: `feat(responsive-app): enable narrow layouts across the app`.

- [ ] **A7 — 앱 완성 후 랜딩 목업** (A2e)
  - A18 최종 시안 수령:5씬×데스크톱16:10→태블릿→모바일 순차 상태, 가용 높이에 맞는 두 종횡비·정지/전환 비율 확정. P1 stage 변경 완료본에서 시작한다.
  - 먼저 순수 테스트: 명시 canvasWidth/Height와 chromeHeight로 fitScale/frame 계산, 같은 위치 결정성·역스크럽·reduced-motion·작은 H. 이후 stage 측정과 목업 배치를 함께 변경한다.
  - 앱 실제 레이아웃 판정을 소비하고 루트 레이아웃 너비를 변경한다. transform으로만 외곽 축소하거나 바깥 viewport로 내부 UI 선택하지 않는다.
  - 검증: A-11/P1 랜딩 회귀, 바깥1280 고정에서 목업만 세 너비로 바꾸어 내비·목록·상세 실측; 네 뷰포트×테마×언어에서5씬/캡션/진행/CTA 누락·겹침0. stage 단위/DOM 테스트 green.
  - 커밋: `feat(responsive-app): mirror responsive layouts in landing scenes`.

- [ ] **A8 — 사전·정본·가이드·분리 출시 인계**
  - 새 사전 키는 `/translate`로 en/ko/es 동시 반영. PRODUCT 전 기능375, DESIGN 셸/편집/모달/온보딩/랜딩, ARCHITECTURE 상태/포커스 소유자 변경, DIRECTORY 신규 모듈을 갱신한다.
  - `/guide`로 달라진 내비/목록 복귀/편집 설명을 세 언어 함께 반영. SHOOTING의1280 근거는 최소 폭에서 데스크톱 대표 폭으로 변경하고 en1280×800 이미지를 유지한다. 새 모바일/언어별 컷은 만들지 않는다.
  - 검증: A-01~11 추적표 미완0·두 기능 공유 파일 충돌0·새 키 누락0. 원본 규칙 수정 시 sync:agents 및 미러 체크, 문서별 커밋. 기능 완료 뒤 결론을 정본으로 승격하고 feature 문서 정리 규칙을 따른다.
  - 배포 준비 세션에서 pnpm gate 후 새 서버 실물 확인. 이번 feature 작성에서는 미실행. 공개/앱 배포는 각각 따로 결정하며 push/merge를 자동 호출하지 않는다.

## 검증 책임

순수/DOM 테스트는 상태·호출·소유권을, 브라우저는 CSS 치수·포커스·스크롤·터치 입력을 판정한다. source scan green으로 컨테이너의 실제 조상이나 사용자 도달성을 증명하지 않는다. 단계별 실패·도구 부재를 성공 요약보다 먼저 보고한다.
