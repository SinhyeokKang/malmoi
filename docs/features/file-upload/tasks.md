# tasks — file-upload

**순서는 순수 함수 → 껍데기 → 소비자다.** 역순은 테스트 못 하는 코드를 먼저 쌓는 것이다.

## 0. 저장 위치 확정 — ✅ **Vercel Blob** (2026-09-13, 사용자)

근거는 `design.md`의 표에 있다. 따라 나오는 것 셋: 의존성 `@vercel/blob` · env `BLOB_READ_WRITE_TOKEN` ·
**공개 읽기 + 키에 난수**(서명 URL을 안 쓰는 대신 열거를 막는다).

## 1. 판정 순수 함수 넷 — `/tdd interface`

`lib/upload/image.ts`에 `sniffImageType` · `planImageUpload` · `imageObjectKey` · `planImageReplace`.
⚠️ **`import "server-only"`를 붙이지 않는다** — 테스트가 직접 import하는 순수 모듈이다.
검증: `pnpm test` green. **`.png`로 이름만 바꾼 SVG가 거부되는 케이스**와 **provider URL에 삭제가
안 걸리는 케이스**가 각각 red → green으로 간다.

*커밋 경계* — `test: pin the image upload predicates`

## 2. 저장소 껍데기

`lib/upload/store.ts` — `putImage` · `deleteImage` 둘뿐인 얇은 껍데기. `import "server-only"`.
⚠️ **판정을 여기 두지 않는다** — 껍데기는 I/O만 든다.
검증: `pnpm typecheck` green. 실 API 호출은 `pnpm test` 밖이다(`smoke:github`와 같은 부류).

## 3. 환경변수 배선

`lib/env.ts`를 지나는 읽기 + **`.env.example` 갱신**(같은 커밋).
⚠️ **모듈 최상위 평가 금지** — 함수 안에서 읽고, 그 함수를 최상위 `const`가 부르지 않는다.
검증: `.env.local`을 잠시 치운 상태에서 `pnpm build`가 죽지 않는다.

*커밋 경계* — `feat(upload): store one image per user`

## 4. Server Action 둘

`app/(edit)/account/actions.ts`에 `uploadProfileImage` · `deleteProfileImage`.
`requireUser` → 판정 → 저장 → `User.image` 갱신(PII 봉투) → 옛 파일 정리 → `revalidatePath("/", "layout")`.
⚠️ **무효화 범위가 layout이다** — 셸 아바타·사용자 메뉴가 같은 값을 읽는다.
⚠️ **거부는 값으로 돌려준다** — 던지면 digest만 남은 일반 오류가 되고 사유가 통째로 사라진다.
검증: `pnpm test`의 Action 계약 테스트 + `app/(edit)/__tests__/authorization.test.ts`에 두 Action이 든다.

*커밋 경계* — `feat(account): upload and delete the profile picture`

## 5. OPERATIONS 갱신

PII 키 분실 시 **사진 URL이 복구 불가**이고 파일이 고아로 남는다는 줄을 키 절차에 더한다.
검증: `/doc-check`이 그 문장과 코드를 대조해 통과한다.

*커밋 경계* — `docs(OPERATIONS): a lost PII key orphans the uploaded picture`

## 6. 소비자는 이 기능이 아니다

화면([Image upload]·[Delete]·캡션)은 **`account-settings`**가 든다. 여기서 만드는 것은 능력까지다.
검증: `docs/features/account-settings/tasks.md`가 이 Action 둘을 이름으로 참조한다.
