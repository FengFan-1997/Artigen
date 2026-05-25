import { defineStore } from 'pinia';
import { ref } from 'vue';

type Lang = 'en' | 'zh';
type TranslateArgs = Record<string, string | number>;

const readInitialLang = (): Lang => {
  try {
    const v = String(window.localStorage.getItem('app_lang') || '')
      .trim()
      .toLowerCase();
    return v === 'en' ? 'en' : 'zh';
  } catch {
    return 'zh';
  }
};

const translations = {
  en: {
    login: {
      login: 'Login',
      register: 'Register',
      title: 'Login',
      choose_method_title: 'Choose a login method',
      choose_method_sub: 'Select an option to continue',
      choose_method_hint: 'Google, email code, or account password login',
      method_google: 'Google Account Login',
      method_email: 'Email Login',
      method_password: 'Account & Password Login',
      google_sub: 'Verify with your Google account',
      google_hint: 'Complete the Google verification prompt',
      sub: 'Use QQ Mail SMTP verification code (local service)',
      password_login_sub: 'Login with email or account ID & password',
      register_sub: 'Create an account with email verification code',
      username_label: 'Email or Account ID',
      username_placeholder: 'Enter email or account ID',
      password_label: 'Password',
      password_hint: 'Password: 8-128 chars, include uppercase, lowercase, and a number',
      password_rules_error:
        'Password must be 8-128 chars and include uppercase, lowercase, and a number',
      password_placeholder: 'Enter your password',
      email_label: 'Email',
      email_placeholder: 'Enter your email',
      send_code: 'Send Code',
      sending: 'Sending...',
      hint: 'Code valid for 10 minutes; resend interval 60 seconds',
      verify_title: 'Verify',
      verify_subtitle: 'Enter the code sent to {email}',
      code_label: 'Verification Code',
      code_placeholder: '6-digit code',
      verify_btn: 'Verify & Login',
      login_btn: 'Login',
      register_btn: 'Register',
      account_title: 'Account',
      account_sub: 'Current user (stored locally)',
      user_id: 'USER_ID',
      current_user: 'Current User',
      local_users: 'Local Users',
      switch: 'Switch',
      logout: 'Logout',
      back: 'Back',
      back_to_methods: 'Back to methods',
      back_to_resend: 'Back',
      success: 'Sent successfully',
      failed: 'Send failed',
      login_success: 'Login successful',
      welcome: 'Welcome',
      enter_email: 'Please enter email',
      enter_code: 'Please enter code',
      invalid_email: 'Invalid email format',
      invalid_code: 'Invalid code format',
      resend: 'Resend',
      resend_wait: 'Resend in {s}s',
      no_users: 'No local users found',
      empty: 'Empty',
      login_other: 'Login with another email',
      verify_hint: 'After login, user data is stored in your browser only',
      debug_code_hint: 'SMTP not configured, debug code: {code}',
      or: 'OR',
      google_failed: 'Google login failed',
      google_load_failed: 'Google login button failed to load due to network issues',
      google_not_configured: 'Google login is not configured',
      terms_of_use: 'Terms of Use',
      privacy_policy: 'Privacy Policy',
      forgot_password: 'Forgot password',
      reset_title: 'Reset Password',
      reset_sub: 'Enter your registered email to receive a code',
      reset_sub_sent: 'Code sent to {email}',
      send_reset_code: 'Send Reset Code',
      reset_btn: 'Reset Password',
      resetting: 'Resetting...',
      reset_hint: 'Code valid for 10 minutes; resend interval 60 seconds',
      reset_failed: 'Reset failed',
      back_to_login: 'Back to Login',
      new_password_label: 'New Password',
      confirm_password_label: 'Confirm Password',
      password_mismatch: 'Passwords do not match',
      switch_to_register: 'No account? Register',
      switch_to_login: 'Have an account? Login'
    }
  },
  zh: {
    login: {
      login: '登录',
      register: '注册',
      title: '登录',
      choose_method_title: '请选择登录方式',
      choose_method_sub: '选择以下方式继续',
      choose_method_hint: '支持谷歌账号、邮箱验证码或账号密码登录',
      method_google: '谷歌账号登录',
      method_email: '邮箱登录',
      method_password: '账号密码登录',
      google_sub: '使用谷歌账号完成验证',
      google_hint: '请在谷歌弹窗中完成验证',
      sub: '',
      register_sub: '使用邮箱验证码完成注册',
      password_login_sub: '使用邮箱或账号ID + 密码登录',
      username_label: '邮箱或账号ID',
      username_placeholder: '输入邮箱或者账号',
      password_label: '密码',
      password_hint: '密码需 8-128 位，包含大写字母、小写字母和数字',
      password_rules_error: '密码需 8-128 位，且包含大写字母、小写字母和数字',
      password_placeholder: '请输入密码',
      email_label: '邮箱',
      email_placeholder: '请输入您的邮箱',
      send_code: '发送验证码',
      sending: '发送中...',
      verify_title: '验证登录',
      verify_subtitle: '验证码已发送至 {email}',
      code_label: '验证码',
      code_placeholder: '请输入 6 位验证码',
      verify_btn: '验证并登录',
      login_btn: '登录',
      register_btn: '注册',
      account_title: '账户',
      current_user: '当前用户',
      local_users: '',
      switch: '切换',
      logout: '退出登录',
      back: '返回',
      back_to_methods: '返回登录方式',
      success: '发送成功',
      failed: '发送失败',
      login_success: '登录成功',
      welcome: '欢迎',
      enter_email: '请输入邮箱',
      enter_code: '请输入验证码',
      invalid_email: '邮箱格式不正确',
      invalid_code: '验证码格式不正确',
      resend: '重新发送',
      resend_wait: '{s}秒后重发',
      no_users: '暂无本地用户',
      hint: '验证码有效期 10 分钟；每次发送间隔 60 秒',
      verifying: '验证中...',
      verify_hint: '登录成功后，用户信息将仅存储在本地浏览器',
      debug_code_hint: 'SMTP 未配置，已返回验证码：{code}',
      or: '或',
      google_failed: '谷歌登录失败',
      google_load_failed: '谷歌登录加载失败',
      google_not_configured: '谷歌登录未配置',
      terms_of_use: '使用条款',
      privacy_policy: '隐私政策',
      back_to_resend: '返回重发',
      account_sub: '当前登录用户',
      user_id: 'USER_ID',
      empty: '暂无',
      login_other: '登录其他邮箱',
      switch_to_register: '没有账号？注册',
      switch_to_login: '已有账号？登录',
      forgot_password: '找回密码',
      reset_title: '找回密码',
      reset_sub: '输入注册邮箱，接收验证码后重置密码',
      reset_sub_sent: '验证码已发送至 {email}',
      send_reset_code: '发送重置验证码',
      reset_btn: '重置密码',
      resetting: '重置中...',
      reset_hint: '验证码有效期 10 分钟；每次发送间隔 60 秒',
      reset_failed: '重置失败',
      back_to_login: '返回登录',
      new_password_label: '新密码',
      confirm_password_label: '确认新密码',
      password_mismatch: '两次输入的密码不一致'
    }
  }
} as const;

export const useLanguageStore = defineStore('language', () => {
  const currentLang = ref<Lang>(readInitialLang());

  function persistLanguage() {
    try {
      window.localStorage.setItem('app_lang', currentLang.value);
    } catch {}
  }

  function toggleLanguage() {
    currentLang.value = currentLang.value === 'en' ? 'zh' : 'en';
    persistLanguage();
  }

  function setLanguage(lang: Lang) {
    currentLang.value = lang;
    persistLanguage();
  }

  function t(key: string, args?: TranslateArgs) {
    const keys = key.split('.');
    let value: unknown = translations[currentLang.value];
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = (value as Record<string, unknown>)[k];
      } else {
        return key;
      }
    }
    if (typeof value === 'string' && args) {
      return value.replace(/\{(\w+)\}/g, (_, k) => String(args[k] ?? ''));
    }
    return typeof value === 'string' ? value : key;
  }

  return {
    currentLang,
    toggleLanguage,
    setLanguage,
    t
  };
});
