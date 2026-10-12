# GitLab repositories — 지휘 계획

원본: [spec](./spec.md) · [design](./design.md) · [design-brief](./design-brief.md) · [tasks](./tasks.md). 이 문서는 실행·결정·검증 증거만 기록한다 — 계약은 원본이 정본이다.

## 시작점·권한

- 시작 dev: `b7c58993` (= origin/dev). 범위는 tasks §0~§6. **프로덕션 배포·prod `db:deploy`·GitLab 활성화(tasks §6 마지막 항목)는 `/merge` 몫이라 이 런 밖이다.**
- 지휘자: Claude Code. 워커는 Orca Task/Dispatch, 모델 패밀리는 Claude Sonnet·Opus(effort ≤ high). **Codex 교차 허가(사용자 2026-10-12, D18): E-sh·F 구현 + R-C 교차 리뷰만, Astra(`gpt-6-astra`) effort medium.** 그 밖 배치는 Claude.
- 사용자: `/orchestrate gitlab-repositories` 호출(2026-10-12) — 이것이 spec §6 "구현 시점" 재결정이다.
- **push는 한 번이다** — tasks 서문 "커밋 A·B1·B2·C·D·E는 같은 `/push` 배치 하나"(2026-10-12 사용자 결정). 지휘자는 배치를 로컬 dev에 cherry-pick + `pnpm gate`로 쌓고, **E까지 통합된 뒤에** dev DB 마이그레이션(`/db` 5단계) → `git push` → CI를 본다. 그 뒤 런타임 QA.
- 작업 트리: 인테이크 때 clean.

## GitLab 실물 환경 (사용자 준비)

- 파일: `~/.config/malmoi/gitlab-test.env` (리포 밖). 키: `GITLAB_TEST_TOKEN`(PAT — `api`·`read_repository`·`write_repository`) · `GITLAB_TEST_PROJECT`(`namespace/path`, 폐기용).
- ⚠️ **값을 출력하지 않는다** — `set -a; . ~/.config/malmoi/gitlab-test.env; set +a` 뒤 `curl -H "PRIVATE-TOKEN: $GITLAB_TEST_TOKEN"`로만 쓴다. 응답을 기록할 때 토큰이 실린 헤더·URL을 지운다. `.env.local`과 같은 이유다(CLAUDE.md "새 머신 셋업").
- 파일이 아직 없으면 W0는 실물 항목을 "미룬 항목"으로 남기고 나머지를 끝낸다 — 기다리지 않는다.
- 2026-10-12 지휘자가 ego(GitHub OAuth → GitLab 계정 `ox501501`, 사용자 허가 — 테스트용 계정, 실측에 계속 쓴다)로 만들었다: 프로젝트 `ox501501/malmoi-gitlab-test`(id 87515176, private, `main`, `README.md` + `locales/{en,ko,fr}.json`) · 레거시 PAT `malmoi-gitlab-test`(`api`·`read_repository`·`write_repository`, 만료 2026-11-11). W0 실측 뒤 닫힌 MR !1 이력이 남고 러너 등록 토큰이 재발급됐다(W0 터미널에 1회 노출 → 즉시 회전, PAT는 노출 없음).

## 결정 기록

