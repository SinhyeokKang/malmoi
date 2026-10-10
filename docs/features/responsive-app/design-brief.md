신규 페이지의 첫 구현 동안만 시안이 SoT이고, dev에 들어간 뒤로는 코드 + DESIGN.md가 정본

# 앱 반응형 디자인 브리프

## 한 줄

모든 지원 폭에서 번역 편집·관리·온보딩 전 기능을 지원한다. 폭에 따른 기능 분기는 0이며 차이는 고정 내비↔서랍·적층·단일 판 전환뿐이다.

## 확정 기준

아래 확정 사항을 전제로 각 화면을 한 벌만 그린다. 공개 표면의 추천은 앱이 공유하는 헤더·가이드 맥락과 일치시킨다.

- **D4 확정 — 사용자 확인 완료:** 최소 지원 폭 375px. 이 폭부터 번역 편집과 관리 작업 전부를 검증한다.
- **D5 확정 — 사용자 확인 완료:** 공개 1차의 5씬 축소+줄바꿈 캡션을 거쳐, 앱 반응형 완성 후 랜딩 목업에도 16:10 데스크톱→태블릿→모바일 컨테이너를 순서대로 보여주고, 내부 UI는 그 컨테이너의 실제 너비에 따라 앱의 반응형 규칙으로 배치한다. A18은 앱 완성 후의 후속 프레임이며 공개 1차의 대안이 아니다.
- **D6 확정 — 사용자 확인 완료:** 좁은 로그인 화면은 KV Shell 숨김·폼 우선, 가이드 스크린샷은 en 데스크톱 고정. 앱 기능과 가이드 공유 구조를 보존한다.

## 공개 단계에서 이미 정해진 것 (2026-10-11 — 다시 그리지 않는다)

공개 시안 `Public Responsive.dc.html`과 responsive-public `orch.md` 결정 기록이 정본이다. 앱 프레임은 아래를 그대로 쓰고 앱 고유 본문만 그린다.

- 좁은 헤더(PT1a) — 로고·메뉴 · 검색 아이콘·Inbox·계정, 한 벌. 측면 서랍(PT1b) — `DrawerContent`.
- 전체 화면 시트(PT2c·PT4·PT5) — LargeModal `lg` 미만 시트(머리 56 · `flush` · footer 감김), 검색·Inbox 시트(Inbox 첫 포커스 = 닫기, D22). 계정 메뉴는 팝오버(PT5b) · 열림 링.
- 터치 누름 영역 44(`sm`·아이콘 크기 전부, D17). `viewport-fit=cover` 없음(D18 — safe-area 0). 키보드는 Android만(D20).
- 앱이 새로 만드는 것: LNB 서랍 내용·프로젝트 전환, 꺼진 사유 줄 프리미티브(AT8a가 첫 그림), 리사이저 `touch-action`, 이력 상세 시트 머리 정렬, 번역 단일 판, Files 순차 판.

## 놓이는 자리

브라우저 실측 없이 소스 배치값을 읽었다. 기능 범위·파일 소유권·테스트·검증 게이트는 [spec.md](spec.md)·[design.md](design.md)·[tasks.md](tasks.md)가 든다. 구현 동안 정본은 **패턴 대표 프레임**이고(아래 산출물 절), 같은 패턴의 나머지 화면은 코드가 그 패턴을 따른다.

| 자리 | 현재 구성·변경 요청 |
|---|---|
| 앱 셸 | `app/(edit)/layout.tsx` 헤더→LNB+콘텐츠. `components/shell/shell-panels.tsx` LNB200~320(기본240), 접힘40. 1024(`lg`) 미만은 서랍(그릇은 공개 `DrawerContent` — PT1b 형). 헤더 배치는 공개 브리프 PT1a와 같고 앱은 LNB 서랍·프로젝트 전환만 더한다. 기존 수동 접힘과 저장 폭은 별개 |
| Projects | `components/projects/project-list.tsx` 이름420·Meters·배지·상태. 좁으면 이름을 유동 폭으로, 부가 정보는 아래로. 지금 좁은 폭에서 숨는 로케일 미터도 숨기지 않고 아래 줄로 |
| Home | `app/(edit)/projects/[slug]/(home)/page.tsx` 할 일·카운트·로그 본문 + 메타320. 컨테이너960 미만은 메타 아래 적층 후보 |
| 번역 | `components/translations/workspace/workspace.tsx` 트리·목록·상세. `lib/translations/layout.ts`에서 트리 접힌 뒤에도 최소772. 772 미만은 한 번에 한 판. 트리는 지금의 접힌 트리 팝오버(280)를 그대로 연다 |
| Members | `components/members/member-row.tsx` 이름300, 역할132·날짜150. 초대는 `components/members/invite-modal.tsx` 이메일+역할168의 반복행 |
| Sources·Logs | `components/sources/sources-screen.tsx` 경로·상태·chevron. `components/logs/event-row.tsx` 시간·사건·주체·상세. 상세 모달과 필터도 같은 좁은 배치 필요 |
| Settings·Account·Preferences·MCP | 공통 카드와 폼. 이름·Select320, 토큰·권한 묶음. 고정 폭을 최대 폭으로 바꾸고 카드 컨테이너 기준으로 적층 |
| New project·Add sources | `components/onboarding/steps/files.tsx` 후보/샘플 두 판, 고정분모952. 좁으면 후보→샘플 순차, 단계 진행/뒤로/결과 유지. 프로젝트 생성과 소스 추가를 완료까지 지원 |

