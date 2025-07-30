
import { getDocument, GlobalWorkerOptions, PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
// Import TextContent and TextItem from their specific type definition file path
// This is a common workaround if they are not exported from the main 'pdfjs-dist' entry point.
import type { TextContent, TextItem } from 'pdfjs-dist/types/display/api';

// GlobalWorkerOptions.workerSrc should be set once in index.tsx or your app's main entry point.
// Removing the fallback from here to avoid conflicts.

export async function extractTextFromPdf(file: File): Promise<string> {
  // It's assumed GlobalWorkerOptions.workerSrc is already correctly set globally.
  // If it's not set, pdf.js will likely throw an error or try its own default,
  // which is better than this service setting a potentially conflicting version.
  if (!GlobalWorkerOptions.workerSrc && typeof window !== 'undefined') {
     console.warn("PDF.js workerSrc was not set globally. PDF.js might try to use its default or fail.");
  }

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = getDocument({ data: arrayBuffer });

  try {
    const pdf: PDFDocumentProxy = await loadingTask.promise;
    let fullText = '';

    for (let i = 1; i <= pdf.numPages; i++) {
      const page: PDFPageProxy = await pdf.getPage(i);
      const textContentSource: TextContent = await page.getTextContent();
      
      if (textContentSource && Array.isArray(textContentSource.items)) {
        const pageText = textContentSource.items
          .filter((item: any): item is TextItem => 'str' in item && typeof item.str === 'string')
          .map((item: TextItem) => item.str)
          .join(' ');
        fullText += pageText + '\n\n'; 
      }
    }
    return fullText.trim();
  } catch (error) {
    console.error("Error parsing PDF:", error);
    throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = error => reject(error);
  });
}