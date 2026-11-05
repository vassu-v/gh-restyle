# Contract: review threads, resolve, multi-line, suggestions (build of 2026-11-05)

This is the interface every worker builds against. The plan and the "why" are in `review-threads-and-suggestions.md`.
**Decisions here are final for this build.** If something can't work as written, stop and report it instead of
changing the interface.

Ownership (no one edits another worker's files; nobody commits, the lead commits):

| Worker | Files it owns |
|---|---|
| **pkg** | `packages/github/src/{types,client,api,mock,index}.ts`, new `threads.ts`, `suggest.ts`, `apply.ts`, new `packages/github/test/review-threads.test.ts`, `packages/github/test/suggest.test.ts`, `packages/github/test/threads.test.ts` |
| **ui** | `apps/app/src/data/queries.ts`, `apps/app/src/features/thread/*` (new `ThreadView.tsx`, `Suggestion.tsx`; changed `DiffFile.tsx`), `apps/app/src/app/thread/[owner]/[repo]/[number].tsx` |
| **e2e** | `scripts/e2e-review.mjs` (extend it) |
| lead | docs, package.json, CI, final stitching |

## 1. Types (`packages/github/src/types.ts`)

```ts
// User gains: id?: number
// PullRequest.head gains: repo?: { full_name: string; owner?: { login: string } } | null
// PullRequest gains: maintainer_can_modify?: boolean
export type ReviewComment = {
  id: number; user: User; body: string; path: string;
  line: number | null;            // current line; null = outdated
  side?: 'LEFT' | 'RIGHT';
  start_line?: number | null;     // multi-line start (null/absent = single line)
  start_side?: 'LEFT' | 'RIGHT' | null;
  original_line?: number | null; original_start_line?: number | null;
  diff_hunk?: string;             // hunk ending at the commented line, at commit_id
  commit_id?: string;
  created_at: string; in_reply_to_id?: number; html_url?: string;
};
export type DraftComment = { path: string; line: number; side: 'LEFT' | 'RIGHT'; start_line?: number; start_side?: 'LEFT' | 'RIGHT'; body: string };

/** From GraphQL reviewThreads. rootId = databaseId of the thread's first comment (= REST id). */
export type ThreadState = { id: string; rootId: number; isResolved: boolean; isOutdated: boolean; viewerCanResolve: boolean; viewerCanUnresolve: boolean; viewerCanReply: boolean };

/** A review thread as the app shows it (made by groupThreads). */
export type ReviewThread = {
  root: ReviewComment; replies: ReviewComment[];          // replies oldest first
  path: string; line: number | null; side: 'LEFT' | 'RIGHT'; startLine: number | null;
  outdated: boolean; resolved: boolean;
  threadId: string | null;                                // null when GraphQL state is unavailable
  canResolve: boolean; canUnresolve: boolean; canReply: boolean;
};

export type Suggestion = { commentId: number; path: string; startLine: number; endLine: number; lines: string[]; author: User };
export type SuggestionCheck = { ok: true; suggestion: Suggestion } | { ok: false; reason: string };
export type ApplyResult = { sha: string; applied: number };
```

## 2. Transport (`client.ts`)

`GitHubClient` gains `graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T>`:
POST `/graphql` with `{ query, variables }` through `raw`. If the JSON has `errors`, throw
`GitHubError(errors[0].message, 422)`. Return `data`. In sample mode the same POST goes to `mockRequest('/graphql', …)`.

## 3. API (`api.ts`) — new members, exact names

```ts
replyToReviewComment(owner, repo, n, rootId: number, body: string): Promise<ReviewComment>   // POST /pulls/{n}/comments/{rootId}/replies
reviewThreads(owner, repo, n): Promise<ThreadState[]>     // GraphQL, reviewThreads(first:100){nodes{id isResolved isOutdated viewerCanResolve viewerCanUnresolve viewerCanReply comments(first:1){nodes{databaseId}}}}, follows pageInfo up to 5 pages
resolveThread(threadId: string): Promise<true>            // mutation resolveReviewThread(input:{threadId})
unresolveThread(threadId: string): Promise<true>
// git data (all on the HEAD repo, passed as owner/repo):
gitCommit(owner, repo, sha) -> { sha; tree: { sha } }
gitTree(owner, repo, treeSha) -> { sha; tree: { path; mode; type: 'blob'|'tree'|'commit'; sha }[] }   // non-recursive
createTree(owner, repo, { base_tree, tree: { path; mode; type: 'blob'; content: string }[] }) -> { sha }
createCommit(owner, repo, { message, tree, parents: string[] }) -> { sha }
updateBranch(owner, repo, branch, sha) -> unknown        // PATCH /git/refs/heads/{branch} {sha, force:false}
applySuggestions(owner, repo, n, comments: ReviewComment[], opts?: { message?: string; viewer?: string }): Promise<ApplyResult>   // see §5
```
`submitReview` passes `start_line`/`start_side` through unchanged (they're in DraftComment).

## 4. Pure helpers (exported from the package index)

`threads.ts`
- `groupThreads(comments: ReviewComment[], states?: ThreadState[] | null): ReviewThread[]`
  Roots = no `in_reply_to_id`, or one pointing at an unknown id. Replies follow the chain to their root.
  `outdated = root.line == null || state?.isOutdated`. With no state: resolved=false, threadId=null,
  canResolve=false, canUnresolve=false, canReply=true. Order: by root.created_at.

`suggest.ts`
- `parseSuggestions(body: string): string[][]`: each ```` ```suggestion ```` block's lines (fences of 3+ backticks
  or tildes; closing fence = same char, length ≥ opening). Empty block → `[]` (deletes lines).
- `splitSuggestionBody(body): ({ kind: 'md'; text: string } | { kind: 'suggestion'; lines: string[] })[]` for rendering.
- `originalLines(c: ReviewComment): string[] | null`: the RIGHT-side lines `original_start_line ?? original_line` …
  `original_line` taken from `diff_hunk` (use `parsePatch`). null if they aren't all in the hunk.
- `checkSuggestion(c: ReviewComment, ctx: { prOpen: boolean; canWrite: boolean }): SuggestionCheck`
  Reasons (exact text, the UI shows them):
  - not exactly one block → `"This comment has more than one suggestion. Apply it on GitHub."`
  - side or start_side LEFT → `"Suggestions on deleted lines can't be applied."`
  - `c.line == null` → `"The code changed since this suggestion. It's outdated."`
  - `!ctx.prOpen` → `"The pull request is closed."`
  - path starts with `.github/workflows/` → `"Workflow files can't be changed from Gitling."`
  - `!ctx.canWrite` → `"You need write access to apply suggestions."`
- `applyEdits(text: string, edits: { startLine: number; endLine: number; lines: string[] }[]): string`
  1-based inclusive ranges; throws `Error("Two suggestions change the same lines.")` on overlap and
  `Error("A suggestion points past the end of the file.")`; keeps CRLF vs LF and the presence/absence of a final newline.
- `coAuthorLine(u: User): string` → `Co-authored-by: {login} <{id}+{login}@users.noreply.github.com>` (no id → `{login}@users.noreply.github.com`).

## 5. `applySuggestions` (in `apply.ts`, wired into api)

1. `pr = pull(o,r,n)`. Refuse (GitHubError 422, message below) if not open; head repo = `pr.head.repo.full_name`
   (null → `"The pull request's branch is gone."`). If head repo ≠ `o/r` and `maintainer_can_modify === false` and
   head owner ≠ viewer → `"This pull request comes from a fork that doesn't allow edits from maintainers."`
2. `checkSuggestion` each with `{ prOpen: true, canWrite: true }` (permission is GitHub's call on write). Any not ok → 422 with its reason.
3. Group by path. For each file: `fileText(headOwner, headRepo, path, pr.head.sha)`; for every suggestion compare file lines
   `startLine..endLine` with `originalLines(c)`; mismatch → `"The code changed since this suggestion. It's outdated."`.
   Then `applyEdits`.
4. Mode: walk `gitTree` from the head commit's tree down the path's folders to find the file's `mode` (default `100644`).
5. `createTree({ base_tree, tree: [{ path, mode, type:'blob', content }] })` → `createCommit({ message, tree, parents:[pr.head.sha] })`
   message = `opts.message ?? (n>1 ? 'Apply suggestions from code review' : 'Apply suggestion from code review')`
   + `\n\n` + co-author lines for distinct authors other than `opts.viewer`.
6. `updateBranch(headOwner, headRepo, pr.head.ref, commit.sha)`. 422 → `"The branch changed while you were applying. Refresh and try again."`;
   403/404 → `"GitHub didn't let Gitling write to this branch."`
7. Return `{ sha, applied }`.

## 6. Sample data (`mock.ts`) — the UI and e2e depend on these exact facts

PR **you/trail-notes#45** (yours, you can push; head `fix/offline-merge` @ `a91f3c2e`, head.repo = same repo):
- `src/sync/queue.ts` patch becomes (14 new lines):
  ```
  1 import { Entry, Patch } from '../types';
  2
  3 export class PatchQueue {
  4   private patches: Patch[] = [];
  5
  6   push(entryId: string, field: keyof Entry, value: unknown) {
  7     this.patches.push({ entryId, field, value, at: Date.now() });
  8   }
  9
  10  merge(remote: Entry, local: Entry): Entry {
  11    // newer timestamp wins, the other value goes to history
  12    return remote.updatedAt >= local.updatedAt ? remote : local;
  13  }
  14 }
  ```
- Thread A (id 951, mira, line 12 RIGHT): body `Ties should keep the local edit:` + suggestion `    return remote.updatedAt > local.updatedAt ? remote : local;`
  Reply 952 (you): `Good catch, I'll take it.`
- Thread B (id 953, lin, line 4 RIGHT): body `Nothing reassigns this:` + suggestion `  private readonly patches: Patch[] = [];`
- Thread C (id 955, devansh, `src/sync/index.ts` lines 22–24 RIGHT, start_line 22): `Could \`push(merged)\` fail offline? Maybe queue it.` — **resolved**.
- All comments carry `diff_hunk`, `original_line`, `original_start_line`, `commit_id: 'a91f3c2e'`.
- Users carry ids (mira 101, lin 102, devansh 103, you 100).
- A git store holds the head branch files (consistent with the patches) so `fileText(...,'a91f3c2e' or 'fix/offline-merge')`,
  `gitCommit`, `gitTree`, `createTree`, `createCommit`, `updateBranch` work. `updateBranch` refuses (422) unless the new commit's
  parent is the branch head; on success it moves the branch, sets the PR head.sha, and sets `line: null` on comments whose
  `originalLines` no longer match the new file (so applied suggestions turn outdated).
- GraphQL: `reviewThreads` answers from the comments (thread id `RT_<rootId>`, viewerCanResolve true for #45 and #33,
  viewerCanReply true); resolve/unresolve mutations flip the state.
- `POST …/comments/{id}/replies` appends a reply from `you` (in_reply_to_id = root id).
- `submitReview` stores `start_line`/`start_side`, and fills `diff_hunk`/`original_*`/`commit_id` from the PR's patch so a
  newly written suggestion can be applied in sample mode.

PR **lin/tiny-sync#33** (not yours, no push) keeps its patch; no existing review comments.

## 7. UI contract (labels the e2e test relies on — exact strings)

In **Files**, under each thread's last line (`line`, or under "outdated comments" when outdated):
- Thread header shows `lines 22–24` for multi-line threads (en dash).
- Resolved threads collapse to a row: `Resolved · {k} comment(s)` (button, a11y label `Show resolved thread`).
  Expanded: comments + button `Unresolve` (when canUnresolve).
- Open thread: comments, then button `Reply` (a11y label `Reply to thread`) → TextInput placeholder `Write a reply` →
  button `Send reply`; plus `Resolve` button when canResolve.
- A comment containing a suggestion renders a card titled `Suggested change` with the original lines (removed style)
  and the new lines (added style). Buttons when `checkSuggestion` ok and the PR is open and you can write:
  `Apply` and `Add to batch` (in batch: `Remove from batch`). Blocked: the reason text in muted style.
  `Apply` opens a commit box: TextInput (a11y label `Commit message`) prefilled with the default message, button `Commit`.
  After success: text `Suggestion applied.`
- Batch bar at the top of Files when batch non-empty: `{k} suggestion(s) in batch` + `Commit batch` + `Clear`.
  After success: `Suggestions applied.`
- Multi-line: long-press a line (a11y action / label `Start a range at line {n}` on web via onLongPress) → banner
  `Tap the last line of the range` with `Cancel`; tapping a later line in the same hunk opens the composer with
  placeholder `Comment on lines {a}–{b}`. Single line keeps `Comment on line {n}`.
- Composer gets a `Suggest` button (only when every selected line is RIGHT side) that inserts
  ```` ```suggestion\n<current lines>\n``` ```` into the text.
- Pending drafts show `pending · line {n}` or `pending · lines {a}–{b}`.
- Timeline (Conversation) is unchanged.

Hooks (`queries.ts`):
- `useReviewThreads(owner, repo, n, enabled)` → `{ threads: ReviewThread[]; isLoading; error; refetch }` (REST comments +
  GraphQL states, GraphQL failure tolerated → states null).
- `useThreadActions` gains `reply` (`{ rootId, body }`), `resolve` (`{ threadId, resolved: boolean }`),
  `applySuggestions` (`{ comments: ReviewComment[]; message?: string }`); each invalidates this PR's keys.
