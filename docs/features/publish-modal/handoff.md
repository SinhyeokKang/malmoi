# Publish modal — Codex handoff (2026-09-16)

**UI는 다시 작업해야 한다.** 사용자 지시로 코드베이스 기준 기능 구현을 먼저 진행했고 design-sync는 실행하지 않았다. 시안 대조는 **미검증**이다. 이 문서의 완료는 기능 전체 종료나 push 승인으로 읽지 않는다.

## 실행 범위와 검증

- `/ship bypass docs/features/publish-modal`: 스코프 가드만 생략, dev에서 TDD red 커밋 후 구현·4관점 자체 검증·정적 리뷰까지 진행.
- 테스트 커밋: `2dac4ba`. 구현 커밋은 `git log`의 `feat(publish): require a preview and preserve modal outcomes`.
- 최종 `pnpm test`: **279 files / 4,147 passed**. `pnpm typecheck`: 통과. `git diff --check`: 통과.
- 두 실제 호스트(Home·TranslationsHeader)의 DOM 검사 14건: 조회→확인→실행, 닫기/재열기, 늦은 성공·실패 무시, 0건 refresh 이후 결과, 응답 유실, 포커스와 단일 live 경로.
- 스키마·환경변수 변경 없음. DB 마이그레이션 및 postgres 별도 게이트 대상(`lib/keys/**` 등) 수정 없음.
- 빌드·브라우저 실측·실제 스크린리더·실제 리포 왕복은 **미실행**. DOM 테스트를 실물 검증으로 간주하지 않는다.
- 원격 push·프로덕션 배포 없음. dev 푸시 대기 — Claude Code에서 검증 후 `/push` 실행. 프로덕션은 별도 `/merge`.

## 확정된 구현

- 두 화면 모두 Publish가 미리보기를 열며, 확인 버튼에서만 발송한다. 재시도도 새 조회·확인을 거친다.
- `loadPublishPreview`는 `translation:write` 인가의 projectId로만 조회하고 base 값·DB 값·열린 PR 삼상태를 반환한다. 읽기 전용이며 기존 Sync용 OWNER 인가는 유지한다.
- 조회 실패·모호한 파일 경로는 발송을 막는다. 진행 중 닫기는 실행을 유지하고 완료 결과는 별도 View result로 다시 연다.
- 실행 결과 8갈래와 모달 상태 5갈래는 별도 계약. 실패는 `code`·`retryable`·`delivery`를 전달하며, 응답 유실과 종료 기록 실패는 전송 여부 미확인이다.
- 온보딩 껍데기는 `components/ui/modal.tsx`로 이동했고 기존 경로는 재수출한다. 온보딩 호출부는 유지했다.
- 사용자 확정 문구: 양쪽 모두 **Publish + 배지**, **서버 초를 표시하되 카운트다운 없음**, **View pull request**.
- 시간 기반 무색 진행 표시, reviewer·갱신 결과 총 셀 수는 추가하지 않았다. 경고는 전부 펼쳐 보인다.
- 미리보기 상한은 **200셀**, 초과 수 표시. 그룹은 **표면 → 파일**. 이 상한은 실사용 성능 측정값이 아니라 초기 고정값이다.
- 로케일 경로가 없거나 multi-locale 경로 후보가 0개/여러 개이면 `1k`로 막는다. 첫 파일을 임의 선택하지 않는다. per-locale 새 파일은 경로가 확정되므로 before 없음으로 표시한다.

## Claude Code 후속 작업

1. `design_handoff_publish_modal`을 읽고 **UI를 재작업**한다. 현재 모달 치수·표·PR 메타·실패 본문/바닥은 기능 배선용 구현이다. `/design-sync publish-modal`로 온보딩 4단계 회귀도 함께 대조한다. `1k`는 캔버스가 없는 상태다.
2. `tasks.md` 20~22 실물 검증: 두 호스트 키보드/포커스, 실제 낭독(불가하면 미검증 기록), 폐기용 리포의 `1g` 경고·`1e` PR 갱신 왕복. 실제 리포 쓰기는 Claude Code에서 수행한다.
3. 열린 결정 유지: spec §8의 1(경고가 많을 때), 4(두 모달 형의 시각 경계), 8(0건+열린 PR 표현), 역할별 설정 버튼 대안은 승인된 것으로 취급하지 않는다. 현재 경고 전부 표시·0건 Publish 비활성·설정 버튼 원안 유지다.
4. 문서 영향: PRODUCT(필수 확인·재열기), ARCHITECTURE(PullOutcome·preview 표시 전용·조회/실행 시차), DIRECTORY(공용 modal·publish 모듈), DESIGN(최종 실측 규칙·기존 Alert 설명)을 문서별 별도 커밋으로 반영한다. 특히 기존 문서의 “구현 전”·Publish Alert 설명을 갱신한다.
5. 남은 검증·결정을 완료한 다음에만 tasks 27에 따라 기능 디렉터리를 정리한다. 지금은 인계 근거라 유지했다.
6. UI 수정 이후 typecheck·test·build와 `/push` 게이트를 전부 다시 거친다. 원격 push는 Codex가 수행하지 않았다.
