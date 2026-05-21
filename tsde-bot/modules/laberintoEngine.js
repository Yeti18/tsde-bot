const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder
} = require('discord.js');
const fs = require('fs');
const rcon = require('./rconHelper.js');

const DB_PATH = './database.json';

// Cronómetros activos en memoria: { jugador: timestamp_inicio }
const cronometros = {};

// ID del mensaje del panel activo
let panelMensajeId = null;
let panelCanalId = null;
let intervaloActualizacion = null;

// --- BASE DE DATOS ---

function cargarDB() {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function guardarDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function cargarLaberinto() {
    const db = cargarDB();
    if (!db.laberinto) db.laberinto = { evento_activo: null, resultados: [] };
    return db.laberinto;
}

function guardarLaberinto(laberinto) {
    const db = cargarDB();
    db.laberinto = laberinto;
    guardarDB(db);
}

// --- HELPERS ---

function esAdmin(interaction) {
    return interaction.member.permissions.has('ManageMessages');
}

function formatearTiempo(ms) {
    const mins = Math.floor(ms / 60000);
    const segs = Math.floor((ms % 60000) / 1000);
    const decimas = Math.floor((ms % 1000) / 100);
    return `${String(mins).padStart(2, '0')}:${String(segs).padStart(2, '0')}.${decimas}`;
}

function ordenarResultados(resultados) {
    return [...resultados].sort((a, b) => {
        // Completados primero, ordenados por tiempo ascendente
        if (a.completado && !b.completado) return -1;
        if (!a.completado && b.completado) return 1;
        if (a.completado && b.completado) return a.tiempo_ms - b.tiempo_ms;
        return 0;
    });
}

// --- EMBEDS ---

function construirEmbedInscripciones(evento) {
    const inscritos = evento.inscritos || [];
    const minimo = evento.minimo || 5;
    const listos = inscritos.length >= minimo;

    const embed = new EmbedBuilder()
        .setTitle('🌀 LABERINTO TSDE — Inscripciones')
        .setColor(0x9B59B6)
        .addFields(
            { name: '🎁 Recompensa', value: evento.recompensa, inline: true },
            { name: '👥 Mínimo jugadores', value: `${inscritos.length}/${minimo}`, inline: true }
        );

    if (inscritos.length > 0) {
        embed.addFields({
            name: '✅ Inscritos',
            value: inscritos.map((j, i) => `${i + 1}. ${j}`).join('\n'),
            inline: false
        });
    } else {
        embed.addFields({ name: '✅ Inscritos', value: 'Nadie inscrito aún', inline: false });
    }

    embed.setFooter({
        text: listos
            ? `✅ Mínimo alcanzado — El admin puede iniciar el evento`
            : `Faltan ${minimo - inscritos.length} jugadores para poder iniciar`
    });

    return embed;
}

function construirEmbedCronometros() {
    const lab = cargarLaberinto();
    const resultados = ordenarResultados(lab.resultados || []);
    const recompensa = lab.evento_activo?.recompensa || '—';

    const embed = new EmbedBuilder()
        .setTitle('⏱️ LABERINTO EN CURSO — Panel de control')
        .setColor(0xF39C12)
        .addFields({ name: '🎁 Recompensa', value: recompensa, inline: false });

    // Cronómetros activos
    if (Object.keys(cronometros).length > 0) {
        const lineas = Object.entries(cronometros).map(([jugador, inicio]) => {
            const transcurrido = Date.now() - inicio;
            return `🏃 **${jugador}** — \`${formatearTiempo(transcurrido)}\``;
        });
        embed.addFields({ name: '⏱️ En curso', value: lineas.join('\n'), inline: false });
    }

    // Resultados guardados (ordenados correctamente)
    const completados = resultados.filter(r => r.completado);
    if (completados.length > 0) {
        const medallas = ['🥇', '🥈', '🥉'];
        const lineas = completados.map((r, i) => {
            const medal = i < 3 ? medallas[i] : `\`${i + 1}.\``;
            return `${medal} **${r.jugador}** — \`${formatearTiempo(r.tiempo_ms)}\``;
        });
        embed.addFields({ name: '🏆 Resultados', value: lineas.join('\n'), inline: false });
    }

    const noCompletados = resultados.filter(r => !r.completado);
    if (noCompletados.length > 0) {
        embed.addFields({
            name: 'No completado',
            value: noCompletados.map(r => `❌ ${r.jugador}`).join('\n'),
            inline: false
        });
    }

    if (Object.keys(cronometros).length === 0 && resultados.length === 0) {
        embed.addFields({ name: 'Estado', value: 'Usa **➕ Añadir jugador** para cronometrar.', inline: false });
    }

    embed.setFooter({ text: 'Actualización en tiempo real cada 5 segundos' });
    return embed;
}

function construirEmbedPodiumFinal() {
    const lab = cargarLaberinto();
    const resultados = ordenarResultados(lab.resultados || []);
    const recompensa = lab.evento_activo?.recompensa || '—';

    const embed = new EmbedBuilder()
        .setTitle('🏆 RESULTADOS FINALES — Laberinto TSDE')
        .setColor(0xF1C40F)
        .addFields({ name: '🎁 Recompensa para todos', value: recompensa, inline: false });

    if (resultados.length === 0) {
        embed.setDescription('Sin resultados registrados.');
        return embed;
    }

    const medallas = ['🥇', '🥈', '🥉'];
    const lineas = resultados.map((r, i) => {
        if (r.completado) {
            const medal = i < 3 ? medallas[i] : `\`${i + 1}.\``;
            return `${medal} **${r.jugador}** — \`${formatearTiempo(r.tiempo_ms)}\``;
        }
        return `❌ **${r.jugador}** — No completado`;
    });

    embed.setDescription(lineas.join('\n'));
    embed.setFooter({ text: `${resultados.length} participantes` });
    return embed;
}

// --- BOTONES DINÁMICOS ---

function construirBotonesInscripciones() {
    const lab = cargarLaberinto();
    const inscritos = lab.evento_activo?.inscritos || [];
    const minimo = lab.evento_activo?.minimo || 5;
    const listos = inscritos.length >= minimo;

    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('lab_apuntar')
                .setLabel('✋ Apuntarme')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('lab_desapuntar')
                .setLabel('❌ Borrarme')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('lab_iniciar')
                .setLabel('▶️ Iniciar evento')
                .setStyle(ButtonStyle.Danger)
                .setDisabled(!listos),
            new ButtonBuilder()
                .setCustomId('lab_cancelar_evento')
                .setLabel('🗑️ Cancelar')
                .setStyle(ButtonStyle.Secondary)
        )
    ];
}

