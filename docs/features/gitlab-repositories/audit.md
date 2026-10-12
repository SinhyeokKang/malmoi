# GitLab repositories — 전체 감사 (2026-10-13)

대상: origin/dev `f1c31866`, 범위 `b7c58993..HEAD`. 차원별 원문은 이 문서 아래 "부록".
`pnpm test` green(859 files / 14393). GitLab 통합(격리 PG) 3파일 53 green. `pnpm smoke:gitlab` ok.

**🔴 0 · 🟡 22(중복 1 병합) · ⚪ 28**

이미 알려진 미완(상태만): 실제 GitLab CI 실측·태그 `malmoi-i18n-push-gitlab-v1`(OPERATIONS 절차상 **main 머지 뒤**에만 태그 가능 → 이 세션 불가), 셀프 호스팅 설치본 실측, 외부 실패 주입, prod `db:deploy`.

## 🟡

| ID | 위치 | 요약 | 처리 |
|---|---|---|---|
| A1 | `lib/gitlab/transport.ts:137,151` | fetch 기본 `redirect: follow` → 3xx면 `PRIVATE-TOKEN`이 다른 origin으로, 같은 origin이면 다른 project id로(불변식 11 첫 층 우회) | 수정 |
| A2 | `credential-separation.test.ts` `callSites` | 화살표 함수를 앞선 `function`에 귀속 → 허용 자리로 오인 | 수정(테스트) |
| A3 | 같은 파일 | 별칭 import·함수 참조 전달 미검출 | 수정(테스트) |
| A4 | 같은 파일 | `openGitLabToken` 직접 호출·`token` select 미검출 | 수정(테스트) |
| A5 | 같은 파일 | `@/lib/gitlab/client` import 자리 미고정, `GITLAB_WRITE`가 GitClient 쓰기 메서드를 모름 | 수정(테스트) |
| A6 | 같은 파일 | `{host:"gitlab",connectionId}` 리터럴로 `newRepoTarget` 고정 우회 | 수정(테스트) |
| A7 | 같은 파일 | 스캐너가 `.ts`만 — `.tsx` 서버 컴포넌트에서 PAT 열어도 green | 수정(테스트) |
| B1=C5-2 | `lib/projects/open-pr.ts:46` · `messages/*` GitLab `pr-check-failed` · `lib/cli/push-response.ts:27` | 연결 끊긴(참조 비움·저장 만료) GitLab 프로젝트의 CI 보류가 "다음 실행/야간이 푼다"고 안내 — 실제로 재연결 전까지 영구 보류(야간 대상에서도 빠짐). 문서에도 없음 | 문구+문서 수정(판정 불변) |
| E1 | `lib/onboarding-run/gitlab-repos.ts` | 여러 페이지·상한·중간 실패·401·모양 오류 테스트 없음 | 테스트 추가 |
| E2 | `gitlab-reconnect.ts` | 잠금 뒤 조건부 쓰기 0행·GitHub 행 가드·호출자 PAT 401 테스트 없음 | 테스트 추가 |
| E3 | `onboarding-run/access.ts:86-115` | 보관·SHA-256·401 실제 fetch 미검증 + 주석이 D25와 반대 | 테스트+주석 |
| E4 | `onboarding-run/import.ts:62-67` → `import/run.ts` | 연결자 토큰 만료·철회·보관 중 다른 OWNER(MCP·Action 직접)가 Sync → 리더 열기 실패가 `ingest-failed`로, 모든 소스 실패 상태 + 일반 실패 문장 | 수정 |
| E5 | `lib/projects/remote` | GitLab 행 원격 신호 끝-끝 테스트 없음, 가짜 compare가 늘 "변경 없음" | 테스트 추가 |
| U1 | `lib/mcp/tools/sources.ts:53` | MCP `remove_source`가 GitLab에 "workflow file의 step" 안내 | 수정 |
| U2 | `components/home/actions.tsx:285` | Home GitLab Disconnected [Reconnect]가 명의 변경 문장(G6c) 없이 한 번에 명의 변경, 토큰 주인 만료면 실패하는 primary | 수정(설정 카드 링크 — D25 "재연결 컨트롤" 충족) |
| U3 | `lib/pull/run.ts:164` | no-changes MR 닫기 노트가 "pull request" | 수정 |
| U4 | `messages/ko.tsx` | GitLab job이 `CI job`(11)·`CI 작업`(4)로 갈림, terminology 행 없음 | 수정(ko "작업" 통일 + 테스트 행; DESIGN §10.1 행은 피어 뒤) |
| C5-1 | `docs/SELF-HOSTING.md` | GitLab 0줄 — §2 호환 축·§5 상류 clone·§7 미실행 행 | 수정 |
| D7-3 | `docs/DIRECTORY.md:992` | 없는 `lib/mcp/tools/ci-file.ts` 가리킴 | 수정 |
| G-1 | `guide/*/sync/logs.md:20` | 멤버 제거 경로의 행위자 서술 틀림 | 피어 뒤 |
| G-2 | `messages/*` sources onGitLab · `guide/*/setup/sources.md:25` | GitLab은 소스별 job 병렬 — "뒤 소스를 멈춘다" 틀림 | 사전 수정, 가이드는 피어 뒤 |
| G-3 | 가이드 GitLab CI | `malmoi-i18n/sync-*` 보호 금지 안내 없음(ARCHITECTURE §3.02가 약속) | 피어 뒤 |

## ⚪ (처리 요약)

- 수정: A8(정규화 뒤 경로 재가드) · B2(마커 제목 상한 255) · B3(ACTIONS 머지 위젯 커밋 메시지 한 줄) · C5-3(compose `${X:-}`) · C5-7(github-app.ts 주석) · D7-1·E8(해제 서술 "명시적으로 비우고 사건") · D7-2(CLAUDE `/api/push` 호출자 GitLab CI) · D7-4(DIRECTORY 미등재 넷) · E9(테스트 이름) · E11(`gitlabTokenExpiresAt` 필수화) · U6(PAT 폼 세션 거부 문장) · U9(죽은 덮기 두 개 제거 — 이 기능이 만든 고아) · U5(PAT 만료일 UTC 날짜 — 결정 아래) · B⚪1(저장 만료 연결 야간 제외 — 결정 아래).
- 피어 뒤(가이드): C5-4(롤백 중 키 회전 금지) · C5-5(계정 삭제의 GitLab 연결) · G-4(CI 미발행 동안 기준 언어 변경).
- 기록만: A9(실행 중 Publish의 PAT 창 — GitHub 설치 토큰과 같은 창) · B4(GitLab "didn't answer"가 확정 4xx에도 — GitHub과 같은 수준) · B5(프로젝트 이전 뒤 MR 링크 모름 — 재연결이 고침) · C5-6(egress 목록 원래 없음) · C5-8 · E6·E7(드문 오류 분기) · E10(손 사본 3종) · E12(암묵 any) · U7(GitHub 카드 아이콘 칸 톤 — GitHub 화면 변경이라 `/ux-audit` 후보) · U8(autocomplete — 브라우저 실측 필요).

## 사용자 결정 (2026-10-13)

- **U5 → UTC 날짜로 찍는다.** PAT 만료일은 날짜 전용 값이라 시간대가 없다 — GitLab 화면과 같은 날짜. `date-format-consumers.test.ts`의 `FIXED_UTC` 집합과 ARCHITECTURE §6.356(+DESIGN, 피어 뒤)에 예외로 올린다.
- **B⚪1 → 저장 만료일이 지난 GitLab 연결은 야간 대상에서 뺀다.** GitHub 미고정 행을 거르는 `lib/pull/targets.ts`와 같은 근거. 토큰 교체·재연결 뒤 자동 복귀.
- 수정 작업은 피어(`GUIDE-create`)가 로컬 dev를 비운 뒤 **main 체크아웃에서** 한다(사용자 2026-10-13).

## 부록 — 차원별 원문

경로의 `/Users/sinhyeok/code/malmoi-gitlab-audit`는 감사 당시 워크트리(origin/dev `f1c31866`)다.

### 감사 A — 자격증명 경계 · 주소 지정 (GitLab)

대상: `/Users/sinhyeok/code/malmoi-gitlab-audit` @ f1c31866. 읽기 전용. `credential-separation.test.ts` + `transport.test.ts`는 현재 green(47 passed).
우회 시나리오는 테스트의 `codeOnly`·`callSites`를 scratchpad에 그대로 옮겨 돌려 확인했다(리포 파일은 고치지 않음).

#### 결론

- **지금 코드에는 호출자 PAT로 GitLab에 쓰는 경로가 없다**(확인됨). 비GET 호출 7개(`publishSnapshot`·`resetSyncBranch`·`createPr`·`updatePrTitle`·`updatePrBase`·`closePr`×2)는 전부 `lib/gitlab/client.ts#createGitLabClient` 안에 있다. 그 함수를 부르는 곳은 `lib/repo-host/index.ts#createGitClient` 하나이고, 이 함수는 `projectConnection`(`{ connectionId: target.connectionId }`)으로 연결을 연다. `createGitClient`를 부르는 곳은 pull/run(`triggerPull` → `execution` → `requireWrite`)·nightly·remote·open-pr·publish/read이며, 모두 `repoTargetOf(project)`에서 대상을 만든다. 호출자 연결을 여는 자리는 `checkGitLabAccess`·`listGitLabRepositories`·`verifyGitLabToken`(입력 원문)이고, 셋 다 GET만 부른다. 호출자 연결로 대상을 만드는 `newRepoTarget`의 소비자 5곳(①·탐지·샘플·생성)도 `openRepoReader`·`listBranches`만 부른다(읽기).
- **PAT 원문이 새는 경로는 리다이렉트 하나다**(🟡1). 오류 메시지는 경로·상태만 싣는다(`GitLabHttpError`). 로그는 `logCaught`/`logFailure`를 지나며, 비-AppError는 생성자명·`http-N`만 남는다. 사건 payload에는 리포 주소만 있다. Action 반환값은 `VIEW`(사용자명·만료·스코프·updatedAt)만 싣고, `"use client"` 그래프에는 `errors.ts`·`message.ts`만 들어간다.
- **봉투**(D8): 토큰 키링(`TOKEN_ENCRYPTION_KEYS`)을 쓰고 AAD는 `["malmoi/gitlab-pat","v1",kid,userId]`다. GitHub 연결 토큰 `["malmoi/github-app-token",…]`, PII `["malmoi/pii",…]`와 네임스페이스가 겹치지 않는다. `conversion.ts`는 모든 모드에서 GitLab 행을 열어 검증하고, `rotate-token`일 때 다시 봉하며, `oldTokenKey`에도 합산한다. `conversion.test.ts`와 `postgres.integration.ts`(회전·백업 복원)가 이를 덮는다. 결함은 없다.
- **주소**: 모든 호출이 `projectPath(<숫자 id>)`를 거친다. `path_with_namespace`는 응답에서 표시용으로 읽기만 하고 URL에 넣지 않는다. GraphQL은 `projects(ids:)`이고 `fullPath` 가드가 있다. 쓰기 클라이언트를 만들 때 `GET /projects/<id>`로 응답 id를 대조하고(`planProjectMeta` — 다르면 `unavailable`), `requireWrite`면 토큰 주인의 Developer 권한까지 본다. 동적 조각은 `encodeURIComponent`로, 질의는 `searchParams.set`으로 인코딩한다. Link 헤더는 origin+pathname이 같을 때만 따른다(`nextKeysetQuery`). `x-next-page`는 같은 경로의 `page` 값으로만 쓴다.

#### 발견

##### 🟡1 transport가 리다이렉트를 따라가며 `PRIVATE-TOKEN`을 다른 origin으로 보낸다
- **위치**: `lib/gitlab/transport.ts:137`·`:151` — `send(url, { method, headers, body })`에 `redirect` 옵션이 없어 기본값 `follow`로 동작한다.
- **실측**: Node fetch(undici)로 두 origin 사이에서 301·302·307·308을 재현했다. 전부 `PRIVATE-TOKEN`이 대상 origin에 그대로 도착했다. undici는 cross-origin 리다이렉트에서 `Authorization`만 지운다. 307·308은 POST 본문까지 다시 보낸다.
- **실패 시나리오 1 (cross-origin)**: gitlab.com API(또는 그 앞단 엣지·점검 페이지)가 어떤 응답에서든 다른 호스트로 3xx를 준다. 그러면 연결자의 `api` 스코프 PAT가 그 호스트로 나간다. Publish 중이면 307/308로 커밋 본문까지 재전송된다.
- **실패 시나리오 2 (same-origin)**: `/projects/<A>/…`가 `/projects/<B>/…`로 리다이렉트되면 `assertIdAddressed`(전송 전에 한 번만 본다)를 우회한다. 결과적으로 다른 프로젝트에 읽기·쓰기가 간다. 불변식 11의 "첫 층"이 리다이렉트에는 서 있지 않다.
- **추천 수정**: `call`·`graphql` 둘 다 `redirect: "error"`로 바꾸고, 그 오류를 `unavailable`로 분류한다. transport 테스트에 "3xx → 던짐, 두 번째 요청 0"을 고정한다.
- **확신도**: 헤더 전달은 확인됨(실측). gitlab.com이 실제로 off-origin 3xx를 줄 가능성은 추정이다. 숫자 id 주소에서는 드물다. 심층 방어 결함이다.

