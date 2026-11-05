# 0010 — Review threads via REST + GraphQL; suggestions applied with the Git Data API

**Context.**
- REST gives review comments and replies but no thread ids or resolved state.
- Resolving threads is GraphQL-only.
- There is no API to apply a suggested change.

**Decision.**
- **Threads:** keep REST for comments and replies. Add a small `client.graphql()` used only for
  `reviewThreads` and the resolve/unresolve mutations. Merge the two on `databaseId` in a pure, tested
  `threads.ts`.
- **Applying suggestions:** Gitling writes one commit itself: blobs → tree → commit (with `Co-authored-by`
  lines) → fast-forward ref update. The commit goes to the PR's head repo and branch.
- **Guards:** RIGHT side only, not outdated, no overlapping ranges, no workflow files, fork rules.

**Consequences.**
- One GraphQL call per PR view, on GraphQL's separate rate limit.
- The apply logic is ours to keep correct, so it's unit-tested (`suggest.ts`) and covered by browser e2e.
- If GitHub ever adds an apply API, swap it in behind `api.ts`.
- Plan details: `docs/plans/review-threads-and-suggestions.md`.
