# operator-account — 지휘 계획

원본: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md) — 이 문서는 그것들을 가리키기만 한다.

- 착수: 2026-10-03, 시작 dev `bb71029a`
- 끝은 dev push다. `/merge`(prod)는 사용자가 부른다.

## 결정 기록

| # | 결정 | 출처 |
|---|---|---|
| D1 | spec의 사용자 결정(정적 allowlist · 이메일 주소 전체 · 복원/승격/수락도 막음 · prod에도 켬)은 그대로 쓴다 | spec "범위 게이트" (2026-10-03) |
| D2 | T6에서 운영자로 만든 확인용 프로젝트는 **상주로 남긴다** — 이름·용도를 `guide/SHOOTING.md` 진행 상태와 메모리에 기록 | 사용자 2026-10-03 |
| D3 | `.env.local`의 `OPERATOR_EMAILS`는 **사람이** 넣는다. T7(Vercel env)과 T6(QA)은 그 값이 들어간 뒤에 한다 | CLAUDE.md "새 머신 셋업" |
| D4 | T7(Vercel CLI)은 워크트리에 `.env.local`이 없으므로 **지휘자가 main 체크아웃에서** 한다 — 코드 변경이 아닌 환경 작업. Preview는 dev push 전, Production도 이번에 넣는다(다음 prod 배포부터 적용) | design "새 환경변수" · tasks T7 |
| D5 | 워커 모델 패밀리는 Claude(Opus·Sonnet), effort ≤ high | orchestrate §0 · 메모리 |

## 배치

| 배치 | 항목 | 소유 파일 | 선행 | 모델/effort | 출시 차단 | 게이트 | 상태 |
|---|---|---|---|---|---|---|---|
| B1 코드 | T1 → T2 → T3 → T4 | `lib/operator/**` · `lib/onboarding/create-plan.ts` · `lib/onboarding-run/{repos,create}.ts` · `lib/projects/{archive,owner-limit}.ts` · `lib/auth/{members,message}.ts` · `app/invite/actions.ts` · `messages/en.tsx` · `lib/mcp/result.ts` · 해당 테스트 · `components/__tests__/home-vocabulary.test.ts`(주석) | — | Opus 5.5 high — 잠금 순서·트랜잭션 재집계·fail-closed 판단 | 예 | `pnpm gate --base dev`(postgres 스위트 자동) | 통합 완료 2026-10-04 (B1 10커밋) |
| B2 문서 | T5 | `docs/PRODUCT.md` · `docs/ARCHITECTURE.md` · `docs/OPERATIONS.md` · `docs/DIRECTORY.md` · `guide/reference/limits.md` · `guide/SHOOTING.md` · `.env.example` | — (spec·design 기준으로 병렬) | Opus 5.5 medium — 정본 문서의 밀도 높은 서술, 판단은 spec이 이미 정함 | 예 | `pnpm gate --base dev` | 통합 완료 2026-10-04 (B2 15커밋) |
| T7 env | Vercel Preview·Production `OPERATOR_EMAILS` | — | D3 | 사용자(`!` 실행 — 분류기가 에이전트의 secret-store 쓰기를 막음) | 예(Preview는 push 전) | `vercel env ls` 행·시각 | 완료 2026-10-04 — production·preview 각 1행(Secret) |
| QA | T6 | main 체크아웃 · dev DB | B1·B2 통합 + D3 | Sonnet 5.5 medium | — | `/runtime-test` | 대기 |

### 파일 겹침

- B1 ↔ B2: 겹침 없음. B1은 `docs/`·`guide/`·`.env.example`을 건드리지 않고, B2는 코드·테스트를 건드리지 않는다.
- B2의 문서가 B1의 실제 이름(`owner-limit-reached`, `InviteError` `"limit-reached"`, `lockOwnerSlots`)과 어긋나면 통합 전 리뷰에서 맞춘다.
- → **B1·B2 병렬.**

## 진행 기록

(통합 커밋·검증 결과·라운드·미완을 여기 덧붙인다)

- 2026-10-04 T7: `.env.local` 값 확인(1행·주소 1개, 출력 없음) → 사용자가 stdin으로 `vercel env add` → `vercel env ls`에서 production·preview 각 1행(Secret, 방금) 확인. 적용은 다음 배포부터(Preview = 이번 dev push, Production = 다음 `/merge`).
- 2026-10-04 B2 worker_done(succeeded): 9커밋 `98f175c8..ed5e95bf`, `gate: ok`. 남은 것 — handoff의 B1 의존 서술 9개 대조, `guide/AUTHORING.md` 사실 대조 표에 `owner-limit.ts` 추가 여부, SHOOTING 상주 자리표시(T6 뒤 채움).
- 2026-10-04 B1 worker_done(succeeded): 6커밋 `41e6aa47..89d34e18`, `gate: ok`(10715 unit + 543 postgres). 자체 리뷰 🔴(초대 `?e=` 허용 목록) 수정 포함.
- 2026-10-04 리뷰 R1(Opus high, B1 코드) 🔴0 🟡2 ⚪4 · R2(Opus medium, B2 문서↔B1 코드) 🔴0 🟡2 ⚪6. 지휘자 판정:
  - R1 🟡1(승격 경로 행위자 User가 정렬 집합 밖 — 교착 순환 둘) → **고친다**, 형태 A(`lockOwnerSlots(tx, counted, alsoLock)`). 사용자 결정 불요(원칙 판단 — 틀린 "교착 없음"이 정본에 들어가는 비용이 더 크다).
  - R1 🟡2(런타임 2·3·4는 기존 하네스로 결정적) → 테스트로 옮긴다. T6 QA에 남는 것: 실 로그인 주소 대조 + Alert 배치 눈 확인.
  - R1 ⚪1(소비자 스캔 확대) · ⚪2(4+ 사용자에게 참인 문구) → 반영. ⚪3 → B1·B2 한 push로 통합.
  - R2 🟡1·🟡2·⚪1·2·3·5 + AUTHORING :157 사실 소스 + `/postmortem`(초대 `?e=` 허용 목록 누락) → B2.
- fix1 라운드 디스패치: B1 `ctx_d849d400b7de` · B2 `ctx_6ee61c806015`(병렬 — B2는 B1의 최종 동작을 브리프로 받는다).
- 2026-10-04 fix1 완료 — B1 4커밋(`9fa986f6` 행위자 동반 잠금 · `6c87939a` 4+ 문구 · `1dbb0994` 거부 Alert 렌더 테스트 · `e5745c74` 소비자 스캔 확대), B2 6커밋(ARCHITECTURE·DIRECTORY·limits.md·AUTHORING·POSTMORTEM). 지휘자가 B2 문서의 `lockOwnerSlots(tx, counted, alsoLock)`·문구를 B1 최종 코드와 대조 — 일치.
- 2026-10-04 통합: B1(10)·B2(15) cherry-pick → `pnpm gate --base origin/dev` 1회차 `FAILED at test:projects:postgres` — `search-performance.integration.ts` 중앙값 510ms > 300ms(검색 경로 무변경, load avg ~15 부하, B1 게이트에선 543/543 green) → 재실행 `gate: ok`(10721 unit + 543 postgres). ⚠️ 그 성능 테스트는 부하에 민감하다.
- 런타임 남은 것: T6(실 로그인 주소 ↔ env, Alert 배치 눈 확인, 상주 프로젝트 생성 — D2).
