import { describe, expect, it } from "vitest";

import { discardFingerprint, removalFingerprint } from "@/lib/protection/fingerprint";

import { localeChangeFingerprint, type LocaleChangeFingerprintInput } from "../fingerprint";

const BASE: LocaleChangeFingerprintInput = {
  userId: "owner",
  projectId: "p",
  surfaceId: "s",
  localeCode: "fr",
  change: null,
  surface: { adapterName: "json-catalog", pathTemplate: "web/{locale}.json", basePath: null, baseLocale: "en", declaredBaseLocale: null },
  delivery: { revision: "rev-1", invalidated: false },
  pending: [{ id: "t1", token: "a" }, { id: "t2", token: "b" }],
};

describe("localeChangeFingerprint", () => {
  it("is deterministic and ignores pending order", () => {
    const reversed = { ...BASE, pending: [...BASE.pending].reverse() };
    expect(localeChangeFingerprint(BASE)).toBe(localeChangeFingerprint(reversed));
    expect(localeChangeFingerprint(BASE)).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each<[string, Partial<LocaleChangeFingerprintInput>]>([
    ["user", { userId: "other" }],
    ["project", { projectId: "q" }],
    ["surface", { surfaceId: "t" }],
    ["locale", { localeCode: "de" }],
    ["change row appears", { change: { operation: "ADD", requestedAt: "2026-10-14T00:00:00.000Z" } }],
    ["surface format", { surface: { ...BASE.surface, adapterName: "chrome-locales" } }],
    ["surface path", { surface: { ...BASE.surface, pathTemplate: "app/{locale}.json" } }],
    ["surface base", { surface: { ...BASE.surface, baseLocale: "ko" } }],
    ["declared base", { surface: { ...BASE.surface, declaredBaseLocale: "fr" } }],
    // R-B1 W1 — 미리보기 뒤 Publish가 확인되면 미리보기가 말한 전달 상태와 실제가 갈린다.
    ["delivery revision", { delivery: { revision: "rev-2", invalidated: false } }],
    ["delivery invalidation", { delivery: { revision: "rev-1", invalidated: true } }],
    ["first delivery", { delivery: null }],
    ["new edit", { pending: [...BASE.pending, { id: "t3", token: "c" }] }],
    ["re-edited cell", { pending: [{ id: "t1", token: "a" }, { id: "t2", token: "z" }] }],
  ])("changes when the %s changes", (_label, over) => {
    expect(localeChangeFingerprint({ ...BASE, ...over })).not.toBe(localeChangeFingerprint(BASE));
  });

  it("separates a re-requested change by its request time", () => {
    const first = localeChangeFingerprint({ ...BASE, change: { operation: "ADD", requestedAt: "2026-10-14T00:00:00.000Z" } });
    const again = localeChangeFingerprint({ ...BASE, change: { operation: "ADD", requestedAt: "2026-10-14T00:00:01.000Z" } });
    expect(first).not.toBe(again);
  });

  it("does not collide with id/token boundary shifts", () => {
    const a = localeChangeFingerprint({ ...BASE, pending: [{ id: "a|b", token: "c" }] });
    const b = localeChangeFingerprint({ ...BASE, pending: [{ id: "a", token: "b|c" }] });
    expect(a).not.toBe(b);
  });

  it("treats __proto__ as an ordinary locale code", () => {
    expect(localeChangeFingerprint({ ...BASE, localeCode: "__proto__" })).not.toBe(localeChangeFingerprint(BASE));
  });

  it("never equals the Sync or source-removal approval for the same tokens", () => {
    const removal = removalFingerprint({ userId: "owner", projectId: "p", surfaceId: "s", pending: BASE.pending, localeChanges: [] });
    const discard = discardFingerprint({
      userId: "owner", projectId: "p",
      repository: { repoHost: "github", repositoryId: "1", installationId: "2", gitlabConnectionId: null, repoOwner: "o", repoName: "r", baseBranch: "main" },
      surfaces: [], pending: BASE.pending, localeChanges: [],
    });
    expect(localeChangeFingerprint(BASE)).not.toBe(removal);
    expect(localeChangeFingerprint(BASE)).not.toBe(discard);
  });
});
