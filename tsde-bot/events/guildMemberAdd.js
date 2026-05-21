const { enviarNormasDM } = require('../modules/reglasEngine.js');

module.exports = {
    name: 'guildMemberAdd',
    async execute(member, client) {
        console.log(`[EVT] Nuevo miembro: ${member.user.username}`);
        await enviarNormasDM(member);
    }
};
