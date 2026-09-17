import { expect, it } from "vitest";
import config from "../../../next.config";

it("3MB 파일과 multipart 부가 데이터를 Server Action이 받을 수 있다", () => {
  expect(config.experimental?.serverActions?.bodySizeLimit).toBe("4mb");
});
