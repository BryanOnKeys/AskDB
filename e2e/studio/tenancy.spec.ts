/**
 * Replay of verify-askdb's `studio-tenancy` feature (.agents/skills/verify-askdb/features/studio-tenancy.md).
 *
 * Protects: creating a tenant policy from the Tenancy screen, by hand and from the model's draft,
 * reviewing it and saving it to tenant-policy.md.
 * Catches: a policy form that saves the wrong front matter, a review screen whose controls lose
 * their names, a draft that never reaches review, a status message lost when the screen changes,
 * or a typed label the root table overwrites.
 * No production seam: it drives the built Studio (fake model for the draft) and reads the file it writes.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, studioRun, test } from "./fixtures.js";

const POLICY = [
  "schemaId: askdb",
  "enforcement: strict",
  "    tenantIdColumn: 'table:public.customers#id'",
  "      - root: 'table:public.customers'",
  "        column: 'table:public.orders#customer_id'",
  "  - 'table:public.products'",
];

test.describe("tenancy-manual", () => {
  const studio = studioRun();

  test("tenancy-choose: a schema with no policy offers the AI draft and the manual form", async ({ page }) => {
    await page.goto(`${studio.url}/tenancy`);
    await expect(page.getByRole("heading", { name: "Enable Multi-Tenancy" })).toBeVisible();
    await expect(page.getByText("Configure tenant isolation for your schema")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Draft with AI/ })).toBeEnabled();
    await expect(page.getByRole("button", { name: /^Configure manually/ })).toBeEnabled();
  });

  test("tenancy-manual: a label typed before the root table stays when the root changes", async ({ page }) => {
    await page.goto(`${studio.url}/tenancy`);
    await page.getByRole("button", { name: /^Configure manually/ }).click();
    const label = page.getByRole("textbox", { name: /^Label/ });
    const root = page.getByRole("combobox", { name: /^Root table/ });
    await label.fill("Organization");
    await root.selectOption({ label: "public.customers" });
    await expect(label).toHaveValue("Organization");
    await root.selectOption({ label: "public.orders" });
    await expect(label).toHaveValue("Organization");
    // An emptied label goes back to following the root table's name.
    await label.fill("");
    await root.selectOption({ label: "public.products" });
    await expect(label).toHaveValue("products");
  });

  test("tenancy-manual and tenancy-save: a policy configured by hand", async ({ page }) => {
    await page.goto(`${studio.url}/tenancy`);
    await expect(page.getByRole("heading", { name: "Enable Multi-Tenancy" })).toBeVisible();
    await page.getByRole("button", { name: /^Configure manually/ }).click();
    await expect(page.getByRole("heading", { name: "Manual Configuration" })).toBeVisible();
    await expect(page.getByText("Pick the root table first.")).toBeVisible();

    await page.getByRole("combobox", { name: /^Root table/ }).selectOption({ label: "public.customers" });
    await page.getByRole("combobox", { name: /^Tenant ID column/ }).selectOption({ label: "id (INTEGER, PK)" });
    await page.getByRole("checkbox", { name: "public.products" }).check();
    await page.getByRole("combobox", { name: /^public\.orders/ }).selectOption({ label: "customer_id (INTEGER)" });
    await page.getByRole("button", { name: "Review & Confirm" }).click();

    await expect(page.getByRole("heading", { name: "Review Tenant Policy" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Tenant Roots (1)" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Scoped Tables (1)" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Remove scoped table table:public.orders" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: /^Label for table:public\.customers/ })).toHaveValue("customers");
    await page.getByRole("textbox", { name: "Policy body" }).fill("Customers are tenants.");
    await page.getByRole("button", { name: "Confirm & Save" }).click();

    await expect(page.getByRole("heading", { name: "Multi-Tenancy", level: 1 })).toBeVisible();
    await expect(page.getByText("Tenant policy saved.")).toBeVisible();
    await expect(page.getByText(/100% table coverage \(3\/3\)/)).toBeVisible();
    const file = readFileSync(join(studio.run.project, "askdb/tenant-policy.md"), "utf8");
    for (const line of POLICY) expect(file).toContain(line);
    expect(file).toContain("Customers are tenants.");
  });
});

test.describe("tenancy-ai-draft", () => {
  const studio = studioRun();

  test("tenancy-ai-draft and tenancy-save: the model's draft, reviewed and saved", async ({ page }) => {
    studio.run.modelReply(
      JSON.stringify({
        frontmatter: {
          schemaId: "askdb",
          enforcement: "strict",
          roots: [{ id: "table:public.customers", tenantIdColumn: "table:public.customers#id", label: "Customer" }],
          scopedTables: [{ id: "table:public.orders", scopeThrough: [{ root: "table:public.customers", column: "table:public.orders#customer_id" }] }],
          globalTables: ["table:public.products"],
        },
        body: "## Hierarchy\n\nCustomers are tenants.\n\n## Scope rules\n\nOrders belong to one customer.\n\n## Sensitive interactions\n\nNone.",
      }),
      { raw: true },
    );
    await page.goto(`${studio.url}/tenancy`);
    await page.getByRole("button", { name: /^Draft with AI/ }).click();
    await expect(page.getByRole("heading", { name: "Review Tenant Policy" })).toBeVisible();
    await expect(page.getByText("AI draft ready for review.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Scoped Tables (1)" })).toBeVisible();
    await page.getByRole("button", { name: "Confirm & Save" }).click();

    await expect(page.getByRole("heading", { name: "Multi-Tenancy", level: 1 })).toBeVisible();
    const file = readFileSync(join(studio.run.project, "askdb/tenant-policy.md"), "utf8");
    for (const line of POLICY) expect(file).toContain(line);
    expect(file).toContain("Customers are tenants.");
  });
});

test.describe("tenancy-edit", () => {
  const studio = studioRun(async (run) => {
    await run.start("studio", "schemas/agency-multi-tenant.schema");
  });

  test("tenancy-edit: edit the saved policy, save it, and the summary says so", async ({ page }) => {
    await page.goto(`${studio.url}/tenancy`);
    await expect(page.getByRole("heading", { name: "Multi-Tenancy", level: 1 })).toBeVisible();
    await expect(page.getByText(/Schema: agency-multi-tenant · 100% table coverage \(9\/9\)/)).toBeVisible();
    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByRole("heading", { name: "Edit Tenant Policy" })).toBeVisible();
    await page.getByRole("button", { name: "Warn", exact: true }).click();
    await page.getByRole("button", { name: "Save Changes" }).click();

    await expect(page.getByRole("heading", { name: "Multi-Tenancy", level: 1 })).toBeVisible();
    await expect(page.getByText("Tenant policy saved.")).toBeVisible();
    const file = readFileSync(join(studio.run.project, "schemas/agency-multi-tenant.schema/tenant-policy.md"), "utf8");
    expect(file).toContain("enforcement: warn");
  });
});
