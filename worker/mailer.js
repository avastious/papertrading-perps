// Sending email (one-time codes for verifying an address and resetting a password).
// Two ways, whichever is set up (see README > Email codes):
//   1. Cloudflare Email Service: a `send_email` binding called EMAIL in wrangler.jsonc (Workers Paid plan).
//   2. Resend (resend.com, free tier): a RESEND_API_KEY secret.
// Mail comes from MAIL_FROM (default no-reply@aureous.trade). With neither set up, mailerFor() returns
// null and the site falls back to Firebase's own emails (links instead of codes).
export function mailerFor(env) {
  const from = env.MAIL_FROM || "no-reply@aureous.trade", name = "Aureous";
  if (env.EMAIL && typeof env.EMAIL.send === "function") {
    return {kind: "cloudflare", async send({to, subject, text, html}) {
      await env.EMAIL.send({to, from: {email: from, name}, subject, text, html});
    }};
  }
  if (env.RESEND_API_KEY) {
    return {kind: "resend", async send({to, subject, text, html}) {
      const r = await fetch((env.RESEND_API_URL || "https://api.resend.com") + "/emails", {
        method: "POST",
        headers: {Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json"},
        body: JSON.stringify({from: `${name} <${from}>`, to: [to], subject, text, html}),
      });
      if (!r.ok) throw new Error(`Resend ${r.status}: ${(await r.text()).slice(0, 200)}`);
    }};
  }
  return null;
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"})[c]);

// The code email. `purpose` is "verify" or "reset".
export function codeEmail(code, purpose) {
  const what = purpose === "reset" ? "reset your Aureous password" : "confirm your email for Aureous";
  const subject = purpose === "reset" ? `${code} is your Aureous password reset code` : `${code} is your Aureous verification code`;
  const text = `Your code to ${what} is ${code}\n\nIt expires in 10 minutes. If you didn't ask for it, ignore this email: nothing changes without the code.\n\nAureous (paper trading) - https://aureous.trade`;
  const html = `<!doctype html><html><body style="margin:0;background:#0C0D10;font-family:Arial,Helvetica,sans-serif;color:#ECE8E1">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0C0D10;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:460px;background:#131418;border:1px solid #272A31;border-radius:10px;padding:28px">
<tr><td style="font-family:Georgia,'Times New Roman',serif;letter-spacing:4px;font-size:20px;color:#ECE8E1">AUREOUS</td></tr>
<tr><td style="padding-top:18px;font-size:15px;line-height:1.5;color:#D6D2CA">Your code to ${esc(what)}:</td></tr>
<tr><td style="padding:16px 0;font-size:34px;font-weight:bold;letter-spacing:8px;color:#E2BE77">${esc(code)}</td></tr>
<tr><td style="font-size:13px;line-height:1.5;color:#9B978F">It expires in 10 minutes. If you didn't ask for it, ignore this email: nothing changes without the code.</td></tr>
<tr><td style="padding-top:22px;font-size:12px;color:#67645E">Aureous, paper trading on live Hyperliquid prices. <a href="https://aureous.trade" style="color:#9B978F">aureous.trade</a></td></tr>
</table></td></tr></table></body></html>`;
  return {subject, text, html};
}
