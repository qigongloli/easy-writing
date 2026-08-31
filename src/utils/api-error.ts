import type { JsonRecord } from '@/types/json'
import { ElMessage } from "element-plus";

/**
 * @description: 校验网络请求状态码
 * @param {Number} status
 * @return 状态码兜底文案
 */
const checkStatus = (status: number) => {
  switch (status) {
    case 400:
      return "请求失败，请稍后重试";
    case 401:
      return "请求未获授权";
    case 403:
      return "当前账号无权限访问";
    case 404:
      return "你所访问的资源不存在";
    case 405:
      return "请求方式错误，请稍后重试";
    case 408:
      return "请求超时，请稍后重试";
    case 409:
      return "数据已被更新，请刷新后合并后重试";
    case 500:
      return "服务异常，请稍后重试";
    case 502:
      return "网关错误，请稍后重试";
    case 503:
      return "服务不可用，请稍后重试";
    case 504:
      return "网关超时，请稍后重试";
    default:
      return "请求失败，请稍后重试";
  }
};

export interface NormalizedApiError extends Error {
  __handled?: boolean;
  statusCode?: number;
  code?: number | string;
  msg?: string;
  response?: {
    status?: number;
    data?: unknown;
  };
  originalError?: unknown;
}

const DEFAULT_ERROR_MESSAGE = "请求失败，请稍后重试";

const isRecord = (value: unknown): value is JsonRecord => {
  return !!value && typeof value === "object";
};

const normalizeText = (value: unknown) => {
  return typeof value === "string" ? value.trim() : "";
};

const isAxiosDefaultMessage = (message: string) => {
  return /^Request failed with status code \d+$/i.test(message);
};

const RUNTIME_ERROR_PATTERNS = [
  /^Cannot read (properties|property) of/i,
  /^Cannot set (properties|property) of/i,
  /^Cannot destructure property/i,
  /^undefined is not an object/i,
  /^null is not an object/i,
  / is not a function$/i,
  / is not iterable$/i,
  /^Cannot access .+ before initialization$/i,
];

const isRuntimeErrorMessage = (message: string) => {
  return RUNTIME_ERROR_PATTERNS.some((pattern) => pattern.test(message));
};

const AI_JSON_ERROR_PATTERNS = [
  /AI未返回JSON/i,
  /AI返回JSON不完整/i,
  /AI返回JSON解析失败/i,
  /Unexpected token .*JSON/i,
  /JSON\.parse/i,
];

const normalizeUserFacingMessage = (message: string) => {
  // AI 结构化输出失败属于技术细节，统一转成用户可执行的提示。
  if (AI_JSON_ERROR_PATTERNS.some((pattern) => pattern.test(message))) {
    return "AI生成结果格式异常，请重新生成；如果连续失败，请换一个模型或智能体后再试";
  }
  return message;
};

const pickNestedMessage = (value: unknown): string => {
  if (!isRecord(value)) return normalizeText(value);

  const candidates = [
    value.msg,
    value.message,
    value.errMsg,
    value.errorMessage,
    isRecord(value.error) ? value.error.message : value.error,
    isRecord(value.error) ? value.error.msg : undefined,
    isRecord(value.data) ? value.data.msg : undefined,
    isRecord(value.data) ? value.data.message : undefined,
  ];

  for (const candidate of candidates) {
    const message = normalizeText(candidate);
    if (message && !isAxiosDefaultMessage(message) && !isRuntimeErrorMessage(message)) {
      return normalizeUserFacingMessage(message);
    }
  }

  return "";
};

const getResponseData = (error: unknown) => {
  return isRecord(error) && isRecord(error.response) ? error.response.data : undefined;
};

const getStatusCode = (error: unknown) => {
  if (!isRecord(error)) return undefined;
  const status = error.response?.status ?? error.statusCode ?? error.status;
  const statusNumber = Number(status);
  return Number.isFinite(statusNumber) ? statusNumber : undefined;
};

export const getStatusFallback = (status?: number) => {
  return status ? checkStatus(status) : DEFAULT_ERROR_MESSAGE;
};

// 判断是否为主动取消的请求（页面切换/重复请求被 abort），这类不应给用户弹错误提示
export const isCanceledRequest = (error: unknown): boolean => {
  if (!isRecord(error)) return false;
  const code = String(error.code || "");
  const message = normalizeText(error.message);
  return code === "ERR_CANCELED" || /^canceled$/i.test(message);
};

export const extractApiErrorMessage = (error: unknown, fallback?: string) => {
  const status = getStatusCode(error);
  const fallbackMessage = normalizeText(fallback);

  if (isRecord(error)) {
    const rawMessage = normalizeText(error.message);
    const rawMsg = normalizeText(error.msg);
    if (/timeout/i.test(rawMessage) || String(error.code || "").includes("TIMEOUT")) {
      return fallbackMessage || "请求超时，请稍后重试";
    }
    if (/Network Error/i.test(rawMessage)) {
      return fallbackMessage || "网络错误，请检查网络后重试";
    }
    if (rawMsg && !isAxiosDefaultMessage(rawMsg) && !isRuntimeErrorMessage(rawMsg)) {
      return normalizeUserFacingMessage(rawMsg);
    }
  }

  const responseMessage = pickNestedMessage(getResponseData(error));
  if (responseMessage) return responseMessage;

  const directMessage = pickNestedMessage(error);
  if (directMessage && !isAxiosDefaultMessage(directMessage)) return normalizeUserFacingMessage(directMessage);

  return fallbackMessage || getStatusFallback(status);
};

export const normalizeApiError = (error: unknown, fallback?: string): NormalizedApiError => {
  const responseData = getResponseData(error);
  const source = isRecord(responseData)
    ? responseData
    : isRecord(error)
      ? error
      : { originalError: error };

  const normalized = { ...source } as NormalizedApiError;
  const statusCode = getStatusCode(error) ?? getStatusCode(source);
  const message = extractApiErrorMessage(error, fallback);

  normalized.message = message;
  normalized.msg = normalizeText(normalized.msg) || message;
  normalized.statusCode = statusCode;

  if (!normalized.code) {
    const dataCode = isRecord(responseData) ? responseData.code : undefined;
    const errorCode = isRecord(error) ? error.code : undefined;
    normalized.code = dataCode ?? errorCode ?? statusCode;
  }

  if (isRecord(error) && isRecord(error.response) && !normalized.response) {
    normalized.response = error.response;
  }
  if (normalized.originalError === undefined) {
    normalized.originalError = error;
  }

  return normalized;
};

export const showApiError = (error: unknown, fallback?: string) => {
  const normalized = normalizeApiError(error, fallback);
  if (normalized.__handled) return normalized;

  const message = extractApiErrorMessage(normalized, fallback);
  // grouping: 多接口同时失败时合并相同文案，避免同一条错误堆叠多个 toast
  ElMessage({ type: "error", message, grouping: true });
  normalized.__handled = true;
  return normalized;
};
