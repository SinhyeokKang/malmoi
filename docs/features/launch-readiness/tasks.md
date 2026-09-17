# tasks — 1.0.0 런칭 준비 (2026-09-17 전체 감사)

출처는 2026-09-17 `/audit`(invariant · principle · boundary · debt + launch 렌즈, dev @ `9890bf9`)이다. 발견 48건(🔴 4 · 🟡 37 · ⚪ 7)을 태스크로 옮겼고, 각 태스크 끝의 `(audit #n)`이 그 리포트의 번호다. **체크박스는 구현 완료 상태가 아니다.**

**이 문서가 생긴 이유**: 같은 날 GitHub App과 `malmoi` 리포가 둘 다 private이었던 것이 드러났다 — 모든 검증이 오너 계정(`SinhyeokKang`)으로 돌아서 그 계정에서만 통과하는 설정이 안 보였다. PRODUCT §1의 완료 조건("낯선 리포를 연결한 사용자가 설명 없이 완주")을 막는 것이 R0·R1이고, 나머지는 같은 감사에서 나온 결함·공백·부채다.

**읽는 법**
- 라운드 순서는 **런칭 차단 → 데이터 결함 → 첫 사용 경험 → 방어선 → 부채**다. R0은 코드가 아니라 콘솔이다.
- 🔒 = **제품 결정이 먼저**다. `/implement`는 이 표시에서 멈추고 결정을 받는다. 결정이 나면 PRODUCT 또는 ARCHITECTURE를 먼저 고치고 태스크를 푼다.
- 검증 줄은 자동(`pnpm test` · `pnpm test:projects:postgres` · `pnpm typecheck`)과 수동(`/bugshot-qa` · `/design-sync` · `/l10n-roundtrip` · 콘솔)을 구분한다.
- "0회/없음"을 단언하는 검증은 **같은 픽스처의 허용 경로에서 N > 0**을 짝으로 단언한다(POSTMORTEM 2026-09-14).
- 감사 발견은 정적 읽기다 — **각 태스크의 첫 검증은 재현(red)이다.** 재현이 안 되면 태스크를 닫고 그 사실을 적는다.
- 끝나면 결론을 PRODUCT·ARCHITECTURE·DESIGN·OPERATIONS로 올리고 이 디렉터리를 지운다(CLAUDE.md `/feature` 규칙).

---

## R0 — 콘솔 확인 (코드 없음, 가장 먼저)

오너 계정에서는 전부 통과하는 부류라 코드로 판정할 수 없다. 결과가 R1 이후 태스크의 범위를 바꾼다.

