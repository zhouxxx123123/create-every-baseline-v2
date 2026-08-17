# Create Every Baseline V2

一套面向 Codex 和兼容 Agent Skills 客户端的工程工作流 Skill 集合。它覆盖从项目初始化、产品决策、研究与原型验证，到规格、任务拆分、实现、测试和代码审查的完整路径。

这不是一个自动替用户做产品决定的框架。它的核心目标是：

- 让产品决定、证据、规格和实现保持可追溯；
- 一次只处理一个真正阻塞当前阶段的问题；
- 把产品决定、原型验证、技术验证、规格和实现分开；
- 在长周期工作中保留 canonical owner、依赖关系和准确恢复位置；
- 避免 Agent 根据文件名、页面状态、历史行为或推测擅自补全产品含义。

## 快速开始

### 安装全部 Skill

先克隆仓库：

```bash
git clone https://github.com/zhouxxx123123/create-every-baseline-v2.git \
  "$HOME/create-every-baseline-v2"
```

再将每个 Skill 以符号链接安装到个人 Skill 目录。下面的脚本会跳过已经存在的同名路径，不覆盖本地 Skill：

```bash
mkdir -p "$HOME/.agents/skills"

for manifest in "$HOME/create-every-baseline-v2"/*/SKILL.md; do
  source_dir="${manifest%/SKILL.md}"
  skill_name="${source_dir##*/}"
  target="$HOME/.agents/skills/$skill_name"

  if [ ! -e "$target" ] && [ ! -L "$target" ]; then
    ln -s "$source_dir" "$target"
  else
    printf 'skip existing skill: %s\n' "$skill_name"
  fi
done
```

安装后重新启动 Codex 或刷新客户端 Skill 列表。

### 只安装一个 Skill

例如只安装 `product-readiness`：

```bash
mkdir -p "$HOME/.agents/skills"
ln -s \
  "$HOME/create-every-baseline-v2/product-readiness" \
  "$HOME/.agents/skills/product-readiness"
```

### 更新

```bash
git -C "$HOME/create-every-baseline-v2" pull --ff-only
```

通过符号链接安装时，拉取完成后无需重新复制 Skill。

## 如何调用

在 Codex 中可以显式引用 Skill：

```text
$start-setup
$skill-router
$wayfinder
$product-readiness
$research
$technical-spike
```

部分客户端使用 `/skill-name` 而不是 `$skill-name`。具体调用格式由客户端决定，Skill 名称保持不变。

不知道该用哪个 Skill 时，先调用：

```text
$skill-router
```

想通过互动练习学习一条完整工作流路线时，调用：

```text
$learn-baseline
```

## 推荐工作流

```text
项目初始化
  start-setup
      |
      v
明确目标与产品边界
  grill-with-docs / wayfinder
      |
      v
产品上下文加固
  pre-prd-hardening
      |
      v
产品就绪检查
  product-readiness
      |
      +--> research ----------+
      +--> prototype ---------+--> 返回原问题重新检查
      +--> technical-spike ---+
      |
      v
业务数据逻辑合同（存在持久业务状态时）
  data-design: READY_FOR_SPEC
      |
      v
形成规格
  to-spec
      |
      v
物理适配与迁移合同（需要数据库实施任务时）
  data-design: READY_FOR_TICKETS
      |
      v
拆分实施任务
  to-tickets
      |
      v
逐项实现
  implement -> tdd -> code-review
      |
      v
用户表面一致性检查
  prototype-parity-check
```

关键约束：

1. `research`、`prototype` 和 `technical-spike` 是有明确返回位置的 detour，不替代产品决定。
2. `product-readiness` 只审查一个有界目标；没有有效的 `READY_FOR_TO_SPEC` receipt 时，不应进入后续阶段。
3. 目标会持久化业务状态时，`data-design` 在 `to-spec` 前验证逻辑合同，在数据库实施 ticket 前验证物理适配和迁移合同。
4. `to-spec` 只综合已经确认的上下文和已验证的数据合同，不负责补做产品发现。
5. `to-tickets` 只拆分已经批准的规格，不把未决产品问题或未验证的数据架构隐藏进实施任务。
6. `implement` 一次只执行一个当前可开始的任务，并保持规格、证据和测试的追溯关系。

## Skill 目录

当前仓库包含 36 个有效 Skill。

### 初始化与导航

