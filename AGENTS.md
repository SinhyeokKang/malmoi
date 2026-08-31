# AGENTS.md

> **이 파일은 자동 생성물이다.** 원본은 [CLAUDE.md](./CLAUDE.md)이고 `pnpm sync:agents`가 아래 본문을 그대로 복제한다.
> 고칠 내용이 있으면 **CLAUDE.md를 고치고** `pnpm sync:agents`를 돌려라 — 이 파일을 직접 편집하면 다음 sync에서 덮어써진다.
> 같은 규칙이 `.agents/skills/`(= `.claude/commands/` 미러)에도 적용된다. 이 프리앰블만 예외로 `.agents/PREAMBLE.md`에서 손으로 관리한다.
> 본문이 `CLAUDE.md`·`.claude/commands/`를 가리키면 **그 원본 경로가 맞다** — 치환 없이 복제하므로 그대로 읽으면 된다.

## Codex 런타임 차이 (이 프리앰블 전용)

Claude Code에만 있는 자동 안전망이 Codex 세션에는 없다. 아래는 **직접** 챙긴다.

- **스킬 호출 매핑** — 본문이 `/<name>`으로 부르는 스킬은 Codex에선 `source-command-<name>` 스킬로 로드한다.
- **미제공 스킬 (역할 분담)** — `/push`·`/merge`·`/sync`는 미러하지 않는다. **Codex는 작업 → 커밋까지, 원격으로 나가는 건 Claude Code**가 단일 창구로 맡는다 — main 머지가 곧 Vercel 프로덕션 배포이므로 두 창구가 경쟁하면 배포가 깨진다. 이 스킬들이 필요해지면 사용자에게 Claude Code 세션에서 실행하라고 안내하고 멈춘다.
- **`/ship`은 커밋까지** — `source-command-ship`은 미러돼 있고 마지막 커밋 단계까지 전부 돈다. push 단계는 **수행하지 않고** "push 대기 — Claude Code에서 `/push` 실행"을 리포트에 남기고 종료한다. 상세는 스킬 본문의 "push 권한 / 런타임별 종착점".
- **export 결정성 훅 없음** — Claude Code는 `.claude/settings.json`의 PostToolUse 훅이 `lib/export.ts`·`lib/githash.ts` 편집 시 관련 테스트를 자동 실행해 결정성 붕괴를 차단한다. Codex엔 이 훅이 없으니 그 파일을 건드렸으면 손으로 돌린다: `pnpm test`
- **미러 sync 훅 없음** — Claude Code는 `CLAUDE.md`·`.claude/commands/*.md` 편집 시 훅이 `sync:agents`를 자동 실행한다. Codex엔 없다. 애초에 **Codex는 원본을 편집하지 않는 게 규칙**이고, 부득이 고쳤으면 `pnpm sync:agents`를 직접 돌려 미러를 함께 커밋한다.
- **개인 메모리 없음** — 본문 말미의 `~/.claude/projects/.../memory/`는 Claude Code 전용 저장소다. Codex는 이 경로를 읽지 않는다.
- **커밋 트레일러** — Codex 세션에서 만든 커밋은 마지막 줄에 `Co-Authored-By: Codex <noreply@openai.com>`를 붙인다(Claude Code의 `Co-Authored-By: Claude ...`와 대칭 — 어느 에이전트가 만든 커밋인지 히스토리에서 구분되게).

---

## 응답 스타일 (이 문서의 다른 모든 규칙보다 우선)

**한국어로, 간결하게.** 위반 시 답변을 다시 쓴다. 아래는 취향이 아니라 판정 기준이다.

- **첫 문장이 결론**: 서두·예고 금지 — "~해보겠습니다", "좋은 질문입니다", "확인해보니 다음과 같습니다" 류로 시작하지 않는다. 바로 답/결과부터.
- **꾸밈말 금지**: "완벽합니다", "훌륭한", "핵심적인", "말씀하신 대로" 같은 평가·동조 표현을 빼도 정보가 안 줄면 뺀다.
- **재진술 금지**: 방금 보여준 diff·명령 출력·파일 내용을 산문으로 다시 설명하지 않는다. 코드가 말하는 건 코드가 말하게 둔다.
- **길이 상한**: 단순 질문·확인 → 3줄 이내. 작업 완료 보고엔 줄 수 상한이 없다 — 필요한 정보를 줄이면서까지 짧게 만들지 않는다. 대신 위의 재진술·꾸밈말 금지로 군더더기만 덜어낸다.
- **미완·실패를 먼저**: 못 한 것·실패한 테스트·건너뛴 범위를 성공 요약보다 앞에 쓴다.
- **선택지 나열 금지**: 추천 하나를 고르고 그 이유 한 줄. 사용자 결정이 필요한 지점(작업 원칙의 "가정을 명시")만 예외.
- **예외**: 코드·커밋 메시지·PR title/body는 영문.

