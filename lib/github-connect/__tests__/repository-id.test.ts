import { expect, it } from "vitest";
import { requireRepositoryId } from "../repository-id";
it("동일 이름이라도 ID가 다르거나 고정되지 않았으면 거부한다", () => {
  expect(() => requireRepositoryId(null, "2")).toThrow();
  expect(() => requireRepositoryId("1", "2")).toThrow();
  expect(() => requireRepositoryId("1", "1")).not.toThrow();
});
