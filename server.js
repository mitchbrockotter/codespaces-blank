/**
 * P&K Backend Automation - Main Server
 * Express.js server with authentication and user management
 */

const express = require('express');
const session = require('express-session');
const path = require('path');
const userDb = require('./src/users/userDatabase');
const auth = require('./src/users/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  secret: 'pk-backend-automation-secret-key-2026',
  resave: false,
  saveUninitialized: true,
  cookie: { 
    secure: false, // Set to true in production with HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

// Middleware to attach user info to request
app.use(auth.getUserInfo);

// ============= PAGES =============

/**
 * Home Page
 */
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/**
 * Login Page
 */
app.get('/login', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/dashboard');
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

/**
 * Dashboard (Protected - Customer & Admin)
 */
app.get('/dashboard', auth.isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

/**
 * Admin Panel (Protected - Admin only)
 */
app.get('/admin', auth.isAuthenticated, auth.isAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

/**
 * User Environment (Protected - Customer & Admin)
 */
app.get('/environment', auth.isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'environment.html'));
});

// ============= API ENDPOINTS =============

/**
 * Login API
 * POST /api/login
 */
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const user = userDb.authenticateUser(username, password);

  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // Update last login
  userDb.updateUserLastLogin(user.id);
  
  // Log login activity
  userDb.logActivity(user.id, 'login', `User ${username} logged in`);

  // Store user info in session
  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.email = user.email;
  req.session.company = user.company;
  req.session.role = user.role;
  req.session.environment = user.environment;

  // Get redirect path from user settings
  const redirectPath = userDb.getUserRedirectPath(user.id);

  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      company: user.company,
      role: user.role,
      environment: user.environment
    },
    redirect: redirectPath
  });
});

/**
 * Logout API
 * POST /api/logout
 */
app.post('/api/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Could not logout' });
    }
    res.json({ success: true });
  });
});

/**
 * Get current user info
 * GET /api/user
 */
app.get('/api/user', auth.isAuthenticated, (req, res) => {
  res.json({
    id: req.session.userId,
    username: req.session.username,
    email: req.session.email,
    company: req.session.company,
    role: req.session.role,
    environment: req.session.environment
  });
});

/**
 * Get environment details
 * GET /api/environment
 */
app.get('/api/environment', auth.isAuthenticated, (req, res) => {
  const envData = userDb.getUserEnvironment(req.session.userId);
  
  if (!envData) {
    return res.status(404).json({ error: 'Environment not found' });
  }

  // Add sample environment data based on role
  const environmentDetails = {
    ...envData,
    dashboards: ['Overview', 'Performance', 'Logs', 'Alerts'],
    services: ['API Server', 'Database', 'Cache', 'Queue'],
    status: 'Operational',
    uptime: '99.9%'
  };

  res.json(environmentDetails);
});

/**
 * Get all users (Admin only)
 * GET /api/users
 */
app.get('/api/users', auth.isAuthenticated, auth.isAdmin, (req, res) => {
  const allUsers = userDb.users.map(u => {
    const { password: _, ...userWithoutPassword } = u;
    return userWithoutPassword;
  });
  res.json(allUsers);
});

/**
 * Create new user (Admin only)
 * POST /api/users
 */
app.post('/api/users', auth.isAuthenticated, auth.isAdmin, (req, res) => {
  const { username, email, password, company, role } = req.body;

  if (!username || !email || !password || !company) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const existingUser = userDb.findByUsername(username);
  if (existingUser) {
    return res.status(409).json({ error: 'Username already exists' });
  }

  const newUser = userDb.createUser({
    username,
    email,
    password,
    company,
    role
  });

  // Log activity
  userDb.logActivity(req.session.userId, 'create_user', `Created user: ${username}`);

  res.status(201).json({
    success: true,
    user: newUser
  });
});

/**
 * Get specific user (Admin only)
 * GET /api/users/:id
 */
app.get('/api/users/:id', auth.isAuthenticated, auth.isAdmin, (req, res) => {
  const userId = parseInt(req.params.id);
  const user = userDb.findById(userId);
  
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const { password: _, ...userWithoutPassword } = user;
  res.json(userWithoutPassword);
});

