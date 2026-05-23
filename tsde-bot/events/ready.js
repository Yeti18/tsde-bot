const { iniciarStats } = require('../modules/statsEngine.js');
const { iniciarVotaciones } = require('../modules/votacionesEngine.js');
const { iniciarMonitorServidor } = require('../modules/servidorEngine.js');

module.exports = {
    name: 'ready',
    once: true,
    async execute(client) {
        console.log(`✅ TSDE Bot conectado como ${client.user.tag}`);
        client.user.setActivity('TSDE Arkeanos 🦖', { type: 0 });

        // Arrancar sistemas automáticos
        await iniciarStats(client);
        await iniciarVotaciones(client);
        await iniciarMonitorServidor(client);
    }
};
