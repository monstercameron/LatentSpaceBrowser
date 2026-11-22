// Generates the ready-made interface catalogs (zh, hi, es, ar) from src/i18n/en.js with the model.
//   node --env-file=../.env scripts/translate-ui.mjs [zh hi es ar]
// Machine translation, checked only for completeness and intact {placeholders}: it has not been
// reviewed by a speaker of each language. Rerun after adding strings to en.js; the files are committed.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import en from '../src/i18n/en.js';
import { LANGUAGES } from '../src/i18n/languages.js';
import { translateCatalog, validateCatalog } from '../src/engine/translate.js';

const apiKey = process.env.APIKEY || process.env.VITE_APIKEY;
if (!apiKey) throw new Error('Set APIKEY in .env first.');
const wanted = process.argv.slice(2);
const targets = LANGUAGES.filter((l) => l.id !== 'en' && (!wanted.length || wanted.includes(l.id)));

for (const language of targets) {
  let catalog = {};
  let cost = 0;
  let todo = en;
  for (let attempt = 1; attempt <= 3 && Object.keys(todo).length; attempt++) {
    const result = await translateCatalog({ apiKey, modelId: 'qwen-3.8-27b', language: language.name, source: todo });
    cost += result.cost;
    const good = Object.fromEntries(Object.entries(result.strings).filter(([k]) => !result.fellBack.includes(k)));
    Object.assign(catalog, good);
    todo = Object.fromEntries(Object.entries(en).filter(([k]) => !(k in catalog)));
    if (Object.keys(todo).length) console.log(`  ${language.id}: ${Object.keys(todo).length} strings to retry (attempt ${attempt})`);
  }
  const check = validateCatalog(en, catalog);
  const ordered = Object.fromEntries(Object.keys(en).filter((k) => k in catalog).map((k) => [k, catalog[k]]));
  writeFileSync(fileURLToPath(new URL(`../src/i18n/${language.id}.json`, import.meta.url)), JSON.stringify(ordered, null, 2) + '\n');
  console.log(`${language.id} (${language.name}): ${Object.keys(ordered).length}/${Object.keys(en).length} strings, ${check.ok ? 'valid' : `INVALID missing ${check.missing.length} broken ${check.broken.length}`}, $${cost.toFixed(4)}`);
}
