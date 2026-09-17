---
description: dev에 푸시 = Vercel preview 배포. 로컬 검증 게이트 + dev 마이그레이션 + 문서 신선도 + Codex 미러 게이트를 통과한 것만 나간다. 프로덕션 배포는 /merge다.
---

`dev`에 푸시한다. **이 푸시는 프로덕션 배포가 아니다** — Vercel preview 배포이고, 프로덕션으로 보내는 것은 `/merge`(dev→main PR)다.

> **⚠️ 그렇다고 게이트를 느슨하게 하지 않는다.** preview가 깨지는 것도 비용이고, 무엇보다 **여기서 통과한 커밋이 그대로 `/merge`의 PR이 된다** — dev에 쌓인 red를 머지 직전에 발견하면 되돌릴 커밋이 여러 개다. 1단계 로컬 게이트는 그때와 같은 검사를 지금 돌리는 것이다.
>
> **프로덕션 앞의 게이트는 `/merge`의 PR CI로 옮겨갔다** (2026-09-04 브랜치 분리). 브랜치가 하나였을 때는 이 스킬의 1단계가 유일한 방어선이었다. GitHub 브랜치 프로텍션은 여전히 없다(Free 플랜 + private) — 서버가 main 직접 push를 막지 않으므로 **`/merge`를 우회해 main에 푸시하지 않는다.**

## 절차

### 0. 상태 점검 (병렬)

- `git branch --show-current` — `dev`가 아니면 중단하고 왜 다른 브랜치에 있는지 보고. **`main`이면 특히 중단한다** — main에 직접 커밋·푸시하는 경로는 없다 (프로덕션이 `/merge`의 PR CI를 건너뛴다)
- `git status --porcelain` — 미커밋 변경
- `git worktree list` — **체크아웃이 몇 개인가**
- `git log @{u}..HEAD --oneline` — 푸시될 커밋
- `git log -1 --stat` — 마지막 커밋 규모

**푸시될 커밋이 없고 미커밋 변경도 없으면** "푸시할 것 없음" 알리고 종료.

#### 0b. 워크트리 소유권 게이트 (⚠️ 2026-09-16 신설 — 실제로 밟았다)

**추적 중인 미커밋 변경(`M`·`D`·`A`·`R`) 중 이번 세션이 건드리지 않은 것이 하나라도 있으면 중단한다.**

⚠️ **미추적(`??`)은 중단시키지 않고 보고만 한다** — 스테이지하지 않는 한 커밋에 들어갈 수 없고,
그 유일한 경로(`git add -A`)는 2단계가 금지한다. 막는 대상은 **내 커밋에 딸려 들어갈 수 있는 것**이지
"트리에 남의 것이 있다"가 아니다. (이 구분이 없던 첫 판은 `?? docs/features/publish-modal/` 하나로
자기 자신을 막았다 — 2026-09-16.)

판정은 기억이 아니라 **목록 대조**다 — 이번 세션에서 편집한 경로를 세고, `git status --porcelain`의
각 줄이 그 안에 있는지 본다. 하나라도 밖이면 **다른 창구가 같은 체크아웃에서 작업 중**이다(Codex ·
다른 Claude 세션 · IDE의 미저장 자동 포맷).

⚠️ **`git worktree list`가 여러 개라고 안심하지 않는다** — 2026-09-16에 "Codex가 다른 워크트리에서
작업한다"는 말을 듣고 겹치지 않는다고 판단했는데, **실제로는 워크트리가 하나였고** 같은 체크아웃에서
`lib/adapters/yaml-catalog.ts` 넷이 `M` 상태였다. **말이 아니라 `git worktree list` 출력이 근거다.**

중단할 때 보고할 것: 남의 것으로 보이는 경로 목록 · `git log --oneline -3`(그쪽이 이미 커밋한 것이
있나) · **"그 작업이 커밋되면 다시 부르라"**.

⚠️ **1단계 게이트도 같이 막힌다** — 그 트리에서 잰 `test`·`build` 숫자는 남의 저장 중간 상태를 포함하므로
보고에 쓰지 않는다. 중단 리포트에 숫자를 적지 않는 것이 규칙이다.

