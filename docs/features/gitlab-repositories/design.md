# GitLab repositories — 기술 설계 초안

상태: 구현 보류 · [spec.md](spec.md)의 미확정 결정이 선행한다. 이 문서는 "저장소 제공자" 대신 **리포 호스트**라고 쓴다(spec §5).

## 1. 현재 코드와 분리 경계

| 현재 위치 | 재사용할 계약 | 분리·수정할 결합 |
|---|---|---|
| `lib/adapters/types.ts`·포맷별 어댑터 | 경로·내용 입력, 탐지·파싱·결정적 write | 리포 호스트 조건을 추가하지 않는다 |
| `lib/push/{payload,plan,apply}.ts` | 페이로드 생산·검증·strict 적재 | 리포 호스트 identity를 CI 입력과 서버 설정 사이에서 검증 |
| `app/api/push/route.ts` | 프로젝트 토큰 인가·보류 응답 | 열린 PR 판정이 `installationId`를 읽는다 |
| `lib/import/{run,apply-plan}.ts` | 실행권·설정 revision·일괄 적재 | `installationId` 및 GitHub reader 의존 |
| `lib/onboarding/readiness.ts` | 설치 존재 → 첫 적재 성공 두 단계 | 설치 id 존재를 공통 연결 증명으로 대체 |
| `lib/pull/{plan,render,load}.ts` | 렌더·변경 판정·전달 확인 | 리포 호스트별 프로젝트 조회 배선 점검 |
| `lib/pull/{client,run,payload,targets}.ts` | Publish 순서·보호 계약 | Git Data API 단계와 `owner:branch` PR 조회 |
| `lib/nightly/run.ts` | Publish/적재/스킵 분기 | 대상 선정이 `installationId` 전제 |
| `lib/projects/{open-pr,remote,list}.ts` · `lib/inbox/load.ts` | 열린 PR·원격 상태·목록·Inbox | `installationId` 전제 |
| `lib/projects/open-pr-memo.ts` · `lib/github-connect/probe-memo.ts` | 요청 내 메모 | 키가 `(owner, name, installationId, repositoryId)`이고 리포 호스트가 없다 |
| `lib/github-connect/health.ts` (`planConnectionHealth`) | 연결 상태 판정 | GitHub 설치·인가 전제 |
| `lib/mcp/tools/project.ts` · `lib/mcp/confirm.ts` | MCP 도구·승인 지문 | confirm context에 `installationId: string` 필수 |
| `lib/github.ts`·`lib/github-connect/` | 기존 GitHub 동작 | GitHub 전용 구현으로 유지 |
| `prisma/schema.prisma` | Project/Surface/Key/Translation/Member/Event | 리포 호스트·주소·쓰기 자격증명 |

이 표는 핵심만 담는다. 테스트 밖에서 `installationId`를 참조하는 파일은 2026-10-08 기준 52개다 — **전수 표는 재개 0단계 산출물이다**(지금 적으면 재개 때 stale).

공통 번역 코어 하나와 실제 소비자가 있는 리포 호스트 구현 둘을 둔다. 파일 포맷 어댑터와 리포 호스트 구현은 별개 축이다. GitLab 구현을 하는 배치에서 GitHub 소비자도 같은 경계로 옮기며, 미리 추상화만 추가하지 않는다.

## 2. 영향 받는 흐름

### 적재와 Sync

서버 설정으로 리포 호스트를 결정 → 불변 repository id로 연결·호출 경로별 권한 검증 → 특정 commit의 완전한 파일 스냅샷 → 기존 탐지·read → 기존 보호 판정과 strict 적재. 파일 다운로드는 DB 트랜잭션 밖, 최종 인가·설정·실행권 재검증은 Project → 정렬된 Surface 잠금 안에서 한다.

