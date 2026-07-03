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
const config = require('../config.json');
const db = require('../db.js');

// --- EMBEDS DE NORMAS PARA EL CANAL #normas (uso con /normas) ---

function construirEmbedsNormasCanal() {
    const embed1 = new EmbedBuilder()
        .setTitle('📜 Normas de TSDE Arkeanos')
        .setColor(0x9B59B6)
        .setDescription('⚠️ El desconocimiento de las normas no exime de su cumplimiento.')
        .addFields(
            {
                name: '🌐 GENERALES',
                value: [
                    '**Nombres** — Nombres genéricos como "Humano" o "Bob" serán baneados sin aviso.',
                    '**Respeto** — Insultos, faltas de respeto o acoso en cualquier canal = baneo inmediato.',
                    '**Publicidad** — Prohibida la publicidad de otros servidores o webs. Baneo inmediato.',
                    '**Exploits y bugs** — Prohibido el uso de exploits, bugs o mecánicas no intencionadas.',
                    '**Dinos blindados** — Prohibido su uso en cualquier circunstancia.',
                    '**Responsabilidad** — Los admins no se responsabilizan de pérdidas en reinicios o caídas.'
                ].join('\n'),
                inline: false
            },
            {
                name: '🛡️ TRIBUS',
                value: [
                    '**Máximo** — 6 jugadores por tribu.',
                    '**Responsabilidad interna** — Lo que haga un miembro es responsabilidad de toda la tribu.',
                    '**Acoso entre tribus** — Prohibido el acoso continuado. Deben poder recuperarse tras un ataque.',
                    '**Guerra entre tribus** — Si ambas se declaran la guerra, sin restricciones entre ellas. Una sola declaración necesita motivos justificados y aprobación de la administración.'
                ].join('\n'),
                inline: false
            },
            {
                name: '🏗️ CONSTRUCCIÓN',
                value: [
                    '**Zonas prohibidas** — No construir en cuevas, recursos, spawns, artefactos ni notas de explorador.',
                    '**Spam de estructuras** — Prohibido marcar terreno sin construir.',
                    '**Domesticación** — Las estructuras para domar se eliminan inmediatamente después.',
                    '**Límite de bases** — Máximo 2 bases por tribu.',
                    '**Abandono** — Estructuras dañadas o sin uso serán eliminadas sin aviso.'
                ].join('\n'),
                inline: false
            }
        );

    const embed2 = new EmbedBuilder()
        .setColor(0x9B59B6)
        .addFields(
            {
                name: '⚔️ PVP Y RAIDS',
                value: [
                    '**PVP libre** — Permitido en todo el mapa salvo excepciones.',
                    '**Protección Bandera Blanca** — Los nuevos pueden solicitar 72h de protección abriendo un 🎫 ticket. Si atacan o roban durante este periodo: baneo inmediato.',
                    '**Zonas comunes** — Prohibido atacar o dañar zonas comunes y estructuras de TSDE-ADMIN. Mercado, Zona de Crafteo y Prisión son peatonales — los dinos van al Parking de Dinos. Robar en Crafteo: baneo inmediato.',
                    '**Durante eventos** — Prohibido atacar mientras hay un evento oficial activo.',
                    '**Acoso post-raid** — Deja recuperarse a la tribu raideada antes de volver a atacar.'
                ].join('\n'),
                inline: false
            },
            {
                name: '🌿 PVE',
                value: '**Agarrar jugadores** — Prohibido agarrar o mover jugadores de otras tribus fuera de un combate acordado. Denuncias requieren clip o captura.',
                inline: false
            },
            {
                name: '📋 SANCIONES Y REPORTES',
                value: [
                    '→ Sin capturas, logs o vídeo no se actuará.',
                    '→ Reportes únicamente por 🎫 tickets en Discord.',
                    '→ No se aceptan reportes por privados a admins.',
                    '→ Los admins tienen la última palabra siempre.',
                    '→ El incumplimiento puede resultar en kick, baneo temporal o permanente según la gravedad.'
                ].join('\n'),
                inline: false
            }
        )
        .setFooter({ text: 'TSDE Arkeanos — Última actualización' })
        .setTimestamp();

    return [embed1, embed2];
}

