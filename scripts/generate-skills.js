#!/usr/bin/env node
/**
 * Generates netlify/functions/skills.mjs from HITL-AI-DLC SKILL.md files.
 * Run: node scripts/generate-skills.js
 *
 * Requires the HITL-AIDLC repo at ../HITL-AIDLC (sibling directory).
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const suiteDir = join(__dirname, '..', '..', 'HITL-AIDLC', 'HITL-AI-DLC');
const outputPath = join(__dirname, '..', 'netlify', 'functions', 'skills.mjs');

const roles = [
  { id: 'CPO', dir: '03_aidlc-cpo' },
  { id: 'CTO', dir: '04_aidlc-cto' },
  { id: 'CQO', dir: '05_aidlc-cqo' },
  { id: 'CDO', dir: '06_aidlc-cdo' },
  { id: 'CCO', dir: '07_aidlc-cco' },
  { id: 'CIO', dir: '09_aidlc-cio' },
  { id: 'CSO', dir: '10_aidlc-cso' },
];

let output = '// Auto-generated from HITL-AI-DLC SKILL.md files\n';
output += '// Do not edit manually — regenerate with: node scripts/generate-skills.js\n\n';
output += 'export const SKILLS = {\n';

for (const role of roles) {
  const filePath = join(suiteDir, role.dir, 'SKILL.md');
  const content = readFileSync(filePath, 'utf-8');
  const escaped = content.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$/g, '\\$');
  output += `  ${role.id}: \`${escaped}\`,\n\n`;
  console.log(`  ${role.id}: ${(content.length / 1024).toFixed(1)} KB`);
}

output += '};\n';

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, output);
console.log(`\nGenerated: ${outputPath} (${(output.length / 1024).toFixed(1)} KB)`);
