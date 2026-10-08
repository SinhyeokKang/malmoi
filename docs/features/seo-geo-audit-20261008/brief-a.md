# Batch A — adoption facts and public links

Read `report.md` and `orch.md` in this directory, repository AGENTS/CLAUDE and relevant PRODUCT/ARCHITECTURE/POSTMORTEM before work. Implement audit items 1, 5, 7 (covered by 10/22), 10, 11, 12, 13, 14, 22 and the name-origin part of 23.

Use `.agents/skills/source-command-ship/SKILL.md` (`bypass`), guide and translate skills for their owned surfaces. This task explicitly authorizes implementation and local commits; treat your temporary worktree branch as dev-equivalent. **Stop before ship step 11 / push. No git push, merge, sync, db:deploy, schema changes, or .env.local copying.** The final worker gate is exactly `pnpm gate --base dev`; do not pipe/filter its output. Test new/changed behavior first and report RED/GREEN truthfully. Browser QA is deferred to coordinator's final main-checkout QA; deterministic checks belong in tests now.

## Ownership

You may edit relevant `guide/{en,ko,es}/` content, `messages/{en,ko,es}.tsx`, `app/page.tsx`, and the narrowly related content/landing tests. Do not edit lib/seo, app/docs, guide renderer/public-shell/stage, next.config.ts, package/lock, schema, or report/orch files. No authoritative docs changes: provide exact suggested edits in your handoff for coordinator to commit per document. If a test shared with another owner must change, ask the coordinator first.

## Concrete outcome

- Keep hero.body and h1 unchanged. Add a short separate visible current-fact line about no paid plans and MIT; no promise of future pricing. New UI text uses all three dictionaries.
- FAQ in all three languages: current no-paid-plans/MIT facts, unsupported functionality from PRODUCT §4.2 (including ICU/plurals); no competitor names. Category term translation management/i18n once naturally, not keyword stuffing.
- FAQ privacy/delete-account answers link directly to `https://mal-moi.com/privacy` (guide parser rejects root-relative /privacy); do not copy the policy.
- Reference formats/limits leads become factual concise summaries, including accurate format names and representative 3/10/2 MB limits. Verify threshold semantics; 10 members is an invitation threshold, not an absolute capacity guarantee.
- Enumerate supported extensions and layouts accurately from adapter code, keeping distinctions between one-language and all-language code dictionaries. Do not falsely promise .mjs for every adapter.
- Add MCP/AI-agent fact to closing or another existing non-mockup copy surface. Link from existing landing copy/CTA to formats, ai-agents and FAQ without a new section or changing product positioning.
- Shorten the /docs and preferences introductory paragraphs that feed descriptions without losing core facts; do not truncate text mechanically.
- Add one factual Korean name-origin sentence in ko guide from CLAUDE's approved account. Keep visible brand spelling Malmoi; maintain guide structural symmetry/heading anchors. If only ko prose violates a content gate, use an equivalent short factual sentence in en/es as well rather than breaking gates.
- All guide links/anchors and en-ko-es structure remain valid; no dependency changes.

## Acceptance and handoff

Tests must prove content/route outcomes, dictionary parity and factual guards without mirroring all implementation text. Run required targeted tests then final gate. Existing source-scanning gates may require updating approved expectations for the same changed behavior; do not loosen unrelated checks.

Write `.scratch/handoff-A.md`: exact commit IDs, tests and final gate result, files changed, deviations, exact authoritative-doc suggestions, runtime list containing only (b) browser/layout observations with why unit/scenario checks cannot settle them. Include no production URL claims before deployment. Commits end with `Co-Authored-By: Codex <noreply@openai.com>`.

Use only Codex Sol/Astra for any agents; Astra maximum medium. Do not delegate to Claude. Before worker_done check orchestration inbox. Send worker_done once with the current Task/Dispatch's live preamble command, outcome and real report path, then idle.
