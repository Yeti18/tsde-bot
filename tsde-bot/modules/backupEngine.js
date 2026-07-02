const fs = require('fs');
const path = require('path');

const DB_JSON = './database.json';
const DB_SQLITE = './tsde.db';
const BACKUP_DIR = './backups';
const MAX_BACKUPS = 7;

function asegurarDirectorioBackup() {
    if (!fs.existsSync(BACKUP_DIR)) {
        fs.mkdirSync(BACKUP_DIR, { recursive: true });
        console.log('[BAK] Directorio de backups creado');
    }
}

function hacerBackup() {
    try {
        asegurarDirectorioBackup();

        const ahora = new Date();
        const fecha = ahora.toISOString()
            .replace(/T/, '_')
            .replace(/:/g, '-')
            .split('.')[0];

        // Backup SQLite (archivo principal)
        if (fs.existsSync(DB_SQLITE)) {
            const nombreSQLite = `tsde_${fecha}.db`;
            fs.copyFileSync(DB_SQLITE, path.join(BACKUP_DIR, nombreSQLite));
            console.log(`[BAK] ✅ Backup SQLite creado: ${nombreSQLite}`);
        }

        // Backup JSON (por compatibilidad mientras exista)
        if (fs.existsSync(DB_JSON)) {
            const nombreJSON = `database_${fecha}.json`;
            fs.copyFileSync(DB_JSON, path.join(BACKUP_DIR, nombreJSON));
        }

        limpiarBackupsAntiguos();
        return fecha;
    } catch (e) {
        console.error('[BAK] ❌ Error haciendo backup:', e.message);
        return null;
    }
}

function limpiarBackupsAntiguos() {
    try {
        // Limpiar backups SQLite
        const archivosSQLite = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.startsWith('tsde_') && f.endsWith('.db'))
            .map(f => ({ nombre: f, ruta: path.join(BACKUP_DIR, f), fecha: fs.statSync(path.join(BACKUP_DIR, f)).mtime }))
            .sort((a, b) => b.fecha - a.fecha);

        if (archivosSQLite.length > MAX_BACKUPS) {
            archivosSQLite.slice(MAX_BACKUPS).forEach(archivo => {
                fs.unlinkSync(archivo.ruta);
                console.log(`[BAK] 🗑️ Backup antiguo eliminado: ${archivo.nombre}`);
            });
        }

        // Limpiar backups JSON
        const archivosJSON = fs.readdirSync(BACKUP_DIR)
            .filter(f => f.startsWith('database_') && f.endsWith('.json'))
            .map(f => ({ nombre: f, ruta: path.join(BACKUP_DIR, f), fecha: fs.statSync(path.join(BACKUP_DIR, f)).mtime }))
            .sort((a, b) => b.fecha - a.fecha);

        if (archivosJSON.length > MAX_BACKUPS) {
            archivosJSON.slice(MAX_BACKUPS).forEach(archivo => {
                fs.unlinkSync(archivo.ruta);
            });
        }
    } catch (e) {
        console.error('[BAK] Error limpiando backups antiguos:', e.message);
    }
}

function listarBackups() {
    try {
        asegurarDirectorioBackup();
        return fs.readdirSync(BACKUP_DIR)
            .filter(f => f.startsWith('database_') && f.endsWith('.json'))
            .map(f => ({
                nombre: f,
                ruta: path.join(BACKUP_DIR, f),
                tamaño: (fs.statSync(path.join(BACKUP_DIR, f)).size / 1024).toFixed(1) + ' KB',
                fecha: fs.statSync(path.join(BACKUP_DIR, f)).mtime
            }))
            .sort((a, b) => b.fecha - a.fecha);
    } catch (e) {
        return [];
    }
}

function restaurarBackup(nombreArchivo) {
    try {
        const rutaOrigen = path.join(BACKUP_DIR, nombreArchivo);
        if (!fs.existsSync(rutaOrigen)) return false;

        // Hacer backup del estado actual antes de restaurar
        hacerBackup();

        fs.copyFileSync(rutaOrigen, DB_PATH);
        console.log(`[BAK] ✅ Base de datos restaurada desde: ${nombreArchivo}`);
        return true;
    } catch (e) {
        console.error('[BAK] Error restaurando backup:', e.message);
        return false;
    }
}

function iniciarBackupAutomatico(client) {
    // Backup inmediato al arrancar
    hacerBackup();

    // Backup cada 6 horas
    setInterval(() => {
        hacerBackup();
    }, 6 * 60 * 60 * 1000);

    console.log('[BAK] Sistema de backup automático iniciado (cada 6 horas)');
}

module.exports = {
    hacerBackup,
    listarBackups,
    restaurarBackup,
    iniciarBackupAutomatico
};
