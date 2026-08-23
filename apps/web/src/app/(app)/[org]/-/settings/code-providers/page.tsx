import { CodeProvidersView } from "@/components/settings/code-providers-view";
import { loadDeploymentStatus } from "@/lib/data/deployment";

/**
 * The connection facts are the deployment's, not the snapshot's — the token
 * and the ingester's heartbeats — so they are loaded here and handed down.
 */
export default async function CodeProvidersPage() {
  return <CodeProvidersView status={await loadDeploymentStatus()} />;
}
