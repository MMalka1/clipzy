import "server-only";

/** Отправка писем. Пока SMTP не настроен — письмо печатается в консоль сервера (удобно для разработки). */
export async function sendMail(to: string, subject: string, text: string, link?: string) {
  const host = process.env.SMTP_HOST;
  if (!host) {
    if (process.env.VERCEL) {
      // на сервере логи видят не только вы — ссылку с токеном туда не пишем
      console.warn(`[mail] SMTP не настроен — письмо «${subject}» не отправлено`);
      return;
    }
    console.log(`\n📧 Письмо для ${to}\n   Тема: ${subject}\n   ${text}${link ? `\n   Ссылка: ${link}` : ""}\n`);
    return;
  }
  const nodemailer = await import("nodemailer");
  const transport = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 465),
    secure: Number(process.env.SMTP_PORT || 465) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#111">
      <p style="font-size:22px;font-weight:800;margin:0 0 16px">clip<span style="color:#e0b800">zy</span></p>
      <p style="font-size:16px;line-height:1.5">${text}</p>
      ${link ? `<p><a href="${link}" style="display:inline-block;background:#ffd60a;color:#111;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:700">${subject}</a></p>` : ""}
    </div>`;
  await transport.sendMail({ from: process.env.MAIL_FROM, to, subject, text: link ? `${text}\n${link}` : text, html });
}
