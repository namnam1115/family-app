// Node.js 標準モジュールのみで PNG アイコンを生成するスクリプト
// 実行: node scripts/generate-icons.mjs

import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let j = 0; j < 8; j++) c = (c & 1) ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c
  }
  return t
})()

function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function u32be(n) {
  const b = Buffer.alloc(4)
  b.writeUInt32BE(n, 0)
  return b
}

function pngChunk(type, data) {
  const typeB = Buffer.from(type, 'ascii')
  const crc = crc32(Buffer.concat([typeB, data]))
  return Buffer.concat([u32be(data.length), typeB, data, u32be(crc)])
}

/**
 * ラウンドレクト + 中央にテキストを描いた PNG を生成
 * （シンプルな solid color + 中心円）
 */
function createIconPNG(size, bg = [79, 70, 229], accent = [255, 255, 255]) {
  const [br, bg2, bb] = bg
  const [ar, ag, ab] = accent

  const pixels = new Uint8Array(size * size * 3)

  const cx = size / 2
  const cy = size / 2
  const outerR = size * 0.5
  const innerR = size * 0.22   // 中心の白い丸

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx + 0.5
      const dy = y - cy + 0.5
      const dist = Math.sqrt(dx * dx + dy * dy)
      const idx = (y * size + x) * 3

      if (dist <= innerR) {
        // 中心: アクセント色（白い家のシルエット代わり）
        pixels[idx] = ar
        pixels[idx + 1] = ag
        pixels[idx + 2] = ab
      } else if (dist <= outerR) {
        // 背景: プライマリ色
        pixels[idx] = br
        pixels[idx + 1] = bg2
        pixels[idx + 2] = bb
      } else {
        // 外: 透明扱い（白で塗る）
        pixels[idx] = 255
        pixels[idx + 1] = 255
        pixels[idx + 2] = 255
      }
    }
  }

  // Raw image data: filter byte(0) + RGB per row
  const raw = Buffer.alloc((1 + size * 3) * size)
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 3)
    raw[rowStart] = 0 // filter: None
    for (let x = 0; x < size; x++) {
      const srcIdx = (y * size + x) * 3
      const dstIdx = rowStart + 1 + x * 3
      raw[dstIdx] = pixels[srcIdx]
      raw[dstIdx + 1] = pixels[srcIdx + 1]
      raw[dstIdx + 2] = pixels[srcIdx + 2]
    }
  }

  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
  const ihdrData = Buffer.concat([u32be(size), u32be(size), Buffer.from([8, 2, 0, 0, 0])])

  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdrData),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

mkdirSync('public', { recursive: true })

const PURPLE = [79, 70, 229]
const WHITE  = [255, 255, 255]

writeFileSync('public/pwa-192x192.png',      createIconPNG(192, PURPLE, WHITE))
writeFileSync('public/pwa-512x512.png',      createIconPNG(512, PURPLE, WHITE))
writeFileSync('public/apple-touch-icon.png', createIconPNG(180, PURPLE, WHITE))

// favicon は SVG で作成
const faviconSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <circle cx="16" cy="16" r="16" fill="#4f46e5"/>
  <text x="16" y="22" text-anchor="middle" font-size="18" fill="white">🏠</text>
</svg>`
writeFileSync('public/favicon.svg', faviconSVG)

console.log('✓ public/pwa-192x192.png')
console.log('✓ public/pwa-512x512.png')
console.log('✓ public/apple-touch-icon.png')
console.log('✓ public/favicon.svg')
console.log('Icons generated!')
