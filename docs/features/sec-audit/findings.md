# sec-audit — 보안 감사 발견 (2026-09-09, 1차)

**이 디렉터리는 `/feature` 산출물이 아니다.** `spec.md`·`design.md`가 없고 **`findings.md`(근거, 남긴다)
+ `tasks.md`(ship 단위 실행, 닫히면 지운다)** 둘이다 — 설계할 기능이 아니라 **이미 있는 코드에서 찾은
결함 목록**이라서다. 선례는 `tenant-auth/audit-2026-09-06-codex.md`(감사 원문을 근거로 보관)이고,
차이는 그쪽이 외부(Codex) 감사이고 이쪽은 이 리포의 `/audit`을 보안 축으로 다시 돌린 것이라는 점이다.

**기준 커밋: `cfbe5ac`** (= `a00d380`, PR #19 squash — 두 커밋의 트리가 동일하다). 아래 모든 `file:line`은
그 트리 기준이고, 감사 종료 시점에 `git diff cfbe5ac..HEAD -- lib app components prisma messages scripts`가
비어 있음을 확인했다.

**시급도 표기는 CLAUDE.md·`/audit`과 같다**: 🔴 조용히 깨지는 것·데이터 유출·불변식 위반 / 🟡 규약 위반·
회귀 위험 / ⚪ 정리 거리. **번호(1~28)는 감사 리포트의 연번을 그대로 쓴다** — `tasks.md`가 이 번호로
참조하므로 **재번호하지 않는다.** 2차 감사는 29번부터 잇는다.

---

## 0. 감사 방법과 신뢰도

여섯 축을 병렬 감사했다: ① 인증·세션·계정신원 ② 인가·테넌시(IDOR) ③ 시크릿·토큰·암호 비교
④ 주입·신뢰할 수 없는 파싱·자원 소진·경로 ⑤ 클라이언트 노출·XSS·헤더 신뢰·SSRF·자격증명 분리
⑥ 공급망·의존성·플랫폼 설정. 여기에 **DB·플랫폼 실측**(읽기 전용 SQL, `gh api`)을 더했다.

**증거의 등급이 셋이고, 섞으면 이 문서가 거짓이 된다:**

| 등급 | 뜻 | 해당 항목 |
|---|---|---|
| **실행 확정** | 프로덕션 코드를 실제로 돌려 결과를 봤다 | **1** (어댑터 read→write 왕복) · **6** (`RangeError` 재현 + 헤더 latin1 전달 경로) |
| **실측** | 읽기 전용 쿼리·API 응답으로 확인했다 | **7·8** (prod·dev DB 권한) · **13**(리포 Actions 설정) · **27**(`pnpm audit` + advisory DB 17개 개별 조회) |
| **정적 판독** | 소스를 읽어 판단했다. 런타임 거동은 안 봤다 | 나머지 전부 |

**UNVERIFIED로 남은 것 둘** — 이 둘은 판정이 갈리므로 고치기 전에 재야 한다:

- **6**: Vercel 엣지가 비ASCII 헤더 바이트를 앞단에서 거르는지. Node·Web `Request` 층까지는 살아 감을 확인했다.
- **2**: GitHub create-tree API가 트리 항목 경로의 `..`를 정규화·거부하는지. **그래서 2번의 시나리오는
  `..`가 필요 없는 변종으로 세웠다** — 이 미확인이 판정을 바꾸지 않게 하려는 것이다.
- **25**: Vercel이 알 수 없는 `Host`를 앱에 넘기는지 / `x-forwarded-proto`를 덮어쓰는지.

⚠️ **테스트·빌드를 돌리지 않았다.** 가드 테스트(`entry-points`·`credential-separation`·`client-graph`·
`push-token-column`·`github-callback`)가 "무엇을 검사하고 무엇을 못 보는가"는 **소스를 읽어** 판단한
것이고, 지금 green인지는 확인하지 않았다.

⚠️ **검증 목적으로 `.scratch/`에 임시 스크립트 둘을 만들어 실제 어댑터를 실행하고 삭제했다.** 추적
파일은 수정하지 않았고 커밋도 하지 않았다.

---

## 1. 🔴 심각

### 1. 리포 로케일 파일의 `"__proto__"` 키가 서버 프로세스의 `Object.prototype`에 쓰기 권한을 준다

`lib/adapters/json-catalog.ts:283-294` (`setDeep`)

`head === "__proto__"`이면 `node[head]`가 `Object.prototype`을 돌려주고, `typeof === "object"`라
`child`가 되어 다음 세그먼트가 `Object.prototype[x] = value`로 앉는다.

**실행 확정** — 프로덕션 코드(`adapterFor("json-catalog")`)로 왕복:

```
read → [{"key":"__proto__.polluted","message":"PWNED","order":0},{"key":"a.b","message":"ok","order":1}]
before write: undefined
after  write: "PWNED"                    ← ({} as Record<string, unknown>).polluted
written file: { "a": { "b": "ok" } }     ← 그 키는 출력에서 조용히 사라진다
```

⚠️ **입력을 만들 때 `JSON.stringify({__proto__: {...}})`를 쓰면 재현되지 않는다** — 객체 리터럴의
`__proto__:`는 프로토타입을 세우고 own property를 만들지 않아 빈 객체가 직렬화된다. **리터럴 JSON
텍스트**여야 하고, 그때 `JSON.parse`가 `__proto__`를 own property로 만들어 `Object.entries` →
`flatten`(`json-catalog.ts:194-199`)이 `__proto__.polluted`를 낸다. 첫 시도가 이 함정에 걸려 "read가
막는다"로 오판할 뻔했다.

**공격**: 연결된 리포의 로케일 파일에 `{"__proto__":{"nested":"1"}, "a":{"b":"c"}}`를 커밋한다(중첩
JSON은 `json-catalog`의 흔한 모양이다). push가 키를 그대로 적재하고(`keys[].key`는 `z.string().min(1)`뿐 —
`lib/push/plan.ts:45`, 저장은 `lib/push/apply.ts:132`), 야간 pull의 `write`가 `Object.prototype.nested = "1"`을
세운다. 그 뒤 같은 람다 인스턴스가 서비스하는 **모든 테넌트**에서 `format.nested ?? false`
(`json-catalog.ts:247`)가 truthy가 되어 평평한 파일이 중첩으로 재작성되고 **점 포함 키의 값이 무관한
고객의 PR에서 사라진다**(ARCHITECTURE §1.35의 손실 계열).

**권한 격차가 이 항목의 무게다**: 필요한 것은 "연결된 리포에 커밋"뿐이고, 말모이 프로젝트 OWNER보다
**약한** 권한이다. 영향은 프로세스 전역이고 테넌트 경계를 넘는다.

**같은 뿌리**: POSTMORTEM 2026-09-08(`?? 폴백`이 프로토타입 키를 못 막아 문자열 자리에 함수가 왔다)의
후속 조치가 **조회** 자리 5곳(`lib/i18n/index.ts:26`·`lib/i18n/adapter-errors.ts:24`·
`json-catalog.ts:246`·`lib/survey/one.ts:210`)에 `Object.hasOwn`을 넣었는데 **대입** 자리는 안 봤다.
17번이 그 나머지다.

### 2. 로케일 코드가 검증 없이 리포 쓰기 경로에 보간돼, 고객 리포의 임의 파일에 쓰는 원시체가 된다

`lib/pull/plan.ts:125-127` (`resolveLocalePaths`)

`format.pathTemplate.replaceAll("{locale}", locale)`의 결과가 **트리에 실존하는지와 무관하게** 트리
엔트리가 된다(`lib/pull/payload.ts:50`). per-locale 갈래가 트리를 안 보는 것은 의도다 — 새 로케일
파일을 만들어야 하기 때문이고, 주석이 그렇게 적혀 있다(`plan.ts:123`).

로케일 코드의 출처는 `Locale.code`이고 `applyPush`가 `payload.locales`를 **그대로** 삽입한다
(`lib/push/apply.ts:89-103`). 스키마에 문자 집합 검증이 없다:

- `locales: z.array(z.string().min(1)).min(1)` (`lib/push/plan.ts:75`)
- `pathTemplate: z.string().min(1)` (`lib/push/plan.ts:32`)

⚠️ **`looksLikeLocale`(`lib/adapters/shared.ts:91`)은 존재하지만 어댑터 *탐지* 경로에서만 쓰인다** —
적재 경로에 없다. 다른 보간 자리는 전부 트리에 재고정한다(`templatePaths`가 `paths` 필터 +
`looksLikeLocale` 재검사 — `lib/onboarding/confirm.ts:30-38`; `selectLocaleFiles`가 `paths.includes(p)` —
`lib/push/payload.ts:45`). **이 한 곳만 아니다.** 유일한 가드는 `plan.ts:120-122`이고 그것은 `{locale}`이
있는지만 본다.

**공격**: 포맷 컬럼 셋이 아직 null인 프로젝트(`checkFormat`이 전부 null이면 통과 —
`lib/push/guard.ts:69-71`)에 push 토큰으로 `pathTemplate: "{locale}"`, `locales: ["en", ".github/workflows/pwn"]`을
보낸다. 두 `.refine`(`plan.ts:103-108`)을 모두 만족한다. 야간 pull이 **설치 토큰**으로 `l10n/sync-<slug>`
브랜치에 `.github/workflows/pwn`을 커밋한다 — **`..`가 필요 없어** 트리 API가 거부할 근거가 없다. 그
브랜치 push가 워크플로를 그 리포의 Actions secret과 함께 실행시킨다(`[skip-l10n]`은 **우리** push 루프만
막는다 — `payload.ts:19`).

**권한 격차**: `planRepoConnect`(`lib/github-connect/connect-plan.ts:45-53`)는
`GET /user/installations/{id}/repositories`에 리포가 보이는 것만 요구하므로 **읽기 전용 협력자**가
프로젝트를 만들어 push 토큰을 받고(`app/(edit)/projects/actions.ts:626`) 리포 쓰기 + CI 실행으로
승격한다.

포맷이 이미 굳은 프로젝트에서도 **`locales`는 매 push의 진실이라 항상 확장 가능하다** —
`locales/{locale}.json`에 `locale = "../../.github/workflows/pwn"`이면 `locales/../../…`가 되고, 그때는
GitHub의 `..` 처리에 달린다(§0 UNVERIFIED).

**부가**: 이 항목은 "앱이 로케일 파일만 건드린다"는 제품의 약속과 설치 토큰의 실제 권한
(`contents: write` 전체) 사이의 간격이다. 그 간격을 좁히는 것이 값싼 방향이다.

---

## 2. 🟠 높음

### 3. 남의 리포에서 도는 composite action이 가변 ref에 의존한다

`.github/actions/l10n-push/action.yml:102,108` · `docs/ACTIONS.md:61`

action 내부가 `pnpm/action-setup@v4`·`actions/setup-node@v4`(움직일 수 있는 태그)를 쓰고, 소비자
리포는 `SinhyeokKang/malmoi/.github/actions/l10n-push@main`을 참조한다. 소비자 워크플로는 그 job에
`secrets.PUSH_TOKEN`과 `GITHUB_TOKEN`을 넘긴다(`docs/ACTIONS.md:61-65`).

**공격**: 업스트림 태그가 재지정되거나(2025년 `tj-actions/changed-files` 패턴) **말모이 `main`에 커밋
하나가 들어가면** 모든 소비자 job에서 코드가 즉시 실행되고, 롤백 창도 소비자 측 리뷰도 없다. 얻는
것은 러너의 `ACTIONS_RUNTIME_TOKEN`, 그 job의 `GITHUB_TOKEN`, 그리고 `/api/push`의 유일한 인증자인
`PUSH_TOKEN`이다.

⚠️ **이 항목의 무게를 정하는 것은 브랜치 프로텍션 부재다** — Free + private에서 GitHub이 거부하고
(`gh api repos/…/branches/dev/protection` → 403 실측), `main` 직접 푸시를 막는 것은 `/merge` 관행뿐이다.
**CLAUDE.md가 이미 `@main`을 다루지만 결론이 "안전하다"인데, 그 논거는 *낡음*(action 변경이 dev에
있는 동안 소비자가 옛 버전을 쓴다)이고 *가변성*이 아니다.** 두 축이 다르다.

**대비**: action 자체의 셸 위생은 오히려 모범적이다 — `inputs.*` 일곱과
`github.event.head_commit.message`가 전부 `env:`를 지나 `"$VAR"`로 읽히고(`action.yml:74,76,135-137,156-165`),
`set -euo pipefail`이 켜져 있고, `PUSH_TOKEN`은 어디에도 echo되지 않는다. 주입 0건이다.

---

## 3. 🟡 권장

### 4. 멤버 화면의 이메일 마스킹이 렌더 시점 전용이라 원문이 RSC 페이로드에 실린다

`lib/auth/query.ts:64,102` · `app/(edit)/projects/[slug]/members/page.tsx:65,69-74` ·
`components/members/member-list.tsx:1,87` · `components/members/pending-invitations.tsx:1,84`

두 로더가 `email`을 원문으로 select하고, `members={members}`·`invitations={pending}`가 `"use client"`
컴포넌트 props로 넘어간다. 마스킹은 클라이언트 JSX 안에서 일어난다. DESIGN §6.65가 "두 표 모두
`maskEmail`이 기본 — 이 표는 EDITOR도 본다"를 단언하는데 **그 통제가 화장품이다.**

관측자는 그 프로젝트의 EDITOR 이상(`translation:write` 게이트)이고 view-source·RSC 청크로 읽는다.
**대기 초대 쪽이 더 민감하다** — 아직 멤버가 아닌 외부인의 주소다.

⚠️ **서버가 이미 `maskedInviteLabels`로 표시 라벨을 계산해 내려보낸다**(malmoi#18의 답,
`lib/auth/invite-label.ts`). 원문 동봉은 의도가 아니라 누락으로 읽히고, 붙잡아 두는 유일한 이유인
`labels[index] ?? invitation.email` 폴백은 두 배열 길이가 항상 같아 **도달 불가**다.

⚠️ **같은 리포에 방식이 갈려 있다** — `app/invite/[token]/page.tsx:64`는 서버 컴포넌트에서 마스킹한
문자열만 와이어에 올린다. 두 화면 중 하나가 낡은 것이 아니라 **규칙이 문서에만 있고 배선이 안
따라간** 부류다(POSTMORTEM 2026-09-05과 같은 축).

### 5. 인가보다 앞서 임의 owner/repo로 App 자격증명을 쓰고, 반환 갈래가 존재 오라클이 된다

`app/(edit)/projects/actions.ts:505-514,845-895` (`detectRepoFormats` → `checkRepoAccess`) ·
`lib/github-connect/connect-plan.ts:42-53`

`probeRepo(owner, repo)`가 `listUserInstallations`보다 **먼저** 돌고(`actions.ts:865`, try 밖인 것은
별개 이유로 옳다), `RepoInput`은 `z.string().min(1)` 둘뿐이다. 결과가 `repo-not-installed`(우리 App이
그 리포에 없다)와 `installation-forbidden`(있지만 너는 못 본다)으로 갈려 그대로 화면 문구가 된다.

**공격**: 로그인은 검증 이메일만 요구하므로(SAAS §5 — 의도된 성질이다) **낯선 사람이 임의 private
리포에 대해 "말모이 App이 설치돼 있는가"를 물을 수 있다.** 반복하면 private 리포 고객 목록이 열거된다.
부수로 호출당 App JWT 조회 1 + 설치 토큰 발급 1 + repo GET 1이 상한 없이 돌아 **전 테넌트가 공유하는
App quota**를 태운다 → 야간 pull이 전 프로젝트에서 죽는다.

**내용 유출은 없다** — 3중 검증이 fail-closed이고(`connect-plan.ts:44` 빈 목록을 통과로 읽지 않는다)
리포 내용을 돌려주지 않는다. 새는 것은 **사유 코드**다.

값싼 방향: 순서를 뒤집어 사용자 설치 목록을 먼저 읽고 그 목록에 없으면 probe를 부르지 않는다.
⚠️ 그러면 `lib/onboarding/message.ts`의 18갈래 중 몇이 도달 불가가 되므로 **거기까지 같은 커밋이다**
(POSTMORTEM 2026-09-08 "도달 불가한 오류 갈래를 겨냥한 테스트가 1년치 green이었다").

### 6. `timingSafeEqual` 앞의 길이 사전검사가 UTF-16 길이인데 버퍼는 UTF-8이라 던진다

`lib/push/auth.ts:18` · `lib/github-connect/state.ts:196-198`

**실행 확정**: `RangeError: Input buffers must have the same byte length`. 전달 경로도 확인했다 — 원시
바이트 `0xE9`를 `Authorization` 헤더에 넣으면 Node가 latin1로 U+00E9(1 UTF-16 유닛 / 2 UTF-8 바이트)로
파싱하고, 그 문자열이 Web `Request.headers`까지 그대로 살아 간다.

호출부가 둘 다 try 밖이다 — `app/api/pull/route.ts:37`(try는 48행에서 열린다) ·
`app/api/github/callback/route.ts:42`(감싸지 않는다).

**인증 우회는 아니다**(fail-closed는 유지된다). 실질은 **무료 500 생성기 + `CRON_SECRET` 길이
오라클**(500 vs 401로 갈린다 — 길이는 수백 번에 브루트포스된다)이고, state 쪽은 그 쿠키가 남아 있는
동안 GitHub 연결이 통째로 막힌다(사용자가 스스로 못 빠져나온다 — POSTMORTEM 2026-09-08 툴팁 사건과
같은 모양).

주석이 "길이가 다르면 timingSafeEqual이 던지므로 먼저 걸러낸다"고 **정확히 그 이유를 적어 놨는데**
재는 단위가 어긋났다. `state.ts:77`은 `lib/push/auth.ts`와 "같은 형"이라고 상호 참조하므로 **한쪽만
고치면 다른 쪽이 남는다.**

같은 파일의 nonce 비교(`state.ts:109`)는 `!==`인데 256비트 + 서명된 쿠키라 실전 위협이 아니다 —
`timingSafeEqual`이 같은 파일 1행에 이미 import돼 있다는 점에서만 결함이다.

### 7. 런타임 DB 접속 롤이 `postgres`다 (최소권한 아님)

**실측** (prod·dev 동일): `rolsuper=false`이지만 `rolbypassrls=true`, `rolcreaterole`·`rolcreatedb`,
그리고 `pg_read_all_data`·`anon`·`authenticated`·`service_role`·`supabase_privileged_role` 멤버.
`DATABASE_URL`·`DIRECT_URL`·`DIRECT_URL_PROD` 전부 사용자명이 `postgres.<ref>`(비밀번호 16자).

앱 침해나 SQL 주입 하나가 곧 전 테이블 DROP·전 데이터 읽기다. 더 중요하게 **나중에 RLS를 켜도 이 롤이
통째로 우회한다**(`rolbypassrls`) — 2026-09-09의 REVOKE 전략이 유일한 방어선인 채로 굳는다.

⚠️ **고치는 비용이 크다**: 새 롤 + `DATABASE_URL` 교체가 `.env.local` 두 머신 · Vercel Production ·
Preview 넷을 동시에 건드리고(CLAUDE.md의 "개인키 하나 지웠더니 네 곳이 끊겼다"와 같은 형), 마이그레이션은
계속 `postgres`여야 한다. **판정 항목이다** — `tasks.md`의 판정 절.

### 8. `pg_default_acl`에 `supabase_admin` 소유 항목이 남아 `anon`에 테이블 전 권한을 준다

**실측** (prod·dev 동일):

```
supabase_admin | r | postgres=arwdDxtm | anon=arwdDxtm | authenticated=arwdDxtm | service_role=arwdDxtm
postgres       | r | postgres=arwdDxtm | service_role=arwdDxtm          ← cfbe5ac가 고친 쪽
```

**테이블·컬럼 권한 현황은 양쪽 DB 모두 0건**이라 `cfbe5ac`의 REVOKE는 실제로 반영됐다. RLS는 12테이블
전부 off + 정책 0건이지만 GRANT가 없으니 지금은 성립한다(그 전략의 근거는 POSTMORTEM 2026-09-09).

남은 것은 **다음에 테이블을 만드는 롤이 누구인가**다. 마이그레이션은 `postgres`로 도니 Prisma가 만드는
테이블은 안 열린다 — **대시보드처럼 `supabase_admin`으로 만드는 경로만 재개방된다.**

⚠️ **`postgres`가 이것을 고칠 수 있는지 불확실하다.** `ALTER DEFAULT PRIVILEGES`는 **생성 롤별**이라
`FOR ROLE supabase_admin`이 필요하고, `postgres`는 superuser가 아니며 `supabase_admin`의 멤버도 아니다
(위 실측). 그러면 예방이 아니라 **탐지**로 가는 것이 정직하다 — `/db`가 마이그레이션 뒤 `anon` 권한
0을 확인하는 것이 이미 CLAUDE.md에 있다. `tasks.md`가 이 갈림을 판정으로 둔다.

### 9. 보안 응답 헤더가 하나도 없다

`next.config.ts:3` · `vercel.json:1` · `middleware.ts:33` — 세 파일 어디에도 `headers()`가 없다
(CSP · frame-ancestors/X-Frame-Options · Referrer-Policy · X-Content-Type-Options · HSTS 전부 부재).

**실질 위험은 통설보다 작다**: XSS 원시체가 0곳(§5)이고, 세션 쿠키가 `SameSite=Lax`라 iframe에서는
로그아웃 상태로 렌더돼 멤버 제거 Dialog 클릭재킹이 대부분 막힌다.

남는 실질은 둘:
- **CSP 부재** — 지금 XSS를 막는 층이 React 이스케이프 하나뿐이라, 향후 XSS 하나가 곧 전면 실행이 된다.
- **`Referrer-Policy` 부재 + `/invite/<token>`** — 그 화면에 외부 링크가 **하나 추가되는 순간** 초대
  토큰이 Referer로 나간다. 지금 외부 링크는 0개이고, **그것을 지키는 가드가 없다.**

`X-Content-Type-Options` 부재는 모든 응답이 JSON/HTML이라 영향이 미미하다.

### 10. `/api/push` 페이로드에 크기 상한이 하나도 없다

`lib/push/plan.ts:60-101` — `keys`·`translations`·`refs`·`locales` 어느 배열에도 `.max()`가 없고
`sourceText`·`value`·`key`·`pathTemplate` 어느 문자열에도 없다. `placeholders: z.unknown()`(:95)은
의도된 통과다(크롬 스펙을 따라다니지 않는다는 계약).

**인증 순서는 옳다** — 33-72행 인증 → 76행 `request.json()` → 81행 `safeParse`. App Router에
`bodyParser.sizeLimit` 등가물이 없어 상한은 플랫폼 요청 한도뿐이고(정확한 값 UNVERIFIED), 그 안에서
토큰 하나가 `maxDuration = 60`에 대고 무한정 행을 넣는다. `Translation` FK가 `RESTRICT`라 되돌리기 어렵다.

### 11. 무제한 클라이언트 문자열이 인접 `[^/]*` 양자로 컴파일된다 (파국적 백트래킹)

`lib/adapters/shared.ts:33-34` (`matchGlobPaths`)

`pathTemplate.replaceAll("*","[^/]*")` + `new RegExp("^"+escaped+"$")`. 인접한 `*` k개는 매칭 실패
경로에서 n글자를 k개로 분할해 지수 시간이 된다. 메타문자는 이스케이프되므로 **주입이 아니라 ReDoS**다.

두 경계 모두 상한이 없다 — `CreateProjectInput`(`app/(edit)/projects/actions.ts:309`) ·
`PushPayload.format`(`lib/push/plan.ts:32`). 그리고 `createProject`가 `planConfirmedFormat` 검증
**전에** 원값으로 `templatePaths`를 부른다(`actions.ts:605` vs `:607`). 같은 모양이
`lib/onboarding/confirm.ts:30`에도 있다(`{locale}` N개 → 인접 `([^/]+)` N-1개). 저장된 템플릿을 통해
cron 경로에서도 재현된다(`lib/pull/plan.ts:131`).

### 12. 리포 훑기가 심링크를 따라가고 순환 검출이 없다

`lib/cli/walk.ts:34-42` · `scripts/adapter-survey.ts:96-98`

`readdirSync` + `statSync(full).isDirectory()` — `lstat`도, `withFileTypes`도, `isSymbolicLink`도,
visited-inode 집합도 없다. `statSync`가 링크를 해소하므로 `locales/ko.ts -> ~/.aws/credentials`가 읽히고
(`scripts/ingest.ts:37`·`scripts/push-local.ts:87,92`), `push-local.ts:172-176`이 그 결과를 서버로 POST해
**리포 밖 문자열이 DB로 들어간다.** `ln -s . loop`는 경로 한도까지 재귀한다.

⚠️ **비대칭이다** — 서버측 훑기는 `entry.type === "blob"`으로 제외한다(`lib/github.ts:179,255`).
`adapter-survey.ts:96`의 주석은 "심링크는 없는 파일로 취급한다"고 말하지만 `catch`는 **오류일 때만**
돈다 — 해소되는 링크는 읽힌다.

운영자가 신뢰할 수 없는 리포에 CLI를 돌릴 때만 성립해서 🟡이다. `adapter-survey`의 코퍼스 109개는
**살아 있는 입력**(`docs/features/README.md`)이라 상시 노출면이다.

### 13. `ci.yml`에 `permissions:` 블록이 없고 세 액션이 가변 태그다

`.github/workflows/ci.yml:14-19,30-34`

**실측**: 리포 기본값이 `{"default_workflow_permissions":"read","can_approve_pull_request_reviews":false}`라
지금은 안전하다. 하지만 그것은 **리포 설정**이라 대시보드 한 번으로 `write`가 되고, `verify`는
`pnpm test`로 임의 프로젝트 코드를 돈다. 리포 레벨 가드도 없다(`allowed_actions: all`,
`sha_pinning_required: false` — 실측).

트리거는 깨끗하다 — `pull_request_target`·`workflow_run` 없음, 어떤 스텝에도 secret 미전달(리포
secret 자체가 0개 — 실측), `run:`에 `github.event.*` 보간 0건.

### 14. 상시 가드가 `requireUser`를 인가로 인정하고 파일 단위 면제를 든다

`app/__tests__/entry-points.test.ts:37,27-34,102,110-113`

`GUARDS = ["requireProjectAccess", "getProjectAccess", "requireUser"]`이고 export별 검사는 **본문에 그
이름 하나가 있는지만** 센다. `EXEMPT`에 `invite/actions.ts`가 **파일 단위**로 들어 있어 그 파일은
export 루프 전에 건너뛴다.

따라서 앞으로 **프로젝트 스코프 Server Action이 `requireUser()`만 불러도**, 또는 **`app/invite/actions.ts`에
export가 추가돼도** green이다. doc comment(:14-20)는 면제 다섯을 적었는데 Set은 여섯이라 그 항목엔
"왜 인가를 안 지나는가"가 쓰인 적이 없다.

면제 6개는 각자 안전한지 독립 확인했다(§5).

### 15. `disconnectGithub`이 행을 `(userId, provider)`로 읽고 PK로 지운다

`app/(edit)/projects/actions.ts:401-414`

`findFirst({ where: { userId, provider } })` → `delete({ where: { provider_providerAccountId: {…} } })`.
`delete`의 `where`에 `userId`가 없어 읽기~삭제 사이 그 `providerAccountId`의 소유자가 바뀌면 **남의
`github-app` 연결을 지운다.** 탈취가 아니라 삭제다 — `planAccountLink`의 `taken-by-other`가 행이 사는
동안 탈취를 막는다.

재현 창은 매우 좁다(A가 해제를 두 번 눌러 한쪽이 먼저 지우고, 그 사이 B가 같은 GitHub 계정을 연결).
POSTMORTEM 2026-09-06이 넓힌 규칙("사용자에 속한 행은 `userId`로 좁힌다")의 **유일한 위반 자리**이고,
`deleteMany({ where: { userId, provider } })` 한 줄이면 주석이 말하는 P2025 회피도 함께 사라진다.

---

## 4. ⚪ 사소

| # | 자리 | 무엇 |
|---|---|---|
| 16 | `prisma/schema.prisma` (`Account`·`Session`) | `access_token`·`refresh_token`·`id_token`·`sessionToken`이 평문 컬럼(Auth.js 어댑터 기본값). GRANT를 닫은 지금은 DB 자격증명이 있어야 닿는다 — prod `Account` 3행. **수용 판정 대상** |
| 17 | `lib/adapters/chrome-locales.ts:81,217` · `json-catalog.ts:256` | flat 대입 자리에서 `__proto__` 키가 setter를 호출해 **조용히 사라진다**(전역 오염 없음, 로컬 데이터 손실). `CHROME_KEY`(`/^[A-Za-z0-9_@]+$/`)가 `__proto__`를 통과시킨다. **1번과 같은 뿌리라 같은 ship이다** |
| 18 | `.gitignore:8-13` | `.env` 정확 일치 + `*.local`이라 `.env.production`·`.env.development`가 안 잡히고 `*.key`·`*.p12`·`*.pfx` 패턴이 없다(`git check-ignore` 실측). 지금 추적 중인 것도, 전 이력도 깨끗하다 |
| 19 | `app/(edit)/projects/actions.ts:67` | `createInvitation.email`이 `z.string().min(1)`뿐(형식·최대 길이 없음). 두 줄 아래 `name`엔 `.max(200)`이 있다 |
| 20 | `scripts/adapter-survey.ts:88` | 신뢰할 수 없는 리포의 경로가 `git sparse-checkout set --no-cone` argv로 **`--` 없이** 들어간다. RCE 도달 경로는 못 찾았다(셸 없음, 그 서브커맨드에 실행 옵션 없음) — `"--"` 한 줄. `--limit` 기본값이 `undefined`라 `.slice(0, undefined)`로 전량이 되는 것도 같은 자리(:49,:58) |
| 21 | `pnpm-workspace.yaml:14-19` | `onlyBuiltDependencies`의 `@prisma/client`·`sharp`는 install 스크립트가 없다(`.pnpm` 375개 전수 확인 — 스크립트를 가진 것은 `prisma`·`@prisma/engines`·`esbuild` 셋이고 전부 정당하다). 지금 아무것도 안 주지만 업스트림이 스크립트를 추가하면 **자동 승인**된다 |
| 22 | `.env.local` (이름만 확인) | 소비자 0인 변수 둘 — `ACTIVE_PROJECT_SLUG`(문서가 제거를 선언했고 `scripts/__tests__/required-args.test.ts`가 소비자 0을 고정한다) · `VERCEL_OIDC_TOKEN`(`vercel env pull`이 쓴 흔적이고 CLAUDE.md의 "손으로 관리 / pull로는 못 가져온다"와 어긋난다). 1행 주석이 아직 **prod ref**를 가리켜 로컬을 프로덕션에 붙이도록 설득할 수 있는 부류다 |
| 23 | `app/(edit)/layout.tsx:55` · `lib/keys/query.ts:185-191` | 사이드바 prop 타입은 `NavProject`(slug·name·role 셋)인데 실제 값 `MembershipRow`는 다섯 필드다 — 신선한 리터럴이 아니라 초과 프로퍼티 검사가 안 걸린다. `(edit)` 아래 **모든** 페이지 페이로드에 `installationId`·`lastCommitSha`가 실린다. 비밀은 아니지만 `lib/shell/nav.ts:13`이 좁힌 계약이 무의미해진다 |
| 24 | `auth.ts:95` | `console.error("[auth]", error)`가 오류 객체 전체(`cause` 포함)를 찍는다. `lib/github-connect/log.ts:16`이 `error.message`만 쓰는 것과 대비된다. 응답 본문엔 안 가고 Vercel 로그만이다. Prisma 검증 오류가 `where` 인자를 품는지는 UNVERIFIED |
| 25 | `lib/github-connect/origin.ts:22-36` | `Host`/`x-forwarded-proto`를 **모양만** 검사하고(`^[a-z0-9.-]+(:\d+)?$` — `evil.com`도 통과) 기대 호스트 허용 목록이 없다. 그 한 판정이 `redirect_uri`·state 쿠키 이름·`secure` 플래그 셋을 정한다. **인가 코드 탈취는 성립하지 않는다**(GitHub이 등록된 callback과 대조 — 18-20행 주석이 근거를 정확히 적어놨다). 쿠키 다운그레이드·오픈 리다이렉트는 Vercel의 헤더 정규화에 달려 **UNVERIFIED** |
| 26 | `app/api/pull/route.ts:51-55` · `lib/pull/targets.ts:19-26` | cron이 `take`·페이지네이션 없이 전 프로젝트를 직렬 순회한다. 프로젝트가 늘면 slug 정렬 뒤쪽이 `maxDuration=60`에 잘리는데 요약(`route.ts:75`)에 "미처리"가 없어 **조용하다** |
| 27 | `pnpm audit` (실측) | 0 critical / 2 high / 1 moderate — 셋 다 **devDependency `prisma`의 전이 의존**(`mysql2` 둘, `deepmerge-ts` 하나)이고 런타임 도달 경로가 없다(Postgres 어댑터). 수정 버전이 prisma 7.x에 없다(7.10.0이 최신 stable, 다음이 `8.0.0-rc.13`). 직접 의존 17개는 advisory DB 개별 조회로 전부 `none`. **지금 조치 불가 — 수용** |
| 28 | `package.json:33` | `next-auth 5.0.0-beta.32`가 프로덕션 세션을 발급한다(최신 beta이고 advisory 없음 — CLAUDE.md가 이미 인정한 리스크). `@auth/core@0.41.3` 단일 인스턴스는 실측으로 성립하지만(`next-auth`·`@auth/prisma-adapter` 둘 다 exact, 락파일 항목 1개) **`pnpm.overrides`가 없어 강제되지 않는다** — 업스트림이 범위로 완화하면 인스턴스가 둘로 갈리고 세션 복호가 조용히 쪼개진다 |

---

## 5. 검증하고 깨끗했던 것 (다음 감사가 다시 파지 않도록)

**이 절이 이 문서의 절반이다.** "안 봤다"와 "봐서 깨끗했다"를 구별해 두지 않으면 다음 감사가 같은
비용을 다시 쓴다.

- **테넌트 격리**: 비테스트 소스의 Prisma 호출 **76곳 전수**에서 테넌트 술어 누락 **0건**. `/api/push`는
  토큰이 프로젝트를 정하고 페이로드 slug는 **대조에만** 쓰인다(조회 키가 아니다 — `lib/push/guard.ts:19-23`).
  `applyPush` 11개 문장 전부 `projectId`를 들고, 스키마가 복합 FK(`[projectId, keyId]`·`[projectId, localeCode]` —
  `schema.prisma:234-235`)로 **DB 층에서** 걸친 행을 물리적으로 막는다. cron의 무조건 `findMany` 하나가
  유일한 비스코프 조회이고 설계다(각 순회가 `project.id`로 재좁힘).
- **SQL 주입 0건**: `$queryRawUnsafe`·`$executeRawUnsafe`·`Prisma.raw`·`Prisma.sql` **0곳**. `unnest`
  5자리 전부 컬럼 수 = 값 배열 수 일치(문서가 경고한 함정이 깨끗하다). 식별자는 전부 소스 리터럴이다.
- **동적 코드 0건**: `eval`·`new Function`·`vm.*` 0곳. `child_process`는 전부 `execFileSync` 배열
  argv(`shell: true` 없음). `ts-morph`는 파싱만 한다(`noLib`·`useInMemoryFileSystem`·`skipFileDependencyResolution`).
- **XSS 원시체 0건**: `dangerouslySetInnerHTML`·`innerHTML`·`srcdoc`·`javascript:` 0곳, `text/html`
  응답 라우트 0곳(`NextResponse.json`만). 신뢰할 수 없는 리포 콘텐츠(번역값·키·네임스페이스·어댑터
  `detail`·파일 경로)가 닿는 자리 **전부 JSX 자식**이다. 속성 URL 넷은 출처가 안전하다
  (`buildPermalink`는 접두 고정 + `encodeURIComponent`, `lastPrUrl`은 GitHub `html_url`, `installUrl`은
  서버 env). `components/ui/avatar.tsx:25`가 임의 `src`를 받을 수 있는 유일한 자리인데 **호출부 둘이
  `src`를 넘기지 않는다**.
- **어댑터 write 이스케이프**: `quoteLiteral`(`quote-style.ts:25-30`)이 역슬래시·인용 부호 적대 입력에
  대해 왕복하고, 수술적 writer 둘이 모든 값에 적용한다(`ts-dict.ts:235`·`code-dict.ts:345,438`).
  이스케이프하지 않는 `setLiteralValue`는 트리에 없다. YAML writer도 탈출 불가 —
  `doc.toString()`이 `plainString` 재검사 후 `quotedString`/`blockString`으로 떨어지고 제어문자·미짝
  서로게이트에 큰따옴표를 강제한다. **값이 새 키가 되는 경로 없음.**
- **로그인 게이트 fail-closed**: 판정이 `signIn`이 아니라 **저장되는 값을 만드는 자리**(`auth.ts:20-51`)에
  있고, `verifiedEmailFrom`(`lib/auth/email.ts:51-73`)이 모르는 모양·빈 값·미검증·primary 미검증을
  전부 `null`로 접는다. GitHub 이메일 조회의 **HTTP 실패는 던진다**(`lib/auth/profile.ts:58`) — 장애가
  "미검증"으로 접히던 옛 결함이 닫혀 있다. `allowDangerousEmailAccountLinking` 0곳(테스트가 부재를
  상시 검사). `handleAuthorized`가 `handleLoginOrRegister`보다 먼저 돌아 거부된 시도가 고아 행을 남기지 않는다.
- **토큰 설계**: push·초대·state nonce 전부 `randomBytes(32).toString("base64url")` = **256비트**,
  `Math.random` 0곳. 원문 저장 컬럼 없음(`prisma/__tests__/push-token-column.test.ts`가 실제로
  `not.toMatch(/pushToken\s+String/)`로 **부재를** 단언한다). 조회가 unique 해시 컬럼이라 JS 비교가
  아예 없다. 초대 단일 사용이 조건부 `updateMany` count로 원자적이고 **만료가 소비 조건에 들어 있다**.
  발급이 `Project` 행 `FOR UPDATE` 안에서 회전+생성을 한 트랜잭션으로 묶어 유효 링크가 둘 남지 않는다.
- **시크릿 누출**: `classifyFailure`(`lib/failure.ts:69-75`)가 `error.name` 허용 목록이라 남의
  라이브러리 오류는 `ref`만 나간다. `fail()` 호출 23곳에 `String(err)`·`error.message` 보간 **0건**.
  `publicSession`(`lib/auth/public-session.ts:19-29`)이 허용 목록으로 객체를 **새로 만들어**
  `sessionToken`이 `/api/auth/session`에 실릴 경로가 없다. 리포·전 이력에 실 시크릿 0건
  (`.b3-edit.ts`·`.b3-lib.ts` 두 스크래치 파일까지 확인). PEM은 로그·오류·응답 어디에도 안 가고
  `createApp()`이 try 밖이라 env 누락이 값으로 접히지 않는다(`lib/github.ts:67-68`).
- **state·callback 순서**: HMAC 검증이 code 교환·DB 쓰기보다 앞이고,
  `app/api/__tests__/github-callback.test.ts`가 네 갈래(쿠키 부재·서명 변조·nonce 불일치·wrong-user)
  마다 `exchangeCode`·`account.create` 미호출을 **함께** 단언한다 — "정말 증명하는가"의 답은 예다.
  `dest`가 서명 대상 안이라 오픈 리다이렉트가 원리적으로 성립하지 않고, 착지 경로는 `landing()`이
  리터럴로 만든다. `signIn(provider, { redirectTo })`도 `@auth/core`가 `baseUrl`을 붙여 동일 출처로 고정한다.
- **세 GitHub 자격증명 분리**: 사용자 토큰 경로에 쓰기 0건, 커밋 경로가 신원을 판정하는 자리 0건,
  `octokit`/`App` `baseUrl`을 입력으로 정하는 자리 0건, **클라이언트가 보낸 `installation_id`를 쓰는
  자리 0건**(항상 서버가 probe로 얻는다). `probeRepo`의 2단 호출에 TOCTOU 없음 — 신원 판정은 제출
  시점에 다시 부르는 `listUserInstallations`가 한다.
- **계층 인가**: 전 페이지에서 `requireProjectAccess`/`requireUser`가 조회보다 **앞**이고
  `(edit)/layout.tsx:28-30`은 조건부 렌더가 아니라 `redirect()`를 **던진다**. Server Action **14개
  전부** 권한(멤버십이 아니라 permission)을 확인한다 — 표는 §5.1. EDITOR가 OWNER 능력에 도달하는
  경로 없음, `planMemberChange`가 강등과 제거를 같은 판정으로 봐 "강등으로 우회"가 닫혀 있고, 마지막
  OWNER 보호는 **`SELECT … FOR UPDATE`가 든다**(재검사만으로는 부족했다 — 아래 ⚠️).
- **존재 노출**: `planProjectAccess`가 "slug 없음"과 "멤버 아님"을 같은 `not-found`로 접고
  `requireProjectAccess`가 둘을 같은 목적지로 보낸다. `/api/push`는 모르는 토큰에 404가 아니라 401.
  `revokeInvitation`이 타 테넌트와 이미 수락을 같은 `not-found`로 접는다. 새는 것은 4번(RSC 페이로드)과
  5번(probe 사유 코드)뿐이다.
- **cron 교차 테넌트 쓰기**: 브랜치·리포 좌표·파일 내용·쓰기 대상이 전부 같은 `Project` 행에서 나오고
  `slug @unique` + `isRefSafeSlug`(`..`·후행 `.`·`.lock` 거부)가 브랜치 세그먼트 탈출을 막는다. 같은
  리포의 두 Project는 `l10n/sync-<slug>`로 갈려 서로를 덮지 못한다.
- **클라이언트 번들**: `components/__tests__/client-graph.test.ts`가 값 import 그래프를 따라가 무거운·
  서버 전용 모듈을 막는다(놓치는 것은 동적 `import()`, `SKIP_DIR`의 `ui`, `index.tsx` 후보 셋 — 전부
  현재 0건).
- **공급망**: 락파일 커밋 + `--frozen-lockfile`(CI와 composite action 둘 다), 비레지스트리 출처
  **0건**(`git+`·`github:`·`.tgz`·`file:`·`link:` 검색), `overrides`/`patchedDependencies` 0건,
  `.npmrc`에 토큰·레지스트리 override 없음(`enable-pre-post-scripts`는 **이 프로젝트 자기 스크립트**만
  되살리고 의존성 lifecycle은 여전히 `onlyBuiltDependencies`가 막는다), 팬텀·미사용 의존 **0건**
  (`next-intl`·`@rc-component/pagination`은 테스트 픽스처 문자열이다), 런타임 외부 CDN **0건**(폰트
  자사 호스트 확인). 리포 private, Actions 기본 토큰 `read`, 리포 secret 0개.
- **컴파일러·빌드 게이트**: `typescript.ignoreBuildErrors: false`(명시), `eslint.ignoreDuringBuilds`
  없음, `images.remotePatterns`·`experimental.*`·`serverActions.allowedOrigins` 없음(Next 기본 동일
  출처 검사가 그대로 적용된다), `strict: true` + `noUncheckedIndexedAccess: true` 유지.

### 5.1 Server Action 14개 인가 표

| Action | 게이트 | permission |
|---|---|---|
| `saveTranslation` | `getProjectAccess` | `translation:write` (+ key·locale을 반환 `projectId`로 재좁힘) |
| `triggerPullAction` | `getProjectAccess` | `translation:write` (SAAS §3 의도) |
| `createInvitation` · `changeMember` · `revokeInvitation` | `getProjectAccess` | `member:manage` |
| `startGithubConnect` · `connectRepository` | `getProjectAccess` | `project:settings` |
| `runFirstIngest` · `rotatePushToken` | `getProjectAccess` | `project:settings` |
| `disconnectGithub` · `listConnectableRepos` · `detectRepoFormats` · `createProject` | `requireUser` | — (사용자 소유 행 / 생성 경로엔 인가할 프로젝트가 없다) |
| `acceptInvitation` | `readSession` + tokenHash | 인가 예외 (토큰이 대신한다) |

⚠️ **`runFirstIngest`·`rotatePushToken`은 `requireUser`-only 다섯에 들어가지 않는다** — 감사 중 한 번
그렇게 오분류했다. 둘은 `project:settings`이고, EDITOR가 직접 부르면 `forbidden`이다.

⚠️ **마지막 OWNER 보호에서 실제로 일하는 것은 재검사가 아니라 행 잠금이다.** READ COMMITTED에서
`actions.ts:270`의 사후 재계수는 상대 트랜잭션의 미커밋 삭제를 볼 수 없어, 두 OWNER가 서로를 제거하면
둘 다 1을 세고 둘 다 커밋한다. 막는 것은 `:246`의 `SELECT … FOR UPDATE`다. ⚠️ **`lib/push/apply.ts:11-13`의
주석이 "pooler에서 대화형 트랜잭션을 못 쓴다"고 아직 단언하는데 `docs/ARCHITECTURE.md:613`이
2026-09-06에 그것을 철회했다** — 그 주석을 믿고 잠금을 지우는 사람이 SAAS §5.6을 되열게 된다.

---

## 6. 확인하지 않은 축

- **Vercel 프로젝트 설정** — CLI 미설치(`vercel` 없음). env 스코프(Production/Preview/Development),
  Deployment Protection 상태, Node.js Version 필드, 빌드 명령 override, `DIRECT_URL_PROD`가 비로컬
  스코프로 새지 않았는지 전부 미확인. `vercel.json`만 읽었다.
- **GitHub App 설치 권한 스코프** — App JWT 서명에 개인키를 읽어야 해서 건너뜀(감사 자기 규칙:
  `.pem`을 읽지 않는다). 설치 리포 목록·permission 셋·옛 개인키 유효 여부 미확인.
- **`.env.local`·`.pem`의 값** — 이름만 봤다. 시크릿 강도·중복·기유출 여부·로컬↔프로덕션
  `AUTH_SECRET` 상이 여부 판정 불가.
- **대상 리포 4개**(`bugshot-2`·`bugshot-i18n-test`·`i18n-format-check`·`i18n-order-check`)의 워크플로가
  실제로 어떤 secret을 composite action에 넘기는지, 그중 public이 있는지. **public이면
  `scripts/push-local.ts:179`의 응답 echo가 공개로 읽힌다** — `lib/failure.ts`가 존재하는 이유가 그것이다.
- **테스트·빌드 실행** — §0.
- **전이 의존성 코드 리뷰** — advisory DB와 락파일 `integrity`를 신뢰했다. npm provenance 검증은 설정
  자체가 없다. 보고되지 않은 침해 버전은 이 감사가 못 잡는다.
- **삭제된 내용의 시크릿** — 파일명과 현재 트리, 그리고 `.b3-*` 블롭만 훑었다. 무해해 보이는 파일에
  붙였다 지운 시크릿은 안 봤다(`git log --all -p` 전수는 돌리지 않았다).
- **동시성·런타임 거동** — 세션 만료, 초대 경합, `probeRepo` TOCTOU는 정적으로만 봤다.

---

## 7. ship 매핑

실행 계획은 **`tasks.md`**다. 묶음의 근거만 여기 남긴다 — **게이트가 ship 경계를 정했다**:

| ship | 발견 | 묶은 이유 |
|---|---|---|
| 1 | **1** · 17 · 11 | 셋 다 `lib/adapters/**`다 → **ADAPTER-COVERAGE 재측정 트리거가 한 번으로 끝난다**(학습+홀드아웃 둘, `/push` 4d). 나누면 4분 네트워크를 두 번 쓰고 회차가 둘로 늘어난다 |
| 2 | **2** · 10 | 둘 다 `lib/push/plan.ts`의 Zod 경계 + `lib/pull/plan.ts`다. ⚠️ **판정을 `lib/adapters/shared.ts`에 두면 이 ship도 재측정 트리거가 된다** — 잎 모듈로 내리는 것이 그 이유다 |
| 3 | **3** · 13 · 12 · 20 · 21 · 18 | "리포 밖에서 오는 것" — 남의 액션·남의 리포. 런타임 코드 0줄이라 게이트가 typecheck+test뿐이고, ⚠️ **3번만 소비자 리포 넷을 건드리는 판정을 낀다** |
| 4 | **4** · 15 · 14 · 19 · 23 | app/auth 층 + "페이로드에 필요한 것만 내려보낸다". 마이그레이션 없음, DESIGN §6.65 갱신이 같은 ship |
| 5 | **6** · 5 · 25 · 24 | 외부 진입점 견고화. ⚠️ 5번이 `lib/onboarding/message.ts` 18갈래를 흔들어 이 ship에서 가장 무겁다. 25번은 **고치기 전에 측정**이다 |
| 6 | **9** · 26 | 헤더와 경계 bounds. `next.config.ts`를 건드리므로 `pnpm build`가 실질 게이트다 |
| DB | **8** · 7 · 16 | 코드 0줄, 배포 경로와 무관해 **병렬 트랙**이다. 7·8·16 셋 다 판정이 앞에 있다 |
