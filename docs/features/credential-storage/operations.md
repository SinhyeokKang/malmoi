# Credential storage 전환·복구 절차

2026-09-10: 로컬 구현과 격리 PostgreSQL 검증 단계다. 공유 dev/prod DB의 credential 전환, 실제 공급자 브라우저 왕복, 배포 URL 차단·drain 검증은 아직 수행하지 않았다. 이 문서는 전환 완료 증거가 아니다.

## dev 병합과 자동 배포 보류 (2026-09-10)

사용자 승인으로 코드 리뷰를 위해 dev에 먼저 통합한다. `vercel.json`의 `git.deploymentEnabled.dev=false`가 dev Git 푸시의 자동 Preview 배포를 보류한다. 기존 Preview와 DB는 그대로이며 수동 배포를 허용한다는 뜻이 아니다. [Vercel 설정 계약](https://vercel.com/docs/project-configuration/git-configuration#gitdeploymentenabled)을 따른다.

아래 차단·키 준비·R1/backfill/R2·실물 검증을 마친 뒤에만 이 dev 항목을 제거해 자동 배포를 재개한다. main 병합은 별도 프로덕션 전환 게이트를 통과해야 한다. 원격 dev에 코드가 있다는 사실을 운영 전환 완료로 읽지 않는다.

## 준비와 차단

1. 기존 sec-audit-2 코드 기준의 R1에는 `20260910050000_add_email_lookup` **additive migration만** 배송한다. credential 런타임 코드는 아직 활성화하지 않는다. 기존 email unique/초대 email 인덱스를 유지한다. dev는 `pnpm exec prisma migrate deploy`, prod는 별도 승인된 `pnpm db:deploy`다. 이 워크트리 전체를 평문 DB에 배포하면 로그인과 개인정보 조회가 실패한다.
2. `.env.example`의 TOKEN·PII·EMAIL_LOOKUP 키를 환경별 독립 난수로 설정하고 접근 제한된 복구 저장소에 보관한다. 키와 DB 백업 쌍을 검증한다. 코드/CLI 인자/로그/공유 문서에 키를 넣지 않는다. 기존 키를 삭제하지 않는다.
3. `pnpm credentials:dev` 또는 prod 전용 `pnpm credentials:prod`로 check-only 실행한다. 사용자·초대·계정·세션 건수와 예정 변경 건수만 출력한다. 중복 App 연결, 정규화 이메일 충돌, 손상/혼합 저장 형식, 알 수 없는 provider 비밀은 쓰기 전에 거부한다. 이 도구는 SQL/DB 예외 원문을 출력하지 않는다.
4. 전환 운영자는 **전체 트래픽 차단과 writer 종료를 실제로 증명**해야 한다. 별칭만 503으로 바꾸지 말고, 모든 이전 Vercel 배포 URL·OAuth callback·cron·CI·로컬 프로세스의 접근을 차단한다. 이미 시작된 함수/refresh/DB 트랜잭션도 끝났는지 확인한다. 차단 중 API/refresh 호출 0과 저장 성공 오응답 부재, 점검 안내·재시도 경험을 관측한다. 현재 이 저장소에는 그 환경 차단을 자동 증명하는 기능이 없다. 수단/증거가 없으면 **중단**한다.
5. 아래 apply 플래그는 운영자가 검증 결과를 확인했다는 명시적 표식이다. 플래그 자체가 트래픽을 막거나 요청 종료를 증명하지 않는다. 동시에 한 운영자만 전환 도구를 실행한다.

## Backfill → R2

차단·drain 후 dev:

```sh
pnpm credentials:dev --apply --traffic-blocked --writers-drained
pnpm credentials:dev --mode=verify
```

prod에서는 명령 이름만 `credentials:prod`로 바꾼다. 도구는 dev/prod 각각 고정 Supabase 프로젝트 ref·5432·DB 이름을 검증한다. DB URL을 CLI 인자로 받지 않으며 URL query는 `sslmode=verify-full`만 허용한다. `DIRECT_URL`/`DIRECT_URL_PROD`의 설정을 사용한다.

모든 User/초대 행(만료·수락 포함)을 암호화하고 검색 인덱스를 채운다. 로그인 토큰은 NULL로, 기존 원문 세션은 삭제하며 신규 digest 세션은 유지한다. 각 행의 암호문·lookup 또는 토큰 쌍을 하나의 CAS 쓰기로 변경한다. ID/FK·초대 tokenHash·role·expires_at은 보존한다. 중간 실패는 차단을 유지한 채 원인을 해결하고 같은 명령으로 재개한다. 이미 검증된 암호문은 다시 암호화하지 않는다.

`verify` 성공 후 **별도 R2 커밋/체크아웃**에서:

```sh
cp -R prisma/credential-cutover/20260910060000_finalize_credential_storage prisma/migrations/
```

⚠️ **R2를 backfill보다 먼저 올리면 backfill이 불가능해진다** (2026-09-10 실측). 전환 도구의 CAS는
아직 안 채워진 행을 `where: { emailLookup: null }`로 집는데, 스키마가 NOT NULL이 되는 순간 Prisma가
그 **입력**을 거부한다(`Argument \`emailLookup\` must not be null.`). 읽기는 관대해서 NULL을 그대로
돌려주므로 조회만으로는 드러나지 않는다 — 막히는 곳은 쓰기다. 그래서 **모든 환경이 backfill을
끝낸 뒤에** R2 스키마를 올린다: dev만 끝난 상태에서 R2를 커밋하면 prod backfill을 못 돈다.
`postgres.integration.ts`가 이것을 잡는다(legacy 픽스처가 NOT NULL에 걸린다) — ⚠️ **그 스위트는
`pnpm test`에 없다**(별도 config + 로컬 PostgreSQL 17). `/push` 게이트가 안 돌리므로
`lib/credentials/**`를 건드렸으면 `pnpm test:credentials:postgres`를 손으로 돌린다.

동일 R2에서 `prisma/schema.prisma`의 두 `emailLookup String?`를 `String`으로 바꾸고 `pnpm db:generate`·타입 검사·테스트를 수행한다. 현재 모델의 nullable은 R1 준비 상태다. 무작위 암호문의 email unique와 초대 옛 email 인덱스는 모델에서 제거돼 있지만 R1 DB에는 남아 있다. R2 finalize 후 모델과 최종 DB가 일치한다. **R1에서 migrate dev로 이 과도 상태의 차이를 자동 정리하지 않는다.**

```sh
pnpm credentials:finalize:dev
pnpm credentials:finalize:dev --apply --traffic-blocked --writers-drained
pnpm credentials:dev --mode=verify
```

prod는 `credentials:finalize:prod`와 `credentials:prod`다. finalize 기본값도 check-only다. 도구는 전건 인증 복호화/lookup 검증, 검토 SQL과 staged SQL 일치, 모든 migration 체크섬·완료 상태를 확인하고 **finalize 하나만 pending**일 때 Prisma deploy를 호출한다. NOT NULL 및 옛 인덱스 제거 SQL은 `prisma/migrations` 밖에 보관돼 R1 deploy가 실행할 수 없다. SQL의 형식 검사는 보조 방어이며 인증 복호화 검증의 대체가 아니다.

마이그레이션 실패 시 `_prisma_migrations`와 실제 DDL을 대조한다. finalize SQL은 명시적 트랜잭션이므로 precondition 실패는 DDL을 반영하지 않는다. 다만 연결 종료/commit 응답 유실 시 결과는 직접 확인해야 한다. 전부 롤백된 것이 확인된 경우에만 검토 후 `migrate resolve --rolled-back <name>`으로 재시도하고, 체크섬 수정·무조건 applied·DB reset으로 통과시키지 않는다.

새 앱만 활성화한 뒤 같은 두 로그인 공급자로 기존 userId/권한 복귀, 기존 쿠키 거부, 세션 갱신·로그아웃, 초대·마스킹·GitHub 조회/refresh/재연결을 확인한다. 전부 통과한 뒤에만 트래픽을 재개한다.

## 회전·복구

각 회전에도 전체 차단·drain이 필요하다. 새 키를 keyring에 추가하고 기존 키를 보존한 채 도구 환경의 active kid를 새 키로 설정한다.

```sh
pnpm credentials:dev --mode=rotate-token --apply --traffic-blocked --writers-drained
pnpm credentials:dev --mode=rotate-pii --apply --traffic-blocked --writers-drained
```

토큰과 PII 회전은 별개다. expires_at과 emailLookup을 바꾸지 않는다. 새 active kid 설정을 앱에 반영하기 전 전건 복호화·`verify` 보고의 `oldTokenKey`·`oldPiiKey`가 각각 0인지 확인한다. 운영 DB뿐 아니라 보존된 백업이 요구하는 키도 폐기하면 안 된다.

검색 키 교체는 개인정보 키를 그대로 유지하고 EMAIL_LOOKUP_KEY/ID만 새 것으로 설정한 뒤 실행한다:

```sh
pnpm credentials:dev --mode=reindex --apply --traffic-blocked --writers-drained
pnpm credentials:dev --mode=verify
```

전 행을 복호화하여 재색인하므로 옛 검색 키가 없어도 가능하다. 부분 교체 상태에서 서비스를 재개하지 않는다. 재실행 뒤 전 행 동일 세대·이메일 중복 없음·NOT NULL 제약을 확인하고 새 키 설정 앱을 활성화한다. PII 키 유실 시 계정을 재생성하지 말고 백업 키를 복원한다. 암호화 백업 복원 후에도 트래픽을 차단한 상태에서 해당 keyring으로 verify 또는 legacy backfill을 끝낸다. 평문 코드로 rollback하지 않는다.

## 재현 가능한 검증

- `pnpm test`: 암호 도구·저장 경계·인가·초대·토큰 refresh 회귀.
- `pnpm typecheck`: 타입 계약.
- `pnpm test:credentials:postgres`: 임시 Unix socket 전용 PostgreSQL 클러스터를 만들고 제거한다. 공유 DB URL을 읽지 않는다. 기본 바이너리는 `/opt/homebrew/opt/postgresql@17/bin`; 다른 환경은 `CREDENTIAL_PG_BIN`에 로컬 PostgreSQL bin 디렉터리를 지정한다. initdb/pg_ctl/pg_dump/psql이 필요하며 테스트용 프로세스가 root이면 실행할 수 없다.
- 격리 테스트는 실제 Auth.js 핸들러와 **가짜** OAuth 응답, 실제 DB unique/잠금/CAS, R1/R2 DDL, 중단·재개·백업 복원을 검사한다. 실제 공급자·배포 차단·키보드/포커스 검증을 대신하지 않는다.
