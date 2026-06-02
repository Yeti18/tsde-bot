const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags
} = require('discord.js');
const fs = require('fs');
const config = require('../config.json');

const DB_PATH = './database.json';

// --- BASE DE DATOS ---

function cargarDB() {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function guardarDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function cargarHoF() {
    const db = cargarDB();
    if (!db.hall_of_fame) db.hall_of_fame = [];
    return db.hall_of_fame;
}

function guardarHoF(hof) {
    const db = cargarDB();
    db.hall_of_fame = hof;
    guardarDB(db);
}

// --- CATEGORÍAS ---

const CATEGORIAS = {
    torneo: { emoji: '⚔️', label: 'Campeón de Torneo' },
    laberinto: { emoji: '🌀', label: 'Récord del Laberinto' },
    coliseo: { emoji: '🏛️', label: 'Leyenda del Coliseo' },
    tribu: { emoji: '🛡️', label: 'Mejor Tribu' },
    especial: { emoji: '👑', label: 'Reconocimiento Especial' }
};

// --- EMBEDS ---

function construirEmbedEntrada(entrada) {
    const cat = CATEGORIAS[entrada.categoria] || { emoji: '🏆', label: entrada.categoria };

    return new EmbedBuilder()
        .setTitle(`${cat.emoji} ${cat.label}`)
        .setDescription(`**${entrada.nombre}**`)
        .setColor(0xF1C40F)
        .addFields(
            { name: '📅 Fecha', value: entrada.fecha, inline: true },
            { name: '🏆 Logro', value: entrada.logro, inline: true }
        )
        .setFooter({ text: `Añadido por ${entrada.añadidoPor}` });
}

function construirEmbedHoFCompleto(hof) {
    if (hof.length === 0) {
        return new EmbedBuilder()
            .setTitle('🎖️ Hall of Fame — TSDE Arkeanos')
            .setDescription('Aún no hay ninguna entrada. ¡Sé el primero en entrar a la historia!')
            .setColor(0xF1C40F);
    }

    const embed = new EmbedBuilder()
        .setTitle('🎖️ Hall of Fame — TSDE Arkeanos')
        .setDescription('Los mejores jugadores y tribus de la historia de TSDE.')
        .setColor(0xF1C40F);

    // Agrupar por categoría
    for (const [key, cat] of Object.entries(CATEGORIAS)) {
        const entradas = hof.filter(e => e.categoria === key);
        if (entradas.length > 0) {
            embed.addFields({
                name: `${cat.emoji} ${cat.label}`,
                value: entradas.map(e =>
                    `**${e.nombre}** — ${e.logro} *(${e.fecha})* \`ID: ${e.id}\``
                ).join('\n'),
                inline: false
            });
        }
    }

    return embed;
}

// --- PUBLICAR EN CANAL HOF ---

async function publicarEnCanal(client, entrada) {
    if (!config.canales.halloffame) return;

    try {
        const canal = await client.channels.fetch(config.canales.halloffame);
        await canal.send({ embeds: [construirEmbedEntrada(entrada)] });
    } catch (e) {
        console.error('[HOF] Error publicando en canal:', e.message);
    }
}

// --- AÑADIR AUTOMÁTICAMENTE DESDE TORNEOS/LABERINTO ---

async function añadirGanadorTorneo(client, jugador, titulo, fecha) {
    const hof = cargarHoF();
    const entrada = {
        id: Date.now().toString(),
        nombre: jugador,
        categoria: 'torneo',
        logro: `Campeón de ${titulo}`,
        fecha,
        añadidoPor: 'Sistema automático',
        automatico: true
    };
    hof.push(entrada);
    guardarHoF(hof);
    await publicarEnCanal(client, entrada);
}

async function añadirRecordLaberinto(client, jugador, tiempo, fecha) {
    const hof = cargarHoF();

    // Eliminar récord anterior si existe
    const hofFiltrado = hof.filter(e =>
        !(e.categoria === 'laberinto' && e.automatico)
    );

    const entrada = {
        id: Date.now().toString(),
        nombre: jugador,
        categoria: 'laberinto',
        logro: `Récord: ${tiempo}`,
        fecha,
        añadidoPor: 'Sistema automático',
        automatico: true
    };
    hofFiltrado.push(entrada);
    guardarHoF(hofFiltrado);
    await publicarEnCanal(client, entrada);
}

// --- MODAL AÑADIR MANUAL ---

async function mostrarModalAñadir(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('hof_modal_añadir')
        .setTitle('Añadir al Hall of Fame');

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('nombre')
                .setLabel('Nombre del jugador o tribu')
                .setPlaceholder('Ej: Yeti124 o Los Depredadores')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('categoria')
                .setLabel('Categoría (torneo/coliseo/tribu/especial)')
                .setPlaceholder('especial')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('logro')
                .setLabel('Descripción del logro')
                .setPlaceholder('Ej: Primer campeón del Coliseo TSDE')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('fecha')
                .setLabel('Fecha')
                .setPlaceholder('Ej: Mayo 2026')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
        )
    );

    await interaction.showModal(modal);
}

