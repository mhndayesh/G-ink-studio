import { StudioShell } from "@/components/studio/StudioShell";

export default async function StoryLayout({ children, params }: { children: React.ReactNode; params: Promise<{ storyId: string }> }) {
  const { storyId } = await params;
  return <StudioShell storyId={storyId}>{children}</StudioShell>;
}