| ID | 결정 | 근거 |
| --- | --- | --- |
| D1 | 구현 시점 = 지금 | 사용자 — `/orchestrate` 호출 |
| D2 | GitLab 실물 검증은 사용자가 준비한 GitLab.com 폐기용 리포 + PAT로 한다(위 절) | 사용자 2026-10-12 |
| D3 | 포지셔닝 = **GitHub 주, GitLab.com 병기**. PRODUCT §2 "GitHub-native" 유지 + GitLab.com 지원 문장. 불변식 6 = "GitHub은 쓰기 신원 분리, GitLab은 연결자 PAT 명의(예외)", 불변식 11 = "PAT에는 첫 층이 없어 쓰기 직전 project id 재대조가 필수 층". 랜딩·SEO 헤드라인은 그대로, 기능·포맷 절과 §4.1·README의 미지원 문구만 고친다 | 사용자 2026-10-12 |
| D4 | 셀프 호스팅 `GITHUB_APP_*` 다섯 = **all-or-none 그룹 선택**(반쪽은 기동 거부). 없으면 GitHub 연결 경로가 서지 않는다 | 사용자 2026-10-12 |
| D4a | D4에서 App이 없는 설치: ①은 탭 줄 없이 GitLab 단독, `/account`·설정의 GitHub 연결 카드·설치 링크는 서지 않는다(쓸 수 없는 컨트롤을 그리지 않는다). hosted는 항상 둘 다 | 지휘자 판단 — `GITHUB_APP_SLUG` 부재 시 "조용히 사라진다"는 기존 선례(CLAUDE.md) |
| D5 | GitLab CI 배포 = **불변 태그 clone + SHA 대조**. 생성 `.gitlab-ci.yml`이 malmoi(GitHub) 리포를 새 태그 축 `malmoi-i18n-push-gitlab-vN`으로 shallow clone하고 템플릿에 박힌 commit SHA와 대조한 뒤 action v3와 같은 pnpm 생산자를 돌린다. 앱 태그·GitHub action 태그와 별개 축 | 사용자 2026-10-12 |
| D6 | 활성화 = **스위치 없음**. prod는 `/merge`, 셀프 호스팅은 그 태그 업그레이드가 곧 활성화. 새 env 없음 | 사용자 2026-10-12. 전제 확인(W0, [consumers.md](./consumers.md) §2): 구버전은 GitLab 행을 `setup`/`not-installed`/`repo-forbidden`/`failed`로 읽고 GitHub 쓰기 0·크래시 0. **예외** — 구버전 `/api/push`는 `openPrGateApplies` false라 열린 MR 게이트 없이 strict 적재(미전달·`publish-raced` 게이트는 유지) → D6a |
| D6a | D6 예외 수용 — 롤백 절차에 "GitLab 릴리스 이전으로 되돌리기 전에 GitLab 프로젝트의 CI 파이프라인을 멈추거나 `PUSH_TOKEN`을 회전한다"를 둔다(design §4). 셀프 호스팅 운영 가이드의 같은 줄은 E-sh. 선행 패치 없음 | 지휘자 2026-10-12(W0 `ask`) |
| D7 | PR/MR 호칭 = GitLab 프로젝트에선 **merge request**(en·ko·es 모두 영어 고유명사 — es가 이미 "pull request"를 영어로 쓴다, 시안 G11b `las merge requests`). GitHub은 그대로 | 지휘자 판단 — DESIGN §10.1의 pull request 허용 근거("제공자 고유명사이고 링크가 실제로 그리 간다")가 그대로 답한다 |
| D8 | PAT 봉투 키 = **토큰 키**(`TOKEN_ENCRYPTION_KEYS`) — GitHub 연결 토큰과 같은 부류. `lib/credentials/conversion.ts` 회전·검증에 새 열 등록 | 지휘자 판단 — OPERATIONS 키 표의 용도 구분 |
| D9 | no-changes 종료 = **MR 닫기 → sync 브랜치 삭제**를 GitHub "base로 되돌리기"와 동등으로 인정(두 번째 실행 외부 쓰기 0회) | 지휘자 판단 — design §2: GitLab엔 ref 강제 이동 API·빈 커밋이 없어 다른 수렴 경로가 없다 |
| D10 | GitLab 글리프 = **단색 `currentColor`** | 지휘자 판단 — 옆에 서는 GitHub 글리프와 같은 형이고 DESIGN §6.2 raw 색 예외를 늘리지 않는다 |
| D11 | 만료 임박 경계 = **14일**(`STATE.expiresSoon`, warning) | 지휘자 판단 — 시안 v6 제안, 반대 근거 없음 |
| D12 | 트리 크기 입력·저장 오류 코드 정책·메모 키·`GITHUB_WAIT_MS` 이름 = W0 실측·판정 결과를 따른다 | tasks §0이 그 판정을 0단계 산출물로 정함 |
| D13 | GitLab PAT = **레거시 PAT만, 스코프 `api` 하나**(도움말·프리필 `scopes=api`). fine-grained PAT는 spec §5 비목표(19.2 GA·Free·`granular_scopes`·프리필 없음·최상위 그룹 Owner가 레거시 차단 가능 → 그 조직은 연결 불가, 수요 관측 시 재검토). 검증은 fine-grained 토큰을 분명한 사유로 거부한다(`/personal_access_tokens/self`). 불변식 11 문장은 그대로 | 사용자 2026-10-12(W0 `ask`) — 계정 단위 연결을 여러 프로젝트가 참조하는 모델과 프로젝트 한정 토큰이 맞지 않음, 검증 경로 하나 |
| D14 | ko의 GitLab 호칭 = **`MR`**(GitHub `PR` 관행과 대칭, 가이드 첫 언급만 `MR(GitLab의 merge request)`). 금지어 `머지 리퀘스트`·`머지 요청`·`병합 요청` | 지휘자 판단(E0 `ask`) — DESIGN §10 ko의 PR 축약 규칙이 대칭으로 답한다 |
| D15 | 디렉터리 = `lib/repo-host/`(경계) · `lib/gitlab/`(B transport + C client·reader·publish) · `lib/gitlab-connect/`(B2 PAT 연결, `lib/github-connect/` 짝). `lib/github.ts`는 제자리. 트리거: 앞 둘은 `test:projects:postgres`, `gitlab-connect`는 `github-connect`와 같은 스위트 | 지휘자 판단(A `ask`) — 기존 `github-connect` 대칭 |
| D16 | 호출자 접근 대조(onboarding-run `import`·`add`·`detect`)는 `sameRepository` + **GitHub 갈래는 `installationId` 동일까지** — 헬퍼 하나(`lib/repo-host/`). App 재설치 뒤에도 지금처럼 `repo-replaced`/`repo-forbidden` | 지휘자 판단(A `ask`) — A의 목표가 GitHub 동작 변화 0 |
| D17 | GitLab CI 변수 `MALMOI_I18N_*` 11개는 `brand-spelling.test.ts`의 `UPPER_EXCEPTIONS`에 **정확한 이름으로** 등재(접두 규칙 아님, D1이 그 파일을 고친다) | 지휘자 판단(D1 `ask`) — 기존 예외가 정확한 이름 목록이라 오타가 red로 남는다 |
| D18 | Codex 교차 허가 — **E-sh·F 구현, R-C 교차 리뷰(Opus 리뷰와 별도)** 에만 Astra(`gpt-6-astra`, effort medium 상한). 재시도·수정 라운드도 같은 워커·같은 effort | 사용자 2026-10-12 — 토큰 분산, 계약이 확정된 곁가지 배치 |
| D19 | `/account` [Replace token]에 다른 GitLab 사용자(user_id)의 PAT → **거부 `account-mismatch`**(Disconnect 후 Connect 안내). GitLab 사용자명은 평문(공개 핸들, `collected.ts` 등재), PAT만 토큰 키 봉투. `Project.gitlabConnectionId`는 Project를 not-personal로 유지(`DeliveryConfirmation.syncRunId` 선례). 열 이름 `Project.repoHost`(기본 `github`) | 지휘자 판단(B `ask`) — 교체가 연결 id를 유지해 참조 프로젝트 전부의 쓰기 명의를 권한 재검사 없이 바꾸는 것을 막는다 |
| D20 | 계정 GitLab 연결 해제·주인 멤버 제거로 프로젝트 참조가 비면 **그 프로젝트마다 `ProjectEvent`를 같은 tx에서 남긴다**(새 subtype, 행위자 = 해제한 사람 / 멤버 제거면 기존 `member.removed`와 같은 tx) — Logs가 "연결이 끊겼다"를 말한다. 문장은 E-ui | 지휘자 판단(B 인계 결정 요청) — CLAUDE.md "상태 변경은 변경과 같은 트랜잭션에서 사건으로 확정"(ProjectEvent, ARCHITECTURE §5.7). 프로젝트가 `Disconnected`가 되는 것은 프로젝트 상태 변경이다 |
| D21 | R-B 🟡 판정: ②참조가 빈 GitLab 프로젝트는 **모든 화면에서 `Disconnected`(재연결 필요, GitHub `unpinned`과 같은 톤)** — `RepoTargetResult`에 별도 갈래, `cross-screen.test.ts` MATRIX에 "GitLab 연결자 떠남" 행. ③`targetOfAccess`의 gitlab 갈래를 **`newRepoTarget`** 으로 갈라 새 리포 경로 허용 목록을 credential-separation이 센다(M1 뮤테이션 red). ④gate-plan 트리거 `lib/auth/members.ts`·`lib/projects/list.ts`는 **B fix가 추가**(지휘자 대신 — 코드 수정은 워커). ⚪2(`granular_scopes` 판정)·⚪3(`members/all` 대기 멤버 = forbidden) 채택 | 지휘자 판단 — design §2 사례 표("주인이 떠남 → Disconnected")·design §3("접근 확인 뒤 I/O는 참조 연결로")·POSTMORTEM 2026-10-07 |
| D22 | C 착수 판정: ①GitLab 연결 건강성에 GitLab 전용 갈래 `connection-unusable`(만료·401·403 scope·접근 상실·archived·sha1 아님) — 화면에선 D21과 같은 `Disconnected`, 저장 만료일 지남은 원격 호출 0, 5xx/429/네트워크는 `unknown` ②`sizes` 비-ok: `lfs` → `resource-limit`, `unavailable`은 AppError 유지 ③`pr-url.ts`·`remote-plan.ts` 호스트 갈래(GitLab `/-/merge_requests/<iid>`)는 C, 컴포넌트 호출부는 E-ui ④주소 계약 = `/projects/` 다음 세그먼트는 숫자, `%2F`는 `/projects/<id>/repository/` 아래 값·MR 질의에서만 허용(슬래시 브랜치) | 지휘자 판단(C `ask`) — design §2 "크기 조회 실패는 unavailable"·D21 톤 통일·불변식 11 첫 층 |
| D23 | `scripts/finalize-credentials.ts`가 `migrate deploy` 전에 verify로 `GitLabConnection`을 조회해, 2026-09-10 cutover 이전 DB에선 finalize가 실패한다 → **수용·기록만**(고치지 않음) | 지휘자 판단(R-Esh ⚪) — dev·prod·모든 셀프 호스팅 설치(2026-10-09 시작)가 이미 cutover를 지났다. 실제 대상 DB가 없다 |
| D24 | 목록·Inbox는 DB 판정만(참조 비움 = Disconnected). `connection-unusable`(원격으로만 아는 철회·접근 상실·보관)은 probe 화면(Home·설정·번역)에서만 Disconnected — cross-screen 행 "GitLab 토큰 못 씀"은 목록 active. 저장 만료일의 목록 사전 판정은 E-ui(만료 임박·Expired 톤과 함께) | 지휘자 판단(C `ask`) — GitHub `app-uninstalled`·`installation-changed`도 목록은 DB만 보고 probe 화면만 Disconnected인 선례 |
| D25 | GitLab 연결 판정: ①토큰 주인 쓰기 판정 문턱 = **Developer(30)**(sync 브랜치 push·MR 생성의 최소) — 연결 생성·재연결의 호출자 문턱 40은 정책이라 그대로 ②보관(archived) 프로젝트 = **읽기도 거부**(design §3 그대로, C 구현) — 건강성 `connection-unusable` ③`connection-unusable`일 때 Home은 **Disconnected + 재연결 컨트롤, Sync·Publish 둘 다 비활성**(C의 `planActionAvailability` 그대로). 서버의 수동 Sync 계약(읽기 전용 OWNER)은 바뀌지 않는다 | 지휘자 판단(C 인계) — 2026-10-12 처음 "보관 읽기 허용 · Sync 켬"으로 적었다가 C 구현·design §3과 어긋나 고쳤다: 화면 갈래를 하나 덜 만든다 |
| D26 | MCP 필드 호환 = **호스트 어휘**: GitHub 프로젝트 응답은 바이트 불변 + `repositoryHost:'github'`, GitLab 프로젝트는 `newFromGitLab`·`lastPublishMergeRequest`·`mergeRequest` + `repositoryHost:'gitlab'`. `connection-unusable`·`connection-removed`는 GitHub `unpinned`/`app-uninstalled`과 같은 MCP 값(재연결 필요 계열). `GITLAB_CI_RELEASE.sha` 미발행이면 `get_workflow` 거부 `workflow-unavailable`. 연결 없음·만료는 `needs-browser`(`gitlab-not-connected`·`gitlab-reconnect`). MCP에 PAT·재연결 도구 없음 | 지휘자 판단(D2 `ask`) — 기존 클라이언트는 GitHub 프로젝트만 알아 깨지는 소비자 0 · spec 완료 조건 9 |
| D27 | `scripts/smoke-gitlab.ts`의 `GITLAB_TEST_TOKEN`·`GITLAB_TEST_PROJECT` 직접 읽기는 `self-hosted-gates.test.ts`의 `DIRECT_READS_ALLOWED`에 `{ "*": 1 }` 한 행(env 맵을 순수 파서에 한 번 주입 — `scripts/preflight.ts` 선례) — 개발자 스모크 전용, `.env.example`·preflight·`lib/env.ts`에 넣지 않는다 | 지휘자 판단(F `ask`) — 운영자 설정이 아닌 이름을 운영 표면에 올리지 않는다 |

