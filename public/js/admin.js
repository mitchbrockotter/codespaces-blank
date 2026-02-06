/**
 * Admin panel functionality with comprehensive user management
 */

// Use runtime API base from `public/env.js`
const API_BASE = (window.API_BASE || '').replace(/\/$/, '');
function apiPath(path){ return API_BASE + path; }

let allUsers = [];
let allActivities = [];

document.addEventListener('DOMContentLoaded', async () => {
    console.log('Admin page DOMContentLoaded');
    
    // Setup modals first (they don't require authentication)
    setupAddUserModal();
    setupEditUserModal();
    setupEnvironmentModals();
    
    // Setup search
    setupUserSearch();
    setupEnvironmentSearch();
    
    // Now check authentication
    const user = await getCurrentUser();
    console.log('Current user:', user);
    
    if (!user) {
        console.log('No user found, redirecting to login...');
        window.location.href = '/login';
        return;
    }
    
    if (user.role !== 'admin') {
        console.log('User is not admin, redirecting to dashboard...');
        window.location.href = '/dashboard';
        return;
    }
    
    // Load all necessary data (only if authenticated as admin)
    await loadUsers();
    await loadStats();
    await loadActivityLog();
    await loadEnvironments();
});

/**
 * Load and display all users
 */
async function loadUsers() {
    try {
        const response = await fetch(apiPath('/api/users'), {
            credentials: 'include'
        });
        if (response.ok) {
            allUsers = await response.json();
            displayUsers(allUsers);
        }
    } catch (error) {
        console.error('Error loading users:', error);
    }
}

/**
 * Display users in table with all columns and actions
 */
