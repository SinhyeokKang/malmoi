# Sync repository — tasks

`spec.md` §12의 feature-review 합의를 반영한다. **아래는 구현 계획이며 완료 체크가 아니다.**
이번 feature-review는 문서만 수정한다. 코드·빌드·테스트·DB·원격 배포는 실행하지 않는다.

[handoff.md](./handoff.md)는 **아트보드 `4a`~`4f`의 실측값**이 정본이다 — 그 문서의 미완료 목록은 낡았고, 현황은 바로 아래 블록이 든다.

---

## ⚠️ 2026-09-15 저녁 현황 — **여기부터 읽는다**

`project-home` 재편이 끝나 dev에 나갔다(`196b57f` + `/design-sync` 후속 `a0fbbd7`, preview 배포). 그 작업이 **T9를 흡수했고**
이 feature의 남은 것은 **T11·T12·T13 셋**이다. `docs/features/project-home/`은 결론이 정본으로
올라가 지워졌다 — 그쪽 근거가 필요하면 `git log`와 `docs/DESIGN.md` §6.64다.

**끝난 것**

| 태스크 | 상태 |
|---|---|
| T0~T8 | ✅ (이전 세션) |
| **T9. project-home 연결 계약** | ✅ **project-home T6이 배선했다** — `maxDuration = 60` 명시 · `[Sync]`와 실패 배너 `[Try again]`이 같은 확인 Dialog·Action을 연다 · 머리가 원결과를 들고 본문의 고정 Alert 자리에 넘긴다(`components/home/actions.tsx`의 컨텍스트 Provider) |
| **T10. 준비 게이트·preview** | ✅ `typecheck`·`test`(4,039)·`build`·`test:projects:postgres`(73) green · dev 마이그레이션 적용 · dev push 완료 |

**남은 것**

| 태스크 | 왜 안 됐나 | 다음 사람이 할 것 |
|---|---|---|
| **T11. UI·시안·접근성 검증** | `/design-sync project-home`이 **Home 화면**은 실측했지만(`2a` 아트보드) **Sync 기능의 갈래를 하나도 안 밟았다** | 아래 여덟 갈래를 실물로 밟는다 |
| **T12. 실물 왕복** | 미착수 | `/l10n-roundtrip`을 폐기용 `i18n-format-check`에서 |
| **T13. 정본 반영·기능 완료** | T11·T12 선행 | PRODUCT의 "아직 안 만들었다" 표기 제거 외 |

### T11이 밟아야 하는 갈래 여덟 (하나도 안 밟았다)

미발송 0 · 미발송 N · 열린 PR 있음 · PR 조회 중/실패 · 정상 0키 · 일부 파일 실패 ·
CI 미적용 · 연타 · 결과 유지(`router.refresh()` 뒤에도 Alert가 남나).

⚠️ **DOM 테스트 통과를 실제 브라우저 검증으로 바꿔 적지 않는다.** `components/__tests__/sync-button.test.tsx`·
`sync-result.test.tsx`가 그 갈래들을 jsdom에서 든다 — 그것은 **판정**을 잰 것이고 T11이 재는 것은
**시안과 같은가**다.

⚠️ **`/design-sync`를 돌린다면 SoT는 `design_handoff_sync_repository`(아트보드 `4a`~`4f`)다.**
Home의 핸드오프가 아니다 — 그 둘은 파랑 규칙도 다르다(`docs/DESIGN.md` §6.64의 마지막 ⚠️).

### ⚠️ `/design-sync`를 한 바퀴만 돌았다

스킬 규약은 **리뷰 지적이 0이 될 때까지** 3→4→5단계를 돈다인데, 2026-09-15에 **1라운드에서
멈췄다** — 리뷰가 낸 🔴 2 · 🟡 8 · ⚪ 다수를 전부 고치고 **재리뷰를 안 걸었다.** 고친 것 중
`empty:hidden`·`<section>` 이름·로딩 골격은 **그 루프가 스스로 만든 회귀**였으므로, 이번 수정이
새 회귀를 만들었을 가능성이 같은 크기로 남아 있다.

**다음 세션의 첫 일**: `components/home/**`·`app/(edit)/projects/[slug]/{page,loading}.tsx`에
리뷰를 한 번 더 건다. 브라우저 실측은 `2a`에서 이미 통과했으므로 **소스 리뷰만** 다시 돌면 된다.

### POSTMORTEM이 낸 후속 후보 다섯 (2026-09-15, grep을 실제로 돌린 결과)

