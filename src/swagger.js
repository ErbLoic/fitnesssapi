const swaggerUi = require('swagger-ui-express');
const fs = require('fs');
const yaml = require('js-yaml');
const path = require('path');

// Lire et charger le fichier swagger.yaml
const swaggerFile = fs.readFileSync(path.join(__dirname, '..', 'swagger.yaml'), 'utf8');
const swaggerDoc = yaml.load(swaggerFile);

module.exports = {
  swaggerUi,
  swaggerDoc,
};
