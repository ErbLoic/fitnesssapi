function requireAdmin(req, res, next) {
  if (req.session && req.session.admin === true) {
    req.adminRole = req.session.adminRole || 'admin';
    res.locals.adminRole = req.adminRole;
    res.locals.adminIsReadOnly = req.adminRole !== 'admin';
    res.locals.adminUsername = req.session.adminUsername;
    return next();
  }
  res.redirect('/admin/login');
}

function requireAdminFull(req, res, next) {
  return requireAdmin(req, res, () => {
    if (req.adminRole === 'admin') return next();
    return res.status(403).render('admin/error', {
      message: 'Acces reserve aux administrateurs complets.',
      admin: req.session.adminUsername,
    });
  });
}

module.exports = requireAdmin;
module.exports.requireAdminFull = requireAdminFull;
