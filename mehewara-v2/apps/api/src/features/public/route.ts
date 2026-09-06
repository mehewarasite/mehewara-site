import type { FeatureContext } from "../../env";
import type { B2Client } from "../../storage/b2-client";
import type { PublicationStore } from "../publication/store";
import type { MediaEdgeCache } from "../media/route";
import { currentPublicationRoute } from "../publication/build";

export async function publicationRoute(
  request: Request,
  context: FeatureContext,
  deps: { b2: B2Client; store: PublicationStore; edgeCache?: MediaEdgeCache | null },
): Promise<Response> {
  // The snapshot is the only public read contract: pointer resolve (D1) +
  // one immutable B2 GET, both inside a single publicSnapshotRead permit,
  // with edge-cache hits served permit-free.
  return currentPublicationRoute(request, { b2: deps.b2, context, store: deps.store, edgeCache: deps.edgeCache });
}
