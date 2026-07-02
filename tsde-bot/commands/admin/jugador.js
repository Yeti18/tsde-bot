const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, MessageFlags } = require('discord.js');
const database = require('../../db.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('jugador')
        .setDescription('Información completa de un jugador [ADMIN]')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
        .addSubcommand(sub =>
            sub.setName('info')
                .setDescription('Ver toda la información de un jugador')
                .addUserOption(opt =>
                    opt.setName('usuario')
                        .setDescription('Usuario de Discord')
                        .setRequired(false)
                )
                .addStringOption(opt =>
                    opt.setName('nombre_ark')
                        .setDescription('Buscar por nombre en ARK')
                        .setRequired(false)
                )
        ),

    async execute(interaction, client) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });

        const usuario = interaction.options.getUser('usuario');
        const nombreArkBuscar = interaction.options.getString('nombre_ark');

        let jugador = null;
        let discordUser = null;

        if (usuario) {
            const row = database.getJugador(usuario.id);
            if (row) {
                jugador = { discordId: row.discord_id, discordUsername: row.discord_username, nombreArk: row.nombre_ark, fechaRegistro: row.fecha_registro };
                discordUser = usuario;
            }
        } else if (nombreArkBuscar) {
            const row = database.getJugadorPorArk(nombreArkBuscar);
            if (row) {
                jugador = { discordId: row.discord_id, discordUsername: row.discord_username, nombreArk: row.nombre_ark, fechaRegistro: row.fecha_registro };
                try { discordUser = await client.users.fetch(row.discord_id); } catch (e) {}
            }
        }

        if (!jugador) {
            return interaction.editReply({ content: '❌ Jugador no encontrado. Prueba con su usuario de Discord o nombre en ARK.' });
        }

        // --- BANDERA BLANCA ---
        const banderas = database.getBanderasPorUsuario(jugador.discordId);
        const banderaEntrada = banderas.find(b => b.estado !== 'pendiente');
        let banderaTexto = '✅ Sin solicitudes';
        if (banderaEntrada) {
            if (banderaEntrada.estado === 'activo') {
                const expira = Math.floor(new Date(banderaEntrada.fecha_expiracion).getTime() / 1000);
                banderaTexto = `🟢 ACTIVA — expira <t:${expira}:R>`;
            } else if (banderaEntrada.estado === 'expirado') {
                banderaTexto = `⚪ Usada (ya expiró)`;
            } else if (banderaEntrada.estado === 'denegado') {
                banderaTexto = `🔴 Denegada (${banderaEntrada.motivo_denegacion || 'sin motivo'})`;
            }
        }

        // --- ADVERTENCIAS ---
        const advertencias = database.getAdvertencias(jugador.discordId);

        // --- PENALIZACIONES ---
        const penalizados = database.getPenalizados();
        const penalizacion = penalizados.includes(jugador.nombreArk);

        // --- TICKETS ---
        const tickets = database.countTicketsCerrados();

        // --- REPORTES ---
        const reportesHechos = 0;
        const reportesRecibidos = 0;

        // --- MERCADER ---
        const esMercader = !!database.getMercader(jugador.discordId);

        // --- REGISTRO ---
        const fechaRegistro = new Date(jugador.fechaRegistro);
        const diasRegistrado = Math.floor((Date.now() - fechaRegistro.getTime()) / (1000 * 60 * 60 * 24));

        const embed = new EmbedBuilder()
            .setTitle(`👤 ${jugador.nombreArk}`)
            .setColor(penalizacion ? 0xE74C3C : banderaEntrada?.estado === 'activo' ? 0x3498DB : 0x2ECC71)
            .setThumbnail(discordUser?.displayAvatarURL() || null)
            .addFields(
                {
                    name: '📋 Identidad',
                    value: [
                        `**Discord:** ${jugador.discordUsername}`,
                        `**ID Discord:** \`${jugador.discordId}\``,
                        `**Nombre ARK:** ${jugador.nombreArk}`,
                        `**Registrado hace:** ${diasRegistrado} días`
                    ].join('\n'),
                    inline: true
                },
                {
                    name: '🎮 Estado en el servidor',
                    value: [
                        `**Mercader:** ${esMercader ? '✅ Sí' : '❌ No'}`,
                        `**Bandera Blanca:** ${banderaTexto}`,
                        `**Penalizado:** ${penalizacion ? `🔴 Sí (${penalizacion.razon || 'sin motivo'})` : '✅ No'}`
                    ].join('\n'),
                    inline: true
                },
                {
                    name: '⚠️ Historial',
                    value: [
                        `**Advertencias recibidas:** ${advertencias.length}`,
                        `**Tickets resueltos:** ${tickets}`,
                        `**Reportes hechos:** ${reportesHechos}`,
                        `**Reportes recibidos:** ${reportesRecibidos}`
                    ].join('\n'),
                    inline: false
                }
            )
            .setFooter({ text: `Registrado el ${fechaRegistro.toLocaleDateString('es-ES')}` });

        // Mostrar advertencias si las hay
        if (advertencias.length > 0) {
            embed.addFields({
                name: `⚠️ Detalle de advertencias (${advertencias.length})`,
                value: advertencias.slice(0, 3).map((a, i) =>
                    `**${i + 1}.** ${a.motivo} — *${new Date(a.fecha).toLocaleDateString('es-ES')}*`
                ).join('\n') + (advertencias.length > 3 ? `\n...y ${advertencias.length - 3} más` : ''),
                inline: false
            });
        }

        await interaction.editReply({ embeds: [embed] });
    }
};
