# 키 구분자를 계약으로 뺀다 — tasks

**순서 원칙**: 순수 함수 → 계약 → 어댑터 → 배선(5홉) → 측정 층 → 문서.
역순이면 테스트 못 하는 코드를 먼저 쌓는다.

---

## 1. 순수 함수 (`lib/adapters/key-path.ts`) — `/tdd` 진입점

`electSeparator` · `joinKey` · `splitKey` · `shadowedKeys` · `treeFor` · `treeFromColumns`.
`shared.ts`는 **만지지 않는다** (동시 작업과의 충돌 회피 — design §4).

- 검증: `pnpm test` green. 케이스에 **siyuan 모양**(전 파일 중첩 + 점 세그먼트 → `/` 선출)과
  **musicblocks 모양**(중첩 1 + flat 83 → **가드로 `.` 유지**)이 실제 문자열로 들어 있다.
- 검증: **최상위 키가 세그먼트로 세어진다** — `{"문장.": {"kanji": …}}`만 주면 `.`이 탈락한다.
  이 단언이 design §2의 "세그먼트" 정의를 코드에 박는다. **빠지면 판정이 조용히 반대로 뒤집힌다**
  (musicblocks 실측: 최상위 656키가 점을 품고 2단 이름은 `kanji`·`kana` 둘뿐이다).
- 검증: `electSeparator`가 `hasFlatFile: true`이면 세그먼트에 점이 있어도 `.`을 낸다 (회귀 가드).
- 검증: `electSeparator`가 후보 전부 막힌 입력에서 마지막 후보를 낸다(던지지 않는다).
- 검증: `treeFor`의 폴백 4단(`tree` → `nestedByPath` → `nested` → 기본)이 각각 단언된다.

**커밋 경계** — `test(adapters): key path algebra` + `feat(adapters): key separator election`

## 2. 계약 (`lib/adapters/types.ts`) + 어댑터 5개의 `read`

`KeyTree` 타입, `DetectedFormat.tree?`, `ReadResult.tree`(**required**).
`chrome-locales`·`ts-dict`는 `{ separator: ".", style: "flat" }` 고정, 나머지 셋은 선출.
`nested`·`nestedByPath`는 **그대로 채운다**(레거시 폴백).

- 검증: `pnpm typecheck` — required 필드라 안 채운 어댑터가 있으면 컴파일이 막는다.
- 검증: `pnpm test` green. 기존 read 테스트의 키 텍스트가 **하나도 안 바뀐다**(`.`이 안전한 픽스처).

**커밋 경계** — `feat(adapters): observe the key tree while reading`

## 3. 어댑터 3개의 `write`

`json-catalog`(분해·접두 충돌) · `yaml-catalog`(`resolveLast`·`insertPath`) ·
`code-dict`(`findScalar`·`insert`)의 `const SEP` 제거 → `treeFor(format, path)`.

- 검증: `key-order-golden.test.ts`의 **`describe("L2 — 알려진 한계: '.'가 조인 구분자여서 생기는
  모양 변형")` 블록만 red가 되고, 그 기대값을 새 출력으로 교체한다.** ⚠️ 그 블록은 오늘 동작을
  일부러 박아둔 기준선이고 주석이 "**이 테스트가 red가 되고, 그때가 바로 이 한계가 사라지는
  순간이다**"라고 적어 놨다 (`key-order-golden.test.ts:210-226`). **red가 안 나오면 선출이
  프로덕션 경로를 안 지난 것이다** — 통과를 성공으로 읽지 않는다.
- 검증: 그 블록 **밖의** 골든 픽스처는 전부 **바이트 동일**로 통과한다 (완료 조건 ③).
- 검증: siyuan 픽스처의 `writeWithErrors` 에러가 **0**이고 read→write→read가 의미 동일하다 (완료 조건 ②).
- 검증: musicblocks 픽스처(중첩 1 + flat 형제)가 **오늘과 같은 바이트**를 낸다 — 가드가 동작한다.
- 검증: 로케일 간 구조가 갈리는 픽스처는 **여전히 에러 1건**을 낸다 (완료 조건 ④ — 보고 통로).

