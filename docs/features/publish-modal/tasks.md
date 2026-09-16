# publish-modal — tasks

**배송은 하나다.** 한때 360 확인 Dialog를 선행 배송으로 떼어냈으나 **폐기했다** (2026-09-16 사용자) —
`1a`가 같은 질문을 더 잘 묻고, 둘을 연달아 세우면 되돌릴 수 없는 동작 앞에 물음이 둘이 된다.

⚠️ **`1a`는 우회 없는 필수 관문이다.** `[Publish]`는 언제나 목록을 먼저 보이고, 목록을 못 읽으면
(`1k`) 보내기 버튼이 서지 않는다. **"바로 보내기" 경로를 만들지 않는다.**

각 태스크에 **검증 방법 한 줄**이 붙는다. `▸`가 커밋 경계다.

## 0. 착수 전 남은 판정

✅ **닫힌 것** (2026-09-16 사용자)

| 무엇 | 결론 |
|---|---|
| 열린 PR 조회의 인가 | `translation:write`로 새로 만든다 · **diff Action이 함께 돌려준다** (design §7) |
| `1a`의 이전 값 | **base 트리를 읽는다** — 답할 질문이 "무엇을 보내는가"가 아니라 **"무엇을 덮는가"**다 |
| 캔버스에 없는 거부 여섯 | `unavailable`→`1i` · 나머지→`1h`. 가르는 기준은 "사람이 다시 해서 통하나" 하나다 |
| `1h`의 문구 | 하나의 틀이고 **제목·본문·바닥 버튼이 사유에서 온다** (design §2.2의 표) |
| `1g` × `updated` | `1e`의 무색 블록을 재사용한다 — `pr === "updated"`면 **항상** 선다 |
| 360 확인 Dialog | **안 만든다** |
| 목록 조회 실패 | **막는다**(`1k`) — 확인 못 하면 안 보낸다 |
| 실패의 전송 여부 안내 | 실행 전 명시적 거부만 미전송을 단정 · 실행 중 오류·응답 유실은 **전송 여부 미확인** (리뷰 1번) |
| `no-edits` 결과 | 도달 가능한 결과이며 `no-changes`와 함께 **`1f`로 표시** (리뷰 2번) |
| 미리보기 범위·값 표시 | **현재 디자인 SoT를 따른다** — 리뷰 3번 수정 제안은 반영하지 않는다 |
| 진행·결과 재열기 | `Publishing…`로 진행 모달 재열기 · 완료 뒤 별도 `View result` 유지 (리뷰 4번) |
| 모달 버튼·접근성 | 오른쪽 actions 슬롯 · 전이 포커스·닫기 복귀 · 갈래별 알림 경로 한 곳 (리뷰 6번) |
| 상태 계약 | 실행 결과 `PublishView` 8갈래와 모달 `PublishModalState`를 따로 정의 (리뷰 7번) |
| 재시도·미리보기 재열기 | **매번 새 조회 → 목록 확인 → 발송**. 이전 조회의 늦은 응답은 무시 (리뷰 8번) |
| 문서 사실·경로 오류 | 표면 통합 PR·`stale` 발생 경로·read Action 하나·실제 테스트 위치로 정정 (리뷰 9번) |

**리뷰 5번 보류**: 역할별 버튼 분기는 추가하지 않는다. 설정 버튼 제거와 공통 전달 안내는
제안 상태이므로 `spec.md` §8 말미의 보류 항목으로 남긴다.

🔲 **남은 것** — 추천이 있고, 반대가 없으면 그대로 간다

| 무엇 | 추천 | 어디 |
|---|---|---|
| `1c`의 진행 표현 | **시간 기반 · 무색 · `done` 낱말 없음** (스트리밍 안 넣는다) | design §4-2 |
| `1d`의 reviewer | **그린 자리를 지운다** — GitHub 왕복 하나 값이 안 된다 | design §4-4 |
| `1e`의 총 건수(`62`) | **수 없이 사실만** 말한다 — 지금 아무도 그 수를 세지 않는다 | design §4-4 |
| Home 상호 잠금 | `1a`를 열어 둔 사이에는 `[Sync]`를 **잠그지 않는다** | design §6 |
| 껍데기 위치 | `components/ui/modal.tsx`로 올린다 (`DIRECTORY.md` 갱신 동반) | design §5 |
| diff 상한 · 파일 그룹의 정본 | 미정 — 구현 중 실측으로 정한다 | design §4-1 |

