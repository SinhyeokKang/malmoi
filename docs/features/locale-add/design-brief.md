# Add and remove languages — 디자인 브리프

> 신규 UI의 첫 구현 동안만 시안이 기준이고, dev 반영 뒤에는 코드 + docs/DESIGN.md가 정본이다. 동작은 spec.md, 상태 전이는 design.md가 정한다. 이 문서는 그릴 화면을 정의한다.

작성: 2026-10-13 · 개정: 2026-10-14(2차 검수 반영) · 2026-10-14(백엔드 구현 반영 — 서버가 돌려주는 상태·거부 코드·문구 자리를 실제 계약에 맞췄다) · 2026-10-17(시안 확보 · 검토 결정 반영). 옛 추가 전용 시안과 1차 개정의 상태별 라벨 8종을 대체한다. Codex는 사용자 제공 로컬 핸드오프를 사용한다.

## 시안 (2026-10-17 확보)

- **Claude Design 프로젝트** `b99d54cd-3034-44f1-8446-0a864da9d767` — 허브 `Locale Add Remove.dc.html` + 섹션 다섯 `Locale Add Remove - {L,A,D,P,T}.dc.html`(L1–L7 · A1–A5 · D1–D5 · P1–P4 · T1). 이 브리프의 프레임 1~25를 모두 덮고 L7(취소 결과)·P4(수동 Sync 확인)를 더했다. 첫 구현이 dev에 들어갈 때까지 **이 캔버스가 정본**이고, 이 브리프와 갈리면 캔버스를 따른다.
- 로컬 사본: 메인 체크아웃 `.scratch/orch-locale-add/design/`(gitignore). 검토 경위와 결정은 [design-feedback.md](design-feedback.md)(1~4차).
- 검토에서 브리프를 바꾼 결정(2026-10-17 사용자): ① 추가 Dialog의 경로·되살릴 수는 **새 읽기 전용 서버 미리보기**가 준다 ② Sources 행의 PR 표시는 **저장된 PR 주소의 링크만** — 조회 실패(`prCheckFailed`)는 Sources에 그리지 않는다 ③ Logs의 되살린 수·닫힌 PR 번호는 **사건 payload에 필드를 더해** 쓴다 ④ EDITOR·비지원 포맷은 **비활성 + 이유**(숨기지 않음) ⑤ 추가 입력은 **프리셋 목록 + 자유 입력 한 칸**이고 언어 이름은 화면 언어로 ⑥ 구분자 근거가 없는 소스의 프리셋은 하이픈.

## 화면의 목적

소스 상세 Languages 카드에서 언어를 추가·제거하고 잘못한 요청을 개별 취소한다. **파일 제거는 Publish 뒤 PR/MR 검토를 거친다. 번역은 보존된다.** “앱에서 요청함”, “PR/MR에 전달함”, “리포에 반영됨”을 같은 완료 상태로 그리지 않는다.

## 기존 자리와 프리미티브

- `components/sources/source-detail-modal.tsx`: LargeModal 안 Languages Card. 머리 action에 Add language.
- 기존 행의 깃발·코드·base 배지·진행률·상태·Open을 유지한다. 행 끝에 상태별 동작을 하나 넣는다. 좁은 폭에서 기존 버튼과 겹치지 않게 배치한다.
- 정렬: base → 활성(ADD·REMOVE 포함, 코드순) → Inactive(맨 끝). 현행 순서 규칙(DESIGN Sources)을 유지한다.
- 중첩 Dialog 선례는 `remove-source-dialog.tsx`(미리보기 로딩 Skeleton·실패 후 재시도·낡은 지문 거부·응답 유실 처리). Button·Dialog·Input·Select·FormGroup·Facts/code-block·StatusBadge·Alert를 조립한다. 새 프리미티브나 raw 색을 추가하지 않는다. 다크는 기존 토큰으로 표현한다.

## 문구 규칙

