import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { closeDatabase, ensureSchema, pingDatabase } from "./server/db.js";
import { handleApiRequest } from "./server/payments.js";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));
const publicRoot = resolve(projectRoot, "dist");
const apiOnly = process.argv.includes("--api-only");
const port = Number.parseInt(apiOnly ? (process.env.API_PORT || "3001") : (process.env.PORT || "3000"), 10);
const host = apiOnly ? "127.0.0.1" : "0.0.0.0";
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};
let ready = false;
let shuttingDown = false;

function sendText(response, status, text) {
  const body = Buffer.from(text);
  response.writeHead(status, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": body.length,
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Cache-Control": "no-store",
  });
  response.end(body);
}

const server = createServer(async (request, response) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url || "/", "http://localhost").pathname);
  } catch {
    sendText(response, 400, "Bad request");
    return;
  }

  if (pathname === "/healthz") {
    if (!ready || (request.method !== "GET" && request.method !== "HEAD")) {
      response.setHeader("Allow", "GET, HEAD");
      sendText(response, ready ? 405 : 503, ready ? "Method not allowed" : "Not ready");
      return;
    }
    try {
      await pingDatabase();
      response.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Length": 2,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(request.method === "HEAD" ? undefined : "ok");
    } catch {
      sendText(response, 503, "Not ready");
    }
    return;
  }

  if (pathname.startsWith("/api/")) {
    await handleApiRequest(request, response);
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    sendText(response, 405, "Method not allowed");
    return;
  }
  if (apiOnly) {
    sendText(response, 404, "Not found");
    return;
  }

  const candidate = resolve(publicRoot, `.${pathname}`);
  if (candidate !== publicRoot && !candidate.startsWith(`${publicRoot}${sep}`)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  let filePath = candidate;
  try {
    if (!(await stat(filePath)).isFile()) throw new Error("not_a_file");
  } catch {
    if (extname(pathname)) {
      sendText(response, 404, "Not found");
      return;
    }
    filePath = resolve(publicRoot, "index.html");
  }

  const extension = extname(filePath).toLowerCase();
  const cacheControl = pathname.startsWith("/assets/") && !pathname.endsWith("upi-payment-qr.jpeg")
    ? "public, max-age=31536000, immutable"
    : pathname.endsWith("upi-payment-qr.jpeg")
      ? "public, max-age=3600"
      : "no-cache";
  response.writeHead(200, {
    "Content-Type": contentTypes[extension] || "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Cache-Control": cacheControl,
  });
  if (request.method === "HEAD") {
    response.end();
    return;
  }
  const stream = createReadStream(filePath);
  stream.on("error", () => {
    if (!response.headersSent) sendText(response, 500, "Internal server error");
    else response.destroy();
  });
  stream.pipe(response);
});

async function start() {
  await ensureSchema();
  ready = true;
  server.listen(port, host, () => {
    console.log(`PawSupply ${apiOnly ? "API" : "production"} server listening on ${host}:${port}`);
  });
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  server.close(async () => {
    await closeDatabase().catch(() => {});
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
start().catch((error) => {
  console.error("[startup] PawSupply could not initialize", error?.code || "database_error");
  process.exit(1);
});
