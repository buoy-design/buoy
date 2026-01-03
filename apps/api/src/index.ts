/**
 * Buoy Cloud API
 *
 * Cloudflare Workers entry point
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { nanoid } from 'nanoid';
import type { Env, Variables } from './env.js';
import { auth } from './routes/auth.js';
import { apiKeys } from './routes/api-keys.js';
import { projects } from './routes/projects.js';
import { requireAuth } from './middleware/auth.js';

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Request ID middleware
app.use('*', async (c, next) => {
  c.set('requestId', nanoid(12));
  await next();
});

// Logger
app.use('*', logger());

// CORS
app.use(
  '*',
  cors({
    origin: (origin, c) => {
      // Allow configured origin
      if (origin === c.env.CORS_ORIGIN) return origin;
      // Allow localhost in development
      if (c.env.ENVIRONMENT === 'development' && origin?.includes('localhost')) {
        return origin;
      }
      return null;
    },
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
    maxAge: 86400,
  })
);

// Health check
app.get('/', (c) => {
  return c.json({
    name: 'Buoy Cloud API',
    version: c.env.API_VERSION,
    environment: c.env.ENVIRONMENT,
    status: 'healthy',
  });
});

// Health check endpoint
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth routes (public)
app.route('/auth', auth);

// API key routes (authenticated)
app.use('/api-keys/*', requireAuth);
app.route('/api-keys', apiKeys);

// Project routes (authenticated)
app.use('/projects/*', requireAuth);
app.route('/projects', projects);

// 404 handler
app.notFound((c) => {
  return c.json(
    {
      error: 'Not Found',
      message: `Route ${c.req.method} ${c.req.path} not found`,
    },
    404
  );
});

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json(
    {
      error: 'Internal Server Error',
      message: c.env.ENVIRONMENT === 'development' ? err.message : 'An unexpected error occurred',
      requestId: c.get('requestId'),
    },
    500
  );
});

export default app;
