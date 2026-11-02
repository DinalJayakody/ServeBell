import { Screen, LoadingState } from '@servebell/design-system';
import { useSession } from '@servebell/mobile-core';
import { useActiveVisit } from '@/hooks/useActiveVisit';
import { SeatedHome } from '@/components/SeatedHome';
import { DiscoverHome } from '@/components/DiscoverHome';

/** Seated at a table → table home (request service); otherwise → discovery. */
export default function Home() {
  const signedIn = useSession((s) => s.status === 'signedIn');
  const visit = useActiveVisit();
  if (signedIn && visit.isPending) return <Screen><LoadingState /></Screen>;
  return signedIn && visit.data ? <SeatedHome visit={visit.data} /> : <DiscoverHome />;
}
