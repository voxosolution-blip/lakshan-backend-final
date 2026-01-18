// Worker Controller
import pool from '../config/db.js';

// Get all workers with today's attendance
export const getAllWorkersWithTodayAttendance = async (req, res, next) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    
    const result = await pool.query(`
      SELECT 
        w.id,
        w.name,
        w.phone,
        w.address,
        w.epf_number,
        w.etf_number,
        w.daily_salary,
        w.main_salary,
        w.monthly_bonus,
        w.late_hour_rate,
        w.epf_percentage,
        w.etf_percentage,
        w.job_role,
        w.is_active,
        COALESCE(wa.present, false) as today_present,
        COALESCE(wa.late_hours, 0) as today_late_hours
      FROM workers w
      LEFT JOIN worker_attendance wa ON w.id = wa.worker_id AND wa.date = $1
      WHERE w.is_active = true
      ORDER BY w.name
    `, [today]);
    
    res.json({ success: true, data: result.rows });
  } catch (error) {
    console.error('Error getting workers with today attendance:', error);
    next(error);
  }
};

// Get all workers (simple list)
export const getAllWorkers = async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, name, phone, address, epf_number, etf_number, daily_salary, main_salary, monthly_bonus, late_hour_rate, epf_percentage, etf_percentage, job_role, is_active 
       FROM workers 
       WHERE is_active = true 
       ORDER BY name`
    );
    res.json({ success: true, data: result.rows });
  } catch (error) {
    next(error);
  }
};

// Get single worker
export const getWorkerById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM workers WHERE id = $1', [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Worker not found' });
    }
    
    res.json({ success: true, data: result.rows[0] });
  } catch (error) {
    next(error);
  }
};

// Create worker
export const createWorker = async (req, res, next) => {
  try {
    const { name, phone, address, epf_number, etf_number, daily_salary, epf_percentage, etf_percentage, job_role } = req.body;
    
    if (!name) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }
    
    // Get default settings if not provided
    let finalDailySalary = parseFloat(daily_salary) || 0;
    let finalEPFPercentage = parseFloat(epf_percentage) || 8.00;
    let finalETFPercentage = parseFloat(etf_percentage) || 3.00;
    
    if (!finalDailySalary || finalDailySalary <= 0) {
      // Try to get from settings
      const settingsResult = await pool.query(
        `SELECT value FROM settings WHERE key = 'worker_default_daily_salary' LIMIT 1`
      );
      if (settingsResult.rows.length > 0) {
        finalDailySalary = parseFloat(settingsResult.rows[0].value) || 0;
      }
      
      if (!finalDailySalary || finalDailySalary <= 0) {
        return res.status(400).json({ success: false, message: 'Daily salary is required. Please set default daily salary in Worker Settings first.' });
      }
    }
    
    // Get EPF/ETF from settings if not provided
    if (!epf_percentage) {
      const epfResult = await pool.query(
        `SELECT value FROM settings WHERE key = 'worker_default_epf_percentage' LIMIT 1`
      );
      if (epfResult.rows.length > 0) {
        finalEPFPercentage = parseFloat(epfResult.rows[0].value) || 8.00;
      }
    }
    
    if (!etf_percentage) {
      const etfResult = await pool.query(
        `SELECT value FROM settings WHERE key = 'worker_default_etf_percentage' LIMIT 1`
      );
      if (etfResult.rows.length > 0) {
        finalETFPercentage = parseFloat(etfResult.rows[0].value) || 3.00;
      }
    }
    
    // Calculate main_salary from daily_salary (assuming 26 working days for backward compatibility)
    const main_salary = finalDailySalary * 26;
    
    const result = await pool.query(
      `INSERT INTO workers (name, phone, address, epf_number, etf_number, daily_salary, main_salary, epf_percentage, etf_percentage, job_role)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [name, phone || null, address || null, epf_number || null, etf_number || null, 
       finalDailySalary, main_salary,
       finalEPFPercentage, finalETFPercentage, job_role || null]
    );
    
    res.status(201).json({ success: true, data: result.rows[0], message: 'Worker created successfully' });
  } catch (error) {
    next(error);
  }
};

