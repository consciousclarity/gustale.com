import '../../styles/recipes-island.css';

// ============================================================================
// Gustale Recipes Island
// ============================================================================
// This is the recipes/encyclopedia variant.
// Full recipe detail data needs to be extracted from the deployed JS.

export default function RecipesIsland() {
  return (
    <div className="gst">
      {/* Navigation */}
      <nav className="gst-nav">
        <div className="wrap gst-nav-in">
          <a href="/" className="gst-brand">
            <span className="gst-wordmark">Gustale</span>
            <span className="sub">Recipes</span>
          </a>
          
          <div className="gst-navlinks">
            <a href="#">Explore</a>
            <a href="/families">Families</a>
            <a href="/">Dishes</a>
            <a href="#">Data</a>
          </div>
          
          <div className="gst-navr">
            <a href="#" className="gst-ghost">Sign in</a>
            <button className="btn-accent">Contribute</button>
          </div>
        </div>
      </nav>
      
      {/* Placeholder content */}
      <div className="wrap" style={{ paddingTop: '80px', textAlign: 'center' }}>
        <div className="atlas-eyebrow" style={{ marginBottom: '16px' }}>
          Coming Soon
        </div>
        <h1 className="atlas-title" style={{ marginBottom: '24px' }}>
          Recipes island<br /><em>coming soon</em>
        </h1>
        <p style={{ color: 'var(--sub)', fontSize: '18px', maxWidth: '480px', margin: '0 auto' }}>
          The full recipe encyclopedia is being built. Browse dishes on the Atlas or check back soon.
        </p>
        <div style={{ marginTop: '40px' }}>
          <a href="/" className="btn-accent" style={{ textDecoration: 'none' }}>
            Explore the Atlas
          </a>
        </div>
      </div>
    </div>
  );
}
