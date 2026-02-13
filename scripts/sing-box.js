async function main(env) {
  const ctx = Runtime.createContext(env);
  await ProxySource.load(ctx);
  Pipeline.run(ctx);
  $content = Runtime.serialize(ctx.config);
}

const ArgParsers = {
  normalizeProfile,
  parseString,
  parseList,
  parseBoolean,
  parseNumber
};

const NOVASTAR_HOSTS = {
  'oa.novastar.tech': '172.16.81.12',
  'ehr.novastar.tech': '172.16.80.109',
  'ai.novaops.tech': '172.16.80.99',
  'pwd.novastar.tech': '172.16.81.66',
  'iam-idp.novastar.tech': '172.16.91.27',
  'iam.novastar.tech': '172.16.91.27',
  'wiki.novastar.tech': '172.16.81.222',
  'novaehr.novastar.tech': '172.16.91.76',
  'alm.novatools.vip': '172.16.81.11',
  'ai-meeting.novastar.tech': '172.16.91.232',
  'e-bridge.novastar.tech': '172.16.91.42',
  'ai-portal.novastar.tech': '172.16.91.232'
};

const ConfigOps = {
  ensureDnsRule,
  ensureRouteRule,
  ensureRuleSet,
  ensureOutbound,
  cleanupOutboundReferences
};

const Runtime = {
  createContext(env) {
    const args = env?.arguments || {};
    const profile = ArgParsers.normalizeProfile(args.profile || args.mode);

    const files = Array.isArray(env?.files) ? env.files : [];
    if (files.length === 0) {
      throw new Error('配置非法：缺少模板文件输入');
    }

    const config = JSON.parse(files[0]);
    const collectionName = ArgParsers.parseString(args.collection);
    const subscriptionNames = ArgParsers.parseList(args.subscription);
    const producer = typeof env?.producer === 'function' ? env.producer : produceArtifact;

    assertProxySources(collectionName, subscriptionNames);

    return {
      args,
      profile,
      config,
      collectionName,
      subscriptionNames,
      producer,
      proxies: []
    };
  },
  serialize(config) {
    return JSON.stringify(config, null, 2);
  }
};

const ProxySource = {
  async load(ctx) {
    ctx.proxies = await buildProxies({
      collectionName: ctx.collectionName,
      subscriptionNames: ctx.subscriptionNames,
      producer: ctx.producer
    });

    ctx.config.outbounds = Array.isArray(ctx.config.outbounds) ? ctx.config.outbounds : [];
    ctx.config.outbounds.push(...ctx.proxies);
  }
};

const FeatureFacade = {
  proxyGroup: {
    run(ctx) {
      injectProxiesByGroupRules(ctx.config, ctx.proxies);
    }
  },
  profile: {
    run(ctx) {
      applyProfile(ctx.config, ctx.profile);
    }
  },
  novastar: {
    resolveEnabled(args, profile) {
      return resolveNovastarEnabled(args, profile);
    },
    run(ctx) {
      const enabled = this.resolveEnabled(ctx.args, ctx.profile);
      applyNovastarFeatures(ctx.config, enabled);
    }
  },
  tailscale: {
    parse(args) {
      return parseTailscaleOption(args.tailscale);
    },
    run(ctx) {
      applyTailscaleEndpoint(ctx.config, this.parse(ctx.args));
    }
  },
  tun: {
    run(ctx) {
      applyTunOverrides(ctx.config, ctx.args);
    }
  },
  selectorOutbound: {
    parse(args) {
      return parseSelectorOutboundMap(args.selector_outbound || args.selector_append);
    },
    run(ctx) {
      applySelectorOutboundAppend(ctx.config, this.parse(ctx.args));
    }
  },
  relay: {
    parse(args) {
      return parseRelayMap(args.relay_map);
    },
    run(ctx) {
      applyRelayMap(ctx.config, this.parse(ctx.args));
    }
  }
};

const PIPELINE_STEPS = [
  FeatureFacade.proxyGroup,
  FeatureFacade.profile,
  FeatureFacade.novastar,
  FeatureFacade.tailscale,
  FeatureFacade.tun,
  FeatureFacade.selectorOutbound,
  FeatureFacade.relay
];

const Pipeline = {
  run(ctx) {
    for (const step of PIPELINE_STEPS) {
      step.run(ctx);
    }
  }
};

await main({
  arguments: $arguments,
  files: $files,
  producer: produceArtifact
});

function normalizeProfile(rawProfile) {
  if (rawProfile === undefined || rawProfile === null || String(rawProfile).trim() === '') {
    throw new Error('配置非法：必须通过参数提供 profile（company/home/op，op=openwrt）');
  }

  const value = String(rawProfile).toLowerCase();
  if (['op', 'openwrt'].includes(value)) {
    return 'op';
  }
  if (['home', 'house'].includes(value)) {
    return 'home';
  }
  if (['full', 'company', 'corp'].includes(value)) {
    return 'company';
  }

  throw new Error(`配置非法：不支持的 profile=${rawProfile}，可选 company/home/op（op=openwrt）`);
}

