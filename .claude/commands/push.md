---
description: main에 푸시 = 프로덕션 배포. 로컬 검증 게이트 + 마이그레이션 순서 + 문서 신선도 + Codex 미러 게이트를 통과한 것만 나간다.
---

`main`에 푸시한다. **main 단일 브랜치이므로 이 푸시가 곧 Vercel 프로덕션 배포다.**

> **⚠️ PR 전 CI 게이트가 없다.** 브랜치가 하나라 PR이 없고, CI는 푸시 **이후에** 돈다. 즉 **이 스킬의 1단계 로컬 검증이 프로덕션 앞의 유일한 게이트다.** 건너뛰면 검증되지 않은 코드가 곧바로 배포된다. GitHub 브랜치 프로텍션도 없다(Free 플랜 + private).

## 절차

### 0. 상태 점검 (병렬)

- `git branch --show-current` — `main`이 아니면 중단하고 왜 다른 브랜치에 있는지 보고 (main 단일 정책이다)
- `git status` — 미커밋 변경
- `git log @{u}..HEAD --oneline` — 푸시될 커밋
- `git log -1 --stat` — 마지막 커밋 규모

**푸시될 커밋이 없고 미커밋 변경도 없으면** "푸시할 것 없음" 알리고 종료.

### 1. 로컬 검증 게이트 (⚠️ 건너뛰기 금지 — 프로덕션 앞의 유일한 게이트)

```
pnpm typecheck
pnpm test
pnpm build
```

**`pnpm build`가 셋 중 유일하게 RSC 경계를 본다.** `tsc`는 `"use client"` 누락, 서버 컴포넌트에서 클라이언트 훅 사용, Server Action 직렬화 위반을 **잡지 못한다** — `next build`만 잡는다. 콜드 5초 / 웜 2초라 게이트에 넣는 비용이 무시할 수준이다.

**셋 중 하나라도 실패하면 즉시 중단한다.** 실패를 고치는 건 이 스킬의 일이 아니다 — 무엇이 실패했는지 보고하고 사용자 지시를 기다린다. "CI가 잡아줄 것"이라는 이유로 넘기지 않는다. CI는 배포가 끝난 뒤에 돈다.

### 2. 미커밋 변경 커밋

미커밋 변경이 있으면 바로 커밋한다. `/push` 실행 시점에 커밋 의도가 있다고 간주. 변경 파일을 stage하고 **영문 커밋 메시지**로 커밋한다. 허락을 구하지 않는다.

- **예외 — 즉시 중단**: `.env`·`*.pem`·크레덴셜 파일이 staged면 경고하고 멈춘다. `.gitignore`에 있지만 `-f`로 강제 추가된 흔적일 수 있다.

### 3. 마이그레이션 순서 게이트 (⚠️ 이 프로젝트 특화)

```
git diff @{u}..HEAD --name-only -- prisma/
```

**푸시될 커밋에 마이그레이션이 포함돼 있으면**, 푸시 **전에** 프로덕션 스키마를 넓혀야 한다 (additive-first, ARCHITECTURE §7):

```
pnpm db:deploy
```

- **이 스킬이 자동 실행하지 않는다.** 프로덕션 DB를 바꾸는 일이라 사용자가 돌린다.
- **사용자에게 실행 여부를 확인받고 대기한다.** 안 돌린 채 푸시하면 배포 순간 프로덕션이 없는 컬럼을 조회한다.
- `pnpm db:status`로 적용 완료를 확인한 뒤 진행한다.
- 마이그레이션이 없으면 이 단계를 한 줄로 스킵 보고.

### 4. 문서 신선도 검사 (트라이아지 → 정밀)

**4a. 트라이아지 (1회, 가볍게).** `git diff @{u}..HEAD`를 **한 번** 훑어 트리거에 걸리는 문서를 후보로 매핑한다. 이 단계에서 문서를 읽지 않는다.
- **후보 0개면 검사 종료, 바로 5단계.** 대부분의 푸시가 여기서 통과한다.

트리거:
- **`lib/`·`app/`·`prisma/`에 실질 변경이 있음 = 태스크가 진행됐다는 뜻 → docs/TASKS.md** (⚠️ 이 트리거는 거의 항상 걸린다. 코드를 고쳤는데 체크박스가 그대로면 그 문서는 거짓이다)
- 기능 추가/삭제, 세 흐름(push·편집 UI·pull)의 단계 변경, 기술 선택·버전 변경, 비범위 항목을 범위로 끌어들임, 스키마 변경 → **docs/MVP.md** + **docs/TASKS.md**(단계 구성 변경 시)
- **`lib/` 아래 코어 모듈 변경** — `lib/adapters/`·`lib/githash.ts`·`lib/github.ts`·`lib/scan/`·`lib/push/`·`lib/pull/`·`lib/keys/`·`lib/auth/`, `prisma/schema.prisma`, `middleware.ts` — 또는 새 불변식·함정 발견, 인증 경로 변경 → **docs/ARCHITECTURE.md**
  - ⚠️ **이 목록은 실제 디렉터리와 어긋나기 쉽다.** `lib/export.ts`가 어댑터로 흡수된 뒤에도 트리거가 그 이름을 가리키고 있어서, `lib/push/`의 정책 반전(strict)이 ARCHITECTURE §5.5를 낡은 채로 통과시켰다. **`lib/` 하위에 새 디렉터리가 생기면 이 줄에 추가한다.**
