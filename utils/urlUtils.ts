
export function normalizeSubmissionUrl(urlInput?: string): string | undefined {
  if (urlInput === undefined || urlInput === null) return undefined;
  let str = urlInput.trim();

  if (!str) return ""; // Return empty string if input was just whitespace

  // If already a valid scheme, return as is
  if (str.startsWith('http://') || str.startsWith('https://') || str.startsWith('mailto:')) {
    return str;
  }

  // Basic email check: contains '@' and a '.' and no spaces
  // A more robust email regex could be used, but this covers many common cases.
  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (emailPattern.test(str)) {
    return `mailto:${str}`;
  }

  // Basic URL check to prepend https://
  // Heuristic: contains a dot, no spaces, and is not an email (already handled).
  // This is intended for domain names or full paths that are missing the scheme.
  // It might incorrectly prepend https:// to filenames like "some.document.pdf" if entered as submission method.
  // However, Gemini is prompted for full URLs, and user input is usually a URL or email.
  if (str.includes('.') && !str.includes(' ') && !str.startsWith('/')) {
      // Avoid double-prepending https if a // starts the string (protocol-relative)
      if (!str.startsWith('//')) { 
          return `https://${str}`;
      }
  }
  
  // If none of the above, return the original (trimmed) string (it might be descriptive text)
  return str;
}
