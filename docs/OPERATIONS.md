# OPERATIONS — 운영 절차

## 다중 표면 배포 1 — additive migration과 writer 전환

⚠️ **dev 반영 완료(2026-09-14). prod 반영을 `pnpm db:status:prod`로 확인한 뒤 이 절을 걷어낸다.**
걷어낼 때 3단계의 `backfill-surfaces.sql` 사용법은 §3 복구로 옮길 후보다 — 백업 복원·새 DB에서 다시 밟는다.

Add surface는 2026-09-14에 열렸다(`app/(edit)/projects/[slug]/surfaces/new`, `lib/surfaces/create.ts`).
옛 Locale PK·StringKey unique와 nullable `surfaceId`도 같은 날 `20260914070000_finalize_translation_surfaces`로 교체됐다.
dev는 `/push` 전, prod는 별도 `/merge` 1단계에서 해당 DB 마이그레이션을 적용한다. prod를 dev 푸시 때 미리 바꾸지 않는다.

1. 대상 환경의 CI push·첫 적재·편집 등 옛 writer를 중지하고 진행 중 요청이 끝난 것을 확인한다.
2. `20260914042000_add_translation_surfaces`를 적용한다. 기존 Project마다 `default` 표면과 자식 FK가 생긴다.
3. 마이그레이션과 코드 전환 사이에 옛 writer가 실행됐다면, **새 writer를 활성화하기 전에**
   `prisma/maintenance/backfill-surfaces.sql`을 같은 DB에서 실행한다. 이 파일은 테이블을 잠그고 옛 Project의
   포맷·적재 상태 및 null 자식을 재백필한다. 새 Surface 상태가 Project보다 앞섰거나 기본 외 표면이 있으면 중단한다.
   새 코드 활성화 뒤에는 실행하지 않는다 — dual-write가 아니므로 Project의 옛 값이 더 이상 정본이 아니다.
4. 아래 SQL 결과가 모두 0인지, 마이그레이션 drift가 없는지 확인한 뒤 새 코드와 새 payload 생산자를 활성화한다.
5. 기존 URL redirect, 편집, 프로젝트 단위 Publish를 dev에서 검토한다. T17의 파괴적 제약 교체는 별도 배포다.

```sql
SELECT 'Locale' AS model, count(*) FROM "Locale" WHERE "surfaceId" IS NULL
UNION ALL SELECT 'StringKey', count(*) FROM "StringKey" WHERE "surfaceId" IS NULL
UNION ALL SELECT 'Translation', count(*) FROM "Translation" WHERE "surfaceId" IS NULL
UNION ALL SELECT 'Project', count(*) FROM "Project" WHERE "defaultSurfaceId" IS NULL;
SELECT count(*) FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND table_name = 'TranslationSurface'
  AND grantee IN ('anon', 'authenticated');
```

## 다중 표면 배포 2 — 제약과 writer 동시 전환

⚠️ **dev 반영 완료(2026-09-14). prod 반영을 `pnpm db:status:prod`로 확인한 뒤 이 절을 걷어낸다.**
걷어낼 때 3단계의 precondition 실패 복구는 §3 복구로 옮길 후보다.

1. 배포 1의 commit·CI·Vercel 성공 SHA와 dev/prod 마이그레이션 상태를 각각 확인한다.
   Surface writer가 활성화된 DB에서 옛 Project 값을 복사하는 재백필은 실행하지 않는다.
2. 대상 환경의 push·첫 적재·추가·편집 요청을 멈추고 진행 중 요청을 drain한다. 단계 A writer의
   Locale `ON CONFLICT (projectId, code)`는 단계 B에서 유효하지 않다. **B SQL만 적용하고 A 서버를 재개하지 않는다.**
3. `20260914070000_finalize_translation_surfaces`와 대응 writer를 함께 전환한다.
   dev는 `/push` 직전, prod는 Claude Code `/merge` 1단계다. Codex는 커밋까지 수행한다.
   precondition 실패 시 SQL을 우회하거나 TRUNCATE하지 말고 누락된 surface/default 소유권을 조사한다.
