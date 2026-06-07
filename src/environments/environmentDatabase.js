/**
 * Environment Database Management
 * Stores and manages user environments for tools and automations
 */

// In-memory environment database (in production, use a real database)
let environments = [
  {
    id: 1,
    userId: 1,
    name: 'ACME Production',
    description: 'Production environment for ACME Corporation automation tools',
    type: 'production',
    status: 'active',
    tools: ['Report Generator v2.1', 'Data Sync Tool v1.5'],
    projects: [],
    loginCount: 24,
    dataUsedBytes: 73400320,
    lastLoginAt: new Date('2026-02-10'),
    createdAt: new Date('2026-01-15'),
    updatedAt: new Date('2026-02-01')
  },
  {
    id: 2,
    userId: 2,
    name: 'TechStart Development',
    description: 'Development and testing environment',
    type: 'development',
    status: 'active',
    tools: ['API Monitor v1.0', 'Log Analyzer v2.0', 'Backup Scheduler v1.2'],
    projects: [],
    loginCount: 17,
    dataUsedBytes: 25165824,
    lastLoginAt: new Date('2026-02-11'),
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-02-03')
  },
  {
    id: 3,
    userId: 3,
    name: 'Innovate Staging',
    description: 'Staging environment for pre-production testing',
    type: 'staging',
    status: 'active',
    tools: ['Database Migration Tool v1.3'],
    projects: [],
    loginCount: 9,
    dataUsedBytes: 12582912,
    lastLoginAt: new Date('2026-02-08'),
    createdAt: new Date('2026-01-20'),
    updatedAt: new Date('2026-01-25')
  },
  {
    id: 4,
    userId: 2,
    name: 'Merlijn Meubels - Customer Environment',
    description: 'Dedicated environment for Merlijn Meubels to automate the current Excel-based process.',
    type: 'crm',
    status: 'active',
    tools: [],
    projects: [],
    loginCount: 0,
    dataUsedBytes: 0,
    lastLoginAt: null,
    createdAt: new Date('2026-06-07'),
    updatedAt: new Date('2026-06-07')
  }
];

let environmentId = 5;

/**
 * Get all environments (admin only)
 */
function getAllEnvironments() {
  return environments.map(env => {
    return { ...env };
  });
}

/**
 * Get environment by ID
 */
function getEnvironmentById(id) {
  return environments.find(e => e.id === parseInt(id));
}

/**
 * Get environments for a specific user
 */
function getEnvironmentsByUserId(userId) {
  return environments.filter(e => e.userId === parseInt(userId));
}

/**
 * Get the primary environment for a user
 */
function getEnvironmentByUserId(userId) {
  const userEnvironments = getEnvironmentsByUserId(userId);
  return userEnvironments.length > 0 ? userEnvironments[0] : null;
}

/**
 * Get environment metrics
 */
function getEnvironmentMetrics(environmentId) {
  const env = getEnvironmentById(environmentId);

  if (!env) {
    return null;
  }

  return {
    loginCount: env.loginCount || 0,
    dataUsedBytes: env.dataUsedBytes || 0,
    dataUsedMb: Number(((env.dataUsedBytes || 0) / (1024 * 1024)).toFixed(2)),
    lastLoginAt: env.lastLoginAt || null
  };
}

/**
 * Create new environment
 */
function createEnvironment(envData) {
  const newEnvironment = {
    id: environmentId++,
    userId: parseInt(envData.userId),
    name: envData.name,
    description: envData.description || '',
    type: envData.type || 'general',
    status: envData.status || 'active',
    tools: envData.tools || [],
    projects: [],
    loginCount: envData.loginCount || 0,
    dataUsedBytes: envData.dataUsedBytes || 0,
    lastLoginAt: envData.lastLoginAt || null,
    createdAt: new Date(),
    updatedAt: new Date()
  };
  
  environments.push(newEnvironment);
  return newEnvironment;
}

/**
 * Update environment
 */
function updateEnvironment(id, updates) {
  const envIndex = environments.findIndex(e => e.id === parseInt(id));
  
  if (envIndex === -1) {
    return null;
  }
  
  // Update allowed fields
  const allowedFields = ['name', 'description', 'type', 'status', 'tools'];
  allowedFields.forEach(field => {
    if (updates[field] !== undefined) {
      environments[envIndex][field] = updates[field];
    }
  });
  
  environments[envIndex].updatedAt = new Date();
  
  return environments[envIndex];
}

/**
 * Delete environment
 */
function deleteEnvironment(id) {
  const envIndex = environments.findIndex(e => e.id === parseInt(id));
  
  if (envIndex === -1) {
    return false;
  }
  
  environments.splice(envIndex, 1);
  return true;
}

/**
 * Add tool to environment
 */
function addTool(environmentId, toolName) {
  const env = getEnvironmentById(environmentId);
  
  if (!env) {
    return null;
  }
  
  if (!env.tools.includes(toolName)) {
    env.tools.push(toolName);
    env.updatedAt = new Date();
  }
  
  return env;
}

/**
 * Remove tool from environment
 */
function removeTool(environmentId, toolName) {
  const env = getEnvironmentById(environmentId);
  
  if (!env) {
    return null;
  }
  
  const toolIndex = env.tools.indexOf(toolName);
  if (toolIndex > -1) {
    env.tools.splice(toolIndex, 1);
    env.updatedAt = new Date();
  }
  
  return env;
}

/**
 * Add project to environment
 */
function addProject(envId, projectData) {
  const env = getEnvironmentById(envId);
  
  if (!env) {
    return null;
  }
  
  if (!env.projects) {
    env.projects = [];
  }
  
  const newProject = {
    name: projectData.name,
    jarFile: projectData.jarFile,
    sizeBytes: projectData.sizeBytes || 0,
    uploadedAt: new Date()
  };
  
  env.projects.push(newProject);
  if (projectData.sizeBytes) {
    env.dataUsedBytes = (env.dataUsedBytes || 0) + projectData.sizeBytes;
  }
  env.updatedAt = new Date();
  
  return newProject;
}

/**
 * Record an environment login
 */
function recordEnvironmentLogin(environmentId) {
  const env = getEnvironmentById(environmentId);

  if (!env) {
    return null;
  }

  env.loginCount = (env.loginCount || 0) + 1;
  env.lastLoginAt = new Date();
  env.updatedAt = new Date();
  return env;
}

/**
 * Add data usage to an environment
 */
function addEnvironmentDataUsage(environmentId, bytes) {
  const env = getEnvironmentById(environmentId);

  if (!env) {
    return null;
  }

  env.dataUsedBytes = (env.dataUsedBytes || 0) + Math.max(0, parseInt(bytes, 10) || 0);
  env.updatedAt = new Date();
  return env;
}

/**
 * Remove project from environment
 */
function removeProject(envId, projectName) {
  const env = getEnvironmentById(envId);
  
  if (!env || !env.projects) {
    return false;
  }
  
  const projectIndex = env.projects.findIndex(p => p.name === projectName);
  if (projectIndex > -1) {
    env.projects.splice(projectIndex, 1);
    env.updatedAt = new Date();
    return true;
  }
  
  return false;
}

module.exports = {
  getAllEnvironments,
  getEnvironmentById,
  getEnvironmentsByUserId,
  getEnvironmentByUserId,
  getEnvironmentMetrics,
  createEnvironment,
  updateEnvironment,
  deleteEnvironment,
  addTool,
  removeTool,
  addProject,
  removeProject,
  recordEnvironmentLogin,
  addEnvironmentDataUsage
};
