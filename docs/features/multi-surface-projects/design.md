# Multi-surface projects — Design

범위와 라운드 분할은 `spec.md` §0을 따른다. `[2라운드]` 표시는 이 문서에서도 같은 뜻이다.

## 1. 설계 결정

### 1.1 소유권

`Project`는 리포 정체성, GitHub 설치, base branch, 멤버십, push token, Publish 브랜치·PR과 `SyncRun`을
소유한다. 새 `TranslationSurface`는 번역 파일 묶음과 push 현실을 소유한다.

push token은 표면별로 나누지 않는다. 이 토큰이 증명하는 것은 **어느 Project의 리포에서 온 요청인가**이고,
표면별 권한 차이가 없으므로 token을 나눠도 인가 범위가 좁아지지 않는다. 인증된 Project 안에서 필수
`surfaceSlug`가 적재 대상을 정한다. 표면별 token은 secret 발급·회전·workflow 관리만 표면 수만큼 늘린다.

| Project에 남음 | TranslationSurface로 이동 |
|---|---|
| slug, name, defaultSurfaceId | slug, archivedAt |
| repoOwner, repoName, repositoryId, installationId, baseBranch | adapterName, pathTemplate, nested, nestedByPath |
| pushTokenHash, archivedAt | baseLocale, declaredBaseLocale |
| lastPulledAt, lastPublishedAt, lastPrUrl | lastCommitSha, lastCommitAt |
| SyncRun, ProjectMember | lastImportStartedAt, lastImportError |

프로젝트의 `lastPulledAt`은 **모든 표면**(비활성 포함) Translation의 캡처된 최대 `updatedAt`이다. Publish가
tree 전체를 한 번에 만드므로 진행 기준도 프로젝트 하나다. 표면별 Publish 시각이나 PR 상태는 만들지 않는다.

⚠️ **비활성 표면은 1층 캡처에는 들고 미발송 집계에는 들지 않는다.** 캡처를 활성으로만 좁히면 보관 표면의 편집
한 건이 매일 밤 1층을 깨워 트리와 blob을 전량 읽고(1층의 존재 이유가 사라진다), 집계에 비활성을 넣으면
`Send changes (N)`의 N이 **Publish가 영영 못 보내는 행**을 센다.

### 1.2 표면 정체성

`TranslationSurface`는 `id`, `projectId`, `slug`, `archivedAt`을 가지며 `@@unique([projectId, slug])`다. slug는 URL,
workflow input, 결정적 정렬의 안정 식별자다. 별도 이름은 저장하지 않고 UI 라벨은 slug의 원본 조각을 쓴다.

**slug = path template에서 로케일·와일드카드·파일명을 걷어낸 마지막 디렉터리 조각**이다. 충돌하면 `-2`, `-3`.

| pathTemplate | slug |
|---|---|
| `_locales/{locale}/messages.json` | `_locales` |
| `src/i18n/{locale}.json` | `i18n` |
| `packages/excalidraw/locales/{locale}.json` | `locales` |
| ts-dict 글롭 `src/dictionaries/*.ts` (`{locale}` 없음) | `dictionaries` |

세 형(디렉터리형·파일형·글롭형)이 규칙 하나로 답이 난다. 소문자화·ref-safe 정규화는 프로젝트 slug와 같은
`lib/onboarding/slug.ts` 관용구를 재사용하되 **`new` 같은 라우트 예약어는 표면 slug에도 막는다**(`/surfaces/` 아래
하위 경로가 생기면 같은 문제가 반복된다). slug 변경은 비목표다.

기존 프로젝트의 첫 표면 slug는 adapter나 경로에서 추론하지 않고 `default`로 backfill한다. 추론은 리포를
재포맷하면 바뀌고 URL·workflow 계약을 흔든다.

**새 프로젝트의 `defaultSurfaceId`는 탐지 1순위 후보**다. ⚠️ 키 수로 정하지 않는다 — PRODUCT §7.3이 키 수 정렬을
실측으로 기각했고, 키 수는 `key-count-failed`로 부재할 수 있어 전순서조차 서지 않는다. 기본값은 이후 움직이지
않는다. `[2라운드]` 기본 표면을 비활성화할 때만 **slug 알파벳순 첫 활성 표면**으로 옮긴다(탐지 순위는 생성
시점의 값이라 나중에 재계산할 수 없다).

### 1.3 파일 소유권

