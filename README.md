# 抓包归档 - Chrome Extension

> 基于 Chrome DevTools Protocol (CDP) 的 HTTP 请求抓包、会话归档、多格式导出与 AI 解读工具。零依赖，无需打开 DevTools，加载即用。

![Chrome Extension](https://img.shields.io/badge/Chrome%20Extension-MV3-4285F4?logo=googlechrome&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-F7DF1E?logo=javascript&logoColor=000)
![Version](https://img.shields.io/badge/version-v0.0.2-green.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)

## 项目介绍

`packet-capture-extension` 是一个面向 Web 调试、接口分析、业务流程归档和自动化测试辅助的 Chrome 扩展。项目通过 `chrome.debugger` 接入 CDP Network 事件，捕获当前标签页的请求、响应头、请求体、响应体、状态码、耗时和失败信息，并将数据按会话保存到 IndexedDB。

相比 `chrome.webRequest`，本项目可以获取完整响应体；相比 `chrome.devtools.network`，本项目无需打开 DevTools，更适合日常调试、指纹浏览器环境和批量流程录制。

## 功能清单

| 功能名称 | 功能说明 | 技术栈 | 状态 | 版本 |
|---------|---------|--------|------|------|
| 实时抓包 | 捕获 URL、Method、Headers、Body、状态码、耗时、失败信息 | CDP / `chrome.debugger` | ✅ 已完成 | v0.0.1 |
| 响应体获取 | 通过 `Network.getResponseBody` 读取完整响应内容 | Chrome DevTools Protocol | ✅ 已完成 | v0.0.1 |
| 会话归档 | 每次抓包自动创建会话，支持历史查看、删除、导出 | IndexedDB | ✅ 已完成 | v0.0.1 |
| 请求过滤 | 按 URL、HTTP 方法、状态码实时过滤请求 | Vanilla JS | ✅ 已完成 | v0.0.1 |
| 请求详情 | 查看 General、Request Headers、Request Body、Response Headers、Response Body | HTML / CSS / JS | ✅ 已完成 | v0.0.1 |
| HAR 导出 | 导出 HAR 1.2，可导入 DevTools、Charles、Fiddler | JSON / Downloads API | ✅ 已完成 | v0.0.1 |
| JSON 导出 | 导出原始抓包数据，方便二次处理 | JSON / Downloads API | ✅ 已完成 | v0.0.1 |
| AI 解读 | 将当前会话摘要发送给大模型，生成业务链路、接口用途、异常风险和排查建议 | Fetch API | ✅ 已完成 | v0.0.1 |
| 单条请求 AI 分析 | 选中任意请求后单独分析该请求和响应，便于理解接口用途与返回字段 | Fetch API | ✅ 已完成 | v0.0.2 |
| 多模型接入 | 支持 OpenAI 兼容接口、Anthropic Claude 接口、自定义 Base URL 和独立模型列表 URL | `/v1/chat/completions` / `/v1/messages` | ✅ 已完成 | v0.0.2 |
| 敏感信息脱敏 | 默认遮蔽 Cookie、Authorization、token、password、session 等字段 | 本地规则 | ✅ 已完成 | v0.0.1 |
| 状态恢复 | Service Worker 重启后自动恢复抓包状态 | `chrome.storage.local` / `chrome.alarms` | ✅ 已完成 | v0.0.1 |

## 技术方案对比

| 方案 | API | 可获取响应体 | 是否需要打开 DevTools | 是否有调试提示 |
|------|-----|:------------:|:----------------------:|:--------------:|
| **本项目** | `chrome.debugger` (CDP) | ✅ 完整 | ❌ 不需要 | ⚠️ 顶部黄色提示条 |
| `chrome.webRequest` | Extension WebRequest API | ❌ 不可获取 | ❌ 不需要 | ✅ 无 |
| `chrome.devtools.network` | DevTools Extension API | ✅ 完整 | ✅ 需要 | ✅ 无 |

选择 CDP 方案原因：在不打开 DevTools 的情况下获取完整请求和响应数据。

## 安装说明

### 环境要求

- Google Chrome / Chromium 100+
- 支持 Manifest V3 的 Chromium 内核浏览器
- 已开启扩展「开发者模式」
- 无需 Node.js、无需构建、无需安装依赖

### 安装步骤

```bash
# 克隆项目
git clone https://github.com/hailaobao2026/packet-capture-extension.git
cd packet-capture-extension
```

然后在浏览器中加载扩展：

1. 打开 `chrome://extensions/`

2. 开启右上角「开发者模式」

3. 点击「加载已解压的扩展程序」

4. 选择本项目根目录

5. 工具栏出现「抓包归档」图标，即可使用

   ![](https://mypicture-1258720957.cos.ap-nanjing.myqcloud.com/Obsidian/image-20260512195245796.png)

![](https://mypicture-1258720957.cos.ap-nanjing.myqcloud.com/Obsidian/image-20260512195332025.png)

![](https://mypicture-1258720957.cos.ap-nanjing.myqcloud.com/Obsidian/image-20260512195412670.png)

## 使用说明

### 快速开始

```text
点击扩展图标 → 开始抓包 → 在页面执行操作 → 停止抓包 → 查看详情 / 导出 HAR / 导出 JSON / AI 分析
```

### 实时抓包

1. 打开需要分析的目标页面
2. 点击扩展图标
3. 点击「开始抓包」
4. 在页面中执行登录、搜索、下单、提交表单等操作
5. 点击「停止抓包」结束捕获
6. 在列表中点击任意请求查看详情

> 抓包期间浏览器顶部会显示调试提示条，这是 Chrome Debugger API 的系统行为，无法由扩展隐藏。



![image-20260512223223840](https://mypicture-1258720957.cos.ap-nanjing.myqcloud.com/Obsidian/image-20260512223223840.png)

生成图片后

![image-20260512223318398](https://mypicture-1258720957.cos.ap-nanjing.myqcloud.com/Obsidian/image-20260512223318398.png)

抓取请求的数据包

### 过滤请求

- **搜索框**：按 URL 关键词过滤
- **方法过滤**：GET / POST / PUT / DELETE / PATCH
- **状态码过滤**：2xx / 3xx / 4xx / 5xx

### 查看请求详情

点击请求列表中的任意记录，详情面板会展示：

- General：URL、方法、状态、资源类型、耗时、大小
- Request Headers
- Request Body
- Response Headers
- Response Body（JSON 自动格式化）

### 导出数据

| 按钮 | 输出格式 | 适用场景 |
|------|----------|----------|
| 导出 HAR | HAR 1.2 | 导入 Chrome DevTools、Charles、Fiddler、HAR 分析工具 |
| 导出 JSON | 原始请求数组 | 脚本分析、归档、AI 二次处理、测试回放 |

![image-20260512223516388](https://mypicture-1258720957.cos.ap-nanjing.myqcloud.com/Obsidian/image-20260512223516388.png)

![image-20260512223545799](https://mypicture-1258720957.cos.ap-nanjing.myqcloud.com/Obsidian/image-20260512223545799.png)

### AI 解读

1. 切换到「AI解读」标签页

2. 选择模型厂商：
   - **OpenAI 兼容**：默认 `https://api.openai.com`，也支持 NewAPI、OneAPI、自建网关等兼容地址
   - **Anthropic Claude**：默认 `https://api.anthropic.com`
   
3. 填写 `Base URL`、`API Key` 和模型名

4. 如模型调用地址和模型列表地址不同，可填写「模型列表 URL」；留空则使用 `Base URL`

5. 可点击「获取模型列表」拉取模型，并从下拉列表中选择一个模型；如接口不支持列表，可选择「自定义输入...」

   ![image-20260512223823532](https://mypicture-1258720957.cos.ap-nanjing.myqcloud.com/Obsidian/image-20260512223823532.png)

6. 按需调整：
   - 发送请求/返回 Body
   - 脱敏敏感字段
   - 最多请求数
   
7. 点击「AI分析」或「分析当前会话」生成结论

也可以在「实时抓包」列表中点击某一条请求，展开详情后点击「AI分析此请求」，只分析该条请求和响应内容。

示例：如果模型调用必须走 `https://coding.dashscope.aliyuncs.com/v1`，但模型列表需要走其他 OpenAI 兼容接口，可这样配置：

```text
Base URL：https://coding.dashscope.aliyuncs.com/v1
模型列表 URL：https://dashscope.aliyuncs.com/compatible-mode/v1/models
```

> 安全提示：AI 解读会把抓包摘要发送到你配置的模型接口。分析包含账号、Cookie、Token 或业务敏感信息的流量时，请保持「脱敏敏感字段」开启，或使用可信的自建模型网关。

![image-20260512224516815](https://mypicture-1258720957.cos.ap-nanjing.myqcloud.com/Obsidian/image-20260512224516815.png)

### 历史归档

切换到「历史归档」标签页，可查看历史抓包会话。每个会话包含：

- 抓包时间和名称
- 请求总数
- 持续时间
- 查看请求
- 导出 HAR
- 删除会话

## 配置说明

### 扩展权限

`manifest.json` 中声明的主要权限：

| 权限 | 用途 |
|------|------|
| `debugger` | 通过 CDP 捕获网络请求和响应体 |
| `storage` | 保存抓包状态和 AI 配置 |
| `tabs` | 获取当前标签页信息 |
| `activeTab` | 对当前活动标签页执行抓包 |
| `alarms` | 周期唤醒 Service Worker，辅助状态恢复 |
| `downloads` | 下载 HAR / JSON 文件 |
| `<all_urls>` | 捕获目标页面发出的跨域请求 |

### AI 配置项

配置保存在本机浏览器 `chrome.storage.local` 的 `aiConfig` 中：

```js
{
  provider: 'openai' | 'anthropic',
  baseUrl: 'https://api.openai.com',
  modelsBaseUrl: '',
  apiKey: 'sk-...',
  model: 'gpt-4o-mini',
  includeBodies: true,
  redactSensitive: true,
  maxRequests: 40
}
```

## 项目结构

```text
packet-capture-extension/
├── manifest.json       # Manifest V3 清单，声明权限和入口
├── background.js       # Service Worker：CDP 抓包、存储、导出、AI 调用
├── popup.html          # Popup 页面：实时抓包 / 历史归档 / AI 解读
├── popup.css           # 暗色 DevTools 风格 UI 样式
├── popup.js            # Popup 交互、过滤、详情、下载、AI 配置
├── CLAUDE.md           # 项目维护说明
├── .gitignore
└── README.md
```

## 技术栈

| 技术 | 版本 / 形态 | 用途 |
|------|-------------|------|
| Chrome Extension | Manifest V3 | 扩展运行框架 |
| JavaScript | Vanilla JS | 业务逻辑、UI 交互、后台脚本 |
| HTML / CSS | 原生 | Popup 页面和暗色主题 |
| Chrome DevTools Protocol | Network Domain | 请求/响应捕获、响应体读取 |
| `chrome.debugger` | Extension API | 附加目标 Tab 并接收 CDP 事件 |
| IndexedDB | 浏览器内置 | 持久化 sessions 和 requests |
| `chrome.storage.local` | Extension API | 保存抓包状态与 AI 配置 |
| `chrome.downloads` | Extension API | 下载 HAR / JSON 文件 |
| Fetch API | 浏览器内置 | 调用 OpenAI 兼容和 Anthropic 接口 |

## 架构设计

```text
┌──────────┐  sendMessage  ┌──────────────┐  CDP Events  ┌───────────┐
│  Popup   │ ◄──────────► │  Service     │ ◄──────────► │ Chrome    │
│  (UI)    │              │  Worker      │              │ Tab       │
└──────────┘              └──────┬───────┘              └───────────┘
                                 │
                     ┌───────────┴───────────┐
                     ▼                       ▼
              ┌─────────────┐        ┌───────────────┐
              │  IndexedDB  │        │ AI Model API  │
              │  sessions   │        │ OpenAI/Claude │
              │  requests   │        │ Compatible    │
              └─────────────┘        └───────────────┘
```

### CDP 事件链路

1. `Network.requestWillBeSent`：记录 URL、Method、Request Headers、Request Body
2. `Network.responseReceived`：记录状态码、Response Headers、Content-Type
3. `Network.loadingFinished`：调用 `Network.getResponseBody` 获取响应体并持久化
4. `Network.loadingFailed`：记录失败请求和错误原因

### 消息协议

| Action | 方向 | 说明 |
|--------|------|------|
| `startCapture` | Popup → Service Worker | 开始抓包 |
| `stopCapture` | Popup → Service Worker | 停止抓包 |
| `getStatus` | Popup → Service Worker | 获取抓包状态 |
| `getRequests` | Popup → Service Worker | 查询请求列表 |
| `getRequestDetail` | Popup → Service Worker | 获取单个请求详情 |
| `getSessions` | Popup → Service Worker | 获取历史会话 |
| `exportHAR` | Popup → Service Worker | 生成 HAR 数据 |
| `exportJSON` | Popup → Service Worker | 生成 JSON 数据 |
| `listAIModels` | Popup → Service Worker | 获取模型列表 |
| `analyzeCapture` | Popup → Service Worker | 汇总抓包并调用模型分析 |
| `analyzeRequest` | Popup → Service Worker | 对单条请求调用模型分析 |
| `clearRequests` | Popup → Service Worker | 清空请求数据 |
| `deleteSession` | Popup → Service Worker | 删除会话及关联请求 |

## 开发指南

### 本地开发

本项目无构建步骤，直接修改源码后重新加载扩展即可。

```bash
# 查看项目文件
ls

# 修改源码
vim background.js
vim popup.js
vim popup.html
vim popup.css
```

生效方式：

- 修改 `background.js` 或 `manifest.json`：在 `chrome://extensions/` 点击扩展卡片的刷新按钮
- 修改 `popup.html` / `popup.css` / `popup.js`：关闭并重新打开扩展 Popup
- 修改权限配置：需要重新加载扩展

### 调试建议

- Popup 调试：右键扩展弹窗 → 检查
- Service Worker 调试：`chrome://extensions/` → 找到扩展 → 点击 Service Worker 链接
- 抓包冲突：抓包期间避免对同一 Tab 打开 DevTools，可能导致 Debugger 冲突

### 构建部署

当前无需构建。发布压缩包时，建议包含：

```text
manifest.json
background.js
popup.html
popup.css
popup.js
README.md
LICENSE
```

不建议包含 `.git/`、临时文件、测试导出数据和本地配置。

### 贡献指南

欢迎提交 Issue 和 Pull Request。建议贡献前确认：

1. 功能是否影响 Manifest V3 权限
2. 是否会增加敏感数据外发风险
3. 是否兼容 Service Worker 随时挂起的生命周期
4. 是否保持无框架、零依赖的轻量设计
5. 导出格式是否与 HAR / JSON 结构兼容

## 常见问题

<details>
<summary>为什么抓包时浏览器顶部有黄色提示条？</summary>

这是 Chrome 在扩展使用 `chrome.debugger` API 时显示的系统提示，属于浏览器安全机制，扩展无法隐藏。

</details>

<details>
<summary>为什么不要在抓包期间打开 DevTools？</summary>

DevTools 和本扩展都可能占用同一个 Tab 的调试通道。对同一页面同时调试可能导致抓包中断或事件丢失。

</details>

<details>
<summary>能抓到响应体吗？</summary>

可以。项目在 `Network.loadingFinished` 后调用 `Network.getResponseBody` 获取响应体。过大的响应体会自动截断，避免 IndexedDB 存储压力过大。

</details>

<details>
<summary>AI 解读会上传哪些数据？</summary>

会上传当前会话的请求摘要，包括 URL、方法、状态码、耗时、请求/响应头，以及可选的请求体和响应体摘要。默认开启敏感字段脱敏，并默认只发送最近 40 条请求。

</details>

<details>
<summary>API Key 存在哪里？</summary>

AI 配置保存在本机浏览器的 `chrome.storage.local`。请勿在不可信环境或共享浏览器配置中保存敏感 API Key。

</details>

<details>
<summary>支持哪些浏览器？</summary>

主要支持 Google Chrome 和 Chromium 内核浏览器。大多数支持 Manifest V3 与 `chrome.debugger` API 的浏览器都可尝试加载。

</details>

## 注意事项

- 响应体超过 500KB 会自动截断，防止存储过大
- AI 解读默认只发送最后 40 条请求，单个 Body 会再次截断
- AI 配置保存在本机浏览器，API Key 请谨慎保存
- 导出数据可能包含 Cookie、Token、用户 ID、业务参数等敏感信息，分享前请脱敏
- 抓包数据保存在 IndexedDB，清理浏览器数据可能导致历史归档丢失

## 适用场景

- Web 应用接口调试
- 登录、注册、下单、支付等业务流程分析
- API 逆向分析与协议梳理
- 指纹浏览器中的流量录制
- 自动化测试中的请求归档
- HAR 文件生成和问题复现
- 抓包结果 AI 总结与排查建议生成

## 项目统计

### 代码统计

| 文件 | 行数 | 说明 |
|------|-----:|------|
| `background.js` | 942 | Service Worker、CDP、存储、导出、AI 调用 |
| `popup.js` | 607 | Popup 交互、过滤、下载、AI 配置 |
| `popup.css` | 446 | UI 样式与窄窗按钮换行 |
| `popup.html` | 136 | 页面结构 |
| `manifest.json` | 24 | 扩展清单 |

> 统计时间：2026-05-12。

### 版本历史

| 版本 | 说明 |
|------|------|
| v0.0.2 | 新增单条请求 AI 分析、独立模型列表 URL、模型下拉选择、默认窄窗布局 |
| v0.0.1 | 实时抓包、会话归档、请求详情、HAR / JSON 导出、AI 解读、多模型接入、敏感字段脱敏、状态恢复优化 |

## 路线图

### 计划功能

- [ ] 增加请求重放能力
- [ ] 增加会话重命名和标签管理
- [ ] 增加按域名 / 类型 / 时间范围过滤
- [ ] 增加导入 HAR / JSON 后离线查看
- [ ] 增加敏感字段自定义规则
- [ ] 增加更多 AI 分析模板，如接口文档生成、异常聚类、测试用例生成

### 优化项

- [ ] 大响应体分块存储
- [ ] 历史会话分页和搜索
- [ ] 导出前脱敏选项
- [ ] Popup 大数据列表虚拟滚动
- [ ] 更完整的错误提示和恢复流程

## 技术交流群

欢迎加入技术交流群，交流 Chrome Extension、CDP 抓包、AI 解读、自动化测试和接口分析相关经验。

![技术交流群](https://mypicture-1258720957.cos.ap-nanjing.myqcloud.com/Screenshot_20260702_121346_com.tencent.mm.jpg)

## 作者联系

- GitHub: [hailaobao2026](https://github.com/hailaobao2026)
- 项目地址: <https://github.com/hailaobao2026/packet-capture-extension>
- 微信: `laohaibao2025`
- 邮箱: `75271002@qq.com`

![作者微信](https://mypicture-1258720957.cos.ap-nanjing.myqcloud.com/Screenshot_20260123_095617_com.tencent.mm.jpg)

## 打赏

如果这个项目对你有帮助，欢迎请作者喝杯咖啡 ☕

**微信支付**

![微信支付](https://mypicture-1258720957.cos.ap-nanjing.myqcloud.com/Obsidian/image-20250914152855543.png)

## 更新说明

### v0.0.2

- 新增单条请求 AI 分析，支持选中请求后单独解释请求参数、响应字段和异常风险
- 支持单独配置模型列表 URL，解决模型调用网关和模型列表接口不一致的问题
- 模型选择从输入框升级为下拉列表，获取模型后可直接选择，也支持自定义模型名
- 默认 Popup 窗口调整为 460x680，宽度减半、高度保持不变，减少对页面遮挡
- 更新 README 和维护文档，补充最新配置与使用说明

### v0.0.1

- 实现基于 `chrome.debugger` 的 CDP 抓包核心
- 支持捕获 URL、Method、Headers、Request Body、Response Body、状态码、耗时和失败信息
- 支持会话归档、实时请求过滤、请求详情查看、HAR 1.2 导出和原始 JSON 导出
- 新增 AI 解读标签页，支持对当前抓包会话生成业务链路、关键接口、异常风险和排查建议
- 支持 OpenAI 兼容接口和 Anthropic Claude 接口
- 支持自定义 Base URL，可接入 NewAPI、OneAPI、自建模型网关
- 新增请求/响应 Body 是否发送开关
- 新增敏感字段脱敏，默认遮蔽 Cookie、Authorization、token、password、session 等字段
- 优化 Service Worker 状态恢复，减少后台挂起后状态丢失问题

### v0.0.0

- 实现基于 `chrome.debugger` 的 CDP 抓包核心
- 支持捕获 URL、Method、Headers、Request Body、Response Body、状态码、耗时和失败信息
- 支持会话归档，按次保存抓包记录
- 支持实时请求过滤和请求详情查看
- 支持 HAR 1.2 导出和原始 JSON 导出
- 提供暗色 DevTools 风格 Popup UI

## License

SPDX-License-Identifier: MIT

本项目使用 MIT License。建议在仓库中补充 `LICENSE` 文件以便开源分发。

## Star History

如果这个项目对你有帮助，欢迎点一个 Star ⭐

[![Star History Chart](https://api.star-history.com/svg?repos=hailaobao2026/packet-capture-extension&type=Date)](https://www.star-history.com/#hailaobao2026/packet-capture-extension&Date)
