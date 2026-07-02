/**
 * Script de migración: database.json → tsde.db (SQLite)
 * Ejecutar UNA SOLA VEZ: node migrate.js
 */

const fs = require('fs');
const db = require('./db.js');

console.log('🔄 Iniciando migración JSON → SQLite...');

// Conectar y crear tablas
db.conectar();

// Cargar JSON
const data = JSON.parse(fs.readFileSync('./database.json', 'utf8'));

let migrados = 0;

// ── JUGADORES ──
const jugadores = data.jugadores || {};
for (const [id, j] of Object.entries(jugadores)) {
    db.setJugador({
        discordId: j.discordId,
        discordUsername: j.discordUsername,
        nombreArk: j.nombreArk,
        nombrePersonaje: j.nombrePersonaje || null,
        nombreTribu: j.nombreTribu || null,
        fechaRegistro: j.fechaRegistro
    });
    migrados++;
}
console.log(`✅ Jugadores: ${migrados}`);

// ── PENALIZADOS ──
migrados = 0;
for (const nombre of (data.penalizados || [])) {
    db.addPenalizado(nombre);
    migrados++;
}
console.log(`✅ Penalizados: ${migrados}`);

// ── SANCIONES ──
migrados = 0;
for (const [id, s] of Object.entries(data.sanciones || {})) {
    db.setSancion({
        discordId: s.discordId || id,
        discordUsername: s.discordUsername || 'desconocido',
        nivelActual: s.nivelActual || 0,
        historial: s.historial || []
    });
    migrados++;
}
console.log(`✅ Sanciones: ${migrados}`);

// ── ADVERTENCIAS ──
migrados = 0;
for (const a of (data.advertencias || [])) {
    db.addAdvertencia({
        jugadorId: a.jugadorId,
        jugadorUsername: a.jugadorUsername,
        motivo: a.motivo,
        adminId: a.adminId,
        adminUsername: a.adminUsername,
        nivel: a.nivel || 1,
        fecha: a.fecha
    });
    migrados++;
}
console.log(`✅ Advertencias: ${migrados}`);

// ── BANDERA BLANCA ──
migrados = 0;
for (const [id, b] of Object.entries(data.bandera_blanca || {})) {
    db.setBandera({
        id: b.id,
        discordId: b.discordId,
        discordUsername: b.discordUsername,
        nombreArk: b.nombreArk,
        nombreTribu: b.nombreTribu || null,
        estado: b.estado,
        fechaSolicitud: b.fechaSolicitud,
        fechaActivacion: b.fechaActivacion || null,
        fechaExpiracion: b.fechaExpiracion || null,
        canalId: b.canalId || null,
        motivoDenegacion: b.motivoDenegacion || null,
        aviso24hEnviado: b.aviso24hEnviado || false
    });
    migrados++;
}
console.log(`✅ Banderas Blancas: ${migrados}`);

// ── INCUBADORAS ──
migrados = 0;
const incubadoras = data.incubadoras || [
    { id: 1, pin: '0000', estado: 'libre' },
    { id: 2, pin: '0000', estado: 'libre' },
    { id: 3, pin: '0000', estado: 'libre' },
    { id: 4, pin: '0000', estado: 'libre' }
];

// Insertar incubadoras si no existen
const Database = require('better-sqlite3');
const rawDb = new Database('./tsde.db');
for (const inc of incubadoras) {
    rawDb.prepare('INSERT OR IGNORE INTO incubadoras (id, pin, estado) VALUES (?, ?, ?)').run(inc.id, inc.pin, inc.estado);
    migrados++;
}
rawDb.close();
console.log(`✅ Incubadoras: ${migrados}`);

// ── POLLS ──
migrados = 0;
for (const [id, p] of Object.entries(data.polls || {})) {
    db.setPoll(id, p);
    migrados++;
}
console.log(`✅ Polls: ${migrados}`);

// ── LABERINTO ──
const lab = data.laberinto || { evento_activo: null, resultados: [], equipos: [] };
db.setLaberinto('evento_activo', lab.evento_activo);
db.setLaberinto('resultados', lab.resultados || []);
db.setLaberinto('equipos', lab.equipos || []);
console.log(`✅ Laberinto migrado`);

// ── VOTACIONES ──
const vot = data.votaciones || { sugerencias_pendientes: [], votos: {} };
db.setVotaciones('sugerencias_pendientes', vot.sugerencias_pendientes || []);
db.setVotaciones('votos', vot.votos || {});
console.log(`✅ Votaciones migradas`);

// ── MERCADERES ──
migrados = 0;
for (const [id, m] of Object.entries(data.mercaderes || {})) {
    db.setMercader(id, m);
    migrados++;
}
console.log(`✅ Mercaderes: ${migrados}`);

// ── HALL OF FAME ──
migrados = 0;
for (const entrada of (data.hall_of_fame || [])) {
    db.addHallOfFame(entrada);
    migrados++;
}
console.log(`✅ Hall of Fame: ${migrados}`);

// ── HISTORIAL EVENTOS ──
migrados = 0;
for (const evento of (data.historial_eventos || [])) {
    db.addHistorialEvento(evento);
    migrados++;
}
console.log(`✅ Historial eventos: ${migrados}`);

// ── REPORTES ──
migrados = 0;
for (const r of (data.reportes || [])) {
    db.addReporte({
        reportadoPor: r.reportadoPor,
        jugadorReportado: r.jugadorReportado,
        motivo: r.motivo,
        pruebas: r.pruebas || null,
        fecha: r.fecha
    });
    migrados++;
}
console.log(`✅ Reportes: ${migrados}`);

console.log('\n✅ Migración completada. Base de datos SQLite lista en tsde.db');
console.log('💡 Verifica que todo esté correcto antes de eliminar database.json');
