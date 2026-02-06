/**
 * Environment page functionality
 */
// Use runtime API base from `public/env.js`
const API_BASE = (window.API_BASE || '').replace(/\/$/, '');
function apiPath(path){ return API_BASE + path; }

document.addEventListener('DOMContentLoaded', async () => {
    const user = await getCurrentUser();
    
    if (user) {
        await loadEnvironmentDetails();
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
    document.getElementById('envUptime').textContent = env.uptime;

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
}
