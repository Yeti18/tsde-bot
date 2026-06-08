const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags,
    ChannelType
} = require('discord.js');
const fs = require('fs');
const config = require('../config.json');

const DB_PATH = './database.json';

// Tags del foro (se cachean al primer uso)
let forumTags = null;

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

const NOMBRES_TAG = {
    dino:     '🦖 Dino',
    item:     '⚔️ Item',
    recurso:  '🪵 Recurso',
    servicio: '🔧 Servicio',
    vendido:  '🔴 Vendido'
};

// --- OBTENER/CREAR TAGS DEL FORO ---

async function obtenerTags(canal) {
    if (forumTags) return forumTags;
    // Siempre recargar desde Discord para tener los tags actualizados
    const canalFresh = await canal.fetch();
    forumTags = canalFresh.availableTags || [];
    return forumTags;
}

function buscarTag(tags, nombre) {
    return tags.find(t => t.name === nombre)?.id || null;
}

// --- EMBED DE ANUNCIO ---

function construirEmbedAnuncio(anuncio) {
    const emoji = EMOJIS_TIPO[anuncio.tipo] || '📦';
    const color = COLORES[anuncio.tipo] || 0x95A5A6;

    const embed = new EmbedBuilder()
        .setTitle(`${emoji} ${anuncio.nombre}`)
        .setColor(anuncio.vendido ? 0x95A5A6 : color)
        .addFields(
            { name: '📦 Tipo',     value: anuncio.tipo.charAt(0).toUpperCase() + anuncio.tipo.slice(1), inline: true },
            { name: '👤 Vendedor', value: anuncio.vendedor, inline: true },
            { name: '🏪 Puesto',   value: anuncio.puesto || 'Sin asignar', inline: true },
            { name: '💰 Precio',   value: anuncio.precio, inline: true }
        );

    if (anuncio.tipo === 'dino') {
        if (anuncio.nivel)        embed.addFields({ name: '⭐ Nivel',         value: anuncio.nivel,        inline: true });
        if (anuncio.estadisticas) embed.addFields({ name: '📊 Estadísticas',  value: anuncio.estadisticas, inline: true });
        if (anuncio.mutaciones)   embed.addFields({ name: '🧬 Mutaciones',    value: anuncio.mutaciones,   inline: true });
        if (anuncio.sexo)         embed.addFields({ name: '⚥ Sexo',           value: anuncio.sexo,         inline: true });
        if (anuncio.color)        embed.addFields({ name: '🎨 Color',         value: anuncio.color,        inline: true });
    }

    if (anuncio.tipo !== 'dino' && anuncio.estadisticas) {
        embed.addFields({ name: '📊 Cantidad / Calidad', value: anuncio.estadisticas, inline: true });
    }

    if (anuncio.notas) {
        embed.addFields({ name: '📝 Notas', value: anuncio.notas, inline: false });
    }

    if (anuncio.vendido) {
        embed.addFields({ name: '🔴 Estado', value: 'VENDIDO', inline: true });
        embed.setFooter({ text: 'Este artículo ya no está disponible' });
    } else {
        embed.setFooter({ text: `Publicado por ${anuncio.vendedor} · ${anuncio.puesto || 'Sin asignar'}` });
        embed.setTimestamp(new Date(anuncio.fecha));
    }

    return embed;
}

// --- BOTONES DE ANUNCIO ---

function construirBotonesAnuncio(anuncio) {
    const btnContactar = new ButtonBuilder()
        .setURL(`https://discord.com/users/${anuncio.vendedorId}`)
        .setLabel('📩 Contactar vendedor')
        .setStyle(ButtonStyle.Link);

    if (anuncio.vendido) {
        return [new ActionRowBuilder().addComponents(btnContactar)];
    }

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
            btnContactar
        )
    ];
}

// --- MODALES ---

