import { describe, expect, it } from "vitest";

import { localeChangeFingerprint, type LocaleChangeFingerprintInput } from "@/lib/locales/fingerprint";
import { discardFingerprint, type DiscardFingerprintInput } from "@/lib/protection/fingerprint";
import { publishFingerprint } from "@/lib/publish/fingerprint";
import type { PullState } from "@/lib/pull/run";
import { deliveryContextFingerprint, type DeliveryContextInput } from "@/lib/translations/context";

/**
 * **지문에 basePath를 묶는다 — 단 null이면 바이트가 그대로다** (mobile-strings design §2 "지문·대조에 드는 자리").
 *
 * 기준 언어 경로가 바뀌면 같은 소스라도 다른 파일을 쓴다 — 승인·전달 확인이 옛 경로로 받은 것이면 낡아야 한다. 그런데
 * `deliveryContextFingerprint`는 **저장된다**(`DeliveryConfirmation`): null 표면의 바이트가 바뀌면 배포 순간 기존 확인이 전부 무효가 된다.
 * 그래서 네 지문 모두 basePath가 있을 때만 튜플 끝에 붙인다. 아래 기댓값은 컬럼 도입 전 코드로 잰 값이다.
 */
const BASE_PATH = "app/src/main/res/values/strings.xml";

describe("deliveryContextFingerprint", () => {
  const input: DeliveryContextInput = {
    repoHost: "github", repositoryId: "100", baseBranch: "main",
    surface: { id: "s1", importRevision: 3, adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json", nested: false, nestedByPath: null, baseLocale: "en", basePath: null },
  };

  it("basePath가 null이면 저장된 바이트 그대로다", () => {
    expect(deliveryContextFingerprint(input)).toBe("e9b4d80c75530e9f5b56b1aa9b475a914c7653c77f20863cc89ce64bcbe4bba2");
  });

  it("basePath가 있으면 달라진다", () => {
    expect(deliveryContextFingerprint({ ...input, surface: { ...input.surface, basePath: BASE_PATH } })).not.toBe(deliveryContextFingerprint(input));
  });
});

describe("discardFingerprint", () => {
  const input: DiscardFingerprintInput = {
    userId: "owner", projectId: "p1",
    repository: { repositoryId: "123", repoHost: "github", gitlabConnectionId: null, installationId: "456", repoOwner: "o", repoName: "r", baseBranch: "main" },
    surfaces: [{ id: "s1", importRevision: 3, adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en", basePath: null }],
    pending: [{ id: "t1", token: "a" }],
    localeChanges: [],
  };

  it("basePath가 null이면 바이트 그대로다", () => {
    expect(discardFingerprint(input)).toBe("5cb9b701e4d075da0e76389309919d4f1728f8cf965770c29d02f79190126b9b");
  });

  it("basePath가 있으면 달라진다", () => {
    const moved = { ...input, surfaces: input.surfaces.map((s) => ({ ...s, basePath: BASE_PATH })) };
    expect(discardFingerprint(moved)).not.toBe(discardFingerprint(input));
  });
});

describe("localeChangeFingerprint", () => {
  const input: LocaleChangeFingerprintInput = {
    userId: "owner", projectId: "p1", surfaceId: "s1", localeCode: "ko", change: null,
    surface: { adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en", declaredBaseLocale: null, basePath: null },
    delivery: null, pending: [],
  };

  it("basePath가 null이면 바이트 그대로다", () => {
    expect(localeChangeFingerprint(input)).toBe("e5ffd8e28b2f30730689149ea9133c3eb1853320bf4c983c7a92cd17604b347a");
  });

  it("basePath가 있으면 달라진다", () => {
    expect(localeChangeFingerprint({ ...input, surface: { ...input.surface, basePath: BASE_PATH } })).not.toBe(localeChangeFingerprint(input));
  });
});

describe("publishFingerprint", () => {
  const state = (basePath: string | null): PullState => ({
    project: { id: "p1", slug: "acme", repoOwner: "o", repoName: "r", baseBranch: "main", repoHost: "github", gitlabConnectionId: null, installationId: "i1", repositoryId: "r1", lastPulledAt: null },
    surfaces: [{ id: "s1", slug: "web", adapterName: "json-catalog", pathTemplate: "i18n/{locale}.json", nested: false, nestedByPath: null, baseLocale: "en", basePath, localeCodes: ["en"], keys: [] }],
    maxUpdatedAt: null, unpublished: 0, pendingEdits: [], deliveryContexts: [],
  });

  it("basePath가 null이면 바이트 그대로다", () => {
    expect(publishFingerprint(state(null), "head")).toBe("b1d9643f09916126320d3913ce6777877cd7b22ed50d83ffffe4547393a8d151");
  });

  it("basePath가 있으면 달라진다", () => {
    expect(publishFingerprint(state(BASE_PATH), "head")).not.toBe(publishFingerprint(state(null), "head"));
  });
});
