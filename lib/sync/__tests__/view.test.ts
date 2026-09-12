import { describe, expect, it } from "vitest";

import { SYNC_ERROR_CODES } from "../plan";
import { decodeCursor, encodeCursor, syncRunView, type SyncRunRow } from "../view";

/**
 * `logs` 화면의 순수 판정 (ARCHITECTURE §5.6).
 *
 * ⚠️ **행 하나를 읽는 규칙이 전부 여기 있다.** 화면이 `status`로 삼항을 엮으면 갈래 넷이 JSX 안에
 * 흩어지고, 그 자리에는 누락을 잡는 장치가 없다 — `pullMessage`를 순수 함수로 둔 것과 같은 이유다.
 */

const AT = new Date("2026-09-10T12:00:00.000Z");

function row(over: Partial<SyncRunRow> = {}): SyncRunRow {
  return {
    id: "r1",
    status: "SUCCEEDED",
    trigger: "MANUAL",
    errorCode: null,
    requester: { name: "Kim", emailLabel: "k***@a.com" },
    startedAt: AT,
    finishedAt: AT,
    changed: 3,
    warnings: 0,
    prUrl: "https://github.com/o/r/pull/9",
    ...over,
  };
}

describe("syncRunView — 결과 배지", () => {
  it("성공은 muted다 — 가장 흔한 상태가 가장 조용하다 (DESIGN §6.1)", () => {
    expect(syncRunView(row()).tone).toBe("muted");
  });

  it("스킵도 muted이고, 라벨로 성공과 갈린다", () => {
    const view = syncRunView(row({ status: "SKIPPED", changed: 0, prUrl: null }));
    expect(view.tone).toBe("muted");
    expect(view.label).not.toBe(syncRunView(row()).label);
  });

  it("⚠️ 스킵 라벨이 'Nothing to send'다 — git 어휘를 쓰지 않는다", () => {
    // "branch equals base"는 사실이지만 편집자에게 뜻이 없고, 그 비교는 **base 대비**다
    // (POSTMORTEM 2026-09-09) — 브랜치 이야기를 꺼내면 그 뉘앙스까지 틀린다.
    const { label } = syncRunView(row({ status: "SKIPPED" }));
    expect(label).toMatch(/nothing to send/i);
    for (const word of ["branch", "commit", "merge", "PR", "pull request"]) {
      expect(label.toLowerCase()).not.toContain(word.toLowerCase());
    }
  });

  it("실패만 danger다", () => {
    expect(syncRunView(row({ status: "FAILED", errorCode: "github-error" })).tone).toBe("danger");
  });

  it("진행 중은 muted이고 줄임표를 든다 — 줄임표는 진행 중에만이다 (DESIGN §10)", () => {
    const view = syncRunView(row({ status: "RUNNING", finishedAt: null, changed: null, prUrl: null }));
    expect(view.tone).toBe("muted");
    expect(view.label).toContain("…");
  });

  it("네 상태의 라벨이 서로 다르다 — 배지 색이 셋뿐이라 라벨이 구별을 든다", () => {
    const labels = (["SUCCEEDED", "SKIPPED", "FAILED", "RUNNING"] as const).map(
      (status) => syncRunView(row({ status })).label,
    );
    expect(new Set(labels).size).toBe(4);
  });

  it("tone은 Badge variant 이름 그대로다 (DESIGN §6.2) — 화면이 매핑 표를 또 들지 않는다", () => {
    for (const status of ["SUCCEEDED", "SKIPPED", "FAILED", "RUNNING"] as const) {
      expect(["muted", "warning", "danger"]).toContain(syncRunView(row({ status })).tone);
    }
  });
});

describe("syncRunView — 누가 눌렀나", () => {
  it("cron은 사람이 아니다 — 'Nightly'", () => {
    expect(syncRunView(row({ trigger: "CRON", requester: null })).triggerLabel).toBe("Nightly");
  });

  it("수동은 이름이다", () => {
    expect(syncRunView(row()).triggerLabel).toBe("Kim");
  });

  it("이름이 없으면 마스킹한 이메일이다 — Google 계정엔 핸들이 없다", () => {
    expect(syncRunView(row({ requester: { name: null, emailLabel: "k***@a.com" } })).triggerLabel).toBe(
      "k***@a.com",
    );
  });

  it("⚠️ 삭제된 사용자는 'Removed user'다 — 이력은 남고 저자만 빈다 (FK SetNull)", () => {
    expect(syncRunView(row({ requester: null })).triggerLabel).toMatch(/removed user/i);
  });

  it("cron이 사람 라벨을 덮는다 — 그 행에 requester가 있을 수 없다", () => {
    expect(syncRunView(row({ trigger: "CRON" })).triggerLabel).toBe("Nightly");
  });
});

describe("syncRunView — 사유", () => {
  it("실패가 아니면 사유가 없다", () => {
    for (const status of ["SUCCEEDED", "SKIPPED", "RUNNING"] as const) {
      expect(syncRunView(row({ status, errorCode: "github-error" })).reasonKey, status).toBeNull();
    }
  });

  it("아는 코드는 그대로 키가 된다", () => {
    for (const code of SYNC_ERROR_CODES) {
      expect(syncRunView(row({ status: "FAILED", errorCode: code })).reasonKey).toBe(code);
    }
  });

  it("⚠️ 모르는 코드는 fallback이다 — 코드는 앱 층 어휘라 DB가 제약하지 않는다", () => {
    // enum이 아닌 이유가 이것이다: 코드가 늘 때마다 마이그레이션을 요구하면 "던지는 자리가 코드를
    // 든다"는 규칙이 배포에 묶인다. 대신 읽는 쪽이 모르는 값을 폴백 문장으로 떨어뜨린다.
    expect(syncRunView(row({ status: "FAILED", errorCode: "something-new" })).reasonKey).toBe("fallback");
    expect(syncRunView(row({ status: "FAILED", errorCode: null })).reasonKey).toBe("fallback");
  });
});

describe("cursor — 주소창 값이다", () => {
  it("왕복이 값을 보존한다", () => {
    const cursor = encodeCursor({ startedAt: AT, id: "abc123" });
    expect(decodeCursor(cursor)).toEqual({ startedAt: AT, id: "abc123" });
  });

  it("⚠️ 무효 입력은 null이지 예외가 아니다 — 주소창 값이라 500이 되면 안 된다", () => {
    // `pick`이 모르는 `?e=`에 폴백을 내는 것과 같은 축이다. 화면은 첫 페이지를 그린다.
    for (const bad of ["", "%%%", "not-base64", btoa("no-separator"), btoa("|only-id"), btoa("2026-13-99|x")]) {
      expect(decodeCursor(bad), bad).toBeNull();
    }
  });

  it("id가 비면 null이다 — 키셋의 두 번째 키가 없으면 동점에서 순서가 흔들린다", () => {
    expect(decodeCursor(encodeCursor({ startedAt: AT, id: "" }))).toBeNull();
  });

  it("URL에 그대로 실을 수 있는 문자만 낸다 — 인코딩이 한 겹 더 붙지 않는다", () => {
    expect(encodeCursor({ startedAt: AT, id: "abc/+=123" })).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
