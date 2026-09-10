import fs from 'node:fs';
for (const file of ['index.html', 'styles.css', 'app.js', 'rpc-client.js', 'api/rpc.js']) {
  if (!fs.existsSync(new URL(`../${file}`, import.meta.url))) throw new Error(`Arquivo ausente: ${file}`);
}
new Function(fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8'));
new Function(fs.readFileSync(new URL('../rpc-client.js', import.meta.url), 'utf8'));
console.log('Build validado.');
