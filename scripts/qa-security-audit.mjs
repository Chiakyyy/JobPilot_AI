// This script executes automated security secret scanning, pdf validation tests, and ai grounding verification.
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();

// This section performs static secret leak scanning across client accessible source files.
console.log('--- Test 1 : Analyse statique d’étanchéité des secrets client ---');

const forbiddenPatterns = [
  'service_role',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID',
];

function scanDirectory(dirPath, fileList = []) {
  if (!fs.existsSync(dirPath)) {
    return fileList;
  }
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '.git' && entry.name !== '.expo') {
        scanDirectory(fullPath, fileList);
      }
    } else if (/\.(tsx?|jsx?|json|env|mjs)$/i.test(entry.name)) {
      fileList.push(fullPath);
    }
  }
  return fileList;
}

const clientFiles = [
  ...scanDirectory(path.join(projectRoot, 'src')),
  path.join(projectRoot, '.env.example'),
].filter((f) => fs.existsSync(f));

let leakCount = 0;
for (const file of clientFiles) {
  const content = fs.readFileSync(file, 'utf8');
  for (const pattern of forbiddenPatterns) {
    if (content.includes(pattern)) {
      console.error(`Erreur : secret détecté dans le code client : ${file} contient '${pattern}'`);
      leakCount++;
    }
  }
}

assert.strictEqual(leakCount, 0, 'Des clés secrètes serveur ont été détectées dans le bundle client.');
console.log(`✓ 0 secret serveur détecté sur ${clientFiles.length} fichiers client scannés.`);

// This section validates defensive client side pdf file checking routines.
console.log('\n--- Test 2 : Validation défensive des fichiers PDF (format et taille) ---');

function validatePdfBuffer(bytes, sizeInBytes) {
  if (sizeInBytes <= 0) {
    return { valid: false, error: 'Fichier vide' };
  }
  if (sizeInBytes > 5 * 1024 * 1024) {
    return { valid: false, error: 'Taille supérieure à 5 Mo' };
  }
  if (bytes.length < 5) {
    return { valid: false, error: 'En-tête trop court' };
  }
  const header = String.fromCharCode(...bytes.slice(0, 5));
  if (header !== '%PDF-') {
    return { valid: false, error: 'En-tête invalide' };
  }
  return { valid: true };
}

// Verify that a valid pdf magic header bytes array is accepted.
const validHeader = [0x25, 0x50, 0x44, 0x46, 0x2d];
assert.strictEqual(validatePdfBuffer(validHeader, 1024).valid, true);

// Verify that an invalid non pdf file header is rejected.
const pngHeader = [0x89, 0x50, 0x4e, 0x47, 0x0d];
assert.strictEqual(validatePdfBuffer(pngHeader, 1024).valid, false);

// Verify that zero byte files and oversized files are rejected.
assert.strictEqual(validatePdfBuffer(validHeader, 0).valid, false);
assert.strictEqual(validatePdfBuffer(validHeader, 5 * 1024 * 1024 + 1).valid, false);
assert.strictEqual(validatePdfBuffer(validHeader, 5 * 1024 * 1024).valid, true);

console.log('✓ Validation de la signature magique %PDF- et des bornes de taille réussie.');

// This section verifies factual grounding and boundary token isolation algorithms.
console.log('\n--- Test 3 : Ancrage factuel et élimination déterministe des faux positifs IA ---');

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isSkillPresentInCv(skill, normalizedCv) {
  const trimmed = skill.trim().toLowerCase();
  if (!trimmed) {
    return false;
  }
  const cleaned = trimmed
    .replace(/^(maîtrise de |connaissance de |notions de |expérience en |pratique de |mastery of |knowledge of |experience with )/i, '')
    .replace(/\(.*?\)/g, '')
    .trim();

  const candidates = [trimmed, cleaned].filter((c) => c.length > 0);

  for (const candidate of candidates) {
    if (candidate.length === 1 && !['c', 'r'].includes(candidate)) {
      continue;
    }
    const escaped = escapeRegex(candidate);
    const pattern = new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9+#])`, 'i');
    if (pattern.test(normalizedCv)) {
      return true;
    }
  }
  return false;
}

function applyGroundingFilter(matchedSkills, missingSkills, cvText) {
  const normalizedCv = cvText.toLowerCase();
  const dedupedMatched = Array.from(new Set(matchedSkills.map((s) => s.trim()))).filter(Boolean);
  const matchedSet = new Set(dedupedMatched.map((s) => s.toLowerCase()));

  const filteredMissing = [];
  for (const skill of missingSkills) {
    const trimmed = skill.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (matchedSet.has(lower)) continue;
    if (isSkillPresentInCv(trimmed, normalizedCv)) continue;
    filteredMissing.push(trimmed);
  }

  return {
    matched: dedupedMatched,
    missing: Array.from(new Set(filteredMissing)),
  };
}

const mockCvText = `
Ingénieur d'études mobile expérimenté.
Compétences clés : TypeScript, React Native, C#, .NET MAUI, Firebase, Figma, REST API.
Expérience solide en intégration continue et méthodologie Scrum.
`;

// Verify that skills present in the cv are removed from missing skills.
const testResult1 = applyGroundingFilter(
  ['React Native'],
  ['Firebase', 'Docker', 'AWS'],
  mockCvText
);
assert.deepStrictEqual(testResult1.missing, ['Docker', 'AWS']);

// Verify boundary condition that programming language c does not match c sharp.
assert.strictEqual(isSkillPresentInCv('c', mockCvText.toLowerCase()), false);

// Verify boundary condition that go does not match django.
const djangoCv = 'Développeur backend django et python';
assert.strictEqual(isSkillPresentInCv('go', djangoCv), false);

// Verify mutual exclusivity between matched and missing skills.
const testResult2 = applyGroundingFilter(
  ['Docker'],
  ['Docker', 'Kubernetes'],
  mockCvText
);
assert.deepStrictEqual(testResult2.missing, ['Kubernetes']);

console.log('✓ Filtrage déterministe d’ancrage et isolation par frontières de mots validés.');

console.log('\n========================================');
console.log('TOUS LES TESTS DE SÉCURITÉ ET D’AUDIT SONT VALIDES (3/3)');
console.log('========================================');
