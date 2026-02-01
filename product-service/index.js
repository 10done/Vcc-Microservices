const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Database connection pool
const pool = new Pool({
    host: process.env.DB_HOST || '192.168.56.104',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'products_db',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Test database connection
pool.query('SELECT NOW()', (err, res) => {
    if (err) {
        console.error('❌ Database connection failed:', err.message);
        console.error('   Please check database configuration and connectivity');
    } else {
        console.log('✓ Database connected successfully at', res.rows[0].now);
        console.log('✓ Products table initialized');
    }
});

// Handle database errors
pool.on('error', (err) => {
    console.error('Unexpected database error:', err);
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path} - IP: ${req.ip}`);
    next();
});

// Health check endpoint
app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.json({
            status: 'OK',
            service: 'Product Service',
            database: 'Connected',
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        res.status(503).json({
            status: 'ERROR',
            service: 'Product Service',
            database: 'Disconnected',
            error: error.message
        });
    }
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        service: 'E-Commerce Product Service',
        version: '1.0.0',
        endpoints: {
            'GET /api/products': 'Get all products',
            'GET /api/products/:id': 'Get product by ID',
            'POST /api/products': 'Create new product',
            'PUT /api/products/:id': 'Update product',
            'DELETE /api/products/:id': 'Delete product',
            'GET /health': 'Health check'
        }
    });
});

// ==================== CRUD ENDPOINTS ====================

// GET - Get all products
app.get('/api/products', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT * FROM products ORDER BY id ASC'
        );
        
        console.log(`✓ Retrieved ${result.rows.length} products`);
        
        res.json({
            success: true,
            count: result.rows.length,
            data: result.rows
        });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch products',
            message: error.message
        });
    }
});

// GET - Get single product by ID
app.get('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const result = await pool.query(
            'SELECT * FROM products WHERE id = $1',
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Product not found',
                message: `Product with ID ${id} does not exist`
            });
        }
        
        console.log(`✓ Retrieved product ID: ${id}`);
        
        res.json({
            success: true,
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error fetching product:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch product',
            message: error.message
        });
    }
});

// POST - Create new product
app.post('/api/products', async (req, res) => {
    try {
        const { name, description, price, stock } = req.body;
        
        // Validation
        if (!name || !price || stock === undefined) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                message: 'Name, price, and stock are required fields'
            });
        }
        
        if (price < 0) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                message: 'Price cannot be negative'
            });
        }
        
        if (stock < 0) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                message: 'Stock cannot be negative'
            });
        }
        
        const result = await pool.query(
            'INSERT INTO products (name, description, price, stock) VALUES ($1, $2, $3, $4) RETURNING *',
            [name, description || null, price, stock]
        );
        
        console.log(`✓ Created product: ${name} (ID: ${result.rows[0].id})`);
        
        res.status(201).json({
            success: true,
            message: 'Product created successfully',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error creating product:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create product',
            message: error.message
        });
    }
});

// PUT - Update product
app.put('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, description, price, stock } = req.body;
        
        // Validation
        if (!name || !price || stock === undefined) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                message: 'Name, price, and stock are required fields'
            });
        }
        
        if (price < 0 || stock < 0) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                message: 'Price and stock cannot be negative'
            });
        }
        
        const result = await pool.query(
            'UPDATE products SET name = $1, description = $2, price = $3, stock = $4, updated_at = CURRENT_TIMESTAMP WHERE id = $5 RETURNING *',
            [name, description || null, price, stock, id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Product not found',
                message: `Product with ID ${id} does not exist`
            });
        }
        
        console.log(`✓ Updated product ID: ${id}`);
        
        res.json({
            success: true,
            message: 'Product updated successfully',
            data: result.rows[0]
        });
    } catch (error) {
        console.error('Error updating product:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update product',
            message: error.message
        });
    }
});

// DELETE - Delete product
app.delete('/api/products/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        const result = await pool.query(
            'DELETE FROM products WHERE id = $1 RETURNING id, name',
            [id]
        );
        
        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                error: 'Product not found',
                message: `Product with ID ${id} does not exist`
            });
        }
        
        console.log(`✓ Deleted product: ${result.rows[0].name} (ID: ${id})`);
        
        res.json({
            success: true,
            message: 'Product deleted successfully',
            data: {
                id: result.rows[0].id,
                name: result.rows[0].name
            }
        });
    } catch (error) {
        console.error('Error deleting product:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete product',
            message: error.message
        });
    }
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        message: `The requested endpoint ${req.method} ${req.path} does not exist`
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal server error',
        message: err.message
    });
});

// Start server
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log('==========================================');
    console.log('    E-Commerce Product Service');
    console.log('==========================================');
    console.log(`  Status: ✓ Running`);
    console.log(`  Port: ${PORT}`);
    console.log(`  Host: 0.0.0.0 (accessible from network)`);
    console.log(`  Database: ${process.env.DB_HOST}:${process.env.DB_PORT}`);
    console.log('==========================================');
    console.log('  Endpoints:');
    console.log('    GET    /api/products');
    console.log('    GET    /api/products/:id');
    console.log('    POST   /api/products');
    console.log('    PUT    /api/products/:id');
    console.log('    DELETE /api/products/:id');
    console.log('==========================================');
    console.log(`  Started at: ${new Date().toISOString()}`);
    console.log('==========================================');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        pool.end(() => {
            console.log('Database pool closed');
            process.exit(0);
        });
    });
});

process.on('SIGINT', () => {
    console.log('\nSIGINT received. Shutting down gracefully...');
    server.close(() => {
        console.log('Server closed');
        pool.end(() => {
            console.log('Database pool closed');
            process.exit(0);
        });
    });
});
