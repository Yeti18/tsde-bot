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
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js"></script>
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
  <a href="#" onclick="showPage('laberinto', this)">🌀 Laberinto</a>
  <a href="#" onclick="showPage('mercado', this)">Mercado</a>
  <a href="#" onclick="showPage('halloffame', this)">🏆 Hall of Fame</a>
  <a href="#" onclick="showPage('coliseo', this)">⚔️ Coliseo</a>
  <a href="#" onclick="showPage('votaciones', this)">🗳️ Votaciones</a>
  <a href="#" onclick="showPage('estadisticas', this)">📊 Stats</a>
  <a href="#" onclick="showPage('rcon', this)">RCON</a>
  <a href="#" onclick="showPage('logs', this)">Logs</a>
  <div style="position:relative;margin-left:8px">
    <input id="buscador-global" placeholder="🔍 Buscar..." 
      style="background:#222;border:1px solid #444;color:#fff;padding:6px 12px;border-radius:4px;font-size:13px;width:180px"
      oninput="buscarGlobal(this.value)" onfocus="mostrarResultados()" onblur="setTimeout(ocultarResultados,200)">
    <div id="resultados-busqueda" style="display:none;position:absolute;right:0;top:36px;background:#1a1a1a;border:1px solid #444;border-radius:6px;width:320px;max-height:400px;overflow-y:auto;z-index:999;box-shadow:0 4px 20px rgba(0,0,0,.5)"></div>
  </div>
  <a href="#" onclick="logout()" style="color:#f44">Salir</a>
</nav>

<!-- DASHBOARD -->
<div id="page-dashboard" class="page active">
  <!-- ALERTAS -->
  <div id="alertas-container" style="margin-bottom:16px"></div>

  <div class="grid" id="stats-cards">
    <div class="card"><h3>🟢 En el servidor</h3><div class="value" id="stat-online">-</div><div class="sub">jugadores ahora</div></div>
    <div class="card"><h3>👥 Registrados</h3><div class="value" id="stat-registrados">-</div><div class="sub">jugadores totales</div></div>
    <div class="card"><h3>🏳️ Banderas activas</h3><div class="value" id="stat-banderas">-</div><div class="sub">protecciones vigentes</div></div>
    <div class="card"><h3>🎫 Tickets pendientes</h3><div class="value" id="stat-tickets">-</div><div class="sub">sin resolver</div></div>
    <div class="card"><h3>🛒 Mercaderes</h3><div class="value" id="stat-mercaderes">-</div><div class="sub">puestos activos</div></div>
    <div class="card"><h3>⚠️ Penalizados</h3><div class="value" id="stat-penalizados">-</div><div class="sub">actualmente</div></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
    <div class="section">
      <h2>🎮 Jugadores en el servidor ahora</h2>
      <div id="jugadores-online-list"><em style="color:#666">Cargando...</em></div>
    </div>
    <div class="section">
      <h2>📝 Notas del equipo admin</h2>
      <textarea id="notas-admin" style="width:100%;height:120px;resize:vertical;background:#111;border:1px solid #333;color:#fff;padding:8px;border-radius:4px;font-size:13px" placeholder="Escribe notas para el equipo admin..."></textarea>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px">
        <span id="notas-estado" style="font-size:12px;color:#666"></span>
        <button class="btn btn-green" style="font-size:12px" onclick="guardarNotas()">💾 Guardar</button>
      </div>
      <div id="notas-historial" style="margin-top:12px;max-height:150px;overflow-y:auto"></div>
    </div>
  </div>
  <div class="section">
    <h2>🔧 Acciones rápidas</h2>
    <div class="actions">
      <button class="btn btn-green" onclick="backupManual()">💾 Backup ahora</button>
      <button class="btn btn-yellow" onclick="reiniciarBot()">🔄 Reiniciar bot</button>
      <button class="btn btn-gray" onclick="showPage('logs', null)">📋 Ver logs</button>
      <button class="btn btn-gray" onclick="showPage('banderas', null)">🏳️ Banderas</button>
      <button class="btn btn-gray" onclick="showPage('tickets', null)">🎫 Tickets</button>
    </div>
  </div>
  <div class="section">
    <h2>⏱️ Temporizador de evento</h2>
    <div style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px">
      <div class="form-group" style="margin:0;flex:1;min-width:200px">
        <label>Nombre del evento</label>
        <input id="timer-nombre" placeholder="Ej: Torneo Coliseo">
      </div>
      <div class="form-group" style="margin:0">
        <label>Fecha y hora</label>
        <input id="timer-fecha" type="datetime-local">
      </div>
      <button class="btn btn-green" onclick="iniciarTimer()">⏱️ Activar</button>
      <button class="btn btn-red" onclick="pararTimer()">✕ Cancelar</button>
    </div>
    <div id="timer-display" style="display:none;background:#111;border:1px solid #4CAF50;border-radius:8px;padding:16px;text-align:center">
      <div id="timer-evento-nombre" style="color:#888;font-size:13px;margin-bottom:4px"></div>
      <div id="timer-countdown" style="font-family:monospace;font-size:48px;color:#4CAF50"></div>
      <div id="timer-fecha-texto" style="color:#666;font-size:12px;margin-top:4px"></div>
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
  <div class="grid">
    <div class="card"><h3>🎫 Abiertos</h3><div class="value" id="tkt-abiertos">-</div></div>
    <div class="card"><h3>✅ Cerrados</h3><div class="value" id="tkt-cerrados">-</div></div>
    <div class="card"><h3>⚠️ Reportes pendientes</h3><div class="value" id="tkt-reportes">-</div></div>
  </div>
  <div class="section">
    <h2>🎫 Tickets activos</h2>
    <div id="lista-tickets"><em style="color:#666">Cargando...</em></div>
  </div>
  <div class="section">
    <h2>⚠️ Reportes pendientes</h2>
    <div id="lista-reportes-tickets"><em style="color:#666">Cargando...</em></div>
  </div>
</div>

<!-- INCUBADORAS -->
<div id="page-incubadoras" class="page">
  <div class="section">
    <h2>🥚 Estado de incubadoras</h2>
    <div id="lista-incubadoras"></div>
  </div>
</div>

<!-- LABERINTO -->
<div id="page-laberinto" class="page">

  <!-- CONFIGURACIÓN DEL EVENTO -->
  <div class="section">
    <h2>🌀 Configurar evento</h2>
    <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:flex-end">
      <div class="form-group" style="flex:1;min-width:200px;margin:0">
        <label>Modo de juego</label>
        <select id="lab-modo" onchange="cambiarModo()">
          <option value="speed">⚡ Speed — Contrarreloj individual</option>
          <option value="tribu">🛡️ Tribu — Tiempo medio del equipo</option>
          <option value="survival">💀 Survival — Último en pie</option>
        </select>
      </div>
      <div class="form-group" style="flex:1;min-width:200px;margin:0">
        <label>Premio 1er puesto (GC)</label>
        <input id="lab-premio1" type="number" value="1000">
      </div>
      <div class="form-group" style="flex:1;min-width:200px;margin:0">
        <label>Premio 2do puesto (GC)</label>
        <input id="lab-premio2" type="number" value="600">
      </div>
      <div class="form-group" style="flex:1;min-width:200px;margin:0">
        <label>Premio 3er puesto (GC)</label>
        <input id="lab-premio3" type="number" value="400">
      </div>
      <div class="form-group" style="flex:1;min-width:200px;margin:0">
        <label>Premio participación (GC)</label>
        <input id="lab-premiopart" type="number" value="200">
      </div>
    </div>
    <div style="margin-top:12px">
      <button class="btn btn-green" onclick="anunciarEvento()">📢 Anunciar evento por broadcast</button>
      <button class="btn btn-red" style="margin-left:8px" onclick="finalizarEvento()">🏆 Finalizar y anunciar ganadores</button>
    </div>
  </div>

  <!-- CRONÓMETRO -->
  <div class="section">
    <h2>⏱️ Cronómetros activos</h2>
    <div style="display:flex;gap:8px;margin-bottom:12px">
      <input id="nombre-corredor" placeholder="Nombre del jugador..." onkeydown="if(event.key==='Enter')agregarJugador()" style="flex:1">
      <button class="btn btn-green" onclick="agregarJugador()">➕ Añadir jugador</button>
      <button class="btn btn-gray" onclick="iniciarTodos()">▶ Iniciar todos</button>
    </div>
    <div id="cronometros-container" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">
      <div style="color:#666;font-style:italic;grid-column:1/-1">Añade jugadores para ver sus cronómetros</div>
    </div>
  </div>

  <!-- RANKING -->
  <div class="section">
    <h2>🏆 Ranking de la sesión <button class="btn btn-gray" style="float:right;font-size:11px" onclick="limpiarRanking()">🗑️ Limpiar</button></h2>
    <div id="ranking-laberinto"><em style="color:#666">Sin tiempos registrados</em></div>
  </div>

</div>

<!-- HALL OF FAME -->
<div id="page-halloffame" class="page">
  <div class="section">
    <h2>🏆 Hall of Fame</h2>
    <div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">
      <input id="hof-jugador" placeholder="Nombre del jugador..." style="flex:1;min-width:150px">
      <input id="hof-categoria" placeholder="Categoría (ej: Laberinto, Coliseo...)" style="flex:1;min-width:150px">
      <input id="hof-logro" placeholder="Logro o motivo..." style="flex:2;min-width:200px">
      <button class="btn btn-green" onclick="añadirHoF()">➕ Añadir</button>
    </div>
    <div id="lista-hof"><em style="color:#666">Cargando...</em></div>
  </div>
</div>

