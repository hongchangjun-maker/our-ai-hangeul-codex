import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const failures = [];

function filesIn(directory) {
  const output = [];
  for (const name of readdirSync(directory)) {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) output.push(...filesIn(path));
    else if (/\.(ts|tsx)$/.test(name)) output.push(path);
  }
  return output;
}

const sourceFiles = filesIn(join(root, 'app'));
for (const path of sourceFiles) {
  const source = readFileSync(path, 'utf8');
  const name = relative(root, path).replaceAll('\\', '/');
  const lineCount = source.split(/\r?\n/).length;
  if (name.startsWith('app/domain/') && /from ['"](?:react|next|cloudflare:|openai|idb)/.test(source)) failures.push(`${name}: domain imports a platform or framework`);
  if (name.startsWith('app/editor/') && /from ['"](?:cloudflare:workers|openai)/.test(source)) failures.push(`${name}: presentation imports a server provider`);
  if (name.startsWith('app/editor/') && /process\.env|cloudflare:workers/.test(source)) failures.push(`${name}: presentation reads a server environment`);
  if (lineCount > 430) failures.push(`${name}: ${lineCount} lines exceeds the reviewed responsibility threshold`);
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log(`Architecture checks passed for ${sourceFiles.length} source files.`);
