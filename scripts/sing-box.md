# sing-box 1.14 配置与 Tailscale

`scripts/sing-box-1.12.base.tpl.json` 现在面向 sing-box 1.14，保留文件名以保持现有 Sub-Store 模板 URL 有效。搭配 `scripts/sing-box.js` 使用；模板中的节点组需要脚本填充，不能直接作为成品配置启动。

## 当前维护入口

| 文件 | 用途 |
| --- | --- |
| `sing-box-1.12.base.tpl.json` | 唯一需要维护的 sing-box 基础模板，当前面向 1.14 |
| `sing-box.js` | Sub-Store 节点插入、设备参数及 Tailscale 生成逻辑 |
| `sing-box-regression-compare.mjs` | 当前生成逻辑的行为检查，不再比较旧版本快照 |
| `custom_direct.json` / `custom_proxy.json` | 自定义直连 / 代理规则 |
| `novastar.json` | 公司内部域名清单源；生成器已内联，文件仅保留给仍引用它的旧配置 |
| `us_native.json` / `us_native.srs` | 美国原生线路规则的源文件 / 运行时二进制 |
| `sing-box.md` | 参数、配置行为与迁移说明 |
| `mihomo.yaml` | 独立的 Mihomo / Clash 模板，按需维护 |

目录只保留上述 10 个文件。旧 sing-box 独立模板、旧模板专用的 `game.json` / `novastar.srs`、调试用 hashes/positions 脚本和华住签到文件已删除。生成器已把公司内部域名内联为 `NOVASTAR_INTERNAL_DOMAINS`，不再引用 GitHub/jsDelivr 上的 `novastar.json`；该文件暂时保留，供尚未刷新、仍带 `geosite-novastar-internal` 规则的旧配置下载。`us_native.json` 是仍在使用的 `us_native.srs` 的源文件，二者都保留。

Sub-Store 已移除并归档 5 个旧“动态订阅”入口、1 个 Base 副本和 7 个旧拼装脚本。当前三个设备入口共用 `sing-box-template` 和 `sing-box-generator`，原来的下载标识保持不变。

## 本次迁移

- 远程规则集使用共享 `http_clients` 和 `route.default_http_client`，继续直连下载。`direct-download` 客户端只设置 `tag`，不填写 `detour: direct`；HTTP client 默认直接拨号，绕到空 direct 出站会在实际下载时报错。
- 移除无效的 TUN `endpoint_independent_nat`，明确 `dns_mode: hijack`。
- 移除生成脚本中的旧 DNS 规则 `strategy`，避免与 1.14 的 DNS 匹配功能冲突。
- 不再生成旧 TUN 参数 `domain_strategy` / `endpoint_independent_nat`；域名解析由现有 `resolve` 路由动作处理。
- 保留实际在官方 1.14.4 上可用的 `block` 出站和广告拦截 selector；没有把可切换拦截改成固定拒绝。
- Tailscale 开启时生成双向路由、专用 DNS，并补充 TUN IPv6 地址；关闭时不生成这些组件。

## Sub-Store 参数

所有设备引用同一模板、同一脚本，只保留各自参数。不要把已下载的成品配置再次作为脚本模板。

| 参数 | 默认值 | 用途 |
| --- | --- | --- |
| `profile` | 必填 | `home` / `company` / `op`；保留已有设备裁剪行为 |
| `collection` / `subscription` | 至少一个 | 保留现有节点来源参数 |
| `tailscale` | 关闭 | `true` 使用内部 tag `ts-ep`；`true,oppo` 等形式可继续指定内部 tag |
| `tailscale_hostname` | 不生成 | 不填写时，由运行设备决定 hostname；1.14 图形客户端可提供手机设备名称 |
| `tailscale_dns` | `split` | `magic` 仅接管 `.ts.net` MagicDNS、关闭搜索域；`split` 接管 MagicDNS/分域 DNS；`global` 把 DNS 查询交给 tailnet |
| `tailscale_system_interface` | 不生成，核心默认关闭 | 桌面/Linux 需要系统 Tailscale 网卡时显式设为 `true`；手机不启用 |
| `novastar` | `company` 时开启 | 公司集中 DNS 与路由；home 默认关闭；替代原 `novastar_hosts` 参数 |
| `novastar_server` | 保留订阅地址 | 仅覆盖本设备 `novastar` 节点的服务器地址，不修改原始订阅；手机使用 `100.106.56.51` |
| `stack` | 模板设置 | `auto` 删除字段，由核心选择默认栈；电脑和 OPPO 入口使用此值，1.15 可启用新栈 |

