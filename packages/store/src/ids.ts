/**
 * Ids for the rows that have no natural key.
 *
 * Almost everything Komodo stores derives its id from what it is — a pull
 * request is `${repoId}#${number}`, a judgment is `${prId}@${headSha}` — which
 * is what makes the writers idempotent and the restarts safe. A memory rule
 * has no such key: it is a sentence someone typed, and two people can type the
 * same one and mean different things. Append-only observations have no natural
 * key either. These get a generated id here so both drivers produce the same
 * shape.
 */
import { randomUUID } from "node:crypto";

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}
