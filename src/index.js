/**
 * Core Application Server
 * Initializer for the Ubuntu microservice. Exposes hooks for Gemini tools.
 */

import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import dotenv from 'dotenv';
import auditRouter from './routes/audit.routes.js';
import { requireApiKey } from './utils/security.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Mount explicit perimeter defense wrappers
app.use(helmet());
app.use(cors({ origin: '*' })); // Restrict this to your front-end/agent proxies later
app.use(express.json());

// Public Endpoint Checks
app.get('/health', (req, res) => {
  res.json({ status: 'UP', timestamp: new Date().toISOString() });
});

// Guarded Action Paths
app.use('/api', requireApiKey, auditRouter);

app.listen(PORT, () => {
  console.log(`🚀 REVREBEL Secure Audit Core successfully mounted on port ${PORT}`);
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