/**
 * Authentication & Session Management
 */

// Use runtime API base from `public/env.js` (window.API_BASE)
if (typeof API_BASE === 'undefined') {
    var API_BASE = (window.API_BASE || '').replace(/\/$/, '');
}
function apiPath(path){ return API_BASE + path; }

// Handle login button click
console.log('🔍 Looking for loginBtn...');
const loginBtn = document.getElementById('loginBtn');
console.log('loginBtn found:', !!loginBtn);

if (loginBtn) {
    console.log('✅ Attaching login button click listener');
    loginBtn.addEventListener('click', async (e) => {
        console.log('🎯 Login button clicked!');
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const errorDiv = document.getElementById('errorMessage');

        if (!username || !password) {
            errorDiv.textContent = 'Please enter username and password';
            errorDiv.style.display = 'block';
            return;
        }

        console.log('=== LOGIN ATTEMPT ===');
        console.log('Sending to:', apiPath('/api/login'));
        console.log('Username:', username);

        try {
            const response = await fetch(apiPath('/api/login'), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({ username, password })
            });

            console.log('Login response status:', response.status);
            console.log('Login response headers:', {
                contentType: response.headers.get('content-type'),
                setCookie: response.headers.get('set-cookie')
            });

            const data = await response.json();
            console.log('Login response data:', data);

            if (!response.ok) {
                console.error('Login failed:', data.error);
                errorDiv.textContent = data.error || 'Login failed';
                errorDiv.style.display = 'block';
                return;
            }

            // Successful login
            console.log('✅ Login successful:', data.user);
            console.log('Redirecting to:', data.redirect);
            
            // Redirect based on user role
            setTimeout(() => {
                window.location.href = data.redirect;
            }, 500);

        } catch (error) {
            console.error('Login error:', error);
            console.error('Error type:', error.name);
            errorDiv.textContent = 'An error occurred. Please try again.';
            errorDiv.style.display = 'block';
        }
    });
} else {
    console.error('❌ loginBtn not found in DOM');
}

// Handle login form submission (fallback for Enter key)
const loginForm = document.getElementById('loginForm');
if (loginForm) {
    console.log('✅ Attaching login form fallback listener');
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        console.log('🎯 Login form submitted (Enter key)');
        if (loginBtn) {
            loginBtn.click();
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
        console.log('Fetching user from:', apiPath('/api/user'));
        const response = await fetch(apiPath('/api/user'), {
            method: 'GET',
            credentials: 'include',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        console.log('Response status:', response.status);
        console.log('Response headers:', {
            contentType: response.headers.get('content-type'),
            setCookie: response.headers.get('set-cookie')
        });
        
        if (response.ok) {
            const data = await response.json();
            console.log('User data received:', data);
            return data;
        }
        
        // If not OK, check if it's JSON or HTML
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            try {
                const errorData = await response.json();
                console.log('Error response:', errorData);
            } catch (e) {
                console.log('Could not parse error response as JSON');
            }
        } else {
            const text = await response.text();
            console.log('Received non-JSON response:', text.substring(0, 200));
        }
        return null;
    } catch (error) {
        console.error('Error fetching user:', error);
        console.error('Error type:', error.name);
        console.error('Error message:', error.message);
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
