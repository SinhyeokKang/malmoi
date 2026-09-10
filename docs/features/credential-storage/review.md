# Credential storage + 전체 세션 회수 리뷰 범위

기준: `ff5e8a45ecf7f3b83914c904ac2e520e5ee8e3aa` (기존 sec-audit-2 반영 완료 dev).
구현 끝: `26bfb26` (`feat(security): protect stored credentials and revoke all sessions`).

```sh
git diff --stat ff5e8a4..26bfb26
git diff ff5e8a4..26bfb26
```

그 뒤 배송 커밋에는 `vercel.json`의 **dev 자동 Preview 배포 보류**와 이 리뷰/운영 기록만 들어간다. 최종 병합 SHA까지 포함한 범위는 인계 메시지의 고정 범위를 사용한다. 전체가 기존 sec-audit-2 재리뷰는 아니며 #37 repo admin 요구는 사용자 결정으로 제외됐다.

## Claude Code 전달문

credential-storage와 sec-audit-2 #38(session-revocation)을 보안 중심으로 리뷰해 주세요. 위 고정 범위의 diff와 관련 스펙/설계/operations.md를 읽고, 구체적인 실패 입력·경합 순서·영향·파일 위치를 포함한 발견만 보고해 주세요. 아직 키/공유 DB 전환·실제 OAuth 검증은 하지 않았으므로 코드 병합을 배포 완료로 읽지 마세요.

우선 검토할 경계:

1. `lib/credentials/{crypto,storage,records,adapter,access}.ts`: AES-256-GCM nonce/AAD/키 분리, 세션 digest 재사용 거부, email lookup 소유권 대조, 손상/키 오류의 fail-closed, 추가 로그인 계정 금지 보존.
2. `lib/github-connect/token-store.ts`, `app/api/github/callback/route.ts`: 외부 일회용 코드/refresh 소비 전 쓰기 키 검증, 토큰 쌍 원자성, 암호문 CAS·소유자 변경·disconnect 경합, 비밀 로그 차단.
3. User·멤버·초대·SyncRun 조회와 Action: 평문/암호문/lookup의 응답 경계, 타인 이메일 마스킹, 인가·초대 만료/취소 경합, 장애를 빈 목록·비로그인으로 숨기는지.
4. `lib/credentials/{conversion,migration,command,finalize}.ts`, `scripts/credentials.ts`, `scripts/finalize-credentials.ts`, Prisma: R1 additive-only, R2 전건 검증·체크섬·실제 DDL, 대상 DB 제한, 부분 실패·재실행·키 회전/재색인·복구. `--traffic-blocked --writers-drained`는 차단 기능이 아니라 운영자 확인 표식이다.
5. `lib/session-revocation/**`, `auth.ts`, account Action/UI: 동일 providerAccountId·세션·state·nonce 결합, User 잠금·일회 소비·전체 세션 삭제의 원자성, 다른 사용자 보존. nonce 만료 또는 요청 교체/소비 후에도 별도 Auth.js state 쿠키/salt가 일반 로그인 전환을 막는지. 성공 callback 후 새 세션이 생기지 않는지, 루트/초대 정상 로그인·취소·프록시 HTTPS 회귀.
6. `vercel.json`과 운영 절차: dev 자동 배포 보류를 키/DB 전환 전에 해제하지 않도록 기록됐는지. main은 별도 운영 전환 게이트 대상이다.

테스트 근거: 일반 2,536개, 설치 Auth.js+격리 PostgreSQL 32개 통과. 후자는 가짜 OAuth 공급자 응답을 쓰며 실제 GitHub/Google OIDC·브라우저·배포 차단 증명을 대체하지 않는다. 로컬 production build도 병합 준비 단계에서 통과했다.
