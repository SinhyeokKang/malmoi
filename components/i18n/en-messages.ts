"use client";

import { en } from "@/messages/en";

/**
 * en 사전의 **client reference**. 서버(루트 레이아웃)가 이 export를 prop으로 넘기면 Flight가 모듈 참조로 싣고 브라우저가 이 모듈을 받아 푼다 —
 * 그래서 언어마다 이 파일 하나가 그 사전의 청크다(`messages-provider.tsx` 머리 주석). ko·es는 같은 모양의 `ko-messages.ts`·`es-messages.ts`다.
 * ⚠️ **사전 하나만 import한다** — 다른 언어를 함께 물면 그 언어 사용자가 아닌 사람도 그 청크를 받는다.
 */
export const enMessages = en;
