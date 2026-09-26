# IDEA Git for VS Code

在 VS Code 中复刻 IntelliJ IDEA Git 工作流的插件：**Local Changes、Commit、Git Log（Commit Graph）、Branches、History、Push/Pull/Fetch** 全流程覆盖，深度复用 `vscode.git` 与 VS Code 原生 Diff / Merge Editor 能力。

## 窗口布局与核心工作流

- **左侧 Commit（`Alt+0`）**：上方仓库和分支入口，中间 Changes / Unversioned Files 分组与勾选，下方提交说明、Amend、Commit / Commit & Push。点击文件在编辑区打开原生 Diff。
- **底部 Git（`Alt+9`）**：左侧可搜索的分支树，中间提交图与日志（说明、作者、日期、Hash），右侧上方 Changed Files、下方 Commit Details。分栏可拖动，也可聚焦分隔线后用左右方向键调整，比例会保存。
- 单击分支筛选日志，双击分支 Checkout；`All branches` 恢复全部分支。筛选无结果时仍可切换分支或清除筛选。
- 文件 History 按需在底部打开；Commit 和 Log 的仓库、分支、文件状态一起刷新，提交说明留在 Commit 窗口。
- `Commit & Push` 先提交成功，再展示待推送提交供确认；顶部 Push 只推送已有提交。
- “更新提交日志”收在底部状态区，仍只更新远端引用，不修改本地代码。

本轮重点实现上述 IDEA 式主要工作流，未实现 IDEA 的 Shelf、自定义 Changelists、部分代码块提交或完整设置体系。VS Code 的工具窗口边框、停靠和 Diff 编辑器由宿主提供，颜色跟随当前 VS Code 主题。

开发调试请运行 `npm run build` 后重新启动 Extension Development Host；已安装插件需重新打包安装后 Reload Window。升级保留原侧栏视图 ID，新 Git Log 使用独立底部视图；若以前手动移动过窗口，可在视图菜单中重置位置。

## 功能列表

### Repository
- 自动检测 Git 仓库，支持 Multi-root Workspace 与活动仓库切换
- 与 VS Code 内置 Git 共享仓库发现和状态事件；文件修改自动刷新，提交和分支变化自动更新 Log；回到窗口时重新检查状态
- HEAD / 分支 / ahead-behind 状态展示
- 未打开仓库时提供 `Initialize Repository` 空状态

### Local Changes（IDEA 风格）
- Changes / Unversioned Files / Merge Conflicts 分组展示
- Checkbox 选择本次提交的文件（Simple Commit Mode）
- 文件点击即查看 Diff（VS Code 原生 Diff Editor）
- 右键菜单：Show Diff / Open File / Add / Unstage / Discard / Show History / Add to .gitignore / Copy Path
- 状态徽标：M / A / D / R / C / U / ? / !

### Commit
- 布局对齐 IDEA：Amend 行在输入框上方，历史与 AI 按钮收在该行，按钮行右侧为设置入口；面板顶部分隔条可向上拖动扩大输入框
- Commit Message 输入 + 最近 20 条历史（可配置）
- Amend（自动读取上一条 Commit Message；仅 `--amend` 当前 HEAD，未实现选择其它提交）
- AI 生成提交信息：用已勾选文件的改动（含未跟踪新文件内容）调用 OpenAI 兼容接口，生成简体中文提交信息；未勾选任何文件时按工作区全部改动处理
- 提交信息遵循阿里 Git 提交规约（约定式提交）：`type(scope): subject`，body 与 footer 可选，type 取 `feat / fix / docs / style / refactor / test / chore`；整段提示词由 `ideaGit.ai.prompt` 提供默认值并可在设置里整体替换，`ideaGit.ai.instructions` 用于追加团队额外要求
- Commit & Push（自动处理 upstream 关联）
- 无 upstream 时 Push & Set Upstream

### Git Log
- 三栏布局：Branches | Commits（含 SVG Commit Graph）| Changed Files + Commit Details，支持拖拽分栏
- Commit Graph：拓扑正确的 lane 算法，Merge / 分叉可辨认，颜色稳定
- 分页加载（默认每页 200，滚动到底自动加载）+ 虚拟列表渲染大仓库不卡顿
- 筛选：搜索文本 / 作者 / 路径
- 本地提交与云端提交区分：仅存在于本地分支、任何远端跟踪引用都不可达的提交，行背景色单独区分（`localOnly`）；仓库没有任何远端跟踪引用时不作区分
- 自动刷新：`ideaGit.log.autoRefreshInterval`（默认 180 秒）定时 `git fetch` 后重新读取日志，别人新推送的提交无需手动刷新即可出现；仅在窗口获得焦点且 Git Log 界面可见时执行，只更新远端引用，不合并、不改动本地代码
- 点击 Commit 联动 Changed Files 与 Commit Details
- Commit 右键菜单：Checkout Revision / New Branch / New Tag / Cherry-Pick / Revert / Reset Current Branch to Here（Soft / Mixed / Hard）/ Copy Hash / Copy Message

