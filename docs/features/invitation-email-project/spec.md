# invitation-email-project — spec

## 사용자

**번역 편집자(초대받는 사람)**가 1차 사용자다. 특히 **이미 다른 프로젝트의 멤버인 기존 회원**. OWNER(초대하는 사람)는 간접 수혜자다 — 받는 쪽이 메일을 알아보면 "메일 받았어요?" 왕복이 준다.

## 문제

**코드에서 읽은 사실이다 — 사용자 제보·겪은 사례는 없다.** 아래 효과(알아보기·왕복 감소)는 예상이지 관측이 아니다.

- 초대 메일은 제목·`<title>`·h1이 `You're invited to Malmoi`, 본문이 "Someone has invited you to join a project on Malmoi"뿐이다(`lib/invitation-email/template.ts`·`message.ts`). **어느 프로젝트인지, 어떤 역할인지 메일만으로는 알 수 없다.**
- 기존 회원에게는 "Malmoi에 초대됐다"는 맥락이 틀리다 — 이미 가입해 있고, 받은 것은 **특정 프로젝트**로의 초대다. 두 번째 프로젝트 초대가 첫 초대와 구별되지 않는다.
- 프로젝트·역할은 링크를 열고 **로그인한 뒤에야** 수락 화면의 `InviteProjectCard`에서 보인다(`accept`·`wrong-account` 상태만 — `app/invite/[token]/page.tsx`). 비로그인 수락 화면에는 카드가 없다.

## 뒤집는 근거 (PRODUCT §4.1)

- 원래 결정(2026-09-23, 삭제된 `docs/features/invitation-email/spec.md`)은 "본문은 초대 링크 한 줄 — 서명·프로젝트명·역할·초대한 사람·추적 요소는 넣지 않는다"였고 따로 적힌 이유는 없다. 기대고 있던 것은 **Resend로 보내는 데이터 최소화**(방침이 "the address, the subject and the link"만 공표)다.
- **2026-09-28 사용자 결정으로 뒤집는다** — 수신자가 메일만으로 어느 프로젝트·역할인지 아는 이득이 최소 전송보다 크다고 본다. 늘어나는 전송(Resend로)은 프로젝트 이름·역할·썸네일 URL 셋이고, 초대한 사람(PII)은 여전히 보내지 않는다.
- **도달률 위험은 알고 수용한다** — OWNER 자유 문구가 본문에 든다(썸네일은 로고와 같은 `mal-moi.com`에서 나오므로 다른 호스트 이미지 위험은 없다). 첫 실발송이 새 도메인 평판으로 스팸함에 간 경위가 있다(2026-09-24). 검증 항목으로 두지 않는다(사용자 결정).

### 로그인 전 노출 원칙과의 관계

수락 화면은 **비로그인에게 카드를 일부러 보이지 않는다**(`app/invite/__tests__/screen.test.tsx` "노출을 단계로 가른다", DESIGN 초대 수락 행). 메일은 그 원칙의 **예외로 명시한다** — 수락 화면은 링크를 가진 **누구에게나** 열리지만 메일은 **초대된 주소로만** 간다. 수신자 자신이 이 정보의 대상자이므로 같은 원칙이 걸리지 않는다. 전달된 메일·공유 메일함·Resend 보관 기록은 수신자가 통제하는 경로로 수용한다. **수락 화면 원칙은 그대로 둔다.**

## 완료 조건 (검증 가능)

