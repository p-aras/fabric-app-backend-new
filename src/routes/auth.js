import { Router } from 'express';
import { register, verifyRegisterOtp, login, verifyLoginOtp, resendOtp, forgotPassword, resetPassword, getUsers, createQuickUser } from '../controllers/authController.js';

const router = Router();

router.post('/register', register);
router.post('/verify-register-otp', verifyRegisterOtp);
router.post('/login', login);
router.post('/verify-login-otp', verifyLoginOtp);
router.post('/resend-otp', resendOtp);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);
router.get('/users', getUsers);
router.post('/users', createQuickUser);

export default router;