async function mostrarModalVenderDino(interaction) {
    const db = cargarDB();
    const puestoAsignado = db.mercaderes?.[interaction.user.id]?.puesto || 'Sin asignar';

    const modal = new ModalBuilder()
        .setCustomId('mer_modal_dino')
        .setTitle(`Publicar dino — ${puestoAsignado}`);

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

async function mostrarModalVenderItem(interaction, tipo) {
    const db = cargarDB();
    const puestoAsignado = db.mercaderes?.[interaction.user.id]?.puesto || 'Sin asignar';

    const modal = new ModalBuilder()
        .setCustomId(`mer_modal_${tipo}`)
        .setTitle(`Publicar ${tipo} — ${puestoAsignado}`);

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

    if (id === 'mer_modal_dino') {
        try {
            const nombre          = interaction.fields.getTextInputValue('nombre').trim();
            const nivel_stats     = interaction.fields.getTextInputValue('nivel_stats').trim();
            const mut_sexo_color  = interaction.fields.getTextInputValue('mutaciones_sexo_color').trim();
            const precio          = interaction.fields.getTextInputValue('precio').trim();
            const notas           = interaction.fields.getTextInputValue('notas').trim();

            const partes      = nivel_stats.split('|').map(p => p.trim());
            const nivel       = partes[0] || nivel_stats;
            const estadisticas = partes.slice(1).join(' | ') || null;

            const partesMSC  = mut_sexo_color.split('|').map(p => p.trim());
            const mutaciones = partesMSC[0] || null;
            const sexo       = partesMSC[1] || null;
            const color      = partesMSC[2] || null;

            const db    = cargarDB();
            const puesto = db.mercaderes?.[interaction.user.id]?.puesto || 'Sin asignar';

            await publicarAnuncio(interaction, client, {
                tipo: 'dino', nombre, nivel, estadisticas,
                mutaciones, sexo, color, precio, puesto,
                notas: notas || null
            });

        } catch (error) {
            console.error('[MER] Error publicando dino:', error);
            await interaction.reply({ content: `❌ Error: ${error.message}`, flags: MessageFlags.Ephemeral });
        }
    }

    if (['mer_modal_item', 'mer_modal_recurso', 'mer_modal_servicio'].includes(id)) {
        try {
            const tipo             = id.replace('mer_modal_', '');
            const nombre           = interaction.fields.getTextInputValue('nombre').trim();
            const cantidad_calidad = interaction.fields.getTextInputValue('cantidad_calidad').trim();
            const precio           = interaction.fields.getTextInputValue('precio').trim();
            const notas            = interaction.fields.getTextInputValue('notas').trim();

            const db    = cargarDB();
            const puesto = db.mercaderes?.[interaction.user.id]?.puesto || 'Sin asignar';

            await publicarAnuncio(interaction, client, {
                tipo, nombre,
                estadisticas: cantidad_calidad,
                precio, puesto,
                notas: notas || null
            });

        } catch (error) {
            console.error('[MER] Error publicando item:', error);
            await interaction.reply({ content: `❌ Error: ${error.message}`, flags: MessageFlags.Ephemeral });
        }
    }
}

// --- PUBLICAR ANUNCIO EN EL FORO ---

async function publicarAnuncio(interaction, client, datos) {
    const canal = await client.channels.fetch(config.canales.mercado).catch(() => null);
    if (!canal || canal.type !== ChannelType.GuildForum) {
        return interaction.reply({ content: '❌ Canal de mercado no es un foro o no está configurado.', flags: MessageFlags.Ephemeral });
    }

    const db = cargarDB();
    const mercaderData = db.mercaderes?.[interaction.user.id];
    if (!mercaderData) {
        return interaction.reply({ content: '❌ No tienes un puesto activo. Pide a un admin que te asigne uno con `/dar_puesto`.', flags: MessageFlags.Ephemeral });
    }

    const tags = await obtenerTags(canal);
    const tagTipo    = buscarTag(tags, NOMBRES_TAG[datos.tipo]);
    const tagVendido = buscarTag(tags, NOMBRES_TAG.vendido);

    const anuncioId = Date.now().toString();
    const anuncio = {
        id: anuncioId,
        vendedor: interaction.user.username,
        vendedorId: interaction.user.id,
        vendido: false,
        fecha: new Date().toISOString(),
        post_id: null,
        tag_vendido_id: tagVendido,
        ...datos
    };

    if (!db.mercado) db.mercado = {};
    db.mercado[anuncioId] = anuncio;
    guardarDB(db);

    const embed   = construirEmbedAnuncio(anuncio);
    const botones = construirBotonesAnuncio(anuncio);

    // Crear publicación en el foro
    const post = await canal.threads.create({
        name: `${EMOJIS_TIPO[datos.tipo] || '📦'} [${mercaderData.puesto}] ${datos.nombre} — ${interaction.user.username}`,
        message: { embeds: [embed], components: botones },
        appliedTags: tagTipo ? [tagTipo] : []
    });

    db.mercado[anuncioId].post_id = post.id;
    guardarDB(db);

    await interaction.reply({
        content: `✅ Anuncio publicado en <#${post.id}>`,
        flags: MessageFlags.Ephemeral
    });
}

// --- GESTIÓN DE BOTONES ---

async function handleButton(interaction, client) {
    const id = interaction.customId;

    if (id.startsWith('mer_vendido_')) {
        const anuncioId = id.replace('mer_vendido_', '');
        const db = cargarDB();
        const anuncio = db.mercado?.[anuncioId];
        if (!anuncio) return interaction.reply({ content: '❌ Anuncio no encontrado.', flags: MessageFlags.Ephemeral });

        if (anuncio.vendedorId !== interaction.user.id && !esAdmin(interaction)) {
            return interaction.reply({ content: '⛔ Solo el vendedor puede marcar esto como vendido.', flags: MessageFlags.Ephemeral });
        }

        anuncio.vendido = true;
        guardarDB(db);

        // Cambiar tag a 🔴 Vendido en la publicación del foro
        if (anuncio.post_id && anuncio.tag_vendido_id) {
            const post = await client.channels.fetch(anuncio.post_id).catch(() => null);
            if (post) {
                await post.setAppliedTags([anuncio.tag_vendido_id]).catch(() => {});
                await post.setLocked(true).catch(() => {});
            }
        }

        const embed = construirEmbedAnuncio(anuncio);
        await interaction.update({ embeds: [embed], components: construirBotonesAnuncio(anuncio) });
        return;
    }

    if (id.startsWith('mer_retirar_')) {
        const anuncioId = id.replace('mer_retirar_', '');
        const db = cargarDB();
        const anuncio = db.mercado?.[anuncioId];
        if (!anuncio) return interaction.reply({ content: '❌ Anuncio no encontrado.', flags: MessageFlags.Ephemeral });

        if (anuncio.vendedorId !== interaction.user.id && !esAdmin(interaction)) {
            return interaction.reply({ content: '⛔ Solo el vendedor puede retirar este anuncio.', flags: MessageFlags.Ephemeral });
        }

        // Eliminar la publicación del foro
        if (anuncio.post_id) {
            const post = await client.channels.fetch(anuncio.post_id).catch(() => null);
            if (post) await post.delete('Anuncio retirado por el vendedor').catch(() => {});
        }

        delete db.mercado[anuncioId];
        guardarDB(db);

        // El mensaje ya no existe (se borró el post), solo reply
        await interaction.reply({
            content: '🗑️ Anuncio retirado correctamente.',
            flags: MessageFlags.Ephemeral
        }).catch(() => {});
        return;
    }
}

// --- DAR PUESTO (sin hilo, solo rol + DB) ---

async function darRolMercader(interaction, client, usuario, numPuesto) {
    try {
        const guild  = interaction.guild;
        const member = await guild.members.fetch(usuario.id);
        const rol    = guild.roles.cache.find(r => r.id === config.roles.mercader || r.name === 'Mercader');

        if (!rol) return interaction.reply({ content: '❌ Rol Mercader no encontrado.', flags: MessageFlags.Ephemeral });

        const db = cargarDB();
        if (db.mercaderes?.[usuario.id]) {
            return interaction.reply({
                content: `⚠️ **${usuario.username}** ya tiene un puesto activo. Quítaselo primero con \`/quitar_puesto\`.`,
                flags: MessageFlags.Ephemeral
            });
        }

        const nombrePuesto = numPuesto ? `Puesto ${numPuesto}` : 'Sin asignar';

        await member.roles.add(rol);

        if (!db.mercaderes) db.mercaderes = {};
        db.mercaderes[usuario.id] = {
            username: usuario.username,
            puesto: nombrePuesto,
            fechaAsignacion: new Date().toISOString()
        };
        guardarDB(db);

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle('🛒 Puesto de mercado asignado')
                    .setColor(0xE67E22)
                    .addFields(
                        { name: '👤 Mercader', value: usuario.username, inline: true },
                        { name: '🏪 Puesto',   value: nombrePuesto,     inline: true }
                    )
                    .setDescription(`**${usuario.username}** puede publicar en el mercado con \`/vender_dino\`, \`/vender_item\`, \`/vender_recurso\` o \`/vender_servicio\`.`)
            ]
        });

    } catch (error) {
        console.error('[MER] Error dando rol mercader:', error);
        await interaction.reply({ content: `❌ Error: ${error.message}`, flags: MessageFlags.Ephemeral });
    }
}

