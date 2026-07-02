const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ChannelType,
    PermissionFlagsBits,
    MessageFlags
} = require('discord.js');
const config = require('../config.json');
const database = require('../db.js');

// Horario de atención España
const HORA_INICIO = 10;
const HORA_FIN = 1;

const ZONAS = [
    { pais: '🇲🇽 México (CDMX)', offset: -7 },
    { pais: '🇨🇴 Colombia', offset: -6 },
    { pais: '🇻🇪 Venezuela', offset: -5 },
    { pais: '🇦🇷 Argentina', offset: -4 },
    { pais: '🇨🇱 Chile', offset: -4 }
];

// Compatibilidad con código existente
function cargarDB() {
    return {
        incubadoras: database.getIncubadoras(),
        tickets: { historial: [] },
        reportes: []
    };
}

function guardarDB(data) {} // No-op, SQLite se actualiza directamente

function cargarTickets() {
    return cargarDB();
}

function guardarTickets(db) {} // No-op

function generarPinAleatorio() {
    return Math.floor(1000 + Math.random() * 9000).toString();
}

function estaEnHorario() {
    const ahora = new Date();
    const horaEspana = parseInt(new Intl.DateTimeFormat('es-ES', {
        timeZone: 'Europe/Madrid',
        hour: 'numeric',
        hour12: false
    }).format(ahora));

    if (HORA_FIN < HORA_INICIO) {
        return horaEspana >= HORA_INICIO || horaEspana < HORA_FIN;
    }
    return horaEspana >= HORA_INICIO && horaEspana < HORA_FIN;
}

function obtenerHorasLatam() {
    const ahora = new Date();
    return ZONAS.map(z => {
        const hora = new Intl.DateTimeFormat('es-ES', {
            timeZone: z.pais.includes('México') ? 'America/Mexico_City' :
                      z.pais.includes('Colombia') ? 'America/Bogota' :
                      z.pais.includes('Venezuela') ? 'America/Caracas' :
                      z.pais.includes('Argentina') ? 'America/Argentina/Buenos_Aires' :
                      'America/Santiago',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).format(ahora);
        return `${z.pais}: ${hora}`;
    }).join('\n');
}

function mensajeFueraHorario() {
    return `⏰ **Los admins no están disponibles ahora mismo.**\n\n` +
        `Nuestro horario de atención es de **10:00 a 01:00** (hora de España 🇪🇸)\n\n` +
        `**Hora actual en Latinoamérica:**\n${obtenerHorasLatam()}\n\n` +
        `Tu ticket está registrado y te atenderemos en cuanto estemos disponibles. ¡Gracias! 🦖`;
}

// --- EMBED PRINCIPAL DEL CANAL #tickets ---

function construirEmbedTickets() {
    return new EmbedBuilder()
        .setTitle('🎫 Sistema de Tickets — TSDE Arkeanos')
        .setColor(0x2ECC71)
        .setDescription(
            'Selecciona el tipo de ticket que necesitas.\n\n' +
            '**Horario de atención:** 10:00 — 01:00 (hora España 🇪🇸)\n' +
            'Fuera de horario tu ticket queda registrado y te atendemos en cuanto podamos.'
        )
        .addFields(
            { name: '🥚 Incubadora', value: 'Solicitar uso de incubadora de huevos', inline: true },
            { name: '🛒 Compra tienda', value: 'Entrega de producto comprado en la web', inline: true },
            { name: '⚠️ Reportar jugador', value: 'Reportar infracción con pruebas', inline: true },
            { name: '🦖 Soporte general', value: 'Cualquier otra consulta o problema', inline: true },
            { name: '🏳️ Bandera Blanca', value: 'Protección de 72h para nuevos jugadores. Pulsa el botón para ver los requisitos y solicitar.', inline: false }
        )
        .setFooter({ text: 'TSDE Arkeanos — Soporte' });
}

function construirBotonesTickets() {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('tkt_incubadora').setLabel('🥚 Incubadora').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('tkt_compra').setLabel('🛒 Compra tienda').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('tkt_reporte').setLabel('⚠️ Reportar jugador').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('tkt_soporte').setLabel('🦖 Soporte general').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('bb_solicitar').setLabel('🏳️ Bandera Blanca').setStyle(ButtonStyle.Primary)
        )
    ];
}

// --- ASEGURAR MENSAJE FIJO EN #tickets ---