##### 🟡2 `callSites`가 화살표 함수·메서드를 앞선 `function`에 귀속시켜 PAT 열기 자리 고정(`PAT_OPEN_SITES`)을 우회한다
- **위치**: `lib/github-connect/__tests__/credential-separation.test.ts:403-413`(`callSites`)·`:369-376`.
- **실패 시나리오**: `lib/repo-host/index.ts`의 `projectConnection` 바로 뒤에 아래 코드를 넣는다.
  ```ts
  export const openCallerPat = async (userId: string) => { const by = { userId }; return openGitLabConnection(getPrisma(), by); };
  ```
  `callSites`는 이 호출을 `lib/repo-host/index.ts#projectConnection`(허용 목록)으로 보고하고, `CALLER_CONNECTION`은 변수 간접이라 false다. 그래서 green이다(scratch 재현 확인). 경계 모듈 안에서 호출자 PAT를 여는 함수가 생겨도 막지 못한다.
- **추천 수정**: 둘 중 하나로 고친다. ts-morph(이미 의존성)로 감싼 선언(화살표 포함)의 이름을 구한다. 또는 파일별 호출 **개수**를 정확히 고정한다(`repo-host/index.ts` = 1).
- **확신도**: 확인됨.

##### 🟡3 별칭 import·함수 참조 전달은 어떤 GitLab 검사식에도 걸리지 않는다
- **위치**: 같은 파일 `:303`(`CALLER_CONNECTION`)·`:369`(`callSites(…, "openGitLabConnection")`)·`:357`(app 검사는 `.ts`만 본다).
- **실패 시나리오**: `lib/pull/x.ts`에 아래 코드를 넣는다.
  ```ts
  import { openGitLabConnection as openConn } from "@/lib/gitlab-connect/connection";
  export async function loadX(userId) { return openConn(getPrisma(), { userId }); }
  ```
  `callSites` 결과는 `[]`이고 `CALLER_CONNECTION`은 false다(재현 확인). 완전성 검사(`:385`)는 "스캔 범위 안"만 요구하는데 `lib/pull`이 이미 범위 안이라 green이다. `const open = openGitLabConnection; open(…)`도 같은 결과다.
- **추천 수정**: **import 단위 허용 목록**을 둔다. `openGitLabConnection`이라는 이름을 import하는 파일은 정확히 `{access.ts, gitlab-repos.ts, repo-host/index.ts}`여야 한다. `as` 별칭 import는 금지한다.
- **확신도**: 확인됨.

##### 🟡4 `openGitLabToken` 직접 호출(+ `prisma.gitLabConnection` 토큰 select)은 세지 않는다
- **위치**: 같은 파일 `:322`(`GITLAB_CLIENT_IMPORT`가 `@/lib/credentials/storage`를 포함하지 않는다)·`:357`(`openGitLabToken`은 `app/`에서만 본다).
- **실패 시나리오**: `lib/nightly/x.ts`가 아래처럼 호출자 PAT를 연다.
  ```ts
  const row = await prisma.gitLabConnection.findUnique({ where: { userId } });
  const pat = openGitLabToken(row.token, { userId });
  ```
  `openGitLabConnection`을 지나지 않으므로 `PAT_OPEN_SITES`·`CALLER_CONNECTION`·완전성 검사가 모두 green이다. 정본 주석("원문을 여는 것은 `openGitLabConnection` 하나")이 테스트로 강제되지 않는다.
- **추천 수정**: `openGitLabToken` 호출 자리를 `{gitlab-connect/connection.ts#openGitLabConnection, credentials/conversion.ts#convertCredentials}`로 고정한다. `gitLabConnection` 쿼리에서 `token`을 select하는 파일도 같은 집합으로 묶는다.
- **확신도**: 확인됨(테스트 소스 기준).

##### 🟡5 호스트 구현(`createGitLabClient`·`createGitLabTransport`) 호출 자리가 고정돼 있지 않고, `GITLAB_WRITE`가 GitClient 쓰기 메서드를 모른다
- **위치**: 같은 파일 `:310`(`GITLAB_WRITE` = method 리터럴·`.post(`·`.send("POST"`·`.graphql(`)·`:362-367`. `@/lib/gitlab/client` 소비자를 `repo-host/index.ts` 하나로 묶는 테스트가 없다(테스트 전체를 grep해 0건).
- **실패 시나리오 1**: `lib/onboarding-run/access.ts#checkGitLabAccess`(호출자 연결 허용 자리)에 아래 코드를 넣는다.
  ```ts
  const c = await createGitLabClient(t, { token: connection.token, … }); await c.createPr(…)
  ```
  `.createPr(`·`.publishSnapshot(`·`.closePr(`·`.resetSyncBranch(`는 `GITLAB_WRITE`에 걸리지 않는다. 결과는 green이고 호출자 명의의 쓰기가 생긴다.
- **실패 시나리오 2**: `checkGitLabAccess`가 ok 결과에 `token`을 실어 돌려준다. 그러면 `lib/pull`의 소비자가 `createGitLabClient(target, { token: access.token, … })`로 쓸 수 있다. 어느 검사도 이를 세지 않는다.
- **추천 수정**: 세 가지를 더한다. `@/lib/gitlab/client` import 허용 = `lib/repo-host/index.ts`(+ `scripts/smoke-gitlab.ts`). `createGitLabTransport` 호출 자리 = 현재 다섯 함수로 고정. `GITLAB_WRITE`에 GitClient 쓰기 메서드 이름 6개를 추가한다.
- **확신도**: 확인됨(테스트 소스 기준).

##### 🟡6 `RepoTarget` 객체 리터럴을 직접 만들면 `NEW_REPO_TARGET_SITES` 고정을 우회한다
- **위치**: 같은 파일 `:399-436`. 이 검사는 `newRepoTarget(` 호출만 센다.
- **실패 시나리오**: 연결된 프로젝트 경로(`lib/onboarding-run/add.ts`)가 `projectReadTarget` 대신 아래 대상을 쓴다.
  ```ts
  { host: "gitlab", owner: repo.repoOwner, name: repo.repoName, repositoryId: repo.repositoryId, connectionId: repo.connectionId }
  ```
  typecheck도 테스트도 green이다. 그 결과 연결자가 아닌 OWNER의 명의로 읽게 되는데, 이것이 D21이 막으려던 바로 그 회귀다.
- **추천 수정**: 두 가지 중 하나로 막는다.
  - `lib/repo-host/target.ts` 밖의 소스에 `host: "gitlab"` + `connectionId:`를 함께 쓴 객체 리터럴이 있으면 red로 만든다.
  - `connectionId`에 브랜드 타입을 써서, 호출자 연결 id와 프로젝트 참조 id를 타입으로 가른다.
- **확신도**: 확인됨(테스트 소스 기준). 현재 코드에는 그런 리터럴이 없다(grep 0).

##### 🟡7 스캐너가 `.ts`만 읽는다 — 서버 컴포넌트(`.tsx`)에서 PAT를 열어도 green이다
- **위치**: 같은 파일 `:63-73`(`sourcesIn`의 `entry.endsWith(".ts")`). `components/`는 스캔하지 않는다.
- **실패 시나리오**: `app/(edit)/projects/[slug]/settings/page.tsx`(이미 `@/lib/gitlab-connect/*`를 import한다)에서 `openGitLabConnection(getPrisma(), { userId })`를 부른다. "app/는 PAT를 열지 않는다"(`:357`)와 `PAT_OPEN_SITES`(`:370`)가 둘 다 `.tsx`를 건너뛰므로 green이다.
- **추천 수정**: `sourcesIn`이 `.tsx`도 읽게 하고, `components/`를 app 검사 범위에 넣는다.
- **확신도**: 확인됨.

##### ⚪8 `assertIdAddressed`는 URL 정규화 전의 문자열을 본다 — 점 세그먼트로 다른 프로젝트 id에 닿는다
- **위치**: `lib/gitlab/transport.ts:90-103`·`:132-133`.
- **실패 시나리오**: 호출부 실수로 `rest`에 날 `../../`가 들어가면 우회된다. 예: `/projects/1/repository/../../2/repository/commits`는 가드를 통과하고 `new URL`이 `/api/v4/projects/2/repository/commits`로 정규화한다(실측). `%2e%2e`도 같다. 지금은 동적 조각이 전부 `encodeURIComponent` 한 세그먼트다. 브랜치명 `..`도 `/projects/1/repository/`까지만 올라가 같은 프로젝트에 머문다. 그래서 현재 도달 경로는 없다.
- **추천 수정**: 가드를 `url.pathname`(정규화 뒤)에 다시 걸거나, `.`/`..` 세그먼트를 거부한다.
- **확신도**: 확인됨(현재 도달 경로 없음 — 심층 방어).

##### ⚪9 실행 중인 Publish는 해제·재연결 뒤에도 연 PAT로 계속 쓴다
- **위치**: `lib/repo-host/index.ts:32`. 생성 때 한 번 연 원문을 클라이언트 수명(최대 240초) 동안 보유한다.
- **실패 시나리오**: 연결자가 Publish 도중 `/account`에서 Disconnect한다. 참조는 같은 tx에서 비고 사건도 남는다. 그래도 이미 열린 클라이언트는 남은 commit·MR POST를 그 PAT로 보낸다. D20 주석("떠난 사람의 PAT로 계속 쓰지 않는다")과 창 하나만큼 어긋난다. GitHub 설치 토큰에도 같은 창이 있다.
- **추천 수정**: 수용으로 기록하거나, 첫 쓰기 직전에 `gitlabConnectionId` 재대조를 넣는다.
- **확신도**: 추정. `runPull`이 쓰기 직전에 잠금 안에서 재대조하는지 끝까지 추적하지 않았다.

#### 확인했고 결함 없음(재검토 불필요)

- 호출자 PAT 사용처 3개(`verifyGitLabToken`·`checkGitLabAccess`·`listGitLabRepositories`)는 GET만 부른다. `checkGitLabAccess`·`listGitLabRepositories`는 원문을 돌려주지 않는다(`RepoAccess` ok에는 `connectionId`만 있다).
- 재연결(`reconnectGitLabProject`)은 호출자 Maintainer(`requirePush`)를 확인한 뒤, 잠금 안 조건부 쓰기 + 사건으로 처리한다. 사건에 연결 id·GitLab user id가 없다. `gitlabConnectionId`를 쓰는 곳은 create(호출자 자신)·reconnect(호출자 자신)·해제/멤버 제거(null)뿐이다.
- `GitLabHttpError` 메시지는 `GitLab <METHOD> <path> responded <status>`다. 본문은 403 스코프 판정에만 읽는다. 토큰은 헤더에만 있다. `JSON.parse` 실패의 SyntaxError(본문 조각 포함)는 `logCaught`가 생성자명으로 접는다.
- `connectGitLab` Action은 zod 실패·검증 실패를 코드로 돌려준다. `validateTokenWriteKey`·`sealGitLabToken`이 던지면 Next 프로덕션이 메시지를 digest로 가린다. PAT는 오류 메시지에 들어가지 않는다.
- 클라이언트 번들: `"use client"` 파일이 무는 GitLab 모듈은 `gitlab-connect/errors.ts`·`message.ts`뿐이고 `client-graph.test.ts` 허용 목록에 있다.
- SSRF: `GITLAB_ORIGIN`은 코드 상수다(입력 없음). Link 페이지네이션은 origin+path를 대조한다. MR `web_url`은 따라가지 않는다. 저장된 MR URL을 링크로 낼 때는 `parseGitLabMrUrl`이 origin·리포·iid를 검증한다.

### GitLab 감사 — (3) 병합 없음·strict·보류 판정 / (4) 실패 처리

대상: `/Users/sinhyeok/code/malmoi-gitlab-audit` (origin/dev = f1c31866). 읽기 전용. 개별 테스트 실행: `vitest run lib/gitlab lib/protection lib/pull/__tests__/skip-marker.test.ts lib/onboarding/__tests__/gitlab-ci.test.ts lib/repo-host lib/cli` → 24 files / 420 tests green.

#### 요약

🔴 0 · 🟡 1 · ⚪ 5. 보류 판정·잠금·쓰기 경로는 GitHub과 같은 코어를 탄다. GitLab 쪽에서 판정이 다르게 도는 갈래는 하나(`openPrGateApplies`의 "참조가 비어도 게이트를 세운다")이고, 그 갈래는 의도된 것이다. 결함은 그 갈래의 **안내 문구**에 있다.

---

#### 🟡 발견