function construirBotonesCronometros(client) {
    const jugadores = Object.keys(cronometros);
    const rows = [];

    // Fila 0 — botones generales
    rows.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('lab_add_jugador')
            .setLabel('➕ Añadir jugador')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('lab_finalizar')
            .setLabel('🏁 Finalizar evento')
            .setStyle(ButtonStyle.Primary)
    ));

    // Filas 1-3 — botón STOP por jugador (máx 15)
    const chunks = [];
    for (let i = 0; i < Math.min(jugadores.length, 15); i += 5) {
        chunks.push(jugadores.slice(i, i + 5));
    }
    chunks.forEach(grupo => {
        const row = new ActionRowBuilder();
        grupo.forEach((jugador, idx) => {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`lab_stop_${Buffer.from(jugador).toString('base64')}`)
                    .setLabel(`⏹ ${jugador.length > 18 ? jugador.substring(0, 18) + '…' : jugador}`)
                    .setStyle(ButtonStyle.Danger)
            );
        });
        rows.push(row);
    });

    // Fila 4 — desplegable ANULAR
    if (jugadores.length > 0) {
        rows.push(new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('lab_anular_select')
                .setPlaceholder('❌ Anular jugador (no completó)...')
                .addOptions(jugadores.slice(0, 25).map(j => ({
                    label: j,
                    value: j,
                    emoji: '❌'
                })))
        ));
    }

    return rows.slice(0, 5);
}

