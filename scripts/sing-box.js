const args = $arguments || {};
const profile = normalizeProfile(args.profile || args.mode);

let config = JSON.parse($files[0]);

const collectionName = parseString(args.collection);
const subscriptionNames = parseList(args.subscription);

assertProxySources(collectionName, subscriptionNames);

let proxies = await buildProxies({
  collectionName,
  subscriptionNames
});

config.outbounds = Array.isArray(config.outbounds) ? config.outbounds : [];
config.outbounds.push(...proxies);

injectProxiesByGroupRules(config, proxies);
applyProfile(config, profile);
applyTunOverrides(config, args);
applyRelayMap(config, parseRelayMap(args.relay_map));

$content = JSON.stringify(config, null, 2);

function normalizeProfile(rawProfile) {
  if (rawProfile === undefined || rawProfile === null || String(rawProfile).trim() === '') {
    throw new Error('配置非法：必须通过参数提供 profile（company/home/op）');
  }

  const value = String(rawProfile).toLowerCase();
  if (['op', 'office', 'work'].includes(value)) {
    return 'op';
  }
  if (['home', 'house'].includes(value)) {
    return 'home';
  }
  if (['full', 'company', 'corp'].includes(value)) {
    return 'company';
  }

  throw new Error(`配置非法：不支持的 profile=${rawProfile}，可选 company/home/op`);
}

function assertProxySources(collectionName, subscriptionNames) {
  if (collectionName || subscriptionNames.length > 0) {
    return;
  }

  throw new Error('配置非法：必须通过参数提供 collection 或 subscription');
}

async function buildProxies({ collectionName, subscriptionNames }) {
  const tasks = [];

  if (collectionName) {
    tasks.push(
      produceArtifact({
        type: 'collection',
        name: collectionName,
        platform: 'sing-box',
        produceType: 'internal'
      })
    );
  }

  for (const name of subscriptionNames) {
    tasks.push(
      produceArtifact({
        type: 'subscription',
        name,
        platform: 'sing-box',
        produceType: 'internal'
      })
    );
  }

  const results = await Promise.all(tasks);
  return uniqByTag(
    results
      .flat()
      .filter(item => item && typeof item === 'object' && item.tag)
  );
}

function applyTunOverrides(config, args) {
  const tunInbound = (config.inbounds || []).find(item => item?.type === 'tun');
  if (!tunInbound) {
    return;
  }

  const tunOverrideParsers = {
    address: parseString,
    mtu: parseNumber,
    auto_route: parseBoolean,
    strict_route: parseBoolean,
    endpoint_independent_nat: parseBoolean,
    stack: parseString,
    domain_strategy: parseString,
    auto_redirect: parseBoolean
  };

  for (const [key, parser] of Object.entries(tunOverrideParsers)) {
    if (!hasOwn(args, key)) {
      continue;
    }

    const parsed = parser(args[key]);
    if (parsed === undefined) {
      continue;
    }

    tunInbound[key] = parsed;
  }
}

function parseRelayMap(rawRelayMap) {
  if (!rawRelayMap || typeof rawRelayMap !== 'string') {
    return [];
  }

  return rawRelayMap
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => {
      const index = item.indexOf(':');
      if (index <= 0 || index >= item.length - 1) {
        return null;
      }

      const from = item.slice(0, index).trim();
      const to = item.slice(index + 1).trim();
      if (!from || !to) {
        return null;
      }

      return { from, to };
    })
    .filter(Boolean);
}

function normalizeRelayTag(rawTag) {
  if (!rawTag) {
    return rawTag;
  }

  const aliasMap = {
    landing: '🛬落地节点',
    front: '🚪前置节点',
    pre: '🚪前置节点',
    all: '➡️节点选择',
    auto: '🔄自动测速',
    hk: '🧧香港节点',
    tw: '🧋台湾节点',
    sg: '🦁狮城节点',
    jp: '⛩️日本节点',
    us: '🗽美国节点',
    home: '🏠回家节点',
    game: '🕹️游戏节点',
    nova: '⭐NovaStar',
    novastar: '⭐NovaStar',
    ai: '⬆️AI专用出站'
  };

  const key = String(rawTag).toLowerCase();
  return aliasMap[key] || rawTag;
}

