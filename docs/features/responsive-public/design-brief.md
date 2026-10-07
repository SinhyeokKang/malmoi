신규 페이지의 첫 구현 동안만 시안이 SoT이고, dev에 들어간 뒤로는 코드 + DESIGN.md가 정본

# 공개·Auth 반응형 디자인 브리프

## 한 줄

기존 랜딩·문서·방침·릴리스 노트·로그인/초대/OAuth를 375부터 읽고 조작할 수 있게 재배치한다. 구현 동안 정본은 **패턴 대표 프레임**이고(아래 산출물 절), 같은 패턴의 나머지 화면은 코드가 그 패턴을 따른다. dev에 들어간 뒤로는 코드 + DESIGN.md가 정본이다.

## 확정 기준

모든 지원 폭에서 기능은 같고 배치만 달라진다. 다음 확정 사항으로 프레임을 한 벌만 그린다.

- **D4 확정 — 사용자 확인 완료:** 최소 지원 폭 375px. 요청된 검증 폭과 일치한다.
- **D5 확정 — 사용자 확인 완료:** 공개 1차는 기존 5씬 축소+줄바꿈 캡션을 사용한다. 앱 반응형 완성 후 목업 내부도 앱 배치를 따르고, 16:10 데스크톱→태블릿→모바일 순으로 컨테이너를 바꿔 보여준다. 내부 UI는 바깥 페이지가 아닌 목업 컨테이너의 실제 너비로 앱의 반응형 규칙을 따른다. 후속 시안은 앱 브리프 A18에서 다룬다.
- **D6 확정 — 사용자 확인 완료:** 좁은 로그인 화면은 KV Shell 숨김·폼 우선, 가이드 스크린샷은 en 데스크톱 고정. 기능과 기존 가이드 공유 규격을 보존한다.

## 놓이는 자리

정적 코드 조사값이다. 브라우저 실측은 아직 없다. 기능 범위·변경 소유권·검증 기준은 [spec.md](spec.md)·[design.md](design.md)·[tasks.md](tasks.md)가 든다.

| 자리 | 현재 구성과 변경 요청 |
|---|---|
| 공개 셸 | `components/public-shell/public-shell.tsx`의 전체 헤더→내부 스크롤 패널→푸터. 셸 최소1280을 제거한다. 1024(`lg`) 이상 고정 내비 / 미만 서랍 |
| 공개 헤더 | `components/public-shell/header.tsx`의 로고·Docs·Changelog / 검색 / GitHub·계정. 로그인 상태는 Inbox·사용자 메뉴 포함. 좁으면 검색 트리거는 아이콘, 링크는 서랍에 재배치 |
| Docs | `app/docs/layout.tsx` 내비264와 `components/docs/doc-frame.tsx` 본문·TOC200. 좁은 내비는 서랍, 본문 컨테이너960 미만 TOC는 본문 앞 펼침 목록 후보 |
| Privacy / Changelog | `components/privacy/privacy-doc.tsx`의 본문+TOC와 `app/changelog/page.tsx` 단일 본문. 긴 표는 표 안에서만 가로 스크롤 |
| 랜딩 | `app/page.tsx` 히어로·CTA→`components/landing/stage.tsx` 5씬→마지막 CTA. 목업1440×900을 375에서 축소하면 약0.227배(`fitScale`, side 24). 공개 1차는 기존 5씬 축소와 줄바꿈 캡션을 유지하고 캡션 높이를 배치에 반영 |
| Auth | `components/signin/auth-layout.tsx`는 로그인만 장식2열, 나머지는 폼 한 판. `components/signin/auth-column.tsx` 고정320·OAuth `app/oauth/authorize/page.tsx` 고정480을 가용 폭으로 제한 |
| 공통 오버레이 | `CommandDialog`(`components/ui/dialog.tsx` — LargeModal 치수 상수를 쓴다)인 검색과 `components/shell/attention-inbox.tsx`의 Inbox. 외곽을 줄여도 제목·본문·닫기·하단 동작이 모두 닿아야 한다 |