// --- QUITAR PUESTO ---

async function quitarRolMercader(interaction, client, usuario) {
    try {
        const guild  = interaction.guild;
        const member = await guild.members.fetch(usuario.id);
        const rol    = guild.roles.cache.find(r => r.id === config.roles.mercader || r.name === 'Mercader');

        if (!rol) return interaction.reply({ content: '❌ Rol Mercader no encontrado.', flags: MessageFlags.Ephemeral });

        const db = cargarDB();

        // Eliminar todas las publicaciones del foro de este mercader
        if (db.mercado) {
            const canal = await client.channels.fetch(config.canales.mercado).catch(() => null);
            for (const [anuncioId, anuncio] of Object.entries(db.mercado)) {
                if (anuncio.vendedorId === usuario.id && anuncio.post_id) {
                    const post = await client.channels.fetch(anuncio.post_id).catch(() => null);
                    if (post) await post.delete(`Puesto retirado a ${usuario.username}`).catch(() => {});
                    delete db.mercado[anuncioId];
                }
            }
        }

        await member.roles.remove(rol);

        if (db.mercaderes?.[usuario.id]) delete db.mercaderes[usuario.id];
        guardarDB(db);

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle('🛒 Puesto de mercado retirado')
                    .setDescription(`**${usuario.username}** ya no tiene rol de Mercader y sus anuncios han sido eliminados.`)
                    .setColor(0x95A5A6)
            ]
        });

    } catch (error) {
        console.error('[MER] Error quitando rol mercader:', error);
        await interaction.reply({ content: `❌ Error: ${error.message}`, flags: MessageFlags.Ephemeral });
    }
}

