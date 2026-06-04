/**
 * Core Application Server
 * Initializer for the Ubuntu microservice. Exposes hooks for Gemini tools.
 */

import express from 'express';
import auditRoutes from './routes/audit.routes.js';
import { closeBrowser } from './services/render-html.service.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Mount our specialized endpoints
app.use('/api', auditRoutes);

// Health Check Endpoint for upstream proxy/gateway validation
app.get('/health', (req, res) => {
  res.json({ status: 'UP', timestamp: new Date().toISOString() });
});

const server = app.listen(PORT, () => {
  console.log(`🚀 REVREBEL Modular Audit API running on port ${PORT}`);
});

// Graceful teardown to prevent orphan Chromium zombies on your Ubuntu server
const gracefulShutdown = async () => {
  console.log('\nShutting down gracefully...');
  server.close(async () => {
    await closeBrowser();
    console.log('Headless browser singletons closed. Process terminated safely.');
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);