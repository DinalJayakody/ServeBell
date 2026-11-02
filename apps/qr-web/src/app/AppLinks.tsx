import { Apple, Play, Smartphone } from 'lucide-react';
import { storeLinks } from '@/lib/api';

/** Deep link into the Customer App plus store links (rendered only when configured). */
export function AppLinks({ deepLink, expoPath }: { deepLink?: string; expoPath?: string }) {
  return (
    <div className="stack">
      {storeLinks.expoDev && expoPath ? (
        <a className="btn" href={`${storeLinks.expoDev}/--${expoPath}`}>
          <Smartphone size={18} /> Open in Expo Go (development)
        </a>
      ) : null}
      {deepLink ? (
        <a className="btn btn-primary" href={deepLink}>
          <Smartphone size={18} /> Open in ServeBell app
        </a>
      ) : null}
      {storeLinks.appStore ? (
        <a className="btn" href={storeLinks.appStore} rel="noopener">
          <Apple size={18} /> Download on the App Store
        </a>
      ) : null}
      {storeLinks.playStore ? (
        <a className="btn" href={storeLinks.playStore} rel="noopener">
          <Play size={18} /> Get it on Google Play
        </a>
      ) : null}
    </div>
  );
}

export function Brand() {
  return (
    <div className="brand">
      <span className="logo" aria-hidden>🛎</span> ServeBell
    </div>
  );
}