##### 🟡1. 연결이 끊긴 GitLab 프로젝트의 CI 보류(`pr-check-failed`)가 "다음 실행/야간이 풀어 준다"고 안내하지만, 실제로는 재연결 전까지 영구 보류다

- **위치**: `lib/projects/open-pr.ts:46` (`connection-removed` → `undefined`) · `lib/protection/plan.ts:53-55` · `lib/cli/push-response.ts:27` (`gitlab.prCheckFailed`) · `messages/en.tsx:1680`·`:1691` (`onGitLab.deferReasons["pr-check-failed"]`·`held["pr-check-failed"]`) · `lib/pull/targets.ts:51` (`repoConnectionPinned`가 야간 대상에서 뺀다)
- **시나리오**: 연결자가 멤버에서 제거되거나 연결을 해제한다 → `gitlabConnectionId = null`. 이후 base push마다 `/api/push`가 GitLab 호출 없이 `pr-check-failed`로 보류한다. 이 보류는 의도된 fail-closed다. 그런데 안내 문구가 원인과 복구를 틀리게 말한다.
  - Logs는 "We couldn't check GitLab… The next run checks again"와 "GitLab didn't answer about merge requests"라고 쓴다. 실제로는 GitLab을 부르지 않았고, 다음 실행도 같은 결과로 보류된다.
  - CI 경고는 "Once the check is available, a new push … or the nightly sync imports"라고 쓴다. 그런데 야간 대상 선정이 이 프로젝트를 제외하므로(`repoConnectionPinned`) 야간 적재는 오지 않는다.
  - 저장된 PAT 만료일이 지난 경우도 같은 결과다. `openProject`가 원격 호출 없이 `not-installed`로 던지고, `loadOpenPrUrl`가 그것을 `undefined`로 만든다.
- **결과**: 리포의 새 키와 삭제가 재연결할 때까지 앱에 들어오지 않는다. 그런데 Logs·CI 로그는 기다리면 풀린다고 말한다. Home·설정의 `Disconnected`가 복구 경로를 보이기는 하지만, CI 로그만 보는 개발자는 원인을 알 수 없다.
- **추천**: 보류 판정은 그대로 둔다. 서버가 아는 원인(참조 비움·저장 만료)일 때만 Logs와 CI 경고가 재연결을 말하게 한다. 방법은 둘 중 하나다: 사유 값을 하나 더하거나(`/api/push` 응답 계약과 CLI 허용 목록에 같이 추가), GitLab `pr-check-failed` 문장에 "연결이 끊겼으면 Settings에서 재연결" 절을 덧붙인다.
- **확신도**: 확인됨 (코드 경로와 문장을 읽어 대조함). 보류 자체는 `plan.ts` 주석이 밝힌 의도다.

---

#### ⚪ 발견

##### ⚪1. 저장 만료일이 지난 GitLab 연결도 야간 대상에 남아, 매일 밤 같은 실패를 쌓는다
- **위치**: `lib/pull/targets.ts:51` · `lib/repo-host/target.ts` (`repoConnectionPinned`은 참조만 본다) · `lib/gitlab/client.ts:80`
- **시나리오**: PAT 만료일이 지나면 DB만으로도 실패가 확정된다. 그런데 야간이 매일 방문한다.
  - 미전달 편집이 있으면 `runSync` → `FAILED not-installed`인 SyncRun과 사건이 남는다.
  - 없으면 `readHead`가 던진 오류를 삼켜 `nightly.skip failed base-unreadable` 사건이 남고, Logs는 "couldn't read your repository"라고 쓴다.
  - `targets.ts`의 주석은 "확실히 던지는 행을 순회에 남기면 재연결 전까지 매일 밤 실패가 쌓인다"를 이유로 GitHub 미고정 행을 거른다. 같은 근거가 이 경우에도 그대로 적용된다.
- **추천**: `selectPullTargets` 입력에 `expiresAt`을 싣고 `tokenExpired`로 거른다. 결정 범위(D24는 목록 사전 판정만 다룬다)라 **질문**으로 올린다.
- **확신도**: 확인됨 (경로). 영향도는 판단의 문제다.

##### ⚪2. `withSkipMarker`의 길이 상한 256은 GitHub 기준이다. GitLab MR 제목 상한은 255다
- **위치**: `lib/pull/payload.ts:31,39-42` · `lib/gitlab/client.ts:213` (`updatePrTitle`)
- **시나리오**: 사람이 열린 sync MR의 제목을 마커 없는 237자로 고친다. 다음 Publish가 마커를 붙이면 256자가 되고, `PUT merge_requests/<iid>`가 400을 받는다. 이 시점은 커밋 POST 뒤라 결과가 `execution-uncertain`이 되고, 사람이 제목을 다시 고치기 전까지 Publish마다 같은 실패가 반복된다.
- **추천**: 상한을 호스트별로 나누거나 255로 낮춘다(GitHub에서도 손해가 없다).
- **확신도**: 추정. GitLab `Issuable::TITLE_LENGTH_MAX = 255`는 기억에 기댄 값이고 실측하지 않았다. 발생 조건이 정확히 한 길이라 드물다.

##### ⚪3. ACTIONS §5 "머지 방식"은 템플릿 변경만 다룬다. 머지할 때 "Edit commit message"로 마커를 지우는 경우는 적혀 있지 않다
- **위치**: `docs/ACTIONS.md:395` (GitHub 쪽 짝인 `:326`은 "제목을 고쳐도 마커는 남긴다"를 말한다)
- **시나리오**: GitLab 머지 위젯에서 merge/squash 커밋 메시지를 직접 고쳐 `%{title}` 줄을 지운다. 그러면 rules·`push.sh`·`gitlab-ci-input.ts` 세 겹 모두 마커를 못 보고 적재가 한 번 돈다. 미전달 편집과 열린 MR 보류가 피해를 막으므로 데이터 손실은 없고, 불필요한 실행 한 번이다.
- **추천**: §5 "머지 방식"에 "머지 위젯에서 커밋 메시지를 고칠 때도 마커를 남긴다"는 한 줄을 더한다.
- **확신도**: 확인됨 (문서 대조).

##### ⚪4. GitLab Logs의 `github-error` 문장 "GitLab didn't answer"는 확정 4xx에도 쓰인다
- **위치**: `messages/en.tsx:1702` · `lib/sync/plan.ts:264` (`httpStatus` → `github-error`)
- **시나리오**: Developer 주인이 보호 브랜치나 MR 비활성 때문에 커밋·MR POST에서 403을 받는다. GitLab은 답을 했는데 Logs는 "GitLab didn't answer"와 "야간 재시도"라고 쓴다. 쓰기를 보낸 뒤라 `execution-uncertain`이 되어 그 문장마저 다를 수 있다. GitHub 문장과 같은 수준의 문제라 GitLab 고유의 회귀는 아니다.
- **추천**: 그대로 두고 기록만 한다. 고친다면 호스트 중립 문장("The repository host refused or didn't answer")으로 바꾼다.
- **확신도**: 확인됨.

##### ⚪5. GitLab 프로젝트를 옮기면(경로 변경, id 유지) 열린 MR 링크 파싱이 "모름"이 된다
- **위치**: `lib/projects/pr-url.ts:18-30` (`parseGitLabMrUrl`이 저장된 `repoOwner/repoName`과 대조한다)
- **시나리오**: 그룹 이전 뒤 `web_url`에는 새 경로가 실린다. 그래서 Publish 미리보기·Sync 확인·MCP `pullRequestState`가 열린 MR을 `undefined`(모름)로 보인다. 쓰기와 게이트는 숫자 id와 원문 URL을 쓰므로 영향이 없다. 재연결(`reconnectGitLabRepository`)이 주소를 갱신하고, 설정 카드가 `repo-moved`에서 그 컨트롤을 세운다. GitHub 리네임과 같은 동작이다.
- **추천**: 그대로 둔다. GitLab에서는 그룹 이전이 흔하므로 가이드의 repo-moved 안내에 "MR 링크가 안 보이면 재연결"을 더할지 검토한다.
- **확신도**: 확인됨.

---

#### 이상 없음으로 확인한 항목

##### 3a. 보류 판정
`/api/push`는 호스트 분기가 없다. 순서는 사전 집계(`countPending`) → `loadOpenPrForImportGate` → `applyProtectedPush`이고, 잠금 안에서 `lastPublishedAt`과 `readDeliveryRevision`을 다시 대조해 `publish-raced`를 낸다(`app/api/push/route.ts:237-326`).

- GitLab 게이트는 **읽기** 클라이언트를 쓴다(`requireWrite` 없음). 그래서 주인이 Reporter로 강등돼도 게이트가 영구 보류로 굳지 않는다.
- MR 조회 실패, 마감 초과, 모양 오류(`selectOwnMergeRequest`가 던진다), 페이지 끝 미도달, 참조 비움, 보관, 401·403·404는 모두 `undefined` → `pr-check-failed`(fail-closed)다.
- fork MR은 `source_project_id === target_project_id === 저장된 id`로 걸러낸다.
- 야간(`lib/nightly/run.ts:219`)도 같은 `openPrGateApplies`를 쓰고, 적재 `acquire`는 `sameRepoTarget`(connectionId 포함)과 `publish-raced`를 다시 대조한다.

##### 3b. 루프 마커
- 마커가 커밋 메시지(`commitMessage` — GitLab 커밋 API 본문)와 MR 제목(`PR_TITLE`, 재사용 MR에는 `withSkipMarker`)에 모두 든다.
- CI 쪽 가드는 세 겹이다. 생성 job의 rules가 `$CI_COMMIT_MESSAGE !~ /\[skip-malmoi-i18n\]/`(전체 메시지)로 거르고, `push.sh`의 `case "${CI_COMMIT_MESSAGE-}"`가 의존성 설치 전에 한 번 더 보고, `lib/cli/gitlab-ci-input.ts:38`이 마지막으로 본다.
- GitLab 기본 템플릿(merge commit의 `%{title}`, squash의 `%{title}`)과 fast-forward·rebase에서도 마커가 남는다. 템플릿을 바꾸는 경우의 위험은 ACTIONS §5에 적혀 있다(⚪3은 그 보충).

##### 3c. 결정성
- 원본 읽기(`readBlobText`의 base64 → UTF-8, LFS 포인터 거부)와 B3.4 규칙(`renderProject`)은 호스트 중립이다.
- `render-parity.test.ts`가 GitHub과 GitLab의 렌더가 바이트 단위로 같음을 다섯 포맷에서 고정한다.
- 2층 비교에 쓰는 GitLab 트리 `id`는 git blob sha1이고, SHA-256 리포는 `planProjectMeta`가 `unsupported` → `not-installed`로 거른다.
- 잘린 트리(keyset 200페이지 초과)는 던진다. `buildCommitActions`는 삭제를 내지 않고 경로를 검증한다.

##### 4. 실패 처리
- 클라이언트 생성 단계(`openProject`)의 분류:
  - 만료일 지남 → 원격 0회, `not-installed`
  - 401·403(스코프·접근)·404·보관·sha256 → `not-installed`(재시도 안 함)
  - 429·5xx·네트워크 → 원래 오류 그대로(`github-error`·`unknown`, 재시도함)
  - 쓰기 클라이언트는 주인 권한을 Developer(30) 기준으로 쓰기 **전에** 본다.
- 쓰기 뒤 실패는 무엇이든 `execution-uncertain`이다(`execution.fetch`가 비GET을 쓰기로 센다). transport에는 재시도가 없고, MR POST의 409는 성공으로 읽지 않는다.
- 다음 실행은 `findOpenPr`로 기존 MR을 재사용하므로 MR이 둘로 늘지 않는다.
- no-changes 경로는 노트 → 닫기 → 브랜치 삭제 순서이고, 404를 수렴으로 읽는다(D9). 중간에 실패하면 확정 없이 던지고, 다음 실행이 같은 판정을 반복한다.
- 각 경로를 `lib/gitlab/__tests__/publish.test.ts`·`connection-state.integration.ts`가 고정한다.

##### D20
- `disconnectGitLabAccount`는 참조 프로젝트를 id 순으로 잠근 뒤 연결 행을 `FOR UPDATE`로 잠그고, 참조를 다시 조회한 다음 프로젝트마다 참조 비움과 `settings.repositoryDisconnected` 사건을 같은 tx에서 쓰고 행을 지운다.
- `changeMemberRole(nextRole=null)`은 `lockProjectAccess` 뒤 같은 tx에서 참조를 비우고, 사건과 `member.removed`를 함께 남긴다.
- 잠금 순서가 재연결·생성(Project → 연결 FK 공유 잠금)과 같아 교착이 없다. 멤버 삭제 경로는 이 하나뿐이다(`grep projectMember.delete`). 계정 삭제는 D20 범위 밖(FK 그물)이다.