<!-- COLISEO -->
<div id="page-coliseo" class="page">
  <div class="section">
    <h2>⚔️ Coliseo — Evento activo</h2>
    <div id="coliseo-evento-activo"></div>
  </div>
  <div class="section">
    <h2>➕ Crear nuevo evento y asignar taquillas</h2>
    <div class="form-group">
      <label>Nombre del evento</label>
      <input id="col-nombre" placeholder="Ej: Torneo Coliseo Semana 3">
    </div>
    <div class="form-group">
      <label>Fecha del evento</label>
      <input id="col-fecha" placeholder="Ej: Domingo 6 de julio">
    </div>
    <div class="form-group">
      <label>Jugadores inscritos (uno por línea, máximo 34)</label>
      <textarea id="col-jugadores" style="height:120px;resize:vertical" placeholder="Jugador1&#10;Jugador2&#10;Jugador3"></textarea>
    </div>
    <button class="btn btn-green" onclick="crearColiseo()">⚔️ Asignar taquillas y enviar DMs</button>
    <button class="btn btn-red" style="margin-left:8px" onclick="resetearColiseo()">🔄 Resetear taquillas</button>
  </div>
  <div class="section">
    <h2>📋 Asignaciones actuales <span id="col-total" style="color:#666;font-size:13px"></span></h2>
    <div style="display:flex;gap:8px;margin-bottom:12px">
      <input id="col-buscar" placeholder="Buscar jugador..." oninput="filtrarTaquillas()" style="flex:1">
    </div>
    <div id="lista-taquillas"></div>
  </div>
</div>
  <div class="section">
    <h2>🛒 Mercaderes activos</h2>
    <div id="lista-mercaderes"></div>
  </div>
</div>

<!-- ESTADÍSTICAS -->
<div id="page-estadisticas" class="page">
  <div class="grid">
    <div class="card"><h3>👥 Total registrados</h3><div class="value" id="est-registrados">-</div><div class="sub">jugadores</div></div>
    <div class="card"><h3>🏳️ Banderas concedidas</h3><div class="value" id="est-banderas">-</div><div class="sub">total histórico</div></div>
    <div class="card"><h3>🎉 Eventos celebrados</h3><div class="value" id="est-eventos">-</div><div class="sub">total</div></div>
    <div class="card"><h3>⚠️ Sanciones emitidas</h3><div class="value" id="est-sanciones">-</div><div class="sub">total histórico</div></div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px">
    <div class="section">
      <h2>📅 Registros por semana</h2>
      <canvas id="grafico-registros" height="200"></canvas>
    </div>
    <div class="section">
      <h2>🏳️ Banderas por estado</h2>
      <canvas id="grafico-banderas" height="200"></canvas>
    </div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
    <div class="section">
      <h2>🎫 Tickets por tipo</h2>
      <canvas id="grafico-tickets" height="200"></canvas>
    </div>
    <div class="section">
      <h2>⚠️ Sanciones por nivel</h2>
      <canvas id="grafico-sanciones" height="200"></canvas>
    </div>
  </div>
</div>

