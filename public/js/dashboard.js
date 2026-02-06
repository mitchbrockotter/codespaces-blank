/**
 * Dashboard page functionality
 */
// Use runtime API base from `public/env.js`
if (typeof API_BASE === 'undefined') {
    var API_BASE = (window.API_BASE || '').replace(/\/$/, '');
}
function apiPath(path){ return API_BASE + path; }

document.addEventListener('DOMContentLoaded', async () => {
    const user = await getCurrentUser();
    
    if (user) {
        // Display company info
        const companyInfo = document.getElementById('companyInfo');
        if (companyInfo) {
            companyInfo.textContent = `Welcome, ${user.username}! You are from ${user.company}`;
        }

        // Display user details
        document.getElementById('infoUsername').textContent = user.username;
        document.getElementById('infoCompany').textContent = user.company;
        document.getElementById('infoRole').textContent = user.role.charAt(0).toUpperCase() + user.role.slice(1);
        document.getElementById('infoEnvironment').textContent = user.environment;

        // Load environment status
        loadEnvironmentStatus();
    }
});

/**
 * Load environment status and display
 */
async function loadEnvironmentStatus() {
    try {
        const response = await fetch(apiPath('/api/environment'), {
            credentials: 'include'
        });
        if (response.ok) {
            const env = await response.json();
            const statusContent = document.getElementById('statusContent');
            
            if (statusContent) {
                statusContent.innerHTML = `
                    <div style="color: #155724; font-weight: 500;">✓ Active & Operational</div>
                    <div style="margin-top: 0.5rem; font-size: 0.9rem; color: #666;">
                        <div>Status: ${env.status}</div>
                        <div>Uptime: ${env.uptime}</div>
                    </div>
                `;
            }
        }
    } catch (error) {
        console.error('Error loading environment status:', error);
    }
}
