# 参考研究报告模板

```markdown
---
title: <研究标题>
date: <YYYY-MM-DD>
research_status: COMPLETE | PARTIAL | BLOCKED
originating_workflow: <workflow or standalone>
resume_target: <exact target>
question: <one bounded question>
---

# <研究标题>

## 研究范围

- 研究问题：
- 原调用工作流：
- 待恢复问题：
- 返回目标：
- 所需证据：
- 排除范围：

## 直接回答

<在证据允许的范围内直接回答问题。>

## 来源清单

| 参考对象 | 类型 | 位置 | 固定身份 | 实际读取范围 |
| --- | --- | --- | --- | --- |

## 证据台账

### RR-E001

- 结论：
- 证据类型：源码事实（`FACT_FROM_CODE`）
- 来源：<固定链接、路径和行号>
- 摘录：<短摘录或等价伪代码>
- 证明：
- 不能证明：

## 横向比较

### RR-C001

- 比较维度：
- 参考实现：
- 当前产品：
- 实质差异：
- 产品影响：
- 证据：RR-E001

## 可迁移性判断

| 比较 ID | 分类 | 原因 | 受保护的产品边界 |
| --- | --- | --- | --- |

## 优化候选

### RR-O001

- 状态：待用户确认（`PROPOSED_NOT_CONFIRMED`）
- 当前问题：
- 建议改变：
- 支撑证据：RR-E001
- 影响对象：
- 影响决定：
- 预期收益：
- 风险：
- 不可迁移边界：
- 下一验证：`PRODUCT_QUESTION | TECHNICAL_SPIKE | PROTOTYPE | MORE_RESEARCH | NONE`

## 未验证项

- <明确未验证范围，或“无”。>

## 返回原流程

- 原调用工作流：
- 待恢复问题：
- 返回目标：
- 建议的下一工作流：<最多一个，或“无”>

## 工作树变化

- 新增：
- 修改：
- 暂存：否
- 提交：否
- 推送：否
```

可以增加问题需要的章节，但不要删除以上合同章节。优化候选不得替代用户确认。
