# 墨阅

[![Release](https://img.shields.io/github/v/release/xautzh/moyu-reader?display_name=tag)](https://github.com/xautzh/moyu-reader/releases/latest)
[![CI](https://github.com/xautzh/moyu-reader/actions/workflows/ci.yml/badge.svg)](https://github.com/xautzh/moyu-reader/actions/workflows/ci.yml)
[![macOS Build](https://github.com/xautzh/moyu-reader/actions/workflows/mac-build.yml/badge.svg)](https://github.com/xautzh/moyu-reader/actions/workflows/mac-build.yml)
[![License](https://img.shields.io/github/license/xautzh/moyu-reader)](LICENSE)

墨阅是一款面向 Windows 和 macOS 的本地 Markdown 编辑器。v2 同时提供接近 Typora 的所见即所得编辑、Markdown 源码、源码与预览分屏以及纯阅读预览，文件始终保存在用户选择的本地位置。

## v2 功能

- 所见即所得编辑：标题、强调、列表、引用、链接、表格、代码块、任务项与撤销/重做
- 四种工作模式：所见即所得、源码、分屏、预览
- 安全保存：保存、另存为、未保存关闭保护和磁盘外部修改冲突处理
- 恢复能力：编辑草稿、可选自动保存、崩溃或异常退出后的草稿恢复
- 本地图片：粘贴、拖入或选择图片，自动复制到文档同级 `assets` 目录
- 扩展内容：KaTeX 行内/块级公式与 Mermaid 图表预览
- Front Matter：识别并原样保护 YAML 元数据，正文编辑、预览和导出不会误渲染或改写
- 文档工作区：文件夹内 Markdown 文件列表、实时大纲和最近文件
- 写作辅助：专注模式、打字机模式、全文查找、字号与明暗主题
- 发布能力：导出 HTML、导出 PDF、系统打印
- 桌面集成：Windows/macOS 文件关联、Windows NSIS 与 macOS DMG/ZIP

## 快捷键

| 操作 | Windows / Linux | macOS |
| --- | --- | --- |
| 新建 | `Ctrl + N` | `⌘ + N` |
| 打开 | `Ctrl + O` | `⌘ + O` |
| 保存 | `Ctrl + S` | `⌘ + S` |
| 另存为 | `Ctrl + Shift + S` | `⌘ + Shift + S` |
| 查找 | `Ctrl + F` | `⌘ + F` |
| 所见即所得 / 源码 / 分屏 / 预览 | `Ctrl + 1/2/3/4` | `⌘ + 1/2/3/4` |
| 切换侧栏 | `Ctrl + Shift + B` | `⌘ + Shift + B` |
| 专注模式 / 打字机模式 | `F8` / `F9` | `F8` / `F9` |

## 不安装也能本地验证

安装依赖并构建后，可以直接启动应用，不必先生成安装包：

```powershell
npm install
npm run build
npm start
```

开发调试可使用：

```powershell
npm run dev
```

打开仓库中的 `examples/demo.md`，再按 [v2 本地验收清单](docs/verification-v2.0.0.md) 验证编辑和数据安全功能。

## 质量检查

```powershell
npm test
npm run typecheck
npm run lint
npm run build
npm run qa:electron
```

`qa:electron` 会在 `output/playwright` 下创建隔离副本，通过真实 Electron 窗口验证编辑、Front Matter 原样保存、草稿、冲突、公式、Mermaid、图片、响应式布局和关闭保护，不会修改 `examples/demo.md`。

## 构建安装包

Windows x64：

```powershell
npm run dist:win
```

安装包输出到 `dist/墨阅-2.0.0-Windows.exe`。

macOS Intel 与 Apple Silicon（需在 macOS 上执行）：

```bash
npm run dist:mac
```

DMG 和 ZIP 输出到 `dist`。当前默认构建未签名；公开分发时，Windows 可能提示发布者未知，macOS 建议配置 Developer ID 签名与 Apple 公证。

## 技术栈

- Electron、React、TypeScript、electron-vite
- Milkdown/ProseMirror 所见即所得编辑器
- CodeMirror 6 Markdown 源码编辑器
- react-markdown、KaTeX、Mermaid
- Vitest、Playwright/Electron 自动化

## 参与贡献

欢迎提交 Issue 和 Pull Request。提交代码前请至少运行：

```powershell
npm run lint
npm run build
npm run qa:electron
```

## 许可证

[MIT](LICENSE)
