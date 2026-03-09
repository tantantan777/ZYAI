# ZJZAI 建筑项目全生命周期管理平台

## 项目结构

```
ZYAI/
├── frontend/          # 前端项目 (React + TypeScript + Ant Design)
└── backend/           # 后端项目 (Node.js + Express + PostgreSQL)
```

## 后端配置

### 1. 安装 PostgreSQL

确保已安装 PostgreSQL 数据库。

### 2. 创建数据库

```bash
# 登录 PostgreSQL
psql -U postgres

# 创建数据库
CREATE DATABASE zjzai_db;
```

### 3. 配置环境变量

在 `backend` 目录下创建 `.env` 文件：

```bash
cd backend
cp .env.example .env
```

编辑 `.env` 文件，填入实际配置：

```env
# 数据库配置
DB_HOST=localhost
DB_PORT=5432
DB_NAME=zjzai_db
DB_USER=postgres
DB_PASSWORD=你的数据库密码

# JWT密钥（请修改为随机字符串）
JWT_SECRET=your_random_secret_key_here

# QQ邮箱配置
EMAIL_HOST=smtp.qq.com
EMAIL_PORT=587
EMAIL_USER=你的QQ邮箱@qq.com
EMAIL_PASSWORD=你的QQ邮箱授权码

# 服务器配置
PORT=3000
NODE_ENV=development

# 前端地址
FRONTEND_URL=http://localhost:5173
```

### 4. 获取 QQ 邮箱授权码

1. 登录 QQ 邮箱网页版
2. 进入"设置" -> "账户"
3. 找到"POP3/IMAP/SMTP/Exchange/CardDAV/CalDAV服务"
4. 开启"IMAP/SMTP服务"
5. 生成授权码，将授权码填入 `.env` 的 `EMAIL_PASSWORD`

### 5. 启动后端

```bash
cd backend
npm run dev
```

后端将运行在 http://localhost:3000

## 前端配置

### 启动前端

```bash
cd frontend
npm run dev
```

前端将运行在 http://localhost:5173

## 使用说明

1. 访问 http://localhost:5173/login
2. 输入邮箱地址
3. 点击"获取验证码"，验证码将发送到您的邮箱
4. 输入验证码
5. 勾选同意服务条款
6. 点击"登录/注册"

首次登录的用户会自动注册。

## API 接口

### 发送验证码
- POST `/api/auth/send-code`
- Body: `{ "email": "user@example.com" }`

### 登录/注册
- POST `/api/auth/login`
- Body: `{ "email": "user@example.com", "code": "123456", "remember": true }`

## 技术栈

### 前端
- React 18
- TypeScript
- Ant Design
- Ant Design Pro Components
- React Router
- Axios

### 后端
- Node.js
- Express
- TypeScript
- PostgreSQL
- Nodemailer (QQ邮箱)
- JWT