home 示例参数：

```json
{
  "profile": "home",
  "collection": "组合订阅",
  "tailscale": false,
  "novastar": false
}
```

手机示例参数（内部引用统一为 `ts-ep`，hostname 自动获取）：

```json
{
  "profile": "company",
  "collection": "组合订阅",
  "mtu": "1280",
  "stack": "auto",
  "tailscale": true,
  "tailscale_dns": "split",
  "selector_outbound": "⭐NovaStar:novastar",
  "relay_map": "🛬落地节点:🚪前置节点,novastar:ts-ep"
}
```

家庭网段不再使用回家 selector。开启 Tailscale 后，本机默认网卡或手机 Wi-Fi 位于 `192.168.50.0/24` 时，该网段直连；其他位置由 endpoint 的 `preferred_by` 匹配已批准的家庭子网路由。继续使用 `tailscale=true,oppo` 时，链式代理参数仍引用 `oppo`，但它不决定 Tailscale 上的设备名。

线上 `ss1.k7s.cc` 的五个设备入口使用单份共享模板和脚本。Windows 与 Android 保留公司集中 DNS 和路由；iPhone 与 macOS 使用 `profile=home&novastar=false&tailscale_dns=magic`，保留 Tailscale 回家；家庭路由器关闭公司功能和内置 Tailscale。关闭公司功能时，同时移除订阅中名称包含 `novastar` 的连接节点及其引用，避免只删除分组却残留公司服务器和认证信息。

| 页面显示名称 | 下载标识 | 设备参数 |
| --- | --- | --- |
| sing-box 1.14 Windows 公司 | `sing-box 1.12 Base` | company，MTU 1280，核心默认栈，Tailscale tag `sing-box`，DNS split |
| sing-box 1.14 Android 公司 | `sing-box 1.12 Base-OPPO` | company，MTU 1280，核心默认栈，Tailscale tag `oppo`，DNS split；novastar 经该端点连接 `100.106.56.51:35678` |
| sing-box 1.14 iPhone | `sing-box-iPhone` | home，MTU 1280，核心默认栈，Tailscale tag `iphone`，DNS magic，无公司配置 |
| sing-box 1.14 家庭路由器 | `sing-box 1.12 Base-OP` | op，MTU 9000，auto_redirect 开启，无 Tailscale、无公司配置 |
| sing-box 1.14 macOS | `sing-box-macOS` | home，MTU 1280，核心默认栈，Tailscale tag `sing-box`，DNS magic，无公司配置 |

2026-11-06：五个线上入口均已实际下载并通过 Linux 下官方 sing-box 1.14.4 的 `check`；生成器回归检查通过。iPhone、macOS、路由器输出已检查无公司节点、域名、DNS、规则和公司 Wi-Fi 设置。Mac 的现有远程配置已改用 `sing-box-macOS`，保留原 Tailscale 身份；实机验证 MagicDNS、Tailscale 访问家庭 Home Assistant（HTTP 200）和外网 HTTPS（204）。公司内网域名 `wiki.novastar.tech` 在 Mac 上返回公网 NXDOMAIN，不再命中 tailnet 公司分域 DNS。

SFM 的系统扩展保存启动配置快照；仅用 `scutil` 重连会复用旧快照。更新配置后，需要通过 SFM 自身的停止/启动按钮重新加载。Android、iPhone 尚未实机验证；本次路由器 SSH 认证未通过，已更新下载入口，设备端仍需执行 `/root/sb.sh` 刷新。

公共模板存放在 Sub-Store 的 `sing-box-template` 本地文件中，设备入口引用 `/api/file/sing-box-template#noCache`。公共脚本存放在 `sing-box-generator` 本地文件中，处理步骤使用链接型脚本 `/api/file/sing-box-generator#noCache&profile=...`。

