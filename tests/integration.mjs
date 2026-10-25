import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile, stat, utimes, rmdir } from 'node:fs/promises';
import { once } from 'node:events';
import net from 'node:net';
import path from 'node:path';

test('HTTP, SignalR, durable command lifecycle and restart recovery (no broker)', {timeout:45000}, async t => {
  const artifacts=path.resolve(process.env.BRIDGE_TEST_ARTIFACTS || 'artifacts');
  await mkdir(artifacts, {recursive:true});
  const directory = await mkdtemp(path.join(artifacts,'test-'));
  const listener = net.createServer(); listener.listen(0,'127.0.0.1'); await once(listener,'listening');
  const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
  assert.notEqual(port,5080,'tests must never use the MT5-connected preview port');
  const base = `http://127.0.0.1:${port}`;
  const dotnet = process.env.DOTNET_EXE || 'dotnet';
  const dll = process.env.BRIDGE_DLL || path.resolve('bin/Debug/net10.0/BridgeDemo.dll');
  let server, output = '';
  async function start() {
    output = '';
    server = spawn(dotnet, [dll], {env:{...process.env,BRIDGE_DATA:directory,ASPNETCORE_URLS:base,DOTNET_PROCESSOR_COUNT:'1',ASPNETCORE_ENVIRONMENT:'Production'},stdio:['ignore','pipe','pipe']});
    server.stdout.on('data', b => output += b); server.stderr.on('data', b => output += b);
    server.on('error', e => { output += e.message; });
    for(let i=0;i<150;i++) {
      if(server.exitCode !== null) throw new Error(`Server exited: ${output.replace(/\b[0-9a-f]{32}\b/gi,'<TEST-KEY-REDACTED>')}`);
      try { if((await fetch(`${base}/health`)).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve,100));
    }
    throw new Error(`Server not ready: ${output.replace(/\b[0-9a-f]{32}\b/gi,'<TEST-KEY-REDACTED>')}`);
  }
  async function stop() { if(server && server.exitCode === null && server.signalCode === null) { const exited = once(server,'exit'); server.kill(); await exited; } }
  t.after(stop); await start();
  const statePath = path.join(directory,'state.json');
  const secrets = JSON.parse(await readFile(statePath,'utf8'));
  const admin = secrets.adminKey, terminal = secrets.connection.terminalKey, webhook = secrets.connection.webhookKey;
  assert.ok(!output.includes(admin), 'production startup must not print the admin credential into service logs');
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
  await t.test('unchanged dashboard and heartbeat do not rewrite durable state',async()=>{
    const saved=await readFile(statePath,'utf8');
    const sentinel=new Date('2000-01-01T00:00:00Z'); await utimes(statePath,sentinel,sentinel);
    const timestamp=(await stat(statePath)).mtimeMs;
    await request('/api/admin/state',admin);
    await request(poll.replace('balance=10000','balance=10001'),terminal);
    const current=await (await request('/api/admin/state',admin)).json();
    assert.equal(current.connection.balance,10001,'telemetry is updated in memory');
    assert.ok((await readFile(statePath,'utf8'))===saved,'read/telemetry must not change durable content');
    assert.equal((await stat(statePath)).mtimeMs,timestamp,'read/telemetry must not rewrite the file');
  });
  await t.test('control characters and oversized identity fields are rejected without enqueueing',async()=>{
    for(const invalid of ['valid\n','valid\r','valid\r\n','mid\ndle','tab\tvalue','nul\0value']) {
      assert.equal((await request('/api/webhook/demo-mt5',webhook,{...alert,id:invalid})).status,400);
      assert.equal((await request('/api/webhook/demo-mt5',webhook,{...alert,symbol:invalid})).status,400);
    }
    assert.equal((await request('/api/webhook/demo-mt5',webhook,{...alert,id:'a'.repeat(129)})).status,400);
    assert.equal((await request('/api/webhook/demo-mt5',webhook,{...alert,symbol:'a'.repeat(33)})).status,400);
    assert.equal((await request(poll.replace('12345','12345%0A'),terminal)).status,400);
    assert.equal((await request(poll,terminal)).status,204,'invalid commands never enter the queue');
  });
  await t.test('failed durable save cannot publish a queued command',async()=>{
    await mkdir(statePath+'.tmp');
    try {
      assert.equal((await request('/api/webhook/demo-mt5',webhook,{...alert,id:'failed-save'})).status,500);
    } finally { await rmdir(statePath+'.tmp'); }
    const snapshot=await (await request('/api/admin/state',admin)).json();
    assert.equal(snapshot.signals.length,0,'failed transaction must not leak into memory');
    assert.equal((await request(poll,terminal)).status,204,'failed command must never be delivered');
  });
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
  await t.test('maximum-length identity and JSON result strings round-trip exactly',async()=>{
    const boundary={...alert,id:'a'.repeat(128),symbol:'s'.repeat(32)};
    assert.equal((await request('/api/webhook/demo-mt5',webhook,boundary)).status,202);
    const persisted=JSON.parse(await readFile(statePath,'utf8'));
    assert.equal(persisted.signals.at(-1).status,'queued','acceptance is durable');
    assert.equal(await (await request(poll,terminal)).text(),`v1|${boundary.id}|buy|${boundary.symbol}|0.01|200|400`);
    const dispatched=JSON.parse(await readFile(statePath,'utf8'));
    assert.equal(dispatched.signals.at(-1).status,'dispatched','dispatch is durable before delivery');
    const detail='quote " slash \\ controls \n\r\t\b\f\u0001 unicode €';
    assert.equal((await request('/api/terminal/result',terminal,{id:boundary.id,status:'rejected',ticket:'',detail})).status,200);
    const snapshot=await (await request('/api/admin/state',admin)).json();
    assert.equal(snapshot.signals[0].id,boundary.id);
    assert.equal(snapshot.signals[0].symbol,boundary.symbol);
    assert.equal(snapshot.signals[0].detail,detail);
  });
  const dashboard = await (await request('/api/admin/state',admin)).json();
  assert.equal(dashboard.signals.find(s=>s.id===alert.id).status,'filled'); assert.equal(dashboard.connection.equity,9999);
  for(let i=0;i<20&&!messages.some(m=>m.includes('changed'));i++) await new Promise(resolve=>setTimeout(resolve,50));
  assert.ok(messages.some(m=>m.includes('changed')),'SignalR broadcasts actual state changes');
  ws.close();

  const second = {...alert,id:'interrupted'};
  assert.equal((await request('/api/webhook/demo-mt5',webhook,second)).status,202);
  assert.equal((await request(poll,terminal)).status,200);
  await stop(); await start();
  const recovered = await (await request('/api/admin/state',admin)).json();
  assert.equal(recovered.online,false,'restart requires a fresh heartbeat');
  assert.equal(recovered.connection.lastSeen,null,'stale persisted telemetry is discarded');
  assert.equal(recovered.signals[0].status,'unknown','restart does not redeliver an uncertain trade');
  assert.equal((await request(poll,terminal)).status,204);
  assert.equal((await request('/api/webhook/demo-mt5',webhook,{...alert,id:'blocked-after-restart'})).status,409);
  assert.equal((await request('/api/admin/resolve/interrupted',admin,{})).status,200);
  assert.equal((await request('/api/terminal/result',terminal,{...result,id:'interrupted',status:'unknown'})).status,200,'acknowledged terminal journal can clear');
  assert.equal((await request('/api/webhook/demo-mt5',webhook,{...alert,id:'expires'})).status,202);
  await stop();
  const saved=JSON.parse(await readFile(statePath,'utf8')); saved.signals.find(s=>s.id==='expires').createdAt='2000-01-01T00:00:00Z';
  await writeFile(statePath,JSON.stringify(saved)); await start();
  const expired=await (await request('/api/admin/state',admin)).json();
  assert.equal(expired.signals[0].status,'expired');
  const expiredOnDisk=JSON.parse(await readFile(statePath,'utf8'));
  assert.equal(expiredOnDisk.signals.find(s=>s.id==='expires').status,'expired','dashboard maintenance persists actual transitions');
  assert.equal((await request(poll,terminal)).status,204);
  await t.test('large histories retain command safety without read or heartbeat writes',async()=>{
    const measurements=[];
    for(const count of [0,1000,9999]) {
      await stop();
      const fixture=JSON.parse(await readFile(statePath,'utf8'));
      fixture.signals=Array.from({length:count},(_,i)=>({...alert,id:`fixture-${i}`,status:'rejected',createdAt:'2000-01-01T00:00:00Z'}));
      await writeFile(statePath,JSON.stringify(fixture)); await start();
      const sentinel=new Date('2000-01-01T00:00:00Z'); await utimes(statePath,sentinel,sentinel);
      const stamp=(await stat(statePath)).mtimeMs;
      const times=[];
      for(let i=0;i<5;i++) {
        const begin=performance.now();const response=await request('/api/admin/state',admin);
        assert.equal(response.status,200);const data=await response.json();
        times.push(performance.now()-begin);assert.equal(data.signals.length,Math.min(count,200));
        await new Promise(resolve=>setTimeout(resolve,350));
      }
      assert.equal((await request(poll,terminal)).status,204);
      assert.equal((await stat(statePath)).mtimeMs,stamp,'history reads and heartbeat must not rewrite the journal');
      times.sort((a,b)=>a-b);
      measurements.push({completedRecords:count,medianMs:+times[2].toFixed(2),maxMs:+times[4].toFixed(2),requests:5,concurrency:1,journalRewritten:false});
    }
    const accepted={...alert,id:'after-large-history'};
    assert.equal((await request('/api/webhook/demo-mt5',webhook,accepted)).status,202,'one free journal slot remains');
    assert.equal((await request(poll,terminal)).status,200);
    await stop();await start();
    const snapshot=await (await request('/api/admin/state',admin)).json();
    assert.equal(snapshot.signals[0].status,'unknown','large histories retain restart safety');
    await writeFile(path.join(artifacts,'validation-metrics.json'),JSON.stringify({scope:'synthetic loopback only; no broker',measurements},null,2));
  });
});
