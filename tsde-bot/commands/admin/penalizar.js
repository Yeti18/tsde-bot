const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const fs = require('fs');
const config = require('../../config.json');

const DB_PATH = './database.json';

function cargarDB() {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function guardarDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

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

        const db = cargarDB();
        if (!db.sanciones) db.sanciones = {};
        if (!db.penalizados) db.penalizados = [];
        if (!db.advertencias) db.advertencias = [];

        // --- SANCIONAR ---
        if (sub === 'sancionar') {
            if (!db.sanciones[usuario.id]) {
                db.sanciones[usuario.id] = {
                    discordId: usuario.id,
                    discordUsername: usuario.username,
                    historial: [],
                    nivelActual: 0
                };
            }

            const sancion = db.sanciones[usuario.id];
            sancion.nivelActual = Math.min(sancion.nivelActual + 1, 4);
            const nivel = NIVELES[sancion.nivelActual];

            sancion.historial.push({
                nivel: sancion.nivelActual,
                motivo,
                adminId: interaction.user.id,
                adminUsername: interaction.user.username,
                fecha: new Date().toISOString()
            });

            // Aplicar efectos según nivel
            if (sancion.nivelActual >= 3) {
                // Nivel 3+ → bloquear de eventos
                const nombreArk = db.jugadores?.[usuario.id]?.nombreArk || usuario.username;
                if (!db.penalizados.includes(nombreArk)) {
                    db.penalizados.push(nombreArk);
                }
            }

            // Guardar advertencia en el registro de advertencias también
            db.advertencias.push({
                jugadorId: usuario.id,
                jugadorUsername: usuario.username,
                motivo,
                adminId: interaction.user.id,
                adminUsername: interaction.user.username,
                nivel: sancion.nivelActual,
                fecha: new Date().toISOString()
            });

            guardarDB(db);

            // Embed del resultado
            const embed = new EmbedBuilder()
                .setTitle(`${nivel.emoji} Sanción aplicada — Nivel ${sancion.nivelActual}`)
                .setColor(nivel.color)
                .addFields(
                    { name: '👤 Jugador', value: `${usuario.username} (<@${usuario.id}>)`, inline: true },
                    { name: '📋 Tipo', value: nivel.nombre, inline: true },
                    { name: '📝 Motivo', value: motivo, inline: false },
                    { name: 'ℹ️ Efecto', value: nivel.descripcion, inline: false },
                    { name: '📊 Historial', value: `${sancion.nivelActual}/4 sanciones acumuladas`, inline: true }
                )
                .setTimestamp();

            // Avisar en #logs
            try {
                if (config.canales.logs) {
                    const canalLogs = await client.channels.fetch(config.canales.logs);
                    await canalLogs.send({ embeds: [embed] });
                }
            } catch (e) {}

            // DM al jugador
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

            // Advertencia especial si llega a nivel 4
            const avisoNivel4 = sancion.nivelActual === 4
                ? '\n\n🔨 **Este jugador ha acumulado 4 sanciones. Se recomienda valorar un baneo permanente.**'
                : '';

            await interaction.editReply({
                embeds: [embed],
                content: avisoNivel4 || undefined
            });
        }

        // --- PERDONAR ---
        if (sub === 'perdonar') {
            const sancion = db.sanciones?.[usuario.id];
            if (!sancion || sancion.nivelActual === 0) {
                return interaction.editReply({ content: `ℹ️ ${usuario.username} no tiene sanciones activas.` });
            }

            const nivelAnterior = sancion.nivelActual;
            sancion.nivelActual = 0;
            sancion.historial.push({
                nivel: 0,
                motivo: `PERDÓN: ${motivo}`,
                adminId: interaction.user.id,
                adminUsername: interaction.user.username,
                fecha: new Date().toISOString()
            });

            // Quitar de penalizados si estaba
            const nombreArk = db.jugadores?.[usuario.id]?.nombreArk || usuario.username;
            db.penalizados = db.penalizados.filter(p => p !== nombreArk);

            guardarDB(db);

            // DM al jugador
            try {
                await usuario.send({
                    content: `✅ Tu historial de sanciones en TSDE Arkeanos ha sido perdonado por la administración. ¡Bienvenido de vuelta! 🦖`
                });
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
            const sancion = db.sanciones?.[usuario.id];

            if (!sancion || sancion.historial.length === 0) {
                return interaction.editReply({ content: `✅ ${usuario.username} no tiene historial de sanciones.` });
            }

            const historialTexto = sancion.historial.slice(-5).map((h, i) => {
                const nivel = h.nivel === 0 ? '✅ PERDÓN' : `${NIVELES[h.nivel]?.emoji || '⚠️'} Nivel ${h.nivel}`;
                const fecha = new Date(h.fecha).toLocaleDateString('es-ES');
                return `**${nivel}** — ${h.motivo} *(${fecha})*`;
            }).join('\n');

            await interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setTitle(`📋 Historial de sanciones — ${usuario.username}`)
                    .setColor(sancion.nivelActual > 0 ? NIVELES[sancion.nivelActual].color : 0x2ECC71)
                    .addFields(
                        { name: '📊 Nivel actual', value: `${sancion.nivelActual}/4 — ${NIVELES[sancion.nivelActual]?.nombre || 'Sin sanciones'}`, inline: true },
                        { name: '📜 Últimas sanciones', value: historialTexto, inline: false }
                    )
                ]
            });
        }
    }
};