| 자리 | 무엇 | 왜 지금 안 고쳤나 |
|---|---|---|
| `lib/projects/import-status-store.ts:82` | `recordReportedFailure`가 결과 필드를 **손으로 나열한다** | 그 경로는 `lastImportStartedAt`을 건드리면 안 되는데 `importOutcomeFields`가 그것을 `null`로 강제한다. **셋째 결과 컬럼이 늘면 또 빠진다** — 그 함수를 "진행 표시를 건드릴지"로 가르는 형으로 여는 것이 답이다 |
| `components/ui/card.tsx` · `components/projects/project-list.tsx:226` · `app/(edit)/projects/loading.tsx:48` · `.../members/page.tsx:73` | 이름 없는 `<section>` 넷 — `role="generic"`으로 접혀 접근성 트리에서 사라진다 | 각각 그 화면에서 랜드마크가 필요한 자리인지 판정이 필요하다(필요 없으면 `<div>`가 맞다). 프리미티브(`card.tsx`)는 소비자가 이름을 줄 수 있게 여는 쪽이다 |
| `components/translations/header.tsx:197` | `mb-4 empty:mb-0`이 Home에서 깨진 것과 **같은 모양**이다 | 안의 배너 셋이 전부 `null`을 낼 때 요소를 안 남기는지 확인 안 했다. 남기면 그 여백도 영원히 안 걷힌다 |

### project-home 쪽에 남은 검증 (이 feature 밖이지만 같은 화면이다)

캔버스 아트보드 여섯 중 **`2a` 하나만 실측했다.** 나머지 다섯(`2a` 빈 · `2b` Sync 실패 ·
`2c` 미연결 · `2d` 보관 · `2e` 로딩)은 단위·DOM 테스트로만 서 있다 — **밟는 방법과 되돌리는 절차**는
`docs/DESIGN.md` §6.64의 표에 있다. `2b`는 이 feature의 T11과 **같은 화면**이라 함께 밟으면 된다.

---

## 결정과 완료 경계

- OWNER만 실행. 활성 표면 전체의 결과를 보고하며 포맷 누락도 실패로 포함한다.
- 프로젝트 Sync 실행권은 원자적으로 확보해 전체 실행 동안 유지한다. **CI가 우선**이다.
- Sync는 사용처를 보존하고 다음 CI가 갱신한다.
- 정상 빈 카탈로그는 성공으로 처리해 기존 키 전체를 orphaned로 표시한다. 읽기 실패와 구분한다.
- PR 조회 시작·실패 모두 미확인 경고. no changes도 재적재 완료다.
- **Action·컴포넌트 준비 완료와 사용자 기능 완료를 구분한다.** Home 배선·실제 UI 검증은
  project-home에서 함께 한다. T11~T13은 project-home T6 배선 완료 뒤에 실행한다.

실행 순서: T2 → T3 → T4 → T5(red) → T6(green) → T7 → T8 → T10(준비 게이트).
T1은 서버 작업과 병렬이며 T8의 시각 구현보다 먼저 완료한다.
T9는 project-home에 넘기는 연결 계약이다. **T10까지만 끝났으면 준비 완료이며 기능 완료가 아니다.**

커밋 경계는 `───`로 표시한다. 이 목록의 원격 단계는 Claude Code가 맡고 Codex는 로컬 커밋까지다.

## T0. 이미 반영한 제품 문서

PRODUCT §3 OWNER 전용 행·§7.5 재적재 readiness 설명, project-home spec §8 권한표는 반영됐다.
구현이 아직 없다는 표기는 T13까지 유지한다.

- **검증**: 권한표·설명·project-home 표가 OWNER 전용으로 일치한다. 단순 grep 건수로 판정하지 않는다.

## T1. 시안 — project-home 통합 검증의 기준

`design-prompt.md`를 Claude Design에 넘겨 4a~4f 아트보드를 받는다. 프롬프트 자체는 시안이 아니다.
미확인 경고·실패 표면 이름·고정 danger 버튼은 제품 계약이며 시안이 바꾸지 않는다.

- **검증**: 여섯 아트보드가 있고 PR 조회 중/실패, 정상 0키 완료, 부분 실패, CI 우선 미적용을 담는다.
- **의존**: 서버 T2~T6은 기다리지 않는다. T8 시각 구현과 T11 실측은 이 시안을 따른다.

## T2. 리포 읽기·준비 추출 — 테스트 먼저

