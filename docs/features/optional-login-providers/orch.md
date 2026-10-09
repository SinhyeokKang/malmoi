# Optional login providers — 지휘 계획

원본: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md) — 이 문서는 지휘 상태만 든다(복제하지 않는다).

- 착수: 2026-10-09 · 시작 dev `94bf9336`
- 끝은 dev push다. `/merge`는 사용자가 부른다. 스키마 변경 없음 → prod `db:deploy` 불필요.

## 결정 기록

- spec §6 Q1~Q7 — 2026-10-09 사용자(추천안 전부). 이 런에서 새로 물은 것 없음.
- 지휘자 판단 — 워커 패밀리는 Claude Code(Opus 5.5)만. Codex 교차 허가가 이 런에 없다.
- 지휘자 판단 — T1~T7(tasks의 커밋 A·B)을 한 워커(A)에 둔다. T3·T7이 T1의 `LOGIN_PROVIDER_ENV`·공유 `present`에 기대고, `vitest.setup.ts` 더미가 preflight 테스트에 닿는지를 같은 손이 봐야 한다.
- 지휘자 판단 — 문서(T8·T9)는 파일이 겹치지 않아 A와 병렬(D). 이름·문구는 design §2.2·§2.5가 고정했으므로 그대로 쓰고, A가 dev에 들어간 뒤 rebase해 코드와 대조 + T9a(SHOOTING SHA)를 한다.
- 지휘자 판단 — T10(로컬 단일 공급자)은 QA 워커가 main 체크아웃에서 **셸 env로 GitHub 쌍을 비운** `pnpm dev`로 본다(`.env.local` 편집 없음). Next가 이미 정의된 env를 덮지 않는지부터 확인하고, 덮이면 미실행으로 남긴다. Google OAuth 실제 왕복은 사용자 세션이 필요하면 미실행.
- 지휘자 판단 — T11(이미지 실기동)은 tasks대로 이 런의 완료 조건이 아니다(SELF-HOSTING §7 릴리스 검증).

## 배치

| 배치 | 항목 | 소유 파일 | 선행 | 모델·effort | 차단 | 게이트 | 상태 |
|---|---|---|---|---|---|---|---|
| A | T1 T2 T4 T5 T6 (커밋 A) · T3 T7 (커밋 B) | `lib/auth/login-providers.ts`(새) · `lib/login-link/**` · `lib/session-revocation/**` · `lib/account-connect/**`(테스트) · `lib/credentials/__tests__/postgres.integration.ts` · `lib/deployment/**` · `scripts/__tests__/preflight-entry.test.ts` · `auth.ts` · `app/signin/**` · `app/invite/[token]/page.tsx` · `app/oauth/authorize/**` · `app/(edit)/account/**` · `components/account/**` · `components/__tests__/{provider-progress,login-methods}*` · `messages/{en,ko,es}.tsx` · `vitest.setup.ts` · `deploy/compose.yaml` · `.env.example` · `deploy/.env.example` | — | Opus 5.5 high — 계정 잠김·인증 경계 판정 | 예 | `pnpm gate --base dev`(격리 PG 붙는지 확인) | dev 통합(fix1 포함), 워커 유지(QA 결함 수신) |
| D | T8 정본 · T9 가이드 · T9a(A 뒤) | `docs/PRODUCT.md` · `docs/ARCHITECTURE.md` · `docs/DESIGN.md` · `docs/SELF-HOSTING.md` · `guide/{en,ko,es}/self-hosting/{install,troubleshooting,README,operate}.md` · `guide/SHOOTING.md` | T9a·최종 대조는 A가 dev에 든 뒤 | Opus 5.5 medium — 문서·번역, 코드 대조 | 예(같은 push) | `pnpm gate --base dev` · `pnpm guide:check` | dev 통합(fix1 포함), 워커 해제 |
| R-A · R-D | 독립 리뷰(리포트 전용) | — | 각 배치 인계 | Opus 5.5 high / medium | — | — | 완료(둘 다 🔴0) |
| Q | T10 런타임 | 없음(main 체크아웃, QA 전용) | A·D가 dev에 든 뒤 | Opus 5.5 medium | 아니오(미실행이면 리포트에 남김) | `/runtime-test` 리포트 | 대기 |

### 겹침

- A ↔ D: 파일 겹침 없음 → 병렬. D는 `.env.example`·`deploy/.env.example`·`messages/*`·코드를 건드리지 않는다(A 소유).
- D의 `guide/SHOOTING.md`(T9a)는 A의 화면 소스 SHA에 기댄다 → D는 T9a 전에 `WAITING FOR A`.
- 통합 순서: A → D(rebase) → 한 번에 push(tasks "같은 `/push` 배치").