| Skill | 用途 |
| --- | --- |
| `start-setup` | 为仓库配置 Git、Issue Tracker、可选 Project Board、产品目录、领域文档与 triage 约定 |
| `skill-router` | 根据当前目标选择正确 Skill 或完整工作流 |
| `wayfinder` | 将超出单次会话的大型模糊目标拆成有依赖关系的决策票，并维护唯一 frontier |
| `handoff` | 将当前会话压缩成可供新会话继续的交接文档，并保留 originating workflow 与 resume target |

### 产品发现与验证

| Skill | 用途 |
| --- | --- |
| `grilling` | 一次一个问题地压力测试计划、产品决定或设计 |
| `grill-me` | 无需仓库文档的轻量 grilling 入口 |
| `grill-with-docs` | 将 grilling 与领域建模、canonical 决定记录和验证路由结合 |
| `domain-modeling` | 建立术语、对象关系、bounded context 和 ADR |
| `research` | 使用高可信一手来源回答一个有界研究问题，并将证据写入仓库 |
| `prototype` | 用可丢弃原型回答状态、交互、流程或视觉问题 |
| `pre-prd-hardening` | 在最终 readiness gate 前加固大型或仍有歧义的产品上下文 |
| `product-readiness` | 检查有界产品范围是否具备进入 `to-spec` 的决定与证据 |
| `data-design` | 将已准入的产品行为转成可验证的业务对象、状态、写入安全、物理适配和迁移合同 |
| `technical-spike` | 用最小安全实验验证一个可能改变产品或规格的技术不确定性 |

### 规格与交付

| Skill | 用途 |
| --- | --- |
| `to-spec` | 将已确认的产品上下文形成可追溯规格，并发布到配置的 tracker |
| `to-prd` | `to-spec` 的兼容调用名 |
| `to-tickets` | 将批准的规格拆成经过验证、带 blocker 关系的垂直实施任务 |
| `to-issues` | `to-tickets` 的兼容调用名 |
| `prd-implementation-precheck` | 在直接实施 PRD 或规格前执行范围、一致性和风险预检 |
| `implement` | 按规格或当前 frontier ticket 实现一个有界切片 |
| `tdd` | 按已确认 seam 执行 red-green-refactor |
| `code-review` | 从代码标准和规格符合度两个方向审查固定点之后的差异 |
| `prototype-parity-check` | 在功能实现后核对真实用户表面与已批准原型证据是否一致 |

### 代码库维护

| Skill | 用途 |
| --- | --- |
| `diagnosing-bugs` | 先建立可重复失败信号，再诊断困难 bug、回归和性能问题 |
| `diagnose` | `diagnosing-bugs` 的兼容调用名 |
| `resolving-merge-conflicts` | 处理正在进行的 merge 或 rebase 冲突 |
| `codebase-design` | 提供 deep module、interface、seam、adapter 等模块设计词汇 |
| `improve-codebase-architecture` | 扫描 deepening opportunity，生成可视报告并推进选中的架构改进 |
| `triage` | 将外部 Issue 和可选 PR 经过分类、核验和补充后转成 agent-ready brief |

### Skill 开发与独立工具

| Skill | 用途 |
| --- | --- |
| `learn-baseline` | 通过提交、教师验收、Track 评分和分路线 Capstone，在安全练习仓库中学习 Skill 工作流 |
| `write-a-skill` | 创建具有标准目录、渐进披露和配套资源的新 Skill |
| `writing-great-skills` | 编写可预测 Skill 的原则、术语和审查参考 |
| `agent-reach` | 调用外部工具搜索和读取多个互联网平台 |
| `teach` | 在当前目录建立可跨会话持续的学习工作区 |
| `caveman` | 使用极度精简但保留技术信息的表达方式 |
| `zoom-out` | 从更高抽象层解释代码、模块和调用关系 |

## 哪些 Skill 可以精简

仓库审计没有发现损坏、重名、无元数据或无法注册的 Skill。仅凭仓库内容也无法证明某个 Skill 从未被真实使用，因为仓库不收集调用遥测。

以下目录主要承担兼容职责：

| 兼容 Skill | Canonical Skill | 删除影响 |
| --- | --- | --- |
| `diagnose` | `diagnosing-bugs` | 旧的 `$diagnose` 调用失效 |
| `to-prd` | `to-spec` | 仍使用 PRD 命名的旧流程失效 |
| `to-issues` | `to-tickets` | 旧的 `$to-issues` 调用失效 |

以下不是重复副本：

- `grill-me` 是无仓库文档的轻量入口；
- `grill-with-docs` 是 `grilling + domain-modeling + canonical routing` 的组合入口；
- `pre-prd-hardening` 负责 readiness 之前的上下文加固，`product-readiness` 负责最终有界检查；
- `write-a-skill` 是创建流程，`writing-great-skills` 是写作原则与术语参考；
- `prd-implementation-precheck` 处理用户直接给出规格并要求实施的入口，`implement` 负责执行已经建立的实施契约。

