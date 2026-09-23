# translation-rework — 구현 태스크

6차 핸드오프까지 대조하여 디자인 결정과 문구 정리를 문서에 반영했다. T0는 문서 검토 완료이며 나머지는 **기술 실측·구현 미착수**다. 순서는 순수 판정 → 데이터/Action → UI이며, 사용자 결정과 실측 없이 수치/정책을 확정하지 않는다. 큰 변경이므로 작은 변경용 `/ship`에 무조건 싣지 않는다. Codex는 원격 push/merge를 수행하지 않는다.

## G0. 설계 게이트 — 코드 작성 전

- [x] T0. 6차 핸드오프까지 [2차 디자인 피드백](/Users/sinhyeok/Desktop/translation-rework-design-feedback-round2.md)과 대조하고 [spec](./spec.md)에 판정을 기록했다.
  검증: R1–R6 반영 확인. OWNER·Copy link·상세 기본값도 확정. [3차 피드백](/Users/sinhyeok/Desktop/translation-rework-design-feedback-round3.md)의 구문서 잔여 표현도 6차에서 수정 확인했다. 브라우저 검증 완료를 뜻하지 않는다.
- [x] T1. 설치된 Next/프리미티브를 확인하여 history 포함 이동 guard와 검색 가능한 언어 메뉴를 spike한다. 기존 데이터 규모/실제 조회계획에서 검색·집계·전체 baseline 캡처·Save 페이로드 비용을 측정한다.
  검증: spec §7 결정표의 검색 대상·기본 범위·Saved 행 수명을 URL/조회/화면 계약과 대조한다. 제품 결정을 실측 항목과 분리하고 임의 변경하지 않는다.
  검증: 재현 입력/수치/EXPLAIN과 페이지 크기·상한·인덱스 결정 근거를 design에 기록. 실패한 guard 경로가 남으면 UI 구현 착수 보류.
  검증: baseline 후보 수를 Σ(소스별 활성 키×활성 언어)로 계산하고, 번역 행이 희소한 20,000키×200언어 단일 소스 및 다중 소스 fixture의 캡처/저장 시간·메모리·잠금 시간을 기록한다. 200,000 번역 행 제한을 baseline 상한으로 사용하지 않는다. 현재 지원 규모에서 원자성과 실행 시간 제한을 함께 만족하는 설계가 없으면 baseline writer 구현 착수를 보류한다.
  검증: 교체된 Publish 실행의 외부 쓰기 종료를 확인할 근거와 Revert 차단 해제 조건을 기록한다. 시간 경과/FAILED만으로 종료를 가정하지 않으며, 종료를 입증할 수 없으면 Revert 개방을 보류한다.
  결과(2026-09-23): [design §10](./design.md#10-t1-실측-결과-2026-09-23). 조밀 baseline 불가 → 미전달 셀 delta 설계, 종료 근거는 플랫폼 maxDuration(둘 다 사용자 결정). `sort` 파라미터 없음·페이지 100·신규 인덱스 없음·Save 합계 1,000,000 코드유닛. 미종결: prod 규모(권한 거부)·Safari/Firefox guard·네이티브 beforeunload 육안 — T19/T20에서 닫는다.

## C1. 순수 계약과 회귀 테스트 — 커밋 경계 1

- [x] T2. URL 파싱/옛 링크/선택/reset, 키 결측/review/pending 집계·정렬 테스트를 먼저 작성한 뒤 순수 함수를 구현한다.
  검증: 서로 다른 언어 구성의 두 소스, 전체 상태 필터, orphan, 빈값, prototype 이름, 상태+ns 교차, 안정 분할(review 포함), missingLocale fallback/reset/history, Saved 행 선택 예외 red→green.
- [x] T3. `planKeySave`, draft reducer, 목록 보존, navigation 계획을 테스트 먼저 구현한다.
  검증: 변경 둘 중 하나 무효→쓰기 계획 없음, no-op, 공백 정규화, A 제출 후 B 입력, 실패+서버 C 수신, 늦은 다른 키 응답, IME, 목록 재필터 경계 red→green.
  검증: A 제출→B 추가 입력→A 성공 뒤 dirty B와 갱신된 saved 기준으로 복구 사본을 유지한다. 성공 응답 적용 뒤 dirty 0개인 경우에만 사본을 제거한다.
- [x] T4. 전달 baseline/복원 계획과 지문 대상 결정 테스트를 먼저 구현한다.
  검증: base 폴백·빈 원문·비-base 부재, unknown 하나가 전체 차단, 새 token은 남고 전송값은 기준 갱신, context 변경/실행권 상실/기준 변경은 거부, review 보존 red→green.
  검증(§10.3 delta): Save의 비미전달→미전달 전이에서만 기준 기록(이미 미전달 재저장·레코드 무효·Publish 진행 중은 기록 없음), Publish 성공 시 CAS 해제 셀은 기준 제거·재편집 셀은 캡처값으로 교체, §10.4 종료 조건 미충족은 전체 차단.

## C2. 전달 스냅샷 — 커밋 경계 2 / 배포 A

- [x] T5. `/db` 절차로 additive baseline 테이블·복합 FK/unique와 실측으로 정한 인덱스만 생성한다. dev에서 확인한 SQL을 검토하고 prod 적용 순서를 기록한다. 과거값 추정 backfill은 넣지 않는다. 모델 추가와 함께 `lib/privacy/collected.ts`의 `MODEL_CLASSES` 분류·등재를 수행한다. 현 필드 기준 not-personal 분류를 검토하고 개인정보 필드가 생기면 해당 필드 등재도 갱신한다.
  검증: dev/prod migration 상태 구별, A/B 테넌트 교차 FK 거부, anon/authenticated 권한 0, 기존 앱 쿼리 호환. schema와 migration만 별도 커밋하고 분류 등재는 동반 앱 코드 커밋으로 분리한다. T5 완료 전에 두 변경을 함께 둔 상태에서 Prisma 재생성 후 `pnpm typecheck`를 통과한다. T17/T18로 등재 작업을 미루지 않는다.
  결과(2026-09-23): `20260923020548_add_delivery_baselines`(테이블 둘 + 복합 FK 다섯, 신규 인덱스 없음) dev 적용 · dev anon 0 · `delivery-baseline-fk.integration.ts` 4건 · `MODEL_CLASSES` 15. ⚠️ **prod는 미적용** — `/merge` 1단계의 `pnpm db:deploy` 뒤 prod anon 0을 확인한다. 배포 A에서 writer(T6·T7)보다 먼저 나간다.
- [ ] T6. `loadPullState`와 `runPull`/`saveLastPulledAt`에 동일 export 스냅샷 baseline 전달·성공 확정 tx를 연결한다. 첫 외부 mutation 전 기존 기준 무효화를 커밋한다. `lib/sync/run.ts`에서 실행권을 전달하고 실행 종료를 조건부로 확정한다. cron 경로도 동일하게 연결한다.
  검증: fake GitHub 단위 테스트에서 committed/no-changes만 기준 활성화; writer-warnings/no-edits/API 실패는 새 기준 활성화 0건. 무효화 실패 시 GitHub mutation 0회, no-changes 브랜치 원복 전 무효화 확인. 실제 PG에서 baseline+timestamp+token CAS 원자성, A 전송 중 B 편집, 늦은 실행 fencing 확인.
  검증: T1의 희소 번역·다중 소스 fixture에서 후보 수와 실제 렌더 범위의 기록 수를 대조하고 전체 시간·메모리·잠금 비용이 확정 예산을 만족하는지 확인한다. chunk를 나누더라도 성공 확정의 원자성을 유지하며, 중간 chunk 실패 시 기준·timestamp·token CAS가 함께 롤백된다.
  검증: A 기준→B 저장→GitHub B 쓰기 성공→DB 완료 실패/응답 유실→Revert A 거부·B pending 유지. 교체된 외부 실행의 늦은 쓰기 종료가 미확인인 동안 후속 성공만으로 복원이 열리지 않고, 종료 확인 뒤 새 전달 확인으로만 복원이 열린다.
- [ ] T7. strict push·수동 Sync·실제 소스 구성/리포 설정 변경에 기준 무효화를 연결한다. 선언만 바뀐 base와 실제 적용 base를 구별한다.
  검증: deferred/거부/실패는 무효화하지 않음, 성공한 표면만 무효화, 재활성화로 기준 부활 없음, 늦은 Publish가 무효화를 덮지 않음.
- [ ] T8. 배포 A의 구버전 writer 종료·수집 개시·롤백 절차를 문서화하고 적용 상태를 확인한다.
  검증: 구버전 혼재 기간에 수집한 기준으로 Revert가 열리지 않음. 초기 unknown이 남아도 기존 Save/Publish가 동작함.

## C3. 조회·저장·복원 껍데기 — 커밋 경계 3

- [ ] T9. 트리/요약 목록/상세·검색 조회를 구현한다. 조회·상세에 projectId+surfaceId를 적용하고 summary와 match 조각만 목록에 전달한다.
  검증: SQL 집계와 순수 oracle이 같은 키/셀을 셈, refs fan-out 없음, 페이지 경계 안정성, 다른 테넌트 데이터 0, 입력 상한/성능은 T1 확정값 이내. 설명에만 검색어가 있는 키는 제외하고 키 이름·원문·활성 저장 번역 일치는 포함한다.
- [ ] T10. batch Save Action을 구현한다. 전체 validation/plan 후 쓰기·셀별 사건을 같은 tx로 적용한다.
  검증: `pnpm test:projects:postgres`에 두 언어 중 하나 실패·사건 실패 롤백, 두 사용자 마지막 저장 승리, Publish CAS와 잠금 경합 회귀 추가; 기존 권한/세션/readiness 거부 유지.
- [ ] T11. preview/execute Revert Action과 `translation.reverted` 사건 표시를 구현한다. 확인 지문과 실행권/context를 서버에서 검증한다.
  검증: 권한별 matrix, 다른 키/소스 재사용, 확인 후 Save/Publish/Sync, unknown/invalid baseline, 동일값 token 폐기, 네트워크 재시도·PG 원자성 회귀 통과.
  검증: Publish 실패/결과 미확인 뒤 preview·execute 모두 옛 기준 복원을 거부하고 차단 사유를 표시한다. FAILED 종료·단순 재조회·시간 경과로 재활성화하지 않는다.
- [ ] T12. `routes`·기본 redirect·Home·Sources·Logs·Copy link를 새 Query 계약에 연결한다.
  검증: `app/__tests__/entry-points.test.ts`, `lib/__tests__/routes.test.ts`, 기존 landing 및 신규 선택키 착지 테스트; 키 이름 중복/특수문자/사라진 키/부적격 표면 검사.

## C4. 화면과 상호작용 — 커밋 경계 4 / 배포 B 구현

C4 완료는 프로덕션 개방이 아니다. preview에서 C5의 T18–T20을 통과한 뒤에만 프로덕션 배포 B를 진행한다. PostgreSQL·실브라우저·실리포 검증 중 미검증이 남으면 개방을 보류한다. 원격 배포는 Claude Code 경로를 따른다.

- [ ] T13. 단일 draft/navigation 소유자와 공통 Dialog를 구현한다. 셸 링크·뒤로/앞으로·검색/reset·키 선택·Sync/Publish/Revert의 미저장 정책을 배선한다.
  검증: 실제 사용자 이벤트 DOM 테스트로 취소 시 URL/draft 불변, 확인 시 목적지 단일 이동, 전송 중 중복 실행 거부. Publish 미저장 확인→기존 preview→실행 순서 및 결과 후 draft 보존 검사. 브라우저 history/beforeunload는 실물 검사.
- [ ] T14. 트리+요약 목록+로케일 상세와 리사이즈를 확정 시안에 맞춘다(5차 기준 로케일420/목록336/트리208 하한, 980 미만 트리 접힘·772 미만 본문 가로 스크롤). md/sm 필터, 원문 도움말, 저장 푸터, saved 행 보존, 독립 스크롤을 구현한다.
  검증: 기존 프리미티브·focus ring·선택 굵기 규칙 통과. 활성 언어만 그리며 상세 필터 변경이 전체 Save/복원 대상을 숨기지 않음. 선호 폭을 임시 clamp 값으로 덮지 않으며 접힌 트리 선택도 같은 draft guard 사용.
- [ ] T15. 로딩/빈 목록/키 부재/오류/권한 상실/unknown baseline/세션 복구/보관을 구현하고 `messages/en.tsx`를 갱신한다.
  검증: 데이터 0과 조회 실패가 구분됨, EDITOR Sync 거부, 전송 결과 미확인 표현, 사용자 변경/스토리지 차단 시 draft 오복구 0, 번역 카탈로그 검사 통과.
  검증: A 제출→B 추가 입력→A 성공→세션 만료→같은 사용자 재인증·인가 뒤 B가 Not saved로 복구된다. 남은 변경을 저장해 dirty 0개가 되면 복구 사본이 제거된다.

## C5. 제거·문서·최종 검증 — 커밋 경계 5

- [ ] T16. 새 화면의 소비자 전환을 확인한 뒤 옛 locale 선택·KeyGroup·blur 저장·옛 칩/문구를 제거한다. 공유 함수와 URL 호환은 소비자 확인 후 유지/교체한다.
  검증: `rg`로 dead import/옛 Action 소비자 확인. 기존 `components/__tests__/{translation-interactions,translation-table,translations-screen}` 테스트의 행동 계약을 새 UI 테스트에 이관. 핸드오프가 지칭한 `query.test.ts`/surface 페이지 테스트는 현재 실재 여부를 확인하고 필요한 경로에 신설.
- [ ] T17. PRODUCT(명시 저장·Revert 권한/폐기 예외·URL), ARCHITECTURE(스냅샷·성공 CAS·잠금·무효화), DESIGN(세 패널/상태/폭), DIRECTORY(실제 파일)와 운영 배포 절차를 갱신한다. 새 env는 없으므로 env 샘플 변경 없음.
  검증: 문서가 실제 코드의 계약만 설명하고 이 spec의 미확정 항목을 구현된 사실로 쓰지 않음. AGENTS/명령 미러는 직접 편집하지 않음.
- [ ] T18. `pnpm typecheck`, `pnpm test`, `pnpm test:projects:postgres`를 실행한다. DB 또는 환경 부재로 못 돌리면 구체적인 미검증 범위를 보고한다.
  검증: 신규/기존 전체 결과 기록. 실패를 소스 단언 삭제로 덮지 않음. 이 feature 문서 작성 단계에서는 빌드·테스트를 실행하지 않음.
- [ ] T19. 실제 브라우저에서 1280/1440/1920 × LNB 200/240/320, 긴 키/원문/200 언어 fixture, 키보드/IME, 440 Dialog 취소·복원 성공 후 disabled 버튼 대체 포커스, 접힌 트리 열림·선택·닫힘, 리사이즈, history·재로그인을 검증한다.
  검증: 카드/textarea 실제 폭·클리핑·포커스 결과 기록. FCP뿐 아니라 responseEnd/transferSize/loadEventEnd·목록 선택 가능 시각을 기존 fixture와 비교. 절대 성능은 dev 서버 수치로 판정하지 않음.
- [ ] T20. preview 환경에서 승인된 실리포의 전달→재편집→Revert→Publish 왕복을 검증한다. base 빈값/비-base 부재·수술적/재생성 어댑터·동일값 재전송을 포함한다.
  검증: DB 복원값과 실제 PR 의미·결정적 바이트, no-changes 브랜치 원복, 경고 시 기준/토큰 불변. 원격 쓰기는 Claude Code의 승인된 `/l10n-roundtrip` 실행으로 인계하고 결과를 기록. T18–T20 통과 기록은 프로덕션 배포 B의 선행 조건이다.

다음 진입점: T1(design §10)·C1(T2–T4, `lib/translations/*` · `planKeySave`)이 닫혔고 불변식 문서(ARCHITECTURE §0·§5.8 · PRODUCT §3 · CLAUDE.md)를 미구현 표시로 먼저 고쳤다. 다음은 C2(T5 `/db`)다 — 불변식 변경이라 `/ship bypass`가 아니라 수동 흐름이다. 문서 작성 완료는 Revert 구현/배포 완료가 아니다.
