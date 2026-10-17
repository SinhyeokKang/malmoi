# Add and remove languages — 시안 피드백 (1차)

대상: Claude Design `Locale Add Remove.dc.html` + `Locale Add Remove - T.dc.html`(2026-10-17). 기준: `design-brief.md`(2026-10-14 개정)·`spec.md`·`design.md`와 dev `ef3168fa`의 서버 계약.

프레임 번호는 시안의 것(L·A·D·P·T)이다. 여기 없는 프레임은 그대로 둔다.

## 1. 결정 (2026-10-17 사용자)

| # | 결정 | 시안에 미치는 영향 |
|---|---|---|
| 1 | 추가 Dialog의 경로·되살릴 번역 수는 **새 읽기 전용 서버 미리보기**가 준다(제출 전 add 판정과 같은 결과). | A1②·A3②·A4는 그대로 둔다. 대신 **미리보기 받는 중**(File to create 자리 골격, 확정 꺼짐)과 **미리보기 실패**(Alert + `Try again`) 상태를 A1에 더한다. 필드 오류(A2)는 이 미리보기가 입력 중에 돌려준다 — 제출을 눌러야 뜨는 오류가 아니다. |
| 2 | Sources 행의 PR 표시는 **링크만** 둔다. 링크는 마지막으로 저장된 PR 주소에서 만든다(화면 진입 때 조회하지 않음). | L2 ⑧ `Couldn't check for an open pull request` 행을 지운다. 조회 실패는 Home이 말한다. L2 ⑤⑥ 링크는 유지한다. |
| 3 | Logs의 `164 translations back`·`#126 closed without merging`은 유지한다 — 사건 payload에 필드를 더한다. | P3 그대로. GitLab판 번호 표기(`!126`)를 한 줄 더한다. |
| 4 | EDITOR·비지원 포맷은 **버튼을 숨기지 않고 비활성 + 이유**다(브리프·design.md 그대로). | L4를 다시 그린다 — 아래 §2.1. |
| 5 | 프리셋·Chrome 목록의 언어 이름은 **화면 언어로** 보인다(ko 화면이면 `독일어`). | A1의 이름을 화면 언어 기준으로 표기하고, ko 화면 예를 하나 더한다. A3 Chrome Select에도 같은 이름 보조 열을 붙인다. |
| 6 | 소스에 구분자 근거가 없으면(지역 있는 코드가 하나도 없음) 프리셋 구분자는 **하이픈**(`pt-BR`)이다. | A1 주석에 이 규칙을 적는다. |

## 2. 고칠 것

### 2.1 L4 — 비활성 + 이유로 다시 그리기 (결정 4)

- EDITOR: 카드 머리 `Add language`와 행 동작(`Remove language`·`Cancel removal`·Inactive 행 `Add language`)이 모두 서되 `aria-disabled`이고, 이유는 `Owners can add or remove languages.`를 각 컨트롤의 설명으로 잇는다. 보이는 사유 줄을 행마다 반복하지 않는다 — 카드 설명 한 번 + 컨트롤의 sr 설명.
- 비지원 포맷(OWNER): 같은 형, 이유는 기존 `Languages come from the repository. Add or remove the files there.`.
- 포맷이 비지원으로 바뀐 소스에 남은 Adding·Removing 행의 취소는 켜진 채로 둔다(design §1 Y3) — 그 행을 하나 그린다.

### 2.2 브리프 범위인데 프레임이 없음

1. **수동 Sync 확인** — 폐기할 언어 추가·제거 목록과 셀 편집을 구분해 보여준다(브리프 “Publish와 Sync”, spec 16). 기존 Sync Repository 시안의 확인 창에 언어 변경 구획을 더하는 형.
2. **Publish 미리보기의 빈 제안** — 값이 0개인 추가 제안은 파일을 내지 않는다. 미리보기가 그 이유를 말해야 한다(spec 4). 같은 P1 표에 `proposal-path-exists`(그 언어만 보류) 줄과 `locale-plan-refused`(결정적 거부 판)도 그린다 — 지금은 주석뿐이다.
3. **Cancel removal 뒤** — 성공 안내(`role="status"`), 실패 자리(`publish-unsettled` 경합·일반 실패), 포커스 이동. 추가 취소 성공 뒤(행이 Inactive로 끝에 가고 포커스가 카드의 `Add language`로 감)도 같다. 지금 결과 안내는 A5 추가 성공뿐이다.
4. **GitLab판** — L2 ⑤⑥ 링크(`View merge request !128`), L3, P1 ② `Taken back from !128`. 브리프 프레임 10·18이 두 판을 요구한다.

