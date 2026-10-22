import { Link } from 'react-router';
import { cafeConfig } from '@kape/shared';
import { CafeShell } from '../components/CafeShell';

export function LandingPage() {
  return (
    <CafeShell>
      <main id="main" className="landing-main">
        <section className="landing-hero">
          <p className="eyebrow">LESS WAITING. MORE SAVORING.</p>
          <span className="landing-wave" aria-hidden="true">
            ≈
          </span>
          <h1>
            A good cup.
            <br />A smoother service.
          </h1>
          <p>
            {cafeConfig.name} is a coffee and brunch cafe demo. Order from your
            table, follow the kitchen’s progress, and enjoy your little pause.
          </p>
          <Link className="button" to={'/t/' + cafeConfig.demoTable}>
            Try as a customer <span aria-hidden="true">↗</span>
          </Link>
          <span className="fine-print">
            Table {cafeConfig.demoTable} · No signup or payment needed
          </span>
        </section>
        <section className="experience-grid" aria-label="Explore the demo">
          <article>
            <span className="eyebrow">01 · AT YOUR TABLE</span>
            <h2>Pick your favorites.</h2>
            <p>
              Browse the menu, make it yours, and track your order as it’s
              prepared.
            </p>
            <Link to={'/t/' + cafeConfig.demoTable}>Explore the menu →</Link>
          </article>
          <article>
            <span className="eyebrow">02 · IN THE KITCHEN</span>
            <h2>Keep service flowing.</h2>
            <p>
              See new orders arrive live and move each table from preparation to
              service.
            </p>
            <Link className="button" to="/login?role=kitchen">
              Open kitchen board
            </Link>
          </article>
          <article>
            <span className="eyebrow">03 · BEHIND THE SCENES</span>
            <h2>A place for the details.</h2>
            <p>
              Try the admin login. Menu management and reporting arrive in the
              next phase.
            </p>
            <Link className="button" to="/login?role=admin">
              Open admin
            </Link>
          </article>
        </section>
        <p className="landing-footnote">
          A portfolio demo for small cafes. Sample orders only.
        </p>
      </main>
    </CafeShell>
  );
}
