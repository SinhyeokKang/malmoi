# design — file-upload

## 영향 받는 흐름

**셋 중 어디도 아니다** — push·편집 UI·pull 어느 쪽도 안 건드린다. 새 축이고, 닿는 것은
**인증 경계**(ARCHITECTURE §6)와 `User` 행 하나다.

## 저장 위치 — ✅ **Vercel Blob** (결정 2026-09-13, 사용자)

| 후보 | 값 | 비용 |
|---|---|---|
| **Vercel Blob** (추천) | 이미 Vercel에 있고 Server Action에서 바로 쓴다. 공개 읽기 URL이 서명 없이 서고 리전이 함수와 같다 | 의존성 하나(`@vercel/blob`) · 새 env 하나 |
| Supabase Storage | 이미 Supabase에 있다 | ⚠️ **기본 공개 정책 표면을 또 하나 연다** — 2026-09-09에 `public` 스키마의 `pg_default_acl`이 `anon`에 전권을 준 것을 실측으로 발견했고(CLAUDE.md), Storage는 그와 **별개의** 정책 체계다. 같은 부류의 사고를 다시 열 자리를 만든다 |
| provider 이미지 URL만 | 새 인프라 0 | 업로드가 아니다 — 사용자 결정(2026-09-13)이 업로드를 만드는 쪽이었다 |

**Vercel Blob으로 정했다.** 근거 한 줄: 이미 있는 플랫폼이고, Supabase 쪽은 이 리포가 이미 한 번
밟은 "기본이 열려 있다" 부류를 **별개의 정책 체계로** 하나 더 여는 것이다.

⚠️ **`pnpm-workspace.yaml`의 `minimumReleaseAge: 1440`이 걸린다** — `@vercel/blob`의 최신 버전이
publish된 지 24시간이 안 됐으면 명시해도 직전 버전이 깔린다. "왜 이 버전이 안 깔리지"의 답이 여기다.

⚠️ **공개 읽기여야 한다.** 셸 아바타가 매 요청 서명 URL을 만들면 그 비용이 모든 페이지에 붙는다.
대신 **키에 난수를 넣어 URL을 추측 불가능하게** 한다(열거로 남의 사진에 닿지 않는다). 난수가 들어가면
교체마다 URL이 바뀌므로 **CDN 무효화가 필요 없어진다** — 그것이 비목표를 성립시키는 수단이다.
⚠️ **대가 하나를 받아들인다**: 새 URL은 캐시가 비어 있어 업로드 직후 셸 아바타가 **한 프레임 빈다**
(`src`가 있으니 이니셜 폴백으로도 안 떨어지고 `alt=""`라 대체 텍스트도 없다). 한 번뿐이라 수용한다.

⚠️ **`addRandomSuffix: false`를 명시한다.** 안 주면 SDK가 키에 자기 난수를 덧붙여 `imageObjectKey`가
만든 키와 **실제 URL이 갈리고**, 그 위에 선 삭제 판정이 통째로 틀린다.

⚠️ **CSP `img-src`에 blob 호스트를 더한다** — `next.config.ts`가 지금 `'self' data:
https://avatars.githubusercontent.com`뿐이다. 지금은 Report-Only라 화면이 안 깨지지만, 셸 아바타가
모든 페이지에서 상시 위반을 뿜으면 **enforce로 올리기 전에 콘솔을 읽는다는 그 계획의 신호가 죽고**,
올리는 날 아바타가 통째로 사라진다. ⚠️ **`lh3.googleusercontent.com`도 이미 빠져 있다** — Google로
가입한 사용자는 지금도 위반 중이다. 같은 줄을 고치는 김에 함께 넣는다.
⚠️ **`app/__tests__/security-headers.test.ts`는 `img-src`를 단언하지 않아 누락해도 green이다** —
그래서 같은 커밋에서 그 단언을 더한다.

## 순수 함수로 분리 가능한 부분 → `/tdd` 진입점

| 함수 | 무엇을 판정하나 |
|---|---|
| `sniffImageType(bytes): "png" \| "jpeg" \| null` | **매직 넘버**로 형식을 가른다. 확장자·`Content-Type`은 안 본다 |
| `planImageUpload(bytes): { ok: true; ext } \| { ok: false; reason: UploadReject }` | 상한(800 KB)과 형식을 한 자리에서 판정한다. 거부 사유가 **값**이다 |
| `imageObjectKey(userId, ext, nonce): string` | 저장 키를 만든다. 난수가 들어가 교체마다 URL이 바뀐다 |
| `planImageDelete(prev: string \| null): string \| null` | 옛 키를 지울지. **우리 것일 때만** 키를 준다 |

