# AGENTS.md

> **이 파일은 자동 생성물이다.** 원본은 [CLAUDE.md](./CLAUDE.md)이고 `pnpm sync:agents`가 아래 본문을 그대로 복제한다.
> 고칠 내용이 있으면 **CLAUDE.md를 고치고** `pnpm sync:agents`를 돌려라 — 이 파일을 직접 편집하면 다음 sync에서 덮어써진다.
> 같은 규칙이 `.agents/skills/`(= `.claude/commands/` 미러)에도 적용된다. 이 프리앰블만 예외로 `.agents/PREAMBLE.md`에서 손으로 관리한다.
> 본문이 `CLAUDE.md`·`.claude/commands/`를 가리키면 **그 원본 경로가 맞다** — 치환 없이 복제하므로 그대로 읽으면 된다.

## Codex 런타임 차이 (이 프리앰블 전용)

Claude Code에만 있는 자동 안전망이 Codex 세션에는 없다. 아래는 **직접** 챙긴다.

- **스킬 호출 매핑** — 본문이 `/<name>`으로 부르는 스킬은 Codex에선 `source-command-<name>` 스킬로 로드한다.
- **미제공 스킬 (역할 분담)** — `/push`·`/merge`·`/sync` 셋은 미러하지 않는다. **Codex는 작업 → 커밋까지, 원격으로 나가는 건 Claude Code**가 단일 창구로 맡는다 — 두 창구가 경쟁하면 원격 상태가 깨진다. `/push`는 dev를 움직이고(preview 배포), `/merge`는 main 머지(= Vercel 프로덕션 배포)이며, `/sync`는 dev를 force update한다. 셋 중 하나가 필요해지면 사용자에게 Claude Code 세션에서 실행하라고 안내하고 멈춘다.
- **`/ship`은 10단계(마지막 커밋)까지** — `source-command-ship`은 미러돼 있고 커밋 단계까지 전부 돈다. 11단계 push는 **수행하지 않고** "dev 푸시 대기 — Claude Code에서 `/push` 실행"을 리포트에 남기고 종료한다. **Claude Code의 `/ship`도 dev까지다** (2026-09-04 브랜치 분리 — preview 배포). 프로덕션은 어느 런타임에서도 `/ship`이 하지 않고 `/merge`가 받는다. 상세는 스킬 본문의 "push 권한 / 런타임별 종착점".
- **결정성 훅 없음** — Claude Code는 `.claude/settings.json`의 PostToolUse 훅이 `lib/adapters/`·`lib/githash.ts`·`lib/push/`·`lib/keys/`·`lib/scan/` 편집 시 관련 테스트를 자동 실행해 결정성·판정 붕괴를 차단한다. Codex엔 이 훅이 없으니 그 파일을 건드렸으면 손으로 돌린다: `pnpm test`
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

강제 장치는 2단이다: 이 섹션(두 런타임 공통 — Codex는 `AGENTS.md` 미러로 받는다)과, `.claude/settings.json`의 `UserPromptSubmit` 훅이 매 턴 **이 절의 요약**을 컨텍스트에 재주입하는 것(응답 스타일 + 범위 한 줄이고, 문서 전체의 요약이 아니다 — **그 범위 줄은 SAAS.md를 가리킨다**, 2026-09-07에 MVP.md에서 옮겼다)(긴 세션에서 문서 앞쪽이 희석되는 걸 막는다). **훅은 Claude Code 전용이라 Codex 세션에선 이 섹션만 남는다.**

