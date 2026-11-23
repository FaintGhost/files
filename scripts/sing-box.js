async function main(env) {
  const ctx = Runtime.createContext(env);
  await ProxySource.load(ctx);
  Pipeline.run(ctx);
  if (FeatureFacade.novastar.resolveEnabled(ctx.args, ctx.profile)) {
    // Public company services must precede inherited Tailscale split DNS.
    const publicDirect = ['npan.novastar.tech', 'doc-wps.novastar.tech'];
    // These answer RFC1918 to Chinese resolvers while their public addresses work
    // from abroad, so resolve them through the proxy DNS and keep them on the proxy.
    const publicProxy = ['pwd.novastar.tech', 'ai-service.novastar.tech'];
    const { dns, route } = ctx.config;
    dns.rules.unshift(
      { domain: [...publicDirect, ...publicProxy], query_type: 'AAAA', action: 'predefined', rcode: 'NOERROR' },
      { domain: publicDirect, action: 'route', server: DNS_SERVER_LOCAL },
      { domain: publicProxy, action: 'route', server: DNS_SERVER_PROXY }
    );
    route.rules.splice(route.rules.findIndex(rule => rule.action === 'resolve') + 1, 0,
      { domain: publicDirect, action: 'route', outbound: 'direct' },
      { domain: publicProxy, action: 'route', outbound: TAG_NODE_SELECTOR });
  }
  $content = Runtime.serialize(ctx.config);
}

const ArgParsers = {
  normalizeProfile,
  parseString,
  parseList,
  parseBoolean,
  parseNumber
};


const NOVASTAR_DNS_DOMAIN_SUFFIXES = Object.freeze(['novastar.tech', 'novaops.tech', 'novatools.vip']);
const NOVASTAR_DIRECT_DOMAIN_SUFFIXES = Object.freeze(['novastar-led.cn', 'pingjl.com', 'pingboss.com']);
// Kept in the generator so configurations no longer fetch a rule set from GitHub.
const NOVASTAR_INTERNAL_DOMAINS = Object.freeze([
  'ehr.novastar.tech',
  'oa.novastar.tech',
  'iam-idp.novastar.tech',
  'iam.novastar.tech',
  'ai.novaops.tech',
  'novaehr.novastar.tech',
  'wiki.novastar.tech',
  'alm.novatools.vip',
  'ai-meeting.novastar.tech',
  'ai-portal.novastar.tech',
  'ai.service.novastar.tech',
  'ai.novatools.vip',
  'uaudit.novastar.tech'
]);
const NOVASTAR_RULE_INSERT_INDEXES = Object.freeze({
  DNS_INTERNAL_RULE_SET: 1,
  DNS_DOMAIN_SUFFIXES: 2,
  ROUTE_DIRECT_DOMAIN_SUFFIXES: 7,
  ROUTE_INTERNAL_RULE_SET: 11
});
const TAG_NODE_SELECTOR = '➡️节点选择';
const TAG_CUSTOM_DIRECT = '自定义直连';
const DNS_SERVER_LOCAL = 'localDns';
const DNS_SERVER_PROXY = 'proxyDns';
const OP_RULE_INSERT_INDEXES = Object.freeze({
  TAILSCALE_DOMAIN_RULE: 6,
  TAILSCALE_PORT_RULE: 7
});

const ConfigOps = {
  ensureDnsRule,
  ensureRouteRule,
  ensureOutbound,
  cleanupOutboundReferences
};

const PROFILE_REMOVED_OUTBOUND_TAGS = Object.freeze([
  '⭐NovaStar',
  '🕹️游戏节点',
  '🦅美国原生'
]);

const PROFILE_REMOVED_RULE_SET_TAGS = Object.freeze([
  'geosite-novastar-internal',
  'geosite-us-native',
  'geosite-game',
  'geoip-bilibili',
  'geosite-bilibili'
]);