function resolveTag(outboundMap, rawTag, options = {}) {
  if (!rawTag) {
    return rawTag;
  }

  if (outboundMap.has(rawTag)) {
    return rawTag;
  }

  const normalized = normalizeRelayTag(rawTag);
  if (outboundMap.has(normalized)) {
    return normalized;
  }

  return options.allowMissing ? normalized : null;
}

function applyRelayMap(config, mappings) {
  if (!Array.isArray(mappings) || mappings.length === 0) {
    return;
  }

  const outbounds = Array.isArray(config.outbounds) ? config.outbounds : [];
  const outboundMap = new Map(outbounds.map(item => [item.tag, item]));

  for (const { from, to } of mappings) {
    const resolvedFrom = resolveTag(outboundMap, from);
    const resolvedTo = resolveTag(outboundMap, to, { allowMissing: true });
    if (!resolvedFrom || !resolvedTo || !outboundMap.has(resolvedFrom)) {
      continue;
    }

    const targetTags = collectRelayTargetTags(resolvedFrom, outboundMap);

    for (const tag of targetTags) {
      const target = outboundMap.get(tag);
      if (!target) {
        continue;
      }

      if (['direct', 'block', resolvedTo].includes(tag)) {
        continue;
      }

      if (['selector', 'urltest'].includes(target.type)) {
        continue;
      }

      target.detour = resolvedTo;
    }
  }
}

function collectRelayTargetTags(fromTag, outboundMap) {
  const result = new Set();
  const visited = new Set();
  const queue = [fromTag];

  while (queue.length > 0) {
    const currentTag = queue.shift();
    if (!currentTag || visited.has(currentTag)) {
      continue;
    }
    visited.add(currentTag);

    const current = outboundMap.get(currentTag);
    if (!current) {
      continue;
    }

    const isGroup = ['selector', 'urltest'].includes(current.type);
    if (isGroup && Array.isArray(current.outbounds) && current.outbounds.length > 0) {
      for (const childTag of current.outbounds) {
        if (!visited.has(childTag)) {
          queue.push(childTag);
        }
      }
      continue;
    }

    result.add(currentTag);
  }

  return result;
}

function injectProxiesByGroupRules(config, proxies) {
  const groupRules = {
    '🛬落地节点': p => /landing/i.test(p.tag),
    '➡️节点选择': p => !/novastar|landing|home|chengdu|game/i.test(p.tag),
    '🔄自动测速': p => !/novastar|landing|home|chengdu|game/i.test(p.tag),
    '⬆️AI专用出站': p => /us4/i.test(p.tag) && /家宽/i.test(p.tag),
    '🧧香港节点': p => /🇭🇰|HK|hk|香港|港|HongKong/i.test(p.tag) && !/landing|game/i.test(p.tag),
    '🧋台湾节点': p => /🇹🇼|TW|tw|台湾|臺灣|台|Taiwan/i.test(p.tag) && !/landing/i.test(p.tag),
    '🦁狮城节点': p => /🇸🇬|SG|sg|新加坡|狮|Singapore/i.test(p.tag) && !/landing/i.test(p.tag),
    '⛩️日本节点': p => /🇯🇵|JP|jp|日本|日|Japan/i.test(p.tag) && !/landing|game/i.test(p.tag),
    '🇰🇷 韩国节点': p => /🇰🇷|Korea|韩国|韩/i.test(p.tag) && !/landing/i.test(p.tag),
    '🗽美国节点': p => /🇺🇸|美国|美|United States/i.test(p.tag) && !/landing/i.test(p.tag),
    '🏠回家节点': p => /home/i.test(p.tag) && !/landing/i.test(p.tag),
    '🕹️游戏节点': p => /game/i.test(p.tag) && !/landing/i.test(p.tag),
    '⭐NovaStar': p => /novastar/i.test(p.tag) && !/landing/i.test(p.tag)
  };

  const outboundsMap = new Map((config.outbounds || []).map(outbound => [outbound.tag, outbound]));

  for (const [tag, filterFn] of Object.entries(groupRules)) {
    const outbound = outboundsMap.get(tag);
    if (!outbound) {
      continue;
    }

    const availableProxies = applyFilter(proxies, outbound.filter);
    const filteredProxyTags = availableProxies.filter(filterFn).map(proxy => proxy.tag);

    if (!Array.isArray(outbound.outbounds)) {
      outbound.outbounds = [];
    }

    outbound.outbounds = uniq([...outbound.outbounds, ...filteredProxyTags]);
  }
}

