import { writeFileSync } from 'fs'
import { deflateSync } from 'zlib'

function createPokeBallPNG(size) {
  const PNG_HEADER = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  function crc32(buf) {
    let crc = 0xFFFFFFFF
    for (const b of buf) {
      crc ^= b
      for (let i = 0; i < 8; i++) crc = (crc & 1) ? (crc >>> 1) ^ 0xEDB88320 : crc >>> 1
    }
    return (crc ^ 0xFFFFFFFF) >>> 0
  }

  function chunk(type, data) {
    const t = Buffer.from(type)
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const crcInput = Buffer.concat([t, data])
    const c = Buffer.alloc(4)
    c.writeUInt32BE(crc32(crcInput))
    return Buffer.concat([len, t, data, c])
  }

  // IHDR chunk
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // RGB

  // Build pixel data
  const rows = []
  const half = size / 2
  for (let y = 0; y < size; y++) {
    const row = Buffer.alloc(1 + size * 3)
    row[0] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      const dx = x - half
      const dy = y - half
      const dist = Math.sqrt(dx * dx + dy * dy)
      const r = size * 0.44
      const borderW = size * 0.04
      const bandH = size * 0.06
      const btnR = size * 0.10

      let pr, pg, pb
      if (dist > r) {
        // background
        pr = 15; pg = 23; pb = 42
      } else if (dist > r - borderW) {
        // outer ring
        pr = 30; pg = 41; pb = 59
      } else if (Math.abs(dy) < bandH) {
        // center band
        pr = 30; pg = 41; pb = 59
      } else {
        const inBtn = dist < btnR
        if (inBtn && Math.abs(dy) < bandH + borderW * 2) {
          pr = 30; pg = 41; pb = 59
        } else if (inBtn) {
          pr = 248; pg = 250; pb = 252
        } else if (dy < 0) {
          // top half: red
          pr = 239; pg = 68; pb = 68
        } else {
          // bottom half: white
          pr = 248; pg = 250; pb = 252
        }
      }
      row[1 + x * 3] = pr
      row[1 + x * 3 + 1] = pg
      row[1 + x * 3 + 2] = pb
    }
    rows.push(row)
  }

  const raw = Buffer.concat(rows)
  const compressed = deflateSync(raw)

  return Buffer.concat([
    PNG_HEADER,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

writeFileSync('public/pwa-192x192.png', createPokeBallPNG(192))
writeFileSync('public/pwa-512x512.png', createPokeBallPNG(512))
writeFileSync('public/apple-touch-icon.png', createPokeBallPNG(180))
console.log('PWA icons generated.')
