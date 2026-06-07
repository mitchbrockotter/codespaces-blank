/**
 * Environment page functionality
 */
// Use runtime API base from `public/env.js`
if (typeof API_BASE === 'undefined') {
    var API_BASE = (window.API_BASE || '').replace(/\/$/, '');
}
function apiPath(path){ return API_BASE + path; }

document.addEventListener('DOMContentLoaded', async () => {
    const user = await getCurrentUser();
    
    if (user) {
        await loadEnvironmentDetails();
        setupPasswordChangeForm();
    }
});

/**
 * Load and display environment details
 */
async function loadEnvironmentDetails() {
    try {
        const response = await fetch(apiPath('/api/environment'), {
            credentials: 'include'
        });
        if (response.ok) {
            const env = await response.json();
            displayEnvironmentDetails(env);
        }
    } catch (error) {
        console.error('Error loading environment:', error);
    }
}

/**
 * Display environment details
 */
function displayEnvironmentDetails(env) {
    // Environment info
    document.getElementById('envName').textContent = env.name || env.environment;
    document.getElementById('envCompany').textContent = env.company;
    document.getElementById('envStatus').textContent = env.status;
    const envType = document.getElementById('envType');
    if (envType) {
        envType.textContent = (env.type || 'general').toUpperCase();
    }
    document.getElementById('envUptime').textContent = env.uptime;

    const envLoginCount = document.getElementById('envLoginCount');
    if (envLoginCount) {
        envLoginCount.textContent = String(env.loginCount || 0);
    }

    const envDataUsed = document.getElementById('envDataUsed');
    if (envDataUsed) {
        envDataUsed.textContent = env.dataUsedLabel || '-';
    }

    const currentUsername = document.getElementById('currentUsername');
    if (currentUsername) {
        currentUsername.value = env.username || '';
    }

    // Services list
    const servicesList = document.getElementById('servicesList');
    if (servicesList) {
        servicesList.innerHTML = env.services.map(service => 
            `<li>✓ ${service}</li>`
        ).join('');
    }

    // Dashboards list
    const dashboardsList = document.getElementById('dashboardsList');
    if (dashboardsList) {
        dashboardsList.innerHTML = env.dashboards.map(dashboard => 
            `<li><a href="#">${dashboard}</a></li>`
        ).join('');
    }
    
    // Tools list (if available)
    const toolsElement = document.getElementById('envTools');
    if (toolsElement && env.tools) {
        if (env.tools.length > 0) {
            toolsElement.innerHTML = env.tools.map(tool => 
                `<div style="padding: 0.75rem; background: rgba(0,212,255,0.1); border-radius: 6px; margin-bottom: 0.5rem; border-left: 3px solid var(--primary-color);">
                    <strong style="color: var(--primary-color);">🔧 ${tool}</strong>
                </div>`
            ).join('');
        } else {
            toolsElement.innerHTML = '<p style="color: var(--text-light);">Geen tools geïnstalleerd. Neem contact op met uw beheerder om tools toe te voegen.</p>';
        }
    }

    const runsElement = document.getElementById('envRuns');
    if (runsElement) {
        runsElement.textContent = typeof env.runsCompleted === 'number' ? String(env.runsCompleted) : '-';
    }

    const savingsElement = document.getElementById('envSavings');
    if (savingsElement) {
        savingsElement.textContent = env.savingsDisplay || '-';
    }
}

function setupPasswordChangeForm() {
    const form = document.getElementById('changePasswordForm');
    if (!form) {
        return;
    }

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        const currentPassword = document.getElementById('currentPassword').value;
        const newUsername = document.getElementById('newUsername').value;
        const newPassword = document.getElementById('newPassword').value;
        const currentUsername = document.getElementById('currentUsername');

        try {
            const response = await fetch(apiPath('/api/user/account'), {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ currentPassword, newUsername, newPassword })
            });

            const data = await response.json().catch(() => ({}));

            if (response.ok) {
                if (data.user && data.user.username) {
                    if (currentUsername) {
                        currentUsername.value = data.user.username;
                    }
                }
                alert('Login details updated successfully');
                form.reset();
                if (data.user && data.user.username) {
                    if (currentUsername) {
                        currentUsername.value = data.user.username;
                    }
                }
            } else {
                alert(data.error || 'Could not update login details');
            }
        } catch (error) {
            console.error('Error changing password:', error);
            alert('Could not update login details');
        }
    });
}
