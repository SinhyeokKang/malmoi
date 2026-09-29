# schema-debt-cleanup — 태스크

순서: 사전 조회 → 죽은 코드(A) → 스키마 1단계(B1) → `/push`·`/merge` ① → 스키마 2단계(B2) → `/merge` ②.
커밋 경계는 `──` 줄이다.

⚠️ **동결 창**: B1.2 스키마 수정부터 B2.2 `/merge` ②까지 다른 기능의 스키마 작업을 받지 않는다. 이 창 안에서 `pnpm db:migrate`(`--create-only` 포함)는 이 기능도 쓰지 않는다 — 스키마와 히스토리의 차이로 DROP을 자동 생성한다. 마이그레이션은 전부 `db.md` 4c(손 SQL 또는 `migrate diff` + `pnpm exec prisma migrate deploy`)로 만든다.
**탈출구**: ②가 막히면 스키마에 일곱 항목을 되돌리는 커밋으로 드리프트를 닫는다. 마이그레이션은 필요 없다.

## T0 사전 조회 (읽기 전용, 코드 없음)

- [x] (2026-09-29 실행 — dev: ProjectEvent UNKNOWN 0/753 · Account 0 / prod: UNKNOWN 0/42 · Account 0. 전제 성립) dev·prod 각각: `SELECT count(*) FILTER (WHERE "actorKind"='UNKNOWN'), count(*) FROM "ProjectEvent"` ·
  `SELECT count(*) FROM "Account" WHERE token_type IS NOT NULL OR scope IS NOT NULL OR id_token IS NOT NULL OR session_state IS NOT NULL`.
  — 검증: UNKNOWN 0행 · Account 0행. **하나라도 0이 아니면 중단하고 보고**(UNKNOWN 행은 사건이라 못 지운다; Account 값은 누가 썼는지부터 본다).

## A. 죽은 코드

- [ ] **A1** `sync-edit-protection.integration.ts`의 `loadKeys`·`isUnpublished`·`countUnpublished` 사용처(`:15–16` import · `:485` [C9] · `:504` 토큰 비노출)를 `loadTranslationList`/`loadTranslationDetail` + `countPending`으로 교체.
  — 검증: `translation-list.ts:276`의 상세 투영에 `pendingEditToken`을 임시로 실으면 `:504` 대체 단언이 red, 원복하면 green(뮤테이션 1회) · `pnpm test:projects:postgres` green.
- [ ] **A2** `list-aggregates.integration.ts`의 사용처(`:26–27` import · `:75–89` · `:273–287` · `:346–352` · `:364` · `:381`(3인자 호출) · `:386` · `:399` · `:546–549`)를 `pendingViaTranslationList`·`countPending`으로 교체.
  - `:75–86` 보관 표면은 **쌍**으로 바꾼다: 같은 픽스처로 보관 전 `pendingVia = countPending > 0`, 보관 후 둘 다 0. 제목 "보관 시각을 실제 쿼리가 생산한다"도 바꾼다.
  — 검증: `pnpm test:projects:postgres` green · 보관 전 단언이 `> 0`을 실제로 요구한다(0으로 바꾸면 red).
- [ ] **A3** `pnpm test` 층 테스트:
  - `queries.test.ts` "isUnpublished ↔ countUnpublished" 블록과 `countUnpublished` describe를 `countPending` 대상으로 **옮긴다**(import만 바꾼다 — `where.ts`는 `server-only`가 아니다).
  - `view.test.ts`의 isUnpublished describe와 `:275–279` `Object.create(null)` 가드를 삭제하고, `lib/pull/render.ts:45` 주석의 "대입 쪽 짝" 지목을 고친다.
  - `entry-order.test.ts:157–160`을 `translation-list.ts:188`의 `ORDER BY … "key" COLLATE "C"`를 고정하는 단언으로 옮긴다. 제목은 "같은 순위·표면 안에서 key 순"으로 바꾼다.
  - `home-screen.test.ts:66–70`은 `countPending|countUnpublishedBySurface`를 겨누게 바꾸고 거짓 주석("번역 화면 툴바의 것")을 고친다. `:95`는 삭제한다.
  - `actor.test.ts:6,17`의 `KeyRow` 픽스처 형과 쓰이지 않는 `row()` 헬퍼를 정리한다.
  — 검증: `pnpm test` green · `queries.test.ts`의 orphan 키·orphan 로케일·테넌트 제외 단언이 `countPending`을 대상으로 남아 있다. PG 층은 A2의 `:546–549`(orphan)·`:273–287`(보관)이 든다.
- [ ] **A4** `loadKeys`·`isUnpublished`·`countUnpublished`·`KeyRow`·`Cell` 삭제. 이들을 가리키는 주석도 정리한다: `where.ts:6–8` · `view.ts:23` · `query.ts:20,179,193,433,536` · `lib/auth/query.ts:17` · `lib/pull/render.ts:13` · `lib/pull/load.ts:108` · `lib/projects/list.ts:98` · `lib/push/apply.ts:359`(`$queryRaw` 안 SQL 주석이라 런타임 SQL 문자열도 바뀐다) · `flow.test.ts:241` · `app/(edit)/__tests__/harness.ts:1246,1260`.
  — 검증: 완료 조건 1의 `rg` 0건 · `pnpm typecheck` · `pnpm test` · `pnpm test:projects:postgres` green.

