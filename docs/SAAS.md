# SaaS화 스펙

**PoC가 닫혔다.** MVP의 세 축(A 모듈 계약 · B 값 전달 · C 자동화)이 전부 ✅이고, 브랜치·환경 분리까지
섰다. 이 문서는 **그다음에 무엇을 만드는가**의 정본이다.

- **PoC 스펙은 [MVP.md](./MVP.md)** — 닫힌 문서다. §8.4가 이 단계를 예고하고 거기서 끝난다.
- **PoC 태스크 기록은 [TASKS.md](./TASKS.md)** — 닫힌 기록이다. §0이 여기를 가리킨다.
- **불변식·함정의 정본은 여전히 [ARCHITECTURE.md](./ARCHITECTURE.md)** 다. 이 문서가 그것을 대체하지 않는다.

> **근거 문서**: 2026-09-04에 Codex가 낸 종합 검토가 [features/saas-review.md](./features/saas-review.md)에
> 있다. 보안 모델과 운영 경계는 상당 부분 거기서 왔다. **스펙이 아니라 근거다** — 그 문서가 요구한
> 사전 단계·0단계는 작성 시점 이후에 이미 닫혔고, 그 문서가 놓친 결함 하나(`SYNC_BRANCH`)는 §8
> 0단계가 닫았다. 2단계 배포 뒤의 정적 감사는
> [features/tenant-auth/audit-2026-09-06-codex.md](./features/tenant-auth/audit-2026-09-06-codex.md)에 있다 —
> §5.3·§5.6의 세션 토큰 허용 목록·이메일 갱신·OWNER 잠금·초대 만료 소비가 거기서 왔다.

## 1. 완료 조건

제품의 단일 완료 조건은 하나다.

> **낯선 리포를 연결한 사용자가 10분 안에 로케일을 발견하고, 번역을 수정하고, 기존 리포에 결정적인
> pull request로 반영할 수 있다.**

PoC의 완료 조건이 "값이 손실 없이 도는가"였다면, 여기는 **"설명 없이 제3자가 혼자 완주하는가"** 다.
엔진을 더 넓히는 것이 아니라 **온보딩·테넌트 인가·운영 상태 표시**를 닫는 단계다.

포트폴리오 목적이므로 사용자 수나 기능 수는 성패가 아니다. 성패를 가르는 것은 둘이다.

1. 제3자가 설명 없이 첫 왕복을 완료할 수 있는가.
2. 데이터 손실·권한 누출·무의미한 PR을 **구조적으로** 막았는가.

## 2. 포지셔닝

> GitHub-native localization pipeline — 리포의 로케일 파일과 번역 DB와 재사용되는 PR 하나를
> 포맷을 가로질러 결정적으로 동기화한다.

Crowdin·Tolgee의 대체품으로 설명하면 번역 메모리·기계 번역·승인 워크플로·ICU의 **부재가 약점으로
보인다.** 반대로 아래 문제를 푸는 개발 도구로 설명하면 지금 설계가 그대로 강점이 된다.

- 기존 리포 구조를 바꾸지 않고 로케일 파일을 발견한다.
- 번역 값과 소스 키의 소유권을 분리해 **병합 로직을 제거**한다.
- 같은 DB 상태에서 같은 바이트를 만든다.
- 변경된 파일만 고정 PR 하나에 반영한다.
- JSON·YAML·TS/JS 딕셔너리의 **구조와 표현을 보존**한다.

## 3. 사용자와 역할

**역할은 둘뿐이다.** Viewer·Admin·Billing은 실제 요구가 생기기 전까지 만들지 않는다 —
MVP §7의 "세밀한 권한" 비범위가 여기서도 유지된다.

| 작업 | OWNER | EDITOR |
|---|:---:|:---:|
| 번역 조회·수정 | O | O |
| Publish (PR 생성·갱신) | O | O |
| 리포 재연결 | O | X |
| 기준 로케일·base branch **변경** | O | X | ✅ **화면이 생겼다** (2026-09-09, 6b-3 — `updateRepositorySettings`, `project:settings`). ⚠️ **두 필드가 쓰는 것의 성질이 다르다**: `baseBranch`는 `Project.baseBranch`를 즉시 쓰고, 기준 로케일은 **선언**(`Project.declaredBaseLocale`)만 써서 다음 CI push가 그것을 가져올 때 현실이 된다 (design §3.13) |
| 멤버 관리·프로젝트 삭제 | O | X |

**EDITOR에게 Publish를 허용한다.** Publish는 base branch 직접 쓰기가 아니라 **검토 가능한 PR 생성**이다.
비개발자가 Publish하고 개발자가 GitHub에서 리뷰·머지하는 경계가 병목을 줄이면서 코드 승인권은 남긴다.
"개발자만 Publish"가 필요해지면 그때 별도 permission으로 좁힌다.

**로그인 방식이 역할을 정하지 않는다.** GitHub으로 로그인한 EDITOR도, Google로 로그인한 OWNER도
성립한다. 권한은 `ProjectMember.role`만 결정한다.

번역 편집자가 **알 필요 없는 것**: `adapterName` · `pathTemplate` · `layout` · `writeStrategy` ·
`nestedByPath` · blob SHA · Git Data API · OAuth 토큰과 installation token의 차이.

## 4. 범위

### 4.1 만드는 것

- **테넌트 인증·인가** — User·Account·ProjectMember·초대, DB 세션
- **GitHub 설치 연결** — OAuth 계정 ↔ installation ↔ repository 3중 검증
- **탐지 기반 프로젝트 생성** — 후보를 보여주고 사용자가 확정
- **프로젝트 단위 번역 UI** — 동결을 풀고 인가 경계 위에서 다시 만든다
- **Publish 경험** — 미배포 수, PR 상태, 버린 값 보고
- **SyncRun** — 실행 이력·idempotency·동시 실행 차단

### 4.2 만들지 않는 것

MVP §7을 그대로 잇고, SaaS 문맥에서 새로 거절하는 것을 더한다.

**MVP §7에서 이어지는 것**: ICU 복수형, 동시 편집, 세밀한 RBAC, in-context 편집, 스크린샷 첨부,
번역자 노트, 승인 워크플로(draft→reviewed).

**SaaS에서 새로 거절하는 것**:

- **과금·플랜** — 포트폴리오다.
- **조직 계층** — account 개념을 두더라도 개인/조직 구분까지다. 팀·하위 그룹은 없다.
- **번역 메모리·기계 번역·AI 번역** — 이 도구의 축이 아니다.
- **실시간 공동 편집** — MVP §7 "동시 편집"의 연장.
- **범용 알림 시스템** — 이메일 발송 자체를 1차에서 뺀다(§5.1).
- **포맷별 무제한 설정 UI** — 어댑터 내부는 사용자에게 노출하지 않는다(§3).

### 4.3 1차에서 빼되 2차에 열어두는 것 — 판정 넷

**넷 다 "필요 없다"가 아니라 "지금 넣으면 면적 대비 얻는 게 작다"는 판정이다.** ③④는 2026-09-09
IA 확정(§7.7)이 더했다.

#### ① 이메일 매직링크 로그인 → 뺀다

**1차 로그인은 GitHub OAuth + Google OAuth 둘뿐이다.**

근거: 이메일 로그인은 코드가 아니라 **메일 인프라 운영**을 끌고 온다 — SPF·DKIM·DMARC, 반송 처리,
스팸 분류 모니터링, 발송 rate limit, 보안 스캐너가 링크를 먼저 열어 토큰을 소비하는 문제. 포트폴리오
목적에 비해 면적이 너무 넓고, 이 중 어느 하나가 깨져도 **"로그인이 안 된다"는 형태로만 드러나** 진단이
길다.

**초대는 이메일 없이 성립한다**: OWNER가 초대 링크를 만들어 **직접 전달**하고(슬랙·메신저), 받은
사람이 GitHub이나 Google로 로그인하면 **그 provider가 검증한 이메일**로 초대 대상과 대조한다. 이메일
소유권 증명이라는 요구는 그대로 지켜지고, 발송만 우리 책임에서 빠진다.

2차에 열 조건: 사내 비개발자가 GitHub·Google 계정을 못 쓰는 상황이 실제로 나올 때.

#### ② GitHub push webhook → 뺀다

**1차는 지금의 Actions 경로를 유지한다** (`.github/actions/l10n-push` → `/api/push`).

근거: MVP §7의 "push 웹훅"이 명시적 비범위이고, Actions 경로는 **실물로 검증돼 있다**(TASKS §7 —
`[skip-l10n]` 스킵, 열린 PR 경고, 적재 실패만 red). 웹훅으로 얻는 것은 "워크플로 파일 없이 연결"
하나인데, 서명 검증·delivery 중복 방지·이벤트 allowlist·재시도 원자성이 통째로 딸려온다.

✅ **대신 `/api/push`의 인증을 프로젝트별로 바꿨다** (2026-09-07). 전에는 서버 env 하나가 대상
프로젝트를 정해 두 리포의 CI를 동시에 받을 수 없었다. 설계는 1단계에서 §7.8로 닫히고 구현은 §8
5단계가 받았다 — `Project.pushTokenHash`와 `/api/pull`의 전 프로젝트 순회가 같은 항목이고, 프로젝트
생성 경로가 선 뒤라야 발급할 자리가 생겼다. **대상 리포의 Actions secret을 교체했다** (2026-09-07, T8 —
`order-check` 하나다: l10n 워크플로가 붙은 리포가 그것뿐이었다).

2차에 열 조건: 워크플로 파일을 못 넣는 리포가 실제 도입 대상이 될 때.

#### ③ 로그인 provider를 GitHub App으로 교체 → 뺀다 (2026-09-06 판정, 4단계)

**1차는 로그인 OAuth App과 연결 GitHub App을 따로 둔다** — 같은 사람이 GitHub 왕복을 두 번 한다
(로그인 한 번, 연결 한 번). 합치면 OAuth App 셋(프로덕션·preview·로컬)과 그 secret이 사라지고
왕복도 한 번이 된다.

근거는 **가용성이다**(`features/github-connect/design.md` §2.2). 프로덕션 GitHub 로그인이 실물로 처음
성공한 것이 2026-09-06이고(그전엔 `AUTH_GITHUB_ID`에 레코드 번호가 들어가 있었다 — §8 2단계), 로그인을
연결과 같은 App에 묶으면 **연결 기능의 실패가 로그인 실패가 된다.** 이 기능이 깨져도 로그인은 살아
있어야 한다.

2차에 열 조건: **연결 화면의 두 번째 인가 클릭이 실제로 이탈을 만들 때.** 그때는 왕복 하나를 줄이는
값이 가용성 리스크를 넘는다.

#### ③ OAuth 계정 병합 → 뺀다

**같은 사람의 GitHub 계정과 Google 계정을 한 `User`로 합치는 기능을 1차에서 만들지 않는다.**
로그인 Account의 추가 연결은 `safePrismaAdapter`가 거부한다. `planAccountLink`의
`taken-by-other`는 별개인 GitHub App 연결의 소유권을 지킨다(§5.5).

근거: 병합은 UI가 아니라 **데이터 이관과 인증 경계**다 — 두 `Account` 행을 한 `User`로 옮기고
`ProjectMember`·`Translation.updatedBy`·`ProjectInvitation.invitedBy`의 참조를 함께 옮겨야 하고,
"어느 이메일이 정본인가"(§5.5의 `planEmailRefresh`)를 다시 정해야 한다. 되돌릴 수 없는 쓰기이고
중간 실패가 **한 사람을 두 계정으로 쪼갠 상태**를 남긴다.

