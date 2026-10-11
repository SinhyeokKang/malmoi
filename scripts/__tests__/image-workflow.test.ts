import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

/**
 * **`.github/workflows/image.yml` — 셀프 호스팅 이미지 발행자** (image-publish-workflow design §2.2·§6). YAML이라 순수 함수가 없다 —
 * 파싱해 모양을 센다(action-setup.test.ts의 패턴). `uses:` SHA 핀은 workflow-pins.test.ts가 `.github/` 전체를 훑으며 센다.
 *
 * 이 리포 CI에 처음 생기는 쓰기 권한 job이라(`packages: write`) 노출 면을 여기서 박는다: 서드파티 action 0 · `contents: write` 0 ·
 * `run:` 본문 표현식 주입 0 · 태그별 직렬화.
 */

type Step = { name?: string; uses?: string; run?: string; with?: Record<string, unknown>; env?: Record<string, string> };
type Job = { "runs-on"?: string; permissions?: Record<string, string>; env?: Record<string, string>; steps: Step[] };
type Workflow = {
  on: Record<string, unknown>;
  permissions?: unknown;
  concurrency?: { group?: string; "cancel-in-progress"?: boolean };
  defaults?: { run?: { shell?: string } };
  jobs: Record<string, Job>;
};

const PATH = join(".github", "workflows", "image.yml");
const raw = readFileSync(PATH, "utf8");
const wf = parse(raw) as Workflow;
const job = wf.jobs.publish;
const steps = job?.steps ?? [];
const runs = steps.flatMap((s) => (s.run === undefined ? [] : [s.run]));

describe("전제 — 스위트가 실제로 스텝을 본다 (POSTMORTEM 2026-09-10)", () => {
  it("job이 정확히 publish 하나이고 스텝이 있다", () => {
    expect(Object.keys(wf.jobs)).toEqual(["publish"]);
    expect(steps.length).toBeGreaterThan(0);
  });
});

describe("트리거 — Release 이벤트와 수동 dispatch뿐", () => {
  it("release[published] + workflow_dispatch(tag, required)", () => {
    expect(Object.keys(wf.on).sort()).toEqual(["release", "workflow_dispatch"]);
    expect(wf.on.release).toEqual({ types: ["published"] });
    expect(wf.on.workflow_dispatch).toEqual({ inputs: { tag: { required: true, type: "string" } } });
  });
});

describe("권한", () => {
  it("최상위 permissions가 {}다 — job이 늘어도 기본 권한이 붙지 않는다", () => {
    expect(wf.permissions).toEqual({});
  });

  it("publish 권한이 정확히 {contents: read, packages: write}다", () => {
    expect(job?.permissions).toEqual({ contents: "read", packages: "write" });
  });

  it("contents: write가 파일 어디에도 없다", () => {
    expect(raw).not.toMatch(/contents:\s*write/);
  });
});

describe("스텝", () => {
  it("uses:는 actions/checkout 하나뿐이다 — 쓰기 토큰이 닿는 서드파티 action 0", () => {
    const uses = steps.flatMap((s) => (s.uses === undefined ? [] : [s.uses]));
    expect(uses).toHaveLength(1);
    expect(uses[0]).toMatch(/^actions\/checkout@[0-9a-f]{40}$/);
  });

  it("checkout은 ci.yml과 같은 핀이다", () => {
    const pin = (file: string) => /uses:\s*(actions\/checkout@\S+\s*#.*)$/m.exec(readFileSync(file, "utf8"))?.[1];
    expect(pin(PATH)).toBeDefined();
    expect(pin(PATH)).toBe(pin(join(".github", "workflows", "ci.yml")));
  });

  it("checkout에 ref가 없고(워크플로 커밋) persist-credentials: false다", () => {
    const checkout = steps.find((s) => s.uses?.startsWith("actions/checkout@"));
    expect(checkout?.with).not.toHaveProperty("ref");
    expect(checkout?.with?.["persist-credentials"]).toBe(false);
  });

  it("태그를 명시적으로 fetch한다 — 빌드 입력은 그 태그 커밋이다", () => {
    expect(runs.filter((r) => /git fetch .*refs\/tags\/\$TAG:refs\/tags\/\$TAG/.test(r))).toHaveLength(1);
  });

  it("builder는 docker-container 드라이버로 명시한다", () => {
    expect(runs.filter((r) => /docker buildx create\b.*--driver docker-container/.test(r))).toHaveLength(1);
  });

  it("ghcr.io 로그인은 stdin으로 토큰을 넘긴다", () => {
    const login = runs.filter((r) => r.includes("docker login ghcr.io"));
    expect(login).toHaveLength(1);
    expect(login[0]).toContain("--password-stdin");
  });

  it("발행 스크립트를 정확히 한 번 부른다", () => {
    expect(runs.filter((r) => r.includes("scripts/publish-image.sh"))).toEqual(['scripts/publish-image.sh "$TAG"']);
  });

  it("스텝 순서: checkout → fetch → login → builder → 스크립트", () => {
    const at = (re: RegExp) => steps.findIndex((s) => re.test(s.uses ?? s.run ?? ""));
    const order = [/^actions\/checkout@/, /git fetch/, /docker login/, /docker buildx create/, /publish-image\.sh/].map(at);
    expect(order.every((i) => i >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });
});

describe("주입·동시성·셸", () => {
  it("run: 본문에 ${{ 가 0개다 — 표현식은 env로만 넘긴다", () => {
    expect(runs.filter((r) => r.includes("${{"))).toEqual([]);
  });

  it("TAG는 job env가 release 태그 또는 dispatch 입력에서 받는다", () => {
    expect(job?.env?.TAG).toBe("${{ github.event.release.tag_name || inputs.tag }}");
  });

  it("concurrency group이 태그를 포함하고 cancel-in-progress: false다", () => {
    expect(wf.concurrency?.group).toContain("github.event.release.tag_name || inputs.tag");
    expect(wf.concurrency?.["cancel-in-progress"]).toBe(false);
  });

  it("defaults.run.shell이 bash다 — -eo pipefail을 러너 기본값에 맡기지 않는다", () => {
    expect(wf.defaults?.run?.shell).toBe("bash");
  });

  it("latest 태그·cache-from·cache-to·--build-arg·--secret이 0개다", () => {
    // `runs-on: ubuntu-latest`는 러너 라벨이라 뺀다 — 막는 것은 이미지의 `latest` 태그다.
    const body = raw.split("\n").filter((l) => !l.trimStart().startsWith("#")).join("\n").replaceAll("ubuntu-latest", "");
    expect(body).not.toMatch(/latest|cache-from|cache-to|--build-arg|--secret/);
  });
});
