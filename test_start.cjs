const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");
const { createServer, parseArgs, checkDependencies } = require("./start.cjs");

let server;
let port;
before(async () => {
  server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = server.address().port;
});
after(() => new Promise((resolve) => server.close(resolve)));

function request(url, method = "GET") {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "127.0.0.1", port, path: url, method }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks),
      }));
      res.on("error", reject);
    });
    req.on("error", reject);
    req.setTimeout(5000, () => req.destroy(new Error("Request timed out")));
    req.end();
  });
}

test("UI and offline assets have correct MIME types and security headers", async () => {
  for (const [url, type] of [
    ["/", "text/html"], ["/reader.js", "text/javascript"], ["/reader.css", "text/css"],
    ["/vendor/epub.min.js", "text/javascript"], ["/vendor/jszip.min.js", "text/javascript"],
  ]) {
    const response = await request(url);
    assert.equal(response.status, 200, url);
    assert.ok(response.body.length > 0);
    assert.ok(response.headers["content-type"].startsWith(type));
    assert.ok(response.headers["content-security-policy"].includes("default-src 'none'"));
    assert.equal(response.headers["x-content-type-options"], "nosniff");
    assert.equal(response.headers["cache-control"], "no-cache");
  }
});

test("HEAD returns headers without a body, query strings are supported", async () => {
  const response = await request("/reader.js?v=1", "HEAD");
  assert.equal(response.status, 200);
  assert.ok(Number(response.headers["content-length"]) > 0);
  assert.equal(response.body.length, 0);
});

test("directory listings, outside files, malformed URLs and writes are blocked", async () => {
  assert.equal((await request("/vendor/")).status, 403);
  for (const url of ["/../package.json", "/%2e%2e/start.cjs", "/start.cjs"]) {
    assert.equal((await request(url)).status, 404, url);
  }
  for (const url of ["/%zz", "/%00", "/..%5cstart.cjs", "/file:stream"]) {
    assert.equal((await request(url)).status, 400, url);
  }
  assert.equal((await request("/", "POST")).status, 405);
});

test("arguments are validated", () => {
  assert.deepEqual(parseArgs([]), { port: 8000, browser: true, help: false });
  assert.equal(parseArgs(["--port", "0", "--no-browser"]).browser, false);
  assert.equal(parseArgs(["--port", "8001"]).port, 8001);
  assert.equal(parseArgs(["--help"]).help, true);
  for (const args of [["--port"], ["--port", "-1"], ["--port", "65536"],
    ["--port", "abc"], ["--port", "1.2"], ["--unknown"]]) {
    assert.throws(() => parseArgs(args));
  }
});

test("missing dependencies report actionable errors", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "epub-reader-test-"));
  try {
    assert.throws(() => checkDependencies(root), /npm run build/);
  } finally {
    fs.rmdirSync(root);
  }
});

test("CLI reports a busy port and invalid arguments", async () => {
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      path.join(__dirname, "start.cjs"), "--port", String(port), "--no-browser",
    ]);
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stderr }));
  });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /Cannot start server/);
  const invalid = spawnSync(process.execPath, [
    path.join(__dirname, "start.cjs"), "--port", "invalid",
  ], { encoding: "utf8", timeout: 5000 });
  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /--port/);
});