// Update worker
export const updateWorker = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, phone, address, epf_number, etf_number, daily_salary, epf_percentage, etf_percentage, job_role } = req.body;
    
    // Build dynamic update query
    const updates = [];
    const values = [];
    let paramCount = 1;
    
    if (name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      values.push(name);
    }
    if (phone !== undefined) {
      updates.push(`phone = $${paramCount++}`);
      values.push(phone || null);
    }
    if (address !== undefined) {
      updates.push(`address = $${paramCount++}`);
      values.push(address || null);
    }
    if (epf_number !== undefined) {
      updates.push(`epf_number = $${paramCount++}`);
      values.push(epf_number || null);
    }
    if (etf_number !== undefined) {
      updates.push(`etf_number = $${paramCount++}`);
      values.push(etf_number || null);
    }
    if (daily_salary !== undefined) {
      const main_salary = parseFloat(daily_salary) * 26;
      updates.push(`daily_salary = $${paramCount++}`);
      updates.push(`main_salary = $${paramCount++}`);
      values.push(parseFloat(daily_salary));
      values.push(main_salary);
    }
    if (epf_percentage !== undefined) {
      updates.push(`epf_percentage = $${paramCount++}`);
      values.push(parseFloat(epf_percentage));
    }
    if (etf_percentage !== undefined) {
      updates.push(`etf_percentage = $${paramCount++}`);
      values.push(parseFloat(etf_percentage));
    }
    if (job_role !== undefined) {
      updates.push(`job_role = $${paramCount++}`);
      values.push(job_role || null);
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ success: false, message: 'No fields to update' });
    }
    
    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    values.push(id);
    
    const result = await pool.query(
      `UPDATE workers 
       SET ${updates.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      values
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Worker not found' });
    }
    
    res.json({ success: true, data: result.rows[0], message: 'Worker updated successfully' });
  } catch (error) {
    next(error);
  }
};

// Delete worker (soft delete)
export const deleteWorker = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await pool.query(
      'UPDATE workers SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *',
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Worker not found' });
    }
    
    res.json({ success: true, message: 'Worker deactivated successfully' });
  } catch (error) {
    next(error);
  }
};

// Add attendance
export const addAttendance = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { workerId, date, present, late_hours, notes } = req.body;
    const attendanceDate = date || new Date().toISOString().split('T')[0];
    
    const result = await client.query(
      `INSERT INTO worker_attendance (worker_id, date, present, late_hours, notes)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (worker_id, date) 
       DO UPDATE SET present = EXCLUDED.present, late_hours = EXCLUDED.late_hours, notes = EXCLUDED.notes, updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [workerId, attendanceDate, present !== false, parseFloat(late_hours || 0), notes || null]
    );
    
    res.status(201).json({ success: true, data: result.rows[0], message: 'Attendance recorded successfully' });
  } catch (error) {
    next(error);
  } finally {
    client.release();
  }
};

