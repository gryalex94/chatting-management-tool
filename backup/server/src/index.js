const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();
const aiRoutes = require('./routes/ai');


const app = express();
const PORT = process.env.PORT || 3001;

// ---------------------
// MIDDLEWARE
// ---------------------
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));


// CORS - allow frontend to talk to backend
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true,
}));

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
app.use('/api/ai', authMiddleware, aiRoutes);


// ---------------------
// ERROR HANDLING
// ---------------------
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
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
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