如果未来要删除兼容目录，先在所有用户级和项目级集成中审计旧名称，再进行 breaking change。

## 自动触发与手动调用

每个 Skill 的 `agents/openai.yaml` 声明显示名称、简短说明、默认提示和是否允许隐式调用。

- 带 `allow_implicit_invocation: false` 的 Skill 只应由用户或其他明确工作流调用。
- 没有关闭隐式调用的 Skill 可以根据用户意图由模型选择。
- `SKILL.md` 是流程权威；`agents/openai.yaml` 只提供客户端展示与调用元数据。

仓库不会因为一个 Skill 可以隐式调用，就授权它自动进入下一工作阶段。涉及产品决定、发布、提交、推送、外部写入或其他重要动作时，仍须遵守该 Skill 自身的停止条件和用户确认要求。

## 仓库结构

```text
<skill-name>/
├── SKILL.md              # 必需：触发条件和流程权威
├── agents/
│   └── openai.yaml       # 可选：Codex 展示与调用元数据
├── references/           # 可选：按需读取的详细规则或证据
├── scripts/              # 可选：确定性验证、生成或审计工具
└── ...                   # 可选：模板和格式文件
```

根目录没有统一运行时，也不是 npm package 或 Codex plugin。每个一级目录是一个可独立安装的 Skill。

## 依赖

### 通用依赖

- Git；
- 支持 `SKILL.md` 的 Agent 客户端；
- Node.js，用于 registry、board、prototype、readiness 和 technical-spike 等脚本；
- Python 3，仅用于部分 ticket-plan 验证脚本。

### 按工作流需要

- GitHub CLI `gh`：GitHub repository、Issues 和 Project；
- GitLab CLI `glab`：GitLab Issues；
- 浏览器或 Playwright：页面与本地 Project Board 验证；
- `agent-reach` 所列的外部 CLI、MCP 服务或 API：仅在使用相应平台时需要。

并非每个 Skill 都需要上述全部依赖。缺少某个可选工具时，相关 Skill 应准确报告限制，而不是伪装为已经完成。

## 新仓库建议

在一个新项目中先运行：

```text
$start-setup
```

它会根据用户确认建立或更新：

- `AGENTS.md` 或 `CLAUDE.md` 中的 Agent Skill 约定；
- `docs/agents/git.md`；
- `docs/agents/issue-tracker.md`；
- `docs/agents/project-board.md`；
- `docs/agents/triage-labels.md`；
- `docs/agents/domain.md`；
- 可选 `.project-board/` 本地投影视图；
- 可选产品能力目录。

Issue Tracker 是 canonical source。GitHub Project 和本地 HTML Board 只是投影，不应保存第二套决定、状态或 blocker。

## 本地 Project Board

`start-setup` 可生成只读的本地 HTML Board：

- `Product Catalog`：跨多个 effort 的产品能力树，以及产品决定、原型、技术验证、规格和实现的独立进度；
- `Tree`：Map、决定、验证、规格与实施任务的 canonical 层级；
- `Flow`：blocker 到 blocked ticket 的依赖图和当前 Active frontier。

常用命令由目标项目中的 `.project-board/project-board.mjs` 提供：

```bash
node .project-board/project-board.mjs doctor
node .project-board/project-board.mjs sync
node .project-board/project-board.mjs serve
```

Board 不应根据文件名相似、编号相邻或页面位置猜测层级和依赖。

## 开发与验证

修改 Skill 后至少运行注册表严格检查：

```bash
node skill-router/scripts/audit-skill-registry.mjs . --strict
node skill-router/scripts/audit-skill-integrations.mjs .
node skill-router/scripts/test-audit-skill-registry.mjs
```

修改 Project Board 时运行：

```bash
node start-setup/scripts/test-project-board.mjs
```

修改 ticket-plan validator 时运行：

```bash
python3 -m unittest \
  to-tickets/scripts/tests/test_validate_ticket_plan.py
```

提交前运行：

```bash
git diff --check
```

当前严格注册表审计应满足：

- Skill 名称唯一；
- `SKILL.md` frontmatter 有效；
- `agents/openai.yaml` 与目录名称一致；
- 显式 Skill 引用可解析；
- 没有被禁止的旧名称重新进入集成表面。

互动课程还应运行：

```bash
node learn-baseline/scripts/validate-course.mjs
node --test learn-baseline/scripts/test-course.mjs
```

