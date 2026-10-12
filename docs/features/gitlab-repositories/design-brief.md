신규 페이지의 첫 구현 동안만 시안이 SoT이고, dev에 들어간 뒤로는 코드 + DESIGN.md가 정본

# GitLab repositories — 디자인 브리프

## 한 줄

새 프로젝트 온보딩 ①에 리포 호스트 선택과 GitLab 연결 단계를 더하고, 기존 리포 연결·CI·Publish 표면에 GitLab 변형을 그린다. 보류 초안이다 — 인증 방식·연결 입구 위치·MR 번호 표기가 [spec.md](spec.md) §6에서 닫힌 뒤에 시안을 의뢰한다. 그 전에는 아래 "열린 갈래"를 후보 프레임으로만 둔다.

## 확정 기준

- 편집 화면(번역 워크스페이스)은 그리지 않는다 — 편집자가 보는 차이는 리포 호스트 이름·링크·PR/MR 호칭뿐이고, 그것은 문구 분기로 낸다(spec §1, design §2 "문구 전략").
- 문구는 **리포 호스트별 문장 분기**다(2026-10-12 사용자 결정). 호스트 이름을 끼워 넣지 않는다 — ko 조사가 GitHub(가·는)와 GitLab(이·은)에서 반대다.
- 셀프 호스팅 설치본도 같은 화면이다(2026-10-12 사용자 결정 — 배포 모드로 화면을 가르지 않는다).
- 최소 지원 폭 375px, 폭에 따른 기능 분기 0(DESIGN — v1.3.2 반응형).

## 놓이는 자리

정적 코드 조사값이다(2026-10-12). 기능 범위·판정은 spec·[design.md](design.md)가 든다.

| 자리 | 현재 구성 | 요청 |
|---|---|---|
| 온보딩 모달 ① | `components/onboarding/new-project.tsx`(LargeModal + WizardFooter) → `steps/repo.tsx`. 연결 전엔 `ConnectGithubButton`(`connect-github.tsx`, primary 버튼 + GitHub 글리프, 실패는 아래 danger Alert). 연결 뒤엔 검색 Input → 리포 목록(`IconTile` lg + 이름 `text-base` + 보조 `text-sm`, 테두리 목록) → 브랜치 Select(`w-[220px]`, 좁으면 `@max-form:flex-1`) | ① 앞 또는 ① 안에서 리포 호스트를 고른다(열린 갈래 A). GitLab이면 연결 단계(열린 갈래 B) 뒤 같은 리포 목록에 GitLab 리포가 선다 |
| 리포 목록 행 | `owner/repo` 한 줄 `truncate` | GitLab 하위 그룹 `group/subgroup/project`가 길다 — 375에서 어디를 말줄임하나(이름 우선 보존) |
| 설정 › Repository 카드 | `components/settings/repository-card.tsx` — `Card` 머리 아래 상태 Alert(inset) · 연결 행(`IconTile` + `owner/repo` `break-all` + `StatusBadge` + 보조 줄 + 우측 Reconnect/Open 버튼) · 계정 복구 줄 | GitLab 리포 행(글리프·주소·상태) · 자격증명 만료 임박/만료/철회/플랜 미달 상태 · 우측 컨트롤 |
| 설정 › CI 카드 | `components/settings/ci-card.tsx` — `ListRow` 하나(제목 + 경로 `.github/workflows/malmoi-i18n.yml`) → LargeModal 안 `workflow-block.tsx`(`CodeBlock` fill + 저장 경로 안내) | GitLab이면 경로 `.gitlab-ci.yml` + masked·protected CI/CD 변수 안내 단계가 붙는다 |
| 온보딩 결과(⑤) | `steps/result.tsx` + `workflow-block.tsx` | CI 카드와 같은 GitLab 안내를 짝으로 |
| Home 메타 · Publish | Home 메타 Repository 행(라벨 + 오른쪽 정렬 값)·PR 링크(번호가 링크 이름) · `publish-button.tsx`의 `GitPullRequestArrow` 글리프 · Publish 결과 | MR 호칭·번호 표기(열린 갈래 C), 375에서 긴 namespace |
| `/account` | `components/account/github-section.tsx` — GitHub 연결 리스트 항목 + 우측 Connect/Disconnect | 인증이 사용자 수준 연결이면 GitLab 항목이 나란히 선다(열린 갈래 B에 종속) |

