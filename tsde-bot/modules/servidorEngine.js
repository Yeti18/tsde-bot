const { EmbedBuilder } = require('discord.js');
const Rcon = require('rcon');
const fs = require('fs');
const config = require('../config.json');

let mensajeEstadoId = null;
let mensajeJugadoresId = null;
let intervalo = null;

// Estado de caída — para diferenciar reinicio normal de caída real
let cayendoDesde = null; // timestamp de cuando empezó a fallar
let avisoEnviado = false;
let nombreCanalActual = null; // para no spamear el rename

const SERVIDOR = config.servidor || {
    nombre: 'TSDE Arkeanos',
    mapa: 'Ragnarok',
    maxJugadores: 70,
    region: 'EU'
};

// --- BUSCAR JUGADOR REGISTRADO POR NOMBRE DE ARK ---

function buscarJugadorRegistrado(nombreArk) {
    try {
        const db = JSON.parse(fs.readFileSync('./database.json', 'utf8'));
        const jugadores = db.jugadores || {};
        const entrada = Object.values(jugadores).find(j =>
            j.nombreArk && j.nombreArk.toLowerCase() === nombreArk.toLowerCase()
        );
        return entrada || null;
    } catch (e) {
        return null;
    }
}


// Minutos que tiene que estar caído para considerarse "caída real" y no reinicio normal
const MINUTOS_REINICIO_NORMAL = 8;

// --- RCON ---

async function ejecutarComandoRcon(comando, timeout = 8000) {
    return new Promise((resolve, reject) => {
        const conn = new Rcon(config.rcon.ip, config.rcon.port, config.rcon.password);

        const timer = setTimeout(() => {
            try { conn.disconnect(); } catch(e) {}
            reject(new Error('Timeout RCON'));
        }, timeout);

        conn.on('auth', () => {
            conn.send(comando);
        });

        conn.on('response', (str) => {
            clearTimeout(timer);
            try { conn.disconnect(); } catch(e) {}
            resolve(str);
        });

        conn.on('error', (err) => {
            clearTimeout(timer);
            reject(err);
        });

        conn.connect();
    });
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function consultarServidor() {
    if (!config.rcon.ip || !config.rcon.password) return null;

    try {
        const respuesta = await ejecutarComandoRcon('ListPlayers');
        console.log(`[SRV] Respuesta RCON raw: "${respuesta}"`);
        const jugadores = parsearJugadores(respuesta);
        // Guardar en DB para que el endpoint HTTP de la web lo pueda leer
        try {
            const db = JSON.parse(fs.readFileSync('./database.json', 'utf8'));
            db.jugadores_online = jugadores.map(j => j.nombre || j);
            fs.writeFileSync('./database.json', JSON.stringify(db, null, 2));
        } catch (e) {}

        return { online: true, jugadores };
    } catch (error) {
        console.log(`[SRV] Servidor no responde: ${error.message}`);
        try {
            const db = JSON.parse(fs.readFileSync('./database.json', 'utf8'));
            db.jugadores_online = [];
            fs.writeFileSync('./database.json', JSON.stringify(db, null, 2));
        } catch (e) {}
        return { online: false, jugadores: [] };
    }
}

function parsearJugadores(respuesta) {
    if (!respuesta) return [];
    const textoLimpio = respuesta.trim();

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

        const match = limpia.match(/^\d+\.\s+(.+?),\s*([a-f0-9]+)\s*$/i);
        if (match) {
            jugadores.push({ nombre: match[1].trim(), eosId: match[2].trim() });
            continue;
        }

        const match2 = limpia.match(/^\d+\.\s+(.+)$/);
        if (match2) {
            const nombre = match2[1].replace(/,.*$/, '').trim();
            if (nombre) jugadores.push({ nombre, eosId: null });
        }
    }

    return jugadores;
}

// --- EMBEDS ---

function construirEmbedEstado(info, minutosCaido) {
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

    // Caído — diferenciar reinicio normal de caída real
    if (minutosCaido !== null && minutosCaido < MINUTOS_REINICIO_NORMAL) {
        return new EmbedBuilder()
            .setTitle(`🟡 ${SERVIDOR.nombre} — REINICIANDO`)
            .setColor(0xF39C12)
            .setDescription(`El servidor está en su reinicio diario programado.\nVuelve a estar disponible en pocos minutos.`)
            .addFields({ name: '⏱️ Caído desde', value: `${minutosCaido} minuto(s)`, inline: true })
            .setFooter({ text: `Última comprobación: ${hora}` })
            .setTimestamp();
    }

    return new EmbedBuilder()
        .setTitle(`🔴 ${SERVIDOR.nombre} — FUERA DE LÍNEA`)
        .setColor(0xE74C3C)
        .setDescription('El servidor no responde desde hace tiempo.\nConsulta #anuncios para más información.')
        .addFields({ name: '⏱️ Caído desde', value: minutosCaido !== null ? `${minutosCaido} minuto(s)` : 'Desconocido', inline: true })
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

    const lista = info.jugadores.map((j, i) => {
        const registrado = buscarJugadorRegistrado(j.nombre);
        if (registrado) {
            return `${i + 1}. 🦖 **${j.nombre}** — ${registrado.discordUsername}`;
        }
        return `${i + 1}. 🦖 **${j.nombre}**`;
    }).join('\n');
    embed.setDescription(lista);
    embed.addFields(
        { name: '👥 Conectados', value: `${info.jugadores.length}/${SERVIDOR.maxJugadores}`, inline: true },
        { name: '🗺️ Mapa', value: SERVIDOR.mapa, inline: true }
    );

    return embed;
}

