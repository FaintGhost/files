import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scriptPath = path.join(__dirname, 'sing-box.js');
const tplPath = path.join(__dirname, 'sing-box-1.12.base.tpl.json');

const outPath = getArgValue('--out') || '/tmp/singbox_modularize_after.txt';
const comparePath = getArgValue('--compare');

const script = fs.readFileSync(scriptPath, 'utf8');
const template = fs.readFileSync(tplPath, 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index >= process.argv.length - 1) {
    return undefined;
  }
  return process.argv[index + 1];
}

function createProducer() {
  const proxies = [
    { tag: 'HK-01', type: 'vmess' },
    { tag: 'US4家宽-01', type: 'vmess' },
    { tag: 'HOME-01', type: 'vmess' },
    { tag: 'GAME-01', type: 'vmess' },
    { tag: 'landing-sg-01', type: 'vmess' }
  ];
  return async () => proxies;
}

async function run(args) {
  const fn = new AsyncFunction('$arguments', '$files', 'produceArtifact', '$content', `${script}\nreturn $content;`);
  return fn(args, [template], createProducer(), '');
}

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

const scenarios = [
  {
    name: 'company_full',
    args: {
      profile: 'company',
      collection: 'dummy',
      novastar_hosts: 'true',
      tailscale: 'true,ts-host',
      selector_outbound: '🏠回家节点:ts-ep,⭐NovaStar:novastar',
      relay_map: 'nova:all'
    }
  },
  {
    name: 'home_basic',
    args: {
      profile: 'home',
      collection: 'dummy',
      novastar_hosts: 'false'
    }
  },
  {
    name: 'op_mode',
    args: {
      profile: 'op',
      collection: 'dummy',
      novastar_hosts: 'false'
    }
  }
];

const lines = [];
for (const scenario of scenarios) {
  const output = await run(scenario.args);
  lines.push(`${scenario.name} ${hash(output)}`);
}

const content = `${lines.join('\n')}\n`;
fs.writeFileSync(outPath, content, 'utf8');
console.log(content.trim());

if (comparePath) {
  const baseline = fs.readFileSync(comparePath, 'utf8');
  if (baseline !== content) {
    console.error(`hash mismatch: compare=${comparePath} out=${outPath}`);
    process.exit(2);
  }
}
