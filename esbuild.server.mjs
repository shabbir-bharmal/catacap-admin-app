import esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["server/src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: "dist/index.cjs",
  external: ["pg-native"],
  sourcemap: false,
  minify: false,
});

console.log("Server bundled to dist/index.cjs");
