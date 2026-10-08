// Re-generates server/lib/font-*.generated.ts from assets/fonts/*.ttf (only needed if you swap the Amharic PDF font).
import fs from "node:fs";
for (const w of ["Regular", "Bold"]) {
  const b64 = fs.readFileSync(`assets/fonts/NotoSansEthiopic-${w}.ttf`).toString("base64");
  fs.writeFileSync(`server/lib/font-${w.toLowerCase()}.generated.ts`,
    `// Generated from assets/fonts/NotoSansEthiopic-${w}.ttf (SIL OFL). Embedded so PDF export works on Netlify with no file access.\nexport default "${b64}";\n`);
  console.log(`✓ font-${w.toLowerCase()}.generated.ts`);
}
