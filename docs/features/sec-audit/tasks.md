# sec-audit — 태스크 (ship 단위)

규칙은 `docs/TASKS.md`와 같다: **검증 조건이 실제로 통과했을 때만** 체크한다. `——`가 커밋 경계다.
`[manual]`은 눈·명령으로 하는 검증이다(이 리포엔 e2e가 없다). **`🔒`는 사람이 정해야 하는 지점**이고
그 앞의 태스크를 먼저 하지 않는다.

발견 번호(1~28)는 **`findings.md`의 연번**이다. 재번호하지 않는다.

**번호가 실행 순서다.** 근거:

1. 🔴 둘이 앞이다. **ship 1이 ship 2보다 먼저인 것은 시급도가 아니라 게이트 때문이다** — ship 1이
   `lib/adapters/**`를 쳐서 재측정을 한 번 돌리고, ship 2는 그 디렉터리를 **안 건드리는 것이 설계**다.
   순서를 바꾸면 ship 2가 잎 모듈을 어디 둘지 정하기 전에 재측정이 끝나 버린다.
2. ship 3은 런타임 코드 0줄이고 **판정 하나(소비자 리포 넷)를 낀다** — 그 판정을 일찍 띄워야 답이
   오는 동안 다른 ship이 돈다.
3. ship 4·5·6은 🟡이고 서로 독립이다. 5가 가장 무겁다(온보딩 오류 갈래를 흔든다).
4. **DB 트랙은 코드 0줄이라 배포 경로와 무관하고, 어느 ship과도 병렬이다.**

⚠️ **`/ship`은 dev까지다.** 프로덕션은 ship마다 `/merge`를 따로 부른다 — 이 목록의 어느 ship도
스키마를 건드리지 않으므로 `/merge` 1단계의 `db:status:prod`는 12개 up-to-date 확인만이다.

⚠️ **각 ship은 `/tdd`로 시작한다** (CLAUDE.md 작업 원칙 — 테스트 우선). 아래 T1이 항상 그것이다.

⚠️ **🔴 둘을 고치면 `/postmortem`이 ship의 완료 조건이다.** 둘 다 "게이트가 green인 채로 뚫려 있었다"
부류라 재발 방지 grep이 `docs/POSTMORTEM.md`에 있어야 `/audit` 다음 회차가 전수로 다시 본다.

---

## ship 1 — `lib/adapters/**`의 프로토타입 키와 정규식 상한 (발견 1 · 17 · 11)

**한 ship인 이유**: 셋 다 `lib/adapters/**`라 **재측정 트리거가 한 번으로 끝난다**(학습+홀드아웃 둘,
`/push` 4d가 사용자에게 묻는다). 나누면 4분 네트워크를 두 번 쓰고 ADAPTER-COVERAGE 회차가 둘로 늘어난다.

- [ ] **T1** `/tdd interface` — 아래 테스트를 먼저 박는다
  - `lib/adapters/__tests__/contract.ts`에 **`ADAPTERS` 순회 검사 하나 추가**: 어느 어댑터든
    `__proto__`·`constructor`·`prototype` 세그먼트를 든 키를 `write`에 먹여도 (a) `({} as never).x`가
    오염되지 않고 (b) 그 키가 **출력에서 사라지지 않는다**
    - ⚠️ **픽스처를 `JSON.stringify({__proto__: …})`로 만들면 이 테스트가 원리적으로 통과한다** —
      객체 리터럴의 `__proto__:`는 own property를 만들지 않아 빈 객체가 직렬화된다. **리터럴 JSON
      문자열**로 만든다 (findings §1.1 — 감사가 이 함정에 한 번 걸렸다)
    - 검증: 수정 전 red여야 한다. `json-catalog`(nested)는 전역 오염으로, `chrome-locales`·
      `json-catalog`(flat)은 **키 소실**로 각각 red다
  - `matchGlobPaths` ReDoS 상한 테스트: `*`가 N개 이상이거나 길이가 상한을 넘는 템플릿에 대해
    **경계 시간 안에** 빈 배열을 낸다(타이머가 아니라 판정으로 검사 — `*` 개수·길이 상한이 순수 함수의
    반환에 드러나야 한다)
  - `lib/adapters/__tests__/key-order-golden.test.ts`는 **그대로 green이어야 한다**(결정성 회귀 없음)
