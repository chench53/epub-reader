const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const WEB_ROOT = path.join(__dirname, "web");
const HEADERS = {
  "Content-Security-Policy": "default-src 'none'; script-src 'self'; " +
    "style-src 'self' 'unsafe-inline' blob:; img-src 'self' blob: data:; " +
    "font-src 'self' blob: data:; connect-src 'self' blob:; " +
    "frame-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'",
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "no-cache",
};
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".markdown": "text/plain; charset=utf-8",
};

function parseArgs(args) {
  const options = { port: 8000, browser: true, help: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--no-browser") options.browser = false;
    else if (args[i] === "--help" || args[i] === "-h") options.help = true;
    else if (args[i] === "--port") {
      const value = args[++i];
      if (!/^\d+$/.test(value || "") || Number(value) > 65535) {
        throw new Error("--port must be an integer between 0 and 65535");
      }
      options.port = Number(value);
    } else throw new Error(`Unknown argument: ${args[i]}`);
  }
  return options;
}

function checkDependencies(root = WEB_ROOT) {
  for (const name of ["epub.min.js", "jszip.min.js"]) {
    if (!fs.statSync(path.join(root, "vendor", name), { throwIfNoEntry: false })?.isFile()) {
      throw new Error("Missing browser dependencies. Run: npm ci, then npm run build.");
    }
  }
}

function isWithin(root, file) {
  const relative = path.relative(root, file);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function createServer(root = WEB_ROOT) {
  const realRoot = fs.realpathSync(root);
  return http.createServer(async (req, res) => {
    const reply = (status, message, headers = {}) => {
      res.writeHead(status, { ...HEADERS, "Content-Type": "text/plain; charset=utf-8", ...headers });
      res.end(req.method === "HEAD" ? undefined : message);
    };
    if (!["GET", "HEAD"].includes(req.method)) {
      reply(405, "Method not allowed", { Allow: "GET, HEAD" });
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(req.url.split("?")[0]);
    } catch {
      reply(400, "Invalid URL encoding");
      return;
    }
    if (!pathname.startsWith("/") || /[\\:\0]/.test(pathname)) {
      reply(400, "Invalid path");
      return;
    }
    const file = path.resolve(realRoot, "." + (pathname === "/" ? "/index.html" : pathname));
    if (!isWithin(realRoot, file)) {
      reply(404, "File not found");
      return;
    }
    let handle;
    try {
      const realFile = await fs.promises.realpath(file);
      if (!isWithin(realRoot, realFile)) {
        reply(404, "File not found");
        return;
      }
      handle = await fs.promises.open(realFile, "r");
      const stat = await handle.stat();
      if (!stat.isFile()) {
        await handle.close();
        reply(403, "Directory listing is disabled");
        return;
      }
      res.writeHead(200, {
        ...HEADERS,
        "Content-Type": MIME_TYPES[path.extname(realFile).toLowerCase()] || "application/octet-stream",
        "Content-Length": stat.size,
      });
      if (req.method === "HEAD") {
        await handle.close();
        res.end();
        return;
      }
      const stream = handle.createReadStream();
      stream.on("error", (error) => {
        console.error(`Cannot stream ${pathname}: ${error.message}`);
        res.destroy(error);
      });
      res.on("close", () => stream.destroy());
      stream.pipe(res);
    } catch (error) {
      if (handle) await handle.close();
      if (["ENOENT", "ENOTDIR"].includes(error.code)) reply(404, "File not found");
      else if (["EACCES", "EPERM", "EISDIR"].includes(error.code)) reply(403, "Access denied");
      else {
        console.error(`Cannot serve ${pathname}: ${error.message}`);
        if (res.headersSent) res.destroy(error);
        else reply(500, "Cannot read file");
      }
    }
  });
}

function openBrowser(url) {
  let command;
  let args;
  if (process.platform === "win32") {
    command = process.env.ComSpec || "cmd.exe";
    args = ["/d", "/c", "start", '""', url];
  } else if (process.platform === "darwin") {
    command = "open";
    args = [url];
  } else {
    command = "xdg-open";
    args = [url];
  }
  const child = spawn(command, args, { stdio: "ignore", windowsHide: true });
  child.on("error", (error) => {
    console.error(`Cannot open browser: ${error.message}. Open ${url} manually.`);
  });
  child.on("exit", (code) => {
    if (code !== null && code !== 0) {
      console.error(`Browser launcher exited with code ${code}. Open ${url} manually.`);
    }
  });
}

function main(args = process.argv.slice(2)) {
  const options = parseArgs(args);
  if (options.help) {
    console.log("Usage: node start.cjs [--port PORT] [--no-browser]\nPress Ctrl+C to stop.");
    return;
  }
  checkDependencies();
  const server = createServer();
  server.on("error", (error) => {
    console.error(`Cannot start server: ${error.message}. Try --port 8001.`);
    process.exitCode = 1;
  });
  server.listen({ host: "127.0.0.1", port: options.port, exclusive: true }, () => {
    const url = `http://127.0.0.1:${server.address().port}/`;
    console.log(`EPUB reader: ${url}\nPress Ctrl+C to stop.`);
    if (options.browser) openBrowser(url);
  });
  process.once("SIGINT", () => {
    server.close(() => console.log("\nServer stopped."));
    server.closeAllConnections();
  });
  return server;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { createServer, parseArgs, checkDependencies, openBrowser };
