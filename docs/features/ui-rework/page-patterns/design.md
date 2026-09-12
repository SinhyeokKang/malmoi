# 페이지 톤앤매너 통일 — design

## 1. 기준과 적용 방식

[spec](./spec.md)의 목표는 **같은 제품의 톤앤매너**다. 기준 네 영역의 중립적인 표면, 절제된 강조,
서체 계층과 간격을 나머지 일곱 화면에 맞춘다. 현존 프리미티브와 페이지별 조립으로 충분하다.

수정 대상은 색·서체·여백·border·radius·shadow·아이콘·컨트롤 외형이다. 아래 폭·스크롤·URL·
상태 전달 규칙은 **변경할 작업이 아니라 보존할 경계**다. 화면별 본문 시안은 요구하지 않는다.

우선순위는 현재 사용자 결정 → [DESIGN §0](../../../DESIGN.md)·[8단계 규약](../README.md)에서 갱신된
결정 → 해당 화면의 현행 계약이다. 오래된 문장과 코드 주석은 현재 코드·테스트와 대조한다.
어긋남이 새 디자인 결정을 요구하면 임의로 코드 쪽을 정본으로 승격하지 않는다.

참조 파일은 이 문서에서 저장소 루트까지 `../../../../`다.

## 2. 시각 기준과 보존 경계

| 패턴 | 적용 규칙 | 코드 출처·범위 |
|---|---|---|
| 캔버스와 패널 | 바깥 `p-2`, 패널 사이 `gap-2`, 흰 콘텐츠에 `rounded-xl border-border-subtle shadow-low`. 패널 radius는 현재 토큰상 16px | [셸](../../../../app/(edit)/layout.tsx), [ContentPanel](../../../../components/shell/content-panel.tsx), [AuthLayout](../../../../components/signin/auth-layout.tsx). 헤더·사이드바·인증 장식까지 흰 카드로 칠하지 않는다 |
| 셸 스크롤 | 루트 `h-svh overflow-hidden min-w-[1280px]`; `ContentPanel`은 경계, `PanelBody`는 `min-h-0 flex-1 overflow-y-auto` | 셸·ContentPanel. AuthLayout의 `min-h-svh`를 셸에 복제하지 않는다 |
| 폭 | 목록·번역은 `max-w-7xl`, 나머지는 안쪽 `max-w-4xl`. 패널 자체는 남은 폭을 쓴다 | ContentPanel, [Home](../../../../app/(edit)/projects/[slug]/page.tsx). 상한은 스크롤 컨테이너가 아닌 내부 래퍼에 둔다 |
| 머리/본문 여백 | 머리 `px-6 pt-6 pb-3`, 본문 `px-6 pt-3 pb-8`; limited는 내부 래퍼가 이 값을 든다 | [프로젝트 목록](../../../../app/(edit)/projects/page.tsx), [번역 머리](../../../../components/translations/header.tsx), Home. 중첩 래퍼에서 padding을 두 번 주지 않는다 |
| 제목과 조작 | 셸 안 `text-xl font-medium`, 최소 36px 행, 기존 주 행동은 오른쪽. 사이드바와 동일 의미면 `m.common.nav` 재사용 | 목록·번역·[멤버](../../../../app/(edit)/projects/[slug]/members/page.tsx). Home은 프로젝트명이 제목이고, 폼 저장은 해당 폼 안에 남는다 |
| 타입 | 기본 400, 제목·라벨 500. 크기 토큰이 자간을 소유. 본문 `text-sm`, 설명·메타 `text-xs`를 문맥에 맞게 유지 | [globals.css](../../../../app/globals.css), [FormGroup](../../../../components/ui/form-group.tsx). 설명 전체를 임의로 14px로 올리지 않는다 |
| 컨트롤 | 기본 버튼·Input·Select 36px; 작은 버튼 28px; 인증 버튼 40px. pending은 스피너·disabled, 버튼 라벨 유지 | [Button](../../../../components/ui/button.tsx), [Input](../../../../components/ui/input.tsx), [Select](../../../../components/ui/select.tsx). 높이는 프리미티브가 소유 |
| 목록 행 | 식별 내용 먼저, 보조 메타 다음, 상태는 별도 위치. 이동하는 행은 실제 링크, 행별 조작이 있으면 링크로 감싸지 않음 | 프로젝트 목록. 이름 15px·2줄 타일·상태 배지 하나는 이 목록의 구체형이며 모든 목록의 의무가 아님 |
| URL 상태 | 뒤로가기·새로고침에 살아야 하는 기존 필터·검색·cursor는 URL. 모르는 값은 기존 파서의 폴백 사용 | [프로젝트 필터 판정](../../../../lib/projects/list.ts), [routes](../../../../lib/routes.ts), [번역 필터](../../../../components/translations/filters.tsx). UI 모양을 맞추려고 없는 필터를 만들지 않음 |
| 빈 상태 | 데이터 없음 / 좁혀서 없음 / 조회 실패를 구별. 전체 페이지 빈 상태만 본문 중앙, 섹션 빈 상태는 그 섹션에 배치 | [EmptyState](../../../../components/ui/empty-state.tsx), 목록, [초대 목록](../../../../components/members/pending-invitations.tsx). 액션은 유효한 복구 경로가 있을 때만 |
| 로딩 | 로딩 중에도 패널·머리·본문 구조 유지. 실제 폭·높이에 맞춘 골격, 스켈레톤은 `aria-hidden`, 애니메이션은 `motion-safe` | [목록 loading](../../../../app/(edit)/projects/loading.tsx). 이를 모든 라우트의 새 `loading.tsx` 생성 요구로 확대하지 않음 |
| 색·아이콘 | neutral 토큰과 기존 semantic variant 사용. 기본 아이콘 16px, EmptyState는 48px 칩 안 16px. 외부 링크는 기존 색·아이콘 | [Badge](../../../../components/ui/badge.tsx), EmptyState, [toneFill](../../../../components/ui/tone.ts). 프로젝트 이름 색은 상태·권한을 뜻하지 않음 |

