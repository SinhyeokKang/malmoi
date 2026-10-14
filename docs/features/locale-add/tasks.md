# Add and remove languages — 태스크

작성: 2026-10-13 · 개정: 2026-10-14(2차 검수 반영). 순서는 기준 확인·정본 → 판정 테스트 → 스키마·코어 → 적재/Publish → UI·MCP → 가이드·왕복 검증이다. 이 문서는 구현 계획이며 완료 표시는 구현 증거가 있을 때만 한다.

코드 변경은 TDD red → 구현 → `pnpm test`, DB·적재·Publish 변경은 `pnpm gate`(트리거 시 격리 PG 포함)로 검증한다. UI는 jsdom DOM 테스트와 수동 확인을 구분한다. 빌드·배포는 해당 스킬 게이트에서 수행한다.

## 배치와 머지 규칙

| 배치 | 범위 | 사용자 진입점 |
|---|---|---|
| 1 | §0, §1, §5의 upsert/delete union·호스트 가드·fake client | 없음(동작 중립) |
| 2 | §2, §3, §4, §5 나머지 | 없음 |
| 3 | §6, §7, §8, §9 | UI·MCP 노출 |

- 배치마다 `/push` 게이트를 통과한다.
- **이 기능의 미완 배치·미결 태스크가 dev에 있는 동안 `/merge`를 하지 않는다.** 배치 3과 §9 왕복 검증까지 끝나야 머지한다.

## 0. 기준 확인·정본·계약 조사 — §1 착수 전 게이트

- [x] 로컬 체크아웃이 v1.4.0을 포함한다. 검증: `git merge-base --is-ancestor 456e0e1f HEAD` 성공, `lib/gitlab/` 존재.
- [x] PRODUCT §7.2 추가·삭제 해제와 ARCHITECTURE 불변식 1 예외 경계 문장(design §7)을 코드보다 먼저 고친다. 검증: 두 정본의 문장이 spec §3·design §7과 일치, 문서별 커밋.
- [x] GitHub 트리 삭제(`sha: null`)·GitLab commit `delete` 계약과 `PullChange`·`SnapshotChange` 소비자를 대조한다. 검증: design §2 union 절에 소비자 파일 목록과 세 가드 위치(파일:줄)를 커밋.
- [x] `deliveredLocaleChanges` 위치(DeliveryConfirmation 컬럼 vs 소스 행)와 Publish 성공 경계·`publish-unsettled` 장벽의 재사용 지점을 확정한다. 검증: design §1에 결정과 근거 커밋.
- [x] `pendingWhere` 소비자 12곳(`lib/keys/query.ts`·`revert.ts`·`translation-list.ts`, `lib/protection/*`, `lib/publish/read.ts`, `lib/pull/load.ts`·`plan.ts`·`run.ts`, `lib/push/apply.ts`, `lib/surfaces/remove.ts`)과 조기 종료 세 자리(`lib/pull/run.ts` withheld, `shouldSkipPull`, `lib/nightly/plan.ts` `upToDate`)를 design §0·§4 표로 고정한다. 검증: 각 자리에 “변경 없음/언어 작업 추가” 판정이 적힌 표 커밋.
- [x] Chrome 공식 지원 목록과 목록 밖 디렉터리 동작(unpacked·웹스토어)을 확인하고 출처·확인일을 기록한다. 검증: 목록 파일에 출처 URL·확인일.
- **위 산출물이 커밋되기 전에는 §1에 착수하지 않는다.**

## 1. 순수 판정 — 테스트 먼저

- [x] `planLocaleAdd`: 잘못된 코드/경로, Chrome 목록, 중복·유사 코드, orphan 되살림, 보관·포맷 거부. 검증: `../x`, `package`, 빈 값, `__proto__`, 길이 초과, `pt-BR`/`pt_br` 표 테스트 green.
- [x] `planLocaleChange`: design 전이 표 전체, 기준 언어 제거, 변경 중 기준 승격, 권한·보관·미확정 실행·오래된 지문, 그 언어 미전달 편집의 지문 승인 폐기. 검증: 각 거부는 쓰기 0, 추가→취소→재추가·제거→취소→재제거 표 테스트 green.
- [x] `localeEffects`: 행 + 값 수 → 정규화 목록, 비교. 검증: 빈 ADD 제외, 코드순 정렬, 전달 전 취소 후 목록 = 전달 목록, 전달 후 취소 후 목록 ≠ 전달 목록, `__proto__` 코드.
- [x] `planLocalePublish`: ADD/REMOVE × 전달됨/미전달 × base 있음/없음, 경로 충돌·소유 불명·비정규 파일. 검증: REMOVE가 재Publish에서 유지, 빈 ADD 파일 0, upsert/delete 중복 거부, base 읽기 실패 시 delete·`no-changes` 0.
- [x] 만료 판정: 열린 PR 있음/없음/조회 실패 × 목록 일치/불일치 × 파일 있음/없음. 존재 판정은 적재의 함수를 재사용. 검증: 조회 실패·불일치는 만료 0, 미머지 종료 + 파일 있음 → 활성, 파일 없음 → orphan, “orphan인데 ADD 행” 모순 행 → 만료.
- [x] 판정 모듈 중 클라이언트가 읽는 잎만 `client-graph` 게이트에 반영한다. 검증: `client-graph.test.ts` green, 서버 I/O·어댑터 중량 의존성 유입 0.

