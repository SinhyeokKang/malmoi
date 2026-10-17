# project-row-redesign — tasks

> ⚠️ **사전 조건: `source-row-locale-meter`가 dev에 먼저 들어가 있다**(spec "사전 조건" — 확인 `rg -n "RowLocaleProgress" components/locale-meter.tsx` 0건).
> 순서: 시안 수령 → 순수 함수(추가만) → 로더(추가만) → 목록 UI(교체·삭제) → Inbox → 대조 → 정본. 커밋 경계는 `──`로 표시한다.
> ⚠️ **커밋 경계마다 `pnpm gate`가 green이어야 한다.** 그래서 옛 함수(`rowChip`·`projectGroup`·`rowBanner`·`meterSlot`·`rowLocaleProgress`)와 `meters`는 **UI 커밋(T6)에서** 지운다. T1–T4는 새 것을 더하기만 한다.
> design.md "결정" 여덟(2026-10-14·15)이 브리프에 반영돼 있다. 결정 5(조회 실패 띠 문구)는 T0에서 시안 제안을 받아 확정한다.
> 자동 검증(`pnpm test`·`typecheck`·`test:projects:postgres`)과 **수동 확인**(브라우저 실측 — e2e 없음)을 줄마다 구분한다.

## 0. 시안
- [ ] **T0 — Claude Design 시안 수령.** `design-brief.md`를 넘기고 핸드오프를 받는다.
  - 검증(수동): `DesignSync list_files`에 핸드오프가 있고, 브리프 프레임 표의 번호마다 프레임이 그려져 있다.
  - 시안이 design.md의 판정(상태 표·메타 넷·띠 톤)과 다르면 **코드 전에 어느 쪽을 고칠지** 사용자에게 묻는다. 결정 5(PR 조회 실패 띠 문안)를 여기서 확정한다.

──

## 1. 순수 함수 — 추가만 (`/tdd interface` → `/implement`)
- [ ] **T1 — `planProjectRow`** (`lib/projects/list.ts`). design.md §2 표 8행을 전부 다루고, `never_filled` 띠와 `syncing` 칩을 더한다. PR 조회 실패는 `active`·`all_set`에 띠만 선다.
  - 검증: 새 단위 테스트(`lib/projects/__tests__/list.test.ts`)가 green이다. 표 테스트는 입력 축 전수(보관 × `projectStatus` × 적재 실패 톤 × 적재 중 × 열린 PR 셋 상태 × 미발송·리포 앞섬·검토·never_filled의 0/양수)를 돌려 spec 완료 조건 3의 불변식 넷을 센다. 아래 갈래를 명시 사례로 둔다.
    - 미발송 + PR 조회 실패 → 띠 `unsent`
    - GitLab · EDITOR 갈래
    - 6행 `syncing`
  - 옛 함수는 아직 지우지 않는다.
- [ ] **T2 — `projectTodos`** (`lib/inbox/plan.ts` 또는 `lib/home/attention.ts` 옆 — `/tdd`에서 정한다). design.md §4 표대로 DB 할 일을 모은다.
  - 검증: 새 단위 테스트가 green이다.
    - 종류별 생성 조건과 역할 필터(`setup`은 OWNER만, `needs_reconnect`·`import_failed`의 EDITOR 문장 플래그)
    - `needs_reconnect`의 `at`: GitLab 만료면 만료일, GitHub id 누락이면 `null`
    - **`planInbox`가 `projectTodos`를 쓰도록 바꾼 뒤에도 기존 Inbox 테스트(`lib/inbox/__tests__/*`)가 그대로 green이다.** 단 새 `needs_reconnect` 항목은 기대값에 더한다.
- [ ] **T3 — 메타 조립** (`lib/keys/query.ts` 조립 층의 순수 부분).
  - 검증: 단위 테스트(`lib/keys/__tests__/list-rows.test.ts`)가 green이다. 다음 사례를 둔다.
    - 소스 수에 첫 적재 전 소스를 포함한다.
    - 키 수는 표면 id로 합산하고, 로케일 수만큼 중복되지 않는다.
    - 언어 수는 고유 비-base 코드다. 한 소스에서 base이고 다른 소스에서 대상인 코드도 센다.
    - orphaned 로케일·키, 보관 소스를 제외한다.
    - `lastSyncTime`의 세 갈래(시각 · `"unrecorded"` · `null`)
  - 별도 `projectRowMeta` 함수는 만들지 않는다.

──

