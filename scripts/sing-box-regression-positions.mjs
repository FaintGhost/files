import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scriptPath = path.join(__dirname, 'sing-box.js');
const tplPath = path.join(__dirname, 'sing-box-1.12.base.tpl.json');

const script = fs.readFileSync(scriptPath, 'utf8');
const template = fs.readFileSync(tplPath, 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const run = new AsyncFunction('$arguments', '$files', 'produceArtifact', '$content', `${script}\nreturn $content;`);

const args = {
  profile: 'company',
  collection: 'dummy',
  selector_outbound: '🏠回家节点:ts-ep,⭐NovaStar:novastar',
  novastar_hosts: 'true',
  tailscale: 'true,ts-ep'
};

const proxies = [
  { tag: 'proxy-A', type: 'vmess', server: 'a.com', server_port: 443 },
  { tag: 'proxy-B', type: 'vmess', server: 'b.com', server_port: 443 }
];

const output = await run(args, [template], async () => proxies, '');
const config = JSON.parse(output);
const tags = (config.outbounds || []).map(item => item.tag);

const wanted = ['⭐NovaStar', '🦅美国原生', '🏠回家节点'];
for (const tag of wanted) {
  console.log(`${tag} index=${tags.indexOf(tag)}`);
}

console.log(tags.slice(0, 25).join(' | '));
