# 🦖 TSDE Bot — Bot modular para TSDE Arkeanos

Bot de Discord para gestionar eventos, inscripciones, torneos y más en el servidor ARK: Survival Ascended de TSDE.

---

## 📂 Estructura del proyecto

```
TSDE-Bot/
├── index.js                    # Arranque del bot
├── config.json                 # Tu token y configuración
├── database.json               # Base de datos local
├── package.json                # Dependencias
├── handlers/
│   ├── commandHandler.js       # Carga comandos automáticamente
│   └── eventHandler.js         # Carga eventos automáticamente
├── events/
│   ├── ready.js                # Arranque del bot
│   └── interactionCreate.js    # Gestiona botones y comandos
├── commands/
│   ├── admin/
│   │   ├── crear-evento.js     # /crear-evento
│   │   └── penalizar.js        # /penalizar
│   └── diversion/
│       └── eventos.js          # /eventos
└── modules/
    ├── eventEngine.js          # Motor de eventos e inscripciones
    └── rconHelper.js           # Conexión RCON al servidor ARK
```

---

## ⚙️ Instalación en Replit

### 1. Crear el proyecto en Replit

1. Ve a replit.com y crea cuenta
2. New Repl → Node.js
3. Sube todos los archivos manteniendo la estructura de carpetas

### 2. Rellenar el config.json

Abre `config.json` y rellena estos campos:

```json
{
  "token": "TU_TOKEN_DE_DISCORD",
  "clientId": "ID_DE_TU_BOT",
  "guildId": "ID_DE_TU_SERVIDOR_DISCORD",
  "canales": {
    "eventos": "ID_DEL_CANAL_EVENTOS",
    "logs": "ID_DEL_CANAL_LOGS_SERVIDOR",
    "anuncios": "ID_DEL_CANAL_ANUNCIOS"
  },
  "rcon": {
    "ip": "",
    "port": 27020,
    "password": ""
  }
}
```

### 3. Cómo obtener cada dato

**Token del bot:**
1. discord.com/developers → Tu aplicación → Bot → Reset Token → Copiar

**Client ID:**
1. discord.com/developers → Tu aplicación → General Information → Application ID

**Guild ID (ID del servidor):**
1. Discord → Ajustes → Avanzado → Modo desarrollador ON
2. Clic derecho en el nombre del servidor → Copiar ID

**ID de canales:**
1. Con el modo desarrollador activado
2. Clic derecho en el canal → Copiar ID

**RCON** (rellena cuando tengas el VPS):
- ip: IP de tu servidor ARK
- port: 27020 (por defecto en ARK)
- password: la que pongas en GameUserSettings.ini

### 4. Instalar dependencias en Replit

En la consola de Replit escribe:
```
npm install
```

### 5. Arrancar el bot

```
node index.js
```

---

## 🎮 Comandos disponibles

| Comando | Quién | Función |
|---|---|---|
| `/crear-evento` | Admin | Crea un evento con inscripciones |
| `/penalizar` | Admin | Penaliza o despenaliza a un jugador |
| `/eventos` | Todos | Ver eventos activos |

---

## ➕ Añadir nuevos módulos en el futuro

Para añadir un nuevo módulo (por ejemplo el mercado):

1. Crea `modules/mercadoEngine.js`
2. Crea los comandos en `commands/admin/` o `commands/diversion/`
3. En `events/interactionCreate.js` añade:
```js
if (id.startsWith('mer_')) {
    const engine = require('../modules/mercadoEngine.js');
    return engine.handleButton(interaction, client);
}
```

El resto del bot no se toca. Nunca se rompe nada existente.

---

## 🔒 Seguridad en Replit

**IMPORTANTE:** No subas el config.json a GitHub con el token dentro.

En Replit usa **Secrets** (el candado en el menú lateral):
- Crea un secret llamado `DISCORD_TOKEN` con tu token
- En index.js el token se lee así:
```js
client.login(process.env.DISCORD_TOKEN || config.token);
```
