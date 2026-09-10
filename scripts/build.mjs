import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'public');
const assets = ['index.html', 'styles.css', 'app.js', 'rpc-client.js'];

for (const file of [...assets, 'api/rpc.js']) {
  if (!fs.existsSync(path.join(root, file))) throw new Error(`Arquivo ausente: ${file}`);
}

new Function(fs.readFileSync(path.join(root, 'app.js'), 'utf8'));
new Function(fs.readFileSync(path.join(root, 'rpc-client.js'), 'utf8'));

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const file of assets) fs.copyFileSync(path.join(root, file), path.join(output, file));

console.log(`Build concluído: ${assets.length} arquivos em public/.`);