디자인 시스템의 색·크기·radius·그림자·타이포 및 기존 컴포넌트 규격은 되적지 않는다. 위 숫자는 레이아웃이 깨지는 현재 페이지 제약만 설명한다.

## 프리미티브

`components/ui/`의 `Button`, `ButtonLink`, `Dialog`, `DialogContent`, `LargeModal`, `CloseButton`, `Card`, `PanelFacts`, `ListGroup`, `BannerLine`, `ListRow`, `Select`, `Input`, `Textarea`, `SearchInput`, `FieldButton`, `FieldTrigger`, `Checkbox`, `Tabs`, `SegmentedControl`, `Badge`, `StatusBadge`, `CountBadge`, `Meter`, `Alert`, `EmptyState`, `ErrorState`, `Skeleton`, `Table`, `CodeBlock`, `WizardFooter`, `ResizablePanelGroup`를 재사용한다. 서랍은 기존 Dialog 조립이며 별도 디자인 체계를 만들지 않는다.

## 상태·항목·문구

| 표면 | 상태/항목 | 문구·주의 |
|---|---|---|
| 셸 | 내비 열림/닫힘·프로젝트 전환·OWNER/EDITOR·읽지 않은 Inbox·검색 | 기존 nav·search·inbox 사전. 역할 때문에 없는 항목과 폭 때문에 접힌 항목을 혼동하지 않음 |
| Projects/Home | 없음·다수·보관·설정 전·미전달·적재실패·검토/빈 언어 | 기존 projects·home 사전. 작은 화면에서도 상태 원인을 숨기지 않음 |
| 번역 공통 | 소스/트리·검색·Status·목록·키/로케일 상세·빈/오류 | 기존 translations 사전. 목록↔상세 돌아갈 때 선택키·필터·범위 유지 |
| 번역 편집 | dirty·저장중·저장실패·남은 편집·Sync/Publish 잠금·이탈확인 | 모든 지원 폭에서 기존 Save/Revert/Publish·needsReview와 손실 경고 재사용 |
| Members | 구성원/대기초대·많음·권한·재발송·제거 확인·실패 | 기존 members 사전. 모든 폭에서 초대·역할 변경·제거·재발송 지원 |
| Sources | 적재 전/완료/실패·기준 언어·제거 확인·추가 | 기존 sources·settings 사전. 제거 보호 지문과 위험 문구 생략 금지 |
| Logs | 검색/필터·빈·불러오기·실패·날짜·상세 사건 | 기존 logs 사전, 사용자 시간대·오프셋 유지 |
| 사용자 화면 | Account·Language·Time zone·Theme·MCP 연결/토큰 | 기존 account·preferences·mcp 사전, 긴 이메일/시간대/권한명 |
| 온보딩 | 리포→파일→이름/기준언어→진행/결과 | 기존 newProject 사전. 모든 폭에서 후보→샘플 순차 판과 생성 완료 지원 |
| 공통 | 로딩·오류·404·보관·권한없음·Dialog 진행/결과 | 본 화면과 동일 적층의 골격. 버튼을 화면 밖으로 미루지 않음 |

새 en 키 후보(미확정): `responsive.backToKeys`, `responsive.openSources`. 기존 키 우선 재사용, 추가 시 ko/es 동시 번역. “Approve translation” 문구는 만들지 않는다. PRODUCT §4.2는 승인 워크플로를 비범위로 둔다.

## 산출물·대표 프레임

**프로토타입 금지 — 상태별 정적 프레임을 캔버스에 나란히** 둔다. 판 전환·열림/닫힘도 연결된 동작이 아니라 별도 프레임이다.

**패턴마다 대표 페이지 하나만 그린다**(2026-10-07 사용자). 대표 프레임이 그 패턴의 정본이고, 같은 패턴의 나머지 화면은 시안 없이 코드에서 그 패턴을 적용한다. 1280은 현재 코드라 그리지 않는다. 오류·로딩·빈 같은 상태 변형은 그리지 않는다 — 기존 상태 컴포넌트가 같은 자리에 선다. 번호 뒤 `-375`처럼 폭을 붙이며 기본 라이트·en이다.

