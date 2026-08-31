# TASKS

**`docs/MVP.md` §8 구현 순서를 완료 조건이 붙은 체크리스트로 펼친 것이다.** 여기엔 *무엇이 되면 끝인가*만 있다 — 무엇을 만드는지는 [MVP.md](./MVP.md), 왜 그렇게 만드는지는 [ARCHITECTURE.md](./ARCHITECTURE.md).

**이 문서는 진행 상태를 담으므로 코드보다 먼저 낡는다.** `/push` 4단계 문서 신선도 검사가 이 파일을 트라이아지 대상에 포함한다 — 태스크를 완료했으면 체크하고 근거(커밋·테스트·산출물)를 남긴다. 체크되지 않은 항목은 "안 된 것"으로 취급한다.

규칙:
- 체크는 **검증 조건이 실제로 통과했을 때만** 한다. "코드를 썼다"는 완료가 아니다.
- `🔒` 표시는 **착수 전 사용자 결정이 필요한 항목**이다 (MVP.md §10과 연동). 결정 없이 진행하면 나중에 뒤집힌다.
- 커밋 경계(`——`)를 지킨다. `/ship`이 이 분리를 커밋 단위로 쓴다.

---

## 1. Prisma 스키마 + Supabase 연결 ✅

- [x] `prisma/schema.prisma` 4테이블 — `Locale`·`StringKey`·`KeyRef`·`Translation`
  - 검증: `npx prisma validate` 통과
- [x] 마이그레이션 생성·적용 — `20260831012453_init`
  - 검증: `pnpm db:status` → `Database schema is up to date!`
- [x] `Translation` 외래키 `ON DELETE RESTRICT`
  - 검증: `migration.sql`에 `ON DELETE RESTRICT` 2건 (키 삭제를 DB가 거부한다)
- [x] `UNIQUE(keyId, localeCode)`
  - 검증: `migration.sql`에 `Translation_keyId_localeCode_key`
- [x] 런타임 접속 (`lib/db.ts`, transaction pooler 6543)
  - 검증: 4테이블 `count()` 조회 성공
- [x] 마이그레이션 접속 (`prisma.config.ts`, session pooler 5432)
  - 검증: 위 `db:status`

---

## 2. `lib/export.ts` + `lib/githash.ts` ⬜ ← **현재 단계**

**의존성 0의 순수 함수.** 이 둘이 틀리면 3~7단계가 전부 무의미해진다. `/tdd`로 테스트부터 쓴다.

### 2a. `lib/githash.ts`

- [ ] `blobSha(content: string): string` — `sha1("blob <byteLength>\0" + content)`
  - 검증: **`git hash-object` 실측값을 골든으로 박은 테스트 4건** — 빈 문자열 / ASCII / 한글 / 이모지
- [ ] 바이트 길이가 `Buffer.byteLength(content, "utf8")`이다
  - 검증: 한글·이모지 케이스가 통과 (`content.length`면 여기서 깨진다)

—— 커밋: `test: pin blob sha golden values` → `feat: add blobSha`

### 2b. `lib/export.ts`

- [ ] `exportLocale(...): string` — DB 상태 → `messages.json` 문자열
  - 검증: 아래 결정성 케이스 전부 green
- [ ] 키 정렬이 **코드포인트 오름차순**이다
  - 검증: `localeCompare`로는 순서가 달라지는 입력(예: `a`·`A`·`ä`·`_x`)에서 기대 순서 고정
- [ ] 정렬한 키 배열로 객체를 **재조립**한다 (DB 순서에 의존하지 않는다)
  - 검증: 입력 배열 순서를 뒤섞어도 출력이 동일
- [ ] 들여쓰기 2칸, 파일 끝 개행 **정확히 1개**
  - 검증: 출력이 `\n`으로 끝나고 `\n\n`으로 끝나지 않음
- [ ] `orphaned` 키 제외
  - 검증: orphaned 키가 섞인 입력의 출력에 그 키가 없음
- [ ] **같은 입력 두 번 호출 → 바이트 단위 동일**
  - 검증: 멱등성 테스트 (이게 불변식 본체다)
- [ ] `description`이 있으면 포함, 없으면 필드 자체를 생략
  - 검증: 두 경우의 출력 비교 (`"description": undefined`가 새지 않는다)
- [ ] 🔒 **빈 로케일 처리 결정** — 번역이 0건인 로케일의 파일을 `{}`로 낼지, 아예 안 낼지
  - ARCHITECTURE §1에 "미정"으로 남아 있다. 결정 후 그 문서와 이 항목을 함께 갱신
- [ ] `exportLocale` + `blobSha` 조합이 `git hash-object`와 일치
  - 검증: 실제 `messages.json`을 파일로 써서 `git hash-object`와 대조 (두 함수의 접점 검증)

