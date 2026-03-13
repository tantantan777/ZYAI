import { sendVerificationCode } from './config/email';
import { verificationCodeStore } from './services/verificationCodeStore';

async function testSendCode() {
  try {
    const testEmail = '754746406@qq.com'; // 使用配置的QQ邮箱自己测试
    const testCode = '123456';

    console.log('正在测试验证码发送...');
    console.log('收件邮箱:', testEmail);
    console.log('验证码:', testCode);

    console.log('\n1. 测试 Redis 写入...');
    await verificationCodeStore.initialize();
    await verificationCodeStore.saveCode(testEmail, testCode, 300, 60);
    console.log('✓ Redis 写入成功');

    // 测试邮件发送
    console.log('\n2. 测试邮件发送...');
    await sendVerificationCode(testEmail, testCode);
    console.log('✓ 邮件发送成功');

    console.log('\n✓ 验证码发送测试完成，请检查邮箱');
    process.exit(0);
  } catch (error) {
    console.error('\n✗ 测试失败:', error);
    process.exit(1);
  }
}

testSendCode();
