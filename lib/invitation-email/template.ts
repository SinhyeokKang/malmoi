/**
 * 초대 메일 HTML — Claude Design 핸드오프 `email/invite.html`(2026-09-23)에서 출발했고, dev에 들어간 뒤로는
 * **이 코드가 정본이다**(CLAUDE.md `/design-sync` 절 — 새 시안은 변경 요청이다).
 *
 * ⚠️ 변수는 다섯이고 `message.ts`의 `fill`이 치환한다: `{{LOGO_URL}}` · `{{INVITE_URL}}`(버튼 · Outlook VML
 *   버튼 · 대체 링크 href · 표시 텍스트 네 자리) · `{{PROJECT_NAME}}` · `{{ROLE}}` · `{{TILE}}`. **사용자 값은 정확히
 *   한 번만 들어가고 그 결과를 다시 훑지 않는다** — 연쇄 치환이면 `{{…}}`가 든 프로젝트 이름이 뒤 치환에서 다시
 *   전개된다. 다시 채우는 것은 `{{TILE}}` 하나뿐이다: 그 자리에 아래 조각(우리 상수) 둘 중 하나를 넣고 조각 안의
 *   `{{TILE_SRC}}`·`{{TILE_BG}}`를 풀며, 그 값도 상수 URL · allowlist를 지난 키 · hex뿐이다.
 * ⚠️ 원격 이미지는 전부 `mal-moi.com` 고정 경로다(로고 · Box PNG · `/api/images/<key>`). 썸네일은 프로젝트
 *   단위 값이라 수신자를 가르지 않아 열람 추적 픽셀이 되지 않는다.
 * ⚠️ 치환은 `message.ts`가 이스케이프한 값으로만 한다. 여기서 문자열을 조립하지 않는다.
 * ⚠️ 본문 칼럼은 320이다 — `/signin` 폼 칼럼(`auth-column.tsx`의 `w-[320px]`)과 같고, 카드·버튼이 그 폭을 채운다
 *   (2026-10-06 사용자 — 옛 560). Outlook VML 버튼은 %를 못 받아 `width:320px`를 박는다 — 칼럼을 바꾸면 같이 바꾼다.
 * ⚠️ 본문은 가운데 정렬이지만 **카드 안은 예외다** (2026-10-06 사용자) — 본문 칸의 `text-align:center`가 상속되므로
 *   카드 칸이 `text-align:left`를 다시 걸어 타일·이름이 왼쪽에 선다.
 * ⚠️ 테두리+radius를 든 칸의 표(카드·버튼)는 `border-collapse:separate`다 — 전역 `table{border-collapse:collapse}` 아래선
 *   radius가 테두리에 안 걸려 각진 1px 테두리와 모서리 흰 틈이 남는다(2026-10-04 실측 — 버튼에만 빠져 있었다).
 */

/**
 * ⚠️ **타일 두 갈래는 32×32 고정 중첩 표 안에 선다** (malmoi#140 — Gmail iOS에서 폴백 타일이 세로로 늘었다).
 * 옆 텍스트 열(이름 20 + 1 + 역할 17 = 38px)이 32보다 높고 `<td height>`는 최소값이라, 타일 셀이 카드 행에
 * 직접 붙으면 행과 같이 38로 늘어난다. 행에 붙는 바깥 셀은 색 없이 세로 가운데 정렬만 하고, 색·이미지는 안쪽
 * 셀이 든다. 안쪽 셀의 `line-height:0;font-size:0`은 깨진 이미지 자리표시·공백이 줄 높이로 셀을 미는 것을,
 * `overflow:hidden`은 넘치는 자리표시를 막는다(메일 클라이언트마다 지원이 갈린다 — 1차 방어는 중첩 표다).
 */
/**
 * 썸네일 갈래. ⚠️ **width·height 속성이 없다** — `max-width`·`max-height` 32가 크기를 든다. 지금 원본은 메일 경로
 * (`/api/images/email/…` — `emailThumbnailPng`)가 96 정사각 PNG로 주지만, 그 전엔 `normalizeImage`(`fit: "inside"`)의 긴 원본이
 * 와서 `width="32"`가 그것을 `max-height`에 눌러 찌그러뜨렸다(메일은 `object-fit`을 무시한다).
 * radius는 `<img>`에 건다(Gmail은 `<td>` radius가 자식을 자르지 않는다). 셀에 색을 깔지 않는다 — 투명
 * 이미지의 배경이 프로젝트마다 달라지면 안 된다(`ImageTile`과 같은 판정). `alt=""`는 이름이 바로 옆이라서다.
 */
export const INVITATION_EMAIL_TILE_IMAGE = `<td width="32" align="center" valign="middle" style="width:32px;"><table role="presentation" width="32" height="32" cellpadding="0" cellspacing="0" border="0" style="width:32px;height:32px;border-collapse:separate;"><tr><td width="32" height="32" align="center" valign="middle" style="width:32px;height:32px;max-height:32px;line-height:0;font-size:0;overflow:hidden;"><img src="{{TILE_SRC}}" alt="" style="display:block;width:auto;height:auto;max-width:32px;max-height:32px;border:0;outline:none;text-decoration:none;border-radius:8px;"></td></tr></table></td>`;

