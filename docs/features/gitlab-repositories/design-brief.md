신규 페이지의 첫 구현 동안만 시안이 SoT이고, dev에 들어간 뒤로는 코드 + DESIGN.md가 정본

# GitLab repositories — 디자인 브리프

## 한 줄

새 프로젝트 모달 ① 맨 위에 **GitHub / GitLab 탭**을 두고, GitLab 탭은 **개인 액세스 토큰(PAT)을 붙여 넣는** 연결 흐름으로 그린다. GitHub 탭은 지금 ① 그대로다. 두 리포 호스트가 섞인 뒤 **프로젝트 목록·프로젝트 Home·프로젝트 설정·Sources·`/account`에서 어느 플랫폼의 프로젝트인지가 어떻게 보일지**도 이 시안에서 정한다.

**시안**: [GitLab Repositories](https://claude.ai/design/p/b99d54cd-3034-44f1-8446-0a864da9d767?file=GitLab+Repositories.dc.html) (2026-10-12 수령 — 검토 전)

## 확정 기준

- **GitHub 화면은 바꾸지 않는다** — GitHub 탭 내용, GitHub App 설치·연결 흐름, GitHub 프로젝트의 기존 화면은 현행 그대로다. 이 시안은 GitLab 변형과 **두 플랫폼이 섞일 때 구분을 주는 요소**만 그린다.
- GitLab 연결은 PAT 붙여 넣기다(2026-10-12 사용자 결정 — [spec.md](spec.md) §1). OAuth 왕복·설치 승인 같은 단계는 없다.
- 편집 화면(번역 워크스페이스)은 그리지 않는다 — 편집자가 보는 차이는 리포 호스트 이름·링크·PR/MR 호칭뿐이고 문구 분기로 낸다.
- 문구는 **리포 호스트별 문장 분기**다(2026-10-12 사용자 결정). 호스트 이름을 끼워 넣지 않는다 — ko 조사가 GitHub(가·는)와 GitLab(이·은)에서 반대다.
- 셀프 호스팅 설치본도 같은 화면이다(배포 모드로 화면을 가르지 않는다).
- 최소 지원 폭 375px, 폭에 따른 기능 분기 0(DESIGN — v1.3.2 반응형).

## 놓이는 자리

정적 코드 조사값이다(2026-10-12). 기능 범위·판정은 spec·[design.md](design.md)가 든다.

| 자리 | 현재 구성 | 요청 |
|---|---|---|
| 온보딩 모달 ① | `components/onboarding/new-project.tsx`(LargeModal + WizardFooter) → `steps/repo.tsx`. 막힘 갈래는 `m.newProject.empty.*` + `EmptyState` shell(설치 전 `install` · 리포 없음 `repos` · 승인 대기 `waiting` · 재인가 `reconnect` · 상한 `limit`). 연결 뒤엔 검색 Input → 리포 목록(`IconTile` lg + 이름 `text-base` + 보조 `text-sm`, 테두리 목록) → 브랜치 Select(`w-[220px]`, 좁으면 `@max-form:flex-1`) | 맨 위에 GitHub / GitLab 탭(`components/ui/tabs.tsx`). GitHub 탭 = 현행. GitLab 탭 = 아래 상태 shell |
| GitLab 탭 상태 shell | (신규) — 기존 GitHub shell 틀을 재사용한다 | 아래 "GitLab 탭 상태" 표 |
| 프로젝트 목록 | `components/projects/project-list.tsx` 행 보조줄 — GitHub 로고 14(`GithubIcon size-3.5`) + `owner/repo` `text-xs` truncate(2026-09-25 "Vercel 목록처럼") | GitLab 행의 글리프·주소, 섞인 목록에서 플랫폼 구분 |
| 프로젝트 Home | `components/home/meta-column.tsx` 메타 — Repository 행(라벨 + 오른쪽 정렬 값, 연결 정상이면 파랑 외부 링크 · 글리프 없음 · `wrap-anywhere`) · Connection 행(`StatusBadge`) · Branch · CI(`Configured`/`Not set up`) · 최근 PR 링크(번호가 링크 이름) | 플랫폼을 어디서 말하나(Repository 행 값 앞 글리프? 새 행? 라벨 분기?), PR/MR 링크 |
| 프로젝트 설정 › Repository 카드 | `components/settings/repository-card.tsx` — `Card` 머리 아래 상태 Alert(inset) · 연결 행(`IconTile` + GitHub 글리프 + `owner/repo` `break-all` + `StatusBadge` + 보조 줄 + 우측 Reconnect/Open 버튼) · 계정 복구 줄 | GitLab 연결 행: 글리프·주소·연결자(토큰 주인)·만료일 · 만료 임박/만료/철회/스코프 부족 상태 · 우측 [Reconnect](PAT 다시 붙여 넣기) |
| 프로젝트 설정 › CI 카드 | `components/settings/ci-card.tsx` — `ListRow` 하나(제목 + 경로 `.github/workflows/malmoi-i18n.yml`) → LargeModal 안 `workflow-block.tsx`(`CodeBlock` fill + 저장 경로 안내) | GitLab이면 경로 `.gitlab-ci.yml` + masked·protected CI/CD 변수 `PUSH_TOKEN` 등록 단계 |
| Sources | `components/sources/sources-screen.tsx` 머리 — GitHub 글리프 | GitLab 글리프 |
| 온보딩 결과(⑤) | `steps/result.tsx` + `workflow-block.tsx` | CI 카드와 같은 GitLab 안내를 짝으로 |
| `/account` | `components/account/github-section.tsx` — GitHub 연결 리스트 항목 + 우측 Connect/Disconnect | GitLab 연결 항목(GitLab 사용자명·만료일·[Replace token]·[Disconnect])이 나란히 선다 |

## 플랫폼 맥락 — 이 시안이 정할 것

두 리포 호스트가 섞이면 사용자가 **"이 프로젝트가 어느 플랫폼에 붙어 있나"를 한눈에** 알아야 한다. 지금은 GitHub 하나라 GitHub 로고가 리포 줄의 장식이었는데, 섞이면 그 로고가 **정보**가 된다. 화면마다 아래를 제안해 그린다.

| 화면 | 정할 것 | 제약 |
|---|---|---|
| 프로젝트 목록 | 행 보조줄의 글리프(GitHub/GitLab)만으로 충분한가, 필터나 그룹이 필요한가 | 목록에 새 열·배지를 늘리지 않는 쪽을 먼저 본다(행 높이 불변). 글리프는 `aria-hidden`이라 접근 이름에 호스트가 들어야 한다 |
| 프로젝트 Home | Repository 행에 플랫폼을 어떻게 싣나 — 값 앞 글리프 · 라벨 분기("GitLab project") · 별도 행 중 하나 | 지금 "외부 링크에 글리프를 달지 않는다"(DESIGN §6.3) 규칙과 충돌하지 않게 — 글리프가 링크 장식이 아니라 플랫폼 표시라는 구분이 보여야 한다 |
| 프로젝트 설정 | Repository 카드 제목·연결 행·Reconnect 문구에 플랫폼이 드러나는 방식 · GitLab의 연결자(토큰 주인)·만료일 표시 | GitHub 카드는 현행. GitLab 카드만 연결자·만료일 줄이 는다 |
| Sources · Logs · Inbox | 플랫폼 표시가 필요한가(필요 없으면 "없음"으로 결정) | Logs·Inbox는 문구만 바뀐다(PR → MR) |
| 공통 | 글리프 색 — tanuki 다색(Google 4색 선례, DESIGN §6.2·§6.8 예외 등재 필요) vs 단색 `currentColor` | 다색이면 목록·Home에서 GitHub 단색 옆에 섰을 때 무게가 기우는지 본다 |

## 열린 갈래 (spec §6 — 닫히기 전엔 후보 프레임)

| 갈래 | 후보 | 그리는 법 |
|---|---|---|
| C MR 번호 | `!123`(GitLab 고유) · `#123`(지금 규칙) | Home 메타 한 프레임에 두 후보 |
| D 글리프 색 | 다색 · 단색 | 프로젝트 목록 한 프레임에 두 후보 |
| E 플랫폼 맥락 | 위 표의 화면별 제안 | 화면별 1~2안 |

## 프리미티브

`components/ui/`의 `Tabs`(TabsList·TabsTrigger·TabsContent), `LargeModal`, `WizardFooter`, `Button`, `ButtonLink`, `Input`, `Alert`, `StatusBadge`, `IconTile`, `Card`, `ListRow`, `CodeBlock`, `EmptyState`, `Skeleton`, `InlineLink`를 쓴다. 새 프리미티브를 만들지 않는다. PAT 입력은 `Input`(type password)이다 — 붙여 넣은 값은 저장 뒤 다시 보이지 않는다(보여 주는 형은 `push-token-panel` 하나뿐이다). 브랜드 글리프는 `components/signin/brand-icons.tsx` 한 곳이다. 새 색은 없다 — 상태 톤은 DESIGN §2.4의 기존 행(만료 임박은 새 **상태 행**이지 새 톤이 아니다 — warning).

## GitLab 탭 상태

기존 GitHub shell(`m.newProject.empty.*`)의 틀을 그대로 쓴다 — 제목 짧은 구 + 설명 한 문장 + 액션.

| 상태 | GitHub shell 대응 | 내용 |
|---|---|---|
| 연결 전 | `install` 자리 | 제목·설명 + **PAT 입력 필드** + [Connect] + "GitLab에서 토큰 만들기" 링크(필요 스코프 `api`·`read_repository`·`write_repository`, 역할 Maintainer 이상을 한 줄로). 셀프 호스팅·hosted 같다 |
| 검증 중 | — | [Connect] busy, 입력 잠김 |
| 검증 실패 | 연결 실패 Alert 자리(입력 아래 danger) | 무효 · 만료 · 스코프 부족(빠진 스코프 이름) · 일시 장애(다시 시도 — "무효"로 접지 않는다) |
| 연결됨 → 리포 목록 | 리포 목록 | GitHub와 같은 목록. 위에 연결 계정 한 줄(GitLab 사용자명 · 만료일 · [Replace token]) |
| 리포 없음 | `repos` | Maintainer 이상인 프로젝트가 없다 — GitLab 쪽 안내 |
| 토큰 만료·철회 | `reconnect` | 다시 붙여 넣기 |
| 상한 | `limit` | 공유(호스트 무관) |
| 리포 선택 뒤 접근 오류 | `accessError` danger Alert 자리 | 쓰기 권한 없음 · SHA-256 리포 · 보관된 프로젝트 |

GitHub의 `waiting`(조직 소유자 승인 대기)은 GitLab에 대응이 없다.

## 상태·항목·문구

문구는 기존 GitHub 키의 GitLab 짝을 **문장 통째로** 만든다(보간 금지). 아래는 항목이지 확정문이 아니다.

| 표면 | 상태/항목 | 문구 출처·요구 |
|---|---|---|
| ① 탭 | GitHub / GitLab 라벨 | 고유명사 그대로 |
| GitLab 탭 | 위 표 | `m.newProject.empty.*`·`m.newProject.repo`의 GitLab 짝 |
| 프로젝트 목록·Home·설정·Sources | 플랫폼 표시 · 연결자 · 만료일 · 상태 | `lib/status/canon.ts`의 `STATE` → `StatusBadge` 한 경로(POSTMORTEM 2026-10-08). 만료일은 `lib/date-format.ts`(사용자 시간대 오프셋 라벨), 남은 기간은 `lib/relative-time.ts` |
| Repository 카드 | 연결됨 · 만료 임박(warning) · 만료/철회(Disconnected) · 스코프 부족 · 주인의 권한 상실 · 조회 실패(Couldn't check — 끊김으로 접지 않는다) · 보관된 GitLab 프로젝트(재연결 필요) | `m.settings.repository`의 GitLab 짝 |
| CI 안내 | `.gitlab-ci.yml` 코드 · CI/CD 변수 `PUSH_TOKEN`(masked·protected) 등록 단계 · 셀프 호스팅이면 `api-url` 포함 | `m.settings.workflow`·`m.settings.ci`의 GitLab 짝 |
| Home·Publish | MR 열림 · MR 조회 실패 · 결과 미확인 | 기존 `prOpen`·`prCheckFailed` 상태 키의 GitLab 라벨 |
| `/account` | GitLab 연결 있음/없음 · 만료 임박 · [Replace token] · [Disconnect] | `m.account`의 GitHub 연결 짝 |

새 en 키 후보(미확정): `newProject.host.*`(탭), `newProject.gitlab.*`(PAT 입력·검증 사유), `settings.repository.gitlab.*`, `settings.ci.gitlab.*`, `account.gitlab.*`. 확정 시 ko·es를 같은 배치에서(`/translate` 모드 ①).

## 산출물·그릴 프레임

**프로토타입 금지 — 상태별 정적 프레임을 캔버스에 나란히** 둔다. 기본 라이트·en·1280, 번호 뒤 `-375`면 375 폭이다. 표에 든 상태만 그린다 — 나머지는 기존 상태 컴포넌트가 같은 자리에 선다. GitHub 프레임은 그리지 않는다(현행) — 탭 프레임의 GitHub 쪽만 현행 화면을 탭 아래에 그대로 둔다.

| 번호 | 표면 | 프레임 |
|---|---|---|
| G1 | ① 탭 | a GitHub 탭 선택(현행 내용 + 위 탭) / b GitLab 탭 선택 / c 375 |
| G2 | GitLab 탭 연결 | a 연결 전(PAT 입력) / b 검증 중 / c 스코프 부족 오류 / d 일시 장애 / e 연결됨 → 리포 목록(연결 계정 줄 포함) / f 토큰 만료(reconnect shell) |
| G3 | GitLab 리포 목록 | a 여러 개 + 긴 하위 그룹 / b 375 |
| G4 | 프로젝트 목록(플랫폼 맥락) | a GitHub·GitLab 섞인 목록 / b 375 / c 글리프 색 두 후보(갈래 D) |
| G5 | 프로젝트 Home(플랫폼 맥락) | a GitLab 프로젝트 메타 / b MR 번호 두 후보(갈래 C) / c 375 |
| G6 | 설정 › Repository 카드 | a 연결됨(연결자·만료일) / b 만료 임박 / c 만료·철회 / d 조회 실패 / e 375 긴 주소 |
| G7 | 설정 › CI 카드 · 온보딩 ⑤ | a 설정 CI 모달 GitLab / b 온보딩 ⑤ GitLab / c 셀프 호스팅(`api-url` 포함) |
| G8 | `/account` | GitHub·GitLab 연결 항목 나란히(GitLab 만료 임박 포함) |
| G9 | Sources 머리 | GitLab 프로젝트 |
| G10 | 다크 | G2a·G6b 복제 |
| G11 | 긴 번역 | G2c·G6b의 es 문구 |

## 동작 주석

- 탭은 키보드로 고른다(화살표). 탭을 바꿔도 각 탭의 상태(GitHub 리포 검색어·선택, GitLab 입력 값)는 모달이 닫힐 때까지 남는다.
- 기본 탭은 GitHub다. GitLab 연결만 있는 사용자도 처음엔 GitHub로 연다(기억하지 않는다 — 결정이 필요하면 시안에서 제안).
- PAT 입력: 라벨·오류를 `aria-describedby`로 잇는다. [Connect] 전엔 서버로 보내지 않는다(입력 중 검증 없음). 붙여 넣은 값은 연결 뒤 다시 보이지 않는다.
- "GitLab에서 토큰 만들기"는 새 탭으로 연다(사용자는 모달로 돌아와 붙여 넣는다).
- 호스트를 글리프만으로 가르지 않는다 — 브랜드 마크는 `aria-hidden`이라 호스트 이름이 텍스트나 접근 이름에 든다.
- `/account`에 두 연결이 나란히 서면 Disconnect 접근 이름이 축을 든다(`settings.disconnectLabel` 선례, DESIGN §6.646).
- 모달 닫기·Back·실패 복귀는 기존 온보딩과 같다(단계 상태를 서버에 저장하지 않는다).

## 그리지 않는 것

- GitHub 탭 내용과 GitHub 프로젝트의 기존 화면 — 현행 그대로다.
- 번역 워크스페이스·Logs·Inbox 레이아웃 — 문구만 바뀐다.
- GitLab 로그인 버튼 · GitLab OAuth 연결 · 프로젝트 액세스 토큰 입력(spec §5 비목표).
- Self-Managed GitLab 주소 입력(spec §5 비목표).
- 리포 호스트 전환·미러링 UI(spec §5 비목표).
- 말모이 자체 리포 링크(공개 헤더·푸터·`/changelog`) — 바꾸지 않는다.
