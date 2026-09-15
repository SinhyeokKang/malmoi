# Sync repository — tasks

**결정은 2026-09-15에 닫혔다** (`spec.md` §7의 사용자 판정 넷 + 구현 판단 셋).
차단 지점은 **T1의 시안 하나**이고, 그것도 T2~T6을 막지 않는다.

커밋 경계는 `───` 로 표시한다. `/ship`이 이 분리를 지킨다.

## 닫힌 결정 요약

| # | 결정 |
|---|---|
| 1 | 권한 = **OWNER만** (`project:settings`). EDITOR에게 버튼이 **없다**(비활성이 아니라 부재) |
| 2 | 범위 = **활성 표면 전부**, 표면마다 별도 트랜잭션·별도 예산·별도 결과 |
| 3 | Dialog의 수 = **미발송 + 열린 PR 별도 경고**. PR 조회 실패는 셋째 문장 |
| 4 | 미발송이 있으면 **`Send changes`를 먼저 권한다 — 막지는 않는다** |
| 구현 1 | 게이트는 `lastImportStartedAt` 위에 선다. `SyncRun`에 행을 만들지 않는다 |
| 구현 2 | `too-soon`(최소 간격)을 **안 만든다** — 재적재는 리포에 안 쓴다 |
| 구현 3 | 리포 정체성 대조를 **읽기 전**에 둔다 (`runFirstIngest`에는 없는 검사다) |

**project-home과의 의존**: 이 기능이 `runRepositoryImport`를 주면 project-home T6이 `[Sync]`를
배선한다. **반대 방향 의존은 없다** — 이 기능은 Home 재작성을 기다리지 않는다.

---

## T1. 시안 — Claude Design (⚠️ **T7·T8·T11이 여기 걸린다**)

`design-prompt.md`를 Claude Design에 넘겨 아트보드를 받는다. **확인 Dialog·결과 Alert·거부 갈래가
project-home 핸드오프에 없다** — 그래서 시안이 따로 필요하다.

- **T2~T6은 이것과 병렬로 간다** — 서버 층은 시안과 무관하다.
- ⚠️ **T8(UI)을 시안 없이 시작하지 않는다.** `ArchiveCard` 선례만 보고 지으면 형이 서기는 하는데,
  2026-09-13에 새 프로젝트 모달이 핸드오프와 **29곳** 어긋난 채 `pnpm test` 3,000개가 green이었다 —
  **그 어긋남을 T11에서 갚는 비용이 지금 기다리는 비용보다 크다.**
- **검증**: 아트보드 여섯(`design-prompt.md` 프롬프트의 "만들어 줄 아트보드 여섯")이 서고,
  그것이 `/design-sync`의 SoT가 된다.

---

## T0. ✅ 문서 정정 (2026-09-15에 **이미 했다**)

1. ✅ **`docs/PRODUCT.md` §3 권한표** — `리포 재적재(Sync)` 행 추가(OWNER O / EDITOR X) +
   Publish가 EDITOR에게 열린 것과 **방향이 갈리는 근거** 문단.
2. ✅ **`docs/PRODUCT.md` §7.5** — *"`ready`는 종점이지만 적재의 종점은 아니다"* — 재적재는 상태 전이가
   아니라 같은 상태에서 되풀이되는 동작이고, 첫 적재와 **진입 조건이 배타적**이다.
3. ✅ **`docs/features/project-home/spec.md` §8** — `[Sync]`에 **OWNER만** 표기, `2b`의 `[Try again]`도
   같은 Action이라 함께 갈린다, EDITOR 차이 절에 근거 문단, §4 비목표에 역포인터.

- ⚠️ **코드보다 앞서 적혔다** — PRODUCT의 기존 관용구(*"판정 2026-09-13 · **아직 안 만들었다**"*)를
  그대로 써서 그 사실을 문장에 남겼다. **구현이 끝나면 그 괄호를 지운다** (T13에서 확인).
- **검증**: `grep -n "리포 재적재" docs/PRODUCT.md` → 2건(표 + 근거 문단).

`─── docs(PRODUCT): record that re-importing a repository is owner-only ───`

---

## T2. 공용 헬퍼 추출 — 판정을 한 줄도 안 바꾼다 (⚠️ 먼저 red)

`design.md` §3. `runFirstIngest`의 본문 중 **리포 읽기 → 적재**를 `lib/import/surface.ts`로,
`readFiles`·`snapshotError`를 `lib/import/read.ts`로 옮긴다.

1. **테스트 먼저** — `lib/import/__tests__/surface.test.ts`에 **기존 `runFirstIngest` 단언을 그대로
   옮겨 적는다**. 이 테스트가 green이라는 것이 "추출이 판정을 안 바꿨다"의 증거다.
