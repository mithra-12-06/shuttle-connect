
const {
    registerPassenger,
    loginPassenger
} = require('../controllers/authController');

async function handleAuthRoute(req, res, pathname, helpers) {

    if (
        pathname === '/api/auth/register' &&
        req.method === 'POST'
    ) {
        await registerPassenger(req, res, helpers);
        return true;
    }

    if (
        pathname === '/api/auth/login' &&
        req.method === 'POST'
    ) {
        await loginPassenger(req, res, helpers);
        return true;
    }

    return false;
}

module.exports = handleAuthRoute;
