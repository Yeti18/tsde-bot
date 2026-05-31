const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const fs = require('fs');
const rcon = require('./rconHelper.js');
const { programarRecordatorios, cancelarRecordatorios, parsearFecha } = require('./recordatoriosEngine.js');

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

function ephemeralFlags() {
    return { flags: MessageFlags.Ephemeral };
}

// --- EMBEDS ---

function construirEmbedEvento(evento) {
    const inscritos = evento.inscritos || [];
    const limite = evento.limite || '∞';
    const lleno = evento.limite && inscritos.length >= evento.limite;

    const embed = new EmbedBuilder()
        .setTitle(`🎉 ${evento.titulo}`)
        .setColor(lleno ? 0xE74C3C : 0x9B59B6)
        .addFields(
            { name: '📅 Fecha y hora', value: evento.fecha, inline: true },
            { name: '🏆 Premio', value: evento.premio, inline: true },
            { name: '👥 Plazas', value: `${inscritos.length}/${limite}`, inline: true }
        );

    if (evento.descripcion) embed.setDescription(evento.descripcion);

    if (inscritos.length > 0) {
        embed.addFields({
            name: '✅ Inscritos',
            value: inscritos.map((u, i) => `${i + 1}. ${u}`).join('\n'),
            inline: false
        });
    }

    const espera = evento.lista_espera || [];
    if (espera.length > 0) {
        embed.addFields({
            name: '⏳ Lista de espera',
            value: espera.map((u, i) => `${i + 1}. ${u}`).join('\n'),
            inline: false
        });
    }

    if (evento.estado === 'cerrado') {
        embed.setFooter({ text: '🔒 Inscripciones cerradas' });
    } else {
        embed.setFooter({ text: lleno ? '🔴 Evento completo — Lista de espera activa' : '📝 Inscripciones abiertas' });
    }

    return embed;
}

function construirBotonesEvento(evento) {
    const inscritos = evento.inscritos || [];
    const lleno = evento.limite && inscritos.length >= evento.limite;

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`evt_inscribir_${evento.id}`)
            .setLabel(lleno ? '⏳ Lista de espera' : '✋ Inscribirme')
            .setStyle(lleno ? ButtonStyle.Secondary : ButtonStyle.Success)
            .setDisabled(evento.estado === 'cerrado'),

        new ButtonBuilder()
            .setCustomId(`evt_cancelar_inscripcion_${evento.id}`)
            .setLabel('❌ Cancelar inscripción')
            .setStyle(ButtonStyle.Danger)
            .setDisabled(evento.estado === 'cerrado'),

        new ButtonBuilder()
            .setCustomId(`evt_ver_inscritos_${evento.id}`)
            .setLabel('👥 Ver lista completa')
            .setStyle(ButtonStyle.Secondary)
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`evt_cerrar_${evento.id}`)
            .setLabel('🔒 Cerrar inscripciones')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(evento.estado === 'cerrado'),

        new ButtonBuilder()
            .setCustomId(`evt_cancelar_evento_${evento.id}`)
            .setLabel('🗑️ Cancelar evento')
            .setStyle(ButtonStyle.Danger)
    );

    const rows = [row1, row2];

    if (evento.estado === 'cerrado') {
        const row3 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`evt_taquillas_${evento.id}`)
                .setLabel('🔑 Asignar taquillas')
                .setStyle(ButtonStyle.Success)
        );
        rows.push(row3);
    }

    return rows;
}

// --- MODAL CREAR EVENTO ---

