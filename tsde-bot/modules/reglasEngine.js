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
const config = require('../config.json');

const DB_PATH = './database.json';

function cargarDB() {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function guardarDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

// --- EMBED DE NORMAS ---

function construirEmbedNormas() {
    return new EmbedBuilder()
        .setTitle('📜 Bienvenido a TSDE Arkeanos')
        .setColor(0x9B59B6)
        .setDescription(
            '¡Hola superviviente! Antes de entrar al servidor necesitas leer y aceptar las normas.\n\n' +
            '**Si no aceptas las normas no podrás escribir en ningún canal.**'
        )
        .addFields(
            {
                name: '🌐 GENERALES',
                value: [
                    '**1.** Nombres genéricos como "Humano" o "Bob" serán baneados sin aviso.',
                    '**2.** Insultos, faltas de respeto o acoso = baneo inmediato.',
                    '**3.** Publicidad de otros servidores o webs = baneo inmediato.',
                    '**4.** Prohibido el uso de exploits, bugs o cheats.',
                    '**5.** Prohibido el uso de dinos blindados.',
                    '**6.** Los admins no se responsabilizan de pérdidas en reinicios o caídas.'
                ].join('\n'),
                inline: false
            },
            {
                name: '🛡️ TRIBUS',
                value: [
                    '**1.** Máximo 6 jugadores por tribu.',
                    '**2.** Lo que hace un miembro es responsabilidad de la tribu entera.',
                    '**3.** Prohibido el acoso continuado a una misma tribu.',
                    '**4.** Las guerras entre tribus requieren motivos justificados.'
                ].join('\n'),
                inline: false
            },
            {
                name: '🏗️ CONSTRUCCIÓN',
                value: [
                    '**1.** Prohibido construir en cuevas, recursos, spawns y artefactos.',
                    '**2.** Prohibido marcar terreno con cimientos sin construir.',
                    '**3.** Las estructuras de domesticación deben eliminarse inmediatamente.',
                    '**4.** Máximo 2 bases por tribu.',
                    '**5.** Estructuras abandonadas serán eliminadas sin aviso.'
                ].join('\n'),
                inline: false
            },
            {
                name: '⚔️ PVP Y RAIDS',
                value: [
                    '**1.** PVP libre en todo el mapa salvo excepciones.',
                    '**2.** Prohibido raidear bases de madera o piedra con menos de 3 días.',
                    '**3.** Prohibido atacar zonas comunes o estructuras TSDE-ADMIN.',
                    '**4.** Prohibido atacar durante eventos oficiales.',
                    '**5.** Prohibido el acoso post-raid — deja recuperarse a las tribus.'
                ].join('\n'),
                inline: false
            },
            {
                name: '📋 REPORTES Y SANCIONES',
                value: [
                    '→ Sin capturas o vídeo no se actuará.',
                    '→ Reportes únicamente por #tickets en Discord.',
                    '→ No se aceptan reportes por privados a admins.',
                    '→ Los admins tienen la última palabra siempre.'
                ].join('\n'),
                inline: false
            }
        )
        .setFooter({ text: 'Pulsa el botón de abajo para aceptar las normas y continuar.' });
}

function construirBotonAceptar() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('reg_aceptar')
            .setLabel('✅ Acepto las normas')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('reg_rechazar')
            .setLabel('❌ No acepto')
            .setStyle(ButtonStyle.Danger)
    );
}

// --- MODAL NOMBRE ARK ---

function construirModalNombreArk() {
    const modal = new ModalBuilder()
        .setCustomId('reg_modal_nombre')
        .setTitle('¿Cómo te llamas en ARK?');

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('nombre_ark')
                .setLabel('Tu nombre exacto en ARK: Survival Ascended')
                .setPlaceholder('Escribe tu nombre exacto en ARK...')
                .setStyle(TextInputStyle.Short)
                .setMinLength(2)
                .setMaxLength(50)
                .setRequired(true)
        )
    );

    return modal;
}

// --- ENVIAR DM AL NUEVO MIEMBRO ---

