신규 페이지의 첫 구현 동안만 시안이 SoT이고, dev에 들어간 뒤로는 코드 + DESIGN.md가 정본

# 공개·Auth 반응형 디자인 브리프

## 한 줄

기존 랜딩·문서·방침·릴리스 노트·로그인/초대/OAuth를 375부터 읽고 조작할 수 있게 재배치한다. 기존 화면의 새 시안은 변경 요청이며, 확정 전 현재 코드의 정본을 대체하지 않는다.

## 확정 기준

모든 지원 폭에서 기능은 같고 배치만 달라진다. 다음 확정 사항으로 프레임을 한 벌만 그린다.

- **D4 확정 — 사용자 확인 완료:** 최소 지원 폭 375px. 요청된 검증 폭과 일치한다.
- **D5 확정 — 사용자 확인 완료:** 공개 1차는 기존 5씬 축소+줄바꿈 캡션을 사용한다. 앱 반응형 완성 후 목업 내부도 앱 배치를 따르고, 16:10 데스크톱→태블릿→모바일 순으로 컨테이너를 바꿔 보여준다. 내부 UI는 바깥 페이지가 아닌 목업 컨테이너의 실제 너비로 앱의 반응형 규칙을 따른다. 후속 시안은 앱 브리프 A18에서 다룬다.
- **D6 확정 — 사용자 확인 완료:** 좁은 로그인 화면은 KV Shell 숨김·폼 우선, 가이드 스크린샷은 en 데스크톱 고정. 기능과 기존 가이드 공유 규격을 보존한다.

## 놓이는 자리

정적 코드 조사값이다. 브라우저 실측은 아직 없다. 기능 범위·변경 소유권·검증 기준은 [spec.md](spec.md)·[design.md](design.md)·[tasks.md](tasks.md)가 든다.

| 자리 | 현재 구성과 변경 요청 |
|---|---|
| 공개 셸 | `components/public-shell/public-shell.tsx`의 전체 헤더→내부 스크롤 패널→푸터. 셸 최소1280을 제거한다. 1024 이상 고정 내비 / 미만 서랍을 제안한다 |
| 공개 헤더 | `components/public-shell/header.tsx`의 로고·Docs·Changelog / 검색 / GitHub·계정. 로그인 상태는 Inbox·사용자 메뉴 포함. 좁으면 검색 트리거는 아이콘, 링크는 서랍에 재배치 |
| Docs | `app/docs/layout.tsx` 내비264와 `components/docs/doc-frame.tsx` 본문·TOC200. 좁은 내비는 서랍, 본문 컨테이너960 미만 TOC는 본문 앞 펼침 목록 후보 |
| Privacy / Changelog | `components/privacy/privacy-doc.tsx`의 본문+TOC와 `app/changelog/page.tsx` 단일 본문. 긴 표는 표 안에서만 가로 스크롤 |
| 랜딩 | `app/page.tsx` 히어로·CTA→`components/landing/stage.tsx` 5씬→마지막 CTA. 목업1440×900을 375에서 축소하면 약0.216배. 공개 1차는 기존 5씬 축소와 줄바꿈 캡션을 유지하고 캡션 높이를 배치에 반영 |
| Auth | `components/signin/auth-layout.tsx`는 로그인만 장식2열, 나머지는 폼 한 판. `components/signin/auth-column.tsx` 고정320·OAuth `app/oauth/authorize/page.tsx` 고정480을 가용 폭으로 제한 |
| 공통 오버레이 | `components/ui/large-modal.tsx`를 쓰는 검색과 `components/shell/attention-inbox.tsx`의 Inbox. 외곽을 줄여도 제목·본문·닫기·하단 동작이 모두 닿아야 한다 |

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

## 산출물·프레임 번호

**프로토타입 금지 — 상태별 정적 프레임을 캔버스에 나란히** 둔다. 열림/닫힘·선택 전/후는 연결된 동작이 아니라 별도 프레임이다. 아래 각 행은 **375·768·1024·1280 네 폭 각각** 그린다. 번호 뒤 `-375`처럼 폭을 붙이며 기본 라이트다. 상태 묶음은 `a/b/c`로 분리한다.

