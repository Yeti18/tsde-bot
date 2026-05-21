const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const fs = require('fs');
const config = require('../config.json');

const DB_PATH = './database.json';

function cargarDB() {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function guardarDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function esAdmin(interaction) {
    return interaction.member.permissions.has('ManageMessages');
}

// --- SUGERENCIAS ---

function construirEmbedSugerencia(sugerencia) {
    return new EmbedBuilder()
        .setTitle('💡 Nueva sugerencia')
        .setDescription(sugerencia.texto)
        .setColor(0xF39C12)
        .addFields({ name: '👤 Enviada por', value: sugerencia.autor, inline: true })
        .setFooter({ text: `ID: ${sugerencia.id} · Pendiente de votación semanal` })
        .setTimestamp(new Date(sugerencia.fecha));
}

function construirBotonesVotacion(sugerenciaId, votos) {
    const aFavor = votos.aFavor?.length || 0;
    const enContra = votos.enContra?.length || 0;

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`vot_favor_${sugerenciaId}`)
            .setLabel(`👍 A favor (${aFavor})`)
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`vot_contra_${sugerenciaId}`)
            .setLabel(`👎 En contra (${enContra})`)
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId(`vot_cerrar_${sugerenciaId}`)
            .setLabel('🔒 Cerrar votación')
            .setStyle(ButtonStyle.Secondary)
    );
}

// --- MODAL DE SUGERENCIA ---

async function mostrarModalSugerencia(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('vot_modal_sugerencia')
        .setTitle('Enviar sugerencia para TSDE');

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('texto')
                .setLabel('Tu sugerencia')
                .setPlaceholder('Describe tu idea para mejorar el servidor...')
                .setStyle(TextInputStyle.Paragraph)
                .setMinLength(20)
                .setMaxLength(500)
                .setRequired(true)
        )
    );

    await interaction.showModal(modal);
}

// --- PUBLICAR VOTACIÓN SEMANAL ---

async function publicarVotacionSemanal(client, sugerenciasIds) {
    const db = cargarDB();
    const canal = await client.channels.fetch(config.canales.sugerencias).catch(() => null);
    if (!canal) return;

    const sugerencias = (db.votaciones?.sugerencias_pendientes || [])
        .filter(s => !sugerenciasIds || sugerenciasIds.includes(s.id));

    if (sugerencias.length === 0) {
        console.log('[VOT] No hay sugerencias pendientes para publicar');
        return;
    }

    await canal.send({
        embeds: [
            new EmbedBuilder()
                .setTitle('🗳️ VOTACIONES SEMANALES — TSDE Arkeanos')
                .setDescription(
                    `Esta semana tenemos **${sugerencias.length} sugerencia(s)** de la comunidad.\n` +
                    'La más votada se implementará en el servidor. ¡Vota ahora!'
                )
                .setColor(0x9B59B6)
        ]
    });

    for (const sug of sugerencias) {
        if (!db.votaciones.votos[sug.id]) {
            db.votaciones.votos[sug.id] = { aFavor: [], enContra: [] };
        }

        const embed = construirEmbedSugerencia(sug);
        const botones = construirBotonesVotacion(sug.id, db.votaciones.votos[sug.id]);
        const msg = await canal.send({ embeds: [embed], components: [botones] });

        sug.mensaje_id = msg.id;
        sug.canal_id = canal.id;
        sug.estado = 'en_votacion';
    }

    guardarDB(db);
    console.log(`[VOT] ${sugerencias.length} votaciones publicadas`);
}

// --- PUBLICAR GANADORA ---

async function publicarGanadora(client) {
    const db = cargarDB();
    const canal = await client.channels.fetch(config.canales.sugerencias).catch(() => null);
    if (!canal) return;

    const votos = db.votaciones?.votos || {};
    const sugerencias = (db.votaciones?.sugerencias_pendientes || [])
        .filter(s => s.estado === 'en_votacion');

    if (sugerencias.length === 0) return;

    // Calcular ganadora
    let ganadora = null;
    let maxVotos = -1;

    for (const sug of sugerencias) {
        const v = votos[sug.id] || { aFavor: [], enContra: [] };
        const neto = v.aFavor.length - v.enContra.length;
        if (neto > maxVotos) {
            maxVotos = neto;
            ganadora = { ...sug, votosNeto: neto, aFavor: v.aFavor.length, enContra: v.enContra.length };
        }
        // Cerrar mensaje de votación
        try {
            const msg = await canal.messages.fetch(sug.mensaje_id);
            await msg.edit({ components: [] });
        } catch (e) {}
    }

    if (ganadora && ganadora.aFavor > 0) {
        await canal.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle('🏆 SUGERENCIA GANADORA DE LA SEMANA')
                    .setDescription(ganadora.texto)
                    .setColor(0xF1C40F)
                    .addFields(
                        { name: '👤 Propuesta por', value: ganadora.autor, inline: true },
                        { name: '👍 A favor', value: `${ganadora.aFavor}`, inline: true },
                        { name: '👎 En contra', value: `${ganadora.enContra}`, inline: true }
                    )
                    .setFooter({ text: 'Esta sugerencia será revisada por la administración para implementarla.' })
            ]
        });
    }

    // Limpiar sugerencias votadas y resetear
    db.votaciones.sugerencias_pendientes = [];
    db.votaciones.votos = {};
    guardarDB(db);

    console.log('[VOT] Votaciones semanales cerradas. Ganadora publicada.');
}

// --- AUTOMATIZACIÓN SEMANAL ---

