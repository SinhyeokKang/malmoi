import { expect, it } from "vitest";

import type { ConnectionHealth } from "@/lib/github-connect/health";
import { en } from "@/messages/en";

import { connectionReason } from "../connection-reason";

/**
 * 번역 화면의 연결 사유 (malmoi#160). 끊긴 프로젝트에서 Publish·Sync가 꺼지는데 사유가 "currently unavailable"뿐이었다 — 이 화면엔
 * Home의 연결 배너가 없다. Home 배너 제목과 같은 낱말로 원인을 말하고, 역할별 해법(OWNER → Settings · EDITOR → 소유자에게)을 붙인다.
 */
it.each([
  [{ status: "unpinned" }, "OWNER", "This repository is disconnected. Reconnect it in Settings."],
  [{ status: "app-uninstalled" }, "EDITOR", "This repository is disconnected. Ask a project owner to reconnect it."],
  [{ status: "installation-changed", installationId: "2" }, "OWNER", "This repository is disconnected. Reconnect it in Settings."],
  [{ status: "not-connected" }, "OWNER", "Malmoi isn't connected to this repository. Connect it in Settings."],
  [{ status: "not-connected" }, "EDITOR", "Malmoi isn't connected to this repository. Ask a project owner to connect it."],
  [{ status: "repo-replaced" }, "OWNER", "This connection points to a different repository. Check it in Settings."],
  [{ status: "repo-replaced" }, "EDITOR", "This connection points to a different repository. Ask a project owner to check it."],
] as const)("%o · %s → %s", (health, role, sentence) => {
  expect(connectionReason((health as ConnectionHealth).status, role)).toBe(sentence);
});

it.each(["ok", "unknown", "repo-moved"] as const)("%s는 연결 사유가 없다 — 버튼을 끄지 않는 갈래다", status => {
  expect(connectionReason(status, "OWNER")).toBeNull();
});

it("제목은 Home 배너와 같은 키다", () => {
  expect(connectionReason("unpinned", "EDITOR")).toContain(en.home.banner.disconnected.title);
  expect(connectionReason("not-connected", "EDITOR")).toContain(en.home.banner.notConnected.title);
});
