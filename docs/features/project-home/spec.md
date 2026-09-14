# Project Home 재편 — spec

**SoT**: Claude Design 프로젝트 `b99d54cd-3034-44f1-8446-0a864da9d767`의 `design_handoff_project_home/`
(`README.md` · `Project Home.dc.html` 아트보드 여섯 · `project-home.prompt.md`).
**시안이 정본이고 구현이 따라간다.** 값 대조·실측은 구현 시점에 `/design-sync`가 든다.

## 0. 이 문서가 하는 일

핸드오프가 **"구현이 아니라 스펙 문서화"**를 명시했다. 여기서 결론을 내리지 않는 것이 규칙이다 —
§9의 열린 결정은 그대로 열어 둔다.

## 1. 사용자

**둘 다이고, 주는 번역 편집자다.**

- **번역 편집자(비개발자)** — 이 화면이 착지점이다. 답할 질문은 "지금 내가 뭘 하면 되나" 하나다.
- **개발자(나)** — 리포와 DB 사이가 지금 정상인가(Sync 실패·미연결)를 여기서 처음 만난다.

둘의 요구가 상충하는 자리가 하나다: 편집자는 **수**를 원하고 개발자는 **사건**을 원한다.
시안의 판정은 "카드 넷이 수를 들고, 항목·로그가 사건을 든다"로 그 둘을 분리한 것이다.

## 2. 문제 — 관측된 사실

### 2.1 ⚠️ 핸드오프의 "현재 코드" 열이 리포를 가리키지 않는다

README의 대조표가 *"요약 넷 · 할 일 셋 · 표면 셋 · 로그 여덟"*, *"`Not sent yet 24`와
`24 edits have not been sent yet`이 공존"*, *"파랑이 11군데"*를 **현재 코드**로 적었다.
**리포에는 그런 화면이 없다.** 캔버스의 근거 열이 그 출처를 스스로 밝힌다 —
*"6b(`Project Detail.dc.html`의 `6b`)에서 … 같은 말을 두 번 하던 문제"*. 즉 **이전 시안**이다.

`grep -n "Not sent yet" messages/en.tsx` → 0건. `ACTIVITY_LIMIT = 8`만 실제로 일치한다.

**실제 현재 코드** (`app/(edit)/projects/[slug]/page.tsx`, 240줄):

| 블록 | 무엇 | 출처 |
|---|---|---|
| 머리 | 프로젝트 이름 + primary `[Open translations]` | — |
| `Languages` | **표면 × 로케일** 행 목록. 행 = `?locales=` 링크, `needsReview` 배지 + `n% (a/b)` | `activeLocaleProgress` |
| `Recent activity` | 8건 고정. 갈래 셋(`edit`·`push`·`publish`) | `recentActivity` |

**요약 카드도, 할 일 목록도, 표면 목록 블록도 없다.** 그래서 이 작업은 *"블록을 재배치한다"*가
아니라 **블록 셋 중 둘을 새로 만들고 하나를 갈아엎는 것**이다. 규모 판단이 여기서 갈린다.

### 2.2 실제로 관측되는 불편 넷

1. **프로젝트 전체 합계를 말하는 자리가 없다.** 진행률이 표면×로케일 행이라 표면 셋 × 로케일 셋이면
   9행이고, "이 프로젝트에 안 보낸 게 몇 개인가"는 번역 화면 툴바(= **한 표면의 수**)로 가야 안다.
   ⚠️ **`page.tsx`의 주석 *"다른 화면의 지표를 복제하지 않는다"*가 표면이 여럿이 되면서 성립하지
   않는다** — 프로젝트 합계를 말할 자리가 Home밖에 없다. 핸드오프의 코드 주석 정정이 이것이다.
2. **"주목이 필요한 것"이 화면에 없다.** Sync가 실패해 표면 하나가 안 들어와도 Home은 조용하다 —
   그 사실은 설정 화면(`settings/page.tsx:118`의 `failing()`)에만 있다.
3. **활동 상한이 건수(8)라 "오늘 조용했다"와 "7일 조용했다"가 구별되지 않는다.**
4. **상태 여섯 중 셋이 화면에 없다.** 보관은 `ProjectArchived` 전면 교체, 첫 적재 전은
   `ProjectNotReady` 전면 교체이고, **미연결·Sync 실패는 Home에 표시가 아예 없다.**