호출자의 리포 권한과 서버의 리포 쓰기 자격증명은 구분한다. 생성·재연결·소스 추가·push 토큰 회전은 호출자의 리포 쓰기 권한을 확인한다. **수동 Sync와 연결된 프로젝트의 base branch 목록·저장(`updateRepositorySettings`)은 읽기 권한만 가진 OWNER도 허용**한다(PRODUCT §3·ARCHITECTURE §6.4, #123 회귀). 이 구분을 두 리포 호스트에 동일하게 적용하고, CI·야간 실행에 대화형 사용자 권한 검사를 추가하지 않는다.

CI는 현재 `lib/push/payload.ts` 생산자를 재사용한다. `/api/push`의 프로젝트 토큰이 대상을 결정하며 요청의 리포 호스트·리포명은 라우팅 권한이 아니다. 기존 GitHub 페이로드와의 호환 및 namespace 하위 그룹 입력을 검증한다. GitLab CI 쪽의 제약(배포 형태는 spec §6 미결):

- **바뀌는 참조로 말모이 코드를 받지 않는다.** GitLab에는 composite action이 없다 — `include: remote`·브랜치 ref로 받으면 말모이 쪽 커밋 하나가 `PUSH_TOKEN`을 가진 남의 러너에서 즉시 돈다(CLAUDE.md의 `@main` 금지와 같은 부류). 불변 태그나 SHA로 고정한다.
- 릴리스 축은 앱 태그 `v<x.y.z>`·GitHub action 태그 `malmoi-i18n-push-vN`과 별개로 둔다.
- `PUSH_TOKEN`은 protected·masked CI/CD 변수로, 보호 브랜치 파이프라인에서만 노출한다.
- base 브랜치 조건·`[skip-malmoi-i18n]` 루프 가드·열린 MR 경고는 서버가 아니라 템플릿 책임이다. 현재 action은 `github.event.head_commit.message`와 `gh pr list`에 기대므로 GitLab에서 새로 만든다. GitLab은 merge·squash 커밋 메시지 템플릿을 프로젝트마다 바꿀 수 있어 MR 제목의 마커가 커밋에 남는다는 보장이 없다(POSTMORTEM 2026-09-17).
- `/api/push/failure` 계약을 그대로 따른다 — 적재 없음, `lastCommitSha` 미전진(전진시키면 다음 push가 `stale-commit` 409).
- 외부 계약 문서 `docs/ACTIONS.md`에 GitLab 절을, 안내 화면 `components/onboarding/workflow-block.tsx`·`components/settings/ci-card.tsx`에 `.gitlab-ci.yml`과 masked 변수 안내를 짝으로 만든다.

자동 적재는 pending token·열린 PR/MR을 공통 판정으로 받고 조회 실패를 닫힘으로 해석하지 않는다. 사전 전달 revision과 잠금 뒤 revision 비교도 그대로 유지한다. 야간의 Publish/적재/스킵 분기와 수동 Sync 승인 지문을 복제하지 않는다.

지문은 둘이다 — **승인 지문**(`lib/mcp/confirm.ts`, context에 `installationId: string` 필수)과 **전달 문맥 지문**(`deliveryContextFingerprint({repositoryId, baseBranch, surface})`, `lib/translations/context.ts`·`lib/pull/load.ts`). 둘 다 리포 호스트 identity와 연결 변경이 반영돼 오래된 승인이 재사용되지 않아야 한다. ⚠️ **기존 GitHub 행의 지문 입력·출력은 바이트 단위로 보존하고 GitLab일 때만 리포 호스트를 섞는다** — 입력을 일괄로 바꾸면 배포 순간 기존 `DeliveryConfirmation`이 전부 무효가 된다.

### Publish

기존 미전달 캡처 → base SHA 고정 → 완전한 tree와 원본 blob 읽기 → 공통 render·변경 판정 → 전달 확인 무효화 → 리포 쓰기 → 성공 관측 → 기존 DB 확정 순서다.

`GitClient`의 `createTree/createCommit/updateRefForce`를 GitLab이 흉내 내도록 강제하지 않는다. 공통 코어가 필요로 하는 **고정 base에서 파일 스냅샷을 발행하고 review request를 유지하는 동작**으로 경계를 잡는다. 구체 함수 서명은 인증·실물 검증 뒤 확정한다. GitHub의 첫 외부 쓰기 이전 무효화와 API 호출 생략 동작을 보존한다.

GitLab 후보는 [Commits API](https://docs.gitlab.com/api/commits/)의 파일 actions, `start_sha`, `force`와 [Merge requests API](https://docs.gitlab.com/api/merge_requests/)다(2026-10-08 조회). 이것은 구현 가능성의 근거이며 실물 검증 완료를 뜻하지 않는다. `start_sha`에 캡처한 base를 사용해 기존 sync 브랜치와 값을 병합하지 않는다. tree·commit·ref 세 단계가 호출 하나가 되므로 "첫 외부 쓰기"도 그 호출 하나다.

⚠️ **GitLab에는 브랜치 ref를 강제로 옮기는 API가 없고, Commits API는 action이 1개 이상이어야 해서 빈 커밋으로 base에 맞출 수도 없다.** 그래서 GitHub의 no-changes 동작(`lib/pull/run.ts` — `staleHead !== baseHead`면 무효화 → PR 닫기 → `updateRefForce`로 base 리셋)을 그대로 옮길 수 없다. 후보는 **MR 닫기 → sync 브랜치 삭제**(이후 `staleHead === null`)이고 순서는 고정이다 — GitLab은 source 브랜치를 지워도 MR을 자동으로 닫지 않는다. 이것을 GitHub 동작과 동등으로 인정할지는 spec §6 미결이다. 어느 쪽이든 수렴해야 한다: 종료 상태에 도달하지 못하면 변경 없는 야간 실행마다 무효화와 외부 쓰기가 반복된다.

다음은 착수 전 실물 검증 게이트다.

- 고정 base를 부모로 재생성하며 변경 외 파일·파일 mode를 보존한다. 보호 브랜치가 거부하면 제한을 우회하지 않는다.
- MR은 source branch로 후보를 찾되, `source_project_id`와 `target_project_id`가 모두 저장된 repositoryId와 일치하는 열린 MR만 재사용하고 target branch 변경을 처리한다. 동명 브랜치를 가진 fork의 MR은 제외하며 no-changes에서도 닫지 않는다([프로젝트 MR 목록 API](https://docs.gitlab.com/api/merge_requests/#list-project-merge-requests)). 동시 생성·응답 유실 뒤 재조회와 자동 적재 보호 판정에도 같은 식별을 적용한다.
- no-changes에서 기존 MR에 이유를 남기고 닫은 뒤 sync 브랜치를 정리한다. **두 번째 no-changes 실행은 외부 쓰기 0회**여야 한다.
- 커밋 성공/MR 실패, 타임아웃, 실행권 만료, Publish 도중 쓰기 토큰 만료에서 전달 확인·편집 토큰을 성공으로 만들지 않는다("결과 미확인").
- 페이지네이션 완료·파일 크기·UTF-8 바이트·blob hash를 확인한다. 불완전한 목록을 삭제 또는 변경 없음으로 판정하지 않는다. GitLab tree API의 `id`는 SHA-1 리포에서 git blob id와 호환된다 — SHA-256 리포는 연결 시 거부한다(spec §5).

### 편집 UI·MCP

편집 기능·역할은 공유한다. MCP가 Action을 호출하지 않고 같은 코어를 쓰는 구조를 유지한다. 내부 쓰기는 Server Action, 외부 push는 Route Handler다.

GitHub 고정 문구·URL·글리프가 있는 표면(2026-10-08 `messages/en.tsx`·`components/` 기준, 재개 0단계에서 전수 grep으로 갱신):

| 사전 namespace · 컴포넌트 | 변경 유형 |
|---|---|
| `translations`(33곳) — Publish 모달, 키 상태 필터 `New from GitHub`, 기준 언어 배너의 "GitHub Actions workflow" | 낱말 · URL |
| `account`(19곳)·`errors`(8곳) — `components/account/github-section.tsx` 연결·재인가 | 흐름 분기 |
| `newProject`(12곳) — `components/onboarding/connect-github.tsx`·`steps/repo.tsx`·`workflow-block.tsx` | 흐름 분기 · CI 안내 |
| `projects`(8곳) — `newFromGithub` 버튼, 띠의 `Open on GitHub`, `Connect the GitHub App` | 낱말 · URL · 흐름 분기 |
| `repositorySync.not-connected`, `locales.help`, `mcpConnector`의 `project:create` 권한 설명 | 낱말 |
| `components/settings/ci-card.tsx` | CI 안내 |
| `components/shell/attention-inbox.tsx` | 낱말 · URL |
| Logs·Home·소스 — `GitPullRequest*` 글리프(`publish-button.tsx`·`logs/glyph.tsx`·`home/count-cards.tsx`) | 유지(git 일반 글리프라 리포 호스트 무관) |
| MCP 도구 설명·`get_workflow`의 `.github/workflows/malmoi-i18n.yml`·필드명 `lastPublishPullRequest`·`newFromGitHub` | 낱말 · 경로 · 호환 정책 |
| `guide/en·ko·es` 23개 파일 × 3 · README · 랜딩·SEO·공개 문서(`landing`·`seo`·`publicDocs`, `app/page.tsx`) | 포지셔닝 결정(spec §6)에 따름 |

**제외 대상** — 말모이 자체 리포를 가리키는 링크는 바꾸지 않는다: `/changelog`의 View on GitHub, 공개 헤더·푸터의 GitHub 링크.

용어 규칙은 정본이 먼저 바뀐다. DESIGN §10.1의 "Malmoi GitHub App" 호칭·`pull request` 허용 근거("GitHub의 고유명사이고 링크가 실제로 그리 간다"), §2.4의 "Couldn't check for an open pull request" 행, §6 메타 열의 "파랑은 GitHub으로 나가는 것뿐", `lib/i18n/__tests__/helpers/banned-terms.ts`의 PR·App 호칭·조사 규칙이 GitHub을 고정한다. PR/MR 호칭(spec §6)이 닫히면 이 정본과 banned-terms를 사전 작업보다 **먼저** 고친다.

브랜드 글리프 — `lucide-react`에는 GitHub·GitLab 브랜드 아이콘이 없다. GitLab 글리프는 이 리포의 유일한 브랜드 글리프 위치인 `components/signin/brand-icons.tsx`에 추가하고 `components/__tests__/github-glyph.test.ts`의 집계를 확장한다. tanuki를 다색(§6.2 raw 색 예외, Google 로고 선례)으로 둘지 단색 `currentColor`로 둘지는 시안 단계에서 정한다.

연결 상태와 §2.4 톤 매핑(미결 — 시안·인증 결정 뒤 채운다):

| 상태 | §2.4 |
|---|---|
| 만료 (`Expired`) | 기존 행 재사용 후보 |
| 철회 / 재연결 필요 | 기존 `repositoryConnectionState` 값 재사용 후보 |
| 일시 장애 (`Couldn't check`) | 기존 행 재사용 후보 |
| 쓰기 토큰 만료 임박 | 새 행 필요(지금 §2.4에 사전 경고 톤이 없다) |
| 플랜 미달(Free라 프로젝트 토큰 불가) | 새 행 필요 — 온보딩 차단 오류 |
| 보호 브랜치 권한 부족 | 미정 |

초대 이메일도 영향 범위다. `lib/invitation-email/template.ts`의 GitHub 고정 소개 문구를 리포 호스트 중립 문구로 바꾸고 두 리포 호스트의 초대에서 검증한다. 사전을 통하지 않는 영문 템플릿이므로 사전 갱신과 별도로 다룬다. self-hosting과 겹치는 파일이라 spec §5의 낱말 원칙을 따른다.

UI의 정보 구조와 인증 방식은 아직 미정이다. 디자인 브리프는 현재 작성 보류다. 기능에 UI가 없어서 생략한 것이 아니며, 구현 재개 시 신규 표면·큰 변경 여부를 확인한 뒤 필요한 브리프와 시안을 먼저 확보한다.

## 3. 순수 함수 — 향후 TDD 진입점

| 대상(이름은 가칭) | 입력 → 판정 | 주요 회귀 |
|---|---|---|
| 리포 identity 정규화/비교 | 리포 호스트·정규 호스트·불변 id·namespace → identity/거부 | 같은 id의 다른 리포 호스트, 하위 그룹, 이전 이름 재사용, SHA-256 object format 거부 |
| 연결·readiness 판정 | 리포 호스트별 연결 증거·첫 적재 상태 → 상태 | 설치 id 없는 정상 GitLab, 설정만 있는 프로젝트 |
| 승인/전달 문맥 지문 | 캡처 identity·연결 revision·현재 설정 → 유효/실효 | 조회 중 재연결·권한 철회·소스 변경, **기존 GitHub 지문 바이트 불변** |
| GitLab commit 요청 조립 | 고정 base·공통 파일 변경·mode → actions | create/update 구분, 비정상 경로, 파일 mode, 경로 인코딩(공백·유니코드·`%`·하위 그룹 namespace) |
| 원격 파일 판정 | tree 항목·blob 내용 → 읽기/거부 | LFS 포인터 파일 거부(포인터를 파싱하거나 Publish가 덮어쓰면 안 된다) |
| PR/MR 조회 결과 정규화 | 저장된 repositoryId·sync branch·원격 응답 → 열림/없음/조회 실패 | 권한 은폐 404를 없음으로 오인 금지, source/target project id가 다른 동명 fork MR 제외 |
| 리포 호스트 URL·오류 판정 | identity·commit·경로·상태 → 안전한 URL/복구 코드 | GitLab 하위 그룹, 재연결 필요와 일시 장애 구분, 429는 일시 장애, 보관된 GitLab 프로젝트의 쓰기 403은 재연결 필요(재시도 루프 금지), 기본 브랜치 개명은 `base-branch-missing`이며 늦게 도착한 판정이 현재 상태를 덮지 않는다 |
| CI 입력 변환 | checkout·base·마커·설정 → 기존 생산자 입력/스킵 | 다른 브랜치, 머지 방식, 오래된 실행 |

strict 적재·미전달 보호·렌더·전달 확인은 기존 순수 함수와 테스트에 양쪽 리포 호스트의 사례를 추가한다. 같은 판정의 GitLab 사본을 만들지 않는다. 어댑터를 공유하므로 빈 키 목록·orphan·로케일 누락은 기존 테스트에 GitLab 사례 한 줄씩이면 된다. **변경 없음 경로의 쓰기 호출 0회**(1층 — DB 미전달 0이면 원격 호출 0, 2층 — blob hash가 모두 같으면 commit API 호출 0)는 가짜 클라이언트의 호출 기록으로 단언한다.

## 4. 스키마와 배포

**additive-first 제안**이다. 번역·키·로케일·멤버·이력 테이블을 리포 호스트별로 복제하지 않는다.

- Project에 리포 호스트 식별을 추가하고 기존 행은 GitHub로 해석한다. 호스트는 1차가 GitLab.com이면 서버의 리포 호스트별 고정 매핑으로 충분하다. 사용자 지정 host 컬럼을 선행 추가하지 않는다.
- repository id의 identity는 `(리포 호스트, canonical host, repositoryId)`다. 현재 `repositoryId`에 unique가 없어 같은 숫자 id가 DB에서 즉시 충돌하지 않는다 — additive로 충분하다. DB의 전역 unique 추가 여부는 기존 동일 리포 연결 정책을 확인한 뒤 정하며 임의로 한 리포 한 프로젝트 제약을 만들지 않는다.
- GitHub `installationId`는 GitHub 전용 nullable 정보로 유지한다. GitLab을 통과시키려고 가짜 설치 id를 쓰지 않는다.
- GitLab namespace는 `group/subgroup`을 보존해야 한다. 기존 owner/name 검증을 전수 확인하고 부족한 주소 필드를 additive로 추가한다. repositoryId는 주소와 분리한다.
- 자격증명 저장 위치·열은 인증 결정 후 확정한다. 원문 저장·로그 출력 없이 기존 봉투 암호화/회전 원칙을 따른다. 로그인 Account에 임의로 섞지 않는다.
- `lastPrUrl`·실행 이력은 기존 저장을 활용할 수 있으나 URL 판정·payload 스키마·UI 문구를 리포 호스트에 맞춘다. 이름 변경만을 위한 전면 열 rename은 하지 않는다.

배포 순서: additive migration → 기존 GitHub 행 검증 → 두 리포 호스트를 이해하는 모든 reader/writer 배포 → GitLab 생성 활성화. dev DB는 `/push` 전에 `/db`로, prod DB는 `/merge` 1단계(`db:deploy`·`db:status:prod`)에서 넓힌다. 활성화 방식(env 스위치 vs `/merge` 분할)은 spec §6 미결이다. 구버전이 GitLab 프로젝트를 읽는 혼합 배포·롤백을 허용하지 않도록 활성화/롤백 절차를 확정한다. 구 필드 제거가 필요해지면 소비자 이관과 별도 배포로 나눈다. 현재 마이그레이션을 만들거나 실행하지 않는다.

## 5. 인증과 환경변수 — 미확정

불변식 6의 **로그인/연결 증명/리포 쓰기 신원 분리**를 유지한다(불변식 6 문구의 일반화 여부는 spec §6). GitHub 사용자 OAuth를 쓰기에 쓰지 않으며 GitLab 개인 OAuth 쓰기도 자동 승인하지 않는다. 연결하는 사람이 해당 리포에 쓸 수 있다는 증명과 서버가 지속적으로 쓰는 자격증명은 별도 검토한다.

이 분리를 상시로 세는 `lib/github-connect/__tests__/credential-separation.test.ts`는 Octokit 형태(`App` import, `rest.*.create`, `paginate("POST`)만 정규식으로 센다. GitLab 쓰기 자격증명은 그대로 지나간다 — **GitLab 연결/쓰기 루트와 GitLab 쓰기 호출 패턴을 같은 테스트에 등록한다**(tasks §2).

[GitLab 프로젝트 토큰 문서](https://docs.gitlab.com/user/project/settings/project_access_tokens/)는 GitLab.com에서 Premium/Ultimate 조건과 토큰 만료를 명시한다(2026-10-08 조회). 따라서 프로젝트 토큰을 확정하면 지원 플랜(spec §6 사용자 결정 행)과 갱신 UX도 결정된다. 개인 토큰으로 조용히 대체하지 않는다. 실제 도입 팀의 플랜·퇴사/철회 후 동작·최소 권한·회전 절차를 검증해 한 방식을 선택한다.

**새 환경변수는 아직 확정하지 않았다.** OAuth 연결을 선택하면 클라이언트 자격증명·callback 운영 설정이 필요할 수 있다. 확정 시 `.env.example`·OPERATIONS와 배포 환경 설정을 태스크에 포함한다. 사용하지 않을 변수·SDK·키를 미리 추가하지 않는다.

인증 결정 뒤 새 자격증명·수집 정보·GitLab 전송처를 개인정보 방침과 대조한다. GitLab 활성화 전에 `/privacy`의 영문·국문 본문, 해당 수집 목록, 필요한 개정 이력·시행일을 실제 구현에 맞춘다. 현재 방침은 미래 기능으로 고치지 않는다.

## 6. 불변식과 과거 장애

ARCHITECTURE §0·§2·§3·§5.5·§6.4·§6.5·§7 기준으로 다음을 보존한다.

- DB 값/리포 키 소유권과 strict 적재, base 파일의 키 집합 예외, orphan 보존은 그대로다. 리포 호스트 차이로 값 병합을 도입하지 않는다.
- 같은 DB·원본에서 바이트가 같다. blob hash는 commit id와 혼동하지 않고 로컬 `git hash-object` 및 원격 blob과 대조한다.
- 모든 DB 접근은 인가된 projectId/surfaceId로 좁히며 GitLab 역할을 Malmoi 멤버 역할로 승격하지 않는다.
- 리포 identity 검증은 읽기·쓰기·표시·승인 지문 모두에 적용한다. 원격 호출을 DB 잠금 안으로 옮기지 않는다.
- 첫 외부 쓰기 전 전달 확인 무효화, 유효한 실행권/context 확인 후 성공 확정, 미전달 셀 토큰 보존을 양쪽 리포 호스트에서 검증한다.

[POSTMORTEM](../../POSTMORTEM.md)에서 인용할 회귀 근거:

| 사건 | 이 기능의 검증 |
|---|---|
| 2026-09-16 「같은 요청의 Promise.all이 토큰 회전을 둘로 겹쳤고…」 | refresh 방식 채택 시 동시 만료·회전 충돌을 실제 호출로 검증 |
| 2026-09-17 「번역 PR을 merge commit으로 머지하면 루프 마커가 사라져 push가 DB를 덮었다」 | GitLab 머지 방식(merge commit·squash·fast-forward)과 사용자 정의 커밋 메시지 템플릿별로 마커 보존을 실제 CI에서 검증 |
| 2026-09-19 「인가를 철회한 사용자가 잠시 뒤 다시에 갇혔고…」 | 철회와 일시 장애를 구분하고 도달 가능한 재연결 경로 제공 |
| 2026-09-27 「경로 안전만 검사해 경로가 옳은지를 안 봤고…」 | push 토큰 발급·회전·리포 연결의 실제 쓰기 권한과 출력 경로 검증 |
| 2026-10-07 「허용된 CI 경합이 재Publish 뒤 PR의 복구본까지 지울 수 있었다」 | CI/야간 사전 판정 뒤 Publish·no-changes 경합에서 revision 재검; 토큰/확인 원자성 유지 |
| 2026-10-07 「비동기 경계와 검증 트리거가 구현의 끝까지 닿지 않았다」 | 새 PG 테스트의 수집 설정과 실제 구현 경로의 gate-plan 트리거를 새 경로가 처음 생기는 커밋에서 함께 확인 |

PRODUCT §2 포지셔닝·§1·§3 문구와 ARCHITECTURE 불변식 6의 일반화는 **착수 전 결정**이다(spec §3·§6). 그 결정이 닫힌 뒤 정본 갱신은 구현과 함께 실제 동작에 맞춘다. 현재 정본 문서를 미래 기능으로 바꾸지 않는다.