// --- GESTIÓN DE MODALES ---

async function handleModal(interaction, client) {
    if (interaction.customId === 'hof_modal_añadir') {
        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            const nombre = interaction.fields.getTextInputValue('nombre').trim();
            const categoriaRaw = interaction.fields.getTextInputValue('categoria').trim().toLowerCase();
            const logro = interaction.fields.getTextInputValue('logro').trim();
            const fecha = interaction.fields.getTextInputValue('fecha').trim();

            const categoria = CATEGORIAS[categoriaRaw] ? categoriaRaw : 'especial';

            const entrada = {
                id: Date.now().toString(),
                nombre,
                categoria,
                logro,
                fecha,
                añadidoPor: interaction.user.username,
                automatico: false
            };

            const hof = cargarHoF();
            hof.push(entrada);
            guardarHoF(hof);

            await publicarEnCanal(client, entrada);

            await interaction.editReply({
                content: `✅ **${nombre}** añadido al Hall of Fame con éxito.`
            });

        } catch (error) {
            console.error('[HOF] Error añadiendo entrada:', error);
            if (interaction.deferred) {
                await interaction.editReply({ content: `❌ Error: ${error.message}` });
            } else {
                await interaction.reply({ content: `❌ Error: ${error.message}`, flags: MessageFlags.Ephemeral });
            }
        }
    }
}

// --- COMANDOS ---

async function verHallOfFame(interaction) {
    const hof = cargarHoF();
    const embed = construirEmbedHoFCompleto(hof);
    await interaction.reply({ embeds: [embed] });
}

async function eliminarEntrada(interaction, client, entradaId) {
    if (!interaction.member.permissions.has('Administrator')) {
        return interaction.reply({ content: '⛔ Solo administradores.', flags: MessageFlags.Ephemeral });
    }

    const hof = cargarHoF();
    const index = hof.findIndex(e => e.id === entradaId);

    if (index === -1) {
        return interaction.reply({ content: '❌ Entrada no encontrada.', flags: MessageFlags.Ephemeral });
    }

    const eliminada = hof.splice(index, 1)[0];
    guardarHoF(hof);

    await interaction.reply({
        content: `🗑️ Entrada de **${eliminada.nombre}** eliminada del Hall of Fame.`,
        flags: MessageFlags.Ephemeral
    });
}

async function actualizarMensajeHoF(client) {
    if (!config.canales.halloffame) return;

    try {
        const canal = await client.channels.fetch(config.canales.halloffame);
        const hof = cargarHoF();

        // Buscar el mensaje de resumen existente (el primero del bot)
        const mensajes = await canal.messages.fetch({ limit: 50 });
        const resumen = mensajes.find(m =>
            m.author.id === client.user.id &&
            m.embeds[0]?.title?.includes('Hall of Fame')
        );

        const embed = construirEmbedHoFCompleto(hof);

        if (resumen) {
            await resumen.edit({ embeds: [embed] });
        } else {
            await canal.send({ embeds: [embed] });
        }
    } catch (e) {
        console.error('[HOF] Error actualizando canal:', e.message);
    }
}

module.exports = {
    mostrarModalAñadir,
    handleModal,
    verHallOfFame,
    eliminarEntrada,
    añadirGanadorTorneo,
    añadirRecordLaberinto,
    actualizarMensajeHoF
};
