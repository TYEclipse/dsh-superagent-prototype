# 车载主动降噪（ANC）资源清单：经典 100 + AI 100

> 整理日期：2026-11-26。共 200 条：经典/传统 ANC 100 条 + AI/深度学习 ANC 100 条。每条至少给出论文或代码链接；两者都有时成对呈现。链接核验结果见文末。

## 文件

- [classic-100.md](classic-100.md)：经典/传统 ANC 100 条（非深度学习为主，含 2018–2025 的传统方法）
- [ai-100.md](ai-100.md)：AI/深度学习 ANC 100 条（2018–2026，含车载 AI 声学相邻任务）
- [anc-200.csv](anc-200.csv)：200 条机器可读清单（含逐条核验状态列）

## 怎么读

| 列 | 含义 |
|---|---|
| 车载 | **直** = 车载专用（车内/路噪/发动机阶次/座椅头枕/车内声区等）；**移** = 通用 ANC，可直接迁移到车内；**邻** = AI×车载声学相邻任务（路噪预测、声品质、异常声、主动声音设计等） |
| 代码 | **官方** = 论文作者仓库；**复现** = 第三方算法级实现/教学代码；**项目** = 代码项目（未必有正式论文）；**—** = 未找到公开代码 |
| 说明 | 方法/用途一句话；第三方代码会注明“算法级”，不等同于论文原实现 |

- 两个清单**允许重叠**；本版去重后实际没有重复条目，共 200 个不同条目。
- 无公开代码的条目**保留在清单中并明确标注**，不用无关代码充数；如果只需要可运行代码，按“代码”列筛选即可。
- 年份/来源列中的来源是论文发表处；代码项目显示 GitHub。

## 统计

| 指标 | 经典 100 | AI 100 | 合计 |
|---|---:|---:|---:|
| 条目 | 100 | 100 | 200 |
| 有公开代码 | 63 | 55 | 118 |
| 其中官方代码 | 4 | 53 | 57 |
| 其中第三方复现/项目 | 59 | 2 | 61 |
| 车载直接相关 | 38 | 14 | 52 |
| 可迁移 | 62 | 79 | 141 |
| 相邻（AI×车载声学） | 0 | 7 | 7 |
| 无公开代码 | 37 | 45 | 82 |

> 经典清单里官方代码少，是因为 1980–2015 的论文基本没有开源习惯；这里用第三方算法级实现补足可运行性。AI 清单官方代码比例高，是因为 2021 年后部分团队形成了“论文 + GitHub/Zenodo”的发布习惯（尤其是 GFANC/SFANC 系列）。

## 方法

1. **GitHub Search API**：88 组查询（`active noise control`、`ANC`、`FxLMS`、`filtered-x`、`road noise`、`engine order`、`GFANC`、`SFANC`、`deep ANC`、`virtual sensing`、`sound zone` 等），去重后 1,900+ 个仓库；按名称/描述/topics 筛出 672 个 ANC 相关仓库，抓取 README 提取论文链接。
2. **arXiv API**：32 组查询，约 190 篇 ANC 论文；扫描摘要/comment 中的 GitHub、Zenodo、GitLab 链接。
3. **OpenAlex**：2,876 篇 ANC/车载声学论文（title+abstract 检索），按引用数与年份筛选经典与最新条目。
4. **Crossref / DOI**：核验论文元数据；**GitHub API**：核验仓库存在、star 数、license、最近推送时间。
5. **车载专用补充**：Harman、Bose、SAE、Silentium 等工业论文；车内路噪、发动机阶次、头枕/座椅、车内声区、EV 声品质与主动声音设计（ASD）。
6. **人工/代理复核**：排除图像去噪、雷达、ECG、量子、金融等同名“noise cancellation”噪声；剔除无法核实的条目。

## 推荐起点（Top 10）

