# tasks — file-upload

**순서는 순수 함수 → 껍데기 → 소비자다.** 역순은 테스트 못 하는 코드를 먼저 쌓는 것이다.

## 0. 결정 셋 — ✅ **끝났다** (2026-09-13, 사용자)

- **저장 위치는 Vercel Blob.** 근거는 `design.md`의 표. 따라 나오는 것 셋: 의존성 `@vercel/blob` ·
  env `BLOB_READ_WRITE_TOKEN` · **공개 읽기 + 키에 난수**(서명 URL을 안 쓰는 대신 열거를 막는다).
- **상한은 800 KB**(`800_000`). `next.config.ts`의 `serverActions.bodySizeLimit`은 **안 올린다** —
  전역이라 `saveTranslation`·`createProject`까지 같이 움직인다.
- **EXIF는 안 벗긴다.** 판정이고 캡션이 그 사실을 말한다.

⚠️ **스키마 변경이 0이라 `/db`·`pnpm db:deploy`·배포 순서 판정이 전부 해당 없다.**
`User.image`(`prisma/schema.prisma:391`)를 그대로 쓴다.

## 1. 판정 순수 함수 넷 — `/tdd interface`

`lib/upload/image.ts`에 `sniffImageType` · `planImageUpload` · `imageObjectKey` · `planImageDelete`
\+ `UploadReject` union.
⚠️ **`import "server-only"`를 붙이지 않는다.** 근거는 "테스트가 죽는다"가 **아니다** —
`vitest.setup.ts:2`가 그것을 전역 mock한 2026-09-10 이후 그 압력은 사라졌다. 지금 유효한 근거는
**번들 그래프**이고(남은 방어선은 `components/__tests__/client-graph.test.ts` 하나), 순수 판정 모듈은
클라이언트 그래프에 들어가도 무해하다.

검증: `pnpm test` green. 아래가 전부 red → green으로 간다.
- `sniffImageType`: `.png`로 이름만 바꾼 **SVG 거부** · **JPEG는 3바이트**(`E0`/`E1`/`DB`/`EE` 넷이
  전부 통과) · **PNG는 8바이트**(앞 4바이트만 같은 바이트열은 거부) · 0바이트 · 1~7바이트 ·
  APNG 통과 · 헤더만 PNG이고 뒤가 깨진 파일 통과 · WebP/AVIF/GIF 거부
- `planImageUpload`: 경계 셋 `799_999` / `800_000`(**포함**) / `800_001` · 형식 거부가
  `"unsupported-type"` · 크기 거부가 `"too-large"`
- `imageObjectKey`: 같은 입력 → 같은 키(결정성) · 다른 nonce → 다른 키 · `userId`/`ext`가 경로
  구분자를 탈출하지 못함
- `planImageDelete`: 우리 blob URL(키를 준다) · **provider URL 둘 다**(`avatars.githubusercontent.com`
  · `lh3.googleusercontent.com` → `null`) · `null` 입력 · **접두가 비슷한 남의 호스트**
  (`…vercel-storage.com.evil.test` → `null`) · 호스트는 맞는데 경로 접두가 다름 → `null`

*커밋 경계* — `test: pin the image upload predicates`

## 2. 저장소 껍데기 + 환경변수 + CSP

**`lib/upload/store.ts`** — `putImage` · `deleteImage` · `listImages`(고아 조회용) 얇은 껍데기.
⚠️ **판정을 여기 두지 않는다** — 껍데기는 I/O만 든다.
⚠️ **`import "server-only"`를 붙이지 않는다.** 4번의 `pnpm smoke:blob`이 이 모듈을 직접 열어야 한다 —
`lib/github.ts:1-3`이 **정확히 그 이유로** 안 붙인다(붙이면 스모크가 프로덕션 경로가 아닌 **사본**을
검증한다). 클라이언트 차단은 그래프 상류(`requireUser` → `lib/auth/session.ts`)가 든다.

**환경변수** — `lib/env.ts`의 `requireEnv`를 지나고 **`.env.example` 갱신**(같은 커밋).
⚠️ **모듈 최상위 평가 금지** — 함수 안에서 읽고, 그 함수를 최상위 `const`가 부르지 않는다.
⚠️ **읽은 값을 SDK에 명시적으로 넘긴다** + **`addRandomSuffix: false`**(`design.md`).

**`next.config.ts`의 CSP** — `img-src`에 `https://*.public.blob.vercel-storage.com`과
`https://lh3.googleusercontent.com` 둘을 더한다(후자는 기존 결함이고 같은 줄이다).

