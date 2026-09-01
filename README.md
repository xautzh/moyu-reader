# 墨阅 Markdown 阅读器

[![Release](https://img.shields.io/github/v/release/xautzh/moyu-reader?display_name=tag)](https://github.com/xautzh/moyu-reader/releases/latest)
[![CI](https://github.com/xautzh/moyu-reader/actions/workflows/ci.yml/badge.svg)](https://github.com/xautzh/moyu-reader/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/xautzh/moyu-reader)](LICENSE)

墨阅是一款面向 Windows x64 的本地 Markdown 阅读器。它采用 Electron、React 与 TypeScript 构建，默认以只读方式打开文档，适合专注阅读技术文档、笔记与项目说明。

## 下载与体验

- 前往 [Releases](https://github.com/xautzh/moyu-reader/releases/latest) 下载最新的 `MoyuReader-Setup-*.exe` 安装包。
- 不想安装时，可下载 Release 中的便携压缩包，解压后运行 `MoyuReader.exe`。
- Windows 可能会提示发布者未知，因为当前安装包尚未进行商业代码签名；可先核对 Release 中的 SHA-256 校验值。

## 功能

- 打开或拖放 `.md`、`.markdown`、`.mdown`、`.mkd` 文件
- GFM 表格、任务列表、删除线与代码高亮
- 自动文档目录和章节定位
- 浅色、深色、跟随系统主题
- 字号调整、全文查找、阅读进度与位置记忆
- 最近文件与资源管理器定位
- 文件变化自动刷新
- 本地相对图片与 Markdown 内链
- Windows 文件关联和 NSIS 安装程序

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

## 构建 Windows 安装包

```powershell
npm run dist:win
```

安装包输出到 `dist`。安装后可在 Windows 的“打开方式”中选择“墨阅 Markdown 阅读器”。

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
