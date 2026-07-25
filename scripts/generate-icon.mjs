import { execFile } from 'node:child_process'
import { copyFile, mkdir, rm } from 'node:fs/promises'
import { promisify } from 'node:util'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { Archive } from 'lucide-react'
import { chromium } from 'playwright-core'

const run = promisify(execFile)
const executablePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const iconset = '.artifacts/Memento.iconset'
const source = '.artifacts/Memento-1024.png'

await mkdir('.artifacts', { recursive: true })
await mkdir('build', { recursive: true })
await rm(iconset, { recursive: true, force: true })
await mkdir(iconset, { recursive: true })

const glyph = renderToStaticMarkup(
  React.createElement(Archive, {
    size: 430,
    strokeWidth: 1.65,
    color: '#fffaf7',
    'aria-hidden': true
  })
)

const browser = await chromium.launch({ executablePath, headless: true })
const page = await browser.newPage({ viewport: { width: 1024, height: 1024 }, deviceScaleFactor: 1 })
await page.setContent(`
  <style>
    * { box-sizing: border-box; }
    html, body { width: 1024px; height: 1024px; margin: 0; background: transparent; }
    body { display: grid; place-items: center; }
    .icon {
      position: relative;
      display: grid;
      width: 900px;
      height: 900px;
      place-items: center;
      overflow: hidden;
      border: 18px solid #d66d51;
      border-radius: 208px;
      background: #c65335;
      box-shadow: inset 0 18px 0 rgba(255, 255, 255, .12), 0 30px 70px rgba(65, 21, 12, .22);
    }
    .icon::before {
      position: absolute;
      inset: 66px;
      border: 4px solid rgba(255, 250, 247, .18);
      border-radius: 145px;
      content: '';
    }
    svg { position: relative; filter: drop-shadow(0 14px 14px rgba(70, 20, 10, .16)); }
  </style>
  <div class="icon">${glyph}</div>
`)
await page.screenshot({ path: source, omitBackground: true })
await browser.close()
await copyFile(source, 'build/icon.png')

const sizes = [
  [16, 'icon_16x16.png'],
  [32, 'icon_16x16@2x.png'],
  [32, 'icon_32x32.png'],
  [64, 'icon_32x32@2x.png'],
  [128, 'icon_128x128.png'],
  [256, 'icon_128x128@2x.png'],
  [256, 'icon_256x256.png'],
  [512, 'icon_256x256@2x.png'],
  [512, 'icon_512x512.png'],
  [1024, 'icon_512x512@2x.png']
]

for (const [size, name] of sizes) {
  await run('/usr/bin/sips', ['-z', String(size), String(size), source, '--out', `${iconset}/${name}`])
}
await run('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', 'build/icon.icns'])
process.stdout.write('Generated build/icon.icns and build/icon.png\n')