### Branches
- Local / Remote / Tags 三组树
- Checkout（双击或右键）、New Branch from Selected、Rename、Delete、Delete Remote Branch
- Merge into Current / Rebase Current onto Selected / Compare with Current
- 分支名合法性校验（`git check-ref-format`）

### Remote
- **更新提交日志**：检查当前分支跟踪的远端分支，显示尚未合入本地的提交数、作者、说明及检查时间；点击提交可查看详情
- 该功能只 Fetch 远端提交对象和远端跟踪引用，不执行 Pull / Merge / Rebase / Checkout，不改动本地分支、暂存内容或工作区代码；显示最近 100 条未合入提交，总数不受此限制
- 默认每 180 秒检查一次当前活动仓库（仅窗口有焦点且有远端上游时）；`ideaGit.remoteLog.autoRefreshInterval: 0` 关闭，正数最短为 30 秒
- 没有上游或处于 detached HEAD 时明确提示；获取失败不会显示“已更新”，自动检查失败记录在 Output → IDEA Git，手动检查会显示错误
- Fetch / Fetch All & Prune、Pull（merge / rebase 模式可配置）、Push（推送预览对话框，列出领先提交）
- Force Push 默认使用 `--force-with-lease`，必须二次确认

### History / Blame
- 文件历史（`git log --follow`，重命名可追踪）
- 编辑器内 Blame 装饰（块级显示 hash / 作者 / 日期）

### 高级操作
- Rebase 状态机：REBASING 横幅显示进度，提供 Continue / Skip / Abort
- Merge / Cherry-pick / Revert / Reset（Hard 强确认）
- Stash：push / list / apply / pop / drop
- 冲突检测并一键打开 VS Code Merge Editor

### 交互细节
- 状态栏：`⑂ branch ↑ahead ↓behind`，点击打开 Branch Picker
- 所有危险操作（Hard Reset / Force Push / Delete Branch / Discard / Abort）二次确认
- 状态刷新 300ms 防抖，避免刷新风暴
- 同仓库写操作串行化（GitOperationLock）
- 统一错误模型 + 可操作的错误提示（如 push 失败提供 Pull 按钮）
- 全部 UI 使用 VS Code 主题变量，兼容 Light / Dark / High Contrast

## 快捷键

| 快捷键 | 命令 |
| --- | --- |
| `Alt+9` | 打开 Git Log |
| `Alt+0` | 打开 Commit |
| `Ctrl+Alt+C` | 打开 Commit |
| `Ctrl+Alt+Shift+K` | Push |

其余命令均可通过 Command Palette（搜索 “IDEA Git:”）使用，并可在 Keyboard Shortcuts 中自行绑定。

## 命令列表

`IDEA Git: Open Git / Open Commit / Open Log / Refresh / Commit / Push / Pull / Fetch / New Branch / Checkout Branch / Merge Branch / Rebase Branch / Branch Picker / Show File History / Toggle Blame / Stash Changes / Unstash Changes / Initialize Repository / Select Repository`

新增命令：`IDEA Git: 更新远端提交日志（不修改代码）`，也可直接点击面板上方的“更新提交日志”。普通 Refresh 只重新读取本地状态；检查服务器上的新提交使用“更新提交日志”。

AI 提交信息相关命令：`IDEA Git: 设置 AI API Key`、`IDEA Git: 清除 AI API Key`。API Key 存在 VS Code 密钥库（SecretStorage），不写入 `settings.json`，其余 AI 参数在设置里的 `ideaGit.ai.*` 下调整；提交面板右下角齿轮可直接跳到这些设置。首次点击输入框上方的 AI 图标时，若尚未配置 Key 会直接弹出输入框。

