VERDICT: CHANGES

## Findings
1. web/lib/runner.ts:62 and :77-79. The answer text now goes into argv verbatim (`input.text.trim()`, with no `buildPrompt`). Before this change every prompt started with `/`, because it was either `/factory ...` or a passthrough that starts with `/factory`. `claude -p` does not take the prompt as the value of `-p`. `claude --help` shows `-p, --print` is a boolean flag and the prompt is the positional `[prompt]` (`Usage: claude [options] [command] [prompt]`). So an answer that starts with `-` is parsed as a CLI option, not as the prompt. Examples:
   - A markdown bullet ("- use repo X") gives an unknown-option error.
   - `--dangerously-skip-permissions`, `--permission-mode=bypassPermissions`, `--allowedTools=...` or `--add-dir=/` would be taken as real options. That would change the permission control this launcher sets on purpose (`--permission-mode` from `FORGELINE_PERMISSION_MODE`, default `auto`).

   The caller is limited to the local user behind the existing localhost/same-origin guard, so it is not remotely exploitable. But it is a new argument-injection path into the process that holds the permission settings. Ordinary answers can also hit it by accident, and the run then fails with a confusing error. Fix: make the prompt impossible to read as an option.
   - Option A: put all flags first and end with `"--", prompt`. Note that `--mcp-config` is variadic, so the `--` is needed.
   - Option B: refuse, or prefix, answer text that starts with `-`.

   Add a `questions.test.ts` case where the answer is `--dangerously-skip-permissions` (or `- use repo X`). It should assert that the fake CLI's argv has the text only after the `--` separator, or that the answer is refused.

## Notes
- `answer` is only a lookup key. It is checked with `Object.hasOwn` against the server's own `pendingQuestions`. The `--resume` session id always comes from the server's run records, never from the request, so a client cannot resume an arbitrary session. Good.
- The text is passed to `spawn` with no shell, so there is no shell injection. `resolveRepo` and the `/api` proxy guard still apply to both changed routes.
- The question text is the agent's own final message, rendered through `MessageResponse` like the other agent output in the chat. This adds no new raw-HTML path.
- `GET /api/jobs` now returns up to 8000 characters of each pending question's final message. This is data the local user already sees in the chat and Runs views, served only behind the localhost guard. It is acceptable.
- No new dependencies, no secrets in the diff, and `web/package.json` is unchanged.
