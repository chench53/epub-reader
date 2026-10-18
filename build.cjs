const fs = require("node:fs");
const path = require("node:path");

const target = path.join(__dirname, "web", "vendor");
fs.mkdirSync(target, { recursive: true });
for (const [source, name] of [
  ["jszip/dist/jszip.min.js", "jszip.min.js"],
  ["epubjs/dist/epub.min.js", "epub.min.js"],
  ["jszip/LICENSE.markdown", "JSZip-LICENSE.markdown"],
  ["epubjs/license", "epubjs-LICENSE"],
]) {
  fs.copyFileSync(require.resolve(source), path.join(target, name));
}
console.log("Local browser dependencies are ready.");
