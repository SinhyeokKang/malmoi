import { expect, it } from "vitest";
import config from "../../../next.config";

/**
 * ⚠️ **이 테스트는 Next가 값을 지키는지 못 본다** — 우리가 쓴 리터럴을 다시 읽을 뿐이다. 값이
 * 유효한 키인지는 `pnpm typecheck`이, 실제 상한은 배포가 답한다. 남겨 두는 이유는 하나뿐이다:
 * 이 줄이 지워지면 3 MB 업로드가 프레임워크 오류로 바뀌고 우리 거부 사유가 화면에 못 닿는다.
 */
it("3MB 파일과 multipart 부가 데이터를 Server Action이 받을 수 있다", () => {
  expect(config.experimental?.serverActions?.bodySizeLimit).toBe("4mb");
});