链接型脚本的参数放在链接 `#` 后，以 `&` 分隔，值使用 URL 编码；它不会读取内嵌脚本模式的 `args.arguments` 字段。修改设备参数时编辑这一处，不要另存一份完整脚本。

仓库文件与线上共享文件同步维护，但仓库后续提交不会自动同步到 Sub-Store。公共逻辑改动只需更新一次对应共享文件，不必分别修改五个设备入口。现有 Windows、Android、路由器的下载标识不变；Clash / 星际穿越文件及其分享链接保留。

按用户要求，Clash API 固定监听 `0.0.0.0:9090`、`secret` 为空；mixed 固定监听 `0.0.0.0:2080`、`users` 为空，不启用本机监听认证。已删除生成器中的认证选项和三个 Sub-Store 入口的对应参数。上游 `novastar` SOCKS5 服务原有的认证信息保留。

## 原生 sing-box API

共用模板为所有设备启用 `services[].type: api`（要求 sing-box 1.14+），监听 `0.0.0.0:9091`，沿用当前无认证访问方式。原有 Clash API `9090` 和 mixed `2080` 不变。原生服务提供 gRPC / gRPC-Web，可供图形客户端的 Remote Control 或官方 dashboard 使用。

浏览器访问 `http://<设备地址>:9091/dashboard/`。首次连接填写名称和 API 地址 `http://<设备地址>:9091`，Secret 留空。Windows 本机可用 `127.0.0.1`，Mac 当前为 `192.168.50.236`，旁路由为 `192.168.50.254`；远程控制的地址中不带 `/dashboard/`。

官方 dashboard 首次启动时下载，默认每天检查更新。下载通过现有 `⬆️出站节点`，避免 GitHub 直连下载停滞；节点与控制面引导解析维持原有设置。手机订阅已包含服务，需更新配置并保持 VPN 运行。

原生 CLI 检查示例：`sing-box api --url http://127.0.0.1:9091 version`、`sing-box api --url http://127.0.0.1:9091 status`。


三个成品配置均通过旁路由官方 1.14.4 核心检查；生成器回归检查通过。Windows、Mac 和旁路由已更新，三台官方 dashboard 均已通过浏览器连接并显示实时运行数据，旁路由与 Mac 的原生 CLI 版本/状态查询也通过。手机仅完成订阅同步与配置校验，尚未实机验证。

## 旁路由部署

`192.168.50.254`（iStoreOS 24.10.8 / x86_64）已通过官方 OpenWrt IPK 升级到 sing-box 1.14.4，服务保持开机启动。使用家庭路由器入口 `sing-box 1.12 Base-OP`，无公司 hosts 和内置 Tailscale。

后续在旁路由运行：

```sh
/root/sb.sh
```

脚本先下载临时文件，用 `/usr/bin/sing-box check` 校验，再备份并替换 `/etc/sing-box/config.json`，最后提交服务重载。下载失败或校验失败会退出，不覆盖现用配置，也不重载服务。工作目录保持 `/usr/share/sing-box`，以保留节点选择缓存。未新增定时更新任务。

- 上一份配置：`/etc/sing-box/config.json.bak`。
- 本次升级前的核心、配置、启动脚本及 `sb.sh`：`/root/sing-box-backup-20261102-212523`。
- 已验证：下载失败/非法 JSON 不覆盖配置；真实订阅拉取及校验成功；服务运行、TUN DNS、nftables/策略路由，以及局域网客户端经代理访问外网。

主出口保留 `us4-500g_landing`。原“美国节点”手选项 `S-501 | 美国` 已不在更新后的订阅中，该组回落为 `美国 A01 Youtube无广告 联通 高带宽优化`。

旁路由 `profile=op` 已启用以下 1.14 功能，其他设备不继承这些 DNS 设置：

- DNS 乐观缓存：`optimistic: { enabled: true, timeout: "30m" }`；过期结果最多继续使用 30 分钟，同时后台刷新。
- DNS 缓存持久化：`experimental.cache_file.store_dns: true`。
- 本地 mDNS：新增 `lanDns`，用 `preferred_by` 优先处理 `.local` 和链路本地反向解析，不发送到公网 DNS；这条规则禁用乐观缓存，查询超时单独设为 `1s`。
- `route.find_neighbor: true`：为日志启用邻居识别。旁路由 DHCP 已关闭，设备主机名是否可见取决于可读取的 DHCP 租约；未添加猜测的设备分组。