⚠️ **이것이 2단계의 "허락을 구하지 않는다"보다 앞선다.** 그 규칙은 **내 미커밋 변경**을 전제하고,
남의 것을 내 이름으로 커밋하는 것은 그 전제 밖이다.

### 1. 로컬 검증 게이트 (⚠️ 건너뛰기 금지)

```
pnpm typecheck
pnpm test
pnpm build
```

⚠️ **이 셋은 HEAD가 아니라 워크트리를 잰다.** 0b를 지나지 않고 돌리면 **남의 미완성 편집을 포함한
결과**가 나온다 — 2026-09-16에 전체 스위트가 한 번 red였고 원인이 다른 창구의 저장 중간 상태였다.
그 숫자를 "게이트 통과"의 근거로 쓰면 안 된다.

**`pnpm build`가 셋 중 유일하게 RSC 경계를 본다.** `tsc`는 `"use client"` 누락, 서버 컴포넌트에서 클라이언트 훅 사용, Server Action 직렬화 위반을 **잡지 못한다** — `next build`만 잡는다. 콜드 5초 / 웜 2초라 게이트에 넣는 비용이 무시할 수준이다.

**셋 중 하나라도 실패하면 즉시 중단한다.** 실패를 고치는 건 이 스킬의 일이 아니다 — 무엇이 실패했는지 보고하고 사용자 지시를 기다린다. "PR CI가 잡아줄 것"이라는 이유로 넘기지 않는다: 그 CI는 여러 커밋이 쌓인 뒤에 돌고, 거기서 red가 나오면 무엇이 깼는지 특정하는 비용이 지금의 3분보다 크다.

### 2. 미커밋 변경 커밋

미커밋 변경이 있으면 바로 커밋한다. `/push` 실행 시점에 커밋 의도가 있다고 간주. 변경 파일을 stage하고 **영문 커밋 메시지**로 커밋한다. 허락을 구하지 않는다.

- ⚠️ **0b를 통과한 변경만이다** — 이번 세션이 건드리지 않은 파일은 여기 오기 전에 중단됐다.
- ⚠️ **경로를 하나씩 명시해 stage한다.** `git add -A`·`git add <디렉터리>`는 **그 아래 남의 파일까지 함께** 싣는다 — 0b가 막지 못하는 유일한 구멍이 이 습관이다(2026-09-16에 `git add -A components lib messages`로 `lib/` 전체를 넣었고, 마침 그 시점에 남의 변경이 `lib/adapters/`에 있었는데 운으로 안 섞였다).
- **예외 — 즉시 중단**: `.env`·`*.pem`·크레덴셜 파일이 staged면 경고하고 멈춘다. `.gitignore`에 있지만 `-f`로 강제 추가된 흔적일 수 있다.

### 3. 마이그레이션 게이트 — **dev DB만** (⚠️ 이 프로젝트 특화)

```
git diff @{u}..HEAD --name-only -- prisma/
```

**푸시될 커밋에 마이그레이션이 포함돼 있으면 dev DB에 적용돼 있어야 한다** — preview 배포가 dev DB를 보므로, 안 적용된 채 푸시하면 preview가 없는 컬럼을 조회한다.

```
pnpm db:status     # dev를 본다
```

- 미적용이면 `/db`로 돌아가 적용한다. 보통 `/db`가 이미 `pnpm db:migrate`로 적용해 뒀다.
- 마이그레이션이 없으면 이 단계를 한 줄로 스킵 보고.

**⚠️ `pnpm db:deploy`(프로덕션 반영)는 이 스킬이 하지 않는다.** dev push는 프로덕션에 아무것도 배포하지 않으므로 여기서 prod 스키마를 넓힐 이유가 없고, 넓히면 **프로덕션이 코드보다 앞서 있는 창을 필요 이상으로 길게 연다.** additive-first의 그 단계는 `/merge` 1단계다 (머지 직전 = 프로덕션 배포 직전).

- 다만 **마이그레이션이 포함된다는 사실은 리포트에 남긴다** — `/merge`가 그것을 받아 `db:deploy`를 요구한다.

### 4. 문서 신선도 + 미러 게이트

⚠️ **트랙이 둘이고 서로 독립이다** (2026-09-13 정정, Codex 하네스 검토 지적 5).

