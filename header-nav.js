const NAV_LINKS = [
  { id: 'experience', href: 'index.html', label: 'Experience' },
  { id: 'education', href: 'education.html', label: 'Education' },
  { id: 'projects', href: 'projects.html', label: 'Projects' },
  { id: 'awards', href: 'awards.html', label: 'Hackathons & awards' }
];

const headerMarkup = `
    <header>
      <div class="avatar">
        <!-- Replace src with your actual headshot path -->
        <img id="avatar-img" alt="Portrait of Israel Ben David" src="ibd.jpeg" >
      </div>
      <div class="intro">
        <h1>Israel Ben David</h1>
        <p>
        I am a Computer Science MSc student at the School of Computer Science and Engineering at the Hebrew University of Jerusalem, under the supervision of Prof. Dani Lischinski.
        <br />
        My research interests include machine learning, computer vision, and generative models. More specifically, I am interested in developing new tools for content synthesis and controlling image generation.
        </p>

        <div class="links">
          <a href="mailto:israel.bendavid@mail.huji.ac.il"><svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22 6 12 13 2 6"/></svg> Email</a>
          <a href="https://github.com/IsraelBenDavid" target="_blank" rel="noopener"><svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg> GitHub</a>
          <a href="https://www.linkedin.com/in/israel-ben-david/" target="_blank" rel="noopener"><svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"/><rect x="2" y="9" width="4" height="12"/><circle cx="4" cy="4" r="2"/></svg> LinkedIn</a>
        </div>
      </div>
    </header>
`;

const buildNav = (currentId) => {
  const links = NAV_LINKS.map((link) => {
    const aria = link.id === currentId ? ' aria-current="page"' : '';
    return `<a href="${link.href}"${aria}>${link.label}</a>`;
  }).join('');

  return `
    <nav class="section-nav" aria-label="Section navigation">
      <button class="nav-toggle" type="button" aria-expanded="false">
        Sections <span aria-hidden="true">&#9662;</span>
      </button>
      <div class="inner">
        ${links}
      </div>
    </nav>
  `;
};

const injectHeaderAndNav = () => {
  const wrap = document.querySelector('.wrap');
  if (!wrap) return;
  const currentPage = document.body.dataset.page || '';
  const template = document.createElement('template');
  template.innerHTML = `${headerMarkup}${buildNav(currentPage)}`;
  wrap.insertBefore(template.content, wrap.firstChild || null);

  const nav = wrap.querySelector('.section-nav');
  const toggle = nav?.querySelector('.nav-toggle');
  if (nav && toggle) {
    const setState = (expanded) => {
      toggle.setAttribute('aria-expanded', String(expanded));
      nav.classList.toggle('open', expanded);
    };
    toggle.addEventListener('click', () => {
      const expanded = toggle.getAttribute('aria-expanded') === 'true';
      setState(!expanded);
    });
    nav.querySelectorAll('.inner a').forEach((link) => {
      link.addEventListener('click', () => setState(false));
    });
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', injectHeaderAndNav);
} else {
  injectHeaderAndNav();
}
