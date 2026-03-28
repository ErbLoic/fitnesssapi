module.exports = (req, res, next) => {
  if (req.session && req.session.admin === true) return next();
  res.redirect('/admin/login');
};
