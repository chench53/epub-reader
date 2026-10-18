# 简单 EPUB 阅读器

下载了一个 epub 阅读器，居然有广告。于是让 gpt one-shot 了一个纯本地的 epub 阅读器。本地打开 EPUB 文件阅读，无书架、无账号、不上传书籍。已准备好离线依赖，日常使用只需要 Node.js（建议 22 或更新版本）和浏览器，不需要 Python。

## 启动

下载本仓库 ZIP 并解压，或使用 SSH 克隆：

```powershell
git clone git@github.com:chench53/epub-reader.git
Set-Location '.\epub-reader'
node start.cjs
```

仓库包含离线阅读组件，首次使用也无需运行 `npm install`。

双击本目录的 **start.cmd**，浏览器会自动打开阅读器。使用期间保留命令行窗口。

也可以在 PowerShell 中运行：

```powershell
Set-Location '.\epub-reader'
node start.cjs
```

默认地址：<http://127.0.0.1:8000/>。浏览器没有自动打开时，手动访问这个地址即可。

也可在程序目录运行 `npm start`。启动器仅使用 Node.js 内置模块，不需要额外安装服务端依赖。

## 阅读

1. 点击左上角 **打开 EPUB**，选择任意目录中的 `.epub` 文件。
2. 使用底部 **上一页 / 下一页**，或键盘 **← / →** 翻页。
3. 使用顶部 **目录** 下拉框跳转章节。没有目录的书籍仍可翻页。
4. 使用 **A− / A+** 调整字号，范围为 14–32px。
5. 再次点击 **打开 EPUB** 可以切换书籍；取消文件选择不会关闭当前书籍。

纯图片 SVG 封面会保持原始宽高比并居中显示，周围可能留白，不会强行拉满阅读区域。

正文获得焦点时也能用方向键翻页；焦点位于目录或按钮上时，方向键保留控件本身的操作。

## 退出

在启动窗口按 **Ctrl+C**，然后关闭浏览器页面即可。

## 常见问题

- **端口被占用**：运行 `node start.cjs --port 8001`，或 `.\start.cmd --port 8001`，再访问启动日志中的地址。使用 npm 时运行 `npm start -- --port 8001`。
- **只启动服务、不自动打开浏览器**：运行 `node start.cjs --no-browser`。
- **打不开文件**：只支持 EPUB，不支持 PDF、DRM 加密书籍。损坏或格式异常会显示错误；加载超过 30 秒会停止等待。
- **出现样式清单提示**：书籍引用了没有列入 EPUB 资源清单的样式，阅读器会忽略它，正文仍可阅读，外观可能与原书不同。
- **刷新后书籍关闭**：这是预期行为。当前版本不保存阅读进度或阅读历史，需重新选择文件。
- **能否离线使用**：可以。页面和阅读组件均在本地，书籍也在浏览器内读取。书中脚本及外部联网资源不启用，外部链接不打开。
- **不要直接双击网页文件**：请通过启动脚本或上述命令访问，避免浏览器对本地文件的限制。

## 重新安装依赖（通常不需要）

只有重新部署或本地阅读组件丢失时，才需要在程序目录联网执行：

```powershell
npm ci
npm run build
```

之后使用 `node start.cjs` 启动即可，不需要 Python。

依赖版本锁定在 `package-lock.json`；浏览器组件及其许可证位于 `web\vendor`。

## 开发验证

```powershell
npm test
node --check web\reader.js
```

本地服务仅监听 `127.0.0.1`，只提供程序的 `web` 子目录，不提供书籍目录浏览或书籍修改接口。

## 许可证

本项目代码采用 [MIT 许可证](LICENSE)。

随仓库提供的第三方组件保留其各自许可证：

- epub.js：BSD-2-Clause，见 [epubjs-LICENSE](web/vendor/epubjs-LICENSE)。
- JSZip：MIT 或 GPL-3.0 双许可证，本项目按 MIT 条款使用，见 [JSZip-LICENSE.markdown](web/vendor/JSZip-LICENSE.markdown)。

仓库不包含电子书；请自行选择有权阅读的 EPUB 文件。
