import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const singBoxPath = path.join(__dirname, 'sing-box.js');
const baseTplPath = path.join(__dirname, 'sing-box-1.12.base.tpl.json');

const currentScript = fs.readFileSync(singBoxPath, 'utf8');
const headScript = execSync('git show HEAD:scripts/sing-box.js', {
  cwd: projectRoot,
  encoding: 'utf8'
});

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

async function runScript(script, { args, template, proxies }) {
  const fn = new AsyncFunction('$arguments', '$files', 'produceArtifact', '$content', `${script}\nreturn $content;`);
  const producer = async () => proxies;
  return fn(args, [template], producer, '');
}

function hash(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

const baseTpl = fs.readFileSync(baseTplPath, 'utf8');
const proxies = [
  { tag: 'ts-us-01', type: 'vmess', server: 'a.com', server_port: 443 },
  { tag: 'home-01', type: 'vmess', server: 'b.com', server_port: 443 },
  { tag: 'novastar-01', type: 'vmess', server: 'c.com', server_port: 443 },
  { tag: 'game-01', type: 'vmess', server: 'd.com', server_port: 443 },
  { tag: 'landing-us-01', type: 'vmess', server: 'e.com', server_port: 443 }
];

const syntheticTpl = JSON.stringify({
  experimental: { clash_api: { external_ui_download_detour: '直连' } },
  dns: {
    servers: [{ tag: 'hosts', address: 'local' }],
    rules: [{ rule_set: 'x', action: 'route', server: 'proxyDns' }]
  },
  route: {
    final: '➡️节点选择',
    auto_detect_interface: true,
    rules: [
      { clash_mode: 'global', outbound: 'DIRECT' },
      { domain_suffix: ['novastar-led.cn'], outbound: 'DIRECT' },
      { rule_set: ['geosite-novastar-internal', 'geosite-cn'], outbound: '⭐NovaStar' },
      { outbound: '🦅美国原生' }
    ],
    rule_set: [{ tag: 'geosite-novastar-internal' }, { tag: 'keep' }]
  },
  outbounds: [
    { type: 'selector', tag: '➡️节点选择', outbounds: ['proxy-A', 'proxy-B'] },
    { type: 'selector', tag: '⭐NovaStar', outbounds: [] },
    { type: 'selector', tag: '🏠回家节点', outbounds: [] },
    { type: 'selector', tag: '🕹️游戏节点', outbounds: [] },
    { type: 'selector', tag: '🦅美国原生', outbounds: [] },
    { type: 'direct', tag: '直连' },
    { type: 'vmess', tag: 'proxy-A', server: 'a.com', server_port: 443 },
    { type: 'vmess', tag: 'proxy-B', server: 'b.com', server_port: 443 }
  ]
}, null, 2);

const scenarios = [
  {
    name: 'company_full',
    template: baseTpl,
    args: {
      profile: 'company',
      collection: 'dummy',
      novastar_hosts: 'true',
      tailscale: 'true',
      selector_outbound: '🏠回家节点:ts-ep,⭐NovaStar:novastar',
      relay_map: 'nova:all'
    },
    proxies
  },
  {
    name: 'home_basic',
    template: baseTpl,
    args: {
      profile: 'home',
      collection: 'dummy',
      novastar_hosts: 'false',
      tailscale: 'true'
    },
    proxies
  },
  {
    name: 'op_mode',
    template: baseTpl,
    args: {
      profile: 'op',
      collection: 'dummy',
      novastar_hosts: 'false',
      tailscale: 'true'
    },
    proxies
  },
  {
    name: 'synthetic_selector_relay',
    template: syntheticTpl,
    args: {
      profile: 'company',
      collection: 'dummy',
      novastar_hosts: 'true',
      tailscale: 'true',
      selector_outbound: '🏠回家节点:ts-ep,⭐NovaStar:novastar',
      relay_map: 'nova:all'
    },
    proxies
  }
];

let hasDiff = false;
for (const scenario of scenarios) {
  const outHead = await runScript(headScript, scenario);
  const outCurrent = await runScript(currentScript, scenario);
  const headHash = hash(outHead);
  const currentHash = hash(outCurrent);
  const same = headHash === currentHash;
  if (!same) {
    hasDiff = true;
  }
  console.log(`${scenario.name} head=${headHash} current=${currentHash} same=${same}`);
}

if (hasDiff) {
  process.exit(2);
}
