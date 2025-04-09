import fs from "node:fs/promises";
import { transform } from "@svgr/core";
import path from "node:path";

import { fixImportsPlugin } from "esbuild-fix-imports-plugin";
import { build } from "tsup";

const DEFAULT_COLOR = "#292D32";
const ROOT_DIRECTORY = "./icons";
const BUILD_DIRECTORY = "./dist";
const GENERATED_DIRECTORY = "./generated";

try {
  await fs.rm(BUILD_DIRECTORY, { recursive: true });
} catch (error) {
  if (error.code !== "ENOENT") {
    throw error;
  }
}

try {
  await fs.rm(GENERATED_DIRECTORY, { recursive: true });
} catch (error) {
  if (error.code !== "ENOENT") {
    throw error;
  }
}

await fs.mkdir(GENERATED_DIRECTORY);

const rootFiles = await fs.readdir(ROOT_DIRECTORY, { withFileTypes: true });

let indexCode = "";

for (const rootFile of rootFiles) {
  if (!rootFile.isDirectory()) {
    continue;
  }

  const files = await fs.readdir(path.join(ROOT_DIRECTORY, rootFile.name), {
    withFileTypes: true,
  });

  for (const file of files) {
    if (!file.isFile() || !file.name.endsWith(".svg")) {
      continue;
    }

    const svg = await fs.readFile(
      path.join(ROOT_DIRECTORY, rootFile.name, file.name),
      "utf-8"
    );

    let componentName = file.name
      .replace(".svg", "")
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join("")
      .replaceAll("&", "And") // replace illegal & symbol with And
      .replace(/^\d/, (number) => `I${number}`); // prefix with I if starts with a number

    componentName +=
      rootFile.name.charAt(0).toUpperCase() + rootFile.name.slice(1);

    const code = await transform(
      svg,
      {
        plugins: ["@svgr/plugin-svgo", "@svgr/plugin-jsx"],
        jsxRuntime: "automatic",
        typescript: true,
        exportType: "named",
        namedExport: componentName,
        ref: true,
        replaceAttrValues: {
          [DEFAULT_COLOR]: "currentColor",
        },
        template,
        svgoConfig: {
          plugins: [
            {
              name: "preset-default",
              params: {
                overrides: {
                  removeViewBox: false,
                },
              },
            },
          ],
        },
      },
      { componentName }
    );

    await fs.writeFile(
      path.join(GENERATED_DIRECTORY, `${componentName}.tsx`),
      code
    );

    indexCode += `export { ${componentName} } from "./${componentName}";\n`;
  }
}

await fs.writeFile(path.join(GENERATED_DIRECTORY, "index.ts"), indexCode);

await build({
  entry: ["generated/*.ts", "generated/*.tsx"],
  sourcemap: false,
  dts: true,
  format: ["esm"],
  external: ["react"],
  jsxFactory: "jsx",
  treeshake: true,
  splitting: true,
  clean: true,
  minify: false,
  bundle: false,
  esbuildPlugins: [fixImportsPlugin()],
});

function template(variables, { tpl }) {
  return tpl`
${variables.imports};

${variables.interfaces};

const ${variables.componentName} = forwardRef((${variables.props}) => ${variables.jsx})

${variables.componentName}.displayName = "${variables.componentName}";

export { ${variables.componentName} };
`;
}
