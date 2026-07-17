class ApiError extends Error {
  constructor(status, code, { field, messageKey, retryable = false, details } = {}) {
    super(code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.field = field;
    this.messageKey = messageKey || `errors.${String(code || 'unknown').toLowerCase()}`;
    this.retryable = Boolean(retryable);
    this.details = details;
  }

  toJSON() {
    return {
      code: this.code,
      ...(this.field ? { field: this.field } : {}),
      messageKey: this.messageKey,
      retryable: this.retryable,
      ...(this.details ? { details: this.details } : {})
    };
  }
}

const sendApiError = (res, error) => {
  const apiError = error instanceof ApiError
    ? error
    : new ApiError(500, 'INTERNAL_ERROR', { retryable: true });
  return res.status(apiError.status).json({ error: apiError.toJSON() });
};

module.exports = { ApiError, sendApiError };