⚠️ **증상은 이미 관측됐다** — GitHub으로 가입한 계정에 Google로 들어가려 하면 `OAuthAccountNotLinked`로
거부된다(2026-09-09 실측). 그 거부는 **의도된 것이고 문구도 정확하다**("that email is already
registered with a different sign-in method") — 막힌 것이 아니라 원래 방식으로 들어가면 된다.

2차에 열 조건: 한 사람이 **provider를 바꿔야 하는** 상황이 실제로 나올 때(회사 계정 폐쇄 등).
그때도 자동 병합이 아니라 **`/account`에서 명시적으로 요청하고 두 쪽 소유를 각각 증명하는** 흐름이다.

#### ④ MCP 토큰 — 전용 라우트를 만들지 않는다

**AI에게 로케일 관리를 시키는 MCP 서버 자체는 §4.2 비범위가 아니다** — 이 도구의 축(코드↔DB
왕복)의 자연스러운 확장이다. 뺀 것은 **화면**이다: 토큰 발급·폐기는 `settings`의 섹션이면 충분하고
(push 토큰이 이미 그 형태다), 전용 라우트는 "MCP로 무엇을 시킬 수 있나"를 설명할 **지면**이
필요해질 때 만든다.

⚠️ **토큰이 늘면 인증 표면이 는다** — push 토큰은 `Project.pushTokenHash` 하나로 프로젝트를 정하고
(§7.8) 쓰기 범위가 `/api/push` 한 곳이다. MCP 토큰은 **읽기와 쓰기를 둘 다** 열게 되므로 범위·폐기·
감사 판정이 push 토큰의 재사용으로 끝나지 않는다. 그 판정을 화면보다 먼저 한다.

2차에 열 조건: MCP 서버의 도구 목록과 각 도구의 쓰기 범위가 정해질 때.

## 5. 보안 모델

### 5.1 가장 중요한 규칙

> **모든 서버 요청에서 사용자·프로젝트·GitHub 설치의 관계를 다시 확인하고, 일치하지 않으면 거부한다.**

`middleware.ts`는 **로그인하지 않은 사용자의 페이지 렌더(GET·HEAD)를 막는 1차 방어**이고, 프로젝트 인가를
대신하지 않는다. Server Action POST는 통과시킨다 — Action이 스스로 인증한다(307이면 클라이언트가 페이지
오류를 낸다). Page·Server Action·Route Handler가 **각각 자기 경계에서** 확인한다.

⚠️ **장애는 거부가 아니다** (POSTMORTEM 2026-09-06). `auth()`는 DB 예외를 삼키고 `null`을 돌려주므로 모든
진입점은 `readSession`을 쓴다 — `unavailable`이면 "일시적인 오류"를 보이고 **로그인을 시키지 않는다**.
DB 장애를 비로그인과 같은 화면으로 보내면 전면 장애가 "정상"으로 관측된다 (ARCHITECTURE §6.1.2).

⚠️ **장애 표시가 어디서 오는지가 이 설계의 약한 고리다.** 반환값으로는 원리적으로 구별할 수 없으므로
남은 통로가 로거뿐이다 — `auth.ts`의 `logger.error`가 `noteAuthError`를 부르고 호출부가
`withOutageFlag(() => auth())`로 감싼다(`lib/auth/outage.ts`). **`auth.ts`의 logger 설정을 지우면
`readSession`은 그대로 컴파일되면서 장애를 조용히 비로그인으로 보고한다** — 타입이 못 잡는 원격
결합이다. `AsyncLocalStorage`를 쓴 이유는 모듈 변수 하나면 **다른 요청의 장애가 이 요청의 거부로
둔갑**하기 때문이다.

**같은 축이 4단계에도 있다** — 연결 경로는 `probe error → unknown`(≠`app-uninstalled`), 토큰 429 →
`unavailable`, DB 장애 → `unavailable`이고, **`unavailable`만 재시도를 권한다.** "모르는 것을 거부로
말하지 않는다"가 두 층에서 같은 규칙이다.

이건 새 규칙이 아니라 이미 밟은 지뢰의 확장이다 — MVP에서 "레이아웃 조건부 렌더는 차단이 아니다"를
1.3MB RSC 페이로드 노출로 배웠다(POSTMORTEM 2026-08-31). SaaS에서 같은 실수의 형태는
**"middleware가 로그인을 확인했으니 프로젝트 접근도 됐겠지"** 다.

### 5.2 인가 판정의 주인은 하나다

```ts
requireProjectAccess({ slug, permission: "translation:write" })   // 페이지 — 실패하면 redirect
getProjectAccess(prisma, { userId, slug, permission })            // Server Action — union 반환
```

⚠️ **인자가 `projectId`가 아니라 `slug`다** (2026-09-05 구현에서 확정). 프로젝트를 정하는 것이 URL이므로
호출부가 아는 것은 slug뿐이고, `projectId`는 **판정이 돌려주는 값**이다 — 그 뒤의 모든 쿼리가 그
`projectId`로 좁혀지고, 클라이언트가 보낸 id는 어디에서도 신뢰 경로에 들어가지 않는다.

모든 서버 진입점이 이것을 지난다. **클라이언트가 보낸 role·owner 여부·projectId의 정당성을 믿지
않는다.** ID 기반 mutation도 반드시 프로젝트를 조건에 함께 넣는다 — 이건 이미 코드 컨벤션이다
("모든 DB 쿼리는 `projectId`로 좁힌다", CLAUDE.md).

### 5.3 세션 — JWT에서 DB 세션으로

**MVP의 JWT 세션 결정이 여기서 뒤집힌다.** 근거는 그때 명시해둔 그대로다: JWT는 권한 회수가 최대
24시간 지연되는데(MVP §5), SaaS에서는 **멤버 제거와 역할 변경이 즉시 반영돼야 한다.**

- 세션에는 **안정적인 `userId`만** 담는다.
- 프로젝트 목록과 role은 **매 요청 DB에서 조회**한다.
- 토큰에 `projectIds`나 role 전체를 넣지 않는다 — 넣는 순간 JWT의 지연 문제가 그대로 돌아온다.
- `@auth/prisma-adapter`로 전환했다 (2026-09-05).
- **`maxAge` 24h는 "마지막 활동 뒤 24h"다** — `updateAge` 1h (2026-09-06). 명시하지 않으면 기본값이
  `maxAge`와 같아 세션이 한 번도 연장되지 않고 로그인 정각 24h 뒤 편집 중 끊긴다.
- **`session` 콜백은 입력을 돌려주지 않는다** — DB 세션에서 그 입력은 `sessionToken`을 든 **행**이고
  반환값이 `/api/auth/session` 본문이다. `publicSession`이 허용 목록으로 새 객체를 만든다 (2026-09-06까지
  토큰이 JSON에 실려 있었다 — Codex 감사 #1).

대가는 요청마다의 DB 왕복이고, 그것이 MVP에서 JWT를 고른 이유였다. **그 대가를 지금 지불한다.**

### 5.4 세 GitHub 자격증명 — 경계는 그대로다

MVP에서 세운 경계가 SaaS에서 더 중요해진다. **2026-09-06에 둘에서 셋이 됐다** — 4단계가 "이 사람이
어느 설치를 볼 수 있는가"를 묻기 시작하면서 그 질문 전용 토큰이 생겼다.

| 자격증명 | 발급자 | 용도 |
|---|---|---|
| **OAuth App 토큰** | Auth.js provider (`AUTH_GITHUB_*`) | **로그인** — 이 사람이 누구인가 |
| GitHub App **user-to-server 토큰** | **같은 GitHub App**이 발급한다 (`GITHUB_APP_CLIENT_*`) | **연결** — 이 사람이 어느 설치·리포를 볼 수 있는가. **GET만** 부른다 (상시 검사가 **자격증명 분리와 쓰기 메서드 둘 다** 센다 — 후자는 octokit의 네 입구를 본다: `request`·`paginate`의 문자열 route·`rest.*`의 이름 붙은 쓰기·`graphql` mutation. ⚠️ 2026-09-07까지는 첫째만 봤고, **실제 코드가 쓰는 형태는 둘째다** — 가장 그럴듯한 회귀 경로가 정확히 사각이었다) |
| GitHub App **installation token** | GitHub App 개인키 (`GITHUB_APP_ID`·`GITHUB_APP_PRIVATE_KEY`) | **쓰기** — 트리 조회 · 브랜치 갱신 · PR 생성 |

⚠️ **가운데 것이 "OAuth"라는 이름을 공유하지만 로그인 토큰이 아니다.** 로그인은 별도 OAuth App이고,
연결은 App의 user-to-server 흐름이다 — client id가 서로 다르고, 섞으면 로그인은 되는데 설치 목록이
비어 보인다. `lib/github-connect/`가 개인키를 모르고 `lib/github.ts`가 그 디렉터리를 import하지 않는
것을 `credential-separation.test.ts`가 소스에서 상시로 센다.

**OAuth 토큰이 커밋 경로에 들어가면 안 된다** — 커밋이 개인 명의가 되고 그 사람이 떠나면 파이프라인이
깨진다. 이건 MVP부터의 규칙이다.

**가운데 토큰은 수명이 짧고 회전한다** (`lib/github-connect/token.ts`·`token-store.ts`). 8시간 만료 +
refresh **1회용**이고, 원문이 `Account` 행에 눕는다. `planTokenUse`가 `use | refresh | reauthorize`를
가르되 만료 판정에 **60초 여유**를 둔다(경계에서 발급받아 곧바로 죽는 토큰을 쓰지 않으려고). 회전 결과는
**읽었던 `refresh_token`을 `where`에 넣은 조건부 `updateMany`**로 즉시 쓰고, count 0이면 다른 요청이
먼저 돌린 것이므로 재조회한다 — 초대 토큰의 단일 사용(§5.6)과 같은 형태다.

⚠️ **`Account`에 `refresh_token_expires_in` 컬럼이 없어 refresh 만료·인가 철회를 미리 볼 수 없다** —
갱신 호출의 실패가 유일한 신호다. 그래서 `refreshFailure`가 거부(`reauthorize`)와 장애(`unavailable`)를
가르고, **429는 4xx인데 `unavailable`이다**(재시도하면 풀린다).

⚠️ **`Account` 테이블은 소유자가 둘이다.** 로그인(`provider:"github"`)과 연결(`provider:"github-app"`)
행이 같은 테이블을 쓰고, GitHub으로 로그인한 사람은 행을 둘 갖는다. 4단계는 **마이그레이션을 하나도
추가하지 않았다** — 사용자 토큰을 기존 `access_token`·`refresh_token`·`expires_at`(초 단위 epoch)에
얹었다. unique가 `[provider, providerAccountId]`뿐이라 `userId`로는 `findUnique`가 성립하지 않고
`findFirst`를 쓴다 — **"User당 App 연결 하나"는 우리 정책이지 DB 제약이 아니다.** `Account`→`User`가
Cascade라 **User 삭제가 연결 토큰까지 지운다**(§6이 어댑터 이유로 정당화한 Cascade에 이제 다른 데이터가
딸려 간다).

### 5.4.1 연결 왕복의 state — CSRF와 착지 지점

연결은 브라우저가 GitHub을 다녀오는 왕복이라 **초대 토큰(§5.6)과 같은 급의 서명 축**이 필요하다
(`lib/github-connect/state.ts`).

- **HMAC-SHA256 over `AUTH_SECRET`** + 용도 라벨(`"malmoi-github-state"`). ⚠️ 세션 서명과 **키를
  공유**하므로 회전하면 진행 중인 연결이 전부 죽는다.
- **10분 만료 · 서명은 `timingSafeEqual`**(길이 선검사) **· nonce는 단순 대조**(서명이 이미 검증됐다). 판정 순서는 서명 → nonce → 만료 →
  사용자로, **만료를 사용자보다 앞에 둬** 만료된 state가 누구 것이었는지 말하지 않는다.
- **목적지를 서명 payload에 싣는다** — 그래서 `safeNext` 같은 open redirect 판정이 아예 없다.
  ⚠️ **2026-09-07에 slug 하나에서 `StateDest` 갈래 둘로 넓어졌다**: `{kind:"settings", slug}`와
  `{kind:"new"}`. 생성 경로에는 프로젝트가 없어 slug가 착지를 겸할 수 없고, 갈래를 쿼리로 빼면
  공격자가 착지를 정한다. 옛 `{slug}` payload는 `state-mismatch`로 거부된다(10분 만료라 배포 직후
  창이고, 그 창의 사용자는 버튼을 다시 누르면 된다).
- **빈 `AUTH_SECRET`은 `state-mismatch`로 접지 않고 던진다.** 설정 오류를 "다시 눌러 주세요"로 위장하면
  누구나 재현 가능한 서명이 통과한다.
- **쿠키 이름을 읽는 쪽이 두 개 다 본다**(`stateCookieNames()`). 쓰는 쪽은 `x-forwarded-proto`, 읽는
  쪽은 요청 URL로 프로토콜을 판정해 갈릴 수 있고, 갈리면 연결이 100% `state-mismatch`가 된다.
  `__Host-` 접두를 https에서만 붙이는 이유는 **Safari가 `http://localhost`에서 Secure 쿠키를 버리기**
  때문이다 — `lib/auth/cookie.ts`의 `__Secure-` 이중 검사와 같은 계열이다.
- ⚠️ **`redirect_uri`를 반드시 싣는다** (`lib/github-connect/origin.ts`, malmoi#7). 생략하면 GitHub이
  App에 등록된 **첫** callback으로 보내 로컬에서 시작한 연결이 프로덕션에 착지하고, state 쿠키는
  시작한 origin에 있으니 그 왕복은 **영원히** `state-mismatch`다. origin과 쿠키 `secure`가 **한
  판정에서** 나오는 것이 그 파일의 요지다.

**프로젝트 생성 조건 — 셋 다 서버가 확인한다**:

```
User에 GitHub Account가 연결됨
  AND 로그인 사용자가 그 installation에 접근 가능
  AND installation이 선택한 repository에 접근 가능
```

⚠️ **브라우저가 보낸 `installationId`·`owner`·`repo`를 그대로 저장하지 않는다.** 그러면 접근 권한이
없는 설치를 자기 프로젝트로 등록할 수 있다.

✅ **4단계는 그 위험을 더 좁게 닫았다 — `installationId`가 아예 클라이언트에서 오지 않는다.** 리포는
`Project`에 고정이고(연결 화면에 셀렉트가 없다), 서버가 `GET /repos/{owner}/{repo}/installation`으로
설치 id를 **직접 얻는다**(`probeRepo`). **4단계 연결 화면에서는** 그래서 사용자 입력이 slug 하나였다 — ⚠️ **5단계 생성 경로는 `{ owner, repo, adapter, pathTemplate, baseLocale, slug, name }`을 받는다.** 살아남은 불변식은 좁다: `installationId`는 여전히 서버가 `probeRepo`로 얻고, `adapter`·`pathTemplate`은 **파일을 다시 읽어** `planConfirmedFormat`의 반환값을 저장한다(클라이언트가 보낸 값을 그대로 믿지 않는다 — pull이 임의 경로를 겨누는 것을 막는 보안 통제다). 3중 검증은 "보낸 값이
맞는가"가 아니라 "서버가 얻은 값을 이 사람이 볼 수 있는가"를 묻는다. 판정 자리는 `planRepoConnect`다.

**GitHub App 권한은 최소로**: Metadata read · Contents read/write · Pull requests read/write.
Workflows 권한은 **연동 PR이 워크플로 파일을 쓸 때만** 필요하고, §8 5단계에서 판정한다.

### 5.5 계정 병합 — 자동으로 하지 않는다

Google과 GitHub가 **같은 이메일을 반환해도 자동으로 계정을 병합하지 않는다.** 기존 로그인 세션에서
사용자가 명시적으로 "GitHub 연결"을 실행한 경우에만 같은 User에 `github-app` Account를 추가한다.
로그인용 github/google Account의 추가 연결은 허용하지 않는다. `safePrismaAdapter`가 User 행을
잠근 뒤 검사하고, OAuth callback이 쓰는 세션 조회부터 만료를 검사한다. 신규 로그인 Account에는
식별자 네 필드만 저장한다. 기존 토큰 정리와 암호화는 credential-storage 후속 전환이다.

잘못된 자동 병합은 불편이 아니라 **계정 탈취**다 — provider가 반환하는 이메일이 검증됐다는 보장이
provider마다 다르다.

**이메일 기반 자동 병합은 `allowDangerousEmailAccountLinking`을 켜지 않아 거부하며, 실물에서 확인했다**
(2026-09-05, preview): GitHub으로 OWNER가 된 계정과 **같은 주소**의 Google로 로그인하면
`?error=OAuthAccountNotLinked`로 거부되고 `User`·`Account`에 고아 행이 남지 않는다.

⚠️ **그 옵션은 연결 경로를 지키지 않는다** (4단계, 2026-09-06). `provider:"github-app"` 행은 Auth.js를
지나지 않으므로 어댑터 설정이 **아무 역할을 하지 않는다.** 연결 경로의 방어선은 따로 둘이다:
`planAccountLink`의 **`taken-by-other`가 `replace`보다 앞이고**(뒤였으면 옛 행을 지운 다음 거부해
"실패했는데 연결까지 풀렸다"가 된다), Account 쓰기가 `upsert`가 아니라 **`create` + P2002 재조회**다
(동시 요청이 `userId`를 덮으면 소유권이 이동한다). 동일 사용자의 연결 변경은 User 행 잠금으로
직렬화하며 기존 행 갱신·삭제에도 `userId` 조건을 건다. P2002 재조회는 롤백 뒤 수행한다.

### 5.6 초대 — 토큰은 해시만 저장한다

- 초대 토큰 **원문을 DB에 저장하지 않는다**(해시만). 안전한 난수 · 단일 사용 · 만료형.
- 수락 성공과 동시에 무효화한다.
- 초대 대상 이메일과 **provider가 검증한 이메일이 일치**해야 수락된다. 대조 기준인 `User.email`은
  **재로그인마다 provider의 현재 검증 주소로 갱신한다** (2026-09-06) — OAuth 재로그인은 Auth.js가
  `updateUser`를 부르지 않아 첫 로그인 값으로 굳고, primary를 바꾼 사람이 새 주소로 온 초대를 영영 못
  받았다. 새 주소를 **다른 User가 쓰면 갱신도 병합도 하지 않고 로그인은 허용한다**(§5.5 우회 금지).
- 단일 사용은 `updateMany`의 `acceptedAt: null`·조회한 `expiresAt` 동등 조건·소비 직전 미만료 조건의 count로 강제한다 — 만료가 소비
  조건에 들어 있어 판정~소비 사이에 재초대로 회전된 옛 행이 옛 role로 멤버를 만들지 않는다.
- Project에는 **항상 OWNER가 한 명 이상** 있어야 한다 — 마지막 OWNER는 탈퇴·자기 제거 불가.
  **강제 수단은 `changeMember`의 대화형 트랜잭션이다**: `Project` 행 `FOR UPDATE` 잠금 → 판정 → 쓰기 →
  OWNER 재집계 → 0이면 롤백. FK Restrict는 멤버 행 **변경**을 막지 않는다 — OWNER 둘이 동시에 각자를
  강등하면 count 검사만으로는 0명이 된다 (Codex 감사 #2).
- membership은 이메일이 아니라 **`User.id`를 참조**한다 (이메일 주소는 재할당될 수 있다).
  같은 이유로 `Translation.updatedBy`도 2026-09-05부터 **`User.id`**다 (전에는 GitHub 핸들이었다).

⚠️ **`(projectId, email)`은 unique가 아니라 index다.** unique로 걸면 수락·만료된 행이 이메일을
점유해 **재초대가 막힌다.** 대신 `createInvitation`이 미수락 행을 먼저 만료시켜 **토큰을 회전**시킨다 — 회전과 생성은 `Project` 행을 잠근 한 트랜잭션이다(2026-09-06). 갈라 두면 동시 발급이 유효 링크를 둘 남긴다.

⚠️ **토큰이 URL 경로에 실린다** — 브라우저 히스토리·리퍼러·전달된 링크에 남는다. **단일 사용과 7일
만료로 수용한 위험**이고, 없애려면 수락 폼에 토큰을 POST해야 하는데 그러면 비로그인 열람 화면이
성립하지 않는다 (`features/tenant-auth/design.md` §4.1).

### 5.7 보안 테스트 완료 조건

아래가 **전부 거부**돼야 §8 2단계가 닫힌다. ✅ **2026-09-05에 닫혔다** — 항목별 근거(테스트 이름과
preview 실측)는 `features/tenant-auth/tasks.md` §6 대조표에 있다. 두 항목만 뒤로 넘겼고, 그건
프로젝트 생성 경로가 아직 없어 **공격 표면 자체가 존재하지 않기** 때문이다.

⚠️ **그 둘은 판정과 종결이 갈린다** (2026-09-06). 판정 함수(`planRepoConnect`)는 **4단계**가 만들어
단위 테스트로 덮었고(`installation-forbidden`·`repo-forbidden`·`repo-not-installed`), 시나리오가
**닫힌 것은 생성 표면이 생긴 5단계**다 (2026-09-07). 4단계 연결 화면에서는 리포가 `Project`에 고정이라
"설치되지 않은 리포를 Project로 등록"할 입력 자체가 없었고, **5단계가 그 입력을 만들었다** —
`createProject`가 `{ owner, repo, … }`를 받으므로 방어선이 `checkRepoAccess`→`planRepoConnect`의 3중
검증으로 옮겨졌다. 판정층을 먼저 세운 것은 5단계가 그것을 재사용하기 때문이고, 상시 방어선은
`app/(edit)/__tests__/onboarding.test.ts`의 "3중 검증 거부 셋"과 `lib/onboarding/__tests__/create-plan.test.ts`다.

- 비로그인 사용자의 프로젝트 조회·수정·Publish
- 프로젝트 A 멤버가 프로젝트 B의 URL·ID를 직접 전송
- 다른 프로젝트의 `keyId`·`localeCode`·`translationId` 조합
- EDITOR의 멤버·리포 설정 변경 — 멤버는 2단계, **리포 설정 절반은 4단계**가 닫았다(`app/(edit)/__tests__/github-connect.test.ts`, permission은 `project:settings`)
- 설치되지 않은 리포를 Project로 등록 — 판정 4단계 / **종결 5단계** ✅ (2026-09-07). `createProject`가
  `planRepoConnect`의 3중 검증을 지나고, `probeRepo`가 `not-installed`를 주면 행을 만들지 않는다
  (`app/(edit)/__tests__/onboarding.test.ts`의 "3중 검증 거부 셋" · `lib/onboarding/__tests__/create-plan.test.ts`)
- 설치에 접근할 수 없는 사용자의 프로젝트 생성 — 판정 4단계 / **종결 5단계** ✅ (같은 함수, 같은 커밋).
  사용자 쪽 목록 둘을 **제출 시점에 다시 부른다** — 렌더 때 본 것을 인가 근거로 쓰지 않는다 (같은 테스트)
- **제거된 멤버가 기존 세션으로 재접근**
- 같은 이메일이라는 이유만의 provider 계정 자동 병합
- 초대받은 이메일과 다른 계정으로 초대 수락
- 초대 토큰 재사용·만료 후 사용
- **state 없이·위조한 state로 연결 callback 도착** (§5.4.1) — code 교환과 `Account` 쓰기가 **0회**여야 한다
- 로그·클라이언트 응답에 토큰·PEM·DB URL 노출 (`lib/failure.ts` + **Server Action 경로의 회귀 테스트 `app/(edit)/__tests__/publish-failure.test.ts`** — 같은 `triggerPull`을 부르면서 `error.message`를 직렬화해 Prisma 접속 오류가 pooler 호스트·DB 유저를 담은 적이 있다)

## 6. 스키마 변화 — 5테이블에서 11테이블로

**MVP가 5테이블을 지킨 것은 절제였다.** JWT 세션을 고른 이유가 정확히 "사용자 테이블 4개가 사라진다"
였다(MVP §5). SaaS는 그 절제를 되돌린다 — 정당한 대가이지만, **한 번에 하지 않는다**(§8이 단계로 쪼갠 이유).

| 테이블 | 언제 | 왜 |
|---|---|---|
| `User` · `Account` · `Session` · `VerificationToken` | 2단계 ✅ | Auth.js DB 어댑터(`@auth/prisma-adapter` 2.11.3). `VerificationToken`은 이메일 provider를 안 쓰므로 **항상 비어 있다** — 어댑터가 그 델리게이트를 부르므로 테이블은 있어야 한다. ⚠️ **`Account`는 4단계부터 소유자가 둘이다** — 로그인(`provider:"github"`)과 연결(`provider:"github-app"`)이 provider 값으로 갈린 같은 테이블이고, **4단계의 스키마 변화는 0이다**(§5.4) |
| `ProjectMember` | 2단계 ✅ | 권한의 유일한 정본 |
| `ProjectInvitation` | 2단계 ✅ | 수락 전 상태. `tokenHash` unique |
| `SyncRun` | 7단계 | 실행 이력·idempotency·동시 실행 차단 |

**✅ 여섯 테이블이 dev·prod에 섰다** (dev 2026-09-05 `db:migrate`, prod 2026-09-06 `db:deploy` —
`20260904182548_add_tenant_auth_tables`). `Authenticator`(WebAuthn)는 만들지 않는다 — 그 provider를
쓰지 않으므로 어댑터의 네 메서드가 호출될 경로가 없고, 위 11테이블 셈도 그것을 빼고 있다.

⚠️ **`onDelete`가 둘로 갈렸다.** `Account`·`Session` → `User`는 **Cascade**여야 한다 — 어댑터의
`deleteUser`가 `p.user.delete` 하나만 부르므로 `Restrict`면 그 메서드가 항상 실패한다. `ProjectMember`·
`ProjectInvitation`은 **Restrict**다: User 삭제가 멤버 행을 딸려 지우면 마지막 OWNER가 조용히 사라진
프로젝트가 된다. (멤버 행의 제거·강등 자체는 FK가 막지 않는다 — §5.6의 트랜잭션이 막는다.)

⚠️ **타입 검사가 어댑터 계약을 검증하지 못한다** (2026-09-05 실측). 어댑터가 인자를 `@prisma/client`의
`PrismaClient`로 받는데 그 패키지는 `.prisma/client/default`를 re-export하고, Prisma 7의 `prisma-client`
생성기는 그 경로를 만들지 않는다(우리 산출물은 `generated/prisma`다). `skipLibCheck`가 해결 실패를
삼켜 파라미터가 사실상 `any`가 된다 — `PrismaAdapter({ nope: true })`도 컴파일된다.
**`prisma/__tests__/schema-contract.test.ts`가 유일한 자동 방어선이고**, 어댑터 소스의 `where` 키와
델리게이트 목록을 스키마와 직접 대조한다. 어댑터 버전을 올리면 그 테스트가 먼저 답한다.

**`AuditEvent`는 1차에서 만들지 않는다.** 근거: 멤버 변경·리포 재연결·Publish 결과는 `SyncRun`과
`ProjectMember.updatedAt`으로 대부분 추적되고, 감사 로그를 제대로 하려면 보존 기간·개인정보 마스킹
정책이 따라온다. 실제로 "누가 언제 뭘 했는지"를 못 찾는 상황이 생기면 그때 만든다.

⚠️ **그 문장의 `SyncRun`은 아직 없다 — 7단계가 만든다** (2026-09-09에 시제를 고쳤다. `SyncRun`이
실재하는 것처럼 읽혀서 `logs` 화면을 설계할 때 "데이터는 이미 있다"로 오독됐다). 지금 이력의 재료는
셋뿐이다: `Translation.updatedAt`+`updatedBy`(누가 무슨 값을 고쳤나) · `Project.lastCommitSha`+
`lastCommitAt`(CI push) · `lastPublishedAt`+`lastPrUrl`(**마지막 Publish 1건**). 그래서 IA의
`logs` 화면(§7.7)은 **7단계 `SyncRun`의 소비자**이고, 그 전에 만들면 "최근 편집 목록"까지다.

**마이그레이션은 additive-first**로 배포한다 — nullable 관계와 새 테이블을 먼저 넣고, 기존 `Project`에
소유자를 backfill한 뒤, 애플리케이션을 새 인가 경로로 전환하고, 필요하면 그다음에 NOT NULL을 건다.
⚠️ 브랜치가 갈린 뒤로 이건 **두 단계**다: `pnpm db:migrate`(dev) → `pnpm db:deploy`(prod, `/merge` 직전).

⚠️ **6단계가 컬럼 둘을 더했다** (2026-09-08, additive — 마이그레이션 `_add_project_last_published`가 12번째다):
`Project.lastPublishedAt`·`lastPrUrl`. **`lastPulledAt`과 뜻이 다르다** — 그쪽은 벽시계가 아니라 캡처된
`max(updatedAt)`이고 변경 없는 스킵에도 전진하는 **진행 판정**이라 미배포 집계의 기준이고, 이 둘은
"마지막으로 **보낸**" **사건 기록**이라 툴바의 "Last sent"가 읽는다. `saveLastPulledAt`이 `committed`일 때만
같은 `update`에 함께 싣는다.

## 7. 설계 결정

### 7.1 1 Project = 1 repository + 1 translation surface

한 리포에 번역 표면이 둘이면 **Project를 둘로** 만든다. 하나의 Project가 여러 어댑터·여러 브랜치를
관리하면 단일 소유자·결정성·고정 PR 모델이 빠르게 무너진다.

⚠️ **그래서 sync 브랜치가 프로젝트별이다** — `syncBranchFor(slug)` → `l10n/sync-<slug>` (§8 0단계,
2026-09-05). 그 전엔 `lib/pull/trigger.ts`의 상수 `"l10n/sync"` 하나라 같은 리포를 가리키는 두 Project가
**force update로 서로를 덮었다.** TASKS §7에 실측 기록이 있다(순차로 돌려 피했다). bugshot-2가 정확히 그
모양이다(`_locales` 4키 + `ts-dict` 903키). 소비자(composite action·스모크·ACTIONS.md)는 2026-09-06에
따라왔다 — 하루 동안 action의 PR 경고가 옛 이름을 조회해 항상 "없음"이었다.

### 7.2 로케일 소유권 — 리포가 정본이다

SaaS UI에서 로케일을 **추가·삭제하지 않는다.** 별도 화면이 필요하면 편집 기능이 아니라 **발견 결과와
활성 상태를 보여주는 진단 화면**이어야 한다. 리포에서 사라진 로케일은 `Locale.orphaned`가 이미
비파괴적으로 든다(ARCHITECTURE §5.5.16).

### 7.3 자동 탐지는 추천이지 진실이 아니다

사용자가 후보와 base locale을 **확인하기 전에는 설정을 확정하지 않는다.**

⚠️ **후보 순위는 탐지기 순위 그대로다** (2026-09-07 구현에서 확정 — 전에는 "키 수가 큰 쪽을 추천"으로
적혀 있었다). 키 수로 다시 정렬하면 검색 인덱스 같은 무관한 JSON 묶음이 1순위가 되고(bugshot-web
실측) 어댑터 재측정이 따라온다. **키 수는 후보마다 보이고**, 기준 언어는 라디오로 사용자가 고른다
(기본 선택은 `pickBaseLocale`).

근거는 실측이다 — bugshot-2에서 작은 `_locales`(4키)가 실제 UI 딕셔너리(903키)를 가렸고, **조용히
작은 쪽으로 떨어져 에러가 나지 않았다**(TASKS §7). 온보딩의 필수 분기다.

### 7.4 워크플로 없이 첫 적재를 한다

**연동 PR을 머지하기 전에 번역 화면을 보여준다.** 서버가 GitHub App으로 base 트리를 읽어 직접
적재하면(`ingest` 경로가 이미 있다) 사용자는 "이 도구가 뭘 하는지"를 **PR을 머지하기 전에** 본다.
그다음이 "계속 자동으로 받으려면 워크플로를 붙이세요"다.

Codex 검토는 연동 PR → 머지 → Actions를 온보딩의 전제로 뒀는데, 그 순서면 **신뢰를 요구하는 행동
(리포에 PR 머지)이 가치를 보기 전에 온다.**

### 7.5 `ready`는 설정 저장이 아니라 최초 적재 성공으로 판정한다

프로젝트 상태:

```
setup → awaiting_first_sync → ready
                            ↘ error / needs_reconnect / needs_configuration
```

**별도 상태 컬럼을 즉시 만들지 않는다** — 초기에는 기존 nullable 필드와 최근 `SyncRun` 결과로 계산할
수 있다. 다만 `ready` 전 프로젝트가 번역 화면에 들어가는 것은 막는다.

⚠️ **연결 건강성은 이것과 별개 축이고, 4단계가 먼저 세웠다.** 이 절이 묻는 것은 "편집 가능한가"이고,
건강성이 묻는 것은 "리포·설치가 지금 어떤 상태인가"다. 후자는 **상태 컬럼 없이 매 렌더 계산**하며
(`planConnectionHealth` 6갈래 — `ok`·`not-connected`·`app-uninstalled`·`installation-changed`·
`repo-moved`·`unknown`), 위 다이어그램의 `needs_reconnect`는 **코드에 없는 이름**이다(설계 어휘로만
남겨둔다 — 실제 값은 `app-uninstalled`다). 그 축의 결정 둘:

- **조회 실패(`unknown`)를 `app-uninstalled`로 접지 않는다** — 장애를 "제거됨"으로 보여주면 사용자가
  멀쩡한 설치를 다시 만든다. §5.1의 "세션 없음 ≠ 못 읽었다"와 같은 축이다.
- **`repo-moved`·`installation-changed`를 자동으로 따라가지 않는다** — 리네임·이전을 서버가 조용히
  받아들이면 "내가 모르는 사이에 다른 리포로 PR이 갔다"가 성립한다. 사람이 다시 연결한다.

### 7.6 Publish — PR 생성은 완료가 아니다

사용자 용어는 `pull`이 아니라 **Publish**다. 다만 **Publish 완료와 리포 반영 완료를 구분한다** —
PR 생성은 `published`가 아니라 `review requested`에 가깝고, 반영은 PR 머지 뒤다.

결과 상태가 서로 달라야 한다: 배포할 변경 없음 / 새 PR 생성 / 기존 PR 갱신 / **일부 값을 파일에
기록하지 못함**(`PullResult.warnings` — 이미 있다) / 실패.

### 7.7 URL과 정보 구조 — 축이 둘이다 (IA 확정: 2026-09-09)

⚠️ **slug에 규칙이 넷 있다** (5단계 `lib/onboarding/slug.ts`의 `planSlug`가 생성 시점에 거른다):
git ref-safe(`isRefSafeSlug` — 브랜치 이름 `l10n/sync-<slug>`에 그대로 들어간다) · 소문자만 ·
`PROJECT_SLUG_MAX = 40` · **`new` 예약**. 마지막 것은 아래 URL 모양의 직접 파생이다 — `/projects/new`가
라우트라서 그 이름의 프로젝트는 자기 설정 화면에 도달할 수 없다.

**축이 둘이고 사이드바가 그것을 구역으로 드러낸다** (2026-09-09 IA 확정 — DESIGN §9의 GitLab
super sidebar 레퍼런스를 고른 이유가 이것이다). 지금 사이드바는 프로젝트 컨텍스트를 `usePathname`으로
**추론**하는데(`activeProject`), 구역이 명시되면 "내가 어느 스코프에 있나"가 추론이 아니라 표시가 된다.

```
── Your work (사용자 축 — 인가는 requireUser) ────────────────────
/projects                      목록 + 생성 진입
/projects/new                  생성
/account                       ✅ 프로필 · OAuth 연동/해제        ← 6b-4 (2026-09-09, 프로덕션)

── <project> (프로젝트 축 — 인가는 getProjectAccess) ─────────────
/projects/:slug                ✅ Home — 개요 (착지점)            ← 6b-6 (2026-09-09, 프로덕션)
/projects/:slug/translations   번역
/projects/:slug/locales        ✅ 로케일 목록 + 기준 로케일 지정   ← 6b-5 (2026-09-09, 프로덕션)
/projects/:slug/members        멤버
/projects/:slug/logs           ✅ 변경 이력                        ← 7단계 (SyncRun 소비자)
/projects/:slug/settings       나머지 프로젝트 설정 전부
```

⚠️ **MCP 토큰 화면은 라우트로 만들지 않는다** (§4.3 ④). `settings`의 섹션이다 — push 토큰이 이미
거기 있고 MCP 토큰도 토큰이다. 전용 라우트는 "MCP로 무엇을 시킬 수 있나"를 설명할 **지면**이
필요해질 때 다시 판정한다.

**IA 결정 다섯** — 각각 이유가 있고, 이유가 사라지면 결정도 다시 본다:

1. ✅ **착지점은 `Home`이다** (2026-09-09 사용자 결정 — 프로젝트 진입 시. **6b-6이 구현했다**).
   `/projects/:slug`가 곧 그 화면이라 목록에서 프로젝트를 누르면 여기로 온다.
   - ⚠️ **"프로젝트로 간다"를 뜻하는 자리가 일곱이었다** — 목록 행 · 사이드바 스위처 · 각 화면의
     breadcrumb 넷 · **초대 수락**. 계획서는 첫 하나만 적었지만 나머지도 같은 의도이고, 하나라도
     남으면 같은 동작이 **어디서 눌렀는지에 따라 다른 곳에 착지한다.** `[Start translating]`(새
     프로젝트 결과)과 나브의 Translations 항목은 번역 화면을 **명시적으로** 가리키는 동작이라 그대로 뒀다.
   - ⚠️ **받아들인 대가**: 번역자(비개발자)의 일은 `translations` 하나이므로 **매 세션에 클릭이 하나
     늘어난다.** 그래서 `Home`의 완료 조건에 그 대가를 갚는 항목이 들어간다 — **거기서 번역으로 가는
     경로가 화면의 주된 동작이어야 한다**(로케일별 진행률이 곧 `?focus=` 링크, 최근 활동이 곧 `?ns=`·
     `?focus=` 링크). 개요만 있고 링크가 없으면 그 클릭이 순손실이다.
     ✅ 구현은 셋으로 갚는다: **진행률 행 전체가 링크** · **활동의 편집 항목이 링크** · 화면당 하나인
     primary가 [Open translations]다. `components/__tests__/home-screen.test.ts`가 그 셋을 소스로 센다.
   - ⚠️ **`/projects` 목록의 링크가 바뀐다** — 지금 `routes.translations(slug)`로 가는데
     `routes.project(slug)`가 된다. 생성기가 `lib/routes.ts` 하나라 그 파일과 `entry-points` 대조가
     같은 커밋에서 움직인다.
2. **`Home`은 다른 화면의 지표를 복제하지 않는다.** 번역 화면 툴바가 이미 키 수·미배포 건수·마지막
   전송·PR 링크를 들고, 설정 화면이 리포·연결·적재 상태를 든다. 세 번째 사본을 만들면 그중 하나가
   낡는다(6b-2가 초대 폼을 지운 근거와 같다). `Home`이 **소유하는 것**은 "한 화면에 모아야만 보이는
   것"뿐이다 — 로케일별 진행률 대비, 그리고 최근 활동.
3. **`logs`의 데이터 원천은 7단계의 `SyncRun`이다** (§6). ✅ **그래서 `Home`이 그 부분집합으로 먼저
   섰다** (6b-6) — 지금 재료로 낼 수 있는 것은 `Translation.updatedAt`+`updatedBy`(최근 편집) ·
   `Project.lastCommitAt`(CI push) · `lastPublishedAt`+`lastPrUrl`(마지막 Publish 1건)이고, 그것은
   "변경 이력"이 아니라 그 부분집합이다. `Home`은 그 부분집합으로 시작하고 `SyncRun`이 서면 늘린다.
4. ✅ **기준 로케일은 `locales`가 소유한다** (2026-09-09, 6b-5) — 로케일 목록과 base 지정이 한
   화면에 있어야 한다. 6b-3이 그것을 `settings`의 Repository 카드에 넣었고 **하루 뒤 6b-5가
   옮겼다.** 옮긴 이유: 그때까지 로케일은 **번역 표의 열로만 존재해** orphaned 로케일이 왜 그렇게
   됐고 어떻게 되살리는지 말할 자리가 없었다(ARCHITECTURE §5.5.16이 그 상태를 정의해 놓고 화면이
   없었다). **화면이 갈리면서 Action도 갈랐다** — `updateBaseLocale` 신설이고, 인자를 optional로
   두지 않은 이유는 "무엇을 안 보냈나"를 서버가 추측하게 되면 그것이 곧 malmoi#20의 모양이기
   때문이다(대기 중에 브랜치만 고친 저장이 선언을 지웠다).
   - ⚠️ **경계 하나가 남는다**: `checkFormat`은 `adapter`·`pathTemplate`·`baseLocale` **셋을 한 묶음**으로
     검사하고 워크플로 YAML도 그 셋을 함께 낸다. base만 `locales`로 가면 **한 화면에서 고친 값이 다른
     화면의 코드 블록을 바꾼다.** 답: **`locales`의 대기 Alert가 고칠 줄을 직접 보인다**(6b-3이 이미 그
     모양이다 — 파일 전체가 아니라 `base-locale:` 한 줄 + Copy). `settings`로 링크하면 "고치려면 두
     화면을 오간다"가 된다.
5. **사이드바 항목에 카운트를 달지 않는다** (초안 시안엔 있었다). 그 숫자는 **셸 레이아웃이 매 페이지
   렌더에서** 세야 하는데, 그 레이아웃은 이미 `readSession` + `loadMemberships` 2왕복이고 번역 화면에
   **키 수와 무관한 1.9초 고정비**가 실측돼 있었다(CLAUDE.md 가상화 절). 카운트 넷은 **모든 화면**에
   왕복을 더한다. ⚠️ **그 고정비는 2026-09-09에 사라졌다**(함수 리전을 DB 옆 `hnd1`으로 — 홉당 375 → 수십 ms).
   판정 자체는 유지한다 — 홉이 싸졌다고 **모든 화면에 왕복 넷을 더할** 이유가 생기는 것은 아니다.
   - ⚠️ **카운트 캐시 테이블도 답이 아니다** (2026-09-09 판정 — 같은 질문이 두 번 나왔다).
     **원인이 카운트가 아니다**: 24키 프로젝트도 3.29초이고 903키도 3.30초라 병목은 행 수가 아니라
     **왕복 횟수 × 왕복 지연**(도쿄)이다. 지금 `COUNT(*)`는 `projectId` 선두 복합 인덱스를 타서 최대
     1146행에서 밀리초다 — 비싼 것은 쿼리가 아니라 **그 쿼리를 따로 보내는 것**이고, 캐시 테이블은
     쿼리를 싸게 만들되 **왕복을 줄이지 않는다**(조회가 하나 늘어난다).
   - **더 값싼 답**: 카운트를 레이아웃의 기존 `loadMemberships` 쿼리에 **서브쿼리로 붙이면 왕복 +0**이다.
     캐시 테이블은 왕복 +1에 드리프트까지 얻으므로 같은 목적에 더 비싸다.
   - **"적당한 시점에 갱신"은 두 갈래로만 끝난다**: 대략치로 충분하다면 테이블 없이 서브쿼리 +
     `revalidate`로 끝나고, 정확해야 한다면 "적당한 시점"이 성립하지 않는다 — CI push 하나가 키 300개를
     바꾼 직후 사이드바가 옛 숫자를 보이면 **방금 워크플로를 돌린 개발자가 적재 실패로 읽는다**(이 리포가
     반복해 밟은 "조용히 틀린다"다). 게다가 갱신 트리거의 자연스러운 정의(`applyPush`의 끝 ·
     `saveTranslation` · `revalidatePath`)가 곧 쓰기 경로여서 위쪽 갈래의 캐시 무효화와 같아진다.
   - ⚠️ **파생값의 사본을 늘리는 것은 코어 원칙과 마찰한다.** `Project.nestedByPath`는 **관측값**이라
     사본이 아니지만(ARCHITECTURE §1.35), 카운트는 진실에서 계산되는 값이라 **갈릴 수 있는 자리를 새로
     만드는 것**이다.
   - **정당해지는 조건 셋** — 이 중 하나가 관측되면 다시 본다: ① 카운트가 **행 수에 비례해** 느려지는
     것이 실측된다(지금은 고정비가 지배해 보이지 않는다) ② `/projects` 목록의 프로젝트별 카운트가
     N+1이 된다(**실재하지만 `GROUP BY` 한 쿼리로 끝난다**) ③ `COUNT(*)`가 실제로 아픈 규모 —
     수십만 행. 지금 최대 1146이다.
   - 시안의 `Projects 3`은 덤이다 — 이미 로드된 `memberships.length`라 쿼리가 0이다.
   - ⚠️ **순서**: 백로그의 조건이 *"착수 전에 어느 왕복이 얼마인지부터 재야 한다"* 다
     (`docs/features/README.md`). **재기 전에 스키마를 늘리는 것은 순서가 거꾸로다.**

**문구는 2인칭으로 통일한다** — 구역 `Your work`, 항목 `Your account`. 시안의 `My account`는 구역과
인칭이 섞였다.

⚠️ **역할 게이팅은 6b-2 관용구를 그대로 쓴다**: 페이지 게이트는 `translation:write`(EDITOR도 로케일·
이력·개요를 본다) · **컨트롤만 role로 갈리고 판정은 Action**이 한다. `project:settings` 뒤에 두는 것은
`settings` 하나다 — 거기에 리포 연결과 push 토큰이 있다.

⚠️ **번역 화면의 필터는 쿼리 상태다** (2026-09-08 ship 3) — `?ns=`·`?q=`·`?state=`·`?focus=`를 페이지가 `searchParams`로 읽어 링크가 공유되고 뒤로가기가 성립한다. 생성기는 `lib/routes.ts` **하나**이고 `app/__tests__/entry-points.test.ts`가 생성기↔수신자를 상시로 대조한다.

⚠️ **Publish는 라우트가 아니다** — 번역 화면 툴바의 버튼이다(`components/publish-button.tsx` — 6a T7이 `pull-button.tsx`를 대체했다). 한때 `/projects/:slug/publish`로 적혀 있었는데 그런 라우트는 만들지 않았고 §8 6단계도 요구하지 않는다.

**account 단계를 두지 않는다** (`/:account/:project`가 아니다). 조직 계층이 §4.2 비범위이므로 그 단계를
지금 만들면 **쓰이지 않는 계층을 미리 만드는 것**이고, `Account` 테이블과 개인/조직 판정이 따라온다.

대가는 **slug 선점**이다 — 전역 unique라 먼저 만든 사람이 이름을 갖는다. 포트폴리오 규모에서는 무해하고,
조직이 실제로 필요해지면 `/:account/:project`로 옮기며 옛 URL에 redirect를 둔다.

⚠️ **URL을 안다는 사실은 접근 권한이 아니다.** slug는 사람이 읽는 주소일 뿐이고, 인가는 항상 내부
`projectId`와 `ProjectMember`로 판정한다 (§5.2).

### 7.8 push 인증 — `Project.pushTokenHash`

서버 env 하나가 대상 프로젝트를 정하던 것을 **대체했다** (2026-09-07). 프로젝트마다 토큰을 발급해
**sha256 해시만 저장**한다 — 발급은 온보딩 결과 화면과 설정 화면의 [토큰 재발급]이다.

⚠️ **조회 방향이 중요하다** (2026-09-07 구현에서 확정 — `features/project-onboarding/design.md` §3.8):
`sha256(Bearer)`로 **행을 찾고**, 페이로드의 `projectSlug`는 그 행의 slug와 **나중에** 대조한다. 페이로드
slug로 행을 찾아 대조하면 오배송된 페이로드가 인증 대상을 스스로 고르는 순환이라 아무것도 막지 못한다.
`pushTokenHash`가 `null`인 프로젝트는 어떤 해시로도 조회되지 않으므로 fail-closed가 컬럼의 성질로 성립하고,
무효 토큰·미발급·없는 프로젝트가 전부 **401 하나**다 (⚠️ 인증을 통과한 뒤의 slug 오배송은 **409이고 본문에 `expected` slug가 실린다** — 그 시점엔 이미 그 프로젝트의 토큰을 든 호출자이므로 새로 새는 정보가 없다)(404 없음 — 프로젝트 존재를 노출하지 않는다).

- **원문은 발급 시 한 번만 보여준다** — 초대 토큰과 같은 모델이라(§5.6) 해시 저장 규칙이 한 곳에 모인다.
- 대상 리포의 composite action은 **이미 `project`·`push-token` input을 갖는다**(`docs/ACTIONS.md`) —
  **서버 쪽만 바꾸면 되고 대상 리포는 secret 값만 교체**한다.
- GitHub OIDC는 쓰지 않는다. 공유 시크릿이 사라지는 것은 매력적이지만 JWKS 검증 + claim 대조
  (`repository`가 그 Project의 리포인가) 구현이 늘고, 대상 리포 워크플로에 `id-token: write` 권한이
  필요해진다. **토큰 유출이 실제 문제가 되면** 그때 옮긴다.

✅ **그 env가 사라지면서 `lib/push/guard.ts`의 오배송 판정 근거가 바뀌었다** (2026-09-07). 전에는
"서버가 아는 프로젝트와 다른가"였고 지금은 **"이 토큰이 그 프로젝트의 것인가"** 다. 역행 거부
(`commitAt`)는 그대로다.

⚠️ **거부가 셋으로 늘었다 — `checkFormat`** (2026-09-07). 같은 프로젝트인데 **다른 번역 표면**을 보내는
push도 409다. `applyPush`가 페이로드 포맷으로 포맷 컬럼 셋을 덮으므로, 자동 후보의 YAML(=`adapter:`를
박지 않는다)로 도는 CI가 1순위 표면을 보내면 **2순위를 확정한 프로젝트의 키가 전부 orphan된다.** 전제
"자동 후보면 탐지가 같은 답을 낸다"는 1순위에만 참이고, 한 리포에 표면이 둘인 `i18n-format-check`가
실물이다(§7.1). 상세와 대가는 ARCHITECTURE §5.5.5에 있다 — **정당한 이전도 409가 되고, 그 재설정 UI는
§8 7단계다.**

### 7.9 프로젝트 수명주기 — 보관까지만 만든다

```
active → archived (편집·sync·CI push 중단, 목록엔 배지로 남는다)
       → 영구 삭제는 손으로
```

**자동 영구 삭제를 구현하지 않는다** — 유예 기간을 세려면 스케줄러가 필요하고, 포트폴리오 단계에서
그것이 답하는 질문이 없다. 보관 상태와 정책만 둔다.

✅ **7단계가 세웠다** (2026-09-10). `Project.archivedAt` **하나**이고 상태 컬럼이 아니다 — §7.5가
"별도 상태 컬럼을 즉시 만들지 않는다"고 이미 정했고, `Locale.orphaned`와 같은 "되돌릴 수 있는 사실
하나"다. 거부는 `planProjectAccess`의 갈래 하나가 하므로 **페이지·Server Action 전부가 한 자리에서**
막히고 `entry-points.test.ts`가 진입점 전수를 센다.

⚠️ **"목록에서 숨김"을 뒤집었다** (2026-09-10 구현 판정). 숨기면 OWNER가 되돌릴 링크에 도달할 길이
없어져 **보관이 편도가 된다.** 목록·스위처에 "Archived" 배지로 남고, `project:settings`만 통과시켜
그 화면의 카드에서 되돌린다.

**멈추는 것 셋**: 편집·Publish(`translation:write`가 `archived`로 거부) · 야간 cron(`selectPullTargets`가
순회에서 뺀다 — 게이트까지 가지도 않는다) · **CI push(409)**. 마지막이 필요한 이유는 보관의 뜻이
"멈춘다"인데 리포가 계속 덮으면 **보관 중에 번역이 조용히 바뀌기** 때문이다(strict push라 되돌릴 수 없다) —
대상 리포 CI가 red가 되는 것은 의도된 신호다(워크플로를 떼라는 뜻).

- 보관해도 **번역 데이터는 남는다.** 되돌릴 수 있는 것이 이 프로젝트의 성질이다(`orphaned`와 같은 이유).
- **열린 `l10n/sync-<slug>` PR은 닫지 않는다** — 리포는 사용자 것이고, 우리가 그쪽 PR을 정리할 권한을
  가정하지 않는다. ✅ 설정 화면의 보관 **확인 Dialog**가 그 PR을 링크로 싣는다 (2026-09-10).
  ⚠️ **조회 실패는 "없다"가 아니라 "확인하지 못했다"다** — 접으면 그 정보가 조용히 사라진다
  (POSTMORTEM 2026-09-03).
- **GitHub App을 제거해도 프로젝트를 지우지 않는다** — `needs_reconnect`로 두고 재설치로 되돌린다
  (§8 4단계).

## 8. 구현 순서

> **Codex 검토의 9단계와 다르다.** 사전 단계와 0단계(무결성 부채)는 이미 닫혔고, UI 이관을 앞으로
> 당겼다 — 인증만 만들고 화면이 없으면 3~5단계를 검증할 방법이 API 테스트뿐인데, preview 배포를
> 만든 이유가 정확히 "눈으로 확인할 곳"이었다.

### 0단계 — 선행 정리 ✅ (2026-09-05)

SaaS 기능이 아니라 **다중 프로젝트가 서는 순간 터지는 것**을 먼저 막는다.

- [x] **`SYNC_BRANCH`를 프로젝트별로 갈랐다** ✅ (2026-09-05) — 상수 `l10n/sync` → `syncBranchFor(slug)`가
      내는 `l10n/sync-<slug>`. **`Project` 컬럼으로 두지 않았다** — 마이그레이션이 필요하고, 사용자가
      브랜치 이름을 정하고 싶어하는 요구는 아직 없다. 필요해지면 그때 컬럼으로 승격한다
  - `Project.slug`에 형식 제약이 없어(`slug String @unique`) **이 함수가 유일한 방어선이었다** — 5단계가 `planSlug`(`lib/onboarding/slug.ts`)로 실패를 **생성 시점으로 당겼고**, 판정 정규식은 `lib/pull/ref-slug.ts` 한 벌을 둘이 공유한다 — git이
    거부할 이름을 화이트리스트로 막고 던진다. 안 막으면 `createRef` 422가 "GitHub이 거절함"으로만 보인다
  - 검증: `lib/pull/__tests__/trigger.test.ts` — 다른 slug는 다른 브랜치, 같은 slug는 같은
    브랜치, git이 거부할 15가지 slug를 던진다. 소비자 셋은 `sync-branch-consumers.test.ts`(2026-09-06). 폐기용 리포 셋에 열린 `l10n/sync` PR이 없어(전부 머지됨)
    이름이 바뀌어도 고아 PR이 생기지 않는다
- [x] **dev DB 적재** ✅ (2026-09-05) — `order-check` 프로젝트(`SinhyeokKang/i18n-order-check`) 23키 ·
      로케일 en/ja/ko · 번역 69건. **prod에서 복제하지 않았다** — `DATABASE_URL_PROD`를 두지 않는
      규칙(CLAUDE.md) 때문에 로컬이 prod 런타임을 가리킬 길을 열지 않고, 대신 **GitHub App API로
      `installationId`를 조회**해(`GET /app/installations` → `158107153`) dev에 행을 새로 만들었다
  - `Project` 행은 여전히 **손으로 만든다** — `applyPush`는 `project.update`만 하고 생성 경로가 없다.
    프로젝트 생성이 §8 5단계의 내용이다
  - 나머지 컬럼(`adapterName`·`pathTemplate`·`nested`·`baseLocale`)은 push가 채웠다 —
    `json-catalog` / `locales/{locale}.json` / 중첩 / base `en`

### 1단계 — SaaS 경계 확정 ✅ (2026-09-05)

**화면보다 도메인과 주소를 먼저 확정했다.** 문서 작업이라 `/feature`를 부르지 않았고, 결정은 전부
§7로 올라갔다 — 아래는 그 목록이다.

- [x] **URL 구조와 slug 소유 범위** → §7.7. `/projects/:slug`, slug **전역 unique**. account 단계를
      두지 않는다 (조직 계층이 §4.2 비범위라 쓰이지 않는 계층을 미리 만드는 것이 된다)
- [x] **`/api/push` 인증** → §7.8. `Project.pushTokenHash`(sha256). **대상 리포는 secret 값만 교체**한다 —
      composite action이 이미 `project`·`push-token` input을 갖고 있어 워크플로는 안 바뀐다
- [x] **프로젝트 수명주기** → §7.9. 보관까지만 만들고 자동 영구 삭제는 안 만든다. App 제거는
      `needs_reconnect`이고 데이터를 지우지 않는다
- [x] **UI 레퍼런스 — GitLab super sidebar** (2026-09-07에 Supabase에서 바꿨다) → `docs/DESIGN.md` §9. 레이아웃·밀도·정보구조를 참조하고
      **색은 우리 토큰을 유지한다** (라이트 단일 강제가 그대로다)

완료 게이트: 모든 화면과 mutation을 **사용자·프로젝트·권한으로 표현**할 수 있다 ✅ /
공유 slug env 없이 대상 프로젝트가 결정된다 ✅ (2026-09-07 — push는 토큰이, pull은 순회가 정한다. §7.8)

### 2단계 — 인증·인가 토대 ✅ (2026-09-06 프로덕션 반영 완료) → `features/tenant-auth/`

**프로덕션까지 갔다** (`62edf2a`). `pnpm db:deploy` → 6개 프로젝트 OWNER backfill → 머지 순서로 나갔고,
`https://mal-moi.com`에서 GitHub 로그인 → 6개가 **소유자**로 보이는 것까지 실물로 확인했다.

- [x] `User`·`Account`·`Session`·`VerificationToken`·`ProjectMember`·`ProjectInvitation` (§6) ✅ (2026-09-05, `2e998d4` — `20260904182548_add_tenant_auth_tables`). dev는 `db:migrate`, **prod는 2026-09-06 `db:deploy`** 로 반영했다 (`db:status:prod` up to date)
- [x] Auth.js **DB 세션** 전환 (§5.3), GitHub + Google provider ✅ (2026-09-05, `0d80e5a`)
  - ✅ **Google 로그인이 열렸다** (`6ed4ecb` — 허용 목록 제거와 같은 커밋). 그 전까지 거부됐던 이유는
    목록이 GitHub 핸들을 요구했기 때문이고, 목록을 GitHub에만 걸어 먼저 열면 그 순간 Google이 **무인가
    통로**가 됐을 것이다 — `requireProjectAccess`가 편집 경로에 붙기 전이라 들어온 사람이 번역을 고칠
    수 있었다. 그래서 셋이 한 커밋이다. preview에서 실측 통과했다
  - ⚠️ **Google 동의 화면은 External + 테스트여야 한다.** Internal로 두면 조직 밖 계정이 `403 org_internal`로
    막히는데, **비개발자 동료를 초대하는 것이 이 provider를 넣은 이유 전부**라 그러면 경로가 통째로 죽는다
  - **이메일 검증이 provider의 `profile` 구성 자리로 올라갔다** — `signIn`에서 검사만 하면 검증한
    주소와 저장되는 `User.email`이 갈린다 (ARCHITECTURE §6.2, POSTMORTEM 2026-09-05)
- [x] `requireUser` · `requireProjectAccess` (§5.2) ✅ (2026-09-05, `bb94651` → `6ed4ecb`) —
      편집 경로 전 진입점이 이것을 지난다. **`app/__tests__/entry-points.test.ts`가 상시로 센다**
- [x] 이메일 정규화·초대 수락·**멤버 변경**의 **순수 판정 함수** ✅ (2026-09-05, `2e0f7f4`) —
      `lib/auth/`에 9개(`normalizeEmail`·`canPerform`·`hashInviteToken`·`planInvitationAccept`·
      `planProjectAccess`·`planMemberChange`·`planOwnerBackfill`·`hasSessionCookie`·
      `accessErrorMessage`), 검증 67케이스. **호출부는 아직 없다** — 껍데기가 위 두 항목이다
      *(2026-09-05 시점 스냅샷 — `planOwnerBackfill`은 06에 삭제됐고, 호출부는 §5 전환에서 생겼다.
      06 감사 뒤 `planEmailRefresh`·`shouldRedirectToLogin`·`publicSession`·`outage`가 더해져 지금은 그
      수가 다르다)*
  - ⚠️ **"계정 연결"이 빠졌다.** `planAccountLink`는 4단계(`github-connect`)로 옮겼다 — Auth.js
    어댑터가 기본으로 교차 provider 자동 연결을 거부하므로(`allowDangerousEmailAccountLinking`
    미설정) 이 단계의 방어선은 **그 옵션을 켜지 않는 것**이고, 명시적 연결 흐름은 4단계다.
    호출부 없는 판정 함수를 미리 만드는 것은 이 프로젝트에서 결함이다
- [x] 기존 `Project`에 소유자 backfill ✅ **실행하고 스크립트를 지웠다** (2026-09-06) — dev 1건 ·
      **prod 6건**(`bugshot-2`·`bugshot-i18n-test`·`format-check-yaml`·`skillflo`·`format-check-code`·
      `order-check`), 재실행 0건으로 멱등 확인. `User` + `Account(github)` + `ProjectMember`를
      **한 트랜잭션**으로 만들었다 — `User`만 만들면 첫 GitHub 로그인이 `OAuthAccountNotLinked`로
      거부되고, 그게 이 스크립트가 존재한 이유의 절반이다.
      ⚠️ **일회성 코드라 `scripts/backfill-owners.ts`·`lib/auth/backfill.ts`를 함께 삭제했다** —
      남겨두면 "이걸 또 돌려야 하나"를 다음 사람이 매번 판단해야 한다. 되살릴 일이 생기면 git 히스토리에 있다

완료 게이트: §5.7의 공격 시나리오가 **전부 거부** ✅(`authorization.test.ts`·`membership.test.ts`·`edit-flow.test.ts`
+ preview 실측) / 멤버 제거가 기존 세션에 **즉시** 반영 ✅ / 프로젝트 인가 없이 실행되는 Server Action·
Route Handler가 0 ✅(`entry-points.test.ts`가 예외 6개를 이름으로 고정) / Google 사용자가 GitHub 계정
없이 초대 수락과 편집이 가능 ✅ **실물로 밟았다**.

**`[manual]` 넷을 preview에서 밟았다** (2026-09-05 — e2e가 없어 자동화할 수 없다): 비로그인 응답
본문 0바이트 · Google 로그인 · 초대 링크 왕복(발급→비로그인 열람→다른 Google 계정 수락→EDITOR 저장) ·
세션 회수 뒤 blur 저장. **같은 이메일의 provider 자동 병합 거부**(§5.5)도 함께 확인했다. 기록은
`features/tenant-auth/tasks.md` §6.1이고, **거기서만 잡힌 결함이 넷이다** — 타입 검사도 테스트도
원리적으로 못 보는 부류다(죽은 라우트 링크 · 로그인 거부 문구 · **초대 거부가 화면에 안 닿음** ·
preview `DATABASE_URL`의 pooler 포트). 넷 다 **"값은 맞는데 사용자에게 도달하지 않는다"** 는 한 부류이고,
이 단계가 남긴 상시 방어선도 그 모양이다 — `entry-points.test.ts`의 "죽은 라우트 링크"와
"쿼리 파라미터의 수신자".

**프로덕션 반영 순서는 이랬다** (2026-09-06, 다음에 같은 모양의 단계를 낼 때 그대로 쓴다):
⓪ `DATABASE_URL`이 transaction 모드(6543)인지 **원본에서 다시 복사해 덮어** 확인 →
① `pnpm db:deploy` → ② `pnpm db:status:prod` → ③ 소유자 backfill(dry-run 뒤 `--apply`) → ④ `/merge`.
**③이 ①보다 앞설 수 없고**(`ProjectMember` 테이블이 있어야 한다), ③을 빠뜨리면 기존 프로젝트에
멤버가 없어 아무도 못 들어간다(fail-closed라 옳지만 복구가 SQL이다).

⚠️ **⓪이 실제로 값을 했다** — Preview가 session 모드(5432)로 들어가 있어 커넥션 고갈로 터진 전례가
있었고(POSTMORTEM 2026-09-05), 프로덕션도 같은 시기 같은 방식으로 넣은 값이었다. Vercel의 Sensitive
변수는 되읽을 수 없으므로 **덮어쓰는 것이 유일한 확인법**이다.

⚠️ **환경변수 하나가 더 틀려 있었다**: 프로덕션 `AUTH_GITHUB_ID`에 OAuth **Client ID**(`Ov23li…`) 대신
GitHub 설정 페이지의 **레코드 번호**가 들어가 있어 로그인이 404였다. 그 앱의 client secret이
"Never used"였던 것이 증거다 — **프로덕션 GitHub 로그인은 그때까지 한 번도 성공한 적이 없었고**,
허용 목록이 로그인을 막고 있던 동안에는 그 사실이 드러날 경로가 없었다. GitHub OAuth 앱은
프로덕션·preview·로컬 셋이고 **client_id가 전부 달라야 한다** (2026-09-06에 셋 다 실물 확인했다).

### 3단계 — 최소 UI 이관 ✅ **2단계 §5에 흡수됐다** (2026-09-05)

**전면 재작성이 아니다.** 동결된 `/keys`를 프로젝트 URL과 인가 경계 위로 옮기기만 한다 —
판정 로직(`lib/keys/view.ts`·`translationState`)이 이미 있어 이관 비용이 작고, 이게 있어야
4·5단계를 preview에서 화면으로 확인한다.

- [x] `/keys` → `/projects/:slug/translations`, `/projects` 목록, `/invite/[token]` ✅
- [x] 모든 조회·저장이 `requireProjectAccess`/`getProjectAccess`를 지난다 ✅

**따로 둘 수 없었다.** 인가를 붙이는 것과 라우트를 옮기는 것이 같은 일이다 — 프로젝트를 URL이
정하지 않으면 `requireProjectAccess`에 넘길 slug가 없고, 허용 목록을 남긴 채 멤버십을 붙이면 두
인가가 AND로 걸려 초대받은 비개발자가 로그인 단계에서 막힌다. 그래서 셋이 한 커밋이다.

완료 게이트: 다른 프로젝트 ID를 주입해도 노출·수정되지 않는다 / 기존 push→편집→pull 값 전달
테스트가 새 경로에서도 통과한다.

### 4단계 — GitHub 설치 연결 ✅ **완료 (2026-09-07, 실물 검증까지)** → `features/github-connect/`

> T0~T4가 코드를, T5가 실물 왕복을 받았다(App 설정 · 순수 판정 · 껍데기 · callback 라우트 · 설정 화면).
> **실물 왕복이 게이트였던 이유**: code 교환, `paginate`의 응답 정규화, state 쿠키 왕복은 단위 테스트가
> 원리적으로 못 본다. **거기서만 잡힌 결함이 하나**(malmoi#7 — `redirect_uri` 누락으로 로컬·preview
> 연결이 원리적으로 불가능했다). T5는 **9/11**이다 — 마지막 하나가 배포 뒤 **프로덕션 왕복**(계정 연결 · 3중 검증 거부 · 재연결 성공, 2026-09-07).

- [x] 기존 User에 GitHub Account **명시적 연결** (§5.5) — T5 실물 왕복, `Account(provider:"github-app")` 행 확인
- [x] installation 조회 · repository 조회 · **3중 검증** 후 Project 연결 (§5.4) — `planRepoConnect`
- [x] 리포 접근 철회 → `app-uninstalled`(설계 어휘의 `needs_reconnect` — §7.5) · 데이터는 보존 — **2026-09-07 실물**: 설치를 `Only select
      repositories`로 바꾸고 리포 하나를 뺐다 넣었다. `probeRepo`가 `not-installed`로 바뀌고 화면이
      "App이 제거·일시중지됐거나 이 리포 접근이 철회됐어요" + 설치 링크 + "다시 연결"을 보이며,
      되돌리면 "연결됨"으로 복귀한다. `Project` 행은 두 방향 모두에서 그대로다

⚠️ **T5에서 못 밟은 것이 둘이고, 셋째 체크박스에만 걸린 것이 아니다.**

- **셋째 항목** — 넷 중 **접근 철회 하나만** 밟았다. **App 제거·리네임·소유자 이전은 안 밟았다**:
  제거는 폐기용 리포와 프로덕션 리포가 **같은 설치를 공유**해 프로덕션 연결까지 끊기고, 뒤의 둘은
  리포를 실제로 옮겨야 한다.
- **첫째 항목** — "다른 User가 연결한 GitHub 계정으로 연결 시도"(`planAccountLink`의 `taken-by-other`)를
  못 밟았다. 계정 둘과 세션 둘이 필요해 브라우저 자동화로 재현할 수 없다. 단위 테스트가 덮는다. 셋 다 `probeRepo`의 같은 분기(404 → `not-installed`,
`full_name` 불일치 → `repo-moved`)로 들어가고 그 분기는 단위 테스트가 덮는다. **철회를 고른 것은
그것이 "200을 주는데도 접근이 없는" 유일한 경우이기 때문이다** — public 리포는 철회 뒤에도
`GET /repos`가 200이라, App JWT의 `/installation`을 판정 근거로 삼은 설계가 여기서만 검증된다.

완료 게이트: 접근할 수 없는 `installationId`를 직접 보내도 생성되지 않는다 ✅(애초에 클라이언트가
보내지 않는다 — §5.4. 인가·3중 검증 거부는 `app/(edit)/__tests__/github-connect.test.ts`, state 위조는
`app/api/__tests__/github-callback.test.ts`) / OAuth 토큰이 커밋 경로에 들어가지 않는다
✅(`credential-separation.test.ts`) /
접근을 철회해도 번역 데이터가 보존되고 재부여로 재연결된다 ✅(2026-09-07 실물).

### 5단계 — 탐지 온보딩 ✅ **완료 (2026-09-07, 프로덕션 반영까지)** → `features/project-onboarding/`

- [x] 탐지 후보를 **사용자 언어로** 요약 (경로·언어·기준 언어·키 수·형식), 내부 이름은 숨김 (§3)
- [x] 후보 추천 순위와 **사용자 확정** (§7.3) — 순위는 탐지기 순위 그대로, 확정은 파일을 다시 읽어 재검증한다
- [x] **워크플로 없이 첫 적재** (§7.4) — `runFirstIngest`가 `assemblePushInput`→`buildPushPayload`→`applyPush`를 지난다
- [x] 연동 PR 생성 또는 복사 가능한 워크플로 — **복사용 YAML로 정했다** (`workflows: write` 권한을 늘리지 않는다).
      설치 화면의 "워크플로 파일을 수정합니다"가 비개발자에게 가장 무거운 문장이라는 판정이다
- [x] `ready` 판정과 실패 진단 — `planProjectReadiness` 3갈래 + `OnboardError` 18갈래.
      ⚠️ **Actions 링크는 넣지 않았다** — 첫 적재는 Actions가 아니라 서버가 돌리므로 가리킬 run이 없다.
      실패 사유는 그 호출의 반환값에만 있고(중간 상태 무저장), 설정 화면의 [다시 시도]가 인라인으로 낸다
- [x] **`Project.pushTokenHash` 발급·대조 + `/api/pull` 전 프로젝트 순회** (§7.8·§4.3 ②) — 공유 slug env
      제거. 대상 리포는 Actions secret 값만 바꾼다. `push:local`·`smoke:github`의 인자 생략 폴백도 같이 사라진다
  - ✅ 2026-09-07 — 대조는 `47fb4de`(T3, `sha256(Bearer)` → `pushTokenHash` → slug 대조), 순회는
    `597b545`(T4, `lib/pull/targets.ts` + 프로젝트별 try/catch), **발급**은 `b1fed55`(T6,
    `createProject`가 한 트랜잭션에서 심고 `rotatePushToken`이 회전한다 — 원문은 반환값에만 있다).
    ✅ **프로덕션 반영 완료** (2026-09-07) — `db:deploy`로 `_add_project_push_token`이 prod에 갔고
    (`db:status:prod` 11개 up to date) PR #9가 코드를 실었다. 발급 화면은 T7 산출물로 서 있다
    (`components/onboarding/push-token-panel.tsx` → 설정 화면 3섹션, 회전은 `rotatePushToken`)

완료 게이트: 새 사용자가 **문서나 터미널 없이** 첫 적재를 완료한다 / 작은 후보가 큰 표면을 조용히
가리지 않는다 / 확정하지 않은 추정값으로 `ready`가 되지 않는다.

✅ 2026-09-07 — **T1~T8이 끝났다** (`features/project-onboarding/tasks.md`). 게이트 셋 중 첫째와 셋째는
실물로 확인했다: 로그인부터 첫 적재까지 터미널 없이 한 바퀴 돌았고(dev DB에 검증용 프로젝트를 만들었다
지웠다), `lastCommitSha`가 서지 않으면 `ready`가 아니다. **둘째는 부분적이다** — 후보 목록이 키 수를
보이지만 `ts-dict`가 자동 탐지에 참여하지 않아 `bugshot-2`의 903키 표면은 수동 지정으로만 붙는다
(ADAPTER-COVERAGE 판정 ③).

**T8(프로덕션 전환)이 끝났다** — `db:deploy`(prod 11개) → `/merge`(PR #9 → squash `f595cc3`, CI verify green,
Vercel 프로덕션 배포 success) → 대상 리포 토큰·secret 교체 → CI green(`updated: 23`) → 실물 왕복 14시나리오
(로컬 + dev DB, **결함 0**) → `/l10n-roundtrip` 재검증(`no-changes` → 편집 3건 PR 재사용 → 머지 → `no-edits`
→ `[skip-l10n]`으로 CI skipped). ⚠️ **전환 계획의 전제 둘이 실측에서 뒤집혔다**: ① l10n 워크플로가 붙은
리포는 `i18n-order-check` **하나**여서 나머지 셋에는 토큰을 발급하지 않았다(`pushTokenHash`가 `null`인 것이
fail-closed의 올바른 기본값이다) ② **prod `Project` 행은 여섯**이고 `i18n-format-check` 하나에 프로젝트가
둘이다(§7.1의 "한 리포에 표면이 둘"이 실재한다 — §10의 secret 배선 미결이 여기서 나왔다).

✅ **옛 env 삭제까지 끝났다** (2026-09-07 리뷰 ⚪16). 롤백 창 때문에 보류였는데 `main`에 #9 위로 #10이
이미 얹혀 그 창이 사실상 닫혀 있었다. 코드가 그 값을 읽지 않는 것은 `scripts/__tests__/required-args.test.ts`가
상시로 센다. ⚠️ **"세 스코프"가 아니었다** — 둘 다 **Production+Preview**만 갖고 있었고 Development에는
없었다. 삭제는 `vercel env ls`로 확인했다(CLI의 성공 메시지가 근거가 아니다 — CLAUDE.md).

### 6단계 — 번역 UI 재작성 + Publish ✅ **완료 (2026-09-09, 프로덕션 — 6a 넷 + 6b 여섯)** → `features/translation-ui/`

3단계에서 이관한 화면을 **여기서 제대로 만든다.**

⚠️ **6a / 6b로 갈렸고 6a는 4번의 배송이다** (2026-09-08, `/feature-review` — `features/translation-ui/tasks.md`의
배송 단위 절이 정본). **ship 1**(기반 — 사전 `messages/en.tsx` · 순수 판정 `lib/keys/view.ts`·`lib/routes.ts` ·
additive 컬럼 둘 · 프리미티브 16) · **ship 2**(셸) · **ship 3**(T7 번역 화면 + Publish) · **ship 4**(T8·T9 —
설정·새 프로젝트·초대 수락 + 문서·chore)가 **넷 다 프로덕션에 나가 6a가 닫혔다**
(PR #12 → `46df51a`, PR #14 → `add099a`, PR #15 → `ef9da44`, PR #16 → `695e441`). **6b-1**(어댑터 오류 코드화
+ survey 분류기 + 14차 재측정)이 그 뒤였고(PR #17 → `982cb42`), 2026-09-09에 **6b-2**(멤버 화면 — PR #19 →
`a00d380`)와 **6b-3**(base branch·기준 로케일 필드 — PR #21 → `7c975c0`) · **6b-4**(`/account` — PR #22 →
`70e393b`) · **6b-5**(로케일 화면)·**6b-6**(Home — 착지점, 둘이 PR #23 → `0d68d71`)까지 **프로덕션에
나갔다.** ✅ **6b가 닫혔다** — 라우트 여덟 중 남았던 ⬜는 `logs` 하나였고 그것은 **7단계**였다
(`SyncRun`의 소비자, §6). 즉 **6단계는 그 배송으로 끝났다.** ✅ **그 마지막 칸도 2026-09-10에 찼다** —
7단계 ship 3이 `logs`를 냈고 **§7.7의 라우트 여덟이 전부 ✅다.**

**아래 항목들의 판정·데이터층이 먼저 섰고 화면도 ship 3·4가 세웠다 — 6b가 남은 화면 둘(멤버 관리·기준 로케일)을 채웠다.** 판정층은 — `defaultNamespace`·`resolveNamespace`·
`filterRows`·`isUnpublished`(`lib/keys/view.ts`), `countUnpublished`(`lib/keys/query.ts`),
`PullResult.pr` + 문구 다섯·tone 넷(`lib/pull/message.ts`)이 그것이다.

**UI 문자열은 영어 단일이고 출처가 `messages/en.tsx` 하나다** (6a T1). 화면은 `@/lib/i18n`의 `m`으로 읽고,
`lib/i18n/__tests__/no-korean-ui.test.ts`가 화면 소스의 한글 리터럴을 축소형 허용 목록으로 상시 고정한다.
**ko를 여는 시점은 아직 안 정했다** — §10에 있다.

- [x] ~~원문 + 전 로케일, 저장 상태, `needsReview`·`orphaned` 배지, 코드 permalink~~ ✅ **ship 3** (2026-09-08, T7)
  - ⚠️ **큰 프로젝트의 첫 착지가 느리다** (2026-09-07 실측): `ts-dict` 903키의 필터 없는 화면이 12.7초 ·
    `<input>` 2,711개 · 네임스페이스 52개. **가상화가 첫 수단이 아니다** — 인라인 편집과 섞으면 스크롤
    튐·포커스 유실이 붙는다(CLAUDE.md). 기본 착지를 첫 네임스페이스로 두는 것이 더 값싸다
  - ⚠️ **그 값싼 수단은 붙었고, 2초 목표는 미달이다** (2026-09-08 프로덕션 재측정 — 같은 프로젝트·같은
    방법). 필터 없는 화면은 **12.7 → 4.66초**(2.7배)이고 **기본 착지는 3.30초**인데, **24키 프로젝트도
    3.29초다** — 약 1.9초가 키 수와 무관한 고정 비용이고 셸·폰트가 그 아래 1.42초를 깐다.
    **가상화도 조회 좁힘도 이 3.3초를 못 줄인다.**
  - ✅ **2초 목표를 통과했고, 답은 그때 적은 수단 셋이 아니었다** (2026-09-09). **Vercel 함수가 `iad1`
    (워싱턴)에서 돌고 DB는 도쿄**라 왕복 일곱이 태평양을 건넜다(홉당 ~375ms) — `vercel.json`의
    `regions: ["hnd1"]` 한 줄로 **기본 착지 3.30 → 0.44~0.54초**, 필터 없는 907키 화면 **4.66 → 1.20초**
    (FCP 3회, PR #24 → `7b029b8`). ⚠️ **TTFB 8~78ms를 서버 시간으로 읽은 것이 오진의 원인이다** —
    헤더만 먼저 나가고 서버가 8KB 본문을 3.4초 붙들고 있었다 (POSTMORTEM 2026-09-09).
    표는 `features/translation-ui/tasks.md` T7
- [x] ~~**6b-1 어댑터 오류 코드화 + 재측정**~~ ✅ (2026-09-08) — 생성 지점 35곳이 `AdapterErrorCode` 스물둘을
      내고 문장은 `messages/en.tsx`의 `adapterErrors`가 낸다(`lib/i18n/adapter-errors.ts`). `lib/survey/one.ts`의
      `classify`가 문구 기반에서 코드 기반으로 갔고, **학습·홀드아웃 둘 다 돌려 전 지표가 13차와 같음을
      확인했다** (ADAPTER-COVERAGE **§20** — 14차). `no-korean-ui`의 `lib/adapters/**` 제외와 `lib/pull/render.ts`
      허용이 함께 풀려 목록이 둘로 줄었다
  - ⚠️ **재측정이 이 변경의 주된 방어선이 아니다** — 코퍼스가 밟는 갈래는 스물둘 중 여섯뿐이라 나머지의
    회귀는 지표에 **0으로 조용히** 남는다. 옛 문구 22개와 **옛 분류기 본문**을 픽스처로 든
    `lib/survey/__tests__/classify.test.ts`가 그 자리를 메운다
- [x] ~~**6b-2 멤버 관리 화면**~~ ✅ (2026-09-09) — `/projects/:slug/members` 신설. `createInvitation`·
      `changeMember`가 제대로 된 호출부를 얻고 `revokeInvitation`이 더해졌으며(행을 지우지 않고
      `expiresAt`을 당긴다) 임시 폼 `components/invite-form.tsx`는 삭제됐다.
  - **게이트가 `translation:write`다** — EDITOR도 목록을 본다(user-stories §5). 컨트롤만 역할로 갈리고
    판정은 Action의 `member:manage`가 한다. `github-connect/spec.md`의 "`/settings` 섹션으로" 결정을
    뒤집은 것이고 그쪽에 🔴 STALE을 표시했다 — `/settings`는 `project:settings` 뒤라 EDITOR가 못 들어온다
  - 실측(`/bugshot-qa`): 두 역할의 사이드바·컨트롤 노출·`/settings` 직접 접근 거부·마지막 OWNER 거부
    문구·대기 초대 술어·빈 상태·`revalidatePath`까지 통과. **결함 1건**([malmoi#18](https://github.com/SinhyeokKang/malmoi/issues/18) —
    마스킹이 두 초대를 같은 행으로 접었다)을 같은 사이클에서 고쳤다
- [x] ~~**6b-3 설정의 기준 브랜치·기준 로케일 필드**~~ ✅ **프로덕션에 나갔다** (2026-09-09, PR #21 → `7c975c0` — T1~T5는 `fe5f39e`·`6ab0f70`·`3a98886`).
      **선언을 별 컬럼으로 뺐다**: `Project.declaredBaseLocale`(additive, nullable)이 OWNER의 허가이고 `baseLocale`은 push가
      소유하는 현실로 남는다 → **pull 코드가 한 줄도 안 바뀌고 어느 단계도 멈추지 않는다.** 검수의 후보안(같은 컬럼을
      선언으로 쓰고 pull을 `skipped`로 멈춘다)은 기각했다 — 멈추면 편집 손실 창이 대기 기간만큼 늘어난다.
      `checkFormat`이 선언과도 대조해 통과시키고 **그 값을 실제로 가져온 push만** 선언을 비운다(일회용 허가 —
      push마다 비우면 워크플로를 고치기 전의 평범한 CI push가 허가와 배너를 함께 지운다, POSTMORTEM 2026-09-09).
      `planPush`는 base 교체 push에서 `needsReview` 전파를 건너뛴다 — `sourceHash`가 바뀐 원인이 "원문 수정"이 아니라
      "원문 **언어** 교체"라 다른 로케일의 번역은 여전히 정확하다.
  - [x] **T6(실물 409 → 워크플로 수정 → 통과·대기 해소)** ✅ 2026-09-09에 프로덕션 `order-check`로
    실측했다 — 대상 리포의 워크플로가 프로덕션 `mal-moi.com/api/push`를 찌르므로 dev에서는 검증할 수
    없었고 `/merge` 뒤에 돌렸다 (결과 표는 `features/translation-ui/tasks.md` 6b-3 T6).
    ⚠️ **거기서 나온 선행 결함 둘은 6b-3 밖이다** — base 셀을 비우면 다음 push가 그 키를 전 로케일에서
    orphan한다(`lib/pull/plan.ts` — 빈 문자열도 "없음"으로 센다) · DB가 base와 같아지면 pull이 스킵해
    열린 sync PR이 옛 스냅샷을 든 채 남는다(`lib/pull/run.ts` — 변경 0건이면 브랜치를 base head로 되돌린다)
- [x] ~~**6b-4 `/account` — 만들지 말지의 판정**~~ → **판정이 끝났다: 만든다** (2026-09-09 IA 확정 §7.7).
      계획서의 옛 추천은 "만들지 않는다"였고 근거가 "지금 계정 컨트롤이 하나뿐"이었는데, **그 하나를
      목록 화면(`/projects`)에 얹게 만든 원인이 자리가 없다는 것**이라 방향을 뒤집었다.
- [x] **6b-4 `/account` 배송** ✅ **프로덕션에 나갔다** (2026-09-09, PR #22 → `70e393b` — 커밋 여섯: `8fb0e12`·`f3d16f2`·`47d03cf`
      + `fix` `4b9b0a6`). 프로필(읽기 전용 — provider가 소유한다, `planEmailRefresh`) · GitHub
      연결·해제·재인가 · 로그아웃. **`/projects`의 계정 카드를 옮겼다(복제하지 않았다)** — 그것이
      CLAUDE.md에 적힌 빚("프로젝트 0개인 사용자가 해제에 도달할 길이 없다")을 닫는다.
  - [x] `StateDest`에 `{ kind: "account" }` — 옛 쿠키 둘은 그대로 파싱되고 `state.test.ts`가 그 방향을
      고정한다. `startGithubConnectForUser(dest)`는 **갈래 이름만** 받는다(`"new" | "account"`, zod) —
      `StateDest`를 통째로 받으면 클라이언트가 착지를 골라 이 자리에 open redirect 판정이 생긴다.
      `?e=` 읽는 자리가 셋 → **넷**
  - [x] `middleware.ts` matcher에 `/account`. **그 그물이 실제로 도는지 확인했다** — 그 한 줄을 빼면
      `entry-points`의 "(edit) 아래 모든 페이지가 어느 패턴에든 걸린다"가 red다
  - [x] 사이드바 **2구역**(`Your work` / `<project>`) + 유저 메뉴 `Your account`. ⚠️ **구역 둘이
      `aria-label`을 든다** — 구역 라벨이 `<p>`라 접근성 트리에서 이름이 아니고 **접힌 레일에서는 아예
      렌더되지 않는다**(실물로 확인: 레일에서 `nav`의 라벨 둘은 남고 `<p>` 둘은 사라진다)
  - ⚠️ **`projectSections`는 셋으로 뒀다.** 계획서는 여섯(Home·Translations·Locales·Members·Logs·Settings)을
      적었지만 Home·Locales·Logs의 라우트가 6b-6·6b-5·7단계다 — 없는 라우트를 가리키는 항목은 404다.
      **각 항목은 자기 라우트와 같은 사이클에 온다.** 같은 이유로 `routes.project(slug)`도 6b-6 몫이다
  - ⚠️ **`disconnectGithub`의 무효화 범위가 함께 움직여야 했다** (`4b9b0a6`) — `revalidatePath("/projects",
      "layout")`이 주 화면을 덮지 않게 됐다. POSTMORTEM 2026-09-09에 일반 규칙과 grep 전수 결과가 있고,
      **`saveTranslation`이 6b-6에서 같은 이유로 부족해진다**(Home이 같은 행을 읽는다)
- [x] **6b-5 `/projects/:slug/locales`** ✅ **프로덕션에 나갔다** (2026-09-09, PR #23 → `0d68d71` — `1a834e2` + `e6772ae` +
      `3cca010`). 로케일 목록(orphaned **사유와 되살리는 방법**을 말하는 유일한 자리) + 기준 로케일
      지정·대기 Alert를 6b-3에서 이관. 게이트는 `translation:write`이고 컨트롤만 role로 갈린다.
  - [x] 진행률은 **두 쿼리 병렬 한 벌**이다 — `loadKeys`를 재사용하면 903키 프로젝트에서 이 화면이
      번역 화면만큼 무거워진다. `percent`는 **내림**이라 902/903이 100%로 보이지 않고, **base 로케일도
      100%가 아닐 수 있다**(그 파일에 빈 값이 있을 수 있다 — POSTMORTEM 2026-09-09)
  - [x] 무효화는 `/projects/<slug>` **서브트리**다 — `declaredBaseLocale` 소비자가 셋이고(이 화면 ·
      번역 배너 · **설정의 워크플로 YAML**) 경로를 하나씩 나열하면 넷째가 조용히 빠진다
      (POSTMORTEM 2026-09-09). **실물로 셋 다 확인했다**: 저장하면 세 화면이 함께 새 값을 보이고
      되돌리면 함께 사라진다
  - [x] **orphaned 갈래를 실물로 확인했다** (dev 로케일 행 하나를 뒤집었다 되돌렸다) — 맨 뒤로 정렬 ·
      배경 없는 danger 배지 · 진행률 유지 · **셀렉트에서 빠진다**
  - ⚠️ **워크플로 YAML은 설정에 그대로 뒀다**(§7.7 결정 4) — 대기 중 `base-locale:`을 박는 동작도
      유지한다. 그래서 설정 화면은 그 컬럼을 **읽기만** 하고 `basePending`도 계속 부른다
- [x] **6b-6 `/projects/:slug` Home** ✅ **프로덕션에 나갔다** (2026-09-09, PR #23 → `0d68d71` — `a9a455e` + `8c62bd9`).
      **착지점이다**(사용자 결정 2026-09-09).
  - [x] **다른 화면의 지표를 복제하지 않는다**(§7.7 결정 2) — `countUnpublished`·`loadKeys`를 **부르지
      않는다**(소스 스캔이 센다). 소유하는 것은 로케일별 진행률 대비와 최근 활동뿐이고, 진행률은
      6b-5의 `localeProgress`를 그대로 쓴다 — 다만 **orphaned 로케일을 뺀다**(그 열은 번역 화면에서
      disabled라 `?focus=` 링크가 편집할 수 없는 곳으로 데려간다)
  - [x] **착지 클릭을 셋으로 갚는다**(결정 1) — 진행률 행 전체가 `?focus=` 링크 · 활동의 편집 항목이
      `?ns=`+`?focus=` 링크 · primary [Open translations]
  - [x] 최근 활동은 지금 재료로만(`Translation.updatedAt`+`updatedBy` · `lastCommitAt` ·
      `lastPublishedAt`+`lastPrUrl`) — **`logs`는 7단계 `SyncRun`의 소비자**다 (§6). ⚠️ `limit`은
      **병합 뒤에** 적용된다(편집만 먼저 자르면 push·publish가 항상 밀려난다) · 동시각 정렬이
      **결정적**이다(같은 DB 상태가 같은 화면을 내야 한다)
  - [x] **사이드바 카운트를 달지 않았다**(결정 5)
  - [x] ⚠️ **`saveTranslation`의 무효화를 서브트리로 넓혔다** — 그 행을 읽는 화면이 셋이 됐다(번역 ·
      로케일 진행률 · Home). POSTMORTEM 2026-09-09가 6b-5 때 이 자리를 이름으로 예고했다
  - [x] ⚠️ **사이드바 활성 판정이 축에서 항목으로 옮겨졌다** — `/projects/<slug>`가 그 프로젝트의 모든
      하위 라우트의 접두라, 옛 규칙("프로젝트 축이면 접두")이면 어디서나 Home이 선택돼 보였다
      (6b-4 code-review ⚪2가 예고한 자리)
  - [x] ⚠️ **실물이 프로덕션 버그를 잡았다** (`bf7e00f`) — `DropdownMenuItem`이 `asChild` 자식 옆에
      형제를 붙여 **프로젝트 스위처를 한 번 열면 셸이 죽었다.** `add099a`(6a ship 2)부터 프로덕션에
      있었고 게이트 셋·리뷰·QA 세 라운드·6b-4의 실물 라운드가 전부 지나갔다 (POSTMORTEM 2026-09-09)
  - ⚠️ **번호가 실행 순서다** (2026-09-08 교체). 그 전에는 base 변경이 6b-2, 멤버 화면이 6b-3이었는데
    base 변경은 design §3.13을 다시 써야 착수할 수 있어 그대로 두면 **뒷번호를 먼저 하게 된다.** 이 목록도
    6b-2 → 6b-4 → 6b-3 순으로 어긋나 있었다. **이 날짜 이전 문서·PR 본문의 "6b-2"는 base 변경이다.**
- [x] ~~**"GitHub 계정" 섹션을 사용자 수준 화면으로**~~ ✅ **닫혔다** (2026-09-07 리뷰 🟡9 — 4단계
      code-review 🟡3이 6단계로 미뤘던 것을 앞당겼다). 연결은 5단계가 이미 사용자 수준으로 옮겼고
      (`startGithubConnectForUser`), **해제도 `projects/actions.ts`의 `disconnectGithub`(인가
      `requireUser`, 인자 없음)로 갔다.** `/projects`에 계정 섹션이 붙어 프로젝트가 없는 사용자도
      도달한다 — 핸들을 위해 GitHub을 부르지는 않는다(행의 존재만 읽는다).
      ⚠️ **미룬 사유가 낡아 있었다**: "OWNER 강등 경로가 실사용에 없다"였는데, 5단계가 연결을 사용자
      수준으로 열면서 **프로젝트를 하나도 안 만든 사용자**가 같은 잠금에 걸리는 경로가 새로 생겼다 —
      그 사람에게는 설정 화면이 아예 없다. `Account`는 사용자 소유라 게이트가 `requireUser`인 것이
      원래 맞았다
- [x] ~~**MVP §10 미결 둘 중 하나**~~ ✅ **답했다** (2026-09-08, 6a T3): **push가 `updatedBy`를 비운다**
      (`applyPush`의 `ON CONFLICT … "updatedBy" = NULL`). strict에서 덮인 값의 저자는 리포이므로 사람 이름이
      남는 쪽이 거짓이었고, **미배포 집계가 그 조건 위에 선다** — `updatedAt`만 보면 code push 직후 903키
      전부가 "안 보낸 편집"이 된다. 남은 하나(orphaned 로케일 화면)는 T7이 확정했다 — 바로 아래 항목이다.
- [x] **MVP §10 미결 둘을 여기서 답한다** — ✅ **둘 다 답했다.** orphaned 로케일은 **열 유지 + 헤더
      `Badge danger` + 셀 `disabled` + placeholder로 확정했다** (2026-09-08, ship 3 — 2026-09-06 임시안이
      그대로 맞았다: 열을 숨기면 로케일이 사라진 것을 편집자가 알 길이 없고, 편집을 허용하면 `updatedAt`만
      올라 pull이 헛돈다). ~~덮인 셀의 `updatedBy`~~ ✅ **답했다** (2026-09-08,
      6a T3): **push가 비운다**(`applyPush`의 `ON CONFLICT … "updatedBy" = NULL`). strict에서 덮인 값의 저자는
      리포이므로 사람 이름이 남는 쪽이 거짓이었다. **미배포 집계가 그 조건 위에 선다** — `updatedAt`만 보면
      push가 전 행의 시각을 올려 code push 직후 903키 전부가 "안 보낸 편집"이 된다.
      ⚠️ **파생 항목 하나는 먼저 닫혔다** (2026-09-07, malmoi#3): 셀 메타가 `User.id` cuid를 원문으로
      찍던 것은 `loadActors`+`actorLabel`이 이름으로 바꿨다 — **화면 재작성과 독립적인 데이터층이라
      6단계를 기다리지 않았다.** 여기 남은 것은 **"덮인 값에 편집자 이름이 남아 화면이 거짓을 말한다"**
      쪽이고, 이름이 사람으로 보이게 된 만큼 그 거짓이 더 잘 읽힌다
- [x] ~~**편집 손실 창 배너**~~ ✅ **ship 3** (2026-09-08, T7 — `components/translations/edit-loss-banner.tsx`. 닫기 키가 `lastPulledAt`이라 다음 Publish 뒤 다시 보인다. MVP §3.1이 감수한 대가를 편집자가 보는 자리에 처음으로 적었다)
- [x] ~~미배포 변경 수 · Publish Server Action · PR 상태와 링크 · **버린 값 표시**(`warnings`)~~ ✅ **ship 3** (2026-09-08, T7): `countUnpublished` → 버튼 라벨·배너 · `PublishButton`/`PublishResult`가 문구 다섯·tone 넷을 하나의 `Alert`로 · `Project.lastPublishedAt`·`lastPrUrl`이 "Last sent … · View what was sent"를 새로고침 뒤에도 남긴다 · `warnings`는 `<details>`에 **파일 목록**으로 편다(건수만으로는 행동할 수 없다)

완료 게이트: 변경 없음 / 새 PR / 기존 PR 갱신 / 부분 기록 불가 / 실패가 **서로 다른 상태**다 /
PR 생성과 머지를 같은 완료로 표시하지 않는다 / 같은 DB 상태의 반복 Publish가 새 커밋을 만들지 않는다.

### 7단계 — 운영 안전성 ✅ → `features/sync-runs/`

✅ **배송 셋이 프로덕션까지 갔다** (2026-09-10, PR [#26](https://github.com/SinhyeokKang/malmoi/pull/26) →
`d0e8688`): ship 1 순수 판정 · ship 2 테이블과 껍데기(마이그레이션 `_add_sync_run`) · ship 3 화면.
✅ **T10 실물 검증도 같은 날 끝났다** — 완료 게이트 셋이 전부 실물로 닫혔다(아래).

- [x] ~~`SyncRun` — type · status · idempotencyKey · requestedBy · errorCode~~ ✅ **ship 2**
  - ⚠️ **`type`·`idempotencyKey`는 안 만들었다.** 지금 두 진입점 중 **키를 만들 주체가 없다** —
    cron은 하루 한 번이고 UI는 클릭이다. 동시성은 `Project` 행 잠금이 막고, 둘은 **push를 이
    테이블에 넣을 때** 의미가 생긴다(같은 커밋의 Re-run이 그 키다). 그날 additive로 붙인다 —
    "확장성을 위한 선반영은 그 자체가 결함이다"(CLAUDE.md). 아래 후속 목록에 있다
- [x] ~~**프로젝트당 동일 종류 실행은 하나**~~ ✅ **ship 2** — `SELECT … FOR UPDATE`로 `Project` 행을
      잠그고 판정·stale 닫기·행 생성을 한 트랜잭션에서 한다 (ARCHITECTURE §5.6.1). 부분 유니크
      인덱스도 CAS 컬럼도 쓰지 않는다
- [x] ~~Publish 동시성 계약 — 실패는 `lastPulledAt`을 전진시키지 않음~~ ✅ **ship 2** — 껍데기가
      `Project` 컬럼을 **아예 안 쓴다**. `lib/pull/run.ts`가 이미 하던 것을 감싸면서 잃지 않는 것이
      조건이었고, `sync-run.test.ts`가 껍데기 층에서 다시 건다
- [ ] 로케일 파일이 사라지면 `needs_configuration` — **자동 재탐지하지 않는다** (§7.3의 연장)
  - ⚠️ **후속으로 옮겼다** (2026-09-10). 별도 상태 축이고 그것을 세우는 화면이 따로 필요하다 —
    `SyncRun`의 소비자가 아니라 **탐지의 소비자**라 이 단계에 묶일 이유가 없었다
- [x] ~~고정 제한 — 사용자당 프로젝트 3 / 프로젝트당 멤버 10 / 동시 sync 1 / Publish 최소 간격 30초~~
      ✅ **ship 1·2** — `MEMBER_LIMIT`(`lib/auth/invitation.ts`, `createInvitation`의 **잠금 안에서**
      강제) · `PUBLISH_MIN_INTERVAL_SECONDS`(`lib/sync/plan.ts`)
  - ⚠️ **사용자당 3개는 5단계에서 먼저 걸었다** (`PROJECT_LIMIT`, 자율 가입을 여는 대가다).
    **분자는 OWNER 행이고 보관은 그 슬롯을 비운다** — 삭제가 비범위라 그것이 슬롯을 되찾는 유일한 길이다
  - ⚠️ **최소 간격은 cron에 안 건다.** 하루 1회라 의미가 없고, 거기 걸면 **야간 실행이 조용히 안 도는**
    경로가 생긴다 (design §1.1)
- [x] ~~**프로젝트 보관 (`active → archived`)**~~ ✅ **ship 2·3** — `Project.archivedAt` 하나이고
      **상태 컬럼이 아니다**(§7.5가 그것을 이미 정했다). 거부는 `planProjectAccess`의 갈래 하나라
      페이지·Action 전부가 한 자리에서 막힌다
  - ⚠️ **목록에서 숨기지 않는다** — 이 줄의 원래 서술("목록에서 숨김")을 **뒤집었다**: 숨기면 OWNER가
    되돌릴 링크에 도달할 길이 없어져 보관이 편도가 된다. 배지로 남기고 `project:settings`만 통과시킨다
- [x] ~~오류 분류 — 안정적 내부 code + 사용자용 설명 + 재시도 가능 여부~~ ✅ **ship 1** —
      `AppError`에 선택 `code`가 붙고 **던지는 자리**가 그것을 든다(문자열 매칭이 아니다).
      `classifyFailure`는 그 필드를 안 본다 — 축이 다르다 (ARCHITECTURE §5.6.3)
- [x] ~~**`/projects/:slug/logs` 화면**~~ ✅ **ship 3** — 게이트가 `translation:write`다(OWNER 전용이
      아니다: "내가 보낸 게 갔나"를 묻는 사람이 번역자다). 서버 `?cursor=` + "Older" 하나라 클라이언트
      상태가 0이다
  - ⚠️ **6b-6 Home의 요약 블록은 아직 `Translation`을 읽는다** — 그것을 `SyncRun`으로 갈아타는 것은
    후속이다(아래). 지금 갈아타면 "사람의 편집"과 "실행 이력"이 한 목록에서 섞인다

완료 게이트: Publish 연속 클릭이 커밋·PR을 한 번만 만든다 / 실패한 sync가 마지막 성공 상태를 덮지
않는다 / 프로세스 중단이 영구 `running`을 남기지 않는다.
✅ **앞의 것을 실물로 닫았다** (2026-09-10 프로덕션 — `features/sync-runs/tasks.md` T10): 두 탭을 **11ms
간격**으로 눌렀고 실행이 6.2초였는데 **`SyncRun` 행이 하나**, PR 커밋 **1개**, sync 브랜치 head가 한 번만
움직였다. 거부된 쪽은 행이 없고 화면에 "Already sending"(tone `info`)이 떴다.
⚠️ **자동 테스트로는 원리적으로 못 닫는다** — 하네스의 `$transaction`엔 직렬화가 없고 `$executeRaw`가
no-op이라(POSTMORTEM 2026-09-05) 거기서 고정하는 것은 **배선**(잠금 SQL이 행 생성보다 앞 · GitHub이
트랜잭션 밖)까지다. 그래서 이 줄의 근거는 실물이고, 다음에 이 계약을 건드리면 **다시 실물로 재야 한다.**

**후속으로 남긴 것**: `Home`의 최근 활동을 `SyncRun`으로 · push를 `SyncRun`에 넣기(그때 `type`·
`idempotencyKey`가 의미를 갖는다) · `needs_configuration` · `SyncRun` 보존 기간(행이 쌓이는 속도를
한 달 관측한 뒤).

### 8단계 — UI 재작성 (Figma) ⬜ → `features/ui-rework/`

**2026-09-09 사용자 결정.** 6단계가 화면 열 개를 한 디자인 시스템 위에 세웠고, 그 위에서 **시안이
새로 그려지는 중이다**(Figma `cuMNHY0Cn5ei9Szjqfz0tm` node `212-937`, 번역 화면 하나). **폴리싱이
아니라 재작성이다** — 아래 첫 항목이 표의 축을 바꾸기 때문이다.

⚠️ **시안은 미확정이고 이 절은 지금 "구상 기록"이다** (2026-09-09). 아래는 번역 화면 시안 하나에서
읽은 것이라, 나머지 아홉 화면은 그려지지 않았다. **`/feature`로 구체화하는 것은 7단계를 마친 뒤**이고,
그때까지 여기 항목들은 **결정이 아니라 그때 답해야 할 질문 목록**이다.

⚠️ **7단계보다 앞이 아니라 뒤이고, 9단계보다 앞이다.** 뒤인 이유는 `logs`가 없는 라우트라 시안에
그릴 대상이 아직 없어서이고, 앞인 이유는 **9단계 산출물이 UI에 직접 의존해서다**(온보딩 GIF·공개
데모·스크린샷). 순서를 뒤집으면 그 단계를 두 번 한다.

- [ ] **번역 표의 축이 바뀐다 — 이 단계의 크기를 정하는 항목이다.** 지금은 `| Key | en | ko | fr |`로
      **로케일이 열**인데 시안은 키가 왼쪽 셀 하나이고 **로케일이 행으로 쌓인다.** `filterRows` ·
      `namespaceCounts` · `localeProgress` · 셀 컴포넌트 · `?focus=` 계약이 전부 다시 정의된다
  - ⚠️ **행 수가 3배다** (903키 × 3로케일 = 2,709행). 2026-09-09의 리전 변경이 고친 것은 **서버
        시간**이고 DOM 노드 수는 별개다 — `?ns=*`에서 가상화 판정이 다시 열릴 수 있다 (CLAUDE.md 가상화 절)
- [ ] 🔒 **`?focus=`의 뜻을 다시 정한다.** 지금은 "어느 로케일 열을 기준으로 집계·필터하나"인데
      로케일이 항상 다 보이면 그 개념이 없다. 시안의 `Select locales`는 **다중 선택 필터**로 보이고,
      그러면 `defaultNamespace`(pending>0인 첫 ns)의 기준도 함께 바뀐다
- [ ] 🔒 **사이드바 카운트 배지** (Projects 3 · Translations 1134 · Locales 7 · Members 4).
      ⚠️ **§7.7이 거절한 결정이다** — "카운트 넷은 모든 화면에 왕복을 더한다". 근거의 절반은
      2026-09-09에 사라졌지만(홉 단가 375ms → 수십 ms) §7.7이 남긴 더 값싼 답(`loadMemberships`에
      **서브쿼리로 붙이면 왕복 +0**)이 여전히 유효하다. 뒤집으려면 그 답을 먼저 쓴다
- [ ] 네임스페이스가 **왼쪽 패널 → 드롭다운 + 본문 섹션 헤딩**으로 간다. `?ns=` 단일 선택과 `?ns=*`의
      계약이 바뀌고 `entry-points.test.ts`가 `lib/routes.ts`와 대조하는 URL 키가 따라온다
- [ ] **top bar가 사라진다** — 아바타가 앱 최상단 우측으로 가고 `components/shell/top-bar.tsx`가 없어진다.
      ⚠️ **셸 루트의 `h-svh overflow-hidden`은 유지한다** — `min-h-svh`로 돌아가면 malmoi#13이 재발한다
- [ ] 표면이 **회색 배경 + 흰 카드**로 바뀐다 → DESIGN §2 토큰과 mono 표면 불변식을 다시 그린다
- [ ] **오른쪽 "project global panel" — 구상은 확정, 시안은 미확정** (2026-09-09 사용자).
      **싱크 · Publish · diff를 관리하고 프로젝트 축의 모든 하위 페이지에 존재한다.** 시안 어디에도
      Publish 버튼이 없는 이유가 이것이다 — 결과 Alert · 편집 손실 배너 · 미배포 카운트가 통째로
      여기로 옮겨간다. **자리가 잘못돼 있던 것을 고치는 쪽이다**: 편집 손실 경고와 미배포 카운트는
      프로젝트 전역 상태인데 지금은 번역 화면 안에만 있어서, Home에서 "안 보낸 편집 N건"을 보고도
      거기서 보낼 수 없다
  - ⚠️ **diff는 UI가 아니라 새 서버 능력이다.** 지금 렌더는 `runPull` 안에서만 일어나고 2층(ref·트리·
        blob)을 돈다 — GitHub 호출이 파일 수만큼이다. **커밋 없이 렌더만 하는 경로**를 새로 내야 하고,
        **접힌 상태에서는 아무것도 부르지 않고 펼칠 때만 부르는 것이 필수 조건**이다(패널이 전 페이지에
        있으므로 그러지 않으면 모든 페이지가 GitHub 왕복을 문다)
  - ⚠️ **diff는 읽기 전용이고 되돌아가는 링크가 있어야 한다.** 파일 내용은 DB에서 결정적으로 나오고
        사용자가 고칠 수 있는 지점은 번역 셀뿐이다 — 보여만 주고 그 키·그 로케일로 가는 길이 없으면
        막다른 화면이 된다
  - ⚠️ **"모든 페이지에 있다"는 모든 페이지에 왕복이 붙는다는 뜻이다** — 아래 카운트 배지 항목과 같은
        축이고 같은 답(기존 쿼리에 서브쿼리로 얹기)을 먼저 쓴다
  - ⚠️ **셸이 이걸 못 든다.** `app/(edit)/layout.tsx`는 `[slug]` params를 못 받는다 — breadcrumb과
        Publish 버튼이 지금 셸에 없는 이유가 정확히 그것이다. **`app/(edit)/projects/[slug]/layout.tsx`를
        새로 만들어야 성립한다**(프로젝트 축 공통 배선이 설 자리가 생기는 것이 부수효과다)
  - 🔒 **7단계 `logs`와의 경계.** 둘 다 싱크를 다룬다. 제안은 **패널 = 지금 상태 + 행동**(무엇이 안
        갔나 · 보내면 무엇이 바뀌나 · 보내기) / **`logs` = 과거 이력**(언제 무엇이 갔고 무엇이
        실패했나). 안 그으면 `logs`가 패널의 열등한 사본이 된다
- [ ] 🔒 **Help 항목의 목적지.** 지금 그 문서가 없다
- [ ] ⚠️ **로케일 국기 아이콘은 매핑이 원리적으로 실패한다** — 언어와 국가가 1:1이 아니다(시안의
      `en`은 영국 국기다). `zh-CN`/`zh-TW`, 국가가 없는 `ar`, 그리고 **리포에서 오는 코드는 임의
      문자열**이다. **매핑 실패 시 무엇을 그리는가가 계약**이고 그것을 먼저 정한다

완료 게이트: 화면 열 개가 시안과 같은 골격이다 / 표 축 변경 뒤에도 `?ns=*`의 첫 착지가 2초 안이다 /
`entry-points.test.ts`·`focus-ring.test.ts`·`client-graph.test.ts`가 새 구조에서 green이다.

### 9단계 — 포트폴리오 마감 ⬜

- [ ] 공개 데모 — **읽기 전용 샘플 프로젝트**, 실제 왕복은 폐기 가능한 데모 리포로
- [ ] 온보딩 GIF, 아키텍처 다이어그램, 위협 모델 요약
- [ ] POSTMORTEM 3~5건을 문제→원인→**구조적 예방**으로 정리
- [ ] 지원 포맷과 **의도적 비범위** 명시

완료 게이트: 방문자가 로그인 없이 문제와 차별점을 이해한다 / 로그인한 평가자가 샘플 리포로 첫
왕복을 완료한다.

## 9. 불변식 — 구현 내내 확인한다

**앞의 넷은 MVP에서 그대로 이어진다. 뒤의 여섯이 SaaS에서 새로 생긴다.**

1. 번역 값은 DB, 소스 키와 로케일 존재 여부는 리포가 정본이다.
2. push 시점 외에는 리포 값과 DB 값을 비교해 **승자를 고르지 않는다**.
3. 키와 번역을 **삭제하지 않고** 비활성으로 보존한다.
4. 같은 DB 상태와 같은 원본 구조는 **같은 바이트**를 만든다.
5. 프로젝트를 식별하는 모든 DB 쿼리는 **인가된 `projectId`로 제한**한다.
6. GitHub 사용자 OAuth와 App installation token의 **역할을 섞지 않는다**.
7. 로그인 provider가 아니라 **`ProjectMember`가 권한을 결정**한다.
8. **`ready`는 설정 저장이 아니라 최초 적재 성공**으로 판정한다.
9. **버린 값을 성공으로 숨기지 않는다** — 실패한 sync는 마지막 성공 상태를 전진시키지 않는다.
   ⚠️ **화면에 닿는 것까지가 이 불변식이다** (2026-09-07 추가, POSTMORTEM 2026-09-07): Server Action의
   결과를 인라인으로 보이는 컴포넌트는 **그 Action의 `revalidatePath`가 바꾸는 조건부 분기 안에 있어서는
   안 된다.** 실제로 `revalidatePath`가 readiness를 `ready`로 바꾸자 재시도 컴포넌트를 감싼 분기가 거짓이
   되어 "M건을 읽지 못했어요"가 한 프레임도 남지 않았다 — 판정은 옳았고 전달이 사라졌다.

10. **리포에 쓰는 경로는 서버가 정한다** — 외부 페이로드(`/api/push`)가 보낸 로케일 코드·
    `pathTemplate`은 **경로 조각**이고, 값이 아니라 경로로 취급해 검증한다 (2026-09-09 추가,
    sec-audit 발견 2). ⚠️ **`..`가 없어도 성립한다**: `pathTemplate: "{locale}"` +
    `locales: [".github/workflows/pwn"]`이면 설치 토큰이 그 워크플로를 커밋하고, 그 브랜치 push가
    **대상 리포의 secret과 함께** 그것을 실행시킨다. 판정은 `lib/locale-code.ts`의 잎 함수 둘이고
    **두 층에 건다** — 스키마 경계는 새 값을, `resolveLocalePaths`는 **경계가 서기 전에 저장된
    행**을 막는다(야간 cron이 읽는 것이 그 행이다).

**판정을 어디에 두는가도 불변식에 붙는다** (§5.2의 연장, 2026-09-07): 판정은 순수 함수여야 하고,
**클라이언트가 읽는 판정은 잎 모듈이어야 한다.** `lib/onboarding/message.ts`를 클라이언트 컴포넌트가
읽으면서 `slug` → `lib/pull/trigger` → `lib/adapters` → `ts-morph`로 **7.2MB 청크**가 붙었고, 판정을
`lib/pull/ref-slug.ts`로 내려 끊었다. 상시 검사는 `components/__tests__/client-graph.test.ts`다.

## 10. 아직 안 정한 것

- **UI를 ko로 여는 시점.** 6a가 UI 문자열을 영어 단일로 모았고(`messages/en.tsx`), 여는 길은 이미
  좁혀 뒀다 — `messages/ko.tsx`를 `satisfies Messages`로 만들고 `lib/i18n/index.ts`의 `m`을 상수에서
  `getMessages(locale)`(서버) + provider(클라이언트)로 바꾸면 된다. **소비자의 import 자리는 안 바뀐다.**
  안 정한 것은 **언제 여는가**와 **locale을 무엇이 정하는가**(사용자 설정 / `Accept-Language` / 프로젝트
  속성)다. 이 도구를 이 리포 자신에 붙이는 8단계가 그 답을 요구한다.

- ~~**Workflows 권한을 요구할 것인가**~~ → ✅ **요구하지 않는다** (2026-09-07, 5단계). 연동 PR을 자동으로
  내지 않고 **복사용 YAML**을 낸다. 근거는 신뢰 비용과 권한 면적 둘이다 — 설치 화면의 "워크플로 파일을
  수정합니다"가 비개발자에게 가장 무거운 문장이고, 그 권한은 리포의 CI 정의를 통째로 바꿀 수 있다.
  ⚠️ **"권한을 더하면 재승인 대기 중 기존 설치의 pull이 죽는다"는 미실측이라 근거로 쓰지 않았다** —
  GitHub은 승인 전까지 옛 권한으로 계속 동작하는 것으로 알려져 있다
- **`AuditEvent`를 만드는 시점** (§6) — "누가 언제 뭘 했는지"를 못 찾는 상황이 실제로 나올 때
- **한 리포에 프로젝트가 둘일 때 Actions secret 배선** (2026-09-07, 5단계 T8이 남겼다) — 토큰이
  프로젝트를 정하므로 `PUSH_TOKEN` secret 하나로 둘을 먹일 수 없다. 워크플로에 **스텝 둘 + secret 둘**이
  필요하고, prod에 그 모양이 실재한다(`i18n-format-check` → `format-check-code`·`format-check-yaml` —
  §7.1의 "한 리포에 표면이 둘"이다). **그 리포에 워크플로를 붙이는 시점에 결정한다** — 지금 정하면
  실제 필요 없는 이름 규칙을 먼저 박는다
  - ✅ **그 모양에서 이미 닫은 것 둘** (2026-09-07 리뷰): ① `concurrency.group`에 slug가 들어간다 —
    `github.ref`만 쓰면 같은 커밋의 두 스텝이 같은 그룹에서 `cancel-in-progress`로 서로를 죽이고
    **그 표면은 영영 적재되지 않는데 취소는 실패로 보이지 않는다.** ② 스텝 둘이 서로의 포맷을 보내는
    오설정은 `checkFormat`이 409로 막는다(§7.8) — 전에는 조용히 키를 전부 orphan시켰다


## 11. sec-audit-2 보안 보강 (2026-09-10, 배포 전)

- **쓰기 대상 고정**: `Project.repositoryId` nullable 컬럼을 먼저 추가한다. 생성·OWNER 재연결에서
  GitHub의 ID를 저장하고, installation 토큰도 그 ID에만 한정한다. 이름이 같은 다른 리포나 ID가 없는
  기존 프로젝트의 Publish는 거부한다. 기존 프로젝트는 OWNER가 재연결해야 한다.
- **첫 적재 경계**: 탐지·확정·적재에 파일 200개 / 파일당 2,000,000바이트 / 합계 10,000,000바이트를
  적용한다. 메타데이터 사전 검사와 실제 UTF-8 본문 검사를 함께 하며 예산 초과는 `resource-limit`이다.
  YAML 구조 중첩 100, JSON·코드 리터럴의 구분자 깊이를 검사하고 적재 직전 PushPayload도 검증한다.
  코드 구문 검사는 완전한 실행 시간 격리를 보장하지 않는다.
- **Publish 정합성**: 번역 값과 완료 기준 최대 수정 시각은 같은 RepeatableRead 스냅샷이다.
  `SyncRun` 실행 잠금이 막는 중복 실행과 구분한다.
- **후속 정책**: 리포 연결자 admin 권한 요구(#37), 재인증·전체 세션 회수 UI(#38)는 이번 패치에
  포함하지 않는다. 암호화 전환과 기존 로그인 토큰 정리는 credential-storage에서 이어간다.

자동 검증과 실제 DB/OAuth/GitHub 검증의 구분은
[sec-audit-2 작업 기록](features/sec-audit-2/tasks.md)에 남긴다. 이 절은 프로덕션 반영 선언이 아니다.
