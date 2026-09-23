# tasks — 출시 전 전체 감사 (2026-09-24)

출처는 2026-09-24 `/audit`(invariant · principle · boundary · debt + **UX·Design 렌즈**, dev @ `714b07f` + 미커밋 16파일)이다. 발견 90건(🔴 8 · 🟡 66 · ⚪ 16)을 **배치 7개**로 나눴고, 각 항목 앞의 `#n`이 그 리포트의 번호다. **체크박스는 구현 완료 상태가 아니다.**

**읽는 법**
- **한 배치 = 한 번의 `/ship`**(B1만 `/feature`부터). 배치 밖 항목은 같은 파일에 있어도 손대지 않는다 — 각 배치의 "경계" 줄이 겹치는 파일과 소유 배치를 적는다.
- **결정은 2026-09-24에 다섯 개 모두 닫혔다**(#1·#3·#26·#29·#50 — 각 배치의 "결정 기록"). 배치에 들어가면 **정본(PRODUCT·ARCHITECTURE·DESIGN)을 먼저 고치고** 항목을 푼다.
- 감사 발견은 정적 읽기다 — **각 항목의 첫 검증은 재현(red)이다.** 재현이 안 되면 항목을 닫고 그 사실을 적는다.
- "0회/없음"을 단언하는 검증은 같은 픽스처의 허용 경로에서 N > 0을 짝으로 단언한다(POSTMORTEM 2026-09-14).
- PG 통합 테스트는 `vitest.projects.config.ts:9`의 include(`lib/keys`·`lib/events`·`lib/invitation-email`의 `__tests__/*.integration.ts`) 안에만 둔다 — 밖에 만들면 조용히 0건 수집된다.
- 작업 중인 파일에 `git checkout -- <경로>`를 쓰지 않는다(POSTMORTEM 2026-09-16).
- 끝나면 결론을 정본으로 올리고 이 디렉터리를 지운다(CLAUDE.md `/feature` 규칙).

## 배치 요약

| 순서 | 배치 | 항목 | 출시 차단 | 진입 | 검증 게이트 | 결정 |
|---|---|---|---|---|---|---|
| 1 | ✅ **B1 전달 층 불변식** | #1·2·3·4·58·59 | ✅ | `/feature` → `/ship bypass` | `pnpm test` + `pnpm test:projects:postgres` + `/l10n-roundtrip`(`i18n-order-check`·ts-dict 리포) | ✅ #1 · #3 |
| 2 | ✅ **B2 보안 TOCTOU** | #9·10·26 | ✅ | `/ship` | `pnpm test` + `pnpm test:projects:postgres` | ✅ #26 |
| 3 | ✅ **B3 UX 🔴·막다른 길** | #5·6·7·8·11·14·15·16·17·24·25 | ✅ | `/ship` | `pnpm test` + `/bugshot-qa`(EDITOR·OWNER 두 계정) | — |
| 4 | ✅ **B4 확인·문구·용어** | #13·19·20·21·22·23·28·29·30·31 | ✅ | `/ship` | `pnpm test`(no-korean-ui·brand-spelling 포함) + `/bugshot-qa` | ✅ #29 |
| 5 | ✅ **B5 접근성(포커스)** | #32~42 | 권장 | `/ship` | `pnpm test`(jsdom) + `/design-sync` 접근성 트리 실측 | — |
| 6 | ✅ **B6 시각 체계** | #43~50 | 권장 | `/ship` → `/design-sync` | `/design-sync` computed style 실측 | ✅ #50 |
| 7 | **B7 어댑터·부채·문서** | #12·51~57·60~74 · ⚪ #75~90 | ❌ 출시 후 | 소배치로 쪼개 `/ship` | 항목별 | — |

**배치 밖**: #27 `/docs` 본문은 코드가 아니라 글쓰기다 — launch-readiness L2.3이 소유한다.

**순서 제약**
- **B1·B2·B3은 서로 파일이 겹치지 않아 순서를 바꿔도 된다**(아래 경계). B1이 가장 무겁다 — 설계(`/feature`)가 끝나기 전에 B2·B3을 먼저 돌려도 된다.
- **B3 → B4 → B5 → B6은 직렬이다.** 네 배치가 `workspace.tsx`·`sync-button.tsx`·`messages/en.tsx`를 함께 건드린다. 병렬로 돌리면 서로의 diff를 덮는다.
- #11은 감사 리포트에서 [boundary]로 나왔지만 #5와 같은 "실패 뒤 refresh" 부류라 **B3로 옮겼다.**

---

## B1 전달 층 불변식 — 출시 차단

**왜 한 배치인가**: 여섯 항목이 전부 "토큰 해제 · CI 보류 · Publish 거부" 세 판정의 교차점이다. #58·#59는 #1의 선행 조건이고, #4는 #3의 거부 정책과 만나서 🔴가 된다. 하나씩 고치면 서로를 다시 깬다.

**결정 기록 (2026-09-24)**
- **#1 → 승인 Sync가 이번 적재로 orphan이 된 승인 셀의 토큰만 비운다** — 그 표면 적재가 확정되는 tx에서. 처음엔 "승인 집합 전부"였으나 2026-09-24 `/feature-review`(CTO)가 뒤집었다: 리포에 값이 없던 셀의 편집값이 pending 아닌 채 남아 다른 Publish에 조용히 실리고 backfill로 되살아난다. 빈 값·실패 파일 셀은 지금처럼 토큰이 남아 `remainingEdits`로 보인다. 상세는 `docs/features/delivery-invariants/`.

- **#3 → 빠진 파일만 남기고 나머지는 보낸다** — `original-file-missing`을 reject 대상에서 뺀다(§5.6.35가 정본, §3 T10의 "writer 경고면 멈춘다"는 그 코드를 예외로 둔다). 빠진 파일의 셀은 **전달 확인에서 제외해 토큰을 남긴다**(불변식 9 — 보내지 않은 편집을 보냈다고 기록하지 않는다). 남은 편집은 배너에 서므로 Revert나 파일 복구로 풀린다. 개발자가 언어를 빼려고 파일을 지워도 다른 언어의 Publish가 멈추지 않는다. 대가: 전달 확인 CAS가 셀 단위로 거른다. 그 밖의 writer 경고(#4 포함)는 여전히 reject다. 정본: ARCHITECTURE §3 T10 문단 · §5.6.35.

**항목**
- [x] **#1** 🔴 `lib/push/apply.ts:146-153` — orphan 셀에 남은 편집 토큰이 CI 적재를 영구·무표시로 보류시킨다. 토큰을 비우는 세 자리(`lib/pull/load.ts:196` · `lib/keys/revert.ts:113` · `apply.ts:357`)가 전부 orphan을 건너뛴다.
  - 실패 시나리오: 키 `a` 편집 → 리포에서 `a`가 빠진 채 OWNER 폐기 승인 Sync → `a` orphan · 토큰 잔존 → 코드가 `a` 복구 → CI push가 unorphan → 사후 재집계 1 → 롤백 · `deferred`, 이후 매번 반복. `pendingWhere`가 orphan을 빼서 배너·Publish가 0으로 보인다. EDITOR에겐 출구가 없다.
  - 재현: `sync-edit-protection.integration.ts:194`가 잔존을 고정하고 있다 — 거기서 시작한다.
- [x] **#2** 🔴 `lib/pull/plan.ts:201-203` + `lib/pull/run.ts:236` — 수술적 어댑터(ts-dict·yaml-catalog·code-dict)에서 UI로 비운 비-base 셀은 write entry가 없어 파일이 그대로인데, 토큰이 "전달됨"으로 해제된다(불변식 9).
  - 실패 시나리오: ts-dict fr 셀을 비우고 Publish → `no-changes` · 전달됨 표시 → 다음 CI push가 옛 값으로 DB를 덮는다.
  - 방향: 수술적 writer가 빈 값 셀을 건너뛰면 `writer-warnings`로 올린다. ARCHITECTURE §5.5.2의 "코드에서 번역을 지우는 길은 없다"와 같이 읽힌다.
- [x] **#3** 🔴 `lib/pull/run.ts:183-191` × `lib/pull/render.ts:107-111` · `lib/publish/read.ts:63-66` — writer 경고가 하나라도 있으면 Publish 전체가 거부되는데, 미리보기는 `withoutFile`만 빼고 나머지가 나간다고 보인다.
  - 실패 시나리오: yaml 표면 ko 미전달 편집 + `fr.yml` 삭제 → CI 보류라 fr이 orphan 안 됨 → 매 Publish·매 밤 `original-file-missing` → `skipped/writer-warnings`. 보류와 거부가 서로를 잠근다.
- [x] **#4** 🔴 `lib/adapters/ts-dict.ts:295`(`pairs` :57-75) — 쓰려는 키와 무관한 비리터럴 프로퍼티까지 파일×로케일마다 `value-not-string-literal`을 낸다. `write-locale-object-missing`(:287)도 같은 부류다.
  - 실패 시나리오: `const ko = { a: "A", b: someFn }` → 온보딩 성공 → `a` 편집이 매번 `skipped: writer-warnings`로 영영 안 나간다.
  - 방향: code-dict(:340)·yaml(:386)처럼 `wanted` 키로 좁힌다. `ts-dict.test.ts:328-332`가 지금 동작을 고정하고 있다 — 그 단언을 먼저 뒤집는다.
- [x] **#58** 🟡 `lib/push/apply.ts:204-207,310-316` — "base에 없는 키는 조용히 버린다" 주석이 거짓이다. `idByKey`에 orphan 키가 들어 있어 비-base 파일에만 남은 orphan 키 셀도 strict upsert되고 토큰이 비워진다. #1이 발생하는지가 여기에 달렸다. 방향: 이번 push의 base 키 집합으로 거른다.
- [x] **#59** 🟡 `lib/import/surface.ts:33-34` → `lib/onboarding/confirm.ts:74-77` — 수동 Sync의 blob 다운로드 일시 실패가 그 로케일을 `payload.locales`에서 빼고 `apply.ts:245`가 orphan시킨다. #1의 선행 조건. 방향: 실패한 로케일은 `locales` 판정에 유지한다.

**경계**: `lib/push/apply.ts:133`의 거짓 주석(#61)과 `lib/protection/where.ts`의 손 사본 목록(#63)은 같은 파일이지만 **B7**이다 — 단 #1 수정이 재집계의 존재 이유를 바꾸면 #61 주석은 이 배치에서 같이 고친다.

---

## B2 보안 TOCTOU — 출시 차단

**왜 한 배치인가**: 17곳이 같은 결함(잠금 전 인가 1회, 잠금 안 재확인 없음)이고, 해법이 공용 헬퍼 하나다. `lib/keys/revert.ts:97` · `lib/import/run.ts:48,119` · `lib/surfaces/create.ts:43`이 이미 맞는 모양이다(POSTMORTEM 2026-09-23).

**결정 기록 (2026-09-24)**
- **#26 → 보관 = Restore만** — 보관된 프로젝트에서는 `unarchiveProject` 외 설정 쓰기를 서버가 거부한다. UI가 이미 그렇게 서 있으므로 UI가 정본이다. 공용 헬퍼가 잠금 안에서 보관 상태를 다시 보는 김에 같이 닫는다(원래 B7이었으나 이 배치로 옮겼다). "보관 = 멈춤" 한 줄 모델이 된다.

**항목**
- [x] **#9** 🟡 OWNER 전용 Action 14곳 — 잠금 안에서 호출자의 OWNER 여부·보관 상태를 다시 읽지 않는다.
  - `app/(edit)/projects/actions.ts`: `changeMember` :333 · `createInvitations` :146(→`lib/invitation-email/issue.ts:125`) · `resendInvitation` :198(→`issue.ts:143`) · `revokeInvitation` :266 · `runFirstIngest` :1211 · `rotatePushToken` :1490(**잠금 자체가 없다**) · `archiveProject` :1543 · `unarchiveProject` :1589
  - `app/(edit)/projects/[slug]/settings/actions.ts`: `connectRepository` :141 · `updateRepositorySettings` :272 · `updateProjectName` :337 · `uploadProjectImage` :379(sharp·Blob이 잠금 전이라 창이 초 단위) · `deleteProjectImage` :428
  - `app/(edit)/projects/[slug]/sources/actions.ts`: `updateBaseLocale` :56
  - 시나리오: OWNER A·B·C. A가 B 제거, B가 C 제거를 동시에 → A 먼저 커밋 → B의 tx가 OWNER 재집계 1로 통과 → 권한을 잃은 B가 C를 지운다.
- [x] **#10** 🟡 `lib/keys/save-key.ts:28-37` · `lib/sync/run.ts:95` — `translation:write` 층의 같은 TOCTOU. 30초 적재 잠금 대기 중 제거된 EDITOR의 저장·사건이 커밋된다(ARCHITECTURE §5.8 "후속 검토 후보").
- [x] **#26** 🟡 보관된 프로젝트의 설정 쓰기 — PRODUCT §7.9와 Action 주석은 허용(`updateBaseLocale`·`connectRepository`·`updateRepositorySettings`·`rotatePushToken`·이름·이미지), 서버도 허용하는데 UI(general-card·repository-card·ci-card)는 전부 꺼 둔다. 결정대로 서버가 거부하도록 헬퍼가 보관 상태를 잠금 안에서 본다. PRODUCT §7.9의 "설정 쓰기는 허용" 문단과 각 Action 주석을 먼저 고친다.

**검증**: 경합은 `pnpm test:projects:postgres`의 동시 tx로 재현한다. 헬퍼가 17곳에 전부 걸렸는지는 `app/__tests__/entry-points.test.ts` 같은 소스 전수 가드로 센다 — 그 가드는 줄 끝 주석을 호출로 오인한다(#80). 새 가드를 쓸 때 같은 결함을 들이지 않는다.

**경계**: 같은 Action 파일들의 오류 문구 처리(#21·#22)는 **B4**, catch가 오류 객체를 버리는 것(#72)은 **B7**이다.

---

## B3 UX 🔴·막다른 길 — 출시 차단

**왜 한 배치인가**: 사용자가 **막히거나 결과를 못 보는** 부류만 모았다. 문구 교체가 아니라 동작·목적지·경로 수정이다.

**항목**
- [x] **#5** 🔴 `components/translations/workspace/workspace.tsx:393` — `SyncButton onResult={() => router.refresh()}`가 결과를 버리고 실패에도 refresh한다(POSTMORTEM 2026-09-08 재발). 방향: `components/home/actions.tsx:149`처럼 `SyncResult`를 들고 `outcome.ok`일 때만 refresh.
  - 실패 시나리오: 번역 화면 Sync → `already-running`·`not-connected`·`reconfirm` → 설명 없이 버튼만 복귀. 세션이 끊겼으면 refresh가 로그인 이동이 되어 거부 문구가 사라진다.
- [x] **#11** 🟡 `components/sources/sources-screen.tsx:133-135` — danger 결과를 세운 직후 무조건 refresh(#5와 같은 부류).
- [x] **#6** 🔴 가져오기 실패 안내가 전부 Settings로 간다 — `components/home/attention-card.tsx:109` · `components/projects/project-list.tsx:438` · `components/project-not-ready.tsx:22` · `messages/en.tsx:2864`("try again from settings"). 상세·재시도는 Sources 모달에만 있다. 방향: `routes.sources(slug)`, EDITOR에겐 링크 대신 문구.
  - 실패 시나리오: EDITOR가 Home "import failed" 클릭 → `?e=forbidden`. OWNER는 Settings 도착 → 관련 정보 0.
- [x] **#7** 🔴 `components/settings/archive-card.tsx:44,70` — `void (await archiveProject(slug))`가 `{ok:false}`를 버린다. `m.archive.failed`는 정의만 있다. 방향: in-block `Alert danger`.
- [x] **#8** 🔴 `components/logs/log-filters.tsx:113-129` — custom From/To `<Input type="date">`가 Radix `DropdownMenuContent` 안이라 키보드로 도달할 수 없다(WCAG 2.1.1). 방향: 메뉴 밖(인라인 필드 또는 popover/Dialog).
- [x] **#14** 🟡 `components/home/sync-button.tsx:64-67,88-94,167` — `prepareRepositorySync` 전에 확정하면 `approval: null` → 사실과 다른 "Translations changed after you opened Sync". 방향: 지문 도착 전 확정 `aria-disabled` + 스피너.
- [x] **#15** 🟡 `app/invite/[token]/page.tsx:106` — `blocked && !retry`(not-found·expired·already-accepted)에서 CTA `null`, 셸 밖이라 출구 없음. 방향: `/projects` 또는 `/signin` 링크.
- [x] **#16** 🟡 `app/(edit)/projects/[slug]/not-found.tsx:7` — 이 segment의 모든 `notFound()`가 "Translation surface unavailable". `sources/page.tsx:26` · `surfaces/new/page.tsx:13`(보관 프로젝트 — PRODUCT §7.7은 redirect로 기술) · `translations/page.tsx:21`.
- [x] **#17** 🟡 루트 `app/not-found.tsx`·`app/error.tsx`·`app/global-error.tsx` 없음 — `/invite`·`/signin`·`/signin/link`의 예외·오타 URL이 Next 기본 페이지.
- [x] **#24** 🟡 Server Action 호출에 try/catch 없음 — throw 시 pending id가 남은 채 error boundary. `components/members/pending-invitations.tsx:118` · `member-list.tsx:89` · `components/github-account.tsx:63` · `components/reconnect-button.tsx:43`.
- [x] **#25** 🟡 `components/shell/sidebar.tsx:102` · `user-menu.tsx:72` — Sign out에 pending 없음(`/account`의 것에는 있다).

**경계**: `workspace.tsx`의 오류 갈래(#23)·빈 상태(#31)는 **B4**, Save 포커스(#32)·Dialog 포커스(#34)는 **B5**. `sync-button.tsx`의 disabled 사유(#37)는 **B5**. #6의 en.tsx:2864 문구 교체는 목적지와 한 몸이라 **이 배치**다.

---

## B4 확인·문구·용어 — 출시 차단

**왜 한 배치인가**: 대부분 `messages/en.tsx`와 확인 Dialog다. 용어는 **한 번에** 통일해야 문구끼리 다시 어긋나지 않는다(POSTMORTEM 2026-09-13 "한 화면에 둘이 같이 섰다").

**결정 기록 (2026-09-24)**
- **#29 → 번역자 기준 세트** — 화면 문구만 바꾸고 코드 식별자(`surface`·`locale`·`import`)는 그대로 둔다. DESIGN §10에 이 표를 먼저 올린다.

  | 개념 | 화면 용어 | 쓰지 않는 말 |
  |---|---|---|
  | 번역 표면 | **Source** / Sources | surface, Translation surface |
  | 리포→앱 (CI·수동 모두) | **Sync** | import, imported |
  | 앱→리포 | **Publish** | Send changes, pull |
  | 언어 | **Language** / **Base language** | locale, Source language |
  | OWNER 호칭 | **a project owner** (주어 자리 "Only project owners") | the project owner, an owner of this project, Only an owner |
  | 재시도 | **Try again** | Retry, Check again |

**항목**
- [x] **#13** 🟡 `components/onboarding/new-project.tsx:469` — `OnboardingModal`에 `closeDisabled` 없음. "Creating…" 중 Esc·×·배경으로 닫히고 `createProject`는 계속 돈다. step 4의 일회용 push 토큰이 경고 없이 사라진다(DESIGN §6.4).
- [x] **#19** 🟡 `components/settings/push-token-panel.tsx:37` — 토큰 회전(이전 즉시 무효)에 확인 없음, 성공 직후 재클릭으로 방금 받은 토큰도 죽는다(PRODUCT §7.8).
- [x] **#20** 🟡 `components/members/member-list.tsx:170,238` · `pending-invitations.tsx:214` — 자기 강등 포함 역할 변경·Revoke에 확인 없음(같은 화면 Remove는 있다).
- [x] **#21** 🟡 오류 코드 원문이 문구에 섞인다 — `member-list:189` `changeFailed(failed.error)` · `pending-invitations:233,261` · `invite-modal:405` → "…: invalid input". `components/publish-button.tsx:327`은 모르는 문자열을 그대로 보이고 `invalid input`을 권한 없음으로 오역한다(DESIGN §10).
- [x] **#22** 🟡 문구가 상황과 어긋난다 — `revokeInvitation` `not-found`가 OWNER에게 "Check your invite link". `errors.access.unavailable`의 "— your text is kept"가 archive·token·disconnect와 `(edit)/error.tsx`에도 쓰인다.
- [x] **#23** 🟡 오류 갈래 뭉개짐 — `workspace.tsx:266-271`이 재시도로 안 풀리는 `key-unavailable`·`not-ready`를 "Try again"으로 접는다. `components/settings/general-card.tsx:72`가 전용 `emptyName`·`longName`을 두고 `fields.failed`. `add-sources-modal.tsx:82,96`이 `confirmManualFormat` 실패를 "Your selection is still here" 아래에 세운다.
- [x] **#28** 🟡 `messages/en.tsx:86,1242` — 링크 "Send changes (first)"인데 도착 화면 버튼은 `Publish`(POSTMORTEM 2026-09-14 재발). 주석 85·535도 거짓. 사용처 `sync-button.tsx:209` · `project-list.tsx:419`.
- [x] **#29** 🟡 용어 혼재 — 위 결정대로 전수 교체. `home.attention.importFailed.title`·"no active surfaces"·"Waiting for the first import"·`sources.add`(en:2204) vs 모달(en:2498) 등.
- [x] **#30** 🟡 Alert 제목 마침표(en:1879,1880,1900,1901) · 번역자 화면의 git 어휘(en:1957 "the push that switches it", en:2291 "next CI push", en:1231 "pushes and pull requests stop")(DESIGN §10).
- [x] **#31** 🟡 빈 상태·상태 문구 — `workspace.tsx:339` "No active keys"에 안내 없음(`translations.empty.noKeys`가 있다) · `projects.empty`가 초대받은 번역자에게도 "Connect a repository" · source-detail 푸터가 첫 가져오기 중에도 "Saving…".

**경계**: 이 배치에서 쓰지 않게 된 메시지 키는 이 배치에서 지운다(내 변경이 만든 고아). **이미 있던** 미사용 키 약 60개(#86)는 **B7**이다.

---

## B5 접근성(포커스) — 권장

**왜 한 배치인가**: 포커스 복귀 · disabled 사유 · live region이 같은 세 패턴이고 검증 도구(CDP 접근성 트리)도 하나다.

**항목**
- [x] **#32** 🟡 포커스를 쥔 컨트롤이 `disabled`가 되거나 사라져 포커스가 body로 — `workspace.tsx:581`(번역 Save — 주 흐름) · `general-card.tsx:74-75` · `repository-form.tsx:85,88` · `base-language-form.tsx:51` · `push-token-panel.tsx:37` · `member-list.tsx:238` · `archive-card.tsx:54` · `github-account.tsx:47` · `login-methods.tsx:125`(DESIGN §6.65 · POSTMORTEM 2026-09-20 계열).
- [x] **#32b** 🟡 (B4 리뷰가 추가, 2026-09-24) B4의 새 확인 Dialog 둘이 포커스를 잃는다 — `components/members/pending-invitations.tsx:103-109` Revoke 트리거에 `loading`이 걸려 확정 뒤 `disabled` → body(`button.tsx:41`의 SyncButton 함정과 같다) · `components/members/member-list.tsx:212` 트리거 없는 역할 Dialog, 확정 뒤 셀렉트 `disabled`.
- [x] **#33** 🟡 `components/logs/event-dialog.tsx:53-56` — 폴백 `h1`(`log-filters.tsx:72`)에 `tabIndex={-1}` 없음 → 딥링크 `?event=` Dialog를 Esc로 닫으면 body.
- [x] **#34** 🟡 트리거 없는 Dialog에 `onCloseAutoFocus` 없음 — `workspace.tsx:644-647`(discard·publish·revert) · `source-detail-modal.tsx:173-178`(중첩 Dialog가 부모 밖으로 샌다) · `home/actions.tsx:202`.
- [x] **#35** 🟡 Alert·결과 X가 포커스 노드를 언마운트 — `sync-result.tsx:59,119` · `home/actions.tsx:251` · `pending-invitations.tsx:143` · `dismissible-alert.tsx:36` · `sources-screen.tsx:89`.
- [x] **#36** 🟡 `components/ui/dropdown-menu.tsx:55-70` — `selected`에 `aria-checked`/`menuitemradio` 없음(Logs 필터·번역 필터).
- [x] **#37** 🟡 네이티브 `disabled`에 사유 없음 — `sync-button.tsx:120-126` · `login-methods.tsx:106`(`aria-describedby`가 있어도 포커스 불가) · `add-sources-modal.tsx:69,92` · `ci-card.tsx:17` · `home/actions.tsx:202` · `sync-result.tsx:120`.
- [x] **#38** 🟡 `title`이 유일한 설명 — `locale-panel.tsx:95,97` · `surface-selector.tsx:13,17`(DESIGN §7의 보조 줄 기술과 다름).
- [x] **#39** 🟡 성공 live region 없음 — `profile-name-form.tsx:72` · `general-card.tsx:76-77` · `repository-form.tsx:89-90`. `locale-panel.tsx:217` CopyLink의 `aria-label`이 보이는 "Copied"를 덮는다(WCAG 2.5.3).
- [x] **#40** 🟡 `components/onboarding/steps/files.tsx:352,367` — `<Table>` 이름 없음(POSTMORTEM 2026-09-19 미해결).
- [x] **#41** 🟡 `components/sources/source-status.tsx:20` — 상대 시각에 `<time dateTime>`·UTC 접근 이름 없음(DESIGN §6.66).
- [x] **#42** 🟡 `source-detail-modal.tsx:155` — 640px 이하에서 notes 열이 숨고 `aria-hidden` Meter만 남는다(색만으로 전달).

**경계**: #89의 작은 a11y 정리(`locale-meter.tsx:43` 주석 등)는 **B7**. `components/ui/dropdown-menu.tsx`는 감사 제외 대상이지만 #36은 이 리포가 소유한 프리미티브의 결함이라 이 배치에서 고친다.

---

## B6 시각 체계 — 권장

**왜 한 배치인가**: DESIGN §6.2 등재 목록과 코드를 **한 번에** 맞춰야 한다 — 코드를 토큰으로 접을지 §6.2에 올릴지를 항목마다 판단하고, `/design-sync`로 실측해 닫는다.

**결정 기록 (2026-09-24)**
- **#50 → danger로 바꾼다** — DESIGN §6.4가 정본. `components/github-account.tsx:47`·`components/account/login-methods.tsx:106,140` 트리거를 `danger`로, 그 위의 "`danger`가 아니라 `default`다" 주석을 걷는다. ⚠️ 2026-09-13 핸드오프와 어긋나므로 **시안도 같이 고친다** — 안 고치면 `/design-sync`가 불일치로 되돌린다. `/projects/:slug/settings`의 같은 버튼도 함께 움직인다(주석이 "같은 버튼이 화면마다 다른 무게면 결함"이라 적는다).

**항목**
- [x] **#43** 🟡 `app/(edit)/projects/[slug]/logs/page.tsx:119` — `bg-white`(§6.2는 `auth-layout.tsx` 하나로 한정). → `bg-background`.
- [x] **#44** 🟡 §6.2 미등재 raw 색 — `text-amber-700`(key-list:70,73 · locale-panel:86,183-185 · workspace:566) · `border-amber-500/50`(base-language-form:47) · neutral-300(locale-panel:196 · role-chip:42) · neutral-400(publish-button:297 · tree-panel:107 · locale-panel:63 · source-detail-modal:147,158 · filter-menu:45 · general-card:34,68,82) · neutral-600(번역 작업 화면 전반) · `shadow-[…rgba(10,10,10,0.06)]`(publish-button:262). 번역 작업 화면 C4 분량이 §6.2에서 통째로 빠져 있다.
- [x] **#45** 🟡 임의 글자 크기 — `text-[15px]`(tree-panel:40 · key-list:44 · locale-panel:85) · `text-[13px]`(invite-modal:251,286,359 — `row-card.tsx:142` "0건" 주석이 거짓이 됨) · `text-[12px]`(key-list:92 · publish-button:258,273).
- [x] **#46** 🟡 `tracking-*` 29곳 vs DESIGN 체크리스트 "여덟". 3곳(key-list:64 · locale-panel:170,198)이 `text-sm` 토큰 값을 덮는다.
- [x] **#47** 🟡 `rounded-[10px]` 16곳(= `rounded-md`). Button size radius 덮기(key-list:40 · locale-panel:224 · source-detail-modal:160-162) · `h-8`이 넷째 버튼 높이(§6.4·§8).
- [x] **#48** 🟡 §6.8 밖 아이콘 크기 — `size-[15px]`(event-detail:208,310 · locale-panel:61 · filter-menu:51) · `[13px]`(source-detail-modal:156) · `[18px]`(sources-screen:93) · `[26px]`(general-card:42). 아이콘에 색 클래스 8곳(key-list:41 · workspace:398 등).
- [x] **#49** 🟡 프리미티브 손 재구현 — Skeleton(projects/loading:76 · [slug]/loading:167 · logs/loading:47 · publish-button:366) · Badge(attention-card:53 · log-filters:73 — Archived는 `Badge neutral`) · DropdownMenuTrigger hover 불일치(filter-menu:40-47 vs log-filters:223-228) · Alert 대용(logs/page:171 · event-detail:207).
- [x] **#50** 🟡 같은 행동 다른 variant — 연결 해제(github-account:47 · login-methods:106,140) · Retry(error.tsx default vs logs/error.tsx primary) · Clear filters(ghost vs primary, §6.8의 `RotateCcw` 없음) · Clear search(Link vs default Button, §6.4 예외 2는 default).

**경계**: `[slug]/loading.tsx`의 골격이 도착 화면과 다른 것(#18)은 **B7**(브라우저 확인이 먼저다). 이 배치는 Skeleton 프리미티브 교체만 한다.

---

## B7 어댑터·부채·문서 — 출시 후

**왜 뒤인가**: 출시를 막지 않는다. 한 번에 돌리지 말고 **소배치로 쪼갠다** — 아래 네 묶음이 각각 한 `/ship`이다.

### B7a 어댑터·push/pull 잔여
- [ ] **#12** 🟡 `lib/pull/run.ts:224-227` — no-changes 경로의 브랜치 되돌림이 PR base를 안 옮긴다(ARCHITECTURE §3 L3.7). 사람이 머지해야 해가 생겨 🟡.
- [ ] **#51** 🟡 `lib/adapters/code-dict.ts:435-443` — 중복 키에서 write는 첫 항목, push `lastWins`(payload.ts:103)는 마지막. read가 `duplicate-key`를 안 낸다.
- [ ] **#52** 🟡 `lib/pull/load.ts:105` × `lib/push/apply.ts:343` — chrome `"placeholders": null`이 왕복에서 사라진다.
- [ ] **#53** 🟡 `scripts/ingest.ts:161→170` — 의미 손실 exit 1을 마지막 줄이 0으로 덮는다.
- [ ] **#54** 🟡 `lib/survey/one.ts:151-170,506-586` — `renderLocaleFiles` 재구현, 동작 셋이 갈림(POSTMORTEM 2026-09-02 재발).
- [ ] **#55** 🟡 `lib/pull/render.ts:129` — multi-locale 갈래가 `writeStrategy` 없이 원본 필수 판정(잠복).
- [ ] **#56** 🟡 `lib/adapters/yaml-catalog.ts:302` — 삽입 키가 PLAIN(형제 스칼라 인용 타입을 안 따름).
- [ ] **#57** 🟡 BOM 축 0 — `chrome-locales.ts:137` · `json-catalog.ts:156` · `json-style.ts:119` · `shared.ts:333`(`catalogVerdict`가 후보 0으로). CI push exit 1 · 온보딩 예외 E.
- [ ] **#60** 🟡 `lib/pull/run.ts:82,226,242` — `invalidateDelivery?`가 선택 인자(불변식 9). 필수로.
- [ ] ⚪ **#83** `json-style.ts:121` 들여쓰기 10칸 절단 · **#84** `pull/plan.ts:58` · `json-catalog.ts:148` `{}` 대입(POSTMORTEM 2026-09-09) · **#85** `contract.test.ts:33-40` writeStrategy 단언 둘뿐 · "코드포인트" 표기.

### B7b 죽은 코드·중복
- [ ] **#64** 🟡 `lib/sync/query.ts` · `lib/sync/view.ts` · `SYNC_LOG_PAGE_SIZE` 고아 + `components/__tests__/logs-screen.test.ts:95` 이름만 참(POSTMORTEM 2026-09-03 재발).
- [ ] **#65** 🟡 `lib/keys/view.ts` 함수 13개 · `countUnpublished`(query.ts:185) 테스트끼리만.
- [ ] **#66** 🟡 `components/onboarding/first-ingest-retry.tsx` importer 0 · 테스트 3곳이 고정 · 실제 경로 `sources-screen.tsx:134`는 검사 밖.
- [ ] **#67** 🟡 테스트만 쓰는 export — `translations/selection.ts:14` · `summary.ts:30,57` · `protection/plan.ts:66` · `home/overview.ts:20`.
- [ ] **#73** 🟡 중복 — 커서 코덱 3벌 · `validNonce` 2벌 · 쿠키 만료 루프 4벌 · 콜백 경로 정규식 3벌 · `survey/select.ts:13-23` 정규식 사본 · `(cause as Error).message` 8곳 · `scripts/ingest.ts` ↔ `push-local.ts` probe/`--adapter`.
- [ ] ⚪ **#86** 미사용 메시지 키 약 60 · **#87** `IMPORT_STALE_AFTER_SECONDS` · `KeySaveInputType` · `ActorKind.UNKNOWN` · Account OAuth 컬럼 넷 · `_ownerId` · `confirmedAt`/`recordedAt` · **#90** `syncBranchFor` 위치.
- ⚠️ CLAUDE.md "기존 dead code는 언급만 하고 삭제하지 않는다" — 이 묶음은 **삭제를 명시로 요청받았을 때만** 지운다.

### B7c 진단·테스트 공백
- [ ] **#71** 🟡 삼킨 catch — `lib/projects/remote.ts:102,114,136` · `import-status-store.ts:36,64`(POSTMORTEM 2026-09-14 형태).
- [ ] **#72** 🟡 오류 객체를 버리는 catch — `account/actions.ts:69,115,140,262` · `settings/actions.ts:359,368,414,449`.
- [ ] **#74** 🟡 테스트 없는 순수 export — `lib/events/payload.ts:178 readPayload`(~40분기) · `events/filter.ts:100,125,134` · `projects/remote-plan.ts:57` · `events/view.ts:310,402`. 픽스처 편향 — 빈 파일이 YAML뿐 · 백틱 인용 0.
- [ ] ⚪ **#80** `entry-points.test.ts:103` 줄 끝 주석 · **#81** `credential-separation.test.ts:91` 범위 누락 · **#90** 약한 테스트(`message.test.ts:99` · `conversion.test.ts:18`).

### B7d 문서 드리프트
- [ ] **#61** 🟡 `lib/push/apply.ts:133` · ARCHITECTURE:1107 "저장 경로엔 잠금이 없다" 거짓(B1이 먼저 건드렸으면 닫힘).
- [ ] **#62** 🟡 `prisma/schema.prisma:267` 쓰기 주체 서술 낡음.
- [ ] **#63** 🟡 `lib/protection/where.ts:6-7` · CLAUDE.md "손 사본 둘" 목록 틀림 — 실제는 `translation-list.ts:156,274`. `list-aggregates.integration.ts:76,331,524`가 죽은 `loadKeys`를 잰다(POSTMORTEM 2026-09-15 재발).
- [ ] **#68** 🟡 `lib/events/`가 ARCHITECTURE:3 · `.claude/commands/push.md:110` 코어 목록에 없다.
- [ ] **#69** 🟡 DIRECTORY.md :503(14→16테이블) · :547(include 범위) · :21-22(`/privacy`) · :73(21→22).
- [ ] **#70** 🟡 PRODUCT:795 §10 `AuditEvent`(결정됨) · README:9 · README:60.
- [ ] ⚪ **#88** 거짓 주석 — `lib/compare.ts:2` · `auth/invite-label.ts:28` · `keys/query.ts:329-333`.
- [ ] **#18** 🟡 `[slug]/loading.tsx` 골격 불일치(브라우저 확인 후).

### B7e 보안 하드닝(⚪)
- [ ] **#75** `next.config.ts` — CSP Report-Only · `unsafe-inline` · HSTS·Permissions-Policy 없음. **enforce 전에 `form-action`에 `accounts.google.com` 추가**(안 하면 Google 로그인이 막힌다).
- [ ] **#76** `/api/push` 본문 크기 상한 없음 · `/api/push/failure`는 다 읽은 뒤 잰다.
- [ ] **#77** 레이트리밋 없음(업로드·토큰 회전·login-link·session-revocation·acceptInvitation).
- [ ] **#78** `account-connect/http.ts:33` · `session-revocation/http.ts:33` origin null 시 `secure` 규칙 갈림.
- [ ] **#79** `app/invite/actions.ts:85` 보관 프로젝트 초대 수락(접근은 막힘).
- [ ] **#82** prod `pg_default_acl`의 `supabase_admin` 소유 3행 잔존 · prod만 anon `public` USAGE. CLAUDE.md "탐지" 상태 그대로 — 코드 조치 없음, `/db` 5단계 확인 유지.
- [ ] **#89** 작은 a11y — `locale-meter.tsx:43` · `source-detail-modal.tsx:72` · `repository-form.tsx:74,76` · `form-group.tsx:52` · `event-detail.tsx:92`.

---

## 부록 — 통과한 축 (재검사 불필요)

- **인가**: matcher `["/projects/:path*", "/account"]`가 `(edit)` 전부를 덮는다 · 페이지·Action 인가 누락 0 · `AUTH_ALLOWED_LOGINS` 0 · `/api/push` sha256 해시 조회 · `/api/pull` `timingSafeEqual` + fail-closed · callback HMAC state · open redirect 0 · 초대 수락 CAS.
- **테넌시**: 클라이언트 id 전부 인가된 `projectId`로 재조회 · `$queryRawUnsafe` 0 · `$executeRawUnsafe` 1(상수 SQL).
- **노출**: 클라이언트 props에 토큰·해시·암호문 0 · `dangerouslySetInnerHTML` 0 · SSRF 0 · 쿠키 7종 `httpOnly`·`__Host-`/`__Secure-` · 업로드 매직바이트 + `limitInputPixels`.
- **DB**: anon·authenticated 테이블 GRANT dev·prod 0 · RLS 17테이블 off(문서와 일치).
- **불변식**: 병합·승자 판정 0 · StringKey·Translation·Locale DELETE 0 · blob SHA `Buffer.byteLength` · `base_tree` · parents = base head · `[skip-malmoi-i18n]` · PR 재사용 · `orderedEntries` 단일 관문 · 페이로드 생산자 하나 · `unnest` 열 수 일치 · PRODUCT §4.2 유입 0.
- **위생**: `any` 0 · 최상위 env 평가 0 · 로컬 타임존 0 · `dark:` 0 · `Malmoi` 표기 0.

## 부록 — 통계

```
감사 범위: 전체 / invariant + principle + boundary + debt + UX·Design
검사 파일: 약 700개(중복 제외 추정)
POSTMORTEM: 122항목 중 86건 재검사, 중복 제외 재발 13건
  09-23 TOCTOU · 09-08 실패 뒤 refresh · 09-14 거부 문구 버튼 이름 · 09-19 표 접근 이름 · 09-20 포커스 복귀
  09-22 raw 색 등재 · 09-02 writeStrategy 분기 · 09-02 survey 미동기 · 09-03/09-16 표현 보존
  09-09 대입 자리 · 09-03 이름만 참인 테스트 · 09-14 삼킨 catch · 09-15 "N곳뿐" 주장
발견: 🔴 8 · 🟡 66 · ⚪ 16 (합계 90)
```
