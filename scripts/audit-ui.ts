import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const root = process.cwd();
const sourceRoots = [join(root, "app"), join(root, "components")];
const allowedRoot = join(root, "components", "ui");
const extensions = new Set([".ts", ".tsx"]);

const rules = [
  {
    label: "raw interactive HTML",
    pattern: /<(button|input|select|textarea)\b/g,
  },
  {
    label: "hand-rolled dialog",
    pattern: /<[A-Za-z][^>]*\brole=["']dialog["']/gi,
  },
  { label: "Radix asChild in a Base UI project", pattern: /\basChild\b/g },
  {
    label: "raw status color",
    pattern:
      /\b(?:bg|text|border)-(?:red|green|blue|orange|pink|yellow|emerald|lime)-\d{2,3}\b/g,
  },
  {
    label: "raw hex visual styling",
    pattern: /(?:className|style)=.{0,120}#[\da-f]{3,8}/gi,
  },
  { label: "fragile Tailwind sibling spacing", pattern: /\bspace-[xy]-\d+/g },
] as const;

function filesIn(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (path.startsWith(allowedRoot)) return [];
    return statSync(path).isDirectory()
      ? filesIn(path)
      : extensions.has(extname(path))
        ? [path]
        : [];
  });
}

const failures: string[] = [];
for (const file of sourceRoots.flatMap(filesIn)) {
  const source = readFileSync(file, "utf8");
  for (const rule of rules) {
    rule.pattern.lastIndex = 0;
    for (const match of source.matchAll(rule.pattern)) {
      const line = source.slice(0, match.index).split("\n").length;
      failures.push(
        `${relative(root, file)}:${line} ${rule.label}: ${match[0]}`,
      );
    }
  }
}

if (failures.length > 0) {
  console.error(`UI audit failed:\n${failures.join("\n")}`);
  process.exit(1);
}

console.log("UI audit passed: interactive surfaces use shadcn/ui composition.");
