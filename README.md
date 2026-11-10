# 墨川 MOCHUAN · 数字长卷（冬季发布）

原创概念产品站，墨川是虚构品牌。站内所有评价、数据和价格都是示例或虚构内容。

## 运行
```
python3 -m http.server 8125      # 在本目录执行，然后打开 http://127.0.0.1:8125/
```
不需要构建，three.js r160、GSAP、Lenis 均已放在 `vendor/`，通过 importmap 引入。

## 结构
| 文件 | 作用 |
|---|---|
| `index.html` / `404.html` | 产品信息架构；meta、OG、favicon；跳转链接；加载器 |
| `css/style.css` | 设计 token（字号、8pt 间距、缓动、z-index 层级）、模块样式、响应式、减少动态效果、`.capture` |
| `js/main.js` | 编排：单一 rAF（GSAP ticker）、分级与自适应 DPR、场景切换合成、光标、磁吸按钮、卡片倾斜、点击落墨、chrome、boot、capture API |
| `js/modules.js` | 产品 UI：菜单、数字滚动、提示词试玩、前后对比、功能标签页 + 航线绘制、包浆切换、版式演示、时间线、画廊 + 灯箱、评价轮播、价格切换、FAQ、候补名单 |
| `js/painter.js` | 程序化水墨画生成器（5 种画风；构图由提示词决定，画风只影响笔触） |
| `js/composite.js` | 场景合成着色器（8 种转场） |
| `js/scenes/*.js` | 8 个场景：mountains, inkpool, clouds, museum, callig, snow, bamboo, seal |
| `js/audio.js` | 可选的环境音和微交互音效（默认关闭） |

## 场景与转场
远山（hero + 愿景）→ **落墨晕开 drop** → 墨池 → **云雾 fog** → 云海奇峰 → **潜入 dive** → 鼎器 → **飞白 brush** → 书法 → **卷轴展开 unroll** → 雪江寒钓 → **撕纸 tear** → 竹林月夜 → **钤印 stamp** → 印章。

每个转场都与滚动位置绑定，可逆、可中断；p=0 时画面完全是 A，p=1 时完全是 B。

## URL 参数
- `?capture=1`：确定性渲染，无加载器、无模拟。可用接口包括 `__setScroll(0..1)`、`__setScrollY(px)`、`__setTime(s)`、`__setPointer(x,y)`、`__setIntro(v)`、`__drop(x,y)`、`__state()`、`__metrics()`、`__benchRender(n)`。
- `?tier=0|1|2`：强制指定 GPU 档位。
- `?bench=1`：在 `window.__ft` 中记录帧时间。

## 性能
- 单一 rAF 循环。
- 每帧只渲染当前场景，以及正处于转场窗口内的下一个场景。
- GPU 分级（DPR 上限 1/1.25/1.5），并按帧时自适应 DPR。
- 加载阶段预编译着色器、预上传纹理，并对每个场景实际绘制一次，避免进入新场景时卡顿。
- 共享噪声纹理；DOM 写入有缓存。
