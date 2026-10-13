# Add and remove languages — 태스크

작성: 2026-10-13 · 개정: 2026-10-14. 순서는 판정 테스트 → 스키마·코어 → 적재/Publish → UI·MCP → 정본·왕복 검증이다. 이 문서는 구현 계획이며 완료 표시는 구현 증거가 있을 때만 한다.

원격 dev에는 v1.4.0과 GitLab 로그인이 반영됐다. 옛 착수 대기 조건은 해소됐지만 아래 설계 실측·시안은 남아 있다. 코드 변경은 TDD red → 구현 → `pnpm test`, DB·적재·Publish 변경은 `pnpm gate`와 격리 PG 검증을 포함한다. 빌드·배포는 해당 스킬 게이트에서 수행한다.

## 0. 구현 전 계약·시안 확인

- [ ] GitHub 트리 삭제/GitLab commit delete 계약과 기존 `PullChange`·`SnapshotChange` 소비자를 대조한다. 검증: 명시적 삭제 fixture, 파일 없음·동일 경로 중복·비정규 파일 결과를 설계에 기록.
- [ ] 기존 SyncRun·DeliveryConfirmation에서 전달 PR/MR·base branch·커밋·설정 문맥을 식별하는 방법과 미확정 실행 복구 경로를 확정한다. 검증: 성공/부분 성공/응답 유실/종료 상태 표가 design §1·4와 일치.
- [ ] `pendingWhere`, Publish 스킵, 전부 보류 조기 종료, 자동 적재, 승인 Sync, source 제거/재등록, 연결/경로/기준 변경의 소비자를 전수 확인한다. 검증: 셀 편집과 언어 변경을 함께 보는 호출부 목록과 누락 0.
- [ ] Chrome 공식 지원 목록과 목록 밖 디렉터리 동작(unpacked·웹스토어)을 확인하고 출처·확인일을 기록한다. 검증: 지원 목록의 모든 코드가 경로/모양 검증 통과.
- [ ] design-brief 프레임 1~17의 로컬 핸드오프를 확보한다. 검증: 추가·제거·취소·전달 상태·권한·좁은 화면·다크 상태 포함. Codex 시안 대조는 로컬 핸드오프와 ego-browser를 사용.

## 1. 순수 판정 — 테스트 먼저

- [ ] `planLocaleAdd`: 잘못된 코드/경로, Chrome 목록, 중복·유사 코드, 200개 상한, orphan 되살림, 보관·포맷 거부. 검증: `../x`, `package`, 빈 값, `__proto__`, 길이 초과, `pt-BR`/`pt_br`, 제거 예정 포함 상한의 표 테스트 green.
- [ ] `planLocaleChange`: design 전이 표 전체, base 제거, 변경 중 기준 승격, 권한·보관·실행 중·미확정 원격·오래된 지문. 검증: 각 거부는 쓰기 0, 취소 반복·재제거까지 상태 표 테스트 green.
- [ ] `planLocalePublish`: ADD/REMOVE/RESTORE × pending/delivered × base 있음/없음, 경로 충돌·소유 불명·비정규 파일. 검증: REMOVE가 재Publish에서 유지, 빈 ADD 파일 0, upsert/delete 중복 거부.
- [ ] `planLocaleReconcile`: 열린/닫힌/조회 실패 PR × 파일 있음/없음 × 요청 token·전달 revision·설정 일치/불일치. 검증: 미머지 종료 시 값 덮기 전 활성 편집 보호 복구, 불명은 종료 안 함.
- [ ] 판정 모듈 중 클라이언트가 읽는 잎만 `client-graph` 게이트에 반영한다. 검증: 서버 I/O·어댑터 중량 의존성 유입 0.

## 2. 스키마·배포 경계

- [ ] `/db`로 `LocaleChange`와 enum·복합 FK·필요 인덱스 생성. 기존 proposedAt-only 안은 구현하지 않는다. 검증: create-only SQL 검토, additive·백필 없음, Locale/Translation FK Restrict 유지.
- [ ] migration/runtime 롤과 격리 PG 테스트 환경에 새 테이블을 반영한다. 검증: 런타임 CRUD 권한·schema 소유권/권한 게이트 green.
- [ ] SELF-HOSTING §3 대조 및 구버전 롤백 제한 기록. 검증: 버전 건너뛰기 업그레이드 가능, 기존 행은 일반 리포 소유 상태, 새 환경변수 없음.

## 3. 공통 변경 코어·사건

