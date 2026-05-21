const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('eventos')
        .setDescription('Ver los eventos activos de TSDE Arkeanos'),

    async execute(interaction) {
        const db = JSON.parse(fs.readFileSync('./database.json', 'utf8'));
        const activos = Object.values(db.eventos_activos || {});

        if (activos.length === 0) {
            return interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('🎉 Eventos TSDE Arkeanos')
                        .setDescription('No hay eventos activos en este momento.\nEstate atento a #anuncios 📣')
                        .setColor(0x9B59B6)
                ],
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setTitle('🎉 Eventos activos — TSDE Arkeanos')
            .setColor(0x9B59B6);

        for (const evento of activos) {
            const inscritos = (evento.inscritos || []).length;
            const limite = evento.limite || '∞';
            embed.addFields({
                name: `📌 ${evento.titulo}`,
                value: `📅 ${evento.fecha}\n🏆 ${evento.premio}\n👥 ${inscritos}/${limite} inscritos\n Estado: ${evento.estado === 'cerrado' ? '🔴 Cerrado' : '🟢 Abierto'}`,
                inline: false
            });
        }

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }
};
