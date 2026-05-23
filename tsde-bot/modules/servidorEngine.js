const { EmbedBuilder } = require('discord.js');
const { Rcon } = require('rcon-client');
const config = require('../config.json');

let mensajeEstadoId = null;
let mensajeJugadoresId = null;
let intervalo = null;

// --- RCON ---

async function consultarServidor() {
    if (!config.rcon.ip || !config.rcon.password) return null;

    try {
        const rcon = new Rcon({
            host: config.rcon.ip,
            port: config.rcon.port,
            password: config.rcon.password,
            timeout: 5000
        });

        await rcon.connect();
        const respuesta = await rcon.send('listplayers');
        const uptime = await rcon.send('getgamelog');
        await rcon.end();

        return { online: true, jugadores: parsearJugadores(respuesta) };

    } catch (error) {
        console.log(`[SRV] Servidor no responde: ${error.message}`);
        return { online: false, jugadores: [] };
    }
}

function parsearJugadores(respuesta) {
    if (!respuesta || respuesta.includes('No Players')) return [];

    const lineas = respuesta.split('\n').filter(l => l.trim().length > 0);
    const jugadores = [];

    for (const linea of lineas) {
        // Formato: "0. NombreJugador, STEAMID"
        const match = linea.match(/\d+\.\s+(.+?),/);
        if (match) jugadores.push(match[1].trim());
    }

    return jugadores;
}

// --- EMBEDS ---

function construirEmbedEstado(info) {
    const ahora = new Date();
    const hora = ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    if (info.online) {
        return new EmbedBuilder()
            .setTitle('🟢 TSDE Arkeanos — EN LÍNEA')
            .setColor(0x2ECC71)
            .addFields(
                { name: '🗺️ Mapa', value: 'Ragnarok', inline: true },
                { name: '👥 Jugadores', value: `${info.jugadores.length}/32`, inline: true },
                { name: '🌍 Región', value: 'EU', inline: true }
            )
            .setFooter({ text: `Actualizado a las ${hora} · Se actualiza cada 2 minutos` })
            .setTimestamp();
    } else {
        return new EmbedBuilder()
            .setTitle('🔴 TSDE Arkeanos — FUERA DE LÍNEA')
            .setColor(0xE74C3C)
            .setDescription('El servidor está caído o en mantenimiento.\nConsulta #anuncios para más información.')
            .setFooter({ text: `Última comprobación: ${hora}` })
            .setTimestamp();
    }
}

function construirEmbedJugadores(info) {
    const ahora = new Date();
    const hora = ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    const embed = new EmbedBuilder()
        .setTitle('👥 Jugadores en TSDE Arkeanos')
        .setColor(info.online ? 0x3498DB : 0x95A5A6)
        .setFooter({ text: `Actualizado a las ${hora} · Se actualiza cada 2 minutos` })
        .setTimestamp();

    if (!info.online) {
        embed.setDescription('🔴 Servidor offline — sin datos de jugadores');
        return embed;
    }

    if (info.jugadores.length === 0) {
        embed.setDescription('El servidor está vacío.\n\n¡Sé el primero en conectarte! 🦖');
        embed.addFields({ name: '👥 Conectados', value: '0/32', inline: true });
        return embed;
    }

    const lista = info.jugadores.map((j, i) => `${i + 1}. 🦖 ${j}`).join('\n');

    embed.setDescription(lista);
    embed.addFields(
        { name: '👥 Conectados', value: `${info.jugadores.length}/32`, inline: true },
        { name: '🗺️ Mapa', value: 'Ragnarok', inline: true }
    );

    return embed;
}

// --- ACTUALIZAR CANALES ---

async function actualizarCanales(client) {
    const info = await consultarServidor();

    // Actualizar #estado-servidor
    if (config.canales.estado) {
        try {
            const canal = await client.channels.fetch(config.canales.estado);
            const embed = construirEmbedEstado(info);

            if (mensajeEstadoId) {
                try {
                    const msg = await canal.messages.fetch(mensajeEstadoId);
                    await msg.edit({ embeds: [embed] });
                } catch {
                    const msg = await canal.send({ embeds: [embed] });
                    mensajeEstadoId = msg.id;
                }
            } else {
                // Buscar mensaje existente del bot
                const mensajes = await canal.messages.fetch({ limit: 5 });
                const existente = mensajes.find(m => m.author.id === client.user.id);
                if (existente) {
                    await existente.edit({ embeds: [embed] });
                    mensajeEstadoId = existente.id;
                } else {
                    const msg = await canal.send({ embeds: [embed] });
                    mensajeEstadoId = msg.id;
                }
            }
        } catch (e) {
            console.error('[SRV] Error actualizando estado:', e.message);
        }
    }

    // Actualizar #jugadores-online
    if (config.canales.jugadores) {
        try {
            const canal = await client.channels.fetch(config.canales.jugadores);
            const embed = construirEmbedJugadores(info);

            if (mensajeJugadoresId) {
                try {
                    const msg = await canal.messages.fetch(mensajeJugadoresId);
                    await msg.edit({ embeds: [embed] });
                } catch {
                    const msg = await canal.send({ embeds: [embed] });
                    mensajeJugadoresId = msg.id;
                }
            } else {
                const mensajes = await canal.messages.fetch({ limit: 5 });
                const existente = mensajes.find(m => m.author.id === client.user.id);
                if (existente) {
                    await existente.edit({ embeds: [embed] });
                    mensajeJugadoresId = existente.id;
                } else {
                    const msg = await canal.send({ embeds: [embed] });
                    mensajeJugadoresId = msg.id;
                }
            }
        } catch (e) {
            console.error('[SRV] Error actualizando jugadores:', e.message);
        }
    }

    // Avisar en #anuncios si el servidor cae
    if (!info.online && config.canales.anuncios) {
        // Solo avisar una vez, no cada 2 minutos
        if (!servidorCaidoAvisado) {
            servidorCaidoAvisado = true;
            try {
                const canal = await client.channels.fetch(config.canales.anuncios);
                await canal.send({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('⚠️ Servidor caído')
                            .setDescription('El servidor TSDE Arkeanos no responde. Estamos revisándolo.')
                            .setColor(0xE74C3C)
                    ]
                });
            } catch (e) {}
        }
    } else if (info.online) {
        servidorCaidoAvisado = false;
    }
}

let servidorCaidoAvisado = false;

// --- INICIAR ---

async function iniciarMonitorServidor(client) {
    if (!config.rcon.ip || !config.rcon.password) {
        console.warn('[SRV] RCON no configurado — monitor de servidor desactivado');
        return;
    }

    if (!config.canales.estado && !config.canales.jugadores) {
        console.warn('[SRV] Canales estado/jugadores no configurados en config.json');
        return;
    }

    console.log('[SRV] Monitor del servidor iniciado — actualizando cada 2 minutos');

    // Primera actualización inmediata
    await actualizarCanales(client);

    // Actualizar cada 2 minutos
    if (intervalo) clearInterval(intervalo);
    intervalo = setInterval(async () => {
        await actualizarCanales(client);
    }, 2 * 60 * 1000);
}

module.exports = { iniciarMonitorServidor };
