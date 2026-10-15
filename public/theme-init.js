// Applies a saved light/dark choice before the first paint so the page does not flash.
// Kept as its own file so the site's content security policy can forbid inline scripts.
try {
  var theme = localStorage.getItem("theme");
  if (theme === "light" || theme === "dark") document.documentElement.dataset.theme = theme;
} catch (e) {
  // Storage can be blocked; follow the system setting.
}
