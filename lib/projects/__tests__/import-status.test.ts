import { expect, it } from "vitest";

import type { AdapterError } from "@/lib/adapters/types";
import {
  ImportFailureReport,
  importFailureMessage,
  importOutcomeFields,
  isImportFailureCode,
  representativeFailureCode,
} from "../import-status";

const valid = {
  projectSlug: "acme",
  surfaceSlug: "default",
  commitSha: "a".repeat(40),
  commitAt: "2026-09-13T00:00:00+09:00",
  code: "parse-failed",
};

const err = (code: AdapterError["code"], path = "locales/en.json"): AdapterError => ({ path, code });

it.each(["parse-failed", "parse-crashed", "invalid-locale-data", "prepare-failed"])(
  "accepts %s — the four codes CI is allowed to report",
  (code) => {
    expect(ImportFailureReport.safeParse({ ...valid, code }).success).toBe(true);
  },
);

/**
 * ⚠️ **서버만 쓰는 코드를 CI가 보낼 수 없다.** `partial-import`는 "데이터가 들어갔는데 일부가
 * 빠졌다"는 뜻이라 적재를 실제로 돌린 쪽만 판정할 수 있다 — 보고로 받으면 아무것도 안 들어간
 * 프로젝트가 부분 성공으로 보인다.
 */
it.each(["partial-import", "import-failed", "", "PARSE-FAILED", "__proto__"])(
  "rejects %s from a report body",
  (code) => {
    expect(ImportFailureReport.safeParse({ ...valid, code }).success).toBe(false);
  },
);

/** 닫힌 계약이다 — 모르는 필드를 무시하면 보고자가 조용히 다른 것을 보내기 시작한다. */
it("rejects unknown fields", () => {
  expect(ImportFailureReport.safeParse({ ...valid, detail: "SyntaxError: Unexpected token" }).success).toBe(false);
});

it.each([
  ["short sha", { commitSha: "abc" }],
  ["uppercase sha", { commitSha: "A".repeat(40) }],
  ["timestamp without offset", { commitAt: "2026-09-13T00:00:00" }],
  ["empty slug", { projectSlug: "" }],
])("rejects %s — same constraints as the push payload", (_label, patch) => {
  expect(ImportFailureReport.safeParse({ ...valid, ...patch }).success).toBe(false);
});

/** 파서 분류는 어댑터가 이미 한 것이다 — 여기서 다시 짜면 두 벌이 되고 하나가 낡는다. */
it("keeps the adapter's parse classification", () => {
  expect(representativeFailureCode([err("parse-failed")])).toBe("parse-failed");
  expect(representativeFailureCode([err("parse-crashed")])).toBe("parse-crashed");
});

/** 섞이면 하나만 고른다 — 표시가 문장 하나이므로 판정도 하나여야 한다. */
it("picks parse-failed first when both parse classes are present", () => {
  expect(representativeFailureCode([err("parse-crashed"), err("parse-failed")])).toBe("parse-failed");
  expect(representativeFailureCode([err("value-not-string"), err("parse-crashed")])).toBe("parse-crashed");
});

it.each(["root-not-object", "value-not-string", "duplicate-key", "download-failed"] as const)(
  "folds %s into invalid-locale-data",
  (code) => {
    expect(representativeFailureCode([err(code)])).toBe("invalid-locale-data");
  },
);

/** read 오류가 없는데 실패했다면 탐지·조립 단계다. */
it("is prepare-failed when there is no read error to classify", () => {
  expect(representativeFailureCode([])).toBe("prepare-failed");
});

/**
 * ⚠️ **남이 정한 문자열로 조회한다** — DB 컬럼에서 읽은 값이고 `Object.prototype`에서 찾아지는
 * 키가 그 자리에 올 수 있다 (POSTMORTEM 2026-09-08).
 */
it.each(["__proto__", "constructor", "toString", "hasOwnProperty", "nope", ""])(
  "isImportFailureCode refuses %s",
  (raw) => {
    expect(isImportFailureCode(raw)).toBe(false);
  },
);

it("isImportFailureCode accepts every stored code including the server-only two", () => {
  for (const code of ["parse-failed", "parse-crashed", "invalid-locale-data", "prepare-failed", "partial-import", "import-failed"]) {
    expect(isImportFailureCode(code)).toBe(true);
  }
});

it("importFailureMessage returns a sentence for every stored code", () => {
  for (const code of ["parse-failed", "parse-crashed", "invalid-locale-data", "prepare-failed", "partial-import", "import-failed"] as const) {
    expect(typeof importFailureMessage(code)).toBe("string");
    expect(importFailureMessage(code).length).toBeGreaterThan(0);
  }
});

/** 파서 원문·경로는 화면에 나가지 않는다 — 문장은 사전이 내고 코드만 저장된다. */
it("importFailureMessage never leaks a parser detail", () => {
  expect(importFailureMessage("parse-failed")).not.toMatch(/SyntaxError|line \d|\.json/);
});

const AT = new Date("2026-09-15T09:00:00Z");

/**
 * ⚠️ **성공이 실패 시각도 비운다** (ARCHITECTURE §5) — 안 비우면 성공한 뒤에도 Home의
 * 항목·배너·메타가 옛 실패를 말한다.
 */
it("importOutcomeFields clears all three columns on a clean import", () => {
  expect(importOutcomeFields(null, AT)).toEqual({ lastImportError: null, lastImportStartedAt: null, lastImportFailedAt: null });
});

/** 부분 실패는 데이터가 들어간 채로 남는 표시다 — 진행 표시는 같이 지운다. */
it("importOutcomeFields keeps the code and still clears the running marker", () => {
  expect(importOutcomeFields("partial-import", AT)).toEqual({
    lastImportError: "partial-import", lastImportStartedAt: null, lastImportFailedAt: AT,
  });
});

/**
 * ⚠️ **시각을 함수가 만들지 않는다** — `new Date()`를 여기서 부르면 이 모듈이 순수하지 않게 되고,
 * 같은 트랜잭션 안의 다른 쓰기와 시각이 갈린다.
 */
it("importOutcomeFields takes the time rather than reading the clock", () => {
  const other = new Date("2020-01-01T00:00:00Z");
  expect(importOutcomeFields("parse-failed", other).lastImportFailedAt).toBe(other);
});