| 번호 | 화면 | 별도 상태 프레임 |
|---|---|---|
| P01 | 공개 헤더·푸터 | a 비로그인 / b 로그인 / c 내비 열림(1024·1280은 고정 내비 비교판) |
| P02 | 랜딩 | a 히어로 / b~f 씬1~5 / g 마지막 CTA. 공개 1차의 375·768도 같은 5씬을 축소하고 캡션은 읽을 수 있는 크기로 줄바꿈 |
| P03 | Docs 인덱스·장 | a 인덱스 / b 장 / c 내비 열림 |
| P04 | Docs 본문 | a 긴 표/코드 포함 / b TOC 펼침 / c 절 선택·이전/다음 / d 404 |
| P05 | Privacy | a 상단 / b 긴 표 / c TOC 펼침 |
| P06 | Changelog | a 최신 / b 긴 과거 릴리스 |
| P07 | Signin | a 기본 / b provider 진행 / c 실패. 375·768은 장식 없이 폼을 우선 배치 |
| P08 | Signin link | a 확인 / b 만료 / c 실패 / d 완료 |
| P09 | Invite | a 로그인 필요 / b 수락 가능 / c 계정 불일치 / d 만료·거부 / e 진행 / f 완료 |
| P10 | OAuth authorize | a 로그인 / b 선택폼 / c 많은 프로젝트 / d 진행 / e 실패·무효 |
| P11 | 검색 | a 비로그인 Docs / b 로그인 결과 / c 없음 / d 로딩 / e 실패 |
| P12 | Inbox | a 항목 있음 / b 빈 / c 로딩 / d 실패 |
| P13 | 오류 경계 | a 루트404 / b 일반오류 / c global-error |
| P14 | 다크 대표 | P01b·P04a·P07a·P10b·P11b·P12a를 네 폭에서 복제 |
| P15 | 긴 번역 | P01·P04·P09·P10의 ko/es 긴 문구를 네 폭에서 각각 복제 |

시안은 상태가 화면에 닿는 위치와 줄바꿈을 보여준다. ko/es 전체 조합의 기능 검증은 구현 후 폭4×테마2×언어3 매트릭스로 수행한다.

## 동작 주석

- 서랍은 메뉴 버튼으로 열고 닫기·Esc·배경으로 닫는다. 열림 동안 배경 조작과 배경 탭 이동을 막는다. 초점은 서랍 제목 또는 첫 내비 항목으로, 닫으면 기존 트리거로 돌아온다.
- 링크 이동 시 서랍을 닫고 도착한 페이지의 기존 포커스 규칙을 따른다. 서랍에서 1024 이상으로 넓혀도 초점이 숨겨진 노드에 남지 않게 한다.
- Docs 절 이동은 해시·기존 본문 스크롤러를 유지한다. 내비 서랍과 TOC는 서로 다른 역할이며 같은 목록으로 합치지 않는다.
- 검색은 버튼과 기존 Cmd/Ctrl+K 모두 열려야 한다. IME 조합중 Esc는 종료로 처리하지 않는 기존 규칙 유지. 로그인 상태에 따라 검색 범위가 바뀌는 사실은 동일하다.
- Inbox는 기존 열람 시각/배지 계약을 유지한다. 모바일과 데스크톱 DOM을 둘 다 마운트해 Action이 두 번 실행되지 않게 한다.
- OAuth/초대 진행 중 중복 제출·이탈 제한, 오류 후 포커스 규칙을 유지한다. 좁은 화면에서도 거부 이유와 확인문이 먼저 읽힌다.
- 랜딩 캡션은 여러 줄이 되어도 목업·진행 표시·다음 CTA와 겹치지 않는다. 캡션 고정 높이를 가정하지 않고 실제 높이를 스테이지 배치에 반영한다. 5씬의 정보와 reduced-motion 계약은 유지한다.
- 375·768 소프트 키보드 상태에서 입력·동작 버튼 접근 가능 여부는 별도 구현 검증이다.

## 그리지 않는 것

앱 편집 화면, 새 데이터/권한/승인 흐름, 새 디자인 토큰, 새로운 가이드 내용, 브라우저 확장·네이티브 앱, prototype 연결선. 기능이 빠진 좁은 화면이나 추천 대안 두 벌을 만들지 않는다.