## 배치·파일 소유권

| 배치 | tasks | 소유 파일(요지) | 선행 | 모델 / effort | 상태 |
| --- | --- | --- | --- | --- | --- |
| W0 재개 확정 | §0 | `docs/features/gitlab-repositories/{spec,design,design-brief,tasks,consumers}.md` · `.scratch/gitlab-measure/`(원문) | 없음 | opus / high — 실물 API 판정·전수 표·경계 확정 | 인계 |
| A 공통 경계 | §1 | 리포 호스트 경계 모듈(신규) · `lib/github.ts` 소비자 이관 · 가짜 클라이언트(`createFakeGitClient`·`vi.mock("@/lib/github")` 소비자) · `scripts/gate-plan.ts`(**`lib/repo-host/`·GitLab 디렉터리 트리거를 A가 한 번에 등록** — C는 건드리지 않는다) · `vitest.*.config.ts` | W0 | opus / high — 소비자 59파일(직접 56 + 간접 3, consumers.md) 이관, 지문 바이트 불변 | 대기 |
| E0 용어 정본 | §5 첫·넷째 항목 | `docs/DESIGN.md`(§10.1·§2.4·§6·§6.2·§6.8) · `lib/i18n/__tests__/helpers/banned-terms.ts` · `lib/i18n/__tests__/terminology.test.ts` · `components/signin/brand-icons.tsx` · `components/__tests__/gitlab-glyph.test.ts` | W0 | opus / medium — ko 조사 규칙·금지어 회귀 | 대기 |
| D1 CI 템플릿 | §4 첫 항목 + §1 "CI 입력" 순수 함수 | GitLab 템플릿 생성기(`lib/onboarding/` 짝) · 템플릿 원본(W0가 위치 확정) · `lib/pull/__tests__/skip-marker.test.ts` · `docs/ACTIONS.md` GitLab 절 | W0 | opus / medium — 루프 가드 두 겹·불변 참조·`api-url` | 대기 |
| B 스키마·연결 | §2 B1·B2 | `prisma/schema.prisma` · `prisma/migrations/<new>/` · PAT 연결 Server Action · 연결 참조 · `credential-separation.test.ts` · `locked-access.test.ts` · **최소 GitLab transport(읽기 GET·숫자 id 주소·`execution.fetch` 주입점·오류 분류)** · `lib/privacy/collected.ts` 등재(새 필드) · **App 구성 여부 판정 헬퍼(D4a)** · `connectRepository` 호스트 가드 | A | opus / high — 봉투·잠금·인가 | 대기 |
| E-sh 셀프 호스팅·개인정보 | §5 여덟·아홉째 항목 | `lib/deployment/preflight.ts`(D4) · `deploy/.env.example` · `lib/credentials/conversion.ts` · `guide/*/self-hosting/` · `/privacy` 본문(`messages/ko-privacy.tsx`·en `publicDocs.privacy` 절 — 그 절만 E-sh 소유)·`lib/privacy/`(collected.ts는 B) | B | **codex astra / medium**(D18) | 대기 |
| C GitLab I/O | §3 | GitLab 쓰기·Publish·MR(B의 transport 위)·가짜 · Publish/Sync/야간 배선 · `lib/pull`·`lib/sync`·`lib/import`·`lib/nightly` GitLab 경로 · 연결 상태 `*.integration.ts` | B | opus / high — 실행 수명·중복 MR·fork MR | 대기 |
| F 스모크·roundtrip | §6 첫 항목 | `scripts/smoke-gitlab.ts` · `package.json`(script 한 줄) · `.claude/commands/roundtrip.md`(+ 미러) | C | **codex astra / medium**(D18) | 대기 |
| D2 MCP | §4 둘째 항목 | `lib/mcp/tools/*` · MCP 응답 문구(`messages/{en,ko,es}.tsx`의 `mcp` 절 — 새 키면 세 사전) | C · E-sh | opus / medium — 호환 정책·인가 | 대기 |
| E-ui 화면·사전 | §5 둘·셋·다섯·일곱째 항목 + 여섯째의 (E-ui) 하위 항목 | `lib/status/canon.ts` · `components/onboarding|settings|account|home|projects|logs|shell/*` · `messages/{en,ko,es}.tsx` · `lib/invitation-email/template.ts` | D2 · E0 · E-sh | opus / high — 문장 분기·접근성·375 | 대기 |
| E-doc 정본·가이드 | §5 여섯째의 (E-doc) 하위 항목 | `docs/{PRODUCT,ARCHITECTURE,DIRECTORY,OPERATIONS}.md` · `README.md` · `guide/{en,ko,es}/`(셀프 호스팅 제외) · OPERATIONS 롤백 줄(D6a) | E-ui | opus / medium — 불변식 6·11 재서술·결정 27건을 정본으로 올림(sonnet에서 올림) | 대기 |
| DS 시안 대조 | §5 "시안 대상 신규 UI는 `/design-sync`" | main 체크아웃, 리포트 전용(computed style·접근성 트리) — 대상: ① GitLab 탭·PAT 입력 shell · `/account` GitLab 카드 · 설정 재연결 카드 · Home Platform 행. 불일치는 E-ui 워커가 고친다 | E-ui 통합 | opus / medium | 대기 |
| QA 런타임 | §5 [수동] · §6 + D1 [수동](실제 GitLab CI) | main 체크아웃, 읽기 전용(`/runtime-test` · `/roundtrip`) | push 후 | opus / medium | 대기 |
| R 독립 리뷰 | — | 읽기 전용, `.scratch/review-<batch>.md` | 각 배치 인계 | opus / medium(A·B·C는 high) · **R-C는 codex astra 교차 리뷰 추가**(D18) | — |

