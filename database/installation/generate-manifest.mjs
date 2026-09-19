import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { installationInventory } from '../../scripts/installation-inventory.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const inventory = installationInventory(root);
await writeFile(path.join(root, 'database/installation/manifest.json'), `${JSON.stringify(inventory, null, 2)}\n`);
console.log(`Installation inventory: ${inventory.units.length} units; 2 blocked historical units + 1 unqualified auth unit; no SQL executed.`);