// --- ACTUALIZACIÓN AUTOMÁTICA ---

async function iniciarActualizacion(client) {
    if (intervaloActualizacion) clearInterval(intervaloActualizacion);

    intervaloActualizacion = setInterval(async () => {
        if (!panelMensajeId || !panelCanalId || Object.keys(cronometros).length === 0) return;
        try {
            const canal = await client.channels.fetch(panelCanalId);
            const mensaje = await canal.messages.fetch(panelMensajeId);
            await mensaje.edit({
                embeds: [construirEmbedCronometros()],
                components: construirBotonesCronometros(client)
            });
        } catch (e) {
            clearInterval(intervaloActualizacion);
        }
    }, 5000);
}

function detenerActualizacion() {
    if (intervaloActualizacion) {
        clearInterval(intervaloActualizacion);
        intervaloActualizacion = null;
    }
}

// --- MODAL CREAR EVENTO ---

async function mostrarModalCrearLaberinto(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('lab_modal_crear')
        .setTitle('Crear evento Laberinto TSDE');

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('recompensa')
                .setLabel('Recompensa')
                .setPlaceholder('Ej: 500 TSDE Coins + Rex nivel 300...')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('minimo')
                .setLabel('Mínimo de jugadores para iniciar')
                .setPlaceholder('5')
                .setValue('5')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
        )
    );

    await interaction.showModal(modal);
}

// --- GESTIÓN DE MODALES ---

async function handleModal(interaction, client) {
    if (interaction.customId === 'lab_modal_crear') {
        try {
            const recompensa = interaction.fields.getTextInputValue('recompensa');
            const minimo = parseInt(interaction.fields.getTextInputValue('minimo')) || 5;

            const lab = cargarLaberinto();
            lab.evento_activo = {
                recompensa,
                minimo,
                inscritos: [],
                estado: 'inscripciones'
            };
            lab.resultados = [];
            guardarLaberinto(lab);

            Object.keys(cronometros).forEach(k => delete cronometros[k]);

            const config = require('../config.json');
            const canal = await client.channels.fetch(config.canales.eventos).catch(() => null);
            if (!canal) return interaction.reply({ content: '❌ Canal de eventos no configurado.', ephemeral: true });

            const embed = construirEmbedInscripciones(lab.evento_activo);
            const botones = construirBotonesInscripciones();
            const mensaje = await canal.send({ embeds: [embed], components: botones });

            panelCanalId = config.canales.eventos;
            panelMensajeId = mensaje.id;

            await interaction.reply({ content: `✅ Laberinto creado en <#${config.canales.eventos}>`, ephemeral: true });

        } catch (error) {
            console.error('[LAB] Error creando laberinto:', error);
            await interaction.reply({ content: `❌ Error: ${error.message}`, ephemeral: true });
        }
    }

    if (interaction.customId === 'lab_modal_add_jugador') {
        try {
            const jugador = interaction.fields.getTextInputValue('nombre').trim();

            if (cronometros[jugador] !== undefined) {
                return interaction.reply({ content: `⚠️ **${jugador}** ya tiene cronómetro activo.`, ephemeral: true });
            }

            cronometros[jugador] = Date.now();

            const embed = construirEmbedCronometros();
            const botones = construirBotonesCronometros(client);
            await interaction.update({ embeds: [embed], components: botones });

        } catch (error) {
            console.error('[LAB] Error añadiendo jugador:', error);
            await interaction.reply({ content: `❌ Error: ${error.message}`, ephemeral: true });
        }
    }
}

// --- GESTIÓN DE BOTONES ---

