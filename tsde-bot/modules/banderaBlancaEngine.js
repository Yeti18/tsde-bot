const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags
} = require('discord.js');
const fs = require('fs');
const config = require('../config.json');

const DB_PATH = './database.json';
const DURACION_HORAS = 72;

function cargarDB() {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function guardarDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function cargarBandera() {
    const db = cargarDB();
    if (!db.bandera_blanca) db.bandera_blanca = {};
    return db.bandera_blanca;
}

function guardarBandera(data) {
    const db = cargarDB();
    db.bandera_blanca = data;
    guardarDB(db);
}

// --- EMBED FIJO DE SOLICITUD (mensaje permanente en canal) ---

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
            'Una vez confirmado, pulsa el botón de abajo. Un administrador ' +
            'entrará al juego para activar tu protección lo antes posible.\n\n' +
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

// Asegura que el mensaje fijo con botón existe (idempotente, igual que bienvenida)
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
                .setLabel('Tu nombre exacto en ARK')
                .setPlaceholder('Para que los admins te encuentren fácilmente...')
                .setStyle(TextInputStyle.Short)
                .setMinLength(2)
                .setMaxLength(50)
                .setRequired(true)
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

// --- GESTIÓN DE BOTONES ---

async function handleButton(interaction, client) {
    if (interaction.customId === 'bb_solicitar') {
        await interaction.showModal(construirModalSolicitud());
        return;
    }
}

// --- GESTIÓN DE MODALES ---

async function handleModal(interaction, client) {
    if (interaction.customId === 'bb_modal_solicitar') {
        try {
            const nombreArk = interaction.fields.getTextInputValue('nombre_ark').trim();
            const confirmacion = interaction.fields.getTextInputValue('confirmacion').trim().toLowerCase();

            if (!confirmacion.startsWith('s')) {
                return interaction.reply({
                    content: '⚠️ Primero craftea la Bandera Blanca (10 Piel, 50 Madera, 50 Fibra) y colócala cerca de tu base. Vuelve a solicitarlo cuando esté lista.',
                    flags: MessageFlags.Ephemeral
                });
            }

            const bandera = cargarBandera();

            // Comprobar si ya tiene una solicitud pendiente o activa
            const existente = Object.values(bandera).find(b =>
                b.discordId === interaction.user.id && b.estado !== 'expirado'
            );
            if (existente) {
                return interaction.reply({
                    content: `⚠️ Ya tienes una solicitud **${existente.estado}** registrada. Si crees que es un error, contacta con un admin.`,
                    flags: MessageFlags.Ephemeral
                });
            }

            const id = Date.now().toString();
            bandera[id] = {
                id,
                discordId: interaction.user.id,
                discordUsername: interaction.user.username,
                nombreArk,
                estado: 'pendiente', // pendiente -> activo -> expirado
                fechaSolicitud: new Date().toISOString(),
                fechaActivacion: null,
                fechaExpiracion: null
            };
            guardarBandera(bandera);

            // Avisar a #chat-admin
            try {
                const canalAdmin = await client.channels.fetch(config.canales.logs);
                await canalAdmin.send({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('🏳️ Nueva solicitud de Bandera Blanca')
                            .setColor(0xF39C12)
                            .addFields(
                                { name: '👤 Discord', value: interaction.user.username, inline: true },
                                { name: '🎮 Nombre ARK', value: nombreArk, inline: true }
                            )
                            .setDescription(
                                `Entrad al juego y activad la protección para **${nombreArk}**.\n\n` +
                                `Cuando esté hecho, confirmad con:\n\`/banderablanca activar nombre:${nombreArk}\``
                            )
                            .setTimestamp()
                    ]
                });
            } catch (e) {
                console.warn('[BB] No se pudo avisar en admin:', e.message);
            }

            await interaction.reply({
                content: `✅ Solicitud enviada. Un administrador entrará al juego y activará tu protección de 72h lo antes posible. Te avisaremos.`,
                flags: MessageFlags.Ephemeral
            });

        } catch (error) {
            console.error('[BB] Error en solicitud:', error);
            await interaction.reply({ content: `❌ Error: ${error.message}`, flags: MessageFlags.Ephemeral });
        }
    }
}

// --- COMANDOS ADMIN ---

