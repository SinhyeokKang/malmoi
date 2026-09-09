---
description: Prisma 마이그레이션 생성·적용·드리프트 확인 + 배포 순서 판정(additive-first). 커밋은 스키마+마이그레이션만.
---

`prisma/schema.prisma` 변경을 마이그레이션으로 확정하고, **배포 순서까지 판정한다.** 이 프로젝트에서 스키마와 코드는 배포 시점이 다르므로 순서를 틀리면 프로덕션이 없는 컬럼을 조회한다.

## 사용

- `/db` — 현재 `schema.prisma` 변경을 마이그레이션으로.
- `/db status` — 드리프트·미적용 마이그레이션만 확인 (변경 안 함).

## ⚠️ dev DB와 prod DB가 갈렸다 (2026-09-04)

**2026-09-04부터 Supabase 프로젝트가 둘이다** — prod(`malmoi`) / dev(`malmoi-dev`). `pnpm db:migrate`는 **dev**를 치고 프로덕션에 닿을 수 없다. `pnpm db:deploy`·`pnpm db:status:prod`만 prod를 겨눈다(`PRISMA_TARGET=prod`).

⚠️ **분리가 만든 새 실패 모드**: dev에만 적용하고 `db:deploy`를 잊으면 배포 순간 프로덕션이 없는 컬럼을 조회한다. 그래서 `/push` 3단계 확인은 `db:status:prod`다 — `db:status`는 dev를 본다.

**dev에서는 리셋을 승인해도 된다** — 그 DB에 번역 데이터가 없다(폐기용 리포 적재분뿐이고 `pnpm push:local`로 복구된다). 분리 전에는 같은 제안이 프로덕션 데이터를 날리는 것이었다.

- **`--create-only` + `db:deploy`로 쪼개는 습관은 유지한다.** 생성한 SQL을 프로덕션에 보내기 전에 눈으로 본다 — `db:deploy`에는 리셋 개념이 없으므로 잘못된 SQL을 되돌릴 경로가 다음 마이그레이션뿐이다.
- **prod에 데이터가 쌓인 뒤의 destructive는 여전히 2단계다** (아래 4c·6단계). dev가 비어 있다는 사실이 prod에도 적용되는 것이 아니다.

## 왜 별도 스킬인가

**Prisma 7은 접속 URL이 두 파일로 갈려 있다.** v6의 `url`/`directUrl` 쌍이 스키마에서 제거됐다:

| 용도 | 위치 | 환경변수 | 포트 |
|---|---|---|---|
| 마이그레이션·CLI | `prisma.config.ts` | `DIRECT_URL` | 5432 (session) |
| 런타임 쿼리 | `lib/db.ts`의 driver adapter | `DATABASE_URL` | 6543 (transaction) |

**transaction 모드로 마이그레이션하면 DDL 세션을 못 잡아 실패한다.** 게다가 **main 단일 브랜치라 push가 곧 프로덕션 배포**여서 스키마 적용 타이밍이 배포와 직접 얽힌다. 매번 즉흥으로 판단하지 않기 위해 규칙을 박아둔다.

## 절차

### 1. 상태 확인

```
pnpm db:status
git status --porcelain prisma/
```

`prisma.config.ts`가 `.env.local`을 읽는다(`dotenv`의 기본은 `.env`라 경로를 명시해뒀다). URL이 `undefined`면 `P1001 Can't reach database server`가 떠서 **네트워크 문제로 오진하게 된다** — 먼저 `.env.local`의 `DIRECT_URL`을 확인한다.

- **드리프트 검출**(DB가 마이그레이션 히스토리와 다름) → **중단하고 보고.** 손으로 DB를 고친 흔적이거나 마이그레이션을 건너뛴 상태다. 임의로 `migrate reset`을 돌리지 않는다 — **번역 데이터가 날아간다.**
- 미적용 마이그레이션이 있으면 먼저 적용할지 확인.

### 2. 변경 분류 (핵심 단계)

`schema.prisma` diff를 읽고 **additive / destructive**로 나눈다.

**Additive** — 기존 코드가 계속 동작한다:
- 테이블 추가
- **nullable** 컬럼 추가, 또는 **default 값이 있는** 컬럼 추가
- 인덱스 추가
- enum 값 추가

**Destructive** — 기존 코드가 깨진다:
- 컬럼·테이블 삭제, 이름 변경
- nullable → NOT NULL (기존 행에 null이 있으면 실패)
- 타입 변경
- unique 제약 추가 (기존 중복이 있으면 실패)
- enum 값 삭제

