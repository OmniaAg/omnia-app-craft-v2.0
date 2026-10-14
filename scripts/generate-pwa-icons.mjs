import { chromium } from 'playwright'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
// Derive every icon from the incumbent OMNIA isotipo. No network/assets service.
const source = readFileSync('src/assets/images/brand/logos_omnia/OMNIA_Version_isotipo.webp').toString('base64')
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage()
  mkdirSync('public/icons', { recursive: true })
  for (const [name, size, ratio] of [['icon-192',192,.72], ['icon-512',512,.72], ['maskable-512',512,.6], ['apple-touch-icon',180,.72], ['badge-96',96,.72]]) {
    await page.setContent(`<canvas width="${size}" height="${size}"></canvas>`)
    const png = await page.evaluate(async ({ source, size, ratio }) => {
      const image = new Image(); image.src = `data:image/webp;base64,${source}`; await image.decode()
      const canvas = document.querySelector('canvas'); const ctx = canvas.getContext('2d')
      ctx.fillStyle = '#fdfdfc'; ctx.fillRect(0,0,size,size)
      const scale = size * ratio / Math.max(image.width,image.height)
      const w = image.width*scale, h = image.height*scale
      ctx.drawImage(image,(size-w)/2,(size-h)/2,w,h)
      return canvas.toDataURL('image/png').split(',')[1]
    }, { source,size,ratio })
    writeFileSync(`public/icons/${name}.png`, Buffer.from(png,'base64'))
  }
} finally { await browser.close() }
