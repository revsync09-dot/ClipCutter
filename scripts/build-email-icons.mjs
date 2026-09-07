import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const require = createRequire(new URL('../frontend/package.json', import.meta.url));
const sharp = require('sharp');
const destination = fileURLToPath(new URL('../frontend/public/email-icons/', import.meta.url));
const sources = fileURLToPath(new URL('../emails/icons/', import.meta.url));
const shapes = {
  play: '<path d="m9 5 10 7-10 7Z"/>',
  clapper: '<path d="m3 8 17-5 1 5L4 13Zm1 5h17v8H4Z"/><path d="m8 7 3 4m3-6 3 4"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-12h-7Z"/>',
  folder: '<path d="M3 7V5a1 1 0 0 1 1-1h5l3 3h8a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/>',
  people: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2m1-16a3 3 0 0 1 0 6m3 10v-2a6 6 0 0 0-2-4"/>',
};
await mkdir(destination, { recursive: true });
await mkdir(sources, { recursive: true });
for (const [name, shape] of Object.entries(shapes)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 48 48"><rect x=".5" y=".5" width="47" height="47" rx="11" fill="#202026" stroke="#3a3a44"/><g transform="translate(12 12)" fill="none" stroke="#b9a0ff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${shape}</g></svg>`;
  await writeFile(path.join(sources, `${name}.svg`), svg);
  await sharp(Buffer.from(svg)).png().toFile(path.join(destination, `${name}-v2.png`));
}
console.log('Built 5 flat email icons (96px PNG, no glow or blur).');
