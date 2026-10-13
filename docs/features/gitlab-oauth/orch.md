# GitLab sign-in — 지휘 계획 (`/orchestrate`)

작성: 2026-10-13 · 지휘: Claude Code(Opus 5.5) · 원본: [tasks.md](tasks.md)(체크 항목) · [design.md](design.md) · [spec.md](spec.md) — 여기에 복제하지 않는다.
시작 dev: `0a57f981`(origin/dev `89b27c21` + 문서 커밋 둘, 미푸시) · Orca run: `run_36e6d3a1dfc4`

## 결정 기록

| # | 결정 | 근거 |
|---|---|---|
| O1 | 워커 패밀리 = Claude Code(Opus 5.5·Sonnet 5.5, effort ≤ high) 기본. **교차 허가: C·E·F·G 네 배치는 Codex Astra(`gpt-6-astra`, effort medium)** — 그 밖(T0·A·B·D·Q·리뷰)은 Claude. 리뷰는 같은 패밀리 규칙대로 Opus — Astra 배치의 리뷰가 곧 교차 검증이다 | 사용자 허가(2026-10-13 "astra좀 적당히 섞자" → C·E·F·G 승인). Astra effort 상한 medium |
| O2 | **A~E는 한 번에 push** — 각 배치는 로컬 dev에 통합(cherry-pick + `pnpm gate`)하고, push는 A·B·C·D·E가 모두 들어간 뒤 한 번 | tasks "배치 경계"(방침이 코드보다 늦으면 거짓). 지휘자 판단 |
| O3 | C의 격리 PG 시나리오(해제 독립)는 B로 옮긴다 — `postgres.integration.ts` 소유자는 B 하나 | 파일 겹침. 지휘자 판단 |
| O4 | E(방침)는 wave 1에서 병렬 — `messages/en.tsx`는 A·D와 같은 파일이지만 **소유 구역이 갈린다**(E: 방침 `:706-968` + `ko-privacy.tsx` / A: `link.providers` `:3998` + ko·es 대응 / D: `signIn`·`account.gitlab` `:2100-2135`·`:3594` + ko·es 대응). 구역 밖을 건드리지 않는다고 브리프에 적는다 | 같은 파일·다른 hunk — cherry-pick 충돌 없음. 지휘자 판단 |
| O5 | DS 행 없음 — design-brief·시안 핸드오프가 없고 신규 화면이 없다(`/feature-review` 판정). 시안 대조 대신 QA의 D6 체크리스트 + 375폭·라이트·다크 레이아웃 | §0 4.5. 지휘자 판단 |
| O6 | T0는 **main 체크아웃**에서 돈다(`.env.local`의 앱 값이 필요) — 앱 코드 없이 `.scratch/` 단독 OAuth 왕복 스크립트(포트 3000, callback `/api/auth/callback/gitlab`)로 잰다. 값·토큰은 출력하지 않는다. T0가 main 체크아웃을 쓰는 동안 cherry-pick·build 금지 | `.env.local` 복사 금지 + 워크트리에 없음 |
| O7 | 가이드 스크린샷(tasks §7 둘째)·`/merge` 뒤 Production env·디렉터리 삭제(tasks §8 둘째·셋째)는 **이 런 밖** — `/merge`를 지휘자가 부르지 않으므로 | 스킬 금지 사항 |
| O8 | Preview env 투입(tasks §8 첫째)은 **사용자가** CLI 스크립트로 한다 — push 직전에 요청하고 `vercel env ls`(이름만) 확인은 지휘자가 한다 | 사용자 2026-10-13 · `.env.local` 비열람 |

## 배치

