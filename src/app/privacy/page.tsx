import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";
import { privacy } from "@/lib/legal";

export const metadata: Metadata = { title: `${privacy.title} — Clipzy` };

export default function PrivacyPage() {
  return <LegalPage doc={privacy} other="terms" />;
}
