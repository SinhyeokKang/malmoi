// @vitest-environment jsdom
import { writeFileSync } from "node:fs";
import { act, Profiler, type ProfilerOnRenderCallback } from "react";
import { createRoot } from "react-dom/client";
import { expect, it } from "vitest";
import { KeyList } from "@/components/translations/workspace/key-list";
import { startListGeneration } from "@/lib/translations/saved-rows";
import { props } from "./helpers/workspace-props";

// Opt-in measurement, not a timing assertion in the shared suite. Keep identical
// fixture and React development/jsdom conditions before and after migration.
it.skipIf(!process.env.P1_PROFILE)("records actual React Profiler durations for 5000 real key rows", async () => {
  const seed = props().list.rows[0]!;
  const list = startListGeneration(Array.from({ length: 5000 }, (_, i) => ({
    ...seed, keyId: `key-${i}`, key: `common.key${i}`, sourceText: `Source string ${i}`,
    hasPending: i % 5 === 0, hasReview: i % 7 === 0, missingCount: i % 3,
  })), 1);
  const onSelect = () => {};
  const samples: { mount: number; update: number }[] = [];
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  for (let iteration = 0; iteration < 7; iteration++) {
    const host = document.createElement("div"); document.body.append(host);
    const root = createRoot(host);
    const times: number[] = [];
    const record: ProfilerOnRenderCallback = (_id, _phase, duration) => { times.push(duration); };
    const view = (selected: string) => <Profiler id="5000-key-list" onRender={record}>
      <KeyList list={list} title="Keys" count={5000} savedExtra={0} selectedKeyId={selected} showSource onSelect={onSelect} empty={null} />
    </Profiler>;
    await act(async () => root.render(view("key-0")));
    expect(host.querySelectorAll("[data-key-row]")).toHaveLength(5000);
    await act(async () => root.render(view("key-1")));
    expect(times).toHaveLength(2);
    if (iteration >= 2) samples.push({ mount: times[0]!, update: times[1]! });
    await act(async () => root.unmount()); host.remove();
  }
  const median = (values: number[]) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]!;
  const report = { runtime: process.version, rows: 5000, warmups: 2, samples,
    median: { mount: median(samples.map(s => s.mount)), update: median(samples.map(s => s.update)) },
    conditions: "React development, jsdom, real KeyList, stable row references/onSelect, selection key-0 to key-1, actualDuration ms" };
  writeFileSync(`.scratch/component-unify/profiler-${process.env.P1_PROFILE}.json`, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
}, 120000);
