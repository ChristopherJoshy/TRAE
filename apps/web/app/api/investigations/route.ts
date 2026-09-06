import { NextResponse } from "next/server";
import { listStored, runFullInvestigation } from "@trace/shared";
import { ensureServer, fixtureDir, liveEnv, serverMode } from "@/lib/server";
import { CreateInvestigationSchema, assertFetchableUrl, fetchImageBytes } from "@/lib/validate";

export async function GET() {
  ensureServer();
  return NextResponse.json({ investigations: listStored() });
}

export async function POST(req: Request) {
  ensureServer();
  const mode = serverMode();
  try {
    const contentType = req.headers.get("content-type") ?? "";
    let bytes: Uint8Array | null = null;
    let claimedMime: string | undefined;
    let label: string | undefined;
    let demoCaseId: string | undefined;
    let imageUrl: string | undefined;
    let provider: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("image");
      label = strField(form.get("label")) ?? undefined;
      demoCaseId = strField(form.get("demoCaseId")) ?? undefined;
      provider = strField(form.get("provider")) ?? undefined;
      imageUrl = strField(form.get("imageUrl")) ?? undefined;
      if (file instanceof File) {
        claimedMime = file.type || undefined;
        bytes = new Uint8Array(await file.arrayBuffer());
      }
    } else {
      const body = CreateInvestigationSchema.parse(await req.json());
      label = body.label;
      demoCaseId = body.demoCaseId;
      imageUrl = body.imageUrl;
      provider = body.provider;
    }

    if (!bytes && imageUrl) {
      const u = await assertFetchableUrl(imageUrl);
      const fetched = await fetchImageBytes(u);
      bytes = fetched.bytes;
      claimedMime = fetched.mime;
    }
    if (!bytes) {
      return NextResponse.json(
        { error: "No image provided. Upload a file as `image` or supply `imageUrl`." },
        { status: 400 },
      );
    }

    const providerName =
      provider ?? (mode === "live" ? (process.env["REVERSE_SEARCH_PROVIDER"] ?? "tineye") : "demo");
    if (mode === "live" && providerName === "serpapi" && !imageUrl) {
      return NextResponse.json(
        { error: "serpapi Google Lens needs a public `imageUrl`; direct byte upload is unsupported by that endpoint." },
        { status: 400 },
      );
    }

    const stored = await runFullInvestigation(bytes, claimedMime, {
      mode,
      providerName,
      demoCaseId,
      label,
      imageUrl: imageUrl ?? null,
      liveEnv: liveEnv(),
      fixtureDir: fixtureDir(),
    });
    return NextResponse.json(stored, { status: 201 });
  } catch (e) {
    const code = (e as { code?: string }).code;
    const status =
      code === "private-target" || code === "bad-scheme" || code === "bad-url" ? 403
      : code === "fetch-failed" || code === "dns-failed" || code === "not-an-image" ? 422
      : code && /empty|format|large|small|mime|corrupt|webp|decode|bomb/.test(code) ? 422
      : 400;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Investigation failed.", code: code ?? "bad-request" },
      { status },
    );
  }
}

function strField(v: FormDataEntryValue | null): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}
