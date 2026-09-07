import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('../emails/', import.meta.url));
const base = await readFile(path.join(root, 'base.html'), 'utf8');
const templates = JSON.parse(await readFile(path.join(root, 'templates.json'), 'utf8'));
const checkOnly = process.argv.includes('--check');
const escapeHtml = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const previewValues = { ConfirmationURL: '#preview-only', NewEmail: 'creator@example.com', Token: '482619' };
const subjects = {};
const previews = [];
const iconOrigin = 'https://frontend-mu-flame-44.vercel.app/email-icons/';
const iconNames = ['play', 'clapper', 'bolt', 'folder', 'people'];
const icon = (name, size = 42) => `<img src="${iconOrigin}${name}-v2.png" width="${size}" height="${size}" alt="" role="presentation" style="display:block;width:${size}px;height:${size}px;border:0;">`;
const featureRow = `<tr><td class="pad" style="padding:0 40px 30px;"><table role="presentation" width="100%" style="table-layout:fixed;"><tr>${[['bolt', 'Create amazing<br>clips'], ['folder', 'Save your<br>projects'], ['people', 'Bring ideas<br>to life']].map(([name, label]) => `<td width="33%" align="center" valign="top" style="padding:0 4px;">${icon(name)}<div class="feature" style="padding-top:12px;font-size:12px;line-height:19px;color:#bcbcc7;">${label}</div></td>`).join('')}</tr></table></td></tr>`;

if (!checkOnly) await mkdir(path.join(root, 'ready'), { recursive: true });

for (const template of templates) {
  const action = template.code
    ? '<div class="code" style="padding:22px 10px;text-align:center;background-color:#202026;border:1px solid #3a3a44;border-radius:10px;font-family:Consolas,monospace;font-size:40px;line-height:48px;letter-spacing:10px;font-weight:bold;color:#c4b5fd;">{{ .Token }}</div>'
    : `<table role="presentation" width="100%" style="max-width:340px;"><tr><td align="center" bgcolor="#7545d6" style="background-color:#7545d6;border-radius:8px;mso-padding-alt:17px 24px;"><a href="{{ .ConfirmationURL }}" style="display:block;padding:17px 24px;font-size:16px;line-height:22px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;">${template.button} &rarr;</a></td></tr></table>`;
  const fallback = template.code
    ? 'Code no longer working? Return to ClipForge and request a new one.'
    : 'Button not working? Copy this link into your browser:<br><a href="{{ .ConfirmationURL }}" style="display:block;margin-top:8px;font-size:11px;line-height:18px;color:#c4b5fd;word-break:break-all;overflow-wrap:anywhere;text-decoration:underline;">{{ .ConfirmationURL }}</a>';
  const values = { ...template, action, fallback, play: icon('play', 36), clapper: icon('clapper', 36), features: ['confirm-sign-up', 'invite-user'].includes(template.id) ? featureRow : '' };
  const html = base.replace(/\[\[(\w+)\]\]/g, (_, key) => {
    assert.equal(typeof values[key], 'string', `Missing ${key}`);
    return values[key];
  });
  assert.equal((html.match(/<!doctype html>/gi) || []).length, 1);
  assert(!/\[\[|<script|<svg|<iframe|filter:|box-shadow:|gradient\(/i.test(html));
  for (const image of html.matchAll(/<img\s+[^>]*src="([^"]+)"[^>]*>/g)) {
    assert(iconNames.some(name => image[1] === `${iconOrigin}${name}-v2.png`));
    assert(image[0].includes('alt=""'));
  }
  assert(Buffer.byteLength(html) < 50_000);
  assert(html.includes(template.code ? '{{ .Token }}' : 'href="{{ .ConfirmationURL }}"'));
  assert.equal(html.includes('{{ .NewEmail }}'), template.id === 'change-email');
  assert.equal(html.includes('{{ .Token }}'), Boolean(template.code));
  const filename = `${template.id}.html`;
  if (checkOnly) assert.equal(await readFile(path.join(root, 'ready', filename), 'utf8'), html, `${filename} is stale`);
  else await writeFile(path.join(root, 'ready', filename), html);
  subjects[filename] = { template: template.label, subject: template.subject };
  let demo = html.replace(/\{\{\s*\.(\w+)\s*\}\}/g, (_, key) => previewValues[key] ?? '');
  for (const name of iconNames) {
    const image = await readFile(new URL(`../frontend/public/email-icons/${name}-v2.png`, import.meta.url));
    demo = demo.replaceAll(`${iconOrigin}${name}-v2.png`, `data:image/png;base64,${image.toString('base64')}`);
  }
  previews.push(`<section><h2>${template.label}</h2><p>${escapeHtml(template.subject)}</p><iframe title="${template.label} desktop" sandbox srcdoc="${escapeHtml(demo)}"></iframe><iframe class="phone" title="${template.label} mobile" sandbox srcdoc="${escapeHtml(demo)}"></iframe></section>`);
}

const preview = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ClipForge — Email collection</title><style>body{margin:0;padding:40px 24px;background:#09070d;color:#f8f5fc;font-family:Arial,sans-serif}header,main{max-width:1100px;margin:auto}h1{font-size:42px;letter-spacing:-2px}p{color:#b7a9c4;line-height:1.6}h2{margin-top:48px}iframe{width:640px;max-width:100%;height:1010px;border:1px solid #483355;border-radius:16px;background:#0e0b13;vertical-align:top;box-sizing:border-box}.phone{width:375px;margin-left:20px}@media(max-width:1080px){.phone{margin:20px 0 0}}strong{color:#b5ffe5}</style></head><body><header><p>CLIPFORGE / ACCOUNT EMAILS</p><h1>Small messages.<br>Strong first impressions.</h1><p>Six English templates. Desktop + mobile. <strong>Preview only — all links and codes are demo values.</strong></p></header><main>${previews.join('')}</main></body></html>`;
if (!checkOnly) {
  await writeFile(path.join(root, 'preview.html'), preview);
  await writeFile(path.join(root, 'subjects.json'), `${JSON.stringify(subjects, null, 2)}\n`);
}
console.log(`${checkOnly ? 'Verified' : 'Built'} ${templates.length} email templates. No remote settings changed.`);
