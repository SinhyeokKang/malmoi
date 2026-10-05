import { describe, expect, it } from "vitest";

import { en } from "@/messages/en";
import { es } from "@/messages/es";

/**
 * `PanelFacts`의 라벨 열은 96px(13px 글자)이다 — jsdom은 폭을 못 재므로 글자 수 상한으로 막는다.
 * 라틴 13px 평균 폭 ≈ 6.5px → 96px에 약 14자. `Correo electrónico`(18자)가 두 줄이 됐다(#185).
 */
const MAX_LATIN_CHARS = 14;

describe("PanelFacts 96px 라벨 열 — es 라벨은 한 줄에 든다", () => {
  const labels = (m: typeof es | typeof en) => [
    m.account.profile.avatar, m.account.profile.name, m.account.profile.email,
    m.settings.general.thumbnail, m.settings.general.name, m.settings.general.address,
  ];

  it("es", () => {
    for (const label of labels(es)) expect(label.length, label).toBeLessThanOrEqual(MAX_LATIN_CHARS);
  });

  it("en", () => {
    for (const label of labels(en)) expect(label.length, label).toBeLessThanOrEqual(MAX_LATIN_CHARS);
  });
});