## 2. 스키마·배포 경계

- [x] `/db --create-only`로 `LocaleChange`(enum·복합 FK·인덱스)와 `deliveredLocaleChanges` 생성. 검증: SQL 검토에서 additive·백필 없음·Locale/Translation FK Restrict 유지.
- [x] `scripts/gate-plan.ts`의 `test:projects:postgres` 트리거에 `lib/locales/`를 추가한다. 검증: gate-plan 테스트 갱신 green, `lib/locales/change.ts`만 바꾼 diff가 격리 PG를 붙임.
- [x] 런타임 롤 권한은 손 GRANT 없이 `deploy/bootstrap.sql` default privileges로 검증한다. 검증: `self-hosted-bootstrap.integration.ts` green.
- [ ] 마이그레이션 순서: `/db --create-only` 검토 → dev 적용 → dev `has_schema_privilege` false 확인 → `/push` → (`/merge` 1단계) `pnpm db:status:prod` → `pnpm db:deploy` → prod `has_schema_privilege` false 확인 → 머지. prod에 `migrate dev` 금지. 검증: `/db`·`/merge` 보고에 각 단계 결과.
- [x] SELF-HOSTING §3 대조와 롤백·재배포 서술(design §7). 검증: 버전 건너뛰기 업그레이드 가능, 새 환경변수 없음, OPERATIONS에 구버전 구간 영향 기록.

## 3. 공통 변경 코어·사건

- [x] 추가/되살림: Project→Surface 잠금, Locale·변경 행·셀 토큰·사건 같은 tx. 검증(격리 PG): 값 있는 활성 셀만 토큰 재발급, 값/저자 유지, baseline 임의 생성 없음, 사건 실패 시 롤백.
- [x] 제거·추가 취소 미리보기·실행: 대상 경로·번역 수·미전달 수·서버 지문, 미전달 편집 승인 폐기. 검증(격리 PG): 다른 언어 미포함, 미리보기 쓰기 0, 오래된 지문 거부, 상태 쓰기·폐기·사건 원자성.
- [x] 제거 취소: 행 삭제·편집 허용. 검증: 전달 전이면 작업 0, 전달 후면 작업 1, 다른 언어 변경 없음.
- [x] 번역 저장·Revert·기준 언어 변경·MCP 쓰기에 제거 상태 판정. 검증(격리 PG): 렌더 뒤 제거/기준 변경 경합에서도 서버가 거부.
- [x] `publish-unsettled`·RUNNING 실행권과 언어 변경의 상호 배제. 검증(격리 PG): 잠금 순서 동일, 미확정 실행 중 변경 거부, 실행 중 새 요청이 확인 뒤에도 작업으로 남음.
- [x] CI push 적재와 언어 변경 tx의 잠금 순서. 검증(격리 PG): 같은 순서, 추가 tx 직후 적재가 빈 ADD를 orphan하지 않음(첫 red), REMOVE tx 직후 적재가 보류.
- [x] 사건 payload/view·query 필터와 `locked-access`·진입점 목록 갱신. 검증: 옛 payload 읽기 유지, locale 사건이 source-added로 표시되지 않음.

## 4. 적재·Sync·수명주기

- [x] 자동 적재: 빈 ADD orphan 제외, 실제 파일 관측 시 일반 로케일 전환. 검증: CI/야간/빈 페이로드/제안 0셀 매트릭스, 기존 응답 집계 일치.
- [x] 전달 전 REMOVE의 `locale-change-pending` 전체 보류와 전달 후 열린 PR 보호. 검증: deferred 응답·야간 결과·ACTIONS 사유 일치.
- [x] 만료: 적재가 겸하는 경로와 같은 SHA 야간 경로. 검증(`lib/pull/__tests__/fake-client.ts` 기반 `pnpm test`, GitHub·GitLab fake 각각): 미머지 종료 + 동일 base head + 다른 편집 없음/있음에서 종료된 요청 재전송 0, 조회 실패 시 보류와 `pr-check-failed` 기록, 행 없는 프로젝트의 기존 스킵 유지.
- [x] 승인 Sync 지문에 언어 변경과 전달 목록 포함. 검증: 추가/제거/취소/새 편집/전달 뒤 옛 승인 거부, 성공한 적재만 행·전달 목록 정리, 다음 Publish에 폐기 삭제 재등장 없음.
- [x] source 제거·재등록과 설정/연결 변경의 승인 또는 거부. 검증: 다른 source/다른 리포에 삭제 의도 유출 0, 옛 지문 재사용 거부.
- [x] 만료·취소 사건. 검증: 파일 삭제를 번역 전달 성공으로 기록하지 않음, 값·행·이력 보존, base 읽기 실패 시 사건 outcome이 실패/보류.

