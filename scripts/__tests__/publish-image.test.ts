import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * **`scripts/publish-image.sh` — GHCR 발행** (image-publish-workflow design §2.1). 셸 스크립트라 순수 함수가 없다 — 실제로 띄운다.
 *
 * 대역은 셸 함수가 아니라 **PATH 앞 임시 디렉터리의 실행 파일**이다(`git`·`docker`) — 별도 파일 스크립트에는 함수를 주입할 수 없다.
 * 대역은 `TRACE`에 호출을 적고 `FAIL_AT`의 단계에서 실패한다(backup-shell.test.ts의 패턴).
 *
 * ⚠️ env는 최소만 넘긴다 — `...process.env`를 쓰면 CI verify run의 실제 `GITHUB_OUTPUT`·`GITHUB_STEP_SUMMARY`에 쓰게 된다.
 */

const REF = "ghcr.io/sinhyeokkang/malmoi:v1.3.3";
const SHA = "0123456789abcdef0123456789abcdef01234567";

// 실측 원문 — `docker buildx imagetools inspect ghcr.io/sinhyeokkang/malmoi:v0.0.0` stderr (buildx v0.38.0, 2026-10-12,
// 로그아웃·로그인 두 번 바이트 동일, exit 1, stdout 빈 채). 대역은 태그만 v1.3.3으로 바꿔 낸다.
const NOT_FOUND_STDERR = (ref: string) => `ERROR: ${ref}: not found\n`;

// 실측 원문 — `docker buildx imagetools inspect ghcr.io/sinhyeokkang/malmoi:v1.3.3 --format '{{json .Manifest}}'` stdout
// (buildx v0.38.0, 2026-10-12, 로그아웃·로그인 같은 출력, exit 0). `"digest"`가 셋이다 — 최상위 index · amd64 manifest · attestation.
const INDEX_DIGEST = "sha256:236756bc99ac3408f4d20a4759afc4c62ef675d1fc3b3fb54229bf619102621b";
const CHILD_DIGESTS = [
  "sha256:841eacdd41459b142dd84a3e39a5c975c19e187fe5fdf20e3e01c42fc7477ab8",
  "sha256:4c95a7e9c1306da6091bffec47983ece3037bb448d19728da2a75865169622c3",
];
const INSPECT_STDOUT = `{
  "schemaVersion": 2,
  "mediaType": "application/vnd.oci.image.index.v1+json",
  "digest": "sha256:236756bc99ac3408f4d20a4759afc4c62ef675d1fc3b3fb54229bf619102621b",
  "size": 856,
  "manifests": [
    {
      "mediaType": "application/vnd.oci.image.manifest.v1+json",
      "digest": "sha256:841eacdd41459b142dd84a3e39a5c975c19e187fe5fdf20e3e01c42fc7477ab8",
      "size": 2586,
      "platform": {
        "architecture": "amd64",
        "os": "linux"
      }
    },
    {
      "mediaType": "application/vnd.oci.image.manifest.v1+json",
      "digest": "sha256:4c95a7e9c1306da6091bffec47983ece3037bb448d19728da2a75865169622c3",
      "size": 564,
      "annotations": {
        "vnd.docker.reference.digest": "sha256:841eacdd41459b142dd84a3e39a5c975c19e187fe5fdf20e3e01c42fc7477ab8",
        "vnd.docker.reference.type": "attestation-manifest"
      },
      "platform": {
        "architecture": "unknown",
        "os": "unknown"
      }
    }
  ]
}`;

// 위 원문에서 최상위 digest 줄만 맨 뒤로 옮긴 변형 — 출력 순서가 바뀌는 날 "첫 매치"가 자식 digest를 고르는지 본다.
const INSPECT_STDOUT_REORDERED = INSPECT_STDOUT
  .replace(`  "digest": "${INDEX_DIGEST}",\n`, "")
  .replace(/\n {2}\]\n\}$/, `\n  ],\n  "digest": "${INDEX_DIGEST}"\n}`);

