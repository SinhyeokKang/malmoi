# Invitation email — design

기준은 [spec.md](./spec.md)다. 멤버 초대 UI·Server Action만 바꾸며 push·편집 값·pull·export는 영향 없다. 상태를 줄이는 사용자 위임에 따라 **요청 전체 사전 검증 + 전체 DB 저장 + 한 번의 메일 배치 요청**으로 구성한다. Pending Resend는 유지한다.

## 1. 변경 경계

- `app/(edit)/projects/actions.ts`: `createInvitation`을 `{ slug, recipients: [{ email, role }] }`의 `createInvitations`로 전환한다. 기존 호출부·테스트도 바꾸고 사용되지 않는 단건 Action은 제거한다.
- 같은 파일에 `resendInvitation({ slug, invitationId })`를 둔다. 기존 OWNER 인가·프로젝트 잠금·발급 로직을 공유한다. 임의 이메일/역할을 클라이언트에서 받지 않는다.
- `components/members/invite-modal.tsx`: 다중 입력 폼. 성공은 닫기, 오류는 폼 안. 성공 링크 화면을 제거한다.
- `components/members/pending-invitations.tsx`: 역할 칩 뒤 Resend, 마지막 Revoke. 원문 주소·발송 배지는 추가하지 않는다.
- 순수 판정과 Resend 호출은 `lib/invitation-email/`에 둔다. 새 SDK·메일 프레임워크·공급자 추상화는 없다. native fetch를 쓴다.
- 기존 `app/invite/actions.ts`의 수락 판정은 변경하지 않고 회귀로 보호한다.

## 2. 순수 함수 — /tdd 대상

| 대상 | 계약 | 검증 |
|---|---|---|
| `recipients.ts` | 여러 주소 파싱·정규화·행별 역할 보존·입력 검증 | 빈 행, 쉼표/줄바꿈/공백 붙여 넣기, 중복·역할 충돌, 한도 |
| `plan.ts` | 전체 입력·기존 멤버·발급 기록·현재 시각 → 허용 또는 행 오류/제한 시각 | 60초 정각, 20번째/21번째, 잔량 부족, 한 명 거부 시 전체 차단 |
| `message.ts` | origin·수신자·토큰·from → 개인별 메일 payload | 본문 URL 한 줄, 수신자 한 명, CC/BCC 없음 |
| `config.ts` | env 값 → ready/unavailable | 일부 누락, 잘못된 origin, prod/dev 오배선 |
| `result.ts` | HTTP 응답·요청 수 → accepted/rejected/unknown | 유효한 전체 id 목록, 명시적 거부, timeout·5xx·불완전 응답 |

순수 함수는 DB·env 읽기·fetch·React를 import하지 않는다. 실제로 쓰는 함수만 분리하고, 주소별 발송 상태 머신이나 성공자 집계 헬퍼는 만들지 않는다.

## 3. 발급과 Resend — 스키마 변경 없음

`ProjectInvitation.createdAt`·`projectId`·`emailLookup`과 기존 Project 행 잠금을 쓴다. 새 테이블·컬럼·마이그레이션은 없다.

1. 세션·`member:manage` 인가, 입력, 메일 설정을 검증한다. 설정이 없으면 **쓰기 전에** unavailable이다.
2. 배열은 1~20주소다(시간당 상한에 맞춘 구현 제한). 서버는 빈 배열·잘못된 주소/역할·정규화한 중복을 거부한다. UI의 완전히 빈 행은 전송 전 제외한다. 일부 오류가 있는 주소를 조용히 빼고 보내지 않는다.
3. Project 잠금 뒤 현재 시각을 잡고, 현재 멤버 수·각 대상의 이미 멤버 여부·최근 발급·프로젝트 한 시간 발급 수를 읽는다. 기존 멤버 상한 판정을 유지한다. 대기 초대나 입력 행을 좌석 예약으로 계산하지 않는다.
4. **하나라도 거부면 회전/생성/사건 모두 없음.** 오류 대상의 입력 인덱스만 UI에 돌려 수정하게 한다. 요청 전체가 시간당 잔량을 넘으면 전체를 제한한다. 배열 순서로 일부를 보내지 않는다.
5. 모두 통과하면 같은 트랜잭션에서 각 주소의 미수락 토큰 회전·새 초대·`member.invited` 사건을 기록한다. `createdAt`은 판정 시각을 사용한다. DB 오류는 전체 롤백한다.
6. 발급 건수로 제한을 예약한다. 3명은 3건이고 메일 실패도 반환하지 않는다. 제한 조회는 수락/철회/만료된 기록도 포함한다. 요청 전체의 `retryAt`은 주소별 60초와 요청 수를 수용할 프로젝트 시간창을 모두 만족할 시각이다.