**✅ MVP는 닫혔고 현재 단계는 SaaS화다** (2026-09-05). **SaaS는 단계로 쪼개져 있고 5단계(탐지 온보딩)까지 프로덕션에 나갔다** — 2단계(인증·인가)는 2026-09-06에, **4·5단계는 2026-09-07에**(PR [#9](https://github.com/SinhyeokKang/malmoi/pull/9) → squash `f595cc3`, `db:deploy`로 prod 마이그레이션 11개 반영). 5단계는 **잔여 없이 닫혔다** — 마지막이던 Vercel 옛 env 삭제도 2026-09-07에 끝났다(**Production+Preview 둘이었다** — Development엔 없었다). **6단계(번역 UI 재작성 + Publish)는 착수했다** — 2026-09-08에 **6a를 4번의 배송으로 쪼갰고**(`docs/features/translation-ui/tasks.md` 배송 단위), **ship 1**(기반 — 사전 `messages/en.tsx`·순수 판정·스키마 둘·프리미티브 16)이 PR [#12](https://github.com/SinhyeokKang/malmoi/pull/12) → squash `46df51a`로 **프로덕션에 나갔고**(`db:deploy`로 prod 마이그레이션 12개), **ship 2**(셸)와 **ship 3**(T7 — 번역 화면·필터·Publish·편집 손실 배너)이 PR [#14](https://github.com/SinhyeokKang/malmoi/pull/14) → squash `add099a` · PR [#15](https://github.com/SinhyeokKang/malmoi/pull/15) → squash `ef9da44`로 **프로덕션에 나갔고**, **ship 4**(T8·T9 — 설정·새 프로젝트·초대 수락 + 문서·chore)가 PR [#16](https://github.com/SinhyeokKang/malmoi/pull/16) → squash `695e441`로 **프로덕션에 나가 6a가 닫혔다.** **6b-1**(어댑터 오류 코드화 + survey 분류기 + 14차 재측정 — ADAPTER-COVERAGE §20)과 **6b-2**(멤버 화면)가 PR [#17](https://github.com/SinhyeokKang/malmoi/pull/17) → squash `982cb42` · PR [#19](https://github.com/SinhyeokKang/malmoi/pull/19) → squash `a00d380`으로 **프로덕션에 나갔고**, **6b-3**(설정의 기준 브랜치·기준 로케일 — `Project.declaredBaseLocale` 신설)과 **6b-4**(`/account`) · **6b-5**(`/projects/:slug/locales`) · **6b-6**(`/projects/:slug` Home — 착지점)이 2026-09-09에 **dev에 올랐고 그로써 6단계가 끝났다.** **IA 정본은 SAAS §7.7**이고 라우트 여덟 중 남은 것은 `logs` 하나인데 그것은 **7단계**다(`SyncRun`의 소비자). 남은 잔여는 **6b-3의 T6**(실물 409 검증 — 대상 리포 워크플로가 프로덕션 `/api/push`를 찌르므로 `/merge` 뒤에 돈다) 하나다. **지금 무엇을 만드는지의 정본은 [docs/SAAS.md](./docs/SAAS.md)** 이고, `docs/MVP.md`·`docs/TASKS.md`는 **PoC 기록으로 닫혔다.** 경계가 이렇다: **MVP.md·TASKS.md = PoC(닫힘) / SAAS.md = 지금.** 아래는 그 PoC가 무엇이었는지다.

**MVP 범위는 셋이었다** (2026-09-03 재정의 — MVP §8.1): **A** `lib/` 모듈이 각자 계약을 닫고 → **B** 세 흐름이 끝에서 끝까지 값을 안 잃고 → **C** Actions·Cron으로 자동으로 돈다. 여기까지가 MVP이고, 그다음이 SaaS화(인증·인가, 프로젝트 생성, 복수 멤버, **UI 시작**)다. **편집 UI는 동작 확인용으로 동결**한다 — SaaS에서 새로 만들 화면을 지금 다듬으면 버려진다 (§8.3).

말모이(`malmoi`): 사내 로컬라이제이션 관리 도구(TMS) PoC. **이름은 1910년대 조선어사전 편찬 사업에서 왔다** — 흩어진 말을 여러 사람이 모아 하나로 만드는 일이 이 도구가 하는 일이다. 표기는 문서 본문 `말모이`, 코드·리포명·slug·도메인 `malmoi`(2026-09-04 개명, 옛 이름 `i18n-poc`). 크롬 확장의 `_locales/<locale>/messages.json`을 대상으로, 개발자가 코드에 심은 소스 문자열을 DB로 올리고(push), 비개발자 동료가 웹 UI에서 번역하고, 그 결과를 고정 브랜치의 PR 하나로 되돌려보낸다(pull). Crowdin/Tolgee 대체가 목표가 아니라 학습·실험이고, 사내에서 실제로 한 번 써볼 수 있는 수준이 목표다.

**PoC 스펙 문서는 [docs/MVP.md](./docs/MVP.md)다** (닫힘 — 현재 단계 스펙은 [docs/SAAS.md](./docs/SAAS.md)). 무엇을 만들고 무엇을 안 만드는지, 각 기술 선택의 근거, 세 흐름(push·편집 UI·pull)의 단계별 계약, 스키마, 구현 순서가 전부 거기 있다. **작업을 시작하기 전에 읽고, 설계 결정이 바뀌면 코드보다 먼저 그 문서를 고친다.** 이 문서(CLAUDE.md)는 *어떻게 작업하는가*를 다루고, MVP.md는 *무엇을 만드는가*를 다룬다.

## 코어 설계 원칙: 번역 값은 DB가 진실, 소스 키는 코드가 진실

**이 프로젝트의 유일한 축이고, 여기서 파생되지 않는 복잡도는 전부 의심 대상이다.** (원문·근거는 [docs/MVP.md](./docs/MVP.md) §2)

두 종류의 데이터에 각각 소유자를 하나씩 배정한다. 소스 키(어떤 문자열이 존재하는가)는 **코드만** 안다. 각 축에 소유자가 하나뿐이므로 **머지 로직이 아예 존재하지 않는다** — export는 DB에서 결정적으로 재생성되니, git 브랜치가 갈라져도 base에서 다시 따서 파일을 새로 뽑으면 끝난다. 3-way merge도, 충돌 해소 UI도, "누가 이겼나" 판정도 없다.

**번역 값의 진실은 시점에 따라 갈린다** (strict 정책 — MVP §3.1): push 시점엔 리포가 DB를 덮고, 그 사이엔 DB가 진실이며 pull이 리포로 되돌려준다. 어느 순간에도 **두 쪽을 병합하지 않는다** — 이 원칙이 실제로 지키는 것은 "단일 소유자"가 아니라 **"병합 없음"** 이다.

따라서:

- **push는 리포 값으로 번역을 덮고 저자도 비운다** (`ON CONFLICT DO UPDATE`, strict — `"updatedBy" = NULL`, 2026-09-08). 변경 감지도 병합도 없다. **덮인 값의 저자는 리포이므로 사람 이름이 남는 쪽이 거짓이었다** (MVP §10 미결 하나가 여기서 닫혔다). 미배포 집계(`countUnpublished`·`isUnpublished`)가 그 조건 위에 선다 — `updatedAt`만 보면 push가 전 행의 시각을 올려 code push 직후 903키 전부가 "안 보낸 편집"이 된다. **대가는 편집 손실 창이다** — 번역자가 편집한 뒤 pull PR이 머지되기 전에 코드가 푸시되면 그 편집이 사라진다 (MVP §3.1). 정책을 느슨하게 하면(변경 감지·병합) 이 원칙이 요구하는 단순성이 무너진다.
- **키는 삭제하지 않는다.** 코드에서 사라진 키도 `orphaned` 플래그만 세운다 — 브랜치를 되돌리거나 기능을 복구하면 번역이 그대로 살아 돌아와야 한다. 삭제는 되돌릴 수 없어 이 원칙을 깬다.
- **pull은 값을 병합하지 않는다.** **모든 어댑터가 원본 파일 내용을 읽는다** (2026-09-04) — 수술적 치환(`ts-dict`·`yaml-catalog`·`code-dict`)은 **구조**(빈 줄·주석·키 순서)를, 재생성(`chrome-locales`·`json-catalog`)은 **표현**(들여쓰기·한 줄 컨테이너·이스케이프·필드 순서)을 가져온다. 어느 쪽도 **값**은 아니다. 값은 전부 DB에서 온다. 기존 값과 DB 값을 견줘 고르는 코드가 생기는 순간 이 원칙이 깨진다. *(2026-09-01 정정: 이전 서술은 "읽는 것은 blob SHA뿐"이었는데 MVP §4.1이 승인한 수술적 치환과 어긋났다 — 지키는 것은 "안 읽는다"가 아니라 "병합하지 않는다"다.)*
- **export는 결정적이어야 한다.** 같은 DB 상태 → 언제나 바이트 단위로 같은 파일. 이게 깨지면 blob SHA 비교가 매번 "변경됨"을 뱉어 무의미한 커밋이 쌓이고, 변경 감지 최적화 전체가 무너진다.

## 작업 원칙

- **가정을 명시**: 해석이 여러 개면 조용히 하나 고르지 말고 선택지를 제시. 불확실하면 물어라.
- **더 단순한 방법이 있으면 제안**: 200줄을 50줄로 줄일 수 있으면 줄여라. 요청하지 않은 유연성·설정 가능성·추상화 추가 금지. **이 프로젝트는 PoC다** — 확장성을 위한 선반영은 그 자체가 결함이다.
- **외과적 변경**: 요청과 직접 관련 없는 인접 코드 개선·리팩터 금지. 기존 스타일 따르기. 기존 dead code는 언급만 하고 삭제하지 않는다 — 내 변경이 만든 고아만 제거.
- **검증 가능한 목표로 전환**: "버그 고쳐" → "재현 테스트 작성 후 통과시켜". 멀티스텝 작업은 단계별 검증 체크를 포함한 플랜을 먼저 제시.
- **테스트 우선**: 신규 인터페이스(함수·헬퍼·어댑터) 추가 시 테스트를 먼저 작성하고 구현한다. 기존 로직 변경 시에도 관련 순수 함수의 단위 테스트를 작성/갱신하고 `pnpm test` 통과를 확인한 뒤 작업을 마친다. 테스트 없이 코드만 변경하지 않는다.

## 스택

**버전은 2026-08-31 기준으로 실제 설치·빌드 검증된 조합이다.** 임의로 올리지 않는다 — 특히 `next-auth`는 beta라 마이너 변경에 API가 움직인다.

| 영역 | 선택 | 버전 |
|---|---|---|
| 앱 | Next.js App Router (React 19, TypeScript) | `next` 16.3.3 / `react` 19.2.8 / `typescript` 7.0.2 |
| 배포 | Vercel — **dev push = preview / main 머지 = 프로덕션**(`https://mal-moi.com`) | — |
| DB | Supabase Postgres **둘** — prod(`malmoi`, ref `xgsyyapzkpbdtkrprlmn`) / dev(`malmoi-dev`, ref `bfugwmjubgmmroevrave`) | — |
| 테넌시 | **편집 경로는 멀티테넌트다** (2026-09-05) — 프로젝트는 URL의 slug, 권한은 `ProjectMember`가 정하고 모든 진입점이 `getProjectAccess`를 지난다. ✅ **두 라우트 모두 단일 프로젝트 가정을 벗어났다** (2026-09-07): `/api/push`는 토큰이 프로젝트를 정하고(`sha256(Bearer)` → `Project.pushTokenHash` → slug 대조), `/api/pull`은 준비된 **전 프로젝트를 순회**한다(`lib/pull/targets.ts`, 프로젝트별 try/catch + 배열 응답). 공유 slug env를 읽는 코드가 남아 있지 않다 | — |
| ORM | Prisma 7 — **접속 URL이 스키마에 없다.** 마이그레이션은 `prisma.config.ts`(`DIRECT_URL`, 5432) / 런타임은 driver adapter(`DATABASE_URL`, 6543) | `prisma`·`@prisma/client`·`@prisma/adapter-pg` 7.10.0 + `pg` 8.23.0 |
| 로그인 | Auth.js v5 **DB 세션** — GitHub + Google **둘 다 열려 있다** (2026-09-05, 허용 목록 제거와 같은 커밋). 로그인은 **검증된 이메일만** 요구하고, 그것이 아무것도 열지 않는다 — 인가는 `ProjectMember`다. ⚠️ **Google 동의 화면은 External + 테스트**여야 한다(Internal은 조직 밖 계정을 `403 org_internal`로 막아 초대 경로를 통째로 죽인다) | `next-auth` 5.0.0-beta.32 + `@auth/prisma-adapter` 2.11.3 (`@auth/core@0.41.3`을 정확히 고정해 인스턴스를 공유한다) |
| 리포 쓰기 | GitHub App **installation 토큰** — `octokit`의 `App`을 쓴다 (`@octokit/auth-app` 별도 설치 불필요) | `octokit` 5.0.5 |
| 계정 연결 | 같은 App의 **user-to-server 토큰** (2026-09-06, SaaS 4단계) — "이 사람이 이 설치를 볼 수 있는가"를 묻는 데만 쓰고 **GET만** 부른다. ⚠️ **`octokit`이 재수출하는 `OAuthApp`으로는 안 된다** — `clientType: "oauth-app"`으로 고정된 클래스라 github-app 모드가 타입상 `never`로 접히고 `defaults`로도 못 되돌린다(실측). 그래서 이미 전이 의존성이던 것을 **직접 의존성으로 승격**했다 | `@octokit/oauth-app` 8.0.4 |
| 스타일 | Tailwind CSS 4 — **`tailwind.config.js`가 없다.** 테마는 `app/globals.css`의 `@theme` | `tailwindcss`·`@tailwindcss/postcss` 4.3.3 |
| UI | **`components/ui/`를 이 리포가 소유한다** (2026-09-08, 6a T5 — shadcn 생성물 4개는 삭제됐고 CLI를 다시 돌리지 않는다). 프리미티브 16개 + `radix-ui`에서 DropdownMenu·Dialog·Tooltip 셋. **라이트 단일, `dark:` 금지**. 시각 규칙은 [docs/DESIGN.md](./docs/DESIGN.md) | `radix-ui` 1.6.7 (단일 통합 패키지 — `@radix-ui/react-*` 개별 설치 아니다) · `class-variance-authority` |
| 아이콘 | `lucide-react` 1.37.0 | |
| 폰트 | **Pretendard Variable 동적 서브셋, 자사 호스트** | `pretendard` 1.3.9 |
| 검증 | Zod 4 — `/api/push` 페이로드 등 외부 진입점 | `zod` 4.5.4 |
| YAML | `yaml` — **CST 보존 수술적 치환용**(`parseDocument`). 주석·앵커·빈 줄을 지켜야 해서 재생성용 파서로 쓰지 않는다 | `yaml` 2.9.0 |
| **키·원문 출처** | **리포의 로케일 파일** — 어댑터가 양방향으로 읽고 쓴다 (`lib/adapters/`) | — |
| 사용처 수집 | `ts-morph` AST + 정규식 — **`refs` 전담, 실패는 경고** | `ts-morph` 28.0.0 |
| 스크립트 실행 | `tsx` — `scripts/scan.ts` CLI 실행용 | `tsx` 4.23.13 |
| 테스트 | Vitest (순수 함수 단위) | `vitest` 4.1.11 |
| Node | `.nvmrc` **24** — `@types/node`를 이 메이저에 맞춘다(`^24`). **정본은 Vercel 프로젝트의 Node.js Version이다** (2026-09-03 실측 24.x): 프로덕션이 그 버전으로 빌드하므로 로컬·CI가 따라간다 | `@types/node` 24.13.3 |
| DB 접속 | Supabase 리전 `ap-northeast-1` (도쿄). 직결 `db.<ref>.supabase.co`는 IPv6 전용이라 Vercel에서 안 붙으므로 **마이그레이션도 pooler**를 쓴다 | — |

⚠️ **`lucide-react`는 셸 전 항목이 든다** (DESIGN §6.8 — 접힌 레일에서 아이콘이 유일한 라벨이다). Radix는 `components/ui/`의 프리미티브 셋을 통해서만 쓰인다. ⚠️ **`sonner`·`tw-animate-css`는 사용 0으로 확인돼 2026-09-08에 제거했다** — 피드백은 셀 인라인(저장)과 `Alert`(Publish)이고 토스트는 그것을 둘로 가른다. `components/__tests__/client-graph.test.ts`가 `sonner`를 금지 목록으로 들고 있다.

**린터·다크모드·가상 스크롤·테이블 라이브러리는 없다.** 필요해지면 그때 넣는다 (`next-themes`·`@tanstack/*` 미설치).

**⚠️ `app/globals.css`의 `@custom-variant dark` 한 줄이 라이트를 고정한다.** Tailwind v4는 `dark:`의 기본 동작이 `prefers-color-scheme`이라, **그 줄을 지우면 누가 `dark:`를 하나 쓰는 순간 OS 다크에서 살아난다.** 지금 소스에 `dark:`는 0곳이지만(shadcn 생성물과 함께 사라졌다) 그 줄은 남긴다 — 막는 것이 요지다. 상세는 [docs/DESIGN.md](./docs/DESIGN.md) §3.1.

### Prisma 7 — v6와 배선이 다르다

`url`·`directUrl`이 스키마에서 제거되고 driver adapter가 필수가 됐다. v6 문서·예제를 그대로 적용하면 valid하지 않다.

| 용도 | 위치 | 환경변수 | 포트 | 어느 DB |
|---|---|---|---|---|
| 마이그레이션 생성·상태 | `prisma.config.ts` | `DIRECT_URL` | 5432 (session) | **dev** |
| 마이그레이션 **프로덕션 반영** | `prisma.config.ts` (`PRISMA_TARGET=prod`) | `DIRECT_URL_PROD` | 5432 (session) | **prod** |
| 런타임 쿼리 | `lib/db.ts` (`PrismaPg` adapter) | `DATABASE_URL` | 6543 (transaction) | 로컬·Preview는 dev / 프로덕션은 prod |

**`PRISMA_TARGET`을 사람이 넘기지 않는다** — `package.json`의 `db:deploy`·`db:status:prod`가 세운다. 없으면 dev(안전한 쪽)로 떨어지고, `.env.example`에도 넣지 않는다(사람이 채우는 값이 아니다).

- 클라이언트는 `generated/prisma/`로 생성된다 (**gitignore된 산출물** — CI가 typecheck 전에 `db:generate`를 돌린다). import는 `@/generated/prisma/client`
- `prisma.config.ts`가 **`.env.local`을 명시적으로 읽는다.** `dotenv` 기본값은 `.env`라서 경로를 안 주면 URL이 `undefined`가 되고 `P1001 Can't reach database server`로 오진하게 된다
- ⚠️ **`prisma.config.ts`에서 `env("DIRECT_URL")`을 쓰지 않는다.** 그 헬퍼는 config **로드 시점에** 던지고 이 파일은 `prisma generate`에도 로드되므로, `.env.local`이 없는 환경(Vercel·새 체크아웃)의 `pnpm build`가 통째로 죽는다. `datasource`는 마이그레이션·introspection 전용이라 **조건부로 넣는다** — 없으면 그 명령에서만 실패하고, Prisma가 명령 이름까지 찍어 알려준다. 같은 파일이 같은 이유로 두 번 터졌다 (`docs/POSTMORTEM.md` 2026-08-31 + 🔁 재발)
- **✅ dev DB와 prod DB가 갈렸다** (2026-09-04). Supabase 프로젝트 둘 — `malmoi-dev`(로컬·Preview) / prod(프로덕션 배포). `pnpm db:migrate`가 프로덕션에 **닿을 수 없다.**
  - **새 실패 모드가 생겼다**: dev에만 적용하고 `db:deploy`를 잊으면 배포 순간 프로덕션이 없는 컬럼을 조회한다. 분리 전에는 `migrate dev`가 이미 프로덕션을 바꿔놔서 잊어도 안 깨졌다. 그래서 **`/merge` 1단계가 `pnpm db:status:prod`를 확인한다** — `/push` 3단계와 `db:status`는 dev만 본다
  - `--create-only` + `db:deploy`로 쪼개는 습관은 유지한다: 생성한 SQL을 프로덕션에 보내기 전에 눈으로 본다
  - **dev에서는 리셋을 승인해도 된다** (번역 데이터가 없다 — 폐기용 리포 적재분뿐이고 `push:local`로 복구된다). ⚠️ 단 `db:deploy`는 prod를 겨누므로 그 명령에 리셋 개념이 없다는 것을 전제로 한다. 상세는 `/db`

### 데이터 변경 경로 — 내부는 Server Action, 외부 진입점만 Route Handler

| 경로 | 형태 | 호출자 |
|---|---|---|
| 번역 값 저장, pull 트리거 | **Server Action** (`app/(edit)/actions.ts`) | 편집 UI |
| 초대 발급·멤버 변경 | **Server Action** (`app/(edit)/projects/actions.ts`) | 편집 UI (OWNER) |
| 프로젝트 생성·탐지·첫 적재·토큰 재발급 | **Server Action** (같은 파일, 2026-09-07 SaaS 5단계) | 온보딩 UI — 프로젝트가 없는 넷은 `requireUser`뿐이다 |
| 초대 수락 | **Server Action** (`app/invite/actions.ts`) | 초대 링크 — **인가 예외**, 토큰이 대신한다 |
| `/api/push` | Route Handler | GitHub Actions — Bearer가 **그 프로젝트의 토큰 원문**이다 (서버 env가 아니다, 2026-09-07) |
| `/api/pull` | Route Handler | Vercel Cron만 (`CRON_SECRET`) — 편집 UI 버튼은 Server Action이 `triggerPull`을 직접 부른다 |

**내부 쓰기에 Route Handler를 새로 만들지 않는다.** 클라이언트 fetch 배선과 중복 스키마가 생기고, `revalidate`를 손으로 배선해야 한다. 역으로 **외부가 부르는 진입점을 Server Action으로 만들지 않는다** — Actions는 안정된 공개 계약이 아니다.

### 세션은 DB에 있다 — 권한 회수가 다음 요청부터 반영된다 (2026-09-05 전환)

`session: { strategy: "database", maxAge: 60 * 60 * 24, updateAge: 60 * 60 }` + `@auth/prisma-adapter`. **세션에 담는 것은 `userId` 하나**이고 권한은 매 요청 `ProjectMember`에서 읽는다 — 토큰에 role이나 projectIds를 실으면 JWT의 지연 문제가 그대로 돌아온다 (SAAS §5.3).

**JWT를 고른 원래 이유는 "사용자 테이블 4개가 사라진다"였고, 그 대가가 "허용 목록에서 뺀 사람이 최대 하루 편집할 수 있다"였다** (MVP §5). SaaS는 그 절제를 되돌린다 — 멤버 제거와 역할 변경이 즉시 반영돼야 하기 때문이다. 지불하는 대가는 **요청마다의 DB 왕복**이다.

**인가도 함께 바뀌었다** (2026-09-05, §5) — 편집 경로의 모든 진입점이 `getProjectAccess`를 지나고 프로젝트는 URL의 slug가 정한다. **로그인은 이제 누구에게나 열려 있고, 그것이 아무것도 열지 않는다** — 멤버십이 없으면 어떤 slug를 쳐도 `not-found`다.

⚠️ **`maxAge` 24시간은 "마지막 활동 뒤 24시간"이다** (2026-09-06 결정 — `updateAge` 1h). 그 전엔 `updateAge`를 안 줘서 기본값(24h)이 `maxAge`와 같았고, 그러면 Auth.js의 갱신 조건이 `expires`와 일치해 **세션이 한 번도 연장되지 않았다** — 로그인 정각 24시간 뒤 편집 도중 끊기고 쿠키까지 사라졌다. 활동 중인 세션은 시간당 한 번 DB 쓰기로 연장된다 (ARCHITECTURE §6.1.1).

⚠️ **`auth()`를 직접 부르지 않는다 — `readSession()`을 쓴다** (`lib/auth/read-session.ts`, 2026-09-06). `auth()`는 어댑터 예외를 삼키고 `null`을 돌려주므로 **DB 장애와 비로그인이 반환값으로 구별되지 않는다** — 장애를 `/`로 보내면 정상 로그아웃과 바이트 단위로 같은 응답이 되어 프로덕션 전면 장애를 "정상"으로 읽었다 (POSTMORTEM 2026-09-06). `readSession`은 `logger.error` + AsyncLocalStorage로 `unavailable`을 가르고, 그때 `/?error=Unavailable`·"일시적인 오류" 문구로 간다 (ARCHITECTURE §6.1.2).

⚠️ **미들웨어에서 `auth()`를 부르지 않는다** — DB 세션에서 그 래퍼는 DB를 읽고 세션 갱신 쓰기까지 한다. **렌더 요청(GET·HEAD)에** 쿠키 이름만 보는 것으로 갈랐고, **Server Action POST는 통과시킨다**(307이면 `fetch`가 POST를 `/`로 재전송해 페이지 오류가 된다 — Action은 스스로 인증한다). 상세는 [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) §6.1이다.

### 키 리스트는 가상화하지 않는다

네임스페이스 필터로 자르면 한 화면이 보통 수십~수백 행이다. `@tanstack/react-virtual`·`react-table`을 넣지 않고 순수 렌더로 시작한다. **실제로 느려지는 네임스페이스가 관측되면** 그때 대응한다 — 인라인 편집과 가상 스크롤을 섞으면 스크롤 튐·포커스 유실 함정이 붙는다.

⚠️ **관측됐다** (2026-09-07 실측, `/bugshot-qa`): `ts-dict` 903키 프로젝트의 **필터 없는** 번역 화면이 **12.7초**다 — 903행 · `<input>` 2,711개 · 네임스페이스 52개. 필터를 걸면 위 전제대로 수십 행이다. **그래도 지금 가상화를 넣지 않는다**: 그 화면은 동결분이고(MVP §8.3) SAAS §8 6단계가 재작성하므로, 거기서 "기본 착지를 첫 네임스페이스로" 같은 값싼 수단을 먼저 본다.

✅ **그 값싼 수단이 화면에 붙었다** (2026-09-08, 6a T2 판정 + T7 화면): `defaultNamespace`가 **pending>0인 첫 네임스페이스**로 착지시키고 표는 그 ns의 행만 렌더한다 — `compareKeys` 첫 항목은 알파벳순이라 이미 다 번역된 사소한 ns일 수 있었다. orphaned만 있는 ns는 건너뛴다. **전체 보기는 `?ns=*`로만 간다.**

⚠️ **재측정했고 2초 목표는 미달이다** (2026-09-08 프로덕션, 같은 프로젝트·같은 방법): 필터 없는 화면 **12.7 → 4.66초**(2.7배), **기본 착지 3.30초**. 그런데 **24키 프로젝트도 3.29초이고 `/projects` 목록은 1.42초다** — 약 1.9초가 **키 수와 무관한 고정 비용**이라 **가상화도, 조회를 네임스페이스로 좁히는 것도 이 3.3초를 못 줄인다.** 후보는 순차 DB 왕복(도쿄 리전 — 레이아웃 2회 + 페이지 5회)이고, LCP가 DCL과 거의 같은 것이 그 신호다(TTFB는 10~78ms). 다음 수단 셋은 표를 `Suspense`로 감싸 셸을 먼저 그리기 · 왕복 병합 · 폰트 CSS의 렌더 블로킹 해제이고 **전부 번역 화면 밖이다** (`docs/features/README.md` 백로그).

### 폰트 — Pretendard 동적 서브셋 (생성물)

단일 `PretendardVariable.woff2`는 **2.0MB**다. 동적 서브셋은 92개 구간으로 쪼개져 있고 브라우저가 `unicode-range`로 필요한 구간만 받으므로 ko/en/fr 혼용 UI에서 실 전송량이 150~450KB 수준이다.

- `scripts/copy-fonts.mjs`가 `node_modules/pretendard`에서 `public/fonts/pretendard/`로 복사한다. `predev`·`prebuild`가 자동 실행한다
- **`public/fonts/`는 생성물이라 `.gitignore`에 있다** (3.1MB, 92파일)
- CSS의 `url()`이 `./woff2-dynamic-subset/...` 상대 경로다. **디렉터리 구조를 바꾸면 폰트가 조용히 404가 되고 시스템 폰트로 떨어진다**
- `<link>`로 `app/layout.tsx`가 불러온다 — `globals.css`의 `@import`로 넣으면 스타일시트 체인이 직렬화돼 폰트 요청이 한 단계 늦게 시작된다
- **`.npmrc`의 `enable-pre-post-scripts=true`가 이 자동 실행을 보장한다.** pnpm 버전에 따라 기본값이 달라지고, 안 돌면 에러도 경고도 없이 폰트만 빠진다. 이 파일을 지우지 않는다

**GitHub 자격증명이 셋이고, 섞지 않는다** (2026-09-06에 둘에서 셋이 됐다).

| 무엇 | 어디서 | 무엇을 하나 |
|---|---|---|
| OAuth App 토큰 | Auth.js provider (`AUTH_GITHUB_*`) | **로그인** — 이 사람이 누구인가 |
| GitHub App **user-to-server** 토큰 | `lib/github-connect/user.ts` (`GITHUB_APP_CLIENT_*`) | **연결** — 이 사람이 우리 App의 어느 설치를 볼 수 있는가. **GET만** |
| GitHub App **installation** 토큰 | `lib/github.ts` (`GITHUB_APP_ID`·`GITHUB_APP_PRIVATE_KEY`) | **쓰기** — 커밋·PR |

여기에 `GITHUB_APP_SLUG` 하나가 더 붙는데 자격증명이 아니다 — 설치 링크(`https://github.com/apps/<slug>/installations/new`) 조립용이고 `optionalEnv`라 **없으면 그 링크만 조용히 사라진다**.

OAuth 토큰으로 커밋하면 커밋이 특정 개인 명의가 되고 그 사람이 org를 떠나면 파이프라인이 깨진다. 경계를 넘는 코드가 보이면 리뷰에서 막고, `lib/github-connect/__tests__/credential-separation.test.ts`가 소스에서 상시로 센다 — 개인키가 연결 경로로, 사용자 토큰이 커밋 경로로 가는 것을 양방향으로 막는다.

## 명령어

| 용도 | 명령 |
|---|---|
| 개발 서버 | `pnpm dev` |
| 프로덕션 서버 (로컬) | `pnpm start` (`next start` — 빌드 산출물 확인용. Vercel이 배포에서 쓰는 명령이라 로컬에선 거의 안 쓴다) |
| 빌드 | `pnpm build` (`prisma generate && next build` — **generate가 앞에 붙어 있다**: `generated/`가 gitignore된 산출물이라 깨끗한 체크아웃에서 `next build`만 돌면 `@/generated/prisma/client`를 못 찾는다) |
| 타입 체크만 | `pnpm typecheck` |
| 테스트 | `pnpm test` |
| 테스트 (watch) | `pnpm test:watch` |
| 마이그레이션 생성·적용 (**dev**) | `pnpm db:migrate` (`DIRECT_URL`) |
| 마이그레이션 프로덕션 반영 | `pnpm db:deploy` (`DIRECT_URL_PROD` — 이름 그대로 **prod 전용**이다) |
| 마이그레이션 상태 (**dev**) | `pnpm db:status` |
| 마이그레이션 상태 (**prod**) | `pnpm db:status:prod` — `/merge` 1단계가 이걸 본다 |
| Prisma 클라이언트 재생성 | `pnpm db:generate` |
| DB 브라우저 | `pnpm db:studio` |
| 로케일 적재 | `pnpm ingest <대상 디렉터리> [--json] [--base <locale>] [--adapter <name>]` (포맷 탐지 → 키 적재 → 왕복 검증). **인자 파싱은 네 CLI가, 리포 훑기는 세 CLI가** `lib/cli/`를 공유한다 |
| 사용처 스캔 | `pnpm scan <대상 디렉터리> [--json] [--wrapper <module>#<export>[()]]...` (`refs` 수집 — **결과가 어떻든 exit 0**, 사용법 오류만 2). 끝의 `()`가 훅이고(`next-intl#useTranslations()`), **여러 번 줄 수 있다** |
| 로컬 push | `pnpm push:local <대상 디렉터리> --project <slug> [--url ...] [--wrapper ...] [--adapter ...] [--base <locale>]` (적재+스캔+POST). ⚠️ `--base`는 2026-09-04 감사가 더했다 — 키 집합의 진실이 base 파일이라 틀리면 진짜 base에만 있는 키가 orphaned로 떨어진다 |
| 어댑터 범용성 측정 | `pnpm adapter-survey <리포목록.txt> [--json] [--verdicts <파일>] [--out <파일>] [--limit N] [--jobs N]` (오픈소스 리포에 detect·read·왕복을 돌려 지표를 낸다 — **읽기 전용, 결과가 어떻든 exit 0** — 사용법 오류만 2. 파이프엔 `pnpm --silent`) |
| GitHub App 스모크 | `pnpm smoke:github <project-slug>` (**읽기만** — App 토큰→base head→트리→글롭 매칭 확인. 실 API라 `pnpm test` 밖이다) |
| 폰트 재복사 | `node scripts/copy-fonts.mjs` (predev·prebuild가 자동 실행) |
| Codex 미러 동기화 | `pnpm sync:agents` (검사만: `pnpm sync:agents:check`) |

### 새 머신 셋업 (체크아웃 3개 산출물이 전부 gitignore다)

**두 대에서 작업한다.** 새 체크아웃은 `node_modules`·`generated/prisma`·`public/fonts`·`.env.local`이 전부 없고, 앞의 셋은 명령으로 복구되지만 **`.env.local`만 사람이 채운다.**

1. **Node를 `.nvmrc`에 맞춘다** (24). 로컬 게이트와 CI가 `.nvmrc`를 따르므로(위 브랜치·배포 섹션), 로컬과 Vercel의 메이저가 갈리면 두 게이트가 함께 거짓 green이 된다. **어긋났을 때 맞추는 방향은 Vercel 쪽이다** — 프로덕션이 진실이고 `.nvmrc`가 따라간다 (2026-09-03에 반대로 적었다가 고쳤다: `.nvmrc`가 20인데 Vercel 프로젝트는 24.x였다)
2. `pnpm install`
3. `cp .env.example .env.local` 후 값을 채운다. **⚠️ 이 파일은 에이전트가 편집하지 않는다** — 편집하면 하네스가 "파일이 바뀌었다" 알림으로 **전문을 컨텍스트에 넣어** 시크릿이 트랜스크립트에 남는다 (2026-09-04에 실제로 그렇게 유출돼 전면 재발급했다). 구조가 필요하면 에이전트가 **다른 경로에 템플릿을 쓰고** 사람이 값을 채워 옮긴다. 값을 꺼낼 때도 `| pbcopy`로 클립보드에만 보낸다. ⚠️ **`vercel env pull`로는 못 가져온다** — 11개가 전부 Vercel의 **Sensitive**로 등록돼 있어 CLI도 대시보드도 값을 못 읽는다(`[SENSITIVE]` 플레이스홀더만 내려온다). **다른 머신의 `.env.local`을 옮기는 것이 정상 경로**이고, 그게 불가능하면 전면 재발급이다 (2026-09-03에 한 번 겪었다 — 아래). 시크릿을 리포·채팅에 붙여넣지 않는다
   - ⚠️ **GitHub OAuth 앱이 셋인데 `.env.local`이 갖는 건 하나뿐이다** (2026-09-04 브랜치 분리 뒤). callback URL을 앱당 하나만 등록할 수 있어서 갈렸다:

     | 앱 | callback | 자격증명이 사는 곳 |
     |---|---|---|
     | 프로덕션 | `https://mal-moi.com/api/auth/callback/github` | Vercel **Production** 스코프 |
     | preview | `<dev 브랜치 고정 URL>/api/auth/callback/github` | Vercel **Preview** 스코프 |
     | 로컬 | `http://localhost:3000/api/auth/callback/github` | **`.env.local` — 두 머신이 이 앱 하나를 공유한다** |

     ⚠️ **Google은 반대다 — 클라이언트가 하나다.** Google Cloud의 웹 클라이언트는 redirect URI를 **여러 개** 등록할 수 있어서 로컬·preview·프로덕션 셋(`…/api/auth/callback/google`)을 한 클라이언트에 넣고, `AUTH_GOOGLE_ID`·`AUTH_GOOGLE_SECRET`은 `.env.local`과 Vercel의 Production·Preview 스코프에 **같은 값**이 들어간다. ⚠️ **동의 화면은 External + 테스트**여야 한다: Internal이면 조직 밖 계정이 `403 org_internal`로 막히는데, 비개발자 동료를 초대하는 것이 이 provider를 넣은 이유 전부다.

     **새 머신에 채우는 `AUTH_GITHUB_ID`·`AUTH_GITHUB_SECRET`은 로컬 앱 것이다.** 앞의 둘은 어느 `.env.local`에도 들어가지 않으므로 머신을 옮길 때 따라다닐 필요가 없고, 잃어버려도 GitHub에서 secret을 재발급해 Vercel의 해당 스코프만 갱신하면 된다(전면 재발급이 아니다). Vercel의 **Development 스코프는 쓰지 않는다** — `vercel env pull`을 안 쓰고 이 파일을 손으로 관리하므로 그 스코프를 읽는 곳이 없다
4. `pnpm db:status`로 **dev** 접속을, `pnpm db:status:prod`로 **prod** 접속을 확인한다 (둘 다 5432). ⚠️ 두 명령의 출력이 **같아 보인다** — pooler 호스트가 두 프로젝트에서 동일하고 ref는 사용자명에 있다. 구별 신호는 **적용된 마이그레이션 개수**이고, 새 dev 프로젝트라면 전부 미적용으로 나온다
5. `pnpm db:generate` — 안 하면 `@/generated/prisma/client`를 못 찾는다 (`pnpm build`는 자동으로 한다)
6. `pnpm typecheck && pnpm test`로 셋업을 확인한다. 폰트는 `pnpm dev`의 `predev`가 복사한다

**전면 재발급을 하게 되면 순서가 있다** (2026-09-03 실행). Supabase 비번 재설정 → `.env.local` → **Vercel env(아래 ⚠️ — 환경을 **하나씩**, 값은 stdin으로. `--value`는 `ps`에 노출된다)** → 재배포(`vercel redeploy <최근 prod URL>`).

⚠️ **`PUSH_TOKEN`은 2026-09-07부터 서버 env가 아니다.** 전에는 로컬·Vercel·Actions 세 곳이 **같은 값**을 들어야 했는데, 지금은 **프로젝트별 토큰**이라 짝이 둘로 갈렸다: 대상 리포의 Actions secret ↔ **그 리포가 붙은 프로젝트의 `Project.pushTokenHash`**. 발급은 설정 화면의 [토큰 재발급]이고 서버는 해시만 갖는다 — Vercel에 그 이름의 변수를 둘 이유가 없고, `.env.local`의 값은 **`push:local`이 보낼 그 프로젝트의 토큰 원문**(로컬 전용)이다. 재발급하면 옛 토큰이 즉시 무효이므로 **대상 리포 secret을 같은 세션에 바꾼다** — 안 바꾸면 그 리포 CI가 401로 죽는다. `CRON_SECRET`은 Vercel만, `AUTH_SECRET`은 로컬과 프로덕션이 달라도 된다(세션이 갈릴 뿐이다). ⚠️ **`AUTH_GITHUB_ID`·`AUTH_GITHUB_SECRET`은 Production과 Preview가 서로 다른 OAuth 앱이다** — `--force`로 갱신할 때 스코프를 뭉뚱그리면 preview 로그인이 조용히 깨진다.

⚠️ **`vercel env add`는 환경을 하나씩만 받고, `--force`를 믿지 말고 목록으로 확인한다** (2026-09-06 실측). CLI 59.11이 `production,preview` 같은 묶음을 받지 않아 환경마다 한 번씩 돌려야 하고, **Preview에서 `--force`가 `✓ Overrode`를 출력하고도 값이 그대로였다**(Production은 같은 명령이 먹었다). 갱신 뒤 `vercel env ls <environment>`의 시각 열을 보고, 안 바뀌었으면 `vercel env rm … --yes` 후 다시 넣는다. 성공 메시지가 근거가 아니다.

```bash
# 파일에서 곧바로 파이프 — 값이 셸 히스토리·프로세스 목록·터미널 어디에도 남지 않는다
awk '{printf "%s\n", $0}' key.pem | sed 's/\\n$//' | vercel env add GITHUB_APP_PRIVATE_KEY production --sensitive --force
```

**GitHub App 개인키는 여러 개를 동시에 가질 수 있다.** 새 키를 발급해도 옛 키가 계속 돌아서 무중단으로 갈아탈 수 있다 — **다른 머신이 옛 키를 들고 있으니 폐기는 그쪽을 옮긴 뒤에** 한다.

⚠️ **그 무중단은 "추가"에만 해당한다. 지우면 그 키를 쓰던 네 곳이 동시에 끊긴다** — 로컬 `.env.local` · Vercel Production · Vercel Preview · 다른 머신. 2026-09-06에 옛 키 하나를 지웠다가 전부 죽었고, **증상이 "App이 설치돼 있지 않다"로 보였다**(`probeRepo`가 401을 `not-installed`로 접던 시절 — POSTMORTEM 2026-09-06). 지우기 전에 **그 키를 누가 들고 있는지 세고**, 넷을 전부 옮긴 뒤에 지운다.

**린터 없음** — ESLint/Prettier/Biome 미도입이라 `pnpm lint`는 존재하지 않는다. 스타일 게이트는 `pnpm typecheck` + `pnpm test`뿐이고, 린터 추가는 요청 없이 하지 않는다.

### CI (GitHub Actions)

`ci.yml` 하나뿐이고 job은 `verify`(**`db:generate`** + typecheck + test + Codex 미러 드리프트) 단일이다. 앞의 스텝은 게이트가 아니라 선행 조건이지만, `.env.local`이 없는 환경에서 `prisma generate`가 도는지의 **상시 검증을 겸한다**(POSTMORTEM 2026-08-31 🔁). 트리거는 **push `[main, dev]` + pull_request `[main]` + 수동(`workflow_dispatch`)** 이다.

**✅ CI가 프로덕션 앞의 게이트다** (2026-09-04 브랜치 분리로 되살아났다). `dev→main` PR에 붙는 run이 그것이고, `/merge`는 그 체크가 green이어야 머지한다. 브랜치가 하나였던 동안에는 PR 이벤트 자체가 없어 CI가 배포 **뒤에** 돌았다 — 그때의 유일한 방어선은 `/push`의 로컬 게이트였다.

트리거 셋의 이유가 각각 다르다:

| 트리거 | 무엇을 막나 |
|---|---|
| push `[dev]` | dev에 red가 쌓이는 것. preview 배포와 같은 커밋을 검증한다 |
| pull_request `[main]` | **프로덕션 머지 게이트.** `/merge`가 이 결론을 본다 |
| push `[main]` | 머지 뒤 확인 + 다른 창구(웹 UI·Codex·다른 머신)가 main을 직접 친 경우 |

dev push와 PR이 같은 SHA에 두 번 도는 것은 **의도된 중복**이다 — PR 체크로 표시돼야 머지 게이트가 되고, dev push run은 PR을 열기 전에도 결론을 준다.

⚠️ **GitHub 브랜치 프로텍션은 여전히 없다** (Free 플랜 + private). PR CI가 게이트인 것은 **`/merge`가 그것을 보기 때문**이지 서버가 강제해서가 아니다 — main에 직접 푸시하는 경로를 서버가 막지 않는다.

**CI에서 `next build`를 돌리지 않는다** — 로컬 게이트(`/push` 1단계)가 이미 돌고 Vercel이 preview·프로덕션 배포에서 다시 돈다. CI에 넣으면 같은 걸 네 번 돌리게 된다.

**빌드는 `/push` 1단계 게이트에서만 자동 실행한다.** 개별 작업 중에는 `pnpm typecheck`를 쓴다 — `/implement`가 `pnpm build`를 돌리지 않는 것은 그 때문이고, 게이트가 `/push`에 있어서다.

## 디렉터리 구조

```
app/
  page.tsx              루트 — 로그인 화면(GitHub·Google). 세션이 있으면 /projects로 redirect.
                        Auth.js의 `pages.error`가 여기라 거부 사유를 `?error=`로 보인다
  layout.tsx            루트 레이아웃 (Pretendard <link>). ⚠️ **`lang="en"`** — 화면 문구가 전부
                        영어라 `app/__tests__/screens.test.ts`가 그것을 고정한다 (2026-09-08 ship 4)
  globals.css           Tailwind 4 @theme + shadcn 토큰 (tailwind.config.js 없음)
  __tests__/            **둘이다.** entry-points — ⚠️ **진입점 소스 스캔**: app/ 아래 모든 page·route·actions가
                        인가를 지나는지 fs로 센다. 예외 6개를 **이름으로** 고정하고 그 이름이 실재하는지도
                        본다. `lib/adapters/__tests__/contract.ts`와 같은 상시 방어선. ⚠️ **쿼리 수신자
                        검사가 생성기 형태도 본다** (2026-09-08) — 화면이 경로를 `routes.*`로 옮기면서
                        `"/path?key="` 리터럴이 0건이 됐고 그 검사가 조용해졌다(자기 "0건 아님" 가드가 잡았다)
                        + screens — `lang="en"`·설정 화면의 revalidate 안전·초대 수락의 갇힘 없음을 소스로 센다
  (edit)/               인증 필요 (1차 차단은 middleware.ts의 쿠키 검사 — GET·HEAD만, Action POST는 통과)
    layout.tsx          셸 + 헤더. 2차 방어로 redirect() (조건부 렌더는 차단이 아니다).
                        ⚠️ Publish 버튼이 없다 — /projects 목록도 감싸므로 slug가 없다
    actions.ts          saveTranslation · triggerPullAction — 둘 다 getProjectAccess를 지나고,
                        그 뒤 planProjectReadiness로 첫 적재 전 프로젝트를 not-ready로 거부한다
                        ⚠️ **`saveTranslation`의 무효화는 `/projects/<slug>` 서브트리다** (6b-6) — 그 행을
                        읽는 화면이 셋이다(번역 표 · 로케일 진행률 · Home). 경로를 나열하면 넷째가
                        조용히 빠진다 (POSTMORTEM 2026-09-09)
    projects/page.tsx   내 멤버십 목록. **로그인 후 착지점**이자 인가 거부의 redirect 목적지 — 사유는
                        `?e=`로 받아 **isAccessError·isConnectError 둘로** 걸러 한 줄 보인다.
                        ⚠️ 앞의 것만 보면 GitHub 연결 실패 사유가 통째로 무음이다 (POSTMORTEM 2026-09-06)
                        ⚠️ **GitHub 계정 섹션은 2026-09-09에 `/account`로 갔다** (6b-4) — 그것이 여기
                        있었던 이유는 "프로젝트 0개인 사용자에게 도달 가능한 자리가 여기뿐"이어서였고,
                        사용자 축 라우트가 생기며 그 이유가 사라졌다. **옮긴 것이지 복제가 아니다**
    account/page.tsx    계정 (6b-4) — **사용자 축의 유일한 화면**. `requireUser`만 지난다(인가할 프로젝트가
                        없다). 프로필(이름·이메일 **읽기 전용** — provider가 소유한다) + GitHub 연결·해제·
                        재인가 + 로그아웃. `?e=`는 `isConnectError` 하나로 거른다.
                        ⚠️ **middleware matcher를 늘려야 했다** — 패턴이 `/projects/:path*` 하나여서
                        `(edit)` 아래 모든 페이지가 **우연히** 그 접두를 갖고 있었다
    projects/new/page.tsx
                        온보딩 (SaaS 5단계). 서버가 ①①'(계정 미연결·설치 0·리포 0)를 그리고 ②~⑥은
                        클라이언트 상태다. ⚠️ **maxDuration=60이 여기 있어야 한다** — Server Action은
                        자기를 부른 페이지 세그먼트의 config를 쓴다. `?e=`를 **isOnboardError·
                        isConnectError 둘로** 읽는다 (callback이 착지시킨다).
                        ⚠️ 어댑터 라벨 표(formatLabel)를 **서버가 만들어 내려준다** — 클라이언트가 그
                        모듈을 값으로 import하면 ts-morph가 번들에 들어온다 (POSTMORTEM 2026-09-07)
    projects/actions.ts createInvitation · changeMember · **revokeInvitation** (OWNER 전용 — member:manage)
                        ⚠️ revokeInvitation은 **행을 지우지 않는다** — `expiresAt`을 당긴다. 스키마가
                        삭제를 금지하고(재사용을 `already-accepted`로 구별해야 한다) 기존 무효화 관용구가
                        `createInvitation`의 토큰 회전이다. `where`에 `projectId`+`acceptedAt: null`이
                        함께 있어 id를 알아도 남의 테넌트를 못 건드린다
                        + 온보딩 일곱 (2026-09-07): startGithubConnectForUser(**6b-4에서 `dest` 인자를 받는다 —
                        `"new" | "account"` 갈래 **이름**만이다. `StateDest`를 통째로 받으면 클라이언트가
                        착지를 골라 open redirect 판정이 생긴다) · disconnectGithub ·
                        listConnectableRepos · detectRepoFormats · createProject · runFirstIngest ·
                        rotatePushToken
                        ⚠️ **앞의 다섯은 requireUser뿐이다** — 생성 경로에는 인가할 프로젝트가 없고
                        `Account` 행은 **사용자 소유**다 (design §3.6). 뒤의 둘은
                        getProjectAccess(project:settings)다
                        ⚠️ **해제가 여기 있는 이유**: 연결이 사용자 수준으로 열려 프로젝트를 하나도 안
                        만든 사용자가 생길 수 있고, 그 사람에게는 설정 화면이 없어 해제에 도달할 길이
                        없었다 — taken-by-other가 영구 잠금이 된다 (2026-09-07 리뷰)
                        ⚠️ **`disconnectGithub`은 `revalidatePath("/", "layout")`이다** (6b-4) — 접두로
                        좁히면 화면이 옮겨갈 때 조용히 못 덮는다 (POSTMORTEM 2026-09-09)
                        ⚠️ **두 GitHub 자격증명이 만나는 유일한 자리다** — 리포 읽기는 App 설치 토큰,
                        "이 사람이 그 설치를 볼 수 있는가"는 사용자 토큰. lib/onboarding/은 둘 다 모른다
                        ⚠️ createProject는 **클라이언트가 보낸 pathTemplate을 저장하지 않는다** — 파일을
                        다시 읽어 detectFormatWith를 돌리고 그 반환값을 저장한다 (design §3.4)
    projects/[slug]/page.tsx
                        Home — **프로젝트 진입의 착지점** (6b-6, 2026-09-09). 게이트 `translation:write`.
                        breadcrumb이 없다(이 화면이 루트다). 로케일별 진행률 + 최근 활동.
                        ⚠️ **착지 클릭 하나를 갚아야 한다** — 진행률 행 전체가 `?focus=` 링크, 활동의
                        편집 항목이 `?ns=`+`?focus=` 링크, primary가 [Open translations]다. 개요만 있고
                        링크가 없으면 그 클릭이 순손실이다 (SAAS §7.7 결정 1)
                        ⚠️ **툴바 지표를 복제하지 않는다** — `countUnpublished`·`loadKeys`를 부르지 않는다
                        (`home-screen.test.ts`가 센다). 진행률은 orphaned를 뺀다(그 열은 disabled다)
    projects/[slug]/locales/page.tsx
                        로케일 목록 + 기준 언어 (6b-5, 2026-09-09). ⚠️ **게이트가 `translation:write`다** —
                        열이 사라진 것을 보는 사람이 번역자이므로 `project:settings` 뒤에 두면 설명이
                        그 사람에게 닿지 않는다. **기준 언어 Card와 대기 Alert만 role로 갈리고 판정은 Action**
                        ⚠️ **이 화면이 생긴 이유는 orphaned 로케일이다** — 그때까지 로케일은 번역 표의 열로만
                        존재해 사유·복구를 말할 자리가 없었다 (ARCHITECTURE §5.5.16)
                        ⚠️ **`?e=` 슬롯이 없다**(보내는 자리가 0) · **표는 Card 밖이다**(겹치는 padding, 실측)
    projects/[slug]/locales/actions.ts
                        updateBaseLocale — 인가 `project:settings`. ⚠️ **6b-3이 `updateRepositorySettings`와
                        한 Action에 뒀던 것을 갈랐다** — 인자를 optional로 두면 서버가 "무엇을 안 보냈나"를
                        추측하게 되고 그것이 malmoi#20의 모양이다.
                        ⚠️ **무효화가 `/projects/<slug>` 서브트리다** — `declaredBaseLocale` 소비자가 셋이라
                        (이 화면·번역 배너·**설정의 워크플로 YAML**) 경로를 나열하면 넷째가 조용히 빠진다
                        (POSTMORTEM 2026-09-09). 실물로 셋 다 확인했다
    projects/[slug]/members/page.tsx
                        멤버 관리 (6b-2, 2026-09-09). ⚠️ **게이트가 `translation:write`다** —
                        `member:manage`로 하면 EDITOR가 못 들어오는데 그 사람도 목록을 봐야 한다
                        (user-stories §5). 컨트롤만 role로 갈리고 **판정은 Action**이 한다.
                        ⚠️ **이것이 `/settings` 섹션이 아니라 별도 라우트인 이유다** — 그 페이지는
                        `project:settings` 뒤라 게이트가 갈린다. `github-connect/spec.md`의 반대 결정을
                        뒤집었고 그쪽에 🔴 STALE을 달았다. ⚠️ **`?e=` 슬롯이 없다**(보내는 자리가 0)
    projects/[slug]/settings/page.tsx
                        리포 연결 + **기준 브랜치** + 상태 + push 토큰 + 워크플로 + GitHub 계정.
                        ⚠️ **기준 로케일 필드와 대기 Alert는 6b-5가 `/locales`로 옮겼다** (2026-09-09).
                        이 화면이 `declaredBaseLocale`에 대해 하는 일은 **워크플로 YAML에 `base-locale:` 한 줄을
                        박는 것뿐**이라 `basePending`은 계속 부르고 **로케일 목록은 조회하지 않는다**
                        (`base-locale-screens.test.ts`가 양방향으로 센다)
                        최상단에서 requireProjectAccess를 던진다. maxDuration=60 (Action이 첫 적재를 돈다).
                        ⚠️ 상태 섹션의 [다시 시도] 컴포넌트는 **readiness 분기 밖**에 있다 — 안에 두면
                        revalidate가 성공 직후 그것을 언마운트해 결과 문구가 사라진다 (POSTMORTEM 2026-09-07)
                        ⚠️ **섹션 둘이 독립적으로 실패한다** — 건강성은 App 토큰, 계정은 사용자 토큰이라
                        묶으면 한쪽 GitHub 장애에 화면이 통째로 빈다
    projects/[slug]/settings/actions.ts
                        startGithubConnect · connectRepository · **updateRepositorySettings** (6b-3 —
                        기준 브랜치를 즉시 쓴다. 바뀐 것이 없으면 `project.update`를 아예 부르지 않는다.
                        ⚠️ **6b-5가 기준 로케일을 떼어냈다** — 이 Action은 선언 컬럼을 아예 모른다)
                        (**해제는 2026-09-07에
                        사용자 수준으로 갔다**: `projects/actions.ts`의 disconnectGithub, 인가는 requireUser)
                        ⚠️ **나가는 쪽은 Server Action이다** — Route Handler는 돌아오는 callback 하나뿐.
                        ⚠️ connectRepository는 **리포를 고르지 않는다** — 리포는 Project에 고정이고
                        installationId는 probeRepo가 GitHub에 물어 얻는다(클라이언트가 보내지 않는다)
    projects/[slug]/translations/page.tsx
                        키 테이블 — 로케일이 열. 최상단에서 requireProjectAccess를 **던진다**.
                        그 뒤 planProjectReadiness: ready가 아니면 OWNER는 설정으로, 그 외는 빈 상태.
                        ⚠️ **기본 착지가 pending>0인 첫 네임스페이스다** (6a T7) — 전체는 `?ns=*`.
                        `type Search`가 URL 계약이고(ns·focus·q·state) entry-points가 routes.ts와 대조한다.
                        ⚠️ **헤더를 무조건 렌더한다** — Publish 결과 Alert가 그 안에 있어 조건부 분기에
                        두면 router.refresh()가 방금 받은 결과를 언마운트한다 (POSTMORTEM 2026-09-07)
    __tests__/          harness.ts(메모리 DB 한 벌) + harness.test.ts(**하네스 자기검사** — 페이크가 실제
                        스키마보다 느슨하면 아무 행이나 집어도 정답이 나온다, POSTMORTEM 2026-09-06)
                        + 흐름·인가·멤버십·연결·게시실패·온보딩·조회·셸레이아웃 테스트 **여덟**
                        (queries — countUnpublished·loadMemberships의 테넌트 좁힘 / shell-layout — 셸이
                        **뷰포트 고정**인지 소스로, malmoi#13의 상시 방어선)
                        (github-connect·publish-failure·onboarding은 mock 범위가 달라 일부러 갈랐다)
                        ⚠️ 하네스의 **시드 프로젝트는 `lastCommitSha`가 "적재 완료"**다 — readiness
                        게이트가 붙어서다. `project.create`는 그대로 null을 낸다(스키마 기본값)
  invite/               ⚠️ **(edit) 밖이고 matcher 밖이다** — 비로그인으로 열려야 토큰이 보존된다
    [token]/page.tsx    마스킹한 이메일·프로젝트 이름·역할만 보인다. 실패 분기를 각자 한 줄로.
                        email-mismatch면 "다른 계정으로 로그인"(signOut → 같은 링크) — 없으면 갇힌다
    actions.ts          acceptInvitation — **인가 예외**. 토큰이 인가를 대신한다 (단일 사용)
  api/__tests__/        route-diagnostics(인증·JSON·스키마 실패가 각자 응답을 내는지)
                        + github-callback(state 검증 **전에** code 교환·Account 쓰기가 0회인지)
  api/push/route.ts     CI → DB (maxDuration 60). ⚠️ Bearer는 **그 프로젝트의 push 토큰 원문**이고
                        서버 env가 아니다 — sha256으로 Project.pushTokenHash를 **조회**해 프로젝트를 정한다
  api/auth/[...nextauth]/  Auth.js v5 핸들러
  api/github/callback/  GitHub이 브라우저를 되돌리는 지점 (SaaS 4단계). ⚠️ **matcher에 넣지 않는다** —
                        `/`로 302되면 `code`가 사라진다. `requireUser`로 스스로 인증하고, state가
                        무효면 slug를 못 믿어 `/projects?e=`로 간다
  api/pull/route.ts     DB → PR — **cron 전용** (CRON_SECRET, maxDuration 60). 편집 UI는
                        Server Action이 triggerPull을 직접 부른다
middleware.ts           ⚠️ 인증 차단의 유일한 1차 지점 — matcher가 **둘**이다(`/projects/:path*` · `/account`).
                        렌더 요청만 막는다. 6b-4까지 하나였던 것은 `(edit)` 아래가 전부 그 접두였기 때문이다
components/
  translation-input.tsx 셀 편집 (client — Textarea, blur/Enter 저장, Shift+Enter 개행, Esc 되돌리기).
                        ⚠️ **셀 안 상태줄은 시각 전용**이고 알림은 표 하나의 live region이 든다.
                        실패 시 포커스는 `shouldRefocus`가 정한다 — 다른 셀을 치고 있으면 뺏지 않고 [Retry]
  publish-button.tsx    Publish (client — 옛 `pull-button`. 버튼과 결과 Alert가 **갈라져 있다**:
                        자리가 툴바 오른쪽 / 배너 아래라 상태는 header가 든다).
                        ⚠️ 실패에는 `router.refresh()`를 부르지 않는다 (POSTMORTEM 2026-09-08)
  reconnect-button.tsx  리포 재연결 (client — pending 라벨 교체, 인라인 오류)
  github-account.tsx    GitHub 계정 연결·해제 (client). ⚠️ reauthorize는 **자동 redirect가 아니라
                        버튼**이다 — 렌더 중 튕기면 callback 실패 시 루프다
                        ⚠️ **두 Action이 서로 다른 파일에서 온다** — 해제(DisconnectGithubButton, export)는
                        사용자 수준이라 slug를 안 받고 `/projects` 계정 섹션이 같은 버튼을 쓴다
  project-not-ready.tsx 첫 적재 전 화면 (6b-6) — **정책과 문구를 한 곳이 든다**: OWNER는 설정으로
                        (거기에 [다시 시도]와 워크플로 YAML이 있다), 나머지는 한 줄. Home과 번역 화면이
                        같은 갈래를 만나고 6b-6이 그 사본을 합쳤다.
                        ⚠️ **렌더 중 `redirect()`가 안전한 이유**: 호출부가 이것 **하나만** 반환하고 그
                        시점에 프로젝트 데이터가 페이로드에 없다(인가 차단과 다른 축이다)
  locales/              로케일 화면의 클라이언트 조각 (6b-5). base-locale-form(기준 언어 `Select` +
                        저장 — 필드는 `baseLocaleFieldValue`로 초기화한다. ⚠️ **현실로 초기화하면 대기 중의
                        저장 한 번이 선언을 조용히 지운다**, malmoi#20)
  members/              멤버 관리 화면의 클라이언트 조각 (6b-2, 2026-09-09). member-list(역할 native
                        `Select` + 제거 `Dialog` — 거부 문구는 **행 옆 인라인**이다) / pending-invitations
                        (`revokeInvitation` + 0건 빈 상태) / invite-dialog(옛 `components/invite-form.tsx` —
                        **삭제됐다**. 초대 수단이 둘이면 하나가 낡는다)
                        ⚠️ **대기 초대의 이메일은 `maskEmail`이 아니다** — 그 표에선 마스킹한 주소가 유일한
                        식별자라 서로 다른 둘이 같은 행이 됐다(malmoi#18). 서버가 `maskedInviteLabels`로
                        목록 전체를 보고 라벨을 내려준다
  translations/         번역 화면의 클라이언트 조각 (6a T7). header(breadcrumb·툴바·배너·결과 Alert를
                        **한 상태 트리**로 든다) / filters(?q=·?state=·?focus= → routes.translations) /
                        announcer(표 하나의 `aria-live` — 셀마다 두면 903행×3로케일에 2,700개다) /
                        edit-loss-banner(닫기 키가 `lastPulledAt`이라 다음 Publish 뒤 다시 보인다) /
                        base-pending-banner(6b-3 — 조건은 `basePending`, **닫기가 없다**: 할 일이 남은 동안
                        계속 참이다. 문구는 "먼저 보내라" **하나**다 — 검토 표시를 예고하지 않는다,
                        `planPush`가 base 교체 push에서 전파를 건너뛰므로 그 일이 안 일어난다)
                        ⚠️ **filters는 `<form>` 암시적 submit을 안 쓴다** — 제출 버튼 없는 폼은 Enter로
                        submit되지 않아 검색이 조용히 무효였다 (POSTMORTEM 2026-09-08)
  onboarding/           온보딩 UI (SaaS 5단계, 전부 client). new-project-flow(②~⑥ 상태 기계 — 리포 선택·
                        후보·기준 언어·수동 지정·확정·결과) / connect-github(사용자 수준 연결) /
                        first-ingest-retry · push-token-panel(설정 화면) / workflow-block · copy-button
                        ⚠️ **T5~T8에서 전부 `components/ui/` 프리미티브로 옮겼다** — raw 컨트롤이 0개라
                        "포커스 링을 상수에 숨기지 말라"는 경고의 대상이 이 디렉터리에서 사라졌다
  settings/             설정 화면의 클라이언트 조각 (6b-3). repository-form(**기준 브랜치 하나** — 6b-5가
                        기준 로케일을 `components/locales/`로 옮겼다. 브랜치 형식은 보내기 전에
                        `isValidBranchName`으로도 보고 **방어는 Action**이다.
                        ⚠️ **이 폼이 보내는 값에 언어가 없다** — 그것이 malmoi#20의 구조를 없앤다)
  shell/                앱 셸 (SaaS 6a T6, 전부 client). ⚠️ **셸 루트는 `h-svh overflow-hidden`이고
                        `min-h-svh`가 아니다** — `min-`은 콘텐츠가 길면 컨테이너가 함께 자라 `aside`가
                        문서 높이만큼 늘고, Sign out·Collapse가 화면 밖으로 나간다 (malmoi#13, `9c94359`).
                        스크롤은 콘텐츠 컬럼과 사이드바가 **각자** 든다 — sidebar.tsx(usePathname으로 프로젝트 컨텍스트·
                        역할별 항목·접힘 localStorage. ⚠️ **구역 둘이 각자 `aria-label`을 든다** — 구역 라벨이
                        `<p>`라 접근성 트리에서 이름이 아니고 **접힌 레일에서는 렌더되지 않는다**. 활성 판정도
                        축마다 다르다: 프로젝트 축은 접두, 사용자 축은 정확히 일치(`/projects`가 `/projects/new`의
                        접두다)) / top-bar.tsx / user-menu.tsx(**항목 둘** — Your account·Sign out).
                        ⚠️ **breadcrumb은 셸이 안 든다** — 레이아웃이 페이지 props를 못 받아 페이지
                        콘텐츠의 첫 줄이 든다. ⚠️ **항목 노출은 편의이고 차단이 아니다**(방어는 페이지의
                        requireProjectAccess) — 판정은 lib/shell/nav.ts의 순수 함수 둘이 한다
  ui/                   ⚠️ **이 리포가 소유하는 프리미티브 16개** (2026-09-08, 6a T5 — shadcn 생성물 4개는
                        삭제됐고 CLI를 다시 돌리지 않는다). Button·Input·Textarea·Select(native)·Radio·
                        FormGroup·Badge·Alert·Card·Table·Breadcrumb·Avatar·EmptyState·DropdownMenu·
                        Dialog·Tooltip. 치수·색은 DESIGN §6.4가 정본이고 `dark:`는 0곳이다.
                        ⚠️ **`DropdownMenuItem`은 `{children}`을 `Slot.Slottable`로 감싼다** (2026-09-09) —
                        `asChild`가 오면 Slot이 **자식 하나만** 받으므로 `selected`의 `Check`가 형제로
                        붙는 순간 던지고 셸이 죽는다. `add099a`부터 프로덕션에 있었다
                        ⚠️ **포커스 링 셋을 여는 태그에 리터럴로 적는다** — cva 베이스나 공유 상수에 모으면
                        focus-ring 스캐너가 그 파일을 통째로 못 본다. `Button`에 `asChild`가 없는 것도
                        같은 이유다(Slot 한 겹이 태그를 지운다). **T6~T8이 붙였다** — 화면 소비자가 21곳이고 `ui/` 밖 raw 컨트롤은 0개다
  __tests__/            focus-ring — button·input·select·textarea가 포커스 링 셋을 드는지 **소스로**
                        센다 (DESIGN §7). ⚠️ 렌더가 아니라 스캔인 이유: 탭으로 지나가야 보이는 결함이라
                        눈으로 두 번 놓쳤다(2026-09-06 버튼 4곳, 2026-09-07 "연결 해제").
                        ⚠️ **ui/ 제외가 풀렸다** (2026-09-08) — 그 디렉터리가 링이 사는 유일한 자리다.
                        축소형 허용 목록은 **2026-09-08 ship 4에서 비었다** — (2)가 이제 "ui/ 밖에 네 태그
                        0개"인 전면 방어선이고, 새 컨트롤은 `components/ui/`에 프리미티브로 만든다.
                        주석은 벗기고 센다(프리미티브가 자기 태그를 설명한다)
                        + translations-screen — 번역 화면의 배선을 소스로 센다(tone→Alert variant 항등 ·
                        `<details>` 파일 목록 · live region 1개 · `shouldRefocus` · 배너 마운트 게이트 ·
                        셀의 `aria-label` · 초대 링크가 `routes.invite`). 렌더 테스트가 없는 자리의 방어선이다
                        + tooltip-provider — `Tooltip`이 **자기 Radix Provider를 드는지** 소스로 센다.
                        조상 provider가 없으면 Radix가 **던지고**, 그 툴팁은 접힌 사이드바에서만 렌더되므로
                        "접기를 누르면 셸이 죽는다"로 나타난다 — 접힘이 `localStorage`에 남아 사용자가
                        스스로 못 빠져나온다 (POSTMORTEM 2026-09-08)
                        + multiline-detail — 어댑터 오류를 렌더하는 자리가 `whitespace-pre-wrap`을 드는지
                        **두 축으로** 센다: `adapterErrorMessage(`를 부르는 자리 전수 + 서버가 합친 문자열
                        (`PullResult.warnings`)을 렌더하는 자리 **이름 고정**. ⚠️ **앞쪽만 있으면 절반만 고쳐도
                        green이다** — Publish의 `<details>`엔 그 심볼이 없다(POSTMORTEM 2026-09-08)
                        + base-locale-screens — 두 화면이 `basePending`을 **각자 부르는지**, 배너 둘이 조건부
                        분기 밖의 형제인지, `base-locale:` 리터럴을 화면이 직접 만들지 않는지 센다 (6b-3).
                        ⚠️ 조건을 손으로 다시 쓰면 갈래 넷 중 하나가 빠진다 — 특히 "첫 push 전"이 온보딩 중
                        경고로 새어 나온다
                        + slottable-item — ⚠️ **`asChild`가 닿는 프리미티브가 `{children}` 옆에 형제를
                        렌더하면 Radix Slot이 던지고 그 트리가 죽는다.** 실측: 프로젝트 스위처를 한 번
                        열면 셸이 죽었고 `add099a`부터 프로덕션에 있었다 (POSTMORTEM 2026-09-09 — 툴팁
                        provider와 같은 계보). 두 축으로 센다: `Primitive.*` + `{...props}`로 좁힌 전수 +
                        `DropdownMenuItem` **이름 고정**(형태 검사는 형제를 `<>…</>`로 합치면 통과한다)
                        + home-screen — Home의 배선(진행률·활동이 **링크다** · `countUnpublished`·`loadKeys`
                        를 안 부른다 · 루트 링크 여섯 자리가 `routes.project`다)
                        + client-graph — `"use client"` 파일의 **값 import 그래프**를 따라가 ts-morph·
                        octokit·@prisma/client·node:fs·server-only가 없는지 센다. ⚠️ 없으면 7.2MB 청크가 조용히 나간다
                        (실제로 나갔다 — POSTMORTEM 2026-09-07). `import type`은 지우고 `"use server"`에서 멈춘다
messages/
  en.tsx                ⚠️ **UI 문자열의 단일 출처** (SaaS 6a). 값은 문자열 **또는 함수**다 — 보간·복수·노드
                        삽입을 헬퍼 셋으로 만들지 않는다(`fmt`·`plural`·`rich`가 없다). `as const`라 접근 자체가
                        타입 검사이고, 갈래 누락은 **소비자가 거는** `satisfies Record<Union, string>`이 잡는다.
                        ⚠️ **잎이다** — `react`의 `ReactNode` 타입 하나만 import한다
                        ⚠️ **`adapterErrors` 스물둘 + 폴백이 여기 있다** (2026-09-08 6b-1) — 어댑터가 코드를
                        내고 문장은 사전이 낸다. **git 어휘를 쓰지 않는다**: `original-file-missing`이
                        Publish의 `<details>`에 실려 번역자가 읽는다
lib/
  i18n/index.ts         사전의 유일한 입구(`m`) + `pick(dict, key, fallback)`. ⚠️ **`DICT[key] ?? fallback`을
                        쓰지 않는다** — 프로토타입 키에서 값이 찾아져 폴백을 우회하고 문자열 자리에 함수가 온다
                        (초대 화면이 `?e=`를 가드 없이 넘긴다). ko를 더할 때 바뀌는 파일이 여기 하나다
  i18n/adapter-errors.ts
                        adapterErrorMessage(error) — 코드 → 문장 + `key`(어느 키인지, 앞) + `detail`(파서
                        원문, 뒤 괄호). ⚠️ **잎이다** — 온보딩 클라이언트 둘이 읽으므로 `@/lib/adapters/types`를
                        **타입으로만** 가져온다(값이면 `ADAPTER_ERROR_CODES`를 따라 그 디렉터리가 열린다)
  home/overview.ts      Home의 순수 판정 둘 (6b-6) — activeLocaleProgress(`localeProgress` 재사용 +
                        **orphaned 제외**: 그 열은 번역 화면에서 disabled라 `?focus=` 링크가 편집할 수
                        없는 곳으로 데려간다) / recentActivity(편집·CI push·Publish를 시각 desc로 병합.
                        ⚠️ **`limit`은 병합 뒤에** 적용된다 — 편집만 자르면 push·publish가 항상 밀려난다.
                        ⚠️ 동시각 정렬이 **결정적**이다: DB `orderBy`에 기대지 않고 여기서 키·로케일로
                        가른다(`Array.sort`가 안정 정렬이라 입력 순서를 보존한다))
  shell/nav.ts          사이드바의 순수 판정 **셋** — activeProject(pathname의 slug를 **내 멤버십 안에서** 찾는다,
                        없으면 컨텍스트 없음) / projectSections(**다섯** — Overview(6b-6)·Translations·Languages(6b-5)·
                        Members·Settings. ⚠️ **앞의 넷은 `canPerform` 뒤가 아니다**: EDITOR도 목록을 보고
                        컨트롤만 갈린다. ⚠️ 라벨과 URL이 갈리는 자리 둘: "Languages"→`/locales`,
                        "Overview"→`/projects/<slug>`. ⚠️ **`exact`를 항목마다 든다** — 활성 판정이 축이
                        아니라 라우트 모양에 붙는다: `/projects/<slug>`는 그 프로젝트 **모든** 하위
                        라우트의 접두라 접두로 재면 어디서나 Home이 선택돼 보인다)
                        / navZones(6b-4 — **구역 둘**, 사용자 축이 먼저다. 프로젝트 구역은 `projectSections`를
                        그대로 들어 권한표가 두 벌이 되지 않는다. ⚠️ **Home·Logs 항목은 자기 라우트와
                        같은 사이클에 온다** — 없는 라우트를 가리키는 항목은 404다)
  relative-time.ts      relativeTime(then, now) — **잎, import 0** (2026-09-09에 `lib/keys/view.ts`에서
                        내렸다). ⚠️ 그 모듈은 잎이 아니다(`compareKeys` → `lib/adapters/shared`)라서
                        클라이언트가 값으로 읽으면 그래프가 따라온다 — **재수출도 하지 않는다**
                        (POSTMORTEM 2026-09-07 재발). `client-graph`는 그 셋이 무겁지 않아 못 잡는다
  auth/invite-label.ts  maskedInviteLabels — **목록 전체를 보고** 충돌하는 행만 최소한을 더 보인다.
                        충돌이 없으면 출력이 `maskEmail`과 글자 하나까지 같다 (malmoi#18)
  settings/message.ts   RepositorySettingsError 셋 → 문구 (`lib/auth/message.ts`와 같은 형, 잎).
                        ⚠️ **6b-5부터 Action 둘이 이 union을 공유한다** — `updateRepositorySettings`는
                        `invalid-branch`만, `updateBaseLocale`은 로케일 갈래 둘만 낸다.
                        ⚠️ **`noop`이 이 union에 없다** — 거부가 아니라 "쓸 것이 없다"라 화면은 성공으로 보인다
  routes.ts             앱 내부 링크의 단일 출처 (**잎, import 0**). `account()`는 6b-4, `project(slug)`는
                        6b-6이 **그 페이지와 같은 커밋에** 더했다 — 페이지 없이 등재하면 404를 가리키는
                        생성기가 되고 죽은 링크 검사의 접두 규칙이 `/projects/*`를 통과시켜 못 잡는다.
                        ⚠️ **`project(slug)`가 "프로젝트로 간다"의 유일한 답이다** — 목록 행·스위처·
                        breadcrumb 넷·초대 수락 일곱 자리가 그것이고, 하나라도 남으면 같은 동작이
                        어디서 눌렀는지에 따라 다른 곳에 착지한다
                        2026-09-05 하드코딩 사고의 답이고
                        `entry-points.test.ts`가 이 파일의 경로·쿼리 키를 실재 라우트와 대조한다
  adapters/             양방향 로케일 어댑터 — 리포 포맷을 읽고 같은 포맷으로 쓴다
                        ⚠️ layout(경로 모양)과 writeStrategy(write 기계)는 **별개 축**이다
    index.ts            detectFormat / detectFormatWith(명시 지정의 유일한 입구 — ts-dict를 쓰는 길이다)
                        / detectCandidatesAcross / adapterFor / isAdapterName / ADAPTERS
    types.ts            Adapter·DetectedFormat·LocaleEntry 계약 (writeWithErrors는 선택 구현)
                        + ADAPTER_ERROR_CODES 22 · AdapterError = { path, code, key?, detail? } (2026-09-08 6b-1)
                        ⚠️ **갈래를 합치면 지표가 조용히 움직인다** — `lib/survey/one.ts`의 classify가 이
                        코드로 ADAPTER-COVERAGE ③을 가른다. `parse-failed`(구문 진단)와 `parse-crashed`
                        (파서가 던졌다)가 옛 문구 기준으로 다른 통이라 갈라져 있다
    shared.ts           재생성 writer의 결정성 규칙(orderedEntries·compareKeys) + 후보 순위·검증
                        + matchGlobPaths(multi-locale 경로 — push·pull·survey가 공유하는 유일한 규칙)
    quote-style.ts      수술적 어댑터의 인용 부호 보존 (quoteLiteral·dominantQuote)
    json-style.ts       재생성 어댑터의 표현 보존 (들여쓰기·한 줄 컨테이너·비ASCII/슬래시 이스케이프)
                        observeJsonStyle·serializeJson·pathKey + 텍스트 스캐너(scanJson)
                        ⚠️ lib/survey/json-shape.ts가 scanJson을 여기서 import한다 — 스캐너가
                        두 벌이면 지표와 프로덕션이 서로 다른 판정을 한다
    chrome-locales.ts   _locales/{locale}/messages.json (per-locale, 재생성)
                        + dominantFieldOrder(엔트리 안 message·description·placeholders 순서 다수결)
    json-catalog.ts     per-locale, 재생성 — flat|중첩, 배열 인덱스. ⚠️ **경로 모양 3개**:
                        {dir}/{locale}.json · {dir}/{locale}/<name>.json · {dir}/<prefix><.|-|_><locale>.json
    yaml-catalog.ts     {dir}/{locale}.y(a)ml (per-locale, ⚠️ 수술적 — 주석·앵커 보존, Rails 루트 키)
    code-dict.ts        {dir}/{locale}.{ts,js} (per-locale, ⚠️ 수술적 — default export 객체)
    ts-dict.ts          src/i18n/namespaces/*.ts (multi-locale, ⚠️ 수술적 — **자동 탐지 제외**)
  env.ts                환경변수 단일 접근점 — requireEnv(던진다) / optionalEnv(인가 판정용, 던지지 않는다) / PEM 개행 복원
  cli/                  CLI 공통 — args.ts(순수 인자 파싱: 값 플래그 자리 건너뛰기 — **네 CLI**가 쓴다)
                        / walk.ts(SKIP_DIR + 리포 훑기, fs — **세 CLI**)
  db.ts                 getPrisma() — 지연 생성 싱글턴 (pg adapter, 6543, server-only)
  utils.ts              cn() — shadcn 표준 헬퍼
  __tests__/            db·env·failure·githash·utils·routes·github-probe(환경변수 누락이 MissingEnvError로 던져지는지)
                        + ⚠️ globals-css·no-nul-bytes — 뒤의 둘은 lib/ 아래 어느 모듈에도 대응하지 않는다
                        (앞은 app/globals.css의 라이트 고정 상시 방어선(DESIGN §3.1), 뒤는 소스에 리터럴 NUL 금지)
  failure.ts            500 본문 판정 (classifyFailure·MissingEnvError) — 우리 메시지는 그대로,
                        남의 라이브러리 메시지는 ref만. 응답이 **대상 리포 Actions 로그**로 흘러가고
                        그 리포가 public일 수 있다
  githash.ts            sha1("blob <len>\0" + content) — 로컬 blob SHA
  github.ts             Git Data API 래퍼 (App installation 토큰) — ⚠️ server-only 없음(스모크가 물어야 한다)
                        + openRepoReader(스냅샷·blob — **설치 토큰을 한 번만 발급한다.** 읽기마다 App을 만들면
                          토큰 캐시가 매번 미스라 호출이 2배다). 스냅샷은 트리 항목의 `sha`를 든다 —
                          contents API는 1MB에서 잘려 조용히 빈 내용을 준다
                        + probeRepo(App JWT `/installation` → 설치 토큰 `/repos`) — 설치 토큰만으로는
                        public 리포가 접근 철회 뒤에도 200이라 앞의 호출이 판정 근거다.
                        ⚠️ **createApp()은 try 밖** — 환경변수 누락은 값(error)으로 접지 않고 던진다
  github-connect/       GitHub 계정 연결 (SaaS 4단계). **사용자 토큰 전담 — App 개인키를 모른다**
    origin.ts           requestOrigin·callbackUrl — ⚠️ **redirect_uri와 쿠키 secure가 한 판정에서 나온다.**
                        redirect_uri를 안 보내면 GitHub이 App의 **첫** callback URL(프로덕션)로 되돌려
                        보내 로컬·preview 연결이 원리적으로 불가능했다 (malmoi#7)
    state.ts            OAuth state 서명·검증 (HMAC over AUTH_SECRET, secret은 인자라 순수)
                        + stateCookieName(secure)·stateCookieNames() — ⚠️ 읽는 쪽은 **두 이름을 다 본다**
                        (쓰는 쪽은 x-forwarded-proto, 읽는 쪽은 요청 URL로 판정해 갈릴 수 있다)
                        + STATE_TTL_MINUTES — 쿠키 maxAge와 서명 exp를 함께 정하므로 한 곳에 둔다
                        ⚠️ **payload가 `dest`를 든다** — 갈래 **셋**: `{kind:"settings", slug}` |
                        `{kind:"new"}`(2026-09-07) | `{kind:"account"}`(6b-4). 뒤의 둘은 사용자 축이라
                        프로젝트가 없어 slug가 착지를 겸할 수 없다. **갈래를 늘리는 방향은 안전하다**(옛 쿠키가
                        그대로 파싱된다) — 옛 `{slug}` **모양**은 `state-mismatch`로 거부된다(10분 만료 창)
    account-link.ts     planAccountLink 4갈래 — taken-by-other가 replace보다 앞이다
    account-view.ts     loadAccountView 3갈래 (6b-4) — ⚠️ **화면 둘이 이 함수 하나를 읽는다**(`/account`·설정).
                        설정 화면의 지역 `loadAccount`를 내린 것이고, 다른 것은 연결 버튼의 착지뿐이다
    connect-plan.ts     planRepoConnect — SAAS §5.4 3중 검증의 판정 자리 (5단계가 재사용)
    health.ts           planConnectionHealth 6갈래 + probeFromError·httpStatus
                        ⚠️ 403(설치 일시중지)은 error가 아니라 not-installed다 — 영구 상태다
    token.ts            planTokenUse 3갈래 + refreshFailure (⚠️ 429는 4xx인데 unavailable이다)
    token-store.ts      ensureUserToken — 회전 결과를 조건부 updateMany로 즉시 쓴다
    log.ts              logFailure — unavailable로 접는 자리마다 부른다 (route·Action·토큰·probe·viewer).
                        화면엔 갈래 이름만 가므로 원인은 여기서만 볼 수 있다
    message.ts          ConnectError 12갈래 + isConnectError·connectErrorMessage (inviteErrorMessage 형)
    user.ts             OAuthApp·Octokit 호출 — ⚠️ authentication에 clientSecret이 섞여 오므로
                        token·expiresAt·refreshToken 셋만 뽑는다. 목록은 paginate로 전 페이지
  scan/                 사용처(`refs`) 수집 전담 — 진실이 아니다 (에러가 아니라 경고)
                        ⚠️ `WrapperId.kind`가 direct(`t("k")`)와 hook(`const { t } = useI18n()`)을
                        가른다. hook은 반환 바인딩을 스코프째 추적하고 next-intl의 namespace
                        상대 키를 절대 키로 되돌린다 (ARCHITECTURE §4.0)
  survey/               어댑터 범용성 실측의 순수 판정층 (I/O는 scripts/adapter-survey.ts만)
                        ⚠️ **one.ts의 classify(code)가 지표 ③을 가른다** — 옛 문구 기반이었고 6b-1이 코드로
                        옮겼다. `__tests__/classify.test.ts`가 **옛 문구 22개 + 옛 분류기 본문**을 픽스처로
                        들고 대조한다(코퍼스가 밟는 갈래는 여섯뿐이라 재측정만으로는 회귀가 0으로 조용하다)
                        select(파일 고르기) / one(리포 하나) / summarize(집계·표) / diff(변경 줄
                        비율·hunk) / json-shape(원본 텍스트의 키 순서·들여쓰기) / ts-shape / stats
                        / merge(detectCandidatesAcross 위임 — 흔적) / types
  push/                 payload.ts(순수 조립 — **생산자는 여기 하나다**) / assemble.ts(select→read→base —
                        **CLI와 서버 첫 적재가 같은 함수를 지난다**) / plan.ts(순수 판정)
                        / apply.ts(벌크 I/O) / auth.ts(fail-closed) / guard.ts(오배송·역행 409)
                        / token.ts(generatePushToken·hashPushToken — 해시는 hashInviteToken **그 함수**다, 규칙 한 곳)
  pull/                 branch-name.ts(⚠️ **잎, import 0** — isValidBranchName. `isRefSafeSlug`보다 **넓다**:
                          그쪽은 우리가 만드는 ref라 한 세그먼트고 이쪽은 남의 리포에 있는 브랜치라
                          `release/2.0`이 정상이다. 앞뒤 공백을 **거부**한다 — 트림하면 화면과 저장값이
                          갈려 조용한 409가 된다)
                        / ref-slug.ts(⚠️ **import 0인 잎 모듈** — REF_SAFE_SLUG·isRefSafeSlug. trigger.ts에
                          있던 것을 내렸다: 온보딩이 판정을 공유하면서 그 파일의 그래프(octokit·ts-morph)를
                          클라이언트로 끌고 갔다 — POSTMORTEM 2026-09-07)
                        / plan.ts(순수 판정 — 1층 스킵·경로·entries·2층 SHA)
                          ⚠️ **base 파일의 값 폴백은 빈 문자열까지 잡는다** (2026-09-09) — base 셀을
                          비우면 그 키가 그 파일에서 빠지고 **다음 push가 전 로케일에서 orphan한다**
                          (그 파일이 키 집합의 진실이다). 비-base의 빈 값은 그대로 "미번역"이다 / payload.ts(Git Data API 본문)
                        / render.ts(순수 — DB→파일 내용, multi-locale은 파일×로케일 이중 루프)
                        / run.ts(오케스트레이션 — 의존성 주입). ⚠️ **2층이 변경 0건이면 sync 브랜치를
                          base head로 되돌린다** (2026-09-09) — 그 비교는 **base 트리 대비**라, 편집을
                          되돌려 렌더가 base와 같아지면 브랜치가 옛 스냅샷을 든 채 남고 그 PR을
                          머지하면 되돌린 편집이 적용된다 / load.ts(Prisma 조회 · `lastPulledAt` +
                          `lastPublishedAt`·`lastPrUrl` 쓰기 — ⚠️ **`skipped`는 뒤의 둘을 안 건드린다**:
                          "마지막으로 **보낸**" 것이지 시도한 것이 아니다)
                        / client.ts(GitClient 인터페이스 — 주입 계약, 구현은 lib/github.ts)
                        / targets.ts(selectPullTargets — cron이 순회할 프로젝트 선별: installationId·lastCommitSha가
                          없으면 제외, slug 결정적 정렬. 한 프로젝트의 실패가 나머지를 막지 않고 응답은 **배열**이다)
                / trigger.ts(진입점 둘이 공유하는 조립 + syncBranchFor — 브랜치가
                          l10n/sync-<slug>다, 같은 리포 두 Project가 서로를 덮지 않게. ref-slug를 재수출한다)
                        / message.ts(결과→문구)
  auth/                 인증·인가. **판정은 순수 함수, 조회·세션은 얇은 껍데기**
                        ⚠️ `allow.ts`(허용 핸들 목록)는 2026-09-06에 삭제됐다 — 인가는 ProjectMember다
    query.ts            getProjectAccess(prisma, …) — slug→project→ProjectMember 두 조회
                        + loadMembers·loadPendingInvitations (6b-2 — 멤버 화면. **`projectId`로만 좁힌다**,
                        인가는 호출부가 이미 지났다. 뒤의 것은 `acceptedAt IS NULL AND expiresAt > now()`
                        **둘 다** 본다 — 한쪽만 보면 이미 멤버가 된 사람의 초대가 "대기 중"으로 보인다).
                        ⚠️ server-only가 **없다**(테스트가 메모리 DB로 직접 부른다)
    session.ts          requireUser · requireProjectAccess — redirect만 한다 (server-only).
                        장애는 /?error=Unavailable, 거부는 /projects?e=<status>
    read-session.ts     readSession — auth()를 장애 표시와 함께 읽는 **유일한 진입점** (ok|none|unavailable).
                        ⚠️ server-only 없음 — Action 테스트가 @/auth만 mock한다
    outage.ts           AsyncLocalStorage + noteAuthError — SessionTokenError만 장애로 표시.
                        auth.ts의 logger.error가 부른다 (POSTMORTEM 2026-09-06)
    public-session.ts   publicSession — session 콜백 반환을 허용 목록으로 새로 만든다. 입력은 Session
                        **행**이라 그대로 돌려주면 sessionToken이 /api/auth/session에 실린다
    profile.ts          githubUserinfo + githubApi — /user + /user/emails를 합친다. ⚠️ HTTP 실패는 **둘 다
                        던지고**(장애 → "잠시 뒤"), 이메일 미검증만 email:""로 정상 거부 경로에 남긴다
    permission.ts       Role·Permission + canPerform (SAAS §3 권한표 6칸). ⚠️ Publish는 별도
                        permission이 아니라 translation:write에 들어 있다
    access.ts           planProjectAccess — "slug 없음"과 "멤버 아님"을 같은 not-found로 접는다
                        (프로젝트 존재를 노출하지 않는다). forbidden은 멤버인데 권한이 모자란 경우만
    invitation.ts       hashInviteToken(sha256) + planInvitationAccept 5분기.
                        ⚠️ not-found를 **가른다** — access.ts와 방향이 반대이고 축이 다르다
    membership.ts       planMemberChange — 마지막 OWNER 보호. 제거와 강등이 같은 판정이다
    email.ts            normalizeEmail(trim+소문자까지만 — gmail 점·+ 태그를 접지 않는다)
                        + verifiedEmailFrom — provider가 검증한 이메일만 통과 (fail-closed)
                        + freshVerifiedEmail·planEmailRefresh — 재로그인마다 User.email을 현재 검증 주소로
                        갱신(keep|update|conflict). 다른 User가 쓰면 병합 없이 건너뛴다
                        + maskEmail — 표시용, 되돌릴 수 없어 대조에 쓰지 않는다. 소비자가 둘이라(초대 화면·
                        셀 메타) 지역 사본을 두면 같은 주소가 화면마다 다르게 보인다
    cookie.ts           hasSessionCookie + shouldRedirectToLogin — 미들웨어 1차 차단용. __Secure- 접두 유무
                        둘 다 보고, GET·HEAD만 돌려보낸다 (Action POST는 통과)
    message.ts          accessErrorMessage · inviteErrorMessage · signInErrorMessage — 거부 사유 →
                        **영어 문구**(`messages/en.tsx`). 갈래 누락은 `satisfies Record<Union, string>`이
                        컴파일 타임에 잡는다(옛 `never` 검사와 같은 힘). ⚠️ **`inviteErrorMessage`는
                        `string`을 받는다** — `?e=`가 주소창 값이라 `pick`이 폴백을 낸다(단언을 걸면
                        그 계약이 검사에서 지워진다). ⚠️ 거부가 화면에 닿지 않으면 사용자에겐 버튼이
                        안 눌린 것으로 보인다 (POSTMORTEM 2026-09-06)
  keys/                 view.ts(순수 — 집계·배지·permalink + collectActorIds·actorLabel + defaultNamespace·
                        resolveNamespace·filterRows·isUnpublished + relativeTime + **localeProgress**(6b-5 —
                        ⚠️ percent는 **내림**이라 902/903이 100%가 되지 않고, **base도 100%가 아닐 수 있다**;
                        정렬은 base → 살아 있는 로케일 → **orphaned 맨 뒤**)) / save.ts(순수 — 저장 판정)
                        / query.ts(조회, server-only — loadProject·loadKeys·loadActors·countUnpublished·
                        loadMemberships + **loadLocaleCounts**(6b-5 — 분모 `stringKey.count`·분자
                        `translation.findMany` **병렬 한 벌**. ⚠️ `loadKeys` 재사용은 903키에서 이 화면을
                        번역 화면만큼 무겁게 만든다; 필터 둘(`value != ""` · `stringKey.orphaned`)이 판정이다)
                        + **loadRecentEdits**(6b-6 — Home의 활동. `updatedBy: { not: null }`로 **사람의
                        편집만**: push는 그 컬럼을 비우며 전 행의 `updatedAt`을 올려 code push 직후 903건이
                        "편집"이 된다. `take`가 `@@index([projectId, updatedAt])`를 역방향으로 타고, 보조
                        키가 **어느 N건이 오는지**를 고정한다. `value`를 select하지 않는다))
                        / refocus.ts(⚠️ **잎, import 0** — shouldRefocus. `translation-input.tsx` 안에 두면
                          그 파일의 그래프에 server-only가 있어 vitest가 import만으로 죽는다)
                        ⚠️ **`isUnpublished`와 `countUnpublished`는 같은 술어의 두 벌이다** — `updatedBy`가 사람인
                        행만 센다(push가 그것을 비운다). `updatedAt`만 보면 code push 직후 전 키가 미배포로 나온다.
                        `app/(edit)/__tests__/queries.test.ts`가 두 경로에 같은 행을 먹여 맞댄다
                        ⚠️ **updatedBy는 join으로 못 푼다** — FK가 없고 User.id와 옛 GitHub 핸들이 섞여 있어
                        loadActors가 따로 읽고 actorLabel이 못 찾은 값을 원문으로 낸다 (malmoi#3)
  onboarding/           탐지 온보딩 (SaaS 5단계, 2026-09-07). 순수 판정 + DB 껍데기 하나 — **GitHub을 모른다**
                        slug.ts(planSlug·normalizeProjectSlug — 형식은 pull/trigger의 isRefSafeSlug를 **그대로 부른다**)
                        / detect.ts(probeTargets — sampleOrder와 같은 파일 ≤21 · makeProbe · formatLabel · summarizeCandidates
                        · ingestTargets) / confirm.ts(templatePaths · planConfirmedFormat — 저장값은 detectFormatWith 반환)
                        / create-plan.ts(planProjectCreate · PROJECT_LIMIT) / readiness.ts(setup|awaiting_first_sync|ready)
                        / base-locale.ts(planBaseLocaleChange 4갈래 — orphaned 거부가 요지다: 그 파일은 리포에서
                        사라졌고 base로 세우면 다음 push가 키 0개를 낸다. `zh_CN` ≠ `zh-CN`)
                        / base-pending.ts(⚠️ **잎, import 0** — basePending + baseLocaleFieldValue.
                        **화면 셋이 앞의 함수를 읽는다**: 로케일 화면·번역 배너·**설정의 워크플로 YAML**)
                        / message.ts(OnboardError 18갈래 · ingestHeadline — ⚠️ 클라이언트 컴포넌트가 이걸
                          import한다. 여기서 **값**으로 끌어오는 것이 곧 클라이언트 번들이다) / workflow.ts(renderWorkflowYaml — ACTIONS.md와 줄 대조)
                        / ingest.ts(서버측 첫 적재 — assemblePushInput→buildPushPayload→applyPush를 **우회하지 않는다**.
                          스냅샷·blob은 값으로 받고, 내려받지 못한 파일을 실패로 센다)
                        ⚠️ `@/lib/github`을 import하지 않는다 — 두 토큰은 Server Action 하나에서만 만난다
                        (`credential-separation.test.ts`가 세 검사로 상시 고정한다)
types/next-auth.d.ts    session.user.id 타입 확장 (login은 DB 세션 전환으로 제거 — Google 사용자엔 핸들이 없다)
prisma/
  schema.prisma         11테이블 + enum Role (Project 테넌트 경계 / 접속 URL 없음 — Prisma 7).
                        ⚠️ **`Project`에 base 로케일 컬럼이 둘이다** (6b-3): `baseLocale`은 **현실**(push 소유,
                        pull·`checkFormat`이 읽는다) / `declaredBaseLocale`은 **선언**(설정 화면 소유,
                        `checkFormat`·두 화면의 배너가 읽는다). **합치면 pull이 깨진다**
                        ⚠️ Auth.js 4테이블의 **모양은 어댑터가 정한다** — 컬럼 하나만 빠져도
                        linkAccount가 런타임에 던지고 **타입 검사는 그걸 못 본다**(ARCHITECTURE §5.1)
  __tests__/            schema-contract.test.ts — 어댑터 소스와 스키마를 대조하는 유일한 자동 방어선
                        + push-token-column.test.ts(pushTokenHash가 nullable·unique이고 **원문 컬럼이 없는지**)
                        + declared-base-locale-column.test.ts(6b-3 — nullable이고 `baseLocale`이 **그대로 남았는지**.
                        주석이 "pull은 이 컬럼을 안 읽는다"와 "일회용"을 드는지까지 본다 — 그 구별이 사라지면
                        다음 사람이 두 컬럼을 합친다)
  migrations/           13개 — _init, _add_project_tenant_boundary, _add_project_locale_format,
                        _add_project_last_commit_at, _add_project_last_pulled_at,
                        _add_key_order_and_chrome_fields, _add_project_nested_by_path,
                        _add_locale_orphaned, _add_translation_updated_at_index,
                        _add_tenant_auth_tables, _add_project_push_token
                        ⚠️ 마지막 것은 `migrate dev`가 비대화형을 거부해 `migrate diff`로 만들었다 (`/db` 4c).
                        prod 반영 완료 (2026-09-07, `db:status:prod` 11개 up to date).
                        , _add_project_last_published (2026-09-08, 6a T3 — `Project.lastPublishedAt`·
                        `lastPrUrl`. additive 둘이고 **prod 반영 완료** — `db:status:prod` 12개 up to date)
                        , _add_project_declared_base_locale (2026-09-09, 6b-3 — `Project.declaredBaseLocale`.
                        additive 하나이고 **prod 반영 완료** — `db:status:prod` 13개 up to date)
prisma.config.ts        마이그레이션 접속 URL (DIRECT_URL) + .env.local 로드
vercel.json             Cron — /api/pull 야간 1회 (UTC 18:00 = KST 03:00). Hobby는 하루 1회다
next.config.ts          ⚠️ **agentRules: false** — Next가 AGENTS.md에 자기 블록을 덧붙이는 동작을 끈다.
                        그 파일은 sync-agents.mjs가 소유하는 생성물이라, 켜져 있으면 next dev를 돌릴
                        때마다 미러 게이트가 드리프트로 잡고 지우면 Next가 다시 만든다
pnpm-workspace.yaml     ⚠️ **공급망 정책 둘이 설치 동작을 바꾼다** — 아래 게이트웨이 절
generated/prisma/       ⚠️ 생성물 (gitignore) — prisma generate
public/fonts/           ⚠️ 생성물 (gitignore) — scripts/copy-fonts.mjs
scripts/
  adapter-survey.ts     어댑터 범용성 실측 CLI (네트워크 — 판정은 lib/survey/)
  sync-agents.mjs       Claude Code 원본 → Codex 미러 생성기
  copy-fonts.mjs        Pretendard 동적 서브셋 복사 (predev·prebuild)
  scan.ts               사용처 스캔 CLI
  ingest.ts             로케일 적재 CLI
  push-local.ts         적재+스캔+POST — TASK 7 워크플로가 할 일과 같은 순서
  smoke-github.ts       GitHub App 설정 검증 (읽기만)
  __tests__/            required-args.test.ts — push:local·smoke:github의 인자 필수와 **옛 공유 slug env의
                        소비자 0건**을 소스로 고정한다. ⚠️ 그 이름이 테스트에 남아 있어야 방어선이 산다
auth.ts                 Auth.js v5 설정 — signIn 콜백은 검증 이메일 확인·갱신만, 인가는 ProjectMember.
                        logger.error가 outage.ts에 장애를 알린다
docs/MVP.md             PoC 스펙 (닫힘 — §8.4가 SAAS.md를 가리킨다)
docs/SAAS.md            **SaaS화 스펙 — 현재 단계의 정본.** 범위·비범위·설계 결정·단계별
                        체크리스트·불변식 9개. 착수 전 필독
docs/ACTIONS.md         **대상 리포**에 붙이는 워크플로 (composite action 사용법·red 조건)
docs/TASKS.md           태스크 체크리스트 (완료 조건 + 🔒 결정 필요)
docs/DESIGN.md          편집 UI 시각 규칙 (라이트 단일, mono 표면 불변식)
docs/ARCHITECTURE.md    설계 상세·함정
docs/ADAPTER-COVERAGE.md 어댑터 범용성 실측 (13차) — 어댑터·탐지 규칙 손대기 전 필독
docs/POSTMORTEM.md      회귀·버그 회고 누적
docs/features/          /feature 산출물. ⚠️ **스펙이 아니다** — 결론은 MVP·ARCHITECTURE로
                        올라가고 여기는 근거로 남는다. 상태·백로그는 README.md
                        ⚠️ **셋의 수명이 다르다**: spec·design은 완료돼도 남기고(왜 그 선택을
                        했나), tasks는 닫히면 지운다(전부 [x]면 남는 정보가 없다 — 2026-09-05에
                        완료된 셋 841줄을 지웠다). 예외는 체크리스트 밖의 기록이 붙은 경우로 **넷이
                        남아 있다**: pull-to-pr §4(실물 7시나리오) · tenant-auth §6.1(preview 실물 +
                        거기서만 잡힌 결함 넷) · github-connect T5(실물 10시나리오 + **못 밟은 둘의
                        이유**) · project-onboarding T8(실물 14행 표 + **전제 둘이 틀렸다는 실측**). key-separator-contract는 보류라 애초에 대상이 아니다
                        ⚠️ adapter-generality/의 repos*.txt·verdicts*.json은 **살아 있는 입력**이다
                        (pnpm adapter-survey가 읽는다 — 완료된 산출물이 아니다)
```

## 아키텍처 원칙

설계 상세와 함정은 **[docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md)** 가 단일 출처다. `lib/` 아래 코어 모듈(`adapters`·`githash`·`github`·`github-connect`·`db`·`env`·`failure`·`scan`·`push`·`pull`·`keys`·`auth`·`cli`·`survey`·`onboarding`·`i18n`·`shell`·`home`·`routes.ts`)을 건드리기 전에 읽는다 — **이 목록은 `.claude/commands/push.md` 4단계 트리거와 같아야 한다** (2026-09-04 감사에서 셋이 전부 달랐다). 요약:

- **export 결정성 3규칙 (재생성 방식)**: 키는 **`LocaleEntry.order`(원본 위치) 오름차순, 없으면 UTF-16 코드 유닛 `<` 비교**(2026-09-03 — `localeCompare` 금지), **들여쓰기는 원본 파일의 폭**(없으면 2칸 — 2026-09-04, ADAPTER-COVERAGE §14), 파일 끝 개행 정확히 1개. `orphaned` 키는 export에서 제외(DB엔 남으므로 되돌릴 수 있다). **수술적 치환(`ts-dict`·`yaml-catalog`·`code-dict`)은 이 규칙을 지나지 않는다** — 원본 순서·공백·주석을 보존하는 것이 그 방식의 요지다 (ARCHITECTURE §1.1).
- **변경 감지는 두 층이다**: **1층**(`Translation.updatedAt` vs `Project.lastPulledAt`)에서 편집이 없으면 GitHub API를 **한 번도** 부르지 않는다 — 야간 cron이 매일 도는데 변경이 없는 날이 대부분이라 이게 기본 경로다. **2층**은 ref·트리·파일별 blob을 읽어(2026-09-04부터 **모든 어댑터**가 — 수술적은 치환 대상, 재생성은 표현) 로컬 blob SHA와 비교하고, 전부 같으면 커밋을 만들지 않는다. "API 0회"는 1층의 성질이고 2층은 읽기 호출이 파일 수만큼 있다 (ARCHITECTURE §2·§3).
- **커밋 parents는 항상 base의 head, 브랜치는 force update**: `l10n/sync`는 누적 히스토리가 아니라 "현재 DB 상태의 스냅샷"이다. 3-way merge를 피하는 게 코어 원칙이므로 fast-forward를 지키려 하지 않는다.
- **커밋 메시지에 `[skip-l10n]`**: 이 마커가 없으면 pull이 만든 커밋이 main에 머지될 때 push가 다시 돌아 무한 루프가 된다.
- **PR은 하나를 재사용**: 열린 PR이 있으면 새로 만들지 않는다. PoC 리포에 PR 수십 개가 쌓이면 사람이 안 본다.

## 브랜치 정책 & 배포

**`main` / `dev` 두 브랜치다** (2026-09-04 분리 — MVP §8.4). 그 아래 작업 브랜치는 두지 않는다: 혼자 작업이라 층을 하나 더 얹으면 스스로 연 PR을 스스로 머지하는 형식만 남는다.

| 브랜치 | 무엇 | 어떻게 들어가나 |
|---|---|---|
| `dev` | 상시 작업 브랜치. **push = Vercel preview 배포** (dev DB를 본다) | `/push` |
| `main` | 프로덕션. **머지 = Vercel 프로덕션 배포** (`https://mal-moi.com`) | `/merge` (dev→main squash PR) |

- **GitHub default branch는 `dev`다.** PR 기본 base가 dev가 되면 실수로 main에 PR을 여는 일이 준다. **대상 리포의 composite action 참조(`…/l10n-push@main`)는 default branch와 무관하므로 그대로 동작한다** — 오히려 action 변경이 dev에 있는 동안 대상 리포가 옛 버전을 쓰는 것이 안전한 성질이다 (docs/ACTIONS.md).
- **`main`에 직접 커밋·푸시하지 않는다.** 프로덕션 앞의 게이트(PR CI)를 통째로 건너뛴다.
- **preview는 dev DB를 본다.** 프로덕션 데이터에 닿지 않는 것이 preview를 쓰는 이유의 절반이다 — Vercel env의 Preview 스코프가 그렇게 갈려 있어야 성립한다.
  - **dev 브랜치 고정 URL**: `https://malmoi-git-dev-ox501501-1046s-projects.vercel.app` (배포별 URL과 별개로 dev의 최신 preview를 항상 가리킨다)
  - ⚠️ **preview에서 GitHub 로그인은 dev 브랜치 고정 URL에서만 된다.** OAuth App은 callback URL을 하나만 갖는데 preview URL은 배포마다 바뀌므로, **preview 전용 OAuth 앱**을 따로 두고 그 callback을 dev 고정 URL에 박았다. 다른 브랜치의 preview가 로그인 화면에서 멈추는 것은 정상이다. 모든 preview에서 로그인이 필요해지면 Auth.js v5의 `redirectProxyUrl`을 넣는다 — 그때가 SaaS UI를 만드는 시점이다.
  - ⚠️ **preview는 Vercel SSO(Deployment Protection) 뒤에 있다.** 프로덕션은 자동화를 위해 껐지만 preview는 켠 채로 뒀다 — preview URL이 새어나가도 Vercel 계정 없이는 못 열고, 열 이유도 없다. **그래서 `curl`로 preview를 찌르면 앱 응답이 아니라 `vercel.com/sso-api`로 가는 302가 온다** — 앱이 깨진 것으로 오진하기 쉽다. 브라우저는 Vercel 세션 쿠키로 그냥 통과하므로 사람이 보는 데는 지장이 없고, 자동화가 필요하면 `vercel curl`이나 protection bypass 토큰을 쓴다.
- **GitHub 브랜치 프로텍션은 없다.** Free 플랜 + private 리포 조합에서 GitHub이 거부한다 (`403: Upgrade to GitHub Pro or make this repository public`). **그래서 PR CI가 게이트인 것은 `/merge`가 그것을 보기 때문이지 서버가 강제해서가 아니다.**
- **버전·tag 없음.** 웹앱이라 semver가 소비자에게 의미를 주지 않는다.

### 게이트가 어디에 서 있나

분리 전에는 전부 로컬에 있었다. 지금은 **둘로 갈렸고, 둘 다 필요하다**:

| 게이트 | 어디 | 무엇을 막나 |
|---|---|---|
| `pnpm typecheck` + `test` + `build` | `/push` 1단계 (로컬) | dev·preview에 red가 나가는 것 |
| PR `verify` 체크 | `/merge` 4단계 (GitHub) | **프로덕션에 red가 나가는 것** |

- **로컬 게이트를 "PR CI가 잡아줄 것"이라며 건너뛰지 않는다.** 그 CI는 커밋 여러 개가 쌓인 뒤에 돌아서, red가 나오면 무엇이 깼는지 특정하는 비용이 지금의 3분보다 크다.
- **로컬 게이트가 `pnpm build`를 포함한다** (2026-08-31 추가). `tsc`는 RSC 경계를 못 본다 — `"use client"` 누락, 서버 컴포넌트의 클라이언트 훅, Server Action 직렬화 위반은 `next build`만 잡는다. 콜드 5초 / 웜 2초다.
- **`/ship`은 dev까지다.** `/merge`를 부르지 않는다 — 브랜치를 나눈 목적이 프로덕션 앞에 사람 판단을 하나 더 두는 것이므로, 그 판단을 파이프라인이 대신하면 나눈 의미가 없다.
- **되돌리는 유일한 방법은 다음 배포다.** revert 커밋을 dev에 얹어 같은 경로로 다시 보낸다.
- **`git push --force`는 main에 금지.** dev는 `/sync`가 머지 후 정기적으로 force update하지만(squash가 해시를 바꾸므로), 그 스킬의 안전 검사 3개를 지나야 한다.

### DB 마이그레이션은 배포와 순서가 얽힌다

**dev DB는 `/push` 전에, prod DB는 `/merge` 전에** 넓힌다 — 각 배포 직전이다 (additive-first).

| 언제 | 명령 | 무엇을 위해 |
|---|---|---|
| `/push`(dev 푸시) 전 | `pnpm db:migrate` (보통 `/db`가 이미 했다) | preview가 없는 컬럼을 조회하지 않게 |
| `/merge`(프로덕션 배포) 전 | `pnpm db:deploy` + `pnpm db:status:prod` 확인 | 프로덕션이 없는 컬럼을 조회하지 않게 |

컬럼 삭제·타입 변경은 코드 배포가 끝난 다음 별도 마이그레이션으로. **`db:deploy`를 `/push` 시점으로 당기지 않는다** — 프로덕션이 코드보다 앞서 있는 창을 필요 이상으로 길게 연다. `/merge` 1단계가 확인을 요구하지만 그건 안전망이고, 순서를 아는 건 `/db`의 책임이다.

## 워크플로우 (스킬 라인업)

스킬 **17개**의 역할·단계별 게이트는 `.claude/commands/<name>.md`에 정의돼 있고, Codex 미러는 `.agents/skills/source-command-<name>/SKILL.md`다 (**`/push`·`/merge`·`/sync`·`/bugshot-qa` 넷은 미러 제외** — 앞의 셋은 원격 상태를 바꾸는 창구를 Claude Code 하나로 두려는 것이고, `/bugshot-qa`는 Codex에 ego-browser 런타임이 없어 실행 자체가 불가능하다).

`/feature` · `/feature-review` · `/tdd` · `/implement` · `/code-review` · `/refactor` · `/audit` · `/doc-check` · `/db` · `/push` · `/merge` · `/sync` · `/pull` · `/postmortem` · `/ship` · `/l10n-roundtrip` · `/bugshot-qa`

권장 흐름: `/feature` → `/tdd interface` → `/implement` → `/code-review` → `/refactor` → (`/db`) → `/push`(dev) → `/merge`(프로덕션). 작은 변경은 `/ship` 하나로 `/push`까지 오케스트레이션하며, **`/ship`은 dev까지다 — 프로덕션 배포는 `/merge`를 따로 부른다.**

**`/audit`은 이 흐름 밖이다.** 변경분이 아니라 **코드베이스 전체**를 불변식·원칙·경계·부채 네 차원으로 감사하고, `docs/POSTMORTEM.md` **전 항목**(2026-09-09 기준 42개 — `grep -c '^### 20'`으로 센다, 템플릿 헤딩은 제외)의 재발 방지 grep을 전수로 돌린다 — `/code-review`는 변경분에 걸린 항목만 소환하므로 손대지 않은 코드에 남은 같은 패턴은 이쪽만 잡는다. **MVP를 닫고 SaaS화에 들어가기 전 부채 정리 라운드용**이고(MVP §8.1), 리포트 전용이라 배포 경로와 무관하다.

- **무엇을 할지는 `docs/TASKS.md`에서 시작한다.** 단계별 태스크와 완료 조건이 거기 있고, `/tdd`는 그 "검증:" 줄을 테스트 케이스로 쓰고, `/push`는 통과한 것만 체크한다. `/feature`는 TASKS의 한 단계가 설계 문서를 요구할 만큼 클 때만 부르고, `/feature-review`는 그 산출물이 커서 4관점 크로스체크가 필요할 때만 부른다.

- **`/merge`·`/sync`는 2026-09-04에 되살렸다** — 브랜치 분리로 대상이 다시 생겼다(dev→main PR, 머지 후 dev 재동기화). 2026-08-31에 삭제했던 것을 그대로 복원하고 dev/prod DB 분리만 반영했다. **`/merge`가 배포 스킬이고 `/deploy`는 없다.**
- **`/sync`는 파괴적이다** — dev를 `origin/main`으로 hard reset + force push한다. 미커밋·미푸시·미머지 세 검사를 전부 통과해야 실행한다. `/merge`가 6단계에서 자동으로 하므로, 손으로 부르는 것은 그게 실패했거나 **다른 머신·창구가 머지한 뒤**다.
- **프로덕션에 보내지 않고 dev에만 쌓고 싶으면 `/push`까지만 하고 `/merge`를 부르지 않는다.** 커밋조차 남기고 싶지 않으면 `/ship` 대신 개별 스킬로 진행한다.
- **스키마를 건드렸으면 `/push` 전에 `/db`** — 마이그레이션 파일이 코드와 같은 커밋에 들어가야 하고, 배포 순서 판정(additive-first)도 여기서 한다. **프로덕션 반영(`db:deploy`)은 `/merge` 1단계다.**
- **회귀·버그를 잡아 고쳤으면 `/postmortem`** 으로 `docs/POSTMORTEM.md`에 회고를 남긴다. 역으로 `/implement`·`/refactor`·`/code-review`는 **착수 전 변경 영역으로 `docs/POSTMORTEM.md`를 grep**해 과거 함정을 소환한다 — 쓰기만 하고 안 읽으면 죽은 로그다.
- **`/doc-check`은 문서 전수 대조다** (2026-09-06 추가 — bugshot-2에서 가져와 이 리포의 문서 11개에 맞췄다). `/push` 4단계가 **푸시될 diff에 걸린 문서만** 보는 것과 반대로, diff와 무관하게 문서 전문 ↔ 코드베이스를 문서별 에이전트가 양방향(틀린 단언 + 누락)으로 대조한다. 같은 날 tenant-auth 리뷰가 잡은 "전환 전 상태를 서술하는" 여덟 곳이 정확히 `/push`가 못 보는 부류였다. 리포트 후 사용자 확인을 거쳐 문서별 커밋까지 한다 — `POSTMORTEM.md`(append-only)와 `docs/features/*`(근거 기록)는 대상이 아니다.
- **`/bugshot-qa`는 편집 UI의 실물 검증 전담이다** (2026-09-06 추가). ego-browser 태스크 스페이스에서 로컬 dev를 훑고, 결함을 BugShot 확장으로 `SinhyeokKang/malmoi` 이슈로 낸다. **`pnpm test`가 값은 보지만 화면은 못 보는 축**이 대상이다 — 라우트 이관, 권한별 UI 노출, 거부 문구, 입력값 유지. `/l10n-roundtrip`이 어댑터 표현 층에 대해 하는 일을 편집 UI에 대해 한다. **리포트+이슈 전용이라 코드를 고치지 않고**, preview가 아니라 **로컬**을 쓴다(preview는 Vercel SSO 뒤라 자동화가 `sso-api` 302를 받는다).
- **`/l10n-roundtrip`은 실물 검증 전담이다** (2026-09-03 추가). 실제 리포·실제 GitHub API로 push→편집→pull→머지→재pull을 한 바퀴 돌린다. **어댑터를 새로 만들거나 `write` 경로를 고쳤으면 이걸 돌린다** — 값이 맞아도 표현이 깨지는 부류는 `pnpm test`가 원리적으로 못 본다(ARCHITECTURE §1.1). 대상은 **폐기용 리포**만이다(`bugshot-i18n-test`·`i18n-format-check`·`i18n-order-check`) — 실물 오픈소스 리포에 검증 PR을 내면 흔적이 남는다. **어느 리포를 고르는지가 판정을 가른다**: 앞의 둘은 수술적 어댑터라 재생성 경로를 한 줄도 지나지 않고, 재생성(`json-catalog`·`chrome-locales`)을 고쳤으면 `i18n-order-check`다 — 그 리포가 표현 5축이 섞이도록 재포맷돼 있다.

## 문서 신선도

두 층이다. `/push`가 **푸시될 diff에 걸린 문서만** 트라이아지하고(대상·트리거는 `.claude/commands/push.md` 4단계), **`/doc-check`이 diff와 무관하게 전수 대조한다** (2026-09-06 추가 — "문서가 일곱 개뿐"이라 두지 않던 것을 열두 개가 되면서 되살렸다. 최근 커밋이 안 건드린 문서에 쌓인 stale은 `/push`가 원리적으로 못 본다). 갱신은 문서별 별도 커밋(`docs(CLAUDE): ...` / `docs(ARCHITECTURE): ...`).

- **docs/DESIGN.md** — UI 시각 규칙. UI를 만들거나 고칠 때 필독. 토큰 값의 유일한 진실은 `app/globals.css`다 — 시드 파일(`components.json`)은 CLI를 버린 2026-09-08에 함께 삭제됐다. 새 raw 색을 늘렸으면 §6.2에 등재한다. **§9가 SaaS 화면의 레퍼런스(GitLab super sidebar — 2026-09-07에 Supabase에서 바꿨다)를 든다 — 레이아웃·밀도·정보구조만 가져오고 색과 다크는 가져오지 않는다.** 커밋 prefix `docs(DESIGN): ...`
- **docs/TASKS.md** — **태스크 체크리스트.** **앞쪽 두 절(§0 "지금 어디에 있나" + "전역 미결")이 살아 있는 부분이고, 그 아래 `# 완료 기록`은 닫힌 단계다** (2026-09-05 재배치 — 미결이 §7과 §8 사이에 끼어 있어 살아 있는 항목을 찾으려면 600줄을 지나야 했다). **`lib/`·`app/`·`prisma/`에 실질 변경이 있으면 거의 항상 걸린다** — 코드를 고쳤는데 체크박스가 그대로면 그 문서는 거짓이다. 검증 조건이 실제로 통과한 태스크만 체크한다. 커밋 prefix `docs(TASKS): ...`
  - 완료 기록은 **압축하지 않는다.** 체크리스트로 보이지만 실제 내용은 "그 결정이 언제 왜 뒤집혔나"이고, ARCHITECTURE·POSTMORTEM과 겹쳐 보여도 그쪽은 현재 불변식이라 시간축이 없다. 순수 검증 목록이었던 §1·§2와 대체된 §5b-old만 접었다
- **docs/SAAS.md** — **현재 단계의 정본.** SaaS 범위·비범위·설계 결정·단계별 체크리스트·불변식 9개. **SaaS 기능을 추가/삭제했거나 단계를 끝냈거나 §10 "아직 안 정한 것"이 결정됐으면 여기부터** 갱신한다. `lib/auth/`·`app/(edit)/`·`prisma/schema.prisma`에 SaaS 관련 변경이 있으면 거의 항상 걸린다. 커밋 prefix `docs(SAAS): ...`
- **docs/MVP.md** — **PoC 스펙 (닫힘).** 범위·기술 선택·세 흐름의 계약·스키마·구현 순서. 기능을 추가/삭제했거나 기술 선택을 바꿨거나 비범위 항목을 범위로 끌어들였으면 **여기부터** 갱신한다 (코드가 스펙을 앞서면 스펙이 거짓이 된다). §10 "아직 안 정한 것"에서 결정된 항목은 본문으로 올리고 목록에서 뺀다. 커밋 prefix `docs(MVP): ...`
- **CLAUDE.md** — 명령어 표, 스택, 브랜치·배포, 스킬 라인업, 코드 컨벤션
- **docs/ARCHITECTURE.md** — export 결정성, blob SHA 비교, 커밋·PR 전략, 스캐너 계약, 스키마
- **docs/ADAPTER-COVERAGE.md** — **어댑터 범용성 측정 결과**(오픈소스 109개 + 홀드아웃 20개, **14차까지**). **§1~§4의 숫자는 학습 코퍼스 값이고, 일반화 여부는 §0 3차(홀드아웃)가 답한다** — 그쪽 오탐률이 6.3%다. §10은 키 순서 보존의 근거(4차). 지원 선언 포맷·§4.1 개정 판정·`ts-dict` 제외 판정·무인 탐지 신뢰 판정이 근거 숫자와 함께 있다. **어댑터를 새로 만들거나 탐지 규칙을 손대기 전에 읽는다.**
  - **⚠️ 재측정 트리거: `lib/adapters/**`·`lib/survey/**`의 실질 변경.** 그때 `pnpm adapter-survey`를 **학습과 홀드아웃 둘 다** 돌리고 이 문서에 회차를 더한다 — §0 3차에서 수정 4건 중 2건이 수정이 만든 회귀였고 그중 하나는 학습 코퍼스에서만 나타났다. 한쪽만 돌리면 못 본다. 판정은 `/push` 4d가 사용자에게 묻는다(네트워크 ~4분이라 게이트가 아니다)
  - **상시 방어선은 `lib/adapters/__tests__/key-order-golden.test.ts`다** — 실측 리포 모양을 인라인 픽스처로 들고 `lib/survey/diff.ts`의 프로덕션 함수로 잰다. 순서·결정성 회귀는 네트워크 없이 `pnpm test`가 잡고, 재측정이 답하는 것은 **일반화**뿐이다
- **docs/ACTIONS.md** — **대상 리포**에 넣는 워크플로. 실제 일은 `.github/actions/l10n-push`(composite action)가 하고 대상 리포는 그것을 부르는 15줄만 갖는다. `inputs`를 바꾸거나 red 조건을 바꿨으면 갱신한다. ⚠️ **말모이 리포가 private이라 Settings > Actions > General에서 접근 허용이 켜져 있어야 대상 리포가 이 action을 쓸 수 있다.** 커밋 prefix `docs(ACTIONS): ...`
- **docs/POSTMORTEM.md** — 회고 누적 (append-only, `/postmortem` 전담)
- **docs/features/README.md** — 기능 문서 9개 + 근거 문서의 상태 + **살아 있는 백로그**. 기능을 끝냈으면 표에 한 줄을 옮기고 **결론을 정본(SAAS — 현재 / ARCHITECTURE — 불변식 / MVP — PoC, 닫힘)으로 올린다** — 안 올리면 정본이 낡고 이 디렉터리가 스펙처럼 읽힌다. 커밋 prefix `docs(feature): ...`
- **README.md** — CLAUDE.md의 요약 미러. 스택·명령·브랜치·현 단계 선언이 바뀌면 같이 갱신한다 — 신규 진입자가 처음 여는 파일이라 여기가 낡으면 닫힌 스펙으로 안내한다. 커밋 prefix `docs(README): ...`

`.env.example`도 문서로 취급한다 — **새 환경변수를 코드에서 읽었으면 같은 커밋에서 `.env.example`에 추가**한다. 빠지면 새 체크아웃·Vercel 재설정에서 원인 불명으로 죽는다.

## 코드 컨벤션

- **커밋 메시지는 영문**, Conventional Commits (`feat:` `fix:` `test:` `refactor:` `docs(scope):` `chore:`).
- **⚠️ 화면 문구는 `messages/en.tsx`를 지난다 — 소스에 한글 UI 리터럴 금지.** `lib/i18n/__tests__/no-korean-ui.test.ts`가 `app`·`components`·`lib`·`messages` + 루트 `auth.ts`·`middleware.ts`를 훑고, 허용 목록은 **둘뿐이다**(`auth.ts`의 서버 로그 · `lib/push/apply.ts`의 SQL 주석 — 2026-09-08 6b-1이 `lib/pull/render.ts`를 뺐고 **`lib/adapters/**` 제외도 함께 풀렸다**). **주석은 벗기고 세므로 아래의 "주석은 한국어로"와 충돌하지 않는다.**
- **주석은 한국어로, "왜"만 쓴다.** 코드가 말하는 "무엇"을 반복하지 않는다. 특히 **비자명한 제약·함정·과거에 밟은 지뢰**를 남긴다 (예: "pooler로 마이그레이션하면 DDL 세션을 못 잡아 실패한다").
- **순수 함수를 먼저 분리한다.** export 생성·blob SHA·키 추출·정렬은 I/O 없는 순수 함수여야 하고, 그래서 테스트가 가능하다. DB·GitHub 호출은 얇은 껍데기로 감싼다.
- **`any` 금지**, `noUncheckedIndexedAccess`가 켜져 있으니 인덱스 접근은 undefined를 처리한다.
- **환경변수는 한 곳에서 읽는다** (`lib/env.ts`의 `requireEnv`·`optionalEnv`) — 흩어진 `process.env` 접근은 누락된 변수를 런타임까지 숨긴다. 인가 판정에 넘기는 값(`CRON_SECRET`)은 `optionalEnv`다 — 던지면 fail-closed 판정에 닿기 전에 본문 없는 500이 된다. ⚠️ **`PUSH_TOKEN`은 이 부류가 아니다** — 서버의 인가 판정에 안 들어가고 `scripts/push-local.ts`가 **보낼** 값이다(2026-09-07부터 push 인증은 `Project.pushTokenHash` 조회다).
- **⚠️ 환경변수를 읽는 코드를 모듈 최상위에서 평가하지 않는다.** 함수 안에 두고 호출 시점에 읽는다. 최상위 평가는 "파일을 읽기만 해도 죽는다"를 뜻하고, `.env`가 없는 CI에서 import·빌드만으로 실패한다 (`prisma.config.ts`가 이걸로 CI를 red로 만든 전례 — `docs/POSTMORTEM.md` 2026-08-31). 함수 안에 있어도 그 함수를 최상위 `const`가 부르면 같은 문제다.
- **서버 전용 모듈엔 `import "server-only"`.** 클라이언트 번들 유입을 컴파일 타임에 막는다. **단 테스트가 직접 import하는 순수 모듈(`lib/env.ts` 등)엔 붙이지 않는다** — 이 패키지는 `react-server` 조건 밖에서 던져서 vitest가 죽는다.
- **날짜는 UTC로 저장**, 표시 시점에만 로컬로 변환.
- **일회성 실험 스크립트는 `.scratch/`에 둔다.** 리포 **안**이어야 tsconfig·경로 별칭이 잡히고, `.gitignore`에 있어야 `git add -A`에 안 딸려간다 — 2026-09-03에 `.b3-*.ts` 둘이 그렇게 커밋됐다.
- **⚠️ 차단은 두 층이고, 조건부 렌더는 어느 층도 아니다** (2026-09-05 갈렸다). **1차 `middleware.ts`** 는 렌더 요청(GET·HEAD)에 쿠키 이름만 보는 값싼 차단이고(DB 세션이라 그 이상 못 한다 — Action POST는 지나가 스스로 거부한다), **본판정은 진입점**이다 — 페이지는 최상단 `requireProjectAccess`, Server Action은 `getProjectAccess`. 레이아웃·페이지의 조건부 렌더는 차단이 아니다: App Router가 레이아웃과 페이지를 병렬로 렌더해 페이지가 이미 실행되고 RSC 페이로드가 응답에 실린다(실측 1.3MB 노출). 레이아웃에서는 `redirect()`를 던진다. **새 보호 라우트는 `matcher`에 추가한다** (ARCHITECTURE §6.1).
- **⚠️ 로케일 파일이 키의 진실, 코드 스캔은 `refs`만 준다.** 스캔 실패로 적재를 막지 않는다 — 남의 리포 CI를 우리 규칙으로 실패시키지 않는다 (ARCHITECTURE §4).
- **⚠️ 새 writer를 만들면 `lib/adapters/shared.ts`의 결정성 규칙을 쓴다.** 정렬·재조립·들여쓰기·끝 개행 1개를 직접 구현하지 않는다 — 표현은 `lib/adapters/json-style.ts`가, 정렬은 `orderedEntries`가 한 곳에서 든다 (ARCHITECTURE §1.1). **단 수술적 치환 어댑터는 그 규칙을 지나지 않는다** — 원본 보존이 요지다. 어느 쪽인지는 `writeStrategy`가 정하고, `lib/adapters/__tests__/contract.ts`가 `ADAPTERS`를 순회하며 그 매트릭스를 검사한다.
- **⚠️ "원본 내용이 필요한가"는 `writeStrategy`로 판단한다, `layout`이 아니다.** `yaml-catalog`·`code-dict`가 `per-locale`인데 수술적이다 — `layout`으로 가르는 코드가 남아 있으면 그 프로젝트의 PR이 조용히 비어 나간다 (ARCHITECTURE §1).
- **⚠️ 모든 DB 쿼리는 `projectId`로 좁힌다.** 인덱스가 전부 `projectId` 선두 복합이라 안 좁히면 풀스캔이고, 더 중요하게는 **테넌트 간 데이터가 새는 경로가 된다.** RLS가 없어 애플리케이션이 유일한 방어선이다 — 멤버십 판정을 지났더라도 쿼리가 `projectId`를 빠뜨리면 다른 테넌트의 행이 나온다.
  - ⚠️ **"애플리케이션이 유일한 방어선"은 2026-09-09까지 거짓이었다.** 그 문장은 "DB에 닿는 경로가 앱 하나"를 전제하는데 **Supabase는 PostgREST·GraphQL 데이터 API를 기본으로 켜 두고**, `public` 스키마의 `pg_default_acl`이 **`anon`·`authenticated` 롤에 새 테이블 전 권한을 자동으로 준다.** 실측: prod·dev 12테이블 전부 RLS off + `anon`에 `SELECT,INSERT,UPDATE,DELETE,TRUNCATE` — **anon key 하나로 `Account.access_token`·`Session.sessionToken`까지 읽고 지울 수 있었다**(Supabase 주간 advisor 메일이 알려줬다). **조치: `anon`·`authenticated`의 `public` 권한을 REVOKE하고 `ALTER DEFAULT PRIVILEGES`에서도 뺐다** — 후자가 없으면 **다음 마이그레이션이 만드는 테이블이 다시 열린다.** `service_role`은 남겼다(그 키는 비밀이고 공개 전제가 아니다). RLS+정책 대신 REVOKE를 고른 이유: 우리는 그 API를 한 줄도 안 쓰므로 대가가 0이고, 정책을 잘못 쓰면 구멍이 남는다.
  - **새 마이그레이션 뒤에는 `anon` 권한이 0인지 확인한다** (`/db`가 그 검사를 든다). Supabase Advisors(Security)가 0 errors인지도 같은 신호다.

## 게이트웨이 (알아두면 유용)

- **`prisma`의 npm `latest` 태그가 RC를 가리킨다.** 2026-08 시점 `latest`가 `8.0.0-rc.12`고 stable은 `prev` 태그의 `7.10.0`이다. `pnpm add prisma`로 무심코 깔면 RC가 들어오고 `alchemy`·`cloudflare-runtime` 같은 무관한 의존성이 딸려온다. **버전을 명시해 깐다.**
- **Supabase pooler와 Prisma**: `DATABASE_URL`에 `?pgbouncer=true`가 없으면 prepared statement 충돌로 간헐 실패한다. 증상이 "가끔 되고 가끔 안 됨"이라 진단이 오래 걸린다.
- **Vercel Cron은 Hobby 플랜에서 하루 1회**다. 야간 pull 1회가 요구사항이라 지금은 맞지만, 주기를 늘리려면 플랜을 봐야 한다. **cron은 프로덕션 배포에서만 돈다** — preview 배포가 야간 pull을 중복으로 돌려 대상 리포에 PR을 내지 않는다는 뜻이고, 브랜치 분리(2026-09-04)가 안전한 이유의 하나다.
- ⚠️ **App 설치가 `Only select repositories`다** (2026-09-07 전환 — 그 전엔 `all`이었다). **DB에 `Project` 행을 만드는 것만으로는 부족하고** GitHub 설치의 선택 목록에도 그 리포를 넣어야 한다. 안 넣으면 `probeRepo`가 `not-installed`를 주고 화면은 "App이 제거·일시중지됐거나 이 리포 접근이 철회됐어요"를, 야간 pull은 "base 브랜치를 읽을 수 없다"를 낸다. **현재 목록은 넷**: `bugshot-2` · `bugshot-i18n-test` · `i18n-format-check` · `i18n-order-check`. `skillflo-web`은 일부러 빠져 있다(`Project.installationId`가 `null`이라 pull이 애초에 안 돈다). 전환한 이유는 T5의 접근 철회 시나리오가 `all`에서 재현 불가였기 때문이다.
- **GitHub App 개인키는 개행이 들어간 PEM**이다. Vercel env에 넣을 때 개행이 `\n` 문자열로 이스케이프되므로 읽는 쪽에서 복원해야 한다. 안 하면 JWT 서명이 조용히 실패한다.
- **`.pem`은 `.gitignore`에 있다.** 이 패턴이 뚫리면 리포 쓰기 권한이 새어나간다.
- ⚠️ **`pnpm-workspace.yaml`의 공급망 정책 둘이 "왜 이게 안 깔리지"를 만든다.** `minimumReleaseAge: 1440`은 **publish된 지 24시간이 안 된 버전을 설치 대상에서 제외**하므로 방금 나온 버전을 명시해도 직전 버전이 깔린다(긴급 패치가 필요하면 `minimumReleaseAgeExclude`). `onlyBuiltDependencies`는 pnpm 10이 빌드 스크립트를 기본 차단하는 것의 화이트리스트라, 여기 없는 패키지는 `Ignored build scripts` 경고만 남기고 postinstall이 안 돈다. **둘 다 증상이 원인을 안 가리킨다.**
- **`orphaned`는 삭제가 아니다.** export에서만 빠지고 DB엔 남는다. "번역이 사라졌다"는 제보를 받으면 먼저 이 플래그를 본다. **`StringKey`와 `Locale` 둘 다 갖는다** — 리포에서 사라진 로케일도 지우지 않고 표시만 하며, pull이 그 파일을 내지 않는다 (ARCHITECTURE §5.5.16). "로케일 열이 사라졌다"·"지운 로케일 파일이 PR에서 돌아온다"는 둘 다 이 플래그가 답이다.

## 명시적 비범위

**비범위 정본이 둘이다**: PoC는 [docs/MVP.md](./docs/MVP.md) §7, SaaS는 [docs/SAAS.md](./docs/SAAS.md) §4.2다. 요청받아도 먼저 그 목록을 근거로 되묻는다 — 범위를 지키는 게 이 프로젝트의 성패다.

⚠️ **SaaS §4.3은 "1차에서 빼되 2차에 열어두는 것"이라 성격이 다르다** — 이메일 매직링크 로그인과 push 웹훅 둘이고, "필요 없다"가 아니라 "지금 넣으면 면적 대비 얻는 게 작다"는 판정이다. 각자 2차에 열 조건이 적혀 있다.

큰 축만: ICU 복수형, 동시 편집, 다중 프로젝트, 세밀한 권한, in-context 편집, 스크린샷 첨부, 번역자 노트, 승인 워크플로, push 웹훅.

컨텍스트 제공은 **코드 참조 자동 수집 + 네임스페이스 단위 그룹핑** 두 개까지다. 편집 UI의 성패가 컨텍스트에 달려 있지만, 그 답이 "기능을 더 넣기"는 아니다.

## 메모리 & 참고 문서

- **`docs/TASKS.md` — 태스크 체크리스트. 지금 무엇을 해야 하는지의 정본. 착수 전 필독**
- **`docs/DESIGN.md` — 편집 UI 시각 규칙. UI 작업 전 필독**
- **`docs/SAAS.md` — SaaS화 스펙. 현재 단계의 정본. 착수 전 필독**
- **`docs/MVP.md` — PoC 스펙 (닫힘). 범위·근거·세 흐름의 계약 — 코어 원칙의 원문이 여기다**
- `docs/ARCHITECTURE.md` — 설계 상세·함정 (코어 로직 건드리기 전 필독)
- `docs/ADAPTER-COVERAGE.md` — 어댑터가 남의 리포에서 실제로 어떻게 동작하는지의 실측 (어댑터·탐지 규칙 건드리기 전 필독)
- `docs/POSTMORTEM.md` — 과거 함정 (`/implement`·`/refactor`·`/code-review` 착수 전 grep)
- `docs/features/README.md` — 기능 문서 인덱스와 남은 백로그 (`/feature` 착수 전 필독 — 같은 것을 두 번 설계하지 않으려면)
- `~/code/bugshot-2` — 이 하네스의 원본이자, 셋업 완료 후 push/pull 실전 테스트 대상(ko/en/fr 3개 로케일). **하네스를 참고할 때 그 리포의 i18n 구현을 조사 대상으로 삼지 않는다.**
- `~/.claude/projects/<이 체크아웃 경로를 슬러그화한 디렉터리>/memory/` — Claude Code 전용 개인 메모리 (Codex는 읽지 않는다). **머신마다 경로가 다르다** — 두 대에서 작업 중이라 홈 디렉터리 이름이 갈린다. 경로를 문서에 박지 않는다
