const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags,
    PermissionFlagsBits,
    ChannelType
} = require('discord.js');
const config = require('../config.json');
const database = require('../db.js');

const DURACION_HORAS = 72;

// Compatibilidad: cargarBandera/guardarBandera ahora usan SQLite internamente
function cargarBandera() {
    const banderas = database.getAllBanderas();
    const result = {};
    for (const b of banderas) {
        result[b.id] = {
            id: b.id,
            discordId: b.discord_id,
            discordUsername: b.discord_username,
            nombreArk: b.nombre_ark,
            nombreTribu: b.nombre_tribu,
            estado: b.estado,
            fechaSolicitud: b.fecha_solicitud,
            fechaActivacion: b.fecha_activacion,
            fechaExpiracion: b.fecha_expiracion,
            canalId: b.canal_id,
            motivoDenegacion: b.motivo_denegacion,
            aviso24hEnviado: !!b.aviso_24h_enviado
        };
    }
    return result;
}

function guardarBandera(data) {
    for (const b of Object.values(data)) {
        database.setBandera(b);
    }
}

function esAdmin(interaction) {
    return interaction.member.permissions.has('ManageMessages');
}

// --- EMBED FIJO DE SOLICITUD (mensaje permanente en canal público) ---

function construirEmbedSolicitud() {
    return new EmbedBuilder()
        .setTitle('🏳️ Protección Bandera Blanca — 72 horas')
        .setColor(0x3498DB)
        .setDescription(
            'Si eres nuevo en TSDE Arkeanos, puedes solicitar 72 horas de protección ' +
            'para empezar tranquilo sin que te raideen.\n\n' +
            '**⚠️ ANTES de solicitarla, asegúrate de:**\n' +
            '✅ Haber aprendido el engrama WHITE FLAG PROTECTION (Bandera Blanca)\n' +
            '✅ Haber crafteado la Bandera Blanca *(10 Piel<:Hide:1518200933170024559>, 50 Madera<:Wood:1516359277743312926>, 50 Fibra<:Fiber:1516772238727184394>)*\n' +
            '✅ Haberla colocado visible cerca de tu base\n\n' +
            '⚠️ **Solo válida para tus primeros días en el servidor.** No se puede ' +
            'solicitar si ya la usaste antes o llevas tiempo jugando.\n\n' +
            'ℹ️ **Importante sobre cómo funciona:** la Bandera Blanca protege tu ' +
            '**estructura** de daño automáticamente. Tu personaje y tus dinos ' +
            '**no están protegidos por el juego en sí** — la protección real frente ' +
            'a ataques viene de la norma: cualquiera que te ataque, robe o sea hostil ' +
            'contigo durante estas 72h será **baneado inmediatamente**. Si alguien te ' +
            'ataca, repórtalo abriendo un ticket en #tickets.\n\n' +
            '🚫 Atacar, robar o ser hostil mientras tienes la protección activa ' +
            'resulta en baneo inmediato — lee las normas en #normas.'
        )
        .setFooter({ text: `Duración: ${DURACION_HORAS} horas desde la activación` });
}

function construirBotonSolicitar() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('bb_solicitar')
            .setLabel('🏳️ Solicitar Bandera Blanca')
            .setStyle(ButtonStyle.Primary)
    );
}

async function asegurarMensajeSolicitud(client) {
    if (!config.canales.bandera_blanca) {
        console.warn('[BB] Canal bandera_blanca no configurado en config.json');
        return;
    }

    try {
        const canal = await client.channels.fetch(config.canales.bandera_blanca);
        const mensajes = await canal.messages.fetch({ limit: 10 });
        const existente = mensajes.find(m => m.author.id === client.user.id);

        const embed = construirEmbedSolicitud();
        const botones = construirBotonSolicitar();

        if (existente) {
            await existente.edit({ embeds: [embed], components: [botones] });
        } else {
            const msg = await canal.send({ embeds: [embed], components: [botones] });
            await msg.pin().catch(() => {});
        }
        console.log('[BB] Mensaje de solicitud de Bandera Blanca asegurado');
    } catch (e) {
        console.error('[BB] Error asegurando mensaje de solicitud:', e.message);
    }
}

// --- MODAL DE SOLICITUD ---

