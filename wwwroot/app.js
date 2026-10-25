const $ = id => document.getElementById(id);
let adminKey = '', current, connection, noticeTimer, policyDirty = false, refreshGeneration = 0;
function notify(text) { $('message').textContent = text; $('message').style.display = 'block'; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => $('message').style.display = 'none', 7000); }
async function api(path, options = {}, key = adminKey) {
  const response = await fetch(path, { ...options, headers: { 'X-Bridge-Key': key, 'Content-Type': 'application/json', ...options.headers } });
  if (!response.ok) throw new Error(`${response.status}: ${(await response.text()).slice(0,400)}`);
  return response.status === 204 ? null : response.json().catch(() => null);
}
function cell(row, text, className) { const td = row.insertCell(); td.textContent = text; if (className) td.className = className; return td; }
function executionState() {
  if (!current) return;
  const p = current.policy, q = current.queue;
  $('queue-status').textContent = `${q.queued} / ${q.capacity} queued`;
  $('execution-note').textContent = q.blocked ? 'Execution blocked: inspect the unknown result in MT5 before acknowledging it.' : p.paused ? 'Execution paused. Incoming authenticated alerts are still recorded.' : !current.online ? 'MT5 is offline. Received commands expire at their original deadline.' : 'Execution enabled under your saved symbol and lot limits.';
  const allowed = p.allowedSymbols.includes($('symbol').value.trim()) && Number($('lots').value) <= p.maxLots;
  $('send').disabled = !current.online || p.paused || q.blocked || q.queued >= q.capacity || !allowed;
  $('send-note').textContent = !allowed ? 'Use an allowed symbol and a lot size within the saved policy.' : p.paused ? 'Enable execution in the policy before sending manually.' : q.blocked ? 'Reconcile the unknown result first.' : !current.online ? 'Connect the EA first.' : 'This queues an actual instruction for your demo account.';
}
async function refresh() {
  const generation = ++refreshGeneration;
  const [state, history] = await Promise.all([api('/api/admin/state'), api('/api/admin/receipts')]);
  if (generation !== refreshGeneration) return;
  current = state;
  const c = current.connection;
  $('terminal-status').textContent = current.online ? 'Connected' : 'Offline';
  $('account-label').textContent = c.account ? `${c.account} / ${c.broker}` : 'Awaiting MT5';
  $('balance').textContent = c.account ? c.balance.toLocaleString() : '—';
  $('equity').textContent = c.account ? c.equity.toLocaleString() : '—';
  $('positions').textContent = c.account ? c.positions : '—';
  $('terminal-key').value = c.terminalKey; $('base-url').textContent = location.origin;
  if (!policyDirty) {
    $('allowed-symbols').value = current.policy.allowedSymbols.join(', ');
    $('max-lots').value = current.policy.maxLots;
    $('max-age').value = current.policy.maxAgeSeconds;
    $('execution-paused').checked = current.policy.paused;
  }
  executionState();
  $('signals').replaceChildren();
  for (const s of current.signals) {
    const row = $('signals').insertRow();
    cell(row, new Date(s.createdAt).toLocaleTimeString()); cell(row, s.id.slice(0,12));
    cell(row, `${s.action.toUpperCase()} ${s.symbol}${s.action === 'close' ? '' : ` · ${s.lots} lot`}`);
    cell(row, s.status, `status ${s.status}`);
    const detail = cell(row, [s.ticket, s.detail].filter(Boolean).join(' / ') || 'Awaiting terminal');
    if (s.status === 'unknown') {
      const button = document.createElement('button'); button.className = 'subtle'; button.textContent = 'Acknowledge after checking MT5';
      button.onclick = async () => { if (!confirm('Have you checked actual MT5 positions and history? This clears the block without sending or reversing a trade.')) return;
        try { await api(`/api/admin/resolve/${encodeURIComponent(s.id)}`, { method: 'POST' }); await refresh(); } catch (e) { notify(e.message); } };
      detail.append(document.createElement('br'), button);
    }
  }
  $('empty').hidden = current.signals.length > 0;
  $('webhook-example').textContent = `Webhook URL: ${location.origin}/api/webhook/${c.id}\n\nMessage:\n${JSON.stringify({secret:c.webhookKey,id:'strategy1-{{time}}-{{interval}}-buy',sentAt:'{{timenow}}',action:'buy',symbol:current.policy.allowedSymbols[0] || 'EXACT_MT5_SYMBOL',lots:Math.min(0.01,current.policy.maxLots),slPoints:200,tpPoints:400},null,2)}`;
  $('receipts').replaceChildren();
  for (const r of history.receipts) { const row = $('receipts').insertRow(); cell(row,new Date(r.receivedAt).toLocaleString()); cell(row,r.eventId || '—'); cell(row,r.disposition); cell(row,r.detail); }
  $('events').replaceChildren();
  for (const e of history.events) { const row = $('events').insertRow(); cell(row,new Date(e.createdAt).toLocaleString()); cell(row,e.kind); cell(row,e.detail); }
}
$('policy-form').oninput = () => { policyDirty = true; };
$('signal-form').oninput = executionState;
$('policy-form').onsubmit = async event => {
  event.preventDefault();
  const policy = {paused:$('execution-paused').checked,allowedSymbols:$('allowed-symbols').value.split(',').map(s=>s.trim()).filter(Boolean),maxLots:Number($('max-lots').value),maxAgeSeconds:Number($('max-age').value)};
  if (!policy.paused && !confirm('Enable execution? Unexpired queued commands may execute immediately. Check MT5 and your limits first.')) return;
  try { await api('/api/admin/policy',{method:'POST',body:JSON.stringify(policy)}); policyDirty=false; await refresh(); notify('Execution policy saved.'); } catch(e) { notify(e.message); }
};
$('backup').onclick = async () => {
  $('backup').disabled = true;
  try { const result=await api('/api/admin/backup',{method:'POST',body:'{}'}); notify(`Database backup created on server: ${result.file}\nIntegrity check: ${result.integrity}`); } catch(e) { notify(e.message); }
  finally { $('backup').disabled=false; }
};
$('login-form').onsubmit = async event => {
  event.preventDefault(); adminKey = $('admin-key').value.trim();
  try {
    await refresh();
    if (!window.signalR) throw new Error('SignalR client missing. Run scripts/prepare-client.ps1 and reload.');
    $('login').hidden = true; $('workspace').hidden = false; $('admin-key').value = '';
    connection = new signalR.HubConnectionBuilder().withUrl('/hub/portal', {accessTokenFactory: () => adminKey}).withAutomaticReconnect().build();
    connection.on('changed', () => refresh().catch(e => notify(e.message)));
    connection.onreconnecting(() => { $('live').textContent = 'Reconnecting'; $('live').classList.remove('online'); });
    connection.onreconnected(() => { $('live').textContent = 'Live portal'; $('live').classList.add('online'); refresh().catch(e => notify(e.message)); });
    connection.onclose(() => { $('live').textContent = 'Refresh to reconnect'; $('live').classList.remove('online'); });
    await connection.start(); $('live').textContent = 'Live portal'; $('live').classList.add('online');
    setInterval(() => refresh().catch(() => { $('live').textContent = 'Server unavailable'; $('send').disabled = true; }), 5000);
  } catch(e) { notify(e.message); }
};
$('show-key').onclick = () => $('terminal-key').type = $('terminal-key').type === 'password' ? 'text' : 'password';
$('signal-form').onsubmit = async event => {
  event.preventDefault(); $('send').disabled = true;
  const request = { id: crypto.randomUUID(), action: $('action').value, symbol: $('symbol').value.trim(), lots: Number($('lots').value), slPoints: Number($('sl').value), tpPoints: Number($('tp').value) };
  try { await api(`/api/webhook/${current.connection.id}`, {method:'POST', body:JSON.stringify(request)}, current.connection.webhookKey); notify('Instruction accepted. Waiting for the terminal result.'); }
  catch(e) { notify(e.message); }
  finally { await refresh().catch(e => notify(e.message)); }
};
