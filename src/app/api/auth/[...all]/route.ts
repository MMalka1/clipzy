import { toNextJsHandler } from "better-auth/next-js";
import { auth, authReady } from "@/lib/auth";

const handler = toNextJsHandler(auth);

export async function GET(request: Request) {
  await authReady();
  return handler.GET(request);
}

export async function POST(request: Request) {
  await authReady();
  return handler.POST(request);
}
