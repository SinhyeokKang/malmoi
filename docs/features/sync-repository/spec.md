# Sync repository (기존 표면 재적재) — spec

**`docs/features/project-home/` §9.6이 분리한 선과제다.** Home 머리의 `[Sync]`가 부를 서버 경로를
만든다. Home은 버튼을 §8 표대로 그리기만 하고 **실행 Action은 이 문서의 산출물에 의존한다.**

**시안이 없다** — 확인 Dialog·결과 자리·거부 갈래는 project-home 핸드오프에 **아트보드가 없다**.
`design-prompt.md`가 Claude Design에 넘길 프롬프트이고, 시안이 서면 그것이 시각 정본이 된다.

## 0. 이 문서가 하는 일

**불변식 2를 정면으로 다룬다.** push가 리포 값으로 번역을 덮고 저자를 비우는 것(`ON CONFLICT DO
UPDATE`, `"updatedBy" = NULL`)이 이 리포의 헌법이고, 그 대가가 **편집 손실 창**이다. 지금 그 창은
개발자가 커밋을 푸시해야만 열리는데, 이 기능은 **그것을 화면의 버튼 하나로 만든다.**

그래서 이 문서가 답할 것은 "어떻게 적재하나"가 아니다 — **적재 경로는 이미 있다**(§2.1).
답할 것은 **"누가, 무엇을 알고, 무엇을 지나야 그 창을 여는가"** 다.

## 1. 사용자

**개발자(나)다. 번역 편집자는 대상이 아니고, 그것이 판정이다.**

- **개발자** — 리포가 앞섰는데 CI가 못 따라온 상황(워크플로 미설치·러너 실패·`[skip-malmoi-i18n]`)을
  화면에서 푼다. 지금 그 사람이 할 수 있는 일은 "커밋을 하나 더 밀어 CI를 깨우는 것"뿐이다.
- **번역 편집자** — **이 버튼을 못 본다** (§7 결정 1). 손실되는 편집의 당사자가 그 창을 스스로 여는
  경로를 만들지 않는다.

**project-home spec §8의 OWNER 전용 표기는 반영됐다** (`tasks.md` T0).

## 2. 문제 — 관측된 사실

### 2.1 기존 표면을 다시 적재하는 진입점이 0건이다

```
grep -rn "reimport\|resync\|importSurface" app lib   → 0
```

적재 경로 자체는 **셋 다 있고 전부 온보딩 안에 있다**:

| 자리 | 언제 도나 | 무엇을 적재하나 |
|---|---|---|
| `createProject` (`actions.ts`) | 프로젝트 생성 ④ | 표면 전부, All-or-Nothing |
| `addSurfaceFromSnapshot` (`lib/surfaces/create.ts`) | Add surface | **새로 만드는** 표면 하나 |
| `runFirstIngest` (`actions.ts:1057`) | 온보딩 ⑤⑥ · 설정의 [다시 시도] | `defaultSurface` 하나 |

⚠️ **셋 다 "처음"에만 돈다.** `runFirstIngest`가 그 경계를 명시적으로 지킨다:

> `readiness !== "awaiting_first_sync"` → `not-awaiting`
> *"⚠️ `ready`에서 돌리면 strict push라 번역자 편집을 버튼 하나로 덮는다. 그래서 `not-awaiting`이다."*

**이 기능은 그 거부를 의도적으로 여는 것이다.** 주석이 적은 위험은 참이고, 없어지지 않는다 —
**확인 Dialog가 그것을 사용자에게 옮긴다.**

### 2.2 "리포가 앞섰다"는 이미 화면에 있는데 푸는 버튼이 없다

목록의 `repo_ahead` 띠(`lib/projects/list.ts:156`)가 **로케일 파일 N개가 base에서 앞섰다**를 말한다.
재료는 `loadRemoteSignals`의 `compareToBase(lastCommitSha, baseBranch)`다.

**그 띠를 본 사람이 할 수 있는 일이 화면에 없다.** 답은 "리포에 워크플로를 붙이고 커밋을 미세요"
하나이고, 그것은 GitHub 웹훅을 비범위로 둔 대가다(PRODUCT §4.3 ②). ⚠️ **이 기능은 그 대가를
없애지 않는다** — 상시 경로는 계속 CI이고, 이것은 **사람이 눌러야 도는 보조 경로**다.

### 2.3 Sync 실패가 표면별로 남는데 되돌릴 자리가 없다

`TranslationSurface.lastImportError`(`ImportFailureCode` 6종)가 서면 설정 화면이 그것을 문장으로
그리는데, **`ready` 뒤에는 [다시 시도]가 `not-awaiting`이다.** 즉 화면이 "이 표면이 못 들어왔다"를
말하고 **되돌릴 버튼은 안 준다.** project-home `2b`(Sync 실패 배너 + `[Try again]`)가 그 자리를 여는데,
그 버튼이 부를 것이 없다.

### 2.4 Home의 `[Sync]`가 배선 없이 그려질 예정이다

project-home `tasks.md` T6이 *"`[Sync]`는 그리되 `onClick`은 T1의 산출물을 기다린다"*로 적혀 있고,
T1이 이 문서다. **서버·컴포넌트 준비가 끝나야 그 버튼을 배선할 수 있다.**

## 3. 완료 조건 — 검증 가능한 문장으로