**Resend:** 인가된 projectId와 invitationId로 행을 조회하고 저장된 주소·역할을 서버에서 읽는다. Project 잠금 뒤에도 대상이 미수락·미만료인지 다시 확인한다. 철회/수락/다른 재발급으로 닫힌 id면 쓰기 없이 거부한다. 같은 제한 함수를 통과한 뒤 새 초대를 만들고 옛 링크를 만료시킨다. 만료는 새 발급부터 7일, invitedBy는 현재 OWNER다. 주소 복호화 실패도 쓰기 전에 거부한다. 서버의 주소 원문을 Pending props에 노출하지 않는다.

동시 Resend·Revoke·수락 경합은 잠금과 기존 수락 CAS 회귀로 검증한다. UI에서 Revoke를 잠그는 것만으로 서버 경합이 해결됐다고 보지 않는다.

## 4. 외부 발송과 응답

commit 뒤 서버 메모리의 주소·토큰으로 `POST https://api.resend.com/emails/batch`를 **한 번 await**한다. 단건 Resend도 메시지 하나의 같은 경로다. DB 잠금 안 네트워크 호출·fire-and-forget은 없다.

- 한 메시지의 `to`는 한 명, `text`는 `INVITATION_EMAIL_ORIGIN + routes.invite(token)` 한 줄이다. 제목은 `You're invited to malmoi` 기본안. HTML·CC/BCC·첨부·추적은 없다.
- Bearer 키와 서버 생성 UUID의 `Idempotency-Key: invitation-batch/<uuid>`를 쓴다. 10초 timeout, 자동 재시도 0회. 멱등 키는 새로운 발급 요청 간 중복을 없애는 장치가 아니다.
- 2xx와 요청 수만큼의 유효 id 목록을 확인한 때만 accepted다. 명시적으로 요청을 거부한 응답은 rejected, timeout·네트워크·5xx·해석 불가/불완전 결과는 unknown이다. 공급자의 배달 원자성·대상별 성공을 추정하지 않는다.
- 서버 결과는 **요청 단위** `accepted(count)` / `blocked(code, rowErrors?, retryAt?)` / `email-error(rejected|unknown, retryAt)`다. Resend 성공에는 서버 마스킹 라벨을 추가한다. 클라이언트는 발송 상태 배열·토큰·URL을 받지 않는다.
- DB 저장 뒤 발송 실패를 생성 실패로 바꾸지 않는다. 오류 메시지는 “초대 생성 후 메일 요청 실패” 또는 “발송 결과 미확인”이다. 이후 revalidate 실패도 이미 관측한 결과를 뒤집지 않는다.
- 외부 결과는 폼 안내 또는 토스트로 전달하고 Pending을 갱신한다. Resend는 새 행 id로 교체되므로 **메시지를 옛 행에만 매달지 않는다**. 목록 재검증 뒤에도 부모가 토스트/안내를 전달한다.
- 활동 사건은 초대 생성 사실만 기록한다. 별도 메일 사건/저장 상태는 없다. 로그는 단계·초대/요청 id·정규화한 결과만 허용하고 주소·본문·토큰·API 키·공급자 오류 원문은 남기지 않는다.

DB+메일을 분산 트랜잭션으로 만들지 않는다. commit 뒤 프로세스 종료면 미발송 Pending이 남는다. 결과 유실 후 다시 보내면 일부 수신자가 메일을 두 번 받을 수도 있다. 최신 링크만 유효하고 OWNER는 Pending Resend로 복구한다. 원문 저장·자동 복구 큐·부분 배달 복원은 없다.

## 5. 환경과 불변식

새 변수: `RESEND_API_KEY`, `INVITATION_EMAIL_FROM`, `INVITATION_EMAIL_ORIGIN`. `lib/env.ts`로 읽고 `.env.example`에 설명한다. `.env.local`은 에이전트가 편집하지 않는다. 설정 읽기는 요청 시 수행하고 앱 부팅·로그인을 막지 않는다. 설정 누락/잘못됨은 발급·발송만 막는다.

prod origin은 `https://mal-moi.com`, preview는 `https://dev.mal-moi.com`으로 환경과 대조한다. 로컬은 localhost/127.0.0.1만 허용하고 기본은 미설정으로 발송하지 않는다. 경로·query·fragment·userinfo가 있는 origin과 prod/dev 오배선을 거부한다. 요청 Host나 클라이언트 URL로 메일 링크를 만들지 않는다.

발신 도메인 SPF·DKIM·DMARC와 open/click tracking 비활성화를 운영 설정에서 검증한다. 수신 주소·초대 링크가 Resend로 나가는 새 전송을 실제 개인정보 방침과 운영 문서에 반영한다. 공급자 보존 기간은 실제 설정을 확인해 적는다.

ARCHITECTURE §0의 export 결정성·병합 없음은 영향 없다. 인가된 projectId 범위, ProjectMember 인가, 실패/미확인을 성공으로 숨기지 않는 경계는 유지한다. 초대 해시 저장·검증 이메일 대조·수락 CAS도 유지한다.

## 6. UI — 폼 하나, 요청 단위 피드백

