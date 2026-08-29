const test = require("node:test");
const assert = require("node:assert/strict");

process.env.CLOUDINARY_CLOUD_NAME = "test-cloud";
process.env.CLOUDINARY_API_KEY = "test-key";
process.env.CLOUDINARY_API_SECRET = "test-secret";

const cloudinary = require("../config/cloudinary");
const {
  ASSET_CONFIG,
  createEbookUploadSignature,
  verifyEbookUpload,
} = require("./ebookAssetService");

test("creates a restricted signed upload configuration", () => {
  const result = createEbookUploadSignature("pdf");

  assert.equal(result.kind, "pdf");
  assert.equal(result.resourceType, "raw");
  assert.equal(result.uploadParams.folder, ASSET_CONFIG.pdf.folder);
  assert.equal(result.uploadParams.format, "pdf");
  assert.match(result.uploadUrl, /^https:\/\/api\.cloudinary\.com\/v1_1\/test-cloud\/raw\/upload$/);
  assert.ok(result.signature);
  assert.equal(result.apiSecret, undefined);
});

test("verifies Cloudinary's signed upload response", () => {
  const publicId = `${ASSET_CONFIG.pdf.folder}/ebook-id`;
  const version = 1787990000;
  const signature = cloudinary.utils.api_sign_request(
    { public_id: publicId, version },
    process.env.CLOUDINARY_API_SECRET
  );

  const result = verifyEbookUpload(
    { publicId, version, signature, resourceType: "raw", format: "pdf" },
    "pdf"
  );

  assert.equal(result.publicId, publicId);
  assert.equal(result.version, version);
});

test("accepts Cloudinary's raw upload response without a format field", () => {
  const publicId = `${ASSET_CONFIG.pdf.folder}/ebook-id`;
  const version = 1787990000;
  const signature = cloudinary.utils.api_sign_request(
    { public_id: publicId, version },
    process.env.CLOUDINARY_API_SECRET
  );

  const result = verifyEbookUpload(
    { publicId, version, signature, resourceType: "raw" },
    "pdf"
  );

  assert.equal(result.publicId, publicId);
});

test("rejects a forged upload response", () => {
  assert.throws(
    () =>
      verifyEbookUpload(
        {
          publicId: `${ASSET_CONFIG.image.folder}/cover-id`,
          version: 1787990000,
          signature: "forged",
          resourceType: "image",
          format: "jpg",
        },
        "image"
      ),
    /Invalid image upload signature/
  );
});

test("rejects an asset outside the ebook folders", () => {
  const publicId = "somewhere-else/ebook-id";
  const version = 1787990000;
  const signature = cloudinary.utils.api_sign_request(
    { public_id: publicId, version },
    process.env.CLOUDINARY_API_SECRET
  );

  assert.throws(
    () => verifyEbookUpload({ publicId, version, signature, resourceType: "raw", format: "pdf" }, "pdf"),
    /Invalid pdf upload folder/
  );
});
