# 앱 반응형 시안 피드백 — 1차

대상: Claude Design `App Responsive.dc.html` (2026-10-11 수령). 기준: [design-brief.md](design-brief.md) · [design.md](design.md) · `dev` `8ab620ad`.
검토 방법: 원문(마크업·노트·스크립트) 대조 + 헤드리스 렌더 실측. 국기 아이콘이 빈 원으로 보인 것은 로컬 렌더에 에셋을 싣지 않은 탓이고 시안 결함이 아니다.

**결론**: 브리프의 대표 프레임 AT1~AT10은 빠짐없이 있다. 아래 🔴 넷을 고친 2차 시안을 구현 정본으로 받는다.

## 🔴 고쳐야 할 것

### F1. 375 패널 헤더·저장 줄이 넘친다 (AT10b · AT6 · AT8a · AT3 · AT1a)

- AT10b(es)에서 헤더의 `Publish 24`와 저장 줄의 `Guardar`가 패널 오른쪽 끝에서 잘린다. 노트 "288 < 323이라 한 줄"과 렌더가 반대다.
- 시안의 es 프레임은 버튼을 영어(`Sync` · `Publish` · `Unsent`)로 두었다. 실제 es 사전은 `Sincronizar`(`messages/es.tsx:40`) · `Publicar`(`:1340`) · `Sin enviar`(`:1214`)라 더 길다. **es 프레임은 실제 사전 문구로 다시 그린다.**
- en에서도 375 헤더(제목 + Sync + Publish)가 꽉 차 AT3·AT1a의 프로젝트 이름이 `Store…`로 다섯 글자까지 잘린다.
- **요청**: 375 패널 헤더의 감김 규칙 하나 — 제목 줄 위, 버튼 줄 아래(오른쪽 정렬) 형을 권장한다. 버튼을 아이콘으로 줄이거나 숨기지 않는다(브리프 "폭으로 기능을 덜지 않는다"). 이 규칙으로 AT6a·AT6c·AT8a·AT3a·AT10b를 다시 그린다. 저장 줄도 넘치면 감기는 모습을 AT10b에서 보인다.

### F2. AT6d에서 입력 중인 칸이 안 보인다

- 키보드 위 가용 높이 500에서 저장 줄 위에 en(Source) 블록만 남고, 포커스가 있는 ko 칸이 보이지 않는다.
- 노트 "입력 중인 ko 칸이 보이도록 목록이 스크롤한다"를 이 프레임이 증명하지 못한다.
- **요청**: locale 목록을 스크롤한 상태로 그려 ko 칸(포커스 링 · Not saved)이 저장 줄 바로 위에 보이게 한다.

### F3. 번역 화면 프레임에 기존 미전달 배너가 없다 (AT6 · AT8a)

- 프레임의 데이터는 미전달 24건이다. 그 상태에서 번역 화면은 `EditLossBanner`(Alert neutral)를 항상 세운다(`components/translations/workspace/workspace.tsx:803`). 375에서 세로 공간을 차지하는데 시안에 없다.
- AT8a(연결 끊김)에서는 그 배너가 이미 꺼진 이유 문장을 덧붙인다(`components/translations/edit-loss-banner.tsx:40`). 새 사유 줄과 같은 문장이 한 화면에 두 번 나온다.
- **요청**: AT6a·AT8a에 배너를 넣어 다시 그린다. AT8a의 중복 처리는 F7 결정을 따른다.

### F4. AT4(Settings)가 코드가 아니라 새 구조로 그려졌다

- 노트가 새로 바꾼다고 적은 둘은 이미 코드에 있다.
  - "라벨은 필드 위" — `PanelFacts`가 `@min-form`(640) 미만에서 이미 한 열이다(`components/ui/panel-card.tsx:14`).
  - "고정 폭 → 최대 폭" — 이미 `w-[320px] max-w-full @max-form:flex-1`이다(`components/settings/general-card.tsx:85` · `:103`).
