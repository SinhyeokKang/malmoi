# GitLab repositories — 기술 설계 초안

상태: 구현 보류 · [spec.md](spec.md)의 미확정 결정이 선행한다 · 화면은 [design-brief.md](design-brief.md). 이 문서는 "저장소 제공자" 대신 **리포 호스트**라고 쓴다(spec §5). 갱신 2026-10-12(3차 검수 — 셀프 호스팅 지원·문장 분기·A~E 한 배치 결정 반영 · 인증 결정: **GitHub 현행 유지, GitLab은 PAT** — spec §1).

## 1. 현재 코드와 분리 경계

| 현재 위치 | 재사용할 계약 | 분리·수정할 결합 |
|---|---|---|
| `lib/adapters/types.ts`·포맷별 어댑터 | 경로·내용 입력, 탐지·파싱·결정적 write | 리포 호스트 조건을 추가하지 않는다 |
| `lib/push/{payload,plan,apply}.ts` | 페이로드 생산·검증·strict 적재 | 리포 호스트 identity를 CI 입력과 서버 설정 사이에서 검증 |
| `app/api/push/route.ts` | 프로젝트 토큰 인가·보류 응답 | 열린 PR 판정이 `installationId`를 읽는다 |
| `lib/import/{run,apply-plan}.ts` | 실행권·설정 revision·일괄 적재 | `installationId` 및 GitHub reader 의존 |
| `lib/onboarding/readiness.ts` | `setup` → `awaiting_first_sync` → `ready` 세 상태 | 설치 id 존재를 공통 연결 증명으로 대체 |
| `lib/pull/{plan,render,load}.ts` | 렌더·변경 판정·전달 확인 | 리포 호스트별 프로젝트 조회 배선 점검 |
| `lib/pull/client.ts` (`GitClient`) | 경계가 실제로 사는 인터페이스 | `createTree/createCommit/updateRefForce` — GitLab이 흉내 내지 않는다(아래 Publish) |
| `lib/pull/{run,payload,targets}.ts` | Publish 순서·보호 계약 | Git Data API 단계와 `owner:branch` PR 조회 |
| `lib/sync/execution.ts` · `lib/github.ts`의 transport 주입 | Publish 실행 수명(240초 예산·`execution.fetch()`·비GET은 쓰기로 셈) | GitLab transport도 같은 `execution.fetch()`를 지난다(아래 Publish) |
| `lib/github.ts`의 `openRepoReader`·`listBranches`·`probeRepo` | 읽기 경로(불변식 11의 첫 층 — 토큰을 리포 id 하나로 좁힌다) | `installationId`·`repositoryId` 인자 |
| `lib/publish/` (`publishFingerprint`) | Publish 미리보기·MCP reconfirm 지문 | 지문 입력(아래 지문 표) |
| `lib/sync/plan.ts` (`SYNC_ERROR_CODES`) | 저장되는 실패 코드(`SyncRun.errorCode` → Logs·화면 분기) | `github-error`·`not-installed`가 GitHub 이름이다 — `lib/pull/trigger.ts`는 `installationId === null`이면 `not-installed`를 던진다(아래 §3 코드 정책) |
| `lib/github-wait.ts` (`GITHUB_WAIT_MS` 8초) · 테스트 공유 사본 `lib/__tests__/fast-github-wait.ts` | 렌더 중 원격 조회의 공유 마감 | GitLab 원격 상태·probe·열린 MR 게이트도 같은 마감을 쓴다. 손 사본을 만들지 않는다(POSTMORTEM 2026-10-02). 이름 일반화는 재개 0단계 판정 |
| `lib/nightly/run.ts` | Publish/적재/스킵 분기 | 대상 선정이 `installationId` 전제 |
| `lib/projects/{open-pr,remote,list}.ts` · `lib/inbox/load.ts` | 열린 PR·원격 상태·목록·Inbox | `installationId` 전제 |
| `lib/projects/open-pr-memo.ts` · `lib/github-connect/probe-memo.ts` | 요청 내 메모 | 키가 `(owner, name, installationId, repositoryId)`이고 리포 호스트가 없다 |
| `lib/github-connect/health.ts` (`planConnectionHealth`) | 연결 상태 판정 | GitHub 설치·인가 전제 |
| `lib/mcp/tools/project.ts` · `lib/mcp/tools/onboarding.ts` | MCP 도구 | `onboarding.ts:50`이 `.github/workflows/malmoi-i18n.yml`을 하드코드한다. `lib/mcp/confirm.ts`는 **온보딩 샘플 확인값**(HMAC, `lib/onboarding/sample-confirmation.ts`)이지 승인 지문이 아니다 — context에 `installationId: string` 필수 |
| `lib/onboarding/workflow.ts` | 생성 워크플로 YAML(루프 가드 `if:`) | GitLab 템플릿 생성기 짝 |
| `lib/deployment/{mode,preflight}.ts` | 배포 모드·기동 전 env 분류 | `GITHUB_APP_*` 다섯이 self-hosted `required`(spec §6 결정 행) · GitLab env 분류 추가 |
| `lib/credentials/conversion.ts` | 토큰 봉투 회전·검증 CLI(`credentials:{dev,prod,self-hosted}`) | 새 자격증명 열 등록(빠지면 회전 뒤 옛 키 폐기 순간 못 연다) |
| `scripts/smoke-github.ts` | 실 API 읽기 스모크 | `smoke:gitlab` 짝 |
| `lib/github.ts`·`lib/github-connect/` | 기존 GitHub 동작 | GitHub 전용 구현으로 유지 |
| `prisma/schema.prisma` | Project/Surface/Key/Translation/Member/Event | 리포 호스트·주소·쓰기 자격증명 |

