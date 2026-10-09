# B5 — 공개 화면 (self-hosting)

공통 규칙: `docs/features/self-hosting/brief-common.md`를 먼저 읽는다. B1(`lib/deployment/` — `deploymentMode()`는 import 없는 잎이라 middleware에서 써도 된다)이 dev에 있다.

## 담당 (tasks §5 + tasks §1에서 넘어온 공개 응답 정책)
1. **공개 응답 정책 순수 함수**(design §9 "공개 응답 정책" 행): hosted 무변경, self-hosted → 페이지 `X-Robots-Tag: noindex`, `/sitemap.xml`·`/llms.txt`·`/llms-full.txt` 404, Analytics 제외. 테스트 먼저.
2. `middleware.ts`에 self-hosted 분기 연결. ⚠️ **middleware의 기존 `process.env.VERCEL_ENV` 읽기(CSP)는 건드리지 않는다** — SH-15 ① 허용 목록 행이 바뀌면 B2와 충돌한다. 모드 판정은 `deploymentMode()`를 import해 쓴다. 허용 목록 수정이 꼭 필요하면 `ask`.
3. Analytics 제외는 **서버 레이아웃 `app/layout.tsx`**에서 판정(design §7 — 클라이언트에선 env가 없다), 위치를 고정하는 테스트.
4. `app/privacy/page.tsx`: self-hosted면 `MALMOI_PRIVACY_URL`로 임시 redirect(순환 방지는 preflight가 이미 거부 — page는 판정만). hosted 렌더 불변.
5. `/signin`(`app/signin/page.tsx`)·`/oauth/authorize`(`app/oauth/authorize/page.tsx`) 동의문 링크: self-hosted에서 새 탭(`target="_blank"` + `rel`). 테스트로 단언.
6. **사전**: `consent`(before/link/after) 문구를 두 배포에서 참이 되게, App 호칭을 **두 배포 공통** 처음 "the GitHub App" → 이어서 "the app"(design §7 위치 목록 — en 11·ko 10·es 11 + `confirmDisconnect` 변형, 줄 번호는 다시 센다). `/translate` 모드 ①. **같은 배치에서** `docs/DESIGN.md` §10.1 App 호칭 행 · `lib/i18n/__tests__/helpers/banned-terms.ts:34,91` · `lib/i18n/__tests__/terminology.test.ts:323` · `components/__tests__/new-project.test.tsx:1247`. DESIGN 수정은 별도 `docs(DESIGN):` 커밋.
   - 가이드 원고(`guide/**`)의 같은 호칭은 **B6 소유** — 건드리지 않는다. 바뀐 낱말을 인계 문서에 표로 남겨 B6가 따르게 한다.

## 건드리지 않는 것
B2 소유: `lib/upload/**`·`app/api/images/**`·`lib/invitation-email/**`·`lib/oauth/**`·`app/.well-known/**`·`lib/mcp/http.ts`·`scripts/preflight.ts`·`package.json`. `lib/deployment/**`(B1 — 수정이 필요하면 `ask`). 문서(B6, DESIGN §10.1 한 행 예외). Docker(B4).

검증은 tasks §5 각 "검증:" 줄. 커밋 제목 제안: `feat(self-hosting): adapt public instance metadata`(테스트 커밋 먼저).
