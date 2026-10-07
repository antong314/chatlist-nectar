import { extractText, getDocumentProxy } from 'unpdf';

// Documents neighbors send Machu (PDFs and plain text) so their contents can
// inform wiki changes.
export const MAX_DOCUMENT_BYTES = 15_000_000;
export const MAX_DOCUMENT_CHARS = 20_000;

export const isReadableDocumentType = (contentType) =>
  /^(?:application\/pdf|text\/plain|text\/markdown)\b/i.test(String(contentType ?? ''));

const tidy = (text) => String(text ?? '')
  .replace(/\r\n?/g, '\n')
  .replace(/[ \t]+\n/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

export const extractDocumentText = async (bytes, contentType) => {
  if (/^application\/pdf\b/i.test(String(contentType ?? ''))) {
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    const { text } = await extractText(pdf, { mergePages: true });
    return tidy(text).slice(0, MAX_DOCUMENT_CHARS);
  }
  return tidy(Buffer.from(bytes).toString('utf8')).slice(0, MAX_DOCUMENT_CHARS);
};
