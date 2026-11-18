import { unified } from "@astrojs/markdown-remark";
import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";
import starlightLlmsTxt from "starlight-llms-txt";
import { remarkDiagram } from "./plugins/remark-diagram.mjs";
import { remarkLinkCards } from "./plugins/remark-link-cards.mjs";
import { remarkMermaid } from "./plugins/remark-mermaid.mjs";
import { llmsTxtOptions } from "./src/utils/llms-txt.mjs";

const base = process.env.ASTRO_BASE ?? "/";
const normalizedBase = base === "/" ? "" : base.replace(/\/$/, "");
const site = process.env.ASTRO_SITE ?? "https://askdb.tools";

/**
 * Remark plugin that rewrites root-absolute internal links (e.g. `/quickstart/`)
 * to be relative to the configured base path (e.g. `/AskDB/quickstart/`).
 * This handles both Markdown links and JSX <a href="…"> elements inside .mdx files.
 * When base is "/" the plugin is a no-op so local `astro dev` is unaffected.
 */
function remarkRebaseLinks() {
  if (!normalizedBase) return (_tree) => {};

  function walk(node) {
    if (node.type === "link") {
      if (typeof node.url === "string" && node.url.startsWith("/") && !node.url.startsWith("//")) {
        node.url = normalizedBase + node.url;
      }
    } else if (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") {
      if (node.name === "a") {
        const hrefAttr = (node.attributes ?? []).find(
          (a) => a.type === "mdxJsxAttribute" && a.name === "href"
        );
        if (hrefAttr && typeof hrefAttr.value === "string" &&
            hrefAttr.value.startsWith("/") && !hrefAttr.value.startsWith("//")) {
          hrefAttr.value = normalizedBase + hrefAttr.value;
        }
      }
    }
    if (node.children) node.children.forEach(walk);
  }

  return (tree) => walk(tree);
}

