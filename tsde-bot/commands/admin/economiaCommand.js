/**
 * ============================================================
 *  TSDE ARKEANOS — COMANDO !economia
 * ============================================================
 *  Uso en Discord (canal #economia):
 *
 *    !economia               → manda TODOS los embeds en orden
 *    !economia multiplicadores
 *    !economia goldcoin
 *    !economia recursos
 *    !economia dinos                  → resumen de categorías
 *    !economia dinos farmeo           → detalle de "Farmeo esencial"
 *    !economia dinos top              → detalle de "Top Tier"
 *    !economia equipo                 → resumen de categorías
 *    !economia equipo armas de fuego  → detalle de esa categoría
 *    !economia mercado
 *    !economia reglas
 *    !economia actualizar             → borra los mensajes anteriores
 *                                        del bot en el canal y reposta
 *                                        todo de nuevo (usar tras editar
 *                                        economiaConfig.js)
 *
 *  Requiere permiso de administrador o el rol que definas en
 *  ROLES_PERMITIDOS más abajo.
 * ============================================================
 */

const embeds = require('./economiaEmbeds');

// Pon aquí el/los IDs de rol que pueden ejecutar !economia actualizar
// (déjalo vacío [] si solo quieres restringir por permiso de Administrador)
const ROLES_PERMITIDOS = [];

function tienePermiso(message) {
  if (message.member.permissions.has('Administrator')) return true;
  if (ROLES_PERMITIDOS.length === 0) return false;
  return message.member.roles.cache.some(r => ROLES_PERMITIDOS.includes(r.id));
}

async function enviarTodos(channel) {
  await channel.send({ embeds: [embeds.embedMultiplicadores()] });
  await channel.send({ embeds: [embeds.embedGoldCoins()] });
  await channel.send({ embeds: [embeds.embedRecursos()] });
  await channel.send({ embeds: [embeds.embedDinosResumen()] });
  await channel.send({ embeds: [embeds.embedEquipoResumen()] });
  await channel.send({ embeds: [embeds.embedPuestosMercado()] });
  await channel.send({ embeds: [embeds.embedReglas()] });
}

module.exports = {
  name: 'economia',
  description: 'Muestra o actualiza la información de economía del servidor',

  async execute(message, args) {
    const sub = (args[0] || '').toLowerCase();
    const resto = args.slice(1).join(' ');

    // ── !economia  (sin argumentos) → manda todo ──
    if (!sub) {
      return enviarTodos(message.channel);
    }

    // ── !economia actualizar ──
    if (sub === 'actualizar') {
      if (!tienePermiso(message)) {
        return message.reply('No tienes permiso para actualizar la economía. Pide a un admin que lo haga.');
      }
      const confirmMsg = await message.reply(
        '⚠️ Esto borrará los últimos mensajes del bot en este canal y volverá a publicar todo. ¿Continuar? Responde `si` en 20 segundos.'
      );
      const filtro = m => m.author.id === message.author.id && m.content.toLowerCase() === 'si';
      try {
        await message.channel.awaitMessages({ filter: filtro, max: 1, time: 20000, errors: ['time'] });
      } catch {
        return confirmMsg.edit('Actualización cancelada (sin confirmación a tiempo).');
      }

      // Borra hasta 100 mensajes recientes del propio bot en el canal
      const mensajes = await message.channel.messages.fetch({ limit: 100 });
      const delBot = mensajes.filter(m => m.author.id === message.client.user.id);
      for (const m of delBot.values()) {
        await m.delete().catch(() => {});
      }
      await enviarTodos(message.channel);
      return message.channel.send('✅ Economía actualizada con los datos actuales de `economiaConfig.js`.');
    }

    // ── !economia multiplicadores ──
    if (sub === 'multiplicadores' || sub === 'multi') {
      return message.channel.send({ embeds: [embeds.embedMultiplicadores()] });
    }

    // ── !economia goldcoin ──
    if (sub === 'goldcoin' || sub === 'gc') {
      return message.channel.send({ embeds: [embeds.embedGoldCoins()] });
    }

    // ── !economia recursos ──
    if (sub === 'recursos') {
      return message.channel.send({ embeds: [embeds.embedRecursos()] });
    }

    // ── !economia dinos [categoria] ──
    if (sub === 'dinos') {
      if (!resto) {
        return message.channel.send({ embeds: [embeds.embedDinosResumen()] });
      }
      const embed = embeds.embedDinosCategoria(resto);
      if (!embed) {
        return message.reply(`No encontré la categoría "${resto}". Prueba con: básica, transporte, farmeo, combate medio, combate alto, especialistas, top, endgame.`);
      }
      return message.channel.send({ embeds: [embed] });
    }

    // ── !economia equipo [categoria] ──
    if (sub === 'equipo') {
      if (!resto) {
        return message.channel.send({ embeds: [embeds.embedEquipoResumen()] });
      }
      const embed = embeds.embedEquipoCategoria(resto);
      if (!embed) {
        return message.reply(`No encontré la categoría "${resto}". Prueba con: herramientas, cuerpo a cuerpo, distancia, fuego, explosivos, armadura, consumibles.`);
      }
      return message.channel.send({ embeds: [embed] });
    }

    // ── !economia mercado ──
    if (sub === 'mercado' || sub === 'puestos') {
      return message.channel.send({ embeds: [embeds.embedPuestosMercado()] });
    }

    // ── !economia reglas ──
    if (sub === 'reglas') {
      return message.channel.send({ embeds: [embeds.embedReglas()] });
    }

    return message.reply('Subcomando no reconocido. Usa `!economia` para ver todo, o revisa la lista de subcomandos en el código del comando.');
  },
};