课程校验要求除 `learn-baseline` 自身外的每个现有 Skill 恰好进入一个教学路线，并明确区分实际操作和仅供识别的参考覆盖。它还会检查 checkpoint ID、证据路径、课程文件、兼容别名及每个 `SKILL.md` 的内容身份。新增、重命名或实质修改 Skill 后，课程检查会失败，直到课程内容完成复核。

`learn-baseline` 不会仅因作业文件存在就判定通过。证据需要先提交，再由教师记录 `pass` 或 `retry`；一条 Track 的全部 checkpoint 被接受后，还必须通过正式评分。完成 Foundation、一条 Elective 和对应 Capstone 只代表完成该路线；只有完成全部 Elective 才能称为完整目录覆盖。

## 移除或重命名 Skill

不要只删除目录。先审计所有集成位置：

```bash
node skill-router/scripts/audit-skill-registry.mjs \
  . \
  --forbid <retired-name> \
  --strict

node skill-router/scripts/audit-skill-integrations.mjs \
  . \
  --forbid <retired-name> \
  --project <active-project-root>
```

重命名时需要同时检查：

- 其他 Skill 中的显式调用；
- 用户级安装锁；
- Claude Skill 链接；
- OpenCode 命令和配置；
- portable transfer packs；
- 活跃项目中的说明和调用记录。

历史备份和冻结快照可以保留旧名称，但不得重新成为当前调用入口。

## 安全边界

- 不要把 token、密码、私钥、凭据文件或真实用户数据提交到 Skill 仓库；
- 对 GitHub、GitLab、Issue Tracker、文件系统或生产环境的写入必须遵守当前客户端权限与用户确认；
- Skill 中的示例命令不是对任意环境的自动授权；
- 发布公开仓库前应检查 Git 历史，而不只检查当前工作树；
- `.backup/` 和 `.incoming/` 已被忽略，不属于公开仓库内容。

## 上游与署名

`agent-reach` 的元数据保留了其上游项目链接：

- [Panniantong/Agent-Reach](https://github.com/Panniantong/Agent-Reach)

`learn-baseline` 的互动教学状态机参考了 Carl Vellotti 公开课程所展示的逐步实践、学习者门槛和检查点思路，但课程结构、协议、练习材料和脚本均为本仓库独立实现：

- [Claude Code for Product Managers](https://ccforpms.com/advanced/write-prd)

其他外部链接用于说明工具、规范或参考概念，不表示它们拥有本仓库全部 Skill。

## License

除 `agent-reach/` 目录外，本仓库由版权人原创并拥有的内容均为专有材料，版权人保留全部权利。当前版本不再向公众授予非商业使用许可，也没有默认授予安装、运行、复制、修改、改编、分发、再许可、销售、托管、集成或制作衍生作品的权利。

任何需要版权许可的使用，都必须事先取得版权人明确的书面授权。仓库公开可见或可下载，不代表获得使用许可；GitHub 用户仍可在 GitHub 服务功能及适用法律允许的范围内查看和 fork。完整边界见 [LICENSE](LICENSE)，申请授权见 [PERMISSION.md](PERMISSION.md)。空白授权模板见 [AUTHORIZATION_TEMPLATE.md](AUTHORIZATION_TEMPLATE.md)，它本身不授予任何权利。

`agent-reach/` 是单独的第三方例外，继续采用上游 MIT License，因此该目录仍可按 MIT 条款使用，包括商业使用。详见 [agent-reach/LICENSE](agent-reach/LICENSE) 和 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。

本次变更只适用于按当前版权声明发布的版本，不追溯撤销任何人此前已依据有效旧许可取得的旧版本权利。
## Repository

- GitHub: [zhouxxx123123/create-every-baseline-v2](https://github.com/zhouxxx123123/create-every-baseline-v2)
- Default branch: `main`

## One-command Prototype design-stack update

Windows / PowerShell:

```powershell
$url = 'https://raw.githubusercontent.com/zhouxxx123123/create-every-baseline-v2/main/prototype/scripts/hot-update-prototype-stack.ps1'
$script = Join-Path $env:TEMP 'hot-update-prototype-stack.ps1'
Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $script
& $script -WorkspaceRoot (Get-Location).Path
```

This entry backs up and updates the `prototype`, `codex`, and `apple-design` Skills; restores the fixed `transitions.dev`, `border-beam`, and `thinking-orbs` sources; and registers the official ChatGPT UI Kit Figma source. If an authorized local `.fig` export is available, pass `-ChatGPTFigmaPath '<path>'` to verify its SHA-256 identity.

Restart Codex or refresh the Skill list after a successful update.