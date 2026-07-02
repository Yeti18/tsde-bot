const {
    EmbedBuilder,
    AttachmentBuilder
} = require('discord.js');
const config = require('../config.json');
const database = require('../db.js');

function cargarTaquillas() {
    return database.getTaquillas();
}

function guardarTaquillas(data) {
    database.setTaquillas('evento_activo', data.evento_activo || null);
    database.setTaquillas('asignaciones', data.asignaciones || []);
}

// --- HELPERS ---

function generarPin() {
    return String(Math.floor(1000 + Math.random() * 9000));
}

function generarPinesUnicos(cantidad) {
    const pines = new Set();
    while (pines.size < cantidad) {
        pines.add(generarPin());
    }
    return [...pines];
}

function obtenerLado(numTaquilla) {
    return numTaquilla <= 17 ? 'A' : 'B';
}

// --- ASIGNAR TAQUILLAS ---

async function asignarTaquillas(interaction, client, evento) {
    const inscritos = evento.inscritos || [];

    if (inscritos.length === 0) {
        return interaction.reply({
            content: '❌ No hay jugadores inscritos.',
            ephemeral: true
        });
    }

    if (inscritos.length > 34) {
        return interaction.reply({
            content: `❌ Hay ${inscritos.length} inscritos pero solo hay 34 taquillas. Reduce el número de participantes.`,
            ephemeral: true
        });
    }

    await interaction.deferReply({ ephemeral: true });

    const pines = generarPinesUnicos(inscritos.length);
    const asignaciones = inscritos.map((jugador, i) => ({
        taquilla: i + 1,
        lado: obtenerLado(i + 1),
        jugador,
        pin: pines[i]
    }));

    // Guardar en base de datos
    const data = {
        evento_activo: {
            nombre: evento.titulo,
            fecha: evento.fecha,
            fechaAsignacion: new Date().toLocaleDateString('es-ES')
        },
        asignaciones
    };
    guardarTaquillas(data);

    // Enviar DM a cada jugador
    let dmEnviados = 0;
    let dmFallidos = [];

    for (const asig of asignaciones) {
        try {
            // Buscar el usuario en el servidor por displayName
            const guild = interaction.guild;
            await guild.members.fetch();
            const member = guild.members.cache.find(m =>
                m.displayName === asig.jugador ||
                m.user.username === asig.jugador
            );

            if (member) {
                await member.send({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('🏛️ COLISEO TSDE ARKEANOS')
                            .setColor(0xE74C3C)
                            .setDescription(
                                `Has sido asignado a una taquilla para el evento:\n**${evento.titulo}**`
                            )
                            .addFields(
                                { name: '🔢 Tu taquilla', value: `Nº ${String(asig.taquilla).padStart(2, '0')} (Lado ${asig.lado})`, inline: true },
                                { name: '🔑 Tu PIN', value: `**${asig.pin}**`, inline: true }
                            )
                            .addFields({
                                name: '⚠️ Importante',
                                value: 'Guarda este PIN. No lo compartas con nadie.\nEs tu acceso exclusivo a tu taquilla durante el evento.',
                                inline: false
                            })
                            .setFooter({ text: `Evento: ${evento.fecha}` })
                    ]
                });
                dmEnviados++;
            } else {
                dmFallidos.push(asig.jugador);
            }
        } catch (e) {
            dmFallidos.push(asig.jugador);
        }
    }

    // Generar archivo .txt para admin
    const txtContent = generarTxt(data);
    const attachment = new AttachmentBuilder(
        Buffer.from(txtContent, 'utf8'),
        { name: `taquillas_${evento.titulo.replace(/\s/g, '_')}_${new Date().toLocaleDateString('es-ES').replace(/\//g, '-')}.txt` }
    );

    // Enviar a #chat-admin
    try {
        const canalAdmin = await client.channels.fetch(config.canales.logs);
        await canalAdmin.send({
            embeds: [construirEmbedAdmin(data, dmEnviados, dmFallidos)],
            files: [attachment]
        });
    } catch (e) {
        console.error('[COLISEO] Error enviando a admin:', e.message);
    }

    // Responder al admin
    let respuesta = `✅ Taquillas asignadas a ${inscritos.length} jugadores.\n📨 DMs enviados: ${dmEnviados}`;
    if (dmFallidos.length > 0) {
        respuesta += `\n⚠️ No se pudo enviar DM a: ${dmFallidos.join(', ')} (tienen los DMs cerrados)`;
    }
    respuesta += `\n📋 Lista completa enviada a los logs con archivo .txt adjunto.`;

    await interaction.editReply({ content: respuesta });
}

// --- GENERAR TXT ---

