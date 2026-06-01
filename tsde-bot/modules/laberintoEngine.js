const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    StringSelectMenuBuilder,
    MessageFlags
} = require('discord.js');
const fs = require('fs');
const rcon = require('./rconHelper.js');

const DB_PATH = './database.json';

// Cronómetros activos en memoria
const cronometros = {};
let panelMensajeId = null;
let panelCanalId = null;
let intervaloActualizacion = null;

// --- BASE DE DATOS ---

function cargarDB() {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function guardarDB(data) {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
}

function cargarLaberinto() {
    const db = cargarDB();
    if (!db.laberinto) db.laberinto = { evento_activo: null, resultados: [], equipos: [] };
    return db.laberinto;
}

function guardarLaberinto(laberinto) {
    const db = cargarDB();
    db.laberinto = laberinto;
    guardarDB(db);
}

// --- HELPERS ---

function esAdmin(interaction) {
    return interaction.member.permissions.has('ManageMessages');
}

function formatearTiempo(ms) {
    const mins = Math.floor(ms / 60000);
    const segs = Math.floor((ms % 60000) / 1000);
    const decimas = Math.floor((ms % 1000) / 100);
    return `${String(mins).padStart(2, '0')}:${String(segs).padStart(2, '0')}.${decimas}`;
}

function ordenarResultados(resultados) {
    return [...resultados].sort((a, b) => {
        if (a.completado && !b.completado) return -1;
        if (!a.completado && b.completado) return 1;
        if (a.completado && b.completado) return a.tiempo_ms - b.tiempo_ms;
        return 0;
    });
}

// --- EMBEDS INSCRIPCIONES ---

function construirEmbedInscripciones(evento) {
    const inscritos = evento.inscritos || [];
    const equipos = evento.equipos || [];
    const minimo = evento.minimo || 5;
    const modoTexto = {
        speed: '⏱️ Contrarreloj',
        survival: '⚔️ Supervivencia',
        teams: '👥 Por equipos (tribus)',
        relay: '🔄 Relevos'
    }[evento.modo] || evento.modo;

    const embed = new EmbedBuilder()
        .setTitle(`🌀 LABERINTO TSDE — ${modoTexto}`)
        .setColor(0x9B59B6)
        .addFields(
            { name: '🎁 Recompensa', value: evento.recompensa, inline: true },
            { name: '👥 Mínimo', value: `${evento.modo === 'teams' ? equipos.length + ' equipos' : inscritos.length + '/' + minimo}`, inline: true }
        );

    if (evento.modo === 'teams') {
        if (equipos.length > 0) {
            const listaEquipos = equipos.map((eq, i) =>
                `**${i + 1}. ${eq.nombre}** (${eq.jugadores.length}/6)\n${eq.jugadores.map(j => `  └ ${j}`).join('\n')}`
            ).join('\n\n');
            embed.addFields({ name: '🛡️ Equipos inscritos', value: listaEquipos, inline: false });
        } else {
            embed.addFields({ name: '🛡️ Equipos inscritos', value: 'Ningún equipo inscrito aún', inline: false });
        }
    } else {
        if (inscritos.length > 0) {
            embed.addFields({
                name: '✅ Inscritos',
                value: inscritos.map((j, i) => `${i + 1}. ${j}`).join('\n'),
                inline: false
            });
        } else {
            embed.addFields({ name: '✅ Inscritos', value: 'Nadie inscrito aún', inline: false });
        }
    }

    const listos = evento.modo === 'teams' ? equipos.length >= 2 : inscritos.length >= minimo;
    embed.setFooter({ text: listos ? '✅ Listo para iniciar' : `Faltan ${evento.modo === 'teams' ? '2 equipos mínimo' : minimo - inscritos.length + ' jugadores'}` });

    return embed;
}

function construirBotonesInscripciones(evento) {
    const esTeams = evento.modo === 'teams';

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('lab_apuntar')
            .setLabel(esTeams ? '🛡️ Inscribir equipo' : '✋ Apuntarme')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('lab_desapuntar')
            .setLabel(esTeams ? '❌ Retirar equipo' : '❌ Borrarme')
            .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
            .setCustomId('lab_iniciar')
            .setLabel('▶️ Iniciar evento')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('lab_cancelar_evento')
            .setLabel('🗑️ Cancelar')
            .setStyle(ButtonStyle.Secondary)
    );

    // Botón añadir jugador a equipo (solo modo teams)
    if (esTeams) {
        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('lab_add_miembro_equipo')
                .setLabel('➕ Añadir jugador a equipo')
                .setStyle(ButtonStyle.Primary)
        );
        return [row, row2];
    }

    return [row];
}