async function asegurarMensajeTickets(client) {
    if (!config.canales.tickets) {
        console.warn('[TKT] Canal tickets no configurado');
        return;
    }
    try {
        const canal = await client.channels.fetch(config.canales.tickets);
        const mensajes = await canal.messages.fetch({ limit: 10 });
        const existente = mensajes.find(m => m.author.id === client.user.id);

        if (existente) {
            await existente.edit({ embeds: [construirEmbedTickets()], components: construirBotonesTickets() });
        } else {
            const msg = await canal.send({ embeds: [construirEmbedTickets()], components: construirBotonesTickets() });
            await msg.pin().catch(() => {});
        }
        console.log('[TKT] Mensaje de tickets asegurado');
    } catch (e) {
        console.error('[TKT] Error asegurando mensaje tickets:', e.message);
    }
}

// --- CREAR CANAL PRIVADO DE TICKET ---

async function crearCanalTicket(interaction, client, tipo, titulo) {
    const guild = interaction.guild;
    const categoria = config.canales.tickets
        ? (await client.channels.fetch(config.canales.tickets)).parentId
        : null;

    const rolAdmin = guild.roles.cache.find(r => r.id === config.roles.admin);
    const rolMod = guild.roles.cache.find(r => r.id === config.roles.moderador);

    const overwrites = [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
        { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.EmbedLinks] }
    ];
    if (rolAdmin) overwrites.push({ id: rolAdmin.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
    if (rolMod) overwrites.push({ id: rolMod.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });

    const nombreCanal = `${tipo}-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 90);

    const canal = await guild.channels.create({
        name: nombreCanal,
        type: ChannelType.GuildText,
        parent: categoria,
        permissionOverwrites: overwrites,
        topic: `Ticket ${titulo} de ${interaction.user.username}`
    });

    return canal;
}

// --- MODALES ---

function modalIncubadora() {
    const modal = new ModalBuilder().setCustomId('tkt_modal_incubadora').setTitle('🥚 Solicitud de Incubadora');
    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('tipo_huevo').setLabel('¿Qué tipo de huevo?').setPlaceholder('Ej: Wyvern de Fuego, Rex, Argentavis...').setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('cantidad').setLabel('¿Cuántos huevos?').setPlaceholder('Ej: 3').setStyle(TextInputStyle.Short).setMaxLength(3).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('nombre_ark').setLabel('Tu nombre en ARK / Gamertag').setStyle(TextInputStyle.Short).setRequired(true)
        )
    );
    return modal;
}

function modalCompra() {
    const modal = new ModalBuilder().setCustomId('tkt_modal_compra').setTitle('🛒 Entrega de Compra');
    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('codigo_pedido').setLabel('Código de pedido (TSDE-XXXX-XX)').setPlaceholder('TSDE-A7F3-12').setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('nombre_ark').setLabel('Tu nombre en ARK / Gamertag').setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('producto').setLabel('¿Qué compraste?').setPlaceholder('Ej: Pack Combate, 1500 GoldCoins...').setStyle(TextInputStyle.Short).setRequired(true)
        )
    );
    return modal;
}

function modalReporte() {
    const modal = new ModalBuilder().setCustomId('tkt_modal_reporte').setTitle('⚠️ Reportar Jugador');
    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('jugador_reportado').setLabel('Nombre del jugador reportado').setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('motivo').setLabel('Motivo del reporte').setStyle(TextInputStyle.Paragraph).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('pruebas').setLabel('¿Tienes pruebas? (capturas, vídeo...)').setPlaceholder('Describe las pruebas que puedes aportar').setStyle(TextInputStyle.Paragraph).setRequired(false)
        )
    );
    return modal;
}

function modalSoporte() {
    const modal = new ModalBuilder().setCustomId('tkt_modal_soporte').setTitle('🦖 Soporte General');
    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('nombre_ark').setLabel('Tu nombre en ARK / Gamertag').setStyle(TextInputStyle.Short).setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('descripcion').setLabel('Describe tu problema o consulta').setStyle(TextInputStyle.Paragraph).setRequired(true)
        )
    );
    return modal;
}

// --- BOTONES ADMIN EN EL CANAL DE TICKET ---

function botonesAdminIncubadora(incubadoraId) {
    return [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`tkt_eclosionado_${incubadoraId}`).setLabel('✅ Huevos eclosionados').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`tkt_cerrar`).setLabel('🔒 Cerrar ticket').setStyle(ButtonStyle.Secondary)
    )];
}

function botonesAdminGeneral() {
    return [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('tkt_resolver').setLabel('✅ Resuelto').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('tkt_cerrar').setLabel('🔒 Cerrar ticket').setStyle(ButtonStyle.Secondary)
    )];
}

// --- GESTIÓN DE BOTONES ---

async function handleButton(interaction, client) {
    const id = interaction.customId;

    // Botones de apertura de ticket
    if (id === 'tkt_incubadora') { await interaction.showModal(modalIncubadora()); return; }
    if (id === 'tkt_compra') { await interaction.showModal(modalCompra()); return; }
    if (id === 'tkt_reporte') { await interaction.showModal(modalReporte()); return; }
    if (id === 'tkt_soporte') { await interaction.showModal(modalSoporte()); return; }

    // Botón eclosionado (admin)
    if (id.startsWith('tkt_eclosionado_')) {
        const incubadoraId = parseInt(id.replace('tkt_eclosionado_', ''));
        await handleEclosionado(interaction, client, incubadoraId);
        return;
    }

    // Botón PIN actualizado (admin)
    if (id.startsWith('tkt_pinok_')) {
        const incubadoraId = parseInt(id.replace('tkt_pinok_', ''));
        await handlePinActualizado(interaction, client, incubadoraId);
        return;
    }

    // Resolver ticket
    if (id === 'tkt_resolver') {
        await interaction.update({
            embeds: [new EmbedBuilder().setTitle('✅ Ticket resuelto').setColor(0x2ECC71).setDescription('Este ticket ha sido marcado como resuelto.')],
            components: [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('tkt_cerrar').setLabel('🔒 Cerrar y archivar').setStyle(ButtonStyle.Secondary)
            )]
        });
        return;
    }

    // Cerrar ticket
    if (id === 'tkt_cerrar') {
        const esAdmin = interaction.member.permissions.has('ManageMessages');
        if (!esAdmin) {
            await interaction.reply({ content: '⛔ Solo los admins pueden cerrar tickets.', flags: MessageFlags.Ephemeral });
            return;
        }

        // Registrar cierre en SQLite
        database.addTicket({
            tipo: 'cerrado',
            discordId: interaction.user.id,
            discordUsername: interaction.user.username,
            datos: { canal: interaction.channel.name },
            estado: 'cerrado',
            fecha: new Date().toISOString()
        });

        await interaction.reply({ content: '🔒 Cerrando ticket en 5 segundos...' });
        setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
        return;
    }
}

// --- ECLOSIONADO ---

async function handleEclosionado(interaction, client, incubadoraId) {
    const esAdmin = interaction.member.permissions.has('ManageMessages');
    if (!esAdmin) {
        await interaction.reply({ content: '⛔ Solo los admins pueden marcar esto.', flags: MessageFlags.Ephemeral });
        return;
    }

    const nuevoPIN = generarPinAleatorio();

    // Actualizar el mensaje del canal sin mostrar el PIN (visible para todos)
    await interaction.update({
        embeds: [new EmbedBuilder()
            .setTitle('🥚 Huevos eclosionados')
            .setColor(0x2ECC71)
            .setDescription('✅ Huevos eclosionados correctamente. El admin está actualizando la incubadora.')
        ],
        components: []
    });

    // Enviar el PIN SOLO al admin por ephemeral (nadie más lo ve)
    await interaction.followUp({
        embeds: [new EmbedBuilder()
            .setTitle(`🔑 Nuevo PIN — Incubadora ${incubadoraId}`)
            .setColor(0xF39C12)
            .setDescription(
                `**Nuevo PIN:** \`${nuevoPIN}\`\n\n` +
                `Cambia el PIN en el juego y pulsa el botón cuando esté listo.`
            )
        ],
        components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`tkt_pinok_${incubadoraId}_${nuevoPIN}`).setLabel('🔑 PIN actualizado en el juego').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('tkt_cerrar').setLabel('🔒 Cerrar ticket').setStyle(ButtonStyle.Secondary)
        )],
        flags: MessageFlags.Ephemeral
    });
}

