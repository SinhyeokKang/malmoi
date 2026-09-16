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

🔲 **남은 것** — 추천이 있고, 반대가 없으면 그대로 간다

| 무엇 | 추천 | 어디 |
|---|---|---|
| `1c`의 진행 표현 | **시간 기반 · 무색 · `done` 낱말 없음** (스트리밍 안 넣는다) | design §4-2 |
| `1d`의 reviewer | **그린 자리를 지운다** — GitHub 왕복 하나 값이 안 된다 | design §4-4 |
| `1e`의 총 건수(`62`) | **수 없이 사실만** 말한다 — 지금 아무도 그 수를 세지 않는다 | design §4-4 |
| Home 상호 잠금 | `1a`를 열어 둔 사이에는 `[Sync]`를 **잠그지 않는다** | design §6 |
| 껍데기 위치 | `components/ui/modal.tsx`로 올린다 (`DIRECTORY.md` 갱신 동반) | design §5 |
| diff 상한 · 파일 그룹의 정본 | 미정 — 구현 중 실측으로 정한다 | design §4-1 |

🔲 **열지 않는 것** — `spec.md` §8의 여덟 항목은 **결론을 내리지 않는다**(핸드오프의 요구다).
다만 2 · 3 · 5는 문구를 확정하는 단계(B6)에서 답이 필요하다.

## 1. 계약 확장 (`/tdd` → `/implement`)

1. `PullOutcome`의 failed 변형에 `code?: SyncErrorCode` · `retryable?: boolean`.
   `failureOutcome`(`lib/sync/run.ts:156`)이 `classifySyncError`의 결과를 **버리지 않고 싣는다**.
   거부 여섯에도 `retryable`을 부여한다(`unavailable`만 `true`).
   검증: `publish-failure.test.ts`가 코드·retryable을 단언 · `/api/pull` 응답 스냅샷 갱신
   (⚠️ `app/api/pull/route.ts:88`이 outcome을 **그대로 spread**한다).
2. `planPublishView(outcome)` → 갈래 discriminant 열하나(`1a`~`1k`). **`never` 검사를 유지한다.**
   검증: `message.test.ts`가 design §2 상태 표를 **전수로** 고정 · 상태를 하나 지우면 컴파일 에러.

▸ `test(publish): pin the eleven publish branches` → `refactor(publish): name the branch, not the tone`

## 2. 순수 함수 (`/tdd`)

3. `parseGithubPrUrl(raw, { repoOwner, repoName })` — `checkOpenPullRequest` 안의 인라인 검증을
   **그대로** 옮겨 둘이 공유한다.
   검증: 기존 `onboarding.test.ts:1632`의 케이스가 이 함수로도 통과.
4. `buildPublishDiff(cells, base)` — 셀 단위 · 키 병합 · 정렬 · 상한 초과 수. **I/O 0.**
   검증: 키 병합 정렬 · 상한 경계 · **프로토타입 키**(`__proto__` 로케일 코드·파일 경로 —
   조회는 `Object.hasOwn`, 대입은 `Object.create(null)`).
5. `summarizeWarnings(warnings)` — `${surface}: ${path}: ${message}`를 파일별로 묶는다.
   검증: 한 파일 여러 줄 · **개행을 든 파서 원문이 보존된다**(YAML 캐럿 다이어그램).
6. `planPublishButton({ count, paused, otherPending })` → `{ disabled, badge, hint }` (`1b`).
   검증: `count === 0`에 배지 없음 · hint가 항상 있다(꺼진 버튼에 이유가 붙는다).

▸ `test(publish): pin the diff assembly` → `feat(publish): assemble the publish preview`

## 3. read Action

7. `loadPublishPreview({ slug })` — `translation:write`로 인가, 인가가 돌려준 `projectId`로만 조회.
   `diff` + `openPr` + `truncated`를 **한 번에** 돌려준다. **쓰기 0.**
   검증: `entry-points.test.ts` 인가 단언 · 쓰기 호출 0 단언 · EDITOR 세션으로 `openPr`이 온다 ·
   **design §2.1의 술어 포함 관계**(`countUnpublished > 0` ⇒ 1층이 스킵하지 않는다).

▸ `feat(publish): read what would go out`

## 4. 껍데기 일반화

8. `components/onboarding/modal.tsx`의 `step`을 옵셔널로 내리고 바닥 왼쪽을 **슬롯**으로,
   닫기 `aria-label`·폭·높이를 프롭으로. **온보딩 호출부는 한 줄도 안 바뀐다.**
   검증: `components/onboarding/__tests__` green(변경 0) · 네 단계 실측(`/design-sync`)에서 이탈 0.
9. `components/ui/modal.tsx`로 옮기고 `docs/DIRECTORY.md`를 갱신한다.
   ⚠️ **`components/ui/dialog.tsx`는 건드리지 않는다** — 소비자 일곱이 함께 움직인다(DESIGN §6.2).
   검증: `pnpm typecheck` · `client-graph.test.ts` green.

▸ `refactor(ui): let the modal shell serve more than onboarding`

## 5. 모달 본문 열한 갈래

10. `1a` — 파일 머리 + 셀 단위 diff 표(before→after, 바뀐 단어만). 표만 자체 스크롤
    (`bodyScroll="hidden"`). 열린 PR이 있으면 그 번호로 "덮어씁니다"를 말하고, 조회 전/실패면
    "미확인" 줄이 선다.
    검증: 키 병합 시 위 테두리 제거 · 국기 · 저자 · 상한 초과 문장 · `OpenImportPr` 삼상태.
