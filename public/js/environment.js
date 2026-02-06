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
        const response = await fetch(apiPath('/api/environment'));
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
    document.getElementById('envName').textContent = env.environment;
    document.getElementById('envCompany').textContent = env.company;
    document.getElementById('envStatus').textContent = env.status;
    document.getElementById('envUptime').textContent = env.uptime;

    // Services list
    const servicesList = document.getElementById('servicesList');
    servicesList.innerHTML = env.services.map(service => 
        `<li>✓ ${service}</li>`
    ).join('');

    // Dashboards list
    const dashboardsList = document.getElementById('dashboardsList');
    dashboardsList.innerHTML = env.dashboards.map(dashboard => 
        `<li><a href="#">${dashboard}</a></li>`
    ).join('');
}