// --- MODAL NOMBRE ARK (lo único que pide el bot ahora) ---

function construirModalNombreArk() {
    const modal = new ModalBuilder()
        .setCustomId('reg_modal_nombre')
        .setTitle('Registro TSDE Arkeanos');

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('nombre_ark')
                .setLabel('Nombre de tu personaje en ARK')
                .setPlaceholder('Escribe el nombre con el que juegas...')
                .setStyle(TextInputStyle.Short)
                .setMinLength(2)
                .setMaxLength(50)
                .setRequired(true)
        )
    );

    return modal;
}

function construirBotonRegistro() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('reg_iniciar_registro')
            .setLabel('🎮 Registrar mi nombre de ARK')
            .setStyle(ButtonStyle.Success)
    );
}

// --- MENSAJE FIJO DE BIENVENIDA EN #bienvenida (en vez de DM) ---

function construirEmbedBienvenida() {
    return new EmbedBuilder()
        .setTitle('🦖 ¡Bienvenido a TSDE Arkeanos!')
        .setColor(0x2ECC71)
        .setDescription(
            '¡Hola superviviente! Nos alegra tenerte aquí.\n\n' +
            '**Para tener acceso completo al servidor necesitas:**\n' +
            '📜 Leer las normas en `#normas`\n' +
            '🎮 Registrar el nombre de tu personaje en ARK\n\n' +
            'Pulsa el botón de abajo — al hacerlo confirmas que has leído ' +
            'y aceptas las normas del servidor.'
        )
        .setFooter({ text: 'TSDE Arkeanos — Registro de nuevos jugadores' });
}

// Asegura que el mensaje fijo con botón existe en #bienvenida (idempotente)
async function asegurarMensajeBienvenida(client) {
    if (!config.canales.bienvenida) {
        console.warn('[REG] Canal bienvenida no configurado');
        return;
    }

    try {
        const canal = await client.channels.fetch(config.canales.bienvenida);
        const embed = construirEmbedBienvenida();
        const botones = construirBotonRegistro();

        // Intentar encontrar el mensaje por ID guardado en SQLite
        const msgIdGuardado = database.getMercadoAnuncio('bienvenida_msg_id');
        
        if (msgIdGuardado) {
            try {
                const msg = await canal.messages.fetch(msgIdGuardado.id);
                await msg.edit({ embeds: [embed], components: [botones] });
                console.log('[REG] Mensaje de bienvenida actualizado en #bienvenida');
                return;
            } catch (e) {
                // Mensaje no encontrado, creamos uno nuevo
                database.removeMercadoAnuncio('bienvenida_msg_id');
            }
        }

        // Buscar en los últimos 50 mensajes como fallback
        const mensajes = await canal.messages.fetch({ limit: 50 });
        const existente = mensajes.find(m => m.author.id === client.user.id && m.embeds.length > 0);

        if (existente) {
            await existente.edit({ embeds: [embed], components: [botones] });
            database.setMercadoAnuncio('bienvenida_msg_id', { id: existente.id });
            console.log('[REG] Mensaje de bienvenida encontrado y actualizado en #bienvenida');
        } else {
            const msg = await canal.send({ embeds: [embed], components: [botones] });
            await msg.pin().catch(() => {});
            database.setMercadoAnuncio('bienvenida_msg_id', { id: msg.id });
            console.log('[REG] Mensaje de bienvenida creado en #bienvenida');
        }
    } catch (e) {
        console.error('[REG] Error asegurando mensaje de bienvenida:', e.message);
    }
}

// --- GESTIÓN DE BOTONES ---

async function handleButton(interaction, client) {
    const id = interaction.customId;

    if (id === 'reg_iniciar_registro') {
        await interaction.showModal(construirModalNombreArk());
        return;
    }
}

// --- GESTIÓN DE MODALES ---

