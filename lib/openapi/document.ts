import { z } from "zod";

import { ImportFailureReport } from "@/lib/projects/import-status";
import { PushPayload } from "@/lib/push/plan";
import { PushResponseSchema } from "@/lib/push/payload";
import { en } from "@/messages/en";

/**
 * **`/openapi.json` — CI push API 두 엔드포인트의 OpenAPI 3.1 문서** (ARCHITECTURE §8.1).
 *
 * ⚠️ **형태의 파생본이고 의미의 정본은 `docs/ACTIONS.md`다** — 동작·red 조건·안정성은 거기 산문이 정한다. 그래서 오류 갈래
 * (409 사유 다섯 등)를 열거하지 않고 `{ error: string }` + 추가 필드 허용으로만 적는다. 손 사본이 둘이 되면 하나가 낡는다.
 *
 * ⚠️ **스키마는 서버가 검증에 쓰는 Zod에서 생성한다** — 손으로 쓴 스키마는 낡는다(POSTMORTEM 2026-08-31). `io: "input"`이 필수다:
 * `PushPayload.refs`의 `.transform`을 output 모드는 표현하지 못하고 던진다. `.refine`은 조용히 빠지므로 operation `description`에 남긴다.
 * 응답도 `io: "input"`이라 `z.object`가 `additionalProperties: false`를 내지 않는다(열린 형). `strictObject`(실패 보고)는 그대로 닫힌다 —
 * 서버가 실제로 거부하므로 참이다.
 *
 * ⚠️ **서버 URL은 상대 `/`다** — OpenAPI 3.1은 문서가 서빙된 위치로 푼다. hosted·preview·self-hosted가 같은 바이트를 내고 각자 자기
 * origin을 가리키므로 모드 분기가 없다. `info.version`은 앱 버전(서버 계약의 축)이고 action 태그(클라이언트 축)와 별개다.
 *
 * ⚠️ **보안 스킴에 스코프가 없다** — 프로젝트 push 토큰은 스코프가 없고, 반영되지 않는 스코프를 광고하면 거짓 선언이다.
 */

type JsonSchema = Record<string, unknown>;

/** 생성물의 `$schema`는 뺀다 — OpenAPI 3.1의 Schema Object는 dialect를 문서가 정한다. */
function schemaOf(schema: z.ZodType): JsonSchema {
  const { $schema: _dialect, ...rest } = z.toJSONSchema(schema, { io: "input", target: "draft-2020-12" }) as JsonSchema;
  return rest;
}

/** 오류 본문 — 갈래마다 붙는 필드(`issues` 400 · `ref` 500 · `expected`·`got`·`commitAt`·`lastCommitAt` 409)는 추가 필드로 둔다. */
const ErrorBody = z.object({ error: z.string() });

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const jsonBody = (name: string, description: string) => ({ description, content: { "application/json": { schema: ref(name) } } });

const ERROR_RESPONSES = {
  "400": jsonBody("Error", "The body is too large, isn't JSON, or fails validation (`issues` lists what failed)."),
  "401": jsonBody("Error", "The bearer token is missing or isn't a project push token."),
  "409": jsonBody("Error", "The request was refused (archived project, project or source mismatch, removed source, format or commit order). The meaning of each refusal is in docs/ACTIONS.md."),
  "500": jsonBody("Error", "The server failed. `ref` identifies the failure in the server logs."),
};

export function openApiDocument(version: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: `${en.common.appName} CI push API`,
      version,
      description:
        "Machine-readable shape of the endpoints the Malmoi CI workflow calls. Behavior, refusal conditions and stability are defined in docs/ACTIONS.md of the Malmoi repository; this document is derived from the server's validation schemas.",
    },
    servers: [{ url: "/" }],
    paths: {
      "/api/push": {
        post: {
          operationId: "push",
          summary: "Import a source's locale files from a repository commit",
          description:
            "Replaces the project's translations with the repository values for this source. Also checked beyond the schema: `format.baseLocale` must be in `locales`, every translation's locale must be in `locales`, locale codes must be path-safe and look like a locale tag (a 2-3 letter language subtag, then `-` or `_` subtags of up to 8 characters), `format.pathTemplate` must stay inside the repository and within the glob budget, and `placeholders` must nest at most 8 levels and serialize to at most 16 KB. A 200 can be `deferred`, which means nothing was imported.",
          security: [{ pushToken: [] }],
          requestBody: { required: true, content: { "application/json": { schema: ref("PushPayload") } } },
          responses: { "200": jsonBody("PushResponse", "Imported (`applied`) or held back (`deferred`)."), ...ERROR_RESPONSES },
        },
      },
      "/api/push/failure": {
        post: {
          operationId: "reportPushFailure",
          summary: "Report that the CI run couldn't read its locale files",
          description: "Records the failure for the project. Imports nothing and doesn't move the source's last commit.",
          security: [{ pushToken: [] }],
          requestBody: { required: true, content: { "application/json": { schema: ref("ImportFailureReport") } } },
          responses: { "204": { description: "Recorded." }, ...ERROR_RESPONSES },
        },
      },
    },
    components: {
      securitySchemes: {
        pushToken: { type: "http", scheme: "bearer", description: "The project's push token, issued in the project's Settings in Malmoi." },
      },
      schemas: {
        PushPayload: schemaOf(PushPayload),
        PushResponse: schemaOf(PushResponseSchema),
        ImportFailureReport: schemaOf(ImportFailureReport),
        Error: schemaOf(ErrorBody),
      },
    },
  };
}
