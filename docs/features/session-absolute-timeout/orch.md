# session-absolute-timeout — orch

원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md). 이 문서는 지휘 상태만 든다.

- 착수: 2026-10-15 · 시작 dev `364fe772`(로컬, origin/dev `c6ec7d44` 위에 다른 세션의 문서 커밋 4개)
- 끝: dev push까지. `/merge`는 부르지 않는다. 스키마 변경 없음 → prod `db:deploy` 없음.

## 결정 기록

1. **T0 실측은 1시간 대기 대신 DB `expires`를 당겨 갱신 시점을 만든다** — 지휘자 판단. Auth.js `due = expires − maxAge + updateAge`라 현재 설정(24h·1h)에서 `expires ≤ now + 23h`면 다음 요청이 갱신 대상이다. 1시간 활동과 같은 분기를 탄다.
2. **T0와 A를 병렬로 띄우되, A의 통합은 T0가 전제(쿠키 미재발급)를 확인한 뒤에만** — 지휘자 판단. T0가 반증하면 A를 통합하지 않고 설계로 돌아간다(tasks T0).
3. **방침 시행일은 2026-10-15(오늘)로 쓴다** — 지휘자 판단. 머지일이 다르면 `/merge` 전에 날짜 다섯 자리를 옮기고 digest를 다시 받는다(design §7).
6. **방침 `changes`에 옛 문장(마지막 활동 뒤 24시간)이 틀렸다는 정정을 넣지 않는다** — 사용자 결정(2026-10-15). 기록은 POSTMORTEM·ARCHITECTURE가 든다.
4. **T8(`/postmortem`)은 A 워커에게 T0 결과를 받은 뒤 새 Task로 보낸다** — 지휘자 판단. A 브리프에선 미룬 항목이다(§0.4).
5. DS 행 없음 — design-brief·신규 화면이 없다. 가이드 스크린샷 변경 없음(표 문장만 바뀐다).

## 배치

| 배치 | 항목 | 소유 파일 | 선행 | 모델·effort | 위치 | 상태 |
|---|---|---|---|---|---|---|
| Q0 | T0 실측 | 없음(리포트 전용, `.scratch/`만) | — | Sonnet 5.5 high — 측정 절차가 정해져 있고 판단은 지휘자가 한다 | main 체크아웃 | 완료 — 전제 확인 |
| A | T1–T6 | `lib/credentials/adapter.ts` · `lib/credentials/__tests__/{adapter.test.ts,postgres.integration.ts}` · `auth.ts` · `lib/auth/__tests__/provider-config.test.ts` · `messages/en.tsx` · `messages/ko-privacy.tsx` · `lib/privacy/__tests__/policy-gate.test.tsx` · `guide/{en,ko,es}/self-hosting/{troubleshooting,operate}.md` · `docs/ARCHITECTURE.md` | — (통합은 Q0 뒤) | Opus 5.5 medium — 인증 경계·방침 digest 절차·세 언어 가이드 | 워크트리 | T1–T6 완료(`7bf00b05`·`2ec04ceb`·`adb986f4`·`8341f4d9`, gate ok) — 리뷰 중 |
| A-T8 | T8 `/postmortem` | `docs/POSTMORTEM.md` | Q0 확인 | A 워커 재사용 | A 워크트리 | 완료(`8bbe89c5`·`24fd2a42`, gate ok) |
| R | A 독립 리뷰 | 없음(리포트 전용) | A `worker_done` | Opus 5.5 medium | A 워크트리 읽기 | 완료 — 🔴 0 · 🟡 3 → A-fix1 |
| Q1 | T7 실물 확인 | 없음(리포트·이슈 전용) | A dev 통합 | Sonnet 5.5 high | main 체크아웃 | 대기 |

겹침: Q0·Q1은 코드를 고치지 않는다. A 하나가 모든 코드 파일을 소유한다. Q0가 main 체크아웃에서 `pnpm dev`를 돌리는 동안 통합(cherry-pick·build)을 하지 않는다.

tasks ↔ 배치 대조: T0→Q0 · T1–T6→A · T7→Q1 · T8→A-T8. 주인 없는 항목 0.

## 진행

- **Q0 완료 — PREMISE CONFIRMED** (2026-10-15). 자기 세션의 DB `expires`를 now+22h로 당겨 갱신 시점을 만든 뒤 `GET /projects`와 Server Action(`POST /preferences` 테마) 둘 다에서 DB `expires`가 요청 시각+24h로 늘었고, `authjs.session-token` Set-Cookie는 0건, 쿠키 Expires는 로그인 시각+24h(`2026-10-16T01:55:09.967Z`)에 그대로였다. 양성 대조: 같은 캡처가 `malmoi-color-scheme` Set-Cookie는 잡았다. 원본 handoff: main `.scratch/orch-session-absolute-timeout/handoffs/handoff-Q0.md`. 워커 해제.
- **A T1–T6 완료** — 커밋 4개, `pnpm gate --base dev` → `gate: ok`(test 14620 · credentials postgres 103). 계획과 다른 점: `policy-gate:316`을 `effectiveDate >= 2026-10-13` + GitLab `changes` 항목 단언으로 완화, `changes` 문장 추가, 가이드에 "활동해도 연장되지 않는다" 추가, T6 rg 추가 히트 둘(ARCHITECTURE의 Codex #6 이력 인용·자산 캐시). R이 판정한다. handoff 사본: main `.scratch/orch-session-absolute-timeout/handoffs/handoff-A.md`.
- A-T8(`/postmortem` + §6.1.1 실측 한 줄)을 A 터미널에 새 Task로 보냄 · R(Opus medium, 리포트 전용) 시작.
- **A-T8 완료** — `8bbe89c5` POSTMORTEM · `24fd2a42` §6.1.1 실측 문장, gate ok.
- **R 완료** — 🔴 0 · 🟡 3: ① PG 테스트가 no-op 갱신에 닿지 않음(`:239-242` 설정만 증명, `:369` 공허) ② ARCHITECTURE:2665·`lib/auth/cookie.ts:4-6`의 "`auth()`가 갱신 쓰기" 거짓 ③ §6.1.1 쿠키 재발급이 갱신 조건과 무관(`/api/auth/session` 직접 호출 예외). 사본: `handoffs/review-A.md`. → A-fix1 보냄.
