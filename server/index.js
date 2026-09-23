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
app.use('/api/auth', limiter(15, 30, 'login attempts'));
app.use(['/api/daily-check/evaluate', '/api/daily-check/run', '/api/review-tasks/rebuild', '/api/ai'],
  limiter(15, 150, 'AI requests'));
app.use('/api', limiter(15, 3000, 'requests'));

// ---------------------
// AUTH MIDDLEWARE
// ---------------------
const { authMiddleware } = require('./src/middleware/auth');

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
app.use('/api/organisations', authMiddleware, orgRoutes);

const creatorRoutes = require('./src/routes/creators');
app.use('/api/creators', authMiddleware, creatorRoutes);

const chatterRoutes = require('./src/routes/chatters');
app.use('/api/chatters', authMiddleware, chatterRoutes);

const shiftRoutes = require('./src/routes/shifts');
app.use('/api/shifts', authMiddleware, shiftRoutes);

const taskRoutes = require('./src/routes/tasks');
app.use('/api/tasks', authMiddleware, taskRoutes);

const cycleRoutes = require('./src/routes/cycles');
app.use('/api/cycles', authMiddleware, cycleRoutes);

const uploadRoutes = require('./src/routes/uploads');
app.use('/api/uploads', authMiddleware, uploadRoutes);

const metricsRoutes = require('./src/routes/metrics');
app.use('/api/metrics', authMiddleware, metricsRoutes);

const aiRoutes = require('./src/routes/ai');
app.use('/api/ai', authMiddleware, aiRoutes);

const dailyCheckRoutes = require('./src/routes/dailyCheck');
app.use('/api/daily-check', authMiddleware, dailyCheckRoutes);

const reviewTaskRoutes = require('./src/routes/reviewTasks');
app.use('/api/review-tasks', authMiddleware, reviewTaskRoutes);

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
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
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
