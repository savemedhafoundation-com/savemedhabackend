const test = require("node:test");
const assert = require("node:assert/strict");

process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_test-token";

const {
  BLOB_PROVIDER,
  DEFAULT_MAX_PDF_BYTES,
  PDF_CONTENT_TYPE,
  PDF_PATH_PREFIX,
  UPLOAD_TOKEN_TTL_MS,
  getEbookBlobTokenOptions,
  inspectEbookBlobUpload,
  removeEbookBlob,
} = require("./ebookBlobService");
const Ebook = require("../models/Ebook");

const pathname = `${PDF_PATH_PREFIX}book-id-cancer-never-again.pdf`;
const url = `https://test-store.public.blob.vercel-storage.com/${pathname}`;
const downloadUrl = `${url}?download=1`;

const pdfResponse = () => ({
  ok: true,
  body: new ReadableStream({
    start(controller) {
      controller.enqueue(Buffer.from("%PDF-1.7"));
      controller.close();
    },
  }),
});

const metadata = (overrides = {}) => ({
  cacheControl: "public, max-age=31536000",
  contentDisposition: 'inline; filename="cancer-never-again.pdf"',
  contentType: PDF_CONTENT_TYPE,
  downloadUrl,
  etag: "etag-123",
  pathname,
  size: 150 * 1024 * 1024,
  uploadedAt: new Date(),
  url,
  ...overrides,
});

const asset = (overrides = {}) => ({
  contentDisposition: 'inline; filename="cancer-never-again.pdf"',
  contentType: PDF_CONTENT_TYPE,
  downloadUrl,
  etag: "etag-123",
  pathname,
  provider: BLOB_PROVIDER,
  size: 150 * 1024 * 1024,
  url,
  ...overrides,
});

test("creates a one-hour client-upload token scope for ebook PDFs", () => {
  const nowMs = 1788000000000;
  const options = getEbookBlobTokenOptions(pathname, null, true, { nowMs });

  assert.deepEqual(options.allowedContentTypes, [PDF_CONTENT_TYPE]);
  assert.equal(options.maximumSizeInBytes, DEFAULT_MAX_PDF_BYTES);
  assert.equal(options.addRandomSuffix, false);
  assert.equal(options.allowOverwrite, false);
  assert.equal(options.validUntil, nowMs + UPLOAD_TOKEN_TTL_MS);
});

test("rejects client-upload paths outside the exact ebook PDF prefix", () => {
  for (const invalidPath of [
    "other/pdfs/book.pdf",
    `${PDF_PATH_PREFIX}../book.pdf`,
    `${PDF_PATH_PREFIX}nested/book.pdf`,
    `${PDF_PATH_PREFIX}book.exe`,
  ]) {
    assert.throws(() => getEbookBlobTokenOptions(invalidPath), /PDF pathname must match/);
  }
});

test("verifies authoritative Blob metadata and the PDF header for files over 100MB", async () => {
  const result = await inspectEbookBlobUpload(asset(), {
    headBlob: async () => metadata(),
    fetchImpl: async () => pdfResponse(),
    deleteBlob: async () => assert.fail("valid Blob must not be deleted"),
  });

  assert.equal(result.bytes, 150 * 1024 * 1024);
  assert.equal(result.pdfUrl, url);
  assert.equal(result.pdfDownloadUrl, downloadUrl);
  assert.equal(result.pdfStorageProvider, BLOB_PROVIDER);
  assert.equal(result.pdfStorageKey, pathname);
});

test("rejects forged client metadata and removes the invalid uploaded Blob", async () => {
  const deleted = [];

  await assert.rejects(
    inspectEbookBlobUpload(asset({ etag: "forged" }), {
      headBlob: async () => metadata(),
      fetchImpl: async () => pdfResponse(),
      deleteBlob: async (value) => deleted.push(value),
    }),
    /Uploaded PDF failed Blob storage validation/
  );

  assert.deepEqual(deleted, [pathname]);
});

test("rejects non-PDF content even when Blob metadata says application/pdf", async () => {
  const deleted = [];
  const notPdfResponse = () => ({
    ok: true,
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(Buffer.from("hello"));
        controller.close();
      },
    }),
  });

  await assert.rejects(
    inspectEbookBlobUpload(asset(), {
      headBlob: async () => metadata(),
      fetchImpl: async () => notPdfResponse(),
      deleteBlob: async (value) => deleted.push(value),
    }),
    /Uploaded PDF failed Blob storage validation/
  );
  assert.deepEqual(deleted, [pathname]);
});

test("cleanup deletes only path-scoped ebook PDF Blobs", async () => {
  const deleted = [];
  await removeEbookBlob(pathname, { deleteBlob: async (value) => deleted.push(value) });
  assert.deepEqual(deleted, [pathname]);

  await assert.rejects(
    removeEbookBlob("savemedha/other/file.pdf", {
      deleteBlob: async () => assert.fail("out-of-scope Blob must not be deleted"),
    }),
    /Invalid ebook Blob pathname/
  );
});

test("the ebook model keeps legacy Cloudinary records compatible", () => {
  const legacy = new Ebook({
    title: "Legacy ebook",
    description: "Existing record",
    pdfUrl: "https://res.cloudinary.com/example/raw/upload/book.pdf",
    cloudinaryId: "savemedha/ebooks/pdfs/legacy-book",
    imageUrl: "https://res.cloudinary.com/example/image/upload/cover.jpg",
    imagePublicId: "savemedha/ebooks/banners/legacy-cover",
  });

  assert.equal(legacy.validateSync(), undefined);
  assert.equal(legacy.pdfStorageProvider, "cloudinary");
  assert.equal(legacy.pdfStorageKey, null);
  assert.equal(legacy.pdfDownloadUrl, null);

  const blobRecord = new Ebook({
    title: "Blob ebook",
    description: "New record",
    pdfUrl: url,
    pdfDownloadUrl: downloadUrl,
    pdfStorageProvider: BLOB_PROVIDER,
    pdfStorageKey: pathname,
    imageUrl: "https://res.cloudinary.com/example/image/upload/cover.jpg",
    imagePublicId: "savemedha/ebooks/banners/blob-cover",
  });

  assert.equal(blobRecord.validateSync(), undefined);
  assert.equal(blobRecord.cloudinaryId, null);
});