// --- EMBED CRONÓMETROS ---

function construirEmbedCronometros(evento) {
    const lab = cargarLaberinto();
    const resultados = ordenarResultados(lab.resultados || []);
    const modoTexto = {
        speed: '⏱️ Contrarreloj',
        survival: '⚔️ Supervivencia',
        teams: '👥 Por equipos',
        relay: '🔄 Relevos'
    }[evento.modo] || evento.modo;

    const embed = new EmbedBuilder()
        .setTitle(`${modoTexto} — Panel de control`)
        .setColor(0xF39C12)
        .addFields({ name: '🎁 Recompensa', value: evento.recompensa, inline: false });

    if (evento.modo === 'survival') {
        // Modo supervivencia — mostrar participantes vivos
        const vivos = (evento.inscritos || []).filter(j =>
            !lab.resultados.some(r => r.jugador === j)
        );
        if (vivos.length > 0) {
            embed.addFields({ name: '💀 Aún en pie', value: vivos.map(j => `⚔️ ${j}`).join('\n'), inline: false });
        }
        if (resultados.length > 0) {
            embed.addFields({
                name: '💀 Eliminados',
                value: resultados.map((r, i) => `${i + 1}. ~~${r.jugador}~~`).join('\n'),
                inline: false
            });
        }
    } else if (evento.modo === 'teams') {
        // Modo equipos
        const equipos = evento.equipos || [];
        for (const equipo of equipos) {
            const lineas = equipo.jugadores.map(j => {
                if (cronometros[j]) {
                    const t = Date.now() - cronometros[j];
                    return `🏃 ${j} — \`${formatearTiempo(t)}\``;
                }
                const resultado = lab.resultados.find(r => r.jugador === j);
                if (resultado) return resultado.completado
                    ? `✅ ${j} — \`${formatearTiempo(resultado.tiempo_ms)}\``
                    : `❌ ${j} — No completado`;
                return `⏳ ${j} — Esperando`;
            });

            // Tiempo del equipo si todos terminaron
            const tiemposEquipo = equipo.jugadores
                .map(j => lab.resultados.find(r => r.jugador === j))
                .filter(r => r && r.completado);

            const todosCompletados = tiemposEquipo.length === equipo.jugadores.length;
            const tiempoPromedio = todosCompletados
                ? Math.round(tiemposEquipo.reduce((s, r) => s + r.tiempo_ms, 0) / equipo.jugadores.length)
                : null;

            const tiempoTotal = tiempoPromedio
                ? `⏱️ Promedio: \`${formatearTiempo(tiempoPromedio)}\``
                : `${tiemposEquipo.length}/${equipo.jugadores.length} completados`;

            embed.addFields({
                name: `🛡️ ${equipo.nombre} — ${tiempoTotal}`,
                value: lineas.join('\n'),
                inline: false
            });
        }
    } else {
        // Modo contrarreloj / relevos
        if (Object.keys(cronometros).length > 0) {
            const lineas = Object.entries(cronometros).map(([j, inicio]) =>
                `🏃 **${j}** — \`${formatearTiempo(Date.now() - inicio)}\``
            );
            embed.addFields({ name: '⏱️ En curso', value: lineas.join('\n'), inline: false });
        }

        const completados = resultados.filter(r => r.completado);
        if (completados.length > 0) {
            const medallas = ['🥇', '🥈', '🥉'];
            embed.addFields({
                name: '🏆 Resultados',
                value: completados.map((r, i) =>
                    `${i < 3 ? medallas[i] : `\`${i + 1}.\``} **${r.jugador}** — \`${formatearTiempo(r.tiempo_ms)}\``
                ).join('\n'),
                inline: false
            });
        }

        const noCompletados = resultados.filter(r => !r.completado);
        if (noCompletados.length > 0) {
            embed.addFields({
                name: 'No completado',
                value: noCompletados.map(r => `❌ ${r.jugador}`).join('\n'),
                inline: false
            });
        }
    }

    embed.setFooter({ text: 'Actualización cada 5 segundos' });
    return embed;
}