- [ ] **T2** `lib/adapters/json-catalog.ts` — `setDeep`의 중간 노드를 프로토타입 없는 객체로
  - 🔒 **출력 정책**: `"__proto__"` 키를 (a) 그대로 파일에 낸다 / (b) `AdapterError`로 떨어뜨린다.
    **추천은 (a)** — 값을 잃지 않는 것이 코어 원칙이고 `JSON.parse`가 그것을 own property로 되돌리므로
    왕복이 성립한다. (b)를 고르면 `ADAPTER_ERROR_CODES`에 코드가 하나 늘고 `messages/en.tsx`의
    `adapterErrors`가 따라온다(6b-1의 계약)
  - 검증: T1의 contract 검사 green / `normalizeArrays`가 `Object.keys`로 도는데 프로토타입 없는 객체에서
    그 키가 **보인다**(현재는 안 보여 출력에서 사라진다)
- [ ] **T3** flat 대입 자리 둘 — `json-catalog.ts:256` · `chrome-locales.ts:217`
  - `out`을 프로토타입 없는 객체로. ⚠️ `CHROME_KEY`(`/^[A-Za-z0-9_@]+$/`)가 `__proto__`를 통과시키므로
    **정규식을 고치는 것으로는 안 닫힌다** — 대입 자리를 고친다
  - 검증: `chrome-locales` write 결과에 그 키가 실린다 / `serializeJson`이 프로토타입 없는 객체를 그대로 받는다
- [ ] **T4** `lib/adapters/shared.ts` — `matchGlobPaths`에 `*` 개수·템플릿 길이 상한
  - 🔒 **상한을 어디서 거는가**: 순수 함수 안(빈 배열 → pull이 `fail("the glob matched no files")`로
    **시끄럽게** 멈춘다) / 스키마 경계(ship 2) / 둘 다. **추천은 둘 다** — 저장된 템플릿이 이미 DB에
    있을 수 있어 경계만으로는 cron 경로가 안 닫힌다
  - 검증: `lib/onboarding/confirm.ts:30`의 `{locale}` N개 경로도 같은 상한을 지난다
- [ ] **T5** `pnpm typecheck && pnpm test`
- [ ] `——` `test:` → `fix:` 두 커밋
- [ ] **T6** **재측정** `[manual]` — `pnpm adapter-survey`를 **학습·홀드아웃 둘 다** 돌리고
      `docs/ADAPTER-COVERAGE.md`에 **15차**를 더한다
  - ⚠️ 한쪽만 돌리면 못 본다(§0 3차 — 수정 4건 중 2건이 수정이 만든 회귀였고 하나는 학습에서만 나타났다)
  - 검증: ③ 지표가 14차와 같거나 나아진다. **달라지면 그 자체가 발견이다** — 프로토타입 키를 가진
    리포가 코퍼스에 있었다는 뜻이고 findings에 적는다
- [ ] **T7** 문서 — `docs/ARCHITECTURE.md` §1.1(재생성 규칙에 프로토타입 키 한 줄) ·
      `CLAUDE.md` 코드 컨벤션(대입 자리도 `Object.hasOwn`/null 프로토타입) · `/postmortem`
  - ⚠️ POSTMORTEM 항목의 축은 **"조회 자리만 고쳤다"**다 — 2026-09-08 항목이 `??` 폴백을 닫았는데
    같은 뿌리의 대입 자리 셋이 남았다. 재발 방지 grep은 "untrusted 키로 `obj[k] =`"다
- [ ] `——` `docs(ARCHITECTURE): …` · `docs(CLAUDE): …` · `docs(POSTMORTEM): …`
- [ ] **T8** `/push` → `/merge`

---

## ship 2 — 외부 페이로드가 경로와 크기를 정하지 못하게 (발견 2 · 10)

**한 ship인 이유**: 둘 다 `lib/push/plan.ts`의 Zod 경계이고, 2번의 방어선 절반이 `lib/pull/plan.ts`다.

⚠️ **이 ship은 `lib/adapters/**`를 건드리지 않는 것이 설계다.** `looksLikeLocale`이 그 디렉터리에
있지만 **재사용하지 않는다** — 그러면 재측정 트리거가 붙고, 더 중요하게 그 함수는 *탐지* 규칙이라
"경로로 안전한가"와 축이 다르다(2~3자 소문자를 받는 것이 탐지엔 맞고 경로 방어엔 느슨하다).