**커밋 경계** — `fix(adapters): restore nesting with the elected separator`

## 4. 계약 테스트 (`lib/adapters/__tests__/contract.ts`)

`ADAPTERS` 순회에 추가: ① `read`가 `tree`를 반드시 낸다 ② `tree.separator`가 빈 문자열이 아니다
③ 선출된 구분자로 조인한 키가 `splitKey`로 원래 세그먼트를 되돌린다(**단사 검사**).
네거티브: 구분자를 무시하는 가짜 어댑터가 걸린다.

- 검증: `pnpm test` green + 네거티브가 실제로 red를 낸다(일부러 깨뜨려 확인).

**커밋 경계** — `test(adapters): pin the key tree contract`

## 5. 스키마 + 마이그레이션 (`/db`)

`Project.tree Json?` 추가. **additive 하나뿐.**

- 검증: `pnpm db:migrate --create-only`로 파일 생성 → SQL이 `ADD COLUMN` **한 줄**인지 눈으로 확인.
- ⚠️ **`pnpm db:deploy` 실행 금지.** 배포 순서 판정은 메인 세션이 한다.

**커밋 경계** — `feat(db): add Project.tree`

## 6. 배선 5홉 (b·c·d)

`lib/push/plan.ts`(zod, `tree` optional) → `payload.ts` → `apply.ts`(Project 저장) →
`lib/pull/load.ts`(`select`) → `lib/pull/plan.ts`(`ProjectFormatColumns.tree` **required** +
`treeFromColumns`).

- 검증: `lib/pull/__tests__/entry-order.test.ts`가 **진입점에서** siyuan/musicblocks 모양을 단언한다
  — 홉 하나를 지우면 red (완료 조건 ①).
- 검증: `lib/push/__tests__/flow.test.ts`가 b→c 홉을 SQL 인자로 본다.
- 검증: `pnpm typecheck` — `ProjectFormatColumns.tree`가 required라 `select` 누락을 컴파일러가 막는다.

**커밋 경계** — `feat(pull): carry the key tree from push to write`

## 7. CLI·측정 층

`scripts/ingest.ts`·`push-local.ts`(포맷에 `tree` 싣기, 출력 한 줄에 구분자 표시) ·
`scripts/smoke-github.ts`(`select`) · `lib/survey/one.ts`(`duplicateCount`·write 포맷) ·
`lib/survey/json-shape.ts`(`dottedWithNested` 판정).

- 검증: `pnpm test` green. survey 단위 테스트가 프로덕션과 같은 함수를 쓰는지 확인
  (측정 층이 다른 것을 재면 안 된다 — design §8).

**커밋 경계** — `refactor(survey): measure what production does`

## 8. 문서

`docs/MVP.md` §4.1·§4.2·§5.1(어댑터 계약)·§6(스키마) / `docs/ARCHITECTURE.md` §1.35(홉 표 교체) /
`docs/TASKS.md` §8 후속 체크 / `docs/ADAPTER-COVERAGE.md` §6-1 상태 / `docs/POSTMORTEM.md`
("포맷 단위로 정할 것을 파일 단위로 들지 않는다" 규칙 추가는 `/postmortem`이 판단).

- 검증: 코드에 없는 함수를 가리키는 문장이 남아 있지 않다 (`nested: boolean` 서술 전수).

**커밋 경계** — 문서별 `docs(<scope>): ...`

---

## 후속 (이번 범위 아님)

- **레거시 컬럼 정리** — `Project.nested`·`nestedByPath` DROP + `treeFor`의 폴백 제거.
  **코드 배포가 끝난 뒤 별 마이그레이션**이다 (additive-first의 뒷단).
- **구분자 스티키** — 저장된 구분자가 아직 안전하면 유지해 재키잉을 막는다. read가 도는 곳이
  대상 리포의 CI라 DB를 모르는 것이 걸림돌이다 (design §2).
- **재측정** — 학습·홀드아웃 **둘 다**. `/push` 4d가 판단 지점으로 묻는다.