const PROXY_GROUP_RULES = Object.freeze({
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
  '🕹️游戏节点': p => /game/i.test(p.tag) && !/landing/i.test(p.tag)
});

const RELAY_ALIAS_MAP = Object.freeze({
  landing: '🛬落地节点',
  front: '🚪前置节点',
  pre: '🚪前置节点',
  all: TAG_NODE_SELECTOR,
  auto: '🔄自动测速',
  hk: '🧧香港节点',
  tw: '🧋台湾节点',
  sg: '🦁狮城节点',
  jp: '⛩️日本节点',
  us: '🗽美国节点',
  game: '🕹️游戏节点',
  nova: '⭐NovaStar',
  novastar: '⭐NovaStar',
  ai: '⬆️AI专用出站'
});

const OUTBOUND_GROUP_TYPES = Object.freeze(['selector', 'urltest']);
const SYSTEM_OUTBOUND_TAGS = Object.freeze(['direct', 'block']);
const PROFILE_REMOVED_IP_CIDR = Object.freeze(['192.168.50.0/24']);
const LEGACY_SINGBOX_PROCESS_NAMES = Object.freeze(['sing-box.exe', 'sing-box']);
const LEGACY_SINGBOX_PORTS = Object.freeze([4430, 8443, 3478]);
const OP_TAILSCALE_KEYWORDS = Object.freeze(['tailscale']);
const OP_TAILSCALE_PORTS = Object.freeze([4430, 8443, 3478, 43443, 43478]);
const BOOLEAN_TRUE_VALUES = Object.freeze(['1', 'true', 'yes', 'on']);
const BOOLEAN_FALSE_VALUES = Object.freeze(['0', 'false', 'no', 'off']);

const TAILSCALE_ENDPOINT_TEMPLATE = Object.freeze({
  type: 'tailscale',
  tag: 'ts-ep',
  ephemeral: false,
  accept_routes: true
});

const TUN_OVERRIDE_PARSERS = Object.freeze({
  address: parseString,
  mtu: parseNumber,
  auto_route: parseBoolean,
  strict_route: parseBoolean,
  stack: parseString,
  auto_redirect: parseBoolean
});

const PROFILE_DNS_RULE_TEMPLATES = Object.freeze([
  Object.freeze({
    rule_set: 'geosite-category-ads-all',
    action: 'predefined',
    rcode: 'NOERROR'
  }),
  Object.freeze({
    rule_set: 'geosite-cn',
    action: 'route',
    server: DNS_SERVER_LOCAL
  }),
  Object.freeze({
    rule_set: Object.freeze(['geosite-github', 'geosite-container', 'geosite-docker']),
    action: 'route',
    server: DNS_SERVER_PROXY
  }),
  Object.freeze({
    clash_mode: 'direct',
    action: 'route',
    server: DNS_SERVER_LOCAL
  }),
  Object.freeze({
    clash_mode: 'global',
    action: 'route',
    server: DNS_SERVER_PROXY
  }),
  Object.freeze({
    rule_set: 'geosite-geolocation-!cn',
    action: 'route',
    server: DNS_SERVER_PROXY
  })
]);

const NOVASTAR_DNS_RULE_TEMPLATES = Object.freeze([
  Object.freeze({
    domain: Object.freeze([...NOVASTAR_INTERNAL_DOMAINS]),
    action: 'route',
    server: 'companyDns'
  }),
  Object.freeze({
    domain_suffix: Object.freeze([...NOVASTAR_DNS_DOMAIN_SUFFIXES]),
    action: 'route',
    server: 'companyDns'
  })
]);