## 파일 겹침·실행 순서

| 조합 | 겹침 | 실행 |
| --- | --- | --- |
| W0 / 나머지 | W0가 계약을 확정한다 | W0 먼저, 단독 |
| A / E0 / D1 | 없음 — E0는 문서·i18n 테스트·글리프, D1은 CI 템플릿·마커 테스트, A는 `lib/` 경계 | **병렬 파동 1** |
| A → B → C | 같은 `lib/` 소비자 | 직렬 |
| E-sh / C | 없음 — preflight·credentials·privacy·셀프 호스팅 가이드 vs GitLab I/O | **병렬 파동 2**(B 통합 뒤) |
| F / D2 | 없음 | **병렬 파동 3**(C 통합 뒤) |
| D2 → E-ui | `messages/en.tsx`(mcp namespace) | 직렬 |
| E-ui → E-doc | 가이드가 화면 문구를 인용 | 직렬 |
| DS / E-doc | 없음(DS는 리포트 전용·main 체크아웃 dev 서버, E-doc은 워크트리 문서) | E-ui 통합 뒤 **병렬**. DS 수정은 E-ui 워커 → 통합 → 무부하 게이트 → push → QA(runtime-test·roundtrip). DS와 QA는 ego 세션을 공유해 겹치지 않는다 |
| E-sh / E-doc | `guide/*/self-hosting/` — E-sh 소유, E-doc는 손대지 않는다 | 소유권으로 분리 |

