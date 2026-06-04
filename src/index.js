/**
 * Core Application Server
 * Initializer for the Ubuntu microservice environment.
 */

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import auditRouter from './routes/audit.routes.js';
import { requireApiKey } from './utils/security.js';
import { closeBrowser } from './services/render-html.service.js';

dotenv.config();

// 1. Production Fail-Closed Configuration Sentinel
if (process.env.NODE_ENV === 'production' && !process.env.REVREBEL_API_KEY) {
  console.error('❌ CRITICAL STARTUP ERROR: REVREBEL_API_KEY must be defined when running in production mode.');
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 3000;

// Perimeter Middleware Defenses
app.use(helmet());
app.use(cors({ origin: '*' }));
app.use(express.json());

// Serve static elements (OpenAPI documentation assets)
app.use(express.static('public'));

// Unauthenticated baseline monitor
app.get('/health', (req, res) => {
  res.json({ status: 'UP', timestamp: new Date().toISOString() });
});

// Authenticated analytical paths
app.use('/api', requireApiKey, auditRouter);

// Global Error Handler for Express 5 native async promise rejections
app.use((err, req, res, next) => {
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction) {
    console.error(`[Orchestration Failure Error Tracking]:`, err && err.message ? err.message : err);
  } else {
    // Log richer diagnostic information in non-production environments
    if (err && err.stack) {
      console.error(`[Orchestration Failure Error Tracking]:`, err.stack);
    } else {
      console.error(`[Orchestration Failure Error Tracking]:`, err);
    }
  }

  res.status(500).json({ success: false, error: 'Internal server orchestration structure fault.' });
});

// 2. Explicit listener variable assignment to prevent graceful shutdown crashes
const server = app.listen(PORT, () => {
  console.log(`🚀 REVREBEL Secure Audit Core mounted on port ${PORT}`);
});

// Graceful teardown protocol to catch system interrupts cleanly
const gracefulShutdown = async () => {
  console.log('\nStopping system services gracefully...');
  
  // Force exit after 10 seconds to prevent hanging on active connections
  const timeoutHandle = setTimeout(() => {
    console.error('Forcing shutdown due to timeout...');
    process.exit(1);
  }, 10000);

  server.close(async () => {
    clearTimeout(timeoutHandle);
    await closeBrowser();
    console.log('Headless browser singletons liquidated. Server safely offline.');
    process.exit(0);
  });
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);