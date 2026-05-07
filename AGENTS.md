# local-ai-radio Agent Rules

这是一个本地 AI 私人电台项目。

## 项目结构

- 前端目录：apps/web
- 后端目录：apps/api
- 播放器主组件：apps/web/src/components/RadioPlayer.tsx
- 首页入口：apps/web/src/app/page.tsx
- 前端端口：3000
- 后端端口：4000

## 启动命令

- 安装依赖：npm install
- 启动后端：npm run dev:api
- 启动前端：npm run dev:web
- 当前 npm run dev 可能只启动前端，修改前需要先检查 package.json

## 通用规则

- 每次任务最多修改 1-3 个文件
- 修改前先说明计划
- 完成后说明修改了哪些文件
- 完成后给出测试步骤
- 不要大范围重构
- 不要接真实第三方 API，除非任务明确要求
- 不要随意新增依赖
- 不要修改本地音频文件
- 不要修改数据库文件
- 不要扫描大目录和缓存目录

## 任务边界

- 前端任务默认只改 apps/web
- 后端任务默认只改 apps/api
- 播放器任务优先检查 apps/web/src/components/RadioPlayer.tsx
- 接口任务优先检查 apps/api/src/server.js
- 音频任务先使用本地 mock 音频，不接真实音乐平台

## 禁止扫描或修改

- node_modules
- .next
- apps/web/.next
- audio/generated
- data/*.sqlite
- data/*.sqlite-*
- driver-backup
- .env
- .env.*
- *.log
