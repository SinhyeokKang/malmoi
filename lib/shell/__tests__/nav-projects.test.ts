import { expect, it } from "vitest";
import type { MembershipRow } from "@/lib/keys/query";
import { toNavProjects } from "../nav";
it("멤버십에서 일곱 필드만 전달하고 보관·개수를 변환한다", () => {
  const row: MembershipRow = { slug: "demo", name: "Demo", role: "OWNER", installationId: "private", surfaces: [{ archivedAt: null, lastCommitSha: "private" }], archivedAt: new Date(), image: null, defaultSurfaceSlug: "main", memberCount: 2, sourceCount: 3, keyCount: 4 };
  expect(toNavProjects([row])).toEqual([{ slug: "demo", name: "Demo", role: "OWNER", archived: true, image: null, defaultSurfaceSlug: "main", counts: { members: 2, sources: 3, keys: 4 } }]);
  expect(Object.keys(toNavProjects([row])[0] ?? {}).sort()).toEqual(["archived", "counts", "defaultSurfaceSlug", "image", "name", "role", "slug"]);
  expect(toNavProjects([{ ...row, archivedAt: null }])[0]?.archived).toBe(false);
  expect(toNavProjects([])).toEqual([]);
});
