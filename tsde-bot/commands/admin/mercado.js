const { SlashCommandBuilder } = require('discord.js');
const mercadoEngine = require('../../modules/mercadoEngine.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('mercado')
        .setDescription('Gestionar puestos del mercado TSDE [ADMIN]')
        .addSubcommand(sub =>
            sub.setName('dar-puesto')
                .setDescription('Asignar rol Mercader y puesto a un jugador')
                .addUserOption(opt =>
                    opt.setName('jugador')
                        .setDescription('Jugador al que asignar el puesto')
                        .setRequired(true)
                )
                .addIntegerOption(opt =>
                    opt.setName('numero')
                        .setDescription('Número de puesto (1-34)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(34)
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
        )
        .addSubcommand(sub =>
            sub.setName('ver-puestos')
                .setDescription('Ver todos los puestos asignados actualmente')
        ),

    async execute(interaction, client) {
        if (!interaction.member.permissions.has('ManageMessages')) {
            return interaction.reply({ content: '⛔ Solo administradores.', ephemeral: true });
        }

        const sub = interaction.options.getSubcommand();

        if (sub === 'dar-puesto') {
            const usuario = interaction.options.getUser('jugador');
            const numero = interaction.options.getInteger('numero');
            await mercadoEngine.darRolMercader(interaction, client, usuario, numero);
        }

        if (sub === 'quitar-puesto') {
            const usuario = interaction.options.getUser('jugador');
            await mercadoEngine.quitarRolMercader(interaction, client, usuario);
        }

        if (sub === 'ver-puestos') {
            const fs = require('fs');
            const db = JSON.parse(fs.readFileSync('./database.json', 'utf8'));
            const mercaderes = db.mercaderes || {};
            const lista = Object.values(mercaderes);

            if (lista.length === 0) {
                return interaction.reply({ content: '📋 No hay mercaderes activos actualmente.', ephemeral: true });
            }

            const { EmbedBuilder } = require('discord.js');
            const embed = new EmbedBuilder()
                .setTitle('🛒 Puestos del Mercado TSDE')
                .setColor(0xE67E22)
                .setDescription(
                    lista.map(m => `**${m.puesto}** — ${m.username}`).join('\n')
                )
                .setFooter({ text: `${lista.length} puestos ocupados` });

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }
};