## 3. 완료 조건 — 검증 가능한 문장으로

### 3.1 구조

1. `/projects/<slug>`가 **카드 넷 · `Needs your attention` · `Recent logs` · 오른쪽 `Project` 메타 열**로
   렌더된다. `Languages` 블록과 `[Open translations]` primary가 사라진다.
   → `app/__tests__/screens.test.ts`가 소스로 센다 (기존 관용구).
2. **상태 여섯이 각각 렌더된다** — 기본 · 빈 · Sync 실패 · 미연결 · 보관 · 로딩.
   → 상태 판정이 순수 함수이고 그 함수의 단위 테스트가 여섯 갈래를 전부 든다.
3. **블록 수가 상태에 따라 흔들리지 않는다** — 빈 상태·보관에서도 카드 넷과 카드 둘이 자리를
   지키고 각자 자기 `EmptyState`를 든다.
   → DOM 테스트가 여섯 상태에서 같은 랜드마크 집합을 센다.

### 3.2 수

4. **카드 넷의 수 = 표면별 값의 합**이고, 별도 집계 경로를 만들지 않는다.
   → 네 수를 만드는 순수 함수의 단위 테스트 + `pnpm test:projects:postgres`(미발송 술어 세 벌이
   같은 행을 세나를 재는 유일한 자리).
5. **세 셀 구간(`To translate` · `To review` · `To send`)이 서로 겹치지 않는다.**
   → 순수 함수 테스트가 겹침 0을 단언한다. ⚠️ **첫 칸은 단위가 다르다** — §7.1 참조.
6. **`To review`·`To send`의 정의가 목록 화면(`loadProjectSummaries`)의 것과 같은 술어다.**
   → 같은 함수를 부르는 것으로 만족시키고, 두 벌이 되면 red가 되는 테스트를 둔다.

### 3.3 표현

7. **화면에 `pull`·`push` 낱말이 0이다.** 표시는 `Sync`(리포 → 앱) · `Publish`(앱 → 리포) 둘뿐이다.
   → `messages/en.tsx`의 Home 구역을 훑는 소스 스캐너. **코드 식별자는 바꾸지 않는다.**
8. **Home 소스에 고정폭 글꼴이 0이다.** → `grep -rn "text-mono" app/(edit)/projects/[slug]/page.tsx` 등
   Home 그래프에서 0건을 세는 스캐너.
9. **파랑이 다섯 자리다** — 유입 카드 · 로그의 sync 줄 · 로그의 PR 번호 · 메타의 리포 주소 ·
   메타의 PR 번호. → 소스 스캐너가 Home 그래프의 파랑 리터럴을 센다.
   ⚠️ **스캐너를 만들면 일부러 깨뜨려 red를 확인한다** (design-sync §6).

### 3.4 게이트

10. `pnpm typecheck` · `pnpm test` · `pnpm build` 셋 다 green.
11. 스키마를 건드렸으면 `pnpm test:projects:postgres`도 손으로 돌린다.

## 4. 비목표 — 이번에 안 하는 것

- **`Stat` 프리미티브 정리.** 캔버스에 `Stat.dc.html`이 있지만 `components/ui/`에 `Stat`은 **없다**.
  카운트 카드는 새 프리미티브 하나로 끝내고, 존재하지 않는 것과의 통합을 만들지 않는다.
- **파랑 규칙을 화면 밖으로 확장하는 것.** Home에만 적용한다 (prompt §7의 열린 결정 — §9.7).
- **`/logs` 화면 개편.** `All logs`의 목적지는 지금 그대로다.
- **`archivedBy` 컬럼.** 메타의 `Archived … · by Sinhyeok`에서 **`· by …`를 뺀다** (§9.4 판정).
- **[Sync]의 재적재 Server Action.** 별도 `/feature`의 선과제다 (§9.6) — Home은 버튼만 그린다.
- **primary 비활성 스타일** — 커밋 `25d3a9e`가 이미 처리했다. 핸드오프 §11은 **닫힌 항목**이다.
- **표면 목록 블록의 부활 · 요약 줄 복원 · 항목의 미루기/지우기 · Home의 필터 · pull/push 낱말** —
  핸드오프가 닫은 결정이다. 다시 열지 않는다.