🔲 **남아 있는 열린 결정** — `spec.md` §8에서 이번 리뷰로 닫힌 항목 외에는 결론을 내리지 않는다.
그중 2 · 3 · 5는 문구를 확정하는 태스크 19에서 답이 필요하다.

## 1. 계약 확장 (`/tdd` → `/implement`)

1. `PullOutcome`의 failed 변형에 `code?: SyncErrorCode` · `retryable?: boolean`.
   `delivery: "not-started" | "unknown"`도 필수로 싣는다. 실행 전 명시적 거부(게이트 포함)는
   `not-started`, 실행 중 실패와 클라이언트 Action reject는 `unknown`이다.
   `failureOutcome`(`lib/sync/run.ts:156`)이 `classifySyncError`의 결과를 **버리지 않고 싣는다**.
   거부 여섯에도 `retryable`을 부여한다(`unavailable`만 `true`).
   검증: `app/(edit)/__tests__/publish-failure.test.ts`가 코드·retryable을 단언 ·
   `app/api/__tests__/route-diagnostics.test.ts`의 `/api/pull` JSON 응답 단언 갱신
   (⚠️ `app/api/pull/route.ts:88`이 outcome을 **그대로 spread**한다).
   추가 검증: PR 작성 후 `saveLastPulledAt` 실패 · `SyncRun` 종료 기록 실패 · Action 응답 유실은
   `unknown`, 실행 전 `unavailable`은 `not-started`다. 리포 쓰기 성공 뒤 오류를 주입해 구별한다.
2. `planPublishView(outcome)` → `PublishView` **8갈래**(design §2). 게이트는 outcome에 이미
   있으므로 별도 인자로 받지 않는다. **`never` 검사를 유지한다.**
   `PublishModalState`는 `preview-loading` · `preview-ready` · `preview-error` · `running` ·
   `result`로 별도 정의한다. 열림 여부와 마지막 결과 보관은 §6의 호스트가 소유한다.
   검증: `message.test.ts`가 실행 결과 8갈래와 경고/전송 여부를 전수로 고정한다. 결과 판정과
   모달 렌더 각각의 exhaustive switch가 누락을 잡는다. 모달 DOM 테스트는 조회→확인→실행→결과
   및 닫기/재열기를 따로 검증한다. `1b`는 버튼 판정 테스트가 맡는다.

▸ `test(publish): separate outcome mapping from modal states` → `refactor(publish): name the branch, not the tone`

## 2. 순수 함수 (`/tdd`)

3. `parseGithubPrUrl(raw, { repoOwner, repoName })` — `checkOpenPullRequest` 안의 인라인 검증을
   **그대로** 옮겨 둘이 공유한다.
   검증: 기존 `app/(edit)/__tests__/onboarding.test.ts`의 `checkOpenPullRequest` URL 검증
   케이스를 순수 함수 테스트에도 고정한다.
4. `buildPublishDiff(cells, base)` — 셀 단위 · 키 병합 · 정렬 · 상한 초과 수. **I/O 0.**
   검증: 키 병합 정렬 · 상한 경계 · **프로토타입 키**(`__proto__` 로케일 코드·파일 경로 —
   조회는 `Object.hasOwn`, 대입은 `Object.create(null)`).
5. `summarizeWarnings(warnings)` — `${surface}: ${path}: ${message}`를 파일별로 묶는다.
   검증: 한 파일 여러 줄 · **개행을 든 파서 원문이 보존된다**(YAML 캐럿 다이어그램).
6. `planPublishButton({ count, paused, otherPending, publishPending })` → `{ mode, disabled, badge, hint }`.
   `mode`는 `preview` 또는 `progress`. 실행 중에는 클릭 가능한 `progress`가 우선한다.
   검증: `count === 0`에 배지 없음 · hint가 항상 있다(꺼진 버튼에 이유가 붙는다).
   추가 검증: `publishPending`이면 수가 0이어도 진행 모달 재열기가 가능하다.

