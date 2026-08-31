import { OrganizationDetail } from "@dashseller/auth/components/auth/organization/organization-detail";

export default async function OrganizationDetailPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  const { organizationId } = await params;

  return <OrganizationDetail organizationId={organizationId} />;
}
