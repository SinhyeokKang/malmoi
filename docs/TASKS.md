# TASKS

**`docs/MVP.md` §8 구현 순서를 완료 조건이 붙은 체크리스트로 펼친 것이다.** **§0이 현재 위치이고**, §1~§9는 2026-09-03 범위 재정의 전에 쌓인 단계별 기록이다. 여기엔 *무엇이 되면 끝인가*만 있다 — 무엇을 만드는지는 [MVP.md](./MVP.md), 왜 그렇게 만드는지는 [ARCHITECTURE.md](./ARCHITECTURE.md).

**이 문서는 진행 상태를 담으므로 코드보다 먼저 낡는다.** `/push` 4단계 문서 신선도 검사가 이 파일을 트라이아지 대상에 포함하고, `/doc-check`이 diff와 무관하게 전수 대조한다 — 태스크를 완료했으면 체크하고 근거(커밋·테스트·산출물)를 남긴다. 체크되지 않은 항목은 "안 된 것"으로 취급한다.

규칙:
- 체크는 **검증 조건이 실제로 통과했을 때만** 한다. "코드를 썼다"는 완료가 아니다.
- `🔒` 표시는 **착수 전 사용자 결정이 필요한 항목**이다 (MVP.md §10·SAAS.md §10과 연동). 결정 없이 진행하면 나중에 뒤집힌다.
- 커밋 경계(`——`)를 지킨다. `/ship`이 이 분리를 커밋 단위로 쓴다.

---

## 0. 지금 어디에 있나 (2026-09-03 범위 재정의 — MVP §8.1)

> **⚠️ 현재 단계는 SaaS화이고 정본은 [SAAS.md](./SAAS.md)다** (2026-09-05부터). 이 문서는 **PoC 기록**으로
> 닫혔다 — 아래 §0과 "전역 미결"은 그 PoC의 마지막 상태이고, 지금 무엇을 해야 하는지는 SAAS.md §8이
> 답한다. 두 문서의 경계는 이렇다: **MVP.md·TASKS.md = PoC(닫힘) / SAAS.md = 지금**.


**MVP는 셋으로 다시 정의됐다.** 아래 §1~§9는 그 재정의 **전에** 쌓인 단계별 기록이고, 앞으로의
작업은 A·B·C로 잡는다.

| 단계 | 무엇 | 상태 |
|---|---|---|
| **A. 모듈 완성** | `lib/` 각 모듈이 자기 입·출력 계약을 닫는다 | 대부분 됨 — 아래 표 |
| **B. 데이터 플로우 체크** | 세 흐름이 **끝에서 끝까지** 값을 안 잃는다 | ✅ 됨 (2026-09-03) |
| **C. Actions + Cron** | push가 CI에서, pull이 cron에서 자동으로 돈다 | ✅ 됨 (2026-09-03) — 잔여였던 bugshot-2 실리포 연동은 5단계가 **"안 붙인다"로 닫았다** — 워크플로가 붙은 리포는 `order-check` 하나이고 나머지는 토큰 미발급이 정상 상태다 |

**그 다음이 SaaS화다** — 인증·인가, 프로젝트 생성, 복수 멤버, **UI 시작**. `main`/`dev`는 거기서
나누기로 했다가 2026-09-04에 앞당겨 나눴다 (MVP §8.4, 아래 전역 미결). SaaS 2단계(tenant-auth)는
2026-09-06에 프로덕션에 나갔다 — 진행은 SAAS §8이 정본이다.

