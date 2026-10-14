import { Router } from "express";
import { getPresignedUrl, getSignedUrl, mockUpload, mockDownload } from "../controllers/upload.controller.js";
import { authGuard } from "../middlewares/auth.middleware.js";

const router = Router();

router.post("/presigned-url", authGuard, getPresignedUrl);
router.get("/signed-url", authGuard, getSignedUrl);
router.get("/mock-get/*path", mockDownload);
router.put("/mock-put/*path", mockUpload);

export default router;
