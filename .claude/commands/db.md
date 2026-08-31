---
description: Prisma 마이그레이션 생성·적용·드리프트 확인 + 배포 순서 판정(additive-first). 커밋은 스키마+마이그레이션만.
---

`prisma/schema.prisma` 변경을 마이그레이션으로 확정하고, **배포 순서까지 판정한다.** 이 프로젝트에서 스키마와 코드는 배포 시점이 다르므로 순서를 틀리면 프로덕션이 없는 컬럼을 조회한다.

## 사용

- `/db` — 현재 `schema.prisma` 변경을 마이그레이션으로.
- `/db status` — 드리프트·미적용 마이그레이션만 확인 (변경 안 함).

## ⚠️ 이 PoC는 dev DB와 prod DB가 같다

로컬 Postgres가 없고 Supabase 인스턴스 하나(`i18n-poc`)뿐이다. 즉 **`pnpm db:migrate`(= `migrate dev`)가 프로덕션 DB를 직접 바꾼다.** 결과:

- **`migrate dev`가 드리프트를 감지하면 "리셋할까요?"를 제안한다. 절대 승인하지 않는다 — 번역 데이터가 전부 날아간다.** 드리프트가 나오면 중단하고 보고한다(1단계).
- **번역 데이터가 쌓인 뒤로는 `--create-only`를 기본으로 쓴다.** SQL을 먼저 만들어 눈으로 읽고, 적용은 `pnpm db:deploy`로 한다. `migrate dev`는 스키마를 실험적으로 밀어보는 명령이라 데이터가 있는 DB에 쓸 도구가 아니다.
- **DB가 비어 있는 초기 단계에서만 `migrate dev`를 그대로 쓴다.** 지금 상태가 그렇다면 그 사실을 리포트에 적는다.
- 나중에 Supabase 프로젝트를 하나 더 만들어 분리하면 이 제약이 사라진다. 그때 이 섹션을 지운다.

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

DB가 비어 있으면:
```
pnpm db:migrate --name <snake_case_이름>
```

**번역 데이터가 있으면 반드시 `--create-only`** (위 dev==prod 경고):
```
pnpm db:migrate --create-only --name <snake_case_이름>
```

이름은 무엇을 하는지 드러나게 (`add_orphaned_to_string_key`, `backfill_namespace`). `--create-only`가 필요한 경우(백필 SQL을 손으로 넣어야 할 때)는 그렇게 하고 SQL을 직접 작성한다.

### 5. 검증

- 생성된 `prisma/migrations/<ts>_<name>/migration.sql`을 **읽는다.** Prisma가 만든 SQL이 의도와 맞는지 확인 — 특히 `DROP`·`ALTER COLUMN`이 예상 외로 들어갔는지
- `pnpm db:generate` → `pnpm typecheck` — 스키마 변경이 타입에 반영되고 코드가 여전히 컴파일되는지
- `pnpm test`

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
커밋: <해시> (스키마+마이그레이션만)

배포 순서:
1. pnpm db:deploy   ← /push **전에** 실행 (프로덕션 스키마 먼저 넓힌다)
2. /push            ← main 푸시 = 프로덕션 배포
3. <destructive 2단계가 남았으면: 다음 /db 호출로 구 컬럼 정리>
```

## 금지 사항

- **`prisma migrate reset` 금지, `migrate dev`의 리셋 제안 승인 금지.** dev DB가 곧 prod DB라 번역 데이터가 날아간다. 드리프트는 중단하고 보고한다.
- **데이터가 있는 DB에 `migrate dev` 금지** — `--create-only` + `db:deploy`로 쪼갠다.
- **transaction 모드(6543)로 마이그레이션 금지** — `prisma.config.ts`가 `DIRECT_URL`(5432)을 쓴다. 이 파일을 `DATABASE_URL`로 바꾸지 않는다.
- **destructive를 한 번에 처리 금지** — 2단계로 쪼갠다.
- **`db:deploy`를 이 스킬에서 자동 실행 금지** — 프로덕션 DB를 바꾸는 일이라 사용자가 명시적으로 돌린다.
- **마이그레이션 SQL을 읽지 않고 넘어가기 금지.**
- **생성된 마이그레이션 파일 사후 편집 금지** — 이미 적용된 마이그레이션을 고치면 체크섬이 깨진다. 새 마이그레이션을 추가한다.
