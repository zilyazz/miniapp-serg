const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { swaggerSpec } = require('../swagger');

const outputPath = path.join(__dirname, '..', 'api', 'openapi', 'openapi.yaml');

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(
  outputPath,
  yaml.dump(swaggerSpec, {
    lineWidth: 120,
    noRefs: true,
    sortKeys: false,
  }),
  'utf8'
);

console.log(`OpenAPI YAML generated: ${outputPath}`);
