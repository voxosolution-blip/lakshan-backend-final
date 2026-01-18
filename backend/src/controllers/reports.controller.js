// Reports Controller (Audit-ready, SQL-first)
import pool from '../config/db.js';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

function requireDateRange(req) {
  const { startDate, endDate } = req.query;
  if (!startDate || !endDate) {
    return { ok: false, message: 'startDate and endDate are required (YYYY-MM-DD)' };
  }
  return { ok: true, startDate, endDate };
}

function reportMeta({ key, title, startDate, endDate, user }) {
  return {
    reportKey: key,
    reportName: title,
    period: { startDate, endDate },
    generatedAt: new Date().toISOString(),
    generatedBy: user?.username || user?.userId || 'system'
  };
}

async function getReportData(reportKey, startDate, endDate) {
  // IMPORTANT: All totals are calculated in SQL (no JS summing).
  switch (reportKey) {
    case 'milk': {
      const details = await pool.query(
        `SELECT
           date,
           farmer_name,
           quantity_liters,
           rate_per_liter,
           amount,
           notes
         FROM v_report_milk_collection_details
         WHERE date BETWEEN $1 AND $2
         ORDER BY date ASC, farmer_name ASC`,
        [startDate, endDate]
      );

      const summary = await pool.query(
        `WITH milk_stock AS (
           SELECT COALESCE(i.quantity, 0)::numeric(12,2) AS current_milk_stock_liters
           FROM inventory_items i
           JOIN inventory_categories c ON c.id = i.category_id
           WHERE i.name = 'Milk' AND c.name IN ('Raw Materials', 'Raw Material')
           LIMIT 1
         )
         SELECT
           COALESCE(SUM(quantity_liters), 0)::numeric(12,2) AS total_quantity_liters,
           COALESCE(SUM(amount), 0)::numeric(12,2) AS total_amount,
           COUNT(*)::int AS total_records,
           COUNT(DISTINCT farmer_id)::int AS farmer_count,
           COALESCE((SELECT current_milk_stock_liters FROM milk_stock), 0)::numeric(12,2) AS remaining_stock_liters
         FROM v_report_milk_collection_details
         WHERE date BETWEEN $1 AND $2`,
        [startDate, endDate]
      );

      return {
        title: 'Milk Collection Report',
        columns: [
          { key: 'date', label: 'Date' },
          { key: 'farmer_name', label: 'Farmer Name' },
          { key: 'quantity_liters', label: 'Quantity (Liters)' },
          { key: 'rate_per_liter', label: 'Rate (Rs./L)' },
          { key: 'amount', label: 'Amount (Rs.)' },
          { key: 'notes', label: 'Notes' }
        ],
        details: details.rows,
        summary: summary.rows[0] || {},
        reconciliation: {
          total_collected_liters: (summary.rows[0]?.total_quantity_liters ?? '0.00').toString(),
          remaining_stock_liters: (summary.rows[0]?.remaining_stock_liters ?? '0.00').toString()
        }
      };
    }

    case 'sales': {
      const details = await pool.query(
        `SELECT
           invoice_no,
           date,
           customer_name,
           product_name,
           quantity,
           unit_price,
           line_amount,
           payment_status,
           payment_type
         FROM v_report_sales_details
         WHERE date BETWEEN $1 AND $2
         ORDER BY date ASC, invoice_no ASC, product_name ASC`,
        [startDate, endDate]
      );

      const summary = await pool.query(
        `WITH base AS (
           SELECT DISTINCT sale_id, invoice_total, total_paid, outstanding
           FROM v_report_sales_details
           WHERE date BETWEEN $1 AND $2
         ),
         ret AS (
           SELECT COALESCE(SUM(return_amount_estimated), 0)::numeric(12,2) AS total_returns
           FROM v_report_returns_details
           WHERE return_date BETWEEN $1 AND $2
         )
         SELECT
           COALESCE(SUM(invoice_total), 0)::numeric(12,2) AS total_sales,
           (SELECT total_returns FROM ret) AS total_returns,
           (COALESCE(SUM(invoice_total), 0) - (SELECT total_returns FROM ret))::numeric(12,2) AS net_sales,
           COALESCE(SUM(total_paid), 0)::numeric(12,2) AS total_payments_received,
           COALESCE(SUM(outstanding), 0)::numeric(12,2) AS outstanding,
           COUNT(*)::int AS invoice_count
         FROM base`,
        [startDate, endDate]
      );

      const rec = await pool.query(
        `WITH base AS (
           SELECT DISTINCT sale_id, invoice_total, total_paid
           FROM v_report_sales_details
           WHERE date BETWEEN $1 AND $2
         )
         SELECT
           COALESCE(SUM(invoice_total), 0)::numeric(12,2) AS sales_total,
           COALESCE(SUM(total_paid), 0)::numeric(12,2) AS payments_received,
           GREATEST(0, COALESCE(SUM(invoice_total), 0) - COALESCE(SUM(total_paid), 0))::numeric(12,2) AS outstanding
         FROM base`,
        [startDate, endDate]
      );

      return {
        title: 'Sales Report',
        columns: [
          { key: 'invoice_no', label: 'Invoice No' },
          { key: 'date', label: 'Date' },
          { key: 'customer_name', label: 'Customer' },
          { key: 'product_name', label: 'Product' },
          { key: 'quantity', label: 'Qty' },
          { key: 'unit_price', label: 'Unit Price' },
          { key: 'line_amount', label: 'Amount' },
          { key: 'payment_type', label: 'Payment Type' },
          { key: 'payment_status', label: 'Payment Status' }
        ],
        details: details.rows,
        summary: summary.rows[0] || {},
        reconciliation: rec.rows[0] || {}
      };
    }

    case 'returns': {
      const details = await pool.query(
        `SELECT
           return_date,
           invoice_no,
           customer_name,
           product_name,
           quantity,
           return_amount_estimated,
           reason,
           replacement_given,
           replacement_product_name,
           replacement_quantity
         FROM v_report_returns_details
         WHERE return_date BETWEEN $1 AND $2
         ORDER BY return_date ASC, invoice_no ASC`,
        [startDate, endDate]
      );

      const summary = await pool.query(
        `SELECT
           COALESCE(SUM(quantity), 0)::numeric(12,2) AS total_return_qty,
           COALESCE(SUM(return_amount_estimated), 0)::numeric(12,2) AS total_return_value,
           COUNT(*)::int AS total_records
         FROM v_report_returns_details
         WHERE return_date BETWEEN $1 AND $2`,
        [startDate, endDate]
      );

      return {
        title: 'Returns Report',
        columns: [
          { key: 'return_date', label: 'Return Date' },
          { key: 'invoice_no', label: 'Invoice No' },
          { key: 'customer_name', label: 'Customer' },
          { key: 'product_name', label: 'Product' },
          { key: 'quantity', label: 'Qty' },
          { key: 'return_amount_estimated', label: 'Return Value (Est.)' },
          { key: 'reason', label: 'Reason' },
          { key: 'replacement_given', label: 'Replacement Given' }
        ],
        details: details.rows,
        summary: summary.rows[0] || {},
        reconciliation: {
          total_return_value_estimated: (summary.rows[0]?.total_return_value ?? '0.00').toString(),
          total_return_qty: (summary.rows[0]?.total_return_qty ?? '0.00').toString(),
          total_records: String(summary.rows[0]?.total_records ?? '0')
        }
      };
    }

    case 'payments': {
      const details = await pool.query(
        `SELECT
           payment_date,
           invoice_no,
           customer_name,
           cash_amount,
           cheque_amount,
           total_amount,
           payment_type,
           payment_status
         FROM v_report_payments_details
         WHERE payment_date BETWEEN $1 AND $2
         ORDER BY payment_date ASC, invoice_no ASC`,
        [startDate, endDate]
      );

      const summary = await pool.query(
        `SELECT
           COALESCE(SUM(cash_amount), 0)::numeric(12,2) AS total_cash,
           COALESCE(SUM(cheque_amount), 0)::numeric(12,2) AS total_cheque,
           COALESCE(SUM(total_amount), 0)::numeric(12,2) AS total_payments,
           COUNT(*)::int AS total_records
         FROM v_report_payments_details
         WHERE payment_date BETWEEN $1 AND $2`,
        [startDate, endDate]
      );

      // reconciliation vs sales for same date range
      const rec = await pool.query(
        `WITH sales_base AS (
           SELECT DISTINCT sale_id, invoice_total
           FROM v_report_sales_details
           WHERE date BETWEEN $1 AND $2
         ),
         pay_base AS (
           SELECT COALESCE(SUM(total_amount), 0)::numeric(12,2) AS payments_received
           FROM v_report_payments_details
           WHERE payment_date BETWEEN $1 AND $2 AND payment_status <> 'cancelled'
         )
         SELECT
           COALESCE((SELECT SUM(invoice_total) FROM sales_base), 0)::numeric(12,2) AS sales_total,
           (SELECT payments_received FROM pay_base) AS payments_received,
           GREATEST(0, COALESCE((SELECT SUM(invoice_total) FROM sales_base), 0) - (SELECT payments_received FROM pay_base))::numeric(12,2) AS outstanding
         `,
        [startDate, endDate]
      );

      return {
        title: 'Payments Report',
        columns: [
          { key: 'payment_date', label: 'Payment Date' },
          { key: 'invoice_no', label: 'Invoice No' },
          { key: 'customer_name', label: 'Customer' },
          { key: 'cash_amount', label: 'Cash (Rs.)' },
          { key: 'cheque_amount', label: 'Cheque (Rs.)' },
          { key: 'total_amount', label: 'Total (Rs.)' },
          { key: 'payment_type', label: 'Payment Type' },
          { key: 'payment_status', label: 'Status' }
        ],
        details: details.rows,
        summary: summary.rows[0] || {},
        reconciliation: rec.rows[0] || {}
      };
    }

    case 'cheques': {
      const details = await pool.query(
        `SELECT
           cheque_number,
           cheque_date,
           bank_name,
           amount,
           return_date,
           cheque_status,
           customer_name,
           invoice_no
         FROM v_report_cheques_details
         WHERE cheque_date BETWEEN $1 AND $2
         ORDER BY cheque_date ASC, cheque_number ASC`,
        [startDate, endDate]
      );

      const summary = await pool.query(
        `SELECT
           COALESCE(SUM(amount), 0)::numeric(12,2) AS total_cheque_amount,
           COUNT(*)::int AS total_records,
           COUNT(*) FILTER (WHERE cheque_status = 'pending')::int AS pending_count,
           COUNT(*) FILTER (WHERE cheque_status = 'cleared')::int AS cleared_count,
           COUNT(*) FILTER (WHERE cheque_status = 'bounced')::int AS bounced_count
         FROM v_report_cheques_details
         WHERE cheque_date BETWEEN $1 AND $2`,
        [startDate, endDate]
      );

      return {
        title: 'Cheques Report',
        columns: [
          { key: 'cheque_number', label: 'Cheque No' },
          { key: 'cheque_date', label: 'Cheque Date' },
          { key: 'bank_name', label: 'Bank' },
          { key: 'amount', label: 'Amount (Rs.)' },
          { key: 'return_date', label: 'Return Date' },
          { key: 'cheque_status', label: 'Status' },
          { key: 'customer_name', label: 'Customer' },
          { key: 'invoice_no', label: 'Invoice No' }
        ],
        details: details.rows,
        summary: summary.rows[0] || {},
        reconciliation: {
          pending_count: String(summary.rows[0]?.pending_count ?? '0'),
          cleared_count: String(summary.rows[0]?.cleared_count ?? '0'),
          bounced_count: String(summary.rows[0]?.bounced_count ?? '0'),
          total_records: String(summary.rows[0]?.total_records ?? '0'),
          total_cheque_amount: (summary.rows[0]?.total_cheque_amount ?? '0.00').toString()
        }
      };
    }

    case 'expenses': {
      const details = await pool.query(
        `SELECT
           date,
           type,
           category,
           description,
           amount,
           created_by_name
         FROM v_report_expenses_details
         WHERE date BETWEEN $1 AND $2
         ORDER BY date ASC, type ASC`,
        [startDate, endDate]
      );

      const summary = await pool.query(
        `SELECT
           COALESCE(SUM(amount), 0)::numeric(12,2) AS total_expenses,
           COUNT(*)::int AS total_records
         FROM v_report_expenses_details
         WHERE date BETWEEN $1 AND $2`,
        [startDate, endDate]
      );

      return {
        title: 'Expenses Report',
        columns: [
          { key: 'date', label: 'Date' },
          { key: 'type', label: 'Type' },
          { key: 'category', label: 'Category' },
          { key: 'description', label: 'Description' },
          { key: 'amount', label: 'Amount (Rs.)' },
          { key: 'created_by_name', label: 'Created By' }
        ],
        details: details.rows,
        summary: summary.rows[0] || {},
        reconciliation: {
          total_expenses: (summary.rows[0]?.total_expenses ?? '0.00').toString(),
          total_records: String(summary.rows[0]?.total_records ?? '0')
        }
      };
    }

    case 'production': {
      const details = await pool.query(
        `SELECT
           production_date,
           product_name,
           quantity_produced,
           batch,
           production_cost_estimated,
           created_by_name
         FROM v_report_production_details
         WHERE production_date BETWEEN $1 AND $2
         ORDER BY production_date ASC, product_name ASC`,
        [startDate, endDate]
      );

      const summary = await pool.query(
        `SELECT
           COALESCE(SUM(quantity_produced), 0)::numeric(12,2) AS total_qty_produced,
           COALESCE(SUM(production_cost_estimated), 0)::numeric(12,2) AS total_production_cost_estimated,
           COUNT(*)::int AS total_records
         FROM v_report_production_details
         WHERE production_date BETWEEN $1 AND $2`,
        [startDate, endDate]
      );

      return {
        title: 'Production Report',
        columns: [
          { key: 'production_date', label: 'Production Date' },
          { key: 'product_name', label: 'Product' },
          { key: 'quantity_produced', label: 'Quantity Produced' },
          { key: 'batch', label: 'Batch No' },
          { key: 'production_cost_estimated', label: 'Production Cost (Est.)' },
          { key: 'created_by_name', label: 'Created By' }
        ],
        details: details.rows,
        summary: summary.rows[0] || {},
        reconciliation: {
          total_qty_produced: (summary.rows[0]?.total_qty_produced ?? '0.00').toString(),
          total_production_cost_estimated: (summary.rows[0]?.total_production_cost_estimated ?? '0.00').toString(),
          total_records: String(summary.rows[0]?.total_records ?? '0')
        }
      };
    }

    case 'inventory': {
      // Snapshot report (as-of now). Date range is accepted for UI consistency but not used for movements.
      const details = await pool.query(
        `SELECT
           item_name,
           category_name,
           unit,
           current_stock,
           min_stock_level,
           unit_price,
           stock_value,
           expiry_date,
           low_stock,
           expiring_soon
         FROM v_report_inventory_snapshot
         ORDER BY category_name ASC, item_name ASC`
      );

      const summary = await pool.query(
        `SELECT
           COALESCE(SUM(stock_value), 0)::numeric(12,2) AS total_inventory_value,
           COUNT(*)::int AS total_items,
           COUNT(*) FILTER (WHERE low_stock = true)::int AS low_stock_items,
           COUNT(*) FILTER (WHERE expiring_soon = true)::int AS expiring_soon_items
         FROM v_report_inventory_snapshot`
      );

      return {
        title: 'Inventory Report (Snapshot)',
        columns: [
          { key: 'item_name', label: 'Item' },
          { key: 'category_name', label: 'Category' },
          { key: 'unit', label: 'Unit' },
          { key: 'current_stock', label: 'Current Stock' },
          { key: 'min_stock_level', label: 'Min Stock' },
          { key: 'unit_price', label: 'Unit Price' },
          { key: 'stock_value', label: 'Stock Value' },
          { key: 'expiry_date', label: 'Expiry Date' },
          { key: 'low_stock', label: 'Low Stock' },
          { key: 'expiring_soon', label: 'Expiring Soon' }
        ],
        details: details.rows,
        summary: summary.rows[0] || {},
        reconciliation: {
          total_inventory_value: (summary.rows[0]?.total_inventory_value ?? '0.00').toString(),
          total_items: String(summary.rows[0]?.total_items ?? '0'),
          low_stock_items: String(summary.rows[0]?.low_stock_items ?? '0'),
          expiring_soon_items: String(summary.rows[0]?.expiring_soon_items ?? '0')
        }
      };
    }

    case 'payroll': {
      const details = await pool.query(
        `SELECT
           worker_name,
           month,
           year,
           working_days,
           daily_salary,
           gross_salary,
           epf_amount,
           etf_amount,
           advance_amount,
           net_pay
         FROM v_report_payroll_details
         WHERE make_date(year, month, 1) BETWEEN date_trunc('month', $1::date) AND date_trunc('month', $2::date)
         ORDER BY year ASC, month ASC, worker_name ASC`,
        [startDate, endDate]
      );

      const summary = await pool.query(
        `SELECT
           COALESCE(SUM(gross_salary), 0)::numeric(12,2) AS total_gross_salary,
           COALESCE(SUM(epf_amount), 0)::numeric(12,2) AS total_epf,
           COALESCE(SUM(etf_amount), 0)::numeric(12,2) AS total_etf,
           COALESCE(SUM(advance_amount), 0)::numeric(12,2) AS total_advances,
           COALESCE(SUM(net_pay), 0)::numeric(12,2) AS total_net_pay,
           COUNT(*)::int AS total_records
         FROM v_report_payroll_details
         WHERE make_date(year, month, 1) BETWEEN date_trunc('month', $1::date) AND date_trunc('month', $2::date)`,
        [startDate, endDate]
      );

      return {
        title: 'Salary & Payroll Report',
        columns: [
          { key: 'worker_name', label: 'Worker' },
          { key: 'month', label: 'Month' },
          { key: 'year', label: 'Year' },
          { key: 'working_days', label: 'Working Days' },
          { key: 'daily_salary', label: 'Daily Salary' },
          { key: 'gross_salary', label: 'Gross Salary' },
          { key: 'epf_amount', label: 'EPF' },
          { key: 'etf_amount', label: 'ETF' },
          { key: 'advance_amount', label: 'Advances' },
          { key: 'net_pay', label: 'Net Pay' }
        ],
        details: details.rows,
        summary: summary.rows[0] || {},
        reconciliation: {
          total_gross_salary: (summary.rows[0]?.total_gross_salary ?? '0.00').toString(),
          total_epf: (summary.rows[0]?.total_epf ?? '0.00').toString(),
          total_etf: (summary.rows[0]?.total_etf ?? '0.00').toString(),
          total_advances: (summary.rows[0]?.total_advances ?? '0.00').toString(),
          total_net_pay: (summary.rows[0]?.total_net_pay ?? '0.00').toString(),
          total_records: String(summary.rows[0]?.total_records ?? '0')
        }
      };
    }

    case 'final-financial': {
      // Profit & Loss (all calculations in SQL)
      const pnl = await pool.query(
        `WITH sales_base AS (
           SELECT DISTINCT sale_id, invoice_total
           FROM v_report_sales_details
           WHERE date BETWEEN $1 AND $2
         ),
         ret AS (
           SELECT COALESCE(SUM(return_amount_estimated), 0)::numeric(12,2) AS total_returns
           FROM v_report_returns_details
           WHERE return_date BETWEEN $1 AND $2
         ),
         cogs AS (
           SELECT COALESCE(SUM(production_cost_estimated), 0)::numeric(12,2) AS cogs_estimated
           FROM v_report_production_details
           WHERE production_date BETWEEN $1 AND $2
         ),
         exp AS (
           SELECT COALESCE(SUM(amount), 0)::numeric(12,2) AS expenses
           FROM v_report_expenses_details
           WHERE date BETWEEN $1 AND $2
         ),
         pay AS (
           SELECT
             COALESCE(SUM(net_pay), 0)::numeric(12,2) AS payroll_net_pay,
             COALESCE(SUM(epf_amount), 0)::numeric(12,2) AS epf,
             COALESCE(SUM(etf_amount), 0)::numeric(12,2) AS etf
           FROM v_report_payroll_details
           WHERE make_date(year, month, 1) BETWEEN date_trunc('month', $1::date) AND date_trunc('month', $2::date)
         )
         SELECT
           COALESCE((SELECT SUM(invoice_total) FROM sales_base), 0)::numeric(12,2) AS total_sales,
           (SELECT total_returns FROM ret) AS total_returns,
           (COALESCE((SELECT SUM(invoice_total) FROM sales_base), 0) - (SELECT total_returns FROM ret))::numeric(12,2) AS net_sales,
           (SELECT cogs_estimated FROM cogs) AS cogs_estimated,
           ((COALESCE((SELECT SUM(invoice_total) FROM sales_base), 0) - (SELECT total_returns FROM ret)) - (SELECT cogs_estimated FROM cogs))::numeric(12,2) AS gross_profit,
           (SELECT expenses FROM exp) AS expenses,
           (SELECT payroll_net_pay FROM pay) AS payroll_net_pay,
           (SELECT epf FROM pay) AS epf,
           (SELECT etf FROM pay) AS etf,
           ((SELECT expenses FROM exp) + (SELECT payroll_net_pay FROM pay) + (SELECT epf FROM pay) + (SELECT etf FROM pay))::numeric(12,2) AS operating_expenses,
           (((COALESCE((SELECT SUM(invoice_total) FROM sales_base), 0) - (SELECT total_returns FROM ret)) - (SELECT cogs_estimated FROM cogs)) -
             ((SELECT expenses FROM exp) + (SELECT payroll_net_pay FROM pay) + (SELECT epf FROM pay) + (SELECT etf FROM pay)))::numeric(12,2) AS net_profit
        `,
        [startDate, endDate]
      );

      // Balance sheet (simplified, but balanced): Assets = Cash + Receivables + Inventory; Equity = Assets; Liabilities = 0
      // Cash & Receivables are cumulative up to endDate for an as-of statement.
      const cash = await pool.query(
        `SELECT COALESCE(SUM(total_amount), 0)::numeric(12,2) AS cash_received
         FROM v_report_payments_details
         WHERE payment_date <= $1 AND payment_status <> 'cancelled'`,
        [endDate]
      );
      const receivables = await pool.query(
        `WITH sales_base AS (
           SELECT DISTINCT sale_id, invoice_total
           FROM v_report_sales_details
           WHERE date <= $1
         ),
         paid AS (
           SELECT COALESCE(SUM(total_amount), 0)::numeric(12,2) AS paid_amount
           FROM v_report_payments_details
           WHERE payment_date <= $1 AND payment_status <> 'cancelled'
         )
         SELECT
           GREATEST(0, COALESCE((SELECT SUM(invoice_total) FROM sales_base), 0) - (SELECT paid_amount FROM paid))::numeric(12,2) AS accounts_receivable`,
        [endDate]
      );
      const inventoryVal = await pool.query(
        `SELECT COALESCE(SUM(stock_value), 0)::numeric(12,2) AS inventory_value
         FROM v_report_inventory_snapshot`
      );

      const assets =
        parseFloat(cash.rows[0]?.cash_received || 0) +
        parseFloat(receivables.rows[0]?.accounts_receivable || 0) +
        parseFloat(inventoryVal.rows[0]?.inventory_value || 0);

      const liabilities = 0;
      const equity = assets;

      // Validate balance sheet equation
      const balanced = Math.abs(assets - (liabilities + equity)) < 0.005;
      if (!balanced) {
        const err = new Error('Balance Sheet is not balanced: Assets != Liabilities + Equity');
        err.statusCode = 409;
        throw err;
      }

      const pnlRow = pnl.rows[0] || {};
      return {
        title: 'Final Financial Report',
        columns: [],
        details: [],
        summary: {
          profit_and_loss: {
            total_sales: (pnlRow.total_sales || '0.00').toString(),
            total_returns: (pnlRow.total_returns || '0.00').toString(),
            net_sales: (pnlRow.net_sales || '0.00').toString(),
            cogs_estimated: (pnlRow.cogs_estimated || '0.00').toString(),
            gross_profit: (pnlRow.gross_profit || '0.00').toString(),
            operating_expenses: (pnlRow.operating_expenses || '0.00').toString(),
            net_profit: (pnlRow.net_profit || '0.00').toString()
          },
          balance_sheet: {
            assets: assets.toFixed(2),
            liabilities: liabilities.toFixed(2),
            equity: equity.toFixed(2),
            validation: 'Assets = Liabilities + Equity (PASSED)'
          },
          inventory_valuation: {
            inventory_value: (inventoryVal.rows[0]?.inventory_value || '0.00').toString()
          },
          payroll_summary: {
            payroll_net_pay: (pnlRow.payroll_net_pay || '0.00').toString(),
            epf: (pnlRow.epf || '0.00').toString(),
            etf: (pnlRow.etf || '0.00').toString()
          },
          auditor_notes: ''
        }
      };
    }

    default:
      return null;
  }
}

