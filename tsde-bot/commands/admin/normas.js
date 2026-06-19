const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const reglasEngine = require('../../modules/reglasEngine.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('normas')
        .setDescription('Publicar las normas de TSDE Arkeanos en este canal [ADMIN]')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async execute(interaction, client) {
        if (!interaction.member.permissions.has('ManageMessages')) {
            return interaction.reply({ content: '⛔ Solo administradores.', ephemeral: true });
        }

        const embeds = reglasEngine.construirEmbedsNormasCanal();
        await interaction.channel.send({ embeds });

        await interaction.reply({ content: '✅ Normas publicadas en este canal.', ephemeral: true });
    }
};
