const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const fs = require('fs');

const DB_PATH = './database.json';

function cargarDB() {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function guardarDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// Emojis de opciones
const EMOJIS = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣'];
const COLORES = [0x3498DB, 0x9B59B6, 0x2ECC71, 0xE67E22, 0xE74C3C, 0xF1C40F, 0x1ABC9C, 0x95A5A6];

// --- CONSTRUIR EMBED ---

function construirEmbedPoll(poll) {
    const totalVotos = Object.values(poll.votos).reduce((sum, arr) => sum + arr.length, 0);

    const embed = new EmbedBuilder()
        .setTitle(`📊 ${poll.pregunta}`)
        .setColor(COLORES[0]);

    const lineas = poll.opciones.map((opcion, i) => {
        const votosOpcion = (poll.votos[i] || []).length;
        const porcentaje = totalVotos > 0 ? Math.round((votosOpcion / totalVotos) * 100) : 0;
        const barra = generarBarra(porcentaje);
        return `${EMOJIS[i]} **${opcion}**\n${barra} ${porcentaje}% (${votosOpcion} voto${votosOpcion !== 1 ? 's' : ''})`;
    });

    embed.setDescription(lineas.join('\n\n'));

    embed.addFields({ name: '📊 Total de votos', value: `${totalVotos}`, inline: true });

    if (poll.cerrada) {
        // Calcular ganadora
        let maxVotos = -1;
        let ganadora = null;
        poll.opciones.forEach((op, i) => {
            const v = (poll.votos[i] || []).length;
            if (v > maxVotos) { maxVotos = v; ganadora = op; }
        });
        embed.addFields({ name: '🏆 Ganadora', value: ganadora || 'Empate', inline: true });
        embed.setColor(0xF1C40F);
        embed.setFooter({ text: '🔒 Encuesta cerrada' });
    } else {
        embed.setFooter({ text: `Encuesta activa · Creada por ${poll.autor}` });
    }

    return embed;
}

function generarBarra(porcentaje) {
    const llenos = Math.round(porcentaje / 10);
    const vacios = 10 - llenos;
    return '█'.repeat(llenos) + '░'.repeat(vacios);
}

// --- CONSTRUIR BOTONES ---

function construirBotonesPoll(pollId, opciones, cerrada) {
    const rows = [];

    // Botones de opciones (máx 5 por fila, máx 2 filas = 10 opciones)
    const chunkSize = opciones.length <= 5 ? opciones.length : Math.ceil(opciones.length / 2);
    const chunks = [];
    for (let i = 0; i < opciones.length; i += chunkSize) {
        chunks.push(opciones.slice(i, i + chunkSize));
    }

    chunks.forEach((chunk, rowIdx) => {
        const row = new ActionRowBuilder();
        chunk.forEach((opcion, idx) => {
            const opcionIdx = rowIdx * chunkSize + idx;
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`pol_votar_${pollId}_${opcionIdx}`)
                    .setLabel(`${EMOJIS[opcionIdx]} ${opcion.length > 20 ? opcion.substring(0, 20) + '…' : opcion}`)
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(cerrada)
            );
        });
        rows.push(row);
    });

    // Botón cerrar (siempre al final)
    if (!cerrada) {
        rows.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`pol_cerrar_${pollId}`)
                .setLabel('🔒 Cerrar encuesta')
                .setStyle(ButtonStyle.Danger)
        ));
    }

    return rows.slice(0, 5);
}

// --- MODAL CREAR POLL ---

async function mostrarModalPoll(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('pol_modal_crear')
        .setTitle('Crear encuesta TSDE');

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('pregunta')
                .setLabel('Pregunta')
                .setPlaceholder('¿Qué evento queréis para el sábado?')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('opciones')
                .setLabel('Opciones (una por línea, máximo 8)')
                .setPlaceholder('Torneo de T-Rex\nLaberinto\nEvento de barcos\nColiseo libre')
                .setStyle(TextInputStyle.Paragraph)
                .setMinLength(3)
                .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('duracion')
                .setLabel('Duración en horas (deja vacío = sin límite)')
                .setPlaceholder('Ej: 24')
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
        )
    );

    await interaction.showModal(modal);
}

// --- GESTIÓN DE MODALES ---

