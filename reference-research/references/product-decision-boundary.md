# 产品决策边界

## Research 的权限

Research 可以：

- 固定和引用一手来源；
- 描述参考实现的真实行为；
- 与当前正式产品资料比较；
- 指出匹配、冲突、未知和风险；
- 提出独立、待确认的优化候选；
- 推荐最多一个后续工作流。

Research 不可以：

- 替用户选择候选方案；
- 自动确认、关闭或重开 Product question；
- 修改决定票、Wayfinder、产品基线、正式术语或延期台账；
- 把模型输出直接写成产品事实；
- 把报告变成 Material、Result、Work Record 或正式业务对象；
- 自动进入 specification、issue creation 或 implementation；
- 暂存、提交或推送。

## 与本地 Skill 的交接

- 需要改变正式术语或对象关系：返回原调用者，由用户决定是否进入 `domain-modeling`。
- 静态证据无法解决真实技术行为：最多推荐一个 `technical-spike`。
- 需要验证可见交互、状态或工作流体验：最多推荐一个 `prototype`。
- 证据已经返回产品流程：由 `product-readiness` 或原调用者重新判断，不由本 Skill 宣布 Ready。
- 不直接调用 `to-prd` 或 `to-spec`。

## 返回合同

始终返回：

- originating workflow；
- unresolved question；
- resume target；
- 报告路径；
- 研究状态；
- 未验证项；
- 工作树变化。

生成研究文件不授权任何后续产品变化。