async function mostrarModalCrearEvento(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('evt_modal_crear')
        .setTitle('Crear nuevo evento TSDE');

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('titulo')
                .setLabel('Título del evento')
                .setPlaceholder('Ej: Torneo del Coliseo — T-Rex 1vs1')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('fecha')
                .setLabel('Fecha y hora (texto + DD/MM/AAAA HH:MM)')
                .setPlaceholder('Ej: Sábado 24 de mayo a las 21:00h | 24/05/2026 21:00')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('premio')
                .setLabel('Premio')
                .setPlaceholder('Ej: 1000 TSDE Coins + Rex nivel 350')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('limite')
                .setLabel('Plazas máximas (deja vacío = ilimitadas)')
                .setPlaceholder('Ej: 16')
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('descripcion')
                .setLabel('Descripción / Reglas del evento')
                .setPlaceholder('Describe las reglas, mecánicas, premios...')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
        )
    );

    await interaction.showModal(modal);
}

// --- GESTIÓN DE MODALES ---

async function handleModal(interaction, client) {
    if (interaction.customId === 'evt_modal_crear') {
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const config = require('../config.json');
            const db = cargarDB();

            const titulo = interaction.fields.getTextInputValue('titulo');
            const fecha = interaction.fields.getTextInputValue('fecha');
            const premio = interaction.fields.getTextInputValue('premio');
            const limiteRaw = interaction.fields.getTextInputValue('limite');
            const descripcion = interaction.fields.getTextInputValue('descripcion') || null;
            // Parsear fecha_timestamp del campo fecha si viene con | separador
            let fecha_timestamp = null;
            if (fecha.includes('|')) {
                const partes = fecha.split('|').map(p => p.trim());
                fecha = partes[0];
                fecha_timestamp = partes[1] || null;
            }

            const limite = limiteRaw ? parseInt(limiteRaw) : null;
            const id = Date.now().toString();

            if (!config.canales.eventos || config.canales.eventos === 'ID_CANAL_EVENTOS') {
                return interaction.editReply({ content: '❌ Error: El canal de eventos no está configurado en config.json' });
            }

            const evento = {
                id,
                titulo,
                fecha,
                fecha_timestamp,
                premio,
                limite,
                inscritos: [],
                lista_espera: [],
                estado: 'abierto',
                creado_por: interaction.user.username,
                mensaje_id: null,
                canal_id: config.canales.eventos
            };

            db.eventos_activos[id] = evento;
            guardarDB(db);

            const canal = await client.channels.fetch(config.canales.eventos).catch(() => null);
            if (!canal) {
                return interaction.editReply({ content: '❌ Error: No puedo acceder al canal de eventos.' });
            }

            const embed = construirEmbedEvento(evento);
            const botones = construirBotonesEvento(evento);
            const mensaje = await canal.send({ embeds: [embed], components: botones });

            db.eventos_activos[id].mensaje_id = mensaje.id;
            guardarDB(db);

            if (fecha_timestamp) {
                await programarRecordatorios(client, db.eventos_activos[id]);
            }

            await rcon.broadcast(`NUEVO EVENTO: ${titulo} - ${fecha}. Inscribete en Discord!`);

            await interaction.editReply({
                content: `✅ Evento **${titulo}** creado y publicado en <#${config.canales.eventos}>`
            });

        } catch (error) {
            console.error('[EVT] Error creando evento:', error);
            const msg = `❌ Error: ${error.message}`;
            if (interaction.deferred) {
                await interaction.editReply({ content: msg });
            } else {
                await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
            }
        }
    }
}

// --- GESTIÓN DE BOTONES ---