- [ ] L0.1 Google OAuth 동의 화면의 게시 상태를 확인한다. `CLAUDE.md:58`·`.env.example:81`이 "External + 테스트"로 적는다 — 테스트 모드면 등록된 테스트 사용자만 로그인된다. (audit #4)
  - 검증(수동): 테스트 사용자 목록에 없는 Google 계정으로 `https://mal-moi.com/signin` 로그인 시도 → 성공이면 닫는다. `403 access_denied`면 L1.1로 간다.
- [ ] L0.2 GitHub App `malmoi-prod`의 "Request user authorization (OAuth) during installation" 설정과 Setup URL·callback URL 목록을 확인한다. 켜져 있으면 설치 직후 state 없는 콜백이 와서 L2.4가 🔴로 올라간다. (audit #8)
  - 검증(수동): 설정 스크린샷을 이 태스크에 링크한다. `external_url`이 `https://github.com`인 것도 같이 본다(audit #42).
- [ ] L0.3 Vercel 플랜(Hobby 약관은 비상업 용도)과 cron 한도, Supabase prod의 플랜·비활성 자동 일시중지·PITR을 확인한다. (audit #11)
  - 검증(수동): 확인한 값을 docs/OPERATIONS.md에 적는다 — 지금 문서에 없다.
- [ ] L0.4 `malmoi-test-org`에서 **관리자가 아닌 멤버**의 설치 요청 경로를 실측한다(오너 설치는 2026-09-17에 확인함). 두 번째 GitHub 계정이 필요하다. (audit #8)
  - 검증(수동, `/bugshot-qa`): 요청 전·요청 후 승인 대기·승인 후 새로고침 세 화면의 문구를 기록한다. L2.4의 입력이다.

## R1 — 런칭 차단 (🔴)

- [ ] L1.1 🔒 Google 로그인을 제3자에게 연다(L0.1이 테스트 모드일 때만). 프로덕션 게시에는 개인정보처리방침 URL이 필요하다 → L2.1이 선행이다. (audit #4)
  - 결정: 게시 신청(검증 심사 범위·기간) vs 런칭 시점에 Google 로그인을 끄고 GitHub만 둔다. PRODUCT §0상 첫 편집자가 비개발자라 뒤엣것은 초대 경로를 약하게 만든다.
  - 검증(수동): 테스트 사용자 목록 밖 계정으로 초대 링크 → 로그인 → 수락까지 완주.
- [ ] L1.2 번역 PR을 **merge commit**으로 머지해도 루프 마커가 살아 있게 한다. `lib/pull/run.ts:217`·`lib/pull/payload.ts:76`은 마커를 커밋 메시지에만 넣고, 검사 셋(`action.yml:82`·`lib/onboarding/workflow.ts:143`·`docs/ACTIONS.md:58`)은 `head_commit.message`만 본다. merge commit이면 메시지가 `Merge pull request #N …` + PR 제목이라 마커가 없고, CI push가 DB를 Publish 시점 값으로 덮어 그 뒤 편집이 사라진다. (audit #1)
  - 방향(설계 시 확정): PR 제목에 마커를 넣는다 / 검사 쪽이 머지 커밋이면 두 번째 부모의 메시지도 본다 / 둘 다. ⚠️ `action.yml`을 바꾸면 **태그 `malmoi-i18n-push-v1` 릴리스**이고 대상 리포에 즉시 닿는다(CLAUDE.md 브랜치 정책).
  - 검증(자동): 마커 판정을 순수 함수로 뽑아 merge commit·squash(`PR_TITLE` 설정 포함)·rebase 세 메시지 모양에서 skip, **사람 커밋에서는 run** 대조.
  - 검증(수동, `/l10n-roundtrip`): 폐기용 리포에서 "Create a merge commit"으로 머지 → push run이 skip 로그를 남긴다. 지금 그 스킬은 `--squash`만 돈다(`.claude/commands/l10n-roundtrip.md:108`) — 머지 방식을 스킬에 추가한다.
- [ ] L1.3 🔒 push가 **리포에서 지우거나 `""`로 바꾼 번역**을 DB에 반영하지 않는다. `lib/push/apply.ts:254`의 `t.value !== ""` 필터 때문에 결과가 셀 단위로 리포 ∪ DB 합집합이 되고, 다음 번역 PR이 지운 번역을 되살린다. ARCHITECTURE §5.5.2 "예외도 없다"와 어긋나며 이 예외를 설명하는 문서가 없다. (audit #2)
  - 결정: (a) 리포에 값이 없으면 DB 셀도 비운다(strict를 문자 그대로) / (b) 지금 동작을 유지하고 "코드에서 번역을 지우는 방법은 없다, UI에서 비운다"를 ARCHITECTURE §0·§5.5.2에 명시한다. (a)는 편집 손실 창을 넓힌다 — 번역자가 방금 채운 셀이 그 로케일 파일에 아직 없으면 push가 지운다.
  - 검증(자동, PG): 결정한 쪽의 동작을 `lib/push/__tests__/`에 고정 — 리포 `fr` 셀 삭제 → push → DB 셀 상태, **같은 픽스처에서 값이 있는 셀은 덮어씀** 대조. 뒤이은 pull 계획이 그 셀을 어떻게 내는지까지.
  - 검증(자동): `lib/push/apply.ts`를 건드리면 `pnpm test:projects:postgres` green.
- [ ] L1.4 yaml-catalog·code-dict에서 **깊이 2 이상의 점(.) 포함 키**가 write마다 중복 삽입되는 것을 막는다. `lib/adapters/yaml-catalog.ts:367,472` · `lib/adapters/code-dict.ts:388,444` — 조회가 점 키를 `prefixPath` 바로 아래에서만 찾고 실패하면 `missing`으로 가서 삽입한다. (audit #3, POSTMORTEM 2026-09-02 "구분자가 데이터에도 있어서" 재발)
  - 검증(자동): `ko: { errors: { "messages.blank": x } }` 픽스처로 값 무변경 write → **원본 바이트 동일**, 값 변경 write → 그 줄만 바뀜, 재read에 `duplicate-key` 없음. code-dict는 `{ el: { 'a.b': 'x' } }`로 같은 셋. 계약 매트릭스(`lib/adapters/__tests__/contract.ts`)에 "깊은 점 키" 축을 추가해 다섯 어댑터 전부에 돈다.
  - 검증(자동): 같은 부류 `json-catalog.ts:199`(평탄·중첩 키 충돌 시 조용히 하나를 버림)도 이 축에서 read 에러가 나는지 확인한다. (audit #20)

## R2 — 첫 사용 경험 (🟡 launch)

- [ ] L2.1 개인정보처리방침 본문을 쓴다. `app/privacy/page.tsx:12`가 placeholder인데 로그인 화면이 그 방침에 동의받는다(`messages/en.tsx:234-235`). L1.1의 선행이다. (audit #6)
  - 검증(자동): `no-korean-ui`·`brand-spelling` green. 검증(수동): 로그인 화면 링크 → 본문 도달.
- [ ] L2.2 LICENSE(MIT)를 넣고 `public/flags/*.svg` 253개의 출처·라이선스를 확인해 기록한다(SVG의 `clip0_301_*` id로 보아 Figma 내보내기). 출처를 못 밝히면 교체한다. (audit #14)
  - 검증(수동): `gh api repos/SinhyeokKang/malmoi --jq .license.spdx_id` → `MIT`. docs/DESIGN.md §국기 절에 출처 한 줄.
- [ ] L2.3 🔒 도움말 경로. `app/docs/page.tsx:10`이 placeholder, 랜딩 페이지 없음, 설정 화면(`app/(edit)/projects/[slug]/settings/page.tsx:214-218`)이 링크 없는 텍스트 `docs/ACTIONS.md`(한국어 내부 문서)를 가리킨다. 공개 README도 "사내 도구"·운영자용이다(audit #42). (audit #7)
  - 결정: `/docs`에 무엇을 싣나(워크플로 설정 · 머지 방식 · 상한 · 지원 포맷) / README를 공개 독자용으로 바꾸고 운영 문서는 docs/로 내린다.
  - 검증(수동, `/bugshot-qa`): 새 계정이 설정 화면의 안내만 따라 워크플로를 붙인다.
- [ ] L2.4 설치 흐름의 막힘 둘. (audit #8)
  - Setup URL이 없어 설치 후 GitHub 설정 화면에 남는다 — `installation_id`·`setup_action` 착지를 받아 `/projects/new`로 되돌린다(L0.2 결과에 따라 설계).
  - 관리자 아닌 조직원이 설치를 "요청"하면 승인 전까지 설치 0개라 `no-installations` 문구("Install" + 새로고침)가 반복된다(`app/(edit)/projects/actions.ts:542`, `messages/en.tsx:1060-1066`). 요청 대기 가능성을 문구에 넣는다.
  - 검증(자동): 착지 파라미터 판정 순수 함수 — 정상·state 없음·위조 `installation_id`(사용자 설치 목록에 없음 → 무시) 대조.
  - 검증(수동, `/bugshot-qa`): L0.4의 세 화면 재실측.
- [ ] L2.5 조직 Actions 허용 목록 안내. 허용 목록을 쓰는 조직에서는 `SinhyeokKang/malmoi/...`와 action 안의 `pnpm/action-setup`이 `not allowed to be used`로 막힌다(`.github/actions/malmoi-i18n-push/action.yml:110,116`). docs/ACTIONS.md와 L2.3의 도움말에 허용해야 할 action 목록을 적는다. (audit #5)
  - 검증(수동): `malmoi-test-org`에서 "Allow select actions" + 목록 등록 → run이 action 해석 단계를 통과.
- [ ] L2.6 상한과 네임스페이스 안내. (audit #9)
  - 멤버 10명 초과 시 `Couldn't create the link: member-limit`이 코드 그대로 노출된다(`components/members/invite-dialog.tsx:125-128`) — 사전 문구로.
  - 프로젝트 3개 상한을 ③ 끝이 아니라 ① 진입 시 판정해 알리고, 보관하면 자리가 빈다는 것을 말한다(`app/(edit)/projects/actions.ts:852,941`).
  - slug 충돌을 ③ 이름 입력 중에 알린다(`components/onboarding/steps/naming.tsx:89`). slug는 전 사용자 공용 네임스페이스라 `web`·`app` 같은 리포 이름은 충돌한다.
  - 검증(자동): 각 판정 순수 함수 + DOM — 상한 도달에서 안내, **상한 미만에서 안내 없음** 대조.
- [ ] L2.7 🔒 연결 불가 리포 모양의 안내. 로케일 하나뿐인 리포(`messages/en.tsx:2072`, ARCHITECTURE:186)와 트리가 잘리는 모노레포(`en.tsx:2074`). (audit #10)
  - 결정: 단일 로케일 리포를 받을지(PRODUCT §7.1 "로케일 추가·삭제 안 함"과의 관계) / 안내만 고칠지.
  - 검증(자동): 결정에 따른 탐지 결과·문구 테스트.
- [ ] L2.8 초대 이메일 대조가 GitHub **primary** 주소만 본다(`lib/auth/email.ts:64-69`). 거부 문구(`messages/en.tsx:2007`)가 그 조건을 말하게 하거나 verified 주소 전체로 대조를 넓힌다(🔒 — 넓히면 ARCHITECTURE §6 초대 대조 계약이 바뀐다). (audit #13)
  - 검증(자동): primary ≠ 초대 주소 & verified 목록에 있음 → 결정한 동작, **primary = 초대 주소 → 수락** 대조.
- [ ] L2.9 야간 cron의 규모와 공지. `app/api/pull/route.ts:26,70`이 최대 50개를 60초 안에 직렬로 돌고 중간 시간 예산이 없다. 온보딩은 야간 자동 PR이 생긴다는 것을 말하지 않는다(PRODUCT §4.1과 어긋남). (audit #11)
  - 검증(자동): 시간 예산 초과 시 남은 대상을 건너뛰고 응답에 싣는 순수 판정 — 예산 안 N개 처리 · 초과 시 중단 대조.
  - 검증(수동): 온보딩 ④ 문구에 야간 PR 한 줄.
- [ ] L2.10 🔒 App 하나를 로컬·dev·프로덕션이 공유한다(`CLAUDE.md:266`). 공개 뒤엔 로컬 머신의 개인키로 **모든 외부 설치**의 contents:write 토큰을 발급할 수 있다. (audit #12)
  - 결정: 프로덕션 전용 App을 분리하고 로컬·preview는 별도 App(설치 대상은 폐기용 리포만) / 유지하고 키 보관 규칙만 OPERATIONS에 적는다. 분리하면 기존 프로젝트의 `installationId` 재연결이 따라온다(malmoi#52).
  - 검증(수동): 결정 후 OPERATIONS.md에 키 위치·회전 절차.

## R3 — 동작 결함 (🟡)

- [ ] L3.1 `lib/keys/query.ts:118-120` — 평범한 `{}`에 `Locale.code`를 대입하고 `lib/keys/view.ts:112,334`·`components/translations/key-group.tsx:96`이 `hasOwn` 없이 읽는다. `constructor` 로케일이면 "Not sent" 배지·필터가 거짓으로 켜진다. 같은 부류 `lib/pull/plan.ts:58`·`lib/adapters/json-catalog.ts:148`도 `Object.create(null)`로. POSTMORTEM 2026-09-09의 grep 패턴에 `t.localeCode` 모양을 더한다. (audit #17)
  - 검증(자동): `constructor`·`__proto__`·`toString` 로케일 픽스처로 셀 맵·`isUnpublished`·필터 — 번역 행 없으면 미발송 아님, **행이 있으면 미발송** 대조.
- [ ] L3.2 설치 조회 실패를 "설치 안 됨"으로 접지 않는다. `app/(edit)/projects/actions.ts:1404-1411` `checkRepoAccess`가 설치 하나의 리포 목록 조회 실패(403·5xx)를 로그 없이 `{ repos: [] }` → `repo-not-installed`로 만든다. 형제 `listConnectableRepos`(550-573)는 로그를 남긴다. (audit #15, POSTMORTEM 2026-09-03 재발)
  - 검증(자동): 5xx → `unavailable` + 로그 1줄, 404 → `repo-not-installed`, **정상 목록에 리포 있음 → ok** 대조.
- [ ] L3.3 Publish 미리보기가 세션 만료·접근 거부를 원인 없이 "미리보기 실패 / Retry"로만 그린다(`app/(edit)/publish-actions.ts:10-18`, `components/publish-button.tsx:54,356`). 결과를 union으로 갈라 세션 만료에 `Sign in`, 거부에 접근 문구. (audit #16)
  - 검증(자동, DOM): 세 갈래 각각의 문구·버튼, **정상 → 미리보기 표** 대조.
- [ ] L3.4 🔒 보관된 프로젝트에 쓰는 Action. `runFirstIngest`(`app/(edit)/projects/actions.ts:1066-1095`)가 프로젝트 `archivedAt`을 안 본다(같은 권한의 `addSurface`·`runRepositoryImport`는 거부). (audit #18)
  - 결정: `updateBaseLocale`·`connectRepository`·`updateRepositorySettings`·`rotatePushToken`까지 보관 중 허용할지. PRODUCT §7.9 "보관은 멈춘다"에 목록으로 적는다.
  - 검증(자동): 보관 프로젝트에서 각 Action → 결정대로, **활성 프로젝트 → 성공** 대조.
- [ ] L3.5 `lib/push/apply.ts:243-248` — `needsReview` 전파 UPDATE가 `updatedAt`만 올리고 `updatedBy`는 그대로라, 이미 PR로 보낸 편집이 "안 보낸 편집"으로 다시 잡힌다. POSTMORTEM 2026-09-15의 전제("두 컬럼은 배타적으로만 채워진다")도 이 경로에서 거짓이다 — 그 항목에 정정을 덧붙인다. (audit #19)
  - 검증(자동, PG): Publish → 원문 변경 push → 그 셀이 미발송 술어 네 사본 모두에서 제외, **원문 변경 후 번역자가 다시 저장 → 포함** 대조. `pnpm test:projects:postgres` green.
- [ ] L3.6 어댑터 잠재 결함. (audit #20)
  - `lib/adapters/json-catalog.ts:325` `normalizeArrays`에 루트 예외가 없어 최상위 키가 `"0".."n-1"`이면 루트가 배열로 나가고 다음 read가 `root-not-object`로 로케일 전체를 떨어뜨린다.
  - `lib/pull/render.ts:126` multi-locale 분기가 `writeStrategy`가 아니라 원본 부재로 판단한다(지금은 도달 불가, ARCHITECTURE §1 경고 패턴).
  - `lib/adapters/yaml-catalog.ts:329` · `code-dict.ts:294`가 원본을 경로가 아니라 `currentFiles?.[0]`으로 고른다.
  - 검증(자동): 루트 숫자 키 픽스처 왕복 → 객체 유지. 나머지 둘은 계약 매트릭스에 "원본 파일 둘" 축.
- [ ] L3.7 동작 어긋남. (audit #21)
  - `lib/pull/run.ts:210-211` — base 브랜치를 바꾸면 저장된 `baseBranch`로 옛 PR을 못 찾아 PR이 하나 더 열린다.
  - `lib/publish/read.ts:45-46` — per-locale 수술적 어댑터에서 로케일 파일이 없으면 미리보기는 변경을 약속하는데 pull은 `missingOriginal`로 안 낸다(`render.ts:104-108`).
  - `app/api/push/route.ts:170,182` — `markImportStarted`가 트랜잭션 밖에서 `lastImportToken`을 덮어 동시 CI 두 건이면 표면이 `import-failed`로 표시될 수 있다.
  - 검증(자동): 각각 재현 테스트 red → green, 정상 경로 대조.
- [ ] L3.8 `lib/login-link/http.ts:94` — `new Request(...) as unknown as NextRequest`. `AUTH_URL`·`NEXTAUTH_URL`을 설정하는 순간 next-auth가 `req.nextUrl`을 구조 분해해 계정 연결 콜백이 전부 TypeError가 되고 `:120`이 무로그 500으로 삼킨다(지금은 잠복). (audit #22)
  - 검증(자동): `AUTH_URL`을 stub한 상태에서 콜백 핸들러가 던지지 않는다, **미설정에서도 동일** 대조.
- [ ] L3.9 `lib/sync/run.ts:168-169`가 `failure.detail`(에러 원문)을 `console.error`한다. `lib/github-connect/log.ts:16-24`의 "원문 금지" 규칙과 반대다. (audit #23)
  - 검증(자동): 로그 인자에 `error.message` 원문이 없음(스파이), **갈래 이름은 있음** 대조.
- [ ] L3.10 미발송 술어 넷째 사본 `lib/publish/read.ts:19-20`을 `test:projects:postgres`의 동등성 대조에 넣는다. CLAUDE.md "세 벌" 서술도 넷으로. (audit #24)
  - 검증(자동, PG): 네 사본이 같은 행을 센다 — 보관 표면·orphan 로케일 포함 픽스처.
- [ ] L3.11 🔒 `TranslationSurface.archivedAt`은 쓰는 곳이 0이고 필터로만 읽힌다(PRODUCT §7.1 "표면 보관·복원은 다음 라운드"). 선반영 결함으로 지울지, 다음 라운드 계획으로 둘지. (audit #24)
  - 검증(자동): 결정에 따라 스키마(`/db`, additive-first 역순 주의) 또는 PRODUCT 한 줄.

## R4 — 방어선 공백 (🟡 테스트)

- [ ] L4.1 `lib/pull/load.ts:78` `sortIndex` 매핑을 지우면 red가 나게 한다. `entry-order.test.ts:51`이 `loadState`를 스텁하고 `:114`가 `[]`를 돌려 select만 본다. ARCHITECTURE §1.1 "어느 홉이 끊겨도 red"가 이 줄에서 거짓이다. (audit #25, POSTMORTEM 2026-09-07 재발)
  - 검증(자동): 매핑 줄 삭제 뮤테이션 → red.
- [ ] L4.2 `lib/push/__tests__/flow.test.ts:331-340`이 `projectId`만 본다 — `apply.ts:239`의 `AND "surfaceId"`를 지워도 green, 스텁 표면이 `lastCommitAt: null` 고정이라 트랜잭션 안 가드(`apply.ts:110-114`)가 한 번도 안 돈다. `app/api/__tests__/route-diagnostics.test.ts:45`의 mock에 `ApplyGuardError`가 없어 500 테스트가 우연히 통과할 수 있다. (audit #26)
  - 검증(자동): `surfaceId` 조건 삭제 뮤테이션 → red / 가드 발동 픽스처 → 409 / mock에 `ApplyGuardError` 추가 뒤 500 테스트가 의도한 이유로 green.
- [ ] L4.3 이름과 본문이 다른 테스트를 고친다: `lib/adapters/__tests__/nested-keys.test.ts:105` · `yaml-catalog.test.ts:213`과 code-dict의 "중간 경로를 만든다" · `lib/survey/__tests__/one.test.ts:339` · `components/__tests__/members-screen.test.ts:63` · `lib/keys/__tests__/repository-import.integration.ts:191`. (audit #27, POSTMORTEM 2026-09-03 재발)
  - 검증(수동): 각 테스트의 제목 문장을 본문 단언이 문자 그대로 검사한다(리뷰).
- [ ] L4.4 `?.` 뒤 부정 단언을 존재 단언으로 선행한다: `lib/pull/__tests__/render.test.ts:105,214,223,270` · `run.test.ts:605` · `app/api/__tests__/github-callback.test.ts:307,337` · `components/__tests__/new-project.test.tsx:565`. (audit #28, POSTMORTEM 2026-09-14 후속 1순위)
  - 검증(자동): 대상 파일을 픽스처에서 빼는 뮤테이션 → red.
- [ ] L4.5 픽스처 편향: JSON 어댑터 CRLF(`JsonStyle`에 개행 필드 없음, `lib/adapters/json-style.ts:24-44`) · ts-dict 스타일 한 가지 · scan 픽스처 전부 큰따옴표 · `` t(`key`) `` 거부(`lib/scan/ast.ts:250-256`) 미고정. (audit #29)
  - 검증(자동): 각 축에 둘째 스타일 픽스처 — CRLF 원본 값 무변경 write → 바이트 동일.
- [ ] L4.6 survey 측정을 프로덕션 write 경로에 맞춘다. `lib/survey/one.ts:499` `writePerLocale`이 `buildWriteEntries`를 안 거쳐 `diffRatioNonBase`가 비-base 재배열을 ≈0으로 보고하고, `order-metrics.test.ts:196`이 그 0을 고정한다. `:534` `writeMultiLocale`이 `writeWithErrors`가 아니라 `write`를 불러 ts-dict `writeErrors`가 구조적으로 0이다. (audit #30, POSTMORTEM 2026-09-02 재발)
  - 검증(자동): 키 순서가 base와 다른 `ko.json` 픽스처 → `diffRatioNonBase > 0`. ⚠️ 고치면 ARCHITECTURE §1.9 지표가 바뀐다 — `/push` 4d 재측정 판단.
- [ ] L4.7 프로덕션이 안 쓰는 경로를 고정한 테스트를 실제 경로로 옮긴다: `lib/onboarding/workflow.ts:51` `renderWorkflowYaml`(온보딩은 `renderProjectWorkflowYaml`, `actions.ts:925`) · `lib/auth/safe-adapter.ts:31-38` `getSessionAndUser`(프로덕션에선 `lib/credentials/adapter.ts:54-63`에 가려짐, `auth.ts:82` 주석도 낡음). 안 쓰는 쪽은 지운다. (audit #31, POSTMORTEM 2026-09-02 "순위 픽스" 재발)
  - 검증(자동): 테스트가 프로덕션 호출 경로를 import한다(grep) · 지운 함수의 참조 0.
- [ ] L4.8 테스트 없는 순수 모듈에 단위 테스트: `lib/settings/message.ts`(`Object.hasOwn` 가드가 소스 텍스트로만 검사됨) · `lib/survey/ts-shape.ts` · `lib/survey/stats.ts` · `lib/scan/ast.ts`. (audit #32)
  - 검증(자동): 각 모듈 직접 import 테스트, `hasOwn` 가드는 `constructor` 키로 red→green.
- [ ] L4.9 검사 범위 공백: `components/__tests__/client-graph.test.ts`가 npm 패키지 이름만 금지(의존성 없는 서버 모듈 유입 통과) · `lib/github-connect/__tests__/credential-separation.test.ts`가 `app/**`를 안 훑는다. (audit #47)
  - 검증(자동): `lib/env.ts`를 `"use client"` 파일에서 import하는 뮤테이션 → red / `app/**`에 `new Octokit` 추가 뮤테이션 → red.

## R5 — 삼킨 실패 (🟡)

- [ ] L5.1 POSTMORTEM 2026-09-14 후속 미이행: `auth.ts:200-203` · `lib/credentials/access.ts:11` · `lib/credentials/storage.ts:7`(`MissingEnvError`의 변수 이름까지 버림) · `lib/credentials/command.ts:35`. PII 키 하나가 빠지면 로그인·초대가 전부 "Unavailable"이고 서버 로그 0줄이다. `logFailure` 형으로 갈래 이름을 남긴다(원문 금지). (audit #33)
  - 검증(자동): 각 catch 경로에서 로그 1줄 + 갈래 이름, 원문 없음, **성공 경로 로그 0** 대조.
- [ ] L5.2 같은 형 확산: `lib/session-revocation/store.ts:34,56` · `http.ts:56` · `lib/login-link/http.ts:120-122` · `store.ts:92-94,163-165` · `lib/projects/open-pr.ts:25-27` · `app/(edit)/projects/actions.ts:200-202` · `app/invite/actions.ts:103-105` · `app/(edit)/account/actions.ts:166,195-197` · `app/invite/[token]/page.tsx:72,92-94` · `app/signin/link/[challenge]/page.tsx:50-53` · `app/(edit)/projects/[slug]/surfaces/new/page.tsx:21-22`. OAuth 콜백 래퍼 셋(`session-revocation/http.ts` · `account-connect/http.ts` · `login-link/http.ts`)의 예외 처리(상태 코드·로그·state 쿠키 정리)를 하나로 맞춘다. (audit #34)
  - 검증(자동): 세 래퍼에 같은 예외 주입 → 같은 상태 코드·로그 1줄·쿠키 정리.

## R6 — 문서 드리프트 (🟡, 문서별 커밋)

- [ ] L6.1 "리포·App private" 전제 제거: `docs/ACTIONS.md:9,11,76-77` · `CLAUDE.md:171,232` · `README.md:63` · `.claude/commands/merge.md:7` · `.claude/commands/push.md:9` · `.github/actions/malmoi-i18n-push/action.yml:7-9`(주석 — 태그 릴리스와 묶는다). public이면 Free에서도 브랜치 프로텍션이 가능하다 → 🔒 켤지 결정(`/merge` 게이트 서술이 바뀐다). (audit #35)
  - 검증(수동): `grep -rn "private" docs CLAUDE.md README.md .claude/commands` 결과를 한 줄씩 판정. `pnpm sync:agents:check`.
- [ ] L6.2 코어 모듈 목록 둘(`docs/ARCHITECTURE.md:3` · `.claude/commands/push.md:110`)에 `lib/publish/` 추가(`lib/search-params.ts` 판정 포함). (audit #36)
  - 검증(자동 아님, 수동): `ls lib` ↔ 두 목록 diff 0.
- [ ] L6.3 문서끼리 모순: GitHub OAuth 앱 개수(`CLAUDE.md:149` "하나" vs `README.md:65` · `docs/PRODUCT.md:194` · `.env.example:107` · `.claude/commands/push.md:180`) · `.claude/commands/audit.md:121` "RLS 없음 — 유일한 방어선" · PRODUCT §10 미결 목록 안의 결정 항목(`:626`)과 `docs/ACTIONS.md:19`가 가리키는 없는 항목 · PRODUCT의 옮겨진 §5·§6 참조(`:151,231,335,459,535,548,625`) · `README.md:7` "원격 배포 대기" · `lib/github-connect/origin.ts:41`의 셋째 호스트 문서 부재. (audit #37)
  - 검증(수동): 항목마다 정본 하나를 정하고 나머지를 그 문장으로.
- [ ] L6.4 숫자·목록: `docs/DIRECTORY.md:25` 예외 아홉(실제 10+1) · `:348` 12테이블(13) · `:61-62` 열둘(16) · `CLAUDE.md:223` 여섯 개(8) · DIRECTORY 미등재(`app/api/auth/[...nextauth]/` · `app/(edit)/publish-actions.ts` · components 루트 6개 · `components/projects/search-input.tsx` · `prisma/maintenance/` · `prisma/__tests__/` · `.github/actions/malmoi-i18n-push/` · vitest 설정 둘 · `types/next-auth.d.ts`) · `DIRECTORY.md:352-353` `smoke-blob` · CLAUDE.md 데이터 경로 표에 `app/api/push/failure/route.ts`·`publish-actions.ts` · 명령 표에 `credentials:finalize:*`·push:local `--surface`/`--path-template`·adapter-survey `--limit`/`--jobs` · `prisma/schema.prisma`의 `docs/MVP.md`·"SAAS §8" 참조 · `docs/ARCHITECTURE.md:5` 죽은 `(미구현)` 범례. 수치는 가능하면 문장에서 빼고 테스트가 센다(POSTMORTEM 2026-09-15). (audit #38)
  - 검증(수동): `/doc-check`로 대조.
- [ ] L6.5 근거를 정본으로 올린다: `needsReview`("To review")가 비범위 승인 워크플로가 아니라는 것을 PRODUCT에 · `repositoryImportToken`·`lastImportToken`·`importRevision`의 근거를 ARCHITECTURE로 올리고 남은 `docs/features/sync-edit-protection/`의 처분 판정. (audit #39)
  - 검증(수동): `grep -rn "sync-edit-protection" docs prisma lib` → 정본 참조만 남음.

## R7 — 컨벤션·정리 (🟡·⚪)

- [ ] L7.1 컨벤션: 영어 주석 약 40줄(`lib/session-revocation/http.ts` · `lib/account-connect/store.ts` · `lib/import/*` · `lib/push/apply.ts:15-18` · `lib/credentials/access.ts:9` 등) · `components/publish-button.tsx:459,462` 경로 하드코딩 → `routes.*` · `app/signin/link/[challenge]/page.tsx:112`·`app/layout.tsx:8` UI 리터럴 → 사전 · `components/publish-button.tsx:316` 타임존 표기 · `lib/credentials/migration.ts` `plan*` 이름의 비순수 함수 · `lib/github-connect/user.ts`·`lib/auth/safe-adapter.ts` `server-only` · `lib/credentials/command.ts:23-30` env 직접 읽기. (audit #40)
  - 검증(자동): `pnpm typecheck` · `pnpm test`.
- [ ] L7.2 N+1: `app/(edit)/projects/[slug]/surfaces/[surfaceSlug]/locales/page.tsx:57-58` · `translations/page.tsx:185-186`가 표면마다 `countUnpublished` 1쿼리. 표면별 집계 한 번으로. (audit #40)
  - 검증(자동, PG): 표면 N개에서 쿼리 수 1(Prisma `$extends` 훅), 결과가 표면별 개별 호출과 동일.
- [ ] L7.3 스크립트가 프로덕션 경로를 우회: `scripts/ingest.ts:85-110` `--base` 미검증(`assemblePushInput` 재구현) · `scripts/smoke-github.ts:128-134`가 `readFiles` 예산 검사를 건너뜀. (audit #41)
  - 검증(자동): 없는 로케일 `--base` → exit ≠ 0.
- [ ] L7.4 ⚪ 정리: 죽은·과잉 export(`looksLikeCatalog` · `REGISTERED_ADAPTERS` · `mergeCandidates` · `serialize` · `tsDictDetectByContent` · `loginAccountData` · 재수출 4곳 · 미사용 import 5곳) · 영역 간 중복 헬퍼(문자열 비교 · 세션 쿠키 이름 하드코딩 6곳 · `lockUser` ×3 · HTTP status 추출 ×3 · `isUniqueViolation` ×2 · scripts dotenv/PrismaClient) · 낡은·틀린 주석(`lib/github.ts:1-5` · `lib/auth/query.ts:13-15` · `lib/locale-code.ts:27-29` · `app/(edit)/projects/actions.ts:834`). (audit #44, #45, #46)
  - 검증(자동): `pnpm typecheck` · `pnpm test`.
- [ ] L7.5 ⚪ 공개 리포 표면: `lib/github-connect/origin.ts:41` 개인 Vercel 팀 slug 호스트 · `components/onboarding/steps/naming.tsx:89` `mal-moi.com` 하드코딩(dev에서도 표시) · Supabase ref 두 개·운영 절차 노출 판단. (audit #42)
- [ ] L7.6 ⚪ 좁은 창·기타: `lib/push/apply.ts:106-111` 토큰 회전 직전 push · `app/signin/link/[challenge]/page.tsx:137-141` origin 판정 실패 시 non-secure 쿠키 · `lib/failure.ts:77` pg 오류 원문 서버 로그 · `lib/cli/args.ts:28` `flagValue`가 다음 플래그를 값으로 삼킴 · `lib/adapters/json-style.ts:111,117` · 수술적 어댑터의 셀 비우기 의미가 `writeStrategy`마다 갈림(문서화된 결정 — L1.3 결정과 같이 본다). (audit #46, #48)
- [ ] L7.7 ⚪ composite action이 대상 리포 러너에 malmoi 앱 의존성 전체(576 패키지, 실측 30~50초, `@prisma/engines` 설치 스크립트)를 설치한다. 🔒 번들 CLI로 가볍게 할지 — egress 제한 self-hosted 러너에서는 실패한다. (audit #43)

---

## 완료 판정

- R0·R1이 전부 닫히고 **오너가 아닌 GitHub 계정 + 조직**으로 로그인 → 설치 → 생성 → CI push → 편집 → Publish → **merge commit 머지** → 재push(skip) 왕복을 한 번 완주한다(`/l10n-roundtrip` + `/bugshot-qa`, `malmoi-test-org`).
- 🔒 결정은 전부 PRODUCT·ARCHITECTURE에 문장으로 남았다.
- 이 디렉터리를 지운다.
