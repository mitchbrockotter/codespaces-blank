/**
 * Admin panel functionality with comprehensive user management
 */

// Use runtime API base from `public/env.js`
const API_BASE = (window.API_BASE || '').replace(/\/$/, '');
function apiPath(path){ return API_BASE + path; }

let allUsers = [];
let allActivities = [];

document.addEventListener('DOMContentLoaded', async () => {
    const user = await getCurrentUser();
    
    if (user && user.role !== 'admin') {
        window.location.href = '/dashboard';
        return;
    }

    // Load all necessary data
    await loadUsers();
    await loadStats();
    await loadActivityLog();

    // Setup modals
    setupAddUserModal();
    setupEditUserModal();
    
    // Setup search
    setupUserSearch();
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
    const modal = document.getElementById('addUserModal');
    const addBtn = document.getElementById('addUserBtn');
    const closeBtn = modal.querySelector('.close');
    const form = document.getElementById('addUserForm');

    addBtn.addEventListener('click', () => {
        modal.style.display = 'flex';
    });

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

        const newUser = {
            username: document.getElementById('newUsername').value,
            email: document.getElementById('newEmail').value,
            password: document.getElementById('newPassword').value,
            company: document.getElementById('newCompany').value,
            role: document.getElementById('newRole').value
        };

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
                alert('User created successfully!');
                form.reset();
                modal.style.display = 'none';
                await loadUsers();
                await loadStats();
                await loadActivityLog();
            } else {
                const error = await response.json();
                alert('Error: ' + error.error);
            }
        } catch (error) {
            console.error('Error creating user:', error);
            alert('An error occurred while creating the user');
        }
    });
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
