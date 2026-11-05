# Plan: review replies, resolved threads, multi-line comments, suggested changes

Status: **built** (2026-11-05, branch `feat/review-threads`; see `review-threads-contract.md` for the exact interfaces). Decision record: `docs/decisions/0010-review-threads-and-suggestions.md`.
Builds on what shipped: line comments, Comment/Approve/Request changes, review timeline (`docs/ARCHITECTURE.md` § Code and reviews).

## What the person gets

1. **Replies.** Every review comment shows as a thread. A Reply box sits under the thread; replies appear in place.
2. **Resolve.** Threads have Resolve / Unresolve, shown when GitHub allows it (PR author or write access).
   Resolved threads collapse to one line ("Resolved · 3 comments") that you can tap open.
3. **Multi-line comments.** Long-press a diff line to start a range, then tap the end line. The comment
   covers that range.
4. **Suggest a change.** In the comment box, **Suggest** inserts the selected lines as editable text. Your
   comment then shows as a before/after card.
5. **Apply suggestions.** Anyone with write access sees **Apply** on a suggestion card, plus **Add to batch**
   to apply several suggestions in one commit. Gitling commits to the PR branch and the PR updates.

## GitHub facts this relies on (sources in the research notes at the end)

| Need | API | Notes |
|---|---|---|
| Reply | `POST /repos/{o}/{r}/pulls/{n}/comments/{root_id}/replies` `{body}` | Replies to replies aren't supported. Always reply to the **thread root**. |
| Threads | `GET /pulls/{n}/comments` (already used) | Group by `in_reply_to_id`: no value = root. REST has **no thread id and no resolved state**. |
| Resolved state + thread ids | GraphQL `pullRequest.reviewThreads { id isResolved isOutdated viewerCanResolve viewerCanReply comments { databaseId } }` | Join to REST comments on `databaseId` = REST `id` (verify while building). |
| Resolve / unresolve | GraphQL `resolveReviewThread` / `unresolveReviewThread` `{threadId}` | GraphQL only. Uses the same OAuth token; GraphQL has its own points rate limit. |
| Multi-line | `comments[]` in `POST /pulls/{n}/reviews`: `line`, `side`, `start_line`, `start_side` | `position` is deprecated; don't use it. |
| Suggestion syntax | a ```` ```suggestion ```` fence in the comment body | Replaces lines `start_line..line` on the RIGHT side. An empty block deletes them. |
| Apply suggestion | **No API exists.** | Gitling writes the commit itself (below). |

## Architecture

```
packages/github
  api.ts        + replyToReviewComment(o, r, n, rootId, body)
                + reviewThreads(o, r, n)          (GraphQL, via client.graphql)
                + resolveThread(id) / unresolveThread(id)
                + git: getRef, getCommit, createBlob, createTree, createCommit, updateRef
  client.ts     + graphql<T>(query, variables): POST /graphql, same auth, errors mapped to GitHubError
  threads.ts    NEW, pure: groupThreads(restComments, graphqlThreads) → Thread[] (root, replies, resolved, outdated, canResolve)
  suggest.ts    NEW, pure: parseSuggestions(body) → {replacement}[]
                           applySuggestions(fileText, [{startLine, endLine, replacement}]) → newText
                             (rejects overlapping ranges; keeps the file's trailing newline and line endings)
  mock.ts       + replies, thread state, GraphQL answers for the two queries and two mutations,
                  an in-memory branch and file store so "apply" makes a sample commit
apps/app
  features/thread/ThreadView.tsx   one thread: comments, Reply box, Resolve, collapsed when resolved
  features/thread/DiffFile.tsx     range selection (long-press start, tap end), "Suggest" in the composer
  features/thread/Suggestion.tsx   before/after card, Apply, Add to batch
  data/queries.ts                  useReviewThreads (REST + GraphQL merged), useApplySuggestions mutation
```

**Applying suggestions (one commit for one or many):**

1. `GET /pulls/{n}` gives `head.ref`, `head.sha`, `head.repo.full_name` and `maintainer_can_modify`.
   **Write to `head.repo`**, which may be a fork.
2. For each file involved:
   1. Read the file at `head.sha` (raw).
   2. Check that the lines being replaced still equal the lines the suggestion was written against: the
      comment's `diff_hunk`, or the file at the comment's `commit_id`. If they differ, mark the suggestion
      **outdated** and refuse it.
3. `applySuggestions()` builds each new file text.
4. Git Data API:
   1. `POST /git/blobs` for each file.
   2. `POST /git/trees` with `base_tree` = the head commit's tree.
   3. `POST /git/commits` with `parents: [head.sha]`. The message is "Apply suggestions from code review",
      plus a `Co-authored-by:` line for each suggestion author.
   4. `PATCH /git/refs/heads/{ref}` with `force: false`. If the branch moved, this fails: re-fetch and ask.
5. Invalidate the PR, files, threads and checks.

**Rules the UI enforces, with a plain explanation when blocked:**

| Rule | Why |
|---|---|
| Only RIGHT-side lines can take a suggestion | GitHub doesn't apply suggestions on deleted lines. |
| No outdated suggestions; none while the PR is merged or closed | The lines no longer match. |
| One suggestion per line in a batch | Overlapping ranges are rejected. |
| No files under `.github/workflows/` | That needs the `workflow` scope, which we don't request. |
| Fork PRs need `maintainer_can_modify` and write access upstream | Otherwise GitHub returns 403, which we explain. |

## Tests

- **Unit:**
  - `groupThreads`: roots, replies, orphaned replies, the resolved/outdated merge.
  - `parseSuggestions`: one or many blocks, an empty block (deletes lines), nested fences.
  - `applySuggestions`: single, multi-line, batch across files, overlap rejected, CRLF and a missing final
    newline preserved.
- **api × sample data:** every new endpoint, the GraphQL queries and mutations, and apply → commit visible.
- **Live (read-only):** `reviewThreads` against a public PR.
- **Browser e2e (`e2e:review` extended):**
  - reply in a thread; resolve then unresolve; a multi-line comment
  - suggest → card renders → apply → the file shows the change and the thread is outdated
  - batch of two suggestions → one commit
  - blocked cases show their explanation

## Build order (about 1 session)

1. `client.graphql` + `threads.ts` + replies + resolve (UI: ThreadView), with tests.
2. Multi-line range selection.
3. `suggest.ts` + Suggestion card (read-only rendering first).
4. Apply (single, then batch) with all the guards, and e2e.
5. Docs: ARCHITECTURE, STATUS, CONTEXT.

## Risks

- **GraphQL ↔ REST id join** (`databaseId`): verify on a real PR first. The fallback is to fetch the GraphQL
  thread comments' bodies and match on author + body + time.
- **Apply on very large files:** contents/raw fetch works up to 100 MB. Refuse to apply above 1 MB to keep it
  fast.
- **Rate limits:** GraphQL points are separate from REST. One threads query per PR view is cheap.

## Sources (researched 2026-11-04)

- Review comments, replies, multi-line fields: https://docs.github.com/en/rest/pulls/comments
- Reviews and the `comments[]` fields: https://docs.github.com/en/rest/pulls/reviews
- GraphQL `reviewThreads`, `resolveReviewThread`, `addPullRequestReviewThreadReply`: https://docs.github.com/en/graphql/reference/pulls
- Who can resolve threads; suggestion UI: https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/commenting-on-a-pull-request
- Applying suggestions in the UI (one commit, co-authors, permissions): https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/incorporating-feedback-in-your-pull-request
- Contents API size limits: https://docs.github.com/en/rest/repos/contents
- Fork edits by maintainers: https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/allowing-changes-to-a-pull-request-branch-created-from-a-fork
- **Unverified, check while building:**
  - `databaseId` = REST `id`
  - the raw ```` ```suggestion ```` syntax isn't in the official docs
  - the "deleted lines can't take suggestions" rule comes from UI messages
  - workflow files need the `workflow` scope
