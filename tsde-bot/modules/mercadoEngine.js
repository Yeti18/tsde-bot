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

function esMercader(interaction) {
    return interaction.member.roles.cache.some(r =>
        r.name === 'Mercader' || r.id === config.roles.mercader
    );
}

function esAdmin(interaction) {
    return interaction.member.permissions.has('ManageMessages');
}

// Colores por tipo de anuncio
const COLORES = {
    dino:     0x2ECC71,
    item:     0x3498DB,
    recurso:  0xF39C12,
    servicio: 0x9B59B6
};

const EMOJIS_TIPO = {
    dino:     '🦖',
    item:     '⚔️',
    recurso:  '🪵',
    servicio: '🔧'
};

// --- EMBED DE ANUNCIO ---

function construirEmbedAnuncio(anuncio) {
    const emoji = EMOJIS_TIPO[anuncio.tipo] || '📦';
    const color = COLORES[anuncio.tipo] || 0x95A5A6;

    const embed = new EmbedBuilder()
        .setTitle(`${emoji} ${anuncio.nombre}`)
        .setColor(anuncio.vendido ? 0x95A5A6 : color)
        .addFields(
            { name: '📦 Tipo', value: anuncio.tipo.charAt(0).toUpperCase() + anuncio.tipo.slice(1), inline: true },
            { name: '👤 Vendedor', value: anuncio.vendedor, inline: true },
            { name: '💰 Precio', value: anuncio.precio, inline: true }
        );

    // Campos específicos de dinos
    if (anuncio.tipo === 'dino') {
        if (anuncio.nivel)       embed.addFields({ name: '⭐ Nivel', value: anuncio.nivel, inline: true });
        if (anuncio.estadisticas) embed.addFields({ name: '📊 Estadísticas', value: anuncio.estadisticas, inline: true });
        if (anuncio.mutaciones)  embed.addFields({ name: '🧬 Mutaciones', value: anuncio.mutaciones, inline: true });
        if (anuncio.sexo)        embed.addFields({ name: '⚥ Sexo', value: anuncio.sexo, inline: true });
        if (anuncio.color)       embed.addFields({ name: '🎨 Color', value: anuncio.color, inline: true });
    }

    if (anuncio.notas) {
        embed.addFields({ name: '📝 Notas adicionales', value: anuncio.notas, inline: false });
    }

    if (anuncio.vendido) {
        embed.addFields({ name: '🔴 Estado', value: 'VENDIDO', inline: true });
        embed.setFooter({ text: 'Este artículo ya no está disponible' });
    } else {
        embed.setFooter({ text: `ID: ${anuncio.id} · Publicado por ${anuncio.vendedor} · Contacta por privado o con el botón` });
        embed.setTimestamp(new Date(anuncio.fecha));
    }

    return embed;
}

// --- BOTONES ---

function construirBotonesAnuncio(anuncio) {
    if (anuncio.vendido) return [];

    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`mer_vendido_${anuncio.id}`)
                .setLabel('✅ Marcar como vendido')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId(`mer_retirar_${anuncio.id}`)
                .setLabel('🗑️ Retirar anuncio')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId(`mer_contactar_${anuncio.id}`)
                .setLabel('📩 Contactar vendedor')
                .setStyle(ButtonStyle.Secondary)
        )
    ];
}

// --- MODAL VENDER DINO ---

async function mostrarModalVenderDino(interaction) {
    const modal = new ModalBuilder()
        .setCustomId('mer_modal_dino')
        .setTitle('Publicar dino en venta');

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('nombre')
                .setLabel('Nombre del dino')
                .setPlaceholder('Ej: Rex, Theri, Giga, Mana...')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('nivel_stats')
                .setLabel('Nivel | Estadísticas principales')
                .setPlaceholder('Ej: Nivel 450 | HP 35k / Daño 1200 / Peso 800')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('mutaciones_sexo_color')
                .setLabel('Mutaciones | Sexo | Color')
                .setPlaceholder('Ej: 20/20 | Macho | Rojo fuego')
                .setStyle(TextInputStyle.Short)
                .setRequired(false)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('precio')
                .setLabel('Precio')
                .setPlaceholder('Ej: 500 TSDE Coins / Intercambio por Theri mutado')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('notas')
                .setLabel('Notas adicionales (opcional)')
                .setPlaceholder('Ej: Viene con silla de montar, solo intercambio...')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
        )
    );

    await interaction.showModal(modal);
}