4. `pnpm db:status` / `pnpm db:status:prod`, drift, 아래 정합성 SQL과 공개 권한을 확인한다.
   새 코드 배포 성공 SHA 확인 뒤 요청을 재개한다. Add surface·동일 key/locale 공존·교차 FK 거부는
   `pnpm test:projects:postgres`(§4)로 격리 PostgreSQL에서도 검사한다.
   빈 DB의 0건 결과만으로 migration 방어가 검증됐다고 쓰지 않는다.
5. 기존 URL·첫 온보딩·Add surface·두 표면의 단일 Publish 왕복을 검증한다.
   dev의 `bugshot-i18n-test-qa`는 상주 프로젝트이므로 삭제·TRUNCATE하지 않는다.

```sql
SELECT 'key' AS model, count(*) FROM "Translation" t
LEFT JOIN "StringKey" k ON k.id=t."keyId" AND k."projectId"=t."projectId" AND k."surfaceId"=t."surfaceId"
WHERE k.id IS NULL
UNION ALL SELECT 'locale', count(*) FROM "Translation" t
LEFT JOIN "Locale" l ON l."projectId"=t."projectId" AND l."surfaceId"=t."surfaceId" AND l.code=t."localeCode"
WHERE l.code IS NULL;
SELECT count(*) FROM "Project" p LEFT JOIN "TranslationSurface" s
ON s.id=p."defaultSurfaceId" AND s."projectId"=p.id AND s."archivedAt" IS NULL WHERE s.id IS NULL;
SELECT count(*) FROM information_schema.role_column_grants
WHERE table_schema='public' AND table_name IN ('Project','TranslationSurface','Locale','StringKey','Translation','KeyRef')
AND grantee IN ('anon','authenticated');
```

null 자식·잘못된 부모/default·공개 권한은 모두 0이어야 한다. 활성 표면의 출력 경로는
`loadPullState` → `planMultiSurfacePull`에 같은 base snapshot 경로를 넘겨 `surfaceOwnership` 충돌 0건을
확인한다. per-locale은 저장 Locale의 생성 예정 경로도 포함한다. prefix 비교만으로 대신하지 않는다.

### Action 릴리스와 대상 workflow

현재 외부 계약은 `.github/actions/malmoi-i18n-push` · `malmoi-i18n-push-v1` · `MALMOI_I18N_*` ·
`.github/workflows/malmoi-i18n.yml` · `malmoi-i18n/sync-<slug>` · `[skip-malmoi-i18n]`이다.
기존 `l10n-push-v1` 구현은 surfaceSlug를 생산하지 않았고 삭제됐다. 현재 새 태그의 코드(8511d37)는
`surface` 기본값 default와 `path-template`을 생산자에게 전달한다. **새로 만든 첫 표면도 slug가 default라는
가정은 금지**다. 등록된 실제 slug와 path-template을 생성 YAML에서 그대로 가져온다.

서버 필수 계약과 릴리스 순서는 서버 writer 배포 → action 태그의 실제 payload 생산 코드 확인/필요 시 릴리스 →
대상 리포별 새 YAML 전환 → smoke/왕복이다. 호환되지 않는 기존 workflow는 전환 동안 중지한다.
새 태그가 이미 필드를 생산하면 T17이라는 이유만으로 태그를 다시 옮기지 않는다. 다만 Project 생성 ID 수정처럼
새 서버 코드가 필요한 변경은 서버 배포를 완료한 뒤 재검증한다.

dev 검증은 현재 체크아웃 CLI의 `--project <slug> --surface <등록 slug> --path-template '<등록 경로>'`를
명시한다. 토큰은 로그·화면 캡처에 남기지 않는다.

**나중에 다시 실행할 절차만 둔다.** 일회성 전환 기록은 `git log`가 든다. 불변식은
[ARCHITECTURE.md](./ARCHITECTURE.md), 무엇을 만드는지는 [PRODUCT.md](./PRODUCT.md)다.

## 미전달 편집 보호 배포 — A(호환) → backfill → B(보호)