function displayUsers(usersToDisplay) {
    const tbody = document.getElementById('usersTableBody');
    
    if (usersToDisplay.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="loading">No users found</td></tr>';
        return;
    }

    tbody.innerHTML = usersToDisplay.map(user => {
        const lastLogin = user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never';
        const statusClass = `status-${user.status || 'active'}`;
        
        return `
            <tr>
                <td><strong>${user.username}</strong></td>
                <td>${user.company}</td>
                <td>${user.email}</td>
                <td><span class="badge badge-${user.role}">${user.role}</span></td>
                <td><span class="${statusClass}">${(user.status || 'active').toUpperCase()}</span></td>
                <td><code>${user.redirectPath || '/dashboard'}</code></td>
                <td>${lastLogin}</td>
                <td>
                    <button class="btn btn-small" onclick="openEditUserModal(${user.id})">Edit</button>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * Setup user search functionality
 */
function setupUserSearch() {
    const searchInput = document.getElementById('userSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const filtered = allUsers.filter(user => 
                user.username.toLowerCase().includes(searchTerm) ||
                user.company.toLowerCase().includes(searchTerm) ||
                user.email.toLowerCase().includes(searchTerm)
            );
            displayUsers(filtered);
        });
    }
}

/**
 * Open edit user modal
 */
async function openEditUserModal(userId) {
    const modal = document.getElementById('editUserModal');
    const user = allUsers.find(u => u.id === userId);
    
    if (!user) {
        alert('User not found');
        return;
    }

    document.getElementById('editUserId').value = user.id;
    document.getElementById('editUsername').value = user.username;
    document.getElementById('editEmail').value = user.email;
    document.getElementById('editCompany').value = user.company;
    document.getElementById('editRole').value = user.role;
    document.getElementById('editEnvironment').value = user.environment;
    document.getElementById('editRedirectPath').value = user.redirectPath || '/dashboard';
    document.getElementById('editStatus').value = user.status || 'active';

    modal.style.display = 'flex';
}

/**
 * Setup add user modal
 */
function setupAddUserModal() {
    console.log('Setting up add user modal...');
    
    const modal = document.getElementById('addUserModal');
    const addBtn = document.getElementById('addUserBtn');
    
    if (!modal) {
        console.error('addUserModal not found in DOM');
        return;
    }
    
    if (!addBtn) {
        console.error('addUserBtn not found in DOM');
        return;
    }
    
    const closeBtn = modal.querySelector('.close');
    const form = document.getElementById('addUserForm');

    if (!closeBtn || !form) {
        console.error('Close button or form not found');
        return;
    }

    // Simple direct click handler - no cloning
    addBtn.onclick = function(e) {
        console.log('=== Add User button clicked! ===');
        modal.style.display = 'flex';
    };

    closeBtn.addEventListener('click', () => {
        console.log('Close button clicked');
        modal.style.display = 'none';
    });

    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log('Form submitted');

        const newUser = {
            username: document.getElementById('newUsername').value,
            email: document.getElementById('newEmail').value,
            password: document.getElementById('newPassword').value,
            company: document.getElementById('newCompany').value,
            role: document.getElementById('newRole').value
        };

        console.log('Creating user:', newUser);

        try {
            const response = await fetch(apiPath('/api/users'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify(newUser)
            });

            if (response.ok) {
                const result = await response.json();
                
                let message = `✅ Gebruiker succesvol aangemaakt!\n\n`;
                message += `Email: ${newUser.email}\n`;
                message += `Wachtwoord: ${newUser.password}\n\n`;
                
                if (newUser.role === 'customer') {
                    message += `🔐 Een geïsoleerde omgeving is automatisch aangemaakt.\n`;
                    message += `Deze gebruiker kan alleen zijn/haar eigen omgeving zien.`;
                }
                
                alert(message);
                form.reset();
                modal.style.display = 'none';
                
                // Reload data if functions exist
                if (typeof loadUsers === 'function') await loadUsers();
                if (typeof loadStats === 'function') await loadStats();
                if (typeof loadActivityLog === 'function') await loadActivityLog();
                if (typeof loadEnvironments === 'function') await loadEnvironments();
            } else {
                const error = await response.json();
                alert('Fout: ' + error.error);
            }
        } catch (error) {
            console.error('Error creating user:', error);
            alert('Er is een fout opgetreden bij het aanmaken van de gebruiker');
        }
    });
    
    console.log('Add user modal setup complete');
}

/**
 * Setup edit user modal
 */
function setupEditUserModal() {
    const modal = document.getElementById('editUserModal');
    const closeBtn = document.getElementById('editUserClose');
    const form = document.getElementById('editUserForm');
    const deleteBtn = document.getElementById('deleteUserBtn');

    closeBtn.addEventListener('click', () => {
        modal.style.display = 'none';
    });

    window.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.style.display = 'none';
        }
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const userId = parseInt(document.getElementById('editUserId').value);
        const updatedUser = {
            email: document.getElementById('editEmail').value,
            company: document.getElementById('editCompany').value,
            role: document.getElementById('editRole').value,
            environment: document.getElementById('editEnvironment').value,
            redirectPath: document.getElementById('editRedirectPath').value,
            status: document.getElementById('editStatus').value
        };

        try {
            const response = await fetch(apiPath(`/api/users/${userId}`), {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify(updatedUser)
            });

            if (response.ok) {
                alert('User updated successfully!');
                modal.style.display = 'none';
                await loadUsers();
                await loadStats();
                await loadActivityLog();
            } else {
                const error = await response.json();
                alert('Error: ' + error.error);
            }
        } catch (error) {
            console.error('Error updating user:', error);
            alert('An error occurred while updating the user');
        }
    });

    deleteBtn.addEventListener('click', async () => {
        const userId = parseInt(document.getElementById('editUserId').value);
        const username = document.getElementById('editUsername').value;
        
        if (!confirm(`Are you sure you want to delete user "${username}"? This action cannot be undone.`)) {
            return;
        }

        try {
            const response = await fetch(apiPath(`/api/users/${userId}`), {
                method: 'DELETE',
                credentials: 'include'
            });

            if (response.ok) {
                alert('User deleted successfully!');
                modal.style.display = 'none';
                await loadUsers();
                await loadStats();
                await loadActivityLog();
            } else {
                const error = await response.json();
                alert('Error: ' + error.error);
            }
        } catch (error) {
            console.error('Error deleting user:', error);
            alert('An error occurred while deleting the user');
        }
    });
}

/**
 * Load system statistics
 */
async function loadStats() {
    try {
        const response = await fetch(apiPath('/api/stats'), {
            credentials: 'include'
        });
        if (response.ok) {
            const stats = await response.json();
            
            document.getElementById('totalUsers').textContent = stats.totalUsers;
            document.getElementById('activeUsers').textContent = stats.activeUsers;
            document.getElementById('totalEnvironments').textContent = stats.totalEnvironments;
            document.getElementById('serverStatus').textContent = stats.serverStatus;
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

/**
 * Load activity log
 */
async function loadActivityLog() {
    try {
        const response = await fetch(apiPath('/api/activities?limit=20'), {
            credentials: 'include'
        });
        if (response.ok) {
            const data = await response.json();
            allActivities = data.activities;
            displayActivityLog();
        }
    } catch (error) {
        console.error('Error loading activity log:', error);
    }
}

/**
 * Display activity log
 */
function displayActivityLog() {
    const tbody = document.getElementById('activityTableBody');
    
    if (allActivities.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="loading">No activities recorded</td></tr>';
        return;
    }

    tbody.innerHTML = allActivities.map(activity => {
        const date = new Date(activity.timestamp);
        const formattedDate = date.toLocaleString();
        const user = allUsers.find(u => u.id === activity.userId);
        const username = user ? user.username : `User ${activity.userId}`;
        
        return `
            <tr>
                <td>${formattedDate}</td>
                <td>${username}</td>
                <td><strong>${activity.action}</strong></td>
                <td>${activity.details}</td>
            </tr>
        `;
    }).join('');
}

// ============= ENVIRONMENT MANAGEMENT =============

let allEnvironments = [];

/**
 * Load and display all environments
 */
async function loadEnvironments() {
    try {
        const response = await fetch(apiPath('/api/environments'), {
            credentials: 'include'
        });
        if (response.ok) {
            allEnvironments = await response.json();
            displayEnvironments(allEnvironments);
        }
    } catch (error) {
        console.error('Error loading environments:', error);
    }
}

/**
 * Display environments in table
 */
function displayEnvironments(environments) {
    const tbody = document.getElementById('environmentsTableBody');
    
    if (environments.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-light);">Geen omgevingen gevonden</td></tr>';
        return;
    }

    tbody.innerHTML = environments.map(env => {
        const createdDate = new Date(env.createdAt).toLocaleDateString('nl-NL');
        const statusColors = {
            'active': 'var(--success-color)',
            'maintenance': 'var(--warning-color)',
            'inactive': 'var(--text-light)'
        };
        const statusColor = statusColors[env.status] || 'var(--text-light)';
        
        return `
            <tr>
                <td><code>ENV-${env.id}</code></td>
                <td>${env.username}</td>
                <td>${env.company}</td>
                <td style="color: ${statusColor}; font-weight: 600;">${env.status.toUpperCase()}</td>
                <td>${env.tools ? env.tools.length : 0} tools</td>
                <td>${createdDate}</td>
                <td>
                    <button class="btn btn-small" onclick="editEnvironment(${env.id})">Bewerken</button>
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * Setup environment modals
 */
function setupEnvironmentModals() {
    const addEnvModal = document.getElementById('addEnvModal');
    const addEnvBtn = document.getElementById('addEnvBtn');
    const addEnvClose = document.getElementById('addEnvClose');
    const addEnvForm = document.getElementById('addEnvForm');
    
    const editEnvModal = document.getElementById('editEnvModal');
    const editEnvClose = document.getElementById('editEnvClose');
    const editEnvForm = document.getElementById('editEnvForm');
    const deleteEnvBtn = document.getElementById('deleteEnvBtn');

    // Only setup if all required elements exist
    if (!addEnvModal || !addEnvBtn || !addEnvClose || !addEnvForm) {
        console.log('Add environment modal elements not found');
        return;
    }
    
    if (!editEnvModal || !editEnvClose || !editEnvForm || !deleteEnvBtn) {
        console.log('Edit environment modal elements not found');
        return;
    }

    // Add environment modal
    addEnvBtn.addEventListener('click', () => {
        populateUserDropdown();
        addEnvModal.style.display = 'flex';
    });

    addEnvClose.addEventListener('click', () => {
        addEnvModal.style.display = 'none';
    });

    addEnvForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const newEnv = {
            userId: document.getElementById('envUserId').value,
            name: document.getElementById('envName').value,
            description: document.getElementById('envDescription').value,
            status: document.getElementById('envStatus').value
        };

        try {
            const response = await fetch(apiPath('/api/environments'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify(newEnv)
            });

            if (response.ok) {
                alert('Omgeving succesvol aangemaakt!');
                addEnvForm.reset();
                addEnvModal.style.display = 'none';
                await loadEnvironments();
                await loadStats();
            } else {
                const error = await response.json();
                alert('Fout: ' + error.error);
            }
        } catch (error) {
            console.error('Error creating environment:', error);
            alert('Er is een fout opgetreden bij het aanmaken van de omgeving');
        }
    });

    // Edit environment modal
    editEnvClose.addEventListener('click', () => {
        editEnvModal.style.display = 'none';
    });

    editEnvForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const envId = document.getElementById('editEnvId').value;
        const updatedEnv = {
            name: document.getElementById('editEnvName').value,
            description: document.getElementById('editEnvDescription').value,
            status: document.getElementById('editEnvStatus').value
        };

        try {
            const response = await fetch(apiPath(`/api/environments/${envId}`), {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify(updatedEnv)
            });

            if (response.ok) {
                alert('Omgeving succesvol bijgewerkt!');
                editEnvModal.style.display = 'none';
                await loadEnvironments();
            } else {
                const error = await response.json();
                alert('Fout: ' + error.error);
            }
        } catch (error) {
            console.error('Error updating environment:', error);
            alert('Er is een fout opgetreden bij het bijwerken');
        }
    });

    // Delete environment
    deleteEnvBtn.addEventListener('click', async () => {
        const envId = document.getElementById('editEnvId').value;
        const envName = document.getElementById('editEnvName').value;
        
        if (!confirm(`Weet je zeker dat je omgeving "${envName}" wilt verwijderen? Deze actie kan niet ongedaan worden gemaakt.`)) {
            return;
        }

        try {
            const response = await fetch(apiPath(`/api/environments/${envId}`), {
                method: 'DELETE',
                credentials: 'include'
            });

            if (response.ok) {
                alert('Omgeving succesvol verwijderd!');
                editEnvModal.style.display = 'none';
                await loadEnvironments();
                await loadStats();
            } else {
                const error = await response.json();
                alert('Fout: ' + error.error);
            }
        } catch (error) {
            console.error('Error deleting environment:', error);
            alert('Er is een fout opgetreden bij het verwijderen');
        }
    });

    // Close modals on outside click
    window.addEventListener('click', (e) => {
        if (e.target === addEnvModal) {
            addEnvModal.style.display = 'none';
        }
        if (e.target === editEnvModal) {
            editEnvModal.style.display = 'none';
        }
    });
}

