/**
 * Audomatic Crawler Service
 * Standalone Express server that handles website crawling with Puppeteer
 * Triggered by n8n workflows and saves results to Supabase
 */

const express = require('express');
const cors = require('cors');
const { crawlWebsite } = require('./crawler');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*'
}));
app.use(express.json());

// Simple API key authentication middleware
// Fails closed: if API_SECRET is not configured, all requests are rejected
const authenticateRequest = (req, res, next) => {
  if (!process.env.API_SECRET) {
    console.error('API_SECRET is not set — all requests rejected for safety');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }
  const apiSecret = req.headers['x-api-secret'] || req.query.secret;
  if (apiSecret === process.env.API_SECRET) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
};

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    service: 'audomatic-crawler',
    version: '1.0.0'
  });
});

// Crawl endpoint - triggered by n8n
app.post('/crawl', authenticateRequest, async (req, res) => {
  const { auditId, url } = req.body;

  // Validate request
  if (!auditId || !url) {
    return res.status(400).json({ 
      error: 'Missing required fields: auditId and url are required' 
    });
  }

  // Validate URL format
  try {
    new URL(url);
  } catch (error) {
    return res.status(400).json({ 
      error: 'Invalid URL format' 
    });
  }

  console.log(`[${new Date().toISOString()}] Starting crawl for audit ${auditId}: ${url}`);

  // Start crawling asynchronously (don't wait for completion)
  crawlWebsite(auditId, url)
    .then(() => {
      console.log(`[${new Date().toISOString()}] Crawl completed for audit ${auditId}`);
    })
    .catch((error) => {
      console.error(`[${new Date().toISOString()}] Crawl failed for audit ${auditId}:`, error);
    });

  // Immediately respond that crawling has started
  res.json({ 
    message: 'Crawl started successfully',
    auditId,
    url 
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Audomatic Crawler Service running on port ${PORT}`);
  console.log(`📍 POST /crawl - Start website crawl`);
  console.log(`📍 GET /health - Health check`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});