표면끼리 출력 경로가 겹치면 우선순위를 두지 않고 거부한다. 경로 템플릿 문자열만 비교하면 glob과 실제 파일의
교차를 놓치므로 두 층에서 검사한다.

1. 표면 추가: base tree를 읽고 각 표면의 `resolveLocalePaths` 결과를 만든 뒤 교집합을 검사한다.
2. Publish: 실제 pull target을 모두 해석한 뒤 `path -> surfaceId` 소유 맵을 만들고 중복이면 GitHub write 전에 실패한다.

새 파일 경로는 추가 시점에 없을 수 있으므로 Publish 검사가 최종 방어선이다. 충돌을 자동 병합하거나 마지막
표면 우선으로 처리하지 않는다.

⚠️ **경로 충돌은 DB 제약이 아니다.** slug 충돌은 `@@unique([projectId, slug])`가 잡지만 경로는 아무도 안 잡으므로,
표면 추가는 `Project` 행 `FOR UPDATE` 락을 잡은 **뒤에** 활성 표면을 다시 읽어 소유 맵을 만든다(POSTMORTEM
2026-09-13 "락 전에 읽어 재사용 결과가 달라졌다"). GitHub 호출은 락 밖이다(ARCHITECTURE §5.6.1).

**비활성 표면이 소유하던 출력 파일은 리포에 그대로 남는다.** Publish에서 빠질 뿐 지우지 않는다 — 그 경로는
활성 표면의 충돌 검사 대상에서도 빠지므로, 비활성 표면과 같은 경로를 갖는 새 표면을 만들 수 있고 그 표면이
파일의 새 소유자가 된다.

## 2. 스키마

### 2.1 새 모델

```prisma
model TranslationSurface {
  id        String @id @default(cuid())
  projectId String
  slug      String
  archivedAt DateTime?

  adapterName       String?
  pathTemplate      String?
  nested            Boolean?
  nestedByPath      Json?
  baseLocale        String?
  declaredBaseLocale String?
  lastCommitSha     String?
  lastCommitAt      DateTime?
  lastImportStartedAt DateTime?
  lastImportError   String?

  project Project @relation(fields: [projectId], references: [id], onDelete: Restrict)

  @@unique([projectId, slug])
  @@unique([projectId, id])
}
```

정확한 relation 이름과 index는 Prisma 검증 과정에서 기존 쿼리에 맞춰 확정하되, `projectId`를 자식 행에서
제거하지 않는다. RLS가 없으므로 프로젝트 조건은 계속 모든 쿼리의 1차 경계다.

⚠️ `prisma/__tests__/schema-contract.test.ts`가 "모든 `@@index` 선두 컬럼은 `projectId`"를 센다. 표면별 조회
인덱스는 `(projectId, surfaceId, ...)`로 만들어 그 계약을 지킨다.

### 2.2 자식 모델

`Locale`, `StringKey`, `Translation`에 `surfaceId`를 추가한다.

- `Locale`: PK를 `[projectId, surfaceId, code]`로 변경
- `StringKey`: unique를 `[projectId, surfaceId, key]`, 참조용 unique를 `[projectId, surfaceId, id]`로 변경
- `KeyRef`: 전역 유일한 `StringKey.id`를 가리키는 **단일 컬럼 FK를 그대로 둔다**(unique 제약은 원래 없고
  `@@index([keyId])`뿐이다). 소속은 부모 StringKey가 결정하며 조회·삭제 후보를 `[projectId, surfaceId]`로 좁힌다.
- `Translation`: `StringKey`와 `Locale` 양쪽에 `[projectId, surfaceId, ...]` 복합 FK로 연결

⚠️ **`Translation`의 `[keyId, localeCode]` unique는 바꾸지 않는다.** 표면 경계를 **강제**하는 것은 복합 FK이지
이 unique가 아니고, keyId가 전역 유일이라 `[surfaceId, keyId, localeCode]`로 바꿔도 제약으로 얻는 것이 0이다.
반대로 잃는 것은 둘이다 — ARCHITECTURE §5가 "키+로케일 단건 조회 인덱스를 겸한다"고 명시한 성질과,
`app/(edit)/actions.ts`의 `keyId_localeCode` 복합 선택자·`lib/push/apply.ts`의 `ON CONFLICT ("keyId","localeCode")`.

