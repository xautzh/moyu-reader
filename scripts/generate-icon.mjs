import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectDirectory = resolve(scriptDirectory, '..')
const sourcePath = resolve(projectDirectory, 'build', 'icon.svg')
const outputPath = resolve(projectDirectory, 'build', 'icon.png')

await mkdir(dirname(outputPath), { recursive: true })
await sharp(sourcePath).resize(1024, 1024).png().toFile(outputPath)
console.log(`Generated ${outputPath}`)
