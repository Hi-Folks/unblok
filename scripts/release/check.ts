import { cp, mkdtemp, mkdir, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import manifest from "../../package.json";

const stage = resolve("dist/npm/unblok");
await rm(stage, { recursive: true, force: true });
await mkdir(stage, { recursive: true });
await cp("dist/package", join(stage, "dist"), { recursive: true });
await cp("dist/library-types", join(stage, "types"), { recursive: true });
await cp("README.md", join(stage, "README.md"));
await cp("LICENSE", join(stage, "LICENSE"));
await Bun.write(
  join(stage, "package.json"),
  JSON.stringify(
    {
      name: manifest.name,
      version: manifest.version,
      description: manifest.description,
      license: manifest.license,
      repository: manifest.repository,
      homepage: manifest.homepage,
      bugs: manifest.bugs,
      type: "module",
      bin: { unblok: "./dist/index.js" },
      exports: {
        ".": {
          types: "./types/library.d.ts",
          default: "./dist/src/library.js",
        },
      },
      types: "./types/library.d.ts",
      engines: manifest.engines,
      dependencies: manifest.dependencies,
      files: ["dist", "types", "README.md", "LICENSE"],
    },
    null,
    2,
  ),
);

async function run(args: string[], cwd: string): Promise<string> {
  const child = Bun.spawn(args, {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      npm_config_cache: join(tmpdir(), "unblok-npm-cache"),
    },
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (code) throw new Error(`${args.join(" ")} failed: ${err || out}`);
  return out.trim();
}
const temp = await mkdtemp(join(tmpdir(), "unblok-package-"));
try {
  const packed = JSON.parse(
    await run(
      ["npm", "pack", "--json", "--ignore-scripts", "--pack-destination", temp],
      stage,
    ),
  ) as Array<{ filename: string; files: Array<{ path: string }> }>;
  const item = packed[0];
  if (
    !item ||
    !item.files.some((entry) => entry.path === "dist/index.js") ||
    !item.files.some((entry) => entry.path === "types/library.d.ts")
  )
    throw new Error("CLI or types missing from package.");
  if (
    item.files.some(
      ({ path }) =>
        !["README.md", "LICENSE", "package.json"].includes(path) &&
        !path.startsWith("dist/") &&
        !path.startsWith("types/"),
    )
  )
    throw new Error("Package contains unexpected files.");
  await Bun.write(
    join(temp, "package.json"),
    '{"private":true,"type":"module"}',
  );
  await run(
    [
      "npm",
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      join(temp, item.filename),
    ],
    temp,
  );
  const consumer = join(temp, "consumer.ts");
  await Bun.write(
    consumer,
    'import { assignStoryTags, ensureTranslatedSlugs, ensureAppInstalled, type StoryTagsInput, type EnsureTranslatedSlugsInput, type EnsureAppInstalledInput } from "unblok"; const input: StoryTagsInput = { spaceId: 1, stories: ["home"], tags: ["demo"] }; const translation: EnsureTranslatedSlugsInput = { spaceId: 1, story: "about", translations: [{ language: "it", slug: "chi-siamo" }] }; const app: EnsureAppInstalledInput = { spaceId: 1, slug: "import" }; void assignStoryTags; void ensureTranslatedSlugs; void ensureAppInstalled; void input; void translation; void app;',
  );
  await run(
    [
      "bun",
      resolve("node_modules/typescript/bin/tsc"),
      "--noEmit",
      "--target",
      "esnext",
      "--module",
      "preserve",
      "--moduleResolution",
      "bundler",
      consumer,
    ],
    temp,
  );
  await run(
    [
      "bun",
      resolve("node_modules/typescript/bin/tsc"),
      "--noEmit",
      "--target",
      "esnext",
      "--module",
      "nodenext",
      "--moduleResolution",
      "nodenext",
      consumer,
    ],
    temp,
  );
  const cli = join(temp, "node_modules/unblok/dist/index.js");
  if (!(await Bun.file(cli).text()).startsWith("#!/usr/bin/env node"))
    throw new Error("CLI shebang is missing.");
  if (
    process.platform !== "win32" &&
    (await run([join(temp, "node_modules/.bin/unblok"), "--version"], temp)) !==
      `unblok ${manifest.version}`
  )
    throw new Error("Installed CLI command failed.");
  if (
    (await run(["bun", "x", "--bun", "unblok", "--version"], temp)) !==
    `unblok ${manifest.version}`
  )
    throw new Error("Installed bunx command failed.");
  await Bun.write(
    join(temp, ".env"),
    "STORYBLOK_TOKEN=example-test-token\nSTORYBLOK_REQUESTS_PER_SECOND=0\n",
  );
  const env = { ...process.env };
  delete env.STORYBLOK_TOKEN;
  delete env.STORYBLOK_REQUESTS_PER_SECOND;
  const envCheck = Bun.spawn(["bun", "x", "--bun", "unblok", "space", "list"], {
    cwd: temp,
    env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [envOut, envErr, envExit] = await Promise.all([
    new Response(envCheck.stdout).text(),
    new Response(envCheck.stderr).text(),
    envCheck.exited,
  ]);
  if (
    envExit === 0 ||
    !(envOut + envErr).includes("STORYBLOK_REQUESTS_PER_SECOND")
  )
    throw new Error("bunx CLI did not load the working directory's .env.");
  for (const runtime of ["node", "bun"]) {
    if (!(await run([runtime, cli, "--help"], temp)).includes("Usage: unblok"))
      throw new Error(`${runtime} CLI help failed.`);
    if (
      !(await run([runtime, cli, "skill", "install", "--help"], temp)).includes(
        "--agent <codex|claude>",
      )
    )
      throw new Error(`${runtime} skill installer help failed.`);
    if (
      (await run([runtime, cli, "--version"], temp)) !==
      `unblok ${manifest.version}`
    )
      throw new Error(`${runtime} CLI version failed.`);
    const plan = JSON.parse(
      await run(
        [
          runtime,
          cli,
          "space",
          "setup",
          "plan",
          "--config",
          resolve("src/setup/fixtures/input-blueprint.yaml"),
          "--json",
        ],
        temp,
      ),
    ) as { apiVersion?: string };
    if (plan.apiVersion !== "unblok/setup-blueprint-plan-v1")
      throw new Error(`${runtime} YAML plan failed.`);
    const schema = JSON.parse(
      await run([runtime, cli, "space", "setup", "schema", "--json"], temp),
    );
    const expectedSchema = await Bun.file(
      resolve("space-setup.schema.json"),
    ).json();
    if (JSON.stringify(schema) !== JSON.stringify(expectedSchema))
      throw new Error(`${runtime} blueprint schema failed.`);
    for (const [name, source] of [
      ["campaign-launch", "examples/recipes/campaign-launch.yaml"],
      [
        "translation-review",
        "examples/features/setup-translation-from-event.yaml",
      ],
    ]) {
      const example = JSON.parse(
        await run(
          [runtime, cli, "space", "setup", "example", name!, "--json"],
          temp,
        ),
      ) as { name?: string; content?: string };
      const expected = (await Bun.file(resolve(source!)).text())
        .replace(/^# yaml-language-server:.*\r?\n/, "")
        .trimEnd();
      if (example.name !== name || example.content !== expected)
        throw new Error(`${runtime} blueprint example '${name}' failed.`);
    }
    await run(
      [
        runtime,
        "--input-type=module",
        "-e",
        'import { assignStoryTags, ensureTranslatedSlugs } from "unblok"; const g={findStoryBySlug:async()=>({id:1,full_slug:"home",tag_list:[]}),getStory:async()=>({id:1,full_slug:"home",tag_list:[],translated_slugs:[]}),updateStoryTags:async()=>{},listInstalledApps:async()=>[{slug:"translatable-slugs"}],listLanguages:async()=>[{code:"it"}],updateTranslatedSlugs:async()=>{}}; const result=await assignStoryTags(g,{spaceId:1,stories:["home"],tags:["demo"]}); if(result.summary.updated!==1) throw new Error("Library action failed"); const translation=await ensureTranslatedSlugs(g,{spaceId:1,story:"home",translations:[{language:"it",slug:"casa"}]}); if(translation.status!=="updated") throw new Error("Translation action failed");',
      ],
      temp,
    );
    await run(
      [
        runtime,
        "--input-type=module",
        "-e",
        'import { listStories } from "unblok"; const calls=[]; const stories=await listStories({listStories:async (space, options)=>{calls.push({space,options}); return [{id:1}]}},{spaceId:42,tag:"campaign"}); if(stories.length!==1 || calls[0].options.tag!=="campaign" || calls[0].options.storyOnly!==true) throw new Error("Story list action failed");',
      ],
      temp,
    );
    await run(
      [
        runtime,
        "--input-type=module",
        "-e",
        'import { compareStoryLanguages } from "unblok"; const gateway={findStoryBySlug:async()=>({id:7}),getStory:async()=>({id:7,full_slug:"home",content:{component:"page",title:"Hello",title__i18n__de:"Hallo"}}),listComponents:async()=>[{name:"page",schema:{title:{translatable:true}}}],listLanguages:async()=>[{code:"de"}]}; const result=await compareStoryLanguages(gateway,{spaceId:42,story:"home",languages:["de"]}); if(result.fields[0].translations[0].value!=="Hallo") throw new Error("Story language comparison failed");',
      ],
      temp,
    );
  }
  console.log(
    "Validated packed CLI, YAML plan, blueprint schema and examples, and library under Node and Bun.",
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}