색·크기·radius·그림자·타이포와 기존 컴포넌트 규격은 다시 정의하지 않는다. 기존 디자인 시스템을 그대로 쓴다. 위 숫자는 현재 페이지의 배치 제약을 설명하는 값이다.

## 프리미티브

`components/ui/`의 `Button`, `ButtonLink`, `FieldButton`, `Dialog`, `DialogContent`, `LargeModal`, `DropdownMenu`, `Popover`, `Select`, `Input`, `Checkbox`, `RadioGroup`, `Command`, `Tabs`, `Alert`, `EmptyState`, `ErrorState`, `Skeleton`, `Card`, `ListGroup`, `Table`, `CodeBlock`, `CloseButton`, `MalmoiMark`를 사용한다. 새 Drawer 디자인 시스템을 만들지 않고 Dialog 기반으로 서랍을 조립한다.

## 상태·항목·문구

기존 `messages/en.tsx`·`messages/ko.tsx`·`messages/es.tsx` 문구를 그대로 사용한다. 아래는 화면의 항목이지 새 번역 확정문이 아니다.

| 표면 | 상태/항목 | 문구 출처·요구 |
|---|---|---|
| 헤더·서랍 | 비로그인 / 로그인 / 열림 / 닫힘, Docs·Changelog·GitHub·계정·언어 | `m.landing.shell`, `m.common.nav`, `m.search` 재사용. 좁다고 Inbox·검색을 제거하지 않음 |
| 검색 | 빈 입력·결과 있음·없음·로딩·세션 종료·실패, 로그인/비로그인 탭 | `m.search`, 기존 결과 목적지 유지 |
| Inbox | 읽지 않음·모두 읽음·빈·로딩·실패, 긴 프로젝트명·항목 여러 개 | `m.inbox`. “열기=읽음 기록” 계약 유지 |
| Docs | 인덱스·장·본문·404·선택 내비·펼친 TOC | `m.publicDocs.docs`, 해당 언어 가이드 제목. 본문 표/이미지/코드와 이전·다음 포함 |
| Privacy | 언어별 안내·절 선택·긴 표 | `components/privacy/privacy-doc.tsx`와 방침 사전. 법적 본문을 줄이지 않음 |
| Changelog | 최신/과거 릴리스·긴 제목·변경 목록 | `m.changelog`와 기존 릴리스 원문 |
| 랜딩 | 히어로·CTA·씬1~5·마지막 CTA·reduced-motion | `m.landing` 기존 카피. 공개 1차는 모든 폭에 같은 5씬, 줄바꿈 캡션으로 의미 전달 |
| 로그인/계정 연결 | 기본·provider 진행·실패·만료·완료 | `m.signIn`, 기존 계정 연결 문구. 좁은 폭은 장식을 숨기고 폼 우선 |
| 초대 | 수락 가능·로그인 필요·계정 불일치·만료/사용됨·거부·진행·완료 | `m.invite`, 프로젝트 카드와 역할·언어·초대한 사람 유지 |
| OAuth | 로그인 필요·프로젝트 선택·권한 선택·승인중·실패·요청 무효 | `m.oauthAuthorize`, Authorize/Deny 및 계정 전환. 새 승인 워크플로가 아니라 기존 OAuth 동의 |
| 오류 | 루트404·일반오류·재시도 불가 | 기존 오류 문구 재사용 |

새 en 키 후보(미확정): `responsive.openNavigation`, `responsive.closeNavigation`, `responsive.onThisPage`. 기존 동일 의미 키가 있으면 새 키를 만들지 않는다. 확정 시 ko·es도 같은 배치에서 번역한다.

## 산출물·대표 프레임

**프로토타입 금지 — 상태별 정적 프레임을 캔버스에 나란히** 둔다. 열림/닫힘·선택 전/후는 연결된 동작이 아니라 별도 프레임이다.