async function handleModal(interaction, client) {
    if (interaction.customId === 'pol_modal_crear') {
        try {
            const pregunta = interaction.fields.getTextInputValue('pregunta').trim();
            const opcionesRaw = interaction.fields.getTextInputValue('opciones');
            const duracionRaw = interaction.fields.getTextInputValue('duracion');

            const opciones = opcionesRaw
                .split('\n')
                .map(o => o.trim())
                .filter(o => o.length > 0)
                .slice(0, 8);

            if (opciones.length < 2) {
                return interaction.reply({
                    content: '❌ Necesitas al menos 2 opciones. Escribe cada opción en una línea diferente.',
                    ephemeral: true
                });
            }

            const duracion = duracionRaw ? parseInt(duracionRaw) : null;
            const id = Date.now().toString();

            const poll = {
                id,
                pregunta,
                opciones,
                votos: Object.fromEntries(opciones.map((_, i) => [i, []])),
                autor: interaction.user.username,
                cerrada: false,
                fecha: new Date().toISOString(),
                mensaje_id: null,
                canal_id: interaction.channelId
            };

            const db = cargarDB();
            if (!db.polls) db.polls = {};
            db.polls[id] = poll;
            guardarDB(db);

            const embed = construirEmbedPoll(poll);
            const botones = construirBotonesPoll(id, opciones, false);

            await interaction.reply({ embeds: [embed], components: botones });
            const msg = await interaction.fetchReply();

            db.polls[id].mensaje_id = msg.id;
            guardarDB(db);

            // Cerrar automáticamente si hay duración
            if (duracion && duracion > 0) {
                setTimeout(async () => {
                    await cerrarPollAutomatico(client, id);
                }, duracion * 60 * 60 * 1000);

                console.log(`[POLL] Encuesta "${pregunta}" se cerrará en ${duracion}h`);
            }

        } catch (error) {
            console.error('[POLL] Error creando encuesta:', error);
            const msg = { content: `❌ Error: ${error.message}`, ephemeral: true };
            if (interaction.replied) await interaction.followUp(msg);
            else await interaction.reply(msg);
        }
    }
}

// --- CERRAR POLL AUTOMÁTICO ---

async function cerrarPollAutomatico(client, pollId) {
    const db = cargarDB();
    const poll = db.polls?.[pollId];
    if (!poll || poll.cerrada) return;

    poll.cerrada = true;
    guardarDB(db);

    try {
        const canal = await client.channels.fetch(poll.canal_id);
        const mensaje = await canal.messages.fetch(poll.mensaje_id);
        const embed = construirEmbedPoll(poll);
        await mensaje.edit({ embeds: [embed], components: [] });
        console.log(`[POLL] Encuesta "${poll.pregunta}" cerrada automáticamente`);
    } catch (e) {
        console.error('[POLL] Error cerrando automáticamente:', e.message);
    }
}

// --- GESTIÓN DE BOTONES ---

async function handleButton(interaction, client) {
    const id = interaction.customId;

    // Votar
    if (id.startsWith('pol_votar_')) {
        const partes = id.split('_');
        const pollId = partes[2];
        const opcionIdx = parseInt(partes[3]);

        const db = cargarDB();
        const poll = db.polls?.[pollId];
        if (!poll) return interaction.reply({ content: '❌ Encuesta no encontrada.', ephemeral: true });
        if (poll.cerrada) return interaction.reply({ content: '🔒 Esta encuesta ya está cerrada.', ephemeral: true });

        const usuario = interaction.user.id;

        // Quitar voto anterior si existe
        Object.keys(poll.votos).forEach(idx => {
            poll.votos[idx] = poll.votos[idx].filter(u => u !== usuario);
        });

        // Añadir nuevo voto
        poll.votos[opcionIdx].push(usuario);
        guardarDB(db);

        // Actualizar embed
        const embed = construirEmbedPoll(poll);
        const botones = construirBotonesPoll(pollId, poll.opciones, false);
        await interaction.update({ embeds: [embed], components: botones });
        return;
    }

    // Cerrar encuesta (admin)
    if (id.startsWith('pol_cerrar_')) {
        if (!interaction.member.permissions.has('ManageMessages')) {
            return interaction.reply({ content: '⛔ Solo admins pueden cerrar encuestas.', ephemeral: true });
        }

        const pollId = id.replace('pol_cerrar_', '');
        const db = cargarDB();
        const poll = db.polls?.[pollId];
        if (!poll) return interaction.reply({ content: '❌ Encuesta no encontrada.', ephemeral: true });

        poll.cerrada = true;
        guardarDB(db);

        const embed = construirEmbedPoll(poll);
        await interaction.update({ embeds: [embed], components: [] });
        return;
    }
}

module.exports = { mostrarModalPoll, handleModal, handleButton };
