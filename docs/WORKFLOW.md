# How work gets done here (agents and the owner)

What a new agent session needs to know about *how* this project is run, beyond the code. Read after
`AGENTS.md` and `docs/CONTEXT.md`. Written 2026-11-05 from the sessions that built review threads and PR #2.

## The usual loop

1. **The owner asks in a few casual words.** Turn that into a concrete plan yourself and make the calls an
   engineer would make. Only ask about things that are truly the owner's decision: money, accounts, design taste,
   anything public.
2. **Plan, then build end to end.** Write it, test it, push it, deploy it, then report in plain English: the
   result first, what was verified, what wasn't, and numbered steps for the owner.
3. **Keep the repo the source of truth.** `docs/STATUS.md` must stay true. Lasting facts go in
   `docs/CONTEXT.md`, and how-we-work notes go here.

## Pull requests and `main`

- **`main` directly:** the default for small changes and docs (AGENTS.md "Done means").
- **Pull request:** used when the owner asks for one, and for big features. That happened for
  review threads (PR #1) and for the review pass (PR #2). Flow:
  1. Open the PR. CodeRabbit runs a summary but **skips the automatic review** because the repo has under 10
     stars. Comment `@coderabbitai full review` to get one.
  2. Treat each CodeRabbit finding as a claim. Check it against the code, fix the real ones, and reply on
     every thread saying what changed or why not.
  3. Merge only when CI is green on both Ubuntu and Windows, the PR is clean, and the owner said to merge.
  4. Deploy, then verify live: `/health`, `SMOKE_URL=… npm run smoke`, and a GET to `/auth/callback`
     (it must answer 200 with `no-store`, never a redirect loop).
- **Pushing to someone else's branch** (for example the local agent's PR branch) needs the owner's say-so in
  that conversation. Without it, describe the change in a PR comment and let that branch's owner apply it.

## More than one agent at once

The owner runs a **local agent on their Windows machine** (it can sign in with their real account in their own
Chrome) and **cloud sessions** (no real login, but full browser automation against live github.com). They often
work on the same PR at the same time.
- **Before pushing, always fetch.** A rejected push means the other agent pushed: pull, compare, then keep one
  version.
- **Don't both fix the same review comments.** On PR #2 both agents fixed the same 14 CodeRabbit comments in
  parallel and one copy was thrown away. Before starting, check what landed on the branch in the last few
  minutes. Split the work by leaving a PR comment saying which part you're taking.
- **Talking to the other agent:** there's no direct channel between the local and cloud agents, because
  `ListAgents` only sees sessions on the same machine. The PR is the shared channel: comments and commit
  messages.

## Splitting big features across worker agents (the review-threads pattern)

Worked well for review threads; the files are in `docs/plans/`.
1. **Write a contract first** (`docs/plans/review-threads-contract.md`). It holds exact type and function
   names, sample-data facts, the exact UI strings tests rely on, and who owns which files.
2. **One worker per layer:**
   - `packages/github`
   - app screens
   - e2e test
   - independent checks (for example the extension)
   Workers don't commit and don't touch each other's files. They report back, and the lead relays what the
   next worker needs.
3. **The lead stitches it together:** read the risky code (anything that writes to people's branches), run
   `npm run verify`, look at screenshots, update docs, commit.

## Testing layers (details in `docs/TESTING.md`)

- `npm run verify -- --fast` while coding. Run `npm run verify` before saying done (about 5 minutes; includes the
  extension on live github.com).
- **What only the owner can do:** a real sign-in on the deployed site, install on a real phone, native builds
  on a device.
- **What only the local agent can do:** anything signed in with the owner's real account.

## Things the environment blocks (don't fight them)

- **Cloud sessions:**
  - GitHub GraphQL is blocked (resolve and unresolve tests run on sample data only).
  - Resolving PR review threads through the API is blocked by the safety check; ask the owner to click
    Resolve.
  - DNS and subdomain changes are blocked.
- **Deploy token:** the Cloudflare token is not stored in the cloud environment. See CONTEXT § Security history
  for how deploys have been done.
- **Asking the owner:** when the owner declines a tool call (a push, a workflow change), don't retry it. Ask,
  or offer another way.

## Owner preferences learned the hard way

- Casual, fast messages. Wants the result first, then what to do, in plain words. Doesn't want lectures.
- Rejects generic "AI slop" design (see CONTEXT § Design taste).
- **Secrets:** said "don't be tensed, I'll rotate when necessary" about the Cloudflare token. Mention rotation
  at most once. Never write a token into the repo, a file, a commit or a comment.
- Declined automatic deploys on every merge to `main` (2026-11-05). Deploys stay manual unless they change
  their mind.
