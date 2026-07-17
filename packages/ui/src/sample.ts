import type { ReviewRecord, ReviewSummary } from "./types";

export const SAMPLE_REVIEW: ReviewRecord = {
  version: 1,
  id: "rev_sample_jwt_refactor",
  createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
  provider: "claude",
  model: "claude-opus-4-8",
  pr: {
    owner: "acme-corp",
    repo: "backend-api",
    number: 142,
    title: "Refactor auth middleware to JWT with refresh token rotation",
    author: "jsmith",
    url: "https://github.com/acme-corp/backend-api/pull/142",
    baseRef: "main",
    headRef: "feat/jwt-refresh",
    headSha: "a3f8d2c91e",
  },
  files: [
    { path: "src/middleware/auth.ts", additions: 87, deletions: 42, status: "modified" },
    { path: "src/routes/auth.ts", additions: 64, deletions: 18, status: "modified" },
    { path: "src/services/token.ts", additions: 112, deletions: 0, status: "added" },
    { path: "src/types/auth.ts", additions: 24, deletions: 8, status: "modified" },
    { path: "tests/auth.test.ts", additions: 156, deletions: 22, status: "modified" },
    { path: "package.json", additions: 3, deletions: 1, status: "modified" },
  ],
  result: {
    summary:
      "- **New Features**: Introduced JWT-based authentication with access/refresh token pair; added `POST /auth/refresh` endpoint for token rotation and `POST /auth/logout` for revocation\n- **Refactors**: Replaced session-cookie auth middleware with stateless JWT verification; extracted `TokenService` class from inline route logic\n- **Tests**: Expanded auth test suite to cover refresh flow, token expiry, concurrent request scenarios, and logout",
    walkthrough: [
      {
        files: ["src/services/token.ts"],
        summary:
          "New TokenService class handling JWT signing, verification, and refresh token lifecycle — including rotation and revocation",
      },
      {
        files: ["src/middleware/auth.ts", "src/types/auth.ts"],
        summary:
          "Auth middleware rewritten to verify Bearer JWTs; request type extended with decoded token payload",
      },
      {
        files: ["src/routes/auth.ts"],
        summary:
          "Login route updated to issue token pairs; new POST /auth/refresh and POST /auth/logout routes added",
      },
      {
        files: ["tests/auth.test.ts", "package.json"],
        summary: "Test suite expanded with 8 new cases; jsonwebtoken added as production dependency",
      },
    ],
    confidence: 3,
    verdict: "Solid architecture but a critical token storage flaw and a refresh race condition block merge",
    effort: 3,
    diagram: `sequenceDiagram
    participant C as Client
    participant A as Auth Route
    participant T as TokenService
    participant DB as Database
    C->>A: POST /auth/login
    A->>DB: Validate credentials
    DB-->>A: User record
    A->>T: generateTokenPair(userId)
    T-->>A: {accessToken, refreshToken}
    A-->>C: 200 {accessToken, refreshToken}
    Note over C,A: When access token expires
    C->>A: POST /auth/refresh
    A->>T: verifyRefreshToken(token)
    T->>DB: Lookup token hash
    DB-->>T: Token record
    T-->>A: userId
    A->>T: generateTokenPair(userId)
    T->>DB: Rotate refresh token
    T-->>A: {accessToken, refreshToken}
    A-->>C: 200 {accessToken, refreshToken}`,
    findings: [
      {
        path: "src/services/token.ts",
        line: 34,
        endLine: 38,
        severity: "critical",
        category: "security",
        title: "Refresh tokens stored as plaintext in the database",
        body: "Refresh tokens are stored verbatim in `token_store`. If the database is breached — via SQL injection, backup leak, or compromised credentials — every active session can be hijacked without expiry. Tokens must be stored as a cryptographic hash (`SHA-256`) with only the raw value returned to the client.\n\n**Failure scenario**: attacker reads `token_store` table → harvests plaintext refresh tokens → silently issues new access tokens for every user.",
        suggestion: `const hash = createHash("sha256").update(refreshToken).digest("hex");\nawait db.tokenStore.create({ userId, tokenHash: hash, expiresAt });`,
        fixPrompt:
          "In src/services/token.ts around lines 34–38, replace plaintext refresh token storage with a SHA-256 hash. Import `{ createHash }` from `'node:crypto'`. Store `createHash('sha256').update(refreshToken).digest('hex')` as `tokenHash` instead of the raw token. Update verifyRefreshToken to hash the incoming token before comparing against stored values.",
      },
      {
        path: "src/routes/auth.ts",
        line: 78,
        severity: "critical",
        category: "stability",
        title: "Refresh endpoint has a TOCTOU race condition under concurrent requests",
        body: "The refresh handler reads the token record, validates it, then deletes and issues a new one in three separate DB operations. Under concurrent requests (e.g. tab reload + background fetch expiring simultaneously), two requests can read the same valid token before either deletes it — both succeed and issue different token pairs, leaving the client with stale tokens.\n\n**Failure scenario**: mobile app retries on network loss → two parallel `/auth/refresh` calls arrive within milliseconds → both pass `verifyRefreshToken` → both rotate → one write wins, the other's new token is unknown → silent logout.",
        fixPrompt:
          "Wrap the verify + delete + insert sequence in a single database transaction, or use an atomic compare-and-delete: `DELETE FROM token_store WHERE token_hash = ? AND expires_at > NOW() RETURNING id` — only issue a new pair if the DELETE affected exactly one row. Implement this in src/routes/auth.ts around line 78.",
      },
      {
        path: "src/middleware/auth.ts",
        line: 22,
        severity: "major",
        category: "security",
        title: "JWT algorithm not pinned — accepts any alg including 'none'",
        body: "The `verify` call uses default algorithm detection from the token header. A crafted token with `\"alg\": \"none\"` bypasses signature verification on some jsonwebtoken configurations. Pin the algorithm explicitly.\n\n**Failure scenario**: attacker forges a token with `alg: none` and a valid payload → middleware accepts it → attacker impersonates any user ID.",
        suggestion: `const payload = verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as JwtPayload;`,
        fixPrompt:
          "In src/middleware/auth.ts line 22, add `{ algorithms: ['HS256'] }` as the third argument to `verify()` to pin the JWT algorithm and prevent algorithm confusion attacks.",
      },
      {
        path: "src/services/token.ts",
        line: 61,
        severity: "major",
        category: "correctness",
        title: "Expired refresh tokens are never pruned from the database",
        body: "Token records accumulate indefinitely. A table that grows unbounded degrades query performance over time and increases the blast radius of any breach (more tokens to steal).\n\nA background cleanup job, TTL index, or inline prune-on-refresh is needed.",
        fixPrompt:
          "Add a cleanup mechanism for expired refresh tokens. Options: (1) add a scheduled job running `DELETE FROM token_store WHERE expires_at < NOW()`, (2) use your database's TTL feature, or (3) add an inline `DELETE WHERE expires_at < NOW()` at the top of verifyRefreshToken. Implement in src/services/token.ts.",
      },
      {
        path: "src/routes/auth.ts",
        line: 112,
        severity: "minor",
        category: "maintainability",
        title: "Access token TTL (900s) duplicated across three files",
        body: "The 15-minute access token TTL is hardcoded as `900` in `token.ts`, `auth.ts`, and a test helper. Extract to a single constant so a future change only needs one edit.",
        fixPrompt:
          "Create src/config/auth.ts exporting `ACCESS_TOKEN_TTL_SECONDS = 900` and `REFRESH_TOKEN_TTL_DAYS = 30`. Replace all hardcoded `900` and `2592000` values in src/services/token.ts, src/routes/auth.ts, and tests/auth.test.ts with these constants.",
      },
      {
        path: "tests/auth.test.ts",
        line: 45,
        severity: "trivial",
        category: "maintainability",
        title: "Test description says 'should return 200' but doesn't assert the status code",
        body: "The test asserts only the response body shape, not the HTTP status. Minor mismatch between description and assertion.",
        fixPrompt:
          "In tests/auth.test.ts line 45, add `expect(res.status).toBe(200);` after the existing assertions so the test name matches what's verified.",
      },
    ],
  },
  posted: false,
};

export const SAMPLE_REVIEWS: ReviewSummary[] = [
  {
    id: SAMPLE_REVIEW.id,
    createdAt: SAMPLE_REVIEW.createdAt,
    provider: SAMPLE_REVIEW.provider,
    pr: SAMPLE_REVIEW.pr,
    confidence: SAMPLE_REVIEW.result.confidence,
    findings: SAMPLE_REVIEW.result.findings.length,
    posted: SAMPLE_REVIEW.posted,
  },
  {
    id: "rev_sample_perf_db",
    createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    provider: "claude",
    pr: {
      owner: "acme-corp",
      repo: "backend-api",
      number: 138,
      title: "Add database connection pooling and query result caching",
      author: "alice",
      url: "https://github.com/acme-corp/backend-api/pull/138",
      baseRef: "main",
      headRef: "perf/db-pooling",
      headSha: "c9e1a4b3f2",
    },
    confidence: 4,
    findings: 2,
    posted: true,
  },
];
