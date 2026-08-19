const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if(!token) return res.status(401).json({erreur:"⛔ Accès refusé"});

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;

    if(!['admin','parent','eleve'].includes(decoded.role)) return res.status(403).json({erreur:"⛔ Accès réservé"});
    next();
  } catch (e) {
    res.status(401).json({erreur:"⛔ Session invalide ou expirée"});
  }
};