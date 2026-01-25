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

// ============================================
// END OF DAY STOCK APPROVAL
// ============================================

import pool from '../config/db.js';

// Get all pending end-of-day requests
export const getPendingEndOfDayRequests = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT 
        r.id,
        r.request_date,
        r.status,
        r.created_at,
        u.id as salesperson_id,
        u.name as salesperson_name,
        u.username as salesperson_username,
        COUNT(i.id) as items_count,
        SUM(i.remaining_quantity) as total_quantity
       FROM end_of_day_stock_requests r
       JOIN users u ON r.salesperson_id = u.id
       LEFT JOIN end_of_day_stock_items i ON r.id = i.request_id
       WHERE r.status = 'pending'
       GROUP BY r.id, r.request_date, r.status, r.created_at, u.id, u.name, u.username
       ORDER BY r.request_date DESC, r.created_at DESC`
    );
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
};

// Get end-of-day request details (admin)
export const getEndOfDayRequestDetailsAdmin = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const requestResult = await pool.query(
      `SELECT r.*, u.name as salesperson_name, u.username as salesperson_username
       FROM end_of_day_stock_requests r
       JOIN users u ON r.salesperson_id = u.id
       WHERE r.id = $1`,
      [id]
    );
    
    if (requestResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Request not found'
      });
    }
    
    const itemsResult = await pool.query(
      `SELECT * FROM end_of_day_stock_items WHERE request_id = $1 ORDER BY product_name`,
      [id]
    );
    
    res.json({
      success: true,
      data: {
        ...requestResult.rows[0],
        items: itemsResult.rows
      }
    });
  } catch (error) {
    next(error);
  }
};

// Approve end-of-day request
export const approveEndOfDayRequest = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const adminId = req.user.userId;
    const { notes } = req.body || {};
    
    await client.query('BEGIN');
    
    // Get request
    const requestResult = await client.query(
      `SELECT * FROM end_of_day_stock_requests WHERE id = $1 AND status = 'pending' FOR UPDATE`,
      [id]
    );
    
    if (requestResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({
        success: false,
        message: 'Request not found or already processed'
      });
    }
    
    const request = requestResult.rows[0];
    
    // Get items
    const itemsResult = await client.query(
      `SELECT * FROM end_of_day_stock_items WHERE request_id = $1`,
      [id]
    );
    
    // Update inventory for each item
    for (const item of itemsResult.rows) {
      // Find finished goods inventory item
      const invResult = await client.query(
        `SELECT i.id 
         FROM inventory_items i
         JOIN inventory_categories c ON i.category_id = c.id
         WHERE i.name = $1 AND c.name = 'Finished Goods'
         LIMIT 1`,
        [item.product_name]
      );
      
      if (invResult.rows.length > 0) {
        const invId = invResult.rows[0].id;
        const remainingQty = parseFloat(item.remaining_quantity || 0);
        
        // Add to inventory
        await client.query(
          `UPDATE inventory_items 
           SET quantity = quantity + $1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [remainingQty, invId]
        );
        
        // Create inventory batch entry
        const batchNumber = `EOD-${request.request_date.replace(/-/g, '')}-${request.salesperson_id.substring(0, 8)}`;
        await client.query(
          `INSERT INTO inventory_batches (
            inventory_item_id, production_id, batch_number, quantity, 
            production_date, status
          )
          VALUES ($1, NULL, $2, $3, $4, 'available')
          ON CONFLICT (inventory_item_id, batch_number) 
          DO UPDATE SET
            quantity = inventory_batches.quantity + EXCLUDED.quantity,
            status = 'available',
            updated_at = CURRENT_TIMESTAMP`,
          [invId, batchNumber, remainingQty, request.request_date]
        );
      }
    }
    
    // Mark allocations as completed (they've been returned to inventory)
    await client.query(
      `UPDATE salesperson_allocations 
       SET status = 'completed',
           updated_at = CURRENT_TIMESTAMP
       WHERE salesperson_id = $1 
         AND allocation_date = $2
         AND status = 'active'`,
      [request.salesperson_id, request.request_date]
    );
    
    // Update request status
    await client.query(
      `UPDATE end_of_day_stock_requests 
       SET status = 'approved',
           approved_by = $1,
           approved_at = CURRENT_TIMESTAMP,
           notes = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3`,
      [adminId, notes || null, id]
    );
    
    await client.query('COMMIT');
    
    res.json({
      success: true,
      message: 'End-of-day request approved and stock updated successfully'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error approving end-of-day request:', error);
    next(error);
  } finally {
    client.release();
  }
};

// Reject end-of-day request
export const rejectEndOfDayRequest = async (req, res, next) => {
  try {
    const { id } = req.params;
    const adminId = req.user.userId;
    const { notes } = req.body || {};
    
    const result = await pool.query(
      `UPDATE end_of_day_stock_requests 
       SET status = 'rejected',
           approved_by = $1,
           approved_at = CURRENT_TIMESTAMP,
           notes = $2,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = $3 AND status = 'pending'
       RETURNING *`,
      [adminId, notes || null, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Request not found or already processed'
      });
    }
    
    res.json({
      success: true,
      message: 'End-of-day request rejected',
      data: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
};