⚠️ **dev 반영 완료(2026-09-17). prod 반영을 `pnpm db:status:prod`로 확인한 뒤 이 절을 걷어낸다.**
걷어낼 때 backfill 단계의 스크립트 사용법과 4의 precondition 실패 복구는 §3 복구로 옮길 후보다.

sync-edit-protection. **운영 차단·drain이 없다** — A가 저장마다 편집 토큰을 쓰므로(dual-write) A 롤아웃이 끝나면 "토큰 없이 저장되는 창"은 스스로 닫힌다.

1. **A**: `/push`(dev) → dev backfill → `/merge`(1단계 `pnpm db:status:prod` → `pnpm db:deploy`로 `add_translation_pending_edit_token`) → 프로덕션 alias 전환 + 60초(가장 긴 `maxDuration`) 경과.
2. **backfill** — 대상 DB마다 0행이 **두 번 연속** 나올 때까지(스크립트가 반복한다):
   ```
   pnpm exec tsx scripts/backfill-pending-edit-token.ts                       # dev (.env.local의 DATABASE_URL)
   DATABASE_URL='<prod 접속 문자열>' pnpm exec tsx scripts/backfill-pending-edit-token.ts   # prod — 값은 사람이 붙인다
   ```
   ⚠️ `.env.local`을 편집해 prod를 겨누지 않는다. `DIRECT_URL_PROD`(5432)도 쓸 수 있다 — 한 문장 UPDATE라 세션 모드면 된다.
3. **B**: `/push`(dev — precondition `pending_edit_token_precondition`이 dev에서 통과해야 한다) → `/merge`(prod `db:deploy`가 precondition 게이트).
4. **precondition이 실패하면** (`precondition failed: unsent edits without pendingEditToken remain`): 편집을 버리거나 토큰을 손으로 채워 통과시키지 않는다.
   ```
   PRISMA_TARGET=prod pnpm exec prisma migrate resolve --rolled-back 20260917170000_pending_edit_token_precondition   # dev는 PRISMA_TARGET 없이
   # backfill 단계를 그 DB에 다시 돌린다
   pnpm db:deploy
   ```
   §3의 규칙 그대로다 — `_prisma_migrations`가 전부 롤백된 것을 확인한 경우에만, 체크섬 수정·무조건 applied·reset 금지. `migrate dev`가 리셋을 제안하면 거부한다.
5. B 뒤 미전달 카운트가 **한 번 줄어들 수 있다** — orphan 키·로케일의 편집이 집계에서 빠지기 때문이다(값은 DB에 남는다). "번역이 사라졌다"는 제보면 먼저 `orphaned`를 본다.

## 1. 암호화 키 셋 — 섞지 않는다

**저장된 것은 전부 봉투·해시이고 원문은 쿠키와 프로세스 메모리에만 있다.** 키가 셋인 이유는 용도가
셋이기 때문이고, `validateCredentialKeys`가 **키 값 셋이 서로 다른지** 검사한다(⚠️ `*_KEY_ID` 셋은
**서로 비교하지 않는다** — keyring 안의 이름이라 전부 `k1`이어도 통과한다. 단 active kid가 그 keyring에
없으면 던진다. 그리고 전환 CLI에서만 돈다).

| 무엇 | 환경변수 | 무엇을 여나 |
|---|---|---|
| 토큰 | `TOKEN_ENCRYPTION_KEYS`·`_ACTIVE_KEY_ID` | GitHub App **연결 토큰**(access·refresh) |
| 개인정보 | `PII_ENCRYPTION_KEYS`·`_ACTIVE_KEY_ID` | `User.email`·`name`·`image` · 초대 email |
| 검색 | `EMAIL_LOOKUP_KEY`·`_KEY_ID` | 정확 일치 조회용 HMAC (**복호화가 아니다** — 되돌릴 수 없다) |

- **세션은 키가 없다** — `sha256:v1:` digest는 도메인 분리 해시라 대조만 한다.
- ⚠️ **형식이 갈린다**: `*_ENCRYPTION_KEYS`는 keyring JSON, `EMAIL_LOOKUP_KEY`는 **원시 base64 하나**.
  섞으면 base64 디코드가 조용히 깨진다.