## 5. 범위 게이트

`docs/PRODUCT.md` §4.2 대조 — **걸리지 않는다.** 확인한 자리 둘:

| 의심 항목 | 판정 |
|---|---|
| **"승인 워크플로(draft→reviewed)"** (§4.2 비범위) | **아니다.** `To review`는 `Translation.needsReview`이고, 그것은 **push가 `sourceHash` 변경을 감지해 세우는 파생 플래그**다(스키마 주석). 사람이 넘기는 승인 단계가 아니다. 핸드오프 자신도 *"검토자 개념이 없다"*고 적고 그 문장을 뺐다 |
| **"세밀한 RBAC"** (§4.2 비범위) | **아니다.** 역할은 그대로 둘(`lib/auth/permission.ts`)이고, 시안은 EDITOR에게 `[Reconnect]`를 감출 뿐이다 — 그 판정은 이미 있는 `project:settings` permission이다 |

§4.3(2차에 열어두는 것) 다섯 중 걸리는 것 없음.

⚠️ **PRODUCT 갱신이 필요한 자리 하나** — §7.7 결정 2(*"다른 화면의 지표를 복제하지 않는다"*)를
정정해야 한다. 표면이 여럿이 된 뒤로 툴바의 수는 한 표면의 수이고, 프로젝트 합계를 말할 자리가
Home밖에 없다. **합계는 표면별 값의 합으로만 만든다**는 제약을 함께 적는다.
(이 문서는 PRODUCT를 직접 고치지 않는다 — `tasks.md` T0이 그 몫이다.)

## 6. 코어 설계 원칙과의 충돌 — ⚠️ 하나 있고, **선과제로 분리했다**

**[Sync] 버튼에 서버 경로가 없고, 만들면 ARCHITECTURE §0 불변식 2를 정면으로 건드린다.**

> ✅ **2026-09-15 판정 (§9.6)**: 재적재 경로를 **만든다. 단 별도 `/feature`의 선과제다.**
> 불변식 2와의 대면·확인 Dialog·문구는 **그쪽 스펙이 든다.** 이 스펙은 `[Sync]`를 §8 표대로
> 그리되 실행 Action은 선과제의 산출물에 의존한다.

- 리포 → 앱은 **CI가 미는 경로**다(`/api/push`). 앱이 리포를 읽어 적재하는 코드는 **온보딩에만**
  있다 — `lib/surfaces/create.ts`, `app/(edit)/projects/actions.ts:961`(Add surface). 기존 표면을
  다시 적재하는 진입점은 0건이다 (`grep -rn "reimport\|resync\|importSurface"` → 0).
- 불변식 2는 **push가 리포 값으로 번역을 덮고 저자를 비운다**(`ON CONFLICT DO UPDATE`,
  `"updatedBy" = NULL`). 그 대가가 **편집 손실 창**이다 — 번역자가 편집한 뒤 pull PR이 머지되기
  전에 코드가 푸시되면 그 편집이 사라진다.
- **[Sync]는 그 창을 버튼 하나로 만든다.** 지금은 개발자가 커밋을 푸시해야만 열리는 창인데,
  번역 편집자가 화면에서 누를 수 있게 된다.

**이 스펙은 여기서 결론을 내지 않는다** — §9.1의 열린 결정이다. 다만 **어느 답을 고르든 화면은
성립한다**: 캔버스의 `2a`는 [Sync]가 눌리지 않아도 그려지고, 핸드오프의 Fidelity가 *"mid — 서버 변경
없이도 화면은 성립한다"*라고 적은 것이 이 뜻이다.

## 7. 시안 ↔ 코드 불일치 — 핸드오프가 잘못 짚은 자리 여섯

**시안의 시각 판정은 그대로 정본이다.** 아래는 핸드오프가 인용한 **코드 사실**의 정정이다.

### 7.1 ⚠️ 카드 넷은 "같은 모집단의 네 구간"이 아니다

