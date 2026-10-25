import {createHash} from 'node:crypto';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';

const files=['BridgeDemo.csproj','global.json','NuGet.Config','Program.cs','StateStore.cs','Models.cs','mt5/RelayDemo.mq5','tests/integration.mjs','tests/pentagi/offline-flow.json','.github/workflows/ci.yml'];
const hashes={};
for(const file of files) hashes[file]=createHash('sha256').update(await readFile(file)).digest('hex');
const sourceRevision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const dotnetVersion=execFileSync(process.env.DOTNET_EXE||'dotnet',['--version'],{encoding:'utf8'}).trim();
await mkdir('artifacts',{recursive:true});
await writeFile('artifacts/validation-manifest.json',JSON.stringify({sourceRevision,nodeVersion:process.version,dotnetVersion,hashes,scope:'synthetic loopback only; no broker'},null,2));
console.log('Validation manifest saved; source hashes and runtime versions only.');