1.14.4 的 mDNS 会收集结果直到查询期限结束；继承默认 10 秒超时会让部分客户端先行超时。实测将本地查询窗口设为 1 秒后，`mac-mini.local` 返回 `192.168.50.235` 和 `192.168.50.236`，公网百度/GitHub DNS 查询及 Mac 经旁路由代理访问 Google 通过。

没有添加重复的家庭网段 bypass：实际 nftables 的 `inet4_local_address_set` 已包含 `192.168.50.0/24`，在内核直接放行。没有提前 bypass 国内公网，以保留 selector 的手选策略；未启用 bridge，核心保持稳定版 1.14.4。

OPPO 的 Sub-Store 入口已设置 `stack=auto`，成品不再生成 `stack` 字段；手机更新订阅后生效，尚未实机验证。

## JSON Schema 校验

编辑器可使用官方 `https://sing-box.sagernet.org/schema.json` 补全配置；发布前以目标核心生成的 Draft 2020-12 Schema 为准，因为版本与编译功能可能不同。在旁路由导出：

```sh
sing-box schema -o /tmp/sing-box-schema.json
```

本次三个成品均通过旁路由 1.14.4 导出的 Schema 校验及 `sing-box check`，生成器回归检查通过；mDNS 查询窗口修正后重新校验了旁路由成品。Schema 校验使用临时 `uv` 环境中的 `jsonschema`，未添加项目依赖。Schema 不能证明路由优先级、系统权限和网络可达性，仍需在目标设备验证；不会向共用模板写入只适合某台设备的本地 Schema 路径。


## DNS

默认 `split` 模式会生成下列 DNS 服务器：

```json
{
  "type": "tailscale",
  "tag": "tailscaleDns",
  "endpoint": "ts-ep",
  "accept_default_resolvers": false,
  "accept_search_domain": true
}
```

将下面的规则放在精确的公司公网服务例外之后，优先于公司 DNS 规则、广告规则及 Clash 模式：

```json
{
  "preferred_by": "tailscaleDns",
  "action": "route",
  "server": "tailscaleDns"
}
```

`preferred_by` 使用 tailnet 动态下发的 MagicDNS 主机和分域 DNS 后缀，不需要手写 `*.ts.net`，也不需要把 `100.100.100.100` 当作普通公网 UDP DNS。`accept_search_domain` 允许 `nas` 这样的短主机名尝试 tailnet 搜索域；只在实际解析能到达 sing-box DNS 时生效。

个人设备选择 `tailscale_dns=magic`：首条规则同时匹配 `preferred_by: tailscaleDns` 和 `domain_suffix: ["ts.net"]`，并设置 `accept_search_domain: false`。仅删除 `companyDns` 不够，因为 tailnet 会动态下发公司分域 DNS；这个模式阻止公司域名通过该动态规则进入 Tailscale DNS。使用完整的 `设备名.<tailnet>.ts.net`，不再通过搜索域扩展短名称；公网 AAAA 空答复和 Tailscale 回家路由保留。它不修改 tailnet ACL，也不是设备访问权限隔离。

Tailscale DNS 优先规则之后，脚本用 AAAA 空答复保留原模板的公网 IPv4-only 行为，同时去掉全局 `dns.strategy` 对 tailnet IPv6 的限制。开启 Tailscale 时，在设备的 TUN 地址中加入 `fdfe:dcba:9876::1/126`，让系统的字面 IPv6 连接也能进入分流。IPv6 拒绝规则必须在 `sniff` 之前：启用 Tailscale 时，仅匹配 `ip_version: 6` 且不属于 endpoint `preferred_by` 的连接；关闭 Tailscale 时拒绝所有 IPv6。使用 `action: reject`、`no_drop: true`，避免先接受 TCP 握手、嗅探后再关闭连接。获准的 Tailscale 目标继续由后面的 `preferred_by` 路由处理。

