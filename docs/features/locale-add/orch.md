# Add and remove languages — 지휘 계획 (`/orchestrate`)

작성: 2026-10-14 · 지휘: Claude Code(Opus 5.5) · 원본: [tasks.md](tasks.md)(체크 항목) · [design.md](design.md) · [spec.md](spec.md) · [design-brief.md](design-brief.md) — 여기에 복제하지 않는다.
시작 dev: `b5f8c9d8`(origin/dev `1f851139` + §0 문서 커밋, 미푸시) · Orca run: `run_2836e5d910eb`

## 착수 범위 — ⚠️ 디자인 시안 미확보

**design-brief 프레임 1~20의 핸드오프가 없다. 이 런은 시안 없이 할 수 있는 부분까지만 진행한다.**

- **진행**: tasks 배치 1·2 전부(§1~§5), 배치 3 중 화면을 그리지 않는 항목(§6 Server Action · 셀 얼리기 reducer · `summary.ts` · 집계), §7 MCP 전부, §8 중 ARCHITECTURE·ACTIONS·OPERATIONS·DIRECTORY·CLAUDE·README.
- **시안 대기(이 런에서 착수하지 않음)**: §6 핸드오프 확보 · Sources Add Dialog·행 동작·확인 Dialog·상태 배지 · 번역 화면 셀 얼리기 DOM·수동 · Publish 미리보기·결과의 화면 표시 · 화면 문구(en·ko·es) · `/design-sync` · DESIGN 갱신 · `/guide`·`/guide-shots` · 화면을 거치는 §9 `/runtime-test`.
- 시안이 오면 이 문서에 wave를 덧붙여 이어서 진행한다. **이 기능은 그 전까지 `/merge`하지 않는다**(tasks "배치와 머지 규칙").

## 결정 기록

| # | 결정 | 근거 |
|---|---|---|
| D1 | `deliveredLocaleChanges` = `DeliveryConfirmation`의 jsonb 컬럼 | 사용자 2026-10-14. design §1 |
| D2 | 핸드오프 확보 게이트를 §0에서 §6 UI 퍼블리싱 앞으로 옮김 | 사용자 2026-10-14 (`15891783`) |
| O1 | 워커 패밀리 = Claude Code(Opus 5.5·Sonnet 5.5, effort ≤ high)만. 교차 허가 없음 | 스킬 §0-3 기본 경계. 지휘자 판단 |
| O2 | push는 tasks 배치 경계마다 한다 — tasks 배치 1(A1·A2) 통합 뒤 · 배치 2(B1~B3) 통합 + dev DB 마이그레이션 뒤 · 배치 3 비시각(C1·C2·D) 통합 뒤 | tasks "배치마다 `/push` 게이트". 배치 1은 동작 중립이라 먼저 내보낸다. 지휘자 판단 |
| O3 | Chrome 추가 입력은 문서 55개 목록으로 좁힌다(ICU 목록이 아니다) | design §2 "Chrome 지원 목록". 지휘자 판단 — 보수적 쪽 |
| O4 | 만료 I/O(`expireLocaleChanges`)와 언어 작업 수(`countLocaleWork` 꼴)는 **B1이 코어로 만든다** — B2(Publish)·B3(적재·야간)가 같이 부르므로 한 소유자에게 두어 B2∥B3를 연다 | 파일 겹침. 지휘자 판단 |
| O5 | Publish 미리보기·결과의 `New file`/`Updated`/`Removed`는 **데이터·판정(B2)과 화면 표시(시안 대기)로 나눈다** | 착수 범위. 지휘자 판단 |
| O6 | DS 행은 시안 대기 — 신규 Dialog가 생기므로 시안이 오면 DS 행을 둔다(스킬 §0-4.5) | 지휘자 판단 |
| O7 | `/roundtrip`(§9 셋째·넷째)은 C2(MCP) 통합 뒤 **MCP 도구로 추가·제거를 걸어** 이 런에서 돈다 — 화면이 필요 없다. 화면 `/runtime-test`(§9 둘째)는 시안 대기 | 지휘자 판단 — 시안 없이 가능한 검증 |
| O8 | 스키마 SQL은 워커가 DB 없이 `prisma migrate diff`로 만들고(더미 `DIRECT_URL`), dev DB 적용·`has_schema_privilege` 확인은 지휘자. prod `db:deploy`는 `/merge` 1단계(런 밖) | 스킬 §1 |

## 배치

