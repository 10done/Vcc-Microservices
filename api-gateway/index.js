const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const PRODUCT_SERVICE_URL = process.env.PRODUCT_SERVICE_URL || 'http://192.168.56.102:3001';

// Middleware
app.use(cors());
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.url} - Client: ${req.ip}`);
    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        service: 'API Gateway',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Home route - API information
app.get('/', (req, res) => {
    res.json({
        service: 'E-Commerce API Gateway',
        version: '1.0.0',
        description: 'Centralized entry point for microservices',
        endpoints: {
            products: '/products',
            health: '/health'
        },
        documentation: 'https://github.com/yourusername/ecommerce-microservices'
    });
});

// Proxy configuration for Product Service
const productServiceProxy = createProxyMiddleware({
    target: PRODUCT_SERVICE_URL,
    changeOrigin: true,
    pathRewrite: {
        '^/products': '/api/products', // rewrite path
    },
    onProxyReq: (proxyReq, req, res) => {
        console.log(`→ Proxying ${req.method} request to Product Service: ${req.url}`);
    },
    onProxyRes: (proxyRes, req, res) => {
        console.log(`← Received response from Product Service: ${proxyRes.statusCode}`);
    },
    onError: (err, req, res) => {
        console.error('Proxy error:', err.message);
        res.status(500).json({
            success: false,
            error: 'Gateway error - unable to reach Product Service',
            message: err.message
        });
    }
});

// Route all /products requests to Product Service
app.use('/products', productServiceProxy);

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        message: `The requested endpoint ${req.method} ${req.url} does not exist`,
        availableEndpoints: {
            products: '/products',
            health: '/health',
            home: '/'
        }
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('Gateway error:', err);
    res.status(500).json({
        success: false,
        error: 'Internal gateway error',
        message: err.message
    });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
    console.log('==========================================');
    console.log('    E-Commerce API Gateway');
    console.log('==========================================');
    console.log(`  Status: ✓ Running`);
    console.log(`  Port: ${PORT}`);
    console.log(`  Host: 0.0.0.0 (accessible from network)`);
    console.log(`  Product Service: ${PRODUCT_SERVICE_URL}`);
    console.log('==========================================');
    console.log(`  Endpoints:`);
    console.log(`    - GET  / (API info)`);
    console.log(`    - GET  /health (Health check)`);
    console.log(`    - ALL  /products (Proxy to Product Service)`);
    console.log('==========================================');
    console.log(`  Started at: ${new Date().toISOString()}`);
    console.log('==========================================');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    server.close(() => {
        console.log('Gateway closed');
        process.exit(0);
    });
});
