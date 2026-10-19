import path from 'node:path';
import express, { type ErrorRequestHandler } from 'express';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import helmet from 'helmet';
import cors from 'cors';

import { env, isProd } from './config/env.js';
import { browserId, multipart, csrfProtection, csrfToken } from './middleware/security.js';
import { loadUser } from './auth/middleware.js';
import { HttpError, sendError, type ApiErrorCode } from './lib/http.js';

import publicRouter from './modules/public/routes.js';
import authRouter from './auth/routes.js';
import adminRouter from './modules/admin/routes.js';

const publicDir = path.join(process.cwd(), 'public');
const clientDistDir = path.join(process.cwd(), 'dist/client');

export function createApp() {
  const app = express();

  // Configure explicit CORS
  const configuredOrigins = env.CORS_ORIGIN
    ? env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
    : [];

  const defaultDevOrigins = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
  ];

  const allowedOrigins = Array.from(
    new Set([
      env.APP_URL,
      ...(!isProd ? defaultDevOrigins : []),
      ...configuredOrigins,
    ]),
  );

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, or same-origin)
        if (!origin || allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(null, false);
      },
      credentials: true,
      methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-csrf-token'],
      exposedHeaders: ['x-csrf-token'],
    }),
  );

  // Basic security headers & logging
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );
  if (!isProd) {
    app.use(morgan('dev'));
  }

  // Static assets: public files and built SPA client bundle
  app.use(express.static(publicDir));
  app.use(express.static(clientDistDir));

  // Body and cookie parsing
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(cookieParser(env.CSRF_SECRET));

  // Browser ID cookie for CSRF binding
  app.use(browserId);

  // Multipart parser (for image uploads)
  app.use(multipart);

  // Double-submit CSRF protection
  app.use(csrfProtection);
  app.use(csrfToken);

  // Load user from Supabase auth cookie and link to Prisma Profile
  app.use(loadUser);

  // REST API routes
  app.use('/api', publicRouter);
  app.use('/api/auth', authRouter);
  app.use('/api/admin', adminRouter);

  // SPA fallback for HTML navigation (production) or 404 for API
  app.use((req, res, next) => {
    if (req.path.startsWith('/api')) {
      return sendError(res, 404, 'NOT_FOUND', `Endpoint ${req.method} ${req.path} not found`);
    }
    if (req.method === 'GET' && req.accepts('html')) {
      return res.sendFile(path.join(clientDistDir, 'index.html'), (err) => {
        if (err) next(err);
      });
    }
    next();
  });

  // Global Error Handler returning consistent JSON response
  const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
    let status = err instanceof HttpError ? err.status : err.status || 500;
    let code: ApiErrorCode | string = err instanceof HttpError ? err.code : 'INTERNAL_ERROR';
    let message = err.message || 'An unexpected server error occurred.';
    const fields = err instanceof HttpError ? err.fields : undefined;

    // Handle doubleCsrf errors
    if (err.code === 'EBADCSRFTOKEN' || message.toLowerCase().includes('csrf')) {
      status = 403;
      code = 'CSRF_INVALID';
      message = 'CSRF token không hợp lệ hoặc đã hết hạn.';
    }

    if (!isProd && status >= 500) {
      console.error('[API Server Error]', err);
    }

    return sendError(res, status, code, isProd && status >= 500 ? 'An unexpected server error occurred.' : message, fields);
  };

  app.use(errorHandler);

  return app;
}