- **코어 원칙·정책이 뒤집힘** (번역값 소유권, export 결정성, 인증 경계, 병합 없음의 해석) → **CLAUDE.md 코어 원칙 절 + docs/MVP.md + docs/ARCHITECTURE.md 셋 다**
  - 정책 반전은 한 문서만 고치면 나머지가 **반대 불변식을 가르친다.** 뒤집기 전 서술을 grep해 전수로 찾는다 (예: strict 전환 때 `DO NOTHING`·"절대 건드리지 않는다")
- `package.json` scripts·의존성 변경, 새 디렉터리, 브랜치·배포 방식 변경, 스킬 라인업 변경, 새 컨벤션·게이트웨이 → **CLAUDE.md**
- **코드에서 새 `process.env.*`를 읽음** → **.env.example** (⚠️ diff에 `process.env`가 보이면 무조건 확인한다. 빠지면 새 체크아웃·Vercel 재설정에서 원인 불명으로 죽는다)
- `.github/workflows/*.yml`·`.npmrc`·`postcss.config.mjs`·`components.json` 변경 → **CLAUDE.md의 해당 섹션**
- **`lib/adapters/**`·`lib/survey/**` 변경 → docs/ADAPTER-COVERAGE.md + `pnpm adapter-survey` 재실행** (아래 4d)
- `app/globals.css` 토큰 변경, 새 raw 색 도입, `components/ui/` 추가, `lib/utils.ts` 변경 → **docs/DESIGN.md**
- 기술 선택·버전 변경, 개발 명령 변경, 브랜치·배포 방식 변경 → **README.md** (CLAUDE.md의 요약 미러라 같은 트리거에 같이 걸린다)

**4b. 후보 정밀 검사.** 걸린 문서만 실제로 읽고 대조한다.
- **docs/TASKS.md** — **완료 조건이 실제로 통과한 태스크만 `[x]`로 체크**하고 근거(커밋 해시·테스트 이름·산출물)를 한 줄 남긴다. "코드를 썼다"는 완료가 아니다. 반대로 **되돌린 작업은 체크를 해제**한다. `🔒` 항목이 결정됐으면 표시를 떼고 결정 내용을 적은 뒤 MVP.md §10에서도 뺀다. 단계가 끝났으면 헤딩의 `⬜`를 `✅`로, 다음 단계에 `← **현재 단계**`를 옮긴다. prefix `docs(TASKS): ...`
- **docs/DESIGN.md** — 토큰 값·대비 함정·mono 표면·라이트 단일 강제 장치가 `app/globals.css`·`lib/utils.ts`와 맞는지. 새 raw 색을 늘렸으면 §6.2에 등재한다. prefix `docs(DESIGN): ...`
- **docs/MVP.md** — 범위·기술 선택 표·세 흐름의 단계·스키마·구현 순서가 코드와 맞는지. §10 "아직 안 정한 것"에서 결정된 항목은 본문으로 올리고 목록에서 뺀다. **§8 구현 순서와 TASKS.md의 단계 구성이 어긋나면 안 된다.** prefix `docs(MVP): ...`
- **docs/ARCHITECTURE.md** — 불변식·함정·계약이 실제 구현과 맞는지. `(미구현)` 표시가 남아 있는데 구현됐으면 제거하고 실제 동작으로 갱신. prefix `docs(ARCHITECTURE): ...`
- **CLAUDE.md** — 명령어 표, 스택 버전, 디렉터리 구조, 브랜치·배포, 스킬 라인업. prefix `docs(CLAUDE): ...`
- **.env.example** — 코드가 읽는 변수가 전부 있는지(미구현 기능용 선등록 변수는 잉여가 아니다). 주석으로 무엇에 쓰는지·틀리면 어떻게 죽는지 남긴다. prefix `chore(env): ...`
- **README.md** — 스택 한 줄·명령어 표·브랜치 정책이 CLAUDE.md와 맞는지. prefix `docs(README): ...`

발견 시 확인 없이 바로 Edit으로 반영하고 **문서별 별도 커밋**. 변경 불필요하면 건너뜀.

**⚠️ 문서를 고쳤으면 1단계 게이트를 다시 돌린다** — 문서 커밋이 코드에 영향을 줄 일은 없지만, 이 시점의 HEAD가 배포될 HEAD이므로 게이트가 통과한 상태와 배포되는 상태가 같아야 한다.

**4d. 어댑터 실측 재측정 (사람 판단 — 사용자에게 묻는다).**

`lib/adapters/**`·`lib/survey/**`에 실질 변경이 있으면 `docs/ADAPTER-COVERAGE.md`의 숫자가 낡았을 수 있다. **이 판단을 자동으로 내리지 않는다** — 실행이 리포 129개 clone에 ~4분이고 네트워크·GitHub 가용성에 묶여 있어 푸시를 막을 게이트로 쓸 수 없다.