function construirBotonesCronometros(evento, client) {
    const jugadores = Object.keys(cronometros);
    const rows = [];

    if (evento.modo === 'survival') {
        // Supervivencia — selector de eliminados
        const lab = cargarLaberinto();
        const vivos = (evento.inscritos || []).filter(j =>
            !lab.resultados.some(r => r.jugador === j)
        );

        rows.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('lab_finalizar')
                .setLabel('🏁 Finalizar evento')
                .setStyle(ButtonStyle.Primary)
        ));

        if (vivos.length > 0) {
            rows.push(new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('lab_eliminar_select')
                    .setPlaceholder('💀 Eliminar jugador...')
                    .addOptions(vivos.slice(0, 25).map(j => ({
                        label: j, value: j, emoji: '💀'
                    })))
            ));
        }
    } else {
        // Contrarreloj / teams / relevos
        rows.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('lab_add_jugador')
                .setLabel('➕ Añadir jugador')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('lab_finalizar')
                .setLabel('🏁 Finalizar evento')
                .setStyle(ButtonStyle.Primary)
        ));

        // Botones STOP individuales (máx 15)
        const chunks = [];
        for (let i = 0; i < Math.min(jugadores.length, 15); i += 5) {
            chunks.push(jugadores.slice(i, i + 5));
        }
        chunks.forEach(grupo => {
            const row = new ActionRowBuilder();
            grupo.forEach(jugador => {
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId(`lab_stop_${Buffer.from(jugador).toString('base64')}`)
                        .setLabel(`⏹ ${jugador.length > 18 ? jugador.substring(0, 18) + '…' : jugador}`)
                        .setStyle(ButtonStyle.Danger)
                );
            });
            rows.push(row);
        });

        if (jugadores.length > 0) {
            rows.push(new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('lab_anular_select')
                    .setPlaceholder('❌ Anular jugador (no completó)...')
                    .addOptions(jugadores.slice(0, 25).map(j => ({
                        label: j, value: j, emoji: '❌'
                    })))
            ));
        }
    }

    return rows.slice(0, 5);
}

// --- EMBED PODIUM FINAL ---

function construirEmbedPodiumFinal(evento) {
    const lab = cargarLaberinto();
    const recompensa = evento.recompensa || '—';

    const embed = new EmbedBuilder()
        .setTitle('🏆 RESULTADOS FINALES — Laberinto TSDE')
        .setColor(0xF1C40F)
        .addFields({ name: '🎁 Recompensa', value: recompensa, inline: false });

    if (evento.modo === 'teams') {
        const equipos = evento.equipos || [];
        const rankingEquipos = equipos.map(eq => {
            const tiempos = eq.jugadores
                .map(j => lab.resultados.find(r => r.jugador === j))
                .filter(r => r && r.completado);
            const todosCompletados = tiempos.length === eq.jugadores.length;
            // Tiempo promedio por jugador — justo para equipos de distinto tamaño
            const promedio = todosCompletados
                ? Math.round(tiempos.reduce((s, r) => s + r.tiempo_ms, 0) / eq.jugadores.length)
                : null;
            return { nombre: eq.nombre, tiempo: promedio, completados: tiempos.length, total: eq.jugadores.length };
        }).sort((a, b) => {
            if (a.tiempo && !b.tiempo) return -1;
            if (!a.tiempo && b.tiempo) return 1;
            if (a.tiempo && b.tiempo) return a.tiempo - b.tiempo;
            return b.completados - a.completados;
        });

        const medallas = ['🥇', '🥈', '🥉'];
        const lineas = rankingEquipos.map((eq, i) => {
            const medal = i < 3 ? medallas[i] : `\`${i + 1}.\``;
            const tiempo = eq.tiempo ? `Promedio: ${formatearTiempo(eq.tiempo)}` : `${eq.completados}/${eq.total} completados`;
            return `${medal} **${eq.nombre}** — ${tiempo}`;
        });
        embed.setDescription(lineas.join('\n'));
    } else if (evento.modo === 'survival') {
        const eliminados = lab.resultados;
        if (eliminados.length > 0) {
            const ganador = (evento.inscritos || []).find(j =>
                !eliminados.some(r => r.jugador === j)
            ) || 'Sin ganador';
            embed.addFields({ name: '👑 Ganador', value: ganador, inline: false });
            embed.addFields({
                name: '💀 Eliminados (por orden)',
                value: eliminados.map((r, i) => `${i + 1}. ${r.jugador}`).join('\n'),
                inline: false
            });
        }
    } else {
        const resultados = ordenarResultados(lab.resultados || []);
        if (resultados.length === 0) {
            embed.setDescription('Sin resultados registrados.');
            return embed;
        }
        const medallas = ['🥇', '🥈', '🥉'];
        const lineas = resultados.map((r, i) => {
            if (r.completado) {
                const medal = i < 3 ? medallas[i] : `\`${i + 1}.\``;
                return `${medal} **${r.jugador}** — \`${formatearTiempo(r.tiempo_ms)}\``;
            }
            return `❌ **${r.jugador}** — No completado`;
        });
        embed.setDescription(lineas.join('\n'));
    }

    embed.setFooter({ text: `${(lab.resultados || []).length} participantes` });
    return embed;
}