| 트랙 | 무엇 | 언제 |
|---|---|---|
| **조건부** — 4a → 4b → 4d | 문서 신선도. diff에 걸린 문서만 읽는다 | 트라이아지 후보가 있을 때만 |
| **상시** — 4c | `pnpm sync:agents:check` (기계 검사) | **항상.** 트라이아지 결과와 무관하다 |

전에는 4a의 탈출구가 "바로 5단계"라 **문서 후보가 0개인 대부분의 푸시에서 4c를 건너뛰는 것으로 읽혔다** — 그런데 4c 본문은 "트라이아지와 무관하게 항상"이라고 적혀 있었다. 둘 중 하나는 반드시 틀린 지시였다.

**4a. 트라이아지 (1회, 가볍게).** `git diff @{u}..HEAD`를 **한 번** 훑어 트리거에 걸리는 문서를 후보로 매핑한다. 이 단계에서 문서를 읽지 않는다.
- **후보 0개면 4b·4d를 건너뛰고 4c로.** 대부분의 푸시가 여기서 통과한다. **4c는 건너뛰지 않는다.**

트리거:
- **기능 추가/삭제, 역할·권한표 변경, 비범위 항목을 범위로 끌어들임, 설계 결정이 뒤집힘, `docs/PRODUCT.md` §10이 결정됨 → docs/PRODUCT.md** (제품 판정의 정본이다 — `lib/auth/`·`app/`·`prisma/schema.prisma`의 변경이면 자주 걸린다)
- **파일·디렉터리를 새로 만들거나 옮김, 새 함정을 주석으로 남김 → docs/DIRECTORY.md** (⚠️ 없는 파일을 가리키는 트리가 되면 그 문서가 거짓이다)
- **`/feature`로 시작한 기능이 끝남 → 결론을 정본으로 올리고 `docs/features/<slug>/`를 지운다** (근거 기록을 쌓아 두지 않는다 — `git log`가 든다)
- **`lib/` 아래 코어 모듈 변경** — `lib/adapters/`·`lib/githash.ts`·`lib/github.ts`·`lib/github-connect/`·`lib/db.ts`·`lib/env.ts`·`lib/failure.ts`·`lib/scan/`·`lib/push/`·`lib/pull/`·`lib/import/`·`lib/keys/`·`lib/surfaces/`·`lib/auth/`·`lib/cli/`·`lib/survey/`·`lib/onboarding/`·`lib/i18n/`·`lib/shell/`·`lib/home/`·`lib/settings/`·`lib/sync/`·`lib/credentials/`·`lib/session-revocation/`·`lib/login-link/`·`lib/account-connect/`·`lib/account/`·`lib/upload/`·`lib/projects/`·`lib/publish/`·`lib/signin/`·`lib/routes.ts`·`lib/locale-code.ts`·`lib/relative-time.ts`·`lib/tone.ts`, `prisma/schema.prisma`, `middleware.ts` (⚠️ **이 목록은 `docs/ARCHITECTURE.md` 머리의 목록과 같아야 한다** — 2026-09-13 전까지 세 곳이었고 `/doc-check`이 네 번에 걸쳐 갈린 것을 잡았다. CLAUDE.md 쪽 사본을 없애 둘로 줄였다) — 또는 새 불변식·함정 발견, 인증 경로 변경 → **docs/ARCHITECTURE.md**
  - ⚠️ **이 목록은 실제 디렉터리와 어긋나기 쉽다.** `lib/export.ts`가 어댑터로 흡수된 뒤에도 트리거가 그 이름을 가리키고 있어서, `lib/push/`의 정책 반전(strict)이 ARCHITECTURE §5.5를 낡은 채로 통과시켰다. **`lib/` 하위에 새 디렉터리가 생기면 이 줄에 추가한다.**
- **코어 원칙·정책이 뒤집힘** (번역값 소유권, export 결정성, 인증 경계, 병합 없음의 해석) → **CLAUDE.md 코어 원칙 절 + docs/ARCHITECTURE.md §0 둘 다**
  - 정책 반전은 한 문서만 고치면 나머지가 **반대 불변식을 가르친다.** 뒤집기 전 서술을 grep해 전수로 찾는다 (예: strict 전환 때 `DO NOTHING`·"절대 건드리지 않는다")
