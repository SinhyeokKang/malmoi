# invitation-email-project — design

## 범위 게이트

- PRODUCT §4.2 "이메일" 비범위는 2026-09-23에 **멤버 초대 메일 하나만** 예외로 열려 있다. 이 기능은 그 메일의 **본문 구성**을 바꿀 뿐 새 발송 목적·새 수신자·추적을 만들지 않는다 → 범위 안.
- 다만 PRODUCT §4.1의 문장("프로젝트명·역할·추적을 싣지 않는다")을 **뒤집는다** → PRODUCT 갱신이 산출물에 들어간다(tasks T8). 근거는 spec "뒤집는 근거".
- ARCHITECTURE §0 불변식과 무관하다(export·push·pull·blob SHA를 건드리지 않는다).

## 영향 받는 흐름

편집 UI → Members의 초대 발급·Pending Resend → `lib/invitation-email/` → Resend. push/pull 무관.

```
createInvitations / resendInvitation (app/(edit)/projects/actions.ts)
  └ issueInvitations / reissueInvitation (issue.ts, Project 잠금 tx)
       └ + 잠금 안에서 Project { name, image } 읽기 → outcome에 실어 반환
  └ toMessages: { to, token } → { to, token, role }
  └ sendInvitationEmails(config, project, messages)
       └ buildInvitationEmail({ ..., project, role })   ← 순수
```

## 순수 함수 (= /tdd 대상)

1. **`buildInvitationEmail` 확장** (`lib/invitation-email/message.ts`)
   - 입력에 `project: { name: string; image: string | null }`, `role: "OWNER" | "EDITOR"` 추가.
   - `subject`는 `INVITATION_EMAIL_SUBJECT` 고정이고 값을 `You're invited to a project on Malmoi`로 바꾼다 — 테스트가 이름·역할이 subject·preheader에 없음을 고정한다.
   - `text`: **초대 URL 한 줄 유지**(기존 "개행 없음" 단언 유지) — OWNER 자유 문구를 서식 없는 파트에 싣지 않는다.
   - **치환은 단일 패스다**: `html.replace(/\{\{(\w+)\}\}/g, (_, k) => …)`, 값 조회는 `Object.hasOwn`. 지금의 연쇄 `replaceAll`에 사용자 입력(`PROJECT_NAME`)이 끼면 `{{INVITE_URL}}`이 든 이름이 뒤 치환에서 다시 전개된다(`escapeHtml`은 `{`·`}`를 안 건드린다). 함수 인자라 `$&` 치환 패턴도 해석되지 않는다.
   - `image: ""`는 `null`과 같게 본다(`ImageTile`의 판정과 맞춘다 — 구현 때 그 판정을 확인해 따른다).
2. **`emailProjectName(name)`** — **grapheme 기준**(`Intl.Segmenter("en", { granularity: "grapheme" })`, Node 24 내장) 60개 초과 시 앞 59개 + `…`(`…` 포함 60). 코드 포인트로 자르면 ZWJ 이모지·국기 쌍·결합 문자가 중간에서 깨진다. **순서는 자르기 → 이스케이프**다 — 거꾸로면 `&amp;` 같은 엔티티가 중간에서 잘린다.
   - N=60의 근거는 **피싱 무게 상한**이지 줄 수가 아니다 — 라틴 14px는 한 줄, 한글 60자는 두 줄로 넘어가며 수용한다. `PROJECT_NAME_MAX_CHARS`(`lib/projects/plan.ts`, UTF-16 `length` 200)와 단위가 다른 것은 의도다.
3. **`TONE_HEX: Record<Tone, string>`** — 상수 하나, 호출부는 `TONE_HEX[toneOf(project.name)]`(**자르기 전 원래 이름**으로 — 잘린 이름으로 고르면 61자 이상에서 화면 색과 갈린다). 타입이 여덟 전부를 강제한다. 판정은 화면과 같은 `lib/tone.ts`, 값만 hex다. 위치는 `lib/invitation-email/`(메일만 쓴다 — `lib/tone.ts`는 import 0 잎이라 거기 넣지 않는다).
   - 값은 **Tailwind v4 `theme.css`의 `--color-<tone>-600` oklch를 sRGB로 환산·클리핑한 근사값**이다(메일 클라이언트가 oklch를 못 읽는다). indigo를 뺀 일곱은 sRGB 밖이라 P3 화면에서는 앱 쪽이 더 채도가 높다 — 피할 수 없는 잔여 차이로 수용한다.
   | tone | -600 (v4 → sRGB) |
   |---|---|
   | rose `#ec003f` · orange `#f54900` · amber `#e17100` · emerald `#009966` | teal `#009689` · sky `#0084d1` · indigo `#4f39f6` · fuchsia `#c800de` |
   - **테스트가 `node_modules/tailwindcss/theme.css`를 읽어 oklch → sRGB hex로 환산해 이 표와 대조한다** — 손으로 적은 상수끼리 비교하면 v3 값(설계 초안의 오류)도 통과한다. Tailwind를 올리면 여기서 red가 난다. `visual-system.test.ts`는 `app`·`components`만 훑어 `lib/invitation-email/`의 hex는 그 게이트 밖이므로 이것이 유일한 방어선이다(POSTMORTEM 2026-09-17 교차 화면 톤 계약).
