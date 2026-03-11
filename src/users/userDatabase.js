/**
 * User Database Management
 * Stores and manages user accounts with role-based access
 */

const bcryptjs = require('bcryptjs');

// In-memory user database (in production, use a real database)
let users = [
  {
    id: 1,
    username: 'pkba_admin',
    email: 'admin@pkba.nl',
    password: bcryptjs.hashSync('Pkbabeheer1!', 10),
    company: 'P&K Backend Automation',
    role: 'admin',
    environment: 'pkba-admin',
    redirectPath: '/admin',
    status: 'active',
    createdAt: new Date('2026-03-11'),
    lastLogin: null
  }
];

// Activity log
let activityLog = [
  { id: 1, userId: 1, action: 'system_init', timestamp: new Date('2026-03-11'), details: 'Initialized admin account' }
];

let activityLogId = 2;

/**
 * Find user by username
 */
function findByUsername(username) {
  return users.find(u => u.username === username);
}

/**
 * Find user by email (case-insensitive)
 */
function findByEmail(email) {
  return users.find(u => u.email.toLowerCase() === email.toLowerCase());
}

/**
 * Find user by ID
 */
function findById(id) {
  return users.find(u => u.id === id);
}

/**
 * Verify password
 */
function verifyPassword(plainPassword, hashedPassword) {
  return bcryptjs.compareSync(plainPassword, hashedPassword);
}

/**
 * Authenticate user - accepts username or email (email is case-insensitive)
 */
function authenticateUser(usernameOrEmail, password) {
  // Try to find by username first
  let user = findByUsername(usernameOrEmail);
  // Then try by email (case-insensitive)
  if (!user) {
    user = users.find(u => u.email.toLowerCase() === usernameOrEmail.toLowerCase());
  }
  
  if (!user) {
    return null;
  }
  
  if (verifyPassword(password, user.password)) {
    // Return user without password
    const { password: _, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }
  
  return null;
}

/**
 * Create new user
 */
function createUser(userData) {
  const newId = users.length > 0 ? Math.max(...users.map(u => u.id)) + 1 : 1;
  
  const newUser = {
    id: newId,
    username: userData.username,
    email: userData.email,
    password: bcryptjs.hashSync(userData.password, 10),
    company: userData.company,
    role: userData.role || 'customer',
    environment: userData.environment || `${userData.username}-env`
  };
  
  users.push(newUser);
  const { password: _, ...userWithoutPassword } = newUser;
  return userWithoutPassword;
}

/**
 * Get user environment data
 */
function getUserEnvironment(userId) {
  const user = findById(userId);
  if (!user) {
    return null;
  }
  
  return {
    id: user.id,
    environment: user.environment,
    company: user.company,
    role: user.role
  };
}

/**
 * Update user details
 */
function updateUser(userId, updateData) {
  const user = findById(userId);
  if (!user) {
    return null;
  }
  
  // Update allowed fields
  if (updateData.email) user.email = updateData.email;
  if (updateData.company) user.company = updateData.company;
  if (updateData.role) user.role = updateData.role;
  if (updateData.environment) user.environment = updateData.environment;
  if (updateData.redirectPath) user.redirectPath = updateData.redirectPath;
  if (updateData.status) user.status = updateData.status;
  
  const { password: _, ...userWithoutPassword } = user;
  return userWithoutPassword;
}

/**
 * Delete user
 */
function deleteUser(userId) {
  const index = users.findIndex(u => u.id === userId);
  if (index === -1) {
    return false;
  }
  users.splice(index, 1);
  return true;
}

/**
 * Get user redirect path
 */
function getUserRedirectPath(userId) {
  const user = findById(userId);
  return user ? (user.redirectPath || (user.role === 'admin' ? '/admin' : '/dashboard')) : '/';
}

/**
 * Set user redirect path
 */
function setUserRedirectPath(userId, redirectPath) {
  const user = findById(userId);
  if (!user) {
    return null;
  }
  user.redirectPath = redirectPath;
  user.updatedAt = new Date();
  return true;
}

/**
 * Log activity
 */
function logActivity(userId, action, details) {
  activityLog.push({
    id: activityLogId++,
    userId: userId,
    action: action,
    timestamp: new Date(),
    details: details || ''
  });
}

/**
 * Get activity log
 */
function getActivityLog(limit = 50, userId = null) {
  let logs = [...activityLog].sort((a, b) => b.timestamp - a.timestamp);
  
  if (userId) {
    logs = logs.filter(log => log.userId === userId);
  }
  
  return logs.slice(0, limit);
}

/**
 * Get system statistics
 */
function getSystemStats() {
  const customerCount = users.filter(u => u.role === 'customer').length;
  const adminCount = users.filter(u => u.role === 'admin').length;
  const activeUsers = users.filter(u => u.status === 'active').length;
  const totalEnvironments = new Set(users.map(u => u.environment)).size;
  
  return {
    totalUsers: users.length,
    customerCount,
    adminCount,
    activeUsers,
    totalEnvironments,
    activityLogCount: activityLog.length,
    serverStatus: 'Operational',
    uptime: '99.9%'
  };
}

/**
 * Update user status (active/inactive/suspended)
 */
function updateUserStatus(userId, status) {
  const user = findById(userId);
  if (!user) {
    return null;
  }
  
  user.status = status;
  return true;
}

/**
 * Reset user last login
 */
function updateUserLastLogin(userId) {
  const user = findById(userId);
  if (!user) {
    return null;
  }
  
  user.lastLogin = new Date();
  return true;
}

module.exports = {
  findByUsername,
  findByEmail,
  findById,
  verifyPassword,
  authenticateUser,
  createUser,
  getUserEnvironment,
  updateUser,
  deleteUser,
  getUserRedirectPath,
  setUserRedirectPath,
  logActivity,
  getActivityLog,
  getSystemStats,
  updateUserStatus,
  updateUserLastLogin,
  users // For testing purposes
};
