const { SlashCommandBuilder } = require('discord.js');
const pollEngine = require('../../modules/pollEngine.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('encuesta')
        .setDescription('Crear una encuesta en el canal actual'),

    async execute(interaction, client) {
        await pollEngine.mostrarModalPoll(interaction);
    }
};