// --- SETUP: PUBLICACIÓN FIJADA DE BIENVENIDA ---

async function setupMercado(interaction, client) {
    if (!interaction.member.permissions.has('Administrator')) {
        return interaction.reply({ content: '⛔ Solo administradores.', flags: MessageFlags.Ephemeral });
    }

    const canal = await client.channels.fetch(config.canales.mercado).catch(() => null);
    if (!canal || canal.type !== ChannelType.GuildForum) {
        return interaction.reply({ content: '❌ Canal de mercado no es un foro.', flags: MessageFlags.Ephemeral });
    }

    // Asegurar que los tags existen
    const tags = await obtenerTags(canal);

    const embed = new EmbedBuilder()
        .setTitle('🏪 Bienvenido al Mercado TSDE')
        .setColor(0xE67E22)
        .setDescription(
            '¡Bienvenido al mercado oficial del servidor **TSDE Arkeanos**!\n\n' +
            'Aquí los mercaderes con puesto asignado pueden publicar sus ventas e intercambios.\n\n' +
            '**📍 Ubicación del mercado en el mapa:** `57.8 / 34.7`\n\n' +
            '**📋 Cómo funciona:**\n' +
            '> 1. Un admin te asigna un puesto con `/dar_puesto`\n' +
            '> 2. Recibes el rol **Mercader** y puedes publicar anuncios\n' +
            '> 3. Usa los comandos de venta para crear publicaciones aquí\n' +
            '> 4. Marca tus anuncios como vendidos cuando se cierren\n\n' +
            '**🛒 Comandos disponibles (solo Mercaderes):**\n' +
            '`/vender_dino` — Publica un dinosaurio en venta\n' +
            '`/vender_item` — Publica un ítem o equipamiento\n' +
            '`/vender_recurso` — Publica materiales o recursos\n' +
            '`/vender_servicio` — Ofrece un servicio (cría, tames, etc.)\n\n' +
            '**🏷️ Tags:**\n' +
            '🦖 Dino · ⚔️ Item · 🪵 Recurso · 🔧 Servicio · 🔴 Vendido\n\n' +
            '**📩 ¿Quieres comprar algo?** Usa el botón **Contactar vendedor** en cada anuncio para hablar por privado.'
        )
        .setFooter({ text: 'TSDE Arkeanos — Ragnarok · Solo lectura para compradores' })
        .setTimestamp();

    const post = await canal.threads.create({
        name: '📌 Cómo funciona el Mercado TSDE',
        message: { embeds: [embed] },
        appliedTags: []
    });

    // Fijar el post (pinear el mensaje de apertura)
    const mensajes = await post.messages.fetch({ limit: 1 });
    const primerMensaje = mensajes.first();
    if (primerMensaje) await primerMensaje.pin().catch(() => {});

    await interaction.reply({
        content: `✅ Publicación de bienvenida creada: <#${post.id}>`,
        flags: MessageFlags.Ephemeral
    });
}

module.exports = {
    mostrarModalVenderDino,
    mostrarModalVenderItem,
    handleModal,
    handleButton,
    darRolMercader,
    quitarRolMercader,
    esMercader,
    setupMercado
};
