import { Link } from "react-router-dom";

export default function App() {
    return (
    <div className="container-page">
      <header className="max-w-6xl mx-auto flex items-center justify-between px-4 py-6">
                <div className="flex items-center gap-3">
          <span className="text-2xl">⚽</span>
          <h1 className="text-xl font-bold tracking-tight">QUIZ BUTEUR</h1>
          </div>
        <nav className="flex items-center gap-2">
          <Link to="/admin" className="btn-outline">Admin</Link>
          <Link to="/superadmin" className="btn-primary">Super Admin</Link>
        </nav>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-16">
        <section className="grid lg:grid-cols-2 gap-8 items-center">
          <div className="space-y-6">
            <h2 className="text-4xl md:text-5xl font-extrabold leading-tight">
              Pronostics en temps réel<br />
              <span className="text-zinc-500">pour bars et événements</span>
            </h2>
            <p className="text-lg text-zinc-600">
              Les clients scannent un QR, répondent en live, le classement s'actualise
              automatiquement grâce aux données de match. Zéro saisie manuelle.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/admin" className="btn-primary">Accéder Admin</Link>
              <Link to="/superadmin" className="btn-outline">Accéder Super Admin</Link>
                        </div>
            <ul className="text-sm text-zinc-600 space-y-2">
              <li>• Questions auto déclenchées (prochain buteur, prochain corner…).</li>
              <li>• Résolution 100% via API match (anti "peut-être").</li>
              <li>• Classements par bar + national, anti-triche simple.</li>
            </ul>
                      </div>
          <div className="card">
            <div className="aspect-video rounded-xl bg-gradient-to-br from-zinc-100 to-zinc-200 grid place-items-center text-zinc-500">
              Aperçu écran bar (scoreboard & QR)
                    </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="card">
                <p className="text-sm font-semibold">Question en cours</p>
                <p className="text-sm text-zinc-600">"Prochain buteur ? (10 pts)"</p>
                    </div>
              <div className="card">
                <p className="text-sm font-semibold">Participants</p>
                <p className="text-sm text-zinc-600">46 joueurs en ligne</p>
              </div>
          </div>
                  </div>
        </section>
      </main>

      <footer className="max-w-6xl mx-auto px-4 py-10 text-sm text-zinc-500">
        © {new Date().getFullYear()} Quiz Buteur — MVP démo
      </footer>
      </div>
    );
  }