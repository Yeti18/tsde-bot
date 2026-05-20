const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const fs = require('fs');
const rcon = require('./rconHelper.js');

const DB_PATH = './database.json';

function cargarDB() {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function guardarDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function esAdmin(interaction) {
    return interaction.member.permissions.has('ManageMessages');
}

// --- GENERAR BRACKET ---

function mezclarArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function generarRonda(jugadores) {
    const ronda = [];
    for (let i = 0; i < jugadores.length - 1; i += 2) {
        ronda.push({
            j1: jugadores[i],
            j2: jugadores[i + 1],
            ganador: null
        });
    }
    // Si número impar, el último pasa directamente
    if (jugadores.length % 2 !== 0) {
        ronda.push({
            j1: jugadores[jugadores.length - 1],
            j2: 'BYE',
            ganador: jugadores[jugadores.length - 1]
        });
    }
    return ronda;
}

// --- EMBEDS ---

function construirEmbedBracket(torneo) {
    const embed = new EmbedBuilder()
        .setTitle(`⚔️ ${torneo.titulo} — Bracket`)
        .setColor(0xE74C3C);

    const totalRondas = torneo.rondas.length;

    torneo.rondas.forEach((ronda, rIdx) => {
        let nombreRonda;
        const rondasRestantes = totalRondas - rIdx;
        if (rondasRestantes === 1) nombreRonda = '🏆 FINAL';
        else if (rondasRestantes === 2) nombreRonda = '🥊 SEMIFINAL';
        else if (rondasRestantes === 3) nombreRonda = '⚔️ CUARTOS';
        else nombreRonda = `Ronda ${rIdx + 1}`;

        const lineas = ronda.map((combate, cIdx) => {
            if (combate.j2 === 'BYE') {
                return `✅ **${combate.j1}** — Pasa directo`;
            }
            if (combate.ganador) {
                const perdedor = combate.ganador === combate.j1 ? combate.j2 : combate.j1;
                return `✅ **${combate.ganador}** def. ~~${perdedor}~~`;
            }
            const esActual = rIdx === torneo.ronda_actual;
            return `${esActual ? `\`Combate ${cIdx + 1}\`` : '⏳'} **${combate.j1}** vs **${combate.j2}**`;
        });

        embed.addFields({
            name: nombreRonda,
            value: lineas.join('\n'),
            inline: false
        });
    });

    const rondaActual = torneo.rondas[torneo.ronda_actual];
    const pendientes = rondaActual ? rondaActual.filter(c => !c.ganador && c.j2 !== 'BYE') : [];

    if (torneo.campeon) {
        embed.addFields({ name: '👑 CAMPEÓN', value: `**${torneo.campeon}**`, inline: false });
        embed.setColor(0xF1C40F);
    } else {
        embed.setFooter({ text: `Ronda ${torneo.ronda_actual + 1} — ${pendientes.length} combate(s) pendiente(s)` });
    }

    return embed;
}

function construirBotonesCombates(torneo) {
    const rondaActual = torneo.rondas[torneo.ronda_actual];
    if (!rondaActual) return [];

    const pendientes = rondaActual
        .map((c, i) => ({ ...c, idx: i }))
        .filter(c => !c.ganador && c.j2 !== 'BYE');

    if (pendientes.length === 0) return [];

    const rows = [];
    let row = new ActionRowBuilder();
    let count = 0;

    for (const combate of pendientes) {
        if (count > 0 && count % 2 === 0) {
            rows.push(row);
            row = new ActionRowBuilder();
        }

        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`trn_ganador_${torneo.id}_${torneo.ronda_actual}_${combate.idx}_1`)
                .setLabel(`🏆 ${combate.j1}`)
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`trn_ganador_${torneo.id}_${torneo.ronda_actual}_${combate.idx}_2`)
                .setLabel(`🏆 ${combate.j2}`)
                .setStyle(ButtonStyle.Danger)
        );

        count++;
    }

    rows.push(row);

    // Botón cancelar torneo
    rows.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`trn_cancelar_${torneo.id}`)
            .setLabel('🗑️ Cancelar torneo')
            .setStyle(ButtonStyle.Secondary)
    ));

    return rows.slice(0, 5); // máximo 5 filas en Discord
}

// --- INICIAR TORNEO ---

async function iniciarTorneo(interaction, client, torneoId) {
    const db = cargarDB();
    const evento = db.eventos_activos[torneoId];
    if (!evento) return interaction.reply({ content: 'Evento no encontrado.', ephemeral: true });

    const jugadores = mezclarArray(evento.inscritos);
    const primeraRonda = generarRonda(jugadores);

    const torneo = {
        id: torneoId,
        titulo: evento.titulo,
        premio: evento.premio,
        jugadores_iniciales: jugadores,
        rondas: [primeraRonda],
        ronda_actual: 0,
        campeon: null,
        mensaje_id: null,
        canal_id: evento.canal_id,
        estado: 'en_curso'
    };

    if (!db.torneos_activos) db.torneos_activos = {};
    db.torneos_activos[torneoId] = torneo;
    guardarDB(db);

    const embed = construirEmbedBracket(torneo);
    const botones = construirBotonesCombates(torneo);

    const config = require('../config.json');
    const canal = await client.channels.fetch(evento.canal_id);
    const mensaje = await canal.send({ embeds: [embed], components: botones });

    db.torneos_activos[torneoId].mensaje_id = mensaje.id;
    guardarDB(db);

    const enfrentamientos = primeraRonda
        .filter(c => c.j2 !== 'BYE')
        .map((c, i) => `Combate ${i + 1}: ${c.j1} vs ${c.j2}`)
        .join(' | ');

    await rcon.broadcast(`TORNEO ${evento.titulo} INICIADO! ${enfrentamientos}`);

    return interaction.reply({ content: `⚔️ Torneo iniciado con ${jugadores.length} participantes.`, ephemeral: true });
}

// --- GESTIÓN DE BOTONES ---

async function handleButton(interaction, client) {
    const id = interaction.customId;

    // Registrar ganador de un combate
    if (id.startsWith('trn_ganador_')) {
        if (!esAdmin(interaction)) return interaction.reply({ content: '⛔ Solo admins.', ephemeral: true });

        const partes = id.split('_');
        // trn_ganador_TORNEOID_RONDA_COMBATE_JUGADOR
        const torneoId = partes[2];
        const rondaIdx = parseInt(partes[3]);
        const combateIdx = parseInt(partes[4]);
        const jugadorNum = parseInt(partes[5]); // 1 o 2

        const db = cargarDB();
        const torneo = db.torneos_activos?.[torneoId];
        if (!torneo) return interaction.reply({ content: 'Torneo no encontrado.', ephemeral: true });

        const combate = torneo.rondas[rondaIdx][combateIdx];
        if (combate.ganador) return interaction.reply({ content: 'Este combate ya tiene ganador.', ephemeral: true });

        const ganador = jugadorNum === 1 ? combate.j1 : combate.j2;
        const perdedor = jugadorNum === 1 ? combate.j2 : combate.j1;
        combate.ganador = ganador;

        await rcon.broadcast(`TORNEO: ${ganador} elimina a ${perdedor}!`);

        // Comprobar si la ronda ha terminado
        const rondaCompleta = torneo.rondas[rondaIdx].every(c => c.ganador !== null);

        if (rondaCompleta) {
            const ganadores = torneo.rondas[rondaIdx].map(c => c.ganador);

            if (ganadores.length === 1) {
                // CAMPEÓN
                torneo.campeon = ganadores[0];
                torneo.estado = 'finalizado';

                await rcon.broadcast(`CAMPEON DE ${torneo.titulo}: ${ganadores[0]}! Felicidades!`);

                // Guardar en historial
                if (!db.historial_eventos) db.historial_eventos = [];
                db.historial_eventos.push({
                    titulo: torneo.titulo,
                    campeon: ganadores[0],
                    participantes: torneo.jugadores_iniciales,
                    fecha: new Date().toISOString()
                });
                delete db.torneos_activos[torneoId];

            } else {
                // Siguiente ronda
                const siguienteRonda = generarRonda(ganadores);
                torneo.rondas.push(siguienteRonda);
                torneo.ronda_actual++;

                const enfrentamientos = siguienteRonda
                    .filter(c => c.j2 !== 'BYE')
                    .map((c, i) => `C${i + 1}: ${c.j1} vs ${c.j2}`)
                    .join(' | ');

                await rcon.broadcast(`TORNEO: Nueva ronda! ${enfrentamientos}`);
            }
        }

        guardarDB(db);

        // Actualizar mensaje del bracket
        try {
            const canal = await client.channels.fetch(torneo.canal_id);
            const mensaje = await canal.messages.fetch(torneo.mensaje_id);
            const embed = construirEmbedBracket(torneo);
            const botones = torneo.campeon ? [] : construirBotonesCombates(torneo);
            await mensaje.edit({ embeds: [embed], components: botones });
        } catch (e) {
            console.error('[TRN] Error actualizando bracket:', e.message);
        }

        const respuesta = torneo.campeon
            ? `👑 **${torneo.campeon}** es el campeón de **${torneo.titulo}**!`
            : `✅ **${ganador}** avanza a la siguiente ronda.`;

        return interaction.reply({ content: respuesta, ephemeral: true });
    }

    // Cancelar torneo
    if (id.startsWith('trn_cancelar_')) {
        if (!esAdmin(interaction)) return interaction.reply({ content: '⛔ Solo admins.', ephemeral: true });

        const torneoId = id.replace('trn_cancelar_', '');
        const db = cargarDB();
        const torneo = db.torneos_activos?.[torneoId];
        if (!torneo) return interaction.reply({ content: 'Torneo no encontrado.', ephemeral: true });

        delete db.torneos_activos[torneoId];
        guardarDB(db);

        try {
            const canal = await client.channels.fetch(torneo.canal_id);
            const mensaje = await canal.messages.fetch(torneo.mensaje_id);
            await mensaje.edit({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(`❌ TORNEO CANCELADO — ${torneo.titulo}`)
                        .setColor(0xE74C3C)
                ],
                components: []
            });
        } catch (e) {}

        return interaction.reply({ content: `🗑️ Torneo **${torneo.titulo}** cancelado.`, ephemeral: true });
    }
}

module.exports = { iniciarTorneo, handleButton };