▸ `test(publish): pin the diff assembly` → `feat(publish): assemble the publish preview`

## 3. read Action

7. `loadPublishPreview({ slug })` — `translation:write`로 인가, 인가가 돌려준 `projectId`로만 조회.
   `diff` + `openPr` + `truncated`를 **한 번에** 돌려준다. **쓰기 0.**
   검증: `entry-points.test.ts` 인가 단언 · 쓰기 호출 0 단언 · EDITOR 세션으로 `openPr`이 온다.
   미리보기의 수가 이후 실행의 스킵 여부를 보장하지 않는다(design §2.1 · 태스크 14).

▸ `feat(publish): read what would go out`

## 4. 껍데기 일반화

8. `components/onboarding/modal.tsx`의 `step`을 옵셔널로 내리고 바닥 왼쪽을 **슬롯**으로,
   닫기 `aria-label`·폭·높이를 프롭으로. **온보딩 호출부는 한 줄도 안 바뀐다.**
   오른쪽 actions 슬롯도 추가한다. 생략하면 기존 온보딩 버튼, 명시적 `null`이면 버튼 없음이며
   슬롯 호출부에는 `onNext`가 필요 없다. Publish 전이 키·열기/닫기 포커스 훅을 제공하되
   온보딩의 기존 `step` 기반 동작은 유지한다(design §5.1).
   검증: `components/__tests__/onboarding-modal.test.tsx`의 기존 동작 단언 유지 · 네 단계
   실측(`/design-sync`)에서 이탈 0. 추가 프롭 검사는 별도로 더한다.
   추가 검증: actions 생략/`null`/전달 세 경우 · 버튼 없는 갈래의 Next 0개 · `step` 없이도
   진행/결과 전이에 본문 포커스 · 일반 재렌더에는 포커스 이동 없음.
9. `components/ui/modal.tsx`로 옮기고 `docs/DIRECTORY.md`를 갱신한다.
   ⚠️ **`components/ui/dialog.tsx`는 건드리지 않는다** — 소비자 일곱이 함께 움직인다(DESIGN §6.2).
   검증: `pnpm typecheck` · `client-graph.test.ts` green.

▸ `refactor(ui): let the modal shell serve more than onboarding`

## 5. 모달 본문과 버튼 — 아트보드 `1a`~`1k`

10. `1a` — 파일 머리 + 셀 단위 diff 표(before→after, 바뀐 단어만). 표만 자체 스크롤
    (`bodyScroll="hidden"`). 열린 PR이 있으면 그 번호로 "덮어씁니다"를 말하고, 조회 전/실패면
    "미확인" 줄이 선다.
    검증: 키 병합 시 위 테두리 제거 · 국기 · 저자 · 상한 초과 문장 · `OpenImportPr` 삼상태.
    새 진입·미리보기 재열기마다 `preview-loading`으로 기존 목록을 비우고 새로 조회한다.
    조회 세대를 추적해 닫기·새 조회·호스트 변경/언마운트 이전 응답을 무시한다.
    추가 검증: 로딩 중 발송 컨트롤 0 · A→닫기→B 요청의 응답 역전에서 A의 성공/실패 무시 ·
    최신 `preview-ready` 확인에서만 발송 1회. 실행 중 닫기는 실행 결과를 버리지 않는다.
11. `1k` — 목록 조회 실패. **무색 블록 · `Try again` 하나 · 보내기 버튼 없음.**
    검증: `triggerPullAction`을 부를 컨트롤이 DOM에 0.
    `Try again`은 새 조회만 한다. 성공해도 확인 버튼을 누르기 전에는 발송 호출 0이다.
12. `1b` — 실행 중이 아니고 수가 0이면 꺼진 버튼 + hover. **새 미리보기를 열지 않는다.**
    배지만 사라지고 자리는 지킨다. 별도 `View result`의 노출은 미발송 수와 무관하다.
    검증: 클릭에 Action 호출 0 · `count === 0`에 배지 노드 0.
13. `1c` — 단계 셋, **무색 · `done` 낱말 없음**. 취소 없음, 닫기 있음.
    바깥 `[Publish]`는 `Publishing…` 상태로 클릭 가능하며 현재 진행 모달을 다시 연다.
    검증: `Cancel` 버튼 0 · 닫아도 실행이 계속된다 · 재열기/연타에도 Action 호출 1회 유지.