## 열린 갈래 (spec §6 — 닫히기 전엔 후보 프레임만)

| 갈래 | 후보 | 그리는 법 |
|---|---|---|
| A 연결 입구 | A1 ① 앞 새 화면(GitHub/GitLab 둘 중 선택) · A2 ① 안 선택지(세그먼트 또는 두 버튼) | 두 후보를 나란히 한 프레임씩 |
| B 인증 | B1 OAuth 왕복(지금 GitHub 버튼과 같은 모양 — 나갔다 돌아옴) · B2 프로젝트 토큰 붙여 넣기(이 리포에 처음 생기는 **비밀값 입력** 필드 + 만료일) | B2만 새 형이라 B2를 그린다. B1은 기존 버튼에 글리프만 바뀐다 |
| C MR 번호 | `!123`(GitLab 고유) · `#123`(지금 규칙) | Home 메타 한 프레임에 두 후보 |
| D 글리프 색 | tanuki 다색(Google 4색 선례, DESIGN §6.2·§6.8 예외 등재 필요) · 단색 `currentColor` | 리포 행 한 프레임에 두 후보 |

## 프리미티브

`components/ui/`의 `LargeModal`, `WizardFooter`, `Button`, `ButtonLink`, `Input`, `Select`, `RadioGroup`, `Alert`, `StatusBadge`, `IconTile`, `Card`, `ListRow`, `CodeBlock`, `EmptyState`, `Skeleton`, `InlineLink`를 쓴다. 새 프리미티브를 만들지 않는다. 비밀값 입력은 `Input`(type password + 보이기 토글이 필요하면 기존 패턴을 먼저 찾는다)으로 짓는다. 브랜드 글리프는 `components/signin/brand-icons.tsx` 한 곳이다. 새 색은 없다 — 상태 톤은 DESIGN §2.4의 기존 행(만료 임박은 새 **상태 행**이지 새 톤이 아니다 — warning).

## 상태·항목·문구

문구는 기존 GitHub 키의 GitLab 짝을 **문장 통째로** 만든다(보간 금지). 아래는 항목이지 확정문이 아니다.