`tailscale_dns=global` 会设置 `accept_default_resolvers: true`，并在精确的公司公网服务例外之后，无条件转发到 `tailscaleDns`。这会绕过后面的公司 DNS 规则、公网 DNS 分流和 DNS 广告拦截，采用 tailnet 下发的全局/分域 DNS，但不改变路由层“IPv6 仅供 Tailscale”的限制。它不是自动回退模式：tailnet 没有下发默认解析器时，不应期待公网域名可解析。只有需要接受 tailnet 的全局 DNS 策略时才选择它。

普通分流模式下，明确匹配国内的域名继续走 `localDns`，其余未匹配查询由 `dns.final: proxyDns` 处理；已移除原来将非 A/AAAA 查询送往本地 DNS 的兜底规则。节点和控制面引导解析独立使用 `223.5.5.5:53/UDP`，与现有国内 DNS 使用同一服务，不经过代理出站，避免 DNS 与代理节点解析相互依赖。引导查询不加密；当前公司网络下，核心连接 AliDNS DoH 被重置，导致 Tailscale 停留在初始化状态，因此不再使用该 DoH 引导路径。

### 公司 EasyConnect 与 Split DNS

Tailscale Split DNS 将 `novastar.tech`、`novaops.tech`、`novatools.vip` 交给 `100.106.56.51`（aliyun-chengdu）。客户端的 `companyDns` 也指向该地址，开启内置 endpoint 时通过该端点访问；没有内置 endpoint 时需要系统本身能够访问该 tailnet 地址。

`npan.novastar.tech:6001` 是公司公网云盘，`doc-wps.novastar.tech` 是它的在线文档依赖。公司版对这两个域名使用精确例外：DNS 优先交给 `localDns`，AAAA 返回空答案以保留 IPv4 策略；路由在 DNS resolve 后、Tailscale 和 Clash 模式之前直连。例外在全部设备参数处理完后加入，避免被 Tailscale 的 `preferred_by` 或 global DNS 覆盖。其他公司域名仍按上述分域规则处理；个人版不注入公司例外。2026-11-09 云盘公网解析为 `113.200.54.59`，公司 DNS 则返回 `172.16.91.80`；配置不固定这些 IP。

该修正已同步 Sub-Store 的共享生成脚本，Windows 已通过客户端更新并重载。实测云盘经过 302 跳转后登录页返回 HTTP 200，连接公网地址；`wiki.novastar.tech` 仍解析为公司内网地址 `172.16.81.222`。Windows、Android 下载配置均包含例外，手机需更新配置后生效；生成器回归与 Windows 核心配置检查通过。

`doc-wps` 同样被公司 DNS 解析为内网地址 `172.16.91.85`；加入例外并更新 Windows 后返回公网地址 `117.32.154.106` 和 `120.192.215.66`。实测 `https://doc-wps.novastar.tech:6001/` 的 TLS 连接成功、根路径返回 HTTP 404，默认 443 连接重置。根路径结果仅证明服务可达；当前浏览器停在云盘登录页，未取得真实文档预览 URL，因此未验证登录后的文档渲染。Windows、Android 线上公司版均已包含该例外。

`pwd.novastar.tech:18980`（统一认证）与 `ai-service.novastar.tech:9553` 同样是公网服务：境外解析为公网地址（`47.102.226.138`，另有 `120.192.215.66`、`113.200.54.60`、`117.32.154.106`），国内解析器则返回 `172.16.81.x` 内网地址，从大陆直连这两个端口会被拒或超时。公司版把它们从内部域名清单移出，改为 `proxyDns` 解析并经 `➡️节点选择` 出站；规则位置与上面两条公网直连例外相同，仍先于 `⭐NovaStar`。多地区公网节点实测两个地址均返回 HTTP 200。

VPS 的 `/root/company-dns/config.json` 保留 OA/EHR 两个特殊答案 `100.106.56.51`，其他公司域名转发给 EasyConnect 自带解析器。原 16 个 hosts 域名均已得到答案；`e-bridge.novastar.tech` 采用公司 DNS 当前返回的 `172.16.91.39`，不再固定为旧 hosts 的 `.42`。公司域名 AAAA 返回空答案，保留现有 IPv4 策略。

