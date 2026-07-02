const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_FILE = path.join(__dirname, 'tsde.db');
let db;

function conectar() {
    db = new Database(DB_FILE);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    crearTablas();
    console.log('[DB] SQLite conectado correctamente');
    return db;
}

function crearTablas() {
    db.exec(`
        CREATE TABLE IF NOT EXISTS jugadores (
            discord_id TEXT PRIMARY KEY,
            discord_username TEXT NOT NULL,
            nombre_ark TEXT NOT NULL,
            nombre_personaje TEXT,
            nombre_tribu TEXT,
            fecha_registro TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS eventos_activos (
            id TEXT PRIMARY KEY,
            datos TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS torneos_activos (
            id TEXT PRIMARY KEY,
            datos TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS historial_eventos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            datos TEXT NOT NULL,
            fecha TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS penalizados (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            nombre TEXT NOT NULL UNIQUE
        );

        CREATE TABLE IF NOT EXISTS sanciones (
            discord_id TEXT PRIMARY KEY,
            discord_username TEXT NOT NULL,
            nivel_actual INTEGER DEFAULT 0,
            historial TEXT NOT NULL DEFAULT '[]'
        );

        CREATE TABLE IF NOT EXISTS advertencias (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            jugador_id TEXT NOT NULL,
            jugador_username TEXT NOT NULL,
            motivo TEXT NOT NULL,
            admin_id TEXT NOT NULL,
            admin_username TEXT NOT NULL,
            nivel INTEGER DEFAULT 1,
            fecha TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS laberinto (
            clave TEXT PRIMARY KEY,
            valor TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS votaciones (
            clave TEXT PRIMARY KEY,
            valor TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS polls (
            id TEXT PRIMARY KEY,
            datos TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS mercado (
            clave TEXT PRIMARY KEY,
            valor TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS mercaderes (
            discord_id TEXT PRIMARY KEY,
            datos TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS hall_of_fame (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            datos TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS bandera_blanca (
            id TEXT PRIMARY KEY,
            discord_id TEXT NOT NULL,
            discord_username TEXT NOT NULL,
            nombre_ark TEXT NOT NULL,
            nombre_tribu TEXT,
            estado TEXT NOT NULL DEFAULT 'pendiente',
            fecha_solicitud TEXT NOT NULL,
            fecha_activacion TEXT,
            fecha_expiracion TEXT,
            canal_id TEXT,
            motivo_denegacion TEXT,
            aviso_24h_enviado INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS tickets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            tipo TEXT NOT NULL,
            discord_id TEXT NOT NULL,
            discord_username TEXT NOT NULL,
            datos TEXT NOT NULL,
            estado TEXT DEFAULT 'abierto',
            canal_id TEXT,
            fecha TEXT NOT NULL,
            fecha_cierre TEXT
        );

        CREATE TABLE IF NOT EXISTS incubadoras (
            id INTEGER PRIMARY KEY,
            pin TEXT NOT NULL,
            estado TEXT DEFAULT 'libre',
            ocupada_por TEXT
        );

        CREATE TABLE IF NOT EXISTS reportes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            reportado_por TEXT NOT NULL,
            jugador_reportado TEXT NOT NULL,
            motivo TEXT NOT NULL,
            pruebas TEXT,
            estado TEXT DEFAULT 'pendiente',
            fecha TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS jugadores_online (
            nombre TEXT PRIMARY KEY
        );

        CREATE TABLE IF NOT EXISTS mercado_anuncios (
            id TEXT PRIMARY KEY,
            datos TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS taquillas (
            clave TEXT PRIMARY KEY,
            valor TEXT NOT NULL
        );
    `);
}

// ─────────────────────────────────────────────
// JUGADORES
// ─────────────────────────────────────────────

function getJugador(discordId) {
    return db.prepare('SELECT * FROM jugadores WHERE discord_id = ?').get(discordId);
}

