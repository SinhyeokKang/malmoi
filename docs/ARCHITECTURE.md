# ARCHITECTURE

**코어 로직(`lib/export.ts`·`lib/githash.ts`·`lib/github.ts`·`lib/scan/`)을 건드리기 전에 읽는다.** 무엇을 만드는지는 [MVP.md](./MVP.md), 어떻게 작업하는지는 [../CLAUDE.md](../CLAUDE.md). 이 문서는 **불변식과 함정**만 다룬다.

> 코드가 아직 서지 않은 항목은 `(미구현)` 표시. 구현하면서 실제 동작과 어긋난 부분을 갱신한다.

## 1. export 결정성 (미구현 — `lib/export.ts`)

**불변식: 같은 DB 상태 → 언제나 바이트 단위로 같은 파일.**

깨지면 blob SHA 비교(§2)가 매번 "변경됨"을 뱉는다. 결과는 야간 cron이 매일 무의미한 커밋을 얹어 PR diff가 노이즈로 덮이는 것 — 조용히 망가지고 며칠 뒤에 발견된다.

| 규칙 | 값 | 깨지는 방식 |
|---|---|---|
| 키 정렬 | 코드포인트 오름차순 | `localeCompare`를 쓰면 **Node ICU 버전·로케일에 따라 순서가 달라진다.** 반드시 `<` 비교 또는 `sort()` 기본 동작 |
| 들여쓰기 | 2칸 | `JSON.stringify(obj, null, 2)` |
| 파일 끝 개행 | 정확히 1개 | `JSON.stringify`는 개행을 안 붙인다. `+ "\n"` 필요. 2개가 되면 SHA가 달라진다 |
| `orphaned` 키 | 제외 | DB엔 남는다 — export에서만 빠진다 |

**`JSON.stringify`의 키 순서는 객체 삽입 순서를 따른다.** 정렬한 키 배열로 객체를 재조립해야 하고, DB에서 온 순서를 믿으면 안 된다 (Postgres는 `ORDER BY` 없는 쿼리의 순서를 보장하지 않는다).

**빈 로케일 처리 미정**: 번역이 하나도 없는 로케일의 파일을 빈 객체(`{}`)로 낼지, 아예 안 낼지. 구현 시 결정하고 여기 적는다.

## 2. blob SHA 로컬 계산 (미구현 — `lib/githash.ts`)

```
sha1("blob " + byteLength + "\0" + content)
```

**`byteLength`는 문자 수가 아니라 UTF-8 바이트 수다.** 한국어·프랑스어 번역이 들어가므로 `content.length`를 쓰면 즉시 틀린다 — `Buffer.byteLength(content, "utf8")`.

이 함수의 목적은 **API 호출을 건너뛰는 것**이다. base 트리의 blob SHA와 비교해 전부 같으면 GitHub API를 한 번도 더 부르지 않는다. 변경 없는 날이 대부분이라 이게 기본 경로다.

검증: 실제 파일에 `git hash-object <file>`를 돌린 값과 일치해야 한다. 테스트에 골든 값을 박는다 (빈 파일, ASCII, 한글, 이모지 각 1건).

## 3. GitHub Git Data API 흐름 (미구현 — `lib/github.ts`)

clone하지 않는다. 순서:

1. `GET /repos/{o}/{r}/git/ref/heads/{base}` → base head SHA
2. `GET /repos/{o}/{r}/git/trees/{sha}?recursive=1` → 기존 `_locales/**/messages.json`의 blob SHA
3. 로컬 export + blob SHA 계산 → 비교. **전부 같으면 종료**
4. 변경분마다 `POST /git/blobs`
5. `POST /git/trees` — **`base_tree`를 반드시 넘긴다.** 빼면 트리가 새로 만들어져 리포의 나머지 파일이 전부 삭제된 커밋이 된다
6. `POST /git/commits` — `parents: [baseHeadSha]`, 메시지에 `[skip-l10n]`
7. `PATCH /git/refs/heads/l10n%2Fsync` — `force: true`

### 함정

- **`l10n/sync`의 `/`는 URL 인코딩이 필요하다.** ref 경로에 슬래시가 그대로 들어가면 404가 난다.
- **브랜치가 없으면 `PATCH`가 아니라 `POST /git/refs`다.** 첫 실행 경로를 반드시 다뤄야 한다.
- **parents는 항상 base head다.** `l10n/sync`의 기존 head를 parent로 쓰면 누적 히스토리가 되고, base가 앞서 나간 뒤엔 3-way merge가 필요해진다 — 코어 원칙 위반.
- **force update는 의도된 것이다.** `l10n/sync`는 히스토리가 아니라 "현재 DB 상태의 스냅샷"이다.
- **`[skip-l10n]` 마커가 없으면 무한 루프**: pull이 만든 커밋이 main에 머지되면 push가 돌아 다시 DB에 쓰고, 그게 pull을 트리거한다.
- **PR은 하나를 재사용한다.** `GET /pulls?head=l10n/sync&state=open`으로 먼저 조회. PoC 리포에 PR 수십 개가 쌓이면 사람이 안 본다.

