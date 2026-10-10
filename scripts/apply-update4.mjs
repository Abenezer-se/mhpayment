// Fix: logo / screenshot upload failing on Netlify ("ያልታሰበ ስህተት").
// Run once from the project folder:   node scripts/apply-update4.mjs      (safe to run twice)
import fs from "node:fs";
import path from "node:path";

let problems = 0;
function edit(file, pairs) {
  const p = path.join(process.cwd(), file);
  if (!fs.existsSync(p)) { problems++; return console.log(`  ✗ ${file}: ፋይሉ አልተገኘም`); }
  let s = fs.readFileSync(p, "utf8");
  for (const [find, repl, label] of pairs) {
    if (s.includes(repl)) console.log(`  - ${file}: ${label} (ቀድሞ ተደርጓል)`);
    else if (s.includes(find)) { s = s.split(find).join(repl); console.log(`  ✓ ${file}: ${label}`); }
    else { problems++; console.log(`  ✗ ${file}: «${label}» የሚቀየረው ጽሑፍ አልተገኘም`); }
  }
  fs.writeFileSync(p, s, "utf8");
}

edit("server/lib/storage.ts", [
  ['import { env } from "../config";', 'import { env } from "../config";\nimport { AppError } from "./errors";', "import"],
  ['return getStore({ name: "uploads", consistency: "strong" });',
   '// Default consistency on purpose: Netlify\'s function mode gives no \'uncachedEdgeURL\', so "strong" made EVERY save/read fail.\n    return getStore("uploads");', "የማከማቻ ቅንብር (ዋናው ማስተካከያ)"],
  ['async put(key: string, data: Buffer) { await (await this.store()).set(key, new Uint8Array(data).buffer as ArrayBuffer); }',
   'async put(key: string, data: Buffer) {\n    try { await (await this.store()).set(key, new Uint8Array(data).buffer as ArrayBuffer); }\n    catch (e) { console.error("Netlify Blobs put failed:", e); throw new AppError(500, "ፋይሉን በማከማቻ ውስጥ ማስቀመጥ አልተቻለም። እባክዎ ደግመው ይሞክሩ፤ ካልተሳካ አስተዳዳሪውን ያነጋግሩ።", "STORAGE"); }\n  }', "ግልጽ የስህተት መልእክት"],
]);
edit("netlify/functions/api.ts", [
  ["} catch { /* not running on Netlify */ }", '} catch (e) { if (process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME) console.error("connectLambda failed:", e); }', "የስህተት መዝገብ"],
]);
console.log(problems ? `\n⚠ ${problems} ችግር(ች) አሉ — ✗ መስመሮቹን ይላኩልኝ።\n` : "\n✓ ተጠናቅቋል። አሁን፦ npm run build\n");
process.exit(problems ? 1 : 0);