# 0003: All GitHub access through one typed api module

**Context.** Every screen also has to work in sample mode, and paths spread across screens drift from the
mock data.

**Decision.** `packages/github/src/api.ts` defines every endpoint with typed results. `mock.ts` answers the
same paths from in-memory data. App hooks in `src/data/queries.ts` call only `api.*`. A test calls every
`api` function against sample data, and a live test calls the read endpoints against api.github.com.

**Consequences.** Adding an endpoint takes three edits: `api.ts`, `mock.ts` and `api.test.ts`. Screens
never construct URLs. The package has no React Native imports, so the extension and worker can share it.