- 화면 문구는 호스트 하나의 어휘만 쓴다. 기존 `onGitLab` 분기(pull request / merge request, `#N` / `!N`)를 따르고, 새 문구는 en·ko·es × GitHub·GitLab 쌍으로 쓴다. “PR/MR” 표기를 화면에 쓰지 않는다.
- “영구 삭제”·“번역 삭제”라고 쓰지 않는다. 파일 쪽은 Remove 계열 낱말(DESIGN §10.1)을 쓴다.
- 재시도 버튼은 `Try again`.

## 상태와 동작 — 두 축

상태는 **동작 배지**와 **기존 전달 축**의 조합이다. 새 배지는 셋뿐이다.

| 동작 배지 | 뜻 | 톤 |
|---|---|---|
| (없음) | 일반 활성 | — |
| `Adding` | 추가 제안, base에 파일 미확인 | muted |
| `Removing` | 제거 요청, 편집 잠금 | warning |
| `Inactive` | orphan(원인 단정 없음) | danger — 기존 orphan canon 유지 |

| 전달 축 | 표시 |
|---|---|
| 그 언어의 변경이 아직 PR에 없음 | 기존 `Unsent` 배지 |
| 전달됨, PR 열림 | 기존 `View pull request` 링크(GitLab판 어휘) — 마지막으로 저장된 PR 주소에서 만든다 |
| PR 조회 실패 | Sources에는 그리지 않는다(2026-10-17 결정 ② — Sources는 진입 때 조회하지 않는다. Home이 말한다) |
| 전달 확인 안 됨(직전 Publish 결과 미확정·실패로 확인이 무효화됨, `localeDelivery: "unconfirmed"`) | 전달 여부를 단정하지 않는 muted 한 줄. 이 상태에선 취소 두 종류가 거부된다(아래) |

| 행 상태 | OWNER 동작 | 번역 편집 | Open |
|---|---|---|---|
| 일반 활성 | Remove language | 가능 | 가능 |
| 기준 언어(Base) | Remove 비활성 + 이유 | 가능 | 가능 |
| Adding (+Unsent/링크) | Remove language — Dialog가 “추가 취소”로 설명 | 가능 | 가능 |
| Removing (+Unsent/링크) | Cancel removal | 읽기 전용 | 읽기 전용 상세 |
| 전달된 제거를 취소함 | Remove language | 가능 | 가능 — 행에 `Unsent`(PR 갱신 필요) |
| Inactive | 지원 포맷은 Add language로 재추가 | — | 비활성(현행) |
| 전달된 추가를 취소함 | Inactive + `Unsent` | — | 비활성 |

- 취소를 눌렀다는 이유만으로 원격 취소 성공 토스트를 내지 않는다. 전달된 의도의 취소 뒤에는 “Publish to update the pull request.”를 남긴다.
- EDITOR에는 변경 동작을 비활성화하고 이유를 제공한다.
- **전달 확인 안 됨** 상태의 추가 취소·제거 취소는 서버가 거부한다(`publish-unsettled`). 행 동작은 비활성 + “Publish again first. The last publish didn't finish, so Malmoi can't tell what the pull request contains.” 계열 이유. 새 추가·제거 요청은 막지 않는다.
- 저장소 Sync가 도는 동안(`sync-running`) 제거·추가 취소는 거부된다 — 일시적 거부라 Alert + `Try again`.
- Inactive 하단 띠(`orphanStrip`)는 danger 톤을 유지하되 “was removed from the repository”를 원인 중립 문구로 바꾼다.

## 카드 설명

`languagesHelp`를 세 갈래로 나눈다: OWNER·지원 포맷(“Add or remove languages here. Publish to update the repository.”), EDITOR(“Owners can add or remove languages.” 계열), 비지원 포맷(리포에서 관리한다는 기존 설명).

## 추가 Dialog