async function handleButton(interaction, client) {
    const id = interaction.customId;

    // Inscribirse o lista de espera
    if (id.startsWith('evt_inscribir_')) {
        const eventoId = id.replace('evt_inscribir_', '');
        const db = cargarDB();
        const evento = db.eventos_activos[eventoId];
        if (!evento) return interaction.reply({ content: 'Evento no encontrado.', flags: MessageFlags.Ephemeral });

        const nombre = interaction.user.username;
        const penalizados = db.penalizados || [];

        if (penalizados.includes(nombre)) {
            return interaction.reply({
                content: '⛔ Estás penalizado y no puedes inscribirte en eventos. Contacta con un administrador.',
                flags: MessageFlags.Ephemeral
            });
        }

        const lleno = evento.limite && evento.inscritos.length >= evento.limite;

        if (!lleno) {
            if (evento.inscritos.includes(nombre)) {
                return interaction.reply({ content: '⚠️ Ya estás inscrito en este evento.', flags: MessageFlags.Ephemeral });
            }
            evento.inscritos.push(nombre);
            await interaction.reply({ content: `✅ ¡Inscripción confirmada en **${evento.titulo}**! Recuerda estar 15 minutos antes.`, flags: MessageFlags.Ephemeral });
        } else {
            if (evento.lista_espera.includes(nombre)) {
                return interaction.reply({ content: '⚠️ Ya estás en la lista de espera.', flags: MessageFlags.Ephemeral });
            }
            evento.lista_espera.push(nombre);
            await interaction.reply({ content: `⏳ Te hemos añadido a la lista de espera de **${evento.titulo}**.`, flags: MessageFlags.Ephemeral });
        }

        guardarDB(db);
        await actualizarMensajeEvento(interaction, evento, client);
        return;
    }

    // Cancelar inscripción
    if (id.startsWith('evt_cancelar_inscripcion_')) {
        const eventoId = id.replace('evt_cancelar_inscripcion_', '');
        const db = cargarDB();
        const evento = db.eventos_activos[eventoId];
        if (!evento) return interaction.reply({ content: 'Evento no encontrado.', flags: MessageFlags.Ephemeral });

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const nombre = interaction.user.username;
        const ahora = Date.now();
        const tresHorasEnMs = 3 * 60 * 60 * 1000;

        if (evento.timestamp && (evento.timestamp - ahora) < tresHorasEnMs) {
            const config = require('../config.json');
            const canalLogs = await client.channels.fetch(config.canales.logs);
            canalLogs.send(`⚠️ **${nombre}** ha cancelado su inscripción en **${evento.titulo}** con menos de 3 horas de antelación. ¿Aplicar penalización?`);
        }

        if (evento.inscritos.includes(nombre)) {
            evento.inscritos = evento.inscritos.filter(u => u !== nombre);
            if (evento.lista_espera.length > 0) {
                const siguiente = evento.lista_espera.shift();
                evento.inscritos.push(siguiente);
                const canal = await client.channels.fetch(evento.canal_id);
                canal.send(`🎉 <@${siguiente}> ¡Se ha liberado una plaza en **${evento.titulo}**! Ya estás inscrito.`);
            }
            await interaction.followUp({ content: `✅ Has cancelado tu inscripción en **${evento.titulo}**.`, flags: MessageFlags.Ephemeral });
        } else if (evento.lista_espera.includes(nombre)) {
            evento.lista_espera = evento.lista_espera.filter(u => u !== nombre);
            await interaction.followUp({ content: `✅ Te hemos eliminado de la lista de espera.`, flags: MessageFlags.Ephemeral });
        } else {
            return interaction.followUp({ content: '⚠️ No estás inscrito en este evento.', flags: MessageFlags.Ephemeral });
        }

        guardarDB(db);
        await actualizarMensajeEvento(interaction, evento, client);
        return;
    }

    // Ver lista completa
    if (id.startsWith('evt_ver_inscritos_')) {
        const eventoId = id.replace('evt_ver_inscritos_', '');
        const db = cargarDB();
        const evento = db.eventos_activos[eventoId];
        if (!evento) return interaction.reply({ content: 'Evento no encontrado.', flags: MessageFlags.Ephemeral });

        const lista = evento.inscritos.length > 0
            ? evento.inscritos.map((u, i) => `${i + 1}. ${u}`).join('\n')
            : 'Nadie inscrito aún.';

        const espera = evento.lista_espera.length > 0
            ? evento.lista_espera.map((u, i) => `${i + 1}. ${u}`).join('\n')
            : 'Lista de espera vacía.';

        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle(`📋 Lista completa — ${evento.titulo}`)
                    .addFields(
                        { name: `✅ Inscritos (${evento.inscritos.length})`, value: lista },
                        { name: `⏳ Lista de espera (${evento.lista_espera.length})`, value: espera }
                    )
                    .setColor(0x9B59B6)
            ],
            flags: MessageFlags.Ephemeral
        });
    }

    // Cerrar inscripciones
    if (id.startsWith('evt_cerrar_')) {
        if (!esAdmin(interaction)) return interaction.reply({ content: '⛔ Solo admins.', flags: MessageFlags.Ephemeral });
        const eventoId = id.replace('evt_cerrar_', '');
        const db = cargarDB();
        const evento = db.eventos_activos[eventoId];
        if (!evento) return interaction.reply({ content: 'Evento no encontrado.', flags: MessageFlags.Ephemeral });

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        evento.estado = 'cerrado';
        guardarDB(db);
        await actualizarMensajeEvento(interaction, evento, client);
        await rcon.broadcast(`Inscripciones cerradas para: ${evento.titulo}.`);
        return interaction.followUp({ content: `🔒 Inscripciones cerradas para **${evento.titulo}**.`, flags: MessageFlags.Ephemeral });
    }

    // Asignar taquillas del Coliseo
    if (id.startsWith('evt_taquillas_')) {
        if (!esAdmin(interaction)) return interaction.reply({ content: '⛔ Solo admins.', flags: MessageFlags.Ephemeral });
        const eventoId = id.replace('evt_taquillas_', '');
        const db = cargarDB();
        const evento = db.eventos_activos[eventoId];
        if (!evento) return interaction.reply({ content: 'Evento no encontrado.', flags: MessageFlags.Ephemeral });

        const coliseo = require('./coliseoEngine.js');
        await coliseo.asignarTaquillas(interaction, client, evento);
        return;
    }

    // Cancelar evento completo
    if (id.startsWith('evt_cancelar_evento_')) {
        if (!esAdmin(interaction)) return interaction.reply({ content: '⛔ Solo admins.', flags: MessageFlags.Ephemeral });
        const eventoId = id.replace('evt_cancelar_evento_', '');
        const db = cargarDB();
        const evento = db.eventos_activos[eventoId];
        if (!evento) return interaction.reply({ content: 'Evento no encontrado.', flags: MessageFlags.Ephemeral });

        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        cancelarRecordatorios(eventoId);
        db.historial_eventos.push({ ...evento, estado: 'cancelado', cancelado_en: new Date().toISOString() });
        delete db.eventos_activos[eventoId];
        guardarDB(db);

        const canal = await client.channels.fetch(evento.canal_id);
        const mensaje = await canal.messages.fetch(evento.mensaje_id);
        await mensaje.edit({
            embeds: [
                new EmbedBuilder()
                    .setTitle(`❌ EVENTO CANCELADO — ${evento.titulo}`)
                    .setDescription('Este evento ha sido cancelado por la administración.')
                    .setColor(0xE74C3C)
            ],
            components: []
        });

        await rcon.broadcast(`EVENTO CANCELADO: ${evento.titulo}.`);
        return interaction.followUp({ content: `🗑️ Evento **${evento.titulo}** cancelado.`, flags: MessageFlags.Ephemeral });
    }
}

// --- ACTUALIZAR MENSAJE ---

async function actualizarMensajeEvento(interaction, evento, client) {
    try {
        const canal = await client.channels.fetch(evento.canal_id);
        const mensaje = await canal.messages.fetch(evento.mensaje_id);
        await mensaje.edit({
            embeds: [construirEmbedEvento(evento)],
            components: construirBotonesEvento(evento)
        });
    } catch (e) {
        console.error('[EVT] Error actualizando mensaje:', e.message);
    }
}

module.exports = { mostrarModalCrearEvento, handleButton, handleModal, handleSelect: async () => {} };
