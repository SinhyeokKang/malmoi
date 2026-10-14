# Add and remove languages — 디자인 브리프

> 신규 UI의 첫 구현 동안만 시안이 기준이고, dev 반영 뒤에는 코드 + docs/DESIGN.md가 정본이다. 동작은 spec.md, 상태 전이는 design.md가 정한다. 이 문서는 그릴 화면을 정의한다.

작성: 2026-10-13 · 개정: 2026-10-14. 옛 추가 전용 시안을 대체한다. Codex는 사용자 제공 로컬 핸드오프를 사용한다.

## 화면의 목적

소스 상세 Languages 카드에서 언어를 추가·제거하고 잘못한 요청을 개별 취소한다. **파일 제거는 Publish 뒤 PR/MR 검토를 거친다. 번역은 보존된다.** “앱에서 요청함”, “PR/MR에 전달함”, “리포에 반영됨”을 같은 완료 상태로 그리지 않는다.

## 기존 자리와 프리미티브

- `components/sources/source-detail-modal.tsx`: LargeModal 안 Languages Card. 머리 action에 Add language.
- 기존 행의 깃발·코드·base 배지·진행률·상태·Open을 유지한다. 행 끝에 상태별 Remove language/Cancel addition/Cancel removal 동작을 넣는다. 좁은 폭에서 기존 버튼과 겹치지 않게 배치한다.
- orphan 행은 기존 흐린 표시·진행률을 유지하되 상태는 Inactive로 표시한다. 지원 포맷의 OWNER에게 Add language로 같은 코드를 재추가하는 복구 경로를 안내한다. 비지원 포맷은 리포 복구 후 Sync, EDITOR는 OWNER에게 재추가 요청을 안내한다. REMOVE는 orphan과 다른 상태로 남기고 Open은 읽기 전용 상세를 연다.
- 중첩 Dialog 선례는 `remove-source-dialog.tsx`. Button·Dialog·Input·Select·FormGroup·Facts/code-block·StatusBadge·Alert를 조립한다. 새 프리미티브나 raw 색을 추가하지 않는다. 다크는 기존 토큰으로 표현한다.

## 상태와 동작

| 언어 상태 | 표시 | OWNER 동작 | 번역 편집 |
|---|---|---|---|
| 일반 활성 | 기존 표시 | Remove language | 가능 |
| 기준 언어 | Base | 제거 비활성 + 이유 | 가능 |
| ADD 미전달 | Not in repository yet | Cancel addition | 가능 |
| ADD 전달됨 | Addition sent + PR/MR 링크 | Cancel addition | 가능 |
| REMOVE 미전달 | Removal pending | Cancel removal | 읽기 전용 |
| REMOVE 전달됨 | Removal sent + PR/MR 링크 | Cancel removal | 읽기 전용 |
| RESTORE 미전달 | Cancellation pending | Remove language | 가능 |
| orphan | Inactive | 지원 포맷은 Add language로 재추가 | 읽기 전용 |

RESTORE는 “편집 복구됨, 원격 삭제 취소는 Publish 필요”다. 삭제 취소를 눌렀다는 이유만으로 원격 취소 성공 토스트를 내지 않는다. 반복 요청은 서버 상태를 다시 받은 뒤 표시한다. EDITOR에는 변경 동작을 비활성화하고 이유를 제공한다.

## 추가 Dialog

- 제목 Add a language. json-catalog는 Language code Input, chrome-locales는 지원 목록 Select.
- 유효 입력에는 File to create와 서버 규칙으로 계산한 경로. orphan 코드면 복구할 번역 수 안내.
- 오류: invalid-code, exists, similar-exists, too-many-locales, invalid-path. 보관·진행 중 Publish·일반 실패는 Alert.
- 빈 제안 행에는 “Publishing creates the file once it has a translation.” 안내. 취소는 번역 0개에서도 가능.

## 제거·취소 확인 Dialog

제거 전에 서버 미리보기를 읽는다. 로딩 중에는 승인 불가, 실패하면 오류와 재시도, 지문이 낡았으면 갱신한 내용을 다시 확인한다.

