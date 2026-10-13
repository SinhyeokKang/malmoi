# Add a language — 설계

작성: 2026-10-13. 결정의 근거는 spec §6(사용자 결정 ①~⑧)이고, 여기는 그 결정을 코드 자리에 내린다.

## 1. 소유 모델 — 제안 → 전달 → 리포 소유

로케일 존재의 소유자는 어느 순간에도 하나다. 그 경계를 `Locale.proposedAt DateTime?` 하나가 든다.

| 상태 | `orphaned` | `proposedAt` | 존재의 소유자 | 자동 적재(CI·야간) | 수동 Sync(승인) |
|---|---|---|---|---|---|
| 제안 | false | 시각 | **DB** | 페이로드에 없어도 **orphan하지 않는다** | 페이로드에 없으면 orphan + `proposedAt = NULL` |
| 전달됨(PR 열림) | false | NULL | 리포 | `open-pr` 게이트가 적재 전체를 보류(기존) | 페이로드에 없으면 orphan(기존) |
| 리포에 있음 | false | NULL | 리포 | 기존 | 기존 |
| 사라짐 | true | NULL | 리포 | 기존 | 기존 |

전이:

- **추가**(Action·MCP) → 새 행 `proposedAt = now`. 같은 코드의 orphaned 행이 있으면 **그 행을 되살린다**(`orphaned = false`, `proposedAt = now`, 값 있는 셀에 편집 토큰 새로 발급 — 결정 ⑧, §4).
- **적재가 페이로드에서 그 코드를 봤다**(개발자가 파일을 직접 넣었다 · PR 머지 뒤) → upsert가 `orphaned = false`와 함께 **`proposedAt = NULL`**. 리포가 소유를 넘겨받는다.
- **Publish가 그 로케일의 파일을 커밋에 실었다**(전달 확인 tx) → `proposedAt = NULL`. 실리지 않았으면(번역 0개 · 보류) 그대로 제안이다.
- **PR이 머지 없이 닫힘** → `open-pr` 보류가 풀린 다음 적재가 페이로드에 없는 그 로케일을 orphan한다(비파괴 — 번역은 남고 재추가로 되살린다).
- **수동 Sync 승인 · 제거된 소스의 되살림 첫 적재** → 제안을 건너뛰지 않는다(결정 ②). 두 경로가 이미 "리포 상태로 맞추는 OWNER 승인 폐기"이고 지문이 사람의 승인을 묶는다(§5).

**지휘자 원안(보류 게이트에 제안 수를 더한다)을 버린 이유** — ① 지금 게이트 입력 `pendingWhere`(`lib/protection/where.ts`)는 `Translation.pendingEditToken`이 있는 **셀**만 센다. 빈 제안엔 셀이 0이라 게이트가 서지 않고 다음 CI push가 그 로케일을 orphan한다(`lib/push/apply.ts:264`) — 원안 2단계가 코드와 어긋났다. ② 고쳐서 제안 수를 게이트에 더하면 빈 제안 하나가 코드의 새 키·삭제 유입을 무기한 막고, `/api/push`의 `deferred` 사유가 하나 늘어 외부 계약(ACTIONS §3 · action 태그 v3는 경고 없이 본문만 찍는다)이 움직인다. 행을 건너뛰는 쪽은 게이트·외부 계약을 그대로 두고, 번역이 저장되는 순간부터는 기존 `pending-edits` 보류가 자연히 선다.

**병합이 아닌 이유** — 적재는 `proposedAt`(DB 표시)으로 행을 고를 뿐 리포 값과 DB 값을 견주지 않는다. 키마다 출처가 하나인 B3.4(ARCHITECTURE §3 "base 키 집합")와 같은 결이다. 불변식 1 "로케일 존재 = 리포"에 "제안 중엔 DB"라는 단서를 단다(tasks §8).

## 2. 1단계 어댑터 범위 — `writeStrategy`로 가른다

| 어댑터 | `layout` | `writeStrategy` | 새 로케일 | 근거 |
|---|---|---|---|---|
| `json-catalog` | per-locale | regenerate | **받는다** | 원본 없이 파일을 낸다(`lib/pull/render.ts:147-166`) |
| `chrome-locales` | per-locale | regenerate | **받는다**(Chrome 지원 목록만 — 결정 ⑥) | 같다 |
| `yaml-catalog`·`code-dict` | per-locale | surgical | 거부 `unsupported-format` | 원본이 없으면 `original-file-missing`으로 비-base 셀이 영구 보류된다(`render.ts:152`) |
| `ts-dict` | multi-locale | surgical | 거부 `unsupported-format` | 로케일 객체가 없으면 실행이 `write-locale-object-missing`으로 거부한다(ARCHITECTURE §3) |

