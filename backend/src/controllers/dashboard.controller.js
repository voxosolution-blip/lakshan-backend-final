// Dashboard Controller
import pool from '../config/db.js';

// Get admin dashboard data
export const getAdminDashboard = async (req, res, next) => {
  try {
    // Get total farmers
    const farmersResult = await pool.query('SELECT COUNT(*) as count FROM farmers WHERE is_active = true');
    
    // Get total milk inventory
    const milkResult = await pool.query(`
      SELECT COALESCE(SUM(quantity_liters), 0) as total
      FROM milk_collections
      WHERE date = CURRENT_DATE
    `);
    
    // Get today's sales (exclude reversed)
    const salesResult = await pool.query(`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(total_amount), 0) as total
      FROM sales
      WHERE date = CURRENT_DATE AND is_reversed = false
    `);
    
    // Get total revenue (exclude reversed)
    const revenueResult = await pool.query(`
      SELECT COALESCE(SUM(total_amount), 0) as total
      FROM sales
      WHERE is_reversed = false
    `);
    
    // Get pending payments (exclude reversed)
    const pendingResult = await pool.query(`
      SELECT COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0) as total
      FROM sales
      WHERE payment_status IN ('pending', 'partial') AND is_reversed = false
    `);
    
    // Get active products
    const productsResult = await pool.query('SELECT COUNT(*) as count FROM products WHERE is_active = true');
    
    res.json({
      success: true,
      data: {
        totalFarmers: parseInt(farmersResult.rows[0]?.count || 0),
        todayMilk: parseFloat(milkResult.rows[0]?.total || 0),
        todaySales: parseFloat(salesResult.rows[0]?.total || 0),
        totalRevenue: parseFloat(revenueResult.rows[0]?.total || 0),
        pendingPayments: parseFloat(pendingResult.rows[0]?.total || 0),
        activeProducts: parseInt(productsResult.rows[0]?.count || 0)
      }
    });
  } catch (error) {
    next(error);
  }
};

