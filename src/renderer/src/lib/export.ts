function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function portableBodyHtml(bodyHtml: string, assetBaseUrl: string): string {
  return assetBaseUrl ? bodyHtml.replaceAll(assetBaseUrl, '') : bodyHtml
}

export function buildStandaloneHtml(
  title: string,
  bodyHtml: string,
  assetBaseUrl: string,
  theme: 'light' | 'dark'
): string {
  const dark = theme === 'dark'
  const background = dark ? '#191b19' : '#ffffff'
  const surface = dark ? '#222522' : '#ffffff'
  const foreground = dark ? '#e7e8e2' : '#292c28'
  const muted = dark ? '#aeb3ab' : '#676d65'
  const border = dark ? '#3a3f39' : '#dedbd2'
  const code = dark ? '#171917' : '#f1efe8'
  const content = portableBodyHtml(bodyHtml, assetBaseUrl)

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.18.5/dist/katex.min.css">
  <style>
    :root { color-scheme: ${theme}; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 48px 24px 80px; background: ${background}; color: ${foreground}; font-family: Inter, "PingFang SC", "Microsoft YaHei", sans-serif; line-height: 1.75; }
    article { width: min(780px, 100%); margin: 0 auto; padding: 56px 64px; background: ${surface}; border: 1px solid ${border}; border-radius: 16px; box-shadow: 0 18px 55px rgba(0, 0, 0, .08); }
    h1, h2, h3, h4, h5, h6 { line-height: 1.3; margin: 1.6em 0 .7em; }
    h1 { margin-top: 0; font-size: 2.25em; } h2 { border-bottom: 1px solid ${border}; padding-bottom: .3em; }
    p, ul, ol, blockquote, pre, table { margin: 1em 0; }
    a { color: #3d7253; } img, svg { max-width: 100%; height: auto; }
    blockquote { margin-left: 0; padding: .2em 1em; border-left: 3px solid #6b9378; color: ${muted}; }
    code { padding: .15em .35em; background: ${code}; border-radius: 4px; font-family: "Cascadia Code", Consolas, monospace; }
    pre { overflow: auto; padding: 18px; background: ${code}; border: 1px solid ${border}; border-radius: 10px; }
    pre code { padding: 0; background: transparent; }
    table { width: 100%; border-collapse: collapse; } th, td { padding: 9px 12px; border: 1px solid ${border}; text-align: left; }
    hr { border: 0; border-top: 1px solid ${border}; margin: 2.3em 0; }
    .copy-code-button, .diagram-loading { display: none; }
    .mermaid-diagram { margin: 1.5em 0; text-align: center; }
    @media print { body { padding: 0; background: #fff; } article { width: 100%; padding: 0; border: 0; box-shadow: none; } }
    @media (max-width: 640px) { body { padding: 0; } article { padding: 30px 22px; border: 0; border-radius: 0; } }
  </style>
</head>
<body>
  <article class="markdown-body">${content}</article>
</body>
</html>`
}