`messages/{en,ko,es}.tsx`는 절 단위로 나눈다 — `publicDocs.privacy`·`ko-privacy.tsx`는 E-sh, `mcp` 절은 D2, 나머지는 E-ui. 세 배치는 **E-sh → D2 → E-ui 직렬**이라 동시에 열리지 않는다. 지휘자 몫: §6.4 전체 게이트, QA 뒤 `docs/SELF-HOSTING.md` 실습 기록(§6.3·§5).

## 공통 검증·인계

- `/ship bypass`. 임시 브랜치 = dev 등가, **11단계 `/push` 전에 멈춤**. 워커 `git push`·`/merge`·`/sync`·`db:deploy` 금지. `.env.local` 복사 금지.
- 스키마: **B만** 허용. DB 없이 `prisma migrate diff`(연결하지 않는 더미 `DIRECT_URL`을 준다 — 없으면 빈 출력 + exit 0)로 SQL만 만든다. 백필은 SQL 안에서 끝낸다(SELF-HOSTING §3-1). dev DB 적용은 지휘자.
- 테스트 먼저(red 커밋 → 구현 커밋). 워커 최종 게이트 `pnpm gate --base dev` — **출력 파이프 금지**, 끝줄만 근거.
- 런타임: 결정적으로 잴 수 있는 것은 `*.integration.ts` 시나리오(끝 단언은 뷰 모델 출력). 인계의 런타임 목록엔 렌더·포커스·라이트/다크·375·실제 외부만.
- `.scratch/handoff-<batch>.md`: 커밋 SHA · red/green · gate 끝줄 · 변경 파일 · 계획과 다른 점 · 미룬 항목 · 런타임 (b)와 이유.
- 선행에 기대는 항목은 **하지 말고 남긴 채** `worker_done` — 기다리지 않는다. 지휘자가 선행 통합 뒤 새 Task로 보낸다.
- 지휘자 통합: cherry-pick → `pnpm gate`(끝줄). push는 E까지 쌓인 뒤 한 번.

