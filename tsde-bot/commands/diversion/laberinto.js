const { SlashCommandBuilder } = require('discord.js');
const laberintoEngine = require('../../modules/laberintoEngine.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('laberinto')
        .setDescription('Gestionar el Laberinto TSDE')
        .addSubcommand(sub =>
            sub.setName('crear')
                .setDescription('Crear evento del laberinto con inscripciones [ADMIN]')
        )
        .addSubcommand(sub =>
            sub.setName('podium')
                .setDescription('Ver el podium actual del laberinto')
        ),

    async execute(interaction, client) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'crear') {
            if (!interaction.member.permissions.has('ManageMessages')) {
                return interaction.reply({ content: '⛔ Solo administradores.', ephemeral: true });
            }
            await laberintoEngine.mostrarModalCrearLaberinto(interaction);
        }

        if (sub === 'podium') {
            await laberintoEngine.verPodium(interaction);
        }
    }
};