- [ ] **T1** `/tdd interface` — 판정 함수와 두 경계
  - 새 잎 모듈의 순수 판정: `..`·선행 `/`·`/` 포함·NUL·백슬래시·퍼센트 인코딩·빈 문자열·길이 초과를
    각각 거부하고 `ko`·`pt-BR`·`zh_Hans`·`en`을 통과시킨다
  - `PushPayload`: 안전하지 않은 로케일 코드·템플릿을 **400으로** 거부한다(409가 아니다 — 스키마 위반이다)
  - `PushPayload` 크기 상한: `keys`·`translations`·`refs`·`locales` 배열과 `key`·`value`·`sourceText`·
    `pathTemplate` 문자열이 상한을 넘으면 거부한다
  - `resolveLocalePaths`: DB에 이미 안전하지 않은 로케일 코드가 있어도 **경로를 만들지 않고 `fail()`**한다
    (2층 방어 — 스키마를 지나기 전에 저장된 행이 있다)
  - 검증: 수정 전 red. 특히 `pathTemplate: "{locale}"` + `locales: [".github/workflows/pwn"]`가
    현재 `.github/workflows/pwn`을 낸다는 것을 red로 고정한다
- [ ] **T2** 🔒 **잎 모듈의 이름과 자리** — 추천은 `lib/locale-code.ts`(import 0, `lib/routes.ts`·
      `lib/relative-time.ts`와 같은 층)
  - ⚠️ `lib/pull/ref-slug.ts`가 같은 이유로 내려온 선례다(온보딩이 판정을 공유하면서 그 파일의
    그래프를 클라이언트로 끌고 갔다 — POSTMORTEM 2026-09-07). **`lib/pull/`에 두면 push 스키마가
    그것을 import해 pull 그래프를 끌어온다**
- [ ] **T3** `lib/push/plan.ts` — 로케일·템플릿 charset + 배열·문자열 `.max()`
  - 🔒 **상한 값**: 키 수·로케일 수·문자열 길이. 근거는 실측이다 — prod 최대가 `ts-dict` 903키 ·
    `StringKey` 3,297행 · `Translation` 12,783행(감사 중 실측). 추천은 **키 20,000 / 로케일 200 /
    값 10,000자 / 템플릿 200자**이고, 넘으면 400 + 그 이유를 응답에 담는다(대상 리포 CI 로그로 간다)
  - ⚠️ `placeholders: z.unknown()`은 **그대로 둔다** — "모양을 검사하지 않는다"가 계약이다. 상한은
    바이트가 아니라 개수·길이 축에서만 건다
  - 검증: `.env.example`·문서 변경 없음(새 환경변수를 만들지 않는다)
- [ ] **T4** `lib/pull/plan.ts` — 보간 결과의 경로 봉쇄
  - `resolveLocalePaths`의 per-locale 갈래에서 치환 뒤 경로를 검사한다. 파일이 트리에 없어도 만드는
    것은 유지하고(그 갈래의 요지다), **템플릿의 디렉터리 밖으로 나가는 것만** 막는다
  - 검증: 정상 신규 로케일(`locales/ja.json`)은 그대로 생성된다 / `..`가 든 코드는 `fail()`
- [ ] **T5** 🔒 `checkFormat`의 "셋 다 null이면 통과"(`lib/push/guard.ts:69-71`)를 유지하는가
  - **추천은 유지**다 — "포맷은 push가 채운다"가 스키마의 원래 계약이고, T3의 charset 검증이 그 구멍의
    실질을 없앤다. 좁히면 온보딩 밖에서 만들어진 행의 첫 push가 막힌다
- [ ] **T6** `[manual]` **실데이터 확인** — prod·dev의 `Locale.code`·`Project.pathTemplate`에 안전하지
      않은 값이 있는지 읽기 전용으로 센다
  - ⚠️ **하나라도 있으면 이 ship이 아니라 사고 대응이다** — 이미 나간 PR을 봐야 한다
  - 검증: 0건
- [ ] **T7** `pnpm typecheck && pnpm test`
- [ ] `——` `test:` → `fix:`
- [ ] **T8** 문서 — `docs/ARCHITECTURE.md` §5.5(외부 페이로드가 정하지 못하는 것) ·
      `docs/SAAS.md` 불변식(경로는 서버가 정한다) · `/postmortem`
  - POSTMORTEM 축: **"검증이 탐지 경로에만 있었고 적재 경로에 없었다"** — `looksLikeLocale`이 존재하는데
    쓰이지 않은 것이 이 결함의 모양이다. 재발 방지 grep은 "입력이 경로 문자열로 보간되는 자리"
- [ ] `——` 문서 커밋
- [ ] **T9** `/push` → `/merge`

---

## ship 3 — 리포 밖에서 오는 것 (발견 3 · 13 · 12 · 20 · 21 · 18)

