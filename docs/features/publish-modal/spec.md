# publish-modal — spec

**시안이 정본이다**: Claude Design `design_handoff_publish_modal`
(`README.md` · `Publish Modal.dc.html` · `publish-modal.prompt.md`, 2026-09-16 사본).
아래 문서는 그 핸드오프가 **코드에 무엇을 요구하는지**만 적는다 — 값은 추측하지 않고,
모르는 것은 "결정할 값"으로 남긴다.

## 1. 사용자

**번역 편집자(비개발자 동료)가 1차 사용자다.** 개발자(나)는 2차이고, 이 화면에서 그가 받는
것은 **전달받을 문자열**(PR 번호 · `Reference` 코드 · 버려진 파일 목록)뿐이다.

⚠️ **소비자가 둘이다** — 같은 `PublishButton`을 번역 화면 툴바와 Home 머리가 쓴다.
결과의 소유 주체가 이미 갈려 있다(번역 화면은 `components/translations/header.tsx`,
Home은 `components/home/actions.tsx`의 Provider). **범위는 두 자리 모두**다.

## 2. 문제 (관측된 사실)

1. **보내기 전에 아무것도 안 묻는다.** `[Send changes]`를 누르면 즉시 리포에 쓴다.
   `[Sync]`에는 확인 Dialog가 있는데(`components/home/sync-button.tsx` — "이 Dialog가 유일한
   방어선이다") Publish에는 없다. 그런데 Publish는 **열려 있는 PR을 `updateRefForce`로 덮는다**
   (`lib/pull/run.ts` — 브랜치가 히스토리가 아니라 스냅샷이다): Sync가 동료의 편집을 지우는 것과
   같은 축으로 Publish는 **남의 검토를 무른다.**
2. **결과가 한 줄 `Alert`에 접혀 있다.** `PublishResult`(`components/publish-button.tsx`)가 결과
   전부를 `Alert` 하나로 그리고, 버려진 값은 `<details>` 안이다. 그 안에 들어가지 않는 값이 셋이다 —
   **PR 번호 · 버려진 값 목록 · 브랜치가 바뀐 사실.** 셋 다 권한 없는 사람이 개발자에게
   **전달해야** 하는 값이라, 접히면 전달되지 않는다.
3. **게이트 거부 둘이 한 줄이다.** `already-running` · `too-soon`은 `SyncRun` 행조차 안 만들어
   (`lib/sync/run.ts` — "거부에는 행을 만들지 않는다") **Logs에도 없다.** 그 한 줄이 유일한 알림이다.
4. **실패에 오류 코드가 안 나온다.** `m.translations.publish.failed(reason)`가 문장만 내고,
   `SYNC_ERROR_CODES`의 안정적 코드(`base-unreadable` 등)는 화면에 닿지 않는다 — 개발자에게
   전달되는 것이 "안 된대요"뿐이다.

## 3. 완료 조건 (검증 가능)

⚠️ **`1a`는 우회 없는 필수 관문이다** (2026-09-16 사용자). `[Publish]`는 **언제나** 목록을 먼저
보이고, 그 화면의 버튼을 눌러야 리포에 쓴다 — 두 자리(번역 화면 · Home) 모두에서 같다.
**"바로 보내기" 경로를 만들지 않는다.**

⚠️ **360 확인 Dialog는 만들지 않는다** (같은 판정). 한때 선행 배송으로 떼어냈던 것인데,
`1a`가 같은 질문을 **더 잘** 묻는다(경고 한 줄이 아니라 목록까지 든다) — 둘을 연달아 세우면
되돌릴 수 없는 동작 앞에 물음이 둘이 되어 둘째를 안 읽게 된다. 배송은 하나다.

- **C1.** `countUnpublished > 0`에서 `[Publish]`가 **모달을 열고 나갈 것을 표로 보인다**(`1a`).
  행의 단위는 셀(`keyId` × `localeCode`)이고 같은 키는 칸이 병합된다. 표는 리포의 현재 값과
  보낼 값을 **나란히** 보이고 바뀐 단어만 칠한다.
  검증: 신규 diff Action의 단위 테스트(셀 단위 · 키 병합 정렬 · 상한) + 모달 렌더 테스트.
- **C2.** 클릭 한 번으로는 **리포에 아무것도 안 나간다.**
  검증: `publish-button.test.tsx` — 클릭 후 `triggerPullAction` 호출 0, `1a`의 버튼을 눌러야 1.
  두 자리 모두에서 같은 단언을 둔다.
- **C3.** 열린 PR이 있으면 `1a`가 **그 번호와 함께** "덮어쓴다"를 말한다. 조회 전/실패면
  "미확인" 줄이 그 자리에 선다(`OpenImportPr`의 삼상태가 `null`로 접히지 않는다).
  검증: 삼상태 3케이스 + **EDITOR 세션으로 번호가 온다**(§5).
- **C3a.** 목록을 못 읽으면 **보내기 버튼이 서지 않는다**(`1k`) — 확인 없이 나가는 경로가 0이다.
  검증: 조회를 실패시킨 렌더 테스트에서 `triggerPullAction`을 부를 컨트롤이 없다.
- **C4.** `countUnpublished === 0`에서는 **모달이 열리지 않는다**(`1b`) — 버튼이 꺼지고 배지가
  사라지며 hover가 이유를 말한다. 검증: 클릭에 `triggerPullAction` 호출 0.
- **C5.** 실행 결과 **일곱 갈래**(`1c`~`1i`)와 시작 거부 **둘**(`1j`)이 각자 자기 본문을 가지고
  **모달 안에** 선다. `PublishResult`의 `Alert`와 `<details>`는 사라진다.
  검증: `app/__tests__/screens.test.ts`의 소유 화면 목록 + 갈래별 렌더 테스트 열.
- **C6.** 서버 값 조합 → 갈래가 **1:1**이고 빈칸이 없다(`SKIPPED` + `warnings > 0` ·
  인가·준비 거부 여섯 포함). 검증: `lib/pull/__tests__/message.test.ts`가 그 표를 전수로 고정한다.
- **C7.** `router.refresh()`·`revalidatePath`가 **모달을 언마운트하지 않는다** — 두 자리 모두에서.
  검증: 렌더 테스트에서 refresh를 흉내내도 결과 본문이 남는다 (POSTMORTEM 2026-09-07 규칙).
- **C8.** 버려진 값이 **펼쳐진 목록**으로 선다(`1g`) — 접힌 `<details>`가 아니다.
  검증: `queryByRole("group")`(details)가 0 · 목록 항목이 `warnings.length`와 같다.
- **C9.** 실패 둘(`1h`·`1i`)이 **"사람이 다시 해서 통하나"**로 갈리고, `1h`에는 재시도 버튼이
  없다. 검증: `lib/pull/__tests__/error-codes.test.ts`가 코드 일곱 ↔ 화면 둘을 양방향으로 센다.

## 4. 비목표

- **병합·충돌 해소·부분 선택 금지.** `1a`가 목록을 **읽기 전용**으로 보인다 — 체크박스도, "이 키만
  보내기"도 없다. 그것을 넣는 순간 코어 원칙(병합 없음)이 깨진다.
- **승인 상태를 말하지 않는다.** branch protection의 `Dismiss stale approvals`를 읽지 않으므로
  force push가 승인을 떨어뜨렸는지 알 수 없다. `1e`는 **브랜치가 바뀌었다**까지만 말한다.
- **머지 여부를 말하지 않는다.** push 웹훅이 §4.3 ②로 닫혀 있어 관측 경로가 없다. `Open` 배지는
  **방금 만든 사실**이고 이후 상태가 아니다.
- **GitHub에 코멘트를 달지 않는다.** 이 앱이 리포에 쓰는 것은 브랜치와 PR뿐이다 — 리뷰어 알림을
  대신 보내지 않는다(`1e`는 "알리는 편이 좋다"까지).
- **진행률 바·토스트·사전 비활성 게이트 버튼 금지.** 핸드오프가 닫아 둔 결정이다.
- **별도의 360 확인 Dialog를 만들지 않는다** (§3) — `1a`가 그 자리다.
- **이번에 안 하는 것**: `1c`의 진행 이벤트 스트리밍(§design 4-2가 시간 기반으로 내린다) ·
  `1d`의 reviewer(추가 GitHub 호출) · `1j`의 카운트다운(열린 결정 3).

## 5. ⚠️ 열린 PR 조회의 인가가 코드와 어긋난다

`1a`가 "열려 있는 PR #128을 덮어씁니다"를 말하려면 그 번호를 읽어야 한다. 기존 경로인
`checkOpenPullRequest`(`app/(edit)/projects/actions.ts:1228`)는
`getProjectAccess(..., { permission: "project:settings" })`로 인가한다 — **OWNER 전용**이고,
`app/__tests__/entry-points.test.ts:727`이 그 사실을 고정한다. `SyncButton`도 `role !== "OWNER"`면
`null`을 반환하므로 지금까지 그 제약이 드러날 자리가 없었다.

Publish의 행위자는 **`translation:write`**(EDITOR 포함 — `components/home/actions.tsx`의 주석이
"[Publish]는 EDITOR도 누른다"고 적었다). 그대로 쓰면 **EDITOR에게는 언제나 "미확인" 줄만** 서고,
`1a`가 답해야 할 질문("내가 무엇을 덮는가")이 1차 사용자에게서 사라진다.

✅ **확정: `translation:write`로 인가하는 조회를 새로 만든다** (2026-09-16 사용자).
`lib/projects/open-pr.ts`의 `loadOpenPrUrl`과 URL 검증(순수 함수로 분리)을 그대로 재사용한다.
⚠️ **별도 Action으로 두지 않고 diff Action이 함께 돌려준다** — 모달을 열 때 이미 GitHub 왕복이
하나 있으므로(base 트리) 조회를 그 안에 합친다. 왕복이 둘이면 표와 PR 줄이 **따로 도착해** 같은
블록이 두 번 바뀐다.
`checkOpenPullRequest`의 권한을 낮추는 쪽은 Sync Dialog의 인가 표면을 함께 움직이고
`entry-points.test.ts`의 단언을 깨므로 선택하지 않는다.

## 6. 제거 명세 — `messages/en.tsx`의 `translations.publish.*`

| 항목 | 지금 | 판정 |
|---|---|---|
| `button(n)` | `Send changes` / `Send changes (n)` | **열린 결정 2** — 유지하거나 Home의 `Publish` + 배지로 통일. 어느 쪽이든 **한 벌만 남는다** |
| `nothing` | Alert `info` 한 줄 | **자리만 바뀐다** — `1b`의 꺼진 버튼 hover. 문장 교체 여부는 리뷰(시안은 `Everything you've edited is already sent.`) |
| `created` | `Sent for review. Your developers need to accept it…` | **대체** — `1d`가 제목 + 설명 + 권한 줄로 갈라 든다. ⚠️ 같은 뜻의 두 문장을 남기지 않는다 |
| `updated` | `Updated what you sent earlier with your latest changes.` | **대체** — 브랜치가 바뀐다는 사실을 말하지 않는다. `1e`가 대신한다 |
| `partial(count, sent)` | `n values couldn't be written` | **대체** — `warnings`는 값의 수가 아니라 **경고 줄의 수**다(`run.ts`가 파일 단위 문자열을 만든다). 건수는 제목에서 빠지고 목록 머리의 `{n} warnings`로 내려간다 |
| `dropped` | `<details>`의 `summary` | **삭제** — 목록이 펼쳐지므로 여는 라벨이 없어진다 |
| `failed(reason)` | `Couldn't send: {reason}` | **대체** — `1h`·`1i`가 제목 + Alert 본문 + `Reference`로 갈라 든다 |
| `viewLink` | `View what was sent` | **열린 결정 5** — 시안은 `View pull request`. 번역 화면 머리의 "Last sent" 링크도 **같은 키를 쓴다**(`header.tsx`) — 바꾸면 그 자리도 함께 움직인다 |
| `gate["already-running"]` | Alert `info` | **대체** — `1j` 왼쪽 |
| `gate["too-soon"](s)` | 초를 **문장 안**에 든다 | **대체** — `1j` 오른쪽, 초가 **버튼 라벨**로 옮긴다 |
| `announce.*` · `keys` · `lastSent` | — | **그대로** — 이 변경 밖이다 |

**재사용 (새로 만들지 않는다)**

- `m.adapterErrors` / `adapterErrorMessage` — `1g`의 이유 한 구. ⚠️ **지금 문장은 `<details>`용**이라
  한 줄 목록에 맞는 길이인지 확인한다(파서 원문이 여러 줄일 수 있어 `whitespace-pre-wrap`이 필요했다).
- `accessErrorMessage` · `onboardErrorMessage` — `1h`·`1i`가 삼키지 않는다(`unauthorized` ·
  `not-ready`가 그대로 온다).
- `m.repositorySync.prUnknown` 등 — `1a`의 "미확인" 줄이 Sync Dialog와 **같은 사실을 말한다**.
  남은 결정: 문구를 공유할지 별도 키로 둘지. ⚠️ **치수는 공유하지 않는다** — Sync의 amber 블록은
  360용 감축형(radius 10 · padding 12 · 글자 13)이고 이쪽은 736이다.

## 7. 신규 문구

핸드오프 §12의 목록을 그대로 받는다. `1a`·`1c`~`1j` 각 갈래의 제목 · 설명 · 바닥 보조문 ·
버튼 라벨이 신규이고, **`1c`의 단계 셋 문구는 §design 4-2가 확정되기 전에는 사전에 넣지 않는다.**

⚠️ **제품 이름은 `malmoi`다** — `1e`·`1f`·`1g`의 문장이 이름을 문장 중간에 든다.
`lib/i18n/__tests__/brand-spelling.test.ts`가 대문자 표기를 0으로 고정한다.

⚠️ **한글 UI 리터럴 금지** — `lib/i18n/__tests__/no-korean-ui.test.ts`가 `messages` 포함 전 범위를
훑는다. 이 문서의 한국어는 주석·문서이고 화면 문구는 전부 `messages/en.tsx`를 지난다.

## 8. 열린 결정 (결론을 내리지 않는다 — 무엇이 바뀌는지만)

1. **`1g`의 경고가 수십 줄일 때** — 목록이 PR 블록을 밀어낸다. 다섯까지 보이고 나머지를 Logs로
   넘기는 안이 후보. **`<details>`로 되돌리는 것은 아니다**(불변식 9).
2. **번역 화면 툴바의 라벨** — `Send changes (n)`을 Home의 `Publish` + 배지로 옮길지. 옮기면
   툴바 문구 규칙이 두 화면으로 넓어지고, 안 옮기면 같은 동작의 이름이 둘로 남는다.
3. **`too-soon`의 카운트다운** — 모달로 옮기면 기존 근거("헤더의 live region이 하나다")가 사라진다.
   살리면 18초를 쳐다보게 되고, 정적으로 두면 기다린 사실을 사람이 기억해야 한다.
4. **확인 창의 두 형 + 포커스 착지** — Archive·Sync는 360, Publish는 736이다. 경계 규칙("답만 받는
   확인은 360 · 읽어야 하는 목록이 있으면 736")을 문장으로 박을지, 736을 `Dialog`의 큰 변주로
   올릴지. ⚠️ **포커스 착지가 같은 근거에서 둘로 갈려 있다** — Sync Dialog는 [Cancel],
   시안은 모달 컨테이너(§8). 근거가 같은데(Enter 한 번으로 되돌릴 수 없는 동작이 실행되는 것을
   막는다) 답이 둘이면 키보드 사용자에게 두 창이 다르게 느껴진다.
   ⚠️ **`1a`가 확인 창이 되면서 이 결정의 무게가 커졌다** — 배송이 하나라 두 형이 연달아 서는
   갈래는 없어졌지만, **같은 성격의 창 둘이 같은 화면(Home)에 나란히 산다**는 사실은 그대로다.
5. **`View pull request` vs `View what was sent`** — 시안이 git 어휘를 썼고 `message.ts` 주석은
   그 자리를 편집자 어휘로 정해 뒀다. 둘 중 하나가 바뀐다. ⚠️ **번역 화면 머리의 링크가 같은 키를
   쓴다** — 바꾸면 모달 밖의 자리도 함께 움직인다.
6. ~~보내기 전에 "열린 PR을 덮어씁니다"를 말할지~~ → **닫혔다** — `1a`가 그것을 말한다(§3).
   한때 360 Dialog로 먼저 떼어내려 했으나 **폐기했다**: `1a`가 같은 질문을 더 잘 묻는다.
7. **번역 표면이 둘인 프로젝트** — 같은 브랜치를 서로 덮는다(`lib/pull/trigger.ts` 주석).
   그때 `1e`가 무엇을 말해야 하는지.
8. **`1b`의 꺼진 버튼이 열린 PR이 있을 때도 같은 모양인가** — "보낼 건 없지만 검토 대기 중인 PR이
   있다"는 다른 소식이고, 그때는 버튼 대신 **PR 링크**가 서는 편이 맞을 수 있다.
   ⚠️ `1a`의 PR 조회가 그 값을 이미 가져오므로 **재료는 생긴다** — 쓸지가 결정이다.