- [ ] 추가/되살림: Project→Surface 잠금, Locale·변경 행·셀 토큰·사건 같은 tx. 검증: 값 있는 활성 셀만 토큰 재발급, 값/저자 유지, baseline 임의 생성 없음, 사건 실패 시 롤백.
- [ ] 제거 미리보기·실행: 대상 경로·번역 수·미전달 수·서버 지문. 검증: 다른 언어 미포함, 읽기만 하는 preview, 오래된 지문 거부, 제거 상태 쓰기와 사건 원자성.
- [ ] 개별 추가 취소·제거 취소·재제거. 검증: 미전달 ADD만 즉시 orphan, 전달된 ADD/REMOVE는 원격 수렴 작업 생성, 삭제 이전 토큰 보존/복구, 다른 언어 변경 없음.
- [ ] 번역 저장·Revert·기준 언어 변경·MCP 쓰기에 제거 상태 판정. 검증: 렌더 뒤 제거/기준 변경 경합에서도 서버가 거부.
- [ ] live Publish 예약과 locale 변경의 상호 배제. 검증: 잠금 순서 동일, 실행 중 구성 변경 거부, 오래된 실행의 token 확인이 새 요청을 지우지 않음, 미확정 실행에서 로컬 취소 안 됨.
- [ ] 사건 payload/view와 `locked-access`·진입점 목록 갱신. 검증: 옛 payload 읽기 유지, locale 사건이 source-added로 표시되지 않음.

## 4. 적재·Sync·수명주기

- [ ] 자동 적재: 빈 ADD orphan 제외, 실제 파일 관측 시 일반 로케일 전환. 검증: CI/야간/빈 페이로드/제안 0셀 매트릭스, 기존 응답 집계 일치.
- [ ] REMOVE/RESTORE 미전달 전체 보류 및 전달 후 열린 PR 보호. 검증: 해당 언어 셀이 집계에서 빠져도 삭제 요청 보호 유지, deferred 응답·야간·ACTIONS 사유 일치.
- [ ] 종료 관측: 파일 없음 orphan, 파일 있음 활성 복구 후 편집 보호 재판정. 검증: 미머지 종료가 보존 셀을 strict 덮어쓰지 않음, 조회 실패·base 변경·동시 Publish는 상태 유지.
- [ ] 승인 Sync 지문에 언어 변경과 전달 문맥 포함. 검증: 추가/제거/취소/새 편집/전달 상태 변경 뒤 옛 승인 거부; 성공한 적재만 의도·승인 토큰 정리; 다음 Publish에 폐기 삭제 재등장 없음.
- [ ] source 제거·재등록과 설정/연결 변경의 승인 또는 거부. 검증: 다른 source/다른 리포에 삭제 의도 유출 0, 옛 지문 재사용 거부.
- [ ] 제거 확정·취소·미반영 사건. 검증: 파일 삭제를 번역 전달 성공으로 기록하지 않음, 값·행·이력 보존.

## 5. Publish 계약·호스트 구현

- [ ] `PullChange`/`SnapshotChange` upsert/delete union과 결정적 정렬. 검증: base에 있는 파일을 출력에서 뺀 경우와 실제 delete의 차이를 테스트, 경로 중복 거부.
- [ ] GitHub/GitLab 삭제 payload 및 fake client 갱신. 검증: 대상 파일만 제거, 비대상 파일·Chrome 디렉터리 내 다른 파일 유지, 없는 경로 처리, 호스트 양쪽의 계약 테스트.
- [ ] ADD 표현 출처: base 스타일만 빌리고 구조는 빌리지 않음. 검증: 4칸·CRLF·BOM·이스케이프·Chrome 필드 순서·한 줄 엔트리, 반복 렌더 동일 바이트·고정점, entry/key-order 회귀 green.
- [ ] 신규 경로 충돌 보류와 빈 ADD 안내. 검증: preview/run 같은 수·이유, 일부 보류일 때 나머지 전달, 0셀 제안도 안내에서 사라지지 않음.
- [ ] `hasPublishWork`와 모든 조기 종료·미리보기·trigger 갱신. 검증: 번역 0 + REMOVE/RESTORE는 실행, 번역 전부 보류 + 안전한 삭제는 전달, 빈 ADD만 있으면 원격 쓰기 0.
- [ ] 전달된 REMOVE를 후속 스냅샷에도 반영. 검증: 삭제 PR 열린 채 다른 언어 번역 → 재Publish → 삭제 diff 유지.
- [ ] 전달된 추가 취소 및 삭제 취소의 `no-changes` 수렴. 검증: stale sync diff가 제거/reset되고 필요하면 기존 PR 닫기 완료; 그 전에 성공 확인 안 함.
- [ ] token별 전달 확인과 baseline 분리. 검증: committed/no-changes 실제 수렴만 확인, 실패·응답 유실 유지, REMOVE 셀은 번역 전달 목록에서 제외, 재시도 멱등.
- [ ] 미리보기/실행 base 지문·경로 소유 재확인. 검증: 대상 blob·설정 변경 시 재확인, 임의 파일·심볼릭 링크·공유 경로 삭제 0.

