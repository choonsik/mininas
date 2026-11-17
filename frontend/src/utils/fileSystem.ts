export interface UploadFileEntry {
  file: File;
  relativePath: string;
}

/**
 * Recursively scans FileSystemEntry from HTML5 Drag and Drop DataTransferItemList.
 * Preserves full folder hierarchy for dropped folders.
 */
export async function getFilesFromDataTransfer(items: DataTransferItemList): Promise<UploadFileEntry[]> {
  const result: UploadFileEntry[] = [];

  const traverseEntry = (entry: any, currentPath: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!entry) {
        resolve();
        return;
      }

      if (entry.isFile) {
        entry.file(
          (file: File) => {
            result.push({
              file,
              relativePath: currentPath ? `${currentPath}/${file.name}` : file.name,
            });
            resolve();
          },
          () => resolve()
        );
      } else if (entry.isDirectory) {
        const dirReader = entry.createReader();
        const dirPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;

        const readAllEntries = () => {
          dirReader.readEntries(
            async (entries: any[]) => {
              if (!entries || entries.length === 0) {
                resolve();
              } else {
                for (const child of entries) {
                  await traverseEntry(child, dirPath);
                }
                readAllEntries();
              }
            },
            () => resolve()
          );
        };

        readAllEntries();
      } else {
        resolve();
      }
    });
  };

  const tasks: Promise<void>[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === 'file') {
      const entry = item.webkitGetAsEntry ? item.webkitGetAsEntry() : null;
      if (entry) {
        tasks.push(traverseEntry(entry, ''));
      } else {
        const file = item.getAsFile();
        if (file) {
          result.push({ file, relativePath: file.name });
        }
      }
    }
  }

  await Promise.all(tasks);
  return result;
}
