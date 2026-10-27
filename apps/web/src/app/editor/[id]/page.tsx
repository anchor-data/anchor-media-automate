import { EditorPage } from "../../../components/pages/editor-page";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditorPage postId={id} />;
}