4. **카드 조각 선택** — 썸네일 유무 두 갈래. 조각 두 벌은 `template.ts`의 상수이고 `message.ts`는 **고르기만** 한다(아래 템플릿). 역할 라벨은 `m.projects.role`(`Owner`/`Editor`)를 쓴다 — 화면과 같은 낱말.

## 템플릿 (`template.ts`)

- 새 변수: `{{PROJECT_NAME}}` · `{{ROLE}}` · `{{TILE}}`. `{{TILE}}`에는 `template.ts`의 두 상수(`INVITATION_EMAIL_TILE_IMAGE` / `INVITATION_EMAIL_TILE_FALLBACK` 꼴) 중 하나가 들어가고, 그 안의 `{{TILE_SRC}}`·`{{TILE_BG}}`는 같은 단일 패스로 치환된다. 분리안(`bgcolor=""`)은 클라이언트마다 해석이 갈려 기각. 마크업은 template, 조립 없음(머리 주석 원칙 유지).
- 카드 규격은 수락 화면 카드의 computed 값에 맞춘다(`project-card.tsx`·`app/globals.css`):
  - 카드: 테두리 `1px #e5e5e5`, **radius 12**(`rounded-lg` = `--radius` 0.75rem), padding 12, 타일↔텍스트 gap 12.
  - 타일 32×32 radius 8(`rounded-sm`). **radius를 거는 자리가 갈래마다 다르다** — 이미지 갈래는 `<img>`에(Gmail은 `<td>` radius가 자식을 자르지 않는다), 폴백 갈래는 `<td bgcolor>`에. Outlook은 radius 무시 — 수용.
  - 타일 셀은 `width="32" height="32" align="center" valign="middle"` 고정. 썸네일 `<img width="32" style="max-width:32px;max-height:32px;height:auto">` — `normalizeImage`가 `fit: "inside"`라 비정사각이 오고 메일은 `object-fit`을 무시하므로 찌그러뜨리지 않고 담는다. Box PNG는 `width="16" height="16"`(파일은 2x인 32×32).
  - 이름 `14px/20px`, 역할 `13px/17px`(`text-xs` 행간은 짝이 없어 13×1.3333), 둘 다 `letter-spacing:0.02em` weight 400, 두 줄 사이 1px. 이름 `#0a0a0a`, 역할 `#737373`.
  - 이름 셀 `word-break:break-word;overflow-wrap:anywhere` — 메일에는 `truncate`가 없고 공백 없는 긴 이름이 560 폭을 민다(대체 링크 문단과 같은 형).
  - 카드 테이블 `role="presentation"`(기존 표와 같이) — 읽기 순서 로고 → h1 → 문장 → 이름 → 역할 → 버튼.
  - 여백: 문장 → 카드 16, 카드 → 버튼 28.
- 문구: `<title>`·h1 `You're invited to a project on Malmoi`, 본문 `You've been invited to join this project on Malmoi.` preheader는 현행(`You've been invited to a project on Malmoi. …`) 그대로.
- 머리 주석의 "**시안이 정본이다**"와 "변수는 `{{INVITE_URL}}` 하나다"를 고친다 — 구현이 dev에 들어간 화면은 코드가 정본이다(CLAUDE.md `/design-sync` 절). `/design-sync`를 부르지 않는다. `message.ts` 머리 주석("프로젝트명·역할…을 넣지 않는다")도 같이 고친다.
- `<img alt="">`: 썸네일·Box PNG 둘 다 **빈 값으로 명시**(생략하면 Outlook이 파일명을 표시한다). 이름이 바로 옆이라 대체 텍스트가 이름을 두 번 읽게 한다 — 화면 `ImageTile`도 `aria-hidden`이다. 이미지 차단 시 썸네일 갈래는 빈 32칸, 폴백 갈래는 글리프 없는 톤 사각 — 둘 다 수용.

## 새 정적 에셋

