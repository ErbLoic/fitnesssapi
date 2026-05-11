const router = require('express').Router();

const apiRouters = [
  { mountPath: '/ping', modulePath: './ping', middleware: ['api'] },
  { mountPath: '/auth', modulePath: './auth', middleware: ['api'] },
  { mountPath: '/users', modulePath: './users', middleware: ['api', 'auth'] },
  { mountPath: '/workouts', modulePath: './workouts', middleware: ['api', 'auth'] },
  { mountPath: '/programs', modulePath: './programs', middleware: ['api', 'auth'] },
  { mountPath: '/workout-sessions', modulePath: './workoutSessions', middleware: ['api', 'auth'] },
  { mountPath: '/running', modulePath: './running', middleware: ['api', 'auth'] },
  { mountPath: '/steps', modulePath: './steps', middleware: ['api', 'auth'] },
  { mountPath: '/weight', modulePath: './weight', middleware: ['api', 'auth'] },
  { mountPath: '/badges', modulePath: './badges', middleware: ['api', 'auth'] },
  { mountPath: '/settings', modulePath: './settings', middleware: ['api', 'auth'] },
  { mountPath: '/devices', modulePath: './devices', middleware: ['api', 'auth'] },
  { mountPath: '/me', modulePath: './me', middleware: ['api', 'auth'] },
  { mountPath: '/sync', modulePath: './sync', middleware: ['api', 'auth'] },
  { mountPath: '/app', modulePath: './appConfig', middleware: ['api'] },
  { mountPath: '/conversations', modulePath: './messages', middleware: ['api', 'auth'] },
  { mountPath: '/friends', modulePath: './friends', middleware: ['api', 'auth'] },
  { mountPath: '/errors', modulePath: './errors', middleware: ['api'] },
  { mountPath: '/api/users', modulePath: './users', middleware: ['api', 'auth'] },
  { mountPath: '/api/programs', modulePath: './programs', middleware: ['api', 'auth'] },
  { mountPath: '/api/workout-sessions', modulePath: './workoutSessions', middleware: ['api', 'auth'] },
  { mountPath: '/api/devices', modulePath: './devices', middleware: ['api', 'auth'] },
  { mountPath: '/api/me', modulePath: './me', middleware: ['api', 'auth'] },
];

function normalizePath(path) {
  if (!path || path === '/') return '';
  return path.startsWith('/') ? path : `/${path}`;
}

function joinPaths(basePath, routePath) {
  return `${normalizePath(basePath)}${normalizePath(routePath)}` || '/';
}

function getParameters(uri) {
  const matches = uri.matchAll(/:([A-Za-z0-9_]+)/g);
  return Array.from(matches, (match) => match[1]);
}

function makeRouteName(method, uri) {
  const cleanUri = uri
    .replace(/^\/api\/?/, '')
    .replace(/:([A-Za-z0-9_]+)/g, '$1')
    .split('/')
    .filter(Boolean)
    .join('.');

  return `${cleanUri || 'root'}.${method.toLowerCase()}`;
}

function makeAction(modulePath, method, routePath) {
  const controller = modulePath
    .replace('./', '')
    .replace(/Routes$/, '')
    .replace(/^\w/, (letter) => letter.toUpperCase());

  const action = routePath === '/'
    ? method.toLowerCase()
    : `${method.toLowerCase()} ${routePath}`;

  return `${controller}Controller@${action}`;
}

function collectRoutes({ mountPath, modulePath, middleware }) {
  const routeModule = require(modulePath);

  return routeModule.stack
    .filter((layer) => layer.route)
    .flatMap((layer) => {
      const uri = joinPaths(mountPath, layer.route.path);

      return Object.keys(layer.route.methods).map((method) => ({
        method: method.toUpperCase(),
        uri,
        name: makeRouteName(method, uri),
        action: makeAction(modulePath, method, layer.route.path),
        middleware,
        parameters: getParameters(uri),
      }));
    });
}

function buildManifest() {
  const routes = [
    {
      method: 'GET',
      uri: '/api/manifest',
      name: 'manifest.get',
      action: 'ManifestController@get',
      middleware: ['api'],
      parameters: [],
    },
    ...apiRouters.flatMap(collectRoutes),
  ];

  return {
    name: process.env.API_NAME || 'FitnessPro API',
    routes: routes.sort((a, b) => a.uri.localeCompare(b.uri) || a.method.localeCompare(b.method)),
  };
}

router.get('/', (_req, res) => {
  res.json(buildManifest());
});

module.exports = router;
module.exports.buildManifest = buildManifest;
