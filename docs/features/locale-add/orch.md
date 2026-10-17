# Add and remove languages — 지휘 계획 (`/orchestrate`)

작성: 2026-10-14 · 개정: 2026-10-17(2차 런 인테이크 — 시안 확보) · 지휘: Claude Code(Opus 5.5) · 원본: [tasks.md](tasks.md)(체크 항목) · [design.md](design.md) · [spec.md](spec.md) · [design-brief.md](design-brief.md) · [design-feedback.md](design-feedback.md) — 여기에 복제하지 않는다.
1차 런: 시작 dev `b5f8c9d8` · Orca run `run_2836e5d910eb`(종료). **2차 런: 시작 dev = 이 문서를 담은 커밋(`ef3168fa` + 2026-10-17 문서 커밋) · Orca run은 착수 때 새로 만든다.**

## 착수 범위 — 2차 런 (2026-10-17, 시안 확보)

**시안이 왔다** — Claude Design 프로젝트 `b99d54cd-3034-44f1-8446-0a864da9d767`의 허브 `Locale Add Remove.dc.html` + 섹션 다섯(L1–L7 · A1–A5 · D1–D5 · P1–P4 · T1). 4차까지 검토했고 결정은 아래 D4~D10. 로컬 사본은 메인 체크아웃 `.scratch/orch-locale-add/design/`에 L·A·P만 있다(D·T·허브는 **지휘자가 첫 UI 브리프 전에 `DesignSync get_file`로 같은 자리에 저장**한다 — 인라인 응답이라 인테이크에서 저장하지 못했다). 5차 요청(P1 배너 0건 갈래, design-feedback §2.8)은 디자이너 반영 대기 — E3 브리프 전에 P를 다시 받는다.

- **진행**: 1차 런의 ⏸ 시안 대기 행 전부 + 시안 검토로 생긴 서버 보강 셋(E0) — tasks §6 미체크 전부 · §8 둘째(DESIGN)·넷째(`/guide`·`/guide-shots`) · §9 첫째·둘째.
- **런 밖**: §2 넷째의 prod 몫·§9 다섯째(`/merge` — 사용자가 부른다) · `lib/cli/push-response.ts`의 `locale-change-pending` CLI 경고(action 릴리스 축).

## 이어받기 — 다음 세션은 여기부터 읽는다 (갱신: 2026-10-17)

**한 줄 상태(2차 런)**: 인테이크 완료 — 아래 "2차 런 배치"의 wave ⑥(E0)부터 띄운다. 첫 지휘 동작: ① `.scratch/orch-locale-add/design/`에 D·T·허브 저장 ② 새 Orca run ③ E0 브리프.

**1차 런 상태(2026-10-14 기록)**: 시안 없이 할 수 있는 일은 모두 끝났다. 배치 A1·A2·B1·B2·B3·C1·C2·D와 RT에서 나온 수정 F1·F2가 전부 dev에 들어가 push됐고(마지막 `1bcadabd`, CI success), 실호스트 왕복(RT·RT2·RT3)이 GitHub·GitLab × json-catalog·chrome-locales에서 통과했다. 이번 런의 이슈 #265·#266·#267은 모두 고쳐서 닫았다. **남은 것은 시안이 와야 하는 화면 일체와 `/merge`뿐이다**(이 기능은 화면까지 끝나기 전 머지 금지).

| 항목 | 상태 |
|---|---|
| dev head | 이 문서를 담은 커밋(origin/dev와 같음). 코드 마지막 = `1bcadabd` |
| 마이그레이션 | `20261014060000_locale_change` — **dev DB 적용 완료**(anon/authenticated USAGE·CREATE false, GRANT 0). **prod는 미적용** → `/merge` 1단계 `pnpm db:status:prod` → `pnpm db:deploy` → prod `has_schema_privilege` 확인 |
| 살아 있는 워커 | 없음 — 모든 워커·워크트리 해제·삭제(reclaimable 0) |
| Orca run | `run_2836e5d910eb` — Delivery 전부 ack. 새 세션은 새 run을 만든다 |
| 열린 이슈 | 없음(`[locale-add]` 전부 닫힘) |
| 로컬 전용 자료 | `.scratch/orch-locale-add/`(브리프·인계·리뷰 원문, RT 증거 표) — **gitignore라 이 머신에만 있다.** 필요한 결론은 이 문서·design.md·ARCHITECTURE §5.10에 옮겨 두었다 |

### 남은 일 (주인·순서)