판정은 `writeStrategy === "regenerate" && layout === "per-locale"`이다(CLAUDE.md "원본이 필요한가는 `writeStrategy`로"). `layout`을 함께 보는 이유는 경로 생성이다 — per-locale만 `pathTemplate`의 `{locale}` 치환으로 새 경로가 정해진다. 수술적 어댑터는 후속 후보(spec §5)이고 화면은 버튼을 이유와 함께 비활성으로 보인다(§7).

## 3. 순수 함수 — `/tdd` 진입점

| 함수 | 자리(제안) | 입력 → 출력 |
|---|---|---|
| `planLocaleAdd` | `lib/locales/add-plan.ts` (잎 — 화면이 값으로 읽는다) | `{ code, adapterName, layout, writeStrategy, pathTemplate, existing: {code, orphaned}[], activeCount, archived }` → `{ action: "create", path } \| { action: "revive", path } \| { action: "reject", reason }` |
| `chromeLocaleCodes` | `lib/locales/chrome-codes.ts` (잎 상수) | Chrome 지원 로케일 목록(밑줄 형). 출처·확인일을 머리 주석에 |
| `localeCollisionKey` | `add-plan.ts` 안 | `code.toLowerCase().replace(/[-_]/g, "")` — 대소문자·구분자만 다른 코드 충돌 판정 |
| `orphanableLocales`(SQL 술어 조각) | `lib/push/apply.ts` | 자동 적재: `"orphaned" = false AND "proposedAt" IS NULL AND code <> ALL(live)` · 승인 적재: `"proposedAt"` 조건 없음 |
| `proposalWithheld` | `lib/pull/undeliverable.ts` | 제안 로케일 집합 × base 트리 경로 → 경로가 이미 있으면 `withheld.file` 좌표(결정 ④) |
| `styleSourceFor` | `lib/pull/render.ts` | 원본 없는 재생성 경로에 base 원본을 표현 출처로 넘길지(결정 ③) |
| `deliveredProposals` | `lib/pull/` | 렌더 출력(커밋에 실린 경로) × 제안 로케일 → `proposedAt`을 지울 코드 목록 |

`planLocaleAdd`의 거부 사유(순서가 판정이다): `archived` → `forbidden`(EDITOR — 인가가 먼저 거르지만 MCP 토큰 권한 교차를 위해 값으로) → `unsupported-format` → `invalid-code`(`isPathSafeLocale` ∧ `isLocaleShaped` 불통과, chrome이면 목록 밖) → `invalid-path`(치환 경로가 `isPathSafeRepoPath` 불통과) → `exists`(같은 코드 활성 — 제안 포함) → `similar-exists`(충돌 키가 같은 다른 활성 코드) → `too-many-locales`(활성 + 1 > 200 — push 상한 `lib/push/plan.ts`와 같은 수를 import) → `revive`(같은 코드 orphaned) → `create`.

⚠️ **남이 정한 키 규칙** — 코드는 사람이 넣은 문자열이라 `existing` 조회는 배열·`Map`으로 하고 평범한 객체 키로 쓰지 않는다(CLAUDE.md "프로토타입을 먼저 끊는다"). `__proto__`는 `isLocaleShaped`가 막지만(`_` 시작) 판정 순서에 기대지 않는다.
⚠️ **값 축 규칙의 포함 관계** — chrome 목록은 `isLocaleShaped`의 부분집합이어야 한다(목록의 모든 코드가 통과). `locale-code.test.ts`의 `isLocaleShaped ⊇ looksLikeLocale`처럼 생성 테스트로 잰다(POSTMORTEM 2026-09-27 fix r1).

## 4. 껍데기 — 쓰기 자리

**추가 코어** `addLocale(tx, scope, input)` (`lib/locales/add.ts`) — Action과 MCP가 같이 부른다(형제 껍데기, Action을 MCP가 부르지 않는다).

