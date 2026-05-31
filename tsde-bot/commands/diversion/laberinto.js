const { SlashCommandBuilder } = require('discord.js');
const laberintoEngine = require('../../modules/laberintoEngine.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('laberinto')
        .setDescription('Gestionar el Laberinto TSDE')
        .addSubcommand(sub =>
            sub.setName('crear')
                .setDescription('Crear evento del laberinto [ADMIN]')
                .addStringOption(opt =>
                    opt.setName('modo')
                        .setDescription('Modo de juego')
                        .setRequired(true)
                        .addChoices(
                            { name: '⏱️ Contrarreloj — el más rápido gana', value: 'speed' },
                            { name: '⚔️ Supervivencia — último vivo gana', value: 'survival' },
                            { name: '👥 Por equipos/tribus — tiempo combinado', value: 'teams' },
                            { name: '🔄 Relevos — cada miembro hace una parte', value: 'relay' }
                        )
                )
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
            const modo = interaction.options.getString('modo');
            await laberintoEngine.mostrarModalCrearLaberinto(interaction, modo);
        }

        if (sub === 'podium') {
            await laberintoEngine.verPodium(interaction);
        }
    }
};
