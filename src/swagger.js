const swaggerUi = require('swagger-ui-express');
const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');

// Lire et charger le fichier swagger.yaml
const swaggerFile = fs.readFileSync(path.join(__dirname, '..', 'swagger.yaml'), 'utf8');
const swaggerDoc = yaml.load(swaggerFile);

function getSwaggerDocForRole(role = 'admin') {
  const doc = JSON.parse(JSON.stringify(swaggerDoc));
  if (role !== 'visitor') return doc;

  doc.info.description = [
    '### Guide rapide visiteur',
    '',
    '> Tu es en lecture seule sur le panel admin. Le Swagger reste disponible pour comprendre et tester l API.',
    '',
    '1. Utilise `POST /auth/login` avec un vrai compte mobile de test.',
    '2. Copie `accessToken` dans la reponse.',
    '3. Clique sur **Authorize** puis colle `Bearer TON_ACCESS_TOKEN`.',
    '4. Teste les endpoints. Attention: les routes POST/PATCH/DELETE peuvent modifier la prod.',
    '',
    '**Donnees protegees en visiteur:** emails masques, details seances/courses bloques, GPS et JSON complets reserves aux admins.',
    '',
    'Le serveur de production est `https://fitnesssapi.onrender.com`, sans `/v1`.',
    '',
    'Le guide complet est disponible dans la section **Guide visiteur** avec `GET /guide-visiteur`.',
  ].join('\n');

  doc.tags = [
    {
      name: 'Guide visiteur',
      description: 'Lire cette section avant de tester les routes avec un compte visiteur du panel admin.',
    },
    ...(doc.tags || []),
  ];

  doc.paths = {
    '/guide-visiteur': {
      get: {
        tags: ['Guide visiteur'],
        summary: 'Guide visiteur du Swagger',
        description: 'Retourne un mode d emploi court pour utiliser Swagger avec un compte visiteur du panel admin.',
        responses: {
          200: {
            description: 'Guide visiteur',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' },
                    steps: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                    protectedData: {
                      type: 'array',
                      items: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    ...doc.paths,
  };

  return doc;
}

function getSwaggerUiOptions(role = 'admin') {
  if (role !== 'visitor') return {};

  return {
    customSiteTitle: 'FitnessPro API - Visiteur',
    customCss: `
      body {
        background: #111820 !important;
      }
      .swagger-ui {
        background: #111820 !important;
        color: #f8fafc !important;
      }
      .swagger-ui .wrapper {
        padding: 18px 20px;
      }
      .swagger-ui,
      .swagger-ui .info,
      .swagger-ui .info .markdown,
      .swagger-ui .info .markdown p,
      .swagger-ui .info .markdown li,
      .swagger-ui .info .markdown strong,
      .swagger-ui .info .markdown h3 {
        color: #f8fafc !important;
      }
      .swagger-ui .info {
        border: 1px solid #334155;
        border-radius: 8px;
        padding: 22px 24px;
        background: #182331;
        box-shadow: 0 16px 40px rgba(0,0,0,0.28);
      }
      .swagger-ui .info .title {
        color: #f8fafc !important;
      }
      .swagger-ui .info .title small,
      .swagger-ui .info .title small pre,
      .swagger-ui .info .title small.version-stamp {
        color: #ffffff !important;
      }
      .swagger-ui .info .markdown h3 {
        margin: 18px 0 10px;
        font-size: 20px;
        font-weight: 800;
      }
      .swagger-ui .info .markdown blockquote {
        border-left: 4px solid #2563eb;
        background: #0f2747;
        color: #dbeafe !important;
        margin: 12px 0;
        padding: 12px 14px;
        border-radius: 6px;
      }
      .swagger-ui .info .markdown ol {
        background: #111827;
        border: 1px solid #334155;
        border-radius: 8px;
        padding: 14px 18px 14px 34px;
        margin: 12px 0;
      }
      .swagger-ui .info .markdown li {
        margin: 6px 0;
        line-height: 1.45;
      }
      .swagger-ui .info code,
      .swagger-ui .markdown code {
        background: #050816 !important;
        color: #f0abfc !important;
        border-radius: 5px;
        padding: 3px 6px;
        font-weight: 700;
      }
      .swagger-ui .opblock-tag-section:first-of-type .opblock-tag {
        background: #0f172a;
        color: #fff !important;
        border-radius: 8px;
        padding: 12px 16px;
      }
      .swagger-ui .opblock-tag-section:first-of-type .opblock-tag small {
        color: #dbeafe !important;
      }
    `,
  };
}

module.exports = {
  swaggerUi,
  swaggerDoc,
  getSwaggerDocForRole,
  getSwaggerUiOptions,
};