// --- PIN ACTUALIZADO ---

async function handlePinActualizado(interaction, client, incubadoraId) {
    const esAdmin = interaction.member.permissions.has('ManageMessages');
    if (!esAdmin) {
        await interaction.reply({ content: '⛔ Solo los admins.', flags: MessageFlags.Ephemeral });
        return;
    }

    const partes = interaction.customId.split('_');
    const nuevoPIN = partes[partes.length - 1];

    // Actualizar en SQLite
    database.updateIncubadora(incubadoraId, 'libre', nuevoPIN, null);

    await interaction.update({
        embeds: [new EmbedBuilder()
            .setTitle('✅ Incubadora liberada')
            .setColor(0x2ECC71)
            .setDescription(
                `Incubadora ${incubadoraId} actualizada con PIN \`${nuevoPIN}\` y marcada como **libre**.\n\n` +
                `Lista para el siguiente jugador.`
            )
        ],
        components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('tkt_cerrar').setLabel('🔒 Cerrar ticket').setStyle(ButtonStyle.Secondary)
        )]
    });
}

// --- GESTIÓN DE MODALES ---

async function handleModal(interaction, client) {
    const id = interaction.customId;

    if (id === 'tkt_modal_incubadora') await procesarIncubadora(interaction, client);
    if (id === 'tkt_modal_compra') await procesarCompra(interaction, client);
    if (id === 'tkt_modal_reporte') await procesarReporte(interaction, client);
    if (id === 'tkt_modal_soporte') await procesarSoporte(interaction, client);
}