##### 4b. 동시성
- GitLab 쓰기 호출(`transport.send`)은 전부 `createGitLabClient` 안에 있다.
- 쓰기 클라이언트를 여는 유일한 경로는 `triggerPull`이다(`createGitClient(target, execution)`). 이 경로는 `runSync`(수동·MCP·야간 공통)에서만 불리고, `runSync`는 `SyncRun RUNNING`·`activeImport`·`too-soon` 판정을 Project 잠금 안에서 한다.
- 따라서 Publish 두 번이 동시에 오거나 야간과 수동 Sync가 겹쳐도 GitHub과 같은 잠금으로 직렬화된다.

### C — 셀프 호스팅 체크리스트(5) · 문서 정합(7)

대상: `/Users/sinhyeok/code/malmoi-gitlab-audit` (origin/dev = f1c31866), 범위 `b7c58993..HEAD`. 읽기 전용.
실행한 테스트: `pnpm vitest run lib/onboarding/__tests__/gitlab-ci.test.ts lib/deployment/__tests__/self-hosted-gates.test.ts lib/deployment/__tests__/preflight.test.ts lib/privacy` → 7 files / 141 tests 통과.
격리 PG 스위트(`self-hosted-bootstrap.integration.ts`)는 이 감사에서 돌리지 않았다(구조만 읽음).

🔴 없음.

---

#### 5. 셀프 호스팅 체크리스트 (SELF-HOSTING §3)

##### 판정 요약 (통과)

| §3 항목 | 판정 | 근거 |
|---|---|---|
| 1 마이그레이션 건너뛰기 안전 | 통과 | `20261012120000_add_gitlab_connection` — additive만. `repoHost TEXT NOT NULL DEFAULT 'github'`(PG11+ 메타데이터 기본값, 재작성 없음 — 기존 행 백필이 SQL 안에서 끝남) · `gitlabConnectionId` nullable · 새 테이블 `GitLabConnection`(PK·`userId` unique·FK User CASCADE) · `Project_gitlabConnectionId_idx` · FK SET NULL. 앱 코드 백필 없음, `CREATE EXTENSION`·superuser·Supabase 롤 없음 |
| 1 런타임 롤 GRANT | 통과(구조) | `deploy/bootstrap.sql` 3단계 `ALTER DEFAULT PRIVILEGES FOR ROLE :migrate_role … ON TABLES`가 새 테이블을 덮고, 매 업그레이드 2단계 `GRANT … ON ALL TABLES`가 다시 준다. 시퀀스 없음. 통합 테스트 ③이 "bootstrap 뒤 새 테이블"을 일반형으로 확인 |
| 2 새 패키지 | 해당 없음 | `package.json` diff는 `smoke:gitlab` 스크립트 한 줄. SDK 없이 `fetch` |
| 3 Vercel·Supabase 전용 / 새 cron | 해당 없음 | `vercel.json`·`deploy/scheduler` 무변경 |
| 4 새 env | 통과 | 런타임 새 env 0(D6). `lib/gitlab*`·`lib/repo-host`·`.gitlab/` 의 env 읽기는 러너의 `CI_JOB_TOKEN`·`CI_PROJECT_ID`(앱 밖)뿐. `GITLAB_TEST_*`는 스모크 전용(D27, `.env.example`·preflight에 없음 — CLAUDE.md 서술과 일치) |
| 4 D4 all-or-none | 통과 | `lib/deployment/preflight.ts:148-154` — `SELF_HOSTED_ENV`에서 다섯이 `optional`, `planGitHubAppConfig(...) === "partial"`이면 빠진 이름마다 `incomplete-group`. 이전 판(`b7c58993`)은 다섯이 `required`였다 — 가이드 `operate.md:11`·OPERATIONS 롤백 절의 "구버전 preflight가 다섯을 요구" 단언이 참 |
| 4 D4a·D28 | 통과 | 화면 갈래는 `githubAppConfigured()`(자격증명 넷) 하나 — `new-project-modal.tsx:31`(탭 줄·GitHub 목록 조회 0), `account/page.tsx:96`(GitHub 카드·조회 0), `settings/page.tsx:64`. SLUG는 `installUrl()`만 가른다 |
| 5 외부 주소 | 통과 | 생성 `.gitlab-ci.yml`의 `MALMOI_I18N_API_URL`은 `lib/onboarding/ci-file.ts`가 `workflowApiUrl`을 지난다. GitLab API 호스트 `gitlab.com` 리터럴은 SH-15 ① 대상(hosted 도메인)이 아님 |
| 6 토큰이 경로에 실리는 URL | 해당 없음 | PAT는 Server Action 본문으로만 온다(callback·Route Handler 없음 — ARCHITECTURE §6.41 첫 줄과 일치) |
| 7 업로드 볼륨 | 해당 없음 | |
| 8 새 전송처·수집 필드 | 통과 | 방침 en·ko(es는 en 고정 네임스페이스) 모두 gitlab.com 전송·`GitLabConnection` 수집·보관·개정 이력 2026-10-12·시행일 2026-10-12. 가이드 `troubleshooting.md` 세 언어에 `GitLabConnection` 행(필드 9개 = `collected.ts` 등재 9개)·gitlab.com 전송 행 |
| 9 설치 절차 | 통과 | `install.md`(GitHub App 선택 그룹·GitLab env 없음)·`troubleshooting.md`(`incomplete-group`)·`operate.md`(D6a 롤백·키 회전에 GitLab PAT)·`README.md`(GitLab CI 태그·러너 도달) 세 언어 GitLab 언급 수가 파일마다 같다(operate 5 · install 3 · README 4 · troubleshooting의 `GitLabConnection` 행 1 · gitlab.com 전송 행 1) |
| D6a 롤백 줄 | 통과 | OPERATIONS "GitLab 릴리스 이전으로 되돌리기" + 가이드 `operate.md:11`(세 언어) |

##### 발견

**🟡 C5-1. `docs/SELF-HOSTING.md`에 GitLab 기능이 한 줄도 없다** — 확인됨
- 위치: `docs/SELF-HOSTING.md` 전문(`grep -i gitlab` 0건). §2 "action 호환"(L33 — action 태그 v1·v2·v3만), §5 "대상 리포 CI가 상류 action 태그를 실행한다"(L79), §6 상류 유지자 할 일, §7 실습 기록.
- 시나리오: 다음 기능 작업자가 §5를 보고 "설치본 push 토큰이 들어가는 상류 코드 = GitHub action 태그 하나"로 판단한다. 실제로는 GitLab CI job도 `SinhyeokKang/malmoi`를 `malmoi-i18n-push-gitlab-vN` 태그로 clone해 `PUSH_TOKEN`과 함께 돈다(SHA 대조로 완화). 또 GitLab 전용 설치(App 없이 기동)·GitLab CI 원본 태그가 "설치본이 지원해야 하는 축"이라는 사실이 유지보수 계약(§2)에 없다. §7에는 optional-login-providers 때처럼 "GitLab 전용 설치 기동·PAT 연결·Publish MR·CI job" 미실행 행이 없어 "실측 안 함"이 기록 밖이다(미실측 자체는 알려진 미완 — 기록 부재가 발견).
- 판정: **문서가 틀림(누락)**.
- 수정: §2 action 호환 행에 GitLab CI 태그 축, §5에 GitLab CI의 상류 clone(+SHA 대조로 완화) 한 줄, §7에 "GitLab 전용 설치·GitLab 왕복 — 미실행" 행, `Publish 실행 수명` 절처럼 "§3 대조: 새 env 0·패키지 0·마이그레이션 additive" 한 줄.

**🟡 C5-2. Disconnected GitLab 프로젝트는 CI 적재가 무기한 `pr-check-failed`로 보류되는데 어느 문서도 말하지 않는다** — 확인됨
- 위치(코드): `lib/protection/plan.ts:49-56` `openPrGateApplies` — GitLab은 연결 참조가 비어도 `true`. `lib/projects/open-pr.ts:42-46` — `connection-removed`·`unpinned`이면 `undefined`("모름"). 만료·철회(`connection-unusable`)도 클라이언트 생성이 던져 `undefined`. → `/api/push`가 200 `deferred`/`pr-check-failed`.
- 위치(문서): ACTIONS §5 L391("조회 실패면 `pr-check-failed`"만), ARCHITECTURE §3.02 L1076·§6.41(연결 끊김 두 갈래 — Sync·Publish 꺼짐만 말함), 가이드 GitLab CI·Disconnected 서술.
- 시나리오: 토큰 주인이 GitLab 연결을 해제하거나 PAT가 만료된다 → 프로젝트는 Disconnected. 개발자는 base 브랜치에 키를 추가·삭제하고 CI job은 green(exit 0) + "couldn't check whether the Malmoi merge request is still open — repository changes were not imported. Once the check is available, a new push … or the nightly sync imports …" 경고(`lib/cli/push-response.ts:26`). 새 push를 해도 재연결 전까지 같은 보류이고, 야간도 참조 비움이면 순회에서 빠지고(`lib/pull/targets.ts` `repoConnectionPinned`) 만료·철회면 `not-installed`로 실패한다 — 경고 문장이 약속하는 복구 경로 둘이 다 막혀 있다 — GitHub `unpinned`(게이트 미적용 → strict 적재)와 비대칭이라 GitHub 경험으로 추론하면 틀린다. Home은 `planHoldNotice`가 `disconnected`면 `null`이라 보류 사유도 안 보인다.
- 판정: 의도된 fail-closed(코드 주석 근거)이므로 **문서가 틀림(누락)**.
- 수정: ACTIONS §5 "열린 MR" 문단과 ARCHITECTURE §6.41 "연결이 끊기는 갈래"에 "Disconnected 동안 CI 적재는 `pr-check-failed`로 보류 — 재연결이 푼다" 한 줄, 가이드 GitLab CI 페이지 문제 해결에 같은 줄.

**⚪ C5-3. compose가 이제 선택인 `GITHUB_APP_*` 다섯을 `${X}`로 넘긴다** — 확인됨
- 위치: `deploy/compose.yaml:92-96`. 로그인 넷은 같은 이유(선택 변수)로 `${X:-}`이고 `self-hosted-gates.test.ts:375-382`가 그 형을 센다.
- 시나리오: GitLab 전용 운영자가 `.env`에서 다섯 줄을 지운다 → 모든 `docker compose` 명령이 "The GITHUB_APP_ID variable is not set" 경고 다섯 줄. 동작은 같다(빈 값 = absent). `deploy/.env.example`이 빈 줄을 두므로 그대로 쓰면 안 생긴다.
- 수정: 다섯을 `${X:-}`로, ②-c 게이트에 `GITHUB_APP_ENV` 추가.

**⚪ C5-4. GitLab 지원 이전으로 롤백한 뒤 키 회전하면 GitLab PAT가 옛 키로 남는다 — 롤백 절차가 말하지 않는다** — 추정(구버전 코드 논리)
- 위치: `b7c58993:lib/credentials/conversion.ts`에는 `GitLabConnection`이 없다(현재 L14·L38·L67이 추가). OPERATIONS L472-479·가이드 `operate.md:11`.
- 시나리오: 셀프 호스팅 운영자가 GitLab 이전 태그로 롤백 → 그 버전의 `credentials:self-hosted rotate-token`·`verify`가 `GitLabConnection.token`을 다시 봉하지도 세지도 않는다 → `oldTokenKey: 0`을 보고 옛 토큰 키를 폐기 → 재전진 뒤 모든 GitLab PAT 복호화 실패(연결 전부 재입력).
- 수정: D6a 롤백 줄에 "롤백 중에는 토큰 키를 회전·폐기하지 않는다" 한 구.

**⚪ C5-5. 셀프 호스팅 가이드 계정 삭제 절차가 GitLab 연결을 말하지 않는다** — 확인됨
- 위치: `guide/{en,ko,es}/self-hosting/troubleshooting.md:127-130·161`(`DELETE FROM "User"` 주석 "cascades to Account, Session, ApiToken, OAuth*"), 도입 문장 "removes their sign-in methods, sessions, personal tokens, and connected agents".
- 시나리오: 운영자가 GitLab 연결자를 삭제한다 → `GitLabConnection`이 cascade로 지워지고 그 사람이 연결한 프로젝트가 사건 없이(ARCHITECTURE §6.41 "계정 삭제는 사건을 남기지 않는다") Disconnected가 된다. 가이드는 이 결과도, "GitLab의 PAT 자체는 철회되지 않으니 당사자가 GitLab에서 철회"도 말하지 않는다(hosted 방침은 L156에서 말한다). 6단계 "What remains"에도 없음.
- 수정: cascade 주석에 `GitLabConnection` 추가 + 도입 문장에 "their GitLab connection (projects using it show Disconnected; the PAT itself stays valid at GitLab)".