function construirModalSolicitud() {
    const modal = new ModalBuilder()
        .setCustomId('bb_modal_solicitar')
        .setTitle('Solicitar Bandera Blanca');

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('nombre_ark')
                .setLabel('Tu nombre en ARK / Gamertag Xbox')
                .setPlaceholder('Para que los admins te encuentren fácilmente...')
                .setStyle(TextInputStyle.Short)
                .setMinLength(2)
                .setMaxLength(50)
                .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('nombre_tribu')
                .setLabel('Nombre de tu tribu (si tienes)')
                .setPlaceholder('Deja vacío si aún no tienes tribu...')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(50)
                .setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('confirmacion')
                .setLabel('¿Ya la has crafteado y colocado? (si/no)')
                .setPlaceholder('si')
                .setStyle(TextInputStyle.Short)
                .setMaxLength(5)
                .setRequired(true)
        )
    );

    return modal;
}

// --- EMBED Y BOTONES DEL CANAL PRIVADO ---

function construirEmbedCanal(solicitud) {
    const estados = {
        pendiente: { emoji: '🟡', texto: 'PENDIENTE DE REVISIÓN', color: 0xF39C12 },
        activo: { emoji: '🟢', texto: 'PROTECCIÓN ACTIVA', color: 0x2ECC71 },
        denegado: { emoji: '🔴', texto: 'SOLICITUD DENEGADA', color: 0xE74C3C },
        expirado: { emoji: '⚪', texto: 'PROTECCIÓN EXPIRADA', color: 0x95A5A6 }
    };
    const estado = estados[solicitud.estado] || estados.pendiente;

    const embed = new EmbedBuilder()
        .setTitle(`🏳️ Bandera Blanca — ${solicitud.nombreArk}`)
        .setColor(estado.color)
        .addFields(
            { name: 'Estado', value: `${estado.emoji} ${estado.texto}`, inline: true },
            { name: '👤 Discord', value: solicitud.discordUsername, inline: true },
            { name: '🎮 Nombre ARK', value: solicitud.nombreArk, inline: true },
            { name: '🛡️ Tribu', value: solicitud.nombreTribu || 'Sin tribu / No indicada', inline: true }
        )
        .setTimestamp(new Date(solicitud.fechaSolicitud));

    if (solicitud.estado === 'activo' && solicitud.fechaExpiracion) {
        embed.addFields({
            name: '⏱️ Expira',
            value: `<t:${Math.floor(new Date(solicitud.fechaExpiracion).getTime() / 1000)}:F> (<t:${Math.floor(new Date(solicitud.fechaExpiracion).getTime() / 1000)}:R>)`,
            inline: false
        });
    }

    if (solicitud.estado === 'pendiente') {
        embed.setDescription(
            'Comprobad que cumple los requisitos antes de activar.\n' +
            'Entrad al juego y activad la protección, luego pulsad el botón de abajo.'
        );
    }

    return embed;
}

function construirBotonesCanal(solicitud) {
    if (solicitud.estado === 'pendiente') {
        return [new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`bb_activar_${solicitud.id}`)
                .setLabel('✅ Activar protección')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`bb_denegar_cueva_${solicitud.id}`)
                .setLabel('❌ No cumple requisitos')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`bb_denegar_repetida_${solicitud.id}`)
                .setLabel('❌ Ya la usó antes')
                .setStyle(ButtonStyle.Danger)
        )];
    }

    if (solicitud.estado === 'activo') {
        return [new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`bb_quitar_${solicitud.id}`)
                .setLabel('🗑️ Quitar protección ahora')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`bb_cerrar_${solicitud.id}`)
                .setLabel('🔒 Cerrar canal')
                .setStyle(ButtonStyle.Secondary)
        )];
    }

    // denegado o expirado
    return [new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`bb_cerrar_${solicitud.id}`)
            .setLabel('🔒 Cerrar canal')
            .setStyle(ButtonStyle.Secondary)
    )];
}

// --- CREAR CANAL PRIVADO ---

async function crearCanalPrivado(interaction, client, solicitud) {
    const guild = interaction.guild;
    const categoria = config.canales.bandera_blanca
        ? (await client.channels.fetch(config.canales.bandera_blanca)).parentId
        : null;

    const rolAdmin = guild.roles.cache.find(r => r.id === config.roles.admin);
    const rolMod = guild.roles.cache.find(r => r.id === config.roles.moderador);

    const overwrites = [
        { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
        { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.EmbedLinks] }
    ];

    if (rolAdmin) overwrites.push({ id: rolAdmin.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });
    if (rolMod) overwrites.push({ id: rolMod.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] });

    const nombreCanal = `bandera-${solicitud.nombreArk}`.toLowerCase().replace(/[^a-z0-9-]/g, '-').slice(0, 90);

    const canal = await guild.channels.create({
        name: nombreCanal,
        type: ChannelType.GuildText,
        parent: categoria,
        permissionOverwrites: overwrites,
        topic: `Solicitud de Bandera Blanca de ${solicitud.nombreArk}`
    });

    return canal;
}

