const root = document.documentElement;
root.classList.add("js");
const storageKey = "signal-tank-theme";
const themeColor = document.querySelector('meta[name="theme-color"]');
const systemTheme = matchMedia("(prefers-color-scheme: dark)");

function savedTheme() {
  try {
    return localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

function applyTheme(theme, persist = false) {
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  themeColor?.setAttribute("content", theme === "dark" ? "#071114" : "#eef4f1");
  document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
    const dark = theme === "dark";
    button.setAttribute("aria-pressed", String(dark));
    button.setAttribute("aria-label", `Switch to ${dark ? "light" : "dark"} mode`);
    button.title = `Switch to ${dark ? "light" : "dark"} mode`;
  });
  if (persist) {
    try {
      localStorage.setItem(storageKey, theme);
    } catch {
      // The selected theme still applies for this page when storage is unavailable.
    }
  }
}

applyTheme(root.dataset.theme || (systemTheme.matches ? "dark" : "light"));

document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
  button.addEventListener("click", () => {
    applyTheme(root.dataset.theme === "dark" ? "light" : "dark", true);
  });
});

systemTheme.addEventListener("change", (event) => {
  if (!savedTheme()) applyTheme(event.matches ? "dark" : "light");
});

const nav = document.querySelector("[data-nav]");
let ticking = false;
let lastScrollY = scrollY;
let movementTimer;
let compact = scrollY > 0;

function updateNav() {
  const currentScrollY = Math.max(0, scrollY);
  if (currentScrollY === 0) compact = false;
  else if (currentScrollY > lastScrollY) compact = true;
  else if (currentScrollY < lastScrollY) compact = false;
  nav?.classList.toggle("is-compact", compact);
  nav?.classList.toggle("is-scrolling-down", currentScrollY > lastScrollY);
  lastScrollY = currentScrollY;
  clearTimeout(movementTimer);
  movementTimer = setTimeout(() => nav?.classList.remove("is-scrolling-down"), 260);
  ticking = false;
}

addEventListener("scroll", () => {
  if (!ticking) {
    requestAnimationFrame(updateNav);
    ticking = true;
  }
}, { passive: true });
updateNav();

const menuButton = document.querySelector("[data-menu-toggle]");
const menu = document.querySelector("#mobile-menu");

function closeMenu(restoreFocus = false) {
  if (!menuButton || !menu || menu.hidden) return;
  menu.hidden = true;
  menuButton.setAttribute("aria-expanded", "false");
  menuButton.setAttribute("aria-label", "Open menu");
  document.body.classList.remove("menu-open");
  if (restoreFocus) menuButton.focus();
}

menuButton?.addEventListener("click", () => {
  const opening = menu.hidden;
  if (opening) {
    menu.hidden = false;
    menuButton.setAttribute("aria-expanded", "true");
    menuButton.setAttribute("aria-label", "Close menu");
    document.body.classList.add("menu-open");
    menu.querySelector("a")?.focus();
  } else {
    closeMenu(true);
  }
});

menu?.querySelectorAll("a").forEach((link) => link.addEventListener("click", () => closeMenu()));
addEventListener("keydown", (event) => {
  if (event.key === "Escape") closeMenu(true);
});
matchMedia("(min-width: 761px)").addEventListener("change", (event) => {
  if (event.matches) closeMenu();
});

const revealItems = document.querySelectorAll("[data-reveal]");
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");

if (reducedMotion.matches || !("IntersectionObserver" in window)) {
  revealItems.forEach((item) => item.classList.add("is-visible"));
} else {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("is-visible");
      observer.unobserve(entry.target);
    });
  }, { threshold: .12, rootMargin: "0px 0px -8% 0px" });

  revealItems.forEach((item) => observer.observe(item));
}