### 2.3 계약과 어긋남

- **P1 ①**: 라벨은 “번역 0”인데 `checkout.submit` 번역 변경 1건이 있다. 새 파일은 값이 있어야 생기므로 **삭제만 있는 Publish**(번역 0 · Removed 1)로 다시 그리고, 새 파일 + 번역 변경 예는 따로 둔다. 제목 규칙을 적는다: 번역 변경 0 · 파일 변경 ≥ 1이면 `Publish language changes`, 그 밖은 기존 `Publish {n} changes`.
- **L3 ⑤**: 확인이 무효화된 동안 서버가 막는 취소는 **그 행의 파일 효과가 이미 실렸을 수 있는 행**뿐이다(값 있는 Adding, Removing). 값 0개 Adding 행은 효과가 없어 `Remove language`가 켜져 있다 — 그 행을 하나 더한다.
- **D2 ②**(전달 후 추가 취소): 그 언어에 미전달 편집이 있으면 ①과 같은 neutral 줄(`N unsent edits stop being tracked…`)이 선다. 조건부 줄로 표기한다.
- **D4 ④** `publish-unsettled`: 다이얼로그 안에서 기다려도 풀리지 않는다(Publish를 다시 해야 한다). ①③과 같은 결정적 거부 형(설명·확정 걷음 · Alert 한 장 · `Close` primary)으로 바꾼다.

### 2.4 T1 — 번역 화면

- **분모가 맞지 않는다.** ①의 머리 `4 of 4 languages`는 제거 중인 de를 뺀 활성 수라는데, 패널에 보이는 칸은 en·ja·de 셋이다. 보이는 칸과 맞는 수로 고친다(예: 활성 en·ja → `2 of 2`, 그 아래 de는 Removing). ③ 제거 취소 뒤에는 de가 분모로 돌아온다(`3 of 3`).
- **② 저장 거부 뒤 얼림은 응답과 함께 온다.** 거부 응답을 받으면 화면이 서버 상태를 다시 읽어 de를 바로 얼린다 — 사용자가 Save를 한 번 더 눌러야 ①의 형이 되는 것이 아니다. ②의 다음 상태 = ①이고, 그때 푸터 거부 문장은 남는다(무엇이 저장되지 않았는지 사용자가 아직 확인하지 않았다).
- **`Discard edit` → `Discard change`.** 같은 동작의 기존 낱말(`Discard change`·`Discard changes`)을 쓴다.

## 2.5 2차 검토 (2026-10-17, 섹션 분리본 L·A·D·P·T)

1차 항목은 모두 반영됐다. 새로 고칠 것:

