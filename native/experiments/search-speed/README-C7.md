# C7：行列提取与自将检查实验

C7 显式选择，默认网页、生产服务和 C6 客户端保持原配置。它保留 8 个暗子样本、原 HCE、完整根着覆盖、节点定义及时间/取消防护。

用已有的 90 位占位提取 9 位行和 10 位列，查表供车炮生成与将军检查共同使用；当前未被将军且移动非将帅时，只有满足独立证明的射线变化才省掉冗余检测。王步、当前将军、马腿/象眼变化和异常提示继续完整检查。没有兵位开局规则，没有引入 NNUE 或第三方源码。State 和 Undo 声明与 C6 相同。

需要已有 Node.js 与 C++17 工具链，计时工具沿用 Unix getrusage；许可沿用仓库 GPL-3.0。

```sh
node --test native/experiments/search-speed/c7-source.test.mjs
node native/experiments/search-speed/build-c7.mjs
node native/experiments/search-speed/check-c7.mjs
node native/experiments/search-speed/rules-c7.mjs
node native/experiments/search-speed/reference-check-c7.mjs
node native/experiments/search-speed/check-c7.mjs --sanitize
node native/experiments/search-speed/rules-c7.mjs --sanitize
node native/experiments/search-speed/check-c7.mjs --tsan
node native/experiments/search-speed/rules-c7.mjs --tsan
```

构建器对固定 C6 生成结果应用有校验的行补丁，生成文件仅写入 `.cache/native/search-speed/c7/`；最终源码必须复现本轮测试的 SHA-256。任一祖先源码变化会停止构建，要求重新审查补丁。

```js
import { C7Engine } from './native/experiments/search-speed/c7-client.mjs';
import { initial, publicState } from './engine.js';
const engine = new C7Engine();
try {
  console.log(await engine.search(publicState(initial(), 'r'), 2000));
} finally {
  await engine.close();
}
```

客户端只接收合法观察者视角，不能传入裁判种子、真实暗子分配或对方私有暗俘。

本轮固定工作通过后，开发集 216 请求相对 C6 原生 NPS 几何比 1.068，12 局面最差 1.003；独立确认与难例共 252 请求零技术失败，10 个长确认局面几何比 1.063、最差 0.991。原开发集 11/12 高于同批 Pika，独立长确认 8/10；两个已见难残局的原生 NPS 仍低于 Pika。短搜索的延迟分别有优有劣。不同引擎节点含义不同，不能把这些数字称为全面超过或棋力提升。

手动重复确认集：`node native/experiments/search-speed/benchmark-c7.mjs`。需要已有固定 Pika bcc83f88 二进制，脚本不下载或安装。原确认数据已经公开，复跑不再是新留出验证。

新布局 12 局已完成且独立回放通过（1,195 步、22 次暗俘检查），对 C6 为 2 胜 2 负，对 Pika 为 1 胜 3 负，生产诊断 1 胜 3 负，零技术失败/未决。完整结果与资源/规则限制见 [实验报告](../../../docs/experiments/search-speed-c7.md)。正式发布包 14 项命令全部通过，含 155 个 JavaScript 测试、release/ASan/UBSan/TSan、独立无 TT 参考和公开棋谱回放。

可选 CPU 诊断：`python3 native/experiments/search-speed/cpu-c7.py`，仅管理自身新建的子进程；不读取系统进程列表或附加其他进程。默认输出目录必须不存在旧结果，脚本不会覆盖。