## 配置项

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `ideaGit.defaultView` | `changes` | 打开面板时的默认视图（changes / log / history） |
| `ideaGit.commitMode` | `simple` | `simple`（Checkbox 选文件）或 `staging`（显式 Stage 模式） |
| `ideaGit.log.pageSize` | `200` | Log 分页大小（100 / 200 / 500） |
| `ideaGit.log.showGraph` | `true` | 是否显示 Commit Graph |
| `ideaGit.log.showRemoteBranches` | `true` | Log 是否包含远程分支 |
| `ideaGit.commitMessageHistorySize` | `20` | Commit Message 历史条数 |
| `ideaGit.pullMode` | `merge` | Pull 策略（merge / rebase） |
| `ideaGit.remoteLog.autoRefreshInterval` | `180` | 远端日志自动检查间隔（秒）；0 关闭，正数至少 30 秒 |
| `ideaGit.log.autoRefreshInterval` | `180` | Git Log 自动刷新间隔（秒）；0 关闭，正数至少 30 秒。每次会执行一次 `git fetch` |
| `ideaGit.ai.baseUrl` | `https://api.openai.com/v1` | AI 接口地址，需兼容 OpenAI 的 `/chat/completions`。DeepSeek 用 `https://api.deepseek.com/v1`，Ollama 用 `http://localhost:11434/v1` |
| `ideaGit.ai.model` | `gpt-4o-mini` | AI 模型名，例如 `deepseek-chat` |
| `ideaGit.ai.temperature` | `0.2` | 生成提交信息的采样温度 |
| `ideaGit.ai.maxDiffChars` | `12000` | 发送给 AI 的改动文本长度上限（字符） |
| `ideaGit.ai.prompt` | 阿里 Git 提交规约提示词 | 生成提交信息时发送给 AI 的 system 消息，可整体替换；清空则回退到内置默认值 |
| `ideaGit.ai.instructions` | 空 | 在提示词之后追加的额外要求，例如必须带的需求号前缀 |
| `ideaGit.confirm.discardChanges` | `true` | Discard 前确认 |
| `ideaGit.confirm.forcePush` | `true` | Force Push 前确认 |
| `ideaGit.confirm.hardReset` | `true` | Hard Reset 前确认 |

## 安装与开发

### 环境
- Node.js >= 18，npm >= 9
- Git >= 2.23（推荐，`git switch` 等现代命令可用；旧版本自动回退 `git checkout`）
- VS Code >= 1.85

### 构建与调试
```bash
npm install        # 安装依赖
npm run build      # 编译扩展 (tsc) + Webview (vite)
```
按 `F5` 启动 “Run IDEA Git Extension” 调试配置，默认将当前工作区传入扩展开发主机。也可在开发主机中打开其他 Git 项目，点击 Activity Bar 上的 IDEA Git 图标即可使用。更新扩展代码后重新启动调试会话，以加载最新扩展和 Webview 构建产物。

### 常用脚本
| 脚本 | 说明 |
| --- | --- |
| `npm run compile` | 编译扩展端 TypeScript → `out/` |
| `npm run build:webview` | 构建 React Webview → `media/webview/` |
| `npm run watch` / `npm run watch:webview` | 监听模式 |
| `npm run typecheck` | 扩展端及 React Webview 严格类型检查 |
| `npm run lint` | ESLint |
| `npm test` | 单元测试（GitLogParser / GraphLayout）+ 集成测试（真实临时 Git 仓库） |

### 打包发布
```bash
npm run package    # 编译产物（out/ + media/webview/）
npx @vscode/vsce package
```

## 架构

```
Webview UI (React + Zustand + SVG Graph)
        ↓  类型安全 Message Protocol (src/shared/protocol.ts)
Extension Host
        ↓
Application Services (Commit/Branch/Log/History/Diff/Remote/Conflict/Stash)
        ↓
RepositoryManager → vscode.git API   +   GitCli (spawn, 参数数组，禁止 shell 拼接)
        ↓
Git
```

分层约束（文档 §83）：
- Domain 层不依赖 `vscode`
- Webview 不感知 `child_process`，所有 Git 操作必须经过 Extension Host
- 所有跨 Webview 消息均为强类型协议，带 requestId 响应
- Git Log / Graph 解析器（`\x1f` 字段分隔 / `\x1e` 记录分隔）具备完整单元测试覆盖

## 测试

```bash
npm test
```

- **单元测试**：`GitLogParser`（空格 / 换行 / 中文 / emoji / 引号 / 分隔符邻近字符）、`GraphLayout`（Linear / Branch / Merge fixture，颜色稳定性）
- **集成测试**：自动创建临时真实 Git 仓库（含 merge commit），验证 Log / Branch / Stash / Reset / 错误映射，无 Git 环境时自动跳过
- **刷新回归**：公共 API 仓库属性、延迟发现、关闭重开、300ms 防抖、订阅释放、失败后重试、状态枚举、独立未跟踪文件，以及切换仓库/重叠请求时的过期响应隔离
- **远端日志回归**：临时 bare remote + 两个本地仓库模拟他人提交；验证分叉时 ahead/behind、当前上游映射、重复请求合并、失败重试，以及更新前后本地 HEAD、暂存区和文件内容不变；不访问业务仓库或外部 Git 托管服务

## 说明

- 认证完全交给 Git Credential Manager / SSH Agent，插件不保存任何凭据
- 不复制 JetBrains 私有代码与图标资源，图标使用 Codicons
- Diff / Merge 均使用 VS Code 原生编辑器，不自研 Diff 算法