**준비 완료와 기능 완료를 구분한다.** 이 기능은 서버 경로·Action·컴포넌트 연결 계약을 먼저 준비한다.
Home 배선과 실제 UI 검증은 project-home에서 함께 한다. 아래 UI 완료 조건과 T11~T13은
project-home T6 배선 완료에 의존하며, 그 전에는 기능 전체를 완료 처리하지 않는다.

### 3.1 경로

1. **Home의 `[Sync]`가 활성 표면 전부를 리포에서 다시 적재한다.** 성공하면 각 표면의
   `lastCommitSha`·`lastCommitAt`이 읽은 base head로 갱신되고 키·번역이 리포 값이 된다.
   적용 중 CI와의 경쟁은 §12의 CI 우선 계약을 따른다.
   → 격리 PG 검사(`pnpm test:projects:postgres`)에 재적재 왕복을 더한다.
2. **표면 하나의 실패가 나머지를 막지 않는다.** 표면마다 별도 트랜잭션·별도 예산이고, 결과가
   표면별로 돌아온다.
   → 순수 함수 테스트 + 격리 PG 검사(표면 A 성공 / B 실패에서 A의 키가 남는다).
3. **비어 있지 않은 적재는 기존 준비·적용을 재사용한다** — 공통 적용 경계에 잠금·revision·refs 보존을 더한다.
   정상 0키만 외부 payload와 분리된 내부 계약을 둔다 (`design.md` §3).
   → 소스 스캐너는 Action 본문의 `buildPushPayload`·`applyPush`·`applyPushInTransaction` 직접 호출을 금지한다.
   공용 헬퍼 내부의 준비·적용 호출은 허용하며, 정상 재사용 경로를 금지하는 전이 그래프 검사는 하지 않는다.

### 3.2 게이트

4. **게이트 여섯의 거부 순서가 고정이다** (§8 표). 순서가 곧 계약이다.
   → `planRepositoryImport`의 단위 테스트가 겹치는 조건마다 어느 쪽이 이기는지 단언한다.
5. **죽은 프로세스가 남긴 `lastImportStartedAt`이 Sync를 영구히 막지 않는다.**
   ⚠️ **지금은 막는다** — `failing()`·`meterSlot`이 그 컬럼을 `null` 여부로만 보고 **stale 기준이 없다.**
   → `IMPORT_STALE_AFTER_SECONDS`를 지난 표시는 게이트가 무시하고 덮어쓴다는 단위 테스트.
6. **EDITOR가 이 Action을 부르면 `forbidden`이다.** 버튼을 감추는 것은 편의이고 차단은 Action이 든다.
   → `entry-points.test.ts`가 이 Action의 permission을 이름으로 센다.

### 3.3 확인 Dialog — **여기가 이 기능의 방어선이다**

7. **Dialog가 대는 수가 실제로 덮이는 집합을 축소해 말하지 않는다.**
   `countUnpublished`는 **부분집합이다**(§6.2) — 열린 PR 안의 편집도 덮이는데 그 수에는 안 잡힌다.
   → `planImportConfirmation`의 단위 테스트가 `unsent = 0 ∧ openPr ≠ null`에서 **경고 줄이 선다**를 단언한다.
8. **PR 조회 실패를 "열린 PR 없음"으로 접지 않는다.** `undefined`는 "확인하지 못했다"이고 문장이 다르다.
   → 같은 테스트의 셋째 갈래 (`ArchiveCard`의 `openPrUrl` 삼상태와 같은 계약).
9. **미발송이 있으면 Dialog가 `Send changes`를 먼저 권한다** (§7 결정 4).
   ⚠️ **막지는 않는다** — 위험을 알린 뒤 OWNER가 리포 값으로 덮는 선택을 할 수 있다.
   PR 생성만으로 미발송 수가 내려갈 수 있으므로, 그 수를 PR 머지 여부로 읽지 않는다.
   → 단위 테스트가 `unsent > 0`에서 `recommendSend: true`를, `= 0`에서 `false`를 낸다.
10. **Dialog가 단언하는 결과가 그 결과를 내는 코드를 주석으로 지목한다** (POSTMORTEM 2026-09-14).
    → 사전 항목의 주석에 `applyPush`의 `"updatedBy" = NULL` 자리를 심볼로 적는다.

### 3.4 결과 보고

11. **`failed > 0`이면 성공 문구를 쓰지 않는다** (불변식 9). 표면 셋 중 하나가 못 들어왔으면 그 사실이
    문장에 있다.
    → `summarizeImport`의 단위 테스트.
12. **결과가 `router.refresh()`로 언마운트되지 않는 자리에 선다** (POSTMORTEM 2026-09-07 — 첫 적재
    [다시 시도]가 정확히 그 함정이었다). `PublishResult`와 같은 형: 상태는 머리가 들고 Alert는
    고정 자리다.

### 3.5 게이트(빌드)

13. `pnpm typecheck` · `pnpm test` · `pnpm build` 셋 다 green.
14. `pnpm test:projects:postgres`를 **손으로 돌린다** — `lib/push/apply.ts` 경로를 새 호출부가 지난다.

## 4. 비목표 — 이번에 안 하는 것