**패턴마다 대표 페이지 하나만 그린다**(2026-10-07 사용자). 대표 프레임이 그 패턴의 정본이고, 같은 패턴의 나머지 화면은 시안 없이 코드에서 그 패턴을 적용한다. 1280은 현재 코드라 그리지 않는다. 오류·만료·로딩 같은 상태 변형은 그리지 않는다 — 기존 상태 컴포넌트가 같은 자리에 선다. 번호 뒤 `-375`처럼 폭을 붙이며 기본 라이트·en이다.

| 번호 | 패턴 · 대표 페이지 | 폭 | 프레임 |
|---|---|---|---|
| PT1 | 공개 셸·헤더·서랍 · 랜딩 상단(로그인) | 375 · 768 · 1024 | a 헤더 / b 서랍 열림(현재 페이지 항목 포커스) / c 비로그인 헤더(375만) |
| PT2 | 읽기 문서 + TOC · Docs 본문 | 375 · 768 · 1024 | a 본문 + 긴 표·코드 / b TOC 펼침 / c Docs 서랍(사이트·장 두 구역) |
| PT3 | Auth 폼 한 판 · Invite 수락 + Signin | 375 | a Invite 수락 가능 / b Invite 키보드 열림(footer 위치) / c Signin 장식 숨김 |
| PT4 | 좁은 CommandDialog · 검색 | 375 | a 결과 있음 |
| PT5 | 헤더 팝오버 · Inbox | 375 | a 항목 있음 |
| PT6 | 랜딩 캡션 · 씬1 | 375 · 768 | a 캡션 여러 줄 + 목업 + 진행 표시 |
| PT7 | 다크 대표 | 375 | PT1a·PT2a 복제 |
| PT8 | 긴 번역 | 375 | PT1b·PT3a의 es 문구 |

**패턴 적용 대상(그리지 않는다)**

| 패턴 | 적용 화면 |
|---|---|
| PT1 | 모든 공개 페이지 헤더·푸터, Changelog·Privacy·Docs 헤더 |
| PT2 | Docs 인덱스·장·404, Privacy, Changelog(TOC 없음) |
| PT3 | Signin link, OAuth authorize, 초대의 만료·불일치·거부, 루트 404·오류 |
| PT4 | LargeModal을 쓰는 공개 오버레이 전부 |
| PT6 | 랜딩 씬2~5·마지막 CTA |

ko/es 전체 조합의 기능 검증은 구현 후 spec 샘플링 규칙으로 수행한다.

## 동작 주석

- 서랍은 메뉴 버튼으로 열고 닫기·Esc·배경으로 닫는다. 열리면 현재 페이지 항목에 포커스가 있고, 닫으면 메뉴 버튼으로 돌아온다. 링크를 누르면 서랍이 닫히고 도착한 페이지가 포커스를 갖는다.
- 좁은 Docs의 서랍 트리거는 하나다. 서랍 안에 사이트 내비와 장 내비가 두 구역으로 보인다. TOC는 본문 앞 펼침 목록이다.
- 좁은 헤더에는 로고·메뉴 버튼·검색 아이콘·Inbox·계정이 남는다. Docs·Changelog·GitHub·언어는 서랍에 있다.
- 키보드가 열려도 Invite·OAuth의 주 버튼은 키보드 바로 위에 보인다.
- 꺼진 버튼의 이유는 좁은 폭에서 버튼 아래 작은 글자 줄로 보인다.
- 랜딩 캡션은 여러 줄이 되어도 목업·진행 표시·다음 CTA와 겹치지 않는다.

## 그리지 않는 것

앱 편집 화면, 새 데이터/권한/승인 흐름, 새 디자인 토큰, 새로운 가이드 내용, 브라우저 확장·네이티브 앱, prototype 연결선, 1280 프레임, 상태 변형 프레임. 기능이 빠진 좁은 화면이나 추천 대안 두 벌을 만들지 않는다.