**⚪ C5-6. 서버 egress(gitlab.com)가 설치 요구사항에 없다** — 확인됨(누락), 영향 작음
- 위치: `guide/en/self-hosting/README.md:33-38`(Before you install — 인바운드·러너 도달만). 서버 아웃바운드 목록은 GitHub·Resend도 원래 없다(폐쇄망 비지원으로 갈음). gitlab.com은 개인정보 전송 표(`troubleshooting.md:118`)에만 있다.
- 시나리오: 아웃바운드를 허용 목록으로 묶는 운영자가 api.github.com만 연다 → GitLab 연결이 `unavailable`("일시 장애")로 계속 실패하고 원인이 egress라는 단서가 없다.
- 수정(선택): Before you install에 "서버가 HTTPS로 나가야 하는 곳: GitHub(App 쓰면), gitlab.com(GitLab 쓰면), Resend" 한 줄.

**⚪ C5-7. `lib/deployment/github-app.ts` 머리 주석이 D28 이전 서술** — 확인됨
- 위치: `lib/deployment/github-app.ts:7-9` — `complete`/`absent` 설명이 "①·`/account`·설정의 GitHub 카드·설치 링크"를 `planGitHubAppConfig`에 묶는다. 실제 화면은 `githubAppConfigured`(넷)를 본다(같은 파일 L34-37 주석이 바르게 말함).
- 판정: 코드 주석이 틀림. 수정: L7-9에서 화면 서술을 빼고 "preflight 전용"으로.

**⚪ C5-8(질문 아님, 관찰). App 없는 설치의 MCP `list_repositories`(host 생략 = GitHub)** — 추정
- `lib/mcp/tools/repos.ts:50` → `listRepositories` → `ensureUserToken`이 연결 없음으로 `needs-browser`를 줄 것으로 보이나, 브라우저에는 GitHub 연결 컨트롤이 없다(D4a). 크래시는 아님(추정). D4a가 화면 한정이라 결함이 아니라 문구 관찰로만 둔다.

---

#### 7. 문서 정합

##### CLAUDE.md

GitLab 행(L71)·데이터 경로 표 2행(L123-124)·"GitLab PAT는 넷째" 문단(L154)·`smoke:gitlab`(L179)·태그 셋째 축(L234) — 코드와 대조해 맞음: `connectGitLab`/`disconnectGitLab`의 `readSession` 뒤 값 반환·`account-mismatch`(connection.ts:78·88)·`listConnectableGitLabRepos`(projects/actions.ts:422)·`reconnectGitLabRepository`(settings/actions.ts:262)·`PAT_OPEN_SITES` 셋·프리미티브 53개.

**⚪ D7-1. "해제는 FK `SetNull`로 참조 프로젝트를 끊고"** — 확인됨, 문서(+Action 주석)가 부정확
- 위치: CLAUDE.md L123, `app/(edit)/account/actions.ts:322`("행을 지우면 FK `SetNull`이 … 같은 문장에서 끊는다").
- 실제: `lib/gitlab-connect/connection.ts:117-145` — 참조 프로젝트를 id 순 `FOR UPDATE` → 연결 행 잠금 → 재조회 → 각 프로젝트를 **명시 update**로 비우고 사건 → 마지막에 연결 삭제. FK SetNull은 계정 삭제 그물일 뿐(같은 파일 L115 주석). 잘못 읽으면 "FK가 끊으니 사건 없이 지워도 된다"는 리팩터가 나온다.
- 수정: "해제는 참조 프로젝트를 잠그고 같은 tx에서 참조를 비우며 프로젝트마다 사건을 남긴다(FK `SetNull`은 계정 삭제 그물)".

**⚪ D7-2. 외부 진입점 표의 호출자가 GitHub Actions뿐** — 확인됨, 문서가 낡음
- 위치: CLAUDE.md L135-136(`/api/push`·`/api/push/failure` 호출자 "GitHub Actions"), L34("그래서 `/api/push`가 GitHub을 부른다", "CI 적재가 GitHub 가용성에 묶인다"). ARCHITECTURE L1769도 같다.
- 실제: GitLab CI job(`.gitlab/malmoi-i18n-push/run.ts` → `push:local`)도 같은 두 진입점을 부르고, GitLab 프로젝트의 게이트는 GitLab(참조 연결 PAT)을 부른다.
- 수정: "GitHub Actions · GitLab CI", "리포 호스트(GitHub·GitLab)를 부른다/가용성에 묶인다".

##### docs/ARCHITECTURE.md

불변식 6·11(L61-66·L97-104), §3 0단계(L925), §3.02(L1044-1080), §6.41(L3456-3500), §6.45.10(L3813-3821), 키 표(L3912) — 표본 대조 맞음: 숫자 id 주소·응답 id 대조→`unavailable`(access-plan.ts:89)·sha1·보관(client.ts:91-92)·Developer 판정(`requireWrite`, client.ts:94-99)·`TREE_PAGE_LIMIT` 200·GraphQL 100경로·MR 10페이지 후 throw·`force: true`·`start_sha`·노트→닫기 순서·`needsReconnect`=`not-installed`·`PAT_OPEN_SITES`·MCP `not-connected` 접기(project.ts:67).

- C5-2(위)가 §6.41의 누락이다.
- D7-2가 L1769에도 걸린다.

##### docs/DIRECTORY.md

**🟡 D7-3. `ciFileOf`·`gitlabCiReleased`의 위치가 옛 것** — 확인됨, 문서가 틀림
- 위치: `docs/DIRECTORY.md:992` — "앱이 쓰는 ciFileOf·gitlabCiReleased는 지금 lib/mcp/tools/ci-file.ts(server-only)에 있다 — 앱이 MCP 모듈을 문다(이관 후보)".
- 실제: `lib/mcp/tools/ci-file.ts`는 없다. `lib/onboarding/ci-file.ts`가 집이고(머리 주석 "R-Eui 🟡4 — 화면이 MCP 층에 기대던 역방향을 걷었다"), 화면·MCP 둘 다 그것을 import한다.
- 시나리오: 작업자가 DIRECTORY를 믿고 없는 파일을 찾거나 "이관 후보"를 다시 이관하려 한다.
- 수정: L992를 `onboarding/ci-file.ts` 등재(경로 상수 둘·`gitlabCiReleased`·`ciFileOf` — 화면·MCP 공용, server-only)로 교체.

**⚪ D7-4. 새 파일 넷이 미등재, `onboarding-run/` 설명이 GitHub 전용** — 확인됨
- `lib/onboarding-run/gitlab-repos.ts`(① GitLab 목록 — `PAT_OPEN_SITES` 자리), `lib/onboarding-run/gitlab-reconnect.ts`(재연결 코어), `lib/onboarding-run/locator.ts`(새 리포 입력 → 대상, GitLab은 숫자 id만), `components/onboarding/repo-input.ts`(리포 행 → Action 입력). DIRECTORY L908-909는 여전히 "두 GitHub 자격증명이 만나는 조립 … access · repos · branches · detect · add · create · import · rotate-token".
- 수정: L908-909 목록에 셋 추가 + "GitLab은 호출자 PAT(조회)·참조 연결(I/O)" 한 구, components/onboarding에 repo-input.

##### docs/PRODUCT.md

§2(L55-58)·§3 GitLab 권한(L90-95)·§4.1 GitLab.com 연결(L314-321)·셀프 호스팅(L442-446)·§4.2 확장 비범위(L482-486)·IA(L830·L846) — 대조 맞음: 목록 `min_access_level=40&archived=false`(gitlab-repos.ts:58)·`EXPIRES_SOON_DAYS = 14`·쓰기 문턱 40/20/30·교체 같은 사용자·D4/D4a/D28 서술. 발견 없음.

##### docs/OPERATIONS.md

키 표 토큰 행(L118 — `rotate-token`·`oldTokenKey`에 GitLab PAT, conversion.ts:38-43·67과 일치)·"GitLab 릴리스 이전으로 되돌리기"(L472-479 — 구버전 preflight 단언 참)·"GitLab CI 원본 릴리스"(L481-494 — `GITLAB_CI_RELEASE.sha` null·ACTIONS `<!-- gitlab-ci -->` 블록·테스트 대조, 테스트 통과) 맞음. C5-4가 롤백 절의 보탬이다.

##### docs/ACTIONS.md

§5(L334-399): 생성기·입력 변환 경로, `PUSH_TOKEN` Protected+Masked, `<!-- gitlab-ci -->` 블록이 생성기 출력과 줄 단위 일치(테스트 통과), `sha: null` → `MALMOI_I18N_PUSH_SHA: "unreleased"`. C5-2가 "열린 MR" 문단의 누락이다.

##### README.md

L49-51·L188-193·L206·L213·L219·L224 — "six services"(GitHub·GitLab·Google·Supabase·Vercel·Resend), GitLab Self-Managed 비지원, App 선택 — 맞음. 발견 없음.

##### /privacy 본문 · `lib/privacy/collected.ts`

en `publicDocs.privacy`(`messages/en.tsx` L705~)·`messages/ko-privacy.tsx` — 수집(PAT·GitLab 사용자 ID·사용자명·만료일·스코프·시각), 보관(해제·삭제까지, 교체 덮어씀, Malmoi 해제가 GitLab 토큰을 철회하지 않음), 전송(gitlab.com — 연결자 명의), 삭제(GitLab 연결 포함), 개정 이력·시행일 2026-10-12 두 본 일치. `collected.ts` `GitLabConnection` 9필드 `collected`, `Project`는 not-personal(`gitlabConnectionId` 불투명 참조 근거). es는 en 고정 네임스페이스(es.tsx:8). 발견 없음.

##### 가이드 원고 guide/{en,ko,es}/ (셀프 호스팅 제외)

현재 경로 기준, 내용 오류만. ko·es는 en과 같은 결함을 그대로 갖고 있고 언어 사이 숫자·변수명·임계값 어긋남은 없다(14일·`api`·Maintainer·`PUSH_TOKEN`·`MALMOI_I18N_*`·`!128`·`test` stage).

**🟡 G-1. Logs가 "연결자 이름으로" 남긴다는 서술이 멤버 제거 경로에서 틀림** — 확인됨, 문서가 틀림
- 위치: `guide/{en,ko,es}/sync/logs.md:20` — "connection is removed because the person who connected it disconnected GitLab or left the project, Logs records it under that person's name."
- 실제: 멤버 제거 경로의 행위자는 **제거한 사람**이다(`lib/auth/members.ts:147-150`, 주석 "행위자는 제거한 사람이다"). 셀프 탈퇴 기능은 없으므로 "left the project"는 다른 OWNER가 제거한 경우다. 연결자 이름은 본인이 해제했을 때만(`lib/gitlab-connect/connection.ts:140`).
- 시나리오: OWNER Alice가 연결자 Bob을 제거 → Logs에는 Alice의 사건. 가이드를 믿고 Bob의 사건을 찾으면 없다.
- 수정: "…recorded under the name of whoever disconnected GitLab or removed that person".

**🟡 G-2. 소스 제거 뒤 GitLab 파이프라인이 "뒤 소스를 멈춘다"는 서술** — 코드 확인됨, GitLab 병렬 실행은 일반 동작 기준(추정)
- 위치: `guide/{en,ko,es}/setup/sources.md:25`(+ `push.md:7`이 GitLab에도 적용된다고 함), UI `messages/en.tsx:3438`(GitLab 문장 "next pipeline fails and stops the sources after it") 및 ko·es 사전.
- 실제: GitLab은 소스마다 job이 따로 있고 모두 기본 `test` stage, `needs` 없음(`lib/onboarding/gitlab-ci.ts:71-84`) → 같은 stage는 병렬이라 제거된 소스의 job만 red(`surface-removed`), 나머지는 적재된다. "뒤 소스가 멈춘다"는 GitHub 한 job·순차 step의 성질.
- 시나리오: GitLab 사용자가 빨간 파이프라인을 보고 다른 소스도 적재 안 됐다고 판단해 불필요한 Sync·재실행.
- 판정: 문서·UI 문구가 틀림(GitLab 갈래). 수정: `onGitLab` 문장을 "that source's job fails; other sources still update"로.

**🟡 G-3. sync 브랜치 보호 규칙 안내가 가이드·UI 어디에도 없음** — 확인됨(누락)
- 근거: ARCHITECTURE §3.02 L1074-1075 "보호 브랜치 … 안내는 `malmoi-i18n/sync-*`를 보호 규칙에서 빼라" — 그런데 guide/en 전체 `sync-` 0건, 사전에도 없음. Publish는 `force: true` 커밋(`lib/gitlab/client.ts:168-170`).
- 시나리오: 와일드카드로 모든 브랜치를 보호하는 그룹 → Publish·야간 Publish가 403/400으로 계속 실패, 저장 코드 `github-error`(`lib/sync/plan.ts:264`)라 화면은 "GitLab didn't answer"류 → 사용자는 원인 없이 재시도만.
- 수정: `setup/gitlab-ci.md` #protected-branch 절(지금 "base를 보호하라"는 자리)에 "`malmoi-i18n/sync-*`는 보호하지 않는다" 한 줄. (ARCHITECTURE가 약속한 안내가 구현에 없으니 UI 문구 쪽도 코드 결함 후보.)