── 커밋: `refactor: drop dead pending projections and re-aim predicate tests at the translation list`

## B1. 스키마 1단계 (① 릴리스)

- [ ] **B1.1** `schema-contract.test.ts`를 고친다.
  - `:65` Account 단언을 "식별자 넷 + 토큰 셋(`access_token`·`refresh_token`·`expires_at`) + `installRequestedAt`이 있고, 네 컬럼은 **없다**"로 뒤집고, 거짓이 된 제목을 바꾼다.
  - `:208` `ActorKind`를 `["USER","AUTOMATION"]`으로 **교체**한다.
  - `confirmedAt`/`recordedAt` 부재 단언을 추가한다.
  — 검증: 스키마 수정 전 red.
- [ ] **B1.2** `schema.prisma`에서 일곱 항목을 삭제한다. Account 머리 주석(`:697–699`, "하나라도 없으면 … 로그인이 깨진다")과 `ActorKind` 위 주석(`:435–436`)도 사실대로 고친다. 그다음 **`pnpm db:generate`** 를 돌린다(DB는 건드리지 않는다).
  — 검증: B1.1 green. 이 시점의 typecheck red는 B1.3~B1.5가 닫는 소비자뿐이다.
- [ ] **B1.3** 자격증명 쪽을 정리한다.
  - `migration.test.ts`·`conversion.test.ts`에서 `id_token` 사례를 제거·갱신하고, `migrateAccountFields`·`conversion.ts`에서 `id_token`을 제거한다.
  - `lib/credentials/__tests__/postgres.integration.ts`를 갱신한다: `:58` 픽스처의 `id_token`, `:171`·`:267`·`:801` 기대의 `id_token: null`.
  - `:58`의 "로그인 토큰이 있는 legacy 행"은 `access_token`만으로도 R1 backfill이 비우는지 재는 입력으로 남아야 한다.
  — 검증: `pnpm test` 해당 파일 green · `pnpm test:credentials:postgres` green(스키마 수정 **뒤**에 돈다) · `:58`에서 `access_token`을 빼면 R1 비움 단언이 공허해지는지 확인.
- [ ] **B1.4** `lib/events` 쪽을 정리한다.
  - 테스트의 UNKNOWN 사례를 지운다. `query.integration.ts:85,342–347`의 UNKNOWN 행 INSERT도 포함한다.
  - `ACTOR_KINDS`·`record.ts`·`view.ts` 형과 `payload.ts:17–18` 주석에서 `UNKNOWN`을 제거한다.
  - `event-row.tsx:113`·`event-detail.tsx:241` 분기를 제거한다.
  - `m.common.unreadable`은 다른 소비자가 있어 **남긴다**(확인 완료).
  — 검증: `pnpm typecheck` 중 `lib/events`·`components/logs` 쪽 오류 0 · `pnpm test` · `pnpm test:projects:postgres` green.
- [ ] **B1.5** 나머지 쓰기와 등재를 제거한다.
  - 쓰기: `lib/pull/load.ts:319,352–353` · `lib/keys/save-key.ts:142`
  - raw INSERT: `delivery-baseline-fk.integration.ts:55`의 `confirmedAt`
  - 등재: `lib/privacy/collected.ts` 네 행
  - `/privacy` 본문(`messages/en.tsx`의 `publicDocs.privacy`)에서 네 칸을 언급하지 않는지 grep한다.
  — 검증:
    - `pnpm typecheck` green
    - `rg -n '(^|[^A-Za-z])(confirmedAt|recordedAt|id_token|token_type|session_state)\b' lib app components scripts prisma/schema.prisma` → 아래 허용 목록 외 0건. 허용 목록:
      - `lib/oauth/**`·`app/oauth/**`의 `token_type(_hint)` — MCP OAuth 응답이다.
      - `lib/auth/__tests__/safe-adapter.test.ts:17`의 `id_token` — linkAccount가 버리는지 재는 입력이다.
      - `postgres.integration.ts:220` — GitHub 목 응답이다.
    - `scope`는 이름이 흔하므로 `rg -n 'scope\s*:' lib app | rg -i account`로 따로 본다.
    - `/privacy` 본문 0건.
- [ ] **B1.6** `/db`: 마이그레이션 `relax_delivery_confirmation_confirmed_at`를 **4c로 손으로** 쓴다. 내용은 `ALTER … DROP NOT NULL` 한 줄이다. `db:migrate`는 쓰지 않는다. dev 적용은 `pnpm exec prisma migrate deploy`로 하고, 그다음 **dev 서버를 재시작**한다.
  — 검증:
    - SQL이 그 한 줄뿐이다.
    - `pnpm db:status`가 up to date다.
    - `pnpm test:projects:postgres` · `pnpm test:credentials:postgres`가 green이다.
    - dev에서 GitHub 로그인 1회 + Save 1회가 된다.
    - **확인 행이 없는 새 표면으로 첫 Publish 1회**(`DeliveryConfirmation` INSERT)가 된다. 대상은 `bugshot-i18n-test-qa`에 표면을 하나 더한 것이다. 확인 행이 있는 표면은 UPDATE로 빠져 이완을 재지 못한다.
    - `has_schema_privilege`가 false다.
