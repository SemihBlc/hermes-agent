export interface WorkUploadAttachment {
  id: string;
  name: string;
  path: string;
  mimeType: string;
  size: number;
}

export const WORK_UPLOAD_ROOT = "~/.hermes/web-uploads";
export const LOCKED_WORK_UPLOAD_ROOT = "web-uploads";

export function managedUploadRoot(lockedRoot: string | null | undefined): string {
  return lockedRoot ? LOCKED_WORK_UPLOAD_ROOT : WORK_UPLOAD_ROOT;
}

export function safeUploadFileName(name: string): string {
  const basename = (name || "upload").split(/[\\/]/).pop() || "upload";
  const cleaned = basename
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return cleaned || "upload";
}

export function fallbackUploadFileName(file: Pick<File, "name" | "type">, index: number): string {
  if (file.name) return file.name;
  if (file.type.startsWith("image/")) {
    const ext = file.type.split("/")[1]?.split("+")[0] || "png";
    return `clipboard-image-${index + 1}.${ext}`;
  }
  return `upload-${index + 1}`;
}

export function workUploadTargetPath(
  file: Pick<File, "name" | "type">,
  index: number,
  sequence: number,
  now = new Date(),
  root = WORK_UPLOAD_ROOT,
): string {
  const day = now.toISOString().slice(0, 10);
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const safeName = safeUploadFileName(fallbackUploadFileName(file, index));
  return `${root}/${day}/${stamp}-${sequence}-${index + 1}-${safeName}`;
}

export function formatUploadSize(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function workUploadPrompt(attachments: WorkUploadAttachment[], userText: string): string {
  const cleanedText = userText.trim();
  if (!attachments.length) return cleanedText;

  const intro = attachments.length === 1
    ? "Bitte analysiere diesen Browser-Upload"
    : "Bitte analysiere diese Browser-Uploads";
  const files = attachments
    .map((attachment, index) => {
      const mime = attachment.mimeType || "unknown MIME";
      return `${index + 1}) ${attachment.name} (${mime}, ${formatUploadSize(attachment.size)}) unter ${attachment.path}`;
    })
    .join("\n");
  const hint = "Hinweis: Bei Screenshots/Bildern vision_analyze nutzen; bei PDFs/Dokumenten read_file/OCR verwenden.";
  const uploadBlock = `${intro}:\n${files}\n${hint}`;
  return cleanedText ? `${cleanedText}\n\n--- Browser-Uploads ---\n${uploadBlock}` : uploadBlock;
}

export function appendComposerText(existing: string, addition: string): string {
  const current = existing.trimEnd();
  const next = addition.trim();
  if (!next) return existing;
  return current ? `${current}\n\n${next}` : next;
}

export function dataTransferHasFiles(dataTransfer: DataTransfer | null | undefined): boolean {
  return Boolean(dataTransfer && Array.from(dataTransfer.types).includes("Files"));
}

export function filesFromDataTransfer(dataTransfer: DataTransfer | null | undefined): File[] {
  if (!dataTransfer) return [];
  const directFiles = Array.from(dataTransfer.files ?? []);
  if (directFiles.length > 0) return directFiles;

  return Array.from(dataTransfer.items ?? [])
    .filter((item) => item.kind === "file")
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null);
}
