# invitation-email-project — tasks

에셋 → 순수 함수 → 껍데기 → 문서. `[commit]`이 커밋 경계. 문서는 문서별 별도 커밋.

- [ ] **T1** `public/email/box@2x.png` 생성(`.scratch/` sharp 스크립트 — lucide `box.mjs`의 `__iconNode`로 SVG 조립, `stroke="#fff"` `fill="none"` stroke 2, 32×32 투명) + `message.test.ts`에 에셋 테스트 — 로고 테스트 형(PNG 시그니처 · IHDR 32×32) + color type 6 = RGBA(로고 테스트엔 없는 단언).
  - 검증: `pnpm exec vitest run lib/invitation-email/__tests__/message.test.ts` 중 에셋 테스트 green
  - `[commit] feat(invite-email): add the fallback project glyph asset`
- [ ] **T2 (tdd)** `message.test.ts` 확장 + **기존 단언 뒤집기**:
  - 뒤집는 것: "이미지는 고정 URL 로고 하나다"와 `:75`의 로고 외 src 금지 정규식(→ 두 갈래 모두 `<img>` 2개, 허용 src는 로고 · box@2x · `https://mal-moi.com/api/images/<key>` 셋, 쿼리·수신자별 값 없음), subject 단언 두 곳(`message.test.ts:33`의 `INVITATION_EMAIL_SUBJECT`, `send.test.ts:62-64`의 `toEqual` 안 subject), "프로젝트명·역할·수신 주소를 싣지 않는다"(→ 수신 주소 부재만 유지), 파일 머리 주석.
  - 새 단언: 카드 두 갈래(이미지: `<img src="https://mal-moi.com/api/images/projects/…">` + width 속성 없음·`max-width:32px;max-height:32px` + 셀 bgcolor 없음 + img에 radius / 없음: `TONE_HEX` bgcolor + box PNG 16×16), **어느 입력이든 `html`에 `vercel-storage.com` 0건**(메일은 `image-origin.test.tsx` 그물 밖의 매핑 소비자 — 이것이 유일한 방어선), 폴백으로 가는 입력 셋(`null` · `""` · 우리 스토어가 아닌 https URL), 카드 테이블 `width="100%"`, 역할 라벨(`Owner`/`Editor`), subject·`<title>`·h1 = `You're invited to a project on Malmoi`, 본문 문장, subject·preheader·text에 이름·역할 부재, text = URL 한 줄, 이스케이프(`<script>`·`"`·`'`·`&`·`$&`·`{{INVITE_URL}}`), `html`에 `{{` 잔재 없음, 단일 패스 맵이 `{{LOGO_URL}}`까지 덮는다(로고 URL이 여전히 한 번 전개).
  - `emailProjectName`: 60 grapheme 그대로 / 61 → 59 + `…` / ZWJ 이모지·국기 쌍·결합 문자 경계 / 59자 + `&` → 자르기 뒤 이스케이프.
  - `TONE_HEX`: `node_modules/tailwindcss/theme.css`의 `--color-<tone>-600` oklch를 sRGB로 환산해 **채널별 0–1 clamp**(gamut mapping 아님)한 hex와 여덟 전부 일치, 톤은 **자르기 전 이름**으로 고른다(61자 이상 이름).
  - 검증: 새 테스트가 red(구현 전), 에셋 테스트는 green 유지
- [ ] **T3** `emailProjectName` · `TONE_HEX` · `buildInvitationEmail` 확장(단일 패스 치환) · `template.ts` 카드 마크업·조각 상수·문구 + 머리 주석 두 파일("시안이 정본" → 코드가 정본, 변수 목록, "프로젝트명·역할을 넣지 않는다" 제거).
  - 검증: `pnpm exec vitest run lib/invitation-email/__tests__/message.test.ts` green (`send.test.ts`는 T4 전까지 red일 수 있다 — 커밋하지 않는다)
