import { db } from "@dashseller/db";
import { member, organization } from "@dashseller/db/schema/auth";

interface PersonalOrgUser {
  email: string;
  id: string;
  name?: string | null;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

async function uniqueSlug(base: string): Promise<string> {
  const fallback = base || "org";
  let candidate = fallback;

  for (let attempt = 0; attempt < 5; attempt++) {
    const existing = await db.query.organization.findFirst({
      where: (org, { eq }) => eq(org.slug, candidate),
      columns: { id: true },
    });
    if (!existing) {
      return candidate;
    }
    candidate = `${fallback}-${crypto.randomUUID().slice(0, 6)}`;
  }

  return `${fallback}-${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * Every signup gets a personal organization so there is always an active
 * tenant. The signup user becomes the org `owner`. Direct DB insert (rather
 * than `auth.api.createOrganization`) avoids referencing the `auth` instance
 * from inside its own config.
 *
 * Returns the new organization id, or null if creation failed (logged).
 */
export async function createPersonalOrganization(
  user: PersonalOrgUser
): Promise<string | null> {
  try {
    const localPart = user.email.split("@")[0] ?? "";
    const displayName = user.name?.trim() || localPart || "My Organization";
    const slug = await uniqueSlug(slugify(user.name || localPart || "org"));
    const now = new Date();
    const organizationId = crypto.randomUUID();

    await db.insert(organization).values({
      id: organizationId,
      name: `${displayName}'s Organization`,
      slug,
      createdAt: now,
    });

    await db.insert(member).values({
      id: crypto.randomUUID(),
      organizationId,
      userId: user.id,
      role: "owner",
      createdAt: now,
    });

    return organizationId;
  } catch (error) {
    console.error(
      "Failed to create personal organization for user:",
      user.id,
      error
    );
    return null;
  }
}