1. 기존 `runFirstIngest`의 판정·오류·예산·캐시 무효화 단언을 유지하고 공용 헬퍼 회귀 테스트를 추가한다.
2. `readFiles`·`snapshotError`를 `lib/import/read.ts`로 옮긴다.
3. `lib/import/surface.ts`로 읽기·준비를 추출한다. snapshot 입력은 성공한 `RepoSnapshot` 전체이며
   `files.path/sha/size`를 사용한다. GitHub I/O와 DB 적용을 분리한다.
4. 첫 적재는 기존 0키 실패와 refs 교체를 유지한다. 이전 base는 null이다.

- **검증**: 새 헬퍼 테스트 red→green, 기존 온보딩 테스트와 `pnpm test`·`pnpm typecheck` green.
  attempted 목록/합집합/실패 blob만 재시도, SHA 다운로드, 크기 예산을 단언한다.

`─── refactor(import): extract repository snapshot preparation ───`

## T3. 순수 계약 테스트 — red

- `lib/import/__tests__/plan.test.ts`: 거부 순서, 프로젝트 실행권과 표면 진행 표시의 stale 경계 정각,
  보관 제외, 포맷 누락은 실패 목록, 활성 표면 전체 포맷 누락과 활성 표면 0개 구별.
- `lib/import/__tests__/confirm.test.ts`: unsent/PR 객체/null/undefined 조합, recommendSend, 위험 판정.
- `lib/import/__tests__/result.test.ts`: 전체 성공·정상 0키·부분 파싱 실패·표면 실패·포맷 누락·
  CI 미적용·실행권 상실. 전부 partial, imported + partial, failed + superseded의 tone 순서도 단언한다.
  원결과 사유 보존, 안정된 slug 순서, no changes 전용 분기 부재.
  ⚠️ **목록이 셋으로 갈린다** — `unreadable` / `superseded` / `invalidFormat` (핸드오프 §6 4e).
  헤드라인은 둘로 묶이지만 **액션이 갈리므로**(앞의 둘만 `Try again`) 요약이 셋을 구별해야 한다.
  `invalidFormat`이 `superseded`에 접히지 않는 것을 단언한다.
- `lib/import/__tests__/empty.test.ts`: 다섯 어댑터별 정상 빈 컨테이너와 깨진 파싱/잘못된 컨테이너/
  대상 미발견/base 부재/다운로드 실패를 구별. 재탐지 실패를 무조건 정상 0키로 바꾸지 않는다.
- `lib/import/__tests__/apply-plan.test.ts`: 캡처 revision 불일치, 다른 실행 토큰, stale 토큰,
  변경된 설정의 적용 거부. 이전 커밋으로 force-push됐어도 중간 적재가 없으면 허용한다.

- **검증**: 신규 계약 미구현으로 해당 테스트가 red이며 기존 실패와 구분한다.

`─── test(import): pin repository sync decisions ───`

## T4. 순수 구현 + additive 스키마

1. 순수 판정 모듈을 구현한다. 테스트가 import하는 순수 파일에는 `server-only`를 붙이지 않는다.
2. Project 실행 token/start nullable 둘, TranslationSurface.importRevision default 0,
   **TranslationSurface.lastImportToken nullable 하나**(판정 D — `design.md` §7.1)를 추가한다.
3. `/db`에서 마이그레이션 SQL 생성·검토·dev 적용 순서를 확인한다. 기존 행을 삭제하거나 reset하지 않는다.
   prod 적용은 `/merge` 앞이며 이 단계에서 prod를 변경하지 않는다.

- **검증**: T3 green, Prisma 생성과 typecheck 통과, SQL이 additive이며 기존 행의 기본값이 맞다.
  마이그레이션·스키마를 같은 커밋에 포함한다.

`─── feat(import): add sync decisions and execution ownership fields ───`

## T5. 적용·Action 회귀 테스트 — 구현 전 red

**T6 구현 전에** 단위·Action·실제 PG 테스트를 작성하고 red를 확인한다.

`pnpm test:projects:postgres`에 다음 시나리오를 추가한다. 임의 sleep이 아니라 barrier로 순서를 제어한다.

