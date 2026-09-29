# schema-debt-cleanup — 출시 전 감사가 남긴 스키마·죽은 코드 부채 (#108)

출처: [malmoi#108](https://github.com/SinhyeokKang/malmoi/issues/108) — `docs/features/audit-report` B7b의 #65·#87 잔여분(2026-09-25 삭제된 문서, `git show edc962c2^:docs/features/audit-report/tasks.md` 199–212행).
CLAUDE.md "기존 dead code는 언급만 하고 삭제하지 않는다"의 **명시 요청**이 이 이슈다.

**확정 (2026-09-29 사용자)**: `loadKeys`·`KeyRow`·`Cell` 포함 · `lib/credentials/**`의 `id_token` 제거 포함 · 릴리스 둘(patch ×2), 그 사이 다른 스키마 작업 동결 · T0 prod 읽기 조회 승인(실행 완료).

**확정 (2026-09-29 `/feature-review`)**:
- **동결 창**은 B1.2 스키마 수정부터 ② `/merge`까지다. 창 안에서 `pnpm db:migrate`는 쓰지 않는다(이 기능 포함). ②는 ① 프로덕션 확인과 같은 세션에 잇는다.
- **탈출구**: ②가 막히면 스키마에 일곱 항목을 되돌리는 커밋으로 드리프트를 닫는다. DB에 컬럼이 그대로 있으므로 마이그레이션은 필요 없다. ①의 NOT NULL 이완은 그대로 둬도 무해하다.
- **Publish 검증**: INSERT 경로는 dev에서 잰다. 확인 행이 없는 새 표면으로 첫 Publish를 한다. prod는 로그인과 로그 화면만 본다.
- **`test:credentials:postgres`**: `resetSchema`가 ②도 건너뛴다. 그 스위트가 재는 R1→R2 시점에는 `id_token`이 실제로 있었다.

## 사용자

**개발자(나)**. 번역 편집자에게 보이는 변화는 0이어야 한다. 화면·export·push/pull 계약이 한 바이트도 움직이지 않는다.

외부 계약 중 움직이는 것은 하나다. MCP `list_events`의 `actor.kind` 값 집합에서 `UNKNOWN`이 빠진다(`lib/mcp/tools/project.ts:89`). 이 값을 내보낸 적은 0회다(T0: prod·dev 0행).

## 문제 (관측된 사실)

1. **테스트끼리만 쓰는 술어 사본이 셋 남았다.**
   - `isUnpublished`(`lib/keys/view.ts:109`) · `countUnpublished`(`lib/keys/query.ts:185`) — 프로덕션 호출부 0.
     `countUnpublished`는 `countPending`의 한 줄 위임이다.
   - `loadKeys`(`lib/keys/query.ts:100`) — 화면이 부르지 않는다(audit #63). 그런데 통합 테스트 둘이 **이 죽은
     투영을 기준으로** 술어 일치(`list-aggregates.integration.ts` [C9])와 **토큰 원문 비노출**
     (`sync-edit-protection.integration.ts:504`)을 잰다 — 보안 성질을 실제 화면 경로가 아닌 곳에서 재고 있다.
   - 소스 텍스트 가드 둘도 이 죽은 함수의 한 줄을 고정한다: `entry-order.test.ts:157–160`("편집 UI는 key 순") · `view.test.ts:275–279`(`Object.create(null)`).
     실제 편집 UI의 순서는 `lib/keys/translation-list.ts:188`의 raw `ORDER BY`가 정한다.
   - 그래서 `where.ts`·ARCHITECTURE·DESIGN이 "술어가 세 벌/네 벌"이라고 가르치는데 그중 하나가 유령이다.
2. **스키마에 읽는 곳도 쓰는 곳도 없는 것이 남았다.**
   - `ActorKind.UNKNOWN` — 생산자 0(`lib/events/record.ts`에 형만 있고 기록하는 호출 없음). 화면 두 곳이 분기만 든다.
   - `Account.token_type`·`scope`·`id_token`·`session_state` — 로그인 `linkAccount`는 식별자 넷만 쓰고
     (`lib/auth/safe-adapter.ts:60`), `github-app` 연결은 `access_token`·`refresh_token`·`expires_at`만 쓴다
     (`app/api/github/callback/route.ts:184`). `id_token`은 자격증명 도구가 "null이어야 한다"를 검사할 때만 읽는다.
   - `DeliveryConfirmation.confirmedAt`(NOT NULL, 기본값 없음) · `TranslationBaseline.recordedAt` — 쓰기만 하고
     읽는 곳 0(`lib/pull/load.ts:319,352` · `lib/keys/save-key.ts:142`). 스키마 주석이 이미 "시각을 여기 복제하지
     않는다(`syncRun.startedAt`을 읽는다)"고 말한다.
   - `prisma/__tests__/schema-contract.test.ts:65`와 `schema.prisma:697–699` Account 머리 주석이 "OAuth 응답 컬럼이
     하나라도 없으면 `linkAccount`가 던진다"를 고정한다. 그러나 `safePrismaAdapter`가 `linkAccount`를 덮은 뒤로
     (2026-09-10) **이 주장은 거짓이다**.

## 완료 조건

1. `rg -n 'isUnpublished|countUnpublished\b|loadKeys\b|KeyRow\b' lib app components` → 0건(주석·테스트 포함). `countUnpublishedBySurface`는 남는다(번역 랜딩이 쓴다).
2. `list-aggregates.integration.ts`·`sync-edit-protection.integration.ts`의 술어 대조와 토큰 비노출 단언이 **`lib/keys/translation-list.ts`의 목록·상세 출력**을 잰다. 그리고 두 가지가 성립한다.
   - 상세 투영(`translation-list.ts:276` 부근)에 `pendingEditToken`을 임시로 실으면 토큰 비노출 단언이 red이고, 원복하면 green이다(뮤테이션 1회).
   - `pnpm test:projects:postgres`가 green이다.
3. `prisma/schema.prisma`에 `UNKNOWN`·`token_type`·`scope`·`id_token`·`session_state`·`confirmedAt`·`recordedAt`이 없다. Account 스칼라 필드는 여덟이다: 식별자 넷 · 토큰 셋 · `installRequestedAt`.
4. dev·prod 각각에서 컬럼이 실제로 삭제되고 `ActorKind`가 두 값이다.
   - `pnpm db:status` / `pnpm db:status:prod` → up to date
   - `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema='public' AND ((table_name='Account' AND column_name IN ('token_type','scope','id_token','session_state')) OR (table_name='DeliveryConfirmation' AND column_name='confirmedAt') OR (table_name='TranslationBaseline' AND column_name='recordedAt'))` → 0행
   - `SELECT enum_range(NULL::"ActorKind")` → `{USER,AUTOMATION}`
5. 배포 순서와 실측:
   - (a) **순서 조건**: ② 마이그레이션을 prod에 적용하는 시점에 Vercel 프로덕션 배포 커밋이 ① squash SHA이거나 그 이후다. `/merge` ② 1단계에서 확인한다.
   - (b) **① 실측**: dev에서 확인 행이 없는 새 표면으로 첫 Publish(`DeliveryConfirmation` INSERT) 1회 · Save 1회 · GitHub 로그인 1회. `/merge` ① 뒤 prod에서 로그인 1회 + 로그 화면 열기.
   - (c) **② 실측**: dev에서 로그인 · 로그 화면 · Publish · Save 각 1회. `/merge` ② 뒤 prod에서 로그인 1회 + 로그 화면 열기.
6. `pnpm typecheck` · `pnpm test` · `pnpm build` · `pnpm test:projects:postgres` · `pnpm test:credentials:postgres` green. ② 마이그레이션이 들어간 상태에서도 green이어야 한다.
7. 문서가 코드와 맞는다.
   - `rg -n 'isUnpublished|countUnpublished\b|loadKeys|confirmedAt|recordedAt|UNKNOWN' docs/ARCHITECTURE.md docs/DESIGN.md` → 0건. 예외는 태스크 B1.7에 적은 역사 서술 줄뿐이다.
   - ARCHITECTURE §5.1은 Account snake_case 컬럼을 **셋**이라고 쓴다.

## 비목표

- `countUnpublishedBySurface`의 이름 변경·`countPending` 직접 호출로의 치환 — 살아 있는 코드라 외과적 변경 밖이다.
- 목록 raw SQL ⑤ 등 **살아 있는** 손 사본을 `pendingWhere`로 합치는 일 — 사본인 이유(raw 집계)가 그대로다.
- 이슈에 없는 다른 죽은 코드 탐색 — 발견하면 언급만 한다(`/audit` 몫).
- `ProjectEvent`의 과거 행 수정 — 사건은 지우지도 고치지도 않는다(불변식 3의 확장). UNKNOWN 행이 하나라도 있으면 enum 제거를 **중단**한다.
- 이미 적용된 마이그레이션 SQL 수정 — `20260910060000_finalize_credential_storage`는 `"id_token"`을 이름으로 읽는다. 그러나 과거 산출물이고 `scripts/finalize-credentials.ts:20`이 바이트를 비교한다.
- 2단계 스키마 절차 자체의 자동화(`/db` 스킬 개정).

## 위험 (받아들이는 것)

- **② 이후 롤백 하한은 ①이다.** ① 이전 배포로 Vercel Instant Rollback을 하면 로그인이 죽는다. 옛 클라이언트가 Account 전 컬럼을 SELECT하기 때문이다(`lib/credentials/adapter.ts:46`의 `getUserByAccount`, `include: { user: true }`).
