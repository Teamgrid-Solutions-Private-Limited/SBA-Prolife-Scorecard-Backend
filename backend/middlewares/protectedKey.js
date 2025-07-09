const PROTECTED_KEY = process.env.PROTECTED_KEY || 'default-protected-key';

module.exports = function (req, res, next) {
  const key = req.headers['x-protected-key'];
  if (!key || key !== PROTECTED_KEY) {
    return res.status(401).json({ message: 'Unauthorized: Invalid or missing protected key' });
  }
  next();
}; 