이 표는 핵심만 담는다. 테스트 밖에서 `installationId|repositoryId`를 참조하는 파일은 2026-10-12 기준 `app`·`lib`·`components` 55개(`installationId` 52 + `repositoryId`만 쓰는 `lib/github-connect/repository-id.ts`·`lib/keys/delivery.ts`·`lib/translations/context.ts`) + `scripts` 1개다 — **전수 표는 재개 0단계 산출물이다**(지금 적으면 재개 때 stale).

공통 번역 코어 하나와 실제 소비자가 있는 리포 호스트 구현 둘을 둔다. 파일 포맷 어댑터와 리포 호스트 구현은 별개 축이다. GitLab 구현을 하는 배치에서 GitHub 소비자도 같은 경계로 옮기며, 미리 추상화만 추가하지 않는다.

## 2. 영향 받는 흐름

### GitLab 연결 (PAT)

GitHub 연결(App 설치 + 사용자 연결 → installation 토큰)은 **바꾸지 않는다**. GitLab만 아래 흐름이다.

1. ① 모달의 GitLab 탭에서 개발자가 PAT를 붙여 넣는다(스코프 `api`·`read_repository`·`write_repository`). Server Action이 받는다 — 외부 진입점이 아니라 내부 쓰기다(OAuth callback·Route Handler가 생기지 않는다).
2. 서버가 그 PAT로 `GET /user`와 토큰 메타(만료일·스코프 — 확인 필요 `GET /personal_access_tokens/self`)를 읽어 **검증**한다. 실패 사유를 가른다: 무효·만료·스코프 부족·네트워크(일시 장애는 "무효"로 접지 않는다).
3. 통과하면 PAT를 **계정 단위로 봉해 보관**한다(`/account`의 GitLab 연결 — 다음 ①에서 다시 붙여 넣지 않게 하는 목록용). 원문은 응답·로그·이벤트에 싣지 않는다.
4. ①의 리포 목록은 그 PAT로 조회한 **Maintainer 이상 프로젝트**다(멤버십 필터). Free 플랜 리포도 같다.
5. 프로젝트 생성(또는 재연결) 시 그 PAT의 **프로젝트 쓰기 사본**을 프로젝트에 봉해 저장한다. 이후 Sync·Publish·야간은 이 사본만 쓴다 — 계정 PAT를 교체해도 프로젝트는 재연결 전까지 옛 사본을 쓴다(GitHub에서 사용자 연결과 installation 토큰이 갈리는 것과 같은 모양). 쓰기 작성자는 토큰 주인이다(spec §3).
6. 만료 임박·만료·철회·스코프 부족·주인의 권한 상실은 연결 상태로 보이고(아래 톤 표), 복구는 OWNER가 프로젝트 설정에서 **재연결**(자기 계정 PAT로 사본 교체)한다.

### 적재와 Sync

서버 설정으로 리포 호스트를 결정 → 불변 repository id로 연결·호출 경로별 권한 검증 → 특정 commit의 완전한 파일 스냅샷 → 기존 탐지·read → 기존 보호 판정과 strict 적재. 파일 다운로드는 DB 트랜잭션 밖, 최종 인가·설정·실행권 재검증은 Project → 정렬된 Surface 잠금 안에서 한다.

