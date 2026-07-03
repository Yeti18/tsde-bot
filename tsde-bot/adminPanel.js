const http = require('http');
const fs = require('fs');
const path = require('path');
const database = require('./db.js');
const config = require('./config.json');

const ADMIN_PORT = 4000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || config.adminPassword || 'tsde_admin_2026';
const SESSIONS = new Set();

function generarToken() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function autenticado(req) {
    const cookie = req.headers.cookie || '';
    const token = cookie.split(';').find(c => c.trim().startsWith('tsde_session='));
    if (!token) return false;
    return SESSIONS.has(token.split('=')[1]);
}

function responderJSON(res, code, data) {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
}

function leerBody(req) {
    return new Promise((resolve) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try { resolve(JSON.parse(body)); } catch { resolve({}); }
        });
    });
}

function ejecutarRcon(comando) {
    return new Promise((resolve, reject) => {
        const Rcon = require('rcon');
        const conn = new Rcon(config.rcon.ip, config.rcon.port, config.rcon.password);
        const timer = setTimeout(() => { conn.disconnect(); reject(new Error('Timeout')); }, 8000);
        conn.on('auth', () => conn.send(comando));
        conn.on('response', str => { clearTimeout(timer); conn.disconnect(); resolve(str); });
        conn.on('error', err => { clearTimeout(timer); reject(err); });
        conn.connect();
    });
}