검증:
- `pnpm typecheck` green.
- **`.env.local`을 치우지 않는다.** `requireEnv(name, source = process.env)`가 소스를 인자로 받으므로
  단위 테스트로 ① 빈 `EnvSource`로 `lib/upload/store.ts`를 import해도 **안 던진다**(= 최상위 평가
  없음) ② 그 상태로 `putImage`를 부르면 `MissingEnvError`를 던진다, 둘을 단언한다.
  ⚠️ **`.env.local`은 에이전트가 건드리지 않는다**(CLAUDE.md — 2026-09-04 유출). 선례는
  `app/__tests__/security-headers.test.ts`가 *"tsc가 못 보니 설정을 불러서 검사한다"*로 세운 형태다.
- `app/__tests__/security-headers.test.ts`에 **`img-src` 단언을 더한다** — 지금은 그 지시어를 안 봐서
  누락해도 green이다.

## 3. Server Action 둘 + 재로그인 방어

`app/(edit)/account/actions.ts`에 `uploadProfileImage` · `deleteProfileImage`.
`requireUser` → 판정 → 저장 → `User.image` 갱신(PII 봉투) → 옛 파일 정리 → `revalidatePath("/", "layout")`.
⚠️ **무효화 범위가 layout이다** — 셸 아바타·사용자 메뉴가 같은 값을 읽는다
(`account-settings` 7번이 그 배선을 세운다).
⚠️ **거부는 값으로 돌려준다** — 던지면 digest만 남은 일반 오류가 되고 사유가 통째로 사라진다.
⚠️ **`FormData.get()`은 `File | string | null`이다** — `instanceof File`이 첫 검사다.
⚠️ **동시 업로드를 `FOR UPDATE`로 막는다** — 선례가 같은 파일 `:65-67`의 `unlinkLoginMethod`이고
주석이 이 실패를 이름으로 부른다. 안 막으면 **B의 삭제가 A가 방금 올린 파일을 겨눈다.**
⚠️ **업로드 성공 후 DB 실패면 방금 올린 blob을 best-effort로 지운다** — spec 완료 조건 4는 반대
방향만 다룬다.
⚠️ **서버 로그는 영문이다** — `no-korean-ui.test.ts`의 허용 목록은 `lib/push/apply.ts` 하나뿐이다.

**같은 커밋에서 `image` 축의 재로그인 방어를 세운다.** `auth.ts` → `adapter.updateUser` 경로가
올린 사진을 provider 값으로 덮지 않게 가른다 — **이름 축과 같은 자리, 같은 형태**다
(`account-settings/tasks.md` 2번의 `planEmailRefresh`).

**같은 커밋에서 `app/(edit)/account/page.tsx:61`의 select에 `image`를 더한다**(`:65`가 `decodeUser`라
넓히기만 하면 자동 복호된다). ⚠️ `view-contract.test.ts:40`이 페이지 직접 복호를 금지한다.

검증:
- ⚠️ **`app/__tests__/entry-points.test.ts`의 `USER_SCOPED_ACTIONS`에 두 이름을 등재한다**
  (`account/actions.ts#uploadProfileImage` · `#deleteProfileImage`, 사유 주석과 함께 — *행이 사용자
  소유다*). **등재하지 않으면 `requireUser`만으로는 `unguarded`에 실려 red다.**
  ⚠️ **`app/(edit)/__tests__/authorization.test.ts`가 아니다** — 그 파일은 `saveTranslation`·
  `triggerPullAction`만 명시 import하고 스캔을 안 해서, 새 Action을 만들어도 **영원히 green**이다.
- **`revalidatePath`의 인자를 단언한다** — `toHaveBeenCalledWith("/", "layout")`
  (POSTMORTEM 2026-09-09:833, 선례 `archive.test.ts:119`).
- 시나리오 테스트를 새로 쓴다: 비로그인 · 세션 장애 · 남의 `userId` 주입 · `FormData`에 문자열 ·
  0바이트 `File` · 재로그인 후 사진 유지.
- `pnpm test` green.

*커밋 경계* — `feat(account): upload and delete the profile picture`

## 4. `pnpm smoke:blob`

`scripts/smoke-blob.ts` — `putImage`(테스트 바이트) → URL 도달 확인 → `deleteImage` → 404 확인.
`listImages`로 **고아 목록**(blob 목록 − `User.image` 집합)을 뽑는 자리를 겸한다.
⚠️ **실 API라 `pnpm test` 밖이다** — `smoke:github`와 같은 부류이고, 그래서 2번이 `store.ts`에
`server-only`를 안 붙였다.