호출자의 리포 권한과 서버의 리포 쓰기 자격증명은 구분한다. 생성·재연결·소스 추가·push 토큰 회전은 호출자의 리포 쓰기 권한을 확인한다. **수동 Sync와 연결된 프로젝트의 base branch 목록·저장(`updateRepositorySettings`)은 읽기 권한만 가진 OWNER도 허용**한다(PRODUCT §3·ARCHITECTURE §6.4, #123 회귀). 이 구분을 두 리포 호스트에 동일하게 적용하고, CI·야간 실행에 대화형 사용자 권한 검사를 추가하지 않는다.

CI는 현재 `lib/push/payload.ts` 생산자를 재사용한다. `/api/push`의 프로젝트 토큰이 대상을 결정하며 요청의 리포 호스트·리포명은 라우팅 권한이 아니다. 기존 GitHub 페이로드와의 호환 및 namespace 하위 그룹 입력을 검증한다. GitLab CI 쪽의 제약(배포 형태는 spec §6 미결):

- **바뀌는 참조로 말모이 코드를 받지 않는다.** GitLab에는 composite action이 없다 — `include: remote`·브랜치 ref로 받으면 말모이 쪽 커밋 하나가 `PUSH_TOKEN`을 가진 남의 러너에서 즉시 돈다(CLAUDE.md의 `@main` 금지와 같은 부류). 불변 태그나 SHA로 고정한다.
- 릴리스 축은 앱 태그 `v<x.y.z>`·GitHub action 태그 `malmoi-i18n-push-vN`과 별개로 둔다.
- `PUSH_TOKEN`은 protected·masked CI/CD 변수로, 보호 브랜치 파이프라인에서만 노출한다.
- base 브랜치 조건·`[skip-malmoi-i18n]` 루프 가드·열린 MR 경고는 서버가 아니라 템플릿 책임이다. 현재 action은 `github.event.head_commit.message`와 `gh pr list`에 기대므로 GitLab에서 새로 만든다. GitLab은 merge·squash 커밋 메시지 템플릿을 프로젝트마다 바꿀 수 있어 MR 제목의 마커가 커밋에 남는다는 보장이 없다(POSTMORTEM 2026-09-17).
- `/api/push/failure` 계약을 그대로 따른다 — 적재 없음, `lastCommitSha` 미전진(전진시키면 다음 push가 `stale-commit` 409).
- **동작 기준선은 action v3**(`docs/ACTIONS.md` — 보류 사유별 경고, `unmanaged`는 red 아님). 셀프 호스팅 설치본이 만든 템플릿은 **항상 `api-url`을 든다**(없으면 push 토큰이 호스팅 서비스로 간다 — PRODUCT §4.1).
- **루프 가드는 지금 두 겹이다** — action v3 안(`.github/actions/malmoi-i18n-push/action.yml`)과 생성 워크플로의 `if:`(`lib/onboarding/workflow.ts`). GitLab 템플릿도 두 겹으로 둔다(하나로 줄이면 2026-09-17 squash 함정의 그물이 한 겹 준다). 마커 리터럴 소비자 집계(`lib/pull/__tests__/skip-marker.test.ts` — 지금 셋)에 GitLab 템플릿을 넷째로 등록하고, GitLab merge commit·squash 기본·squash 사용자 템플릿·fast-forward 메시지 모양을 같은 테스트에 넣는다.
- 외부 계약 문서 `docs/ACTIONS.md`에 GitLab 절을, 안내 화면 `components/onboarding/workflow-block.tsx`·`components/settings/ci-card.tsx`에 `.gitlab-ci.yml`과 masked 변수 안내를 짝으로 만든다.

자동 적재는 pending token·열린 PR/MR을 공통 판정으로 받고 조회 실패를 닫힘으로 해석하지 않는다. 사전 전달 revision과 잠금 뒤 revision 비교도 그대로 유지한다. 야간의 Publish/적재/스킵 분기와 수동 Sync 승인 지문을 복제하지 않는다.

리포 연결이 입력에 드는 지문은 넷이고, 모두 리포 호스트 identity와 연결 변경이 반영돼 오래된 승인이 재사용되지 않아야 한다.

| 지문 | 위치 | 저장 | 리포 호스트 투입 |
|---|---|---|---|
| OWNER 폐기 승인 `discardFingerprint` | `lib/protection/fingerprint.ts:25` | 아니오(서버 발급·즉시 대조) | 입력에 리포 호스트를 더해도 된다 |
| 소스 제거 승인 `removalFingerprint` | `lib/protection/fingerprint.ts:53` | 아니오 | 같다 |
| Publish 미리보기·MCP reconfirm `publishFingerprint` | `lib/publish/fingerprint.ts:16` | 아니오 | 같다 |
| 전달 문맥 `deliveryContextFingerprint` | `lib/translations/context.ts:34` — 소비자 `lib/pull/load.ts`·`lib/keys/delivery.ts` | **예**(`DeliveryConfirmation`) | ⚠️ **기존 GitHub 행의 입력·출력은 바이트 단위로 보존하고 GitLab일 때만 리포 호스트를 섞는다** — 일괄로 바꾸면 배포 순간 기존 `DeliveryConfirmation`이 전부 무효가 된다 |

`lib/mcp/confirm.ts`는 지문이 아니라 온보딩 샘플 확인값이다(위 §1 표).

### Publish

기존 미전달 캡처 → base SHA 고정 → 완전한 tree와 원본 blob 읽기 → 공통 render·변경 판정 → 전달 확인 무효화 → 리포 쓰기 → 성공 관측 → 기존 DB 확정 순서다.

`GitClient`의 `createTree/createCommit/updateRefForce`를 GitLab이 흉내 내도록 강제하지 않는다. 공통 코어가 필요로 하는 **고정 base에서 파일 스냅샷을 발행하고 review request를 유지하는 동작**으로 경계를 잡는다. 구체 함수 서명은 인증·실물 검증 뒤 확정한다. GitHub의 첫 외부 쓰기 이전 무효화와 API 호출 생략 동작을 보존한다.

**Publish 실행 수명 계약을 그대로 따른다**(ARCHITECTURE §5.6.2, POSTMORTEM 2026-10-09 — 셀프 호스팅엔 `maxDuration`이 없어 이 계약이 유일한 종료 장치다): GitLab transport도 `lib/sync/execution.ts`의 `execution.fetch()`를 지나 240초 예산·transport 직전 검사를 받는다. **비GET은 전부 쓰기로 센다**(commit·MR 생성·MR 닫기·브랜치 삭제) — 그 뒤 실패는 `execution-uncertain`, 300초 `publish-unsettled` 창, 자기 RUNNING에 대한 CAS 종료. GitHub 쪽이 Publish 중 retry/throttle을 끄듯(`lib/github.ts:87-89`) **GitLab 클라이언트도 자체 재시도·자체 fetch를 두지 않는다** — 애매한 5xx 뒤 MR 생성 POST가 다시 나가면 중복 MR이다.

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

GitHub 고정 문구·URL·글리프가 있는 표면. **수치·전수 목록은 재개 0단계에서 다시 센다** — 2026-10-08 표가 v1.1~1.3 화면을 빠뜨려 3차 검수에서 버렸다. 0단계의 기준 명령(같은 정규식을 세 사전·가이드에 쓴다):

```
rg -n -i 'github|pull request|\bPRs?\b' messages/en.tsx     # 줄 단위 — 키 단위 표로 옮긴다
rg -l -i 'github' guide/en guide/ko guide/es
rg -l 'GithubIcon|github\.com|GitPullRequest' components app
```

2026-10-12 줄 단위 실측: en 사전 약 120~180줄(정규식에 따라), ko GitHub 61·PR 63, es GitHub 60·pull request 51, 가이드 en 27개 파일(셀프 호스팅 4개 포함). 0단계 표가 빠뜨리면 안 되는 자리(검수가 찾은 누락):

| 사전 namespace · 컴포넌트 | 변경 유형 |
|---|---|
| `translations` — Publish 모달, 키 상태 필터 `New from GitHub`(en `:2550`), 기준 언어 배너의 "GitHub Actions workflow" | 문장 분기 · URL |
| `summary` — Home 카운트 카드 제목 `newFromGithub`(`components/home/count-cards.tsx:26`, en `:1742` — 버튼이 아니다) | 문장 분기 |
| `home` — `meta.pullRequest`·`prState`·`prCheckFailed`(en `:1143-1145`), `meta-column.tsx`·`hold-later.tsx`·`sync-result.tsx` | 문장 분기 · 번호 표기 |
| `logs` — `Open on GitHub`·`sent translations to GitHub`·`pr-check-failed`(en `:1371`·`:1448`·`:1544`) | 문장 분기 · URL |
| `settings` — `The GitHub App is installed…`·`Authorize GitHub App`(en `:3483`·`:3588`), `components/settings/repository-card.tsx`(GithubIcon) | 흐름 분기 |
| `account`·`errors` — `components/account/github-section.tsx`, `components/github-account.tsx`, `components/reconnect-button.tsx` | 흐름 분기 |
| `newProject` — `components/onboarding/connect-github.tsx`·`steps/repo.tsx`·`workflow-block.tsx` | 흐름 분기 · CI 안내 |
| `projects` — 띠의 `Open on GitHub`, `Connect the GitHub App`, `components/projects/project-list.tsx`(GithubIcon) | 문장 분기 · URL · 흐름 분기 |
| `sources` — `workflowLine`·`prUnknown`(en `:3110-3114`), `remove-source-dialog.tsx`·`add-sources-modal.tsx` | 문장 분기 |
| `mcp` 응답 문구(en `:3724-3821`) · MCP 도구 설명·`get_workflow` 경로·필드명 `lastPublishPullRequest`·`newFromGitHub` | 문장 분기 · 경로 · 호환 정책 |
| `lib/status/canon.ts`의 `prOpen`·`prCheckFailed` 상태 키 | 라벨 분기(아래 톤 표) |
| `repositorySync.not-connected`, `locales.help`, `mcpConnector`의 `project:create` 권한 설명 | 문장 분기 |
| `components/settings/ci-card.tsx` · `components/shell/attention-inbox.tsx` | CI 안내 · 문장 분기 · URL |
| Logs·Home·소스 — `GitPullRequest*` 글리프(`publish-button.tsx`의 `GitPullRequestArrow`·`logs/glyph.tsx`·`home/count-cards.tsx`) | 유지(git 일반 글리프). 이름이 "pull request"인 아이콘을 MR에도 쓰는 것이 맞는지 시안 단계에서 한 줄 확인 |
| `guide/en·ko·es` 27개 파일 × 3 · README · 랜딩·SEO·공개 문서(`landing`·`seo`·`publicDocs`, `app/page.tsx`) | 포지셔닝 결정(spec §6)에 따름 |
| 셀프 호스팅 가이드 `guide/*/self-hosting/{install,operate}.md` | GitLab env·키 회전·백업 절차(spec §3 범위) |

**제외 대상** — 말모이 자체 리포를 가리키는 링크는 바꾸지 않는다: `/changelog`의 View on GitHub, 공개 헤더·푸터의 GitHub 링크. 로그인 공급자 이름(`/signin`·`/account` 로그인 수단)도 리포 호스트 문구가 아니다.

**문구 전략 — 리포 호스트별 문장 분기**(2026-10-12 사용자 결정, spec §1). 해당 키는 호스트를 받아 **문장을 통째로** 고른다. ⚠️ **호스트 이름 + 조사를 보간하지 않는다** — ko에서 GitHub(깃허브)는 받침이 없어 `가·는·를·로`, GitLab(깃랩)은 받침이 있어 `이·은·을·으로`다(`lib/i18n/__tests__/helpers/banned-terms.ts:59-63`이 GitHub 쪽을 강제한다). 보간하면 한쪽 조사가 반드시 틀린다. banned-terms에 GitLab 조사 행을 더한다.

용어 규칙은 정본이 먼저 바뀐다. DESIGN §10.1의 App 호칭 행(v1.3.0부터 "Malmoi GitHub App"은 **금지어**이고 처음 "the GitHub App", 이어서 "the app" — DESIGN `:2422`, banned-terms `:34-35`·`:92-94`)·`pull request` 허용 근거("GitHub의 고유명사이고 링크가 실제로 그리 간다"), §2.4의 "Couldn't check for an open pull request" 행, §6 메타 열의 "파랑은 GitHub으로 나가는 것뿐", `lib/i18n/__tests__/helpers/banned-terms.ts`의 PR·App 호칭·조사 규칙이 GitHub을 고정한다. PR/MR 호칭(spec §6)이 닫히면 이 정본과 banned-terms, 그리고 `lib/i18n/__tests__/terminology.test.ts`의 `CONCEPT_BANNED`·`ALLOWED`(홀로 서는 "Couldn't check" 금지가 merge request 목적어에도 통해야 한다)를 사전 작업보다 **먼저** 고친다.

브랜드 글리프 — `lucide-react`에는 GitHub·GitLab 브랜드 아이콘이 없다. GitLab 글리프는 이 리포의 유일한 브랜드 글리프 위치인 `components/signin/brand-icons.tsx`에 추가한다. `github-glyph.test.ts`는 GitHub path만 세므로 **`gitlab-glyph.test.ts`를 새로 둔다**(`mcp-glyph.test.ts` 선례). tanuki를 다색(§6.2 raw 색 예외, Google 로고 선례)으로 둘지 단색 `currentColor`로 둘지는 시안 단계에서 정한다(design-brief 갈래 D). ⚠️ `visual-system.test.ts`는 `brand-icons.tsx`를 파일 단위로 면제하므로 다색을 넣어도 green이다 — 다색을 고르면 DESIGN §6.2("색 리터럴이 서는 세 자리")·§6.8(Google 4색 예외) 문장에 등재하는 것이 게이트다.

연결 상태와 §2.4 톤 매핑(미결 — 시안·인증 결정 뒤 채운다). 상태는 화면마다 그리지 않고 **`lib/status/canon.ts`의 `STATE` → `StatusBadge` 한 경로**로만 그린다(POSTMORTEM 2026-10-08 — 결과 미확인의 톤과 PR 조회 실패 문구가 화면마다 갈렸다). PR/MR 분기도 `STATE.prOpen`·`prCheckFailed`의 label 한 곳에서 한다.

| 상태 | §2.4 톤 | `canon.ts` STATE | 연결 건강성(`planConnectionHealth` 8종)과의 대응 |
|---|---|---|---|
| 만료 (`Expired`) | 기존 행 재사용 후보 | 재사용 후보 | GitHub 전용 상태(`app-uninstalled`·`installation-changed`·`unpinned`)와 별개 사유 — `Disconnected`로 접는다 |
| 철회 / 재연결 필요 | 기존 `repositoryConnectionState` 재사용 후보 | 재사용 후보 | `Disconnected` |
| 일시 장애 (`Couldn't check`) | 기존 행 재사용 | 재사용 | ⚠️ `unknown`은 끊김으로 접지 않는다 |
| 보관된 GitLab 프로젝트(쓰기 403) | 재연결 필요 | 재사용 후보 | `Disconnected`(재시도 루프 금지) |
| PAT 만료 임박 | **warning**("손봐야 하지만 깨지진 않음" — 새 톤이 아니라 새 **상태 행**) | 새 키 | 연결은 정상 — 접지 않는다 |
| PAT 스코프 부족 | 연결 거부(① 입력 아래 danger) / 연결 뒤 발견이면 재연결 필요 | 새 키 | `Disconnected` |
| PAT 주인이 리포 권한을 잃음 | 재연결 필요 | 재사용 후보 | `Disconnected` |
| 보호 브랜치 권한 부족 | 미정 | 미정 | 미정 |

만료일 표시는 `lib/date-format.ts`(사용자 시간대 + 오프셋 라벨, CLAUDE.md 날짜 규칙), 남은 기간은 `lib/relative-time.ts`다.

**375px 폭**(DESIGN — v1.3.2부터 최소 대응 폭 375, 폭에 따른 기능 분기 0): GitLab 하위 그룹 주소(`group/subgroup/project`)가 길다. 리포 목록 행·Home 메타 Repository(라벨 + 오른쪽 정렬 값)·Sync 확인 Dialog의 브랜치 줄·설정 Repository 행에서 말줄임/줄바꿈 규칙을 정한다(이름 끝을 보존). 시안 G3b·G4e·G6c.

**접근성**: 호스트를 글리프만으로 가르지 않는다 — 브랜드 마크는 `aria-hidden`이므로 호스트 이름이 텍스트나 접근 이름에 든다. `/account`에 GitHub·GitLab 연결이 나란히 서면 Disconnect 접근 이름이 축을 든다(`settings.disconnectLabel` 선례, DESIGN §6.646). PAT 입력 필드는 라벨·오류를 `aria-describedby`로 잇는다.

초대 이메일도 영향 범위다. `lib/invitation-email/template.ts:74`의 "sends it back to GitHub"를 리포 호스트에 맞는 문장으로 분기하고(초대 대상 프로젝트의 호스트) 두 리포 호스트의 초대에서 검증한다. 사전을 통하지 않는 영문 템플릿이므로 사전 갱신과 별도로 다룬다. 셀프 호스팅은 이 문구를 정하지 않고 출시됐다 — 이 기능이 정한다(spec §5).

화면은 [design-brief.md](design-brief.md)가 든다 — ① 맨 위 GitHub / GitLab 탭(GitHub 탭은 현행), GitLab 탭의 PAT 입력과 상태 shell, 그리고 프로젝트 목록·Home·설정에 리포 호스트 맥락을 넣는 방식. 열린 갈래는 MR 번호·글리프 색 둘이다.

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
| 저장 오류 코드 정책 | 리포 호스트·실패 → `SyncRun.errorCode` | 기존 `github-error`·`not-installed` 행의 의미 보존. 재사용이면 GitLab 의미를 문서화, 새 코드면 `lib/pull/__tests__/error-codes.test.ts` 양방향 등재 · Logs 문구 분기. **재개 0단계 판정**(새 코드 vs 일반화된 이름 재해석) |
| 권한 분류 | 원격 응답 → 재인가/일시 장애/거부 | 401을 `unavailable`로 접지 않는다(복구 컨트롤 0개 화면 금지, POSTMORTEM 2026-09-19) · access level 정보가 없으면 거부가 아니라 `unavailable` · `requirePush`는 기본값 없는 필수 인자(2026-09-27) |

strict 적재·미전달 보호·렌더·전달 확인은 기존 순수 함수와 테스트에 양쪽 리포 호스트의 사례를 추가한다. 같은 판정의 GitLab 사본을 만들지 않는다. 어댑터를 공유하므로 빈 키 목록·orphan·로케일 누락·빈 `{}` 중첩 JSON(POSTMORTEM 2026-09-29)·chrome `placeholders: null`(2026-09-24)은 기존 테스트에 GitLab 사례 한 줄씩이고, spec 완료 조건 2는 **다섯 포맷 × 두 리포 호스트 render 바이트 동일** 테스트로 잰다. 기존 GitHub 쪽 공백 — `getTree` truncated에서 던지는 동작(`lib/github.ts:391-392`) 미단언, `findOpenPr`의 `data[0]`만 보는 페이지네이션 부재(`:452-462`) — 도 공통 계약 테스트에 GitHub 사례를 한 줄씩 둔다. **변경 없음 경로의 쓰기 호출 0회**(1층 — DB 미전달 0이면 원격 호출 0, 2층 — blob hash가 모두 같으면 commit API 호출 0)는 가짜 클라이언트의 호출 기록으로 단언한다.

## 4. 스키마와 배포

**additive-first 제안**이다. 번역·키·로케일·멤버·이력 테이블을 리포 호스트별로 복제하지 않는다.

- Project에 리포 호스트 식별을 추가하고 기존 행은 GitHub로 해석한다. 호스트는 1차가 GitLab.com이면 서버의 리포 호스트별 고정 매핑으로 충분하다. 사용자 지정 host 컬럼을 선행 추가하지 않는다.
- repository id의 identity는 `(리포 호스트, canonical host, repositoryId)`다. 현재 `repositoryId`에 unique가 없어 같은 숫자 id가 DB에서 즉시 충돌하지 않는다 — additive로 충분하다. DB의 전역 unique 추가 여부는 기존 동일 리포 연결 정책을 확인한 뒤 정하며 임의로 한 리포 한 프로젝트 제약을 만들지 않는다.
- GitHub `installationId`는 GitHub 전용 nullable 정보로 유지한다. GitLab을 통과시키려고 가짜 설치 id를 쓰지 않는다.
- GitLab namespace는 `group/subgroup`을 보존해야 한다. 기존 owner/name 검증을 전수 확인하고 부족한 주소 필드를 additive로 추가한다. repositoryId는 주소와 분리한다.
- PAT 저장은 **둘**이다(위 "GitLab 연결"): 계정 단위 GitLab 연결(사용자당 하나 — 목록·재연결용, 만료일·스코프·주인 표시용 메타 포함)과 프로젝트 쓰기 사본(프로젝트당 하나 — 연결자 user id·만료일 포함). 둘 다 새 테이블/열이고 원문 저장·로그 출력 없이 기존 봉투 암호화/회전 원칙을 따른다. **로그인 `Account`에 섞지 않는다** — GitLab은 로그인 공급자가 아니다. 연결자가 프로젝트를 떠날 때 사본 처리는 spec §6 결정 행.
- `lastPrUrl`·실행 이력은 기존 저장을 활용할 수 있으나 URL 판정·payload 스키마·UI 문구를 리포 호스트에 맞춘다. 이름 변경만을 위한 전면 열 rename은 하지 않는다.

배포 순서: additive migration → 기존 GitHub 행 검증 → 두 리포 호스트를 이해하는 모든 reader/writer 배포 → GitLab 생성 활성화. 구현은 **A~E 한 `/push` 배치**다(2026-10-12 결정 — dev에 화면 없는 GitLab 경로가 열리는 창을 만들지 않는다). ⚠️ **셀프 호스팅 설치본은 버전을 건너뛰어 업데이트할 수 있다** — 백필은 앱 코드가 아니라 **마이그레이션 SQL 안에서** 끝낸다(SELF-HOSTING §3-1). "기존 GitHub 행 검증"이 앱 코드 백필을 전제하면 건너뛴 설치본에서 깨진다. dev DB는 `/push` 전에 `/db`로, prod DB는 `/merge` 1단계(`db:deploy`·`db:status:prod`)에서 넓힌다. 활성화 방식(env 스위치 vs `/merge` 분할)은 spec §6 미결이다. 구버전이 GitLab 프로젝트를 읽는 혼합 배포·롤백을 허용하지 않도록 활성화/롤백 절차를 확정한다. 구 필드 제거가 필요해지면 소비자 이관과 별도 배포로 나눈다. 현재 마이그레이션을 만들거나 실행하지 않는다.

## 5. 인증과 환경변수

**GitHub는 불변식 6의 로그인/연결/쓰기 분리를 그대로 유지한다.** GitLab은 2026-10-12 결정으로 **연결자 PAT가 연결 증명이자 쓰기 신원**이다 — 분리하지 않는 대가(개인 명의 커밋·만료·퇴사 시 끊김)는 spec §3에 적었다. 불변식 6 문장은 "GitHub에서는 분리, GitLab에서는 연결자 PAT"로 다시 쓴다(spec §6 정본 문구 행).

이 분리를 상시로 세는 `lib/github-connect/__tests__/credential-separation.test.ts`는 Octokit 형태(`App` import, `rest.*.create`, `paginate("POST`)만 정규식으로 세고, `app/`을 스캔하지 않으며, 완전성 검사도 "`@/lib/github`를 import하는 lib 파일"만 대상으로 한다. GitLab은 Octokit이 아니라 `fetch`로 쓰므로 등록만으로는 지나간다. GitLab 쪽에서 이 테스트가 지킬 경계는 다르다 — **계정 PAT는 목록·검증·재연결(사본 교체)에만 쓰고, Sync·Publish·야간 쓰기는 프로젝트 사본만 쓴다.** 완전성 검사의 기준(GitLab 클라이언트 모듈 import)과 fetch 기반 쓰기 패턴(비GET `fetch`)을 정의하고, 쓰기 경로가 계정 PAT를 읽으면 red로 만든다(tasks §2).

불변식 11의 세 층의 GitLab 대응: ① 토큰을 리포 하나로 좁히는 층은 **PAT에 없다**(사용자가 접근하는 모든 프로젝트에 쓸 수 있다) — 그래서 ② **쓰기 직전 project id 재대조**와 ③ 화면의 `repo-replaced`가 필수 층이 된다. ②를 빼면 이름 재사용으로 남의 리포에 쓴다.

**PAT 수명**: GitLab 16.0부터 PAT는 만료일이 필수(기본 최대 1년, 인스턴스 설정에 따름)다. 만료일을 저장해 만료 임박을 미리 보인다(톤 표). 자동 회전은 비목표(spec §5).

**새 환경변수는 없을 것으로 본다** — PAT 방식은 앱 등록·client secret·callback이 없다. GitLab 생성 활성화를 env 스위치로 하면 그 하나가 생긴다(spec §6). 확정 시 `.env.example`·`deploy/.env.example`·OPERATIONS와 배포 환경 설정을 태스크에 포함한다. 사용하지 않을 변수·SDK·키를 미리 추가하지 않는다.

**셀프 호스팅 유지보수 계약**(SELF-HOSTING §3 체크리스트 — 셀프 호스팅도 지원 범위다, spec §3):
- preflight 분류표(`lib/deployment/preflight.ts:27-60`)에 GitLab env를 등록하고(반쪽 설정은 기동 거부) `deploy/.env.example`에 같이 넣는다 — 빠지면 SH-15 ②가 red다. `GITHUB_APP_*` 필수 여부는 spec §6 결정 행.
- PAT를 봉하는 키와 회전: `credentials:{dev,prod,self-hosted}`의 `rotate-token`·`verify`에 새 열 둘(계정 연결·프로젝트 사본) 등록, 셀프 호스팅 운영 가이드의 키 회전·백업 절.
- PAT는 요청 본문(Server Action)으로만 오고 URL에 실리지 않는다 — nginx 접근 로그 마스킹(`deploy/nginx/`)에 새 경로는 없다. 이 전제가 깨지면(쿼리로 받는 경로가 생기면) 마스킹에 등록한다.
- 운영자 개인정보 재료(가이드)에 GitLab 전송처를 넣는다.

**새 진입점 없음**: PAT 입력·검증·교체·해제는 전부 Server Action이다(CLAUDE.md 데이터 변경 경로 — 내부 쓰기). OAuth callback·`ALLOWED_HOSTS`·state 서명 갈래가 생기지 않는다. 새 Action은 잠금이 필요하면 `locked-access`, 인가는 기존 `getProjectAccess`·`requireUser`를 지난다.

새 자격증명(PAT 봉투)·수집 정보(GitLab 사용자명·토큰 만료일)·GitLab 전송처를 개인정보 방침과 대조한다. GitLab 활성화 전에 `/privacy`의 영문·국문 본문, 해당 수집 목록, 필요한 개정 이력·시행일을 실제 구현에 맞춘다. 현재 방침은 미래 기능으로 고치지 않는다.

## 6. 불변식과 과거 장애

ARCHITECTURE §0·§2·§3·§5.5·§6.4·§6.5·§7 기준으로 다음을 보존한다.

- DB 값/리포 키 소유권과 strict 적재, base 파일의 키 집합 예외, orphan 보존은 그대로다. 리포 호스트 차이로 값 병합을 도입하지 않는다.
- 같은 DB·원본에서 바이트가 같다. blob hash는 commit id와 혼동하지 않고 로컬 `git hash-object` 및 원격 blob과 대조한다.
- 모든 DB 접근은 인가된 projectId/surfaceId로 좁히며 GitLab 역할을 Malmoi 멤버 역할로 승격하지 않는다.
- 리포 identity 검증은 읽기·쓰기·표시·승인 지문 모두에 적용한다(불변식 11의 세 층 — §5). 원격 호출을 DB 잠금 안으로 옮기지 않는다.
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
| 2026-10-09 「self-hosted Publish의 stale 교체가 옛 실행을 멈추지 않았다」 | GitLab transport가 `execution.fetch()`를 지나고 자체 재시도 0 — 예산 만료 뒤 새 전송 0건, 5xx 뒤 MR POST 1회, 늦은 성공이 stale FAILED를 덮지 않음 |
| 2026-10-08 「결과 미확인의 톤과 PR 조회 실패 문구가 화면마다 갈렸다」 | MR 상태도 `canon.ts` `STATE` 한 경로, terminology 테스트 확장 |
| 2026-10-02 (EnvironmentTeardownError — 타이머 위생) | 화면 대기 마감 `GITHUB_WAIT_MS` 공유, 테스트는 `fast-github-wait.ts` |
| 2026-09-18 (인가 스캐너 `guard(`) | 새 Route Handler 등록, 호출을 지운 뮤테이션에서 red |

PRODUCT §2 포지셔닝·§1·§3·§4.1 문구, README와 ARCHITECTURE 불변식 6·11의 일반화는 **착수 전 결정**이다(spec §3·§6). 그 결정이 닫힌 뒤 정본 갱신은 구현과 함께 실제 동작에 맞춘다. 현재 정본 문서를 미래 기능으로 바꾸지 않는다.