제목의 총계도 전역 의무가 아니다. 목록의 `all.length`와 번역의 전체 키 수는 이미 있는 값이다.
멤버·로케일 제목이나 사이드바에 숫자를 붙이려고 조회를 추가하지 않는다.

## 3. 전용 패턴과 보존 계약

### 3.1 인증 화면

`AuthLayout`은 로그인과 초대 수락이 공유한다. 320px 폼, 24px 제목, 40px provider/수락 버튼, 우측
키비주얼은 인증 전용이다. `AuthToast`를 범용 페이지 오류 컴포넌트로 재사용하지 않는다.
`/account`가 계정을 다뤄도 셸 밖 화면이 되는 것은 아니다.

### 3.2 편집 표와 관리 표

[table.tsx](../../../../components/ui/table.tsx)는 이미 같은 primitive 위에 두 표현을 제공한다.

| 종류 | 현재 계약 | 적용 방침 |
|---|---|---|
| 번역 | `Table scrollable={false}`, 키별 `tbody`, `rowSpan`, key 320px·locale 68px, 본문 스크롤·namespace sticky | 편집 표에만 유지. 행 전체 선은 실제 셀에 둔다. 값·저장 메타·키 설명의 긴 내용 확인 |
| 로케일·멤버·이력 | `Table`의 스크롤 래퍼 + `Th/Td/Tr` 프리셋, 보이는 열 제목, 줄바꿈 가능한 셀 | 현행 프리셋 유지. 숨긴 헤더·rowSpan·번역의 선 구조를 복사하지 않음 |

`Th/Td/Tr`은 구형 중복 구현이 아니다. 2026-09-12에 `TableHead/TableCell/TableRow` 위의 프리셋으로
정리됐고 [table-presets.test](../../../../components/__tests__/table-presets.test.tsx)가 이를 고정한다.
공통화를 이유로 프리셋을 삭제하면 관리 표의 padding·줄바꿈·sticky가 바뀐다.

관리 표의 `overflow-auto`와 바깥 `PanelBody`는 실제 높이·긴 내용으로 확인한다. 코드에 래퍼 둘이
있다는 이유만으로 스크롤 결함이라고 단정하지 않는다. 불필요한 이중 세로 스크롤이 재현되면
결함을 별도로 기록한다. 이번 톤앤매너 적용에서는 스크롤 소유권을 변경하지 않는다.