// --- PROCESAR INCUBADORA ---

async function procesarIncubadora(interaction, client) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const tipoHuevo = interaction.fields.getTextInputValue('tipo_huevo');
    const cantidad = interaction.fields.getTextInputValue('cantidad');
    const nombreArk = interaction.fields.getTextInputValue('nombre_ark');

    // Buscar incubadora libre desde SQLite
    const incubadora = database.getIncubadoraLibre();
    if (!incubadora) {
        return interaction.editReply({
            content: '⚠️ Todas las incubadoras están ocupadas ahora mismo. Inténtalo en unos minutos o espera a que un admin libere una.'
        });
    }

    // Marcar como ocupada en SQLite
    database.updateIncubadora(incubadora.id, 'ocupada', null, interaction.user.id);

    // Crear canal privado
    const canal = await crearCanalTicket(interaction, client, 'incubadora', 'Incubadora');

    const enHorario = estaEnHorario();

    const embed = new EmbedBuilder()
        .setTitle('🥚 Solicitud de Incubadora')
        .setColor(0x3498DB)
        .addFields(
            { name: '👤 Jugador', value: `${interaction.user.username} (${nombreArk})`, inline: true },
            { name: '🥚 Tipo de huevo', value: tipoHuevo, inline: true },
            { name: '🔢 Cantidad', value: cantidad, inline: true },
            { name: '🏭 Incubadora asignada', value: `Incubadora **${incubadora.id}**`, inline: true },
            { name: '🔑 PIN actual', value: `\`${incubadora.pin}\``, inline: true }
        )
        .setTimestamp();

    await canal.send({
        content: `${interaction.user} — aquí está tu ticket de incubadora.`,
        embeds: [embed],
        components: botonesAdminIncubadora(incubadora.id)
    });

    if (!enHorario) {
        await canal.send({ content: mensajeFueraHorario() });
    }

    await interaction.editReply({
        content: `✅ Solicitud enviada. Tu canal privado: <#${canal.id}>\n🔑 PIN de la Incubadora ${incubadora.id}: \`${incubadora.pin}\``
    });
}

// --- PROCESAR COMPRA ---

async function procesarCompra(interaction, client) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const codigoPedido = interaction.fields.getTextInputValue('codigo_pedido');
    const nombreArk = interaction.fields.getTextInputValue('nombre_ark');
    const producto = interaction.fields.getTextInputValue('producto');

    const canal = await crearCanalTicket(interaction, client, 'compra', 'Compra Tienda');
    const enHorario = estaEnHorario();

    const embed = new EmbedBuilder()
        .setTitle('🛒 Entrega de Compra')
        .setColor(0xF1C40F)
        .addFields(
            { name: '👤 Jugador', value: `${interaction.user.username} (${nombreArk})`, inline: true },
            { name: '🔑 Código pedido', value: codigoPedido, inline: true },
            { name: '🛒 Producto', value: producto, inline: false }
        )
        .setTimestamp();

    await canal.send({
        content: `${interaction.user} — ticket de entrega registrado.`,
        embeds: [embed],
        components: botonesAdminGeneral()
    });

    if (!enHorario) await canal.send({ content: mensajeFueraHorario() });

    await interaction.editReply({ content: `✅ Ticket de entrega creado. Tu canal: <#${canal.id}>` });
}

// --- PROCESAR REPORTE ---