캔버스 근거 열: *"같은 모집단의 네 구간이고 칸 하나가 지나가는 경로다."*
**첫 칸만 단위가 다르다** — 캔버스 자신의 보조 줄이 그것을 적는다:

| 카드 | 단위 | 술어 |
|---|---|---|
| `New from GitHub` | **keys** | `StringKey.createdAt > Project.lastPulledAt` |
| `To translate` | cells | `value = ''` |
| `To review` | cells | `needsReview = true` |
| `To send` | cells | `updatedBy IS NOT NULL AND updatedAt > lastPulledAt` |

뒤 셋은 실제로 **배타적이다**(검증: `saveTranslation`이 저장 시 `needsReview: false` + `updatedBy`를
같이 쓰고, push는 `updatedBy = NULL` + `needsReview = true`를 같이 쓴다 — 둘이 동시에 참일 수 없다).
**첫 칸은 뒤 셋과 겹친다** — 새 키의 빈 칸은 `New`에도 `To translate`에도 센다.

→ 스펙이 답할 것(prompt §3)의 답: **겹치지 않음을 보장할 수 없고, 보장할 필요도 없다.**
단위가 다르다는 것을 보조 줄이 이미 말한다. 완료 조건 5를 **세 셀 구간에만** 건다.

### 7.2 ⚠️ Sync 실패의 `errorCode`는 `SyncErrorCode`가 아니다

캔버스 `2b` 근거 열: *"실패 원인 문장은 `SyncRun.errorCode`로 갈린다."* **반대다.**

| 방향 | 시안 낱말 | 코드 | 실패 저장 자리 | 코드 집합 |
|---|---|---|---|---|
| 리포 → 앱 | `Sync` | `push` / 온보딩 적재 | **`TranslationSurface.lastImportError`** | `ImportFailureCode` **6종** (`lib/projects/import-status.ts`) |
| 앱 → 리포 | `Publish` | `pull` / `runSync` | `SyncRun.errorCode` | `SyncErrorCode` **7종** (`lib/sync/plan.ts`) |

`2b` 배너가 읽어야 하는 것은 **`lastImportError`이고 그것은 표면별이다** — 캔버스가 *"malmoi could
not read `emails/i18n` on `main`. Keys from the other two surfaces came in."*이라고 표면을 지목하는
것이 그 컬럼과 정확히 맞는다. 문장은 이미 있다 (`importFailureMessage` + `m.projects.importFailure.*` 6개).

### 7.3 ⚠️ `already-running` · `too-soon`은 Sync 게이트가 아니라 **Publish** 게이트다

`lib/pull/message.ts:35`의 `SyncGateError`이고 문구는 `m.translations.publish.gate.*`다.
prompt §10이 그것을 [Sync]에 붙였는데, 그 자리에 옮겨 붙이려면 [Sync]의 실행 경로부터 있어야 한다(§6).
**게이트 거부가 토스트급이라는 판정 자체는 유효하다** — 화면 상태가 바뀌지 않았기 때문이라는 근거가
방향과 무관하다.

### 7.4 `planProjectAccess`는 `lib/auth/permission.ts`가 아니라 **`lib/auth/access.ts:42`**다

`permission.ts`는 `canPerform`(역할 → permission 표)만 든다. 보관·역할 판정은 `access.ts`이고
껍데기가 `lib/auth/query.ts`, 진입점이 `lib/auth/session.ts`의 `requireProjectAccess`다.

### 7.5 `app/(edit)/projects/[slug]/__tests__`는 **존재하지 않는다**

핸드오프의 "영향받는 테스트"에 적혔지만 그 디렉터리가 없다. 실재하는 것은
`lib/home/__tests__/overview.test.ts` · `app/__tests__/screens.test.ts` ·
`app/(edit)/__tests__/shell-layout.test.ts` · `components/__tests__/focus-ring.test.ts`다.

### 7.6 `Stat` 프리미티브는 코드에 없다

`components/ui/`에 `stat.tsx`가 없다. 캔버스의 *"`Stat`과 다른 형이다"*는 **디자인 시스템 캔버스
안에서만** 참인 비교다. 카운트 카드는 비교 대상 없이 새로 만든다.

