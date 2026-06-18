/**
 * ============================================================
 *  TSDE ARKEANOS — CONFIGURACIÓN DE ECONOMÍA
 * ============================================================
 *  Este es el ÚNICO archivo que debes editar cuando cambies
 *  un precio. Después ejecuta el comando correspondiente en
 *  Discord (ej: !economia recursos) y el embed se regenerará
 *  solo con los datos nuevos.
 *
 *  No toques economiaEmbeds.js a menos que quieras cambiar
 *  el DISEÑO de los embeds, no los precios.
 * ============================================================
 */

module.exports = {

  // ──────────────────────────────────────────────────────────
  // EMOJIS CUSTOM — sustituye el "id" por el ID real una vez
  // subas los emojis a tu servidor. Formato: <:nombre:id>
  // Puedes obtener el ID escribiendo \:nombre: en Discord
  // (con barra invertida delante) y copiando el código.
  // ──────────────────────────────────────────────────────────
  emojis: {
    goldcoin:   "<:GoldCoin:1516362698021929040>",
    wood:       "<:Wood:1516359277743312926>",
    stone:      "<:Stone:1516359038601003038>",
    flint:      "<:Flint:1516772244519391253>",
    thatch:     "<:Thatch:1516359095270248548>",
    fiber:      "<:Fiber:1516772238727184394>",
    metal:      "<:Metal:1516772246536847450>",
    crystal:    "<:Crystal:1516772046661484655>",
    obsidian:   "<:Obsidian:1516772248373952554>",
    oil:        "<:Oil:1516772249569464414> ",
    blackpearl: "<:Black_Pearl:1516772227146846280>",
    polymer:    "<:Organic_Polymer:1516772225745817722>",
    // genéricos de apoyo (opcional, si los subes)
    arrow:      "<:arrow:000000000000000000>",
    star:       "<:star:000000000000000000>",
    warning:    "<:warning:000000000000000000>",
  },

  // ──────────────────────────────────────────────────────────
  // COLOR DE LOS EMBEDS (hex). Cambia el tema visual entero.
  // ──────────────────────────────────────────────────────────
  colorEmbed: 0xD4A24C, // dorado, tono "Gold Coin"

  // ──────────────────────────────────────────────────────────
  // 1. MULTIPLICADORES (informativo, solo lectura en Discord)
  // ──────────────────────────────────────────────────────────
  multiplicadores: {
    HarvestAmountMultiplier: 3.0,
    PlayerHarvestingDamageMultiplier: 0.5,
    HarvestHealthMultiplier: 0.75,
    DinoHarvestingDamageMultiplier: 3.0,
  },

  // ──────────────────────────────────────────────────────────
  // 2. GOLD COINS — fuentes de ingreso
  // ──────────────────────────────────────────────────────────
  goldCoins: {
    porTiempoConectado: { cantidad: 15, minutos: 30 },
    eventoParticipacion: { min: 200, max: 500 },
    eventoPrimerPuesto: { min: 500, max: 1000 },
  },

  // ──────────────────────────────────────────────────────────
  // 3. RECURSOS — emojiKey debe coincidir con una key de emojis
  // ──────────────────────────────────────────────────────────
  recursos: [
    { nombre: "Madera",            emojiKey: "wood",       venta: "300u = 1 GC", compra: "300u = 2 GC", limiteDiario: "2.000u/día" },
    { nombre: "Piedra",            emojiKey: "stone",      venta: "400u = 1 GC", compra: "400u = 2 GC", limiteDiario: "2.000u/día" },
    { nombre: "Sílex",             emojiKey: "flint",      venta: "200u = 1 GC", compra: "200u = 2 GC", limiteDiario: "1.500u/día" },
    { nombre: "Paja",              emojiKey: "thatch",     venta: "300u = 1 GC", compra: "300u = 2 GC", limiteDiario: "1.500u/día" },
    { nombre: "Fibra",             emojiKey: "fiber",      venta: "300u = 1 GC", compra: "300u = 2 GC", limiteDiario: "1.500u/día" },
    { nombre: "Metal",             emojiKey: "metal",      venta: "80u = 1 GC",  compra: "80u = 2 GC",  limiteDiario: "800u/día" },
    { nombre: "Cristal",           emojiKey: "crystal",    venta: "20u = 1 GC",  compra: "20u = 2 GC",  limiteDiario: "300u/día" },
    { nombre: "Obsidiana",         emojiKey: "obsidian",   venta: "20u = 1 GC",  compra: "20u = 2 GC",  limiteDiario: "300u/día" },
    { nombre: "Aceite",            emojiKey: "oil",        venta: "8u = 1 GC",   compra: "8u = 2 GC",   limiteDiario: "150u/día" },
    { nombre: "Perlas negras",     emojiKey: "blackpearl", venta: "6u = 1 GC",   compra: "6u = 2 GC",   limiteDiario: "120u/día" },
    { nombre: "Polímero orgánico", emojiKey: "polymer",    venta: "6u = 1 GC",   compra: "6u = 2 GC",   limiteDiario: "80u/día" },
  ],

  // ──────────────────────────────────────────────────────────
  // 4. DINOS — agrupados por categoría/precio
  // ──────────────────────────────────────────────────────────
  dinosCategorias: [
    {
      titulo: "<:jerboa:1516782796465770559> Mascotas y utilidad básica",
      precio: 150,
      lista: ["Achatina", "Araña (Araneo)", "Arqueopterix", "Dilofosaurio", "Carbonemys", "Escarabajo pelotero", "Terror Bird", "Troodon", "Vulture"]
    },
    {
      titulo: "<:pteranodon:1516783883343888584> Transporte básico",
      precio: 200,
      lista: ["Pteranodon", "Raptor", "Parasaur", "Trike", "Iguanodon", "Tapejara", "Ichthyosaurus", "Mesopithecus"]
    },
    {
      titulo: "<:ankylosaurus:1516782665884500118> Farmeo esencial",
      precio: 400,
      lista: ["Ankylosaurus", "Doedicurus", "Castoroides", "Argentavis", "Mammoth", "Therizinosaurio", "Quetzal", "Brontosaurus", "Beelzebufo"]
    },
    {
      titulo: "<:allosaurus:1516787974216351764> Combate medio",
      precio: 500,
      lista: ["Carnotaurus", "Baryonyx", "Allosaurus", "Spinosaurus", "Deinonichus", "Megalodon", "Thylacoleo", "Karkinos"]
    },
    {
      titulo: "<:rockelemental:1516783136149868635> Combate alto",
      precio: 800,
      lista: ["Rex", "Yutyrannus", "Daeodon", "Megalosaurus", "Desmodus", "Tropeognathus", "Sinomacrops", "Andrewsarchus"]
    },
    {
      titulo: "<:tusoteuthis:1516787610662600865>  Especialistas",
      precio: 1000,
      lista: ["Basilosaurus", "Mosasaurus", "Tusoteuthis", "Megalania", "Bloodstalker", "Rhyniognatha", "Astrodelphis", "Fasolasuchus"]
    },
    {
      titulo: "<:managarmr:1516788686031949935> Top Tier (castrados)",
      precio: 1500,
      lista: ["Wyvern Fuego*", "Wyvern Relámpago*", "Wyvern Veneno*", "Wyvern Hielo*", "Wyvern Sangre*", "Griffon", "Managarmr"],
      nota: "*Las Wyverns se venden siempre castradas. Para criar, roba huevos en el mapa."
    },
  ],

  // ──────────────────────────────────────────────────────────
  // 5. EQUIPAMIENTO — herramientas, armas, armaduras
  // ──────────────────────────────────────────────────────────
  equipoCategorias: [
    {
      titulo: "<:Metal_Pick:1516774613089128641> Herramientas",
      lista: [
        { nombre: "Pico de metal",  precio: 15 },
        { nombre: "Hacha de metal", precio: 15 },
        { nombre: "Hoz de metal",   precio: 20 },
        { nombre: "Pico de escalada (par)", precio: 30 },
        { nombre: "Motosierra",     precio: 60 },
        { nombre: "Taladro minero", precio: 80 },
      ]
    },
    {
      titulo: "<:Sword:1516784458714579174> Armas cuerpo a cuerpo",
      lista: [
        { nombre: "Lanza de piedra", precio: 2 },
        { nombre: "Pica (Pike)",     precio: 25 },
        { nombre: "Garrote de madera", precio: 5 },
        { nombre: "Espada de metal", precio: 40 },
      ]
    },
    {
      titulo: "<:Crossbow:1516778325287370762> Armas a distancia",
      lista: [
        { nombre: "Arco de madera",      precio: 10 },
        { nombre: "Ballesta",            precio: 35 },
        { nombre: "Arco compuesto",      precio: 80 },
        { nombre: "Lanzador de arpones", precio: 50 },
        { nombre: "Bumerán",             precio: 8 },
      ]
    },
    {
      titulo: "<:Longneck_Rifle:1516786776390242364> Armas de fuego",
      lista: [
        { nombre: "Pistola simple",                  precio: 60 },
        { nombre: "Rifle de cuello largo",            precio: 90 },
        { nombre: "Escopeta",                         precio: 100 },
        { nombre: "Pistola fabricada",                precio: 70 },
        { nombre: "Escopeta de corredera",            precio: 140 },
        { nombre: "Fusil de asalto",                  precio: 180 },
        { nombre: "Fusil de francotirador fabricado", precio: 200 },
        { nombre: "Lanzallamas",                      precio: 120 },
        { nombre: "Minigun",                          precio: 300 },
      ]
    },
    {
      titulo: "<:Auto_Turret:1516785830461440092> Explosivos y torretas",
      lista: [
        { nombre: "Granada",                  precio: 15 },
        { nombre: "Granada de racimo",        precio: 30 },
        { nombre: "IED (cable trampa)",       precio: 20 },
        { nombre: "Carga C4",                 precio: 80 },
        { nombre: "Lanzacohetes",             precio: 250 },
        { nombre: "Torreta automática",       precio: 150 },
        { nombre: "Torreta automática pesada",precio: 400 },
        { nombre: "Torreta de balista",       precio: 100 },
        { nombre: "Torreta catapulta",        precio: 100 },
      ]
    },
    {
      titulo: "<:Flak_Helmet:1516790224037085315>  Sets de armadura completos",
      lista: [
        { nombre: "Tela",             precio: 5 },
        { nombre: "Cuero",            precio: 15 },
        { nombre: "Piel",             precio: 40 },
        { nombre: "Tela del desierto",precio: 45 },
        { nombre: "Ghillie",          precio: 60 },
        { nombre: "Quitina",          precio: 70 },
        { nombre: "Metal",            precio: 100 },
        { nombre: "Traje de peligro", precio: 150 },
        { nombre: "Buceo (SCUBA)",    precio: 100 },
        { nombre: "Antidisturbios",   precio: 250 },
      ]
    },
    {
      titulo: "<:Cooked_Meat_Cooked_Fish_Meat_or_:1516784749413142538> Consumibles",
      lista: [
        { nombre: "Kibble básico",            precio: "2 GC/u" },
        { nombre: "Kibble superior",          precio: "5 GC/u" },
        { nombre: "Comida cocinada",          precio: "1 GC/5u" },
        { nombre: "Antídoto contra venenos",  precio: 10 },
        { nombre: "Bioveneno / narcótico",    precio: "1 GC/10u" },
        { nombre: "Estimulante",              precio: "1 GC/3u" },
        { nombre: "Cryopod vacío",            precio: 30 },
        { nombre: "Recarga Cryopod",          precio: 5 },
      ]
    },
  ],

  // ──────────────────────────────────────────────────────────
  // 6. ALQUILER DE PUESTOS DEL MERCADO
  // ──────────────────────────────────────────────────────────
  puestosMercado: [
    { nombre: "Puesto completo",           precio: "300 <:GoldCoin:1516362698021929040> /semana", detalle: "Sin límite de categoría" },
    { nombre: "Stand de subasta",          precio: "150 <:GoldCoin:1516362698021929040> /evento", detalle: "1 lote por subasta — solo en eventos" },
  ],

  // ──────────────────────────────────────────────────────────
  // 7. REGLAS GENERALES
  // ──────────────────────────────────────────────────────────
  reglas: [
    "El precio de compra en tienda es siempre el doble que el de venta.",
    "Existen límites diarios de venta por recurso para evitar inundar el mercado.",
    "Las Wyverns de tienda se venden siempre castradas.",
    "Los dinos de evento exclusivos no se pueden comprar — solo se ganan participando.",
    "La casa de cambio permite intercambiar objetos y recursos 100% entre jugadores.",
  ],

};