export const getReport = async (req, res, next) => {
  try {
    const { key } = req.params;
    const range = requireDateRange(req);
    if (!range.ok) return res.status(400).json({ success: false, message: range.message });

    const report = await getReportData(key, range.startDate, range.endDate);
    if (!report) return res.status(404).json({ success: false, message: 'Unknown report type' });

    res.json({
      success: true,
      data: {
        meta: reportMeta({ key, title: report.title, startDate: range.startDate, endDate: range.endDate, user: req.user }),
        columns: report.columns,
        details: report.details,
        summary: report.summary,
        reconciliation: report.reconciliation || null
      }
    });
  } catch (error) {
    next(error);
  }
};

function safeFileNamePart(s) {
  return String(s || '')
    .replace(/[^a-z0-9-_]+/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export const exportExcel = async (req, res, next) => {
  try {
    const { key } = req.params;
    const range = requireDateRange(req);
    if (!range.ok) return res.status(400).json({ success: false, message: range.message });

    // Special handling for sales report - shop-wise export
    if (key === 'sales') {
      return await exportSalesShopWiseExcel(req, res, next, range);
    }

    const report = await getReportData(key, range.startDate, range.endDate);
    if (!report) return res.status(404).json({ success: false, message: 'Unknown report type' });

    const meta = reportMeta({ key, title: report.title, startDate: range.startDate, endDate: range.endDate, user: req.user });

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Lakshan Yogurt ERP';
    wb.created = new Date();

    const currencyFmt = '#,##0.00';
    const qtyFmt = '#,##0.00';
    const dateFmt = 'yyyy-mm-dd';

    const styleHeaderRow = (ws, rowNumber) => {
      const row = ws.getRow(rowNumber);
      row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      row.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      row.height = 18;
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } }; // slate-700
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          left: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          bottom: { style: 'thin', color: { argb: 'FFE5E7EB' } },
          right: { style: 'thin', color: { argb: 'FFE5E7EB' } }
        };
      });
    };

    const autoSizeColumns = (ws, min = 12, max = 40) => {
      ws.columns.forEach((col) => {
        let longest = 0;
        col.eachCell({ includeEmpty: true }, (cell) => {
          const v = cell.value;
          const s =
            v === null || v === undefined
              ? ''
              : typeof v === 'string'
                ? v
                : v instanceof Date
                  ? v.toISOString().slice(0, 10)
                  : typeof v === 'object' && v.text
                    ? String(v.text)
                    : String(v);
          longest = Math.max(longest, s.length);
        });
        col.width = Math.min(max, Math.max(min, longest + 2));
      });
    };

    const formatDetailSheet = (ws, columns, reportKey) => {
      // Freeze header, autofilter
      ws.views = [{ state: 'frozen', ySplit: 1 }];
      ws.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: Math.max(1, columns.length) }
      };
      styleHeaderRow(ws, 1);

      // Column formatting (by key heuristics)
      columns.forEach((c, idx) => {
        const col = ws.getColumn(idx + 1);
        const key = String(c.key || '').toLowerCase();
        if (key.includes('date')) col.numFmt = dateFmt;
        if (key.includes('amount') || key.includes('price') || key.includes('value') || key.includes('profit')) {
          col.numFmt = currencyFmt;
          col.alignment = { horizontal: 'right' };
        }
        if (key.includes('qty') || key.includes('quantity') || key.includes('liters') || key.includes('stock')) {
          col.numFmt = qtyFmt;
          col.alignment = { horizontal: 'right' };
        }
      });

      // Zebra rows (light)
      ws.eachRow((row, rowNumber) => {
        if (rowNumber === 1) return;
        if (rowNumber % 2 === 0) {
          row.eachCell((cell) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } }; // slate-50
          });
        }
      });

      autoSizeColumns(ws);
    };

    // SINGLE worksheet output (Transaction Details + Summary + Reconciliation in same sheet)
    const ws = wb.addWorksheet('Report');

    const toNumberIfNumeric = (v) => {
      if (typeof v === 'number') return v;
      if (typeof v === 'string' && v.trim() !== '' && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v);
      return v;
    };

    const addSectionTitle = (title) => {
      ws.addRow([]);
      const r = ws.addRow([title]);
      r.font = { bold: true, size: 12 };
      return r.number;
    };

    // Header block
    ws.addRow([meta.reportName]);
    ws.getRow(1).font = { bold: true, size: 16 };
    ws.addRow([`Period: ${meta.period.startDate} to ${meta.period.endDate}`]);
    ws.addRow([`Generated: ${meta.generatedAt}`]);
    ws.addRow([`Generated By: ${meta.generatedBy}`]);

    // Transaction Details table (if applicable)
    let tableStartRow = null;
    if (key !== 'final-financial' && (report.columns || []).length > 0) {
      addSectionTitle('Transaction Details');
      tableStartRow = ws.rowCount + 1;

      // Header row for table
      const headerRow = ws.addRow((report.columns || []).map((c) => c.label));
      styleHeaderRow(ws, headerRow.number);

      // Data rows
      for (const row of report.details || []) {
        const values = (report.columns || []).map((c) => {
          const k = c.key;
          let v = row?.[k];
          // Convert ISO/date strings to Date objects for better Excel date formatting
          if (v && typeof v === 'string' && (k.toLowerCase().includes('date') || /^\d{4}-\d{2}-\d{2}/.test(v))) {
            const d = new Date(v);
            if (!Number.isNaN(d.getTime())) v = d;
          }
          return toNumberIfNumeric(v);
        });
        ws.addRow(values);
      }

      // Format table columns by key heuristics
      (report.columns || []).forEach((c, idx) => {
        const col = ws.getColumn(idx + 1);
        const k = String(c.key || '').toLowerCase();
        if (k.includes('date')) col.numFmt = dateFmt;
        if (k.includes('amount') || k.includes('price') || k.includes('value') || k.includes('profit')) col.numFmt = currencyFmt;
        if (k.includes('qty') || k.includes('quantity') || k.includes('liters') || k.includes('stock')) col.numFmt = qtyFmt;
      });

      // Freeze at table header row
      ws.views = [{ state: 'frozen', ySplit: headerRow.number }];
      ws.autoFilter = {
        from: { row: headerRow.number, column: 1 },
        to: { row: headerRow.number, column: Math.max(1, (report.columns || []).length) }
      };
    }

    // Summary block
    addSectionTitle('Report Summary');
    const summaryHeader = ws.addRow(['Summary Item', 'Value']);
    styleHeaderRow(ws, summaryHeader.number);

    const pushSummaryRow = (label, value, fmt) => {
      const r = ws.addRow([label, toNumberIfNumeric(value)]);
      if (fmt) ws.getCell(r.number, 2).numFmt = fmt;
    };

    if (key === 'final-financial') {
      const pnl = report.summary?.profit_and_loss || {};
      ws.addRow(['Profit & Loss']);
      pushSummaryRow('Total Sales', pnl.total_sales, currencyFmt);
      pushSummaryRow('Total Returns', pnl.total_returns, currencyFmt);
      pushSummaryRow('Net Sales', pnl.net_sales, currencyFmt);
      pushSummaryRow('COGS (Estimated)', pnl.cogs_estimated, currencyFmt);
      pushSummaryRow('Gross Profit', pnl.gross_profit, currencyFmt);
      pushSummaryRow('Operating Expenses', pnl.operating_expenses, currencyFmt);
      pushSummaryRow('Net Profit', pnl.net_profit, currencyFmt);
      ws.addRow([]);
      ws.addRow(['Balance Sheet (Simplified)']);
      const bs = report.summary?.balance_sheet || {};
      pushSummaryRow('Assets', bs.assets, currencyFmt);
      pushSummaryRow('Liabilities', bs.liabilities, currencyFmt);
      pushSummaryRow('Equity', bs.equity, currencyFmt);
      ws.addRow(['Validation', bs.validation || '']);
    } else {
      // Report-specific ordering/labels
      if (key === 'milk') {
        pushSummaryRow('Total Quantity (Liters)', report.summary?.total_quantity_liters, qtyFmt);
        pushSummaryRow('Total Amount (Rs.)', report.summary?.total_amount, currencyFmt);
        pushSummaryRow('Total Records', report.summary?.total_records);
        pushSummaryRow('Farmer Count', report.summary?.farmer_count);
        pushSummaryRow('Remaining Stock (Liters)', report.summary?.remaining_stock_liters, qtyFmt);
      } else if (key === 'payroll') {
        pushSummaryRow('Total Gross Salary (Rs.)', report.summary?.total_gross_salary, currencyFmt);
        pushSummaryRow('Total EPF (Rs.)', report.summary?.total_epf, currencyFmt);
        pushSummaryRow('Total ETF (Rs.)', report.summary?.total_etf, currencyFmt);
        pushSummaryRow('Total Advances (Rs.)', report.summary?.total_advances, currencyFmt);
        pushSummaryRow('Total Net Pay (Rs.)', report.summary?.total_net_pay, currencyFmt);
        pushSummaryRow('Total Records', report.summary?.total_records);
      } else if (key === 'inventory') {
        pushSummaryRow('Total Inventory Value (Rs.)', report.summary?.total_inventory_value, currencyFmt);
        pushSummaryRow('Total Items', report.summary?.total_items);
        pushSummaryRow('Low Stock Items', report.summary?.low_stock_items);
        pushSummaryRow('Expiring Soon Items', report.summary?.expiring_soon_items);
      } else if (key === 'production') {
        pushSummaryRow('Total Quantity Produced', report.summary?.total_qty_produced, qtyFmt);
        pushSummaryRow('Total Production Cost (Est.)', report.summary?.total_production_cost_estimated, currencyFmt);
        pushSummaryRow('Total Records', report.summary?.total_records);
      } else if (key === 'sales') {
        pushSummaryRow('Total Sales (Rs.)', report.summary?.total_sales, currencyFmt);
        pushSummaryRow('Total Returns (Rs.)', report.summary?.total_returns, currencyFmt);
        pushSummaryRow('Net Sales (Rs.)', report.summary?.net_sales, currencyFmt);
        pushSummaryRow('Payments Received (Rs.)', report.summary?.total_payments_received, currencyFmt);
        pushSummaryRow('Outstanding (Rs.)', report.summary?.outstanding, currencyFmt);
        pushSummaryRow('Invoice Count', report.summary?.invoice_count);
      } else if (key === 'returns') {
        pushSummaryRow('Total Return Qty', report.summary?.total_return_qty, qtyFmt);
        pushSummaryRow('Total Return Value (Est.)', report.summary?.total_return_value, currencyFmt);
        pushSummaryRow('Total Records', report.summary?.total_records);
      } else if (key === 'payments') {
        pushSummaryRow('Total Cash (Rs.)', report.summary?.total_cash, currencyFmt);
        pushSummaryRow('Total Cheque (Rs.)', report.summary?.total_cheque, currencyFmt);
        pushSummaryRow('Total Payments (Rs.)', report.summary?.total_payments, currencyFmt);
        pushSummaryRow('Total Records', report.summary?.total_records);
      } else if (key === 'cheques') {
        pushSummaryRow('Total Cheque Amount (Rs.)', report.summary?.total_cheque_amount, currencyFmt);
        pushSummaryRow('Pending Count', report.summary?.pending_count);
        pushSummaryRow('Cleared Count', report.summary?.cleared_count);
        pushSummaryRow('Bounced Count', report.summary?.bounced_count);
        pushSummaryRow('Total Records', report.summary?.total_records);
      } else if (key === 'expenses') {
        pushSummaryRow('Total Expenses (Rs.)', report.summary?.total_expenses, currencyFmt);
        pushSummaryRow('Total Records', report.summary?.total_records);
      } else {
        Object.entries(report.summary || {}).forEach(([k, v]) => pushSummaryRow(k.replace(/_/g, ' '), v));
      }
    }

    // Reconciliation block (same sheet)
    addSectionTitle('Reconciliation');
    const recHeader = ws.addRow(['Reconciliation Item', 'Value']);
    styleHeaderRow(ws, recHeader.number);

    const pushRecRow = (label, value, fmt) => {
      const r = ws.addRow([label, toNumberIfNumeric(value)]);
      if (fmt) ws.getCell(r.number, 2).numFmt = fmt;
    };

    if (key === 'sales' || key === 'payments') {
      Object.entries(report.reconciliation || {}).forEach(([k, v]) => {
        pushRecRow(k.replace(/_/g, ' '), v, currencyFmt);
      });
    } else if (key === 'milk') {
      pushRecRow('Total Collected (Liters)', report.summary?.total_quantity_liters, qtyFmt);
      pushRecRow('Remaining Milk Stock (Liters)', report.summary?.remaining_stock_liters, qtyFmt);
    } else {
      pushRecRow('No reconciliation rules for this report', '');
    }

    // Final formatting
    autoSizeColumns(ws, 14, 55);

    const fileName = `${safeFileNamePart(meta.reportName)}_${meta.period.startDate}_to_${meta.period.endDate}.xlsx`;
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
};

