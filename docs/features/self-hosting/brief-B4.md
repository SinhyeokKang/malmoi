# B4 — 배포물 (self-hosting)

공통 규칙: `docs/features/self-hosting/brief-common.md`. B1·B2·B3·B5는 dev에 있다. 계약 사본: `/private/tmp/claude-501/-Users-sinhyeok-code-malmoi/f5cf1603-70aa-4e36-9752-284510968f3e/scratchpad/handoff-B1.md` · `handoff-B2.md` · `handoff-B3.md`(bootstrap 입력·롤 계약·psql 15+).

## 담당 (tasks §4 + SH-15 ②③ 확장 + B1 리뷰 🟡4)
1. **Dockerfile**(비standalone 한 벌, design §5): Node 메이저 = `.nvmrc`, pnpm = `packageManager`(corepack), `.npmrc` COPY, `pnpm install --frozen-lockfile`, env 없이 `pnpm build`, prisma CLI·tsx·`pnpm` 포함(finalize·preflight가 쓴다), **psql 15+ 클라이언트**(bootstrap), non-root 실행. `.dockerignore`: `.env*`·`.git`·`.scratch`·`node_modules`·`.next`·백업. 비밀은 빌드에 들어가지 않는다.
2. **`deploy/compose.yaml`**: proxy(nginx) · postgres:17(포트 publish 금지, 영속 볼륨) · migrate(일회성 — `prisma migrate deploy`를 DB 소유 비-superuser CREATEROLE 롤로, 이어서 bootstrap.sql) · web(`pnpm preflight` 통과 뒤 `next start`, 업로드 볼륨) · scheduler. 순서: `service_healthy`·`service_completed_successfully`. migrate 롤 생성은 postgres 초기화 스크립트(`deploy/` 아래, superuser는 init에만). readiness는 **DB ping만**(design §5) — 공개 route를 새로 만들지 않는다(필요하면 컨테이너 안 스크립트, 판단이 서지 않으면 `ask`). 업그레이드 = migrate 재실행 뒤 같은 digest로 web 재생성.
3. **compose용 env 예제**(`deploy/` 아래): 키는 SH-15 ② 표와 일치(게이트를 compose까지 확장).
4. **nginx 예제**: `proxy_set_header Host $host` · `X-Forwarded-Proto` · HSTS `proxy_hide_header Strict-Transport-Security` 뒤 `add_header … max-age=63072000 always` · `/api/images/`·`/oauth/authorize` IP당 600/60s `limit_req`(OPERATIONS "Vercel WAF rate limit"과 같은 값, 예제를 바꾸면 보호가 사라진다는 주석) · TLS 인증서는 자리표시자.
5. **scheduler**: crond+curl 작은 이미지. 식은 `lib/deployment/schedule.ts`의 `NIGHTLY_PULL`과 같아야 한다(테스트로 대조). `curl -fsS --max-time 300 -H "Authorization: Bearer $CRON_SECRET" http://web:<port>/api/pull`. 스케줄러엔 CRON_SECRET과 내부 목적지만.
6. **SH-15 게이트 확장**(`lib/deployment/__tests__/self-hosted-gates.test.ts`): ③ Dockerfile Node 메이저 == `.nvmrc`, pnpm == `packageManager`, `.npmrc` COPY 존재 · ② compose env 키 대조 · **B1 리뷰 🟡4**: 비테스트 소스의 `process.env.<NAME>` 직접 읽기를 파일별 허용 목록으로 세고, Auth.js provider에서 파생되는 `AUTH_<PROVIDER>_{ID,SECRET}`가 표에 있는지 단언.

## Docker가 이 머신에 아직 없다
- 위 1~6은 Docker 없이 쓰고 [자동] 게이트를 통과시킨다.
- [수동] 검증(이미지 build·linux/amd64 실행·sharp 업로드·정적 자산 200·layer에 비밀 없음·HSTS 하나·429·기동 순서·재생성 유지·DB 포트 비공개·스케줄러 호출·이중 실행)은 **`command -v docker`가 성공하면 직접 하고, 아니면 인계 문서 "런타임 검증 목록"에 명령 그대로 남긴다**(B7이 받는다). 미실행을 통과로 적지 않는다.

## 소유 파일
`Dockerfile` · `.dockerignore` · `deploy/**`(`bootstrap.sql`은 수정 필요 시 `ask`) · `lib/deployment/__tests__/self-hosted-gates.test.ts`. 그 밖은 `ask`. 문서는 B6.
