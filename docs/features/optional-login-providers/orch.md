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
| A | T1 T2 T4 T5 T6 (커밋 A) · T3 T7 (커밋 B) | `lib/auth/login-providers.ts`(새) · `lib/login-link/**` · `lib/session-revocation/**` · `lib/account-connect/**`(테스트) · `lib/credentials/__tests__/postgres.integration.ts` · `lib/deployment/**` · `scripts/__tests__/preflight-entry.test.ts` · `auth.ts` · `app/signin/**` · `app/invite/[token]/page.tsx` · `app/oauth/authorize/**` · `app/(edit)/account/**` · `components/account/**` · `components/__tests__/{provider-progress,login-methods}*` · `messages/{en,ko,es}.tsx` · `vitest.setup.ts` · `deploy/compose.yaml` · `.env.example` · `deploy/.env.example` | — | Opus 5.5 high — 계정 잠김·인증 경계 판정 | 예 | `pnpm gate --base dev`(격리 PG 붙는지 확인) | 대기 |
| D | T8 정본 · T9 가이드 · T9a(A 뒤) | `docs/PRODUCT.md` · `docs/ARCHITECTURE.md` · `docs/DESIGN.md` · `docs/SELF-HOSTING.md` · `guide/{en,ko,es}/self-hosting/{install,troubleshooting,README,operate}.md` · `guide/SHOOTING.md` | T9a·최종 대조는 A가 dev에 든 뒤 | Opus 5.5 medium — 문서·번역, 코드 대조 | 예(같은 push) | `pnpm gate --base dev` · `pnpm guide:check` | 대기 |
| R-A · R-D | 독립 리뷰(리포트 전용) | — | 각 배치 인계 | Opus 5.5 high / medium | — | — | 대기 |
| Q | T10 런타임 | 없음(main 체크아웃, QA 전용) | A·D가 dev에 든 뒤 | Opus 5.5 medium | 아니오(미실행이면 리포트에 남김) | `/runtime-test` 리포트 | 대기 |

### 겹침

- A ↔ D: 파일 겹침 없음 → 병렬. D는 `.env.example`·`deploy/.env.example`·`messages/*`·코드를 건드리지 않는다(A 소유).
- D의 `guide/SHOOTING.md`(T9a)는 A의 화면 소스 SHA에 기댄다 → D는 T9a 전에 `WAITING FOR A`.
- 통합 순서: A → D(rebase) → 한 번에 push(tasks "같은 `/push` 배치").

## 진행 기록

(라운드·통합 커밋·검증 결과를 여기에 덧붙인다)