1. **Luo-Zhengding/GFANC-***：GFANC/SFANC 全家桶（GFANC、GFANC-Kalman、GFANC-Bayes、GFANC-RL、GFANC-FxNLMS、SFANC-Window 等），官方代码 + 论文，AI ANC 最完整的开源系列。
2. **ShiDongyuan/Multichannel_FxLMS_Matlab、Multichannel_Virtual_Sensing_ANC、Kalman_Filter_for_ANC**：多通道 FxLMS、虚拟传感、卡尔曼 ANC 的 MATLAB 实现，适合车载多通道快速原型。
3. **CCF2026ANC/CCF_DEEPANC_2026**：CCF 深度学习 ANC 挑战赛官方基线，含**车载场景**的数据加载、训练与评测。
4. **markostam/active-noise-cancellation**：FxLMS/FuLMS/NLMS 的 MATLAB/C 实现，经典算法入门首选。
5. **RezzaMir/Noise-Cancellation-For-Automobiles**：车内 FxLMS ANC 本科设计，含报告与 MATLAB 代码。
6. **Wang-Boxiang/PD-SFANC、Spatial-Frequency-GFANC**：移动声源/混响环境下的方向感知 SFANC，2026 最新。
7. **Lu-Baihh/WaveNet-VNNs-for-ANC、FG-CF-ANC**：严格因果的非线性深度 ANC、反馈引导 DNN 控制器融合。
8. **fholzm/Deep-Observation-Filter、Obs-TasNet**：虚拟传感观测滤波器的神经估计。
9. **paclopes/CFANC、CANC**：careful feedback ANC 与输出约束 two-gradient FxLMS。
10. **SOUNDS-RESEARCH/aspsim**：ANC 房间声学仿真器（PyPI 包），用于多通道算法快速验证。

## 附：数据集与工业方案（不计入 200 条）

- **IR64-CAR**：Peugeot 208 车内 64 通道球阵脉冲响应数据集（8 个方位、48 kHz/24 bit），适合车内声场/波束形成/ANC 仿真。[Zenodo](https://zenodo.org/records/15168578)
- **ANIR Corpus**：Daimler V-Class 车内噪声与脉冲响应实测库（1000+ 噪声、600+ IR），可用于 ANC 算法评测。[DSS Kiel](https://dss-kiel.de/index.php/media-center/data-bases/anir-corpus/state)
- **Silentium Automotive / Quiet Bubble**：工业界车载 ANC 方案（30 Hz–1 kHz，座椅/头枕局域降噪）。[Silentium](https://silentium.com/automotive-2)
- **ASPSIM**：ANC/自适应处理的房间声学仿真器（PyPI 包），已列入 AI 清单第 92 条。

## 重要限制

- **车载 ANC 的公开代码远少于论文**。Bose、Harman、Continental、Silentium 等工业界方案基本不公开代码；本清单中 82 条无公开代码的条目已如实标注，未用无关代码填充。
- **第三方复现只保证“仓库存在且实现同一算法家族”**，不保证复现论文的具体实验设置/指标；商用前请核对 LICENSE 与复现程度。
- 2026 年的论文/仓库仍在更新；arXiv/DOI 链接核验于 2026-11-26，GitHub 仓库核验其存在性、star、license 与最近推送。
- 同一代码仓库可能服务多条算法条目（例如 FxLMS 家族共享 `markostam` / `ShiDongyuan` 实现），表中以“复现/算法级”标注。
- 本清单是检索整理，不宣称穷尽；发现缺失或失效链接，请在本仓库提 issue。

## 核验方式与结果

- **论文**：arXiv 条目用 `export.arxiv.org/api` 确认存在；DOI 条目用 Crossref 确认元数据；出版商页面（IEEE/Elsevier/MDPI 等）只做可达性检查，反爬 403/429 不视为失效。
- **代码**：GitHub 条目用 GitHub REST API `repos/{owner}/{repo}` 确认存在，并记录 star、license、最近推送；Zenodo 条目做 HTTP 可达性检查（爬虫 403 会在备注中说明）。
- **本次结果**：论文链接大部分经 Crossref/arXiv API 确认；少量出版商页面 403/429 未能在线确认（DOI 元数据来自 OpenAlex/Crossref，条目仍保留并在 CSV 中标注）。代码链接经 GitHub API 确认；1 条 Zenodo 链接因反爬 403 需浏览器打开。
- 完整逐条状态见 `anc-200.csv` 的 `paper_check` / `code_check` 列（`ok` / `publisher` / `unverified` / `bot-blocked` / `none`）。

## 引用

- 用于论文时，请引用条目中的论文 DOI/arXiv；代码按其 LICENSE 使用。
- 清单本身可引用本目录路径与整理日期（2026-11-26）。

---

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