### 3.3 폼·카드

[Card](../../../../components/ui/card.tsx)와 FormGroup을 유지한다. 제목·설명·필드·도움말·저장·결과의
읽기 순서를 보존한다. 로그인 버튼 간격만으로 Repository·토큰·보관 카드의 새 구성을 도출하지 않는다.

- 계정 카드 넷, 프로젝트 설정 카드 여섯, 새 프로젝트의 기존 단계 순서를 유지한다.
- 저장 버튼은 `<form>` 안에 둬 Enter 제출을 보존한다. 필드 오류와 안내의 연결을 확인한다.
- 복사 가능한 토큰·링크·YAML과 한 번만 표시되는 토큰 안내를 없애지 않는다.
- 위험 조작은 기존 Dialog 확인과 대상 표시를 유지한다. 복원에는 새 확인 단계를 만들지 않는다.
- `text-mono`는 일괄 삭제하지 않는다. 키·로케일 코드는 sans라는 확정 규칙만 적용하고, 기계 텍스트는
  DESIGN §4.1의 현재 예외를 따른다. 다중 행 진단의 `whitespace-pre-wrap`과 YAML의 `<pre>`를 보존한다.

### 3.4 피드백 — 외형만 정렬

분류는 규약 8·DESIGN §6.25를 따른다. **같은 사건을 토스트와 Alert로 이중 표시하지 않는다.**

| 사건 | 표면 | 적용 예 |
|---|---|---|
| 전역 결과 이벤트 | 토스트, 조치가 남으면 지속 표시·닫기, effect는 고정 id | 로그인 거부, 일반 연결 callback 거부 |
| 특정 대상의 판정 | 대상 근처 인라인 | 필드 검증, 멤버 행 변경 실패, 번역 셀 저장 실패 |
| 지속 조건·복구 자료 | 인라인 | base 대기, 연결 건강성, 편집 손실, 첫 적재 진단 |
| 페이지 자체의 상태 | 본문 | 초대 만료, 보관, 미준비, 조회 장애 |
| Publish 결과 | **8-P까지 인라인 유지** | 파일 목록·warnings·PR 링크를 함께 보존 |

위 표는 최신 규약의 의미 경계다. **이번 작업은 기존 Alert를 토스트로 옮기지 않는다.** 현재 표시
위치·표시 시간·오류 분류·상태 전이는 유지하고 같은 의미의 피드백에서 색·서체·간격만 맞춘다.
`?e=`와 규약 사이의 기존 불일치는 별도 기록하며 이 작업의 완료 조건에 넣지 않는다.

현재 번역의 지속 배너·Publish 결과는 `TranslationsHeader` 컴포넌트 안의 **PanelBody 시작 부분**에
있다. 컴포넌트 이름이나 옛 tasks의 “머리에 남김”을 읽고 고정 `PanelHeader`로 옮기지 않는다.

## 4. 현재 불일치와 후속 조치

| 관측 근거 | 조치 | 검증 |
|---|---|---|
| ContentPanel 주석: 목록 `px-4`; 현재 목록과 loading: `px-6` | 2026-09-12 주석 현행화 적용 | 목록·loading·DESIGN §5.1의 여백 대조 |
| [new-project-flow](../../../../components/onboarding/new-project-flow.tsx)의 `manual-base`가 `text-mono`였음 | 2026-09-12 기준 로케일 입력 sans 적용; path·slug는 그대로 | 두 뷰포트에서 sans·36px 입력 확인; 최종 시각 캡처·입력·Tab 확인 |
| 멤버 제목 행은 OWNER의 Invite 버튼에 높이를 의존했음 | 2026-09-12 `min-h-9` 적용 | 두 뷰포트에서 버튼 유무와 무관하게 36px 확인; 실제 EDITOR 세션·캡처 확인 |

