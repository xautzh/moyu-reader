# 墨阅 Markdown 阅读器

[![Release](https://img.shields.io/github/v/release/xautzh/moyu-reader?display_name=tag)](https://github.com/xautzh/moyu-reader/releases/latest)
[![CI](https://github.com/xautzh/moyu-reader/actions/workflows/ci.yml/badge.svg)](https://github.com/xautzh/moyu-reader/actions/workflows/ci.yml)
[![macOS Build](https://github.com/xautzh/moyu-reader/actions/workflows/mac-build.yml/badge.svg)](https://github.com/xautzh/moyu-reader/actions/workflows/mac-build.yml)
[![License](https://img.shields.io/github/license/xautzh/moyu-reader)](LICENSE)

墨阅是一款面向 Windows 和 macOS 的本地 Markdown 阅读器。它采用 Electron、React 与 TypeScript 构建，默认以只读方式打开文档，适合专注阅读技术文档、笔记与项目说明。

## 下载与体验

前往 [Releases](https://github.com/xautzh/moyu-reader/releases/latest) 按设备下载：

| 系统 | 下载文件 | 说明 |
| --- | --- | --- |
| Windows x64 | `MoyuReader-Setup-*.exe` | 安装版 |
| Windows x64 | `MoyuReader-Portable-*-win-x64.zip` | 解压即用 |
| Apple Silicon Mac | `MoyuReader-*-mac-arm64.dmg` | M1、M2、M3、M4 等机型 |
| Intel Mac | `MoyuReader-*-mac-x64.dmg` | Intel 处理器机型 |

当前 Windows 和 macOS 程序均未进行商业代码签名。Windows 可能提示发布者未知；macOS 首次启动时，请在 Finder 中右键应用并选择“打开”。下载后可使用 Release 中的 SHA-256 文件校验完整性。

## 功能

- 打开或拖放 `.md`、`.markdown`、`.mdown`、`.mkd` 文件
- GFM 表格、任务列表、删除线与代码高亮
- 自动文档目录和章节定位
- 浅色、深色、跟随系统主题
- 字号调整、全文查找、阅读进度与位置记忆
- 最近文件与 Finder / 资源管理器定位
- 文件变化自动刷新
- 本地相对图片与 Markdown 内链
- Windows 与 macOS 文件关联、NSIS 与 DMG 安装包

## 快速体验

安装或启动软件后，打开仓库中的 `examples/demo.md`，即可一次检查目录、表格、任务列表、代码块、本地图片、锚点和自动刷新。

## 本地开发

```powershell
npm install
npm run dev
```

## 质量检查

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

## 构建安装包

Windows x64：

```powershell
npm run dist:win
```

安装包输出到 `dist`。安装后可在 Windows 的“打开方式”中选择“墨阅 Markdown 阅读器”。

macOS Intel 与 Apple Silicon（需在 macOS 上执行）：

```bash
npm run dist:mac
```

DMG 和 ZIP 输出到 `dist`。当前默认生成未签名构建；正式签名和 Apple 公证需要配置开发者证书。

## 技术栈

- Electron
- React + TypeScript
- electron-vite
- react-markdown + remark-gfm
- Vitest + Playwright

## 参与贡献

欢迎提交 Issue 和 Pull Request。提交代码前请至少运行：

```powershell
npm run lint
npm run build
```

## 许可证

[MIT](LICENSE)