function assertProxySources(collectionName, subscriptionNames) {
  if (collectionName || subscriptionNames.length > 0) {
    return;
  }

  throw new Error('配置非法：必须通过参数提供 collection 或 subscription');
}

async function buildProxies({ collectionName, subscriptionNames, producer }) {
  const artifactProducer = typeof producer === 'function' ? producer : produceArtifact;
  const tasks = [];

  if (collectionName) {
    tasks.push(
      artifactProducer({
        type: 'collection',
        name: collectionName,
        platform: 'sing-box',
        produceType: 'internal'
      })
    );
  }

  for (const name of subscriptionNames) {
    tasks.push(
      artifactProducer({
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

function resolveNovastarEnabled(args, profile) {
  const parsed = parseBoolean(args.novastar_hosts);
  if (parsed !== undefined) {
    return parsed;
  }

  const parsedAlias = parseBoolean(args.novastar);
  if (parsedAlias !== undefined) {
    return parsedAlias;
  }

  return profile === 'company';
}

function applyNovastarFeatures(config, enabled) {
  const dns = config.dns || {};
  dns.servers = Array.isArray(dns.servers) ? dns.servers : [];
  dns.rules = Array.isArray(dns.rules) ? dns.rules : [];

  const route = config.route || {};
  route.rules = Array.isArray(route.rules) ? route.rules : [];
  route.rule_set = Array.isArray(route.rule_set) ? route.rule_set : [];

  config.outbounds = Array.isArray(config.outbounds) ? config.outbounds : [];

  if (enabled) {
    upsertHostsServer(dns, NOVASTAR_HOSTS);
    ConfigOps.ensureDnsRule(dns.rules, {
      rule_set: 'geosite-novastar-internal',
      action: 'route',
      server: 'hosts'
    }, 1);
    ConfigOps.ensureDnsRule(dns.rules, {
      domain_suffix: ['novastar.tech'],
      action: 'route',
      server: 'proxyDns'
    }, 2);

    ConfigOps.ensureOutbound(
      config.outbounds,
      {
        tag: '⭐NovaStar',
        type: 'selector',
        outbounds: ['direct']
      },
      {
        beforeTags: ['🦅美国原生', '🏠回家节点']
      }
    );

    ConfigOps.ensureRouteRule(route.rules, {
      domain_suffix: ['novastar-led.cn', 'pingjl.com', 'pingboss.com'],
      outbound: 'direct'
    }, 5);
    ConfigOps.ensureRouteRule(route.rules, {
      rule_set: 'geosite-novastar-internal',
      outbound: '⭐NovaStar'
    }, 10);

    ConfigOps.ensureRuleSet(route.rule_set, {
      tag: 'geosite-novastar-internal',
      type: 'remote',
      format: 'source',
      url: 'https://raw.githubusercontent.com/FaintGhost/files/refs/heads/rm/scripts/novastar.json',
      download_detour: '⬆️出站节点'
    });
  } else {
    dns.servers = dns.servers.filter(server => server?.tag !== 'hosts');
    dns.rules = dns.rules.filter(rule => {
      if (rule?.server === 'hosts') {
        return false;
      }
      if (rule?.rule_set === 'geosite-novastar-internal') {
        return false;
      }
      if (containsAny(rule?.domain_suffix, ['novastar.tech'])) {
        return false;
      }
      return true;
    });

    config.outbounds = config.outbounds.filter(outbound => outbound?.tag !== '⭐NovaStar');

    route.rules = route.rules.filter(rule => {
      if (rule?.rule_set === 'geosite-novastar-internal') {
        return false;
      }
      if (rule?.outbound === '⭐NovaStar') {
        return false;
      }
      if (containsAny(rule?.domain_suffix, ['novastar-led.cn', 'pingjl.com', 'pingboss.com'])) {
        return false;
      }
      return true;
    });

    route.rule_set = route.rule_set.filter(item => item?.tag !== 'geosite-novastar-internal');
  }

  config.dns = dns;
  config.route = route;
  ConfigOps.cleanupOutboundReferences(config.outbounds);
}

function upsertHostsServer(dns, predefined) {
  let hostsServer = dns.servers.find(server => server?.tag === 'hosts');
  if (!hostsServer) {
    hostsServer = {
      type: 'hosts',
      tag: 'hosts',
      predefined: {}
    };
    dns.servers.push(hostsServer);
  }

  hostsServer.type = 'hosts';
  hostsServer.tag = 'hosts';
  hostsServer.predefined = { ...predefined };
}

function ensureDnsRule(rules, expectedRule, preferredIndex) {
  if (rules.some(rule => isDnsRuleEqual(rule, expectedRule))) {
    return;
  }
  rules.splice(Math.min(preferredIndex, rules.length), 0, expectedRule);
}

function ensureRouteRule(rules, expectedRule, preferredIndex) {
  if (rules.some(rule => isRouteRuleEqual(rule, expectedRule))) {
    return;
  }
  rules.splice(Math.min(preferredIndex, rules.length), 0, expectedRule);
}

function ensureRuleSet(ruleSets, expectedRuleSet) {
  if (ruleSets.some(item => item?.tag === expectedRuleSet.tag)) {
    return;
  }
  ruleSets.push(expectedRuleSet);
}

function ensureOutbound(outbounds, expectedOutbound, options = {}) {
  if (outbounds.some(item => item?.tag === expectedOutbound.tag)) {
    return;
  }

  const normalizedOutbound = { ...expectedOutbound };
  const beforeTags = Array.isArray(options.beforeTags) ? options.beforeTags.filter(Boolean) : [];
  if (beforeTags.length > 0) {
    const anchorIndex = outbounds.findIndex(item => beforeTags.includes(item?.tag));
    if (anchorIndex >= 0) {
      outbounds.splice(anchorIndex, 0, normalizedOutbound);
      return;
    }
  }

  if (['selector', 'urltest'].includes(normalizedOutbound.type)) {
    let insertIndex = -1;
    for (let i = 0; i < outbounds.length; i += 1) {
      if (['selector', 'urltest'].includes(outbounds[i]?.type)) {
        insertIndex = i + 1;
      }
    }

    if (insertIndex >= 0) {
      outbounds.splice(insertIndex, 0, normalizedOutbound);
      return;
    }
  }

  outbounds.push(normalizedOutbound);
}

function isDnsRuleEqual(left, right) {
  return JSON.stringify(left || {}) === JSON.stringify(right || {});
}

function isRouteRuleEqual(left, right) {
  return JSON.stringify(left || {}) === JSON.stringify(right || {});
}

function parseTailscaleOption(rawValue) {
  if (rawValue === undefined || rawValue === null) {
    return { enabled: false };
  }

  const parts = String(rawValue)
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);

  if (parts.length === 0) {
    return { enabled: false };
  }

  const enabled = parseBoolean(parts[0]);
  if (enabled !== true) {
    return { enabled: false };
  }

  const hostname = parts[1] ? parts[1] : undefined;
  return {
    enabled: true,
    hostname
  };
}

function applyTailscaleEndpoint(config, tailscaleOption) {
  if (!tailscaleOption?.enabled) {
    return;
  }

  config.endpoints = Array.isArray(config.endpoints) ? config.endpoints : [];

  const endpoint = {
    type: 'tailscale',
    tag: 'ts-ep',
    ephemeral: false,
    accept_routes: true
  };

  if (tailscaleOption.hostname) {
    endpoint.hostname = tailscaleOption.hostname;
  }

  const existedIndex = config.endpoints.findIndex(item => item?.tag === 'ts-ep');
  if (existedIndex >= 0) {
    config.endpoints[existedIndex] = endpoint;
  } else {
    config.endpoints.push(endpoint);
  }
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

function parseSelectorOutboundMap(rawMap) {
  if (!rawMap || typeof rawMap !== 'string') {
    return [];
  }

  return rawMap
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => {
      const index = item.indexOf(':');
      if (index <= 0 || index >= item.length - 1) {
        return null;
      }

      const selector = item.slice(0, index).trim();
      const outbound = item.slice(index + 1).trim();
      if (!selector || !outbound) {
        return null;
      }

      return { selector, outbound };
    })
    .filter(Boolean);
}

function applySelectorOutboundAppend(config, mappings) {
  if (!Array.isArray(mappings) || mappings.length === 0) {
    return;
  }

  const outbounds = Array.isArray(config.outbounds) ? config.outbounds : [];
  const outboundMap = new Map(outbounds.map(item => [item.tag, item]));

  for (const { selector, outbound } of mappings) {
    const resolvedSelector = resolveTag(outboundMap, selector);
    if (!resolvedSelector || !outboundMap.has(resolvedSelector)) {
      continue;
    }

    const selectorOutbound = outboundMap.get(resolvedSelector);
    if (!selectorOutbound || !['selector', 'urltest'].includes(selectorOutbound.type)) {
      continue;
    }

    const resolvedOutbound = resolveTag(outboundMap, outbound, { allowMissing: true });
    if (!resolvedOutbound) {
      continue;
    }

    selectorOutbound.outbounds = Array.isArray(selectorOutbound.outbounds) ? selectorOutbound.outbounds : [];
    selectorOutbound.outbounds = uniq([...selectorOutbound.outbounds, resolvedOutbound]);
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
    '🕹️游戏节点': p => /game/i.test(p.tag) && !/landing/i.test(p.tag)
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

  ConfigOps.cleanupOutboundReferences(config.outbounds);
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
