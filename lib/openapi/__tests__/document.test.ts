import { describe, expect, it } from "vitest";

import { openApiDocument } from "../document";

/**
 * **CI push API의 OpenAPI 문서** (agent-readiness design §2.3). 형태는 서버가 검증에 쓰는 Zod에서 생성한 파생본이고, 의미의 정본은
 * `docs/ACTIONS.md`다. 골든 스냅샷이 계약 변화를 diff로 드러내고, 아래 구조 단언이 깨지면 안 되는 성질을 따로 고정한다.
 */

const doc = openApiDocument("0.0.0-test");

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Obj = { [key: string]: Json };

const obj = (value: Json | undefined): Obj => {
  if (value === undefined || value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`not an object: ${JSON.stringify(value)}`);
  return value;
};
const at = (value: Json | undefined, ...path: string[]): Json | undefined => path.reduce<Json | undefined>((v, k) => (v === undefined ? undefined : obj(v)[k]), value);

const json = JSON.parse(JSON.stringify(doc)) as Json;
/** `#/components/...` 참조를 한 번 푼다 — 경로의 스키마는 전부 components를 가리킨다. */
const deref = (value: Json | undefined): Json | undefined => {
  const pointer = value !== undefined && value !== null && typeof value === "object" && !Array.isArray(value) ? value["$ref"] : undefined;
  return typeof pointer === "string" ? at(json, ...pointer.slice(2).split("/")) : value;
};
const requestSchema = (path: string) => obj(deref(at(json, "paths", path, "post", "requestBody", "content", "application/json", "schema")));

function walk(value: Json | undefined, visit: (node: Obj) => void): void {
  if (value === null || typeof value !== "object" || value === undefined) return;
  if (Array.isArray(value)) return value.forEach((v) => walk(v, visit));
  visit(value);
  Object.values(value).forEach((v) => walk(v, visit));
}

describe("openApiDocument", () => {
  it("골든 스냅샷과 같다", async () => {
    await expect(`${JSON.stringify(doc, null, 2)}\n`).toMatchFileSnapshot("__snapshots__/openapi.json");
  });

  it("OpenAPI 3.1이고 경로는 정확히 둘이며 서버 URL은 상대 /다", () => {
    expect(at(json, "openapi")).toBe("3.1.0");
    expect(Object.keys(obj(at(json, "paths")))).toEqual(["/api/push", "/api/push/failure"]);
    expect(at(json, "servers")).toEqual([{ url: "/" }]);
    expect(at(json, "info", "version")).toBe("0.0.0-test");
    expect(String(at(json, "info", "title"))).toContain("Malmoi");
  });

  it("두 operation은 pushToken bearer 하나를 스코프 없이 요구한다", () => {
    for (const path of ["/api/push", "/api/push/failure"]) expect(at(json, "paths", path, "post", "security"), path).toEqual([{ pushToken: [] }]);
    expect(at(json, "components", "securitySchemes", "pushToken", "type")).toBe("http");
    expect(at(json, "components", "securitySchemes", "pushToken", "scheme")).toBe("bearer");
  });

  // 생산자 `buildPushPayload`(composite action → `scripts/push-local.ts`)가 내는 필드다. `executionId`는 optional이라 빠진다.
  it("push 요청의 required는 composite action이 보내는 필드 리터럴 목록과 같다", () => {
    expect(requestSchema("/api/push")["required"]).toEqual(["projectSlug", "surfaceSlug", "commitSha", "commitAt", "format", "locales", "keys", "translations", "refs"]);
  });

  it("failure 요청은 리터럴 목록과 같고 추가 필드를 거부한다(strictObject — 서버가 실제로 거부한다)", () => {
    const schema = requestSchema("/api/push/failure");
    expect(schema["required"]).toEqual(["projectSlug", "surfaceSlug", "commitSha", "commitAt", "code"]);
    expect(schema["additionalProperties"]).toBe(false);
  });

  it("응답 스키마는 열린 형이다 — 응답 필드 하나를 더해도 생성된 검증기가 깨지지 않는다", () => {
    const responses = obj(at(json, "paths", "/api/push", "post", "responses"));
    const failureResponses = obj(at(json, "paths", "/api/push/failure", "post", "responses"));
    const schemas = [...Object.values(responses), ...Object.values(failureResponses)].map((r) => deref(at(r, "content", "application/json", "schema")));
    let objects = 0;
    walk(schemas as Json, (node) => {
      if (node["type"] === "object") {
        objects += 1;
        expect(node["additionalProperties"]).not.toBe(false);
      }
    });
    expect(objects).toBeGreaterThan(0);
    expect(Object.keys(responses)).toEqual(["200", "400", "401", "409", "500"]);
    expect(Object.keys(failureResponses)).toEqual(["204", "400", "401", "409", "500"]);
  });

  it("모든 $ref가 풀리고 스키마 안에 $schema 키가 없다", () => {
    walk(json, (node) => {
      expect(Object.keys(node)).not.toContain("$schema");
      const ref = node["$ref"];
      if (typeof ref !== "string") return;
      expect(ref.startsWith("#/")).toBe(true);
      expect(at(json, ...ref.slice(2).split("/")), ref).toBeDefined();
    });
  });
});
