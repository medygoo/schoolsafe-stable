import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

// Contrat du bundle frontend SchoolSafe :
// - le fichier existe ;
// - il n'est pas vide ;
// - il définit le global SchoolSafeSupabaseSDK (IIFE) ;
// - il expose createClient.
// Échec => code de sortie non zéro.

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundlePath = path.join(root, 'app', 'vendor', 'supabase-sdk.js');

function fail(message) {
  console.error(`AUTH_SDK_CHECK FAIL: ${message}`);
  process.exit(1);
}

if (!existsSync(bundlePath)) {
  fail(`bundle introuvable : ${bundlePath}`);
}

const source = readFileSync(bundlePath, 'utf8');

if (source.trim().length === 0) {
  fail('bundle vide');
}

if (!source.includes('SchoolSafeSupabaseSDK')) {
  fail('global SchoolSafeSupabaseSDK absent du bundle');
}

// Évaluation du bundle dans un contexte isolé pour vérifier l'export réel.
const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'supabase-sdk.js' });

const sdk = sandbox.SchoolSafeSupabaseSDK;
if (sdk === undefined || sdk === null) {
  fail('SchoolSafeSupabaseSDK non défini après évaluation du bundle');
}

if (typeof sdk.createClient !== 'function') {
  fail('createClient non exposé par SchoolSafeSupabaseSDK');
}

console.log('AUTH_SDK_CHECK PASS: bundle exposes SchoolSafeSupabaseSDK.createClient');
