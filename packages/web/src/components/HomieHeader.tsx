import { Link } from 'react-router-dom';

export default function HomieHeader() {
  return (
    <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-sm border-b border-dark/10">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-baseline gap-3">
          <Link to="/" className="font-display font-bold text-2xl text-orange-500 hover:text-orange-600 transition-colors">
            homie
          </Link>
          <span className="hidden sm:inline text-sm text-dark/50">Your home's best friend</span>
        </div>
        <Link
          to="/"
          className="bg-orange-500 hover:bg-orange-600 text-white text-sm font-semibold px-5 py-2 rounded-full transition-colors"
        >
          Find a pro
        </Link>
      </div>
    </header>
  );
}
