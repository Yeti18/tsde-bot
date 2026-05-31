const { SlashCommandBuilder } = require('discord.js');
const hallFameEngine = require('../../modules/hallFameEngine.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('halloffame')
        .setDescription('Gestionar el Hall of Fame de TSDE')
        .addSubcommand(sub =>
            sub.setName('ver')
                .setDescription('Ver el Hall of Fame completo')
        )
        .addSubcommand(sub =>
            sub.setName('añadir')
                .setDescription('Añadir un jugador o tribu al Hall of Fame [ADMIN]')
        )
        .addSubcommand(sub =>
            sub.setName('actualizar')
                .setDescription('Actualizar el mensaje del canal #hall-of-fame [ADMIN]')
        )
        .addSubcommand(sub =>
            sub.setName('eliminar')
                .setDescription('Eliminar una entrada del Hall of Fame [ADMIN]')
                .addStringOption(opt =>
                    opt.setName('id')
                        .setDescription('ID de la entrada (visible con /halloffame ver)')
                        .setRequired(true)
                )
        ),

    async execute(interaction, client) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'ver') {
            await hallFameEngine.verHallOfFame(interaction);
        }

        if (sub === 'añadir') {
            if (!interaction.member.permissions.has('ManageMessages')) {
                return interaction.reply({ content: '⛔ Solo administradores.', ephemeral: true });
            }
            await hallFameEngine.mostrarModalAñadir(interaction);
        }

        if (sub === 'actualizar') {
            if (!interaction.member.permissions.has('ManageMessages')) {
                return interaction.reply({ content: '⛔ Solo administradores.', ephemeral: true });
            }
            await interaction.deferReply({ ephemeral: true });
            await hallFameEngine.actualizarMensajeHoF(client);
            await interaction.editReply({ content: '✅ Canal #hall-of-fame actualizado.' });
        }

        if (sub === 'eliminar') {
            const id = interaction.options.getString('id');
            await hallFameEngine.eliminarEntrada(interaction, client, id);
        }
    }
};
