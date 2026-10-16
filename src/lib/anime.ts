// The parts of anime.js (https://animejs.com) the site uses. motion.ts loads this file on demand,
// and listing the functions here, rather than loading the whole library, keeps that download to
// what we use. Add an export before using another anime.js feature.
export { animate, cleanInlineStyles, createScope, stagger } from "animejs";
