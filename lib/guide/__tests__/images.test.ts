import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { collectImages } from "../collect";
import { parseMd } from "../parse";

const fixture = () => parseMd(readFileSync(new URL("./fixtures/collect/images.md", import.meta.url), "utf8"));

describe("collectImages — `/guide/<name>.webp` 절대경로만", () => {
  it("문서 순으로 모으고 코드 속 이미지는 세지 않는다", () => {
    expect(collectImages(fixture()).map(({ src }) => src)).toEqual([
      "/guide/publish.webp",
      "/guide/publish.webp",
      "/guide/empty-alt.webp",
      "images/relative.webp",
      "../guide/parent.webp",
      "https://example.com/x.webp",
      "/guide/shot.png",
      "shot",
    ]);
  });

  it("같은 에셋을 두 번 참조해도 된다", () => {
    const publish = collectImages(fixture()).filter(({ src }) => src === "/guide/publish.webp");
    expect(publish.map(({ problems }) => problems)).toEqual([[], []]);
  });

  it("alt가 비면 오류다", () => {
    expect(collectImages(fixture()).find(({ src }) => src === "/guide/empty-alt.webp")?.problems).toEqual(["empty-alt"]);
    expect(collectImages(parseMd("![   ](/guide/x.webp)"))[0]?.problems).toEqual(["empty-alt"]);
  });

  it.each(["images/relative.webp", "../guide/parent.webp", "https://example.com/x.webp", "/guide/shot.png"])("`/guide/<name>.webp` 밖은 오류다 — %s", (src) => {
    expect(collectImages(fixture()).find((image) => image.src === src)?.problems).toEqual(["src"]);
  });

  it("참조형 이미지는 오류다 — 경로가 정의 쪽에 있어 해소 게이트를 빗나간다", () => {
    expect(collectImages(fixture()).find(({ src }) => src === "shot")?.problems).toEqual(["reference"]);
  });

  it("alt와 줄 번호를 든다", () => {
    expect(collectImages(fixture())[0]).toEqual({ src: "/guide/publish.webp", alt: "The Publish dialog", line: 3, problems: [] });
  });

  it("하위 디렉터리·대문자·밑줄은 받지 않는다 — 에셋 이름은 평평한 kebab이다", () => {
    for (const src of ["/guide/a/b.webp", "/guide/Shot.webp", "/guide/a_b.webp"]) {
      expect(collectImages(parseMd(`![x](${src})`))[0]?.problems).toEqual(["src"]);
    }
  });
});
