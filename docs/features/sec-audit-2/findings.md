# sec-audit-2 — 보안 집중 감사

**2026-09-10 · 추가 발견 7건(🔴 3 · 🟡 4), 방어·정책 개선 5건.**

우선순위는 **만료 세션의 OAuth 연결 우회(31) → 초대 취소 경합(29) → Publish 스냅샷 불일치(32)**다.
세 건 모두 기존 검사가 있는 것처럼 보이지만, 실제로 쓰는 시점·경로에서는 그 검사가 성립하지 않는다.

이 문서는 감사 결과이지 구현 승인이나 완료 보고가 아니다. **실행 재현·테스트·빌드는 하지 않았다.**
DB 권한과 세션 개수만 읽기 전용으로 실측했다. 코드 경로가 성립한다는 판단과 프로덕션에서 공격이
실제로 발생했다는 판단은 구별한다. 이번 감사에서 침해 발생 여부는 조사하지 않았다.

## 0. 기준과 범위

- 기준: [CLAUDE.md](../../../CLAUDE.md), [SAAS.md](../../SAAS.md),
  [MVP.md](../../MVP.md), [ARCHITECTURE.md](../../ARCHITECTURE.md),
  [POSTMORTEM.md](../../POSTMORTEM.md).
- 이전 감사: [sec-audit/findings.md](../sec-audit/findings.md),
  [tenant-auth/audit-2026-09-06-codex.md](../tenant-auth/audit-2026-09-06-codex.md).
- 이전 보고서의 번호 1~28을 보존해 **29번부터 잇는다**. 이번 대화에서 먼저 보고한 1·2번은
  이 문서의 **29·30번**이다. 별도 `tasks.md`를 만들거나 구현 순서를 확정하지 않았다.
- 인증·세션·초대, 인가·테넌트 격리, GitHub 연결·토큰, push/pull, 어댑터·파일 입력,
  공급망 설정을 전문 에이전트 3개와 메인 스레드가 나눠 읽고 교차 검토했다.
- POSTMORTEM 실제 항목은 48개다. 보안 관련 재발 패턴을 재검했으며,
  **48개 전체의 비보안 동작·성능·UI 회귀까지 검증한 일반 감사는 아니다.**
- 첫 판독 기준은 `f6688d1`. 감사 중 다른 작업이 진행돼 문서 작성 시 기준은
  `f0db7f4d4577ce8e4e16f4e555988c63dcfeb522`로 바뀌었다. 주요 발견 경로를 다시 대조했다.
  `pull/run.ts`·`trigger.ts`의 오류 코드 추가는 발견의 원인인 조회·완료 처리·동시성에 영향을 주지 않았다.
  별도 진행 중인 `sync-runs` 작업은 완료된 방어선으로 계산하지 않았다.
- 아래 줄 번호는 판독 당시 기준이다. 이후 변경되면 함수 이름과 함께 찾는다.

### 증거의 구분

| 구분 | 이번에 한 일 | 의미 |
|---|---|---|
| 정적 판독 | 앱·라이브러리·설치된 Auth.js/Prisma adapter 소스와 호출 순서 대조 | 입력과 실행 순서에 따른 실패 경로를 확인했다. 실제 공격 성공을 측정한 것은 아니다 |
| 읽기 전용 실측 | prod·dev DB 메타데이터 및 세션 개수 조회 | 조회 당시 상태만 확인했다. 토큰·이메일·번역 본문은 출력하지 않았다 |
| 공식 문서 대조 | GitHub 리포 이름 재사용, PostgreSQL 격리 수준 | 플랫폼 동작의 근거다. 이 앱의 실물 재현을 대신하지 않는다 |
| 미수행 | HTTP 공격 재현, OAuth 왕복, 동시 DB 쓰기, GitHub 커밋·PR, 부하 시험, 의존성 advisory 재조회 | 이 범위의 통과를 주장하지 않는다 |

## 1. 발견 목록