// --- ACTUALIZACIÓN AUTOMÁTICA ---

async function iniciarActualizacion(client, canalId, mensajeId, evento) {
    if (intervaloActualizacion) clearInterval(intervaloActualizacion);
    panelCanalId = canalId;
    panelMensajeId = mensajeId;

    intervaloActualizacion = setInterval(async () => {
        if (!panelMensajeId || !panelCanalId) return;
        if (Object.keys(cronometros).length === 0) return;
        try {
            const canal = await client.channels.fetch(panelCanalId);
            const mensaje = await canal.messages.fetch(panelMensajeId);
            await mensaje.edit({
                embeds: [construirEmbedCronometros(evento)],
                components: construirBotonesCronometros(evento, client)
            });
        } catch (e) {
            clearInterval(intervaloActualizacion);
        }
    }, 5000);
}

function detenerActualizacion() {
    if (intervaloActualizacion) {
        clearInterval(intervaloActualizacion);
        intervaloActualizacion = null;
    }
    panelMensajeId = null;
    panelCanalId = null;
}

// --- MODAL CREAR LABERINTO ---

async function mostrarModalCrearLaberinto(interaction, modo) {
    const modal = new ModalBuilder()
        .setCustomId(`lab_modal_crear_${modo}`)
        .setTitle(`Crear Laberinto — ${modo === 'speed' ? 'Contrarreloj' : modo === 'survival' ? 'Supervivencia' : modo === 'teams' ? 'Por equipos' : 'Relevos'}`);

    modal.addComponents(
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('recompensa')
                .setLabel('Recompensa')
                .setPlaceholder('Ej: 500 TSDE Coins + Rex nivel 300...')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('minimo')
                .setLabel(modo === 'teams' ? 'Mínimo de equipos para iniciar' : 'Mínimo de jugadores para iniciar')
                .setPlaceholder(modo === 'teams' ? '2' : '5')
                .setValue(modo === 'teams' ? '2' : '5')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
        )
    );

    await interaction.showModal(modal);
}

// --- GESTIÓN DE MODALES ---

