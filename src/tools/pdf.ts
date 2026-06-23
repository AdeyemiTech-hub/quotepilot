// Quote PDF renderer (pdf-lib). Produces a single-page, professional quote and
// records its public URL on the quotes row.
import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { pool } from "../lib/db";

export interface QuoteForPdf {
  version: number;
  line_items: {
    label: string;
    description?: string;
    qty: number;
    unit_price: number | string;
    line_total: number | string;
  }[];
  subtotal: number | string;
  total: number | string;
  assumptions?: string[];
  estimated_days?: number;
  currency?: string;
}

const BRAND = "QuotePilot";
const BRAND_SUB = "AdeyemiTech · Freelance Development";

const INK = rgb(0.09, 0.11, 0.16);
const MUTED = rgb(0.42, 0.46, 0.54);
const LINE = rgb(0.8, 0.83, 0.88);
const ACCENT = rgb(0.0, 0.55, 0.6);

const money = (n: number | string) =>
  `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > maxWidth && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export async function renderQuotePdf(
  inquiry: { id: string },
  client: { name?: string | null; email?: string | null },
  quote: QuoteForPdf
): Promise<{ filePath: string; publicUrl: string }> {
  const doc = await PDFDocument.create();
  const page: PDFPage = doc.addPage([595.28, 841.89]); // A4
  const { width, height } = page.getSize();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const M = 50;
  const right = width - M;
  let y = height - 56;

  const text = (s: string, x: number, yy: number, size: number, f = font, color = INK) =>
    page.drawText(s, { x, y: yy, size, font: f, color });
  const rtext = (s: string, xRight: number, yy: number, size: number, f = font, color = INK) =>
    page.drawText(s, { x: xRight - f.widthOfTextAtSize(s, size), y: yy, size, font: f, color });

  // ── Header ──
  text(BRAND, M, y, 24, bold, INK);
  text(BRAND_SUB, M, y - 16, 9, font, MUTED);
  const dateStr = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  rtext("QUOTE", right, y, 11, bold, ACCENT);
  rtext(dateStr, right, y - 15, 9, font, MUTED);
  y -= 38;
  page.drawLine({ start: { x: M, y }, end: { x: right, y }, thickness: 1, color: LINE });
  y -= 28;

  // ── Client block ──
  text("PREPARED FOR", M, y, 8, bold, MUTED);
  text(client.name || "Valued client", M, y - 15, 13, bold, INK);
  if (client.email) text(client.email, M, y - 30, 9, font, MUTED);
  rtext(`Version ${quote.version}`, right, y, 9, font, MUTED);
  y -= 52;

  // ── Table header ──
  const colQty = 350;
  const colUnit = 440;
  const descWidth = colQty - M - 14;
  text("DELIVERABLE", M, y, 8, bold, MUTED);
  rtext("QTY", colQty, y, 8, bold, MUTED);
  rtext("UNIT", colUnit, y, 8, bold, MUTED);
  rtext("TOTAL", right, y, 8, bold, MUTED);
  y -= 8;
  page.drawLine({ start: { x: M, y }, end: { x: right, y }, thickness: 0.75, color: LINE });
  y -= 18;

  // ── Line items ──
  for (const li of quote.line_items) {
    const rowTop = y;
    text(li.label, M, rowTop, 11, bold, INK);
    rtext(String(li.qty), colQty, rowTop, 10, font, INK);
    rtext(money(li.unit_price), colUnit, rowTop, 10, font, INK);
    rtext(money(li.line_total), right, rowTop, 10, font, INK);
    y -= 14;
    if (li.description) {
      for (const ln of wrap(li.description, font, 8.5, descWidth)) {
        text(ln, M, y, 8.5, font, MUTED);
        y -= 11;
      }
    }
    y -= 8;
  }

  // ── Totals ──
  y -= 4;
  page.drawLine({ start: { x: colQty - 20, y }, end: { x: right, y }, thickness: 0.75, color: LINE });
  y -= 18;
  rtext("Subtotal", colUnit, y, 10, font, MUTED);
  rtext(money(quote.subtotal), right, y, 10, font, INK);
  y -= 18;
  rtext("Total", colUnit, y, 12, bold, INK);
  rtext(money(quote.total), right, y, 12, bold, ACCENT);
  if (quote.estimated_days != null) {
    y -= 16;
    rtext(`Estimated delivery: ~${quote.estimated_days} working days`, right, y, 8.5, font, MUTED);
  }
  y -= 30;

  // ── Assumptions ──
  if (quote.assumptions && quote.assumptions.length > 0) {
    text("ASSUMPTIONS", M, y, 8, bold, MUTED);
    y -= 14;
    for (const a of quote.assumptions) {
      for (const [i, ln] of wrap(a, font, 8, right - M - 12).entries()) {
        text(i === 0 ? "•" : " ", M, y, 8, font, MUTED);
        text(ln, M + 12, y, 8, font, MUTED);
        y -= 11;
      }
    }
  }

  // ── Footer ──
  page.drawLine({ start: { x: M, y: 64 }, end: { x: right, y: 64 }, thickness: 0.75, color: LINE });
  text("Quote valid for 14 days.", M, 50, 9, font, MUTED);
  rtext(BRAND, right, 50, 9, bold, MUTED);

  // ── Save ──
  const dir = path.join(process.cwd(), "files", "quotes");
  await mkdir(dir, { recursive: true });
  const fileName = `quote-${inquiry.id}-v${quote.version}.pdf`;
  const filePath = path.join(dir, fileName);
  await writeFile(filePath, await doc.save());

  const base = (process.env.PUBLIC_BASE_URL || "http://localhost:3001").replace(/\/+$/, "");
  const publicUrl = `${base}/files/quotes/${fileName}`;

  await pool.query(`UPDATE quotes SET pdf_url = $1 WHERE inquiry_id = $2 AND version = $3`, [
    publicUrl,
    inquiry.id,
    quote.version,
  ]);

  return { filePath, publicUrl };
}