- ⚠️ **dev와 prod가 다른 키다** — dev 키가 새도 프로덕션 회원 데이터가 안 열려야 한다. 도구는
  *어느 DB*만 검사하고 **키는 target에 안 묶여 있으므로**, prod 명령은 `.env.prod.local`을 셸로
  source해 덮는다(`set -a; . ./.env.prod.local; set +a;`). 그 파일에 넣을 수 없는 이유는 이름이 같아
  한 파일에 두 벌이 안 들어가고 dotenv가 셸 env를 override하지 않아서다.
- ⚠️ **PII 키를 잃으면 회원 이메일·이름을 복구할 수 없다** — DB 백업을 되살려도 그 시점의 키가 있어야
  열린다. **키와 백업을 쌍으로** 보관하고 회전할 때 옛 키를 지우지 않는다.
- **프로필 이미지 업로드 배포 시**: `User.image`도 PII 봉투 대상이다(`lib/credentials/records.ts`).
  PII 키를 잃으면 사진 URL을 복구할 수 없고 Vercel Blob 파일은 고아로 남는다. 교체 후 이전 파일
  삭제 실패도 고아를 남긴다. `pnpm smoke:blob`은 테스트 파일의 저장·다운로드·삭제·404를 확인하고
  Blob 목록과 복호화된 `User.image`의 차집합을 **삭제 없이 후보로만** 출력한다. 복호 불가 행이나
  동시 업로드가 있으면 오탐할 수 있으므로 후보를 자동 삭제하지 않는다.
  로컬에는 `BLOB_READ_WRITE_TOKEN`이 필요하며 환경별로 별도 공개 저장소를 쓴다.

## 2. 키 회전

**각 회전에도 전체 차단·drain이 필요하다.** 새 키를 keyring에 추가하고 **기존 키를 보존한 채** 도구
환경의 active kid를 새 키로 설정한다. 기본은 check-only이고 `--apply`는 `--traffic-blocked
--writers-drained`를 함께 요구한다(운영자 확인 표식이지 차단 기능이 아니다).

```sh
pnpm credentials:dev --mode=rotate-token --apply --traffic-blocked --writers-drained
pnpm credentials:dev --mode=rotate-pii   --apply --traffic-blocked --writers-drained
pnpm credentials:dev --mode=verify
```

- **토큰과 PII 회전은 별개다.** `expires_at`과 `emailLookup`을 바꾸지 않는다.
- 새 active kid를 앱에 반영하기 **전에** 전건 복호화와 `verify` 보고의 `oldTokenKey`·`oldPiiKey`가
  각각 0인지 확인한다.
- ⚠️ **active kid 환경변수가 비어 있으면 도구가 멈춘다** (2026-09-14). 전에는 `process.env`를 직접 읽어
  `undefined`와 비교했고, 그러면 **모든 행이 "옛 키"로 읽혀 전건이 재암호화**됐다. 지금은
  `requireEnv`라 던지는데, `convertCredentials` 안에서는 그것이 `CredentialError` 한 줄로 접혀 나오므로
  **원인이 메시지에 안 나온다** — 그 한 줄을 보면 먼저 `*_ENCRYPTION_ACTIVE_KEY_ID` 둘을 확인한다.
- **운영 DB뿐 아니라 보존된 백업이 요구하는 키도 폐기하면 안 된다.**
- prod는 명령 이름만 `credentials:prod`로 바꾼다. ⚠️ **그 명령은 prod DB를 직접 겨눈다**(`db:deploy`와
  같은 부류). 도구는 dev/prod 각각 고정 Supabase ref·5432·DB 이름을 검증하고, DB URL을 CLI 인자로
  받지 않으며 URL query는 `sslmode=verify-full`만 허용한다.

**검색 키 교체**는 개인정보 키를 그대로 두고 `EMAIL_LOOKUP_KEY`/`_KEY_ID`만 새 것으로 설정한 뒤 돌린다.
전 행을 복호화해 재색인하므로 **옛 검색 키가 없어도 가능하다.**

