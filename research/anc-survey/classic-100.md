# 经典车载 ANC 论文与代码 100 条（非深度学习为主）

共 100 条；代码：63 条（官方 4），无公开代码：37 条。

列说明：**车载** 直=车载专用、移=通用可迁移、邻=AI×车载声学相邻；**代码** 官方=作者仓库、复现=第三方算法级实现、项目=代码项目（未必有正式论文）。

## 车载专用（38）

| # | 题目 | 年份 / 来源 | 车载 | 代码 | 说明 |
|---|---|---|---|---|---|
| 1 | [Creating personal sound zones in car cabins with active noise control](<https://doi.org/10.1016/j.apacoust.2025.110670>) | 2025 · Applied Acoustics | 直 | — | 车内个人声区与 ANC 结合；Applied Acoustics，DOI/Crossref 核实。 |
| 2 | [Pilot Study on Active Noise Control for Vehicle Interior Wind Noise](<https://doi.org/10.1007/s40857-025-00367-x>) | 2025 · Acoustics Australia | 直 | — | 车内风噪主动控制先导研究；Acoustics Australia，DOI/Crossref 核实。 |
| 3 | [Feedback control of car cabin noise using sound field compensation](<https://doi.org/10.1016/j.apacoust.2025.110613>) | 2025 · Applied Acoustics | 直 | — | 声场补偿反馈控制车内噪声；Applied Acoustics，DOI/Crossref 核实。 |
| 4 | [A robust error sensing strategy for global active noise control in car cabins](<https://doi.org/10.1121/10.0034548>) | 2024 · The Journal of the Acoustical Soc… | 直 | — | 车内全局 ANC 鲁棒误差传感策略；JASA，DOI/Crossref 核实，ASA 反爬 403。 |
| 5 | [Active headrest combined with a depth camera-based ear-positioning system](<https://arxiv.org/abs/2401.10256>) | 2024 · arXiv | 直 | — | 深度相机耳位跟踪 + 主动头枕；无公开代码 |
| 6 | [Adaptive parallel filter method for active cancellation of road noise inside vehicles](<https://doi.org/10.1016/j.ymssp.2023.110274>) | 2023 · Mechanical Systems and Signal Pro… | 直 | — | 车内路噪自适应并联滤波；MSSP，DOI/Crossref 核实。 |
| 7 | [Delayless partial subband update algorithm for feed-forward active road noise control system in pure electric vehicles](<https://doi.org/10.1016/j.ymssp.2023.110328>) | 2023 · Mechanical Systems and Signal Pro… | 直 | — | 纯电动车前馈路噪控制无延迟子带更新；MSSP，DOI/Crossref 核实。 |
| 8 | [An experimental study on the upper limit frequency of global active noise control in car cabins](<https://doi.org/10.1016/j.ymssp.2023.110672>) | 2023 · Mechanical Systems and Signal Pro… | 直 | — | 车内全局 ANC 上限频率实验研究；MSSP，DOI/Crossref 核实。 |
| 9 | [Investigation of an engine order noise cancellation system in a super sports car](<https://doi.org/10.1051/aacus/2022060>) | 2023 · Acta Acustica | 直 | — | 超级跑车发动机阶次噪声消除系统；Acta Acustica(OA)，DOI/Crossref 核实，EDP 反爬 403。 |
| 10 | [Local active control of road noise with door loudspeakers in a car cabin](<https://doi.org/10.1121/10.0022992>) | 2023 · The Journal of the Acoustical Soc… | 直 | — | 车门扬声器实现车内路噪局部控制；JASA，DOI/Crossref 核实，ASA 反爬 403。 |
| 11 | [Anti-noise window: Subjective perception of active noise reduction and effect of informational masking](<https://arxiv.org/abs/2307.05533>) | 2023 · arXiv | 直 | — | 主动降噪车窗主观实验；无公开代码 |
| 12 | [Active control of vehicle interior engine noise using a multi-channel delayed adaptive notch algorithm based on FxLMS structure](<https://doi.org/10.1016/j.ymssp.2022.109831>) | 2022 · Mechanical Systems and Signal Pro… | 直 | [复现](<https://github.com/tbrec3/stm32-adaptive-notch>) | 车载专用；第三方实现（算法级） |
| 13 | [A hybrid feedforward/feedback multi-channel active control system with optimization for cancelling road noise inside a vehicle cabin](<https://doi.org/10.1016/j.apacoust.2022.109128>) | 2022 · Applied Acoustics | 直 | — | 车内路噪前馈/反馈多通道混合控制；Applied Acoustics，DOI/Crossref 核实。 |
| 14 | [Experimental investigation into the role of nonlinear suspension behaviour in limiting feedforward road noise cancellation](<https://doi.org/10.1016/j.jsv.2021.116532>) | 2022 · Journal of Sound and Vibration | 直 | — | 悬架非线性对前馈路噪降噪上限的影响；JSV，DOI/Crossref 核实。 |
| 15 | [Vehicle Engine Noise Cancellation Based on a Multi-Channel Fractional-Order Active Noise Control Algorithm](<https://doi.org/10.3390/machines10080670>) | 2022 · Machines | 直 | — | 多通道分数阶 ANC 用于发动机噪声；Machines(OA)，DOI/Crossref 核实，MDPI 反爬 403。 |
| 16 | [Robust parallel virtual sensing method for feedback active noise control in a headrest](<https://doi.org/10.1016/j.ymssp.2022.109293>) | 2022 · Mechanical Systems and Signal Pro… | 直 | [复现](<https://github.com/ShiDongyuan/Multichannel_Virtual_Sensing_ANC>) | 头枕反馈 ANC 的并行虚拟传感；MVANC 代码可参考 |
| 17 | [Practical Uses for Road Noise Cancellation](<https://doi.org/10.4271/2021-01-1018>) | 2021 · SAE Technical Paper Series | 直 | — | 路噪主动控制工程应用（SAE）；DOI/Crossref 核实。 |
| 18 | [A modified feedforward hybrid active noise control system for vehicle](<https://doi.org/10.1016/j.apacoust.2020.107816>) | 2020 · Applied Acoustics | 直 | [复现](<https://github.com/jeremyxu177/active-noise-control>) | 车载专用；第三方实现（算法级） |
| 19 | [Active control for vehicle interior noise based on DWT-FxLMS algorithm using a piezoelectric feedback system](<https://doi.org/10.1016/j.apacoust.2020.107409>) | 2020 · Applied Acoustics | 直 | [复现](<https://github.com/vinloo/active-noise-cancelling>) | 车载专用；第三方实现（算法级） |
| 20 | [Experimental Performance Analysis of Multi-Channel Active Control System for Road Noise in Vehicles Using FXLMS Algorithm](<https://doi.org/10.4271/2020-01-1277>) | 2020 · SAE Technical Paper Series | 直 | — | 车内路噪多通道 FxLMS 实测性能；SAE，DOI/Crossref 核实。 |
| 21 | [A Hybrid Active Noise Control System for the Attenuation of Road Noise Inside a Vehicle Cabin](<https://doi.org/10.3390/s20247190>) | 2020 · Sensors | 直 | — | 车内路噪混合 ANC 系统；Sensors(OA)，DOI/Crossref 核实，MDPI 页面反爬 403。 |
| 22 | [Noise-Cancellation-For-Automobiles (MATLAB FxLMS ANC)](<https://github.com/RezzaMir/Noise-Cancellation-For-Automobiles>) | 2020 · GitHub | 直 | [官方](<https://github.com/RezzaMir/Noise-Cancellation-For-Automobiles>) | 车载 ANC 仿真 + 期末报告 PDF，含 FXLMS.m/FXLMS_tool.m/Butter/Cheb 对比；GitHub API 取到。 |
| 23 | [State-of-the-art digital road noise cancellation by Harman](<https://doi.org/10.1007/978-3-658-20251-4_4>) | 2019 · Proceedings | 直 | — | Harman 量产数字路噪主动控制（工业界）；Springer 章节，DOI/Crossref 核实。 |
| 24 | [Local active control of road noise inside a vehicle](<https://doi.org/10.1016/j.ymssp.2018.11.003>) | 2018 · Mechanical Systems and Signal Pro… | 直 | [复现](<https://github.com/Heo-Junyeong/multi-channel-fxlms>) | 车载专用；第三方实现（算法级） |
| 25 | [A normalized frequency-domain block filtered-x LMS algorithm for active vehicle interior noise control](<https://doi.org/10.1016/j.ymssp.2018.10.031>) | 2018 · Mechanical Systems and Signal Pro… | 直 | [复现](<https://github.com/MonikaTargosz/GraduateWorkANC>) | 车载专用；第三方实现（算法级） |
| 26 | [A New Method for Active Cancellation of Engine Order Noise in a Passenger Car](<https://doi.org/10.3390/app8081394>) | 2018 · Applied Sciences | 直 | [复现](<https://github.com/yewentai/Real-time-2nd-order-Adaptive-Notch-Filter-design>) | 车载专用；第三方实现（算法级） |
| 27 | [Development of a Mass-producible ANC System for Road Noise](<https://doi.org/10.1007/s38311-018-0080-1>) | 2018 · ATZ worldwide | 直 | — | Hyundai 可量产路噪 ANC（Nexo 冬奥应用）；ATZ worldwide，DOI/Crossref 核实。 |
| 28 | [Robust active noise control in a car cabin: Evaluation of achievable performances with a feedback control scheme](<https://doi.org/10.1016/j.conengprac.2018.09.015>) | 2018 · Control Engineering Practice | 直 | — | 车内鲁棒反馈 ANC 性能评估；Control Engineering Practice，DOI/Crossref 核实。 |
| 29 | [Development and Implementation of a Multi-Channel Active Control System for the Reduction of Road Induced Vehicle Interior Noise](<https://doi.org/10.3390/act7030052>) | 2018 · Actuators | 直 | [复现](<https://github.com/kevininder/Implementation-of-Multiple-Channel-Active-Noise-Control>) | 多通道路噪主动控制；多通道 FxLMS 代码可参考 |
| 30 | [Performance evaluation of an active headrest considering non-stationary broadband disturbances and head movement](<https://doi.org/10.1121/1.5034767>) | 2018 · The Journal of the Acoustical Soc… | 直 | — | 车内主动头枕实测；无公开代码 |
| 31 | [Recent Advances in Active Noise Control Inside Automobile Cabins: Toward quieter cars](<https://doi.org/10.1109/msp.2016.2601942>) | 2016 · IEEE Signal Processing Magazine | 直 | — | 综述/教材/实验论文，无配套代码；通用实现见其他条目 |
| 32 | [Multichannel control systems for the attenuation of interior road noise in vehicles](<https://doi.org/10.1016/j.ymssp.2015.01.008>) | 2015 · Mechanical Systems and Signal Pro… | 直 | [复现](<https://github.com/ShiDongyuan/Multichannel_FxLMS_Matlab>) | 车载专用；第三方实现（算法级） |
| 33 | [Development of an Active Road Noise Control System](<https://doi.org/10.1007/s38311-015-0151-5>) | 2015 · ATZ worldwide | 直 | — | Hyundai 量产主动路噪控制(ARNC)，50–500 Hz 降 6 dBA；ATZ worldwide，DOI/Crossref 核实。 |
| 34 | [Combined Feedforward–Feedback Active Control of Road Noise Inside a Vehicle Cabin](<https://doi.org/10.1115/1.4027713>) | 2014 · Journal of vibration and acoustics | 直 | [复现](<https://github.com/rxqy/ANC-active_noise_control_headsets>) | 车载专用；第三方实现（算法级） |
| 35 | [A comparison of two adaptive algorithms for the control of active engine mounts](<https://doi.org/10.1016/j.jsv.2004.09.023>) | 2004 · Journal of Sound and Vibration | 直 | [复现](<https://github.com/longlong2010/active-vibration-isolation>) | 车载专用；第三方实现（算法级） |
| 36 | [Active control system for low-frequency road noise combined with an audio system](<https://doi.org/10.1109/89.952494>) | 2001 · IEEE Transactions on Speech and A… | 直 | [复现](<https://github.com/kevininder/Implementation-of-Multiple-Channel-Active-Noise-Control>) | 车载专用；第三方实现（算法级） |
| 37 | [Development of an Active Control Engine Mount System](<https://doi.org/10.1076/vesd.32.2.185.2084>) | 1999 · Vehicle System Dynamics | 直 | [复现](<https://github.com/Be232/Active-Vibration-System-Controller>) | 车载专用；第三方实现（算法级） |
| 38 | [Active control of road noise inside vehicles](<https://doi.org/10.3397/1.2828351>) | 1994 · Noise Control Engineering Journal | 直 | [复现](<https://github.com/RezzaMir/Noise-Cancellation-For-Automobiles>) | 车载专用；第三方实现（算法级） |

## 多通道 ANC（6）

| # | 题目 | 年份 / 来源 | 车载 | 代码 | 说明 |
|---|---|---|---|---|---|
| 39 | [Block coordinate descent based algorithm for computational complexity reduction in multichannel active noise control system](<https://doi.org/10.1016/j.ymssp.2020.107346>) | 2020 · Mechanical Systems and Signal Pro… | 移 | [复现](<https://github.com/ShiDongyuan/Multichannel_FxLMS_Matlab>) | 多通道 ANC 的块坐标下降降复杂度；McFxLMS 代码 |
| 40 | [Practical Implementation of Multichannel Filtered-x Least Mean Square Algorithm Based on the Multiple-Parallel-Branch With Folding Architecture for Large-Scale Active Noise Control](<https://doi.org/10.1109/tvlsi.2019.2956524>) | 2019 · IEEE Transactions on Very Large S… | 移 | [复现](<https://github.com/Heo-Junyeong/multi-channel-fxlms>) | 多通道 FxLMS 的 VLSI 实现；C 语言多通道 FxLMS 可参考 |
| 41 | [GPU Implementation of Multichannel Adaptive Algorithms for Local Active Noise Control](<https://doi.org/10.1109/taslp.2014.2344852>) | 2014 · IEEE/ACM Transactions on Audio Sp… | 移 | [复现](<https://github.com/kevininder/Implementation-of-Multiple-Channel-Active-Noise-Control>) | 局部 ANC 多通道自适应算法的 GPU 实现；多通道 FxLMS 代码 |
| 42 | [Multichannel affine and fast affine projection algorithms for active noise control and acoustic equalization systems](<https://doi.org/10.1109/tsa.2002.805642>) | 2003 · IEEE Transactions on Speech and A… | 移 | [复现](<https://github.com/kevininder/Implementation-of-Multiple-Channel-Active-Noise-Control>) | 多通道仿射投影 ANC；多通道 FxLMS 代码可参考 |
| 43 | [Multichannel recursive-least-square algorithms and fast-transversal-filter algorithms for active noise control and sound reproduction systems](<https://doi.org/10.1109/89.861382>) | 2000 · IEEE Transactions on Speech and A… | 移 | [复现](<https://github.com/LiXirong/AdaptiveFilterandActiveNoiseCancellation>) | 多通道 ANC；第三方实现（算法级） |
| 44 | [Fast implementations of the filtered-X LMS and LMS algorithms for multichannel active noise control](<https://doi.org/10.1109/89.771315>) | 1999 · IEEE Transactions on Speech and A… | 移 | [复现](<https://github.com/ShiDongyuan/Multichannel_FxLMS_python_code>) | 多通道 ANC；第三方实现（算法级） |

## 虚拟传感（4）

| # | 题目 | 年份 / 来源 | 车载 | 代码 | 说明 |
|---|---|---|---|---|---|
| 45 | [Robust performance of virtual sensing methods for active noise control](<https://doi.org/10.1016/j.ymssp.2020.107453>) | 2020 · Mechanical Systems and Signal Pro… | 移 | [复现](<https://github.com/ShiDongyuan/Multichannel_Virtual_Sensing_ANC>) | 虚拟传感鲁棒性能；MVANC 仓库可参考 |
| 46 | [Selective Virtual Sensing Technique for Multi-channel Feedforward Active Noise Control Systems](<https://doi.org/10.1109/icassp.2019.8682705>) | 2019 · IEEE International Conference on … | 移 | [复现](<https://github.com/ShiDongyuan/Multichannel_Virtual_Sensing_ANC>) | 多通道前馈选择性虚拟传感；MVANC 仓库可复现 |
| 47 | [A Review of Virtual Sensing Algorithms for Active Noise Control](<https://doi.org/10.3390/a1020069>) | 2008 · Algorithms | 移 | [复现](<https://github.com/ShiDongyuan/Multichannel_Virtual_Sensing_ANC>) | 虚拟传感；第三方实现（算法级） |
| 48 | [A Kalman filter approach to virtual sensing for active noise control](<https://doi.org/10.1016/j.ymssp.2007.06.007>) | 2007 · Mechanical Systems and Signal Pro… | 移 | [复现](<https://github.com/ShiDongyuan/Kalman_Filter_for_ANC>) | 虚拟传感；第三方实现（算法级） |

## 非线性 ANC（9）

| # | 题目 | 年份 / 来源 | 车载 | 代码 | 说明 |
|---|---|---|---|---|---|
| 49 | [Sparse Modeling of Nonlinear Secondary Path for Nonlinear Active Noise Control](<https://doi.org/10.1109/tim.2017.2781992>) | 2018 · IEEE Transactions on Instrumentat… | 移 | [复现](<https://github.com/AlexMonik/Adaptive-Volterra-Filter>) | 非线性次级路径稀疏建模；Volterra 代码可参考 |
| 50 | [A Particle-Swarm-Optimization-Based Decentralized Nonlinear Active Noise Control System](<https://doi.org/10.1109/tim.2012.2205492>) | 2012 · IEEE Transactions on Instrumentat… | 移 | — | PSO 分散式非线性 ANC；未找到可核实的对应代码 |
| 51 | [Efficient Adaptive Nonlinear Filters for Nonlinear Active Noise Control](<https://doi.org/10.1109/tcsi.2006.887636>) | 2007 · IEEE Transactions on Circuits and… | 移 | [复现](<https://github.com/AlexMonik/Adaptive-Volterra-Filter>) | 高效非线性自适应滤波；Volterra 仓库覆盖同类方法 |
| 52 | [Nonlinear adaptive bilinear filters for active noise control systems](<https://doi.org/10.1109/tcsi.2004.842429>) | 2005 · IEEE Transactions on Circuits and… | 移 | [复现](<https://github.com/AlexMonik/Adaptive-Volterra-Filter>) | 双线性自适应滤波器；Volterra 代码可作为非线性家族参考 |
| 53 | [Active Mitigation of Nonlinear Noise Processes Using a Novel Filtered-s LMS Algorithm](<https://doi.org/10.1109/tsa.2003.822741>) | 2004 · IEEE Transactions on Speech and A… | 移 | — | FLANN/filtered-s LMS 非线性 ANC 经典；未找到可核实的 FLANN 专用代码 |
| 54 | [Filtered-X Affine Projection Algorithm for Multichannel Active Noise Control Using Second-Order Volterra Filters](<https://doi.org/10.1109/lsp.2004.836944>) | 2004 · IEEE Signal Processing Letters | 移 | [复现](<https://github.com/AlexMonik/Adaptive-Volterra-Filter>) | 多通道二阶 Volterra FxAP；代码为 Volterra ANC 实现 |
| 55 | [Stochastic analysis of the filtered-X LMS algorithm in systems with nonlinear secondary paths](<https://doi.org/10.1109/tsp.2002.1003058>) | 2002 · IEEE Transactions on Signal Proce… | 移 | [复现](<https://github.com/ravikgpiit/Modified-FxLMS>) | 非线性次级路径下 FxLMS 的随机分析；代码为改进 FxLMS 实现 |
| 56 | [Adaptive Volterra filters for active control of nonlinear noise processes](<https://doi.org/10.1109/78.934136>) | 2001 · IEEE Transactions on Signal Proce… | 移 | [复现](<https://github.com/AlexMonik/Adaptive-Volterra-Filter>) | 非线性 ANC；第三方实现（算法级） |
| 57 | [Active control of nonlinear noise processes in a linear duct](<https://doi.org/10.1109/78.709529>) | 1998 · IEEE Transactions on Signal Proce… | 移 | [复现](<https://github.com/matejfroebe/duct-ANC>) | 管道非线性噪声控制经典；代码为管道 ANC 实验实现 |

## 耳机/个人 ANC（5）

| # | 题目 | 年份 / 来源 | 车载 | 代码 | 说明 |
|---|---|---|---|---|---|
| 58 | [Design and Implementation of an Active Noise Control Headphone With Directional Hear-Through Capability](<https://doi.org/10.1109/tce.2019.2956634>) | 2019 · IEEE Transactions on Consumer Ele… | 移 | [复现](<https://github.com/rxqy/ANC-active_noise_control_headsets>) | 带定向透听的 ANC 耳机；Simulink 耳机 ANC 实现 |
| 59 | [Active noise control system for headphone applications](<https://doi.org/10.1109/tcst.2005.863667>) | 2006 · IEEE Transactions on Control Syst… | 移 | [复现](<https://github.com/snpal/noise_cancelling_headphones>) | 耳机/个人 ANC；第三方实现（算法级） |
| 60 | [A robust hybrid feedback active noise cancellation headset](<https://doi.org/10.1109/tsa.2005.848878>) | 2005 · IEEE Transactions on Speech and A… | 移 | [复现](<https://github.com/ThomasRAYNAUD/Noise-Reduction-Headset>) | 鲁棒混合反馈 ANC 耳机；代码为 FxLMS 耳机原型 |
| 61 | [An integrated audio and active noise control headset](<https://doi.org/10.1109/tce.2002.1010128>) | 2002 · IEEE Transactions on Consumer Ele… | 移 | [复现](<https://github.com/ThomasRAYNAUD/Noise-Reduction-Headset>) | 耳机 ANC 与音频集成；Teensy FxLMS 耳机实现可参考 |
| 62 | [Controller design for active noise cancellation headphones using experimental raw data](<https://doi.org/10.1109/3516.974862>) | 2001 · IEEE/ASME Transactions on Mechatr… | 移 | [复现](<https://github.com/ThomasRAYNAUD/Noise-Reduction-Headset>) | 耳机/个人 ANC；第三方实现（算法级） |

## 反馈 ANC（2）

| # | 题目 | 年份 / 来源 | 车载 | 代码 | 说明 |
|---|---|---|---|---|---|
| 63 | [Cross-updated active noise control system with online secondary path modeling](<https://doi.org/10.1109/89.928924>) | 2001 · IEEE Transactions on Speech and A… | 移 | [复现](<https://github.com/JNUypma/FFANC_SPM_FBPM>) | 反馈 ANC；第三方实现（算法级） |
| 64 | [Performance of feedforward and feedback systems for active control](<https://doi.org/10.1109/89.496217>) | 1996 · IEEE Transactions on Speech and A… | 移 | [复现](<https://github.com/zftan0709/Feedback-ANC-Teensy-3.6>) | 反馈 ANC；第三方实现（算法级） |

## 频域/子带/空间（3）

| # | 题目 | 年份 / 来源 | 车载 | 代码 | 说明 |
|---|---|---|---|---|---|
| 65 | [Feedforward Selective Fixed-filter Active Noise Control: Algorithm and Implementation](<https://doi.org/10.1109/taslp.2020.2989582>) | 2020 · IEEE/ACM Transactions on Audio Sp… | 移 | [复现](<https://github.com/Amao-Liang/Subband-Architecture-for-Selective-Fixed-Filter-Active-Noise-Control>) | 固定滤波器 SFANC 的早期实现；代码为后续 subband 版本 |
| 66 | [Active Noise Control Over Space: A Wave Domain Approach](<https://doi.org/10.1109/taslp.2018.2795756>) | 2018 · IEEE/ACM Transactions on Audio Sp… | 移 | [复现](<https://github.com/Bohlsen/NUMBA-Accelerated-Wave-Domain-Spatial-Active-Noise-Control>) | 频域/子带/空间；第三方实现（算法级） |
| 67 | [A delayless subband adaptive filter architecture](<https://doi.org/10.1109/78.403341>) | 1995 · IEEE Transactions on Signal Proce… | 移 | [复现](<https://github.com/manojbandaru3/Subband-Adaptive-Filtering>) | 频域/子带/空间；第三方实现（算法级） |

## 综述/教材（6）

| # | 题目 | 年份 / 来源 | 车载 | 代码 | 说明 |
|---|---|---|---|---|---|
| 68 | [A survey on active noise control in the past decade—Part I: Linear systems](<https://doi.org/10.1016/j.sigpro.2021.108039>) | 2021 · Signal Processing | 移 | — | 综述/教材/实验论文，无配套代码；通用实现见其他条目 |
| 69 | [Recent advances on active noise control: open issues and innovative applications](<https://doi.org/10.1017/atsip.2012.4>) | 2012 · APSIPA Transactions on Signal and… | 移 | — | 综述/教材/实验论文，无配套代码；通用实现见其他条目 |
| 70 | [Active noise control: Open problems and challenges](<https://doi.org/10.1109/icgcs.2010.5543076>) | 2010 · International Conference on Green… | 移 | — | 综述/教材/实验论文，无配套代码；通用实现见其他条目 |
| 71 | [Active noise control: a tutorial review](<https://doi.org/10.1109/5.763310>) | 1999 · Proceedings of the IEEE | 移 | [复现](<https://github.com/adithyasunil26/Active-Noise-Control>) | 综述/教材；第三方实现（算法级） |
| 72 | [Active noise control](<https://doi.org/10.1109/79.248551>) | 1993 · IEEE Signal Processing Magazine | 移 | [复现](<https://github.com/Qin-Yi/Active-Noise-Control-System>) | 综述/教材；第三方实现（算法级） |
| 73 | [Active control of sound and vibration](<https://doi.org/10.1109/37.476383>) | 1992 · Academic Press | 移 | — | 综述/教材/实验论文，无配套代码；通用实现见其他条目 |

## 通用/前馈 ANC（27）

| # | 题目 | 年份 / 来源 | 车载 | 代码 | 说明 |
|---|---|---|---|---|---|
| 74 | [Active Noise Control in The New Century: The Role and Prospect of Signal Processing](<https://arxiv.org/abs/2306.01425>) | 2023 · arXiv | 移 | — | ANC 新世纪综述（信号处理视角）；无代码 |
| 75 | [Sound zone control for arbitrary sound field reproduction](<https://github.com/SOUNDS-RESEARCH/eusipco2023-szc-arbitrary-sf-reproduction>) | 2023 · EUSIPCO 2023 | 移 | [官方](<https://github.com/SOUNDS-RESEARCH/eusipco2023-szc-arbitrary-sf-reproduction>) | 任意声场重现的声区控制（Brunnström 等，EUSIPCO 2023）；作者仓库 |
| 76 | [Affine-Projection-Like Maximum Correntropy Criteria Algorithm for Robust Active Noise Control](<https://doi.org/10.1109/taslp.2022.3190720>) | 2022 · IEEE/ACM Transactions on Audio Sp… | 移 | — | AP-like MCC 鲁棒 ANC；无公开代码 |
| 77 | [Spatial Active Noise Control Based on Kernel Interpolation of Sound Field](<https://doi.org/10.1109/taslp.2021.3107983>) | 2021 · IEEE/ACM Transactions on Audio, S… | 移 | [官方](<https://github.com/sh01k/KernelInterpSpatialANC>) | 通用/前馈 ANC；官方代码 |
| 78 | [Ultra-broadband local active noise control with remote acoustic sensing](<https://doi.org/10.1038/s41598-020-77614-w>) | 2020 · Scientific Reports | 移 | [复现](<https://github.com/ShiDongyuan/Multichannel_Virtual_Sensing_ANC>) | 超宽带局部 ANC + 远程声传感；MVANC 代码可参考 |
| 79 | [Robust Generalized Maximum Correntropy Criterion Algorithms for Active Noise Control](<https://doi.org/10.1109/taslp.2020.2982030>) | 2020 · IEEE/ACM Transactions on Audio Sp… | 移 | — | GMCC 鲁棒 ANC；无公开代码 |
| 80 | [Effect of Transducer Positioning in Active Noise Control](<https://arxiv.org/abs/1802.10058>) | 2018 · International Conference on Signa… | 移 | [官方](<https://github.com/cksajil/ancram>) | 通用/前馈 ANC；官方代码 |
| 81 | [Two-gradient direction FXLMS: An adaptive active noise control algorithm with output constraint](<https://doi.org/10.1016/j.ymssp.2018.06.062>) | 2018 · Mechanical Systems and Signal Pro… | 移 | [复现](<https://github.com/paclopes/CANC>) | 输出约束下的 two-gradient FxLMS；CANC 仓库为其算法家族实现 |
| 82 | [Active control of scattered acoustic fields: Cancellation, reproduction and cloaking](<https://doi.org/10.1121/1.4962284>) | 2016 · The Journal of the Acoustical Soc… | 移 | — | 散射声场主动控制；无公开代码 |
| 83 | [Convex Combination Filtered-X Algorithms for Active Noise Control Systems](<https://doi.org/10.1109/tasl.2012.2215595>) | 2012 · IEEE Transactions on Audio Speech… | 移 | [复现](<https://github.com/GTAC-ITEAM-UPV/PIME-FxNLMS>) | 通用/前馈 ANC；第三方实现（算法级） |
| 84 | [A new variable step size LMS algorithm-based method for improved online secondary path modeling in active noise control systems](<https://doi.org/10.1109/tsa.2005.855829>) | 2006 · IEEE Transactions on Audio Speech… | 移 | [复现](<https://github.com/ZideWay/Active-Noise-Control>) | 通用/前馈 ANC；第三方实现（算法级） |
| 85 | [Active control of sound inside a sphere via control of the acoustic pressure at the boundary surface](<https://doi.org/10.1016/j.jsv.2006.06.066>) | 2006 · Journal of Sound and Vibration | 移 | — | 空间 ANC 的球域边界压力控制；无公开代码 |
| 86 | [Adaptive filter theory](<https://github.com/LiXirong/AdaptiveFilterandActiveNoiseCancellation>) | 2002 · Prentice Hall | 移 | [复现](<https://github.com/LiXirong/AdaptiveFilterandActiveNoiseCancellation>) | Haykin 自适应滤波器教材；LMS/NLMS/RLS 代码 |
| 87 | [Active noise control for periodic disturbances](<https://doi.org/10.1109/87.896760>) | 2001 · IEEE Transactions on Control Syst… | 移 | [复现](<https://github.com/875441459/Basic-demonstraion-of-Fxlms-Algo>) | 周期扰动 ANC；仓库含宽带/窄带 FxLMS 示例 |
| 88 | [Understanding Active Noise Cancellation](<https://doi.org/10.1201/9781482267570>) | 1999 · CRC Press | 移 | [复现](<https://github.com/markostam/active-noise-cancellation>) | Snyder 教材；MATLAB/C 的 FxLMS/FuLMS/NLMS 实现 |
| 89 | [Bode integral constraints, collocation, and spillover in active noise and vibration control](<https://doi.org/10.1109/87.654881>) | 1998 · IEEE Transactions on Control Syst… | 移 | — | 反馈 ANC 的 Bode 约束与 spillover；无公开代码 |
| 90 | [Influence of modeling error on noise reduction performance of active noise control systems using filtered-X LMS algorithm.](<https://doi.org/10.1250/ast.17.195>) | 1996 · Journal of the Acoustical Society… | 移 | [复现](<https://github.com/ravikgpiit/Modified-FxLMS>) | 建模误差对 FxLMS 降噪量的影响；代码为改进 FxLMS |
| 91 | [Active Noise Control Systems: Algorithms and DSP Implementations](<https://github.com/Lu9033/Primary-and-secondary-paths-in-active-noise-control>) | 1996 · Wiley | 移 | [复现](<https://github.com/Lu9033/Primary-and-secondary-paths-in-active-noise-control>) | Kuo & Morgan 经典教材；代码为书中主/次级路径示例 |
| 92 | [Analysis of the filtered-X LMS algorithm](<https://doi.org/10.1109/89.482218>) | 1995 · IEEE Transactions on Speech and A… | 移 | [复现](<https://github.com/875441459/Basic-demonstraion-of-Fxlms-Algo>) | 通用/前馈 ANC；第三方实现（算法级） |
| 93 | [The effect of transfer function estimation errors on the filtered-x LMS algorithm](<https://doi.org/10.1109/78.285659>) | 1994 · IEEE Transactions on Signal Proce… | 移 | [复现](<https://github.com/ravikgpiit/Modified-FxLMS>) | 通用/前馈 ANC；第三方实现（算法级） |
| 94 | [Single-sensor active noise cancellation](<https://doi.org/10.1109/89.279277>) | 1994 · IEEE Transactions on Speech and A… | 移 | [复现](<https://github.com/markostam/active-noise-cancellation>) | 单传感器 ANC；仓库提供 FxLMS/FuLMS/NLMS 基础实现 |
| 95 | [Effect of errors in the plant model on the performance of algorithms for adaptive feedforward control](<https://doi.org/10.1049/ip-f-2.1991.0042>) | 1991 · IEE Proceedings F Radar and Signa… | 移 | [复现](<https://github.com/ravikgpiit/Modified-FxLMS>) | 植物模型误差对前馈控制的影响；改进 FxLMS 代码 |
| 96 | [In-flight experiments on the active control of propeller-induced cabin noise](<https://doi.org/10.1016/0022-460x(90)90525-5>) | 1990 · Journal of Sound and Vibration | 移 | — | 综述/教材/实验论文，无配套代码；通用实现见其他条目 |
| 97 | [Active noise control systems](<https://doi.org/10.1049/ip-a-1.1987.0074>) | 1987 · IEE Proceedings A Physical Scienc… | 移 | — | 综述/教材/实验论文，无配套代码；通用实现见其他条目 |
| 98 | [Active adaptive sound control in a duct: A computer simulation](<https://doi.org/10.1121/1.386908>) | 1981 · The Journal of the Acoustical Soc… | 移 | [复现](<https://github.com/matejfroebe/duct-ANC>) | 通用/前馈 ANC；第三方实现（算法级） |
| 99 | [An analysis of multiple correlation cancellation loops with a filter in the auxiliary path](<https://doi.org/10.1109/tassp.1980.1163430>) | 1980 · IEEE Transactions on Acoustics, S… | 移 | [复现](<https://github.com/markostam/active-noise-cancellation>) | 通用/前馈 ANC；第三方实现（算法级） |
| 100 | [Adaptive noise cancelling: Principles and applications](<https://doi.org/10.1109/proc.1975.10036>) | 1975 · Proceedings of the IEEE | 移 | [复现](<https://github.com/LiXirong/AdaptiveFilterandActiveNoiseCancellation>) | Widrow 自适应噪声抵消奠基论文；LMS/NLMS/RLS 教学实现可复现 |
