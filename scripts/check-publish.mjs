import { readdir } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(process.argv[2] || 'artifacts/publish');
const excluded = new Set(['data','.tools','artifacts','tests','.git','mt5']);
async function inspect(directory) {
  for(const entry of await readdir(directory,{withFileTypes:true})) {
    if(excluded.has(entry.name.toLowerCase()) || ['state.json','server.lock'].includes(entry.name.toLowerCase()) || /\.(db|sqlite)(-wal|-shm)?$/i.test(entry.name))
      throw new Error(`Local-only content leaked into publish output: ${path.relative(root,path.join(directory,entry.name))}`);
    if(entry.isDirectory()) await inspect(path.join(directory,entry.name));
  }
}
await inspect(root);
console.log('Publish boundary passed: no local state, tools, tests or terminal files.');
