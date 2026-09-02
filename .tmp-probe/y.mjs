import { parseDocument, isMap, isScalar, isSeq } from "yaml";
const src = `# Rails 로케일 파일 — 사람이 넣은 주석
ko:
  common:
    ok: "확인"      # 줄 끝 주석
    close: 닫기

  # 의미 단위 빈 줄과 주석
  time:
    just_now: 방금
    minutes_ago: "%{n}분 전"
  list:
    - 첫째
    - 둘째
  multi: |
    여러 줄
    본문
  anchored: &a 앵커값
  ref: *a
`;
const doc = parseDocument(src);
// 값만 갈아끼운다
const visit = (node, path, fn) => {
  if (isMap(node)) for (const it of node.items) {
    const k = String(it.key?.value ?? it.key);
    if (isScalar(it.value)) fn(it.value, [...path, k]);
    else visit(it.value, [...path, k], fn);
  }
  if (isSeq(node)) node.items.forEach((v, i) => {
    if (isScalar(v)) fn(v, [...path, String(i)]);
    else visit(v, [...path, String(i)], fn);
  });
};
const seen = [];
visit(doc.contents, [], (sc, path) => { seen.push(path.join(".") + " = " + JSON.stringify(sc.value)); });
console.log("읽은 리프:"); for (const s of seen) console.log("  " + s);
// ko.common.ok 를 바꿔본다
visit(doc.contents, [], (sc, path) => {
  if (path.join(".") === "ko.common.ok") sc.value = "OK로 변경";
  if (path.join(".") === "ko.multi") sc.value = "한 줄로 바꿈";
});
console.log("\n--- 재직렬화 ---");
console.log(String(doc));
