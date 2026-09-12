import { describe, expect, it } from "vitest";

import { planConnectionHealth, probeFromError, type ProbeResult } from "../health";

/**
 * 연결 건강성 판정 (design §3.3·§4). **상태 컬럼을 만들지 않고 App 쪽 조회로 계산한다** (PRODUCT §7.5).
 *
 * ⚠️ **이 표의 요지는 마지막 줄이다 — 조회 실패(`error`)를 `app-uninstalled`로 접지 않는다.**
 * 접으면 **장애가 "제거됨"으로 읽힌다**: POSTMORTEM 2026-09-03("실패한 조회를 '없음'으로 읽어
 * 경고가 존재하지 않는 것과 구별되지 않았다")과 2026-09-06("리다이렉트 횟수로 검증해서 전면 장애를
 * '정상'으로 읽었다")이 같은 부류이고, `readSession`이 `none`과 `unavailable`을 가른 것과 같은 축이다.
 *
 * ⚠️ **`repo-moved`·`installation-changed`를 자동으로 따라가지 않는다.** 판정은 새 값을 **보여줄 뿐**이고,
 * 저장은 사람이 "다시 연결"을 눌러야 일어난다 (PRODUCT §7.9).
 */

const project = { installationId: "158107153", repositoryId: "1035512", repoOwner: "acme", repoName: "web" };
const okProbe: ProbeResult = {
  status: "ok",
  installationId: "158107153",
  repositoryId: "1035512",
  fullName: "acme/web",
  defaultBranch: "main",
};

describe("probeFromError — 실패를 '설치 없음'과 '모름'으로 가른다", () => {
  it("404는 not-installed다 — App JWT는 유효하고 그 리포에 설치가 없다", () => {
    expect(probeFromError(404)).toBe("not-installed");
  });

  it("403도 not-installed다 — 설치 일시중지(suspended)는 **영구 상태**다", () => {
    // `unknown`("잠시 뒤 다시")으로 두면 그 안내가 영원히 뜬다.
    expect(probeFromError(403)).toBe("not-installed");
  });

  it("⚠️ **401은 error다** — 설치 부재가 아니라 **우리 JWT가 무효**다", () => {
    // 2026-09-06 실측: 개인키가 깨진 상태에서 `GET /repos/{o}/{r}/installation`이 401
    // (`A JSON web token could not be decoded`)을 줬고, 이걸 `not-installed`로 접으면 화면이
    // "App이 제거됐어요 + 설치 링크"를 보인다. 사용자는 GitHub에 가서 재설치하고 **그것은
    // 아무것도 고치지 못한다** — 원인이 우리 서버의 자격증명이기 때문이다.
    //
    // 설치가 유효한데 리포에 없으면 GitHub은 **404**를 준다. 401은 인증 층의 실패다.
    expect(probeFromError(401)).toBe("error");
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
        probe: { ...okProbe, installationId: "999" },
      }),
    ).toEqual({ status: "installation-changed", installationId: "999" });
  });

  it("id는 맞고 full_name이 다르면 repo-moved이고 새 이름을 준다", () => {
    expect(
      planConnectionHealth({
        project,
        probe: { ...okProbe, fullName: "acme/website" },
      }),
    ).toEqual({ status: "repo-moved", fullName: "acme/website" });
  });

  it("소유자가 바뀐 것도 repo-moved다 — 자동으로 따라가지 않고 사람이 확인한다", () => {
    expect(
      planConnectionHealth({
        project,
        probe: { ...okProbe, fullName: "newco/web" },
      }),
    ).toEqual({ status: "repo-moved", fullName: "newco/web" });
  });

  it("설치 id 검사가 이름 검사보다 앞이다 — 재설치를 이동으로 말하지 않는다", () => {
    expect(
      planConnectionHealth({
        project,
        probe: { ...okProbe, installationId: "999", fullName: "newco/web" },
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
        probe: { ...okProbe, fullName: "Acme/Web" },
      }),
    ).toEqual({ status: "ok" });
  });
});

describe("planConnectionHealth — 리포 정체성", () => {
  it("고정된 ID가 없는 옛 행은 not-connected다 — 이름만 맞는 것을 연결로 세지 않는다", () => {
    expect(
      planConnectionHealth({ project: { ...project, repositoryId: null }, probe: okProbe }),
    ).toEqual({ status: "not-connected" });
  });

  it("⚠️ **이름이 같아도 ID가 다르면 repo-replaced다** — 이름 재사용이 여기서 갈린다", () => {
    // sec-audit-2 발견 34: 리포 A를 리네임하고 같은 조직에서 **옛 이름으로 B를 새로 만들면**
    // `fullName`도 `installationId`도 저장값과 같다. ID를 안 보면 이 화면이 초록을 띄우는데
    // `createGitClient`는 쓰기 직전에 거부하므로, **사용자는 초록을 보면서 Publish만 실패한다.**
    expect(
      planConnectionHealth({ project, probe: { ...okProbe, repositoryId: "9999999" } }),
    ).toEqual({ status: "repo-replaced" });
  });

  it("ID 대조가 이름 대조보다 앞이다 — 둘 다 달라도 repo-moved가 아니다", () => {
    // 이름은 주소이고 ID가 정체성이다. 리네임(같은 ID·다른 이름)만 `repo-moved`로 남는다.
    expect(
      planConnectionHealth({
        project,
        probe: { ...okProbe, repositoryId: "9999999", fullName: "newco/web" },
      }),
    ).toEqual({ status: "repo-replaced" });
  });

  it("재설치 판정이 ID 판정보다 앞이다 — 새 설치 id를 '다른 리포'로 말하지 않는다", () => {
    expect(
      planConnectionHealth({
        project,
        probe: { ...okProbe, installationId: "999", repositoryId: "9999999" },
      }),
    ).toEqual({ status: "installation-changed", installationId: "999" });
  });
});
