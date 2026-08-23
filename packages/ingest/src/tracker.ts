/**
 * Reading the issue a pull request is about.
 *
 * The integrations screen offered three vendors and connecting one wrote a
 * row to localStorage. This is the smallest version of it that is worth
 * having: when a pull request's title or branch names an issue, fetch that
 * issue and hand its text to the reviewer with the diff.
 *
 * That is the one thing a tracker is actually good for here. A review's
 * hardest question is usually "is this the right change", and the answer is
 * in the ticket, not the diff — a reviewer that has read neither is guessing.
 *
 * Deliberately not OAuth. A self-hosted single-team deployment has an admin
 * who can paste a token, and a three-way OAuth dance would be more moving
 * parts than the feature is worth.
 */
import type { KomodoStore } from "@komodo/store";
import type { ReviewMemory } from "@komodo/core";

/** How long to wait on a tracker before giving up and reviewing without it. */
const TIMEOUT_MS = 10_000;

/** Trims an issue body to something that informs a review rather than floods it. */
const MAX_BODY_CHARS = 4_000;

export interface IssueRef {
  provider: "linear" | "jira";
  key: string;
}

export interface TrackerIssue {
  key: string;
  title: string;
  body: string;
  url: string;
}

/**
 * Issue keys in a title or branch name.
 *
 * Both trackers use `ABC-123`, which is also a shape that occurs in ordinary
 * English ("UTF-8", "SHA-256"), so the match is deliberately conservative:
 * two or more letters, a hyphen, digits, at a word boundary. A false positive
 * costs one failed lookup and nothing else, but it is still noise in a log.
 */
const ISSUE_KEY = /\b([A-Z][A-Z0-9]{1,9})-(\d{1,6})\b/g;

export function findIssueKeys(...texts: string[]): string[] {
  const keys = new Set<string>();
  for (const text of texts) {
    for (const match of (text ?? "").toUpperCase().matchAll(ISSUE_KEY)) {
      keys.add(`${match[1]}-${match[2]}`);
    }
  }
  return [...keys];
}

/**
 * Fetches whatever the connected tracker knows about these keys.
 *
 * Best effort throughout, and quiet about it: a review that happens without
 * the ticket is worth more than a review that does not happen. A failure is
 * recorded on the integration so the screen can say the connection is broken,
 * which is the one place it matters.
 */
export async function fetchIssueContext(args: {
  store: KomodoStore;
  keys: string[];
  onProgress?: (msg: string) => void;
}): Promise<ReviewMemory[]> {
  const { store, keys, onProgress } = args;
  if (!keys.length) return [];

  const out: ReviewMemory[] = [];
  for (const provider of ["linear", "jira"] as const) {
    const connected = await store.loadIntegrationToken(provider).catch(() => null);
    if (!connected) continue;

    try {
      const issues = await fetchFrom(provider, connected.token, connected.integration, keys);
      for (const issue of issues) {
        out.push({
          label: `${issue.key} — ${issue.title}`,
          text: `${issue.body}\n\n(${issue.url})`,
        });
      }
      await store.setIntegrationError(provider, null);
      // The first tracker that answers wins: a key belongs to one of them,
      // and asking the other for it just produces a 404 to swallow.
      if (issues.length) break;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      onProgress?.(`  could not reach ${provider}: ${detail}`);
      await store.setIntegrationError(provider, detail).catch(() => {});
    }
  }
  return out;
}

async function fetchFrom(
  provider: "linear" | "jira",
  token: string,
  integration: { baseUrl: string; account: string },
  keys: string[],
): Promise<TrackerIssue[]> {
  return provider === "linear"
    ? fetchLinear(token, keys)
    : fetchJira(token, integration, keys);
}

/** Linear's GraphQL API takes the human-readable key directly. */
async function fetchLinear(token: string, keys: string[]): Promise<TrackerIssue[]> {
  const out: TrackerIssue[] = [];
  for (const key of keys) {
    const res = await request("https://api.linear.app/graphql", {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify({
        query:
          "query($id:String!){issue(id:$id){identifier title description url}}",
        variables: { id: key },
      }),
    });
    if (!res.ok) continue;
    const data = (await res.json()) as {
      data?: { issue?: { identifier: string; title: string; description: string | null; url: string } };
    };
    const issue = data.data?.issue;
    if (!issue) continue;
    out.push({
      key: issue.identifier,
      title: issue.title,
      body: trim(issue.description ?? ""),
      url: issue.url,
    });
  }
  return out;
}

/** Jira Cloud, basic auth over `email:api-token` against the site's own host. */
async function fetchJira(
  token: string,
  integration: { baseUrl: string; account: string },
  keys: string[],
): Promise<TrackerIssue[]> {
  const base = integration.baseUrl.replace(/\/$/, "");
  if (!base) throw new Error("Jira needs a site URL — set it on the integration.");

  const auth = Buffer.from(`${integration.account}:${token}`).toString("base64");
  const out: TrackerIssue[] = [];

  for (const key of keys) {
    const res = await request(
      `${base}/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,description`,
      { headers: { Authorization: `Basic ${auth}`, Accept: "application/json" } },
    );
    if (!res.ok) continue;
    const data = (await res.json()) as {
      key: string;
      fields: { summary: string; description?: unknown };
    };
    out.push({
      key: data.key,
      title: data.fields.summary,
      // Jira 3 returns Atlassian Document Format, not text. Walking the whole
      // node tree is not worth it; the text nodes are what a reviewer reads.
      body: trim(textFromAdf(data.fields.description)),
      url: `${base}/browse/${data.key}`,
    });
  }
  return out;
}

/** A tracker that hangs must not hang the review. */
async function request(url: string, init: RequestInit): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
}

const trim = (text: string): string =>
  text.length > MAX_BODY_CHARS
    ? `${text.slice(0, MAX_BODY_CHARS)}\n…(truncated)`
    : text;

/** Every text node in an Atlassian Document Format tree, in order. */
function textFromAdf(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { type?: string; text?: string; content?: unknown[] };
  if (typeof n.text === "string") return n.text;
  if (!Array.isArray(n.content)) return "";
  const parts = n.content.map(textFromAdf).filter(Boolean);
  // Block-level nodes become their own lines; inline ones run together.
  return n.type === "paragraph" || n.type === "heading"
    ? `${parts.join("")}\n`
    : parts.join("");
}