```sh
pnpm credentials:dev --mode=reindex --apply --traffic-blocked --writers-drained
pnpm credentials:dev --mode=verify
```

**부분 교체 상태에서 서비스를 재개하지 않는다.** 재실행 뒤 전 행 동일 세대 · 이메일 중복 없음을
확인하고 새 키를 설정한 앱을 활성화한다.

⚠️ **이 절차 둘은 아직 리허설하지 않았다** (2026-09-13 현재). 2026-09-10 전환에서 **미룬 항목이고
실패한 항목이 아니다** — 전환 자체(backfill·전건 검증·평문 인덱스 제거)는 dev·prod 양쪽에서 끝났다.

| 미완 | 무엇을 확인해야 하나 |
|---|---|
| **키 회전 리허설** | 전체 트래픽 차단 상태에서 **부분 실패·재개·키 유실·백업 복원**까지 밟아 본다. `--apply`가 도는 것만 확인한 상태다 |
| **차단·drain 리허설** | 이전 배포 URL·OAuth callback·cron·CI·로컬 writer를 **실제로** 막고, 차단 중 refresh/API 호출이 0인지 확인한다. ⚠️ **이 저장소에는 그 차단을 자동으로 증명하는 수단이 없다** — 수단·증거가 없으면 회전을 **중단**한다 |

**둘 다 실제 회전이 필요해지기 전에 한 번 밟아 본다.** 처음 밟는 자리가 운영 사고 한가운데면
"차단됐는지 모르는 채로 `--apply`를 누르는" 상태가 된다.

## 3. 복구

- **로그인·초대가 전부 "Unavailable"이면 서버 로그의 `[credentials]` 줄부터 본다** (2026-09-18 — 전에는 0줄이었다).
  `credential-env: missing environment variable <이름>`이면 그 키가 빠진 것이고, 나머지는 분류 한 낱말(`sign-in: CredentialError`
  · `credential-io: PrismaClientKnownRequestError` 등)이다. **원문은 어디에도 안 남는다** — Prisma 인자·암호문이 실리기 때문이다.
  같은 형의 줄이 인증 왕복과 초대에도 있다 — `[session-revocation]`·`[login-link]`·`[account-connect]`·`[invite]` 접두의
  `<ref> <단계>: <분류>`(`lib/failure.ts` `logCaught`, 2026-09-18). 콜백이 던졌으면 단계가 `callback`이다.
- **PII 키 유실 시 계정을 재생성하지 않는다 — 백업 키를 복원한다.**
- 암호화 백업 복원 후에도 **트래픽을 차단한 상태에서** 해당 keyring으로 `verify`를 끝낸다.
- **평문 코드로 rollback하지 않는다.**
- **백업 복원·새 DB에서는 `pnpm credentials:finalize:dev` / `:prod`로 finalize 마이그레이션 상태를 먼저
  확인한다** — 기본 check-only라 `pending`만 보고한다.
- 마이그레이션 실패 시 `_prisma_migrations`와 실제 DDL을 대조한다. 전부 롤백된 것이 확인된 경우에만
  검토 후 `migrate resolve --rolled-back <name>`으로 재시도하고, **체크섬 수정·무조건 applied·DB
  reset으로 통과시키지 않는다.**

## 4. 재현 가능한 검증

- `pnpm test` — 암호 도구·저장 경계·인가·초대·토큰 refresh 회귀.
- `pnpm typecheck` — 타입 계약.
- `pnpm test:credentials:postgres` — 임시 Unix socket 전용 PostgreSQL 클러스터를 만들고 제거한다.
  공유 DB URL을 읽지 않는다. 기본 바이너리는 `/opt/homebrew/opt/postgresql@17/bin`이고 다른 환경은
  `CREDENTIAL_PG_BIN`에 로컬 PostgreSQL bin 디렉터리를 지정한다. initdb/pg_ctl/pg_dump/psql이 필요하며
  테스트용 프로세스가 root이면 실행할 수 없다.
  ⚠️ **`pnpm test`에 없다**(별도 config). `/push` 게이트가 안 돌리므로 `lib/credentials/**`를
  건드렸으면 손으로 돌린다.
