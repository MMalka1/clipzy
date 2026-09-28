import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";
import { terms } from "@/lib/legal";

export const metadata: Metadata = { title: `${terms.title} — Clipzy` };

export default function TermsPage() {
  return <LegalPage doc={terms} other="privacy" />;
}
