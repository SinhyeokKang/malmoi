export function connectCookie(secure: boolean) {
  return { name: `${secure ? "__Host-" : ""}malmoi-account-connect`, options: {
    secure, httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 300,
  } };
}
export function connectStateCookie(secure: boolean) {
  return { name: `${secure ? "__Secure-" : ""}malmoi-connect-state`, options: {
    secure, httpOnly: true, sameSite: "lax" as const, path: "/", maxAge: 900,
  } };
}
