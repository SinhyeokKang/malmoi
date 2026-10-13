# Add a language — 태스크

작성: 2026-10-13. 순서는 순수 함수 → 껍데기 → UI. 각 절이 커밋 경계이고 동작을 바꾸는 절은 red 테스트 커밋이 앞선다(`test: … (red)` → `feat`/`fix`). 게이트는 매 절 `pnpm test`, 스키마·적재·Publish 절은 `pnpm gate`(격리 PG 트리거).

착수 조건: 감사 런 `/merge`(v1.4.0) → gitlab-oauth 구현이 dev에 들어간 뒤.

## 0. 시안·실측 — 코드 전

- [ ] Claude Design 시안 수령(`design-brief.md`). 검증: 프레임 표의 1~9가 핸드오프에 있다.
- [ ] Chrome 지원 로케일 목록의 정본(Chrome 확장 i18n 문서)과 목록 밖 `_locales/<x>` 디렉터리의 실제 동작(unpacked 로드 · 웹스토어 업로드)을 실측해 `lib/locales/chrome-codes.ts` 머리 주석에 출처·확인일과 함께 적는다. 검증: 실측 기록이 design §11-1을 닫는다.

## 1. 판정 잎 — 커밋 A (`feat(locales): plan adding a language to a source`)

- [ ] `lib/locales/chrome-codes.ts` — 목록 상수. 검증: 생성 테스트 "목록의 모든 코드가 `isLocaleShaped` ∧ `isPathSafeLocale`" green.
- [ ] `lib/locales/add-plan.ts` `planLocaleAdd` — 거부 순서(design §3) 표 테스트: 수술적 셋 `unsupported-format` · `../x`·`package`·`""`·`__proto__`·36자 `invalid-code` · chrome 목록 밖 · `exists`(제안 포함) · `pt-BR` vs `pt_br` `similar-exists` · 활성 200 `too-many-locales`(상한을 `lib/push/plan.ts`에서 import) · orphaned 같은 코드 `revive` · 경로 치환 결과. 검증: `pnpm test` green, 순서 뒤집기 뮤테이션 1회 red 확인.
- [ ] 잎 확인 — `components/__tests__/client-graph.test.ts` 목록에 새 잎 등재(화면이 값으로 읽는다). 검증: green.

## 2. 스키마 — 커밋 B (`/db` — `feat(db): mark proposed locales`)

- [ ] `Locale.proposedAt DateTime?` + 스키마 주석(소유 경계·지우는 자리 셋). `pnpm db:migrate --create-only` → SQL 눈으로 확인(additive, 백필 없음) → dev 적용. 검증: `pnpm db:status` 깨끗 · 격리 PG 스위트의 런타임 롤 권한 green · dev·prod `has_schema_privilege` false(`/db` 5단계).
- [ ] SELF-HOSTING §3-1 대조 기록(건너뛴 업그레이드 안전 · 새 env 없음). 검증: `/db` 리포트에 한 줄.

## 3. 추가 코어·사건 — 커밋 C (`feat(locales): add or revive a language under the surface lock`)

- [ ] `lib/locales/add.ts` `addLocale` — `lockProjectAccess` → 표면 잠금 → `planLocaleAdd` → create/revive(+ 값 있는 활성 셀 토큰 발급, 기준 행 없음) → `ProjectEvent` SURFACE `surface.localeAdded` 같은 tx. 검증: 격리 PG 시나리오 — 새 행 `proposedAt` 세팅 · 되살림 토큰 수 = 값 있는 활성 셀 수 · `countPending` 증가 · 사건 실패 시 롤백 · 비멤버·EDITOR·보관 거부.
- [ ] `lib/events/payload.ts`·`view.ts` — subtype 문장 분기(지금 `added` 폴백으로 떨어지는 자리 고정). 검증: view 테스트 "localeAdded ≠ surface.added 문장".
- [ ] `app/__tests__/locked-access.test.ts` `SITES`에 새 tx 등재. 검증: green.

## 4. 적재 — 커밋 D (`fix(push): leave proposed languages to the app until delivered`)

- [ ] red: 자동 적재(`applyProtectedPush`·야간)가 페이로드에 없는 제안 로케일을 orphan한다 / 페이로드에 있으면 `proposedAt`이 남는다.
- [ ] `lib/push/apply.ts` — upsert `proposedAt = NULL`, 자동 orphan 문장 `AND "proposedAt" IS NULL`, 승인 적재는 조건 없이 orphan + `proposedAt = NULL`. 검증: 격리 PG — 자동/승인/빈 페이로드 셋 · `releaseOrphanedApproved`가 승인 적재로 orphan된 제안 셀 토큰을 푼다 · `orphanedLocales` 응답 수에 건너뛴 제안이 안 든다.
- [ ] `lib/push/__tests__/flow.test.ts`류 SQL 인자 캡처 갱신. 검증: green.

## 5. 수동 Sync·소스 되살림 승인 — 커밋 E (`feat(sync): ask before a sync drops proposed languages`)

- [ ] red: 빈 제안만 있는 프로젝트의 수동 Sync가 승인 없이 제안을 지운다 / 제안이 바뀐 뒤 옛 지문이 통한다.
- [ ] `discardFingerprint`·`removalFingerprint`에 제안 입력, `planProtectedImport` manual 조건 `pending > 0 || proposals > 0`, `lib/import/run.ts`·`preview_sync`·제거 미리보기가 제안 코드를 싣는다. 검증: 지문 단위 테스트(제안 추가·제거·코드 변경이 지문을 바꾼다) · 격리 PG 승인 시나리오.
- [ ] Sync 확인 Dialog 문구(세 사전 — §7과 같은 커밋이 아니면 여기서 키 추가). 검증: DOM 테스트 "제안 코드가 확인 창에 보인다".