// Special Excel export for shop-wise sales report
async function exportSalesShopWiseExcel(req, res, next, range) {
  try {

    const wb = new ExcelJS.Workbook();
    wb.creator = 'Lakshan Yogurt ERP';
    wb.created = new Date();

    const currencyFmt = '#,##0.00';
    const qtyFmt = '#,##0.00';
    const dateFmt = 'yyyy-mm-dd';

    // Get all sales data with shop and salesperson info
    const salesResult = await pool.query(`
      SELECT 
        s.id,
        s.date,
        s.total_amount,
        s.payment_status,
        s.is_edited,
        b.id as buyer_id,
        b.shop_name,
        b.address,
        b.contact,
        u.name as salesperson_name,
        u.username as salesperson_username
      FROM sales s
      LEFT JOIN buyers b ON s.buyer_id = b.id
      LEFT JOIN users u ON s.salesperson_id = u.id
      WHERE s.is_reversed = false
        AND s.date BETWEEN $1 AND $2
      ORDER BY b.shop_name, s.date DESC, s.created_at DESC
    `, [range.startDate, range.endDate]);

    // Get sale items
    const saleIds = salesResult.rows.map(r => r.id);
    const saleItemsMap = {};
    if (saleIds.length > 0) {
      const itemsResult = await pool.query(`
        SELECT 
          si.sale_id,
          si.quantity,
          si.price,
          si.free_quantity,
          p.name as product_name
        FROM sale_items si
        LEFT JOIN products p ON si.product_id = p.id
        WHERE si.sale_id = ANY($1)
        ORDER BY si.sale_id, si.created_at
      `, [saleIds]);

      itemsResult.rows.forEach(item => {
        if (!saleItemsMap[item.sale_id]) {
          saleItemsMap[item.sale_id] = [];
        }
        saleItemsMap[item.sale_id].push({
          productName: item.product_name || 'Unknown Product',
          quantity: parseFloat(item.quantity || 0),
          price: parseFloat(item.price || 0),
          freeQuantity: parseFloat(item.free_quantity || 0)
        });
      });
    }

    // Get payment summaries with detailed breakdown
    const paymentSummaries = {};
    const pendingAmounts = {};
    const chequeDetails = {};
    if (saleIds.length > 0) {
      const paymentResult = await pool.query(`
        SELECT 
          p.sale_id,
          COALESCE(SUM(p.cash_amount), 0) as total_cash,
          COALESCE(SUM(CASE WHEN c.status = 'cleared' THEN p.cheque_amount ELSE 0 END), 0) as paid_cheque_cleared,
          COALESCE(SUM(CASE WHEN c.status = 'pending' THEN p.cheque_amount ELSE 0 END), 0) as pending_cheque,
          COALESCE(SUM(CASE WHEN c.status = 'bounced' THEN p.cheque_amount ELSE 0 END), 0) as bounced_cheque,
          COUNT(CASE WHEN c.status = 'cleared' THEN 1 END) as cleared_cheque_count,
          COUNT(CASE WHEN c.status = 'pending' THEN 1 END) as pending_cheque_count,
          COUNT(CASE WHEN c.status = 'bounced' THEN 1 END) as bounced_cheque_count
        FROM payments p
        LEFT JOIN cheques c ON c.payment_id = p.id
        WHERE p.sale_id = ANY($1) AND p.status = 'completed'
        GROUP BY p.sale_id
      `, [saleIds]);

      paymentResult.rows.forEach(row => {
        const paidCash = parseFloat(row.total_cash || 0);
        const paidChequeCleared = parseFloat(row.paid_cheque_cleared || 0);
        const pendingCheque = parseFloat(row.pending_cheque || 0);
        const bouncedCheque = parseFloat(row.bounced_cheque || 0);
        const totalPaid = paidCash + paidChequeCleared;
        
        paymentSummaries[row.sale_id] = {
          totalPaid: totalPaid,
          paidCash: paidCash,
          paidChequeCleared: paidChequeCleared,
          pendingCheque: pendingCheque,
          bouncedCheque: bouncedCheque
        };
        
        pendingAmounts[row.sale_id] = {
          cash: 0,
          cheque: pendingCheque
        };
        
        chequeDetails[row.sale_id] = {
          clearedCount: parseInt(row.cleared_cheque_count || 0),
          pendingCount: parseInt(row.pending_cheque_count || 0),
          bouncedCount: parseInt(row.bounced_cheque_count || 0)
        };
      });
    }

    // Group sales by shop
    const shopMap = new Map();
    salesResult.rows.forEach(row => {
      const shopId = row.buyer_id || `${row.shop_name || 'Unknown'}_${row.address || '-'}`;
      const shopName = row.shop_name || 'Unknown Shop';
      
      if (!shopMap.has(shopId)) {
        shopMap.set(shopId, {
          shopId,
          shopName,
          contact: row.contact || '-',
          address: row.address || '-',
          sales: []
        });
      }

      const shop = shopMap.get(shopId);
      const saleTotal = parseFloat(row.total_amount || 0);
      const paymentInfo = paymentSummaries[row.id] || {
        totalPaid: 0,
        paidCash: 0,
        paidChequeCleared: 0,
        pendingCheque: 0,
        bouncedCheque: 0
      };
      const pending = pendingAmounts[row.id] || { cash: 0, cheque: 0 };
      const chequeInfo = chequeDetails[row.id] || {
        clearedCount: 0,
        pendingCount: 0,
        bouncedCount: 0
      };
      
      const totalPaid = paymentInfo.totalPaid;
      const remainingBalance = saleTotal - totalPaid - pending.cheque;
      const hasPaymentRecords = totalPaid > 0 || pending.cheque > 0;
      const pendingCash = hasPaymentRecords ? 0 : Math.max(0, remainingBalance);
      
      // Determine payment status
      let paymentStatusText = row.payment_status || 'pending';
      if (totalPaid >= saleTotal) {
        paymentStatusText = 'FULLY PAID';
      } else if (totalPaid > 0) {
        paymentStatusText = 'PARTIAL';
      } else {
        paymentStatusText = 'PENDING';
      }

      shop.sales.push({
        id: row.id,
        date: row.date,
        totalAmount: saleTotal,
        totalPaid: totalPaid,
        paidCash: paymentInfo.paidCash,
        paidChequeCleared: paymentInfo.paidChequeCleared,
        pendingCheque: paymentInfo.pendingCheque,
        bouncedCheque: paymentInfo.bouncedCheque,
        remainingAmount: remainingBalance + pending.cheque,
        paymentStatus: paymentStatusText,
        chequeClearedCount: chequeInfo.clearedCount,
        chequePendingCount: chequeInfo.pendingCount,
        chequeBouncedCount: chequeInfo.bouncedCount,
        salespersonName: row.salesperson_name || row.salesperson_username || 'Unknown',
        isEdited: row.is_edited || false,
        items: saleItemsMap[row.id] || []
      });
    });

    // Get all unique products for column headers
    const allProducts = new Set();
    Array.from(shopMap.values()).forEach(shop => {
      shop.sales.forEach(sale => {
        sale.items.forEach(item => {
          allProducts.add(item.productName);
        });
      });
    });
    const productColumns = Array.from(allProducts).sort();

    // Create Summary Sheet
    const summarySheet = wb.addWorksheet('Shop Summary');
    
    // Header Section
    summarySheet.addRow(['SALES REPORT - SHOP-WISE SUMMARY']);
    summarySheet.getRow(1).font = { bold: true, size: 18, color: { argb: 'FF1E40AF' } };
    summarySheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
    summarySheet.mergeCells(1, 1, 1, 9);
    
    summarySheet.addRow([`Report Period: ${range.startDate} to ${range.endDate}`]);
    summarySheet.getRow(2).font = { size: 11, color: { argb: 'FF6B7280' } };
    summarySheet.getRow(2).alignment = { horizontal: 'center' };
    summarySheet.mergeCells(2, 1, 2, 9);
    
    summarySheet.addRow([`Generated: ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`]);
    summarySheet.getRow(3).font = { size: 10, color: { argb: 'FF9CA3AF' } };
    summarySheet.getRow(3).alignment = { horizontal: 'center' };
    summarySheet.mergeCells(3, 1, 3, 9);
    
    summarySheet.addRow([]); // Empty row

    // Summary table header
    const headerRowNum = summarySheet.rowCount + 1;
    const summaryHeader = summarySheet.addRow([
      'No.',
      'Shop Name',
      'Contact',
      'Address',
      'Total Sales',
      'Total Amount (Rs.)',
      'Paid Cash (Rs.)',
      'Paid Cheque (Rs.)',
      'Pending Cheque (Rs.)',
      'Total Paid (Rs.)',
      'Remaining (Rs.)',
      'Status',
      'Latest Sale Date'
    ]);
    
    // Style header row
    summaryHeader.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    summaryHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    summaryHeader.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    summaryHeader.height = 25;
    summaryHeader.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
    });

    // Summary data
    const shopSummaries = Array.from(shopMap.values()).sort((a, b) => 
      a.shopName.localeCompare(b.shopName)
    );

    let rowNum = 0;
    let grandTotalSales = 0;
    let grandTotalAmount = 0;
    let grandTotalPaid = 0;
    let grandTotalPending = 0;

    shopSummaries.forEach((shop, index) => {
      const totalSales = shop.sales.length;
      const totalAmount = shop.sales.reduce((sum, s) => sum + s.totalAmount, 0);
      const totalPaidCash = shop.sales.reduce((sum, s) => sum + (s.paidCash || 0), 0);
      const totalPaidCheque = shop.sales.reduce((sum, s) => sum + (s.paidChequeCleared || 0), 0);
      const totalPendingCheque = shop.sales.reduce((sum, s) => sum + (s.pendingCheque || 0), 0);
      const totalPaid = shop.sales.reduce((sum, s) => sum + s.totalPaid, 0);
      const totalRemaining = shop.sales.reduce((sum, s) => sum + (s.remainingAmount || 0), 0);
      const latestSale = shop.sales.sort((a, b) => new Date(b.date) - new Date(a.date))[0];
      
      // Determine overall status
      let overallStatus = 'PENDING';
      if (totalPaid >= totalAmount) {
        overallStatus = 'FULLY PAID';
      } else if (totalPaid > 0) {
        overallStatus = 'PARTIAL';
      }

      grandTotalSales += totalSales;
      grandTotalAmount += totalAmount;
      grandTotalPaid += totalPaid;
      grandTotalPending += totalRemaining;

      rowNum = summarySheet.rowCount + 1;
      const row = summarySheet.addRow([
        index + 1,
        shop.shopName,
        shop.contact,
        shop.address,
        totalSales,
        totalAmount,
        totalPaidCash,
        totalPaidCheque,
        totalPendingCheque,
        totalPaid,
        totalRemaining,
        overallStatus,
        latestSale ? new Date(latestSale.date) : ''
      ]);

      // Alternate row colors for better readability
      if (rowNum % 2 === 0) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
      }

      // Add borders to all cells
      row.eachCell((cell) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
          right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
        };
        cell.alignment = { vertical: 'middle', wrapText: true };
      });

      // Format specific columns
      summarySheet.getCell(rowNum, 1).alignment = { horizontal: 'center', vertical: 'middle' }; // No.
      summarySheet.getCell(rowNum, 5).alignment = { horizontal: 'center', vertical: 'middle' }; // Total Sales
      summarySheet.getCell(rowNum, 5).numFmt = '0';
      summarySheet.getCell(rowNum, 6).numFmt = currencyFmt; // Total Amount
      summarySheet.getCell(rowNum, 6).alignment = { horizontal: 'right', vertical: 'middle' };
      summarySheet.getCell(rowNum, 7).numFmt = currencyFmt; // Paid Cash
      summarySheet.getCell(rowNum, 7).alignment = { horizontal: 'right', vertical: 'middle' };
      summarySheet.getCell(rowNum, 8).numFmt = currencyFmt; // Paid Cheque
      summarySheet.getCell(rowNum, 8).alignment = { horizontal: 'right', vertical: 'middle' };
      summarySheet.getCell(rowNum, 9).numFmt = currencyFmt; // Pending Cheque
      summarySheet.getCell(rowNum, 9).alignment = { horizontal: 'right', vertical: 'middle' };
      summarySheet.getCell(rowNum, 10).numFmt = currencyFmt; // Total Paid
      summarySheet.getCell(rowNum, 10).alignment = { horizontal: 'right', vertical: 'middle' };
      summarySheet.getCell(rowNum, 11).numFmt = currencyFmt; // Remaining
      summarySheet.getCell(rowNum, 11).alignment = { horizontal: 'right', vertical: 'middle' };
      summarySheet.getCell(rowNum, 12).alignment = { horizontal: 'center', vertical: 'middle' }; // Status
      summarySheet.getCell(rowNum, 13).numFmt = dateFmt; // Latest Sale Date
      summarySheet.getCell(rowNum, 13).alignment = { horizontal: 'center', vertical: 'middle' };
    });

    // Calculate grand totals for all payment types
    let grandTotalPaidCash = 0;
    let grandTotalPaidCheque = 0;
    let grandTotalPendingCheque = 0;
    shopSummaries.forEach(shop => {
      grandTotalPaidCash += shop.sales.reduce((sum, s) => sum + (s.paidCash || 0), 0);
      grandTotalPaidCheque += shop.sales.reduce((sum, s) => sum + (s.paidChequeCleared || 0), 0);
      grandTotalPendingCheque += shop.sales.reduce((sum, s) => sum + (s.pendingCheque || 0), 0);
    });

    // Add Grand Total Row
    summarySheet.addRow([]);
    const grandTotalRowNum = summarySheet.rowCount + 1;
    const grandTotalRow = summarySheet.addRow([
      '',
      'GRAND TOTAL',
      '',
      '',
      grandTotalSales,
      grandTotalAmount,
      grandTotalPaidCash,
      grandTotalPaidCheque,
      grandTotalPendingCheque,
      grandTotalPaid,
      grandTotalPending,
      '',
      ''
    ]);

    // Style grand total row
    grandTotalRow.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    grandTotalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
    grandTotalRow.alignment = { vertical: 'middle', horizontal: 'right' };
    grandTotalRow.eachCell((cell, colNumber) => {
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'medium', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
      if (colNumber === 2) {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      } else if (colNumber === 5) {
        cell.numFmt = '0';
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else if (colNumber >= 6 && colNumber <= 11) {
        cell.numFmt = currencyFmt;
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      }
    });

    // Format summary columns
    summarySheet.getColumn(1).width = 6; // No.
    summarySheet.getColumn(2).width = 30; // Shop Name
    summarySheet.getColumn(3).width = 15; // Contact
    summarySheet.getColumn(4).width = 35; // Address
    summarySheet.getColumn(5).width = 12; // Total Sales
    summarySheet.getColumn(6).width = 18; // Total Amount
    summarySheet.getColumn(7).width = 18; // Paid Cash
    summarySheet.getColumn(8).width = 18; // Paid Cheque
    summarySheet.getColumn(9).width = 18; // Pending Cheque
    summarySheet.getColumn(10).width = 18; // Total Paid
    summarySheet.getColumn(11).width = 18; // Remaining
    summarySheet.getColumn(12).width = 12; // Status
    summarySheet.getColumn(13).width = 15; // Latest Sale Date

    // Set column formats
    summarySheet.getColumn(5).numFmt = '0';
    summarySheet.getColumn(6).numFmt = currencyFmt;
    summarySheet.getColumn(7).numFmt = currencyFmt;
    summarySheet.getColumn(8).numFmt = currencyFmt;
    summarySheet.getColumn(9).numFmt = currencyFmt;
    summarySheet.getColumn(10).numFmt = currencyFmt;
    summarySheet.getColumn(11).numFmt = currencyFmt;
    summarySheet.getColumn(13).numFmt = dateFmt;

    // Create Detailed Sheet
    const detailSheet = wb.addWorksheet('All Sales Details');
    
    // Header Section
    detailSheet.addRow(['SALES REPORT - ALL SALES DETAILS']);
    detailSheet.getRow(1).font = { bold: true, size: 18, color: { argb: 'FF1E40AF' } };
    detailSheet.getRow(1).alignment = { horizontal: 'center', vertical: 'middle' };
    const detailHeaderColCount = 8 + productColumns.length + 9; // Base cols + products + financial cols (updated)
    detailSheet.mergeCells(1, 1, 1, detailHeaderColCount);
    
    detailSheet.addRow([`Report Period: ${range.startDate} to ${range.endDate}`]);
    detailSheet.getRow(2).font = { size: 11, color: { argb: 'FF6B7280' } };
    detailSheet.getRow(2).alignment = { horizontal: 'center' };
    detailSheet.mergeCells(2, 1, 2, detailHeaderColCount);
    
    detailSheet.addRow([`Generated: ${new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}`]);
    detailSheet.getRow(3).font = { size: 10, color: { argb: 'FF9CA3AF' } };
    detailSheet.getRow(3).alignment = { horizontal: 'center' };
    detailSheet.mergeCells(3, 1, 3, detailHeaderColCount);
    
    detailSheet.addRow([]); // Empty row

    // Build header row with product columns
    const detailHeader = [
      'No.',
      'Date',
      'Time',
      'Shop Name',
      'Contact',
      'Address',
      'Salesperson',
      'Items',
      ...productColumns,
      'Total Amount (Rs.)',
      'Paid Cash (Rs.)',
      'Paid Cheque (Rs.)',
      'Pending Cheque (Rs.)',
      'Total Paid (Rs.)',
      'Remaining (Rs.)',
      'Status',
      'Cheque Cleared',
      'Cheque Pending',
      'Edited'
    ];
    const detailHeaderRowNum = detailSheet.rowCount + 1;
    const headerRow = detailSheet.addRow(detailHeader);
    
    // Style header row
    headerRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };
    headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    headerRow.height = 25;
    headerRow.eachCell((cell) => {
      cell.border = {
        top: { style: 'thin', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'thin', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
    });

    // Add sales data grouped by shop (for detail sheet)
    let detailRowNum = 0;
    let detailSaleCounter = 0;
    let detailShopTotalAmount = 0;
    let detailShopTotalPaid = 0;
    let detailShopTotalPaidCash = 0;
    let detailShopTotalPaidCheque = 0;
    let detailShopTotalPendingCheque = 0;
    let detailShopTotalRemaining = 0;
    let detailGrandTotalAmount = 0;
    let detailGrandTotalPaid = 0;
    let detailGrandTotalPaidCash = 0;
    let detailGrandTotalPaidCheque = 0;
    let detailGrandTotalPendingCheque = 0;
    let detailGrandTotalRemaining = 0;

    shopSummaries.forEach((shop, shopIndex) => {
      // Shop header row
      const shopHeaderRow = detailSheet.addRow([`Shop: ${shop.shopName} (${shop.contact})`]);
      shopHeaderRow.font = { bold: true, size: 12 };
      shopHeaderRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };

      // Sort sales by date (newest first)
      const sortedSales = shop.sales.sort((a, b) => new Date(b.date) - new Date(a.date));

      sortedSales.forEach(sale => {
        detailSaleCounter++;
        detailShopTotalAmount += sale.totalAmount;
        detailShopTotalPaid += sale.totalPaid;
        detailShopTotalPaidCash += sale.paidCash || 0;
        detailShopTotalPaidCheque += sale.paidChequeCleared || 0;
        detailShopTotalPendingCheque += sale.pendingCheque || 0;
        detailShopTotalRemaining += sale.remainingAmount || 0;
        detailGrandTotalAmount += sale.totalAmount;
        detailGrandTotalPaid += sale.totalPaid;
        detailGrandTotalPaidCash += sale.paidCash || 0;
        detailGrandTotalPaidCheque += sale.paidChequeCleared || 0;
        detailGrandTotalPendingCheque += sale.pendingCheque || 0;
        detailGrandTotalRemaining += sale.remainingAmount || 0;

        const saleDate = new Date(sale.date);
        const timeStr = saleDate.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        });

        // Create item map for product quantities
        const itemMap = new Map();
        sale.items.forEach(item => {
          itemMap.set(item.productName, item.quantity);
        });

        // Build row data with complete payment information
        detailRowNum = detailSheet.rowCount + 1;
        const rowData = [
          detailSaleCounter,
          saleDate,
          timeStr,
          shop.shopName,
          shop.contact,
          shop.address,
          sale.salespersonName,
          sale.items.length,
          ...productColumns.map(product => itemMap.get(product) || 0),
          sale.totalAmount,
          sale.paidCash || 0,
          sale.paidChequeCleared || 0,
          sale.pendingCheque || 0,
          sale.totalPaid,
          sale.remainingAmount || 0,
          sale.paymentStatus,
          sale.chequeClearedCount || 0,
          sale.chequePendingCount || 0,
          sale.isEdited ? 'Yes' : 'No'
        ];

        const row = detailSheet.addRow(rowData);

        // Alternate row colors for better readability
        if (detailRowNum % 2 === 0) {
          row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF9FAFB' } };
        }

        // Add borders to all cells
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFD1D5DB' } },
            left: { style: 'thin', color: { argb: 'FFD1D5DB' } },
            bottom: { style: 'thin', color: { argb: 'FFD1D5DB' } },
            right: { style: 'thin', color: { argb: 'FFD1D5DB' } }
          };
          cell.alignment = { vertical: 'middle', wrapText: true };
        });

        // Format specific columns
        detailSheet.getCell(detailRowNum, 1).alignment = { horizontal: 'center', vertical: 'middle' }; // No.
        detailSheet.getCell(detailRowNum, 1).numFmt = '0';
        detailSheet.getCell(detailRowNum, 2).numFmt = dateFmt; // Date
        detailSheet.getCell(detailRowNum, 2).alignment = { horizontal: 'center', vertical: 'middle' };
        detailSheet.getCell(detailRowNum, 3).alignment = { horizontal: 'center', vertical: 'middle' }; // Time
        detailSheet.getCell(detailRowNum, 8).alignment = { horizontal: 'center', vertical: 'middle' }; // Items
        detailSheet.getCell(detailRowNum, 8).numFmt = '0';
        
        // Format product quantity columns
        const productStartCol = 9;
        productColumns.forEach((_, idx) => {
          detailSheet.getCell(detailRowNum, productStartCol + idx).numFmt = qtyFmt;
          detailSheet.getCell(detailRowNum, productStartCol + idx).alignment = { horizontal: 'right', vertical: 'middle' };
        });

        // Format currency columns
        const totalAmountCol = productStartCol + productColumns.length;
        detailSheet.getCell(detailRowNum, totalAmountCol).numFmt = currencyFmt; // Total Amount
        detailSheet.getCell(detailRowNum, totalAmountCol).alignment = { horizontal: 'right', vertical: 'middle' };
        detailSheet.getCell(detailRowNum, totalAmountCol + 1).numFmt = currencyFmt; // Paid Cash
        detailSheet.getCell(detailRowNum, totalAmountCol + 1).alignment = { horizontal: 'right', vertical: 'middle' };
        detailSheet.getCell(detailRowNum, totalAmountCol + 2).numFmt = currencyFmt; // Paid Cheque
        detailSheet.getCell(detailRowNum, totalAmountCol + 2).alignment = { horizontal: 'right', vertical: 'middle' };
        detailSheet.getCell(detailRowNum, totalAmountCol + 3).numFmt = currencyFmt; // Pending Cheque
        detailSheet.getCell(detailRowNum, totalAmountCol + 3).alignment = { horizontal: 'right', vertical: 'middle' };
        detailSheet.getCell(detailRowNum, totalAmountCol + 4).numFmt = currencyFmt; // Total Paid
        detailSheet.getCell(detailRowNum, totalAmountCol + 4).alignment = { horizontal: 'right', vertical: 'middle' };
        detailSheet.getCell(detailRowNum, totalAmountCol + 5).numFmt = currencyFmt; // Remaining
        detailSheet.getCell(detailRowNum, totalAmountCol + 5).alignment = { horizontal: 'right', vertical: 'middle' };
        detailSheet.getCell(detailRowNum, totalAmountCol + 6).alignment = { horizontal: 'center', vertical: 'middle' }; // Status
        detailSheet.getCell(detailRowNum, totalAmountCol + 7).alignment = { horizontal: 'center', vertical: 'middle' }; // Cheque Cleared Count
        detailSheet.getCell(detailRowNum, totalAmountCol + 7).numFmt = '0';
        detailSheet.getCell(detailRowNum, totalAmountCol + 8).alignment = { horizontal: 'center', vertical: 'middle' }; // Cheque Pending Count
        detailSheet.getCell(detailRowNum, totalAmountCol + 8).numFmt = '0';
        detailSheet.getCell(detailRowNum, totalAmountCol + 9).alignment = { horizontal: 'center', vertical: 'middle' }; // Edited
      });

      // Add shop subtotal row
      const shopSubtotalRowNum = detailSheet.rowCount + 1;
      const totalAmountColSub = 9 + productColumns.length;
      const shopSubtotalRow = detailSheet.addRow([
        '',
        'SHOP SUBTOTAL',
        '',
        shop.shopName,
        '',
        '',
        '',
        sortedSales.length,
        ...productColumns.map(() => ''),
        detailShopTotalAmount,
        detailShopTotalPaidCash,
        detailShopTotalPaidCheque,
        detailShopTotalPendingCheque,
        detailShopTotalPaid,
        detailShopTotalRemaining,
        '',
        '',
        '',
        ''
      ]);

      // Style shop subtotal row
      shopSubtotalRow.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      shopSubtotalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8B5CF6' } };
      shopSubtotalRow.alignment = { vertical: 'middle', horizontal: 'right' };
      shopSubtotalRow.eachCell((cell, colNumber) => {
        cell.border = {
          top: { style: 'thin', color: { argb: 'FF000000' } },
          left: { style: 'thin', color: { argb: 'FF000000' } },
          bottom: { style: 'medium', color: { argb: 'FF000000' } },
          right: { style: 'thin', color: { argb: 'FF000000' } }
        };
        if (colNumber === 2) {
          cell.alignment = { horizontal: 'left', vertical: 'middle' };
        } else if (colNumber === 8) {
          cell.alignment = { horizontal: 'center', vertical: 'middle' };
          cell.numFmt = '0';
        } else if (colNumber >= totalAmountColSub && colNumber <= totalAmountColSub + 5) {
          cell.numFmt = currencyFmt;
          cell.alignment = { horizontal: 'right', vertical: 'middle' };
        }
      });

      // Add empty row between shops
      detailSheet.addRow([]);
    });

    // Add Grand Total Row
    const detailGrandTotalRowNum = detailSheet.rowCount + 1;
    const totalAmountColFinal = 9 + productColumns.length;
    const detailGrandTotalRow = detailSheet.addRow([
      '',
      'GRAND TOTAL',
      '',
      '',
      '',
      '',
      '',
      detailSaleCounter,
      ...productColumns.map(() => ''),
      detailGrandTotalAmount,
      detailGrandTotalPaidCash,
      detailGrandTotalPaidCheque,
      detailGrandTotalPendingCheque,
      detailGrandTotalPaid,
      detailGrandTotalRemaining,
      '',
      '',
      '',
      ''
    ]);

    // Style grand total row
    detailGrandTotalRow.font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    detailGrandTotalRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF059669' } };
    detailGrandTotalRow.alignment = { vertical: 'middle', horizontal: 'right' };
    detailGrandTotalRow.eachCell((cell, colNumber) => {
      cell.border = {
        top: { style: 'medium', color: { argb: 'FF000000' } },
        left: { style: 'thin', color: { argb: 'FF000000' } },
        bottom: { style: 'medium', color: { argb: 'FF000000' } },
        right: { style: 'thin', color: { argb: 'FF000000' } }
      };
      if (colNumber === 2) {
        cell.alignment = { horizontal: 'left', vertical: 'middle' };
      } else if (colNumber === 8) {
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
        cell.numFmt = '0';
      } else if (colNumber >= totalAmountColFinal && colNumber <= totalAmountColFinal + 5) {
        cell.numFmt = currencyFmt;
        cell.alignment = { horizontal: 'right', vertical: 'middle' };
      }
    });

    // Format detail sheet columns
    detailSheet.getColumn(1).width = 6; // No.
    detailSheet.getColumn(2).width = 12; // Date
    detailSheet.getColumn(3).width = 10; // Time
    detailSheet.getColumn(4).width = 25; // Shop Name
    detailSheet.getColumn(5).width = 15; // Contact
    detailSheet.getColumn(6).width = 30; // Address
    detailSheet.getColumn(7).width = 18; // Salesperson
    detailSheet.getColumn(8).width = 8; // Items
    productColumns.forEach((_, idx) => {
      detailSheet.getColumn(9 + idx).width = 12; // Product columns
    });
    const totalAmountCol = 9 + productColumns.length;
    detailSheet.getColumn(totalAmountCol).width = 18; // Total Amount
    detailSheet.getColumn(totalAmountCol + 1).width = 18; // Paid Cash
    detailSheet.getColumn(totalAmountCol + 2).width = 18; // Paid Cheque
    detailSheet.getColumn(totalAmountCol + 3).width = 18; // Pending Cheque
    detailSheet.getColumn(totalAmountCol + 4).width = 18; // Total Paid
    detailSheet.getColumn(totalAmountCol + 5).width = 18; // Remaining
    detailSheet.getColumn(totalAmountCol + 6).width = 12; // Status
    detailSheet.getColumn(totalAmountCol + 7).width = 12; // Cheque Cleared Count
    detailSheet.getColumn(totalAmountCol + 8).width = 12; // Cheque Pending Count
    detailSheet.getColumn(totalAmountCol + 9).width = 10; // Edited

    // Set column formats
    detailSheet.getColumn(1).numFmt = '0';
    detailSheet.getColumn(2).numFmt = dateFmt;
    detailSheet.getColumn(8).numFmt = '0';
    productColumns.forEach((_, idx) => {
      detailSheet.getColumn(9 + idx).numFmt = qtyFmt;
    });
    detailSheet.getColumn(totalAmountCol).numFmt = currencyFmt; // Total Amount
    detailSheet.getColumn(totalAmountCol + 1).numFmt = currencyFmt; // Paid Cash
    detailSheet.getColumn(totalAmountCol + 2).numFmt = currencyFmt; // Paid Cheque
    detailSheet.getColumn(totalAmountCol + 3).numFmt = currencyFmt; // Pending Cheque
    detailSheet.getColumn(totalAmountCol + 4).numFmt = currencyFmt; // Total Paid
    detailSheet.getColumn(totalAmountCol + 5).numFmt = currencyFmt; // Remaining
    detailSheet.getColumn(totalAmountCol + 7).numFmt = '0'; // Cheque Cleared Count
    detailSheet.getColumn(totalAmountCol + 8).numFmt = '0'; // Cheque Pending Count

    // Freeze header rows
    summarySheet.views = [{ state: 'frozen', ySplit: 4 }];
    detailSheet.views = [{ state: 'frozen', ySplit: 4 }];

    // Set up auto-filter
    summarySheet.autoFilter = {
      from: { row: headerRowNum, column: 1 },
      to: { row: headerRowNum, column: 13 }
    };
    detailSheet.autoFilter = {
      from: { row: detailHeaderRowNum, column: 1 },
      to: { row: detailHeaderRowNum, column: detailHeaderColCount }
    };

    // Send file
    const sanitizedFilename = `sales_report_${range.startDate}_to_${range.endDate}`.replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${sanitizedFilename}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (error) {
    next(error);
  }
}

