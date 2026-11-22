// Tiny static server for the spike viewer. node spike/serve.mjs  ->  http://localhost:5190
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));
const types = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.mjs': 'text/javascript' };

createServer(async (req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  const file = join(root, path === '' ? 'viewer.html' : path);
  if (!file.startsWith(root)) return res.writeHead(403).end();
  try {
    const body = await readFile(file); // read first, so a missing file can still answer 404
    res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'text/plain' }).end(body);
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(5190, () => console.log('Spike viewer on http://localhost:5190'));
