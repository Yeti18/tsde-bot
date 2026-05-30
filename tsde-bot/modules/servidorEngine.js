const { EmbedBuilder } = require('discord.js');
const Rcon = require('rcon');
const config = require('../config.json');

let mensajeEstadoId = null;
let mensajeJugadoresId = null;
let intervalo = null;
let servidorCaidoAvisado = false;

// Datos del servidor desde config
const SERVIDOR = config.servidor || {
    nombre: 'TSDE Arkeanos',
    mapa: 'Ragnarok',
    maxJugadores: 70,
    region: 'EU'
};

// --- RCON ---

async function ejecutarComandoRcon(comando) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error('Timeout RCON'));
        }, 5000);

        const conn = new Rcon(config.rcon.ip, config.rcon.port, config.rcon.password);

        conn.on('auth', () => {
            conn.send(comando);
        });

        conn.on('response', (str) => {
            clearTimeout(timer);
            conn.disconnect();
            resolve(str);
        });

        conn.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });

        conn.connect();
    });
}

async function consultarServidor() {
    if (!config.rcon.ip || !config.rcon.password) return null;

    try {
        const respuesta = await ejecutarComandoRcon('ListPlayers');
        console.log(`[SRV] Respuesta RCON raw: "${respuesta}"`);
        const jugadores = parsearJugadores(respuesta);
        return { online: true, jugadores };
    } catch (error) {
        console.log(`[SRV] Servidor no responde: ${error.message}`);
        return { online: false, jugadores: [] };
    }
}

function parsearJugadores(respuesta) {
    if (!respuesta) return [];

    const textoLimpio = respuesta.trim();

    // ARK ASA devuelve esto cuando no hay jugadores
    if (
        textoLimpio === '' ||
        textoLimpio.toLowerCase().includes('no players') ||
        textoLimpio.toLowerCase().includes('no hay jugadores')
    ) {
        return [];
    }

    const jugadores = [];
    const lineas = textoLimpio.split('\n');

    for (const linea of lineas) {
        const limpia = linea.trim();
        if (!limpia) continue;

        // Formato ARK: "0. NombreJugador, SteamID64"
        const match = limpia.match(/^\d+\.\s+(.+?),\s*\d+/);
        if (match) {
            jugadores.push(match[1].trim());
            continue;
        }

        // Formato alternativo sin SteamID
        const match2 = limpia.match(/^\d+\.\s+(.+)$/);
        if (match2) {
            const nombre = match2[1].replace(/,.*$/, '').trim();
            if (nombre) jugadores.push(nombre);
        }
    }

    return jugadores;
}

// --- EMBEDS ---

function construirEmbedEstado(info) {
    const hora = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    if (info.online) {
        return new EmbedBuilder()
            .setTitle(`🟢 ${SERVIDOR.nombre} — EN LÍNEA`)
            .setColor(0x2ECC71)
            .addFields(
                { name: '🗺️ Mapa', value: SERVIDOR.mapa, inline: true },
                { name: '👥 Jugadores', value: `${info.jugadores.length}/${SERVIDOR.maxJugadores}`, inline: true },
                { name: '🌍 Región', value: SERVIDOR.region, inline: true }
            )
            .setFooter({ text: `Actualizado a las ${hora} · Cada 2 minutos` })
            .setTimestamp();
    }

    return new EmbedBuilder()
        .setTitle(`🔴 ${SERVIDOR.nombre} — FUERA DE LÍNEA`)
        .setColor(0xE74C3C)
        .setDescription('El servidor está caído o en mantenimiento.\nConsulta #anuncios para más información.')
        .setFooter({ text: `Última comprobación: ${hora}` })
        .setTimestamp();
}

function construirEmbedJugadores(info) {
    const hora = new Date().toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });

    const embed = new EmbedBuilder()
        .setTitle(`👥 Jugadores en ${SERVIDOR.nombre}`)
        .setColor(info.online ? 0x3498DB : 0x95A5A6)
        .setFooter({ text: `Actualizado a las ${hora} · Cada 2 minutos` })
        .setTimestamp();

    if (!info.online) {
        embed.setDescription('🔴 Servidor offline — sin datos');
        return embed;
    }

    if (info.jugadores.length === 0) {
        embed.setDescription('El servidor está vacío.\n\n¡Sé el primero en conectarte! 🦖');
        embed.addFields({ name: '👥 Conectados', value: `0/${SERVIDOR.maxJugadores}`, inline: true });
        return embed;
    }

    const lista = info.jugadores.map((j, i) => `${i + 1}. 🦖 ${j}`).join('\n');
    embed.setDescription(lista);
    embed.addFields(
        { name: '👥 Conectados', value: `${info.jugadores.length}/${SERVIDOR.maxJugadores}`, inline: true },
        { name: '🗺️ Mapa', value: SERVIDOR.mapa, inline: true }
    );

    return embed;
}

// --- ACTUALIZAR MENSAJE EN CANAL ---

async function actualizarMensaje(client, canalId, mensajeIdRef, embed) {
    const canal = await client.channels.fetch(canalId);

    if (mensajeIdRef.id) {
        try {
            const msg = await canal.messages.fetch(mensajeIdRef.id);
            await msg.edit({ embeds: [embed] });
            return;
        } catch {
            mensajeIdRef.id = null;
        }
    }

    // Buscar mensaje existente del bot
    const mensajes = await canal.messages.fetch({ limit: 10 });
    const existente = mensajes.find(m => m.author.id === client.user.id);
    if (existente) {
        await existente.edit({ embeds: [embed] });
        mensajeIdRef.id = existente.id;
    } else {
        const msg = await canal.send({ embeds: [embed] });
        mensajeIdRef.id = msg.id;
    }
}

// --- ACTUALIZAR CANALES ---

const refEstado = { id: null };
const refJugadores = { id: null };

async function actualizarCanales(client) {
    const info = await consultarServidor();
    console.log(`[SRV] Online: ${info.online} | Jugadores: ${JSON.stringify(info.jugadores)}`);

    // Estado servidor
    if (config.canales.estado) {
        try {
            await actualizarMensaje(client, config.canales.estado, refEstado, construirEmbedEstado(info));
        } catch (e) {
            console.error('[SRV] Error canal estado:', e.message);
        }
    }

    // Jugadores online
    if (config.canales.jugadores) {
        try {
            await actualizarMensaje(client, config.canales.jugadores, refJugadores, construirEmbedJugadores(info));
        } catch (e) {
            console.error('[SRV] Error canal jugadores:', e.message);
        }
    }

    // Aviso caída
    if (!info.online && !servidorCaidoAvisado && config.canales.anuncios) {
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
        } catch {}
    } else if (info.online) {
        servidorCaidoAvisado = false;
    }
}

// --- INICIAR ---

async function iniciarMonitorServidor(client) {
    if (!config.rcon.ip || !config.rcon.password) {
        console.warn('[SRV] RCON no configurado — monitor desactivado');
        return;
    }

    console.log('[SRV] Monitor del servidor iniciado — actualizando cada 2 minutos');

    // Primera actualización inmediata
    await actualizarCanales(client);

    // Limpiar intervalo anterior
    if (intervalo) clearInterval(intervalo);

    // Cada 2 minutos
    intervalo = setInterval(() => actualizarCanales(client), 2 * 60 * 1000);
}

module.exports = { iniciarMonitorServidor };
