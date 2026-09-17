# tasks — Sync 편집 보호와 PR 인계

문서 준비만 완료. D1 프로젝트 전체 보류와 D2 열린 PR 수동 갱신을 반영했다. 체크박스는 구현 완료 상태가 아니다.
순서는 순수 계약 → 데이터/껍데기 → UI → 실물 검증이다. 각 경계의 테스트는 구현보다 먼저 red를 확인한다.

## Commit 1 — Pure protection contracts

- [ ] T1. 확정된 D1·D2를 기준으로 결과 union·거부 순서를 인터페이스에 고정한다.
  - 검증: 자동/수동 Sync, 수동/자동 Publish, 열린 PR unknown의 결정표에 빈 칸 없음.
- [ ] T2. baseline 비교·적재·Publish·승인·전달 토큰·화면 판정의 인터페이스 테스트를 작성한다.
  - 검증: spec 완료 조건 1–10의 순수 반례에서 red, 최소 구현 후 관련 테스트 green.
- [ ] T3. 파일 목록 정렬/중복/경로/크기 검사와 신규 로케일 발견 계약을 구현한다.
  - 검증: 5개 어댑터의 추가·삭제·이동·주석·빈 카탈로그·깨진 파싱 fixture, Git blob hash와 일치.

## Commit 2 — Additive schema and compatible writers

- [ ] T4. 제안 컬럼의 additive migration 및 dual-write를 작성한다. 인덱스는 pending 집계 쿼리 계획으로 결정한다.
  - 검증: `/db` SQL 검토, 생성 클라이언트 typecheck, 기존 코드와 호환되는 nullable/default 확인.
- [ ] T5. 저장 tx에서 Project 잠금·인가/키/로케일/실행권 재검사, pending 토큰 교체를 구현한다.
  - 검증: 실제 PG에서 수동 Sync와 저장 교차, 같은 ms 저장, no-op 저장, A/B 프로젝트 격리.
- [ ] T6. 기존 미전달 술어 기반 backfill·검증 절차와 구 writer 차단 순서를 준비한다.
  - 검증: 기존 count/view/raw SQL과 토큰 집계 동등성, 전환 중 편집 누락 0. 이 단계에서는 새 판정 활성화하지 않음.

## Commit 3 — Repository snapshots and protected imports

- [ ] T7. 단일 push 생산자·CLI에 manifest를 추가한다. 동일 Git blob으로 파싱·해시하며 dirty 로케일은 거부한다.
  - 검증: CRLF/filter, untracked 파일, target 하위 경로, 구 payload, secret 비노출, CLI exit/출력 계약.
- [ ] T8. 최초 생성·Add surface·재시도·수동 import 모두 완전 적재와 baseline을 원자 저장한다.
  - 검증: 부분 실패는 baseline null, 정상 empty는 유효 baseline, 두 표면 생성 중 실패 시 전체 롤백.
- [ ] T9. `/api/push`에 apply/preserve/defer를 연결하고 관측 상태·역행·실행권 검사를 적용한다.
  - 검증: A 편집+B 리포 변경에서 A/B 요청 모두 보류, 요청 commit 전체 트리 확인, 조회 전후 저장·설정 경합, 동일+pending에서 Translation SQL 0회, 구 클라이언트 안전 보류, 늦은 실패 보고가 최신 상태를 덮지 않음.
- [ ] T10. 수동 Sync 폐기 승인 snapshot/HMAC과 실행권을 연결한다. 표면별 부분 결과와 자기 표시 정리를 유지한다.
  - 검증: OWNER/EDITOR, 같은 N 다른 토큰, 만료/재사용, Dialog 뒤 새 저장, 설정 변경, 부분 성공을 실제 PG에서 검사.
- [ ] T10a. 완전 적재의 활성 셀에서 리포 빈값·누락을 반영하도록 strict 적용을 보완한다. T8의 완전성 판정과 T10의 승인 검사를 선행 조건으로 둔다.
  - 검증: 실제 PG에서 앱 편집값이 있는 셀에 리포 빈값/누락을 각각 적용해 값이 빈 문자열이고 저자·pending 토큰·사라진 메타데이터가 함께 정리됨을 확인한다. 실패 파일·다른 표면·다른 프로젝트의 값/저자/토큰과 orphan 번역 값은 보존되며, 구 payload/부분 파싱은 부재 기반 초기화 0회, preserve/defer는 초기화 SQL 0회다. tx 실패 시 값과 토큰 모두 롤백된다.

## Commit 4 — Publish safety and handoff

- [ ] T11. pending predicate를 토큰으로 전환한다. 화면·count·목록 raw SQL·미리보기·cron 대상을 함께 갱신한다.
  - 검증: `pnpm test:projects:postgres`, 기존 `lastPulledAt`의 다른 소비자가 의미를 유지하는 회귀 테스트.
