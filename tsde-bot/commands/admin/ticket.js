const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const { advertirJugador } = require('../../modules/ticketEngine.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Gestión de tickets [ADMIN]')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addSubcommand(sub =>
            sub.setName('advertir')
                .setDescription('Enviar advertencia oficial a un jugador')
                .addUserOption(opt =>
                    opt.setName('jugador').setDescription('Jugador a advertir').setRequired(true)
                )
                .addStringOption(opt =>
                    opt.setName('motivo').setDescription('Motivo de la advertencia').setRequired(true)
                )
        ),

    async execute(interaction, client) {
        const sub = interaction.options.getSubcommand();
        if (sub === 'advertir') {
            const usuario = interaction.options.getUser('jugador');
            const motivo = interaction.options.getString('motivo');
            await advertirJugador(interaction, client, usuario, motivo);
        }
    }
};