| 배치 | 항목(tasks) | 파일 소유 | 선행 | 모델·effort | 자리 | 상태 |
|---|---|---|---|---|---|---|
| **T0** 실측 | §0 T0 ①~⑥ | `.scratch/t0-gitlab/`만(코드 없음) | — | Opus 5.5 · medium — 브라우저 + 판정 | main 체크아웃 | ✅ ①~⑤ · ⑥ 미측정 |
| **A** 우주·env | §1 전부 | `lib/login-link/{policy,message}.ts` · `lib/auth/{login-providers,safe-adapter,roundtrip}.ts` · `lib/auth/email.ts`(`:114` 주석만) · `lib/credentials/{access,migration,conversion}.ts` · `lib/session-revocation/{policy,store}.ts` · `lib/deployment/preflight.ts` · `scripts/gate-plan.ts` · `prisma/schema.prisma`(`:637` 주석만) · `.env.example` · `deploy/{.env.example,compose.yaml}` · `messages/{en,ko,es}.tsx`(`link.providers`만) · 신규 `lib/auth/__tests__/provider-universe.test.ts` + 해당 테스트들 | — | Opus 5.5 · high — 보안 경계(callback 가로채기)·게이트 설계 | 워크트리 | ✅ dev 통합(R-A 🔴0) |
| **C** 경계 정적 | §3 정적 규칙 둘(PG 시나리오는 B — O3) | `lib/github-connect/__tests__/credential-separation.test.ts` | — | **Codex Astra · medium** — 테스트 하나, 기계적 | 워크트리 | 대기 |
| **E** 방침 | §5 | `messages/en.tsx`(방침 구역만 — O4) · `messages/ko-privacy.tsx` · `lib/privacy/collected.ts`(주석) · `lib/privacy/__tests__/policy-gate.test.tsx` | — | **Codex Astra · medium** — 줄 목록이 design §7에 고정. 거짓 문장은 R-E(Opus)·`/push` 4단계가 거른다 | 워크트리 | 대기 |
| **B** provider·이메일 | §2 전부 + §3 PG 시나리오(O3) | `lib/auth/{email,profile}.ts` · `auth.ts` · `lib/credentials/__tests__/{sign-in.test.ts,postgres.integration.ts}` · `lib/security-headers.ts` · `app/(edit)/account/actions.ts`(D4 조건부) · 해당 테스트 | **A 통합 + T0 ①②③** | Opus 5.5 · high — 인증 경계 | 워크트리 | 대기 |
| **D** 화면·글리프 | §4 코드 항목 전부(ProviderIcon · 브랜드 글리프 D6 · 테스트 기본 env · 사전 · J8) | `components/signin/brand-icons.tsx` · `app/signin/**` · `app/invite/[token]/page.tsx` · `app/oauth/authorize/page.tsx` · `components/account/{login-methods,github-section,gitlab-section}.tsx` · `components/settings/repository-card.tsx` · `vitest.setup.ts` · `messages/{en,ko,es}.tsx`(`signIn`·`account.gitlab`·초대 안내 — O4) · 해당 테스트(`sign-in.test.ts:20` 포함 — B 뒤라 겹침 없음) | **B 통합** | Opus 5.5 · medium — UI 이관 + 다수 테스트 갱신 | 워크트리 | 대기 |
| **F** 정본 문서 | §6 전부(PRODUCT · ARCHITECTURE · CLAUDE.md · DESIGN · OPERATIONS · SELF-HOSTING · README · DIRECTORY) — 문서별 커밋 | `docs/*.md`(features 제외) · `CLAUDE.md`(+ 미러 재생성) · `README.md` | **D 통합 + T0** | **Codex Astra · medium** — 분량이 가장 크고 코드 위험 0 | 워크트리 | 대기 |
| **G** 가이드 원고 | §7 첫째(en·ko·es) | `guide/{en,ko,es}/**` | **D 통합**(PAT 카드 최종 낱말) | **Codex Astra · medium** — `/guide` 미러 | 워크트리 | 대기 |
| **R-<배치>** 리뷰 | 각 배치 diff 독립 리뷰(§3) | 리포트 전용 | 그 배치 `worker_done` | Opus 5.5 · medium | 워크트리 없음(브랜치 diff 읽기) | — |
| **Q** 런타임 QA | §4 실물(`/runtime-test` — 세 화면 375·라이트·다크 · 왕복 · 초대 · `/account` 네 상태 · **D6 체크리스트 8줄**) | 리포트 + BugShot 이슈 | A~E 통합(push 전, 로컬) | Opus 5.5 · medium | main 체크아웃, 단일 워커 | 대기 |
| **P** push + preview | §8 첫째 — 사용자 Preview env 투입(O8) → `git push` → CI → `dev.mal-moi.com` GitLab 왕복 · `Account(gitlab)` 토큰 null(dev DB) | 지휘자 + (왕복은 Q 워커 재사용) | Q 통과 | — | main 체크아웃 | 대기 |