- 제목 `Add a language to {source}`. json-catalog는 **프리셋 목록 + 자유 입력 한 칸**(Popover + Command — 이 소스의 Inactive 코드 그룹, 자주 쓰는 언어 그룹, 목록 밖 코드는 `Use this code`), chrome-locales는 지원 목록 Select(54개 — Chrome 문서 목록에서 `es_419` 제외). 언어 이름은 화면 언어로 `languageName`(`lib/onboarding/language-name.ts`)이 만들고, 밑줄 코드는 표시용으로만 `_`→`-`로 넘긴다(그대로 넘기면 `RangeError`로 코드가 나온다). 프리셋 구분자는 소스의 지역 있는 기존 코드를 따르고, 근거가 없으면 하이픈이다.
- 경로·필드 판정·되살릴 번역 수는 입력 중 **읽기 전용 서버 미리보기**가 준다(제출 때 add 판정과 같은 결과). 미리보기 받는 중·실패 상태를 둔다(시안 A1 ②③).
- **받는 코드는 Malmoi가 리포에서 다시 읽을 수 있는 모양뿐이다**: 소문자 언어 2~3자 + 선택 지역 2~4자(`fr`, `pt-BR`, `zh_TW`). `es-419`·`zh-Hant-TW`·대문자 언어(`KO`)는 거부한다. 이유 안내: “Malmoi can't read this code back from the repository. Add the file in the repository instead.” 계열.
- 유효 입력에는 File to create와 서버 규칙으로 계산한 경로. orphan 코드면 복구할 번역 수 안내.
- 오류(서버 코드 → 표시 자리): `invalid-code`·`unsupported-locale`(필드), `already-active`(필드 — 이미 있음), `locale-collision`(필드 — `pt-BR`/`pt_br`처럼 같은 파일을 가리키는 철자), `unsafe-path`·`path-conflict`(필드 — 계산된 경로가 안전하지 않거나 다른 소스 경로와 겹침). `archived`·`publish-unsettled`·일반 실패는 Alert.
- 재추가(`action: "revive"`)는 보존된 값을 되살리고 값 있는 칸을 다시 Unsent로 만든다(`reissued` 수). 성공 안내에 그 수를 쓴다.
- 빈 제안 행에는 “Publishing creates the file once it has a translation.” 안내.

## 제거 확인 Dialog (제거·추가 취소 공용)

트리거는 행의 `Remove language` 하나이고, Dialog가 상태별 효과를 설명한다. 열 때 서버 미리보기를 읽는다. 로딩 중에는 승인 불가, 실패하면 오류와 `Try again`, 지문이 낡았으면 갱신한 내용을 다시 확인한다.

| 항목 | 표시 내용 |
|---|---|
| 제목 | `Remove {code} from {source}?` |
| 대상 | 언어 코드·소스 이름·정확한 파일 경로 |
| 영향 | 보존되는 번역 수, 그 언어의 미전달 편집 수, PR 전달 여부(`delivered: true/false/null` — null이면 단정하지 않음) |
| 미전달 편집 — 기존 언어 제거 | “These unsent edits will be discarded. Each one goes back to the value last sent to the repository.” — 폐기는 Revert와 같은 의미다(값이 마지막 전달 값으로 돌아간다) |
| 미전달 편집 — 추가 취소 | 값은 남고 Unsent 표시만 사라진다. 다시 추가하면 값과 Unsent가 돌아온다 — “Unsent edits stop being tracked. Add the language again to bring them back.” 계열 |
| 전달 기록 없는 미전달 편집(`baseline-unknown`·`baseline-stale`) | 제거 거부. “Publish first — some unsent edits in {code} were never sent, so there's no value to go back to.” 계열. Revert를 안내하지 않는다(같은 이유로 막힌다) |
| 기존 언어 제거 설명 | “Publishing removes this language file from the repository. Saved translations are kept.” |
| 앱 코드 경고(기존 언어 제거) | “Update any code that loads this language (imports, supported language lists) in the same pull request.” |
| 전달 전 추가 취소 설명 | “This language will become inactive. Saved translations are kept.” |
| 전달된 추가 취소 설명 | “Publish again to remove this file from the open pull request.”(GitLab판) |
| 기준 언어 거부 | “Choose another base language before removing this one.” |
| 결과 미확정 Publish | warning + 확인 방법(DESIGN §2.4 결과 미확인 형), 승인 버튼 비활성, 완료 문구 없음 |
| 낡은 승인(`stale-approval`) | 미리보기를 다시 읽어 바뀐 수·경로를 보여 주고 다시 확인받는다 |

