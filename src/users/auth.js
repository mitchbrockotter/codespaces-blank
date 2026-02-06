/**
 * Authentication Middleware
 * Handles user session verification and authorization
 * Accepts both server session and custom headers (for cross-domain auth)
 */

/**
 * Middleware to check if user is authenticated
 */
function isAuthenticated(req, res, next) {
  // Check session first
  if (req.session && req.session.userId) {
    return next();
  }
  
  // Check custom headers (from localStorage frontend auth)
  const userId = req.headers['x-user-id'];
  if (userId) {
    req.session = req.session || {};
    req.session.userId = parseInt(userId);
    return next();
  }
  
  // Not authenticated
  if (req.path.startsWith('/api/')) {
    res.status(401).json({ error: 'Not authenticated' });
  } else {
    res.redirect('/login');
  }
}

/**
 * Middleware to check if user is admin
 */
function isAdmin(req, res, next) {
  // Check session first
  if (req.session && req.session.userId && req.session.role === 'admin') {
    return next();
  }
  
  // Check custom headers (from localStorage frontend auth)
  const userId = req.headers['x-user-id'];
  const role = req.headers['x-user-role'];
  if (userId && role === 'admin') {
    req.session = req.session || {};
    req.session.userId = parseInt(userId);
    req.session.role = role;
    return next();
  }
  
  // Not admin
  if (req.path.startsWith('/api/')) {
    res.status(403).json({ error: 'Admin access required' });
  } else {
    res.redirect('/login');
  }
}

/**
 * Middleware to get user information
 */
function getUserInfo(req, res, next) {
  if (req.session && req.session.userId) {
    req.user = {
      id: req.session.userId,
      username: req.session.username,
      company: req.session.company,
      role: req.session.role,
      environment: req.session.environment,
      email: req.session.email
    };
  }
  next();
}

module.exports = {
  isAuthenticated,
  isAdmin,
  getUserInfo
};
