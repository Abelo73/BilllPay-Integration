// Run: node --experimental-strip-types --test tests/interests-core.test.ts   (Node 22+, nothing to install)
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { addAction, interests, MAX_ACTIONS, rowsFor, weight, type Action } from '../src/lib/interests-core.ts'

const DAY = 86_400_000
const NOW = Date.UTC(2026, 10, 16, 12)
const at = (daysAgo: number) => NOW - daysAgo * DAY
// each action 15 seconds after the one before, as when a person really clicks
let seq = 0
const add = (list: Action[], a: Omit<Action, 'at'>, daysAgo = 0) => addAction(list, { ...a, at: at(daysAgo) - (200 - ++seq) * 15_000 }, NOW)

test('the plan example: 2 laptop searches and 3 laptop views (2 HP) → laptops first, then HP', () => {
  let l: Action[] = []
  l = add(l, { kind: 'search', term: 'laptop', category: 'laptops', categoryName: 'Laptops' })
  l = add(l, { kind: 'search', term: 'laptop', category: 'laptops', categoryName: 'Laptops' })
  l = add(l, { kind: 'view', category: 'laptops', categoryName: 'Laptops', brand: 'HP', productSlug: 'hp-1' })
  l = add(l, { kind: 'view', category: 'laptops', categoryName: 'Laptops', brand: 'HP', productSlug: 'hp-2' })
  l = add(l, { kind: 'view', category: 'laptops', categoryName: 'Laptops', brand: 'Dell', productSlug: 'dell-1' })
  const i = interests(l, NOW)
  assert.equal(i.categories[0].slug, 'laptops')
  assert.equal(Math.round(i.categories[0].score), 13)
  assert.equal(i.brands[0].name, 'HP')
  assert.equal(Math.round(i.brands[0].score), 6)
  assert.deepEqual(i.searches, ['laptop'])
  assert.deepEqual(i.viewed, ['dell-1', 'hp-2', 'hp-1'])
  assert.deepEqual(rowsFor(i), [
    { kind: 'category', slug: 'laptops', name: 'Laptops' },
    { kind: 'brand', name: 'HP' },
  ])
})

test('newer interests win: a week later, sofas looked at today come before last week\'s laptops', () => {
  let l: Action[] = []
  for (let n = 0; n < 3; n++) l = add(l, { kind: 'view', category: 'laptops', categoryName: 'Laptops', productSlug: `l${n}` }, 8)
  for (let n = 0; n < 3; n++) l = add(l, { kind: 'view', category: 'sofas', categoryName: 'Sofas', productSlug: `s${n}` })
  assert.deepEqual(interests(l, NOW).categories.map((c) => c.slug), ['sofas', 'laptops'])
})

test('weights: saved 5, viewed 3, category 2, search 2; half after 7 days; gone after 30', () => {
  assert.equal(weight({ kind: 'save', at: NOW }, NOW), 5)
  assert.equal(weight({ kind: 'view', at: NOW }, NOW), 3)
  assert.equal(weight({ kind: 'category', at: NOW }, NOW), 2)
  assert.equal(weight({ kind: 'view', at: at(7) }, NOW), 1.5)
  assert.equal(add([], { kind: 'view', category: 'tvs', productSlug: 'tv' }, 31).length, 0)
})

test('private categories and searches are never kept', () => {
  let l: Action[] = []
  l = add(l, { kind: 'view', category: 'medical-supplies', categoryName: 'Medical supplies', productSlug: 'x' })
  l = add(l, { kind: 'search', term: 'pregnancy test' })
  l = add(l, { kind: 'category', category: 'pharmacy' })
  assert.equal(l.length, 0)
})

test('digits-only searches (phone numbers) are dropped; searches are trimmed and not repeated', () => {
  let l: Action[] = []
  l = add(l, { kind: 'search', term: '0911 234 567' })
  l = add(l, { kind: 'search', term: '  headset  ' })
  l = add(l, { kind: 'search', term: 'Headset' })
  l = add(l, { kind: 'search', term: 'table' })
  assert.deepEqual(interests(l, NOW).searches, ['table', 'Headset'])
})

test('only the newest 50 actions are kept', () => {
  let l: Action[] = []
  for (let n = 0; n < 70; n++) l = addAction(l, { kind: 'category', category: `c${n}`, at: NOW - (70 - n) * 1000 }, NOW)
  assert.equal(l.length, MAX_ACTIONS)
  assert.equal(l[0].category, 'c20')
})

test('a search not covered by a category row gets its own row; one already covered does not', () => {
  let l: Action[] = []
  l = add(l, { kind: 'view', category: 'tables', categoryName: 'Tables', productSlug: 't1' })
  l = add(l, { kind: 'search', term: 'headset' })
  l = add(l, { kind: 'search', term: 'table' })
  assert.deepEqual(rowsFor(interests(l, NOW)), [
    { kind: 'category', slug: 'tables', name: 'Tables' },
    { kind: 'search', term: 'headset' },
  ])
})

test('no history → no rows (the home page stays as it is)', () => {
  assert.deepEqual(rowsFor(interests([], NOW)), [])
})

test('the same action twice within 10 seconds counts once', () => {
  let l: Action[] = []
  l = addAction(l, { kind: 'category', category: 'sofas', at: NOW - 3000 }, NOW)
  l = addAction(l, { kind: 'category', category: 'sofas', at: NOW }, NOW)
  assert.equal(l.length, 1)
  l = addAction(l, { kind: 'category', category: 'sofas', at: NOW + 20_000 }, NOW + 20_000)
  assert.equal(l.length, 2)
})
