import type { ConnectionHealth } from "@/lib/github-connect/health";
import { connectionProblem } from "@/lib/home/state";
import type { Messages } from "@/lib/i18n";

/**
 * 번역 화면에서 연결 때문에 꺼진 Publish·Sync의 사유 (malmoi#160). 이 화면엔 Home의 연결 배너가 없어서 사유가 원인 없는
 * "…currently unavailable"뿐이었다. **제목은 Home 배너와 같은 키**이고(갈래는 같은 `connectionProblem`), 뒤에 역할별 해법을 잇는다 —
 * OWNER는 고치는 자리(Settings), EDITOR는 누가 고칠 수 있는지. 버튼을 끄지 않는 갈래(`ok`·`unknown`·`repo-moved`)는 `null`이다.
 */
export function connectionReason(m: Messages, status: ConnectionHealth["status"], role: "OWNER" | "EDITOR"): string | null {
  const problem = connectionProblem(status);
  if (problem === null) return null;
  const owner = role === "OWNER";
  const c = m.translations.connection;
  const b = m.home.banner;
  switch (problem) {
    case "disconnected": return `${b.disconnected.title}. ${owner ? c.owner.disconnected : b.disconnected.editor}`;
    case "not-connected": return `${b.notConnected.title}. ${owner ? c.owner.notConnected : b.notConnected.editor}`;
    case "wrong-repository": return `${b.wrongRepository.title}. ${owner ? c.owner.wrongRepository : c.editor.wrongRepository}`;
    default: return problem satisfies never;
  }
}
