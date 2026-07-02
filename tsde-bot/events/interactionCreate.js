module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {

        // --- SLASH COMMANDS ---
        if (interaction.isChatInputCommand()) {
            const command = client.commands.get(interaction.commandName);
            if (!command) return;
            try {
                await command.execute(interaction, client);
            } catch (error) {
                console.error(`[ERROR] Comando /${interaction.commandName}:`, error);
                const msg = { content: '❌ Hubo un error al ejecutar este comando.', ephemeral: true };
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp(msg);
                } else {
                    await interaction.reply(msg);
                }
            }
            return;
        }

        // --- BOTONES ---
        if (interaction.isButton()) {
            const id = interaction.customId;
            if (id.startsWith('lab_')) return require('../modules/laberintoEngine.js').handleButton(interaction, client);
            if (id.startsWith('evt_')) return require('../modules/eventEngine.js').handleButton(interaction, client);
            if (id.startsWith('trn_')) return require('../modules/torneoEngine.js').handleButton(interaction, client);
            if (id.startsWith('reg_')) return require('../modules/reglasEngine.js').handleButton(interaction, client);
            if (id.startsWith('vot_')) return require('../modules/votacionesEngine.js').handleButton(interaction, client);
            if (id.startsWith('pol_')) return require('../modules/pollEngine.js').handleButton(interaction, client);
            if (id.startsWith('mer_')) return require('../modules/mercadoEngine.js').handleButton(interaction, client);
            if (id.startsWith('bb_')) return require('../modules/banderaBlancaEngine.js').handleButton(interaction, client);
            if (id.startsWith('tkt_')) return require('../modules/ticketEngine.js').handleButton(interaction, client);
        }

        // --- SELECT MENUS ---
        if (interaction.isStringSelectMenu()) {
            const id = interaction.customId;
            if (id.startsWith('lab_')) return require('../modules/laberintoEngine.js').handleSelect(interaction, client);
            if (id.startsWith('evt_')) return require('../modules/eventEngine.js').handleSelect(interaction, client);
        }

        // --- MODALES ---
        if (interaction.isModalSubmit()) {
            const id = interaction.customId;
            if (id.startsWith('reg_')) return require('../modules/reglasEngine.js').handleModal(interaction, client);
            if (id.startsWith('lab_')) return require('../modules/laberintoEngine.js').handleModal(interaction, client);
            if (id.startsWith('evt_')) return require('../modules/eventEngine.js').handleModal(interaction, client);
            if (id.startsWith('vot_')) return require('../modules/votacionesEngine.js').handleModal(interaction, client);
            if (id.startsWith('pol_')) return require('../modules/pollEngine.js').handleModal(interaction, client);
            if (id.startsWith('mer_')) return require('../modules/mercadoEngine.js').handleModal(interaction, client);
            if (id.startsWith('hof_')) return require('../modules/hallFameEngine.js').handleModal(interaction, client);
            if (id.startsWith('msg_')) return require('../commands/admin/mensaje.js').handleModal(interaction, client);
            if (id.startsWith('bb_')) return require('../modules/banderaBlancaEngine.js').handleModal(interaction, client);
            if (id.startsWith('tkt_')) return require('../modules/ticketEngine.js').handleModal(interaction, client);
        }
    }
};