1. ~~RT 결함 수정·재실측~~ **완료** — — RT 매트릭스 4/4 통과, 결함 둘: [#266](https://github.com/SinhyeokKang/malmoi/issues/266)(🔴 미머지 종료 뒤 재요청한 제거가 전달 목록과 같아져 PR에 안 실리고 다음 방문이 지운다) · [#265](https://github.com/SinhyeokKang/malmoi/issues/265)(🟡 MCP `preview_publish`가 전달 후 취소에서 "Nothing to send."). F1(+fix1·fix2, R-F1 리뷰)이 고쳐 dev에 통합·push(`9bca1c98`, CI success) → **RT2에서 두 호스트 4/4 통과, #266·#265 닫힘**. RT2가 새 결함 [#267](https://github.com/SinhyeokKang/malmoi/issues/267)(🟡 미머지 종료 뒤 만료 방문 전 Publish: 미리보기는 삭제를 약속, 실행은 1층 스킵으로 `no-edits` + 거짓 문구 — 1층 스킵이 스냅샷 전 만료보다 먼저라 R4가 안 선다)을 냈다 → F2(+fix1·fix2, R-F2·R-F2b 리뷰) 통합·push → RT3 두 호스트 통과 → #267 닫음. tasks §9 셋째·넷째 체크됨. **미측정으로 남은 것**: Chrome 확장 실제 로드(비-messages 파일 잔존), 실제 네트워크 단절, `/mcp` 화면 토큰 발급, 재요청 뒤 CI 적재 보류, 웹 Publish 모달 흐름(시안 배치에서).
2. **ko·es 초안 검수(`/translate`)** — 이 런이 넣은 사전 문구는 en 확정, ko·es는 초안: `logs.deferReasons["locale-change-pending"]` · `logs.sentence.import.held["locale-change-pending"]`(B3) · `logs.reasons["locale-plan-refused"]`(B2). ko 후보 문장은 R-B3 W6("아직 보내지 않은 언어 제거가 있어"). GitLab 변형 자리(`logs.gitlab.*`)는 호스트 낱말이 없어 덮지 않았다.
3. ~~**시안 도착 뒤(⏸ 행 전부)**~~ → **2차 런 배치로 옮김**(2026-10-17, 아래 "2차 런 배치"). 옛 메모 — design-brief 프레임 **1~25**(2026-10-14 백엔드 계약 반영으로 21~25 추가). 아래 "화면 배치 데이터 계약"을 브리프에 그대로 넘긴다. 신규 Dialog가 생기므로 **DS(`/design-sync`) 행**을 UI 배치 통합 직후·push 전에 둔다. 이어서 DESIGN 갱신 · `/guide`(en·ko·es — "리포에서만 언어 추가·제거" 문구와 MCP 도구·권한 표) · `/guide-shots` · 화면 `/runtime-test`(tasks §9 둘째, 두 세션 외부 제거 포함).
4. ~~POSTMORTEM~~ **완료**(`8393f7ca`, 항목 둘) — RT가 잡은 #266·#265·#267(전달 목록이 "어느 요청의 효과인가"를 모르는 부류, 1층 스킵이 만료보다 먼저인 순서)을 `/postmortem`으로 남긴다.
5. **`/merge`** — 3이 끝난 뒤 사용자가 부른다. 준비물: prod 마이그레이션(위 표), `lib/cli/push-response.ts`의 `locale-change-pending` CLI 경고는 **action 릴리스 축**(`malmoi-i18n-push-vN`)이라 앱 머지와 별개로 판단.

### 화면 배치 데이터 계약 (C1 인계에서 옮김 — 원문은 로컬 `handoff-C1.md`)

- **Sources 상세** `loadSourceDetail` → `languages[]`: `change: { operation: "ADD"|"REMOVE"; requestedAt } | null`(배지 Adding/Removing · 동작 Remove language/Cancel removal) · `unsent: boolean`(그 언어 **파일** 변경이 마지막 전달과 다름 — 셀 Unsent와 별개, 값 0개 ADD는 false, 전달 후 제거 취소는 행이 없어도 true) · `localeDelivery: "confirmed"|"unconfirmed"`(무효화 중이면 전달 여부를 단정하지 않는다). `locales` 수는 REMOVE를 뺀다.
- **Server Action**(`app/(edit)/projects/[slug]/sources/actions.ts`, 결과는 코드뿐): `addSourceLocale` → `{ok, action: "create"|"revive", path, reissued}` · `previewSourceLocaleRemoval` → `{ok, kind: "request-removal"|"cancel-add", path, translations, pendingCount, delivered: boolean|null, approval}` · `removeSourceLocale({…, approval})` → `{ok, kind, discarded}` · `cancelSourceLocaleRemoval` → `{ok, delivered: boolean|null}`(`true`면 다음 Publish 전까지 "취소 완료"라 말하지 않는다).
- **거부 코드**: 접근(`forbidden`·`not-found`·`archived`·`unauthorized`·`unavailable`) · 판정(`publish-unsettled` — 무효화 중 취소 포함, `base-locale`, `removal-pending`, `no-removal`, `approval-required`, `stale-approval`, `invalid-code`, `unsupported-locale`, `already-active`, `locale-collision`, `unsafe-path`, `path-conflict`, `unsupported-format`) · 폐기(`baseline-unknown`·`baseline-stale` — 제거만, `sync-running`). 다른 화면: `locale-removal-pending`(번역 저장·Revert 거부, `localeCodes` 동반) · `locale-plan-refused`(Publish 미리보기 `refused`, 결정적 — Try again 없음) · `locale-change-pending`(기준 언어 선언·기준 브랜치 변경 거부, CI/야간 deferred).
- **Publish 미리보기**: `withdrawnLocales` — 파일 diff가 0이어도 열린 PR에서 이전 언어 변경을 거둘 Publish가 필요하다는 신호(프레임 13). 웹 Publish 모달(`components/publish-button.tsx`)은 아직 읽지 않아 이 경우를 "보낼 것 없음"으로 그린다.
- **번역 화면**: `loadTranslationDetail().locales[].readOnly`를 `initKeyDraft(keyId, values, readOnlyCodes)`와 서버 갱신 액션 `{type: "server", …, readOnly}`에 넘긴다. 저장 버튼은 `savableLocales(draft)`, 이탈 확인은 `dirtyLocales(draft)`. 진행률·결측은 `workLocaleCodes`·`detailFill`(`lib/translations/summary.ts`)만 쓴다. ⚠️ `DetailView.locales`(locale-panel.tsx)에 `readOnly` 타입을 선언해야 한다(지금은 두 함수가 `readOnly?` 임시 형).
- **Publish 미리보기(추가)**: `expiringLocales` — 다음 방문에 만료될 요청(머지됨 = 이미 리포에 반영 / 머지 없이 닫힘 = 반영 없이 닫힘). 웹 "Not sent" 안내는 그 언어를 이름으로 말하지 않는다(R-F2b 🟡 — 문구는 시안 배치).
- **지금 화면의 알려진 틈**(MCP로 요청을 만들 수 있으므로 이미 닿는다): 번역 화면이 제거 중 언어를 편집 가능하게 보이고 저장하면 키 전체가 `locale-removal-pending`으로 거부된다(일반 save-failed 문구) · Publish 버튼(`components/publish-button.tsx`)이 `locale-plan-refused`를 base 파일 문구로 폴백한다(MCP 쪽은 C2가 전용 영어 문장을 붙였다) · Logs의 언어 사건은 종류 폴백 문장(“changed Sources & languages”)이다.

### 알려진 잔여(고치지 않음 — 이유와 함께)

- strict 적재의 존재 판정(`localesToKeep`)은 심볼릭 링크 언어 파일도 센다. 만료(`observeLocaleFiles`)는 정규 파일만 — 링크 언어 파일이 있는 리포에서만 갈린다. 적재 코어 변경이라 범위 밖.
- 열린 PR 본문은 삭제 파일 집합이 바뀔 때만 다시 쓰지만, 다시 쓸 때는 본문 전체를 바꾼다(그 순간 사람이 넣은 문구는 사라진다).
- 확인 행이 없던 소스에서 미전달 편집이 있는 언어는 첫 Publish 전까지 제거가 `baseline-unknown`으로 막힌다(fail-closed, 탈출구는 Publish).

## 결정 기록

| # | 결정 | 근거 |
|---|---|---|
| D1 | `deliveredLocaleChanges` = `DeliveryConfirmation`의 jsonb 컬럼 | 사용자 2026-10-14. design §1 |
| D2 | 핸드오프 확보 게이트를 §0에서 §6 UI 퍼블리싱 앞으로 옮김 | 사용자 2026-10-14 (`15891783`) |
| O1 | 워커 패밀리 = Claude Code(Opus 5.5·Sonnet 5.5, effort ≤ high)만. 교차 허가 없음 | 스킬 §0-3 기본 경계. 지휘자 판단 |
| O2 | push는 tasks 배치 경계마다 한다 — tasks 배치 1(A1·A2) 통합 뒤 · 배치 2(B1~B3) 통합 + dev DB 마이그레이션 뒤 · 배치 3 비시각(C1·C2·D) 통합 뒤 | tasks "배치마다 `/push` 게이트". 배치 1은 동작 중립이라 먼저 내보낸다. 지휘자 판단 |
| O3 | Chrome 추가 입력은 문서 목록으로 좁힌다(ICU 목록이 아니다) — R4로 `es_419`를 빼 54개 | design §2 "Chrome 지원 목록". 지휘자 판단 — 보수적 쪽 |
| O4 | 만료 I/O(`expireLocaleChanges`)와 언어 작업 수(`countLocaleWork` 꼴)는 **B1이 코어로 만든다** — B2(Publish)·B3(적재·야간)가 같이 부르므로 한 소유자에게 두어 B2∥B3를 연다 | 파일 겹침. 지휘자 판단 |
| O5 | Publish 미리보기·결과의 `New file`/`Updated`/`Removed`는 **데이터·판정(B2)과 화면 표시(시안 대기)로 나눈다** | 착수 범위. 지휘자 판단 |
| O6 | DS 행은 시안 대기 — 신규 Dialog가 생기므로 시안이 오면 DS 행을 둔다(스킬 §0-4.5) | 지휘자 판단 |
| O7 | `/roundtrip`(§9 셋째·넷째)은 C2(MCP) 통합 뒤 **MCP 도구로 추가·제거를 걸어** 이 런에서 돈다 — 화면이 필요 없다. 화면 `/runtime-test`(§9 둘째)는 시안 대기 | 지휘자 판단 — 시안 없이 가능한 검증 |
| D3 | **폐기 = 마지막 전달 값으로 되돌림**(Revert 의미) — **제거에만**. 추가 취소는 토큰만 비우고 값 유지(재추가가 되살림). 전달 기록 없는 미전달 셀이 있으면 제거 거부 | 사용자 2026-10-14(R-B1 Y1) + 지휘자 정정 `f7ed97d8` |
| R1 | 값 0개 ADD 보호: ADD는 자기 create가 전달 목록에 있거나 경로가 관측될 때만 만료. 빈 관측은 만료하지 않고 보류 | R-A1 🔴 · 지휘자 판단 `a05c2c04` |
| R2 | 확인이 무효화된 동안(`delivered: null`, 확인 행 없는 소스의 첫 Publish 미확정 포함) 추가 취소·제거 취소는 `publish-unsettled`로 거부 | R-B1 🔴 · R-B1b Y5 · `536cda9e`·`a6e7b230` |
| R3 | 승인 수동 Sync는 언어 변경 행만 지우고 **전달 목록은 유지**(다음 Publish가 no-changes로 수렴). 승인한 행만 지운다(Sync 도중 요청은 남김) | B3 질문 · R-B3 🔴 · `5bb3747a` |
| R4 | **모든 Publish(야간 cron 포함)**가 스냅샷 전 만료. 추가 가능 코드 ⊆ 관측 가능 코드(Chrome 54개 — `es_419` 제외, `looksLikeLocale` 교집합) | R-B2 🔴 둘 · `8313e5a5` |
| R5 | 결정적 언어 계획 거부는 비재시도 `locale-plan-refused` + Logs 최소 문구 · 열린 PR 본문은 삭제 집합 변동 때만 갱신 · base 관측 함수는 `observeLocaleFiles` 하나 | R-B2 Y2·Y3·Y4 · B2 fix2 · B3 fix2 |
| R7 | 만료는 그 행의 효과를 전달 목록에서도 뺀다(#266) · 확인보다 뒤에 낸 요청은 전달로 세지 않는다(F1 발견) · 미리보기는 `withdrawnLocales`로 "파일 diff 0이어도 이전 변경을 거둘 Publish 필요"를 싣는다(#265) | RT #266·#265 · F1 · `2b2650cc` 외 |
| R6 | 사전 문구는 typecheck가 강제하는 슬롯만(Logs 사유) 이 런에서 넣고 ko·es는 `/translate` 초안 · 컴포넌트는 테스트 픽스처와 비시각 집계 한 줄만 예외 | B3·B2·C1 질문 · 지휘자 판단 |
| O8 | 스키마 SQL은 워커가 DB 없이 `prisma migrate diff`로 만들고(더미 `DIRECT_URL`), dev DB 적용·`has_schema_privilege` 확인은 지휘자. prod `db:deploy`는 `/merge` 1단계(런 밖) | 스킬 §1 |
| D4 | 추가 Dialog의 경로·되살릴 수는 **읽기 전용 서버 미리보기**(`previewSourceLocaleAdd`)가 준다 | 사용자 2026-10-17. design §6 |
| D5 | Sources 행 PR 표시는 **저장된 `lastPrUrl`의 링크만**, 조회 실패(`prCheckFailed`)는 Sources에 없음 | 사용자 2026-10-17. design §5 |
| D6 | Logs의 되살린 수·닫힌 PR 번호는 **사건 payload 필드 추가**(additive) | 사용자 2026-10-17. design §6 |
| D7 | EDITOR·비지원 포맷은 **비활성 + 이유**(숨기지 않음) — 시안 L4 다시 그림 | 사용자 2026-10-17 |
| D8 | 추가 입력 = **프리셋 목록 + 자유 입력**(사용자 요청 기능). 이름은 화면 언어 `languageName`, 밑줄 코드는 표시용 `_`→`-` | 사용자 2026-10-17. 밑줄 `RangeError`는 실측 |
| D9 | 구분자 근거 없는 소스의 프리셋은 **하이픈** | 사용자 2026-10-17 |
| D10 | PR 배너 0건 갈래(번역 0 · 파일 변경만)는 언어 파일 변경 수로 센다 — 디자이너에 “코드에 없음” 요청 | 지휘자 추천 2026-10-17(사용자에게 전달) — 디자이너 응답과 무관하게 E3가 `these 0 changes` 문장을 내지 않게 한다 |
| O9 | 2차 런 워커 = Claude Code Opus 5.5·Sonnet 5.5(effort ≤ high), 교차 허가 없음 | 스킬 §0-3. 지휘자 판단 |
| O10 | 상태 낱말 공용 층(`STATE` adding·removing, Inactive 낱말, `orphanStrip`·`orphanReason` 원인 중립 문장)은 **E0가 먼저** 바꾼다 — E1(Sources)·E2(번역 화면 `workspace.tsx`가 `orphanStrip`을 쓴다)이 같이 소비하므로 한 소유자에 두어 E1∥E2를 연다 | 파일 겹침. 지휘자 판단 |
| O11 | E1·E2·E3는 `messages/{en,ko,es}.tsx`를 **각자 자기 절에서만** 고친다(E1 `sources.*` · E2 `translations.*` · E3 `publish`·`sync`·`logs`·`settings` 절). cherry-pick 텍스트 충돌은 지휘자가 양쪽 키 합집합으로만 푼다(1차 런 `harness.ts` 선례) — 내용 판단이 필요한 충돌은 소유 워커로 돌린다 | 스킬 §0-4 핫스팟. 지휘자 판단 |
| O12 | ko·es는 각 배치가 초안을 넣고(세 사전 같은 커밋), 일괄 검수는 TR(`/translate` 모드②)이 DS 수정 라운드 뒤에 한다 — 1차 런 초안(`logs.deferReasons`·`logs.sentence.import.held`·`logs.reasons["locale-plan-refused"]`)도 TR 범위. ko 최종은 사용자가 `/merge` 전에 본다 | CLAUDE.md 번역 규칙. 지휘자 판단 |
| O13 | DS·RT·GS(ego 쓰는 셋)는 한 워커씩 직렬 — ego 태스크 스페이스가 세션을 공유한다 | 메모리(2026-10-11 사용자). 지휘자 판단 |

## 1차 런 배치 (2026-10-14 — 완료)

| 배치 | 항목(tasks) | 파일 소유 | 선행 | 모델·effort | 자리 | 상태 |
|---|---|---|---|---|---|---|
| **A1** 순수 판정 | §1 전부 | 신규 `lib/locales/{add-plan,change-plan,effects,chrome-codes,publish-plan,expiry}.ts` + `__tests__` · `components/__tests__/client-graph.test.ts`(잎 등록만) | — | Opus 5.5 · high — 전이 표·만료 조건이 불변식 1·2의 경계 | 워크트리 | ✅ dev(fix1) |
| **A2** Publish union | §5 첫째·둘째 | `lib/pull/{plan,client,payload}.ts` · `lib/pull/run.ts`(union 좁히기·`countChangedValuesOf` delete 건너뛰기만) · `lib/publish/read.ts`(`changedFiles` 좁히기만) · `lib/gitlab/plan.ts` · `lib/github.ts`(:415 주석) · fake(`lib/gitlab/__tests__/fake-repo.ts`) · design §2 소비자 표의 테스트들 | — | Opus 5.5 · medium — 표가 design §2에 고정, 기계적 비중 큼 | 워크트리 | ✅ dev(fix1) |
| **B1** 스키마·코어 | §2 첫째·둘째·셋째·다섯째 · §3 전부 · O4 공용 코어 | `prisma/schema.prisma` · 새 마이그레이션 SQL · `scripts/gate-plan.ts`(+테스트) · 신규 `lib/locales/{change,expire,work}.ts` · 번역 저장·Revert·기준 언어 변경·MCP 번역 쓰기의 제거 상태 가드(`app/(edit)/actions.ts` 코어 쪽 · `lib/keys/revert.ts` · `app/(edit)/projects/[slug]/sources/actions.ts`의 `updateBaseLocale` 코어 · 해당 MCP 도구) · 사건 payload/view(`lib/events/` 등) · `locked-access`·진입점 목록 · 격리 PG 시나리오 · OPERATIONS 구버전 구간 영향(§2 다섯째) | **A1 통합** | Opus 5.5 · high — 잠금 순서·원자성·셀프 호스팅 | 워크트리 | ✅ dev(fix1~3) |
| **B2** Publish 나머지 | §5 셋째~열째 | `lib/pull/{run,load,plan,trigger}.ts` · `lib/publish/{read,fingerprint}.ts` · `lib/adapters/{json-catalog,chrome-locales}.ts` + `__tests__/contract.ts` · PR/MR 본문 생성기 · `lib/sync/run.ts`(장벽 재사용 시) | **A2 + B1 통합** | Opus 5.5 · high — 전달 경계·결정성 | 워크트리 | ✅ dev(fix1·2) |
| **B3** 적재·Sync·수명주기 | §4 전부 + 야간 조기 종료(`lib/nightly/plan.ts:57·70`) | `app/api/push/route.ts` · `lib/push/apply.ts` · `lib/import/{run,approval}.ts` · `lib/nightly/{run,plan}.ts` · `lib/protection/fingerprint.ts` · `lib/surfaces/remove.ts` · 설정/연결 변경 승인 코어 · `docs/ACTIONS.md`(`locale-change-pending`) | **B1 통합** (B2와 병렬) | Opus 5.5 · high — fail-closed 보류·승인 지문 | 워크트리 | ✅ dev(fix1·2) |
| **C1** 비시각 UI | §6 Server Action · reducer · `summary.ts` · 집계 | `app/(edit)/projects/[slug]/sources/actions.ts`(새 Action) · 번역 화면 draft reducer(파일은 착수 때 확정, **DOM·컴포넌트 제외**) · `summary.ts` · `lib/keys/query.ts`·Home·Keys 검색·Inbox 집계 · **`messages/*` 금지**(문구는 시안 대기 — Action은 코드를 돌려준다) | **B2 + B3 통합** | Opus 5.5 · medium | 워크트리 | ✅ dev(fix1) |
| **C2** MCP | §7 전부 | `lib/mcp/tools/*`(신규 넷 + `get_project`·`list_keys`·preview 응답) · `lib/mcp/catalog.ts` · `lib/mcp/__tests__/*` · MCP 영어 문구(`messages/en.tsx`의 MCP 구역만 — 세 사전 규칙이 걸리면 ko·es는 en 사본 + `/translate` 대기 표시) | **B2 + B3 통합** (C1과 병렬) | Opus 5.5 · medium — 권한 등급·지문 | 워크트리 | ✅ dev |
| **D** 정본 문서 | §8 첫째 · 둘째 중 DIRECTORY·ACTIONS 확인·OPERATIONS · 셋째(CLAUDE 데이터 경로 + `pnpm sync:agents`, README 검토) | `docs/{ARCHITECTURE,DIRECTORY,OPERATIONS}.md` · `CLAUDE.md`(+미러) · `README.md` — 문서별 커밋 | **C1 + C2 통합** | Sonnet 5.5 · high — 분량, 사실은 R-D(Opus)가 대조 | 워크트리 | ✅ dev(fix1) |
| **R-<배치>** 리뷰 | 각 배치 diff 독립 리뷰 | 리포트 전용 | 그 배치 `worker_done` | Opus 5.5 · medium | 리뷰 전용 워크트리 | — |
| **DB** dev 마이그레이션 | §2 넷째 중 dev 몫 | 지휘자 | B1 통합 | — | main 체크아웃 | ✅ dev 적용 |
| **RT** 왕복 | §9 셋째·넷째(O7) | 리포트 + BugShot 이슈 | C2 통합 + push | Opus 5.5 · medium | main 체크아웃, 단일 워커 | 🔄 진행 중 `ctx_be8cc5bb90fd` |
| **P** push | §9 첫째 | 지휘자 | O2의 세 시점 | — | main 체크아웃 | ✅ P1 `ecf4a5e5` · P2 `41935505` · P3 `0e29da92` |
| **⏸ 시안 대기** | §6 핸드오프 · Dialog·배지 · 셀 얼리기 DOM·수동 · Publish 표시 · 문구 · `/design-sync` · §8 DESIGN · `/guide`·`/guide-shots` · §9 `/runtime-test` | — | 시안 | — | — | 이 런 밖 |
| **⏸ 런 밖** | §2 넷째의 prod 몫 · §9 다섯째(`/merge`) | 사용자 `/merge` | — | — | — | 이 런 밖 |

**겹침 판정**: A1↔A2 없음(신규 `lib/locales/` vs `lib/pull`·`lib/gitlab`) → 병렬 · A2↔B2(`lib/pull/{plan,run}.ts`·`lib/publish/read.ts`) → 직렬 · B1↔B2/B3(공용 코어 O4) → 직렬 · B2↔B3: B2는 `lib/pull/*`·`lib/publish/*`·어댑터, B3는 `push`·`import`·`nightly`·`protection`·`surfaces` → 병렬(⚠️ `lib/pull/load.ts`는 B2 단독 소유 — B3가 필요하면 미룬 항목으로 남긴다) · C1↔C2: C1 `lib/keys`·Action·reducer, C2 `lib/mcp` → 병렬(⚠️ `get_project`·`list_keys`가 C1의 집계 함수를 부르면 C1 함수만 import, 수정은 C1).

**wave**: ① A1 · A2 → 통합 → **P1 push** ② B1 → 통합 → DB(dev) ③ B2 · B3 → 통합 → **P2 push** ④ C1 · C2 → 통합 ⑤ D · RT → 통합 → **P3 push**.

**주인 없는 항목 대조**(tasks 체크 ↔ 배치): §0 → 완료(`b5f8c9d8`) · §1 → A1 · §2 첫째·둘째·셋째·다섯째 → B1, 넷째 → DB + 런 밖 · §3 → B1 · §4 → B3 · §5 첫째·둘째 → A2, 셋째~열째 → B2 · §6 Action·reducer·summary·집계 → C1, 나머지 7행 → ⏸ 시안 대기 · §7 → C2 · §8 첫째·셋째 → D, 둘째 → D(DESIGN만 ⏸), 넷째 → ⏸ · §9 첫째 → P, 둘째 → ⏸, 셋째·넷째 → RT, 다섯째 → 런 밖. **0건.**

## 2차 런 배치 (2026-10-17 — 시안 배치)

### 시안 위치 — 브리프·`/design-sync`가 이 표를 쓴다

| 무엇 | 경로 |
|---|---|
| Claude Design 프로젝트 | `b99d54cd-3034-44f1-8446-0a864da9d767` (`https://claude.ai/design/p/b99d54cd-3034-44f1-8446-0a864da9d767?file=Locale+Add+Remove.dc.html`) |
| 허브(목차 · 코드에 요청할 것 · 브리프와 다르게 둔 것) | `Locale Add Remove.dc.html` |
| L · Languages 카드 (L1–L7) | `Locale Add Remove - L.dc.html` |
| A · 추가 Dialog (A1–A5) | `Locale Add Remove - A.dc.html` |
| D · 제거 확인 Dialog (D1–D5) | `Locale Add Remove - D.dc.html` |
| P · Publish · 막힌 동작 · Logs · Sync (P1–P4) | `Locale Add Remove - P.dc.html` |
| T · 번역 화면 (T1) | `Locale Add Remove - T.dc.html` |
| 로컬 사본(gitignore — 이 머신만) | `/Users/sinhyeok/code/malmoi/.scratch/orch-locale-add/design/<위 파일 이름>` — 지금 L·A·P. D·T·허브는 지휘자가 첫 UI 브리프 전에 저장. 캔버스가 이미지 `assets/flags/*.svg`를 참조하지만 대조에 필요한 값은 HTML 인라인 스타일에 다 있다 |

- **취득**: Claude Code는 `DesignSync get_file`(projectId 위, path = 파일 이름 그대로). ⚠️ **`get_file`은 256 KiB에서 자른다** — 섹션 파일은 모두 그 아래(L ≈ 166 KB)지만, 받은 뒤 응답의 `truncated: false`를 확인한다. 디자인 권한이 없는 세션은 `/design-login`이 필요하다 — 워커가 막히면 로컬 사본을 쓴다.
- **판본**: 2026-10-17 4차 검토본(design-feedback.md §2.7까지 반영). §2.8(P1 배너 0건 갈래)은 반영 대기 — E3·DS 직전에 P를 다시 받아 사본을 덮는다.
- 캔버스 안의 “코드에 없음” 주황 표기는 구현이 새로 만들 자리, 보라 “1차 피드백”·“2차 피드백” 표기는 검토 반영 자리다. 둘 다 정본 문장이다.

### 배치

| 배치 | 항목(tasks) | 파일 소유 | 선행 | 모델·effort | 자리 | 상태 |
|---|---|---|---|---|---|---|
| **E0** 서버 보강·상태 낱말 | §6 새 넷: 추가 미리보기 · `pullRequestUrl` · 사건 payload · `STATE` | `lib/locales/change.ts`(읽기 전용 미리보기 코어) · `app/(edit)/projects/[slug]/sources/actions.ts`(`previewSourceLocaleAdd`) · `lib/sources/query.ts` · `lib/locales/expire.ts` · `lib/events/{payload,record}.ts`(필드·파서만 — 문장은 E3) · `lib/status/canon.ts`(+`status-badge` 테스트) · `messages/*`의 `sources.missingRepo`·`orphanStrip`·`orphanReason`·`STATE` 라벨만(세 사전) · 그 소비자의 시그니처 맞춤 한 줄(`source-detail-modal.tsx`·`workspace.tsx`) · 격리 PG 시나리오 | — | Opus 5.5 · medium — 기존 판정 재사용, 새 판단 적음 | 워크트리 | ⏳ |
| **E1** Sources 화면 | §6 Sources Dialog·행·배지 · P2의 기준 언어 안내 · 문구(sources 절) | `components/sources/*`(신규 `add-locale-dialog.tsx`·`remove-locale-dialog.tsx` 등 — 이름은 워커가 정하고 인계에 적는다, `base-language-form.tsx` 포함) · 프리셋 상수 신규 `lib/locales/presets.ts`(클라이언트 잎 — `client-graph` 등록) · `messages/*`의 `sources` 절 · DOM 테스트 | **E0 통합** | Opus 5.5 · high — 상태 조합·접근성·포커스 규칙이 많다 | 워크트리 | ⏳ |
| **E2** 번역 화면 | §6 셀 얼리기 DOM · 문구(translations 절) | `components/translations/workspace/{locale-panel,workspace}.tsx` · `use-leave-guard.ts` · `lib/translations/draft.ts`(필요한 맞춤만 — reducer는 1차 런 완료) · `messages/*`의 `translations` 절 · DOM 테스트 | **E0 통합** (E1·E3와 병렬) | Opus 5.5 · medium — reducer가 이미 있다 | 워크트리 | ⏳ |
| **E3** Publish·Sync·Logs·Settings | §6 Publish 표시 · 수동 Sync 구획 · Logs 문장 · P2의 기준 브랜치 안내 · 문구(해당 절) | `components/publish-button.tsx` · `components/home/sync-button.tsx` · `components/logs/{event-row,glyph}.tsx` · `lib/events/view.ts`(문장) · `components/settings/repository-form.tsx` · `messages/*`의 `publish`·`sync`·`logs`·`settings` 절 · DOM 테스트 | **E0 통합** (E1·E2와 병렬) | Opus 5.5 · high — Publish 모달 상태 갈래가 넓다 | 워크트리 | ⏳ |
| **R-E0~R-E3** 리뷰 | 각 배치 diff 독립 리뷰 | 리포트 전용 | 그 배치 `worker_done` | Opus 5.5 · medium | 리뷰 전용 워크트리 | — |
| **DS** `/design-sync` | §6 `/design-sync` | 리포트 전용 — 불일치는 그 화면 소유 배치(E1·E2·E3)가 고친다 | E1·E2·E3 통합 · **push 전** | Opus 5.5 · medium | main 체크아웃, ego 단독(O13) | ⏳ |
| **TR** `/translate` 모드② | §6 문구의 ko·es 검수 + 1차 런 초안(O12) | `messages/{ko,es}.tsx`만 | DS 수정 라운드 통합 | Sonnet 5.5 · high | 워크트리 | ⏳ |
| **D2** 정본 문서 | §8 둘째(DESIGN — Sources·번역 읽기 전용·Publish 상태/문구·Inactive 낱말) · DIRECTORY 새 모듈 · CLAUDE.md 데이터 경로 표(`previewSourceLocaleAdd`) + `pnpm sync:agents` · ARCHITECTURE §5.10(추가 미리보기·payload 필드·PR 링크 출처) | `docs/{DESIGN,DIRECTORY,ARCHITECTURE}.md` · `CLAUDE.md`(+미러) — 문서별 커밋 | DS 수정 라운드 통합 (TR과 병렬) | Sonnet 5.5 · high — 사실은 R-D2(Opus)가 대조 | 워크트리 | ⏳ |
| **P4** push | §9 첫째 | 지휘자 | TR·D2 통합 | — | main 체크아웃 | ⏳ |
| **RT4** `/runtime-test` | §9 둘째 · §6 셀 얼리기 수동(두 세션 외부 제거) | 리포트 + BugShot 이슈 — 수정은 소유 배치 | P4 | Opus 5.5 · medium | main 체크아웃, ego 단독(O13) | ⏳ |
| **G** `/guide` | §8 넷째 앞 절반 — en·ko·es “리포에서만 언어 추가·제거” 문구 · MCP 도구·권한 표(1차 런 R-C2 ⚪) | `guide/{en,ko,es}/` · `guide/AUTHORING.md`(필요 시) | RT4 수정 통합 | Sonnet 5.5 · high | 워크트리 | ⏳ |
| **GS** `/guide-shots` | §8 넷째 뒤 절반 — `pnpm guide:check` stale 컷 | `public/guide/` · `guide/SHOOTING.md` | G 통합 | Sonnet 5.5 · medium | main 체크아웃, ego 단독(O13) | ⏳ |
| **P5** push | §9 첫째(마무리) | 지휘자 | GS 통합 | — | main 체크아웃 | ⏳ |
| **⏸ 런 밖** | §2 넷째 prod 몫 · §9 다섯째 `/merge` · CLI 경고(action 축) | 사용자 | — | — | — | 런 밖 |

**겹침 판정**: E0 → E1·E2·E3 직렬(상태 낱말·payload·Action을 셋이 소비 — O10). E1↔E2↔E3: 컴포넌트 파일 겹침 없음, `messages/*`는 절을 나눠 병렬(O11) · `lib/events/`는 E0 payload / E3 view로 나눔 · `source-detail-modal.tsx`·`workspace.tsx`는 E0의 시그니처 한 줄 뒤 E1·E2 단독. DS·TR·D2·RT4·G·GS는 앞 단계 통합 뒤라 코드 겹침 없음 — TR(`ko`·`es`)과 D2(docs)는 병렬, DS·RT4·GS는 ego 때문에 서로 직렬.

**wave**: ⑥ E0 → 통합 ⑦ E1 · E2 · E3 → 통합 → DS → 수정 라운드 통합 ⑧ TR · D2 → 통합 → **P4 push** ⑨ RT4 → 수정 통합 ⑩ G → GS → 통합 → **P5 push**.

**주인 없는 항목 대조**(tasks 미체크 ↔ 배치): §2 넷째 → 런 밖 · §6 추가 미리보기·`pullRequestUrl`·payload·`STATE` → E0 · Sources Dialog·행 → E1 · 기준 언어/브랜치 안내 → E1(기준 언어)·E3(브랜치) · 셀 얼리기 DOM → E2 · 셀 얼리기 수동 → RT4 · Publish 표시·Sync 구획·Logs 문장 → E3 · 문구 → E1·E2·E3 + TR · `/design-sync` → DS · §8 둘째 → D2 · 넷째 → G·GS · §9 첫째 → P4·P5 · 둘째 → RT4 · 다섯째 → 런 밖. **0건.**

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
- B1 fix1 `worker_done` — `c139fa66`·`b3f334bf`·`012471dc`·`0f0e7b5a`(`gate: ok` 14945 · PG 754, 변이 M1·M8·M11·M13 포착). ⚠️ **지휘자 오류 정정**: design D3 문장이 추가 취소까지 '마지막 전달 값으로 되돌림'에 넣어 새 언어의 입력이 ""로 지워졌다 — spec 보존 행(재추가로 되살림)과 충돌. 되돌림은 제거에만, 추가 취소는 토큰만 비우고 값 유지로 정정(design 갱신). **B1 fix2**.
- B1 fix2 `worker_done` — `5b8d439d`·`d676608f`(`gate: ok` 14945 · PG 755). **B1 통합**(cherry-pick 12커밋) · **DB** dev `migrate deploy` → `db:status` 최신 · anon/authenticated USAGE·CREATE 전부 false · GRANT 0. main 체크아웃 `pnpm gate` **ok**. tasks §2(넷째 제외 — prod 몫)·§3 체크(§3 여섯째 CI 적재 잠금 순서는 B3 몫이라 미체크).
- wave ③ — **B2** `ctx_448ea080c5ad` · **B3** `ctx_5e54a287c240`(Opus high, base `87b9b3e6` rebase 확인) · **R-B1b** `ctx_89dc70688e89`(fix1·fix2 재리뷰, Opus medium — fix1이 커서 지휘자 판단으로 재리뷰). B1 retain(재리뷰 수정용).
- B3 질문: `locale-change-pending`이 Logs에 닿으려면 사전 4슬롯×3 필요 → **지휘자 판단 허용**(기존 화면의 서버 사유 문장이라 시안 무관, ko·es는 `/translate` 초안 표시). CLI `push-response.ts`는 action 릴리스 축이라 미룸.
- R-B1b 완료(🔴 0 · 🟡 1 · ⚪ 3, 변이 11 중 10 — 이전 지적 전부 닫힘). **Y5**(확인 행 없는 소스의 첫 Publish 미확인 → 취소가 작업 0으로 접힘) → **B2로**: 첫 외부 쓰기 전 무효화가 행 없는 캡처 소스에 무효화된 행을 만든다(`load.ts` B2 소유). Z1(폐기 저자 테스트)·Z2(폐기의 적재 lease 거부) → **B1 fix3**. Z3 design 문장 정정(탈출구는 Publish뿐).
- B1 fix3 `worker_done` — `83c9f4f1`·`502bb13c`(`gate: ok`, 1회차 search-performance 314ms flake). dev에 cherry-pick. B1 해제·워크트리 정리.
- B3 질문 2: 승인 수동 Sync가 전달 목록까지 비우면 열린 PR의 삭제가 남는다 → **지휘자 판단: 행만 지우고 전달 목록 유지**(다음 Publish가 no-changes로 수렴). design 전이 표 갱신.
- B3 `worker_done` — `4ce5db3a`·`085153db`·`3f92154d`·`1e9fe2a6`(`gate: ok` 14978 · PG 786). ⚠️ B2와 **함께 통합**해야 한다(야간 Publish 선택이 B2의 `shouldSkipPull` 변경에 기댄다). B3 retain. **R-B3** `ctx_dc9b453d53e3`(Opus high).
- B2 `worker_done` — `2be4265b`·`fc974865`·`a2669bb4`(`gate: ok` 15000 · PG 766, Y5·F2·F3 포함). 자체 🟡 둘(결정적 거부가 재시도 가능 실패로 보임 · 정리 안내가 새 PR에만) + 관찰(만료가 전달 목록을 남겨 수렴 Publish 1회 추가)을 R-B2가 판정. B2 retain. **R-B2** — Opus high.
- R-B3 완료(🔴 1 · 🟡 3 — 수동 Sync 도중 요청한 언어 변경을 승인 없이 지움). **B3 fix1** — R1(승인 행을 lease에 실음) · Y1 · Y2. Y3(B2와 같은 push)는 O2 계획대로. R-B3 해제·정리.
- R-B2 완료(🔴 2 · 🟡 4, 변이 12/12, B3와 시험 병합 — harness.ts 사소한 충돌 하나). **B2 fix1** — R1(cron Publish도 스냅샷 전 만료) · R2(추가 코드를 관측 가능 코드로 좁힘, es_419 제외 — lib/locales 소유자 해제라 B2가 맡음) · Y1(조기 종료 ②를 전달 가능 작업으로) · Y2(구조화 오류 클래스·코드만, 문구는 C1) · Y3(열린 PR 본문 갱신 `updatePr` 두 호스트). **Y4**(base 관측 함수 둘) → B2·B3 통합 뒤 B3 fix2. design 갱신.
- B2 fix1 질문: 새 SyncErrorCode가 Logs 사유 문구를 typecheck로 강제 → **지휘자 판단 A**(logs.reasons에 최소 문구만, B3 질문과 같은 근거).
- B3 fix1 `worker_done` — `1f6b8fe8`·`4ddca468`(R1 승인 행 lease · Y1 · Y2 · W1, `gate: ok` 14979 · PG 795; 1회차 search-performance flake). B2 fix1 대기 → 함께 통합 → B3 fix2(Y4 관측 함수 통합).
- B2 fix1 `worker_done` — `0e1dea4a`·`1aeb91db`·`5a5f271b`(`gate: ok` 15133 · PG 771). 관찰: 열린 PR 본문을 사람 수정까지 덮어씀 → **B2 fix2**(정리 안내 변동 때만 갱신).
- **wave ③ 통합**: B2 6커밋 + B3 6커밋 cherry-pick, `harness.ts` 충돌은 양쪽 목 필드 합집합으로 해소(지휘자). main 체크아웃 `pnpm gate` **ok**. tasks §3 여섯째·§4·§5 체크.
- P2 push `ecf4a5e5..41935505` · CI run 38537190190 감시. wave ④ — **C1** `ctx_8568ff7f4be9` · **C2** `ctx_6fca1e6ac32f`(Opus medium, base `41935505`) · **B3 fix2** `ctx_cb568fc2d58a`(Y4 관측 함수 하나) · **B2 fix2** `ctx_7008bb97a07c`(PR 본문 갱신 범위).
- B3 fix2 질문: 관측 공통화가 리더 snapshot에 mode를 실어야 함 → **지휘자 판단 a+b 허용**(B2 fix2와 같은 파일이라 snapshot 줄만).
- C1 질문: 새 필수 뷰모델 필드가 components 테스트 픽스처 5개를 깸 → **지휘자 판단 A**(픽스처 리터럴만).
- B3 fix2 `worker_done` — `1c58cbcc`·`7b608a1b`·`4e6c0528`(관측 함수 `observeLocaleFiles` 하나, 리더 snapshot에 mode, `gate: ok` 15171 · PG 814). dev cherry-pick. **남은 차이(⚪, 기록만)**: strict 적재의 존재 판정(`localesToKeep`)은 아직 링크된 언어 파일을 센다 — 만료는 정규 파일만. 심볼릭 링크 언어 파일에서만 갈리고, 적재 코어 변경이라 이번 범위 밖. B3 해제·정리.
- C2 `worker_done` — `461c747e`·`fda25040`·`66fb1f01`(MCP 도구 넷 + 조회 응답, `gate: ok` 15240 · PG 819). 남김: 가이드 MCP 표(시안 대기 `/guide` 몫이 아니라 §8 — 이 런에서 D가 다룰지 판단). C2 retain. **R-C2**.
- R-C2 완료(🔴 0 · 🟡 0 · ⚪ 5, 변이 5/5). **C2 통합**(cherry-pick 3). ⚪ ARCHITECTURE §6.45 도구 수·가이드 권한 표 → D 메모. C2·R-C2 해제·정리.
- B2 fix2 `worker_done` — `502c28e0`·`ed8ad232`(삭제 파일 집합이 바뀔 때만 본문 갱신, `gate: ok` 15175 · PG 810). 갱신이 필요할 때는 본문 전체를 바꾼다(그 순간 사람 문구는 사라짐 — 수용, 기록). dev cherry-pick. B2 해제·정리.
- C1 `worker_done` — `61c1b258`·`11fbbce7`(Action 넷 · draft readOnly · summary · 공유 집계 술어, `gate: ok` 15219 · PG 814). C1 retain. **R-C1**.
- **D** `ctx_b9c3f489e379`(Sonnet high, 정본 문서 — DESIGN·가이드 제외, base `9d4fb36b`). C1 리뷰와 병렬(지휘자 판단 — 문서는 C1 이름만 `lo-C1`에서 읽는다).
- R-C1 완료(🔴 0 · 🟡 2, 변이 8 중 7, dev에 깨끗이 cherry-pick). **C1 fix1** — Y1(저장 직후 낙관적 집계가 제거 중 언어를 셈 — MCP로 REMOVE가 생길 수 있어 지금 고침, 컴포넌트는 비시각 한 줄 예외 허용·지휘자 판단) · Y2(검색 하이라이트 술어 테스트). R-C1 해제·정리.
- D `worker_done` — ARCHITECTURE §5.10 신설 · §6.45.5 도구 수 31→35 · DIRECTORY · ACTIONS · OPERATIONS · CLAUDE.md(+미러), README 변경 없음(`gate: ok`). D retain. **R-D**(사실 대조).
- C1 fix1 `worker_done` — `2920845d`·`d5b1aa6d`(`gate: ok` 15307 · PG 828). **C1 통합**(cherry-pick). C1 해제·정리. 화면 배치 메모: `DetailView.locales`에 `readOnly` 타입 선언 추가 필요.
- R-D 완료(🔴 1 · 🟡 5 · ⚪ 6). **D fix1** 전부. 가이드 MCP 권한 표는 ⏸ 시안 대기 `/guide` 행 소유로 유지. R-D 해제·정리.
- **wave ④·⑤ 통합**: C2 · B2 fix2 · B3 fix2 · C1(+fix1) · D(+fix1). main 체크아웃 `pnpm gate` **ok**. tasks §6 비시각 넷 · §7 · §8 첫째·셋째 체크(§8 둘째는 DESIGN이 시안 대기라 미체크 — DIRECTORY·ACTIONS·OPERATIONS는 반영됨).
- P3 push `41935505..0e29da92` · CI success(38545758251). design-brief 백엔드 계약 반영(`68b00b47`, 프레임 21~25 추가) · push `..2fc25ed4`. **RT** `ctx_be8cc5bb90fd`(Opus medium, main 체크아웃, MCP로 추가·제거) — 이 동안 main 체크아웃 cherry-pick·build 금지.
- **RT 완료** — 폐기용 프로젝트 넷(GitHub·GitLab × json-catalog·chrome-locales, 격리 base 브랜치)에서 MCP로 왕복. 매트릭스 4/4 통과(추가→번역→Publish→머지, 제거→재Publish 유지→취소→재요청→머지→orphan→재추가 값 복구) · 전달 후 취소 · 미머지 종료 만료 · base 선삭제 · 응답 유실 재시도 · 실행 비트 삭제(GitHub `sha:null`·GitLab `action:delete`) · PR/MR 본문 안내(생성·갱신) 통과. **결함**: #266 🔴 · #265 🟡(BugShot). **미측정**: Chrome `_locales/de/`에 비-messages 파일만 남은 확장 로드(시스템 Chrome 금지·ego로 unpacked 로드 불가) · 실제 네트워크 단절(서버 강제 종료로 대체) · `/mcp` 화면 토큰 발급(같은 코어로 발급). 테스트 프로젝트 보관·push 토큰 회전·원격 브랜치/PR·API 토큰 정리 완료. RT retain.
- **지휘자 판단(design `2b2650cc`)**: #266 → 만료가 그 행의 효과를 전달 목록에서도 뺀다(R-B2의 "수렴 Publish 1회 유지" 판정 번복). **F1** `ctx_ec4e82e50708`(Opus high, #266·#265, `Refs #N`).
- F1 `worker_done` — 3커밋(#266 만료가 전달 목록에서 효과 제거 · #265 미리보기 `withdrawnLocales` + MCP 문장, `gate: ok` 15315 · PG 837). 새 발견(같은 부류 — 행 없이 남은 전달 목록 + 미머지 종료 + 재요청) → **지휘자 판단: 확인보다 뒤에 낸 요청은 전달로 세지 않음**(design). **F1 fix1** — 그 규칙 + ARCHITECTURE §5.10 갱신(만료의 전달 목록 정리·`withdrawnLocales`·새 규칙).
- F1 fix1 `worker_done` — 5커밋(확인 뒤 요청 규칙: 확인 시각 = `syncRunId` 실행의 `startedAt`, 다섯 소비자 공유 · 좁힘 · ARCHITECTURE §5.10, `gate: ok` 15319 · PG 840). 의미 변경이 커서 **R-F1**(Opus high) 리뷰 후 통합(지휘자 판단).
- R-F1 완료(🔴 0 · 🟡 1 · ⚪ 5, 변이 8 중 6). Y1: 취소→재요청→다시 취소(옛 PR 열림)에서 `delivered:false`(fix1 회귀). **F1 fix2** — Y1 + 회귀 테스트 + ARCHITECTURE 시계 전제·소비자 목록. R-F1 해제·정리.
- F1 fix2 `worker_done` — `bee42168`·`f52865d0`·`a62af96a`(취소 결과는 저장된 전달 목록 기준 · ARCHITECTURE 시계 전제·소비자 목록, `gate: ok` 15319 · PG 842). **F1 통합**(cherry-pick 11) · main 체크아웃 `pnpm gate` **ok**. F1 해제·정리. push 뒤 **RT2**(RT 워커 재사용).
- **RT2 완료** — GitHub `i18n-order-check`·GitLab `malmoi-gitlab-test`에서 F1 네 경로 모두 통과(재요청 새 PR #23/!21·#25/!22 · 전달 후 취소 미리보기 "undoes 1 language change" · 재취소 delivered + 다시 Publish 안내). **#266·#265 닫음**(증거 댓글). 새 결함 **#267**. 미측정: 재요청 뒤 CI 적재 `locale-change-pending` 보류(대상 리포 CI 미실행). GitLab 첫 방문 `base-unreadable` 일시 실패 1건(결함 아님). 테스트 프로젝트 보관·토큰 회전·브랜치/PR 정리. RT retain.
- **F2** `ctx_142f3ee77968`(Opus high, #267 — Publish가 1층 스킵 전에 만료, 미리보기가 같은 만료 판정을 읽기 전용으로 반영).
- F2 `worker_done` — `e03b6147`·`b48adfd9`(언어 효과가 전달된 소스는 1층 스킵 전에 만료 · 미리보기 `expiringLocales` 읽기 전용 · 정직한 결과 문장, `gate: ok` 15330 · PG 852). 남김: ARCHITECTURE §5.10·1층 "API 0회" 예외 문서, POSTMORTEM 항목. F2 retain. **R-F2**.
- R-F2 완료(🔴 2 — 만료 판정의 presence를 버려 머지된 PR을 "미머지 종료"로 말하고 새 파일을 약속함(F2 회귀) · 미머지 종료된 ADD도 같은 증상). **F2 fix1** — presence 전달 · 웹 no-changes 문구 · 문서·주석. R-F2 해제·정리.
- F2 fix1 `worker_done` — 5커밋(presence 전달 `lib/locales/reached.ts` · "이미 리포에 반영됨" vs "반영 없이 닫힘" · 웹 결과 · 지문 꼬리 제거 · ARCHITECTURE §5.10·DIRECTORY, `gate: ok` 15335 · PG 860). `components/publish-button.tsx` 한 줄 수정(소유 밖 — 재리뷰가 판정). **F2 fix2**(ad80605c 테스트) ∥ **R-F2b** 재리뷰.
- F2 fix2 질문: `ad80605c` 필터는 도달 불가(지원 어댑터 둘 다 재생성이라 경고가 안 남) → **지휘자 판단: revert**(추측성 방어 코드 금지 — CLAUDE.md 작업 원칙).
- R-F2b 완료(🔴 0 · 🟡 1 · ⚪ 4 — 통합 가능, revert 정당). 🟡 웹 "Not sent" 제목·설명이 빠진 언어 요청을 이름으로 말하지 않음 → **시안 배치**(문구). ⚪ ARCHITECTURE "API 0회" 줄에 §5.10 예외 포인터 → 지휘자 문서 커밋. R-F2b 해제·정리.
- F2 fix2 `worker_done` — `22728b03`(도달 불가 필터 revert). **F2 통합**(cherry-pick 8) + ARCHITECTURE "API 0회" 예외 포인터(지휘자 문서 커밋) · main 체크아웃 `pnpm gate` **ok**. F2 해제·정리. push 뒤 **RT3**(#267 재실측).
- **RT3 완료** — GitHub·GitLab 둘 다 4/4: 머지 없이 닫힌 REMOVE·ADD("반영 없이 닫힘 — Publish가 요청을 버린다", 파일 약속 없음, PR #27/#29·MR !23/!24) · 머지된 REMOVE·ADD("이미 리포에 반영", PR #28/#30·MR !25/!26) · 평소 셀 편집 Publish 문구 불변(PR #31·MR !27). **#267 닫음**, 새 결함 0. 미측정: 웹 Publish 모달. RT 해제. tasks §9 셋째·넷째 체크. **런의 시안 없는 범위 종료.**
