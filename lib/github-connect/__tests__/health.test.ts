import { describe, expect, it } from "vitest";

import { planConnectionHealth, probeFromError, type ProbeResult } from "../health";

/**
 * 연결 건강성 판정 (design §3.3·§4). **상태 컬럼을 만들지 않고 App 쪽 조회로 계산한다** (SAAS §7.5).
 *
 * ⚠️ **이 표의 요지는 마지막 줄이다 — 조회 실패(`error`)를 `app-uninstalled`로 접지 않는다.**
 * 접으면 **장애가 "제거됨"으로 읽힌다**: POSTMORTEM 2026-09-03("실패한 조회를 '없음'으로 읽어
 * 경고가 존재하지 않는 것과 구별되지 않았다")과 2026-09-06("리다이렉트 횟수로 검증해서 전면 장애를
 * '정상'으로 읽었다")이 같은 부류이고, `readSession`이 `none`과 `unavailable`을 가른 것과 같은 축이다.
 *
 * ⚠️ **`repo-moved`·`installation-changed`를 자동으로 따라가지 않는다.** 판정은 새 값을 **보여줄 뿐**이고,
 * 저장은 사람이 "다시 연결"을 눌러야 일어난다 (SAAS §7.9).
 */

const project = { installationId: "158107153", repoOwner: "acme", repoName: "web" };
const okProbe: ProbeResult = { status: "ok", installationId: "158107153", fullName: "acme/web" };

describe("probeFromError — 실패를 '설치 없음'과 '모름'으로 가른다", () => {
  it("401·403·404는 not-installed다", () => {
    // 403은 설치 일시중지(suspended)다 — **영구 상태**라 `unknown`("잠시 뒤 다시")으로 두면
    // 그 안내가 영원히 뜬다. 토큰 발급 자체가 401/404로 죽는 경우도 여기 들어온다.
    expect(probeFromError(401)).toBe("not-installed");
    expect(probeFromError(403)).toBe("not-installed");
    expect(probeFromError(404)).toBe("not-installed");
  });

  it("5xx·429는 error다 — 일시 장애를 '제거됨'으로 접지 않는다", () => {
    for (const status of [429, 500, 502, 503]) {
      expect(probeFromError(status)).toBe("error");
    }
  });

  it("status를 모르면(네트워크 오류) error다 — 부재를 not-installed로 읽지 않는다", () => {
    expect(probeFromError(undefined)).toBe("error");
  });

  it("200·302 같은 뜻밖의 값도 error다 — 모르는 것은 모른다고 한다", () => {
    expect(probeFromError(200)).toBe("error");
  });
});

describe("planConnectionHealth — 아직 연결되지 않음", () => {
  it("installationId가 null이면 not-connected다", () => {
    expect(
      planConnectionHealth({ project: { ...project, installationId: null }, probe: okProbe }),
    ).toEqual({ status: "not-connected" });
  });

  it("installationId가 null이면 probe가 무엇이든 not-connected다 — 저장된 것이 없다", () => {
    for (const probe of [okProbe, { status: "not-installed" }, { status: "error" }] as ProbeResult[]) {
      expect(
        planConnectionHealth({ project: { ...project, installationId: null }, probe }),
      ).toEqual({ status: "not-connected" });
    }
  });
});

describe("planConnectionHealth — 조회 실패와 설치 부재를 가른다", () => {
  it("probe가 error면 unknown이다 — app-uninstalled가 **아니다**", () => {
    const health = planConnectionHealth({ project, probe: { status: "error" } });
    expect(health).toEqual({ status: "unknown" });
    expect(health.status).not.toBe("app-uninstalled");
  });

  it("probe가 not-installed면 app-uninstalled다", () => {
    expect(planConnectionHealth({ project, probe: { status: "not-installed" } })).toEqual({
      status: "app-uninstalled",
    });
  });
});

describe("planConnectionHealth — 설치·리포가 바뀐 경우", () => {
  it("설치 id가 저장값과 다르면 installation-changed이고 새 id를 준다 (재설치)", () => {
    expect(
      planConnectionHealth({
        project,
        probe: { status: "ok", installationId: "999", fullName: "acme/web" },
      }),
    ).toEqual({ status: "installation-changed", installationId: "999" });
  });

  it("id는 맞고 full_name이 다르면 repo-moved이고 새 이름을 준다", () => {
    expect(
      planConnectionHealth({
        project,
        probe: { status: "ok", installationId: "158107153", fullName: "acme/website" },
      }),
    ).toEqual({ status: "repo-moved", fullName: "acme/website" });
  });

  it("소유자가 바뀐 것도 repo-moved다 — 자동으로 따라가지 않고 사람이 확인한다", () => {
    expect(
      planConnectionHealth({
        project,
        probe: { status: "ok", installationId: "158107153", fullName: "newco/web" },
      }),
    ).toEqual({ status: "repo-moved", fullName: "newco/web" });
  });

  it("설치 id 검사가 이름 검사보다 앞이다 — 재설치를 이동으로 말하지 않는다", () => {
    expect(
      planConnectionHealth({
        project,
        probe: { status: "ok", installationId: "999", fullName: "newco/web" },
      }),
    ).toEqual({ status: "installation-changed", installationId: "999" });
  });
});

describe("planConnectionHealth — 정상", () => {
  it("설치 id와 full_name이 모두 맞으면 ok다", () => {
    expect(planConnectionHealth({ project, probe: okProbe })).toEqual({ status: "ok" });
  });

  it("대소문자만 다른 full_name을 이동으로 읽지 않는다 — 거짓 경고를 만들지 않는다", () => {
    expect(
      planConnectionHealth({
        project,
        probe: { status: "ok", installationId: "158107153", fullName: "Acme/Web" },
      }),
    ).toEqual({ status: "ok" });
  });
});
