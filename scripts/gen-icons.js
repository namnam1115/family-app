import sharp from 'sharp'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const svg = readFileSync(resolve(__dirname, '../public/icon.svg'))

const sizes = [
  { file: 'pwa-192x192.png', size: 192 },
  { file: 'pwa-512x512.png', size: 512 },
  { file: 'apple-touch-icon.png', size: 180 },
  { file: 'favicon-32x32.png', size: 32 },
]

for (const { file, size } of sizes) {
  await sharp(svg)
    .resize(size, size)
    .png()
    .toFile(resolve(__dirname, '../public', file))
  console.log(`✓ ${file}`)
}
console.log('アイコン生成完了')