- **자동 재적재·스케줄.** 야간 cron은 Publish 전용이고(`/api/pull`), 여기에 반대 방향을 얹지 않는다.
  상시 경로는 계속 CI다 (PRODUCT §4.3 ②는 그대로다).
- **push 웹훅.** 위와 같은 항목. 이 기능은 그것의 대체가 아니라 **사람이 누르는 보조 경로**다.
- **표면 하나만 고르는 UI.** §7 결정 2가 "활성 표면 전부"로 닫았다.
- **되돌리기(undo)·스냅샷.** §7 결정 4의 근거 — 되돌리기를 만들면 그것이 곧 병합 로직이고 불변식 2와
  정면 충돌한다.
- **`SyncRun`에 행을 남기는 것.** 그 테이블은 Publish 전용이고 `trigger`·`status` enum이 그 가정 위에
  선다 (ARCHITECTURE §5.6 · project-home design §6.3이 같은 이유로 표면 사건을 거절했다).
- **최소 간격(`too-soon`) 게이트.** §7 구현 판단 2 — 안 만든다.
- **`repoAheadFiles`를 Home에서 재계산하는 것.** 목록이 이미 그 신호를 내고, Home에 셋째 사본을
  만들지 않는다.
- **Home 화면의 재작성.** project-home이 그 몫이고 이 문서는 **버튼이 부를 것**만 만든다.

## 5. 범위 게이트

`docs/PRODUCT.md` §4.2 대조 — **걸리지 않는다.**

| 의심 항목 | 판정 |
|---|---|
| **"GitHub push webhook"** (§4.3 ②) | **아니다.** 웹훅은 GitHub이 우리를 부르는 것이고 이건 사람이 누른다. 서명 검증·delivery 중복·이벤트 allowlist가 하나도 안 따라온다. §4.3 ②의 "2차에 열 조건"(워크플로 파일을 못 넣는 리포)은 **여전히 안 충족**이고, 이 기능이 그것을 충족시키지도 않는다 — 상시 적재가 아니다 |
| **"세밀한 RBAC"** (§4.2) | **아니다.** 기존 `project:settings` permission을 쓴다. 넷째 permission을 만들지 않는다 |
| **"승인 워크플로"** (§4.2) | **아니다.** 확인 Dialog는 한 사람이 자기 행동을 확인하는 것이지 남의 승인을 받는 것이 아니다 |

§4.3 다섯 중 걸리는 것 없음.

**PRODUCT에 이미 반영한 자리 둘** (`tasks.md` T0, 구현 전임을 표기):
1. **§3 권한표에 행을 추가했다** — `리포 재적재(Sync)  OWNER: O / EDITOR: X`. 표가 권한의 화면이므로
   새 OWNER 전용 동작은 거기 서야 한다.
2. **§7.5에 재적재 설명을 추가했다** — `ready` 이후에도 적재할 수 있고, 실패해도 기존
   `lastCommitSha`가 남아 readiness는 유지된다는 문장이다.

## 6. 불변식 대면

### 6.1 §0-2 — **정면으로 건드린다. 그것이 이 기능이다**

> push 시점 외에는 리포 값과 DB 값을 비교해 **승자를 고르지 않는다**.

**이 기능은 새 push 시점을 만든다.** 병합은 여전히 0이다 — 리포가 통째로 이긴다. 그래서
**불변식은 안 깨진다**: 깨지는 것은 "push 시점을 CI만 만든다"는 **관행**이지 불변식 문장이 아니다.

CLAUDE.md의 코어 원칙이 그 사실을 이미 적어 뒀다:

> **번역 값의 진실은 시점에 따라 갈린다** (strict 정책): push 시점엔 리포가 DB를 덮고 … 어느 순간에도
> **두 쪽을 병합하지 않는다** — 이 원칙이 실제로 지키는 것은 "단일 소유자"가 아니라 **"병합 없음"** 이다.

⚠️ **그래서 이 기능에 "기존 값과 DB 값을 견줘 고르는 코드"를 절대 넣지 않는다.** 되돌리기·머지·
"내 편집을 지킨다" 옵션이 전부 그 부류다 — 하나라도 들어오면 원칙이 깨진다. **대신 사람에게 묻는다.**

### 6.2 ⚠️ 덮이는 집합이 `countUnpublished`보다 넓다 — Dialog 설계의 전제

| 편집의 상태 | `countUnpublished`가 세나 | base 브랜치에 있나 | 재적재가 덮나 |
|---|:---:|:---:|:---:|
| 저장만 하고 안 보냄 | **O** | X | **O** |
| Publish로 PR을 열었고 **머지 전** | **X** (`updatedAt ≤ lastPulledAt`) | X | **O** |
| PR이 머지되어 CI가 다시 push함 | X | O | O (같은 값이라 무해) |

`Project.lastPulledAt`은 **PR 생성 시 캡처한 편집 시각으로** 전진한다(스킵에도 전진한다 — 스키마 주석). 그래서
**두 번째 줄이 조용히 빠진다.**

⚠️ **POSTMORTEM 2026-09-14가 이 축의 반대 방향이었다** — 그때는 확인 Dialog의 수가 동작이 바꾸는
집합의 **상위집합**이라 과장이 됐고, 재발 방지가 *"그 수가 세는 것과 그 동작이 바꾸는 것이 같은
집합인지 먼저 센다"* 였다. **이번은 부분집합이라 축소다.** 확인 화면에서 축소는 과장보다 나쁘다 —
사용자가 `0 edits will be replaced`를 읽고 누른다.