승인 버튼은 트리거와 같은 파괴 스타일(DESIGN 짝 규칙)이다. 제거 취소는 데이터를 버리지 않으므로 별도 확인 Dialog가 없다.

## 번역 화면 — 외부 제거와 미저장 입력

- 다른 세션의 제거가 도착하면 그 언어의 dirty 셀은 값을 유지한 채 읽기 전용으로 얼고, 셀 옆에 되돌리기(기존 셀 reset) 버튼이 보인다. 선택·복사는 된다.
- 다른 활성 언어의 Save는 그대로 쓸 수 있고, 얼린 셀은 저장되지 않은 채 남는다.
- 제거가 취소되면 얼린 셀이 그대로 편집 가능해진다. 자동 저장·자동 폐기하지 않는다.
- Revert(`Revert to last sent`)도 제거 중 언어 칸에는 거부된다(`locale-removal-pending`) — 얼린 칸의 버리기는 셀 reset이다.
- 진행률·결측 수는 제거 중 언어를 빼고 센다(서버 목록과 같은 분모).
- 렌더와 저장 사이에 제거가 도착해 서버가 키 저장을 거부하면, 입력을 유지하고 footer에 “{code} is being removed. Nothing in this key was saved — save again.” 계열 문구를 띄운다.
- 서버 갱신 자체를 이탈 확인으로 처리하지 않는다. 실제 이동 시 기존 이탈 확인이 얼린 입력도 센다.

## Publish와 Sync

- Publish 미리보기는 파일 행 오른쪽 muted 텍스트 자리에 `New file` / `Updated` / `Removed`를 둔다. 새 배지는 만들지 않는다. Removed 행에는 “Translations stay in Malmoi.” 한 줄.
- **번역 변경 0건·삭제 파일 1개**도 Publish 가능해야 한다.
- 전달된 추가·제거의 취소는 base 기준 파일 diff 0개일 수 있다. 이 경우 “열린 pull request에서 이전 변경을 거둔다”는 작업을 보여주고 빈 화면/변경 없음으로 숨기지 않는다.
- 삭제 파일의 번역을 “N translations published”에 더하지 않는다.
- 제안 경로 충돌, 빈 제안, PR 조회 실패는 각자 다른 안내를 쓴다. 경로 계획 거부(`locale-plan-refused` — 계산된 경로 충돌·중복·안전하지 않음)는 결정적 거부라 `Try again`을 두지 않고 원인을 고치라고 안내한다.
- pull request 본문에는 삭제 파일이 있을 때 앱 코드 정리 안내가 붙고, 열린 pull request의 삭제 목록이 바뀌면 본문이 다시 쓰인다(화면 표시 대상 아님 — 미리보기 Removed 행의 안내와 같은 말을 쓴다).
- 수동 Sync 확인에는 폐기할 언어 추가/제거 목록과 셀 편집을 구분해 표시한다. Sync 뒤 이미 pull request에 실린 변경이 있으면 그 행은 `Unsent`(PR 갱신 필요)로 남고, 다음 Publish가 pull request를 정리한다.
- 언어 변경이 남아 있는 동안 막히는 기존 동작이 둘 있다: 그 언어를 기준 언어로 선언(소스 상세 base 선택), 리포 기준 브랜치 변경(설정). 둘 다 `locale-change-pending` — 기존 Alert 자리에 “Finish or cancel the language change first.” 계열.
- 자동 적재(CI·야간)가 전달 전 제거 요청 때문에 보류되면 Logs에 `locale-change-pending` 사유 문장이 남는다(초안 문구는 사전에 있다 — ko·es는 `/translate` 검수 대기).
- PR 상태는 서버가 마지막으로 관측한 결과만 그린다. “확인 중” 상태는 없다. 미머지 종료 뒤 제거가 풀려 활성으로 돌아온 행은 일반 활성으로 그리고, 닫힌 요청을 새 pull request에 다시 보낸다는 안내를 하지 않는다.

## 그릴 프레임