EasyConnect 的 `127.0.0.1:5373` 对带 EDNS 的查询返回空答案。`company-dns-upstream` 使用 BIND 的 `server 127.0.0.1 { edns no; };` 适配，配置保存在 `/root/company-dns/upstream.conf`；共享 `easyconnect` 网络命名空间，仅在容器网桥 `172.18.0.2:1055` 接受宿主机查询，未发布公网端口。前端 `company-dns` 继续在 tailnet 地址的 TCP/UDP 53 服务。重建 EasyConnect 容器后，需要重建共享其网络命名空间的上游 DNS 容器；若网桥 IP 改变，需同步这两个 DNS 配置。

集中 DNS 不发布公司子网路由。OA/EHR 的 VPS 地址由 Tailscale 处理；其他真实内网地址仍按 `⭐NovaStar` 策略访问，在公司外应选择 `novastar`。公司官网等公网解析也已通过转发验证。

`novastar` 原始订阅是 `47.109.26.116:35678` 上需要认证的 SOCKS5 服务。已验证同一服务在 `100.106.56.51:35678` 也接受现有认证。手机保留 `relay_map=novastar:oppo`，同时设置 `novastar_server=100.106.56.51`，使 Tailscale detour 指向实际 peer 地址；不能将没有发布路由的 VPS 公网地址直接交给 Tailscale。电脑入口及其他客户端的原始公网订阅不变。

实际业务地址为 `http://oa.novastar.tech:8060/` 和 `https://novaehr.novastar.tech:9443/#/`，VPS 上现有的转发服务保留。此前这两个入口均返回 HTTP 200，EHR 的 HTTPS 证书校验通过；默认 80/443 的探测不能代替实际业务端口。本次只扩大 Split DNS 的域名范围，没有修改 Tailscale 登录、账号或子网路由设置。


## QUIC 策略

共用模板统一禁用应用侧 QUIC：在 sniff 之前用 `network: udp`、`port: 443` 直接 `reject`，在 sniff 之后用 `protocol: quic` 拒绝其他端口识别出的 QUIC。两条规则都启用 `no_drop: true`，避免高频拒绝自动退化为静默丢包。它们优先于 Clash 模式、家庭/公司及业务 selector，不再依赖 `geosite-geolocation-!cn` 或 AdBlock 的手选状态。TCP/443 保留，支持回退的应用可改走 TCP。

这不修改节点本身的 Hysteria2/TUIC 传输；Tailscale peer 入站到本机服务的既有直连规则仍优先。同步调整了生成器插入公司和旁路由规则的位置，以保持原有规则之间的顺序。

三个 Sub-Store 成品已同步，旁路由已更新并重载；桌面和手机更新订阅后生效，本次未通过 GUI 操作客户端。成品通过目标 1.14.4 Schema、核心检查和生成器回归。在旁路由同版本隔离核心中，用真实 QUIC 初始包确认 UDP/443 命中端口拒绝、UDP/8443 嗅探为 QUIC 后命中协议拒绝；普通 TCP 请求返回 HTTP 200。正式旁路由已确认加载两条规则，代理 HTTPS 返回 204，`.local` DNS 正常。未进行浏览器自动回退或速度对比测试。

## 双向路由

第一条路由处理其他 tailnet 设备访问本机/本机发布的子网，优先于 sniff、DNS 劫持和所有公网代理规则：

```json
{
  "inbound": "ts-ep",
  "action": "route",
  "outbound": "direct"
}
```

经过已有 sniff、DNS 劫持、解析规则后，先判断目标和本机所在网络是否都是 `192.168.50.0/24`：桌面使用 `default_interface_address`，移动客户端使用 `network_interface_address.wifi`；匹配时直连。然后在 `clash_mode`、其他公司、国内及私网规则之前加入：

```json
{
  "preferred_by": "ts-ep",
  "action": "route",
  "outbound": "ts-ep"
}
```

这条规则动态匹配 MagicDNS 域名与节点允许的 IP/子网。endpoint 的 `accept_routes: true` 接受 tailnet 的子网路由；对应路由仍需在 Tailscale 管理端批准并获得 ACL/grants 授权。不要把所有 `192.168.0.0/16` 或整个 CGNAT 网段无条件送入 Tailscale。