⚠️ **`planImageUpload`가 `size`를 따로 받지 않는다.** `bytes.length` 하나로 판정한다 — `File.size`는
클라이언트 메타데이터이고, 확장자를 안 믿기로 한 바로 그 이유가 크기 축에서 되살아난다. 인자가 하나
줄고 "둘이 불일치하면?" 갈래가 통째로 사라진다.

⚠️ **`planImageDelete`가 이 기능에서 제일 미끄러운 자리다.** `User.image`에는 **두 출처**가 섞인다 —
`auth.ts`가 넣는 provider URL과 우리가 올린 blob URL. 그래서 판정을 **allowlist로 fail-closed** 한다:
`URL` 파싱 후 `hostname.endsWith(".public.blob.vercel-storage.com")` **그리고** 경로가 우리 접두
(`avatars/`)로 시작할 때만 지운다.
- ⚠️ **부정 목록("provider URL이면 안 지운다")으로 쓰지 않는다.** provider가 지금 **둘**이고
  (`avatars.githubusercontent.com` · `lh3.googleusercontent.com`) 늘어날 수 있는데, 목록에 없는 출처가
  생기면 **남의 호스트에 DELETE를 쏘는 쪽이 기본값**이 된다.
- ⚠️ **접두가 비슷한 호스트를 통과시키지 않는다** — `…vercel-storage.com.evil.test`가 그 케이스다.
  `hostname`을 파싱해서 보고 문자열 `startsWith`로 판정하지 않는다.
- ⚠️ **인자가 하나다.** 키에 난수가 들어가 `prev === next`가 구조적으로 불가능하므로 두 값을 견줄
  일이 없다. 2인자는 "두 값을 견줘 고른다"는 **모양**을 만드는데, 그것이 이 리포의 코어 원칙이
  금지하는 형태의 외형이다. 삭제(완료 조건 5)도 같은 함수를 쓴다.

### 거부 사유는 union이고, 문구는 이 기능이 안 든다

```ts
export type UploadReject = "too-large" | "unsupported-type" | "not-a-file" | "empty";
```

⚠️ **`reason`이 `string`이면 안 된다.** `app/invite/actions.ts:23-25`가 이유까지 적어 뒀다 — 화면이
switch로 문구를 고르는데 `string`이면 **사유를 늘려도 그 switch가 조용히 기본값으로 떨어진다.**
⚠️ **문구는 `messages/en.tsx`의 `errors.upload.*`이고 `account-settings`가 든다.** 능력 쪽은 갈래
이름만 정의한다 — `lib/upload/`에 영문 문구를 두면 `no-korean-ui.test.ts`가 **한글만 세므로** green인
채 사전을 통째로 우회하고 UI 문장이 `lib/` 안에 산다.

## 엣지 케이스 — `/tdd` 전에 정한다

**`sniffImageType`**
- **JPEG SOI는 `FF D8 FF`까지가 공통이고 4번째 바이트가 갈린다**(`E0` JFIF / `E1` EXIF / `DB` /
  `EE` Adobe). **3바이트만 본다** — 4바이트를 보면 정상 JPEG를 거부한다.
- **PNG 시그니처는 8바이트**(`89 50 4E 47 0D 0A 1A 0A`)다. 앞 4바이트만 보면 비-PNG가 통과한다.
- 0바이트 / 시그니처보다 짧은 파일(1~7바이트) → `null`. `noUncheckedIndexedAccess`가 켜져 있어
  **우연히** 맞는 답이 나오는 자리다 — 우연을 테스트로 고정한다.
- **APNG는 평범한 PNG 시그니처를 갖는다** → 통과한다. 움직이는 아바타를 허용하는 것이 결정이다
  (막으려면 청크를 읽어야 하고, 그건 디코더 의존성이다).
- 헤더는 PNG인데 **뒷부분이 깨진 파일** → 매직 넘버만 보므로 **통과한다.** 의도된 동작이다.
- WebP·AVIF·GIF는 거부. 거부 문구가 받는 형식을 말해야 하고(`"PNG or JPEG only."`), 화면의 `accept`
  속성이 **같은 답**을 내야 한다.

**`planImageUpload`** — 경계 셋을 전부 센다: `799_999` · `800_000`(**포함**) · `800_001`.