—— 커밋: `test: pin export determinism` → `feat: add deterministic locale export`

—— 이후: ARCHITECTURE §1·§2의 `(미구현)` 표시 제거 + 실제 동작으로 갱신

---

## 3. 스캐너 (`lib/scan/`) ⬜

- [ ] AST 경로 (ts-morph) — `t(key, source)` 호출에서 `{ key, sourceText, refs }` 추출
  - 검증: 정상 리터럴 케이스 green
- [ ] `refs`의 `path`·`line`이 정확
  - 검증: 픽스처의 알려진 줄 번호와 일치
- [ ] 비리터럴 인자 → **에러** (CI 실패용)
  - 검증: `t(\`status_${x}\`, "...")`가 에러를 던짐
- [ ] `// @l10n-keys a, b` 주석 화이트리스트로 비리터럴 허용
  - 검증: 주석이 있으면 통과하고 나열된 키가 결과에 포함
- [ ] **주석 속 호출을 무시**한다
  - 검증: `// t("fake", "x")`가 결과에 없음 (정규식 단독으로는 못 걸러지는 케이스)
- [ ] 같은 키에 다른 원문 → **에러**
  - 검증: 충돌 픽스처가 에러
- [ ] 정규식 경로 — HTML·`manifest.config.ts`의 `__MSG_key__`
  - 검증: 키만 수집되고 원문은 AST 경로가 채움
- [ ] 정규식 경로에만 있고 원문이 없는 키 → **에러**
  - 검증: 대응 원문 없는 `__MSG_x__` 픽스처가 에러
- [ ] `namespace` 파생 규칙 확정 + 테스트
  - 검증: 키 접두사에서 namespace가 결정되는 규칙이 테스트로 고정
- [ ] CLI로 실행 가능 (CI가 부른다)
  - 검증: 로컬에서 `bugshot-2` 리포에 돌려 결과를 **눈으로 확인** (MVP §9)

—— 커밋: `test: pin scanner contract` → `feat: add key scanner`

---

## 4. `/api/push` ⬜

- [ ] Bearer `PUSH_TOKEN` 검증, **fail-closed**
  - 검증: 토큰 없음·틀림·환경변수 미설정 3케이스 모두 401/500 (통과하지 않는다)
- [ ] Zod로 페이로드 검증
  - 검증: 잘못된 모양이 400, 에러가 조용히 삼켜지지 않음
- [ ] upsert — 키·원문·`description`
  - 검증: 신규/기존 각각
- [ ] 스캔에 없는 키 → `orphaned = true`, 다시 나타나면 `false`
  - 검증: **삭제되지 않았는지 확인** (`Translation`이 살아 있다)
- [ ] `sourceHash` 변경 → base 아닌 모든 번역에 `needsReview = true`
  - 검증: 전파 로직을 순수 함수로 분리해 테스트 + 통합 확인
- [ ] `KeyRef` 전체 교체
  - 검증: 사라진 ref가 남아 있지 않음
- [ ] **`Translation.value`를 어떤 경로로도 쓰지 않는다**
  - 검증: 코드 리뷰 + 번역이 있는 키를 push해도 값이 불변
- [ ] `commitSha` 저장 (편집 UI의 permalink 기준)
  - 검증: 저장 위치 결정 후 조회 가능

—— 커밋: `test: pin push contract` → `feat: add push endpoint`

---

## 5. Auth + 편집 UI ⬜

- [ ] 🔒 **GitHub org 결정** — 대상이 개인 계정 리포면 org 멤버십 검사가 성립하지 않는다 (MVP §10)
  - 결정 없이 착수하면 인가 모델을 다시 만든다
- [ ] Auth.js GitHub provider, JWT 세션 `maxAge` 24h
  - 검증: 로그인 → 세션에 GitHub 핸들
- [ ] org 멤버십 판정 함수, **`AUTH_ALLOWED_ORG`가 비면 전원 거부**
  - 검증: `isOrgAllowed` 테스트 (이미 있음) + 실제 콜백 배선
- [ ] Tailwind·shadcn 컴포넌트 추가 (`pnpm dlx shadcn@4.19.0 add ...`)
  - 검증: `pnpm build` 통과
- [ ] 네임스페이스 사이드바 (키 개수 표시)
  - 검증: `namespace` 인덱스를 타는 쿼리 하나로 조회
- [ ] 키 리스트 — 원문·description·번역 입력
  - 검증: 화면에 표시
- [ ] blur 시 Server Action 저장, `updatedBy`에 GitHub 핸들
  - 검증: 저장 후 재조회로 값·작성자 확인
