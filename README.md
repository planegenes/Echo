# 回响 Echo

一个基于主动回想（Active Recall）学习法的 PWA 题库与测验应用。离线可用、可安装到桌面、自带题库管理与导入导出。

## 功能

### 测验模式

- **配对测验** — 左右两列点击匹配，选对自动开新回合并避开上一轮题目；选错短暂红色提示后恢复
- **单选匹配** — 给左列题目在右列候选中选答案，支持两个方向出题
- **默写测验** — 看配对一侧内容，输入另一侧内容（多项任填一项即可），支持答错重试
- **选词填空** — 从候选区拖动选项到原文空白处，支持选项在空格间反复移动或拖回候选区
- **输入填空** — 键盘输入答案，可选接入 AI 模型自动评判

### 题库管理

- 统一的题库页面，配对与文本分 Tab 管理
- 内置默认题库：34 组配对（首都/词汇/数学/化学/朝代）+ 30 段填空文本（地理/历史/数学/物理/化学/生物/英语）
- 支持配对与文本的增删改查
- 一键导入/导出 JSON 快照（包含配对 + 文本 + 统计数据）

### 其他

- 离线优先：IndexedDB 本地存储，无需联网
- PWA：可安装到桌面/手机主屏，独立窗口运行
- 暗色模式：跟随系统或手动切换
- 学习统计：配对题目带权重抽样，错过的题目更可能出现
- 数学公式：原文支持 LaTeX 语法（通过 KaTeX 渲染）

## 技术栈

- **React 19** + **TypeScript**（strict 模式）
- **Vite 8** 构建
- **Tailwind CSS v4** + shadcn 风格 UI 组件
- **Jotai** 状态管理
- **Dexie**（IndexedDB）持久化
- **@dnd-kit** 拖拽交互
- **KaTeX** 数学公式渲染
- **react-router-dom v7** 路由
- **Vitest** + **@testing-library/react** 单元测试
- **vite-plugin-pwa** 离线支持

## 快速开始

### 环境要求

- Node.js ≥ 20
- pnpm（推荐）或 npm/yarn

### 安装依赖

```bash
pnpm install
```

### 启动开发服务器

```bash
pnpm dev
```

访问 `http://localhost:5173`

### 跑单元测试

```bash
pnpm test
```

测试覆盖：
- 文本解析（加粗、空白、答案长度、Unicode、边界情况）
- 选词填空数据准备（去重、干扰项、buildBlankPad、唯一 id）

### 构建生产版本

```bash
pnpm build
```

构建产物在 `dist/`，可直接部署到任何静态文件服务器。

### 预览生产版本

```bash
pnpm preview
```

## 使用指南

### 首次使用

1. 进入「题库」页面，应用会自动加载默认题库（34 组配对 + 30 段填空文本）
2. 回到首页，选择测验模式开始

### 自定义题库

- 在「题库」→「配对」Tab 点「新增」添加配对题目
- 在「题库」→「文本」Tab 点「新增」添加填空文本
  - 文本中用 `*答案*` 标记空白，例如：`中国的首都是*北京*`
  - 用 `**加粗**` 标记加粗文本（不会被当作空白）
  - 支持 LaTeX：`$E = mc^2$` 或 `$$\int_0^1 x dx$$`

### 配置 AI 评判（可选）

输入填空模式默认用字符串严格相等判断。如需语义化评判（例如允许"北京"="北京市"）：

1. 进入「设置」页面
2. 配置 AI 接口的 endpoint、API Key、模型名称
3. 之后输入填空的「确认答案」会调用 AI 评判

### 导入导出

在「题库」页面底部：
- **导出**：把当前题库（配对 + 文本 + 统计）打包成 JSON 文件下载
- **导入**：选择 JSON 快照文件恢复题库

## 项目结构

```
src/
├── components/         # UI 组件
│   ├── ui/             # shadcn 风格基础组件
│   ├── ContentRenderer # KaTeX + 加粗渲染
│   ├── TextRenderer    # 文本 + 空白渲染
│   ├── MatchCard / ChoiceOption / BlankSlot / BlankInput / WordOption
│   ├── MatchGame / ChoiceGame / FillSelectGame / FillInputGame
│   ├── PairForm / PairList / TextForm / TextList
│   ├── ImportExportPanel
│   ├── SettingsForm
│   └── AppShell        # 顶部导航 + 主题切换
├── hooks/              # 业务 hooks
│   ├── useDeck / useTexts / useSettings
│   ├── useMatchEngine / useChoiceEngine
│   └── useFillSelectEngine / useFillInputEngine
├── lib/                # 核心库
│   ├── utils           # cn / uid / shuffle / sampleN
│   ├── db              # Dexie IndexedDB 封装
│   ├── parser          # 文本解析（空白、加粗、答案收集）
│   ├── ai              # AI 评判接口
│   └── importExport    # 快照导入导出
├── store/              # Jotai atoms
├── presets/            # 默认题库（pairs + texts）
├── pages/              # 路由页面
├── routes/             # 路由配置
└── test/               # 单元测试
```

## 路由

| 路径 | 说明 |
|---|---|
| `/` | 首页（4 个入口卡片） |
| `/match` | 配对测验 |
| `/choice` | 单选匹配 |
| `/dictation` | 默写测验 |
| `/texts` | 填空测验（随机抽取一段文本） |
| `/manage` | 题库管理（配对 + 文本） |
| `/settings` | 设置（主题、AI 配置） |
| `/fill/select/:textId` | 指定文本的选词填空 |
| `/fill/input/:textId` | 指定文本的输入填空 |

## 开发约定

- TypeScript strict 模式
- 路径别名 `@/*` → `src/*`
- Tailwind v4 语法（`@import`、`@plugin`、`@theme inline`、`@custom-variant`）
- shadcn 风格组件（cva + class-variance-authority）
- pnpm 包管理

## License

MIT