- [ ] **T4** `issue.ts` — 잠금 뒤 `Project { name, image }` 읽어 outcome에 싣기, `IssuedInvitation.role`. `send.ts` 시그니처에 `project`, 메시지에 `role`. `actions.ts`의 `toMessages`에 role. `send.test.ts` 갱신(역할이 섞인 배치 EDITOR·OWNER에서 메시지마다 자기 역할).
  - `app/(edit)/__tests__/invitation-email.test.ts` 갱신: `send` 단언(`:226-229`·`:281`의 `(READY, [{ to, token }])`)에 `project` 인자와 메시지별 `role`, 목 outcome(`:69`·`:72`)에 `project`·`role`. `activity-events.test.ts:44`·`membership.test.ts:31`의 `send` 목도 새 시그니처로 맞는지 확인.
  - `invitation.integration.ts` 단언 추가: 발급 → 이름 변경 + `image = null` → 재발급했을 때 outcome이 **새 이름과 `null`**을 싣는다(폴백 갈래 전환도 덮는다), 재발급 `role`이 저장된 역할(발급 뒤 역할이 바뀐 경우 포함), 보관된 프로젝트는 `archived` 거부로 `project`를 읽지 않음.
  - 검증: `pnpm typecheck` + `pnpm test lib/invitation-email` + `pnpm test app/(edit)` + `pnpm test:projects:postgres` green (`invitation.integration.ts`는 기본 `pnpm test`가 안 돌린다 — `vitest.projects.config.ts`)
  - `[commit] feat(invite-email): show the project card in invitation emails` (T2~T4 한 커밋 — 인터페이스 변경이 호출부와 한 몸)
- [ ] **T5** 실물 확인(수동) — 로컬에서 dev Resend로 자기 주소에 두 갈래(썸네일 있음/없음) 발송. Gmail 웹은 ego-browser, Apple Mail은 사람이 본다(2 갈래 × 2 클라이언트 = 4장).
  - 판정: 카드가 문장과 버튼 사이, 이름 이스케이프 원문 표시, 역할 라벨, 폴백 셀 bgcolor = `TONE_HEX`, h1·제목 새 문구. **썸네일 갈래의 이미지와 Box PNG는 프로덕션 배포 전이라 빈 칸이 정상**(dev 스토어 키를 프로덕션 프록시가 모른다) — 썸네일 표시는 T6이 본다.
  - 검증: 스크린샷 4장이 위 판정을 전부 만족
- [ ] **T6** 프로덕션 배포(`/merge`) 뒤 두 갈래 메일로 확인(수동): 폴백 갈래 Box 글리프가 흰색 16px, 썸네일 갈래 이미지가 표시되고 비율 유지(세로로 긴 썸네일 하나 포함).
  - 검증: 스크린샷 2장이 위 판정을 만족
- [ ] **T7** `/privacy` 개정 — 고칠 문장:
  - Resend 항목(`messages/en.tsx` "It receives the invited address and the message with the invitation link") → 프로젝트 이름·역할·썸네일 주소(mal-moi.com) 포함
  - 30일 보관 항목("the address, the subject and the link") → 본문 내용 반영
  - 로고 문단(`messages/en.tsx:650` "An invitation email shows a logo that your email app loads from mal-moi.com …") → 로고·프로젝트 썸네일·Box PNG 모두 mal-moi.com에서 받는다, "the same image … for everyone"은 "썸네일은 프로젝트마다 다르지만 그 프로젝트의 수신자 모두에게 같아 누가 열었는지 가르지 않는다"로(새 전송처 없음 — Blob은 서버끼리)
  - Vercel 항목("storage for uploaded profile pictures") → 프로젝트 썸네일 포함 — **이 기능 전(2026-09-20)부터 이미 거짓**이었던 것을 같은 개정에서 고친다
  - 삭제 절의 Resend 기록 문장 검토
  - 개정 이력 한 줄 + `effectiveDate` + `policy-gate.test.tsx`의 `REVISIONS` digest 행
  - 검증: `pnpm test lib/privacy` green + **고친 문장마다 소스 파일:라인 대조를 커밋 본문 또는 작업 보고에 남김**(게이트는 거짓을 못 잡는다 — POSTMORTEM 2026-09-19). 개수를 말하는 문장은 이번 변경분을 먼저 더하고 센다.
  - `[commit] docs(privacy): invitation emails carry the project name, role and thumbnail`
