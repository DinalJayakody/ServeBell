import Link from 'next/link';
import { Brand } from '../../AppLinks';

export default function InvalidQr() {
  return (
    <main className="page">
      <Brand />
      <section className="card stack">
        <h1>This QR code isn’t active</h1>
        <p className="muted">It may have been replaced. Please ask a staff member for help, or browse restaurants in the ServeBell app.</p>
      </section>
      <Link className="btn" href="/">Go to ServeBell</Link>
    </main>
  );
}
