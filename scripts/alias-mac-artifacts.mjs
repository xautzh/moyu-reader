import { copyFile } from 'node:fs/promises'
import { join } from 'node:path'
import process from 'node:process'
import packageJson from '../package.json' with { type: 'json' }

const outputDirectory = join(process.cwd(), 'dist')
const aliases = ['x64.dmg', 'x64.zip', 'arm64.dmg', 'arm64.zip']

await Promise.all(
  aliases.map((suffix) =>
    copyFile(
      join(outputDirectory, `墨阅-${packageJson.version}-macOS-${suffix}`),
      join(outputDirectory, `MoyuReader-${packageJson.version}-mac-${suffix}`)
    )
  )
)