- 시안은 구조를 바꿨다. 이름 칸 옆의 Save(필드별 저장)를 카드 바닥 하나로 옮겼고, Base branch의 저장 동작이 빠졌다(`components/settings/repository-form.tsx:93`). 라벨도 코드의 muted xs가 아니라 13/500이다. 브리프의 "값은 그대로"와 어긋난다.
- **요청**: AT4는 시안에서 뺀다. 이 패턴은 현 코드의 컨테이너 규칙을 유지하고 구현 단계에서 375 실측으로 검증한다. 다시 그린다면 현 코드 구조(필드별 Save · 라벨 muted xs · 브랜치 저장)대로 그린다.

## 🟡 정정·확인

### F5. AT2 노트와 렌더가 반대다

- 노트: "375에서 다섯 미터가 두 줄, 768에서 한 줄".
- 렌더: 375는 미터 하나당 한 줄(다섯 줄 — 행 높이 약 180), 768은 `fr`이 둘째 줄로 감긴다.
- **요청**: 노트 쪽으로 고친다 — 미터는 가로로 흐르며 감긴다(flex-wrap). 행 높이를 아끼고 목록 한 화면에 더 많은 프로젝트가 든다. 768에서 한 줄이 안 되면 노트를 렌더에 맞춰 고친다.

### F6. AT3 노트의 코드 사실 오류

- `components/sources/source-detail-modal.tsx:124`의 `@max-[850px]`는 뷰포트 분기가 아니라 이미 컨테이너 쿼리다. "같은 컨테이너 기준으로 옮긴다"를 "기존 컨테이너 쿼리 유지 — 경계값만 시트 본문 폭에 맞는지 확인"으로 고친다.

### F7. 사유 줄을 lg 이상에도 두는가 — 사용자 결정 필요

- 시안은 브리프("좁은 폭에서")와 달리 모든 폭에 사유 줄을 둔다. 지금 데스크톱은 `title` + `sr-only`뿐이다(`components/publish-button.tsx:136` · `:145`).
- **추천**: 모든 폭에 둔다. 대신 `EditLossBanner`의 이유 덧붙임을 빼서 이유가 보이는 자리를 사유 줄 하나로 만든다 — F3의 중복이 함께 풀린다. 넓은 폭 헤더가 22 늘어나는 것은 받는다.
- 결정되면 AT8a 노트의 "브리프와 다름 · 확인 필요"를 결정 문장으로 바꾼다.

### F8. 새 키 후보 정리

- 쓰는 것: `responsive.backToKeys` · `responsive.viewSample` · `responsive.backToCandidates`. 확정하면 en·ko·es를 함께 넣는다.
- 버리는 것: `responsive.openSources` — 기존 `tree.open`("Show sources")으로 충분하다(시안 노트와 같은 판정).

## 그대로 받는 것

- AT1 서랍(행 40 · 접기 토글 없음 · 바닥 고정 · 프로젝트 전환 `w-64` 메뉴 · 프로젝트 밖 목록 구역), AT1c 40 레일 처리(툴팁 없음 · Expand sidebar · 리사이저 `touch-action`).
- AT3 메타 적층 순서와 960 컨테이너 기준, 카운트 카드 672 유지.
- AT5 초대 행 두 줄 묶음 · Enter = 행 추가 · footer 고정.
- AT6 772 카드 기준 단일 판 · 같은 DOM 숨김 · '목록으로' 복귀 시 선택 행과 scrollTop 복원 · 상세 제목 포커스 · 트리 팝오버 280.
- AT7 608 기준 순차 판 · Next 자리 유지 · 판 전환이 step을 진행시키지 않음.
- AT8b 확인 Dialog 440 · footer 감김(전폭 세로 쌓기 아님).
- AT9 다크 — 새 값 없음.

