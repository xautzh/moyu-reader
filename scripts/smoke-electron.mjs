import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { _electron as electron } from 'playwright-core'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectDirectory = resolve(scriptDirectory, '..')
const sourceElectronExecutable = resolve(
  projectDirectory,
  'node_modules',
  'electron',
  'dist',
  'electron.exe'
)
const electronExecutable = process.env.MOYU_EXECUTABLE || sourceElectronExecutable
const isPackagedExecutable = Boolean(process.env.MOYU_EXECUTABLE)
const sampleDocument = resolve(projectDirectory, 'examples', 'demo.md')
const screenshotPath = resolve(
  projectDirectory,
  'output',
  'playwright',
  isPackagedExecutable ? 'reader-packaged.png' : 'reader-demo.png'
)
const narrowScreenshotPath = resolve(
  projectDirectory,
  'output',
  'playwright',
  isPackagedExecutable ? 'reader-packaged-narrow.png' : 'reader-narrow.png'
)
const qaUserDataPath = resolve(projectDirectory, 'output', 'playwright', `user-data-${process.pid}`)

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

await mkdir(dirname(screenshotPath), { recursive: true })

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

  await page
    .locator('.markdown-body, .empty-state')
    .first()
    .waitFor({ state: 'visible', timeout: 15_000 })

  if ((await page.locator('.markdown-body').count()) === 0) {
    const diagnostics = {
      bodyText: (await page.locator('body').innerText()).slice(0, 1_000),
      currentDocument: await page.evaluate(() => window.moyu?.getCurrentDocument?.()),
      mainProcess: await electronApp.evaluate(() => ({ argv: process.argv, cwd: process.cwd() })),
      consoleErrors,
      pageErrors,
      processErrors
    }
    console.error(JSON.stringify(diagnostics, null, 2))
    throw new Error('The Electron window opened without the requested Markdown document.')
  }

  const preloadAvailable = await page.evaluate(() => typeof window.moyu?.openPath === 'function')
  assert(preloadAvailable, 'Preload bridge was not exposed to the renderer.')
  assert(
    (await page.locator('.markdown-body h1').first().textContent())?.includes('墨阅功能验收文档'),
    'The sample Markdown title was not rendered.'
  )
  assert((await page.locator('.outline-item').count()) >= 5, 'The generated outline is incomplete.')
  assert(
    (await page.locator('.markdown-body table').count()) === 1,
    'The GFM table was not rendered.'
  )
  assert((await page.locator('.code-block').count()) === 1, 'The code block was not rendered.')

  await page.waitForFunction(
    () => (document.querySelector('.markdown-body img')?.naturalWidth ?? 0) > 0,
    undefined,
    { timeout: 3_000 }
  )
  const imageLoaded = await page
    .locator('.markdown-body img')
    .evaluate((image) => image.naturalWidth > 0)
  assert(imageLoaded, 'The local relative image did not load through the secure asset protocol.')

  const shell = page.locator('.app-shell')
  const originalScale = await shell.evaluate((element) =>
    getComputedStyle(element).getPropertyValue('--reader-scale').trim()
  )
  await page.getByRole('button', { name: '增大字号' }).click()
  const increasedScale = await shell.evaluate((element) =>
    getComputedStyle(element).getPropertyValue('--reader-scale').trim()
  )
  assert(
    Number(increasedScale) > Number(originalScale),
    'Font size control did not update the reader scale.'
  )

  const themeButton = page.locator('button[aria-label^="主题："]')
  const originalThemeLabel = await themeButton.getAttribute('aria-label')
  await themeButton.click()
  const nextThemeLabel = await themeButton.getAttribute('aria-label')
  assert(originalThemeLabel !== nextThemeLabel, 'Theme control did not advance to the next mode.')

  await page.getByRole('button', { name: '在文档中查找' }).click()
  const findInput = page.getByRole('searchbox', { name: '查找文本' })
  await findInput.fill('Markdown')
  await page.waitForFunction(
    () => document.querySelector('.find-result')?.textContent?.includes('/'),
    undefined,
    { timeout: 3_000 }
  )
  const findResultText = await page.locator('.find-result').textContent()
  assert(findResultText?.includes('/'), 'Find in page returned no result for known text.')

  await page.locator('#链接与自动同步').scrollIntoViewIfNeeded()
  await page.waitForTimeout(250)
  const progress = Number((await page.locator('.progress-label').textContent())?.replace('%', ''))
  assert(progress > 0, 'Reading progress did not update after scrolling.')

  await page.getByRole('button', { name: '关闭查找' }).click()
  await page.keyboard.press('Control+0')
  await page.locator('.reader-scroll').evaluate((reader) => {
    reader.scrollTop = 0
  })
  await page.waitForTimeout(180)
  await page.screenshot({ path: screenshotPath, animations: 'disabled' })

  await electronApp.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()[0]?.setSize(800, 620)
  })
  await page.waitForTimeout(250)
  assert(
    await page.locator('.sidebar.is-open').isVisible(),
    'The sidebar was not available in the narrow layout.'
  )
  await page.screenshot({ path: narrowScreenshotPath, animations: 'disabled' })
  await page.locator('.sidebar-mobile-header').getByRole('button', { name: '关闭侧栏' }).click()
  await page.waitForTimeout(180)
  assert(!(await page.locator('.sidebar.is-open').isVisible()), 'The narrow sidebar did not close.')

  assert(consoleErrors.length === 0, `Renderer console errors: ${consoleErrors.join(' | ')}`)
  assert(pageErrors.length === 0, `Renderer page errors: ${pageErrors.join(' | ')}`)

  console.log(
    JSON.stringify(
      {
        status: 'passed',
        title: await page.title(),
        headings: await page.locator('.outline-item').count(),
        imageLoaded,
        progress,
        screenshotPath,
        narrowScreenshotPath,
        consoleErrors,
        pageErrors
      },
      null,
      2
    )
  )
} finally {
  await electronApp.close()
}
