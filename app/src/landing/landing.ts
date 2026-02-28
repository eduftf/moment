import "./landing.css";

// --- Scroll-triggered reveal with stagger support ---
const reveals = document.querySelectorAll<HTMLElement>(".reveal");

const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const el = entry.target as HTMLElement;
        const delay = el.dataset.delay;
        if (delay) {
          el.style.transitionDelay = delay;
        }
        el.classList.add("visible");
        observer.unobserve(el);
      }
    }
  },
  { threshold: 0.12 },
);

for (const el of reveals) {
  observer.observe(el);
}

// --- Sticky nav background on scroll ---
const nav = document.querySelector(".nav");
if (nav) {
  const onScroll = () => {
    nav.classList.toggle("scrolled", window.scrollY > 40);
  };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

// --- Smooth scroll for anchor links ---
document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
  anchor.addEventListener("click", (e) => {
    const href = (anchor as HTMLAnchorElement).getAttribute("href");
    if (!href || href === "#") return;
    const target = document.querySelector(href);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth" });
    }
  });
});

// --- Subtle parallax on hero brackets ---
const brackets = document.querySelector<HTMLElement>(".brackets");
if (brackets) {
  let ticking = false;
  window.addEventListener(
    "scroll",
    () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const y = window.scrollY;
          if (y < window.innerHeight) {
            brackets.style.transform = `scale(${1 + y * 0.0003}) rotate(${y * 0.01}deg)`;
            brackets.style.opacity = `${1 - y / (window.innerHeight * 0.8)}`;
          }
          ticking = false;
        });
        ticking = true;
      }
    },
    { passive: true },
  );
}
