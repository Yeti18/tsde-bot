/**
 * ============================================================
 *  TSDE ARKEANOS — GENERADOR DE EMBEDS DE ECONOMÍA
 * ============================================================
 *  No edites precios aquí. Edítalos en economiaConfig.js
 *  Este archivo solo construye el DISEÑO visual del embed.
 * ============================================================
 */

const { EmbedBuilder } = require('discord.js');
const cfg = require('./economiaConfig');

const FOOTER_TEXT = 'TSDE Arkeanos · Economía del servidor · Sujeto a cambios';
const FOOTER_ICON = null; // pon aquí una URL de icono si quieres

function baseEmbed(titulo, descripcion) {
  return new EmbedBuilder()
    .setColor(cfg.colorEmbed)
    .setTitle(titulo)
    .setDescription(descripcion || null)
    .setFooter({ text: FOOTER_TEXT, iconURL: FOOTER_ICON || undefined })
    .setTimestamp();
}

// ──────────────────────────────────────────────────────────
// 1. EMBED: MULTIPLICADORES
// ──────────────────────────────────────────────────────────
function embedMultiplicadores() {
  const m = cfg.multiplicadores;
  const desc =
    `Estos son los multiplicadores de cosecha activos en el servidor. ` +
    `Todos los precios de esta sección de economía están calculados a partir de ellos.\n\n` +
    `**HarvestAmountMultiplier:** \`${m.HarvestAmountMultiplier}\`\n` +
    `**PlayerHarvestingDamageMultiplier:** \`${m.PlayerHarvestingDamageMultiplier}\`\n` +
    `**HarvestHealthMultiplier:** \`${m.HarvestHealthMultiplier}\`\n` +
    `**DinoHarvestingDamageMultiplier:** \`${m.DinoHarvestingDamageMultiplier}\``;
  return baseEmbed('⚙️ Multiplicadores de cosecha', desc);
}

// ──────────────────────────────────────────────────────────
// 2. EMBED: GOLD COINS
// ──────────────────────────────────────────────────────────
function embedGoldCoins() {
  const g = cfg.goldCoins;
  const e = cfg.emojis.goldcoin;
  const desc =
    `${e} **Tiempo conectado:** ${g.porTiempoConectado.cantidad} GC cada ${g.porTiempoConectado.minutos} min\n` +
    `${e} **Premio por participar en evento:** ${g.eventoParticipacion.min}–${g.eventoParticipacion.max} GC\n` +
    `${e} **Premio primer puesto (evento/torneo):** ${g.eventoPrimerPuesto.min}–${g.eventoPrimerPuesto.max} GC\n\n` +
    `_El ingreso pasivo es deliberadamente moderado para que los eventos y el comercio sigan teniendo valor durante toda la temporada._`;
  return baseEmbed(`${e} Gold Coins — cómo se consiguen`, desc);
}

// ──────────────────────────────────────────────────────────
// 3. EMBED: RECURSOS (tabla con emojis)
// ──────────────────────────────────────────────────────────
function embedRecursos() {
  const embed = baseEmbed(
    `${cfg.emojis.goldcoin} Precios de recursos`,
    'Precio de compra = siempre el doble que el de venta. Límite diario por jugador.'
  );

  for (const r of cfg.recursos) {
    const e = cfg.emojis[r.emojiKey] || '';
    embed.addFields({
      name: `${e} ${r.nombre}`,
      value: `Vende: \`${r.venta}\`\nCompra: \`${r.compra}\`\nLímite: \`${r.limiteDiario}\``,
      inline: true,
    });
  }
  return embed;
}

// ──────────────────────────────────────────────────────────
// 4. EMBEDS: DINOS (uno por categoría, o todos en uno compacto)
// ──────────────────────────────────────────────────────────
function embedDinosResumen() {
  const e = cfg.emojis.goldcoin;
  const embed = baseEmbed(`${e} Tienda de criaturas — resumen de precios`);
  for (const cat of cfg.dinosCategorias) {
    embed.addFields({
      name: cat.titulo,
      value: `**${cat.precio} GC**${cat.nota ? `\n_${cat.nota}_` : ''}`,
      inline: true,
    });
  }
  return embed;
}

function embedDinosCategoria(nombreCategoria) {
  const cat = cfg.dinosCategorias.find(c =>
    c.titulo.toLowerCase().includes(nombreCategoria.toLowerCase())
  );
  if (!cat) return null;

  const e = cfg.emojis.goldcoin;
  const desc = `**Precio: ${cat.precio} ${e} GC** (nivel 150)\n\n` +
    cat.lista.map(d => `• ${d}`).join('\n') +
    (cat.nota ? `\n\n⚠️ ${cat.nota}` : '');

  return baseEmbed(cat.titulo, desc);
}

// ──────────────────────────────────────────────────────────
// 5. EMBEDS: EQUIPAMIENTO
// ──────────────────────────────────────────────────────────
function embedEquipoCategoria(nombreCategoria) {
  const cat = cfg.equipoCategorias.find(c =>
    c.titulo.toLowerCase().includes(nombreCategoria.toLowerCase())
  );
  if (!cat) return null;

  const e = cfg.emojis.goldcoin;
  const desc = cat.lista.map(item => {
    const precio = typeof item.precio === 'number' ? `${item.precio} ${e}` : item.precio;
    return `**${item.nombre}** — ${precio}`;
  }).join('\n');

  return baseEmbed(cat.titulo, desc);
}

function embedEquipoResumen() {
  const embed = baseEmbed('🛒 Tienda de equipamiento — categorías');
  for (const cat of cfg.equipoCategorias) {
    embed.addFields({ name: cat.titulo, value: `${cat.lista.length} objetos disponibles`, inline: true });
  }
  return embed;
}

// ──────────────────────────────────────────────────────────
// 6. EMBED: PUESTOS DE MERCADO
// ──────────────────────────────────────────────────────────
function embedPuestosMercado() {
  const embed = baseEmbed('🏪 Alquiler de puestos del mercado', 'Alquila tu puesto para vender recursos, objetos o dinos a otros jugadores.');
  for (const p of cfg.puestosMercado) {
    embed.addFields({ name: `${p.nombre} — ${p.precio}`, value: p.detalle, inline: false });
  }
  return embed;
}

// ──────────────────────────────────────────────────────────
// 7. EMBED: REGLAS GENERALES
// ──────────────────────────────────────────────────────────
function embedReglas() {
  const desc = cfg.reglas.map((r, i) => `**${i + 1}.** ${r}`).join('\n\n');
  return baseEmbed('📜 Reglas económicas generales', desc);
}

module.exports = {
  embedMultiplicadores,
  embedGoldCoins,
  embedRecursos,
  embedDinosResumen,
  embedDinosCategoria,
  embedEquipoResumen,
  embedEquipoCategoria,
  embedPuestosMercado,
  embedReglas,
};
