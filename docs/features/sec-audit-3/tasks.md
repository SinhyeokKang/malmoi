# sec-audit-3 — 태스크 (tasks)

순서: 🔴 → 🟡 → ⚪, 각 묶음 안에서 순수 함수(테스트 먼저) → 껍데기 → UI·문서. `[C]`는 커밋 경계.
공통 검증: 각 커밋 전 `pnpm typecheck && pnpm test` green. `test:projects:postgres` 대상 경로(CLAUDE.md 명령어 표)를 건드린
커밋은 그것도 green.

## 0. 착수 전

- [x] **T0.1** 결정 A~G 반영(design.md 머리). — 검증: design.md에 남은 "확인 필요"는 2번 PUBLIC 상속(T2.3) 하나.
- [ ] **T0.2** prod `SELECT DISTINCT code FROM "Locale"`를 받아 `isLocaleShaped` 후보 규칙에 돌린다(읽기 전용). — 검증: 거부 0건. 1건 이상이면 규칙 조정 후 재실행.

## 1. 🔴 #1 로케일 모양 + 리포 쓰기 권한

- [ ] **T1.1** `/tdd`: `isLocaleShaped` 테스트 — 통과(`en`·`pt_BR`·`zh-Hant-TW`·`es-419`·`sr-Latn`·`fil`·`en-GB-oxendict`) / 거부(`package`·`index`·`README`·`config`·`action`·`e`·`abcd`·`en--US`). — 검증: red.
- [ ] **T1.2** `isLocaleShaped` 구현(`lib/locale-code.ts`, 잎 유지). — 검증: T1.1 green, 파일 import 0.
- [ ] **T1.3** push 스키마 `LocaleCode`가 `isPathSafeLocale && isLocaleShaped`를 요구. `locales[]`·`translations[].locale`·`baseLocale` 전부. — 검증: `lib/push/__tests__`에 `locales:["en","package"]` 400 케이스 green.
- [ ] **T1.4** `resolveLocalePaths` per-locale 갈래가 `isLocaleShaped` 실패를 `fail`. 테스트는 **트리에 실재하는** `package.json` 형제를 둔 픽스처로(POSTMORTEM 2026-09-13). — 검증: green, `fail(` 분류 테스트(코드를 드는 자리/안 드는 자리 목록 — ARCHITECTURE §5.6)에 새 자리 등재.
  `[C] fix(push): reject non-locale-shaped codes at push and pull boundaries`
- [ ] **T1.5** `/tdd`: `planRepoConnect`에 `push:false → repo-read-only`, `push:null → unavailable`, `push:true → ok` 케이스. — 검증: red.
- [ ] **T1.6** `lib/github-connect/user.ts`가 `{ fullName, push }`를 돌려주고 `planRepoConnect` 입력 확장 + 구현. — 검증: T1.5 green, `credential-separation.test.ts` green(GET만).
- [ ] **T1.7** 호출처 전수(생성·Reconnect·Add surface·온보딩 확인)에 `repo-read-only` 갈래 배선 + `messages/en.tsx` 문구. — 검증: `rg planRepoConnect` 호출처마다 새 상태 처리, `no-korean-ui`·`brand-spelling` green, `pnpm test:projects:postgres` green.
  `[C] fix(connect): require push permission on the repository to connect a project`
- [ ] **T1.8** ARCHITECTURE §5.5.05(모양 규칙·2층·3글자 잔여)·§6(쓰기 권한 요구·초대 OWNER 잔여) 갱신. — 검증: 문서가 코드 판정과 같은 문장.
  `[C] docs(ARCHITECTURE): record locale-shape boundary and repo write requirement`

## 2. 🟡 #2·#3 DB 스키마 USAGE

- [ ] **T2.1** `/db`: 마이그레이션 `revoke_public_schema_usage_from_api_roles`(롤 존재 조건 DO 블록) 생성 → dev 적용. — 검증: dev `has_schema_privilege('anon','public','USAGE') = false`, `pnpm test:projects:postgres` green(롤 없는 DB에서 적용 성공).
- [ ] **T2.2** `.claude/commands/db.md` 5단계: prod 필수 + 스키마 USAGE SQL. `pnpm sync:agents`. — 검증: `pnpm sync:agents:check` green.
  `[C] chore(db): revoke public schema usage from Supabase API roles`