## 8. 상태 표 — 여섯 상태 × 화면 요소

역할이 갈리는 칸만 `OWNER` / `EDITOR`로 나눈다. 나머지는 같다.

| | 머리 버튼 | 배너 | 카드 넷 | 항목 카드 | 로그 카드 | 메타 열 |
|---|---|---|---|---|---|---|
| **`2a` 기본** | `[Sync]` default · `[Publish]` primary + 개수 배지 | 없음 | 값 + 보조 줄. 첫 칸 파랑, `To review` 글리프 amber | 머리 + 카운트 pill + 항목 3행 | 레일 5줄 + `[All logs ›]` 중앙 | 9행 + `[Project settings ›]` |
| **`2a` 빈** | `[Sync]` 활성 · `[Publish]` **muted 비활성**, 배지 없음 | 없음 | **0으로 남는다**. 수치·글리프 `#737373`, 보조 줄이 근거를 바꿔 댄다 | `EmptyState`(글리프 check · 액션 없음). **pill 없음** | `EmptyState`. 설명문이 **"지난 7일"**을 적는다 | 그대로. `Last sync`·`Last publish` 시각만 다르다 |
| **`2b` Sync 실패** | 둘 다 활성 (**publish를 막지 않는다**) | **danger**, `[Try again]` default | **마지막 성공 값 유지.** 첫 칸 보조 줄 `last good sync 1d ago` | 파서 항목을 **뺀다** → 카운트 3 → 2 | 첫 줄 점만 `#dc2626`. 배너가 자리를 먹어 **4~3줄** | `Last sync`가 성공 시각 + 실패 시각 둘 |
| **`2c` 미연결** | 둘 다 **비활성**. `[Reconnect]`가 primary (**OWNER만**) | **amber** | 값 유지, 보조 줄이 `as of …` / `cannot be sent while paused` | **그대로** (번역·검토는 연결과 무관) | 그대로, 줄 수만 줄어든다 | 리포 행에 `Not connected` pill + **링크 사라짐** |
| **`2d` 보관** | 둘 다 비활성. `[Restore project]` primary (**확인 없음**) | **amber** | 값 유지, 보조 줄 `frozen at archive` / `never sent` | `EmptyState`(글리프 **archive**, 문장은 "할 수 없다") | 그대로 | **`Archived` 행이 는다** |
| **`2e` 로딩** | 둘 다 비활성 | 없음 | 골격 + 막대 | 골격 3행 | 골격 5줄, `All logs`는 `#737373` | 골격 9행 |

**EDITOR 차이 (전 상태 공통)**:
- `2c`: `[Reconnect]` 없음, 배너 문장이 "관리자에게 요청"으로 바뀐다 (`project:settings` 불가).
- `2d`: `[Restore project]` 없음, 같은 형태로 문장이 바뀐다.
- 메타의 `[Project settings ›]`: **노출은 편의이고 차단은 페이지가 든다** — 링크를 감추더라도
  `/settings`의 `requireProjectAccess({ permission: "project:settings" })`가 실제 방어선이다
  (CLAUDE.md — 조건부 렌더는 차단이 아니다).
- `[Publish]`는 **EDITOR도 누른다** — PRODUCT §3이 허용하고 `translation:write`에 들어 있다
  (`lib/auth/permission.ts` 주석). 목록 화면의 `rowBanner`가 같은 이유로 역할을 받지 않는다.

**보관 판정 순서**: `planProjectAccess`가 권한 → 보관 순이고, `requireProjectAccess`는
**보관을 redirect하지 않고 `archived: true`로 돌려준다**. 지금 `page.tsx`는 그것을 받아
`ProjectArchived` 전면 교체를 그리는데, **시안 `2d`는 전면 교체가 아니라 같은 화면 + 배너**다 →
그 컴포넌트의 소비자가 하나 줄어든다 (번역 화면은 그대로 쓴다).

## 9. 결정 — 2026-09-15에 닫은 일곱

**아래 일곱은 사용자 판정이고 되돌리지 않는다.** 근거를 함께 적는 이유는, 근거 없이 값만 남으면
다음 사람이 같은 결정을 다시 하기 때문이다.