1. `lockProjectAccess`(`project:settings`) → `TranslationSurface` 잠금(번역 저장과 같은 순서 — CLAUDE.md "활동 사건").
2. 잠근 뒤 읽은 표면·로케일로 `planLocaleAdd`.
3. `create`: `INSERT "Locale"(…, name = code, isBase = false, proposedAt = now)`. `revive`: `UPDATE … SET orphaned = false, proposedAt = now` + 그 로케일의 **값이 비지 않은 활성 키 셀**에 `pendingEditToken = gen_random_uuid()` (결정 ⑧ — `updatedBy`·값은 건드리지 않는다. `TranslationBaseline`은 만들지 않는다 → Revert는 기준 없음으로 꺼진다, ARCHITECTURE §5.8 기존 규칙).
4. 같은 tx에서 `ProjectEvent` SURFACE `surface.localeAdded`(payload에 `locale`·`revived` — §8).
5. 결과는 코드(`ok`·거부 사유)로 돌려준다. 웹 Action은 성공 뒤에만 `revalidatePath`.

**적재** (`lib/push/apply.ts`):
- Locale upsert의 `DO UPDATE`에 `"proposedAt" = NULL`(페이로드가 그 코드를 가졌다 = 리포 소유).
- orphan UPDATE에 자동 적재면 `AND "proposedAt" IS NULL`. 승인 적재(수동 Sync `approvedTokens`가 있는 경로 · 제거 소스 되살림 첫 적재)는 조건 없이 orphan하고 `proposedAt = NULL`. 갈래는 `ApplyOptions`에 이미 있는 승인 유무로 정한다 — 새 플래그를 만들지 않는다.
- `releaseOrphanedApproved`는 그대로 — 승인 적재가 orphan시킨 제안 로케일 셀의 승인 토큰을 같이 푼다.
- ⚠️ 빈 페이로드(`liveLocales.length === 0`)면 orphan 문장을 내지 않는 기존 규칙 유지.

**Publish** (`lib/pull/run.ts`·`render.ts`·`load.ts`):
- 렌더 — 원본 없는 재생성 경로는 같은 표면의 **base 원본**을 표현 출처로 받는다(결정 ③). `WriteInput`/`format`에 표현 전용 입력(예: `styleFrom`)을 더하고 json-catalog·chrome-locales writer가 `observeJsonStyle(original ?? styleFrom)`·`dominantFieldOrder`를 쓴다. **구조(`originalStructure`·중첩 관측)는 빌리지 않는다** — 새 파일의 키 구조는 표면의 `nested`·`nestedByPath`가 정한다(ARCHITECTURE §1.35 "새 로케일처럼 원본 경로가 없는 키만 중첩 관측으로 복원").
- 보류 — 제안 로케일의 경로가 base 트리에 이미 있으면(`GitTreeEntry` 존재) 그 로케일의 캡처 편집을 `withheldCoordinates`(file)로 보낸다(결정 ④). 값은 읽지 않는다. 결과 문구는 기존 `withheld.file`과 다른 사유를 말해야 한다("already in the repository") — `Withheld`에 사유 갈래 하나.
- 전달 확인 — `acknowledgeDelivered`와 같은 tx에서 `deliveredProposals`의 코드에 `UPDATE "Locale" SET "proposedAt" = NULL`. `committed`에서만(실린 파일 = 커밋 트리에 들어간 경로). `no-changes`는 새 파일이 있을 수 없으므로 갈래가 없다(이미 있으면 보류).
- 1층 — 바꾸지 않는다. 빈 제안은 낼 것이 없어 Publish가 필요 없고, 되살린 로케일은 결정 ⑧의 토큰이 미전달 수에 선다.

**수동 Sync 확인·지문** (`lib/protection/fingerprint.ts`·`lib/import/run.ts`·`preview_sync`):
- `DiscardFingerprintInput`에 `proposals: { surfaceId, code, proposedAt }[]`를 더한다 — 제안이 생기거나 사라지면 옛 승인이 통하지 않는다.
- `planProtectedImport` manual 모드의 승인 필요 조건을 `pending > 0 || proposals > 0`으로 넓힌다(빈 제안만 있어도 사람이 보고 승인해야 사라진다). auto 모드는 그대로(`pending`만).
- 확인 창·`preview_sync`가 제안 코드 목록을 말한다("Languages not in the repository yet will be removed: ja").
- 제거 소스 되살림의 `removalFingerprint`도 그 소스의 제안을 싣는다(제거 시점의 승인이 되살림 첫 적재까지 덮는다 — ARCHITECTURE §5.9).

## 5. 기존 화면·집계에 닿는 것 (전수)

