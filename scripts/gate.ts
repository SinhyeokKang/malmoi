#!/usr/bin/env tsx
/**
 * 로컬 게이트 — `/push` 1단계 · `/ship` · `/orchestrate` 통합 · 워커 브리프가 부르는 **한 명령**. 판정은 `scripts/gate-plan.ts`다.
 *
 *   pnpm gate [--base <ref>]
 *
 * 변경 경로(`<base>...HEAD` + 미커밋 + 미추적, 기본 base `origin/dev`)로 격리 postgres 스위트를 붙일지 정하고, 단계를 순서대로 돌려
 * **첫 실패에서 그 exit code로 끝난다.** exit 2 = 인자 오류.
 *
 * ⚠️ 출력을 파이프로 거르지 않는다 — 이 스크립트가 존재하는 이유가 `| grep | head`가 삼킨 종료 코드다. 끝줄 `gate: …`만 보면 된다.
 */
import { spawn, spawnSync } from "node:child_process";

import { isTeardownOnlyFailure, planGate, type GateStep } from "./gate-plan";

function parseBase(argv: readonly string[]): string {
  if (argv.length === 0) return "origin/dev";
  const [flag, ref, ...rest] = argv;
  if (flag !== "--base" || ref === undefined || ref.startsWith("-") || rest.length > 0) {
    console.error("사용법: pnpm gate [--base <ref>]");
    process.exit(2);
  }
  return ref;
}

function gitLines(args: readonly string[]): string[] | null {
  const result = spawnSync("git", args, { encoding: "utf8" });
  if (result.status !== 0) return null;
  return result.stdout.split("\n").filter((line) => line.length > 0);
}

/** 셋 중 하나라도 못 구하면 null — `planGate`가 격리 스위트를 전부 돌린다. */
function changedPaths(base: string): string[] | null {
  const parts = [
    gitLines(["diff", "--name-only", `${base}...HEAD`]),
    gitLines(["diff", "--name-only", "HEAD"]),
    gitLines(["ls-files", "--others", "--exclude-standard"]),
  ];
  if (parts.some((part) => part === null)) return null;
  return [...new Set(parts.flatMap((part) => part ?? []))];
}

/** 출력을 그대로 흘리면서 모은다 — 재시도 판정이 요약 줄을 읽는다. */
function run(step: GateStep): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    let output = "";
    const child = spawn("pnpm", ["-s", step], { stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
      process.stderr.write(chunk);
    });
    child.on("close", (code) => resolve({ code: code ?? 1, output }));
  });
}

async function main(): Promise<void> {
  const base = parseBase(process.argv.slice(2));
  const changed = changedPaths(base);
  const steps = planGate(changed);
  console.log(`gate: base=${base}${changed === null ? " (변경 목록 없음 — 격리 스위트 전부)" : ` · ${changed.length} paths`} · ${steps.join(" → ")}`);

  const retried: GateStep[] = [];
  for (const step of steps) {
    console.log(`\ngate ▶ ${step}`);
    let result = await run(step);
    if (result.code !== 0 && step.startsWith("test") && isTeardownOnlyFailure(result.output)) {
      console.log(`\ngate ↻ ${step}: 테스트는 전부 통과했고 워커 종료 오류(EnvironmentTeardownError)만 났다 — 한 번 다시 돈다`);
      retried.push(step);
      result = await run(step);
    }
    if (result.code !== 0) {
      console.error(`\ngate: FAILED at ${step} (exit ${result.code})${retried.length > 0 ? ` · retried: ${retried.join(", ")}` : ""}`);
      process.exit(result.code);
    }
  }
  console.log(`\ngate: ok · ${steps.join(" → ")}${retried.length > 0 ? ` · retried: ${retried.join(", ")}` : ""}`);
}

void main();