家庭网段的本地网卡匹配规则优先于动态 tailnet 路由及 Clash 的 direct/global 模式。在家时自动直连，外出时由 Tailscale 的已批准子网路由处理；不再需要回家 selector。其他 tailnet 节点及子网继续按 `preferred_by` 动态处理，不把全部私网统一设为直连。

控制面和节点地址解析使用显式的 `route.default_domain_resolver: resolver`，对应独立直连 DoH；endpoint 未设置控制面代理 detour。普通路由规则不负责替换 endpoint 内部控制面和打洞逻辑。

### Wi-Fi 位置判断

`wifi_ssid` / `wifi_bssid` 是路由匹配条件，可以把已知家庭 Wi-Fi、公司 Wi-Fi 与其他网络区分开，但不会自动知道网络属于谁，也不会自动切换 selector。SSID 为网络名称，BSSID 为接入点标识；多个 AP、漫游或 Mesh 需覆盖实际使用的接入点。

Windows 1.13+ 使用 WLAN API；Android 与 Apple 平台需要图形客户端及系统允许读取 Wi-Fi 信息；Linux 需要 NetworkManager、IWD、wpa_supplicant 或 ConnMan。纯有线连接、蜂窝网络及读取失败不能仅靠 Wi-Fi 信息定位。旁路由不能凭自身 Wi-Fi 状态判断所有下游设备的位置。

家庭 Wi-Fi 为 `zzz`、`zzz_5G`：匹配这些 SSID 或原有家庭网卡地址时，仅将目的 `192.168.50.0/24` 直连；其他网络继续使用原有 Tailscale 子网路由。公司 Wi-Fi 为 `Make Nova Great Again`：在普通规则模式下，将公司内部域名（生成器内联清单）的流量优先直连，其他网络继续使用 `⭐NovaStar`；OA/EHR 的现有 VPS 路由和公司 DNS 设置不变。不会因连上某个 Wi-Fi 就把全部公网流量直连。

共享生成器及 Sub-Store 已同步这些 Wi-Fi 规则，三个成品通过 1.14.4 核心校验，公司直连规则的优先级与目的范围通过回归检查。Windows 当前 WLAN 已读取为公司 SSID，但此次未完成设备端订阅重载，不能视为实时 Wi-Fi 路由验证；客户端更新订阅后才生效。旁路由成品未变化。

操作优先使用 API，不再使用 GUI 自动点击。当前 `9091` 原生 API 只注册 `StartedService`，未暴露订阅管理及 `ManagedService.ReloadService`；本机管理服务查询返回 `unknown service daemon.ManagedService`。Clash API 的 `PUT /configs` 为无操作实现，HTTP 204 不能作为重载证据。


## 替代官方客户端的范围

1. 普通 TCP/UDP 访问、MagicDNS、子网访问可以由上述 endpoint + TUN + DNS/路由组合承担。没有进入 TUN/代理的应用流量，以及应用自己的 DoH，不会自动遵循这些规则。
2. 默认用户态 endpoint 会把访问本机 Tailscale IP 的 TCP/UDP 连接映射到回环地址。服务需监听回环或通配地址；这不等同于在系统上拥有一个可绑定的 Tailscale 网卡，也不保留官方系统网卡的全部源/目的地址语义。
3. 桌面/Linux 如需真实系统接口，设置 `tailscale_system_interface=true`，按系统要求提供权限；不要给 Android/iOS 通用配置开启第二个系统 TUN。系统网卡、OS 防火墙、实际路由冲突必须在目标设备验证。
4. 1.14 支持 SSH 服务和 Taildrop，但它们不是 DNS/分流规则。SSH 需显式 `ssh_server` 配置及 tailnet 策略，且受平台限制；普通 SSH 服务走 tailnet 与 Tailscale SSH 服务不同。
5. 使用 exit node 需要指定/选择 exit node，再把需要的公网流量路由到 endpoint。`preferred_by` 不会自动把默认路由当成所有公网流量的匹配条件；本方案没有启用全局 exit node，也没有主动发布子网或 exit node。
6. Serve/Funnel、官方 CLI/托盘、设备姿态等能力不能仅靠分流和 DNS 规则复制；有这些依赖时需分别核对 sing-box 客户端能力，不能承诺百分之百等价。
7. sing-box endpoint 有自己的节点身份与状态目录。默认 `tailscale` 目录必须持久保存，不要把认证状态复制给其他设备，也不要直接套用官方 tailscaled 的状态文件。首次使用需登录；已有节点是否保留相同名称由现有状态和管理端设置共同决定。