const NOVASTAR_ROUTE_RULE_TEMPLATES = Object.freeze([
  Object.freeze({
    domain_suffix: Object.freeze([...NOVASTAR_DIRECT_DOMAIN_SUFFIXES]),
    outbound: 'direct'
  }),
  Object.freeze({
    wifi_ssid: Object.freeze(['Make Nova Great Again']),
    domain: Object.freeze([...NOVASTAR_INTERNAL_DOMAINS]),
    outbound: 'direct'
  }),
  Object.freeze({
    domain: Object.freeze([...NOVASTAR_INTERNAL_DOMAINS]),
    outbound: '⭐NovaStar'
  })
]);

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
      const server = parseString(ctx.args.novastar_server);
      if (server) {
        const proxy = ctx.proxies.find(item => item.tag === 'novastar');
        if (!proxy?.server) {
          throw new Error('配置非法：novastar_server 需要订阅中存在 novastar 节点');
        }
        proxy.server = server;
      }
    }
  },
  tailscale: {
    parse(args) {
      return parseTailscaleOption(args.tailscale);
    },
    run(ctx) {
      applyTailscaleEndpoint(ctx.config, this.parse(ctx.args), ctx.args);
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
  FeatureFacade.tun,
  FeatureFacade.tailscale,
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
  const parsed = parseBoolean(args.novastar);
  if (parsed !== undefined) {
    return parsed;
  }

  return profile === 'company';
}

function applyNovastarFeatures(config, enabled) {
  const context = createNovastarContext(config);
  if (enabled) {
    applyEnabledNovastar(context);
  } else {
    applyDisabledNovastar(context);
  }
  finalizeNovastarContext(config, context);
}

function createNovastarContext(config) {
  const dns = config.dns || {};
  dns.servers = Array.isArray(dns.servers) ? dns.servers : [];
  dns.rules = Array.isArray(dns.rules) ? dns.rules : [];

  const route = config.route || {};
  route.rules = Array.isArray(route.rules) ? route.rules : [];
  route.rule_set = Array.isArray(route.rule_set) ? route.rule_set : [];

  const outbounds = Array.isArray(config.outbounds) ? config.outbounds : [];

  return { dns, route, outbounds };
}

function applyEnabledNovastar(context) {
  const { dns, route, outbounds } = context;
  const templates = buildNovastarEnabledTemplates();

  dns.servers.push({ type: 'udp', tag: 'companyDns', server: '100.106.56.51' });
  ConfigOps.ensureDnsRule(
    dns.rules,
    templates.dnsRules[0],
    NOVASTAR_RULE_INSERT_INDEXES.DNS_INTERNAL_RULE_SET
  );
  ConfigOps.ensureDnsRule(
    dns.rules,
    templates.dnsRules[1],
    NOVASTAR_RULE_INSERT_INDEXES.DNS_DOMAIN_SUFFIXES
  );

  ConfigOps.ensureOutbound(
    outbounds,
    {
      tag: '⭐NovaStar',
      type: 'selector',
      outbounds: ['direct']
    },
    {
      beforeTags: ['🦅美国原生']
    }
  );

  ConfigOps.ensureRouteRule(
    route.rules,
    templates.routeRules[0],
    NOVASTAR_RULE_INSERT_INDEXES.ROUTE_DIRECT_DOMAIN_SUFFIXES
  );
  ConfigOps.ensureRouteRule(
    route.rules,
    templates.routeRules[1],
    NOVASTAR_RULE_INSERT_INDEXES.ROUTE_INTERNAL_RULE_SET
  );
  ConfigOps.ensureRouteRule(
    route.rules,
    templates.routeRules[2],
    NOVASTAR_RULE_INSERT_INDEXES.ROUTE_INTERNAL_RULE_SET + 1
  );
}

function buildNovastarEnabledTemplates() {
  return {
    dnsRules: NOVASTAR_DNS_RULE_TEMPLATES.map(cloneRuleTemplate),
    routeRules: NOVASTAR_ROUTE_RULE_TEMPLATES.map(cloneRuleTemplate)
  };
}

function applyDisabledNovastar(context) {
  const { dns, route } = context;
  dns.servers = dns.servers.filter(server => server?.tag !== 'companyDns');
  dns.rules = dns.rules.filter(rule => {
    if (rule?.server === 'companyDns') {
      return false;
    }
    // Legacy tag from configurations generated before the domain list was inlined.
    if (rule?.rule_set === 'geosite-novastar-internal') {
      return false;
    }
    if (containsAny(rule?.domain, NOVASTAR_INTERNAL_DOMAINS)) {
      return false;
    }
    if (containsAny(rule?.domain_suffix, NOVASTAR_DNS_DOMAIN_SUFFIXES)) {
      return false;
    }
    return true;
  });

  context.outbounds = context.outbounds.filter(outbound => !/novastar/i.test(outbound?.tag || ''));

  route.rules = route.rules.filter(rule => {
    if (rule?.rule_set === 'geosite-novastar-internal') {
      return false;
    }
    if (rule?.outbound === '⭐NovaStar') {
      return false;
    }
    if (containsAny(rule?.domain, NOVASTAR_INTERNAL_DOMAINS)) {
      return false;
    }
    if (containsAny(rule?.domain_suffix, NOVASTAR_DIRECT_DOMAIN_SUFFIXES)) {
      return false;
    }
    return true;
  });

  route.rule_set = route.rule_set.filter(item => item?.tag !== 'geosite-novastar-internal');
}

function finalizeNovastarContext(config, context) {
  config.dns = context.dns;
  config.route = context.route;
  config.outbounds = context.outbounds;
  ConfigOps.cleanupOutboundReferences(config.outbounds);
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

  if (OUTBOUND_GROUP_TYPES.includes(normalizedOutbound.type)) {
    let insertIndex = -1;
    for (let i = 0; i < outbounds.length; i += 1) {
      if (OUTBOUND_GROUP_TYPES.includes(outbounds[i]?.type)) {
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

  const parts = String(rawValue).split(',').map(item => item.trim());

  if (parts.every(item => item === '')) {
    return { enabled: false };
  }

  const enabled = parseBoolean(parts[0]);
  if (enabled === false) {
    return { enabled: false };
  }
  if (enabled !== true || parts.length > 2 || (parts.length === 2 && !parts[1])) {
    throw new Error('配置非法：tailscale 参数格式必须为 false、true 或 true,<tag>');
  }

  const tag = parts[1] || TAILSCALE_ENDPOINT_TEMPLATE.tag;

  return {
    enabled: true,
    tag
  };
}

function applyTailscaleEndpoint(config, tailscaleOption, args) {
  if (!tailscaleOption?.enabled) {
    return;
  }

  config.endpoints = Array.isArray(config.endpoints) ? config.endpoints : [];

  const dnsMode = parseString(args.tailscale_dns) || 'split';
  if (!['magic', 'split', 'global'].includes(dnsMode)) {
    throw new Error('配置非法：tailscale_dns 必须为 magic、split 或 global');
  }
  const endpoint = {
    ...TAILSCALE_ENDPOINT_TEMPLATE,
    tag: tailscaleOption.tag
  };
  const hostname = parseString(args.tailscale_hostname);
  if (hostname) {
    endpoint.hostname = hostname;
  }
  if (hasOwn(args, 'tailscale_system_interface')) {
    const enabled = parseBoolean(args.tailscale_system_interface);
    if (enabled === undefined) {
      throw new Error('配置非法：tailscale_system_interface 必须为布尔值');
    }
    endpoint.system_interface = enabled;
  }

  const existedIndex = config.endpoints.findIndex(item => item?.tag === tailscaleOption.tag);
  const fallbackIndex = config.endpoints.findIndex(
    item => item?.tag === TAILSCALE_ENDPOINT_TEMPLATE.tag || item?.type === TAILSCALE_ENDPOINT_TEMPLATE.type
  );

  if (existedIndex >= 0) {
    config.endpoints[existedIndex] = endpoint;
  } else if (fallbackIndex >= 0) {
    config.endpoints[fallbackIndex] = endpoint;
  } else {
    config.endpoints.push(endpoint);
  }

  const dns = config.dns;
  dns.servers.push({
    type: 'tailscale',
    tag: 'tailscaleDns',
    endpoint: endpoint.tag,
    accept_default_resolvers: dnsMode === 'global',
    accept_search_domain: dnsMode !== 'magic'
  });
  // Keep public IPv4-only DNS without suppressing tailnet AAAA records.
  if (dnsMode !== 'global' && dns.strategy === 'ipv4_only') {
    dns.rules.unshift({ query_type: 'AAAA', action: 'predefined', rcode: 'NOERROR' });
  }
  delete dns.strategy;
  const tailscaleDnsRule = dnsMode === 'global'
    ? { action: 'route', server: 'tailscaleDns' }
    : { preferred_by: 'tailscaleDns', action: 'route', server: 'tailscaleDns' };
  if (dnsMode === 'magic') {
    tailscaleDnsRule.domain_suffix = ['ts.net'];
  }
  dns.rules.unshift(tailscaleDnsRule);

  const rules = config.route.rules;
  const ipv6Reject = rules.find(rule => rule.ip_version === 6 && rule.action === 'reject');
  if (ipv6Reject) {
    delete ipv6Reject.ip_version;
    Object.assign(ipv6Reject, {
      type: 'logical',
      mode: 'and',
      rules: [
        { ip_version: 6 },
        { preferred_by: endpoint.tag, invert: true }
      ]
    });
  }
  const routingIndex = rules.findIndex(rule => rule.clash_mode);
  rules.splice(routingIndex < 0 ? rules.length : routingIndex, 0, {
    type: 'logical',
    mode: 'and',
    rules: [
      { ip_cidr: ['192.168.50.0/24'] },
      {
        type: 'logical',
        mode: 'or',
        rules: [
          { wifi_ssid: ['zzz', 'zzz_5G'] },
          { default_interface_address: ['192.168.50.0/24'] },
          { network_interface_address: { wifi: ['192.168.50.0/24'] } }
        ]
      }
    ],
    action: 'route',
    outbound: 'direct'
  }, {
    preferred_by: endpoint.tag,
    action: 'route',
    outbound: endpoint.tag
  });
  // Peer traffic must not enter the public proxy or be sent back to Tailscale.
  rules.unshift({ inbound: endpoint.tag, action: 'route', outbound: 'direct' });

  const companyDns = dns.servers.find(server => server.tag === 'companyDns');
  if (companyDns) {
    companyDns.detour = endpoint.tag;
  }
  const tun = config.inbounds?.find(inbound => inbound.type === 'tun');
  if (tun) {
    const addresses = Array.isArray(tun.address) ? [...tun.address] : [tun.address];
    if (!addresses.some(address => address?.includes(':'))) {
      addresses.push('fdfe:dcba:9876::1/126');
    }
    tun.address = addresses.filter(Boolean);
  }
}

function applyTunOverrides(config, args) {
  const tunInbound = (config.inbounds || []).find(item => item?.type === 'tun');
  if (!tunInbound) {
    return;
  }

  for (const [key, parser] of Object.entries(TUN_OVERRIDE_PARSERS)) {
    if (!hasOwn(args, key)) {
      continue;
    }

    const parsed = parser(args[key]);
    if (parsed === undefined) {
      continue;
    }

    if (key === 'stack' && parsed === 'auto') {
      delete tunInbound.stack;
    } else {
      tunInbound[key] = parsed;
    }
  }
}


function parseSelectorOutboundMap(rawMap) {
  return parseColonMappings(rawMap, (left, right) => ({
    selector: left,
    outbound: right
  }));
}

function applySelectorOutboundAppend(config, mappings) {
  if (!Array.isArray(mappings) || mappings.length === 0) {
    return;
  }

  const context = createSelectorOutboundContext(config);

  for (const mapping of mappings) {
    applySelectorOutboundMapping(context, mapping);
  }
}

function createSelectorOutboundContext(config) {
  return {
    outboundMap: createOutboundMap(config)
  };
}

function applySelectorOutboundMapping(context, mapping) {
  const { selector, outbound } = mapping;
  const { outboundMap } = context;

  const resolvedSelector = resolveTag(outboundMap, selector);
  if (!resolvedSelector || !outboundMap.has(resolvedSelector)) {
    return;
  }

  const selectorOutbound = outboundMap.get(resolvedSelector);
  if (!selectorOutbound || !OUTBOUND_GROUP_TYPES.includes(selectorOutbound.type)) {
    return;
  }

  const resolvedOutbound = resolveTag(outboundMap, outbound, { allowMissing: true });
  if (!resolvedOutbound) {
    return;
  }

  appendSelectorOutbound(selectorOutbound, resolvedOutbound);
}

function appendSelectorOutbound(selectorOutbound, resolvedOutbound) {
  selectorOutbound.outbounds = Array.isArray(selectorOutbound.outbounds) ? selectorOutbound.outbounds : [];
  selectorOutbound.outbounds = uniq([...selectorOutbound.outbounds, resolvedOutbound]);
}

function parseRelayMap(rawRelayMap) {
  return parseColonMappings(rawRelayMap, (left, right) => ({
    from: left,
    to: right
  }));
}

function parseColonMappings(rawValue, buildPair) {
  if (!rawValue || typeof rawValue !== 'string') {
    return [];
  }

  return rawValue
    .split(',')
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => parseColonMappingItem(item, buildPair))
    .filter(Boolean);
}

function parseColonMappingItem(item, buildPair) {
  const index = item.indexOf(':');
  if (index <= 0 || index >= item.length - 1) {
    return null;
  }

  const left = item.slice(0, index).trim();
  const right = item.slice(index + 1).trim();
  if (!left || !right) {
    return null;
  }

  return buildPair(left, right);
}

function normalizeRelayTag(rawTag) {
  if (!rawTag) {
    return rawTag;
  }

  const key = String(rawTag).toLowerCase();
  return RELAY_ALIAS_MAP[key] || rawTag;
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

  const context = createRelayContext(config);

  for (const mapping of mappings) {
    applyRelayMapping(context, mapping);
  }
}

function createRelayContext(config) {
  return {
    outboundMap: createOutboundMap(config)
  };
}

function applyRelayMapping(context, mapping) {
  const { from, to } = mapping;
  const { outboundMap } = context;
  const resolvedFrom = resolveTag(outboundMap, from);
  const resolvedTo = resolveTag(outboundMap, to, { allowMissing: true });
  if (!resolvedFrom || !resolvedTo || !outboundMap.has(resolvedFrom)) {
    return;
  }

  const targetTags = collectRelayTargetTags(resolvedFrom, outboundMap);
  for (const tag of targetTags) {
    applyRelayDetourToTarget(outboundMap, tag, resolvedTo);
  }
}

function applyRelayDetourToTarget(outboundMap, tag, resolvedTo) {
  const target = outboundMap.get(tag);
  if (!target) {
    return;
  }

  if ([...SYSTEM_OUTBOUND_TAGS, resolvedTo].includes(tag)) {
    return;
  }

  if (OUTBOUND_GROUP_TYPES.includes(target.type)) {
    return;
  }

  target.detour = resolvedTo;
}

function createOutboundMap(config) {
  const outbounds = Array.isArray(config.outbounds) ? config.outbounds : [];
  return new Map(outbounds.map(item => [item.tag, item]));
}

function collectRelayTargetTags(fromTag, outboundMap) {
  const state = createRelayTraversalState(fromTag);
  traverseRelayTargets(state, outboundMap);
  return state.result;
}

function createRelayTraversalState(fromTag) {
  return {
    result: new Set(),
    visited: new Set(),
    queue: [fromTag]
  };
}

function traverseRelayTargets(state, outboundMap) {
  while (state.queue.length > 0) {
    const currentTag = state.queue.shift();
    visitRelayTag(currentTag, state, outboundMap);
  }
}

function visitRelayTag(currentTag, state, outboundMap) {
  if (!currentTag || state.visited.has(currentTag)) {
    return;
  }
  state.visited.add(currentTag);

  const current = outboundMap.get(currentTag);
  if (!current) {
    return;
  }

  if (isRelayGroupOutbound(current)) {
    enqueueRelayChildren(current, state);
    return;
  }

  state.result.add(currentTag);
}

function isRelayGroupOutbound(outbound) {
  return OUTBOUND_GROUP_TYPES.includes(outbound?.type)
    && Array.isArray(outbound?.outbounds)
    && outbound.outbounds.length > 0;
}

function enqueueRelayChildren(outbound, state) {
  for (const childTag of outbound.outbounds) {
    if (!state.visited.has(childTag)) {
      state.queue.push(childTag);
    }
  }
}

function injectProxiesByGroupRules(config, proxies) {
  const outboundsMap = createOutboundMap(config);

  for (const [tag, filterFn] of Object.entries(PROXY_GROUP_RULES)) {
    injectGroupProxies(outboundsMap, tag, filterFn, proxies);
  }
}

function injectGroupProxies(outboundsMap, groupTag, groupFilterFn, proxies) {
  const outbound = outboundsMap.get(groupTag);
  if (!outbound) {
    return;
  }

  const filteredProxyTags = collectGroupProxyTags(proxies, outbound.filter, groupFilterFn);
  if (!Array.isArray(outbound.outbounds)) {
    outbound.outbounds = [];
  }

  outbound.outbounds = uniq([...outbound.outbounds, ...filteredProxyTags]);
}

function collectGroupProxyTags(proxies, filters, groupFilterFn) {
  const availableProxies = applyFilter(proxies, filters);
  return availableProxies.filter(groupFilterFn).map(proxy => proxy.tag);
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

  const removedOutboundTags = new Set(PROFILE_REMOVED_OUTBOUND_TAGS);
  const removedRuleSetTags = new Set(PROFILE_REMOVED_RULE_SET_TAGS);

  if (config.experimental?.clash_api) {
    config.experimental.clash_api.external_ui_download_detour = TAG_NODE_SELECTOR;
  }

  const dns = config.dns || {};
  dns.servers = (dns.servers || []).filter(server => server?.tag !== 'companyDns');
  dns.rules = buildProfileDnsRules();
  dns.strategy = 'ipv4_only';
  config.dns = dns;

  config.outbounds = (config.outbounds || []).filter(outbound => !removedOutboundTags.has(outbound?.tag));

  const route = config.route || {};
  route.rules = buildProfileRouteRules(route.rules || [], removedOutboundTags, removedRuleSetTags);

  if (profile === 'op') {
    ensureOpRules(route.rules);
    dns.optimistic = { enabled: true, timeout: '30m' };
    dns.servers.push({ type: 'mdns', tag: 'lanDns' });
    dns.rules.unshift({
      preferred_by: 'lanDns',
      action: 'route',
      server: 'lanDns',
      timeout: '1s',
      disable_optimistic_cache: true
    });
    config.experimental = config.experimental || {};
    config.experimental.cache_file = {
      ...config.experimental.cache_file,
      enabled: true,
      store_dns: true
    };
    route.find_neighbor = true;
  } else {
    route.rules = route.rules.filter(rule => !isOpExtraRule(rule));
  }

  route.rule_set = (route.rule_set || []).filter(item => !removedRuleSetTags.has(item?.tag));
  config.route = route;

  ConfigOps.cleanupOutboundReferences(config.outbounds);
}

function buildProfileDnsRules() {
  return PROFILE_DNS_RULE_TEMPLATES.map(cloneRuleTemplate);
}

function cloneRuleTemplate(rule) {
  const cloned = { ...rule };
  if (Array.isArray(rule?.domain)) {
    cloned.domain = [...rule.domain];
  }
  if (Array.isArray(rule?.rule_set)) {
    cloned.rule_set = [...rule.rule_set];
  }
  if (Array.isArray(rule?.domain_suffix)) {
    cloned.domain_suffix = [...rule.domain_suffix];
  }
  if (Array.isArray(rule?.domain_keyword)) {
    cloned.domain_keyword = [...rule.domain_keyword];
  }
  if (Array.isArray(rule?.port)) {
    cloned.port = [...rule.port];
  }
  return cloned;
}

function buildProfileRouteRules(routeRules, removedOutboundTags, removedRuleSetTags) {
  return routeRules
    .map(rule => normalizeRuleSet(rule, removedRuleSetTags))
    .filter(rule => !shouldRemoveRouteRule(rule, removedOutboundTags, removedRuleSetTags))
    .map(mapGlobalModeRuleToNodeSelector);
}

function mapGlobalModeRuleToNodeSelector(rule) {
  if (rule?.clash_mode === 'global') {
    return {
      ...rule,
      outbound: TAG_NODE_SELECTOR
    };
  }
  return rule;
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

  if (containsAny(rule.domain_suffix, NOVASTAR_DIRECT_DOMAIN_SUFFIXES)) {
    return true;
  }

  if (containsAny(rule.domain, NOVASTAR_INTERNAL_DOMAINS)) {
    return true;
  }

  if (containsAny(rule.ip_cidr, PROFILE_REMOVED_IP_CIDR)) {
    return true;
  }

  return false;
}

function isLegacySingBoxPortRule(rule) {
  if (rule?.type !== 'logical' || rule?.mode !== 'and' || !Array.isArray(rule.rules)) {
    return false;
  }

  const hasProcess = rule.rules.some(item => containsAny(item?.process_name, LEGACY_SINGBOX_PROCESS_NAMES));
  const hasPort = rule.rules.some(item => containsAny(item?.port, LEGACY_SINGBOX_PORTS));
  return hasProcess && hasPort;
}

function ensureOpRules(rules) {
  if (!rules.some(rule => isTailscaleRule(rule))) {
    rules.splice(OP_RULE_INSERT_INDEXES.TAILSCALE_DOMAIN_RULE, 0, {
      domain_keyword: [...OP_TAILSCALE_KEYWORDS],
      outbound: TAG_CUSTOM_DIRECT
    });
  }

  if (!rules.some(rule => isTailscalePortRule(rule))) {
    rules.splice(OP_RULE_INSERT_INDEXES.TAILSCALE_PORT_RULE, 0, {
      port: [...OP_TAILSCALE_PORTS],
      outbound: TAG_CUSTOM_DIRECT
    });
  }
}

function isOpExtraRule(rule) {
  return isTailscaleRule(rule) || isTailscalePortRule(rule);
}

function isTailscaleRule(rule) {
  return rule?.outbound === TAG_CUSTOM_DIRECT && containsAny(rule.domain_keyword, OP_TAILSCALE_KEYWORDS);
}

function isTailscalePortRule(rule) {
  if (rule?.outbound !== TAG_CUSTOM_DIRECT) {
    return false;
  }
  return OP_TAILSCALE_PORTS.every(port => Array.isArray(rule.port) && rule.port.includes(port));
}

function cleanupOutboundReferences(outbounds) {
  const validTags = new Set((outbounds || []).map(item => item?.tag).filter(Boolean));

  for (const outbound of outbounds || []) {
    if (!Array.isArray(outbound?.outbounds)) {
      continue;
    }

    outbound.outbounds = uniq(
      outbound.outbounds.filter(tag => validTags.has(tag) || SYSTEM_OUTBOUND_TAGS.includes(tag))
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
  if (BOOLEAN_TRUE_VALUES.includes(raw)) {
    return true;
  }
  if (BOOLEAN_FALSE_VALUES.includes(raw)) {
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
