import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type ErrorRequestHandler } from 'express';
import { engine } from 'express-handlebars';
import cookieParser from 'cookie-parser';
import morgan from 'morgan';
import helmet from 'helmet';

import { env, isProd } from './config/env.js';
import { formatVnd, formatDateTime, CATEGORY_LABELS } from './lib/format.js';
import { can, type Permission } from './auth/permissions.js';
import { browserId, flash, multipart, csrfProtection, csrfToken } from './middleware/security.js';
import { loadUser } from './auth/middleware.js';
import { HttpError } from './lib/http.js';

import publicRouter from './modules/public/routes.js';
import authRouter from './auth/routes.js';
import adminRouter from './modules/admin/routes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const viewsDir = path.join(__dirname, 'views');
const publicDir = path.join(process.cwd(), 'public');

export function createApp() {
  const app = express();

  // Basic security headers & logging
  app.use(
    helmet({
      contentSecurityPolicy: false, // Allows flexible CDN assets / inline SVGs in SSR templates
    }),
  );
  if (!isProd) {
    app.use(morgan('dev'));
  }

  // Static assets
  app.use(express.static(publicDir));

  // Handlebars template engine setup
  app.engine(
    'hbs',
    engine({
      extname: '.hbs',
      defaultLayout: 'public',
      layoutsDir: path.join(viewsDir, 'layouts'),
      partialsDir: path.join(viewsDir, 'partials'),
      helpers: {
        formatVnd: (val: unknown) => formatVnd(val),
        formatDateTime: (val: unknown) => formatDateTime(val),
        categoryLabel: (cat: string) => CATEGORY_LABELS[cat] ?? cat,
        eq: (a: unknown, b: unknown) => a === b,
        neq: (a: unknown, b: unknown) => a !== b,
        gt: (a: unknown, b: unknown) => Number(a) > Number(b),
        gte: (a: unknown, b: unknown) => Number(a) >= Number(b),
        lt: (a: unknown, b: unknown) => Number(a) < Number(b),
        lte: (a: unknown, b: unknown) => Number(a) <= Number(b),
        or: (a: unknown, b: unknown) => Boolean(a || b),
        and: (a: unknown, b: unknown) => Boolean(a && b),
        not: (a: unknown) => !a,
        concat: (...args: unknown[]) => args.slice(0, -1).join(''),
        can: (user: unknown, perm: unknown) => can(user as any, perm as Permission),
        json: (val: unknown) => JSON.stringify(val),
        add: (a: unknown, b: unknown) => Number(a) + Number(b),
        subtract: (a: unknown, b: unknown) => Number(a) - Number(b),
      },
    }),
  );
  app.set('view engine', 'hbs');
  app.set('views', viewsDir);

  // Body and cookie parsing
  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(cookieParser(env.CSRF_SECRET));

  // Multipart parser (for image uploads)
  app.use(multipart);

  // Browser ID cookie for CSRF binding + Flash messages
  app.use(browserId);
  app.use(flash);

  // Double-submit CSRF protection + inject csrfToken helper to res.locals
  app.use(csrfProtection);
  app.use(csrfToken);

  // Load user from Supabase auth cookie and link to Prisma Profile
  app.use(loadUser);

  // App routes
  app.use('/', publicRouter);
  app.use('/', authRouter);
  app.use('/admin', adminRouter);

  // 404 Handler
  app.use((req, res, _next) => {
    const isAdmin = req.path.startsWith('/admin');
    res.status(404).render('pages/errors/404', {
      layout: isAdmin ? 'admin' : 'public',
      title: 'Page Not Found',
      path: req.path,
    });
  });

  // Global Error Handler
  const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
    const status = err instanceof HttpError ? err.status : err.status || 500;
    const isAdmin = req.path.startsWith('/admin');
    const layout = isAdmin ? 'admin' : 'public';

    if (status === 403) {
      return res.status(403).render('pages/errors/403', {
        layout,
        title: 'Access Denied',
        message: err.message || 'You do not have permission to view this resource.',
      });
    }

    if (status === 404) {
      return res.status(404).render('pages/errors/404', {
        layout,
        title: 'Not Found',
        message: err.message || 'The requested resource was not found.',
      });
    }

    if (!isProd) {
      console.error('[Error]', err);
    }

    res.status(status).render('pages/errors/500', {
      layout,
      title: 'Server Error',
      message: isProd ? 'An unexpected server error occurred.' : err.message,
      stack: isProd ? null : err.stack,
    });
  };

  app.use(errorHandler);

  return app;
}