1. **P1 ③ `Held` 문장이 수동 Sync를 권한다.** 수동 Sync는 미전달 편집과 언어 변경을 전부 버린다(P4). 그런데 이 줄의 상황은 그것이 필요 없다 — 언어 추가만으로는 자동 적재를 보류하지 않으므로, 다음 리포 적재(CI push·야간)가 그 파일을 읽어 언어를 활성으로 만들고 추가 요청은 만료된다(design §1 ADD 만료 조건). 문장은 “다음 리포 적재가 이 파일을 가져온다”는 뜻으로 고치고 Sync를 권하지 않는다.
2. **언어 이름 생성 주석(A1·A3)을 기존 헬퍼로.** 새로 `Intl.DisplayNames`를 부르지 않고 `languageName(code, uiLocale)`(`lib/onboarding/language-name.ts`)을 쓴다. ⚠️ 그 헬퍼는 밑줄 코드(`en_AU`·`pt_BR`)에서 `RangeError`를 받아 **코드를 그대로** 돌려준다(실측) — Chrome 목록은 거의 다 밑줄이라 이름 열이 비게 된다. 표시용으로만 `_`→`-`로 바꿔 넘긴다고 주석에 적는다(값은 원래 코드).
3. **P1 ⑥ 예시와 버튼.** `fr`와 `fr_FR`는 `{locale}.json` 템플릿에서 같은 파일이 아니고, 철자 충돌은 추가 단계(A2 `locale-collision`)가 이미 막는다. 이 판은 그 뒤에 남는 안전망(템플릿·다른 소스 경로가 바뀐 경합)이므로 그런 예로 바꾼다. 버튼은 고칠 자리로 보낸다 — 원인이 언어 하나면 소스 상세(Languages 카드)다. `Open source settings`가 그 자리인지 확인한다.
4. **P3 만료 행의 주체가 `Nightly`뿐이다.** 만료 판정은 야간 외에도 Publish와 CI 적재에서 돈다. 주석에 “주체는 그 판정을 돌린 실행(Nightly · CI · Publish한 사람)”을 적고, 사람 주체 예를 한 줄 더한다.
5. **L7 실패 문장 주어를 맞춘다.** ② `Couldn't cancel removing de. …` ↔ ③ `We couldn't cancel removing de. …` — 같은 동작의 실패는 같은 머리(`We couldn't …`)로.
6. **결정 2 이후 남은 낡은 언급을 지운다.** 허브 소개의 전달 축에 `prCheckFailed`가 남아 있고, L5 주석이 “긴 배지(Couldn't check…)”를 근거로 든다.

## 2.6 3차 검토 (2026-10-17) — 2차 1번 정정

2차 1~6은 모두 반영됐다(허브의 `prCheckFailed` 언급도 지워졌다). 남은 것은 **2차 1번에서 이쪽이 준 근거가 틀린 것** 하나다.

- **P1 ③ `Held`가 풀리는 길은 “다음 리포 적재(CI push)”가 아니다.** 보류된 언어는 값이 있으므로 그 값이 미전달 편집이고, 미전달 편집이 있으면 CI·야간 적재는 통째로 보류된다(sync-edit-protection) — push가 그 파일을 가져오지 못한다. 실제로 푸는 것은 **base 관측으로 추가 요청을 만료시키는 판정**이고, 이 판정은 Publish(스냅샷 전, 미리보기 포함)와 야간 방문에서 **열린 pull request가 없을 때만** 돈다(`lib/pull/load.ts` `expireLocalesForPublish` · `lib/nightly/run.ts` `expireAtHead`).
- 그래서 **`Held`는 pull request가 열려 있는 동안에만 생긴다.** 열린 PR이 없으면 Publish가 먼저 만료시켜 zh-CN은 일반 활성 언어가 되고, 그 파일은 `Updated` 행으로 나간다.
- 고칠 것 둘:
  1. ③ 상단 배너 `No pull request is open…`을 열린 PR(#128)이 있는 형으로 바꾼다 — 지금 조합은 일어나지 않는다.
  2. 줄 문장을 이 뜻으로 고친다: “이 파일은 이미 main에 있다. 열린 pull request가 닫힌 뒤 다음 Publish나 야간 확인 때 zh-CN이 활성이 된다.” 수동 Sync를 권하지 않는 판단은 그대로 둔다. 주석의 “언어 추가만으로는 자동 적재가 보류되지 않으므로 다음 적재(CI push · 야간)가…” 문장도 위 근거로 바꾼다.

## 2.7 4차 검토 (2026-10-17)

2.6은 반영됐다(③ 배너 #128 · `Replace pull request #128` · 줄 문장 · 주석 근거). 남은 것은 문구 하나다.

- **P1 전 프레임의 PR 배너는 기존 문장을 쓴다.** 이 배너는 이번 기능의 새 UI가 아니라 기존 Publish 미리보기의 열린 PR 삼상태다. 그런데 캔버스는 다른 문장을 그렸다(`No pull request is open for … / Publishing opens one with these changes.` · `Pull request #128 is open for … / Publishing replaces it with these changes.`). 사전에 있는 `prNone`(`A new pull request opens on {repo}` + 본문) · `prOpen`(`#128 is open — this replaces what it holds` + 본문)으로 바꾼다. 캔버스가 dev 반영 전까지 정본이라, 그대로 두면 구현이 새 문장을 사전에 더하게 된다.

## 2.8 5차 (2026-10-17) — PR 배너 0건 갈래

2.7은 반영됐다(사전의 `prNone`·`prOpen`). 그 결과 번역 변경 0건 · 파일 변경만 있는 Publish(P1 ①)에서 사전 출력이 `these 0 changes go out on their own.`(prOpen은 `not just these 0`)이 된다. **0건 갈래를 “코드에 없음”으로 요청한다**(이쪽 추천) — 그 갈래는 언어 파일 변경 수로 센다(`this language change` / `these 2 language changes`), 번역 변경이 함께 있으면 지금 문장 그대로, GitLab판 같은 갈래. 근거: P1 ①의 제목(`Publish language changes`)·바닥 수(`0 changes · 1 file`)가 이미 파일 변경을 따로 센다.

## 3. 그대로 두는 것 (확인)

- 프리셋 + 자유 입력 한 칸(A1) — 사용자 요청 기능이다.
- 기준 언어 행의 Remove 꺼짐 + sr-only 사유(L1) — 2026-10-11 disabled-reasons-revert 형.
- 행마다 `Remove language` danger 트리거(L1), 추가 취소 neutral / 제거 warning 톤 분기(D1·D2), 낡은 승인 재확인(D3), Logs 동사(P3).