<!-- VOTACIONES -->
<div id="page-votaciones" class="page">
  <div class="grid">
    <div class="card"><h3>📋 Sugerencias pendientes</h3><div class="value" id="vot-pendientes">-</div></div>
    <div class="card"><h3>🗳️ Encuestas activas</h3><div class="value" id="vot-activas">-</div></div>
  </div>
  <div class="section">
    <h2>📋 Sugerencias de jugadores</h2>
    <p style="color:#666;font-size:13px;margin-bottom:12px">Las sugerencias que los jugadores envían con /sugerir. Puedes aprobarlas como encuesta o rechazarlas.</p>
    <div id="lista-sugerencias"><em style="color:#666">Cargando...</em></div>
  </div>
  <div class="section">
    <h2>🗳️ Encuestas activas</h2>
    <div id="lista-encuestas"><em style="color:#666">Cargando...</em></div>
  </div>
  <div class="section">
    <h2>➕ Crear encuesta manual</h2>
    <div class="form-group">
      <label>Pregunta</label>
      <input id="enc-pregunta" placeholder="¿Queréis que se añada un nuevo modo de juego?">
    </div>
    <div class="form-group">
      <label>Opciones (una por línea, mínimo 2)</label>
      <textarea id="enc-opciones" style="height:80px;resize:vertical" placeholder="Sí&#10;No&#10;Me da igual"></textarea>
    </div>
    <button class="btn btn-green" onclick="crearEncuesta()">🗳️ Crear encuesta en Discord</button>
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
  if (name === 'tickets') await cargarTickets();
  if (name === 'laberinto') renderRanking();
  if (name === 'rcon') await cargarBroadcastsGuardados();
  if (name === 'halloffame') await cargarHoF();
  if (name === 'coliseo') await cargarColiseo();
  if (name === 'estadisticas') await cargarEstadisticas();
  if (name === 'votaciones') await cargarVotaciones();
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
    lista.innerHTML = data.jugadoresOnline.map(function(j) {
      return '<span style="display:inline-block;background:#1a2a1a;border:1px solid #4CAF50;padding:4px 12px;border-radius:20px;margin:4px;font-size:13px">🦖 ' + j + '</span>';
    }).join('');
  }

  renderAlertas(data);
  comprobarAlertas(data);
  await cargarNotas();
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
  tbody.innerHTML = lista.map(function(j) {
    const dias = Math.floor((Date.now() - new Date(j.fecha_registro).getTime()) / 86400000);
    const sancionBadge = j.sanciones > 0 ? '<span class="badge red">⚠️ ' + j.sanciones + '</span>' : '<span class="badge green">✅</span>';
    return '<tr>' +
      '<td><strong>' + j.nombre_ark + '</strong></td>' +
      '<td style="color:#888">' + j.discord_username + '</td>' +
      '<td style="color:#666">hace ' + dias + 'd</td>' +
      '<td>' + sancionBadge + '</td>' +
      '<td class="actions">' +
      '<button class="btn btn-yellow" style="font-size:11px" data-id="' + j.discord_id + '" onclick="verJugador(this.dataset.id)">Ver ficha</button>' +
      '<button class="btn btn-red" style="font-size:11px" data-id="' + j.discord_id + '" data-user="' + j.discord_username + '" onclick="sancionarRapido(this.dataset.id,this.dataset.user)">Sancionar</button>' +
      '</td></tr>';
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
  alert(\'👤 \' + (data.nombre_ark) + '\\nDiscord: \' + (data.discord_username) + '\\nRegistrado: \' + (new Date(data.fecha_registro).toLocaleDateString('es-ES')) + '\\n\\nBandera Blanca: \' + (bb) + '\\nSanciones: \' + (data.nivel_sancion || 0) + '/4\\nAdvertencias: \' + (data.advertencias) + '\\nMercader: \' + (data.mercader ? 'Sí' : 'No') + '\');
}

// MODERACIÓN
async function cargarModeracion() {
  const data = await api('moderacion');

  const pen = document.getElementById('lista-penalizados');
  if (!data.penalizados.length) {
    pen.innerHTML = '<em style="color:#666">Ningún jugador penalizado</em>';
  } else {
    pen.innerHTML = '<table><thead><tr><th>Nombre ARK</th><th>Acciones</th></tr></thead><tbody>' +
      data.penalizados.map(p => \'<tr><td>\' + (p) + '</td><td><button class="btn btn-green" style="font-size:11px" onclick="perdonarNombre('\' + (p))">✅ Quitar penalización</button></td></tr>\').join('') +
      '</tbody></table>';
  }

  const rep = document.getElementById('lista-reportes');
  if (!data.reportes.length) {
    rep.innerHTML = '<em style="color:#666">No hay reportes pendientes</em>';
  } else {
    rep.innerHTML = '<table><thead><tr><th>Reportado</th><th>Por</th><th>Motivo</th><th>Fecha</th></tr></thead><tbody>' +
      data.reportes.map(r => \'<tr>
        <td><strong>\' + (r.jugador_reportado) + '</strong></td>
        <td style="color:#888">\' + (r.reportado_por) + '</td>
        <td style="color:#aaa">\' + (r.motivo) + '</td>
        <td style="color:#666">\' + (new Date(r.fecha).toLocaleDateString('es-ES')) + '</td>
      </tr>\').join('') + '</tbody></table>';
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
  const pendientes = data.filter(function(b) { return b.estado === 'pendiente'; });
  const activas = data.filter(function(b) { return b.estado === 'activo'; });

  if (!activas.length && !pendientes.length) {
    lista.innerHTML = '<em style="color:#666">No hay banderas activas ni pendientes</em>';
    return;
  }

  function renderPendiente(b) {
    return '<div style="background:#2a2a1a;border:1px solid #F39C12;border-radius:6px;padding:12px;margin-bottom:8px">' +
      '<strong>⏳ PENDIENTE — ' + b.nombre_ark + '</strong>' +
      '<span style="color:#888;font-size:12px;margin-left:8px">' + b.discord_username + '</span>' +
      (b.nombre_tribu ? '<span style="color:#666;font-size:12px"> · Tribu: ' + b.nombre_tribu + '</span>' : '') +
      '<div class="actions" style="margin-top:8px">' +
      '<button class="btn btn-green" style="font-size:11px" data-id="' + b.id + '" onclick="accionBB(this.dataset.id,'activar')">✅ Activar</button>' +
      '<button class="btn btn-red" style="font-size:11px" data-id="' + b.id + '" onclick="accionBB(this.dataset.id,'denegar_cueva')">❌ No cumple</button>' +
      '<button class="btn btn-red" style="font-size:11px" data-id="' + b.id + '" onclick="accionBB(this.dataset.id,'denegar_repetida')">❌ Ya usó BB</button>' +
      '</div></div>';
  }

  function renderActiva(b) {
    const expira = new Date(b.fecha_expiracion);
    const resta = Math.max(0, expira - Date.now());
    const horas = Math.floor(resta / 3600000);
    const mins = Math.floor((resta % 3600000) / 60000);
    return '<div style="background:#1a2a1a;border:1px solid #4CAF50;border-radius:6px;padding:12px;margin-bottom:8px">' +
      '<strong>🟢 ' + b.nombre_ark + '</strong>' +
      '<span style="color:#888;font-size:12px;margin-left:8px">' + b.discord_username + '</span>' +
      (b.nombre_tribu ? '<span style="color:#666;font-size:12px"> · ' + b.nombre_tribu + '</span>' : '') +
      '<span class="countdown" style="margin-left:8px">⏱️ ' + horas + 'h ' + mins + 'm restantes</span>' +
      '<div class="actions" style="margin-top:8px">' +
      '<button class="btn btn-green" style="font-size:11px" data-id="' + b.id + '" onclick="accionBB(this.dataset.id,'prorrogar')">⏰ Prorrogar +24h</button>' +
      '<button class="btn btn-red" style="font-size:11px" data-id="' + b.id + '" onclick="accionBB(this.dataset.id,'quitar')">🗑️ Quitar</button>' +
      '</div></div>';
  }

  lista.innerHTML = pendientes.map(renderPendiente).concat(activas.map(renderActiva)).join('');
}


async function accionBB(id, accion) {
  const r = await api('bandera/' + accion, 'POST', { id });
  toast(r.ok ? '✅ Hecho' : '❌ ' + r.error, r.ok ? '#4CAF50' : '#f44');
  cargarBanderas();
}

// INCUBADORAS
async function cargarIncubadoras() {
  const data = await api('incubadoras');
  document.getElementById('lista-incubadoras').innerHTML = data.map(inc => \'
    <div style="background:\' + (inc.estado==='libre'?'#1a2a1a':'#2a1a1a') + ';border:1px solid \' + (inc.estado==='libre'?'#4CAF50':'#f44') + ';border-radius:6px;padding:16px;margin-bottom:8px;display:flex;align-items:center;gap:16px">
      <div style="font-size:24px">\' + (inc.estado==='libre'?'✅':'🔒') + '</div>
      <div style="flex:1">
        <strong>Incubadora \' + (inc.id) + '</strong>
        <span class="badge \' + (inc.estado==='libre'?'green':'red') + '" style="margin-left:8px">\' + (inc.estado.toUpperCase()) + '</span>
        \' + (inc.estado==='ocupada' ? '<div style="color:#888;font-size:12px;margin-top:4px">Ocupada por: '+inc.ocupada_por+'</div>' : '') + '
      </div>
      <div style="text-align:right">
        <div style="font-size:12px;color:#666">PIN actual</div>
        <div style="font-family:monospace;font-size:20px;color:#F1C40F">\' + (inc.pin) + '</div>
      </div>
      <div class="actions">
        \' + (inc.estado==='ocupada' ? '<button class="btn btn-green" style="font-size:11px" onclick="liberarIncubadora('+inc.id+')">Liberar</button>' : '') + '
        <button class="btn btn-gray" style="font-size:11px" onclick="cambiarPin('+inc.id+')">Cambiar PIN</button>
      </div>
    </div>
  \').join('');
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
    data.map(m => \'<tr>
      <td>\' + (m.discordUsername || m.discord_id) + '</td>
      <td><span class="badge blue">Puesto \' + (m.puesto || '?') + '</span></td>
      <td><button class="btn btn-red" style="font-size:11px" onclick="quitarMercader('\' + (m.discord_id))">Quitar puesto</button></td>
    </tr>\').join('') + '</tbody></table>';
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

// ALERTAS DEL DASHBOARD
function renderAlertas(data) {
  const container = document.getElementById('alertas-container');
  const alertas = [];

  if (data.banderasProximas && data.banderasProximas.length > 0) {
    data.banderasProximas.forEach(function(b) {
      const horas = Math.floor((new Date(b.fecha_expiracion) - Date.now()) / 3600000);
      alertas.push({ tipo: 'yellow', pagina: 'banderas', msg: 'BB de <strong>' + b.nombre_ark + '</strong> expira en ' + horas + 'h' });
    });
  }

  if (data.reportesPendientes > 0) {
    alertas.push({ tipo: 'red', pagina: 'moderacion', msg: '<strong>' + data.reportesPendientes + ' reportes</strong> pendientes de revisar' });
  }

  if (data.tickets > 0) {
    alertas.push({ tipo: 'yellow', pagina: 'tickets', msg: '<strong>' + data.tickets + ' tickets</strong> abiertos sin resolver' });
  }

  if (data.banderasPendientes > 0) {
    alertas.push({ tipo: 'red', pagina: 'banderas', msg: '<strong>' + data.banderasPendientes + ' solicitudes</strong> de Bandera Blanca pendientes' });
  }

  if (!alertas.length) {
    container.innerHTML = '<div style="background:#1a3a1a;border:1px solid #4CAF50;border-radius:6px;padding:10px 16px;font-size:13px;color:#4CAF50">✅ Todo en orden — sin alertas pendientes</div>';
    return;
  }

  container.innerHTML = alertas.map(function(a) {
    const bg = a.tipo === 'red' ? '#3a1a1a' : '#3a2a1a';
    const border = a.tipo === 'red' ? '#f44' : '#F39C12';
    const icon = a.tipo === 'red' ? '🔴' : '🟡';
    return '<div style="background:' + bg + ';border:1px solid ' + border + ';border-radius:6px;padding:10px 16px;font-size:13px;margin-bottom:6px;display:flex;align-items:center;justify-content:space-between">' +
      '<span>' + icon + ' ' + a.msg + '</span>' +
      '<button class="btn btn-gray" style="font-size:11px;margin-left:12px" data-pagina="' + a.pagina + '" onclick="showPage(this.dataset.pagina,null)">Ver</button>' +
      '</div>';
  }).join('');
}

// ESTADÍSTICAS HISTÓRICAS
let graficos = {};

async function cargarEstadisticas() {
  const data = await api('estadisticas');

  document.getElementById('est-registrados').textContent = data.totalRegistrados || 0;
  document.getElementById('est-banderas').textContent = data.totalBanderas || 0;
  document.getElementById('est-eventos').textContent = data.totalEventos || 0;
  document.getElementById('est-sanciones').textContent = data.totalSanciones || 0;

  Object.values(graficos).forEach(function(g) { g.destroy(); });
  graficos = {};

  const opts = {
    plugins: { legend: { labels: { color: '#aaa' } } },
    scales: { x: { ticks: { color: '#666' }, grid: { color: '#222' } }, y: { ticks: { color: '#666' }, grid: { color: '#222' }, beginAtZero: true } }
  };

  if (data.registrosPorSemana && data.registrosPorSemana.length) {
    graficos.registros = new Chart(document.getElementById('grafico-registros'), {
      type: 'bar',
      data: { labels: data.registrosPorSemana.map(function(r) { return r.semana; }), datasets: [{ label: 'Nuevos jugadores', data: data.registrosPorSemana.map(function(r) { return r.total; }), backgroundColor: '#4CAF50aa', borderColor: '#4CAF50', borderWidth: 1 }] },
      options: opts
    });
  }

  if (data.banderasPorEstado) {
    graficos.banderas = new Chart(document.getElementById('grafico-banderas'), {
      type: 'doughnut',
      data: { labels: ['Activas', 'Expiradas', 'Denegadas', 'Pendientes'], datasets: [{ data: [data.banderasPorEstado.activo || 0, data.banderasPorEstado.expirado || 0, data.banderasPorEstado.denegado || 0, data.banderasPorEstado.pendiente || 0], backgroundColor: ['#4CAF50', '#95A5A6', '#E74C3C', '#F39C12'] }] },
      options: { plugins: { legend: { labels: { color: '#aaa' } } } }
    });
  }

  if (data.ticketsPorTipo) {
    const tipos = Object.keys(data.ticketsPorTipo);
    graficos.tickets = new Chart(document.getElementById('grafico-tickets'), {
      type: 'bar',
      data: { labels: tipos, datasets: [{ label: 'Tickets', data: tipos.map(function(t) { return data.ticketsPorTipo[t]; }), backgroundColor: '#3498DBaa', borderColor: '#3498DB', borderWidth: 1 }] },
      options: opts
    });
  }

  if (data.sancionesPorNivel) {
    graficos.sanciones = new Chart(document.getElementById('grafico-sanciones'), {
      type: 'bar',
      data: { labels: ['Nivel 1', 'Nivel 2', 'Nivel 3', 'Nivel 4'], datasets: [{ label: 'Sanciones', data: [1,2,3,4].map(function(n) { return data.sancionesPorNivel[n] || 0; }), backgroundColor: ['#F39C12aa','#E67E22aa','#E74C3Caa','#8E44ADaa'], borderColor: ['#F39C12','#E67E22','#E74C3C','#8E44AD'], borderWidth: 1 }] },
      options: opts
    });
  }
}

// BUSCADOR GLOBAL
let buscarTimeout = null;

async function buscarGlobal(query) {
  clearTimeout(buscarTimeout);
  const div = document.getElementById('resultados-busqueda');
  if (!query || query.length < 2) { div.style.display = 'none'; return; }
  buscarTimeout = setTimeout(async function() {
    const r = await api('buscar?q=' + encodeURIComponent(query));
    if (!r.resultados || !r.resultados.length) {
      div.innerHTML = '<div style="padding:12px;color:#666;font-size:13px">Sin resultados para "' + query + '"</div>';
    } else {
      const iconos = { jugador: '👤', bandera: '🏳️', sancion: '⚠️', ticket: '🎫' };
      div.innerHTML = r.resultados.map(function(res) {
        return '<div style="padding:10px 12px;border-bottom:1px solid #333;cursor:pointer;font-size:13px" ' +
          'data-tipo="' + res.tipo + '" onclick="irAResultado(this.dataset.tipo)">' +
          (iconos[res.tipo] || '🔍') + ' <strong>' + res.nombre + '</strong>' +
          '<span style="color:#666;font-size:11px;margin-left:8px">' + res.subtitulo + '</span></div>';
      }).join('');
    }
    div.style.display = 'block';
  }, 300);
}

function mostrarResultados() {
  const div = document.getElementById('resultados-busqueda');
  if (div.innerHTML) div.style.display = 'block';
}

function ocultarResultados() {
  setTimeout(function() { document.getElementById('resultados-busqueda').style.display = 'none'; }, 200);
}

function irAResultado(tipo) {
  document.getElementById('resultados-busqueda').style.display = 'none';
  document.getElementById('buscador-global').value = '';
  const paginas = { jugador: 'jugadores', bandera: 'banderas', sancion: 'moderacion', ticket: 'tickets' };
  if (paginas[tipo]) showPage(paginas[tipo], null);
}

// NOTIFICACIONES DEL NAVEGADOR
let notifPermiso = false;
let ultimasAlertasHash = '';

async function iniciarNotificaciones() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    notifPermiso = true;
  } else if (Notification.permission !== 'denied') {
    const perm = await Notification.requestPermission();
    notifPermiso = perm === 'granted';
  }
}

function enviarNotificacion(titulo, cuerpo) {
  if (!notifPermiso || document.visibilityState === 'visible') return;
  const n = new Notification('🦖 TSDE Admin — ' + titulo, { body: cuerpo });
  setTimeout(function() { n.close(); }, 5000);
}

function comprobarAlertas(data) {
  const hash = (data.reportesPendientes || 0) + '_' + (data.banderasPendientes || 0) + '_' + (data.banderasProximas ? data.banderasProximas.length : 0);
  if (hash === ultimasAlertasHash) return;
  ultimasAlertasHash = hash;
  if (data.reportesPendientes > 0) enviarNotificacion('Reportes pendientes', data.reportesPendientes + ' reportes sin revisar');
  if (data.banderasPendientes > 0) enviarNotificacion('Banderas Blancas', data.banderasPendientes + ' solicitudes pendientes');
}

// NOTAS ADMIN
async function cargarNotas() {
  const r = await api('notas');
  if (r.nota) {
    document.getElementById('notas-admin').value = r.nota;
  }
  if (r.historial && r.historial.length) {
    document.getElementById('notas-historial').innerHTML =
      '<div style="font-size:11px;color:#555;margin-bottom:4px">Últimas guardadas:</div>' +
      r.historial.slice(-3).reverse().map(function(n) {
        return '<div style="font-size:11px;color:#444;padding:4px 0;border-bottom:1px solid #222">' +
          '<span style="color:#555">' + new Date(n.fecha).toLocaleString('es-ES') + '</span> — ' + n.admin + '</div>';
      }).join('');
  }
}

async function guardarNotas() {
  const nota = document.getElementById('notas-admin').value;
  const r = await api('notas', 'POST', { nota });
  const estado = document.getElementById('notas-estado');
  if (r.ok) {
    estado.textContent = '✅ Guardado — ' + new Date().toLocaleTimeString('es-ES');
    estado.style.color = '#4CAF50';
  } else {
    estado.textContent = '❌ Error al guardar';
    estado.style.color = '#f44';
  }
}

async function cargarTickets() {
  const data = await api('tickets');
  document.getElementById('tkt-abiertos').textContent = data.abiertos?.length || 0;
  document.getElementById('tkt-cerrados').textContent = data.cerrados || 0;
  document.getElementById('tkt-reportes').textContent = data.reportes?.length || 0;

  const lista = document.getElementById('lista-tickets');
  if (!data.abiertos?.length) {
    lista.innerHTML = '<em style="color:#666">No hay tickets activos</em>';
  } else {
    lista.innerHTML = '<table><thead><tr><th>Tipo</th><th>Jugador</th><th>Fecha</th><th>Canal</th></tr></thead><tbody>' +
      data.abiertos.map(t => \'<tr>
        <td><span class="badge blue">\' + (t.tipo) + '</span></td>
        <td>\' + (t.discord_username) + '</td>
        <td style="color:#666">\' + (new Date(t.fecha).toLocaleString('es-ES')) + '</td>
        <td style="color:#888;font-size:12px">\' + (t.canal_id ? '#'+t.canal_id : '-') + '</td>
      </tr>\').join('') + '</tbody></table>';
  }

  const reportes = document.getElementById('lista-reportes-tickets');
  if (!data.reportes?.length) {
    reportes.innerHTML = '<em style="color:#666">No hay reportes pendientes</em>';
  } else {
    reportes.innerHTML = '<table><thead><tr><th>Reportado</th><th>Por</th><th>Motivo</th><th>Fecha</th></tr></thead><tbody>' +
      data.reportes.map(r => \'<tr>
        <td><strong>\' + (r.jugador_reportado) + '</strong></td>
        <td style="color:#888">\' + (r.reportado_por) + '</td>
        <td>\' + (r.motivo) + '</td>
        <td style="color:#666">\' + (new Date(r.fecha).toLocaleDateString('es-ES')) + '</td>
      </tr>\').join('') + '</tbody></table>';
  }
}

// CRONÓMETRO LABERINTO — múltiples jugadores simultáneos
let jugadoresCrono = {};
let rankingLocal = [];
let modoActual = 'speed';

function cambiarModo() {
  modoActual = document.getElementById('lab-modo').value;
}

function formatTiempo(ms) {
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const cs = Math.floor((ms % 1000) / 10);
  return m.toString().padStart(2,'0') + ':' + s.toString().padStart(2,'0') + '.' + cs.toString().padStart(2,'0');
}

function agregarJugador() {
  const nombre = document.getElementById('nombre-corredor').value.trim();
  if (!nombre) return toast('Escribe un nombre', '#f44');
  if (jugadoresCrono[nombre]) return toast('Ese jugador ya está añadido', '#f44');
  jugadoresCrono[nombre] = { start: null, interval: null, tiempo: 0, parado: false };
  document.getElementById('nombre-corredor').value = '';
  renderCronometros();
  toast('Jugador ' + nombre + ' añadido', '#4CAF50');
}

function iniciarTodos() {
  const ahora = Date.now();
  Object.entries(jugadoresCrono).forEach(function(entry) {
    const nombre = entry[0];
    const j = entry[1];
    if (!j.parado && !j.interval) {
      j.start = ahora;
      const id = nombre.replace(/[^a-z0-9]/gi,'_');
      j.interval = setInterval(function() {
        const el = document.getElementById('crono-' + id);
        if (el) el.textContent = formatTiempo(Date.now() - j.start);
      }, 10);
    }
  });
  renderCronometros();
}

function iniciarJugador(nombre) {
  const j = jugadoresCrono[nombre];
  if (!j || j.parado || j.interval) return;
  j.start = Date.now();
  const id = nombre.replace(/[^a-z0-9]/gi,'_');
  j.interval = setInterval(function() {
    const el = document.getElementById('crono-' + id);
    if (el) el.textContent = formatTiempo(Date.now() - j.start);
  }, 10);
  renderCronometros();
}

async function pararJugador(nombre) {
  const j = jugadoresCrono[nombre];
  if (!j || j.parado || !j.start) return;
  clearInterval(j.interval);
  j.interval = null;
  j.tiempo = Date.now() - j.start;
  j.parado = true;
  const tiempoStr = formatTiempo(j.tiempo);

  rankingLocal.push({ jugador: nombre, tiempo: j.tiempo, tiempoStr: tiempoStr });
  rankingLocal.sort(function(a, b) { return a.tiempo - b.tiempo; });
  renderRanking();
  renderCronometros();

  const pos = rankingLocal.findIndex(function(r) { return r.jugador === nombre; }) + 1;
  const colores = ['1,0.8,0,1', '0.8,0.8,0.8,1', '0.7,0.5,0.2,1'];
  const color = colores[pos-1] || '1,1,1,1';
  const posStr = pos === 1 ? '1er' : pos === 2 ? '2do' : pos === 3 ? '3er' : pos + '.';
  const broadcast = 'Broadcast <RichColor Color="' + color + '">' + posStr + ' ' + nombre + '</> <RichColor Color="1,1,1,1">ha completado el Laberinto en</> <RichColor Color="0,1,0,1">' + tiempoStr + '</>';
  const r = await api('rcon', 'POST', { comando: broadcast });
  toast(nombre + ': ' + tiempoStr + (r.error ? ' (sin RCON)' : ' — broadcast enviado'), r.error ? '#f39c12' : '#4CAF50');
}

function quitarJugador(nombre) {
  const j = jugadoresCrono[nombre];
  if (j && j.interval) clearInterval(j.interval);
  delete jugadoresCrono[nombre];
  renderCronometros();
}

function limpiarTodo() {
  if (!confirm('Limpiar todos los cronómetros y el ranking?')) return;
  Object.values(jugadoresCrono).forEach(function(j) { if (j.interval) clearInterval(j.interval); });
  jugadoresCrono = {};
  rankingLocal = [];
  renderCronometros();
  renderRanking();
}

function limpiarRanking() {
  if (!confirm('Limpiar solo el ranking?')) return;
  rankingLocal = [];
  renderRanking();
}

function eliminarTiempo(idx) {
  rankingLocal.splice(idx, 1);
  renderRanking();
}

function renderCronometros() {
  const container = document.getElementById('cronometros-container');
  const jugadores = Object.entries(jugadoresCrono);
  if (!jugadores.length) {
    container.innerHTML = '<div style="color:#666;font-style:italic;grid-column:1/-1">Añade jugadores arriba para ver sus cronómetros</div>';
    return;
  }
  container.innerHTML = jugadores.map(function(entry) {
    const nombre = entry[0];
    const j = entry[1];
    const id = nombre.replace(/[^a-z0-9]/gi,'_');
    const tiempoActual = j.parado ? j.tiempo : (j.start ? Date.now() - j.start : 0);
    const color = j.parado ? '#888' : (j.start ? '#4CAF50' : '#F39C12');
    const estado = j.parado ? '✅ Completado' : (j.start ? '⏱️ Corriendo' : '⏸️ En espera');
    const safeNombre = nombre.replace(/'/g, "\'");
    let botones = '';
    if (!j.start && !j.parado) botones += '<button class="btn btn-green" style="font-size:11px" data-nombre="' + nombre + '" onclick="iniciarJugador(this.dataset.nombre)">&#9654; Iniciar</button>';
    if (j.start && !j.parado) botones += '<button class="btn btn-red" style="font-size:11px" data-nombre="' + nombre + '" onclick="pararJugador(this.dataset.nombre)">&#9209; Parar</button>';
    return '<div style="background:#1a1a1a;border:2px solid ' + color + ';border-radius:8px;padding:16px;text-align:center">' +
      '<div style="font-weight:bold;font-size:15px;color:' + color + ';margin-bottom:4px">🦖 ' + nombre + '</div>' +
      '<div style="font-size:11px;color:#666;margin-bottom:8px">' + estado + '</div>' +
      '<div id="crono-' + id + '" style="font-family:monospace;font-size:38px;color:' + color + '">' + formatTiempo(tiempoActual) + '</div>' +
      '<div style="display:flex;gap:6px;justify-content:center;margin-top:10px">' + botones + '</div>' +
      '</div>';
  }).join('');
}

function renderRanking() {
  const div = document.getElementById('ranking-laberinto');
  if (!rankingLocal.length) { div.innerHTML = '<em style="color:#666">Sin tiempos registrados</em>'; return; }
  const medallas = ['🥇', '🥈', '🥉'];
  div.innerHTML = rankingLocal.map(function(r, i) {
    const bg = i===0?'#1a3a1a':i===1?'#2a2a1a':i===2?'#1a1a2a':'#111';
    const border = i===0?'#4CAF50':i===1?'#F1C40F':i===2?'#5bf':'#333';
    const colorTime = i===0?'#4CAF50':'#fff';
    return '<div style="display:flex;align-items:center;gap:12px;padding:10px;background:' + bg + ';border-radius:6px;margin-bottom:6px;border:1px solid ' + border + '">' +
      '<div style="font-size:24px">' + (medallas[i] || (i+1)+'.') + '</div>' +
      '<div style="flex:1"><strong>' + r.jugador + '</strong></div>' +
      '<div style="font-family:monospace;font-size:20px;color:' + colorTime + '">' + r.tiempoStr + '</div>' +
      '<button class="btn btn-red" style="font-size:11px" onclick="eliminarTiempo(' + i + ')">🗑️</button>' +
      '</div>';
  }).join('');
}

async function anunciarEvento() {
  const modo = document.getElementById('lab-modo');
  const modoTexto = modo.options[modo.selectedIndex].text.split('—')[0].trim();
  const p1 = document.getElementById('lab-premio1').value;
  const p2 = document.getElementById('lab-premio2').value;
  const p3 = document.getElementById('lab-premio3').value;
  const pp = document.getElementById('lab-premiopart').value;
  const broadcast = 'Broadcast <RichColor Color="1,0.8,0,1">LABERINTO TSDE - ' + modoTexto.toUpperCase() + '!</> <RichColor Color="1,1,1,1">Ven al area de espera.</> <RichColor Color="0,1,1,1">Premios: 1er ' + p1 + 'GC - 2do ' + p2 + 'GC - 3er ' + p3 + 'GC</> <RichColor Color="0,1,0,1">Solo por participar: ' + pp + 'GC!</>';
  const r = await api('rcon', 'POST', { comando: broadcast });
  toast(r.error ? 'Error RCON' : 'Anuncio enviado', r.error ? '#f44' : '#4CAF50');
}

async function finalizarEvento() {
  if (!rankingLocal.length) return toast('No hay tiempos registrados', '#f44');
  if (!confirm('Finalizar el evento y anunciar ganadores?')) return;
  const p1 = document.getElementById('lab-premio1').value;
  const p2 = document.getElementById('lab-premio2').value;
  const p3 = document.getElementById('lab-premio3').value;
  const pp = document.getElementById('lab-premiopart').value;
  let broadcast = 'Broadcast <RichColor Color="1,0.8,0,1">RESULTADOS DEL LABERINTO TSDE!</>';
  if (rankingLocal[0]) broadcast += ' <RichColor Color="1,1,0,1">1er ' + rankingLocal[0].jugador + ' (' + rankingLocal[0].tiempoStr + ') ' + p1 + 'GC</>';
  if (rankingLocal[1]) broadcast += ' <RichColor Color="0.8,0.8,0.8,1">2do ' + rankingLocal[1].jugador + ' (' + rankingLocal[1].tiempoStr + ') ' + p2 + 'GC</>';
  if (rankingLocal[2]) broadcast += ' <RichColor Color="0.7,0.5,0.2,1">3er ' + rankingLocal[2].jugador + ' (' + rankingLocal[2].tiempoStr + ') ' + p3 + 'GC</>';
  broadcast += ' <RichColor Color="0,1,0,1">Todos los participantes: ' + pp + 'GC!</>';
  await api('rcon', 'POST', { comando: broadcast });
  await api('laberinto-resultado', 'POST', { modo: modoActual, ranking: rankingLocal, premios: { p1: p1, p2: p2, p3: p3, pp: pp } });
  Object.values(jugadoresCrono).forEach(function(j) { if (j.interval) clearInterval(j.interval); });
  jugadoresCrono = {};
  rankingLocal = [];
  renderCronometros();
  renderRanking();
  toast('Ganadores anunciados — cronómetros reiniciados', '#4CAF50');
}


// HALL OF FAME
async function cargarHoF() {
  const data = await api('halloffame');
  const lista = document.getElementById('lista-hof');
  if (!data.length) { lista.innerHTML = '<em style="color:#666">El Hall of Fame está vacío</em>'; return; }
  lista.innerHTML = '<table><thead><tr><th>#</th><th>Jugador</th><th>Categoría</th><th>Logro</th><th>Fecha</th><th>Acciones</th></tr></thead><tbody>' +
    data.map((e, i) => '<tr>' +
      '<td style="color:#F1C40F;font-weight:bold">' + (i+1) + '</td>' +
      '<td><strong>' + (e.jugador || e.nombre || '-') + '</strong></td>' +
      '<td><span class="badge blue">' + (e.categoria || '-') + '</span></td>' +
      '<td>' + (e.logro || e.descripcion || '-') + '</td>' +
      '<td style="color:#666">' + (e.fecha ? new Date(e.fecha).toLocaleDateString('es-ES') : '-') + '</td>' +
      '<td><button class="btn btn-red" style="font-size:11px" onclick="eliminarHoF(' + (e.id || i) + ')">🗑️</button></td>' +
      '</tr>'
    ).join('') + '</tbody></table>';
}

async function añadirHoF() {
  const jugador = document.getElementById('hof-jugador').value.trim();
  const categoria = document.getElementById('hof-categoria').value.trim();
  const logro = document.getElementById('hof-logro').value.trim();
  if (!jugador || !categoria || !logro) return toast('Rellena todos los campos', '#f44');
  const r = await api('halloffame', 'POST', { jugador, categoria, logro, fecha: new Date().toISOString() });
  toast(r.ok ? '✅ Añadido al Hall of Fame' : '❌ Error', r.ok ? '#4CAF50' : '#f44');
  document.getElementById('hof-jugador').value = '';
  document.getElementById('hof-categoria').value = '';
  document.getElementById('hof-logro').value = '';
  cargarHoF();
}

async function eliminarHoF(id) {
  if (!confirm('¿Eliminar esta entrada del Hall of Fame?')) return;
  const r = await api('halloffame/' + id, 'DELETE');
  toast(r.ok ? '🗑️ Eliminado' : '❌ Error', r.ok ? '#4CAF50' : '#f44');
  cargarHoF();
}

// COLISEO
let taquillasCache = [];

async function cargarColiseo() {
  const data = await api('coliseo');
  taquillasCache = data.asignaciones || [];

  const eventoDiv = document.getElementById('coliseo-evento-activo');
  if (data.evento_activo && data.evento_activo.nombre) {
    eventoDiv.innerHTML = '<div style="background:#1a2a3a;border:1px solid #3498DB;border-radius:6px;padding:12px">' +
      '<strong style="color:#3498DB">⚔️ ' + data.evento_activo.nombre + '</strong>' +
      '<div style="color:#aaa;font-size:13px;margin-top:4px">Fecha: ' + (data.evento_activo.fecha || '-') + ' · Asignado el: ' + (data.evento_activo.fechaAsignacion || '-') + '</div>' +
      '<div style="color:#aaa;font-size:13px">Participantes: <strong>' + taquillasCache.length + '</strong></div>' +
      '</div>';
  } else {
    eventoDiv.innerHTML = '<em style="color:#666">No hay evento activo actualmente</em>';
  }

  document.getElementById('col-total').textContent = taquillasCache.length ? '(' + taquillasCache.length + ' participantes)' : '';
  renderTaquillas(taquillasCache);
}

function renderTaquillas(lista) {
  const div = document.getElementById('lista-taquillas');
  if (!lista.length) { div.innerHTML = '<em style="color:#666">Sin taquillas asignadas</em>'; return; }

  const ladoA = lista.filter(function(a) { return a.lado === 'A'; });
  const ladoB = lista.filter(function(a) { return a.lado === 'B'; });

  function renderLado(titulo, asigs) {
    if (!asigs.length) return '';
    return '<div style="margin-bottom:16px">' +
      '<div style="color:#E74C3C;font-weight:bold;margin-bottom:8px">' + titulo + '</div>' +
      '<table><thead><tr><th>Taquilla</th><th>Lado</th><th>Jugador</th><th>PIN</th><th>Acciones</th></tr></thead><tbody>' +
      asigs.map(function(a) {
        return '<tr>' +
          '<td><span class="badge blue">T' + String(a.taquilla).padStart(2,'0') + '</span></td>' +
          '<td>' + a.lado + '</td>' +
          '<td><strong>' + a.jugador + '</strong></td>' +
          '<td><code style="color:#F1C40F;font-size:15px">' + a.pin + '</code></td>' +
          '<td><button class="btn btn-gray" style="font-size:11px" onclick="cambiarPinColiseo(' + a.taquilla + ')">🔑 Cambiar PIN</button></td>' +
          '</tr>';
      }).join('') + '</tbody></table></div>';
  }

  div.innerHTML = renderLado('🅰️ Lado A (Taquillas 01-17)', ladoA) + renderLado('🅱️ Lado B (Taquillas 18-34)', ladoB);
}

function filtrarTaquillas() {
  const q = document.getElementById('col-buscar').value.toLowerCase();
  renderTaquillas(taquillasCache.filter(function(a) { return a.jugador.toLowerCase().includes(q); }));
}

async function crearColiseo() {
  const nombre = document.getElementById('col-nombre').value.trim();
  const fecha = document.getElementById('col-fecha').value.trim();
  const jugadoresRaw = document.getElementById('col-jugadores').value.trim();
  if (!nombre || !fecha || !jugadoresRaw) return toast('Rellena todos los campos', '#f44');
  const jugadores = jugadoresRaw.split(String.fromCharCode(10)).map(function(j) { return j.trim(); }).filter(Boolean);
  if (jugadores.length === 0) return toast('Añade al menos un jugador', '#f44');
  if (jugadores.length > 34) return toast('Máximo 34 jugadores', '#f44');
  if (!confirm('Se asignarán taquillas a ' + jugadores.length + ' jugadores y se enviarán DMs. ¿Continuar?')) return;

  const r = await api('coliseo/crear', 'POST', { nombre, fecha, jugadores });
  if (r.ok) {
    toast('✅ Taquillas asignadas · DMs: ' + r.dmEnviados + '/' + jugadores.length + (r.dmFallidos && r.dmFallidos.length ? ' · Fallidos: ' + r.dmFallidos.join(', ') : ''), '#4CAF50');
    document.getElementById('col-nombre').value = '';
    document.getElementById('col-fecha').value = '';
    document.getElementById('col-jugadores').value = '';
    cargarColiseo();
  } else {
    toast('❌ ' + (r.error || 'Error'), '#f44');
  }
}

async function resetearColiseo() {
  if (!confirm('¿Resetear todas las taquillas? Se perderán los PINes actuales.')) return;
  const r = await api('coliseo/resetear', 'POST');
  toast(r.ok ? '✅ Taquillas reseteadas' : '❌ Error', r.ok ? '#4CAF50' : '#f44');
  cargarColiseo();
}

async function cambiarPinColiseo(numTaquilla) {
  const nuevoPin = prompt('Nuevo PIN para taquilla ' + numTaquilla + ' (4 dígitos):');
  if (!nuevoPin || nuevoPin.length !== 4 || isNaN(nuevoPin)) return toast('PIN inválido (debe ser 4 dígitos)', '#f44');
  const r = await api('coliseo/pin', 'POST', { taquilla: numTaquilla, pin: nuevoPin });
  toast(r.ok ? '✅ PIN actualizado: ' + nuevoPin : '❌ Error', r.ok ? '#4CAF50' : '#f44');
  cargarColiseo();
}

// TEMPORIZADOR DE EVENTO
let timerInterval = null;
let timerTarget = null;

function iniciarTimer() {
  const nombre = document.getElementById('timer-nombre').value.trim();
  const fecha = document.getElementById('timer-fecha').value;
  if (!nombre || !fecha) return toast('Rellena nombre y fecha', '#f44');

  timerTarget = new Date(fecha).getTime();
  if (timerTarget < Date.now()) return toast('La fecha debe ser en el futuro', '#f44');

  if (timerInterval) clearInterval(timerInterval);

  document.getElementById('timer-display').style.display = 'block';
  document.getElementById('timer-evento-nombre').textContent = nombre;
  document.getElementById('timer-fecha-texto').textContent = new Date(fecha).toLocaleString('es-ES');

  function actualizar() {
    const diff = timerTarget - Date.now();
    if (diff <= 0) {
      clearInterval(timerInterval);
      document.getElementById('timer-countdown').textContent = '¡AHORA!';
      document.getElementById('timer-countdown').style.color = '#E74C3C';
      toast('⏰ El evento ' + nombre + ' ha comenzado!', '#E74C3C');
      return;
    }
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    let txt = '';
    if (d > 0) txt += d + 'd ';
    txt += String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
    document.getElementById('timer-countdown').textContent = txt;
    document.getElementById('timer-countdown').style.color = diff < 3600000 ? '#E74C3C' : diff < 86400000 ? '#F39C12' : '#4CAF50';
  }

  actualizar();
  timerInterval = setInterval(actualizar, 1000);
}

function pararTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  timerTarget = null;
  document.getElementById('timer-display').style.display = 'none';
  document.getElementById('timer-nombre').value = '';
  document.getElementById('timer-fecha').value = '';
}
async function cargarVotaciones() {
  const data = await api('votaciones');
  const sugerencias = data.sugerencias || [];
  const encuestas = data.encuestas || [];

  document.getElementById('vot-pendientes').textContent = sugerencias.length;
  document.getElementById('vot-activas').textContent = encuestas.filter(function(e) { return !e.cerrada; }).length;

  const listaSug = document.getElementById('lista-sugerencias');
  if (!sugerencias.length) {
    listaSug.innerHTML = '<em style="color:#666">No hay sugerencias pendientes</em>';
  } else {
    listaSug.innerHTML = sugerencias.map(function(s) {
      return '<div style="background:#1a1a1a;border:1px solid #333;border-radius:6px;padding:12px;margin-bottom:8px">' +
        '<div style="display:flex;align-items:flex-start;gap:12px">' +
        '<div style="flex:1">' +
        '<div style="color:#aaa;font-size:12px;margin-bottom:4px">👤 ' + s.autor + ' · ' + new Date(s.fecha).toLocaleDateString('es-ES') + '</div>' +
        '<div style="font-size:14px">' + s.texto + '</div>' +
        '</div>' +
        '<div style="display:flex;gap:6px;flex-shrink:0">' +
        '<button class="btn btn-green" style="font-size:11px" data-id="' + s.id + '" onclick="aprobarSugerencia(this.dataset.id)">✅ Crear encuesta</button>' +
        '<button class="btn btn-red" style="font-size:11px" data-id="' + s.id + '" onclick="rechazarSugerencia(this.dataset.id)">❌ Rechazar</button>' +
        '</div></div></div>';
    }).join('');
  }

  const listaEnc = document.getElementById('lista-encuestas');
  const activas = encuestas.filter(function(e) { return !e.cerrada; });
  if (!activas.length) {
    listaEnc.innerHTML = '<em style="color:#666">No hay encuestas activas</em>';
  } else {
    listaEnc.innerHTML = activas.map(function(e) {
      const totalVotos = Object.values(e.votos || {}).reduce(function(sum, arr) { return sum + (arr.length || 0); }, 0);
      const opciones = (e.opciones || []).map(function(op, i) {
        const votos = (e.votos && e.votos[i]) ? e.votos[i].length : 0;
        const pct = totalVotos > 0 ? Math.round(votos / totalVotos * 100) : 0;
        return '<div style="margin:4px 0">' +
          '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:2px">' +
          '<span>' + op + '</span><span style="color:#888">' + votos + ' votos (' + pct + '%)</span></div>' +
          '<div style="background:#333;border-radius:4px;height:6px">' +
          '<div style="background:#4CAF50;width:' + pct + '%;height:100%;border-radius:4px"></div></div></div>';
      }).join('');
      return '<div style="background:#1a1a1a;border:1px solid #333;border-radius:6px;padding:12px;margin-bottom:8px">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">' +
        '<strong>' + e.pregunta + '</strong>' +
        '<button class="btn btn-red" style="font-size:11px" data-id="' + e.id + '" onclick="cerrarEncuesta(this.dataset.id)">🔒 Cerrar</button>' +
        '</div>' +
        '<div style="color:#666;font-size:12px;margin-bottom:8px">Por: ' + e.autor + ' · ' + totalVotos + ' votos totales</div>' +
        opciones + '</div>';
    }).join('');
  }
}

async function aprobarSugerencia(id) {
  const r = await api('votaciones/aprobar', 'POST', { id });
  toast(r.ok ? '✅ Encuesta creada en Discord' : '❌ ' + (r.error || 'Error'), r.ok ? '#4CAF50' : '#f44');
  cargarVotaciones();
}

async function rechazarSugerencia(id) {
  if (!confirm('¿Rechazar esta sugerencia?')) return;
  const r = await api('votaciones/rechazar', 'POST', { id });
  toast(r.ok ? '🗑️ Sugerencia rechazada' : '❌ Error', r.ok ? '#4CAF50' : '#f44');
  cargarVotaciones();
}

async function cerrarEncuesta(id) {
  if (!confirm('¿Cerrar esta encuesta?')) return;
  const r = await api('votaciones/cerrar', 'POST', { id });
  toast(r.ok ? '✅ Encuesta cerrada' : '❌ Error', r.ok ? '#4CAF50' : '#f44');
  cargarVotaciones();
}

async function crearEncuesta() {
  const pregunta = document.getElementById('enc-pregunta').value.trim();
  const opcionesRaw = document.getElementById('enc-opciones').value.trim();
  if (!pregunta || !opcionesRaw) return toast('Rellena pregunta y opciones', '#f44');
  const opciones = opcionesRaw.split(String.fromCharCode(10)).map(function(o) { return o.trim(); }).filter(Boolean);
  if (opciones.length < 2) return toast('Mínimo 2 opciones', '#f44');
  const r = await api('votaciones/crear', 'POST', { pregunta, opciones });
  toast(r.ok ? '✅ Encuesta creada en Discord' : '❌ Error', r.ok ? '#4CAF50' : '#f44');
  document.getElementById('enc-pregunta').value = '';
  document.getElementById('enc-opciones').value = '';
  cargarVotaciones();
}

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
  lista.innerHTML = data.map(b => \'
    <div style="background:#111;border:1px solid #333;border-radius:6px;padding:12px;margin-bottom:8px">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
        <strong style="color:#4CAF50;flex:1">\' + (b.nombre) + '</strong>
        <button class="btn btn-green" style="font-size:11px" onclick="enviarBroadcastGuardado('\' + (b.id))">📢 Broadcast</button>
        <button class="btn btn-red" style="font-size:11px" onclick="borrarBroadcast('\' + (b.id))">🗑️</button>
      </div>
      <div style="font-size:13px;color:#aaa;white-space:pre-wrap">\' + (b.texto) + '</div>
    </div>
  \').join('');
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
iniciarNotificaciones();
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
                const todasBanderas = database.getAllBanderas();
                const banderasActivas = todasBanderas.filter(b => b.estado === 'activo');
                const ahora = Date.now();

                // BB que expiran en menos de 6h
                const banderasProximas = banderasActivas.filter(b => {
                    const exp = new Date(b.fecha_expiracion).getTime();
                    return exp - ahora < 6 * 3600000 && exp > ahora;
                });

                // BB pendientes de activar
                const banderasPendientes = todasBanderas.filter(b => b.estado === 'pendiente').length;

                return responderJSON(res, 200, {
                    online: jugadoresOnline.length,
                    registrados: database.countJugadores(),
                    banderas: banderasActivas.length,
                    tickets: database.countReportesPendientes(),
                    mercaderes: database.countMercaderes(),
                    penalizados: database.getPenalizados().length,
                    jugadoresOnline,
                    banderasProximas,
                    banderasPendientes,
                    reportesPendientes: database.countReportesPendientes()
                });
            }

            // Notas admin
            if (endpoint === 'notas' && req.method === 'GET') {
                try {
                    const notas = JSON.parse(fs.readFileSync('./notas_admin.json', 'utf8'));
                    return responderJSON(res, 200, notas);
                } catch (e) {
                    return responderJSON(res, 200, { nota: '', historial: [] });
                }
            }

            if (endpoint === 'notas' && req.method === 'POST') {
                const body = await leerBody(req);
                let notas = { nota: '', historial: [] };
                try { notas = JSON.parse(fs.readFileSync('./notas_admin.json', 'utf8')); } catch (e) {}
                notas.historial = notas.historial || [];
                notas.historial.push({ fecha: new Date().toISOString(), admin: 'Admin Panel' });
                if (notas.historial.length > 10) notas.historial = notas.historial.slice(-10);
                notas.nota = body.nota;
                fs.writeFileSync('./notas_admin.json', JSON.stringify(notas, null, 2));
                return responderJSON(res, 200, { ok: true });
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

            // Tickets
            if (endpoint === 'tickets') {
                const abiertos = (() => {
                    try {
                        return database.getAllJugadores().slice(0, 0); // placeholder
                    } catch (e) { return []; }
                })();

                // Leer tickets abiertos de SQLite
                const Database = require('better-sqlite3');
                const rawDb = new Database('./tsde.db');
                const ticketsAbiertos = rawDb.prepare("SELECT * FROM tickets WHERE estado = 'abierto' ORDER BY fecha DESC LIMIT 50").all();
                const ticketsCerrados = rawDb.prepare("SELECT COUNT(*) as total FROM tickets WHERE estado = 'cerrado'").get().total;
                const reportesPend = rawDb.prepare("SELECT * FROM reportes WHERE estado = 'pendiente' ORDER BY fecha DESC").all();
                rawDb.close();

                return responderJSON(res, 200, {
                    abiertos: ticketsAbiertos,
                    cerrados: ticketsCerrados,
                    reportes: reportesPend
                });
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
                } else if (accion === 'prorrogar') {
                    const bandera = database.getBandera(id);
                    if (bandera) {
                        const nuevaExp = new Date(new Date(bandera.fecha_expiracion).getTime() + 24 * 3600000).toISOString();
                        database.updateBanderaEstado(id, 'activo', { fechaExpiracion: nuevaExp, aviso24hEnviado: false });
                    }
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

            // Estadísticas históricas
            if (endpoint === 'estadisticas') {
                const jugadores = database.getAllJugadores();
                const banderas = database.getAllBanderas();
                const sanciones = database.getAllJugadores().map(j => database.getSancion(j.discord_id)).filter(Boolean);
                const tickets = (() => { try { const Database = require('better-sqlite3'); const rawDb = new Database('./tsde.db'); const r = rawDb.prepare('SELECT tipo, COUNT(*) as total FROM tickets GROUP BY tipo').all(); rawDb.close(); return r; } catch(e) { return []; } })();

                // Registros por semana (últimas 8 semanas)
                const ahora = Date.now();
                const semanas = [];
                for (let i = 7; i >= 0; i--) {
                    const inicio = ahora - (i+1) * 7 * 86400000;
                    const fin = ahora - i * 7 * 86400000;
                    const total = jugadores.filter(j => { const f = new Date(j.fecha_registro).getTime(); return f >= inicio && f < fin; }).length;
                    const fecha = new Date(fin);
                    semanas.push({ semana: fecha.getDate() + '/' + (fecha.getMonth()+1), total });
                }

                // Banderas por estado
                const banderasPorEstado = {};
                banderas.forEach(b => { banderasPorEstado[b.estado] = (banderasPorEstado[b.estado] || 0) + 1; });

                // Tickets por tipo
                const ticketsPorTipo = {};
                tickets.forEach(t => { ticketsPorTipo[t.tipo] = t.total; });

                // Sanciones por nivel
                const sancionesPorNivel = { 1: 0, 2: 0, 3: 0, 4: 0 };
                sanciones.forEach(s => { if (s.nivel_actual > 0) sancionesPorNivel[s.nivel_actual] = (sancionesPorNivel[s.nivel_actual] || 0) + 1; });

                return responderJSON(res, 200, {
                    totalRegistrados: jugadores.length,
                    totalBanderas: banderas.length,
                    totalEventos: database.getHistorialEventos().length,
                    totalSanciones: sanciones.reduce((sum, s) => sum + (s.historial ? s.historial.length : 0), 0),
                    registrosPorSemana: semanas,
                    banderasPorEstado,
                    ticketsPorTipo,
                    sancionesPorNivel
                });
            }

            // Buscador global
            if (endpoint.startsWith('buscar')) {
                const params = new URLSearchParams(endpoint.split('?')[1] || '');
                const q = (params.get('q') || '').toLowerCase().trim();
                if (!q || q.length < 2) return responderJSON(res, 200, { resultados: [] });

                const resultados = [];

                // Buscar en jugadores
                database.getAllJugadores().forEach(j => {
                    if (j.nombre_ark.toLowerCase().includes(q) || j.discord_username.toLowerCase().includes(q)) {
                        resultados.push({ tipo: 'jugador', nombre: j.nombre_ark, subtitulo: j.discord_username, id: j.discord_id });
                    }
                });

                // Buscar en banderas blancas
                database.getAllBanderas().forEach(b => {
                    if (b.nombre_ark.toLowerCase().includes(q) || b.discord_username.toLowerCase().includes(q)) {
                        resultados.push({ tipo: 'bandera', nombre: b.nombre_ark + ' (BB)', subtitulo: b.estado, id: b.id });
                    }
                });

                // Buscar en penalizados
                database.getPenalizados().forEach(p => {
                    if (p.toLowerCase().includes(q)) {
                        resultados.push({ tipo: 'sancion', nombre: p, subtitulo: 'Penalizado', id: p });
                    }
                });

                return responderJSON(res, 200, { resultados: resultados.slice(0, 10) });
            }

            // Votaciones
            if (endpoint === 'votaciones' && req.method === 'GET') {
                const vot = database.getVotaciones();
                const polls = database.getAllPolls();
                return responderJSON(res, 200, {
                    sugerencias: vot.sugerencias_pendientes || [],
                    encuestas: polls
                });
            }

            if (endpoint === 'votaciones/aprobar' && req.method === 'POST') {
                const body = await leerBody(req);
                const vot = database.getVotaciones();
                const sugs = vot.sugerencias_pendientes || [];
                const sug = sugs.find(s => s.id === body.id);
                if (!sug) return responderJSON(res, 404, { error: 'Sugerencia no encontrada' });

                // Crear encuesta en Discord
                try {
                    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
                    const canal = await client.channels.fetch(config.canales.general);
                    const pollId = Date.now().toString();
                    const poll = {
                        id: pollId,
                        pregunta: sug.texto,
                        opciones: ['✅ Sí', '❌ No'],
                        votos: { 0: [], 1: [] },
                        autor: sug.autor,
                        cerrada: false,
                        fecha: new Date().toISOString()
                    };

                    const embed = new EmbedBuilder()
                        .setTitle('🗳️ ' + sug.texto)
                        .setColor(0x3498DB)
                        .setDescription('Sugerencia de **' + sug.autor + '**\nVota usando los botones:')
                        .setTimestamp();

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('poll_' + pollId + '_0').setLabel('✅ Sí').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId('poll_' + pollId + '_1').setLabel('❌ No').setStyle(ButtonStyle.Danger)
                    );

                    const msg = await canal.send({ embeds: [embed], components: [row] });
                    poll.mensaje_id = msg.id;
                    poll.canal_id = canal.id;
                    database.setPoll(pollId, poll);

                    // Quitar de sugerencias pendientes
                    database.setVotaciones('sugerencias_pendientes', sugs.filter(s => s.id !== body.id));
                    return responderJSON(res, 200, { ok: true });
                } catch (e) {
                    return responderJSON(res, 500, { error: e.message });
                }
            }

            if (endpoint === 'votaciones/rechazar' && req.method === 'POST') {
                const body = await leerBody(req);
                const vot = database.getVotaciones();
                const sugs = (vot.sugerencias_pendientes || []).filter(s => s.id !== body.id);
                database.setVotaciones('sugerencias_pendientes', sugs);
                return responderJSON(res, 200, { ok: true });
            }

            if (endpoint === 'votaciones/cerrar' && req.method === 'POST') {
                const body = await leerBody(req);
                const poll = database.getPoll(body.id);
                if (!poll) return responderJSON(res, 404, { error: 'Encuesta no encontrada' });
                poll.cerrada = true;
                database.setPoll(body.id, poll);
                return responderJSON(res, 200, { ok: true });
            }

            if (endpoint === 'votaciones/crear' && req.method === 'POST') {
                const body = await leerBody(req);
                try {
                    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
                    const canal = await client.channels.fetch(config.canales.general);
                    const pollId = Date.now().toString();
                    const votos = {};
                    body.opciones.forEach((_, i) => { votos[i] = []; });
                    const poll = {
                        id: pollId,
                        pregunta: body.pregunta,
                        opciones: body.opciones,
                        votos,
                        autor: 'Admin Panel',
                        cerrada: false,
                        fecha: new Date().toISOString()
                    };

                    const embed = new EmbedBuilder()
                        .setTitle('🗳️ ' + body.pregunta)
                        .setColor(0x9B59B6)
                        .setTimestamp();

                    const EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];
                    const row = new ActionRowBuilder().addComponents(
                        body.opciones.slice(0, 5).map((op, i) =>
                            new ButtonBuilder().setCustomId('poll_' + pollId + '_' + i).setLabel(EMOJIS[i] + ' ' + op).setStyle(ButtonStyle.Primary)
                        )
                    );

                    const msg = await canal.send({ embeds: [embed], components: [row] });
                    poll.mensaje_id = msg.id;
                    poll.canal_id = canal.id;
                    database.setPoll(pollId, poll);
                    return responderJSON(res, 200, { ok: true });
                } catch (e) {
                    return responderJSON(res, 500, { error: e.message });
                }
            }

            // Hall of Fame
            if (endpoint === 'halloffame' && req.method === 'GET') {
                return responderJSON(res, 200, database.getHallOfFame());
            }

            if (endpoint === 'halloffame' && req.method === 'POST') {
                const body = await leerBody(req);
                database.addHallOfFame(body);
                return responderJSON(res, 200, { ok: true });
            }

            if (endpoint.startsWith('halloffame/') && req.method === 'DELETE') {
                const id = parseInt(endpoint.slice(11));
                database.removeHallOfFame(id);
                return responderJSON(res, 200, { ok: true });
            }

            // Coliseo — gestión completa
            if (endpoint === 'coliseo' && req.method === 'GET') {
                return responderJSON(res, 200, database.getTaquillas());
            }

            if (endpoint === 'coliseo/crear' && req.method === 'POST') {
                const body = await leerBody(req);
                const { nombre, fecha, jugadores } = body;

                if (!jugadores || jugadores.length > 34) {
                    return responderJSON(res, 400, { error: 'Máximo 34 jugadores' });
                }

                // Generar pines únicos
                const pines = new Set();
                while (pines.size < jugadores.length) {
                    pines.add(String(Math.floor(1000 + Math.random() * 9000)));
                }
                const pinesArr = [...pines];

                const asignaciones = jugadores.map((jugador, i) => ({
                    taquilla: i + 1,
                    lado: i + 1 <= 17 ? 'A' : 'B',
                    jugador,
                    pin: pinesArr[i]
                }));

                const data = {
                    evento_activo: { nombre, fecha, fechaAsignacion: new Date().toLocaleDateString('es-ES') },
                    asignaciones
                };

                database.setTaquillas('evento_activo', data.evento_activo);
                database.setTaquillas('asignaciones', asignaciones);

                // Enviar DMs a jugadores
                let dmEnviados = 0;
                let dmFallidos = [];

                try {
                    const { EmbedBuilder } = require('discord.js');
                    const guild = await client.guilds.fetch(config.guildId);
                    await guild.members.fetch();

                    for (const asig of asignaciones) {
                        try {
                            const member = guild.members.cache.find(m =>
                                m.displayName === asig.jugador || m.user.username === asig.jugador
                            );
                            if (member) {
                                await member.send({
                                    embeds: [new EmbedBuilder()
                                        .setTitle('🏛️ COLISEO TSDE ARKEANOS')
                                        .setColor(0xE74C3C)
                                        .setDescription('Has sido asignado a una taquilla para el evento:\n**' + nombre + '**')
                                        .addFields(
                                            { name: '🔢 Tu taquilla', value: 'Nº ' + String(asig.taquilla).padStart(2,'0') + ' (Lado ' + asig.lado + ')', inline: true },
                                            { name: '🔑 Tu PIN', value: '**' + asig.pin + '**', inline: true },
                                            { name: '⚠️ Importante', value: 'Guarda este PIN. No lo compartas con nadie.', inline: false }
                                        )
                                        .setFooter({ text: 'Evento: ' + fecha })
                                    ]
                                });
                                dmEnviados++;
                            } else {
                                dmFallidos.push(asig.jugador);
                            }
                        } catch (e) {
                            dmFallidos.push(asig.jugador);
                        }
                    }
                } catch (e) {
                    console.error('[COLISEO] Error enviando DMs:', e.message);
                }

                return responderJSON(res, 200, { ok: true, dmEnviados, dmFallidos });
            }

            if (endpoint === 'coliseo/resetear' && req.method === 'POST') {
                database.setTaquillas('evento_activo', null);
                database.setTaquillas('asignaciones', []);
                return responderJSON(res, 200, { ok: true });
            }

            if (endpoint === 'coliseo/pin' && req.method === 'POST') {
                const body = await leerBody(req);
                const data = database.getTaquillas();
                const asig = (data.asignaciones || []).find(a => a.taquilla === body.taquilla);
                if (!asig) return responderJSON(res, 404, { error: 'Taquilla no encontrada' });
                asig.pin = body.pin;
                database.setTaquillas('asignaciones', data.asignaciones);
                return responderJSON(res, 200, { ok: true });
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

            // Laberinto resultado → publicar en Discord
            if (endpoint === 'laberinto-resultado' && req.method === 'POST') {
                const body = await leerBody(req);
                try {
                    const { EmbedBuilder } = require('discord.js');
                    const canalEventos = await client.channels.fetch(config.canales.eventos);
                    const medallas = ['🥇', '🥈', '🥉'];
                    const modos = { speed: '⚡ Speed', tribu: '🛡️ Tribu', survival: '💀 Survival' };

                    const embed = new EmbedBuilder()
                        .setTitle(`🌀 Resultados del Laberinto TSDE — ${modos[body.modo] || body.modo}`)
                        .setColor(0x4CAF50)
                        .setDescription(
                            body.ranking.map((r, i) =>
                                `${medallas[i] || `**${i+1}.**`} **${r.jugador}** — \`${r.tiempoStr}\``
                            ).join('\n')
                        )
                        .addFields({
                            name: '🏆 Premios',
                            value: `🥇 ${body.premios.p1} GC · 🥈 ${body.premios.p2} GC · 🥉 ${body.premios.p3} GC\n👥 Participación: ${body.premios.pp} GC`
                        })
                        .setTimestamp();

                    await canalEventos.send({ embeds: [embed] });
                    return responderJSON(res, 200, { ok: true });
                } catch (e) {
                    return responderJSON(res, 500, { error: e.message });
                }
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

    server.setMaxListeners(20);

    server.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            console.warn(`[ADM] Puerto ${ADMIN_PORT} en uso, reintentando en 5s...`);
            setTimeout(() => {
                server.listen(ADMIN_PORT, () => {
                    console.log(`[ADM] Panel de admin activo en puerto ${ADMIN_PORT}`);
                });
            }, 5000);
        } else {
            console.error('[ADM] Error servidor admin:', err.message);
        }
    });

    process.on('SIGINT', () => { server.close(); process.exit(0); });
    process.on('SIGTERM', () => { server.close(); process.exit(0); });

    server.listen(ADMIN_PORT, () => {
        console.log(`[ADM] Panel de admin activo en puerto ${ADMIN_PORT}`);
    });
}

module.exports = { iniciarAdminPanel };
