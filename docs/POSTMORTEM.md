# POSTMORTEM

회귀·버그·비자명한 함정의 회고를 누적한다. **append-only** — 항목을 지우지 않는다.

**쓰기**: `/postmortem`이 전담한다. **읽기**: `/implement`·`/refactor`·`/code-review`가 착수 전 변경 영역으로 grep한다. 쓰기만 하고 안 읽으면 죽은 로그가 되므로 양방향이 규칙이다.

## 형식

```
### YYYY-MM-DD — <한 줄 증상>

- **영역**: <파일·모듈>
- **증상**: 관측된 잘못된 동작
- **근본 원인**: 왜 그렇게 됐는지 (표면 원인 아님)
- **그물**: 무엇이 잡았는가 / 무엇이 놓쳤는가
- **재발 방지**: 같은 함정을 다른 곳에서 찾는 grep 패턴 또는 전수 대상
```

---

### 2026-08-31 — 모듈 로드 시점에 환경변수를 요구해 CI가 red

- **영역**: `prisma.config.ts`, `lib/db.ts`, `.github/workflows/ci.yml`
- **증상**: 커밋 `34c0b53` 푸시 후 CI가 `prisma generate` 스텝에서 실패. `PrismaConfigEnvError: Cannot resolve environment variable: DIRECT_URL`. 로컬에서는 `pnpm db:generate`가 정상이라 재현이 안 되는 것처럼 보였다.
- **근본 원인**: "generate는 DB에 접속하지 않으니 접속 URL이 필요 없다"고 판단해 CI 스텝에 환경변수를 주지 않았다. **접속은 하지 않지만 `prisma/config`의 `env()`가 config 파일 로드 시점에 변수 *존재*를 요구한다** — 실행이 시작되기도 전에 던진다. 로컬은 `.env.local`이 있어 통과하므로 로컬/CI 환경 차이가 그대로 함정이 됐다.
- **그물**: 
  - 잡은 것: 없음. `/push` 1단계 로컬 게이트는 `.env.local`이 있는 환경에서 돌아 통과했다.
  - 놓친 것: **`/push` 6단계가 의도적으로 논블로킹**(CI run URL만 보고하고 기다리지 않음)이라 하네스가 구조적으로 못 잡는다. 이 설계는 세션을 잡지 않으려는 것이라 유지하지만, 그 대가로 **CI 실패는 항상 사후 발견**임을 알고 있어야 한다.
- **재발 방지**:
  - grep: `grep -rn -E '\benv\(|requireEnv\(' --exclude-dir=node_modules --exclude-dir=generated` → **호출부가 모듈 최상위에서 평가되는지** 본다. 함수 안에 있어도 그 함수를 최상위 `const`가 부르면 같은 문제다.
  - **이 grep이 실제로 두 번째 사례를 잡았다**: `lib/db.ts`의 `export const prisma = ... ?? createClient()`가 최상위 평가라 import만으로 던졌다. 아무도 import하지 않아 드러나지 않았을 뿐이고, CI에 `pnpm build`를 넣거나 테스트가 import하면 즉시 재발할 상태였다. `getPrisma()` 지연 생성으로 고쳤다.
  - **규칙**: 서버 모듈에서 환경변수를 읽는 코드는 **모듈 최상위가 아니라 함수 안**에 둔다. 최상위 평가는 "파일을 읽기만 해도 죽는다"를 뜻한다.
  - CI에 `.env`가 없다는 전제를 잊지 않는다. CI 스텝이 새로 추가될 때마다 그 스텝이 환경변수를 요구하는지 확인한다.

- **🔁 재발 (2026-08-31, §4b 구현 중)**: `scripts/push-local.ts`가 `arg("project", requireEnv("ACTIVE_PROJECT_SLUG"))`을 썼다. **기본값 인자가 먼저 평가되므로** `--project skillflo`를 명시해도 환경변수가 없으면 죽고, 메시지가 "환경변수가 없다"라서 플래그를 줬는데 왜 죽는지 가리키지 않는다. 위 grep(`requireEnv\(`)이 잡을 수 있는 형태였는데, **이번엔 "함수 안이냐"만 봤고 "인자 위치에서 평가되느냐"는 안 봤다.**
    - 이 항목을 소환해 `lib/push/guard.ts`는 env를 인자로 받게 설계했으면서 같은 커밋의 스크립트에서 밟았다 — 소환이 설계에는 반영됐지만 배선 코드까지 훑지 않았다.
    - **grep 보강**: `grep -rn -E '\w+\([^)]*,\s*requireEnv\('` → **기본값·폴백 자리에 있는 `requireEnv`는 전부 의심한다.** 고치는 형태는 `arg("x", "") || requireEnv("X")`처럼 앞을 먼저 읽는 것.
    - 전수 확인 결과 나머지 호출부(`app/api/push/route.ts`, `app/(edit)/actions.ts`, `app/(edit)/keys/page.tsx`, `lib/db.ts`)는 전부 함수 안의 직접 호출이라 안전하다.

