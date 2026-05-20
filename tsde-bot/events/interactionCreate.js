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

            // Módulo Laberinto
            if (id.startsWith('lab_')) {
                const engine = require('../modules/laberintoEngine.js');
                return engine.handleButton(interaction, client);
            }

            // Módulo Eventos / Torneos
            if (id.startsWith('evt_')) {
                const engine = require('../modules/eventEngine.js');
                return engine.handleButton(interaction, client);
            }

            // Módulo Torneos / Bracket
            if (id.startsWith('trn_')) {
                const engine = require('../modules/torneoEngine.js');
                return engine.handleButton(interaction, client);
            }

            // AQUÍ se añaden futuros módulos sin tocar nada más:
            // if (id.startsWith('mer_')) { require('../modules/mercadoEngine.js').handleButton(...) }
        }

        // --- SELECT MENUS ---
        if (interaction.isStringSelectMenu()) {
            const id = interaction.customId;

            if (id.startsWith('evt_')) {
                const engine = require('../modules/eventEngine.js');
                return engine.handleSelect(interaction, client);
            }
        }

        // --- MODALES ---
        if (interaction.isModalSubmit()) {
            const id = interaction.customId;

            if (id.startsWith('evt_')) {
                const engine = require('../modules/eventEngine.js');
                return engine.handleModal(interaction, client);
            }
        }
    }
};