노트가 인용한 코드 사실은 F6을 빼고 전부 맞았다: `project-list.tsx:288` · `FILES_PANEL_WIDTH` 952 · `layout.ts` scrollWidth 772 · `interactiveWidget` · `@container/cards` 672 · 전환 메뉴 `w-64` · Dialog 440 · `event-dialog.tsx` `CloseButton absolute top-6 right-6` · `tree.open` · `expandSidebar` · 사이드바 행 `h-8`.

## 2차 시안에서 받을 것

| 항목 | 프레임 |
|---|---|
| F1 헤더 감김 규칙 + es 실제 문구 | AT6a · AT6c · AT8a · AT3a · AT10b |
| F2 ko 칸이 보이는 키보드 상태 | AT6d |
| F3 미전달 배너 포함 | AT6a · AT8a |
| F4 AT4 삭제(또는 현 코드 구조로 재작성) | AT4 |
| F5 미터 감김 | AT2a-375 · AT2a-768 |
| F6 · F7 노트 정정 | AT3 · AT8 |

---

# 2차 재검토 (2026-10-11)

**결론**: 1차의 🔴 F1~F4와 🟡 F5·F6·F8은 노트와 렌더 모두에 반영됐다. 남은 것은 새 규칙의 적용 범위 둘(R1·R2)과 F7의 사용자 확정이다. R1·R2는 노트만 고치면 되고 프레임을 다시 그릴 필요는 없다(R1에서 Projects를 두 줄로 정하면 AT2a-375 한 장만).

| 1차 | 2차 확인 |
|---|---|
| F1 | 패널 머리 640 미만 두 줄(제목 / 버튼 오른쪽)로 AT1a·AT6·AT8a·AT10b 재작성. es 실제 사전(`Sincronizar` · `Publicar 24` · `Sin enviar`) 반영, 저장 줄은 `Guardar`가 둘째 줄로 감김 — 렌더 일치 |
| F2 | AT6d에서 ko 칸(링 · Not saved)이 저장 줄 바로 위 — 렌더 일치 |
| F3 | 미전달 배너를 목록 판에만 둔다(상세 판은 키보드 여유 때문에 뺌) — AT6a·AT8a 렌더 일치. 문구는 `messages/en.tsx`의 `banner.paused`와 같다 |
| F4 | AT4 삭제 |
| F5 | 미터 가로 감김 — 375 둘씩 세 줄, 768 한 줄. 렌더 일치 |
| F6 | `@max-[850px]`는 이미 컨테이너 쿼리 — 실측 확인만으로 정정 |
| F7 | 추천안(모든 폭 사유 줄 + 배너 이유 덧붙임 제거)을 적용하고 **"사용자 확정 대기"** 표시 — 아래 결정 필요 |
| F8 | 새 키 셋(`backToKeys` · `viewSample` · `backToCandidates`) 확정 대기로 정리 |

## 🟡 R1. 패널 머리 두 줄 규칙의 범위가 프레임과 어긋난다

- AT6 노트는 "PanelHeader 컨테이너 640 미만이면 두 줄 — Home · Translations · Members · Logs 머리가 같은 규칙"이라고 한다. 그런데 Projects 목록도 같은 `PanelHeader`를 쓰고(`app/(edit)/projects/(list)/loading.tsx` 등) 버튼(`New project`)을 드는데, AT2a-375는 한 줄이다. Sources(`Add sources`) · Settings · Account · MCP · Inbox 머리도 같은 프리미티브다.
- **추천**: 버튼을 든 `PanelHeader`는 전부 640 미만에서 두 줄로 한다 — Projects도 포함해 AT2a-375를 고친다. 규칙이 하나여야 로딩 골격이 실물과 같은 줄 수를 낼 수 있다(spec A-09). "넘칠 때만 감김"(flex-wrap)은 언어마다 줄 수가 달라 골격이 따라갈 수 없다.

