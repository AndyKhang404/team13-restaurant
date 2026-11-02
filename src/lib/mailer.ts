import nodemailer, { type SendMailOptions, type Transporter } from 'nodemailer';
import { env } from '../config/env.js';

export class MailerNotConfiguredError extends Error {
  constructor() {
    super('SMTP_HOST is not configured');
    this.name = 'MailerNotConfiguredError';
  }
}

export class MailDeliveryError extends Error {
  constructor() {
    super('EMAIL_DELIVERY_FAILED');
    this.name = 'MailDeliveryError';
  }
}

let transport: Transporter | null = null;

function getTransport(): Transporter {
  if (!env.SMTP_HOST) throw new MailerNotConfiguredError();
  if (!transport) {
    transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return transport;
}

async function deliver(message: SendMailOptions): Promise<void> {
  try {
    await getTransport().sendMail({ from: env.SMTP_FROM, ...message });
  } catch (error) {
    // Never include the recipient, OTP or reset URL in logs.
    if (error instanceof MailerNotConfiguredError) throw error;
    throw new MailDeliveryError();
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export async function sendActivationOtpEmail(
  to: string,
  otp: string,
  opts: { name?: string | null; ttlMinutes: number },
): Promise<void> {
  const greeting = opts.name ? `Xin chào ${escapeHtml(opts.name)},` : 'Xin chào,';
  const text = [
    greeting,
    '',
    `Mã OTP kích hoạt tài khoản Team13 Restaurant của bạn là: ${otp}`,
    `Mã có hiệu lực trong ${opts.ttlMinutes} phút và chỉ dùng được một lần.`,
    'Nếu bạn không đăng ký tài khoản này, hãy bỏ qua email.',
  ].join('\n');
  const html = `
    <p>${greeting}</p>
    <p>Mã OTP kích hoạt tài khoản Team13 Restaurant của bạn là:</p>
    <p style="font-size:28px;letter-spacing:6px;font-weight:700">${otp}</p>
    <p>Mã có hiệu lực trong ${opts.ttlMinutes} phút và chỉ dùng được một lần.</p>
    <p>Nếu bạn không đăng ký tài khoản này, hãy bỏ qua email.</p>
  `;
  await deliver({ to, subject: 'Kích hoạt tài khoản Team13 Restaurant', text, html });
}

export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
  opts: { ttlMinutes: number },
): Promise<void> {
  const text = [
    'Xin chào,',
    '',
    'Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản Team13 Restaurant.',
    `Mở liên kết sau để đặt mật khẩu mới: ${resetUrl}`,
    `Liên kết có hiệu lực trong ${opts.ttlMinutes} phút và chỉ dùng được một lần.`,
    'Nếu bạn không yêu cầu, hãy bỏ qua email.',
  ].join('\n');
  const html = `
    <p>Xin chào,</p>
    <p>Bạn đã yêu cầu đặt lại mật khẩu cho tài khoản Team13 Restaurant.</p>
    <p><a href="${escapeHtml(resetUrl)}">Đặt mật khẩu mới</a></p>
    <p>Liên kết có hiệu lực trong ${opts.ttlMinutes} phút và chỉ dùng được một lần.</p>
    <p>Nếu bạn không yêu cầu, hãy bỏ qua email.</p>
  `;
  await deliver({ to, subject: 'Đặt lại mật khẩu Team13 Restaurant', text, html });
}

/**
 * Sent after a successful reset (deck slide 46). Never contains the password;
 * it only informs the owner that the password changed and sessions were revoked.
 */
export async function sendPasswordChangedEmail(to: string): Promise<void> {
  const text = [
    'Xin chào,',
    '',
    'Mật khẩu tài khoản Team13 Restaurant của bạn vừa được đặt lại thành công.',
    'Tất cả phiên đăng nhập cũ đã bị hủy. Nếu bạn cần truy cập, hãy đăng nhập lại.',
    'Nếu bạn không thực hiện thay đổi này, hãy liên hệ ngay với quản trị viên.',
  ].join('\n');
  const html = `
    <p>Xin chào,</p>
    <p>Mật khẩu tài khoản Team13 Restaurant của bạn vừa được đặt lại thành công.</p>
    <p>Tất cả phiên đăng nhập cũ đã bị hủy. Nếu bạn cần truy cập, hãy đăng nhập lại.</p>
    <p>Nếu bạn không thực hiện thay đổi này, hãy liên hệ ngay với quản trị viên.</p>
  `;
  await deliver({ to, subject: 'Mật khẩu đã được đặt lại — Team13 Restaurant', text, html });
}
