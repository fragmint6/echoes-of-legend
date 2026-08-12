/* =============================================================
   Echoes of Legend - social-link preview contract
   -------------------------------------------------------------
   node sim/verify_social_embed.js

   Discord and other unfurlers read only the initial HTML. This check
   protects the Open Graph/Twitter fields and the 1200x630 preview asset.
   ============================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

let passed = 0;
let failed = 0;
function ok(value, message) {
  if (value) {
    passed += 1;
    console.log('  \x1b[32mPASS\x1b[0m  ' + message);
  } else {
    failed += 1;
    console.log('  \x1b[31mFAIL\x1b[0m  ' + message);
  }
}

function meta(attr, key) {
  const tags = HTML.match(/<meta\b[^>]*>/gi) || [];
  const found = tags.filter((tag) => {
    const match = tag.match(new RegExp('\\b' + attr + '=["\\\']([^"\\\']+)["\\\']', 'i'));
    return match && match[1] === key;
  });
  if (found.length !== 1) return { count: found.length, content: '' };
  const value = found[0].match(/\bcontent=["']([^"']*)["']/i);
  return { count: 1, content: value ? value[1] : '' };
}

function jpegSize(file) {
  const data = fs.readFileSync(file);
  if (data[0] !== 0xff || data[1] !== 0xd8) return null;
  let at = 2;
  while (at + 8 < data.length) {
    if (data[at] !== 0xff) {
      at += 1;
      continue;
    }
    const marker = data[at + 1];
    at += 2;
    if (marker === 0xd8 || marker === 0xd9) continue;
    const length = data.readUInt16BE(at);
    if (length < 2 || at + length > data.length) return null;
    if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7)) {
      return { height: data.readUInt16BE(at + 3), width: data.readUInt16BE(at + 5) };
    }
    at += length;
  }
  return null;
}

console.log('\nSocial preview');
const required = [
  ['property', 'og:type'],
  ['property', 'og:site_name'],
  ['property', 'og:title'],
  ['property', 'og:description'],
  ['property', 'og:url'],
  ['property', 'og:image'],
  ['property', 'og:image:secure_url'],
  ['property', 'og:image:type'],
  ['property', 'og:image:width'],
  ['property', 'og:image:height'],
  ['property', 'og:image:alt'],
  ['name', 'twitter:card'],
  ['name', 'twitter:title'],
  ['name', 'twitter:description'],
  ['name', 'twitter:image'],
  ['name', 'twitter:image:alt'],
];
const values = {};
required.forEach(([attr, key]) => {
  const found = meta(attr, key);
  values[key] = found.content;
  ok(found.count === 1 && !!found.content, key + ' is present exactly once with content');
});

const imageUrl = values['og:image'] || '';
ok(/^https:\/\//.test(imageUrl), 'Open Graph image uses an absolute HTTPS URL');
ok(values['og:image:secure_url'] === imageUrl, 'secure image URL matches the primary image');
ok(values['twitter:image'] === imageUrl, 'Twitter and Open Graph use the same artwork');
ok(values['twitter:card'] === 'summary_large_image', 'Twitter requests a large image card');
ok(values['og:image:type'] === 'image/jpeg', 'declared image MIME type matches the asset');
ok(values['og:image:width'] === '1200' && values['og:image:height'] === '630', 'declared image is 1200x630');

const imageFile = path.join(ROOT, 'assets/social-preview.jpg');
ok(fs.existsSync(imageFile), 'social preview image exists');
if (fs.existsSync(imageFile)) {
  const dimensions = jpegSize(imageFile);
  ok(dimensions && dimensions.width === 1200 && dimensions.height === 630, 'JPEG is actually 1200x630');
  ok(fs.statSync(imageFile).size < 5 * 1024 * 1024, 'JPEG stays below Discord’s practical size ceiling');
}

console.log('\n' + '='.repeat(64));
console.log(
  failed
    ? `\x1b[31m${failed} FAILED\x1b[0m / ${passed + failed} assertions`
    : `\x1b[32mALL ${passed} ASSERTIONS PASSED\x1b[0m`
);
console.log('='.repeat(64));
process.exit(failed ? 1 : 0);