모든 목록·집계·저장 쿼리는 인가된 `projectId`와 route가 정한 `surfaceId`를 함께 요구한다.

### 2.3 스키마 전환 순서 — 배포 둘

prod 데이터는 버려도 되지만 **야간 cron과 대상 리포 CI는 마이그레이션과 코드 배포 사이에도 계속 쓴다.**
그래서 `/db` 규칙대로 **additive → 코드 배포 → destructive** 두 배포로 쪼갠다.

#### 배포 1 — 단계 A(additive + backfill) + surface 코드 전부

1. `TranslationSurface`, `Project.defaultSurfaceId`, nullable `surfaceId` 컬럼을 추가한다.
2. 모든 기존 Project에 `slug = "default"` 표면을 만들고 Project의 포맷·push 상태를 복사한다.
3. 기존 자식 행을 그 표면으로 backfill한다.
4. **옛 제약(`Locale` PK, `StringKey` unique, `Translation` unique)은 전부 그대로 둔다.** nullable 상태에서 가능한
   새 복합 unique/index/FK와 Surface별 조회 인덱스만 추가한다.
5. 새 테이블의 `anon`·`authenticated` 권한이 0인지 확인한다(`/db` 5단계 — `ALTER DEFAULT PRIVILEGES`가 절반만
   닫으므로 여기는 예방이 아니라 탐지다).
6. 코드는 `surfaceId`를 읽고 쓰되 **표면은 프로젝트당 하나**다. Add surface 진입점은 닫아 둔다.

#### 배포 2 — 단계 B(제약 교체) + Add surface 개방

1. `surfaceId`를 NOT NULL로 바꾼다. ⚠️ **사전조건은 "null 0건"이고 마이그레이션 안에서 검사한다** — 배포 1과
   배포 2 사이에 도착한 CI push가 null 행을 새로 만들 수 있으므로 **backfill을 여기서 한 번 더 돌린다**.
   선례: `20260910060000_finalize_credential_storage`의 `LOCK TABLE` + `DO $$ … RAISE EXCEPTION 'precondition failed'`.
2. 복수 Surface의 같은 locale code·key가 공존하도록 옛 제약을 교체한다. **순서가 있다** — `Locale` PK는
   `Translation_projectId_localeCode_fkey`의 대상이므로 **그 FK를 먼저 DROP**하지 않으면 PK 교체가
   *other objects depend on it*으로 실패한다.
3. 같은 커밋에서 함께 움직여야 하는 코드: `lib/push/apply.ts`의 `ON CONFLICT ("projectId","code")`와
   `WHERE projectId AND key` UPDATE 3문(옛 unique가 단일 행을 보장해 주던 문장이다),
   `app/(edit)/actions.ts`의 `projectId_code` 복합 선택자.
4. Project의 이동 대상 컬럼을 제거한다. ⚠️ **읽는 쪽이 전부 Surface로 옮겨진 뒤다** — `lib/pull/load.ts`,
   `lib/pull/plan.ts`, `lib/keys/query.ts`, `lib/projects/remote.ts`, settings·locales 화면.
5. 실제 PostgreSQL에서 같은 key·locale 공존과 교차 Surface FK 거부를 확인한 뒤 Add surface를 연다.

**prod 반영은 각 배포의 `/merge` 1단계다.** `/push` 시점으로 당기지 않는다 — 프로덕션이 코드보다 앞서 있는 창을
필요 이상으로 길게 연다.

`Translation(projectId, updatedAt)`의 프로젝트 전체 인덱스는 1층 skip·Home 집계를 위해 유지하고, Surface별
목록·미발송 쿼리에는 `(projectId, surfaceId, ...)` 인덱스를 둔다. 실제 쿼리는 `EXPLAIN`으로 확인한다 —
판정 기준은 **목록·미발송 쿼리에 Seq Scan이 없고 새 복합 인덱스를 탄다**이다.

## 3. push 흐름

### 3.1 외부 계약

`PushPayload`에 **필수** `surfaceSlug`를 추가한다. composite action에는 `surface` input을 추가하고 **`action.yml`에서
기본값을 `"default"`로 준다** — 기존 workflow 호환은 이 한 줄로 얻고 **서버 스키마는 필수를 유지한다**.
`z.default`로 서버에서 채우면 `z.infer` 생산자 타입에서 필드가 optional이 되어 POSTMORTEM 2026-08-31이 닫은
구멍이 다시 열린다. 서버가 adapter/path에서 표면을 추측하지 않는다.

