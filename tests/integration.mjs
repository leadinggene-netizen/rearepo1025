import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {mkdtemp,mkdir,writeFile,readFile,copyFile,readdir} from 'node:fs/promises';
import {once} from 'node:events';
import net from 'node:net';
import path from 'node:path';

test('transactional alert receipts, ordered demo delivery and recovery (no broker)',{timeout:90000},async t=>{
 const root=path.resolve(process.env.BRIDGE_TEST_ARTIFACTS||'artifacts'); await mkdir(root,{recursive:true});
 let directory=await mkdtemp(path.join(root,'sqlite-test-'));
 const original=directory;
 const legacy={adminKey:'a'.repeat(32),connection:{id:'demo-mt5',terminalKey:'b'.repeat(32),webhookKey:'c'.repeat(32)},signals:[{id:'legacy-filled',action:'buy',symbol:'EURUSD',lots:0.01,status:'filled',createdAt:'2000-01-01T00:00:00Z',ticket:'old-test-deal'},{id:'legacy-queued',action:'buy',symbol:'EURUSD',lots:0.01,status:'queued',createdAt:'2000-01-01T00:00:00Z'},{id:'legacy-dispatched',action:'buy',symbol:'EURUSD',lots:0.01,status:'dispatched',createdAt:'2000-01-01T00:00:00Z'}]};
 await writeFile(path.join(directory,'state.json'),JSON.stringify(legacy));
 const listener=net.createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');const port=listener.address().port;await new Promise(r=>listener.close(r));assert.notEqual(port,5080);
 const base=`http://127.0.0.1:${port}`, admin=legacy.adminKey, terminal=legacy.connection.terminalKey, webhook=legacy.connection.webhookKey;
 const python=process.env.PYTHON_EXE||(process.platform==='win32'?'C:/Program Files/Python312/python.exe':'python3');
 let server,output='';
 const ingressMs=[];
 async function start(){
  output='';server=spawn(process.env.DOTNET_EXE||'dotnet',[process.env.BRIDGE_DLL||path.resolve('bin/Debug/net10.0/BridgeDemo.dll')],{env:{...process.env,BRIDGE_DATA:directory,ASPNETCORE_URLS:base,ASPNETCORE_ENVIRONMENT:'Production',DOTNET_PROCESSOR_COUNT:'1'},stdio:['ignore','pipe','pipe']});
  server.stdout.on('data',b=>output+=b);server.stderr.on('data',b=>output+=b);
  for(let i=0;i<150;i++){if(server.exitCode!==null)throw new Error('Test server exited');try{if((await fetch(base+'/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,100));}
  throw new Error('Test server not ready');
 }
 async function stop(){if(server&&server.exitCode===null&&server.signalCode===null){const done=once(server,'exit');server.kill();await done;}}
 t.after(stop);
 const request=(route,key,body)=>fetch(base+route,{method:body===undefined?'GET':'POST',headers:{'X-Bridge-Key':key,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const snapshot=async()=>{const r=await request('/api/admin/state',admin);assert.equal(r.status,200);return r.json();};
 const poll='/api/terminal/poll?mode=demo&account=12345&broker=Test-Demo&balance=10000&equity=9999&positions=0';
 const alert=(id,extra={})=>({id,action:'buy',symbol:'EURUSD',lots:0.01,slPoints:200,tpPoints:400,...extra});
 const send=(id,extra={})=>request('/api/webhook/demo-mt5',webhook,alert(id,extra));
 const configure=async(extra={})=>{const r=await request('/api/admin/policy',admin,{paused:false,allowedSymbols:['EURUSD'],maxLots:0.1,maxAgeSeconds:30,...extra});assert.equal(r.status,200);};
 const finish=async(id,status='filled')=>{const r=await request('/api/terminal/result',terminal,{id,status,ticket:'test-deal',detail:'Protocol fixture; no broker'});assert.equal(r.status,200);};
 const inspect=(sql)=>JSON.parse(execFileSync(python,['-c','import sqlite3,json,sys; c=sqlite3.connect(sys.argv[1]); print(json.dumps(c.execute(sys.argv[2]).fetchall()))',path.join(directory,'bridge.db'),sql],{encoding:'utf8'}));
 await start();
 await t.test('legacy credentials migrate into SQLite with execution paused',async()=>{
  const state=await snapshot();assert.equal(state.policy.paused,true);assert.deepEqual(state.policy.allowedSymbols,[]);assert.equal(state.connection.terminalKey,terminal);assert.equal(state.online,false);
  assert.equal(inspect('PRAGMA integrity_check')[0][0],'ok');assert.equal(inspect('PRAGMA user_version')[0][0],1);assert.ok(!output.includes(admin));
  assert.equal(state.signals.find(s=>s.id==='legacy-filled').ticket,'old-test-deal');assert.equal(state.signals.find(s=>s.id==='legacy-queued').status,'expired');assert.equal(state.signals.find(s=>s.id==='legacy-dispatched').status,'unknown');
  assert.equal((await request('/api/admin/resolve/legacy-dispatched',admin,{})).status,200);
  assert.equal((await fetch(base+'/api/admin/state')).status,401);assert.equal((await request(poll,admin)).status,401);
 });
 await configure();
 await t.test('authenticated receipts survive offline delivery, duplicates and rejected input',async()=>{
  assert.equal((await send('offline-first')).status,202);assert.equal((await send('offline-second')).status,202);
  assert.equal((await send('offline-first')).status,200);assert.equal((await send('offline-first',{lots:0.02})).status,409);
  assert.equal((await request('/api/webhook/demo-mt5','wrong',alert('unauthorized'))).status,401);
  assert.equal((await send('invalid',{symbol:'bad\n'})).status,400);
  assert.equal((await send('blocked-symbol',{symbol:'OTHER'})).status,422);
  const body=await (await request('/api/admin/receipts',admin)).json();assert.equal(body.receipts.length,6);assert.ok(!JSON.stringify(body).includes(webhook));
  const outcomes=body.receipts.map(r=>r.disposition);assert.ok(outcomes.includes('duplicate'));assert.ok(outcomes.includes('conflict'));assert.ok(outcomes.includes('invalid'));
  const raw=await fetch(base+'/api/webhook/demo-mt5',{method:'POST',headers:{'X-Bridge-Key':webhook,'Content-Type':'application/json'},body:'{"lots":'});assert.equal(raw.status,400);
  await stop();await start();assert.equal((await send('offline-first')).status,200);
  const payload=await fetch(base+'/api/webhook/demo-mt5',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(alert('json-secret',{secret:webhook}))});assert.equal(payload.status,202);
  assert.equal((await request(poll.replace('mode=demo','mode=live'),terminal)).status,400);
  const simultaneous=await Promise.all([request(poll,terminal),request(poll,terminal)]);assert.deepEqual(simultaneous.map(r=>r.status).sort(),[200,204]);assert.match(await simultaneous.find(r=>r.status===200).text(),/^v1\|offline-first\|/);
  assert.equal((await request(poll,terminal)).status,204);await finish('offline-first');
  assert.match(await (await request(poll,terminal)).text(),/^v1\|offline-second\|/);await finish('offline-second');
  assert.match(await (await request(poll,terminal)).text(),/^v1\|json-secret\|/);await finish('json-secret');
 });
 await t.test('paused and stale commands never dispatch, even after restart',async()=>{
  await configure({paused:true});assert.equal((await send('paused')).status,202);assert.equal((await request(poll,terminal)).status,204);
  await stop();await start();assert.equal((await snapshot()).policy.paused,true);assert.equal((await request(poll,terminal)).status,204);
  await configure();assert.match(await (await request(poll,terminal)).text(),/^v1\|paused\|/);await finish('paused');
  assert.equal((await send('stale',{sentAt:'2000-01-01T00:00:00Z'})).status,202);assert.equal((await request(poll,terminal)).status,204);assert.equal((await snapshot()).signals.find(s=>s.id==='stale').status,'expired');
  assert.equal((await send('future',{sentAt:'2099-01-01T00:00:00Z'})).status,400);
  await configure({paused:true});await send('risk-change');await configure({maxLots:0.005});assert.equal((await request(poll,terminal)).status,204);assert.equal((await snapshot()).signals.find(s=>s.id==='risk-change').status,'rejected');await configure();
  await configure({paused:true,maxAgeSeconds:5});await send('offline-expiry');await new Promise(r=>setTimeout(r,5500));await stop();await start();await configure();assert.equal((await request(poll,terminal)).status,204);assert.equal((await snapshot()).signals.find(s=>s.id==='offline-expiry').status,'expired');
 });
 await t.test('identity validation and terminal JSON round-trip remain exact',async()=>{
  for(const invalid of ['tail\n','tail\r','mid\tvalue','nul\0value']) {
   assert.equal((await send(invalid)).status,400);assert.equal((await send('invalid-symbol',{symbol:invalid})).status,400);
  }
  assert.equal((await send('x'.repeat(129))).status,400);assert.equal((await send('long-symbol',{symbol:'S'.repeat(33)})).status,400);
  const id='i'.repeat(128), symbol='S'.repeat(32);await configure({allowedSymbols:[symbol]});assert.equal((await send(id,{symbol})).status,202);
  assert.equal(await (await request(poll,terminal)).text(),`v1|${id}|buy|${symbol}|0.01|200|400`);
  const detail='quote " slash \\ tab\t line\n return\r nul\0';const result={id,status:'filled',ticket:'ticket-"\\\n',detail};
  assert.equal((await request('/api/terminal/result',terminal,result)).status,200);assert.equal((await request('/api/terminal/result',terminal,result)).status,200);
  const saved=(await snapshot()).signals.find(s=>s.id===id);assert.equal(saved.detail,detail);assert.equal(saved.ticket,result.ticket);await configure();
 });
 await t.test('dashboard and telemetry do not rewrite the database journal',async()=>{
  const wal=path.join(directory,'bridge.db-wal');const before=await readFile(wal);
  for(let i=0;i<5;i++){await snapshot();assert.equal((await request(poll.replace('balance=10000','balance=10001'),terminal)).status,204);}
  assert.deepEqual(await readFile(wal),before);assert.equal((await snapshot()).connection.balance,10001);
 });
 await t.test('dispatched commands become unknown on restart and block the FIFO queue',async()=>{
  await send('interrupted');await send('after-unknown');assert.equal((await request(poll,terminal)).status,200);await stop();await start();
  assert.equal((await snapshot()).signals.find(s=>s.id==='interrupted').status,'unknown');assert.equal((await request(poll,terminal)).status,204);
  assert.equal((await request('/api/admin/resolve/interrupted',admin,{})).status,200);assert.match(await (await request(poll,terminal)).text(),/^v1\|after-unknown\|/);await finish('after-unknown');
  assert.equal((await request(poll.replace('12345','99999'),terminal)).status,409);
 });
 await t.test('transaction failure cannot acknowledge or expose a command',async()=>{
  execFileSync(python,['-c',`import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute("CREATE TRIGGER test_receipt_failure BEFORE INSERT ON receipts BEGIN SELECT RAISE(ABORT, 'test failure'); END"); c.commit()`,path.join(directory,'bridge.db')]);
  try{assert.equal((await send('failed-commit')).status,503);}finally{execFileSync(python,['-c','import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute("DROP TRIGGER test_receipt_failure"); c.commit()',path.join(directory,'bridge.db')]);}
  assert.ok(!(await snapshot()).signals.some(s=>s.id==='failed-commit'));assert.equal(inspect("SELECT count(*) FROM commands WHERE id='failed-commit'")[0][0],0);assert.equal((await request(poll,terminal)).status,204);
 });
 await t.test('deduplication persists beyond the recent dashboard window',async()=>{
  for(let i=0;i<205;i++){const began=performance.now();const response=await send('history-'+i,{sentAt:'2000-01-01T00:00:00Z'});assert.equal(response.status,202);await response.json();ingressMs.push(performance.now()-began);}
  assert.ok(Math.max(...ingressMs)<3000,'durable acknowledgement must finish within TradingView timeout on the tested workload');
  assert.equal((await snapshot()).signals.length,200);assert.equal((await send('offline-first')).status,200);assert.equal((await send('offline-first',{lots:0.02})).status,409);
  await stop();await start();assert.equal((await send('offline-first')).status,200);assert.equal((await request(poll,terminal)).status,204);
 });
 await t.test('consistent backup and restore preserve history without replaying queued orders',async()=>{
  await send('restore-dispatched');assert.equal((await request(poll,terminal)).status,200);await configure({paused:true});await send('restore-pending');
  const r=await request('/api/admin/backup',admin,{});assert.equal(r.status,200);const result=await r.json();assert.equal(result.integrity,'ok');
  const restored=await mkdtemp(path.join(root,'restored-'));
  execFileSync(python,['scripts/db-maintenance.py','restore',path.join(directory,'backups',result.file),restored]);
  await stop();directory=restored;await start();const state=await snapshot();assert.equal(state.policy.paused,true);assert.equal(state.connection.account,'12345');assert.equal(state.signals.find(s=>s.id==='restore-pending').status,'expired');
  assert.equal(state.signals.find(s=>s.id==='restore-dispatched').status,'unknown');await configure();assert.equal((await request(poll,terminal)).status,204);assert.equal((await send('offline-first')).status,200);
  const receipts=await (await request('/api/admin/receipts',admin)).json();assert.ok(receipts.receipts.length>0);
  await stop();directory=original;await start();
 });
 await t.test('SignalR portal handshake and receipt notifications remain available',async()=>{
  const r=await fetch(base+'/hub/portal/negotiate?negotiateVersion=1',{method:'POST',headers:{Authorization:'Bearer '+admin}});assert.equal(r.status,200);const n=await r.json();
  const ws=new WebSocket(base.replace('http:','ws:')+'/hub/portal?id='+encodeURIComponent(n.connectionToken)+'&access_token='+admin);t.after(()=>ws.close());await once(ws,'open');const messages=[];ws.addEventListener('message',e=>messages.push(e.data));ws.send(JSON.stringify({protocol:'json',version:1})+'\x1e');
  for(let i=0;i<40&&!messages.some(m=>String(m).includes('{}'));i++)await new Promise(r=>setTimeout(r,50));assert.ok(messages.some(m=>String(m).includes('{}')));
  await send('notify',{sentAt:'2000-01-01T00:00:00Z'});for(let i=0;i<50&&!messages.some(m=>String(m).includes('changed'));i++)await new Promise(r=>setTimeout(r,50));assert.ok(messages.some(m=>String(m).includes('changed')));ws.close();
 });
 ingressMs.sort((a,b)=>a-b);
 await writeFile(path.join(root,'validation-metrics.json'),JSON.stringify({scope:'synthetic loopback SQLite and protocol only; no broker',databaseIntegrity:inspect('PRAGMA integrity_check')[0][0],receiptCount:inspect('SELECT count(*) FROM receipts')[0][0],commandCount:inspect('SELECT count(*) FROM commands')[0][0],ingress:{requests:ingressMs.length,concurrency:1,p95Ms:ingressMs[Math.floor(ingressMs.length*0.95)],maxMs:Math.max(...ingressMs)}}));
});