| 자리 | 영향 | 판단 |
|---|---|---|
| 보류 게이트 `pendingWhere` | 없음 | 제안 로케일은 `orphaned = false`라 그 셀의 토큰이 이미 세어진다 |
| Revert | 없음 | 셀 단위 기존 규칙. 되살림 토큰엔 기준이 없어 꺼진다 |
| Publish 미리보기 | 새 파일을 "new"로 표시 · 번역 0개 제안은 "no file yet" 한 줄 · 결정 ④ 보류 수 | `changedFiles`가 이미 `renderProject` 출력이라 새 파일이 들어온다(POSTMORTEM 2026-09-27 #128). "new" 표시는 트리 부재로 판정 |
| 완료율·Sources 언어 수·Home "한 번도 안 채워진 로케일"·Inbox | 제안 로케일이 활성으로 세어진다 | 의도다 — `Locale.createdAt`이 진짜 추가 시각이라 Home 항목이 시간축에 바로 선다(schema 주석의 backfill 경고는 옛 행 얘기) |
| 기준 언어 후보 | 제안 제외 | base는 리포 파일이 정한다. `planBaseLocaleChange`(`lib/onboarding/base-locale.ts`)에 `proposed-locale` 거부 갈래, UI 목록에서도 뺀다 |
| 번역 화면 `?language=` | 제안 로케일 편집 가능 | ⚠️ POSTMORTEM(translation-rework) "서버에 새로 생긴 로케일은 입력을 받지 못했다" — 상세 패널이 로케일을 마운트 시점 목록으로 들고 있으면 같은 결함. DOM 테스트로 잰다 |
| Keys 검색 | 포함 | orphaned만 빼는 기존 규칙 그대로 |
| MCP `get_project`·`list_keys` | 제안 표시를 싣는다(`proposed: true`) | 에이전트가 "아직 리포에 없다"를 알아야 한다 |
| CI 응답·ACTIONS | 없음 | `/api/push` 계약 불변. `orphanedLocales` 수에 제안이 들지 않는다 |
| Logs | `surface.localeAdded` 문장 하나 | §8 |

## 6. 권한·호스트

- **`project:settings`(OWNER)** — 판단(정본이 답한다): 표면 설정·기준 언어(`updateBaseLocale`·MCP `set_base_locale`)·소스 추가가 전부 `project:settings`이고, 로케일 추가는 리포의 파일 집합을 바꾸는 결정이다. EDITOR에겐 버튼이 이유와 함께 비활성.
- **보관**: `planProjectAccess`가 `project:settings` 외 전부를 거부하지만 설정 쓰기도 보관 중엔 `archived`다(PRODUCT §7.1 "보관 = Restore만") — `planLocaleAdd`가 값으로 거부.
- **호스트 중립**: 추가는 DB만 쓴다(리포 호출 0). 렌더·보류·전달 확인은 `GitTreeEntry`·커밋 결과만 본다 — GitHub(`lib/github.ts`)·GitLab(`lib/gitlab/`) 둘 다 `createGitClient`(`lib/repo-host`) 뒤라 분기가 없다. 테스트는 fake `GitClient` 두 벌이 아니라 코어 단위로 한 번, 진입점 시나리오를 호스트별로 한 번씩.

## 7. 화면

소스 상세 모달(`components/sources/source-detail-modal.tsx`)의 Languages `Card`(177행) `action` 슬롯에 [Add language] → `Dialog`(소스 모달 안의 Dialog — `remove-source-dialog.tsx` 선례). 입력은 json-catalog면 `Input`(코드) + 만들 경로 미리보기, chrome-locales면 `Select`(지원 목록 − 이미 있는 코드). 제안 행엔 `Badge`("Not in repository yet"). 세부·프레임은 `design-brief.md`가 정본이다.

- 언어 카드 설명 `languagesHelp`를 "Add a language here; remove it in the repository."류로 바꾼다(세 사전).
- `unsupported-format` 소스는 버튼을 `aria-disabled` + 이유(sr-only 설명 — 같은 파일의 `language-open-reason` 선례).

## 8. 스키마·사건·환경

- **스키마**: `Locale.proposedAt DateTime?` — **additive**, nullable, 기본값·백필 없음(기존 행은 전부 리포 소유 = NULL이 참). 버전을 건너뛴 업그레이드에서도 안전하다(SELF-HOSTING §3-1 — 앱 코드 백필 없음). 인덱스 불필요(표면당 로케일 ≤ 200, 조회는 `(projectId, surfaceId)` 선두 PK).
- **사건**: `EventPayload` SURFACE 갈래에 `locale: string | null`·`revived: boolean | null`을 더하거나 별도 갈래 — 사건 payload는 저장 값이라 옛 행이 새 필드를 갖지 않는다(`null`로 읽는다). subtype `surface.localeAdded`, `lib/events/view.ts:323`의 SURFACE 문장 분기에 한 줄(지금은 `startsWith("surface.baseLocale")` 아니면 `added`로 떨어진다 — 새 subtype이 "소스 추가"로 잘못 읽히는 자리라 테스트로 고정). 수동 Sync가 제안을 orphan한 사실은 IMPORT payload에 수(`proposalsRemoved`)로.
- **새 환경변수·패키지·cron·외부 전송처**: 없음. 개인정보 방침 영향 없음(새 수집 필드 없음 — `proposedAt`은 사람 정보가 아니다. `lib/privacy/collected.ts` 등재 대상인지 typecheck가 말한다).

## 9. 불변식 영향

| 불변식 | 영향 | 보존 방법 |
|---|---|---|
| 1 로케일 존재 = 리포 | **단서 추가** — 제안 중엔 DB | 전달 확인·적재 관측이 소유를 리포로 넘긴다. 정본 문장 개정(tasks §8) |
| 2 승자를 고르지 않는다 | 없음 | 적재는 DB 표시로 행을 고르고, Publish 보류는 경로 존재만 본다 — 값 비교 0 |
| 3 삭제하지 않는다 | 없음 | 제안 철회 = orphan(행·번역 유지) |
| 4 결정성 | **입력이 늘어난다** | 새 파일 바이트 = f(DB, base 원본). base 원본은 이미 "같은 원본 파일"의 일부. 고정점: 우리가 낸 새 파일을 다음 렌더가 원본으로 관측하면 같은 표현이 나온다 — 계약 테스트 |
| 5 projectId·surfaceId로 좁힌다 | 없음 | 모든 새 쿼리가 `(projectId, surfaceId)` |
| 9 버린 값을 성공으로 숨기지 않는다 | 번역 0개 제안·결정 ④ 보류를 결과가 말한다 | `withheld`·미리보기 줄 |
| 10 리포 쓰기 경로는 서버가 정한다 | **새 보간 입력**(사람이 넣은 코드) | `isPathSafeLocale` ∧ `isLocaleShaped`(추가 시) + `resolveLocalePaths`(렌더 시, 기존 두 번째 층) + `isPathSafeRepoPath`(치환 경로) |
| blob SHA (§2) | 없음 | 새 파일도 같은 `githash` |

## 10. POSTMORTEM 소환

- **2026-09-27 `isLocaleShaped` 신설**(`package` 로케일이 `package.json`을 재생성) — 사람이 넣는 코드도 같은 두 질문(경로 안전 · 로케일 모양)을 각각 답한다. 새 보간 자리라 두 층을 다 건다.
- **같은 날 fix r1**(값 축 규칙이 탐지가 받는 camelCase를 거부) — chrome 목록 ⊆ `isLocaleShaped`를 생성 테스트로 잰다.
- **per-locale 갈래는 트리를 안 본다**(sec-audit 발견 2 근본 원인) — 이번에 트리를 보는 판정(결정 ④)이 생기지만 방어를 거기 기대지 않는다.
- **2026-09-04 audit #7**(수술적 파일 부재를 조용히 건너뜀) — 번역 0개 제안이 "흔적 없이 빠지는" 모양이 되지 않게 미리보기·결과가 말한다.
- **2026-09-09 "일회용 허가를 이벤트로 비웠다"** — 승인 적재의 제안 orphan과 토큰 해제는 적재가 확정된 갈래에서만.
- **translation-rework**("서버에 새로 생긴 로케일은 입력을 받지 못했다") — 번역 화면 DOM 테스트.
- **2026-09-08 `Object.hasOwn`**(subtype 자유 문자열) — 새 subtype 문장 분기는 기존 `hasOwn` 경로를 지난다.

## 11. 확인 필요 (남은 것)

결정 ①~⑧로 큰 갈래는 닫혔다. 구현 착수 전 실측 둘:

1. **Chrome 지원 로케일 목록의 정본과 목록 밖 디렉터리의 동작**(로드 오류인지 무시인지 · 웹스토어 업로드 거부인지) — tasks §0. 목록 상수의 출처를 정한다.
2. **`Withheld` 사유 갈래 추가가 Logs·결과 모달·MCP `publish` 응답에 닿는 범위** — 기존 `withheld.file`("파일이 리포에 없다")과 정반대 사실("이미 있다")이라 같은 문구를 쓰면 거짓이다. 갈래 이름은 tdd에서 정한다.