async function enviarNormasDM(member) {
    try {
        const dm = await member.createDM();
        await dm.send({
            embeds: [construirEmbedNormas()],
            components: [construirBotonAceptar()]
        });
        console.log(`[REG] DM enviado a ${member.user.username}`);
    } catch (error) {
        console.warn(`[REG] No se pudo enviar DM a ${member.user.username}: ${error.message}`);
        try {
            const canal = await member.client.channels.fetch(config.canales.bienvenida);
            await canal.send({
                content: `${member} — No he podido enviarte un mensaje privado. Lee y acepta las normas aquí:`,
                embeds: [construirEmbedNormas()],
                components: [construirBotonAceptar()]
            });
        } catch (e) {
            console.error('[REG] Error enviando a canal bienvenida:', e.message);
        }
    }
}

// --- GESTIÓN DE BOTONES ---

async function handleButton(interaction, client) {
    const id = interaction.customId;

    // Paso 1 — Acepta las normas → mostrar modal de nombre ARK
    if (id === 'reg_aceptar') {
        await interaction.showModal(construirModalNombreArk());
        return;
    }

    // Rechazar normas
    if (id === 'reg_rechazar') {
        const embed = new EmbedBuilder()
            .setTitle('❌ Has rechazado las normas')
            .setDescription(
                'Has decidido no aceptar las normas de TSDE Arkeanos.\n\n' +
                'Si cambias de opinión vuelve a unirte al servidor.\n¡Hasta pronto! 👋'
            )
            .setColor(0xE74C3C);

        await interaction.update({ embeds: [embed], components: [] });
        return;
    }
}

// --- GESTIÓN DE MODALES ---

async function handleModal(interaction, client) {
    if (interaction.customId === 'reg_modal_nombre') {
        try {
            const nombreArk = interaction.fields.getTextInputValue('nombre_ark').trim();

            // Obtener guild y member
            const guild = interaction.guild || await client.guilds.fetch(config.guildId);
            const member = interaction.guild
                ? interaction.member
                : await guild.members.fetch(interaction.user.id);

            // Cambiar apodo en Discord al nombre de ARK
            try {
                await member.setNickname(nombreArk, 'Registro TSDE — Nombre ARK');
            } catch (e) {
                // Si no puede cambiar el apodo (ej: el usuario es admin del servidor)
                console.warn(`[REG] No se pudo cambiar apodo de ${interaction.user.username}: ${e.message}`);
            }

            // Quitar Superviviente y dar Arkeano
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

            // Guardar en base de datos
            const db = cargarDB();
            if (!db.jugadores) db.jugadores = {};
            db.jugadores[interaction.user.id] = {
                discordId: interaction.user.id,
                discordUsername: interaction.user.username,
                nombreArk,
                fechaRegistro: new Date().toISOString()
            };
            guardarDB(db);

            // Confirmar al jugador
            const embedConfirm = new EmbedBuilder()
                .setTitle('✅ ¡Bienvenido a TSDE Arkeanos!')
                .setDescription(
                    `Registro completado, **${nombreArk}**.\n\n` +
                    '🦖 Ya tienes acceso completo al servidor.\n' +
                    '📜 Recuerda las normas en #normas.\n' +
                    '🆘 ¿Necesitas ayuda? Abre un ticket en #tickets.\n\n' +
                    '**¡Buena suerte superviviente!** ⚔️'
                )
                .addFields({ name: '🎮 Nombre en ARK registrado', value: `\`${nombreArk}\``, inline: true })
                .setColor(0x2ECC71);

            await interaction.update({ embeds: [embedConfirm], components: [] });

            // Avisar en #bienvenida
            try {
                const canalBienvenida = await client.channels.fetch(config.canales.bienvenida);
                await canalBienvenida.send({
                    embeds: [
                        new EmbedBuilder()
                            .setDescription(
                                `🦖 **${nombreArk}** ha aceptado las normas y se ha unido a TSDE Arkeanos. ¡Bienvenido!`
                            )
                            .setColor(0x2ECC71)
                    ]
                });
            } catch (e) {
                console.warn('[REG] No se pudo avisar en bienvenida:', e.message);
            }

            // Avisar en logs con los datos del registro
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
            // Ignorar errores de permisos de apodo (código 50013)
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

module.exports = { enviarNormasDM, handleButton, handleModal };