// --- GESTIÓN DE BOTONES ---

async function handleButton(interaction, client) {
    const id = interaction.customId;

    if (id === 'bb_solicitar') {
        await interaction.showModal(construirModalSolicitud());
        return;
    }

    if (id.startsWith('bb_activar_')) {
        if (!esAdmin(interaction)) return interaction.reply({ content: '⛔ Solo admins.', flags: MessageFlags.Ephemeral });
        const solicitudId = id.replace('bb_activar_', '');
        await activarProteccion(interaction, client, null, solicitudId);
        return;
    }

    if (id.startsWith('bb_denegar_cueva_')) {
        if (!esAdmin(interaction)) return interaction.reply({ content: '⛔ Solo admins.', flags: MessageFlags.Ephemeral });
        const solicitudId = id.replace('bb_denegar_cueva_', '');
        await denegarSolicitud(interaction, client, solicitudId, 'cueva');
        return;
    }

    if (id.startsWith('bb_denegar_repetida_')) {
        if (!esAdmin(interaction)) return interaction.reply({ content: '⛔ Solo admins.', flags: MessageFlags.Ephemeral });
        const solicitudId = id.replace('bb_denegar_repetida_', '');
        await denegarSolicitud(interaction, client, solicitudId, 'repetida');
        return;
    }

    if (id.startsWith('bb_quitar_')) {
        if (!esAdmin(interaction)) return interaction.reply({ content: '⛔ Solo admins.', flags: MessageFlags.Ephemeral });
        const solicitudId = id.replace('bb_quitar_', '');
        await quitarProteccionBoton(interaction, client, solicitudId);
        return;
    }

    if (id.startsWith('bb_cerrar_')) {
        if (!esAdmin(interaction)) return interaction.reply({ content: '⛔ Solo admins.', flags: MessageFlags.Ephemeral });
        await interaction.reply({ content: '🔒 Cerrando canal en 5 segundos...', flags: MessageFlags.Ephemeral });
        setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
        return;
    }
}

// --- GESTIÓN DE MODALES ---

async function handleModal(interaction, client) {
    if (interaction.customId === 'bb_modal_solicitar') {
        try {
            const nombreArk = interaction.fields.getTextInputValue('nombre_ark').trim();
            const nombreTribu = interaction.fields.getTextInputValue('nombre_tribu').trim();
            const confirmacion = interaction.fields.getTextInputValue('confirmacion').trim().toLowerCase();

            if (!confirmacion.startsWith('s')) {
                return interaction.reply({
                    content: '⚠️ Primero craftea la Bandera Blanca (10 Piel, 50 Madera, 50 Fibra) y colócala cerca de tu base. Vuelve a solicitarlo cuando esté lista.',
                    flags: MessageFlags.Ephemeral
                });
            }

            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const bandera = cargarBandera();

            const existente = Object.values(bandera).find(b =>
                b.discordId === interaction.user.id &&
                (
                    b.estado === 'pendiente' ||
                    b.estado === 'activo' ||
                    b.estado === 'expirado' ||
                    (b.estado === 'denegado' && b.motivoDenegacion === 'repetida')
                )
            );
            if (existente) {
                const motivo = existente.estado === 'expirado'
                    ? 'Ya usaste tu Bandera Blanca anteriormente — solo se puede solicitar una vez.'
                    : existente.estado === 'denegado'
                        ? 'Tu solicitud anterior fue denegada permanentemente. Contacta con un admin si crees que es un error.'
                        : `Ya tienes una solicitud **${existente.estado}**. Revisa tu canal privado.`;
                return interaction.editReply({ content: `⚠️ ${motivo}` });
            }

            const id = Date.now().toString();
            const solicitud = {
                id,
                discordId: interaction.user.id,
                discordUsername: interaction.user.username,
                nombreArk,
                nombreTribu: nombreTribu || null,
                estado: 'pendiente',
                fechaSolicitud: new Date().toISOString(),
                fechaActivacion: null,
                fechaExpiracion: null,
                canalId: null
            };
            bandera[id] = solicitud;
            guardarBandera(bandera);

            // Crear canal privado
            const canal = await crearCanalPrivado(interaction, client, solicitud);
            bandera[id].canalId = canal.id;
            guardarBandera(bandera);

            await canal.send({
                content: `${interaction.user} — solicitud recibida.`,
                embeds: [construirEmbedCanal(bandera[id])],
                components: construirBotonesCanal(bandera[id])
            });

            await interaction.editReply({
                content: `✅ Solicitud enviada. Un administrador la revisará y te avisaremos por privado en cuanto se active.`
            });

        } catch (error) {
            console.error('[BB] Error en solicitud:', error);
            const msg = `❌ Error: ${error.message}`;
            if (interaction.deferred) {
                await interaction.editReply({ content: msg });
            } else {
                await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
            }
        }
    }
}