| 표면 | 상태/항목 | 문구 출처·요구 |
|---|---|---|
| 호스트 선택 | GitHub / GitLab, 각 한 줄 설명 | 새 키. 셀프 호스팅에서 GitHub App이 없는 설치면 GitHub 선택지가 어떻게 보이나(spec §6 "GitLab 전용 셀프 호스팅 설치의 GitHub App" 결정에 종속) |
| GitLab 연결(B2) | 빈 입력 · 검증 중 · 권한 부족(쓰기 없음) · 플랜 미달(프로젝트 토큰 불가) · 만료된 토큰 · 다른 리포의 토큰 · 성공 | `m.newProject`·`m.settings.repository`의 GitHub 짝. 오류는 입력 아래 danger Alert(지금 연결 실패와 같은 자리) |
| 리포 목록 | 로딩 · 있음 · 많음 · 검색 0건 · 긴 하위 그룹 | `m.newProject.repo` 재사용 + GitLab 짝 |
| Repository 카드 | 연결됨 · 만료 임박(warning) · 만료/철회(Disconnected) · 조회 실패(Couldn't check — 끊김으로 접지 않는다) · 보관된 GitLab 프로젝트(쓰기 403 → 재연결 필요) · 플랜 미달 | `lib/status/canon.ts`의 `STATE` → `StatusBadge` 한 경로(POSTMORTEM 2026-10-08). 만료일은 `lib/date-format.ts`(사용자 시간대 오프셋 라벨), 남은 기간은 `lib/relative-time.ts` |
| CI 안내 | `.gitlab-ci.yml` 코드 · CI/CD 변수 `PUSH_TOKEN`(masked·protected) 등록 단계 · 셀프 호스팅이면 `api-url` 포함 | `m.settings.workflow`·`m.settings.ci`의 GitLab 짝 |
| Home·Publish | MR 열림 · MR 조회 실패 · 결과 미확인 | 기존 `prOpen`·`prCheckFailed` 상태 키의 GitLab 라벨 |

새 en 키 후보(미확정): `newProject.host.*`(선택), `newProject.gitlab.*`(연결·토큰 오류), `settings.repository.gitlab.*`, `settings.ci.gitlab.*`. 확정 시 ko·es를 같은 배치에서(`/translate` 모드 ①).

## 산출물·그릴 프레임

**프로토타입 금지 — 상태별 정적 프레임을 캔버스에 나란히** 둔다. 기본 라이트·en·1280, 번호 뒤 `-375`면 375 폭이다. 오류·로딩 같은 상태 변형은 표에 든 것만 그린다 — 나머지는 기존 상태 컴포넌트가 같은 자리에 선다.

| 번호 | 표면 | 프레임 |
|---|---|---|
| G1 | 연결 입구(갈래 A) | a A1 호스트 선택 화면 / b A2 ① 안 선택지 / c 선택 결과 375 |
| G2 | GitLab 연결(갈래 B2) | a 빈 입력 / b 검증 중 / c 권한 부족 오류 / d 플랜 미달 오류 / e 성공 → 리포 목록 |
| G3 | 리포 목록 | a GitLab 리포 여러 개 + 긴 하위 그룹 / b 같은 것 375 |
| G4 | Repository 카드 | a 연결됨(GitLab) / b 만료 임박 / c 만료·철회 / d 조회 실패 / e 375 긴 주소 |
| G5 | CI 안내 | a 설정 CI 모달 GitLab / b 온보딩 ⑤ GitLab / c 셀프 호스팅(`api-url` 포함) |
| G6 | Home 메타 · Publish 결과 | a MR 번호 두 후보(갈래 C) / b Publish 결과 MR 링크 / c 375 |
| G7 | 글리프(갈래 D) | Repository 행에서 다색/단색 두 후보 |
| G8 | `/account`(B1·사용자 수준 연결일 때만) | GitHub·GitLab 연결 항목 나란히 |
| G9 | 다크 | G2a·G4b 복제 |
| G10 | 긴 번역 | G2c·G4b의 es 문구 |

## 동작 주석

- 호스트 선택은 키보드로 고른다(RadioGroup이면 화살표). 선택 뒤 포커스는 다음 단계 첫 컨트롤.
- 연결 버튼은 렌더 중에 자동으로 튕기지 않는다 — 버튼이다(`connect-github.tsx` 머리 주석과 같은 판단).
- 비밀값 입력: 라벨·오류를 `aria-describedby`로 잇는다. 붙여 넣은 값은 저장 뒤 다시 보이지 않는다(보여 주는 형은 `push-token-panel` 하나뿐이다).
- 호스트를 글리프만으로 가르지 않는다 — 브랜드 마크는 `aria-hidden`이라 호스트 이름이 텍스트나 접근 이름에 든다.
- `/account`에 두 연결이 나란히 서면 Disconnect 접근 이름이 축을 든다(`settings.disconnectLabel` 선례, DESIGN §6.646).
- 모달 닫기·Back·실패 복귀는 기존 온보딩과 같다(단계 상태를 서버에 저장하지 않는다).

## 그리지 않는 것

- 번역 워크스페이스·Logs·Inbox 레이아웃 — 문구만 바뀐다.
- GitLab 로그인 버튼(spec §5 비목표).
- Self-Managed GitLab 주소 입력(spec §5 비목표).
- 리포 호스트 전환·미러링 UI(spec §5 비목표).
- 말모이 자체 리포 링크(공개 헤더·푸터·`/changelog`) — 바꾸지 않는다.
