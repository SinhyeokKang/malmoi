# Claude Design 프롬프트 — Sync repository 확인 Dialog · 결과 · 거부

**그대로 Claude Design에 붙여 넣는 프롬프트다.** 산출물(README + `.dc.html` 아트보드 + prompt 파일)이
서면 **그 시안이 시각 정본이 되고**, project-home 배선 뒤 통합 UI 검증에서 computed style + CDP
접근성 트리로 대조한다. Action·컴포넌트 준비만으로 UI 검증 완료를 선언하지 않는다.

⚠️ **이 파일 자체는 시안이 아니다.** 여기 적힌 값은 **기존 리포의 사실**이고, 시안이 정할 것은
따로 §3에 모았다.

---

## 붙여 넣을 프롬프트

> ### 맥락
>
> malmoi는 사내 로컬라이제이션 관리 도구(TMS)다. 개발자가 코드에 심은 소스 문자열을 DB로 올리고
> (CI가 민다), 비개발자 동료가 웹 UI에서 번역하고, 그 결과를 고정 브랜치의 pull request 하나로
> 되돌려보낸다.
>
> **지금 만드는 것은 그 반대 방향의 수동 버튼 하나와, 그것을 누르기 전에 서는 확인 화면이다.**
> 프로젝트 Home 머리의 `[Sync]`를 누르면 malmoi가 GitHub 리포의 로케일 파일을 다시 읽어 **앱 안의
> 번역을 그 값으로 덮는다.**
>
> ⚠️ **이 동작은 되돌릴 수 없고, 사람의 편집을 지운다.** 되돌리기를 만들지 않는 것이 제품의 구조적
> 결정이다(병합 로직을 만들지 않는다). **그래서 확인 화면이 유일한 방어선이고, 이 작업의 중심이다.**
>
> ### 누가 보나
>
> **프로젝트 OWNER만** 이 버튼을 본다. 번역 편집자(EDITOR)에게는 **버튼이 아예 없다** — 손실되는
> 편집의 당사자가 그 창을 스스로 여는 경로를 만들지 않기로 했다.
>
> 즉 이 화면을 읽는 사람은 **개발자**다. 다만 그 사람이 지우는 것은 **동료의 작업**이다.
>
> ### 무엇이 덮이나 — ⚠️ 이 부분이 문구 설계의 전부다
>
> 앱 안의 번역 중 **리포의 base 브랜치에 아직 반영되지 않은 것**이 전부 덮인다. 그것은 두 갈래다:
>
> 1. **아직 안 보낸 편집** — 번역자가 저장만 하고 [Send changes]를 안 누른 것. **수를 셀 수 있다.**
> 2. **보냈지만 아직 머지 안 된 편집** — pull request는 열려 있는데 개발자가 머지를 안 한 것.
>    ⚠️ **1번의 수에는 안 잡힌다.** 앱은 "보냈다"까지만 알고 "머지됐다"는 저장하지 않는다.
>
> **그래서 수 하나로 말하면 거짓이 된다.** 미발송이 0이어도 열린 PR이 있으면 지울 것이 있다.
> **두 사실을 각각 말해야 한다.**
>
> 세 번째 갈래도 있다: **열린 PR이 있는지 확인하지 못했을 때**(GitHub 조회 실패). 그것을 "없음"으로
> 접으면 안 된다 — 모른다는 사실이 화면에 있어야 한다.
>
> ### 정해진 것 (바꾸지 말 것)
>
> - **확인 Dialog가 있다.** 클릭 하나로 실행되지 않는다.
> - **미발송이 있으면 `Send changes`를 먼저 하라고 권한다. 다만 막지는 않는다.** OWNER가 위험을
>   알고 실행한다. 발송만으로 안전해지는 것은 아니며 편집이 base에 반영되려면 PR 머지가 필요하다.
> - **되돌리기·"내 편집만 지키기" 옵션을 그리지 않는다.** 그것이 곧 병합 로직이고 제품 원칙 위반이다.
> - **실행 확인 버튼은 danger tone**이다.
> - 이 앱은 **라이트 테마 단일**이다. 다크 모드 시안을 만들지 않는다.
>
> ### 쓸 수 있는 프리미티브 (이미 있다 — 새로 만들지 말 것)
>
> `Dialog`(제목·설명·본문·바닥 `justify-end`) · `Button`(variant `primary`/`default`/`danger`/`ghost`,
> size `sm`/`md`/`lg`) · `Alert`(variant `info`/`success`/`warning`/`danger` — `rounded-lg border p-4`,
> 좌측 아이콘 16, 제목 `text-sm font-medium`, 본문 `text-sm` **2문장 이하** + 다음 행동, 액션 최대 2) ·
> `Badge` · `EmptyState` · `Skeleton`.
>
> **색 체계는 하나다**: amber = 경고(`border-amber-200 bg-amber-50 text-amber-900` + `TriangleAlert`),
> destructive = **글자색 전용** 오류, 성공은 **초록을 안 쓴다**(조용하다 — `border-border bg-background`
> + `CircleCheck`). **새 raw 색을 늘리지 않는다.**
>
> 아이콘은 `lucide-react`다. 글꼴은 Pretendard Variable.
>
> ### 참고할 선례 — 같은 형의 확인 Dialog가 이미 있다
>
> **프로젝트 보관(Archive) 확인 Dialog**가 가장 가깝다:
> - 제목 `Archive {name}?`
> - 설명 `Everyone stops editing, the nightly send stops, and pushes from your repository are refused.`
> - 본문에 **열린 PR 줄**이 조건부로 선다 — `What you already sent stays open for your developers:`
>   + `See what's open` 외부 링크(파랑 + `ExternalLink` 12)
> - 조회 실패면 대신 `We couldn't check what's still open for your developers.` (muted, `text-xs`)
> - 바닥 `[Cancel]`(default) · `[Archive project]`(danger)
>
> **Sync Dialog는 이것의 확장이다** — 줄이 하나 더 필요하고(미발송 수), 권유 링크가 하나 더 붙는다.
> ⚠️ **같은 형을 유지할지, 아니면 이 Dialog는 정보가 많아 다른 형이 필요한지가 이 작업의 판정이다.**
>
> ### 만들어 줄 아트보드 여섯
>
> **`4a` 확인 Dialog — 조용한 경우**
> 미발송 0, 열린 PR 없음. 지울 것이 없는데도 Dialog가 선다(되돌릴 수 없다는 사실은 수와 무관하다).
> danger 확인 버튼은 유지한다. 시안은 본문과 경고의 시각적 위계를 정한다.
> 미발송 0·PR 없음은 조회 시점의 신호이지 이후 저장된 편집까지 없다는 보장은 아니다.
>
> **`4b` 확인 Dialog — 미발송 N**
> `12 edits that haven't been sent yet will be replaced.` + `Send changes first` 권유 링크.
> 답할 질문: **수와 권유가 어떤 위계인가?** 권유가 링크인가 버튼인가 — ⚠️ 그것을 누르면 다른 화면
> (번역 화면)으로 떠나므로, Dialog 안의 두 번째 버튼처럼 보이면 안 된다.
>
> **`4c` 확인 Dialog — 열린 PR까지**
> 미발송 N **그리고** `Edits in pull request #{n} are not in {branch} yet — they will be replaced too.`
> 답할 질문: **두 사실이 둘 다 서면 화면이 어떻게 되나?** 목록인가 문단인가. ⚠️ **미발송이 0이고
> PR만 있는 갈래도 이 아트보드에 함께 그려 달라** — 그 조합이 이 기능의 함정이다.
>
> **`4d` 확인 Dialog — PR 조회 중 또는 실패**
> `We haven't confirmed whether anything is still waiting in a pull request.`
> 조회 시작부터 경고를 표시한다. 성공한 조회가 PR 없음일 때만 없앤다. 조회 실패도 실행은 막지 않는다.
> 답할 질문: **"모른다"가 "없다"와 시각적으로 구별되나?** muted 한 줄로 충분한가, 아니면 경고인가.
>
> **`4e` 결과 — 완료·부분 실패·미적용**
> Home 머리 아래 고정 자리에 서는 결과 Alert.
> - 전부 성공: `Synced 903 keys from main.`
> - 변경이 없어도 같은 완료 문구. 정상 빈 카탈로그는 `Synced 0 keys from main.`
> - 부분 실패: `Synced 640 keys, but 1 surface could not be read.` + 실패 표면 이름·원인 문장
> - CI 우선 미적용도 해당 표면 이름과 재시도 안내를 표시한다. 포맷 누락도 조용히 제외하지 않는다.
> - 파일 일부 실패와 표면 전체 실패는 구분한다. 성공한 키 수만으로 실패를 숨기지 않는다.
> - 사용처는 보존하며 다음 CI가 갱신한다. 새로 수집한 정보라고 표현하지 않는다.
> 답할 질문: **부분 실패가 성공으로 읽히지 않으려면 무엇이 필요한가?** (제품 불변식: 버린 값을
> 성공으로 숨기지 않는다.)
>
> **`4f` 거부·진행 상태**
> 한 아트보드에 모아서: 진행 중 버튼(`Syncing…`) · `A sync is already running.` ·
> `This project hasn't finished its first import yet.` · `malmoi is not connected to this repository.`
> 답할 질문: **거부가 Alert인가 Dialog 안인가?** 버튼을 누른 직후 Dialog가 열리기도 전에 거부되는
> 갈래가 있는가.
>
> ### 근거를 함께 적어 달라
>
> 아트보드마다 **근거 열**을 둬서 "왜 이 값인가"를 적어 달라. 값만 있는 시안은 구현이 따라가다
> 어긋나도 아무도 모른다. 특히:
> - 미발송 수와 PR 경고의 **위계를 왜 그렇게 정했나**
> - 권유 링크가 확인 버튼과 **얼마나 멀어야 하나**
> - danger 버튼을 유지하면서 조용한 갈래(`4a`)의 본문 위계를 정한 근거
> - 비동기 경고·결과를 스크린리더에 알리는 방식과 Dialog 종료 후 트리거 포커스 복귀
>
> ### 안 만들어도 되는 것
>
> Home 화면 전체(다른 핸드오프가 있다) · 표면 선택 UI · 진행률 바 · 토스트(이 앱은 인라인 Alert를
> 쓴다) · 다크 모드 · 모바일 전용 레이아웃(단 400px에서 깨지지 않아야 한다).