강제 장치는 2단이다: 이 섹션(두 런타임 공통 — Codex는 `AGENTS.md` 미러로 받는다)과, `.claude/settings.json`의 `UserPromptSubmit` 훅이 매 턴 같은 규칙 요약을 컨텍스트에 재주입하는 것(긴 세션에서 문서 앞쪽이 희석되는 걸 막는다). **훅은 Claude Code 전용이라 Codex 세션에선 이 섹션만 남는다.**

i18n-poc: 사내 로컬라이제이션 관리 도구(TMS) PoC. 크롬 확장의 `_locales/<locale>/messages.json`을 대상으로, 개발자가 코드에 심은 소스 문자열을 DB로 올리고(push), 비개발자 동료가 웹 UI에서 번역하고, 그 결과를 고정 브랜치의 PR 하나로 되돌려보낸다(pull). Crowdin/Tolgee 대체가 목표가 아니라 학습·실험이고, 사내에서 실제로 한 번 써볼 수 있는 수준이 목표다.

**기본 스펙 문서는 [docs/MVP.md](./docs/MVP.md)다.** 무엇을 만들고 무엇을 안 만드는지, 각 기술 선택의 근거, 세 흐름(push·편집 UI·pull)의 단계별 계약, 스키마, 구현 순서가 전부 거기 있다. **작업을 시작하기 전에 읽고, 설계 결정이 바뀌면 코드보다 먼저 그 문서를 고친다.** 이 문서(CLAUDE.md)는 *어떻게 작업하는가*를 다루고, MVP.md는 *무엇을 만드는가*를 다룬다.

## 코어 설계 원칙: 번역 값은 DB가 진실, 소스 키는 코드가 진실

**이 프로젝트의 유일한 축이고, 여기서 파생되지 않는 복잡도는 전부 의심 대상이다.** (원문·근거는 [docs/MVP.md](./docs/MVP.md) §2)

두 종류의 데이터에 각각 단일 진실 공급원을 배정한다. 번역 값(어떤 언어로 뭐라고 쓰는가)은 **DB만** 안다. 소스 키(어떤 문자열이 존재하는가)는 **코드만** 안다. 각 축에 소유자가 하나뿐이므로 **머지 로직이 아예 존재하지 않는다** — export는 DB에서 결정적으로 재생성되니, git 브랜치가 갈라져도 base에서 다시 따서 파일을 새로 뽑으면 끝난다. 3-way merge도, 충돌 해소 UI도, "누가 이겼나" 판정도 없다.

따라서:

- **push는 번역 값을 절대 건드리지 않는다.** 코드에서 사라진 키도 삭제하지 않고 `orphaned` 플래그만 세운다 — 브랜치를 되돌리거나 기능을 복구하면 번역이 그대로 살아 돌아와야 한다. 삭제는 되돌릴 수 없어 이 원칙을 깬다.
- **pull은 파일을 편집하지 않고 생성한다.** 기존 파일 내용을 읽어 병합하는 코드가 생기면 그 순간 DB의 단독 소유권이 깨진다. 읽는 것은 오직 **변경 여부 판정**을 위한 blob SHA뿐이다.
- **export는 결정적이어야 한다.** 같은 DB 상태 → 언제나 바이트 단위로 같은 파일. 이게 깨지면 blob SHA 비교가 매번 "변경됨"을 뱉어 무의미한 커밋이 쌓이고, 변경 감지 최적화 전체가 무너진다.

## 작업 원칙

- **가정을 명시**: 해석이 여러 개면 조용히 하나 고르지 말고 선택지를 제시. 불확실하면 물어라.
- **더 단순한 방법이 있으면 제안**: 200줄을 50줄로 줄일 수 있으면 줄여라. 요청하지 않은 유연성·설정 가능성·추상화 추가 금지. **이 프로젝트는 PoC다** — 확장성을 위한 선반영은 그 자체가 결함이다.
- **외과적 변경**: 요청과 직접 관련 없는 인접 코드 개선·리팩터 금지. 기존 스타일 따르기. 기존 dead code는 언급만 하고 삭제하지 않는다 — 내 변경이 만든 고아만 제거.
- **검증 가능한 목표로 전환**: "버그 고쳐" → "재현 테스트 작성 후 통과시켜". 멀티스텝 작업은 단계별 검증 체크를 포함한 플랜을 먼저 제시.
- **테스트 우선**: 신규 인터페이스(함수·헬퍼·어댑터) 추가 시 테스트를 먼저 작성하고 구현한다. 기존 로직 변경 시에도 관련 순수 함수의 단위 테스트를 작성/갱신하고 `pnpm test` 통과를 확인한 뒤 작업을 마친다. 테스트 없이 코드만 변경하지 않는다.