async function activarProteccion(interaction, client, nombreArk) {
    const bandera = cargarBandera();
    const solicitud = Object.values(bandera).find(b =>
        b.nombreArk.toLowerCase() === nombreArk.toLowerCase() && b.estado === 'pendiente'
    );

    if (!solicitud) {
        return interaction.reply({
            content: `❌ No hay ninguna solicitud pendiente para **${nombreArk}**. Comprueba el nombre exacto.`,
            flags: MessageFlags.Ephemeral
        });
    }

    const ahora = new Date();
    const expiracion = new Date(ahora.getTime() + DURACION_HORAS * 60 * 60 * 1000);

    solicitud.estado = 'activo';
    solicitud.fechaActivacion = ahora.toISOString();
    solicitud.fechaExpiracion = expiracion.toISOString();
    guardarBandera(bandera);

    // Avisar al jugador por DM
    try {
        const usuario = await client.users.fetch(solicitud.discordId);
        await usuario.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle('🏳️ ¡Tu Bandera Blanca está activa!')
                    .setColor(0x2ECC71)
                    .setDescription(
                        `Tu protección de **${DURACION_HORAS} horas** ya está activa.\n\n` +
                        `Expira: <t:${Math.floor(expiracion.getTime() / 1000)}:F>\n\n` +
                        `Recuerda: atacar a otros durante este periodo resulta en baneo inmediato.`
                    )
            ]
        }).catch(() => {});
    } catch (e) {}

    await interaction.reply({
        content: `✅ Protección activada para **${nombreArk}**. Expira <t:${Math.floor(expiracion.getTime() / 1000)}:R>.`,
    });
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
            name: `⏳ Pendientes de activar (${pendientes.length})`,
            value: pendientes.map(p => `**${p.nombreArk}** — solicitado ${new Date(p.fechaSolicitud).toLocaleString('es-ES')}`).join('\n'),
            inline: false
        });
    }

    if (activos.length > 0) {
        embed.addFields({
            name: `🟢 Activas ahora (${activos.length})`,
            value: activos.map(a => `**${a.nombreArk}** — expira <t:${Math.floor(new Date(a.fechaExpiracion).getTime() / 1000)}:R>`).join('\n'),
            inline: false
        });
    }

    if (pendientes.length === 0 && activos.length === 0) {
        embed.setDescription('No hay ninguna solicitud pendiente ni protección activa ahora mismo.');
    }

    await interaction.reply({ embeds: [embed], flags: require('discord.js').MessageFlags.Ephemeral });
}

async function quitarProteccion(interaction, client, nombreArk) {
    const bandera = cargarBandera();
    const solicitud = Object.values(bandera).find(b =>
        b.nombreArk.toLowerCase() === nombreArk.toLowerCase() && b.estado === 'activo'
    );

    if (!solicitud) {
        return interaction.reply({
            content: `❌ No hay ninguna protección activa para **${nombreArk}**.`,
            flags: require('discord.js').MessageFlags.Ephemeral
        });
    }

    solicitud.estado = 'expirado';
    guardarBandera(bandera);

    await interaction.reply({ content: `✅ Protección de **${nombreArk}** retirada manualmente.` });
}

// --- COMPROBACIÓN AUTOMÁTICA DE EXPIRACIÓN ---

async function comprobarExpiraciones(client) {
    const bandera = cargarBandera();
    const ahora = Date.now();
    let huboCambios = false;

    for (const solicitud of Object.values(bandera)) {
        if (solicitud.estado === 'activo' && new Date(solicitud.fechaExpiracion).getTime() <= ahora) {
            solicitud.estado = 'expirado';
            huboCambios = true;

            try {
                const canalAdmin = await client.channels.fetch(config.canales.logs);
                await canalAdmin.send({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('⏰ Bandera Blanca expirada')
                            .setColor(0xE74C3C)
                            .setDescription(`La protección de **${solicitud.nombreArk}** ha expirado. Si seguía activa en el juego, desactivadla.`)
                    ]
                });
            } catch (e) {}

            try {
                const usuario = await client.users.fetch(solicitud.discordId);
                await usuario.send({
                    content: `🏳️ Tu protección de Bandera Blanca ha expirado. ¡Ya formas parte del PvP normal del servidor!`
                }).catch(() => {});
            } catch (e) {}
        }
    }

    if (huboCambios) guardarBandera(bandera);
}

function iniciarComprobacionExpiraciones(client) {
    setInterval(() => comprobarExpiraciones(client), 5 * 60 * 1000); // cada 5 minutos
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
