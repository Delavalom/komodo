import "server-only";

/**
 * Reading a request body without letting it decide how much memory to use.
 *
 * Next's 1 MB cap applies to Server Actions, not to Route Handlers — a Route
 * Handler's `request.json()` buffers whatever arrives. These three routes are
 * authenticated, so this is not an anonymous denial of service, but a key
 * pasted into CI is a key that can be misused by accident as easily as on
 * purpose, and a review record has a knowable size.
 *
 * Generous on purpose: a large pull request's patches are megabytes, and a
 * limit that refuses a real review is worse than no limit at all.
 */
const MAX_BODY_BYTES = 16 * 1024 * 1024;

export type BodyResult<T> =
  | { ok: true; value: T }
  | { ok: false; response: Response };

/** The parsed JSON body, or the response to send instead. */
export async function readJsonBody<T = unknown>(
  request: Request,
): Promise<BodyResult<T>> {
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return {
      ok: false,
      response: Response.json(
        {
          error: `That body is ${Math.round(declared / 1024 / 1024)} MB. The limit is ${MAX_BODY_BYTES / 1024 / 1024} MB.`,
        },
        { status: 413 },
      ),
    };
  }

  // A missing or lying content-length still has to be bounded, so the body is
  // read as text and measured before anything tries to parse it.
  let text: string;
  try {
    text = await request.text();
  } catch {
    return {
      ok: false,
      response: Response.json({ error: "The request body could not be read." }, { status: 400 }),
    };
  }
  if (text.length > MAX_BODY_BYTES) {
    return {
      ok: false,
      response: Response.json(
        { error: `That body is over the ${MAX_BODY_BYTES / 1024 / 1024} MB limit.` },
        { status: 413 },
      ),
    };
  }

  try {
    return { ok: true, value: JSON.parse(text) as T };
  } catch {
    return {
      ok: false,
      response: Response.json({ error: "That body is not JSON." }, { status: 400 }),
    };
  }
}

/**
 * A dynamic route segment, as the segment actually is.
 *
 * Next hands these already decoded, so the `decodeURIComponent` these routes
 * used to apply was a second decode: `%25` became a bare `%` and then threw a
 * URIError out of the handler as a 500, and `%252F` quietly became a `/` —
 * a path separator conjured out of an id. This is the one place that
 * distinction is decided.
 */
export function routeParam(value: string): string {
  return value;
}