**Action 층**
- **`FormData.get()`은 `File | string | null`을 준다.** 문자열을 보내는 요청이 가능하다 —
  `instanceof File`이 첫 검사이고 **값으로**(`"not-a-file"`) 거부한다.
- 아무것도 안 고르고 제출하면 브라우저는 `null`이 아니라 **빈 이름의 0바이트 `File`**을 보낸다 →
  `"empty"`.
- **업로드 성공 → DB 쓰기 실패 = 고아.** spec 완료 조건 4는 **반대 방향**만 다룬다. 방금 올린 blob을
  catch에서 best-effort로 지운다.
- **동시 업로드(경쟁)**: 둘 다 `prev`를 읽고 → 둘 다 put → 둘 다 update. 진 쪽 파일이 고아가 되는
  것에 더해 **B의 삭제가 A가 방금 올린 파일을 겨눈다.** ⚠️ **해법 선례가 같은 파일에 있다** —
  `unlinkLoginMethod`가 `$transaction` 안에서 `SELECT "id" FROM "User" WHERE "id" = ${userId}
  FOR UPDATE`를 걸고 주석이 정확히 이 실패를 이름으로 부른다(`app/(edit)/account/actions.ts:65-67`).
- PII 키 분실로 `prev`가 복호 불가 → `readable()`이 행을 `null`로 만든다
  (`lib/credentials/records.ts:47-53`) → `planImageDelete(null)` → 삭제 안 함. 구조적으로 옳고,
  테스트로 고정할 값이다.

## 재로그인이 사진을 덮지 않게 가른다 — 이 기능의 진짜 서버 작업

`auth.ts:54`가 provider 사진을 `image`로 매핑하고, `lib/credentials/adapter.ts:34-37`의 `updateUser`가
넘어온 필드를 그대로 `encodeUserFields`로 봉인해 쓴다. **이름 축은 이미 방어됐다** —
`account-settings/tasks.md` 2번이 *"`planEmailRefresh`가 이름을 안 덮게 가른다. 안 가르면 재로그인 한
번에 고친 이름이 되돌아간다"*고 적었다. **`image`는 같은 `profile()` 매핑, 같은 `encodeUserFields`
호출을 탄다.** 같은 자리에서 같이 가른다.

⚠️ **실측으로는 지금도 안전하다** — `lib/credentials/access.ts:42`의 `refreshVerifiedEmail`이 `email`
하나만 쓴다. 방어가 필요한 것은 `image`가 섞여 들어오는 경로(계정 병합 갈래)가 **하나라도** 생기는
경우이고, 이름 축이 이미 그것을 전제로 방어선을 세웠다. 단언 한 줄과 회귀 테스트 하나가 대가다.

## 스키마 변경

**없다.** `User.image`(`String?`, `prisma/schema.prisma:391`)를 그대로 쓴다.
⚠️ **따라서 `/db`·`pnpm db:deploy`·additive-first 배포 순서 판정이 전부 해당 없다.**

⚠️ **그 컬럼은 PII 봉투 대상이다** (`lib/credentials/records.ts:14`의 `["name", "image"]`). 따라서:

- 저장되는 것은 URL의 **암호문**이고, 읽는 자리는 전부 `decodeUser`를 지나야 한다.
- ⚠️ **그래서 판정은 평문 위에서 한다.** `lib/credentials/storage.ts:48`이 `randomBytes(12)`로 봉인해
  같은 URL이 매번 다른 암호문이 되지만, `planImageDelete`가 받는 `prev`는 `decodeUser`를 지난 평문이라
  접두 판정이 성립한다. 봉투를 그대로 비교하는 자리는 `conversion.ts:26`의 CAS 하나이고 거기선 자기
  자신과 비교하므로 안전하다. **다음 사람이 이 검증을 반복하지 않도록 여기 적는다.**
- ⚠️ **암호문이 `/api/auth/session`으로 새는 갈래는 없다** — 어댑터가 `@auth/prisma-adapter`를 직접
  쓰지 않고 `credentialAdapter`가 감싸서 `getSessionAndUser`까지 `decodeUser`를 지난다.
- ⚠️ **PII 키를 잃으면 URL을 복구할 수 없다** — 파일은 blob에 남고 **아무도 가리키지 않는 고아**가
  된다. `docs/OPERATIONS.md`의 키 분실 절차에 이 줄이 하나 붙는다.
