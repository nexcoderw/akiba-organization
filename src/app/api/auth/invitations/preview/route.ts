import { boundedJson } from "@/lib/auth/backend.server";
import { isRecord } from "@/lib/auth/contracts";
import {
  isInvitationToken,
  parseInvitationPreview,
} from "@/lib/auth/invitation-preview";
import { authConfig, browserOriginAllowed } from "@/lib/auth/policy";

const privateHeaders = { "Cache-Control": "private, no-store, max-age=0" };

function rejected(status: number) {
  return new Response(null, { status, headers: privateHeaders });
}

export async function POST(request: Request) {
  try {
    const { adminOrigin: portalOrigin, apiOrigin } = authConfig(
      process.env.AKIBA_ORGANIZATION_PORTAL_ORIGIN,
      process.env.AKIBA_API_ORIGIN,
      process.env.NODE_ENV === "production",
    );
    if (!browserOriginAllowed(request.headers, portalOrigin, true)) {
      return rejected(403);
    }
    if (
      request.headers.get("content-type")?.split(";")[0].trim() !==
      "application/json"
    ) {
      return rejected(415);
    }

    const input = await boundedJson(request, 256).catch(() => null);
    if (
      !isRecord(input) ||
      !isInvitationToken(input.token) ||
      Object.keys(input).length !== 1
    ) {
      return rejected(400);
    }

    const upstream = await fetch(
      `${apiOrigin}/api/v1/owner-invitations/preview`,
      {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          Origin: portalOrigin,
        },
        body: JSON.stringify({ token: input.token }),
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(8000),
      },
    );
    if (upstream.status === 401 || upstream.status === 429) {
      await upstream.body?.cancel();
      return rejected(upstream.status);
    }
    if (
      upstream.status !== 200 ||
      upstream.headers.get("content-type")?.split(";")[0].trim() !==
        "application/json"
    ) {
      await upstream.body?.cancel();
      return rejected(502);
    }

    const preview = parseInvitationPreview(await boundedJson(upstream, 2048));
    return preview
      ? Response.json(preview, { headers: privateHeaders })
      : rejected(502);
  } catch {
    return rejected(503);
  }
}