// --- ACCIONES ---

async function activarProteccion(interaction, client, nombreArkBuscado, solicitudIdDirecto) {
    const bandera = cargarBandera();
    let solicitud;

    if (solicitudIdDirecto) {
        solicitud = bandera[solicitudIdDirecto];
    } else {
        solicitud = Object.values(bandera).find(b =>
            b.nombreArk.toLowerCase() === nombreArkBuscado.toLowerCase() && b.estado === 'pendiente'
        );
    }

    if (!solicitud || solicitud.estado !== 'pendiente') {
        const msg = { content: `❌ No hay solicitud pendiente.`, flags: MessageFlags.Ephemeral };
        return interaction.reply ? interaction.reply(msg) : null;
    }

    const ahora = new Date();
    const expiracion = new Date(ahora.getTime() + DURACION_HORAS * 60 * 60 * 1000);

    solicitud.estado = 'activo';
    solicitud.fechaActivacion = ahora.toISOString();
    solicitud.fechaExpiracion = expiracion.toISOString();
    guardarBandera(bandera);

    // Actualizar el canal privado
    if (solicitud.canalId) {
        try {
            const canal = await client.channels.fetch(solicitud.canalId);
            await canal.send({
                embeds: [construirEmbedCanal(solicitud)],
                components: construirBotonesCanal(solicitud)
            });
        } catch (e) {
            console.warn('[BB] No se pudo actualizar canal:', e.message);
        }
    }

    // DM al jugador — si falla, avisar en el canal público como respaldo
    let dmFallido = false;
    try {
        const usuario = await client.users.fetch(solicitud.discordId);
        await usuario.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle('🏳️ ¡Tienes activada la Bandera Blanca!')
                    .setColor(0x2ECC71)
                    .setDescription(
                        `Tu protección de **${DURACION_HORAS} horas** ya está activa, ¡juega tranquilo!\n\n` +
                        `Expira: <t:${Math.floor(expiracion.getTime() / 1000)}:F>\n\n` +
                        `ℹ️ Tu **estructura** está protegida automáticamente por el juego. ` +
                        `Tu personaje y dinos no tienen un escudo del juego, pero atacarte ` +
                        `durante este periodo conlleva **baneo inmediato** — repórtalo en #reportes si pasa.`
                    )
            ]
        });
    } catch (e) {
        dmFallido = true;
    }

    if (dmFallido && solicitud.canalId) {
        try {
            const canalPrivado = await client.channels.fetch(solicitud.canalId);
            await canalPrivado.permissionOverwrites.create(solicitud.discordId, {
                ViewChannel: true,
                ReadMessageHistory: true
            });
            await canalPrivado.send(
                `<@${solicitud.discordId}> — no hemos podido enviarte un mensaje privado, ` +
                `así que te hemos dado acceso aquí. Tu protección de **${DURACION_HORAS} horas** ya está activa. ` +
                `Expira <t:${Math.floor(expiracion.getTime() / 1000)}:F>.`
            );
        } catch (e) {
            console.warn('[BB] No se pudo avisar ni por DM ni dando acceso al canal:', e.message);
        }
    }

    if (interaction.reply) {
        await interaction.reply({ content: `✅ Protección activada para **${solicitud.nombreArk}**.` });
    }
}

