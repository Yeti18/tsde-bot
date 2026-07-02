const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');
const database = require('../db.js');

function cargarDB() {
    // Compatibilidad — statsEngine solo lee datos
    return {
        historial_eventos: database.getHistorialEventos(),
        laberinto: database.getLaberinto(),
        eventos_activos: database.getEventosActivos(),
        penalizados: database.getPenalizados(),
        advertencias: database.getAdvertencias ? [] : [],
        mercaderes: {},
        bandera_blanca: {},
        tickets: { historial: [] },
        reportes: [],
        jugadores_online: database.getJugadoresOnline()
    };
}

// --- CALCULAR ESTADÍSTICAS ---

async function calcularStats(guild) {
    // Miembros Discord
    await guild.members.fetch();
    const totalMiembros = guild.memberCount;
    const online = guild.members.cache.filter(m =>
        m.presence?.status === 'online' ||
        m.presence?.status === 'idle' ||
        m.presence?.status === 'dnd'
    ).size;

    const jugadoresRegistrados = database.countJugadores();
    const historial = database.getHistorialEventos();
    const eventosCelebrados = historial.length;
    const torneos = historial.filter(e => e.campeon).length;
    const lab = database.getLaberinto();
    const recordsLaberinto = (lab.resultados || []).filter(r => r.completado).length;
    const tiempos = (lab.resultados || []).filter(r => r.completado).sort((a, b) => a.tiempo_ms - b.tiempo_ms);
    const mejorTiempo = tiempos.length > 0 ? formatearTiempo(tiempos[0].tiempo_ms) + ` (${tiempos[0].jugador})` : 'Sin récord aún';
    const eventosActivos = Object.keys(database.getEventosActivos()).length;
    const penalizados = database.getPenalizados().length;
    const advertencias = 0; // Se calcula globalmente
    const historialTickets = database.countTicketsCerrados();
    const reportesPendientes = database.countReportesPendientes();
    const mercaderes = database.countMercaderes();
    const todasBanderas = database.getAllBanderas();
    const banderasActivas = todasBanderas.filter(b => b.estado === 'activo').length;
    const banderasTotal = todasBanderas.filter(b => b.estado !== 'pendiente').length;
    const jugadoresOnlineJuego = database.countJugadoresOnline();

    return {
        totalMiembros, online, jugadoresRegistrados,
        eventosCelebrados, torneos, recordsLaberinto, mejorTiempo, eventosActivos,
        penalizados, advertencias, historialTickets, reportesPendientes,
        mercaderes, banderasActivas, banderasTotal, jugadoresOnlineJuego
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
                    `**Miembros en Discord:** ${stats.totalMiembros}`,
                    `**Online en Discord:** ${stats.online}`,
                    `**Registrados en el servidor:** ${stats.jugadoresRegistrados}`,
                    `**Jugando ahora:** ${stats.jugadoresOnlineJuego}`
                ].join('\n'),
                inline: true
            },
            {
                name: '🛒 Mercado',
                value: [
                    `**Mercaderes activos:** ${stats.mercaderes}`,
                    `**Banderas Blancas activas:** ${stats.banderasActivas}`,
                    `**Banderas concedidas (total):** ${stats.banderasTotal}`
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
                inline: true
            },
            {
                name: '🎫 Soporte',
                value: [
                    `**Tickets resueltos:** ${stats.historialTickets}`,
                    `**Reportes pendientes:** ${stats.reportesPendientes}`
                ].join('\n'),
                inline: true
            },
            {
                name: '⚠️ Moderación',
                value: [
                    `**Penalizados:** ${stats.penalizados}`,
                    `**Advertencias emitidas:** ${stats.advertencias}`
                ].join('\n'),
                inline: true
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

        // Actualizar cada hora — auto-recupera si el mensaje fue borrado
        if (intervalo) clearInterval(intervalo);
        intervalo = setInterval(async () => {
            try {
                const statsActualizadas = await calcularStats(guild);
                const embedActualizado = construirEmbedStats(statsActualizadas);

                try {
                    const msg = await canal.messages.fetch(mensajeStatsId);
                    await msg.edit({ embeds: [embedActualizado] });
                } catch (errFetch) {
                    // El mensaje ya no existe — buscar otro del bot o crear uno nuevo
                    console.warn('[STATS] Mensaje original no encontrado, recreando...');
                    const mensajesRecientes = await canal.messages.fetch({ limit: 10 });
                    const otroExistente = mensajesRecientes.find(m => m.author.id === client.user.id);

                    if (otroExistente) {
                        await otroExistente.edit({ embeds: [embedActualizado] });
                        mensajeStatsId = otroExistente.id;
                    } else {
                        const nuevoMsg = await canal.send({ embeds: [embedActualizado] });
                        mensajeStatsId = nuevoMsg.id;
                    }
                }

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
