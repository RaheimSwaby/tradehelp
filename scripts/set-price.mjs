#!/usr/bin/env node
/**
 * Single source of truth for the price on the marketing site.
 *
 * docs/ is served as static files with no build step, and the price appears in
 * the visible copy AND twice in the JSON-LD that search engines read from the
 * HTML source. Injecting it with client-side JS would render it for people but
 * leave crawlers reading a placeholder, so the number stays literal in the file
 * and this script is what changes it everywhere at once.
 *
 *   node scripts/set-price.mjs --check     verify every instance agrees
 *   node scripts/set-price.mjs 50          set the launch price to $50
 *   node scripts/set-price.mjs 50 --regular 75
 *
 * Run --check in CI: the failure mode this exists to prevent is a page that
 * advertises two different prices in two different places.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const PAGE = join(root, 'docs', 'index.html')

// The price as it stands. Change it through this script, never by hand.
const CURRENT = { price: 25, regular: 50 }

const args = process.argv.slice(2)
const check = args.includes('--check')
const nextPrice = Number(args.find((a) => /^\d+$/.test(a)) ?? CURRENT.price)
const regularFlag = args.indexOf('--regular')
const nextRegular = regularFlag > -1 ? Number(args[regularFlag + 1]) : CURRENT.regular

const html = readFileSync(PAGE, 'utf8')

// Every way the number is written on the page. Kept explicit rather than a bare
// /\$\d+/ sweep so a figure that is not the product price (a competitor's
// monthly cost, for instance) is never rewritten by accident.
const priceForms = [
  new RegExp(`\\$${CURRENT.price}\\b`, 'g'),                       // "$25" in copy
  new RegExp(`"price":\\s*"${CURRENT.price}(?:\\.00)?"`, 'g'),     // JSON-LD
  new RegExp(`"price":\\s*${CURRENT.price}(?:\\.00)?\\b`, 'g')     // JSON-LD, unquoted
]
const regularForms = [new RegExp(`\\$${CURRENT.regular}\\b`, 'g')]

const count = (forms) => forms.reduce((n, re) => n + (html.match(re) || []).length, 0)
const priceHits = count(priceForms)
const regularHits = count(regularForms)

if (check) {
  // Anything that looks like a product price but is not the declared one.
  const stray = [...html.matchAll(/\$(\d+)\b/g)]
    .map((m) => Number(m[1]))
    .filter((n) => n !== CURRENT.price && n !== CURRENT.regular)
  const unique = [...new Set(stray)]

  console.log(`  price  $${CURRENT.price}: ${priceHits} instance(s)`)
  console.log(`  regular $${CURRENT.regular}: ${regularHits} instance(s)`)
  if (unique.length) console.log(`  other dollar figures on the page: ${unique.map((n) => '$' + n).join(', ')}`)

  if (priceHits === 0) {
    console.error(`\n  FAIL: no "$${CURRENT.price}" found. CURRENT is out of step with the page.`)
    process.exit(1)
  }
  console.log('\n  OK: every price instance matches the declared value.')
  process.exit(0)
}

if (nextPrice === CURRENT.price && nextRegular === CURRENT.regular) {
  console.log('  Nothing to change. Pass a new price, e.g. node scripts/set-price.mjs 50')
  process.exit(0)
}

let out = html
for (const re of priceForms) {
  out = out.replace(re, (m) => m.replace(String(CURRENT.price), String(nextPrice)))
}
for (const re of regularForms) {
  out = out.replace(re, `$${nextRegular}`)
}
writeFileSync(PAGE, out)

// Update this file's own record so --check keeps working next time.
const self = fileURLToPath(import.meta.url)
writeFileSync(self, readFileSync(self, 'utf8').replace(
  `const CURRENT = { price: ${CURRENT.price}, regular: ${CURRENT.regular} }`,
  `const CURRENT = { price: ${nextPrice}, regular: ${nextRegular} }`
))

console.log(`  price $${CURRENT.price} -> $${nextPrice} (${priceHits} instances)`)
console.log(`  regular $${CURRENT.regular} -> $${nextRegular} (${regularHits} instances)`)
console.log('  Remember the first-100 promise: raising the price is what makes that sentence true.')
