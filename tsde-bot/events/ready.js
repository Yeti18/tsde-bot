module.exports = {
    name: 'ready',
    once: true,
    execute(client) {
        console.log(`✅ TSDE Bot conectado como ${client.user.tag}`);
        client.user.setActivity('TSDE Arkeanos 🦖', { type: 0 });
    }
};
