// Makes public/favicon.ico (16, 32 and 48 px) and public/apple-touch-icon.png (180 px) from
// public/favicon.svg, drawing them in Google Chrome as the browser test does. Run it with
// `npm run icons` after changing the SVG, and commit what it writes.
import { readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const svg = readFileSync("public/favicon.svg", "utf8");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage();

async function png(source, size) {
  const src = `data:image/svg+xml;base64,${Buffer.from(source).toString("base64")}`;
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style><img src="${src}" width="${size}" height="${size}">`);
  await page.waitForFunction(() => document.images[0].complete);
  return page.locator("img").screenshot({ omitBackground: true });
}

const sizes = [16, 32, 48];
const images = [];
for (const size of sizes) images.push(await png(svg, size));
// Phones round a home screen icon's corners themselves, so this one is square.
writeFileSync("public/apple-touch-icon.png", await png(svg.replace(/ rx="\d+"/, ""), 180));
await browser.close();

// An .ico file is a short directory of its images followed by the images, here as PNGs.
const directory = Buffer.alloc(6 + 16 * images.length);
directory.writeUInt16LE(1, 2); // type: icon
directory.writeUInt16LE(images.length, 4);
let offset = directory.length;
images.forEach((image, i) => {
  const entry = 6 + 16 * i;
  directory.writeUInt8(sizes[i], entry); // width
  directory.writeUInt8(sizes[i], entry + 1); // height
  directory.writeUInt16LE(1, entry + 4); // colour planes
  directory.writeUInt16LE(32, entry + 6); // bits per pixel
  directory.writeUInt32LE(image.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += image.length;
});
writeFileSync("public/favicon.ico", Buffer.concat([directory, ...images]));
console.log("Wrote public/favicon.ico and public/apple-touch-icon.png");
