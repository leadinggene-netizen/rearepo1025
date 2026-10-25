import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import net from 'node:net';
import path from 'node:path';

test('HTTP, SignalR, durable command lifecycle and restart recovery (no broker)', {timeout:45000}, async t => {
  await mkdir('artifacts', {recursive:true});
  const directory = await mkdtemp(path.resolve('artifacts/test-'));
  const listener = net.createServer(); listener.listen(0,'127.0.0.1'); await once(listener,'listening');
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const dotnet = process.env.DOTNET_EXE || 'dotnet';
  const dll = process.env.BRIDGE_DLL || path.resolve('bin/Debug/net10.0/BridgeDemo.dll');
  let server, output = '';
  async function start() {
    output = '';
    server = spawn(dotnet, [dll], {env:{...process.env,BRIDGE_DATA:directory,ASPNETCORE_URLS:base},stdio:['ignore','pipe','pipe']});
    server.stdout.on('data', b => output += b); server.stderr.on('data', b => output += b);
    server.on('error', e => { output += e.message; });
    for(let i=0;i<150;i++) {
      if(server.exitCode !== null) throw new Error(`Server exited: ${output}`);
      try { if((await fetch(`${base}/health`)).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve,100));
    }
    throw new Error(`Server not ready: ${output}`);
  }
  async function stop() { if(server && server.exitCode === null) { const exited = once(server,'exit'); server.kill(); await exited; } }
  t.after(stop); await start();
  const statePath = path.join(directory,'state.json');
  const secrets = JSON.parse(await readFile(statePath,'utf8'));
  const admin = secrets.adminKey, terminal = secrets.connection.terminalKey, webhook = secrets.connection.webhookKey;
  function request(route,key,body) { return fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'X-Bridge-Key':key,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}); }
  const poll = '/api/terminal/poll?mode=demo&account=12345&broker=Test-Demo&balance=10000&equity=9999&positions=0';
  const alert = {id:'first-alert',action:'buy',symbol:'EURUSD',lots:0.01,slPoints:200,tpPoints:400};
  assert.equal((await fetch(base+'/')).status,200);
  assert.equal((await request('/api/admin/state','wrong')).status,401);
  assert.equal((await request('/api/admin/state',terminal)).status,401);
  assert.equal((await request('/hub/portal/negotiate?negotiateVersion=1','wrong',{})).status,401);
  assert.equal((await request('/api/webhook/demo-mt5',webhook,alert)).status,409,'offline terminal blocks stale orders');
  assert.equal((await request(poll.replace('mode=demo','mode=live'),terminal)).status,400);
  assert.equal((await request(poll,terminal)).status,204);
  assert.equal((await request(poll.replace('12345','99999'),terminal)).status,409,'account identity is bound');
  assert.equal((await request('/api/webhook/demo-mt5',terminal,alert)).status,401);
  assert.equal((await request('/api/webhook/demo-mt5',webhook,{...alert,lots:50})).status,400);

  const negotiation = await (await fetch(base+'/hub/portal/negotiate?negotiateVersion=1', {method:'POST',headers:{Authorization:`Bearer ${admin}`}})).json();
  const ws = new WebSocket(`ws://127.0.0.1:${port}/hub/portal?id=${encodeURIComponent(negotiation.connectionToken)}&access_token=${admin}`);
  t.after(() => ws.close());
  await once(ws,'open');
  const messages=[]; ws.addEventListener('message', e => messages.push(e.data));
  ws.send(JSON.stringify({protocol:'json',version:1})+'\x1e');
  for(let i=0;i<30 && !messages.length;i++) await new Promise(resolve=>setTimeout(resolve,50));
  assert.ok(messages.some(m=>m.includes('{}')),'SignalR handshake completed');
  assert.equal((await request('/api/webhook/demo-mt5',webhook,alert)).status,202);
  assert.equal((await fetch(base+'/api/webhook/demo-mt5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...alert,secret:webhook})})).status,200,'TradingView-compatible JSON secret');
  assert.equal((await request('/api/webhook/demo-mt5',webhook,alert)).status,200,'same ID is idempotent');
  assert.equal((await request('/api/webhook/demo-mt5',webhook,{...alert,lots:0.02})).status,409);
  const simultaneous = await Promise.all([request(poll,terminal),request(poll,terminal)]);
  assert.deepEqual(simultaneous.map(x=>x.status).sort(),[200,204],'only one poll receives the command');
  const wire = await simultaneous.find(x=>x.status===200).text();
  assert.equal(wire,'v1|first-alert|buy|EURUSD|0.01|200|400');
  assert.equal((await request('/api/webhook/demo-mt5',webhook,{...alert,id:'blocked'})).status,409);
  const result = {id:alert.id,status:'filled',ticket:'test-deal-01',detail:'Protocol test only; no broker execution'};
  assert.equal((await request('/api/terminal/result',webhook,result)).status,401);
  assert.equal((await request('/api/terminal/result',terminal,result)).status,200);
  assert.equal((await request('/api/terminal/result',terminal,result)).status,200,'result retries are idempotent');
  assert.equal((await request('/api/terminal/result',terminal,{...result,status:'closed'})).status,409);
  const dashboard = await (await request('/api/admin/state',admin)).json();
  assert.equal(dashboard.signals[0].status,'filled'); assert.equal(dashboard.connection.equity,9999);
  for(let i=0;i<20&&!messages.some(m=>m.includes('changed'));i++) await new Promise(resolve=>setTimeout(resolve,50));
  assert.ok(messages.some(m=>m.includes('changed')),'SignalR broadcasts actual state changes');
  ws.close();

  const second = {...alert,id:'interrupted'};
  assert.equal((await request('/api/webhook/demo-mt5',webhook,second)).status,202);
  assert.equal((await request(poll,terminal)).status,200);
  await stop(); await start();
  const recovered = await (await request('/api/admin/state',admin)).json();
  assert.equal(recovered.signals[0].status,'unknown','restart does not redeliver an uncertain trade');
  assert.equal((await request(poll,terminal)).status,204);
  assert.equal((await request('/api/webhook/demo-mt5',webhook,{...alert,id:'blocked-after-restart'})).status,409);
  assert.equal((await request('/api/admin/resolve/interrupted',admin,{})).status,200);
  assert.equal((await request('/api/terminal/result',terminal,{...result,id:'interrupted',status:'unknown'})).status,200,'acknowledged terminal journal can clear');
  assert.equal((await request('/api/webhook/demo-mt5',webhook,{...alert,id:'expires'})).status,202);
  await stop();
  const saved=JSON.parse(await readFile(statePath,'utf8')); saved.signals.find(s=>s.id==='expires').createdAt='2000-01-01T00:00:00Z';
  await writeFile(statePath,JSON.stringify(saved)); await start();
  assert.equal((await request(poll,terminal)).status,204);
  const expired=await (await request('/api/admin/state',admin)).json();
  assert.equal(expired.signals[0].status,'expired');
});