| 번호 | 패턴 · 대표 페이지 | 폭 | 프레임 |
|---|---|---|---|
| AT1 | 앱 셸·LNB 서랍 · Home (+ 프로젝트 밖 `/inbox`) | 375 · 768 · 1024 | a 헤더 / b LNB 서랍 열림 + 프로젝트 전환 / c 1024의 40 레일 / d 프로젝트 밖 서랍 — 내 프로젝트 목록 구역 + `New project`(sidebar-projects 2026-10-09) |
| AT2 | 행 목록 적층 · Projects | 375 · 768 | a 다수·상태 혼합(미터·배지가 아래 줄로) |
| AT3 | 본문+사이드 메타 적층 · Home | 375 · 1024 | a 메타가 본문 아래로 |
| AT4 | 폼 카드 · Settings | 375 | a 일반 + 리포 연결 카드 |
| AT5 | LargeModal 반복 행 폼 · 초대 모달 | 375 | a 이메일+역할 행 여러 개 / b 긴 이메일 줄바꿈 — 그릇은 공개 PT4·PT5의 전체 화면 시트 형(공개 design §1 큰 모달 규칙, 2026-10-10)이고 시트 안 본문만 그린다 |
| AT6 | 번역 단일 판 · Translations | 375 · 1024(LNB320으로 카드 772 미만) | a 목록 / b 트리 팝오버 / c 상세 편집 중(dirty) / d 키보드 열림 — Save가 키보드 바로 위(Android 기준 — iOS 비대응, 공개 D20) / e '목록으로' 뒤 선택 행 표시 |
| AT7 | 순차 판 · New project Files | 375 | a 후보 목록 / b 샘플 |
| AT8 | 위험 동작 · Publish 헤더 + 확인 Dialog | 375 | a 꺼진 Publish와 아래 사유 줄 / b 확인 Dialog의 긴 경고와 footer |
| AT9 | 다크 대표 | 375 | AT1b·AT6c 복제 |
| AT10 | 긴 번역 | 375 | AT1b·AT6c·AT5a의 es 문구 |
| A18 | 앱 완성 후 랜딩 목업 · 씬2(번역) | 데스크톱16:10 · 태블릿 · 모바일 컨테이너 | a 세 컨테이너 순차 상태 / b 다크. 나머지 씬은 같은 규칙. 앱 실측 완료 뒤 수령 |

**패턴 적용 대상(그리지 않는다)**

| 패턴 | 적용 화면 |
|---|---|
| AT1 | 앱의 모든 화면 헤더·LNB, Account·Preferences·MCP |
| AT2 | Members 목록·대기 초대, Sources 목록, Logs 행, MCP 토큰·연결 목록 |
| AT3 | Sources 상세 메타, Logs 사건 상세 |
| AT4 | Account·Preferences·MCP 카드, Sources 기준 언어, Settings CI·토큰·보관 |
| AT5 | Add sources, 로그 상세, 소스 상세, Publish 미리보기 |
| AT6 | 번역 화면의 검색0·오류·로딩, Inbox에서 키로 착지 |
| AT7 | Add sources Files 단계 |
| AT8 | Sync·Revert·소스 제거·멤버 제거·토큰 폐기 확인 |

## 동작 주석

보이는 결과만 적는다. 구현 계약(history·reducer·IME·늦은 응답)은 [design.md](design.md) §3이 정본이다.

- 서랍은 공개 브리프와 같다 — 열면 현재 항목에 포커스, 닫으면 메뉴 버튼으로 돌아온다.
- 단일 판에서 한 번에 한 판(목록·상세)만 보인다. 상세 위에는 '목록으로'가 있고, 누르면 아까 고른 행이 선택된 채 목록이 보인다.
- 트리는 목록 위 팝오버로 열리고, 고르면 닫히며 목록이 보인다.
- 키를 열면 상세 제목이 보이고 포커스 링이 제목에 있다.
- 키보드가 열려도 Save·Revert 줄은 키보드 바로 위에 보인다(Android. iOS Safari는 비대응).
- 꺼진 Publish·Sync의 이유는 좁은 폭에서 버튼 아래 작은 글자 줄로 보인다.
- 온보딩 Files는 좁으면 후보 목록과 샘플이 한 판씩 보이고 '샘플 보기'·'후보로' 버튼으로 오간다. Next 위치는 그대로다.
- 같은 역할·상태에서 가능한 동작은 모든 폭에서 같다. 폭을 이유로 숨기거나 비활성화한 버튼이 없다.

## 그리지 않는 것

새 승인 상태 머신, 새 역할/권한, DB·동기화 변경, 네이티브 앱, 별도 모바일 URL, 소비자 없는 프리미티브, 새 디자인 시스템, 1280 프레임, 상태 변형 프레임. PRODUCT §4.2에 따라 새 승인 단계는 만들지 않고 기존 Publish·Sync·Revert·needsReview 흐름을 그대로 지원한다.
