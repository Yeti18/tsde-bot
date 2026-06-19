const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const eventEngine = require('../../modules/eventEngine.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('crear-evento')
        .setDescription('Crea un nuevo evento con inscripciones automáticas [ADMIN]')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    async execute(interaction, client) {
        if (!interaction.member.permissions.has('ManageMessages')) {
            return interaction.reply({ content: '⛔ Solo los administradores pueden crear eventos.', ephemeral: true });
        }

        await eventEngine.mostrarModalCrearEvento(interaction);
    }
};
