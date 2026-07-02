const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const { hacerBackup, listarBackups, restaurarBackup } = require('../../modules/backupEngine.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('backup')
        .setDescription('Gestión de backups de la base de datos [ADMIN]')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addSubcommand(sub =>
            sub.setName('hacer')
                .setDescription('Hacer un backup manual ahora mismo')
        )
        .addSubcommand(sub =>
            sub.setName('listar')
                .setDescription('Ver los backups disponibles')
        )
        .addSubcommand(sub =>
            sub.setName('restaurar')
                .setDescription('Restaurar un backup específico')
                .addStringOption(opt =>
                    opt.setName('archivo')
                        .setDescription('Nombre del archivo de backup')
                        .setRequired(true)
                )
        ),

    async execute(interaction, client) {
        const sub = interaction.options.getSubcommand();

        if (sub === 'hacer') {
            const archivo = hacerBackup();
            if (archivo) {
                await interaction.reply({
                    embeds: [new EmbedBuilder()
                        .setTitle('✅ Backup creado')
                        .setColor(0x2ECC71)
                        .setDescription(`Archivo: \`${archivo}\``)
                        .setTimestamp()
                    ],
                    flags: MessageFlags.Ephemeral
                });
            } else {
                await interaction.reply({ content: '❌ Error al crear el backup.', flags: MessageFlags.Ephemeral });
            }
        }

        if (sub === 'listar') {
            const backups = listarBackups();
            if (backups.length === 0) {
                return interaction.reply({ content: 'No hay backups disponibles.', flags: MessageFlags.Ephemeral });
            }

            const lista = backups.map((b, i) =>
                `${i === 0 ? '🟢' : '⚪'} \`${b.nombre}\` — ${b.tamaño}`
            ).join('\n');

            await interaction.reply({
                embeds: [new EmbedBuilder()
                    .setTitle('📦 Backups disponibles')
                    .setColor(0x3498DB)
                    .setDescription(lista)
                    .setFooter({ text: `${backups.length} backups · Se mantienen los últimos 7` })
                ],
                flags: MessageFlags.Ephemeral
            });
        }

        if (sub === 'restaurar') {
            const archivo = interaction.options.getString('archivo');
            const exito = restaurarBackup(archivo);
            if (exito) {
                await interaction.reply({
                    content: `✅ Base de datos restaurada desde \`${archivo}\`. Reinicia el bot para aplicar los cambios:\n\`\`\`\npm2 restart tsde-bot\n\`\`\``,
                    flags: MessageFlags.Ephemeral
                });
            } else {
                await interaction.reply({ content: `❌ No se encontró el archivo \`${archivo}\`.`, flags: MessageFlags.Ephemeral });
            }
        }
    }
};