11. `1k` — 목록 조회 실패. **무색 블록 · `Try again` 하나 · 보내기 버튼 없음.**
    검증: `triggerPullAction`을 부를 컨트롤이 DOM에 0.
12. `1b` — 꺼진 버튼 + hover. **모달을 열지 않는다.** 배지만 사라지고 자리는 지킨다.
    검증: 클릭에 Action 호출 0 · `count === 0`에 배지 노드 0.
13. `1c` — 단계 셋, **무색 · `done` 낱말 없음**. 취소 없음, 닫기 있음.
    검증: `Cancel` 버튼 0 · 닫아도 실행이 계속된다.
14. `1d`·`1e`·`1f`·`1g` — 성공·스킵 넷. `1g`는 `pr === "updated"`면 `1e`의 무색 블록을 함께 든다.
    검증: 상태 표의 해당 행마다 렌더 테스트 하나 · `1g` × `updated`의 블록 존재.
15. `1h`·`1i` — 실패 둘. `Alert danger` **규격 그대로**(`border-destructive/40` · `bg-background` ·
    글자 전체 destructive · radius 8). `1h`는 **사유가 제목·본문·바닥 버튼을 든다**(design §2.2 표) ·
    재시도 버튼 없음 · `Reference`가 제목이 아니다 · **거부 여섯에는 `Reference`와 "Logs에도 있다"가
    함께 빠진다.**
    검증: `error-codes.test.ts`가 코드 일곱 ↔ 화면 둘을 양방향 · 거부 여섯의 제목이 리포 문구가 아니다.
16. `1j` — 게이트 둘, 폭 512. `too-soon`의 초가 **버튼 라벨**이고 서버 값 그대로.
    검증: 화면이 상수를 안 든다(문자열에 `30`이 없다).

▸ 갈래별로 쪼개지 않는다 — `feat(publish): answer every publish outcome in the modal` 하나.
  근거: 상태 표가 1:1이라 **부분 배송이 빈칸을 만든다.**

## 6. 결과 소유 주체 이전

17. 번역 화면 — `PublishResult` 슬롯 제거, 모달을 `TranslationsHeader`가 든다.
    `if (next.status !== "failed") router.refresh()`를 **함께 옮긴다.**
    검증: refresh 후에도 모달 본문이 남는다 · POSTMORTEM 2026-09-08의 grep 결과를 회고에 맞춘다
    (`grep -rn 'router.refresh()' app components lib | grep -v __tests__`).
18. Home — Provider가 계속 `pull`을 들고, 모달을 `HomeNotices`(무조건 렌더 자리)가 든다.
    상호 잠금: **`1a`를 열어 둔 사이에는 `[Sync]`를 잠그지 않는다**(그 순간 리포에 쓰는 것이 없다).
    ⚠️ `syncPending`과 `publishPending`을 하나의 `busy`로 접지 않는다.
    검증: `home-actions.test.tsx`.

▸ `feat(publish): move the result into the modal at both call sites`

## 7. 문구

19. `spec.md` §6의 표대로 `messages/en.tsx`를 정리한다 — **같은 뜻의 두 문장을 남기지 않는다.**
    `viewLink`를 바꾸면 **번역 화면 머리의 "Last sent" 링크도 함께 움직인다**(`header.tsx`).
    ⚠️ `1c`의 단계 셋 문구는 진행 표현이 확정된 뒤에 넣는다.
    검증: 문구 스캐너 · `no-korean-ui` · `brand-spelling` · 대체된 키가 소스에 **안 남아 있다**.

▸ `feat(i18n): retire the publish alert vocabulary`

## 8. 실물 검증

20. `/design-sync publish-modal` — 캔버스 아트보드 열을 computed style + CDP 접근성 트리로 대조.
    ⚠️ **스크린샷으로 판정하지 않는다** · **`role="status"`가 danger 갈래에도 선다** ·
    **`1k`는 대조할 캔버스가 없다** — 그 사실을 리포트에 적는다.
    검증: 불일치 0까지 루프.
21. `/bugshot-qa` — 로컬에서 밟을 수 있는 갈래를 실제로 밟는다.
    ⚠️ **못 밟는 갈래는 "검증했다"고 적지 않는다** — `1h`의 셋과 `db-unavailable`은 실물 재현이
    어렵고 단위 테스트로만 선다.
22. `/l10n-roundtrip` — `1g`(버려진 값)와 `1e`(PR 갱신)를 **실제 리포로** 한 바퀴.
    대상은 폐기용만(`i18n-format-check` 또는 `i18n-order-check`).
    ⚠️ `pnpm test:projects:postgres`도 손으로 돈다(`lib/keys/**`를 건드렸으면).

## 9. 문서 — 문서별 별도 커밋

23. `docs/DESIGN.md` — 736 모달 · 두 형의 경계 규칙 · 포커스 착지 · `1k`의 무색 블록.
24. `docs/ARCHITECTURE.md` — `PullOutcome` 계약(`code`·`retryable`) · §2.1의 술어 포함 관계 ·
    "`1a`의 before는 표시 전용이고 어떤 판정의 입력도 아니다"(불변식 2).
25. `docs/PRODUCT.md` — §4.1 "Publish 경험"의 범위가 확정된 자리.
26. `docs/DIRECTORY.md` — 껍데기 이동(태스크 9).

▸ `docs(DESIGN): …` / `docs(ARCHITECTURE): …` / `docs(PRODUCT): …` / `docs(DIRECTORY): …`

## 10. 기능 종료

27. `docs/features/publish-modal/` 디렉터리를 **지운다.** 결론은 정본 넷으로 올라갔다 —
    근거 기록을 쌓아 두지 않는다(CLAUDE.md).