| 항목 | 표시 내용 |
|---|---|
| 제목 | Remove language / Cancel language addition |
| 대상 | 언어 코드·소스 이름·정확한 파일 경로 |
| 영향 | 보존되는 번역 수, 미전달 편집 수, 열린 PR/MR 전달 여부 |
| 기존 언어 제거 설명 | “Publishing removes this language file from the repository. Saved translations are kept.” |
| 미전달 제안 취소 설명 | “This language will become inactive. Saved translations are kept.” + 해당 미전달 편집 폐기 안내 |
| 전달된 추가 취소 설명 | “Publish again to remove this addition from the open pull request.” (GitLab은 merge request 어휘) |
| 기준 언어 거부 | “Choose another base language before removing this one.” |
| 원격 상태 미확정 | 이전 Publish 결과 확인이 필요함. 제거/취소 버튼 비활성, 완료 문구 없음 |

Remove language와 Cancel을 사용하고 제거 승인 버튼은 기존 파괴 동작 스타일을 따른다. “영구 삭제”나 “번역 삭제”라고 쓰지 않는다. 일반 제거 취소는 데이터를 버리지 않으므로 별도 파괴 확인을 추가하지 않는다. 전달된 제거 취소 뒤에는 “Publish to update the pull request.” 안내를 남긴다.

## Publish와 Sync

- Publish 미리보기에서 파일을 Added/Updated/Deleted로 구분한다. **번역 변경 0건·삭제 파일 1개**도 Publish 가능해야 한다.
- 전달된 추가 취소는 base 기준 파일 diff 0개일 수 있다. 이 경우 “열린 PR/MR에서 추가를 취소”하는 작업을 보여주고 빈 화면/변경 없음으로 숨기지 않는다.
- 삭제 파일의 번역을 “N translations published”에 더하지 않는다. 결과는 파일 제거 전달과 실제 리포 반영을 구분한다.
- 제안 경로 충돌, 빈 제안, 원격 상태 불명은 각자 다른 안내를 쓴다.
- 수동 Sync 확인에는 폐기할 언어 추가/제거/취소 목록과 셀 편집을 구분해 표시한다. 리포 파일 상태로 돌아가는 영향과 열린 PR 관련 기존 안내를 유지한다.
- 카드 설명은 지원 포맷에서 “Add or remove languages here. Publish to update the repository.” 비지원 포맷에서는 리포에서 관리한다는 설명을 사용한다.
- 미해결 전달 상태는 PR/MR 확인 결과를 먼저 반영한다. 확인 중·실패 상태, 미머지 종료 후 활성 복구와 보존 편집의 미전달 표시를 그린다. 확인 실패를 완료로 표시하지 않고, 닫힌 요청을 새 PR/MR에 다시 보내는 안내를 하지 않는다.

## 검수 반영 시안 요청

**아래 상태를 실제 시안으로 작성하고 기존 프레임과 함께 핸드오프한다.** 설명 주석만 추가하지 않고 Sources·번역 상세·Publish에 사용자가 보는 상태와 동작을 그린다.

- **PR/MR 우선 확인:** 확인 중·실패/재시도·미머지 종료 후 활성 복구. 복구된 편집은 미전달로 표시하며, 다른 언어의 Publish가 종료된 제거 요청을 다시 포함한 것처럼 보이지 않게 한다.
- **다른 세션의 제거와 미저장 입력:** 두 언어를 편집 중 한 언어가 제거된 화면. 해당 입력은 읽기 전용으로 남고 선택·복사와 그 언어 입력만 폐기가 가능하다. 다른 활성 언어의 Save는 사용할 수 있으며, 저장 뒤에도 보존 입력과 미저장 안내가 남는다. 제거 취소 뒤 입력이 편집 가능해지는 화면과, 남은 입력을 둔 이동 확인도 그린다. 자동 저장·자동 폐기하지 않는다.
- **Inactive와 재추가:** 전달 전 ADD 취소와 리포 제거 확정 모두 같은 중립 상태를 사용한다. 지원 포맷 OWNER의 Add language 진입 → 같은 코드 선택 → 보존 번역 복구 안내를 연결한다. 비지원 포맷·EDITOR 안내도 함께 그린다. “리포에서 제거됨”을 공통 상태명으로 쓰지 않는다.
- 새 상태도 좁은 화면·라이트/다크·키보드 포커스와 스크린리더 안내를 포함한다. 서버 상태 갱신만으로 포커스나 입력을 잃지 않도록 한다.