## 5. Publish 계약·호스트 구현

- [x] `SnapshotChange` upsert/delete union과 결정적 정렬. 검증: base에 있는 파일을 출력에서 뺀 경우와 실제 delete의 차이, 경로 중복 거부.
- [x] GitHub `TreeEntry`·빈 변경 가드, GitLab `buildCommitActions`·빈 배열 가드와 fake client 갱신. 검증: 삭제만 있는 변경 통과, 대상 파일만 제거, Chrome 디렉터리 내 다른 파일 유지, 없는 경로는 delete 미생성, 양쪽 호스트 계약 테스트.
- [x] ADD 표현 출처: 기준 언어 파일에서 표현만, 구조는 `nestedByPath`. 검증: 4칸·CRLF·BOM·이스케이프·Chrome 필드 순서·한 줄 엔트리; 기준 파일이 빈 `{}`일 때 중첩 판정; Chrome `placeholders`·`description` 비복사와 되살린 `placeholders: null` 유지; 새 파일 read → write → read 바이트 동일; `contract.ts` 매트릭스 행 green.
- [x] 신규 경로 충돌 보류와 빈 ADD 안내. 검증: 미리보기·실행 같은 수·이유, 일부 보류일 때 나머지 전달, ADD 미리보기의 diff 경로 = 서버 계산 경로.
- [x] 조기 종료 세 자리와 미리보기·trigger 갱신. 검증: 미전달 편집 0과 Translation 행 0(`maxUpdatedAt=null`) 각각에서 REMOVE 실행·전달 확인; 번역 전부 보류 + 안전한 삭제는 전달; 빈 ADD만 있으면 원격 쓰기 0.
- [x] 전달된 REMOVE를 후속 스냅샷에도 반영. 검증: 삭제 PR이 열린 채 다른 언어 번역 → 재Publish → 삭제 diff 유지.
- [x] 전달된 추가 취소·제거 취소의 `no-changes` 수렴. 검증: stale sync diff가 reset되고 필요하면 기존 PR 닫기 완료; 그 전에 전달 목록 갱신 안 함.
- [x] 캡처 목록 전달 확인과 baseline 분리. 검증: committed/no-changes 실제 수렴만 기록, 실패·응답 유실 미기록, REMOVE 셀은 번역 전달 목록에서 제외, 재시도 멱등.
- [x] PR/MR 본문의 앱 코드 정리 안내. 검증: 삭제 파일이 있을 때만, GitHub·GitLab 본문 둘 다.
- [x] 미리보기/실행 base 지문·경로 소유 재확인. 검증: 대상 blob·설정 변경 시 재확인, 임의 파일·심볼릭 링크·공유 경로 삭제 0.

## 6. UI·집계