async function handleModal(interaction, client) {
    if (interaction.customId === 'reg_modal_nombre') {
        try {
            const nombreArk = interaction.fields.getTextInputValue('nombre_ark').trim();
            const nombrePersonaje = null;

            const guild = interaction.guild || await client.guilds.fetch(config.guildId);
            const member = interaction.guild
                ? interaction.member
                : await guild.members.fetch(interaction.user.id);

            try {
                await member.setNickname(nombreArk, 'Registro TSDE — Nombre ARK');
            } catch (e) {
                console.warn(`[REG] No se pudo cambiar apodo de ${interaction.user.username}: ${e.message}`);
            }

            const rolSuperv = guild.roles.cache.find(r =>
                r.id === config.roles.superviviente || r.name === 'Superviviente'
            );
            const rolArkeano = guild.roles.cache.find(r =>
                r.id === config.roles.arkeano || r.name === 'Arkeano'
            );

            if (rolSuperv && member.roles.cache.has(rolSuperv.id)) {
                await member.roles.remove(rolSuperv);
            }
            if (rolArkeano && !member.roles.cache.has(rolArkeano.id)) {
                await member.roles.add(rolArkeano);
            }

            db.setJugador({
                discordId: interaction.user.id,
                discordUsername: interaction.user.username,
                nombreArk,
                nombrePersonaje: nombrePersonaje || null,
                fechaRegistro: new Date().toISOString()
            });

            const embedConfirm = new EmbedBuilder()
                .setTitle('✅ ¡Registro completado!')
                .setDescription(
                    `Bienvenido, **${nombreArk}**.\n\n` +
                    '🦖 Ya tienes acceso completo al servidor.\n' +
                    '📜 Consulta las normas en #normas.\n' +
                    '🆘 ¿Necesitas ayuda? Abre un ticket en #tickets.\n\n' +
                    '**¡Buena suerte superviviente!** ⚔️'
                )
                .addFields({ name: '🎮 Nombre en ARK registrado', value: `\`${nombreArk}\``, inline: true })
                .setColor(0x2ECC71);

            // CRÍTICO: usar reply ephemeral, NO update — el mensaje fijo es compartido
            // por todos los jugadores, no se puede editar/reemplazar su botón
            await interaction.reply({
                embeds: [embedConfirm],
                flags: MessageFlags.Ephemeral
            });

            // Aviso a #general (no a #bienvenida, para no desplazar el mensaje fijo del botón)
            try {
                if (config.canales.general) {
                    const canalGeneral = await client.channels.fetch(config.canales.general);
                    await canalGeneral.send({
                        embeds: [
                            new EmbedBuilder()
                                .setDescription(`🦖 **${nombreArk}** se ha registrado y unido a TSDE Arkeanos. ¡Dale la bienvenida!`)
                                .setColor(0x2ECC71)
                        ]
                    });
                }
            } catch (e) {
                console.warn('[REG] No se pudo avisar en general:', e.message);
            }

            try {
                const canalLogs = await client.channels.fetch(config.canales.logs);
                await canalLogs.send({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('📋 Nuevo registro')
                            .setColor(0x3498DB)
                            .addFields(
                                { name: '👤 Discord', value: interaction.user.username, inline: true },
                                { name: '🎮 Nombre ARK', value: nombreArk, inline: true },
                                { name: '🆔 ID', value: interaction.user.id, inline: true }
                            )
                            .setTimestamp()
                    ]
                });
            } catch (e) {}

            console.log(`[REG] ${interaction.user.username} registrado como "${nombreArk}"`);

        } catch (error) {
            console.error('[REG] Error en registro:', error);
            if (error.code === 50013) {
                console.warn('[REG] Sin permisos para cambiar apodo — registro completado igualmente');
                return;
            }
            const msg = { content: `❌ Error al completar el registro: ${error.message}\nContacta con un administrador.`, ephemeral: true };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(msg);
            } else {
                await interaction.reply(msg);
            }
        }
    }
}

module.exports = {
    asegurarMensajeBienvenida,
    handleButton,
    handleModal,
    construirEmbedsNormasCanal
};
