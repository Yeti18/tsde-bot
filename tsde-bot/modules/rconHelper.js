const { Rcon } = require('rcon-client');
const config = require('../config.json');

/**
 * Envía un broadcast al chat del servidor ARK via RCON.
 * Si el RCON no está configurado, no hace nada y no da error.
 * @param {string} mensaje - Texto a mostrar en el juego
 */
async function broadcast(mensaje) {
    if (!config.rcon.ip || !config.rcon.password) return;

    try {
        const rcon = new Rcon({
            host: config.rcon.ip,
            port: config.rcon.port,
            password: config.rcon.password,
            timeout: 5000
        });

        await rcon.connect();
        await rcon.send(`broadcast ${mensaje}`);
        await rcon.end();

        console.log(`[RCON] Broadcast enviado: ${mensaje}`);
    } catch (error) {
        console.error('[RCON] Error al enviar broadcast:', error.message);
    }
}

/**
 * Ejecuta cualquier comando RCON en el servidor ARK.
 * @param {string} comando - Comando RCON completo
 */
async function ejecutar(comando) {
    if (!config.rcon.ip || !config.rcon.password) return null;

    try {
        const rcon = new Rcon({
            host: config.rcon.ip,
            port: config.rcon.port,
            password: config.rcon.password,
            timeout: 5000
        });

        await rcon.connect();
        const respuesta = await rcon.send(comando);
        await rcon.end();

        return respuesta;
    } catch (error) {
        console.error('[RCON] Error:', error.message);
        return null;
    }
}

module.exports = { broadcast, ejecutar };
