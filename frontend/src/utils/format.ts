export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

export function formatDate(isoString: string): string {
  if (!isoString) return '-';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '-';
  
  const pad = (n: number) => n.toString().padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());

  return `${year}.${month}.${day} ${hours}:${minutes}`;
}


export function truncateMiddle(filename: string, maxLength: number = 38): string {
  if (!filename || filename.length <= maxLength) return filename;

  // Find extension (including double extensions like .ko.srt, .tar.gz, etc.)
  let ext = '';
  let nameWithoutExt = filename;
  const matchExt = filename.match(/(\.(?:ko|en|ja|zh)?\.[a-zA-Z0-9]+|\.[a-zA-Z0-9]+)$/i);
  if (matchExt) {
    ext = matchExt[0];
    nameWithoutExt = filename.substring(0, filename.length - ext.length);
  }

  // Check if filename ends with _web
  let webSuffix = '';
  if (nameWithoutExt.endsWith('_web')) {
    webSuffix = '_web';
    nameWithoutExt = nameWithoutExt.substring(0, nameWithoutExt.length - 4);
  }

  // Check for episode pattern like " - 01", " E01", " EP01"
  const epMatch = nameWithoutExt.match(/( - \d{1,3}| E\d{1,3}| EP\d{1,3})(?: |\[|$)/i);
  let epSuffix = '';
  if (epMatch) {
    epSuffix = epMatch[1];
  }

  // Suffix part to preserve: episode + web + extension
  const tail = (epSuffix && !nameWithoutExt.endsWith(epSuffix) ? epSuffix : '') + webSuffix + ext;
  const availableHead = maxLength - tail.length - 3; // 3 for '...'

  if (availableHead < 12) {
    // Standard balanced middle truncation
    const headLen = Math.floor((maxLength - 3) * 0.6);
    const tailLen = (maxLength - 3) - headLen;
    return filename.substring(0, headLen) + '...' + filename.substring(filename.length - tailLen);
  }

  return nameWithoutExt.substring(0, availableHead) + '...' + tail;
}
