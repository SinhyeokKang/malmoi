import { expect, it } from "vitest";
import { checkDownloadBudget, checkContentBudget } from "../budget";
it("다운로드 전에 파일 수·파일별·합계 바이트를 제한한다", () => {
  expect(() => checkDownloadBudget(Array.from({length:201},(_,i)=>String(i)), [])).toThrow();
  expect(() => checkDownloadBudget(["a"], [{path:"a",size:2_000_001}])).toThrow();
  expect(() => checkDownloadBudget(["a"], [{path:"a"}])).toThrow();
  const files=Array.from({length:6},(_,i)=>({path:String(i),size:2_000_000}));
  expect(() => checkDownloadBudget(files.map(f=>f.path),files)).toThrow();
  expect(() => checkDownloadBudget(["a"], [{path:"a",size:20}])).not.toThrow();
});
it("내용은 UTF-8 바이트 기준이며 JSON 깊이를 파싱 전에 제한한다", () => {
  expect(() => checkContentBudget("a.json", '"'+"한".repeat(700_000)+'"', 0)).toThrow();
  expect(() => checkContentBudget("a.json", "[".repeat(101)+"0"+"]".repeat(101), 0)).toThrow();
  expect(checkContentBudget("a.json", JSON.stringify({x:"[".repeat(110)}), 0)).toBeGreaterThan(0);
});
it("YAML flow·indent와 코드 리터럴 깊이도 파서 전에 제한한다", () => {
  expect(() => checkContentBudget("a.yaml", "[".repeat(101)+"0"+"]".repeat(101), 0)).toThrow();
  expect(() => checkContentBudget("a.yaml", Array.from({length:102},(_,i)=>" ".repeat(i)+"a:").join("\n"), 0)).toThrow();
  expect(() => checkContentBudget("a.ts", "export default "+"[".repeat(101)+"0"+"]".repeat(101), 0)).toThrow();
});
it("YAML plain scalar의 작은따옴표 뒤에서도 중첩을 검사한다", () => {
  const content = "title: don't stop\nnested: " + "[".repeat(101) + "0" + "]".repeat(101);
  expect(() => checkContentBudget("a.yaml", content, 0)).toThrow();
});
it("YAML block scalar의 괄호는 번역 문자열이다", () => {
  expect(() => checkContentBudget("a.yaml", "message: |\n  " + "[".repeat(101) + "\n", 0)).not.toThrow();
});