- [ ] **T2.3** (운영, `/merge` 1단계) prod `db:deploy` 뒤 USAGE·GRANT·default ACL 재조회, PUBLIC 상속으로 여전히 true면 design의 후속 판단. Supabase Advisors → Security와 `realtime` RLS를 눈으로 확인해 기록. — 검증: prod `has_schema_privilege` false 두 롤.
- [ ] **T2.4** ARCHITECTURE §7·OPERATIONS에 "USAGE로 닫는다, default ACL은 남는다" + 확인 SQL. — 검증: CLAUDE.md Supabase 절의 "예방이 아니라 탐지" 문장이 새 사실과 모순 없음(CLAUDE.md 갱신 포함).
  `[C] docs(ARCHITECTURE): close API-role access at schema usage`

## 3. 🟡 #4 YAML 1.1 모호 값

- [ ] **T3.1** `/tdd`: `isYaml11Ambiguous` + yaml-catalog write 케이스 — `No`·`yes`·`on`·`off`·`y`·`~`·`null`·`12:30`·`0x1F`·`1_000`·`.inf`·`2026-09-27` 인용, `hello`·`No way` PLAIN 유지, 원본 `QUOTE_SINGLE`이면 단일 인용. 출력을 `yaml` 1.1·1.2 파서 양쪽으로 다시 읽어 문자열인지 단언(값만이 아니라 표현도 — POSTMORTEM 2026-09-03 "값이 맞으면 통과하는 검증"). — 검증: red.
- [ ] **T3.2** 구현(`flowString`). — 검증: T3.1 green, `lib/adapters/__tests__/contract.ts` green, 값 무변경 행 바이트 동일 테스트 green.
  `[C] fix(yaml-catalog): quote values YAML 1.1 would not read as strings`
- [ ] **T3.3** ARCHITECTURE §1.4에 규칙과 "기존 프로젝트의 1회 변경 PR" 기록. `/push` 4d 재측정 판정 근거(writer만 변경) 메모. — 검증: 문서 반영.

## 4. 🟡 #5 · ⚪ #9 문서 사실 정정

- [ ] **T4.1** PRODUCT §7.1 보관 문장을 §7.9와 일치. — 검증: `rg "보관 후에도 허용" docs/PRODUCT.md` 0건.
  `[C] docs(PRODUCT): align archived-project metadata rule with §7.9`
- [ ] **T4.2** `action.yml` private 주석 제거. — 검증: `rg -n private .github/actions/malmoi-i18n-push/action.yml` 0건.
  (T5.4와 한 커밋 가능)

## 5. ⚪ Server Action·CLI 경계 (#6·#7·#8·#10)

- [ ] **T5.1** #6 `deleteProjectImage` slug 스키마 검증 + 테스트(비문자열 → `{ok:false}`). — 검증: green.
- [ ] **T5.2** #7 `startGithubConnect` 보관 거부 + 테스트. — 검증: green.
  `[C] fix(settings): validate slug and refuse GitHub connect on archived projects`
- [ ] **T5.3** #8 초대 수락: 멤버 조회를 트랜잭션 안으로, P2002 → `already-member`. — 검증: 단위 green + `pnpm test:projects:postgres`에 동시 수락 케이스 추가 green.
  `[C] fix(invite): report already-member for concurrent acceptance`
- [ ] **T5.4** #10 `/tdd` `isAllowedPushUrl` → 구현 → `push-local` 배선(exit 2). ACTIONS `api-url` https 명시. — 검증: green, `http://example.com` exit 2 / `http://localhost:3000` 통과.
  `[C] fix(cli): refuse plain-http push URLs outside loopback` (+ T4.2)

## 6. ⚪ 서명·토큰 (#13·#14·#16·#17·#18)

