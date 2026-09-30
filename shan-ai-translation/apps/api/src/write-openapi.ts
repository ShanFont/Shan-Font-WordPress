import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { openApiDocument } from './openapi-document';

const target = path.resolve(__dirname, '../../../packages/api-client/openapi.json');
mkdirSync(path.dirname(target), { recursive: true });
writeFileSync(target, `${JSON.stringify(openApiDocument, null, 2)}\n`);
console.log(`wrote ${target}`);