- `pnpm test:projects:postgres` — 같은 방식으로 격리 클러스터를 띄워(`CREDENTIAL_PG_BIN` 동일) 목록 집계,
  Add surface 원자성·동일 key/locale 공존·교차 FK 거부·실제 Project 생성, 편집 토큰의 조건부 쓰기를
  검사한다. ⚠️ **이것도 `pnpm test` 밖이다** — `lib/keys/**`·`lib/surfaces/**`·`lib/protection/**` 등
  전체 목록은 [CLAUDE.md](../CLAUDE.md) 명령어 표에 있다.
- 격리 테스트는 실제 Auth.js 핸들러와 **가짜** OAuth 응답, 실제 DB unique/잠금/CAS, 중단·재개·백업
  복원을 검사한다. **실제 공급자·배포 차단·키보드/포커스 검증을 대신하지 않는다.**

## GitHub App 콘솔 설정 — 설치 중 인가

App 설정 > General (2026-09-18, install-and-connect):

- **Request user authorization (OAuth) during installation** **켬** — GitHub이 설치 URL의 `state`를 callback까지 싣고 `code`와 함께 돌려준다. ①의 [Install GitHub App]이 설치와 연결을 한 왕복으로 끝내는 전제다. 끄면 설치 복귀가 state 없이 오고 연결은 따로 해야 한다(보조 링크 "Connect your account").
- **Setup URL**은 **비운다** — 옵션이 켜져 있으면 쓰이지 않는다(GitHub이 callback으로 보낸다). 남겨 두면 누가 옵션을 끄는 순간 지운 라우트(`/api/github/setup`)로 가서 404다.
- **Redirect on update** 켬 — 리포 선택을 바꾸고 Save하면 callback으로 state 없이 돌아오고, callback이 `/projects/new`에 쓰기 없이 착지시킨다.

⚠️ **설치 URL은 `redirect_uri`를 받지 않는다** — 세 환경이 `malmoi-prod` 하나를 공유하는 동안 로컬·preview에서 시작한 설치도 프로덕션 callback으로 간다(쿠키가 없어 교환 0회로 거부된다). 로컬에서는 보조 링크(Authorize, `redirect_uri`가 로컬)로 연결하고 GitHub에서 직접 설치한 뒤 [Check again]으로 본다. 요청 대기(D)·목록 위 info는 dev DB의 `Account.installRequestedAt`을 직접 심어 본다. 설치 왕복 자체(1클릭·요청 복귀·승인 복귀)는 **프로덕션에서만** 실측한다. ⚠️ **L2.10에서 App을 나누면 dev App에도 같은 옵션을 켠다.**

## Google OAuth 동의 화면 — 게시와 도메인 소유권 (2026-09-19)

**상태: External + 게시(In production).** 그 전까지 테스트 모드였고 **등록된 테스트 사용자만** 로그인됐다 — 초대받은 비개발자 동료가 목록에 없으면 막혔다는 뜻이다. ⚠️ **Internal로 바꾸지 않는다** — 조직 밖 계정이 `403 org_internal`로 막혀 초대 경로가 통째로 죽는다.

**심사는 없었다.** 요청 스코프가 `email`·`profile`(non-sensitive)뿐이라 검토 대상이 아니고, [게시] 버튼이 요구한 것은 **선행 둘**이었다:

1. **개인정보처리방침 URL** — `https://mal-moi.com/privacy`(프로덕션에 실물로 서 있어야 한다).
2. **승인된 도메인 `mal-moi.com`** — 등록이 **Search Console 도메인 소유권 인증**을 요구한다.

### 도메인 소유권 인증 (가비아 DNS)

DNS는 가비아가 든다(`ns.gabia.co.kr`). My가비아 → 도메인 → DNS 관리툴에서 레코드 추가: 타입 `TXT` · 호스트 **`@`**(도메인 전체를 쓰지 않는다) · 값 `google-site-verification=<토큰>` · TTL 기본. 따옴표는 가비아가 붙이므로 값에 직접 넣지 않는다. **기존 CNAME(`dev` → Vercel)과 타입이 달라 충돌하지 않는다.**