- [ ] T12. Publish 스냅샷에 baseline과 편집 토큰을 싣고 최신 단일 base와 비교한다. 적재와 실행권을 상호 배제한다.
  - 검증: 일반 코드 변경은 통과, 표면 하나 stale/unknown은 GitHub 쓰기 0회, 검사 SHA=tree/parent SHA.
- [ ] T13. writer 경고에서 사전 중단, 성공 시 토큰 CAS 해제, unknown 재시도를 구현한다.
  - 검증: Publish 중 같은 셀 새 저장 보존, 응답 유실/DB 완료 실패에서 토큰 보존, 실제 PR 확인 후 재시도 해제.
- [ ] T14. D2에 맞춘 cron 정책과 pending 0 no-op을 연결한다. 사용자 승인 no-change 정리는 유지한다.
  - 검증: Publish→Sync→cron에서 기존 PR head 불변, Publish→편집 원복→승인 재Publish에서 기존 PR diff 제거.
- [ ] T15. 기존 PR 대비 파일 diff와 preview snapshot 확인을 추가한다.
  - 검증: Sync 후 새 편집 재Publish에서 이전 PR 삭제분 표시, preview 이후 편집/PR head/설정 변경 거부, diff 읽기 실패·한도 초과 시 쓰기 불가.

## Commit 5 — User feedback

- [ ] T16. 보류/확인 불가/최신 확인/마지막 적재 상태와 OWNER/EDITOR별 액션을 Home·번역 화면·목록에 연결한다.
  - 검증: DOM에서 상태별 접근 이름과 링크 도달, 보류를 성공으로 표시하지 않음, refresh 뒤 결과 유지.
- [ ] T17. 수동 Sync의 N개 폐기 확인과 Publish stale/unknown/PR 교체 결과를 기존 Dialog/모달에 반영한다.
  - 검증: 취소 무변경, 키보드/포커스, 실행 중 저장 거부가 미저장 입력을 지우지 않음, 시안과 브라우저 실측 일치.
- [ ] T18. CLI/Actions warning과 앱 메시지를 일치시킨다. ‘push가 PR을 덮는다’는 기존 경고를 새 인계 계약에 맞춘다.
  - 검증: 실제 deferred 응답이 CI green+warning, 실제 오류는 red, 토큰·원문 비노출.

## Commit 6 — Verification and canonical documentation

- [ ] T19. 전체 타입·단위·DOM·격리 PostgreSQL 게이트를 실행한다.
  - 검증: `pnpm typecheck`, `pnpm test`, `pnpm test:projects:postgres` green. 실제 GitHub 검증과 구분해 보고.
- [ ] T20. `/l10n-roundtrip`으로 1.0.0→편집→일반 코드 1.0.1→Publish와 로케일 변경 1.0.1→보류를 실물 검증한다.
  - 검증: 5어댑터 fixture의 PR 파일/부모, 편집 보존, 수동 폐기, 전달 뒤 Sync/cron PR head 불변 증거.
- [ ] T21. 두 표면·구 action·부분 파싱·새 로케일·네트워크 지연·preview 이후 경합을 검증한다.
  - 검증: API/CLI/DB/UI/PR의 결과가 spec 완료 조건 1–11과 일치. 경합은 barrier 기반이며 sleep 타이밍에 기대지 않음.
- [ ] T22. PRODUCT/ARCHITECTURE/DESIGN/ACTIONS/DIRECTORY/OPERATIONS를 구현 결과로 갱신한다.
  - 검증: strict 무조건 덮어쓰기, 시각 기반 pending, 무편집 PR reset, 열린 PR CI 경고의 낡은 설명 검색 결과 0. CLAUDE 원본 편집은 이 태스크에 포함하지 않음.

## 배포 순서 및 종료

- [ ] T23. dev additive → 호환 writer → 구 writer 배제 → backfill 검증 → 보호 판정 전환을 preview에서 완주한다.
  - 검증: 전환 중 작성한 편집이 pending으로 남고 baseline null 프로젝트가 안전하게 안내됨.
- [ ] T24. 동일 순서의 prod 전환과 새 action 버전/대상 workflow 갱신을 Claude Code 배포 경로에 인계한다.
  - 검증: prod migration 상태, 대상 리포가 새 manifest 전송, 구 클라이언트 안전 경로, 운영 smoke. Codex는 push/merge/tag 이동 안 함.
- [ ] T25. 완료 결론을 정본에 올린 뒤 이 feature 디렉터리를 제거한다.
  - 검증: 정본만으로 정책·복구·운영 절차를 찾을 수 있음. 미완일 때 디렉터리를 제거하지 않음.

빌드는 `/push` 게이트에서 수행한다. 이 feature 문서 작성 단계에서는 코드·스키마·환경변수 변경, 테스트 실행, 커밋을 하지 않는다.
