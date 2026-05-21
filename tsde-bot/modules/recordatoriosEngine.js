const { EmbedBuilder } = require('discord.js');
const config = require('../config.json');

// Recordatorios activos en memoria: { eventoId: [timeoutId, timeoutId, ...] }
const recordatoriosActivos = {};

// --- PARSEAR FECHA ---
// Acepta formato: DD/MM/YYYY HH:MM
function parsearFecha(fechaStr) {
    const regex = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})/;
    const match = fechaStr.match(regex);
    if (!match) return null;

    const [, dia, mes, anio, hora, minutos] = match;
    const fecha = new Date(
        parseInt(anio),
        parseInt(mes) - 1,
        parseInt(dia),
        parseInt(hora),
        parseInt(minutos)
    );

    return isNaN(fecha.getTime()) ? null : fecha;
}

// --- PROGRAMAR RECORDATORIOS ---

async function programarRecordatorios(client, evento) {
    if (!evento.fecha_timestamp) return;

    const fechaEvento = parsearFecha(evento.fecha_timestamp);
    if (!fechaEvento) {
        console.warn(`[REC] Fecha inválida para evento ${evento.id}: ${evento.fecha_timestamp}`);
        return;
    }

    const ahora = Date.now();
    const tiempoEvento = fechaEvento.getTime();

    if (tiempoEvento <= ahora) {
        console.warn(`[REC] El evento ${evento.id} ya ha pasado, no se programan recordatorios`);
        return;
    }

    const recordatorios = [
        { ms: 24 * 60 * 60 * 1000, label: '24 horas', mencionar: false },
        { ms: 60 * 60 * 1000,      label: '1 hora',    mencionar: true  },
        { ms: 15 * 60 * 1000,      label: '15 minutos', mencionar: true  }
    ];

    if (!recordatoriosActivos[evento.id]) recordatoriosActivos[evento.id] = [];

    for (const rec of recordatorios) {
        const tiempoRestante = tiempoEvento - rec.ms - ahora;
        if (tiempoRestante <= 0) continue;

        const timeoutId = setTimeout(async () => {
            await enviarRecordatorio(client, evento, rec.label, rec.mencionar);
        }, tiempoRestante);

        recordatoriosActivos[evento.id].push(timeoutId);
        console.log(`[REC] Recordatorio de ${rec.label} programado para evento "${evento.titulo}"`);
    }

    // Recordatorio final — cuando empieza el evento
    const tiempoInicio = tiempoEvento - ahora;
    if (tiempoInicio > 0) {
        const timeoutId = setTimeout(async () => {
            await enviarInicioEvento(client, evento);
        }, tiempoInicio);
        recordatoriosActivos[evento.id].push(timeoutId);
    }
}

// --- ENVIAR RECORDATORIO ---

async function enviarRecordatorio(client, evento, tiempoRestante, mencionarInscritos) {
    try {
        const canal = await client.channels.fetch(config.canales.anuncios).catch(() => null);
        if (!canal) return;

        const inscritos = evento.inscritos || [];
        const menciones = mencionarInscritos && inscritos.length > 0
            ? inscritos.map(u => `@${u}`).join(', ')
            : null;

        const embed = new EmbedBuilder()
            .setTitle(`⏰ Recordatorio — ${evento.titulo}`)
            .setDescription(
                `El evento comienza en **${tiempoRestante}**.\n\n` +
                `📅 **Hora:** ${evento.fecha}\n` +
                `🏆 **Premio:** ${evento.premio}\n` +
                `👥 **Inscritos:** ${inscritos.length}${evento.limite ? `/${evento.limite}` : ''}`
            )
            .setColor(0xF39C12);

        if (menciones) {
            embed.addFields({ name: '🔔 Participantes confirmados', value: menciones, inline: false });
        }

        embed.setFooter({ text: `¡Que no se te olvide! Recuerda estar 15 minutos antes.` });

        const content = tiempoRestante === '24 horas'
            ? '@everyone'
            : mencionarInscritos && inscritos.length > 0
                ? inscritos.map(u => `<@${u}>`).join(' ')
                : null;

        await canal.send({ content, embeds: [embed] });
        console.log(`[REC] Recordatorio de ${tiempoRestante} enviado para "${evento.titulo}"`);

    } catch (error) {
        console.error('[REC] Error enviando recordatorio:', error.message);
    }
}

// --- ANUNCIAR INICIO ---

async function enviarInicioEvento(client, evento) {
    try {
        const canal = await client.channels.fetch(config.canales.anuncios).catch(() => null);
        if (!canal) return;

        const inscritos = evento.inscritos || [];

        const embed = new EmbedBuilder()
            .setTitle(`🚨 ¡EMPIEZA AHORA! — ${evento.titulo}`)
            .setDescription(
                `**El evento está comenzando ahora mismo.**\n\n` +
                `🏆 Premio: ${evento.premio}\n` +
                `👥 Participantes: ${inscritos.length}`
            )
            .setColor(0xE74C3C);

        const menciones = inscritos.map(u => `<@${u}>`).join(' ');

        await canal.send({
            content: menciones || '@everyone',
            embeds: [embed]
        });

    } catch (error) {
        console.error('[REC] Error enviando inicio de evento:', error.message);
    }
}

// --- CANCELAR RECORDATORIOS ---

function cancelarRecordatorios(eventoId) {
    const timeouts = recordatoriosActivos[eventoId];
    if (!timeouts) return;

    timeouts.forEach(t => clearTimeout(t));
    delete recordatoriosActivos[eventoId];
    console.log(`[REC] Recordatorios cancelados para evento ${eventoId}`);
}

module.exports = { programarRecordatorios, cancelarRecordatorios, parsearFecha };