async function handleModal(interaction, client) {
    const id = interaction.customId;

    // Modal crear laberinto
    if (id.startsWith('lab_modal_crear_')) {
        try {
            const modo = id.replace('lab_modal_crear_', '');
            const recompensa = interaction.fields.getTextInputValue('recompensa');
            const minimo = parseInt(interaction.fields.getTextInputValue('minimo')) || (modo === 'teams' ? 2 : 5);

            const config = require('../config.json');
            const lab = cargarLaberinto();
            lab.evento_activo = {
                recompensa,
                minimo,
                modo,
                inscritos: [],
                equipos: [],
                estado: 'inscripciones'
            };
            lab.resultados = [];
            guardarLaberinto(lab);

            Object.keys(cronometros).forEach(k => delete cronometros[k]);
            detenerActualizacion();

            const canal = await client.channels.fetch(config.canales.eventos).catch(() => null);
            if (!canal) return interaction.reply({ content: '❌ Canal de eventos no configurado.', flags: MessageFlags.Ephemeral });

            const embed = construirEmbedInscripciones(lab.evento_activo);
            const botones = construirBotonesInscripciones(lab.evento_activo);
            const mensaje = await canal.send({ embeds: [embed], components: botones });

            panelCanalId = config.canales.eventos;
            panelMensajeId = mensaje.id;

            await interaction.reply({ content: `✅ Laberinto creado en <#${config.canales.eventos}>`, flags: MessageFlags.Ephemeral });

        } catch (error) {
            console.error('[LAB] Error creando laberinto:', error);
            await interaction.reply({ content: `❌ Error: ${error.message}`, flags: MessageFlags.Ephemeral });
        }
    }

    // Modal añadir jugador al cronómetro
    if (id === 'lab_modal_add_jugador') {
        try {
            const jugador = interaction.fields.getTextInputValue('nombre').trim();

            if (cronometros[jugador] !== undefined) {
                return interaction.reply({ content: `⚠️ **${jugador}** ya tiene cronómetro activo.`, flags: MessageFlags.Ephemeral });
            }

            cronometros[jugador] = Date.now();

            const lab = cargarLaberinto();
            const embed = construirEmbedCronometros(lab.evento_activo);
            const botones = construirBotonesCronometros(lab.evento_activo, client);
            await interaction.update({ embeds: [embed], components: botones });

        } catch (error) {
            console.error('[LAB] Error añadiendo jugador:', error);
            await interaction.reply({ content: `❌ Error: ${error.message}`, flags: MessageFlags.Ephemeral });
        }
    }

    // Modal inscribir equipo
    if (id === 'lab_modal_inscribir_equipo') {
        try {
            const nombreEquipo = interaction.fields.getTextInputValue('nombre_equipo').trim();
            const miembros = interaction.fields.getTextInputValue('miembros')
                .split('\n')
                .map(m => m.trim())
                .filter(m => m.length > 0)
                .slice(0, 6);

            const lab = cargarLaberinto();
            const evento = lab.evento_activo;

            if (!evento) return interaction.reply({ content: 'No hay evento activo.', flags: MessageFlags.Ephemeral });
            if (evento.equipos.some(e => e.nombre === nombreEquipo)) {
                return interaction.reply({ content: `⚠️ Ya existe un equipo llamado **${nombreEquipo}**.`, flags: MessageFlags.Ephemeral });
            }

            evento.equipos.push({ nombre: nombreEquipo, jugadores: miembros });
            guardarLaberinto(lab);

            const embed = construirEmbedInscripciones(evento);
            const botones = construirBotonesInscripciones(evento);
            await interaction.update({ embeds: [embed], components: botones });

        } catch (error) {
            await interaction.reply({ content: `❌ Error: ${error.message}`, flags: MessageFlags.Ephemeral });
        }
    }

    // Modal añadir miembro a equipo
    if (id.startsWith('lab_modal_add_miembro_')) {
        try {
            const nombreEquipo = id.replace('lab_modal_add_miembro_', '');
            const jugador = interaction.fields.getTextInputValue('jugador').trim();

            const lab = cargarLaberinto();
            const evento = lab.evento_activo;
            const equipo = evento.equipos.find(e => e.nombre === nombreEquipo);

            if (!equipo) return interaction.reply({ content: 'Equipo no encontrado.', flags: MessageFlags.Ephemeral });
            if (equipo.jugadores.length >= 6) return interaction.reply({ content: '⚠️ El equipo ya tiene 6 jugadores (máximo).', flags: MessageFlags.Ephemeral });
            if (equipo.jugadores.includes(jugador)) return interaction.reply({ content: '⚠️ Ese jugador ya está en el equipo.', flags: MessageFlags.Ephemeral });

            equipo.jugadores.push(jugador);
            guardarLaberinto(lab);

            const embed = construirEmbedInscripciones(evento);
            const botones = construirBotonesInscripciones(evento);
            await interaction.update({ embeds: [embed], components: botones });

        } catch (error) {
            await interaction.reply({ content: `❌ Error: ${error.message}`, flags: MessageFlags.Ephemeral });
        }
    }
}

// --- GESTIÓN DE BOTONES ---

