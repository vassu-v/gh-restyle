import { GitHubError } from './client';
import { applyEdits, checkSuggestion, coAuthorLine, originalLines, REASONS, type Edit } from './suggest';
import type { ApplyResult, GitCommit, GitTree, NewTreeEntry, PullRequest, ReviewComment, User } from './types';

/**
 * Applies suggested changes as one commit on the PR's head branch. GitHub has no endpoint for this, so it's the
 * Git Data API: read each file at head.sha, check the suggested lines still match what the reviewer saw, build a
 * tree on top of the head commit's tree, commit with head.sha as parent, then move the branch without force —
 * if someone pushed meanwhile, GitHub refuses and nothing is lost.
 */

/** The api members this needs (a structural type, so api.ts can wire it in without a type cycle). */
export type ApplyDeps = {
  pull(owner: string, repo: string, n: number): Promise<PullRequest>;
  fileText(owner: string, repo: string, path: string, ref?: string): Promise<string>;
  gitCommit(owner: string, repo: string, sha: string): Promise<GitCommit>;
  gitTree(owner: string, repo: string, treeSha: string): Promise<GitTree>;
  createTree(owner: string, repo: string, t: { base_tree: string; tree: NewTreeEntry[] }): Promise<{ sha: string }>;
  createCommit(owner: string, repo: string, c: { message: string; tree: string; parents: string[] }): Promise<{ sha: string }>;
  updateBranch(owner: string, repo: string, branch: string, sha: string): Promise<unknown>;
};

export const APPLY_ERRORS = {
  gone: "The pull request's branch is gone.",
  fork: "This pull request comes from a fork that doesn't allow edits from maintainers.",
  raced: 'The branch changed while you were applying. Refresh and try again.',
  denied: "GitHub didn't let Gitling write to this branch.",
  none: 'Pick at least one suggestion to apply.',
} as const;

const refuse = (msg: string): never => { throw new GitHubError(msg, 422); };
const statusOf = (err: unknown) => (err as { status?: number })?.status;
/** Turns "no write access" answers from the git endpoints into one plain sentence. */
const denied = (err: unknown): never => { const s = statusOf(err); if (s === 403 || s === 404) throw new GitHubError(APPLY_ERRORS.denied, s); throw err; };

export async function applySuggestions(
  api: ApplyDeps, owner: string, repo: string, n: number, comments: ReviewComment[], opts: { message?: string; viewer?: string } = {},
): Promise<ApplyResult> {
  if (!comments.length) refuse(APPLY_ERRORS.none);
  // 1. The PR decides where to write: head.repo, which may be a fork.
  const pr = await api.pull(owner, repo, n);
  if (pr.state !== 'open') refuse(REASONS.closed);
  const head = pr.head.repo ?? refuse(APPLY_ERRORS.gone);
  const [headOwner, headRepo] = head.full_name.split('/');
  const headLogin = head.owner?.login ?? headOwner;
  if (head.full_name.toLowerCase() !== `${owner}/${repo}`.toLowerCase() && pr.maintainer_can_modify === false && headLogin !== opts.viewer) refuse(APPLY_ERRORS.fork);

  // 2. Same rules the card shows. Write permission is GitHub's call when we push.
  const suggestions = comments.map((c) => { const r = checkSuggestion(c, { prOpen: true, canWrite: true }); return r.ok ? { c, s: r.suggestion } : refuse(r.reason); });

  // 3. New text per file, refusing anything whose lines moved on since the comment.
  const byPath = new Map<string, typeof suggestions>();
  for (const x of suggestions) byPath.set(x.s.path, [...(byPath.get(x.s.path) ?? []), x]);
  const files: { path: string; content: string }[] = [];
  for (const [path, list] of byPath) {
    const text = await api.fileText(headOwner, headRepo, path, pr.head.sha);
    const current = text.split(/\r?\n/);
    for (const { c, s } of list) {
      const want = originalLines(c);
      const have = current.slice(s.startLine - 1, s.endLine);
      if (!want || want.length !== have.length || want.some((l, i) => l !== have[i])) refuse(REASONS.outdated);
    }
    const edits: Edit[] = list.map(({ s }) => ({ startLine: s.startLine, endLine: s.endLine, lines: s.lines }));
    try { files.push({ path, content: applyEdits(text, edits) }); } catch (err) { refuse((err as Error).message); }
  }

  // 4. Keep each file's mode (an executable script stays executable).
  const headCommit = await api.gitCommit(headOwner, headRepo, pr.head.sha).catch(denied);
  const tree: NewTreeEntry[] = [];
  for (const f of files) tree.push({ path: f.path, mode: await modeOf(api, headOwner, headRepo, headCommit.tree.sha, f.path), type: 'blob', content: f.content });

  // 5. One commit, crediting every suggestion author except the person applying.
  const authors = new Map<string, User>();
  for (const { s } of suggestions) if (s.author.login !== opts.viewer) authors.set(s.author.login, s.author);
  const title = opts.message ?? (suggestions.length > 1 ? 'Apply suggestions from code review' : 'Apply suggestion from code review');
  const message = authors.size ? `${title}\n\n${[...authors.values()].map(coAuthorLine).join('\n')}` : title;
  const newTree = await api.createTree(headOwner, headRepo, { base_tree: headCommit.tree.sha, tree }).catch(denied);
  const commit = await api.createCommit(headOwner, headRepo, { message, tree: newTree.sha, parents: [pr.head.sha] }).catch(denied);

  // 6. Move the branch, never forced.
  await api.updateBranch(headOwner, headRepo, pr.head.ref, commit.sha).catch((err) => {
    if (statusOf(err) === 422) throw new GitHubError(APPLY_ERRORS.raced, 422);
    return denied(err);
  });
  return { sha: commit.sha, applied: suggestions.length };
}

/** Walks the tree from the root down the path's folders to read the file's mode. */
async function modeOf(api: ApplyDeps, owner: string, repo: string, rootTree: string, path: string): Promise<string> {
  const parts = path.split('/');
  let sha = rootTree;
  for (let i = 0; i < parts.length; i++) {
    const t = await api.gitTree(owner, repo, sha).catch(() => null);
    const entry = t?.tree.find((x) => x.path === parts[i]);
    if (!entry) return '100644';
    if (i === parts.length - 1) return entry.type === 'blob' ? entry.mode : '100644';
    if (entry.type !== 'tree') return '100644';
    sha = entry.sha;
  }
  return '100644';
}
