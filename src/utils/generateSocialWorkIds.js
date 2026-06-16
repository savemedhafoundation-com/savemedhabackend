const currentYear = () => new Date().getFullYear();

const createSequentialId = async (Model, field, prefix) => {
  const year = currentYear();
  const pattern = new RegExp(`^${prefix}-${year}-`);
  const latest = await Model.findOne({ [field]: pattern }).sort({ createdAt: -1 }).select(field);
  const latestNumber = latest?.[field] ? Number(String(latest[field]).split("-").pop()) : 0;
  return `${prefix}-${year}-${String(latestNumber + 1).padStart(4, "0")}`;
};

const generateApplicationId = (ApplicationModel) =>
  createSequentialId(ApplicationModel, "applicationId", "SMF-APP");

const generateStudentCode = (StudentModel) =>
  createSequentialId(StudentModel, "studentCode", "SMF-STU");

const generateCertificateId = (CertificateModel) =>
  createSequentialId(CertificateModel, "certificateId", "SMF-SSW");

module.exports = {
  createSequentialId,
  generateApplicationId,
  generateStudentCode,
  generateCertificateId,
};