async function iniciarVotaciones(client) {
    const db = cargarDB();
    if (!db.votaciones) {
        db.votaciones = { sugerencias_pendientes: [], votos: {} };
        guardarDB(db);
    }

    // Comprobar cada hora si es domingo a las 20:00 para publicar votaciones
    // y el lunes a las 20:00 para cerrarlas
    setInterval(async () => {
        const ahora = new Date();
        const diaSemana = ahora.getDay(); // 0=dom, 1=lun
        const hora = ahora.getHours();
        const minutos = ahora.getMinutes();

        // Domingo 20:00 → publicar votaciones
        if (diaSemana === 0 && hora === 20 && minutos < 5) {
            await publicarVotacionSemanal(client);
        }

        // Lunes 20:00 → publicar ganadora y limpiar
        if (diaSemana === 1 && hora === 20 && minutos < 5) {
            await publicarGanadora(client);
        }

    }, 5 * 60 * 1000); // comprobar cada 5 minutos

    console.log('[VOT] Sistema de votaciones semanales iniciado');
}

// --- GESTIÓN DE MODALES ---

async function handleModal(interaction, client) {
    if (interaction.customId === 'vot_modal_sugerencia') {
        try {
            const texto = interaction.fields.getTextInputValue('texto');
            const db = cargarDB();

            if (!db.votaciones) db.votaciones = { sugerencias_pendientes: [], votos: {} };

            const id = Date.now().toString();
            const sugerencia = {
                id,
                texto,
                autor: interaction.user.username,
                fecha: new Date().toISOString(),
                estado: 'pendiente',
                mensaje_id: null,
                canal_id: null
            };

            db.votaciones.sugerencias_pendientes.push(sugerencia);
            guardarDB(db);

            // Confirmar al usuario
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle('✅ Sugerencia recibida')
                        .setDescription(
                            `Tu sugerencia ha sido registrada correctamente.\n\n` +
                            `**"${texto}"**\n\n` +
                            `Se incluirá en la votación semanal del próximo domingo. ¡Gracias!`
                        )
                        .setColor(0x2ECC71)
                ],
                ephemeral: true
            });

            // Notificar a admins en logs
            try {
                const canalLogs = await client.channels.fetch(config.canales.logs);
                await canalLogs.send({
                    embeds: [
                        new EmbedBuilder()
                            .setTitle('💡 Nueva sugerencia recibida')
                            .setDescription(texto)
                            .addFields({ name: '👤 Autor', value: interaction.user.username })
                            .setColor(0xF39C12)
                    ]
                });
            } catch (e) {}

        } catch (error) {
            console.error('[VOT] Error guardando sugerencia:', error);
            await interaction.reply({ content: `❌ Error: ${error.message}`, ephemeral: true });
        }
    }
}

// --- GESTIÓN DE BOTONES ---

async function handleButton(interaction, client) {
    const id = interaction.customId;

    // Votar a favor
    if (id.startsWith('vot_favor_')) {
        const sugId = id.replace('vot_favor_', '');
        const db = cargarDB();
        if (!db.votaciones?.votos[sugId]) return;

        const votos = db.votaciones.votos[sugId];
        const usuario = interaction.user.id;

        if (votos.aFavor.includes(usuario)) {
            votos.aFavor = votos.aFavor.filter(u => u !== usuario);
        } else {
            votos.aFavor = votos.aFavor.filter(u => u !== usuario);
            votos.enContra = votos.enContra.filter(u => u !== usuario);
            votos.aFavor.push(usuario);
        }

        guardarDB(db);
        const botones = construirBotonesVotacion(sugId, votos);
        await interaction.update({ components: [botones] });
        return;
    }

    // Votar en contra
    if (id.startsWith('vot_contra_')) {
        const sugId = id.replace('vot_contra_', '');
        const db = cargarDB();
        if (!db.votaciones?.votos[sugId]) return;

        const votos = db.votaciones.votos[sugId];
        const usuario = interaction.user.id;

        if (votos.enContra.includes(usuario)) {
            votos.enContra = votos.enContra.filter(u => u !== usuario);
        } else {
            votos.aFavor = votos.aFavor.filter(u => u !== usuario);
            votos.enContra = votos.enContra.filter(u => u !== usuario);
            votos.enContra.push(usuario);
        }

        guardarDB(db);
        const botones = construirBotonesVotacion(sugId, votos);
        await interaction.update({ components: [botones] });
        return;
    }

    // Cerrar votación (admin)
    if (id.startsWith('vot_cerrar_')) {
        if (!esAdmin(interaction)) return interaction.reply({ content: '⛔ Solo admins.', ephemeral: true });
        await interaction.update({ components: [] });
        return interaction.followUp({ content: '🔒 Votación cerrada manualmente.', ephemeral: true });
    }
}

// --- COMANDO PÚBLICO ---

async function mostrarSugerencias(interaction) {
    const db = cargarDB();
    const pendientes = (db.votaciones?.sugerencias_pendientes || [])
        .filter(s => s.estado === 'pendiente');

    if (pendientes.length === 0) {
        return interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle('💡 Sugerencias pendientes')
                    .setDescription('No hay sugerencias pendientes esta semana.\n¡Sé el primero en proponer algo!')
                    .setColor(0xF39C12)
            ],
            ephemeral: true
        });
    }

    const embed = new EmbedBuilder()
        .setTitle(`💡 ${pendientes.length} sugerencia(s) para esta semana`)
        .setDescription('Se votarán el próximo domingo a las 20:00h.')
        .setColor(0xF39C12);

    pendientes.slice(0, 10).forEach((s, i) => {
        embed.addFields({ name: `${i + 1}. ${s.autor}`, value: s.texto, inline: false });
    });

    await interaction.reply({ embeds: [embed], ephemeral: true });
}

module.exports = {
    mostrarModalSugerencia,
    publicarVotacionSemanal,
    publicarGanadora,
    iniciarVotaciones,
    handleModal,
    handleButton,
    mostrarSugerencias
};
