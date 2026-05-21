const { SlashCommandBuilder } = require('discord.js');
const mercadoEngine = require('../../modules/mercadoEngine.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('vender')
        .setDescription('Publicar un artículo en el mercado TSDE (solo Mercaderes)')
        .addSubcommand(sub =>
            sub.setName('dino')
                .setDescription('Publicar un dino en venta')
        )
        .addSubcommand(sub =>
            sub.setName('item')
                .setDescription('Publicar un ítem o equipamiento en venta')
        )
        .addSubcommand(sub =>
            sub.setName('recurso')
                .setDescription('Publicar recursos o materiales en venta')
        )
        .addSubcommand(sub =>
            sub.setName('servicio')
                .setDescription('Publicar un servicio (doma, cría, construcción...)')
        ),

    async execute(interaction, client) {
        // Solo Mercaderes pueden publicar
        if (!mercadoEngine.esMercader(interaction)) {
            return interaction.reply({
                content: '⛔ Solo los jugadores con el rol **🛒 Mercader** pueden publicar en el mercado.\n\nAbre un ticket en #tickets para solicitar un puesto.',
                ephemeral: true
            });
        }

        const sub = interaction.options.getSubcommand();

        if (sub === 'dino') {
            await mercadoEngine.mostrarModalVenderDino(interaction);
        } else {
            await mercadoEngine.mostrarModalVenderItem(interaction, sub);
        }
    }
};