| 배치 | 항목(tasks) | 파일 소유 | 선행 | 모델·effort | 자리 | 상태 |
|---|---|---|---|---|---|---|
| **A1** 순수 판정 | §1 전부 | 신규 `lib/locales/{add-plan,change-plan,effects,chrome-codes,publish-plan,expiry}.ts` + `__tests__` · `components/__tests__/client-graph.test.ts`(잎 등록만) | — | Opus 5.5 · high — 전이 표·만료 조건이 불변식 1·2의 경계 | 워크트리 | 대기 |
| **A2** Publish union | §5 첫째·둘째 | `lib/pull/{plan,client,payload}.ts` · `lib/pull/run.ts`(union 좁히기·`countChangedValuesOf` delete 건너뛰기만) · `lib/publish/read.ts`(`changedFiles` 좁히기만) · `lib/gitlab/plan.ts` · `lib/github.ts`(:415 주석) · fake(`lib/gitlab/__tests__/fake-repo.ts`) · design §2 소비자 표의 테스트들 | — | Opus 5.5 · medium — 표가 design §2에 고정, 기계적 비중 큼 | 워크트리 | 대기 |
| **B1** 스키마·코어 | §2 첫째·둘째·셋째·다섯째 · §3 전부 · O4 공용 코어 | `prisma/schema.prisma` · 새 마이그레이션 SQL · `scripts/gate-plan.ts`(+테스트) · 신규 `lib/locales/{change,expire,work}.ts` · 번역 저장·Revert·기준 언어 변경·MCP 번역 쓰기의 제거 상태 가드(`app/(edit)/actions.ts` 코어 쪽 · `lib/keys/revert.ts` · `app/(edit)/projects/[slug]/sources/actions.ts`의 `updateBaseLocale` 코어 · 해당 MCP 도구) · 사건 payload/view(`lib/events/` 등) · `locked-access`·진입점 목록 · 격리 PG 시나리오 · OPERATIONS 구버전 구간 영향(§2 다섯째) | **A1 통합** | Opus 5.5 · high — 잠금 순서·원자성·셀프 호스팅 | 워크트리 | 대기 |
| **B2** Publish 나머지 | §5 셋째~열째 | `lib/pull/{run,load,plan,trigger}.ts` · `lib/publish/{read,fingerprint}.ts` · `lib/adapters/{json-catalog,chrome-locales}.ts` + `__tests__/contract.ts` · PR/MR 본문 생성기 · `lib/sync/run.ts`(장벽 재사용 시) | **A2 + B1 통합** | Opus 5.5 · high — 전달 경계·결정성 | 워크트리 | 대기 |
| **B3** 적재·Sync·수명주기 | §4 전부 + 야간 조기 종료(`lib/nightly/plan.ts:57·70`) | `app/api/push/route.ts` · `lib/push/apply.ts` · `lib/import/{run,approval}.ts` · `lib/nightly/{run,plan}.ts` · `lib/protection/fingerprint.ts` · `lib/surfaces/remove.ts` · 설정/연결 변경 승인 코어 · `docs/ACTIONS.md`(`locale-change-pending`) | **B1 통합** (B2와 병렬) | Opus 5.5 · high — fail-closed 보류·승인 지문 | 워크트리 | 대기 |
| **C1** 비시각 UI | §6 Server Action · reducer · `summary.ts` · 집계 | `app/(edit)/projects/[slug]/sources/actions.ts`(새 Action) · 번역 화면 draft reducer(파일은 착수 때 확정, **DOM·컴포넌트 제외**) · `summary.ts` · `lib/keys/query.ts`·Home·Keys 검색·Inbox 집계 · **`messages/*` 금지**(문구는 시안 대기 — Action은 코드를 돌려준다) | **B2 + B3 통합** | Opus 5.5 · medium | 워크트리 | 대기 |
| **C2** MCP | §7 전부 | `lib/mcp/tools/*`(신규 넷 + `get_project`·`list_keys`·preview 응답) · `lib/mcp/catalog.ts` · `lib/mcp/__tests__/*` · MCP 영어 문구(`messages/en.tsx`의 MCP 구역만 — 세 사전 규칙이 걸리면 ko·es는 en 사본 + `/translate` 대기 표시) | **B2 + B3 통합** (C1과 병렬) | Opus 5.5 · medium — 권한 등급·지문 | 워크트리 | 대기 |
| **D** 정본 문서 | §8 첫째 · 둘째 중 DIRECTORY·ACTIONS 확인·OPERATIONS · 셋째(CLAUDE 데이터 경로 + `pnpm sync:agents`, README 검토) | `docs/{ARCHITECTURE,DIRECTORY,OPERATIONS}.md` · `CLAUDE.md`(+미러) · `README.md` — 문서별 커밋 | **C1 + C2 통합** | Sonnet 5.5 · high — 분량, 사실은 R-D(Opus)가 대조 | 워크트리 | 대기 |
| **R-<배치>** 리뷰 | 각 배치 diff 독립 리뷰 | 리포트 전용 | 그 배치 `worker_done` | Opus 5.5 · medium | 리뷰 전용 워크트리 | — |
| **DB** dev 마이그레이션 | §2 넷째 중 dev 몫 | 지휘자 | B1 통합 | — | main 체크아웃 | 대기 |
| **RT** 왕복 | §9 셋째·넷째(O7) | 리포트 + BugShot 이슈 | C2 통합 + push | Opus 5.5 · medium | main 체크아웃, 단일 워커 | 대기 |
| **P** push | §9 첫째 | 지휘자 | O2의 세 시점 | — | main 체크아웃 | 대기 |
| **⏸ 시안 대기** | §6 핸드오프 · Dialog·배지 · 셀 얼리기 DOM·수동 · Publish 표시 · 문구 · `/design-sync` · §8 DESIGN · `/guide`·`/guide-shots` · §9 `/runtime-test` | — | 시안 | — | — | 이 런 밖 |
| **⏸ 런 밖** | §2 넷째의 prod 몫 · §9 다섯째(`/merge`) | 사용자 `/merge` | — | — | — | 이 런 밖 |