// Get worker monthly report
export const getWorkerMonthlyReport = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { year, month } = req.query;
    
    // Get worker details
    const workerResult = await pool.query('SELECT * FROM workers WHERE id = $1', [id]);
    if (workerResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Worker not found' });
    }
    const worker = workerResult.rows[0];
    
    // Determine date range
    const now = new Date();
    const targetYear = year ? parseInt(year) : now.getFullYear();
    const targetMonth = month ? parseInt(month) : now.getMonth() + 1;
    
    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0);
    
    // Format dates for query
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    
    // Get attendance for the month
    const attendanceResult = await pool.query(`
      SELECT id, date, present, late_hours, notes, created_at
      FROM worker_attendance
      WHERE worker_id = $1 
        AND date >= $2 
        AND date <= $3
      ORDER BY date ASC
    `, [id, startDateStr, endDateStr]);
    
    // Calculate totals from attendance
    const daysPresent = attendanceResult.rows.filter(row => row.present).length;
    const totalLateHours = attendanceResult.rows.reduce((sum, row) => 
      sum + parseFloat(row.late_hours || 0), 0
    );
    
    // Check if there's a generated payroll for this month (to get working days if no attendance)
    const payrollResult = await pool.query(`
      SELECT working_days, daily_salary, main_salary, monthly_bonus, late_bonus, 
             advance_amount, epf_amount, etf_amount, gross_salary, total_deductions, net_pay
      FROM payroll
      WHERE worker_id = $1 AND year = $2 AND month = $3
    `, [id, targetYear, targetMonth]);
    const existingPayroll = payrollResult.rows[0] || null;
    
    // Get advances for the month
    const advancesResult = await pool.query(`
      SELECT id, amount, payment_date, time, notes
      FROM worker_advances
      WHERE worker_id = $1 AND year = $2 AND month = $3
      ORDER BY payment_date ASC, time ASC
    `, [id, targetYear, targetMonth]);
    
    const totalAdvance = advancesResult.rows.reduce((sum, row) => 
      sum + parseFloat(row.amount || 0), 0
    );
    
    // Get salary bonus for the month
    const bonusResult = await pool.query(`
      SELECT monthly_bonus, late_bonus
      FROM salary_bonus
      WHERE worker_id = $1 AND year = $2 AND month = $3
    `, [id, targetYear, targetMonth]);
    
    const monthlyBonus = bonusResult.rows.length > 0 ? parseFloat(bonusResult.rows[0].monthly_bonus || 0) : 0;
    const lateBonus = bonusResult.rows.length > 0 ? parseFloat(bonusResult.rows[0].late_bonus || 0) : 0;
    
    // Get free products for the month (if missing, fall back to global defaults from settings)
    let freeProductsRows = [];
    const freeProductsResult = await pool.query(
      `SELECT wfp.id, wfp.quantity, wfp.unit, wfp.notes,
              wfp.inventory_item_id, wfp.product_id,
              COALESCE(ii.name, p.name) as product_name
       FROM worker_free_products wfp
       LEFT JOIN inventory_items ii ON wfp.inventory_item_id = ii.id
       LEFT JOIN products p ON wfp.product_id = p.id
       WHERE wfp.worker_id = $1 AND wfp.year = $2 AND wfp.month = $3
       ORDER BY wfp.created_at ASC`,
      [id, targetYear, targetMonth]
    );
    freeProductsRows = freeProductsResult.rows || [];

    if (freeProductsRows.length === 0) {
      // Load defaults from settings: worker_default_free_products = JSON array [{productId, quantity, unit}]
      const defaultsRes = await pool.query(`SELECT value FROM settings WHERE key='worker_default_free_products' LIMIT 1`);
      const raw = defaultsRes.rows[0]?.value;
      try {
        const parsed = raw ? JSON.parse(raw) : [];
        if (Array.isArray(parsed) && parsed.length > 0) {
          const ids = parsed.map((x) => x?.productId).filter(Boolean);
          const prodRes =
            ids.length > 0
              ? await pool.query(`SELECT id, name FROM products WHERE id = ANY($1)`, [ids])
              : { rows: [] };
          const nameById = new Map(prodRes.rows.map((r) => [r.id, r.name]));

          freeProductsRows = parsed
            .filter((x) => x?.productId && parseFloat(x?.quantity || 0) > 0)
            .map((x) => ({
              id: null,
              inventory_item_id: null,
              product_id: x.productId,
              product_name: nameById.get(x.productId) || null,
              quantity: x.quantity,
              unit: x.unit || 'piece',
              notes: null
            }));
        }
      } catch {
        // ignore invalid JSON
      }
    }
    
    // Calculate salary components (NEW PROFESSIONAL FORMULA)
    const dailySalary = parseFloat(worker.daily_salary || worker.main_salary / 26 || 0);
    
    // Use working days from: 1) attendance records, 2) existing payroll, 3) default to 0
    const workingDays = daysPresent > 0 ? daysPresent : (existingPayroll?.working_days || 0);
    const mainSalary = dailySalary * workingDays;
    const grossSalary = mainSalary + monthlyBonus + lateBonus;
    
    // EPF and ETF calculations
    const epfPercentage = parseFloat(worker.epf_percentage || 8.00);
    const etfPercentage = parseFloat(worker.etf_percentage || 3.00);
    const epfAmount = grossSalary * (epfPercentage / 100);
    const etfAmount = grossSalary * (etfPercentage / 100);
    const totalDeductions = totalAdvance + epfAmount + etfAmount;
    const netPay = grossSalary - totalDeductions;
    
    res.json({
      success: true,
      data: {
        worker: {
          id: worker.id,
          name: worker.name,
          phone: worker.phone,
          address: worker.address,
          epf_number: worker.epf_number,
          etf_number: worker.etf_number,
          daily_salary: dailySalary,
          epf_percentage: epfPercentage,
          etf_percentage: etfPercentage,
          job_role: worker.job_role
        },
        period: {
          year: targetYear,
          month: targetMonth,
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0]
        },
        attendance: attendanceResult.rows.map(row => ({
          id: row.id,
          date: row.date,
          present: row.present,
          lateHours: parseFloat(row.late_hours || 0),
          late_hours: parseFloat(row.late_hours || 0),
          notes: row.notes,
          createdAt: row.created_at
        })),
        summary: {
          workingDays: workingDays,
          daysPresent: daysPresent,
          totalLateHours: totalLateHours,
          dailySalary: dailySalary,
          mainSalary: mainSalary,
          monthlyBonus: monthlyBonus,
          lateBonus: lateBonus,
          grossSalary: grossSalary,
          totalAdvance: totalAdvance,
          epfAmount: epfAmount,
          etfAmount: etfAmount,
          totalDeductions: totalDeductions,
          netPay: netPay
        },
        advances: advancesResult.rows.map(row => ({
          id: row.id,
          amount: parseFloat(row.amount || 0),
          paymentDate: row.payment_date,
          time: row.time,
          notes: row.notes
        })),
        freeProducts: (freeProductsRows || []).map((row) => ({
          id: row.id,
          inventoryItemId: row.inventory_item_id,
          productId: row.product_id,
          productName: row.product_name,
          quantity: parseFloat(row.quantity || 0),
          unit: row.unit,
          notes: row.notes
        }))
      }
    });
  } catch (error) {
    console.error('Error getting worker monthly report:', error);
    next(error);
  }
};