### 9.6 ✅ [Sync] 실행 경로 — **만든다. 단 별도 feature의 선과제다**

기존 표면을 리포에서 다시 읽어 적재하는 경로를 새로 만든다. **이 스펙의 범위 밖이고,
`/feature`를 따로 돌려 선과제로 처리한다.**

- ⚠️ **그 feature가 불변식 2를 정면으로 다룬다** — push가 리포 값으로 번역을 덮고 저자를 비우므로,
  편집 손실 창을 번역 편집자가 버튼으로 열 수 있게 된다. **확인 Dialog와 그 문구는 그쪽 스펙의
  일부**이지 이쪽이 아니다.
- **Home은 그 산출물에 의존한다** — `[Sync]`는 §8 표대로 그리되, 실행 Action은 선과제가 준다.
  선과제가 끝나기 전에는 Home의 `[Sync]`를 배선하지 않는다.

### 9.7 ✅ 카드 넷의 목적지 — `state=` 4어휘 + 기본 표면

`TranslationsQuery`에 `state?: "new" | "untranslated" | "review" | "unsent"`를 늘리고,
카드는 **기존 공가 라우트** `routes.translations(slug, { state })`를 가리킨다 — 그 라우트가
기본 표면(`defaultSurface`)으로 redirect하며 쿼리를 보존한다
(`app/(edit)/projects/[slug]/translations/page.tsx`).

- 근거: 표면은 보통 1개이고(README), 그때 **합계 = 표면값**이라 수가 맞는다.
- ⚠️ **수용한 비용**: 표면이 여럿이면 `To send 24`를 눌렀는데 기본 표면의 9개만 보인다.
  보조 줄의 `across 3 surfaces`가 그 사실을 **미리** 말하게 둔다.
- ⚠️ **`TranslationsQuery`의 주석이 *"`state`가 없다 (8-4 — spec Q3)"*를 의도로 적어 뒀다.**
  뒤집는 근거를 **그 주석 자리에** 남긴다 — 지우기만 하면 다음 사람이 같은 결정을 다시 한다.

### 9.1 ✅ 항목 정렬 — **시간순(최신)** + 3행 + `+2 more`(상한 5)

종류와 무관하게 최근 사건이 위다. 로그 카드와 같은 정렬이라 두 카드가 한 규칙을 쓴다.

- **동점은 `surfaceSlug` → 로케일 코드 유닛 비교로 기울인다** — `recentActivity`의 `compareEdit`과
  같은 규칙이다. `localeCompare`를 쓰지 않는다(로케일 설정에 따라 답이 달라진다).
- ⚠️ **캔버스 `2a`의 행 순서와 어긋난다.** 캔버스는 파서(3h) → 검토(2h) → 미채움(4d)으로 **종류
  순**이었고, 시간순이면 검토(2h) → 파서(3h) → 미채움(4d)이다. **의도된 이탈이므로
  `/design-sync`가 결함으로 잡지 않도록 여기 적어 둔다.**
- ⚠️ **수용한 비용**: 파서 실패가 오래됐으면 3행 밖으로 밀려 `+2 more` 뒤에 접힌다.
- `2b`에서 파서 항목이 배너로 옮겨가면 그 칸만 빠지고 나머지가 올라온다(카운트도 준다).

### 9.10 ✅ (9.1의 종속) 파서 실패의 시각 — `lastImportFailedAt` 추가

`TranslationSurface.lastImportFailedAt DateTime?` — **additive · nullable · backfill 없음.**

시간순 정렬은 세 종 모두에 시각을 요구하는데 파서 실패에 시각이 없었다(`lastImportError`는 코드만,
`lastImportStartedAt`은 끝나는 순간 `null`). 이 컬럼 하나가 세 자리를 답한다 — 항목 정렬 ·
메타의 `failed 10m ago` · 로그의 `Sync failed` 줄.

- `importOutcomeFields`가 이미 적재와 **같은 트랜잭션**에서 `lastImportError`를 쓰므로 거기에
  필드 하나를 더한다.
- ⚠️ **이번 사이클에 마이그레이션이 필수가 됐다** (전에는 후보였다).

### 9.4 ✅ 보관 실행자 — **적지 않는다**

