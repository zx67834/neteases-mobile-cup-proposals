# 智能课堂教学平台

> 移动杯 · 网易赛题参赛方案。基于开源项目 [OpenMAIC](https://github.com/THU-MAIC/OpenMAIC) 二次开发，面向「教师备课授课」与「学生上课互动」的智能课堂教学平台。

## 项目简介

本平台以开源多智能体课程生成项目 OpenMAIC 为底座，在其「一键生成课程 / 互动课堂」能力之上，围绕真实教学场景补齐教师端工作台与学生端课堂体验，形成一套可演示、可评审的智能课堂教学方案。

## 对赛题的理解

赛题要求围绕教学场景，构建一套连接教师与学生的智能教学平台。我们将其拆解为两条主线：

- **教师端**：解决「备课与授课」的效率问题——快速生成与修改课件、维护教案与讲义、掌握课堂互动。
- **学生端**：解决「听课与答疑」的体验问题——以课件为主视角上课、随时提问、完成练习与打卡。

两条主线共享同一套课程数据，通过统一的教师 / 学生身份区分视图与权限。

## 功能方案

### 教师端

**教学工作台**

- 一键生成与修改 PPT：基于 OpenMAIC 实现课程 PPT 一键生成，并在侧边栏提供 AI 辅助修改与优化。
- 小测题目修改：在生成 PPT 的基础上，直接修改不满意的小测题目。
- 保留互动课堂特性：延续弹幕、评论、举手等课堂互动能力，区别于普通演示文稿。
- 侧边栏教学讲义：工作台侧边栏增加教学讲义区域。

**教案辅助工具**

- 设计辅助工具：教案设计辅助，与教学讲义功能联动。
- 检查工具：辅助教案与作业检查。
- OCR 识别：暂缓独立开发，后续可接入百度 OCR 免费额度。

### 学生端

**上课与互动**

- PPT 主视角：以 PPT 为主视角观看课程，无法看到教师教案内容。
- 网课弹幕互动：暂缓，后续视情况推进。

**答疑与做题**

- 独立 AI 答疑模块：支持拖拽课程文件进行针对性提问。
- 选择题做题模块：类似 PTA 的做题体验，页面侧边栏常驻对话框，随时提问。

**日常打卡与签到**

- 签到打卡：支持上课签到与日常打卡，提升学生自觉性。

## 已实现功能

### 本次二次开发（智能课堂定制）

- **学生端课堂页** `app/student/classroom/[id]`：学生以 PPT 为主视角观看课程，自动隐藏教师讲义。
- **课堂实时提问栏** `components/classroom/LiveQuestionBar.tsx`：学生匿名提问、教师标记「已回复」；基于 `BroadcastChannel` + `localStorage` 实现跨标签页实时同步。
- **教师 AI 改稿面板** `components/chat/teacher-ai-edit-panel.tsx`：在聊天区新增「AI 改稿」标签页，内置「精简当前页 / 补充校园案例 / 调整版式 / 补充课堂小结」等快捷指令，直接编辑当前页。
- **教师 / 学生双身份** `lib/classroom/audience.ts`：统一以 `teacher` / `student` 区分视图与操作权限。

### 基于 OpenMAIC 的能力

- 一句话或一份材料即可一键生成整门课程（PPT、小测、互动、PBL、图片、视频、配音）。
- 小测题型：单选、多选、简答，支持难度与题量配置。
- 多智能体 AI 工作台：规划课程、逐页生成与修改、会话材料（文档 / 音频 / 视频 / 网页）。
- 24 个内置技能与课程工具，支持 `.pptx` 导入。
- 模型 / 媒体 / 检索 / 存储提供商中立，可自定义接入。

## 技术栈

- 框架：Next.js 16（App Router、Turbopack）、React 19
- 语言：TypeScript
- 样式：Tailwind CSS 4
- 状态：zustand、motion
- 智能体：LangGraph、Vercel AI SDK（多模型提供商）
- 包管理：pnpm（monorepo / workspace）

## 快速开始

### 环境要求

- Node.js >= 22.19.0
- pnpm（可通过 Corepack 启用：`corepack enable`）

### 安装与启动

```bash
# 1. 安装依赖（postinstall 会自动构建内部 packages）
pnpm install

# 2. 配置环境变量
# 复制 .env.example 为 .env.local，至少填入一个模型提供商的 API Key
# 例如 DeepSeek：
#   DEEPSEEK_API_KEY=sk-xxx

# 3. 启动开发服务器
pnpm dev -- -p 3010
```

浏览器访问 <http://127.0.0.1:3010>。

> 端口 3010 用于避开与本地其他服务（如 Open WebUI 的 3000）冲突，可按需调整。

### 账号与模型配置

配置 `DATABASE_URL` 后，教师和学生可在登录页创建账号，并在头像菜单的「账号设置」中修改登录账号、显示名称、真实姓名和密码。修改密码会让其他设备的登录失效。

测试阶段可在服务器的 `.env.local` 中设置 `DEEPSEEK_API_KEY`；新教师账号默认选择 DeepSeek V4 Pro，新学生账号默认选择 DeepSeek V4 Flash，均可使用该测试 Key。每个账号也可以在「账号设置」的 OpenMAIC 风格模型面板中选择模型、测试连接并保存自己的 DeepSeek Key；服务端会加密后存入 PostgreSQL 的 `campus_user_model_settings`，页面只显示是否已配置，不回传 Key。

保存个人 Key 还需要设置 `CAMPUS_CREDENTIAL_ENCRYPTION_KEY`（64 位十六进制随机值）。部署迁移时必须保留此值，否则已有个人 Key 无法解密。数据库结构可用 `DATABASE_URL=... pnpm exec tsx scripts/migrate-campus-schema.ts` 更新；该命令只创建或扩展表结构，不导入账号、课程或密钥数据。

## 项目结构

```text
app/
  classroom/[id]/                # 教师端课堂页
  student/classroom/[id]/        # 学生端课堂页
  workbench/                     # AI 工作台
  generation-preview/            # 课程生成预览
components/
  classroom/LiveQuestionBar.tsx  # 课堂实时提问栏
  chat/teacher-ai-edit-panel.tsx # 教师 AI 改稿面板
lib/
  classroom/audience.ts          # 教师 / 学生身份类型
  i18n/                          # 国际化（默认 zh-CN）
packages/                        # 内部包：@openmaic/*、mathml2omml、pptxgenjs 等
skills/                          # 内置技能
```

## 团队分工

项目团队共 18 人。当前由金田负责教师端功能初步搭建，后续倪路奇介入共同开发。

## 待办事项

- [ ] 搭建 Gitee 代码仓库并拉入成员
- [ ] 初步搭建教师端功能，完成后通知其他成员介入

## 开源致谢

本项目参考并基于开源项目 [OpenMAIC](https://github.com/THU-MAIC/OpenMAIC)（MIT License）二次开发，在此向原项目作者与社区致谢。
