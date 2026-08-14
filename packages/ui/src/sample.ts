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
    judgements: [
      {
        path: "src/services/token.ts",
        line: 34,
        endLine: 38,
        severity: "critical",
        kind: "Risk",
        tag: "touches how logging out works",
        title: "Renewal tokens are saved in a form that can be read back.",
        lede: "Anyone who can read the database — a leaked backup, a bad query, a stolen credential — can act as any logged-in user, for as long as that user's session would have lasted.",
        detail: "The alternative is to store a one-way fingerprint and compare fingerprints instead of tokens. It costs one line and nothing at runtime. No reason to skip it was given in the change.",
        ask: "Do we accept a database read being equivalent to every user's password?",
        sources: ["the diff", "PR description"],
        sourceNote: "Nothing in the change explains the choice, so this reads as an oversight rather than a decision.",
        code: "src/services/token.ts:34-38\nawait db.tokenStore.create({ userId, token: refreshToken, expiresAt });",
        options: [
          { label: "No — this must be a fingerprint before merge", bucket: "Blocks" },
          { label: "Yes — accepted, and written down as a decision", bucket: "Agreed" },
          { label: "I have a question first", bucket: "Asked" },
          { label: "Not my call — hand it to someone who knows", bucket: "Passed on" },
        ],
        suggestion: `const hash = createHash("sha256").update(refreshToken).digest("hex");\nawait db.tokenStore.create({ userId, tokenHash: hash, expiresAt });`,
        fixPrompt:
          "In src/services/token.ts around lines 34–38, replace plaintext refresh token storage with a SHA-256 hash. Import `{ createHash }` from `'node:crypto'`. Store `createHash('sha256').update(refreshToken).digest('hex')` as `tokenHash` instead of the raw token. Update verifyRefreshToken to hash the incoming token before comparing against stored values.",
      },
      {
        path: "src/routes/auth.ts",
        line: 78,
        severity: "critical",
        kind: "Behaviour",
        tag: "shows up as random logouts",
        title: "Two simultaneous renewals log the user out with no explanation.",
        lede: "A tab reload plus a background fetch is enough. Both requests read the same valid token, both renew, one write wins — and the client is left holding a token nobody recognises.",
        detail: "Renewing in one indivisible step would refuse the second attempt instead. As written, support sees a random logout that cannot be reproduced on request.",
        ask: "Does this block merge, or do we ship it and measure?",
        sources: ["the diff"],
        sourceNote: "Read from the diff alone. No ticket describes this behaviour yet.",
        code: "src/routes/auth.ts:78   read → validate → delete → insert (four separate steps)",
        options: [
          { label: "Blocks — renewal has to be one step", bucket: "Blocks" },
          { label: "Ship it — add a metric and revisit", bucket: "Agreed" },
          { label: "I have a question first", bucket: "Asked" },
          { label: "Not my call — hand it to someone who knows", bucket: "Passed on" },
        ],
        fixPrompt:
          "Wrap the verify + delete + insert sequence in a single database transaction, or use an atomic compare-and-delete: `DELETE FROM token_store WHERE token_hash = ? AND expires_at > NOW() RETURNING id` — only issue a new pair if the DELETE affected exactly one row. Implement this in src/routes/auth.ts around line 78.",
      },
      {
        path: "src/middleware/auth.ts",
        line: 22,
        severity: "major",
        kind: "Risk",
        tag: "signing in",
        title: "The token is trusted to say how it was signed.",
        lede: "Verification reads the algorithm out of the token itself, so a forged token can claim it needs no signature at all.",
        detail: "Pinning one algorithm closes it. There is no case for leaving it open in a first-party API.",
        ask: "Anything here worth keeping, or is this simply a fix?",
        sources: ["the diff"],
        sourceNote: "Nothing in the change disputes pinning the algorithm, so this reads as an oversight rather than a choice.",
        code: "src/middleware/auth.ts:22   verify(token, JWT_SECRET)   // no algorithms option",
        options: [
          { label: "Just a fix — pin it", bucket: "Blocks" },
          { label: "Accept as is", bucket: "Agreed" },
          { label: "I have a question first", bucket: "Asked" },
          { label: "Not my call — hand it to someone who knows", bucket: "Passed on" },
        ],
        suggestion: `const payload = verify(token, JWT_SECRET, { algorithms: ["HS256"] }) as JwtPayload;`,
        fixPrompt:
          "In src/middleware/auth.ts line 22, add `{ algorithms: ['HS256'] }` as the third argument to `verify()` to pin the JWT algorithm and prevent algorithm confusion attacks.",
      },
      {
        path: "src/services/token.ts",
        line: 61,
        severity: "major",
        kind: "Domain",
        tag: "reaches outside auth",
        title: "The token store becomes a permanent record of every session ever opened.",
        lede: "A row used to mean \u201Ca session\u201D. Nothing deletes expired rows any more, so a row now means \u201Ca session, ever\u201D — who signed in, from when, for how long.",
        detail: "This is not a bug. It is a new thing the product keeps, which means deleting a user is not finished until this table is included, and someone outside this pull request owns that promise.",
        ask: "Are we willing to keep a permanent sign-in history, and is that written down anywhere?",
        sources: ["the diff"],
        sourceNote: "Nothing in the change enforces a retention cap, and no document was provided that describes one.",
        code: "src/services/token.ts:61   no prune, no TTL index, no cleanup job",
        options: [
          { label: "Yes — and it needs an ADR before merge", bucket: "Agreed" },
          { label: "No — expired rows should be removed", bucket: "Blocks" },
          { label: "I have a question first", bucket: "Asked" },
          { label: "Not my call — hand it to whoever owns retention", bucket: "Passed on" },
        ],
        fixPrompt:
          "Add a cleanup mechanism for expired refresh tokens. Options: (1) add a scheduled job running `DELETE FROM token_store WHERE expires_at < NOW()`, (2) use your database's TTL feature, or (3) add an inline `DELETE WHERE expires_at < NOW()` at the top of verifyRefreshToken. Implement in src/services/token.ts.",
      },
      {
        path: "src/routes/auth.ts",
        line: 112,
        severity: "minor",
        kind: "Choice",
        tag: "housekeeping",
        title: "Session length is defined in three separate places.",
        lede: "Fifteen minutes is written into the token service, the auth route, and a test helper. Changing it means remembering all three.",
        detail: "Small, but it is the kind of thing that quietly drifts apart and then argues with itself in production.",
        ask: "Worth one constant, or leave it?",
        sources: ["the diff"],
        sourceNote: "Read from the diff alone. No ticket or document mentions session length.",
        code: "src/services/token.ts:12   900\nsrc/routes/auth.ts:112     900\ntests/auth.test.ts:9       900",
        options: [
          { label: "One constant, please", bucket: "Agreed" },
          { label: "Leave it — not worth the churn", bucket: "Agreed" },
          { label: "I have a question first", bucket: "Asked" },
          { label: "Not my call — hand it to someone who knows", bucket: "Passed on" },
        ],
        fixPrompt:
          "Create src/config/auth.ts exporting `ACCESS_TOKEN_TTL_SECONDS = 900` and `REFRESH_TOKEN_TTL_DAYS = 30`. Replace all hardcoded `900` and `2592000` values in src/services/token.ts, src/routes/auth.ts, and tests/auth.test.ts with these constants.",
      },
      {
        path: "tests/auth.test.ts",
        line: 45,
        severity: "trivial",
        kind: "Unsure",
        tag: "a test that may not test",
        title: "A test named for a status code never checks the status code.",
        lede: "The test asserts the shape of the response body and stops there. Its name promises it checks for a 200.",
        detail: "Harmless if the status is covered elsewhere. Komodo could not see the rest of the suite, so this may already be tested somewhere it could not read.",
        ask: "Is the status covered elsewhere, or should this test say what it means?",
        sources: ["the diff"],
        sourceNote: "Only the changed test file was visible. Treat this as a question, not a finding.",
        code: "tests/auth.test.ts:45   expects body shape only",
        options: [
          { label: "Add the status assertion", bucket: "Agreed" },
          { label: "Covered elsewhere — leave it", bucket: "Agreed" },
          { label: "I have a question first", bucket: "Asked" },
          { label: "Not my call — hand it to someone who knows", bucket: "Passed on" },
        ],
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
    judgements: SAMPLE_REVIEW.result.judgements.length,
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
    judgements: 2,
    posted: true,
  },
];