## 스택

- Next.js 16 App Router + React 19 + TypeScript 7, Vercel 배포
- Supabase Postgres + Prisma 7 — **런타임은 pooler(6543, `DATABASE_URL`), 마이그레이션은 direct(5432, `DIRECT_URL`)**. 이 둘을 섞으면 서버리스에서 커넥션이 고갈되거나 DDL이 실패한다
- Auth.js v5 (`next-auth@beta`) GitHub provider — **로그인·인가 전용**
- GitHub App installation token — **리포 쓰기 전용**
- Tailwind CSS + shadcn/ui (편집 UI) — **아직 설치하지 않았다.** 구현 순서 5단계(편집 UI)에서 추가한다
- Vitest (순수 함수 단위 테스트)
- 키 추출: `ts-morph` AST (JS/TS) + 정규식 (HTML·manifest의 `__MSG_key__`)
- 인증: `next-auth@beta` (Auth.js v5). GitHub API는 `octokit`

**두 GitHub 자격증명을 섞지 않는다.** OAuth 토큰으로 커밋하면 커밋이 특정 개인 명의가 되고 그 사람이 org를 떠나면 파이프라인이 깨진다. 로그인은 OAuth, 쓰기는 App — 경계를 넘는 코드가 보이면 리뷰에서 막는다.

## 명령어

| 용도 | 명령 |
|---|---|
| 개발 서버 | `pnpm dev` |
| 빌드 | `pnpm build` (`next build`) |
| 타입 체크만 | `pnpm typecheck` |
| 테스트 | `pnpm test` |
| 테스트 (watch) | `pnpm test:watch` |
| 마이그레이션 생성·적용 (로컬) | `pnpm db:migrate` (`DIRECT_URL` 사용) |
| 마이그레이션 적용 (배포) | `pnpm db:deploy` |
| 마이그레이션 상태·드리프트 | `pnpm db:status` |
| Prisma 클라이언트 재생성 | `pnpm db:generate` |
| DB 브라우저 | `pnpm db:studio` |
| Codex 미러 동기화 | `pnpm sync:agents` (검사만: `pnpm sync:agents:check`) |

**린터 없음** — ESLint/Prettier/Biome 미도입이라 `pnpm lint`는 존재하지 않는다. 스타일 게이트는 `pnpm typecheck` + `pnpm test`뿐이고, 린터 추가는 요청 없이 하지 않는다.

### CI (GitHub Actions)

`ci.yml` 하나뿐이고 job은 `verify`(typecheck + test + Codex 미러 드리프트) 단일이다. main의 required status check도 `verify` 하나. **Vercel이 별도로 preview/production 배포를 붙이므로 빌드 검증은 Vercel이 맡는다** — CI에서 `next build`를 중복 실행하지 않는다(같은 걸 두 번 돌리는 비용).

**빌드는 자동 실행하지 않는다.** 타입 확인이 필요하면 `pnpm typecheck`를 쓴다. `pnpm build`는 사용자가 명시 요청할 때만.

## 디렉터리 구조

```
app/                    Next.js App Router
  (edit)/               편집 UI (인증 필요)
  api/push/             CI → DB (Bearer PUSH_TOKEN)
  api/pull/             DB → PR (수동 버튼 + Vercel Cron)
lib/
  env.ts                환경변수 단일 접근점 (fail-closed, PEM 개행 복원)
  export.ts             DB 상태 → messages.json 문자열 (결정적, 순수)
  githash.ts            sha1("blob <len>\0" + content) — 로컬 blob SHA
  github.ts             Git Data API 래퍼 (App 토큰)
  scan/                 ts-morph 키 추출기 (CI에서 CLI로도 실행)
prisma/schema.prisma
scripts/sync-agents.mjs Claude Code 원본 → Codex 미러 생성기
docs/ARCHITECTURE.md    설계 상세·함정
docs/POSTMORTEM.md      회귀·버그 회고 누적
```

## 아키텍처 원칙

설계 상세와 함정은 **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** 가 단일 출처다. `lib/export.ts`·`lib/githash.ts`·`lib/github.ts`·`lib/scan/`을 건드리기 전에 읽는다. 요약:

- **export 결정성 3규칙**: 키는 코드포인트 오름차순 정렬, 들여쓰기 2칸, 파일 끝 개행 정확히 1개. `orphaned` 키는 export에서 제외(DB엔 남으므로 되돌릴 수 있다).
- **변경 감지는 API 호출 전에 끝낸다**: blob SHA를 로컬에서 계산해 base 트리와 비교하고, 전부 같으면 GitHub API를 **한 번도** 부르지 않는다. 야간 cron이 매일 도는데 변경이 없는 날이 대부분이라 이게 기본 경로다.
- **커밋 parents는 항상 base의 head, 브랜치는 force update**: `l10n/sync`는 누적 히스토리가 아니라 "현재 DB 상태의 스냅샷"이다. 3-way merge를 피하는 게 코어 원칙이므로 fast-forward를 지키려 하지 않는다.
- **커밋 메시지에 `[skip-l10n]`**: 이 마커가 없으면 pull이 만든 커밋이 main에 머지될 때 push가 다시 돌아 무한 루프가 된다.
- **PR은 하나를 재사용**: 열린 PR이 있으면 새로 만들지 않는다. PoC 리포에 PR 수십 개가 쌓이면 사람이 안 본다.

## 브랜치 정책 & 배포

- 작업 브랜치: **`dev`** — 자유롭게 push (force push 허용). Vercel preview 배포가 붙는다.
- 메인 브랜치: **`main`** — 직접 push 금지, PR squash 머지만. **main 머지가 곧 Vercel 프로덕션 배포다** — 별도 배포 명령이 없고, 그래서 `/deploy` 스킬도 없다.
- **버전·tag 없음.** 웹앱이라 semver가 소비자에게 의미를 주지 않는다. 릴리스 노트도 없다.
- **DB 마이그레이션은 배포와 순서가 얽힌다**: `pnpm db:deploy`를 **머지 전에** 돌려 스키마를 먼저 넓힌다(additive-first). 컬럼 삭제·타입 변경은 코드 배포가 끝난 다음 별도 마이그레이션으로. 이 순서를 어기면 배포 순간 프로덕션이 없는 컬럼을 조회한다. 상세는 `/db` 스킬.

## 워크플로우 (스킬 라인업)

스킬 12개의 역할·단계별 게이트는 `.claude/commands/<name>.md`에 정의돼 있고, Codex 미러는 `.agents/skills/source-command-<name>/SKILL.md`다.

권장 흐름: `/feature` → `/tdd interface` → `/implement` → `/code-review` → `/refactor` → (`/db`) → `/push` → `/merge`. 작은 변경은 `/ship` 하나로 전 단계를 오케스트레이션한다.

- **스키마를 건드렸으면 `/push` 전에 `/db`** — 마이그레이션 파일이 코드와 같은 커밋에 들어가야 하고, 배포 순서 판정(additive-first)도 여기서 한다.
- **회귀·버그를 잡아 고쳤으면 `/postmortem`** 으로 `docs/POSTMORTEM.md`에 회고를 남긴다. 역으로 `/implement`·`/refactor`·`/code-review`는 **착수 전 변경 영역으로 `docs/POSTMORTEM.md`를 grep**해 과거 함정을 소환한다 — 쓰기만 하고 안 읽으면 죽은 로그다.
- **`/l10n-roundtrip`은 아직 없다.** push→편집→pull 왕복을 실제 리포로 검증하는 스킬인데, 세 흐름이 다 서기 전엔 만들 게 없다. `/api/pull`이 동작하는 시점에 추가한다.

## 문서 신선도

문서가 4개뿐이라 `/doc-check` 같은 전수 대조 스킬을 두지 않는다. `/push`가 **푸시될 diff에 걸린 문서만** 트라이아지한다 (대상·트리거는 `.claude/commands/push.md` 4단계). 갱신은 문서별 별도 커밋(`docs(CLAUDE): ...` / `docs(ARCHITECTURE): ...`).

- **docs/MVP.md** — **기본 스펙.** 범위·기술 선택·세 흐름의 계약·스키마·구현 순서. 기능을 추가/삭제했거나 기술 선택을 바꿨거나 비범위 항목을 범위로 끌어들였으면 **여기부터** 갱신한다 (코드가 스펙을 앞서면 스펙이 거짓이 된다). §10 "아직 안 정한 것"에서 결정된 항목은 본문으로 올리고 목록에서 뺀다. 커밋 prefix `docs(MVP): ...`
- **CLAUDE.md** — 명령어 표, 스택, 브랜치·배포, 스킬 라인업, 코드 컨벤션
- **docs/ARCHITECTURE.md** — export 결정성, blob SHA 비교, 커밋·PR 전략, 스캐너 계약, 스키마
- **docs/POSTMORTEM.md** — 회고 누적 (append-only, `/postmortem` 전담)

