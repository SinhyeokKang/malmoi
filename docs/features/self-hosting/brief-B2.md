# B2 — 서버 경계 (self-hosting)

공통 규칙: `docs/features/self-hosting/brief-common.md`를 먼저 읽는다. B1(배포 모드 `lib/deployment/`, `requestOrigin`, `workflowApiUrl`, preflight 순수 판정)과 B3(bootstrap·credentials)는 dev에 있다.
B1 인계(계약): `/private/tmp/claude-501/-Users-sinhyeok-code-malmoi/f5cf1603-70aa-4e36-9752-284510968f3e/scratchpad/handoff-B1.md`.

## 담당 (tasks §2 + 아래 추가)
1. **삭제 계획 둘(tasks §1에서 넘어온 항목 — B1이 하지 않았다)**: `planImageDelete`·`planProjectImageDelete`가 `/api/images/<key>` 형태도 키로 인식. `imageSrc`·`isStoredImageKey`는 바꾸지 않는다(design §3). `image.test.ts`·`project-image.test.ts`에 상대 경로 사례.
2. **파일 저장 구현**(design §3): hosted Blob / self-hosted 파일 볼륨을 배포 모드로 고른다. 실제 소비 필드만 정의한 작은 경계 — provider 등록 API 금지. `listImages`는 hosted 전용. PII 활성 키 검증을 쓰기보다 먼저, 임시 파일 난수 이름 + rename, 볼륨 루트 realpath 포함 검사, 업로드 디렉터리 자체 symlink 탈출 거절, 읽기 reject → catch 안 404. 테스트는 tasks §2 두 번째 항목 목록 전부(`mkdtempSync`·`symlinkSync` 선례 `lib/cli/__tests__/walk.test.ts`).
3. 기존 이미지 route 둘(`app/api/images/[...key]`·`email/[...key]`)이 저장 경계로 읽는다. 새 route 없음. 무헤더 읽기 유지(POSTMORTEM 2026-09-28).
4. **초대 메일**: `config.ts`의 `VERCEL_ENV` 판정을 배포 모드로 — self-hosted는 `MALMOI_ORIGIN`에서 파생(design §2 표). `unavailable` 사유와 발송 거부를 서버 로그에(비밀 없음, `send.ts:65`). UI 문구 불변. hosted 기존 판정·`config.test.ts:102-106` 수정 없이 green.
5. **preflight 기동 진입**: `scripts/preflight.ts`(tsx 실행 — `@/` 별칭 때문, B1 인계) — B1의 순수 `preflight(env, probeUploadDir)`에 실제 디렉터리 probe를 넘기고, 실패면 사유 코드만 찍고 exit 1(값 없음). `package.json`에 스크립트 한 줄(`preflight`). 컨테이너 연결은 B4.
6. 위조 헤더: `app/__tests__/well-known.test.ts`에 self-hosted 위조 Host·X-Forwarded-* 사례, `checkOrigin`(`lib/mcp/http.ts:10`)이 다른 Origin 거절 테스트. 판정 로직이 이미 B1로 닫혔으면 테스트만.
7. `prisma/schema.prisma:22` 주석(공개 Blob URL → 두 형태). 주석만이라 마이그레이션 없음.

## 허가된 공유 파일 편집
- `lib/deployment/__tests__/self-hosted-gates.test.ts`의 `ALLOWED` 행 중 **`lib/invitation-email/*` 행만** — 메일 판정을 바꾸며 개수가 바뀌면 같은 커밋에서 고친다. 다른 행은 건드리지 않는다(B5가 병렬로 돈다).
- `package.json`의 `scripts`에 `preflight` 한 줄.

## 건드리지 않는 것
B5 소유: `middleware.ts`·`app/layout.tsx`·`app/privacy/`·`app/signin/`·`app/oauth/authorize/`·`messages/*`·DESIGN·i18n 테스트. 문서(B6). Docker·compose(B4).

검증은 tasks §2 각 "검증:" 줄. 커밋 제목 제안: `feat(self-hosting): wire instance services`(테스트 커밋 먼저).
