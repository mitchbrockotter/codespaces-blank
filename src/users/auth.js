/**
 * Authentication Middleware
 * Handles user session verification and authorization
 */

/**
 * Middleware to check if user is authenticated
 */
function isAuthenticated(req, res, next) {
  if (req.session && req.session.userId) {
    next();
  } else {
    // Check if this is an API request
    if (req.path.startsWith('/api/')) {
      res.status(401).json({ error: 'Not authenticated' });
    } else {
      res.redirect('/login');
    }
  }
}

/**
 * Middleware to check if user is admin
 */
function isAdmin(req, res, next) {
  if (req.session && req.session.userId && req.session.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Admin access required' });
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