## 2. 로더 — 추가만
- [ ] **T4 — `loadProjectList` 재료 추가** (`lib/keys/query.ts`). `ProjectListMemberRow`(`:341-350`)에 다음을 **더한다**.
  - `sourceCount`·`keyCount`·`languageCount`·`lastSync`
  - `never_filled` 재료: 로케일 select에 `name`·`createdAt`을 더하고, 이미 읽는 aggregates로 `neverFilledLocales`를 돌린다.

  `meters`는 아직 남긴다. 새 왕복이 없고 전부 `projectId in ids`다.
  - 검증: `pnpm typecheck` · `pnpm test` green, `pnpm test:projects:postgres` green(`pnpm gate`가 트리거로 붙인다 — 손으로 판정하지 않는다).
  - **교차 테스트**: 두 로더를 함께 부르는 `lib/keys/__tests__/source-remove-consumers.integration.ts:120-124`에 단언을 붙인다. 내용은 "사이드바 `MembershipRow.keyCount`(`_count`)와 행 `keyCount`(`keyTotals` 합)가 같은 fixture에서 같다"이고, 그 fixture에 보관 소스와 orphaned 키를 넣는다. 이 단언은 postgres 스위트에만 있어 `pnpm test`로는 돌지 않는다.
  - `lib/keys/__tests__/list-aggregates.integration.ts:19,526-527`도 새 필드에 맞게 갱신한다.

──

## 3. 목록 UI — 교체·삭제 (`/implement`, 시안 기준)
- [ ] **T5 — 사전(목록)** (`/translate` 모드 ①). T6보다 먼저 한다.
  - 기존 키를 재사용한다: `sources.count`·`translations.keys`·`sources.languageCount`·`home.cards.synced`.
  - 새 en 키를 세 사전에 같은 커밋으로 넣는다: `never_filled` 띠 문장·링크, PR 조회 실패 띠 문장(결정 5).
  - 소비자를 잃은 `projects.meter.note.*`·`onGitLab.meter`를 **세 사전에서 동시에** 지운다.
  - 새 낱말은 DESIGN §10.1 표와 대조한다.
  - 검증: `dictionary-consistency`·`host.test`(`:78-89,113-118`)·`terminology`·`gitlab-scope-sweep`가 green이다. `projects.banner.prCheckFailed`를 바꾸면 `cross-screen.test.ts:477`(칩 낱말 + "." 일치)과 `project-row.test.tsx:217`을 같이 고친다.
- [ ] **T6 — 행 재조립 + 옛 판정 삭제** (`components/projects/project-list.tsx` · `app/(edit)/projects/(list)/page.tsx`).
  - `planProjectRow` 하나를 읽는다. 행 전체가 `withRepoHost`를 지난다.
  - 둘째 줄(막대·상태 문장)을 없애고, 리포 줄 아래 메타 줄을 둔다(감김).
  - 상대 시각은 `<time dateTime aria-label={formatMinute}>`이고, `now`는 서버 prop으로 받는다.
  - All set 띠는 muted로 둔다.
  - 지울 것: `rowChip`·`projectGroup`·`rowBanner`(export)·`meterSlot`·`rowLocaleProgress`·`ProjectListRow.meters`. `RowLocaleProgress` 타입도 지운다 — 사전 조건상 `LocaleMeter`는 이미 `LocaleMeterValue`를 받는다(design §5). `messages/en.tsx:1874`·`lib/keys/query.ts:222`의 주석에 남은 옛 이름도 고친다.
  - 검증(DOM 테스트):
    - GitLab setup 행과 GitLab PR 조회 실패 행에서 `/github|pull request/i`가 0건이다.
    - 상태 표 전 행에서 칩 낱말이 띠 문장에 들어가지 않는다.
    - 메타 줄에 `STATE` 낱말이 없다.
    - `LocaleMeter`가 0개다.
    - 메타 넷의 순서. 언어 0과 `lastSync` `null`·`"unrecorded"`에서는 그 칸이 없다.
    - `<time dateTime>`이 UTC ISO이고 `aria-label`에 오프셋 라벨이 있다.
    - 보관 행에 띠가 없고, 새 메타까지 `gray-dim`이다(`projects-cards.test.tsx:243-260` 확장).
    - 행이 `<a>`이고 띠는 형제다.
    - `ring-inset` 단언을 새로 둔다(지금 테스트에는 0건이고 주석뿐이다).
    - All set 띠 톤이 muted다.
  - 검증(옮기거나 갱신할 기존 테스트 — 깨지지 않아야 할 것 포함):
    - `lib/projects/__tests__/list.test.ts:192-216,359-390,399-463`(옛 함수 테스트 → T1로 이관)
    - `lib/status/__tests__/cross-screen.test.ts:14,42`(`REAL` 묶음)`·143·389`
    - `components/__tests__/projects-screen.test.ts:145-147,344,468,473`
    - `components/__tests__/project-row.test.tsx:258`
    - `lib/surfaces/__tests__/counts.test.ts:2,11`
    - `meters: []` 픽스처 넷: `project-row.test.tsx:46` · `projects-list-links.test.tsx:24` · `state-links.test.tsx:91` · `projects-cards.test.tsx:44`
    - 검색 하이라이트 `projects-screen.test.ts:553`(변경 없이 green)
