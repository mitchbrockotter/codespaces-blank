/**
 * Authentication & Session Management
 */

// Use runtime API base from `public/env.js` (window.API_BASE)
const API_BASE = (window.API_BASE || '').replace(/\/$/, '');
function apiPath(path){ return API_BASE + path; }

// Handle login form submission
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const errorDiv = document.getElementById('errorMessage');

        try {
            const response = await fetch(apiPath('/api/login'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (!response.ok) {
                errorDiv.textContent = data.error || 'Login failed';
                errorDiv.style.display = 'block';
                return;
            }

            // Successful login
            console.log('Login successful:', data.user);
            
            // Redirect based on user role
            setTimeout(() => {
                window.location.href = data.redirect;
            }, 500);

        } catch (error) {
            console.error('Login error:', error);
            errorDiv.textContent = 'An error occurred. Please try again.';
            errorDiv.style.display = 'block';
        }
    });
}

// Logout functionality
const logoutBtn = document.getElementById('logoutBtn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        try {
            const response = await fetch(apiPath('/api/logout'), {
                method: 'POST',
                credentials: 'include'
            });

            if (response.ok) {
                window.location.href = '/login';
            }
        } catch (error) {
            console.error('Logout error:', error);
        }
    });
}

/**
 * Get current user information
 */
async function getCurrentUser() {
    try {
        const response = await fetch(apiPath('/api/user'), {
            credentials: 'include'
        });
        if (response.ok) {
            const data = await response.json();
            return data;
        }
        // If not OK, check if it's JSON or HTML
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            try {
                const errorData = await response.json();
                console.log('API error:', errorData);
            } catch (e) {
                console.log('Could not parse error response as JSON');
            }
        } else {
            console.log('Received non-JSON response, status:', response.status);
        }
        return null;
    } catch (error) {
        console.error('Error fetching user:', error);
        return null;
    }
}

/**
 * Display user info in navbar
 */
async function displayUserInfo() {
    const userDisplay = document.getElementById('userDisplay');
    if (userDisplay) {
        const user = await getCurrentUser();
        if (user) {
            userDisplay.textContent = `${user.username} (${user.company})`;
        }
    }
}

// Display user info when page loads
document.addEventListener('DOMContentLoaded', displayUserInfo);

/**
 * Check if user is authenticated and redirect if not
 */
async function checkAuthentication() {
    const user = await getCurrentUser();
    if (!user && !window.location.href.includes('/login') && !window.location.href.includes('/')) {
        window.location.href = '/login';
    }
    return user;
}

// Check auth when on protected pages
const protectedPages = ['/dashboard', '/admin', '/environment'];
const currentPath = window.location.pathname;
if (protectedPages.some(page => currentPath === page)) {
    checkAuthentication();
}
