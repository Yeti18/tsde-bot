const { SlashCommandBuilder } = require('discord.js');
const torneoEngine = require('../../modules/torneoEngine.js');
const fs = require('fs');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('iniciar-torneo')
        .setDescription('Convierte un evento en torneo con bracket automático [ADMIN]')
        .addStringOption(opt =>
            opt.setName('evento_id')
                .setDescription('ID del evento (se ve en la base de datos)')
                .setRequired(false)
        ),

    async execute(interaction, client) {
        if (!interaction.member.permissions.has('ManageMessages')) {
            return interaction.reply({ content: '⛔ Solo administradores.', ephemeral: true });
        }

        const db = JSON.parse(fs.readFileSync('./database.json', 'utf8'));
        const activos = Object.values(db.eventos_activos || {});

        if (activos.length === 0) {
            return interaction.reply({ content: '❌ No hay eventos activos con inscritos.', ephemeral: true });
        }

        // Si hay varios eventos activos, elegir el que tenga más inscritos
        let eventoId = interaction.options.getString('evento_id');

        if (!eventoId) {
            // Usar el evento con más inscritos automáticamente
            const conInscritos = activos.filter(e => (e.inscritos || []).length >= 2);
            if (conInscritos.length === 0) {
                return interaction.reply({ content: '❌ Necesitas al menos 2 inscritos para iniciar un torneo.', ephemeral: true });
            }
            conInscritos.sort((a, b) => b.inscritos.length - a.inscritos.length);
            eventoId = conInscritos[0].id;
        }

        const evento = db.eventos_activos[eventoId];
        if (!evento) {
            return interaction.reply({ content: '❌ Evento no encontrado.', ephemeral: true });
        }

        if ((evento.inscritos || []).length < 2) {
            return interaction.reply({ content: '❌ Necesitas al menos 2 jugadores inscritos.', ephemeral: true });
        }

        await torneoEngine.iniciarTorneo(interaction, client, eventoId);
    }
};