async function handleButton(interaction, client) {
    const id = interaction.customId;

    // Apuntarse al laberinto
    if (id === 'lab_apuntar') {
        const lab = cargarLaberinto();
        if (!lab.evento_activo) return interaction.reply({ content: 'No hay evento activo.', ephemeral: true });

        const nombre = interaction.user.displayName;
        if (lab.evento_activo.inscritos.includes(nombre)) {
            return interaction.reply({ content: '⚠️ Ya estás inscrito.', ephemeral: true });
        }

        lab.evento_activo.inscritos.push(nombre);
        guardarLaberinto(lab);

        const embed = construirEmbedInscripciones(lab.evento_activo);
        const botones = construirBotonesInscripciones();
        await interaction.update({ embeds: [embed], components: botones });
        return;
    }

    // Borrar inscripción
    if (id === 'lab_desapuntar') {
        const lab = cargarLaberinto();
        if (!lab.evento_activo) return interaction.reply({ content: 'No hay evento activo.', ephemeral: true });

        const nombre = interaction.user.displayName;
        if (!lab.evento_activo.inscritos.includes(nombre)) {
            return interaction.reply({ content: '⚠️ No estás inscrito.', ephemeral: true });
        }

        lab.evento_activo.inscritos = lab.evento_activo.inscritos.filter(j => j !== nombre);
        guardarLaberinto(lab);

        const embed = construirEmbedInscripciones(lab.evento_activo);
        const botones = construirBotonesInscripciones();
        await interaction.update({ embeds: [embed], components: botones });
        return;
    }

    // Iniciar evento (admin)
    if (id === 'lab_iniciar') {
        if (!esAdmin(interaction)) return interaction.reply({ content: '⛔ Solo admins.', ephemeral: true });

        const lab = cargarLaberinto();
        if (!lab.evento_activo) return interaction.reply({ content: 'No hay evento activo.', ephemeral: true });

        const inscritos = lab.evento_activo.inscritos || [];
        if (inscritos.length < lab.evento_activo.minimo) {
            return interaction.reply({
                content: `❌ Mínimo ${lab.evento_activo.minimo} jugadores. Hay ${inscritos.length}.`,
                ephemeral: true
            });
        }

        lab.evento_activo.estado = 'en_curso';
        guardarLaberinto(lab);
        Object.keys(cronometros).forEach(k => delete cronometros[k]);

        panelCanalId = interaction.channelId;
        panelMensajeId = interaction.message.id;

        const embed = construirEmbedCronometros();
        const botones = construirBotonesCronometros(client);
        await interaction.update({ embeds: [embed], components: botones });

        iniciarActualizacion(client);
        await rcon.broadcast(`¡LABERINTO TSDE ha comenzado! Dirigíos a la entrada.`);
        return;
    }

    // Cancelar evento (admin)
    if (id === 'lab_cancelar_evento') {
        if (!esAdmin(interaction)) return interaction.reply({ content: '⛔ Solo admins.', ephemeral: true });

        const lab = cargarLaberinto();
        lab.evento_activo = null;
        lab.resultados = [];
        guardarLaberinto(lab);
        Object.keys(cronometros).forEach(k => delete cronometros[k]);
        detenerActualizacion();

        await interaction.update({
            embeds: [new EmbedBuilder().setTitle('❌ Evento cancelado').setColor(0xE74C3C)],
            components: []
        });
        return;
    }

    // Añadir jugador (admin)
    if (id === 'lab_add_jugador') {
        if (!esAdmin(interaction)) return interaction.reply({ content: '⛔ Solo admins.', ephemeral: true });

        const modal = new ModalBuilder()
            .setCustomId('lab_modal_add_jugador')
            .setTitle('Añadir jugador al cronómetro');

        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('nombre')
                    .setLabel('Nombre del jugador en ARK')
                    .setPlaceholder('Nombre exacto...')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            )
        );

        await interaction.showModal(modal);
        return;
    }

    // STOP — jugador individual
    if (id.startsWith('lab_stop_')) {
        if (!esAdmin(interaction)) return interaction.reply({ content: '⛔ Solo admins.', ephemeral: true });

        const jugadorB64 = id.replace('lab_stop_', '');
        const jugador = Buffer.from(jugadorB64, 'base64').toString('utf8');

        if (cronometros[jugador] === undefined) {
            return interaction.reply({ content: `⚠️ **${jugador}** no tiene cronómetro activo.`, ephemeral: true });
        }

        const tiempoMs = Date.now() - cronometros[jugador];
        delete cronometros[jugador];

        const lab = cargarLaberinto();
        // Añadir resultado sin reordenar — la función ordenarResultados lo hace al mostrar
        lab.resultados.push({
            jugador,
            tiempo_ms: tiempoMs,
            completado: true,
            fecha: new Date().toISOString()
        });
        guardarLaberinto(lab);

        await rcon.broadcast(`LABERINTO: ${jugador} ha completado en ${formatearTiempo(tiempoMs)}!`);

        const embed = construirEmbedCronometros();
        const botones = construirBotonesCronometros(client);
        await interaction.update({ embeds: [embed], components: botones });
        return;
    }

    // Finalizar evento (admin)
    if (id === 'lab_finalizar') {
        if (!esAdmin(interaction)) return interaction.reply({ content: '⛔ Solo admins.', ephemeral: true });

        detenerActualizacion();

        const lab = cargarLaberinto();
        const completados = ordenarResultados(lab.resultados).filter(r => r.completado);
        if (completados.length > 0) {
            await rcon.broadcast(`LABERINTO TSDE finalizado! Ganador: ${completados[0].jugador} con ${formatearTiempo(completados[0].tiempo_ms)}!`);
        }

        const embed = construirEmbedPodiumFinal();
        await interaction.update({
            embeds: [embed],
            components: [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('lab_reset')
                        .setLabel('🔄 Reset para próximo evento')
                        .setStyle(ButtonStyle.Danger)
                )
            ]
        });
        return;
    }

    // Reset
    if (id === 'lab_reset') {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '⛔ Solo administradores.', ephemeral: true });
        }

        const lab = cargarLaberinto();
        lab.evento_activo = null;
        lab.resultados = [];
        guardarLaberinto(lab);
        Object.keys(cronometros).forEach(k => delete cronometros[k]);

        await interaction.update({
            embeds: [new EmbedBuilder()
                .setTitle('🔄 Laberinto reseteado')
                .setDescription('Listo para el próximo evento.')
                .setColor(0x9B59B6)],
            components: []
        });
        return;
    }
}