⚠️ **한 번 실패했고, 그 실패는 눈으로 구별되지 않는다.** 정상 토큰은 `google-site-verification=` 뒤 **43자**인데 인증 창의 입력칸이 폭에 맞춰 잘려 보여 **36자만 복사됐다.** 그리고 실패 화면이 *"다음 DNS TXT 레코드가 대신 발견되었습니다"*로 **그 잘린 값을 그대로 되읽어**, 화면상으로는 정답과 같은 문자열이 나란히 놓인다. **판정은 길이로 한다**:

```
dig +short TXT mal-moi.com | tr -d '"' | sed 's/.*=//' | awk '{print length($0)}'   # 43이어야 한다
```

값은 인증 창의 **[복사] 버튼**으로 가져온다(드래그 선택 금지 — 칸이 잘려 보인다). 반영은 가비아 원본(`@ns.gabia.co.kr`)과 퍼블릭 리졸버(`@8.8.8.8`) 둘 다에서 확인한 뒤 [확인]을 누른다.

## 호스팅 플랜과 한도 (2026-09-19 확인)

| 무엇 | 플랜 | 따라오는 제약 |
|---|---|---|
| Vercel (`malmoi`) | **Hobby** | Cron **하루 1회**이고 **프로덕션 배포에서만** 돈다 — `vercel.json`의 `0 18 * * *` 하나가 전부다. 약관이 비상업 용도라 **사내 도구**라는 전제로 쓴다 — 사외 공개로 성격이 바뀌면 Pro로 올린다(그때 cron 빈도 전제와 온보딩 ④ 문구가 같이 바뀐다). |
| Supabase prod (`malmoi`, ref `xgsyyapzkpbdtkrprlmn`) | **Free** | **비활성 자동 일시중지가 켜져 있고 Free에서는 끌 수 없다.** PITR **없음** — 시점 복구가 불가능하다. |

⚠️ **일시중지를 막는 것이 야간 cron 하나뿐이고, 그것은 보장이 아니다.** `/api/pull`이 매일 DB를 조회하므로 비활성 카운터가 리셋되지만, cron은 **프로덕션 배포에만** 붙는다 — 프로덕션 배포가 멈추거나 cron이 실패로 돌지 않으면 그 keepalive도 같이 사라진다. **프로덕션이 실사용에 들어가기 전에 Supabase를 Pro로 올린다**(일시중지 제거 + PITR). 그때까지는 일시중지에서 깨어난 뒤 첫 요청이 느린 것을 장애로 오진하지 않는다.

⚠️ **백업 절차가 없다.** Free는 일 단위 백업만 제공하고 PITR이 없으므로, 키 회전(§2)이나 마이그레이션(`db:deploy`) 전에 되돌릴 지점이 필요하면 **손으로 덤프를 뜬다** — `pg_dump`를 `DIRECT_URL_PROD`(5432)로 돌린다. 암호화 키를 잃으면 덤프가 있어도 PII는 복구되지 않는다(§1).

## 5. 자격증명 전면 재발급

순서가 있다 (2026-09-03 실행). Supabase 비번 재설정 → `.env.local` → Vercel env → 재배포
(`vercel redeploy <최근 prod URL>`). 상세와 함정은 [CLAUDE.md](../CLAUDE.md)의 "새 머신 셋업" 절이다.

⚠️ **GitHub App 개인키는 여러 개를 동시에 가질 수 있지만, 지우면 그 키를 쓰던 네 곳이 동시에 끊긴다** —
로컬 `.env.local` · Vercel Production · Vercel Preview · 다른 머신. 2026-09-06에 옛 키 하나를 지웠다가
넷이 다 죽었고 **증상이 "App이 설치돼 있지 않다"로 보였다.** 지우기 전에 그 키를 누가 들고 있는지 세고,
넷을 전부 옮긴 뒤에 지운다.
