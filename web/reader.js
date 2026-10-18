"use strict";

const ui = Object.fromEntries(
  ["open", "file", "title", "chapters", "smaller", "larger", "font-size",
    "previous", "next", "status", "error", "empty", "viewer"]
    .map((id) => [id, document.getElementById(id)]),
);
let book = null;
let rendition = null;
let fontSize = 20;
let loading = false;
let navigating = false;
let chapterItems = [];

function showError(message, error) {
  console.error(message, error);
  ui.error.textContent = `${message}${error?.message ? `：${error.message}` : ""}`;
  ui.error.hidden = false;
}

function updateControls() {
  const ready = Boolean(rendition) && !loading && !navigating;
  ui.open.disabled = loading;
  ui.file.disabled = loading;
  ui.chapters.disabled = !ready || chapterItems.length === 0;
  ui.smaller.disabled = !ready || fontSize <= 14;
  ui.larger.disabled = !ready || fontSize >= 32;
  const location = rendition?.currentLocation();
  ui.previous.disabled = !ready || Boolean(location?.atStart);
  ui.next.disabled = !ready || Boolean(location?.atEnd);
  ui["font-size"].textContent = `${fontSize}px`;
}

function releaseBook() {
  if (book) book.destroy();
  rendition = null;
  book = null;
  ui.viewer.replaceChildren();
}

function flattenChapters(items, depth = 0) {
  for (const item of items) {
    if (item.href) {
      chapterItems.push(item);
      const option = document.createElement("option");
      option.value = String(chapterItems.length - 1);
      option.textContent = `${"　".repeat(depth)}${item.label.trim() || "未命名章节"}`;
      ui.chapters.append(option);
    }
    if (item.subitems?.length) flattenChapters(item.subitems, depth + 1);
  }
}

function updateLocation(location) {
  if (loading) return;
  const href = location.start?.href;
  const current = chapterItems.findLastIndex((item) => item.href.split("#")[0] === href);
  ui.chapters.value = current >= 0 ? String(current) : "";
  const chapter = current >= 0 ? chapterItems[current] : null;
  const label = chapter?.label?.trim() || "阅读中";
  ui.status.textContent = `${label}${location.atStart ? " · 全书开头" : ""}${location.atEnd ? " · 全书末尾" : ""}`;
  updateControls();
}

function onKey(event) {
  if (event.defaultPrevented || event.ctrlKey || event.altKey || event.metaKey ||
      event.shiftKey || ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(event.target.tagName) ||
      event.target.isContentEditable) return;
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    void navigate(event.key === "ArrowLeft" ? "prev" : "next");
  }
}

function sanitizeDocument(doc) {
  // Books are untrusted documents; keep text, styling and images, not active content.
  for (const element of doc.querySelectorAll("script, iframe, object, embed, form, meta[http-equiv]")) {
    element.remove();
  }
  for (const element of doc.querySelectorAll("*")) {
    for (const attribute of [...element.attributes]) {
      if (/^on/i.test(attribute.name) || /^(?:javascript|vbscript):/i.test(attribute.value.trim())) {
        element.removeAttribute(attribute.name);
      }
    }
    // Image-only SVG wrappers often stretch covers with preserveAspectRatio="none".
    for (const svg of doc.querySelectorAll("svg")) {
      const children = [...svg.children];
      if (children.filter((child) => child.localName === "image").length === 1 &&
          children.every((child) => ["image", "title", "desc", "metadata"].includes(child.localName))) {
        svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      }
    }
  }
}

function prepareContents(contents) {
  const doc = contents.document;
  doc.addEventListener("keydown", onKey);
  doc.addEventListener("click", (event) => {
    const link = event.target.closest?.("a[href]");
    if (!link) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const href = link.getAttribute("href");
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(href)) {
      showError("为保持本地阅读，已阻止打开书中的外部链接");
      return;
    }
    try {
      const url = new URL(href, doc.baseURI);
      void navigate("display", book.path.relative(url.pathname) + url.hash);
    } catch (error) {
      showError("无法打开书中的链接", error);
    }
  }, true);
}