**⚪ G-4. CI 원본 미발행 동안 GitLab 프로젝트의 기준 언어 변경이 영영 "Waiting to apply"** — 확인됨, 알려진 미완(CI 미발행)의 파생
- 위치: `guide/{en,ko,es}/setup/sources.md:35-37`(CI 실행에서만 적용, Sync는 안 됨 — 맞음), `setup/gitlab-ci.md:26` #ci-unavailable(CI 파일이 없는 동안 "야간·Sync가 리포 변경을 적재한다"만).
- 실제: `declaredBaseLocale`을 받아들이는 적재는 `/api/push`(`lib/push/guard.ts`·`apply.ts`)뿐. CI 파일이 없는 지금, GitLab 프로젝트의 기준 언어 변경은 적용될 길이 없다.
- 수정: #ci-unavailable에 "기준 언어 변경은 CI 파일이 생긴 뒤에 적용된다" 한 줄(또는 그동안 화면에서 막기 — 결정 사항이면 질문).

참고(낮은 확신·문서 밖):
- `setup/gitlab-ci.md:9` "keep **Visibility** at **Masked**" vs 앱 문구 "set Visibility to Masked"(`messages/en.tsx:2689`·`3876`) — GitLab 기본값이 Visible이면 가이드가 틀림(외부 사실, 미확인).
- 보호되지 않은 브랜치에서 `PUSH_TOKEN`이 없으면 job 로그에 한국어 문장·로컬 명령 안내가 찍힌다(`scripts/push-local.ts:93-97`) — ACTIONS §5도 "`PUSH_TOKEN이 없다`로 red". 코드 쪽 ⚪.
- ACTIONS §5의 러너 접속 대상 목록에 Docker Hub(job 이미지)가 빠짐(가이드엔 있음) ⚪.

가이드에서 맞다고 확인한 것: PAT 링크 `?name=Malmoi&scopes=api`, fine-grained·스코프·무효 거부, 14일 Expires soon, 목록 조건(40·비보관), Maintainer/Developer 문턱, 교체 같은 사용자, 해제 → Disconnected + 사건 + GitLab 토큰 미철회, "Use my GitLab connection"·"Replace token", 인용 UI 라벨 전부, `!iid`·MR 재사용·no-changes 닫기+삭제, `[skip-malmoi-i18n]`, CI job 구조·변수명, CI 미발행 문구, `open-pr`/`pr-check-failed` 보류, MCP `createdWithoutCi`·`workflow-unavailable`.

---

#### 요약 목록

| # | 등급 | 한 줄 | 판정 |
|---|---|---|---|
| C5-1 | 🟡 | SELF-HOSTING.md에 GitLab 0줄(§2 호환 축·§5 상류 clone·§7 미실행 행) | 문서 누락 |
| C5-2 | 🟡 | Disconnected GitLab 프로젝트는 CI 적재가 무기한 `pr-check-failed` — 문서·경고 문장이 말하지 않음 | 문서 누락 |
| D7-3 | 🟡 | DIRECTORY L992 `lib/mcp/tools/ci-file.ts`(없음) — 실제 `lib/onboarding/ci-file.ts` | 문서 틀림 |
| G-1 | 🟡 | logs.md "연결자 이름으로 기록" — 멤버 제거면 제거한 사람 | 문서 틀림 |
| G-2 | 🟡 | sources.md·UI "다음 파이프라인이 뒤 소스를 멈춘다" — GitLab은 job 병렬 | 문서·UI 틀림 |
| G-3 | 🟡 | `malmoi-i18n/sync-*` 보호 제외 안내가 가이드·UI에 없음 | 누락 |
| C5-3 | ⚪ | compose `GITHUB_APP_*`가 `${X}` — 선택 변수인데 `${X:-}` 아님 | 코드 |
| C5-4 | ⚪ | 구버전 롤백 중 토큰 키 회전 → PAT가 옛 키로 남음, 롤백 절에 경고 없음 | 문서 누락(추정) |
| C5-5 | ⚪ | 셀프 호스팅 계정 삭제 절차가 GitLab 연결 cascade·PAT 미철회를 말하지 않음 | 문서 누락 |
| C5-6 | ⚪ | 서버 egress(gitlab.com) 요구사항 미기재 | 문서 누락(선택) |
| C5-7 | ⚪ | `github-app.ts` 머리 주석이 D28 이전 서술 | 코드 주석 |
| C5-8 | ⚪ | App 없는 설치의 MCP GitHub 목록 → 브라우저 안내가 없는 컨트롤 | 관찰(추정) |
| D7-1 | ⚪ | CLAUDE.md·Action 주석 "해제는 FK SetNull로 끊는다" — 실제는 명시 update+사건 | 문서 부정확 |
| D7-2 | ⚪ | CLAUDE.md·ARCH `/api/push` 호출자·가용성 서술이 GitHub 전용 | 문서 낡음 |
| D7-4 | ⚪ | DIRECTORY에 onboarding-run gitlab-repos·gitlab-reconnect·locator, components/onboarding/repo-input 미등재 | 문서 누락 |
| G-4 | ⚪ | CI 미발행 동안 GitLab 기준 언어 변경이 적용될 길 없음 | 알려진 미완의 파생 |

### 차원 (6) UI·문구 — gitlab-repositories 감사

대상: `/Users/sinhyeok/code/malmoi-gitlab-audit` (f1c31866). 읽기 전용. 🔴 0 · 🟡 4 · ⚪ 5.

#### 검증 실행

- `pnpm test -- lib/i18n components/__tests__ lib/status components/account components/gitlab` → 실제로는 전 스위트가 돌았다: **859 files / 14393 tests passed, exit 0**.
- `vitest run` 집중 실행(server-render-graph · lib/i18n 전체 · gitlab-project-screens · components/gitlab · components/account · lib/status) → 27 files / 708 tests passed.
- 따라서 `dark:` 0 · raw 색 0 · 한글 리터럴 · 금지어(`banned-terms`) · `terminology` · `brand-spelling` · `dictionary-consistency` · `host.test` · `server-render-graph` 모두 green.
- 사전 대조는 스크립트로 했다: en의 모든 잎(함수는 더미 인자로 호출)을 걸어 `GitHub|pull request|PR|workflow|secret` 문장을 뽑고, `onGitLab` 덮기 유무와 소비 화면을 대조했다. GitLab 관련 191 키를 en·ko·es 세 열로 펼쳐 의미를 비교했다(mcp 절은 en 전용 — 의도).

#### 🟡

##### U1. MCP `remove_source`가 GitLab 프로젝트에 "workflow file의 step을 지우라"고 말한다
- 위치: `lib/mcp/tools/sources.ts:53` → `en.mcp.summary.sourceRemoved` (`messages/en.tsx:4146`). `mcp.summary.gitlab`에 `sourceRemoved` 짝이 없다. 같은 파일의 다른 요약(`workflow`·`publishPreview`·`published`·`pushToken`·`created`·`sourcesAdded`)은 전부 호스트로 갈렸는데 이것 하나만 빠졌다(D26 "호스트 어휘").
- 시나리오: GitLab 프로젝트에서 에이전트가 `remove_source` 호출 → 요약 "Removed app. Remove its step from the repository's workflow file, or the next run fails." → 에이전트가 `.github/workflows/`를 찾거나 사용자에게 GitHub 용어로 전달. 실제 조치는 `.gitlab-ci.yml`의 job 제거다(화면 `sources.onGitLab.removal.workflowLine`은 맞게 말한다).
- 수정: `mcp.summary.gitlab.sourceRemoved` 추가("Remove its job from .gitlab-ci.yml …") + `gate.repoHost`로 분기, `gitlab-tools.test.ts`에 단언.
- 확신도: 확인됨.

##### U2. Home의 GitLab Disconnected 배너 [Reconnect]가 명의 변경 문장 없이 한 번에 쓰기 명의를 바꾼다
- 위치: `components/home/actions.tsx:285` (`<ReconnectButton … host={repo.host} />`) → `components/reconnect-button.tsx:67` → `reconnectGitLabRepository` (`app/(edit)/projects/[slug]/settings/actions.ts:262`, 확인 인자 없음).
- 근거: design.md §2-6 "다른 OWNER가 프로젝트 설정에서 재연결(… 명의가 바뀐다는 문장을 먼저 보인다, 시안 G6c)". 설정 카드는 이를 지킨다(`repository-card.tsx:152-156` — `useMineHint` 뒤 [Use my GitLab connection], 토큰 주인은 [Replace token], 연결 없으면 PAT 입력). Home 배너는 보는 사람을 가르지 않는다.
- 시나리오 ①: 연결자 A가 떠나 `connection-removed` → OWNER B가 Home에서 [Reconnect] 클릭 → 경고 없이 이후 모든 커밋·MR이 B 명의가 된다. ② 토큰 주인 A의 토큰 만료(`connection-unusable`) → A가 Home [Reconnect] 클릭 → 같은 만료 토큰으로 재연결 시도 → `gitlab-reconnect` 거부("Replace it on the Account page"). 할 일(Replace token)이 아닌 실패하는 버튼이 primary로 선다.
- 수정: GitLab 갈래의 Home 배너 액션을 설정 Repository 카드로 가는 `ButtonLink`로 바꾸거나, 설정과 같은 보는 사람 3갈래(useMineHint 포함)를 쓴다. D25("Home은 Disconnected + 재연결 컨트롤")는 링크로도 충족된다 — 결정 해석이 필요하면 질문으로 올린다.
- 확신도: 확인됨(코드 경로). `gitlab-project-screens.test.tsx`에 Home 배너 GitLab 케이스가 없다(설정 G6c만 있다).

##### U3. Publish no-changes가 GitLab MR을 닫으며 "pull request"라고 쓴 코멘트를 남긴다
- 위치: `lib/pull/run.ts:164-165` `closedPrComment` — 호스트 무관 고정 문장 "…so this pull request has nothing left to merge. The next Publish with changes opens a new pull request." → `run.ts:424` `client.closePr(...)` → GitLab 클라이언트 `lib/gitlab/client.ts:223`이 MR note로 게시(D9 경로).
- 시나리오: GitLab 프로젝트에서 편집을 base와 같게 되돌린 뒤 Publish → 열린 MR `!12`이 닫히고 GitLab MR 화면에 "this pull request has nothing left to merge"가 남는다. DESIGN §10.1 리포 호스트 행이 "GitLab 프로젝트의 pull request"를 쓰지 않는 말로 둔다(앱 화면의 짝 `translations.publish.onGitLab.closedPr`은 merge request로 맞게 갈렸다).
- 수정: `closedPrComment(baseBranch, host)`로 호스트 낱말을 고르고(영문 고정) `run.ts`가 `project.repoHost`를 넘긴다. 단위 테스트 한 줄.
- 확신도: 확인됨. (PR/MR 본문 `Updated … from the translation DB`·제목은 호스트 중립이라 문제없다.)

##### U4. ko 사전에서 GitLab의 job이 두 낱말(`CI job` · `CI 작업`/`작업`)로 갈린다
- 위치: `messages/ko.tsx` — `job` 11곳(`logs.onGitLab.deferReasons.too-large`·`refusals.surface-removed`·`result.ingest.onGitLab.refsHint`·`sources.onGitLab.*`·`locales.onGitLab.field.help`·`settings.workflow.onGitLab.hookHint`·`settings.onGitLab.ci.description/sourcesLead`) vs `작업` 4곳(`:1144` `newProject.steps.result.onGitLab.description` "CI 작업", `:2121` `saveAs` "이 작업을", `:2127` `hookDoc` "GitLab CI 작업 추가", `:2129` `gitlabVariable` "작업은"). 가이드 `guide/ko/setup/gitlab-ci.md`는 "CI 작업"이다.
- 시나리오: 설정 CI 모달에서 한 문단 안에 "CI job의 MALMOI_I18N_WRAPPER 변수도 채워야 합니다 — **GitLab CI 작업 추가** 문서를 보세요"와 바로 위 "이 **작업**을 … 추가하세요"가 나란히 선다 — 같은 개념이 두 낱말(DESIGN §10.1 머리 원칙 "한 개념에 낱말이 둘이면 …"). `terminology.test.ts`의 `CONCEPT_BANNED`에 이 행이 없어 무방비다.
- 수정: ko 한 낱말로 통일(가이드 h1·`hookDoc`이 "작업"이므로 `job` 11곳을 "CI 작업"으로, 또는 반대) + DESIGN §10.1에 행 추가 + `CONCEPT_BANNED` 등재. `/translate` 모드 ①.
- 확신도: 확인됨.

#### ⚪