// --- ACTUALIZAR MENSAJE ---

async function actualizarMensaje(client, canalId, mensajeIdRef, embed) {
    const canal = await client.channels.fetch(canalId);

    if (mensajeIdRef.id) {
        try {
            const msg = await canal.messages.fetch(mensajeIdRef.id);
            await msg.edit({ embeds: [embed] });
            return canal;
        } catch {
            mensajeIdRef.id = null;
        }
    }

    const mensajes = await canal.messages.fetch({ limit: 10 });
    const existente = mensajes.find(m => m.author.id === client.user.id);
    if (existente) {
        await existente.edit({ embeds: [embed] });
        mensajeIdRef.id = existente.id;
    } else {
        const msg = await canal.send({ embeds: [embed] });
        mensajeIdRef.id = msg.id;
    }
    return canal;
}

// --- CAMBIAR NOMBRE DEL CANAL (con límite de Discord respetado) ---

async function actualizarNombreCanal(canal, online) {
    // Quitar cualquier emoji de estado al principio del nombre (verde/rojo/amarillo)
    const nombreBase = canal.name
        .replace(/^[\u{1F7E2}\u{1F534}\u{1F7E1}]/u, '')
        .replace(/^[\s\-_|]+/, '');
    const emoji = online ? '🟢' : '🔴';
    const nuevoNombre = `${emoji}-${nombreBase}`;

    // Solo cambiar si realmente cambió el estado — evita rate limit de Discord (2 cambios/10min)
    if (nombreCanalActual === online) return;

    try {
        await canal.setName(nuevoNombre);
        nombreCanalActual = online;
        console.log(`[SRV] Nombre de canal actualizado: ${nuevoNombre}`);
    } catch (e) {
        console.error('[SRV] No se pudo cambiar nombre del canal (límite de Discord):', e.message);
    }
}

// --- ACTUALIZAR CANALES ---

const refEstado = { id: null };
const refJugadores = { id: null };

async function actualizarCanales(client) {
    const info = await consultarServidor();

    let minutosCaido = null;

    if (!info.online) {
        if (cayendoDesde === null) {
            cayendoDesde = Date.now();
        }
        minutosCaido = Math.floor((Date.now() - cayendoDesde) / 60000);
    } else {
        cayendoDesde = null;
        minutosCaido = null;
    }

    console.log(`[SRV] Online: ${info.online} | Jugadores: ${JSON.stringify(info.jugadores)} | Minutos caído: ${minutosCaido}`);

    // Estado servidor
    if (config.canales.estado) {
        try {
            const canal = await actualizarMensaje(client, config.canales.estado, refEstado, construirEmbedEstado(info, minutosCaido));
            await actualizarNombreCanal(canal, info.online);
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

    // Aviso en #anuncios — SOLO si es caída real (más de MINUTOS_REINICIO_NORMAL)
    if (!info.online && minutosCaido >= MINUTOS_REINICIO_NORMAL && !avisoEnviado && config.canales.anuncios) {
        avisoEnviado = true;
        try {
            const canal = await client.channels.fetch(config.canales.anuncios);
            await canal.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('⚠️ Servidor caído')
                        .setDescription(`El servidor **${SERVIDOR.nombre}** no responde desde hace ${minutosCaido} minutos. Estamos revisándolo.`)
                        .setColor(0xE74C3C)
                ]
            });
            console.log('[SRV] Aviso de caída real enviado a #anuncios');
        } catch (e) {
            console.error('[SRV] Error enviando aviso:', e.message);
        }
    } else if (info.online && avisoEnviado) {
        // El servidor volvió — avisar que ya está bien
        avisoEnviado = false;
        try {
            const canal = await client.channels.fetch(config.canales.anuncios);
            await canal.send({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('✅ Servidor de nuevo en línea')
                        .setDescription(`El servidor **${SERVIDOR.nombre}** ha vuelto a estar disponible.`)
                        .setColor(0x2ECC71)
                ]
            });
        } catch (e) {}
    }
}

// --- INICIAR ---

async function iniciarMonitorServidor(client) {
    if (!config.rcon.ip || !config.rcon.password) {
        console.warn('[SRV] RCON no configurado — monitor desactivado');
        return;
    }

    console.log('[SRV] Monitor del servidor iniciado — actualizando cada 2 minutos');
    console.log(`[SRV] Reinicio normal considerado hasta ${MINUTOS_REINICIO_NORMAL} minutos caído`);

    try {
        await actualizarCanales(client);
    } catch (e) {
        console.error('[SRV] Error primera actualización:', e.message);
    }

    if (intervalo) clearInterval(intervalo);

    intervalo = setInterval(async () => {
        try {
            await actualizarCanales(client);
        } catch (e) {
            console.error('[SRV] Error actualización periódica:', e.message);
        }
    }, 2 * 60 * 1000);
}

module.exports = { iniciarMonitorServidor };