**2026-09-07 현재**: 4단계(GitHub 설치 연결)와 5단계(탐지 온보딩)가 **프로덕션까지 갔다** — T8까지
끝났다(`db:deploy` → prod 마이그레이션 11개 → `/merge` PR #9 → squash `f595cc3` → 대상 리포 토큰·secret
교체 → CI green `updated: 23`). ✅ **옛 env 삭제까지 끝났다** (2026-09-07 리뷰 ⚪16 — `main`에 #9 위로
#10이 이미 얹혀 롤백 창이 사실상 닫혀 있었다). ⚠️ **"세 스코프"가 아니었다**: `ACTIVE_PROJECT_SLUG`·
`PUSH_TOKEN` 둘 다 **Production+Preview 두 스코프만** 갖고 있었고 Development에는 없었다 —
`vercel env ls`로 삭제를 확인했다(성공 메시지가 근거가 아니다).
⚠️ **전환 계획의 "기존 프로젝트 넷의 토큰 재발급"은 전제가 틀렸다** — l10n 워크플로가 붙은 리포는
`i18n-order-check` **하나**이고, 쓰는 곳이 없는 토큰은 발급하지 않았다(`pushTokenHash`가 `null`인 것이
fail-closed의 올바른 기본값이다). **6단계(번역 UI 재작성 + Publish)는 진행 중이다** — 6a가 4번의 배송으로 갈렸고 **ship 1**(기반, `46df51a`
PR #12)과 **ship 2**(셸, `add099a` PR #14)가 프로덕션, **ship 3**(T7 번역 화면 + Publish)이 dev에 있다.
진행의 정본은 SAAS §8과 `features/translation-ui/tasks.md`다.

### 부채 정리 라운드 (2026-09-04, `/audit` 1회차)

**SaaS화 전 부채 정리로 코드베이스 전수 감사를 돌렸다** (불변식·원칙·경계·부채 4차원, 발견 45건).
🔴 1건 · 🟡 20건을 반영했고 **코어 원칙·인증·테넌시·환경변수 위반은 0건**이었다. 고친 것 중 프로덕션
동작이 바뀐 것은 넷이고, 넷 다 **"만든 것이 실제로 호출되는가"** — 이 리포의 반복 실패 유형이다:

- **`Project.nestedByPath`** (마이그레이션 `_add_project_nested_by_path`) — 파일별 중첩 관측이
  어댑터·survey에만 살아 있어 프로덕션 pull이 옛 동작이었다 (ARCHITECTURE §1.35의 홉 5개 표)
- **base description 폴백** — `renderLocaleFiles`가 `isBase`를 안 넘겨 단위 테스트에서만 켜졌다
- **`writeWithErrors`** — survey만 소비했다. pull이 `PullResult.warnings`로 올린다
- **`matchGlobPaths`** — multi-locale 파일 선택이 push·pull·survey에서 갈려 있었다

✅ **재측정 트리거는 해소됐다** — `lib/adapters/**` 변경이라 걸렸던 것을 **13차**(`0bcbd57`,
ADAPTER-COVERAGE §18)가 학습·홀드아웃 둘 다 돌려 닫았다. 전 지표가 12차와 같아 회귀 0이다.
이후 변경은 하나뿐이고(2026-09-07 `code-dict.ts`의 `codeDictCandidatePaths` 분리 — 온보딩 2패스 탐지용)
**필터·순위 로직이 0줄 바뀌어 회차를 더하지 않았다**(ADAPTER-COVERAGE §19). 재측정 부채 없음.

남긴 것: 동결된 편집 UI(MVP §8.3) 관련 ⚪, 미사용 type export. (당시 데드 코드로 든 `isOrgAllowed`는
2026-09-05 tenant-auth가 `allow.ts`째 삭제했고, `lib/survey/merge.ts`는 `one.ts`가 import하는 위임 흔적이라
데드 코드가 아니다.) 판단 근거는 그 라운드 리포트에 있다.

**2회차 (2026-09-04, 다른 창구의 감사 리포트 7건).** 전부 실재를 확인해 반영했다. 프로덕션 동작이
바뀐 것은 넷이다:

- **push가 한 트랜잭션이다** — 둘로 나뉘어 있어 뒤쪽 실패가 혼합 DB를 남겼다. 삽입 id를 호이스트해
  중간 조회를 없앴다 (ARCHITECTURE §5.5.15). 중복 평탄화 키가 그 실패를 실제로 유발하므로 생산자와
  `applyPush` 양쪽이 접는다
- **`Locale.orphaned`** (마이그레이션 `_add_locale_orphaned`) — 사라진 로케일이 DB에 잔존하고 pull이
  그 파일을 **되살렸다** (§5.5.16). `isBase`도 함께 내린다
- **수술적 어댑터 셋의 키 단위 스킵을 보고한다** — 비리터럴·알리아스·맵 자리·로케일 객체 부재가
  조용히 버려졌다. 계약 테스트가 `writeWithErrors` 구현·바이트 동일·`write`와의 일치를 고정한다
- `docs/features/pull-to-pr/tasks.md`의 미체크 11건 — 실제로는 전부 끝나 있었다

### A. 모듈별 상태

| 모듈 | 소스 | 테스트 | 남은 것 |
|---|---|---|---|
| `lib/adapters` | 10 | 18 | 없음 — 어댑터 5종 + 계약 테스트 전수 (+ quote-style·json-style) |
| `lib/pull` | 10 | 12 | 없음 — 진입점 회귀 + 조립층(`trigger`) + 브랜치 이름 소비자 + `targets`·`ref-slug`(2026-09-07) |
| `lib/push` | 7 | 8 | 없음 (+ guard·payload·assemble·token) |
| `lib/onboarding` | 8 | 8 | 없음 — 탐지·확정·첫 적재·slug·readiness·워크플로 YAML (SaaS 5단계, 2026-09-07) |
| `lib/cli` | 2 | 2 | 없음 — 세 CLI의 인자 파싱·리포 훑기 (2026-09-04, `walk` 테스트 추가) |
| `lib/survey` | 9 | 6 | 없음 (측정 전용) |
| `lib/keys` | 3 | 3 | `query.ts`가 `server-only`라 소스 정적 검사로 대신함 (`actor.test.ts`가 그 형태다 — malmoi#3) |
| `lib/auth` | 13 | 13 | 없음 — tenant-auth(2026-09-05~06)로 늘었다. 표의 나머지 행은 2026-09-04 스냅샷 |
| `lib/scan` | 4 | 3 | 없음 — 훅·namespace까지 (A-1 ✅) |
| `lib/github-connect` | 10 | 9 | 없음 — 사용자 토큰·`probeRepo` 근거·연결 판정 (SaaS 4단계, 2026-09-07). `credential-separation`이 자격증명 경계를 소스에서 상시로 센다 |
| `lib/githash`·`env` | 2 | 2 | 없음 |

- [x] **A-1. `lib/scan` 계약을 닫는다** ✅ (2026-09-03) — `WrapperId.kind`로 호출 형태를 가르고
      훅 반환 바인딩을 스코프째 추적한다. `🔴 훅 기반 호출 지원`·`🔒 namespace 상대 키` 둘 다
      **지원으로 판정**됐다 (§3b)
  - 검증: 단위 26건 추가(훅 구조분해·별칭·스코프·namespace 해석·래퍼 복수·미해결 경고),
    실측 3개 리포에서 **오탐 0** — skillflo 0→1144키, bugshot-web 0→30키, bugshot-2 변화 없음
    (ARCHITECTURE §4.0.2)

### B. 데이터 플로우 체크 — 흐름별로 하나씩

**A와 층이 다르다.** A는 "이 모듈 안에서 안 사라지는가", B는 **"모듈을 이어 붙였을 때 홉 사이에서
안 사라지는가"**. `docs/POSTMORTEM.md`에 그 실패가 넷 있다 — 단위 테스트가 전부 green인 채 기능이
멎은 경우들이다.

- [x] **pull 흐름** ✅ (2026-09-03, 키 순서 보존 §5-1) — `runPull` 진입점에서 **커밋에 실린 파일
      바이트**를 단언한다. 값 전달 4홉 중 하나만 끊겨도 red다
  - 실물 PR로도 확인 ([i18n-order-check#1](https://github.com/SinhyeokKang/i18n-order-check/pull/1))
- [x] **B-1. push 흐름** ✅ (2026-09-03) — `lib/push/__tests__/flow.test.ts`가 로케일 파일 →
      `detect` → `read` → `buildPushPayload` → `planPush` → **`$executeRaw`가 받은 값**까지를
      한 테스트에서 단언한다 (ARCHITECTURE §5.5.6)
  - 검증: prisma 스텁이 태그드 템플릿 인자를 캡처한다. `sortIndex`의 0(falsy)·키 description과
    로케일 description의 분리·`placeholders` JSON 직렬화·`refs`의 keyId 연결·빈 값 제외·
    orphan/unorphan/`needsReview` 전파까지 20건. **컬럼 이름 수 = 값 배열 수**를 매번 검사해
    `unnest` 인자 순서가 어긋나는 것도 잡는다
  - **함께 닫은 구멍**: 페이로드 생산자가 `scripts/push-local.ts`의 리터럴이라 테스트가 닿지
    않았다 (POSTMORTEM 2026-08-31이 지적하고 "생산자를 하나로 유지하라"고 적어둔 자리).
    `lib/push/payload.ts`로 올렸고 CLI가 그것을 쓴다 — C단계의 Actions도 같은 함수를 지난다
  - 실측 스모크: bugshot-2 chrome-locales 4키 / bugshot-2 ts-dict 903키(multi-locale) /
    skillflo json-catalog 1446키 — 세 경로 모두 조립이 정상
- [x] **B-2. 편집 흐름** ✅ (2026-09-03) — `app/(edit)/__tests__/edit-flow.test.ts`가
      `saveTranslation` → DB → `loadPullState` → `runPull`이 **커밋에 싣는 파일 내용**까지 잇는다
  - **메모리 DB 하나를 저장과 조회가 공유한다.** 스텁을 둘로 나누면 홉 사이의 손실이 정확히
    안 보인다 — 그게 B단계가 보려는 것이다
  - 검증 12건: 저장 값이 파일에 그대로 / base 로케일 편집도 반영 / 값을 지우면 키가 파일에서
    빠지되 행은 남는다 / 공백만은 미번역, 값 안의 공백은 보존 / `needsReview` 하강과 `updatedBy`
    / **저장이 `updatedAt`을 올려 pull 1층 스킵이 풀린다**(저장이 DB에 닿았다는 관측 가능한 증거)
    / 같은 값 재저장은 DB를 안 건드린다(noop이 pull을 깨우면 빈 PR이 쌓인다) / 테넌트 격리·로케일
    소속·입력 계약 거부
  - ⚠️ **편집 UI를 동결했어도 이 경로는 살아 있어야 한다** (MVP §8.3)
  - **손실 창은 여기서 관측되지 않는다** — 그건 push가 이 값을 덮는 쪽이라 B-3이 답한다
- [x] **B-3. 손실 창 실증** ✅ (2026-09-03) — 이 도구의 핵심 계약이고 그전까지 **한 번도
      관측된 적이 없었다.** `order-check`(23키, 실물 리포 `i18n-order-check`)에서 실제
      `/api/push`·`/api/pull` 라우트를 지나 양쪽을 돌렸다. 결과는 MVP §3.1의 "실증" 표
  - [x] **B-3b. 창이 열려 있는 쪽** — 편집 3건 → **머지 전에** push → 3건 전부 리포 값으로
        되돌아갔다. 스펙과 코드가 일치한다
  - [x] **B-3a. 창이 닫히는 쪽** — 편집 3건 → pull(PR #1 갱신, `locales/ko.json` 3줄) →
        **PR 머지** → push → **값이 바뀐 행 0건**
    - strict는 닫힌 쪽에서도 전 행을 덮는다(`translationsFilled: 69`). 리포 값이 곧 편집 값이라
      결과가 같은 것이고, **"덮지 않았다"가 아니라 "덮어도 같다"** 이다
  - **발견**: 되돌아간 셀에 `updatedBy`가 남아 편집 UI가 "리포 값 — 편집자 이름"으로 보여준다.
    편집은 사라졌는데 화면은 남아 있다고 말한다. UI 동결이라 고치지 않고 MVP §10에 올렸다
  - 절차: 그때는 서버 env 하나가 대상 프로젝트를 정했으므로 그 값을 임시로 `order-check`로 두고 dev
    서버를 띄웠다(그 변수는 2026-09-07에 사라졌다). 편집은 Prisma 직접 쓰기다(`saveTranslation` 경로는
    B-2가 덮는다). 끝나고 env를 복구했다

### C. Actions + Cron ✅ (2026-09-03)

구 §7 그대로다 — 아래 §7 참조. push는 `order-check`의 CI에서, pull은 Vercel Cron에서 돈다.

**지원 어댑터 5종 중 넷이 실물 PR을 지났다** — `json-catalog`(order-check) · `ts-dict`(bugshot-i18n-test) ·
`yaml-catalog`·`code-dict`(i18n-format-check). 남은 `chrome-locales`는 per-locale·재생성이라
`json-catalog`와 같은 갈래이고, 그 조합은 이미 검증됐다. ⚠️ **"같은 갈래"는 근거이지 검증이 아니다** —
chrome 고유 축(엔트리 필드 순서)은 L2 골든과 코퍼스 관측 2건으로만 덮여 있다.

`/l10n-roundtrip` 스킬은 2026-09-03에 만들고 **2026-09-04에 원본 포맷 보존 기능으로 한 바퀴 돌렸다**
(§9 후속 항목의 태스크 8). 결과는 MVP §9에 있다.

---


## 전역 미결 (단계에 묶이지 않은 것)

- [ ] **tenant-auth 검수 이월 (2026-09-06 code-review ⚪)** — 코드 후속: 하네스 `Role` enum·복합 FK 미흉내(`$transaction` 롤백은 흉내낸다) · `schema-contract.test.ts`가 **Auth.js 4테이블 컬럼의** 타입·nullable을 안 본다 (`Translation.updatedBy`는 2026-09-07에 그 검사가 붙었다) · 키 id 형식 혼재(`randomUUID` vs `cuid()`, §4 🔒 — 어느 미결 목록에도 없다). ✅ 닫힌 것(같은 날): `createInvitation` 동시 발급 잠금 · `auth()` 직접 호출 금지 스캔(`entry-points.test.ts`)
- [x] **`main`/`dev` 브랜치 분리 + Vercel Preview 배포** ✅ (2026-09-04 — MVP §8.4에서 앞당겼다)
  - 앞당긴 이유: SaaS 기능이 UI·인증을 건드리는데 **눈으로 확인할 배포처가 프로덕션밖에 없으면 안 된다.** preview가 생기면서 프로덕션 앞에 PR CI 게이트도 함께 섰다
  - `dev` push = preview 배포(dev DB) / `dev`→`main` squash PR = 프로덕션 배포. 작업 브랜치 층은 두지 않는다
  - 삭제했던 `/merge`·`/sync` 복원 (당시 스킬 13 → 15개, 셋 다 Codex 미러 제외 — 09-06에 `/bugshot-qa`·`/doc-check`이 더해져 17개). `/ship`의 종착점이 프로덕션 → dev로 내려왔다
  - CI 트리거: `push [main, dev]` + `pull_request [main]`. **`/push`의 `db:deploy`가 `/merge` 1단계로 돌아갔다** — dev push는 프로덕션에 아무것도 배포하지 않는다
  - ⚠️ **preview 로그인은 dev 브랜치 고정 URL에서만 된다** — OAuth App callback이 하나뿐이라 preview 전용 앱을 따로 뒀다. 전 preview 로그인이 필요해지면 `redirectProxyUrl`(Auth.js v5)이고, 그 시점은 SaaS UI 착수다
  - **Vercel 실측 (2026-09-04)**: Production Branch `main` 확인 / `DATABASE_URL`을 Production(prod DB)·Preview(dev DB) 두 항목으로 분리 / 나머지 9개는 공유 유지 — cron은 프로덕션 배포에서만 돌고, `PUSH_TOKEN`으로 preview에 push가 들어와도 dev DB를 친다
  - ⚠️ **같은 SHA에는 preview가 따로 생기지 않는다.** dev를 main과 같은 커밋에서 딴 직후 preview 배포가 0건이었다 — Vercel이 이미 배포한 SHA를 다시 배포하지 않기 때문이고, 설정 문제가 아니다. dev에 커밋이 하나 얹히면 뜬다
- [x] **preview 전용 GitHub OAuth 앱** ✅ (2026-09-04) — callback `https://malmoi-git-dev-ox501501-1046s-projects.vercel.app/api/auth/callback/github`, Preview 스코프에 등록. **preview 로그인 실측 통과.** ⚠️ **env를 바꾸면 재배포해야 반영된다** — 등록만 하고 재배포를 빠뜨려 GitHub이 빈 `client_id`에 404를 줬고, 앱·ID·secret을 차례로 의심하다 시간을 썼다
- [x] **dev DB가 비어 있다** ✅ 해소 (2026-09-05, SAAS §8 0단계 — `order-check` 23키·3로케일·번역 69건을 `push:local`로 적재했다. prod에서 복제하지 않았다). 아래는 그때의 관측이다: preview가 로그인 뒤 "프로젝트를 찾을 수 없다"로 멈췄다 — 대상 프로젝트를 정하던 서버 env가 Production과 공유라 값은 맞지만 그 slug의 행이 dev 쪽에 없었다(그 변수는 2026-09-07에 사라졌다). **편집 UI가 동결이라 지금 채우지 않는다** (2026-09-04 판단). 필요해지는 시점은 SaaS UI 착수이고, 그때 경로는 셋이다: prod의 `Project` 행 복제 → `pnpm push:local`로 적재 → preview에서 확인
  - ⚠️ **preview는 Vercel SSO 뒤에 있다** (프로덕션만 Deployment Protection을 껐다). 실측: preview의 `/`·`/keys`·`/api/pull`이 전부 `vercel.com/sso-api`로 가는 302다 — 앱 응답이 아니다. 브라우저는 Vercel 세션으로 통과하므로 사람 확인에는 지장이 없고, **자동 검증을 하려면 `vercel curl`이나 bypass 토큰이 필요하다**

- [x] ✅ **"서버 env 하나가 대상 프로젝트를 정한다"가 사라졌다** (2026-09-07, SaaS 5단계 T3·T4). 원래 관측
  (2026-09-03)은 **두 리포의 CI를 동시에 받을 수 없다**였다 — 다른 프로젝트 페이로드는 `lib/push/guard.ts`가
  409 `project mismatch`로 거부했고 그건 설계대로였지만, **검증 대상을 늘릴 때마다 프로덕션 env를 갈아야
  했다**(`bugshot-i18n-test` 왕복을 로컬 dev 서버로 돌린 이유다).
  - 세 단계로 사라졌다: **편집 경로**는 2026-09-05(tenant-auth — URL slug + `ProjectMember`),
    **`/api/push`·CLI 둘**은 T3(`sha256(Bearer)` → `Project.pushTokenHash` 조회 + CLI 인자 필수),
    **`/api/pull`** 은 T4(`lib/pull/targets.ts`가 고른 전 프로젝트 순회 + 배열 응답).
  - **그 부재를 상시로 센다**: `app/__tests__/entry-points.test.ts`(편집 경로) ·
    `scripts/__tests__/required-args.test.ts`(CLI·라우트·targets) · `app/api/__tests__/route-diagnostics.test.ts`
    (그 값이 없어도 두 라우트가 돈다). ⚠️ **그래서 그 이름은 테스트에 남아 있어야 한다** — 지우면 방어선이
    함께 사라진다.
  - ✅ **Vercel 옛 env 항목 삭제도 2026-09-07에 끝났다** (§0 참조). ⚠️ **"세 스코프"가 아니었다** —
    `ACTIVE_PROJECT_SLUG`·`PUSH_TOKEN` 둘 다 **Production+Preview 두 스코프만** 갖고 있었고 Development엔
    없었다. `vercel env ls`의 목록으로 삭제를 확인했다(성공 메시지가 근거가 아니다)

- [x] 🔒 **dev/prod DB 분리** ✅ **분리했다** (2026-09-04, `9f8afc1`) — Supabase 프로젝트 둘: `malmoi-dev`(ref `bfugwmjubgmmroevrave`, 로컬·Preview) / prod(`malmoi`, ref `xgsyyapzkpbdtkrprlmn`, 프로덕션 배포). `prisma.config.ts`가 `PRISMA_TARGET`으로 갈라 `db:migrate`는 dev를, `db:deploy`는 `DIRECT_URL_PROD`로 prod를 겨눈다
  - **새 실패 모드가 생겼다**: dev에만 적용하고 `db:deploy`를 잊으면 배포 순간 프로덕션이 없는 컬럼을 조회한다. 분리 전에는 `migrate dev`가 이미 프로덕션을 바꿔놔서 잊어도 안 깨졌다 — 그래서 **그 확인은 `/merge` 1단계의 `pnpm db:status:prod`다** (`/push` 3단계의 `db:status`는 dev를 본다 — 게이트가 프로덕션 배포 직전에 서야 프로덕션이 코드보다 앞서는 창이 짧다)
  - 대가로 얻은 것: dev에서 리셋을 승인해도 된다 (번역 데이터가 없다 — 폐기용 리포 적재분뿐이고 `push:local`로 복구된다)
- [x] **Vercel 프로젝트 연결** ✅ (2026-09-03) — 처음엔 `https://i18n-poc.vercel.app`이었고 2026-09-04 개명 뒤 **`https://mal-moi.com`**(apex)이 정본이다. main 푸시가 곧 배포다
  - 연결 과정에서 걸린 것 셋: ① `pnpm build`가 `prisma generate`를 안 해서 첫 배포가 실패(POSTMORTEM 2026-09-03) ② `prisma.config.ts`의 `env("DIRECT_URL")`이 로드 시점에 던져 generate까지 죽음(같은 항목의 🔁 재발) ③ Hobby 기본값인 **Deployment Protection**이 모든 요청을 SSO로 튕겨 자동화가 불가능 — 해제했다(애플리케이션 방어가 이미 전부 서 있다: `middleware.ts` + 두 라우트의 fail-closed Bearer)
  - **`DIRECT_URL`은 Vercel에 넣지 않는다** — 마이그레이션 전용이고 `datasource`가 조건부라 런타임·빌드 모두 불필요하다
  - 프로덕션 실측: `/keys`가 세션 없이 302 + 본문 15바이트 — POSTMORTEM 2026-08-31의 RSC 페이로드 노출(1.3MB)이 프로덕션에서 막혀 있다는 첫 확인
  - `/api/pull`(cron 경로)이 프로덕션에서 `{"status":"skipped","reason":"no-changes"}` — 2층까지 도달했으므로 DB·GitHub App·PEM 개행 복원·blob 비교가 한 번에 검증됐다
- [ ] **키 리스트 가상화의 관측 조건이 충족됐다** (2026-09-07) — CLAUDE.md "실제로 느려지는 네임스페이스가
  관측되면 그때 대응한다"의 그 관측이다: `ts-dict` 903키 프로젝트의 **필터 없는 번역 화면이 12.7초**
  (903행 · `<input>` 2,711개 · 네임스페이스 52개). **지금 가상화를 넣지 않는다** — 그 화면은 동결분이고
  SAAS §8 6단계가 재작성하므로, 인라인 편집 + 가상 스크롤의 스크롤 튐·포커스 유실을 동결된 화면에 얹으면
  버려진다. 더 값싼 답은 **기본 착지를 첫 네임스페이스로 두는 것**이고 판정은 났고(pending>0인 첫 ns) `defaultNamespace`가 6a T2로 프로덕션에 나갔다 — 남은 것은 T7의 화면 배선이다
- [x] **`pnpm build`를 로컬 게이트에** (2026-08-31 해소 — CI가 아니라 `/push` 1단계)
  - 근거: `tsc`가 RSC 경계를 못 본다. CI에 넣으면 **배포 후에** 알게 되고, 로컬 게이트가 프로덕션 앞의 유일한 방어선이다. 콜드 5초 / 웜 2초


---

# 완료 기록 (§1~§9)

**여기부터는 닫힌 단계다.** 지금 무엇을 해야 하는지는 위의 §0과 "전역 미결"이 답한다. 아래를 읽는 경우는
둘뿐이다 — **어떤 결정이 언제 왜 뒤집혔는지** 확인할 때, 그리고 되살릴 작업의 근거를 찾을 때. 불변식·계약의
정본은 여기가 아니라 `MVP.md`·`ARCHITECTURE.md`·`ADAPTER-COVERAGE.md`다.


## 1~2. 스키마 · 접속 · 순수 함수 ✅ (2026-08-31)

**`prisma/schema.prisma` + Supabase 접속 + `lib/githash.ts` + 결정적 export.** 체크리스트를 2026-09-05에
접었다 — 결론이 전부 정본으로 올라갔고 검증은 테스트가 상시로 든다.

- **§1 스키마·접속** — 4테이블(`Locale`·`StringKey`·`KeyRef`·`Translation`), `_init`. `Translation` FK가
  `ON DELETE RESTRICT`(키 삭제를 DB가 거부한다), `UNIQUE(keyId, localeCode)`. 런타임 6543 / 마이그레이션 5432
- **§1.5 `Project` 테넌트 경계** (2026-08-31 범위 추가, `ab4ac2c`) — MVP §7 "다중 프로젝트"의 **스키마만**
  해제했다. `projectId` FK + 복합 PK·복합 unique, 인덱스를 `projectId` 선두로 교체, 리포 설정을 env →
  `Project` 컬럼으로 이전. **테넌트 간 참조를 DB가 거부하는 것을 실 DB로 확인**했다. 여전히 비범위:
  테넌트별 인증·인가, 과금, 온보딩, 프로젝트 전환 UI
- **§2a `blobSha`** (`4f11488` → `dfd13bf`) — `sha1("blob <byteLength>\0" + content)`. 골든 5건에 더해
  **골든 자체를 `git hash-object --stdin` 실측과 재대조하는 자기검증 앵커**를 뒀다 — 박제된 상수가 낡는 것을
  잡는 유일한 장치다. 길이는 `Buffer.byteLength`(한글·이모지)
- **§2b 결정적 export** (`cf3ea2e` → `fbccddc`) — `lib/export.ts`로 시작했다가 3a의 어댑터 writer로 흡수돼
  삭제됐고, 규칙은 `lib/adapters/shared.ts`가 이어받았다. 정렬이 **`<` 비교(UTF-16 코드 유닛)** 인 이유는
  `localeCompare`가 Node ICU 빌드에 의존해 환경마다 다른 파일을 내기 때문이다 — 같은 입력에서 두 정렬의
  결과가 완전히 달랐다. 🔒 **빈 로케일은 파일을 내지 않는다**(2026-08-31 해소), 미번역 키는 non-base에서
  제외(크롬이 폴백한다), `orphaned` 제외
  - ⚠️ 이 규칙들의 현재 정본은 **ARCHITECTURE §1.1**이고, 들여쓰기는 그 뒤 "원본 파일의 폭"으로 바뀌었다
    (2026-09-04, §8 원본 포맷 보존). 위 서술은 당시 기록이다

---

## 3. 로케일 적재 + 사용처 스캔 ✅

> **2026-08-31 범위 전환.** "코드 스캔이 유일한 진실"에서 **"리포의 로케일 파일이 키의 진실, 코드 스캔은 `refs` 전담"** 으로 뒤집혔다 (MVP §3.1·§4·§5.1). 사용자 스토리의 시작이 "리포를 연동하면 키가 적재된다"이고, 코드 스캔을 진실로 두면 대상 리포의 전면 리팩터링이 선행 조건이 되기 때문이다.

### 3a. 양방향 어댑터 (`lib/adapters/`) ✅

- [x] 통합 인터페이스 — `detect` / `read` / `write`
  - 검증: 98 tests green
- [x] `chrome-locales` — `_locales/{locale}/messages.json`, 리프 `{message, description?}`
  - 검증: bugshot-2 적재 (4키 × ko/en/fr, description 3건)
- [x] `json-catalog` — `{dir}/{locale}.json`, flat·중첩 모두
  - 검증: bugshot-web (104키 × 2, 중첩·배열), skillflo (**1446키 × 6로케일, 36 네임스페이스**)
- [x] 중첩 평탄화(`.`) + write에서 복원, 배열은 인덱스 키(`hero.subcopy.0`)
  - 검증: `0..n` 빈틈없으면 배열로 복원, 빈틈 있으면 객체 유지(구멍이 `null`로 나가는 것을 막는다)
- [x] 결정성 규칙을 `shared.ts`로 모아 **모든 재생성 writer가 지나게** 한다
  - 검증: 정렬(`<` 비교)·재조립·2칸·끝 개행 1개·orphaned 제외·미번역 제외·0개면 `null`
  - ⚠️ **`ts-dict`는 이 관문을 지나지 않는다** — 수술적 치환이라 원본 순서·공백·주석을 보존하고 orphaned 키도 파일에 남긴다 (ARCHITECTURE §1.4). "모든 writer"라는 전칭 서술을 보면 낡은 것이다
- [x] `ts-dict` — 수술적 치환 writer (`src/i18n/namespaces/*.ts`, `multi-locale`)
  - 검증: 값만 바뀌고 빈 줄·주석이 보존됨. `JSON.stringify`로 이스케이프(`setLiteralValue`는 백슬래시·개행을 깨뜨린다), export된 묶음 객체를 로케일로 오인하지 않음
  - 근거: bugshot-2의 실제 UI 번역이 903키다 — `_locales` 4키만 다루면 §9 검증 대상을 0.4%로만 덮는다
- [x] **왕복 검증** — 읽고 쓰면 의미가 같다
  - 검증: 3개 리포 **11개 로케일 파일 전부 의미 동일**. 바이트 차이는 원본이 정렬돼 있지 않아서이고 첫 pull에서 한 번 정규화된다(재생성 어댑터에 한함 — `ts-dict`는 바이트도 보존된다)
- [x] 포맷 탐지 — 경로 신호 + 로케일 개수 + `probe` 내용 확인
  - 검증: `public/search/{locale}.json`(검색 인덱스)을 잡던 결함 회귀 테스트 4건
- [x] `pnpm ingest <dir>` CLI — 탐지·적재·왕복 판정
- [x] ✅ **base 로케일 판정** (2026-09-07, SaaS 5단계 — 🔒 해소) — 온보딩이 후보와 키 수를 보이고 **사용자가 확정한다**(`lib/onboarding/confirm.ts`가 `base-locale-missing`으로 거부, 확정값이 `Project.baseLocale`에 들어가고 생성된 워크플로가 `base-locale:`을 싣는다). `pickBaseLocale`은 **추천 기본값으로만** 남았다 — 정본이 아니다

### 3b. 사용처 스캔 (`lib/scan/`) ✅ — `refs` 전담, 경고만

> **2026-09-03 해소 (A-1).** 2026-08-31 실전에서 "훅 기반 i18n을 못 잡는다"로 열렸던 항목이다 — import 기반 매칭이라 `import { t }` 패턴만 봤고, 실측 3개 중 2개의 `refs`가 0건이었다. `refs`가 컨텍스트 기능의 전부라(MVP §3.2) 3개 중 2개가 0건이면 기능이 없는 것과 같았다.
>
> | 리포 | 호출 형태 | 전 | 후 |
> |---|---|---|---|
> | bugshot-2 | `import { t } from "@/i18n"` | 115키 / 273건 | **변화 없음** |
> | skillflo | `const { t } = useI18n()` | **0** | 1144키 / 1643건 |
> | bugshot-web | `const t = await getTranslations({ namespace: "meta" })` | **0** | 30키 / 46건 |
>
> 셋 다 오탐 0이다(스캔 키를 로케일 파일 키와 대조). 남은 미검출은 전부 동적 조립·배열 인덱스라 원리적으로 못 잡으며, 그 자리는 경고가 신고하고 답은 대상 리포의 `// @l10n-keys`다. 근거는 ARCHITECTURE §4.0.2.

- [x] 🔴 **훅 기반 호출 지원** ✅ — `WrapperId.kind: "direct" | "hook"`. 훅 import를 찾아 그 반환의 지역 바인딩(구조분해 `{ t }`·별칭 `{ t: tr }`·직접대입)을 **스코프째** 추적한다
  - 검증: 한 파일의 컴포넌트 여럿이 같은 이름 `t`를 서로 다른 namespace로 갖는 경우, props로 받은 남의 `t`를 잡지 않는 경우까지 테스트로 고정
- [x] 🔒 **namespace 상대 키** ✅ **지원한다 (리터럴만)** — `useTranslations("hero")`·`getTranslations({ locale, namespace: "meta" })` 둘 다 읽고 `await`를 벗긴다. `t("title")` → `hero.title`
  - **비리터럴은 경고를 내고 그 바인딩을 버린다** — 접두사를 모르는 채 잡으면 존재하지 않는 키가 `refs`에 실린다. 0건이 낫다
  - `// @l10n-keys`의 키는 **절대 키다** — 접두사를 붙이지 않는다. 붙이면 같은 지시자가 파일 위치에 따라 다른 키가 된다
- [x] **래퍼 여럿** ✅ — `scanSources`가 목록을 받는다. bugshot-web이 한 리포에서 `next-intl#useTranslations()`와 `next-intl/server#getTranslations()`를 함께 쓴다
- [x] **스펙 파싱을 `lib/scan/wrapper.ts`로 통합** ✅ — CLI 둘이 각자 파싱하던 것. 형식에 `()`가 붙으면서 한쪽만 훅을 못 읽는 상태가 조용히 생긴다
  - 함께 고친 것: `--wrapper` **값**이 대상 디렉터리로 오인되던 인자 파싱 (`pnpm scan --wrapper @/i18n#t ./dir`)

- [x] AST 경로 (ts-morph) — 주석·문자열 안의 호출을 구분
  - 검증: 라인/블록 주석·문자열 리터럴 3케이스. 자기 리포 스캔이 0키(테스트 파일이 문자열로 `t(...)`를 담고 있다)
- [x] **래퍼를 모듈 경로 + export 이름으로 식별**
  - 검증: bugshot-2에서 이름만 매칭했을 때 오탐 1391건 → import 기반으로 0건. 별칭(`t as translate`)도 따라간다
- [x] `--wrapper <module>#<export>`로 설정 가능
  - 근거: bugshot-2의 래퍼가 하필 기본값 `@/i18n#t`와 같다. 대상 리포 관례를 알 수 없다
- [x] `__MSG_key__` 정규식 경로가 **파일 종류와 무관하게** 돈다
  - 검증: `manifest.config.ts`(`.ts`인데 토큰 5개)가 누락되던 결함 회귀 테스트
- [x] `refs`의 `path`·`line` 정확, 정렬 출력
- [x] `// @l10n-keys` 화이트리스트, `namespace` 파생, 키 문자셋 검증
- [x] **에러 → 경고로 격하** — `ScanResult`에 `errors` 필드가 아예 없고 `pnpm scan`은 항상 exit 0
  - 검증: bugshot-2에서 **0키/에러 1391건 → 115키/참조 273건/경고 9건/exit 0**. 경고 9건은 그 리포의 실제 동적 키
- [x] 출력을 `refs`로 좁힘 — `sourceText`·`namespace`·`description`을 돌려주지 않는다
  - 근거: 원문·키 존재·키 이름 합법성이 전부 어댑터 소관이 됐다. 스캔이 원문을 들면 진실이 둘이 된다
- [x] `chrome.i18n.getMessage("k")` 직접 호출 지원 (래퍼 없는 리포)
  - 검증: `EXT_NAME_SHORT`이 manifest 2곳 + `src/background/index.ts:47` 3곳에서 잡힘
- [x] `namespace` 파생을 어댑터 층으로 이동 (`namespaceOf` — 점·밑줄 둘 다)
- [x] 같은 `path:line` 중복 접기 (AST·정규식 양쪽에 걸릴 수 있다)
- 커밋: `3931164` `9ad8dbe` `7588ba6` `3c04660`

---

## 4. `/api/push` ✅

- [x] Bearer `PUSH_TOKEN` 검증, **fail-closed**
  - 검증: 헤더 없음·틀린 토큰·환경변수 미설정(빈 문자열 포함) 전부 거부. 미설정은 500(서버 설정 문제), 나머지는 401. 어느 쪽이 틀렸는지 응답에 노출하지 않는다
- [x] Zod로 페이로드 검증
  - 검증: 40자 hex 아닌 `commitSha`, `locales`에 없는 `baseLocale`, 미등록 어댑터, 미선언 로케일의 번역, 양의 정수 아닌 `line` 전부 400. **키 0개도 거부** — 스캔이 조용히 실패하면 전 프로젝트가 orphan된다
  - `pathTemplate`에 `{locale}`을 **요구하지 않는다** — `multi-locale` 어댑터(`ts-dict`)는 글롭이다 (ARCHITECTURE §1.1)
- [x] upsert — 키·원문·`sourceHash`·description·namespace
  - 검증: 실 DB 1446키 → insert 1446 / 재전송 시 insert 0, update 1446
- [x] 스캔에 없는 키 → `orphaned = true`, 돌아오면 `false`
  - 검증: 절반 제거 시 orphan 723 / **총키 1446 유지(삭제 안 됨)** / 번역 2892 살아있음 → 되돌리면 unorphan 723, 남은 orphaned 0
- [x] `sourceHash` 변경 → base 아닌 번역에 `needsReview = true`
  - 검증: 10키 원문 변경 → ko 10건, **en(base) 0건**. 판정은 `sourceHash`로만 — description·namespace 변경은 전파하지 않는다(필터가 노이즈가 된다)
- [x] `KeyRef` 전체 교체
  - 검증: refs 5건만 보냈을 때 DB 5건 (이전 1446건이 남지 않는다)
- [x] **번역값 strict 덮어쓰기** — 리포 값으로 DB를 갱신한다 (`ON CONFLICT DO UPDATE`, MVP §3.1)
  - 검증: 편집한 값이 변경 없는 리포 값으로 덮이고, 바뀐 리포 값이 전파되는 것을 실 DB로 확인 (커밋 `e7055c7`)
  - ⚠️ **2026-08-31 두 번 뒤집힌 자리다**: "값을 어떤 경로로도 안 건드림" → `DO NOTHING`(콜드 스타트) → strict. 앞의 둘을 서술한 문서를 보면 낡은 것이다
  - 대가: 편집 손실 창 (MVP §3.1). 방어는 pull 주기뿐이고 **6단계 전까지는 방어가 0이다**
- [x] `commitSha` + 어댑터 설정을 `Project`에 저장
  - 검증: `adapterName`·`pathTemplate`·`nested`·`baseLocale`·`lastCommitSha` 저장 확인. 마이그레이션 `20260831050156_add_project_locale_format` (additive)
- [x] 실제 영향 행수를 보고한다 (후보 수가 아니다)
  - 근거: 재전송에서 "번역 2892건 채움"으로 거짓 보고하던 것을 트랜잭션 결과에서 읽어 0으로 고침
- 성능: 1446키 + 2892번역 + 1446refs → **약 1.6초** (라우트 한도 60초)
- 구현 제약: transaction 모드 pooler라 대화형 트랜잭션 불가 → 배열형 `$transaction([...])` + `unnest()` 벌크
- [ ] 🔒 **키 id 형식** — raw SQL이라 `randomUUID()`로 만든다. 스키마의 `@default(cuid())`는 Prisma 클라이언트가 적용하는 값이라 raw에는 안 온다. 혼재해도 무해하지만 통일할지 결정 필요
- 커밋: `dbcfd10` (schema) → `1522544`(spec) → `b9c2e53` (test+feat) → `e7055c7` (strict 전환)

### 4b. 오배송·역행 거부 ✅ (2026-08-31 결정 — 🔒 해소, **7단계 전 필수**)

> 둘 다 **거부이지 병합이 아니다** — 어긋난 요청을 반영하려 들면 diff 동기화가 되어 §2를 깬다. 실 DB에 프로젝트가 이미 둘이라 두 번째 리포를 붙이는 순간이 첫 사고 지점이다.

- [x] 페이로드에 `projectSlug` — 서버의 `ACTIVE_PROJECT_SLUG`와 다르면 **409**
  - 근거: 대상 지정을 서버 env에만 맡기면 오배송된 페이로드가 남의 프로젝트 키를 전부 orphan시키고 이물 키를 삽입하는데, `toDelete`가 없고 FK가 `RESTRICT`라 **지울 수 없다**
  - 프로젝트별 `PUSH_TOKEN`은 쓰지 않는다 — 토큰↔프로젝트 매핑을 어딘가 둬야 하고 시크릿이 프로젝트 수만큼 는다
  - 검증: `checkProjectSlug` 8케이스(`lib/push/__tests__/guard.test.ts`) + **dev 서버 실측** — 불일치 `409 {"error":"project mismatch","expected":"bugshot-2","got":"not-this-project"}`. **미인증 요청은 401이고 프로젝트 정보가 새지 않는다**(가드가 인증 뒤에 있다)
  - 남은 것: Actions가 slug를 보내는지는 7단계에서 확인
- [x] 페이로드에 `commitAt` — `Project.lastCommitAt`보다 과거면 **409**
  - 근거: strict라 오래된 run의 Re-run이 DB를 그 시점으로 되돌린다(키 orphan + 번역값 회귀 + permalink가 옛 SHA)
  - **같은 커밋 재전송은 통과시킨다** — strict라 결과가 같고 스캐너를 고쳐 다시 올리는 건 정당하다. 그래서 기준이 `commitSha` 동일성이 아니라 시각 역행이다
  - GitHub API 조상 확인은 쓰지 않는다 — 지금 GitHub을 안 부르는 라우트에 App 토큰·왕복이 들어온다. Actions가 `git show -s --format=%cI`로 공짜로 얻는다
  - 검증: `checkCommitOrder` 7케이스(과거·1ms 과거·같은 시각·미래·null·타임존·Invalid Date) + 형식 위반이 **400**임을 실측(409와 구분된다 — 형식 오류는 상태 충돌이 아니다)
  - ⚠️ **역행 409의 라우트 실측은 못 했다.** `lastCommitAt`을 세우려면 200 경로를 한 번 돌려야 하고 strict라 그것이 실 DB의 편집을 리포 값으로 덮는다. 오배송 경로로 배선(같은 `guardStatus`)이 도는 것은 확인했고, **끝단 확인은 7단계 왕복 검증에서 한다**
- [x] 마이그레이션 — `Project.lastCommitAt` (additive, nullable)
  - 검증: `20260831080435_add_project_last_commit_at`, SQL은 `ADD COLUMN` 한 줄. `db:deploy` 적용 후 `db:status` up to date
- 커밋: `dc08503`(test) → `c5488db`(feat) → `ea5a565`(refactor) → `74b4d7d`(db)

---

## 5. Auth + 편집 UI ✅ (5a·5b·5c 완료 / **5d는 SaaS로 이관** — MVP §8.3)

### 5a. Auth ✅

- [x] **인가 모델 결정 — 허용 핸들 목록** (🔒 해소, 2026-08-31)
  - 근거: 대상이 개인 계정 리포(`SinhyeokKang/malmoi`)라 org 멤버십이 존재하지 않는다. 핸들 목록은 개인·org 양쪽에서 동작하고 org API 호출이 사라진다. 실제 org를 쓰면 OR로 더한다
- [x] Auth.js v5 GitHub provider, JWT 세션 `maxAge` 24h
  - 검증: `pnpm build`에 `/api/auth/[...nextauth]`·`/keys` 라우트 등록
- [x] `isLoginAllowed` — **`AUTH_ALLOWED_LOGINS`가 비면 전원 거부**
  - 검증: 13케이스. 미설정·빈 문자열·공백만 전부 거부. 대소문자 무시, 부분 일치 거부, **빈 항목을 이중으로 차단**(`"a, ,b"`가 빈 login을 통과시키는 구멍)
- [x] 인가를 `signIn` 콜백에 둔다
  - 근거: 레이아웃에만 두면 새 라우트가 상속을 잊을 수 있다. 세션 존재 자체가 "허용 목록 통과"를 뜻하게 만든다
- [x] 핸들을 토큰에 실어 `session.user.login`으로 노출 (`types/next-auth.d.ts`)
  - 근거: `Translation.updatedBy`가 쓰고, 사용자 테이블이 없어 문자열로 박는다
- [x] 보호된 셸 — 로그인 화면 / 헤더 + 로그아웃
  - 검증: DESIGN.md 체크리스트 8항 전부 통과 (`dark:` 0, `bg-destructive` 0, 임의값 0, 새 raw 색 0, 포커스 링 유지)
- [x] **차단은 `middleware.ts`가 한다** (레이아웃은 2차 방어로 `redirect()`)
  - ⚠️ 처음엔 반대로 갔다: "미들웨어는 Edge라 `lib/db.ts`를 못 문다"는 **틀린 근거**로 레이아웃 조건부 렌더에 의존했고, 세션 없는 `/keys` 응답 1.3MB에 1446키가 실렸다. 미들웨어는 DB를 물 필요가 없다(JWT 토큰만 본다) — `docs/POSTMORTEM.md` 2026-08-31
  - 검증: 응답 **본문**을 본다 — `curl -s <라우트> | grep <민감 데이터>`가 0건. 화면으로는 절대 안 보인다
  - **새 보호 라우트를 추가하면 `matcher`에 추가한다**

### 5b. UI — 편집 가능 테이블 ✅

> **2026-08-31 형태 변경**: 로케일별 화면 → **테이블** `| key | en(base) | ko | fr |`, 모든 셀 편집 가능. 원문과 번역을 나란히 봐야 하고 로케일마다 화면을 갈아타면 문맥이 끊긴다 (MVP §3.2).
> **base도 편집 가능하다** — 고정된 것은 키뿐이다. 화면의 base 값은 `sourceText`가 아니라 `Translation`이고, `sourceText`는 stale 판정 전용으로 좁혀졌다.

- [x] 로케일을 열로 펼침, base가 맨 앞
  - 검증: bugshot-2 `key | en(base) | fr | ko`, **907행 × 54 네임스페이스**
- [x] 전 로케일을 쿼리 1회로 (로케일별 6번 쿼리보다 낫다)
- [x] 사이드바 집계에 **기준 로케일** 도입
  - 근거: 로케일이 열이면 "남은 일"이 로케일마다 다르다. base는 대개 채워져 있어 기본값은 base가 아닌 첫 로케일
- [x] 헤더 글자를 `text-foreground/60`으로 (§2.2 — muted 표면 위 `text-muted-foreground`는 4.34:1 미달)
- [x] 넓은 표는 자기 컨테이너에서만 스크롤 (`overflow-x-auto`)

### 5c. 인라인 편집·저장 ✅

- [x] blur 시 Server Action 저장, `updatedBy`에 GitHub 핸들
  - 검증: **브라우저 UI로 `attachment.download`의 en·ko·fr 3셀을 편집해 확인** — 값·`updatedBy`(GitHub 핸들)·`needsReview=false` 전부 반영. **유일한 사용자 mutation** (MVP §3.2)
  - base(en) 편집도 확인 — `sourceText`는 `"Download"`로 남고 `Translation`만 바뀐다 (§3.2 설계대로)
- [x] **⚠️ Server Action이 스스로 인증·인가·테넌트 격리를 한다** (4중 검증)
  - 근거: Action 호출은 페이지를 막는 레이아웃을 **지나지 않는다** — 공개 엔드포인트다
  - 검증: 세션 / zod 입력 / keyId의 프로젝트 소속 / localeCode의 프로젝트 소속
  - 5번째였던 **base 로케일 편집 차단은 설계 변경으로 제거됐다** — base도 편집 대상이다 (MVP §3.2)
  - keyId 소속 확인이 빠지면 **남의 테넌트 키를 수정할 수 있다**. RLS가 없고 인가가 단일 테넌트라 이게 유일한 방어선이다
- [x] **값 지우기는 행 삭제가 아니라 `value=""`**
  - 근거: 행을 지우면 export의 `sourceText` 폴백·미번역 판정이 갈린다. 빈 문자열은 "번역 없음"을 표현하면서 키를 남긴다
- **"지우기"는 미번역으로 되돌리는 조작이고 수명은 다음 push까지다** (2026-08-31 결정 — 🔒 해소, MVP §3.2)
  - export가 미번역을 파일에서 빼므로(§4.1) 빈 값은 리포에 도달하지 못하고, 리포의 옛 값이 다음 push의 `DO UPDATE`로 되살아난다. **코드 변경 없이 화면이 그 사실을 보이게 한다** (5d)
  - 빈 값을 리포까지 내보내는 안은 버렸다 — §4.1의 "미번역 제외"를 뒤집어야 하고, 크롬·TS 딕셔너리 양쪽에서 폴백을 잃어 빈 문자열이 그대로 렌더된다. 입력 거부도 버렸다 — 오역을 지워 비워두려는 정당한 의도까지 막는다
  - ⚠️ 이 항목의 옛 검증("실 DB에서 지운 뒤 push를 돌려 `value=""` 유지 확인")은 **`DO NOTHING` 시절 것이고 지금은 성립하지 않는다**
- [x] 저장 시 `needsReview` 해제 — 편집한 사람이 방금 검토했다
- [x] 같은 값이면 noop — 불필요한 쓰기·`updatedAt` 갱신을 막는다. 클라이언트에서도 왕복 자체를 아낀다
- [x] 공백만 입력은 빈 문자열로 정규화, **값 안의 앞뒤 공백은 보존**
  - 근거: 번역에 의미 있는 공백이 있을 수 있다
- [x] 낙관적 갱신을 쓰지 않는다 — 실패 롤백 복잡도를 MVP §5가 뺐다. 저장 중·실패 상태만 보여준다
- [x] **첫 클라이언트 컴포넌트** — `pnpm build` 게이트가 여기서 처음 일한다
- **`Translation.value`의 쓰기 주체는 둘이다** — 이 Server Action과 push(strict). 셋째가 생기면 어느 쪽이 이기는지 다시 판정해야 하므로 늘리지 않는다
- 커밋: `1184732`(test) → `233a88f`(feat) → `e7055c7`(strict·base 편집)

### 5d. 필터 — **SaaS로 이관** (2026-09-03 범위 재정의)

**편집 UI를 동작 확인용으로 동결했다** (MVP §8.3). 아래 셋은 만들지 않는다 — SaaS 단계에서
UI를 새로 시작하므로 지금 다듬으면 버려지는 작업이다.

- [x] `server-only`가 클라이언트 유입을 막는지
  - 검증: `pnpm build` 통과 ✅ (`translation-input.tsx`·`pull-button.tsx` 둘 다 있는 상태에서)
- [x] pull 트리거 버튼 (Server Action) — **6단계 3번으로 이관해 구현했다** (`a5bff4d`)
- [→] 필터 3개 (미번역 / 검토필요 / orphaned) → SaaS
- [→] 손실 창 경고 배너 (MVP §3.1) → SaaS
- [→] "다음 push까지" 셀 표시 (§5c 결정 — MVP §3.2) → SaaS
  - ⚠️ 셋 다 **판정 로직은 이미 있다**(`translationState`). 남은 것은 화면뿐이라 이관 비용이 없다

⚠️ **UI를 걷어내지는 않는다.** `saveTranslation`이 편집이 실제로 DB에 닿는 유일한 증거이고,
B단계의 "편집 흐름" 체크가 그 경로를 지난다.

—— 커밋: auth / UI 골격 / 편집·저장 / 필터로 쪼갠다

---

## 6. GitHub App + `/api/pull` ✅ (2026-09-01 — 머지 이후 절반은 §7이 2026-09-03에 닫았다)

> 이 체크리스트는 원래 재생성 어댑터만 전제하고 쓰였는데, **§9 왕복 검증 대상인 bugshot-2의 실제 번역 표면이 `ts-dict`(903키)** 라 그 경로를 빼면 검증이 성립하지 않는다. 착수 전 필요했던 결정 둘은 2026-08-31에 났다(아래 두 항목).

- [x] **판정을 두 층으로 — 1층은 DB 측 스킵** (🔒 해소, MVP §3.3) — `lib/pull/run.ts` (`f77bb38`)
  - 그 프로젝트의 `Translation.updatedAt` 최대값이 `Project.lastPulledAt` 이후로 안 움직였으면 **GitHub을 한 번도 부르지 않고 종료**한다. 편집 없는 날이 대부분이라 이게 기본 경로다
  - 근거: `ts-dict`는 write가 원본을 요구해 blob SHA 비교만으로는 호출을 못 아낀다. 이 층은 어댑터 방식과 무관하게 성립하고 재생성 어댑터도 트리 조회를 아낀다
  - 대가: 리포 파일을 직접 고치고 push를 안 돌린 경우를 놓친다(정상 흐름에선 strict push가 DB에 반영해 `updatedAt`이 움직인다)
  - 검증: 편집 없이 두 번 돌려 두 번째가 API 0회. 마이그레이션 `Project.lastPulledAt` (additive)
  - 검증: fake 클라이언트로 **1층 스킵 시 호출 0회**를 확인 ✅ (`lib/pull/__tests__/run.test.ts`). 마이그레이션 `Project.lastPulledAt` 적용 완료 (`36b5245`, `db:deploy`)
- [x] **빈 값은 `ts-dict` write에 넘기지 않는다** (🔒 해소 — §5c와 같은 결정) — `buildWriteEntries`가 유일한 관문 (`a62b675`)
  - 근거: `write`가 `usableEntries`를 지나지 않으므로 빈 값이 오면 소스에 `""`가 박히는데 TS 딕셔너리엔 폴백이 없다. "미번역 제외"만은 호출부가 두 방식에 똑같이 적용해 원본 값이 남게 한다
  - 검증: `value=""`인 키가 있는 상태로 write를 불러 원본 리터럴이 보존됨
  - 검증: `value=""`인 키로 오케스트레이션을 돌려 **원본 리터럴이 보존됨**을 확인 ✅ (`run.test.ts`의 multi-locale 케이스)
- [x] GitHub App installation 토큰 (`octokit`의 `App`) — `lib/github.ts` (`05e4be6`)
  - 검증: 토큰으로 리포 읽기 성공 ✅ `pnpm smoke:github bugshot-2`. App 클라이언트는 **함수 안에서 지연 생성**한다 (POSTMORTEM 2026-08-31, 재발 1회)
- [x] PEM 개행 복원 (`parsePrivateKey`) — `lib/github.ts`가 호출 (`05e4be6`)
  - 검증: `\n`으로 접은 `.env.local` 값으로 JWT 서명 성공 ✅ (스모크가 통과하면 서명이 된 것이다)
- [x] base head SHA + 트리 조회 — `getRefSha`·`getTree` (`05e4be6`)
  - 검증: 로케일 파일의 blob SHA 획득 ✅ 스모크가 `dev` head `baf494ee`(DB `lastCommitSha`와 일치), 트리 1331 blob, **글롭이 `ts-dict` 8파일을 실물에서 매칭**하는 것까지 확인
  - ⚠️ **트리가 잘렸으면(`truncated`) 던진다** — 일부만 보면 base에 있는 파일을 "없다"고 판정해 신규로 올리고 SHA 비교 전체가 틀어진다
- [x] **`multi-locale`은 파일 × 로케일 이중 루프다** (2026-09-01 정정 — 문서가 로케일 축을 빠뜨렸다) — `lib/pull/render.ts` (`f77bb38`)
  - 검증: 두 파일이 각각 자기 원본을 받아 치환되고, 한 파일 안의 로케일 3개가 모두 바뀐다 ✅. 파일 축만 돌면 나머지 로케일이 조용히 원본으로 남는다
- [x] **blob SHA 비교 → 변경 없으면 커밋·PR 경로로 가지 않음** — `planPullChanges` + `run.ts` (`f77bb38`)
  - 검증: 호출 카운트를 세는 테스트 (이게 야간 cron의 기본 경로다)
  - 검증: 2층 전부-동일이면 호출이 `getRefSha`·`getTree` 둘로 끝난다 ✅. **그때도 `lastPulledAt`을 갱신한다** — 안 하면 값 불변 push 뒤 매일 밤 트리를 다시 읽는다
  - ⚠️ **이 층만으로 "API 0회"가 되는 것은 재생성 어댑터뿐이다** — `ts-dict`는 위 DB 측 스킵(1층)이 그 역할을 한다
- [x] `createTree`에 **`base_tree` 전달** — `buildTreePayload` (`251238a`)
  - 검증: 페이로드 조립 함수의 순수 테스트 ✅ 타입 필수 + 빈 문자열 throw (`lib/pull/__tests__/payload.test.ts`)
- [x] `parents: [baseHead]` — `buildCommitPayload` (`251238a`)
  - 검증: 페이로드 테스트 ✅ 반환 타입이 `[string]` 튜플이라 둘째 parent가 컴파일 단계에서 막힌다
- [x] 커밋 메시지에 `[skip-l10n]` — `SKIP_MARKER` 상수 (`251238a`)
  - 검증: 메시지 생성 함수 테스트 ✅ 빈 요약이어도 마커가 남는다
- [x] **ref 인코딩은 `octokit`이 담당한다 — 직접 하지 않는다** (2026-09-01 정정)
  - `encodeRefPath`를 만들어 호출부에서 썼다가 `%252F` 조용한 404를 스스로 만들었다. 실측으로 확인하고 함수를 제거했다 (`9c0cd03`, `docs/POSTMORTEM.md` 2026-09-01)
  - 검증: `pnpm smoke:github`가 `heads/dev`를 읽어 실제 SHA를 받는다 ✅
- [x] **GitHub 클라이언트를 인자로 주입받는다** — `lib/pull/client.ts`의 `GitClient` + `__tests__/fake-client.ts` (`05e4be6`)
  - 검증: fake가 호출을 기록해 `calls.length === 0`으로 "API 0회"를 판정할 수 있다 ✅ (17케이스). **이게 없으면 아래 호출 카운트 항목이 검증 불가다**
- [x] **브랜치 없을 때 `POST /git/refs`, 있을 때 `PATCH` + `force`** — `run.ts` (`f77bb38`)
  - 검증: 두 분기를 fake로 각각 태운다 ✅ (실물 첫 실행은 4단계)
- [x] 열린 PR 재사용, 없으면 생성 — `run.ts` (`f77bb38`)
  - 검증: `openPrUrl`이 있으면 `createPr`을 부르지 않는다 ✅. **조회 `head`는 `owner:branch` 형식**(브랜치명만 넘기면 필터가 조용히 무시된다). 실물 2회차는 4단계
- [x] `CRON_SECRET` 검증, fail-closed — `app/api/pull/route.ts` (`a5bff4d`)
  - 검증: 시크릿 없이·틀린 시크릿 모두 401이고 응답이 구별되지 않는다 ✅ (dev 실측). `checkBearer` 재사용 — 미설정 500은 기존 테스트가 덮는다

### 실물 검증 (2026-09-01, 7회차 루프)

일회용 private 리포(`bugshot-i18n-test`)를 대상으로 `Project.repoName`만 바꿔 돌리고 되돌렸다.
상세는 `docs/features/pull-to-pr/tasks.md` §4.

- [x] diff 품질 — 기본 `+3/-3`, **최대 부하(907키 × 3로케일) 8파일 `+2745/-2745`**.
  `+N/-N` 대칭이 수술적 치환의 증거다(줄 추가·삭제 0)
- [x] **그 상태에서 대상 리포 `pnpm typecheck` 통과** — 단위 테스트가 원리적으로 못 보는 층이다
- [x] 이스케이프(`a"b\c\nd\te`), 400자 값 한 줄 유지, 이모지·中文 보존
- [x] 주석 3개·빈 줄 10개·파일 끝 개행 1개 보존
- [x] orphaned 키 값 불변 / 빈 값이 writer에 도달하지 않음
- [x] 결정성 — **tree SHA 동일성으로 판정한다**(2층 no-op이 아니다. base와 비교하므로 머지 전엔 매번 변경을 낸다)
- [→] **PR 머지 → push → DB 일치** — 2026-09-03 범위 재정의로 **§0의 B-3으로 이관**했다.
  전에는 "사용자 결정으로 범위 밖"이었고, 그래서 **손실 창이 닫힌다는 것이 한 번도 실증되지
  않았다.** 새 B단계가 그걸 담는 자리다
- [x] 재생성 어댑터 실물 pull — `json-catalog`은 2026-09-03 해소(`i18n-order-check#1`, MVP §9), 2026-09-04에 표현 5축까지(#3). **`chrome-locales`만 실물 PR 이력 0**이고, bugshot-2에서 같은 프로젝트로 두 표면을 다루는 것은 MVP §7 비범위라 그 리포로는 안 한다
  - ⚠️ **별도 프로젝트(사본 리포)로 재생성 어댑터를 검증하는 것은 이 판정에 걸리지 않는다.** §9의 키 순서 보존이 그 확인을 자기 태스크로 들고 있고, 거기서 필요한 것은 새 `Project` 행 하나다

—— 커밋: github 래퍼 / pull 엔드포인트로 쪼갠다

---

## 7. Actions 워크플로 + Vercel Cron ✅ (= §0의 **C단계**) — 자동화 경로가 선다. 남은 것은 bugshot-2 연동뿐이다

- [x] **§4b(오배송·역행 거부)가 먼저 서 있어야 한다** ✅ — `lib/push/guard.ts`가 두 판정을 들고 라우트가 409를 낸다. Actions가 `projectSlug`와 `commitAt`을 보낸다 (`push-local.ts`가 `git show -s --format=%cI`로 얻는다)
- [x] **대상 리포 base 브랜치 — `dev`** (2026-09-01 결정 — 🔒 해소, MVP §3.1). bugshot-2의 실제 작업 브랜치이고 `main`은 보호 브랜치다. 첫 실측(적재 커밋이 `dev`에만 존재)은 머지로 낡았고, 재실측 결과 양쪽 head가 같아 구조적 이유로 판정했다. DB의 `Project.baseBranch`는 그때 갱신했다(6단계 0번 태스크 — 지금은 §6에 없다, 끝난 항목)
- [x] 🔒 **로케일 시드 방식** ✅ **자동 생성으로 결정** (2026-09-03 — MVP §3.1로 올렸다)
  - 정본은 어댑터가 탐지한 로케일 파일 목록이고 `applyPush`가 `Locale`을 upsert한다. 수동 등록은 손이 늘면서 파일과 DB가 갈라지는 경로만 만든다
  - 검증: `order-check`에서 `en`·`ja`·`ko`가 CI push 한 번으로 등록됐다
- [x] 대상 리포에 Actions 워크플로 (스캔 → `/api/push`) ✅ (2026-09-03)
  - **실제 일은 말모이의 composite action이 한다** (`.github/actions/l10n-push`). 대상 리포는 그것을 부르는 20줄만 갖는다 — 페이로드를 셸·YAML로 조립하지 않는 것이 요지다 (POSTMORTEM 2026-08-31). 사용법은 [ACTIONS.md](./ACTIONS.md)
  - 검증: `i18n-order-check`에서 run green — 23키 / 69번역 / `POST → 200` / `translationsFilled: 69`
  - 붙이는 과정에서 걸린 것 넷: ① private action 접근이 `none`이라 `unable to resolve action` (API로 `access_level: user`) ② `github.action_path`의 리포 루트가 `../../..`인데 `../..`로 계산 ③ `package_json_file`·`node-version-file`이 **워크스페이스 기준**이라 절대경로가 안 먹혀 버전을 값으로 넘김 ④ 리포 secret과 Vercel의 `PUSH_TOKEN` 불일치(401)
  - ⚠️ **어댑터를 명시 지정한다** — bugshot-2는 `_locales`(4키)와 `ts-dict`(903키)가 공존해 탐지 우선순위가 작은 쪽을 잡는다. `adapter` input이 그 자리다
- [x] 커밋 메시지 `[skip-l10n]`이면 스킵 ✅ (2026-09-03)
  - 검증: PR #2 스쿼시 머지로 트리거된 run이 `skipped` — 무한 루프 차단이 실측됐다
- [x] 워크플로가 **열린 `l10n/sync` PR을 감지하면 경고** ✅ (2026-09-03)
  - 검증: PR #2가 열린 상태의 run에 PR URL이 담긴 `::warning`이 붙었다
  - 근거: strict라 그 PR이 머지되기 전의 push가 편집을 지운다 (MVP §3.1). 차단이 아니라 경고 — 병합 로직이 아니고 개발자가 판단할 재료다
  - ⚠️ **대상 리포 워크플로에 `permissions: pull-requests: read`가 필요하다.** 없으면 조회가 거부돼 경고가 뜨지 않는다. 첫 구현은 그 실패를 "PR 없음"으로 삼켰다 (POSTMORTEM 2026-09-03)
- [x] **적재 실패만 CI를 red로 만든다** (스캔 실패는 경고) ✅ (2026-09-03)
  - 근거: 키의 진실은 로케일 파일이고 스캔은 `refs` 전담이다 — 남의 리포 CI를 우리 스캐너 규칙으로 실패시키지 않는다 (ARCHITECTURE §4). 옛 체크리스트의 "비리터럴 인자 발견 시 CI 실패"는 "코드 스캔이 진실"이던 시절 항목이라 삭제했다
  - 검증: `ko.json`을 깨뜨린 커밋 → **failure**(`적재 에러 1건 — CI를 실패시킨다`), revert → **success**. 같은 리포에서 `refs` 0건·스캔 경고 0건인 run이 계속 green이었다
- [x] `vercel.json` Cron → `/api/pull` 야간 1회 ✅ (2026-09-03) — `0 18 * * *` UTC = KST 03:00
  - 검증: Vercel 대시보드 Settings > Cron Jobs에 `/api/pull` 등록 확인
  - 라우트는 프로덕션에서 새 `CRON_SECRET`으로 재확인했다 — `{"status":"skipped","reason":"no-changes"}`(200), 인증 없이는 401. `CRON_SECRET` 헤더 주입은 Vercel이 하므로 배선할 것이 없다
  - ⬜ **실제 야간 트리거는 아직 안 봤다** — 첫 발화가 KST 03:00이다. 다음 날 아침에 로그를 한 번 본다
- [x] 대상 리포 왕복 검증 — **자동화 경로로 한 바퀴** ✅ (2026-09-03, `order-check`)
  - CI push(200) → DB 편집 → 프로덕션 `/api/pull`(PR #2 생성) → 워크플로 실행(경고) → PR 머지(스킵) → 수동 실행(DB 수렴). 모든 홉이 **실물 Actions·실물 Vercel**을 지났다
  - [x] **`ts-dict` multi-locale 왕복** ✅ (2026-09-03, `bugshot-i18n-test` 903키 ko/en/fr) — `order-check`가
        검증하지 못한 축이다. **`per-locale` vs `multi-locale` 갈림길의 수술적 쪽이 실물 PR을 처음 지났다**
    - push 200(903키 / 2709번역 / 267 refs, 로케일 3개 자동 등록) → 편집 0건 pull `no-changes`(2층 blob
      비교까지 감) → 편집 3건 pull [PR #9](https://github.com/SinhyeokKang/bugshot-i18n-test/pull/9)
      `+3 -3 / 3파일` `[skip-l10n]` → 머지 → **재pull `no-edits`(1층 스킵, GitHub API 호출 0회)**
    - diff는 편집한 3줄뿐이다. 키 순서·빈 줄·**여러 줄로 감긴 문자열**(`settings.replay.help`)까지 보존됐다
    - ⚠️ **`adapter: ts-dict` 명시가 필수인 것이 실측됐다** — 명시 없이 `ingest`하면 `_locales`(4키)를 잡고
      903키를 통째로 놓친다. 조용히 작은 쪽으로 떨어지므로 에러가 나지 않는다
    - **대상은 `bugshot-i18n-test`(폐기용 복제본)다, `bugshot-2`가 아니다.** 실물 오픈소스 리포에 검증
      PR을 내면 흔적이 남는다 — 한 번 그렇게 냈다가 닫고 되돌렸다(PR #226, `l10n/sync` 삭제, DB 원복)
  - ⬜ **CI 워크플로(push 방향)는 이 리포에 안 붙였다** — 아래 전역 미결의 `ACTIVE_PROJECT_SLUG` 제약 때문에
        붙여도 프로덕션이 409를 낸다. CI 층은 `order-check`에서 green이고 어댑터와 무관해서 우선순위가 낮다
  - [x] **`yaml-catalog`·`code-dict` 왕복** ✅ (2026-09-03, `i18n-format-check` 9키 en/ja/ko) —
        **"per-locale인데 수술적"** 축이다. `json-catalog`(per-locale·재생성)도 `ts-dict`(multi-locale·
        수술적)도 이 조합을 지나지 않아, CLAUDE.md가 경고한 갈림길이 실물에서 검증된 적이 없었다
    - 픽스처에 보존이 깨지기 쉬운 모양을 일부러 심었다: Rails 루트 키, 앵커 `&common`, **머지 키
      `<<: *common`**, 접힌 스칼라 `>`, 주석 3종(상단·그룹 사이·매핑 안쪽), 작은따옴표와 큰따옴표 혼용
    - `yaml-catalog`: 편집 0건에서 **바이트 고정점** → [PR #1](https://github.com/SinhyeokKang/i18n-format-check/pull/1)
      `+4 -5 / 1파일`. 앵커·머지 키·주석·빈 줄 전부 보존. 편집 안 한 로케일 2개는 무변경
    - `code-dict`: 바이트 고정점 → [PR #2](https://github.com/SinhyeokKang/i18n-format-check/pull/2)
      `+3 -3 / 1파일`. 둘 다 머지 후 재pull `no-edits`(1층 스킵)
    - **머지 키로 상속되는 키는 read가 확장하지 않는다** — 확장하면 `settings.ok` 같은 유령 키가 생기고
      write가 그걸 실제 키로 삽입해 원본 구조를 깬다
    - ⚠️ **두 Project가 같은 리포를 가리키면 `l10n/sync`를 force update로 다툰다.** 순차로 검증했다
  - [x] **인용 부호 손실 수정** ✅ (2026-09-03) — 위 `code-dict` PR에서 **편집한 줄만 큰따옴표**로 나가는
        것이 관측됐다. `ts-dict`도 같은 결함이었다(픽스처가 큰따옴표라 안 드러났을 뿐)
    - 검증: `lib/adapters/quote-style.ts` + 테스트 31건(헬퍼 15 / code-dict 11 / ts-dict 5), 875 green.
      실물 재확인 `'common.ok': '확인했습니다'`. 커밋 `e2585fc`(test) → `481461a`(fix)
    - 회고: `docs/POSTMORTEM.md` 2026-09-03 — 값이 맞으면 통과하는 검증이 스타일 손실을 못 본다
    - 계약: ARCHITECTURE §1.4에 "값은 DB에서, 표현은 원본에서"를 명문화했다
- [x] `/l10n-roundtrip` 스킬 추가 ✅ (2026-09-03)
  - 검증: 오늘 세 리포로 실제로 돌린 순서가 그대로 절차다 — `bugshot-i18n-test`(ts-dict 903키),
    `i18n-format-check`(yaml-catalog·code-dict 9키). 게이트 셋(바이트 고정점 → hunk 수 = 편집 키 수
    → 재pull `no-edits`)과 그 과정에서 밟은 함정 넷(어댑터 미명시, `ACTIVE_PROJECT_SLUG` 409,
    한 리포 두 Project의 `l10n/sync` 충돌, 실물 리포에 낸 PR)이 전부 들어 있다

---

## 8. 어댑터 범용성 측정 ✅ + 어댑터 5종 완성 ✅ + 홀드아웃 검증 ✅ (2026-09-02)

**스펙·설계·태스크는 [features/adapter-generality/](./features/adapter-generality/)에 있고, 결과와 판정은 [ADAPTER-COVERAGE.md](./ADAPTER-COVERAGE.md)에 있다.**

- [x] 오픈소스 리포 **109개**에 `detect`+`read`+왕복을 돌려 `docs/ADAPTER-COVERAGE.md` 작성 (`pnpm adapter-survey`)
  - 진입 조건 완화: 6단계 완료로 충분했다 — 앱·DB·Actions를 쓰지 않고 지표 ④를 픽스처·대상 리포 파일만으로 계산한다
  - 검증 통과: 지표 4개가 숫자로 존재. **1차(어댑터 3개) → 2차(5개)** 두 번 측정했다
- [x] 판정 4개 기록 — 지원 선언 포맷 / MVP §4.1 "키 정렬" 개정 필요 여부 / `ts-dict` 자동 탐지 제외 / **자동 탐지의 무인 신뢰 가능 여부**(구 "SaaS 경로 개폐" — MVP에 없던 전략 전제라 제품 중립으로 재명명)
- [x] **판정대로 어댑터를 만들었다** — `yaml-catalog`(18개 리포) · `code-dict`(11개) 신규, `writeStrategy` 축 분리, `.`-키 손실 수리, 탐지 관문 완화, 어댑터 간 순위 도입, `ts-dict` 자동 탐지 제외
  - 최종: 탐지 **99.0%**(지원 포맷 100/101) / 오탐 **0.0%** / 바이트 고정점 **100%** / **조용한 손실 0**
  - ⚠️ **어댑터를 만들고 단위 테스트를 통과시킨 뒤에도 실물 코퍼스가 결함 7건을 더 잡았다** (ADAPTER-COVERAGE §4). 그중 둘은 검증 층 자체의 결함이었다
- [x] **홀드아웃 20개로 일반화를 검증했다** (2026-09-02 3차) — 겹치지 않는 새 리포, **손대기 전에 먼저** 측정
  - 결과: 수정 전 탐지 50.0% · 오탐 **40.0%** → 수정 후 탐지 80.0%(지원 포맷 16/17) · 오탐 **6.3%** · 왕복 **16/16 의미·바이트**
  - ⚠️ **학습 코퍼스의 오탐 0.0%는 과적합이었다.** 보고할 수치는 홀드아웃의 6.3%다 (ADAPTER-COVERAGE 판정 ④ 갱신)
  - 경로 모양 2개 추가: `{dir}/{locale}/<name>.json`(6/20) · `{dir}/<prefix><sep>{locale}.<ext>`(3/20). **어댑터는 새로 만들지 않았다** — read·write가 같고 `pathTemplate`만 다르다
  - 결함 4건 수리: 맨 3글자 로케일 오탐(`hasStrongLocale`) · 로케일 디렉터리 파일 이름 선택(`PRIMARY_NAMES`) · 접두사가 맨 파일을 누름(`templateShapeRank`) · 하위 카탈로그가 정본을 누름(`liftAncestors`)
  - ⚠️ **뒤 둘은 이 라운드의 수정이 만든 회귀다.** 매 라운드 홀드아웃과 학습 코퍼스를 **둘 다** 돌린 것이 그것을 잡은 유일한 이유다
  - ⚠️ 순위 픽스 하나가 자기 단위 테스트만 통과하고 실제 경로에서 죽어 있었다 — `detectCandidatesAcross`가 어댑터 순서를 전부 재정렬한다 (POSTMORTEM 2026-09-02)
  - 남긴 오탐 1건: discourse(플러그인 카탈로그가 정본을 누름). `plugins/` 감점은 **관측 1건이라 만들지 않았다**
- [x] **원본 포맷 보존** — **완료** (2026-09-04, ADAPTER-COVERAGE §16.3): 재생성 writer가 원본의
      **들여쓰기 · 한 줄 컨테이너 · 비ASCII 이스케이프 · 엔트리 필드 순서 · 슬래시 이스케이프**를
      따른다. 좁힌 게이트 분모의 첫 write diff 중앙값이 **0.9779 → 0.0000**이고, 고정 19 slug
      집합은 중앙값 0.000 · 초과 0으로 회귀 없음. chrome 중앙값 0.0962 → 0.0250, 전체 목표 초과
      31.3% → 12.1%. 고정점·왕복·탐지·오탐·수술적 편집 hunk·`not-run` 전부 유지.
  - 회차: §14(들여쓰기) · §15(한 줄 컨테이너·이스케이프) · §16(엔트리 필드 순서·슬래시)
  - §17(12차, 감사 3라운드 리팩터 뒤): 회귀 0. `descriptionFirst` 2 → 1은 지표가 프로덕션 다수결을 따라간 결과
  - **슬래시 이스케이프는 계획에 없던 축이다** — 10차가 Midnight-Lizard의 잔여 0.109를 드러냈고
    그게 전부 `\/`였다 (§16.2)
  - ⚠️ **완료 조건 ③(`changedHunks` 방향)은 판정 불가로 남았다** — 재생성 리포의 hunk 수가
    `RepoSurvey`에 안 실린다. L2 골든이 대체 근거다 (§16.3)
  - ⚠️ **범위 밖으로 기록한 것**: minify된 파일(HeaderEditor 1.000 — 루트 제외 + 한 줄 여백
    미관측이 겹친 자리, §15.3). 미번역 제외·정수형 키·점 키는 원래 비목표다
  - **태스크 8(실물 `/l10n-roundtrip`) 완료** (2026-09-04, `i18n-order-check`) — 편집 0건 `no-changes`
    → 편집 3건 [PR #3](https://github.com/SinhyeokKang/i18n-order-check/pull/3) `+3 -3 / 2파일`
    → 머지 → 재pull `no-edits`(API 0회) → 재push 뒤 다시 `no-changes`. 표현 5축이 실물 diff에서
    전부 살아 있었다. 상세는 MVP §9
    - 그 회차에서 **`ja.json`(안 건드린 로케일)이 PR에 안 나갔다** — 파일 단위 변경 감지의 실물 확인이다
    - ⚠️ **`chrome-locales`는 실물 PR 이력이 여전히 0이다** — 태스크 8이 그 사실을 기록하기로 한 그대로다
- [ ] **`yaml-catalog` 범위 기반 치환** (2026-09-04 7차 측정에서 발견) — `doc.toString()`이 문서를
      다시 찍어 **편집 하나가 파일 절반을 바꾼다**(redmine 1,585줄 중 816줄). 옵션으로 닫을 수 있는
      축은 닫았고(들여쓰기·줄 접기·시퀀스 들여쓰기·플로우 여백) 나머지는 스칼라 `range`로 원본
      문자열을 직접 갈아끼워야 한다. 1키 편집 → 1 hunk가 완료 조건이다 (ADAPTER-COVERAGE §13.3).
      별 `/feature`
- [ ] ⏸️ **키 구분자를 계약으로 뺀다** (`nested: boolean` → `tree: {style, separator}`) — 남은 손실 **1건**(siyuan — musicblocks는 `nestedByPath`로 해소, ADAPTER-COVERAGE §13.1)의 뿌리이고, 비-점 구분자 리포 8개도 같은 축이다. 문서는 [features/key-separator-contract/](./features/key-separator-contract/)에 있고 **SaaS화 이후로 보류** 판정(2026-09-04) — 도입 대상 bugshot-2가 `ts-dict`라 효과 0
- [x] **"원본 키 순서 보존" 모드** — 별 `/feature`로 분리했다 → **아래 §9** (판정 ②)
  - 근거: 수술적 치환 어댑터가 diff **0.000**을 내는 것이 대조군이다 — 같은 문제를 원본 보존으로 푸는 방식이 이미 코드베이스에 있다

---

## 9. 키 순서 보존 ✅ (2026-09-03 완료)

**스펙·설계·태스크는 [features/key-order-preservation/](./features/key-order-preservation/)에 있다.**
재생성 어댑터가 첫 pull에서 파일을 통째로 재정렬해 **사람이 첫 PR을 리뷰할 수 없다** — 그 PR이
도구 도입을 판단하는 관문이라 임계 경로다 (§8 판정 ②의 실행).

- [x] **설계 4관점 검수 반영** (2026-09-02, `/feature-review`) — 배선 4곳 누락, `+N/-N` 대칭의
      판별력 부재, 코퍼스 출처 오기, 검증 루프 부재를 고쳤다
- [x] **태스크 0-1 — 측정 지표 구현** (2026-09-02) — `lib/survey/json-shape.ts` 신규.
      로케일 간 순서 일치율 · 들여쓰기 분포 · 잔여 diff 원인 · 비-base diff · 어댑터별 중앙값 ·
      `not-run` 수. `configFiles` 배선 결함도 함께 수리 (POSTMORTEM 2026-09-02)
  - 검증 통과: `pnpm test` 634건 green, 실물 2개 리포에서 지표가 0이 아닌 값을 낸다
- [x] **태스크 0-2 — 실측 실행과 판정** (2026-09-02, 4차 측정) — 결과 전문 `ADAPTER-COVERAGE.md` §10
  - **판정 ① A안 확정** — 일치율 중앙값 **1.000**(학습·홀드아웃) ≥ 0.9 → `StringKey.sortIndex`.
    실질 근거는 **악화 후보 0건**(base만 흐트러진 리포가 없다)
    - ⚠️ 한계: 분포가 이중 최빈이라 **31%는 일치율 0.5 미만**이다. 나빠지진 않지만 좋아지지도
      않는다 — 그런 리포가 도입 대상이 되면 대안 E로 승격
  - **판정 ② 들여쓰기 → 별 기능** — 2칸 비율 **69.0%** < 0.8. 재생성 리포 71개 중 30개가 갖는
    최대 잔여 원인이다 (아래 후속)
  - **판정 ③ 게이트 분모 축소** — 순서 외 원인이 없는 리포가 **23/71(32%)** 뿐이라 전체 코퍼스
    diff 목표는 순서만으로 원리적 도달 불가. 완료 조건을 그 부분집합으로 다시 썼다
  - **chrome 필드 보존을 범위로 편입** — `chrome-locales` 33개 중 깨끗한 것이 5개(15%)뿐이고
    20개가 비-base `description`을, 12개가 `placeholders`를 잃는다. 우리 도입 대상이라 순서만
    고치면 첫 PR이 여전히 안 읽힌다
- [x] **태스크 1 — `read`가 순서와 chrome 필드를 관측한다** (2026-09-03) —
      `LocaleEntry.order`(파일 스코프 평탄화 순서) + `LocaleEntry.placeholders`(해석 없이 그대로).
      write는 안 건드려서 출력이 아직 바이트 동일하다
  - ⚠️ `placeholders`는 **모양이 이상해도 안 버린다** — 거르면 그게 이 기능이 없애려는 손실이고,
    에러로 보고하면 read 에러가 `push:local`을 막아 남의 리포가 우리 규칙으로 실패한다
- [x] **태스크 2 — 재생성 writer가 원본 순서로 재조립한다** (2026-09-03) —
      `orderedEntries`가 `usableEntries`를 대체하고, `json-catalog`이 중첩 각 층을 다시 정렬하던
      `sortedByKey` 호출을 걷어냈다. `chrome-locales`는 `placeholders`를 그대로 되돌린다
  - **진입점에서 확인**: excalidraw 첫 write diff **0.843 → 0.000** (실물 코퍼스). siyuan은
    0.999 유지 — tab 들여쓰기 + 정수형 키라 둘 다 기록된 비목표다
  - 계약 테스트를 **교체**했다(코드 유닛 정렬 assert → order assert + 폴백 유지), 수술적 3개에
    "order를 줘도 출력이 같다"를 단언하고 `ignoreOrder` 네거티브를 넣었다
  - MVP §4.1 · ARCHITECTURE §1.1을 **여기서 갱신**했다 — 코드에 없는 함수를 가리키는 문서를
    배포할 수 없어 태스크 7에서 당겨왔다
  - ⚠️ `description`은 아직 base에만 낸다 — `buildWriteEntries`가 키 단위 값을 전 로케일에 실어
    지금 가드를 풀면 pull이 비-base 파일에 **없던 description을 만들어 넣는다**. 태스크 4에서 함께
- [x] **태스크 3 — 마이그레이션** (2026-09-03) — `add_key_order_and_chrome_fields`.
      `StringKey.sortIndex Int?` · `Translation.description String?` · `Translation.placeholders Json?`.
      **`ADD COLUMN` 셋뿐**이고 `pnpm db:deploy`로 프로덕션에 적용했다
  - ⚠️ `Translation.description`은 `StringKey.description`과 **다른 컬럼**이다 — 저쪽은 소스 키
    메타데이터, 이쪽은 그 로케일 파일이 실제로 갖고 있던 값. 합치면 병합이 된다
- [x] **태스크 4 — push·pull 배선** (2026-09-03) — 페이로드 `order` + 로케일별
      `description`·`placeholders`, 벌크 SQL 컬럼 셋, pull 값 전달 4홉, `load.ts` orderBy,
      chrome `isBase` 가드 해제
  - **실 DB로 양방향 확인**: `push:local` → 200, 읽기 전용 probe에서 `sortIndex` 0~3이 파일 순서
    그대로 나오고 **비-base(ko)에 한국어 description이 실렸다**. SQL 문법은 런타임에만 드러나고
    CI는 실 DB를 안 친다
  - ⚠️ 이 과정에서 **`--adapter ts-dict`가 한 번도 동작한 적이 없다는 것**을 발견해 고쳤다
    (`fix(adapters)`, POSTMORTEM 2026-09-03). bugshot-2 DB는 원상복구했다
- [x] **태스크 5 — 검증 루프** (2026-09-03) — L1 진입점 회귀(`runPull`이 커밋에 실은 파일 바이트 +
      `orderBy` 두 곳) / L2 골든 픽스처(실측 모양 3개를 인라인으로, `lib/survey/diff.ts`의
      프로덕션 함수로 단언) / L3 재측정 트리거를 `/push` 4d·CLAUDE.md·ARCHITECTURE §1.1에 등재
  - `changedHunks` 신설 — diff 비율이 중첩 JSON의 리뷰 고통을 체계적으로 과소평가하는 것을 덮는다
  - **이제 순서 회귀가 네트워크 없이 `pnpm test`에서 잡힌다.** 재측정이 답하는 것은 일반화뿐이다
- [x] **태스크 6 — 재측정 게이트 통과** (2026-09-03, 5차 측정 → `ADAPTER-COVERAGE.md` §11)
  - clean 부분집합 **중앙값 0.000** (학습 19개 / 홀드아웃 4개), **목표 초과 5.3% / 0.0%** ≤ 20%
  - 부수: `json-catalog` **0.784 → 0.022** · **0.843 → 0.000**, `chrome-locales` **0.705 → 0.096**,
    전체 중앙값 **0.613 → 0.001**. 불변식 넷(고정점·왕복·수술적 0.000·`not-run`) 전부 유지
  - **순서가 원인인 초과는 학습·홀드아웃 통틀어 0건**이다. 그 과정에서 원인 셋이 새로 이름을
    얻었고(`emptyValues` 21 / `dottedWithNested` 8 / `compactContainer` 4), chrome 두 필드는
    보존되므로 원인 목록에서 뺐다
- [x] **실물 확인** (2026-09-03) — [i18n-order-check#1](https://github.com/SinhyeokKang/i18n-order-check/pull/1).
      23키 × 3로케일 테스트 리포를 새로 만들어(남의 리포 사본을 prod DB에 넣지 않으려고) 돌렸다
  - **대조군**: 편집 0건 pull → `skipped/no-changes`. **`0 files changed`보다 강하다** — 2층
    blob SHA가 "리포 파일 = 우리가 낼 파일"로 판정해 커밋을 만들 이유조차 없었다
  - **본실험**: ko의 키 3개를 흩어지게 편집 → `3 insertions(+), 3 deletions(-)` / **hunk 3**
- [x] **태스크 7 — 문서** (2026-09-03) — MVP §4.1(키 정렬 + chrome 계약)·§5 스키마,
      ARCHITECTURE §1.1(값 전달 경로 넷 + 정렬 지점 여섯), ADAPTER-COVERAGE §11 + **판정 ② 해소**,
      TASKS §9·§6 각주·후속 재정의, POSTMORTEM 1건

**기능이 끝났다.** 세 층이 전부 답했다 — 바이트 수준은 L1이 진입점에서, 코퍼스 수준은
ADAPTER-COVERAGE §11이, 사람이 읽는 PR은 실물 확인이.

`order-check` 프로젝트 행(23키)과 리포·PR은 다음 실물 확인용으로 남겼다 — **그 판단이 회수됐다**:
2026-09-04 원본 포맷 보존이 같은 리포로 왕복을 돌렸고, 그때 리포를 **표현 5축이 섞이도록 재포맷**했다
(en 4칸 + 한 줄 컨테이너 + `\/`, ko 4칸 + 전 비ASCII `\uXXXX`, ja 탭). 재생성 어댑터의 실물 확인은
이제 이 리포가 정본이다.

⚠️ **당시 대상 프로젝트 env는 `order-check`였다** (로컬 `.env.local`). 재생성 어댑터를 계속 검증하는
동안 그대로 뒀고 프로덕션 env는 건드리지 않았다. **그 변수는 2026-09-07에 사라졌다** — 지금은
`push:local`이 `--project`를 필수로 받고 `PUSH_TOKEN`이 그 프로젝트의 토큰 원문이다.