**한 ship인 이유**: 런타임 코드 0줄(스크립트·워크플로·설정)이라 게이트가 typecheck+test뿐이다.
**3번만 소비자 리포 넷을 건드리는 판정을 낀다** — 그래서 T2를 먼저 띄운다.

- [ ] **T1** 🔒 **가장 먼저 띄울 판정: `@main` 참조를 어떻게 바꾸는가** (발견 3)
  - 후보 (a) 불변 태그(`l10n-push-v1`)를 끊고 `docs/ACTIONS.md`가 그것을 가리킨다 /
    (b) 소비자에게 SHA 핀을 안내한다 / (c) `@main`을 유지하고 `main` 접근 통제로 대응한다
  - **추천은 (a)** — (b)는 소비자가 우리 릴리스마다 SHA를 갱신해야 하고, (c)는 Free+private에서
    브랜치 프로텍션이 불가라 강제 수단이 관행뿐이다(실측 403)
  - ⚠️ **대상 리포 넷의 워크플로를 고치는 작업이 따라온다**: `bugshot-2` · `bugshot-i18n-test` ·
    `i18n-format-check` · `i18n-order-check`. 태그를 끊고 문서만 고치면 **그 넷은 계속 `@main`이다**
  - ⚠️ **`docs/ACTIONS.md`와 `CLAUDE.md`가 지금 `@main`을 "안전하다"고 서술한다** — 그 논거는
    *낡음*이고 *가변성*이 아니다. 판정이 어느 쪽이든 **두 문서의 그 문장을 고친다**
- [ ] **T2** `.github/actions/l10n-push/action.yml` — `pnpm/action-setup`·`actions/setup-node`를 40자
      commit SHA로 핀(`# v4.x.x` 주석 동반)
  - 검증: `[manual]` 대상 리포 하나에서 워크플로를 한 번 돌려 green
- [ ] **T3** `.github/workflows/ci.yml` — `permissions: contents: read`(job 레벨) + 액션 셋 SHA 핀
  - ⚠️ 리포 기본값이 지금 `read`라 **동작 변화가 없어야 한다** — 그것이 이 태스크의 요지다(설정을
    트리 안으로 옮긴다)
  - 검증: `verify` job green
- [ ] **T4** `lib/cli/walk.ts` — 심링크를 건너뛰고 순환을 검출한다 (발견 12)
  - `withFileTypes` 또는 `lstatSync`. visited 집합은 `dev:ino`
  - 검증: 테스트로 (a) 디렉터리 밖을 가리키는 심링크가 결과에 없다 (b) `ln -s . loop` 모양이 종료한다
  - ⚠️ **세 CLI가 이 함수를 공유한다**(`ingest`·`scan`·`push:local`) — 세 경로가 다 통과하는지 본다
- [ ] **T5** `scripts/adapter-survey.ts` — `readFileSync` 앞에 `lstat` 검사 + `sparse-checkout set`에
      `"--"` + `--limit` 기본값 (발견 12 · 20)
  - ⚠️ 96행 주석("심링크는 없는 파일로 취급")이 **거짓이므로 주석도 고친다** — `catch`는 오류일 때만 돈다
  - ⚠️ **이 변경이 코퍼스 선택을 바꾸면 지표가 움직인다.** 규칙상 재측정 트리거는 `lib/adapters/**`·
    `lib/survey/**`뿐이라 자동으로 걸리지 않는다 — **ship 1의 15차 직후이므로 선택 파일 수가 15차와
    같은지 한 줄로 확인**하고, 다르면 그때 재측정한다
- [ ] **T6** `.gitignore`에 `.env*` + `!.env.example` · `*.key` · `*.p12` · `*.pfx` (발견 18) ·
      `pnpm-workspace.yaml`의 `onlyBuiltDependencies`에서 `@prisma/client`·`sharp` 제거 (발견 21)
  - 검증: `git check-ignore -v .env.production .env.development app.key cert.p12`가 넷 다 잡는다 /
    `pnpm install`이 `Ignored build scripts` 경고 없이 끝난다(셋만 남아야 한다)
- [ ] **T7** `pnpm typecheck && pnpm test`
- [ ] `——` `chore:`(핀·gitignore·workspace) · `fix:`(walk·survey) 두 커밋
- [ ] **T8** 문서 — `docs/ACTIONS.md`(참조 방식·red 조건) · `CLAUDE.md`(게이트웨이 절 · CI 절)
- [ ] `——` `docs(ACTIONS): …` · `docs(CLAUDE): …`
- [ ] **T9** `/push` → `/merge` → `[manual]` 대상 리포 넷의 참조 갱신(T1 판정이 (a)·(b)면)