## 4. 스캐너 계약 (미구현 — `lib/scan/`)

**출력**: `{ key, sourceText, description?, refs: [{ path, line }] }[]`

**입력 경로 2개** — JS/TS는 ts-morph AST, HTML·`manifest.config.ts`의 `__MSG_key__`는 정규식. 정규식 경로는 원문을 주지 못하므로 **키만** 수집하고, 원문은 AST 경로가 채운다. 양쪽에 없는 키는 CI 실패.

**CI 실패 조건 (조용한 누락을 만들지 않는 게 목적)**
1. `t()` 호출의 1·2번 인자가 문자열 리터럴이 아니다 → `// @l10n-keys a, b` 주석으로 명시 등록 가능
2. 같은 키에 서로 다른 원문
3. 정규식 경로에서만 발견된 키에 대응하는 원문이 없다

**AST를 쓰는 이유**: 정규식 단독은 주석 속 호출, 문자열 리터럴 안의 `t(`, 템플릿 조립을 구분하지 못한다. 유일한 진실 공급원이므로 오탐이 곧 잘못된 키 삭제(=`orphaned` 오설정)로 이어진다.

**`refs`는 push마다 전체 교체한다.** 증분 갱신은 삭제 케이스를 놓치기 쉽고, 스캔이 전수라 교체가 더 정확하고 단순하다.

## 5. 스키마 결정 (미구현 — `prisma/schema.prisma`)

테이블 정의는 [MVP.md](./MVP.md) §6. 여기엔 *왜* 그렇게 했는지만.

- **`namespace`는 파생값인데도 컬럼으로 저장한다.** 사이드바 쿼리가 이 컬럼 하나로 끝나고, 키에서 매번 파싱하면 인덱스를 못 탄다.
- **`sourceHash`를 따로 둔다.** 원문 문자열 비교로도 stale을 감지할 수 있지만, 해시면 인덱스가 작고 비교가 싸다. 긴 원문이 많다.
- **`Translation`에 `UNIQUE(keyId, locale)`.** 이게 없으면 중복 행이 생겨 export가 비결정적이 된다 — §1 불변식이 스키마에 의존한다.
- **`orphaned`는 `StringKey`에, `needsReview`는 `Translation`에.** 키의 존재 여부는 코드가, 번역의 신선도는 값마다 판정되기 때문이다.

## 6. 인증 경계

**두 GitHub 자격증명을 섞지 않는다.**

| 용도 | 자격증명 | 이유 |
|---|---|---|
| 편집 UI 로그인·인가 | GitHub OAuth (Auth.js) | 리포 접근 권한이 곧 편집 권한 |
| `l10n/sync` 쓰기 | GitHub App installation token | OAuth 토큰으로 커밋하면 커밋이 개인 명의가 되고 그 사람이 org를 떠나면 깨진다 |
| `/api/push` 호출 | Bearer `PUSH_TOKEN` | Actions는 사람이 아니다 |
| `/api/pull` cron 호출 | `CRON_SECRET` | 공개 엔드포인트면 아무나 커밋을 유발할 수 있다 |

**인가는 fail-closed다.** `AUTH_ALLOWED_ORG`가 비어 있으면 아무도 들어오지 못한다 — 빈 값을 "제한 없음"으로 해석하면 설정 누락이 곧 전면 공개가 된다.

**GitHub App 개인키는 개행이 든 PEM이다.** Vercel env에 넣으면 개행이 `\n` 문자열로 이스케이프되므로 읽는 쪽에서 복원해야 한다. 안 하면 JWT 서명이 **조용히** 실패한다.

## 7. Supabase / Prisma

- **런타임 `DATABASE_URL`은 pooler(6543) + `?pgbouncer=true`.** 이 쿼리 파라미터가 없으면 prepared statement 충돌로 **간헐** 실패한다 — "가끔 되고 가끔 안 됨"이라 진단이 오래 걸린다.
- **마이그레이션 `DIRECT_URL`은 direct(5432).** pooler는 DDL 세션을 못 잡아 마이그레이션이 실패한다.
- **배포 순서는 additive-first.** 스키마를 먼저 넓히고(`db:deploy`) 코드를 배포한다. 컬럼 삭제·타입 변경은 코드 배포 후 별도 마이그레이션. 순서를 어기면 배포 순간 프로덕션이 없는 컬럼을 조회한다.

## 8. Vercel

- **Cron은 Hobby 플랜에서 하루 1회.** 야간 pull 1회가 요구사항이라 지금은 맞다.
- **서버리스 함수 타임아웃**: 로케일이 많아지면 pull이 순차 API 호출로 시간을 먹는다. 지금은 3개라 문제없지만 늘어나면 blob 생성을 병렬화한다.