✅ **답**: 미발송 수 + **열린 PR 별도 경고 줄** (§7 결정 3). 두 신호 다 이미 있다
(`countUnpublished` · `loadRemoteSignals`의 `isPullRequestOpen`).

### 6.3 나머지

| 불변식 | 영향 |
|---|---|
| §0-1 소스 키는 코드가 진실 | **강화한다** — 리포를 다시 읽어 키를 맞춘다 |
| §0-3 키를 삭제하지 않는다 | 없음 — `applyPush`가 `orphaned`만 세운다 |
| §0-4 export 결정성 | 없음 — export를 안 만든다 |
| §0-5 `projectId`로 좁힌다 | ⚠️ 인가가 준 `projectId`·`surfaceId`만 쓴다. `slug`는 판정 입력이다 |
| §0-6 자격증명 셋 | ⚠️ **installation 토큰만** (`openRepoReader`). user-to-server는 `checkRepoAccess`의 정체성 대조에만 — `runFirstIngest`·Add surface와 같은 배선이다 |
| §0-8 `ready` 판정 | ⚠️ **바꾸지 않는다.** 재적재는 `ready`를 전제하고 실패해도 `ready`를 못 되돌린다(`lastCommitSha`가 남는다) |
| §0-9 버린 값을 숨기지 않는다 | ⚠️ **표면별로 센다.** `prepareFirstSnapshot`의 `failed`가 그것이고, 표면 셋 중 하나가 빠지면 문장이 그것을 말한다 |
| §0-11 리포 정체성 | ⚠️ `repositoryId`·`installationId` 대조가 읽기 **전**이다 — `runFirstIngest`는 그 대조가 없고 Add surface에만 있다 (§7 구현 판단 3) |

## 7. 결정

### 사용자 판정 넷 (2026-09-15) — 되돌리지 않는다

#### 1. ✅ 권한 — **OWNER만 (`project:settings`)**

`runFirstIngest`와 같은 permission이다.

- 근거: 이 동작은 **"리포 값으로 DB를 덮는다"**이고 리포 설정급이다. 손실되는 편집의 당사자가
  그 창을 스스로 여는 경로를 만들지 않는다.
- **project-home spec §8의 권한표는 정정됐다.**
  EDITOR에게는 버튼이 **없다**(비활성이 아니라 부재 — 누를 수 없는 버튼을 주지 않는다는
  `ProjectArchived`의 선례, DESIGN §6.69).
- ⚠️ **차단은 Action이 든다.** 버튼을 감추는 것은 편의다 (CLAUDE.md — 조건부 렌더는 차단이 아니다).

#### 2. ✅ 범위 — **활성 표면 전부, 표면별 결과**

- 근거: Home 머리의 버튼이 프로젝트 단위이고, 시안 `2b` 배너가 *"Keys from the other two surfaces
  came in"*으로 **표면별 부분 성공을 이미 전제한다.**
- 표면마다 **별도 트랜잭션 · 별도 예산**이다 (Add surface의 *"예산은 이 표면의 호출 하나에 적용한다"*와
  같은 규칙). 하나가 실패해도 나머지가 들어간다.
- ⚠️ **수용한 비용 — 시간 초과**: `readFiles`가 순차 다운로드이고 `maxDuration`이 60초다.
  표면 N개 × 로케일 파일이 그 안에 들어야 한다. `i18n-many-locales`(59로케일)급이면 잘린다.
  **막지 않고 관측한다** — §11.1.
- ⚠️ **Home 세그먼트에 `export const maxDuration = 60`이 없다** — 지금 `app/(edit)/projects/[slug]/page.tsx`에
  그 선언이 **없어서** 프로젝트 기본값 300으로 떨어진다. Server Action은 자기를 부른 페이지 세그먼트의
  값을 쓰므로 **선언을 더한다** (ARCHITECTURE §3.1).

#### 3. ✅ 확인 Dialog의 수 — **미발송 수 + 열린 PR 별도 경고**

§6.2가 근거다. 세 갈래:

| 상태 | 문장 |
|---|---|
| `unsent > 0` | `{n} edits that haven't been sent yet will be replaced by the repository.` |
| `openPr`가 객체 | + `Edits in pull request #{n} are not in {branch} yet — they will be replaced too.` |
| `openPr === undefined` | + `We haven't confirmed whether anything is still waiting in a pull request.` |

- ⚠️ **`undefined`를 `null`로 접지 않는다** — `ArchiveCard`의 `openPrUrl` 삼상태와 같은 계약이고
  POSTMORTEM 2026-09-03("실패한 조회를 '없음'으로 읽는다")이 그 근거다.
- ⚠️ **`unsent = 0 ∧ openPr ≠ null`에서도 경고가 선다.** 이 갈래가 §6.2의 함정 자체다.

#### 4. ✅ 방어 수준 — **Dialog + 미발송이 있으면 `Send changes`를 먼저 권한다 (막지는 않는다)**