---

## ship 4 — 페이로드에 필요한 것만 내려보낸다 (발견 4 · 15 · 14 · 19 · 23)

**한 ship인 이유**: 전부 app/auth 층이고 마이그레이션이 없다. 4번과 23번이 같은 축("타입·문서가
좁혀 놓은 것을 직렬화가 넓힌다")이고, 14번은 그 축을 상시로 지킬 가드다.

- [ ] **T1** `/tdd interface`
  - `lib/auth/query.ts`: 두 로더가 **원문 이메일을 반환하지 않는다**(반환 타입에 `email`이 없다)
  - 목록 전체를 보고 만든 라벨이 충돌 시에만 넓어진다 — `maskedInviteLabels`와 **글자 하나까지 같은
    출력**(malmoi#18의 성질을 멤버 표로 확장한다)
  - `components/__tests__/members-screen.test.ts`에 **소스 스캔 추가**: `components/members/*`가
    `maskEmail`을 import하지 않는다(마스킹은 서버의 일이다) · 두 로더의 `select`에 `email: true`가 없다
    - ⚠️ 렌더가 아니라 스캔인 이유는 `focus-ring`·`multiline-detail`과 같다 — **페이로드는 눈으로
      안 보인다.** 감사가 이 결함을 정적으로만 확인한 것도 같은 이유다
  - `disconnectGithub`: 다른 사용자의 `Account` 행이 있어도 그것을 지우지 않는다
  - `entry-points`: 프로젝트 스코프 Action이 `requireUser`만 부르면 **red**여야 한다
  - 검증: 위 다섯이 수정 전 red
- [ ] **T2** `lib/auth/invite-label.ts` — 목록 라벨 생성을 초대 전용에서 **이메일 목록 일반**으로
  - 🔒 기존 `maskedInviteLabels`를 일반화하는가 / 형제 export를 두는가. **추천은 일반화 + 옛 이름
    유지**(재수출) — `docs/DESIGN.md` §6.65와 `CLAUDE.md`가 그 이름을 가리킨다
- [ ] **T3** `lib/auth/query.ts` — `MemberView`·`PendingInvitation`이 `email` 대신 라벨을 든다
  - ⚠️ **`app/(edit)/__tests__/queries.test.ts`가 이 로더들을 메모리 DB로 직접 부른다** — 그 테스트가
    같은 커밋에서 따라온다
- [ ] **T4** 두 클라이언트 컴포넌트에서 `maskEmail` 호출 제거 + `member-list.tsx`의 `who`(aria-label)를
      서버 라벨로
- [ ] **T5** `app/(edit)/projects/actions.ts` — `disconnectGithub`을 `deleteMany({ where: { userId, provider } })`로
  - ⚠️ **주석도 고친다** — "없는 행을 지우려 하면 P2025로 던진다"는 이유가 `deleteMany`에서 사라진다
- [ ] **T6** `app/__tests__/entry-points.test.ts` — 가드 판정을 갈른다 (발견 14)
  - `requireUser`는 **사용자 소유 행만 만지는 Action**의 게이트로만 인정한다(그 목록을 이름으로 고정) /
    `invite/actions.ts` 면제를 **파일 단위에서 export 단위로** 좁힌다 / doc comment의 "다섯"과 Set의
    여섯을 맞추고 여섯째의 사유를 쓴다
  - ⚠️ **자기 "0건 아님" 가드를 함께 넣는다** — 이 파일이 조용해진 전례가 있다(2026-09-08 쿼리 수신자 검사)
- [ ] **T7** `createInvitation.email`에 `.email().max(320)` (발견 19) ·
      `app/(edit)/layout.tsx`가 사이드바에 셋만 `.map()`으로 넘긴다 (발견 23)
  - 검증: `lib/shell/nav.ts`의 `NavProject`가 반환 타입으로 강제된다(초과 프로퍼티 검사가 걸리는 모양)
- [ ] **T8** `pnpm typecheck && pnpm test`
- [ ] `——` `test:` → `fix:`
- [ ] **T9** `[manual]` 실물 확인 — `pnpm dev`에서 `/projects/<slug>/members`의 응답 본문에 `@`가 든
      원문 주소가 없는지 본다(`curl -s … | grep '@'`)
  - ⚠️ **이 한 줄이 감사가 못 한 검증이다**(정적 추론이었다)
- [ ] **T10** 문서 — `docs/DESIGN.md` §6.65(마스킹은 서버가 한다) · `CLAUDE.md`(디렉터리 구조의 두
      로더·두 컴포넌트 주석) · `/postmortem`
  - POSTMORTEM 축: **"문서가 단언한 통제가 배선되지 않았다"** — DESIGN이 "두 표 모두 마스킹"을
    말하는데 마스킹이 클라이언트에서 일어나 원문이 와이어에 있었다. 2026-09-05("경고는 문서에 있었는데
    배선이 지키지 않았다")과 같은 계열이고 그 항목의 grep이 이것을 못 잡았다는 것이 새로운 부분이다
- [ ] `——` 문서 커밋
- [ ] **T11** `/push` → `/merge`

---

## ship 5 — 외부 진입점 견고화 (발견 6 · 5 · 25 · 24)

⚠️ **이 목록에서 가장 무겁다** — 5번이 `lib/onboarding/message.ts`의 18갈래를 흔든다. 나머지 셋은 작다.

- [ ] **T1** 🔒 **가장 먼저: 발견 25의 측정** `[manual]`
  - 프로덕션에 `Host: evil.com` / `X-Forwarded-Host: evil.com`을 보내 앱이 그것을 받는지 본다
    (preview는 Vercel SSO 뒤라 `sso-api` 302가 온다 — **프로덕션에서 재야 한다**)
  - 결과가 "Vercel이 거른다"면 25번은 **수용**이고 T5가 사라진다. "앱까지 온다"면 `requestOrigin`에
    기대 호스트 허용 목록을 넣는 태스크가 생긴다(프로덕션 도메인 + dev 고정 preview + localhost)
- [ ] **T2** `/tdd interface`
  - `checkBearer`·`equalConstantTime`: **비ASCII 입력이 던지지 않고** `bad-token`/`false`를 낸다
    (현재 `RangeError` — findings §1.6이 재현 확정)
  - `checkRepoAccess`: 사용자 설치 목록에 없는 리포에 대해 **App 자격증명 호출이 0회**다
    (`probeRepo` mock의 호출 횟수로 검사한다 — `github-callback.test.ts`가 `exchangeCode` 미호출을
    단언하는 것과 같은 형)
  - 검증: 앞의 둘이 수정 전 red(던진다)
- [ ] **T3** 🔒 **비교 방식** — 추천은 **고정 길이 sha256 digest 비교**다
  - 그러면 길이 사전검사가 아예 사라지고 두 자리의 "같은 형"이 규칙 하나가 된다. 차선은
    `Buffer.byteLength`로 재는 것(변경이 두 줄이지만 규칙이 두 곳에 남는다)
  - ⚠️ **두 자리를 같은 커밋에 고친다** — `state.ts:77`이 `lib/push/auth.ts`를 "같은 형"으로 상호
    참조하므로 한쪽만 고치면 다른 쪽이 남고 주석이 거짓이 된다
  - 검증: `/api/pull`이 비ASCII Bearer에 **401**을 낸다(500이 아니다) / callback이 오염된 쿠키에
    `state-mismatch`로 착지한다
- [ ] **T4** `app/(edit)/projects/actions.ts` — `checkRepoAccess`의 순서를 뒤집는다 (발견 5)
  - 사용자 설치 목록을 먼저 읽고, 그 목록에 없으면 `probeRepo`를 부르지 않고 **한 갈래로** 거부한다
  - ⚠️ **`lib/onboarding/message.ts`의 갈래 정리가 같은 커밋이다** — `repo-not-installed`와
    `installation-forbidden`을 외부에서 구별할 수 없게 되면 그중 하나가 도달 불가가 된다.
    POSTMORTEM 2026-09-08("도달 불가한 오류 갈래를 겨냥한 테스트가 1년치 green이었다")이 정확히 이 함정이다
  - ⚠️ **`planRepoConnect`의 3중 검증을 약화시키지 않는다** — 순서만 바꾼다. 빈 목록을 통과로 읽지
    않는 fail-closed(`connect-plan.ts:44`)가 그대로여야 한다
  - 검증: 화면 문구가 여전히 사용자에게 유용하다(`[manual]` — 자기 리포로 온보딩을 한 바퀴)
- [ ] **T5** (T1 결과에 따라) `lib/github-connect/origin.ts`에 기대 호스트 허용 목록
- [ ] **T6** `auth.ts:95` — 로그를 `error.message`(+`type`)로 좁힌다 (발견 24)
  - ⚠️ **`noteAuthError`의 장애 판정을 깨지 않는다** — 그 판정은 `error.type`을 보므로 좁히는 대상은
    출력뿐이다(POSTMORTEM 2026-09-06)
- [ ] **T7** `pnpm typecheck && pnpm test`
- [ ] `——` `test:` → `fix:`
- [ ] **T8** 문서 — `docs/ARCHITECTURE.md` §6(시크릿 비교 규칙 한 줄) ·
      `docs/features/github-connect/design.md`에 순서 판정 한 줄 · `/postmortem`
  - POSTMORTEM 축: **"주석이 이유를 정확히 적었는데 재는 단위가 어긋났다"** — 길이 사전검사의 사유는
    맞았고 UTF-16 대 UTF-8만 틀렸다
- [ ] `——` 문서 커밋
- [ ] **T9** `/push` → `/merge`

---

## ship 6 — 헤더와 경계 bounds (발견 9 · 26)

- [ ] **T1** 🔒 **CSP 강도** — 추천은 **`Content-Security-Policy-Report-Only`부터**다
  - 이 앱은 인라인 스타일·인라인 스크립트를 Next가 만들어 넣으므로 enforce를 바로 켜면 화면이 깨질
    수 있고, 깨지는 방식이 조용하다. `frame-ancestors 'none'` + `Referrer-Policy: strict-origin-when-cross-origin` +
    `X-Content-Type-Options: nosniff`는 **깨질 여지가 없어 바로 enforce**한다
  - ⚠️ **`/invite/<token>` 때문에 `Referrer-Policy`가 이 셋 중 실질이 가장 크다**(findings 9)
- [ ] **T2** `next.config.ts`에 `headers()` — 위 셋 + CSP Report-Only
  - 검증: `pnpm build` 통과(`tsc`는 이 파일의 형태를 못 본다) / `[manual]` `curl -sI`로 응답 헤더 확인 /
    `[manual]` 로그인·번역·설정·초대 넷이 그대로 동작한다
- [ ] **T3** `app/api/pull/route.ts` — 순회 상한 + 요약에 "미처리" (발견 26)
  - 🔒 상한 값과 초과 시 동작: 추천은 **`take`로 자르고 요약에 `unprocessed` 수를 넣는다**(조용한
    누락을 시끄럽게 만드는 것이 요지다. 프로젝트가 그만큼 늘면 그때 cron 분할을 본다)
  - 검증: `selectPullTargets`가 상한을 인자로 받고 순수 판정으로 검사된다 / 상한 초과 시 응답에 그 수가 있다
- [ ] **T4** `pnpm typecheck && pnpm test && pnpm build`
- [ ] `——` `test:` → `feat:`
- [ ] **T5** 문서 — `docs/ARCHITECTURE.md`(응답 헤더 · cron 상한) · `CLAUDE.md`(`next.config.ts` 항목)
- [ ] `——` 문서 커밋
- [ ] **T6** `/push` → `/merge`

---

## DB 트랙 (발견 8 · 7 · 16) — 코드 0줄, 어느 ship과도 병렬

⚠️ **여기의 모든 쓰기는 사용자 승인이 앞에 있다.** 감사는 읽기만 했다.

- [ ] **D1** `[manual]` 🔒 **발견 8을 예방으로 닫을 수 있는지 실측**
  - `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;`가
    `postgres`로 통하는지 본다. **통하지 않을 것으로 본다** — `postgres`는 superuser가 아니고
    (`rolsuper=false`, 실측) `supabase_admin`의 멤버도 아니다
  - 통하면 prod·dev 둘 다 적용하고 끝. 통하지 않으면 **탐지로 간다** → D2
- [ ] **D2** `/db` 스킬에 **마이그레이션 뒤 `anon`·`authenticated` 권한 0 확인** 스텝이 실제로 있는지
      확인하고, 없으면 넣는다
  - CLAUDE.md는 이미 그 확인을 요구한다("새 마이그레이션 뒤에는 `anon` 권한이 0인지 확인한다") —
    ⚠️ **스킬 문서에 그 스텝이 없으면 그 문장은 지켜지지 않는다**(문서와 배선이 갈린 부류)
  - 쿼리는 `findings.md` §0의 것을 쓴다(`information_schema.role_table_grants`)
- [ ] **D3** 🔒 **발견 7 — 런타임 롤을 최소권한으로 바꾸는가**
  - 비용: 새 롤 + GRANT 설계 · `DATABASE_URL` 교체가 **`.env.local` 두 머신 · Vercel Production ·
    Preview 넷**을 동시에 건드린다(CLAUDE.md의 "개인키 하나 지웠더니 네 곳이 끊겼다"와 같은 형) ·
    마이그레이션은 계속 `postgres`여야 하므로 `DIRECT_URL`은 그대로 · Prisma 7 driver adapter가 그
    롤로 도는지 확인 필요
  - 얻는 것: SQL 주입·앱 침해의 폭발 반경 축소 + **나중에 RLS를 켤 때 그것이 실제로 동작한다**
    (지금 롤은 `rolbypassrls=true`)
  - **추천은 "지금 하지 않고 기록한다"** — PoC 단계에서 넷을 동시에 건드리는 변경의 위험이 얻는 것보다
    크고, GRANT가 이미 0이라 인터넷 노출은 닫혀 있다. **다만 "애플리케이션이 유일한 방어선"이라는
    서술을 이 롤 사실과 함께 적어 둔다** — 그 문장이 한 번 거짓이었다(POSTMORTEM 2026-09-09)
- [ ] **D4** 발견 16 수용 기록 — `Account`·`Session`의 평문 토큰 컬럼. 어댑터 기본값이고 컬럼 암호화는
      Auth.js Prisma adapter 밖이다. GRANT 0 + DB 자격증명이 전제 조건이라는 것을 `docs/ARCHITECTURE.md` §5.1에 한 줄
- [ ] `——` `docs(ARCHITECTURE): …` (+ `/db` 스킬을 고쳤으면 그 커밋)

---

## 판정 목록 (🔒 모음 — 위에서 참조한다)

| # | 판정 | 어디 |
|---|---|---|
| 3 | `@main` 참조를 태그·SHA·유지 중 무엇으로 | ship 3 T1 (**가장 먼저 띄운다** — 소비자 리포 넷이 따라온다) |
| 1 | `"__proto__"` 키를 출력에 내는가 / 에러로 떨어뜨리는가 | ship 1 T2 |
| 11 | 정규식 상한을 순수 함수·스키마·둘 다 중 어디에 | ship 1 T4 |
| 2 | 잎 모듈의 이름과 자리 | ship 2 T2 |
| 10 | 배열·문자열 상한 값 | ship 2 T3 |
| 2 | `checkFormat`의 null 3중 통과를 유지하는가 | ship 2 T5 |
| 4 | 라벨 생성 함수를 일반화하는가 / 형제를 두는가 | ship 4 T2 |
| 6 | digest 비교로 가는가 / `byteLength`로 재는가 | ship 5 T3 |
| 25 | 측정 결과에 따라 허용 목록을 넣는가 | ship 5 T1 → T5 |
| 9 | CSP를 Report-Only로 시작하는가 | ship 6 T1 |
| 26 | cron 상한 값과 초과 시 동작 | ship 6 T3 |
| 8 | 예방(default ACL)인가 탐지(`/db` 스텝)인가 | DB D1 |
| 7 | 최소권한 롤로 가는가 | DB D3 (**추천: 지금 하지 않는다**) |

## 수용 (고치지 않고 기록만)

- **발견 27** — `pnpm audit` 3건 전부 devDependency `prisma`의 전이 의존이고 런타임 도달 경로가 없다.
  수정 버전이 prisma 7.x에 없다(다음이 `8.0.0-rc.13`이고 CLAUDE.md가 RC를 금한다). **prisma 8 stable이
  나오면 다시 본다.**
- **발견 28** — `next-auth` beta는 CLAUDE.md가 이미 인정한 리스크다. ⚠️ **`@auth/core` 단일 인스턴스가
  강제되지 않는다는 부분은 새롭다** — 지금은 업스트림이 exact로 고정해 성립하고, 깨지면 세션 복호가
  조용히 쪼개진다. `pnpm.overrides`를 넣는 것은 **의존성 정책 변경**이라 요청 없이 하지 않는다.
- **발견 16** — DB 트랙 D4.
- **발견 22** — `.env.local`은 에이전트가 편집하지 않는다(CLAUDE.md). ⚠️ **사람이 지울 항목**:
  `ACTIVE_PROJECT_SLUG` · `VERCEL_OIDC_TOKEN` · 1행의 prod ref 주석.

## 이미 백로그에 있는 것 (여기서 중복하지 않는다)

**관리 콘솔의 자동 진단을 읽는 루틴이 없다** — `docs/features/README.md`의 살아 있는 백로그에 있다
(POSTMORTEM 2026-09-09에서 왔다). 이번 감사도 Vercel 설정과 GitHub App 스코프를 **CLI·자격증명 부재로
못 봤으므로**(findings §6) 그 항목의 근거가 하나 늘었다 — 그 표에 이 감사를 근거로 추가한다.