const HTML_PANEL = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TSDE Admin Panel</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', sans-serif; background: #0a0a0a; color: #e0e0e0; }
  .nav { background: #111; border-bottom: 2px solid #4CAF50; padding: 12px 24px; display: flex; align-items: center; gap: 20px; }
  .nav h1 { color: #4CAF50; font-size: 18px; margin-right: auto; }
  .nav a { color: #aaa; text-decoration: none; padding: 6px 12px; border-radius: 4px; transition: all .2s; font-size: 14px; }
  .nav a:hover, .nav a.active { background: #4CAF50; color: #000; }
  .page { display: none; padding: 24px; max-width: 1400px; margin: 0 auto; }
  .page.active { display: block; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-bottom: 24px; }
  .card { background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 20px; }
  .card h3 { color: #4CAF50; font-size: 13px; text-transform: uppercase; margin-bottom: 8px; }
  .card .value { font-size: 32px; font-weight: bold; color: #fff; }
  .card .sub { font-size: 12px; color: #666; margin-top: 4px; }
  .section { background: #1a1a1a; border: 1px solid #333; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
  .section h2 { color: #4CAF50; margin-bottom: 16px; font-size: 16px; border-bottom: 1px solid #333; padding-bottom: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; padding: 8px 12px; color: #666; border-bottom: 1px solid #333; font-weight: normal; }
  td { padding: 8px 12px; border-bottom: 1px solid #1f1f1f; }
  tr:hover td { background: #222; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: bold; }
  .badge.green { background: #1a4a1a; color: #4CAF50; }
  .badge.red { background: #4a1a1a; color: #f44; }
  .badge.yellow { background: #4a3a1a; color: #F1C40F; }
  .badge.blue { background: #1a2a4a; color: #5bf; }
  .btn { padding: 6px 14px; border: none; border-radius: 4px; cursor: pointer; font-size: 13px; transition: all .2s; }
  .btn-green { background: #4CAF50; color: #000; }
  .btn-red { background: #c0392b; color: #fff; }
  .btn-yellow { background: #F39C12; color: #000; }
  .btn-gray { background: #333; color: #fff; }
  .btn:hover { opacity: 0.85; }
  input, select, textarea { background: #222; border: 1px solid #444; color: #fff; padding: 8px 12px; border-radius: 4px; font-size: 13px; width: 100%; }
  .search-bar { display: flex; gap: 8px; margin-bottom: 16px; }
  .search-bar input { flex: 1; }
  .log-box { background: #0d0d0d; border: 1px solid #333; border-radius: 4px; padding: 12px; font-family: monospace; font-size: 12px; height: 400px; overflow-y: auto; white-space: pre-wrap; color: #0f0; }
  .modal { display: none; position: fixed; inset: 0; background: rgba(0,0,0,.8); z-index: 100; justify-content: center; align-items: center; }
  .modal.open { display: flex; }
  .modal-box { background: #1a1a1a; border: 1px solid #4CAF50; border-radius: 8px; padding: 24px; width: 480px; max-width: 90vw; }
  .modal-box h3 { color: #4CAF50; margin-bottom: 16px; }
  .form-group { margin-bottom: 12px; }
  .form-group label { font-size: 12px; color: #888; display: block; margin-bottom: 4px; }
  .actions { display: flex; gap: 8px; flex-wrap: wrap; }
  .countdown { font-size: 12px; color: #F39C12; }
  #toast { position: fixed; bottom: 20px; right: 20px; background: #4CAF50; color: #000; padding: 12px 20px; border-radius: 6px; display: none; font-weight: bold; z-index: 999; }
</style>
</head>
<body>
<nav class="nav">
  <h1>🦖 TSDE Admin</h1>
  <a href="#" class="active" onclick="showPage('dashboard', this)">Dashboard</a>
  <a href="#" onclick="showPage('jugadores', this)">Jugadores</a>
  <a href="#" onclick="showPage('moderacion', this)">Moderación</a>
  <a href="#" onclick="showPage('banderas', this)">Banderas Blancas</a>
  <a href="#" onclick="showPage('tickets', this)">Tickets</a>
  <a href="#" onclick="showPage('incubadoras', this)">Incubadoras</a>
  <a href="#" onclick="showPage('mercado', this)">Mercado</a>
  <a href="#" onclick="showPage('rcon', this)">RCON</a>
  <a href="#" onclick="showPage('logs', this)">Logs</a>
  <a href="#" onclick="logout()" style="color:#f44">Salir</a>
</nav>

<!-- DASHBOARD -->
<div id="page-dashboard" class="page active">
  <div class="grid" id="stats-cards">
    <div class="card"><h3>🟢 En el servidor</h3><div class="value" id="stat-online">-</div><div class="sub">jugadores ahora</div></div>
    <div class="card"><h3>👥 Registrados</h3><div class="value" id="stat-registrados">-</div><div class="sub">jugadores totales</div></div>
    <div class="card"><h3>🏳️ Banderas activas</h3><div class="value" id="stat-banderas">-</div><div class="sub">protecciones vigentes</div></div>
    <div class="card"><h3>🎫 Tickets pendientes</h3><div class="value" id="stat-tickets">-</div><div class="sub">sin resolver</div></div>
    <div class="card"><h3>🛒 Mercaderes</h3><div class="value" id="stat-mercaderes">-</div><div class="sub">puestos activos</div></div>
    <div class="card"><h3>⚠️ Penalizados</h3><div class="value" id="stat-penalizados">-</div><div class="sub">actualmente</div></div>
  </div>
  <div class="section">
    <h2>🎮 Jugadores en el servidor ahora</h2>
    <div id="jugadores-online-list"><em style="color:#666">Cargando...</em></div>
  </div>
  <div class="section">
    <h2>🔧 Acciones rápidas</h2>
    <div class="actions">
      <button class="btn btn-green" onclick="backupManual()">💾 Backup ahora</button>
      <button class="btn btn-yellow" onclick="reiniciarBot()">🔄 Reiniciar bot</button>
      <button class="btn btn-gray" onclick="loadPage('logs')">📋 Ver logs</button>
    </div>
  </div>
</div>

<!-- JUGADORES -->
<div id="page-jugadores" class="page">
  <div class="section">
    <h2>👥 Jugadores registrados</h2>
    <div class="search-bar">
      <input id="buscar-jugador" placeholder="Buscar por nombre ARK o Discord..." oninput="filtrarJugadores()">
    </div>
    <table>
      <thead><tr><th>Nombre ARK</th><th>Discord</th><th>Registrado</th><th>Sanciones</th><th>Acciones</th></tr></thead>
      <tbody id="tabla-jugadores"></tbody>
    </table>
  </div>
</div>

<!-- MODERACIÓN -->
<div id="page-moderacion" class="page">
  <div class="section">
    <h2>⚠️ Sancionar jugador</h2>
    <div class="form-group"><label>Discord ID o nombre ARK</label><input id="sancion-jugador" placeholder="ID de Discord del jugador"></div>
    <div class="form-group"><label>Motivo</label><input id="sancion-motivo" placeholder="Motivo de la sanción"></div>
    <div class="actions">
      <button class="btn btn-yellow" onclick="sancionarJugador()">⚠️ Aplicar sanción</button>
      <button class="btn btn-green" onclick="perdonarJugador()">✅ Perdonar</button>
    </div>
  </div>
  <div class="section">
    <h2>📋 Jugadores penalizados</h2>
    <div id="lista-penalizados"></div>
  </div>
  <div class="section">
    <h2>📝 Reportes pendientes</h2>
    <div id="lista-reportes"></div>
  </div>
</div>

<!-- BANDERAS BLANCAS -->
<div id="page-banderas" class="page">
  <div class="section">
    <h2>🏳️ Protecciones activas</h2>
    <div id="lista-banderas"></div>
  </div>
</div>

<!-- TICKETS -->
<div id="page-tickets" class="page">
  <div class="section">
    <h2>🎫 Tickets recientes</h2>
    <div id="lista-tickets"></div>
  </div>
</div>

<!-- INCUBADORAS -->
<div id="page-incubadoras" class="page">
  <div class="section">
    <h2>🥚 Estado de incubadoras</h2>
    <div id="lista-incubadoras"></div>
  </div>
</div>

<!-- MERCADO -->
<div id="page-mercado" class="page">
  <div class="section">
    <h2>🛒 Mercaderes activos</h2>
    <div id="lista-mercaderes"></div>
  </div>
</div>

<!-- RCON -->
<div id="page-rcon" class="page">
  <div class="section">
    <h2>📡 Consola RCON</h2>
    <div class="form-group"><label>Comando</label>
      <div style="display:flex;gap:8px">
        <input id="rcon-cmd" placeholder="Ej: Broadcast Hola jugadores!" onkeydown="if(event.key==='Enter')enviarRcon()">
        <button class="btn btn-green" onclick="enviarRcon()">Enviar</button>
      </div>
    </div>
    <div class="form-group" style="margin-top:12px">
      <label>Comandos rápidos</label>
      <div class="actions" style="margin-top:8px">
        <button class="btn btn-gray" onclick="rconRapido('ListPlayers')">ListPlayers</button>
        <button class="btn btn-gray" onclick="rconRapido('GetOnlineNum')">GetOnlineNum</button>
        <button class="btn btn-gray" onclick="rconRapido('SaveWorld')">SaveWorld</button>
        <button class="btn btn-gray" onclick="rconRapido('DestroyWildDinos')">DestroyWildDinos</button>
      </div>
    </div>
    <div class="form-group" style="margin-top:12px">
      <label>Respuesta</label>
      <div class="log-box" id="rcon-output" style="height:200px">Esperando comando...</div>
    </div>
    <div class="form-group" style="margin-top:12px">
      <label>Broadcast rápido</label>
      <div style="display:flex;gap:8px">
        <input id="broadcast-msg" placeholder="Mensaje para todos los jugadores en el servidor...">
        <button class="btn btn-green" onclick="enviarBroadcast()">📢 Enviar</button>
      </div>
    </div>
  </div>
  <div class="section">
    <h2>📢 Mensajes broadcast guardados</h2>
    <div style="display:flex;gap:8px;margin-bottom:12px">
      <input id="bc-nombre" placeholder="Nombre (ej: Aviso evento laberinto)" style="flex:1">
      <textarea id="bc-texto" placeholder="Texto del mensaje broadcast..." style="flex:2;height:60px;resize:vertical"></textarea>
      <button class="btn btn-green" style="align-self:flex-end" onclick="guardarBroadcast()">💾 Guardar</button>
    </div>
    <div id="lista-broadcasts-guardados"></div>
  </div>
</div>

<!-- LOGS -->
<div id="page-logs" class="page">
  <div class="section">
    <h2>📋 Logs del bot <button class="btn btn-gray" style="float:right;font-size:11px" onclick="cargarLogs()">🔄 Actualizar</button></h2>
    <div class="log-box" id="log-content">Cargando...</div>
  </div>
</div>

<div id="toast"></div>

<script>
const API = '';
let jugadoresTodos = [];

function toast(msg, color='#4CAF50') {
  const t = document.getElementById('toast');
  t.textContent = msg; t.style.background = color; t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', 3000);
}

function showPage(name, el) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav a').forEach(a => a.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  if (el) el.classList.add('active');
  loadPage(name);
}

async function api(endpoint, method='GET', body=null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch('/api/' + endpoint, opts);
  return r.json();
}

async function loadPage(name) {
  if (name === 'dashboard') await cargarDashboard();
  if (name === 'jugadores') await cargarJugadores();
  if (name === 'moderacion') await cargarModeracion();
  if (name === 'banderas') await cargarBanderas();
  if (name === 'incubadoras') await cargarIncubadoras();
  if (name === 'mercado') await cargarMercado();
  if (name === 'rcon') await cargarBroadcastsGuardados();
  if (name === 'logs') await cargarLogs();
}

// DASHBOARD
async function cargarDashboard() {
  const data = await api('dashboard');
  document.getElementById('stat-online').textContent = data.online;
  document.getElementById('stat-registrados').textContent = data.registrados;
  document.getElementById('stat-banderas').textContent = data.banderas;
  document.getElementById('stat-tickets').textContent = data.tickets;
  document.getElementById('stat-mercaderes').textContent = data.mercaderes;
  document.getElementById('stat-penalizados').textContent = data.penalizados;

  const lista = document.getElementById('jugadores-online-list');
  if (data.jugadoresOnline.length === 0) {
    lista.innerHTML = '<em style="color:#666">Nadie conectado ahora mismo</em>';
  } else {
    lista.innerHTML = data.jugadoresOnline.map(j =>
      '<span style="display:inline-block;background:#1a2a1a;border:1px solid #4CAF50;padding:4px 12px;border-radius:20px;margin:4px;font-size:13px">🦖 ' + j + '</span>'
    ).join('');
  }
}

// JUGADORES
async function cargarJugadores() {
  const data = await api('jugadores');
  jugadoresTodos = data;
  renderJugadores(data);
}

function renderJugadores(lista) {
  const tbody = document.getElementById('tabla-jugadores');
  if (!lista.length) { tbody.innerHTML = '<tr><td colspan="5" style="color:#666;text-align:center">No hay jugadores</td></tr>'; return; }
  tbody.innerHTML = lista.map(j => {
    const dias = Math.floor((Date.now() - new Date(j.fecha_registro).getTime()) / 86400000);
    return \`<tr>
      <td><strong>\${j.nombre_ark}</strong></td>
      <td style="color:#888">\${j.discord_username}</td>
      <td style="color:#666">hace \${dias}d</td>
      <td>\${j.sanciones > 0 ? '<span class="badge red">⚠️ '+j.sanciones+'</span>' : '<span class="badge green">✅</span>'}</td>
      <td class="actions">
        <button class="btn btn-yellow" style="font-size:11px" onclick="verJugador('\${j.discord_id}')">Ver ficha</button>
        <button class="btn btn-red" style="font-size:11px" onclick="sancionarRapido('\${j.discord_id}','\${j.discord_username}')">Sancionar</button>
      </td>
    </tr>\`;
  }).join('');
}

function filtrarJugadores() {
  const q = document.getElementById('buscar-jugador').value.toLowerCase();
  renderJugadores(jugadoresTodos.filter(j =>
    j.nombre_ark.toLowerCase().includes(q) || j.discord_username.toLowerCase().includes(q)
  ));
}

async function verJugador(id) {
  const data = await api('jugador/' + id);
  const bb = data.bandera ? (data.bandera.estado === 'activo' ? '🟢 ACTIVA hasta ' + new Date(data.bandera.fecha_expiracion).toLocaleString('es-ES') : '⚪ ' + data.bandera.estado) : '✅ Sin solicitudes';
  alert(\`👤 \${data.nombre_ark}\\nDiscord: \${data.discord_username}\\nRegistrado: \${new Date(data.fecha_registro).toLocaleDateString('es-ES')}\\n\\nBandera Blanca: \${bb}\\nSanciones: \${data.nivel_sancion || 0}/4\\nAdvertencias: \${data.advertencias}\\nMercader: \${data.mercader ? 'Sí' : 'No'}\`);
}

// MODERACIÓN
async function cargarModeracion() {
  const data = await api('moderacion');

  const pen = document.getElementById('lista-penalizados');
  if (!data.penalizados.length) {
    pen.innerHTML = '<em style="color:#666">Ningún jugador penalizado</em>';
  } else {
    pen.innerHTML = '<table><thead><tr><th>Nombre ARK</th><th>Acciones</th></tr></thead><tbody>' +
      data.penalizados.map(p => \`<tr><td>\${p}</td><td><button class="btn btn-green" style="font-size:11px" onclick="perdonarNombre('\${p}')">✅ Quitar penalización</button></td></tr>\`).join('') +
      '</tbody></table>';
  }

  const rep = document.getElementById('lista-reportes');
  if (!data.reportes.length) {
    rep.innerHTML = '<em style="color:#666">No hay reportes pendientes</em>';
  } else {
    rep.innerHTML = '<table><thead><tr><th>Reportado</th><th>Por</th><th>Motivo</th><th>Fecha</th></tr></thead><tbody>' +
      data.reportes.map(r => \`<tr>
        <td><strong>\${r.jugador_reportado}</strong></td>
        <td style="color:#888">\${r.reportado_por}</td>
        <td style="color:#aaa">\${r.motivo}</td>
        <td style="color:#666">\${new Date(r.fecha).toLocaleDateString('es-ES')}</td>
      </tr>\`).join('') + '</tbody></table>';
  }
}

async function sancionarJugador() {
  const id = document.getElementById('sancion-jugador').value.trim();
  const motivo = document.getElementById('sancion-motivo').value.trim();
  if (!id || !motivo) return toast('Rellena todos los campos', '#f44');
  const r = await api('sancionar', 'POST', { discordId: id, motivo });
  toast(r.ok ? '✅ Sanción aplicada (nivel ' + r.nivel + ')' : '❌ ' + r.error, r.ok ? '#4CAF50' : '#f44');
  cargarModeracion();
}

async function perdonarJugador() {
  const id = document.getElementById('sancion-jugador').value.trim();
  if (!id) return toast('Introduce el Discord ID', '#f44');
  const r = await api('perdonar', 'POST', { discordId: id });
  toast(r.ok ? '✅ Perdonado' : '❌ ' + r.error, r.ok ? '#4CAF50' : '#f44');
  cargarModeracion();
}

async function perdonarNombre(nombre) {
  const r = await api('quitar-penalizacion', 'POST', { nombre });
  toast(r.ok ? '✅ Penalización quitada' : '❌ Error', r.ok ? '#4CAF50' : '#f44');
  cargarModeracion();
}

function sancionarRapido(id, username) {
  const motivo = prompt('Motivo de la sanción para ' + username + ':');
  if (!motivo) return;
  document.getElementById('sancion-jugador').value = id;
  document.getElementById('sancion-motivo').value = motivo;
  sancionarJugador();
}

// BANDERAS BLANCAS
async function cargarBanderas() {
  const data = await api('banderas');
  const lista = document.getElementById('lista-banderas');
  const activas = data.filter(b => b.estado === 'activo');
  const pendientes = data.filter(b => b.estado === 'pendiente');

  if (!activas.length && !pendientes.length) {
    lista.innerHTML = '<em style="color:#666">No hay banderas activas ni pendientes</em>';
    return;
  }

  lista.innerHTML = [...pendientes.map(b => \`
    <div style="background:#2a2a1a;border:1px solid #F39C12;border-radius:6px;padding:12px;margin-bottom:8px">
      <strong>⏳ PENDIENTE — \${b.nombre_ark}</strong>
      <span style="color:#888;font-size:12px;margin-left:8px">\${b.discord_username}</span>
      \${b.nombre_tribu ? '<span style="color:#666;font-size:12px"> · Tribu: '+b.nombre_tribu+'</span>' : ''}
      <div class="actions" style="margin-top:8px">
        <button class="btn btn-green" style="font-size:11px" onclick="accionBB('\${b.id}','activar')">✅ Activar</button>
        <button class="btn btn-red" style="font-size:11px" onclick="accionBB('\${b.id}','denegar_cueva')">❌ No cumple</button>
        <button class="btn btn-red" style="font-size:11px" onclick="accionBB('\${b.id}','denegar_repetida')">❌ Ya usó BB</button>
      </div>
    </div>
  \`), ...activas.map(b => {
    const expira = new Date(b.fecha_expiracion);
    const resta = Math.max(0, expira - Date.now());
    const horas = Math.floor(resta / 3600000);
    const mins = Math.floor((resta % 3600000) / 60000);
    return \`
      <div style="background:#1a2a1a;border:1px solid #4CAF50;border-radius:6px;padding:12px;margin-bottom:8px">
        <strong>🟢 \${b.nombre_ark}</strong>
        <span style="color:#888;font-size:12px;margin-left:8px">\${b.discord_username}</span>
        \${b.nombre_tribu ? '<span style="color:#666;font-size:12px"> · '+b.nombre_tribu+'</span>' : ''}
        <span class="countdown" style="margin-left:8px">⏱️ \${horas}h \${mins}m restantes</span>
        <div class="actions" style="margin-top:8px">
          <button class="btn btn-red" style="font-size:11px" onclick="accionBB('\${b.id}','quitar')">🗑️ Quitar protección</button>
        </div>
      </div>
    \`;
  })].join('');
}

async function accionBB(id, accion) {
  const r = await api('bandera/' + accion, 'POST', { id });
  toast(r.ok ? '✅ Hecho' : '❌ ' + r.error, r.ok ? '#4CAF50' : '#f44');
  cargarBanderas();
}

// INCUBADORAS
async function cargarIncubadoras() {
  const data = await api('incubadoras');
  document.getElementById('lista-incubadoras').innerHTML = data.map(inc => \`
    <div style="background:\${inc.estado==='libre'?'#1a2a1a':'#2a1a1a'};border:1px solid \${inc.estado==='libre'?'#4CAF50':'#f44'};border-radius:6px;padding:16px;margin-bottom:8px;display:flex;align-items:center;gap:16px">
      <div style="font-size:24px">\${inc.estado==='libre'?'✅':'🔒'}</div>
      <div style="flex:1">
        <strong>Incubadora \${inc.id}</strong>
        <span class="badge \${inc.estado==='libre'?'green':'red'}" style="margin-left:8px">\${inc.estado.toUpperCase()}</span>
        \${inc.estado==='ocupada' ? '<div style="color:#888;font-size:12px;margin-top:4px">Ocupada por: '+inc.ocupada_por+'</div>' : ''}
      </div>
      <div style="text-align:right">
        <div style="font-size:12px;color:#666">PIN actual</div>
        <div style="font-family:monospace;font-size:20px;color:#F1C40F">\${inc.pin}</div>
      </div>
      <div class="actions">
        \${inc.estado==='ocupada' ? '<button class="btn btn-green" style="font-size:11px" onclick="liberarIncubadora('+inc.id+')">Liberar</button>' : ''}
        <button class="btn btn-gray" style="font-size:11px" onclick="cambiarPin('+inc.id+')">Cambiar PIN</button>
      </div>
    </div>
  \`).join('');
}

async function liberarIncubadora(id) {
  const nuevoPin = Math.floor(1000 + Math.random() * 9000).toString();
  const r = await api('incubadora/liberar', 'POST', { id, nuevoPin });
  toast(r.ok ? '✅ Liberada. Nuevo PIN: ' + nuevoPin : '❌ Error', r.ok ? '#4CAF50' : '#f44');
  cargarIncubadoras();
}

async function cambiarPin(id) {
  const pin = prompt('Nuevo PIN para incubadora ' + id + ' (4 dígitos):');
  if (!pin || pin.length !== 4) return toast('PIN inválido', '#f44');
  const r = await api('incubadora/pin', 'POST', { id, pin });
  toast(r.ok ? '✅ PIN cambiado: ' + pin : '❌ Error', r.ok ? '#4CAF50' : '#f44');
  cargarIncubadoras();
}

// MERCADO
async function cargarMercado() {
  const data = await api('mercaderes');
  const lista = document.getElementById('lista-mercaderes');
  if (!data.length) { lista.innerHTML = '<em style="color:#666">No hay mercaderes activos</em>'; return; }
  lista.innerHTML = '<table><thead><tr><th>Discord</th><th>Puesto</th><th>Acciones</th></tr></thead><tbody>' +
    data.map(m => \`<tr>
      <td>\${m.discordUsername || m.discord_id}</td>
      <td><span class="badge blue">Puesto \${m.puesto || '?'}</span></td>
      <td><button class="btn btn-red" style="font-size:11px" onclick="quitarMercader('\${m.discord_id}')">Quitar puesto</button></td>
    </tr>\`).join('') + '</tbody></table>';
}

async function quitarMercader(id) {
  if (!confirm('¿Quitar el puesto de mercader a este jugador?')) return;
  const r = await api('mercader/quitar', 'POST', { discordId: id });
  toast(r.ok ? '✅ Puesto quitado' : '❌ Error', r.ok ? '#4CAF50' : '#f44');
  cargarMercado();
}

// RCON
async function enviarRcon() {
  const cmd = document.getElementById('rcon-cmd').value.trim();
  if (!cmd) return;
  document.getElementById('rcon-output').textContent = 'Enviando...';
  const r = await api('rcon', 'POST', { comando: cmd });
  document.getElementById('rcon-output').textContent = r.respuesta || r.error || 'Sin respuesta';
  document.getElementById('rcon-cmd').value = '';
}

async function rconRapido(cmd) {
  document.getElementById('rcon-cmd').value = cmd;
  await enviarRcon();
}

async function enviarBroadcast() {
  const msg = document.getElementById('broadcast-msg').value.trim();
  if (!msg) return;
  const r = await api('rcon', 'POST', { comando: 'Broadcast ' + msg });
  toast(r.error ? '❌ Error' : '✅ Mensaje enviado', r.error ? '#f44' : '#4CAF50');
  document.getElementById('broadcast-msg').value = '';
}

// LOGS
async function cargarLogs() {
  const r = await api('logs');
  const box = document.getElementById('log-content');
  box.textContent = r.logs || 'Sin logs';
  box.scrollTop = box.scrollHeight;
}

// ACCIONES GENERALES
async function backupManual() {
  const r = await api('backup', 'POST');
  toast(r.ok ? '✅ Backup creado' : '❌ Error', r.ok ? '#4CAF50' : '#f44');
}

async function reiniciarBot() {
  if (!confirm('¿Reiniciar el bot? Estará offline unos segundos.')) return;
  await api('reiniciar', 'POST');
  toast('🔄 Reiniciando...', '#F39C12');
}

// BROADCASTS GUARDADOS
async function cargarBroadcastsGuardados() {
  const data = await api('broadcasts-guardados');
  const lista = document.getElementById('lista-broadcasts-guardados');
  if (!data.length) { lista.innerHTML = '<em style="color:#666">No hay mensajes guardados aún. Crea el primero arriba.</em>'; return; }
  lista.innerHTML = data.map(b => \`
    <div style="background:#111;border:1px solid #333;border-radius:6px;padding:12px;margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <strong style="color:#4CAF50;flex:1">\${b.nombre}</strong>
        <button class="btn btn-green" style="font-size:11px" onclick="enviarBroadcastGuardado('\${b.id}')">📢 Broadcast</button>
        <button class="btn btn-red" style="font-size:11px" onclick="borrarBroadcast('\${b.id}')">🗑️</button>
      </div>
      <div style="font-size:13px;color:#aaa;white-space:pre-wrap">\${b.texto}</div>
    </div>
  \`).join('');
}

async function guardarBroadcast() {
  const nombre = document.getElementById('bc-nombre').value.trim();
  const texto = document.getElementById('bc-texto').value.trim();
  if (!nombre || !texto) return toast('Rellena nombre y mensaje', '#f44');
  const r = await api('broadcasts-guardados', 'POST', { nombre, texto });
  toast(r.ok ? '✅ Guardado' : '❌ Error', r.ok ? '#4CAF50' : '#f44');
  document.getElementById('bc-nombre').value = '';
  document.getElementById('bc-texto').value = '';
  cargarBroadcastsGuardados();
}

async function enviarBroadcastGuardado(id) {
  const data = await api('broadcasts-guardados');
  const bc = data.find(b => b.id === id);
  if (!bc) return toast('No encontrado', '#f44');
  const r = await api('rcon', 'POST', { comando: 'Broadcast ' + bc.texto });
  toast(r.error ? '❌ Error RCON' : '✅ Mensaje enviado al servidor', r.error ? '#f44' : '#4CAF50');
  if (!r.error) document.getElementById('rcon-output').textContent = 'Broadcast enviado: ' + bc.texto;
}

async function borrarBroadcast(id) {
  if (!confirm('¿Borrar este mensaje?')) return;
  const r = await api('broadcasts-guardados/' + id, 'DELETE');
  toast(r.ok ? '🗑️ Eliminado' : '❌ Error', r.ok ? '#4CAF50' : '#f44');
  cargarBroadcastsGuardados();
}

async function logout() {
  await api('logout', 'POST');
  location.reload();
}

// Auto-refresh dashboard cada 30s
setInterval(() => {
  if (document.getElementById('page-dashboard').classList.contains('active')) cargarDashboard();
}, 30000);

// Cargar dashboard al inicio
cargarDashboard();
</script>
</body>
</html>`;

const HTML_LOGIN = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<title>TSDE Admin — Login</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0a0a0a; color: #e0e0e0; font-family: 'Segoe UI', sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
  .box { background: #1a1a1a; border: 1px solid #4CAF50; border-radius: 12px; padding: 40px; width: 360px; text-align: center; }
  h1 { color: #4CAF50; font-size: 24px; margin-bottom: 8px; }
  p { color: #666; font-size: 13px; margin-bottom: 24px; }
  input { width: 100%; background: #222; border: 1px solid #444; color: #fff; padding: 12px; border-radius: 6px; font-size: 14px; margin-bottom: 12px; }
  button { width: 100%; background: #4CAF50; color: #000; border: none; padding: 12px; border-radius: 6px; font-size: 15px; font-weight: bold; cursor: pointer; }
  button:hover { background: #45a049; }
  .error { color: #f44; font-size: 13px; margin-top: 8px; display: none; }
</style>
</head>
<body>
<div class="box">
  <h1>🦖 TSDE Admin</h1>
  <p>Panel de administración del servidor</p>
  <input type="password" id="pass" placeholder="Contraseña" onkeydown="if(event.key==='Enter')login()">
  <button onclick="login()">Entrar</button>
  <div class="error" id="err">Contraseña incorrecta</div>
</div>
<script>
async function login() {
  const pass = document.getElementById('pass').value;
  const r = await fetch('/api/login', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ password: pass }) });
  const data = await r.json();
  if (data.ok) location.reload();
  else { document.getElementById('err').style.display = 'block'; }
}
</script>
</body>
</html>`;

function iniciarAdminPanel(client) {
    // En Windows, PM2 no libera el puerto al reiniciar — lo matamos a la fuerza
    const { execSync } = require('child_process');
    try {
        const result = execSync(`netstat -ano | findstr :${ADMIN_PORT}`).toString();
        const match = result.match(/LISTENING\s+(\d+)/);
        if (match) {
            const pid = match[1];
            if (parseInt(pid) !== process.pid) {
                execSync(`taskkill /F /PID ${pid}`);
                console.log(`[ADM] Puerto ${ADMIN_PORT} liberado (PID ${pid})`);
            }
        }
    } catch (e) {
        // Puerto ya libre
    }

    const server = http.createServer(async (req, res) => {
        const url = req.url;

        // Login page
        if (!autenticado(req) && !url.startsWith('/api/login')) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            return res.end(HTML_LOGIN);
        }

        // API routes
        if (url.startsWith('/api/')) {
            const endpoint = url.slice(5);
            res.setHeader('Content-Type', 'application/json');

            // Login
            if (endpoint === 'login' && req.method === 'POST') {
                const body = await leerBody(req);
                if (body.password === ADMIN_PASSWORD) {
                    const token = generarToken();
                    SESSIONS.add(token);
                    res.writeHead(200, { 'Set-Cookie': `tsde_session=${token}; HttpOnly; Path=/` });
                    return res.end(JSON.stringify({ ok: true }));
                }
                return responderJSON(res, 401, { ok: false });
            }

            // Logout
            if (endpoint === 'logout') {
                const cookie = req.headers.cookie || '';
                const token = cookie.split(';').find(c => c.trim().startsWith('tsde_session='));
                if (token) SESSIONS.delete(token.split('=')[1]);
                res.writeHead(200, { 'Set-Cookie': 'tsde_session=; Max-Age=0; Path=/' });
                return res.end(JSON.stringify({ ok: true }));
            }

            // Dashboard
            if (endpoint === 'dashboard') {
                const jugadoresOnline = database.getJugadoresOnline();
                return responderJSON(res, 200, {
                    online: jugadoresOnline.length,
                    registrados: database.countJugadores(),
                    banderas: database.getAllBanderas().filter(b => b.estado === 'activo').length,
                    tickets: database.countReportesPendientes(),
                    mercaderes: database.countMercaderes(),
                    penalizados: database.getPenalizados().length,
                    jugadoresOnline
                });
            }

            // Jugadores
            if (endpoint === 'jugadores') {
                const jugadores = database.getAllJugadores();
                const result = jugadores.map(j => {
                    const sancion = database.getSancion(j.discord_id);
                    return {
                        discord_id: j.discord_id,
                        discord_username: j.discord_username,
                        nombre_ark: j.nombre_ark,
                        fecha_registro: j.fecha_registro,
                        sanciones: sancion?.nivelActual || 0
                    };
                });
                return responderJSON(res, 200, result);
            }

            // Jugador individual
            if (endpoint.startsWith('jugador/')) {
                const id = endpoint.slice(8);
                const j = database.getJugador(id);
                if (!j) return responderJSON(res, 404, { error: 'No encontrado' });
                const banderas = database.getBanderasPorUsuario(id);
                const bandera = banderas.find(b => b.estado === 'activo') || null;
                const advertencias = database.getAdvertencias(id);
                const sancion = database.getSancion(id);
                const mercader = database.getMercader(id);
                return responderJSON(res, 200, {
                    ...j,
                    bandera,
                    advertencias: advertencias.length,
                    nivel_sancion: sancion?.nivelActual || 0,
                    mercader: !!mercader
                });
            }

            // Moderación
            if (endpoint === 'moderacion') {
                return responderJSON(res, 200, {
                    penalizados: database.getPenalizados(),
                    reportes: [] // Los reportes se guardan en SQLite pero no tenemos getReportes aún
                });
            }

            // Sancionar
            if (endpoint === 'sancionar' && req.method === 'POST') {
                const body = await leerBody(req);
                let sancion = database.getSancion(body.discordId);
                if (!sancion) {
                    const j = database.getJugador(body.discordId);
                    sancion = { discordId: body.discordId, discordUsername: j?.discord_username || body.discordId, nivelActual: 0, historial: [] };
                }
                sancion.nivelActual = Math.min(sancion.nivelActual + 1, 4);
                sancion.historial.push({ nivel: sancion.nivelActual, motivo: body.motivo, adminId: 'panel', adminUsername: 'Admin Panel', fecha: new Date().toISOString() });
                if (sancion.nivelActual >= 3) {
                    const j = database.getJugador(body.discordId);
                    if (j) database.addPenalizado(j.nombre_ark);
                }
                database.setSancion(sancion);
                database.addAdvertencia({ jugadorId: body.discordId, jugadorUsername: sancion.discordUsername, motivo: body.motivo, adminId: 'panel', adminUsername: 'Admin Panel', nivel: sancion.nivelActual, fecha: new Date().toISOString() });
                return responderJSON(res, 200, { ok: true, nivel: sancion.nivelActual });
            }

            // Perdonar
            if (endpoint === 'perdonar' && req.method === 'POST') {
                const body = await leerBody(req);
                const sancion = database.getSancion(body.discordId);
                if (!sancion) return responderJSON(res, 404, { error: 'Sin sanciones' });
                sancion.nivelActual = 0;
                sancion.historial.push({ nivel: 0, motivo: 'Perdonado desde panel admin', adminId: 'panel', adminUsername: 'Admin Panel', fecha: new Date().toISOString() });
                const j = database.getJugador(body.discordId);
                if (j) database.removePenalizado(j.nombre_ark);
                database.setSancion(sancion);
                return responderJSON(res, 200, { ok: true });
            }

            // Quitar penalización por nombre
            if (endpoint === 'quitar-penalizacion' && req.method === 'POST') {
                const body = await leerBody(req);
                database.removePenalizado(body.nombre);
                return responderJSON(res, 200, { ok: true });
            }

            // Banderas Blancas
            if (endpoint === 'banderas') {
                return responderJSON(res, 200, database.getAllBanderas());
            }

            if (endpoint.startsWith('bandera/') && req.method === 'POST') {
                const accion = endpoint.slice(8);
                const body = await leerBody(req);
                const id = body.id;
                if (accion === 'activar') {
                    const expira = new Date(Date.now() + 72 * 3600000).toISOString();
                    database.updateBanderaEstado(id, 'activo', { fechaActivacion: new Date().toISOString(), fechaExpiracion: expira });
                } else if (accion === 'denegar_cueva' || accion === 'denegar_repetida') {
                    database.updateBanderaEstado(id, 'denegado', { motivoDenegacion: accion === 'denegar_cueva' ? 'no_cumple' : 'repetida' });
                } else if (accion === 'quitar') {
                    database.updateBanderaEstado(id, 'expirado');
                }
                return responderJSON(res, 200, { ok: true });
            }

            // Incubadoras
            if (endpoint === 'incubadoras') {
                return responderJSON(res, 200, database.getIncubadoras());
            }

            if (endpoint === 'incubadora/liberar' && req.method === 'POST') {
                const body = await leerBody(req);
                database.updateIncubadora(body.id, 'libre', body.nuevoPin, null);
                return responderJSON(res, 200, { ok: true });
            }

            if (endpoint === 'incubadora/pin' && req.method === 'POST') {
                const body = await leerBody(req);
                database.updateIncubadora(body.id, 'libre', body.pin, null);
                return responderJSON(res, 200, { ok: true });
            }

            // Mercaderes
            if (endpoint === 'mercaderes') {
                return responderJSON(res, 200, database.getAllMercaderes());
            }

            if (endpoint === 'mercader/quitar' && req.method === 'POST') {
                const body = await leerBody(req);
                database.removeMercader(body.discordId);
                return responderJSON(res, 200, { ok: true });
            }

            // RCON
            if (endpoint === 'rcon' && req.method === 'POST') {
                const body = await leerBody(req);
                try {
                    const respuesta = await ejecutarRcon(body.comando);
                    return responderJSON(res, 200, { respuesta });
                } catch (e) {
                    return responderJSON(res, 500, { error: e.message });
                }
            }

            // Logs
            if (endpoint === 'logs') {
                try {
                    const logPath = 'C:\\Users\\Administrator\\.pm2\\logs\\tsde-bot-out.log';
                    const errPath = 'C:\\Users\\Administrator\\.pm2\\logs\\tsde-bot-error.log';
                    let content = '';
                    if (fs.existsSync(logPath)) {
                        content += fs.readFileSync(logPath, 'utf8').split('\n').slice(-80).join('\n');
                    }
                    if (fs.existsSync(errPath)) {
                        const errContent = fs.readFileSync(errPath, 'utf8').split('\n').slice(-20).join('\n');
                        if (errContent.trim()) content += '\n\n--- ERRORES ---\n' + errContent;
                    }
                    return responderJSON(res, 200, { logs: content || 'Sin logs' });
                } catch (e) {
                    return responderJSON(res, 200, { logs: 'Error leyendo logs: ' + e.message });
                }
            }

            // Backup
            if (endpoint === 'backup' && req.method === 'POST') {
                const { hacerBackup } = require('./modules/backupEngine.js');
                const archivo = hacerBackup();
                return responderJSON(res, 200, { ok: !!archivo, archivo });
            }

            // Broadcasts guardados
            if (endpoint === 'broadcasts-guardados' && req.method === 'GET') {
                try {
                    const data = JSON.parse(fs.readFileSync('./broadcasts_guardados.json', 'utf8'));
                    return responderJSON(res, 200, data);
                } catch (e) {
                    return responderJSON(res, 200, []);
                }
            }

            if (endpoint === 'broadcasts-guardados' && req.method === 'POST') {
                const body = await leerBody(req);
                let data = [];
                try { data = JSON.parse(fs.readFileSync('./broadcasts_guardados.json', 'utf8')); } catch (e) {}
                data.push({ id: Date.now().toString(), nombre: body.nombre, texto: body.texto });
                fs.writeFileSync('./broadcasts_guardados.json', JSON.stringify(data, null, 2));
                return responderJSON(res, 200, { ok: true });
            }

            if (endpoint.startsWith('broadcasts-guardados/') && req.method === 'DELETE') {
                const id = endpoint.slice(21);
                let data = [];
                try { data = JSON.parse(fs.readFileSync('./broadcasts_guardados.json', 'utf8')); } catch (e) {}
                data = data.filter(b => b.id !== id);
                fs.writeFileSync('./broadcasts_guardados.json', JSON.stringify(data, null, 2));
                return responderJSON(res, 200, { ok: true });
            }

            // Reiniciar
            if (endpoint === 'reiniciar' && req.method === 'POST') {
                setTimeout(() => process.exit(0), 1000); // PM2 lo reinicia automáticamente
                return responderJSON(res, 200, { ok: true });
            }

            return responderJSON(res, 404, { error: 'Endpoint no encontrado' });
        }

        // Panel HTML
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(HTML_PANEL);
    });

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.warn(`[ADM] Puerto ${ADMIN_PORT} en uso, reintentando en 3s...`);
            setTimeout(() => {
                server.close();
                server.listen(ADMIN_PORT, () => {
                    console.log(`[ADM] Panel de admin activo en puerto ${ADMIN_PORT}`);
                });
            }, 3000);
        } else {
            console.error('[ADM] Error servidor admin:', err.message);
        }
    });

    // Cerrar limpiamente al salir para liberar el puerto
    process.on('SIGINT', () => { server.close(); process.exit(0); });
    process.on('SIGTERM', () => { server.close(); process.exit(0); });
    process.on('exit', () => { server.close(); });

    server.listen(ADMIN_PORT, () => {
        console.log(`[ADM] Panel de admin activo en puerto ${ADMIN_PORT}`);
    });
}

module.exports = { iniciarAdminPanel };