**default 없는 NOT NULL 컬럼 추가는 destructive다.** 기존 행을 채울 값이 없어 마이그레이션 자체가 실패한다. nullable로 추가 → 백필 → NOT NULL 승격, 3단계로 쪼갠다.

### 3. destructive면 2단계로 쪼갠다

한 번에 하지 않는다. 순서:

1. **1차 마이그레이션 (additive)**: 새 컬럼을 nullable로 추가. 코드는 양쪽(구·신)을 다 읽게 쓴다
2. **코드 배포** (`/push` — main 푸시가 곧 배포다)
3. **백필** — 필요하면 스크립트로
4. **2차 마이그레이션 (destructive)**: 구 컬럼 삭제 / NOT NULL 승격

**이번 `/db` 호출은 한 단계만 처리한다.** 다음 단계는 사용자가 다시 호출한다.

### 4. 마이그레이션 생성

이름은 무엇을 하는지 드러나게 (`add_orphaned_to_string_key`, `backfill_namespace`).

**4a. 기본 경로 — additive 변경**

```
pnpm db:migrate --name <snake_case_이름>
```

**4b. prod에 번역 데이터가 있으면 `--create-only`** (위 dev/prod 분리 섹션). 백필 SQL을 손으로 넣어야 할 때도 이 경로다:

```
pnpm db:migrate --create-only --name <snake_case_이름>
```

**4c. ⚠️ `migrate dev`가 거부하면 — destructive 변경의 우회 경로**

`migrate dev`는 destructive 변경(컬럼 삭제, PK 변경, unique 추가 등)을 감지하면 **대화형 확인을 요구하고, 이 환경에서는 확인을 줄 수 없어 그냥 실패한다:**

```
Error: Prisma Migrate has detected that the environment is non-interactive, which is not supported.
```

**`--create-only`로도 벗어나지 못한다** — 확인 프롬프트가 생성 단계에 있다. 이때는 `migrate diff`로 SQL을 만들어 마이그레이션 폴더에 직접 넣고 `db:deploy`로 적용한다:

```bash
TS=$(date -u +%Y%m%d%H%M%S)
DIR="prisma/migrations/${TS}_<snake_case_이름>"
mkdir -p "$DIR"
npx prisma migrate diff \
  --from-config-datasource \
  --to-schema prisma/schema.prisma \
  --script > "$DIR/migration.sql"
```

- `--from-config-datasource`는 **살아 있는 DB의 현재 상태**를 기준으로 삼는다. `--from-migrations`는 shadow DB를 요구하므로 쓰지 않는다.
- 타임스탬프 형식(`YYYYMMDDHHMMSS`)을 Prisma 관례와 맞춰야 순서가 맞는다. **UTC로** 만든다(`date -u`).
- 출력에 `Loaded Prisma config from...` 같은 로그가 섞이면 SQL이 깨진다. 파일을 열어 **첫 줄이 SQL인지 확인**한다.
- 적용은 **`pnpm exec prisma migrate deploy`**(`PRISMA_TARGET` 없음 → `DIRECT_URL` = dev)다. ⚠️ `pnpm db:deploy`가 **아니다** — 그 스크립트는 `PRISMA_TARGET=prod`라 프로덕션을 겨눈다(dev/prod 분리 전 문장이 남아 있었다 — 2026-09-07 T2에서 잡았다). `db:migrate`를 다시 부르면 같은 프롬프트에 또 걸린다.
- ⚠️ **비대화형 판정은 destructive와 무관하게 걸릴 수 있다** — 2026-09-07 nullable 컬럼 + unique 인덱스(additive)에도 `--create-only`가 같은 메시지로 거부됐다. 이 우회 경로가 사실상 에이전트의 기본 경로다.
- `--script` 출력 **첫 줄에 dotenv 로그(`◇ injected env (N) from .env.local …`)가 섞인다** (실측). `sed -i '' '/^◇ injected env/d'`로 지운 뒤 첫 줄이 `-- AlterTable`류 SQL인지 본다.
- **이 경로는 Prisma의 안전장치를 우회하는 것이다.** 그래서 5단계 SQL 검토가 선택이 아니라 필수고, destructive 판정(2단계)과 dev/prod 분리 섹션의 제약을 이미 통과했다는 전제가 있어야 한다. 데이터가 있는 DB에서 이 경로를 쓸 때는 SQL을 읽은 결과를 사용자에게 보여주고 확인받는다.

