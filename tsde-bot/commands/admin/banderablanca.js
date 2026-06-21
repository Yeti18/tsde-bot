const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const bbEngine = require('../../modules/banderaBlancaEngine.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('banderablanca')
        .setDescription('Gestionar protecciones de Bandera Blanca [ADMIN]')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addSubcommand(sub =>
            sub.setName('activar')
                .setDescription('Activar la protección tras hacerlo en el juego')
                .addStringOption(opt =>
                    opt.setName('nombre')
                        .setDescription('Nombre exacto del jugador en ARK')
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub.setName('ver')
                .setDescription('Ver solicitudes pendientes y protecciones activas')
        )
        .addSubcommand(sub =>
            sub.setName('quitar')
                .setDescription('Retirar una protección activa manualmente')
                .addStringOption(opt =>
                    opt.setName('nombre')
                        .setDescription('Nombre exacto del jugador en ARK')
                        .setRequired(true)
                )
        ),

    async execute(interaction, client) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'activar') {
            const nombre = interaction.options.getString('nombre');
            await bbEngine.activarProteccion(interaction, client, nombre);
        }

        if (sub === 'ver') {
            await bbEngine.verProtecciones(interaction);
        }

        if (sub === 'quitar') {
            const nombre = interaction.options.getString('nombre');
            await bbEngine.quitarProteccion(interaction, client, nombre);
        }
    }
};
