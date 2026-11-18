import { OrganizationInvitationPreview } from "@/components/auth/organization-invitation-preview";

export const metadata = {
  title: "Review organization invitation · Akiba",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function OrganizationInvitationPage() {
  return <OrganizationInvitationPreview />;
}