1. 편집 → Sync: 리포 값으로 교체하고 updatedBy=NULL. lastPulledAt은 유지한다.
2. A 성공/B 실패: A가 남고 B 사유가 기록된다. 실패를 전체 성공으로 요약하지 않는다.
3. 동일 프로젝트 Sync 둘: 한 실행만 진입, 다른 실행은 already-running. 표면 사이에도 실행권 유지.
4. stale 회수: 새 토큰이 선 뒤 옛 실행은 데이터 적용·실패 기록·실행권 해제를 못 한다.
5. Sync 준비 H1 → CI H2 적용 → Sync 재개: 해당 표면은 superseded, H2·refs·CI 결과 유지.
6. 동일 SHA CI 재실행도 revision 변경으로 검출. CI 실패 rollback은 revision을 올리지 않는다.
7. Sync 적용이 먼저 tx를 잡은 경우 뒤따르는 CI가 최종 값을 쓴다. 실행권 때문에 CI를 거부하지 않는다.
8. refs 보존: Sync 전후 KeyRef가 같고 다음 CI에서 갱신된다. 정상 0키도 같은 보존 계약.
9. 정상 0키: 키 전부 orphaned, 번역/사용처 삭제 없음, commit·revision·결과를 같은 tx에서 확정.
   다운로드 실패/파싱 실패/파일 부재에서는 기존 키의 orphaned 상태를 바꾸지 않는다.
10. 실패 중간 rollback, Project→Surface 잠금 순서, Add surface·createProject의 기존 원자성 유지.
11. 준비 도중 보관·권한 회수·리포/branch/포맷 변경: 적용 시 다시 판정하고 이전 설정으로 쓰지 않는다.
12. 포맷 누락 표면과 유효 표면 혼합/전부 누락: 모든 활성 표면의 이름·사유 반환.

Action 하네스에는 OWNER 성공·EDITOR forbidden·세션 만료, 게이트 순서, reader/snapshot 각 한 번,
공용 읽기 실패와 표면 실패의 반환, 실패 시 finally 무효화를 추가한다.

- **검증**: 변경 전 새 테스트 red. PG는 실제 저장·동시성을 검증하며 가짜 `$executeRaw`로 대신하지 않는다.

`─── test(import): cover sync ownership and CI precedence in Postgres ───`

## T6. 적용 경계·Server Action — green

0. **먼저 실행 식별자를 토큰으로 통일한다** (판정 D · `design.md` §7.1) — `markImportStarted` ·
   `finishImportRun` · `ApplyOptions` 시그니처와 호출부 다섯(`/api/push` 둘 · `runFirstIngest` 둘 ·
   `createProject` · `addSurfaceFromSnapshot` · `apply.ts`의 조건부 UPDATE). **읽는 쪽은 안 바꾼다** —
   전부 `lastImportStartedAt !== null`만 본다. ⚠️ **1번과 별도 커밋이다**: 둘 다 `/api/push`를 건드리므로
   한 커밋이면 push가 느려졌을 때 어느 쪽인지 못 가른다.
1. `applyPush`/`applyPushInTransaction`의 공통 적용 경계를 잠금 → 최신 키 조회 → 계획 → 쓰기로
   바꾼다. CI와 Sync가 Project→Surface 잠금을 같은 순서로 잡고 revision 증가까지 같은 tx로 확정한다.
   기존 열린 tx 경로는 새 tx를 만들지 않는다. 기존 CI 커밋 순서·포맷·보관도 tx 안에서 재확인한다.
   ⚠️ **전환 전후로 `/api/push`를 1446키급으로 실측하고 그 수를 `apply.ts` 주석에 남긴다** (판정 A).
   지금 그 주석이 배열형을 POSTMORTEM 2026-09-09으로 정당화하므로, 수를 안 갈아 끼우면 그 문장이
   거짓이 된다.
2. 필수 `refsMode`를 추가한다. 기존 소비자는 replace, Sync만 preserve. preserve는 refs SQL 자체를 생략한다.
3. 검증된 정상 0키용 내부 적용을 추가한다. 외부 PushPayload의 최소 키 수 제약은 유지한다.
4. 프로젝트 실행권의 원자적 선점·조건부 해제와 표면별 경쟁 판정을 구현한다. reader/blob 호출은 tx 밖이다.
5. `runRepositoryImport`를 추가한다. 포맷 누락·부분 실패·CI 미적용도 원결과로 수집한다.
6. `loadOpenPrUrl`을 `lib/projects/open-pr.ts`로 추출한다. 설정 화면은 URL 삼상태 유지,
   `checkOpenPullRequest`는 검증한 URL에서 번호를 얻어 객체/null/undefined를 반환한다.