2. 추출. `runFirstIngest`가 **첫 소비자**가 된다 (`previousBaseLocale: null`).
3. `previousBaseLocale`을 **인자로 연다** — 리터럴 `null`을 박지 않는다 (`design.md` §3.2).

- ⚠️ **`lib/onboarding/`에 넣지 않는다** — 그 디렉터리는 GitHub을 모르는 것이 경계이고
  `credential-separation.test.ts`가 소스에서 그것을 센다.
- ⚠️ **§2.1의 함정 셋을 그대로 옮긴다** — `attempted`는 `templatePaths`에서 나온다 / 합집합을 넘긴다 /
  못 받은 것만 한 번 더 받는다. **주석도 함께 옮긴다** (그 주석이 과거 결함 셋의 기록이다).

- **검증**: `pnpm test` green (기존 온보딩 테스트 포함) · `pnpm typecheck` green.

`─── refactor(import): lift the repo-read-and-ingest body out of runFirstIngest ───`

---

## T3. 순수 함수 테스트 먼저 — `/tdd interface` (red)

`design.md` §4의 셋.

1. `lib/import/__tests__/plan.test.ts` — `planRepositoryImport`
   - **거부 순서**: readiness → identity → already-running → no-surfaces. 겹칠 때 어느 쪽이 이기는지.
   - **stale 회수**: `IMPORT_STALE_AFTER_SECONDS`를 지난 `lastImportStartedAt`은 무시한다.
     ⚠️ **경계 정각은 아직 stale이 아니다** (`planSyncStart`와 같은 부등호).
   - 포맷 셋(`adapterName`·`pathTemplate`·`baseLocale`) 중 하나라도 `null`인 표면은 **그 표면만 빠진다**.
   - 보관 표면 제외 · 남은 게 0이면 `no-surfaces`.
2. `lib/import/__tests__/confirm.test.ts` — `planImportConfirmation`
   - ⚠️ **`unsent === 0 ∧ openPr !== null` → `atRisk: true`.** 이 한 줄이 `spec.md` §6.2의 함정이다.
   - `openPr === undefined`가 `null`로 **안 접힌다**.
   - `recommendSend`는 `unsent > 0`에서만 true.
   - `atRisk: false`여도 Dialog를 건너뛰는 갈래가 **없다**.
3. `lib/import/__tests__/result.test.ts` — `summarizeImport`
   - `unreadable.length > 0 ∨ partial > 0`이면 tone이 `success`가 **아니다** (불변식 9).
   - **`unreadable`은 slug 목록이고 입력 순서를 지킨다** — 같은 결과가 같은 문장을 내야 한다.
   ⚠️ **T1(시안)을 기다리지 않는다** — 문장이 이름을 댈지는 화면의 선택이고 타입은 안 움직인다
   (`spec.md` §11.3).

- **검증**: `pnpm test` → 셋 다 **red**.

`─── test: pin the repository import gates, confirmation and summary ───`

---

## T4. 순수 함수 구현 (green)

`lib/import/{plan,confirm,result}.ts`.

- ⚠️ **`server-only`를 붙이지 않는다** (테스트가 직접 import하는 순수 모듈).
- ⚠️ **`IMPORT_STALE_AFTER_SECONDS`를 `lib/sync/plan.ts`에 넣지 않는다** — 상수는 소비자 옆에 둔다
  (그 파일의 주석이 그 규칙을 이미 적었다).
- **주석은 한국어로 "왜"만.** 특히 stale 상수가 `maxDuration`보다 넉넉해야 하는 이유.

- **검증**: `pnpm test` green · `pnpm typecheck` green.

`─── feat(import): add the pure judgements behind repository re-import ───`

---

## T5. 껍데기 — Server Action 둘

`design.md` §5.

1. **`loadOpenPrUrl`을 `lib/projects/open-pr.ts`로 올린다** — 설정 페이지 사설 함수였다.
   두 소비자(설정 · Dialog)가 같은 함수를 쓴다. **삼상태를 유지한다.**
2. `checkOpenPullRequest` — 읽기 전용 Action, `project:settings`.
3. `runRepositoryImport` — `app/(edit)/projects/actions.ts`.

- ⚠️ **리더·스냅샷은 한 번만** — 표면마다 다시 열지 않는다(토큰 발급이 호출마다 붙는다 ·
  표면마다 다른 head를 보게 된다).
- ⚠️ **표면 루프 안에서 던지지 않는다** — 하나의 실패가 나머지를 막지 않는다(결정 2).
  `IngestBudgetError`도 그 표면만 실패다.
- ⚠️ **`markImportStarted`는 인가·게이트 뒤다.** 거부된 호출을 "적재 중"으로 그리지 않는다.
- ⚠️ **`revalidatePath`는 `finally`다** (POSTMORTEM 2026-09-13).
- ⚠️ **`previousBaseLocale`에 저장된 `surface.baseLocale`을 넘긴다** — `null`이면 base 교체가
  조용히 묻힌다 (POSTMORTEM 2026-09-02).
