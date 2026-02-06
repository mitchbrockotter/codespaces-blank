# P&K Backend Automation - Customer Portal

A modern web application for P&K Backend Automation that provides customer account management and dashboard functionality with role-based access control.

## Features

✅ **Company Branding** - Front page featuring "P&K Backend Automation"
✅ **Customer Login** - Secure authentication system with session management
✅ **Role-Based Access** - Different pages for customers vs. admin users
✅ **User Management** - Admin panel for creating and managing users
✅ **Environment Management** - Customer-specific environment dashboards
✅ **Responsive Design** - Works on desktop, tablet, and mobile devices

## Project Structure

```
├── public/                    # Frontend files
│   ├── index.html            # Home page
│   ├── login.html            # Login page
│   ├── dashboard.html        # Customer dashboard
│   ├── admin.html            # Admin panel
│   ├── environment.html      # Environment details
│   ├── 404.html              # Error page
│   ├── css/
│   │   └── style.css         # Styling
│   └── js/
│       ├── auth.js           # Authentication logic
│       ├── dashboard.js      # Dashboard functionality
│       ├── admin.js          # Admin panel functionality
│       └── environment.js    # Environment page logic
├── src/
│   └── users/
│       ├── userDatabase.js   # User storage & management
│       └── auth.js           # Authentication middleware
├── server.js                 # Express.js server
├── package.json              # Node.js dependencies
└── README.md                 # This file
```

## Installation

1. Install dependencies:
```bash
npm install
```

2. Start the server:
```bash
npm start
```

The server will run on `http://localhost:3000`

## Demo Credentials

### Customer Account
- **Username:** acme_customer
- **Password:** password123

### Admin Account
- **Username:** techstart_admin
- **Password:** securepass456

## Features Overview

### Home Page
- Company branding with "P&K Backend Automation"
- Navigation menu with login link
- Service showcase with 6 feature cards
- Contact information
- Responsive design

### Authentication System
- Secure login with password hashing (bcryptjs)
- Session-based authentication (express-session)
- Password verification and validation
- Logout functionality

### Customer Dashboard
- Welcome message with company information
- Environment status display
- Recent activity log
- Quick action buttons
- Account information display
- Responsive sidebar navigation

### Admin Panel
- Complete user management system
- User creation with role assignment
- User details display in table format
- System statistics and metrics
- User count and active environments tracking

### Environment Page
- View your dedicated environment details
- Service list display
- Available dashboards
- Performance metrics (CPU, Memory, Disk usage)
- Quick action links

## API Endpoints

### Authentication
- `POST /api/login` - User login
- `POST /api/logout` - User logout
- `GET /api/user` - Get current user info

### User Management (Admin only)
- `GET /api/users` - List all users
- `POST /api/users` - Create new user

### Environment
- `GET /api/environment` - Get environment details

## User Roles

### Customer
- Access to dashboard
- View own environment
- Limited to personal resources

### Admin
- Full system access
- User management
- Can access dashboard and environment
- Admin panel access

## Security Features

- Password hashing with bcryptjs
- Session-based authentication
- Protected routes with middleware
- Secure session cookies
- CSRF protection ready
- XSS protection through template rendering

## Technologies Used

- **Backend:** Node.js, Express.js
- **Frontend:** HTML5, CSS3, Vanilla JavaScript
- **Security:** bcryptjs, express-session
- **Database:** In-memory (easily replaceable with MongoDB/PostgreSQL)

## Customization

### Add a Real Database
Replace the in-memory storage in `src/users/userDatabase.js` with MongoDB, PostgreSQL, or your preferred database.

### Add More Users
Edit the `users` array in `src/users/userDatabase.js` to add more demo accounts or connect to a database.

### Change Company Name
Search for "P&K Backend Automation" throughout the HTML files to rebrand the entire application.

### Modify Port
Change the `PORT` variable in `server.js` (default: 3000)

## Production Deployment

Before deploying to production:

1. Set `secure: true` in session cookies (requires HTTPS)
2. Use a real database instead of in-memory storage
3. Set strong secret keys for sessions
4. Enable CORS if needed
5. Set proper environment variables
6. Add rate limiting
7. Implement proper error logging
8. Use a production-grade web server (Nginx, Apache)

## License

© 2026 P&K Backend Automation. All rights reserved.

## Support

For support, contact: support@pkautomation.com
