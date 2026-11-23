import assert from 'node:assert/strict';
import fs from 'node:fs';

const script = fs.readFileSync(new URL('./sing-box.js', import.meta.url), 'utf8');
const template = fs.readFileSync(new URL('./sing-box-1.12.base.tpl.json', import.meta.url), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const run = new AsyncFunction('$arguments', '$files', 'produceArtifact', '$content', `${script}\nreturn $content;`);
const proxies = ['🇭🇰 HK', '🇹🇼 TW', '🇸🇬 SG', '🇯🇵 JP', '🇺🇸 美国 us4 家宽', 'landing-us', 'home', 'novastar']
  .map((tag, index) => ({ type: 'socks', tag, server: '127.0.0.1', server_port: 11000 + index }));

async function generate(args) {
  return JSON.parse(await run({ collection: 'test', ...args }, [template], async () => structuredClone(proxies), ''));
}

function checkReferences(config) {
  const tags = new Set([...config.outbounds, ...config.endpoints].map(item => item.tag));
  for (const outbound of config.outbounds) {
    for (const tag of outbound.outbounds || []) {
      assert(tags.has(tag), `${outbound.tag} references missing ${tag}`);
    }
    if (outbound.detour) assert(tags.has(outbound.detour), `missing detour ${outbound.detour}`);
  }
  for (const rule of config.route.rules) {
    if (rule.outbound) assert(tags.has(rule.outbound), `missing route outbound ${rule.outbound}`);
  }
}

function checkNoCompany(config) {
  assert(!/novastar|novaops|novatools|pingjl\.com|pingboss\.com|companyDns|Make Nova Great Again|100\.106\.56\.51/i.test(JSON.stringify(config)), 'personal profiles must not contain company nodes, domains, DNS, rules or office Wi-Fi settings');
  checkReferences(config);
}

for (const profile of ['home', 'op']) {
  const config = await generate({ profile, tailscale: false });
  assert.deepEqual(config.endpoints, []);
  assert(!config.dns.servers.some(server => ['tailscale', 'hosts'].includes(server.type)));
  assert(!config.dns.rules.some(rule => rule.preferred_by === 'tailscaleDns'));
  assert(!config.outbounds.some(outbound => ['🏠回家节点', '⭐NovaStar'].includes(outbound.tag)));
  assert(!config.route.rules.some(rule => rule.outbound === '⭐NovaStar' || rule.preferred_by));
  checkNoCompany(config);
}

for (const tag of ['iphone', 'sing-box']) {
  const personal = await generate({ profile: 'home', novastar: false, tailscale: `true,${tag}`, tailscale_dns: 'magic', mtu: '1280', stack: 'auto' });
  checkNoCompany(personal);
  assert(personal.dns.servers.some(server => server.type === 'tailscale' && server.endpoint === tag), 'personal devices must retain tailnet DNS without company DNS');
  assert(personal.route.rules.some(rule => rule.preferred_by === tag && rule.outbound === tag), 'personal devices must retain home access through Tailscale');
  assert.deepEqual(personal.dns.rules[0].domain_suffix, ['ts.net'], 'personal DNS must not inherit company split-DNS domains from the tailnet');
  const personalDns = personal.dns.servers.find(server => server.type === 'tailscale');
  assert(!personalDns.accept_search_domain && !personalDns.accept_default_resolvers, 'personal DNS must not expand short names through company search domains or accept global resolvers');
  assert(personal.dns.rules.some(rule => rule.query_type === 'AAAA' && rule.action === 'predefined'), 'MagicDNS-only mode must retain public IPv4-only DNS');
}
checkNoCompany(await generate({ profile: 'company', novastar: false, tailscale: true }));

for (const profile of ['home', 'op', 'company']) {
  const { route } = await generate({ profile, tailscale: profile === 'company' });
  const udp443 = route.rules.findIndex(rule => rule.network === 'udp' && rule.port === 443 && rule.action === 'reject');
  const quic = route.rules.findIndex(rule => rule.protocol === 'quic' && rule.action === 'reject');
  const sniff = route.rules.findIndex(rule => rule.action === 'sniff');
  const firstOutbound = route.rules.findIndex(rule => rule.outbound && !rule.inbound);
  assert(udp443 >= 0 && udp443 < sniff, 'UDP/443 must be rejected before sniffing or mode routing');
  assert(quic > sniff && quic < firstOutbound, 'sniffed QUIC on other ports must be rejected before selectors');
  assert(route.rules[udp443].no_drop && route.rules[quic].no_drop, 'QUIC rejection must not degrade to silent drops under load');
  const ipv6 = route.rules.findIndex(rule => rule.action === 'reject' && (rule.ip_version === 6 || rule.rules?.some(item => item.ip_version === 6)));
  assert(ipv6 >= 0 && ipv6 < sniff, 'non-tailnet IPv6 must be rejected before sniffing accepts the TCP handshake');
  assert(route.rules[ipv6].no_drop, 'IPv6 rejection must remain explicit under load');
}

const router = await generate({ profile: 'op', auto_redirect: true });
const lanDnsIndex = router.dns.rules.findIndex(rule => rule.server === 'lanDns');
assert(lanDnsIndex >= 0 && lanDnsIndex < router.dns.rules.findIndex(rule => rule.clash_mode === 'global'), 'local names must not leak to public DNS in global mode');
assert.equal(router.dns.rules[lanDnsIndex].preferred_by, 'lanDns');
assert.equal(router.dns.rules[lanDnsIndex].disable_optimistic_cache, true, 'LAN discovery must not return stale optimistic DNS results');
assert(!(await generate({ profile: 'home' })).dns.servers.some(server => server.tag === 'lanDns'), 'router DNS discovery must not leak into other device profiles');

const company = await generate({ profile: 'company', tailscale: true, mtu: '1500' });
const endpoint = company.endpoints.find(item => item.type === 'tailscale');
assert.equal(endpoint.tag, 'ts-ep');
assert(!Object.hasOwn(endpoint, 'hostname'), 'hostname must be resolved on the device');
assert.equal(endpoint.accept_routes, true);
assert(!company.dns.servers.some(server => server.type === 'hosts'));
assert(company.outbounds.some(outbound => outbound.tag === 'novastar'), 'company-enabled profiles must retain the company connection node');
assert.equal(company.dns.servers.find(server => server.tag === 'companyDns').detour, endpoint.tag);
assert(company.dns.servers.some(server => server.type === 'tailscale' && server.accept_search_domain));
const dnsRuleIndex = company.dns.rules.findIndex(rule => rule.preferred_by === 'tailscaleDns');
assert(dnsRuleIndex < company.dns.rules.findIndex(rule => rule.server === 'companyDns'));
assert(dnsRuleIndex < company.dns.rules.findIndex(rule => rule.clash_mode));
assert(dnsRuleIndex < company.dns.rules.findIndex(rule => rule.query_type === 'AAAA' && !rule.domain), 'tailnet IPv6 must precede the blanket public AAAA suppression');
assert(!Object.hasOwn(company.dns, 'strategy'), 'global IPv4-only must not suppress tailnet IPv6');
const routeIndex = company.route.rules.findIndex(rule => rule.preferred_by === endpoint.tag);
const peerIndex = company.route.rules.findIndex(rule => rule.inbound === endpoint.tag && rule.outbound === 'direct');
assert(peerIndex >= 0 && peerIndex < routeIndex, 'peer traffic must not loop into the endpoint');
assert(routeIndex < company.route.rules.findIndex(rule => rule.clash_mode));
assert(company.route.rules.some(rule => rule.action === 'reject' && rule.mode === 'and' && rule.rules?.some(item => item.preferred_by === endpoint.tag && item.invert)), 'early IPv6 rejection must exclude destinations managed by Tailscale');
const officeRuleIndex = company.route.rules.findIndex(rule => rule.wifi_ssid?.includes('Make Nova Great Again'));
assert(officeRuleIndex >= 0 && officeRuleIndex < company.route.rules.findIndex(rule => rule.outbound === '⭐NovaStar'), 'office Wi-Fi direct routing must precede the company selector');
assert(company.route.rules[officeRuleIndex].domain?.includes('oa.novastar.tech'), 'office Wi-Fi must not bypass proxy routing for unrelated destinations');
assert.equal(company.route.rules[officeRuleIndex].outbound, 'direct');
assert(!JSON.stringify(company).includes('geosite-novastar-internal'), 'company rules must not depend on a remote rule set');
assert(!company.route.rule_set.some(item => /novastar/i.test(item?.url || '')), 'company rule sets must not fetch from GitHub');
const tun = company.inbounds.find(inbound => inbound.type === 'tun');
assert.equal(tun.mtu, 1500);
assert(tun.address.some(address => address.includes(':')), 'capture literal tailnet IPv6 traffic');
assert(!company.outbounds.some(outbound => outbound.tag === '🏠回家节点'));
checkReferences(company);

const phone = await generate({
  profile: 'company', tailscale: 'true,oppo', mtu: '1280', stack: 'auto', novastar_server: '100.106.56.51',
  relay_map: 'novastar:oppo', selector_outbound: '⭐NovaStar:novastar'
});
assert.equal(phone.endpoints[0].tag, 'oppo');
assert(!Object.hasOwn(phone.endpoints[0], 'hostname'));
assert.equal(phone.outbounds.find(outbound => outbound.tag === 'novastar').detour, 'oppo');
checkReferences(phone);

const globalDns = await generate({ profile: 'company', tailscale: true, tailscale_dns: 'global' });
assert.equal(globalDns.dns.servers.find(server => server.type === 'tailscale').accept_default_resolvers, true);

for (const tailscale of [false, true]) {
  for (const tailscale_dns of ['split', 'global']) {
    const config = await generate({ profile: 'company', tailscale, tailscale_dns });
    const publicDnsIndex = config.dns.rules.findIndex(rule => ['npan.novastar.tech', 'doc-wps.novastar.tech'].every(domain => rule.domain?.includes(domain)) && rule.server === 'localDns');
    assert(publicDnsIndex >= 0, 'public cloud drive must use public DNS');
    for (const [index, rule] of config.dns.rules.entries()) {
      if (['companyDns', 'tailscaleDns'].includes(rule.server)) {
        assert(publicDnsIndex < index, 'public DNS exception must precede company and inherited tailnet DNS, including global mode');
      }
    }
    assert(config.dns.rules.slice(0, publicDnsIndex).some(rule => ['npan.novastar.tech', 'doc-wps.novastar.tech'].every(domain => rule.domain?.includes(domain)) && rule.query_type === 'AAAA' && rule.rcode === 'NOERROR'), 'public cloud drive and document viewer must retain IPv4-only DNS');
    const publicRouteIndex = config.route.rules.findIndex(rule => ['npan.novastar.tech', 'doc-wps.novastar.tech'].every(domain => rule.domain?.includes(domain)) && rule.outbound === 'direct');
    assert(publicRouteIndex > config.route.rules.findIndex(rule => rule.action === 'resolve'), 'public cloud drive must use the public DNS result before routing');
    assert(publicRouteIndex < config.route.rules.findIndex(rule => rule.clash_mode), 'public cloud drive must remain direct before mode overrides');
    assert(publicRouteIndex < config.route.rules.findIndex(rule => rule.outbound === '⭐NovaStar'));
    assert(config.dns.rules.some(rule => rule.domain_suffix?.includes('novastar.tech') && rule.server === 'companyDns'), 'other company services must retain internal DNS');
  }
}
const named = await generate({
  profile: 'company', tailscale: true, tailscale_hostname: 'workstation', tailscale_system_interface: 'true', stack: 'auto'
});
assert.equal(named.endpoints[0].hostname, 'workstation');
assert.equal(named.endpoints[0].system_interface, true);
assert(!Object.hasOwn(named.inbounds.find(inbound => inbound.type === 'tun'), 'stack'), 'auto must select the core default instead of emitting an invalid stack name');
await assert.rejects(generate({ profile: 'company', tailscale: 'true,' }), /tailscale 参数/);
await assert.rejects(generate({ profile: 'company', tailscale: true, tailscale_dns: 'invalid' }), /tailscale_dns/);
await assert.rejects(generate({ profile: 'company', tailscale: true, tailscale_system_interface: 'invalid' }), /tailscale_system_interface/);
await assert.rejects(run({ profile: 'company', collection: 'test', novastar_server: '100.106.56.51' }, [template], async () => [], ''), /novastar_server/);
console.log('PASS: clean home/op, centralized company DNS, tailnet routing, phone relay, automatic stack and invalid options');