- ⚠️ **`applyPush`(배열형)를 쓴다** — 바깥 트랜잭션이 없다 (POSTMORTEM 2026-09-14).
- ⚠️ **`projectId`로 좁힌다.** `slug`는 판정 입력이다.

- **검증**: `pnpm test` green · **`pnpm test:projects:postgres` 손으로** (표면 A 성공 / B 실패에서
  A의 키가 남는다 · 재적재 왕복).

`─── feat(import): add the server action that re-imports every active surface ───`

---

## T6. 방어선 — 격리 PG 검사에 갈래 추가

`pnpm test:projects:postgres`에 셋을 더한다. **하네스로는 못 재는 것들이다**
(POSTMORTEM 2026-09-05 — 메모리 `$transaction`에 직렬화가 없고 `$executeRaw`가 no-op이다).

1. **재적재 왕복** — 편집 → 재적재 → 그 셀이 리포 값이고 `updatedBy`가 `NULL`이다.
2. **표면 부분 실패** — A 성공 / B 실패에서 A의 키가 남고 B의 `lastImportError`가 선다.
3. **stale 회수** — `lastImportStartedAt`을 과거로 박아 두고 게이트가 통과시킨다.

- **검증**: `pnpm test:projects:postgres` green.

`─── test(postgres): cover re-import round trip, partial surface failure and stale recovery ───`

---

## T7. 문구 — `messages/en.tsx` (⚠️ **T1의 시안이 값을 확정한다**)

`spec.md` §10.

- ⚠️ **새 항목을 늘리기 전에 `onboardErrorMessage`·`errors.access.*`·`importFailureMessage`를 먼저
  본다** — 거부 문구 다섯 중 셋이 이미 있다 (POSTMORTEM 2026-09-14).
- ⚠️ **`Send changes first`의 이름이 그 화면의 실제 버튼과 같아야 한다**
  (`m.translations.publish.button` = `Send changes`). **`Publish`라고 쓰지 않는다.**
- ⚠️ **미발송 줄의 주석에 `lib/push/apply.ts`의 `"updatedBy" = NULL`을 심볼로 적는다**
  (POSTMORTEM 2026-09-14의 재발 방지 1).
- ⚠️ **`pull`·`push` 낱말 0** — 단 `pull request`는 GitHub 고유명사라 예외다
  (`archive.confirm.openPr`가 이미 그 형).
- ⚠️ 한글 UI 리터럴 금지 · 제품 이름은 소문자 `malmoi`.
- ⚠️ **기존 문구 하나를 정정한다 — `m.translations.banner.unsent`.** 지금 *"They can be lost if your
  developers push code first"*인데 이 기능이 **둘째 경로**를 만든다(OWNER의 `[Sync]`). 주어를 넓힌다.
  ⚠️ **같은 자리가 두 번째로 넓어지는 것이다** — 그 주석이 첫 번째 정정을 이미 기록하고 있다.

- ⏸ **결과 Alert 문장은 T1(시안)의 `4e`를 기다린다** — 표면 이름을 댈지가 거기서 정해진다
  (`spec.md` §11.3). **나머지 문구(Dialog·거부·버튼)는 기다리지 않는다.**

- **검증**: `pnpm test` green (두 스캐너 포함) +
  `grep -nE "will be replaced|won't be able|will stop|no longer" messages/en.tsx` → **새 문장이 참인지
  코드로 되짚는다**.

`─── feat(i18n): add the copy for repository sync and its confirmation ───`

---

## T8. UI — 버튼 + Dialog + 결과

`design.md` §6. `components/projects/sync-button.tsx` · `sync-result.tsx`.

- **`ArchiveCard`가 선례다** (`Dialog` + `DialogTrigger` + `DialogClose` + `useTransition`).
- ⚠️ **`components/ui/dialog.tsx`를 고치지 않는다** — 모달 넷이 함께 움직인다 (DESIGN §6.7).
- ⚠️ **결과 Alert는 버튼 컴포넌트가 아니라 머리가 든다** — `revalidatePath`가 다시 그리면서 방금 받은
  결과가 언마운트된다 (POSTMORTEM 2026-09-07).
- ⚠️ **EDITOR에게는 렌더하지 않는다** — 부재이지 비활성이 아니다 (DESIGN §6.69의 선례).
  **차단은 Action이 든다** — 그 사실을 주석에 남긴다.
- ⚠️ **`"use client"` 그래프가 `lib/import/`를 끌어오면 안 된다** — Action만 import한다
  (`components/__tests__/client-graph.test.ts`).
- ⚠️ 연타 방지 `loading={pending}`.

- **검증**: `pnpm test` green + `pnpm build` green (RSC 경계는 `tsc`가 못 본다).