14. `1d`·`1e`·`1f`·`1g` — 성공·스킵 넷. `1g`는 `pr === "updated"`면 `1e`의 무색 블록을 함께 든다.
    검증: 상태 표의 해당 행마다 렌더 테스트 하나 · `1g` × `updated`의 블록 존재.
    `no-edits`와 `no-changes`는 모두 `1f`로 매핑한다. 두 소비자에서 미리보기 이후 다른 발송
    완료·쿨다운 경과를 재현하고, 확인 실행의 `no-edits` 결과가 refresh 후에도 남는지 검증한다.
15. `1h`·`1i` — 실패 둘. `Alert danger` **규격 그대로**(`border-destructive/40` · `bg-background` ·
    글자 전체 destructive · radius 8). `1h`는 **사유가 제목·본문·바닥 버튼을 든다**(design §2.2 표) ·
    재시도 버튼 없음 · `Reference`가 제목이 아니다 · **실행 전 거부 여섯에는 `Reference`와 "Logs에도 있다"가
    함께 빠진다.**
    검증: `lib/pull/__tests__/message.test.ts`에 코드별 화면 매핑 추가 · 거부 여섯의 제목이
    리포 문구가 아니다. `stale`는 합성 입력이며 현재 실행의 실도달로 세지 않는다.
    추가 검증: 두 소비자에서 `delivery: "unknown"`은 전송 여부 미확인 문구를 내고
    `Nothing was sent`를 내지 않는다. 응답 유실에는 Reference·Logs 기록 성공을 단정하지 않는다.
    `1i`의 `Try again`도 새 preview 조회부터 시작한다. 두 소비자의 지연 Promise 테스트에서
    재시도 클릭만으로 추가 발송 0, 최신 목록 확인 후 다음 발송 1회임을 고정한다.
16. `1j` — 게이트 둘, 폭 512. `too-soon`의 초가 **버튼 라벨**이고 서버 값 그대로.
    검증: 화면이 상수를 안 든다(문자열에 `30`이 없다).

▸ 갈래별로 쪼개지 않는다 — `feat(publish): answer every publish outcome in the modal` 하나.
  근거: 모달 전이와 실행 결과를 함께 연결해야 **부분 배송의 빈칸이 없다.**

## 6. 결과 소유 주체 이전

17. 번역 화면 — `PublishResult` 슬롯 제거, 모달을 `TranslationsHeader`가 든다.
    `if (next.status !== "failed") router.refresh()`를 **함께 옮긴다.**
    호스트가 실행·마지막 결과·모달 열림을 따로 든다. 완료 뒤 별도 `View result`를 표시하고,
    미리보기 열기·닫기는 마지막 결과를 지우지 않는다. 새 실행 결과가 도착하면 교체한다.
    검증: refresh 후에도 모달 본문이 남는다 · POSTMORTEM 2026-09-08의 grep 결과를 회고에 맞춘다
    (`grep -rn 'router.refresh()' app components lib | grep -v __tests__`).
    추가 검증: 닫힌 동안 완료되면 자동 재열기 없이 `View result` 표시 · 수가 0이어도 결과
    재열기 · PR/경고/실패 결과 보존 · 진행/결과 재열기에 추가 Action 호출 0.
18. Home — Provider가 계속 `pull`을 들고, 모달을 `HomeNotices`(무조건 렌더 자리)가 든다.
    상호 잠금: **`1a`를 열어 둔 사이에는 `[Sync]`를 잠그지 않는다**(그 순간 리포에 쓰는 것이 없다).
    ⚠️ `syncPending`과 `publishPending`을 하나의 `busy`로 접지 않는다.
    검증: `home-actions.test.tsx`에서 태스크 17과 같은 재열기 흐름 · 진행 모달을 닫아도 Sync
    잠금 유지 · 실행 완료 후 잠금 해제 · 결과 재열기는 Sync를 잠그지 않는다.

▸ `feat(publish): move the result into the modal at both call sites`

## 7. 문구

