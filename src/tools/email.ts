// Outbound email (Resend). The agent's only channel to actually reach a
// client — keep working with no key configured (stub mode) so the rest of
// the pipeline never blocks on a missing credential.
import "dotenv/config";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Resend } from "resend";

export interface SendEmailParams {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachmentPath?: string;
}

export interface SendEmailResult {
  stubbed?: boolean;
  id?: string;
}

export async function sendEmail({
  to,
  subject,
  text,
  html,
  attachmentPath,
}: SendEmailParams): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log(`[email stub] would send: ${subject} to ${to}`);
    return { stubbed: true };
  }

  const resend = new Resend(apiKey);
  const from = process.env.FROM_EMAIL || "QuotePilot <onboarding@resend.dev>";

  const attachments = attachmentPath
    ? [{ filename: path.basename(attachmentPath), content: await readFile(attachmentPath) }]
    : undefined;

  const { data, error } = await resend.emails.send({
    from,
    to,
    subject,
    text,
    html,
    attachments,
  });

  if (error) throw new Error(`sendEmail failed: ${error.message}`);
  return { id: data?.id };
}