---

### 2026-08-31 — process.exit()이 파이프 stdout을 잘라먹고, exitCode로 바꾸니 조기 종료가 사라짐

- **영역**: `scripts/ingest.ts`, `scripts/scan.ts`
- **증상**: `pnpm ingest <skillflo> --json`의 출력이 **73KB 지점에서 잘려** JSON 파싱이 실패했다. bugshot-2(작은 출력)에서는 재현되지 않았다. 고친 뒤에는 JSON 문서가 **두 개** 나왔다.
- **근본 원인**: 두 단계다.
  1. Node에서 **파이프로 나가는 stdout은 비동기**다. `console.log` 직후 `process.exit()`을 부르면 버퍼에 남은 데이터가 버려진다. 터미널(TTY)로는 동기라서 육안 확인에서는 절대 안 보인다 — 출력이 파이프 버퍼(~64KB)를 넘어야만 드러난다.
  2. `process.exit()`을 `process.exitCode`로 바꾸면서 **그 호출이 겸하던 조기 종료가 사라졌다.** `--json` 분기가 출력 후 그대로 아래 사람용 출력으로 흘러 문서가 둘이 됐다. 종료 코드 설정과 제어 흐름을 한 호출이 겸하고 있었다는 걸 못 봤다.
- **그물**:
  - 잡은 것: 없음. 테스트는 순수 함수만 덮고 CLI는 안 덮는다.
  - 놓친 것: **작은 리포로만 확인했다.** bugshot-2는 12행이라 버퍼에 다 들어갔고, skillflo(8676행)에서만 드러났다. 규모가 다른 대상으로 돌려보는 것이 유일한 그물이었다.
- **재발 방지**:
  - grep: `grep -rn 'process\.exit(' scripts/` → **결과를 stdout에 쓴 뒤의 `process.exit`은 전부 의심**한다. 사용법·에러 안내(stderr 짧은 출력)는 안전하다.
  - **규칙**: CLI가 stdout에 대량 출력을 하면 `process.exitCode`만 세우고 자연 종료를 기다린다. 바꿀 때는 그 `exit`이 제어 흐름도 겸하는지 확인한다(if/else나 early return으로 명시).
  - **규모가 다른 대상으로 검증한다.** 이 프로젝트에서 실전 검증이 잡은 결함이 이걸로 6건째다(스캐너 4건 + CLI 2건). 작은 픽스처는 이 계열을 원리적으로 못 잡는다.

---

### 2026-08-31 — 레이아웃 인증 검사가 데이터 노출을 막지 못했다

- **영역**: `app/(edit)/layout.tsx`, `middleware.ts`
- **증상**: 세션 없이 `GET /keys`를 요청하면 **응답 1.3MB에 1446키 전체가 들어 있었다.** 화면에는 로그인 버튼만 보였다. OAuth 값을 채우고 로그인 흐름을 확인하다가 `curl`로 발견했다.
- **근본 원인**: **Next.js App Router는 레이아웃과 페이지를 병렬로 렌더한다.** 레이아웃이 세션이 없을 때 `children`을 쓰지 않아도 **페이지는 이미 실행된다** — DB를 조회하고 RSC 페이로드를 만들어 응답에 직렬화된다. 레이아웃의 조건부 반환은 "표시하지 않음"이지 "차단"이 아니다.
  - 내가 `layout.tsx` 주석에 "미들웨어가 아니라 레이아웃에서 막는다 — 미들웨어는 Edge라 `lib/db.ts`를 못 문다"고 적어뒀는데, **미들웨어는 db를 물 필요가 없다**(JWT 토큰만 확인한다). 잘못된 근거로 잘못된 층을 골랐고, 그 근거를 문서에 남겨 스스로를 설득했다.