`─── feat(home): add the sync button, its confirmation dialog and its result ───`

---

## T9. ⏭ Home 배선 — **이 기능이 하지 않는다** (2026-09-15 판정)

`app/(edit)/projects/[slug]/page.tsx`를 **project-home T6이 전면 재작성한다.** 같은 파일을 두 번
고치지 않으므로 **배선은 그쪽이 흡수한다.**

⚠️ **그래서 이 기능이 끝나도 화면에 버튼이 없다** — Action과 컴포넌트만 서 있다. **그 사실을
숨기지 않는다**: sync-repository만 머지된 구간에서 `[Sync]`는 존재하지 않는다.

**project-home T6에 넘긴 요구 넷** (그쪽 `tasks.md`에 적었다):

1. **`export const maxDuration = 60`** — ⚠️ **지금 그 파일에 없다.** Server Action은 자기를 부른 페이지
   세그먼트의 값을 쓰고, 없으면 프로젝트 기본값(300)이다 (ARCHITECTURE §3.1). **선언을 빠뜨리면
   증상이 "큰 리포에서만 실패"라 재현이 어렵다.**
2. `[Sync]`·`2b`의 `[Try again]`이 **OWNER에게만 렌더된다** (부재이지 비활성이 아니다).
3. `onClick`이 `runRepositoryImport`를 부르고, 그 앞에 확인 Dialog가 선다.
4. **결과 Alert 자리는 머리가 든다** — `revalidatePath`가 다시 그리는 분기 안에 두지 않는다
   (POSTMORTEM 2026-09-07).

- **검증**: project-home T6의 검증에 포함된다 — 로컬에서 OWNER로 `[Sync]`가 보이고 눌리며,
  EDITOR 계정에서는 **버튼이 없다**.

---

## T10. 게이트 → `/push`

- `pnpm typecheck` · `pnpm test` · `pnpm build` **셋 다 green**.
- `pnpm test:projects:postgres` **손으로 돌린다** (T5·T6).
- ⚠️ **`/db`는 필요 없다** — 스키마 변경이 0이다 (`design.md` §7).
- `/push` → dev · preview 배포. **프로덕션은 `/merge`가 따로 받는다.**

---

## T11. `/design-sync sync-repository` — 시안 대조 (⚠️ 생략 금지)

T10까지가 "동작하나"이고 여기가 "시안과 같은가"다.

- 실측은 눈이 아니라 **computed style + CDP 접근성 트리**다.
- **Dialog의 세 갈래를 실제로 만들어서 잰다** — 미발송 N · 열린 PR · PR 조회 실패.
  ⚠️ **셋째는 만드는 방법이 정해지지 않았다** (`design.md` §13) — **밟지 못했으면 "검증했다"고 쓰지
  않는다.**
- **`danger` 버튼과 `Send changes first` 링크의 포커스 순서**를 접근성 트리로 잰다.

---

## T12. 실물 왕복 — `/l10n-roundtrip`

⚠️ **폐기용 리포로만** (`i18n-format-check`). 일부러 깨진 로케일 파일을 넣어 **표면 부분 실패**를
실물로 밟고, **되돌리는 절차를 같이 적는다.**

⚠️ **`i18n-many-locales`·`i18n-none`은 쓰지 않는다** — 포크라 PR 흔적이 남는다.

---

## T13. 정본 반영 + 디렉터리 정리

1. `docs/ARCHITECTURE.md` — §5.5나 §3.1 옆에 **재적재 절**. ⚠️ **불변식 2가 "새 push 시점"을 얻었다는
   사실과, 그럼에도 병합 코드가 0이라는 제약**을 적는다. 게이트 순서 표도 여기로 올린다.
2. `docs/DESIGN.md` — 확인 Dialog의 측정값·세 갈래 문장 · **EDITOR에게 버튼이 부재하는 규칙**.
3. `docs/DIRECTORY.md` — `lib/import/`·`components/projects/sync-*.tsx`가 늘었다.
4. `docs/PRODUCT.md` — T0에서 이미 했다면 확인만.
5. **`docs/features/sync-repository/`를 지운다** — 결론이 정본으로 올라갔으면 근거 기록을 쌓아 두지
   않는다 (CLAUDE.md). 되살릴 일이 생기면 `git log`가 답한다.

`─── docs(ARCHITECTURE): … ───` / `─── docs(DESIGN): … ───` / `─── docs(DIRECTORY): … ───`

---

## 안 하는 것 (`spec.md` §4 재확인)

자동 재적재·스케줄 · push 웹훅 · 표면 선택 UI · 되돌리기/스냅샷 · `SyncRun` 행 · `too-soon` 게이트 ·
`repoAheadFiles`의 Home 사본 · Home 화면 재작성(project-home의 몫) · `archivedBy`류 실행자 컬럼 ·
적재 이력 테이블.
