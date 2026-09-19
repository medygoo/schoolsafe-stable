// Values are never printed or written to the report. Only paths/lines/rule names.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { selectFiles, selectedBytes, privatePath } from './selection.mjs';

const rules = [
  ['private-key', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED )?PRIVATE KEY-----/g],
  ['github-token', /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/g],
  ['aws-access-key', /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ['provider-token', /\b(?:sk-(?:proj-|ant-)?[A-Za-z0-9_-]{24,}|xox[baprs]-[A-Za-z0-9-]{20,}|AIza[0-9A-Za-z_-]{35})\b/g],
  ['credential-url', /(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?):\/\/[^\s/'":]+:[^\s/@]+@/g],
  ['jwt', /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/g],
];

export function scan(entries) {
  const findings = [], literalCandidates = [], metadataCandidates = [];
  const reviews = JSON.parse(fs.readFileSync(new URL('./scan-reviewed-literals.json', import.meta.url), 'utf8')).reviews;
  let reviewedLiteralCount = 0;
  let textFiles = 0, binaryFiles = 0;
  for (const { path: p, bytes } of entries) {
    if (privatePath(p)) findings.push({ path: p, line: null, rule: 'private-path' });
    const isText = !bytes.subarray(0, 8192).includes(0) && /(?:\.(?:[cm]?js|ts|json|csv|md|sql|toml|html|css|txt|sh|ps1|ya?ml|sha256|webmanifest)$|(?:^|\/)(?:Dockerfile|\.[a-z]+|\.keep|\.gitkeep)$)/i.test(p);
    const content = bytes.toString(isText ? 'utf8' : 'latin1');
    isText ? textFiles++ : binaryFiles++;
    for (const [rule, pattern] of rules) {
      pattern.lastIndex = 0;
      for (const match of content.matchAll(pattern)) findings.push({ path: p, line: isText ? content.slice(0, match.index).split('\n').length : null, rule });
    }
    if (isText) {
      const pattern = /\b(?:password|secret|token|apiKey|privateKey|accessKeyId)\s*[:=]\s*(['"])([^'"\r\n]{16,})\1/gi;
      for (const m of content.matchAll(pattern)) {
        if (/^(?:test[-_]|dummy|example|not[-_]|fake[-_]|redacted|changeme)/i.test(m[2])) continue;
        const line = content.slice(0, m.index).split('\n').length;
        const sha256 = createHash('sha256').update(m[2]).digest('hex');
        if (reviews.some(r => r.path === p && r.line === line && r.sha256 === sha256)) reviewedLiteralCount++;
        else literalCandidates.push({ path: p, line, rule: 'credential-literal-review' });
      }
    } else if (/\.(?:jpe?g|png|webp)$/i.test(p) && /Exif\x00\x00|<\?xpacket|GPSLatitude|GPSLongitude/.test(content)) {
      metadataCandidates.push({ path: p, rule: 'image-metadata-review' });
    }
  }
  return { kind: 'local-pattern-and-path-scan', textFiles, binaryFiles, findings, literalCandidates, metadataCandidates, reviewedLiteralCount,
    limitation: 'Not Gitleaks or an exhaustive confidentiality certificate. No values recorded. Images require separate provenance review.' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(process.argv[2] || '.');
  const { files } = selectFiles(root);
  const result = scan(files.map(p => ({ path: p, bytes: selectedBytes(root, p).bytes })));
  console.log(JSON.stringify(result, null, 2));
  if (result.findings.length || result.literalCandidates.length || result.metadataCandidates.length) process.exitCode = 1;
}