`.env.example`도 문서로 취급한다 — **새 환경변수를 코드에서 읽었으면 같은 커밋에서 `.env.example`에 추가**한다. 빠지면 새 체크아웃·Vercel 재설정에서 원인 불명으로 죽는다.

## 코드 컨벤션

- **커밋 메시지는 영문**, Conventional Commits (`feat:` `fix:` `test:` `refactor:` `docs(scope):` `chore:`).
- **주석은 한국어로, "왜"만 쓴다.** 코드가 말하는 "무엇"을 반복하지 않는다. 특히 **비자명한 제약·함정·과거에 밟은 지뢰**를 남긴다 (예: "pooler로 마이그레이션하면 DDL 세션을 못 잡아 실패한다").
- **순수 함수를 먼저 분리한다.** export 생성·blob SHA·키 추출·정렬은 I/O 없는 순수 함수여야 하고, 그래서 테스트가 가능하다. DB·GitHub 호출은 얇은 껍데기로 감싼다.
- **`any` 금지**, `noUncheckedIndexedAccess`가 켜져 있으니 인덱스 접근은 undefined를 처리한다.
- **환경변수는 한 곳에서 읽는다** — 흩어진 `process.env` 접근은 누락된 변수를 런타임까지 숨긴다.
- **날짜는 UTC로 저장**, 표시 시점에만 로컬로 변환.

## 게이트웨이 (알아두면 유용)

- **`prisma`의 npm `latest` 태그가 RC를 가리킨다.** 2026-08 시점 `latest`가 `8.0.0-rc.12`고 stable은 `prev` 태그의 `7.10.0`이다. `pnpm add prisma`로 무심코 깔면 RC가 들어오고 `alchemy`·`cloudflare-runtime` 같은 무관한 의존성이 딸려온다. **버전을 명시해 깐다.**
- **Supabase pooler와 Prisma**: `DATABASE_URL`에 `?pgbouncer=true`가 없으면 prepared statement 충돌로 간헐 실패한다. 증상이 "가끔 되고 가끔 안 됨"이라 진단이 오래 걸린다.
- **Vercel Cron은 Hobby 플랜에서 하루 1회**다. 야간 pull 1회가 요구사항이라 지금은 맞지만, 주기를 늘리려면 플랜을 봐야 한다.
- **GitHub App 개인키는 개행이 들어간 PEM**이다. Vercel env에 넣을 때 개행이 `\n` 문자열로 이스케이프되므로 읽는 쪽에서 복원해야 한다. 안 하면 JWT 서명이 조용히 실패한다.
- **`.pem`은 `.gitignore`에 있다.** 이 패턴이 뚫리면 리포 쓰기 권한이 새어나간다.
- **`orphaned`는 삭제가 아니다.** export에서만 빠지고 DB엔 남는다. "번역이 사라졌다"는 제보를 받으면 먼저 이 플래그를 본다.

## 명시적 비범위

**정본은 [docs/MVP.md](./docs/MVP.md) §7이다.** 요청받아도 먼저 그 목록을 근거로 되묻는다 — PoC 범위를 지키는 게 이 프로젝트의 성패다.

큰 축만: ICU 복수형, 동시 편집, 다중 프로젝트, 세밀한 권한, in-context 편집, 스크린샷 첨부, 번역자 노트, 승인 워크플로, push 웹훅.

컨텍스트 제공은 **코드 참조 자동 수집 + 네임스페이스 단위 그룹핑** 두 개까지다. 편집 UI의 성패가 컨텍스트에 달려 있지만, 그 답이 "기능을 더 넣기"는 아니다.

## 메모리 & 참고 문서

- **`docs/MVP.md` — 기본 스펙. 범위·근거·세 흐름의 계약. 작업 착수 전 필독**
- `docs/ARCHITECTURE.md` — 설계 상세·함정 (코어 로직 건드리기 전 필독)
- `docs/POSTMORTEM.md` — 과거 함정 (`/implement`·`/refactor`·`/code-review` 착수 전 grep)
- `~/code/bugshot-2` — 이 하네스의 원본이자, 셋업 완료 후 push/pull 실전 테스트 대상(ko/en/fr 3개 로케일). **하네스를 참고할 때 그 리포의 i18n 구현을 조사 대상으로 삼지 않는다.**
- `~/.claude/projects/-Users-sinhyeokkang-code-i18n-poc/memory/` — Claude Code 전용 개인 메모리 (Codex는 읽지 않는다)