async function handleButton(interaction, client) {
    const id = interaction.customId;

    // Apuntarse
    if (id === 'lab_apuntar') {
        const lab = cargarLaberinto();
        if (!lab.evento_activo) return interaction.reply({ content: 'No hay evento activo.', flags: MessageFlags.Ephemeral });

        const evento = lab.evento_activo;

        if (evento.modo === 'teams') {
            // Modo equipos — abrir modal para inscribir equipo
            if (!esAdmin(interaction)) return interaction.reply({ content: '⛔ Solo admins pueden inscribir equipos.', flags: MessageFlags.Ephemeral });
            const modal = new ModalBuilder()
                .setCustomId('lab_modal_inscribir_equipo')
                .setTitle('Inscribir equipo');
            modal.addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('nombre_equipo')
                        .setLabel('Nombre del equipo/tribu')
                        .setPlaceholder('Ej: Los Depredadores')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                ),
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('miembros')
                        .setLabel('Jugadores (uno por línea, máx 6)')
                        .setPlaceholder('Yeti124\nSangui\nJugador3')
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true)
                )
            );
            return interaction.showModal(modal);
        }

        const nombre = interaction.user.displayName;
        if (evento.inscritos.includes(nombre)) return interaction.reply({ content: '⚠️ Ya estás inscrito.', flags: MessageFlags.Ephemeral });

        evento.inscritos.push(nombre);
        guardarLaberinto(lab);

        const embed = construirEmbedInscripciones(evento);
        const botones = construirBotonesInscripciones(evento);
        await interaction.update({ embeds: [embed], components: botones });
        return;
    }

    // Borrar inscripción
    if (id === 'lab_desapuntar') {
        const lab = cargarLaberinto();
        if (!lab.evento_activo) return interaction.reply({ content: 'No hay evento activo.', flags: MessageFlags.Ephemeral });

        const evento = lab.evento_activo;

        if (evento.modo === 'teams') {
            if (!esAdmin(interaction)) return interaction.reply({ content: '⛔ Solo admins.', flags: MessageFlags.Ephemeral });
            return interaction.reply({ content: 'Para retirar un equipo usa el select menu o contacta con un admin.', flags: MessageFlags.Ephemeral });
        }

        const nombre = interaction.user.displayName;
        if (!evento.inscritos.includes(nombre)) return interaction.reply({ content: '⚠️ No estás inscrito.', flags: MessageFlags.Ephemeral });

        evento.inscritos = evento.inscritos.filter(j => j !== nombre);
        guardarLaberinto(lab);

        const embed = construirEmbedInscripciones(evento);
        const botones = construirBotonesInscripciones(evento);
        await interaction.update({ embeds: [embed], components: botones });
        return;
    }

    // Añadir miembro a equipo
    if (id === 'lab_add_miembro_equipo') {
        if (!esAdmin(interaction)) return interaction.reply({ content: '⛔ Solo admins.', flags: MessageFlags.Ephemeral });
        const lab = cargarLaberinto();
        const equipos = lab.evento_activo?.equipos || [];
        if (equipos.length === 0) return interaction.reply({ content: '❌ No hay equipos inscritos aún.', flags: MessageFlags.Ephemeral });

        // Si hay un solo equipo, ir directo
        if (equipos.length === 1) {
            const modal = new ModalBuilder()
                .setCustomId(`lab_modal_add_miembro_${equipos[0].nombre}`)
                .setTitle(`Añadir jugador a ${equipos[0].nombre}`);
            modal.addComponents(new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('jugador')
                    .setLabel('Nombre del jugador en ARK')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            ));
            return interaction.showModal(modal);
        }

        // Si hay varios equipos, mostrar selector
        await interaction.reply({
            embeds: [new EmbedBuilder().setDescription('Selecciona el equipo al que añadir el jugador:').setColor(0x9B59B6)],
            components: [new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId('lab_select_equipo_add')
                    .setPlaceholder('Selecciona equipo...')
                    .addOptions(equipos.map(e => ({ label: e.nombre, value: e.nombre })))
            )],
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    // Iniciar evento
    if (id === 'lab_iniciar') {
        if (!esAdmin(interaction)) return interaction.reply({ content: '⛔ Solo admins.', flags: MessageFlags.Ephemeral });

        const lab = cargarLaberinto();
        if (!lab.evento_activo) return interaction.reply({ content: 'No hay evento activo.', flags: MessageFlags.Ephemeral });

        const evento = lab.evento_activo;
        const minimo = evento.minimo || (evento.modo === 'teams' ? 2 : 5);

        const count = evento.modo === 'teams' ? evento.equipos.length : evento.inscritos.length;
        if (count < minimo) {
            return interaction.reply({
                content: `❌ Mínimo ${minimo} ${evento.modo === 'teams' ? 'equipos' : 'jugadores'}. Hay ${count}.`,
                flags: MessageFlags.Ephemeral
            });
        }

        evento.estado = 'en_curso';
        guardarLaberinto(lab);
        Object.keys(cronometros).forEach(k => delete cronometros[k]);

        const embed = construirEmbedCronometros(evento);
        const botones = construirBotonesCronometros(evento, client);
        await interaction.update({ embeds: [embed], components: botones });

        await iniciarActualizacion(client, interaction.channelId, interaction.message.id, evento);
        await rcon.broadcast(`¡LABERINTO TSDE ha comenzado! Modo: ${evento.modo === 'teams' ? 'Por equipos' : evento.modo === 'survival' ? 'Supervivencia' : 'Contrarreloj'}`);
        return;
    }

    // Cancelar evento
    if (id === 'lab_cancelar_evento') {
        if (!esAdmin(interaction)) return interaction.reply({ content: '⛔ Solo admins.', flags: MessageFlags.Ephemeral });

        const lab = cargarLaberinto();
        lab.evento_activo = null;
        lab.resultados = [];
        guardarLaberinto(lab);
        Object.keys(cronometros).forEach(k => delete cronometros[k]);
        detenerActualizacion();

        await interaction.update({
            embeds: [new EmbedBuilder().setTitle('❌ Evento cancelado').setColor(0xE74C3C)],
            components: []
        });
        return;
    }

    // Añadir jugador al cronómetro
    if (id === 'lab_add_jugador') {
        if (!esAdmin(interaction)) return interaction.reply({ content: '⛔ Solo admins.', flags: MessageFlags.Ephemeral });

        const modal = new ModalBuilder()
            .setCustomId('lab_modal_add_jugador')
            .setTitle('Añadir jugador al cronómetro');
        modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('nombre')
                .setLabel('Nombre del jugador en ARK')
                .setPlaceholder('Nombre exacto...')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
        ));
        await interaction.showModal(modal);
        return;
    }

    // STOP individual
    if (id.startsWith('lab_stop_')) {
        if (!esAdmin(interaction)) return interaction.reply({ content: '⛔ Solo admins.', flags: MessageFlags.Ephemeral });

        const jugadorB64 = id.replace('lab_stop_', '');
        const jugador = Buffer.from(jugadorB64, 'base64').toString('utf8');

        if (cronometros[jugador] === undefined) {
            return interaction.reply({ content: `⚠️ **${jugador}** no tiene cronómetro activo.`, flags: MessageFlags.Ephemeral });
        }

        const tiempoMs = Date.now() - cronometros[jugador];
        delete cronometros[jugador];

        const lab = cargarLaberinto();
        lab.resultados.push({
            jugador,
            tiempo_ms: tiempoMs,
            completado: true,
            fecha: new Date().toISOString()
        });
        guardarLaberinto(lab);

        await rcon.broadcast(`LABERINTO: ${jugador} ha completado en ${formatearTiempo(tiempoMs)}!`);

        const embed = construirEmbedCronometros(lab.evento_activo);
        const botones = construirBotonesCronometros(lab.evento_activo, client);
        await interaction.update({ embeds: [embed], components: botones });
        return;
    }

    // Finalizar evento
    if (id === 'lab_finalizar') {
        if (!esAdmin(interaction)) return interaction.reply({ content: '⛔ Solo admins.', flags: MessageFlags.Ephemeral });

        detenerActualizacion();

        const lab = cargarLaberinto();
        const evento = lab.evento_activo;
        const completados = ordenarResultados(lab.resultados).filter(r => r.completado);

        if (completados.length > 0) {
            await rcon.broadcast(`LABERINTO finalizado! Ganador: ${completados[0].jugador} con ${formatearTiempo(completados[0].tiempo_ms)}!`);
        }

        const embed = construirEmbedPodiumFinal(evento);
        await interaction.update({
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('lab_reset')
                    .setLabel('🔄 Reset para próximo evento')
                    .setStyle(ButtonStyle.Danger)
            )]
        });
        return;
    }

    // Reset
    if (id === 'lab_reset') {
        if (!interaction.member.permissions.has('Administrator')) {
            return interaction.reply({ content: '⛔ Solo administradores.', flags: MessageFlags.Ephemeral });
        }

        const lab = cargarLaberinto();
        lab.evento_activo = null;
        lab.resultados = [];
        lab.equipos = [];
        guardarLaberinto(lab);
        Object.keys(cronometros).forEach(k => delete cronometros[k]);

        await interaction.update({
            embeds: [new EmbedBuilder()
                .setTitle('🔄 Laberinto reseteado')
                .setDescription('Listo para el próximo evento.')
                .setColor(0x9B59B6)],
            components: []
        });
        return;
    }
}

