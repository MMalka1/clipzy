import { getProviders } from "@/lib/providers";

export function GET() {
  return Response.json(getProviders());
}