## 🟡 R2. 배너를 상세 판에서 빼는 범위가 EditLossBanner 하나뿐이다

- 번역 화면의 배너 묶음은 셋이다 — `SyncLockBanner` · `BasePendingBanner` · `EditLossBanner`(`components/translations/workspace/workspace.tsx:800-804`, 같은 컨테이너). 노트는 EditLossBanner만 "목록 판에만"으로 정했다.
- `SyncLockBanner`는 "Sync가 도는 동안 저장이 막힌다"를 말한다 — 저장하는 자리인 상세 판에서 빠지면 안 된다.
- **요청**: 노트에 셋의 자리를 적는다. 추천: SyncLockBanner는 두 판 모두(상세에서는 저장 줄 위), BasePendingBanner·EditLossBanner는 목록 판에만.

## 사용자 확정 (2026-10-11)

- **F7 · R1 · R2 모두 추천안으로 확정.** spec A-05 · design §3 · tasks A4 · 브리프 동작 주석에 반영했다.
  - F7: 사유 줄은 모든 폭, `EditLossBanner`의 이유 덧붙임 제거. AT8 라벨의 "사용자 확정 대기"를 뗀다.
  - R1: 버튼을 든 `PanelHeader`는 전부 640 미만 두 줄 — **AT2a-375 Projects 머리를 두 줄로 고친다.**
  - R2: `SyncLockBanner` 두 판(상세는 저장 줄 위) · `BasePendingBanner`·`EditLossBanner` 목록 판 — AT6 노트에 적는다.

---

# 3차 요청 — 시안에 남은 수정 셋 (2026-10-11)

2차 재검토 뒤 사용자가 F7 · R1 · R2를 추천안으로 확정했다. 시안에서 고칠 것은 아래 셋뿐이고, 셋 다 끝나면 대표 프레임을 확정한다(tasks A0). 새 프레임은 만들지 않는다.

## 1. AT2a-375 — Projects 머리를 두 줄로 (R1)

**왜**: 패널 머리 두 줄 규칙의 범위가 "버튼을 든 `PanelHeader` 전부"로 확정됐다. Projects 목록도 같은 `PanelHeader`이고 `New project` 버튼을 든다. 규칙에 예외가 있으면 로딩 골격이 실물과 같은 줄 수를 낼 수 없다(spec A-09).

**프레임 수정**
- 375 패널 머리의 컨테이너 폭은 약 343이라 640 미만 → 두 줄이다.
  - 첫 줄: `Projects` + 개수 배지 `5`. 왼쪽 정렬, 지금 크기 그대로.
  - 둘째 줄: `New project` 버튼(지금과 같은 primary · 같은 크기 · Plus 글리프)을 **오른쪽 정렬**.
- 머리 패딩 12/16과 줄 높이 36은 그대로다. 머리 높이만 36 + 8 늘어난다 — AT1a-375 Home 머리, AT6a-375 Translations 머리와 같은 치수다.
- 버튼을 아이콘만으로 줄이거나 전폭으로 늘리지 않는다.
- **AT2a-768은 바꾸지 않는다** — 컨테이너 약 750이라 640 이상, 한 줄 그대로다.

**노트 수정**
- AT2 노트에 한 장 추가 — 제목 "패널 머리 · 두 줄 규칙 적용", 본문: "Projects 머리도 버튼을 든 PanelHeader라 640 미만에서 두 줄이다(제목 / New project 오른쪽). 규칙은 AT6 첫 노트와 같고 768(750)은 한 줄이다."
- AT6의 노트 "패널 머리 · 640 미만은 두 줄"의 마지막 문장을 바꾼다.
  - 전: "Home · Translations · Members · Logs 머리가 같은 규칙 하나를 쓴다."
  - 후: "버튼을 든 PanelHeader는 전부 같은 규칙이다 — Home · Translations · Projects · Members · Sources · Logs 등. '넘칠 때만 감김'(flex-wrap)이 아니라 640 경계로 정한다 — 언어마다 줄 수가 달라지면 로딩 골격이 실물을 따라갈 수 없다. 골격도 같은 규칙이다."

