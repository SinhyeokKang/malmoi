import { mkdtemp, mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { collectImages } from "../collect";
import { parseMd } from "../parse";
import { parseMdTable } from "../sections";
import { servedGuideFiles } from "./helpers/served";

type GateProblem = { asset: string; reason: string };

async function imageGate(root: string): Promise<GateProblem[]> {
  const guide = join(root, "guide");
  const files = servedGuideFiles(guide);
  const images = (await Promise.all(files.map(async (file) => collectImages(parseMd(await readFile(join(guide, file)))).map((image) => ({ ...image, file }))))).flat();
  const referenced = new Set(images.map(({ src }) => src));
  const publicGuide = join(root, "public", "guide");
  const assets = await readdir(publicGuide).catch(() => [] as string[]);
  const assetNames = new Set(assets.filter((name) => name.endsWith(".webp")));
  const problems: GateProblem[] = [];
  for (const image of images) for (const problem of image.problems) problems.push({ asset: image.src, reason: problem });
  for (const asset of assets.filter((name) => name.endsWith(".webp"))) {
    const src = `/guide/${asset}`;
    if (!referenced.has(src)) problems.push({ asset: src, reason: "orphan" });
  }
  if (images.length === 0) return problems;
  for (const image of images) {
    if (!assetNames.has(image.src.slice("/guide/".length))) problems.push({ asset: image.src, reason: "missing-file" });
  }

  const shooting = join(guide, "SHOOTING.md");
  const shootingText = await readFile(shooting).catch(() => null);
  if (shootingText === null) return [...problems, ...images.map(({ src }) => ({ asset: src, reason: "missing-shooting" }))];
  const rows = parseMdTable(parseMd(shootingText), "shots") ?? [];
  const masking = parseMdTable(parseMd(shootingText), "masking");
  if (masking === null || masking.some((row) => !row["원본"] || !row["치환"])) problems.push({ asset: "SHOOTING.md", reason: "invalid-masking" });
  if (masking) {
    const servedText = await Promise.all(files.map((file) => readFile(join(guide, file))));
    for (const row of masking) {
      const original = row["원본"];
      if (original && servedText.some((text) => text.includes(original))) problems.push({ asset: original, reason: "unmasked-text" });
    }
  }
  const byAsset = new Map(rows.map((row) => [row["에셋"], row]));
  for (const image of images) {
    const row = byAsset.get(image.src);
    if (!row) {
      problems.push({ asset: image.src, reason: "missing-mapping" });
      continue;
    }
    if (!row["소스"] || !row.blob || !/^\d+x\d+$/.test(row["치수"] ?? "")) problems.push({ asset: image.src, reason: "invalid-mapping" });
    if (!assetNames.has(image.src.slice("/guide/".length))) continue;
    const metadata = await sharp(join(publicGuide, image.src.slice("/guide/".length))).metadata();
    const actual = `${metadata.width}x${metadata.height}`;
    if (actual !== row["치수"]) problems.push({ asset: image.src, reason: "dimensions" });
  }
  for (const row of rows) if (row["에셋"] && !referenced.has(row["에셋"])) problems.push({ asset: row["에셋"], reason: "unreferenced-mapping" });
  return problems;
}

async function readFile(path: string): Promise<string> {
  const { readFile: read } = await import("node:fs/promises");
  return read(path, "utf8");
}

async function fixture(page: string, options: { asset?: string; shooting?: string; file?: boolean; dimensions?: { width: number; height: number } } = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "malmoi-guide-images-"));
  await mkdir(join(root, "guide"), { recursive: true });
  await mkdir(join(root, "public", "guide"), { recursive: true });
  await writeFile(join(root, "guide", "SUMMARY.md"), "# Summary\n\n- [Page](page.md)\n");
  await writeFile(join(root, "guide", "page.md"), `# Page\n\nA page lead.\n\n## Shot {#shot}\n\n${page}\n`);
  if (options.shooting) await writeFile(join(root, "guide", "SHOOTING.md"), options.shooting);
  if (options.file && options.asset) {
    await sharp({
      create: { width: options.dimensions?.width ?? 1, height: options.dimensions?.height ?? 1, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } },
    }).webp().toFile(join(root, "public", "guide", options.asset.slice("/guide/".length)));
  }
  return root;
}

describe("이미지 매핑 게이트", () => {
  it("실물 가이드는 이미지와 촬영 매뉴얼이 없어도 통과한다", async () => {
    const root = process.cwd();
    expect(await imageGate(root)).toEqual([]);
  });

  it("참조만 있고 파일이 없으면 실패한다", async () => {
    const root = await fixture("![Shot](/guide/missing.webp)");
    expect(await imageGate(root)).toEqual([
      { asset: "/guide/missing.webp", reason: "missing-file" },
      { asset: "/guide/missing.webp", reason: "missing-shooting" },
    ]);
  });

  it("파일만 있으면 고아 에셋으로 실패한다", async () => {
    const root = await fixture("No image.", { asset: "/guide/orphan.webp", file: true });
    expect(await imageGate(root)).toEqual([{ asset: "/guide/orphan.webp", reason: "orphan" }]);
  });

  it("실제 치수와 SHOOTING 기록이 다르면 실패한다", async () => {
    const asset = "/guide/shot.webp";
    const shooting = "# 촬영\n\n## 에셋 매핑 {#shots}\n\n| 에셋 | 소스 | blob | 치수 |\n| --- | --- | --- | --- |\n| /guide/shot.webp | app/page.tsx | abc | 2x2 |\n\n## 마스킹 {#masking}\n\n| 원본 | 치환 |\n| --- | --- |\n| Acme web | Malmoi |\n";
    const root = await fixture(`![Shot](${asset})`, { asset, file: true, shooting, dimensions: { width: 1, height: 1 } });
    expect(await imageGate(root)).toEqual([{ asset, reason: "dimensions" }]);
  });
});
