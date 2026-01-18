import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import seedData from '../utils/seed.js';

const DEFAULT_CONTAINER = process.env.PG_DOCKER_CONTAINER || 'yogurt-postgres';
const DEFAULT_DB = process.env.PG_DATABASE || 'yogurt_erp';
const DEFAULT_USER = process.env.PG_USER || 'postgres';

// Simple in-process mutex to avoid concurrent destructive operations
let maintenanceLock = false;

function withMaintenanceLock(fn) {
  return async (...args) => {
    if (maintenanceLock) {
      const res = args[1];
      return res.status(409).json({ success: false, message: 'A maintenance operation is already running. Please try again in a minute.' });
    }
    maintenanceLock = true;
    try {
      return await fn(...args);
    } finally {
      maintenanceLock = false;
    }
  };
}

function runDocker(args, { inputStream } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';

    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    child.on('error', (err) => reject(err));

    child.on('close', (code) => {
      if (code === 0) return resolve({ stderr });
      reject(new Error(stderr || `docker ${args.join(' ')} failed with exit code ${code}`));
    });

    if (inputStream) {
      inputStream.pipe(child.stdin);
    } else {
      child.stdin.end();
    }
  });
}

async function psqlExec(sql) {
  const args = ['exec', '-i', DEFAULT_CONTAINER, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', DEFAULT_USER, '-d', DEFAULT_DB, '-c', sql];
  await runDocker(args);
}

async function psqlFileFromPath(filePath) {
  const rs = fs.createReadStream(filePath);
  const args = ['exec', '-i', DEFAULT_CONTAINER, 'psql', '-v', 'ON_ERROR_STOP=1', '-U', DEFAULT_USER, '-d', DEFAULT_DB];
  await runDocker(args, { inputStream: rs });
}

function safeStamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function projectPaths() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const backendRoot = path.resolve(__dirname, '..'); // backend/src
  const projectRoot = path.resolve(backendRoot, '..'); // backend/
  const repoRoot = path.resolve(projectRoot, '..'); // repo root
  return {
    repoRoot,
    schemaFile: path.join(projectRoot, 'database', 'schema.sql'),
    migrationsDir: path.join(projectRoot, 'database', 'migrations')
  };
}

async function resetDbToFresh() {
  const { schemaFile, migrationsDir } = projectPaths();

  // Wipe and recreate public schema
  await psqlExec('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');

  // Base schema
  if (!fs.existsSync(schemaFile)) throw new Error(`Missing schema file: ${schemaFile}`);
  await psqlFileFromPath(schemaFile);

  // Apply all migrations (sorted) on a fresh DB
  if (fs.existsSync(migrationsDir)) {
    const files = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.toLowerCase().endsWith('.sql'))
      .sort();
    for (const f of files) {
      await psqlFileFromPath(path.join(migrationsDir, f));
    }
  }

  // Seed default users
  await seedData();
}

export const downloadBackup = withMaintenanceLock(async (req, res) => {
  try {
    const fileName = `yogurt_erp_backup_${safeStamp()}.sql`;
    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    const args = ['exec', DEFAULT_CONTAINER, 'pg_dump', '-U', DEFAULT_USER, '-d', DEFAULT_DB, '--no-owner', '--no-privileges'];
    const child = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stderr = '';
    child.stderr.on('data', (d) => (stderr += d.toString()));
    child.on('error', (err) => {
      console.error('Backup spawn error:', err);
      try {
        res.destroy();
      } catch {
        // ignore
      }
    });

    child.stdout.pipe(res);

    child.on('close', (code) => {
      if (code !== 0) {
        // If dump fails mid-stream, we can't send JSON safely; just end.
        console.error('Backup failed:', stderr);
        try {
          res.destroy();
        } catch {
          // ignore
        }
      }
    });
  } catch (err) {
    // If headers already sent, just kill stream.
    try {
      res.destroy();
    } catch {
      // ignore
    }
  }
});

export const restoreFromBackup = withMaintenanceLock(async (req, res, next) => {
  const file = req.file;
  if (!file) return res.status(400).json({ success: false, message: 'Backup file is required' });

  try {
    // Wipe schema first, then restore SQL
    await psqlExec('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    await psqlFileFromPath(file.path);

    // Ensure default users exist (restore might be missing them / or admin forgot credentials)
    await seedData();

    return res.json({ success: true, message: 'Restore completed. Please refresh the app.' });
  } catch (err) {
    next(err);
  } finally {
    try {
      fs.unlinkSync(file.path);
    } catch {
      // ignore
    }
  }
});

export const resetSystem = withMaintenanceLock(async (req, res, next) => {
  const { confirm } = req.body || {};
  if (String(confirm || '').toUpperCase() !== 'RESET') {
    return res.status(400).json({ success: false, message: 'Confirmation required. Send { confirm: \"RESET\" }' });
  }

  try {
    await resetDbToFresh();
    return res.json({ success: true, message: 'System reset completed. Default users recreated. Please refresh the app and login again.' });
  } catch (err) {
    next(err);
  }
});