**겹침 판정**: A↔B(`lib/auth/email.ts` — A는 `:114` 주석만, B는 본문 → B가 A 뒤라 직렬) · A↔D(`messages/*` 다른 구역 + D는 `LoginProvider` 셋을 전제 → 직렬) · B↔D(`sign-in.test.ts` → 직렬) · A↔E·C↔*(겹침 없음 또는 O4 구역 분리 → 병렬) · F↔G(겹침 없음 → 병렬).

**wave**: ① T0 · A · C · E 동시 → ② A 통합 + T0 결과 → B → ③ B 통합 → D → ④ D 통합 → F · G 동시 · Q(로컬) → ⑤ P(push) → F·G 통합 뒤 다시 push.

**주인 없는 항목 대조**(tasks 체크 ↔ 배치): §0 결정·앱 등록(완료) · T0 → T0 · §1 → A · §2 → B · §3 → C(+B) · §4 코드 → D · §4 실물 → Q · §5 → E · §6 → F · §7 원고 → G · §7 스크린샷 → O7(런 밖) · §8 push·preview → P · §8 prod·삭제 → O7(런 밖). **0건.**

## 진행 로그

(통합 커밋·검증 결과·라운드·이슈를 시간순으로 적는다.)

- 2026-10-13 03:44Z — wave ① 착수: T0 `ctx_e7ae7d207aca`(Opus medium, main) · A `ctx_8f1a4da7f238`(Opus high, `go-A`) · C `ctx_2d7f10d46ce2`(Astra medium, `go-C`) · E `ctx_3d811160c131`(Astra medium, `go-E`). launch.effective = requested 확인.
- 03:5xZ — C 질문: 규칙 1이 `lib/auth/members.ts:14`의 `@/lib/gitlab-connect/removal` import로 red. **지휘자 판단 — 승인**: members.ts는 로그인 경로가 아니라 멤버 변경 코어(인가·사건)다. `lib/auth` 전체 스캔 유지 + 그 import 한 쌍만 정확 집합 허용(파일 제외 금지). F(정본)는 ARCHITECTURE 경계 문장에 이 예외를 적는다.
- 04:xxZ — T0 1차 차단: 앱 Callback URL 불일치 → 사용자 수정 → 재개. **T0 완료**(`worker_done` succeeded): ①② ✅(D1 유지·J2 통과) · ③ prompt 무시 → D4 코드 없음(tasks §2 해당 항목 삭제) · ④ gravatar(D3 유지) · ⑤ 재인증 화면 생략·계정 전환 불가 → ARCHITECTURE 회수 절 한계(F) · ⑥ **미측정**(`ox501501`이 그룹 Owner). design·tasks에 반영. T0 워커 해제.
- T0 ⑥ — **사용자 결정: 미측정으로 두고 프로덕션 실물(spec #11)에서 확인**.
- C `worker_done` outcome=failed — 커밋 `eafe8f65`(대상 42 green, 뮤테이션 둘 red 관측). failed 사유는 전체 gate의 timeout 8건(api-contract·hand-copies·guide content·mcp docs — 단독 재실행 261 green)뿐 → 부하 flake로 판정, 작업 수용. 워커 retain. 리뷰 R-C `ctx_7c70deff1804`(Opus medium) 착수.
- E 게이트 timeout(Changelog·MCP docs) → 지휘자: 한 번 재실행, timeout만이면 커밋하고 통합 게이트에서 재판정.
- R-C 완료(🔴 0 · 🟡2 — 규칙 2가 Account 우회 꼴 여섯을 놓침 · 템플릿 리터럴 동적 import · ⚪ 다섯). C fix1 `ctx_8235c7237aa3`(같은 터미널) — 🟡 둘 + ⚪1·4·5. ⚪2(전이 import)·⚪3(로그인 범위 확장)은 설계 범위 밖으로 제외(지휘자 판단). R-C 해제.
- E `worker_done` succeeded — `a9979db4`(4 files), 재실행 `gate: ok`. 워커 retain. 리뷰 R-E `ctx_fbb945cc6a16`(Opus medium) 착수.
- A `worker_done` — `e6142bee`(tasks §1 전부). 게이트 `FAILED at test:projects:postgres`: ① `lib/mcp/__tests__/gitlab-tools.integration.ts` 2건이 **dev에 원래 있던 stale**(`89b27c21`이 `GITLAB_CI_RELEASE.sha`를 박았는데 기대는 `workflow: null`) ② 성능 측정 2건(부하 avg ~30). 나머지 단계는 따로 green(credentials PG 70/70 · build · mirror). → **A fix0** `ctx_d65cbfcd712f`(A 터미널, stale 테스트 갱신 — 지휘자 판단: 범위 밖이지만 통합 게이트를 막는다) · **R-A** `ctx_cf48f6a8bcec`(리뷰 전용 워크트리 `go-RA`, base `e6142bee` — A 워커의 fix0과 뮤테이션이 섞이지 않게).
- R-E 완료(🔴 0 · 🟡 1 — PAT 행·보관 줄의 'connect/disconnect GitLab'이 로그인 해제로 읽힌다 · ⚪ 4). **E fix1** `ctx_93b08556beab`. R-E 해제.
- C fix1 `worker_done` — `1138e6ba`(우회 꼴 14 표본 red→green · 실파일 뮤테이션 10회 red · `gate: ok`). R-C 🔴 0에서 시작한 🟡 수정이라 재리뷰 생략(지휘자 판단 — 증거가 뮤테이션 로그로 남음). **C 통합 대기**(A·E와 한 번에).
- R-A 완료(🔴 0 · 🟡 2 · ⚪ 4 — 보고서 사본 `.scratch/orch-gitlab-oauth/review-A.md`). 🟡1(우주 게이트가 2갈래 삼항을 못 본다 — 화면 여덟 자리가 gitlab을 Google로 떨어뜨린다)·🟡2(게이트 스캔 파일 수 하한)는 **D로 넘긴다**(지휘자 판단 — D가 그 삼항을 이관하며 `provider-universe.test.ts`를 같이 만진다; A 통합 뒤라 소유 이전). R-A 해제.
- E fix1 게이트: translation-workspace.test.tsx:432 타이밍 1건(단독 38/38) → 지휘자: 커밋·기록, 통합 게이트가 판정.
- E fix1 `worker_done` — `abe6b405`(Y1·W1~W3, 같은 2026-10-13 개정). **E 통합 대기.**
- A fix0 `worker_done` — `9bc8e520`(stale 기대 갱신, 앱 코드 무변경 — 동작이 맞음을 먼저 확인) · `gate: ok`(projects PG 697/697 · credentials PG 70/70). **A·C·E 통합 착수.**
- **A·C·E 통합**(로컬 dev, 미푸시 — O2): `50ee1361`·`f5a87740`(A) · `260f70dc`·`e28bcb37`(C) · `d32c1e43`·`ec595312`(E). `pnpm gate` **ok**(14547 · projects PG 697 · credentials PG 70 · build · mirror). A·C·E 워커 해제, 워크트리 정리.
- wave ② — **B** `ctx_a05e1d9d1381`(Opus high, `go-B`, base `ec595312`).
- B `worker_done` — `32149310`(§2 + §3 PG 시나리오, credentials PG 70→101, 뮤테이션 넷 red, `gate: ok`). B retain. **R-B** `ctx_2e2f5f7a8962`(리뷰 전용 워크트리 `go-RB`). D 브리프 준비(R-A 🟡 둘 포함).
- 사용자: gitlab.com 외부 테스트 계정 생성(**ox501tube@gmail.com**, Google OAuth 가입 — 그룹 `malmoi` 비멤버). → T0 ⑥을 프로덕션 대신 **Q(로컬 runtime-test)에서 잰다**(지휘자 판단 — 계정이 생겨 앞당길 수 있다). 같은 이메일의 Google EDITOR 사용자가 dev DB에 있으면 GitLab 첫 로그인이 병합 확인(`/signin/link`)을 밟는다 — spec #4 실물 사례로 Q에 넣는다.
- R-B 완료(🔴 0 · 🟡 4 · ⚪ 5 — 사본 `.scratch/orch-gitlab-oauth/review-B.md`, credentials PG 101 green, 뮤테이션 9 중 8 PG red · M8(expires_at)만 단위 red). **B fix1** `ctx_2c532d826edc` — 🟡 넷(throw 착지 주석·PG `expires_at`·fakeAuth 갱신 입력·빈 id). R-B 해제·워크트리 정리.
- **B 통합**: `1569b15e`·`dbf5b47e`. `pnpm gate` **ok**(14564 · projects PG 697 · credentials PG 103 · build · mirror). B 인계 보존(`.scratch/orch-gitlab-oauth/handoffs/`). ⚠️ A·C·E 인계 원본은 워크트리 정리와 함께 사라졌다 — A의 런타임 (b) 목록은 worker_done 요약·R-A로 갈음(실질 항목 없음), E 사람 판정 목록은 지휘자 보존본.
- wave ③ — **D** `ctx_02779b576050`(Opus medium, `go-D`, base `dbf5b47e`).
- D `worker_done` — `281d0fb2`(24 files · 뮤테이션 9 red · `gate: ok` 14596 · R-A 🟡 둘 닫음). D retain, 인계 보존. **R-D** `ctx_4c9d4c2e661d`(리뷰 워크트리 `go-RD`).
- wave ④ 앞당김 — **F** `ctx_ee134488640a` · **G** `ctx_72b6d9450f46`(Astra medium, base `281d0fb2` — 문서·가이드만이라 D 리뷰와 병렬. R-D가 낱말을 바꾸면 F·G에 후속 Task).
- R-D 완료(🔴 0 · 🟡 2 · ⚪ 5 — 뮤테이션 21, 글리프 출처 press kit 바이트 일치). 🟡1 J8 낱말이 카드 밖(account-mismatch·사건·disconnectFailed)에 남음 · 🟡2 J8 비중복 단언이 en만. **D fix1** — 🟡 둘 + ⚪1·2·4, ⚪3·5는 Q 관찰. R-D 해제·정리. ⚠️ D fix1이 낱말을 바꾸므로 G에 후속(바뀐 낱말 표) 필요.
- F `worker_done` — 문서 9커밋(`fa31a63f`..`612a23a7`), pnpm test 14596 green · 게이트는 timeout 6(단독 68 green). F retain, 인계 보존. **R-F** `ctx_3ac3bec9c0be`(사실 오류 대조).
- D fix1 `worker_done` — `9689d020`(J8 낱말 카드 밖 셋 · 세 사전 단언 · ⚪1·2·4, M13~16 red, 2회차 `gate: ok`). **D 통합**: `5558d3a0`·`be794ef4`, 통합 게이트 진행.
- G `worker_done` — `f3365977`(가이드 9종 × en·ko·es, pnpm test green · 게이트 api-contract timeout만). **G fix1** — D fix1 낱말 따라가기(rebase `9689d020`).
- R-F 완료(🔴 0 · 🟡 1 OPERATIONS Vercel 스크립트(환경 하드코딩·반쪽 쌍 정리) · ⚪ 5). **F fix1** `ctx_13d452ff978e`. R-F 해제·정리.
- F fix1 `worker_done` — 문서 5커밋 추가(총 14), pnpm test 14596 · mirror green. **F 통합 대기**(Q 뒤 — QA가 main 체크아웃을 쓰는 동안 cherry-pick 금지).
- D 통합 게이트 1회차 `FAILED at test:projects:postgres` — `search-performance.integration.ts` 중앙값 401·407ms > 300(병렬 워커 게이트 부하 — A·B 인계가 이미 보고한 같은 flake, 단위 14604 green). 부하 낮은 지금 전체 재실행. G fix1 `worker_done` — `03bd8252`·`9d10ee74`, `gate: ok`. **R-G** `ctx_86b6d64da522`.
- R-G 완료(🔴 0 · 🟡 1 install.md 앱 등록 자리가 그룹만 · ⚪ 3). **G fix2** `ctx_fa123f5f3498`(🟡 + ⚪3 재인증 화면 생략 한 줄). R-G 해제·정리.

