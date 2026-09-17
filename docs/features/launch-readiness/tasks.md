# tasks — 1.0.0 런칭 준비 (2026-09-17 전체 감사)

출처는 2026-09-17 `/audit`(invariant · principle · boundary · debt + launch 렌즈, dev @ `9890bf9`)이다. 발견 48건(🔴 4 · 🟡 37 · ⚪ 7)을 태스크로 옮겼고, 각 태스크 끝의 `(audit #n)`이 그 리포트의 번호다. **체크박스는 구현 완료 상태가 아니다.**

**이 문서가 생긴 이유**: 같은 날 GitHub App과 `malmoi` 리포가 둘 다 private이었던 것이 드러났다 — 모든 검증이 오너 계정(`SinhyeokKang`)으로 돌아서 그 계정에서만 통과하는 설정이 안 보였다. PRODUCT §1의 완료 조건("낯선 리포를 연결한 사용자가 설명 없이 완주")을 막는 것이 R0·R1이고, 나머지는 같은 감사에서 나온 결함·공백·부채다.

**2026-09-18 리허설**: prod·dev DB를 비우고 완료 판정 왕복을 두 계정(Owner GitHub `SinhyeokKang`=ox501501 · Editor Google ox501tube)으로 한 번 돌았다 — 아래 각 태스크의 "리허설" 줄이 그 실측이다. 결과: **왕복 자체는 전 단계 통과**(설치 → 생성 4분 05초 → CI push 200 → 초대 수락부터 Publish까지 **2분 18초** → merge commit 머지 → CI skipped → 편집 보존 → 재-Publish 1건). 남은 것은 아래에 표시.

**2026-09-17 `/feature-review`(CPO·CDO·CTO·QA) 반영**: 인용 40여 곳을 실측해 정정했고, 🔒 10개 중 **9개를 결정으로 닫았다**(아래 "결정 기록"). 남은 🔒는 L1.1 하나다.

**읽는 법**
- 라운드 순서는 **런칭 차단 → 데이터 결함 → 첫 사용 경험 → 방어선 → 부채**다. R0은 코드가 아니라 콘솔·계정이다.
- 🔒 = **제품 결정이 먼저**다. `/implement`는 이 표시에서 멈추고 결정을 받는다. 결정이 나면 PRODUCT 또는 ARCHITECTURE를 먼저 고치고 태스크를 푼다.
- 검증 줄은 자동(`pnpm test` · `pnpm test:projects:postgres` · `pnpm typecheck`)과 수동(`/bugshot-qa` · `/design-sync` · `/l10n-roundtrip` · 콘솔)을 구분한다.
- "0회/없음"을 단언하는 검증은 **같은 픽스처의 허용 경로에서 N > 0**을 짝으로 단언한다(POSTMORTEM 2026-09-14).
- 감사 발견은 정적 읽기다 — **각 태스크의 첫 검증은 재현(red)이다.** 재현이 안 되면 태스크를 닫고 그 사실을 적는다.
- **뮤테이션은 일회성 확인이 아니라 리포에 남는 단언으로 끝낸다.** "지우고 돌려보고 되돌린다"는 절차 자체가 사고였다(POSTMORTEM 2026-09-16 "뮤테이션을 되돌리는 `git checkout`이 미커밋 작업을 지웠다"). 작업 중인 파일에 `git checkout -- <경로>`를 쓰지 않는다.
- **PG 통합 테스트는 `lib/keys/__tests__/*.integration.ts`에만 둔다** — `vitest.projects.config.ts:9`의 include가 그 디렉터리로 박혀 있어 다른 곳(`lib/push/__tests__/` 등)에 만들면 조용히 0건 수집된다. glob은 넓히지 않는다(sync-edit-protection과 같은 판단).
- 끝나면 결론을 PRODUCT·ARCHITECTURE·DESIGN·OPERATIONS로 올리고 이 디렉터리를 지운다(CLAUDE.md `/feature` 규칙).

## 결정 기록 (2026-09-17 feature-review)

| 항목 | 결정 | 정본에 남길 곳 |
|---|---|---|
| L1.2 루프 마커 | **PR 제목에 마커**. `action.yml`·태그 릴리스 변경 없음. 재사용 PR은 제목 PATCH | ACTIONS.md · PRODUCT:179 정정 |
| L1.3 빈 값 | **(b) 지금 동작 유지 + 문서화** — "코드에서 번역을 지우는 방법은 없다, UI에서 비운다". (a)는 PRODUCT §10으로 | ARCHITECTURE §0·§5.5.2 · `apply.ts:253` 주석 · PRODUCT §10 |
| sync-edit-protection | **런칭 전에 넣는다**(PRODUCT §1 완료 조건 2 "구조적으로 막았는가"를 문자 그대로) | 그 디렉터리의 `tasks.md` T0~T19가 R1의 일부다 (L1.5) |
| L2.10 App | **지금 분리** — prod 전용 App + dev/local App(폐기용 리포만 설치) | OPERATIONS · CLAUDE.md:266 되돌림 |
| L2.8 초대 이메일 | **primary 유지**(ARCH:1448 이미 결정) + 초대 다이얼로그에 "primary 주소로" 힌트 | 🔒 제거 |
| L2.6 slug 충돌 | **제출 뒤 유지**(DESIGN §6.7) + 빠진 포커스·`aria-describedby` 배선 | — |
| L3.3 미리보기 실패 | 핸드오프 **`1h` 재사용**, 새 갈래 없음 | DESIGN:1035 "못 밟은 갈래" 갱신 |
| L7.1 타임존 | 절대 시각은 **`<time dateTime>` + `" UTC"` 라벨**(Logs 형), 상대 시각은 `lib/relative-time.ts` | CLAUDE.md "표시 시점에 로컬" → 상대 시각에만 |
| L6.1 브랜치 프로텍션 | `main`에 **required check `verify`만** | CLAUDE.md:206·217 |
| L2.4 설치 착지 | Route Handler `app/api/github/setup`, **`installation_id`는 읽지 않는다**, `setup_action=request`만 `?e=`로. "Request user authorization during installation"이 켜져 있으면 **끈다** | ARCHITECTURE §6.4 |
| L2.7 · L3.4 · L3.11 · L7.7 | 정본이 이미 답했다 — 🔒 제거(각 태스크 참조) | — |

---

## R0 — 콘솔·계정 확인 (코드 없음, 가장 먼저)

오너 계정에서는 전부 통과하는 부류라 코드로 판정할 수 없다. 각 항목 끝의 "결과 →"가 어느 태스크를 바꾸는지다.

