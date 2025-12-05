const path = require("path");
const fs = require("fs");
const Job = require("../models/Job").Job;
const JobApplication = require("../models/JobApplication");

const UPLOAD_DIR = path.join(__dirname, "../../uploads/resumes");
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const getUploadedResume = (req) => {
  if (req.file) return req.file;
  if (req.files) {
    if (req.files.cv && req.files.cv[0]) return req.files.cv[0];
    if (req.files.file && req.files.file[0]) return req.files.file[0];
  }
  return null;
};

const applyToJob = async (req, res) => {
  try {
    const job = await Job.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ message: "Job not found" });
    }

    const fullname = req.body.fullname?.trim();
    const email = req.body.email?.trim();
    const phone = req.body.phone?.trim();
    const whyWeHireYou = req.body.whywehireyou?.trim() || req.body.whyWeHireYou?.trim();
    const agreeTerms = req.body.agreeterms ?? req.body.agreeTerms;
    const agree = agreeTerms === true || `${agreeTerms}`.toLowerCase() === "true";

    if (!fullname || !email || !phone || !whyWeHireYou) {
      return res
        .status(400)
        .json({ message: "fullname, email, phone, and whyWeHireYou are required" });
    }

    if (!agree) {
      return res.status(400).json({ message: "agreeTerms must be accepted" });
    }

    const uploadedResume = getUploadedResume(req);
    if (!uploadedResume) {
      return res.status(400).json({ message: "Resume PDF file is required" });
    }

    const resumeUrl = `/uploads/resumes/${uploadedResume.filename}`;

    const application = await JobApplication.create({
      job: job._id,
      fullname,
      email,
      phone,
      whyWeHireYou,
      cvUrl: resumeUrl,
      cvFilename: uploadedResume.filename,
      agreeTerms: true,
    });

    res.status(201).json(application);
  } catch (error) {
    console.error("Failed to apply for job:", error);
    res.status(500).json({ message: "Failed to apply for job" });
  }
};

const getApplications = async (_req, res) => {
  try {
    const apps = await JobApplication.find().populate("job").sort({ createdAt: -1 });
    res.status(200).json(apps);
  } catch (error) {
    console.error("Failed to fetch applications:", error);
    res.status(500).json({ message: "Failed to fetch applications" });
  }
};

const getApplicationById = async (req, res) => {
  try {
    const app = await JobApplication.findById(req.params.id).populate("job");
    if (!app) {
      return res.status(404).json({ message: "Application not found" });
    }
    res.status(200).json(app);
  } catch (error) {
    console.error("Failed to fetch application:", error);
    res.status(500).json({ message: "Failed to fetch application" });
  }
};

module.exports = {
  applyToJob,
  getApplications,
  getApplicationById,
};