## 2. AT6 노트 — 배너 셋의 판 배치 (R2)

**왜**: 번역 화면의 배너는 한 묶음 안에 셋이다 — `SyncLockBanner` · `BasePendingBanner` · `EditLossBanner`(`workspace.tsx:800-804`). 2차 노트는 그중 EditLossBanner만 "목록 판에만"으로 정했다. `SyncLockBanner`는 "Sync가 도는 동안 저장이 막힌다"를 말하므로 저장하는 자리인 상세 판에서 빠지면 안 된다.

**노트 수정** — AT6의 노트 "미전달 배너 · 목록 판에만 · 코드와 다름"을 아래로 바꾼다.
- 제목: "배너 셋의 판 배치 · 코드와 다름"
- 본문:
  - "단일 판에서 배너 셋의 자리가 갈린다."
  - "`SyncLockBanner`(Sync 중 저장 잠금)는 **두 판 모두**에 선다. 상세 판에서는 저장 줄(Revert · Save) 바로 위다 — 저장이 막히는 이유라 저장하는 자리에서 빠지면 안 된다."
  - "`BasePendingBanner`(기준 언어 대기)와 `EditLossBanner`(미전달 보류)는 **목록 판에만** 선다. 상세 판에서 그 높이를 쓰면 키보드가 열렸을 때 입력 칸 자리가 0이 된다(AT6d 실측: 500 중 목록 몫 96)."
  - "미전달 수는 헤더 Publish 배지가 계속 든다. EditLossBanner의 액션(Send with Publish)은 Publish 버튼으로 포커스만 옮기는 것이라 잃는 동작이 없다."
- **프레임은 그리지 않는다** — Sync 잠금은 상태 변형이라 브리프 규칙상 그리지 않는다. 노트만 고친다.

## 3. AT8 — "사용자 확정 대기" 떼기 (F7)

**왜**: 사유 줄을 모든 폭에 두는 안을 사용자가 확정했다(2026-10-11).

**노트 수정**
- 노트 "모든 폭에 둔다 · 추천안 적용 · 사용자 확정 대기"
  - 제목 → "모든 폭에 둔다 · 2026-10-11 사용자 확정"
  - 본문의 마지막 문장 "확정되면 이 라벨에서 '대기'를 뗀다."를 지운다. 나머지(title + sr-only 대체 · 넓은 폭 헤더 +22 수용)는 그대로다.
- 노트 "배너는 이유를 덧붙이지 않는다 · 코드와 다름"은 그대로 둔다 — 확정된 내용과 같다.
- 프레임 AT8a·AT8b는 바꾸지 않는다.

## 확인 방법

- AT2a-375 머리가 두 줄이고 높이가 AT1a-375 · AT6a-375 머리와 같다.
- AT2a-768 머리는 한 줄 그대로다.
- AT6 노트에 배너 셋의 자리가 모두 적혀 있다.
- 시안 어디에도 "확정 대기" · "확인 필요"가 남지 않는다.

## 3차 재검토 결과 (2026-10-11)

**3차 요청 셋 중 하나만 반영됐다 — 1(R1)·2(R2)를 다시 보낸다.**

| 요청 | 결과 |
|---|---|
| 1. AT2a-375 Projects 머리 두 줄 (R1) | ❌ **미반영** — 프레임은 한 줄 그대로이고, AT2에 노트가 늘지 않았다. AT6 노트도 여전히 "Home · Translations · Members · Logs 머리가 같은 규칙 하나를 쓴다"다. |
| 2. AT6 배너 셋의 판 배치 (R2) | ❌ **미반영** — 노트 제목이 여전히 "미전달 배너 · 목록 판에만 · 코드와 다름"이고 `SyncLockBanner`가 시안 어디에도 없다. |
| 3. AT8 확정 표시 (F7) | ✅ 제목이 "모든 폭에 둔다 · 2026-10-11 사용자 확정(F7)"이 됐고 "대기" 문장이 빠졌다. 시안 전체에 "확정 대기"·"확인 필요" 0건. |