- ⚠️ **`lib/credentials/conversion.ts`가 `image`를 이미 센다** — 키 회전이 이 값을 함께 다시 싼다.
  URL 길이가 이름보다 길어 봉투가 커지지만 형식은 같다.
- ⚠️ **`postgres.integration.ts:52`가 `image`를 시드만 하고 `:88`의 단언은 `{email, name}`뿐이다** —
  이 기능이 그 컬럼의 첫 쓰기 소비자인데 왕복 단언이 0건이다. 단언을 더하고, 그것이
  `lib/credentials/**` 변경이므로 **그때 `pnpm test:credentials:postgres`를 손으로 돌린다**
  (POSTMORTEM 2026-09-10의 규칙 — 트리거는 "어느 디렉터리"가 아니라 "무엇을 단언하나"다).

### 읽는 쪽이 `decodeUser`를 빠뜨리면 `<img src="enc:v1:kid:…">`가 그려진다

지금 `image`를 select하는 쿼리는 `lib/login-link/view.ts:74`뿐이고 `:78`에서 복호한다. 나머지 로더
(`lib/auth/query.ts` · `lib/keys/query.ts` · `lib/sync/query.ts`)는 이미 `decodeUser`를 지나므로
**select에 `image: true`만 더하면 자동 복호된다.**
⚠️ **`app/(edit)/account/page.tsx:61`의 select에 `image`가 없다**(`:65`가 `decodeUser`라 넓히기만 하면
된다). `account-settings` 7번은 `SessionRead`→`header`→`UserMenu` 셋만 잇고 이 select는 안 건드린다 —
**소유자 없는 자리라 여기서 태스크로 잡는다.**
⚠️ `lib/login-link/__tests__/view-contract.test.ts:40`이 `expect(PAGE).not.toMatch(/decodeUser\(/)`로
페이지 직접 복호를 금지한다. 새 소비자가 그 규칙을 밟지 않게 한다.

## 새 환경변수

`BLOB_READ_WRITE_TOKEN`. **`.env.example` 갱신을 태스크에 넣는다** — 새 환경변수를 코드에서 읽었으면
같은 커밋에서 추가하는 것이 리포 규칙이다.

⚠️ **`lib/env.ts`의 `requireEnv`를 지난다**(`optionalEnv`가 아니다) — 이 값이 없으면 업로드가
불가능하고, 인가 판정에 넘기는 값이 아니라 fail-closed 걱정이 없다. ⚠️ **모듈 최상위에서 읽지
않는다** — `.env`가 없는 CI에서 import만으로 죽는다. 선례는 `lib/github.ts:32`의 `createApp()`,
`lib/credentials/storage.ts:36`의 `keys()`다.

⚠️ **읽은 값을 SDK에 명시적으로 넘긴다.** `@vercel/blob`은 `token` 옵션이 없으면 스스로
`process.env.BLOB_READ_WRITE_TOKEN`을 읽는다 — 한 번 읽어 놓고 안 넘기면 값이 없을 때 우리
`MissingEnvError`가 아니라 **SDK의 오류**가 나가고, "환경변수는 한 곳에서 읽는다"가 겉모양만 남는다.

```ts
put(key, body, { access: "public", addRandomSuffix: false, token: requireEnv("BLOB_READ_WRITE_TOKEN") })
```

## 불변식 영향

- **export 결정성·blob SHA(§1·§2)** — 안 건드린다. 리포에 나가는 바이트와 무관하다.
  ⚠️ **이름이 이 리포에서 셋이다**: 여기 "blob"은 Vercel Blob, §2의 "blob SHA"는 git object,
  `lib/pull/run.ts:74`의 `BLOB_CONCURRENCY`는 git blob 병렬 읽기 상한이다. **새 상수는 `IMAGE_*`로
  가른다** — `BLOB_*`로 만들면 grep이 섞인다.
- **인증 경계(§6)** — 직접 건드린다. 업로드는 **Server Action**이고 `requireUser`를 지난다.
  ⚠️ **Route Handler를 만들지 않는다** — 내부 쓰기이고, 외부가 부르는 진입점이 아니다(CLAUDE.md).
  ⚠️ **`/account`는 이미 `middleware.ts`의 `matcher`에 있다** — matcher 변경이 필요 없다.
- **§0 불변식 5**(모든 DB 쿼리를 `projectId`로 좁힌다) — **해당 없다.** 이 축의 소유자는 `User`이고
  `userId`가 그 자리를 든다(ARCHITECTURE §6.3이 POSTMORTEM 2026-09-06 이후 두 축으로 넓혔다).

