// Prints the code map of a folder: node bin/map.js <folder> (this project's own src folder when none is given).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeMap } from '../src/code-map.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const folder = path.resolve(process.argv[2] || path.join(here, '..', 'src'));
console.log(codeMap(folder));