**요청 밖 변경 — 받는다**
- **AT4를 현 코드 구조로 되살렸다**(F4의 둘째 갈래 "다시 그린다면 현 코드 구조대로"). 대조 결과 코드와 맞다: 필드별 Save · 라벨 muted xs(`Thumbnail` · `Name` · `Address` — `messages/en.tsx:3439`) · 기준 브랜치 행의 `pl-10` · `bg-muted` · 자기 Save · 캡션 `text-foreground/60`(`repository-form.tsx:78` · `:98`) · `w-60 max-w-full @max-form:flex-1`(`:107`) · 캡션 문구 `branchHelp`(`messages/en.tsx:3523`). 노트도 "새 규칙 없음 · 구현 때 375 실측"으로 정확하다.
- 리포 연결 행은 노트가 스스로 "자리값(점선) — repository-card.tsx를 읽지 않았다"고 밝혔다. 구현 기준은 코드이고 375에서 지킬 것은 리포 이름 `overflow-wrap:anywhere` 하나라 막지 않는다.
- "프레임 읽는 법" 카드의 A18 언급을 responsive-mockup MK1 분리로 고쳤다 — 맞다.

**다시 보낼 것**: 위 "3차 요청"의 1·2절을 그대로 다시 보낸다. 둘 다 끝나면 대표 프레임을 확정한다(tasks A0).

---

# 4차 재검토 (2026-10-11)

**R1은 반영됐고, R2는 확정안과 다른 안으로 그려졌다 — 사용자가 추천안(확정안 유지 + CSS 숨김)으로 재확정했다(2026-10-11). 시안 수정은 아래 "5차 요청".**

## ✅ R1 반영

- AT2a-375 Projects 머리가 두 줄(제목 + 배지 / `New project` 오른쪽)이고 AT2a-768은 한 줄이다. AT2에 노트 "패널 머리 두 줄"이 추가됐고, AT6 노트가 "Home · Projects · Translations · Members · Logs · Sources 머리가 같은 규칙"으로 바뀌었다.

## 🔴 R2 — 시안이 확정안을 뒤집었다

- **확정안**(2026-10-11 사용자): `SyncLockBanner`는 두 판 모두, `BasePendingBanner`·`EditLossBanner`는 목록 판에만.
- **시안**: 셋 다 두 판 모두에 선다. 목록 판은 지금처럼 카드 위, **상세 판은 locale 목록 스크롤의 맨 위**(AT6c 점선)에 다시 렌더한다. 근거는 "폭으로 정보를 덜지 않는다"와, 스크롤 안이라 키보드가 열려도 고정 높이를 먹지 않는다는 것(AT6d에서는 위로 밀려 나가 있다). 새 프레임 AT6f(셋이 함께 설 때)도 더했다.
- 시안 안의 문제:
  1. **배너가 판에 따라 다른 부모로 옮겨 다시 마운트된다.** 지금 설계는 판 표시를 CSS(`@container` + `data-pane`)가 정하고 JS는 폭·포커스만 맡는다(design §3). 시안대로면 배너 자리를 고르려고 JS가 single/split을 알아야 하고, SSR 첫 렌더(판 미측정)는 본문 위 → 측정 뒤 상세 스크롤 안으로 **자리가 튄다**.
  2. **`SyncLockBanner`가 상세에서 스크롤로 밀려 나간다** — 저장이 막힌 이유가 저장하는 순간 안 보인다. R2가 지키려던 것이 이것이다.
