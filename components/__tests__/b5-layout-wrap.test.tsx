// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it, vi } from "vitest";

import { render } from "./helpers/dom";

vi.mock("@/app/(edit)/projects/actions", () => ({ revokeInvitation: vi.fn(), resendInvitation: vi.fn() }));
import { PendingInvitations } from "@/components/members/pending-invitations";
import type { PendingInvitation } from "@/lib/auth/query";
import { m } from "@/lib/i18n";

const strip = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\/.*$/gm, "");

/**
 * **Source 상세의 경로·리포 값이 낱말 한가운데서 꺾이지 않는다** (malmoi#89). `break-all`이 `SinhyeokKang/i18n-many-locales · m` /
 * `aster`로 브랜치 이름을 갈라 두 값처럼 읽혔다. 줄바꿈은 `/`와 ` · ` 뒤에서만 먼저 일어나고(`<wbr>`·공백), 한 조각이 칸보다
 * 길 때만 그 안에서 꺾인다(`overflow-wrap:anywhere`). jsdom은 줄을 재지 못해 클래스와 `<wbr>`를 센다 — 실측은 레이아웃 QA다.
 */
it("경로·리포 셀이 break-all이 아니라 overflow-wrap:anywhere이고 / 뒤에 줄바꿈 기회를 둔다", () => {
  const source = strip(readFileSync(join(process.cwd(), "components/sources/source-detail-modal.tsx"), "utf8"));
  expect(source).not.toMatch(/<dd className="break-all">/);
  expect(source.match(/<dd className="\[overflow-wrap:anywhere\]">/g) ?? []).toHaveLength(2);
  expect(source).toMatch(/<wbr \/>/);
});

/**
 * **잘린 `Invited by …`의 전문이 닿는다** (malmoi#90). 1280에서 그 칸이 112px라 12자 이름부터 잘리고, 초대한 사람을 말하는 자리가
 * 페이지에 그 칸뿐이었다. 잘림을 받되 전문을 `title`로 든다(보이는 문장이 곧 접근 이름이라 스크린리더는 원래 전문을 읽는다).
 */
it("초대한 사람 칸이 잘려도 title로 전문을 든다", async () => {
  const invite: PendingInvitation = { id: "i1", emailLabel: "t***@example.com", readable: true, role: "EDITOR", expiresAt: new Date("2026-09-24T00:00:00Z"), invitedByName: "SinhyeokKang" };
  await render(<PendingInvitations slug="acme" invitations={[invite]} role="OWNER" now={new Date("2026-09-17T00:00:00Z")} headingId="h" />);
  const text = m.members.pending.invitedBy("SinhyeokKang");
  const cell = [...document.querySelectorAll<HTMLElement>(".truncate")].find(node => node.textContent === text);
  expect(cell?.getAttribute("title")).toBe(text);
});