- [ ] **T6.1** #13 `/tdd` 샘플 확인 `issuedAt`·TTL·`v2` 라벨(만료·미래 시각·옛 라벨 거부). → 구현 → 호출처 `now` 전달. — 검증: green.
- [ ] **T6.2** #14 `APP_SIGNING_SECRET`: `lib/env.ts` 경유, 호출처 5곳 교체, `.env.example`. — 검증: `rg 'requireEnv\("AUTH_SECRET"\)' app lib` 0건(Auth.js 자체 제외), 최상위 평가 0.
  `[C] feat(auth): sign connect state and sample confirmation with a dedicated key`
- [ ] **T6.3** (사람) `.env.local` 두 머신 + Vercel 3환경 `APP_SIGNING_SECRET` 등록, `vercel env ls` 시각 확인(CLAUDE.md `--force` 함정). — 검증: 목록에 3환경.
- [ ] **T6.4** #16 `listBranches`·`openRepoReader`에 `repositoryId` 스코프. 온보딩 호출처는 probe id. — 검증: 단위 green, `pnpm smoke:github <slug>` 통과(읽기 전용, 사람이 실행).
  `[C] fix(github): pin read tokens to the repository id`
- [ ] **T6.5** #17 push `refs.path` refine + `buildPermalink` 불량 행 null. — 검증: green.
- [ ] **T6.6** #18 `/tdd` `jsonWithinBounds` → push `placeholders` refine. — 검증: 깊이 9 / 16KB 초과 400, 크롬 정상 블록 통과.
  `[C] fix(push): bound refs paths and placeholder payloads`
- [ ] **T6.7** OPERATIONS(서명 키 회전)·CLAUDE.md(서명 키 한 줄)·ARCHITECTURE §6. — 검증: 문서 반영.

## 7. ⚪ 초대 한도 (#15)

- [ ] **T7.1** `/tdd` 한도 판정에 사용자 합산 케이스 → 구현 → `readLimits`가 `invitedBy` 건수 읽기 + 거부 문구. — 검증: 단위 green, `pnpm test:projects:postgres` green.
  `[C] fix(invite): add a per-user hourly issuance limit`

## 8. ⚪ 런타임 헤더 (#11·#12)

- [ ] **T8.1** #12 `/tdd` `isBlobPublicHost` + `buildCsp`가 단일 Blob 호스트 / 없으면 미포함. `BLOB_PUBLIC_HOST` `.env.example`. — 검증: green.
  `[C] fix(csp): allow only this environment's Blob host`
- [ ] **T8.2** (사람) Vercel 3환경 `BLOB_PUBLIC_HOST` 등록 + `.env.local`. — 검증: `vercel env ls`.
- [ ] **T8.3** #11 `/tdd` `buildCsp(env, { nonce })` — prod `script-src`에 `'unsafe-inline'` 없음, `'nonce-…' 'strict-dynamic'`. — 검증: red→green.
- [ ] **T8.4** 미들웨어 nonce 발급·헤더 주입, `next.config.ts` 정적 CSP 제거(헤더 1개), matcher 재구성 + `entry-points.test.ts` 갱신. — 검증: 단위 green, `pnpm build` green.
- [ ] **T8.5** 로컬 `pnpm build && pnpm start` 수동 한 바퀴(ARCHITECTURE §8 목록), 콘솔 CSP 위반 0. dev 서버 재시작 주의(메모리: build during dev → stale). — 검증: 위반 0 스크린샷/기록.
  `[C] feat(csp): nonce-based script-src`
- [ ] **T8.6** ARCHITECTURE §8(nonce·style 잔여·Blob 호스트·동적 렌더 대가) 갱신. — 검증: 문서 반영.

## 9. 마무리

- [ ] **T9.1** `/code-review` → `/refactor` → `/push`(dev). `/push` 4단계에서 개인정보 방침 영향 확인(새 쿠키·전송처 없음 — 판정 기록).
- [ ] **T9.2** `/merge` 1단계에서 prod `db:deploy` + T2.3.
- [ ] **T9.3** 이 디렉터리 삭제(결론은 정본으로 올라갔는지 확인 후). `/postmortem`은 1번에 대해 작성(🔴 — 2026-09-09 경로 항목의 인접 축을 놓친 사례).