- [ ] L0.1 Google OAuth 동의 화면의 게시 상태를 확인한다. `CLAUDE.md:58`·`.env.example:81`이 "External + 테스트"로 적는다 — 테스트 모드면 등록된 테스트 사용자만 로그인된다. 같이 확인: 요청 스코프가 `email`·`profile`뿐이면 **심사 없이 게시되는지**(L1.1의 "심사 범위·기간"은 추측이라 여기서 사실로 바꾼다). (audit #4)
  - 검증(수동): L0.5의 두 번째 Google 계정(테스트 사용자 목록 밖)으로 `https://mal-moi.com/signin` 로그인 시도 → 성공이면 닫는다. `403 access_denied`면 L1.1로 간다.
  - 리허설(2026-09-18): Editor ox501tube@gmail.com이 Google로 초대 수락 성공 — 그 계정이 테스트 사용자 목록에 있는지, 게시 상태가 무엇인지는 **콘솔에서 아직 안 봤다**(성공이 게시를 뜻하지 않는다). L0.1은 열린 채.
  - 결과 → L1.1.
- [ ] L0.2 GitHub App의 "Request user authorization (OAuth) during installation" 설정과 Setup URL·callback URL 목록을 확인한다. **켜져 있으면 끄는 것이 태스크다** — 우리 연결 흐름(ARCH §6.4)이 따로 있어 그 옵션은 켤 이유가 없고, 켜진 상태에선 state 없는 콜백이 `/api/github/callback`에서 `state-mismatch`로 거부된다. `external_url`이 `https://github.com`인 것도 같이 본다(audit #42). (audit #8)
  - 검증(수동): 설정 스크린샷을 이 태스크에 링크한다. 옵션이 꺼진 상태로 설치 한 번 → 콜백 요청 0건(Vercel 로그).
  - 결과 → L2.4의 착지 설계, L2.10의 App 둘 모두에 같은 설정.
- [ ] L0.3 Vercel 플랜과 Supabase prod 플랜을 확인한다. (audit #11)
  - 판정 기준: **Hobby 약관은 비상업 용도** — 제3자(사내 밖)에게 여는 것이 그 안인지 사용자가 판단하고, 아니면 Pro. Pro면 cron 하루 1회 전제(`CLAUDE.md:265`)가 바뀌어 L2.9의 문구·`vercel.json` 스케줄이 따라간다. Supabase는 비활성 자동 일시중지 여부·PITR 유무 — 일시중지가 켜져 있으면 런칭 전에 끈다.
  - 검증(수동): 확인한 플랜·한도·PITR을 docs/OPERATIONS.md에 적는다 — 지금 문서에 없다.
  - 결과 → L2.9 문구, OPERATIONS.
- [ ] L0.4 `malmoi-test-org`에서 **관리자가 아닌 멤버**의 설치 요청 경로를 실측한다(오너 설치는 2026-09-17에 확인함). L0.5가 선행이다. (audit #8)
  - 검증(수동, `/bugshot-qa`): 요청 전·요청 후 승인 대기·승인 후 새로고침 세 화면의 문구를 기록한다. L2.4의 입력이다.
  - 리허설(2026-09-18): org 설치는 **관리자(SinhyeokKang)** 로 했다 — 요청 경로는 아직 안 밟았다(Editor 계정이 Google뿐이라 GitHub 비관리자 멤버가 없다).
  - 결과 → L2.4 둘째 항목의 문구.
- [ ] L0.5 (2026-09-18 절반 — Editor Google 계정 `ox501tube@gmail.com` 확보·초대 수락 완료. **비관리자 GitHub 멤버는 아직 없다** — `sinhyeok-kang`을 `malmoi-test-org`에 member로 넣으면 닫힌다) **두 번째 GitHub 계정과 Google 계정을 확보한다.** 오너가 아닌 계정을 `malmoi-test-org`에 **비관리자 멤버**로 넣는다. 완료 판정·L0.1·L0.4·L2.3·L2.5·L2.8이 전부 이 계정을 전제한다 — 지금은 이 문서에만 있고 계정이 없다.
  - 검증(수동): 그 계정으로 `mal-moi.com` 로그인 → 프로젝트 0개 화면. `malmoi-test-org` 멤버 목록에 role=member로 보임.
- [ ] L0.6 **로케일 1개 폐기용 리포 `i18n-single-locale`을 만든다**(작은 MIT 리포 포크, `i18n-none`과 같은 이유로 74KB급). L2.7의 "단일 로케일 거부" 화면을 브라우저로 밟을 리포가 없다 — 설치 목록 여섯은 0·3·59로케일뿐이다. 두 App(L2.10) 중 **dev App에만** 설치한다.
  - 검증(수동): 온보딩 ②에서 `no-candidates` 문구 도달. ⚠️ CLAUDE.md 게이트웨이의 설치 목록 줄은 **설치 목록에 실제로 든 뒤에** 갱신한다(그 절의 경고 그대로).

## R1 — 런칭 차단 (🔴)

- [ ] L1.1 🔒 Google 로그인을 제3자에게 연다(L0.1이 테스트 모드일 때만). 방향은 "vs"가 아니다 — PRODUCT:162 "1차 로그인은 GitHub + Google 둘뿐"이고 §0의 첫 편집자가 비개발자라 GitHub만 두는 것은 PRODUCT 변경이다. **게시 신청 + 심사 대기 중엔 초대 대상을 테스트 사용자로 등록**한다. 프로덕션 게시에는 개인정보처리방침 URL이 필요하다 → L2.0·L2.1이 선행이다. (audit #4)
  - 남은 결정: 심사가 필요하다고 L0.1에서 확인되고 기간이 런칭을 넘기면, 그 기간 동안 테스트 사용자 등록을 운영 절차로 둘지(OPERATIONS 한 절).
  - 검증(수동): L0.5 계정(테스트 사용자 목록 밖)으로 초대 링크 → Google 로그인 → 수락까지 완주.
- [x] L1.2 (2026-09-17 완료) 번역 PR을 **merge commit**으로 머지해도 루프 마커가 살아 있게 한다. `lib/pull/payload.ts:19,76`은 마커를 커밋 메시지에만 넣고 PR 제목·본문(`lib/pull/run.ts:216,218`)에는 없다. 검사 셋(`action.yml:82`·`lib/onboarding/workflow.ts:143`·`docs/ACTIONS.md:58`)은 `head_commit.message`만 본다. merge commit 메시지는 `Merge pull request #N from …\n\n<PR 제목>`이라 지금은 마커가 없고, CI push가 DB를 Publish 시점 값으로 덮어 그 뒤 편집이 사라진다. `docs/ACTIONS.md`는 머지 방식을 한 번도 말한 적이 없다 — squash 의존이 무문서였다. (audit #1)
  - **방향(결정됨)**: **PR 제목에 마커**를 넣는다. merge commit 둘째 문단이 PR 제목이라 **기존 가드 셋이 그대로 잡는다** — `action.yml`·워크플로 스니펫·대상 리포 변경 0, 태그 이동 0. squash(기본 = 단일 커밋 메시지 / 리포 설정 "PR 제목" = 제목)·rebase(스냅샷 브랜치는 1커밋)도 전부 덮인다. "검사 쪽이 둘째 부모를 본다" 안은 러너 `fetch-depth`와 태그 릴리스를 부르므로 버린다. `findOpenPrUrl`(`run.ts:211`)로 **재사용되는 기존 PR은 제목을 PATCH**한다(`lib/github.ts` 안 installation 토큰 — 경계 위반 아님).
  - 검증(자동, 재현 먼저): `head_commit.message = "Merge pull request #N from a/b\n\n<지금 PR 제목>"` 픽스처에서 가드 판정이 **run**으로 나오는 red를 먼저 적는다. 마커 판정의 소비자는 bash·GH expression이라 TS 순수 함수는 거울일 뿐이다 — `lib/pull/__tests__/sync-branch-consumers.test.ts:18-31` 형으로 **생산자 상수(`SKIP_MARKER`)와 `action.yml:84`·`workflow.ts:143`·`ACTIONS.md:58` 리터럴을 텍스트로 묶는다.** PR 생성·재사용 둘 다에서 제목에 마커가 있다는 단언. 모양 다섯: merge commit · squash 기본 · squash "PR 제목" 설정 · rebase · **사람 커밋(마커 없음 → run)**. 사람 PR 제목에 마커가 우연히 든 경우는 "그 사람이 원한 것"으로 두고 ACTIONS.md에 적는다.
  - 검증(수동, `/l10n-roundtrip`): 폐기용 리포에서 "Create a merge commit"으로 머지 → push run이 skip 로그(`action.yml:86` notice)를 남긴다. L1.2b 선행.
  - 문서: `docs/ACTIONS.md`에 "머지 방식은 무엇이든 된다 · PR 제목의 마커를 지우지 마라"(외부 계약), `PRODUCT.md:179` "Actions 경로는 실물로 검증돼 있다"를 "squash·merge commit 둘 다"로 정정. POSTMORTEM에 관련 항목이 0건이라 사고 전 정적 발견이다 — 고친 뒤 `/postmortem`.
  - ✅ **코드·자동 검증·문서 완료(2026-09-17)** — `PR_TITLE`(`payload.ts`), `findOpenPr`+`updatePrTitle`(`client.ts`·`github.ts`), 재사용 PR 제목 PATCH(`run.ts`), `skip-marker.test.ts`(모양 다섯 + 소비자 셋), `run.test.ts` 셋, ACTIONS.md "머지 방식" 절, PRODUCT:181, ARCHITECTURE §3. ✅ **실물 검증·회고 완료(2026-09-17)** — `org-install-qa`(폐기용 org 포크) PR #1을 `--merge`로 머지, 재사용 PR 제목 PATCH 확인, run 35231174347 job skipped, POSTMORTEM 2026-09-17 항목. ⚠️ 원래 후보 `i18n-format-check`·`bugshot-i18n-test-qa`는 설치 id가 낡아 [Reconnect] 필요(L2.10과 같이 본다).
- [x] L1.2b (2026-09-17 완료 — `--merge <squash|merge|rebase>`, 머지 전 PR 제목 마커 확인 추가) `/l10n-roundtrip` 스킬에 머지 방식 인자(`--merge`/`--squash`)를 추가한다. 지금 `.claude/commands/l10n-roundtrip.md:108`은 `--squash`만 돌고 `:112`가 squash 결과에서만 마커를 확인해 merge commit 회귀는 구조적으로 안 보인다. **스킬 변경은 코드와 다른 커밋이다.**
  - 검증(수동): 스킬 문서에 두 방식의 확인 단계가 갈려 있다. `pnpm sync:agents:check` 대상 아님(미러 제외 스킬).
- [ ] L1.3 push가 **리포에서 지우거나 `""`로 바꾼 번역**을 DB에 반영하지 않는 현재 동작을 **정본에 적는다(결정 (b))**. `lib/push/apply.ts:254`의 `t.value !== ""` 필터 때문에 결과가 셀 단위로 리포 ∪ DB가 되고, 다음 번역 PR이 지운 번역을 되살린다. `:253` 주석은 `keyId` 반쪽만 설명하고 `:262-264`가 "예외 없음"을 단언해 서로 모순이다. **POSTMORTEM 2026-09-09(`:811`)가 이 의미론의 정본이다** — `buildWriteEntries`가 `""`≡부재로 정했고 "판정 기준은 그 값이 없으면 키가 사라지는가"(`:824`). (a) "리포 부재면 DB 셀도 비움"은 §0 불변식 3(번역을 지우지 않고 보존)과 만나며, DB `""`는 pull에서 키 삭제라 "빈 값 기록"이 아니다. sync-edit-protection spec `:46-49`가 이미 이 구멍을 별도 spec으로 분리하고 선행 조건("명시적 빈값 vs 미번역 빈값을 export가 구별하는 수단")을 박아 뒀다. (audit #2)
  - 문서: ARCHITECTURE §0 불변식 3 옆과 §5.5.2 "예외도 없다" 아래에 **"코드에서 번역을 지우는 방법은 없다 — 지우려면 UI에서 비운다. push의 `""`·부재는 '모름'이지 '삭제'가 아니다"**. `apply.ts:253` 주석에 `!== ""`의 이유. PRODUCT §10에 "(a) 리포 부재 → DB 비움은 빈값 export 구별 수단(sync-edit-protection 후속 spec)이 정해질 때".
  - 검증(자동, PG — `lib/keys/__tests__/push-absent-cells.integration.ts`): 네 갈래 각각 DB 셀 **유지** — `""` · 키 부재 · 로케일 파일 부재(payload `locales`에 없음) · orphaned 키. **같은 픽스처에서 값이 있는 셀은 덮어씀 + `updatedBy = NULL`** 대조. 뒤이은 pull 계획이 유지된 셀을 그대로 내는 것까지.
  - 검증(자동): `lib/push/apply.ts`를 건드리면 `pnpm test:projects:postgres` green.
  - 흡수: 옛 L7.6의 "수술적 어댑터의 셀 비우기 의미가 `writeStrategy`마다 갈림"은 같은 결정이다 — 위 문장이 그것도 덮는지 §1 표현 보존 절에서 확인하고 갈리면 한 줄 더.
  - ✅ **문서 부분 완료(2026-09-17)** — ARCHITECTURE §0 불변식 3·§5.5.2, `apply.ts` 주석, PRODUCT §10. **남은 것**: PG 테스트 네 갈래 + `writeStrategy` 확인.
- [x] L1.4 (2026-09-17 완료 — `locate` 걷기 하나로 조회·삽입 통일, 계약 매트릭스 "깊은 점 키" 축 + `Break` 가짜, json-catalog read가 평탄·중첩 충돌을 `duplicate-key`로 보고) yaml-catalog·code-dict에서 **깊이 2 이상의 점(.) 포함 키**가 write마다 중복 삽입되는 것을 막는다. `lib/adapters/yaml-catalog.ts:367,472` · `lib/adapters/code-dict.ts:388,444` — 조회가 "전체 리터럴 / 전체 split" 둘만 시도해 `errors: { "messages.blank": x }`는 둘 다 실패 → `missing` → `insertPath`가 `errors` 아래 리터럴을 **또** 넣는다(2026-09-17 재검증). `:365-366` 주석이 "리터럴 먼저 본다"고 안전을 주장하는 바로 아래다. (audit #3, POSTMORTEM 2026-09-02 "구분자가 데이터에도 있어서" 재발)
  - 방향: 조회를 **각 깊이에서 리터럴 우선으로 내려가는 걷기 하나**로 바꾸고 `findScalar`·`insertPath`·`insert` 넷이 같은 걷기를 쓴다 — 조회와 삽입이 다른 규칙으로 걸으면 중복이 다시 생긴다.
  - 검증(자동, 재현 먼저): `ko: { errors: { "messages.blank": x } }` 픽스처로 값 무변경 write → **원본 바이트 동일**, 값 변경 write → 그 줄만 바뀜, 재read에 `duplicate-key` 없음. code-dict는 `{ el: { 'a.b': 'x' } }`로 같은 셋. 누락 케이스: 깊이 3 · 점 키와 실제 중첩 혼재(`errors.messages.blank` vs `errors: {messages: {blank}}` 공존) · `[`·따옴표 포함 키 · YAML anchor/alias.
  - 검증(자동): 계약 매트릭스는 케이스 표가 아니라 `lib/adapters/__tests__/contract.ts:191` `writerContractViolations` 안의 검사 + `contract.test.ts:52-60`의 `Break` 네거티브 어댑터 쌍이다. **새 축 = 검사 하나 + `Break` 플래그 하나**(가짜 어댑터로 그 검사가 red를 내는 증명) — 이것이 리포에 남는 뮤테이션 가드다. 다섯 어댑터 전부에 돈다.
  - 검증(자동): `json-catalog.ts:199`는 read에 감지가 없고(`lastWins`가 삼킴) write만 `key-shadowed`(`:262-281`)를 낸다 — 같은 축에서 **read가 에러를 내게** 한다. (audit #20)
- [ ] L1.5 **`docs/features/sync-edit-protection/tasks.md` T0~T19를 런칭 전에 완주한다**(결정됨). PRODUCT §1 완료 조건 2 "데이터 손실을 구조적으로 막았는가"의 답이 그 기능이다. 그 문서의 배포 셋(T0 단독 → 호환 A → 보호 B)이 이 문서의 `/merge` 횟수에 더해진다. L1.3의 (b)는 그 spec의 "별도 spec" 판정과 일치한다.
  - 검증: 그 문서의 T15·T17·T18. 완료 판정의 왕복에 T17(편집→코드 커밋→보류→Publish→적재 재개)이 포함된다.

## R2 — 첫 사용 경험 (🟡 launch)

- [ ] L2.0 **공개 장문 문서 그릇을 먼저 만든다**(L2.1·L2.3 선행). `components/public-doc.tsx:14`는 `{ title: string; body: string }` — `<h1>` + `text-muted-foreground text-sm` 문단 하나 + [Back to sign in]이라 절·목록·링크가 있는 법적 문서의 그릇이 아니고, 바꾸는 순간 **시안 없는 새 화면**이 된다(POSTMORTEM 2026-09-15 "시안 없이 만든 화면이 네 곳에서 어긋났고 4,039개가 green"). DESIGN에 공개 문서 페이지 절이 없다(§6.62는 로그인·초대뿐, `docs/DESIGN.md:690-705`). `public-doc.tsx:12` 주석이 가리키는 "8-1b 시안"은 존재하지 않는다.
  - 방향: `/privacy`·`/docs` 공용 장문 읽기 레이아웃 — 제목 급·본문 색(`muted-foreground`는 장문용이 아니다)·링크(`text-blue-600`, 등재됨)·절 앵커. 새 raw 색 없이 끝내는 것이 완료 조건(§6.2 등재 0건). **복귀 링크는 세션 유무로 가른다** — 로그인 상태에서 사이드바 `CircleHelp`→`/docs`(`DESIGN.md:589`)로 들어오면 지금은 나가는 길이 "Back to sign in"뿐이다(`public-doc.tsx:19-24`) → `/projects`, 비로그인은 `/signin`.
  - 검증(수동, `/design-sync`): DESIGN에 새 절을 박고 핸드오프 대조. 검증(자동, DOM): 세션 있음/없음 두 렌더에서 복귀 링크 대상.
- [ ] L2.1 개인정보처리방침 본문을 쓴다. `messages/en.tsx:263` `body: "We're still writing this. It will be here before launch."`인데 로그인 화면이 그 방침에 동의받는다(`en.tsx:234-235`). L1.1의 선행이다. (audit #6)
  - 검증(자동): `no-korean-ui`·`brand-spelling` green. 검증(수동): 로그인 화면 링크 → 본문 도달, 절 앵커 동작. 법률 문구는 원리적으로 자동 검증 대상이 아니다.
- [ ] L2.2 LICENSE(MIT)를 넣고 `public/flags/*.svg` 253개의 출처·라이선스를 확인해 기록한다(SVG의 `clip0_301_*` id로 보아 Figma 내보내기). 출처를 못 밝히면 교체한다. (audit #14)
  - 검증(수동): `gh api repos/SinhyeokKang/malmoi --jq .license.spdx_id` → `MIT`. docs/DESIGN.md §국기 절에 출처 한 줄.
- [ ] L2.3 도움말 경로. `/docs` 채우기는 **이미 범위**(`PRODUCT.md:421` "출시 전에 채운다")라 결정이 아니다. 실을 것은 L2.4·L2.5·L2.6이 만드는 문구를 모은 것 — 워크플로 설정 · 허용 action 목록(L2.5) · 머지 방식 무관(L1.2) · 상한 셋(L2.6) · 지원 포맷. `app/docs/page.tsx:10` placeholder. 설정 화면(`app/(edit)/projects/[slug]/settings/page.tsx:214-218`)의 `docs/ACTIONS.md`는 `<span class="text-mono">`라 누를 수 없다 → `/docs#workflow` 내부 링크(셸 안 링크 규칙: 밑줄·아이콘 없음, `DESIGN.md:516`). README를 공개 독자용으로 바꾸면 CLAUDE.md 문서 지도("README = CLAUDE.md 요약 미러")도 같은 커밋에서 바뀐다 — 운영 문서는 docs/로 내린다. **`docs/ACTIONS.md:38-43` 예시가 주석은 "slug를 넣어라"인데 스니펫엔 slug가 없다**(`workflow.ts`는 넣는다) — 복붙하면 그 주석이 경고한 버그를 재현한다. (audit #7, #42)
  - 검증(수동, `/bugshot-qa`): L0.5 계정이 설정 화면의 링크만 따라 `malmoi-test-org` 리포에 워크플로를 붙이고 **대상 리포 run URL(green)**을 남긴다.
- [ ] L2.4 설치 흐름의 막힘 둘(방향 결정됨). (audit #8) — 리허설(2026-09-18) 재현: Install 뒤 GitHub `settings/installations/<id>`에 남았고 malmoi 모달은 **새로고침해야** 리포가 떴다(계정·org 둘 다).
  - 착지: Route Handler **`app/api/github/setup/route.ts`** — GitHub이 브라우저를 되돌리는 외부 진입점이므로 `app/api/github/callback/route.ts:17-34`와 같은 형(matcher 밖 + `requireUser` + `entry-points.test.ts`의 `USER_GUARD`). **`installation_id`는 읽지 않는다** — `/projects/new`가 사용자 토큰으로 설치 목록을 다시 조회하므로 믿을 이유가 없고, 읽지 않으면 위조 판정 자체가 사라진다. `setup_action=install` → `/projects/new`(① 재조회, 새 상태 없음) / `setup_action=request` → `/projects?e=install-requested`(§6.4 global Alert 자리, `DESIGN.md:541`) / 그 외·부재 → `/projects`. `GITHUB_APP_SLUG` 부재 시 착지 URL 등록만 남는 것을 OPERATIONS에.
  - 문구: 관리자 아닌 조직원이 설치를 "요청"하면 승인 전까지 설치 0개라 `no-installations`(`app/(edit)/projects/actions.ts:542`, `messages/en.tsx:1060-1066`)가 반복된다. 요청 대기 갈래를 `EmptyState` 설명 한 문장 교체로 넣되(시안 불필요), **`afterInstall: "Refresh this page once you're done."`(`:1066`)은 "본인이 끝낼 수 있다"를 전제하므로 요청 갈래에서는 거짓이다** — 두 문장이 같은 화면에 서지 않게 한다(POSTMORTEM 2026-09-14 "문장 사이의 모순은 소스 스캔이 못 본다").
  - 검증(자동): `setup_action` 판정 순수 함수 — `install`·`request`·부재·위조 값 넷 → 목적지. `entry-points.test.ts` USER_GUARD 등재 + `middleware` matcher 밖(POSTMORTEM 2026-09-06 "쿼리 수신자"). DOM: 요청 갈래 렌더에 `afterInstall` 문장 0 + **설치 갈래 렌더에는 1**.
  - 검증(수동, `/bugshot-qa`): L0.4의 세 화면 재실측(L0.5 계정).
- [ ] L2.5 조직 Actions 허용 목록 안내. 허용 목록을 쓰는 조직에서는 `SinhyeokKang/malmoi/...`(`workflow.ts:24`·`ACTIONS.md:63`)와 action 안의 `pnpm/action-setup`(`action.yml:110`)·`actions/setup-node`(`:116`)·`actions/checkout`이 `not allowed to be used`로 막힌다. docs/ACTIONS.md와 L2.3의 도움말에 **네 개 전부** 적는다. (audit #5)
  - 검증(수동): `malmoi-test-org`에서 "Allow select actions" + 목록 등록 → run이 action 해석 단계를 통과. 목록에서 하나를 빼면 막힌다(짝).
- [ ] L2.6 상한과 네임스페이스 안내. (audit #9)
  - 멤버 10명 초과: `Couldn't create the link: member-limit`이 코드 그대로 노출된다(`components/members/invite-dialog.tsx:125-128`, 같은 함수가 `"invalid input"`도 원문으로 낸다 → `en.tsx:1724`). 상한은 **다이얼로그를 열기 전에 아는 값**이라 제출 뒤 거부가 아니라 **열릴 때 인라인 지속 조건**(§6.25 경계표 `DESIGN.md:480-485`)으로 바꾼다. 거부가 남는 경로(경합)에는 **거부 뒤 포커스를 [Create link]로 되돌린다** — 지금은 제출 버튼이 `loading`(=`disabled`)이라 포커스가 `body`로 떨어지고(`9890bf9`가 행 컨트롤에서 고친 것과 같은 형, `DESIGN.md:1075`), `alert.tsx:66-69`가 경고한 "새로 붙는 Alert 낭독 누락" 형이다. 코드 매핑은 `pick`(POSTMORTEM 2026-09-08).
  - 프로젝트 3개 상한: ③ 끝(`actions.ts:852,941`)이 아니라 **① 진입 시 다섯째 `EmptyState`**(제목 ≤5단어·설명 한 문장·버튼 하나 `DESIGN.md:557`) — "상한 도달, 보관하면 자리가 빈다", 버튼은 [Open projects]. [New project]를 비활성으로 막는 쪽은 §6.646·사유 없는 `disabled` 0건 감사(POSTMORTEM 2026-09-14)에 걸려 쓰지 않는다. 핸드오프에 없는 아트보드라 `/design-sync`.
  - slug 충돌: **제출 뒤 유지**(DESIGN §6.7 ③, `naming.tsx:25-27`, 결정됨). 빠진 것은 사전 `en.tsx:1205` "예외 G — 제출 뒤 그 필드에 선다"가 약속한 **포커스 이동**(`new-project.tsx:395-397`은 `setSlugTaken(true)`만) + `FormGroup` 오류 `<p>`의 `id`·`aria-describedby`(`form-group.tsx:42-46`에 없음). slug는 전 사용자 공용 네임스페이스라 `web`·`app` 같은 리포 이름은 충돌한다(PRODUCT §7.7).
  - 검증(자동): 상한 판정 순수 함수 둘 + DOM — 상한 도달에서 안내, **상한 미만에서 안내 없음** 대조. 초대 Dialog 거부 뒤 `document.activeElement`가 [Create link](`members-focus.test.tsx:52-60`의 `MutationObserver` 트릭 재사용 — jsdom은 disabled→blur를 안 한다). slug 거부 뒤 `activeElement`가 입력이고 `aria-describedby`가 오류 `<p>`를 가리킨다.
- [ ] L2.7 연결 불가 리포 모양의 안내(🔒 제거 — ARCHITECTURE:186이 "하나뿐이면 우연일 수 있다"로 이미 거부를 정했고 `en.tsx:2072` `no-candidates`가 "2 or more languages"를 이미 말한다). 남는 일은 **다음 행동** — "리포에 두 번째 로케일 파일을 만든 뒤 다시 연결"을 한 문장 더하고, 트리가 잘리는 모노레포(`en.tsx:2074`)도 같은 형으로. 인용 정정: PRODUCT "§7.1"은 §7.2(`:274`). (audit #10)
  - 검증(자동): 탐지 결과별 문구 테스트. 검증(수동, `/bugshot-qa`): L0.6 리포로 ② 예외 E 도달.
- [ ] L2.8 초대 이메일 대조(🔒 제거 — ARCHITECTURE:1448·`lib/auth/email.ts:64-69` 주석이 "primary이면서 verified만 · 대가는 primary와 다른 주소로 초대받은 사람 · 회피는 primary 주소로 초대"를 이미 적었다). 거부 문구(`en.tsx:2007`)는 초대 주소를 일부러 안 밝히므로 그대로 두고, **초대 다이얼로그에 "GitHub primary 주소로 초대하라" 힌트**를 넣는다 — 행동할 수 있는 쪽은 초대자다. (audit #13)
  - 검증(자동, DOM): 초대 Dialog에 힌트 키 렌더. primary ≠ 초대 & verified 포함 → 거부, **primary = 초대 → 수락** 대조는 기존 테스트 유지.
- [ ] L2.9 야간 cron의 예산과 공지. `app/api/pull/route.ts:26,70`이 최대 50개를 직렬로 돌고 `vercel.json`에 `maxDuration`이 없다 — 60초 킬이면 `:99,102`의 요약 로그·응답이 **통째로** 안 남는다. 값은 공정성이 아니라 **요약이 남는 것**이다(§5.6.5 정렬이 다음 밤 이월을 이미 보장). 온보딩 어디에도 야간 자동 PR 언급이 없다 — PRODUCT §4.1에 그 약속이 "어긋난" 게 아니라 **없다**(`en.tsx` `nightly`는 Logs 라벨 `:497`·실패 사유 `:521`·보관 본문 `:542`뿐). (audit #11)
  - 방향: 루프 머리에서 `Date.now() - start > BUDGET`이면 나머지를 `unprocessed`에 더하고 break — 5줄. 순수 추출은 하지 않는다.
  - 검증(자동): 시계 주입 — 0개 · 1개 단독 초과 · 전부 fast · 마지막 하나가 초과 넷. 초과 시 응답에 `unprocessed` N>0, **예산 안이면 0** 대조.
  - 문구: ④ 설명 줄(`DESIGN.md:1196` "Imported N keys. Add the push token…")의 **둘째 문장**으로 넣는다(별도 블록이면 `/design-sync`). ⚠️ "every night"가 참인지는 **L0.3 결과에 종속**(Hobby 하루 1회·프로덕션 전용). 사전 주석에 근거 코드(`selectPullTargets`·`vercel.json`)를 적는다(POSTMORTEM 2026-09-14). PRODUCT §4.1/§7.6에 야간 PR 한 줄.
  - 검증(자동, DOM): ④ 렌더에 그 키. 검증(수동, `/bugshot-qa`): ④는 실제 생성으로만 도달 — `bugshot-i18n-test-qa`가 아니라 새 생성 한 번.
- [ ] L2.10 **GitHub App을 둘로 나눈다(결정됨)**: `malmoi`(prod — 개인키는 Vercel Production 한 곳) + `malmoi-dev`(로컬·preview — 설치 대상은 폐기용 리포만). 지금은 `lib/github.ts:32-39` `createApp`이 어떤 `installationId`든 토큰을 찍고(`:290-296`) 제한은 호출부의 `Project.installationId`뿐이라, 공개 뒤엔 로컬 머신의 개인키로 모든 외부 설치의 contents:write 토큰을 발급할 수 있다. 재연결 비용(`installationId`, malmoi#52)은 **지금 테스트 리포 6개 = ~0이고 런칭 뒤엔 고객마다 [Reconnect]다**. (audit #12)
  - 따라오는 것: `GITHUB_APP_ID`·`PRIVATE_KEY`·`GITHUB_APP_CLIENT_*`·`GITHUB_APP_SLUG` App별 · `lib/github-connect/origin.ts:38-47` 호스트별 callback 등록 · L0.2 설정을 둘 다에 · OPERATIONS "키를 든 곳"(POSTMORTEM 2026-09-06 `:504`) 재계수 · **`d759d39`가 오늘 적은 CLAUDE.md:266 "셋이 하나를 공유"를 되돌림** · dev DB 프로젝트 여섯 [Reconnect].
  - 검증(수동): `pnpm smoke:github <slug>`가 로컬(dev App)·프로덕션(prod App) 각각 통과. dev App 개인키로 prod 설치 ID 토큰 발급 시도 → 실패(짝: dev 설치 ID → 성공).

## R3 — 동작 결함 (🟡)

- [ ] L3.1 `lib/keys/query.ts:120` — 평범한 `{}`에 `Locale.code`를 대입하고 `lib/keys/view.ts:112,334`·`components/translations/key-group.tsx:96`이 `hasOwn` 없이 읽는다. `constructor` 로케일(`isValidLocaleCode` 통과)이면 "Not sent" 배지·필터가 거짓으로 켜진다. `lib/pull/plan.ts:58`·`json-catalog.ts:148`은 **경로** 키 맵이라 부류가 다르다(전자는 `typeof === "boolean"` 가드 있음) — 대상에서 뺀다. POSTMORTEM 2026-09-09의 grep 패턴에 `t.localeCode` 모양을 더한다. (audit #17)
  - 검증(자동, 재현 먼저): `constructor`·`__proto__`·`toString`·`hasOwnProperty` 로케일 픽스처로 셀 맵·`isUnpublished`·필터 — 번역 행 없으면 미발송 아님, **행이 있으면 미발송** 대조. `key-group.tsx:96` 배지는 jsdom DOM 테스트.
- [ ] L3.2 설치 조회 실패를 "설치 안 됨"으로 접지 않는다. `app/(edit)/projects/actions.ts:1404-1411` `checkRepoAccess`가 설치 하나의 리포 목록 조회 실패(403·5xx)를 로그 없이 `{ repos: [] }` → `repo-not-installed`로 만든다. 형제 `listConnectableRepos`(`:550-573`)는 `logFailure`를 남긴다. **`fa55840`(home state)는 이 자리를 고치지 않았다.** 선례는 POSTMORTEM 2026-09-06(`:510` "401이 not-installed로 접혀 있었다"), 09-03은 셸 항목이라 무관. `planRepoConnect`(`lib/onboarding/connect-plan.ts:34-53`)가 이미 순수 판정이므로 `unavailable` 입력 하나 늘린다. (audit #15)
  - 검증(자동): 5xx → `unavailable` + 로그 1줄, 404 → `repo-not-installed`, **정상 목록에 리포 있음 → ok** 대조.
- [ ] L3.3 Publish 미리보기가 세션 만료·접근 거부를 원인 없이 "미리보기 실패 / Retry"로만 그린다. `app/(edit)/publish-actions.ts:9-18` `loadPublishPreview`가 모든 실패를 `null` 하나로 접는다(→ `publish-button.tsx:54`). **새 갈래를 그리지 않는다(결정됨)** — 핸드오프 `1h`(실행 전 거부 여섯, `DESIGN.md:1017-1020`)가 `Sign in`(역할 무관)·`Open project settings`(OWNER)까지 확정돼 있고, run 실패에는 이미 `unauthorized`→`/signin` 분기가 있다(`publish-button.tsx:458-462`). 미리보기 단계의 `unauthorized`·`forbidden`을 그 `config-error` 갈래로 흘리고, 읽기 실패 `1k`("실패로 말하지 않는다", `en.tsx:1603`)는 그대로. **`:459,462`의 `/signin` 하드코딩 → `routes.*` 전환을 이 태스크에 포함**한다(L7.1에서 옮김 — 같은 줄을 둘이 건드리면 충돌). POSTMORTEM 2026-09-16 `:1929`(같은 파일 로케일 무시)와 같은 영역. (audit #16)
  - 검증(자동, DOM): 결과 union 세 갈래 각각의 문구·버튼, **정상 → 미리보기 표** 대조.
  - 검증(수동, `/design-sync`): `1h`는 `quiet`라 live `off`·`role="alert"`만 읽는다(`publish-button.tsx:117-121,457,484` · `modal.tsx:168`) — 미리보기 단계에서 진입 시 **포커스가 본문으로 가는지**(`modal.tsx:114`)는 CDP 접근성 트리로. `DESIGN.md:1035` "`1h`·`1j`는 실물로 못 밟은 갈래"를 이 태스크가 갱신한다.
  - 검증(수동, `/bugshot-qa`): 세션 쿠키를 지우고 Publish 클릭(POSTMORTEM 2026-09-08 절차) → `Sign in`.
- [ ] L3.4 보관된 프로젝트에 쓰는 Action(🔒 제거 — PRODUCT §7.9:598-601이 CI push를 409로 막는 이유가 "보관 중에 번역이 조용히 바뀌기"다). `runFirstIngest`(`actions.ts:1066-1095`)는 `applyPush`로 번역을 덮는데 `archivedAt`을 안 본다(`addSurface:1016`·`runRepositoryImport:1210`은 본다) → **거부**. 피해는 `apply.ts:110` 가드로 막히지만 스냅샷 다운로드 뒤 `ingest-failed`로 오진한다. `updateBaseLocale`·`connectRepository`·`updateRepositorySettings`·`rotatePushToken`은 번역을 안 바꾸므로 **허용**. §7.9에 "번역을 바꾸는 쓰기는 보관 중 거부, 설정 쓰기는 허용" 한 줄. (audit #18)
  - 검증(자동, 재현 먼저): 보관 프로젝트에서 `runFirstIngest` → 거부(지금은 `ingest-failed`가 나오는 red), 설정 넷 → 성공, **활성 프로젝트 → `runFirstIngest` 성공** 대조.
  - ✅ **PRODUCT §7.9 문장 완료(2026-09-17)**. **남은 것**: `runFirstIngest`의 거부 + 테스트.
- [ ] L3.5 `lib/push/apply.ts:243-248` — `needsReview` 전파 UPDATE가 `updatedAt`만 올리고 `updatedBy`는 그대로라(같은 파일 `:290` upsert는 `NULL`로 비운다 — push 쪽 쓰기 둘이 다르다), 이미 PR로 보낸 편집이 "안 보낸 편집"으로 다시 잡힌다. POSTMORTEM 2026-09-15 `:1732`의 전제("두 컬럼 — `needsReview`·`updatedBy` — 은 배타적으로만 채워진다")가 이 경로에서 거짓이다 — 정정 문장: "push의 `needsReview` 전파는 `updatedBy`를 비우지 않아 두 컬럼이 한 행에 공존할 수 있었다(2026-09-17 수정)". SQL 한 줄 수정이라 순수 판정은 없다. (audit #19)
  - 검증(자동, PG): Publish → 원문 변경 push → 그 셀이 미발송 술어 **네 사본 + 하네스**(L3.10 선행) 모두에서 제외, **원문 변경 후 번역자가 다시 저장 → 포함** 대조. `pnpm test:projects:postgres` green.
- [ ] L3.6 어댑터 잠재 결함. (audit #20)
  - `lib/adapters/json-catalog.ts:325` `normalizeArrays`에 루트 예외가 없어 최상위 키가 `"0".."n-1"`이면 루트가 배열로 나가고 다음 read가 `root-not-object`로 로케일 전체를 떨어뜨린다.
  - `lib/pull/render.ts:126` multi-locale 분기가 `writeStrategy`가 아니라 원본 부재로 판단한다. **문서 스스로 "도달 불가"라 red를 만들 수 없다** — 재현 규칙에 따라 계약 매트릭스의 "원본 파일 둘" 축이 red를 내면 고치고, 안 내면 닫는다.
  - `lib/adapters/yaml-catalog.ts:329` · `code-dict.ts:294`가 원본을 경로가 아니라 `currentFiles?.[0]`으로 고른다(`render.ts:111,134`가 단일 원소로 정규화해 잠복).
  - 검증(자동): 루트 숫자 키 픽스처 왕복 → 객체 유지(**루트가 아닌 숫자 키 → 배열** 짝). 나머지 둘은 계약 매트릭스에 "원본 파일 둘" 축(L1.4의 검사+`Break` 형). CRLF 부류는 POSTMORTEM 2026-09-16 `:1887,1938`.
- [ ] L3.7 동작 어긋남. (audit #21)
  - `lib/pull/run.ts:210-211` — base 브랜치를 바꾸면(`settings/actions.ts:281`) 저장된 `baseBranch`로 옛 PR을 못 찾아(`lib/github.ts:393-402`가 base로도 필터) PR이 하나 더 열린다.
  - `lib/publish/read.ts:45-46` — per-locale 수술적 어댑터에서 로케일 파일이 없으면 미리보기는 변경을 약속하는데 pull은 `missingOriginal`로 안 낸다(`render.ts:104-108`).
  - `app/api/push/route.ts:170,182` — `markImportStarted`가 트랜잭션 밖에서 `lastImportToken`을 덮는다. **결과는 서술보다 나쁘다**: A 성공 → B가 토큰 덮음 → A의 종료 쓰기(`apply.ts:338` 토큰 대조) 0행 → **성공한 임포트가 `import-failed`로 표시**되고, 역방향은 실패가 무음으로 유실된다. 수정은 `markImportStarted`를 `applyPush` 트랜잭션의 `FOR UPDATE` 뒤로 옮기는 것 하나 — B는 잠금 대기 뒤 `stale-commit`을 받아 자기 토큰으로 닫는다.
  - 검증(자동): 첫째·둘째는 단위 재현 red → green + 정상 경로 대조. 셋째는 동시성이라 **PG** — `lib/keys/__tests__/concurrent-import.integration.ts`, barrier로 두 요청 교차 → A `applied`·표면 상태 정상, B `stale-commit`; **순차 두 요청 → 둘 다 `applied`** 대조.
- [ ] L3.8 `lib/login-link/http.ts:94` — `new Request(...) as unknown as NextRequest`. `AUTH_URL`·`NEXTAUTH_URL`을 설정하는 순간 next-auth가 `req.nextUrl`을 구조 분해해 계정 연결 콜백이 전부 TypeError가 되고 `:120`이 무로그 500으로 삼킨다. 유일한 방어선이 `.env.example:58` "의도적으로 없다" 한 줄이다. **같은 파일·같은 부류의 선례가 POSTMORTEM 2026-09-12 `:1173`("테스트가 만든 NextRequest는 복사되고 런타임이 준 것은 던졌다")이다.** 검증만 두지 말고 고친다. (audit #22)
  - 방향: `new NextRequest(request.url, init)`(런타임 객체 복사가 아니라 url+init)이 09-12의 함정을 피하는지 먼저 재현. 안 되면 `.env.example:58`의 경고를 `provider-config.test.ts`가 `AUTH_URL` 부재를 단언하도록 배선으로 옮긴다 — 경고를 문서에만 두면 안 지켜진다(POSTMORTEM 2026-09-05).
  - 검증(자동): `AUTH_URL`을 stub한 상태에서 콜백 핸들러가 던지지 않는다, **미설정에서도 동일** 대조.
- [ ] L3.9 `lib/sync/run.ts:168-169`와 **`app/api/pull/route.ts:113`**이 `failure.detail`(에러 원문)을 `console.error`한다. `lib/github-connect/log.ts:16-24`의 "원문 금지" 규칙과 반대다. (audit #23)
  - 검증(자동): 두 자리 모두 로그 인자에 `error.message` 원문이 없음(스파이), **갈래 이름은 있음** 대조.
- [ ] L3.10 미발송 술어는 **프로덕션 넷**(`lib/keys/view.ts:414` `isUnpublished` · `query.ts:180` `countUnpublished` · `query.ts:573` 목록 raw SQL · `lib/publish/read.ts:19`) **+ 하네스 하나**(`app/(edit)/__tests__/harness.ts:914,1108`)다. `test:projects:postgres`(`list-aggregates.integration.ts:313,466`)는 ①②③만 대조한다 — **④는 PR에 실제로 실리는 행을 정하는 사본**이라 가장 먼저 대조에 넣어야 한다. `readPublishPreview`가 GitHub 호출(`read.ts:26-28`)을 섞고 있어 `where` 빌더를 먼저 순수 함수로 분리해야 대조 가능. 갱신 대상: `CLAUDE.md:140` "세 벌" · `lib/keys/query.ts:563-564` 주석 · `app/(edit)/__tests__/queries.test.ts:123`. (audit #24)
  - 검증(자동, PG): 다섯이 같은 행을 센다 — 보관 표면·orphan 로케일·orphan 키 포함 픽스처. 어느 하나에서 조건 하나를 지우면 red(리포에 남는 동등성 단언).
- [x] L3.11 (2026-09-17 완료) `TranslationSurface.archivedAt`(🔒 제거 — `PRODUCT.md:270` "표면 보관·복원은 다음 라운드"가 이미 결정). **유지한다.** 쓰기 0(`schema.prisma:100`)·읽기 ~40곳·술어 넷이 걸린 컬럼을 런칭 직전에 떼면 `/merge` 1단계 "prod 먼저 넓힌다" 순서를 이 건만 뒤집어야 하고(코드 제거 배포 → 다음 라운드 drop), 이득이 0이다. `20260914070000_finalize_translation_surfaces/migration.sql:10` 가드도 그 컬럼을 참조한다. (audit #24)
  - 할 일: `schema.prisma:100`에 주석(`Project.archivedAt` `:71-78`에는 있고 여기엔 없다) — "쓰는 곳 0, 표면 보관 라운드에서 연다(PRODUCT §7.2)".
  - 검증(수동): `grep -n archivedAt prisma/schema.prisma`에 주석 두 곳.

## R4 — 방어선 공백 (🟡 테스트)

- [ ] L4.1 순서 매핑을 지우면 red가 나게 한다. **대상 정정**: `lib/pull/load.ts:78`은 `sortIndex: k.sortIndex` **통과 줄**이고 `edit-flow.test.ts:56`·`list-aggregates.integration.ts:253`이 이미 실행한다. `order` 매핑은 `lib/pull/plan.ts:203-204` `order: row.sortIndex`다. `entry-order.test.ts:51`이 `loadState`를 스텁하고 `:114`가 `[]`를 돌려 select만 본다. 인용 정정: POSTMORTEM 2026-09-07에 이 항목은 **없다**(넷은 `:521,571,599,616`) → ARCHITECTURE §1.1 `:129-130` "어느 홉이 끊겨도 red". (audit #25)
  - 검증(자동, 재현 먼저): `plan.ts:204`를 지운 상태로 `pnpm test` → 이미 red면 태스크를 닫고 그 사실을 적는다. green이면 `entry-order.test.ts`가 실제 `loadState` 결과의 `sortIndex`를 지나게 고쳐 red → 되돌려 green.
- [ ] L4.2 `lib/push/__tests__/flow.test.ts:331-338`이 `projectId`만 본다 — `apply.ts:239,246`의 `AND "surfaceId"`를 지워도 green, `:74` 스텁 표면이 `lastCommitAt: null` 고정이라 트랜잭션 안 가드(`apply.ts:106-114`)가 한 번도 안 돈다(`:114` 역행 가드는 `refsMode === "replace"`에서만 — Sync `preserve`는 우회). `app/api/__tests__/route-diagnostics.test.ts:45`의 mock에 `ApplyGuardError`가 없어 500 테스트가 우연히 통과할 수 있다. (audit #26)
  - 검증(자동, 리포에 남기는 형): UPDATE SQL 인자에 `surfaceId`가 포함된다는 단언(뮤테이션 일회 확인이 아니라) / `lastCommitAt`이 앞선 픽스처로 가드 발동 → 409 / mock에 `ApplyGuardError` 추가 뒤 500 테스트가 의도한 이유로 green.
- [ ] L4.3 이름과 본문이 다른 테스트를 고친다 — 항목별 대체 단언: (audit #27, POSTMORTEM 2026-09-03 재발)
  - `lib/adapters/__tests__/nested-keys.test.ts:105` — 제목이 말하는 축을 실제 픽스처로.
  - `yaml-catalog.test.ts:213`·code-dict의 "중간 경로를 만든다" — 구현(`insertPath:472`가 평탄 점 키를 낸다)과 **반대**다. L1.4 결정 뒤 그 걷기의 결과를 제목으로.
  - `lib/survey/__tests__/one.test.ts:339` — 제목의 조건을 단언으로.
  - `components/__tests__/members-screen.test.ts:68` — `not.toContain('requireProjectAccess(...arguments)')`는 절대 실패하지 않는 리터럴 → **위치 단언**(첫 JSX return보다 앞).
  - `lib/keys/__tests__/repository-import.integration.ts:191` — 다섯 케이스가 `reason` 없이 `superseded`만 봐서 구별이 안 된다 → `:187`처럼 `reason`을 박는다.
  - 검증(자동): 각 항목의 새 단언이 옛 구현/옛 픽스처에서 red였음을 커밋 메시지에 남긴다.
- [ ] L4.4 `?.` 뒤 부정 단언 — **재현 먼저**: 8곳 중 `render.test.ts:214,223`·`run.test.ts:605`·`new-project.test.tsx:573`(문서 `:573`, 감사 `:565`)은 직전 줄이 존재를 보장해 이미 red다 → "재현 안 됨"으로 닫는다. 공허한 것은 `render.test.ts:105,270`·`github-callback.test.ts:307,337` 넷. POSTMORTEM 2026-09-14 후속 목록(`:1359-1374`)에 **`token-store.test.ts:144`·`detect.test.ts:189,361`**도 있다 — 추가. (audit #28)
  - 검증(자동): 각 자리에 존재 단언 선행. 존재 단언을 빼면 red(리포에 남는 형).
- [ ] L4.5 픽스처 편향: JSON 어댑터 CRLF(`JsonStyle`에 개행 필드 없음, `lib/adapters/json-style.ts:24-44`) · ts-dict 스타일 한 가지 · scan 픽스처 전부 큰따옴표 · `` t(`key`) `` 거부(`lib/scan/ast.ts:250-256`) 미고정. 범위는 JSON — yaml·code-dict CRLF는 이미 있다(`yaml-catalog.test.ts:556`, `code-dict.test.ts:569`). (audit #29)
  - 검증(자동): 각 축에 둘째 스타일 픽스처 — CRLF 원본 값 무변경 write → 바이트 동일(**LF 원본은 LF 유지** 짝).
- [ ] L4.6 survey 측정을 프로덕션 write 경로에 맞춘다. `lib/survey/one.ts:499` `writePerLocale`이 `buildWriteEntries`를 안 거쳐 `diffRatioNonBase`가 비-base 재배열을 ≈0으로 보고하고, `order-metrics.test.ts:196`이 그 0을 고정한다. `:534` `writeMultiLocale`이 `writeWithErrors`가 아니라 `write`를 불러 ts-dict `writeErrors`가 구조적으로 0이다. (audit #30, POSTMORTEM 2026-09-02 재발)
  - 검증(자동): 키 순서가 base와 다른 `ko.json` 픽스처 → `diffRatioNonBase > 0`(`order-metrics.test.ts:196`의 `toBe(0)`이 곧 red). ⚠️ 고치면 ARCHITECTURE §1.9 지표가 바뀐다 — `/push` 4d 재측정 판단.
- [ ] L4.7 프로덕션이 안 쓰는 경로를 고정한 테스트 — **재현 먼저**: `lib/onboarding/workflow.ts:49-53` `renderWorkflowYaml`은 `renderProjectWorkflowYaml`의 얇은 래퍼라 구현이 한 벌이고 `workflow.test.ts:195`가 이미 2표면을 센다 → 지울 것은 래퍼 자체뿐일 수 있다(단, **`docs/ACTIONS.md:28`이 그 이름을 가리킨다** — 같이 고친다). `lib/auth/safe-adapter.ts:31-38` `getSessionAndUser`는 프로덕션에서 `lib/credentials/adapter.ts:54-63`에 가려지고 `auth.ts:82` 주석이 낡았다(`credentialAdapter`, `:87`). (audit #31, POSTMORTEM 2026-09-02 "순위 픽스" 재발)
  - 검증(자동): 테스트가 프로덕션 호출 경로를 import한다(grep) · 지운 함수의 참조 0(문서 포함).
- [ ] L4.8 테스트 없는 순수 모듈에 단위 테스트: `lib/settings/message.ts`(`Object.hasOwn` 가드가 소스 텍스트로만 검사됨) · `lib/survey/ts-shape.ts` · `lib/survey/stats.ts` · `lib/scan/ast.ts`. (audit #32)
  - 검증(자동): 각 모듈 직접 import 테스트, `hasOwn` 가드는 `constructor` 키로 red→green.
- [ ] L4.9 검사 범위 공백: `components/__tests__/client-graph.test.ts`가 npm 패키지 이름만 금지(의존성 없는 서버 모듈 유입 통과 — POSTMORTEM `:560` "금지 목록 방식이라 재발을 못 봤다") · `lib/github-connect/__tests__/credential-separation.test.ts:75-85`가 `app/**`뿐 아니라 **`lib/pull`·`lib/push`·`lib/projects`·`lib/publish`**도 안 훑는다(`lib/projects/open-pr.ts:23` 같은 자리, POSTMORTEM `:539` "2홉은 못 본다"). (audit #47)
  - 검증(자동, 리포에 남는 형): client-graph를 **허용 목록 반전**(패키지 금지 → `@/lib/**` 잎 화이트리스트)으로 · credential-separation 루트에 넷 추가. 각각 지금 통과하는 위반이 있으면 그 목록을 태스크에 적고 고친다.

## R5 — 삼킨 실패 (🟡)

- [ ] L5.1 POSTMORTEM 2026-09-14(`:1497`) 후속 미이행: `auth.ts:202` · `lib/credentials/access.ts:11`과 **`:45-48`**(둘째 무로그 swallow) · `lib/credentials/storage.ts:7`(`MissingEnvError`의 변수 이름까지 버림) · `lib/credentials/command.ts:35`. PII 키 하나가 빠지면 로그인·초대가 전부 "Unavailable"이고 서버 로그 0줄이다. `logFailure` 형으로 갈래 이름을 남긴다(원문 금지). (audit #33)
  - 검증(자동): 각 catch 경로에서 로그 1줄 + 갈래 이름, 원문 없음, **성공 경로 로그 0** 대조. `lib/credentials/**`를 건드리므로 `pnpm test:credentials:postgres` 손으로.
- [ ] L5.2 같은 형 확산 — **공유 추상화는 만들지 않는다**(셋은 목적·AsyncLocalStorage 격리가 다르다). 할 일 둘: (audit #34)
  - OAuth 콜백 래퍼 셋(`session-revocation/http.ts` · `account-connect/http.ts` · `login-link/http.ts`)을 **계약 테스트 하나**로 잰다 — 같은 예외 주입 → 같은 상태 코드·로그 1줄·state 쿠키 정리. 상태 코드는 지금 200/200/500이고 **login-link의 500은 `:132` `loginFailed`가 소비**하므로 200으로 맞추면 실패 감지가 죽는다 → 500 쪽으로 통일.
  - 실결함 둘: `login-link/http.ts:146-150`이 `linkStateCookie(false)`를 **안 지운다**(secure일 때 stale state 잔존) · `account-connect/http.ts:39` 로그에 ref·클래스 없음.
  - 나머지 12곳(`session-revocation/store.ts:34,56` · `login-link/store.ts:92-94,163-165` · `lib/projects/open-pr.ts:25-27` · `app/(edit)/projects/actions.ts:200-202` · `app/invite/actions.ts:103-105` · `app/(edit)/account/actions.ts:166,195-197` · `app/invite/[token]/page.tsx:72,92-94` · `app/signin/link/[challenge]/page.tsx:50-53` · `surfaces/new/page.tsx:21-22`)은 L5.1과 같은 형으로 각각 로그 1줄 + 성공 경로 0 짝.
  - 검증(자동): 계약 테스트 red(지금 셋이 다르다) → green. 실결함 둘은 각각 재현 red.

## R6 — 문서 드리프트 (🟡, 문서별 커밋)

- [ ] L6.1 "리포·App private" 전제 제거: `docs/ACTIONS.md:9,11,76-77` · `CLAUDE.md:171,232` · `README.md:63` · `.claude/commands/merge.md:7` · `.claude/commands/push.md:9` · `.github/actions/malmoi-i18n-push/action.yml:7-9`(주석 — 태그 릴리스와 묶는다). **브랜치 프로텍션(결정됨)**: `main`에 required check `verify`만 켠다 — `/merge`는 PR 경로라 안 걸리고 `/sync`는 dev를 밀어 안 걸리며, CLAUDE.md:217 "다른 창구가 main을 직접 친 경우"의 구멍만 닫힌다. 고칠 문서는 PRODUCT가 아니라 CLAUDE.md:206·217. (audit #35)
  - 검증(수동): `grep -rn "private" docs CLAUDE.md README.md .claude/commands` 결과를 한 줄씩 판정 → 남는 것은 "private이었다"는 과거형뿐. `pnpm sync:agents:check`. `gh api repos/SinhyeokKang/malmoi/branches/main/protection --jq .required_status_checks.contexts` → `["verify"]`.
- [x] L6.2 (2026-09-17 완료 — `lib/search-params.ts`·`utils.ts`는 잎 유틸이라 목록 밖) 코어 모듈 목록 둘(`docs/ARCHITECTURE.md:3` · `.claude/commands/push.md:110`)에 `lib/publish/` 추가(`lib/search-params.ts` 판정 포함). (audit #36)
  - 검증(수동): `ls lib` ↔ 두 목록 diff 0.
- [x] L6.3 (2026-09-17 완료) 문서끼리 모순 — 항목마다 정본 하나를 정하고 **나머지가 0건이 되는 grep**을 적는다: (audit #37)
  - GitHub OAuth 앱 개수: 정본 `CLAUDE.md:149` "하나" → `README.md:65` · `PRODUCT.md:194` · `.env.example:107` · `push.md:180` 갱신. grep `rg -n "OAuth 앱.*셋|three OAuth" README.md docs .env.example .claude` → 0.
  - `.claude/commands/audit.md:121` "RLS 없음 — 유일한 방어선" → CLAUDE.md의 "GRANT 0 + 탐지" 문장으로. grep `rg -n "유일한 방어선" .claude/commands` → 0.
  - PRODUCT §10 미결 목록 안의 결정 항목(`:626`)과 `docs/ACTIONS.md:19`가 가리키는 없는 항목 → grep 결과 링크 대상 실재.
  - PRODUCT의 옮겨진 §5·§6 참조(`:151,231,335,459,535,548,625`) → `rg -n "§[56]\b" docs/PRODUCT.md`의 각 줄이 실제 절과 일치.
  - `README.md:7` "원격 배포 대기" → 삭제. `lib/github-connect/origin.ts:41`의 셋째 호스트 문서 부재 → CLAUDE.md 브랜치 정책에 한 줄.
- [ ] L6.4 숫자·목록: `docs/DIRECTORY.md:25` 예외 아홉(실제 10+1) · `:348` 12테이블(13) · `:61-62` 열둘(16) · `CLAUDE.md:223` 여섯 개(8) · DIRECTORY 미등재(`app/api/auth/[...nextauth]/` · `app/(edit)/publish-actions.ts` · components 루트 6개 · `components/projects/search-input.tsx` · `prisma/maintenance/` · `prisma/__tests__/` · `.github/actions/malmoi-i18n-push/` · vitest 설정 둘 · `types/next-auth.d.ts`) · `DIRECTORY.md:352-353` `smoke-blob` · CLAUDE.md 데이터 경로 표에 `app/api/push/failure/route.ts`·`publish-actions.ts`·L2.4의 `setup/route.ts` · 명령 표에 `credentials:finalize:*`·push:local `--surface`/`--path-template`·adapter-survey `--limit`/`--jobs` · `prisma/schema.prisma`의 `docs/MVP.md`·"SAAS §8" 참조 · `docs/ARCHITECTURE.md:5` 죽은 `(미구현)` 범례. 수치는 가능하면 문장에서 빼고 테스트가 센다(POSTMORTEM 2026-09-15). (audit #38)
  - 검증(수동): `/doc-check`로 대조.
- [x] L6.5 (2026-09-17 완료 — PRODUCT §4.2 `needsReview` 문장, ARCHITECTURE §5.5.7 신설) 근거를 정본으로 올린다: `needsReview`("To review")가 비범위 승인 워크플로가 아니라는 것을 PRODUCT에 · `repositoryImportToken`·`lastImportToken`·`importRevision`의 근거를 ARCHITECTURE §5.5/§5.6으로(지금은 `sync-edit-protection/design.md`에만 있다). sync-edit-protection 디렉터리는 L1.5가 끝날 때 그 문서의 T19가 지운다. (audit #39)
  - 검증(수동): `grep -rn "sync-edit-protection" docs prisma lib` → L1.5 완료 뒤 정본 참조만 남음.

## R7 — 컨벤션·정리 (🟡·⚪)

- [ ] L7.1 컨벤션: 영어 주석 약 40줄(`lib/session-revocation/http.ts` · `lib/account-connect/store.ts` · `lib/import/*` · `lib/push/apply.ts:15-18` · `lib/credentials/access.ts:9` 등) · `app/signin/link/[challenge]/page.tsx:112`·`app/layout.tsx:8` UI 리터럴 → 사전 · **타임존(결정됨)**: 절대 시각은 `<time dateTime>` + `" UTC"` 라벨(Logs 형 `logs/page.tsx:40-46`이 정본), `publish-button.tsx:316`(라벨 없는 로컬)·`[challenge]/page.tsx:112`를 그 형으로; 상대 시각은 `lib/relative-time.ts`; CLAUDE.md "표시 시점에만 로컬로 변환"은 상대 시각에만 적용되도록 정정 · `lib/credentials/migration.ts` `plan*` 이름의 비순수 함수 · `lib/github-connect/user.ts`·`lib/auth/safe-adapter.ts` `server-only` · `lib/credentials/command.ts:23-30` env 직접 읽기. `publish-button.tsx:459,462` 경로 상수화는 **L3.3으로 옮겼다**. (audit #40)
  - 검증(자동): `pnpm typecheck` · `pnpm test` · `no-korean-ui`. 타임존은 절대 시각 렌더 셋에 `" UTC"` 리터럴 단언(DOM). 주석 언어는 `rg -n "^\s*//\s*[A-Za-z].*[a-z]{4,} [a-z]{4,}" lib app` 수동 판정.
- [ ] L7.2 N+1: `app/(edit)/projects/[slug]/surfaces/[surfaceSlug]/locales/page.tsx:57-58` · `translations/page.tsx:185-186`가 표면마다 `countUnpublished` 1쿼리(`Promise.all`이라 직렬은 아님). `translations/page.tsx:158-161`과 `:185`가 **두 라운드**로 갈려 `:155-156` 자기 주석과 모순. 표면별 집계 한 번(`countUnpublishedBySurface`)으로. (audit #40)
  - 검증(자동, PG — `lib/keys/__tests__/list-aggregates.integration.ts`에 추가): 표면 N개에서 쿼리 수 1(Prisma `$extends` 훅), 결과가 표면별 개별 호출과 동일. L3.10 동등성 대조에 이 사본도 넣는다(여섯째가 되지 않게 **①을 호출**한다).
- [ ] L7.3 스크립트가 프로덕션 경로를 우회: `scripts/ingest.ts:85-110`이 `--base`를 검증하지 않는다(`assemble.ts:46-50`은 검증; `selectLocaleFiles`는 이미 공유 `:65`, 바깥 조립만 중복 — ARCHITECTURE §5.5.0 "통일은 미결"). **`ingest.ts`를 `assemblePushInput`으로 통과시키는 것이 검증 추가보다 짧다.** `scripts/smoke-github.ts:128-134`가 `readFiles` 예산 검사를 건너뜀. `lib/cli/args.ts:28` `flagValue`가 다음 플래그를 값으로 삼킴 → `startsWith("--")` 한 줄. (audit #41, #46)
  - 검증(자동): 없는 로케일 `--base` → exit ≠ 0(**있는 로케일 → 0** 짝). `flagValue("--x", ["--x", "--y"])` → undefined.
- [ ] L7.4 ⚪ 정리: 죽은·과잉 export(`looksLikeCatalog` · `REGISTERED_ADAPTERS` · `mergeCandidates` · `serialize` · `tsDictDetectByContent` · `loginAccountData` · 재수출 4곳 · 미사용 import 5곳) · 영역 간 중복 헬퍼(문자열 비교 · 세션 쿠키 이름 하드코딩 6곳 · `lockUser` ×3 · HTTP status 추출 ×3 · `isUniqueViolation` ×2 · scripts dotenv/PrismaClient) · 낡은·틀린 주석(`lib/github.ts:1-5` · `lib/auth/query.ts:13-15` · `lib/locale-code.ts:27-29`). `actions.ts:834`는 **틀린 주석이 아니다**(`REF_SAFE_SLUG`는 `ref-slug.ts:14`, `trigger.ts:24` 재수출 한 홉) — 뺀다. (audit #44, #45, #46)
  - 검증(자동): `pnpm typecheck` · `pnpm test`. 죽은 export 제거는 typecheck가 안 잡는다 — `rg -n "<이름>" lib app components scripts` 0건을 항목마다.
- [ ] L7.5 ⚪ (리허설 2026-09-18: dev.mal-moi.com의 ③에서 "Opens at mal-moi.com/projects/…"로 보였다 — 재현) 공개 리포 표면: `lib/github-connect/origin.ts:41` 개인 Vercel 팀 slug 호스트 · `components/onboarding/steps/naming.tsx:89` `mal-moi.com` 하드코딩(사전에 없음, dev에서도 표시) → **호스트를 빼고 경로만**(`/projects/{slug}`) 보인다 — 힌트의 목적은 slug가 URL·브랜치에 박히는 모양이라 호스트 없이도 참이고 origin 판정을 끌어올 필요가 없다; `:91`의 `malmoi-i18n/sync-` 접두는 `syncBranchFor`와 중복(주석이 인정) · Supabase ref 두 개·운영 절차 노출 판단. (audit #42)
  - 검증(자동): 힌트 렌더에 호스트 문자열 0 + `syncBranchFor(slug)` 값과 일치.
- [ ] L7.6 ⚪ 좁은 창·기타: `lib/push/apply.ts:106-111` 토큰 회전 직전 push · `app/signin/link/[challenge]/page.tsx:137-141` origin 판정 실패 시 non-secure 쿠키(`origin?.secure ?? false`) → **fail-closed**: `requestOrigin === null`이면 시작 자체를 거부(§6.4 "빈 `AUTH_SECRET`은 던진다"와 같은 판단; 지금은 시작 `?? false`·콜백이 갈려 증상이 "계정 병합 실패"로 나왔다, CLAUDE.md 2026-09-14) · `lib/failure.ts:77` pg 오류 원문 서버 로그 · `lib/adapters/json-style.ts:111,117`. 셀 비우기 의미 항목은 **L1.3으로 옮겼다**. (audit #46, #48)
  - 검증(자동): origin `null` → 링크 로그인 시작이 거부 응답(**정상 origin → 시작** 짝). `failure.ts:77` 로그에 pg 원문 없음(스파이).
- [ ] L7.7 ⚪ composite action이 대상 리포 러너에 malmoi 앱 의존성 전체(576 패키지, 실측 30~50초, `@prisma/engines` 설치 스크립트)를 설치한다(🔒 제거 — "egress 제한 self-hosted 러너"는 관측이 아니라 추측이고 PRODUCT에 0회). **선행 단계 하나만**: `pnpm install --ignore-scripts`(+`--prod` 가능 여부) 실측 — `push-local`은 Prisma를 안 쓰므로 `@prisma/engines` 다운로드는 순수 낭비다. 그래도 30초대면 그때 번들을 PRODUCT §10에 올린다. `docs/ACTIONS.md`에 "run당 N초" 한 줄. (audit #43)
  - 검증(수동): 폐기용 리포 run의 install 스텝 시간 전/후. ⚠️ `action.yml` 변경은 태그 릴리스다.

---

## 완료 판정

**R0 · R1(L1.5 포함) · R2 중 L2.0·L2.1·L2.3·L2.4가 닫힌 뒤**, 아래 왕복을 **L0.5의 두 계정**으로 한 번 완주한다. 오너는 관찰만 한다.

> 2026-09-18 리허설(정식 판정 아님 — 오너 계정이 리포 소유자이고 브라우저를 에이전트가 돌렸다): ① 설치 요청 경로 대신 관리자 설치 · 설치 링크→④ 4분 05초 · run 35239896384 green(두 표면 200) ② 초대→Publish 2분 18초 · PR #14 `+2 −2` 제목 마커 ③ merge commit `4d206cf` · run 35240428269 **skipped** · sync 브랜치 삭제 ④ 편집 3건 `updatedBy` 보존 · 재-Publish PR #15에 후속 1건만. 미측정: 재pull 0 diff(cron), 비관리자 설치 요청.

1. **개발자(L0.5 GitHub 계정, `malmoi-test-org` 비관리자)**: 로그인 → 설치 요청 → (오너 승인) → 착지 → 프로젝트 생성 → 설정 화면 링크만 따라 워크플로 부착 → CI push. 관측물: 요청 대기 화면 · 착지 후 `/projects/new` · **대상 리포 run URL(green)**.
2. **비개발자(L0.5 Google 계정, 테스트 사용자 목록 밖)**: 초대 링크 → Google 로그인 → 수락 → 편집 → Publish. 관측물: 수락 화면 · **PR URL**. **스톱워치**: 초대 링크 클릭부터 Publish까지 안내 없이 — PRODUCT §1 "10분 안에·설명 없이"의 유일한 측정이다.
3. **개발자**: PR을 **"Create a merge commit"**으로 머지. 관측물: **merge commit SHA** · 재push run URL에 skip notice(`action.yml:86`).
4. 머지 뒤: 비개발자가 Publish 이후 저장한 편집이 **DB에 남아 있고**(`updatedBy` 보존 쿼리 1건) 다음 Publish에 실린다 · 재pull이 **0 diff**(PRODUCT §1 "무의미한 PR" 없음, `l10n-roundtrip.md` 4단계) · sync-edit-protection T17의 보류→적재 재개.
5. 🔒 결정은 전부 PRODUCT·ARCHITECTURE에 문장으로 남았다(위 "결정 기록"의 오른쪽 열).
6. 이 디렉터리를 지운다.