- `package.json` scripts·의존성 변경, 새 디렉터리, 브랜치·배포 방식 변경, 스킬 라인업 변경, 새 컨벤션·게이트웨이 → **CLAUDE.md**
- **코드에서 새 `process.env.*`를 읽음** → **.env.example** (⚠️ diff에 `process.env`가 보이면 무조건 확인한다. 빠지면 새 체크아웃·Vercel 재설정에서 원인 불명으로 죽는다)
- `.github/workflows/*.yml`·`.npmrc`·`postcss.config.mjs`·`components.json` 변경 → **CLAUDE.md의 해당 섹션**
- **`lib/adapters/**`·`lib/survey/**` 변경 → docs/ARCHITECTURE.md §1.9 + `pnpm adapter-survey` 재실행** (아래 4d)
- `app/globals.css` 토큰 변경, 새 raw 색 도입, `components/ui/` 추가, `lib/utils.ts` 변경 → **docs/DESIGN.md**
- 기술 선택·버전 변경, 개발 명령 변경, 브랜치·배포 방식 변경 → **README.md** (CLAUDE.md의 요약 미러라 같은 트리거에 같이 걸린다)
- **`lib/credentials/**`·`lib/session-revocation/**`·`lib/login-link/**` 변경, 암호화 키 env 추가·의미 변경, `pnpm credentials:*`·`test:credentials:postgres`의 동작 변경 → docs/OPERATIONS.md** (⚠️ **"나중에 다시 실행할 절차"의 정본이다.** 절차가 낡으면 그걸 발견하는 시점이 **키를 잃은 뒤**다 — 그때 PII 키면 회원 이메일·이름을 복구할 수 없다)
- **`.github/actions/**` 변경, `lib/onboarding/workflow.ts`가 만드는 YAML 변경, action `inputs`·red 조건 변경, 태그(`malmoi-i18n-push-v1`) 릴리스 → docs/ACTIONS.md** (⚠️ **외부 계약이다** — 남의 리포가 이 문서를 보고 붙인다. 이 스텝에 대상 리포의 `secrets.PUSH_TOKEN`이 들어가므로 참조·권한 서술이 틀리면 남의 리포의 보안 경계가 틀어진다)

**4b. 후보 정밀 검사.** 걸린 문서만 실제로 읽고 대조한다.
- **docs/DESIGN.md** — 토큰 값·대비 함정·mono 표면·라이트 단일 강제 장치가 `app/globals.css`·`lib/utils.ts`와 맞는지. 새 raw 색을 늘렸으면 §6.2에 등재한다. prefix `docs(DESIGN): ...`
- **docs/PRODUCT.md** — 역할·권한표·범위·비범위·설계 결정이 코드와 맞는지. §10 "아직 안 정한 것"에서 결정된 항목은 본문으로 올리고 목록에서 뺀다. prefix `docs(PRODUCT): ...`
- **docs/ARCHITECTURE.md** — §0 불변식 열하나가 코드와 맞는지, 함정·계약이 실제 구현과 맞는지. `(미구현)` 표시가 남아 있는데 구현됐으면 제거하고 실제 동작으로 갱신. prefix `docs(ARCHITECTURE): ...`
- **docs/DIRECTORY.md** — 트리가 실제 파일과 맞는지(없는 파일·새 파일·옮긴 파일). prefix `docs(DIRECTORY): ...`
- **CLAUDE.md** — 명령어 표, 스택 버전, 브랜치·배포, 스킬 라인업, 문서 지도. prefix `docs(CLAUDE): ...`
- **.env.example** — 코드가 읽는 변수가 전부 있는지(미구현 기능용 선등록 변수는 잉여가 아니다). 주석으로 무엇에 쓰는지·틀리면 어떻게 죽는지 남긴다. prefix `chore(env): ...`
- **README.md** — 스택 한 줄·명령어 표·브랜치 정책이 CLAUDE.md와 맞는지. prefix `docs(README): ...`
- **docs/OPERATIONS.md** — 키 목록·회전·복구·전면 재발급 절차가 `lib/credentials/`·`.env.example`과 맞는지. **절차의 명령을 실제로 돌리지는 않는다**(프로덕션 자격증명을 건드린다) — 명령 이름·인자·순서·전제만 대조한다. prefix `docs(OPERATIONS): ...`
- **docs/ACTIONS.md** — 워크플로 예시가 `.github/actions/malmoi-i18n-push`의 실제 `inputs`·red 조건과 맞는지, **참조가 불변 태그인지**, `permissions` 서술이 맞는지(`pull-requests: read`가 없으면 열린 PR 경고가 조용히 죽는다). `lib/onboarding/workflow.ts`가 만드는 YAML과 문서 예시가 **같은 것을 말하는지** 대조한다. prefix `docs(ACTIONS): ...`