function getJugadorPorArk(nombreArk) {
    return db.prepare('SELECT * FROM jugadores WHERE LOWER(nombre_ark) = LOWER(?)').get(nombreArk);
}

function getAllJugadores() {
    return db.prepare('SELECT * FROM jugadores').all();
}

function setJugador(jugador) {
    return db.prepare(`
        INSERT OR REPLACE INTO jugadores 
        (discord_id, discord_username, nombre_ark, nombre_personaje, nombre_tribu, fecha_registro)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(
        jugador.discordId,
        jugador.discordUsername,
        jugador.nombreArk,
        jugador.nombrePersonaje || null,
        jugador.nombreTribu || null,
        jugador.fechaRegistro
    );
}

function countJugadores() {
    return db.prepare('SELECT COUNT(*) as total FROM jugadores').get().total;
}

// ─────────────────────────────────────────────
// PENALIZADOS
// ─────────────────────────────────────────────

function getPenalizados() {
    return db.prepare('SELECT nombre FROM penalizados').all().map(r => r.nombre);
}

function addPenalizado(nombre) {
    return db.prepare('INSERT OR IGNORE INTO penalizados (nombre) VALUES (?)').run(nombre);
}

function removePenalizado(nombre) {
    return db.prepare('DELETE FROM penalizados WHERE nombre = ?').run(nombre);
}

// ─────────────────────────────────────────────
// SANCIONES
// ─────────────────────────────────────────────

function getSancion(discordId) {
    const row = db.prepare('SELECT * FROM sanciones WHERE discord_id = ?').get(discordId);
    if (!row) return null;
    return { ...row, historial: JSON.parse(row.historial) };
}

function setSancion(sancion) {
    return db.prepare(`
        INSERT OR REPLACE INTO sanciones (discord_id, discord_username, nivel_actual, historial)
        VALUES (?, ?, ?, ?)
    `).run(sancion.discordId, sancion.discordUsername, sancion.nivelActual, JSON.stringify(sancion.historial));
}

// ─────────────────────────────────────────────
// ADVERTENCIAS
// ─────────────────────────────────────────────

function getAdvertencias(discordId) {
    return db.prepare('SELECT * FROM advertencias WHERE jugador_id = ? ORDER BY fecha DESC').all(discordId);
}

function addAdvertencia(adv) {
    return db.prepare(`
        INSERT INTO advertencias (jugador_id, jugador_username, motivo, admin_id, admin_username, nivel, fecha)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(adv.jugadorId, adv.jugadorUsername, adv.motivo, adv.adminId, adv.adminUsername, adv.nivel || 1, adv.fecha);
}

// ─────────────────────────────────────────────
// BANDERA BLANCA
// ─────────────────────────────────────────────

function getBandera(id) {
    return db.prepare('SELECT * FROM bandera_blanca WHERE id = ?').get(id);
}

function getBanderasPorUsuario(discordId) {
    return db.prepare('SELECT * FROM bandera_blanca WHERE discord_id = ?').all(discordId);
}

function getAllBanderas() {
    return db.prepare('SELECT * FROM bandera_blanca').all();
}

function setBandera(b) {
    return db.prepare(`
        INSERT OR REPLACE INTO bandera_blanca
        (id, discord_id, discord_username, nombre_ark, nombre_tribu, estado,
         fecha_solicitud, fecha_activacion, fecha_expiracion, canal_id,
         motivo_denegacion, aviso_24h_enviado)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        b.id, b.discordId, b.discordUsername, b.nombreArk,
        b.nombreTribu || null, b.estado,
        b.fechaSolicitud, b.fechaActivacion || null,
        b.fechaExpiracion || null, b.canalId || null,
        b.motivoDenegacion || null, b.aviso24hEnviado ? 1 : 0
    );
}

function updateBanderaEstado(id, estado, extra = {}) {
    const campos = ['estado = ?'];
    const valores = [estado];
    if (extra.fechaActivacion !== undefined) { campos.push('fecha_activacion = ?'); valores.push(extra.fechaActivacion); }
    if (extra.fechaExpiracion !== undefined) { campos.push('fecha_expiracion = ?'); valores.push(extra.fechaExpiracion); }
    if (extra.motivoDenegacion !== undefined) { campos.push('motivo_denegacion = ?'); valores.push(extra.motivoDenegacion); }
    if (extra.aviso24hEnviado !== undefined) { campos.push('aviso_24h_enviado = ?'); valores.push(extra.aviso24hEnviado ? 1 : 0); }
    if (extra.canalId !== undefined) { campos.push('canal_id = ?'); valores.push(extra.canalId); }
    valores.push(id);
    return db.prepare(`UPDATE bandera_blanca SET ${campos.join(', ')} WHERE id = ?`).run(...valores);
}

// ─────────────────────────────────────────────
// INCUBADORAS
// ─────────────────────────────────────────────

function getIncubadoras() {
    return db.prepare('SELECT * FROM incubadoras ORDER BY id').all();
}

function getIncubadoraLibre() {
    return db.prepare("SELECT * FROM incubadoras WHERE estado = 'libre' LIMIT 1").get();
}

function updateIncubadora(id, estado, pin = null, ocupadaPor = null) {
    if (pin !== null) {
        return db.prepare('UPDATE incubadoras SET estado = ?, pin = ?, ocupada_por = ? WHERE id = ?').run(estado, pin, ocupadaPor, id);
    }
    return db.prepare('UPDATE incubadoras SET estado = ?, ocupada_por = ? WHERE id = ?').run(estado, ocupadaPor, id);
}

// ─────────────────────────────────────────────
// TICKETS
// ─────────────────────────────────────────────

function addTicket(ticket) {
    return db.prepare(`
        INSERT INTO tickets (tipo, discord_id, discord_username, datos, estado, canal_id, fecha)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(ticket.tipo, ticket.discordId, ticket.discordUsername,
        JSON.stringify(ticket.datos), ticket.estado || 'abierto',
        ticket.canalId || null, ticket.fecha);
}

function countTicketsCerrados() {
    return db.prepare("SELECT COUNT(*) as total FROM tickets WHERE estado = 'cerrado'").get().total;
}

function countReportesPendientes() {
    return db.prepare("SELECT COUNT(*) as total FROM reportes WHERE estado = 'pendiente'").get().total;
}

// ─────────────────────────────────────────────
// REPORTES
// ─────────────────────────────────────────────

function addReporte(reporte) {
    return db.prepare(`
        INSERT INTO reportes (reportado_por, jugador_reportado, motivo, pruebas, estado, fecha)
        VALUES (?, ?, ?, ?, ?, ?)
    `).run(reporte.reportadoPor, reporte.jugadorReportado, reporte.motivo,
        reporte.pruebas || null, 'pendiente', reporte.fecha);
}

// ─────────────────────────────────────────────
// POLLS
// ─────────────────────────────────────────────

function getPoll(id) {
    const row = db.prepare('SELECT * FROM polls WHERE id = ?').get(id);
    return row ? JSON.parse(row.datos) : null;
}

function setPoll(id, datos) {
    return db.prepare('INSERT OR REPLACE INTO polls (id, datos) VALUES (?, ?)').run(id, JSON.stringify(datos));
}

function getAllPolls() {
    return db.prepare('SELECT * FROM polls').all().map(r => JSON.parse(r.datos));
}

// ─────────────────────────────────────────────
// LABERINTO
// ─────────────────────────────────────────────

function getLaberinto() {
    const rows = db.prepare('SELECT * FROM laberinto').all();
    const result = { evento_activo: null, resultados: [], equipos: [] };
    rows.forEach(r => { try { result[r.clave] = JSON.parse(r.valor); } catch(e) {} });
    return result;
}

function setLaberinto(clave, valor) {
    return db.prepare('INSERT OR REPLACE INTO laberinto (clave, valor) VALUES (?, ?)').run(clave, JSON.stringify(valor));
}

// ─────────────────────────────────────────────
// VOTACIONES
// ─────────────────────────────────────────────

function getVotaciones() {
    const rows = db.prepare('SELECT * FROM votaciones').all();
    const result = { sugerencias_pendientes: [], votos: {} };
    rows.forEach(r => { try { result[r.clave] = JSON.parse(r.valor); } catch(e) {} });
    return result;
}

function setVotaciones(clave, valor) {
    return db.prepare('INSERT OR REPLACE INTO votaciones (clave, valor) VALUES (?, ?)').run(clave, JSON.stringify(valor));
}

// ─────────────────────────────────────────────
// MERCADERES
// ─────────────────────────────────────────────

function getMercader(discordId) {
    const row = db.prepare('SELECT * FROM mercaderes WHERE discord_id = ?').get(discordId);
    return row ? JSON.parse(row.datos) : null;
}

function setMercader(discordId, datos) {
    return db.prepare('INSERT OR REPLACE INTO mercaderes (discord_id, datos) VALUES (?, ?)').run(discordId, JSON.stringify(datos));
}

function removeMercader(discordId) {
    return db.prepare('DELETE FROM mercaderes WHERE discord_id = ?').run(discordId);
}

function countMercaderes() {
    return db.prepare('SELECT COUNT(*) as total FROM mercaderes').get().total;
}

function getAllMercaderes() {
    return db.prepare('SELECT * FROM mercaderes').all().map(r => ({ discord_id: r.discord_id, ...JSON.parse(r.datos) }));
}

// ─────────────────────────────────────────────
// HALL OF FAME
// ─────────────────────────────────────────────

function getHallOfFame() {
    return db.prepare('SELECT * FROM hall_of_fame ORDER BY id').all().map(r => JSON.parse(r.datos));
}

function addHallOfFame(datos) {
    return db.prepare('INSERT INTO hall_of_fame (datos) VALUES (?)').run(JSON.stringify(datos));
}

function removeHallOfFame(id) {
    return db.prepare('DELETE FROM hall_of_fame WHERE id = ?').run(id);
}

// ─────────────────────────────────────────────
// HISTORIAL EVENTOS
// ─────────────────────────────────────────────

function getHistorialEventos() {
    return db.prepare('SELECT * FROM historial_eventos ORDER BY id').all().map(r => JSON.parse(r.datos));
}

function addHistorialEvento(datos) {
    return db.prepare('INSERT INTO historial_eventos (datos, fecha) VALUES (?, ?)').run(JSON.stringify(datos), new Date().toISOString());
}

// ─────────────────────────────────────────────
// EVENTOS Y TORNEOS ACTIVOS
// ─────────────────────────────────────────────

function getEventosActivos() {
    const rows = db.prepare('SELECT * FROM eventos_activos').all();
    const result = {};
    rows.forEach(r => { result[r.id] = JSON.parse(r.datos); });
    return result;
}

function setEventoActivo(id, datos) {
    return db.prepare('INSERT OR REPLACE INTO eventos_activos (id, datos) VALUES (?, ?)').run(id, JSON.stringify(datos));
}

function removeEventoActivo(id) {
    return db.prepare('DELETE FROM eventos_activos WHERE id = ?').run(id);
}

function getTorneosActivos() {
    const rows = db.prepare('SELECT * FROM torneos_activos').all();
    const result = {};
    rows.forEach(r => { result[r.id] = JSON.parse(r.datos); });
    return result;
}

function setTorneoActivo(id, datos) {
    return db.prepare('INSERT OR REPLACE INTO torneos_activos (id, datos) VALUES (?, ?)').run(id, JSON.stringify(datos));
}

function removeTorneoActivo(id) {
    return db.prepare('DELETE FROM torneos_activos WHERE id = ?').run(id);
}

// ─────────────────────────────────────────────
// JUGADORES ONLINE (cache RCON)
// ─────────────────────────────────────────────

function setJugadoresOnline(nombres) {
    const tx = db.transaction(() => {
        db.prepare('DELETE FROM jugadores_online').run();
        for (const nombre of nombres) {
            db.prepare('INSERT OR IGNORE INTO jugadores_online (nombre) VALUES (?)').run(nombre);
        }
    });
    tx();
}

function getJugadoresOnline() {
    return db.prepare('SELECT nombre FROM jugadores_online').all().map(r => r.nombre);
}

function countJugadoresOnline() {
    return db.prepare('SELECT COUNT(*) as total FROM jugadores_online').get().total;
}

// ─────────────────────────────────────────────
// TAQUILLAS (Coliseo)
// ─────────────────────────────────────────────

function getTaquillas() {
    const rows = db.prepare('SELECT * FROM taquillas').all();
    const result = { evento_activo: null, asignaciones: [] };
    rows.forEach(r => { try { result[r.clave] = JSON.parse(r.valor); } catch(e) {} });
    return result;
}

function setTaquillas(clave, valor) {
    return db.prepare('INSERT OR REPLACE INTO taquillas (clave, valor) VALUES (?, ?)').run(clave, JSON.stringify(valor));
}

// ─────────────────────────────────────────────
// MERCADO ANUNCIOS
// ─────────────────────────────────────────────

function getMercadoAnuncio(id) {
    const row = db.prepare('SELECT * FROM mercado_anuncios WHERE id = ?').get(id);
    return row ? JSON.parse(row.datos) : null;
}

function setMercadoAnuncio(id, datos) {
    return db.prepare('INSERT OR REPLACE INTO mercado_anuncios (id, datos) VALUES (?, ?)').run(id, JSON.stringify(datos));
}

function removeMercadoAnuncio(id) {
    return db.prepare('DELETE FROM mercado_anuncios WHERE id = ?').run(id);
}

function getMercadoAnunciosPorMercader(discordId) {
    return db.prepare('SELECT * FROM mercado_anuncios').all()
        .map(r => JSON.parse(r.datos))
        .filter(a => a.discordId === discordId);
}

module.exports = {
    conectar,
    // Jugadores
    getJugador, getJugadorPorArk, getAllJugadores, setJugador, countJugadores,
    // Penalizados
    getPenalizados, addPenalizado, removePenalizado,
    // Sanciones
    getSancion, setSancion,
    // Advertencias
    getAdvertencias, addAdvertencia,
    // Bandera Blanca
    getBandera, getBanderasPorUsuario, getAllBanderas, setBandera, updateBanderaEstado,
    // Incubadoras
    getIncubadoras, getIncubadoraLibre, updateIncubadora,
    // Tickets
    addTicket, countTicketsCerrados, countReportesPendientes,
    // Reportes
    addReporte,
    // Polls
    getPoll, setPoll, getAllPolls,
    // Laberinto
    getLaberinto, setLaberinto,
    // Votaciones
    getVotaciones, setVotaciones,
    // Mercaderes
    getMercader, setMercader, removeMercader, countMercaderes, getAllMercaderes,
    // Hall of Fame
    getHallOfFame, addHallOfFame, removeHallOfFame,
    // Historial eventos
    getHistorialEventos, addHistorialEvento,
    // Eventos/Torneos activos
    getEventosActivos, setEventoActivo, removeEventoActivo,
    getTorneosActivos, setTorneoActivo, removeTorneoActivo,
    // Taquillas
    getTaquillas, setTaquillas,
    // Mercado anuncios
    getMercadoAnuncio, setMercadoAnuncio, removeMercadoAnuncio, getMercadoAnunciosPorMercader,
    // Jugadores online
    setJugadoresOnline, getJugadoresOnline, countJugadoresOnline
};
