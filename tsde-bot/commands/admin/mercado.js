const { SlashCommandBuilder } = require('discord.js');
const mercadoEngine = require('../../modules/mercadoEngine.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mercado')
        .setDescription('Gestionar puestos del mercado TSDE [ADMIN]')
        .addSubcommand(sub =>
            sub.setName('dar-puesto')
                .setDescription('Asignar rol Mercader a un jugador')
                .addUserOption(opt =>
                    opt.setName('jugador')
                        .setDescription('Jugador al que asignar el puesto')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('quitar-puesto')
                .setDescription('Retirar rol Mercader a un jugador')
                .addUserOption(opt =>
                    opt.setName('jugador')
                        .setDescription('Jugador al que retirar el puesto')
                        .setRequired(true)
                )
        ),

    async execute(interaction, client) {
        if (!interaction.member.permissions.has('ManageMessages')) {
            return interaction.reply({ content: '⛔ Solo administradores.', ephemeral: true });
        }

        const sub = interaction.options.getSubcommand();
        const usuario = interaction.options.getUser('jugador');

        if (sub === 'dar-puesto') {
            await mercadoEngine.darRolMercader(interaction, client, usuario);
        }

        if (sub === 'quitar-puesto') {
            await mercadoEngine.quitarRolMercader(interaction, client, usuario);
        }
    }
};