action에는 등록 때 확정한 `pathTemplate` input도 추가해 같은 adapter의 후보 둘이 서로 다른 파일 묶음을 읽게 한다.
⚠️ **그 값은 외부가 나르는 경로다**(POSTMORTEM 2026-09-09: 페이로드가 리포 경로를 정해 임의 파일 쓰기가 가능했다).
방어를 두 층에 건다 — zod에서 `lib/locale-code.ts`의 경로 안전성 검사, 그리고 **서버에 등록된
`surface.pathTemplate`과의 대조**(`checkFormat`). 탐지용 판정을 적재 방어로 재사용하지 않는다.

`surfaceSlug`를 나르는 외부 생산자는 **둘**이다.

1. `lib/push/payload.ts`의 `buildPushPayload` — `scripts/push-local.ts`·`lib/onboarding/ingest.ts`가 쓴다.
2. ⚠️ **적재 실패 보고**: `scripts/push-local.ts`가 `/api/push/failure`로 보내는 `JSON.stringify({...})` **리터럴**.
   수신부가 `lastImportError`를 쓰는데 그 컬럼이 Surface로 내려가므로 여기에도 `surfaceSlug`가 필요하다.
   두 페이로드 모두 `z.infer` 타입을 생산자에 붙여 다음 필드 추가를 컴파일 에러로 만든다.

인증 순서:

1. Bearer hash로 Project를 정한다.
2. payload project slug를 대조한다.
3. `(projectId, surfaceSlug)`로 활성 표면을 조회한다.
4. 표면이 없거나 비활성이거나 다른 프로젝트 소속이면 **구별할 수 없는 409 하나**를 낸다. 기존 409는 `expected`를
   본문에 싣지만 **표면 목록은 싣지 않는다** — 그 자리가 유일한 누설 경로다. 404는 이 라우트에 없다.
5. `checkFormat`과 `checkCommitOrder`는 그 표면 행만 대조한다.

### 3.2 적용

`applyPush(prisma, { projectId, surfaceId }, payload, options)`로 경계를 명시한다. 기존 SQL의 모든 Locale,
StringKey, Translation, KeyRef upsert/orphan 조건에 두 ID가 함께 들어간다. 다른 표면의 행은 후보 집합에도
들지 않아야 한다. ⚠️ `lib/push/__tests__/flow.test.ts`의 SQL 인자 캡처가 unnest 컬럼 목록과 값 배열 개수를
대조하는 유일한 자리다(ARCHITECTURE §5.5.6: 타입이 같으면 값이 옆 컬럼으로 들어가도 런타임이 조용하다).
`surfaceId` 열이 늘면 **거기가 먼저 red여야 한다**.

`lastCommit*`, base 변경 선언 소비, import 진행/오류는 표면 행에 기록한다. 한 표면의 실패가 다른 표면의
최근 성공 상태를 덮지 않는다. base 선언 소비는 `baseChanged`가 참인 push에서만 그 표면 값을 비운다
(POSTMORTEM 2026-09-09: 판정 술어를 "이벤트"가 아니라 "소비"로 쓴다).

## 4. 편집 UI

### 4.1 인가와 라우팅

`requireProjectAccess(projectSlug, permission)`으로 프로젝트를 먼저 인가한 뒤 표면을 좁힌다. 새 껍데기 둘
(페이지용·Action용, 이름은 구현에서 확정)은 인가된 `projectId`와 `surfaceId`를 **함께** 반환한다. 비활성·다른
테넌트·존재하지 않는 slug는 모두 `notFound()`로 접는다. Server Action은 클라이언트가 보낸 surface id를
신뢰하지 않고 project slug + surface slug에서 다시 구한다.

번역·로케일 경로만 `/surfaces/:surfaceSlug` 아래로 이동한다. Home, Members, Logs, Settings와 Publish는
프로젝트 단위로 남는다. 라우트 생성은 `lib/routes.ts` 한 곳이 소유하고(그 파일은 import 0인 잎이어야 한다),
수신자·생성자 대조는 `app/__tests__/entry-points.test.ts`와 `lib/__tests__/routes.test.ts`가 본다.

⚠️ 이관에 딸린 배선이 셋이다. 전부 타입이 못 보는 부류다.