- **추천: 확정안 유지 + 구현을 CSS 한 줄로 단순화.** 배너 셋은 지금 DOM 자리(본문 위)에서 움직이지 않는다. 단일 판의 상세 판에서만 `BasePendingBanner`·`EditLossBanner`를 `data-pane` CSS로 숨긴다(판 표시와 같은 장치 — 재마운트 0, JS 판정 0). `SyncLockBanner`는 두 판 모두 본문 위 그대로다(확정안의 "상세에서는 저장 줄 위"를 "본문 위 그대로"로 바꾼다 — 옮기면 위 1번 문제가 생긴다). 숨는 둘의 정보는 목록 판으로 돌아가면 보이고, 미전달 수는 헤더 Publish 배지가 계속 든다.
- 결정되면 AT6c 상세의 배너(점선)를 빼고, AT6 노트 "배너 셋 · 판별 자리"·"왜 상세에서는 스크롤 안인가"·"한 벌 · 판 따라 자리만 옮긴다"를 확정안으로 바꾼다. AT6f는 그대로 받는다(목록 판의 셋 동시 표시라 확정안과 같다).

## 🟡 AT6f의 Sync 잠금 시각에 날짜·오프셋이 없다

- 프레임: "by 14:32 at the latest". 실제는 `formatMinute` 출력이다(`components/translations/sync-lock.tsx:15`) — 날짜와 시간대 오프셋이 붙는다(예: `Oct 11, 2026 14:32 UTC`, CLAUDE.md 날짜 규칙). 프레임 문구를 그 형으로 고친다. 375 두 줄 → 세 줄이 될 수 있다.

## 그 밖 — 받는다

- es 배너 문구(`Las actualizaciones del repositorio se retienen…` · `Enviar con Publicar`)가 `messages/es.tsx:1323-1324`와 같다.
- AT6a-1024(분할 판)는 배너가 본문 전폭 위 그대로다 — 코드와 같다.

---

# 5차 요청 — 시안에 남은 수정 (2026-10-11)

사용자가 R2를 4차 추천안으로 재확정했다: **배너 셋은 본문 위 지금 자리에서 움직이지 않고, 단일 판의 상세 판에서만 `BasePendingBanner`·`EditLossBanner`를 CSS로 숨긴다. `SyncLockBanner`는 두 판 모두 본문 위 그대로다.** 시안에서 고칠 것은 아래 셋이고, 새 프레임은 만들지 않는다. 끝나면 대표 프레임을 확정한다(tasks A0).

## 1. AT6c-375 — 상세 판에서 배너를 뺀다

**왜**: 상세 판에서 미전달 배너는 숨는다. 상세 스크롤 안으로 다시 렌더하면 판 전환마다 배너가 다른 부모로 옮겨 재마운트되고, JS가 단일/분할을 알아야 하며, SSR 첫 렌더에서 본문 위 → 스크롤 안으로 자리가 튄다.

**프레임 수정**
- AT6c-375에서 locale 목록 스크롤 맨 위의 미전달 배너(점선 영역 전체)를 지운다. 키 블록(`checkout.coupon` · `3 of 5 languages` · 설명) 바로 아래가 `en Source` 행이 된다 — 2차 시안의 AT6c와 같은 모습이다.
- AT9b-375(다크 · AT6c 복제)와 AT10b-375(es · AT6c 복제)에도 같은 배너가 들어갔다면 함께 뺀다.
- AT6a · AT6b · AT6e(목록 판)의 배너, AT6f(셋 동시 · 목록 판), AT6a-1024(분할 판)는 **그대로 둔다.**

## 2. AT6 노트 셋을 하나로 바꾼다

**지울 노트**: "배너 셋 · 판별 자리 · 코드와 다름", "왜 상세에서는 스크롤 안인가", "한 벌 · 판 따라 자리만 옮긴다".