##### U5. PAT 만료일이 보는 사람 시간대로 찍혀 서쪽 시간대에선 GitLab 화면보다 하루 이르다
- 위치: `lib/gitlab-connect/verify.ts:56`(날짜 → 그날 00:00 UTC 저장) · `components/account/gitlab-section.tsx:61,67` · `components/settings/repository-card.tsx:90,130` · `components/onboarding/steps/repo.tsx:314` — 전부 `formatDay(expiresAt, style)`.
- 시나리오: 만료일 2026-11-12 토큰, 시간대 America/Los_Angeles → Malmoi "Expires Nov 11, 2026" · GitLab 토큰 화면 "Nov 12". 시각으로는 참이지만 사용자가 두 화면을 대조하면 어긋난다.
- 수정: 날짜 전용 값이므로 `timeZone: "UTC"`로 찍거나(날짜 키 `formatDayKey`) 그대로 두고 판단을 DESIGN에 적는다 — 질문.
- 확신도: 확인됨(동작) · 판단은 질문.

##### U6. PAT 폼의 세션 거부가 GitLab 문장으로 떨어진다
- 위치: `components/gitlab/token-form.tsx:52` → `lib/gitlab-connect/message.ts` · `app/(edit)/account/actions.ts:311-312`.
- 시나리오: 세션이 끝난 채 [Connect] → `unauthorized` → 폴백 "The GitLab connection failed. Try again." (다시 눌러도 같은 결과, 할 일은 로그인). 세션 저장소 장애 `unavailable` → "GitLab didn't answer." (GitLab을 부르지 않았다).
- 수정: `unauthorized`·`invalid input`은 기존 접근 문장(`accessErrorMessage`)으로 보낸다.
- 확신도: 확인됨. 드묾.

##### U7. `/account`의 같은 Expired가 두 카드에서 아이콘 칸 톤이 다르다
- 위치: `components/account/gitlab-section.tsx:89`(만료·임박이면 `IconTile tone=warning`) vs `components/account/github-section.tsx:72`(Expired여도 톤 없음).
- 시나리오: GitHub 인가 만료 + GitLab PAT 만료인 사용자 → 한 화면의 두 행이 같은 `Expired` 배지인데 칸 하나는 호박, 하나는 회색(DESIGN §2.4 "상태가 같으면 형태가 달라도 톤이 같다", 설정 카드 1-Y15 "배지와 아이콘 칸이 같은 상태 키"). GitLab 쪽이 시안 G8을 따랐으므로 GitHub 쪽이 옛 형이다.
- 수정: `/ux-audit` 후보 — GitHub 카드도 `STATE[state].tone`을 칸에 싣는다(GitHub 화면 불변 방침과 충돌하면 질문).
- 확신도: 확인됨.

##### U8. `autoComplete="new-password"`가 브라우저 비밀번호 생성·저장 제안을 부를 수 있다
- 위치: `components/gitlab/token-form.tsx:79`.
- 시나리오: Chrome이 `new-password` 필드에 "강력한 비밀번호 제안"을 띄우고, 제출 뒤 "비밀번호 저장?"을 물을 수 있다 — 사용자가 생성값을 PAT 칸에 넣거나 PAT를 사이트 비밀번호로 저장.
- 수정: 실물에서 확인 후 필요하면 `autoComplete="off"` + 1Password/LastPass 무시 속성(`data-1p-ignore`·`data-lpignore`)으로 바꾼다.
- 확신도: 추정(브라우저 실측 안 함). 나머지 PAT 필드 요건은 충족 — `type="password"`, 성공 시 `setToken("")`, 원문 미반환(`Connected`에 토큰 없음), 오류 시 값 유지는 "같은 값으로 다시 누른다"는 의도(design §2).

##### U9. 죽은 덮기 두 개 — GitLab에 `repo-replaced`가 생기지 않는다
- 위치: `messages/*.tsx`의 `home.onGitLab.banner.wrongRepository`·`settings.onGitLab.repository.health.repo-replaced`. GitLab 건강성은 숫자 id라 `repo-moved`만 낸다(`lib/gitlab/plan.ts:201-211`), `GitLabNotice`(`repository-card.tsx:92-97`)도 `repo-replaced`를 그리지 않는다.
- 영향 없음(소비자 0인 문장 셋 × 2). 지울지는 소비자 없는 문장 원칙에 따른 판단.
- 확신도: 확인됨.

#### 확인했고 문제없는 것

- **세 사전 의미 일치**: GitLab 관련 191 키(mcp 제외) 모두 ko·es에 있고 의미가 같다. D7(es·en `merge request` 영어 그대로, `Estado de la MR`은 GitHub `Estado de la PR`과 대칭), D14(ko `MR`, 조사 `MR이`·`MR을`, `GitLab이`·`GitLab으로`), 금지어(`머지 리퀘스트`·`머지 요청`·`병합 요청`·`solicitud de fusión/combinación`·문장 중간 `Merge Request`) 0건.
- **호스트 분기 누락**: 프로젝트 스코프 화면(Home·Settings·Logs·Sources·번역 작업 공간)은 전부 `withRepoHost`/`RepoHostScope` 아래다. `locales`·`translations`·`surfaces/new` 옛 경로는 redirect뿐이다. 섞인 목록은 행마다 `withRepoHost`, Inbox는 PR 낱말이 없다. 번호 `#`을 손으로 붙인 곳은 랜딩 목업뿐(`components/landing/mockup/publish.tsx:166`, GitHub 고정 픽스처). 남은 `GitHub` 문장(`settings.installed`·`settings.account.*`·`repositorySync.errors.not-connected`·`errors.connect.*`)은 GitHub 갈래에서만 그려지거나 손상 행(`repositoryId` null GitLab)에서만 닿는다.
- **영어 고정 표면**: `lib/mcp/**`·`app/api/pull`·`scripts/*`가 `@/messages/en`을 명시 import한다. `lib/` 코어에서 `getMessages`/`getDateStyle` 호출 0(`lib/i18n/*` 제외). ko·es import는 `lib/i18n/server.ts`뿐. CI 템플릿(`lib/onboarding/gitlab-ci.ts`) 로그·주석은 영문.
- **서버 렌더 그래프**: GitLab이 건드린 서버 파일(account·home·logs·settings·sources·translations page, `workflow-block.tsx`, `meta-column.tsx`, `input.tsx`)에 인라인 핸들러·함수 prop 전달 0. `EventDetail`에 넘기는 `m`은 서버→서버다. `server-render-graph.test.ts`는 R-X1 사각(삼항·이름·spread·ref 콜백)과 가드 프리미티브의 `busy`/`blocked` prop까지 세도록 넓혀져 있고 green이다. 서버 파일에서 `busy=`·`blocked=` 전달 0.
- **GitHub↔GitLab 일관성**: Disconnected/Reconnect/Expired/Expires soon의 톤·낱말은 `STATE` 한 경로이고 `cross-screen.test.ts` MATRIX에 GitLab 행(연결자 떠남·토큰 못 씀·저장 만료일)이 있다. 목록의 저장 만료일 사전 판정(D24)은 `lib/projects/list.ts:94`에 들어가 있다. Disconnect 트리거·확정 둘 다 danger이고, 접근 이름(`Disconnect GitLab`)이 보이는 글자(`Disconnect`)를 포함한다(WCAG 2.5.3).
- **접근성**: 글리프는 전부 `aria-hidden`이고 호스트 이름이 글자 또는 `sr-only`로 선다(목록·Sources·Home Platform). PAT 폼은 label·help·status(`role="status"`)·error를 `aria-describedby`로 잇고 `aria-invalid`, 빈 값은 `aria-disabled` + 이유.
- **375px**: 정적으로 넘치는 고정 폭은 보이지 않는다(`w-[480px] max-w-full @max-form:w-full`, `break-all`/`wrap-anywhere`). 실측은 하지 않았다(D29 런타임 QA 몫).

### E — 테스트 공백 + 원칙·부채 (GitLab 범위)

대상: `/Users/sinhyeok/code/malmoi-gitlab-audit` @ f1c31866 (범위 `b7c58993..HEAD`). 읽기 전용, 수정 없음.

#### 실행 결과

- `pnpm test`: **green.** Test Files 859 passed · 1 skipped (860), Tests 14393 passed · 2 skipped, exit 0 (269s).
- GitLab 통합 3개(`vitest.projects.config.ts`, 격리 PG): `lib/gitlab/__tests__/connection-state.integration.ts` · `lib/gitlab-connect/__tests__/connection.integration.ts` · `lib/mcp/__tests__/gitlab-tools.integration.ts` → **3 files / 53 tests green.**

#### 발견

##### 🟡1 `listGitLabRepositories`(① 목록)의 분기 대부분에 테스트가 없다
- 위치: `lib/onboarding-run/gitlab-repos.ts:34-77`
- 테스트가 밟는 것: 한 페이지 성공(MCP 통합 `gitlab-tools.integration.ts:136`), 연결 없음(`:166`). MCP 단위 테스트는 코어를 통째로 mock한다(`gitlab-tools.test.ts:28`).
- 밟지 않는 것: 여러 페이지(`x-next-page`), `MAX_PAGES`(20) 초과 시 `truncated: true`, 중간 페이지 실패를 목록 전체 실패(`unavailable`)로 처리하는 분기, 401·`insufficient_scope` → `gitlab-reconnect`, 모양이 다른 응답 → `unavailable`, `limit-reached`가 연결 확인보다 먼저 나는 순서, 만료된 연결 → `gitlab-reconnect`(만료는 `detect_formats`로만 잰다), 질의 필터(`min_access_level=40`·`archived=false`·`order_by=id`).
- 실패 시나리오: catch가 이미 읽은 행을 `ok`로 돌려주도록 바뀌거나 `min_access_level=40`이 빠져도 red가 없다. ①에 잘린 목록이나 Developer 권한 리포가 뜨고, 생성 단계에서야 `repo-read-only`로 거부된다.
- 추천: `createFakeGitLabFetch`와 harness prisma로 단위 테스트를 쓴다(페이지 2·21쪽, 2쪽 503, 401, 모양 오류, 질의 파라미터 단언).
- 확신도: 확인됨

##### 🟡2 `reconnectGitLabProject`의 잠금 뒤 조건부 쓰기와 거부 갈래에 테스트가 없다
- 위치: `lib/onboarding-run/gitlab-reconnect.ts:37`(GitHub 행 가드), `:45-66`(잠금 → 조건부 `updateMany` → 0행이면 `repo-forbidden`)
- 테스트가 밟는 것(`connection.integration.ts:216-270`): 성공(상속 Maintainer), Developer·Guest, 호출자 연결 없음, 멤버 아님·EDITOR·보관.
- 밟지 않는 것:
  - **`written.count === 0`(경합) 갈래**
  - 원격 왕복 뒤 잠금 안 재인가 실패(강등)
  - GitHub 행 → `invalid input`(원격 0)
  - 호출자 PAT 401·만료 → `gitlab-reconnect`
  - GitLab에서 보관됨 → `gitlab-repo-archived`
- 실패 시나리오: `where`에서 `gitlabConnectionId: project.gitlabConnectionId`가 빠져도 red가 없다. 그러면 두 OWNER가 동시에 재연결할 때 늦은 쪽이 먼저 끝난 쪽의 참조를 조용히 덮고, 옛 `before`를 실은 사건을 남긴다. CLAUDE.md "잠금 뒤 조건부 쓰기"의 회귀 방어선이 없는 상태다.
- 추천: 통합 테스트를 하나 추가한다. `members/all` 응답 콜백 안에서 `project.gitlabConnectionId`를 다른 연결로 바꾼 뒤 `repo-forbidden` · 사건 0 · 참조 불변을 단언한다. GitHub 행 → `invalid input` + fetch 0도 함께 단언한다.
- 확신도: 확인됨

##### 🟡3 `checkGitLabAccess`의 생산자 갈래가 실제 fetch로 검증되지 않고, 보관 처리에 대한 주석이 D25와 어긋난다
- 위치: `lib/onboarding-run/access.ts:99-115`(meta → 오류 매핑, `requirePush && meta.archived`), 주석 `:86`
- 테스트 공백: `gitlab-repo-archived`·`gitlab-repo-unsupported`·호출자 401 → `gitlab-reconnect`·`members/all` 5xx → `unavailable`, 그리고 "읽기는 보관돼도 통과"가 한 번도 생산되지 않는다. 순수 함수 `planProjectMeta`는 테스트되지만, switch 매핑과 `requirePush &&` 순서는 테스트가 없다. 통합 테스트의 `accessRoutes(…, { archived })` 인자도 쓰이지 않는다.
  - 실패 시나리오: `unsupported`를 `repo-forbidden`으로 매핑하거나 `requirePush &&`를 지워도 red가 없다(메시지 테스트만 green이다).
- 주석 불일치: `:86`은 "읽기(수동 Sync·브랜치 목록)는 보관돼도 된다"고 말한다. 그런데 D25 ②는 "보관 = 읽기도 거부"이고, 리더도 `openProject`(`lib/gitlab/client.ts:92`)에서 보관이면 던진다.
- 추천: 통합 테스트에 보관·SHA-256·401 케이스를 더한다. 주석은 "호출자 검사는 통과시키고, 보관 거부는 프로젝트 연결 쪽 `openProject`가 한다(D25)"로 고친다.
- 확신도: 확인됨