- `OnboardingModal` 껍데기: 최대 폭 1024, 화면 여백 48, radius 16, 내부 좌우32, 라이트 테마. 본문 수신자 목록만 스크롤하고 열 머리·Add another·footer는 유지한다.
- 행은 Email flex:1 / Role 168 / Remove 36, 간격8·행 사이10. 기존 Input·Select·Button을 쓴다. 컨트롤36, 하단 버튼40. 역할 설명은 메뉴 둘째 줄에만 둔다.
- 첫 이메일에 포커스, 새 행은 Editor, Enter는 행 추가이며 전체 제출은 하지 않는다. 버튼의 form 연결과 키보드 활성화는 유지한다. IME 조합 중 Enter는 가로채지 않는다. 마지막 빈 행의 제거는 비활성화할 수 있으나 입력한 행은 지울 수 있다.
- 중복/오타는 행 아래, 전체 실패/제한은 폼의 Alert 한 곳에 표시한다. 오류 시 입력 유지, 첫 문제 행으로 포커스. 오류 행을 제거해도 성공 토스트가 뜨지 않는다.
- 전송 중 입력·행 변경·X/Esc/backdrop을 잠근다. 버튼은 **기존 라벨+스피너**, `Sending invitations…`는 footer 상태 슬롯이다. 버튼 폭을 흔들거나 loadingLabel을 새로 만들지 않는다. 응답/통신 오류 시 잠금을 해제한다.
- 전체 accepted면 닫기+루트 Sonner 토스트, Invite 버튼 포커스 복귀. 1명이면 `Invitation sent`, 여러 명이면 `Invitations sent to N people`. 입력 이메일을 토스트에 추가로 노출할 필요는 없다.
- 오류면 별도 화면 없이 폼을 유지한다. 제한은 서버 시각을 문장으로 안내한다. 초 단위 카운트다운·대상별 재시도 가능 수·성공자 블록은 없다. 수정 후 다시 제출할 때 서버가 재검사한다.
- unknown은 “발송 결과를 확인하지 못했습니다. 일부 메일이 도착했을 수 있으며 다시 보내면 이전 링크가 만료됩니다” 의미의 영어 안내다. 성공 인원 수를 추정하지 않는다.
- Pending의 `Resend`는 OWNER만 보며 역할 칩 뒤·Revoke 앞에 둔다. 진행 중 해당 행의 Resend/Revoke만 잠그고 버튼 폭을 유지한다. 성공은 서버 마스킹 라벨의 토스트다. **오류는 Pending 카드 머리 아래, 카드 안 Alert 하나**로 표시한다(수정본 `1l`). 행 id에 묶지 않고 대상 라벨을 포함하며, 목록 갱신 뒤에도 유지한다. X 또는 다음 Resend/Revoke 시작 시 지운다. 새 모달·확인창·상시 발송 배지·복사 버튼은 없다.
- 설정이 없는 상태는 “Email is unavailable right now” 안내다. 수동 링크 폼으로 전환하지 않는다.

수정본의 문구는 아래만 구현 시 보정한다. 새 상태나 디자인 재작업은 필요 없다.

- 한도는 **발송 성공 수가 아니라 초대 발급 수**다. `were sent in the last hour`는 `invitations were created in the last hour` 의미로 바꾼다. 메일이 실패해도 제한을 사용한다는 계약과 맞춘다.
- `Try Resend again in a few minutes` 같은 임의 시간 대신 서버의 `retryAt`을 사용한다. 주소 제한과 프로젝트 제한 중 더 늦은 시각을 안내한다.
- `workspace`는 제품 계층에 없으므로 설정 없음은 기존 `Email is unavailable right now`를 쓴다.
- `Nothing was sent`는 **이번 요청의 사전 거부**에만 적용한다. 앞선 요청이 unknown이었을 수도 있으므로 `Nothing was sent by this request`로 범위를 명확히 한다. 메일 단계의 결과 미확인에는 쓰지 않는다.

## 7. 과거 함정과 검증

[POSTMORTEM.md](../../POSTMORTEM.md)의 2026-09-06 거부 문구 미도달: Action 반환만 검사하지 말고 폼/Resend 오류가 재검증 뒤에도 실제로 보이는지 검증한다. 2026-09-09 마스킹 사고: Pending에 원문 주소를 내려보내지 않는다. 2026-09-10 초대 취소 경합: 기존 수락의 expiresAt 동등 조건을 유지하고 Resend와 교차시킨다.

## 8. 외부 계약 근거

2026-09-23 확인. 구현 시 오류 의미와 응답 형식을 다시 대조한다.

- [Resend Send Batch Emails](https://resend.com/docs/api-reference/emails/send-batch-emails): 개인별 메시지 배열과 `/emails/batch`.
- [Resend Send Email](https://resend.com/docs/api-reference/emails/send-email): plain-text 메시지 필드.
- [Resend Idempotency Keys](https://resend.com/docs/dashboard/emails/idempotency-keys): 멱등 헤더와 24시간 중복 방어.
- [Resend Verified Domains](https://resend.com/docs/dashboard/domains/introduction): 도메인 인증·추적 설정.
