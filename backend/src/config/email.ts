import nodemailer from 'nodemailer';
import dotenv from 'dotenv';

dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

export const sendVerificationCode = async (email: string, code: string) => {
  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: 'ZJZAI建筑项目管理平台 - 验证码',
    html: `
      <div style="padding: 20px; font-family: Arial, sans-serif;">
        <h2>验证码登录</h2>
        <p>您的验证码是：</p>
        <h1 style="color: #667eea; font-size: 32px; letter-spacing: 5px;">${code}</h1>
        <p>验证码有效期为5分钟，请勿泄露给他人。</p>
        <p>如果这不是您的操作，请忽略此邮件。</p>
        <hr style="margin: 20px 0; border: none; border-top: 1px solid #eee;">
        <p style="color: #999; font-size: 12px;">ZJZAI建筑项目全生命周期管理平台</p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

export default transporter;