##### 🟡4 연결자 쪽 실패(보관·토큰 만료·철회) 상태에서 다른 OWNER가 수동 Sync하면 `ingest-failed`로 끝나고 소스가 실패 상태가 된다 — 시나리오 테스트 없음
- 위치: `lib/onboarding-run/import.ts:62-67` → `lib/import/run.ts:359`(`openReader()`) → `:399-407` catch
- 경로(코드로 확인함): 호출자 검사는 **호출자 PAT**로 하므로 통과한다(`requirePush: false`라 보관도 통과). 리더는 **프로젝트 참조 연결 PAT**로 연다. 거기서 만료·401·보관이면 `needsReconnect`(not-installed)를 던진다. outer catch는 수동 실행일 때 모든 표면에 `failure`(`ingest-failed`)를 기록하고 `{ ok: false, error: "ingest-failed" }`를 돌려준다.
- 실패 시나리오: 연결자의 PAT가 만료된 프로젝트에서 자기 PAT가 유효한 다른 OWNER가 MCP `sync_repository`(또는 Action 직접 호출)를 부른다. 결과는 "가져오기 실패"이고 소스 카드가 실패 상태가 된다. 사용자가 받아야 할 문장은 `gitlab-reconnect`/`gitlab-project-disconnected` 계열(재연결)이다. Home은 D25 ③으로 Sync를 비활성화하지만, MCP·직접 호출은 막지 않는다.
- GitHub와의 비대칭: GitHub 호출자 검사는 설치를 probe하므로 같은 원인이 먼저 거부로 나온다. GitLab만 연결자 쪽 원인이 리더 열기에서야 드러난다.
- 추천: 읽기 전에 거부로 돌린다. 리더 열기의 `not-installed` AppError를 `refuse("gitlab-project-disconnected")`로 바꾸거나, 사전에 `loadGitLabHealth` 같은 판정을 넣는다. connection-state 통합 테스트에 시나리오를 추가한다(연결자 만료 + 다른 OWNER Sync → 결과 코드와 표면 상태).
- 확신도: 경로는 확인됨. 화면 문장은 추정.

##### 🟡5 GitLab 행의 목록 원격 신호(열린 MR · base 앞섬)가 끝에서 끝까지 검증되지 않고, 가짜 compare가 항상 "변경 없음"이다
- 위치: `lib/projects/remote.ts:106-160`(`signalsFor`), `lib/gitlab/__tests__/fake-repo.ts:150-151`(`GET /repository/compare`가 늘 `commits: [], diffs: []`)
- 테스트 공백: `lib/projects/__tests__/remote.test.ts`에는 GitHub 픽스처만 있다(`:20`·`:184`). GitLab 행의 `connection-removed` → NONE, iid → `isPullRequestOpen`, `compareToBase` ahead → `repoAheadFiles`를 잇는 테스트가 없다. 단위 테스트는 `reviewNumberFrom`(`remote-plan.test.ts:131-142`)과 `compareToBase`의 인자(`client.test.ts:221`)만 잰다. 가짜 compare가 고정값이라 통합 테스트도 "GitLab에 새 변경"을 한 번도 만들지 못한다.
- 실패 시나리오: `signalsFor`·`loadRemoteSignals`의 GitLab 행 처리(대상 조립, 신호 합산)가 회귀해도 red가 없고, 목록의 원격 변경 띠가 조용히 사라진다(ship.md 6.2 #155 형).
- 추천: `remote.test.ts`에 GitLab 대상을 추가하고(가짜 `createClient`), fake-repo compare가 `from`·`to` 커밋 사이의 파일 diff를 계산하게 한다.
- 확신도: 확인됨

##### ⚪6 `lib/gitlab/client.ts`의 남은 오류 분기
- 위치: `findOpenPr`의 `MR_PAGES` 소진 → 던짐(`:199`), 2xx인데 모양이 다른 커밋·MR 응답(`:173`·`:209`·`:235`), `listGitLabBranches`에서 `openProject` 실패(보관·401) → `unavailable`, `updatePrTitle`·`updatePrBase` 실패
- 그 밖의 쓰기·읽기 갈래(재시도 0, 409, 노트 → 닫기 순서, 404 = 이미 수렴, keyset 상한, 주인 권한)는 `client.test.ts`·`publish.test.ts`가 촘촘히 잰다.
- 추천: `findOpenPr`의 10쪽 소진 1건과, 커밋 201인데 `id`가 없는 경우 1건을 추가한다.
- 확신도: 확인됨

##### ⚪7 `connectGitLabAccount`·`disconnectGitLabAccount`의 경합 갈래에 테스트가 없다
- 위치: `lib/gitlab-connect/connection.ts:86-89`(P2002 → replace), `:82`(replace 0행 → `unavailable`), `:133-134`(잠금 뒤 참조 재조회)
- 실패 시나리오: 다른 탭이 연결을 해제한 직후 교체하면 `unavailable`(일시 장애 문장)이 뜨는데, 실제로는 다시 연결하면 되는 상황이다. 이것은 추정이고 경로 자체도 테스트가 없다.
- 추천: P2002는 통합 테스트에서 `create` 직전에 같은 userId 행을 넣는 방식으로 재현할 수 있다. 나머지는 리포트에 남겨 둔다.
- 확신도: 코드는 확인됨, 시나리오는 추정

##### ⚪8 문서·테스트 이름이 해제 구현과 어긋난다
- 위치: `app/(edit)/account/actions.ts:322-323`의 `disconnectGitLab` 주석("행을 지우면 FK `SetNull`이 같은 문장에서 끊는다"), `connection.integration.ts:177`의 테스트 이름("같은 문장에서 끊긴다"), CLAUDE.md 데이터 경로 표의 GitLab PAT 행("해제는 FK SetNull로 참조 프로젝트를 끊고")
- 실제(`connection.ts:109-143`): 참조 프로젝트를 정렬해 잠근다 → 참조를 **명시적으로** 비운다 → 같은 tx에서 사건을 남긴다 → 행을 삭제한다. FK `SetNull`은 계정 삭제용 그물일 뿐이다.
- 추천: 주석과 테스트 이름을 "같은 tx에서 명시적으로 비우고 사건을 남긴다"로 고친다.
- 확신도: 확인됨

##### ⚪9 테스트 이름이 실제로 밟는 분기보다 넓게 주장한다
- `app/(edit)/__tests__/gitlab-connect.test.ts:53-55`: 이름은 "세션·원격을 읽기 전에 invalid input"이다. 그런데 `"glpat bad"`는 zod를 통과하고 `readSession` **뒤** 코어의 `isTokenShaped`에서 거부된다. 단언은 fetch 0뿐이다.
- `lib/gitlab/__tests__/connection-state.integration.ts:300-308`: PAT 0건 테스트에 비공허 확인이 없다. 콘솔에 실제로 무엇이 남았는지, PAT가 원격으로 실렸는지를 보지 않는다. 같은 성격의 MCP·connection 통합 테스트에는 이 확인이 있다.
- 확신도: 확인됨

##### ⚪10 GitLab 경로 안의 손 사본(판정 중복)
- `remote()` RemoteResult 래퍼가 3벌이다: `lib/gitlab/client.ts:64`, `lib/gitlab-connect/connection.ts:27`, `lib/onboarding-run/access.ts` 하단.
- `path_with_namespace` 분할이 2벌이고 가장자리 규칙이 다르다: `lib/gitlab-connect/access-plan.ts:94-95`는 끝 `/`를 거부하고, `lib/onboarding-run/gitlab-repos.ts:63-64`는 `slash <= 0`만 본다.
- fork MR 제외가 2벌이다: `lib/gitlab/plan.ts:167`은 state·source_branch까지 다시 보고, `lib/cli/gitlab-ci-input.ts:101-105`는 project id만 본다(안내 전용이라 영향은 작다).
- 추천: 분할은 `planProjectMeta` 쪽 규칙 하나로 합친다. 나머지는 리포트에 남겨 둔다.
- 확신도: 확인됨

##### ⚪11 `gitlabTokenExpiresAt?`가 선택 필드라, 빠뜨려도 D24 판정이 조용히 꺼진다
- 위치: `lib/projects/list.ts:43`, `lib/keys/query.ts:230`(주석: "없으면 판정하지 않는다")
- 실패 시나리오: 새 `projectStatus` 행 생산자가 이 필드를 싣지 않으면 만료된 GitLab 프로젝트가 목록·Inbox에서 `active`로 보이고 typecheck도 통과한다. 지금의 생산자 둘(`keys/query.ts:375`, `inbox/load.ts:56`)은 싣는다.
- 추천: 필수 `Date | null`로 바꾼다(`DateStyle`이 "기본값 없음"으로 typecheck에 잡히게 한 것과 같은 방식).
- 확신도: 추정(미래 회귀 위험)

##### ⚪12 `Array.isArray(unknown)`이 만든 암묵 `any`로 필드에 접근한다
- 위치: `lib/gitlab/client.ts:314`(`branch.name`), `scripts/smoke-gitlab.ts:52-54`(`item.path_with_namespace`, `item.id`). 같은 일을 하는 `lib/cli/gitlab-ci-input.ts:101`은 `(mr: unknown)`로 좁힌다.
- 추천: zod 스키마 또는 `unknown` 좁히기로 통일한다.
- 확신도: 확인됨

#### 확인했고 문제없음

- **gate-plan 트리거**: `lib/repo-host/`·`lib/gitlab/`·`lib/gitlab-connect/`가 등재돼 있다(`scripts/gate-plan.ts:47-49`). D21 경로(`lib/auth/members.ts`·`lib/projects/list.ts`)와 C 인계 경로도 있고, `vitest.projects.config.ts` include에 GitLab 디렉터리 셋이 있으며 `gate-plan.test.ts:87-120`이 대조한다. 통합 테스트 셋이 직접 import하는 생산 경로는 전부 트리거 안이다. 사소한 점: `:46` 주석의 "비어 있는 GitLab 디렉터리도 미리 둔다"는 이제 옛말이다.
- **D13·D19·D20·D26**:
  - fine-grained 거부·빈 `granular_scopes`·스코프 순서: `verify.test.ts:36-51`
  - account-mismatch: `connection.integration.ts:162`
  - 해제·연결자 제거 사건(행위자·payload·다른 프로젝트 불변): `connection.integration.ts:281-316`
  - MCP 호스트 어휘·발행 전후 CI 파일(`GITLAB_CI_RELEASE` mock으로 두 상태 모두): `gitlab-tools.test.ts`·`gitlab-tools.integration.ts`
- **gitlab-ci 템플릿**: SHA 박기·`unreleased` fail-closed·clone → 대조 → 실행 순서·`$$` 이스케이프는 `gitlab-ci.test.ts`, 실제 셸 대조 줄은 `scripts/__tests__/gitlab-ci-template.test.ts:122-168`, `ciFileOf`의 발행 전후 분기는 MCP 단위 테스트가 잰다.
- **GitHub 경로 바이트 불변**: 저장되는 `deliveryContextFingerprint`는 GitHub 분기 바이트를 그대로 두고 golden 해시로 고정했다(`context.test.ts:22-23`). 렌더는 `render-parity.test.ts`, GitClient 계약은 `github-contract.test.ts`가 잰다. 바이트가 바뀐 것은 저장하지 않는 지문(Publish·폐기 승인)과 샘플 확인값 형식뿐이고, 둘 다 주석에 의도가 적혀 있다(배포 순간 진행 중이던 GitHub 온보딩 확인값은 재탐지로 풀린다). `runPull`의 GitHub 요청 순서(커밋 뒤 ref 조회 → 생성 또는 force)도 그대로다.
- **코드 컨벤션**:
  - 환경변수 최상위 평가: `.gitlab/malmoi-i18n-push/run.ts`의 `process.env`는 CLI 진입 스크립트라 해당 없음.
  - `server-only`: `lib/gitlab/*`·`lib/repo-host/index.ts`에 없는 것은 주석에 적힌 의도적 예외이고, `client-graph.test.ts`가 지킨다.
  - 프로토타입: `gitlabConnectErrorMessage`는 `Object.hasOwn`을 쓰고 `__proto__`·`toString` 테스트도 있다. `nextKeysetQuery`의 `Object.fromEntries`는 own property를 만들므로 안전하다.
  - 명시적 `any`: 0건.
- **자격증명 경계**: `credential-separation.test.ts:288+`가 PAT를 여는 자리를 `파일#함수` 정확 집합으로 고정하고, 연결 경로에서 비GET 호출을 센다.
- **"mock이 너무 넓어 무의미"한 테스트**: 가짜 fetch가 등록되지 않은 경로에 던지는 오류는 `unavailable`로 분류된다. 그래서 `unavailable`을 단언하는 테스트들이 엉뚱한 이유로 green인지 살폈고, 해당 사례는 없었다(모두 경로를 명시했다). 문제는 가짜 compare 고정값(🟡5) 하나다.