## 실행 기록

- 2026-10-12: 인테이크 — 결정 D1~D12 기록. W0 착수.
- 2026-10-12: W0 인계(커밋 6, 문서만) → dev 통합 `54543ce0..c92ab4a5`. 결정 D6a(지휘자)·D13(사용자) 추가. R-W0(경계 서명 리뷰)·E0·D1 병렬 착수, A는 R-W0 뒤.
- 2026-10-12: R-W0 리뷰 🔴5·🟡多 — 서명 둘(`repoTargetOf` 상태 구분·GitLab 숫자 id 주소)은 A 착수 전 W0 fix1로 design에, 배치 경계 다섯은 이 문서 배치 표로 반영(B가 최소 transport·`collected.ts`·D4a 헬퍼·`connectRepository` 가드를 가진다).
- 2026-10-12: W0 fix1(커밋 3) dev 통합. A 착수.
- 2026-10-12: E0 인계(커밋 4, gate ok) → R-E0 🔴0·🟡1 → dev 통합. **E-ui 브리프 필수 한 줄**(R-E0 🟡): PR/MR 문구는 호스트 분기 함수가 아니라 `pr…`/`mr…` 접두 **별도 키**로 둔다 — 사전 워커가 함수를 같은 인자로 한 번만 불러 GitLab 갈래를 훑지 않아 금지어 규칙이 거짓 green이 된다. 그 밖 ⚪5는 `.scratch/review-E0.md`(`/projects` 띠·Open on GitLab의 DESIGN 등재는 E-ui).
- 2026-10-12: E0 통합 뒤 `pnpm gate` = `FAILED at test` — `components/__tests__/api-contract.test.ts` 5건, 병렬 워커 부하 타임아웃(단독 재실행 54/54 green). push 전 무부하 `gate: ok`를 다시 근거로 쓴다.
- 2026-10-12: D1 인계(커밋 5, gate ok) → R-D1 🔴0·🟡3 → D1 fix1(tsconfig include `.gitlab/**/*.ts` · push.sh 마커·SHA 줄 실행 테스트). **E-ui 브리프 필수**(R-D1 🟡2): `GITLAB_CI_RELEASE.sha=null`이면 화면이 GitLab CI 템플릿을 내지 않는다. **`/merge` 준비물**: 태그 `malmoi-i18n-push-gitlab-v1` 발행 + `GITLAB_CI_RELEASE.sha` 채움(그 전엔 GitLab CI job이 fail-closed).
- 2026-10-12: D1 fix1(커밋 2, gate ok) → dev 통합. E-ui 계약: `GITLAB_CI_RELEASE.sha`가 40자 hex가 아니면 GitLab CI 템플릿을 내지 않는다.
- 2026-10-12: A 인계(커밋 3, gate ok, 75파일) → R-A(opus high) 🔴1(테스트 두 곳의 쓰기 0 단언이 삭제된 메서드 문자열을 들어 공허)·🟡1·⚪8, GitHub 동작 보존 위반 0 → A fix1. B 브리프에 ⚪2(`targetOfAccess`)·⚪4(credentials 트리거 인계). C 브리프 몫: ⚪3(`sizes` 앞 `MAX_FILES` 판정)·⚪8(publishSnapshot 중간 실패 GitHub 사례). E-doc 몫: ⚪7(ARCHITECTURE §3 `createRef` 서술).
- 2026-10-12: A fix1(커밋 1, 옛 "쓰기 0" 단언이 공허했음을 뮤테이션으로 확인) → dev 통합 `7168ef82..4aa8bb0b`. dev(W0·E0·D1·A) `pnpm gate` = **`gate: ok`**(test 13703 · projects 636 · build). B 착수(opus high).
- 2026-10-12: B 인계(커밋 3 — B1 마이그레이션 `20261012120000_add_gitlab_connection`, gate ok: test 13784 · projects 649 · credentials 69) → R-B(opus high). D20은 B 수정 라운드에 싣는다.
- 2026-10-12: R-B 🔴0·🟡5·⚪8 → B dev 통합 `37b75c59..6a000266`(마이그레이션 포함, dev DB 미적용 — push 직전 일괄). E-sh(Codex Astra) 착수. B fix1 = 🟡1(D20 + 해제를 잠금·tx 안으로)·🟡2·🟡3·🟡4·🟡5·⚪2·⚪3. C는 B fix1 통합 뒤.
- 2026-10-12: B fix1(커밋 2, gate ok: test 13794 · projects 654, 뮤테이션 M1·잠금 제거 red 확인) → dev 통합. 새 사건 `settings.repositoryDisconnected`(문장은 E-ui). 계정 삭제 사건 없음(D20 범위 밖, FK 그물). C 착수.
- 2026-10-12: E-sh(Astra) 인계(커밋 2, red→green 확인, gate ok) → R-Esh 🔴0·🟡2 → dev 통합. E-sh fix1 = 🟡1(GitLab 전용 설치는 GitLab 이전 버전으로 롤백 시 preflight 거부 — operate.md 세 언어). 🟡2(App 부재 화면 갈래 소비자 0)는 E-ui 브리프·QA.
- 2026-10-12: E-sh fix1(커밋 1, gate ok: 13803 · projects 654) → dev 통합. E-sh 워크트리 정리.
- 2026-10-12: C 인계(커밋 2, +2597줄, gate ok: 13947 · projects 681, 실물 클라이언트 = 가짜 모양 확인) → R-C(Claude opus high) 🔴0·🟡3 · R-C(Astra 교차) 🔴0·🟡2 — 겹침: credential 스캐너. C fix1 = Reporter 강등을 `connection-unusable`로(토큰 주인 `members/all`, Sync 계약 보존) · `transport.send` 쓰기 계수 + 연결 자리 `file#function` 허용 목록 · gate-plan 트리거 9 · 야간 import Inbox 뷰 모델 단언. F 브리프에 R-C 🟡3(원격 blob id == `git hash-object`).
- 2026-10-12: C fix1(커밋 2, red 23+1 → gate ok: 13973 · projects 683, 뮤테이션 둘 red) → C 전체 dev 통합 `6f627448..1406f5f9`. 보류(인계): ⚪5 fake-fetch 질의 슬래시 비대칭 · ⚪3 토큰 교체 뒤 메모 stale. D2(Opus)·F(Astra) 착수.
- 2026-10-12: C 통합 dev `pnpm gate` = `FAILED at test:projects:postgres` — `lib/keys/__tests__/search-performance.integration.ts` 중앙값 404·472ms > 300ms(병렬 워커 3 + 리뷰어 부하 중). **push 전 무부하 게이트에서 재측정 필수** — 그때도 넘으면 B/C의 검색 쿼리 변경 회귀로 보고 소유 배치에 돌려보낸다. F(Astra) 인계(커밋 2, gate ok, 실물 스모크 통과) → R-F(sonnet).
- 2026-10-12: R-F 🔴0·🟡2(순수 테스트 밖 `resolveId`·MR 루프, 실물 roundtrip에서 `transport.send` PUT 머지 경로 확인 — QA 몫) → F dev 통합. F 워크트리 정리.
- 2026-10-12: D2 인계(커밋 3, gate ok: 14020 · projects 689, GitLab 거절 코드가 재시도 가능 `unavailable`로 접히던 잠복 버그 수정) → dev 통합. E-ui(opus high) 착수, R-D2(opus medium) 병렬 — D2 수정 라운드는 `lib/mcp`·`mcp` 절만이라 E-ui와 안 겹친다.
- 2026-10-12: R-D2 🔴0·🟡2(publish too-soon 문구가 GitLab에 "pull requests" · `en.mcp.errors.gitlab` 중복 문구 — 둘 다 E-ui로 전달). D2 워크트리 정리. QA 메모: `get_workflow`는 GitLab CI SHA 발행 전엔 `workflow-unavailable`만 낸다.
- 2026-10-12: E-ui 인계(13커밋, gate ok: 14300 · projects 689) → dev 통합. dev DB에 B 마이그레이션 적용(`migrate deploy` → `db:status` 최신, anon·authenticated USAGE·CREATE 네 칸 false, GRANT 0). DS(main 체크아웃)·R-Eui·E-doc 병렬 착수 — DS가 main에서 `pnpm dev` 중이므로 그동안 cherry-pick·build 금지.
- 2026-10-12: **선행 dev 회귀 발견**(DS): `9947caad`(이 런 이전, origin/dev·preview에 이미 나감)가 `"use client"` 없는 `components/ui/input.tsx`에 이벤트 핸들러를 넣어 서버 컴포넌트 `/account`가 RSC 오류로 떨어진다. 프로덕션(v1.3.4)엔 없다. X1 워커(opus medium)로 재현 테스트 → 수정. DS의 G8(/account)는 수정 통합 뒤 실측. 끝나면 `/postmortem`.
- 2026-10-12: R-Eui 🔴0·🟡4 → E-ui fix1(spec 9 사전 스윕·GitLab 거부 라우팅 테스트·설정 `repo-moved` 복구 컨트롤·D4a DOM·`ciFileOf` → `lib/onboarding`). DS 인계: 일치 G1·G3·G4·G5, 불일치 이슈 #244–#252 + 관찰 #254(Publish 결과 MR `#3` → `!3`) → **E-ui fix2로 보낸다(fix1 `worker_done` 뒤)**, #253 = X1 회귀. G8(`/account`)·G2d·G6d·다른 OWNER G6 미측정 — G8은 X1 통합 뒤 DS 재실측. dev DB: GitLab 연결·`malmoi-gitlab-test` 프로젝트 유지(QA용), MR !3 닫고 브랜치 삭제.
- 2026-10-12: E-doc 인계(문서 커밋 9 — PRODUCT·ARCHITECTURE·DESIGN·DIRECTORY·OPERATIONS·README·CLAUDE+미러·가이드 세 언어 19쪽) → dev 통합. 게이트는 부하 타임아웃만 red(코드 diff 0). R-Edoc 착수. E-ui fix2 추가 몫: `/account` GitLab Disconnect 확인 버튼이 'Disconnect app' 재사용 · 생성 GitLab job에 `MALMOI_I18N_WRAPPER` 누락. E-doc 몫(리뷰 뒤): AUTHORING 외부 라벨·사실 소스. 가이드 스크린샷 stale은 QA 뒤 `/guide-shots`.