// --- GESTIÓN DE SELECT MENUS ---

async function handleSelect(interaction, client) {
    const id = interaction.customId;

    // Anular jugador
    if (id === 'lab_anular_select') {
        if (!esAdmin(interaction)) return interaction.reply({ content: '⛔ Solo admins.', flags: MessageFlags.Ephemeral });

        const jugador = interaction.values[0];
        if (cronometros[jugador] !== undefined) delete cronometros[jugador];

        const lab = cargarLaberinto();
        const yaExiste = lab.resultados.some(r => r.jugador === jugador);
        if (!yaExiste) {
            lab.resultados.push({
                jugador,
                tiempo_ms: null,
                completado: false,
                fecha: new Date().toISOString()
            });
            guardarLaberinto(lab);
        }

        const embed = construirEmbedCronometros(lab.evento_activo);
        const botones = construirBotonesCronometros(lab.evento_activo, client);
        await interaction.update({ embeds: [embed], components: botones });
    }

    // Eliminar jugador en modo supervivencia
    if (id === 'lab_eliminar_select') {
        if (!esAdmin(interaction)) return interaction.reply({ content: '⛔ Solo admins.', flags: MessageFlags.Ephemeral });

        const jugador = interaction.values[0];
        const lab = cargarLaberinto();

        lab.resultados.push({
            jugador,
            tiempo_ms: null,
            completado: false,
            eliminado: true,
            fecha: new Date().toISOString()
        });
        guardarLaberinto(lab);

        await rcon.broadcast(`LABERINTO: ${jugador} ha sido eliminado!`);

        const embed = construirEmbedCronometros(lab.evento_activo);
        const botones = construirBotonesCronometros(lab.evento_activo, client);
        await interaction.update({ embeds: [embed], components: botones });
    }

    // Seleccionar equipo para añadir miembro
    if (id === 'lab_select_equipo_add') {
        if (!esAdmin(interaction)) return interaction.reply({ content: '⛔ Solo admins.', flags: MessageFlags.Ephemeral });

        const nombreEquipo = interaction.values[0];
        const modal = new ModalBuilder()
            .setCustomId(`lab_modal_add_miembro_${nombreEquipo}`)
            .setTitle(`Añadir jugador a ${nombreEquipo}`);
        modal.addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder()
                .setCustomId('jugador')
                .setLabel('Nombre del jugador en ARK')
                .setStyle(TextInputStyle.Short)
                .setRequired(true)
        ));
        await interaction.showModal(modal);
    }
}

// --- PODIUM PÚBLICO ---

async function verPodium(interaction) {
    const lab = cargarLaberinto();
    const resultados = ordenarResultados(lab.resultados || []);

    const embed = new EmbedBuilder()
        .setTitle('🏆 Podium Laberinto TSDE')
        .setColor(0x9B59B6);

    if (resultados.length === 0) {
        embed.setDescription('Sin resultados aún.');
    } else {
        const medallas = ['🥇', '🥈', '🥉'];
        const lineas = resultados.map((r, i) => {
            if (r.completado) {
                const medal = i < 3 ? medallas[i] : `\`${i + 1}.\``;
                return `${medal} **${r.jugador}** — \`${formatearTiempo(r.tiempo_ms)}\``;
            }
            return `❌ **${r.jugador}** — No completado`;
        });
        embed.setDescription(lineas.join('\n'));
    }

    const recompensa = lab.evento_activo?.recompensa;
    if (recompensa) embed.setFooter({ text: `Recompensa: ${recompensa}` });

    await interaction.reply({ embeds: [embed] });
}

module.exports = {
    mostrarModalCrearLaberinto,
    handleButton,
    handleModal,
    handleSelect,
    verPodium
};
