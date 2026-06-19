const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const fs = require('fs');

const DB_PATH = './database.json';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('penalizar')
        .setDescription('Penaliza o despenaliza a un jugador [ADMIN]')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addStringOption(opt =>
            opt.setName('jugador')
                .setDescription('Nombre del jugador en Discord')
                .setRequired(true)
        )
        .addStringOption(opt =>
            opt.setName('accion')
                .setDescription('Añadir o quitar penalización')
                .setRequired(true)
                .addChoices(
                    { name: 'Penalizar', value: 'add' },
                    { name: 'Despenalizar', value: 'remove' }
                )
        ),

    async execute(interaction) {
        if (!interaction.member.permissions.has('ManageMessages')) {
            return interaction.reply({ content: '⛔ Solo los administradores.', ephemeral: true });
        }

        const jugador = interaction.options.getString('jugador');
        const accion = interaction.options.getString('accion');
        const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));

        if (!db.penalizados) db.penalizados = [];

        if (accion === 'add') {
            if (!db.penalizados.includes(jugador)) {
                db.penalizados.push(jugador);
            }
            fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
            return interaction.reply({ content: `⛔ **${jugador}** ha sido penalizado y no podrá inscribirse en eventos.`, ephemeral: false });
        } else {
            db.penalizados = db.penalizados.filter(u => u !== jugador);
            fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
            return interaction.reply({ content: `✅ **${jugador}** ya no está penalizado.`, ephemeral: false });
        }
    }
};
