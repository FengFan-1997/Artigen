const crypto = require('crypto');

const firstNonEmptyString = (...values) => {
  for (const value of values) {
    const text =
      typeof value === 'string'
        ? value.trim()
        : typeof value === 'number'
          ? String(value).trim()
          : '';
    if (text) return text;
  }
  return '';
};

const extractPayOrderIdFromText = (text) => {
  const match = String(text || '').match(/\bpay_[a-z0-9_]{8,}\b/i);
  return match ? String(match[0] || '').trim() : '';
};

const extractPackageIdFromText = (text) => {
  const match = String(text || '').match(/\b(starter|standard|pro|ultimate)\b/i);
  return match ? String(match[1] || '').trim().toLowerCase() : '';
};

const extractAppUserIdFromText = (text) => {
  const match = String(text || '').match(
    /\b(?:uid|userId|user_id|appUserId|app_user_id)\s*[:=]\s*([a-zA-Z0-9_-]{3,120})\b/
  );
  return match ? String(match[1] || '').trim() : '';
};

const isProductionRuntime = (env = process.env) => {
  return String(env.NODE_ENV || '').trim().toLowerCase() === 'production';
};

const shouldRequireAfdianSignature = (env = process.env, isProdOverride) => {
  // An incorrectly supplied false override must not disable production checks.
  const isProd = isProductionRuntime(env) || isProdOverride === true;
  return isProd || String(env.AFDIAN_WEBHOOK_REQUIRE_SIGN || '').trim() === '1';
};

const buildAfdianSignPayload = (order) => {
  const outTradeNo = firstNonEmptyString(
    order?.out_trade_no,
    order?.trade_no,
    order?.order_id
  );
  const userId = firstNonEmptyString(order?.user_id, order?.userId);
  const planId = firstNonEmptyString(order?.plan_id, order?.planId);
  const totalAmount = firstNonEmptyString(order?.total_amount, order?.totalAmount);
  if (!outTradeNo || !userId || !planId || !totalAmount) return '';
  return `${outTradeNo}${userId}${planId}${totalAmount}`;
};

const verifyAfdianWebhookSign = (order, sign, env = process.env) => {
  const publicKey = String(env.AFDIAN_WEBHOOK_PUBLIC_KEY || '').trim();
  if (!publicKey) return { ok: false, error: 'SIGN_KEY_NOT_CONFIGURED' };
  const payload = buildAfdianSignPayload(order);
  if (!payload) return { ok: false, error: 'INVALID_SIGN_PAYLOAD' };
  const signature = String(sign || '').trim();
  if (!signature) return { ok: false, error: 'MISSING_SIGN' };

  try {
    const verifier = crypto.createVerify('RSA-SHA256');
    verifier.update(payload, 'utf8');
    verifier.end();
    return verifier.verify(publicKey, Buffer.from(signature, 'base64'))
      ? { ok: true }
      : { ok: false, error: 'INVALID_SIGN' };
  } catch {
    return { ok: false, error: 'VERIFY_FAILED' };
  }
};

const equalsCny = (left, right) => {
  const a = Number.parseFloat(String(left ?? ''));
  const b = Number.parseFloat(String(right ?? ''));
  return Number.isFinite(a) && Number.isFinite(b) && a.toFixed(2) === b.toFixed(2);
};

