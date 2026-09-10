import { expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { PrismaClient } from "@/generated/prisma/client";
const finish = vi.hoisted(() => vi.fn());
vi.mock("../store", () => ({ finishRevocation: finish }));
import { withRevocation, authorizeRevocation } from "../http";
const db = {} as PrismaClient;
const account = { provider: "github", providerAccountId: "gh" };
const request = (path = "/api/auth/callback/github?state=s", cookie = "malmoi-session-revocation=nonce; authjs.session-token=raw") => new NextRequest(`http://localhost${path}`, { headers: { cookie } });
it("ordinary login and unrelated auth routes pass through untouched", async () => {
  for (const req of [request(undefined, ""), request("/api/auth/session")]) {
    const response = new Response(null, { status: 204 });
    expect(await withRevocation(req, async () => { expect(await authorizeRevocation(db, account)).toBeNull(); return response; })).toBe(response);
  }
});
it("verified callback returns fixed URL and clears current session only after committed success", async () => {
  finish.mockResolvedValue("revoked");
  const response = await withRevocation(request(), async () => {
    expect(await authorizeRevocation(db, account)).toBe("/?sessions=revoked");
    return Response.redirect("http://localhost/?sessions=revoked");
  });
  expect(finish).toHaveBeenLastCalledWith(db, { nonce: "nonce", sessionToken: "raw", state: "s", ...account });
  expect(response.headers.get("location")).toBe("http://localhost/?sessions=revoked");
  expect(response.headers.getSetCookie().some(c => c.startsWith("authjs.session-token=") && c.includes("Max-Age=0"))).toBe(true);
  expect(response.headers.getSetCookie().some(c => c.startsWith("malmoi-session-revocation=") && c.includes("Max-Age=0"))).toBe(true);
});
it("a forged success callback URL or early Auth.js error never becomes success", async () => {
  for (const location of ["http://localhost/?sessions=revoked", "http://localhost/?error=CallbackRouteError"]) {
    const response = await withRevocation(request(), async () => Response.redirect(location));
    expect(response.headers.get("location")).toBe("http://localhost/account?sessionRevocation=unavailable");
    expect(response.headers.getSetCookie().some(c => c.startsWith("authjs.session-token="))).toBe(false);
  }
});
it("failures preserve session and concurrent requests never share an outcome", async () => {
  finish.mockImplementation(async (_db, input) => input.providerAccountId === "gh" ? "revoked" : "wrong-account");
  const responses = await Promise.all(["gh", "other"].map(providerAccountId => withRevocation(request(), async () => {
    const url = await authorizeRevocation(db, { ...account, providerAccountId });
    return Response.redirect(`http://localhost${url}`);
  })));
  expect(responses.map(r => r.headers.get("location"))).toEqual(["http://localhost/?sessions=revoked", "http://localhost/account?sessionRevocation=wrong-account"]);
  expect(responses[1]!.headers.getSetCookie().some(c => c.startsWith("authjs.session-token="))).toBe(false);
});
it("secure callback uses secure proof and session cookies", async () => {
  finish.mockResolvedValue("revoked");
  const req = new NextRequest("https://mal-moi.com/api/auth/callback/github?state=s", { headers: { cookie: "__Host-malmoi-session-revocation=secure-nonce; __Secure-authjs.session-token=secure-raw" } });
  const response = await withRevocation(req, async () => { await authorizeRevocation(db, account); return Response.redirect("https://mal-moi.com/?sessions=revoked"); });
  expect(finish).toHaveBeenLastCalledWith(db, expect.objectContaining({ nonce: "secure-nonce", sessionToken: "secure-raw" }));
  expect(response.headers.getSetCookie().some(c => c.startsWith("__Host-malmoi-session-revocation=") && c.includes("Secure"))).toBe(true);
});

it("a known revocation state with a missing proof cookie cannot run a normal login", async () => {
  finish.mockResolvedValueOnce("invalid");
  const response = await withRevocation(request(undefined, "authjs.session-token=raw; malmoi-revocation-state=encrypted-state"), async () => {
    expect(await authorizeRevocation(db, account)).toBe("/account?sessionRevocation=invalid");
    return Response.redirect("http://localhost/account?sessionRevocation=invalid");
  });
  expect(response.headers.get("location")).toContain("sessionRevocation=invalid");
});
it("a retained callback destination still marks intent after proof deletion", async () => {
  finish.mockResolvedValueOnce("invalid");
  const response = await withRevocation(request(undefined, "authjs.callback-url=http%3A%2F%2Flocalhost%2Faccount%3FsessionRevocation%3Dexpired"), async () => {
    expect(await authorizeRevocation(db, account)).toBe("/account?sessionRevocation=invalid");
    return new Response(null);
  });
  expect(response.headers.get("location")).toContain("sessionRevocation=invalid");
});
it("HTTPS proxy callback reads secure cookies even if its internal URL is HTTP", async () => {
  finish.mockResolvedValueOnce("revoked");
  const req = new NextRequest("http://mal-moi.com/api/auth/callback/github?state=s", { headers: { "x-forwarded-proto": "https", cookie: "__Host-malmoi-session-revocation=nonce; __Secure-authjs.session-token=raw" } });
  const response = await withRevocation(req, async () => { await authorizeRevocation(db, account); return new Response(null); });
  expect(response.headers.get("location")).toBe("https://mal-moi.com/?sessions=revoked");
  expect(finish).toHaveBeenLastCalledWith(db, expect.objectContaining({ nonce: "nonce", sessionToken: "raw" }));
});
it("provider cancellation is distinct from a storage outage and preserves the session", async () => {
  const response = await withRevocation(request("/api/auth/callback/github?error=access_denied"), async () => Response.redirect("http://localhost/?error=AccessDenied"));
  expect(response.headers.get("location")).toBe("http://localhost/account?sessionRevocation=cancelled");
  expect(response.headers.getSetCookie().some(c => c.startsWith("authjs.session-token="))).toBe(false);
});