7. 새 Action 둘의 `project:settings`를 `app/__tests__/entry-points.test.ts`에 이름별로 고정한다.
8. `lib/import/__tests__/boundaries.test.ts`에 Action 직접 조립 금지/헬퍼 내부 허용을 명시한다.
   `buildPushPayload`·`applyPush`·`applyPushInTransaction`을 전이 그래프 전체에서 금지하지 않는다.
   정상 재사용을 허용하고 Action 직결 변형은 실패하는 스캐너 반례도 둔다.
9. credential-separation과 client-graph 경계를 확인한다. 새 I/O 경로도 설치 자격증명을 사용한다.

- **검증**: T5 전체 green, `pnpm test`·`pnpm typecheck`·`pnpm test:projects:postgres` green.
  lib/push·keys·surfaces에 영향이 있으므로 격리 PG를 생략하지 않는다.
  **`/api/push` 실측치 둘(전·후)이 `apply.ts` 주석에 있다** — 없으면 이 태스크는 안 끝났다.

`─── refactor(import): identify import runs by token instead of start time ───`
`─── feat(import): implement repository sync with CI precedence ───`

## T7. 문구

`messages/en.tsx`에서 기존 AccessError/OnboardError/importFailureMessage를 재사용한다.
새 문장은 정상 0키를 포함한 완료, 포맷 누락, CI 우선 미적용, 사용처 보존 안내다.
⚠️ **헤드라인이 둘이다** — `… but {k} surfaces could not be read`(읽기 실패)와
`… but {k} surfaces were not replaced`(`superseded`·`invalid-format`). **뒤 둘에 `could not be read`를
쓰지 않는다** — 그 표면은 읽혔고 적용만 안 됐다(핸드오프가 잡은 자리).
⚠️ **`Alert.title`에서 마침표를 뗀다** (DESIGN §10 — 구두점 없는 문장 조각). 원인 줄은 유지한다.
⚠️ **`Try again`은 Home `2b` 배너의 기존 라벨을 재사용한다** — 새로 만들지 않는다.
미발송 집계는 정확한 손실 개수로 보장하지 않고 열린 PR·미확인 경고를 함께 둔다.
`Everything already matched the repository` 분기는 만들지 않는다. 파일 일부 실패와 표면 전체 실패를 구분한다.
결과 문장을 단언하는 사전 주석은 실제 적용 코드의 심볼을 가리킨다.
기존 `m.translations.banner.unsent`의 손실 경로에 수동 Sync도 포함한다.

- **검증**: 문구 스캐너 green, 결과별 문장과 코드 효과 대조. Send changes 링크 이름·목적지가 맞고
  발송만 하면 안전해진다는 표현이 없다. pull request 외 사용자 문구에 push/pull 용어를 새로 넣지 않는다.

`─── feat(i18n): describe repository sync outcomes ───`

## T8. 컴포넌트 준비 — DOM 테스트 먼저

T1 시안을 따른다. `sync-button.tsx`·`sync-result.tsx`의 공개 props와 Home이 소유할 원결과 상태를 준비한다.
Home 페이지 재작성은 이 태스크에 넣지 않는다.

먼저 `components/__tests__/sync-button.test.tsx`와 결과 테스트를 작성한다.

- EDITOR 버튼 부재, OWNER 실행, 연타 방지, 위험이 없어도 Dialog와 danger 버튼 유지.
- ⚠️ **실행 중 `[Sync]`는 `aria-disabled`이고 `disabled`가 아니다** — `disabled`면 포커스를 못 받아
  Dialog 닫은 뒤 복귀 대상이 사라진다(`design.md` §6). 클릭·Enter는 핸들러가 막는다.
  **`Button`의 `loading`이 `disabled`를 거는 것을 호출부에서 우회한다** — 프리미티브를 고치지 않는다.
- ⚠️ **확인 버튼 라벨이 트리거와 다르다** — 트리거 `Sync` / 확인 `Sync from repository`.
  접근 이름이 같으면 두 버튼이 구별되지 않는다(2026-09-15에 Archive Dialog의 그 모양으로
  프로젝트가 실제로 보관됐다). **접근 이름으로 두 버튼을 각각 찾는 단언을 둔다.**
- PR 조회 중 즉시 미확인 경고, 성공 null일 때만 해제, 실패 유지, 닫기→재오픈에서 이전 응답 무시.
- Send changes 링크 목적지, 취소·완료 후 트리거 포커스 복귀, 경고·결과의 live region.
- 원결과의 표면 이름·사유·오류 경로 유지, 정상 0키 완료, refresh 후 결과 유지용 호스트 계약.
- 클라이언트 그래프가 server-only 준비·적용 코드를 가져오지 않는다.