**겹침 판정**: A1↔A2 없음(신규 `lib/locales/` vs `lib/pull`·`lib/gitlab`) → 병렬 · A2↔B2(`lib/pull/{plan,run}.ts`·`lib/publish/read.ts`) → 직렬 · B1↔B2/B3(공용 코어 O4) → 직렬 · B2↔B3: B2는 `lib/pull/*`·`lib/publish/*`·어댑터, B3는 `push`·`import`·`nightly`·`protection`·`surfaces` → 병렬(⚠️ `lib/pull/load.ts`는 B2 단독 소유 — B3가 필요하면 미룬 항목으로 남긴다) · C1↔C2: C1 `lib/keys`·Action·reducer, C2 `lib/mcp` → 병렬(⚠️ `get_project`·`list_keys`가 C1의 집계 함수를 부르면 C1 함수만 import, 수정은 C1).

**wave**: ① A1 · A2 → 통합 → **P1 push** ② B1 → 통합 → DB(dev) ③ B2 · B3 → 통합 → **P2 push** ④ C1 · C2 → 통합 ⑤ D · RT → 통합 → **P3 push**.

**주인 없는 항목 대조**(tasks 체크 ↔ 배치): §0 → 완료(`b5f8c9d8`) · §1 → A1 · §2 첫째·둘째·셋째·다섯째 → B1, 넷째 → DB + 런 밖 · §3 → B1 · §4 → B3 · §5 첫째·둘째 → A2, 셋째~열째 → B2 · §6 Action·reducer·summary·집계 → C1, 나머지 7행 → ⏸ 시안 대기 · §7 → C2 · §8 첫째·셋째 → D, 둘째 → D(DESIGN만 ⏸), 넷째 → ⏸ · §9 첫째 → P, 둘째 → ⏸, 셋째·넷째 → RT, 다섯째 → 런 밖. **0건.**

## 진행 로그

(통합 커밋·검증 결과·라운드·이슈를 시간순으로 적는다.)

