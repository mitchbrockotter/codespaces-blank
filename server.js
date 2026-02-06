/**
 * P&K Backend Automation - Main Server
 * Express.js server with authentication and user management
 */

const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const userDb = require('./src/users/userDatabase');
const auth = require('./src/users/auth');
const envDb = require('./src/environments/environmentDatabase');

const app = express();
const PORT = process.env.PORT || 3000;

// CORS - Allow frontend to connect from different domain
const allowedOrigins = [
  'https://pkba.nl',
  'https://www.pkba.nl',
  'http://localhost:3000',
  'http://localhost:5173',
  'http://localhost:8080',
];

// Allow any Vercel deployment
if (process.env.VERCEL_URL) {
  allowedOrigins.push(`https://${process.env.VERCEL_URL}`);
}
allowedOrigins.push(/\.vercel\.app$/); // Allow all Vercel preview URLs

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-User-Id', 'X-User-Role'],
  exposedHeaders: ['Set-Cookie'],
  maxAge: 86400
}));

// Simple request logging (don't modify res.json)
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`);
  next();
});

// Middleware
app.use(express.static('public'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'projects/')
  },
  filename: function (req, file, cb) {
    const timestamp = Date.now();
    cb(null, timestamp + '-' + file.originalname)
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: function (req, file, cb) {
    // Only allow .jar files
    if (file.originalname.endsWith('.jar')) {
      cb(null, true)
    } else {
      cb(new Error('Only .jar files are allowed'))
    }
  }
});

// Session configuration
app.use(session({
  secret: 'pk-backend-automation-secret-key-2026',
  resave: true, // Force save to ensure cookie is always set
  saveUninitialized: true,
  cookie: { 
    secure: true, // Always use HTTPS (Railway auto-redirects)
    httpOnly: true, // Prevent JavaScript access
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'none', // Allow cross-domain cookies
    path: '/'
  },
  name: 'sessionId' // Custom session cookie name
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
 * Frontend checks localStorage for authentication
 */
app.get('/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

/**
 * Admin Panel (Protected - Admin only)
 * Frontend checks localStorage for authentication
 */
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

/**
 * User Environment (Protected - Customer & Admin)
 * Frontend checks localStorage for authentication
 */
app.get('/environment', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'environment.html'));
});

// ============= API ENDPOINTS =============

/**
 * Login API
 * POST /api/login
 */
app.post('/api/login', (req, res) => {
  console.log('=== LOGIN REQUEST ===');
  console.log('Username/Email:', req.body.username);
  
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const user = userDb.authenticateUser(username, password);

  if (!user) {
    console.log('❌ Authentication failed for user:', username);
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  console.log('✅ User authenticated:', { id: user.id, username: user.username, role: user.role });
  
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

  console.log('📝 Session stored:', { 
    userId: req.session.userId, 
    username: req.session.username, 
    role: req.session.role 
  });

  // Get redirect path from user settings
  const redirectPath = userDb.getUserRedirectPath(user.id);

  console.log('✅ Login successful, redirecting to:', redirectPath);

  // Explicitly save the session before sending response
  req.session.save((err) => {
    if (err) {
      console.error('⚠️ Session save error:', err);
    } else {
      console.log('✅ Session saved successfully');
    }
    
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
  console.log('GET /api/user - Session:', {
    userId: req.session.userId,
    username: req.session.username,
    role: req.session.role
  });
  
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
 * Get environment details for current user
 * GET /api/environment
 */
app.get('/api/environment', auth.isAuthenticated, (req, res) => {
  // Get user's environments from environment database
  const userEnvironments = envDb.getEnvironmentsByUserId(req.session.userId);
  
  if (!userEnvironments || userEnvironments.length === 0) {
    return res.status(404).json({ 
      error: 'No environment found',
      message: 'Contact your administrator to create an environment for you.'
    });
  }

  // Return the first (primary) environment with enhanced data
  const primaryEnv = userEnvironments[0];
  const environmentDetails = {
    id: primaryEnv.id,
    name: primaryEnv.name,
    description: primaryEnv.description,
    status: primaryEnv.status === 'active' ? 'Operational' : primaryEnv.status,
    company: req.session.company,
    tools: primaryEnv.tools || [],
    dashboards: ['Overview', 'Performance', 'Logs', 'Alerts'],
    services: ['API Server', 'Database', 'Cache', 'Queue'],
    uptime: '99.9%',
    createdAt: primaryEnv.createdAt,
    updatedAt: primaryEnv.updatedAt
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

  const existingEmail = userDb.findByEmail(email);
  if (existingEmail) {
    return res.status(409).json({ error: 'Email already exists' });
  }

  const newUser = userDb.createUser({
    username,
    email,
    password,
    company,
    role
  });

  // Automatically create isolated environment for new customer
  if (role === 'customer') {
    const environmentName = `${company} - Customer Environment`;
    const environmentDescription = `Dedicated environment for ${company}. Upload automation tools and reports here.`;
    
    envDb.createEnvironment({
      userId: newUser.id,
      name: environmentName,
      description: environmentDescription,
      status: 'active'
    });
    
    userDb.logActivity(req.session.userId, 'create_environment', `Auto-created environment for new user: ${username}`);
  }

  // Log activity
  userDb.logActivity(req.session.userId, 'create_user', `Created user: ${username} (${email})`);

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

// ============= ENVIRONMENT API ROUTES =============

/**
 * Get all environments (Admin only)
 * GET /api/environments
 */
app.get('/api/environments', auth.isAuthenticated, auth.isAdmin, (req, res) => {
  const environments = envDb.getAllEnvironments();
  
  // Enrich with user information
  const enrichedEnvironments = environments.map(env => {
    const user = userDb.findById(env.userId);
    return {
      ...env,
      username: user ? user.username : 'Unknown',
      company: user ? user.company : 'Unknown'
    };
  });
  
  res.json(enrichedEnvironments);
});

/**
 * Get environments for current user
 * GET /api/environments/my
 */
app.get('/api/environments/my', auth.isAuthenticated, (req, res) => {
  const environments = envDb.getEnvironmentsByUserId(req.session.userId);
  res.json(environments);
});

/**
 * Get environment by ID
 * GET /api/environments/:id
 */
app.get('/api/environments/:id', auth.isAuthenticated, (req, res) => {
  const environment = envDb.getEnvironmentById(req.params.id);
  
  if (!environment) {
    return res.status(404).json({ error: 'Environment not found' });
  }
  
  // Check if user has access (admin or owner)
  if (req.session.role !== 'admin' && environment.userId !== req.session.userId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  res.json(environment);
});

/**
 * Create new environment (Admin only)
 * POST /api/environments
 */
app.post('/api/environments', auth.isAuthenticated, auth.isAdmin, (req, res) => {
  const { userId, name, description, status } = req.body;
  
  if (!userId || !name) {
    return res.status(400).json({ error: 'User ID and name are required' });
  }
  
  // Verify user exists
  const user = userDb.findById(parseInt(userId));
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  
  const newEnvironment = envDb.createEnvironment({
    userId: parseInt(userId),
    name,
    description,
    status
  });
  
  // Log activity
  userDb.logActivity(req.session.userId, 'create_environment', `Created environment: ${name} for user ${user.username}`);
  
  res.status(201).json(newEnvironment);
});

/**
 * Update environment (Admin only)
 * PUT /api/environments/:id
 */
app.put('/api/environments/:id', auth.isAuthenticated, auth.isAdmin, (req, res) => {
  const { name, description, status, tools } = req.body;
  
  const updatedEnvironment = envDb.updateEnvironment(req.params.id, {
    name,
    description,
    status,
    tools
  });
  
  if (!updatedEnvironment) {
    return res.status(404).json({ error: 'Environment not found' });
  }
  
  // Log activity
  userDb.logActivity(req.session.userId, 'update_environment', `Updated environment: ${updatedEnvironment.name}`);
  
  res.json(updatedEnvironment);
});

/**
 * Delete environment (Admin only)
 * DELETE /api/environments/:id
 */
app.delete('/api/environments/:id', auth.isAuthenticated, auth.isAdmin, (req, res) => {
  const environment = envDb.getEnvironmentById(req.params.id);
  
  if (!environment) {
    return res.status(404).json({ error: 'Environment not found' });
  }
  
  const success = envDb.deleteEnvironment(req.params.id);
  
  if (success) {
    // Log activity
    userDb.logActivity(req.session.userId, 'delete_environment', `Deleted environment: ${environment.name}`);
    res.json({ success: true, message: 'Environment deleted successfully' });
  } else {
    res.status(500).json({ error: 'Failed to delete environment' });
  }
});

/**
 * Add tool to environment
 * POST /api/environments/:id/tools
 */
app.post('/api/environments/:id/tools', auth.isAuthenticated, (req, res) => {
  const { toolName } = req.body;
  
  if (!toolName) {
    return res.status(400).json({ error: 'Tool name is required' });
  }
  
  const environment = envDb.getEnvironmentById(req.params.id);
  
  if (!environment) {
    return res.status(404).json({ error: 'Environment not found' });
  }
  
  // Check access
  if (req.session.role !== 'admin' && environment.userId !== req.session.userId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  const updatedEnvironment = envDb.addTool(req.params.id, toolName);
  
  // Log activity
  userDb.logActivity(req.session.userId, 'add_tool', `Added tool "${toolName}" to environment ${environment.name}`);
  
  res.json(updatedEnvironment);
});

/**
 * Remove tool from environment
 * DELETE /api/environments/:id/tools/:toolName
 */
app.delete('/api/environments/:id/tools/:toolName', auth.isAuthenticated, (req, res) => {
  const environment = envDb.getEnvironmentById(req.params.id);
  
  if (!environment) {
    return res.status(404).json({ error: 'Environment not found' });
  }
  
  // Check access
  if (req.session.role !== 'admin' && environment.userId !== req.session.userId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  const updatedEnvironment = envDb.removeTool(req.params.id, req.params.toolName);
  
  // Log activity
  userDb.logActivity(req.session.userId, 'remove_tool', `Removed tool "${req.params.toolName}" from environment ${environment.name}`);
  
  res.json(updatedEnvironment);
});

/**
 * Upload IntelliJ project (JAR file) to environment
 * POST /api/environments/:id/projects/upload
 */
app.post('/api/environments/:id/projects/upload', auth.isAuthenticated, auth.isAdmin, upload.single('jarFile'), (req, res) => {
  const environment = envDb.getEnvironmentById(req.params.id);
  
  if (!environment) {
    return res.status(404).json({ error: 'Environment not found' });
  }
  
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  
  const projectName = req.body.projectName || req.file.originalname.replace('.jar', '');
  
  // Add project to environment
  const project = envDb.addProject(req.params.id, {
    name: projectName,
    jarFile: req.file.filename
  });
  
  // Log activity
  userDb.logActivity(req.session.userId, 'upload_project', `Uploaded project "${projectName}" to environment ${environment.name}`);
  
  res.status(201).json({
    success: true,
    project: project
  });
});

/**
 * Run IntelliJ project JAR
 * POST /api/environments/:id/projects/:projectName/run
 */
app.post('/api/environments/:id/projects/:projectName/run', auth.isAuthenticated, (req, res) => {
  const environment = envDb.getEnvironmentById(req.params.id);
  
  if (!environment) {
    return res.status(404).json({ error: 'Environment not found' });
  }
  
  // Check access
  if (req.session.role !== 'admin' && environment.userId !== req.session.userId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  const project = environment.projects && environment.projects.find(p => p.name === req.params.projectName);
  
  if (!project) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  // Log activity
  userDb.logActivity(req.session.userId, 'run_project', `Executed project "${req.params.projectName}" in environment ${environment.name}`);
  
  // In production, you would use child_process.spawn to actually execute the JAR
  // For now, we'll just return a success message
  res.json({
    success: true,
    message: `Project "${req.params.projectName}" started successfully`,
    projectName: req.params.projectName,
    jarFile: project.jarFile
  });
});

/**
 * Get projects in environment
 * GET /api/environments/:id/projects
 */
app.get('/api/environments/:id/projects', auth.isAuthenticated, (req, res) => {
  const environment = envDb.getEnvironmentById(req.params.id);
  
  if (!environment) {
    return res.status(404).json({ error: 'Environment not found' });
  }
  
  // Check access
  if (req.session.role !== 'admin' && environment.userId !== req.session.userId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  
  res.json(environment.projects || []);
});

/**
 * Delete project from environment
 * DELETE /api/environments/:id/projects/:projectName
 */
app.delete('/api/environments/:id/projects/:projectName', auth.isAuthenticated, auth.isAdmin, (req, res) => {
  const environment = envDb.getEnvironmentById(req.params.id);
  
  if (!environment) {
    return res.status(404).json({ error: 'Environment not found' });
  }
  
  const deleted = envDb.removeProject(req.params.id, req.params.projectName);
  
  if (!deleted) {
    return res.status(404).json({ error: 'Project not found' });
  }
  
  // Log activity
  userDb.logActivity(req.session.userId, 'delete_project', `Deleted project "${req.params.projectName}" from environment ${environment.name}`);
  
  res.json({
    success: true,
    message: `Project "${req.params.projectName}" deleted successfully`
  });
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
