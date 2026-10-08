# Batch B — metadata accuracy and docs 404

Read `report.md`, `orch.md`, AGENTS/CLAUDE, relevant ARCHITECTURE/PRODUCT and POSTMORTEM. Implement audit 2, 3, 18, 20 and the code/OG parts of 21. The content worker owns shortening the two guide introductions.

Use source-command-ship with bypass. Temporary branch is dev-equivalent. Implementation/local commits authorized; **stop before step 11 (/push)**. Never push, merge, sync, db:deploy, change schema, or copy .env.local. Final worker gate exactly `pnpm gate --base dev`, unfiltered. Tests first. Deterministic outcomes must be asserted in tests; runtime browser work waits for the coordinator's final QA.

## Ownership

Own `lib/seo/json-ld.ts`, `lib/seo/site.ts`, their direct tests; docs page/layout/not-found and narrowly related 404/metadata tests; `public/og.png` technical lossless optimization. Do not edit dictionaries, guide manuscripts, app/page.tsx, lib/seo/llms.ts or crawl.ts, public-shell/stage, guide renderer, next.config.ts, package/lock/schema, report/orch. Request coordination if ownership is insufficient.

Authoritative docs belong to the coordinator: report exact edits needed in the handoff, including POSTMORTEM for fixed regressions. No broad refactor.

## Concrete outcome

- Pass actual UiLocale and translated root breadcrumb label into docLd; brand/publisher name Malmoi remains brand, not a translation error. Preserve English SEO metadata policy.
- For FAQ's empty parentSlug, pass chapter:null in page.tsx; do not change parentSlugOf or its correct tests. Normal subchapters retain three-level breadcrumb.
- Add WebSite name/url to home structured data. No invented rating, author, founder, dateModified, or SearchAction.
- OG locale en_US, twitter image includes alt while preserving complete metadata inheritance and existing image URL. Verify root metadata as well as page helper; root file app/layout.tsx may be changed only for this image metadata need (notify coordinator before doing so).
- Investigate docs 404: reproduce with executable regression first, identify why SSR body is empty and title loses intended value; fix narrowly so HTTP 404 + noindex + useful initial HTML + title `This page doesn't exist · Malmoi Docs` coexist. Preserve legacy redirects and CSP. Do not claim success from renderToStaticMarkup alone if Next routing behavior is at issue: provide reproducible built-server HTTP check for coordinator QA. If report assumption is wrong, report evidence rather than forcing a workaround.
- Optimize og.png only losslessly, preserving 1200x630 and decoded pixel identity. User requested technical compression, not new art. Use an existing image encoder/tool, no ImageGen recreation or visual edits. Record before/after bytes; <300000 bytes is target, not universal SEO requirement. If not attainable losslessly, explain rather than degrade quality silently.

## Completion

Targeted RED/GREEN then `pnpm gate --base dev`. `.scratch/handoff-B.md` must include commit IDs, exact gate result, any safe deviations, authoritative-doc changes, 404 reproduction commands/results and (b)-only runtime list with rationale. No production deployment claims. Codex trailer on each commit.

Only Codex Sol/Astra agents, Astra effort max medium. Check coordinator inbox at checkpoints and before worker_done. Send exactly once using live preamble Task/Dispatch, explicit outcome and report path, then idle.