- 2026-10-14 04:2xZ — wave ① 착수: A1 `ctx_b538aeda6cbc`(Opus high, `lo-A1`) · A2 `ctx_f7200ed12b30`(Opus medium, `lo-A2`). launch.effective = requested 확인. ⚠️ `new-top-level` 워크트리가 로컬 dev가 아니라 **origin/dev `1f851139`에서 갈라졌다** — 착수 직후 두 워크트리를 `git rebase dev`(→ `00aeb346`)로 맞추고 `send` + 터미널 입력으로 재독을 알림. 다음 wave부터 착수 직후 base를 확인한다.
- A2 `worker_done` — `490ceefc`(`gate: ok` 14640 · PG 697). ⚠️ 워커가 `/ship`을 부르지 않고 같은 순서를 손으로 밟음 → 리뷰가 `/code-review`를 대신, 다음 브리프부터 `/ship bypass` 호출 강제. A2 retain. **R-A2** `ctx_8302fe1436c7`.
- A1 `worker_done` — `d73f2c90`·`a1d033bb`(`gate: ok` 14848 · PG 697). 독자 결정 6건(빈 관측 = `unchanged` 만료 · 모순 행 무조건 만료 등)은 R-A1 판정. A1 retain. **R-A1** `ctx_fb08e5207414`.
- R-A2 완료(🔴 0 · 🟡 3 · ⚪ 3, 변이 10 중 8 포착 — `.scratch/orch-locale-add/review-A2.md`). **A2 fix1** `ctx_e2a26bf23657` — F1(null 렌더 경로 + delete 같은 경로 검사) + GitHub delete 경로 `isSafeRepoPath`. **B2 브리프로 넘김**: F2(`renderProject` 진입에서 deletes ⊆ REMOVE 언어 resolved 경로 assert + 위반 테스트) · F3(`runPull` delete 분기 시나리오 테스트 둘) · F5(`run.ts:449·469·492`·`read.ts:138` 삭제 구분, 미리보기와 실행에 같은 deletes). **RT 체크리스트로 넘김**: F4(실행 비트 파일 삭제 실측). R-A2 해제·워크트리 정리.
- R-A1 완료(🔴 1 · 🟡 3 · ⚪ 6, 변이 11 중 10 — `.scratch/orch-locale-add/review-A1.md`). **지휘자 판단(design `a05c2c04`)**: 🔴 R1 값 0개 ADD가 첫 적재에 만료·orphan → ADD는 자기 create가 전달 목록에 있거나 경로가 관측될 때만 만료(Y1 보류 ADD 해소도 겸함) · Y2 빈 관측은 보류(편차 a 기각) · Y3 비지원 포맷에서도 추가 취소 허용(편차 f 기각). 근거: spec "의도가 만료되면 존재는 리포" + POSTMORTEM 2026-09-15. **A1 fix1** `ctx_87e8b0f89c84`. R-A1 해제·정리.
- A2 fix1 `worker_done` — `bfe60934`(`gate: ok`). 재리뷰 생략(지휘자 판단 — 두 건 다 red 선행, 범위 4파일). A2 해제·정리.
- A1 fix1 `worker_done` — `605af158`(`gate: ok` 14861 · PG 697; 1회차 seo-metadata import timeout은 단독·재실행 green). 새 보류 코드 `base-empty` → **B1 메모: 사건·Logs 매핑에서 `base-unreadable`과 같이 다룬다.**
- **wave ① 통합**(로컬 dev): A2 `055d9c9e`·`1697f0bb` · A1 `f9d35b2e`·`ae126f69`·`605af158`. main 체크아웃 `pnpm gate` **ok**. tasks §1 전부·§5 첫째·둘째 체크.
- wave ② — **B1** `ctx_077ef6f24696`(Opus high, `lo-B1`, base `ecf4a5e5` 확인). P1 push `1f851139..ecf4a5e5`, CI run 38515201677 감시 중.
- B1 `worker_done` — 6커밋(…`8b1ef661`), 마이그레이션 `20261014060000_locale_change`, `gate: ok`(14942 · PG 742). 미룬 것: apply 쪽 테스트 → B3, 전달 목록 캡처 → B2. B1 retain. **R-B1** `ctx_9f5f3469ec15`(Opus high — 범위가 커서 리뷰 effort 상향, 지휘자 판단).
- R-B1 완료(🔴 1 · 🟡 4 · ⚪ 6, 변이 13 중 9 — `.scratch/orch-locale-add/review-B1.md`). **D3 사용자 결정**: 폐기 = 마지막 전달 값으로 되돌림(Revert 의미), baseline 없는 미전달 셀이 있으면 제거·추가 취소 거부. **지휘자 판단**: 🔴 R1 무효화 중 취소 거부(`publish-unsettled`). design 반영. **B1 fix1** — R1 · Y1(D3) · Y2 소스 경계 그물 셋 · Y3 만료 잠금 그물 · Y4 OPERATIONS 재전진 문단 · W1 지문에 확인 `revision`. **B2·B3 브리프로**: W3 호출 계약(Project 잠금 뒤에만 `expireLocaleChanges`, 사람 경로는 `lockProjectAccess` 뒤).