- `public/email/box@2x.png` — lucide `Box` 글리프(`node_modules/lucide-react/dist/esm/icons/box.mjs`의 `__iconNode`로 SVG 조립, viewBox 24 · stroke 2 · `stroke="#fff"` `fill="none"`), 투명 배경, 32×32 렌더(표시 16px의 2x — 화면 `size-4` stroke 2와 같은 비율). 로고와 같이 **프로덕션 고정 URL**(`https://mal-moi.com/email/box@2x.png`)로 참조한다 — preview는 SSO 뒤라 메일 클라이언트가 못 받는다(`message.ts`의 LOGO_URL 주석). **프로덕션 배포 전 dev 메일에서는 빈 칸**이다. 경로를 옮기면 이미 보낸 메일이 깨진다.
- 생성은 `.scratch/`의 일회성 sharp 스크립트, 산출 PNG만 커밋한다(`.gitignore`는 `public/fonts/`만 막는다).

## 데이터·잠금

- `issueInvitations`·`reissueInvitation`이 `lockProjectAccess` 뒤 `tx.project.findUnique({ where: { id: projectId }, select: { name: true, image: true } })`를 읽어 `issued` outcome에 `project`로 싣는다. 잠금 뒤 읽어야 동시 이름 변경과의 순서가 참이다(발급 사건과 같은 시점의 값). 이미 잠근 행의 PK 읽기 한 번이라 잠금 추가·교착 순서 변화가 없다(`lockProjectAccess`가 이미 `archivedAt`을 읽는 쿼리 하나가 더 붙는 비용 — 수용). 보관된 프로젝트는 `lockProjectAccess`가 먼저 거부해 이 읽기에 닿지 않는다.
- `IssuedInvitation`에 `role`을 더한다(발급은 `writeInvitation`이 가진 `recipient.role`, 재발급은 저장된 `row.role` — 추가 쿼리 없음, 출처가 서버에 고정).
- `Project.image`는 스키마 주석대로 **PII가 아닌 공개 Blob URL**이다(User.image와 다르다 — 봉투 없음). **쓰는 자리가 `uploadProjectImage`의 `putImage` 반환값 하나**라 서버가 쓴 Blob URL뿐이다 → 스킴 검증 없이 이스케이프해 `src`에 넣는다. 외부 URL을 넣는 쓰기 경로가 생기면 이 판정을 다시 연다.

## 스키마 변경

없음.

## 새 환경변수

없음.

## 불변식·보안 영향

- **피싱 레버**: 프로젝트 이름은 OWNER 자유 입력(최대 200자)이다. 본문 카드에만 싣고(제목·preheader·text 제외), 60 grapheme 상한 + 이스케이프 + 카드 안의 이름 자리로 한정해 "문장처럼 읽히는 자유 문구"의 무게를 줄인다. 발송 한도(주소 60초 · 프로젝트 20/h · 발급자 30/h)는 그대로 스팸 상한이다.
- **HTML 주입·재치환**: 이름·URL 모두 기존 `escapeHtml`을 지나고, 단일 패스 치환이라 값 안의 `{{…}}`가 다시 전개되지 않는다. 테스트가 `<script>`·`"`·`'`·`&`·`$&`·`{{INVITE_URL}}` 이름을 고정한다.
- **추적**: 썸네일 URL은 프로젝트 단위 값이라 수신자를 가르지 않는다 — Malmoi 쪽 열람 추적이 아니다(로고와 같은 논리). 단 **수신자 메일 클라이언트가 Vercel Blob에 요청한다**(Gmail은 프록시) — `/privacy`의 로고 문단·Vercel 항목을 T7에서 고친다.
- 인증 경계 무관. `import "server-only"`: `message.ts`는 테스트가 직접 import하는 순수 모듈이라 붙이지 않는다(현행 유지). `client-safe.test.ts`는 `recipients.ts` 그래프만 보므로 `message.ts`가 `m`을 import해도 걸리지 않는다(확인함).

## POSTMORTEM 소환

- **2026-09-09 malmoi#18** — "표시용 축약이 유일한 식별자인 자리를 만들지 않는다." 이름 60자 자르기가 해당하나: **메일 한 통에 프로젝트 하나라 식별 충돌이 없다** → 해당 없음. (수락 화면도 `truncate`로 한 줄에서 자르므로 전체 이름을 보장하는 자리는 아니다.)
- **2026-09-17 목록/상세 썸네일 색 불일치** — 같은 엔터티 타일의 교차 화면 계약. `TONE_HEX`를 `theme.css` 환산값과 대조하는 테스트가 재발 방지다.
- **2026-09-19 privacy** — 등재·게이트는 "빠짐"을 잡지 "거짓"을 못 잡는다 → T7에서 고친 문장마다 소스 대조.
- **malmoi#50** — 깨진 썸네일 URL. 메일에는 런타임 폴백이 없다(이미지 onError 없음) — 깨지면 빈 칸이다. 비목표(이미 보낸 메일의 이미지 보존)로 수용.
- `replaceAll` 문자열 치환 패턴 — 단일 패스 치환도 함수 인자를 유지한다.