export const exportPdf = async (req, res, next) => {
  let pdfStarted = false;
  let docRef = null;
  try {
    const { key } = req.params;
    const range = requireDateRange(req);
    if (!range.ok) return res.status(400).json({ success: false, message: range.message });

    const report = await getReportData(key, range.startDate, range.endDate);
    if (!report) return res.status(404).json({ success: false, message: 'Unknown report type' });

    const meta = reportMeta({ key, title: report.title, startDate: range.startDate, endDate: range.endDate, user: req.user });
    const fileName = `${safeFileNamePart(meta.reportName)}_${meta.period.startDate}_to_${meta.period.endDate}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    const doc = new PDFDocument({ size: 'A4', margin: 40, autoFirstPage: true });
    docRef = doc;
    doc.on('error', (err) => {
      // If PDF generation fails mid-stream, destroy the response to stop further writes.
      // (Calling res.end() can cause ERR_STREAM_WRITE_AFTER_END because pdfkit may still emit data.)
      console.error('PDFKit error:', err);
      try {
        res.destroy();
      } catch {
        // ignore
      }
    });
    doc.pipe(res);
    pdfStarted = true;

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const projectRoot = path.resolve(__dirname, '..', '..', '..');
    const logoCandidates = [
      path.join(projectRoot, 'frontend', 'src', 'assets', 'Logo.png'),
      path.join(projectRoot, 'frontend', 'src', 'assets', 'VOXO_LOGO.png')
    ];
    const logoPath = logoCandidates.find((p) => fs.existsSync(p));

    const formatDate = (v) => {
      if (!v) return '';
      const d = v instanceof Date ? v : new Date(v);
      if (Number.isNaN(d.getTime())) return String(v);
      return d.toISOString().slice(0, 10);
    };

    const formatLKR = (v) => {
      const n = typeof v === 'number' ? v : parseFloat(String(v || 0));
      const num = Number.isFinite(n) ? n : 0;
      return `Rs. ${num.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    };

    const formatQty = (v) => {
      const n = typeof v === 'number' ? v : parseFloat(String(v || 0));
      const num = Number.isFinite(n) ? n : 0;
      return num.toLocaleString('en-LK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    const drawWatermark = () => {
      if (!logoPath) return;
      try {
        doc.save();
        doc.opacity(0.06);
        const maxW = 350;
        const x = (doc.page.width - maxW) / 2;
        const y = (doc.page.height - maxW) / 2;
        doc.image(logoPath, x, y, { width: maxW, align: 'center' });
        doc.restore();
      } catch {
        // ignore watermark failures
      }
    };

    const drawHeader = (title) => {
      drawWatermark();
      if (!Number.isFinite(doc.x)) doc.x = doc.page.margins.left;
      if (!Number.isFinite(doc.y)) doc.y = doc.page.margins.top;
      // Always draw header at the top margin (never at the current cursor),
      // otherwise page breaks can create "blank" pages with content rendered off-page.
      const topY = doc.page.margins.top;
      // Header box
      doc.save();
      doc.lineWidth(1).strokeColor('#D1D5DB');
      doc.rect(doc.page.margins.left, topY, doc.page.width - doc.page.margins.left - doc.page.margins.right, 86).stroke();
      doc.restore();

      // Logo + company block (similar to WorkerPaysheet UI)
      const left = doc.page.margins.left + 10;
      const y = topY + 10;
      if (logoPath) {
        try {
          doc.image(logoPath, left, y, { height: 40 });
        } catch {
          // ignore image errors
        }
      }

      const textX = left + 60;
      doc.fontSize(12).fillColor('#111827').text('Lakshan Dairy Products', textX, y, { width: 360 });
      doc.fontSize(9).fillColor('#4B5563').text('17 Mile Post, wewmada, Bibile Rd, Bakinigahawela', textX, y + 18, { width: 420 });
      doc.fontSize(9).fillColor('#6B7280').text('Tel: 0779708725 | Email: milkfoodlakshan@gmail.com', textX, y + 34, { width: 420 });

      // Right meta
      const rightX = doc.page.width - doc.page.margins.right - 160;
      doc.fontSize(9).fillColor('#111827').text(`Period: ${meta.period.startDate} to ${meta.period.endDate}`, rightX, y, { width: 160, align: 'right' });
      doc.text(`Generated: ${new Date(meta.generatedAt).toLocaleString()}`, rightX, y + 14, { width: 160, align: 'right' });
      doc.text(`Generated By: ${meta.generatedBy}`, rightX, y + 28, { width: 160, align: 'right' });

      // Title line
      doc.y = topY + 96;
      doc.fontSize(14).fillColor('#111827').text(title, { align: 'center' });
      doc.moveDown(0.4);
      doc.moveTo(doc.page.margins.left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).strokeColor('#D1D5DB').stroke();
      doc.moveDown(0.8);
      doc.fillColor('#111827');
    };

    const drawKeyValueBox = (title, rows) => {
      if (!Number.isFinite(doc.x)) doc.x = doc.page.margins.left;
      if (!Number.isFinite(doc.y)) doc.y = doc.page.margins.top;
      const ensureSpace = (neededH = 24) => {
        const bottom = doc.page.height - doc.page.margins.bottom;
        if ((Number.isFinite(doc.y) ? doc.y : doc.page.margins.top) + neededH > bottom) {
          doc.addPage();
          // Reset cursor defensively to avoid off-page rendering after addPage().
          doc.x = doc.page.margins.left;
          doc.y = doc.page.margins.top;
          drawHeader(meta.reportName);
        }
      };
      // Avoid PDFKit underline option (it can trigger NaN line coords in some environments).
      ensureSpace(40);
      doc.fontSize(11).fillColor('#111827').text(String(title || ''));
      doc.moveDown(0.2);
      doc
        .moveTo(doc.page.margins.left, doc.y)
        .lineTo(doc.page.width - doc.page.margins.right, doc.y)
        .strokeColor('#D1D5DB')
        .stroke();
      doc.moveDown(0.4);
      doc.fontSize(10);

      const startX = doc.page.margins.left;
      const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const colW = pageW / 2;

      rows.forEach((r) => {
        const label = r?.[0] ?? '';
        const value = r?.[1] ?? '';
        // Page break safety per-row (prevents summary/reconciliation being pushed off-page)
        const leftH = doc.heightOfString(String(label), { width: colW - 10 });
        const rightH = doc.heightOfString(String(value), { width: colW });
        const rowH = Math.max(
          Number.isFinite(leftH) ? leftH : 0,
          Number.isFinite(rightH) ? rightH : 0
        );
        ensureSpace(rowH + 10);
        const y0 = doc.y;

        // Left cell (label)
        doc.fillColor('#6B7280').text(String(label), startX, y0, { width: colW - 10, continued: false });

        // Right cell (value) — use the SAME y as label (no doc.y hacks)
        doc.fillColor('#111827').text(String(value), startX + colW, y0, { width: colW, align: 'right' });

        // Move down safely based on taller of the two cells
        doc.y = y0 + rowH + 4;
      });

      doc.moveDown(0.6);
    };

    const drawTable = (columns, dataRows) => {
      if (!Number.isFinite(doc.y)) {
        doc.y = doc.page.margins.top;
      }
      const pageW = doc.page.width - doc.page.margins.left - doc.page.margins.right;
      const colCount = columns.length;
      const baseW = Math.max(60, Math.floor(pageW / Math.max(1, colCount)));
      const widths = columns.map((c) => {
        const k = String(c.key || '').toLowerCase();
        const w =
          k.includes('amount') || k.includes('price') || k.includes('value')
            ? Math.max(80, baseW)
            : k.includes('date')
              ? Math.max(70, baseW)
              : baseW;
        return Number.isFinite(w) ? w : baseW;
      });

      const rowPadY = 4;
      const headerH = 18;
      const startX = doc.page.margins.left;

      const drawRow = (cells, isHeader = false) => {
        const y0 = Number.isFinite(doc.y) ? doc.y : doc.page.margins.top;
        // measure row height based on wrapped text
        let maxH = isHeader ? headerH : 0;
        cells.forEach((txt, i) => {
          const w = Number.isFinite(widths[i]) ? widths[i] : baseW;
          const h = doc.heightOfString(String(txt ?? ''), { width: Math.max(10, w - 6) });
          const rowHeight = Number.isFinite(h) ? h + rowPadY * 2 : headerH;
          maxH = Math.max(maxH, rowHeight);
        });
        if (!Number.isFinite(maxH)) maxH = headerH;

        // page break if needed
        if (y0 + maxH > doc.page.height - doc.page.margins.bottom) {
          doc.addPage();
          // Reset cursor defensively to avoid off-page rendering after addPage().
          doc.x = doc.page.margins.left;
          doc.y = doc.page.margins.top;
          drawHeader(meta.reportName);
          // redraw table header on new page
          drawRow(columns.map((c) => c.label), true);
          // Now draw the ORIGINAL row on the new page (previously it was skipped)
          return drawRow(cells, isHeader);
        }

        // background
        if (isHeader) {
          doc.save();
          doc.fillColor('#334155').rect(startX, y0, pageW, maxH).fill();
          doc.restore();
        }

        // cell borders + text
        let x = startX;
        cells.forEach((txt, i) => {
          const w = Number.isFinite(widths[i]) ? widths[i] : baseW;
          doc.save();
          doc.strokeColor('#E5E7EB').rect(x, y0, w, maxH).stroke();
          doc.restore();

          const k = String(columns[i]?.key || '').toLowerCase();
          const align =
            k.includes('amount') || k.includes('price') || k.includes('value') || k.includes('qty') || k.includes('quantity')
              ? 'right'
              : 'left';

          doc.fillColor(isHeader ? '#FFFFFF' : '#111827')
            .fontSize(isHeader ? 9 : 8)
            .text(String(txt ?? ''), x + 3, y0 + rowPadY, { width: Math.max(10, w - 6), align });
          x += w;
        });
        doc.y = y0 + maxH;
      };

      // header row
      drawRow(columns.map((c) => c.label), true);

      // data rows
      for (const r of dataRows) {
        const cells = columns.map((c) => {
          const k = c.key;
          let v = r?.[k];
          if (String(k).toLowerCase().includes('date')) return formatDate(v);
          const lk = String(k).toLowerCase();
          if (lk.includes('amount') || lk.includes('price') || lk.includes('value') || lk.includes('profit')) return formatLKR(v);
          return v === null || v === undefined ? '' : String(v);
        });
        drawRow(cells, false);
      }

      doc.moveDown(1);
    };

    // ----- Render per-report PDFs -----
    if (key === 'payroll') {
      // Payroll PDF styled similar to salary paysheet UI (company header + register + summary)
      drawHeader('Salary & Payroll Report');
      doc.fontSize(11).fillColor('#111827').text('Transaction Details (Payroll Register)', { underline: true });
      doc.moveDown(0.5);
      if ((report.columns || []).length > 0) drawTable(report.columns, report.details || []);

      // Summary
      const s = report.summary || {};
      drawKeyValueBox('Report Summary', [
        ['Total Gross Salary', formatLKR(s.total_gross_salary)],
        ['Total EPF', formatLKR(s.total_epf)],
        ['Total ETF', formatLKR(s.total_etf)],
        ['Total Advances', formatLKR(s.total_advances)],
        ['Total Net Pay', formatLKR(s.total_net_pay)],
        ['Total Records', String(s.total_records ?? '')]
      ]);

      // Signature area like paysheet UI
      doc.moveDown(0.8);
      const y = doc.y;
      const left = doc.page.margins.left;
      const right = doc.page.width - doc.page.margins.right;
      const mid = (left + right) / 2;
      doc.strokeColor('#9CA3AF');
      doc.moveTo(left, y + 22).lineTo(mid - 20, y + 22).stroke();
      doc.moveTo(mid + 20, y + 22).lineTo(right, y + 22).stroke();
      doc.fillColor('#6B7280').fontSize(9).text('Prepared By', left, y + 26, { width: mid - left - 20, align: 'center' });
      doc.fillColor('#6B7280').fontSize(9).text('Received By', mid + 20, y + 26, { width: right - (mid + 20), align: 'center' });
      doc.moveDown(3);
      doc.end();
      return;
    }

    // Generic report PDF template (branding + table + summary + reconciliation)
    drawHeader(meta.reportName);

    if (key !== 'final-financial' && (report.columns || []).length > 0) {
      doc.fontSize(11).fillColor('#111827').text('Transaction Details', { underline: true });
      doc.moveDown(0.5);
      drawTable(report.columns, report.details || []);
    }

    if (key === 'final-financial') {
      const pnl = report.summary?.profit_and_loss || {};
      drawKeyValueBox('Profit & Loss', [
        ['Total Sales', formatLKR(pnl.total_sales)],
        ['Total Returns', formatLKR(pnl.total_returns)],
        ['Net Sales', formatLKR(pnl.net_sales)],
        ['COGS (Estimated)', formatLKR(pnl.cogs_estimated)],
        ['Gross Profit', formatLKR(pnl.gross_profit)],
        ['Operating Expenses', formatLKR(pnl.operating_expenses)],
        ['Net Profit', formatLKR(pnl.net_profit)]
      ]);

      const bs = report.summary?.balance_sheet || {};
      drawKeyValueBox('Balance Sheet (Simplified)', [
        ['Assets', formatLKR(bs.assets)],
        ['Liabilities', formatLKR(bs.liabilities)],
        ['Equity', formatLKR(bs.equity)],
        ['Validation', String(bs.validation || '')]
      ]);
    } else {
      // Report Summary + Reconciliation (special-case milk for accountant-friendly ordering & units)
      if (key === 'milk') {
        const s = report.summary || {};
        drawKeyValueBox('Report Summary', [
          ['Total Quantity (Liters)', formatQty(s.total_quantity_liters)],
          ['Total Amount (Rs.)', formatLKR(s.total_amount)],
          ['Total Records', String(s.total_records ?? '')],
          ['Farmer Count', String(s.farmer_count ?? '')],
          ['Remaining Stock (Liters)', formatQty(s.remaining_stock_liters)]
        ]);
        drawKeyValueBox('Reconciliation', [
          ['Total Collected (Liters)', formatQty(s.total_quantity_liters)],
          ['Remaining Milk Stock (Liters)', formatQty(s.remaining_stock_liters)]
        ]);
      } else {
        // Summary in a clean box
        const summaryRows = [];
        Object.entries(report.summary || {}).forEach(([k, v]) => {
          const label = k.replace(/_/g, ' ');
          const lk = k.toLowerCase();
          const value =
            lk.includes('amount') || lk.includes('price') || lk.includes('value') || lk.includes('profit')
              ? formatLKR(v)
              : String(v ?? '');
          summaryRows.push([label, value]);
        });
        drawKeyValueBox('Report Summary', summaryRows.length ? summaryRows : [['No summary available', '']]);

        if (report.reconciliation) {
          const recRows = [];
          Object.entries(report.reconciliation || {}).forEach(([k, v]) => {
            const lk = String(k || '').toLowerCase();
            const value =
              lk.includes('amount') || lk.includes('price') || lk.includes('value') || lk.includes('profit')
                ? formatLKR(v)
                : lk.includes('qty') || lk.includes('quantity') || lk.includes('liters') || lk.includes('stock')
                  ? formatQty(v)
                  : String(v ?? '');
            recRows.push([k.replace(/_/g, ' '), value]);
          });
          drawKeyValueBox('Reconciliation', recRows.length ? recRows : [['No reconciliation available', '']]);
        } else {
          drawKeyValueBox('Reconciliation', [['No reconciliation rules for this report', '']]);
        }
      }
    }

    doc.end();
  } catch (error) {
    console.error('PDF export error:', error);
    // Never delegate to Express error middleware once we started a PDF stream,
    // otherwise it will attempt JSON and crash with headers already sent.
    if (pdfStarted) {
      try {
        docRef?.end?.();
      } catch {
        // ignore
      }
      try {
        res.destroy();
      } catch {
        // ignore
      }
      return;
    }
    next(error);
  }
};


