const { SlashCommandBuilder } = require('discord.js');
const votacionesEngine = require('../../modules/votacionesEngine.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('sugerir')
        .setDescription('Envía una sugerencia para mejorar el servidor'),

    async execute(interaction, client) {
        await votacionesEngine.mostrarModalSugerencia(interaction);
    }
};
