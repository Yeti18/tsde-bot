const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const votacionesEngine = require('../../modules/votacionesEngine.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('votaciones')
        .setDescription('Gestionar votaciones semanales [ADMIN]')
        .addSubcommand(sub =>
            sub.setName('publicar')
                .setDescription('Publicar las sugerencias pendientes en votación ahora')
        )
        .addSubcommand(sub =>
            sub.setName('cerrar')
                .setDescription('Cerrar votaciones y publicar la sugerencia ganadora')
        )
        .addSubcommand(sub =>
            sub.setName('ver')
                .setDescription('Ver sugerencias pendientes de votación')
        ),

    async execute(interaction, client) {
        if (!interaction.member.permissions.has('ManageMessages') &&
            interaction.options.getSubcommand() !== 'ver') {
            return interaction.reply({ content: '⛔ Solo administradores.', ephemeral: true });
        }

        const sub = interaction.options.getSubcommand();

        if (sub === 'publicar') {
            await interaction.deferReply({ ephemeral: true });
            await votacionesEngine.publicarVotacionSemanal(client);
            await interaction.editReply({ content: '✅ Votaciones publicadas en el canal de sugerencias.' });
        }

        if (sub === 'cerrar') {
            await interaction.deferReply({ ephemeral: true });
            await votacionesEngine.publicarGanadora(client);
            await interaction.editReply({ content: '✅ Votaciones cerradas y ganadora publicada.' });
        }

        if (sub === 'ver') {
            await votacionesEngine.mostrarSugerencias(interaction);
        }
    }
};