// --- MODAL VENDER ITEM/RECURSO ---

async function mostrarModalVenderItem(interaction, tipo) {
    const modal = new ModalBuilder()
        .setCustomId(`mer_modal_${tipo}`)
        .setTitle(`Publicar ${tipo} en venta`);

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('nombre')
                .setLabel('Nombre del artículo')
                .setPlaceholder('Ej: Silla de montar Rex, Metal, Cemento...')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('cantidad_calidad')
                .setLabel('Cantidad / Calidad')
                .setPlaceholder('Ej: x500 / Calidad ascendente 120% / Stack completo')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('precio')
                .setLabel('Precio')
                .setPlaceholder('Ej: 200 TSDE Coins / Intercambio')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('notas')
                .setLabel('Notas adicionales (opcional)')
                .setPlaceholder('Información extra...')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false)
        )
    );

    await interaction.showModal(modal);
}

// --- GESTIÓN DE MODALES ---

async function handleModal(interaction, client) {
    const id = interaction.customId;

    // Modal dino
    if (id === 'mer_modal_dino') {
        try {
            const nombre = interaction.fields.getTextInputValue('nombre').trim();
            const nivel_stats = interaction.fields.getTextInputValue('nivel_stats').trim();
            const mut_sexo_color = interaction.fields.getTextInputValue('mutaciones_sexo_color').trim();
            const precio = interaction.fields.getTextInputValue('precio').trim();
            const notas = interaction.fields.getTextInputValue('notas').trim();

            // Parsear nivel y stats del campo combinado
            const partes = nivel_stats.split('|').map(p => p.trim());
            const nivel = partes[0] || nivel_stats;
            const estadisticas = partes.slice(1).join(' | ') || null;

            // Parsear mutaciones, sexo y color
            const partesMSC = mut_sexo_color.split('|').map(p => p.trim());
            const mutaciones = partesMSC[0] || null;
            const sexo = partesMSC[1] || null;
            const color = partesMSC[2] || null;

            await publicarAnuncio(interaction, client, {
                tipo: 'dino',
                nombre,
                nivel,
                estadisticas,
                mutaciones,
                sexo,
                color,
                precio,
                notas: notas || null
            });

        } catch (error) {
            console.error('[MER] Error publicando dino:', error);
            await interaction.reply({ content: `❌ Error: ${error.message}`, ephemeral: true });
        }
    }

    // Modal item o recurso
    if (id === 'mer_modal_item' || id === 'mer_modal_recurso' || id === 'mer_modal_servicio') {
        try {
            const tipo = id.replace('mer_modal_', '');
            const nombre = interaction.fields.getTextInputValue('nombre').trim();
            const cantidad_calidad = interaction.fields.getTextInputValue('cantidad_calidad').trim();
            const precio = interaction.fields.getTextInputValue('precio').trim();
            const notas = interaction.fields.getTextInputValue('notas').trim();

            await publicarAnuncio(interaction, client, {
                tipo,
                nombre,
                estadisticas: cantidad_calidad,
                precio,
                notas: notas || null
            });

        } catch (error) {
            console.error('[MER] Error publicando item:', error);
            await interaction.reply({ content: `❌ Error: ${error.message}`, ephemeral: true });
        }
    }
}

// --- PUBLICAR ANUNCIO ---

async function publicarAnuncio(interaction, client, datos) {
    const anuncioId = Date.now().toString();
    const anuncio = {
        id: anuncioId,
        vendedor: interaction.user.username,
        vendedorId: interaction.user.id,
        vendido: false,
        fecha: new Date().toISOString(),
        mensaje_id: null,
        canal_id: config.canales.mercado,
        ...datos
    };

    const db = cargarDB();
    if (!db.mercado) db.mercado = {};
    db.mercado[anuncioId] = anuncio;
    guardarDB(db);

    const canal = await client.channels.fetch(config.canales.mercado).catch(() => null);
    if (!canal) return interaction.reply({ content: '❌ Canal de mercado no configurado.', ephemeral: true });

    const embed = construirEmbedAnuncio(anuncio);
    const botones = construirBotonesAnuncio(anuncio);
    const msg = await canal.send({ embeds: [embed], components: botones });

    db.mercado[anuncioId].mensaje_id = msg.id;
    guardarDB(db);

    await interaction.reply({
        content: `✅ Anuncio publicado en <#${config.canales.mercado}>`,
        ephemeral: true
    });
}