## 6. UI·집계

- [ ] Server Action: 추가·미리보기·제거·취소, 값 오류 코드와 성공 뒤 revalidate. 검증: 인증/권한/진입점 테스트 green, preview에는 revalidate 없음.
- [ ] Sources Add Dialog·행별 제거/취소·확인 Dialog·상태 배지. 검증: design-brief 1~17의 DOM 상태, base/EDITOR/보관/비지원/실행 중 비활성 이유, 미전달 수와 정확한 파일 경로.
- [ ] 번역 화면에서 제거 예정 읽기 전용, 취소 뒤 입력 복구. 검증: 마운트 후 추가/제거/취소에도 stale 목록이나 편집 허용이 남지 않음, 미저장 입력 이탈 확인 유지.
- [ ] 완료율·Home·Keys 검색·Inbox·Sources 수를 상태 술어에 맞춘다. 검증: ADD 포함, REMOVE 작업 제외/상태 행 유지, 취소 시 복구.
- [ ] Publish 미리보기·결과의 add/update/delete와 취소 전달 필요·빈 ADD·보류. 검증: 파일 삭제 수를 번역 전달 수로 표시하지 않음, PR 반영 전 완료 문구 없음.
- [ ] en·ko·es 같은 변경으로 추가/제거/취소/미반영/복구 문구 반영. 검증: dictionary-consistency·banned-terms·no-korean-ui green.
- [ ] `/design-sync`로 신규 UI 대조. 검증: 로컬 핸드오프와 computed style·접근성 트리, 키보드·IME·포커스 복귀·좁은 폭·라이트/다크 확인.

## 7. MCP

- [ ] `add_locale`, `preview_locale_removal`, `remove_locale`, `cancel_locale_change` 등록. 검증: WRITE/READ와 project:settings 교차, EDITOR/쓰기 권한 없는 토큰 거부, 서버 발급 지문 필요, Action 호출 없이 공통 코어 사용.
- [ ] `get_project`·`list_keys`·publish/sync preview에 언어 상태·전달 여부·작업 수 반영. 검증: 웹과 같은 판정/보류/거부, token 원문 비노출, 영어 응답.

## 8. 정본·가이드

- [ ] PRODUCT §7.2 추가·삭제 해제, 비파괴 보존·기준 언어 제한·지원 포맷·개별 취소.
- [ ] ARCHITECTURE: 불변식의 존재 소유 예외, LocaleChange 전이, 셀/언어 작업 보호, 명시적 delete, no-changes 취소 수렴, 전달/머지 구분, MCP 계약.
- [ ] DESIGN Sources·번역 읽기 전용·Publish 상태/문구. DIRECTORY 새 모듈. ACTIONS 새 deferred 사유. OPERATIONS 마이그레이션 순서·구버전 롤백 제한.
- [ ] CLAUDE 데이터 변경 경로/소유 원칙과 `pnpm sync:agents`. README 기능 설명 검토.
- [ ] `/guide`로 en·ko·es의 “리포에서만 언어 추가·제거” 문구와 MCP 표 갱신, `/guide-shots`로 stale 스크린샷 갱신.
- 검증: 정본과 spec의 범위 일치, `pnpm sync:agents:check`, 문서 신선도 및 가이드 게이트 통과.

## 9. 배포·왕복 검증

- [ ] `/push`의 dev migration·검증 게이트. 검증: `pnpm test`·typecheck·격리 PG 포함 필수 게이트 통과.
- [ ] `/runtime-test`: 추가 → 번역 → 개별 취소, 기존 언어 제거 → 읽기 잠금 → 취소, 삭제만 있는 Publish, EDITOR·기준 언어 거부, 승인 Sync. 검증: 화면 결과와 실제 DB/원격 결과 일치.
- [ ] `/roundtrip`: 폐기용 리포에서 json-catalog·chrome-locales와 GitHub·GitLab 조합 검증. 검증: 새 파일 → 머지 → 제거 → 다른 언어 편집 후 재Publish에도 삭제 유지 → 삭제 취소 → 삭제 재요청/머지 → 재추가로 값 복구.
- [ ] 별도 왕복: 추가 전달 후 취소, 미머지 PR 종료, base에서 대상 선삭제, 네트워크 실패/재시도. 검증: stale diff·중복 실행·거짓 전달 확인 없음.
- [ ] 프로덕션은 사용자가 별도 `/merge`를 호출할 때 수행한다. 검증: prod migration 선행과 self-host 업그레이드/롤백 안내 포함. 이번 문서 수정은 배포 승인이 아니다.
