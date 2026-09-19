import { RepoClustersView } from "@/components/memory/repo-clusters-view";
import { loadSharedContext } from "@/lib/data/shared-context";

/**
 * Shared context is a deployment fact, read straight from komodo.yaml and the
 * store's meta table — see loadSharedContext — so it is loaded here rather
 * than sourced from the snapshot every other query hook reads.
 */
export default async function RepoClustersPage() {
  return <RepoClustersView sharedContext={await loadSharedContext()} />;
}