| 번호 | 시급도 | 발견 | 주요 조건 |
|---|---|---|---|
| 29 | 🔴 | 취소·재발급이 먼저 끝난 초대도 이전 역할로 수락 | 수락과 취소·재발급의 경합 |
| 30 | 🟡 | 첫 적재가 push 페이로드 상한을 우회 | 자신의 연결 리포에 상한 초과 데이터 |
| 31 | 🔴 | 만료 세션이 OAuth 계정 추가 연결의 근거가 됨 | 과거 세션 토큰 유출 + 만료 행 잔존 |
| 32 | 🔴 | 보내지 않은 편집을 전송 완료로 기록 | Publish의 두 조회 사이에 편집 저장 |
| 33 | 🟡 | GitHub callback의 삭제·갱신에 소유자 조건 누락 | 같은 GitHub 계정을 두 말모이 사용자 사이에서 이전하는 경합 |
| 34 | 🟡 | 리포 이름 재사용을 다른 리포로 식별하지 못함 | 같은 설치의 원래 이름 재사용 + 쓰기 가능한 새 리포 |
| 35 | 🟡 | 글롭 예산이 긴 매칭 대상의 백트래킹을 막지 못함 | 연결 가능한 리포의 긴 경로 + 조작한 템플릿 |

### 29. 🔴 취소·재발급한 초대를 이전 역할로 수락한다

**근거:** [app/invite/actions.ts](../../../app/invite/actions.ts) `acceptInvitation`, 47·77~85행.
취소·회전은 [projects/actions.ts](../../../app/(edit)/projects/actions.ts) 127~151·199~201행.

수락 요청이 `now=t0`를 만든 뒤 프로젝트와 기존 멤버십을 조회한다. 최종 `updateMany`도
`expiresAt > t0`를 사용한다. 그 사이 OWNER가 취소하거나 새 초대를 발급해 옛 행의 만료를
`t1`로 당겨도 **`t0 < t1`이면 소비 조건이 여전히 참**이다.

**실패 순서:**

1. OWNER 초대의 수락 요청이 옛 초대와 역할을 읽고 `t0`를 저장한다.
2. 관리자가 그 초대를 취소하거나 EDITOR 초대로 재발급한다. 옛 행은 `expiresAt=t1`로 바뀌고 커밋된다.
3. 진행 중인 수락이 재개된다. `t1 > t0`이므로 옛 행을 소비하고 **OWNER 멤버십**을 만든다.

취소 응답이 먼저 성공한 경우에도 가입할 수 있다. 단순한 자연 만료에서도 조회 이후 만료되면
소비 시점의 만료를 반영하지 못한다. 무작위 초대 토큰 추측이나 이메일 대조 우회는 필요하지 않지만,
**해당 초대 토큰과 일치하는 사용자 신원은 필요하다.**

기존 tenant-auth 감사 #3은 소비 조건에 만료 검사가 없던 문제를 다뤘다. 현재는 검사가 추가됐지만
**비교 시각이 과거 값**이라 수정이 불완전하다. 기존 테스트의 만료 경합은 만료값을 과거 상수로
바꾸므로 위 `t0 < t1` 순서를 놓친다.

**수정 방향:** 조회 당시 `expiresAt`과의 일치도 소비 조건으로 확인하고, 자연 만료는 실제 소비 시점 기준으로 판정한다.

### 30. 🟡 첫 적재가 API의 데이터 크기 제한을 우회한다

**근거:** [lib/onboarding/ingest.ts](../../../lib/onboarding/ingest.ts) 68~81행,
[projects/actions.ts](../../../app/(edit)/projects/actions.ts) 627~629·771~789행,
[lib/push/plan.ts](../../../lib/push/plan.ts) `PushPayload`.

`/api/push`는 `PushPayload.safeParse`를 거치지만 첫 적재는
`buildPushPayload → applyPush`로 바로 간다. 타입을 맞춰 만드는 것은 Zod의 `.max()` 검증을
실행하는 것과 다르다. 내려받을 파일의 개수·합계 바이트 제한도 없다.

**구체 입력:** 자신의 `locales/en.json`, `locales/ko.json`에 **20,001개 키 또는 10,001자 번역**을
넣고 프로젝트 생성 → 첫 적재를 실행한다. 포맷 재탐지는 통과할 수 있고, API라면 거부되는
상한 초과 데이터가 이 경로에서는 DB 쓰기에 도달한다.

영향은 제한 밖 DB 쓰기·파싱·메모리 사용이다. 실제 장애를 일으키는 크기와 비용은 미측정이다.
GitHub에서 서버가 파일을 내려받으므로 Action 요청 본문 크기 제한만으로 막을 수 없다.