const validateAfdianWebhook = (input = {}) => {
  const body = input.body && typeof input.body === 'object' ? input.body : {};
  const data = body.data && typeof body.data === 'object' ? body.data : null;
  const order = data && data.order && typeof data.order === 'object' ? data.order : null;
  if (!order) return { ok: false, error: 'MISSING_ORDER' };

  const orderStatus = Number.parseInt(String(order.status ?? ''), 10);
  if (orderStatus !== 2) return { ok: false, error: 'ORDER_NOT_PAID' };

  const providerOrderId = firstNonEmptyString(
    order.out_trade_no,
    order.trade_no,
    order.order_id
  );
  if (!providerOrderId || /^test[_-]/i.test(providerOrderId)) {
    return { ok: false, error: 'INVALID_PROVIDER_ORDER' };
  }

  const sign = firstNonEmptyString(body.sign, data.sign, order.sign);
  const signatureRequired = shouldRequireAfdianSignature(input.env, input.isProd);
  if (signatureRequired || sign) {
    const verified = verifyAfdianWebhookSign(order, sign, input.env);
    if (!verified.ok) return verified;
  }

  const remark = firstNonEmptyString(
    order.remark,
    order.remark_text,
    order.note,
    order.memo
  );
  const localOrderId = firstNonEmptyString(
    order.custom_order_id,
    order.customOrderId,
    extractPayOrderIdFromText(remark)
  );
  if (!localOrderId) return { ok: false, error: 'MISSING_LOCAL_ORDER' };

  const getPayOrder = input.getPayOrder;
  const payOrder = typeof getPayOrder === 'function' ? getPayOrder(localOrderId) : null;
  if (!payOrder || typeof payOrder !== 'object') {
    return { ok: false, error: 'UNKNOWN_LOCAL_ORDER' };
  }
  if (String(payOrder.status || '').trim().toLowerCase() !== 'pending') {
    return { ok: false, error: 'ORDER_NOT_PENDING' };
  }

  const resolvePayPackage = input.resolvePayPackage;
  const expectedPackage =
    typeof resolvePayPackage === 'function'
      ? resolvePayPackage(payOrder.packageId)
      : null;
  if (!expectedPackage) return { ok: false, error: 'INVALID_LOCAL_PACKAGE' };
  if (
    String(expectedPackage.packageId || '').trim().toLowerCase() !==
      String(payOrder.packageId || '').trim().toLowerCase() ||
    !equalsCny(expectedPackage.amountCny, payOrder.amountCny) ||
    Number(expectedPackage.credits || 0) !== Number(payOrder.credits || 0)
  ) {
    return { ok: false, error: 'LOCAL_ORDER_TAMPERED' };
  }

  const planId = firstNonEmptyString(order.plan_id, order.planId);
  const planMap = input.planPackageMap && typeof input.planPackageMap === 'object'
    ? input.planPackageMap
    : null;
  const callbackPackageId = firstNonEmptyString(
    order.package_id,
    order.packageId,
    planId && planMap ? planMap[planId] : '',
    extractPackageIdFromText(remark)
  ).toLowerCase();
  if (!callbackPackageId || callbackPackageId !== expectedPackage.packageId) {
    return { ok: false, error: 'PACKAGE_MISMATCH' };
  }

  const callbackUserId = firstNonEmptyString(
    order.app_user_id,
    order.appUserId,
    order.uid,
    extractAppUserIdFromText(remark)
  );
  if (!callbackUserId || callbackUserId !== String(payOrder.userId || '').trim()) {
    return { ok: false, error: 'USER_MISMATCH' };
  }

  const actualAmount = firstNonEmptyString(
    order.total_amount,
    order.totalAmount,
    order.show_amount,
    order.showAmount
  );
  if (!actualAmount || !equalsCny(expectedPackage.amountCny, actualAmount)) {
    return { ok: false, error: 'AMOUNT_MISMATCH' };
  }

  return {
    ok: true,
    providerOrderId,
    localOrderId,
    userId: String(payOrder.userId || '').trim(),
    packageId: expectedPackage.packageId,
    credits: Number(expectedPackage.credits || 0),
    amountCny: Number(expectedPackage.amountCny || 0)
  };
};

const processAfdianWebhook = (input = {}) => {
  const validated = validateAfdianWebhook(input);
  if (!validated.ok) return validated;

  if (typeof input.applyCredits !== 'function') {
    return { ok: false, error: 'CREDITS_NOT_CONFIGURED' };
  }
  const applied = input.applyCredits({
    afdianOrderId: validated.providerOrderId,
    localOrderId: validated.localOrderId,
    userId: validated.userId,
    packageId: validated.packageId,
    credits: validated.credits
  });
  if (!applied || !applied.ok) {
    return { ok: false, error: String(applied?.error || 'CREDITS_APPLY_FAILED') };
  }

  if (typeof input.completePayOrder !== 'function') {
    return { ok: false, error: 'ORDER_STORE_NOT_CONFIGURED' };
  }
  const completed = input.completePayOrder({
    localOrderId: validated.localOrderId,
    providerOrderId: validated.providerOrderId
  });
  if (!completed || !completed.ok) {
    return { ok: false, error: String(completed?.error || 'ORDER_COMPLETE_FAILED') };
  }

  return {
    ok: true,
    credited: !applied.alreadyProcessed,
    localOrderId: validated.localOrderId,
    providerOrderId: validated.providerOrderId
  };
};

module.exports = {
  buildAfdianSignPayload,
  equalsCny,
  isProductionRuntime,
  shouldRequireAfdianSignature,
  validateAfdianWebhook,
  verifyAfdianWebhookSign,
  processAfdianWebhook
};
