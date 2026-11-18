
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

// ==========================================
// PASSENGER REGISTRATION
// ==========================================

async function registerPassenger(req, res, helpers) {
    const { readJsonBody, sendJson } = helpers;

    try {
        const data = await readJsonBody(req);

        const fullName = typeof data.full_name === 'string'
            ? data.full_name.trim()
            : '';

        const email = typeof data.email === 'string'
            ? data.email.trim().toLowerCase()
            : '';

        const phone = typeof data.phone === 'string'
            ? data.phone.trim() || null
            : null;

        const password = typeof data.password === 'string'
            ? data.password
            : '';

        if (!fullName || !email || !password) {
            return sendJson(res, 400, {
                success: false,
                message: 'Name, email and password are required'
            });
        }

        if (fullName.length > 100 || email.length > 150) {
            return sendJson(res, 400, {
                success: false,
                message: 'Name or email is too long'
            });
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            return sendJson(res, 400, {
                success: false,
                message: 'Please enter a valid email address'
            });
        }

        if (password.length < 8) {
            return sendJson(res, 400, {
                success: false,
                message: 'Password must contain at least 8 characters'
            });
        }

        if (phone && phone.length > 15) {
            return sendJson(res, 400, {
                success: false,
                message: 'Phone number is too long'
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const [result] = await pool.execute(
            `INSERT INTO users
                (full_name, email, phone, password_hash, account_role)
             VALUES (?, ?, ?, ?, 'passenger')`,
            [fullName, email, phone, passwordHash]
        );

        return sendJson(res, 201, {
            success: true,
            message: 'Passenger registered successfully!',
            user: {
                user_id: result.insertId,
                full_name: fullName,
                email,
                phone,
                account_role: 'passenger'
            }
        });

    } catch (error) {
        console.error('Registration error:', error);

        if (error.code === 'ER_DUP_ENTRY') {
            return sendJson(res, 409, {
                success: false,
                message: 'Email or phone number is already registered'
            });
        }

        if (error.message === 'Invalid JSON') {
            return sendJson(res, 400, {
                success: false,
                message: 'Invalid JSON request'
            });
        }

        if (error.message === 'Request body too large') {
            return sendJson(res, 413, {
                success: false,
                message: 'Request body is too large'
            });
        }

        return sendJson(res, 500, {
            success: false,
            message: 'Registration failed. Please try again.'
        });
    }
}

// ==========================================
// PASSENGER LOGIN
// ==========================================

async function loginPassenger(req, res, helpers) {
    const { readJsonBody, sendJson } = helpers;

    try {
        const data = await readJsonBody(req);

        const email = typeof data.email === 'string'
            ? data.email.trim().toLowerCase()
            : '';

        const password = typeof data.password === 'string'
            ? data.password
            : '';

        if (!email || !password) {
            return sendJson(res, 400, {
                success: false,
                message: 'Email and password are required'
            });
        }

        const [rows] = await pool.execute(
            `SELECT
                user_id,
                full_name,
                email,
                password_hash,
                account_role,
                is_active
             FROM users
             WHERE email = ?
             LIMIT 1`,
            [email]
        );

        if (rows.length === 0) {
            return sendJson(res, 401, {
                success: false,
                message: 'Invalid email or password'
            });
        }

        const user = rows[0];

        if (user.account_role !== 'passenger') {
            return sendJson(res, 403, {
                success: false,
                message: 'Please use the appropriate login portal'
            });
        }

        if (Number(user.is_active) !== 1) {
            return sendJson(res, 403, {
                success: false,
                message: 'Your account is inactive'
            });
        }

        const passwordMatch = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!passwordMatch) {
            return sendJson(res, 401, {
                success: false,
                message: 'Invalid email or password'
            });
        }

        if (!process.env.JWT_SECRET) {
            console.error('JWT_SECRET is missing');

            return sendJson(res, 500, {
                success: false,
                message: 'Authentication configuration error'
            });
        }

        const token = jwt.sign(
            {
                user_id: user.user_id,
                account_role: user.account_role
            },
            process.env.JWT_SECRET,
            {
                expiresIn: process.env.JWT_EXPIRES_IN || '1d'
            }
        );

        return sendJson(res, 200, {
            success: true,
            message: 'Login successful!',
            token,
            user: {
                user_id: user.user_id,
                full_name: user.full_name,
                email: user.email,
                account_role: 'passenger'
            }
        });

    } catch (error) {
        console.error('Login error:', error);

        if (error.message === 'Invalid JSON') {
            return sendJson(res, 400, {
                success: false,
                message: 'Invalid JSON request'
            });
        }

        return sendJson(res, 500, {
            success: false,
            message: 'Login failed. Please try again.'
        });
    }
}

module.exports = {
    registerPassenger,
    loginPassenger
};