function generarTxt(data) {
    const { evento_activo, asignaciones } = data;
    const ladoA = asignaciones.filter(a => a.lado === 'A');
    const ladoB = asignaciones.filter(a => a.lado === 'B');

    let txt = `COLISEO TSDE ARKEANOS — Evento: ${evento_activo.nombre}\n`;
    txt += `Fecha: ${evento_activo.fecha}\n`;
    txt += `Asignado el: ${evento_activo.fechaAsignacion}\n`;
    txt += `${'━'.repeat(45)}\n\n`;

    txt += `LADO A (Taquillas 01-17)\n`;
    txt += `${'─'.repeat(45)}\n`;
    for (const a of ladoA) {
        txt += `Taquilla ${String(a.taquilla).padStart(2, '0')} | PIN: ${a.pin} | Jugador: ${a.jugador}\n`;
    }

    if (ladoB.length > 0) {
        txt += `\nLADO B (Taquillas 18-34)\n`;
        txt += `${'─'.repeat(45)}\n`;
        for (const a of ladoB) {
            txt += `Taquilla ${String(a.taquilla).padStart(2, '0')} | PIN: ${a.pin} | Jugador: ${a.jugador}\n`;
        }
    }

    txt += `\n${'━'.repeat(45)}\n`;
    txt += `Total participantes: ${asignaciones.length}\n`;

    return txt;
}

// --- EMBED ADMIN ---

function construirEmbedAdmin(data, dmEnviados, dmFallidos) {
    const { evento_activo, asignaciones } = data;
    const ladoA = asignaciones.filter(a => a.lado === 'A');
    const ladoB = asignaciones.filter(a => a.lado === 'B');

    const embed = new EmbedBuilder()
        .setTitle(`🏛️ Taquillas asignadas — ${evento_activo.nombre}`)
        .setColor(0xE74C3C)
        .addFields(
            { name: '📅 Fecha evento', value: evento_activo.fecha, inline: true },
            { name: '👥 Total participantes', value: `${asignaciones.length}`, inline: true },
            { name: '📨 DMs enviados', value: `${dmEnviados}/${asignaciones.length}`, inline: true }
        );

    // Lista Lado A
    if (ladoA.length > 0) {
        const listaA = ladoA.map(a =>
            `\`T${String(a.taquilla).padStart(2, '0')}\` **${a.pin}** — ${a.jugador}`
        ).join('\n');
        embed.addFields({ name: '🅰️ Lado A', value: listaA, inline: false });
    }

    // Lista Lado B
    if (ladoB.length > 0) {
        const listaB = ladoB.map(a =>
            `\`T${String(a.taquilla).padStart(2, '0')}\` **${a.pin}** — ${a.jugador}`
        ).join('\n');
        embed.addFields({ name: '🅱️ Lado B', value: listaB, inline: false });
    }

    if (dmFallidos.length > 0) {
        embed.addFields({
            name: '⚠️ DMs fallidos (tienen privados cerrados)',
            value: dmFallidos.join(', '),
            inline: false
        });
    }

    embed.setFooter({ text: 'Lista completa adjunta en el archivo .txt' });

    return embed;
}

// --- COMANDOS ---

async function verTaquillas(interaction) {
    const data = cargarTaquillas();

    if (!data.evento_activo || data.asignaciones.length === 0) {
        return interaction.reply({
            content: '❌ No hay taquillas asignadas actualmente.',
            ephemeral: true
        });
    }

    const embed = construirEmbedAdmin(data, data.asignaciones.length, []);
    await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function resetearTaquillas(interaction) {
    if (!interaction.member.permissions.has('Administrator')) {
        return interaction.reply({ content: '⛔ Solo administradores.', ephemeral: true });
    }

    guardarTaquillas({ evento_activo: null, asignaciones: [] });

    await interaction.reply({
        embeds: [
            new EmbedBuilder()
                .setTitle('🔄 Taquillas reseteadas')
                .setDescription('Todos los pines han sido eliminados.\nListo para el próximo evento.')
                .setColor(0x2ECC71)
        ],
        ephemeral: true
    });
}

async function verTaquillaJugador(interaction, usuarioTarget) {
    const data = cargarTaquillas();
    const nombre = usuarioTarget.displayName || usuarioTarget.username;

    const asig = data.asignaciones.find(a =>
        a.jugador === nombre ||
        a.jugador === usuarioTarget.username
    );

    if (!asig) {
        return interaction.reply({
            content: `❌ **${nombre}** no tiene taquilla asignada en el evento actual.`,
            ephemeral: true
        });
    }

    await interaction.reply({
        embeds: [
            new EmbedBuilder()
                .setTitle(`🏛️ Taquilla de ${asig.jugador}`)
                .setColor(0xE74C3C)
                .addFields(
                    { name: '🔢 Taquilla', value: `Nº ${String(asig.taquilla).padStart(2, '0')} (Lado ${asig.lado})`, inline: true },
                    { name: '🔑 PIN', value: asig.pin, inline: true }
                )
        ],
        ephemeral: true
    });
}

module.exports = {
    asignarTaquillas,
    verTaquillas,
    resetearTaquillas,
    verTaquillaJugador
};