// Get sales dashboard data
export const getSalesDashboard = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    
    // Get today's sales for this salesperson (exclude reversed)
    const todayResult = await pool.query(`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(total_amount), 0) as total
      FROM sales
      WHERE salesperson_id = $1 AND date = CURRENT_DATE AND is_reversed = false
    `, [userId]);
    
    // Get this month's sales (exclude reversed)
    const monthResult = await pool.query(`
      SELECT 
        COUNT(*) as count,
        COALESCE(SUM(total_amount), 0) as total
      FROM sales
      WHERE salesperson_id = $1 
        AND date >= DATE_TRUNC('month', CURRENT_DATE)
        AND is_reversed = false
    `, [userId]);
    
    res.json({
      success: true,
      data: {
        todaySales: {
          count: parseInt(todayResult.rows[0]?.count || 0),
          total: parseFloat(todayResult.rows[0]?.total || 0)
        },
        monthSales: {
          count: parseInt(monthResult.rows[0]?.count || 0),
          total: parseFloat(monthResult.rows[0]?.total || 0)
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

// Update salesperson location
export const updateSalespersonLocation = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { latitude, longitude, accuracy } = req.body;
    
    if (!latitude || !longitude) {
      return res.status(400).json({ success: false, message: 'Latitude and longitude are required' });
    }
    
    // Check if user is a salesperson
    const userResult = await pool.query('SELECT role FROM users WHERE id = $1', [userId]);
    if (userResult.rows.length === 0) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    if (userResult.rows[0].role !== 'SALESPERSON') {
      return res.status(403).json({ success: false, message: 'Only salespersons can update location' });
    }
    
    // Upsert location (insert or update)
    const result = await pool.query(`
      INSERT INTO salesperson_locations (user_id, latitude, longitude, accuracy, last_updated)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      ON CONFLICT (user_id) 
      DO UPDATE SET 
        latitude = EXCLUDED.latitude,
        longitude = EXCLUDED.longitude,
        accuracy = EXCLUDED.accuracy,
        last_updated = CURRENT_TIMESTAMP
      RETURNING *
    `, [userId, latitude, longitude, accuracy || null]);
    
    res.json({
      success: true,
      data: result.rows[0],
      message: 'Location updated successfully'
    });
  } catch (error) {
    console.error('Error updating salesperson location:', error);
    next(error);
  }
};

// Get all salesperson locations (for admin)
export const getAllSalespersonLocations = async (req, res, next) => {
  try {
    const userRole = req.user.role;
    
    // Only admin can view all salesperson locations
    if (userRole !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Only admins can view salesperson locations' });
    }
    
    // Get all active salespersons with their latest locations
    const result = await pool.query(`
      SELECT 
        u.id,
        u.name,
        u.username,
        u.email,
        sl.latitude,
        sl.longitude,
        sl.accuracy,
        sl.last_updated
      FROM users u
      LEFT JOIN salesperson_locations sl ON u.id = sl.user_id
      WHERE u.role = 'SALESPERSON' 
        AND u.is_active = true
        AND sl.latitude IS NOT NULL
        AND sl.longitude IS NOT NULL
        AND sl.last_updated > CURRENT_TIMESTAMP - INTERVAL '1 hour'
      ORDER BY sl.last_updated DESC
    `);
    
    const locations = result.rows.map(row => ({
      userId: row.id,
      name: row.name || row.username,
      username: row.username,
      email: row.email,
      location: {
        latitude: parseFloat(row.latitude),
        longitude: parseFloat(row.longitude),
        accuracy: row.accuracy ? parseFloat(row.accuracy) : null
      },
      lastUpdated: row.last_updated
    }));
    
    res.json({
      success: true,
      data: locations
    });
  } catch (error) {
    console.error('Error getting salesperson locations:', error);
    next(error);
  }
};

// Get product sales data for pie chart
export const getProductSalesData = async (req, res, next) => {
  try {
    // Get sales grouped by product for the current year
    const currentYear = new Date().getFullYear();
    const result = await pool.query(`
      SELECT 
        p.id as product_id,
        p.name as product_name,
        COALESCE(SUM(si.quantity * si.price), 0) as total_amount,
        COALESCE(SUM(si.quantity), 0) as total_quantity,
        COUNT(DISTINCT si.sale_id) as sale_count
      FROM sale_items si
      JOIN products p ON si.product_id = p.id
      JOIN sales s ON si.sale_id = s.id
      WHERE EXTRACT(YEAR FROM s.date) = $1
      GROUP BY p.id, p.name
      ORDER BY total_amount DESC
    `, [currentYear]);
    
    // Calculate total for percentage calculation
    const totalSales = result.rows.reduce((sum, row) => sum + parseFloat(row.total_amount || 0), 0);
    
    // Format data with percentages
    const chartData = result.rows.map(row => {
      const amount = parseFloat(row.total_amount || 0);
      const percentage = totalSales > 0 ? (amount / totalSales) * 100 : 0;
      return {
        productId: row.product_id,
        productName: row.product_name,
        amount: amount,
        quantity: parseFloat(row.total_quantity || 0),
        count: parseInt(row.sale_count || 0),
        percentage: parseFloat(percentage.toFixed(2))
      };
    });
    
    res.json({
      success: true,
      data: chartData,
      totalSales: totalSales
    });
  } catch (error) {
    console.error('Error getting product sales data:', error);
    next(error);
  }
};

// Get daily milk stock and usage data for chart
export const getDailyMilkChartData = async (req, res, next) => {
  try {
    // Get current year and calculate start date (January 1st of current year)
    const currentYear = new Date().getFullYear();
    const startDate = `${currentYear}-01-01`;
    
    // Get Raw Materials category ID
    const categoryResult = await pool.query(
      `SELECT id FROM inventory_categories 
       WHERE name IN ('Raw Materials', 'Raw Material')
       LIMIT 1`
    );
    
    if (categoryResult.rows.length === 0) {
      return res.json({ success: true, data: [] });
    }
    
    const categoryId = categoryResult.rows[0].id;
    
    // Get daily milk collections from January 1st to today
    const dailyCollectionResult = await pool.query(`
      SELECT 
        date,
        COALESCE(SUM(quantity_liters), 0) as daily_collected
      FROM milk_collections
      WHERE date >= $1::date AND date <= CURRENT_DATE
      GROUP BY date
      ORDER BY date ASC
    `, [startDate]);
    
    // Get daily milk usage from productions from January 1st to today
    const dailyUsageResult = await pool.query(`
      SELECT 
        p.date,
        COALESCE(SUM(
          CASE 
            WHEN pb.unit = 'liter' OR pb.unit = 'l' THEN p.quantity_produced * pb.quantity_required
            WHEN pb.unit = 'ml' THEN p.quantity_produced * pb.quantity_required / 1000.0
            WHEN pb.unit = 'kg' THEN p.quantity_produced * pb.quantity_required
            ELSE p.quantity_produced * pb.quantity_required
          END
        ), 0) as daily_used
      FROM productions p
      JOIN product_bom pb ON p.product_id = pb.product_id
      JOIN inventory_items i ON pb.inventory_item_id = i.id
      WHERE i.name = 'Milk' 
        AND i.category_id = $1
        AND p.date >= $2::date AND p.date <= CURRENT_DATE
      GROUP BY p.date
      ORDER BY p.date ASC
    `, [categoryId, startDate]);
    
    // Create a map of dates to data
    const dataMap = new Map();
    
    // Initialize all dates from January 1st to today
    // Use explicit date creation to avoid timezone issues
    const startYear = currentYear;
    const startMonth = 0; // January (0-indexed)
    const startDay = 1;
    
    const today = new Date();
    const endYear = today.getFullYear();
    const endMonth = today.getMonth();
    const endDay = today.getDate();
    
    // Create dates in local timezone
    const startDateObj = new Date(startYear, startMonth, startDay);
    const endDate = new Date(endYear, endMonth, endDay);
    
    for (let d = new Date(startDateObj); d <= endDate; d.setDate(d.getDate() + 1)) {
      // Format as YYYY-MM-DD using local date components
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      
      dataMap.set(dateStr, {
        date: dateStr,
        collection: 0,
        usage: 0
      });
    }
    
    // Add collection data (daily collected amounts)
    dailyCollectionResult.rows.forEach(row => {
      // Format date using local timezone to match dataMap keys
      const date = new Date(row.date);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      if (dataMap.has(dateStr)) {
        dataMap.get(dateStr).collection = parseFloat(row.daily_collected || 0);
      } else {
        console.log(`[DEBUG] Date ${dateStr} not found in dataMap for collection: ${row.daily_collected}`);
      }
    });
    
    // Add usage data (daily used amounts)
    dailyUsageResult.rows.forEach(row => {
      // Format date using local timezone to match dataMap keys
      const date = new Date(row.date);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      if (dataMap.has(dateStr)) {
        dataMap.get(dateStr).usage = parseFloat(row.daily_used || 0);
      }
    });
    
    // Convert to array - return daily collection and daily usage
    const chartData = Array.from(dataMap.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(item => {
        return {
          date: item.date,
          collection: item.collection || 0,
          usage: item.usage || 0
        };
      });
    
    // Debug: Log some sample data
    if (chartData.length > 0) {
      console.log(`[Milk Chart] Total dates: ${chartData.length}, Sample:`, chartData.slice(0, 3));
      const hasCollection = chartData.some(d => d.collection > 0);
      const hasUsage = chartData.some(d => d.usage > 0);
      console.log(`[Milk Chart] Has collection data: ${hasCollection}, Has usage data: ${hasUsage}`);
    }
    
    res.json({
      success: true,
      data: chartData
    });
  } catch (error) {
    console.error('Error getting daily milk chart data:', error);
    next(error);
  }
};

// Get aggregated salesperson allocated stock (remaining after sales)
export const getSalespersonStock = async (req, res, next) => {
  try {
    // Only admin can view all salesperson stock
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Only admins can view salesperson stock' });
    }

    // Get aggregated remaining stock for all salespersons
    // quantity_allocated is already reduced when sales are made
    const result = await pool.query(`
      SELECT 
        pr.id as product_id,
        pr.name as product_name,
        COALESCE(SUM(sa.quantity_allocated), 0) as total_remaining
      FROM salesperson_allocations sa
      JOIN products pr ON sa.product_id = pr.id
      WHERE sa.status = 'active'
        AND pr.is_active = true
      GROUP BY pr.id, pr.name
      HAVING SUM(sa.quantity_allocated) > 0
      ORDER BY pr.name
    `);

    const stockData = result.rows.map(row => ({
      productId: row.product_id,
      productName: row.product_name,
      remainingStock: parseFloat(row.total_remaining || 0)
    }));

    res.json({
      success: true,
      data: stockData
    });
  } catch (error) {
    console.error('Error getting salesperson stock:', error);
    next(error);
  }
};

// Get shop-wise sales data for chart (admin only)
export const getShopWiseSalesData = async (req, res, next) => {
  try {
    // Get sales grouped by shop for the current year
    const currentYear = new Date().getFullYear();
    const result = await pool.query(`
      SELECT 
        b.id as shop_id,
        b.shop_name,
        COALESCE(SUM(s.total_amount), 0) as total_amount,
        COUNT(DISTINCT s.id) as sale_count
      FROM buyers b
      LEFT JOIN sales s ON b.id = s.buyer_id 
        AND EXTRACT(YEAR FROM s.date) = $1
        AND s.is_reversed = false
      WHERE b.is_active = true
      GROUP BY b.id, b.shop_name
      HAVING COUNT(DISTINCT s.id) > 0
      ORDER BY total_amount DESC
      LIMIT 20
    `, [currentYear]);
    
    // Format data for chart
    const chartData = result.rows.map(row => ({
      shopId: row.shop_id,
      shopName: row.shop_name || 'Unknown Shop',
      totalAmount: parseFloat(row.total_amount || 0),
      saleCount: parseInt(row.sale_count || 0)
    }));
    
    res.json({
      success: true,
      data: chartData
    });
  } catch (error) {
    console.error('Error getting shop-wise sales data:', error);
    next(error);
  }
};

// Get finished goods inventory chart data (admin only)
export const getFinishedGoodsChartData = async (req, res, next) => {
  try {
    // Get current year and calculate start date (January 1st of current year)
    const currentYear = new Date().getFullYear();
    const startDate = `${currentYear}-01-01`;
    
    // Get Finished Goods category ID
    const categoryResult = await pool.query(
      `SELECT id FROM inventory_categories 
       WHERE name = 'Finished Goods'
       LIMIT 1`
    );
    
    if (categoryResult.rows.length === 0) {
      return res.json({ success: true, data: [] });
    }
    
    const categoryId = categoryResult.rows[0].id;
    
    // Get daily production data for finished goods from January 1st to today
    const productionResult = await pool.query(`
      SELECT 
        p.date,
        pr.name as product_name,
        COALESCE(SUM(p.quantity_produced), 0) as quantity_produced
      FROM productions p
      JOIN products pr ON p.product_id = pr.id
      WHERE p.date >= $1::date AND p.date <= CURRENT_DATE
      GROUP BY p.date, pr.name
      ORDER BY p.date ASC, pr.name ASC
    `, [startDate]);
    
    // Get daily sales data for finished goods (from sale_items)
    const salesResult = await pool.query(`
      SELECT 
        s.date,
        pr.name as product_name,
        COALESCE(SUM(si.quantity), 0) as quantity_sold
      FROM sales s
      JOIN sale_items si ON s.id = si.sale_id
      JOIN products pr ON si.product_id = pr.id
      WHERE s.date >= $1::date 
        AND s.date <= CURRENT_DATE
        AND s.is_reversed = false
      GROUP BY s.date, pr.name
      ORDER BY s.date ASC, pr.name ASC
    `, [startDate]);
    
    // Get current inventory levels for finished goods
    const inventoryResult = await pool.query(`
      SELECT 
        i.name as product_name,
        COALESCE(i.quantity, 0) as current_stock
      FROM inventory_items i
      WHERE i.category_id = $1
        AND i.quantity > 0
      ORDER BY i.name ASC
    `, [categoryId]);
    
    // Group production by date
    const productionByDate = {};
    productionResult.rows.forEach(row => {
      const date = row.date.toISOString().split('T')[0];
      if (!productionByDate[date]) {
        productionByDate[date] = {};
      }
      productionByDate[date][row.product_name] = parseFloat(row.quantity_produced || 0);
    });
    
    // Group sales by date
    const salesByDate = {};
    salesResult.rows.forEach(row => {
      const date = row.date.toISOString().split('T')[0];
      if (!salesByDate[date]) {
        salesByDate[date] = {};
      }
      salesByDate[date][row.product_name] = parseFloat(row.quantity_sold || 0);
    });
    
    // Get all unique dates
    const allDates = new Set();
    Object.keys(productionByDate).forEach(date => allDates.add(date));
    Object.keys(salesByDate).forEach(date => allDates.add(date));
    const sortedDates = Array.from(allDates).sort();
    
    // Get all unique product names
    const allProducts = new Set();
    productionResult.rows.forEach(row => allProducts.add(row.product_name));
    salesResult.rows.forEach(row => allProducts.add(row.product_name));
    inventoryResult.rows.forEach(row => allProducts.add(row.product_name));
    const productNames = Array.from(allProducts).sort();
    
    // Build chart data
    const chartData = sortedDates.map(date => {
      const dataPoint = { date };
      
      // Add production data for each product
      productNames.forEach(product => {
        const prodKey = `${product}_produced`;
        dataPoint[prodKey] = productionByDate[date]?.[product] || 0;
      });
      
      // Add sales data for each product
      productNames.forEach(product => {
        const salesKey = `${product}_sold`;
        dataPoint[salesKey] = salesByDate[date]?.[product] || 0;
      });
      
      return dataPoint;
    });
    
    // Build current inventory summary
    const currentInventory = inventoryResult.rows.map(row => ({
      productName: row.product_name,
      currentStock: parseFloat(row.current_stock || 0)
    }));
    
    res.json({
      success: true,
      data: {
        chartData,
        products: productNames,
        currentInventory
      }
    });
  } catch (error) {
    console.error('Error getting finished goods chart data:', error);
    next(error);
  }
};

// Get today's sales and returns by product (for admin dashboard)
export const getTodaySalesAndReturns = async (req, res, next) => {
  try {
    // Only admin can view today's sales and returns
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, message: 'Only admins can view today\'s sales and returns' });
    }

    const today = new Date().toISOString().split('T')[0];

    // sale_items has NO is_return column in this schema.
    // Returns are stored in the `returns` table, so compute sold vs returned from separate sources.
    const result = await pool.query(
      `
      WITH sold AS (
        SELECT
          si.product_id,
          COALESCE(SUM(si.quantity), 0)::numeric(12,2) AS sold_today
        FROM sales s
        JOIN sale_items si ON si.sale_id = s.id
        WHERE s.date = $1
        GROUP BY si.product_id
      ),
      ret AS (
        SELECT
          r.product_id,
          COALESCE(SUM(r.quantity), 0)::numeric(12,2) AS returned_today
        FROM returns r
        WHERE r.created_at::date = $1
        GROUP BY r.product_id
      )
      SELECT
        p.id AS product_id,
        p.name AS product_name,
        COALESCE(sold.sold_today, 0)::numeric(12,2) AS sold_today,
        COALESCE(ret.returned_today, 0)::numeric(12,2) AS returned_today
      FROM products p
      LEFT JOIN sold ON sold.product_id = p.id
      LEFT JOIN ret ON ret.product_id = p.id
      WHERE p.is_active = true
        AND (COALESCE(sold.sold_today, 0) > 0 OR COALESCE(ret.returned_today, 0) > 0)
      ORDER BY p.name
      `,
      [today]
    );

    const data = result.rows.map(row => ({
      productId: row.product_id,
      productName: row.product_name,
      soldToday: parseFloat(row.sold_today || 0),
      returnedToday: parseFloat(row.returned_today || 0)
    }));

    res.json({
      success: true,
      data: data
    });
  } catch (error) {
    console.error('Error getting today\'s sales and returns:', error);
    next(error);
  }
};