메타의 `Archived` 행은 **시각만** 든다. `Project.archivedBy`를 만들지 않는다.

- ⚠️ **캔버스 `2d`가 `Archived  Sep 12, 2026 · by Sinhyeok`으로 그렸으므로 의도된 이탈이다** —
  `/design-sync`가 결함으로 잡지 않도록 여기와 `docs/DESIGN.md`에 남긴다.
- 근거: 보관은 OWNER만 할 수 있고 멤버 상한이 10이라 "누가"의 값이 낮다.

### 9.9 ✅ `+2 more` 펼침 — `<details>` / `<summary>`

JS 없이 푼다. **Home 전체가 순수 서버 컴포넌트로 남는다** — `client-graph.test.ts`가 보는 그래프가
안 늘고 번들도 안 는다.

- 기본 marker 제거(`::-webkit-details-marker`)와 chevron 회전은 CSS로 한다.
- ⚠️ **그 모양은 `/design-sync` 4단계의 실측 대상이다** — 브라우저 기본 스타일이 남으면 시안과 어긋난다.

### 9.11 ✅ (§3.3) `last edited by`의 폴백 — **절을 통째로 뺀다**

이름을 못 찾으면 `8 cells are waiting for review.`로 끝난다.
기존 `m.home.activity.edit`가 **이미 같은 관용구**다(`who === null`이면 수동태로 바꾼다).

- ⚠️ **수용한 비용**: 같은 종류의 항목이 누군가에겐 사람 이름을, 누군가에겐 안 보인다.
- ⚠️ **`actorLabel`은 `null`을 잘 안 준다** (`lib/keys/view.ts:70`) — 사용자 행을 못 찾으면
  **`updatedBy` 원문**을 돌려주고, 2026-09-05 이후 행에서 그것은 `User.id`(cuid)다. 그래서 폴백
  판정을 `actorLabel`의 `null`에 걸면 **안 걸린다** — 호출부가 `actors` 맵에 있는지를 직접 봐야 한다.

### 9.12 ✅ (9.1의 두 번째 종속) 미채움 로케일의 시각 — `Locale.createdAt` 추가

`Locale`에 시각 컬럼이 하나도 없었다(`code`·`name`·`isBase`·`orphaned`뿐). 한 번도 안 채워진
로케일은 `Translation` 행이 아예 없어 `max(updatedAt)`도 `null`이다.

⚠️ **`@default(now())`만으로는 마이그레이션이 거짓을 만든다** — 기존 로케일 전부가 "마이그레이션
시각"을 들고 배포 직후 미채움 항목이 목록 맨 위를 점령한다. **backfill SQL을 손으로 쓴다**
(`design.md` §6.2).

## 9.5 남은 열린 결정 — 시안 기본값으로 간다

닫지 않았지만 **막지 않는다.** 시안의 기본값으로 구현하고, 실물을 본 뒤 뒤집는다.

1. **미연결·보관에서 카드 넷의 수** — 시안대로 값을 유지하고 보조 줄로만 기준을 말한다.
2. **로그의 `Sync failed` 점 색** — 시안대로 `#dc2626`.
3. **파랑 규칙의 화면 밖 확장** — 이번 비목표(§4). Home에만 둔다.
4. **표면 1개일 때 접는 방식** — 시안대로 `Surfaces` 메타 행과 `across 3 surfaces`가 둘 다 사라진다.

## 10. 신규 문구 — `messages/en.tsx`에 없는 것

캔버스에서 그대로 뽑았다. **기존 키로 되는 것은 재사용 열에 적는다.**

### 카드 넷 (제목 4 + 보조 줄 템플릿)
`New from GitHub` · `To translate` · `To review` · `To send`
보조 줄: `keys · synced {time}` · `cells · across {n} surfaces` · `cells · {n} en, {m} ja` ·
`cells · last publish {time}` · `cells · {n} keys all filled` · `cells · nothing pending` ·
`keys · last good sync {time}` · `keys · as of {time}` · `cells · as of the last sync` ·
`cells · cannot be sent while paused` · `cells · frozen at archive` · `cells · never sent`