- **그물**:
  - 잡은 것: 없음. `pnpm build`·`typecheck`·테스트 전부 green이었고, **브라우저로 보면 로그인 화면만 보여 눈으로는 절대 안 보인다.**
  - 놓친 것: 인증을 "화면에 안 보이면 됐다"로 검증했다. 5a 리포트에 "보호된 셸"이라고 썼지만 응답 본문을 본 적이 없었다.
- **재발 방지**:
  - **규칙: 인증 차단은 미들웨어에만 의존한다.** 레이아웃·페이지의 검사는 2차 방어이고, 레이아웃에서는 `redirect()`를 던져야 응답이 중단된다(조건부 렌더는 안 된다).
  - **새 보호 라우트를 추가하면 `middleware.ts`의 `matcher`에 추가한다.** 빠뜨리면 그 라우트가 무방비다.
  - **검증 방법: 화면이 아니라 응답 본문을 본다.** `curl -s <보호 라우트> | grep <민감 데이터>`로 0건을 확인한다. 크기도 본다 — 1.3MB는 로그인 화면일 수 없다.
  - grep: `grep -rn 'if (!session' app/` → 조건부 렌더로 막고 있는 곳이 있으면 `redirect()`로 바꾼다.

---

### 2026-08-31 — 외부 계약 페이로드를 리터럴로 조립해 필수 필드가 늘어도 컴파일러가 침묵했다

- **영역**: `scripts/push-local.ts`, `lib/push/plan.ts`(`PushPayload`)
- **증상**: `/api/push` 페이로드에 필수 필드 둘(`projectSlug`·`commitAt`)을 추가했는데 `pnpm typecheck`도 `pnpm test`도 green이었다. `pnpm push:local`을 실제로 돌렸다면 서버가 **400 `invalid payload`** 를 뱉었을 것이다 — 스캔·적재를 다 끝낸 뒤 마지막 POST에서.
- **근본 원인**: 페이로드 생산자가 `const payload = { ... }` **리터럴**이라 `PushPayloadType`과 아무 관계가 없었다. 스키마(zod)와 소비자(`applyPush`)는 타입으로 이어져 있는데 **생산자만 끊겨 있었고**, 그래서 계약이 넓어져도 컴파일러가 붙잡을 지점이 없다. `JSON.stringify`가 그 경계를 통과시키므로 런타임까지 조용하다.
- **그물**:
  - 잡은 것: `/code-review`. diff에서 "필수 필드를 늘렸는데 이걸 만드는 쪽은 어디인가"를 물어 찾았다.
  - 놓친 것: **`typecheck`·`test` 둘 다.** 테스트가 순수 함수만 덮고 CLI는 안 덮는다는 공백(2026-08-31 `process.exit` 항목과 같은 공백)이 여기서 다시 드러났다.
- **재발 방지**:
  - **규칙: zod 스키마의 `z.infer` 타입을 생산자에 붙인다.** 소비자에만 붙이면 계약의 절반만 검사된다. `const payload: PushPayloadType = { ... }` 한 줄이 다음번 필드 추가를 컴파일 에러로 만든다.
  - grep: `grep -rn "z.infer" lib/` 로 스키마 타입을 나열하고, **각 타입이 생산자에도 붙어 있는지** 본다.
  - **전수 확인 결과 같은 패턴이 하나 더 열려 있다**: `SaveInputType`(`lib/keys/save.ts`)이 export되지만 아무도 쓰지 않는다. 생산자인 `components/translation-input.tsx`가 `saveTranslation({ keyId, localeCode, value })`를 리터럴로 넘기고 Action 시그니처가 `raw: unknown`이라 타입이 걸리지 않는다. **`SaveInput`에 필수 필드가 늘면 화면이 런타임 `invalid input`으로 조용히 깨진다.** (Action이 `unknown`을 받는 것 자체는 의도된 설계다 — 직렬화 경계라 zod 재검증이 필요하다. 붙일 곳은 호출부다.)
  - 7단계에서 GitHub Actions 워크플로가 같은 페이로드를 YAML/셸로 조립한다 — **거기엔 컴파일러가 아예 없다.** `push-local.ts`를 그대로 호출하게 만들어 생산자를 하나로 유지하는 편이 낫다.

---

### 2026-09-01 — 라이브러리가 이미 하는 인코딩을 또 해서 조용한 404를 만들었다