- [ ] 필터 3개 — 미번역 / 검토필요 / orphaned
  - 검증: 각 필터가 기대 집합을 반환
- [ ] 코드 참조 GitHub permalink (스캔 당시 `commitSha` 고정)
  - 검증: 링크를 눌러 해당 줄로 이동
- [ ] pull 트리거 버튼 (Server Action)
  - 검증: 6단계 완료 후 동작
- [ ] `server-only`가 클라이언트 유입을 막는지
  - 검증: `pnpm build` 통과 (클라이언트 컴포넌트가 처음 생기는 단계다)

—— 커밋: auth / UI 골격 / 편집·저장 / 필터로 쪼갠다

---

## 6. GitHub App + `/api/pull` ⬜

- [ ] GitHub App installation 토큰 (`octokit`의 `App`)
  - 검증: 토큰으로 리포 읽기 성공
- [ ] PEM 개행 복원 (`parsePrivateKey`, 이미 테스트 있음)
  - 검증: Vercel env의 이스케이프된 값으로 JWT 서명 성공
- [ ] base head SHA + 트리 조회
  - 검증: 기존 `_locales/**/messages.json`의 blob SHA 획득
- [ ] **blob SHA 비교 → 변경 없으면 GitHub API를 한 번도 더 부르지 않음**
  - 검증: 호출 카운트를 세는 테스트 (이게 야간 cron의 기본 경로다)
- [ ] `createTree`에 **`base_tree` 전달**
  - 검증: 페이로드 조립 함수의 순수 테스트 (빼면 리포 나머지 파일이 삭제된 커밋이 된다)
- [ ] `parents: [baseHead]` — `l10n/sync`의 기존 head를 쓰지 않는다
  - 검증: 페이로드 테스트
- [ ] 커밋 메시지에 `[skip-l10n]`
  - 검증: 메시지 생성 함수 테스트
- [ ] ref URL 인코딩 (`l10n%2Fsync`)
  - 검증: 슬래시가 그대로 들어가면 404다
- [ ] **브랜치 없을 때 `POST /git/refs`, 있을 때 `PATCH` + `force`**
  - 검증: 첫 실행 경로를 반드시 다룬다
- [ ] 열린 PR 재사용, 없으면 생성
  - 검증: 두 번 돌려 PR이 하나만 남음
- [ ] `CRON_SECRET` 검증, fail-closed
  - 검증: 시크릿 없이 호출하면 거부

—— 커밋: github 래퍼 / pull 엔드포인트로 쪼갠다

---

## 7. Actions 워크플로 + Vercel Cron ⬜

- [ ] 🔒 **대상 리포 base 브랜치 결정** — main인지 dev인지 (MVP §10)
- [ ] 🔒 **로케일 시드 방식 결정** — `_locales/` 스캔 자동 생성인지 수동 등록인지 (MVP §10)
- [ ] 대상 리포에 Actions 워크플로 (스캔 → `/api/push`)
  - 검증: 대상 리포에서 run이 green
- [ ] 커밋 메시지 `[skip-l10n]`이면 스킵
  - 검증: pull이 만든 커밋이 머지돼도 push가 돌지 않음 (무한 루프 차단)
- [ ] 비리터럴 인자 발견 시 **CI 실패**
  - 검증: 일부러 깨뜨린 브랜치에서 run이 red
- [ ] `vercel.json` Cron → `/api/pull` 야간 1회
  - 검증: Vercel 대시보드에서 cron 등록 확인
- [ ] 대상 리포 왕복 검증 (MVP §9) — push → 편집 → pull → PR 확인
  - 검증: `bugshot-2`의 ko/en/fr 3로케일로 PR이 정상 생성
- [ ] `/l10n-roundtrip` 스킬 추가
  - 검증: 스킬이 왕복을 재현

---

## 전역 미결 (단계에 묶이지 않은 것)

- [ ] 🔒 **dev/prod DB 분리** — Supabase 인스턴스가 하나뿐이라 `migrate dev`가 프로덕션을 직접 바꾼다. **번역 데이터가 쌓이기 전에** 두 번째 프로젝트를 만들지 결정한다 (MVP §10, `/db` 경고 섹션)
- [ ] **Vercel 프로젝트 연결** — 아직 미연결이라 main 푸시가 실제로는 배포하지 않는다. 연결하는 순간부터 `/push`가 진짜 배포가 된다
- [ ] **CI에 `pnpm build` 추가 여부** — 현재 로컬 게이트도 CI도 `next build`를 돌지 않아 RSC 경계·`"use client"` 누락은 Vercel 빌드 실패로만 드러난다 (CLAUDE.md 브랜치 섹션). 5단계에서 클라이언트 컴포넌트가 생기면 재검토
