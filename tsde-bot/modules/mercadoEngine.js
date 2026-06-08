const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    MessageFlags,
    ChannelType,
    PermissionsBitField
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
            { name: '🏪 Puesto', value: anuncio.puesto || 'Sin asignar', inline: true },
            { name: '💰 Precio', value: anuncio.precio, inline: true }
        );

    if (anuncio.tipo === 'dino') {
        if (anuncio.nivel)        embed.addFields({ name: '⭐ Nivel', value: anuncio.nivel, inline: true });
        if (anuncio.estadisticas) embed.addFields({ name: '📊 Estadísticas', value: anuncio.estadisticas, inline: true });
        if (anuncio.mutaciones)   embed.addFields({ name: '🧬 Mutaciones', value: anuncio.mutaciones, inline: true });
        if (anuncio.sexo)         embed.addFields({ name: '⚥ Sexo', value: anuncio.sexo, inline: true });
        if (anuncio.color)        embed.addFields({ name: '🎨 Color', value: anuncio.color, inline: true });
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
    // Botón de contacto disponible para todos
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

// --- MODAL VENDER DINO ---

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

// --- MODAL VENDER ITEM/RECURSO/SERVICIO ---

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
            const nombre = interaction.fields.getTextInputValue('nombre').trim();
            const nivel_stats = interaction.fields.getTextInputValue('nivel_stats').trim();
            const mut_sexo_color = interaction.fields.getTextInputValue('mutaciones_sexo_color').trim();
            const precio = interaction.fields.getTextInputValue('precio').trim();
            const notas = interaction.fields.getTextInputValue('notas').trim();

            const partes = nivel_stats.split('|').map(p => p.trim());
            const nivel = partes[0] || nivel_stats;
            const estadisticas = partes.slice(1).join(' | ') || null;

            const partesMSC = mut_sexo_color.split('|').map(p => p.trim());
            const mutaciones = partesMSC[0] || null;
            const sexo = partesMSC[1] || null;
            const color = partesMSC[2] || null;

            const db = cargarDB();
            const puesto = db.mercaderes?.[interaction.user.id]?.puesto || 'Sin asignar';

            await publicarAnuncio(interaction, client, {
                tipo: 'dino',
                nombre,
                nivel,
                estadisticas,
                mutaciones,
                sexo,
                color,
                precio,
                puesto,
                notas: notas || null
            });

        } catch (error) {
            console.error('[MER] Error publicando dino:', error);
            await interaction.reply({ content: `❌ Error: ${error.message}`, flags: MessageFlags.Ephemeral });
        }
    }

    if (id === 'mer_modal_item' || id === 'mer_modal_recurso' || id === 'mer_modal_servicio') {
        try {
            const tipo = id.replace('mer_modal_', '');
            const nombre = interaction.fields.getTextInputValue('nombre').trim();
            const cantidad_calidad = interaction.fields.getTextInputValue('cantidad_calidad').trim();
            const precio = interaction.fields.getTextInputValue('precio').trim();
            const notas = interaction.fields.getTextInputValue('notas').trim();

            const db = cargarDB();
            const puesto = db.mercaderes?.[interaction.user.id]?.puesto || 'Sin asignar';

            await publicarAnuncio(interaction, client, {
                tipo,
                nombre,
                estadisticas: cantidad_calidad,
                precio,
                puesto,
                notas: notas || null
            });

        } catch (error) {
            console.error('[MER] Error publicando item:', error);
            await interaction.reply({ content: `❌ Error: ${error.message}`, flags: MessageFlags.Ephemeral });
        }
    }
}

// --- PUBLICAR ANUNCIO EN EL HILO DEL MERCADER ---

