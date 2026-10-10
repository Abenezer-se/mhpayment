// Logo update: lets you pick an SVG logo (the browser converts it to PNG for PDF/Excel).
// Run once from the project folder:   node scripts/apply-update3.mjs      (safe to run twice)
import fs from "node:fs";
import path from "node:path";

const file = path.join(process.cwd(), "src/pages/StaffAdmin.tsx");
let s = fs.readFileSync(file, "utf8");
let problems = 0;
const edit = (find, repl, label) => {
  if (s.includes(repl)) return console.log(`  - ${label} (ቀድሞ ተደርጓል)`);
  if (!s.includes(find)) { problems++; return console.log(`  ✗ ${label}: የሚቀየረው ጽሑፍ አልተገኘም`); }
  s = s.split(find).join(repl); console.log(`  ✓ ${label}`);
};

edit("export function SettingsPage() {", `/** PDF and Excel need a bitmap, so an SVG logo is converted to a sharp PNG here, in the browser, before it is uploaded. */
async function prepareLogo(file: File): Promise<File> {
  if (file.type !== "image/svg+xml" && !/\\.svg$/i.test(file.name)) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = img.naturalWidth || 512, h = img.naturalHeight || 512;
    const scale = 800 / Math.max(w, h);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/png"));
    if (!blob) throw new Error("convert");
    return new File([blob], "logo.png", { type: "image/png" });
  } finally { URL.revokeObjectURL(url); }
}

export function SettingsPage() {`, "SVG ወደ PNG መቀየሪያ");
edit('accept="image/png,image/jpeg" onChange={(e) => upload(e.target.files?.[0])}',
  'accept="image/svg+xml,image/png,image/jpeg,.svg" onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ""; if (!f) return; try { await upload(await prepareLogo(f)); } catch { toast("SVG ፋይሉን ወደ PNG መቀየር አልተቻለም። በአርማው ውስጥ ያሉ ጽሑፎችን ወደ መስመር (outline) ቀይረው ደግመው ይሞክሩ።", "error"); } }}', "የፋይል መምረጫ");
edit("PNG ወይም JPG፣ ከ2 ሜጋባይት በታች።", "SVG፣ PNG ወይም JPG፤ ከ2 ሜጋባይት በታች። SVG ሲመረጥ በራሱ ወደ PNG ይቀየራል።", "መመሪያ");

fs.writeFileSync(file, s, "utf8");
console.log(problems ? `\n⚠ ${problems} ችግር(ች) አሉ — ✗ መስመሮቹን ይላኩልኝ።\n` : "\n✓ ተጠናቅቋል። አሁን፦ npm run build\n");
process.exit(problems ? 1 : 0);