실물 비교에서 Dialog의 기본 z-auto가 관리 표 sticky z-10보다 낮아 표 머리가 모달을 덮는 결함을
추가 확인했다. Overlay·Content에 기존 포털 메뉴와 같은 z-50을 적용했다. 구성·포커스·닫기 동작은
그대로다. 나머지 화면은 기존 표면·타입·간격·컨트롤·상태 표현을 유지한다. 검증 기록은 [tasks](./tasks.md)에 있다.
`/account`의 `sm:` 분기처럼 지원 뷰포트에서 시각 차이가 없는 코드 정리는 포함하지 않는다.

## 5. 기술 경계와 테스트 대상

영향 흐름은 **편집 UI의 시각 표현**이다. push·pull 알고리즘, DB 진실·키 소유권, export 바이트와
blob SHA는 변경하지 않는다. 스키마·마이그레이션·환경변수·새 패키지 변경은 없다.

### 순수 판정

새 판정 함수를 만들 필요가 없다. 화면 형태가 같다고 서로 다른 도메인 상태를 하나의 함수로 합치지 않는다.
테스트 대상은 다음 **기존 순수 함수와 계약**이며, 표현 수정 때문에 기대값을 바꾸지 않는다.

- `lib/projects/list.ts`: 상태 우선순위·필터·검색. 총계는 필터 전 값.
- `lib/keys/filters.ts`·`view.ts`: chip 제거·초기화·로케일 선택·집계. 형제 컨트롤은 pending 공유.
- `lib/home/overview.ts`: 진행률과 활동; `lib/sync/view.ts`: 이력 결과·사유·cursor.
- `lib/auth/permission.ts`·`lib/onboarding/readiness.ts`: 버튼 노출과 차단의 기존 판정.

이 목록은 보존할 동작의 회귀 기준이다. 새 데이터 판정은 이번 범위 밖이다.
CSS 수치를 반환하는 함수를 억지로 만들지 않는다.
현재 변경 후보 대부분의 회귀는 순수 함수보다 DOM·실물 브라우저에서 검증한다.

### 경계

- 페이지·Server Action의 `requireUser`/`requireProjectAccess`를 유지한다. 레이아웃으로 인가를 옮기지 않는다.
- UI 편의를 위해 DB 조회·GitHub 호출·추가 RSC 데이터를 넣지 않는다. Client Component를 공통화할 때도
  `auth`·Prisma·어댑터 구현이 import 그래프에 들어오지 않게 한다.
- `routes`·`firstQueryValues`를 유지한다. 모든 검색을 하나의 client state 모델로 바꾸지 않는다.
- 기존 포커스 링과 Dialog/Radix/Slot 계약 유지. 링크 행 안에 버튼·링크를 중첩하지 않는다.

### 과거 함정

[POSTMORTEM](../../../POSTMORTEM.md)에서 이번 적용과 직접 관련된 항목을 읽었다.

| 기록 | 이번 검증에 반영 |
|---|---|
| 2026-08-31 레이아웃 인증 검사로 데이터 노출 | 페이지 인가 검사 위치 보존 |
| 2026-09-07 client bundle 7.2MB | UI 공통화가 서버 import를 끌고 오지 않는지 client-graph 검사 |
| 2026-09-07 revalidate가 첫 적재 결과 제거 | 결과를 readiness 분기 밖에 유지, 부분 실패 진단 확인 |
| 2026-09-08 form 검색 Enter 무효 | 실제 form 제출·Enter 검사 |
| 2026-09-09 Slot 형제 때문에 메뉴 열기 실패 | 기존 primitive 사용, 메뉴·Dialog 실제 열기/닫기 검사 |
| 2026-09-11 1280px 번역 입력 28px | 1280px 폭 실측, 오른쪽 패널 포함, 긴 문장·설명 검사 |
| 2026-09-12 필터 툴바·칩 pending 분리 | 부모 전체를 렌더해 양쪽 잠금·새 URL 보존 확인 |
| 2026-09-12 rowSpan의 세로선 단절 | 긴 키 설명에서 셀 경계선이 실제 행 높이 전체를 덮는지 확인 |

포커스 링은 현재 DESIGN §7이 수용한 토큰을 그대로 쓴다. 이번 작업을 접근성 대비 전면 충족으로 보고하지 않는다.
