# C6：可选的搜索实现实验

C6 保留 8 个暗子样本、原 HCE、完整根着覆盖和现有节点定义，组合两项实现改动：复用已维护的将帅位置；在冻结排序后，仅验证实际访问的子着是否合法。合法着的相对次序、静态搜索边界和终局值经过独立差分验证。默认页面与稳定实验客户端仍使用原配置。

## 构建和检查

需要已有的 Node.js 与 C++17 工具链。本轮验证环境为原项目 Mac；C6 的诊断 CPU 计时使用 Unix `getrusage`。

```sh
node native/experiments/search-speed/build-c6.mjs
node native/experiments/search-speed/check-c6.mjs
node native/experiments/search-speed/rules-c6.mjs
node native/experiments/search-speed/check-c6.mjs --sanitize
node native/experiments/search-speed/rules-c6.mjs --sanitize
node native/experiments/search-speed/check-c6.mjs --tsan
node native/experiments/search-speed/rules-c6.mjs --tsan
```

生成器校验稳定源码与每个改动片段，只将生成结果写入 `.cache/native/search-speed/c6/`。生成的核心源码 SHA-256 必须为 `31044329472faed1e956052a4304e694211a5e0e85cdbdd5c8e75a8271c475c2`，与本轮对战使用的源码一致。`c6-review.patch` 供直接审阅，`c6-source-edits.json` 供确定性构建；稳定源码变更时构建会停止，要求重新审查补丁。

显式使用实验客户端：

```js
import { C6Engine } from './native/experiments/search-speed/c6-client.mjs';
import { initial, publicState } from './engine.js';
const engine = new C6Engine();
try {
  const result = await engine.search(publicState(initial(), 'r'), 2000);
  console.log(result.move, result.mainDepth, result.selDepth);
} finally {
  await engine.close();
}
```

只向客户端传入合法观察者视角。采样种子由可见信息产生，不能传入裁判暗子分配或对方私有暗俘。

## 结果边界

固定开发集 192 次计时零技术失败；C6 相对同二进制关闭延后合法性开关，原生 NPS 几何比为 1.107；相对本地 C5 为 1.188。该批次 10/12 高于固定 Pika，两个开局仍落后。

独立确认集包含 11 个新视角和重复的初始局面控制，共 108 次计时，零技术失败。11 个长搜索局面中，相对已交付 C4 的 NPS 几何比为 1.136，最差为 1.014；10/11 高于同批 Pika。短终局保留为延迟结果，不能根据低 NPS 判慢。完整换色对战结果见本轮报告。

原生节点统计口径跨引擎不同，Mist 的节点已经汇总所有样本，不能再乘 8。双方采用每手 2 秒、最多 4 个搜索线程、主要对照的 64 MiB TT/Hash 上限；预留时间、实际线程利用与总 RSS 不完全相同。层数同时保留主搜索、完整迭代和选择性路径，不把 Pika 的原始 depth 与 Mist 半回合深度当同一指标。更快、更多节点或小样本胜负均不能证明全面超过 Pika。

代码沿用本仓库 GPL-3.0 许可。本轮未引入第三方源码、模型或权重。

[完整结果与限制](../../../docs/experiments/search-speed-c6.md)。手动重复确认集可执行 `node native/experiments/search-speed/benchmark-c6.mjs`；需已有固定 Pika 二进制，脚本不会下载或安装。
