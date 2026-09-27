import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderProjectWorkflowYaml } from "@/lib/onboarding/workflow";

/**
 * **실행에 쓰이는 action** — 워크플로의 두 줄(`checkout`·malmoi action)과 malmoi action **안의** 두 줄
 * (audit #5). 안쪽 둘은 대상 리포 파일에 안 보여서 빠뜨리기 쉽다. 목록은 실제 `uses:`에서 읽는다.
 *
 * 옛 사전 본문 테스트와 md 게이트가 **같은 목록**을 보도록 여기 하나로 둔다.
 */
export function allowedActions(): string[] {
  const yaml = renderProjectWorkflowYaml({ slug: "acme", baseBranch: "main", surfaces: [{ surfaceSlug: "default", adapter: "json-catalog", pathTemplate: "i18n/{locale}.json", baseLocale: "en" }] });
  const action = readFileSync(join(process.cwd(), ".github/actions/malmoi-i18n-push/action.yml"), "utf8");
  return [...`${yaml}\n${action}`.matchAll(/uses:\s*([^@\s]+)@/g)].map((match) => match[1]!);
}
