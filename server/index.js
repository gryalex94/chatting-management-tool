const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
// Railway sits in front of the app — trust its proxy so rate limits see the real client IP.
app.set('trust proxy', 1);

// ---------------------
// MIDDLEWARE
// ---------------------
app.use(helmet());
app.use(morgan('dev'));
// File uploads go through multer (multipart), so JSON bodies never need to be large.
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// CORS - allow frontend to talk to backend
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));

const DB_ERROR_RE = /violates|duplicate key|relation "|column "|syntax error|invalid input (syntax|value)|foreign key|null value in column|PGRST\d|numeric field overflow|out of range for type/i;
// Many route handlers answer `{ error: error.message }` straight from the database.
// For server-side failures (5xx) that would show table names and query details
// to the browser, so the real message is logged here and the browser gets a
// generic one. Client errors (4xx) keep their text — those are written for users.
app.use((req, res, next) => {
  const json = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 500 && body && typeof body === 'object' && 'error' in body) {
      console.error(`[${req.method} ${req.originalUrl}] ${res.statusCode}:`, body.error);
      body = { error: 'Something went wrong on our side. Please try again — details are in the server log.' };
    } else if (res.statusCode >= 400 && body && typeof body === 'object' && DB_ERROR_RE.test(String(body.error || ''))) {
      // A 4xx that is really a raw Postgres/PostgREST message (constraint names,
      // columns, relations) — same treatment: log it, send something plain.
      console.error(`[${req.method} ${req.originalUrl}] ${res.statusCode}:`, body.error);
      body = { error: 'That request could not be saved. Check the values and try again.' };
    }
    return json(body);
  };
  next();
});

// ---------------------
// RATE LIMITS
// ---------------------
// Login/sign-up: slow down password guessing. AI routes: cap spend if an account
// is misused (a full "Create daily tasks" run is ~25 evaluations, well inside
// this). Everything else: a generous ceiling that normal use never reaches.
const limiter = (windowMin, max, what) => rateLimit({
  windowMs: windowMin * 60 * 1000, max, standardHeaders: true, legacyHeaders: false,
  message: { error: `Too many ${what} — please wait a few minutes and try again.` },
});
// /auth/login only checks an already-verified session token and the app calls it
// on every page load and token refresh, so it gets a roomy limit; the routes that
// create accounts or accept invitations keep a tight one. Password guessing
// itself happens against Supabase, which rate-limits sign-ins on its side.
app.use('/api/auth/login', limiter(15, 600, 'requests'));
app.use(['/api/auth/setup', '/api/auth/invite', '/api/auth/create-member', '/api/auth/accept-invite'],
  limiter(15, 30, 'account requests'));
app.use(['/api/daily-check/evaluate', '/api/daily-check/run', '/api/review-tasks/rebuild', '/api/ai'],
  limiter(15, 150, 'AI requests'));
app.use('/api', limiter(15, 3000, 'requests'));

// ---------------------
// AUTH MIDDLEWARE
// ---------------------
const { authMiddleware, requireMinRole } = require('./src/middleware/auth');
const { demoMask } = require('./src/utils/privacy');
// Every data route: a verified session, then demo-mode masking when the browser
// asks for it (X-Demo-Mode: 1), so masked sessions never receive raw fan data.
const protect = [authMiddleware, demoMask];
// Reviews, evaluations, metrics, uploads and chatter records are management data:
// the chatter role must not read them (or dismiss findings about themselves).
const staffOnly = [authMiddleware, requireMinRole('va'), demoMask];

// ---------------------
// ROUTES
// ---------------------

// Health check (no auth needed)
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth routes (login, signup, invite)
const authRoutes = require('./src/routes/auth');
app.use('/api/auth', authRoutes);

// Protected routes (require login)
const orgRoutes = require('./src/routes/organisations');
app.use('/api/organisations', protect, orgRoutes);

const creatorRoutes = require('./src/routes/creators');
app.use('/api/creators', protect, creatorRoutes);

const chatterRoutes = require('./src/routes/chatters');
app.use('/api/chatters', staffOnly, chatterRoutes);

const shiftRoutes = require('./src/routes/shifts');
app.use('/api/shifts', protect, shiftRoutes);

const taskRoutes = require('./src/routes/tasks');
app.use('/api/tasks', protect, taskRoutes);

const cycleRoutes = require('./src/routes/cycles');
app.use('/api/cycles', protect, cycleRoutes);

const uploadRoutes = require('./src/routes/uploads');
app.use('/api/uploads', staffOnly, uploadRoutes);

const metricsRoutes = require('./src/routes/metrics');
app.use('/api/metrics', staffOnly, metricsRoutes);

const aiRoutes = require('./src/routes/ai');
app.use('/api/ai', staffOnly, aiRoutes);

const dailyCheckRoutes = require('./src/routes/dailyCheck');
app.use('/api/daily-check', staffOnly, dailyCheckRoutes);

const reviewTaskRoutes = require('./src/routes/reviewTasks');
app.use('/api/review-tasks', staffOnly, reviewTaskRoutes);

// ---------------------
// ERROR HANDLING
// ---------------------
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  const isUploadError = err.name === 'MulterError' || /Only CSV and Excel/.test(err.message || '');
  const status = err.status || err.statusCode || (isUploadError ? 400 : 500);
  // Client mistakes (bad file type, file too large…) keep their helpful message;
  // server failures never expose internal/database details to the browser.
  res.status(status).json({
    error: status < 500 ? (err.message || 'Bad request') : 'Internal server error',
    // Internal details (stack traces) stay in the server log — never sent to the
    // browser, whatever NODE_ENV the host happens to be set to.
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ---------------------
// START SERVER
// ---------------------
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

// Keep process alive (Node v24 fix)
setInterval(() => {}, 1 << 30);

// Keep the process alive
server.on('error', (err) => {
  console.error('Server error:', err);
});

process.on('SIGINT', () => {
  console.log('Shutting down...');
  server.close();
  process.exit(0);
});

module.exports = app;