function applyFilter(proxies, filters) {
  if (!Array.isArray(filters) || filters.length === 0) {
    return proxies;
  }

  return proxies.filter(proxy => !shouldExclude(proxy, filters));
}

function shouldExclude(proxy, filters) {
  return filters.some(filter => {
    if (filter?.action !== 'exclude' || !Array.isArray(filter?.keywords)) {
      return false;
    }
    return filter.keywords.some(keyword => new RegExp(keyword, 'i').test(proxy.tag));
  });
}

function applyProfile(config, profile) {
  if (!['home', 'op'].includes(profile)) {
    return;
  }

  const removedOutboundTags = new Set([
    '⭐NovaStar',
    '🏠回家节点',
    '🕹️游戏节点',
    '🦅美国原生'
  ]);

  const removedRuleSetTags = new Set([
    'geosite-novastar-internal',
    'geosite-us-native',
    'geosite-game',
    'geoip-bilibili',
    'geosite-bilibili'
  ]);

  if (config.experimental?.clash_api) {
    config.experimental.clash_api.external_ui_download_detour = '➡️节点选择';
  }

  const dns = config.dns || {};
  dns.servers = (dns.servers || []).filter(server => server?.tag !== 'hosts');
  dns.rules = [
    {
      rule_set: 'geosite-category-ads-all',
      action: 'predefined',
      rcode: 'NOERROR'
    },
    {
      rule_set: 'geosite-cn',
      action: 'route',
      server: 'localDns'
    },
    {
      rule_set: ['geosite-github', 'geosite-container', 'geosite-docker'],
      action: 'route',
      server: 'proxyDns',
      strategy: 'ipv4_only'
    },
    {
      clash_mode: 'direct',
      action: 'route',
      server: 'localDns'
    },
    {
      clash_mode: 'global',
      action: 'route',
      server: 'proxyDns'
    },
    {
      rule_set: 'geosite-geolocation-!cn',
      action: 'route',
      server: 'proxyDns'
    }
  ];
  dns.strategy = 'ipv4_only';
  config.dns = dns;

  config.outbounds = (config.outbounds || []).filter(outbound => !removedOutboundTags.has(outbound?.tag));

  const route = config.route || {};
  route.rules = (route.rules || [])
    .map(rule => normalizeRuleSet(rule, removedRuleSetTags))
    .filter(rule => !shouldRemoveRouteRule(rule, removedOutboundTags, removedRuleSetTags))
    .map(rule => {
      if (rule?.clash_mode === 'global') {
        return {
          ...rule,
          outbound: '➡️节点选择'
        };
      }
      return rule;
    });

  if (profile === 'op') {
    ensureOpRules(route.rules);
  } else {
    route.rules = route.rules.filter(rule => !isOpExtraRule(rule));
  }

  route.rule_set = (route.rule_set || []).filter(item => !removedRuleSetTags.has(item?.tag));
  config.route = route;

  cleanupOutboundReferences(config.outbounds);
}