// buildx 문서(`docker buildx build --metadata-file`)의 예시 모양 — 이 머신에 실측 파일이 없다(orch.md "tasks 0 실측 결과").
// `containerimage.descriptor` 안에도 `"digest"`가 있다 — 읽는 키는 `containerimage.digest`다.
const DOC_BUILD_DIGEST = "sha256:19ffeab6f8bc9293ac2c3fdf94ebe28396254c993aea0b5a542cfb02e0883fa3";
const METADATA_DOC = `{
  "buildx.build.provenance": {},
  "buildx.build.ref": "mybuilder/mybuilder0/0fjb6ubs52xx3vygf6fgdl611",
  "containerimage.config.digest": "sha256:2937f66a9722f7f4a2df583de2f8cb97fc9196059a410e7f00072fc918930e66",
  "containerimage.descriptor": {
    "annotations": {
      "config.digest": "sha256:2937f66a9722f7f4a2df583de2f8cb97fc9196059a410e7f00072fc918930e66",
      "org.opencontainers.image.created": "2022-02-08T21:28:03Z"
    },
    "digest": "sha256:19ffeab6f8bc9293ac2c3fdf94ebe28396254c993aea0b5a542cfb02e0883fa3",
    "mediaType": "application/vnd.oci.image.manifest.v1+json",
    "size": 506
  },
  "containerimage.digest": "sha256:19ffeab6f8bc9293ac2c3fdf94ebe28396254c993aea0b5a542cfb02e0883fa3"
}`;
// 같은 빌드가 레지스트리에 올라간 경우 — 문서 예시의 digest를 실측 index digest로 갈아 끼운다.
const METADATA_SAME = METADATA_DOC.replaceAll(DOC_BUILD_DIGEST, INDEX_DIGEST);

const GIT_STUB = `#!/usr/bin/env bash
printf 'git %s\\n' "$*" >> "$TRACE"
case "$1" in
  rev-parse)
    [ "$FAIL_AT" = rev-parse ] && { echo "fatal: Needed a single revision" >&2; exit 128; }
    echo "${SHA}" ;;
  cat-file)
    [ "$FAIL_AT" = cat-file ] && { echo "fatal: path 'Dockerfile' does not exist in '${SHA}'" >&2; exit 128; }
    exit 0 ;;
  archive)
    [ "$FAIL_AT" = archive ] && { echo "fatal: not a tree object: ${SHA}" >&2; exit 128; }
    echo "tar-bytes" ;;
  *) exit 99 ;;
esac
`;

const DOCKER_STUB = `#!/usr/bin/env bash
case "$1 $2" in
  "buildx imagetools")
    printf 'docker %s\\n' "$*" >> "$TRACE"
    if [ -e "$STUB_STATE/built" ] || [ "$INSPECT_MODE" = exists ]; then cat "$STUB_STATE/inspect.json"; exit 0; fi
    case "$INSPECT_MODE" in
      not-found) printf 'ERROR: %s: not found\\n' "$4" >&2; exit 1 ;;
      forbidden) echo "ERROR: failed to authorize: failed to fetch anonymous token: unexpected status from GET request to https://ghcr.io/token?scope=repository%3Asinhyeokkang%2Fmalmoi%3Apull&service=ghcr.io: 403 Forbidden" >&2; exit 1 ;;
      network) echo "ERROR: failed to do request: Head \\"https://ghcr.io/v2/sinhyeokkang/malmoi/manifests/v1.3.3\\": dial tcp: lookup ghcr.io: no such host" >&2; exit 1 ;;
      missing-cmd) echo "docker: 'buildx' is not a docker command. buildx: command not found" >&2; exit 127 ;;
      not-found-plus) printf 'ERROR: %s: not found\\nERROR: retry later\\n' "$4" >&2; exit 1 ;;
      not-found-other) echo "ERROR: ghcr.io/sinhyeokkang/malmoi:v9.9.9: not found" >&2; exit 1 ;;
    esac
    exit 98 ;;
  "buildx build")
    cat > /dev/null
    printf 'docker %s\\n' "$*" >> "$TRACE"
    [ "$FAIL_AT" = build ] && { echo "ERROR: failed to solve" >&2; exit 1; }
    echo "#1 building..." >&2
    meta=""
    while [ $# -gt 0 ]; do
      [ "$1" = --metadata-file ] && meta="$2"
      shift
    done
    cp "$STUB_STATE/metadata.json" "$meta"
    : > "$STUB_STATE/built" ;;
  *) printf 'docker %s\\n' "$*" >> "$TRACE"; exit 99 ;;
esac
`;

type Run = { status: number | null; stdout: string; stderr: string; calls: string[]; output: string | null; summary: string | null };

