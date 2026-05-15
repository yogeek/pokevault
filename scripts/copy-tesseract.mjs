#!/usr/bin/env node
/**
 * Copies Tesseract.js worker, WASM core, and language data into public/tesseract/
 * so the OCR engine is served locally instead of fetching from CDN at runtime.
 * Run automatically before every build via `npm run build`.
 */
import { copyFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const nm = join(root, 'node_modules')
const out = join(root, 'public', 'tesseract')

mkdirSync(join(out, 'lang'), { recursive: true })

const files = [
  [join(nm, 'tesseract.js', 'dist', 'worker.min.js'),                        join(out, 'worker.min.js')],
  [join(nm, 'tesseract.js-core', 'tesseract-core-lstm.wasm.js'),              join(out, 'tesseract-core-lstm.wasm.js')],
  [join(nm, 'tesseract.js-core', 'tesseract-core-lstm.wasm'),                 join(out, 'tesseract-core-lstm.wasm')],
  [join(nm, '@tesseract.js-data', 'eng', '4.0.0_best_int', 'eng.traineddata.gz'), join(out, 'lang', 'eng.traineddata.gz')],
]

for (const [src, dst] of files) {
  copyFileSync(src, dst)
}
console.log('✓ Tesseract assets copiés dans public/tesseract/')