- **영역**: `lib/github.ts`, `lib/pull/payload.ts`(`encodeRefPath`), `docs/ARCHITECTURE.md` §3
- **증상**: `pnpm smoke:github bugshot-2`가 `실패: base 브랜치가 없다: dev`로 죽었다. 브랜치는 존재하고, 같은 App 토큰으로 몇 분 전 임시 스크립트가 같은 ref를 성공적으로 읽었다.
- **근본 원인**: `encodeRefPath("heads/dev")`가 `heads%2Fdev`를 만들어 octokit에 넘겼고, **octokit이 그 값을 다시 인코딩해** `.../git/ref/heads%252Fdev`가 됐다. GitHub은 그걸 리터럴 ref 이름으로 읽어 404를 준다. 실측:

  ```
  ref="heads/dev"   → OK  (octokit이 만든 URL: .../git/ref/heads%2Fdev)
  ref="heads%2Fdev" → 404 (.../git/ref/heads%252Fdev)
  ```

  **문서가 다른 전제로 쓰였다.** ARCHITECTURE §3 함정의 "`l10n/sync`의 `/`는 URL 인코딩이 필요하다"는 raw `fetch` 기준인데, CLAUDE.md 스택 표는 `octokit`을 쓰기로 정했다. 두 문서가 서로 다른 HTTP 층을 가정하고 있었고, 구현이 §3을 성실히 따르다가 **함정을 스스로 만들었다.** 게다가 `encodeRefPath`의 테스트에는 "이미 인코딩된 값을 두 번 인코딩하지 않는다 — `%2F`가 `%252F`가 되면 조용히 404다"라는 케이스가 있었다 — 위험을 정확히 알면서 호출부에서 그 위험을 실현했다.

  **이 프로젝트는 같은 원리를 이미 문서화하고 있었다**: ARCHITECTURE §7의 "이미 인코딩된 값을 두 번 인코딩하면 `%40`이 `%2540`이 되어 조용히 인증 실패한다"(DB 접속 문자열). 원리가 같은데 그 서술이 **Supabase 절에 있어서** GitHub API 절을 작업할 때 소환되지 않았다.
- **그물**:
  - 잡은 것: **`scripts/smoke-github.ts`.** 1c에서 이 스모크를 만든 것이 유일한 이유로 즉시 드러났다.
  - 놓친 것: `pnpm typecheck`·`pnpm test`(284건) 전부 green이었다. `encodeRefPath`의 단위 테스트 5건은 **함수가 올바른지**만 봤고 **그 함수를 불러야 하는지**는 검사 대상이 아니다. 순수 함수 테스트가 원리적으로 못 잡는 부류다.
  - 더 나쁜 경우를 놓칠 수 있었다: 실패한 ref가 base가 아니라 `l10n/sync`였다면 404 → `null` → "브랜치 없음"이 **정상 입력**이라 아무도 던지지 않고, `createRef`가 실패할 때까지 오진이 이어진다.
- **재발 방지**:
  - **규칙: HTTP 클라이언트가 경로 파라미터를 인코딩하는지 확인하기 전에 직접 인코딩하지 않는다.** octokit·fetch·URL 생성자가 각각 다르게 처리한다. 확인 방법은 문서가 아니라 **실측**이다 — 성공/실패 두 값을 모두 넘겨보고 `error.request.url`을 본다.
  - grep: `grep -rn "encodeURIComponent\|encodeURI(\|%2F" lib/ app/ scripts/` → **라이브러리에 넘기는 값인지, 우리가 문자열로 조립하는 URL인지** 가른다. 전수 확인 결과 남은 사용처는 `lib/keys/view.ts`의 `buildPermalink` 하나이고 **안전하다** — 브라우저용 URL을 문자열로 직접 만들므로 우리가 인코딩해야 맞고, 세그먼트별로 나눠 `/`를 살린다.
  - **문서의 함정 서술에 전제 층을 적는다.** ARCHITECTURE §3의 인코딩 항목을 "octokit이 담당한다 — 직접 인코딩하면 이중 인코딩된다"로 고쳤다. 같은 이유로 §7의 URL 인코딩 항목은 "접속 문자열(문자열 조립)"이라는 전제가 이미 명시돼 있어 유지한다.
  - **I/O 껍데기에는 스모크를 만든다.** 단위 테스트가 원리적으로 못 보는 층이고, 이 함정을 잡은 것이 그것뿐이다. `lib/github.ts`가 `server-only`를 붙이지 않은 이유도 이것이다 — 붙이면 스모크가 프로덕션 경로가 아닌 사본을 검증한다.

---

_이 아래에 새 항목을 추가한다._