⚠️ **재사용 후보**: `To review`·`To send`는 목록 화면 문구와 같은 키를 쓴다 (prompt 지시).
`m.projects.summary.*`를 확인해 같은 키로 묶는다.

### 항목 문장 세 종 (표면·로케일을 받는 템플릿)
- 파서 실패 — 첫 줄 `{surface} · {locale} file` / 둘째 줄 **`The last sync could not read this file`** + `— its keys did not come in.`
- 검토 대기 — 첫 줄 `{surface} · {localeName}` / 둘째 줄 **`{n} cells are waiting for review`** + `— last edited by {who}.`
- 미채움 로케일 — 둘째 줄 **`{localeName} has never been filled here`** + `— {n} keys, none translated.`

✅ **폴백 (§9.11)**: 이름을 못 찾으면 **`— last edited by …` 절을 통째로 뺀다** →
`8 cells are waiting for review.` ⚠️ `actorLabel`의 `null`에 걸면 **안 걸린다** — 그 함수는 못 찾으면
`updatedBy` 원문(cuid일 수 있다)을 준다. **`actors` 맵에 있는지를 호출부가 직접 본다.**

### 블록 제목 둘 + 링크 하나
`Needs your attention` · `Recent logs` · `All logs`
⚠️ 기존 `m.home.progress.title`(`Languages`) · `m.home.activity.title`(`Recent activity`)이 **사라진다**.

### EmptyState 넷
- 할 일 없음 — **`Nothing needs you`** / `Items appear here when a sync fails, cells wait for review, or a locale falls behind.`
- 로그 없음 — **`No activity yet`** / `Edits, syncs and publishes from the last 7 days show up here.`
  ⚠️ 첫 Sync 전에는 `CI가 처음 Sync하면 여기에 쌓인다` 취지로 **문장이 갈린다**(캔버스 근거 열).
- 보관 — **`Nothing to act on`** / `Attention items come back when the project is restored. The numbers above are frozen at the moment it was archived.`
- 로딩 — 문구 없음.

### 배너 셋
- **Sync 실패** — 제목 `The last sync could not finish` / 본문
  `malmoi could not read {surface} on {branch}. Keys from the other {n} surfaces came in. Nothing was lost — the cells you see are from the last good sync, {time}.` / 버튼 `Try again`
  ⚠️ **원인 문장은 `ImportFailureCode` 6종으로 갈린다** (§7.2). `importFailureMessage`가 이미 있고
  **폴백도 이미 있다**(`Object.hasOwn` + `importFailed`).
- **미연결** — 제목 `malmoi is not connected to this repository` / 본문
  `The GitHub App installation is gone, so syncs and publishes are paused. Everything already translated is safe — reconnect and the next sync picks up where it left off.` / 버튼 `Reconnect`
  + **EDITOR 갈래 문장**(관리자에게 요청) — 캔버스에 문장 원문이 없다. **정해야 한다.**
- **보관** — 제목 `This project is archived` / 본문
  `Editing, syncing and publishing are off, and CI pushes are rejected. The open pull request was left alone. Restore it to work on it again.` / 버튼 `Restore project`

### 메타 열 라벨 아홉(+1)
`Repository` `Branch` `Surfaces` `Locales` `Keys` `Members` `Last sync` `Last publish` `Created` (+`Archived`)
+ pill `Not connected` · pill `Archived` · 링크 `Project settings`

⚠️ **`Archived` 행은 시각만 든다** (§9.4) — 캔버스의 `· by Sinhyeok`을 뺀다.
⚠️ **`Last sync`는 `2b`에서 값이 둘이다** — `1d ago · failed 10m ago`. 뒤쪽이 `lastImportFailedAt`(§9.10).

### 로그 줄 문구
`CI synced {n} new keys into {surface}` · `{who} edited {key} in {locale} · {surface}` ·
`Published pull request #{n} · {n} files changed` · `{who} added the {surface} surface` ·
`Sync failed · {surface} could not be read`
⚠️ **`{n} files changed`는 `SyncRun.changed`가 파일 수여서다** — 칸 수가 아니다.
⚠️ **`{who} added the {surface} surface`는 출처가 없다** — `SyncRun`에 표면 추가 사건이 없다 (§design).