// Add advance payment
export const addAdvance = async (req, res, next) => {
  try {
    const { workerId, month, year, amount, payment_date, time, notes } = req.body;
    const userId = req.user?.userId;
    
    if (!workerId || !month || !year || !amount) {
      return res.status(400).json({ success: false, message: 'Worker ID, month, year, and amount are required' });
    }
    
    const result = await pool.query(
      `INSERT INTO worker_advances (worker_id, month, year, amount, payment_date, time, notes)
       VALUES ($1, $2, $3, $4, COALESCE($5::date, CURRENT_DATE), COALESCE($6::time, CURRENT_TIME), $7)
       RETURNING *`,
      [workerId, parseInt(month), parseInt(year), parseFloat(amount), 
       payment_date || new Date().toISOString().split('T')[0], 
       time || new Date().toTimeString().split(' ')[0].substring(0, 5),
       notes || null]
    );
    
    res.status(201).json({ success: true, data: result.rows[0], message: 'Advance payment recorded successfully' });
  } catch (error) {
    console.error('Error adding advance:', error);
    next(error);
  }
};

// Add or update salary bonus
export const addSalaryBonus = async (req, res, next) => {
  try {
    const { workerId, month, year, monthly_bonus, late_bonus, notes } = req.body;
    
    if (!workerId || !month || !year) {
      return res.status(400).json({ success: false, message: 'Worker ID, month, and year are required' });
    }
    
    const result = await pool.query(
      `INSERT INTO salary_bonus (worker_id, month, year, monthly_bonus, late_bonus, notes)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (worker_id, year, month)
       DO UPDATE SET 
         monthly_bonus = EXCLUDED.monthly_bonus,
         late_bonus = EXCLUDED.late_bonus,
         notes = EXCLUDED.notes,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [workerId, parseInt(month), parseInt(year), 
       parseFloat(monthly_bonus || 0), parseFloat(late_bonus || 0), notes || null]
    );
    
    res.status(201).json({ success: true, data: result.rows[0], message: 'Salary bonus saved successfully' });
  } catch (error) {
    console.error('Error adding salary bonus:', error);
    next(error);
  }
};

// Generate payroll for a worker (month)
export const generatePayroll = async (req, res, next) => {
  try {
    const { workerId, month, year, workingDays } = req.body;
    const userId = req.user?.userId;
    
    if (!workerId || !month || !year || workingDays === undefined) {
      return res.status(400).json({ success: false, message: 'Worker ID, month, year, and working days are required' });
    }
    
    // Get worker details
    const workerResult = await pool.query('SELECT * FROM workers WHERE id = $1', [workerId]);
    if (workerResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Worker not found' });
    }
    const worker = workerResult.rows[0];
    
    // Get advances for the month
    const advancesResult = await pool.query(`
      SELECT SUM(amount) as total
      FROM worker_advances
      WHERE worker_id = $1 AND year = $2 AND month = $3
    `, [workerId, parseInt(year), parseInt(month)]);
    const totalAdvance = parseFloat(advancesResult.rows[0]?.total || 0);
    
    // Get salary bonus
    const bonusResult = await pool.query(`
      SELECT monthly_bonus, late_bonus
      FROM salary_bonus
      WHERE worker_id = $1 AND year = $2 AND month = $3
    `, [workerId, parseInt(year), parseInt(month)]);
    const monthlyBonus = bonusResult.rows.length > 0 ? parseFloat(bonusResult.rows[0].monthly_bonus || 0) : 0;
    const lateBonus = bonusResult.rows.length > 0 ? parseFloat(bonusResult.rows[0].late_bonus || 0) : 0;
    
    // Calculate salary
    const dailySalary = parseFloat(worker.daily_salary || worker.main_salary / 26 || 0);
    const mainSalary = dailySalary * parseInt(workingDays);
    const grossSalary = mainSalary + monthlyBonus + lateBonus;
    
    // EPF and ETF
    const epfPercentage = parseFloat(worker.epf_percentage || 8.00);
    const etfPercentage = parseFloat(worker.etf_percentage || 3.00);
    const epfAmount = grossSalary * (epfPercentage / 100);
    const etfAmount = grossSalary * (etfPercentage / 100);
    const totalDeductions = totalAdvance + epfAmount + etfAmount;
    const netPay = grossSalary - totalDeductions;
    
    // Insert or update payroll
    const result = await pool.query(
      `INSERT INTO payroll (worker_id, month, year, daily_salary, working_days, main_salary, monthly_bonus, late_bonus, advance_amount, epf_amount, etf_amount, gross_salary, total_deductions, net_pay, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
       ON CONFLICT (worker_id, year, month)
       DO UPDATE SET
         daily_salary = EXCLUDED.daily_salary,
         working_days = EXCLUDED.working_days,
         main_salary = EXCLUDED.main_salary,
         monthly_bonus = EXCLUDED.monthly_bonus,
         late_bonus = EXCLUDED.late_bonus,
         advance_amount = EXCLUDED.advance_amount,
         epf_amount = EXCLUDED.epf_amount,
         etf_amount = EXCLUDED.etf_amount,
         gross_salary = EXCLUDED.gross_salary,
         total_deductions = EXCLUDED.total_deductions,
         net_pay = EXCLUDED.net_pay,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [workerId, parseInt(month), parseInt(year), dailySalary, parseInt(workingDays),
       mainSalary, monthlyBonus, lateBonus, totalAdvance, epfAmount, etfAmount,
       grossSalary, totalDeductions, netPay, userId]
    );
    
    res.status(201).json({ success: true, data: result.rows[0], message: 'Payroll generated successfully' });
  } catch (error) {
    console.error('Error generating payroll:', error);
    next(error);
  }
};

// Add free products
export const addFreeProducts = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { workerId, month, year, items } = req.body;
    
    if (!workerId || !month || !year || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Worker ID, month, year, and items are required' });
    }
    
    await client.query('BEGIN');
    
    const results = [];
    for (const item of items) {
      const { inventory_item_id, product_id, quantity, unit, notes } = item;
      
      if (!inventory_item_id && !product_id) {
        throw new Error('Either inventory_item_id or product_id is required');
      }
      
      // Insert free product
      const result = await client.query(
        `INSERT INTO worker_free_products (worker_id, month, year, inventory_item_id, product_id, quantity, unit, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING *`,
        [workerId, parseInt(month), parseInt(year), inventory_item_id || null, product_id || null, 
         parseFloat(quantity), unit || 'piece', notes || null]
      );
      
      results.push(result.rows[0]);
    }
    
    await client.query('COMMIT');
    
    res.status(201).json({ success: true, data: results, message: 'Free products recorded successfully' });
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error adding free products:', error);
    next(error);
  } finally {
    client.release();
  }
};

