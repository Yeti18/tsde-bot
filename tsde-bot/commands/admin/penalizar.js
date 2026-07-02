const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const config = require('../../config.json');
const database = require('../../db.js');

const DB_PATH = './database.json'; // ya no se usa, SQLite

function cargarDB() { return {}; }
function guardarDB() {}

// Niveles de sanción progresiva
const NIVELES = {
    1: { emoji: '⚠️', nombre: 'Advertencia',       color: 0xF39C12, descripcion: 'Primera infracción — aviso formal registrado.' },
    2: { emoji: '🔇', nombre: 'Silenciado',         color: 0xE67E22, descripcion: 'Segunda infracción — silenciado temporalmente.' },
    3: { emoji: '⛔', nombre: 'Expulsado de eventos', color: 0xE74C3C, descripcion: 'Tercera infracción — bloqueado de eventos del servidor.' },
    4: { emoji: '🔨', nombre: 'Baneo recomendado',  color: 0x8E44AD, descripcion: 'Cuarta infracción — se recomienda baneo permanente.' }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('penalizar')
        .setDescription('Sistema de sanciones progresivas [ADMIN]')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addSubcommand(sub =>
            sub.setName('sancionar')
                .setDescription('Aplicar sanción progresiva a un jugador')
                .addUserOption(opt =>
                    opt.setName('usuario').setDescription('Jugador a sancionar').setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName('motivo').setDescription('Motivo de la sanción').setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('perdonar')
                .setDescription('Quitar una sanción / resetear historial')
                .addUserOption(opt =>
                    opt.setName('usuario').setDescription('Jugador a perdonar').setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName('motivo').setDescription('Motivo del perdón').setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName('historial')
                .setDescription('Ver historial de sanciones de un jugador')
                .addUserOption(opt =>
                    opt.setName('usuario').setDescription('Jugador').setRequired(true)
                )
        ),

    async execute(interaction, client) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const sub = interaction.options.getSubcommand();
        const usuario = interaction.options.getUser('usuario');
        const motivo = interaction.options.getString('motivo') || 'Sin motivo especificado';

        // --- SANCIONAR ---
        if (sub === 'sancionar') {
            let sancionData = database.getSancion(usuario.id);
            if (!sancionData) {
                sancionData = { discordId: usuario.id, discordUsername: usuario.username, nivelActual: 0, historial: [] };
            }

            sancionData.nivelActual = Math.min(sancionData.nivelActual + 1, 4);
            const nivel = NIVELES[sancionData.nivelActual];

            sancionData.historial.push({
                nivel: sancionData.nivelActual,
                motivo,
                adminId: interaction.user.id,
                adminUsername: interaction.user.username,
                fecha: new Date().toISOString()
            });

            // Nivel 3+ → bloquear de eventos
            if (sancionData.nivelActual >= 3) {
                const jugador = database.getJugador(usuario.id);
                const nombreArk = jugador?.nombre_ark || usuario.username;
                database.addPenalizado(nombreArk);
            }

            // Guardar sanción y advertencia
            database.setSancion(sancionData);
            database.addAdvertencia({
                jugadorId: usuario.id,
                jugadorUsername: usuario.username,
                motivo,
                adminId: interaction.user.id,
                adminUsername: interaction.user.username,
                nivel: sancionData.nivelActual,
                fecha: new Date().toISOString()
            });

            // Embed del resultado
            const embed = new EmbedBuilder()
                .setTitle(`${nivel.emoji} Sanción aplicada — Nivel ${sancionData.nivelActual}`)
                .setColor(nivel.color)
                .addFields(
                    { name: '👤 Jugador', value: `${usuario.username} (<@${usuario.id}>)`, inline: true },
                    { name: '📋 Tipo', value: nivel.nombre, inline: true },
                    { name: '📝 Motivo', value: motivo, inline: false },
                    { name: 'ℹ️ Efecto', value: nivel.descripcion, inline: false },
                    { name: '📊 Historial', value: `${sancionData.nivelActual}/4 sanciones acumuladas`, inline: true }
                )
                .setTimestamp();

            try {
                if (config.canales.logs) {
                    const canalLogs = await client.channels.fetch(config.canales.logs);
                    await canalLogs.send({ embeds: [embed] });
                }
            } catch (e) {}

            try {
                await usuario.send({
                    embeds: [new EmbedBuilder()
                        .setTitle(`${nivel.emoji} Has recibido una sanción en TSDE Arkeanos`)
                        .setColor(nivel.color)
                        .setDescription(
                            `**Tipo:** ${nivel.nombre}\n` +
                            `**Motivo:** ${motivo}\n\n` +
                            `${nivel.descripcion}\n\n` +
                            `Si crees que es un error, abre un ticket en Discord.`
                        )
                        .setTimestamp()
                    ]
                });
            } catch (e) {}

            const avisoNivel4 = sancionData.nivelActual === 4
                ? '\n\n🔨 **Este jugador ha acumulado 4 sanciones. Se recomienda valorar un baneo permanente.**'
                : '';

            await interaction.editReply({ embeds: [embed], content: avisoNivel4 || undefined });
        }

        // --- PERDONAR ---
        if (sub === 'perdonar') {
            const sancionData = database.getSancion(usuario.id);
            if (!sancionData || sancionData.nivelActual === 0) {
                return interaction.editReply({ content: `ℹ️ ${usuario.username} no tiene sanciones activas.` });
            }

            const nivelAnterior = sancionData.nivelActual;
            sancionData.nivelActual = 0;
            sancionData.historial.push({
                nivel: 0,
                motivo: `PERDÓN: ${motivo}`,
                adminId: interaction.user.id,
                adminUsername: interaction.user.username,
                fecha: new Date().toISOString()
            });

            const jugador = database.getJugador(usuario.id);
            const nombreArk = jugador?.nombre_ark || usuario.username;
            database.removePenalizado(nombreArk);
            database.setSancion(sancionData);

            try {
                await usuario.send({ content: `✅ Tu historial de sanciones en TSDE Arkeanos ha sido perdonado por la administración. ¡Bienvenido de vuelta! 🦖` });
            } catch (e) {}

            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setTitle('✅ Sanción perdonada')
                    .setColor(0x2ECC71)
                    .addFields(
                        { name: '👤 Jugador', value: usuario.username, inline: true },
                        { name: '📊 Nivel anterior', value: `${nivelAnterior}/4`, inline: true },
                        { name: '📝 Motivo del perdón', value: motivo, inline: false }
                    )
                    .setTimestamp()
                ]
            });
        }

        // --- HISTORIAL ---
        if (sub === 'historial') {
            const sancionData = database.getSancion(usuario.id);

            if (!sancionData || sancionData.historial.length === 0) {
                return interaction.editReply({ content: `✅ ${usuario.username} no tiene historial de sanciones.` });
            }

            const historialTexto = sancionData.historial.slice(-5).map((h, i) => {
                const nivel = h.nivel === 0 ? '✅ PERDÓN' : `${NIVELES[h.nivel]?.emoji || '⚠️'} Nivel ${h.nivel}`;
                const fecha = new Date(h.fecha).toLocaleDateString('es-ES');
                return `**${nivel}** — ${h.motivo} *(${fecha})*`;
            }).join('\n');

            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setTitle(`📋 Historial de sanciones — ${usuario.username}`)
                    .setColor(sancionData.nivelActual > 0 ? NIVELES[sancionData.nivelActual].color : 0x2ECC71)
                    .addFields(
                        { name: '📊 Nivel actual', value: `${sancionData.nivelActual}/4 — ${NIVELES[sancionData.nivelActual]?.nombre || 'Sin sanciones'}`, inline: true },
                        { name: '📜 Últimas sanciones', value: historialTexto, inline: false }
                    )
                ]
            });
        }
    }
};