1. **사이드바 활성 판정과 href.** `lib/shell/nav.ts`는 `pathname`의 3번째 세그먼트로 slug를 읽고 Translations·
   Locales를 `exact: false` 접두로 판정하며 href가 `routes.translations(slug)`다. 경로가 한 단계 깊어지면
   **두 항목이 항상 비활성**이 되고, 표면 B에서 누르면 default A로 점프한다(POSTMORTEM 2026-09-05 그 모양).
   nav href가 현재 표면을 들고 활성 판정에 surface 세그먼트 규칙을 넣는다.
2. **`export const maxDuration = 60`.** 지금 `translations/page.tsx`가 들고 있고, 없으면 기본 300이
   `STALE_AFTER_SECONDS`(300)와 같아져 **정상 실행이 스스로를 stale로 본다**(ARCHITECTURE §5.6.2).
   새 세그먼트와 Add surface 화면이 각각 선언한다.
3. **`revalidatePath` 전수.** 현재 형태가 `` `/projects/${slug}` `` + `"layout"`이라 표면 하위까지 덮지만,
   "이 경로가 그 상태를 보이는 화면 전부를 덮나"를 한 번 묻는다(POSTMORTEM 2026-09-09 822행의 재발 방지 grep).

### 4.2 표면 선택기

패널 머리에만 둔다. 사이드바는 건드리지 않는다 — DESIGN §6.5의 "스위처가 없다"는 의도된 판정이고 셸
레이아웃이 `[slug]` params를 받지 못한다. 라벨은 slug의 원본 조각이고 sans이며, 전체 path template은 보조
줄·tooltip이다. **표면이 하나면 그리지 않는다.** 각 항목 옆에 그 표면의 미발송 수를 배지로 보인다.
Publish 버튼 문구는 `Send changes (N)` 그대로다(사전 주석: git 어휘를 쓰지 않는다).

전환을 막지 않는다. 전환 시 **유효하지 않은 필터만** 떨어뜨린다. ⚠️ 선택기는 URL을 바꾸는 **세 번째 시작점**이므로
툴바·칩과 같은 pending·이동 함수를 공유한다(POSTMORTEM 2026-09-12 1140행).

선택기는 EDITOR도 본다 — 노출은 편의이고 판정은 Action이다. Add surface와 비활성화는 Settings에 있어
`project:settings`로 자동으로 OWNER 전용이다.

### 4.3 `[2라운드]` 표면 관리

Settings에 활성·비활성 Surface 목록과 [Add surface]를 둔다. 비활성화와 **되돌리기**를 같은 목록에서 제공한다
(PRODUCT §7.9: 되돌릴 링크에 도달할 길이 없으면 보관이 편도가 된다). 확인 Dialog의 세 문장은 spec §5.6에 있고,
그중 미발송 건수는 Dialog가 실제로 조회해서 싣는다 — 근거가 거짓인 Dialog를 만들지 않는다
(POSTMORTEM 2026-09-14 1419행).

## 5. pull과 Publish

### 5.1 로드

`loadPullState`는 Project와 Surface 목록을 한 번 읽고, 표면별 키·로케일·번역을 `surfaceId`로 분리한다.
표면은 slug 코드포인트 순으로 정렬한다. 각 표면은 기존 `formatFromProject`, `resolveLocalePaths`, writer 계약을
그대로 적용하되 입력을 Surface 행으로 바꾼다. ⚠️ `formatFromProject`의 반환 `DetectedFormat`에는 **`baseLocale`이
없다** — `lib/pull/run.ts`가 `project.baseLocale`을 따로 꺼내 쓰므로 그 자리도 이관 대상이다.

1층 스킵은 프로젝트 전체(비활성 포함) Translation 최대 `updatedAt`과 `Project.lastPulledAt`을 비교한다.
하나라도 바뀌면 GitHub base snapshot을 한 번 읽고 **활성 표면 전부**를 렌더한다. 표면별 GitHub snapshot이나
commit을 만들지 않는다.

⚠️ **cron 선택과 readiness 술어가 Project 컬럼 위에 서 있다.** `selectPullTargets`는 `installationId`·
`repositoryId`·`lastCommitSha`가 셋 다 있는 프로젝트만 고르고, `lib/onboarding/readiness.ts`·`lib/home/overview.ts`·
`lib/projects/list.ts`도 같다. `lastCommitSha`가 표면으로 내려가므로 **프로젝트 readiness를 "활성 표면 중 하나라도
첫 적재에 성공했다"로 다시 정의**하고 그 술어를 한 곳이 소유한다.

