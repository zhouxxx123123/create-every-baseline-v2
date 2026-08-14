# 用户显示名称

内部标识用于脚本和审计。界面、主对话和报告标题优先显示中文。

## 执行阶段

| 内部标识 | 用户显示 |
| --- | --- |
| `RECEIVED` | 已接收 |
| `PREFLIGHT` | 环境核验中 |
| `SCOPE_LOCKED` | 研究范围已确定 |
| `COLLECTING` | 证据收集中 |
| `ANALYZING` | 横向分析中 |
| `DRAFTING` | 报告整理中 |
| `VALIDATING` | 证据校验中 |
| `RETURNING` | 返回原问题 |

## 最终状态

| 内部标识 | 用户显示 |
| --- | --- |
| `COMPLETE` | 研究完成 |
| `PARTIAL` | 部分完成 |
| `BLOCKED` | 研究受阻 |

## 显示规则

- 普通界面只显示中文。
- 审计或机器可读位置使用“中文（`INTERNAL_ID`）”。
- 不向用户显示未经解释的内部枚举。
- `PROPOSED_NOT_CONFIRMED` 显示为“待用户确认”。