검증: **완료 조건 1·4·5의 판정자가 이것이다.** 로컬에서 한 번 돌려 셋을 확인한다.

*커밋 경계* — `chore(upload): smoke the blob store against the real API`

## 5. `image` 왕복 단언 + OPERATIONS

**`lib/credentials/__tests__/postgres.integration.ts`** — `:52`가 `image`를 시드만 하고 `:88`의
단언은 `{email, name}`뿐이다. **왕복 단언을 더한다** — 이 기능이 그 컬럼의 첫 쓰기 소비자다.
⚠️ **`lib/credentials/**` 변경이므로 `pnpm test:credentials:postgres`를 손으로 돌린다**
(`pnpm test`에 없다).

**`docs/OPERATIONS.md`** — 키 분실 절차에 두 줄: (a) PII 키를 잃으면 **사진 URL이 복구 불가**이고
파일이 blob에 고아로 남는다 · (b) 교체 시 삭제 실패도 같은 고아를 만든다(완료 조건 4가 허용한다).
**고아 목록은 `pnpm smoke:blob`으로 뽑는다.**

검증: `pnpm test:credentials:postgres` green + OPERATIONS의 그 줄이 `lib/credentials/records.ts:14`
(`image`가 봉투 대상)을 근거로 든다. ⚠️ **`/doc-check`으로 판정하지 않는다** — "키를 잃으면 복구
불가"는 코드에 대응물이 없는 **운영상 귀결**이라 통과도 실패도 판정할 수 없다.

*커밋 경계* — `docs(OPERATIONS): a lost PII key orphans the uploaded picture`

## 6. 정본 반영

기능이 끝나면 `docs/features/file-upload/`는 **지워진다.** 그 전에 판정을 올린다.

- **`docs/ARCHITECTURE.md`** — "프로필 이미지 저장 경계" 절 하나: 벤더 판정과 Supabase Storage 기각
  근거 · 공개 읽기 + 난수 키 · **`planImageDelete`의 allowlist 판정**(두 출처가 섞인다는 함정) ·
  봉투된 값의 판정은 평문 위에서 한다는 사실.
  ⚠️ **코어 모듈 목록에 `lib/upload/`를 넣을지 같이 판정한다**(넣으면 `.claude/commands/push.md:77`의
  사본도 같이 움직이고, 앞으로 그 디렉터리를 건드릴 때마다 신선도 검사가 붙는다). **안 넣기로 했으면
  그 이유를 적는다.**
- **`docs/DIRECTORY.md`** — `lib/upload/` 트리 등재. `/push` 4단계가 본다.
- **`docs/PRODUCT.md`** — §7에 저장 벤더 판정 한 줄 · §4.2에 *"업로드 능력이 생겨도 스크린샷 첨부는
  그대로다"* 한 줄 · **§4.1(109~111줄)의 낡은 근거 정정** — *"`publicSession`을 넓히면 페이로드가
  커진다"*가 거짓이다(`lib/auth/public-session.ts:15`에 `image`가 **이미 있다**). 근거가 거짓인 채로
  남으면 그 결정을 재검토할 사람이 엉뚱한 비용을 계산한다.
- **`docs/DESIGN.md`** §6.2 — `FileInput` 프리미티브의 `sr-only` + `peer-focus-visible` 관용구 한 줄.

⚠️ **문서가 코드보다 앞서가지 않는다** — 프로덕션에 선 뒤다.

*커밋 경계* — 문서별로 하나씩

## 7. 소비자는 이 기능이 아니다

화면은 **`account-settings` 4b**가 든다. 여기서 만드는 것은 능력까지다. **넘기는 것 여섯**:
`FileInput` 프리미티브 · 클라이언트 `File.size` 선검사(800 KB) · `errors.upload.*` 사전 항목 ·
캡션(`"PNG or JPEG, up to 800 KB. Uploaded as-is."`) · pending(`Button`의 `loading`) ·
[Delete] `disabled` 옆 사유.

검증: `account-settings` 4b가 여섯을 전부 든다. ⚠️ **"tasks.md가 Action을 이름으로 참조한다"로
검증하지 않는다** — 그 문서는 기능이 끝나면 **지워지고**, 이름 참조는 `spec.md`의 의존 표에 있다.
