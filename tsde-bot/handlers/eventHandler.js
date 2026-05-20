const fs = require('fs');

module.exports = (client) => {
    const eventFiles = fs.readdirSync('./events').filter(f => f.endsWith('.js'));

    for (const file of eventFiles) {
        const event = require(`../events/${file}`);
        const handler = (...args) => event.execute(...args, client);

        if (event.once) {
            client.once(event.name, handler);
        } else {
            client.on(event.name, handler);
        }

        console.log(`[EVT] Cargado: ${event.name}`);
    }
};