## 진행 기록

- 2026-10-09 Run `run_ddfe2dd82c90`
  - A: dispatch `ctx_52e42a95189c` · terminal `term_4893209e…` · worktree `~/orca/workspaces/malmoi/olp-A` · Opus 5.5 high (effective 확인)
  - D: dispatch `ctx_8f3d8704e9e6` · terminal `term_2a230090…` · worktree `~/orca/workspaces/malmoi/olp-D` · Opus 5.5 medium (effective 확인)
  - A Q(T6 부작용): Q7로 Sessions Dialog 폴백 라벨 `m.account.sessions.button`이 도달 불가. 지휘자 판단 — 커밋 A는 키·분기 유지(가이드 게이트 green), D가 `guide/*/account/profile.md` #sessions·DESIGN Sessions 행에서 문구 제거(`cc6b401e`·`7cc0b6c5`), D가 dev에 든 뒤 A 후속 라운드에서 키(en·ko·es)·죽은 분기 삭제(내 변경이 만든 고아).
  - A 인계: `076dd30c`(커밋 A) · `b6a85c29`(커밋 B). 두 경계 `gate: ok`, 격리 PG 붙음(credentials 67 · projects 636). 뮤테이션 2건 red 확인. ko 사전 2키는 `/merge` 전 사용자 검수 대상.
  - D: T8·T9 커밋 7개, `WAITING FOR A`.
  - R-A(`ctx_9250f6d53840`, Opus high): 🔴0 🟡2 🟢6, 추가 뮤테이션 11건 전부 red. 🟡1 통합 하네스 signIn 미러에 `method-unavailable` 없음 · 🟡2 런타임 (b) ①③은 같은 하네스로 시나리오화 가능. 리포트 `.scratch/review-olp-A.md`.
  - 통합 ①: A 커밋 → dev `6905a31b`·`70614999`(push 전) · `pnpm gate` ok(projects·credentials PG 붙음). D에 "A is in dev" + ARCHITECTURE에 `unlinkLoginMethod` 우주 밖 → `unavailable` 한 줄 추가 지시.
  - A fix1(`ctx_1b7ab7563a42`): 🟡1·🟡2 시나리오 · ko `MethodUnavailable` "쓰던 로그인 수단…"(🟢2) · `WAITING FOR D` 뒤 `m.account.sessions.button`·죽은 분기 제거.
  - D 인계: T8·T9·T9a 커밋 11개, `gate: ok`. 통합 ② → dev `…11ad3f87`.
  - A fix1 인계: `cedabc6d`(하네스 미러 + 시나리오 2) · `745e76e9`(ko 문구) · `cc47e0d7`(고아 키·분기 제거). 격리 PG 69 passed, 하네스 뮤테이션 2건 red. 지휘자가 diff 확인 후 통합 ③. 런타임 (b) 잔여: ②(실 Google 왕복) · ④(단일 공급자 시각) · ⑤(이전 동작 — 재현 불가).
  - R-D(`ctx_de27f977ceec`, Opus medium): 🔴0 🟡4 — README.md:197 · ko 가이드 인용 · (고아 — A가 이미 처리) · oauth-consent SHA. 리포트 `.scratch/review-olp-D.md`.
  - D fix1(`ctx_2410269317de`): 위 🟡 1·2·4 + troubleshooting "that email" 뉘앙스.
  - D fix1 인계: `de85e790`(README) · `477413e6`(ko 인용 + that email) · `26a89de9`(oauth-consent SHA). 통합 ④. tasks T1~T9a 체크.
  - push: dev `94bf9336..968b7294`, CI green (run 37965555629).
  - Q(`ctx_278839a135ae`, Opus medium): T10 7/7 통과, 결함 0. GitHub off = 셸 env 공백. 전제 불일치(사용자가 github·github-app·google 셋 보유) → 지휘자 조건부 승인(ego Google 이메일 일치 확인 후 UI Disconnect → 측정 → Connect 왕복 원복). 꺼진 공급자 직접 GET/callback → `/signin?error=Configuration`, 세션 없음. dev DB: Account google 행 재생성(원복), 테스트 초대 1건 생성·회수, Resend 실메일 1통.
  - 정리: 워커 전부 해제, 워크트리 olp-A·olp-D 제거. T11은 SELF-HOSTING §7 미실행 행으로 이관. 기능 디렉터리 삭제.
