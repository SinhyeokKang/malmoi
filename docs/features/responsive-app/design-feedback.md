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
