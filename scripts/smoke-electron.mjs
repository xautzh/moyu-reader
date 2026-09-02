import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectDirectory = resolve(scriptDirectory, '..')
const sourceElectronExecutable =
  process.platform === 'win32'
    ? resolve(projectDirectory, 'node_modules', 'electron', 'dist', 'electron.exe')
    : process.platform === 'darwin'
      ? resolve(
          projectDirectory,
          'node_modules',
          'electron',
          'dist',
          'Electron.app',
          'Contents',
          'MacOS',
          'Electron'
        )
      : resolve(projectDirectory, 'node_modules', 'electron', 'dist', 'electron')
const electronExecutable = process.env.MOYU_EXECUTABLE || sourceElectronExecutable
const isPackagedExecutable = Boolean(process.env.MOYU_EXECUTABLE)
const qaRoot = resolve(projectDirectory, 'output', 'playwright', `qa-${process.pid}`)
const qaUserDataPath = join(qaRoot, 'user-data')
const qaDocumentDirectory = join(qaRoot, 'workspace')
const sampleDocument = join(qaDocumentDirectory, 'editor-qa.md')
const screenshotPath = join(
  qaRoot,
  isPackagedExecutable ? 'editor-packaged.png' : 'editor-wide.png'
)
const narrowScreenshotPath = join(
  qaRoot,
  isPackagedExecutable ? 'editor-packaged-narrow.png' : 'editor-narrow.png'
)
const commandKey = process.platform === 'darwin' ? 'Meta' : 'Control'
const qaFrontMatter = [
  '---',
  'name: Protected QA Metadata',
  'colors:',
  '  primary: "#123456"',
  'description: "data—and the AI insights"',
  '---',
  '',
  ''
].join('\n')

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function reportStep(step) {
  console.log(`[qa] ${step}`)
}

async function waitForDiskText(expected, timeout = 5_000) {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    if ((await readFile(sampleDocument, 'utf8')).includes(expected)) {
      return
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 80))
  }
  throw new Error(`Saved document did not contain: ${expected}`)
}

async function assertFrontMatterPreserved() {
  assert(
    (await readFile(sampleDocument, 'utf8')).startsWith(qaFrontMatter),
    'YAML front matter was changed while saving the Markdown body.'
  )
}

await mkdir(join(qaDocumentDirectory, 'assets'), { recursive: true })
const sourceMarkdown = await readFile(resolve(projectDirectory, 'examples', 'demo.md'), 'utf8')
await writeFile(
  sampleDocument,
  `${qaFrontMatter}${sourceMarkdown}\n\n## 数学与图表\n\n行内公式 $E = mc^2$。\n\n$$\n\\int_0^1 x^2 dx = \\frac{1}{3}\n$$\n\n\`\`\`mermaid\nflowchart LR\n  A[Markdown] --> B[墨阅 v2]\n\`\`\`\n`,
  'utf8'
)
await copyFile(
  resolve(projectDirectory, 'examples', 'assets', 'reading-flow.svg'),
  join(qaDocumentDirectory, 'assets', 'reading-flow.svg')
)

const environment = {
  ...process.env,
  NODE_ENV: 'production',
  MOYU_USER_DATA_DIR: qaUserDataPath
}
delete environment.ELECTRON_RENDERER_URL
delete environment.ELECTRON_RUN_AS_NODE

const electronApp = await electron.launch({
  executablePath: electronExecutable,
  args: isPackagedExecutable ? [sampleDocument] : [projectDirectory, sampleDocument],
  cwd: projectDirectory,
  env: environment,
  timeout: 30_000
})

const consoleErrors = []
const pageErrors = []
const processErrors = []
electronApp.process().stderr?.on('data', (chunk) => processErrors.push(String(chunk)))

