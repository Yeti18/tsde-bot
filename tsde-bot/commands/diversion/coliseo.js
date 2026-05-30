const { SlashCommandBuilder } = require('discord.js');
const coliseoEngine = require('../../modules/coliseoEngine.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('coliseo')
        .setDescription('Gestionar taquillas del Coliseo TSDE [ADMIN]')
        .addSubcommand(sub =>
            sub.setName('ver')
                .setDescription('Ver todas las taquillas asignadas del evento actual')
        )
        .addSubcommand(sub =>
            sub.setName('resetear')
                .setDescription('Limpiar todas las taquillas para el próximo evento')
        )
        .addSubcommand(sub =>
            sub.setName('taquilla')
                .setDescription('Ver la taquilla de un jugador concreto')
                .addUserOption(opt =>
                    opt.setName('jugador')
                        .setDescription('Jugador a consultar')
                        .setRequired(true)
                )
        ),

    async execute(interaction, client) {
        if (!interaction.member.permissions.has('ManageMessages')) {
            return interaction.reply({ content: '⛔ Solo administradores.', ephemeral: true });
        }

        const sub = interaction.options.getSubcommand();

        if (sub === 'ver') {
            await coliseoEngine.verTaquillas(interaction);
        }

        if (sub === 'resetear') {
            await coliseoEngine.resetearTaquillas(interaction);
        }

        if (sub === 'taquilla') {
            const usuario = interaction.options.getUser('jugador');
            const guild = interaction.guild;
            const member = await guild.members.fetch(usuario.id);
            await coliseoEngine.verTaquillaJugador(interaction, member);
        }
    }
};