async function openFile(file) {
  if (!file || loading) return;
  if (!file.name.toLowerCase().endsWith(".epub")) {
    showError("请选择 .epub 文件");
    return;
  }
  loading = true;
  ui.error.hidden = true;
  ui.empty.hidden = true;
  ui.viewer.hidden = false;
  ui.title.textContent = file.name;
  ui.status.textContent = "正在打开，请稍候…";
  chapterItems = [];
  ui.chapters.replaceChildren(new Option("选择章节", ""));
  updateControls();
  let timeout;
  try {
    releaseBook();
    book = ePub();
    const activeBook = book;
    const checkActive = () => {
      if (book !== activeBook) throw new Error("打开操作已取消");
    };
    const opening = async () => {
      const data = await file.arrayBuffer();
      checkActive();
      await activeBook.open(data, "binary");
      checkActive();
      await activeBook.loaded.navigation;
      checkActive();
      const resourcePaths = new Set(activeBook.resources.urls.map((href) =>
        new URL(activeBook.resolve(href), location.origin).pathname));
      const warnedStyles = new Set();
      activeBook.spine.hooks.content.register((doc, section) => {
        sanitizeDocument(doc);
        for (const link of doc.querySelectorAll("link[rel='stylesheet'][href]")) {
          const href = link.getAttribute("href");
          const url = new URL(href, new URL(section.url, location.origin));
          if (!resourcePaths.has(url.pathname) || url.origin !== location.origin) {
            link.remove();
            if (!warnedStyles.has(href)) {
              warnedStyles.add(href);
              showError(`书籍样式未列入 EPUB 资源清单，已忽略该样式（正文仍可阅读）：${href}`);
            }
          }
        }
      });
      rendition = activeBook.renderTo(ui.viewer, {
        width: "100%",
        height: "100%",
        spread: "none",
        flow: "paginated",
        allowScriptedContent: false,
        allowPopups: false,
      });
      rendition.hooks.content.register(prepareContents);
      rendition.themes.default({
        body: {
          color: "#273238 !important",
          background: "#fffdf7 !important",
          "line-height": "1.8 !important",
          "overflow-wrap": "break-word",
        },
        img: { "max-width": "100% !important", "object-fit": "contain" },
      });
      rendition.themes.fontSize(`${fontSize}px`);
      rendition.on("relocated", updateLocation);
      rendition.on("displayError", (error) => showError("章节显示失败", error));
      await rendition.display();
      checkActive();
      flattenChapters(activeBook.navigation.toc);
      const metadata = await activeBook.loaded.metadata;
      checkActive();
      ui.title.textContent = metadata.title || file.name;
      document.title = `${ui.title.textContent} - EPUB 阅读器`;
    };
    await Promise.race([
      opening(),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error("加载超过 30 秒，请确认文件未损坏且未加密")), 30000);
      }),
    ]);
    loading = false;
    updateLocation(rendition.currentLocation());
  } catch (error) {
    releaseBook();
    chapterItems = [];
    ui.chapters.replaceChildren(new Option("尚未打开书籍", ""));
    ui.viewer.hidden = true;
    ui.empty.hidden = false;
    ui.title.textContent = "EPUB 阅读器";
    document.title = "EPUB 阅读器";
    ui.status.textContent = "打开失败，可重新选择 EPUB 文件";
    showError("无法打开这本书（不支持 DRM 加密书籍）", error);
  } finally {
    clearTimeout(timeout);
    loading = false;
    updateControls();
  }
}

async function navigate(action, target) {
  if (!rendition || loading || navigating) return;
  navigating = true;
  ui.error.hidden = true;
  updateControls();
  try {
    if (action === "display") await rendition.display(target);
    else await rendition[action]();
  } catch (error) {
    showError("翻页或章节跳转失败", error);
  } finally {
    navigating = false;
    updateControls();
  }
}

function changeFont(delta) {
  if (!rendition || loading || navigating) return;
  fontSize = Math.max(14, Math.min(32, fontSize + delta));
  rendition.themes.fontSize(`${fontSize}px`);
  updateControls();
}

ui.open.addEventListener("click", () => ui.file.click());
ui.file.addEventListener("change", () => {
  const file = ui.file.files[0];
  ui.file.value = "";
  void openFile(file);
});
ui.previous.addEventListener("click", () => void navigate("prev"));
ui.next.addEventListener("click", () => void navigate("next"));
ui.chapters.addEventListener("change", () => {
  const item = chapterItems[Number(ui.chapters.value)];
  if (ui.chapters.value !== "" && item) void navigate("display", item.href);
});
ui.smaller.addEventListener("click", () => changeFont(-2));
ui.larger.addEventListener("click", () => changeFont(2));
document.addEventListener("keydown", onKey);
window.addEventListener("pagehide", releaseBook);
if (typeof ePub !== "function" || typeof JSZip !== "function") {
  ui.open.disabled = true;
  showError("阅读组件未加载，请在程序目录执行 npm install 和 npm run build，再刷新页面");
}
