const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');

const DB_PATH = './database.json';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('registrar')
        .setDescription('Gestionar registros de jugadores [ADMIN]')
        .addSubcommand(sub =>
            sub.setName('actualizar')
                .setDescription('Actualizar el nombre ARK de un jugador')
                .addUserOption(opt =>
                    opt.setName('jugador')
                        .setDescription('Jugador a actualizar')
                        .setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName('nombre_ark')
                        .setDescription('Nombre correcto en ARK')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('ver')
                .setDescription('Ver el nombre ARK registrado de un jugador')
                .addUserOption(opt =>
                    opt.setName('jugador')
                        .setDescription('Jugador a consultar')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('lista')
                .setDescription('Ver todos los jugadores registrados')
        ),

    async execute(interaction, client) {
        if (!interaction.member.permissions.has('ManageMessages')) {
            return interaction.reply({ content: '⛔ Solo administradores.', ephemeral: true });
        }

        const sub = interaction.options.getSubcommand();
        const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
        if (!db.jugadores) db.jugadores = {};

        // --- ACTUALIZAR NOMBRE ---
        if (sub === 'actualizar') {
            const usuario = interaction.options.getUser('jugador');
            const nuevoNombre = interaction.options.getString('nombre_ark').trim();

            try {
                const member = await interaction.guild.members.fetch(usuario.id);

                // Cambiar apodo en Discord
                try {
                    await member.setNickname(nuevoNombre, `Actualización admin — ${interaction.user.username}`);
                } catch (e) {
                    console.warn(`[REG] No se pudo cambiar apodo: ${e.message}`);
                }

                // Actualizar en base de datos
                const nombreAnterior = db.jugadores[usuario.id]?.nombreArk || 'No registrado';
                if (!db.jugadores[usuario.id]) {
                    db.jugadores[usuario.id] = {
                        discordId: usuario.id,
                        discordUsername: usuario.username
                    };
                }
                db.jugadores[usuario.id].nombreArk = nuevoNombre;
                db.jugadores[usuario.id].actualizadoPor = interaction.user.username;
                db.jugadores[usuario.id].fechaActualizacion = new Date().toISOString();
                fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));

                await interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('✅ Registro actualizado')
                            .setColor(0x2ECC71)
                            .addFields(
                                { name: '👤 Discord', value: usuario.username, inline: true },
                                { name: '❌ Nombre anterior', value: nombreAnterior, inline: true },
                                { name: '✅ Nombre nuevo', value: nuevoNombre, inline: true }
                            )
                    ]
                });

            } catch (error) {
                await interaction.reply({ content: `❌ Error: ${error.message}`, ephemeral: true });
            }
        }

        // --- VER JUGADOR ---
        if (sub === 'ver') {
            const usuario = interaction.options.getUser('jugador');
            const datos = db.jugadores[usuario.id];

            if (!datos) {
                return interaction.reply({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('❌ Jugador no registrado')
                            .setDescription(`**${usuario.username}** no ha completado el registro todavía.`)
                            .setColor(0xE74C3C)
                    ],
                    ephemeral: true
                });
            }

            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('📋 Datos del jugador')
                        .setColor(0x3498DB)
                        .addFields(
                            { name: '👤 Discord', value: datos.discordUsername, inline: true },
                            { name: '🎮 Nombre ARK', value: datos.nombreArk, inline: true },
                            { name: '📅 Registro', value: new Date(datos.fechaRegistro).toLocaleDateString('es-ES'), inline: true }
                        )
                ],
                ephemeral: true
            });
        }

        // --- LISTA COMPLETA ---
        if (sub === 'lista') {
            const jugadores = Object.values(db.jugadores);

            if (jugadores.length === 0) {
                return interaction.reply({
                    content: '📋 No hay jugadores registrados aún.',
                    ephemeral: true
                });
            }

            // Dividir en páginas de 20 si hay muchos
            const lista = jugadores
                .slice(0, 20)
                .map((j, i) => `${i + 1}. **${j.nombreArk}** — ${j.discordUsername}`)
                .join('\n');

            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(`📋 Jugadores registrados (${jugadores.length})`)
                        .setDescription(lista)
                        .setColor(0x3498DB)
                        .setFooter({ text: jugadores.length > 20 ? `Mostrando 20 de ${jugadores.length}` : `Total: ${jugadores.length}` })
                ],
                ephemeral: true
            });
        }
    }
};
