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

---

_이 아래에 새 항목을 추가한다._
