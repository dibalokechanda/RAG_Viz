import { chromium } from 'playwright'

/*
 * Screenshot helper for iterating on the GraphRAG view.
 *   node shot.mjs [stageIndex...]   e.g.  node shot.mjs 0 2 4
 * Writes shots/gr-<i>.png
 */
const URL = process.env.URL ?? 'http://localhost:4321/RAG_Viz/'
const stages = process.argv.slice(2).map(Number)
const wanted = stages.length ? stages : [0]

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1680, height: 1000 }, deviceScaleFactor: 2 })
await page.goto(URL, { waitUntil: 'networkidle' })

// switch to the GraphRAG tab
await page.getByRole('tab', { name: /GraphRAG/ }).click()
await page.waitForTimeout(700)

for (const i of wanted) {
  const chips = page.locator('.gr-chip')
  const n = await chips.count()
  if (i < n) {
    await chips.nth(i).click()
    await page.waitForTimeout(1100)
  }
  await page.screenshot({ path: `shots/gr-${i}.png`, fullPage: false })
  console.log('wrote shots/gr-' + i + '.png')
}

await browser.close()