| # | 프레임 |
|---|---|
| 1 | 기본 카드: 3언어·base 1, Add와 행별 Remove |
| 2 | 추가 Dialog 빈 상태(json Input) |
| 3 | 유효 입력·경로 미리보기·저장 중 |
| 4 | similar-exists 필드 오류 |
| 5 | Chrome Select 열림 |
| 6 | orphan 코드 재추가·보존 번역 복구 안내 |
| 7 | Adding 행(빈 제안 안내 + Unsent) |
| 8 | 제거 확인 Dialog: 파일 경로·번역 수·미전달 편집 폐기·앱 코드 경고 |
| 9 | Removing 행: 읽기 전용·Cancel removal, Unsent 있음/없음 |
| 10 | 전달됨: View pull request 링크 — GitHub판·GitLab판 |
| 11 | 추가 취소 Dialog: 전달 전(폐기 안내) / 전달 후(pull request 갱신 설명) — GitHub판·GitLab판 |
| 12 | 전달된 의도 취소 뒤 행: Inactive + Unsent / 활성 + Unsent |
| 13 | Publish: 번역 0·`Removed` 1 / 파일 diff 0·이전 변경 거두기 |
| 14 | 기준 언어·EDITOR·보관·비지원·결과 미확정 비활성 이유 |
| 15 | 미리보기 로딩·실패·낡은 승인 |
| 16 | 좁은 폭의 카드·추가/제거 Dialog·긴 코드/경로 |
| 17 | 다크 대표 2장: 기본 카드(Adding·Removing·Inactive 포함) / 제거 확인 Dialog |
| 18 | PR 조회 실패 배지, 미머지 종료 후 활성 복귀 행 — GitHub판·GitLab판 |
| 19 | 번역 화면 외부 제거: 얼린 셀·reset·다른 언어 Save·저장 경합 footer·제거 취소 뒤 편집 가능 |
| 20 | Inactive: 지원 포맷 OWNER Add language 복구, 비지원·EDITOR 안내 |
| 21 | 전달 확인 안 됨 행: muted 안내 + 취소 동작 비활성 이유 |
| 22 | 제거 확인 Dialog 거부 변형: `baseline-unknown`(먼저 Publish) / `sync-running`(Try again) |
| 23 | 추가 Dialog 관측 불가 코드(`es-419`) 거부 · 재추가 성공(되살린 값 수) |
| 24 | 기준 언어 선언·기준 브랜치 변경이 언어 변경 때문에 막힌 Alert |
| 25 | Logs: 언어 사건 행(추가·되살림·제거 요청·취소·만료) + `locale-change-pending` 보류 행 — 지금은 종류 폴백 문장(“changed Sources & languages”)이라 전용 문장을 정한다 |

## 접근성·상호작용

- 추가 열기 → Input/Select 포커스, 제거 열기 → 제목/안내를 읽는 기존 Dialog 패턴. Enter는 IME 조합 중 제출하지 않는다.
- 저장 전 Esc·Cancel·바깥 클릭은 닫기. 저장 중 닫기·중복 제출 차단. 오류는 해당 필드 또는 Alert로 알린다.
- 상태 전환은 `role="status"` 한 줄로 알린다(예: “fr is now inactive”).
- 포커스 규칙 하나: 행이 같은 자리에 남으면 그 행의 다음 유효 동작, 정렬로 이동하면(Inactive로 끝에 감) 카드의 Add language. 추가 성공은 새 행 Open.
- 바깥 모달의 미저장 기준 언어 초안이 있으면 기존 이탈 확인을 먼저 지난다.
- 키보드·스크린리더가 비활성 이유를 읽을 수 있게 aria-disabled와 설명을 연결한다. 색만으로 상태를 구분하지 않는다(배지 낱말이 든다).

## 그리지 않는 것

키 추가·삭제, 영구 삭제, 일괄 언어 변경, 수술적 포맷의 언어 객체 제거, 이름·깃발 편집, 로케일 파일 외 앱 설정 편집, Sources 진입 시 PR 상태 확인 중 표시, 앱에서 PR 닫기.