19. `spec.md` §6의 표대로 `messages/en.tsx`를 정리한다 — **같은 뜻의 두 문장을 남기지 않는다.**
    `viewLink`를 바꾸면 **번역 화면 머리의 "Last sent" 링크도 함께 움직인다**(`header.tsx`).
    ⚠️ `1c`의 단계 셋 문구는 진행 표현이 확정된 뒤에 넣는다.
    `Publishing…`·`View result`를 추가한다. 결과 모달 재열기 라벨을 PR 이동용 `viewLink`와
    공유하지 않는다.
    검증: 문구 스캐너 · `no-korean-ui` · `brand-spelling` · 대체된 키가 소스에 **안 남아 있다**.

▸ `feat(i18n): retire the publish alert vocabulary`

## 8. 실물 검증

20. `/design-sync publish-modal` — 캔버스 아트보드 열을 computed style + CDP 접근성 트리로 대조.
    ⚠️ **스크린샷으로 판정하지 않는다** · **danger는 기존 `role="alert"`, 나머지는 껍데기 polite
    live 한 곳**(리뷰 6번 · 같은 결과의 중복 알림 없음) ·
    **`1k`는 대조할 캔버스가 없다** — 그 사실을 리포트에 적는다.
    검증: 불일치 0까지 루프.
21. `/bugshot-qa` — 로컬에서 밟을 수 있는 갈래를 실제로 밟는다.
    두 소비자에서 키보드 열기·진행/결과 전이·닫기 복귀를 확인한다. 호출 버튼이 disabled이거나
    사라졌으면 제목으로 돌아가며, 닫힌 동안 완료돼도 포커스를 빼앗지 않는다.
    DOM 테스트로 live 알림 경로 한 곳을 고정하고, 실제 스크린리더 낭독은 수동 확인으로
    따로 기록한다. 스크린리더 검증을 수행하지 못하면 미검증으로 남긴다.
    ⚠️ **못 밟는 갈래는 "검증했다"고 적지 않는다** — `1h`의 셋과 `db-unavailable`은 실물 재현이
    어렵고 단위 테스트로만 선다.
    검증: 재현한 갈래·관측 결과·미검증 갈래와 이유를 리포트에서 구분한다.
22. `/l10n-roundtrip` — `1g`(버려진 값)와 `1e`(PR 갱신)를 **실제 리포로** 한 바퀴.
    대상은 폐기용만(`i18n-format-check` 또는 `i18n-order-check`).
    ⚠️ `pnpm test:projects:postgres`도 손으로 돈다(`lib/keys/**`를 건드렸으면).
    검증: 실제 경고 목록과 갱신된 PR의 결과가 모달에 보이며 왕복 결과를 기록한다.

## 9. 문서 — 문서별 별도 커밋

23. `docs/DESIGN.md` — 736 모달 · 두 형의 경계 규칙 · 포커스 착지 · `1k`의 무색 블록.
    검증: 구현의 치수·포커스·알림 규칙과 문서가 일치한다.
24. `docs/ARCHITECTURE.md` — `PullOutcome` 계약(`code`·`retryable`·`delivery`) · §2.1의 미리보기와 실행 사이 시간차 ·
    "`1a`의 before는 표시 전용이고 어떤 판정의 입력도 아니다"(불변식 2).
    검증: 실제 결과 타입과 오류 생산자·조회 경계를 문서에 대조한다.
25. `docs/PRODUCT.md` — §4.1 "Publish 경험"의 범위가 확정된 자리.
    검증: 필수 확인·진행/결과 재열기가 최종 동작과 일치한다.
26. `docs/DIRECTORY.md` — 껍데기 이동(태스크 9).
    검증: 기재한 경로가 존재하고 새 껍데기의 두 소비자가 정확하다.

▸ `docs(DESIGN): …` / `docs(ARCHITECTURE): …` / `docs(PRODUCT): …` / `docs(DIRECTORY): …`

## 10. 기능 종료

27. `docs/features/publish-modal/` 디렉터리를 **지운다.** 결론은 정본 넷으로 올라갔다 —
    근거 기록을 쌓아 두지 않는다(CLAUDE.md).
    검증: 미완료·미확정 항목이 없고 태스크 23~26의 반영을 확인한 뒤 디렉터리 제거를 확인한다.
