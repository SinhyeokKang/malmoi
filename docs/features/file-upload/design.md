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
대신 **키에 난수를 넣어 URL을 추측 불가능하게** 한다(열거로 남의 사진에 닿지 않는다).

## 순수 함수로 분리 가능한 부분 → `/tdd` 진입점

| 함수 | 무엇을 판정하나 |
|---|---|
| `sniffImageType(bytes): "png" \| "jpeg" \| null` | **매직 넘버**로 형식을 가른다. 확장자·`Content-Type`은 안 본다 |
| `planImageUpload({ size, bytes }): { ok: true; ext } \| { ok: false; reason }` | 상한(2 MB)과 형식을 한 자리에서 판정한다. 거부 사유가 **값**이다 |
| `imageObjectKey(userId, ext, nonce): string` | 저장 키를 만든다. 난수가 들어가 교체마다 URL이 바뀐다 |
| `planImageReplace(prev, next): { delete: string \| null }` | 옛 키를 지울지. `prev`가 **provider URL**이면 지우지 않는다(우리 것이 아니다) |

⚠️ **`planImageReplace`가 이 기능에서 제일 미끄러운 자리다.** `User.image`에는 **두 출처**가 섞인다 —
`auth.ts`가 넣는 provider URL과 우리가 올린 blob URL. 우리 것이 아닌 URL에 삭제를 걸면 남의 호스트에
DELETE를 쏘거나(무해하지만 무의미), 우리 접두를 잘못 판정하면 **방금 올린 것을 지운다.**

## 스키마 변경

**없다.** `User.image`(`String?`)를 그대로 쓴다.

⚠️ **그 컬럼은 PII 봉투 대상이다** (`lib/credentials/records.ts`의 `["name", "image"]`). 따라서:

- 저장되는 것은 URL의 **암호문**이고, 읽는 자리는 전부 `decodeUser`를 지나야 한다.
- ⚠️ **PII 키를 잃으면 URL을 복구할 수 없다** — 파일은 blob에 남고 **아무도 가리키지 않는 고아**가
  된다. `docs/OPERATIONS.md`의 키 분실 절차에 이 줄이 하나 붙는다.
- ⚠️ **`lib/credentials/conversion.ts`가 `image`를 이미 센다** — 키 회전이 이 값을 함께 다시 싼다.
  URL 길이가 이름보다 길어 봉투가 커지지만 형식은 같다.

## 새 환경변수

`BLOB_READ_WRITE_TOKEN`(Vercel Blob 채택 시). **`.env.example` 갱신을 태스크에 넣는다** —
새 환경변수를 코드에서 읽었으면 같은 커밋에서 추가하는 것이 리포 규칙이다.

⚠️ **`lib/env.ts`의 `requireEnv`를 지난다**(`optionalEnv`가 아니다) — 이 값이 없으면 업로드가
불가능하고, 인가 판정에 넘기는 값이 아니라 fail-closed 걱정이 없다. ⚠️ **모듈 최상위에서 읽지
않는다** — `.env`가 없는 CI에서 import만으로 죽는다.

## 불변식 영향

- **export 결정성·blob SHA(§1·§2)** — 안 건드린다. 리포에 나가는 바이트와 무관하다.
  ⚠️ 이름이 겹치는 것에 주의: 여기 "blob"은 Vercel Blob이고 §2의 "blob SHA"는 git object다.
- **인증 경계(§6)** — 직접 건드린다. 업로드는 **Server Action**이고 `requireUser`를 지난다.
  ⚠️ **Route Handler를 만들지 않는다** — 내부 쓰기이고, 외부가 부르는 진입점이 아니다(CLAUDE.md).
- **§0 불변식 5**(모든 DB 쿼리를 `projectId`로 좁힌다) — **해당 없다.** 이 축의 소유자는 `User`이고
  `userId`가 그 자리를 든다.

## POSTMORTEM에서 소환한 것

- **2026-09-06 — 사유를 실어 보내놓고 안 읽으면 무음이다.** 업로드 거부(형식·크기)가 화면에 닿지
  않으면 사용자에게는 **버튼이 안 눌린 것**으로 보인다. 거부는 값으로 돌아오고 소비자가 **같은
  커밋에서** 읽는다.
- **2026-09-06 — 사유 없는 `disabled`를 만들지 않는다.** [Delete]가 사진 없을 때 비활성이면 옆에
  사유가 선다(시안이 캡션으로 그렇게 그렸다).