- 권유는 **링크**다 — `routes.translations(slug)`로 보낸다. ⚠️ **문구가 부르는 컨트롤의 이름을
  그 화면의 실제 라벨과 맞춘다**: `m.translations.publish.button`이 `Send changes`이므로 이 문구도
  `Send changes`다 (POSTMORTEM 2026-09-14 — *"무엇을 누르라고 말하는 문구를 쓸 때 그 이름의 컨트롤이
  있는지 본다"*). ⚠️ **`Publish`라고 쓰지 않는다** — 그 낱말은 개념이고 버튼 이름이 아니다.
- **막지 않는 근거**: OWNER가 손실 위험을 확인한 뒤 리포 값으로 덮는 선택을 할 수 있게 한다.
  Publish는 PR 생성 시 캡처한 편집 시각으로 `lastPulledAt`을 전진시키므로 미발송 수가 내려갈 수 있다.
  편집 보존의 완료는 PR 머지이므로 `Send changes`만으로 안전해졌다고 안내하지 않는다.
- **되돌리기를 만들지 않는 근거**: 되돌리기는 "옛 DB 값과 새 리포 값 중 고르기"이고 그것이 곧 병합
  로직이다 — 불변식 2와 정면 충돌한다 (§6.1).

### 구현 판단 셋 (사용자 결정 아님)

#### 1. 프로젝트 실행권과 표면 진행 표시를 분리한다

`TranslationSurface.lastImportStartedAt`은 진행 표시이며 잠금이 아니다. 프로젝트 단위의 실행 토큰과
시작 시각을 짧은 DB 트랜잭션에서 원자적으로 확보하고 마지막 표면 처리까지 유지한다.
`IMPORT_STALE_AFTER_SECONDS = 300`을 초과한 실행권은 회수하며, 이전 토큰은 이후 적용·해제할 수 없다.
표면별 진행 표시에도 같은 stale 기준을 적용한다. 구체적인 필드와 저장 경계는 `design.md` §3.3·§7.
`SyncRun`은 계속 Publish 전용이고 적재 이력은 만들지 않는다.

⚠️ **실행 식별자는 토큰 한 벌이다** (2026-09-15 판정 D). 표면의 "내 실행인가"도 시작 시각 동일성이
아니라 토큰으로 답한다 — 두 벌로 두면 같은 질문에 답하는 방식이 둘이 되고 어느 쪽이 진실인지가
어디에도 안 적힌다. **대가는 기존 호출부 다섯이고 둘이 CI 경로다** (`design.md` §7.1).

⚠️ **A와 D가 `/api/push` 한 파일에 같은 사이클로 들어간다** — **커밋을 가른다**(토큰 통일 먼저,
대화형 전환 뒤). 한 커밋이면 CI push가 느려졌을 때 어느 쪽인지 못 가른다.

#### 2. `too-soon`(최소 간격)을 만들지 않는다

`PUBLISH_MIN_INTERVAL_SECONDS`의 정의가 *"리포에 쓴 뒤 쉬는 간격"*이다. **재적재는 리포에 안 쓴다** —
읽기만 한다. 동시 실행은 이번에 만드는 원자적 실행권으로 막는다. `openRepoReader`는 토큰 발급을 재사용하고
`checkDownloadBudget`은 다운로드 크기·개수를 제한한다. 둘을 API rate-limit 보장으로 해석하지 않는다. **쓰이지 않는 축을 미리 만들지 않는다** (CLAUDE.md).

기존 Publish 게이트를 Sync에 그대로 붙이지 않는다. Sync의 동시 실행은 전용 실행권이고
최소 간격 게이트는 없다. project-home이 연결할 거부 계약은 이 문서 §8을 따른다.

#### 3. 리포 정체성 대조를 읽기 **전**에 둔다

`runFirstIngest`에는 그 대조가 **없다**(`installationId`만 본다). Add surface에는 있다
(`repo.repositoryId !== project.repositoryId → "repo-replaced"`). ⚠️ **이 기능은 Add surface 쪽을 따른다** —
불변식 11이고, 대조가 없으면 리네임 뒤 남의 리포를 읽어 그 값으로 DB를 덮는다.

## 8. 게이트 — **순서가 계약이다**

| # | 게이트 | 거부 코드 | 왜 이 순서인가 |
|---|---|---|---|
| 1 | 세션 | `unauthorized`·`unavailable` | — |
| 2 | 인가 `project:settings` | `forbidden`·`not-found`·`archived` | ⚠️ **보관이 여기서 걸린다** — `planProjectAccess`가 권한 → 보관 순이라 EDITOR가 보관된 프로젝트를 치면 답이 `forbidden`이다(보관 여부가 권한 없는 사람에게 새지 않는다) |
| 3 | readiness | `not-ready` | `awaiting_first_sync`면 그 자리는 `runFirstIngest`다. 두 경로가 한 프로젝트에서 동시에 유효하지 않게 한다 |
| 4 | 연결·정체성 | `not-connected`·`repo-replaced` | 로컬 연결값 검사 후 GitHub으로 정체성을 대조한다. 로케일 blob 읽기보다 앞이다 |
| 5 | 동시 실행 | `already-running` | 유효한 프로젝트 실행권 또는 활성 표면의 진행 표시가 있으면 거부. 최종 판정과 실행권 획득은 원자적이다 |
| 6 | 적재 대상 | `no-surfaces` | 활성 표면이 0이면 돌 것이 없다 |

⚠️ **4가 3보다 뒤인 이유**: `not-ready`는 "아직 첫 적재 전"이고 그 화면의 답이 다르다(설정의
[Run first import]). 연결 상태를 먼저 말하면 사용자가 재연결을 하고도 같은 자리에 선다.

⚠️ **거부에 행을 만들지 않는다** — ARCHITECTURE §5.6.2와 같은 규칙. `already-running`의 증거는
**프로젝트 실행 토큰·시작 시각**이다. 표면 사이의 진행 표시 공백으로 실행권을 판단하지 않는다.

## 9. Action 계약 — Home이 부를 것

```ts
// app/(edit)/projects/actions.ts
export type SurfaceImportReason = ImportFailureCode | "resource-limit" | "invalid-format" | "superseded" | "lease-lost";
export type SurfaceImportResult = {
  surfaceSlug: string;
  status: "imported" | "partial" | "failed" | "superseded";
  /** 정상 빈 카탈로그도 imported/count: 0이다. */
  count: number;
  failed: number;
  reason: SurfaceImportReason | null;
  /** 기존 어댑터 오류에서 경로와 코드만 전달한다. 원문 예외는 노출하지 않는다. */
  errors: readonly { path: string; code: AdapterError["code"] }[];
};

// partial은 실제 적재 + 일부 실패, failed는 적용 실패, superseded는 CI 우선 또는 lease-lost 미적용.
// reason은 imported/partial에서 null이고 partial의 상세는 errors/failed에 남긴다.
export type RepositoryImportOutcome =
  | { ok: true; surfaces: SurfaceImportResult[] }
  | { ok: false; error: RepositoryImportError };

export type RepositoryImportError =
  | AccessError                    // unauthorized | unavailable | forbidden | not-found | archived
  | "invalid input"
  | "not-ready"
  | "not-connected"
  | "repo-replaced"
  | "already-running"
  | "no-surfaces"
  | OnboardError                   // tree-truncated | base-branch-missing | resource-limit | …
  | ConnectError;                  // checkRepoAccess preserves connection/reauthorization errors

export async function runRepositoryImport(raw: { slug: string }): Promise<RepositoryImportOutcome>;
```

⚠️ **이름이 `import`이고 `sync`가 아니다.** `lib/sync/`는 **Publish 실행**이고 `runSync`가 거기 있다 —
같은 이름을 쓰면 두 방향이 코드에서 섞인다. 화면만 `Sync`라고 부른다 (project-home §3.3 —
*"코드 식별자는 바꾸지 않는다"*).

⚠️ **던지지 않는다** — 직렬화 경계라 값으로 돌려준다 (`runFirstIngest`와 같은 형).

**부수 효과** (Action이 보장한다):
- 프로젝트 실행권 확보 → 표면별 준비 → 실행권·적재 revision 재검사와 데이터 적용을 같은 트랜잭션으로 확정.
  표면 진행·결과는 자기 시작 시각으로만 종료하며, 프로젝트 실행권은 전체 루프 종료 시 자기 토큰으로 해제한다.
- CI가 먼저 적재한 표면은 `superseded`로 보고하고 데이터·refs·CI의 결과 기록을 덮지 않는다.
- `revalidatePath('/projects/${slug}', "layout")` · `revalidatePath('/projects')` — **`finally`에 둔다**
  (POSTMORTEM 2026-09-13 — 실패 경로의 무효화가 빠져 있었다).

**PR 조회는 별도 read Action이다** (Dialog가 열릴 때):

```ts
export async function checkOpenPullRequest(raw: { slug: string }): Promise<{ url: string; number: number } | null | undefined>;
```

⚠️ **Home 렌더에서 GitHub을 부르지 않는다** — Home의 조회가 이미 늘어나고(project-home design §9.4)
이 값은 **Dialog를 연 사람만** 쓴다. `undefined`는 조회 실패다.

## 10. 신규 문구 — `messages/en.tsx`

⚠️ **`pull`·`push` 낱말을 쓰지 않는다** (project-home §3.3). 다만 **`pull request`는 GitHub의 고유명사라
예외다** — `archive.confirm.openPr`가 이미 그 형이다.

### 버튼·진행
- `Sync` (Home 머리 default 버튼 — project-home이 그린다)
- `Syncing…` ⚠️ 줄임표는 진행 중에만 (DESIGN §10) · 문자는 `…`(U+2026)

### 확인 Dialog
- 제목 — `Sync {name} from the repository?`
- 본문 — `malmoi will read the locale files on {branch} and replace what's in the app with them.`
- 미발송 줄 — `{n} edits that haven't been sent yet will be replaced.`
  ⚠️ **주석에 `lib/push/apply.ts`의 `"updatedBy" = NULL`을 심볼로 적는다** (완료 조건 10).
- 열린 PR 줄 — `Edits in pull request #{n} are not in {branch} yet — they will be replaced too.`
- PR 조회 실패 줄 — `We haven't confirmed whether anything is still waiting in a pull request.`
- 권유 링크 — `Send changes first` ⚠️ **`Send changes`가 그 화면의 실제 버튼 이름이다**
- 확인 버튼 — ⚠️ **머리의 트리거와 같은 이름을 쓰지 않는다** (2026-09-15 실측 사고). Archive Dialog가
  트리거·확인 둘 다 `Archive project`라, 셀렉터가 모호해진 재시도 클릭이 **확인 버튼을 눌러
  `bugshot-i18n-test-qa`를 실제로 보관시켰다**(복원함). 접근성 트리에서도 두 버튼이 구별되지 않는다.
  후보: `Sync from repository` (variant `danger`) · 취소 — `Cancel`
  ⚠️ **Archive Dialog도 같은 모양이다** — 고칠지는 별도 판단이고, 고친다면 **안 본 화면을 움직이는
  것이므로 별도 커밋**이다.

### 결과 Alert — **다섯 갈래이고 형은 둘** (핸드오프 §6 4e 확정)

⚠️ **`Alert.title`은 구두점 없는 문장 조각이다** (DESIGN §10) — **헤드라인에서 마침표를 뗀다.**
원인 줄은 문장이라 마침표를 유지한다.

**한 줄 — 성공 둘** (`success`)
- `Synced {n} keys from {branch}`
- **정상 0키도 같은 형이다** — `Synced 0 keys from {branch}` (기존 키는 orphaned 처리)
- 성공 표면이 하나뿐일 때도 같은 문장이다. 표면 이름을 헤드라인에 넣지 않는다 (§11.3).

**두 줄 — 표면별 사고 셋** (`warning`, 헤드라인 = 수 · 둘째 줄 = `{slug} — {message}`)

| 갈래 | 헤드라인 | 원인 줄 | 액션 |
|---|---|---|---|
| 읽기 실패 | `Synced {n} keys, but {k} surfaces could not be read` | `importFailureMessage` (6종 재사용) | `Try again` |
| `superseded` (CI 우선 미적용) | `Synced {n} keys, but {k} surfaces were not replaced` | `New repository data arrived while syncing. This surface was not replaced. Try again if needed.` | `Try again` |
| `invalid-format` (포맷 누락) | 같음 (`were not replaced`) | `This surface has no valid import format.` | **없음** |

⚠️ **`could not be read`를 뒤 둘에 쓰지 않는다** — 그 표면은 **읽혔고 적용만 안 됐다.** 한 문장으로
접으면 사용자가 리포의 파일을 의심한다. (핸드오프가 잡은 자리다.)

⚠️ **`Try again`은 Home `2b` 실패 배너와 같은 라벨·같은 Action이다** — 두 자리의 규칙을 하나로 둔다.
`invalid-format`만 액션이 없다: 포맷을 고치기 전에는 다시 눌러도 결과가 같다.

**없애는 것**
- ❌ `Everything already matched the repository` 류 — §12-7이 닫았고 **화면이 그 값을 만들 수도 없다**
  (strict라 `applyPush`의 `translationsFilled`가 재전송에서도 언제나 전 행이다 — 그 필드 주석이
  그렇게 적혀 있다). 변경이 없어도 `Synced {n} keys from {branch}`로 말한다. **사전에 만들지 않는다.**

⚠️ **파일 일부 실패(`partial`)와 표면 전체 실패를 구분한다** — 부분 실패를 `0 surfaces could not be read`로
표현하지 않는다.

### 거부
- `not-ready` — `This project hasn't finished its first import yet.`
- `not-connected` — `malmoi is not connected to this repository.`
- `repo-replaced` — 기존 `onboardErrorMessage`의 그것을 재사용
- `already-running` — `A sync is already running.`
- `no-surfaces` — `There's nothing to sync — this project has no active surfaces.`

⚠️ **재사용 확인**: `OnboardError`·`AccessError`의 문구는 이미 있다 (`onboardErrorMessage` ·
`errors.access.*`). **새 사전 항목을 늘리기 전에 그 둘을 먼저 본다** (POSTMORTEM 2026-09-14).

### ⚠️ 기존 문구 하나가 이 기능 때문에 거짓이 된다 — `m.translations.banner.unsent`

번역 화면의 **편집 손실 배너**가 지금 이렇게 말한다:

> `{n} changes not yet sent. They can be lost if your developers push code first — send them when
> you're done.`

**주어가 `your developers push code`뿐이다.** 이 기능이 서면 손실의 경로가 하나 더 생긴다 —
**프로젝트 OWNER가 `[Sync]`를 누르는 것**이고, 그것은 코드 push가 아니다.

- ⚠️ 그 사전 항목의 주석이 *"**주어가 편집자의 행동이다** — 처음 초안은 'code push'가 주어였고,
  실제 경계가 pull 실행이 아니라 **PR 머지**인 것도 담지 못했다"*로 이미 한 번 고쳐진 문장이다.
  **같은 자리를 두 번째로 넓히는 것이다.**
- **POSTMORTEM 2026-09-14의 부류다** — 결과를 단언하는 문구가 새 경로 때문에 낡았고, 그것을 잡는
  자동 검사가 **없다**(스캐너는 문장이 거기 있는지를 재지 참인지는 안 잰다).
- ✅ **판정**: `…if the repository is imported before your changes are merged.`처럼 수동 재적재도
  포함한다. 발송과 PR 머지를 구분하고 사용자 문구에 push 용어를 새로 넣지 않는다.
- ⚠️ **번역 화면을 다른 방향으로 고치지 않는다** — 문장 하나다.

## 11. 남은 결정 — 2026-09-15에 셋을 닫았다

### 11.1 ✅ 시간 초과 — **관측한다. 예산 분배를 선반영하지 않는다**

표면 N개 × 로케일이 60초를 넘기면 잘린다. 먼저 끝난 표면은 들어가 있고(표면마다 별도 트랜잭션),
못 끝낸 표면의 진행 표시와 프로젝트 실행권은 `IMPORT_STALE_AFTER_SECONDS` 뒤 **게이트가 회수한다.**
회수된 옛 실행은 실행 토큰 대조에서 적용을 거부당한다.

- 근거: **실측 없이 예산 분배 로직을 만드는 것 자체가 결함이다** (CLAUDE.md — *"확장성을 위한
  선반영은 그 자체가 결함이다"*). 지금 설치된 여섯 리포 중 **다표면 프로젝트가 0개**다.
- ⚠️ **수용한 비용**: 사용자가 "절반만 들어왔다"를 만나고 **화면이 그것을 설명하지 못한다** —
  잘린 실행은 결과 Alert 자체가 안 돌아온다(응답이 없다). 새로고침하면 들어간 표면만 보인다.
- **되돌리는 신호**: 다표면 프로젝트에서 이 일이 실제로 나면 그때 정한다 — 후보는 "남은 시간을 재서
  못 돌린 표면을 `skipped`로 보고"이고, 그때 `SurfaceImportResult`에 갈래가 하나 는다.

### 11.2 ✅ `lastPulledAt` — **건드리지 않는다**

그 컬럼의 뜻은 *"Publish가 마지막으로 캡처한 `max(updatedAt)`"* 이고 **1층 스킵의 비교 대상**이다.
재적재가 전진시키면 그 문장이 거짓이 되고, **미발송 술어 세 벌이 전부 그 기준 위에 선다.**

- ⚠️ **재적재 직후 미발송이 0이 되는 것은 `updatedBy = NULL` 때문이지 이 컬럼 때문이 아니다.**
  두 원인을 섞어 읽으면 "재적재가 발송 기준을 옮겼다"는 틀린 모델이 생긴다.
- **수용한 비용**: 재적재 직후의 Publish가 1층에서 안 스킵되어 GitHub 왕복을 한 번 더 한다.
  모든 표면이 정상 재적재돼 export 바이트가 같다면 2층 blob SHA 비교가 스킵한다. 부분 실패·
  CI 우선 미적용·재적재 뒤 새 편집이 있는 경우까지 스킵을 보장하지 않는다.

### 11.3 ✅ 결과에는 실패한 표면 이름과 원인을 표시한다

포맷이 없어서 적재에서 제외된 활성 표면도 실패 결과에 포함한다. 성공 표면의 이름을 얼마나
펼칠지는 시안이 정하지만, 실패·부분 실패·CI 우선 미적용의 표면 이름과 사유는 생략하지 않는다.
`SurfaceImportResult` 원결과를 UI까지 유지하고 요약만으로 오류 정보를 버리지 않는다.

## 12. feature-review 합의 (2026-09-15)

1. **동일 프로젝트의 Sync는 하나만 실행한다.** 원자적 선점부터 전체 종료까지 실행권을 유지한다.
   실제 PG에서 동시 요청 두 개와 stale 회수 뒤 이전 실행의 적용·해제 거부를 검사한다.
2. **CI가 우선이다.** Sync의 리포 읽기 전보다 표면의 적재 revision이 바뀌면 그 표면을 적용하지 않는다.
   스냅샷 시각만 비교하지 않으므로 의도된 force-push는 수용하되 실행 중 CI 결과는 되돌리지 않는다.
3. **사용처는 보존한다.** Sync는 `KeyRef`를 읽어서 다시 쓰거나 지우지 않는다. 다음 CI가 갱신한다.
   기존 사용처가 현 리포와 다를 수 있음을 결과의 보조 문구로 알리고 새로 스캔했다고 표현하지 않는다.
4. **PR 조회 시작부터 미확인 경고를 표시한다.** 성공한 조회가 `null`일 때만 경고를 없앤다.
   조회 실패도 실행을 막지는 않는다. 닫기·재오픈·늦은 응답에서 이전 조회가 새 상태를 덮지 않게 한다.
5. **정상적으로 확인한 0키는 성공이다.** 기존 키 전부를 orphaned로 표시하며 번역과 사용처는 삭제하지 않는다.
   다운로드·파싱 실패, 포맷 불일치, 대상 파일 미발견은 정상 0키로 취급하지 않는다 (`design.md` §3.5).
6. **적재 불가능한 활성 표면도 이름과 실패 사유를 보고한다.** 보관 표면만 범위에서 제외한다.
7. **no changes도 완료다.** 별도 값 비교·동일 여부 판정이나 “이미 같았다”는 문구를 만들지 않는다.
8. **서버·컴포넌트 준비를 먼저 하고 UI 검증은 project-home에서 함께 한다.** T11~T13은 배선 뒤에 완료한다.
9. **접근성 동작을 기본 계약에 포함한다.** 경고·결과 알림, Dialog 닫기 후 Sync 버튼 포커스 복귀를 검증한다.

남은 타입·문구·테스트 순서 등의 명백한 정정은 사용자 승인으로 일괄 반영한다. 이 문서의 합의는
구현 계획이며, 코드·DB 변경이나 UI 검증을 이미 끝냈다는 뜻이 아니다.