- [x] Server Action: 추가·미리보기·제거·제거 취소, 값 오류 코드와 성공 뒤 revalidate. 검증: 인증/권한/진입점 테스트 green, 미리보기에는 revalidate 없음.
- [ ] design-brief 프레임 1~25의 로컬 핸드오프를 확보한다. 검증: 브리프의 모든 프레임이 핸드오프에 존재(권한·좁은 화면·라이트/다크·포커스 포함).
- **위 핸드오프가 확보되기 전에는 아래 UI 퍼블리싱 태스크(Dialog·배지·번역 화면 DOM·Publish 표시·화면 문구·`/design-sync`)에 착수하지 않는다.** Server Action·reducer·`summary.ts`·집계는 핸드오프 없이 진행한다.
- [ ] Sources Add Dialog·행 동작·확인 Dialog·상태 배지. 검증(DOM): design-brief 프레임의 상태별 배지·톤·버튼, base/EDITOR/보관/비지원/미확정 비활성 이유(`aria-disabled` + 설명), 정확한 파일 경로·미전달 수·앱 코드 정리 경고, Inactive danger 톤·Open 비활성·재추가 안내, 정렬과 `role="status"` 알림·포커스 규칙. 클릭 전 enabled 대기(POSTMORTEM 2829).
- [x] 번역 화면 셀 얼리기 — reducer(node): REMOVE 도착 시 dirty 셀 유지·readOnly·save payload 제외, 셀 reset, 제거 취소 시 편집 가능, 다른 언어만 저장. 검증: `draft` 테스트 green.
- [ ] 번역 화면 셀 얼리기 — DOM(jsdom): 서버 갱신 주입 시 입력 보존, 저장 중 제거 거부 시 입력 유지·전용 footer 문구, 세션 만료 중 저장의 입력 보존, 이탈 확인에 얼린 입력 포함. 검증: transition 정리(POSTMORTEM 2187)·클릭 가능 대기를 포함한 DOM 테스트 green.
- [ ] 번역 화면 셀 얼리기 — 수동: 두 세션·두 언어에서 외부 제거. 검증: `/runtime-test` 리포트에 결과.
- [x] `summary.ts`가 REMOVE 언어를 읽기 전용으로 싣는다. 검증: 상세 데이터 테스트에 REMOVE 언어 포함, orphan 제외.
- [x] 완료율·Home·Keys 검색·Inbox·Sources 수를 상태 술어에 맞춘다. 검증: ADD 포함, REMOVE 작업 제외/상태 행 유지, 취소 시 복구.
- [ ] Publish 미리보기·결과의 `New file`/`Updated`/`Removed`와 빈 ADD·보류·PR 갱신 필요. 검증: 파일 삭제 수를 번역 전달 수로 표시하지 않음, PR 반영 전 완료 문구 없음.
- [ ] en·ko·es 문구를 호스트별(`onGitLab`) 어휘로 반영, `orphanStrip` 원인 중립화, 카드 설명 OWNER/EDITOR/비지원 분기. 검증: dictionary-consistency·banned-terms·no-korean-ui green.
- [ ] `/design-sync`로 신규 UI 대조. 검증: 로컬 핸드오프와 computed style·접근성 트리, 키보드·IME·포커스 복귀·좁은 폭·라이트/다크 확인.

## 7. MCP

- [x] `add_locale`(WRITE), `preview_locale_removal`(READ), `remove_locale`(DESTRUCTIVE), `cancel_locale_removal`(WRITE) 등록. 검증: `lib/mcp/catalog.ts`의 등급·`req("project:settings", ...)`, EDITOR/권한 없는 토큰 거부, 서버 발급 지문 필요, Action 호출 없이 공통 코어 사용, `__proto__` 코드 입력.
- [x] `get_project`·`list_keys`·publish/sync preview에 언어 상태·전달 여부·작업 수 반영. 검증: 웹과 같은 판정/보류/거부, 영어 응답.

## 8. 정본·가이드

- [x] ARCHITECTURE: LocaleChange 전이, 전달 목록, 만료, 명시적 delete, `no-changes` 취소 수렴, 전달/머지 구분, MCP 계약(불변식 1 예외는 §0에서 완료).
- [ ] DESIGN Sources·번역 읽기 전용·Publish 상태/문구, Inactive 문구 변경. DIRECTORY 새 모듈. ACTIONS `locale-change-pending`. OPERATIONS 마이그레이션 순서·구버전 구간 영향.
- [x] CLAUDE 데이터 변경 경로/소유 원칙과 `pnpm sync:agents`. README 기능 설명 검토.
- [ ] `/guide`로 en·ko·es의 “리포에서만 언어 추가·제거” 문구와 MCP 표 갱신, `/guide-shots`로 stale 스크린샷 갱신.
- 검증: 정본과 spec의 범위 일치, `pnpm sync:agents:check`, 문서 신선도 및 가이드 게이트 통과.

## 9. 배포·왕복 검증

- [ ] 배치별 `/push`의 dev migration·검증 게이트. 검증: `pnpm gate`(격리 PG 포함) 통과.
- [ ] `/runtime-test`: 추가 → 번역 → 개별 취소, 기존 언어 제거 → 읽기 잠금 → 취소, 삭제만 있는 Publish, EDITOR·기준 언어 거부, 승인 Sync, 두 세션 외부 제거. 검증: 화면 결과와 실제 DB/원격 결과 일치.
- [x] `/roundtrip` 매트릭스(json-catalog·chrome-locales × GitHub·GitLab): 새 파일 → 머지 → 제거 → 다른 언어 편집 후 재Publish에도 삭제 유지 → 삭제 취소 → 삭제 재요청/머지 → 재추가로 값 복구. 검증: 네 조합 모두 같은 결과.
- [x] 별도 왕복: 추가 전달 후 취소, 미머지 PR/MR 종료(새 base 커밋 없이 다음 야간 방문, 다른 언어 편집 없음/있음), base에서 대상 선삭제, 네트워크 실패/재시도. 검증: 활성 복구, 종료된 요청의 새 PR/MR 재전송 0, stale diff·중복 실행·거짓 전달 확인 없음.
- [ ] 프로덕션은 사용자가 별도 `/merge`를 호출할 때, 배치 3과 위 왕복이 끝난 뒤 수행한다. 검증: §2 마이그레이션 순서 선행과 self-host 업그레이드 안내 포함.
