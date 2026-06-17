const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const embeds = require('../../modules/economiaEmbeds');

// IDs de rol adicionales que pueden ejecutar /economia actualizar
// (déjalo vacío [] si solo quieres restringir por permiso de Administrador)
const ROLES_PERMITIDOS = [];

function tienePermiso(member) {
    if (member.permissions.has('Administrator')) return true;
    if (ROLES_PERMITIDOS.length === 0) return false;
    return member.roles.cache.some(r => ROLES_PERMITIDOS.includes(r.id));
}

async function enviarTodos(channel) {
    await channel.send({ embeds: [embeds.embedMultiplicadores()] });
    await channel.send({ embeds: [embeds.embedGoldCoins()] });
    await channel.send({ embeds: [embeds.embedRecursos()] });
    await channel.send({ embeds: [embeds.embedDinosResumen()] });
    await channel.send({ embeds: [embeds.embedEquipoResumen()] });
    await channel.send({ embeds: [embeds.embedPuestosMercado()] });
    await channel.send({ embeds: [embeds.embedReglas()] });
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('economia')
        .setDescription('Información de la economía del servidor TSDE Arkeanos')
        .addSubcommand(sub =>
            sub.setName('ver')
                .setDescription('Muestra información de economía')
                .addStringOption(opt =>
                    opt.setName('seccion')
                        .setDescription('Qué quieres ver')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Todo', value: 'todo' },
                            { name: 'Multiplicadores', value: 'multiplicadores' },
                            { name: 'Gold Coins', value: 'goldcoin' },
                            { name: 'Recursos', value: 'recursos' },
                            { name: 'Dinos', value: 'dinos' },
                            { name: 'Equipo', value: 'equipo' },
                            { name: 'Mercado', value: 'mercado' },
                            { name: 'Reglas', value: 'reglas' },
                        )
                )
                .addStringOption(opt =>
                    opt.setName('categoria')
                        .setDescription('Solo para Dinos/Equipo: categoría a detallar (ej. "farmeo", "armas de fuego")')
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub.setName('actualizar')
                .setDescription('[ADMIN] Borra y vuelve a publicar todos los embeds de economía con los datos actuales')
        ),

    async execute(interaction, client) {
        const sub = interaction.options.getSubcommand();

        // ── /economia ver ──
        if (sub === 'ver') {
            const seccion = interaction.options.getString('seccion');
            const categoria = interaction.options.getString('categoria');

            if (seccion === 'todo') {
                await interaction.reply({ content: '📊 Publicando toda la información de economía en este canal...', ephemeral: true });
                return enviarTodos(interaction.channel);
            }

            if (seccion === 'multiplicadores') return interaction.reply({ embeds: [embeds.embedMultiplicadores()] });
            if (seccion === 'goldcoin') return interaction.reply({ embeds: [embeds.embedGoldCoins()] });
            if (seccion === 'recursos') return interaction.reply({ embeds: [embeds.embedRecursos()] });
            if (seccion === 'mercado') return interaction.reply({ embeds: [embeds.embedPuestosMercado()] });
            if (seccion === 'reglas') return interaction.reply({ embeds: [embeds.embedReglas()] });

            if (seccion === 'dinos') {
                if (!categoria) return interaction.reply({ embeds: [embeds.embedDinosResumen()] });
                const embed = embeds.embedDinosCategoria(categoria);
                if (!embed) {
                    return interaction.reply({
                        content: `No encontré la categoría "${categoria}". Prueba con: básica, transporte, farmeo, combate medio, combate alto, especialistas, top, endgame.`,
                        ephemeral: true,
                    });
                }
                return interaction.reply({ embeds: [embed] });
            }

            if (seccion === 'equipo') {
                if (!categoria) return interaction.reply({ embeds: [embeds.embedEquipoResumen()] });
                const embed = embeds.embedEquipoCategoria(categoria);
                if (!embed) {
                    return interaction.reply({
                        content: `No encontré la categoría "${categoria}". Prueba con: herramientas, cuerpo a cuerpo, distancia, fuego, explosivos, armadura, consumibles.`,
                        ephemeral: true,
                    });
                }
                return interaction.reply({ embeds: [embed] });
            }
        }

        // ── /economia actualizar ──
        if (sub === 'actualizar') {
            if (!tienePermiso(interaction.member)) {
                return interaction.reply({ content: '⛔ No tienes permiso para actualizar la economía.', ephemeral: true });
            }

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('eco_confirmar').setLabel('Sí, actualizar').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('eco_cancelar').setLabel('Cancelar').setStyle(ButtonStyle.Secondary),
            );

            await interaction.reply({
                content: '⚠️ Esto borrará los mensajes del bot en este canal y publicará todo de nuevo con los datos actuales de `economiaConfig.js`. ¿Continuar?',
                components: [row],
                ephemeral: true,
            });

            const sentMsg = await interaction.fetchReply();

            let respuesta;
            try {
                respuesta = await sentMsg.awaitMessageComponent({
                    filter: i => i.user.id === interaction.user.id,
                    time: 20000,
                });
            } catch {
                return interaction.editReply({ content: 'Actualización cancelada (sin confirmación a tiempo).', components: [] });
            }

            if (respuesta.customId === 'eco_cancelar') {
                return respuesta.update({ content: 'Actualización cancelada.', components: [] });
            }

            await respuesta.update({ content: '🔄 Actualizando...', components: [] });

            const mensajes = await interaction.channel.messages.fetch({ limit: 100 });
            const delBot = mensajes.filter(m => m.author.id === client.user.id);
            for (const m of delBot.values()) {
                await m.delete().catch(() => {});
            }
            await enviarTodos(interaction.channel);
            await interaction.followUp({ content: '✅ Economía actualizada con los datos actuales.', ephemeral: true });
        }
    },
};