## 验证

运行生成器行为检查：

```sh
node scripts/sing-box-regression-compare.mjs
```

成品配置使用对应系统的官方 1.14 核心检查：

```sh
sing-box check -c generated.json
```

此前使用官方 1.14.4 Windows 核心验证 home、company、手机、全局 DNS 和系统接口配置；OpenWrt 的 `auto_redirect` 在 WSL Linux 的 1.14.4 核心校验通过。使用全部 42 个真实规则集进行了隔离启动，验证当时的公司 hosts、公网 AAAA 空答复、Adobe NXDOMAIN 和 HTTP 代理请求。

针对手机首次下载规则集时的 `detour to an empty direct outbound makes no sense`，已移除共享 HTTP client 的 `detour` 并同步 Sub-Store。当时使用独立空缓存和真实远程 URL 验证 42 个规则集全部下载成功、核心完成启动。公司内部域名改为内联后，公司版不再请求 `geosite-novastar-internal`，规则集数量降为 41；`check` 和使用本地/已有缓存规则的启动测试不能代替冷启动下载验证。

此前的 DoH 引导解析和取消监听认证调整已通过 1.14.4 与 1.15.0-alpha.13 验证。2026-11-05 的集中 DNS / 自动回家调整通过生成器回归检查及官方 1.14.4 电脑、手机配置检查；家庭路由器生成结果与调整前完全相同，无需重载。

本轮已更新 Windows 与 Mac 的 SubStore 配置。Windows 位于 `10.20.141.239`，Home Assistant `192.168.50.86:8123` 返回 200，实际 WebSocket 连接链为 `sing-box`，匹配 `preferred_by`。Mac 位于 `192.168.50.236`，直连和 mixed 访问同一服务均返回 200，实际 WebSocket 连接链为 `direct`，匹配本地网卡地址规则。两台设备均已移除回家 selector。

集中 DNS 验证覆盖原 16 个 hosts 域名、公司官网、TCP 查询及 AAAA 空答复。Windows 的 Wiki / e-bridge 系统解析正确，OA 8060 和 EHR 9443 返回 200；Mac 的 Wiki 系统解析正确，EHR 9443 返回 200。手机入口已同步并通过核心检查，但没有代替手机执行订阅更新或实机业务测试。

2026-11-06：Windows 桌面 1.15.0-alpha.12 加载 UDP 引导解析后，内置 Tailscale 从 `NoState` 恢复为 `Running`，无需重新登录。通过桌面 mixed 入站访问 Mac 的 tailnet IPv6 SSH 地址，收到真实 OpenSSH banner；公网字面 IPv6 命中新拒绝规则，微信官网 IPv4 HTTPS 返回 200。共用模板/脚本已同步 Sub-Store，桌面与手机生成结果通过同版本核心检查。

微信复测一张 86 KB 图片仍失败，进一步实测发现原 IPv6 拒绝在 `sniff` 之后，TCP 建连会先报告成功。改到嗅探前并排除 Tailscale 目标后，不再报告成功，但当前默认核心的探针表现为连接超时；Tailscale IPv6 SSH 已再次验证可达。随后用户确认图片重发成功，对应连接为 IPv4 `112.45.117.22:8000/UDP`、`自定义直连 → direct`，UDP/443 仍被拒绝。成功重试的服务器地址与此前失败时不同，因此不能仅凭这一次成功断言 IPv6 是唯一原因。PktMon 未捕获到有效数据包，未据此推断丢包或重传；限时采集及筛选器已停止并移除。

参考：[Tailscale endpoint](https://sing-box.sagernet.org/configuration/endpoint/tailscale/)、[Tailscale DNS](https://sing-box.sagernet.org/configuration/dns/server/tailscale/)、[路由 preferred_by](https://sing-box.sagernet.org/configuration/route/rule/#preferred_by)、[DNS preferred_by](https://sing-box.sagernet.org/configuration/dns/rule/#preferred_by)、[1.14 迁移说明](https://sing-box.sagernet.org/migration/#1140)。
