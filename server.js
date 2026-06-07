/**
 * P&K Backend Automation - Main Server
 * Express.js server with authentication and user management
 */

const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const nodemailer = require('nodemailer');
const userDb = require('./src/users/userDatabase');
const auth = require('./src/users/auth');
const envDb = require('./src/environments/environmentDatabase');

const app = express();
const PORT = process.env.PORT || 3000;
const CONTACT_RECIPIENT_EMAIL = 'pkbackendautomation@gmail.com';
const CONTACT_RATE_LIMIT_WINDOW_MS = Number(process.env.CONTACT_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const CONTACT_RATE_LIMIT_MAX_REQUESTS = Number(process.env.CONTACT_RATE_LIMIT_MAX_REQUESTS || 5);
const contactRateLimitStore = new Map();

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function createContactTransporter() {
  const host = process.env.CONTACT_SMTP_HOST || 'smtp.office365.com';
  const port = Number(process.env.CONTACT_SMTP_PORT || 587);
  const secure = process.env.CONTACT_SMTP_SECURE === 'true';
  const user = process.env.CONTACT_SMTP_USER;
  const pass = process.env.CONTACT_SMTP_PASS;

  if (!user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: {
      user,
      pass
    }
  });
}

function isContactRateLimited(ipAddress) {
  const now = Date.now();
  const cutoff = now - CONTACT_RATE_LIMIT_WINDOW_MS;
  const requests = (contactRateLimitStore.get(ipAddress) || []).filter((timestamp) => timestamp > cutoff);

  if (requests.length >= CONTACT_RATE_LIMIT_MAX_REQUESTS) {
    contactRateLimitStore.set(ipAddress, requests);
    return true;
  }

  requests.push(now);
  contactRateLimitStore.set(ipAddress, requests);
  return false;
}

function getCustomerEnvironmentName(user) {
  const companyName = (user.company || user.username || 'Customer').trim();
  return `${companyName} - Customer Environment`;
}

function ensureCustomerEnvironment(user) {
  if (!user || user.role !== 'customer') {
    return null;
  }

  const existingEnvironment = envDb.getEnvironmentByUserId(user.id);
  if (existingEnvironment) {
    if (user.environment !== existingEnvironment.name) {
      userDb.updateUser(user.id, { environment: existingEnvironment.name });
    }
    return existingEnvironment;
  }

  const environmentName = getCustomerEnvironmentName(user);
  const environmentDescription = `Dedicated environment for ${user.company || user.username}. Upload automation tools and reports here.`;
  const createdEnvironment = envDb.createEnvironment({
    userId: user.id,
    name: environmentName,
    description: environmentDescription,
    status: 'active'
  });

  userDb.updateUser(user.id, { environment: createdEnvironment.name });
  return createdEnvironment;
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value === 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  const unitIndex = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  const size = value / (1024 ** unitIndex);
  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function createCustomerEnvironmentAccount(accountData) {
  const username = accountData.username.trim();
  const company = accountData.company.trim();
  const environmentType = (accountData.type || 'general').trim() || 'general';
  const environmentName = accountData.name?.trim() || `${company} - ${environmentType.charAt(0).toUpperCase() + environmentType.slice(1)} Environment`;
  const description = accountData.description?.trim() || `Dedicated ${environmentType} environment for ${company}.`;

  const newUser = userDb.createUser({
    username,
    email: accountData.email.trim(),
    password: accountData.password,
    company,
    role: 'customer',
    environment: environmentName
  });

  const createdEnvironment = envDb.createEnvironment({
    userId: newUser.id,
    name: environmentName,
    description,
    type: environmentType,
    status: accountData.status || 'active'
  });

  userDb.updateUser(newUser.id, { environment: createdEnvironment.name, redirectPath: '/environment' });

  return { user: userDb.findById(newUser.id), environment: createdEnvironment };
}

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
  allowedHeaders: ['Content-Type', 'Authorization'],
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
 * Contact Page
 */
app.get('/contact', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'contact.html'));
});

/**
 * Dashboard (Protected - Customer & Admin)
 * Frontend checks localStorage for authentication
 */
app.get('/dashboard', auth.isAuthenticated, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'));
});

/**
 * Admin Panel (Protected - Admin only)
 * Frontend checks localStorage for authentication
 */