- [ ] **T7 — 로딩 골격** (`app/(edit)/projects/(list)/loading.tsx`). 미터 줄을 지우고 메타 줄을 둔다. 썸네일 모서리를 `rounded-[4px]` → `ProjectThumbnail`과 같은 8로 고친다(POSTMORTEM 2026-09-17 부류).
  - 검증(자동): `projects-screen.test.ts:385-436,495-500` · `loading-parity.test.tsx:268-283` · `projects-list-links.test.tsx:81-86`이 green이다.
  - 검증(**수동**): `pnpm dev`에서 골격 행과 실물 행의 `getBoundingClientRect().height`를 견준다. 첫 적재 전 행과 정상 행 둘 다 같아야 한다.

──

## 4. Inbox
- [ ] **T8 — Inbox를 `projectTodos`로** (`lib/inbox/load.ts` · Inbox 항목 렌더 · 사전).
  - `needs_reconnect` 항목의 문장과 링크(OWNER는 재연결 화면, EDITOR는 소유자에게 요청하라는 문장)를 세 사전에 넣는다. 배지 경로가 호스트 API를 부르지 않는다.
  - 검증: `lib/inbox/__tests__/*`와 Inbox DOM 테스트가 green이다. `needs_reconnect` 항목이 OWNER·EDITOR 둘 다에게 서고 문장이 갈린다. 원격 신호 종류가 Inbox 항목에 0이다. `loadAttentionBadgeAction` 경로에 `loadRemoteSignals` import가 0이다(소스 단언).
  - 같은 프로젝트 fixture에서 행 띠의 DB 할 일 종류가 Inbox 항목에 있다(spec 완료 조건 6 — 표 테스트).

──

## 5. 대조·정본
- [ ] **T9 — `/design-sync`**: 시안 프레임마다 computed style과 접근성 트리를 실측한다.
  - 검증(수동): 실측이 전부 일치하고 리뷰 지적이 0건이다. 링크 안 `<time aria-label>`이 행 링크의 접근 이름에 어떻게 들어가는지 접근성 트리로 확인한다.
- [ ] **T10 — 레이아웃 실측** (`/runtime-test`, 로컬). 픽스처는 프로젝트 다수에 Archived가 있어 본문이 뷰포트를 넘는 목록이다.
  - 검증(수동):
    - 1280·768·375에서 `document.scrollingElement.scrollHeight === innerHeight`(POSTMORTEM 2026-10-13 #260).
    - 가로 스크롤이 0이다.
    - 375에서 메타 줄이 감기고 칩·chevron이 줄지 않는다.
    - es 화면 언어로도 한 번 돌린다.
- [ ] **T11 — 정본 갱신** (문서별 별도 커밋).
  - DESIGN
    - §6.63: 행·메타·그룹 근거 확장·띠 톤·둘째 줄 제거·역할·멤버 수 제거 근거(2026-09-30)
    - §2.4: `:160` PR 조회 실패의 자리, `:179` 칩 순서에 `syncing`
    - §10.1: 새 낱말
    - `:1290`·`:1351`의 미터 서술
    - §6.63 머리의 `LocaleMeter` 소비자 서술을 "Sources 소스 행(§6.66)"으로 고친다(이 기능이 늦게 끝나는 쪽이다 — design §5).
  - ARCHITECTURE: §6.36(`:3212,3215` — `projectGroup`), §6.365 Inbox 항목
  - PRODUCT: `:1133`(`rowBanner`), §4.1 `:431`(언어 미터 감김 문장), Inbox 항목 서술이 있으면 그것도
  - DIRECTORY: `:310,536`(`LocaleMeter`)
  - 그 뒤 `docs/features/project-row-redesign/`를 지운다.
  - 검증: `/push` 4단계 문서 신선도를 통과한다. **디렉터리를 지운 뒤** `rg -n "meterSlot|rowChip|projectGroup|rowBanner|[rR]owLocaleProgress|meter\.note|onGitLab\.meter" docs lib components app messages`가 0건이다(주석의 옛 이름 포함. 타입 `ProjectGroup`은 남으므로 대소문자를 무시하지 않는다).
- [ ] **T12 — 가이드 영향** — Inbox 항목 서술(`guide/en/translate/edit.md:43`)이 `needs_reconnect` 추가로 바뀐다. `/guide`로 en·ko·es 세 벌을 같은 커밋에서 고친다. `/projects` 행을 찍은 컷은 2026-10-14 기준 `guide/SHOOTING.md`에 매핑이 없다.
  - 검증: `pnpm test` green(가이드 게이트). `pnpm guide:check`에 이 기능 경로가 걸리면 `/guide-shots`.
