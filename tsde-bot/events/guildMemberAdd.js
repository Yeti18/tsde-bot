const config = require('../config.json');

module.exports = {
    name: 'guildMemberAdd',
    async execute(member, client) {
        console.log(`[EVT] Nuevo miembro: ${member.user.username}`);

        // Asignar rol Superviviente directamente — no depender de Carl-bot
        try {
            const rolSuperv = member.guild.roles.cache.find(r =>
                r.id === config.roles.superviviente || r.name === 'Superviviente'
            );
            if (rolSuperv && !member.roles.cache.has(rolSuperv.id)) {
                await member.roles.add(rolSuperv, 'Rol inicial al unirse al servidor');
                console.log(`[EVT] Rol Superviviente asignado a ${member.user.username}`);
            }
        } catch (e) {
            console.error('[EVT] Error asignando rol Superviviente:', e.message);
        }

        // El botón de registro ya está fijo en #bienvenida — no hace falta enviar nada por jugador
    }
};