- 변경이 **탐지 규칙·정렬·writer 출력**에 닿으면 재측정을 권하고 사용자 판단을 받는다. 계약 주석·타입만 바꾼 변경은 권하지 않는다.
- 재측정한다면 **학습(`repos.txt`)과 홀드아웃(`repos-heldout.txt`)을 둘 다** 돌린다. `docs/ADAPTER-COVERAGE.md` §0 3차가 그 근거다: 그 라운드의 수정 4건 중 **2건이 수정이 만든 회귀**였고 그중 하나는 학습 코퍼스에서만 나타났다 — 한쪽만 돌렸으면 못 봤다.
- 결과는 `docs/ADAPTER-COVERAGE.md`에 회차를 더해 기록한다. **어느 코퍼스의 값인지 지표마다 붙인다** (POSTMORTEM 2026-09-02 — 학습 오탐 0.0%가 홀드아웃에서 40%였다).
- **재측정하지 않기로 했으면 그 사실을 리포트에 남긴다.** "안 걸렸다"와 "걸렸는데 미뤘다"는 다르다.

⚠️ **상시 방어선은 따로 있다.** `lib/adapters/__tests__/key-order-golden.test.ts`가 실측 리포 모양을 인라인 픽스처로 들고 `lib/survey/diff.ts`의 프로덕션 함수로 재므로, 순서·결정성 회귀는 네트워크 없이 `pnpm test`가 잡는다. 재측정이 답하는 것은 **일반화**(처음 보는 리포에서도 그런가)뿐이다.

**4c. Codex 미러 게이트 (기계 검사).** 트라이아지와 무관하게 항상 `pnpm sync:agents:check`.
- 통과 → 한 줄 보고.
- 드리프트 → `pnpm sync:agents` 재생성 후 `docs(AGENTS): sync codex mirror` 커밋을 얹고 계속 (순수 생성물이라 확인 불필요).
- 스크립트가 **에러**로 죽으면 중단하고 원인 보고. 미러는 생성물이므로 `AGENTS.md`·`.agents/skills/`를 직접 편집해 맞추지 않는다.

### 5. 푸시 실행 (= 배포 시작)

- 푸시 **직전** `git rev-parse HEAD`를 기억해둔다 (6단계에서 run을 특정하는 데 쓴다).
- `git push`
- 출력에서 결과 줄만 발췌해 보고

### 6. CI run 안내 (논블로킹)

한 줄만 덧붙이고 **종료. 기다리지 않는다.**

```
gh run list --branch main --workflow ci.yml --limit 10 --json headSha,url,status
```

- `headSha`가 5단계에서 기억한 HEAD와 **일치하는** run의 URL을 보고.
- 아직 등록 전이면 Actions 탭 URL로 폴백. **최신 run을 그냥 집지 않는다** — 이전 커밋의 run URL은 오보다.
- `gh run watch`로 대기하지 않는다.
- **CI가 여기서 실패해도 배포는 이미 나갔다.** 그래서 1단계 게이트가 있다. CI 실패를 발견하면 후속 픽스가 필요하다는 것을 리포트에 명시한다.

### 7. 프로덕션 배포 안내 (논블로킹)

main 푸시로 **Vercel 프로덕션 배포가 시작된다.** 확인 경로만 한 줄로 안내하고 종료 — 기다리거나 조회하지 않는다.
- GitHub main 커밋 status에 붙는 Vercel 체크
- Vercel 대시보드

**preview 배포는 없다.** 브랜치가 하나라 Vercel이 preview를 붙일 대상이 없다. 배포 전에 눈으로 보려면 `pnpm dev`로 로컬에서 확인한다.

## 리포트

```
🚀 push (= 프로덕션 배포): main
로컬 게이트: typecheck OK / test <n> passed   ← 프로덕션 앞의 유일한 게이트
마이그레이션: 없음 / db:deploy 완료(<이름>)
문서 신선도: 후보 없음 / <문서> 갱신(<커밋>)
Codex 미러: 최신 / 재생성(<커밋>)
푸시: <옛 해시>..<새 해시>
CI run: <url> (결과 미확정 — 배포는 이미 시작됐다)
Vercel: 프로덕션 배포 진행 중 — <확인 경로>
```

## 금지 사항

- **1단계 로컬 게이트 생략·우회 금지.** "CI가 잡아줄 것"은 성립하지 않는다 — CI는 배포 후에 돈다.
- **`pnpm db:deploy` 자동 실행 금지** — 사용자 확인 후 사용자가 돌린다.
- **마이그레이션이 미적용인 채 푸시 금지.**
- `git push --force` / `--force-with-lease`는 **사용자가 명시 요청**한 경우에만. **main이므로 기본적으로 금지**이며, 요청받으면 무엇이 사라지는지 보여주고 재확인한다.
- `--no-verify`로 hook 스킵 금지.
- `.env`·`*.pem`·크레덴셜이 staged면 경고하고 멈춤.
