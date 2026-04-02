#!/usr/bin/env node
/**
 * embed-images.js
 *
 * Pre-processes a .pen file by fetching all remote image URLs and replacing
 * them with base64 data URIs. The resulting file can be imported into the
 * Pencil-to-Figma plugin without needing any network access from inside
 * Figma's sandboxed plugin environment.
 *
 * Usage:
 *   node scripts/embed-images.js path/to/design.pen
 *   node scripts/embed-images.js path/to/design.pen --out path/to/output.pen
 *
 * The output file is written alongside the input as "design.embedded.pen"
 * unless --out is specified.
 */

const fs   = require('fs')
const path = require('path')
const https = require('https')
const http  = require('http')

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
if (args.length === 0 || args[0] === '--help') {
  console.log('Usage: node scripts/embed-images.js <file.pen> [--out <output.pen>]')
  process.exit(0)
}

const inputPath  = path.resolve(args[0])
const outFlagIdx = args.indexOf('--out')
const outputPath = outFlagIdx !== -1
  ? path.resolve(args[outFlagIdx + 1])
  : inputPath.replace(/\.pen$/, '.embedded.pen')

if (!fs.existsSync(inputPath)) {
  console.error(`Error: file not found — ${inputPath}`)
  process.exit(1)
}

// ── Image fetching ────────────────────────────────────────────────────────────

/**
 * Fetches a URL and returns a base64 data URI string, or null on failure.
 * Follows up to 3 redirects.
 */
function fetchAsDataUri(url, redirectsLeft = 3) {
  return new Promise((resolve) => {
    const client = url.startsWith('https') ? https : http
    const req = client.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; pencil-embed-images/1.0)',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
      },
      timeout: 15000,
    }, (res) => {
      // Follow redirects
      if ((res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307) && res.headers.location && redirectsLeft > 0) {
        resolve(fetchAsDataUri(res.headers.location, redirectsLeft - 1))
        return
      }

      if (res.statusCode !== 200) {
        console.warn(`  ⚠  HTTP ${res.statusCode} for ${url}`)
        resolve(null)
        return
      }

      const chunks = []
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        const buffer = Buffer.concat(chunks)
        const mime = (res.headers['content-type'] || 'image/jpeg').split(';')[0].trim()
        resolve(`data:${mime};base64,${buffer.toString('base64')}`)
      })
      res.on('error', (err) => {
        console.warn(`  ⚠  Read error for ${url}: ${err.message}`)
        resolve(null)
      })
    })

    req.on('error', (err) => {
      console.warn(`  ⚠  Fetch error for ${url}: ${err.message}`)
      resolve(null)
    })

    req.on('timeout', () => {
      req.destroy()
      console.warn(`  ⚠  Timeout for ${url}`)
      resolve(null)
    })
  })
}

// ── Tree walking ──────────────────────────────────────────────────────────────

/**
 * Collects all unique remote image URLs from a node tree.
 */
function collectImageUrls(nodes, urls = new Set()) {
  if (!Array.isArray(nodes)) return urls
  for (const node of nodes) {
    const fill = node.fill
    if (fill && typeof fill === 'object' && fill.type === 'image' && fill.url && !fill.url.startsWith('data:')) {
      urls.add(fill.url)
    }
    if (Array.isArray(node.children)) collectImageUrls(node.children, urls)
  }
  return urls
}

/**
 * Replaces all remote image URLs in a node tree with entries from the map.
 * Mutates the tree in place.
 */
function substituteUrls(nodes, map) {
  if (!Array.isArray(nodes)) return
  for (const node of nodes) {
    const fill = node.fill
    if (fill && typeof fill === 'object' && fill.type === 'image' && fill.url) {
      const dataUri = map.get(fill.url)
      if (dataUri) fill.url = dataUri
    }
    if (Array.isArray(node.children)) substituteUrls(node.children, map)
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nReading: ${inputPath}`)
  const raw = fs.readFileSync(inputPath, 'utf8')
  let penFile
  try {
    penFile = JSON.parse(raw)
  } catch (e) {
    console.error('Error: could not parse .pen file as JSON.')
    process.exit(1)
  }

  const urls = collectImageUrls(penFile.children)
  if (urls.size === 0) {
    console.log('No remote images found — nothing to embed.')
    fs.writeFileSync(outputPath, raw, 'utf8')
    console.log(`Written (unchanged): ${outputPath}`)
    return
  }

  console.log(`Found ${urls.size} unique image URL${urls.size !== 1 ? 's' : ''}. Fetching…\n`)

  const map = new Map()
  let ok = 0
  let fail = 0

  // Fetch all concurrently (with a concurrency cap of 6)
  const urlList = Array.from(urls)
  const CONCURRENCY = 6
  for (let i = 0; i < urlList.length; i += CONCURRENCY) {
    const batch = urlList.slice(i, i + CONCURRENCY)
    const results = await Promise.all(batch.map(url => fetchAsDataUri(url)))
    results.forEach((dataUri, j) => {
      const url = batch[j]
      const label = url.length > 70 ? url.slice(0, 67) + '…' : url
      if (dataUri) {
        map.set(url, dataUri)
        const kb = Math.round(dataUri.length * 0.75 / 1024)
        console.log(`  ✓  ${label} (${kb} KB)`)
        ok++
      } else {
        console.log(`  ✗  ${label}`)
        fail++
      }
    })
  }

  console.log(`\n${ok} fetched, ${fail} failed.`)

  substituteUrls(penFile.children, map)

  const output = JSON.stringify(penFile)
  fs.writeFileSync(outputPath, output, 'utf8')

  const inKb  = Math.round(raw.length / 1024)
  const outKb = Math.round(output.length / 1024)
  console.log(`\nInput:  ${inKb} KB`)
  console.log(`Output: ${outKb} KB`)
  console.log(`\nWritten: ${outputPath}`)
  if (fail > 0) {
    console.log(`\nNote: ${fail} image${fail !== 1 ? 's' : ''} could not be fetched and will show as gray placeholders in Figma.`)
  }
  console.log('\nImport the output file into the Pencil-to-Figma plugin.')
}

main().catch(err => {
  console.error('Unexpected error:', err)
  process.exit(1)
})