## 그릴 프레임

| # | 프레임 |
|---|---|
| 1 | 기본 카드: 3언어·base 1, Add와 행별 Remove |
| 2 | 추가 Dialog 빈 상태(json Input) |
| 3 | 유효 입력·경로 미리보기·저장 중 |
| 4 | similar-exists 필드 오류 |
| 5 | Chrome Select 열림 |
| 6 | orphan 코드 재추가·보존 번역 복구 안내 |
| 7 | 빈 ADD 행·개별 취소 |
| 8 | 제거 확인: 파일 경로·번역 수·미전달 편집 수 |
| 9 | REMOVE 미전달: 읽기 전용·취소 |
| 10 | ADD/REMOVE 전달됨: PR/MR 링크·취소 동작 |
| 11 | RESTORE 미전달: 편집 복구·원격 취소 Publish 안내 |
| 12 | 전달된 추가 취소: PR/MR 갱신 설명 |
| 13 | Publish: 번역 0·파일 삭제만 있음 / 파일 diff 0·추가 취소 있음 |
| 14 | 기준 언어·EDITOR·보관·비지원·실행 중 비활성 이유 |
| 15 | 미리보기 로딩·실패·낡은 승인·원격 상태 미확정 |
| 16 | 좁은 폭의 카드·추가/제거 Dialog·긴 코드/경로 |
| 17 | 다크: 기본·추가·제거 확인·제거 예정·취소 전달 필요 |
| 18 | PR/MR 확인 중·실패/재시도·미머지 종료 후 활성 복구와 미전달 편집 |
| 19 | 두 언어 편집 중 외부 제거: 한 언어 입력 읽기 전용 보존·복사/폐기, 다른 언어 Save와 저장 후 상태 |
| 20 | 제거 취소 후 보존 입력 편집 복구·명시적 폐기·미저장 입력을 둔 이동 확인 |
| 21 | Inactive: 전달 전 취소/리포 제거 확정, 지원 포맷 Add language 복구, 비지원·EDITOR 안내 |

## 접근성·상호작용

- 추가 열기 → Input/Select 포커스, 제거 열기 → 제목/안내를 읽는 기존 Dialog 패턴. Enter는 IME 조합 중 제출하지 않는다.
- 저장 전 Esc·Cancel·바깥 클릭은 닫기. 저장 중 닫기·중복 제출 차단. 오류는 해당 필드 또는 Alert로 알린다.
- 추가 성공은 새 행 Open으로 포커스 이동. 제거 예정은 같은 행 Cancel removal로, 즉시 제안 취소로 행이 비활성화되면 카드의 Add 또는 인접 유효 동작으로 복귀한다.
- 제거 상태 변화를 현재 열린 번역 패널도 반영하되, 서버 갱신 자체를 이탈 확인으로 처리하지 않는다. 제거 언어의 미저장 입력은 읽기 전용으로 보존하고 다른 활성 언어만 저장한다. 해당 언어의 명시적 폐기는 다른 입력에 영향을 주지 않으며, 제거 취소 시 입력을 복구한다. 실제 이동 시에는 보존 입력까지 기존 이탈 확인에 포함한다.
- 바깥 모달의 미저장 기준 언어 초안이 있으면 기존 이탈 확인을 먼저 지난다.
- 키보드·스크린리더가 비활성 이유를 읽을 수 있게 aria-disabled와 설명을 연결한다. 색만으로 상태를 구분하지 않는다.

## 그리지 않는 것

키 추가·삭제, 영구 삭제, 일괄 언어 변경, 수술적 포맷의 언어 객체 제거, 이름·깃발 편집, 로케일 파일 외 앱 설정 편집.