---

## 2. 프롬프트에 안 넣은 사실 — 시안이 몰라도 되는 것

- Action 이름·게이트 순서·트랜잭션 경계 (`design.md` §3.3·§5)
- 표면마다 별도 트랜잭션이라는 구현 상세. 화면은 실패한 표면의 이름과 사유를 표시한다
- `IMPORT_STALE_AFTER_SECONDS`·`maxDuration` 같은 서버 상수

## 3. 시안이 서면 확정되는 것

| 무엇 | 지금 |
|---|---|
| Dialog 폭·본문 줄 간격·권유 링크의 자리 | 미정 |
| `4a`(조용한 갈래)의 본문 위계 | 미정 — 확인 버튼은 danger 고정 |
| 두 경고 줄의 위계(목록 vs 문단) | 미정 |
| 결과 Alert의 variant 매핑 | `summarizeImport`의 tone 셋(`success`/`warning`/`danger`)을 그대로 쓴다는 것만 정해졌다 |
| 거부가 Alert인지 Dialog 안인지 | 미정 |

## 4. ⚠️ 시안이 **정하면 안 되는 것**

- **되돌리기·부분 선택·"내 편집 지키기"** — 제품 원칙 위반이다(`spec.md` §6.1). 시안에 나오면
  결함으로 잡고 되돌린다.
- **EDITOR에게 비활성 버튼을 보이는 것** — 부재가 결정이다(`spec.md` §7 결정 1).
- **Dialog를 건너뛰는 갈래** — `atRisk: false`여도 Dialog는 선다(`design.md` §4.2).
- **수 하나로 위험을 요약하는 것** — 부분집합이라 거짓이 된다(`spec.md` §6.2).