/** 폴백 갈래 — 톤 셀 + 흰 Box 글리프(파일은 2x인 32×32). radius는 색을 든 안쪽 셀에 건다. */
export const INVITATION_EMAIL_TILE_FALLBACK = `<td width="32" align="center" valign="middle" style="width:32px;"><table role="presentation" width="32" height="32" cellpadding="0" cellspacing="0" border="0" style="width:32px;height:32px;border-collapse:separate;"><tr><td width="32" height="32" align="center" valign="middle" bgcolor="{{TILE_BG}}" style="width:32px;height:32px;max-height:32px;line-height:0;font-size:0;overflow:hidden;background-color:{{TILE_BG}};border-radius:8px;"><img src="{{TILE_SRC}}" width="16" height="16" alt="" style="display:block;width:16px;height:16px;border:0;outline:none;text-decoration:none;"></td></tr></table></td>`;

export const INVITATION_EMAIL_HTML = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>You're invited to a project on Malmoi</title>
<style>
  body{margin:0;padding:0;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
  table{border-collapse:collapse}
  a.mm-btn:hover{background:#262626!important}
  @media only screen and (max-width:600px){
    .mm-outer{padding:16px 12px!important}
    .mm-card-pad{padding:28px 0!important}
    .mm-h1{font-size:22px!important;line-height:30px!important}
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:#ffffff;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#ffffff;">You've been invited to a project on Malmoi. The link expires in 7 days.&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;">
<tr><td class="mm-outer" align="center" style="padding:40px 16px;">
  <!--[if mso]><table role="presentation" width="320" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:320px;width:100%;">
    <tr><td align="center" style="padding:0;"><img src="{{LOGO_URL}}" width="40" height="40" alt="Malmoi" style="display:block;margin:0 auto;width:40px;height:40px;border:0;outline:none;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:17px;line-height:40px;font-weight:600;color:#0a0a0a;"></td></tr>
    <tr><td style="background-color:#ffffff;border-bottom:1px solid #e5e5e5;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td class="mm-card-pad" align="center" style="padding:36px 0 32px 0;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          <h1 class="mm-h1" style="margin:0 0 12px 0;font-size:24px;line-height:32px;font-weight:600;letter-spacing:-0.01em;color:#0a0a0a;">You're invited to a project on Malmoi</h1>
          <p style="margin:0 0 16px 0;font-size:15px;line-height:24px;color:#0a0a0a;">You've been invited to join this project on Malmoi.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 28px 0;border:1px solid #e5e5e5;border-radius:12px;border-collapse:separate;">
            <tr><td style="padding:12px;text-align:left;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  {{TILE}}
                  <td style="padding:0 0 0 12px;text-align:left;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;letter-spacing:0.02em;font-weight:400;word-break:break-word;overflow-wrap:anywhere;">
                    <div style="font-size:14px;line-height:20px;color:#0a0a0a;">{{PROJECT_NAME}}</div>
                    <div style="margin-top:1px;font-size:13px;line-height:17px;color:#737373;">{{ROLE}}</div>
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin:0 0 28px 0;border-collapse:separate;">
            <tr><td align="center" bgcolor="#171717" style="background-color:#171717;border-radius:10px;border:1px solid #171717;">
              <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="{{INVITE_URL}}" style="height:40px;v-text-anchor:middle;width:320px;" arcsize="22%" fillcolor="#171717" strokecolor="#171717"><center style="color:#fafafa;font-family:Arial,sans-serif;font-size:14px;font-weight:500;">Accept invitation</center></v:roundrect><![endif]-->
              <!--[if !mso]><!--><a class="mm-btn" href="{{INVITE_URL}}" target="_blank" style="display:block;padding:10px 16px;min-width:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;font-weight:500;color:#fafafa;text-decoration:none;text-align:center;border-radius:10px;background-color:#171717;">Accept invitation</a><!--<![endif]-->
            </td></tr>
          </table>
          <p style="margin:0 0 6px 0;font-size:13px;line-height:20px;color:#737373;">If the button doesn't work, paste this link into your browser:</p>
          <p style="margin:0 0 28px 0;font-size:13px;line-height:20px;word-break:break-all;overflow-wrap:anywhere;"><a href="{{INVITE_URL}}" target="_blank" style="color:#0a0a0a;text-decoration:underline;">{{INVITE_URL}}</a></p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td align="center" style="border-top:1px solid #e5e5e5;padding-top:20px;text-align:center;font-size:13px;line-height:20px;color:#737373;">This link expires in 7 days. To accept, sign in with the email address this invitation was sent to.</td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
    <tr><td align="center" style="padding:16px 0 0 0;text-align:center;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#737373;">If you weren't expecting this invitation, you can ignore this email.</td></tr>
  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>
`;
