# Sources — 구현 순서

상태: 2026-09-21 계획. 이번 feature 단계에서는 구현·테스트 실행·빌드·커밋하지 않는다.
각 체크박스는 구현 단계에서 완료한다. 사용자 확인 전 제안은 [spec §9](./spec.md#9-사용자-확인과-작업-가정)에 있다.

## 커밋 A — Sources 데이터·상태 계약

- [ ] A0. spec §9의 남은 제안 확인, 수정 중인 디자인의 최종본을 대조한다. 상세 URL 없음은 확정이다.
  - 검증: 목록/1024 모달/기준 언어만 수정은 재논의하지 않고, 결정과 제안을 문서에서 구분한다.
- [ ] A1. 행 행동/폼 상태/이탈 판정의 인터페이스·회귀 테스트를 먼저 작성한다.
  - 검증: EDITOR 재시도, 설치 없음, first/after, dirty+언어 URL, pending+refresh+실패 케이스가 red.
- [ ] A2. `lib/sources` 잎 함수·reducer를 구현하고 기존 상태·기준 언어 판정을 재사용한다.
  - 검증: A1 green, 기존 base-locale/base-pending/import-status 테스트 green, 서버 모듈 import 없음.
- [ ] A3. Sources reader 테스트를 먼저 작성한 뒤 목록+선택 상세 조회를 구현한다.
  - 검증: 프로젝트 A/B 격리, 보관 소스·고아 키/언어, 소스 N과 무관한 쿼리 호출 수,
    상세 미선택 시 셀 조회 0, 원본 번역·토큰 미전달, 실패를 빈 목록으로 바꾸지 않음.
- [ ] A4. 집계 일관성을 검증한다. 기존 loadSurfaceCounts와 선택 소스의 localeProgress를 사용한다.
  - 검증: 실제 PostgreSQL에서 210/12/26, 전체 0, 같은 언어 코드의 다른 소스, 동시 적재 읽기에서
    분모·분자가 같은 스냅샷이며 음수/100% 초과가 생기지 않는다.

## 커밋 B — 목록·모달·이전 경로 전환

- [ ] B1. routes.sources/쿼리 수신자/인가/레거시 redirect 테스트를 먼저 작성한다.
  - 검증: 옛 두 Locales URL, add-surface, Settings add, OAuth e 복귀, 없는 소스,
    반복 add/e, source 쿼리 무시, EDITOR add 직접 진입, 보관 프로젝트가 기대 화면에 도달한다.
- [ ] B2. Sources 페이지와 안정적인 클라이언트 화면 소유자를 구현한다.
  - 검증: 상세 열기/닫기 시 주소·이력 불변, 전체 새로고침은 목록, 닫기 위치/포커스 복구,
    결과 state가 선택 변경이나 refresh 때문에 재마운트되지 않음.
- [ ] B2a. 상세 읽기 Server Action과 클라이언트 로딩·재시도를 연결한다.
  - 검증: 매 호출 인가, A/B 소스 격리·보관·권한 회수, 읽기 중 revalidate/쓰기 없음,
    늦은 이전 소스 응답 무시, 저장/적재 후 열린 상세 재조회, 재조회 실패가 쓰기 성공을 실패로 뒤집지 않음.
- [ ] B3. Modal의 headerAction 슬롯과 SourceDetailModal을 구현한다.
  - 검증: 기존 onboarding-modal DOM 테스트 green, 헤더 번역·하단 Close, 중첩 Dialog의
    Esc가 바깥 모달을 함께 닫지 않음, 키보드로 행과 보조 행동을 각각 실행 가능.
- [ ] B4. 기존 기준 언어 Action/폼을 Sources로 이동하고 상태·오류 UI를 연결한다.
  - 검증: 선언만 저장, 기존 잠금 순서·이벤트·revalidate 유지, unknown/orphaned 거부,
    현재 적용값 재선택으로 대기 취소, 저장 성공 후 재열기, props 수신/실패 교차 DOM 테스트 green.
- [ ] B5. 모든 모달 이탈 경로의 dirty/pending 보호를 연결한다.
  - 검증: X/Esc/배경/Close/헤더 Open/**언어 행 Open**의 깨끗함·수정 중·저장 중 상태,
    확인 취소는 draft 유지, 확인 승인은 원래 언어 목적지 유지, 통신 실패 뒤 잠금 해제.
- [ ] B6. 적재 상태·언어 표·시각 문구를 연결한다.
  - 검증: First/Last 실패 구분, EDITOR 재시도 없음, 설치 없음 안내, Source commit 라벨,
    null 시각 생략, 다국어 파일의 고아 언어 안내, 완료/검토 필요 막대 합 일치.
- [ ] B7. AddSourcesModal을 이동하고 결과 안내를 목록의 고정 영역에 연결한다.
  - 검증: 요청 원자 실패와 성공+부분 적재 경고 및 응답 불명 구별,
    소스명별 결과·워크플로 안내, refresh 후 결과 존속, 성공 뒤 가짜 importing 없음.
- [ ] B8. Settings의 소스 카드·LocaleSurfaceSelector를 제거하고 내비게이션을 전환한다.
  - 검증: Sources 단일 관리 진입, 번역 화면의 SurfaceSelector와 Settings CI YAML 유지,
    새 링크 생성기만 내부 사용, 옛 URL은 호환 redirect, 연결 복귀의 error 안내 보존.
- [ ] B9. 변경 때문에 생긴 무사용 컴포넌트·문구만 정리한다.
  - 검증: base-locale-screens, settings-sources, add-surface, shell-nav, entry-points 테스트가 새 경로를 검사한다.
    기존 unrelated dead code는 제거하지 않는다.

## 커밋 C — 검증·문서 신선도

- [ ] C1. 영향 테스트를 실행하고 required gate를 통과한다.
  - 검증: `pnpm typecheck`, `pnpm test`, `pnpm test:projects:postgres` green.
    keys/surfaces 또는 기존 이벤트를 건드린 경우 해당 integration 파일이 프로젝트 PostgreSQL config에 포함되는지 확인한다.
    클라이언트 import 그래프·미러 드리프트 테스트도 포함한다. 빌드는 이 feature/implement 단계에서 실행하지 않는다.
- [ ] C2. 실제 브라우저에서 시안과 동작을 대조한다.
  - 검증: OWNER/EDITOR, 최초·이후 실패, 대기 변경, 폐기 확인, 언어 Open, OAuth 복귀,
    1440×900 및 창 960/모달 864, 낮은 창 높이에서 Save/Close 도달·포커스·스크롤 복구.
    두 폭 모두 같은 적재 카드·ja 행·고아 복구 안내가 보이고 클리핑이 없다.
- [ ] C3. PRODUCT·DESIGN·DIRECTORY·관련 ARCHITECTURE의 Sources 설명을 실제 구현에 맞춰 갱신한다.
  - 검증: PRODUCT §7.1·§7.7의 Settings/Locales 소유권, 레거시 redirect, 실제 폼·추가 경로,
    모달 headerAction 예외, 원본 커밋 시각 의미가 코드와 일치한다. POSTMORTEM은 이번에 수정하지 않는다.
- [ ] C4. 최종 디자인 파일과 스펙의 차이를 닫고 완료 조건을 점검한다.
  - 검증: spec §8 전 항목 충족, 미확정 사용자 제안 0개, 환경변수/마이그레이션 추가 없음,
    디자인 변경으로 구현 범위가 늘었으면 별도 승격 없이 사용자에게 남긴다.

커밋 경계는 후속 실행을 위한 계획이다. Codex 커밋에는 Codex 트레일러를 붙이고 원격 push는 Claude Code가 담당한다.