// Issue (deduct) worker free products for a month (idempotent: reprints won't deduct twice)
export const issueWorkerFreeProducts = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { id } = req.params; // workerId
    const { year, month } = req.body || {};
    const userId = req.user?.userId || null;

    if (!id || !year || !month) {
      return res.status(400).json({ success: false, message: 'workerId, year and month are required' });
    }

    const targetYear = parseInt(year);
    const targetMonth = parseInt(month);

    await client.query('BEGIN');

    const loadRowsForUpdate = async () => {
      return await client.query(
        `SELECT wfp.id, wfp.inventory_item_id, wfp.product_id, wfp.quantity, wfp.unit, wfp.issued_at,
                ii.name AS inventory_name,
                p.name AS product_name
         FROM worker_free_products wfp
         LEFT JOIN inventory_items ii ON ii.id = wfp.inventory_item_id
         LEFT JOIN products p ON p.id = wfp.product_id
         WHERE wfp.worker_id = $1 AND wfp.year = $2 AND wfp.month = $3
         ORDER BY wfp.created_at ASC
         FOR UPDATE OF wfp`,
        [id, targetYear, targetMonth]
      );
    };

    // If no rows exist, auto-create from global defaults (worker_default_free_products)
    let rows = await loadRowsForUpdate();
    if (rows.rows.length === 0) {
      const defaultsRes = await client.query(`SELECT value FROM settings WHERE key='worker_default_free_products' LIMIT 1`);
      const raw = defaultsRes.rows[0]?.value;
      let defaults = [];
      try {
        const parsed = raw ? JSON.parse(raw) : [];
        defaults = Array.isArray(parsed) ? parsed : [];
      } catch {
        defaults = [];
      }

      for (const item of defaults) {
        const productId = item?.productId;
        const qty = parseFloat(item?.quantity || 0);
        const unit = item?.unit || 'piece';
        if (!productId || !(qty > 0)) continue;
        await client.query(
          `INSERT INTO worker_free_products (worker_id, month, year, inventory_item_id, product_id, quantity, unit, notes)
           VALUES ($1, $2, $3, NULL, $4, $5, $6, NULL)
           RETURNING id`,
          [id, targetMonth, targetYear, productId, qty, unit]
        );
      }

      rows = await loadRowsForUpdate();
    }

    if (rows.rows.length === 0) {
      await client.query('COMMIT');
      return res.json({ success: true, data: { issued: 0, alreadyIssued: 0, deducted: [] }, message: 'No free products for this month' });
    }

    const toIssue = rows.rows.filter((r) => !r.issued_at);
    const alreadyIssued = rows.rows.length - toIssue.length;

    const deducted = [];

    for (const r of toIssue) {
      const qty = parseFloat(r.quantity || 0);
      if (!(qty > 0)) continue;

      if (r.inventory_item_id) {
        const inv = await client.query(
          `SELECT id, name, quantity
           FROM inventory_items
           WHERE id = $1
           FOR UPDATE`,
          [r.inventory_item_id]
        );
        if (inv.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: 'Inventory item not found for worker free product' });
        }
        const currentQty = parseFloat(inv.rows[0].quantity || 0);
        if (currentQty < qty) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for ${inv.rows[0].name}. Available: ${currentQty.toFixed(2)}, Required: ${qty.toFixed(2)}`
          });
        }
        await client.query(
          `UPDATE inventory_items
           SET quantity = quantity - $1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [qty, inv.rows[0].id]
        );
        deducted.push({ item: inv.rows[0].name, quantity: qty });
      } else if (r.product_id) {
        const productName = r.product_name;
        if (!productName) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: 'Product mapping missing for worker free product' });
        }
        const fg = await client.query(
          `SELECT ii.id, ii.quantity
           FROM inventory_items ii
           JOIN inventory_categories ic ON ii.category_id = ic.id
           WHERE ii.name = $1 AND ic.name ILIKE '%Finished%'
           LIMIT 1
           FOR UPDATE`,
          [productName]
        );
        if (fg.rows.length === 0) {
          await client.query('ROLLBACK');
          return res.status(400).json({ success: false, message: `Finished Goods inventory item not found for product: ${productName}` });
        }
        const currentQty = parseFloat(fg.rows[0].quantity || 0);
        if (currentQty < qty) {
          await client.query('ROLLBACK');
          return res.status(400).json({
            success: false,
            message: `Insufficient stock for ${productName}. Available: ${currentQty.toFixed(2)}, Required: ${qty.toFixed(2)}`
          });
        }
        await client.query(
          `UPDATE inventory_items
           SET quantity = quantity - $1,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = $2`,
          [qty, fg.rows[0].id]
        );
        deducted.push({ item: productName, quantity: qty });
      }

      await client.query(
        `UPDATE worker_free_products
         SET issued_at = CURRENT_TIMESTAMP,
             issued_by = $1,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = $2`,
        [userId, r.id]
      );
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      data: { issued: toIssue.length, alreadyIssued, deducted },
      message: toIssue.length > 0 ? 'Free products issued and inventory updated' : 'Free products already issued'
    });
  } catch (error) {
    await client.query('ROLLBACK');
    next(error);
  } finally {
    client.release();
  }
};