function run(args: string[], opts: { inspect?: string; failAt?: string; inspectJson?: string; metadata?: string; githubEnv?: boolean } = {}): Run {
  const dir = mkdtempSync(join(tmpdir(), "publish-image-"));
  try {
    const bin = join(dir, "bin");
    const state = join(dir, "state");
    for (const d of [bin, state]) spawnSync("mkdir", [d]);
    writeFileSync(join(bin, "git"), GIT_STUB);
    writeFileSync(join(bin, "docker"), DOCKER_STUB);
    chmodSync(join(bin, "git"), 0o755);
    chmodSync(join(bin, "docker"), 0o755);
    writeFileSync(join(state, "inspect.json"), opts.inspectJson ?? INSPECT_STDOUT);
    writeFileSync(join(state, "metadata.json"), opts.metadata ?? METADATA_SAME);
    const trace = join(dir, "trace");
    writeFileSync(trace, "");
    const output = join(dir, "github-output");
    const summary = join(dir, "step-summary");
    const env: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      PATH: `${bin}:${process.env.PATH ?? ""}`,
      HOME: dir,
      TRACE: trace,
      FAIL_AT: opts.failAt ?? "",
      INSPECT_MODE: opts.inspect ?? "not-found",
      STUB_STATE: state,
    };
    if (opts.githubEnv !== false) {
      env.GITHUB_OUTPUT = output;
      env.GITHUB_STEP_SUMMARY = summary;
    }
    const result = spawnSync("bash", ["scripts/publish-image.sh", ...args], { encoding: "utf8", timeout: 5_000, env });
    // metadata 파일 경로는 매번 다른 임시 경로라 자리표시자로 바꿔 센다.
    const calls = readFileSync(trace, "utf8").split("\n").filter(Boolean).map((line) => line.replace(/--metadata-file \S+/, "--metadata-file <tmp>"));
    return {
      status: result.status,
      stdout: result.stdout,
      stderr: result.stderr,
      calls,
      output: existsSync(output) ? readFileSync(output, "utf8") : null,
      summary: existsSync(summary) ? readFileSync(summary, "utf8") : null,
    };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const REV_PARSE = "git rev-parse --verify v1.3.3^{commit}";
const CAT_FILE = `git cat-file -e ${SHA}:Dockerfile`;
const INSPECT = `docker buildx imagetools inspect ${REF} --format {{json .Manifest}}`;
const ARCHIVE = `git archive ${SHA}`;
const BUILD = `docker buildx build --platform linux/amd64 --push -t ${REF} --metadata-file <tmp> -`;

describe("인자 검증 — 밖이면 exit 2, 대역 호출 0", () => {
  it.each([
    ["개행 섞인 값", ["v1.3.3\nv1.3.4"]],
    ["개행 뒤 꼬리", ["v1.3.3\n"]],
    ["action 태그", ["malmoi-i18n-push-v3"]],
    ["v 없음", ["1.3.3"]],
    ["두 자리", ["v1.3"]],
    ["프리릴리스", ["v1.3.3-rc.1"]],
    ["latest", ["latest"]],
    ["빈 값", [""]],
    ["인자 없음", []],
    ["인자 둘", ["v1.3.3", "v1.3.4"]],
  ])("%s", (_, args) => {
    const r = run(args);
    expect(r.status, r.stderr).toBe(2);
    expect(r.calls).toEqual([]);
    expect(r.stdout).toBe("");
  });
});

describe("빌드 전 실패 — exit 1, build 0", () => {
  it("태그가 없으면 rev-parse에서 멈춘다", () => {
    const r = run(["v1.3.3"], { failAt: "rev-parse" });
    expect(r.status, r.stderr).toBe(1);
    expect(r.calls).toEqual([REV_PARSE]);
    expect(r.stdout).toBe("");
  });

  it("Dockerfile이 없는 태그(v1.3.0 이전)는 조회 전에 멈춘다", () => {
    const r = run(["v1.3.3"], { failAt: "cat-file" });
    expect(r.status, r.stderr).toBe(1);
    expect(r.calls).toEqual([REV_PARSE, CAT_FILE]);
    expect(r.stdout).toBe("");
  });
});

describe("존재 조회 3분기", () => {
  it("이미 있으면 exists <index digest> — build 0", () => {
    const r = run(["v1.3.3"], { inspect: "exists" });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toBe(`exists ${INDEX_DIGEST}\n`);
    expect(r.calls).toEqual([REV_PARSE, CAT_FILE, INSPECT]);
    expect(r.output).toBe(`digest=${INDEX_DIGEST}\n`);
    expect(r.summary).toContain(`exists ${INDEX_DIGEST}`);
  });

  it("자식 manifest digest를 고르지 않는다 — 최상위 digest가 자식 뒤에 와도", () => {
    const r = run(["v1.3.3"], { inspect: "exists", inspectJson: INSPECT_STDOUT_REORDERED });
    expect(INSPECT_STDOUT_REORDERED).not.toBe(INSPECT_STDOUT);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toBe(`exists ${INDEX_DIGEST}\n`);
    for (const child of CHILD_DIGESTS) expect(r.stdout).not.toContain(child);
  });

  it("최상위 digest가 없는 출력은 실패다 — 자식으로 대신하지 않는다", () => {
    const noTop = INSPECT_STDOUT.replace(`  "digest": "${INDEX_DIGEST}",\n`, "");
    const r = run(["v1.3.3"], { inspect: "exists", inspectJson: noTop });
    expect(r.status, r.stderr).toBe(1);
    expect(r.stdout).toBe("");
    expect(r.calls).not.toContain(BUILD);
  });

  it(`실측 문구 'ERROR: <ref>: not found' 한 줄이면 build 1회 + published`, () => {
    const r = run(["v1.3.3"], { inspect: "not-found" });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toBe(`published ${INDEX_DIGEST}\n`);
    expect(r.calls).toEqual([REV_PARSE, CAT_FILE, INSPECT, ARCHIVE, BUILD, INSPECT]);
    expect(r.output).toBe(`digest=${INDEX_DIGEST}\n`);
    expect(r.summary).toContain(`published ${INDEX_DIGEST}`);
    expect(r.stderr).toContain("#1 building...");
  });

  it.each([
    ["403", "forbidden"],
    ["네트워크", "network"],
    ["exit 127 (command not found)", "missing-cmd"],
    ["not found 뒤에 줄이 더 있음", "not-found-plus"],
    ["다른 ref의 not found", "not-found-other"],
  ])("%s → fail-closed: exit 1, build 0, stderr 그대로", (_, mode) => {
    const r = run(["v1.3.3"], { inspect: mode });
    expect(r.status, r.stderr).toBe(1);
    expect(r.stdout).toBe("");
    expect(r.calls).toEqual([REV_PARSE, CAT_FILE, INSPECT]);
    expect(r.stderr).toContain("ERROR");
    expect(r.output ?? "").not.toContain("digest=");
  });
});

describe("빌드 경로 실패", () => {
  it("git archive 실패는 파이프가 삼키지 않는다 — exit 1, 성공 줄 없음", () => {
    const r = run(["v1.3.3"], { failAt: "archive" });
    expect(r.status, r.stderr).toBe(1);
    expect(r.stdout).toBe("");
    // 대역 build는 빈 stdin에도 성공한다 — 파이프 왼쪽 실패를 pipefail이 잡는지가 요점이다.
    expect(r.calls).toEqual([REV_PARSE, CAT_FILE, INSPECT, ARCHIVE, BUILD]);
    expect(r.output ?? "").not.toContain("digest=");
  });

  it("build 실패 → exit 1", () => {
    const r = run(["v1.3.3"], { failAt: "build" });
    expect(r.status, r.stderr).toBe(1);
    expect(r.stdout).toBe("");
    expect(r.calls).toEqual([REV_PARSE, CAT_FILE, INSPECT, ARCHIVE, BUILD]);
  });

  it("metadata digest ≠ 레지스트리 digest → exit 1 + mismatch <metadata> <registry>", () => {
    const r = run(["v1.3.3"], { metadata: METADATA_DOC });
    expect(r.status, r.stderr).toBe(1);
    expect(r.stdout).toBe(`mismatch ${DOC_BUILD_DIGEST} ${INDEX_DIGEST}\n`);
    expect(r.calls).toEqual([REV_PARSE, CAT_FILE, INSPECT, ARCHIVE, BUILD, INSPECT]);
    expect(r.output ?? "").not.toContain("digest=");
    expect(r.summary).toContain(`mismatch ${DOC_BUILD_DIGEST} ${INDEX_DIGEST}`);
  });
});

describe("호출 계약", () => {
  it("GITHUB_OUTPUT·GITHUB_STEP_SUMMARY가 없어도 돈다 — 비상 경로(로컬)", () => {
    const r = run(["v1.3.3"], { githubEnv: false });
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toBe(`published ${INDEX_DIGEST}\n`);
  });

  it("금지 꼴이 없다 — `( … ) &&`·latest·--build-arg·--secret·절대경로 도구·jq", () => {
    const code = readFileSync("scripts/publish-image.sh", "utf8").split("\n").filter((l) => !l.trimStart().startsWith("#")).join("\n");
    expect(code).toMatch(/^set -euo pipefail$/m);
    expect(code).not.toMatch(/\)\s*&&/);
    expect(code).not.toMatch(/latest|--build-arg|--secret|\bjq\b|mapfile|declare -A|,,\}/);
    expect(code).not.toMatch(/\/usr\/bin\/|\/bin\/(git|docker)/);
  });

  it("실행 비트를 갖는다 — 워크플로가 직접 실행한다", () => {
    const r = spawnSync("git", ["ls-files", "-s", "scripts/publish-image.sh"], { encoding: "utf8", timeout: 5_000 });
    expect(r.stdout).toMatch(/^100755 /);
  });
});