app.get('/admin', auth.isAuthenticated, auth.isAdmin, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

/**
 * User Environment (Protected - Customer & Admin)
 * Frontend checks localStorage for authentication
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

  const persistedUser = userDb.findById(user.id);
  if (persistedUser) {
    const customerEnvironment = ensureCustomerEnvironment(persistedUser);
    if (customerEnvironment) {
      envDb.recordEnvironmentLogin(customerEnvironment.id);
      user.environment = customerEnvironment.name;
    }
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
  req.session.environment = userDb.findById(user.id)?.environment || user.environment;

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
        environment: req.session.environment
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
 * Contact API
 * POST /api/contact
 */
app.post('/api/contact', async (req, res) => {
  const name = (req.body.name || '').trim();
  const email = (req.body.email || '').trim();
  const subject = (req.body.subject || '').trim();
  const emailText = (req.body.emailText || '').trim();
  const website = (req.body.website || '').trim();

  // Honeypot field: bots often fill hidden fields; return success to avoid probing.
  if (website) {
    return res.json({
      success: true,
      message: 'Bedankt voor uw bericht. Wij nemen zo snel mogelijk contact met u op.'
    });
  }

  if (isContactRateLimited(req.ip)) {
    return res.status(429).json({
      error: 'U heeft te veel berichten verstuurd in korte tijd. Probeert u het later opnieuw.'
    });
  }

  if (!name || !email || !subject || !emailText) {
    return res.status(400).json({ error: 'Vul alle verplichte velden in.' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Vul een geldig e-mailadres in.' });
  }

  if (name.length > 120 || subject.length > 200 || emailText.length > 5000) {
    return res.status(400).json({ error: 'Een of meer velden zijn te lang ingevuld.' });
  }

  const transporter = createContactTransporter();
  const fromEmail = process.env.CONTACT_FROM_EMAIL || process.env.CONTACT_SMTP_USER;
  const normalizedSubject = subject.replace(/[\r\n]+/g, ' ').trim();

  if (!transporter || !fromEmail) {
    console.error('Contact email configuration missing. Set CONTACT_SMTP_USER and CONTACT_SMTP_PASS.');
    return res.status(500).json({ error: 'De e-mailservice is momenteel niet beschikbaar.' });
  }

  const escapedName = escapeHtml(name);
  const escapedEmail = escapeHtml(email);
  const escapedSubject = escapeHtml(subject);
  const escapedMessage = escapeHtml(emailText).replace(/\n/g, '<br>');

  const customerMail = {
    from: `P&K Backend Automation <${fromEmail}>`,
    to: email,
    subject: 'Bedankt voor uw bericht aan P&K Backend Automation',
    text: `Beste ${name},\n\nHartelijk dank voor uw bericht aan P&K Backend Automation. Wij hebben uw aanvraag in goede orde ontvangen en nemen zo spoedig mogelijk contact met u op.\n\nMet vriendelijke groet,\nP&K Backend Automation`,
    html: `<p>Beste ${escapedName},</p><p>Hartelijk dank voor uw bericht aan P&K Backend Automation. Wij hebben uw aanvraag in goede orde ontvangen en nemen zo spoedig mogelijk contact met u op.</p><p>Met vriendelijke groet,<br>P&amp;K Backend Automation</p>`
  };

  const internalMail = {
    from: `P&K Backend Automation <${fromEmail}>`,
    to: CONTACT_RECIPIENT_EMAIL,
    replyTo: email,
    subject: `Nieuw contactformulier bericht: ${normalizedSubject}`,
    text: `Nieuw contactformulier bericht\n\nNaam: ${name}\nE-mail: ${email}\nOnderwerp: ${normalizedSubject}\n\nBericht:\n${emailText}\n\nVerzonden op: ${new Date().toISOString()}\nIP-adres: ${req.ip}`,
    html: `
      <h2>Nieuw contactformulier bericht</h2>
      <p><strong>Naam:</strong> ${escapedName}</p>
      <p><strong>E-mail:</strong> ${escapedEmail}</p>
      <p><strong>Onderwerp:</strong> ${escapedSubject}</p>
      <p><strong>Bericht:</strong><br>${escapedMessage}</p>
      <p><strong>Verzonden op:</strong> ${escapeHtml(new Date().toISOString())}</p>
      <p><strong>IP-adres:</strong> ${escapeHtml(req.ip)}</p>
    `
  };

  try {
    await Promise.all([
      transporter.sendMail(customerMail),
      transporter.sendMail(internalMail)
    ]);

    res.json({
      success: true,
      message: 'Bericht succesvol verzonden naar pkbackendautomation@gmail.com. Wij nemen spoedig contact met u op.'
    });
  } catch (error) {
    console.error('Contact form email error:', error);
    res.status(500).json({ error: 'Verzenden is nu niet gelukt. Probeert u het later opnieuw.' });
  }
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
  const currentUser = userDb.findById(req.session.userId);
  if (currentUser) {
    ensureCustomerEnvironment(currentUser);
  }

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
    type: primaryEnv.type || 'general',
    status: primaryEnv.status === 'active' ? 'Operational' : primaryEnv.status,
    company: req.session.company,
    tools: primaryEnv.tools || [],
    dashboards: ['Overview', 'Performance', 'Logs', 'Alerts'],
    services: ['API Server', 'Database', 'Cache', 'Queue'],
    uptime: '99.9%',
    loginCount: primaryEnv.loginCount || 0,
    dataUsedBytes: primaryEnv.dataUsedBytes || 0,
    dataUsedLabel: formatBytes(primaryEnv.dataUsedBytes || 0),
    lastLoginAt: primaryEnv.lastLoginAt,
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
    const persistedUser = userDb.findById(newUser.id);
    const createdEnvironment = ensureCustomerEnvironment(persistedUser || newUser);
    userDb.updateUser(newUser.id, { redirectPath: '/environment' });
    
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
 * Create a customer account and environment in one action
 * POST /api/customer-environments
 */
app.post('/api/customer-environments', auth.isAuthenticated, auth.isAdmin, (req, res) => {
  const { username, email, password, company, name, description, type, status } = req.body;

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

  try {
    const { user, environment } = createCustomerEnvironmentAccount({
      username,
      email,
      password,
      company,
      name,
      description,
      type,
      status
    });

    userDb.logActivity(req.session.userId, 'create_environment', `Created customer account and environment: ${user.username}`);

    return res.status(201).json({
      success: true,
      user,
      environment
    });
  } catch (error) {
    console.error('Failed to create customer environment:', error);
    return res.status(500).json({ error: 'Could not create customer environment' });
  }
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

  if (updatedUser.role === 'customer') {
    const persistedUser = userDb.findById(userId);
    ensureCustomerEnvironment(persistedUser || updatedUser);
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
 * Change own password
 * POST /api/user/password
 */
app.post('/api/user/password', auth.isAuthenticated, (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }

  if (String(newPassword).length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters' });
  }

  const user = userDb.findById(req.session.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (!userDb.verifyPassword(currentPassword, user.password)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  userDb.updateUserPassword(user.id, newPassword);
  userDb.logActivity(user.id, 'change_password', 'User updated their password');

  res.json({ success: true });
});

/**
 * Update own login name and/or password
 * POST /api/user/account
 */
app.post('/api/user/account', auth.isAuthenticated, (req, res) => {
  const { currentPassword, newUsername, newPassword } = req.body;

  if (!currentPassword) {
    return res.status(400).json({ error: 'Current password is required' });
  }

  if (!newUsername && !newPassword) {
    return res.status(400).json({ error: 'Provide a new username and/or new password' });
  }

  const user = userDb.findById(req.session.userId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  if (!userDb.verifyPassword(currentPassword, user.password)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  if (newUsername) {
    const trimmedUsername = String(newUsername).trim();
    if (trimmedUsername.length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters' });
    }

    const existingUser = userDb.findByUsername(trimmedUsername);
    if (existingUser && existingUser.id !== user.id) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    userDb.updateUserUsername(user.id, trimmedUsername);
    req.session.username = trimmedUsername;
  }

  if (newPassword) {
    if (String(newPassword).length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    }

    userDb.updateUserPassword(user.id, newPassword);
  }

  userDb.logActivity(user.id, 'update_credentials', 'User updated login credentials');

  const updatedUser = userDb.findById(user.id);
  res.json({
    success: true,
    user: {
      id: updatedUser.id,
      username: updatedUser.username,
      email: updatedUser.email,
      company: updatedUser.company,
      role: updatedUser.role,
      environment: updatedUser.environment
    }
  });
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
    const metrics = envDb.getEnvironmentMetrics(env.id) || {};
    return {
      ...env,
      username: user ? user.username : 'Unknown',
      company: user ? user.company : 'Unknown',
      loginCount: metrics.loginCount || 0,
      dataUsedBytes: metrics.dataUsedBytes || 0,
      dataUsedLabel: metrics.dataUsedBytes ? formatBytes(metrics.dataUsedBytes) : '0 B',
      lastLoginAt: metrics.lastLoginAt
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
  
  res.json({
    ...environment,
    loginCount: environment.loginCount || 0,
    dataUsedBytes: environment.dataUsedBytes || 0,
    dataUsedLabel: formatBytes(environment.dataUsedBytes || 0)
  });
});

/**
 * Create new environment (Admin only)
 * POST /api/environments
 */
app.post('/api/environments', auth.isAuthenticated, auth.isAdmin, (req, res) => {
  const { userId, name, description, type, status } = req.body;
  
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
    type,
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
  const { name, description, type, status, tools } = req.body;
  
  const updatedEnvironment = envDb.updateEnvironment(req.params.id, {
    name,
    description,
    type,
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
    jarFile: req.file.filename,
    sizeBytes: req.file.size
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