async function procesarReporte(interaction, client) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const jugadorReportado = interaction.fields.getTextInputValue('jugador_reportado');
    const motivo = interaction.fields.getTextInputValue('motivo');
    const pruebas = interaction.fields.getTextInputValue('pruebas') || 'Sin pruebas aportadas';

    // Guardar en SQLite
    database.addReporte({
        reportadoPor: interaction.user.username,
        jugadorReportado,
        motivo,
        pruebas,
        fecha: new Date().toISOString()
    });

    const canal = await crearCanalTicket(interaction, client, 'reporte', 'Reporte');
    const enHorario = estaEnHorario();

    const embed = new EmbedBuilder()
        .setTitle('⚠️ Reporte de Jugador')
        .setColor(0xE74C3C)
        .addFields(
            { name: '👤 Reportado por', value: interaction.user.username, inline: true },
            { name: '🎯 Jugador reportado', value: jugadorReportado, inline: true },
            { name: '📋 Motivo', value: motivo, inline: false },
            { name: '📸 Pruebas', value: pruebas, inline: false }
        )
        .setTimestamp();

    await canal.send({
        content: `${interaction.user} — reporte registrado.`,
        embeds: [embed],
        components: botonesAdminGeneral()
    });

    if (!enHorario) await canal.send({ content: mensajeFueraHorario() });

    await interaction.editReply({ content: `✅ Reporte enviado. Tu canal: <#${canal.id}>` });
}

// --- PROCESAR SOPORTE GENERAL ---

async function procesarSoporte(interaction, client) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const nombreArk = interaction.fields.getTextInputValue('nombre_ark');
    const descripcion = interaction.fields.getTextInputValue('descripcion');

    const canal = await crearCanalTicket(interaction, client, 'soporte', 'Soporte');
    const enHorario = estaEnHorario();

    const embed = new EmbedBuilder()
        .setTitle('🦖 Soporte General')
        .setColor(0x9B59B6)
        .addFields(
            { name: '👤 Jugador', value: `${interaction.user.username} (${nombreArk})`, inline: true },
            { name: '📋 Consulta', value: descripcion, inline: false }
        )
        .setTimestamp();

    await canal.send({
        content: `${interaction.user} — ticket de soporte creado.`,
        embeds: [embed],
        components: botonesAdminGeneral()
    });

    if (!enHorario) await canal.send({ content: mensajeFueraHorario() });

    await interaction.editReply({ content: `✅ Ticket creado. Tu canal: <#${canal.id}>` });
}

// --- COMANDO ADMIN: ADVERTIR JUGADOR ---

async function advertirJugador(interaction, client, usuario, motivo) {
    const canal = await interaction.guild.channels.create({
        name: `advertencia-${usuario.username}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 90),
        type: ChannelType.GuildText,
        parent: interaction.channel.parentId,
        permissionOverwrites: [
            { id: interaction.guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
            { id: usuario.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory] },
            { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
            { id: config.roles.admin, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
        ]
    });

    // Registrar en DB
    const db = cargarDB();
    if (!db.advertencias) db.advertencias = [];
    db.advertencias.push({
        jugadorId: usuario.id,
        jugadorUsername: usuario.username,
        motivo,
        adminId: interaction.user.id,
        adminUsername: interaction.user.username,
        fecha: new Date().toISOString()
    });
    guardarDB(db);

    const embed = new EmbedBuilder()
        .setTitle('⚠️ Advertencia Oficial — TSDE Arkeanos')
        .setColor(0xE74C3C)
        .setDescription(
            `${usuario} has recibido una advertencia oficial de la administración de TSDE Arkeanos.\n\n` +
            `**Motivo:** ${motivo}\n\n` +
            `Por favor revisa las normas del servidor en #normas. ` +
            `Las reincidencias pueden resultar en sanciones más graves.`
        )
        .addFields(
            { name: '👮 Admin', value: interaction.user.username, inline: true },
            { name: '📅 Fecha', value: new Date().toLocaleString('es-ES'), inline: true }
        )
        .setTimestamp();

    await canal.send({
        content: `${usuario}`,
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('tkt_cerrar').setLabel('🔒 Cerrar advertencia').setStyle(ButtonStyle.Secondary)
        )]
    });

    await interaction.reply({ content: `✅ Advertencia enviada a ${usuario.username}. Canal: <#${canal.id}>`, flags: MessageFlags.Ephemeral });
}

module.exports = {
    asegurarMensajeTickets,
    handleButton,
    handleModal,
    advertirJugador
};
