const $ = id => document.getElementById(id);
let adminKey = '', current, connection, noticeTimer;
function notify(text) { $('message').textContent = text; $('message').style.display = 'block'; clearTimeout(noticeTimer); noticeTimer = setTimeout(() => $('message').style.display = 'none', 7000); }
async function api(path, options = {}, key = adminKey) {
  const response = await fetch(path, { ...options, headers: { 'X-Bridge-Key': key, 'Content-Type': 'application/json', ...options.headers } });
  if (!response.ok) throw new Error(`${response.status}: ${(await response.text()).slice(0,400)}`);
  return response.status === 204 ? null : response.json().catch(() => null);
}
function cell(row, text, className) { const td = row.insertCell(); td.textContent = text; if (className) td.className = className; return td; }
async function refresh() {
  current = await api('/api/admin/state');
  const c = current.connection;
  $('terminal-status').textContent = current.online ? 'Connected' : 'Offline';
  $('account-label').textContent = c.account ? `${c.account} / ${c.broker}` : 'Awaiting MT5';
  $('balance').textContent = c.account ? c.balance.toLocaleString() : '—';
  $('equity').textContent = c.account ? c.equity.toLocaleString() : '—';
  $('positions').textContent = c.account ? c.positions : '—';
  $('terminal-key').value = c.terminalKey; $('base-url').textContent = location.origin;
  const pending = current.signals.some(s => ['queued','dispatched','unknown'].includes(s.status));
  $('send').disabled = !current.online || pending;
  $('send-note').textContent = !current.online ? 'Connect the EA first.' : pending ? 'Waiting for a result. Inspect MT5 if the outcome is unknown.' : 'This sends an actual instruction to your demo account.';
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
  $('webhook-example').textContent = `POST ${location.origin}/api/webhook/${c.id}\nX-Bridge-Key: ${c.webhookKey}\nContent-Type: application/json\n\n${JSON.stringify({id:'alert-unique-001',action:'buy',symbol:'EURUSD',lots:0.01,slPoints:200,tpPoints:400},null,2)}`;
}
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