async function publicarAnuncio(interaction, client, datos) {
    const db = cargarDB();
    const mercaderData = db.mercaderes?.[interaction.user.id];

    // Buscar el hilo del mercader
    const threadId = mercaderData?.thread_id;
    let hilo = null;

    if (threadId) {
        hilo = await client.channels.fetch(threadId).catch(() => null);
    }

    if (!hilo) {
        return interaction.reply({
            content: '❌ No tienes un puesto activo. Pide a un admin que te asigne uno con `/dar_puesto`.',
            flags: MessageFlags.Ephemeral
        });
    }

    const anuncioId = Date.now().toString();
    const anuncio = {
        id: anuncioId,
        vendedor: interaction.user.username,
        vendedorId: interaction.user.id,
        vendido: false,
        fecha: new Date().toISOString(),
        mensaje_id: null,
        thread_id: hilo.id,
        ...datos
    };

    if (!db.mercado) db.mercado = {};
    db.mercado[anuncioId] = anuncio;
    guardarDB(db);

    const embed = construirEmbedAnuncio(anuncio);
    const botones = construirBotonesAnuncio(anuncio);
    const msg = await hilo.send({ embeds: [embed], components: botones });

    db.mercado[anuncioId].mensaje_id = msg.id;
    guardarDB(db);

    await interaction.reply({
        content: `✅ Anuncio publicado en tu puesto <#${hilo.id}>`,
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
}

// --- GESTIÓN DE ROLES Y HILOS MERCADER ---

async function darRolMercader(interaction, client, usuario, numPuesto) {
    try {
        const guild = interaction.guild;
        const member = await guild.members.fetch(usuario.id);
        const rol = guild.roles.cache.find(r => r.id === config.roles.mercader || r.name === 'Mercader');

        if (!rol) return interaction.reply({ content: '❌ Rol Mercader no encontrado.', flags: MessageFlags.Ephemeral });

        // Verificar si ya tiene puesto activo
        const db = cargarDB();
        if (db.mercaderes?.[usuario.id]?.thread_id) {
            return interaction.reply({
                content: `⚠️ **${usuario.username}** ya tiene un puesto activo. Quítaselo primero con \`/quitar_puesto\`.`,
                flags: MessageFlags.Ephemeral
            });
        }

        // Buscar el canal de mercado
        const canal = await client.channels.fetch(config.canales.mercado).catch(() => null);
        if (!canal) return interaction.reply({ content: '❌ Canal de mercado no configurado.', flags: MessageFlags.Ephemeral });

        const nombrePuesto = numPuesto ? `Puesto ${numPuesto}` : 'Sin asignar';
        const nombreHilo = `🏪 ${nombrePuesto} — ${usuario.username}`;

        // Crear hilo en el canal de mercado
        const hilo = await canal.threads.create({
            name: nombreHilo,
            type: ChannelType.PublicThread,
            reason: `Puesto de mercado asignado a ${usuario.username}`
        });

        // Mensaje de apertura en el hilo
        await hilo.send({
            embeds: [
                new EmbedBuilder()
                    .setTitle(`🏪 ${nombrePuesto} — ${usuario.username}`)
                    .setColor(0xE67E22)
                    .setDescription(`Bienvenido al puesto de **${usuario.username}**.\nUsa \`/vender_dino\`, \`/vender_item\`, \`/vender_recurso\` o \`/vender_servicio\` para publicar tus anuncios aquí.`)
                    .setFooter({ text: 'Usa los botones de cada anuncio para marcarlo como vendido o retirarlo.' })
                    .setTimestamp()
            ]
        });

        // Asignar rol
        await member.roles.add(rol);

        // Guardar en DB
        if (!db.mercaderes) db.mercaderes = {};
        db.mercaderes[usuario.id] = {
            username: usuario.username,
            puesto: nombrePuesto,
            thread_id: hilo.id,
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
                        { name: '🏪 Puesto', value: nombrePuesto, inline: true },
                        { name: '📌 Hilo', value: `<#${hilo.id}>`, inline: true }
                    )
                    .setDescription(`**${usuario.username}** puede publicar en su puesto con \`/vender\`.`)
            ]
        });

    } catch (error) {
        console.error('[MER] Error dando rol mercader:', error);
        await interaction.reply({ content: `❌ Error: ${error.message}`, flags: MessageFlags.Ephemeral });
    }
}

async function quitarRolMercader(interaction, client, usuario) {
    try {
        const guild = interaction.guild;
        const member = await guild.members.fetch(usuario.id);
        const rol = guild.roles.cache.find(r => r.id === config.roles.mercader || r.name === 'Mercader');

        if (!rol) return interaction.reply({ content: '❌ Rol Mercader no encontrado.', flags: MessageFlags.Ephemeral });

        const db = cargarDB();
        const mercaderData = db.mercaderes?.[usuario.id];

        // Eliminar el hilo si existe
        if (mercaderData?.thread_id) {
            const hilo = await client.channels.fetch(mercaderData.thread_id).catch(() => null);
            if (hilo) {
                await hilo.delete(`Puesto retirado a ${usuario.username}`).catch(e => {
                    console.warn('[MER] No se pudo eliminar el hilo:', e.message);
                });
            }
        }

        // Quitar rol
        await member.roles.remove(rol);

        // Limpiar anuncios del mercader en DB
        if (db.mercado) {
            for (const [anuncioId, anuncio] of Object.entries(db.mercado)) {
                if (anuncio.vendedorId === usuario.id) {
                    delete db.mercado[anuncioId];
                }
            }
        }

        // Eliminar datos del mercader
        if (db.mercaderes?.[usuario.id]) {
            delete db.mercaderes[usuario.id];
        }
        guardarDB(db);

        await interaction.reply({
            embeds: [
                new EmbedBuilder()
                    .setTitle('🛒 Puesto de mercado retirado')
                    .setDescription(`**${usuario.username}** ya no tiene rol de Mercader y su puesto ha sido eliminado.`)
                    .setColor(0x95A5A6)
            ]
        });

    } catch (error) {
        console.error('[MER] Error quitando rol mercader:', error);
        await interaction.reply({ content: `❌ Error: ${error.message}`, flags: MessageFlags.Ephemeral });
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
