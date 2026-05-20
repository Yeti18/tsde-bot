const { REST, Routes } = require('discord.js');
const fs = require('fs');
const config = require('../config.json');

module.exports = (client) => {
    const commands = [];

    // Leer todas las carpetas dentro de /commands
    const commandFolders = fs.readdirSync('./commands');

    for (const folder of commandFolders) {
        const commandFiles = fs.readdirSync(`./commands/${folder}`).filter(f => f.endsWith('.js'));

        for (const file of commandFiles) {
            const command = require(`../commands/${folder}/${file}`);
            if (!command.data || !command.execute) continue;

            client.commands.set(command.data.name, command);
            commands.push(command.data.toJSON());
            console.log(`[CMD] Cargado: /${command.data.name}`);
        }
    }

    // Registrar los slash commands en Discord
    const rest = new REST({ version: '10' }).setToken(config.token);

    rest.put(
        Routes.applicationGuildCommands(config.clientId, config.guildId),
        { body: commands }
    ).then(() => {
        console.log(`[CMD] ${commands.length} comandos registrados en Discord.`);
    }).catch(console.error);
};