function normalizeRuleSet(rule, removedRuleSetTags) {
  if (!rule || typeof rule !== 'object') {
    return rule;
  }

  if (Array.isArray(rule.rule_set)) {
    return {
      ...rule,
      rule_set: rule.rule_set.filter(tag => !removedRuleSetTags.has(tag))
    };
  }

  return rule;
}

function shouldRemoveRouteRule(rule, removedOutboundTags, removedRuleSetTags) {
  if (!rule || typeof rule !== 'object') {
    return false;
  }

  if (removedOutboundTags.has(rule.outbound)) {
    return true;
  }

  if (typeof rule.rule_set === 'string' && removedRuleSetTags.has(rule.rule_set)) {
    return true;
  }

  if (Array.isArray(rule.rule_set) && rule.rule_set.length === 0) {
    return true;
  }

  if (isLegacySingBoxPortRule(rule)) {
    return true;
  }

  if (containsAny(rule.domain_suffix, ['novastar-led.cn', 'pingjl.com', 'pingboss.com'])) {
    return true;
  }

  if (containsAny(rule.ip_cidr, ['192.168.50.0/24'])) {
    return true;
  }

  return false;
}

function isLegacySingBoxPortRule(rule) {
  if (rule?.type !== 'logical' || rule?.mode !== 'and' || !Array.isArray(rule.rules)) {
    return false;
  }

  const hasProcess = rule.rules.some(item => containsAny(item?.process_name, ['sing-box.exe', 'sing-box']));
  const hasPort = rule.rules.some(item => containsAny(item?.port, [4430, 8443, 3478]));
  return hasProcess && hasPort;
}

function ensureOpRules(rules) {
  if (!rules.some(rule => isTailscaleRule(rule))) {
    rules.splice(4, 0, {
      domain_keyword: ['tailscale'],
      outbound: '自定义直连'
    });
  }

  if (!rules.some(rule => isTailscalePortRule(rule))) {
    rules.splice(5, 0, {
      port: [4430, 8443, 3478, 43443, 43478],
      outbound: '自定义直连'
    });
  }
}

function isOpExtraRule(rule) {
  return isTailscaleRule(rule) || isTailscalePortRule(rule);
}

function isTailscaleRule(rule) {
  return rule?.outbound === '自定义直连' && containsAny(rule.domain_keyword, ['tailscale']);
}

function isTailscalePortRule(rule) {
  if (rule?.outbound !== '自定义直连') {
    return false;
  }
  const required = [4430, 8443, 3478, 43443, 43478];
  return required.every(port => Array.isArray(rule.port) && rule.port.includes(port));
}

function cleanupOutboundReferences(outbounds) {
  const validTags = new Set((outbounds || []).map(item => item?.tag).filter(Boolean));

  for (const outbound of outbounds || []) {
    if (!Array.isArray(outbound?.outbounds)) {
      continue;
    }

    outbound.outbounds = uniq(
      outbound.outbounds.filter(tag => validTags.has(tag) || ['direct', 'block'].includes(tag))
    );
  }
}

function hasOwn(source, key) {
  return source && Object.prototype.hasOwnProperty.call(source, key);
}

function parseList(value) {
  if (value === undefined || value === null) {
    return [];
  }

  return String(value)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function parseString(value) {
  if (value === undefined || value === null) {
    return undefined;
  }
  const parsed = String(value).trim();
  return parsed ? parsed : undefined;
}

function parseNumber(value) {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseBoolean(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  const raw = String(value || '').trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(raw)) {
    return true;
  }
  if (['0', 'false', 'no', 'off'].includes(raw)) {
    return false;
  }
  return undefined;
}

function containsAny(source, values) {
  if (!Array.isArray(source)) {
    return false;
  }
  return values.some(item => source.includes(item));
}

function uniq(items) {
  return Array.from(new Set(items));
}

function uniqByTag(items) {
  const seen = new Set();
  const result = [];

  for (const item of items) {
    if (!item?.tag || seen.has(item.tag)) {
      continue;
    }
    seen.add(item.tag);
    result.push(item);
  }

  return result;
}
