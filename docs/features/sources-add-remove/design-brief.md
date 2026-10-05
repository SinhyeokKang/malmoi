# sources-add-remove — design brief (Claude Design 핸드오프용)

> ⚠️ **시안 수령 완료(2026-10-05)** — [Sources Add Remove.dc.html](https://claude.ai/design/p/b99d54cd-3034-44f1-8446-0a864da9d767?file=Sources+Add+Remove.dc.html). 이후 정본은 시안이다. 이 브리프와 시안이 다르면 시안이 이긴다. 이 파일은 요청 기록으로만 남는다.

> 이미 구현된 두 화면(Add sources 모달·소스 상세 모달)의 **변경**이다. 시안은 이 변경이 dev에 들어가기 전까지만 SoT이고, 들어간 뒤로는 코드 + DESIGN.md가 정본이다.
> 기능 정의는 `spec.md`, 데이터·판정은 `design.md`. 이 문서는 **그릴 것**만 든다.

## 1. 한 줄

Add sources 모달을 **① 소스 선택 → ② 소스별 기준 언어** 2단계로 나누고, 소스 상세 모달의 **바닥 왼쪽 안내 문구를 걷어 그 자리에 OWNER 전용 Remove source**와 확인 창을 둔다.

## 2. 놓이는 자리 — 기존 화면 실측

### Add sources 모달 (`components/sources/add-sources-modal.tsx`)
- `LargeModal`, 높이 `min(680px, 100svh - modal-gutter)`, `bodyScroll="hidden"`.
- 본문: `FilesStep` — 좌 후보 목록(체크박스 + 행 클릭 = 포커스), 우 미리보기 테이블(상단에 미리보기 언어 셀렉트).
- 본문 아래 줄 `flex shrink-0 items-center gap-3`: 수동 경로 [Check files] · **기준 언어 라벨 + `Select` 160** ← 셀렉트만 없앤다([Check files]는 남는다).
- 바닥: 왼쪽 notice(꺼진 사유 `text-xs muted`) · 오른쪽 [Cancel] [Add selected sources(primary)].

### 신규 프로젝트 ③ (`components/onboarding/steps/naming.tsx`) — ②가 재사용할 블록
- 소스마다 라벨 줄 `Base language` + 파일 아이콘(`FileJson2`/`FileCode2` 16) + `pathTemplate`(break-all), 아래 `BaseLocaleFields`(언어 ≤ 10이면 `SelectRow` 라디오 열, 넘으면 `Select`). 블록 사이 구분선 `bg-divider my-2 h-px`.
- ②는 이 블록을 **그대로** 쓴다. 소스가 1개여도 경로 줄이 있는 같은 형.

### 소스 상세 모달 (`components/sources/source-detail-modal.tsx`)
- `LargeModal`, 본문: 연결 사실 `dl`(경로·포맷·리포) → `Status` Card → `Base language` Card → `Languages` Card.
- 바닥(`justify-between`): 왼쪽 notice 문구(`readOnlyNote` "Name, path and file format are read from the repository." / Open 꺼짐 사유 / 진행 중 문장) · 오른쪽 [Close] [Open translations(primary)].
- **변경**: 왼쪽 문구를 전부 걷고 그 자리에 [Remove source]. Open translations의 꺼짐 사유는 화면에서 빠지고(스크린리더 전용), 같은 내용은 Status·Languages 카드가 이미 글자로 보인다.

## 3. 프리미티브 (새로 만들지 않는다)

| 쓰임 | 프리미티브 · 선례 |
|---|---|
| 2단계 | `LargeModal` + `transitionKey`, 단계 표시는 바닥 notice의 "Step n of 2" — 선례 `token-modal.tsx`. (`LargeModal step=`·`WizardFooter`는 쓰지 않는다 — "of 4" 고정, 진짜 disabled) |
| 단계 버튼 | 현행 모달 버튼 그대로: 진행 중 `busy`, 꺼짐 `aria-disabled` + 보이는 사유. 라벨만 단계별로 바뀐다 |
| ② 소스별 기준 언어 | 신규 프로젝트 ③의 소스 블록 |
| 제거 트리거 | `Button variant="danger"` — 상세 모달 바닥 **왼쪽**(notice 슬롯) |
| 확인 창 | `Dialog` + `DialogContent title/description/actions` — 상태 형은 `components/home/sync-button.tsx`(지문 대기 중 확정 `busy`, 발급 실패 → 재확인, 진행 중 닫기 막힘) |
| 경고 | `Alert warning` **하나**에 줄 묶음(Sync 확인 창 형) — 새 색 없음 |
| 꺼진 사유 | `aria-disabled` + 보이는 `text-xs muted`(DESIGN §6.65) |
| 결과 배너 | 목록 위 기존 추가 결과 배너 자리·형 |

라이트·다크 둘 다(토큰이 든다).

## 4. 상태·문구

### Add sources
| 단계 | 제목 | 설명 | 바닥 왼쪽 | 바닥 오른쪽 |
|---|---|---|---|---|
| ① | `Add sources`(기존) | 기존 설명 | `Step 1 of 2` / 꺼지면 기존 사유(`selectHelp`·`blocked.*`)가 대신 | [Cancel] [Next →] |
| ② | **새** `Choose base languages` | **새** `Pick the language each source is written in.` | `Step 2 of 2` / 진행 중 기존 `SlowNotice` | [Back] [Add selected sources](기존 키) |

- 블록마다 기존 hint(`m.newProject.baseLocale.hint`)가 붙으므로 설명은 짧게.
- ② 실패: 기존 Alert 자리·문구("Nothing was added. Your selection is still here." + 사유). 경로 충돌이면 **새** `Go back to change the selection.`

### Remove
| 상태 | 무엇 |
|---|---|
| 기본(OWNER) | 바닥 왼쪽 [Remove source] danger |
| 마지막 소스 | 버튼 `aria-disabled` + 옆 사유 **새** `A project needs at least one source.` |
| 모달 바쁨(첫 Sync·기준 언어 저장 중) | 버튼 `aria-disabled` + 사유(진행 중 문장 기존 재사용) |
| 불러오는 중·불러오기 실패 | 버튼 없음 |
| EDITOR | 버튼 없음(바닥 왼쪽 비어 있음) |
| 확인 창 제목 | **새** `Remove {slug} from this project?`(멤버 `Remove {who} from this project?`와 같은 골격) |
| 확인 창 본문(항상) | **새** `It stops syncing here. Files in the repository are not changed. Add it again anytime to bring its translations back.` |
| 확인 창 Alert warning(해당 줄만) | `{n} unsent edit(s) will be discarded.`(기존 `unsentCount` 복수형 규칙) · **새** `Its changes in the open pull request drop out at the next publish.` · **새** `Remove its step from your GitHub workflow — otherwise the next run fails and stops the sources after it.` |
| 확인 창 — 지문 받는 중 | Alert 자리 골격(높이 고정), 확정 버튼 `busy` |
| 확인 창 — 지문 발급 실패 | Alert danger(Sync 발급 실패 문장 형) + 재시도 |
| 확인 창 버튼 | [Cancel](기본 포커스) · [Remove source] danger |
| 진행 중 | 확정 `busy`, ×·Esc·배경 막힘 |
| stale | Alert danger **새** `Couldn't confirm that what you reviewed is still current — nothing was removed. Open Remove again to review.`(Sync stale 문장 골격) |
| 성공 | 상세 모달 닫힘 → 목록 위 결과 배너 **새** `Removed {slug}.` + 기존 `m.sources.workflow` 형의 워크플로 안내 + Settings 링크. 사람이 닫을 때까지 남는다 |

### Logs
- 소스 필터 항목에 제거된 소스가 `{slug} (removed)`로 남는다. 사건 행의 제거된 소스 이름은 링크 없음.

## 5. 그릴 프레임

| # | 프레임 |
|---|---|
| A1 | ① — 기존 소스 1(잠금) + 새 후보 2 체크, 하단 공통 셀렉트 **없음**, `Step 1 of 2`, [Next →] |
| A2 | ① — 새 체크 0, [Next] 꺼짐 + 사유 |
| A3 | ② — 소스 2개(라디오 하나 · 셀렉트 하나), 본문 스크롤 |
| A4 | ② — 소스 1개 |
| A5 | ② — 진행 중(`SlowNotice`) |
| A6 | ② — 추가 실패(경로 충돌) + Back 안내 |
| A7 | ① 재추가 — 제거했던 경로가 일반 후보(잠금 없음) |
| A8 | 다크 — A3 |
| R1 | 상세 모달 OWNER — 바닥 왼쪽 [Remove source], 오른쪽 [Close][Open translations] |
| R2 | 상세 모달 — 마지막 소스(꺼짐 + 사유) |
| R3 | 상세 모달 EDITOR — 바닥 왼쪽 비어 있음 |
| R4 | 확인 창 — 경고 없음 |
| R5 | 확인 창 — 미전달 12 + 열린 PR + 워크플로 줄 전부 |
| R6 | 확인 창 — 지문 받는 중 / 발급 실패 |
| R7 | 확인 창 — 진행 중 / stale |
| R8 | 성공 착지 — 목록 + 결과 배너, 포커스는 페이지 h1 |
| R9 | 다크 — R1·R5 |
| L1 | Logs 소스 필터 — `(removed)` 항목 |

## 6. 동작 주석

- ①→② [Next]는 즉시 전이. ②의 [Add selected sources]만 긴 대기.
- ② [Back] → ①의 체크·포커스·미리보기 언어·기준 언어 선택 유지.
- 추가 중 ×·Esc·배경·Back 모두 막힘.
- 기준 언어 미저장 변경이 있어도 [Remove source]는 **제거 확인 창 하나**만 연다(제거가 초안도 버린다).
- 확인 창 Esc = Cancel, 닫히면 포커스는 [Remove source]로. 성공하면 모달을 연 행이 사라지므로 포커스는 h1.

## 7. 그리지 않는 것

제거된 소스 목록·Restore, 목록 행의 인라인 Remove·⋯ 메뉴, 리포 파일 삭제 옵션, ②에서 이름·slug 편집, "기본 소스" 안내.
