import http from 'node:http';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { createApp } from '../src/app.js';
import { registerFailedLogin, resetLoginAttempts } from '../src/auth/login-attempts.js';
import { createSession } from '../src/auth/session.js';
import { createResetToken, hashResetToken, resetTokenExpiry } from '../src/auth/password-reset.js';
import { prisma } from '../src/lib/prisma.js';

const PORT = 3456;
const BASE_URL = `http://localhost:${PORT}`;
const SCREENSHOT_DIR = path.resolve('docs/block8/evidence/screenshots');

async function main() {
  console.log('🚀 Starting test server on port', PORT);
  const app = createApp();

  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(PORT, resolve));
  console.log(`✓ Server running at ${BASE_URL}`);

  console.log('🌐 Launching Chromium...');
  const browser = await puppeteer.launch({
    executablePath: '/usr/bin/chromium-browser',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    defaultViewport: { width: 1280, height: 800 },
  });

  const page = await browser.newPage();

  try {
    // 1. Register page
    console.log('📸 1. Capturing Register page...');
    await page.goto(`${BASE_URL}/register`, { waitUntil: 'networkidle0' });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01_register_form.png') });

    // 2. Check Email page (via resend click on activate)
    console.log('📸 2. Capturing Check Email page...');
    await page.goto(`${BASE_URL}/activate?email=khachhang%40example.com`, { waitUntil: 'networkidle0' });
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
      page.click('.auth-alt button[type="submit"]'),
    ]);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '02_check_email_page.png') });

    // 3. Activate page
    console.log('📸 3. Capturing Activate page...');
    await page.goto(`${BASE_URL}/activate?email=khachhang%40example.com`, { waitUntil: 'networkidle0' });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '03_activate_form.png') });

    // 4. Login clean
    console.log('📸 4. Capturing Login page...');
    resetLoginAttempts();
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0' });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04_login_clean.png') });

    // 5. Login generic error
    console.log('📸 5. Capturing Login generic error...');
    await page.type('input[name="email"]', 'wrong@example.com');
    await page.type('input[name="password"]', 'WrongPassword123');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
      page.click('button[type="submit"]'),
    ]);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '05_login_failed_generic.png') });

    // 6. Login with CAPTCHA required
    console.log('📸 6. Capturing Login with CAPTCHA required...');
    registerFailedLogin('brute@target.com');
    registerFailedLogin('brute@target.com');
    registerFailedLogin('brute@target.com');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0' });
    await page.type('input[name="email"]', 'brute@target.com');
    await page.type('input[name="password"]', 'wrongpass');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
      page.click('button[type="submit"]'),
    ]);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '06_login_captcha_required.png') });

    // 7. Login 429 lockout
    console.log('📸 7. Capturing Login 429 lockout...');
    for (let i = 0; i < 10; i++) {
      registerFailedLogin('lockout@target.com');
    }
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0' });
    await page.type('input[name="email"]', 'lockout@target.com');
    await page.type('input[name="password"]', 'anypass');
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0' }),
      page.click('button[type="submit"]'),
    ]);
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '07_login_rate_limited_429.png') });

    // 8. Authenticated Dashboard (using real session)
    console.log('📸 8. Capturing Authenticated Admin Dashboard...');
    const adminUser = await prisma.profile.findFirst({ where: { role: 'ADMIN' } });
    if (adminUser) {
      const { sid } = await createSession(adminUser.id);
      await page.setCookie({
        name: 'sid',
        value: sid,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      });
      await page.goto(`${BASE_URL}/admin/dishes`, { waitUntil: 'networkidle0' });
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08_admin_dashboard_authenticated.png') });

      console.log('📸 8b. Capturing Admin Users page...');
      await page.goto(`${BASE_URL}/admin/users`, { waitUntil: 'networkidle0' });
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '08b_admin_users_page.png') });
    }

    // 9. Viewer session & 403 Forbidden check
    console.log('📸 9. Capturing Viewer Session & RBAC 403...');
    const viewerUser = await prisma.profile.findFirst({ where: { role: 'VIEWER' } });
    if (viewerUser) {
      const { sid: viewerSid } = await createSession(viewerUser.id);
      await page.deleteCookie({ name: 'sid', domain: 'localhost' });
      await page.setCookie({
        name: 'sid',
        value: viewerSid,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        sameSite: 'Lax',
      });
      await page.goto(`${BASE_URL}/admin/users`, { waitUntil: 'networkidle0' });
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '09_viewer_admin_users_403.png') });
    }

    // 10. Forgot Password page
    console.log('📸 10. Capturing Forgot Password page...');
    await page.deleteCookie({ name: 'sid', domain: 'localhost' });
    await page.goto(`${BASE_URL}/forgot`, { waitUntil: 'networkidle0' });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '10_forgot_password_form.png') });

    // 11. Reset Password page (Valid token)
    console.log('📸 11. Capturing Valid Reset Password page...');
    if (adminUser) {
      const token = createResetToken();
      const tokenHash = hashResetToken(token);
      const row = await prisma.passwordReset.create({
        data: {
          userId: adminUser.id,
          email: adminUser.email,
          tokenHash,
          expiresAt: resetTokenExpiry(),
        },
      });

      await page.goto(`${BASE_URL}/reset?token=${encodeURIComponent(token)}`, { waitUntil: 'networkidle0' });
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, '11_reset_password_valid_form.png') });

      // Clean up test token
      await prisma.passwordReset.delete({ where: { id: row.id } });
    }

    // 12. Reset Password page (Invalid/Expired token)
    console.log('📸 12. Capturing Invalid/Expired Reset Password page...');
    await page.goto(`${BASE_URL}/reset?token=invalid-or-expired-token-demo`, { waitUntil: 'networkidle0' });
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '12_reset_password_invalid_token.png') });

    console.log('🎉 All screenshots generated and saved to docs/block8/evidence/screenshots!');
  } finally {
    await browser.close();
    server.close();
    console.log('✓ Browser and server stopped.');
  }
}

main().catch((err) => {
  console.error('Error generating screenshots:', err);
  process.exit(1);
});
