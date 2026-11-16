import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

// 1. Web App Manifest
const manifestPath = resolve(process.cwd(), 'public/manifest.webmanifest');
assert.ok(existsSync(manifestPath), 'manifest.webmanifest must exist in public/');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'));
assert.equal(manifest.name, 'TV Arena', 'manifest name must be TV Arena');
assert.equal(manifest.short_name, 'TV Arena', 'manifest short_name must be TV Arena');
assert.equal(manifest.start_url, '/', 'start_url must be /');
assert.equal(manifest.display, 'standalone', 'display mode must be standalone');
assert.equal(manifest.theme_color, '#C66A3D', 'theme_color must match brand terracotta');
assert.equal(manifest.background_color, '#FAF6F0', 'background_color must match brand sand');
assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0, 'manifest must declare icons');
assert.equal(manifest.icons[0].src, '/icon.svg');
assert.equal(manifest.icons[0].type, 'image/svg+xml');

// 2. Icon SVG
const iconPath = resolve(process.cwd(), 'public/icon.svg');
assert.ok(existsSync(iconPath), 'icon.svg must exist in public/');
const svg = readFileSync(iconPath, 'utf-8');
assert.ok(svg.includes('<svg'), 'icon must be a valid SVG');
assert.ok(svg.includes('viewBox="0 0 512 512"'), 'icon must have 512x512 viewBox');

// 3. index.html tags
const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf-8');
assert.ok(html.includes('<link rel="manifest" href="/manifest.webmanifest" />'), 'index.html must link manifest');
assert.ok(html.includes('<meta name="theme-color" content="#C66A3D" />'), 'index.html must declare theme-color');
assert.ok(html.includes('<link rel="icon" type="image/svg+xml" href="/icon.svg" />'), 'index.html must link icon.svg');

// 4. Service Worker (public/sw.js)
const swPath = resolve(process.cwd(), 'public/sw.js');
assert.ok(existsSync(swPath), 'sw.js must exist in public/');
const sw = readFileSync(swPath, 'utf-8');
assert.ok(sw.includes("const CACHE_NAME = 'tv-arena-v1'"), 'sw.js must define versioned app shell cache');
assert.ok(sw.includes("const DATA_CACHE_NAME = 'tv-arena-data-v1'"), 'sw.js must define versioned data cache');
assert.ok(sw.includes('caches.delete(name)'), 'sw.js must evict stale cache versions on activate');
assert.ok(sw.includes("request.method !== 'GET'"), 'sw.js must intercept non-GET mutations');
assert.ok(sw.includes('503'), 'sw.js must return 503 for mutations when offline');
assert.ok(sw.includes('/snapshot.json'), 'sw.js must cache snapshot.json for offline viewing');

// 5. Headers (public/_headers)
const headers = readFileSync(resolve(process.cwd(), 'public/_headers'), 'utf-8');
assert.ok(headers.includes('/sw.js'), 'sw.js must have explicit caching rule');
assert.ok(headers.includes('no-store'), 'sw.js must never be cached by CDN');
assert.ok(headers.includes('/manifest.webmanifest'), 'manifest must have content-type and cache rule');

console.log('PWA manifest, icon, service worker, and caching tests passed.');
