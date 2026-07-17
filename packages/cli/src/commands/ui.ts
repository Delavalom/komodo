import { createReadStream, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import pc from "picocolors";

const MIME: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

export async function uiCommand(opts: { port: string }): Promise<void> {
  const port = parseInt(opts.port, 10);
  const reviewsDir = join(process.cwd(), ".komodo", "reviews");
  const uiDir = join(fileURLToPath(new URL(".", import.meta.url)), "ui");

  if (!existsSync(uiDir)) {
    console.error(pc.red("UI assets missing from this installation."));
    process.exit(1);
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (url.pathname === "/api/reviews") {
      const list = existsSync(reviewsDir)
        ? readdirSync(reviewsDir)
            .filter((f) => f.endsWith(".json"))
            .map((f) => {
              const record = JSON.parse(readFileSync(join(reviewsDir, f), "utf8"));
              return {
                id: record.id,
                createdAt: record.createdAt,
                provider: record.provider,
                pr: record.pr,
                confidence: record.result.confidence,
                findings: record.result.findings.length,
                posted: record.posted,
              };
            })
            .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        : [];
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(list));
      return;
    }
    const detail = /^\/api\/reviews\/(.+)$/.exec(url.pathname);
    if (detail) {
      const file = join(reviewsDir, `${detail[1]}.json`);
      if (normalize(file).startsWith(reviewsDir) && existsSync(file)) {
        res.writeHead(200, { "Content-Type": "application/json" });
        createReadStream(file).pipe(res);
      } else {
        res.writeHead(404).end("not found");
      }
      return;
    }
    // static UI with SPA fallback
    let filePath = join(uiDir, normalize(url.pathname).replace(/^\/+/, "") || "index.html");
    if (!filePath.startsWith(uiDir) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
      filePath = join(uiDir, "index.html");
    }
    res.writeHead(200, { "Content-Type": MIME[extname(filePath)] ?? "application/octet-stream" });
    createReadStream(filePath).pipe(res);
  });

  server.listen(port, () => {
    const url = `http://localhost:${port}`;
    console.log(`\n🦎 Komodo review viewer → ${pc.bold(pc.cyan(url))}`);
    console.log(pc.dim(`Serving reviews from ${reviewsDir}\nCtrl+C to stop`));
  });
}
