# schema-debt-cleanup — 설계

## 영향 받는 흐름

- **편집 UI**: 없음(표시 변화 0). 로그 행위자 라벨의 `UNKNOWN` 분기(`components/logs/event-row.tsx:113` · `event-detail.tsx:241`)만 사라진다.
  분기를 지우면 형이 `USER | AUTOMATION`으로 좁혀지고, 옛 UNKNOWN 자리는 `USER` 갈래로 떨어진다(`removed` → `name` → `emailLabel` → `Removed user`).
  그래도 그 갈래로 떨어질 행이 없다(T0 0행 · 생산자 0). 읽을 수 없는 payload의 표시는 이 분기와 무관하다 — `valueState`·`m.logs.value.unavailable`이 든다.
  `m.common.unreadable`은 다른 소비자가 여섯 곳 이상이라 남는다(`lib/auth/query.ts` · `lib/events/query.ts` · `member-label.ts` · `view.ts` · `log-filters.tsx`).
- **MCP**: `list_events`의 `actor.kind`(`lib/mcp/tools/project.ts:89`)는 값을 그대로 넘긴다. 값 집합에서 `UNKNOWN`이 빠지지만 내보낸 적은 0회다.
- **pull**: `DeliveryConfirmation`·`TranslationBaseline` 쓰기에서 필드가 하나씩 빠진다(`lib/pull/load.ts`). export 입력은 불변이다.
- **Save**: `lib/keys/save-key.ts:142`의 baseline `update`에서 `recordedAt` 한 필드가 빠진다.
- **로그인·계정 연결**: Account 스키마에서 네 컬럼이 빠진다. 쓰는 자리가 0이라 코드 경로는 그대로다. 로그인 조회는 `@auth/prisma-adapter`가 직접 하지 않는다. `lib/credentials/adapter.ts:46`의 override(`getUserByAccount`, `include: { user: true }`)가 한다.
- **자격증명 도구**(`lib/credentials/migration.ts`·`conversion.ts`)와 격리 PG 스위트(`lib/credentials/__tests__/postgres.integration.ts`): `id_token` 검사·조건·픽스처가 빠진다. `scripts/credentials.ts`에는 `id_token`이 0건이다.
- push: 없음.

## 두 덩어리이고, 배포 단위가 다르다

### A. 죽은 코드 (코드만, 1차 릴리스에 같이 탄다)

