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
    status: 'active',
    tools: ['Report Generator v2.1', 'Data Sync Tool v1.5'],
    createdAt: new Date('2026-01-15'),
    updatedAt: new Date('2026-02-01')
  },
  {
    id: 2,
    userId: 2,
    name: 'TechStart Development',
    description: 'Development and testing environment',
    status: 'active',
    tools: ['API Monitor v1.0', 'Log Analyzer v2.0', 'Backup Scheduler v1.2'],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-02-03')
  },
  {
    id: 3,
    userId: 3,
    name: 'Innovate Staging',
    description: 'Staging environment for pre-production testing',
    status: 'active',
    tools: ['Database Migration Tool v1.3'],
    createdAt: new Date('2026-01-20'),
    updatedAt: new Date('2026-01-25')
  }
];

let environmentId = 4;

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
 * Create new environment
 */
function createEnvironment(envData) {
  const newEnvironment = {
    id: environmentId++,
    userId: parseInt(envData.userId),
    name: envData.name,
    description: envData.description || '',
    status: envData.status || 'active',
    tools: envData.tools || [],
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
  const allowedFields = ['name', 'description', 'status', 'tools'];
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

module.exports = {
  getAllEnvironments,
  getEnvironmentById,
  getEnvironmentsByUserId,
  createEnvironment,
  updateEnvironment,
  deleteEnvironment,
  addTool,
  removeTool
};