async function denegarSolicitud(interaction, client, solicitudId, motivo) {
    const bandera = cargarBandera();
    const solicitud = bandera[solicitudId];
    if (!solicitud) return interaction.reply({ content: '❌ Solicitud no encontrada.', flags: MessageFlags.Ephemeral });

    solicitud.estado = 'denegado';
    solicitud.motivoDenegacion = motivo;
    guardarBandera(bandera);

    await interaction.update({
        embeds: [construirEmbedCanal(solicitud)],
        components: construirBotonesCanal(solicitud)
    });

    const mensajes = {
        cueva: '🔴 Tu solicitud de Bandera Blanca ha sido **denegada**.\n\nMotivo: no cumples los requisitos para esta protección. Asegúrate de haber crafteado y colocado la Bandera Blanca correctamente antes de solicitarla. Si tienes dudas, abre un ticket de soporte.',
        repetida: '🔴 Tu solicitud de Bandera Blanca ha sido **denegada**.\n\nMotivo: ya solicitaste esta protección anteriormente. La Bandera Blanca es solo para tus primeros días en el servidor, no se puede pedir más de una vez.'
    };
    const mensajeTexto = mensajes[motivo] || '🔴 Tu solicitud de Bandera Blanca ha sido denegada. Contacta con un admin si tienes dudas.';

    let dmFallido = false;
    try {
        const usuario = await client.users.fetch(solicitud.discordId);
        await usuario.send(mensajeTexto);
    } catch (e) {
        dmFallido = true;
    }

    if (dmFallido && solicitud.canalId) {
        try {
            const canalPrivado = await client.channels.fetch(solicitud.canalId);
            await canalPrivado.permissionOverwrites.create(solicitud.discordId, {
                ViewChannel: true,
                ReadMessageHistory: true
            });
            await canalPrivado.send(`<@${solicitud.discordId}> — no hemos podido enviarte un privado, así que te hemos dado acceso aquí.\n${mensajeTexto}`);
        } catch (e) {
            console.warn('[BB] No se pudo avisar ni por DM ni dando acceso al canal:', e.message);
        }
    }
}

async function quitarProteccionBoton(interaction, client, solicitudId) {
    const bandera = cargarBandera();
    const solicitud = bandera[solicitudId];
    if (!solicitud) return interaction.reply({ content: '❌ Solicitud no encontrada.', flags: MessageFlags.Ephemeral });

    solicitud.estado = 'expirado';
    guardarBandera(bandera);

    await interaction.update({
        embeds: [construirEmbedCanal(solicitud)],
        components: construirBotonesCanal(solicitud)
    });
}

async function quitarProteccion(interaction, client, nombreArk) {
    const bandera = cargarBandera();
    const solicitud = Object.values(bandera).find(b =>
        b.nombreArk.toLowerCase() === nombreArk.toLowerCase() && b.estado === 'activo'
    );

    if (!solicitud) {
        return interaction.reply({ content: `❌ No hay protección activa para **${nombreArk}**.`, flags: MessageFlags.Ephemeral });
    }

    solicitud.estado = 'expirado';
    guardarBandera(bandera);

    if (solicitud.canalId) {
        try {
            const canal = await client.channels.fetch(solicitud.canalId);
            await canal.send({ embeds: [construirEmbedCanal(solicitud)], components: construirBotonesCanal(solicitud) });
        } catch (e) {}
    }

    await interaction.reply({ content: `✅ Protección de **${nombreArk}** retirada manualmente.` });
}