try {
  const page = await electronApp.firstWindow({ timeout: 20_000 })
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text())
    }
  })
  page.on('pageerror', (error) => pageErrors.push(error.message))

  const richEditor = page.locator('.rich-editor[data-ready="true"] .ProseMirror')
  await richEditor.waitFor({ state: 'visible', timeout: 20_000 })
  reportStep('WYSIWYG editor ready')
  const defaultLightPalette = await page.evaluate(() => {
    for (const sheet of Array.from(document.styleSheets)) {
      for (const rule of Array.from(sheet.cssRules)) {
        if (rule instanceof CSSStyleRule && rule.selectorText === ':root') {
          return {
            background: rule.style.getPropertyValue('--bg').trim().toLowerCase(),
            panel: rule.style.getPropertyValue('--panel').trim().toLowerCase(),
            surface: rule.style.getPropertyValue('--surface').trim().toLowerCase()
          }
        }
      }
    }
    return { background: '', panel: '', surface: '' }
  })
  assert(
    defaultLightPalette.background === '#f6f6f6' &&
      defaultLightPalette.panel === '#f6f6f6' &&
      defaultLightPalette.surface === '#ffffff',
    'The default light theme does not use the requested white and gray palette.'
  )
  assert((await page.locator('.dirty-indicator').count()) === 0, 'Opening a file marked it dirty.')
  await page.getByLabel('Front Matter 已安全保留').waitFor({ state: 'visible' })
  assert(
    (await richEditor.getByText('Protected QA Metadata', { exact: false }).count()) === 0,
    'YAML front matter leaked into the WYSIWYG body.'
  )

  const preloadAvailable = await page.evaluate(
    () => typeof window.moyu?.saveDocument === 'function'
  )
  assert(preloadAvailable, 'Preload bridge was not exposed to the renderer.')
  const savedAsset = await page.evaluate(
    async ({ filePath }) => {
      const svg =
        '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="#2f6f5d"/></svg>'
      const bytes = new TextEncoder().encode(svg)
      return window.moyu.saveImageData(filePath, 'qa pasted image.svg', bytes.buffer)
    },
    { filePath: sampleDocument }
  )
  assert(
    savedAsset.relativePath.startsWith('assets/qa-pasted-image'),
    'Image asset name was unsafe.'
  )
  assert(
    (await readFile(join(qaDocumentDirectory, ...savedAsset.relativePath.split('/')))).byteLength >
      0,
    'Pasted image bytes were not persisted.'
  )
  assert(
    (await richEditor.locator('h1').first().textContent())?.includes('墨阅功能验收文档'),
    'The Markdown title was not loaded into the WYSIWYG editor.'
  )
  assert((await richEditor.locator('table').count()) >= 1, 'The GFM table was not editable.')
  assert((await page.locator('.outline-item').count()) >= 6, 'The live outline is incomplete.')
  await page.getByRole('tab', { name: '文件', exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('.workspace-file').length >= 1)
  const workspaceFileCount = await page.locator('.workspace-file').count()
  await page.getByRole('tab', { name: '大纲', exact: true }).click()

  await richEditor.getByText('到这里，v2 编辑与阅读主路径已经覆盖完成。', { exact: true }).click()
  await page.keyboard.press('End')
  await page.keyboard.press('Enter')
  await page.keyboard.type('WYSIWYG-EDIT-MARKER')
  await page.locator('.dirty-indicator').waitFor({ state: 'visible' })
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await page
    .locator('.save-state')
    .getByText('已保存', { exact: true })
    .waitFor({ state: 'visible' })
  await waitForDiskText('WYSIWYG-EDIT-MARKER')
  await assertFrontMatterPreserved()
  reportStep('WYSIWYG edit saved')

  await page.getByRole('button', { name: '编辑元数据', exact: true }).click()
  const sourceEditor = page.locator('.source-editor .cm-content')
  await sourceEditor.waitFor({ state: 'visible' })
  await sourceEditor.click()
  await page.keyboard.press(`${commandKey}+End`)
  await page.keyboard.type('\n\nSOURCE-EDIT-MARKER')
  await page.getByRole('button', { name: '粗体', exact: true }).click()
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await waitForDiskText('SOURCE-EDIT-MARKER**粗体文字**')
  await assertFrontMatterPreserved()
  reportStep('source edit and formatting saved')

  const autosaveButton = page.getByRole('button', { name: '自动保存', exact: true })
  await autosaveButton.click()
  await sourceEditor.click()
  await page.keyboard.press(`${commandKey}+End`)
  await page.keyboard.type('\n\nAUTOSAVE-MARKER')
  await waitForDiskText('AUTOSAVE-MARKER', 8_000)
  await page.locator('.dirty-indicator').waitFor({ state: 'hidden' })
  await autosaveButton.click()
  reportStep('autosave persisted a settled edit')

  await page.getByRole('button', { name: '预览', exact: true }).click()
  const preview = page.locator('.preview-pane .markdown-body')
  await preview.waitFor({ state: 'visible' })
  assert(
    await preview.getByText('SOURCE-EDIT-MARKER', { exact: false }).isVisible(),
    'Source changes did not reach preview mode.'
  )
  assert(
    (await preview.getByText('Protected QA Metadata', { exact: false }).count()) === 0,
    'YAML front matter leaked into preview mode.'
  )
  assert((await preview.locator('.katex').count()) > 0, 'KaTeX formula rendering is missing.')
  await preview
    .locator('.mermaid-diagram svg')
    .first()
    .waitFor({ state: 'visible', timeout: 10_000 })
  await page.waitForFunction(
    () => (document.querySelector('.preview-pane .markdown-body img')?.naturalWidth ?? 0) > 0,
    undefined,
    { timeout: 5_000 }
  )
  reportStep('preview, math, Mermaid, and local image rendered')

  await page.getByRole('button', { name: '分屏', exact: true }).click()
  assert(await page.locator('.source-pane').isVisible(), 'Split mode source pane is hidden.')
  assert(await page.locator('.preview-pane').isVisible(), 'Split mode preview pane is hidden.')
  reportStep('split mode ready')

  await sourceEditor.click()
  await page.keyboard.press(`${commandKey}+End`)
  await page.keyboard.type('\n\nLOCAL-CONFLICT-MARKER')
  await page.waitForFunction(
    async (filePath) =>
      (await window.moyu.getDraft(filePath))?.content.includes('LOCAL-CONFLICT-MARKER'),
    sampleDocument,
    { timeout: 5_000 }
  )
  const beforeExternalChange = await readFile(sampleDocument, 'utf8')
  await writeFile(sampleDocument, `${beforeExternalChange}\n\nEXTERNAL-CHANGE-MARKER\n`, 'utf8')
  await page.getByRole('heading', { name: '检测到磁盘版本冲突' }).waitFor({ timeout: 5_000 })
  await page.getByRole('button', { name: '继续编辑', exact: true }).click()
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await page.getByRole('heading', { name: '检测到磁盘版本冲突' }).waitFor({ timeout: 5_000 })
  await page.getByRole('button', { name: '覆盖磁盘', exact: true }).click()
  await waitForDiskText('LOCAL-CONFLICT-MARKER')
  await assertFrontMatterPreserved()
  await page.locator('.dirty-indicator').waitFor({ state: 'hidden' })
  assert(
    !(await readFile(sampleDocument, 'utf8')).includes('EXTERNAL-CHANGE-MARKER'),
    'Conflict overwrite did not preserve the editor version.'
  )
  reportStep('external conflict detected and overwritten explicitly')

  const shell = page.locator('.app-shell')
  const originalScale = await shell.evaluate((element) =>
    getComputedStyle(element).getPropertyValue('--reader-scale').trim()
  )
  await page.getByRole('button', { name: '增大字号' }).click()
  const increasedScale = await shell.evaluate((element) =>
    getComputedStyle(element).getPropertyValue('--reader-scale').trim()
  )
  assert(Number(increasedScale) > Number(originalScale), 'Font size control did not update.')

  const themeButton = page.locator('button[aria-label^="主题："]')
  const originalThemeLabel = await themeButton.getAttribute('aria-label')
  await themeButton.click()
  assert(
    originalThemeLabel !== (await themeButton.getAttribute('aria-label')),
    'Theme control did not advance.'
  )

  await page.getByRole('button', { name: '预览', exact: true }).click()
  await page.getByRole('button', { name: '在文档中查找' }).click()
  const findInput = page.getByRole('searchbox', { name: '查找文本' })
  await findInput.fill('Markdown')
  await page.waitForFunction(
    () => document.querySelector('.find-result')?.textContent?.includes('/'),
    undefined,
    { timeout: 3_000 }
  )
  await page.getByRole('button', { name: '关闭查找' }).click()
  await page.screenshot({ path: screenshotPath, animations: 'disabled' })

  await page.getByRole('button', { name: '源码', exact: true }).click()
  await sourceEditor.click()
  await page.keyboard.press(`${commandKey}+End`)
  await page.keyboard.type('\nCLOSE-GUARD-MARKER')
  await electronApp.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close())
  await page.getByRole('heading', { name: '保存对文档的更改？' }).waitFor({ timeout: 5_000 })
  await page.getByRole('button', { name: '取消', exact: true }).last().click()
  assert(!page.isClosed(), 'Canceling the close guard still closed the window.')
  reportStep('close guard canceled successfully')

  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(800, 620)
  })
  await page.waitForTimeout(250)
  assert(await page.locator('.sidebar.is-open').isVisible(), 'The narrow sidebar is unavailable.')
  await page.screenshot({ path: narrowScreenshotPath, animations: 'disabled' })
  await page.locator('.sidebar-mobile-header').getByRole('button', { name: '关闭侧栏' }).click()
  assert(!(await page.locator('.sidebar.is-open').isVisible()), 'The narrow sidebar did not close.')

  assert(consoleErrors.length === 0, `Renderer console errors: ${consoleErrors.join(' | ')}`)
  assert(pageErrors.length === 0, `Renderer page errors: ${pageErrors.join(' | ')}`)

  console.log(
    JSON.stringify(
      {
        status: 'passed',
        title: await page.title(),
        headings: await page.locator('.outline-item').count(),
        workspaceFiles: workspaceFileCount,
        screenshotPath,
        narrowScreenshotPath,
        consoleErrors,
        pageErrors,
        processErrors: processErrors.filter((line) => /error|fatal/i.test(line))
      },
      null,
      2
    )
  )
} finally {
  try {
    await electronApp.evaluate(({ app }) => app.exit(0))
  } catch {
    // The app may already be gone after a failed assertion.
  }
  try {
    await electronApp.close()
  } catch {
    // Nothing else is required once Electron has exited.
  }
}