### 5.2 계획과 write

순수 계획 함수가 다음을 만든다.

```text
ordered surfaces
  -> resolved paths per surface
  -> reject duplicate path ownership
  -> render each surface from the same base snapshot
  -> flatten changes by path in codepoint order
  -> blob SHA compare
  -> one tree / one commit / one force update / one PR
```

표면 A가 만든 content를 표면 B의 original로 넘기지 않는다. 그렇게 하면 두 표면의 값을 병합하는 셈이다.
충돌은 렌더 전에 거부한다. `base_tree`, UTF-8 blob SHA, base head parent, `[skip-malmoi-i18n]`, force update와 열린 PR
재사용 규칙은 그대로다. 모든 렌더 결과의 blob SHA가 base와 같으면 stale sync branch를 base head로
force-update한 뒤 기존 2층 판정대로 `skipped`이며 새 commit과 PR 갱신을 하지 않는다. 이 성공 뒤에만 캡처한
`lastPulledAt`을 전진시킨다. 즉시 다시 실행하면 1층에서 GitHub API 0회로 끝나고, 값 불변 push가 `updatedAt`을
움직인 경우에만 2층 blob 비교까지 간다.

⚠️ **시간 예산을 잰다.** pull은 프로젝트 직렬이고 `maxDuration = 60`, blob 동시성은 8 고정이다. 스냅샷은 한 번이라도
**읽고 쓰는 blob 수는 표면 합산이라 배가 된다** — 2표면 프로젝트의 pull 1회 소요를 측정 항목으로 남긴다.
`selectPullTargets`의 상한 50도 "프로젝트당 비용이 대략 일정하다"를 전제로 잡힌 값이다.

### 5.3 SyncRun과 결과

`SyncRun`은 프로젝트 단위로 유지한다. 성공·실패·warning은 전체 Publish 결과다. 어느 표면에서 난 경고인지
표시할 수 있도록 warning에 `surfaceSlug`를 붙이되 DB에 별도 경고 이력을 만들지 않는다. 한 표면 렌더가 실패하면
tree를 만들지 않고 전체 Publish를 실패 처리한다.

## 6. 온보딩과 workflow

**후보 순위는 탐지기 순위 그대로**이고 키 수는 행에 표시만 한다(PRODUCT §7.3). 1라운드는 기존 Radio 행 형으로
후보 하나를 고른다. `[2라운드]` 다중 선택의 행 구조·초기 체크·접근 이름은 spec §5.7에 있다.

