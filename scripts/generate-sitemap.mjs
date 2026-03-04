#!/usr/bin/env node

/**
 * Generates sitemap.xml from designs.json
 * Run before `npm run build` in the deploy workflow.
 */

import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const designsPath = resolve(__dirname, '../website/src/data/designs.json')
const outputPath = resolve(__dirname, '../website/public/sitemap.xml')

const BASE_URL = 'https://www.freereversecoloring.com'

const designs = JSON.parse(readFileSync(designsPath, 'utf-8'))

const today = new Date().toISOString().split('T')[0]

const staticPages = [
  { loc: '/', priority: '1.0', changefreq: 'weekly' },
  { loc: '/gallery/', priority: '0.9', changefreq: 'weekly' },
  { loc: '/privacy/', priority: '0.3', changefreq: 'yearly' },
  { loc: '/terms-of-service/', priority: '0.3', changefreq: 'yearly' },
]

const designPages = designs.map((d) => ({
  loc: `/gallery/${d.slug}/`,
  priority: '0.8',
  changefreq: 'monthly',
}))

const allPages = [...staticPages, ...designPages]

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPages
  .map(
    (page) => `  <url>
    <loc>${BASE_URL}${page.loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority}</priority>
  </url>`,
  )
  .join('\n')}
</urlset>
`

writeFileSync(outputPath, xml, 'utf-8')

console.log(`Sitemap generated with ${allPages.length} URLs → ${outputPath}`)
