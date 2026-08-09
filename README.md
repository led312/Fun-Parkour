# Kinetic Bounce - KID-RUN!

一个用**身体动作控制**的网页跑酷小游戏：通过摄像头实时识别姿态（跳跃、下蹲、左右移动、开合跳），操控卡通角色躲避障碍、收集金币。无需手柄键盘，站起来就能玩（也保留键盘操作作为后备）。

## 玩法

| 动作 | 效果 |
| --- | --- |
| 跳跃 | 跳过障碍 |
| 下蹲 | 滑铲躲避高处障碍 |
| 左右移动 | 切换跑道（共三条） |
| 开合跳 | 触发护盾 |

游戏流程：登录 → 大厅 → 姿态校准（站定 1 秒建立基线）→ 跑酷 → 结算 / 高分庆祝，另有商店系统（金币兑换角色皮肤）和暂停菜单。

## 技术栈

- **前端**：React 19 + TypeScript + Vite 6 + Tailwind CSS 4 + Motion（动画）+ lucide-react（图标）
- **姿态识别**：YOLO26n-pose（ONNX 模型）在浏览器端通过 `onnxruntime-web`（WASM 后端）本地推理，输出 17 个 COCO 关键点；`src/hooks/usePoseControl.ts` 中的手势状态机将关键点序列分类为跳跃 / 下蹲 / 换道 / 护盾等游戏指令
- **后端**：Express 轻量服务（`server.ts`），负责用户注册登录（手机号 + 盐哈希密码），数据存于 `data/user.json`
- **AI 能力**：`@google/genai`（Gemini API，需配置 `GEMINI_API_KEY`）

## 快速开始

前置要求：Node.js 18+；运行时需要摄像头权限。

```bash
# 安装依赖
npm install

# 一条命令同时启动前端（:3000）和后端 API（:3001）
npm run dev
```

打开 http://localhost:3000 ，允许摄像头权限后即可游玩。前端通过 Vite 代理将 `/api` 请求转发到后端。

如需单独启动：前端 `npm run dev:web`，后端 `npm run server`。

环境变量（参考 `.env.example`）：

- `GEMINI_API_KEY` — Gemini API 调用所需
- `APP_URL` — 部署后的应用地址

## 常用命令

```bash
npm run build     # 构建到 dist/
npm run preview   # 预览构建产物
npm run lint      # TypeScript 类型检查
npm run clean     # 清理 dist/ 和 server.js
```

## 姿态模型

- 运行时模型：`public/models/yolo26n-pose.onnx`（随前端静态分发，浏览器本地推理，不上传视频流）
- 导出脚本：`scripts/export_pose_model.py` 将 `yolo26n-pose.pt` 导出为 ONNX 格式（Python 环境见 `.venv-pose/`）

## 目录结构

```
src/
├── components/     # 登录、大厅、校准、游戏、结算、商店、暂停菜单等界面
├── hooks/
│   └── usePoseControl.ts   # 手势状态机：关键点 → 游戏指令
├── utils/
│   ├── poseDetector.ts     # YOLO ONNX 推理 + 关键点提取 + 骨架绘制
│   └── audio.ts            # 音效
└── App.tsx                  # 屏幕状态流转与用户数据管理
server.ts                    # Express 后端（用户认证）
scripts/export_pose_model.py # 模型导出脚本
```

## 隐私说明

摄像头画面仅在浏览器本地用于姿态推理，不会上传到服务器；服务器只保存注册所需的账号信息。
