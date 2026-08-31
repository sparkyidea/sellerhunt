import { env } from "@dashseller/env/server";
import type { ReactNode } from "react";
import { Resend } from "resend";

const resend = new Resend(env.RESEND_API_KEY);

interface EmailParams {
  react: ReactNode;
  subject: string;
  to: string;
}

export async function sendEmail({ to, subject, react }: EmailParams) {
  const { data, error } = await resend.emails.send({
    from: env.EMAIL_FROM,
    to: [to],
    subject,
    react,
  });

  if (error) {
    throw new Error(`Failed to send email to ${to}: ${error.message}`);
  }

  return data;
}
