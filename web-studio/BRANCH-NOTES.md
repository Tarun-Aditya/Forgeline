# web-studio: a parallel copy for review

This folder is the Studio-style web app from the local branch `feat/web-ui-refresh`, where it lives
at `web/`. It was uploaded here as `web-studio/` so it can sit next to the newer `web/` on `main`
without touching it. Nothing outside `web-studio/` was changed on this branch.

The same app, as a git history, is in the bundle `feat-web-ui-refresh.bundle` that was sent
separately (17 commits on top of 5e7624c). That bundle is the complete version.

## Left out of this copy

- Font files: `public/fonts/CommitMono-*.woff2` and `MonaSans*.ttf` (binary). Their licences are
  SIL OFL; copy the font files and `OFL-*.txt` from the bundle.
- `package-lock.json`. Run `npm install` to make one.
- `demo/fixtures/` (recorded job used by the demo video).
- `components/ai-elements/prompt-input.tsx`. Copy it from the bundle; the chat input imports it.

## Fixes needed after copying

- The upload cannot set executable bits. Run `chmod +x demo/*.sh demo/*.py`.
- Source files are text-identical to the local branch except where a transcription slip is found by
  comparing blob hashes (`git hash-object`) against the bundle.

## What this is

A front-end restyle of the web app to match Mastra Studio (Apache-2.0 design tokens, see
`THIRD_PARTY_NOTICES.md`): AppFrame and MainCard, a job switcher that scopes every page, a New job
page with a job-details side panel, an Agents pipeline view, and a Playwright demo recording
(`demo/`). The backend changes are one read-only route, `app/api/agents`, with `lib/agents.ts` and its
test.