## 6. Publish — 커밋 F (`feat(publish): create new language files and hand them to the repository`)

- [ ] red(결정성): 원본 없는 json-catalog·chrome-locales 새 파일의 표현이 base 원본과 같다(4칸·CRLF·BOM·`\u` 이스케이프·`\/`·chrome `description` 먼저·한 줄 엔트리) + 같은 입력 두 번 렌더 바이트 동일 + 고정점(낸 파일을 원본으로 재렌더 → 같은 바이트). 검증: `contract.test.ts`에 원본 없음 × base 표현 매트릭스.
- [ ] `render.ts` 표현 출처 배선 · writer 둘의 `observeJsonStyle(original ?? styleFrom)` · 구조는 빌리지 않음. 검증: 위 green + `entry-order.test.ts`·`key-order-golden.test.ts` green.
- [ ] 보류(결정 ④) — `lib/pull/undeliverable.ts` 제안 경로 × 트리, `Withheld` 사유 갈래, 미리보기 `readPublishPreview` 같은 판정. 검증: run·preview 같은 수(기존 `withheld` 대조 테스트 확장).
- [ ] 전달 확인 — `lib/pull/load.ts` 확정 tx에서 실린 제안의 `proposedAt = NULL`. 검증: 격리 PG — committed에서만 · 실패·결과 미확인·FAILED 종료는 안 지운다(불변식 9) · 번역 0개 제안은 남는다.
- [ ] 진입점 시나리오(fake `GitClient`, GitHub·GitLab 각 1) — 추가 → 저장 → Publish 커밋에 새 경로 → 머지 시뮬레이션 push → 일반 로케일 / 닫힘 시뮬레이션 push → orphaned. 검증: green.

## 7. 화면 — 커밋 G (`feat(sources): add a language from the source details`)

- [ ] Server Action `addLocale`(`app/(edit)/projects/[slug]/sources/actions.ts`) — 코드 결과, 성공 뒤 `revalidatePath`. 검증: `entry-points.test.ts` 진입점 전수 green.
- [ ] Languages 카드 `action` 슬롯 버튼 + Dialog + 제안 배지 + 비활성 이유 · `languagesHelp` 문구 · 기준 언어 후보에서 제안 제외(`planBaseLocaleChange` `proposed-locale` 갈래 + `base-language-form` 목록). 프리미티브만 조립(`Dialog`·`Input`·`Select`·`Badge`·`Button`). 검증: DOM 테스트 — 프레임별 상태 · 키보드 · 거부 사유 문구 · EDITOR 비활성.
- [ ] 세 사전 en·ko·es 같은 커밋(`/translate` 모드 ①). 검증: `dictionary-consistency.test.ts`·`no-korean-ui.test.ts`·banned-terms green.
- [ ] 번역 화면 — 제안 로케일 상세 패널 입력 수용(POSTMORTEM translation-rework). 검증: DOM 테스트 "추가 뒤 그 로케일 행에 입력·저장".
- [ ] Publish 미리보기 "new file" 표시 · 번역 0개 제안 한 줄. 검증: DOM 테스트.
- [ ] `/design-sync` — 시안 대조(신규 Dialog의 첫 구현). 검증: computed style·접근성 트리 리포트 green.

## 8. MCP — 커밋 H (`feat(mcp): add_locale`)

- [ ] `lib/mcp/catalog.ts` `add_locale`(WRITE, `project:settings`) — 같은 코어, 영어 거부 코드. `get_project`·`list_keys`에 `proposed`. 검증: catalog 정본 테스트 · 도구 단위 계약 · 토큰 권한 교차(`translation:write` 토큰 거부).

## 9. 정본 문서 — 문서별 커밋(`docs(<scope>): …`)

- [ ] **PRODUCT** §7.2 개정(추가 해제 · 삭제는 그대로 · 제안 → 전달 → 리포 소유) · §4.1 범위 문장 · §7.1 Sources 상세 서술.
- [ ] **ARCHITECTURE** §0 불변식 1 단서 · §1.1 "들여쓰기·줄바꿈·BOM·이스케이프·필드 순서 — 원본이 없으면 base 원본" · §5.5.16 표에 `proposedAt` 행 · §3 보류 갈래 · §5.5.2 승인 적재 · §6.45.5 도구 표.
- [ ] **CLAUDE.md** 코어 원칙 "로케일 존재" 단서 · 데이터 변경 경로 표에 `addLocale` 행(그리고 `pnpm sync:agents`).
- [ ] **DESIGN** §6.66 Sources 상세 · 제안 배지 · 문구 표.
- [ ] **DIRECTORY** `lib/locales/`.
- [ ] README 기능 절(사용자 체감 변화)이 참인지 확인.
- 검증: `/push` 4단계 문서 신선도 통과.

## 10. 가이드 — `/guide` · `/guide-shots`

- [ ] 가이드의 "언어는 리포에서 추가한다" 서술을 찾아 세 언어 갱신(`rg -n "_locales|add .*language|language file" guide/en`). MCP 도구 표에 `add_locale`.
- [ ] 소스 상세 모달 컷 stale 여부 — `pnpm guide:check` 출력을 인용.

## 11. 배포 — `/push` → `/merge`

- [ ] `/push`(dev 마이그레이션 포함) → `/runtime-test`(로컬: 추가 → 번역 → Publish PR에 새 파일 · 수동 Sync 승인 철회 · EDITOR 비활성) → `/roundtrip`(폐기용 리포 json-catalog·chrome-locales 각 1 — 새 파일 표현이 base와 같은지 · 머지 뒤 push가 일반 로케일로 받는지) → `/merge`(1단계 prod 마이그레이션 · 레벨 minor 추천).