ARCHITECTURE §5.5.05는 첫 적재의 Zod 우회를 설명하지만, 리포 파일명과 pull의 경로 검사에
대한 설명이다. **파일명이 안전하다는 사실은 파일 내용의 양을 제한하지 않는다.**
파서 자체의 재귀 깊이와 blob 바이트 예산도 이 항목에 포함해 개선할 필요가 있다.

**수정 방향:** 첫 적재에도 공통 페이로드 상한을 적용하고, 다운로드·파싱 전에 파일 수와 바이트 예산을 제한한다.

### 31. 🔴 만료된 세션 토큰으로 로그인 수단을 추가할 수 있는 경로가 있다

**앱 근거:** [auth.ts](../../../auth.ts) 75·148행. 가공하지 않은 `PrismaAdapter`를 사용하고,
미등록 OAuth 계정이면 `signIn`에서 허용한다.

**설치 소스 근거:** `@auth/core@0.41.3`와 `@auth/prisma-adapter@2.11.3`.

- `@auth/core/lib/actions/callback/index.js:70`은 쿠키의 세션 토큰을 `handleLoginOrRegister`에 전달한다.
- `callback/handle-login.js:47~51`은 `getSessionAndUser()` 결과에 **`expires` 검사를 하지 않고** 사용자를 설정한다.
- PrismaAdapter의 `getSessionAndUser()`도 `sessionToken`으로 조회할 뿐 만료를 거르지 않는다.
- `handle-login.js:206~212`는 현재 사용자와 미등록 OAuth 계정이 있으면 그 사용자에 `linkAccount`한다.
- 만료 세션 검사·삭제는 별도 `actions/session.js` 경로에 있다. 위 callback의 선행 검사가 아니다.

**공격 전제:** 피해자의 세션 토큰이 과거에 유출됐고, 만료된 해당 행이 DB에 남아 있어야 한다.
이번 감사에서 토큰 유출 원인을 발견하거나 침해를 확인한 것은 아니다.

**실패 순서:**

1. 공격자가 자신의 미등록 Google/GitHub 계정으로 정상 OAuth 왕복을 시작한다.
2. callback 요청에 피해자의 만료 세션 토큰을 수동 Cookie로 보낸다.
3. callback은 그 토큰의 DB 행을 현재 사용자로 인정하고 공격자의 OAuth 계정을 피해 User에 연결한다.
4. 이후 옛 쿠키 없이 공격자 OAuth로 다시 로그인하면 새 유효 세션을 받을 수 있다.

브라우저가 만료 쿠키를 자동 삭제하는 것은 수동 Cookie 전송을 막지 않는다.
`allowDangerousEmailAccountLinking` 비활성화도 이 분기를 막지 않는다. 그 옵션은 **세션 없이
이메일 일치로 연결하는 분기**의 통제다. 여기서는 이메일이 같을 필요도 없다.

유효 세션을 잠시 탈취한 경우에도 같은 추가 연결로 접근을 지속할 수 있다.
`/account`는 로그인용 Account 목록·해제를 제공하지 않고 `disconnectGithub`는
`provider: "github-app"`만 지우므로 이 연결은 해당 버튼으로 회수되지 않는다.

**실측의 한계:** 조회 당시 prod·dev 모두 세션 2개 중 만료 행은 **0개**였다.
따라서 만료 행 전제가 현재 DB에서 충족됐다는 증거는 없다. 이는 소스 경로의 부재나 향후 안전을 뜻하지 않는다.
OAuth 왕복 공격은 실행하지 않았다.

SAAS의 OAuth 계정 통합 제외 정책과도 어긋난다. 첫 로그인과 달리 **로그인된 상태에서 새
provider를 추가하는 경로**는 라이브러리 기본 동작으로 열려 있다.

**수정 방향:** 어댑터 조회 단계에서 만료 세션을 거부하고, 현 범위에서는 기존 User에 로그인용 Account를 추가하는 쓰기를 별도로 차단한다.

### 32. 🔴 Publish가 보내지 않은 편집을 완료 처리한다

**근거:** [lib/pull/load.ts](../../../lib/pull/load.ts) 41~65행,
[lib/pull/run.ts](../../../lib/pull/run.ts) `captured`·`saveLastPulledAt` 호출.

번역 값 조회와 `max(Translation.updatedAt)` 집계가 서로 다른 SQL이다.
`runPull`은 둘이 같은 스냅샷에서 왔다고 가정하고 집계 시각을 전송 완료 기준으로 저장한다.