/**
 * Update user (Admin only)
 * PUT /api/users/:id
 */
app.put('/api/users/:id', auth.isAuthenticated, auth.isAdmin, (req, res) => {
  const userId = parseInt(req.params.id);
  const { email, company, role, environment, redirectPath, status } = req.body;

  const updatedUser = userDb.updateUser(userId, {
    email,
    company,
    role,
    environment,
    redirectPath,
    status
  });

  if (!updatedUser) {
    return res.status(404).json({ error: 'User not found' });
  }

  // Log activity
  userDb.logActivity(req.session.userId, 'update_user', `Updated user: ${updatedUser.username}`);

  res.json({
    success: true,
    user: updatedUser
  });
});

/**
 * Delete user (Admin only)
 * DELETE /api/users/:id
 */
app.delete('/api/users/:id', auth.isAuthenticated, auth.isAdmin, (req, res) => {
  const userId = parseInt(req.params.id);
  
  // Prevent admin from deleting themselves
  if (userId === req.session.userId) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }

  const user = userDb.findById(userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  const success = userDb.deleteUser(userId);

  if (!success) {
    return res.status(500).json({ error: 'Could not delete user' });
  }

  // Log activity
  userDb.logActivity(req.session.userId, 'delete_user', `Deleted user: ${user.username}`);

  res.json({ success: true, message: 'User deleted successfully' });
});

/**
 * Set user redirect path (Admin only)
 * PUT /api/users/:id/redirect
 */
app.put('/api/users/:id/redirect', auth.isAuthenticated, auth.isAdmin, (req, res) => {
  const userId = parseInt(req.params.id);
  const { redirectPath } = req.body;

  if (!redirectPath) {
    return res.status(400).json({ error: 'Redirect path required' });
  }

  const success = userDb.setUserRedirectPath(userId, redirectPath);

  if (!success) {
    return res.status(404).json({ error: 'User not found' });
  }

  const user = userDb.findById(userId);
  userDb.logActivity(req.session.userId, 'update_redirect', `Updated redirect for ${user.username} to ${redirectPath}`);

  res.json({ success: true, user: user });
});

/**
 * Update user status (Admin only)
 * PUT /api/users/:id/status
 */
app.put('/api/users/:id/status', auth.isAuthenticated, auth.isAdmin, (req, res) => {
  const userId = parseInt(req.params.id);
  const { status } = req.body;

  if (!['active', 'inactive', 'suspended'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  const success = userDb.updateUserStatus(userId, status);

  if (!success) {
    return res.status(404).json({ error: 'User not found' });
  }

  const user = userDb.findById(userId);
  userDb.logActivity(req.session.userId, 'update_status', `Changed ${user.username} status to ${status}`);

  res.json({ success: true, user: user });
});

/**
 * Get activity log (Admin only)
 * GET /api/activities
 */
app.get('/api/activities', auth.isAuthenticated, auth.isAdmin, (req, res) => {
  const limit = req.query.limit || 50;
  const userId = req.query.userId || null;
  
  const activities = userDb.getActivityLog(parseInt(limit), userId ? parseInt(userId) : null);
  
  res.json({
    total: activities.length,
    activities: activities
  });
});

/**
 * Get system statistics (Admin only)
 * GET /api/stats
 */
app.get('/api/stats', auth.isAuthenticated, auth.isAdmin, (req, res) => {
  const stats = userDb.getSystemStats();
  res.json(stats);
});

// ============= ERROR HANDLING =============

/**
 * 404 Error Handler
 */
app.use((req, res) => {
  res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
});

// ============= START SERVER =============

app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════╗
║   P&K Backend Automation - Portal Server      ║
║   Server running on http://localhost:${PORT}        ║
╚════════════════════════════════════════════════╝
  `);
  console.log('\nTest Credentials:');
  console.log('  Username: acme_customer');
  console.log('  Password: password123');
  console.log('\n  Username: techstart_admin');
  console.log('  Password: securepass456');
});

module.exports = app;