발견 시 확인 없이 바로 Edit으로 반영하고 **문서별 별도 커밋**. 변경 불필요하면 건너뜀.

**⚠️ 문서를 고쳤으면 1단계 게이트를 다시 돌린다** — 문서 커밋이 코드에 영향을 줄 일은 없지만, 이 시점의 HEAD가 배포될 HEAD이므로 게이트가 통과한 상태와 배포되는 상태가 같아야 한다.

**4c. Codex 미러 게이트 (기계 검사).** 트라이아지와 무관하게 항상 `pnpm sync:agents:check`.
- 통과 → 한 줄 보고.
- 드리프트 → `pnpm sync:agents` 재생성 후 `docs(AGENTS): sync codex mirror` 커밋을 얹고 계속 (순수 생성물이라 확인 불필요).
- 스크립트가 **에러**로 죽으면 중단하고 원인 보고. 미러는 생성물이므로 `AGENTS.md`·`.agents/skills/`를 직접 편집해 맞추지 않는다.
- ⚠️ **이 재생성은 `.agents/skills/`에서 orphan을 재귀 삭제한다.** 2026-09-13부터 그 대상이 **`source-command-*`로 좁혀졌다** — 전에는 손으로 둔 Codex 전용 스킬까지 지웠고, 이 단계가 확인 없이 도는 자리라 사람 눈을 한 번도 안 지났다 (`scripts/__tests__/sync-agents.test.ts`가 범위를 고정한다).

**4d. 어댑터 실측 재측정 (사람 판단 — 사용자에게 묻는다).**

`lib/adapters/**`·`lib/survey/**`에 실질 변경이 있으면 `docs/ARCHITECTURE.md` §1.9의 숫자가 낡았을 수 있다. **이 판단을 자동으로 내리지 않는다** — 실행이 리포 129개 clone에 ~4분이고 네트워크·GitHub 가용성에 묶여 있어 푸시를 막을 게이트로 쓸 수 없다.

- 변경이 **탐지 규칙·정렬·writer 출력**에 닿으면 재측정을 권하고 사용자 판단을 받는다. 계약 주석·타입만 바꾼 변경은 권하지 않는다.
- 재측정한다면 **학습(`docs/adapter-survey/repos.txt`)과 홀드아웃(`repos-heldout.txt`)을 둘 다** 돌린다. ARCHITECTURE §1.9의 홀드아웃 판정이 그 근거다: 그 라운드의 수정 4건 중 **2건이 수정이 만든 회귀**였고 그중 하나는 학습 코퍼스에서만 나타났다 — 한쪽만 돌렸으면 못 봤다.
- 결과는 `docs/ARCHITECTURE.md` §1.9의 지표 표를 갱신한다. **어느 코퍼스의 값인지 지표마다 붙인다** (POSTMORTEM 2026-09-02 — 학습 오탐 0.0%가 홀드아웃에서 40%였다).
- **재측정하지 않기로 했으면 그 사실을 리포트에 남긴다.** "안 걸렸다"와 "걸렸는데 미뤘다"는 다르다.

⚠️ **상시 방어선은 따로 있다.** `lib/adapters/__tests__/key-order-golden.test.ts`가 실측 리포 모양을 인라인 픽스처로 들고 `lib/survey/diff.ts`의 프로덕션 함수로 재므로, 순서·결정성 회귀는 네트워크 없이 `pnpm test`가 잡는다. 재측정이 답하는 것은 **일반화**(처음 보는 리포에서도 그런가)뿐이다.

