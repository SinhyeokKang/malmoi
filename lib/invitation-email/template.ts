/**
 * 초대 메일 HTML — Claude Design 핸드오프 `email/invite.html`(2026-09-23)을 옮긴 것이다. **시안이 정본이다.**
 *
 * ⚠️ 변수는 `{{INVITE_URL}}` 하나다(버튼 · Outlook VML 버튼 · 대체 링크 href · 표시 텍스트 네 자리).
 *   로고 src만 시안의 상대 경로 SVG를 자사 고정 URL PNG로 바꿨다 — 시안 메모가 그렇게 지시한다
 *   (SVG는 Gmail·Outlook이 안 띄운다). 수신자별 값이 없어 열람 추적 픽셀이 되지 않는다.
 * ⚠️ 치환은 `message.ts`가 이스케이프한 값으로만 한다. 여기서 문자열을 조립하지 않는다.
 */
export const INVITATION_EMAIL_HTML = `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>You're invited to malmoi</title>
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
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#ffffff;">You've been invited to a project on malmoi. The link expires in 7 days.&#8199;&#847;&#8199;&#847;&#8199;&#847;&#8199;&#847;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;">
<tr><td class="mm-outer" align="center" style="padding:40px 16px;">
  <!--[if mso]><table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">
    <tr><td style="padding:0 0 16px 0;"><img src="{{LOGO_URL}}" width="32" height="32" alt="malmoi" style="display:block;width:32px;height:32px;border:0;outline:none;text-decoration:none;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:17px;line-height:32px;font-weight:600;color:#0a0a0a;"></td></tr>
    <tr><td style="background-color:#ffffff;border-bottom:1px solid #e5e5e5;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr><td class="mm-card-pad" style="padding:36px 0 32px 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
          <h1 class="mm-h1" style="margin:0 0 12px 0;font-size:24px;line-height:32px;font-weight:600;letter-spacing:-0.01em;color:#0a0a0a;">You're invited to malmoi</h1>
          <p style="margin:0 0 28px 0;font-size:15px;line-height:24px;color:#0a0a0a;">Someone has invited you to join a project on malmoi. Accept the invitation to get started.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px 0;">
            <tr><td align="center" bgcolor="#171717" style="background-color:#171717;border-radius:10px;border:1px solid #171717;">
              <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="{{INVITE_URL}}" style="height:40px;v-text-anchor:middle;width:160px;" arcsize="22%" fillcolor="#171717" strokecolor="#171717"><center style="color:#fafafa;font-family:Arial,sans-serif;font-size:14px;font-weight:500;">Accept invitation</center></v:roundrect><![endif]-->
              <!--[if !mso]><!--><a class="mm-btn" href="{{INVITE_URL}}" target="_blank" style="display:inline-block;padding:10px 16px;min-width:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:20px;font-weight:500;color:#fafafa;text-decoration:none;text-align:center;border-radius:10px;background-color:#171717;">Accept invitation</a><!--<![endif]-->
            </td></tr>
          </table>
          <p style="margin:0 0 6px 0;font-size:13px;line-height:20px;color:#737373;">If the button doesn't work, paste this link into your browser:</p>
          <p style="margin:0 0 28px 0;font-size:13px;line-height:20px;word-break:break-all;overflow-wrap:anywhere;"><a href="{{INVITE_URL}}" target="_blank" style="color:#0a0a0a;text-decoration:underline;">{{INVITE_URL}}</a></p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
            <tr><td style="border-top:1px solid #e5e5e5;padding-top:20px;font-size:13px;line-height:20px;color:#737373;">This link expires in 7 days. To accept, sign in with the email address this invitation was sent to.</td></tr>
          </table>
        </td></tr>
      </table>
    </td></tr>
    <tr><td style="padding:16px 0 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:18px;color:#737373;">If you weren't expecting this invitation, you can ignore this email.</td></tr>
  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>
`;