**실패 순서:**

1. Publish가 번역값 **A**를 읽는다.
2. 번역자가 같은 셀을 **B**로 저장한다. 시각은 `tB`다.
3. Publish의 집계가 `tB`를 읽는다.
4. PR에는 A를 보내고 `lastPulledAt=tB`로 저장한다.
5. 추가 편집이 없으면 다음 Publish·Cron은 `no-edits`로 끝난다. B의 미배포 집계도 0이 된다.

DB의 B가 즉시 삭제되는 것은 아니다. 하지만 **전송되지 않았는데 전송 완료로 표시**되며,
추가 변경이 생길 때까지 자동 반영 대상에서 빠진다. 이는 strict push의 의도된 편집 손실 창과 별개다.
이 실패에는 공격자도, 두 Publish의 중복 실행도 필요하지 않다.

기존 `runPull` 테스트는 완성된 `PullState`를 주입하므로 로더 내부 두 조회 사이의 편집을 검사하지 않는다.
`captured`라는 변수 이름이 동일 스냅샷을 보장하지 않는다.

**수정 방향:** 값·로케일·완료 기준을 동일한 DB 스냅샷에서 읽는다. 여러 조회라면 `REPEATABLE READ` 등 격리 수준까지 명시해야 한다.

기본 `READ COMMITTED` 트랜잭션은 연속 SELECT가 다른 상태를 볼 수 있으므로, 단순히 트랜잭션으로
감싸는 것만으로는 충분하지 않다. [PostgreSQL 격리 수준 문서](https://www.postgresql.org/docs/current/transaction-iso.html)

### 33. 🟡 GitHub callback의 삭제·갱신에 소유자 조건이 없다

**근거:** [app/api/github/callback/route.ts](../../../app/api/github/callback/route.ts)
`linkAccount`, 102~129행.

조회에서는 소유자를 확인하지만 `already-linked`의 `update`와 `replace`의 `delete`는
`provider + providerAccountId`만 조건으로 사용한다. **쓰기 시점의 `userId` 조건이 없다.**

**실패 순서:** A의 callback이 자신의 GitHub 계정 G를 읽음 → 다른 요청이 A의 G 연결을 해제 →
B가 G를 연결 → 지연된 A callback이 재개해 **B 소유 행을 삭제**한다.
갱신 분기에서는 B 행의 토큰을 옛 A 요청의 토큰 결과로 덮을 수 있다.

같은 GitHub 계정을 두 말모이 사용자 사이에서 이전하는 좁은 경합이다. 임의 피해자의 GitHub 계정을
알아내거나 탈취하는 경로로 확대 해석하지 않는다.

기존 sec-audit #15가 `disconnectGithub`에서 고친 조회 후 PK 삭제 패턴이 callback에 남았다.
`data`에서 `userId`를 빼는 것만으로는 다른 소유자의 행을 삭제·갱신하는 문제를 막지 못한다.

**수정 방향:** 삭제·갱신 조건에 `userId`를 포함하고 영향 행 수를 확인해, 소유자가 바뀌면 기존 판정을 폐기한다.

### 34. 🟡 리포 이름 재사용을 다른 리포로 식별하지 못한다

**근거:** [prisma/schema.prisma](../../../prisma/schema.prisma) `Project`, 24~30행;
[lib/github.ts](../../../lib/github.ts) `probeRepo`, 74~81행;
[lib/pull/trigger.ts](../../../lib/pull/trigger.ts) `createClient`.

Project에는 `repoOwner`, `repoName`, `installationId`만 저장하고 GitHub repository ID는 저장하지 않는다.
`probeRepo`는 응답의 `id`를 버린다. 설치 ID는 리포 하나의 식별자가 아니다.

**조건부 실패 시나리오:**

1. 기존 private 리포 A의 이름을 변경한다.
2. 같은 조직에서 원래 이름으로 별도 리포 B를 만든다.
3. App이 All repositories로 설치돼 있거나 B에도 접근할 수 있고, B에 같은 기준 브랜치·로케일 구조가 있다.
4. 기존 프로젝트에 미전송 번역이 있으면 pull은 저장된 owner/name으로 B에 기존 DB 번역을 보낸다.

B가 public이면 원래 프로젝트의 번역이 공개될 수 있다. 이름과 설치가 같으므로 현재 건강성 판정도
다른 리포라는 사실을 가르지 못한다. 리포 이름 변경·생성 권한과 위 설치 조건이 필요하며,
실물 리포로 재현하지 않았다.

GitHub은 원래 이름을 새 리포에 재사용하면 옛 리포로의 redirect가 사라진다고 명시한다.
[GitHub 리포 이름 변경 문서](https://docs.github.com/en/repositories/creating-and-managing-repositories/renaming-a-repository)

**수정 방향:** 연결 시 불변 repository ID를 저장하고, 리포 쓰기 전에 현재 대상 ID와 대조한다.

### 35. 🟡 글롭 제한이 매칭 대상 길이의 백트래킹을 막지 못한다

**근거:** [lib/adapters/shared.ts](../../../lib/adapters/shared.ts) 32~62행,
[lib/onboarding/confirm.ts](../../../lib/onboarding/confirm.ts) 29~41행,
[projects/actions.ts](../../../app/(edit)/projects/actions.ts) `createProject`의 `templatePaths` 호출.

현재 예산은 양자 4개와 **템플릿** 200자다. 그러나 백트래킹 비용을 키우는 것은 **매칭 대상 경로**의
길이이기도 하다. `*` 네 개는 각각 `[^/]*`로 컴파일된다.

**구체 입력:** 허용되는 `****b.ts`와 `a`가 길게 반복된 뒤 `.ts`로 끝나는 리포 경로들.
불일치할 때 네 양자가 문자열을 나누는 여러 조합을 탐색하는 구조가 남는다.
`{locale}` 네 개도 `([^/]+)` 네 개가 되고, `looksLikeLocale` 검사는 정규식 실행 **뒤**라 보호하지 못한다.

프로젝트 확정 재탐지 전에 이 정규식이 실행되므로 공격 템플릿이 DB에 저장될 필요는 없다.
다만 사용자 인증과 리포 접근은 필요하다. **실제 런타임 지연·장애 임계점은 측정하지 않았으므로
서비스 장애가 재현됐다고 주장하지 않는다.** 기존 sec-audit #11의 완전한 해소로 보기 어려운 잔여다.

**수정 방향:** 실제 필요한 템플릿 문법으로 좁히거나 선형 매처를 사용해, 인접 양자의 조합 탐색 자체를 제거한다.

## 2. 방어·정책 개선

이 절은 위 확정 코드 결함과 별도다. 이미 예정됐거나 수용한 정책을 새 취약점처럼 다시 세지 않는다.

### 36. 프로젝트별 Publish 실행 직렬화 — 예정된 7단계에서 먼저 닫을 것

**근거:** [lib/pull/run.ts](../../../lib/pull/run.ts) `updateRefForce`와 완료 기록,
[lib/pull/load.ts](../../../lib/pull/load.ts) `saveLastPulledAt`.

동일 프로젝트의 Publish·Cron을 직렬화하는 방어가 현재 호출 경로에 없다.
새 실행이 브랜치를 갱신 → 옛 실행이 브랜치를 덮음 → 옛 실행 완료 기록 → 새 실행 완료 기록의 순서면,
**브랜치는 옛 값인데 완료 시각은 새 값**이 되어 다음 실행이 건너뛸 수 있다.

32번과 증상은 비슷하지만 원인은 별개다. 동일 DB 스냅샷만으로 여러 외부 쓰기의 순서까지 고정되지 않는다.
SAAS 7단계가 이미 동시 sync 1을 예정했고 감사 중 `sync-runs` 구현이 진행 중이므로,
새 기능 요구로 세지 않고 **그 단계의 검증 조건**으로 남긴다.

**개선 방향:** 프로젝트별 실행권으로 GitHub 쓰기부터 완료 기록까지 직렬화한다.

### 37. 최초 리포 연결에 요구하는 권한을 명시적으로 강화

**근거:** [lib/github-connect/user.ts](../../../lib/github-connect/user.ts) `listInstallationRepos`는
`full_name`만 반환한다. [projects/actions.ts](../../../app/(edit)/projects/actions.ts)의
프로젝트 생성은 그 리포 접근 확인 후 생성자를 OWNER로 만든다.

현재 기준은 리포가 사용자에게 **보이는가**다. 읽기 전용 협력자도 조건을 만족하면 프로젝트 OWNER가
되어 installation 토큰으로 upstream 브랜치에 번역을 쓰는 작업을 요청할 수 있다.
설치 토큰의 권한이 사용자 토큰보다 넓은 것이므로 단순한 토큰 분리만으로 해결되지 않는다.

이는 SAAS §5.4의 현행 접근 가능 정책에는 부합한다. **정책 변경이 필요한 개선**으로 분류한다.
GitHub 권한 회수와 말모이 ProjectMember 회수도 현재는 별개이므로, 퇴사·협업 종료 정책에 그 차이를 밝혀야 한다.

**개선 방향:** 최초 연결·재연결에는 리포 관리 권한 또는 관리자의 명시적 위임을 요구하고, 이후 번역 참여는 ProjectMember로 관리한다.

### 38. 모든 세션 회수 수단

**근거:** [account/page.tsx](../../../app/(edit)/account/page.tsx)의 `signOutAction`,
[auth.ts](../../../auth.ts)의 `maxAge: 24h`, `updateAge: 1h`.

현재 로그아웃은 현재 세션을 끝내며, 사용자가 자기 세션 전체를 회수할 기능은 없다.
24시간은 절대 수명이 아니라 활동에 따라 연장되는 수명이라 탈취자가 계속 사용하면 자연 만료에
맡길 수 없다. 31번을 막아도 사고 후 회수 수단은 별도다. 세션 탈취 발생을 관측한 것은 아니다.

**개선 방향:** 재인증을 거쳐 사용자의 모든 DB 세션을 삭제하는 기능을 제공한다.

### 39. 쓰지 않는 로그인용 OAuth 토큰은 보관하지 않기

**근거:** [auth.ts](../../../auth.ts)는 기본 PrismaAdapter를 사용한다.
설치된 adapter의 `linkAccount`는 전달받은 Account 데이터를 그대로 저장한다.

로그인용 `github`·`google` 토큰과 연결용 `github-app` 토큰은 용도가 다르다.
로그인 이후 API 호출에 쓰지 않는 access/refresh/id 토큰까지 남기면 DB 유출 시 노출 범위만 커진다.
기존 sec-audit #16의 평문 보관은 수용된 정책이므로 이를 곧바로 암호화 요구로 되살리지 않는다.

**개선 방향:** 로그인 후 필요 없는 토큰은 저장 대상에서 제외하고, 실제 사용하는 `github-app` 토큰과 구분한다.

### 40. 사용자당 GitHub App 연결 하나를 DB 쓰기에서도 강제

**근거:** [app/api/github/callback/route.ts](../../../app/api/github/callback/route.ts)
`linkAccount`의 `current` 조회와 create;
[lib/github-connect/token-store.ts](../../../lib/github-connect/token-store.ts) `readAccount`.

서로 다른 GitHub 계정을 연결하는 두 callback이 같은 사용자의 `current: null`을 동시에 읽으면
둘 다 생성될 수 있다. DB 키는 `(provider, providerAccountId)`라 이를 막지 않는다.
이후 `findFirst({ userId, provider: "github-app" })`가 어떤 연결을 고를지 정책과 어긋난다.
다른 사용자 권한을 얻는 경로는 확인하지 못했으며 같은 사용자 내부 연결의 무결성 개선이다.

**개선 방향:** 사용자 단위 잠금 뒤 현재 연결을 다시 조회하거나, `github-app`에 한정한 유일 제약으로 정책을 강제한다.

## 3. 읽기 전용 DB 실측

두 DB에서 `BEGIN READ ONLY`로 메타데이터와 집계만 읽었다. 사용자 데이터·시크릿을 출력하거나
행을 변경하지 않았다.

| 항목 | dev | prod |
|---|---|---|
| `anon`·`authenticated`의 public 테이블 GRANT | 0건 | 0건 |
| 같은 역할의 public 테이블·뷰 실효 권한 | 0건 | 0건 |
| 같은 역할의 public 함수 EXECUTE 권한 | 0건 | 0건 |
| public 일반 테이블 | 12개, RLS off | 12개, RLS off |
| 조회에 쓴 DIRECT_URL의 역할 | postgres, superuser false, bypassrls true | postgres, superuser false, bypassrls true |
| postgres의 public 기본 ACL | anon·authenticated 없음 | anon·authenticated 없음 |
| supabase_admin의 public 기본 ACL | anon·authenticated 남음 | anon·authenticated 남음 |
| 세션 전체 / 만료 행 | 2 / 0 | 2 / 0 |

현재 공개 역할이 테이블이나 public 함수를 통해 접근하는 경로는 권한 조회상 닫혀 있다.
**Supabase HTTP 데이터 API를 직접 호출한 검증은 아니다.**
`supabase_admin` 소유로 새 객체를 만드는 경로의 기본 권한과 postgres의 RLS 우회는 이전에 기록된
운영 위험으로 남는다. Vercel 런타임 DATABASE_URL의 실제 역할을 이번에 다시 읽어 확인한 것은 아니다.

## 4. 재검 결과와 한계

- 일반 페이지·Action의 ProjectMember 인가와 `projectId` 좁힘에서 새 IDOR 경로는 찾지 못했다.
- 멤버·초대 이메일은 서버에서 마스킹해 클라이언트로 전달한다. `loadActors`의 이메일도 서버에서
  표시 라벨로 바뀌며 원문 Map을 클라이언트 props로 전달하지 않는다.
- 세션 JSON은 허용 목록으로 구성하며 `sessionToken`을 포함하지 않는다.
- refresh 결과 쓰기는 `userId + provider + 이전 refresh_token` 조건을 사용한다.
  연결 해제 후 옛 refresh가 새 연결을 덮는 직접 경로는 찾지 못했다.
- 어댑터의 기존 프로토타입 대입 방어, CLI 심링크 제외, 문자열/바이트 비교 수정은 유지돼 있다.
- 설치된 YAML 파서의 `toJS`에는 기본 alias 상한이 있고, 자체 순회도 alias를 무제한 따라가지 않는다.
  반면 바이트·깊이 예산은 30번의 개선 대상이다.
- TS/JS 번역 값은 `quoteLiteral`을 거쳐 삽입된다. 이번에 새 코드 실행 주입 경로는 찾지 못했다.
- composite action은 자기 `github.action_path`에서 고정 lockfile로 설치한다.
  대상 리포의 package.json 설치 스크립트를 실행하는 경로는 찾지 못했다.
- 가변 태그의 SHA 고정, DB 최소권한 역할, CSP 강제 적용은 기존 결정·운영 조건을 다시 판단할 사항이다.
  원격 태그 보호·Vercel 설정·최신 advisory를 재조회하지 않았으므로 새 확정 취약점으로 세지 않았다.
- 회고에 관련 패턴이 있다는 사실이나 정적 검토에서 새 경로를 찾지 못했다는 사실은
  실제 배포의 공격 저항성을 보장하지 않는다. OAuth·DB 경합·ReDoS는 후속 재현 검증이 필요하다.

## 5. 결론

**발견: 🔴 3 · 🟡 4 = 7건. 별도 방어·정책 개선: 5건.**

기존 개선이 잘못된 것은 아니지만, 일부는 한 호출 경로나 조회 시점만 막았다.
후속 검증은 정상 결과만 확인하기보다 **조회 후 상태 변경**, **인증 경로를 우회하는 라이브러리 기본 동작**,
**같은 값이 다른 진입점으로 들어오는 경우**를 중심으로 잡아야 한다.

이 감사에서 만든 산출물은 이 보고서 하나다. 앱 코드·DB·원격 설정 수정, 빌드·테스트,
staging·커밋·푸시는 수행하지 않았다.

## 6. 후속 스펙 — 자격증명·회원 정보 저장 보호

[기능 스펙](../credential-storage/spec.md) · [기술 설계](../credential-storage/design.md) · [구현 태스크](../credential-storage/tasks.md)

세션은 해시 저장, GitHub App access/refresh 토큰은 AES-256-GCM 암호화,
재사용하지 않는 로그인 OAuth 토큰은 저장 제거로 구체화했다.
사용자는 출시 전이므로 기존 로그인 만료를 허용했다(2026-09-10).
GitHub 연결은 기존 토큰을 암호화해 유지한다. 사용자 요청으로 회원 이메일·이름·프로필 이미지 URL과
초대 이메일 암호화도 같은 전환에 포함했다. 이메일 조회·유일성은 별도 키의 HMAC 인덱스로 유지한다.

이것은 **구현 전 설계**다. 39번을 구현 범위로 포함하고, 31번의 만료 세션 검사와
33번의 소유자 조건부 쓰기를 관련 경계에서 검증한다. 암호화만으로 OAuth 계정 연결 정책이나
다른 감사 발견이 해결된 것으로 취급하지 않는다.
