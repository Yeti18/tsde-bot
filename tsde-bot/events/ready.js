const { iniciarStats } = require('../modules/statsEngine.js');
const { iniciarVotaciones } = require('../modules/votacionesEngine.js');
const { iniciarMonitorServidor } = require('../modules/servidorEngine.js');
const { asegurarMensajeBienvenida } = require('../modules/reglasEngine.js');
const { iniciarComprobacionExpiraciones } = require('../modules/banderaBlancaEngine.js');
const { asegurarMensajeTickets } = require('../modules/ticketEngine.js');
const { iniciarBackupAutomatico } = require('../modules/backupEngine.js');

module.exports = {
    name: 'clientReady',
    once: true,
    async execute(client) {
        console.log(`✅ TSDE Bot conectado como ${client.user.tag}`);
        client.user.setActivity('TSDE Arkeanos 🦖', { type: 0 });

        // Arrancar sistemas automáticos
        iniciarBackupAutomatico(client);
        await iniciarStats(client);
        await iniciarVotaciones(client);
        await iniciarMonitorServidor(client);
        await asegurarMensajeBienvenida(client);
        await asegurarMensajeTickets(client);
        iniciarComprobacionExpiraciones(client);
    }
};