첫 적재의 원자성 단위는 **표면 하나**다. 한 표면 안의 일부 파일 실패는 현행 `partial-import` 그대로 화면에
드러내고(`lib/onboarding/ingest.ts`), 표면 전체가 실패하면 그 표면 행과 자식 넷만 롤백한다 — **이미 있던 표면은
건드리지 않는다.** ⚠️ 생성과 적재가 다른 요청인 것은 사고가 아니라 결정이다(`actions.ts`: "60초를 넘기면 행은
커밋됐는데 응답이 사라져 토큰 원문을 아무도 못 본다"). Add surface는 토큰을 새로 발급하지 않으므로 그 위험이
없지만, 적재 시간은 여전히 그 화면의 `maxDuration` 안이어야 한다.

결과는 최초 생성이면 전체 workflow, Add surface면 기존 token을 다시 노출하지 않고 추가할 action step을 보여준다.
`renderWorkflowYaml`은 최초 전체 파일과 추가 surface step을 별도 순수 함수로 만든다.

⚠️ **GitHub Actions의 `concurrency`는 워크플로/잡 단위이고 step 단위가 아니다.** `lib/onboarding/workflow.ts`가
이미 `group: malmoi-i18n-${slug}-${{ github.ref }}`를 내므로, 정확한 문장은 "step을 추가해도 워크플로의 concurrency
group은 그대로"다. ⚠️ `docs/ACTIONS.md`의 예시는 group이 하드코딩돼 렌더러와 다르고, 줄 단위 대조 테스트
(`lib/onboarding/__tests__/workflow.test.ts`)의 대상이 **첫 ```yaml 블록**이라 step renderer를 추가하면 그 블록도
같이 움직인다. **추가 step이 낼 YAML은 지금 대조 상대가 없다** — 대조 대상을 만든다.

⚠️ **대상 리포는 `@malmoi-i18n-push-v1` 불변 태그를 본다.** `surface` input을 늘려도 **태그를 옮기기 전까지 도달하지
않는다.** 태그를 옮기는 것이 릴리스이고, 그 절차가 tasks에 있다.

## 7. 순수 함수 — `/tdd interface` 대상

- `planSurfaceSlug(pathTemplate, existingSlugs)` — 마지막 디렉터리 조각 기반 slug와 suffix 판정
- `selectDefaultSurface(candidates)` — 탐지 1순위 판정, `[2라운드]` 비활성화 시 slug 알파벳순 대체
- `compareSurfaces` — 비교자 하나로 정렬 셋을 덮는다 (탐지 순위 / 라벨 알파벳순 / slug 코드포인트는 **키 추출만
  다르다**). 이름만 다른 정렬 함수를 셋 만들지 않는다.
- `planSurfaceArchive(surfaces, targetId, defaultSurfaceId)` — `[2라운드]` 마지막 활성 표면 차단과 새 기본값 판정
- `surfaceOwnership(resolvedTargets)` — 출력 경로 중복 탐지와 오류 모델
- `planMultiSurfacePull(surfacePlans)` — 충돌 없는 단일 tree 입력으로 평탄화
- `renderSurfaceWorkflowStep(input)` — 기존 workflow에 붙일 결정적 YAML 조각

접은 것 셋과 이유:

- ~~`checkSurfaceRoute`~~ — `surface.projectId === projectId` 한 줄이고, 그 판정의 정본은 **불변식 5**(모든 쿼리를
  `projectId`로 좁힌다)이지 별도 함수가 아니다.
- ~~`checkSurfaceFormat`~~ — `lib/push/guard.ts`의 `checkFormat`이 이미 `stored` 객체를 받는다. **입력 타입만 넓힌다** —
  새 이름을 만들면 "표면 교체" 판정이 두 벌이 된다.
- ~~`orderSurfaces`/`orderSurfaceNavigation`/`orderCandidateSurfaces`~~ — `compareSurfaces` 하나로 접는다.

## 8. 불변식 영향

### 번역 값과 키 소유권

소유자는 바뀌지 않고 범위만 Project에서 Surface로 좁아진다. push는 표면 안에서 strict overwrite하며 표면 간
값 비교·병합은 없다. 키와 로케일은 표면 안에서 삭제하지 않고 orphan으로 보존한다.

### 결정성

표면 순서와 최종 path 순서를 `compareKeys`로 고정한다. 모든 표면은 같은 base snapshot을 원본으로 읽는다.
출력 경로 충돌은 우선순위가 아니라 실패다. 기존 blob SHA·tree·commit 규칙을 그대로 재사용한다.

### 인증·테넌시

ProjectMember가 계속 권한을 결정한다. 모든 자식 DB 쿼리는 `projectId`와 `surfaceId`를 함께 요구하고 복합 FK가
서로 다른 프로젝트·표면의 key/locale 조합을 막는다. push token은 Project를 정한 뒤에만 surface slug를 읽는다.
새 테이블의 `anon` 권한이 0인지 마이그레이션마다 확인한다.

### 미발송 술어

술어는 셋이고 조건이 동일하다 — `isUnpublished`(`lib/keys/view.ts`) · `countUnpublished`(`lib/keys/query.ts`) ·
목록 raw SQL. 신규 키 판정 raw와 `loadLocaleCounts`도 같은 축이다. **전부 `projectId`만 보므로 "비활성 표면
제외"를 넷에 동시에 넣어야 하고**, 셋이 같은 행을 세는지 재는 자리는 `pnpm test:projects:postgres` 하나다.
그 픽스처는 `pathTemplate`·`baseLocale`·`lastCommitSha`를 **Project 행으로 세우므로 이 기능이 그대로 red를 만든다** —
같은 라운드에서 고친다.

### readiness와 실패 표시

첫 적재가 성공한 표면만 Project에 들어오므로 별도 surface readiness 상태를 만들지 않는다. 프로젝트 readiness는
"활성 표면 중 하나라도 첫 적재 성공"으로 다시 정의한다. Publish는 모든 활성 표면을 렌더하며 전체 diff가 0이면
`skipped`다. 렌더 오류나 버린 값은 기존 규칙대로 실패·warning으로 드러내고 성공으로 숨기지 않는다.

## 9. 과거 함정

- POSTMORTEM 2026-08-31: 외부 payload 생산자가 리터럴이라 필수 필드가 늘어도 컴파일러가 침묵했다.
  `surfaceSlug`를 나르는 생산자는 **둘**이고(§3.1) 둘 다 `z.infer` 타입을 붙인다.
- ARCHITECTURE §5.5.5: 다른 표면 push가 기존 프로젝트를 덮고 전 키를 orphan하는 실물이 이미 있었다.
  표면 식별 실패는 추측하지 않고 거부한다.
- ARCHITECTURE §5.5.6(`flow.test.ts`의 SQL 인자 캡처): unnest 컬럼이 늘면 타입이 같아도 값이 옆 컬럼으로 들어간다.
  `surfaceId` 추가는 그 테스트가 먼저 red여야 한다.
- POSTMORTEM 2026-09-04: 결정성·원본 표현·UTF-8 blob SHA·base_tree 누락은 조용한 전면 diff나 삭제를 만든다.
  multi-surface plan은 기존 writer와 GitHub payload 함수를 우회하지 않는다.
- POSTMORTEM 2026-09-05(414행): 라우트를 옮겼는데 링크 생성기가 옛 경로를 하드코딩해 사이드바가 전부 404였다.
  §4.1의 배선 셋이 그 자리다.
- POSTMORTEM 2026-09-05(356행): 테스트 가짜가 실제 제약보다 관대했다. **인메모리 하네스에 Surface 델리게이트와
  새 복합 unique를 넣지 않으면** 이 라운드의 Action·라우트 테스트가 새 제약을 재현조차 못 한다.
- POSTMORTEM 2026-09-09(754행): 새 테이블이 `anon`에 열린다. 마이그레이션마다 권한 0을 확인한다.
- POSTMORTEM 2026-09-09(781행): 일회용 허가를 "다음 push에서 비운다"로 구현하면 흔한 경로가 기능을 무력화한다.
  base 선언 소비는 `baseChanged`가 참인 push에서만.
- POSTMORTEM 2026-09-09(822행·922행): 라우트 이관에 무효화가 따라가지 않았고, 외부가 나른 경로가 리포 경로를
  정했다. §3.1의 두 층과 §4.1의 배선 3이 각각의 답이다.
- POSTMORTEM 2026-09-13(1281행): 락 전에 읽으면 재사용 결과가 달라진다. 경로 충돌 검사는 `Project` 행 락 안에서.
- POSTMORTEM 2026-09-13(1258행): 모달/딥링크의 지역 상태와 URL이 갈려 복귀가 깨졌다. Add surface는 고유 URL을
  가지고 OAuth·새로고침·직접 진입에서 같은 서버 상태를 복원한다.

## 10. 새 환경변수

없음. 기존 프로젝트별 `PUSH_TOKEN`과 GitHub App 자격증명을 재사용한다.

## 11. 기각한 대안

PRODUCT §7.1이 `1 Project = 1 repository + 1 translation surface`를 **명시로 정한** 자리이므로, 그것을 바꾸는
이 설계는 대안 셋의 기각 사유를 남긴다.

| 대안 | 기각 사유 |
|---|---|
| **Project 둘을 유지하고 `repositoryId` 단위로 sync 브랜치·PR만 공유** | 브랜치 하나를 소유자 둘이 force update한다. 2026-09-05에 같은 리포를 가리키는 둘이 서로를 덮은 실물이 있다. 결정성을 지키려면 결국 "누가 먼저 썼나"를 보는 코드가 필요하고 그것이 곧 병합이다. |
| **표면별 PR** | 문제 §2의 절반(PR이 표면 수만큼)을 그대로 남긴다. 번역 편집자가 보는 비용은 프로젝트 수가 아니라 PR 수다. |
| **Project 위에 RepoGroup을 얹기** | 계층이 셋이 되고 멤버십·권한·상한이 어느 층에 붙는지를 전부 다시 정해야 한다. 표면은 Project **아래**가 자연스럽다 — 리포·권한·PR이 이미 Project의 것이고 갈라지는 것은 파일 묶음뿐이다. |
| **상한 3개를 6으로 올리기만 하기** | 가장 싸지만 아무 것도 안 갚는다. 같은 리포·설치·멤버십·secret의 이중 관리와 PR 둘이 그대로다. |