async function verProtecciones(interaction) {
    const bandera = cargarBandera();
    const activos = Object.values(bandera).filter(b => b.estado === 'activo');
    const pendientes = Object.values(bandera).filter(b => b.estado === 'pendiente');

    const embed = new EmbedBuilder()
        .setTitle('🏳️ Estado de Banderas Blancas')
        .setColor(0x3498DB);

    if (pendientes.length > 0) {
        embed.addFields({
            name: `⏳ Pendientes (${pendientes.length})`,
            value: pendientes.map(p => `**${p.nombreArk}** — <#${p.canalId}>`).join('\n'),
            inline: false
        });
    }

    if (activos.length > 0) {
        embed.addFields({
            name: `🟢 Activas (${activos.length})`,
            value: activos.map(a => `**${a.nombreArk}** — expira <t:${Math.floor(new Date(a.fechaExpiracion).getTime() / 1000)}:R>`).join('\n'),
            inline: false
        });
    }

    if (pendientes.length === 0 && activos.length === 0) {
        embed.setDescription('No hay solicitudes pendientes ni protecciones activas.');
    }

    await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

// --- COMPROBACIÓN AUTOMÁTICA DE EXPIRACIÓN ---

async function comprobarExpiraciones(client) {
    const bandera = cargarBandera();
    const ahora = Date.now();
    let huboCambios = false;

    for (const solicitud of Object.values(bandera)) {
        if (solicitud.estado !== 'activo') continue;

        const expiracion = new Date(solicitud.fechaExpiracion).getTime();
        const en24h = expiracion - (24 * 60 * 60 * 1000);

        // --- RECORDATORIO 24H ANTES ---
        if (!solicitud.aviso24hEnviado && ahora >= en24h && ahora < expiracion) {
            solicitud.aviso24hEnviado = true;
            huboCambios = true;

            // DM al jugador
            let dmFallido = false;
            try {
                const usuario = await client.users.fetch(solicitud.discordId);
                await usuario.send({
                    embeds: [new (require('discord.js').EmbedBuilder)()
                        .setTitle('⚠️ Tu Bandera Blanca expira pronto')
                        .setColor(0xF39C12)
                        .setDescription(
                            `Tu protección de Bandera Blanca expira en menos de **24 horas**.\n\n` +
                            `Expira: <t:${Math.floor(expiracion / 1000)}:F>\n\n` +
                            `Después de esa hora formarás parte del PvP normal del servidor. ` +
                            `¡Asegúrate de tener tus dinos y base bien protegidos! 🦖`
                        )
                    ]
                });
            } catch (e) {
                dmFallido = true;
            }

            // Fallback si falla el DM
            if (dmFallido && solicitud.canalId) {
                try {
                    const canalPrivado = await client.channels.fetch(solicitud.canalId);
                    await canalPrivado.permissionOverwrites.create(solicitud.discordId, {
                        ViewChannel: true,
                        ReadMessageHistory: true
                    });
                    await canalPrivado.send(
                        `<@${solicitud.discordId}> — tu Bandera Blanca expira en menos de 24 horas (<t:${Math.floor(expiracion / 1000)}:R>). ¡Prepara tu base! 🦖`
                    );
                } catch (e) {}
            }

            // Aviso en #logs para que los admins lo sepan
            try {
                if (config.canales.logs) {
                    const canalLogs = await client.channels.fetch(config.canales.logs);
                    await canalLogs.send({
                        embeds: [new (require('discord.js').EmbedBuilder)()
                            .setTitle('⚠️ Bandera Blanca expira en 24h')
                            .setColor(0xF39C12)
                            .addFields(
                                { name: '🎮 Jugador', value: solicitud.nombreArk, inline: true },
                                { name: '👤 Discord', value: solicitud.discordUsername, inline: true },
                                { name: '⏰ Expira', value: `<t:${Math.floor(expiracion / 1000)}:F>`, inline: false }
                            )
                        ]
                    });
                }
            } catch (e) {}
        }

        // --- EXPIRACIÓN REAL ---
        if (expiracion <= ahora) {
            solicitud.estado = 'expirado';
            huboCambios = true;

            if (solicitud.canalId) {
                try {
                    const canal = await client.channels.fetch(solicitud.canalId);
                    await canal.send({
                        content: '⏰ La protección ha expirado automáticamente.',
                        embeds: [construirEmbedCanal(solicitud)],
                        components: construirBotonesCanal(solicitud)
                    });
                } catch (e) {}
            }

            let dmFallido = false;
            try {
                const usuario = await client.users.fetch(solicitud.discordId);
                await usuario.send(`🏳️ Tu protección de Bandera Blanca ha expirado. ¡Ya formas parte del PvP normal del servidor!`);
            } catch (e) {
                dmFallido = true;
            }

            if (dmFallido && solicitud.canalId) {
                try {
                    const canalPrivado = await client.channels.fetch(solicitud.canalId);
                    await canalPrivado.permissionOverwrites.create(solicitud.discordId, {
                        ViewChannel: true,
                        ReadMessageHistory: true
                    });
                    await canalPrivado.send(`<@${solicitud.discordId}> — tu protección de Bandera Blanca ha expirado. ¡Ya formas parte del PvP normal del servidor!`);
                } catch (e) {}
            }
        }
    }

    if (huboCambios) guardarBandera(bandera);
}

function iniciarComprobacionExpiraciones(client) {
    setInterval(() => comprobarExpiraciones(client), 5 * 60 * 1000);
    comprobarExpiraciones(client);
}

module.exports = {
    asegurarMensajeSolicitud,
    handleButton,
    handleModal,
    activarProteccion,
    verProtecciones,
    quitarProteccion,
    iniciarComprobacionExpiraciones
};
