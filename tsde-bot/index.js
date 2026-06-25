const { Client, GatewayIntentBits, Collection } = require('discord.js');
const fs = require('fs');
const http = require('http');
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

// --- SERVIDOR HTTP PARA LA WEB DE DONACIONES ---
// Expone el número de jugadores online sin tokens ni datos sensibles

const HTTP_PORT = 80;

http.createServer((req, res) => {
    // CORS para que la web pueda consultarlo desde cualquier dominio
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');

    if (req.url === '/players') {
        try {
            const db = JSON.parse(fs.readFileSync('./database.json', 'utf8'));
            const jugadores = db.jugadores_online || [];
            res.writeHead(200);
            res.end(JSON.stringify({
                online: jugadores.length,
                max: config.servidor?.maxJugadores || 70,
                servidor: config.servidor?.nombre || 'TSDE Arkeanos',
                mapa: config.servidor?.mapa || 'Ragnarok'
            }));
        } catch (e) {
            res.writeHead(500);
            res.end(JSON.stringify({ online: 0, max: 70 }));
        }
    } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
    }
}).listen(HTTP_PORT, () => {
    console.log(`[API] Servidor HTTP activo en puerto ${HTTP_PORT}`);
});

// Arrancar el bot — lee de Secrets de Replit primero, luego config.json
client.login(process.env.DISCORD_TOKEN || config.token);