- [ ] **B1.7** 문서를 고친다. 이 기능이 문서에 넣는 대상은 아래와 같다.
  - ARCHITECTURE `:190`: `loadKeys`가 key 순의 한 곳이라는 서술을 `translation-list.ts`의 raw `ORDER BY`와 `entry-order.test.ts`의 새 단언으로 바꾼다.
  - ARCHITECTURE `:663`: `countUnpublished`.
  - ARCHITECTURE pending 절 `:1076–1078`.
  - ARCHITECTURE §5.1 `:1115–1116`: snake_case 컬럼 "일곱"을 "셋"으로 바꾼다.
  - ARCHITECTURE `:1710`: §5.8 전달 확인 레코드 필드 목록의 `confirmedAt`.
  - DESIGN `:383`: `isUnpublished`를 `translation-list`의 실제 필드명(`hasPending`·셀 `pending`)으로 바꾼다.
  - §5.7에는 UNKNOWN 언급이 없어 고칠 것이 없다.
  — 검증: 완료 조건 7의 rg 0건. 남기는 역사 서술 줄이 있으면 여기에 줄 번호로 적는다.

── 커밋 순서:
1. `/db`: 스키마 + 마이그레이션
2. `refactor(schema): stop reading and writing unused audit columns`
3. `docs(ARCHITECTURE): …`
4. `docs(DESIGN): …`

1과 2 사이의 한 점은 typecheck가 red다. 스키마만 바뀌고 소비자는 그대로인 상태이기 때문이다. 둘은 연속으로 두고 한 번의 `/push`로 함께 보낸다.

- [ ] **B1.8** `/push` → `/merge` ① (patch).
  — 검증: `db:status:prod` 적용 확인 · 프로덕션 로그인 1회 + 로그 화면 열기(완료 조건 5b) · ① squash SHA와 태그를 기록한다(B2.2의 판정 기준).

## B2. 스키마 2단계 (② 릴리스) — ①이 프로덕션에 뜬 뒤에만

- [ ] **B2.0** dev DB를 공유하는 다른 체크아웃(다른 머신, main 체크아웃의 QA 워커)이 ① 이후 커밋 + `pnpm db:generate` + dev 서버 재시작을 마쳤는지 확인한다.
  — 검증: 각 체크아웃의 `git log -1`이 ① squash 이후다. 확인이 안 되면 B2.1을 dev에 적용하지 않는다.
- [ ] **B2.1** `/db` 4c(`/db` 2단계 분류는 1단계의 연속으로 둔다 — 스키마 diff가 0이다)로 진행한다.
  - `migrate diff --from-config-datasource --to-schema`로 `drop_unused_audit_columns`를 생성하고 SQL을 검토한다.
  - `postgres.integration.ts`의 `resetSchema`가 `FINALIZE_MIGRATION`처럼 이 마이그레이션도 건너뛰게 하고, 이유를 머리 주석에 적는다. finalize SQL이 `"id_token"`을 읽기 때문이다.
  - dev 적용은 `pnpm exec prisma migrate deploy`로 한다.
  — 검증:
    - SQL이 기대 문장뿐이다: `DROP COLUMN` 6(Account 넷 · `confirmedAt` · `recordedAt`) · `CREATE TYPE "ActorKind_new"` · `ALTER COLUMN "actorKind" TYPE … USING` · `RENAME` 2 · `DROP TYPE`. 그 밖의 문장은 0이다.
    - `pnpm db:status`가 up to date다.
    - `pnpm test:projects:postgres` · `pnpm test:credentials:postgres`가 green이다.
    - dev에서 로그인 · 로그 화면 · Publish · Save 각 1회(완료 조건 5c).
    - dev에서 완료 조건 4의 조회 2종이 결과를 낸다.
    - `has_schema_privilege`가 false다.
- [ ] **B2.2** `/push` → `/merge` ② (patch).
  — 검증:
    - `/merge` 1단계 `db:deploy` **전**:
      - Vercel 프로덕션 배포 커밋이 ① squash SHA이거나 그 이후이고 Ready다(완료 조건 5a).
      - `git diff v<①>..origin/dev --stat -- prisma/`의 결과가 ② 디렉터리 하나뿐이다.
    - 머지 뒤: prod에서 완료 조건 4의 조회 3종 + 로그인 1회 + 로그 화면 열기.

── 커밋: `/db`가 마이그레이션을 커밋한다 · `test: skip the audit-column drop in the credential cutover suite`

## 마무리

- [ ] 결론을 정본으로 올린다(B1.7에서 대부분 끝). 그다음 `docs/features/schema-debt-cleanup/`를 삭제한다.
- [ ] #108을 닫는다. 닫을 때 이슈 본문의 `DeliveryBaseline.recordedAt`이 `TranslationBaseline.recordedAt`의 오기라는 정정 코멘트를 한 줄 남긴다.