- **검증**: DOM red→green, `pnpm test`·`pnpm typecheck` 통과. 실제 Home refresh·시각 실측은 T11에 남긴다.

`─── feat(home): prepare repository sync controls ───`

## T9. project-home 연결 계약 — ✅ **완료** (2026-09-15, project-home T6)

Home 재작성은 project-home T6이 맡는다. 그 작업에서 아래를 함께 배선·검증한다.

1. 페이지의 `maxDuration = 60`을 명시한다.
2. OWNER의 [Sync]·실패 배너 [Try again]을 같은 확인 Dialog와 Action에 연결한다.
3. Home 머리가 원결과 상태를 유지하고 고정 Alert 자리에 전달한다.
4. T11·T12의 UI 검증을 project-home 검증과 함께 수행한다.

- **검증**: 실제 배선 전에는 준비 완료만 보고한다. UI가 없는 상태로 실측 통과·기능 완료를 기록하지 않는다.

## T10. 준비 게이트·preview — ✅ **완료** (2026-09-15, `196b57f`)

- `pnpm typecheck` · `pnpm test` · `pnpm build` · `pnpm test:projects:postgres` green.
- 새 스키마를 dev에 먼저 적용했는지 확인한다. prod는 `/merge`에서 additive-first로 반영한다.
- Codex는 로컬 커밋까지. dev push는 Claude Code `/push`가 맡는다.

- **검증**: 로컬 게이트·dev migration 통과 근거를 남긴다. T11~T13은 아직 미완료로 유지한다.

## T11. project-home에서 UI·시안·접근성 검증 — ⚠️ **미착수** (선행조건은 전부 충족됐다)

**선행조건: T1 시안 + T8 컴포넌트 + project-home T6 실제 배선 완료.** ✅ 셋 다 끝났다 —
막는 것이 없다.
`/design-sync`는 그 환경의 지원 런타임에서 project-home과 함께 수행한다.

- 미발송 0/N, 열린 PR, 조회 중/실패, 정상 0키, 부분 실패, CI 미적용, 연타, 결과 유지.
- computed style·접근성 트리로 시안과 대조하고 키보드 포커스·스크린리더 알림을 확인한다.
- PR 실패·늦은 응답은 DOM에서 Action promise를 제어해 자동 검증한다. 실제 UI에서는 로컬 테스트
  환경의 응답 제어로 재현하되 프로덕션 실패 토글을 추가하지 않는다. 재현 못 한 갈래는 미검증으로 남긴다.

- **검증**: 위 갈래별 실측 근거가 있다. DOM 통과를 실제 브라우저 검증으로 바꿔 적지 않는다.

## T12. project-home과 실물 왕복

**선행조건: T11.** `/l10n-roundtrip`을 폐기용 `i18n-format-check`에서 실행한다.
편집→Sync 덮어쓰기, 정상 0키, 일부 파일 실패, 사용처 보존 후 CI 갱신을 확인한다.
공유 리포 데이터 변경 전 복구 절차를 정하고 수행 후 복구한다. 포크인 `i18n-many-locales`·`i18n-none`은 쓰지 않는다.

- **검증**: 실제 결과와 복구를 기록한다. 레이스·stale는 T5의 PG 증거를 사용하고 수동 검증했다고 쓰지 않는다.

## T13. 정본 반영·기능 완료

**선행조건: T11·T12 완료.** 준비 단계에서는 이 태스크를 실행하지 않는다.

- PRODUCT: 구현 전 표기를 지우고 정상 0키·CI 우선·사용처 보존 결론을 반영한다.
- ARCHITECTURE: 프로젝트 실행권, 공통 적용 잠금, revision, 정상 0키 내부 계약과 배포 순서.
- DESIGN: 실제 시안 측정값·경고·결과·접근성 규칙.
- DIRECTORY: 추가 파일·책임 경계.
- 결론이 정본에 올라간 뒤에만 이 feature 디렉터리를 정리한다.

- **검증**: 코드·실측·정본이 같은 계약을 말하고 project-home에 남은 통합 검증이 없다.

## 비목표

자동 적재·웹훅·표면 선택·undo·번역 값 병합·SyncRun import 이력·최소 간격 게이트·Home 재작성은 추가하지 않는다.
