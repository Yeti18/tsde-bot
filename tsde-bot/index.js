const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const config = require('./config.json');

// Cliente de Discord con los permisos necesarios
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildPresences
    ]
});

// Colecciones dinámicas para comandos y botones
client.commands = new Collection();
client.buttons = new Collection();

// Cargar handlers automáticamente
const handlerFiles = fs.readdirSync('./handlers').filter(f => f.endsWith('.js'));
for (const file of handlerFiles) {
    require(`./handlers/${file}`)(client);
}

// Arrancar el bot — lee de Secrets de Replit primero, luego config.json
client.login(process.env.DISCORD_TOKEN || config.token);