## 화면은 `account-settings`가 들지만, 넘기는 목록은 여기서 정한다

⚠️ **`<input type="file">`은 `components/ui/`에 프리미티브로 만든다** (2026-09-13, 사용자).
`components/__tests__/focus-ring.test.ts:43`의 `RAW_TAG_ALLOWED: string[] = []`가 **전면 방어선**이고
주석이 *"다시 채우지 않는다. 새 컨트롤이 필요하면 `components/ui/`에 프리미티브로 만든다"*로 못 박았다.
리포에 `type="file"`은 0건이므로 **19번째 프리미티브**를 만드는 일이다.
⚠️ **모양이 함정이다** — 파일 입력은 `sr-only` + 라벨 관용구라 **포커스 링이 화면에서 사라진다.**
링을 `peer-focus-visible`로 라벨에 옮겨야 하고, 그 형태가 스캐너의 "여는 태그에 셋을 리터럴로"와
어긋난다. `/tdd` 전에 정할 설계 결정이고 `docs/DESIGN.md` §6.2에 관용구 한 줄이 등재된다.

⚠️ **새 색 토큰은 0개다** — 인라인 에러(`form-group.tsx`의 `text-destructive text-xs`) · pending
(`Button`의 `loading`) · 스켈레톤 · 삭제 버튼(`ghost` + 정사각) 넷이 이미 선다. **드롭존으로 가지
않는 한** DESIGN §6.2 등재는 프리미티브 관용구 한 줄뿐이다.

⚠️ **`next/image`를 도입하지 않는다.** `components/ui/avatar.tsx:24-26`이 생 `<img>`를 쓰는 이유를
주석에 적어 뒀고(외부 호스트라 `images.remotePatterns`가 따라붙는다), `next.config.ts`에 `images` 키가
**아예 없다.** 사진이 붙으면 미리보기와 56 아바타에 `next/image`를 쓸 유인이 생기는데, 쓰는 순간
`remotePatterns` 누락으로 런타임에 조용히 깨지고 그 위에 POSTMORTEM 2026-09-10 ①(Vite가 SVG를 data
URI로 인라인)이 겹친다. **코드 주석은 그 파일을 여는 사람만 읽으므로 여기 적는다.**

## POSTMORTEM에서 소환한 것

- **2026-09-06 — 사유를 실어 보내놓고 안 읽으면 무음이다.** 업로드 거부(형식·크기)가 화면에 닿지
  않으면 사용자에게는 **버튼이 안 눌린 것**으로 보인다. 거부는 값으로 돌아오고 소비자가 **같은
  커밋에서** 읽는다. ⚠️ **이 기능은 그 반대 실패도 밟을 뻔했다** — 상한이 프레임워크 상한을 넘으면
  보내는 쪽이 아예 없다(완료 조건 1의 ⚠️).
- **2026-09-06 — 사유 없는 `disabled`를 만들지 않는다.** [Delete]가 사진 없을 때 비활성이면 옆에
  사유가 선다(시안이 캡션으로 그렇게 그렸다).
- **2026-09-09 — `revalidatePath`의 인자는 단언 대상이다.** 문자열이라 컴파일러가 못 보고, 틀리면
  조용하다. 선례는 `app/(edit)/__tests__/archive.test.ts:119`의 `toHaveBeenCalledWith("/", "layout")`.
- **2026-09-10 — 손으로 돌리는 스위트의 트리거는 "무엇을 단언하나"로 쓴다.** `image` 왕복 단언을
  더하는 순간 `pnpm test:credentials:postgres`가 이 배송의 대상이 된다.

## 고아 파일이 생기는 경로는 셋이다

(a) PII 키 분실 · (b) 교체 시 삭제 실패(완료 조건 4가 **허용한다**) · (c) 미래의 계정 삭제.
⚠️ **(c)는 지금 범위가 아니다** — 리포에 사용자용 계정 삭제가 없고(`adapter.ts:48`의 `deleteUser`는
Auth.js 계약용이라 호출자가 0이다) `account-settings/spec.md:53`이 명시적 비범위로 뒀다. **범위로
들어오면 blob 정리가 그 태스크에 붙는다.**
⚠️ **blob 목록과 `User.image` 집합의 차집합을 볼 수단이 없으면** "고아 하나가 남는 것이 싸다"가
누적되는 동안 아무도 못 본다 — `pnpm smoke:blob`이 그 목록을 뽑는 자리를 겸한다.