- [ ] **T8** PRODUCT §4.1 초대 메일 문단 갱신(카드 구성, 제목·text 고정, 로그인 전 노출 예외 근거, Outlook 데스크톱·다크 반전 수용, 초대자·추적 여전히 없음).
  - 검증: `grep -n "프로젝트명·역할·추적을 싣지 않는다" docs/PRODUCT.md` 0건
  - `[commit] docs(PRODUCT): invitation emails show the project card`
- [ ] **T9** DESIGN — 초대 메일 절 신설: 카드 규격(computed 근거)·폴백·alt·이미지 차단 모습·img radius와 비확대 차이, 메일 hex(`#171717`·`#fafafa`·`#262626`·`#e5e5e5`·`#737373`·`#0a0a0a`·`#ffffff`(§6.2 `bg-white` 예외와 같은 부류) + `TONE_HEX` 여덟). 톤 여덟은 §6.2에 이미 등재된 색의 **hex 사본**이고 P3 잔여 차이를 수용한다고 적는다.
  - 검증: DESIGN에 초대 메일 절이 있고 `TONE_HEX` 여덟 값이 코드와 같다(grep)
  - `[commit] docs(DESIGN): record the invitation email project card`
- [ ] **T10** DIRECTORY — `lib/invitation-email/` 행("text URL 한 줄 + html — Claude Design `email/invite.html`이 정본" → 코드가 정본), `public/email/`에 `box@2x.png` + "옮기면 이미 보낸 메일이 깨진다".
  - 검증: `grep -n "invite.html" docs/DIRECTORY.md` 0건
  - `[commit] docs(DIRECTORY): record the invitation email glyph asset`
- [ ] **T11** ARCHITECTURE — §6.7 "소비자는 잎 둘로 고정한다"(L2623)에 메일 예외(절대 URL이 필요해 `useImageFallback` 밖에서 `planProjectImageDelete`로 매핑, 그물은 `message.test.ts`의 `vercel-storage.com` 0건), §6.75의 "네 reader"(L2641·L2646 — "넷 다 `ImageTile`") 수와 문장을 메일 포함으로(이번 변경분을 더하고 센다), 초대 발급 절에 "이름·썸네일은 `Project` 잠금 뒤 값 · 메일은 발송 시점 스냅샷이 아니다 · 단일 패스 치환".
  - 검증: `grep -n "잎 둘로 고정\|넷 다 \`ImageTile\`\|네 reader" docs/ARCHITECTURE.md`의 각 줄이 메일을 포함하거나 0건, `grep -n "발송 시점 스냅샷\|단일 패스" docs/ARCHITECTURE.md` 각 1건 이상
  - `[commit] docs(ARCHITECTURE): invitation emails read the project under the lock`
- [ ] **T12** 게이트: `pnpm typecheck` + `pnpm test` + `pnpm test:projects:postgres` + `pnpm build` green → 이 디렉터리 삭제.
  - `[commit] docs(feature): remove invitation-email-project`

## 결정 기록 (/orchestrate, 2026-09-28)

- 배치: **C** = T1~T4(코드) · **D** = T8·T9·T10 → C가 dev에 들어간 뒤 T7·T11(코드 라인 인용). 파일 겹침 없음(C는 `messages/en.tsx`를 안 건드린다). T12는 지휘자, T6은 `/merge` 뒤라 이번 범위 밖.
- T5: 통합 뒤 main 체크아웃의 QA 워커가 dev QA 프로젝트로 두 갈래를 `ox501tube@gmail.com`에 발송하고 Gmail 웹은 ego-browser로 본다. Apple Mail 2장은 사용자가 본다.
