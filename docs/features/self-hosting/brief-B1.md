# B1 — 배포 정책 (self-hosting)

공통 규칙: `docs/features/self-hosting/brief-common.md`를 먼저 읽는다.

## 0단계 — middleware 런타임 env 실측 (코드 커밋 없음, 가장 먼저)
design §2 "착수 전 실측". 임시로 `middleware.ts`가 `process.env.MALMOI_PROBE`를 응답 헤더(`x-probe`)에 싣게 하고 `pnpm build` 한 번 → `MALMOI_PROBE=a pnpm start -p 3101`과 `MALMOI_PROBE=b pnpm start -p 3102`로 두 번 띄워 `curl -sI`로 헤더를 비교한다(DB 없이 공개 페이지 `/docs`면 충분). 끝나면 임시 변경을 `git checkout`으로 되돌린다.
- 두 값이 다르면(런타임 읽기) 1단계로 진행. 결과를 인계 문서에 기록.
- **같으면(빌드 인라인) 즉시 `ask`로 보고하고 멈춘다** — 설계가 다시 열린다.

## 1단계 — 담당 태스크 (tasks §1, 아래 두 항목 제외)
제외: credential target 파서(B3 소유) · 공개 응답 정책(noindex·sitemap/llms 404·Analytics — B5 소유).

1. `lib/deployment/`(신설) — import 없는 잎 모듈: `MALMOI_ORIGIN`·`VERCEL_ENV`의 유일한 reader, 빈 문자열·공백=미설정, `VERCEL_ENV` 동시 존재·형식 밖 → 무효(fail-closed), hosted 도메인 리터럴(`https://mal-moi.com`·`https://dev.mal-moi.com`)의 유일한 집. origin 파서(design §2 경계, IPv6·IDN 거절). preflight 순수 판정(design §9 두 번째 행 — Resend는 누락·형식만, `INVITATION_EMAIL_ORIGIN` 존재 거부, PRIVACY_URL 순환 변형, 업로드 디렉터리 상대·부재) — **기동 진입 스크립트는 B2**.
2. hosted 리터럴 집결: `lib/seo/site.ts`(`SITE_ORIGIN`) · `lib/onboarding/workflow.ts`(`PRODUCTION_ORIGIN`) · `lib/invitation-email/config.ts`(`expectedOrigin`의 리터럴) · `lib/invitation-email/message.ts:21,23,28` · `app/(edit)/mcp/page.tsx:50` fallback이 그 상수를 import. **동작은 hosted에서 바이트 동일.** 메일 config의 배포 모드 판정 교체·로그는 B2.
3. `requestOrigin`(`lib/github-connect/origin.ts`) self-hosted 분기: 설정 호스트 정확 일치 · `LOCAL_HOST` off · forwarded-proto 무시. 호출부 무수정.
4. `workflowApiUrl`: self-hosted면 `api-url` 항상, 무효면 렌더 거부(호출부가 그 실패를 어떻게 다루는지 확인 — 호출부 수정이 필요하면 `ask`).
5. `.env.example`에 신규 변수 셋(필수/선택·한 줄 주석). `brand-spelling.test.ts`의 `UPPER_EXCEPTIONS`에 셋 등록.
6. 스케줄러 cron 상수 == `vercel.json` 테스트(상수는 `lib/deployment/`에).
7. SH-15 ① 허용 목록 게이트, ② `lib/env.ts`가 읽는 env 이름 ↔ preflight 표 ↔ `.env.example`(compose는 B4가 확장).
8. tasks §1 끝의 "수정 없이 green이어야 할 hosted 정확 단언" 목록이 **수정 없이** green(생성기 태그 단언은 이미 v3).

검증은 tasks §1의 각 "검증:" 줄. 커밋 제목 제안: `feat(self-hosting): define deployment policies`(테스트 커밋 먼저).
