import { AppShell } from "@/components/app-shell";

type Props = {
  params: Promise<{ id: string }>;
};

export default async function CasePage({ params }: Props) {
  const { id } = await params;
  return <AppShell view="case" caseId={id} />;
}