| 지우는 것 | 이유 | 대체 |
|---|---|---|
| `loadKeys` (`lib/keys/query.ts:100`) | 화면 호출 0(audit #63) | 없음 |
| `isUnpublished` (`view.ts:109`) · `countUnpublished` (`query.ts:185`) | 테스트만 쓴다 | 테스트는 `countPending`(`lib/protection/where.ts`, `server-only` 아님)을 직접 import한다 |
| `KeyRow` · `Cell` (`view.ts`) | `loadKeys`의 반환형 — **내 변경이 만든 고아** | 없음. `KeyRefRow`는 `buildPermalink`가 써서 남는다. `actor.test.ts:6,17`의 `KeyRow` 픽스처 형과 쓰이지 않는 `row()` 헬퍼도 같이 정리한다 |
| `queries.test.ts` "isUnpublished ↔ countUnpublished" 블록 · `countUnpublished` describe | 대상이 사라진다 | **옮긴다.** `pnpm test` 층에서 orphan·테넌트 제외를 **세는** 곳은 `queries.test.ts:50–80` 하나뿐이다(하네스 count `harness.ts:1249–1270`). import만 `countPending`으로 바꾼다 |
| `view.test.ts` isUnpublished describe · `:275–279` `Object.create(null)` 가드 | 대상이 사라진다. 가드는 `loadKeys`의 한 줄을 소스로 고정한다 | 삭제. pull 쪽 생산자(`lib/pull/load.ts:133`)는 `Object.fromEntries`라 이미 안전하다. `lib/pull/render.ts:45` 주석의 "대입 쪽 짝" 지목을 고친다 |
| `entry-order.test.ts:157–160` "편집 UI(`lib/keys/query.ts`)는 key 순" | `orderBy: { key: "asc" }`가 `loadKeys`에만 있다 | **`translation-list.ts:188`의 raw `ORDER BY`로 옮긴다.** 실제 정렬이 `"rank", "surfaceSlug", "sidx", "key" COLLATE "C"`이므로 제목을 "같은 순위·표면 안에서 key 순"으로 바꾼다 |
| `home-screen.test.ts:66–70`(`countUnpublished` 단언, "번역 화면 툴바의 것" 주석은 거짓) · `:95` "`loadKeys`를 부르지 않는다" | 심볼이 없으면 무의미한 단언 | `:66–70`은 `countPending\|countUnpublishedBySurface`를 겨누게 바꾼다. `:95`는 삭제한다 |

**통합 테스트 재작성이 이 덩어리의 본체다.** 두 곳이 죽은 투영을 잰다:

- `list-aggregates.integration.ts` [C9] — 이미 있는 `pendingViaTranslationList`로 바꾼다(키 단위 `hasPending` + 상세 셀 `pending`). 대조 대상은 `countPending`이다. **셀 수 = `countPending`**, 키 수 = 목록 `bool_or`.
- `list-aggregates.integration.ts:75–86` **보관 표면** — 그대로 교체하면 공허해진다. 새 경로는 보관 표면에서 `loadTranslationList`가 `rows: []`(`translation-list.ts:116,122`)를, `loadTranslationDetail`이 `absent`(`:254`)를 돌려준다. 그래서 `pendingVia`가 항상 `{0,0}`이 되고, 비공허 가드(`cells.length > 0`)가 사라진다.
  → **쌍으로 바꾼다.** 같은 픽스처로 보관 **전**에 `pendingVia = countPending > 0`을 재고, 보관 **후**에 둘 다 0임을 잰다. 셀의 `surfaceArchivedAt` 투영은 더 없으므로 제목 "보관 시각을 실제 쿼리가 생산한다"를 바꾼다.
- `sync-edit-protection.integration.ts:485` [C9] — 같은 교체다.
- `sync-edit-protection.integration.ts:504` **토큰 원문 비노출** — `loadTranslationList` + `loadTranslationDetail` 출력의 `JSON.stringify`로 옮긴다. RSC 페이로드로 실제 나가는 것이 이 둘이다. 페이지·Load more·MCP `list_keys`·`get_key`도 전부 이 두 함수를 지나므로 경계 하나로 덮인다.
  - ⚠️ 옮기기 **전에** 두 출력에 토큰이 없다는 걸 red로 먼저 확인할 수는 없다(원래 없다). 그래서 뮤테이션 한 번으로 단언이 살아 있는지 잰다. 상세 투영(`translation-list.ts:276`)에 `pendingEditToken`을 임시로 실어 red를 확인하고 원복한다. POSTMORTEM 2026-09-14 "방어선 셋을 세웠는데 셋 다 지워도 green이었다"의 재발 방지다.
  - 목록 쪽(`:194–198`)은 필드를 명시해 매핑하므로 따로 뮤테이션하지 않는다.

순수 함수 신규는 없다. 삭제와 테스트 대상 교체뿐이라 `/tdd interface` 몫이 없다. 테스트 우선 원칙은 "교체한 단언이 red를 낼 수 있음을 뮤테이션으로 확인"으로 지킨다.

### B. 스키마 (destructive — 릴리스 둘)

**왜 둘인가**: `/merge` 1단계가 prod `db:deploy`를 **코드 배포보다 먼저** 돌린다(`merge.md:26–38`). 그 사이 옛 코드의 Prisma 클라이언트는 `select` 없는 조회에서 **스키마의 모든 스칼라 컬럼을 명시해 SELECT**한다. 그래서 컬럼이 먼저 사라지면 `lib/credentials/adapter.ts:46`의 `getUserByAccount`(`include: { user: true }`, Account 전 컬럼) 같은 자리가 `column does not exist`로 **로그인을 죽인다.** 또 `confirmedAt`은 NOT NULL·기본값 없음이라, 쓰기를 먼저 지운 코드는 컬럼이 살아 있는 동안 INSERT가 실패한다.

| 단계 | 스키마(`schema.prisma`) | 마이그레이션 | 코드 | 릴리스 |
|---|---|---|---|---|
| **1 (expand 쪽 이완)** | 일곱 항목 전부 **삭제** — 클라이언트가 그 컬럼을 모르게 한다 | **손으로 쓴 한 줄**: `ALTER TABLE "DeliveryConfirmation" ALTER COLUMN "confirmedAt" DROP NOT NULL;` (additive — 제약 이완) | A 전부 + 쓰기·분기 제거 | `/merge` ① (patch) |
| **2 (contract)** | 변경 없음 | `migrate diff --from-config-datasource --to-schema`가 내는 DROP COLUMN ×6 + `ActorKind` 재생성 | `postgres.integration.ts`의 `resetSchema`가 ②를 건너뛴다(아래) | `/merge` ② (patch) — **①이 프로덕션에 뜬 뒤에만** |

- **1단계에서 DB에 남는 컬럼은 전부 nullable이거나 기본값이 있다.** `recordedAt`은 `DEFAULT CURRENT_TIMESTAMP`, Account 넷은 nullable, `confirmedAt`은 위 마이그레이션이 이완한다. 그래서 1단계 코드가 그 컬럼을 모른 채 INSERT해도 성공한다. `upsert`의 UPDATE 갈래는 기존 값을 그대로 두므로 이완과 무관하다. INSERT 갈래는 **확인 행이 없는 표면의 첫 Publish**에서만 탄다(키 `projectId+surfaceId`).
- **enum 값 삭제는 2단계에 둔다.** 1단계 클라이언트는 `UNKNOWN`을 모르므로 그 값의 행을 읽으면 **던질 수 있다**(Prisma 7 + adapter에서 실측한 적은 없다). 그래서 **T0 사전 조회에서 prod·dev 0행**이 전제이고, 생산자가 없으니 0행은 유지된다.
- **Postgres에는 enum 값 DROP이 없다.** 그래서 Prisma는 자체 `BEGIN … COMMIT` 블록을 낸다: `CREATE TYPE "ActorKind_new"` → `ALTER TABLE … ALTER COLUMN "actorKind" TYPE … USING ("actorKind"::text::"ActorKind_new")` → `ALTER TYPE "ActorKind" RENAME TO "ActorKind_old"` → `ALTER TYPE "ActorKind_new" RENAME TO "ActorKind"` → `DROP TYPE "ActorKind_old"`.
  - **가드는 T0의 0행이다.** 캐스트 실패는 보조 그물일 뿐이다. 같은 파일의 DROP COLUMN까지 함께 롤백되는지는 실측하지 않았다.
  - `actorKind`에는 DEFAULT가 없고 이 열을 참조하는 CHECK·트리거·뷰도 0건이라, 이 밖의 문장은 나오지 않는다. 인덱스 `ProjectEvent_projectId_actorKind_actorUserId_idx`는 재구축되지만 행 수가 작다(T0: prod 42 · dev 753).
- ⚠️ **1·2단계 사이에는 "의도된 드리프트"가 있다** — 스키마엔 없고 DB엔 있는 컬럼이다. 이것은 **B1.2 스키마 수정 순간부터** 생긴다.
  - 그동안 `pnpm db:migrate`(`--create-only` 포함)나 `/db` 4c의 `migrate diff`를 돌리면 이 DROP이 그 마이그레이션에 섞인다.
  - 그래서 **동결 창을 B1.2부터 ② `/merge`까지로 둔다.** 창 안에서 `db:migrate`는 이 기능도 쓰지 않는다. 마이그레이션은 전부 `db.md` 4c(손 SQL + `pnpm exec prisma migrate deploy`)로만 만든다. `/db` 5단계 SQL 검토가 마지막 그물이다.
  - **판정**: ② 머지 전에 `git diff v<①>..origin/dev --stat -- prisma/`의 결과가 ② 디렉터리 하나뿐이어야 한다.
  - **탈출구**: ②가 막히면 스키마에 일곱 항목을 되돌리는 커밋으로 드리프트를 닫는다. 마이그레이션은 필요 없다.
- ⚠️ **①과 ②를 같은 `/merge`에 싣지 않는다.** 같이 실리면 `db:deploy`가 두 마이그레이션을 코드보다 먼저 적용해 위의 창이 그대로 열린다. 그래서 **② 마이그레이션은 ① `/merge`가 끝난 뒤에 만든다.** dev에 먼저 올리면 ① squash에 딸려간다.
- ⚠️ **dev에 ②를 적용하기 전에 dev DB를 공유하는 다른 체크아웃을 확인한다.** 다른 머신이나 main 체크아웃의 QA 워커가 대상이다. 각각 ① 이후 커밋 + `pnpm db:generate` + dev 서버 재시작을 마쳐야 한다. 낡은 클라이언트는 ② 적용 순간 `getUserByAccount`에서 로그인이 죽는다(POSTMORTEM 2026-09-14).
- ⚠️ **② 이후 롤백 하한은 ①이다.** ① 이전 배포로 Vercel Instant Rollback을 하면 같은 이유로 로그인이 죽는다.
- `db:status`(`migrate status`)는 히스토리만 보므로 이 드리프트를 red로 내지 않는다. 그래서 `/push`·`/merge` 게이트가 1단계에서 막히지 않는다. CI도 DB에 닿지 않는다.
- ②는 `schema.prisma` diff가 0이라 `/db` 2단계 분류에 걸리지 않는다. **4c 경로를 직접 타고, 분류는 1단계의 연속(destructive contract)으로 둔다.**

**`test:credentials:postgres`와 ②**: `resetSchema`(`postgres.integration.ts:46–50`)는 finalize(`20260910060000_finalize_credential_storage`)만 빼고 전 마이그레이션을 적용한다. 그 뒤 테스트가 finalize SQL을 따로 돌리는데, 그 SQL이 `"id_token"`을 읽는다(`:10–11`). ②가 적용된 상태에서는 `column does not exist`가 나고 R2 테스트와 실제 deploy 테스트가 red가 된다. finalize 파일은 과거 산출물이고 바이트 비교 대상이라 고칠 수 없다.
→ **`resetSchema`가 `FINALIZE_MIGRATION`처럼 `drop_unused_audit_columns`도 건너뛴다.** 이 스위트가 재는 R1→R2 시점에는 `id_token`이 실제로 있었으므로 출발점이 사실과 맞다. 건너뛰는 이유는 머리 주석에 적는다.

**안 쓴 대안**: 스키마에 컬럼을 두고 Prisma 전역 `omit`으로 SELECT에서 빼는 방법이 있다. 드리프트는 없지만 `lib/db.ts`에 설정이 늘고 2단계에서 다시 걷어야 한다. 드리프트 창을 짧게 두는 쪽이 코드가 적다.

## 순수 함수로 분리 가능한 부분

- `lib/credentials/migration.ts`의 `migrateAccountFields`(행 → 패치 판정) — `id_token` 인자와 `id_token !== null` 거부 갈래가 빠진다. 기존 단위 테스트(`migration.test.ts`·`conversion.test.ts`)를 먼저 고친다(red → 구현).
- `lib/events/payload.ts`의 `ACTOR_KINDS` · `readPayload`/`view.ts` 행위자 매핑 — 형에서 `UNKNOWN`이 빠지면 typecheck가 소비자를 전부 가리킨다(`lib/events/query.ts:13,42,194` 포함).
  - 단, `query.ts:194`의 `kind: row.actorKind`는 **생성된** Prisma 타입이다. 그래서 스키마 삭제와 `pnpm db:generate`가 먼저여야 typecheck가 green이 된다.
  - 테스트는 `lib/events/__tests__/`의 UNKNOWN 사례를 지운다. "AUTOMATION과 구별된다"는 USER-removed 단언만 남긴다. `query.integration.ts:85,342–347`의 UNKNOWN 행 INSERT도 지운다(②가 붙으면 INSERT 자체가 실패한다).
- `prisma/__tests__/schema-contract.test.ts` — 두 곳을 **교체**한다.
  - `:65` Account 단언: **"식별자 넷(`userId`·`type`·`provider`·`providerAccountId`) + github-app 토큰 셋(`access_token`·`refresh_token`·`expires_at`) + `installRequestedAt`이 있고, 네 컬럼은 없다"**로 바꾸고 거짓이 된 제목을 고친다.
  - `:208` `ActorKind`: `toEqual(["USER","AUTOMATION"])`로 바꾼다.
  - 여기에 `confirmedAt`/`recordedAt` 부재 단언을 더한다. 스키마 텍스트를 읽는 순수 테스트라 스키마 수정 전에 red로 박을 수 있다.

## 스키마 변경

destructive — 위 표대로 **2단계**다. 마이그레이션 이름: ① `relax_delivery_confirmation_confirmed_at` ② `drop_unused_audit_columns`.

## 새 환경변수

없음.

## 불변식 영향

- **export 결정성·blob SHA**: 없음 — 지우는 컬럼 중 export 입력에 드는 것이 없다(`restoreValue`·`revision`은 남는다).
- **"병합 없음"**: 없음.
- **사건 불변(지우지 않는다)**: `UNKNOWN` 행이 0일 때만 enum을 줄이므로 기존 사건은 한 행도 바뀌지 않는다. 행이 있으면 중단한다(비목표).
- **인증 경계(ARCHITECTURE §6)**: Account에서 **안 쓰는 토큰 칸**이 사라져 유출 면이 줄 뿐이다. 로그인·연결·세션 경로는 불변이다. 자격증명 셋의 분리(`credential-separation.test.ts`)는 건드리지 않는다.
- **개인정보 방침**: `lib/privacy/collected.ts`에서 `Account.token_type`·`scope`·`id_token`·`session_state`(전부 `NOT_PERSONAL`) 행을 지운다. `/privacy` 본문은 그 칸을 언급하지 않으므로 개정 이력이 필요 없다. B1.5에서 본문 grep으로 확인한다.
- **Supabase USAGE 회수**: 새 테이블이 없어 영향이 없다. 단 `/db` 5단계 규칙대로 두 마이그레이션 뒤 dev·prod `has_schema_privilege` false를 재확인한다. Prisma의 `CREATE TYPE`이 새 타입을 만들지만, 타입 권한은 스키마 USAGE가 막는다.

## POSTMORTEM 인용

- **2026-09-14 낡은 Prisma 클라이언트가 로그인만 죽였다** — 스키마 수정 직후 `pnpm db:generate`를 하고, 마이그레이션 적용 뒤 **dev 서버를 재시작**하도록 태스크에 넣는다. 로그인 콜백은 드물게 도는 경로라 `pnpm test`가 못 보는데, 컬럼 삭제가 정확히 그 경로(`getUserByAccount`)를 친다. 그래서 완료 조건 5가 로그인을 명시한다. dev ② 적용 전에는 다른 체크아웃도 확인한다(위).
- **2026-09-14 컬럼을 뗀 마이그레이션이 스모크를 죽였고, typecheck가 `select`를 안 본다** — 지울 필드의 이름 전수 검색을 typecheck로 대신하지 않는다(아래 grep).
- **2026-09-14 방어선 셋을 세웠는데 셋 다 지워도 green이었다** — 옮긴 토큰 비노출 단언이 살아 있는지 뮤테이션으로 잰다. 보관 표면 단언도 새 경로에서 공허해지지 않게 쌍으로 만든다.
- **2026-09-15 컬럼을 더하며 쓰는 자리를 전수로 안 세서** — 반대 방향도 같다. 지울 필드의 쓰기 자리를 grep으로 전수 센다(`rg -n '(^|[^A-Za-z])(confirmedAt|recordedAt|id_token|token_type|session_state|scope)\s*:' lib app scripts components`). typecheck가 못 보는 raw SQL(`delivery-baseline-fk.integration.ts:55`의 INSERT, finalize SQL)은 따로 본다.
- **audit #63 (POSTMORTEM 2026-09-15 재발)** — 죽은 `loadKeys`를 재던 테스트가 "술어가 같다"를 증명한다고 믿게 했다. 이번 변경이 그 재발의 원인을 없앤다.