### 5. 푸시 실행 (= 배포 시작)

- 푸시 **직전** `git rev-parse HEAD`를 기억해둔다 (6단계에서 run을 특정하는 데 쓴다).
- `git push`
- 출력에서 결과 줄만 발췌해 보고

### 6. CI run 안내 (논블로킹)

한 줄만 덧붙이고 **종료. 기다리지 않는다.**

```
gh run list --branch dev --workflow ci.yml --limit 10 --json headSha,url,status
```

- `headSha`가 5단계에서 기억한 HEAD와 **일치하는** run의 URL을 보고.
- 아직 등록 전이면 Actions 탭 URL로 폴백. **최신 run을 그냥 집지 않는다** — 이전 커밋의 run URL은 오보다.
- `gh run watch`로 대기하지 않는다.
- **CI가 여기서 실패해도 프로덕션은 무사하다** (이 푸시는 preview까지다). 다만 **그 커밋은 `/merge`에 태울 수 없다** — 후속 픽스가 필요하다는 것을 리포트에 명시한다.

### 7. preview 배포 안내 (논블로킹)

dev 푸시로 **Vercel preview 배포가 시작된다.** 확인 경로만 한 줄로 안내하고 종료 — 기다리거나 조회하지 않는다.
- GitHub dev 커밋 status에 붙는 Vercel 체크 (브랜치 고정 URL이 그 배포를 가리킨다)
- Vercel 대시보드

**preview는 dev DB를 본다** — 프로덕션 데이터에 닿지 않는다. ⚠️ **preview에서 로그인은 dev 브랜치 고정 URL(`https://dev.mal-moi.com`)에서만 된다** (OAuth 앱은 하나이고 그 URL만 callback으로 등록돼 있다 — 배포별 URL은 매 푸시마다 바뀌어 등록할 수 없다). 다른 작업 브랜치의 preview는 로그인 화면에서 멈추는 것이 정상이고 버그가 아니다.

## 리포트

```
🚀 push (= preview 배포): dev
워크트리:   내 것만 (체크아웃 <n>개, 미추적 <n>건) / ⚠️ 남의 추적 변경 <경로들> — 중단
로컬 게이트: typecheck OK / test <n> passed / build OK
마이그레이션: 없음 / dev 적용됨(<이름>) — ⚠️ /merge에서 db:deploy 필요
문서 신선도: 후보 없음 / <문서> 갱신(<커밋>)
Codex 미러: 최신 / 재생성(<커밋>)
푸시: <옛 해시>..<새 해시>
CI run: <url> (결과 미확정)
Vercel: preview 배포 진행 중 — <확인 경로>
프로덕션: 배포되지 않음 — /merge로 dev→main PR을 낸다
```

## 금지 사항

- **1단계 로컬 게이트 생략·우회 금지.**
- **0b 워크트리 소유권 게이트 우회 금지** — 이번 세션이 안 건드린 **추적 중인** 미커밋 변경이 있으면 **커밋도 푸시도 하지 않는다**(미추적은 보고만). 남의 미완성 작업을 내 이름으로 싣는 일이고, 그 트리에서 잰 게이트 숫자는 근거가 아니다.
- **`git add -A`·디렉터리 통째 stage 금지** — 경로를 하나씩 명시한다.
- **`pnpm db:deploy` 실행 금지 — 이 스킬의 일이 아니다.** 프로덕션 스키마는 `/merge` 1단계에서 사용자가 넓힌다.
- **dev DB에 마이그레이션이 미적용인 채 푸시 금지** (preview가 없는 컬럼을 조회한다).
- **`main`으로 푸시 금지.** 프로덕션은 `/merge`의 PR CI를 지나야 한다.
- `git push --force` / `--force-with-lease`는 **사용자가 명시 요청**한 경우에만. dev는 `/sync`가 정기적으로 force update하는 브랜치라 main만큼 절대적이진 않지만, 여기서는 요청받으면 무엇이 사라지는지 보여주고 재확인한다.
- `--no-verify`로 hook 스킵 금지.
- `.env`·`*.pem`·크레덴셜이 staged면 경고하고 멈춤.