1. 초대 메일 HTML 본문에 **프로젝트 카드**가 선다: 썸네일 타일 + 프로젝트 이름 + 역할(`Owner`/`Editor`). 수락 화면 카드(`components/invite/project-card.tsx`)에서 국기만 뺀 구성이다. 배치는 h1 → 본문 문장 → 카드 → 버튼.
2. 썸네일이 있으면 `planProjectImageDelete(Project.image)`가 뽑은 키로 **`https://mal-moi.com/api/images/<key>`**(프로덕션 고정, 로고와 같은 호스트)를 `<img>`로 싣는다. 키가 안 나오는 값(`null`·`""`·우리 스토어가 아닌 URL)은 3번 폴백 갈래로 간다. **HTML 소스에 `vercel-storage.com`이 0건이다.** 이미지 뒤에 톤 색을 깔지 않는다(투명 이미지의 배경이 프로젝트마다 달라지지 않게 — `ImageTile`과 같은 판정). 세로·가로로 긴 이미지는 비율을 유지한 채 32 상자 안에 든다.
3. 썸네일이 없으면 `toneOf(name)`의 **-600을 v4 oklch → sRGB 환산한 hex**로 칠한 셀 + `https://mal-moi.com/email/box@2x.png`(흰 Box 글리프, 투명 PNG)를 싣는다. hex는 테스트가 `node_modules/tailwindcss/theme.css`에서 환산한 값과 같다.
4. **제목·`<title>`·h1은 고정 문구 `You're invited to a project on Malmoi`다**, preheader도 고정이다 — 프로젝트 이름·역할이 들어가지 않는다(받은편지함 목록에 OWNER 입력 문구가 서지 않는다).
5. 본문 문장은 `You've been invited to join this project on Malmoi.` 하나다("Someone has"·"Accept the invitation to get started." 제거).
6. 프로젝트 이름은 **grapheme 60개 상한 → HTML 이스케이프** 순으로 지나 들어간다. 판정: (a) 60 grapheme 이하는 렌더 텍스트가 원문과 같다, 61 이상은 앞 59 grapheme + `…`, (b) HTML 소스에 이스케이프 안 된 `<`·`"`·`'`·`&`가 없다, (c) `$&`·`{{INVITE_URL}}`이 든 이름이 문자 그대로 렌더된다(치환 패턴·재치환 없음).
7. **text 파트는 초대 URL 한 줄 그대로다** — 이름·역할을 싣지 않는다.
8. 발급(`createInvitations`)과 재발급(`resendInvitation`) 둘 다 같은 카드를 싣는다. 이름·썸네일은 **`Project` 잠금 안에서 읽은 값**이다. 역할은 발급이 입력 역할, 재발급이 저장된 역할이다.
9. 초대한 사람·추적 요소는 여전히 싣지 않는다. 수신자별 값은 링크와 역할뿐이다.
10. `/privacy`가 참이다: 고친 문장마다 소스 파일:라인과 대조했고, 개정 이력·시행일·`REVISIONS` digest가 움직였다(`policy-gate.test.tsx` green — 이 테스트는 "빠짐"만 잡으므로 대조는 사람이 한다, POSTMORTEM 2026-09-19).
11. PRODUCT §4.1 "프로젝트명·역할·추적을 싣지 않는다"가 새 구성으로 고쳐졌다.
12. `pnpm typecheck` + `pnpm test` + `pnpm test:projects:postgres` + `pnpm build` green.

## 비목표

- **Windows용 Outlook 데스크톱의 썸네일 표시** — WebP를 못 띄워 깨진 이미지 칸이 선다. 수용했다(사용자 결정 2026-09-28). PNG 사본·포맷 교체는 하지 않는다.
- **메일 클라이언트의 다크모드 강제 반전**(Gmail 모바일·Outlook.com) — `color-scheme: light`로 못 막는다. 톤 배경이 밝아져 흰 글리프 대비가 떨어질 수 있다. 기존 로고·버튼과 같은 위험으로 수용한다.
- 비로그인 수락 화면에 카드를 여는 것 — 위 "로그인 전 노출 원칙과의 관계".
- 도달률(받은편지함 도착) 검증.
- 로케일 국기 — 로케일 수만큼 이미지가 늘고 국기 PNG 에셋이 필요하다.
- 초대한 사람 이름 — 발급자 PII가 Resend로 가고, 이름 없는 사용자의 대체 표기가 필요하다.
- 제목·preheader·text 파트의 개인화.
- 이미 보낸 메일의 썸네일 보존 — OWNER가 썸네일을 바꾸면 옛 Blob이 지워져 이전 메일의 이미지가 깨진다(CDN 캐시로 최대 하루 더 보일 수 있다). 메일은 발송 시점 스냅샷이 아니다.
- **dev·preview 메일의 썸네일 표시** — 프로덕션 프록시가 dev 스토어 키를 모르므로 빈 칸(404)이다. 로고·Box PNG와 같은 부류로 수용한다(사용자 결정 2026-09-28).
- 메일 로케일화(en 단일 유지).
- 사용자 가이드 — `guide/setup/members.md`는 메일 본문을 설명하지 않는다 → 영향 없음.
