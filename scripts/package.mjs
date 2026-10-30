import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { copyFile, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
// Never recursively archive the checkout: only these reviewed files ship.
const files = [
  "manifest.json", "background.js", "content.js", "content.css",
  "options.html", "options.js", "options.css", "lib/core.js", "lib/target.js",
  "icons/icon16.png", "icons/icon48.png", "icons/icon128.png",
  "LICENSE", "RELEASE_NOTES.md", "INSTALL.txt",
];
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
git("ls-files", "--error-unmatch", ...files);
git("diff", "--exit-code", "HEAD", "--", ...files);
const sourceCommit = git("rev-parse", "HEAD");
const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
assert.match(manifest.version, /^(0|[1-9]\d*)(\.(0|[1-9]\d*)){0,3}$/);
assert.ok(manifest.version.split(".").every((part) => Number(part) <= 65535));
assert.ok(manifest.version.split(".").some((part) => Number(part) > 0));
const version = manifest.version_name ?? manifest.version;
assert.match(version, /^[a-zA-Z0-9._-]+$/);
const packageName = `DRAFTED-v${version}`;
const dist = path.join(root, "dist");
const archive = path.join(dist, `${packageName}.zip`);
const staging = await mkdtemp(path.join(tmpdir(), "drafted-package-"));
try {
  const payload = new Map();
  for (const file of files) {
    const source = path.join(root, file);
    assert.ok((await lstat(source)).isFile(), `${file} must be a regular file, not a symlink`);
    if (file.endsWith(".js")) execFileSync(process.execPath, ["--check", source]);
    payload.set(file, await readFile(source));
  }
  payload.set("BUILD_INFO.json", Buffer.from(`${JSON.stringify({ version, sourceCommit }, null, 2)}\n`));
  for (const [file, bytes] of payload) {
    const destination = path.join(staging, packageName, file);
    await mkdir(path.dirname(destination), { recursive: true });
    await writeFile(destination, bytes);
  }
  const names = [...payload.keys()].map((file) => `${packageName}/${file}`).sort();
  const stagedZip = path.join(staging, `${packageName}.zip`);
  execFileSync("zip", ["-X", "-q", stagedZip, ...names], { cwd: staging });
  const actualNames = execFileSync("unzip", ["-Z1", stagedZip], { encoding: "utf8" }).trim().split("\n").sort();
  assert.deepEqual(actualNames, names, "archive must contain exactly the allowlisted payload");
  execFileSync("unzip", ["-tq", stagedZip]);
  for (const [file, bytes] of payload) {
    assert.deepEqual(execFileSync("unzip", ["-p", stagedZip, `${packageName}/${file}`]), bytes, `${file} changed during packaging`);
  }
  await mkdir(dist, { recursive: true });
  await copyFile(stagedZip, archive);
  const bytes = await readFile(archive);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  await writeFile(`${archive}.sha256`, `${sha256}  ${path.basename(archive)}\n`);
  console.log(JSON.stringify({ archive, version, sourceCommit, files: names, sizeBytes: bytes.length, sha256 }, null, 2));
} finally {
  await rm(staging, { recursive: true, force: true });
}
