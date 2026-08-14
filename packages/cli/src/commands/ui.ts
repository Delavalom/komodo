import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import pc from "picocolors";
import { LocalReviewStore } from "../local-store.js";

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function uiCommand(opts: { port: string }): Promise<void> {
  const port = parseInt(opts.port, 10);
  const reviewsDir = join(process.cwd(), ".komodo", "reviews");
  const uiDir = join(fileURLToPath(new URL(".", import.meta.url)), "ui");

  if (!existsSync(uiDir)) {
    console.error(pc.red("UI assets missing from this installation."));
    process.exit(1);
  }

  const store = new LocalReviewStore(reviewsDir);

  const server = createServer((req, res) => {
    void handle(req, res).catch((err: unknown) => {
      json(res, 400, { error: err instanceof Error ? err.message : "Request failed." });
    });
  });

  async function handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://localhost");
    const path = url.pathname;

    // ---- read-only viewer (unchanged paths: older UI bundles still call these) ----
    if (req.method === "GET" && path === "/api/reviews") {
      return json(res, 200, store.listSummaries());
    }

    const recordMatch = /^\/api\/reviews\/(.+)$/.exec(path);
    if (req.method === "GET" && recordMatch) {
      const record = store.readRecord(decodeURIComponent(recordMatch[1]));
      return record ? json(res, 200, record) : json(res, 404, { error: "Review not found." });
    }

    // ---- the judge flow's store, namespaced so it cannot collide ----
    if (req.method === "GET" && path === "/api/store/queue") {
      return json(res, 200, await store.loadQueue());
    }

    const reviewMatch = /^\/api\/store\/reviews\/(.+)$/.exec(path);
    if (req.method === "GET" && reviewMatch) {
      const loaded = await store.loadReviewJudgements(decodeURIComponent(reviewMatch[1]));
      return loaded ? json(res, 200, loaded) : json(res, 404, { error: "Review not found." });
    }

    const threadMatch = /^\/api\/store\/judgements\/(.+)\/thread$/.exec(path);
    if (req.method === "GET" && threadMatch) {
      const id = decodeURIComponent(threadMatch[1]);
      // No webhook locally: catch up on replies whenever the thread is opened.
      await store.syncThread(id).catch(() => {});
      const thread = await store.loadThread(id);
      return thread ? json(res, 200, thread) : json(res, 404, { error: "Thread not found." });
    }

    if (req.method === "POST" && path.startsWith("/api/store/")) {
      const body = await readBody(req);
      const id = String(body.judgementId ?? "");

      switch (path) {
        case "/api/store/answer":
          await store.answer(id, Number(body.optionIndex));
          return json(res, 200, {});
        case "/api/store/undo":
          await store.undoAnswer(id);
          return json(res, 200, {});
        case "/api/store/ask":
          return json(res, 200, await store.ask(id, String(body.note ?? ""), Boolean(body.blocking)));
        case "/api/store/close-thread":
          await store.closeThread(id);
          return json(res, 200, {});
        case "/api/store/post-review":
          return json(res, 200, await store.postReview(String(body.reviewId ?? "")));
      }
      return json(res, 404, { error: "Unknown endpoint." });
    }

    // ---- static UI with SPA fallback ----
    let filePath = join(uiDir, normalize(path).replace(/^\/+/, "") || "index.html");
    if (!filePath.startsWith(uiDir) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
      filePath = join(uiDir, "index.html");
    }
    res.writeHead(200, { "Content-Type": MIME[extname(filePath)] ?? "application/octet-stream" });
    createReadStream(filePath).pipe(res);
  }

  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log(`\n🦎 Komodo → ${pc.bold(pc.cyan(url))}`);
    console.log(pc.dim(`Reviews from ${reviewsDir}\nCtrl+C to stop`));
  });
}