**새 노트 한 장**
- 제목: "배너 셋 · 자리는 그대로, 상세에서 둘만 숨김 · 코드와 다름 · 2026-10-11 사용자 확정(R2)"
- 본문:
  - "`workspace.tsx:801-803`은 SyncLockBanner(neutral) · BasePendingBanner(warning) · EditLossBanner(neutral) 순으로 본문 위에 쌓는다. 이 DOM 자리는 어느 폭에서도 바뀌지 않는다."
  - "분할 판(772 이상)과 단일 판의 목록 판에서는 셋 다 지금처럼 선다(AT6a · AT6f · AT6a-1024)."
  - "단일 판의 상세 판에서는 BasePending · EditLoss를 판 표시와 같은 `@container` + `data-pane` CSS로 숨긴다. 상세에서 그 높이를 쓰면 키보드가 열렸을 때 입력 칸 자리가 0이 된다(AT6d). 미전달 수는 헤더 Publish 배지가, 기준 언어 대기는 목록 판으로 돌아가면 다시 보인다."
  - "SyncLock은 두 판 모두 본문 위 그대로다 — 저장이 막힌 이유라 저장하는 자리에서 빠지면 안 된다. Sync 중에만 서는 일시 상태라 고정 높이를 받는다."
  - "배너를 옮기지 않으니 재마운트 0 · JS 판정 0 · SSR 첫 렌더에서 자리가 튀지 않는다."

## 3. AT6f-375 — Sync 잠금 시각에 날짜·오프셋

**왜**: 실제 시각은 `formatMinute` 출력이라 날짜와 시간대 오프셋 라벨이 붙는다(`components/translations/sync-lock.tsx:15`, CLAUDE.md 날짜 규칙).

**프레임 수정**
- 전: "Syncing… You can't save edits until the sync finishes — by 14:32 at the latest"
- 후: "Syncing… You can't save edits until the sync finishes — by Oct 11, 2026 14:32 UTC at the latest"
- 375에서 세 줄이 되면 그대로 둔다(말줄임 금지). AT6f 노트의 "셋이 약 300" 수치가 달라지면 고친다.

## 확인 방법

- AT6c · AT9b · AT10b 상세 판에 배너가 없다.
- AT6 노트에 배너 관련 노트가 한 장이고, "스크롤 안" · "판 따라 자리만 옮긴다"는 문장이 남지 않는다.
- AT6f 잠금 문구에 `Oct 11, 2026 14:32 UTC`가 있다.

## 5차 재검토 결과 (2026-10-11) — 대표 프레임 확정

**5차 요청 셋 모두 반영됐다. 보낼 피드백 없음 — 대표 프레임을 확정한다(tasks A0).**

| 요청 | 결과 |
|---|---|
| 1. 상세 판 배너 제거 | ✅ 상세 판 배너 렌더 자체가 시안에서 빠졌다 — AT6c와 그 복제인 AT9b·AT10b 모두 배너 없음. 목록 판 · AT6f · AT6a-1024 배너는 그대로 |
| 2. AT6 배너 노트 하나로 | ✅ 옛 노트 셋이 빠지고 "배너 셋 · 자리는 그대로, 상세에서 둘만 숨김 · 2026-10-11 사용자 확정(R2)" 한 장이 됐다. 본문은 요청 문장과 같다. "스크롤 안" · "판 따라 자리만" 문장 0건 |
| 3. AT6f 잠금 시각 | ✅ `Oct 11, 2026 14:32 UTC`. AT6f 노트도 세 줄 · 약 320으로 고쳤다 |

시안 전체에 "확정 대기" · "확인 필요" 0건. 확정된 결정: F1(패널 머리 640 두 줄) · F3/R2(배너 자리 고정 + 상세 CSS 숨김) · F4(AT4 현 코드 구조) · F5(미터 감김) · F7(사유 줄 모든 폭 + 배너 이유 덧붙임 제거) · F8(새 키 셋) · R1(버튼 든 PanelHeader 전부).
