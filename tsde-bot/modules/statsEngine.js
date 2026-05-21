const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const config = require('../config.json');

const DB_PATH = './database.json';

function cargarDB() {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function guardarDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// --- CALCULAR ESTADÍSTICAS ---

async function calcularStats(guild) {
    const db = cargarDB();

    // Miembros
    await guild.members.fetch();
    const totalMiembros = guild.memberCount;
    const online = guild.members.cache.filter(m =>
        m.presence?.status === 'online' ||
        m.presence?.status === 'idle' ||
        m.presence?.status === 'dnd'
    ).size;

    // Datos del historial
    const historial = db.historial_eventos || [];
    const eventosCelebrados = historial.length;
    const torneos = historial.filter(e => e.campeon).length;

    // Records del laberinto
    const recordsLaberinto = (db.laberinto?.resultados || []).filter(r => r.completado).length;

    // Mejor tiempo del laberinto
    const tiempos = (db.laberinto?.resultados || [])
        .filter(r => r.completado)
        .sort((a, b) => a.tiempo_ms - b.tiempo_ms);

    const mejorTiempo = tiempos.length > 0
        ? formatearTiempo(tiempos[0].tiempo_ms) + ` (${tiempos[0].jugador})`
        : 'Sin record aún';

    // Eventos activos
    const eventosActivos = Object.keys(db.eventos_activos || {}).length;

    // Penalizados
    const penalizados = (db.penalizados || []).length;

    return {
        totalMiembros,
        online,
        eventosCelebrados,
        torneos,
        recordsLaberinto,
        mejorTiempo,
        eventosActivos,
        penalizados
    };
}

function formatearTiempo(ms) {
    const mins = Math.floor(ms / 60000);
    const segs = Math.floor((ms % 60000) / 1000);
    const decimas = Math.floor((ms % 1000) / 100);
    return `${String(mins).padStart(2, '0')}:${String(segs).padStart(2, '0')}.${decimas}`;
}

function construirEmbedStats(stats) {
    const ahora = new Date();
    const hora = ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const fecha = ahora.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

    return new EmbedBuilder()
        .setTitle('📊 Estadísticas de TSDE Arkeanos')
        .setColor(0x3498DB)
        .addFields(
            {
                name: '👥 Comunidad',
                value: [
                    `**Miembros totales:** ${stats.totalMiembros}`,
                    `**Online ahora:** ${stats.online}`,
                    `**Penalizados:** ${stats.penalizados}`
                ].join('\n'),
                inline: true
            },
            {
                name: '🎉 Eventos',
                value: [
                    `**Celebrados:** ${stats.eventosCelebrados}`,
                    `**Torneos jugados:** ${stats.torneos}`,
                    `**Activos ahora:** ${stats.eventosActivos}`
                ].join('\n'),
                inline: true
            },
            {
                name: '🌀 Laberinto',
                value: [
                    `**Runs completados:** ${stats.recordsLaberinto}`,
                    `**Mejor tiempo:** ${stats.mejorTiempo}`
                ].join('\n'),
                inline: false
            }
        )
        .setFooter({ text: `Actualizado el ${fecha} a las ${hora} · Se actualiza cada hora` });
}

// --- INICIAR ACTUALIZACIÓN AUTOMÁTICA ---

let mensajeStatsId = null;
let intervalo = null;

async function iniciarStats(client) {
    if (!config.canales.estadisticas) {
        console.warn('[STATS] Canal de estadísticas no configurado en config.json');
        return;
    }

    try {
        const canal = await client.channels.fetch(config.canales.estadisticas);
        const guild = canal.guild;

        // Buscar mensaje existente o crear uno nuevo
        const mensajes = await canal.messages.fetch({ limit: 10 });
        const mensajeExistente = mensajes.find(m => m.author.id === client.user.id);

        const stats = await calcularStats(guild);
        const embed = construirEmbedStats(stats);

        if (mensajeExistente) {
            await mensajeExistente.edit({ embeds: [embed] });
            mensajeStatsId = mensajeExistente.id;
        } else {
            const msg = await canal.send({ embeds: [embed] });
            mensajeStatsId = msg.id;
        }

        console.log('[STATS] Panel de estadísticas iniciado');

        // Actualizar cada hora
        if (intervalo) clearInterval(intervalo);
        intervalo = setInterval(async () => {
            try {
                const statsActualizadas = await calcularStats(guild);
                const embedActualizado = construirEmbedStats(statsActualizadas);
                const msg = await canal.messages.fetch(mensajeStatsId);
                await msg.edit({ embeds: [embedActualizado] });
                console.log('[STATS] Estadísticas actualizadas');
            } catch (e) {
                console.error('[STATS] Error actualizando:', e.message);
            }
        }, 60 * 60 * 1000); // cada hora

    } catch (error) {
        console.error('[STATS] Error iniciando stats:', error.message);
    }
}

module.exports = { iniciarStats };