// --- GESTIÓN DE BOTONES ---

async function handleButton(interaction, client) {
    const id = interaction.customId;

    // Marcar como vendido
    if (id.startsWith('mer_vendido_')) {
        const anuncioId = id.replace('mer_vendido_', '');
        const db = cargarDB();
        const anuncio = db.mercado?.[anuncioId];
        if (!anuncio) return interaction.reply({ content: '❌ Anuncio no encontrado.', ephemeral: true });

        // Solo el vendedor o admin
        if (anuncio.vendedorId !== interaction.user.id && !esAdmin(interaction)) {
            return interaction.reply({ content: '⛔ Solo el vendedor puede marcar esto como vendido.', ephemeral: true });
        }

        anuncio.vendido = true;
        guardarDB(db);

        const embed = construirEmbedAnuncio(anuncio);
        await interaction.update({ embeds: [embed], components: [] });
        return;
    }

    // Retirar anuncio
    if (id.startsWith('mer_retirar_')) {
        const anuncioId = id.replace('mer_retirar_', '');
        const db = cargarDB();
        const anuncio = db.mercado?.[anuncioId];
        if (!anuncio) return interaction.reply({ content: '❌ Anuncio no encontrado.', ephemeral: true });

        if (anuncio.vendedorId !== interaction.user.id && !esAdmin(interaction)) {
            return interaction.reply({ content: '⛔ Solo el vendedor puede retirar este anuncio.', ephemeral: true });
        }

        delete db.mercado[anuncioId];
        guardarDB(db);

        await interaction.update({
            embeds: [
                new EmbedBuilder()
                    .setTitle('🗑️ Anuncio retirado')
                    .setDescription('Este anuncio ha sido retirado por el vendedor.')
                    .setColor(0x95A5A6)
            ],
            components: []
        });
        return;
    }

    // Contactar vendedor
    if (id.startsWith('mer_contactar_')) {
        const anuncioId = id.replace('mer_contactar_', '');
        const db = cargarDB();
        const anuncio = db.mercado?.[anuncioId];
        if (!anuncio) return interaction.reply({ content: '❌ Anuncio no encontrado.', ephemeral: true });

        if (anuncio.vendido) {
            return interaction.reply({ content: '🔴 Este artículo ya ha sido vendido.', ephemeral: true });
        }

        return interaction.reply({
            content: `📩 Para comprar **${anuncio.nombre}** contacta con **${anuncio.vendedor}** por mensaje privado en Discord.\n\n⚠️ Los admins no median en intercambios entre jugadores.`,
            ephemeral: true
        });
    }
}

// --- COMANDO DAR/QUITAR ROL MERCADER (admin) ---

async function darRolMercader(interaction, client, usuario) {
    try {
        const guild = interaction.guild;
        const member = await guild.members.fetch(usuario.id);
        const rol = guild.roles.cache.find(r => r.id === config.roles.mercader || r.name === 'Mercader');

        if (!rol) return interaction.reply({ content: '❌ Rol Mercader no encontrado. Verifica el ID en config.json', ephemeral: true });

        await member.roles.add(rol);

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle('🛒 Puesto de mercado asignado')
                    .setDescription(`**${usuario.username}** ahora tiene el rol de Mercader y puede publicar en el mercado con \`/vender\`.`)
                    .setColor(0xE67E22)
            ]
        });

    } catch (error) {
        await interaction.reply({ content: `❌ Error: ${error.message}`, ephemeral: true });
    }
}

async function quitarRolMercader(interaction, client, usuario) {
    try {
        const guild = interaction.guild;
        const member = await guild.members.fetch(usuario.id);
        const rol = guild.roles.cache.find(r => r.id === config.roles.mercader || r.name === 'Mercader');

        if (!rol) return interaction.reply({ content: '❌ Rol Mercader no encontrado.', ephemeral: true });

        await member.roles.remove(rol);

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle('🛒 Puesto de mercado retirado')
                    .setDescription(`**${usuario.username}** ya no tiene el rol de Mercader.`)
                    .setColor(0x95A5A6)
            ]
        });

    } catch (error) {
        await interaction.reply({ content: `❌ Error: ${error.message}`, ephemeral: true });
    }
}

module.exports = {
    mostrarModalVenderDino,
    mostrarModalVenderItem,
    handleModal,
    handleButton,
    darRolMercader,
    quitarRolMercader,
    esMercader
};
