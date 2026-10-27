/** Read a File as a data URL (used to send screenshots to the API). */
export function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("画像を読み込めませんでした"));
    reader.readAsDataURL(file);
  });
}