// --- GESTIÓN DE SELECT MENUS ---

async function handleSelect(interaction, client) {
    if (interaction.customId === 'lab_anular_select') {
        if (!esAdmin(interaction)) return interaction.reply({ content: '⛔ Solo admins.', ephemeral: true });

        const jugador = interaction.values[0];

        if (cronometros[jugador] !== undefined) {
            delete cronometros[jugador];
        }

        const lab = cargarLaberinto();
        const yaExiste = lab.resultados.some(r => r.jugador === jugador);
        if (!yaExiste) {
            lab.resultados.push({
                jugador,
                tiempo_ms: null,
                completado: false,
                fecha: new Date().toISOString()
            });
            guardarLaberinto(lab);
        }

        const embed = construirEmbedCronometros();
        const botones = construirBotonesCronometros(client);
        await interaction.update({ embeds: [embed], components: botones });
    }
}

// --- COMANDO PÚBLICO DE PODIUM ---

async function verPodium(interaction) {
    const lab = cargarLaberinto();
    const resultados = ordenarResultados(lab.resultados || []);

    const embed = new EmbedBuilder()
        .setTitle('🏆 Podium Laberinto TSDE')
        .setColor(0x9B59B6);

    if (resultados.length === 0) {
        embed.setDescription('Sin resultados aún.');
    } else {
        const medallas = ['🥇', '🥈', '🥉'];
        const lineas = resultados.map((r, i) => {
            if (r.completado) {
                const medal = i < 3 ? medallas[i] : `\`${i + 1}.\``;
                return `${medal} **${r.jugador}** — \`${formatearTiempo(r.tiempo_ms)}\``;
            }
            return `❌ **${r.jugador}** — No completado`;
        });
        embed.setDescription(lineas.join('\n'));
    }

    const recompensa = lab.evento_activo?.recompensa;
    if (recompensa) embed.setFooter({ text: `Recompensa: ${recompensa}` });

    await interaction.reply({ embeds: [embed] });
}

module.exports = {
    mostrarModalCrearLaberinto,
    handleButton,
    handleModal,
    handleSelect,
    verPodium
};