/**
 * Populate user dropdown for environment creation
 */
function populateUserDropdown() {
    const select = document.getElementById('envUserId');
    select.innerHTML = '<option value="">-- Selecteer een gebruiker --</option>';
    
    allUsers.forEach(user => {
        const option = document.createElement('option');
        option.value = user.id;
        option.textContent = `${user.username} (${user.company})`;
        select.appendChild(option);
    });
}

/**
 * Edit environment - opens modal with environment data
 */
async function editEnvironment(envId) {
    try {
        const response = await fetch(apiPath(`/api/environments/${envId}`), {
            credentials: 'include'
        });
        
        if (response.ok) {
            const env = await response.json();
            
            document.getElementById('editEnvId').value = env.id;
            document.getElementById('editEnvName').value = env.name;
            document.getElementById('editEnvDescription').value = env.description || '';
            document.getElementById('editEnvStatus').value = env.status;
            
            // Display tools list
            const toolsList = document.getElementById('envToolsList');
            if (env.tools && env.tools.length > 0) {
                toolsList.innerHTML = env.tools.map(tool => 
                    `<div style="padding: 0.5rem; background: rgba(0,212,255,0.1); border-radius: 4px; margin-bottom: 0.5rem; border-left: 3px solid var(--primary-color);">
                        <strong style="color: var(--primary-color);">🔧 ${tool}</strong>
                    </div>`
                ).join('');
            } else {
                toolsList.innerHTML = '<p style="color: var(--text-light); font-size: 0.9rem;">Geen tools geïnstalleerd</p>';
            }
            
            document.getElementById('editEnvModal').style.display = 'flex';
        }
    } catch (error) {
        console.error('Error loading environment:', error);
        alert('Fout bij het laden van omgevingsgegevens');
    }
}

/**
 * Setup environment search
 */
function setupEnvironmentSearch() {
    const searchInput = document.getElementById('envSearch');
    if (!searchInput) return;
    
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        
        const filtered = allEnvironments.filter(env => {
            return env.name.toLowerCase().includes(searchTerm) ||
                   env.username.toLowerCase().includes(searchTerm) ||
                   env.company.toLowerCase().includes(searchTerm) ||
                   env.status.toLowerCase().includes(searchTerm);
        });
        
        displayEnvironments(filtered);
    });
}