### 5. 검증

- 생성된 `prisma/migrations/<ts>_<name>/migration.sql`을 **읽는다.** Prisma가 만든 SQL이 의도와 맞는지 확인 — 특히 `DROP`·`ALTER COLUMN`이 예상 외로 들어갔는지
- `pnpm db:generate` → `pnpm typecheck` — 스키마 변경이 타입에 반영되고 코드가 여전히 컴파일되는지
- `pnpm test`
- ⚠️ **새 테이블을 만들었으면 `anon` 권한이 0인지 확인한다** (2026-09-09 추가). Supabase의 `public`
  스키마에는 **새 테이블을 `anon`·`authenticated`에 전 권한으로 여는 default privilege**가 걸려
  있었고, 그래서 12테이블이 전부 데이터 API로 열려 있었다 — `Account.access_token`·
  `Session.sessionToken`까지 anon key 하나로 읽고 지울 수 있었다 (POSTMORTEM 2026-09-09).
  2026-09-09에 `ALTER DEFAULT PRIVILEGES`에서 그 롤들을 뺐으므로 **지금은 새 테이블이 닫힌 채로
  태어난다** — 이 검사는 그것이 유지되는지 보는 것이다(Supabase가 default ACL을 되살릴 수 있다):

  ```sql
  SELECT grantee, table_name FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND grantee IN ('anon','authenticated');
  ```

  **dev·prod 둘 다** 0건이어야 한다. 1건이라도 나오면 그 테이블에 `REVOKE ALL ... FROM anon,
  authenticated`를 치고 `pg_default_acl`도 다시 본다. Supabase 대시보드 **Advisors → Security**가
  0 errors인지도 같은 신호다.

### 6. 커밋

**스키마 + 마이그레이션 파일만** 커밋한다. 영문 메시지, `chore(db):` 또는 `feat(db):` 스코프. 코드 변경이 섞여 있으면 분리한다 — 마이그레이션을 되돌려야 할 때 코드까지 딸려오면 안 된다.

### 7. 배포 순서 안내 (리포트에 필수)

프로덕션 적용은 **`/push` 전에 `pnpm db:deploy`** 로 한다 (additive-first). `/push` 3단계가 마이그레이션을 감지해 확인을 요구하지만, 그건 안전망이고 순서를 아는 건 이쪽 책임이다 — 잊으면 배포 직후 프로덕션이 없는 컬럼을 조회한다.

## 리포트

```
🗄  db: <마이그레이션 이름>
분류: additive / destructive(<n>/2 단계)
변경: <컬럼·테이블 요약>
SQL 확인: <DROP/ALTER 유무와 내용>
generate + typecheck: OK / test: <n> passed
anon 권한: dev 0건 / prod 0건  ← 새 테이블을 만들었으면 필수
커밋: <해시> (스키마+마이그레이션만)

배포 순서:
1. pnpm db:deploy   ← /push **전에** 실행 (프로덕션 스키마 먼저 넓힌다)
2. /push            ← main 푸시 = 프로덕션 배포
3. <destructive 2단계가 남았으면: 다음 /db 호출로 구 컬럼 정리>
```

## 금지 사항

- **prod를 겨눈 리셋 금지.** dev(`db:migrate`)의 리셋 제안은 승인해도 되지만(데이터 없음), `prisma migrate reset`을 `DIRECT_URL_PROD`로 돌리는 경로는 없어야 한다. dev 드리프트도 원인을 보고한 뒤 리셋한다 — 조용히 지우면 무엇이 갈렸는지 잃는다.
- **데이터가 있는 DB에 `migrate dev` 금지** — `--create-only` + `db:deploy`로 쪼갠다.
- **transaction 모드(6543)로 마이그레이션 금지** — `prisma.config.ts`가 `DIRECT_URL`(5432)을 쓴다. 이 파일을 `DATABASE_URL`로 바꾸지 않는다.
- **destructive를 한 번에 처리 금지** — 2단계로 쪼갠다.
- **`db:deploy`를 이 스킬에서 자동 실행 금지** — 프로덕션 DB를 바꾸는 일이라 사용자가 명시적으로 돌린다.
- **마이그레이션 SQL을 읽지 않고 넘어가기 금지.**
- **생성된 마이그레이션 파일 사후 편집 금지** — 이미 적용된 마이그레이션을 고치면 체크섬이 깨진다. 새 마이그레이션을 추가한다.