export default defineConfig({
  site: `${site}${normalizedBase}`,
  base,
  // Pages that moved or were deleted. A static build writes each one as a page that forwards the
  // reader (a meta refresh), so old links and bookmarks still land. Astro adds the base to the
  // old path but not to the destination, so the destination carries it here.
  redirects: {
    "/reference/ask-options": `${normalizedBase}/reference/core-api/`,
    "/getting-started/troubleshooting": `${normalizedBase}/guides/troubleshooting/`,
  },
  markdown: {
    // remarkMermaid turns each ```mermaid fence into an inline SVG at build time (ADR 0041), so
    // pages ship no diagram JavaScript. src/styles/content.css maps pele's color variables to
    // Starlight's, so a diagram follows the theme toggle. remarkLinkCards marks a list of
    // `[Title](/path/): description` items so the same stylesheet lays it out as cards.
    processor: unified({ remarkPlugins: [remarkRebaseLinks, remarkDiagram, remarkMermaid, remarkLinkCards] }),
  },
  integrations: [
    starlight({
      head: [
        {
          tag: "script",
          attrs: {
            defer: true,
            src: "https://static.cloudflareinsights.com/beacon.min.js",
            "data-cf-beacon": '{"token": "d88bd06a11b7436eafb44804cb2fabbf"}',
          },
        },
      ],
      title: "AskDB",
      description:
        "Open-source NL-to-SQL toolkit for developers. Your LLM generates schema-grounded SQL; your app runs it.",
      logo: {
        light: "./src/assets/brand/logo.png",
        dark: "./src/assets/brand/logo-dark.png",
        alt: "AskDB",
        replacesTitle: true,
      },
      favicon: "/favicon-light.png",
      // The fonts are self-hosted (Fontsource), so a page makes no request to a font host.
      customCss: [
        "@fontsource-variable/inter/wght.css",
        "@fontsource-variable/inter/wght-italic.css",
        "@fontsource-variable/manrope/wght.css",
        "@fontsource-variable/jetbrains-mono/wght.css",
        "./src/styles/tokens.css",
        "./src/styles/layout.css",
        "./src/styles/content.css",
        "./src/styles/home.css",
      ],
      // Code blocks take their frame colors from src/styles/tokens.css, so they sit on the page's
      // sheet like any other card and follow the theme toggle.
      expressiveCode: {
        themes: ["github-dark-default", "github-light-default"],
        // Expressive Code recolors the text of a marked line for contrast against the line's
        // background, which it works out from `codeBackground`. Ours is a CSS variable it can't
        // read, so it took the dark theme's background for a light one and dimmed inserted lines
        // until they were unreadable. Zero keeps each token its theme color, which both themes'
        // tints are chosen for.
        minSyntaxHighlightingColorContrast: 0,
        styleOverrides: {
          borderRadius: "0.625rem",
          borderColor: "var(--ask-border)",
          codeBackground: "var(--ask-code-bg)",
          codeFontSize: "0.8125rem",
          codeLineHeight: "1.7",
          codePaddingBlock: "0.875rem",
          codePaddingInline: "1.125rem",
          uiFontSize: "0.8125rem",
          scrollbarThumbColor: "var(--ask-border-strong)",
          scrollbarThumbHoverColor: "var(--ask-text-subtle)",
          frames: {
            frameBoxShadowCssValue: "none",
            editorBackground: "var(--ask-code-bg)",
            editorTabBarBackground: "var(--ask-surface-2)",
            editorTabBarBorderBottomColor: "var(--ask-border)",
            editorActiveTabBackground: "var(--ask-surface-2)",
            editorActiveTabForeground: "var(--ask-text-muted)",
            editorActiveTabBorderColor: "transparent",
            editorActiveTabIndicatorTopColor: "transparent",
            editorActiveTabIndicatorBottomColor: "transparent",
            terminalBackground: "var(--ask-code-bg)",
            terminalTitlebarBackground: "var(--ask-surface-2)",
            terminalTitlebarBorderBottomColor: "var(--ask-border)",
            terminalTitlebarForeground: "var(--ask-text-muted)",
            terminalTitlebarDotsOpacity: "0",
            inlineButtonBackground: "var(--ask-text-muted)",
            inlineButtonForeground: "var(--ask-text-muted)",
            inlineButtonBorder: "var(--ask-border-strong)",
            tooltipSuccessBackground: "var(--ask-text)",
            tooltipSuccessForeground: "var(--ask-surface)",
          },
          textMarkers: {
            markBackground: "color-mix(in srgb, var(--ask-accent) 12%, transparent)",
            markBorderColor: "var(--ask-accent)",
            insBackground: "rgb(46 160 67 / 0.15)",
            insBorderColor: "rgb(46 160 67 / 0.6)",
            delBackground: "rgb(248 81 73 / 0.13)",
            delBorderColor: "rgb(248 81 73 / 0.6)",
          },
        },
      },
      routeMiddleware: "./src/routeData.ts",
      components: {
        Header: "./src/components/overrides/Header.astro",
        Hero: "./src/components/overrides/Hero.astro",
        PageTitle: "./src/components/overrides/PageTitle.astro",
        ThemeSelect: "./src/components/ThemeSelect.astro",
        Footer: "./src/components/overrides/Footer.astro",
        // The 1.0 release-candidate announcement bar; remove when the launch is over.
        Banner: "./src/components/overrides/Banner.astro",
        // Starlight's skip link, after a sentence that tells an AI agent where the Markdown is.
        SkipLink: "./src/components/overrides/SkipLink.astro",
      },
      editLink: {
        baseUrl: "https://github.com/Ygilany/AskDB/edit/main/apps/docs-site/",
      },
      social: [
        {
          icon: "github",
          label: "GitHub",
          href: "https://github.com/Ygilany/AskDB",
        },
      ],
      plugins: [
        // What /llms.txt says, and how its documentation sets are cut: src/utils/llms-txt.mjs.
        starlightLlmsTxt(llmsTxtOptions(`${site}${normalizedBase}`)),
      ],
      sidebar: [
        {
          label: "Start",
          items: [
            { label: "Overview", slug: "index" },
            { label: "Quickstart", slug: "quickstart" },
            { label: "Chart your first answer", slug: "chart-your-first-answer", badge: { text: "Experimental", variant: "caution" } },
            { label: "Find the right tables", slug: "find-the-right-tables" },
            { label: "Install", slug: "install" },
            { label: "Studio tour", slug: "studio" },
          ],
        },
        {
          label: "Guides",
          items: [
            {
              label: "Build",
              items: [
                { label: "Embed in a Node app", slug: "guides/embed-in-node" },
                { label: "Enrich your schema", slug: "guides/author-your-schema" },
                { label: "Introspect without a connection", slug: "guides/introspect-without-a-connection" },
                { label: "Bring your own model", slug: "guides/bring-your-own-model" },
                { label: "Switch engines", slug: "guides/switch-engines" },
                { label: "Connect to SQL Server", slug: "guides/connect-to-sql-server" },
                { label: "RAG for large schemas", slug: "guides/rag-for-large-schemas" },
                { label: "Rerun a query with new values", slug: "guides/rerun-a-query-with-new-values" },
                { label: "Chart a query result", slug: "guides/plan-a-chart", badge: { text: "Experimental", variant: "caution" } },
                { label: "Bundle an app that uses AskDB", slug: "guides/bundle-your-app" },
              ],
            },
            {
              label: "Run in production",
              items: [
                { label: "Run safely in production", slug: "guides/run-safely-in-prod" },
                { label: "Cap the rows a query returns", slug: "guides/cap-the-rows-a-query-returns" },
                { label: "Keep sensitive columns out of prompts", slug: "guides/keep-sensitive-columns-out-of-prompts" },
                { label: "Match your server's string settings", slug: "guides/match-server-string-settings" },
                { label: "Deploy as HTTP service", slug: "guides/deploy-as-http-service" },
                { label: "Enable Studio execute", slug: "guides/enable-studio-execute" },
              ],
            },
            {
              label: "Tenancy",
              items: [
                { label: "Scope queries to a tenant", slug: "guides/multi-tenancy" },
                { label: "Scope to a tenant hierarchy", slug: "guides/tenant-hierarchy" },
                { label: "Enforce tenancy in the database", slug: "guides/enforce-tenancy-in-the-database" },
              ],
            },
            {
              label: "Maintain",
              items: [
                { label: "Upgrade AskDB", slug: "guides/upgrading" },
                { label: "Fix common errors", slug: "guides/troubleshooting" },
              ],
            },
            {
              label: "Integrations",
              items: [
                { label: "Prisma", slug: "guides/integrations/prisma" },
                { label: "Expose as an agent tool", slug: "guides/integrations/agents-mcp" },
              ],
            },
          ],
        },
        {
          label: "Concepts",
          items: [
            { label: "How AskDB works", slug: "concepts/how-askdb-works" },
            { label: "The schema artifact", slug: "concepts/the-schema-artifact" },
            { label: "Safety boundaries", slug: "concepts/safety-boundaries" },
            { label: "Modes and dialects", slug: "concepts/modes-and-dialects" },
            { label: "Privacy model", slug: "concepts/privacy-model" },
            { label: "Chart planning", slug: "concepts/chart-planning", badge: { text: "Experimental", variant: "caution" } },
            { label: "Tenant isolation", slug: "concepts/tenant-isolation" },
          ],
        },
        {
          label: "Reference",
          items: [
            {
              label: "Surfaces",
              items: [
                { label: "CLI", slug: "reference/cli" },
                { label: "HTTP API", slug: "reference/http-api" },
                { label: "Configuration", slug: "reference/config" },
                { label: "Studio", slug: "reference/studio" },
              ],
            },
            {
              label: "Formats and rules",
              items: [
                { label: "Schema artifact format", slug: "reference/schema-artifact-format" },
                { label: "Tenant policy format", slug: "reference/tenant-policy" },
                { label: "SQL checks", slug: "reference/sql-checks" },
              ],
            },
            {
              label: "Packages and releases",
              items: [
                { label: "Packages", slug: "reference/packages" },
                { label: "Versioning", slug: "reference/versioning" },
                { label: "Upgrade notes by release", slug: "reference/upgrade-notes" },
              ],
            },
            {
              label: "APIs",
              items: [
                {
                  label: "@askdb/core API",
                  collapsed: true,
                  items: [
                    { label: "Overview", slug: "reference/core-api" },
                    { label: "ask()", slug: "reference/core-api/ask" },
                    { label: "bindPreparedQuery()", slug: "reference/core-api/rebind" },
                    { label: "Tenant scope", slug: "reference/core-api/tenancy" },
                    { label: "Checks", slug: "reference/core-api/checks" },
                    { label: "Schema loading", slug: "reference/core-api/schema" },
                    { label: "Dialects", slug: "reference/core-api/dialects" },
                    { label: "Logging", slug: "reference/core-api/logging" },
                    { label: "Errors", slug: "reference/core-api/errors" },
                  ],
                },
                { label: "@askdb/client API", slug: "reference/client-api" },
                { label: "@askdb/client/charts API", slug: "reference/client-charts-api", badge: { text: "Experimental", variant: "caution" } },
                { label: "@askdb/config API", slug: "reference/config-api" },
                { label: "@askdb/ai API", slug: "reference/ai-api" },
                { label: "@askdb/rag API", slug: "reference/rag-api" },
                { label: "Introspection API", slug: "reference/introspect-api" },
              ],
            },
          ],
        },
      ],
    }),
  ],
});
